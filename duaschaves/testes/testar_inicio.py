import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8772','--bind','127.0.0.1'],cwd='/home/claude/teste-real',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in [(320,640),(390,844),(1280,900)]:
      pg=b.new_page(viewport={'width':w,'height':h},has_touch=w<1000);erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
      pg.goto('http://127.0.0.1:8772/#inicio');pg.wait_for_timeout(1200)
      ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),'%d: scroll lateral'%w)
      ok(pg.locator('.faixa-casas .mini').count()>=3,'%d faixa de casas'%w)
      ok(pg.locator('.tlm').count()>=1,'%d telemóvel'%w)
      ok(pg.locator('#cta-fixo').is_hidden(),'%d cta escondido no herói'%w)
      pg.screenshot(path='/home/claude/testes/ini-%d.png'%w,full_page=True)
      pg.evaluate('scrollTo(0,document.querySelector(".faixa-casas").getBoundingClientRect().top+scrollY+200)');pg.wait_for_timeout(400)
      ok(pg.locator('#cta-fixo').is_visible(),'%d cta visível depois do herói'%w)
      pg.screenshot(path='/home/claude/testes/ini-%d-cta.png'%w)
      if pg.locator('[data-cid]').count()>1:
        t0=pg.locator('#cid-tit').inner_text();pg.locator('[data-cid]').nth(1).click();pg.wait_for_timeout(200)
        ok(pg.locator('#cid-tit').inner_text()!=t0,'%d cidade muda'%w)
      pg.locator('#b-cta-fixo').click() if pg.locator('#cta-fixo').is_visible() else None;pg.wait_for_timeout(400)
      ok(pg.locator('dialog[open]').count()==1,'%d cta abre o acesso'%w)
      ok(not erros,'%d erros %s'%(w,erros))
finally:srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for x in falhas:print(' -',x)
