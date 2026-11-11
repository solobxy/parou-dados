#!/usr/bin/env python3
"""caiu.pt — API pequena em 127.0.0.1:3150 (o Caddy envia-lhe /api/*).

GET  /api/saude                       estado (e-mail e notificações ligados?)
GET  /api/procurar?q=&o=&fim=1        pesquisa rápida nos produtos do dia (fim=1: pesquisa acabada; as sem resultado
                                      entram na recolha seguinte)
GET  /api/produtos?ids=a,b            produtos do dia (para a lista e a folha do produto)
POST /api/seguir                      {email, produtos:[{i,p,n}], semanal} seguir preços por e-mail (com confirmação)
GET  /api/confirmar?t=                confirma o e-mail e volta ao site
GET  /api/conta?t=                    o que a pessoa segue (para a gerir no site)
POST /api/conta                       {t, acao: tirar|semanal|sair, produto?, valor?}
GET|POST /api/sair?t=                 deixa de receber tudo (um clique, também pelo cabeçalho List-Unsubscribe)
GET  /api/push/chave                  chave pública VAPID
POST /api/push                        {sub, produtos, semanal} notificações no telemóvel
POST /api/push/sair                   {endpoint}

Guarda só o e-mail, o que cada pessoa segue e a subscrição das notificações. Sem cookies.
"""
import json, os, re, sys, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comum as C

PORTA = int(os.environ.get('CAIU_PORTA', '3150'))
ORIGENS = set(C.SITES) | {'http://127.0.0.1:8765'}
MAX_CORPO = 24_000
MAX_SEGUIDOS = 300
P = C.Produtos()
_limites, _trinco = {}, threading.Lock()


def limite(chave, n, janela):
    agora = time.time()
    with _trinco:
        v = [t for t in _limites.get(chave, []) if agora - t < janela]
        if len(v) >= n:
            _limites[chave] = v
            return False
        v.append(agora)
        _limites[chave] = v
        if len(_limites) > 20000:
            _limites.clear()
        return True


def produtos_validos(lista):
    """[{i, p, n}] -> [(id, preço de referência, nome)] só com produtos que existem hoje."""
    P.atualizar()
    out = []
    for x in (lista or [])[:MAX_SEGUIDOS]:
        if not isinstance(x, dict):
            continue
        i = str(x.get('i') or '')
        if i not in P.g:
            continue
        mn = P.minimo(i)[0]
        try:
            ref = float(x.get('p'))
        except (TypeError, ValueError):
            ref = mn
        ref = ref if 0 < ref < 10000 else mn
        out.append((i, round(min(ref, mn * 3), 2), P.g[i][1][:140]))
    return out


def email_confirmar(base, pessoa, seguidos):
    t = pessoa['token']
    link = '%s/api/confirmar?t=%s' % (base, t)
    sair = '%s/api/sair?t=%s' % (base, t)
    nomes = [n for _, _, n in seguidos][:8]
    lista_txt = ''.join('\n- ' + n for n in nomes)
    lista_html = ''.join('<li style="margin:2px 0">%s</li>' % C.esc(n) for n in nomes)
    texto = ('Olá,\n\nPara receberes os avisos do caiu.pt confirma o teu e-mail neste link:\n%s\n'
             '%s\n\nSe não foste tu, ignora este e-mail: sem confirmação não enviamos mais nada.\n\ncaiu.pt' %
             (link, ('\nVais seguir:' + lista_txt) if nomes else ''))
    corpo = ('<p style="margin:0 0 14px;font-size:22px;font-weight:800;line-height:1.2">Confirma o teu e-mail</p>'
             '<p style="margin:0 0 18px">Assim que confirmares, avisamos quando o preço baixar%s.</p>'
             '%s'
             '<p style="margin:22px 0"><a href="%s" style="display:inline-block;background:#141414;color:#FFFFFF;'
             'text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">Confirmar e-mail</a></p>') % (
        ' e enviamos à quinta os descontos a sério da semana' if pessoa['semanal'] else '',
        ('<p style="margin:0 0 6px;font-weight:700">Vais seguir:</p><ul style="margin:0;padding-left:20px">%s</ul>' % lista_html) if nomes else '',
        link)
    rodape = 'Se não foste tu, ignora este e-mail: sem confirmação não enviamos mais nada.'
    return C.enviar_email(pessoa['email'], 'Confirma o teu e-mail no caiu.pt', texto,
                          C.molde_email('Confirma o teu e-mail', corpo, rodape), sair)


class API(BaseHTTPRequestHandler):
    server_version = 'caiu'
    sys_version = ''

    def log_message(self, fmt, *a):          # sem e-mails nem tokens nos registos
        sys.stderr.write('%s %s\n' % (self.command, self.path.split('?')[0]))

    def ip(self):
        return (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()

    def responder(self, cod, corpo=None, cache='no-store'):
        dados = json.dumps(corpo if corpo is not None else {}, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(cod)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', cache)
        self.send_header('Content-Length', str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def ir(self, destino):
        self.send_response(303)
        self.send_header('Location', destino)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def base(self):
        b = 'https://' + self.headers.get('Host', '')
        return b if b in ORIGENS else C.SITES[0]

    def origem_ok(self):
        o = self.headers.get('Origin')
        return (o in ORIGENS) if o else (('https://' + self.headers.get('Host', '')) in ORIGENS)

    def corpo_json(self):
        if not (self.headers.get('Content-Type') or '').startswith('application/json'):
            return None
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_CORPO:
            return None
        try:
            j = json.loads(self.rfile.read(n))
        except ValueError:
            return None
        return j if isinstance(j, dict) else None

    # ---------- GET ----------
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(url.query)
        arg = lambda k: (q.get(k) or [''])[0]
        p = url.path

        if p == '/api/saude':
            P.atualizar()
            return self.responder(200, {'ok': True, 'email': bool(C.RESEND), 'push': True, 'dia': P.dia, 'produtos': len(P.g)})

        if p == '/api/procurar':
            if not limite('q:' + self.ip(), 240, 60):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            termo = arg('q').strip()[:80]
            try:
                o = max(0, min(2000, int(arg('o') or 0)))
            except ValueError:
                o = 0
            ids = P.procurar(termo)
            if arg('fim') == '1' and not ids and 3 <= len(termo) <= 40 and re.fullmatch(r"[\wÀ-ÿ' .&-]+", termo):
                t = C.norm(termo).strip()
                with C.ligar() as c:
                    c.execute('INSERT INTO sem_resultado(termo, vezes, ultimo) VALUES(?,1,?) '
                              'ON CONFLICT(termo) DO UPDATE SET vezes=vezes+1, ultimo=excluded.ultimo', (t, int(time.time())))
            return self.responder(200, {'dia': P.dia, 'total': len(ids), 'r': [P.g[i] for i in ids[o:o + 20]]}, 'public, max-age=120')

        if p == '/api/produtos':
            P.atualizar()
            ids = [i for i in arg('ids').split(',') if i][:MAX_SEGUIDOS]
            return self.responder(200, {'dia': P.dia, 'r': [P.g[i] for i in ids if i in P.g]}, 'public, max-age=120')

        if p == '/api/confirmar':
            t = arg('t')
            with C.ligar() as c:
                r = c.execute('SELECT id FROM pessoas WHERE token=? AND saiu=0', (t,)).fetchone() if t else None
                if not r:
                    return self.ir('/?ok=link-velho')
                c.execute('UPDATE pessoas SET confirmado=? WHERE id=? AND confirmado=0', (int(time.time()), r['id']))
            return self.ir('/?ok=confirmado#conta=' + urllib.parse.quote(t))

        if p == '/api/sair':
            self.sair(arg('t'))
            return self.ir('/?ok=saiu')

        if p == '/api/conta':
            t = arg('t')
            if not limite('c:' + self.ip(), 60, 600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            with C.ligar() as c:
                r = c.execute('SELECT * FROM pessoas WHERE token=? AND saiu=0', (t,)).fetchone() if t else None
                if not r:
                    return self.responder(404, {'erro': 'conta'})
                seg = c.execute('SELECT produto, nome, ref FROM seguidos WHERE pessoa=? ORDER BY criado DESC', (r['id'],)).fetchall()
            em = r['email']
            mascara = em[0] + '•••' + em[em.index('@'):] if '@' in em else em
            return self.responder(200, {'email': mascara, 'confirmado': bool(r['confirmado']), 'semanal': bool(r['semanal']),
                                        'seguidos': [{'i': s['produto'], 'n': s['nome'], 'ref': s['ref']} for s in seg]})

        if p == '/api/push/chave':
            return self.responder(200, {'chave': C.chaves_vapid()[1]}, 'public, max-age=86400')

        return self.responder(404, {'erro': 'nada'})

    def sair(self, t):
        if not t:
            return
        with C.ligar() as c:
            r = c.execute('SELECT id FROM pessoas WHERE token=?', (t,)).fetchone()
            if r:
                c.execute('DELETE FROM seguidos WHERE pessoa=?', (r['id'],))
                # fica só o e-mail marcado como «saiu» (para não voltar a enviar nada sem nova confirmação)
                c.execute('UPDATE pessoas SET saiu=?, semanal=0 WHERE id=?', (int(time.time()), r['id']))

    # ---------- POST ----------
    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        p = url.path
        if p == '/api/sair':                  # um clique a partir do cliente de e-mail (RFC 8058)
            self.sair((urllib.parse.parse_qs(url.query).get('t') or [''])[0])
            return self.responder(200, {'ok': True})
        if not self.origem_ok():
            return self.responder(403, {'erro': 'origem'})
        corpo = self.corpo_json()
        if corpo is None:
            return self.responder(400, {'erro': 'pedido'})
        ip = self.ip()

        if p == '/api/seguir':
            email = str(corpo.get('email') or '').strip().lower()
            if not C.RE_EMAIL.match(email):
                return self.responder(400, {'erro': 'email'})
            if corpo.get('site'):             # isco para robôs
                return self.responder(200, {'ok': True, 'estado': 'confirmar'})
            if not limite('s:' + ip, 30, 3600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            seguidos = produtos_validos(corpo.get('produtos'))
            semanal = 1 if corpo.get('semanal') else 0
            agora = int(time.time())
            with C.ligar() as c:
                r = c.execute('SELECT * FROM pessoas WHERE email=?', (email,)).fetchone()
                if not r:
                    c.execute('INSERT INTO pessoas(email, token, semanal, criado) VALUES(?,?,?,?)', (email, C.novo_token(), semanal, agora))
                    r = c.execute('SELECT * FROM pessoas WHERE email=?', (email,)).fetchone()
                elif r['saiu']:                # voltou: tem de confirmar outra vez
                    c.execute('UPDATE pessoas SET saiu=0, confirmado=0, token=?, semanal=?, conf_vezes=0 WHERE id=?',
                              (C.novo_token(), semanal, r['id']))
                    r = c.execute('SELECT * FROM pessoas WHERE id=?', (r['id'],)).fetchone()
                elif semanal and not r['semanal']:
                    c.execute('UPDATE pessoas SET semanal=1 WHERE id=?', (r['id'],))
                total = c.execute('SELECT count(*) FROM seguidos WHERE pessoa=?', (r['id'],)).fetchone()[0]
                for i, ref, nome in seguidos[:max(0, MAX_SEGUIDOS - total)]:
                    c.execute('INSERT INTO seguidos(pessoa, produto, nome, ref, criado) VALUES(?,?,?,?,?) '
                              'ON CONFLICT(pessoa, produto) DO NOTHING', (r['id'], i, nome, ref, agora))
                if r['confirmado']:
                    return self.responder(200, {'ok': True, 'estado': 'ativo', 'seguidos': len(seguidos)})
                # confirmação: no máximo 3 e-mails por dia para o mesmo endereço
                # e não repete se o último saiu há menos de 30 minutos (cada produto seguido não gera um e-mail novo)
                if r['conf_enviado'] and (agora - r['conf_enviado'] < 1800 or
                                          (agora - r['conf_enviado'] < 86400 and r['conf_vezes'] >= 3)):
                    return self.responder(200, {'ok': True, 'estado': 'confirmar'})
                env = email_confirmar(self.base(), r, seguidos)
                if env:
                    vezes = (r['conf_vezes'] + 1) if r['conf_enviado'] and agora - r['conf_enviado'] < 86400 else 1
                    c.execute('UPDATE pessoas SET conf_enviado=?, conf_vezes=? WHERE id=?', (agora, vezes, r['id']))
                c.execute('INSERT INTO envios VALUES(?,?,?)', (agora, 'confirmar', {True: 'ok', False: 'falhou', None: 'sem_servico'}[env]))
            return self.responder(200, {'ok': True, 'estado': 'confirmar' if env else ('sem_servico' if env is None else 'falhou')})

        if p == '/api/conta':
            t = str(corpo.get('t') or '')
            if not limite('c:' + ip, 60, 600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            with C.ligar() as c:
                r = c.execute('SELECT * FROM pessoas WHERE token=? AND saiu=0', (t,)).fetchone() if t else None
                if not r:
                    return self.responder(404, {'erro': 'conta'})
                acao = corpo.get('acao')
                if acao == 'tirar':
                    c.execute('DELETE FROM seguidos WHERE pessoa=? AND produto=?', (r['id'], str(corpo.get('produto') or '')))
                elif acao == 'semanal':
                    c.execute('UPDATE pessoas SET semanal=? WHERE id=?', (1 if corpo.get('valor') else 0, r['id']))
                elif acao == 'juntar':
                    agora = int(time.time())
                    for i, ref, nome in produtos_validos(corpo.get('produtos'))[:MAX_SEGUIDOS]:
                        c.execute('INSERT INTO seguidos(pessoa, produto, nome, ref, criado) VALUES(?,?,?,?,?) '
                                  'ON CONFLICT(pessoa, produto) DO NOTHING', (r['id'], i, nome, ref, agora))
                elif acao == 'sair':
                    pass
                else:
                    return self.responder(400, {'erro': 'acao'})
            if acao == 'sair':
                self.sair(t)
            return self.responder(200, {'ok': True})

        if p == '/api/push':
            sub = corpo.get('sub') if isinstance(corpo.get('sub'), dict) else {}
            ep = str(sub.get('endpoint') or '')
            chaves = sub.get('keys') if isinstance(sub.get('keys'), dict) else {}
            p256, auth = str(chaves.get('p256dh') or ''), str(chaves.get('auth') or '')
            if not C.endpoint_ok(ep) or not re.fullmatch(r'[A-Za-z0-9_\-]{80,100}', p256) or not re.fullmatch(r'[A-Za-z0-9_\-]{16,30}', auth):
                return self.responder(400, {'erro': 'subscricao'})
            if not limite('p:' + ip, 60, 3600):
                return self.responder(429, {'erro': 'muitos_pedidos'})
            agora = int(time.time())
            semanal = 1 if corpo.get('semanal', True) else 0
            with C.ligar() as c:
                c.execute('INSERT INTO push(endpoint, p256dh, auth, semanal, criado) VALUES(?,?,?,?,?) '
                          'ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, semanal=excluded.semanal, falhas=0',
                          (ep, p256, auth, semanal, agora))
                pid = c.execute('SELECT id FROM push WHERE endpoint=?', (ep,)).fetchone()[0]
                if isinstance(corpo.get('tirar'), str):
                    c.execute('DELETE FROM push_seguidos WHERE push=? AND produto=?', (pid, corpo['tirar']))
                for i, ref, nome in produtos_validos(corpo.get('produtos')):
                    c.execute('INSERT INTO push_seguidos(push, produto, nome, ref, criado) VALUES(?,?,?,?,?) '
                              'ON CONFLICT(push, produto) DO NOTHING', (pid, i, nome, ref, agora))
            return self.responder(200, {'ok': True})

        if p == '/api/push/sair':
            ep = str(corpo.get('endpoint') or '')
            with C.ligar() as c:
                r = c.execute('SELECT id FROM push WHERE endpoint=?', (ep,)).fetchone()
                if r:
                    c.execute('DELETE FROM push_seguidos WHERE push=?', (r['id'],))
                    c.execute('DELETE FROM push WHERE id=?', (r['id'],))
            return self.responder(200, {'ok': True})

        return self.responder(404, {'erro': 'nada'})


if __name__ == '__main__':
    C.ligar().close()
    C.chaves_vapid()
    print('caiu.pt API em 127.0.0.1:%d (e-mail %s)' % (PORTA, 'ligado' if C.RESEND else 'por ligar'), file=sys.stderr)
    ThreadingHTTPServer(('127.0.0.1', PORTA), API).serve_forever()
