import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright
U = sys.argv[1].rstrip('/') + '/'
os.makedirs('saida', exist_ok=True)
# esperar até o site servir o topo novo (o servidor atualiza de 2 em 2 minutos)
for i in range(40):
    try:
        h = urllib.request.urlopen(urllib.request.Request(U + '?v=' + str(time.time()), headers={'Cache-Control': 'no-cache'}), timeout=20).read().decode()
        if 'id="top3"' in h: print('topo novo no ar'); break
    except Exception as e:
        print('erro', e)
    time.sleep(10)
else:
    print('o site ainda não tem o topo novo')
for f in ('dados/energia-resumo.json', 'dados/resumo.json', 'luz-e-gas/', 'app.js?v=6', 'estilo.css?v=6'):
    try:
        r = urllib.request.urlopen(U + f, timeout=20); b = r.read()
        print(f, r.status, len(b), r.headers.get('cache-control'))
        if f.endswith('energia-resumo.json'): print('  ', b.decode()[:400])
    except Exception as e:
        print(f, 'ERRO', e)
res = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in ((390, 844), (320, 640), (1280, 900)):
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if w < 500 else 1, has_touch=w < 500)
        pg = ctx.new_page(); erros = []
        pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(U + '?naocontar', wait_until='networkidle'); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'saida/{w}-topo.png')
        info = pg.evaluate('''() => ({
          cartoes: [...document.querySelectorAll('#top3Lista .t3__a')].map(a => a.getAttribute('aria-label')),
          imgs: [...document.querySelectorAll('#top3Lista img')].map(i => i.complete && i.naturalWidth > 0),
          letras: document.querySelectorAll('#top3Lista .et__img--vazio').length,
          luz: !document.querySelector('#luzgas').hidden,
          transbordo: document.documentElement.scrollWidth > innerWidth,
          frase: document.querySelector('#top3Frase').textContent })''')
        if pg.locator('.top3__op[data-v="real"]').is_visible():
            pg.click('.top3__op[data-v="real"]'); pg.wait_for_timeout(1500)
            pg.screenshot(path=f'saida/{w}-a-serio.png')
        pg.click('#top3Lista .t3__a >> nth=0'); pg.wait_for_timeout(2000)
        pg.screenshot(path=f'saida/{w}-folha.png')
        info['comprar'] = pg.evaluate("[...document.querySelectorAll('.fp__comprar')].map(a => a.textContent + ' ' + a.href)")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        for sel in ('#luzgas', '#talao'):
            el = pg.locator(sel)
            if el.is_visible():
                el.scroll_into_view_if_needed(); pg.wait_for_timeout(1200)
                el.screenshot(path=f'saida/{w}-{sel[1:]}.png')
        info['erros'] = [e for e in erros if '_e.js' not in e]
        res[w] = info
        ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
