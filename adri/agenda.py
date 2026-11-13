#!/usr/bin/env python3
"""AdriBodyPiercing: agenda de marcações (pedidos do site + página do Adriano).

Só biblioteca padrão (http.server + sqlite3). Corre em 127.0.0.1:3120, atrás do Caddy (HTTPS).

Configuração (variáveis de ambiente, em /etc/adri-agenda/agenda.env, fora do repositório):
  ADRI_SENHA_HASH  hash scrypt da password da página do Adriano (nunca a password em claro)
  ORIGENS          origens aceites, separadas por espaços
  AG_DB            base de dados (por omissão /var/lib/adri-agenda/agenda.db)
  AG_PORTA         porta local (por omissão 3120)

Regras que impedem encher ou estragar a agenda:
  - tudo é validado aqui no servidor (piercings da lista, dia e hora de abertura, nome, telemóvel, idade);
  - uma hora só pode ter uma marcação ativa (índice único na base de dados, à prova de pedidos ao mesmo tempo);
  - cada telemóvel só pode ter uma marcação ativa no futuro;
  - limites por IP e por telemóvel, campo-isco para robôs e tempo mínimo a preencher o formulário;
  - teto de pedidos por confirmar (se for atingido, o site manda falar por WhatsApp).
Página do Adriano: password verificada com scrypt, sessão em cookie HttpOnly/Secure/SameSite=Strict
guardada só como hash, limite de tentativas, pedidos POST só com JSON e da origem do site.
Dados pessoais apagados 12 meses depois da data da marcação.

Painel do Adriano (além da agenda): preços, horário e local, fotos do site, avaliações com link de uso único,
vales de oferta (código, verificação, usado) e números (negócio + visitas do site). O site lê tudo em /api/site, por isso o que ele muda aparece logo.
"""
import base64, calendar, datetime as dt, hashlib, hmac, json, os, re, secrets, sqlite3, threading, time, unicodedata, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB = os.environ.get('AG_DB', '/var/lib/adri-agenda/agenda.db')
PORTA = int(os.environ.get('AG_PORTA', '3120'))
ORIGENS = set((os.environ.get('ORIGENS') or 'https://adribodypiercing.pt https://www.adribodypiercing.pt https://adribodypiercing.2-31-13-85.sslip.io').split())
SENHA_HASH = os.environ.get('ADRI_SENHA_HASH', '')
MAX_CORPO = 8 * 1024
SESSAO_H = 12
JANELA_DIAS = 75          # até quando se pode marcar
ANTECEDENCIA_H = 2        # marcações com pelo menos 2 horas de antecedência
DESCONTO = 0              # sem campanha de desconto online (retirada a 10/11/2026)
TETO_PENDENTES = 60       # pedidos por confirmar no total
COOKIE = '__Host-adri_admin'

# Iguais aos do site (sites/adribodypiercing). Preço em euros, com a joia básica incluída.
SERVICOS = {
    # orelha: todos os piercings de orelha a 35 €
    'lobulo': ('Lóbulo', 35), 'lobulo-alto': ('Lóbulo alto', 35), 'helix': ('Hélix', 35), 'helix-frontal': ('Hélix frontal', 35),
    'flat': ('Flat', 35), 'tragus': ('Tragus', 35), 'antitragus': ('Anti-tragus', 35), 'conch': ('Conch', 35),
    'daith': ('Daith', 35), 'rook': ('Rook', 35), 'snug': ('Snug', 35), 'industrial': ('Industrial', 35),
    # rosto
    'narina': ('Narina', 30), 'septo': ('Septo', 40), 'labio': ('Lábio', 35), 'medusa': ('Medusa', 35), 'smiley': ('Smiley', 40),
    'sobrancelha': ('Sobrancelha', 35),
    # corpo
    'umbigo': ('Umbigo', 50), 'mamilo': ('Mamilos', 50), 'surface': ('Surface', 60), 'microdermal': ('Microdermal', 60),
    # serviços
    'consulta': ('Consulta', 0), 'troca': ('Troca de joia', 0),  # troca: preço sob consulta
}
# Valores de origem. O Adriano muda-os no painel (ficam na tabela config) e o site lê-os em /api/site.
# Horário: por dia da semana (0 = segunda), quando abre e quando fecha; as marcações começam de «duracao» em «duracao» minutos
# a partir da abertura e acabam até ao fecho (10h00–17h30 com 60 min dá 10h, 11h… 16h, como antes).
HORARIO_PADRAO = {'dias': {'5': {'abre': '10:00', 'fecha': '17:30'}}, 'duracao': 60}
LOCAL_PADRAO = {'nome': 'Kaos Tattoo', 'rua': 'Rua da Torrinha, 202', 'cp': '4050-610', 'cidade': 'Porto'}
DURACOES = (30, 45, 60, 90, 120)
DIAS_PL = ('segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos')
# Fotos do site que o Adriano pode trocar (o nome é o do lugar na página)
SLOTS = ('nariz', 'umbigo', 'conch', 'trabalho', 'cara')
MAX_FOTO = 3 * 1024 * 1024
CONVITE_DIAS = 90
# Vales de oferta: código de 8 caracteres sem os que se confundem (0/O, 1/I/L), mostrado como XXXX-XXXX
VALE_ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
VALE_MESES = (3, 6, 12)
SUPABASE = 'https://hvvvswhwcpavucwrvlsf.supabase.co/rest/v1/rpc/adri_numeros'
SUPABASE_PUB = 'sb_publishable_aGAxV-VSm1YIjgd-sXWDgQ_dJkhYFpa'  # chave pública (a mesma que o Caddy usa); quem abre os números é a chave da agenda
ATIVOS = ('pendente', 'confirmada')
ESTADOS = ('pendente', 'confirmada', 'recusada', 'cancelada', 'concluida', 'faltou')

_bloq = threading.Lock()
_contagens = {}


def limite(chave, n, janela):
    agora = time.time()
    with _bloq:
        l = [t for t in _contagens.get(chave, []) if agora - t < janela]
        if len(l) >= n:
            _contagens[chave] = l
            return False
        l.append(agora)
        _contagens[chave] = l
        if len(_contagens) > 50000:
            _contagens.clear()
        return True


def h(t):
    return hashlib.sha256(t.encode()).hexdigest()


def hash_senha(senha, sal=None):
    sal = sal or secrets.token_bytes(16)
    d = hashlib.scrypt(senha.encode(), salt=sal, n=2 ** 16, r=8, p=2, maxmem=96 * 1024 * 1024, dklen=32)
    # separador «:» (e não «$») para o valor poder ir tal e qual para o ficheiro de ambiente do systemd
    return 'scrypt:16:8:2:%s:%s' % (base64.b64encode(sal).decode(), base64.b64encode(d).decode())


_scrypt = threading.Semaphore(1)  # uma verificação de cada vez: cada uma usa 64 MB de memória


def confere_senha(senha, guardado):
    try:
        _, n, r, p, sal, d = re.split(r'[$:]', guardado)
        with _scrypt:
            novo = hashlib.scrypt(senha.encode(), salt=base64.b64decode(sal), n=2 ** int(n), r=int(r), p=int(p),
                                  maxmem=96 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(novo, base64.b64decode(d))
    except Exception:
        return False


def ligar():
    c = sqlite3.connect(DB, timeout=10, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    return c


def preparar():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = ligar()
    c.executescript('''
    CREATE TABLE IF NOT EXISTS marcacoes(
      id INTEGER PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, criado INTEGER NOT NULL, atualizado INTEGER NOT NULL,
      estado TEXT NOT NULL, data TEXT NOT NULL, hora TEXT NOT NULL, servicos TEXT NOT NULL, total REAL NOT NULL,
      nome TEXT NOT NULL, tel TEXT NOT NULL, notas TEXT NOT NULL DEFAULT '', motivo TEXT NOT NULL DEFAULT '',
      origem TEXT NOT NULL DEFAULT 'site', historico TEXT NOT NULL DEFAULT '[]');
    CREATE UNIQUE INDEX IF NOT EXISTS hora_ocupada ON marcacoes(data, hora) WHERE estado IN ('pendente','confirmada');
    CREATE INDEX IF NOT EXISTS por_tel ON marcacoes(tel, estado, data);
    CREATE INDEX IF NOT EXISTS por_data ON marcacoes(data);
    CREATE TABLE IF NOT EXISTS bloqueios(id INTEGER PRIMARY KEY, data TEXT NOT NULL, hora TEXT NOT NULL DEFAULT '',
      motivo TEXT NOT NULL DEFAULT '', criado INTEGER NOT NULL, UNIQUE(data, hora));
    CREATE TABLE IF NOT EXISTS sessoes(h TEXT PRIMARY KEY, expira INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS convites(id INTEGER PRIMARY KEY, h TEXT UNIQUE NOT NULL, criado INTEGER NOT NULL, expira INTEGER NOT NULL,
      nome TEXT NOT NULL DEFAULT '', piercing TEXT NOT NULL DEFAULT '', marcacao INTEGER, usado INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS avaliacoes(id INTEGER PRIMARY KEY, criado INTEGER NOT NULL, estrelas INTEGER NOT NULL,
      texto TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL DEFAULT '', piercing TEXT NOT NULL DEFAULT '', visivel INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS vales(id INTEGER PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, valor INTEGER NOT NULL, criado INTEGER NOT NULL,
      expira TEXT NOT NULL, para TEXT NOT NULL DEFAULT '', de TEXT NOT NULL DEFAULT '', tel TEXT NOT NULL DEFAULT '',
      mensagem TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'ativo', usado INTEGER, nota TEXT NOT NULL DEFAULT '',
      historico TEXT NOT NULL DEFAULT '[]');
    ''')
    if 'email' not in [r[1] for r in c.execute('PRAGMA table_info(marcacoes)')]:
        c.execute("ALTER TABLE marcacoes ADD COLUMN email TEXT NOT NULL DEFAULT ''")
    os.makedirs(FOTOS, exist_ok=True)
    if not c.execute("SELECT 1 FROM config WHERE chave='estat_chave'").fetchone():
        # chave só deste servidor para pedir as visitas do site; no Supabase fica apenas o hash (estat.config, hash_chave_adri)
        c.execute("INSERT INTO config(chave, valor) VALUES('estat_chave', ?)", (json.dumps(secrets.token_urlsafe(32)),))
    carregar_cfg(c)
    c.close()


# ---------- configuração do site (preços, horário, local, fotos), em memória e na tabela config ----------
FOTOS = os.path.join(os.path.dirname(DB) or '.', 'fotos')
CFG = {}
_cfg_lock = threading.Lock()


def cfg_get(c, chave, padrao):
    r = c.execute('SELECT valor FROM config WHERE chave=?', (chave,)).fetchone()
    try:
        return json.loads(r['valor']) if r else padrao
    except ValueError:
        return padrao


def cfg_set(c, chave, valor):
    c.execute('INSERT INTO config(chave, valor) VALUES(?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
              (chave, json.dumps(valor, ensure_ascii=False)))
    carregar_cfg(c)


def carregar_cfg(c):
    precos = {k: v[1] for k, v in SERVICOS.items()}
    for k, v in (cfg_get(c, 'precos', {}) or {}).items():
        if k in precos and isinstance(v, int):
            precos[k] = v
    hor = cfg_get(c, 'horario', None) or HORARIO_PADRAO
    loc = dict(LOCAL_PADRAO, **(cfg_get(c, 'local', {}) or {}))
    with _cfg_lock:
        CFG.update(precos=precos, horario=hor, local=loc, fotos=cfg_get(c, 'fotos', {}) or {},
                   google=cfg_get(c, 'google', '') or '', estat_chave=cfg_get(c, 'estat_chave', ''),
                   versao=int(time.time() * 1000))


def minutos(hhmm):
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def hhmm(m):
    return '%02d:%02d' % (m // 60, m % 60)


def horas_do_dia(wd, hor=None):
    hor = hor or CFG.get('horario') or HORARIO_PADRAO
    d = (hor.get('dias') or {}).get(str(wd))
    if not d:
        return []
    dur = hor.get('duracao') or 60
    a, f = minutos(d['abre']), minutos(d['fecha'])
    return [hhmm(t) for t in range(a, f - dur + 1, dur)]


def h_txt(t):
    return t.replace(':', 'h')


def horario_texto(hor):
    """«Sábados, 10h00–17h30»; dias seguidos com as mesmas horas juntam-se («Sextas e sábados, …»)."""
    grupos = []
    for wd in range(7):
        d = (hor.get('dias') or {}).get(str(wd))
        if not d:
            continue
        k = (d['abre'], d['fecha'])
        if grupos and grupos[-1][0] == k:
            grupos[-1][1].append(wd)
        else:
            grupos.append((k, [wd]))
    partes = []
    for (a, f), wds in grupos:
        nomes_d = [DIAS_PL[w] for w in wds]
        dias = nomes_d[0] if len(nomes_d) == 1 else ', '.join(nomes_d[:-1]) + ' e ' + nomes_d[-1]
        partes.append('%s, %s–%s' % (dias, h_txt(a), h_txt(f)))
    t = '; '.join(partes)
    return t[:1].upper() + t[1:] if t else ''


def dias_texto(hor):
    """«aos sábados» / «às sextas e aos sábados»."""
    ws = [w for w in range(7) if (hor.get('dias') or {}).get(str(w))]
    if not ws:
        return ''
    pal = [('aos ' if w in (5, 6) else 'às ') + DIAS_PL[w] for w in ws]
    return pal[0] if len(pal) == 1 else ', '.join(pal[:-1]) + ' e ' + pal[-1]


def mapa_url(loc):
    q = '%s, %s, %s' % (loc['nome'], loc['rua'].replace(',', ''), loc['cidade'])
    return 'https://www.google.com/maps/search/?api=1&query=' + urllib.parse.quote(q)


def site_publico(c):
    hor, loc = CFG['horario'], CFG['local']
    fotos = {}
    for slot, f in CFG['fotos'].items():
        if slot in SLOTS and isinstance(f, dict):
            fotos[slot] = {'src': '/api/fotos/' + f['f'] if f.get('f') else '', 'alt': f.get('alt', ''), 'legenda': f.get('legenda', '')}
    rs = c.execute('SELECT estrelas, texto, nome, piercing, criado FROM avaliacoes WHERE visivel=1 ORDER BY criado DESC').fetchall()
    n = len(rs)
    media = round(sum(r['estrelas'] for r in rs) / n, 1) if n else None
    lista = [{'estrelas': r['estrelas'], 'texto': r['texto'], 'nome': r['nome'], 'piercing': r['piercing'],
              'quando': dt.date.fromtimestamp(r['criado']).isoformat()} for r in rs[:24]]
    return {'versao': CFG['versao'], 'precos': CFG['precos'],
            'horario': {'dias': hor.get('dias', {}), 'duracao': hor.get('duracao', 60), 'texto': horario_texto(hor), 'dias_txt': dias_texto(hor)},
            'local': dict(loc, mapa=mapa_url(loc)), 'fotos': fotos,
            'avaliacoes': {'n': n, 'media': media, 'lista': lista}, 'google': CFG['google']}


def limpeza():
    """Apaga marcações 12 meses depois da data e sessões expiradas (corre ao arrancar e uma vez por dia)."""
    while True:
        try:
            c = ligar()
            corte = (dt.date.today() - dt.timedelta(days=365)).isoformat()
            c.execute('DELETE FROM marcacoes WHERE data < ?', (corte,))
            c.execute('DELETE FROM bloqueios WHERE data < ?', (dt.date.today().isoformat(),))
            c.execute('DELETE FROM sessoes WHERE expira < ?', (int(time.time()),))
            c.execute('DELETE FROM vales WHERE expira < ?', (corte,))  # nomes e telemóvel saem 12 meses depois de o vale expirar
            c.close()
        except Exception:
            pass
        time.sleep(86400)


def data_ok(s):
    try:
        return dt.date.fromisoformat(s) if isinstance(s, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', s) else None
    except ValueError:
        return None


def bloqueado(c, data, hora):
    return c.execute("SELECT 1 FROM bloqueios WHERE data=? AND (hora='' OR hora=?)", (data, hora)).fetchone() is not None


def hora_valida(d, hora, antecedencia=True):
    """A hora existe nesse dia, está dentro da janela e (para clientes) tem antecedência suficiente."""
    if hora not in horas_do_dia(d.weekday()):
        return False
    hoje = dt.date.today()
    if d < hoje or d > hoje + dt.timedelta(days=JANELA_DIAS):
        return False
    quando = dt.datetime.combine(d, dt.time.fromisoformat(hora))
    margem = dt.timedelta(hours=ANTECEDENCIA_H if antecedencia else 0)
    return quando >= dt.datetime.now() + margem


def limpar_texto(t, maximo):
    t = ''.join(ch for ch in str(t or '') if unicodedata.category(ch)[0] != 'C' or ch in '\n')
    return re.sub(r'[ \t]+', ' ', t).strip()[:maximo]


RE_NOME = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ '\-.])*$")


def tel_normal(t):
    t = re.sub(r'[\s.\-()]', '', str(t or ''))
    t = re.sub(r'^(\+351|00351)', '', t)
    return t if re.fullmatch(r'[923]\d{8}', t) else None


RE_EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]+\.[^@\s.]{2,}$')
# mensagens prontas que o Adriano pode editar na agenda (o texto por omissão vive na página da agenda)
MODELOS = ('confirmar', 'lembrete', 'reagendar', 'recusar', 'cancelar', 'atraso', 'cuidados', 'partilha', 'avaliacao', 'vale', 'livre')
CANAIS = ('whatsapp', 'sms', 'email', 'copiar')


def email_normal(t):
    t = limpar_texto(t, 120).lower()
    return t if RE_EMAIL.match(t) else None


ORELHA = ('lobulo', 'lobulo-alto', 'helix', 'helix-frontal', 'flat', 'tragus', 'antitragus', 'conch', 'daith', 'rook', 'snug', 'industrial')


def desde(ids):
    # na orelha o preço começa nos 35 € e pode subir conforme a complexidade
    return any(i in ORELHA for i in ids)


SOB_CONSULTA = ('troca',)


def sob_consulta(ids):
    return any(i in SOB_CONSULTA for i in ids)


def nomes(ids):
    return [SERVICOS[i][0] for i in ids if i in SERVICOS]


def total_de(ids, online=True):
    """Os 10 % só valem para pedidos feitos no site; as marcações que o Adriano mete à mão ficam a preço normal."""
    sub = sum(CFG['precos'].get(i, SERVICOS[i][1]) for i in ids)
    return round(sub * (1 - DESCONTO) if online else sub, 2)


def publico(r):
    ids = json.loads(r['servicos'])
    return {'codigo': r['codigo'], 'estado': r['estado'], 'data': r['data'], 'hora': r['hora'],
            'servicos': nomes(ids), 'total': r['total'], 'desde': desde(ids), 'sob_consulta': sob_consulta(ids), 'motivo': r['motivo']}


def vale_codigo():
    return ''.join(secrets.choice(VALE_ALFABETO) for _ in range(8))


def vale_norm(t):
    t = re.sub(r'[\s\-]', '', str(t or '')).upper()
    return t if re.fullmatch('[%s]{8}' % VALE_ALFABETO, t) else None


def mais_meses(d, n):
    m = d.month - 1 + n
    a, m = d.year + m // 12, m % 12 + 1
    return dt.date(a, m, min(d.day, calendar.monthrange(a, m)[1]))


def vale_dict(r):
    d = dict(r)
    d['historico'] = json.loads(r['historico'] or '[]')
    d['codigo_f'] = r['codigo'][:4] + '-' + r['codigo'][4:]
    d['situacao'] = 'usado' if r['estado'] == 'usado' else ('expirado' if r['expira'] < dt.date.today().isoformat() else 'valido')
    return d


def completo(r):
    d = dict(r)
    d['servicos_ids'] = json.loads(r['servicos'])
    d['servicos'] = nomes(d['servicos_ids'])
    d['desde'] = desde(d['servicos_ids'])
    d['sob_consulta'] = sob_consulta(d['servicos_ids'])
    d['historico'] = json.loads(r['historico'] or '[]')
    return d


class H(BaseHTTPRequestHandler):
    server_version = 'agenda'
    sys_version = ''

    def log_message(self, *a):
        pass  # sem registos com dados pessoais

    def ip(self):
        # o Caddy acrescenta o IP real no fim; o que o cliente mandar antes não conta
        return (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[-1].strip()

    def responder(self, cod, corpo=None, cabecalhos=None, cache='no-store'):
        dados = json.dumps(corpo if corpo is not None else {}, ensure_ascii=False).encode()
        self.send_response(cod)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', cache)
        for k, v in (cabecalhos or []):
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def erro(self, cod, codigo, **extra):
        return self.responder(cod, dict(erro=codigo, **extra))

    def origem_ok(self):
        o = self.headers.get('Origin')
        if o:
            return o in ORIGENS
        return ('https://' + self.headers.get('Host', '')) in ORIGENS

    def corpo_json(self):
        if not (self.headers.get('Content-Type') or '').startswith('application/json'):
            return None
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return None
        if n <= 0 or n > MAX_CORPO:
            return None
        try:
            v = json.loads(self.rfile.read(n))
            return v if isinstance(v, dict) else None
        except ValueError:
            return None

    def admin(self, c):
        m = re.search(r'(?:^|;\s*)' + COOKIE + r'=([A-Za-z0-9_\-]{30,100})', self.headers.get('Cookie') or '')
        if not m:
            return False
        return c.execute('SELECT 1 FROM sessoes WHERE h=? AND expira>?', (h(m.group(1)), int(time.time()))).fetchone() is not None

    # ---------- GET ----------
    def do_GET(self):
        caminho, _, q = self.path.partition('?')
        args = dict(p.split('=', 1) for p in q.split('&') if '=' in p)
        c = ligar()
        try:
            if caminho == '/api/saude':
                return self.responder(200, {'ok': True})
            if caminho == '/api/disponibilidade':
                if not limite('disp:' + self.ip(), 120, 600):
                    return self.erro(429, 'limite')
                return self.responder(200, self.disponibilidade(c, args, admin=False))
            if caminho == '/api/site':
                if not limite('site:' + self.ip(), 300, 600):
                    return self.erro(429, 'limite')
                return self.responder(200, site_publico(c), cache='no-cache')
            m = re.fullmatch(r'/api/fotos/((?:%s)-[A-Za-z0-9_\-]{8,24}\.(webp|jpg))' % '|'.join(SLOTS), caminho)
            if m:
                return self.ficheiro_foto(m.group(1), m.group(2))
            m = re.fullmatch(r'/api/marcacoes/([A-Za-z0-9_\-]{10,20})', caminho)
            if m:
                if not limite('estado:' + self.ip(), 60, 600):
                    return self.erro(429, 'limite')
                r = c.execute('SELECT * FROM marcacoes WHERE codigo=?', (m.group(1),)).fetchone()
                return self.responder(200, publico(r)) if r else self.erro(404, 'nao_existe')
            if caminho.startswith('/api/admin/'):
                if not self.admin(c):
                    return self.erro(401, 'sem_sessao')
                if caminho == '/api/admin/estado':
                    return self.responder(200, {'ok': True})
                if caminho == '/api/admin/marcacoes':
                    hoje = dt.date.today()
                    de = data_ok(args.get('de', '')) or hoje - dt.timedelta(days=60)
                    ate = data_ok(args.get('ate', '')) or hoje + dt.timedelta(days=JANELA_DIAS + 30)
                    rs = c.execute('SELECT * FROM marcacoes WHERE data BETWEEN ? AND ? ORDER BY data, hora', (de.isoformat(), ate.isoformat())).fetchall()
                    pend = c.execute("SELECT COUNT(*) FROM marcacoes WHERE estado='pendente' AND data>=?", (hoje.isoformat(),)).fetchone()[0]
                    return self.responder(200, {'marcacoes': [completo(r) for r in rs], 'pendentes': pend, 'hoje': hoje.isoformat(),
                                                'servicos': {k: {'nome': v[0], 'preco': CFG['precos'].get(k, v[1])} for k, v in SERVICOS.items()}})
                if caminho == '/api/admin/modelos':
                    r = c.execute("SELECT valor FROM config WHERE chave='modelos'").fetchone()
                    return self.responder(200, {'modelos': json.loads(r['valor']) if r else {}})
                if caminho == '/api/admin/bloqueios':
                    rs = c.execute('SELECT id, data, hora, motivo FROM bloqueios WHERE data>=? ORDER BY data, hora', (dt.date.today().isoformat(),)).fetchall()
                    return self.responder(200, {'bloqueios': [dict(r) for r in rs]})
                if caminho == '/api/admin/disponibilidade':
                    return self.responder(200, self.disponibilidade(c, args, admin=True))
                if caminho == '/api/admin/config':
                    d = site_publico(c)
                    d.update(servicos={k: v[0] for k, v in SERVICOS.items()}, padrao={k: v[1] for k, v in SERVICOS.items()},
                             slots=list(SLOTS), duracoes=list(DURACOES))
                    return self.responder(200, d)
                if caminho == '/api/admin/avaliacoes':
                    av = c.execute('SELECT * FROM avaliacoes ORDER BY criado DESC').fetchall()
                    cv = c.execute('SELECT id, criado, expira, nome, piercing, usado FROM convites ORDER BY criado DESC LIMIT 60').fetchall()
                    return self.responder(200, {'avaliacoes': [dict(r) for r in av], 'convites': [dict(r) for r in cv], 'agora': int(time.time()),
                                                'google': CFG['google']})
                if caminho == '/api/admin/vales':
                    rs = c.execute('SELECT * FROM vales ORDER BY criado DESC, id DESC LIMIT 1000').fetchall()
                    return self.responder(200, {'vales': [vale_dict(r) for r in rs], 'hoje': dt.date.today().isoformat()})
                if caminho == '/api/admin/vales/verificar':
                    cod = vale_norm(urllib.parse.unquote_plus(args.get('codigo', '')))
                    if not cod:
                        return self.responder(200, {'situacao': 'invalido'})
                    r = c.execute('SELECT * FROM vales WHERE codigo=?', (cod,)).fetchone()
                    if not r:
                        return self.responder(200, {'situacao': 'nao_existe'})
                    v = vale_dict(r)
                    return self.responder(200, {'situacao': v['situacao'], 'vale': v})
                if caminho == '/api/admin/numeros':
                    try:
                        dias = max(7, min(365, int(args.get('dias', '30'))))
                    except ValueError:
                        dias = 30
                    return self.responder(200, {'negocio': self.numeros(c, dias), 'site': numeros_site(dias), 'dias': dias})
            return self.erro(404, 'nao_existe')
        finally:
            c.close()

    def disponibilidade(self, c, args, admin):
        hoje = dt.date.today()
        de = data_ok(args.get('de', '')) or hoje
        try:
            dias = max(1, min(62, int(args.get('dias', '31'))))
        except ValueError:
            dias = 31
        fim = de + dt.timedelta(days=dias - 1)
        ocupadas = {(r['data'], r['hora']) for r in c.execute(
            "SELECT data, hora FROM marcacoes WHERE estado IN ('pendente','confirmada') AND data BETWEEN ? AND ?", (de.isoformat(), fim.isoformat()))}
        blq = {}
        for r in c.execute('SELECT data, hora FROM bloqueios WHERE data BETWEEN ? AND ?', (de.isoformat(), fim.isoformat())):
            blq.setdefault(r['data'], set()).add(r['hora'])
        out = {}
        for i in range(dias):
            d = de + dt.timedelta(days=i)
            hs = horas_do_dia(d.weekday())
            if not hs:
                continue
            k = d.isoformat()
            b = blq.get(k, set())
            out[k] = {hh: (hora_valida(d, hh, antecedencia=not admin) and (k, hh) not in ocupadas and '' not in b and hh not in b) for hh in hs}
        return {'dias': out, 'hoje': hoje.isoformat(), 'limite': (hoje + dt.timedelta(days=JANELA_DIAS)).isoformat()}

    # ---------- POST ----------
    def do_POST(self):
        if not self.origem_ok():
            return self.erro(403, 'origem')
        caminho = self.path.split('?')[0]
        m = re.fullmatch(r'/api/admin/fotos/([a-z]+)', caminho)
        if m:
            c = ligar()
            try:
                if not self.admin(c):
                    self.close_connection = True
                    return self.erro(401, 'sem_sessao')
                return self.enviar_foto(c, m.group(1))
            finally:
                c.close()
        corpo = self.corpo_json()
        if corpo is None:
            return self.erro(400, 'pedido_invalido')
        c = ligar()
        try:
            if caminho == '/api/marcacoes':
                return self.criar(c, corpo)
            if caminho == '/api/convite':
                return self.ver_convite(c, corpo)
            if caminho == '/api/avaliacoes':
                return self.avaliar(c, corpo)
            m = re.fullmatch(r'/api/marcacoes/([A-Za-z0-9_\-]{10,20})/cancelar', caminho)
            if m:
                return self.cancelar_cliente(c, m.group(1))
            if caminho == '/api/admin/entrar':
                return self.entrar(c, corpo)
            if caminho.startswith('/api/admin/'):
                if not self.admin(c):
                    return self.erro(401, 'sem_sessao')
                if caminho == '/api/admin/sair':
                    m2 = re.search(r'(?:^|;\s*)' + COOKIE + r'=([A-Za-z0-9_\-]{30,100})', self.headers.get('Cookie') or '')
                    if m2:
                        c.execute('DELETE FROM sessoes WHERE h=?', (h(m2.group(1)),))
                    return self.responder(200, {'ok': True}, [('Set-Cookie', COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')])
                m = re.fullmatch(r'/api/admin/marcacoes/(\d+)/acao', caminho)
                if m:
                    return self.acao(c, int(m.group(1)), corpo)
                if caminho == '/api/admin/marcacoes':
                    return self.criar(c, corpo, admin=True)
                if caminho == '/api/admin/bloqueios':
                    return self.bloquear(c, corpo)
                if caminho == '/api/admin/modelos':
                    return self.guardar_modelos(c, corpo)
                m = re.fullmatch(r'/api/admin/bloqueios/(\d+)/apagar', caminho)
                if m:
                    c.execute('DELETE FROM bloqueios WHERE id=?', (int(m.group(1)),))
                    return self.responder(200, {'ok': True})
                m = re.fullmatch(r'/api/admin/config/(precos|horario|local|google)', caminho)
                if m:
                    return self.guardar_config(c, m.group(1), corpo)
                m = re.fullmatch(r'/api/admin/fotos/([a-z]+)/(texto|repor)', caminho)
                if m:
                    return self.foto_texto(c, m.group(1), corpo) if m.group(2) == 'texto' else self.foto_repor(c, m.group(1))
                if caminho == '/api/admin/convites':
                    return self.criar_convite(c, corpo)
                m = re.fullmatch(r'/api/admin/convites/(\d+)/apagar', caminho)
                if m:
                    c.execute('DELETE FROM convites WHERE id=? AND usado=0', (int(m.group(1)),))
                    return self.responder(200, {'ok': True})
                if caminho == '/api/admin/vales':
                    return self.criar_vale(c, corpo)
                m = re.fullmatch(r'/api/admin/vales/(\d+)/(usar|repor|apagar)', caminho)
                if m:
                    return self.mexer_vale(c, int(m.group(1)), m.group(2), corpo)
                m = re.fullmatch(r'/api/admin/avaliacoes/(\d+)/visivel', caminho)
                if m:
                    if not isinstance(corpo.get('visivel'), bool):
                        return self.erro(400, 'pedido_invalido')
                    c.execute('UPDATE avaliacoes SET visivel=? WHERE id=?', (1 if corpo['visivel'] else 0, int(m.group(1))))
                    return self.responder(200, {'ok': True})
            return self.erro(404, 'nao_existe')
        finally:
            c.close()

    def validar(self, c, corpo, admin):
        """Devolve (dados, erros). Os erros vêm por campo, para o site mostrar junto de cada um."""
        erros = {}
        ids = corpo.get('servicos')
        if not isinstance(ids, list) or not 1 <= len(ids) <= 6 or len(set(ids)) != len(ids) or any(i not in SERVICOS for i in ids):
            erros['servicos'] = 'Escolhe entre 1 e 6 piercings ou serviços da lista.'
        d = data_ok(corpo.get('data'))
        hora = corpo.get('hora') if isinstance(corpo.get('hora'), str) else ''
        if not d or not hora_valida(d, hora, antecedencia=not admin):
            erros['quando'] = 'Escolhe um dia e uma hora de abertura, com pelo menos %d horas de antecedência.' % ANTECEDENCIA_H
        elif bloqueado(c, d.isoformat(), hora):
            erros['quando'] = 'Essa hora não está disponível. Escolhe outra.'
        nome = limpar_texto(corpo.get('nome'), 80)
        if len(nome) < 2 or not RE_NOME.match(nome):
            erros['nome'] = 'Escreve o teu nome (só letras).'
        tel = tel_normal(corpo.get('tel'))
        if not tel:
            erros['tel'] = 'Escreve um número com 9 algarismos, a começar por 9, 2 ou 3.'
        notas = limpar_texto(corpo.get('notas'), 500)
        email = ''
        if str(corpo.get('email') or '').strip():
            email = email_normal(corpo.get('email'))
            if not email:
                erros['email'] = 'Esse email não parece certo. Podes deixar em branco.'
        if not admin and corpo.get('idade') is not True:
            erros['idade'] = 'Confirma a idade para continuar.'
        return dict(ids=ids, data=d.isoformat() if d else '', hora=hora, nome=nome, tel=tel, notas=notas, email=email or ''), erros

    def criar(self, c, corpo, admin=False):
        ip = self.ip()
        if not admin:
            # robôs: campo-isco preenchido ou formulário preenchido depressa demais
            if corpo.get('empresa'):
                return self.erro(400, 'pedido_invalido')
            try:
                ms = int(corpo.get('ms') or 0)
            except (TypeError, ValueError):
                ms = 0
            if ms < 3000:
                return self.erro(400, 'muito_rapido')
            if not limite('m-ip:' + ip, 4, 600) or not limite('m-ip-dia:' + ip, 10, 86400):
                return self.erro(429, 'limite')
        dados, erros = self.validar(c, corpo, admin)
        if erros:
            return self.erro(422, 'campos', campos=erros)
        hoje = dt.date.today().isoformat()
        if not admin:
            if not limite('m-tel:' + dados['tel'], 3, 86400):
                return self.erro(429, 'limite')
            if c.execute("SELECT 1 FROM marcacoes WHERE tel=? AND estado IN ('pendente','confirmada') AND data>=?", (dados['tel'], hoje)).fetchone():
                return self.erro(409, 'ja_tens_marcacao')
            if c.execute("SELECT COUNT(*) FROM marcacoes WHERE estado='pendente' AND data>=?", (hoje,)).fetchone()[0] >= TETO_PENDENTES:
                return self.erro(503, 'agenda_cheia')
        agora = int(time.time())
        estado = 'confirmada' if admin and corpo.get('confirmada', True) else 'pendente'
        codigo = secrets.token_urlsafe(9)
        hist = [{'t': agora, 'o': 'criada pelo Adriano' if admin else 'pedido pelo site'}]
        try:
            c.execute('BEGIN IMMEDIATE')
            c.execute('INSERT INTO marcacoes(codigo, criado, atualizado, estado, data, hora, servicos, total, nome, tel, notas, origem, historico, email) '
                      'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                      (codigo, agora, agora, estado, dados['data'], dados['hora'], json.dumps(dados['ids']), total_de(dados['ids'], online=not admin),
                       dados['nome'], dados['tel'], dados['notas'], 'adriano' if admin else 'site', json.dumps(hist), dados['email']))
            c.execute('COMMIT')
        except sqlite3.IntegrityError:
            c.execute('ROLLBACK')
            return self.erro(409, 'hora_ocupada')
        r = c.execute('SELECT * FROM marcacoes WHERE codigo=?', (codigo,)).fetchone()
        return self.responder(201, completo(r) if admin else publico(r))

    def cancelar_cliente(self, c, codigo):
        if not limite('canc:' + self.ip(), 10, 3600):
            return self.erro(429, 'limite')
        r = c.execute('SELECT * FROM marcacoes WHERE codigo=?', (codigo,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        if r['estado'] not in ATIVOS or r['data'] < dt.date.today().isoformat():
            return self.erro(409, 'nao_da')
        hist = json.loads(r['historico'] or '[]') + [{'t': int(time.time()), 'o': 'cancelada pelo cliente no site'}]
        c.execute("UPDATE marcacoes SET estado='cancelada', motivo='Cancelada por ti no site.', atualizado=?, historico=? WHERE id=?",
                  (int(time.time()), json.dumps(hist), r['id']))
        return self.responder(200, publico(c.execute('SELECT * FROM marcacoes WHERE id=?', (r['id'],)).fetchone()))

    def entrar(self, c, corpo):
        ip = self.ip()
        if not limite('login:' + ip, 5, 900) or not limite('login-todos', 40, 900):
            return self.erro(429, 'limite')
        senha = corpo.get('senha') if isinstance(corpo.get('senha'), str) else ''
        if not SENHA_HASH or not senha or len(senha) > 200 or not confere_senha(senha, SENHA_HASH):
            time.sleep(0.6)
            return self.erro(401, 'senha_errada')
        t = secrets.token_urlsafe(32)
        c.execute('INSERT INTO sessoes(h, expira) VALUES(?, ?)', (h(t), int(time.time()) + SESSAO_H * 3600))
        ck = '%s=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Strict' % (COOKIE, t, SESSAO_H * 3600)
        return self.responder(200, {'ok': True}, [('Set-Cookie', ck)])

    def acao(self, c, mid, corpo):
        r = c.execute('SELECT * FROM marcacoes WHERE id=?', (mid,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        a = corpo.get('acao')
        if a == 'mensagem':
            # só regista no histórico que o Adriano mandou uma mensagem (não muda o estado)
            tipo, canal = corpo.get('tipo'), corpo.get('canal')
            if tipo not in MODELOS or canal not in CANAIS:
                return self.erro(400, 'acao_invalida')
            hist = json.loads(r['historico'] or '[]')[-40:]
            hist.append({'t': int(time.time()), 'o': 'mensagem: %s (%s)' % (tipo, canal), 'msg': tipo})
            c.execute('UPDATE marcacoes SET historico=? WHERE id=?', (json.dumps(hist), mid))
            return self.responder(200, completo(c.execute('SELECT * FROM marcacoes WHERE id=?', (mid,)).fetchone()))
        motivo = limpar_texto(corpo.get('motivo'), 300)
        permitido = {'aprovar': ('pendente',), 'recusar': ('pendente',), 'cancelar': ATIVOS, 'concluir': ('confirmada',),
                     'faltou': ('confirmada',), 'reagendar': ATIVOS, 'reabrir': ('recusada', 'cancelada', 'faltou', 'concluida')}
        if a not in permitido:
            return self.erro(400, 'acao_invalida')
        if r['estado'] not in permitido[a]:
            return self.erro(409, 'estado', estado=r['estado'])
        agora = int(time.time())
        hist = json.loads(r['historico'] or '[]')
        novo = {'aprovar': 'confirmada', 'recusar': 'recusada', 'cancelar': 'cancelada', 'concluir': 'concluida',
                'faltou': 'faltou', 'reagendar': r['estado'], 'reabrir': 'pendente'}[a]
        data, hora = r['data'], r['hora']
        if a == 'reagendar':
            d = data_ok(corpo.get('data'))
            hora = corpo.get('hora') if isinstance(corpo.get('hora'), str) else ''
            if not d or not hora_valida(d, hora, antecedencia=False):
                return self.erro(422, 'campos', campos={'quando': 'Escolhe um dia e uma hora de abertura no futuro.'})
            data = d.isoformat()
            hist.append({'t': agora, 'o': 'reagendada de %s %s para %s %s' % (r['data'], r['hora'], data, hora)})
        else:
            hist.append({'t': agora, 'o': {'aprovar': 'aprovada', 'recusar': 'recusada', 'cancelar': 'cancelada', 'concluir': 'concluída',
                                            'faltou': 'faltou', 'reabrir': 'reaberta'}[a] + (': ' + motivo if motivo else '')})
        try:
            c.execute('BEGIN IMMEDIATE')
            c.execute('UPDATE marcacoes SET estado=?, data=?, hora=?, motivo=?, atualizado=?, historico=? WHERE id=?',
                      (novo, data, hora, motivo if a in ('recusar', 'cancelar') else ('' if a in ('aprovar', 'reabrir') else r['motivo']),
                       agora, json.dumps(hist), mid))
            c.execute('COMMIT')
        except sqlite3.IntegrityError:
            c.execute('ROLLBACK')
            return self.erro(409, 'hora_ocupada')
        return self.responder(200, completo(c.execute('SELECT * FROM marcacoes WHERE id=?', (mid,)).fetchone()))

    def guardar_modelos(self, c, corpo):
        ms = corpo.get('modelos')
        if not isinstance(ms, dict) or any(k not in MODELOS or not isinstance(v, str) for k, v in ms.items()):
            return self.erro(400, 'pedido_invalido')
        # junta aos que já estão guardados (guarda-se uma mensagem de cada vez); texto vazio volta ao original
        r = c.execute("SELECT valor FROM config WHERE chave='modelos'").fetchone()
        limpo = json.loads(r['valor']) if r else {}
        for k, v in ms.items():
            v = limpar_texto(v, 700)
            if v:
                limpo[k] = v
            else:
                limpo.pop(k, None)
        c.execute("INSERT INTO config(chave, valor) VALUES('modelos', ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor", (json.dumps(limpo, ensure_ascii=False),))
        return self.responder(200, {'modelos': limpo})

    def bloquear(self, c, corpo):
        d = data_ok(corpo.get('data'))
        hora = corpo.get('hora') if isinstance(corpo.get('hora'), str) else ''
        if not d or d < dt.date.today() or (hora and hora not in horas_do_dia(d.weekday())):
            return self.erro(422, 'campos', campos={'quando': 'Escolhe um dia de hoje em diante e, se quiseres, uma hora de abertura.'})
        try:
            c.execute('INSERT INTO bloqueios(data, hora, motivo, criado) VALUES(?,?,?,?)', (d.isoformat(), hora, limpar_texto(corpo.get('motivo'), 120), int(time.time())))
        except sqlite3.IntegrityError:
            pass
        return self.responder(200, {'ok': True})

    # ---------- painel: configuração do site ----------
    def guardar_config(self, c, qual, corpo):
        if qual == 'precos':
            ps = corpo.get('precos')
            if not isinstance(ps, dict) or not ps or any(k not in SERVICOS or type(v) is not int or not 0 <= v <= 999 for k, v in ps.items()):
                return self.erro(422, 'campos', campos={'precos': 'Cada preço é um número inteiro de 0 a 999 €.'})
            atual = dict(CFG['precos'])
            atual.update(ps)
            cfg_set(c, 'precos', atual)
        elif qual == 'horario':
            dias, dur = corpo.get('dias'), corpo.get('duracao')
            if dur not in DURACOES or not isinstance(dias, dict) or any(k not in [str(i) for i in range(7)] for k in dias):
                return self.erro(422, 'campos', campos={'horario': 'Horário inválido.'})
            limpo = {}
            for k, v in dias.items():
                a, f = (v or {}).get('abre'), (v or {}).get('fecha')
                if not all(isinstance(x, str) and re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', x) for x in (a, f)) or minutos(f) - minutos(a) < dur:
                    return self.erro(422, 'campos', campos={'dia' + k: 'A hora de fecho tem de ficar pelo menos %d minutos depois da abertura.' % dur})
                limpo[k] = {'abre': a, 'fecha': f}
            cfg_set(c, 'horario', {'dias': limpo, 'duracao': dur})
        elif qual == 'local':
            loc = {k: limpar_texto(corpo.get(k), n) for k, n in (('nome', 60), ('rua', 80), ('cp', 8), ('cidade', 40))}
            erros = {}
            if len(loc['nome']) < 2:
                erros['nome'] = 'Escreve o nome do sítio.'
            if len(loc['rua']) < 3:
                erros['rua'] = 'Escreve a rua e o número.'
            if not re.fullmatch(r'\d{4}-\d{3}', loc['cp']):
                erros['cp'] = 'O código postal tem o formato 4050-610.'
            if len(loc['cidade']) < 2:
                erros['cidade'] = 'Escreve a cidade.'
            if erros:
                return self.erro(422, 'campos', campos=erros)
            cfg_set(c, 'local', loc)
        else:
            url = limpar_texto(corpo.get('url'), 300)
            if url and not re.fullmatch(r'https://[^\s<>"\'`]+', url):
                return self.erro(422, 'campos', campos={'url': 'Cola o link completo, a começar por https://'})
            cfg_set(c, 'google', url)
        return self.responder(200, site_publico(c))

    # ---------- painel: fotos ----------
    def enviar_foto(self, c, slot):
        self.close_connection = True  # o corpo pode não ser lido todo quando se recusa
        if slot not in SLOTS:
            return self.erro(404, 'nao_existe')
        if not limite('foto:' + self.ip(), 40, 3600):
            return self.erro(429, 'limite')
        tipo = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_FOTO:
            return self.erro(413, 'grande')
        dados = self.rfile.read(n)
        if tipo == 'image/webp' and dados[:4] == b'RIFF' and dados[8:12] == b'WEBP':
            ext = 'webp'
        elif tipo == 'image/jpeg' and dados[:3] == b'\xff\xd8\xff':
            ext = 'jpg'
        else:
            return self.erro(415, 'formato')
        nome = '%s-%s.%s' % (slot, secrets.token_urlsafe(9), ext)
        tmp = os.path.join(FOTOS, nome + '.tmp')
        with open(tmp, 'wb') as f:
            f.write(dados)
        os.replace(tmp, os.path.join(FOTOS, nome))
        fotos = json.loads(json.dumps(CFG['fotos']))
        antigo = (fotos.get(slot) or {}).get('f')
        fotos[slot] = dict(fotos.get(slot) or {}, f=nome)
        cfg_set(c, 'fotos', fotos)
        self.apagar_ficheiro(antigo)
        return self.responder(200, {'fotos': site_publico(c)['fotos']})

    def apagar_ficheiro(self, nome):
        if nome and re.fullmatch(r'[a-z]+-[A-Za-z0-9_\-]{8,24}\.(webp|jpg)', nome):
            try:
                os.remove(os.path.join(FOTOS, nome))
            except OSError:
                pass

    def foto_texto(self, c, slot, corpo):
        if slot not in SLOTS:
            return self.erro(404, 'nao_existe')
        alt, leg = limpar_texto(corpo.get('alt'), 160), limpar_texto(corpo.get('legenda'), 140)
        fotos = json.loads(json.dumps(CFG['fotos']))
        fotos[slot] = dict(fotos.get(slot) or {}, alt=alt, legenda=leg)
        cfg_set(c, 'fotos', fotos)
        return self.responder(200, {'fotos': site_publico(c)['fotos']})

    def foto_repor(self, c, slot):
        if slot not in SLOTS:
            return self.erro(404, 'nao_existe')
        fotos = json.loads(json.dumps(CFG['fotos']))
        antigo = (fotos.pop(slot, None) or {}).get('f')
        cfg_set(c, 'fotos', fotos)
        self.apagar_ficheiro(antigo)
        return self.responder(200, {'fotos': site_publico(c)['fotos']})

    def ficheiro_foto(self, nome, ext):
        try:
            with open(os.path.join(FOTOS, nome), 'rb') as f:
                dados = f.read()
        except OSError:
            return self.erro(404, 'nao_existe')
        self.send_response(200)
        self.send_header('Content-Type', 'image/webp' if ext == 'webp' else 'image/jpeg')
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')  # o nome muda sempre que a foto muda
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    # ---------- avaliações (link de uso único) ----------
    def criar_convite(self, c, corpo):
        nome, piercing, mid = limpar_texto(corpo.get('nome'), 40), limpar_texto(corpo.get('piercing'), 80), None
        if type(corpo.get('marcacao')) is int:
            r = c.execute('SELECT id, nome, servicos FROM marcacoes WHERE id=?', (corpo['marcacao'],)).fetchone()
            if r:
                mid = r['id']
                ids = [i for i in json.loads(r['servicos']) if i not in ('consulta', 'troca')]
                piercing = ', '.join(nomes(ids))[:80]
                nome = nome or limpar_texto(r['nome'].split(' ')[0], 40)
        # 12 caracteres (72 bits): curto para caber escrito no cartão de obrigado, e só serve uma vez durante 90 dias
        t, agora = secrets.token_urlsafe(9), int(time.time())
        cur = c.execute('INSERT INTO convites(h, criado, expira, nome, piercing, marcacao) VALUES(?,?,?,?,?,?)',
                        (h(t), agora, agora + CONVITE_DIAS * 86400, nome, piercing, mid))
        return self.responder(201, {'token': t, 'id': cur.lastrowid, 'nome': nome, 'piercing': piercing})

    def convite_valido(self, c, corpo):
        t = corpo.get('token')
        if not isinstance(t, str) or not re.fullmatch(r'[A-Za-z0-9_\-]{12,40}', t):
            return None, 'nao_existe'
        r = c.execute('SELECT * FROM convites WHERE h=?', (h(t),)).fetchone()
        if not r:
            return None, 'nao_existe'
        if r['usado']:
            return None, 'usado'
        if r['expira'] < time.time():
            return None, 'expirado'
        return r, None

    def ver_convite(self, c, corpo):
        if not limite('conv:' + self.ip(), 30, 600):
            return self.erro(429, 'limite')
        r, e = self.convite_valido(c, corpo)
        if e:
            return self.erro(404 if e == 'nao_existe' else 410, e)
        return self.responder(200, {'nome': r['nome'], 'piercing': r['piercing']})

    def avaliar(self, c, corpo):
        if not limite('aval:' + self.ip(), 8, 3600):
            return self.erro(429, 'limite')
        r, e = self.convite_valido(c, corpo)
        if e:
            return self.erro(404 if e == 'nao_existe' else 410, e)
        est = corpo.get('estrelas')
        if type(est) is not int or not 1 <= est <= 5:
            return self.erro(422, 'campos', campos={'estrelas': 'Escolhe de 1 a 5 estrelas.'})
        texto = limpar_texto(corpo.get('texto'), 600)
        nome = limpar_texto(corpo.get('nome'), 40)
        if nome and not RE_NOME.match(nome):
            return self.erro(422, 'campos', campos={'nome': 'Escreve só o nome (letras).'})
        try:
            c.execute('BEGIN IMMEDIATE')
            cur = c.execute('UPDATE convites SET usado=1 WHERE id=? AND usado=0 AND expira>?', (r['id'], int(time.time())))
            if cur.rowcount != 1:
                c.execute('ROLLBACK')
                return self.erro(410, 'usado')
            c.execute('INSERT INTO avaliacoes(criado, estrelas, texto, nome, piercing) VALUES(?,?,?,?,?)',
                      (int(time.time()), est, texto, nome or 'Cliente', r['piercing']))
            c.execute('COMMIT')
        except sqlite3.Error:
            try:
                c.execute('ROLLBACK')
            except sqlite3.Error:
                pass
            return self.erro(500, 'erro')
        return self.responder(201, {'ok': True, 'google': CFG['google']})

    # ---------- vales de oferta ----------
    def criar_vale(self, c, corpo):
        erros = {}
        valor, meses = corpo.get('valor'), corpo.get('meses', 6)
        if type(valor) is not int or not 5 <= valor <= 1000:
            erros['valor'] = 'Escolhe um valor entre 5 e 1000 €.'
        if meses not in VALE_MESES:
            erros['meses'] = 'A validade é de 3, 6 ou 12 meses.'
        tel = ''
        if corpo.get('tel'):
            tel = tel_normal(corpo.get('tel'))
            if not tel:
                erros['tel'] = 'Esse telemóvel não parece certo (9 dígitos). Podes deixar em branco.'
        if erros:
            return self.erro(422, 'campos', campos=erros)
        para = limpar_texto(corpo.get('para'), 40)
        de = limpar_texto(corpo.get('de'), 40)
        msg = limpar_texto(str(corpo.get('mensagem') or '').replace('\n', ' '), 90)
        agora = int(time.time())
        expira = mais_meses(dt.date.today(), meses).isoformat()
        hist = json.dumps([{'t': agora, 'o': 'criado'}])
        for _ in range(8):
            cod = vale_codigo()
            try:
                cur = c.execute('INSERT INTO vales(codigo, valor, criado, expira, para, de, tel, mensagem, historico) VALUES(?,?,?,?,?,?,?,?,?)',
                                (cod, valor, agora, expira, para, de, tel, msg, hist))
                break
            except sqlite3.IntegrityError:
                continue
        else:
            return self.erro(500, 'erro')
        return self.responder(201, vale_dict(c.execute('SELECT * FROM vales WHERE id=?', (cur.lastrowid,)).fetchone()))

    def mexer_vale(self, c, vid, acao, corpo):
        r = c.execute('SELECT * FROM vales WHERE id=?', (vid,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        if acao == 'apagar':
            c.execute('DELETE FROM vales WHERE id=?', (vid,))
            return self.responder(200, {'ok': True})
        agora, hoje = int(time.time()), dt.date.today().isoformat()
        hist = json.loads(r['historico'] or '[]')[-40:]
        if acao == 'usar':
            nota = limpar_texto(corpo.get('nota'), 120)
            limite_data = '0000-00-00' if corpo.get('forcar') is True else hoje
            hist.append({'t': agora, 'o': 'usado' + (': ' + nota if nota else '')})
            cur = c.execute("UPDATE vales SET estado='usado', usado=?, nota=?, historico=? WHERE id=? AND estado='ativo' AND expira>=?",
                            (agora, nota, json.dumps(hist), vid, limite_data))
            if cur.rowcount != 1:
                return self.erro(409, 'estado', situacao=vale_dict(r)['situacao'])
        else:
            if r['estado'] != 'usado':
                return self.erro(409, 'estado', situacao=vale_dict(r)['situacao'])
            hist.append({'t': agora, 'o': 'voltou a valer'})
            c.execute("UPDATE vales SET estado='ativo', usado=NULL, nota='', historico=? WHERE id=?", (json.dumps(hist), vid))
        return self.responder(200, vale_dict(c.execute('SELECT * FROM vales WHERE id=?', (vid,)).fetchone()))

    # ---------- números do negócio ----------
    def numeros(self, c, dias):
        hoje = dt.date.today()
        de = hoje - dt.timedelta(days=dias - 1)
        rs = c.execute('SELECT estado, data, hora, servicos, total, origem FROM marcacoes WHERE data BETWEEN ? AND ?',
                       (de.isoformat(), hoje.isoformat())).fetchall()
        est = {e: 0 for e in ESTADOS}
        for r in rs:
            est[r['estado']] = est.get(r['estado'], 0) + 1
        concl = [r for r in rs if r['estado'] == 'concluida']
        conta = {}
        for r in rs:
            if r['estado'] in ('concluida', 'confirmada'):
                for i in json.loads(r['servicos']):
                    if i in SERVICOS:
                        conta[i] = conta.get(i, 0) + 1
        top = sorted(conta.items(), key=lambda x: -x[1])[:6]
        t0 = int(time.mktime(de.timetuple()))
        pedidos = c.execute("SELECT COUNT(*) FROM marcacoes WHERE origem='site' AND criado>=?", (t0,)).fetchone()[0]
        # próximos 30 dias: horas marcadas sobre horas de abertura (sem contar dias bloqueados inteiros)
        fim = hoje + dt.timedelta(days=29)
        blq = {r['data'] for r in c.execute("SELECT data FROM bloqueios WHERE hora='' AND data BETWEEN ? AND ?", (hoje.isoformat(), fim.isoformat()))}
        livres = sum(len(horas_do_dia((hoje + dt.timedelta(days=i)).weekday())) for i in range(30)
                     if (hoje + dt.timedelta(days=i)).isoformat() not in blq)
        ocup = c.execute("SELECT COUNT(*) FROM marcacoes WHERE estado IN ('pendente','confirmada') AND data BETWEEN ? AND ?",
                         (hoje.isoformat(), fim.isoformat())).fetchone()[0]
        semanas = []
        for k in range(7, -1, -1):
            a = hoje - dt.timedelta(days=hoje.weekday() + 7 * k)
            b = a + dt.timedelta(days=6)
            n = c.execute("SELECT COUNT(*) FROM marcacoes WHERE estado IN ('concluida','confirmada') AND data BETWEEN ? AND ?",
                          (a.isoformat(), b.isoformat())).fetchone()[0]
            semanas.append({'de': a.isoformat(), 'n': n})
        av = c.execute('SELECT COUNT(*) n, AVG(estrelas) m FROM avaliacoes').fetchone()
        vl = c.execute('SELECT COUNT(*) n, COALESCE(SUM(valor), 0) s FROM vales WHERE criado>=?', (t0,)).fetchone()
        por_usar = c.execute("SELECT COALESCE(SUM(valor), 0) FROM vales WHERE estado='ativo' AND expira>=?", (hoje.isoformat(),)).fetchone()[0]
        return {'vales': {'n': vl['n'], 'valor': vl['s'], 'por_usar': por_usar},'estados': est, 'pedidos_site': pedidos, 'concluidas': len(concl),
                'faturacao': round(sum(r['total'] for r in concl), 2), 'top': [{'id': k, 'nome': SERVICOS[k][0], 'n': v} for k, v in top],
                'proximos': {'marcadas': ocup, 'horas': livres}, 'semanas': semanas,
                'avaliacoes': {'n': av['n'], 'media': round(av['m'], 1) if av['m'] else None}}


_num_cache = {}


def numeros_site(dias):
    """Visitas do site (Supabase, só agregados), guardadas 10 minutos. Sem ligação devolve só o erro."""
    agora = time.time()
    v = _num_cache.get(dias)
    if v and agora - v[0] < 600:
        return v[1]
    try:
        req = urllib.request.Request(SUPABASE, data=json.dumps({'p_chave': CFG.get('estat_chave', ''), 'p_dias': dias}).encode(),
                                     headers={'apikey': SUPABASE_PUB, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        if len(_num_cache) > 20:
            _num_cache.clear()
        _num_cache[dias] = (agora, d)
        return d
    except Exception:
        return {'erro': 'indisponivel'}


def main():
    preparar()
    threading.Thread(target=limpeza, daemon=True).start()
    s = ThreadingHTTPServer(('127.0.0.1', PORTA), H)
    s.daemon_threads = True
    s.serve_forever()


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == 'hash':
        print(hash_senha(sys.argv[2]))
    else:
        main()
