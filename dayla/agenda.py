#!/usr/bin/env python3
"""Dayla Araújo Body Piercing: pedidos de marcação e painel da Dayla.

Só biblioteca padrão (http.server + sqlite3). Corre em 127.0.0.1:3180, atrás do Caddy (HTTPS).

A Dayla não tem estúdio fixo: no painel diz em que dias atende, em que estúdio e a que horas. O cliente escolhe
uma dessas horas ou, se nenhuma der jeito, diz que dias e períodos prefere; ela confirma com dia, hora e estúdio.

Configuração (variáveis de ambiente, em /etc/dayla-agenda/agenda.env, fora do repositório):
  DAYLA_SENHA_HASH  hash scrypt da password do painel (nunca a password em claro). Se a Dayla mudar a
                    password no painel, o hash novo fica na base de dados e passa a valer esse.
  ORIGENS           origens aceites, separadas por espaços
  AG_DB             base de dados (por omissão /var/lib/dayla-agenda/agenda.db)
  AG_PORTA          porta local (por omissão 3180)

Proteções: tudo validado aqui; uma hora só tem uma marcação ativa (índice único); um pedido ativo por telemóvel;
limites por IP e por telemóvel; campo-isco e tempo mínimo no formulário; teto de pedidos por responder.
Painel: password com scrypt, sessão em cookie HttpOnly/Secure/SameSite=Strict guardada só como hash, limite de
tentativas, POST só com JSON e da origem do site. Dados pessoais apagados 12 meses depois.
"""
import base64, datetime as dt, hashlib, hmac, json, os, re, secrets, sqlite3, threading, time, unicodedata, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB = os.environ.get('AG_DB', '/var/lib/dayla-agenda/agenda.db')
PORTA = int(os.environ.get('AG_PORTA', '3180'))
ORIGENS = set((os.environ.get('ORIGENS') or 'https://daylapiercing.pt https://www.daylapiercing.pt https://dayla.2-31-13-85.sslip.io').split())
SENHA_ENV = os.environ.get('DAYLA_SENHA_HASH', '')
MAX_CORPO = 16 * 1024
SESSAO_H = 24 * 14        # 14 dias: ela usa o painel no telemóvel e não deve ter de entrar sempre
JANELA_DIAS = 90          # até quando se pode marcar
ANTECEDENCIA_H = 3        # horas escolhidas no site com pelo menos 3 horas de antecedência
TETO_PENDENTES = 80       # pedidos por responder no total
MAX_SERVICOS = 8
COOKIE = '__Host-dayla_admin'
IDIOMAS = ('pt', 'en')
DURACOES = (30, 45, 60, 90, 120)
CATEGORIAS = ('orelha', 'rosto', 'corpo', 'servicos')
PERIODOS = ('manha', 'tarde', 'noite')
MAX_FOTO = 3 * 1024 * 1024
MAX_GALERIA = 30
CONVITE_DIAS = 90
SUPABASE = 'https://hvvvswhwcpavucwrvlsf.supabase.co/rest/v1/rpc/dayla_numeros'
SUPABASE_PUB = 'sb_publishable_aGAxV-VSm1YIjgd-sXWDgQ_dJkhYFpa'  # chave pública; quem abre os números é a chave da agenda
ATIVOS = ('pendente', 'confirmada')
ESTADOS = ('pendente', 'confirmada', 'recusada', 'cancelada', 'concluida', 'faltou')

# Lista inicial de serviços. Os preços ficam vazios até a Dayla os pôr no painel (o site mostra «a confirmar»).
# (id, categoria, nome pt, nome en, cicatrização pt, cicatrização en)
SERVICOS_PADRAO = [
    ('lobulo', 'orelha', 'Lóbulo', 'Lobe', '6–8 semanas', '6–8 weeks'),
    ('lobulo-alto', 'orelha', 'Lóbulo alto', 'Upper lobe', '2–3 meses', '2–3 months'),
    ('helix', 'orelha', 'Hélix', 'Helix', '6–12 meses', '6–12 months'),
    ('helix-frontal', 'orelha', 'Hélix frontal', 'Forward helix', '6–12 meses', '6–12 months'),
    ('flat', 'orelha', 'Flat', 'Flat', '6–12 meses', '6–12 months'),
    ('tragus', 'orelha', 'Tragus', 'Tragus', '6–12 meses', '6–12 months'),
    ('antitragus', 'orelha', 'Anti-tragus', 'Anti-tragus', '6–12 meses', '6–12 months'),
    ('conch', 'orelha', 'Conch', 'Conch', '6–12 meses', '6–12 months'),
    ('daith', 'orelha', 'Daith', 'Daith', '6–12 meses', '6–12 months'),
    ('rook', 'orelha', 'Rook', 'Rook', '6–12 meses', '6–12 months'),
    ('snug', 'orelha', 'Snug', 'Snug', '6–12 meses', '6–12 months'),
    ('industrial', 'orelha', 'Industrial', 'Industrial', '9–12 meses', '9–12 months'),
    ('narina', 'rosto', 'Narina', 'Nostril', '4–6 meses', '4–6 months'),
    ('septo', 'rosto', 'Septo', 'Septum', '2–3 meses', '2–3 months'),
    ('sobrancelha', 'rosto', 'Sobrancelha', 'Eyebrow', '2–3 meses', '2–3 months'),
    ('labret', 'rosto', 'Lábio (labret)', 'Lip (labret)', '2–3 meses', '2–3 months'),
    ('medusa', 'rosto', 'Medusa', 'Medusa', '2–3 meses', '2–3 months'),
    ('monroe', 'rosto', 'Monroe', 'Monroe', '2–3 meses', '2–3 months'),
    ('smiley', 'rosto', 'Smiley', 'Smiley', '1–3 meses', '1–3 months'),
    ('lingua', 'rosto', 'Língua', 'Tongue', '4–6 semanas', '4–6 weeks'),
    ('umbigo', 'corpo', 'Umbigo', 'Navel', '6–12 meses', '6–12 months'),
    ('mamilo', 'corpo', 'Mamilo', 'Nipple', '6–12 meses', '6–12 months'),
    ('surface', 'corpo', 'Surface', 'Surface', '6–12 meses', '6–12 months'),
    ('microdermal', 'corpo', 'Microdermal', 'Microdermal', '1–3 meses', '1–3 months'),
    ('visagismo', 'servicos', 'Visagismo (projeto de vários piercings)', 'Curation (multi-piercing project)', '', ''),
    ('troca', 'servicos', 'Troca de joia', 'Jewellery change', '', ''),
    ('downsize', 'servicos', 'Downsize (barra mais curta)', 'Downsize (shorter bar)', '', ''),
]
CONTACTOS_PADRAO = {'whatsapp': '351930514346', 'instagram': 'sendodaylabpiercing', 'email': ''}
NOTA_PADRAO = {'pt': 'Valores por perfuração. O valor final confirmo contigo antes de começar, conforme a joia que escolheres.',
               'en': 'Prices per piercing. I confirm the final price with you before we start, depending on the jewellery you choose.'}

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
    return 'scrypt:16:8:2:%s:%s' % (base64.b64encode(sal).decode(), base64.b64encode(d).decode())


_scrypt = threading.Semaphore(1)  # uma verificação de cada vez: cada uma usa 64 MB


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


FOTOS = os.path.join(os.path.dirname(DB) or '.', 'fotos')
CFG = {}
_cfg_lock = threading.Lock()


def preparar():
    os.makedirs(os.path.dirname(DB) or '.', exist_ok=True)
    os.makedirs(FOTOS, exist_ok=True)
    c = ligar()
    c.executescript('''
    CREATE TABLE IF NOT EXISTS pedidos(
      id INTEGER PRIMARY KEY, codigo TEXT UNIQUE NOT NULL, criado INTEGER NOT NULL, atualizado INTEGER NOT NULL,
      estado TEXT NOT NULL, data TEXT NOT NULL DEFAULT '', hora TEXT NOT NULL DEFAULT '', estudio INTEGER,
      servicos TEXT NOT NULL DEFAULT '[]', total REAL, desde INTEGER NOT NULL DEFAULT 0,
      nome TEXT NOT NULL, tel TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', idioma TEXT NOT NULL DEFAULT 'pt',
      preferencias TEXT NOT NULL DEFAULT '{}', notas TEXT NOT NULL DEFAULT '', motivo TEXT NOT NULL DEFAULT '',
      origem TEXT NOT NULL DEFAULT 'site', historico TEXT NOT NULL DEFAULT '[]');
    CREATE UNIQUE INDEX IF NOT EXISTS hora_ocupada ON pedidos(data, hora) WHERE estado IN ('pendente','confirmada') AND data<>'';
    CREATE INDEX IF NOT EXISTS por_tel ON pedidos(tel, estado);
    CREATE INDEX IF NOT EXISTS por_data ON pedidos(data);
    CREATE TABLE IF NOT EXISTS estudios(id INTEGER PRIMARY KEY, nome TEXT NOT NULL, rua TEXT NOT NULL DEFAULT '',
      cp TEXT NOT NULL DEFAULT '', cidade TEXT NOT NULL DEFAULT 'Porto', zona TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS dias(id INTEGER PRIMARY KEY, data TEXT UNIQUE NOT NULL, abre TEXT NOT NULL, fecha TEXT NOT NULL,
      estudio INTEGER, criado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessoes(h TEXT PRIMARY KEY, expira INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS convites(id INTEGER PRIMARY KEY, h TEXT UNIQUE NOT NULL, criado INTEGER NOT NULL, expira INTEGER NOT NULL,
      nome TEXT NOT NULL DEFAULT '', piercing TEXT NOT NULL DEFAULT '', idioma TEXT NOT NULL DEFAULT 'pt', pedido INTEGER, usado INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS avaliacoes(id INTEGER PRIMARY KEY, criado INTEGER NOT NULL, estrelas INTEGER NOT NULL,
      texto TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL DEFAULT '', piercing TEXT NOT NULL DEFAULT '', visivel INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS joias(id INTEGER PRIMARY KEY, nome TEXT NOT NULL, material TEXT NOT NULL DEFAULT '', preco INTEGER,
      foto TEXT NOT NULL DEFAULT '', quantidade INTEGER, visivel INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0,
      atualizado INTEGER NOT NULL DEFAULT 0);
    ''')
    if not c.execute("SELECT 1 FROM config WHERE chave='estat_chave'").fetchone():
        # chave só deste servidor para pedir as visitas do site; no Supabase fica apenas o hash (estat.config, hash_chave_dayla)
        c.execute("INSERT INTO config(chave, valor) VALUES('estat_chave', ?)", (json.dumps(secrets.token_urlsafe(32)),))
    carregar_cfg(c)
    c.close()


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


def servicos_padrao():
    return [{'id': i, 'cat': cat, 'pt': pt, 'en': en, 'preco': None, 'desde': False, 'cic_pt': cp, 'cic_en': ce, 'visivel': True}
            for i, cat, pt, en, cp, ce in SERVICOS_PADRAO]


def carregar_cfg(c):
    servs = cfg_get(c, 'servicos', None) or servicos_padrao()
    with _cfg_lock:
        CFG.update(servicos=servs, por_id={s['id']: s for s in servs},
                   nota=dict(NOTA_PADRAO, **(cfg_get(c, 'nota_precos', {}) or {})),
                   contactos=dict(CONTACTOS_PADRAO, **(cfg_get(c, 'contactos', {}) or {})),
                   duracao=cfg_get(c, 'duracao', 60) or 60, fotos=cfg_get(c, 'fotos', {}) or {},
                   google=cfg_get(c, 'google', '') or '', estat_chave=cfg_get(c, 'estat_chave', ''),
                   senha=cfg_get(c, 'senha_hash', '') or SENHA_ENV, versao=int(time.time() * 1000))


# ---------- utilidades ----------
def minutos(hhmm):
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def hhmm(m):
    return '%02d:%02d' % (m // 60, m % 60)


RE_HORA = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


def data_ok(s):
    try:
        return dt.date.fromisoformat(s) if isinstance(s, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', s) else None
    except ValueError:
        return None


def limpar_texto(t, maximo):
    t = ''.join(ch for ch in str(t or '') if unicodedata.category(ch)[0] != 'C' or ch == '\n')
    return re.sub(r'[ \t]+', ' ', t).strip()[:maximo]


RE_NOME = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ '\-.])*$")
RE_EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]+\.[^@\s.]{2,}$')


def tel_normal(t):
    """Devolve só os algarismos com o indicativo (ex.: 351930514346), ou None.
    Sem indicativo, só aceita números portugueses (9 algarismos a começar por 9, 2 ou 3)."""
    s = re.sub(r'[\s.\-()/]', '', str(t or ''))
    if s.startswith('00'):
        s = '+' + s[2:]
    if s.startswith('+'):
        d = s[1:]
        if not re.fullmatch(r'[1-9]\d{7,14}', d):
            return None
        if d.startswith('351') and not re.fullmatch(r'351[923]\d{8}', d):
            return None
        return d
    if re.fullmatch(r'[923]\d{8}', s):
        return '351' + s
    return None


def email_normal(t):
    t = limpar_texto(t, 120).lower()
    return t if RE_EMAIL.match(t) else None


def mapa_url(e):
    q = ', '.join(x for x in (e.get('nome'), (e.get('rua') or '').replace(',', ''), e.get('cidade')) if x)
    return 'https://www.google.com/maps/search/?api=1&query=' + urllib.parse.quote(q)


def estudio_dict(r, completo=True):
    if not r:
        return None
    d = {'id': r['id'], 'nome': r['nome'], 'zona': r['zona'], 'cidade': r['cidade']}
    if completo:
        d.update(rua=r['rua'], cp=r['cp'], ativo=bool(r['ativo']), mapa=mapa_url(dict(r)))
    return d


def horas_do_dia(dia):
    dur = CFG.get('duracao') or 60
    a, f = minutos(dia['abre']), minutos(dia['fecha'])
    return [hhmm(t) for t in range(a, f - dur + 1, dur)]


def nomes(ids, idioma='pt'):
    out = []
    for i in ids:
        s = CFG['por_id'].get(i)
        out.append(s[idioma] if s else i)
    return out


def total_de(ids):
    """(total, desde): soma o que tem preço; «desde» se algum serviço for «desde» ou ainda não tiver preço."""
    tot, desde = 0, False
    for i in ids:
        s = CFG['por_id'].get(i)
        if not s or s.get('preco') is None:
            desde = True
            continue
        tot += s['preco']
        desde = desde or bool(s.get('desde'))
    return tot, desde


def dias_publicos(c, admin=False):
    """Dias em que a Dayla atende nos próximos JANELA_DIAS dias, com o estúdio e as horas livres."""
    hoje = dt.date.today()
    fim = hoje + dt.timedelta(days=JANELA_DIAS)
    rs = c.execute('SELECT * FROM dias WHERE data BETWEEN ? AND ? ORDER BY data', (hoje.isoformat(), fim.isoformat())).fetchall()
    ocup = {(r['data'], r['hora']) for r in c.execute(
        "SELECT data, hora FROM pedidos WHERE estado IN ('pendente','confirmada') AND data BETWEEN ? AND ?", (hoje.isoformat(), fim.isoformat()))}
    ests = {r['id']: r for r in c.execute('SELECT * FROM estudios')}
    agora = dt.datetime.now()
    out = []
    for r in rs:
        d = dt.date.fromisoformat(r['data'])
        horas = []
        for hh in horas_do_dia(r):
            quando = dt.datetime.combine(d, dt.time.fromisoformat(hh))
            livre = (r['data'], hh) not in ocup and quando >= agora + dt.timedelta(hours=0 if admin else ANTECEDENCIA_H)
            horas.append({'h': hh, 'livre': livre})
        e = ests.get(r['estudio'])
        out.append({'id': r['id'], 'data': r['data'], 'abre': r['abre'], 'fecha': r['fecha'], 'horas': horas,
                    'estudio': estudio_dict(e, completo=admin)})
    return out


def hora_livre(c, data, hora, admin=False, ignorar=None):
    """A hora existe num dia de atendimento, está no futuro (com antecedência para clientes) e não está ocupada."""
    d = data_ok(data)
    if not d or not RE_HORA.match(hora or ''):
        return False
    hoje = dt.date.today()
    if d < hoje or d > hoje + dt.timedelta(days=JANELA_DIAS + (60 if admin else 0)):
        return False
    quando = dt.datetime.combine(d, dt.time.fromisoformat(hora))
    if quando < dt.datetime.now() + dt.timedelta(hours=0 if admin else ANTECEDENCIA_H):
        return False
    if not admin:
        dia = c.execute('SELECT * FROM dias WHERE data=?', (data,)).fetchone()
        if not dia or hora not in horas_do_dia(dia):
            return False
    q = "SELECT id FROM pedidos WHERE data=? AND hora=? AND estado IN ('pendente','confirmada')"
    r = c.execute(q, (data, hora)).fetchone()
    return not r or r['id'] == ignorar


def fotos_publicas():
    f = CFG['fotos']
    p = f.get('perfil') or {}
    gal = [{'src': '/api/fotos/' + g['f'], 'legenda': g.get('legenda', ''), 'alt': g.get('alt', ''),
            'w': g.get('w'), 'h': g.get('h')} for g in (f.get('galeria') or []) if g.get('f')]
    return {'perfil': {'src': '/api/fotos/' + p['f'], 'alt': p.get('alt', ''), 'w': p.get('w'), 'h': p.get('h')} if p.get('f') else None,
            'galeria': gal}


def site_publico(c):
    rs = c.execute('SELECT estrelas, texto, nome, piercing, criado FROM avaliacoes WHERE visivel=1 ORDER BY criado DESC').fetchall()
    n = len(rs)
    media = round(sum(r['estrelas'] for r in rs) / n, 1) if n else None
    lista = [{'estrelas': r['estrelas'], 'texto': r['texto'], 'nome': r['nome'], 'piercing': r['piercing'],
              'quando': dt.date.fromtimestamp(r['criado']).isoformat()} for r in rs[:24]]
    joias = []
    for r in c.execute('SELECT * FROM joias WHERE visivel=1 ORDER BY ordem, id').fetchall():
        q = r['quantidade']
        joias.append({'id': r['id'], 'nome': r['nome'], 'material': r['material'], 'preco': r['preco'],
                      'foto': '/api/fotos/' + r['foto'] if r['foto'] else '',
                      'estado': '' if q is None else ('esgotada' if q <= 0 else ('poucas' if q <= 2 else 'ok'))})
    servs = [{k: s[k] for k in ('id', 'cat', 'pt', 'en', 'preco', 'desde', 'cic_pt', 'cic_en')} for s in CFG['servicos'] if s.get('visivel', True)]
    ct = CFG['contactos']
    return {'versao': CFG['versao'], 'servicos': servs, 'nota': CFG['nota'], 'duracao': CFG['duracao'],
            'dias': dias_publicos(c), 'fotos': fotos_publicas(), 'joias': joias,
            'contactos': {'whatsapp': ct['whatsapp'], 'instagram': ct['instagram'], 'email': ct['email']},
            'avaliacoes': {'n': n, 'media': media, 'lista': lista}, 'google': CFG['google']}


def limpeza():
    while True:
        try:
            c = ligar()
            corte = (dt.date.today() - dt.timedelta(days=365)).isoformat()
            corte_t = int(time.time()) - 365 * 86400
            c.execute("DELETE FROM pedidos WHERE (data<>'' AND data < ?) OR (data='' AND criado < ?)", (corte, corte_t))
            c.execute('DELETE FROM sessoes WHERE expira < ?', (int(time.time()),))
            c.execute('DELETE FROM dias WHERE data < ?', ((dt.date.today() - dt.timedelta(days=30)).isoformat(),))
            # pedidos sem resposta cujo dia já passou deixam de contar como ativos
            hoje = dt.date.today().isoformat()
            for r in c.execute("SELECT id, historico FROM pedidos WHERE estado='pendente' AND ((data<>'' AND data < ?) OR (data='' AND criado < ?))",
                               (hoje, int(time.time()) - 45 * 86400)).fetchall():
                hist = json.loads(r['historico'] or '[]') + [{'t': int(time.time()), 'o': 'fechado: ficou sem resposta'}]
                c.execute("UPDATE pedidos SET estado='cancelada', motivo='Sem resposta a tempo.', historico=? WHERE id=?", (json.dumps(hist), r['id']))
            c.close()
        except Exception:
            pass
        time.sleep(6 * 3600)


def publico(c, r):
    ids = json.loads(r['servicos'])
    idi = r['idioma'] if r['idioma'] in IDIOMAS else 'pt'
    e = c.execute('SELECT * FROM estudios WHERE id=?', (r['estudio'],)).fetchone() if r['estudio'] else None
    d = {'codigo': r['codigo'], 'estado': r['estado'], 'data': r['data'], 'hora': r['hora'], 'servicos': nomes(ids, idi),
         'total': r['total'], 'desde': bool(r['desde']), 'motivo': r['motivo'], 'idioma': idi}
    if e and r['estado'] == 'confirmada':
        d['estudio'] = estudio_dict(e)  # a morada só aparece quando está confirmado
    return d


def completo(c, r):
    d = dict(r)
    d['servicos_ids'] = json.loads(r['servicos'])
    d['servicos'] = nomes(d['servicos_ids'], 'pt')
    d['preferencias'] = json.loads(r['preferencias'] or '{}')
    d['historico'] = json.loads(r['historico'] or '[]')
    d['desde'] = bool(r['desde'])
    return d


def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:24] or 'servico'


class H(BaseHTTPRequestHandler):
    server_version = 'agenda'
    sys_version = ''

    def log_message(self, *a):
        pass  # sem registos com dados pessoais

    def ip(self):
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

    def sessao(self):
        m = re.search(r'(?:^|;\s*)' + COOKIE + r'=([A-Za-z0-9_\-]{30,100})', self.headers.get('Cookie') or '')
        return m.group(1) if m else None

    def admin(self, c):
        t = self.sessao()
        return bool(t) and c.execute('SELECT 1 FROM sessoes WHERE h=? AND expira>?', (h(t), int(time.time()))).fetchone() is not None

    # ---------- GET ----------
    def do_GET(self):
        caminho, _, q = self.path.partition('?')
        args = dict(urllib.parse.parse_qsl(q))
        c = ligar()
        try:
            if caminho == '/api/saude':
                return self.responder(200, {'ok': True})
            if caminho == '/api/site':
                if not limite('site:' + self.ip(), 300, 600):
                    return self.erro(429, 'limite')
                return self.responder(200, site_publico(c), cache='no-cache')
            m = re.fullmatch(r'/api/fotos/((?:perfil|galeria|joia\d{1,6})-[A-Za-z0-9_\-]{8,24}\.(webp|jpg))', caminho)
            if m:
                return self.ficheiro_foto(m.group(1), m.group(2))
            m = re.fullmatch(r'/api/pedidos/([A-Za-z0-9_\-]{10,20})', caminho)
            if m:
                if not limite('estado:' + self.ip(), 60, 600):
                    return self.erro(429, 'limite')
                r = c.execute('SELECT * FROM pedidos WHERE codigo=?', (m.group(1),)).fetchone()
                return self.responder(200, publico(c, r)) if r else self.erro(404, 'nao_existe')
            if caminho.startswith('/api/admin/'):
                if not self.admin(c):
                    return self.erro(401, 'sem_sessao')
                if caminho == '/api/admin/estado':
                    return self.responder(200, {'ok': True})
                if caminho == '/api/admin/pedidos':
                    hoje = dt.date.today()
                    corte = (hoje - dt.timedelta(days=120)).isoformat()
                    rs = c.execute("SELECT * FROM pedidos WHERE (data='' AND criado>?) OR data>=? ORDER BY CASE WHEN data='' THEN 0 ELSE 1 END, data, hora, criado",
                                   (int(time.time()) - 120 * 86400, corte)).fetchall()
                    return self.responder(200, {'pedidos': [completo(c, r) for r in rs], 'hoje': hoje.isoformat(),
                                                'servicos': CFG['servicos'], 'dias': dias_publicos(c, admin=True),
                                                'estudios': [estudio_dict(e) for e in c.execute('SELECT * FROM estudios ORDER BY ativo DESC, nome')]})
                if caminho == '/api/admin/dias':
                    return self.responder(200, {'dias': dias_publicos(c, admin=True), 'duracao': CFG['duracao'], 'duracoes': list(DURACOES),
                                                'estudios': [estudio_dict(e) for e in c.execute('SELECT * FROM estudios ORDER BY ativo DESC, nome')]})
                if caminho == '/api/admin/config':
                    d = site_publico(c)
                    d.update(servicos=CFG['servicos'], contactos=CFG['contactos'], categorias=list(CATEGORIAS))
                    return self.responder(200, d)
                if caminho == '/api/admin/avaliacoes':
                    av = c.execute('SELECT * FROM avaliacoes ORDER BY criado DESC').fetchall()
                    cv = c.execute('SELECT id, criado, expira, nome, piercing, idioma, usado FROM convites ORDER BY criado DESC LIMIT 60').fetchall()
                    return self.responder(200, {'avaliacoes': [dict(r) for r in av], 'convites': [dict(r) for r in cv],
                                                'agora': int(time.time()), 'google': CFG['google']})
                if caminho == '/api/admin/joias':
                    rs = c.execute('SELECT * FROM joias ORDER BY ordem, id').fetchall()
                    return self.responder(200, {'joias': [dict(r, visivel=bool(r['visivel']), foto_src='/api/fotos/' + r['foto'] if r['foto'] else '') for r in rs]})
                if caminho == '/api/admin/numeros':
                    try:
                        dias = max(7, min(365, int(args.get('dias', '30'))))
                    except ValueError:
                        dias = 30
                    return self.responder(200, {'negocio': self.numeros(c, dias), 'site': numeros_site(dias), 'dias': dias})
            return self.erro(404, 'nao_existe')
        finally:
            c.close()

    # ---------- POST ----------
    def do_POST(self):
        if not self.origem_ok():
            return self.erro(403, 'origem')
        caminho = self.path.split('?')[0]
        m = re.fullmatch(r'/api/admin/fotos/(perfil|galeria|joia\d{1,6})', caminho)
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
            if caminho == '/api/pedidos':
                return self.criar(c, corpo)
            if caminho == '/api/convite':
                return self.ver_convite(c, corpo)
            if caminho == '/api/avaliacoes':
                return self.avaliar(c, corpo)
            m = re.fullmatch(r'/api/pedidos/([A-Za-z0-9_\-]{10,20})/cancelar', caminho)
            if m:
                return self.cancelar_cliente(c, m.group(1))
            if caminho == '/api/admin/entrar':
                return self.entrar(c, corpo)
            if not caminho.startswith('/api/admin/'):
                return self.erro(404, 'nao_existe')
            if not self.admin(c):
                return self.erro(401, 'sem_sessao')
            if caminho == '/api/admin/sair':
                t = self.sessao()
                if t:
                    c.execute('DELETE FROM sessoes WHERE h=?', (h(t),))
                return self.responder(200, {'ok': True}, [('Set-Cookie', COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')])
            if caminho == '/api/admin/senha':
                return self.mudar_senha(c, corpo)
            m = re.fullmatch(r'/api/admin/pedidos/(\d+)/acao', caminho)
            if m:
                return self.acao(c, int(m.group(1)), corpo)
            if caminho == '/api/admin/pedidos':
                return self.criar(c, corpo, admin=True)
            if caminho == '/api/admin/dias':
                return self.criar_dias(c, corpo)
            m = re.fullmatch(r'/api/admin/dias/(\d+)(/apagar)?', caminho)
            if m:
                return self.mexer_dia(c, int(m.group(1)), bool(m.group(2)), corpo)
            if caminho == '/api/admin/estudios':
                return self.guardar_estudio(c, corpo, None)
            m = re.fullmatch(r'/api/admin/estudios/(\d+)', caminho)
            if m:
                return self.guardar_estudio(c, corpo, int(m.group(1)))
            if caminho == '/api/admin/servicos':
                return self.guardar_servicos(c, corpo)
            if caminho == '/api/admin/nota':
                return self.guardar_nota(c, corpo)
            if caminho == '/api/admin/contactos':
                return self.guardar_contactos(c, corpo)
            if caminho == '/api/admin/duracao':
                if corpo.get('duracao') not in DURACOES:
                    return self.erro(422, 'campos', campos={'duracao': 'Escolhe 30, 45, 60, 90 ou 120 minutos.'})
                cfg_set(c, 'duracao', corpo['duracao'])
                return self.responder(200, {'duracao': CFG['duracao']})
            if caminho == '/api/admin/google':
                url = limpar_texto(corpo.get('url'), 300)
                if url and not re.fullmatch(r'https://[^\s<>"\'`]+', url):
                    return self.erro(422, 'campos', campos={'url': 'Cola o link completo, a começar por https://'})
                cfg_set(c, 'google', url)
                return self.responder(200, {'google': url})
            m = re.fullmatch(r'/api/admin/fotos/(perfil|galeria)(?:/(\d{1,3}))?/(texto|apagar|mover)', caminho)
            if m:
                return self.mexer_foto(c, m.group(1), int(m.group(2)) if m.group(2) else None, m.group(3), corpo)
            m = re.fullmatch(r'/api/admin/fotos/joia(\d{1,6})/apagar', caminho)
            if m:
                return self.joia_foto_apagar(c, int(m.group(1)))
            if caminho == '/api/admin/joias':
                return self.guardar_joia(c, corpo, None)
            m = re.fullmatch(r'/api/admin/joias/(\d+)(/apagar)?', caminho)
            if m:
                if m.group(2):
                    r = c.execute('SELECT foto FROM joias WHERE id=?', (int(m.group(1)),)).fetchone()
                    c.execute('DELETE FROM joias WHERE id=?', (int(m.group(1)),))
                    if r:
                        self.apagar_ficheiro(r['foto'])
                    return self.responder(200, {'ok': True})
                return self.guardar_joia(c, corpo, int(m.group(1)))
            if caminho == '/api/admin/convites':
                return self.criar_convite(c, corpo)
            m = re.fullmatch(r'/api/admin/convites/(\d+)/apagar', caminho)
            if m:
                c.execute('DELETE FROM convites WHERE id=? AND usado=0', (int(m.group(1)),))
                return self.responder(200, {'ok': True})
            m = re.fullmatch(r'/api/admin/avaliacoes/(\d+)/visivel', caminho)
            if m:
                if not isinstance(corpo.get('visivel'), bool):
                    return self.erro(400, 'pedido_invalido')
                c.execute('UPDATE avaliacoes SET visivel=? WHERE id=?', (1 if corpo['visivel'] else 0, int(m.group(1))))
                return self.responder(200, {'ok': True})
            return self.erro(404, 'nao_existe')
        finally:
            c.close()

    # ---------- pedidos ----------
    def validar(self, c, corpo, admin):
        erros = {}
        ids = corpo.get('servicos', [])
        if not isinstance(ids, list) or len(ids) > MAX_SERVICOS or len(set(ids)) != len(ids) or any(i not in CFG['por_id'] for i in ids):
            erros['servicos'] = 'Escolhe até %d piercings ou serviços da lista.' % MAX_SERVICOS
            ids = []
        notas = limpar_texto(corpo.get('notas'), 600)
        if not ids and len(notas) < 3:
            erros['servicos'] = 'Escolhe pelo menos um piercing na lista ou escreve o que queres.'
        data = corpo.get('data') if isinstance(corpo.get('data'), str) else ''
        hora = corpo.get('hora') if isinstance(corpo.get('hora'), str) else ''
        pref = corpo.get('preferencias') if isinstance(corpo.get('preferencias'), dict) else {}
        p_dias = pref.get('dias') if isinstance(pref.get('dias'), list) else []
        p_per = pref.get('periodos') if isinstance(pref.get('periodos'), list) else []
        p_txt = limpar_texto(pref.get('texto'), 120)
        if any(type(x) is not int or not 0 <= x <= 6 for x in p_dias) or any(x not in PERIODOS for x in p_per):
            erros['quando'] = 'Preferências inválidas.'
        preferencias = {'dias': sorted(set(x for x in p_dias if type(x) is int)), 'periodos': [x for x in PERIODOS if x in p_per], 'texto': p_txt}
        if data or hora:
            if not hora_livre(c, data, hora, admin=admin):
                erros['quando'] = 'Essa hora já não está livre. Escolhe outra ou diz-me que dias preferes.'
        elif not admin and not (preferencias['dias'] or preferencias['periodos'] or p_txt):
            erros['quando'] = 'Escolhe uma das horas livres ou diz-me que dias te dão jeito.'
        nome = limpar_texto(corpo.get('nome'), 80)
        if len(nome) < 2 or not RE_NOME.match(nome):
            erros['nome'] = 'Escreve o teu nome (só letras).'
        tel = tel_normal(corpo.get('tel'))
        if not tel:
            erros['tel'] = 'Escreve o teu número com o indicativo (ex.: +351 912 345 678).'
        email = ''
        if str(corpo.get('email') or '').strip():
            email = email_normal(corpo.get('email'))
            if not email:
                erros['email'] = 'Esse email não parece certo. Podes deixar em branco.'
        idioma = corpo.get('idioma') if corpo.get('idioma') in IDIOMAS else 'pt'
        if not admin and corpo.get('idade') is not True:
            erros['idade'] = 'Confirma a idade para continuar.'
        estudio = None
        if admin and corpo.get('estudio') is not None:
            if type(corpo.get('estudio')) is not int or not c.execute('SELECT 1 FROM estudios WHERE id=?', (corpo['estudio'],)).fetchone():
                erros['estudio'] = 'Escolhe um estúdio da lista.'
            else:
                estudio = corpo['estudio']
        return dict(ids=ids, data=data if data and hora else '', hora=hora if data and hora else '', pref=preferencias, nome=nome,
                    tel=tel, email=email or '', idioma=idioma, notas=notas, estudio=estudio), erros

    def criar(self, c, corpo, admin=False):
        ip = self.ip()
        if not admin:
            if corpo.get('empresa'):
                return self.erro(400, 'pedido_invalido')
            try:
                ms = int(corpo.get('ms') or 0)
            except (TypeError, ValueError):
                ms = 0
            if ms < 3000:
                return self.erro(400, 'muito_rapido')
            if not limite('p-ip:' + ip, 4, 600) or not limite('p-ip-dia:' + ip, 10, 86400):
                return self.erro(429, 'limite')
        dados, erros = self.validar(c, corpo, admin)
        if erros:
            return self.erro(422, 'campos', campos=erros)
        if not admin:
            if not limite('p-tel:' + dados['tel'], 3, 86400):
                return self.erro(429, 'limite')
            hoje = dt.date.today().isoformat()
            if c.execute("SELECT 1 FROM pedidos WHERE tel=? AND estado IN ('pendente','confirmada') AND (data='' OR data>=?)", (dados['tel'], hoje)).fetchone():
                return self.erro(409, 'ja_tens_pedido')
            if c.execute("SELECT COUNT(*) FROM pedidos WHERE estado='pendente'").fetchone()[0] >= TETO_PENDENTES:
                return self.erro(503, 'cheio')
        estudio = dados['estudio']
        if dados['data'] and estudio is None:
            dia = c.execute('SELECT estudio FROM dias WHERE data=?', (dados['data'],)).fetchone()
            estudio = dia['estudio'] if dia else None
        agora = int(time.time())
        estado = 'confirmada' if admin and corpo.get('confirmada', True) and dados['data'] else 'pendente'
        codigo = secrets.token_urlsafe(9)
        tot, desde = total_de(dados['ids'])
        hist = [{'t': agora, 'o': 'criado pela Dayla' if admin else 'pedido pelo site'}]
        try:
            c.execute('BEGIN IMMEDIATE')
            c.execute('INSERT INTO pedidos(codigo, criado, atualizado, estado, data, hora, estudio, servicos, total, desde, nome, tel, email, idioma,'
                      ' preferencias, notas, origem, historico) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                      (codigo, agora, agora, estado, dados['data'], dados['hora'], estudio, json.dumps(dados['ids']), tot, int(desde),
                       dados['nome'], dados['tel'], dados['email'], dados['idioma'], json.dumps(dados['pref'], ensure_ascii=False),
                       dados['notas'], 'dayla' if admin else 'site', json.dumps(hist)))
            c.execute('COMMIT')
        except sqlite3.IntegrityError:
            c.execute('ROLLBACK')
            return self.erro(409, 'hora_ocupada')
        r = c.execute('SELECT * FROM pedidos WHERE codigo=?', (codigo,)).fetchone()
        return self.responder(201, completo(c, r) if admin else publico(c, r))

    def cancelar_cliente(self, c, codigo):
        if not limite('canc:' + self.ip(), 10, 3600):
            return self.erro(429, 'limite')
        r = c.execute('SELECT * FROM pedidos WHERE codigo=?', (codigo,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        if r['estado'] not in ATIVOS or (r['data'] and r['data'] < dt.date.today().isoformat()):
            return self.erro(409, 'nao_da')
        hist = json.loads(r['historico'] or '[]') + [{'t': int(time.time()), 'o': 'cancelado pelo cliente no site'}]
        c.execute("UPDATE pedidos SET estado='cancelada', motivo='Cancelado no site.', atualizado=?, historico=? WHERE id=?",
                  (int(time.time()), json.dumps(hist), r['id']))
        return self.responder(200, publico(c, c.execute('SELECT * FROM pedidos WHERE id=?', (r['id'],)).fetchone()))

    def entrar(self, c, corpo):
        if not limite('login:' + self.ip(), 6, 900) or not limite('login-todos', 40, 900):
            return self.erro(429, 'limite')
        senha = corpo.get('senha') if isinstance(corpo.get('senha'), str) else ''
        if not CFG['senha'] or not senha or len(senha) > 200 or not confere_senha(senha, CFG['senha']):
            time.sleep(0.6)
            return self.erro(401, 'senha_errada')
        t = secrets.token_urlsafe(32)
        c.execute('INSERT INTO sessoes(h, expira) VALUES(?, ?)', (h(t), int(time.time()) + SESSAO_H * 3600))
        ck = '%s=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Strict' % (COOKIE, t, SESSAO_H * 3600)
        return self.responder(200, {'ok': True}, [('Set-Cookie', ck)])

    def mudar_senha(self, c, corpo):
        if not limite('senha:' + self.ip(), 5, 900):
            return self.erro(429, 'limite')
        atual, nova = corpo.get('atual'), corpo.get('nova')
        if not isinstance(atual, str) or not confere_senha(atual, CFG['senha']):
            time.sleep(0.6)
            return self.erro(422, 'campos', campos={'atual': 'A password atual não está certa.'})
        if not isinstance(nova, str) or not 10 <= len(nova) <= 200:
            return self.erro(422, 'campos', campos={'nova': 'A password nova precisa de pelo menos 10 caracteres.'})
        cfg_set(c, 'senha_hash', hash_senha(nova))
        t = self.sessao()
        c.execute('DELETE FROM sessoes WHERE h<>?', (h(t or ''),))  # fecha as sessões dos outros aparelhos
        return self.responder(200, {'ok': True})

    def acao(self, c, pid, corpo):
        r = c.execute('SELECT * FROM pedidos WHERE id=?', (pid,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        a = corpo.get('acao')
        agora = int(time.time())
        hist = json.loads(r['historico'] or '[]')[-60:]
        if a == 'mensagem':
            tipo = limpar_texto(corpo.get('tipo'), 20)
            if not re.fullmatch(r'[a-z]{3,20}', tipo or ''):
                return self.erro(400, 'acao_invalida')
            hist.append({'t': agora, 'o': 'mensagem: ' + tipo, 'msg': tipo})
            c.execute('UPDATE pedidos SET historico=? WHERE id=?', (json.dumps(hist), pid))
            return self.responder(200, completo(c, c.execute('SELECT * FROM pedidos WHERE id=?', (pid,)).fetchone()))
        if a == 'notas':
            c.execute('UPDATE pedidos SET notas=?, atualizado=? WHERE id=?', (limpar_texto(corpo.get('notas'), 600), agora, pid))
            return self.responder(200, completo(c, c.execute('SELECT * FROM pedidos WHERE id=?', (pid,)).fetchone()))
        if a == 'servicos':
            ids = corpo.get('servicos')
            if not isinstance(ids, list) or len(ids) > MAX_SERVICOS or len(set(ids)) != len(ids) or any(i not in CFG['por_id'] for i in ids):
                return self.erro(422, 'campos', campos={'servicos': 'Lista inválida.'})
            tot, desde = total_de(ids)
            if type(corpo.get('total')) is int and 0 <= corpo['total'] <= 5000:
                tot, desde = corpo['total'], False  # valor combinado com o cliente
            hist.append({'t': agora, 'o': 'piercings ou valor alterados'})
            c.execute('UPDATE pedidos SET servicos=?, total=?, desde=?, atualizado=?, historico=? WHERE id=?',
                      (json.dumps(ids), tot, int(desde), agora, json.dumps(hist), pid))
            return self.responder(200, completo(c, c.execute('SELECT * FROM pedidos WHERE id=?', (pid,)).fetchone()))
        motivo = limpar_texto(corpo.get('motivo'), 300)
        permitido = {'confirmar': ATIVOS, 'recusar': ('pendente',), 'cancelar': ATIVOS, 'concluir': ('confirmada',),
                     'faltou': ('confirmada',), 'reabrir': ('recusada', 'cancelada', 'faltou', 'concluida')}
        if a not in permitido:
            return self.erro(400, 'acao_invalida')
        if r['estado'] not in permitido[a]:
            return self.erro(409, 'estado', estado=r['estado'])
        data, hora, estudio = r['data'], r['hora'], r['estudio']
        if a == 'confirmar':
            data = corpo.get('data') if isinstance(corpo.get('data'), str) else data
            hora = corpo.get('hora') if isinstance(corpo.get('hora'), str) else hora
            if not hora_livre(c, data, hora, admin=True, ignorar=pid):
                return self.erro(422, 'campos', campos={'quando': 'Escolhe um dia e uma hora no futuro que ainda estejam livres.'})
            est = corpo.get('estudio', estudio)
            if type(est) is not int or not c.execute('SELECT 1 FROM estudios WHERE id=?', (est,)).fetchone():
                return self.erro(422, 'campos', campos={'estudio': 'Escolhe o estúdio.'})
            estudio = est
            o = 'confirmada para %s %s' % (data, hora) if r['estado'] == 'pendente' else 'mudada de %s %s para %s %s' % (r['data'], r['hora'], data, hora)
            hist.append({'t': agora, 'o': o})
            novo = 'confirmada'
        elif a == 'reabrir':
            novo = 'pendente'
            hist.append({'t': agora, 'o': 'reaberto'})
            if data and not hora_livre(c, data, hora, admin=True, ignorar=pid):
                data, hora = '', ''  # a hora entretanto foi para outra pessoa: volta a pedido sem hora
        else:
            novo = {'recusar': 'recusada', 'cancelar': 'cancelada', 'concluir': 'concluida', 'faltou': 'faltou'}[a]
            hist.append({'t': agora, 'o': {'recusar': 'recusado', 'cancelar': 'cancelado', 'concluir': 'feito', 'faltou': 'faltou'}[a] + (': ' + motivo if motivo else '')})
        try:
            c.execute('BEGIN IMMEDIATE')
            c.execute('UPDATE pedidos SET estado=?, data=?, hora=?, estudio=?, motivo=?, atualizado=?, historico=? WHERE id=?',
                      (novo, data, hora, estudio, motivo if a in ('recusar', 'cancelar') else ('' if a in ('confirmar', 'reabrir') else r['motivo']),
                       agora, json.dumps(hist), pid))
            c.execute('COMMIT')
        except sqlite3.IntegrityError:
            c.execute('ROLLBACK')
            return self.erro(409, 'hora_ocupada')
        return self.responder(200, completo(c, c.execute('SELECT * FROM pedidos WHERE id=?', (pid,)).fetchone()))

    # ---------- dias e estúdios ----------
    def criar_dias(self, c, corpo):
        datas = corpo.get('datas')
        abre, fecha, est = corpo.get('abre'), corpo.get('fecha'), corpo.get('estudio')
        erros = {}
        if not isinstance(datas, list) or not 1 <= len(datas) <= 60 or not all(data_ok(d) for d in datas):
            erros['datas'] = 'Escolhe pelo menos um dia.'
        elif any(data_ok(d) < dt.date.today() for d in datas):
            erros['datas'] = 'Só dá para dias de hoje em diante.'
        if not (isinstance(abre, str) and isinstance(fecha, str) and RE_HORA.match(abre) and RE_HORA.match(fecha)) \
                or minutos(fecha) - minutos(abre) < CFG['duracao']:
            erros['horas'] = 'A hora de fim tem de ficar pelo menos %d minutos depois do início.' % CFG['duracao']
        if est is not None and (type(est) is not int or not c.execute('SELECT 1 FROM estudios WHERE id=?', (est,)).fetchone()):
            erros['estudio'] = 'Escolhe um estúdio da lista.'
        if erros:
            return self.erro(422, 'campos', campos=erros)
        agora = int(time.time())
        for d in datas:
            c.execute('INSERT INTO dias(data, abre, fecha, estudio, criado) VALUES(?,?,?,?,?) ON CONFLICT(data) DO UPDATE SET '
                      'abre=excluded.abre, fecha=excluded.fecha, estudio=excluded.estudio', (d, abre, fecha, est, agora))
        carregar_cfg(c)
        return self.responder(200, {'dias': dias_publicos(c, admin=True)})

    def mexer_dia(self, c, did, apagar, corpo):
        r = c.execute('SELECT * FROM dias WHERE id=?', (did,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        if apagar:
            c.execute('DELETE FROM dias WHERE id=?', (did,))
        else:
            abre, fecha, est = corpo.get('abre', r['abre']), corpo.get('fecha', r['fecha']), corpo.get('estudio', r['estudio'])
            if not (isinstance(abre, str) and isinstance(fecha, str) and RE_HORA.match(abre) and RE_HORA.match(fecha)) \
                    or minutos(fecha) - minutos(abre) < CFG['duracao']:
                return self.erro(422, 'campos', campos={'horas': 'A hora de fim tem de ficar pelo menos %d minutos depois do início.' % CFG['duracao']})
            if est is not None and (type(est) is not int or not c.execute('SELECT 1 FROM estudios WHERE id=?', (est,)).fetchone()):
                return self.erro(422, 'campos', campos={'estudio': 'Escolhe um estúdio da lista.'})
            c.execute('UPDATE dias SET abre=?, fecha=?, estudio=? WHERE id=?', (abre, fecha, est, did))
        carregar_cfg(c)
        return self.responder(200, {'dias': dias_publicos(c, admin=True)})

    def guardar_estudio(self, c, corpo, eid):
        v = {k: limpar_texto(corpo.get(k), n) for k, n in (('nome', 60), ('rua', 90), ('cp', 8), ('cidade', 40), ('zona', 40))}
        erros = {}
        if len(v['nome']) < 2:
            erros['nome'] = 'Escreve o nome do estúdio.'
        if v['cp'] and not re.fullmatch(r'\d{4}-\d{3}', v['cp']):
            erros['cp'] = 'O código postal tem o formato 4000-123.'
        v['cidade'] = v['cidade'] or 'Porto'
        ativo = 0 if corpo.get('ativo') is False else 1
        if erros:
            return self.erro(422, 'campos', campos=erros)
        if eid is None:
            if c.execute('SELECT COUNT(*) FROM estudios').fetchone()[0] >= 40:
                return self.erro(409, 'limite')
            cur = c.execute('INSERT INTO estudios(nome, rua, cp, cidade, zona, ativo) VALUES(?,?,?,?,?,?)',
                            (v['nome'], v['rua'], v['cp'], v['cidade'], v['zona'], ativo))
            eid = cur.lastrowid
        else:
            if not c.execute('SELECT 1 FROM estudios WHERE id=?', (eid,)).fetchone():
                return self.erro(404, 'nao_existe')
            c.execute('UPDATE estudios SET nome=?, rua=?, cp=?, cidade=?, zona=?, ativo=? WHERE id=?',
                      (v['nome'], v['rua'], v['cp'], v['cidade'], v['zona'], ativo, eid))
        carregar_cfg(c)
        return self.responder(200, estudio_dict(c.execute('SELECT * FROM estudios WHERE id=?', (eid,)).fetchone()))

    # ---------- site: serviços, textos, contactos ----------
    def guardar_servicos(self, c, corpo):
        lista = corpo.get('servicos')
        if not isinstance(lista, list) or not 1 <= len(lista) <= 80:
            return self.erro(422, 'campos', campos={'servicos': 'Lista inválida.'})
        limpo, vistos, erros = [], set(), {}
        for n, s in enumerate(lista):
            if not isinstance(s, dict):
                return self.erro(422, 'campos', campos={'servicos': 'Lista inválida.'})
            pt, en = limpar_texto(s.get('pt'), 60), limpar_texto(s.get('en'), 60)
            if len(pt) < 2:
                erros['pt%d' % n] = 'Escreve o nome em português.'
            sid = s.get('id') if isinstance(s.get('id'), str) and re.fullmatch(r'[a-z0-9\-]{2,40}', s.get('id')) else None
            if not sid:
                sid = slug(pt) + '-' + secrets.token_hex(2)
            if sid in vistos:
                return self.erro(422, 'campos', campos={'servicos': 'Há serviços repetidos.'})
            vistos.add(sid)
            p = s.get('preco')
            if p is not None and (type(p) is not int or not 0 <= p <= 999):
                erros['preco%d' % n] = 'O preço é um número inteiro de 0 a 999 €, ou fica vazio.'
            cat = s.get('cat') if s.get('cat') in CATEGORIAS else 'servicos'
            limpo.append({'id': sid, 'cat': cat, 'pt': pt, 'en': en or pt, 'preco': p, 'desde': s.get('desde') is True,
                          'cic_pt': limpar_texto(s.get('cic_pt'), 30), 'cic_en': limpar_texto(s.get('cic_en'), 30),
                          'visivel': s.get('visivel') is not False})
        if erros:
            return self.erro(422, 'campos', campos=erros)
        # a ordem por categoria é a do site
        limpo.sort(key=lambda s: CATEGORIAS.index(s['cat']))
        cfg_set(c, 'servicos', limpo)
        return self.responder(200, {'servicos': CFG['servicos']})

    def guardar_nota(self, c, corpo):
        pt, en = limpar_texto(corpo.get('pt'), 240), limpar_texto(corpo.get('en'), 240)
        cfg_set(c, 'nota_precos', {'pt': pt or NOTA_PADRAO['pt'], 'en': en or NOTA_PADRAO['en']})
        return self.responder(200, {'nota': CFG['nota']})

    def guardar_contactos(self, c, corpo):
        erros = {}
        wa = tel_normal(corpo.get('whatsapp'))
        if not wa:
            erros['whatsapp'] = 'Escreve o número com o indicativo (ex.: +351 930 514 346).'
        ig = re.sub(r'^@|^https?://(www\.)?instagram\.com/|/$', '', limpar_texto(corpo.get('instagram'), 80))
        if ig and not re.fullmatch(r'[A-Za-z0-9._]{1,30}', ig):
            erros['instagram'] = 'Escreve só o nome do Instagram, sem @.'
        em = ''
        if str(corpo.get('email') or '').strip():
            em = email_normal(corpo.get('email'))
            if not em:
                erros['email'] = 'Esse email não parece certo. Podes deixar em branco.'
        if erros:
            return self.erro(422, 'campos', campos=erros)
        cfg_set(c, 'contactos', {'whatsapp': wa, 'instagram': ig, 'email': em or ''})
        return self.responder(200, {'contactos': CFG['contactos']})

    # ---------- fotos ----------
    def enviar_foto(self, c, slot):
        self.close_connection = True  # o corpo pode não ser lido todo quando se recusa
        jm = re.fullmatch(r'joia(\d{1,6})', slot)
        jr = None
        if jm:
            jr = c.execute('SELECT * FROM joias WHERE id=?', (int(jm.group(1)),)).fetchone()
            if not jr:
                return self.erro(404, 'nao_existe')
        if slot == 'galeria' and len(CFG['fotos'].get('galeria') or []) >= MAX_GALERIA:
            return self.erro(409, 'limite')
        if not limite('foto:' + self.ip(), 60, 3600):
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
        try:
            w = max(1, min(8000, int(self.headers.get('X-Largura') or 0))) if self.headers.get('X-Largura') else None
            hh = max(1, min(8000, int(self.headers.get('X-Altura') or 0))) if self.headers.get('X-Altura') else None
        except ValueError:
            w = hh = None
        nome = '%s-%s.%s' % (slot, secrets.token_urlsafe(9), ext)
        tmp = os.path.join(FOTOS, nome + '.tmp')
        with open(tmp, 'wb') as f:
            f.write(dados)
        os.replace(tmp, os.path.join(FOTOS, nome))
        if jr:
            c.execute('UPDATE joias SET foto=?, atualizado=? WHERE id=?', (nome, int(time.time()), jr['id']))
            self.apagar_ficheiro(jr['foto'])
            return self.responder(200, {'ok': True, 'foto_src': '/api/fotos/' + nome})
        fotos = json.loads(json.dumps(CFG['fotos']))
        if slot == 'perfil':
            antigo = (fotos.get('perfil') or {}).get('f')
            fotos['perfil'] = dict(fotos.get('perfil') or {}, f=nome, w=w, h=hh)
            cfg_set(c, 'fotos', fotos)
            self.apagar_ficheiro(antigo)
        else:
            fotos.setdefault('galeria', []).insert(0, {'f': nome, 'legenda': '', 'alt': '', 'w': w, 'h': hh})
            cfg_set(c, 'fotos', fotos)
        return self.responder(200, {'fotos': fotos_publicas()})

    def mexer_foto(self, c, slot, n, acao, corpo):
        fotos = json.loads(json.dumps(CFG['fotos']))
        if slot == 'perfil':
            p = fotos.get('perfil') or {}
            if acao == 'apagar':
                fotos.pop('perfil', None)
                cfg_set(c, 'fotos', fotos)
                self.apagar_ficheiro(p.get('f'))
            elif acao == 'texto':
                fotos['perfil'] = dict(p, alt=limpar_texto(corpo.get('alt'), 160))
                cfg_set(c, 'fotos', fotos)
            else:
                return self.erro(400, 'acao_invalida')
            return self.responder(200, {'fotos': fotos_publicas()})
        gal = fotos.get('galeria') or []
        if n is None or not 0 <= n < len(gal):
            return self.erro(404, 'nao_existe')
        if acao == 'apagar':
            g = gal.pop(n)
            self.apagar_ficheiro(g.get('f'))
        elif acao == 'texto':
            gal[n] = dict(gal[n], legenda=limpar_texto(corpo.get('legenda'), 120), alt=limpar_texto(corpo.get('alt'), 160))
        else:
            para = corpo.get('para')
            if type(para) is not int or not 0 <= para < len(gal):
                return self.erro(422, 'campos', campos={'para': 'Posição inválida.'})
            gal.insert(para, gal.pop(n))
        fotos['galeria'] = gal
        cfg_set(c, 'fotos', fotos)
        return self.responder(200, {'fotos': fotos_publicas()})

    def apagar_ficheiro(self, nome):
        if nome and re.fullmatch(r'(?:perfil|galeria|joia\d{1,6})-[A-Za-z0-9_\-]{8,24}\.(webp|jpg)', nome):
            try:
                os.remove(os.path.join(FOTOS, nome))
            except OSError:
                pass

    def ficheiro_foto(self, nome, ext):
        try:
            with open(os.path.join(FOTOS, nome), 'rb') as f:
                dados = f.read()
        except OSError:
            return self.erro(404, 'nao_existe')
        self.send_response(200)
        self.send_header('Content-Type', 'image/webp' if ext == 'webp' else 'image/jpeg')
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')  # o nome muda quando a foto muda
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    # ---------- joias ----------
    def guardar_joia(self, c, corpo, jid):
        erros, v = {}, {}
        nome = limpar_texto(corpo.get('nome'), 50)
        if len(nome) < 2:
            erros['nome'] = 'Escreve o nome da joia.'
        v['nome'] = nome
        v['material'] = limpar_texto(corpo.get('material'), 40)
        p = corpo.get('preco')
        if p is not None and (type(p) is not int or not 0 <= p <= 999):
            erros['preco'] = 'O preço é um número de 0 a 999 €, ou fica em branco.'
        v['preco'] = p
        q = corpo.get('quantidade')
        if q is not None and (type(q) is not int or not 0 <= q <= 999):
            erros['quantidade'] = 'A quantidade vai de 0 a 999, ou fica em branco para não contar.'
        v['quantidade'] = q
        v['visivel'] = 0 if corpo.get('visivel') is False else 1
        if erros:
            return self.erro(422, 'campos', campos=erros)
        agora = int(time.time())
        if jid is None:
            if c.execute('SELECT COUNT(*) FROM joias').fetchone()[0] >= 80:
                return self.erro(409, 'limite')
            ordem = c.execute('SELECT COALESCE(MAX(ordem), -1) + 1 FROM joias').fetchone()[0]
            cur = c.execute('INSERT INTO joias(nome, material, preco, quantidade, visivel, ordem, atualizado) VALUES(?,?,?,?,?,?,?)',
                            (v['nome'], v['material'], v['preco'], v['quantidade'], v['visivel'], ordem, agora))
            jid = cur.lastrowid
        else:
            if not c.execute('SELECT 1 FROM joias WHERE id=?', (jid,)).fetchone():
                return self.erro(404, 'nao_existe')
            c.execute('UPDATE joias SET nome=?, material=?, preco=?, quantidade=?, visivel=?, atualizado=? WHERE id=?',
                      (v['nome'], v['material'], v['preco'], v['quantidade'], v['visivel'], agora, jid))
        r = c.execute('SELECT * FROM joias WHERE id=?', (jid,)).fetchone()
        return self.responder(200, dict(r, visivel=bool(r['visivel']), foto_src='/api/fotos/' + r['foto'] if r['foto'] else ''))

    def joia_foto_apagar(self, c, jid):
        r = c.execute('SELECT foto FROM joias WHERE id=?', (jid,)).fetchone()
        if not r:
            return self.erro(404, 'nao_existe')
        c.execute("UPDATE joias SET foto='' WHERE id=?", (jid,))
        self.apagar_ficheiro(r['foto'])
        return self.responder(200, {'ok': True})

    # ---------- avaliações (link de uso único) ----------
    def criar_convite(self, c, corpo):
        nome, piercing, pid = limpar_texto(corpo.get('nome'), 40), limpar_texto(corpo.get('piercing'), 80), None
        idioma = corpo.get('idioma') if corpo.get('idioma') in IDIOMAS else 'pt'
        if type(corpo.get('pedido')) is int:
            r = c.execute('SELECT id, nome, servicos, idioma FROM pedidos WHERE id=?', (corpo['pedido'],)).fetchone()
            if r:
                pid = r['id']
                idioma = r['idioma'] if r['idioma'] in IDIOMAS else idioma
                ids = [i for i in json.loads(r['servicos']) if CFG['por_id'].get(i, {}).get('cat') != 'servicos']
                piercing = piercing or ', '.join(nomes(ids, idioma))[:80]
                nome = nome or limpar_texto(r['nome'].split(' ')[0], 40)
        t, agora = secrets.token_urlsafe(9), int(time.time())
        cur = c.execute('INSERT INTO convites(h, criado, expira, nome, piercing, idioma, pedido) VALUES(?,?,?,?,?,?,?)',
                        (h(t), agora, agora + CONVITE_DIAS * 86400, nome, piercing, idioma, pid))
        return self.responder(201, {'token': t, 'id': cur.lastrowid, 'nome': nome, 'piercing': piercing, 'idioma': idioma})

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
        return self.responder(200, {'nome': r['nome'], 'piercing': r['piercing'], 'idioma': r['idioma']})

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

    # ---------- números ----------
    def numeros(self, c, dias):
        hoje = dt.date.today()
        de = hoje - dt.timedelta(days=dias - 1)
        t0 = int(time.mktime(de.timetuple()))
        criados = c.execute('SELECT estado, origem, idioma, servicos, total, data FROM pedidos WHERE criado>=?', (t0,)).fetchall()
        est = {e: 0 for e in ESTADOS}
        for r in criados:
            est[r['estado']] = est.get(r['estado'], 0) + 1
        feitos = c.execute("SELECT servicos, total FROM pedidos WHERE estado='concluida' AND data BETWEEN ? AND ?",
                           (de.isoformat(), hoje.isoformat())).fetchall()
        conta = {}
        for r in criados:
            for i in json.loads(r['servicos']):
                conta[i] = conta.get(i, 0) + 1
        top = sorted(conta.items(), key=lambda x: -x[1])[:6]
        fim = hoje + dt.timedelta(days=29)
        proximos = c.execute("SELECT COUNT(*) FROM pedidos WHERE estado='confirmada' AND data BETWEEN ? AND ?", (hoje.isoformat(), fim.isoformat())).fetchone()[0]
        por_responder = c.execute("SELECT COUNT(*) FROM pedidos WHERE estado='pendente'").fetchone()[0]
        semanas = []
        for k in range(7, -1, -1):
            a = hoje - dt.timedelta(days=hoje.weekday() + 7 * k)
            b = a + dt.timedelta(days=6)
            n = c.execute("SELECT COUNT(*) FROM pedidos WHERE criado BETWEEN ? AND ?",
                          (int(time.mktime(a.timetuple())), int(time.mktime(b.timetuple())) + 86399)).fetchone()[0]
            semanas.append({'de': a.isoformat(), 'n': n})
        av = c.execute('SELECT COUNT(*) n, AVG(estrelas) m FROM avaliacoes').fetchone()
        return {'pedidos': len(criados), 'site': sum(1 for r in criados if r['origem'] == 'site'),
                'em_ingles': sum(1 for r in criados if r['idioma'] == 'en'), 'estados': est,
                'feitos': len(feitos), 'faturacao': round(sum(r['total'] or 0 for r in feitos), 2),
                'top': [{'id': k, 'nome': nomes([k])[0], 'n': v} for k, v in top], 'proximos': proximos,
                'por_responder': por_responder, 'semanas': semanas,
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
    elif len(sys.argv) > 1 and sys.argv[1] == 'chave-estat':
        # mostra o hash da chave das estatísticas (para pôr em estat.config, hash_chave_dayla)
        c = ligar()
        print(h(cfg_get(c, 'estat_chave', '')))
    else:
        main()
