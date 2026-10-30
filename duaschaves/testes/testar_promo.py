import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8777','--bind','127.0.0.1'],cwd='/home/claude/teste-real2',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
U='http://127.0.0.1:8777/'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844});pg=ctx.new_page();er=[];pg.on('pageerror',lambda e:er.append(str(e)))
    pg.goto(U+'#inicio');pg.evaluate("localStorage.setItem('dc-promo-teste','1500')");pg.reload();pg.wait_for_timeout(600)
    ok(pg.locator('dialog[open] .promo').count()==0,'não aparece antes do tempo')
    pg.wait_for_timeout(1500);ok(pg.locator('dialog[open] .promo').count()==1,'aparece depois do tempo')
    pg.screenshot(path='/home/claude/testes/promo.png')
    pg.click('.promo-x');pg.wait_for_timeout(300);ok(pg.locator('dialog[open]').count()==0,'fecha')
    t=pg.evaluate("+localStorage.getItem('dc-promo')");ok(t>0,'guarda hora')
    pg.reload();pg.wait_for_timeout(2500);ok(pg.locator('dialog[open] .promo').count()==0,'não volta antes de 12 h')
    pg.evaluate("localStorage.setItem('dc-promo',String(Date.now()-13*3600000))");pg.reload();pg.wait_for_timeout(2500)
    ok(pg.locator('dialog[open] .promo').count()==1,'volta depois de 12 h')
    pg.click('#b-promo');pg.wait_for_timeout(400);ok(pg.locator('dialog[open] #f-acesso').count()==1,'botão abre o pagamento')
    # zonas e histórico
    pg.keyboard.press('Escape');pg.evaluate("localStorage.setItem('dc-promo',String(Date.now()))")
    pg.goto(U+'#pesquisa');pg.wait_for_timeout(800);pg.fill('#p-cidade','Porto');pg.click('#f-busca2 button');pg.wait_for_timeout(400)
    i=pg.evaluate("dcCasas().filter(c=>/Lisboa/.test(c.cidade))[0].id");pg.goto(U+'#casa-%d'%i);pg.wait_for_timeout(500)
    pg.goto(U+'#conta');pg.wait_for_timeout(600);t=pg.inner_text('main')
    ok('Pesquisas recentes' in t and 'Porto' in t,'pesquisa recente')
    ok('Casas que viste' in t and pg.locator('a.vista').count()==1,'casa vista')
    ok(pg.locator('[data-zona-tirar]').count()>=1,'zonas com botão tirar')
    pg.fill('#d-zona-nova','Gondomar');pg.click('#d-zona-juntar');pg.wait_for_timeout(300)
    ok(pg.locator('[data-zona-tirar="gondomar"]').count()==1,'zona juntada')
    pg.click('[data-zona-tirar="porto"]');pg.wait_for_timeout(300)
    ok(pg.locator('[data-zona-tirar="porto"]').count()==0,'zona tirada')
    pg.goto(U+'#pesquisa');pg.fill('#p-cidade','Porto');pg.click('#f-busca2 button');pg.wait_for_timeout(300);pg.goto(U+'#conta');pg.wait_for_timeout(400)
    ok(pg.locator('[data-zona-tirar="porto"]').count()==0,'zona tirada não volta sozinha')
    pg.screenshot(path='/home/claude/testes/dispositivo.png',full_page=True)
    ok(not er,'erros %s'%er)
finally:srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for x in falhas:print(' -',x)
