from playwright.sync_api import sync_playwright
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
U='https://localhost:8443/'
AND='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
with sync_playwright() as p:
    b=p.chromium.launch(args=['--ignore-certificate-errors'])
    for nome,ua in [('android',AND),('ios',IOS)]:
        ctx=b.new_context(viewport={'width':390,'height':844},user_agent=ua,ignore_https_errors=True);pg=ctx.new_page();er=[];pg.on('pageerror',lambda e:er.append(str(e)))
        pg.goto(U+'#inicio');pg.wait_for_timeout(1500)
        m=pg.evaluate("fetch('/manifest.webmanifest').then(r=>r.json())");ok(m['short_name']=='Duplicasa' and len(m['icons'])==4,'manifest')
        ok(pg.locator('[data-instalar-cartao]').is_visible(),nome+' cartão instalar')
        pg.screenshot(path=f'/home/claude/testes/pwa-{nome}.png')
        pg.locator('[data-instalar-cartao] [data-instalar]').click();pg.wait_for_timeout(400)
        t=pg.inner_text('dialog');ok(('Partilhar' in t) if nome=='ios' else ('Instalar app' in t),nome+' instruções: '+t[:80])
        pg.screenshot(path=f'/home/claude/testes/pwa-{nome}-dlg.png')
        pg.keyboard.press('Escape')
        if nome=='android':
            pg.wait_for_timeout(1500);r=pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)");print('sw registado',r)
        ok(not er,'erros %s'%er);ctx.close()
    # desktop sem pedido: sem cartão
    ctx=b.new_context(viewport={'width':1280,'height':900},ignore_https_errors=True);pg=ctx.new_page();pg.goto(U+'#inicio');pg.wait_for_timeout(1000)
    ok(pg.locator('[data-instalar-cartao]').count()==0,'computador sem cartão')
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for x in falhas:print(' -',x)
