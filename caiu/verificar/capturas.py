"""Capturas do caiu.pt num browser real (corre no GitHub): telemóvel e computador, pesquisa, folha do produto
e lista. Guarda tudo em capturas/ com um resumo (erros, imagens partidas, transbordo)."""
import json, sys, os
from playwright.sync_api import sync_playwright
U = sys.argv[1].rstrip('/') + '/'
os.makedirs('capturas', exist_ok=True)
res = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for nome, (w, h, toque) in {'telemovel': (390, 844, True), 'computador': (1440, 900, False)}.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=toque, device_scale_factor=1)
        pg = ctx.new_page(); erros = []
        pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(U + '?naocontar', wait_until='networkidle'); pg.wait_for_timeout(1500)
        pg.screenshot(path=f'capturas/{nome}-topo.png')
        # rolar devagar para as imagens e os carimbos aparecerem
        alt = pg.evaluate('document.body.scrollHeight')
        for y in range(0, alt, 500):
            pg.evaluate(f'window.scrollTo(0,{y})'); pg.wait_for_timeout(120)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'capturas/{nome}-pagina.png', full_page=True)
        imgs = pg.evaluate('[...document.images].map(i=>({src:i.src.slice(0,90),ok:i.complete&&i.naturalWidth>0}))')
        partidas = [i for i in imgs if not i['ok']]
        letras = pg.evaluate("document.querySelectorAll('.et__img--vazio').length")
        pg.evaluate('window.scrollTo(0,0)')
        pg.fill('#q', 'azeite'); pg.click('.busca button'); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'capturas/{nome}-pesquisa.png')
        pg.locator('#resLista .add').first.click(); pg.wait_for_timeout(300)
        pg.locator('#resLista .ln__nome a').first.click(); pg.wait_for_timeout(2000)
        pg.screenshot(path=f'capturas/{nome}-folha.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.goto(U + '?naocontar#lista'); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'capturas/{nome}-lista.png')
        res[nome] = {'erros': erros, 'imagens': len(imgs), 'imagens_partidas': len(partidas), 'exemplos_partidas': partidas[:5],
                     'letras_em_vez_de_foto': letras, 'transbordo': pg.evaluate('document.documentElement.scrollWidth>innerWidth'),
                     'altura': alt}
        ctx.close()
    b.close()
json.dump(res, open('capturas/resumo.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
