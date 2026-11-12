#!/usr/bin/env python3
"""Vigia da página de luz e gás do caiu.pt, contra o site verdadeiro.

  python3 caiu/verificar/vigiar_energia.py [https://caiu.pt]

Confere que a recolha correu hoje (ou ontem), que as contas batem com o simulador da ERSE, que há ofertas
suficientes, que a Galp COMBINA e as parcerias estão em vigor e que a página /luz-e-gas/ abre com números.
Sai com 1 se alguma coisa falhar (o GitHub manda um email); os avisos só se escrevem.
"""
import datetime
import json
import sys
import urllib.request
from zoneinfo import ZoneInfo

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://caiu.pt').rstrip('/')
HOJE = datetime.datetime.now(ZoneInfo('Europe/Lisbon')).date()
# parcerias que entram nas contas: se deixarem de se confirmar na fonte, a página fica errada
IMPORTANTES = ('combina', 'casa_estrada', 'my_repsol', 'edp_pingodoce')

falhas, avisos = [], []


def ok(nome, cond, extra=''):
    print(('OK     ' if cond else 'FALHOU ') + nome + ('  ' + str(extra) if extra != '' else ''))
    if not cond:
        falhas.append(nome)
    return cond


def aviso(txt):
    print('AVISO  ' + txt)
    avisos.append(txt)


def ler(caminho):
    pedido = urllib.request.Request(BASE + caminho, headers={'User-Agent': 'caiu-vigia/1', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(pedido, timeout=30) as r:
        return r.status, r.read().decode('utf-8')


def dia(txt):
    try:
        return datetime.date.fromisoformat(str(txt)[:10])
    except ValueError:
        return None


print('Site:', BASE, '· hoje:', HOJE.isoformat())

# 1. estado da recolha
try:
    st, txt = ler('/dados/energia-estado.json')
    est = json.loads(txt)
except Exception as e:  # noqa: BLE001
    ok('estado da recolha (/dados/energia-estado.json)', False, e)
    est = None

if est:
    d = dia(est.get('dia'))
    ok('recolha de hoje ou de ontem', d is not None and (HOJE - d).days <= 1, est.get('dia'))
    n = (est.get('erse') or {}).get('ofertas', 0)
    ok('ofertas da ERSE (pelo menos 400)', n >= 400, n)
    if (est.get('erse') or {}).get('ficheiro') == 'fixtures':
        ok('dados verdadeiros (não os de teste)', False, 'fixtures')
    conf = est.get('confirmado') or {}
    if not conf.get('casos'):
        aviso('simulador da ERSE sem resposta: contas por confirmar hoje')
    else:
        ok('contas iguais às do simulador da ERSE', conf.get('ok') is True,
           '%s casos, %s diferentes, máx. %s €' % (conf.get('casos'), conf.get('maus'), conf.get('max_dif')))
    galp = (est.get('galp') or {}).get('combina') or {}
    ok('tabelas da Galp COMBINA lidas', bool(galp.get('url')), galp.get('url', ''))
    ate = dia(galp.get('ate'))
    if ate and ate < HOJE:
        ok('tabelas da Galp COMBINA em vigor', False, 'acabaram a %s' % galp.get('ate'))
    elif ate and (ate - HOJE).days <= 7:
        aviso('tabelas da Galp COMBINA acabam a %s: ver se já há novas' % galp.get('ate'))
    vant = est.get('vantagens') or {}
    for k in IMPORTANTES:
        e = (vant.get(k) or {}).get('estado')
        ok('parceria %s confirmada na fonte' % k, e in ('ok', 'velho'), e)
        if e == 'velho':
            aviso('parceria %s não se confirma há uns dias (último: %s)' % (k, vant[k].get('ultimo_ok')))
    for a in est.get('avisos') or []:
        aviso('recolha: ' + a)

# 2. dados que a página usa
try:
    st, txt = ler('/dados/energia.json')
    D = json.loads(txt)
except Exception as e:  # noqa: BLE001
    ok('dados da página (/dados/energia.json)', False, e)
    D = None

if D:
    ok('ofertas nos dados (pelo menos 400)', len(D.get('of') or []) >= 400, len(D.get('of') or []))
    ok('ofertas da Galp COMBINA nos dados', any(str(o.get('id', '')).startswith('GALP_COMBINA') for o in D.get('of') or []))
    top = ((D.get('casos') or {}).get('e2') or {}).get('top') or []
    ok('caso tipo da luz com pelo menos 3 ofertas', len(top) >= 3, len(top))
    precos = [t.get('total') for t in top[:3]]
    ok('preços do caso tipo com sentido (200 a 3000 € por ano)',
       all(isinstance(p, (int, float)) and 200 < p < 3000 for p in precos), precos)

# 3. a página
try:
    st, h = ler('/luz-e-gas/')
    ok('página /luz-e-gas/ abre', st == 200, st)
    ok('página com a resposta no topo', 'Quem tem a luz mais barata' in h and 'lg-top3' in h)
    ok('página sem restos (undefined, NaN, None)', not any(x in h for x in ('undefined', 'NaN', '>None<')))
    if D:
        ok('página com os dados de hoje', D.get('dia', '?') in h or HOJE.isoformat() in h, D.get('dia'))
except Exception as e:  # noqa: BLE001
    ok('página /luz-e-gas/ abre', False, e)

for f in ('/energia-calc.js', '/energia.js', '/energia.css'):
    try:
        st, _ = ler(f)
        ok('ficheiro %s' % f, st == 200, st)
    except Exception as e:  # noqa: BLE001
        ok('ficheiro %s' % f, False, e)

print()
print('Tudo OK' if not falhas else '%d falha(s): %s' % (len(falhas), '; '.join(falhas)))
if avisos:
    print('%d aviso(s)' % len(avisos))
sys.exit(1 if falhas else 0)
