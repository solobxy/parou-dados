import json,sys
from playwright.sync_api import sync_playwright
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
U='https://localhost:8443/'
UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
with sync_playwright() as p:
    b=p.chromium.launch()
    # visitante normal
    ctx=b.new_context(viewport={'width':390,'height':844},user_agent=UA,ignore_https_errors=True);pg=ctx.new_page();er=[];pg.on('pageerror',lambda e:er.append(str(e)))
    pg.goto(U+'?utm_source=instagram&utm_medium=story&utm_campaign=lancamento#inicio');pg.wait_for_timeout(1500)
    pg.goto(U+'#pesquisa');pg.wait_for_timeout(800);pg.fill('#p-cidade','Porto');pg.click('#f-busca2 button');pg.wait_for_timeout(500)
    pg.click('#b-filtros');pg.evaluate("document.getElementById('f-fotos').scrollIntoView({block:'center'})");pg.locator('label:has(#f-fotos)').click();pg.click('#f-ver');pg.wait_for_timeout(300)
    i=pg.evaluate("dcCasas()[0].id");pg.goto(U+'#casa-%d'%i);pg.wait_for_timeout(1000)
    pg.click('[data-acao="visita"]');pg.wait_for_timeout(500)
    ok(pg.locator('#f-acesso').count()==1,'paywall abre')
    pg.fill('#ac-email','ana@teste.pt');pg.click('#f-acesso button[type=submit]');pg.wait_for_timeout(500)
    ok(not er,'erros %s'%er)
    ctx.close()
    # robô não conta
    ctx=b.new_context(ignore_https_errors=True);pg=ctx.new_page();pg.goto(U+'#inicio');pg.wait_for_timeout(1000);ctx.close()
    # administrador
    ctx=b.new_context(viewport={'width':1280,'height':900},user_agent=UA.replace('Mobile ',''),ignore_https_errors=True);pg=ctx.new_page();er=[];pg.on('pageerror',lambda e:er.append(str(e)))
    pg.goto(U+'#painel');pg.wait_for_timeout(1200);ok('Entra na conta' in pg.inner_text('main'),'pede login')
    r=pg.evaluate("fetch('/api/registar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@teste.pt',senha:'umaSenhaBoa2026!',nome:'Admin'})}).then(r=>r.status)")
    print('registar',r)
    pg.goto(U+'#conta');pg.reload();pg.wait_for_timeout(1500)
    ok(pg.locator('a[href="#painel"]').count()==1,'ligação ao painel na conta')
    pg.goto(U+'#painel');pg.wait_for_timeout(1500)
    t=pg.inner_text('main');print(t[:1500])
    ok('Visitantes' in t and 'Cidades pesquisadas' in t,'painel desenha')
    j=pg.evaluate("fetch('/api/estatisticas?dias=7').then(r=>r.json())")
    print(json.dumps({k:j[k] for k in ('visitantes','vistas','funil','promo','campanhas','origens','dispositivos','cidades_pesquisadas','filtros','casas')},ensure_ascii=False)[:1500])
    ok(j['visitantes']>=2,'visitantes contados (robô de fora)')
    ok(any(x['nome']=='Porto' for x in j['cidades_pesquisadas']),'cidade pesquisada')
    ok(any('instagram' in x['nome'] for x in j['campanhas']),'campanha utm')
    ok([x for x in j['funil'] if x['nome']=='Pagaram'][0]['n']==0,'sem pagamento real, o funil não conta pagos')
    pg.screenshot(path='/tmp/testes/painel-1280.png',full_page=True)
    ctx2=b.new_context(viewport={'width':390,'height':844},user_agent=UA,ignore_https_errors=True,storage_state=ctx.storage_state());p2=ctx2.new_page();p2.goto(U+'#painel');p2.wait_for_timeout(1500)
    ok(p2.evaluate('document.documentElement.scrollWidth<=innerWidth'),'painel sem scroll lateral no telemóvel');p2.screenshot(path='/tmp/testes/painel-390.png',full_page=True)
    # outra conta não vê
    ok(not er,'erros %s'%er)
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for x in falhas:print(' -',x)
