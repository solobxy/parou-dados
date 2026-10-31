import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8767','--bind','127.0.0.1'],cwd='/tmp/teste-real',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1);falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
U='http://127.0.0.1:8767/'
try:
  with sync_playwright() as p:
    nav=p.chromium.launch();ctx=nav.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    pg=ctx.new_page();erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
    pg.goto(U+'#inicio');pg.wait_for_timeout(900);pg.screenshot(path='conv-inicio.png')
    pg.goto(U+'#pesquisa');pg.wait_for_timeout(500)
    pos=pg.evaluate("[].map.call(document.querySelectorAll('#lista>.ctl'),function(e){return [].indexOf.call(e.parentNode.children,e);})")
    ok(len(pos)>=4 and pos[:3]==[5,11,17],'cartão do acesso a cada 5 casas: '+str(pos[:4]))
    pg.locator('#lista>.ctl').first.scroll_into_view_if_needed();pg.wait_for_timeout(900);pg.screenshot(path='conv-lista.png')
    pg.locator('#lista>.ctl [data-cta-lista]').first.click();pg.wait_for_timeout(500)
    ok(pg.locator('dialog[open] #f-acesso').count()==1,'o botão do cartão abre o acesso');pg.keyboard.press('Escape');pg.wait_for_timeout(300)
    href=pg.evaluate("document.querySelector('#lista a[href^=\"#casa-\"]').getAttribute('href')")
    pg.goto(U+href);pg.wait_for_timeout(600)
    ok(pg.locator('#barra-cta').count()==1,'barra existe')
    ok('escondida' in pg.get_attribute('#barra-cta','class'),'barra escondida no topo')
    pg.mouse.wheel(0,2500);pg.wait_for_timeout(500)
    ok('escondida' not in pg.get_attribute('#barra-cta','class'),'barra visível ao descer')
    pg.screenshot(path='conv-casa-barra.png')
    # a barra esconde-se quando os botões de contacto estão no ecrã: põe-nos logo acima do ecrã
    pg.evaluate("var a=document.querySelector('.painel .acoes');scrollTo(0,a.getBoundingClientRect().bottom+scrollY+5)");pg.wait_for_timeout(600);pg.mouse.wheel(0,40);pg.wait_for_timeout(600)
    pg.click('#barra-cta .botao');pg.wait_for_timeout(300)
    ok(pg.is_visible('.pw-casa'),'paywall com a casa')
    ok(pg.is_checked('input[value=mbway]'),'MB WAY por defeito')
    pg.screenshot(path='conv-paywall.png',full_page=True)
    pg.fill('#ac-email','a@b.pt');pg.click('#f-acesso button[type=submit]');pg.wait_for_timeout(600)
    ok(pg.locator('#barra-cta').count()==0,'barra some com acesso')
    ok(not erros,'erros %s'%erros)
finally:srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for f in falhas:print(' -',f)
