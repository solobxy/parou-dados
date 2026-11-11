#!/usr/bin/env python3
"""Capturas de ecrã de sites públicos (o primeiro ecrã e a página inteira), para rever o impacto inicial.
Uso: python3 auditoria/capturas_sites.py <saida> "nome url" ["nome url" ...]
Para cada site: <nome>-m.png (390x844, telemóvel, 2x), <nome>-mfull.png (página inteira no telemóvel, até 6000 px),
<nome>-d.png (1440x900, computador) e <nome>-m3s.png (o primeiro ecrã 3 s depois, para ver animações de entrada)."""
import asyncio, os, sys
from playwright.async_api import async_playwright

SAIDA = sys.argv[1]
os.makedirs(SAIDA, exist_ok=True)
PEDIDOS = [a.split(None, 1) for a in sys.argv[2:]]


async def um(b, nome, url):
    log = []
    for vista, vw, vh, mob in (('m', 390, 844, True), ('d', 1440, 900, False)):
        ctx = await b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob,
                                  locale='pt-PT', user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' if mob else None))
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: log.append(f'{vista} erro JS: {e}'))
        try:
            await pg.goto(url, wait_until='domcontentloaded', timeout=45000)
            await pg.wait_for_timeout(900)
            await pg.screenshot(path=f'{SAIDA}/{nome}-{vista}.png')
            if mob:
                await pg.wait_for_timeout(2600)
                await pg.screenshot(path=f'{SAIDA}/{nome}-m3s.png')
                h = await pg.evaluate('document.documentElement.scrollHeight')
                # desce devagar para as animações de entrada correrem, e volta acima
                for y in range(0, min(h, 6000), 500):
                    await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(120)
                await pg.evaluate('window.scrollTo(0,0)'); await pg.wait_for_timeout(500)
                await pg.set_viewport_size({'width': vw, 'height': min(h, 6000)})
                await pg.wait_for_timeout(800)
                await pg.screenshot(path=f'{SAIDA}/{nome}-mfull.png')
            lcp = await pg.evaluate("new Promise(r=>{let v=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())v=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){};setTimeout(()=>r(Math.round(v)),300)})")
            log.append(f'{vista} LCP~{lcp} ms')
        except Exception as e:  # noqa: BLE001
            log.append(f'{vista} falhou: {e}')
        await ctx.close()
    return f'{nome} {url}: ' + '; '.join(log)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', args=['--no-sandbox'])
        res = [await um(b, n, u) for n, u in PEDIDOS]
        await b.close()
    open(f'{SAIDA}/resultado.txt', 'w').write('\n'.join(res) + '\n')
    print('\n'.join(res))

asyncio.run(main())
