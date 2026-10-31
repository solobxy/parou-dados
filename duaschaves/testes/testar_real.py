import subprocess, time, sys, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd='/tmp/teste-real', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
falhas = []
def ok(c, m):
    if not c: falhas.append(m)
try:
    with sync_playwright() as p:
        nav = p.chromium.launch()
        for w, h in [(390, 844), (1440, 900)]:
            ctx = nav.new_context(viewport={'width': w, 'height': h})
            pg = ctx.new_page(); erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.goto('http://127.0.0.1:8765/#pesquisa'); pg.wait_for_timeout(800)
            ok('Versão de testes' in pg.inner_text('#aviso-demo'), 'aviso muda')
            n = pg.inner_text('#n-res').split(' · ')[0]; ok(n == '29 casas', 'contagem real sem anúncios com mais de 60 dias: ' + n)
            ok(pg.locator('#lista .foto-img').count() == 29, 'cartões com foto: %d' % pg.locator('#lista .foto-img').count())
            ok(not pg.is_visible('#b-mais'), 'sem «ver mais» com 29 casas')
            ok('Sob consulta' in pg.inner_text('#lista'), 'preço sob consulta')
            prim = pg.locator('#lista .cartao h3').all_inner_texts()[:6]
            ok(all(x.strip() in ('Quarto','Estúdio','Apartamento T1','Moradia T0','Moradia T1') for x in prim[:3]), 'T0/T1/quartos primeiro: %s' % prim)
            ok(pg.locator('#lista .foto-img .marca-foto').count() >= 20, 'logo nos cartões')
            ok(pg.locator('header .marca svg').count() == 1, 'logo no topo')
            pg.screenshot(path=f'/tmp/testes/capturas6/real-pesquisa-{w}.png')
            pg.goto('http://127.0.0.1:8765/#casa-19324776'); pg.wait_for_timeout(800)
            ok(pg.locator('.galeria img').count() == 9, 'galeria 9 fotos')
            ok(pg.inner_text('#g-cont') == '1 / 9', 'contador inicial')
            ok(pg.locator('.g-barra span').count() == 9, 'barra 9 segmentos')
            ok(pg.is_disabled('#g-ant'), 'seta anterior desligada no início')
            pg.click('#g-seg'); pg.wait_for_timeout(900)
            ok(pg.inner_text('#g-cont') == '2 / 9', 'seta seguinte: ' + pg.inner_text('#g-cont'))
            ok(pg.locator('.g-barra span.ativo').count() == 1, 'um segmento ativo')
            ok(pg.locator('.galeria-caixa .marca-foto').count() == 1, 'logo sobre as fotos')
            ok('Linha dois com <b>html</b>' in pg.inner_text('.texto'), 'descrição escapada')
            ok('Encontrámos' not in pg.inner_text('.painel') and pg.is_visible('[data-acao=ligar]'), 'painel sem caixa do Imovirtual')
            ok(not pg.evaluate('document.documentElement.scrollWidth > innerWidth'), 'transbordo anúncio %d' % w)
            pg.screenshot(path=f'/tmp/testes/capturas6/real-casa-{w}.png', full_page=True)
            pg.goto('http://127.0.0.1:8765/#pesquisa'); pg.wait_for_timeout(600)
            (None if w > 1000 else pg.click('#b-filtros')); pg.fill('#f-pmax', '800'); pg.press('#f-pmax', 'Tab'); (None if w > 1000 else pg.click('#f-ver'))
            pg.wait_for_timeout(200)
            txt = pg.inner_text('#lista'); ok('Sob consulta' not in txt, 'filtro tira sem preço')
            pg.fill('#p-cidade', 'Paranhos'); pg.click('#f-busca2 button'); pg.wait_for_timeout(300)
            ok('Paranhos' in pg.inner_text('#lista'), 'pesquisa por freguesia')
            pg.goto('http://127.0.0.1:8765/#inicio'); pg.wait_for_timeout(800)
            sw = pg.evaluate('document.documentElement.scrollWidth > innerWidth'); ok(not sw, 'transbordo %d' % w)
            ok(not erros, 'erros: ' + str(erros))
            ctx.close()
        nav.close()
finally:
    srv.terminate()
print('TUDO OK' if not falhas else 'FALHAS:'); [print(' -', f) for f in falhas]
