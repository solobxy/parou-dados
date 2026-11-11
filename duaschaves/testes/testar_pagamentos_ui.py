# Pagamentos da DupliCasa no browser (Chromium, 390 px), contra uma ifthenpay simulada:
# MB WAY (número, espera, confirmado), Multibanco (referência, ativa sozinho), cartão (sai e volta), número errado,
# renovar, e nenhum texto a prometer «cancelar». Capturas em /tmp/dc-pag-ui/.
# Uso: python3 duaschaves/testes/testar_pagamentos_ui.py <pasta com lista.json>
import json, os, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DC = os.path.dirname(AQUI)
SITE = os.path.join(os.path.dirname(DC), 'sites', 'duaschaves')
DADOS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dc-dados'
P_API, P_IF, P_WEB = 3113, 3198, 8797
U = 'http://localhost:%d/' % P_WEB
ANTI = 'anti-ui-0987654321'
SAIDA = '/tmp/dc-pag-ui'
os.makedirs(SAIDA, exist_ok=True)
falhas = []


def ok(c, m, extra=''):
    print(('ok    ' if c else 'FALHA ') + m + (('  ' + str(extra)[:200]) if extra and not c else ''))
    if not c:
        falhas.append(m)


F = {'pagos': {}, 'mbway': []}


class IF(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def resp(self, d):
        b = json.dumps(d).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.path == '/spg/payment/mbway':
            F['mbway'].append(d)
            return self.resp({'Message': 'Pending', 'orderId': d['orderId'], 'RequestId': 'mb' + d['orderId'], 'Status': '000'})
        if self.path == '/multibanco/reference/init':
            return self.resp({'Amount': d['amount'], 'Entity': '11249', 'ExpiryDate': '14-11-2026', 'Message': 'Success', 'OrderId': d['orderId'],
                              'Reference': '123456789', 'RequestId': 'rq' + d['orderId'], 'Status': '0'})
        if self.path.startswith('/creditcard/init/'):
            return self.resp({'Message': 'Success', 'PaymentUrl': 'https://pagamento.exemplo/' + d['orderId'] + '?volta=' + urllib.parse.quote(d['successUrl']),
                              'RequestId': 'cc' + d['orderId'], 'Status': '0'})
        if self.path == '/v2/payments/read':
            return self.resp({'payments': [{'orderId': o, 'amount': v} for o, v in F['pagos'].items() if o == d.get('orderId')]})
        return self.resp({'Status': '404'})

    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        rid = q.get('requestId', [''])[0]
        if rid[2:] in F['pagos']:
            return self.resp({'Message': 'Success', 'Status': '000'})
        return self.resp({'Message': 'Pending', 'Status': '123'})


srv = ThreadingHTTPServer(('127.0.0.1', P_IF), IF)
threading.Thread(target=srv.serve_forever, daemon=True).start()
pasta = tempfile.mkdtemp(prefix='dc-pag-ui-')
env = dict(os.environ, DC_DB=os.path.join(pasta, 'dados.db'), DC_PORTA=str(P_API), ORIGENS='http://localhost:%d' % P_WEB,
           IFTHEN_BASE='http://127.0.0.1:%d' % P_IF, IFTHEN_MBWAY='K1', IFTHEN_MB='K2', IFTHEN_CCARD='K3', IFTHEN_BO='K4', IFTHEN_ANTI=ANTI,
           SITE_BASE='http://localhost:%d' % P_WEB, RESEND_API_KEY='')
api = subprocess.Popen([sys.executable, os.path.join(DC, 'api.py')], env=env, stderr=subprocess.DEVNULL)
web = subprocess.Popen([sys.executable, os.path.join(AQUI, 'servidor_teste.py'), SITE, DADOS, str(P_WEB), 'http://127.0.0.1:%d' % P_API],
                       stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
time.sleep(1.5)


def aviso(ordem, valor):
    q = urllib.parse.urlencode({'key': ANTI, 'id': ordem, 'amount': valor})
    r = urllib.request.Request('http://127.0.0.1:%d/api/ifthenpay/aviso?%s' % (P_API, q), headers={'Host': 'localhost:%d' % P_WEB})
    with urllib.request.urlopen(r) as x:
        return x.status


try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        def novo():
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
            ctx.add_init_script("try{localStorage.setItem('dc-promo',String(Date.now()));localStorage.setItem('dc-alerta-pop',String(Date.now()));localStorage.setItem('dc-instalar','1')}catch(e){}")
            pg = ctx.new_page()
            er = []
            pg.on('pageerror', lambda e: er.append(str(e)))
            pg.route(lambda u: 'localhost' not in u and 'pagamento.exemplo' not in u, lambda r: r.abort())
            with pg.expect_response(lambda r: '/api/saude' in r.url, timeout=15000):
                pg.goto(U + '#precos')
            pg.wait_for_timeout(700)
            return ctx, pg, er

        def acesso(pg):
            return pg.evaluate("fetch('/api/dispositivo').then(r=>r.json()).then(d=>!!(d.acesso&&d.acesso.ate>Date.now()))")

        def abrir(pg, alvo):
            pg.evaluate("location.hash='inicio'")
            pg.wait_for_timeout(200)
            pg.evaluate("location.hash='renovar'")
            pg.wait_for_selector(alvo, timeout=5000)

        # 1. MB WAY
        ctx, pg, er = novo()
        abrir(pg, '#f-acesso')
        t = pg.inner_text('#f-acesso')
        ok(all(x in t for x in ('MB WAY', 'Multibanco', 'Cartão')), 'paywall: MB WAY, Multibanco e Cartão')
        ok('cancel' not in t.lower() and 'Não há renovação automática' in t, 'paywall: sem «cancelar», diz que não renova sozinho', t[-300:])
        ok(pg.is_visible('#ac-tel'), 'com MB WAY escolhido, pede o número')
        pg.screenshot(path=SAIDA + '/1-paywall.png', full_page=False)
        pg.fill('#ac-email', 'ana@teste.pt')
        pg.fill('#ac-tel', '21 234 5678')
        pg.click('#f-acesso button[type=submit]')
        pg.wait_for_timeout(300)
        ok('Escreve o número com MB WAY' in pg.inner_text('#f-acesso'), 'número fixo: erro no campo, sem pedir pagamento')
        pg.fill('#ac-tel', '912345678')
        pg.click('#f-acesso button[type=submit]')
        pg.wait_for_selector('text=Confirma na app MB WAY', timeout=8000)
        t = pg.inner_text('dialog')
        ok('912 345 678' in t and '1,00' in t, 'espera: diz o número e o valor', t)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=SAIDA + '/2-mbway-espera.png')
        ordem = F['mbway'][-1]['orderId'] if F['mbway'] else ''
        F['pagos'][ordem] = 1.0
        pg.wait_for_selector('text=Pagamento confirmado', timeout=15000)
        ok('Tens acesso até' in pg.inner_text('dialog'), 'confirmado: diz até quando')
        pg.screenshot(path=SAIDA + '/3-confirmado.png')
        pg.click('#pg-continuar')
        pg.wait_for_timeout(500)
        ok(not pg.is_visible('#f-renovar') and not pg.is_visible('#f-acesso'), 'depois de «Continuar» não volta a pedir pagamento')
        ok(acesso(pg), 'acesso ativo depois de pagar')
        # renovar
        abrir(pg, '#f-renovar')
        t = pg.inner_text('#f-renovar')
        ok('9,99' in t and 'somar' in t and 'Não há renovação automática' in t, 'renovar: 9,99 €, os dias somam-se', t)
        ok(pg.input_value('#rn-tel') == '912 345 678', 'renovar: o número já vem preenchido')
        pg.screenshot(path=SAIDA + '/4-renovar.png')
        ok(not er, 'sem erros no browser (MB WAY)', er)
        ctx.close()

        # 2. Multibanco
        ctx, pg, er = novo()
        abrir(pg, '#f-acesso')
        pg.fill('#ac-email', 'bia@teste.pt')
        pg.check('input[name=ac-metodo][value=multibanco]', force=True)
        ok(not pg.is_visible('#ac-tel'), 'Multibanco: não pede número')
        pg.click('#f-acesso button[type=submit]')
        pg.wait_for_selector('.pg-ref', timeout=8000)
        t = pg.inner_text('dialog')
        ok('11249' in t and '123 456 789' in t and '1,00' in t, 'referência: entidade, referência e valor', t)
        ok('14/11/2026' in t, 'validade com a data em formato português', t)
        pg.screenshot(path=SAIDA + '/5-multibanco.png')
        import sqlite3
        c = sqlite3.connect(env['DC_DB'])
        o = c.execute("SELECT id FROM pagamentos WHERE email='bia@teste.pt' ORDER BY id DESC").fetchone()[0]
        F['pagos']['DC%d' % o] = 1.0
        ok(aviso('DC%d' % o, '1.00') == 200, 'aviso da ifthenpay aceite')
        pg.wait_for_selector('text=Pagamento confirmado', timeout=20000)
        ok(acesso(pg), 'Multibanco pago: confirmado sozinho, sem recarregar')
        ok(not er, 'sem erros no browser (Multibanco)', er)
        ctx.close()

        # 3. Cartão: sai para a página segura e volta
        ctx, pg, er = novo()
        def pagina_cartao(route):
            u = urllib.parse.urlsplit(route.request.url)
            volta = urllib.parse.parse_qs(u.query)['volta'][0]
            F['pagos'][u.path.strip('/')] = 1.0
            aviso(u.path.strip('/'), '1.00')
            route.fulfill(status=200, content_type='text/html', body='<script>location.replace(%s)</script>' % json.dumps(volta))
        ctx.route('https://pagamento.exemplo/**', pagina_cartao)
        abrir(pg, '#f-acesso')
        pg.fill('#ac-email', 'carla@teste.pt')
        pg.check('input[name=ac-metodo][value=cartao]', force=True)
        pg.click('#f-acesso button[type=submit]')
        pg.wait_for_selector('text=Pagamento confirmado', timeout=20000)
        ok('pagamento=' not in pg.url, 'volta do cartão: confirmado e o endereço fica limpo', pg.url)
        pg.screenshot(path=SAIDA + '/6-cartao-volta.png')
        ok(not er, 'sem erros no browser (cartão)', er)
        ctx.close()
        b.close()
finally:
    api.terminate()
    web.terminate()
    srv.shutdown()
print('FALHAS', len(falhas))
sys.exit(1 if falhas else 0)
