import subprocess, time, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8766','--bind','127.0.0.1'],cwd='/tmp/teste-real',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1); falhas=[]
def ok(c,m):
    if not c: falhas.append(m)
U='http://127.0.0.1:8766/'
try:
  with sync_playwright() as p:
    nav=p.chromium.launch()
    ctx=nav.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    pg=ctx.new_page(); erros=[]
    pg.on('pageerror',lambda e: erros.append(str(e)))
    pg.goto(U+'#inicio'); pg.wait_for_timeout(900)
    ok('Continuar a procurar' not in pg.inner_text('main'),'início sem histórico')
    ok('As mais baratas agora' in pg.inner_text('main'),'secção genérica');tits=pg.locator('section:has(h2:text("As mais baratas agora")) .mini-txt').all_inner_texts();ok(tits and all(x.split('·')[0].strip() in ('T0','T1','Quarto') for x in tits),'só T0/T1/quartos: %s'%tits)
    # pesquisa Porto + filtro T1
    pg.goto(U+'#pesquisa'); pg.wait_for_timeout(400)
    pg.fill('#p-cidade','Porto'); pg.press('#p-cidade','Enter'); pg.wait_for_timeout(300)
    pg.click('#b-filtros'); pg.click('[data-tip="T1"]'); pg.click('#f-ver'); pg.wait_for_timeout(1500)
    pg.screenshot(path='prefs-pesquisa.png')
    ok(pg.inner_text('#b-alerta')=='Guardar pesquisa','botão guardar pesquisa')
    pg.click('#b-alerta'); pg.wait_for_timeout(200)
    ok(pg.is_visible('#ad-mkt') and not pg.is_checked('#ad-mkt'),'marketing desligado por defeito')
    pg.screenshot(path='prefs-dialogo-pesquisa.png')
    pg.click('#f-alerta-d button[type=submit]'); pg.wait_for_timeout(300)
    ok('Pesquisa guardada neste dispositivo' in pg.inner_text('#toast'),'guardou sem e-mail: '+pg.inner_text('#toast'))
    ok(pg.inner_text('#b-alerta')=='Pesquisa guardada','estado guardada')
    ok(pg.locator('[data-fg]').count()==1,'chip guardada')
    # e-mail inválido
    # ver casa e guardar
    href=pg.evaluate("(document.querySelector('#lista a[href^=\"#casa-\"]')||{}).getAttribute&&document.querySelector('#lista a[href^=\"#casa-\"]').getAttribute('href')")
    ok(bool(href),'link de casa: %s'%href)
    pg.goto(U+href); pg.wait_for_timeout(600)
    ok(pg.is_visible('.marca-foto'),'marca visível')
    box=pg.locator('.marca-foto').first.bounding_box(); g=pg.locator('.galeria').first.bounding_box()
    if box and g:
        cx=box['x']+box['width']/2; ok(abs(cx-(g['x']+g['width']/2))<3,'marca ao centro')
        ok(box['width']>=44,'marca grande: %s'%box['width'])
    pg.screenshot(path='prefs-casa.png')
    pg.click('#b-guardar'); pg.wait_for_timeout(300)
    ok(pg.is_visible('#f-guardar-email'),'pede e-mail ao guardar')
    pg.screenshot(path='prefs-dialogo-guardar.png')
    pg.click('#f-guardar-email button[type=submit]'); pg.wait_for_timeout(100)
    ok(pg.is_visible('#ge-email-erro'),'erro e-mail vazio')
    pg.fill('#ge-email','teste@exemplo.pt'); pg.check('#ge-mkt')
    pg.click('#f-guardar-email button[type=submit]'); pg.wait_for_timeout(300)
    st=pg.evaluate("JSON.parse(localStorage.getItem('dc-conta'))")
    ok(st['email']=='teste@exemplo.pt' and st['marketing']['sim'] is True,'conta guardou e-mail+marketing')
    al=pg.evaluate("JSON.parse(localStorage.getItem('dc-alertas'))")
    ok(any(a.get('casa') for a in al),'alerta da casa criado')
    # guardar outra vez não volta a pedir
    pg.click('#b-guardar'); pg.wait_for_timeout(150); pg.click('#b-guardar'); pg.wait_for_timeout(200)
    ok(not pg.is_visible('#f-guardar-email'),'não volta a pedir')
    # início personalizado
    pg.goto(U+'#inicio'); pg.wait_for_timeout(500)
    t=pg.inner_text('main')
    ok('As mais baratas agora' in t,'secção baratas')
    ok('Continuar a procurar' in t,'pesquisas recentes')
    pg.screenshot(path='prefs-inicio.png',full_page=False)
    tits=pg.locator('section:has(h2:text("As mais baratas agora")) .mini-txt').all_inner_texts()
    ok(tits and all(x.split('·')[0].strip() in ('T0','T1','Quarto') for x in tits),'início continua só com T0/T1/quartos com histórico: %s'%tits)
    # conta
    pg.evaluate("var c=JSON.parse(localStorage.getItem('dc-conta'));c.sessao=true;localStorage.setItem('dc-conta',JSON.stringify(c))")
    pg.goto(U+'#conta'); pg.reload(); pg.wait_for_timeout(500)
    ok('Neste dispositivo' in pg.inner_text('main'),'bloco dispositivo')
    pg.locator('#b-apagar-hist').scroll_into_view_if_needed(); pg.screenshot(path='prefs-conta.png')
    pg.click('[data-fg-tirar="0"]'); pg.wait_for_timeout(300)
    ok('Ainda não guardaste pesquisas' in pg.inner_text('main'),'apagar pesquisa')
    ok(not erros,'erros js: %s'%erros)
    ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth"),'sem transbordo')
finally:
    srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for f in falhas: print(' -',f)
