"""caiu.pt — peças comuns à API (api.py) e aos avisos (alertas.py).

- produtos do dia (lista.json) em memória e pesquisa;
- base de dados das pessoas que seguem preços (SQLite em /var/lib/caiu-api);
- envio de e-mails (Resend) e de notificações no telemóvel (Web Push com VAPID, RFC 8291/8292).
"""
import base64, json, os, re, secrets, sqlite3, struct, threading, time, unicodedata, urllib.parse, urllib.request

DADOS = os.environ.get('CAIU_DADOS', '/var/lib/caiu-dados')
ESTADO = os.environ.get('CAIU_ESTADO', '/var/lib/caiu-api')
RESEND = os.environ.get('RESEND_API_KEY', '')
EMAIL_DE = os.environ.get('EMAIL_DE', 'caiu.pt <avisos@parou.pt>')
ADMIN = os.environ.get('ADMIN_EMAIL', '')
# Endereços onde o site responde (o primeiro é o principal); os links dos e-mails usam o que estiver no ar
SITES = [s for s in os.environ.get('CAIU_SITES', 'https://caiu.pt,https://caiu.2-31-13-85.sslip.io').split(',') if s]
LOJAS = {'c': 'Continente', 'p': 'Pingo Doce', 'a': 'Auchan'}
RE_EMAIL = re.compile(r'^[^@\s<>"\'(),;:]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}$')


def norm(t):
    return unicodedata.normalize('NFD', str(t or '')).encode('ascii', 'ignore').decode().lower()


def eur(v):
    return ('%.2f' % v).replace('.', ',') + '\u00a0€'


def esc(t):
    return str(t or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


# ---------- produtos do dia ----------
class Produtos:
    """lista.json em memória; volta a ler quando o ficheiro muda (depois de cada recolha)."""

    def __init__(self, pasta=DADOS):
        self.pasta = pasta
        self.mtime = 0
        self.g = {}          # id -> grupo compacto (formato de recolher.py: comp)
        self.idx = []        # (chave normalizada, nome normalizado, mínimo, n.º de lojas, veredito, id)
        self.dia = ''
        self.trinco = threading.Lock()

    def atualizar(self):
        f = os.path.join(self.pasta, 'lista.json')
        try:
            m = os.path.getmtime(f)
        except OSError:
            return
        if m == self.mtime:
            return
        with self.trinco:
            if m == self.mtime:
                return
            with open(f, encoding='utf-8') as fh:
                j = json.load(fh)
            g, idx = {}, []
            for a in j.get('g', []):
                g[a[0]] = a
                mn = min(o[2] for o in a[7])
                idx.append((norm('%s %s %s' % (a[1], a[2], a[3])), norm(a[1]), mn, len(a[7]), a[6], a[0]))
            self.g, self.idx, self.dia, self.mtime = g, idx, j.get('dia', ''), m

    def procurar(self, q):
        self.atualizar()
        t = [x for x in re.split(r'[^a-z0-9%]+', norm(q)) if x][:8]
        if not t:
            return []
        testes = []
        for x in t:
            alts = [x]
            if len(x) > 4 and x.endswith('s'):
                alts.append(x[:-1])
            if len(x) > 4 and x.endswith('es'):
                alts.append(x[:-2])
            testes.append([re.compile(r'(^|[^a-z0-9])' + re.escape(a)) for a in alts])
        out = []
        for k, nome, mn, nl, v, i in self.idx:
            if not all(any(r.search(k) for r in alts) for alts in testes):
                continue
            s = nl * 2
            if nome.startswith(t[0]):
                s += 3
            if any(r.search(nome) for r in testes[0]):
                s += 2
            if v in ('fachada', 'real'):
                s += 1
            out.append((-s, mn, i))
        out.sort()
        return [i for _, _, i in out]

    def minimo(self, i):
        """(preço mais baixo, loja, veredito dessa oferta) de um produto, ou None."""
        a = self.g.get(i)
        if not a:
            return None
        o = min(a[7], key=lambda o: o[2])
        return o[2], o[0], o[8]


# ---------- base de dados ----------
def ligar():
    os.makedirs(ESTADO, exist_ok=True)
    c = sqlite3.connect(os.path.join(ESTADO, 'caiu.db'), timeout=20)
    c.row_factory = sqlite3.Row
    c.executescript('''
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS pessoas(id INTEGER PRIMARY KEY, email TEXT UNIQUE, token TEXT UNIQUE,
        confirmado INTEGER DEFAULT 0, semanal INTEGER DEFAULT 0, criado INTEGER, conf_enviado INTEGER DEFAULT 0,
        conf_vezes INTEGER DEFAULT 0, ultimo_semanal TEXT DEFAULT '', saiu INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS seguidos(pessoa INTEGER, produto TEXT, nome TEXT, ref REAL, criado INTEGER,
        avisado INTEGER DEFAULT 0, PRIMARY KEY(pessoa, produto));
      CREATE TABLE IF NOT EXISTS push(id INTEGER PRIMARY KEY, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT,
        semanal INTEGER DEFAULT 1, criado INTEGER, falhas INTEGER DEFAULT 0, ultimo_semanal TEXT DEFAULT '');
      CREATE TABLE IF NOT EXISTS push_seguidos(push INTEGER, produto TEXT, nome TEXT, ref REAL, criado INTEGER,
        avisado INTEGER DEFAULT 0, PRIMARY KEY(push, produto));
      CREATE TABLE IF NOT EXISTS sem_resultado(termo TEXT PRIMARY KEY, vezes INTEGER, ultimo INTEGER);
      CREATE TABLE IF NOT EXISTS envios(ts INTEGER, tipo TEXT, estado TEXT);
    ''')
    return c


def novo_token():
    return secrets.token_urlsafe(24)


# ---------- e-mail ----------
def enviar_email(para, assunto, texto, html, sair=None):
    """True se o Resend aceitou, False se falhou, None se o envio ainda não está ligado."""
    if not RESEND:
        return None
    corpo = {'from': EMAIL_DE, 'to': [para], 'subject': assunto, 'text': texto, 'html': html}
    if sair:
        corpo['headers'] = {'List-Unsubscribe': '<%s>' % sair, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'}
    req = urllib.request.Request('https://api.resend.com/emails', data=json.dumps(corpo).encode(), method='POST',
                                 headers={'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json',
                                          'User-Agent': 'caiu.pt'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def site_no_ar():
    """O primeiro endereço do site que responde (o caiu.pt quando o domínio já aponta para o servidor)."""
    for s in SITES:
        try:
            with urllib.request.urlopen(s + '/api/saude', timeout=6) as r:
                if r.status == 200:
                    return s
        except Exception:
            continue
    return SITES[-1]


def molde_email(titulo, corpo_html, rodape_html):
    """E-mail simples e legível em qualquer cliente: tabela, estilos em linha, sem imagens de fora."""
    return f'''<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{esc(titulo)}</title></head>
<body style="margin:0;background:#F2F2EC;font-family:Helvetica,Arial,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:#FFD83D;padding:18px 24px;font-size:26px;font-weight:900;letter-spacing:-1px">caiu</td></tr>
<tr><td style="padding:24px 24px 8px;font-size:16px;line-height:1.5">{corpo_html}</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:13px;line-height:1.5;color:#55554F">{rodape_html}</td></tr>
</table></td></tr></table></body></html>'''


# ---------- notificações no telemóvel (Web Push) ----------
def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def ub64u(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def chaves_vapid():
    """(chave privada, chave pública em base64url). Criadas uma vez e guardadas em ESTADO/vapid.pem."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    f = os.path.join(ESTADO, 'vapid.pem')
    if os.path.exists(f):
        with open(f, 'rb') as fh:
            priv = serialization.load_pem_private_key(fh.read(), None)
    else:
        os.makedirs(ESTADO, exist_ok=True)
        priv = ec.generate_private_key(ec.SECP256R1())
        pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        fd = os.open(f + '.tmp', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'wb') as fh:
            fh.write(pem)
        os.replace(f + '.tmp', f)
    pub = priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return priv, b64u(pub)


def cifrar_push(p256dh, auth, dados):
    """Cifra a mensagem para o navegador (RFC 8291, aes128gcm)."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    ua_pub = ub64u(p256dh)
    segredo = ub64u(auth)
    ua = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub)
    as_priv = ec.generate_private_key(ec.SECP256R1())
    as_pub = as_priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    ecdh = as_priv.exchange(ec.ECDH(), ua)
    ikm = HKDF(hashes.SHA256(), 32, salt=segredo, info=b'WebPush: info\x00' + ua_pub + as_pub).derive(ecdh)
    sal = os.urandom(16)
    cek = HKDF(hashes.SHA256(), 16, salt=sal, info=b'Content-Encoding: aes128gcm\x00').derive(ikm)
    nonce = HKDF(hashes.SHA256(), 12, salt=sal, info=b'Content-Encoding: nonce\x00').derive(ikm)
    ct = AESGCM(cek).encrypt(nonce, dados + b'\x02', None)
    return sal + struct.pack('>I', 4096) + bytes([len(as_pub)]) + as_pub + ct


def cabecalho_vapid(endpoint, priv, pub, contacto='mailto:avisos@parou.pt'):
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    u = urllib.parse.urlsplit(endpoint)
    cab = b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}, separators=(',', ':')).encode())
    cor = b64u(json.dumps({'aud': '%s://%s' % (u.scheme, u.netloc), 'exp': int(time.time()) + 12 * 3600, 'sub': contacto},
                          separators=(',', ':')).encode())
    r, s = decode_dss_signature(priv.sign(('%s.%s' % (cab, cor)).encode(), ec.ECDSA(hashes.SHA256())))
    return 'vapid t=%s.%s.%s, k=%s' % (cab, cor, b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big')), pub)


def enviar_push(sub, mensagem, priv, pub, ttl=86400):
    """sub: dict com endpoint, p256dh, auth. Devolve o código HTTP (201 = entregue; 404/410 = já não existe)."""
    corpo = cifrar_push(sub['p256dh'], sub['auth'], json.dumps(mensagem, ensure_ascii=False).encode())
    req = urllib.request.Request(sub['endpoint'], data=corpo, method='POST', headers={
        'Authorization': cabecalho_vapid(sub['endpoint'], priv, pub), 'TTL': str(ttl), 'Urgency': 'normal',
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def endpoint_ok(e):
    """Só serviços de notificações conhecidos (evita usar o servidor para pedir outros endereços)."""
    try:
        u = urllib.parse.urlsplit(e)
    except ValueError:
        return False
    h = (u.hostname or '').lower()
    return u.scheme == 'https' and len(e) < 1000 and any(h == d or h.endswith('.' + d) for d in (
        'fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com',
        'notify.windows.com', 'push.apple.com', 'web.push.apple.com'))
