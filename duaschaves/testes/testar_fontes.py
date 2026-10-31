import subprocess,time,sys,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8773','--bind','127.0.0.1'],cwd='/tmp/teste-real2',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
falhas=[]
def ok(c,m):
    if not c:falhas.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':390,'height':844});erros=[];pg.on('pageerror',lambda e:erros.append(str(e)))
    pedidos=[];pg.on('request',lambda r:pedidos.append(r.url))
    pg.goto('http://127.0.0.1:8773/#pesquisa');pg.wait_for_timeout(1500)
    n=pg.evaluate('dcCasas().length');ok(100<=n<=144,'casas %s'%n)
    ok(any(u.endswith('lista.json') for u in pedidos) and not any(u.endswith('anuncios.json') for u in pedidos),'usa lista.json')
    fontes=pg.evaluate('dcCasas().reduce(function(o,c){o[c.fonte]=(o[c.fonte]||0)+1;return o},{})');print(fontes)
    ok(set(fontes)>= {'Supercasa','Casa Sapo','Imovirtual'},'três fontes')
    ids=pg.evaluate('dcCasas().map(function(c){return c.id})');ok(len(set(ids))==len(ids),'ids únicos')
    for f in ['Casa Sapo','Supercasa','Imovirtual']:
      i=pg.evaluate('dcCasas().filter(function(c){return c.fonte==%s})[0].id'%json.dumps(f))
      pg.goto('http://127.0.0.1:8773/#casa-%d'%i);pg.wait_for_timeout(900)
      t=pg.inner_text('main');ok('A carregar' not in t,f+' descrição carregada');ok('Sobre a casa' in t,f+' abre')
      pg.screenshot(path='/tmp/testes/fonte-%s.png'%f.replace(' ',''))
    ok(any('/det/' in u for u in pedidos),'pediu det')
    ok(not erros,'erros %s'%erros)
finally:srv.terminate()
print('FALHAS' if falhas else 'TUDO OK',len(falhas))
for x in falhas:print(' -',x)
