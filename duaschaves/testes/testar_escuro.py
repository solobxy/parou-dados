from playwright.sync_api import sync_playwright
import subprocess,sys,time
srv=subprocess.Popen([sys.executable,'-m','http.server','8766','--bind','127.0.0.1'],cwd='/home/claude/teste-real',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
JS='''() => {
 function lum(c){const m=c.match(/[\\d.]+/g).map(Number);if(m.length>3&&m[3]===0)return null;return m.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[0.2126,0.7152,0.0722][i],0)}
 function fundo(el){while(el){const b=getComputedStyle(el).backgroundColor;const l=lum(b);if(l!==null)return l;el=el.parentElement}return 1}
 const maus=[];
 for(const el of document.querySelectorAll('dialog *, main *, header *, footer *')){
   if(!el.offsetParent&&el.tagName!=='DIALOG')continue;
   const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
   if(!t)continue;
   const cs=getComputedStyle(el);const lt=lum(cs.color);if(lt===null)continue;
   const lb=fundo(el);const r=(Math.max(lt,lb)+0.05)/(Math.min(lt,lb)+0.05);
   const grande=parseFloat(cs.fontSize)>=24||(parseFloat(cs.fontSize)>=18.6&&parseInt(cs.fontWeight)>=700);
   if(r<(grande?3:4.5))maus.push(t.slice(0,40)+' '+r.toFixed(2));
 }
 return maus.slice(0,15);
}'''
falhas=[]
try:
  with sync_playwright() as p:
    nav=p.chromium.launch()
    for esquema in ['dark','light']:
      ctx=nav.new_context(viewport={'width':390,'height':844},color_scheme=esquema);pg=ctx.new_page()
      for rota in ['inicio','pesquisa','precos','proteger','senhorios','conta','ajuda']:
        pg.goto('http://127.0.0.1:8766/#'+rota);pg.wait_for_timeout(500)
        m=pg.evaluate(JS)
        if m:falhas.append((esquema,rota,m))
      pg.goto('http://127.0.0.1:8766/#pesquisa');pg.wait_for_timeout(700)
      pg.click('#lista .cartao >> nth=0');pg.wait_for_timeout(500)
      m=pg.evaluate(JS); 
      if m:falhas.append((esquema,'casa',m))
      pg.click('[data-acao=ligar]');pg.wait_for_timeout(300)
      bg=pg.evaluate("getComputedStyle(document.getElementById('dialogo')).backgroundColor")
      if bg!='rgb(255, 255, 255)':falhas.append((esquema,'dialogo fundo',bg))
      m=pg.evaluate(JS)
      if m:falhas.append((esquema,'paywall',m))
      pg.screenshot(path=f'/home/claude/testes/capturas9/paywall-{esquema}.png')
      ctx.close()
finally: srv.terminate()
print('TUDO OK' if not falhas else falhas)
