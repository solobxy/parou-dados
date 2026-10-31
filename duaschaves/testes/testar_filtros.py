import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8769','--bind','127.0.0.1'],cwd='/tmp/teste-real',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':390,'height':844});erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
    pg.goto('http://127.0.0.1:8769/#pesquisa');pg.wait_for_timeout(800)
    n=lambda:int(pg.inner_text('#n-res').split()[0].replace('.','')) if pg.inner_text('#n-res')[0].isdigit() else 0
    tot=n();pg.click('#b-filtros')
    pg.check('#f-part');pg.wait_for_timeout(200);a=n();ok(0<a<tot,'particulares %d/%d'%(a,tot))
    pg.uncheck('#f-part');pg.evaluate("(()=>{const r=document.getElementById('f-area');r.value=70;r.dispatchEvent(new Event('input'))})()");pg.wait_for_timeout(500);a=n();ok(a<tot,'área %d'%a)
    pg.click('#f-ver');pg.click('[data-tipo="Quarto"]');pg.wait_for_timeout(200);ok(n()<tot,'tipo quarto');pg.click('[data-tipo=""]');pg.click('#b-filtros');pg.wait_for_timeout(200)
    pg.click('[data-fpreco="750"]');pg.wait_for_timeout(200);ok(n()<tot,'preço até 750')
    pg.click('#f-limpar');pg.wait_for_timeout(200);ok(n()==tot,'limpar')
    ok('Ver' in pg.inner_text('#f-ver'),'botão ver casas');pg.click('#f-ver');pg.wait_for_timeout(300)
    ok(not pg.evaluate("document.documentElement.classList.contains('sem-scroll')"),'fecha folha')
    pg.select_option('#f-ordem','m2');pg.wait_for_timeout(200)
    pg.click('#b-filtros');pg.wait_for_timeout(300);pg.locator('[data-fdias="1"]').scroll_into_view_if_needed();pg.evaluate("document.querySelector('[data-fdias=\"1\"]').scrollIntoView({block:'center'})");pg.click('[data-fdias="1"]');pg.wait_for_timeout(1500)
    st=pg.evaluate("JSON.parse(localStorage.getItem('dc-prefs')).pesquisas[0]");ok(st.get('dias')==1,'pesquisa recente guarda dias: %s'%st)
    pg.screenshot(path='filtros.png',full_page=True)
    ok(not erros,'erros %s'%erros)
finally:srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for f in falhas:print(' -',f)
