# Fluxo completo no browser. Antes: python3 servidor_teste.py <site> <dados com lista.json e det/> 8795 http://127.0.0.1:3111 e api.py com ORIGENS=http://localhost:8795
import sqlite3,time,re,json,sys
from playwright.sync_api import sync_playwright
U='http://localhost:8795/'
foto=open('/home/claude/cap/f.jpg','rb').read()
falhas=[]
def ok(c,m):
    print(('ok   ' if c else 'FALHA'),m)
    if not c:falhas.append(m)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},has_touch=True)
    ctx.add_init_script("try{localStorage.setItem('dc-promo',String(Date.now()));localStorage.setItem('dc-alerta-pop',String(Date.now()))}catch(e){}")
    pg=ctx.new_page();er=[];pg.on('pageerror',lambda e:er.append(str(e)));pg.on('console',lambda m:er.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)   # recursos externos são cortados de propósito; 401 de /api/eu sem sessão é normal
    pg.route(lambda u:'localhost' not in u,lambda r:r.fulfill(body=foto,content_type='image/jpeg') if r.request.resource_type=='image' else r.abort())
    pedidos=[]
    pg.on('request',lambda r:pedidos.append(r.url))
    pg.goto(U+'#inicio');pg.wait_for_timeout(2500)
    t=pg.inner_text('body')
    ok('Versão de testes' not in t and 'Protótipo' not in t and '[nome' not in t,'sem barra de testes nem marcadores')
    ok(pg.evaluate('dcCasas().length')>1000 and pg.evaluate('dcCasas().every(c=>!c.url)'),'casas carregadas sem links')
    ok(not any(u.endswith('anuncios.json') for u in pedidos),'não pede anuncios.json')
    rid=pg.evaluate("dcCasas().find(c=>c.rid==='imo-19324791')?'imo-19324791':dcCasas()[0].rid")
    cid=pg.evaluate("dcCasas().find(c=>c.rid==='%s').id"%rid)
    pg.goto(U+'#casa-%d'%cid);pg.wait_for_timeout(1200)
    t=pg.inner_text('main');ok('[a indicar]' not in t and 'Certificado' not in t,'ficha sem marcadores')
    pg.click('.painel [data-acao="ligar"]');pg.wait_for_timeout(500)
    ok(pg.locator('dialog[open] #f-acesso').count()==1,'sem acesso: abre o pagamento')
    pg.fill('#ac-email','ana@teste.pt');pg.click('#f-acesso button[type=submit]');pg.wait_for_timeout(800)
    ok(pg.locator('dialog[open]').count()==0 and 'abrem em breve' in pg.inner_text('#toast'),'pagamentos por ligar: aviso honesto')
    # conta com acesso
    r=pg.evaluate("fetch('/api/registar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ana@teste.pt',senha:'umaSenhaBoa2026!',nome:'Ana'})}).then(r=>r.status)")
    ok(r==200,'registar %s'%r)
    ck=[c['name'] for c in ctx.cookies()];ok('__Host-dc_sessao' in ck,'cookie de sessão guardado (%s)'%ck)
    c=sqlite3.connect('/tmp/dcapi-t/dados.db');c.execute("UPDATE utilizadores SET acesso_ate=? WHERE email='ana@teste.pt'",(int(time.time())+86400,));c.commit()
    pg.goto(U+'#conta');pg.reload();pg.wait_for_timeout(2000)
    pg.goto(U+'#casa-%d'%cid);pg.wait_for_timeout(1200)
    pg.click('.painel [data-acao="msg"]');pg.wait_for_timeout(1200)
    href=pg.get_attribute('#b-original','href') or ''
    ok(href.startswith('https://www.imovirtual.com'),'com acesso: link do original vem da API (%s)'%href[:40])
    t=pg.inner_text('dialog[open]');ok('Imovirtual' not in t and 'imovirtual' not in t.lower(),'diálogo sem nome do outro site')
    pg.screenshot(path='/home/claude/cap2/contacto.png')
    pg.keyboard.press('Escape');pg.wait_for_timeout(300)
    # lista de espera do pagamento seguro
    pg.goto(U+'#proteger');pg.wait_for_timeout(800)
    pg.fill('#pp-nome','Ana');pg.fill('#pp-email','ana@teste.pt');pg.click('#f-pedido button[type=submit]');pg.wait_for_timeout(800)
    ok(pg.locator('#ok-lista').count()==1,'lista de espera: confirmação')
    pg.screenshot(path='/home/claude/cap2/proteger.png',full_page=True)
    # senhorio
    pg.goto(U+'#senhorios');pg.wait_for_timeout(800)
    pg.fill('#c-cidade','Porto');pg.fill('#c-bairro','Bonfim');pg.select_option('#c-tip','T1');pg.fill('#c-renda','750');pg.fill('#c-nome','Rui');pg.fill('#c-email','rui@teste.pt');pg.fill('#c-tel','912 345 678')
    pg.click('#f-casa button[type=submit]');pg.wait_for_timeout(400)
    ok(pg.locator('#ok-casa').count()==0,'senhorio: exige confirmação de dono')
    pg.locator('label:has(#c-dono)').click();pg.click('#f-casa button[type=submit]');pg.wait_for_timeout(800)
    ok(pg.locator('#ok-casa').count()==1,'senhorio: pedido enviado')
    n=c.execute('SELECT COUNT(*) FROM pedidos').fetchone()[0];ok(n==2,'2 pedidos no servidor (%d)'%n)
    # rotas antigas do protótipo
    pg.goto(U+'#pedido-101');pg.wait_for_timeout(500);ok('lista de espera' in pg.inner_text('main').lower(),'rota antiga leva à lista de espera')
    ok(not er,'erros: %s'%er[:3])
    b.close()
print('FALHAS',len(falhas))
