#!/usr/bin/env python3
"""Testa um site nos três motores (Chromium, Firefox e WebKit/Safari) e em aparelhos simulados.

Uso: python3 auditoria/browsers_sites.py <pasta_saida> <url> [url...]
Para cada url e aparelho: erros de JavaScript, rolagem lateral, elementos fora do ecrã e capturas
(primeiro ecrã e página inteira). Escreve tudo em <pasta_saida>/resultado.txt.
"""
import os, sys
from playwright.sync_api import sync_playwright

saida, urls = sys.argv[1], sys.argv[2:]
os.makedirs(saida, exist_ok=True)
JS = '''() => {
  const W = innerWidth;
  const fora = [...document.querySelectorAll('body *')].filter(e => {
    if (e.closest('.isco,.vh,dialog,.barra,.xadrez,[hidden]')) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 1 || r.left < -1);
  }).slice(0, 5).map(e => e.tagName + '.' + (e.className && e.className.baseVal === undefined ? e.className : '') + ' ' + Math.round(e.getBoundingClientRect().right));
  return {largura: W, scroll: document.documentElement.scrollWidth, fora};
}'''
linhas = []
with sync_playwright() as p:
    perfis = [
        ('webkit', 'iphone', dict(p.devices['iPhone 13'])),
        ('webkit', 'iphone-se', dict(p.devices['iPhone SE'])),
        ('webkit', 'ipad', dict(p.devices['iPad Mini'])),
        ('chromium', 'android', dict(p.devices['Pixel 7'])),
        ('firefox', 'firefox-telemovel', {'viewport': {'width': 390, 'height': 844}}),
        ('webkit', 'safari-pc', {'viewport': {'width': 1440, 'height': 900}}),
        ('firefox', 'firefox-pc', {'viewport': {'width': 1440, 'height': 900}}),
        ('chromium', 'chrome-pc', {'viewport': {'width': 1440, 'height': 900}}),
    ]
    abertos = {}
    for motor, nome, opc in perfis:
        if motor not in abertos:
            abertos[motor] = getattr(p, motor).launch()
        if motor == 'firefox':
            opc.pop('is_mobile', None)
        for n, url in enumerate(urls):
            ctx = abertos[motor].new_context(**opc)
            pg = ctx.new_page()
            erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)[:160]))
            try:
                pg.goto(url, wait_until='load', timeout=45000)
                pg.wait_for_timeout(1500)
                pg.screenshot(path=os.path.join(saida, '%s-%d-topo.png' % (nome, n)))
                alt = pg.evaluate('document.documentElement.scrollHeight')
                for y in range(0, alt, 600):
                    pg.evaluate('scrollTo(0,%d)' % y)
                    pg.wait_for_timeout(40)
                pg.wait_for_timeout(800)
                r = pg.evaluate(JS)
                pg.evaluate('scrollTo(0,0)')
                pg.wait_for_timeout(300)
                try:
                    pg.screenshot(path=os.path.join(saida, '%s-%d-inteira.png' % (nome, n)), full_page=True)
                except Exception:
                    pass  # páginas muito altas em ecrãs de densidade 3 passam o limite de 32767 px das capturas
                ok = r['scroll'] <= r['largura'] and not r['fora'] and not erros
                linhas.append('%s %s %s: %s %s %s' % ('OK ' if ok else 'MAU', nome, url, r, erros[:3], ''))
            except Exception as e:
                linhas.append('ERRO %s %s: %s' % (nome, url, str(e)[:200]))
            ctx.close()
    for b in abertos.values():
        b.close()
open(os.path.join(saida, 'resultado.txt'), 'w').write('\n'.join(linhas) + '\n')
print('\n'.join(linhas))
