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
"""
import base64, datetime as dt, hashlib, hmac, json, os, re, secrets, sqlite3, threading, time, unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB = os.environ.get('AG_DB', '/var/lib/adri-agenda/agenda.db')
PORTA = int(os.environ.get('AG_PORTA', '3120'))
ORIGENS = set((os.environ.get('ORIGENS') or 'https://adribodypiercing.pt https://www.adribodypiercing.pt https://adribodypiercing.2-31-13-85.sslip.io').split())
SENHA_HASH = os.environ.get('ADRI_SENHA_HASH', '')
MAX_CORPO = 8 * 1024
SESSAO_H = 12
JANELA_DIAS = 75          # até quando se pode marcar
ANTECEDENCIA_H = 2        # marcações com pelo menos 2 horas de antecedência
DESCONTO = 0.10           # desconto da marcação online
TETO_PENDENTES = 60       # pedidos por confirmar no total
COOKIE = '__Host-adri_admin'

# Iguais aos do site (sites/adribodypiercing). Preço em euros, com a joia básica incluída.
SERVICOS = {
    'lobulo': ('Lóbulo', 30), 'lobulo-alto': ('Lóbulo alto', 30), 'helix': ('Hélix', 35), 'helix-frontal': ('Hélix frontal', 35),
    'flat': ('Flat', 40), 'tragus': ('Tragus', 35), 'antitragus': ('Anti-tragus', 40), 'conch': ('Conch', 40),
    'daith': ('Daith', 45), 'rook': ('Rook', 45), 'snug': ('Snug', 45), 'industrial': ('Industrial', 55),
    'narina': ('Narina', 35), 'septo': ('Septo', 45), 'labio': ('Lábio (labret)', 40), 'medusa': ('Medusa', 40),
    'sobrancelha': ('Sobrancelha', 40), 'lingua': ('Língua', 45), 'umbigo': ('Umbigo', 45), 'mamilo': ('Mamilo (cada)', 50),
    'microdermal': ('Microdermal', 70), 'consulta': ('Consulta', 0), 'troca': ('Troca de joia', 10), 'retirar': ('Retirar joia', 5),
}
_SEMANA = ['10:30', '11:30', '12:30', '14:30', '15:30', '16:30', '17:30', '18:30']
HORAS = {1: _SEMANA, 2: _SEMANA, 3: _SEMANA, 4: _SEMANA, 5: ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']}  # 0 = segunda
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
    ''')
    c.close()


def limpeza():
    """Apaga marcações 12 meses depois da data e sessões expiradas (corre ao arrancar e uma vez por dia)."""
    while True:
        try:
            c = ligar()
            corte = (dt.date.today() - dt.timedelta(days=365)).isoformat()
            c.execute('DELETE FROM marcacoes WHERE data < ?', (corte,))
            c.execute('DELETE FROM bloqueios WHERE data < ?', (dt.date.today().isoformat(),))
            c.execute('DELETE FROM sessoes WHERE expira < ?', (int(time.time()),))
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
    if hora not in HORAS.get(d.weekday(), []):
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


def nomes(ids):
    return [SERVICOS[i][0] for i in ids if i in SERVICOS]


def total_de(ids, online=True):
    """Os 10 % só valem para pedidos feitos no site; as marcações que o Adriano mete à mão ficam a preço normal."""
    sub = sum(SERVICOS[i][1] for i in ids)
    return round(sub * (1 - DESCONTO) if online else sub, 2)


def publico(r):
    ids = json.loads(r['servicos'])
    return {'codigo': r['codigo'], 'estado': r['estado'], 'data': r['data'], 'hora': r['hora'],
            'servicos': nomes(ids), 'total': r['total'], 'motivo': r['motivo']}


def completo(r):
    d = dict(r)
    d['servicos_ids'] = json.loads(r['servicos'])
    d['servicos'] = nomes(d['servicos_ids'])
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

    def responder(self, cod, corpo=None, cabecalhos=None):
        dados = json.dumps(corpo if corpo is not None else {}, ensure_ascii=False).encode()
        self.send_response(cod)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
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
                                                'servicos': {k: {'nome': v[0], 'preco': v[1]} for k, v in SERVICOS.items()}})
                if caminho == '/api/admin/bloqueios':
                    rs = c.execute('SELECT id, data, hora, motivo FROM bloqueios WHERE data>=? ORDER BY data, hora', (dt.date.today().isoformat(),)).fetchall()
                    return self.responder(200, {'bloqueios': [dict(r) for r in rs]})
                if caminho == '/api/admin/disponibilidade':
                    return self.responder(200, self.disponibilidade(c, args, admin=True))
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
            hs = HORAS.get(d.weekday())
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
        corpo = self.corpo_json()
        if corpo is None:
            return self.erro(400, 'pedido_invalido')
        c = ligar()
        try:
            if caminho == '/api/marcacoes':
                return self.criar(c, corpo)
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
                m = re.fullmatch(r'/api/admin/bloqueios/(\d+)/apagar', caminho)
                if m:
                    c.execute('DELETE FROM bloqueios WHERE id=?', (int(m.group(1)),))
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
        if not admin and corpo.get('idade') is not True:
            erros['idade'] = 'Confirma a idade para continuar.'
        return dict(ids=ids, data=d.isoformat() if d else '', hora=hora, nome=nome, tel=tel, notas=notas), erros

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
            c.execute('INSERT INTO marcacoes(codigo, criado, atualizado, estado, data, hora, servicos, total, nome, tel, notas, origem, historico) '
                      'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                      (codigo, agora, agora, estado, dados['data'], dados['hora'], json.dumps(dados['ids']), total_de(dados['ids'], online=not admin),
                       dados['nome'], dados['tel'], dados['notas'], 'adriano' if admin else 'site', json.dumps(hist)))
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

    def bloquear(self, c, corpo):
        d = data_ok(corpo.get('data'))
        hora = corpo.get('hora') if isinstance(corpo.get('hora'), str) else ''
        if not d or d < dt.date.today() or (hora and hora not in HORAS.get(d.weekday(), [])):
            return self.erro(422, 'campos', campos={'quando': 'Escolhe um dia de hoje em diante e, se quiseres, uma hora de abertura.'})
        try:
            c.execute('INSERT INTO bloqueios(data, hora, motivo, criado) VALUES(?,?,?,?)', (d.isoformat(), hora, limpar_texto(corpo.get('motivo'), 120), int(time.time())))
        except sqlite3.IntegrityError:
            pass
        return self.responder(200, {'ok': True})


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
