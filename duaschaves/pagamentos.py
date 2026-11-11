#!/usr/bin/env python3
"""DupliCasa: pagamentos com a ifthenpay (MB WAY, referência Multibanco e cartão).

Sem renovação automática: cada pagamento dá X dias de acesso. Três dias antes de acabar, enviamos por e-mail
uma referência Multibanco e um botão para renovar com MB WAY ou cartão; se a pessoa não pagar, o acesso acaba.
O primeiro pagamento de cada e-mail custa 1 € (30 dias); os seguintes custam o preço do plano.

Configuração (em /etc/duaschaves/api.env, fora do repositório):
  IFTHEN_MBWAY   chave MB WAY            IFTHEN_MB      chave Multibanco (referências dinâmicas)
  IFTHEN_CCARD   chave do cartão         IFTHEN_BO      chave de backoffice (confirma pagamentos e liga os avisos)
  IFTHEN_ANTI    chave anti-phishing dos avisos de pagamento (a mesma que se regista na ifthenpay)
  IFTHEN_SANDBOX 1 = referências Multibanco de teste      IFTHEN_BASE  (só para testes) outro endereço da API
Sem chaves, nada se cobra e nada se ativa.

Uso direto: python3 pagamentos.py ativar-avisos    regista na ifthenpay o endereço dos avisos de pagamento
"""
import hmac, json, math, os, re, sys, threading, time, urllib.parse, urllib.request
from datetime import datetime, timedelta

BASE_API = os.environ.get('IFTHEN_BASE', 'https://api.ifthenpay.com').rstrip('/')
CH_MBWAY = os.environ.get('IFTHEN_MBWAY', '')
CH_MB = os.environ.get('IFTHEN_MB', '')
CH_CARTAO = os.environ.get('IFTHEN_CCARD', '')
CH_BO = os.environ.get('IFTHEN_BO', '')
ANTI = os.environ.get('IFTHEN_ANTI', '')
SANDBOX = os.environ.get('IFTHEN_SANDBOX', '') == '1'
SITE = os.environ.get('SITE_BASE', 'https://duplicasa.pt')

PLANOS = {'p30': (30, 9.99), 'p60': (60, 19.49), 'p90': (90, 24.99)}
TESTE = (30, 1.00)                 # o primeiro pagamento de cada e-mail
MBWAY_SEGUNDOS = 270               # a ifthenpay dá cerca de 4 a 5 minutos para confirmar na app
AVISO_DIAS = 3                     # quantos dias antes de acabar enviamos a referência para renovar
RE_ORDEM = re.compile(r'^DC(\d{1,10})$')

_fns = {'enviar_email': None, 'ativar': None}


class ErroPagamento(Exception):
    def __init__(self, codigo, detalhe=''):
        super().__init__(codigo)
        self.codigo, self.detalhe = codigo, detalhe


def configurar(enviar_email, ativar):
    """api.py passa as funções de e-mail e de ativar o acesso (evita importações circulares)."""
    _fns['enviar_email'], _fns['ativar'] = enviar_email, ativar


def metodos():
    return [m for m, k in (('mbway', CH_MBWAY), ('multibanco', CH_MB), ('cartao', CH_CARTAO)) if k]


def ligado():
    return bool(metodos()) and bool(ANTI)


def criar_tabela(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS pagamentos(id INTEGER PRIMARY KEY, sub_id INTEGER NOT NULL, email TEXT NOT NULL, tipo TEXT NOT NULL,
      metodo TEXT NOT NULL, valor REAL NOT NULL, dias INTEGER NOT NULL, estado TEXT NOT NULL, pedido TEXT, entidade TEXT,
      referencia TEXT, validade TEXT, criado INTEGER NOT NULL, verificado INTEGER, pago_em INTEGER, motivo TEXT);
    CREATE INDEX IF NOT EXISTS i_pag_sub ON pagamentos(sub_id);
    CREATE INDEX IF NOT EXISTS i_pag_email ON pagamentos(email);
    ''')
    scols = [r[1] for r in c.execute('PRAGMA table_info(subscricoes)')]
    if 'lembrete' not in scols:       # o «ate» para o qual já enviámos o e-mail de renovar
        c.execute('ALTER TABLE subscricoes ADD COLUMN lembrete INTEGER')


def telemovel(t):
    """Número português do MB WAY no formato da ifthenpay ('351#912345678'), ou None."""
    d = re.sub(r'\D', '', str(t or ''))
    if d.startswith('00351'):
        d = d[5:]
    elif d.startswith('351') and len(d) == 12:
        d = d[3:]
    return '351#' + d if re.fullmatch(r'9[1236]\d{7}', d) else None


def eur(v):
    return ('%.2f' % v).replace('.', ',') + ' €'


def _pedir(metodo, caminho, corpo=None, q=None):
    url = BASE_API + caminho + ('?' + urllib.parse.urlencode(q) if q else '')
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo, headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    def ler(raw):
        try:
            v = json.loads(raw or b'{}')
            return v if isinstance(v, dict) else {'lista': v}
        except ValueError:           # algumas respostas são texto («OK: Callback is activated…»)
            return {'texto': raw[:300].decode('utf-8', 'replace')}
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return ler(r.read())
    except urllib.error.HTTPError as e:
        v = ler(e.read())
        v.setdefault('Status', str(e.code))
        return v
    except Exception as e:  # sem rede: não registar chaves nem o pedido
        raise ErroPagamento('ligacao', type(e).__name__)


def preco(c, sub, tipo):
    """(dias, valor): 1 € no primeiro pagamento de cada e-mail; depois o plano."""
    if tipo == 'inicio' and not c.execute(
            "SELECT 1 FROM pagamentos WHERE email=? AND estado='pago' LIMIT 1", (sub['email'],)).fetchone():
        return TESTE
    return PLANOS.get(sub['plano'] or 'p30', PLANOS['p30'])


def iniciar(c, sub, metodo, tipo, tel=None, base=None):
    """Cria o pagamento e pede-o à ifthenpay. Devolve o que o site precisa de mostrar."""
    if metodo not in metodos():
        raise ErroPagamento('metodo')
    base = base or SITE
    dias, valor = preco(c, sub, tipo)
    agora = int(time.time())
    cur = c.execute("INSERT INTO pagamentos(sub_id, email, tipo, metodo, valor, dias, estado, criado) VALUES(?,?,?,?,?,?,'pendente',?)",
                    (sub['id'], sub['email'], tipo, metodo, valor, dias, agora))
    pid = cur.lastrowid
    c.commit()                     # não segurar a base de dados enquanto se espera pela ifthenpay
    ordem, montante = 'DC%d' % pid, '%.2f' % valor
    desc = 'DupliCasa: %d dias de acesso' % dias
    try:
        if metodo == 'mbway':
            n = telemovel(tel)
            if not n:
                raise ErroPagamento('telemovel')
            r = _pedir('POST', '/spg/payment/mbway', {'mbWayKey': CH_MBWAY, 'orderId': ordem, 'amount': montante,
                                                      'mobileNumber': n, 'email': sub['email'], 'description': desc})
            if str(r.get('Status')) != '000' or not r.get('RequestId'):
                raise ErroPagamento('mbway', str(r.get('Message') or r.get('Status') or ''))
            c.execute('UPDATE pagamentos SET pedido=? WHERE id=?', (str(r['RequestId'])[:80], pid))
            return {'pagamento': 'mbway', 'id': pid, 'valor': valor, 'dias': dias, 'segundos': MBWAY_SEGUNDOS}
        if metodo == 'multibanco':
            if tipo == 'renovacao' and sub['ate']:
                validade_dias = max(1, math.ceil((sub['ate'] - agora) / 86400)) + 2
            else:
                validade_dias = 3
            r = _pedir('POST', '/multibanco/reference/' + ('sandbox' if SANDBOX else 'init'),
                       {'mbKey': CH_MB, 'orderId': ordem, 'amount': montante, 'description': desc, 'url': base,
                        'clientEmail': sub['email'], 'expiryDays': validade_dias})
            ent, ref = str(r.get('Entity') or ''), re.sub(r'\D', '', str(r.get('Reference') or ''))
            if str(r.get('Status')) != '0' or not re.fullmatch(r'\d{5}', ent) or not re.fullmatch(r'\d{9}', ref):
                raise ErroPagamento('multibanco', str(r.get('Message') or r.get('Status') or ''))
            validade = str(r.get('ExpiryDate') or '')[:20]
            c.execute('UPDATE pagamentos SET pedido=?, entidade=?, referencia=?, validade=? WHERE id=?',
                      (str(r.get('RequestId') or '')[:80], ent, ref, validade, pid))
            return {'pagamento': 'multibanco', 'id': pid, 'valor': valor, 'dias': dias, 'entidade': ent,
                    'referencia': ref, 'validade': validade}
        if metodo == 'cartao':
            volta = base + '/?pagamento=%d&r=' % pid
            r = _pedir('POST', '/creditcard/init/' + urllib.parse.quote(CH_CARTAO, safe=''),
                       {'orderId': ordem, 'amount': montante, 'successUrl': volta + 'ok', 'errorUrl': volta + 'erro',
                        'cancelUrl': volta + 'cancelado', 'language': 'pt'})
            url = str(r.get('PaymentUrl') or '')
            if str(r.get('Status')) != '0' or not url.startswith('https://'):
                raise ErroPagamento('cartao', str(r.get('Message') or r.get('Status') or ''))
            c.execute('UPDATE pagamentos SET pedido=? WHERE id=?', (str(r.get('RequestId') or '')[:80], pid))
            return {'pagamento': 'cartao', 'id': pid, 'valor': valor, 'dias': dias, 'url': url}
    except ErroPagamento as e:
        c.execute("UPDATE pagamentos SET estado='falhou', motivo=? WHERE id=?", ((e.codigo + ':' + e.detalhe)[:120], pid))
        raise
    raise ErroPagamento('metodo')


def confirmar(c, pid, valor_pago):
    """Marca o pagamento como pago (uma só vez) e dá o acesso. False se o valor não bate certo."""
    p = c.execute('SELECT * FROM pagamentos WHERE id=?', (pid,)).fetchone()
    if not p:
        return False
    if p['estado'] == 'pago':
        return True
    if valor_pago is None or abs(float(valor_pago) - p['valor']) > 0.005:
        print('pagamento %d: valor recebido não bate certo' % pid, file=sys.stderr)
        return False
    agora = int(time.time())
    n = c.execute("UPDATE pagamentos SET estado='pago', pago_em=? WHERE id=? AND estado!='pago'", (agora, pid)).rowcount
    if n and _fns['ativar']:
        _fns['ativar'](c, p['sub_id'], p['dias'], p['tipo'] == 'inicio')
    return True


def estado(c, pid):
    """Estado de um pagamento; nos MB WAY ainda pendentes pergunta à ifthenpay (no máximo a cada 4 s)."""
    p = c.execute('SELECT * FROM pagamentos WHERE id=?', (pid,)).fetchone()
    if not p:
        return None
    agora = int(time.time())
    if p['estado'] == 'pendente' and p['metodo'] == 'mbway':
        if agora - p['criado'] > MBWAY_SEGUNDOS + 60:
            c.execute("UPDATE pagamentos SET estado='expirado' WHERE id=? AND estado='pendente'", (pid,))
        elif p['pedido'] and agora - (p['verificado'] or 0) >= 4:
            # primeiro a pergunta à ifthenpay, só depois as escritas (sem prender a base de dados)
            try:
                r = _pedir('GET', '/spg/payment/mbway/status', q={'mbWayKey': CH_MBWAY, 'requestId': p['pedido']})
            except ErroPagamento:
                r = {}
            c.execute('UPDATE pagamentos SET verificado=? WHERE id=?', (agora, pid))
            st, msg = str(r.get('Status') or ''), str(r.get('Message') or '').lower()
            if st == '000' and 'success' in msg:
                confirmar(c, pid, p['valor'])
            elif st in ('020', '101', '122'):    # recusado na app, expirou, recusado pelo banco
                c.execute("UPDATE pagamentos SET estado='falhou', motivo=? WHERE id=? AND estado='pendente'", ('mbway:' + st, pid))
        p = c.execute('SELECT * FROM pagamentos WHERE id=?', (pid,)).fetchone()
    return p


def _verificar_no_backoffice(ordem, valor):
    """Com a chave de backoffice, confirma na lista de pagamentos da ifthenpay. None = não deu para confirmar."""
    if not CH_BO:
        return None
    hoje = datetime.now()
    try:
        r = _pedir('POST', '/v2/payments/read', {'boKey': CH_BO, 'entity': '', 'subEntity': '', 'reference': '', 'orderId': ordem,
                                                'amount': '', 'requestId': '', 'dateStart': (hoje - timedelta(days=3)).strftime('%d-%m-%Y 00:00:00'),
                                                'dateEnd': (hoje + timedelta(days=1)).strftime('%d-%m-%Y 23:59:59')})
    except ErroPagamento:
        return None
    for x in r.get('payments') or []:
        if str(x.get('orderId')) == ordem and abs(float(x.get('amount') or 0) - valor) < 0.005:
            return True
    return False if isinstance(r.get('payments'), list) else None


def aviso_ifthenpay(c, q):
    """Aviso de pagamento (callback) da ifthenpay. Devolve (código HTTP, texto)."""
    chave = (q.get('key') or [''])[0]
    if not ANTI or not hmac.compare_digest(chave.encode(), ANTI.encode()):
        return 403, 'chave'
    m = RE_ORDEM.match((q.get('id') or [''])[0])
    if not m:
        return 400, 'id'
    try:
        valor = float((q.get('amount') or [''])[0].replace(',', '.'))
    except ValueError:
        return 400, 'valor'
    pid = int(m.group(1))
    p = c.execute('SELECT * FROM pagamentos WHERE id=?', (pid,)).fetchone()
    if not p:
        return 404, 'pagamento'
    if p['estado'] == 'pago':
        return 200, 'ok'
    if _verificar_no_backoffice('DC%d' % pid, p['valor']) is False:
        print('aviso do pagamento %d sem correspondência no backoffice' % pid, file=sys.stderr)
        return 409, 'backoffice'
    return (200, 'ok') if confirmar(c, pid, valor) else (409, 'valor')


# ---------- renovação: e-mail com a referência, 3 dias antes de acabar ----------
def email_renovar(sub, pag, link):
    dia = datetime.fromtimestamp(sub['ate']).strftime('%d/%m')
    ref = pag['referencia'] if pag else ''
    ref_txt = '%s %s %s' % (ref[:3], ref[3:6], ref[6:]) if ref else ''
    texto = ('Olá!\n\nO teu acesso à DupliCasa acaba a %s. Se quiseres continuar, renova por %s (%d dias):\n\n' % (dia, eur(pag['valor'] if pag else PLANOS['p30'][1]), pag['dias'] if pag else 30)
             + ('Multibanco ou homebanking\nEntidade: %s\nReferência: %s\nValor: %s\n\n' % (pag['entidade'], ref_txt, eur(pag['valor'])) if pag else '')
             + 'Ou com MB WAY ou cartão: %s\n\nNão há renovação automática: se não pagares, o acesso acaba nesse dia e não ficas a dever nada.\n\nDupliCasa' % link)
    html = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:480px">'
            '<p>Olá!</p><p>O teu acesso à DupliCasa acaba a <strong>%s</strong>. Se quiseres continuar, renova por <strong>%s</strong> (%d dias).</p>'
            % (dia, eur(pag['valor'] if pag else PLANOS['p30'][1]), pag['dias'] if pag else 30)
            + ('<table style="border-collapse:collapse;margin:12px 0;font-size:16px"><tr><td style="padding:4px 16px 4px 0;color:#56635e">Entidade</td><td><strong>%s</strong></td></tr>'
               '<tr><td style="padding:4px 16px 4px 0;color:#56635e">Referência</td><td><strong>%s</strong></td></tr>'
               '<tr><td style="padding:4px 16px 4px 0;color:#56635e">Valor</td><td><strong>%s</strong></td></tr></table>'
               '<p style="color:#56635e;font-size:14px">No multibanco ou no homebanking, em «Pagamentos de serviços».</p>' % (pag['entidade'], ref_txt, eur(pag['valor'])) if pag else '')
            + '<p><a href="%s" style="display:inline-block;background:#0B6E4F;color:#fff;text-decoration:none;font-weight:700;'
              'padding:14px 22px;border-radius:12px">Renovar com MB WAY ou cartão</a></p>'
              '<p style="color:#56635e;font-size:14px">Não há renovação automática: se não pagares, o acesso acaba nesse dia e não ficas a dever nada.</p></div>' % link)
    if _fns['enviar_email']:
        return _fns['enviar_email'](sub['email'], 'O teu acesso à DupliCasa acaba a %s' % dia, texto, html)
    return None


def email_referencia(email, r):
    """Logo a seguir a pedir uma referência no site: os mesmos dados por e-mail, para pagar mais tarde."""
    if not _fns['enviar_email'] or r.get('pagamento') != 'multibanco':
        return None
    ref = r['referencia']
    ref_txt = '%s %s %s' % (ref[:3], ref[3:6], ref[6:])
    texto = ('Olá!\n\nPara ativar o teu acesso à DupliCasa (%d dias), paga no multibanco ou no homebanking, em «Pagamentos de serviços»:\n\n'
             'Entidade: %s\nReferência: %s\nValor: %s\nVálida até: %s\n\nAssim que pagares, o acesso fica ativo sozinho.\n\nDupliCasa'
             % (r['dias'], r['entidade'], ref_txt, eur(r['valor']), r.get('validade') or '3 dias'))
    html = ('<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0F1A17;max-width:480px">'
            '<p>Olá!</p><p>Para ativar o teu acesso à DupliCasa (%d dias), paga no multibanco ou no homebanking, em «Pagamentos de serviços»:</p>'
            '<table style="border-collapse:collapse;margin:12px 0;font-size:16px">'
            '<tr><td style="padding:4px 16px 4px 0;color:#56635e">Entidade</td><td><strong>%s</strong></td></tr>'
            '<tr><td style="padding:4px 16px 4px 0;color:#56635e">Referência</td><td><strong>%s</strong></td></tr>'
            '<tr><td style="padding:4px 16px 4px 0;color:#56635e">Valor</td><td><strong>%s</strong></td></tr>'
            '<tr><td style="padding:4px 16px 4px 0;color:#56635e">Válida até</td><td>%s</td></tr></table>'
            '<p style="color:#56635e;font-size:14px">Assim que pagares, o acesso fica ativo sozinho.</p></div>'
            % (r['dias'], r['entidade'], ref_txt, eur(r['valor']), r.get('validade') or '3 dias'))
    return _fns['enviar_email'](email, 'Referência Multibanco para o teu acesso à DupliCasa', texto, html)


def lembrar_renovacoes(c, agora=None):
    """Para cada acesso que acaba nos próximos 3 dias: uma referência Multibanco e um e-mail (uma só vez por período)."""
    agora = agora or int(time.time())
    feitos = 0
    subs = c.execute("SELECT * FROM subscricoes WHERE estado='ativa' AND ate>? AND ate<=? AND COALESCE(lembrete,0)!=ate",
                     (agora, agora + AVISO_DIAS * 86400)).fetchall()
    for sub in subs:
        pag = None
        if 'multibanco' in metodos():
            try:
                r = iniciar(c, sub, 'multibanco', 'renovacao')
                pag = c.execute('SELECT * FROM pagamentos WHERE id=?', (r['id'],)).fetchone()
            except ErroPagamento as e:
                print('renovação %d: sem referência (%s)' % (sub['id'], e.codigo), file=sys.stderr)
        if email_renovar(sub, pag, SITE + '/#renovar') is not False:
            c.execute('UPDATE subscricoes SET lembrete=? WHERE id=?', (sub['ate'], sub['id']))
            feitos += 1
    return feitos


def vigia_renovacoes(ligar, intervalo=1800):
    """Corre dentro da API: de meia em meia hora vê que acessos estão a acabar."""
    def ciclo():
        while True:
            try:
                if ligado():
                    with ligar() as c:
                        lembrar_renovacoes(c)
            except Exception as e:
                print('renovações:', type(e).__name__, e, file=sys.stderr)
            time.sleep(intervalo)
    threading.Thread(target=ciclo, daemon=True, name='renovacoes').start()


def _sem_chaves(t):
    """Nunca mostrar chaves nos registos nem no resultado do workflow."""
    for k in (CH_MBWAY, CH_MB, CH_CARTAO, CH_BO, ANTI):
        if k:
            t = t.replace(k, '***')
    return t


def ativar_avisos(base=SITE):
    """Regista na ifthenpay o endereço dos avisos de pagamento, para cada método com chave."""
    if not (CH_BO and ANTI):
        print('falta IFTHEN_BO ou IFTHEN_ANTI')
        return 1
    url = (base + '/api/ifthenpay/aviso?key=[ANTI_PHISHING_KEY]&id=[ID]&amount=[AMOUNT]'
           '&payment_datetime=[PAYMENT_DATETIME]&payment_method=[PAYMENT_METHOD]')
    erros = 0
    for nome, chave in (('MBWAY', CH_MBWAY), ('MB', CH_MB), ('CCARD', CH_CARTAO)):
        if not chave:
            continue
        try:
            r = _pedir('POST', '/v2/callback/activation', {'boKey': CH_BO, 'paymentMethod': nome, 'paymentKey': chave, 'apKey': ANTI, 'urlCb': url})
            print(nome, _sem_chaves(json.dumps(r, ensure_ascii=False)[:200]))
        except ErroPagamento as e:
            erros += 1
            print(nome, 'falhou', e.codigo, _sem_chaves(str(e.detalhe)[:200]))
    return 1 if erros else 0


if __name__ == '__main__':
    if sys.argv[1:] == ['ativar-avisos']:
        sys.exit(ativar_avisos())
    print(__doc__)
