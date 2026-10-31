"""Auditoria de tamanhos dos sites estáticos: ecrãs pequenos, letra aumentada e zoom, no motor do Chrome e no do Safari.
Uso: python3 tamanhos.py <raiz> <página> [<página> ...] [--fotos]
Para cada página, em cada largura e com a letra a 100/130/150 %:
  - scroll para os lados
  - texto cortado por uma caixa com overflow hidden/clip
  - texto que sai do ecrã
"""
import subprocess, sys, time, json, os, socket
from pathlib import Path
from playwright.sync_api import sync_playwright

R = Path(os.environ.get('FONTES_LOCAIS', '/home/claude/rec'))
FONT_CSS = {
 'Archivo': "@font-face{font-family:'Archivo';src:url(/__f/archivo.ttf);font-weight:100 900;font-stretch:62% 125%}",
 'Source+Serif+4': "@font-face{font-family:'Source Serif 4';src:url(/__f/sourceserif.ttf);font-weight:200 900}@font-face{font-family:'Source Serif 4';font-style:italic;src:url(/__f/sourceserif-i.ttf);font-weight:200 900}",
 'Plus+Jakarta+Sans': "@font-face{font-family:'Plus Jakarta Sans';src:url(/__f/jakarta.ttf);font-weight:200 900}",
}
def route_fonts(route):
    u = route.request.url
    if '/__f/' in u:
        route.fulfill(path=str(R / 'fonts' / u.split('/__f/')[1]), content_type='font/ttf'); return
    css = ''.join(v for k, v in FONT_CSS.items() if 'family=' + k in u)
    route.fulfill(body=css, content_type='text/css')

VERIFICA = r"""(escala) => {
  const vw = document.documentElement.clientWidth;
  const desc = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0,2).join('.'); return s; };
  const caminho = el => { const p = []; let a = el; for (let i=0; a && a !== document.body && i < 3; i++, a = a.parentElement) p.unshift(desc(a)); return p.join(' > '); };
  const visivel = el => { for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false; if (a.getAttribute && (a.getAttribute('aria-hidden') === 'true' && a.closest('[inert]'))) return false; } return true; };
  const res = { hscroll: document.documentElement.scrollWidth - vw, cortado: [], fora: [] };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  let n;
  while ((n = w.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || vistos.has(el)) continue;
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','OPTION','TITLE'].includes(el.tagName)) continue;
    if (el.closest('.sr,.sr-only,.vh,.visually-hidden,.skip,.salta,[class*=skip],.sr-foco,[hidden],dialog:not([open]),.recolhida')) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    if (!visivel(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter(r => r.width > 1 && r.height > 1);
    if (!rects.length) continue;
    const cs = getComputedStyle(el);
    if (cs.clip !== 'auto' && cs.position === 'absolute' && el.offsetWidth <= 1) continue;
    // ancestrais que cortam
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      const corta = /(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflowY);
      const rola = /(auto|scroll)/.test(s.overflowX + s.overflowY);
      if (rola) break;
      if (!corta) continue;
      if (s.textOverflow === 'ellipsis' || cs.textOverflow === 'ellipsis' || parseInt(s.webkitLineClamp) > 0 || parseInt(cs.webkitLineClamp) > 0) break;
      const b = a.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) break;
      const exH = Math.max(...rects.map(r => Math.max(b.left - r.left, r.right - b.right)));
      const exV = Math.max(...rects.map(r => Math.max(b.top - r.top, r.bottom - b.bottom)));
      const fsz = parseFloat(cs.fontSize);
      const ex = Math.max(exH, exV);
      // a caixa do texto inclui espaço acima e abaixo das letras: até ~30 % da letra na vertical não se vê cortado
      if (exH > 2 || exV > fsz * 0.3) { vistos.add(el); res.cortado.push(caminho(el) + ' «' + n.textContent.trim().slice(0, 40) + '» dentro de ' + desc(a) + ' (' + Math.round(ex) + 'px)'); }
      break;
    }
    if (rects.some(r => r.right > vw + 2 || r.left < -2)) {
      // só conta se nenhum ancestral corta (senão já foi tratado acima)
      let cortado = false; for (let a = el; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { cortado = true; break; } }
      if (!cortado && !vistos.has(el)) { vistos.add(el); res.fora.push(caminho(el) + ' «' + n.textContent.trim().slice(0, 40) + '»'); }
    }
  }
  // texto em cima de texto (rótulos que se atropelam)
  const caixas = [];
  const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let m2;
  while ((m2 = w2.nextNode())) {
    if (!m2.textContent.trim()) continue; const el = m2.parentElement; if (!el || !visivel(el)) continue;
    if (el.closest('[aria-hidden="true"],.sr,.sr-only,.vh,.visually-hidden,.skip,.salta,script,style,noscript,option')) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    let fixo = false; for (let q = el; q && q !== document.body; q = q.parentElement) { const ps = getComputedStyle(q).position; if (ps === 'fixed' || ps === 'sticky') { fixo = q; break; } }
    const rg = document.createRange(); rg.selectNodeContents(m2);
    for (const r of rg.getClientRects()) if (r.width > 2 && r.height > 2) caixas.push({ r, el, fixo, t: m2.textContent.trim().slice(0, 24) });
  }
  const sobre = [];
  for (let i = 0; i < caixas.length && sobre.length < 15; i++) for (let j = i + 1; j < caixas.length; j++) {
    const A = caixas[i], B = caixas[j]; if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    if (A.fixo !== B.fixo) continue; // conteúdo que passa por baixo de uma barra fixa
    const ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    if (ix <= 2 || iy <= 2) continue;
    const ha = Math.min(A.r.height, B.r.height);
    if (iy < ha * 0.45) continue; // linhas vizinhas com entrelinha apertada
    // um por cima do outro de propósito (posição absoluta/fixa)? continua a contar se ambos forem texto normal
    sobre.push('«' + A.t + '» × «' + B.t + '» (' + Math.round(ix) + 'px)'); if (sobre.length >= 15) break;
  }
  res.sobre = sobre;
  res.cortado = [...new Set(res.cortado)].slice(0, 25); res.fora = [...new Set(res.fora)].slice(0, 25);
  return res;
}"""

AUMENTA = r"""(f) => {
  // simula «tamanho do texto» do telemóvel: todas as letras ficam f vezes maiores
  const els = [...document.querySelectorAll('body, body *')];
  const t = els.map(e => parseFloat(getComputedStyle(e).fontSize));
  const pais = els.map(e => e.parentElement ? parseFloat(getComputedStyle(e.parentElement).fontSize) : 0);
  els.forEach((e, i) => { if (t[i] && !e.closest('.card') && (e === document.body || Math.abs(t[i] - pais[i]) > 0.01)) e.style.setProperty('font-size', (t[i] * f) + 'px'); });
  window.dispatchEvent(new Event('resize'));
}"""

def porta_livre():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

MOTOR = next((a.split('=')[1] for a in sys.argv if a.startswith('--motor=')), 'chromium')
# no Safari não há «tamanho do texto» para sites; o zoom da página equivale a um ecrã mais estreito (250 px = 375 px a 150 %)
COMBOS=((280,1),(320,1),(360,1),(390,1),(768,1),(1440,1),(320,1.3),(390,1.3),(320,1.5)) if MOTOR=='chromium' else ((250,1),(320,1),(375,1),(390,1),(768,1),(1440,1))
def auditar(raiz, paginas, fotos=False, saida='/home/claude/check/tam', combos=COMBOS, espera=1800):
    os.makedirs(saida, exist_ok=True)
    porta = porta_livre()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(porta), '-d', raiz], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    relatorio = {}
    try:
        with sync_playwright() as p:
            b = getattr(p, MOTOR).launch()
            for pag in paginas:
                for w, esc in combos:
                    if True:
                        ctx = b.new_context(viewport={'width': w, 'height': 800}, device_scale_factor=1, is_mobile=(w < 700 and MOTOR != 'firefox'), has_touch=w < 700, reduced_motion='reduce')
                        if (R / 'fonts').exists():
                            ctx.route('https://fonts.googleapis.com/**', route_fonts)
                            ctx.route('https://fonts.gstatic.com/**', lambda r: r.abort())
                        ctx.add_init_script("try{sessionStorage.setItem('adri-pop','1');localStorage.setItem('dc-promo',String(Date.now()));localStorage.setItem('anjinho-prenda','ok')}catch(e){}")
                        pg = ctx.new_page(); erros = []
                        pg.on('pageerror', lambda e: erros.append(str(e)[:120]))
                        try:
                            pg.goto(f'http://127.0.0.1:{porta}/{pag}', wait_until='load', timeout=20000)
                        except Exception as e:
                            relatorio[f'{pag} {w} {esc}'] = {'erro': str(e)[:100]}; ctx.close(); continue
                        pg.wait_for_timeout(espera)
                        # revelar tudo o que espera pelo scroll
                        pg.evaluate("async()=>{for(let y=0;y<document.body.scrollHeight;y+=innerHeight*0.6){scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,140));}scrollTo({top:0,behavior:'instant'})}")
                        pg.wait_for_timeout(600)
                        if esc != 1: pg.evaluate(AUMENTA, esc); pg.wait_for_timeout(700)
                        r = pg.evaluate(VERIFICA, esc)
                        r['erros'] = erros
                        relatorio[f'{pag} {w} {esc}'] = r
                        if fotos and (w in (280, 320) or esc == 1.5):
                            nome = f"{pag.strip('/').replace('/', '_') or 'index'}_{w}_{esc}.png"
                            pg.screenshot(path=f'{saida}/{nome}', full_page=True)
                        ctx.close()
            b.close()
    finally:
        srv.terminate()
    return relatorio

def resumo(rel):
    falhas = 0
    for k, r in rel.items():
        if 'erro' in r: print('ERRO ', k, r['erro']); falhas += 1; continue
        probs = []
        if r['hscroll'] > 1: probs.append(f"scroll para os lados +{r['hscroll']}px")
        if r['cortado']: probs.append(f"{len(r['cortado'])} texto(s) cortado(s)")
        if r['fora']: probs.append(f"{len(r['fora'])} texto(s) fora do ecrã")
        if r.get('sobre'): probs.append(f"{len(r['sobre'])} texto(s) em cima de outro")
        if r['erros']: probs.append(f"erros JS: {r['erros'][:2]}")
        if probs:
            falhas += 1
            print('FALHA', k, '|', '; '.join(probs))
            for c in r['cortado'][:8]: print('      cortado:', c)
            for c in r['fora'][:8]: print('      fora:', c)
            for c in r.get('sobre', [])[:8]: print('      sobre:', c)
    print('TOTAL com problemas:', falhas, 'de', len(rel))

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    nome = next((a.split('=')[1] for a in sys.argv if a.startswith('--nome=')), 'ultimo')
    base = os.environ.get('SAIDA', '/home/claude/check/tam')
    rel = auditar(args[0], args[1:], fotos='--fotos' in sys.argv, saida=f'{base}/{nome}')
    json.dump(rel, open(f'{base}/{nome}.json', 'w'), ensure_ascii=False, indent=1)
    resumo(rel)
