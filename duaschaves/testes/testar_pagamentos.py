# Testa os pagamentos da DupliCasa (ifthenpay) contra uma ifthenpay simulada: MB WAY (pedido, confirmação, recusa),
# referência Multibanco, cartão, aviso de pagamento (chave, valor, repetido, backoffice), 1 € só no primeiro pagamento
# de cada e-mail, renovação a somar dias, e-mail de renovação 3 dias antes (uma só vez) e MB WAY expirado.
# Uso: python3 duaschaves/testes/testar_pagamentos.py
import json, os, sqlite3, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
DC = os.path.dirname(AQUI)
PORTA_API, PORTA_IF, ORIG = 3112, 3199, 'http://localhost:8796'
ANTI = 'anti-teste-1234567890'
falhas = []


def ok(c, m, extra=''):
    print(('ok    ' if c else 'FALHA ') + m + (('  ' + str(extra)) if extra and not c else ''))
    if not c:
        falhas.append(m)


# ---------- ifthenpay simulada ----------
F = {'mbway': [], 'mb': [], 'cartao': [], 'pagos': {}, 'recusados': set(), 'bo': []}


class IF(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def resp(self, d, cod=200):
        b = json.dumps(d).encode()
        self.send_response(cod)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        d = json.loads(self.rfile.read(n) or b'{}')
        p = self.path
        if p == '/spg/payment/mbway':
            if d.get('mbWayKey') != 'MBW-T':
                return self.resp({'Status': '999', 'Message': 'chave'})
            F['mbway'].append(d)
            if d['mobileNumber'].endswith('9999999'):
                return self.resp({'Status': '100', 'Message': 'Número sem MB WAY'})
            return self.resp({'Amount': float(d['amount']), 'Message': 'Pending', 'orderId': d['orderId'], 'RequestId': 'mb' + d['orderId'], 'Status': '000'})
        if p == '/multibanco/reference/init':
            F['mb'].append(d)
            return self.resp({'Amount': d['amount'], 'Entity': '11249', 'ExpiryDate': '14-11-2026', 'Message': 'Success', 'OrderId': d['orderId'],
                              'Reference': '123456789', 'RequestId': 'rq' + d['orderId'], 'Status': '0'})
        if p.startswith('/creditcard/init/'):
            F['cartao'].append(d)
            return self.resp({'Message': 'Success', 'PaymentUrl': 'https://pagamento.exemplo/' + d['orderId'], 'RequestId': 'cc' + d['orderId'], 'Status': '0'})
        if p == '/v2/payments/read':
            F['bo'].append(d)
            ps = [{'orderId': o, 'amount': v} for o, v in F['pagos'].items() if o == d.get('orderId')]
            return self.resp({'message': 'OK', 'status': 200, 'payments': ps})
        return self.resp({'Status': '404'}, 404)

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == '/spg/payment/mbway/status':
            rid = q.get('requestId', [''])[0]
            ordem = rid[2:]
            if ordem in F['pagos']:
                return self.resp({'Message': 'Success', 'RequestId': rid, 'Status': '000'})
            if ordem in F['recusados']:
                return self.resp({'Message': 'Rejected', 'RequestId': rid, 'Status': '020'})
            return self.resp({'Message': 'Pending', 'RequestId': rid, 'Status': '123'})
        return self.resp({'Status': '404'}, 404)


srv = ThreadingHTTPServer(('127.0.0.1', PORTA_IF), IF)
threading.Thread(target=srv.serve_forever, daemon=True).start()

pasta = tempfile.mkdtemp(prefix='dc-pag-')
DB = os.path.join(pasta, 'dados.db')
env = dict(os.environ, DC_DB=DB, DC_PORTA=str(PORTA_API), ORIGENS=ORIG, IFTHEN_BASE='http://127.0.0.1:%d' % PORTA_IF,
           IFTHEN_MBWAY='MBW-T', IFTHEN_MB='MB-T', IFTHEN_CCARD='CC-T', IFTHEN_BO='BO-T', IFTHEN_ANTI=ANTI, SITE_BASE=ORIG, RESEND_API_KEY='')
api = subprocess.Popen([sys.executable, os.path.join(DC, 'api.py')], env=env, stderr=subprocess.PIPE, text=True)
B = 'http://127.0.0.1:%d' % PORTA_API


def req(m, p, corpo=None, ck=''):
    h = {'Host': ORIG.split('//')[1], 'Origin': ORIG}
    if ck:
        h['Cookie'] = ck
    d = None
    if corpo is not None:
        h['Content-Type'] = 'application/json'
        d = json.dumps(corpo).encode()
    r = urllib.request.Request(B + p, data=d, method=m, headers=h)
    try:
        with urllib.request.urlopen(r) as x:
            return x.status, json.loads(x.read() or b'{}'), x.headers.get_all('Set-Cookie') or []
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}'), []


def disp(cks):
    return ([c.split(';')[0] for c in cks if c.startswith('__Host-dc_disp')] or [''])[0]


for _ in range(50):
    try:
        if req('GET', '/api/saude')[0] == 200:
            break
    except Exception:
        time.sleep(0.2)
try:
    s, b, _ = req('GET', '/api/saude')
    ok(b.get('pagamentos') == ['mbway', 'multibanco', 'cartao'], 'saúde: diz os métodos ligados', b)

    # 1. MB WAY: telemóvel obrigatório e válido
    s, b, _ = req('POST', '/api/subscrever', {'email': 'ana@teste.pt', 'metodo': 'mbway'})
    ok(s == 400 and b.get('erro') == 'telemovel', 'MB WAY sem telemóvel: 400')
    s, b, _ = req('POST', '/api/subscrever', {'email': 'ana@teste.pt', 'metodo': 'mbway', 'telemovel': '21 234 5678'})
    ok(s == 400 and b.get('erro') == 'telemovel', 'telefone fixo: 400')
    s, b, ck = req('POST', '/api/subscrever', {'email': 'ana@teste.pt', 'metodo': 'mbway', 'telemovel': '+351 912 345 678'})
    ana = disp(ck)
    ok(s == 200 and b.get('pagamento') == 'mbway' and b.get('valor') == 1.0 and b.get('dias') == 30, '1.º pagamento: 1 € por 30 dias', b)
    pid = b.get('id')
    ult = F['mbway'][-1] if F['mbway'] else {}
    ok(ult.get('mobileNumber') == '351#912345678' and ult.get('amount') == '1.00' and ult.get('orderId') == 'DC%s' % pid, 'pedido MB WAY no formato da ifthenpay', ult)
    s, b, _ = req('GET', '/api/pagamento?id=%s' % pid, ck=ana)
    ok(s == 200 and b.get('estado') == 'pendente' and not b.get('acesso'), 'enquanto não confirma: pendente, sem acesso', b)
    s, b, _ = req('GET', '/api/pagamento?id=%s' % pid, ck='__Host-dc_disp=' + 'z' * 40)
    ok(s == 404, 'outro dispositivo não vê o pagamento')
    s, b, _ = req('GET', '/api/dispositivo', ck=ana)
    ok(not b.get('acesso'), 'sem pagamento confirmado, sem acesso')
    F['pagos']['DC%s' % pid] = 1.0                         # a pessoa confirma na app
    time.sleep(4.2)
    s, b, _ = req('GET', '/api/pagamento?id=%s' % pid, ck=ana)
    ate = (b.get('acesso') or {}).get('ate', 0) / 1000
    ok(b.get('estado') == 'pago' and abs(ate - (time.time() + 30 * 86400)) < 120, 'confirmado na app: pago, 30 dias de acesso', b)
    s, b, _ = req('GET', '/api/dispositivo', ck=ana)
    ok(bool(b.get('acesso')), 'o dispositivo fica com acesso')
    s, b, _ = req('POST', '/api/subscrever', {'email': 'ana@teste.pt', 'metodo': 'mbway', 'telemovel': '912345678'}, ck=ana)
    ok(s == 200 and b.get('estado') == 'ativa' and not b.get('pagamento'), 'já com acesso: não pede outro pagamento', b)

    # 2. Recusado na app
    s, b, ck = req('POST', '/api/subscrever', {'email': 'bia@teste.pt', 'metodo': 'mbway', 'telemovel': '931111111'})
    bia, pid_b = disp(ck), b.get('id')
    F['recusados'].add('DC%s' % pid_b)
    time.sleep(4.2)
    s, b, _ = req('GET', '/api/pagamento?id=%s' % pid_b, ck=bia)
    ok(b.get('estado') == 'falhou' and not b.get('acesso'), 'recusado na app: falhou, sem acesso', b)
    s, b, ck = req('POST', '/api/subscrever', {'email': 'rui@teste.pt', 'metodo': 'mbway', 'telemovel': '919999999'})
    ok(s == 502 and b.get('motivo') == 'mbway', 'número sem MB WAY: erro claro (502)', b)

    # 3. Multibanco + aviso de pagamento
    s, b, ck = req('POST', '/api/subscrever', {'email': 'carla@teste.pt', 'metodo': 'multibanco'})
    carla, pid_c = disp(ck), b.get('id')
    ok(s == 200 and b.get('entidade') == '11249' and b.get('referencia') == '123456789' and b.get('valor') == 1.0, 'Multibanco: entidade, referência e valor', b)
    ok(F['mb'] and F['mb'][-1].get('expiryDays') == 3 and F['mb'][-1].get('clientEmail') == 'carla@teste.pt', 'referência válida 3 dias', F['mb'][-1] if F['mb'] else '')
    aviso = lambda q: req('GET', '/api/ifthenpay/aviso?' + urllib.parse.urlencode(q))
    s, b, _ = aviso({'key': 'errada', 'id': 'DC%s' % pid_c, 'amount': '1.00'})
    ok(s == 403, 'aviso com chave errada: 403')
    F['pagos']['DC%s' % pid_c] = 1.0
    s, b, _ = aviso({'key': ANTI, 'id': 'DC%s' % pid_c, 'amount': '0.50'})
    ok(s == 409, 'aviso com valor errado: não ativa (409)')
    s, b, _ = req('GET', '/api/dispositivo', ck=carla)
    ok(not b.get('acesso'), 'valor errado: continua sem acesso')
    s, b, _ = aviso({'key': ANTI, 'id': 'DC%s' % pid_c, 'amount': '1.00', 'payment_method': 'MB'})
    ok(s == 200, 'aviso certo: 200')
    s, b, _ = req('GET', '/api/dispositivo', ck=carla)
    ate1 = (b.get('acesso') or {}).get('ate', 0)
    ok(bool(ate1), 'Multibanco pago: acesso ativo')
    s, b, _ = aviso({'key': ANTI, 'id': 'DC%s' % pid_c, 'amount': '1.00'})
    s2, b2, _ = req('GET', '/api/dispositivo', ck=carla)
    ok(s == 200 and (b2.get('acesso') or {}).get('ate') == ate1, 'aviso repetido: não soma dias outra vez')
    s, b, ck = req('POST', '/api/subscrever', {'email': 'dani@teste.pt', 'metodo': 'multibanco'})
    s, b2, _ = aviso({'key': ANTI, 'id': 'DC%s' % b.get('id'), 'amount': '1.00'})
    ok(s == 409, 'aviso sem pagamento no backoffice da ifthenpay: não ativa')

    # 4. Cartão
    s, b, ck = req('POST', '/api/subscrever', {'email': 'eva@teste.pt', 'metodo': 'cartao'})
    ok(s == 200 and b.get('url', '').startswith('https://') and F['cartao'][-1].get('successUrl', '').startswith(ORIG + '/?pagamento='), 'cartão: endereço da página segura e volta ao site', b)

    # 5. O 1 € é só uma vez por e-mail
    s, b, ck = req('POST', '/api/subscrever', {'email': 'ana@teste.pt', 'metodo': 'multibanco', 'plano': 'p30'})
    ok(s == 200 and b.get('valor') == 9.99 and b.get('dias') == 30, 'mesmo e-mail noutro dispositivo: 9,99 € (o 1 € já foi usado)', b)

    # 6. Renovar: soma aos dias que faltam
    s, b, _ = req('POST', '/api/renovar', {'metodo': 'mbway', 'telemovel': '912345678'}, ck=ana)
    pid_r = b.get('id')
    ok(s == 200 and b.get('valor') == 9.99, 'renovar: 9,99 €', b)
    s, b, _ = req('GET', '/api/dispositivo', ck=ana)
    antes = b['acesso']['ate'] / 1000
    F['pagos']['DC%s' % pid_r] = 9.99
    s, b, _ = aviso({'key': ANTI, 'id': 'DC%s' % pid_r, 'amount': '9.99'})
    s, b, _ = req('GET', '/api/dispositivo', ck=ana)
    ok(abs(b['acesso']['ate'] / 1000 - (antes + 30 * 86400)) < 5, 'renovação soma 30 dias ao fim do acesso (não perde dias)')
    s, b, _ = req('POST', '/api/renovar', {'metodo': 'mbway', 'telemovel': '912345678'}, ck='__Host-dc_disp=' + 'k' * 40)
    ok(s == 404, 'renovar sem subscrição: 404')

    # 7. E-mail de renovação 3 dias antes (com referência), uma só vez
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    agora = int(time.time())
    c.execute("UPDATE subscricoes SET ate=? WHERE email='carla@teste.pt'", (agora + 2 * 86400,))
    c.commit()
    for k, v in env.items():
        if k.startswith('IFTHEN_') or k == 'SITE_BASE':
            os.environ[k] = v
    sys.path.insert(0, DC)
    import pagamentos as pg
    enviados = []
    pg.configurar(lambda para, assunto, texto, html: enviados.append((para, assunto, texto)) or True, lambda *a: True)
    n1 = pg.lembrar_renovacoes(c)
    c.commit()
    n2 = pg.lembrar_renovacoes(c)
    ok(n1 == 1 and n2 == 0 and len(enviados) == 1, 'e-mail de renovação: um, e só uma vez', (n1, n2, len(enviados)))
    txt = enviados[0][2] if enviados else ''
    ok('Entidade: 11249' in txt and '123 456 789' in txt and '9,99' in txt and 'Não há renovação automática' in txt, 'o e-mail traz a referência e diz que não renova sozinho', txt[:200])
    ok(F['mb'][-1].get('expiryDays') == 4, 'a referência vale até 2 dias depois do fim', F['mb'][-1])

    # 8. MB WAY esquecido: expira
    c.execute("UPDATE pagamentos SET criado=? WHERE id=?", (agora - 600, pid_b + 0))
    c.execute("UPDATE pagamentos SET estado='pendente' WHERE id=?", (pid_b,))
    c.commit()
    s, b, _ = req('GET', '/api/pagamento?id=%s' % pid_b, ck=bia)
    ok(b.get('estado') == 'expirado', 'MB WAY não confirmado em 5 minutos: expirado', b)
finally:
    api.terminate()
    try:
        err = api.communicate(timeout=5)[1]
    except Exception:
        err = ''
    if 'Traceback' in (err or ''):
        print(err[-2000:])
        falhas.append('erros na API')
    srv.shutdown()
print('FALHAS', len(falhas))
sys.exit(1 if falhas else 0)
