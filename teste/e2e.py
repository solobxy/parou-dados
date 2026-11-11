import json, sys, time
from playwright.sync_api import sync_playwright
B = 'https://ganhas.pt'
R = {'paginas': {}, 'consola': {}, 'rede_falhas': [], 'passos': []}
def passo(n, ok, extra=''): R['passos'].append(f"{'OK ' if ok else 'FALHA'} {n} {extra}".strip())
with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, locale='pt-PT')
    for u in ['/', '/calculadora/', '/partilhar/', '/profissoes/', '/profissoes/enfermeiro/', '/concelhos/', '/concelhos/porto/', '/funcao-publica/',
              '/funcao-publica/professores/', '/europa/', '/para-empresas/', '/dados/', '/metodo/', '/privacidade/', '/termos/', '/cookies/',
              '/empresa/', '/pagina-que-nao-existe/']:
        pg = ctx.new_page(); erros = []
        pg.on('console', lambda m: erros.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: erros.append('JS: ' + str(e)))
        pg.on('response', lambda r: R['rede_falhas'].append(f'{r.status} {r.url}') if r.status >= 400 and 'nao-existe' not in r.url else None)
        r = pg.goto(B + u, wait_until='networkidle'); pg.wait_for_timeout(500)
        R['paginas'][u] = r.status
        if erros: R['consola'][u] = erros
        pg.close()
    # recursos
    for u in ['/sitemap.xml', '/sitemap-empresas.xml', '/robots.txt', '/llms.txt', '/_e.js', '/og/geral.png', '/fontes/bricolage.woff2', '/manifest.webmanifest', '/api/estado', '/.modelo.html']:
        R['paginas'][u] = ctx.request.get(B + u).status
    h = ctx.request.get(B + '/').headers
    R['cabecalhos'] = {k: h.get(k, '')[:90] for k in ('content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'cache-control')}
    # comparador
    pg = ctx.new_page(); estat = []
    pg.on('request', lambda q: estat.append(q.url) if '/_e' in q.url and not q.url.endswith('.js') else None)
    pg.goto(B + '/', wait_until='networkidle'); pg.fill('#salario', '1350'); pg.wait_for_timeout(800)
    t = pg.inner_text('#res-frase'); passo('comparador', '%' in t, t[:90])
    passo('partilhar resultado visível', pg.is_visible('#partilhar-resultado'))
    pg.wait_for_timeout(1500); pg.close()
    passo('estatísticas enviadas', len(estat) > 0, str(len(estat)))
    # calculadora
    pg = ctx.new_page(); pg.goto(B + '/calculadora/', wait_until='networkidle'); pg.fill('#c-bruto', '2000'); pg.wait_for_timeout(1200)
    liq = pg.inner_text('#c-r-liq'); irs = pg.inner_text('#c-r-irs'); passo('calculadora', '€' in liq, f'líquido {liq} irs {irs}')
    passo('chamada para partilhar', pg.is_visible('#c-chamada')); pg.close()
    # partilha completa e apagar
    pg = ctx.new_page(); api = []
    pg.on('response', lambda r: api.append(f'{r.status} {r.url.split(B)[-1]}') if '/api/' in r.url else None)
    pg.goto(B + '/partilhar/?p=enfermeiro', wait_until='networkidle')
    passo('profissão pré-preenchida', pg.input_value('#p-profissao') != '', pg.input_value('#p-profissao'))
    pg.select_option('#p-distrito', 'porto'); pg.fill('#p-bruto', '1650')
    pg.locator('label:has(input[name=contrato])').first.click()
    pg.select_option('#p-experiencia', '3-5')
    pg.focus('#p-bruto'); pg.wait_for_timeout(5000)
    t0 = time.time(); pg.click('#form-partilhar button[type=submit]')
    try:
        pg.wait_for_selector('#obrigado:not([hidden])', timeout=60000)
        passo('partilha enviada', True, f'{time.time() - t0:.1f}s · ' + pg.inner_text('#obrigado')[:160].replace('\n', ' '))
    except Exception as e:
        passo('partilha enviada', False, (pg.inner_text('#p-erro') if pg.is_visible('#p-erro') else str(e))[:200])
    R['api'] = api
    pg.goto(B + '/partilhar/', wait_until='networkidle')
    try:
        pg.click('#apagar-partilha button', timeout=5000); pg.wait_for_selector('#apagar-partilha .ok-msg', timeout=15000)
        passo('apagar partilha', True)
    except Exception as e:
        passo('apagar partilha', False, str(e)[:150])
    R['api'] = api
    R['estado_final'] = ctx.request.get(B + '/api/estado').text()
    nav.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
