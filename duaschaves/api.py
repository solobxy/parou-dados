#!/usr/bin/env python3
"""Duas Chaves: API pequena para contas (entrar com link por e-mail), preferências e alertas.

Só biblioteca padrão (http.server + sqlite3). Corre em 127.0.0.1, atrás do Caddy (que trata do HTTPS).

Configuração (variáveis de ambiente, em /etc/duaschaves/api.env, fora do repositório):
  RESEND_API_KEY   chave do Resend para enviar e-mails (sem ela, os links ficam por enviar e a API diz isso)
  EMAIL_DE         remetente, ex.: "Duas Chaves <ola@duaschaves.pt>"
  ORIGENS          origens aceites, separadas por espaços (ex.: https://duaschaves.pt https://www.duaschaves.pt)
  DC_DB            caminho da base de dados (por omissão /var/lib/duaschaves-api/dados.db)
  DC_PORTA         porta local (por omissão 3110)

Segurança: tokens e sessões guardados só como hash SHA-256; cookie HttpOnly, Secure, SameSite=Lax;
pedidos POST só com JSON e de uma origem aceite; limites de pedidos por IP e por e-mail; respostas
iguais exista ou não o e-mail; campos do utilizador validados e com tamanho máximo.
"""
import hashlib, json, os, re, secrets, sqlite3, sys, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB = os.environ.get('DC_DB', '/var/lib/duaschaves-api/dados.db')
PORTA = int(os.environ.get('DC_PORTA', '3110'))
ORIGENS = set((os.environ.get('ORIGENS') or 'https://duaschaves.pt https://www.duaschaves.pt https://duaschaves.2-31-13-85.sslip.io').split())
RESEND = os.environ.get('RESEND_API_KEY', '')
EMAIL_DE = os.environ.get('EMAIL_DE', 'Duas Chaves <ola@duaschaves.pt>')
LINK_MIN = 20            # validade do link de entrada
SESSAO_DIAS = 30
MAX_CORPO = 64 * 1024
RE_EMAIL = re.compile(r'^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[A-Za-z]{2,24}$')

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
        ''')


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
    texto = ('Olá!\n\nToca no link para entrares na Duas Chaves:\n' + link +
             '\n\nO link vale ' + str(LINK_MIN) + ' minutos e só funciona uma vez.\n'
             'Se não pediste para entrar, ignora este e-mail.\n\nDuas Chaves')
    html = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:480px">'
            '<p>Olá!</p><p>Toca no botão para entrares na Duas Chaves.</p>'
            '<p><a href="' + link + '" style="display:inline-block;background:#0B6E4F;color:#fff;text-decoration:none;'
            'font-weight:700;padding:14px 22px;border-radius:12px">Entrar na Duas Chaves</a></p>'
            '<p style="color:#56635e;font-size:14px">O link vale ' + str(LINK_MIN) + ' minutos e só funciona uma vez. '
            'Se não pediste para entrar, ignora este e-mail.</p></div>')
    return enviar_email(para, 'O teu link para entrar na Duas Chaves', texto, html)


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
    for k in ('soProt', 'soPart', 'soFotos', 'comPreco'):
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
        m = re.search(r'(?:^|;\s*)dc_sessao=([A-Za-z0-9_\-]{20,100})', ck)
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
            return self.responder(200, {'ok': True, 'email': bool(RESEND)})
        if url.path == '/api/eu':
            with ligar() as c:
                u = self.sessao(c)
                if not u:
                    return self.responder(401, {'erro': 'sem_sessao'})
                return self.responder(200, {
                    'email': u['email'], 'marketing': bool(u['marketing']), 'prefs': json.loads(u['prefs'] or '{}'),
                    'acesso': {'ate': (u['acesso_ate'] or 0) * 1000, 'renova': bool(u['renova'])} if u['acesso_ate'] else None,
                    'alertas': [dict(id=a['id'], filtro=json.loads(a['filtro'])) for a in
                                c.execute('SELECT id, filtro FROM alertas WHERE utilizador=? AND ativo=1 ORDER BY id DESC', (u['id'],))]})
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
                s = secrets.token_urlsafe(32)
                c.execute('INSERT INTO sessoes(hash, utilizador, expira) VALUES(?,?,?)', (h(s), u['id'], agora + SESSAO_DIAS * 86400))
                c.execute('DELETE FROM sessoes WHERE expira<?', (agora,))
            ck = 'dc_sessao=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Lax' % (s, SESSAO_DIAS * 86400)
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
        corpo = self.corpo_json()
        if corpo is None or not isinstance(corpo, dict):
            return self.responder(400, {'erro': 'pedido'})
        p = urllib.parse.urlsplit(self.path).path
        ip = self.ip()

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
                m = re.search(r'(?:^|;\s*)dc_sessao=([A-Za-z0-9_\-]{20,100})', ck)
                if m:
                    c.execute('DELETE FROM sessoes WHERE hash=?', (h(m.group(1)),))
                return self.responder(200, {'ok': True}, [('Set-Cookie', 'dc_sessao=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax')])
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
                c.execute('DELETE FROM alertas WHERE utilizador=?', (u['id'],))
                c.execute('DELETE FROM sessoes WHERE utilizador=?', (u['id'],))
                c.execute('DELETE FROM utilizadores WHERE id=?', (u['id'],))
                return self.responder(200, {'ok': True}, [('Set-Cookie', 'dc_sessao=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax')])
        return self.responder(404, {'erro': 'nao_existe'})


def main():
    criar_tabelas()
    srv = ThreadingHTTPServer(('127.0.0.1', PORTA), API)
    srv.daemon_threads = True
    print('Duas Chaves API em 127.0.0.1:%d (e-mail %s)' % (PORTA, 'ligado' if RESEND else 'por ligar'), file=sys.stderr)
    srv.serve_forever()


if __name__ == '__main__':
    main()
