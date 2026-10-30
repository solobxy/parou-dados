#!/usr/bin/env python3
"""DupliCasa: API pequena para contas (entrar com link por e-mail), preferências e alertas.

Só biblioteca padrão (http.server + sqlite3). Corre em 127.0.0.1, atrás do Caddy (que trata do HTTPS).

Configuração (variáveis de ambiente, em /etc/duaschaves/api.env, fora do repositório):
  RESEND_API_KEY   chave do Resend para enviar e-mails (sem ela, os links ficam por enviar e a API diz isso)
  EMAIL_DE         remetente, ex.: "DupliCasa <ola@duplicasa.pt>"
  ORIGENS          origens aceites, separadas por espaços (ex.: https://duplicasa.pt https://www.duplicasa.pt)
  DC_DB            caminho da base de dados (por omissão /var/lib/duaschaves-api/dados.db)
  DC_PORTA         porta local (por omissão 3110)

Segurança: tokens e sessões guardados só como hash SHA-256; cookie HttpOnly, Secure, SameSite=Lax;
pedidos POST só com JSON e de uma origem aceite; limites de pedidos por IP e por e-mail; respostas
iguais exista ou não o e-mail; campos do utilizador validados e com tamanho máximo.
"""
import base64, hashlib, hmac, json, os, re, secrets, sqlite3, sys, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estatisticas as est

DB = os.environ.get('DC_DB', '/var/lib/duaschaves-api/dados.db')
PORTA = int(os.environ.get('DC_PORTA', '3110'))
ORIGENS = set((os.environ.get('ORIGENS') or 'https://duplicasa.pt https://www.duplicasa.pt https://duaschaves.2-31-13-85.sslip.io').split())
RESEND = os.environ.get('RESEND_API_KEY', '')
EMAIL_DE = os.environ.get('EMAIL_DE', 'DupliCasa <ola@duplicasa.pt>')
LINK_MIN = 20            # validade do link de entrada
SESSAO_DIAS = 30
MAX_CORPO = 64 * 1024
RE_EMAIL = re.compile(r'^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[A-Za-z]{2,24}$')

GOOGLE_ID, GOOGLE_SEGREDO = os.environ.get('GOOGLE_ID', ''), os.environ.get('GOOGLE_SEGREDO', '')
FACEBOOK_ID, FACEBOOK_SEGREDO = os.environ.get('FACEBOOK_ID', ''), os.environ.get('FACEBOOK_SEGREDO', '')
FACEBOOK_VERSAO = os.environ.get('FACEBOOK_VERSAO', 'v26.0')
# quem pode ver as estatísticas (e-mails das contas, separados por espaços)
ADMINS = set((os.environ.get('ADMINS') or 'diniscash@gmail.com').lower().split())
COOKIE_APAGAR = '__Host-dc_sessao=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
SENHAS_FRACAS = {'123456789', '1234567890', 'password', 'password1', 'qwertyuiop', 'palavrapasse', 'benfica1904', 'portugal123',
                 '12345678910', 'iloveyou12', 'aaaaaaaaaa', '0123456789', 'abcdefghij', 'passw0rd12', 'duaschaves', 'duaschaves1'}


def cookie_sessao(s):
    return '__Host-dc_sessao=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Lax' % (s, SESSAO_DIAS * 86400)


def hash_senha(senha, sal=None):
    """scrypt (memória pesada contra placas gráficas): N=2^16, r=8, p=2, sal aleatório de 16 bytes."""
    sal = sal or secrets.token_bytes(16)
    d = hashlib.scrypt(senha.encode(), salt=sal, n=2 ** 16, r=8, p=2, maxmem=96 * 1024 * 1024, dklen=32)
    return 'scrypt$16$8$2$%s$%s' % (base64.b64encode(sal).decode(), base64.b64encode(d).decode())


def confere_senha(senha, guardado):
    try:
        _, n, r, p, sal, d = guardado.split('$')
        novo = hashlib.scrypt(senha.encode(), salt=base64.b64decode(sal), n=2 ** int(n), r=int(r), p=int(p),
                              maxmem=96 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(novo, base64.b64decode(d))
    except Exception:
        return False


HASH_FALSO = None


def senha_fraca(senha, email):
    if len(senha) < 10 or len(senha) > 128:
        return 'A palavra-passe precisa de ter entre 10 e 128 caracteres.'
    if senha.lower() in SENHAS_FRACAS or len(set(senha)) < 4:
        return 'Essa palavra-passe é demasiado fácil de adivinhar.'
    if email and len(email.split('@')[0]) >= 4 and email.split('@')[0].lower() in senha.lower():
        return 'Não uses o teu e-mail na palavra-passe.'
    return ''


_bloq = threading.Lock()
_contagens = {}          # limite de pedidos: chave -> [instantes]


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


def ligar():
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    return c


def criar_tabelas():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    with ligar() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS utilizadores(
          id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, criado INTEGER NOT NULL,
          marketing INTEGER NOT NULL DEFAULT 0, marketing_quando INTEGER, prefs TEXT NOT NULL DEFAULT '{}',
          acesso_ate INTEGER, renova INTEGER NOT NULL DEFAULT 0, apagado INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS links(hash TEXT PRIMARY KEY, email TEXT NOT NULL, expira INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sessoes(hash TEXT PRIMARY KEY, utilizador INTEGER NOT NULL, expira INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS alertas(id INTEGER PRIMARY KEY, utilizador INTEGER NOT NULL, filtro TEXT NOT NULL, criado INTEGER NOT NULL, ativo INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS envios(id INTEGER PRIMARY KEY, email TEXT NOT NULL, tipo TEXT NOT NULL, estado TEXT NOT NULL, quando INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS i_alertas_u ON alertas(utilizador);
        CREATE TABLE IF NOT EXISTS config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS subscricoes(id INTEGER PRIMARY KEY, email TEXT NOT NULL, disp TEXT NOT NULL, estado TEXT NOT NULL,
          plano TEXT NOT NULL DEFAULT 'p30', metodo TEXT, criado INTEGER NOT NULL, ate INTEGER, marketing INTEGER NOT NULL DEFAULT 1);
        CREATE INDEX IF NOT EXISTS i_sub_disp ON subscricoes(disp);
        CREATE INDEX IF NOT EXISTS i_sub_email ON subscricoes(email);
        CREATE TABLE IF NOT EXISTS pedidos(id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, email TEXT NOT NULL, dados TEXT NOT NULL, criado INTEGER NOT NULL);
        ''')
        ucols = [r[1] for r in c.execute('PRAGMA table_info(utilizadores)')]
        if 'perfil' not in ucols:
            c.execute("ALTER TABLE utilizadores ADD COLUMN perfil TEXT NOT NULL DEFAULT '{}'")
        for col, tipo in (('senha', 'TEXT'), ('google_sub', 'TEXT'), ('facebook_id', 'TEXT'), ('email_ok', 'INTEGER NOT NULL DEFAULT 0')):
            if col not in ucols:
                c.execute('ALTER TABLE utilizadores ADD COLUMN %s %s' % (col, tipo))
        scols = [r[1] for r in c.execute('PRAGMA table_info(sessoes)')]
        if 'criada' not in scols:
            c.execute('ALTER TABLE sessoes ADD COLUMN criada INTEGER')
        if 'foto' not in ucols:
            c.execute('ALTER TABLE utilizadores ADD COLUMN foto TEXT')
        cols = [r[1] for r in c.execute('PRAGMA table_info(alertas)')]
        if 'ultimo_envio' not in cols:
            c.execute('ALTER TABLE alertas ADD COLUMN ultimo_envio INTEGER')
        est.criar(c)
        if not c.execute("SELECT 1 FROM config WHERE chave='segredo'").fetchone():
            c.execute("INSERT INTO config VALUES('segredo', ?)", (secrets.token_hex(32),))


def assinatura(c, alerta_id):
    seg = c.execute("SELECT valor FROM config WHERE chave='segredo'").fetchone()[0]
    return hmac.new(seg.encode(), b'parar:' + str(alerta_id).encode(), 'sha256').hexdigest()[:32]


def assinatura_mkt(c, uid):
    seg = c.execute("SELECT valor FROM config WHERE chave='segredo'").fetchone()[0]
    return hmac.new(seg.encode(), b'mkt:' + str(uid).encode(), 'sha256').hexdigest()[:32]


# ---------- subscrição só com e-mail (sem conta) ----------
# O dispositivo fica com um cookie próprio (__Host-dc_disp). A subscrição só passa a «ativa» quando o pagamento
# for confirmado (ativar_subscricao, chamada pelo aviso do serviço de pagamentos). Aí envia-se um link para
# acabar a conta; ao entrar com esse e-mail, o acesso passa também para a conta.
DISP_DIAS = 400
PAGAMENTOS = os.environ.get('PAGAMENTOS', '')      # vazio: ainda não há serviço de pagamentos ligado

# Pedidos sem conta: campos aceites por tipo (tipo, tamanho máximo ou valor máximo)
PEDIDO_CAMPOS = {
    'seguro': {'onde': ('str', 30), 'link': ('str', 300), 'renda': ('int', 20000), 'nome': ('str', 80), 'casa': ('str', 40)},
    'senhorio': {'nome': ('str', 80), 'telemovel': ('str', 20), 'cidade': ('str', 80), 'zona': ('str', 120), 'tipologia': ('str', 20),
                 'area': ('int', 5000), 'renda': ('int', 20000), 'caucao': ('int', 6), 'descricao': ('str', 2000)},
}
PEDIDO_NOMES = {'seguro': 'lista de espera do pagamento seguro', 'senhorio': 'senhorio quer publicar'}

# Links dos anúncios originais: não vão no lista.json público; só quem tem o acesso ativo os recebe, um a um.
LINKS = os.environ.get('DC_LINKS', '/var/lib/duaschaves-dados/links.json')
_links = {'mtime': None, 'mapa': {}}
_links_bloq = threading.Lock()


def link_anuncio(rid):
    """URL do anúncio original (links.json escrito por recolher.py; relido quando muda)."""
    with _links_bloq:
        try:
            mt = os.path.getmtime(LINKS)
        except OSError:
            return None
        if mt != _links['mtime']:
            try:
                with open(LINKS, encoding='utf-8') as f:
                    _links['mapa'] = json.load(f)
                _links['mtime'] = mt
            except (OSError, ValueError):
                return None
        u = _links['mapa'].get(rid)
    return u if isinstance(u, str) and u.startswith('https://') else None


def cookie_disp(t):
    return '__Host-dc_disp=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Lax' % (t, DISP_DIAS * 86400)


def ativar_subscricao(c, sub_id, base, dias=30):
    """Chamada quando o pagamento é confirmado. Ativa no dispositivo e, se já houver conta com o e-mail, na conta."""
    r = c.execute('SELECT * FROM subscricoes WHERE id=?', (sub_id,)).fetchone()
    if not r:
        return False
    ate = max(r['ate'] or 0, int(time.time())) + dias * 86400
    c.execute("UPDATE subscricoes SET estado='ativa', ate=? WHERE id=?", (ate, sub_id))
    u = c.execute('SELECT * FROM utilizadores WHERE email=? AND apagado=0', (r['email'],)).fetchone()
    if u:
        c.execute('UPDATE utilizadores SET acesso_ate=MAX(COALESCE(acesso_ate,0), ?), renova=1 WHERE id=?', (ate, u['id']))
    t = secrets.token_urlsafe(32)
    c.execute('INSERT INTO links(hash, email, expira) VALUES(?,?,?)', (h(t), r['email'], int(time.time()) + 7 * 86400))
    email_acabar_conta(r['email'], base + '/api/entrar/confirmar?t=' + t)
    return True


def email_acabar_conta(para, link):
    texto = ('Olá!\n\nO teu acesso à DupliCasa está ativo neste dispositivo.\n'
             'Para o teres também noutros dispositivos e gerires a subscrição, acaba de criar a tua conta:\n' + link +
             '\n\nO link vale 7 dias e só funciona uma vez.\n\nDupliCasa')
    html = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:480px">'
            '<p>Olá!</p><p>O teu acesso à DupliCasa está <strong>ativo</strong> neste dispositivo.</p>'
            '<p>Acaba de criar a tua conta para o teres noutros dispositivos e gerires a subscrição.</p>'
            '<p><a href="' + link + '" style="display:inline-block;background:#0B6E4F;color:#fff;text-decoration:none;'
            'font-weight:700;padding:14px 22px;border-radius:12px">Acabar de criar a conta</a></p>'
            '<p style="color:#56635e;font-size:14px">O link vale 7 dias e só funciona uma vez.</p></div>')
    return enviar_email(para, 'Acaba de criar a tua conta na DupliCasa', texto, html)


def juntar_subscricoes(c, uid, email):
    """Ao entrar: o acesso pago só com e-mail passa para a conta com esse e-mail."""
    r = c.execute("SELECT MAX(ate) m FROM subscricoes WHERE email=? AND estado='ativa'", (email,)).fetchone()
    if r and r['m'] and r['m'] > time.time():
        c.execute('UPDATE utilizadores SET acesso_ate=MAX(COALESCE(acesso_ate,0), ?), renova=1 WHERE id=?', (r['m'], uid))


def utilizador(c, email, criar=True):
    r = c.execute('SELECT * FROM utilizadores WHERE email=?', (email,)).fetchone()
    if r or not criar:
        return r
    c.execute('INSERT INTO utilizadores(email, criado) VALUES(?, ?)', (email, int(time.time())))
    return c.execute('SELECT * FROM utilizadores WHERE email=?', (email,)).fetchone()


def enviar_email(para, assunto, texto, html):
    """True se o Resend aceitou; False se falhou; None se o envio ainda não está configurado."""
    if not RESEND:
        return None
    dados = json.dumps({'from': EMAIL_DE, 'to': [para], 'subject': assunto, 'text': texto, 'html': html}).encode()
    req = urllib.request.Request('https://api.resend.com/emails', data=dados, method='POST',
                                 headers={'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except Exception as e:  # não registar a chave nem o corpo
        print('envio falhou:', type(e).__name__, file=sys.stderr)
        return False


def email_entrar(para, link):
    texto = ('Olá!\n\nToca no link para entrares na DupliCasa:\n' + link +
             '\n\nO link vale ' + str(LINK_MIN) + ' minutos e só funciona uma vez.\n'
             'Se não pediste para entrar, ignora este e-mail.\n\nDupliCasa')
    html = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:480px">'
            '<p>Olá!</p><p>Toca no botão para entrares na DupliCasa.</p>'
            '<p><a href="' + link + '" style="display:inline-block;background:#0B6E4F;color:#fff;text-decoration:none;'
            'font-weight:700;padding:14px 22px;border-radius:12px">Entrar na DupliCasa</a></p>'
            '<p style="color:#56635e;font-size:14px">O link vale ' + str(LINK_MIN) + ' minutos e só funciona uma vez. '
            'Se não pediste para entrar, ignora este e-mail.</p></div>')
    return enviar_email(para, 'O teu link para entrar na DupliCasa', texto, html)


FOTOS = os.path.join(os.path.dirname(DB), 'fotos')
MAX_FOTO = 2 * 1024 * 1024
GENEROS = ('Mulher', 'Homem', 'Outro', 'Prefiro não dizer')
SITUACOES = ('Trabalhador por conta de outrem', 'Trabalhador independente', 'Estudante', 'Reformado', 'À procura de emprego', 'Outra')
TIPS_OK = ('Quarto', 'T0', 'T1', 'T2', 'T3+')


def texto(v, n):
    if not isinstance(v, str):
        return ''
    v = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', v).strip()
    return v[:n]


def limpar_perfil(p):
    """Só os campos do perfil, com tipo e tamanho controlados. Tudo é opcional."""
    if not isinstance(p, dict):
        return None
    out = {'nome': texto(p.get('nome'), 60), 'emprego': texto(p.get('emprego'), 80), 'cidade': texto(p.get('cidade'), 60),
           'descricao': texto(p.get('descricao'), 600), 'zonas': texto(p.get('zonas'), 300), 'entrada': texto(p.get('entrada'), 10)}
    i = p.get('idade')
    out['idade'] = int(i) if isinstance(i, (int, float)) and 18 <= i <= 99 else None
    out['genero'] = p.get('genero') if p.get('genero') in GENEROS else ''
    out['situacao'] = p.get('situacao') if p.get('situacao') in SITUACOES else ''
    o = p.get('orcamento')
    out['orcamento'] = int(o) if isinstance(o, (int, float)) and 0 < o <= 20000 else None
    out['tips'] = [t for t in (p.get('tips') or []) if t in TIPS_OK][:5] if isinstance(p.get('tips'), list) else []
    if out['entrada'] and not re.fullmatch(r'\d{4}-\d{2}(-\d{2})?', out['entrada']):
        out['entrada'] = ''
    for k in ('animais', 'fumador'):
        out[k] = p.get(k) if p.get(k) in (True, False) else None
    return out


def tipo_imagem(b):
    if b[:3] == b'\xff\xd8\xff':
        return 'jpg'
    if b[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if b[:4] == b'RIFF' and b[8:12] == b'WEBP':
        return 'webp'
    return None


PREFS_CHAVES = {'guardadas': list, 'filtros': list, 'zonas': dict}


def limpar_prefs(p):
    out = {}
    if not isinstance(p, dict):
        return out
    for k, tipo in PREFS_CHAVES.items():
        v = p.get(k)
        if isinstance(v, tipo):
            out[k] = v[:200] if isinstance(v, list) else dict(list(v.items())[:60])
    s = json.dumps(out, ensure_ascii=False)
    return out if len(s) <= 40000 else {}


def limpar_filtro(f):
    if not isinstance(f, dict):
        return None
    ok = {}
    for k in ('cidade', 'tipoImovel'):
        if isinstance(f.get(k), str):
            ok[k] = f[k][:80]
    for k in ('precoMax', 'areaMin', 'dias'):
        if isinstance(f.get(k), (int, float)) and 0 <= f[k] <= 100000:
            ok[k] = int(f[k])
    if isinstance(f.get('tips'), list):
        ok['tips'] = [t for t in f['tips'] if t in ('Quarto', 'T0', 'T1', 'T2', 'T3+')][:5]
    for k in ('soProt', 'soPart', 'soFotos', 'comPreco', 'semCaucao'):
        if f.get(k) is True:
            ok[k] = True
    if isinstance(f.get('casa'), (int, str)):
        ok['casa'] = str(f['casa'])[:40]
    return ok


class API(BaseHTTPRequestHandler):
    server_version = 'dc'
    sys_version = ''

    def log_message(self, fmt, *a):  # sem e-mails nem tokens nos registos
        sys.stderr.write('%s %s\n' % (self.command, self.path.split('?')[0]))

    def ip(self):
        return (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()

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

    def origem_ok(self):
        o = self.headers.get('Origin')
        if o:
            return o in ORIGENS
        host = self.headers.get('Host', '')
        return ('https://' + host) in ORIGENS

    def corpo_json(self):
        if not (self.headers.get('Content-Type') or '').startswith('application/json'):
            return None
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_CORPO:
            return None
        try:
            return json.loads(self.rfile.read(n))
        except ValueError:
            return None

    def sessao(self, c):
        ck = self.headers.get('Cookie') or ''
        m = re.search(r'(?:^|;\s*)__Host-dc_sessao=([A-Za-z0-9_\-]{20,100})', ck)
        if not m:
            return None
        r = c.execute('SELECT u.* FROM sessoes s JOIN utilizadores u ON u.id=s.utilizador WHERE s.hash=? AND s.expira>? AND u.apagado=0',
                      (h(m.group(1)), int(time.time()))).fetchone()
        return r

    def base(self):
        host = self.headers.get('Host', '')
        b = 'https://' + host
        return b if b in ORIGENS else sorted(ORIGENS)[0]

    # ---------- GET ----------
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == '/api/saude':
            return self.responder(200, {'ok': True, 'email': bool(RESEND), 'google': bool(GOOGLE_ID and GOOGLE_SEGREDO),
                                        'facebook': bool(FACEBOOK_ID and FACEBOOK_SEGREDO), 'senha': True})
        if url.path == '/api/dispositivo':  # acesso pago neste dispositivo, sem conta
            m = re.search(r'(?:^|;\s*)__Host-dc_disp=([A-Za-z0-9_\-]{20,100})', self.headers.get('Cookie') or '')
            if not m:
                return self.responder(200, {'acesso': None})
            with ligar() as c:
                r = c.execute("SELECT email, estado, ate FROM subscricoes WHERE disp=? ORDER BY id DESC LIMIT 1", (h(m.group(1)),)).fetchone()
            if not r:
                return self.responder(200, {'acesso': None})
            ativo = r['estado'] == 'ativa' and (r['ate'] or 0) > time.time()
            return self.responder(200, {'acesso': {'ate': r['ate'] * 1000} if ativo else None, 'estado': r['estado'], 'email': r['email']})
        if url.path == '/api/link':         # link do anúncio original: só com o acesso ativo (ou administração)
            rid = urllib.parse.parse_qs(url.query).get('id', [''])[0]
            if not re.fullmatch(r'[A-Za-z0-9_\-]{3,80}', rid or ''):
                return self.responder(400, {'erro': 'pedido'})
            agora = int(time.time())
            chave = None
            with ligar() as c:
                u = self.sessao(c)
                if u and ((u['acesso_ate'] or 0) > agora or u['email'].lower() in ADMINS):
                    chave = 'u%d' % u['id']
                else:
                    m = re.search(r'(?:^|;\s*)__Host-dc_disp=([A-Za-z0-9_\-]{20,100})', self.headers.get('Cookie') or '')
                    if m:
                        r = c.execute("SELECT id FROM subscricoes WHERE disp=? AND estado='ativa' AND ate>? ORDER BY id DESC LIMIT 1",
                                      (h(m.group(1)), agora)).fetchone()
                        if r:
                            chave = 's%d' % r['id']
            if not chave:
                return self.responder(403, {'erro': 'sem_acesso'})
            if not limite('link:' + chave, 150, 3600):     # quem paga contacta casas, não copia o site inteiro
                return self.responder(429, {'erro': 'muitos_pedidos'})
            u = link_anuncio(rid)
            return self.responder(200, {'url': u}) if u else self.responder(404, {'erro': 'sem_link'})
        if url.path == '/api/pedidos':      # lista de espera e pedidos de senhorios: só administração
            with ligar() as c:
                u = self.sessao(c)
                if not u:
                    return self.responder(401, {'erro': 'sem_sessao'})
                if u['email'].lower() not in ADMINS:
                    return self.responder(403, {'erro': 'sem_permissao'})
                return self.responder(200, {'pedidos': [dict(id=r['id'], tipo=r['tipo'], email=r['email'], dados=json.loads(r['dados']), criado=r['criado'])
                                                        for r in c.execute('SELECT * FROM pedidos ORDER BY id DESC LIMIT 500')]})
        if url.path == '/api/publico':      # números públicos e agregados (prova social verdadeira), sem dados pessoais
            semana = int(time.time()) - 7 * 86400
            with ligar() as c:
                r = c.execute('SELECT COUNT(*) n, COUNT(DISTINCT utilizador) p FROM alertas WHERE criado>?', (semana,)).fetchone()
            return self.responder(200, {'alertas7': r['n'] or 0, 'pessoas7': r['p'] or 0})
        if url.path == '/api/eu':
            with ligar() as c:
                u = self.sessao(c)
                if not u:
                    return self.responder(401, {'erro': 'sem_sessao'})
                if u['email_ok']:           # só com o e-mail provado é que o acesso pago com esse e-mail passa para a conta
                    juntar_subscricoes(c, u['id'], u['email'])
                    u = self.sessao(c)
                return self.responder(200, {
                    'email': u['email'], 'marketing': bool(u['marketing']), 'prefs': json.loads(u['prefs'] or '{}'),
                    'perfil': json.loads(u['perfil'] or '{}'), 'foto': bool(u['foto']), 'tem_senha': bool(u['senha']),
                    'google': bool(u['google_sub']), 'facebook': bool(u['facebook_id']), 'admin': u['email'].lower() in ADMINS,
                    'acesso': {'ate': (u['acesso_ate'] or 0) * 1000, 'renova': bool(u['renova'])} if u['acesso_ate'] else None,
                    'alertas': [dict(id=a['id'], filtro=json.loads(a['filtro'])) for a in
                                c.execute('SELECT id, filtro FROM alertas WHERE utilizador=? AND ativo=1 ORDER BY id DESC', (u['id'],))]})
        if url.path == '/api/estatisticas':    # só para as contas em ADMINS
            q = urllib.parse.parse_qs(url.query)
            with ligar() as c:
                u = self.sessao(c)
                if not u:
                    return self.responder(401, {'erro': 'sem_sessao'})
                if u['email'].lower() not in ADMINS:
                    return self.responder(403, {'erro': 'sem_permissao'})
                try:
                    dias = int((q.get('dias') or ['30'])[0])
                except ValueError:
                    dias = 30
                return self.responder(200, est.resumo(c, dias))
        if url.path == '/api/perfil/foto':     # só o próprio vê a sua foto
            with ligar() as c:
                u = self.sessao(c)
            if not u or not u['foto']:
                return self.responder(404, {'erro': 'sem_foto'})
            try:
                dados = open(os.path.join(FOTOS, u['foto']), 'rb').read()
            except OSError:
                return self.responder(404, {'erro': 'sem_foto'})
            self.send_response(200)
            self.send_header('Content-Type', {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}[u['foto'].rsplit('.', 1)[1]])
            self.send_header('Cache-Control', 'private, no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)
            return
        m = re.fullmatch(r'/api/oauth/(google|facebook)/(inicio|volta)', url.path)
        if m:
            return self.oauth(m.group(1), m.group(2), urllib.parse.parse_qs(url.query))
        if url.path == '/api/parar':        # parar um alerta a partir do link no e-mail (sem precisar de entrar)
            q = urllib.parse.parse_qs(url.query)
            a, k = q.get('a', [''])[0], q.get('k', [''])[0]
            if a.isdigit() and re.fullmatch(r'[0-9a-f]{32}', k or ''):
                with ligar() as c:
                    if hmac.compare_digest(assinatura(c, int(a)), k):
                        c.execute('UPDATE alertas SET ativo=0 WHERE id=?', (int(a),))
                        return self.redirecionar(self.base() + '/#alerta-parado')
            return self.redirecionar(self.base() + '/#alertas')
        if url.path == '/api/sem-mkt':      # deixar de receber ofertas, a partir do link no e-mail (sem precisar de entrar)
            q = urllib.parse.parse_qs(url.query)
            u, k = q.get('u', [''])[0], q.get('k', [''])[0]
            if u.isdigit() and re.fullmatch(r'[0-9a-f]{32}', k or ''):
                with ligar() as c:
                    if hmac.compare_digest(assinatura_mkt(c, int(u)), k):
                        c.execute('UPDATE utilizadores SET marketing=0, marketing_quando=? WHERE id=?', (int(time.time()), int(u)))
                        return self.redirecionar(self.base() + '/#sem-ofertas')
            return self.redirecionar(self.base() + '/#conta')
        if url.path == '/api/entrar/confirmar':
            t = urllib.parse.parse_qs(url.query).get('t', [''])[0]
            destino = self.base() + '/#conta'
            if not re.fullmatch(r'[A-Za-z0-9_\-]{20,100}', t or '') or not limite('conf:' + self.ip(), 30, 900):
                return self.redirecionar(self.base() + '/#entrar-erro')
            agora = int(time.time())
            with ligar() as c:
                r = c.execute('SELECT * FROM links WHERE hash=?', (h(t),)).fetchone()
                if not r or r['usado'] or r['expira'] < agora:
                    return self.redirecionar(self.base() + '/#entrar-erro')
                c.execute('UPDATE links SET usado=1 WHERE hash=?', (h(t),))
                u = utilizador(c, r['email'])
                if not u['email_ok'] and u['senha']:      # o dono provou o e-mail: anula palavra-passe posta por outra pessoa
                    c.execute('UPDATE utilizadores SET senha=NULL WHERE id=?', (u['id'],))
                    c.execute('DELETE FROM sessoes WHERE utilizador=?', (u['id'],))
                c.execute('UPDATE utilizadores SET email_ok=1 WHERE id=?', (u['id'],))
                juntar_subscricoes(c, u['id'], u['email'])
                ck = nova_sessao(c, u['id'])
            return self.redirecionar(destino, [('Set-Cookie', ck)])
        return self.responder(404, {'erro': 'nao_existe'})

    def redirecionar(self, para, extra=None):
        self.send_response(303)
        self.send_header('Location', para)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        for k, v in (extra or []):
            self.send_header(k, v)
        self.send_header('Content-Length', '0')
        self.end_headers()

    # ---------- POST ----------
    def do_POST(self):
        if not self.origem_ok():
            return self.responder(403, {'erro': 'origem'})
        if urllib.parse.urlsplit(self.path).path == '/api/perfil/foto':
            return self.foto()
        corpo = self.corpo_json()
        if corpo is None or not isinstance(corpo, dict):
            return self.responder(400, {'erro': 'pedido'})
        p = urllib.parse.urlsplit(self.path).path
        ip = self.ip()

        if p == '/api/ev':                  # estatísticas: sem cookies, sem dados pessoais (ver estatisticas.py)
            if not limite('ev:' + ip, 300, 600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            with ligar() as c:
                est.registar(c, corpo, ip, self.headers.get('User-Agent') or '', bool(self.sessao(c)))
            return self.responder(200, {'ok': True})

        if p == '/api/pedido':              # lista de espera do pagamento seguro e pedidos de senhorios (sem conta)
            tipo = corpo.get('tipo')
            campos = PEDIDO_CAMPOS.get(tipo)
            email = str(corpo.get('email') or '').strip().lower()
            if not campos or not RE_EMAIL.match(email):
                return self.responder(400, {'erro': 'pedido'})
            if corpo.get('site'):           # isco para robôs: responde como se tivesse corrido bem
                return self.responder(200, {'ok': True})
            if not limite('ped:' + ip, 8, 3600) or not limite('ped:' + email, 5, 86400):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            dados_in = corpo.get('dados') if isinstance(corpo.get('dados'), dict) else {}
            dados = {}
            for k, (t, n) in campos.items():
                v = dados_in.get(k)
                if v is None or v == '':
                    continue
                if t == 'int':
                    try:
                        v = int(float(v))
                    except (TypeError, ValueError):
                        continue
                    if 0 <= v <= n:
                        dados[k] = v
                else:
                    dados[k] = str(v).strip()[:n]
            with ligar() as c:
                c.execute('DELETE FROM pedidos WHERE criado<?', (int(time.time()) - 365 * 86400,))   # no máximo 12 meses (política de privacidade)
                c.execute('INSERT INTO pedidos(tipo, email, dados, criado) VALUES(?,?,?,?)',
                          (tipo, email, json.dumps(dados, ensure_ascii=False), int(time.time())))
            resumo = '\n'.join('%s: %s' % (k, v) for k, v in dados.items())
            for adm in ADMINS:
                enviar_email(adm, 'DupliCasa: novo pedido (%s)' % PEDIDO_NOMES[tipo], 'E-mail: %s\n%s' % (email, resumo),
                             '<pre style="font-family:system-ui,sans-serif;font-size:15px">' +
                             ('E-mail: %s\n%s' % (email, resumo)).replace('&', '&amp;').replace('<', '&lt;') + '</pre>')
            return self.responder(200, {'ok': True})
        if p == '/api/subscrever':          # pagar só com o e-mail, sem criar conta antes
            email = str(corpo.get('email') or '').strip().lower()
            plano = corpo.get('plano') if corpo.get('plano') in ('p30', 'p60', 'p90') else 'p30'
            metodo = corpo.get('metodo') if corpo.get('metodo') in ('mbway', 'cartao') else ''
            if not RE_EMAIL.match(email):
                return self.responder(400, {'erro': 'email'})
            if not limite('sub:' + ip, 10, 900):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            m = re.search(r'(?:^|;\s*)__Host-dc_disp=([A-Za-z0-9_\-]{20,100})', self.headers.get('Cookie') or '')
            t = m.group(1) if m else secrets.token_urlsafe(32)
            with ligar() as c:
                c.execute('INSERT INTO subscricoes(email, disp, estado, plano, metodo, criado, marketing) VALUES(?,?,?,?,?,?,?)',
                          (email, h(t), 'pendente', plano, metodo, int(time.time()), 0 if corpo.get('sem_mkt') else 1))
            # Sem serviço de pagamentos ligado não se ativa nada (senão o acesso seria grátis).
            return self.responder(200, {'ok': True, 'estado': 'pendente', 'pagamento': 'por_ligar' if not PAGAMENTOS else 'iniciar'},
                                  [('Set-Cookie', cookie_disp(t))])

        if p == '/api/entrar':
            email = str(corpo.get('email') or '').strip().lower()
            if corpo.get('site'):            # campo-isco: só os robôs o preenchem
                return self.responder(200, {'ok': True, 'enviado': True})
            if not RE_EMAIL.match(email):
                return self.responder(400, {'erro': 'email'})
            if not limite('ip:' + ip, 10, 900) or not limite('em:' + email, 3, 900):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            t = secrets.token_urlsafe(32)
            with ligar() as c:
                c.execute('INSERT INTO links(hash, email, expira) VALUES(?,?,?)', (h(t), email, int(time.time()) + LINK_MIN * 60))
                c.execute('DELETE FROM links WHERE expira<?', (int(time.time()) - 86400,))
            r = email_entrar(email, self.base() + '/api/entrar/confirmar?t=' + t)
            with ligar() as c:
                c.execute('INSERT INTO envios(email, tipo, estado, quando) VALUES(?,?,?,?)',
                          (email, 'entrar', {True: 'enviado', False: 'falhou', None: 'sem_servico'}[r], int(time.time())))
            if r is None:
                return self.responder(503, {'erro': 'email_por_ligar'})
            return self.responder(200, {'ok': True, 'enviado': bool(r)})

        if p == '/api/registar':
            email = str(corpo.get('email') or '').strip().lower()
            senha = corpo.get('senha') if isinstance(corpo.get('senha'), str) else ''
            if corpo.get('site'):
                return self.responder(200, {'ok': True})
            if not RE_EMAIL.match(email):
                return self.responder(400, {'erro': 'email'})
            fraca = senha_fraca(senha, email)
            if fraca:
                return self.responder(400, {'erro': 'senha', 'msg': fraca})
            if not limite('reg:' + ip, 5, 3600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            with ligar() as c:
                ex = utilizador(c, email, criar=False)
                # só se pode criar conta num e-mail que ainda não tem forma de entrar (ex.: só deixou um alerta)
                if ex and (ex['senha'] or ex['google_sub'] or ex['facebook_id'] or ex['email_ok']):
                    return self.responder(409, {'erro': 'conta_existe'})
                u = utilizador(c, email)
                c.execute('UPDATE utilizadores SET senha=?, perfil=? WHERE id=?',
                          (hash_senha(senha), json.dumps({'nome': texto(corpo.get('nome'), 60)}, ensure_ascii=False), u['id']))
                ck = nova_sessao(c, u['id'])
            return self.responder(200, {'ok': True}, [('Set-Cookie', ck)])

        if p == '/api/entrar-senha':
            email = str(corpo.get('email') or '').strip().lower()
            senha = corpo.get('senha') if isinstance(corpo.get('senha'), str) else ''
            if not limite('ls-ip:' + ip, 20, 900) or not limite('ls-em:' + email, 6, 900):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            with ligar() as c:
                u = utilizador(c, email, criar=False) if RE_EMAIL.match(email) else None
                guardado = u['senha'] if u and u['senha'] and not u['apagado'] else None
                global HASH_FALSO
                if not guardado:                 # gasta o mesmo tempo para não revelar que contas existem
                    HASH_FALSO = HASH_FALSO or hash_senha('x' * 12)
                    confere_senha(senha[:128], HASH_FALSO)
                    return self.responder(401, {'erro': 'credenciais'})
                if not confere_senha(senha[:128], guardado):
                    return self.responder(401, {'erro': 'credenciais'})
                ck = nova_sessao(c, u['id'])
            return self.responder(200, {'ok': True}, [('Set-Cookie', ck)])

        if p == '/api/alerta':             # alerta ou pedido de aviso, com ou sem conta
            email = str(corpo.get('email') or '').strip().lower()
            f = limpar_filtro(corpo.get('filtro'))
            if corpo.get('site'):
                return self.responder(200, {'ok': True})
            if not RE_EMAIL.match(email) or f is None:
                return self.responder(400, {'erro': 'pedido'})
            if not limite('al:' + ip, 20, 3600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            with ligar() as c:
                u = utilizador(c, email)
                if c.execute('SELECT COUNT(*) FROM alertas WHERE utilizador=? AND ativo=1', (u['id'],)).fetchone()[0] >= 20:
                    return self.responder(400, {'erro': 'limite_alertas'})
                c.execute('INSERT INTO alertas(utilizador, filtro, criado) VALUES(?,?,?)', (u['id'], json.dumps(f, ensure_ascii=False), int(time.time())))
                if corpo.get('marketing') is True:
                    c.execute('UPDATE utilizadores SET marketing=1, marketing_quando=? WHERE id=?', (int(time.time()), u['id']))
            return self.responder(200, {'ok': True})

        with ligar() as c:
            u = self.sessao(c)
            if not u:
                return self.responder(401, {'erro': 'sem_sessao'})
            if p == '/api/sair':
                ck = self.headers.get('Cookie') or ''
                m = re.search(r'(?:^|;\s*)__Host-dc_sessao=([A-Za-z0-9_\-]{20,100})', ck)
                if m:
                    c.execute('DELETE FROM sessoes WHERE hash=?', (h(m.group(1)),))
                return self.responder(200, {'ok': True}, [('Set-Cookie', COOKIE_APAGAR)])
            if p == '/api/senha':
                nova = corpo.get('nova') if isinstance(corpo.get('nova'), str) else ''
                atual = corpo.get('atual') if isinstance(corpo.get('atual'), str) else ''
                if u['senha'] and not confere_senha(atual[:128], u['senha']):
                    return self.responder(401, {'erro': 'credenciais'})
                fraca = senha_fraca(nova, u['email'])
                if fraca:
                    return self.responder(400, {'erro': 'senha', 'msg': fraca})
                c.execute('UPDATE utilizadores SET senha=? WHERE id=?', (hash_senha(nova), u['id']))
                c.execute('DELETE FROM sessoes WHERE utilizador=?', (u['id'],))     # termina as outras sessões
                ck = nova_sessao(c, u['id'])
                return self.responder(200, {'ok': True}, [('Set-Cookie', ck)])
            if p == '/api/sair-tudo':
                c.execute('DELETE FROM sessoes WHERE utilizador=?', (u['id'],))
                return self.responder(200, {'ok': True}, [('Set-Cookie', COOKIE_APAGAR)])
            if p == '/api/perfil':
                perfil = limpar_perfil(corpo.get('perfil'))
                if perfil is None:
                    return self.responder(400, {'erro': 'pedido'})
                c.execute('UPDATE utilizadores SET perfil=? WHERE id=?', (json.dumps(perfil, ensure_ascii=False), u['id']))
                return self.responder(200, {'ok': True, 'perfil': perfil})
            if p == '/api/perfil/foto/apagar':
                if u['foto']:
                    try:
                        os.remove(os.path.join(FOTOS, u['foto']))
                    except OSError:
                        pass
                c.execute('UPDATE utilizadores SET foto=NULL WHERE id=?', (u['id'],))
                return self.responder(200, {'ok': True})
            if p == '/api/preferencias':
                novos = {}
                if 'prefs' in corpo:
                    novos['prefs'] = json.dumps(limpar_prefs(corpo['prefs']), ensure_ascii=False)
                if isinstance(corpo.get('marketing'), bool):
                    novos['marketing'] = 1 if corpo['marketing'] else 0
                    novos['marketing_quando'] = int(time.time())
                if novos:   # só campos permitidos; acesso e pagamentos nunca vêm do browser
                    c.execute('UPDATE utilizadores SET ' + ', '.join(k + '=?' for k in novos) + ' WHERE id=?', (*novos.values(), u['id']))
                return self.responder(200, {'ok': True})
            if p == '/api/alerta/apagar':
                i = corpo.get('id')
                if not isinstance(i, int):
                    return self.responder(400, {'erro': 'pedido'})
                c.execute('UPDATE alertas SET ativo=0 WHERE id=? AND utilizador=?', (i, u['id']))   # só os do próprio
                return self.responder(200, {'ok': True})
            if p == '/api/apagar-conta':     # RGPD: apagar os dados a pedido
                if u['foto']:
                    try:
                        os.remove(os.path.join(FOTOS, u['foto']))
                    except OSError:
                        pass
                c.execute('DELETE FROM alertas WHERE utilizador=?', (u['id'],))
                c.execute('DELETE FROM sessoes WHERE utilizador=?', (u['id'],))
                c.execute('DELETE FROM pedidos WHERE email=?', (u['email'],))
                c.execute('DELETE FROM utilizadores WHERE id=?', (u['id'],))
                return self.responder(200, {'ok': True}, [('Set-Cookie', COOKIE_APAGAR)])
        return self.responder(404, {'erro': 'nao_existe'})


def _foto(self):
    with ligar() as c:
        u = self.sessao(c)
        if not u:
            return self.responder(401, {'erro': 'sem_sessao'})
        if not limite('foto:' + str(u['id']), 10, 3600):
            return self.responder(429, {'erro': 'muitos_pedidos'})
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_FOTO:
            return self.responder(413, {'erro': 'tamanho'})
        dados = self.rfile.read(n)
        ext = tipo_imagem(dados)            # pelo conteúdo, não pelo nome nem pelo Content-Type
        if not ext:
            return self.responder(415, {'erro': 'formato'})
        os.makedirs(FOTOS, mode=0o700, exist_ok=True)
        nome = secrets.token_hex(16) + '.' + ext
        with open(os.path.join(FOTOS, nome), 'wb') as f:
            f.write(dados)
        if u['foto']:
            try:
                os.remove(os.path.join(FOTOS, u['foto']))
            except OSError:
                pass
        c.execute('UPDATE utilizadores SET foto=? WHERE id=?', (nome, u['id']))
    return self.responder(200, {'ok': True})


API.foto = _foto


def nova_sessao(c, uid):
    """Sessão nova a cada entrada (evita fixação de sessão); devolve o Set-Cookie."""
    s = secrets.token_urlsafe(32)
    agora = int(time.time())
    c.execute('INSERT INTO sessoes(hash, utilizador, expira, criada) VALUES(?,?,?,?)', (h(s), uid, agora + SESSAO_DIAS * 86400, agora))
    c.execute('DELETE FROM sessoes WHERE expira<?', (agora,))
    return cookie_sessao(s)


def _assinar(c, txt):
    seg = c.execute("SELECT valor FROM config WHERE chave='segredo'").fetchone()[0]
    return hmac.new(seg.encode(), b'oauth:' + txt.encode(), 'sha256').hexdigest()


def _pedir(url, dados=None, cab=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(dados).encode() if dados else None, headers=cab or {})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _oauth(self, prov, fase, q):
    base = self.base()
    volta = base + '/api/oauth/%s/volta' % prov
    def erro(cod):
        return self.redirecionar(base + '/#entrar-erro-' + cod, [('Set-Cookie', 'dc_oauth=; Path=/api/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax')])
    if prov == 'google' and not (GOOGLE_ID and GOOGLE_SEGREDO) or prov == 'facebook' and not (FACEBOOK_ID and FACEBOOK_SEGREDO):
        return erro('indisponivel')
    if not limite('oauth:' + self.ip(), 30, 900):
        return erro('limite')
    if fase == 'inicio':
        estado, verif = secrets.token_urlsafe(24), secrets.token_urlsafe(48)
        exp = str(int(time.time()) + 600)
        with ligar() as c:
            val = '%s.%s.%s.%s' % (prov, estado, verif, exp)
            ck = 'dc_oauth=%s.%s; Path=/api/oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax' % (val, _assinar(c, val))
        if prov == 'google':
            desafio = base64.urlsafe_b64encode(hashlib.sha256(verif.encode()).digest()).rstrip(b'=').decode()
            url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
                'client_id': GOOGLE_ID, 'redirect_uri': volta, 'response_type': 'code', 'scope': 'openid email profile',
                'state': estado, 'code_challenge': desafio, 'code_challenge_method': 'S256', 'prompt': 'select_account'})
        else:
            url = 'https://www.facebook.com/%s/dialog/oauth?' % FACEBOOK_VERSAO + urllib.parse.urlencode({
                'client_id': FACEBOOK_ID, 'redirect_uri': volta, 'state': estado, 'scope': 'email,public_profile', 'response_type': 'code'})
        return self.redirecionar(url, [('Set-Cookie', ck)])
    # volta: confirmar o estado guardado no cookie assinado (contra CSRF no login)
    m = re.search(r'(?:^|;\s*)dc_oauth=([^;]+)', self.headers.get('Cookie') or '')
    code, estado = (q.get('code') or [''])[0], (q.get('state') or [''])[0]
    if not m or not code or not estado:
        return erro('cancelado')
    partes = m.group(1).rsplit('.', 1)
    if len(partes) != 2:
        return erro('estado')
    val, assin = partes
    with ligar() as c:
        if not hmac.compare_digest(_assinar(c, val), assin):
            return erro('estado')
    try:
        p_prov, p_estado, verif, exp = val.split('.')
    except ValueError:
        return erro('estado')
    if p_prov != prov or not hmac.compare_digest(p_estado, estado) or int(exp) < time.time():
        return erro('estado')
    try:
        if prov == 'google':
            tok = _pedir('https://oauth2.googleapis.com/token', {'code': code, 'client_id': GOOGLE_ID, 'client_secret': GOOGLE_SEGREDO,
                                                                'redirect_uri': volta, 'grant_type': 'authorization_code', 'code_verifier': verif})
            info = _pedir('https://openidconnect.googleapis.com/v1/userinfo', cab={'Authorization': 'Bearer ' + tok['access_token']})
            if not info.get('email_verified'):
                return erro('email')
            email, ident, nome, col = info.get('email', '').lower(), str(info.get('sub')), info.get('name') or '', 'google_sub'
        else:
            tok = _pedir('https://graph.facebook.com/%s/oauth/access_token?' % FACEBOOK_VERSAO + urllib.parse.urlencode({
                'client_id': FACEBOOK_ID, 'client_secret': FACEBOOK_SEGREDO, 'redirect_uri': volta, 'code': code}))
            prova = hmac.new(FACEBOOK_SEGREDO.encode(), tok['access_token'].encode(), 'sha256').hexdigest()
            info = _pedir('https://graph.facebook.com/%s/me?' % FACEBOOK_VERSAO + urllib.parse.urlencode({
                'fields': 'id,name,email', 'access_token': tok['access_token'], 'appsecret_proof': prova}))
            email, ident, nome, col = (info.get('email') or '').lower(), str(info.get('id')), info.get('name') or '', 'facebook_id'
            if not email:
                return erro('email')
    except Exception as e:
        print('oauth falhou:', prov, type(e).__name__, file=sys.stderr)
        return erro('falhou')
    if not RE_EMAIL.match(email) or not ident:
        return erro('email')
    with ligar() as c:
        u = c.execute('SELECT * FROM utilizadores WHERE %s=?' % col, (ident,)).fetchone() or utilizador(c, email)
        if not u['email_ok'] and u['senha']:
            # alguém criou conta com este e-mail sem o confirmar: o dono verdadeiro (provado pelo Google/Facebook)
            # fica com a conta, a palavra-passe desconhecida é anulada e as sessões antigas terminam
            c.execute('UPDATE utilizadores SET senha=NULL WHERE id=?', (u['id'],))
            c.execute('DELETE FROM sessoes WHERE utilizador=?', (u['id'],))
        c.execute('UPDATE utilizadores SET %s=?, email_ok=1 WHERE id=?' % col, (ident, u['id']))
        perfil = json.loads(u['perfil'] or '{}')
        if nome and not perfil.get('nome'):
            perfil['nome'] = texto(nome, 60)
            c.execute('UPDATE utilizadores SET perfil=? WHERE id=?', (json.dumps(perfil, ensure_ascii=False), u['id']))
        ck = nova_sessao(c, u['id'])
    return self.redirecionar(base + '/#conta', [('Set-Cookie', ck), ('Set-Cookie', 'dc_oauth=; Path=/api/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax')])


API.oauth = _oauth


def main():
    criar_tabelas()
    srv = ThreadingHTTPServer(('127.0.0.1', PORTA), API)
    srv.daemon_threads = True
    print('DupliCasa API em 127.0.0.1:%d (e-mail %s)' % (PORTA, 'ligado' if RESEND else 'por ligar'), file=sys.stderr)
    srv.serve_forever()


if __name__ == '__main__':
    main()
