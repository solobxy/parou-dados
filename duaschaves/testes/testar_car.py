import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8771','--bind','127.0.0.1'],cwd='/home/claude/teste-real',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':390,'height':844},has_touch=True);erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
    pg.goto('http://127.0.0.1:8771/#pesquisa');pg.wait_for_timeout(900)
    ok('Do Imovirtual' not in pg.inner_text('main'),'linha de origem retirada')
    f=pg.locator('#lista .car-faixa').first
    ok(f.count()==1,'carrossel na pesquisa')
    n=f.evaluate('e=>e.children.length')
    f.evaluate('e=>e.scrollTo({left:e.clientWidth})');pg.wait_for_timeout(300)
    ok(pg.locator('#lista .car .n-fotos').first.inner_text()=='2 / %d'%n,'contador muda: '+pg.locator('#lista .car .n-fotos').first.inner_text())
    ok(pg.url.endswith('#pesquisa'),'deslizar não abre o anúncio')
    pg.screenshot(path='car-tel.png')
    d=b.new_page(viewport={'width':1280,'height':900})
    d.goto('http://127.0.0.1:8771/#pesquisa');d.wait_for_timeout(900)
    c=d.locator('#lista .car').first;c.hover();d.wait_for_timeout(150)
    ok(c.locator('.car-seta.seg').is_visible(),'seta visível no rato')
    c.locator('.car-seta.seg').click();d.wait_for_timeout(600)
    ok(d.url.endswith('#pesquisa'),'seta não abre o anúncio')
    ok(c.locator('.n-fotos').inner_text().startswith('2 /'),'seta avança: '+c.locator('.n-fotos').inner_text())
    c.locator('.car-seta.ant').click();d.wait_for_timeout(600);c.locator('.car-seta.ant').click();d.wait_for_timeout(600)
    ok(c.locator('.n-fotos').inner_text().split(' /')[0]==c.locator('.n-fotos').inner_text().split('/ ')[1],'volta à última: '+c.locator('.n-fotos').inner_text())
    d.locator('#lista .cartao h3').first.click();d.wait_for_timeout(400);ok('#casa-' in d.url,'tocar no texto abre o anúncio')
    ok(not erros,'erros %s'%erros)
finally:srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for x in falhas:print(' -',x)
