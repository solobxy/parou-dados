#!/usr/bin/env python3
"""Imagens de pré-visualização dos links da Dayla (WhatsApp, iMessage, Instagram, Telegram, Facebook, X).

Gera sites/dayla/partilha/{site-pt,site-en,painel,avaliar}.jpg com 1200×630 px, desenhadas em HTML com a letra
do site e fotografadas no Chromium (Playwright) a densidade 2 e reduzidas, para ficarem nítidas.
Uso: python3 dayla/partilha.py
"""
import os, pathlib, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SITE = RAIZ / 'sites' / 'dayla'
SAIDA = SITE / 'partilha'
FONTE = (SITE / 'fonts' / 'archivo.woff2').as_uri()
LOGO_B = (SITE / 'logo-branco.svg').read_text(encoding='utf-8')
# versão para fundo claro: letras pretas e o recorte da argola na cor do papel
LOGO_P = LOGO_B.replace('fill="#F4F3F0"', 'fill="#101010"').replace('stroke="#0A0A0A" stroke-width="80"', 'stroke="#F5F5F3" stroke-width="80"')
FOTO = lambda n: (SITE / 'img' / n).as_uri()

BASE_CSS = '''
@font-face{font-family:A;src:url(%s) format("woff2-variations");font-weight:100 900;font-stretch:62%% 125%%}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:A,sans-serif;-webkit-font-smoothing:antialiased;position:relative;background:#0A0A0A;color:#F4F3F0}
.logo{position:absolute;left:72px;top:62px;width:196px}
.logo svg{display:block;width:100%%;height:auto}
h1{font-weight:820;font-stretch:74%%;letter-spacing:-.012em;line-height:.9}
h1 span{display:block;white-space:nowrap}
.sub{font-size:27px;font-weight:500;line-height:1.3;color:#A3A3A0}
.xz{position:absolute;left:0;right:0;bottom:0;height:24px;background:conic-gradient(#F4F3F0 25%%,#0A0A0A 0 50%%,#F4F3F0 0 75%%,#0A0A0A 0) 0 0/48px 48px;z-index:3}
.xz i{position:absolute;left:72px;top:0;width:24px;height:24px;background:#F2B5CB}
.foto{position:absolute;right:0;top:0;bottom:24px;overflow:hidden}
.foto img{position:absolute;left:0;display:block}
.foto::after{content:"";position:absolute;inset:0;background:
  linear-gradient(90deg,#0A0A0A 0,rgba(10,10,10,.82) 70px,rgba(10,10,10,.35) 190px,rgba(10,10,10,0) 300px),
  linear-gradient(0deg,rgba(10,10,10,.55) 0,rgba(10,10,10,0) 120px)}
''' % FONTE


def site(lang):
    t = {'pt': ('Piercing no Porto,', 'sem dúvidas.', 'Porto · por marcação · PT e EN'),
         'en': ('Piercing in Porto,', 'no guesswork.', 'Porto · by appointment · EN and PT')}[lang]
    # foto 900×1351 a 580 px de largura (871 de altura): o flat fica a 47,1 % × 40,5 % e o lóbulo a 61,4 %
    return '''<style>%s
.foto{width:580px}.foto img{width:580px;height:871px;top:-141px}
.aro{position:absolute;z-index:2;left:%dpx;top:%dpx;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%%;
  border:3px solid #F2B5CB;box-shadow:0 0 0 1.5px rgba(10,10,10,.45),inset 0 0 0 1.5px rgba(10,10,10,.45)}
h1{position:absolute;left:72px;top:218px;font-size:96px}
.sub{position:absolute;left:72px;top:428px}
</style>
<div class="foto"><img src="%s" alt=""></div><div class="aro"></div>
<div class="logo">%s</div>
<h1><span>%s</span><span>%s</span></h1>
<p class="sub">%s</p>
<div class="xz"><i></i></div>''' % (BASE_CSS, 620 + round(.471 * 580), round(.405 * 871) - 141,
                                      FOTO('t-flat-4-lobulos.webp'), LOGO_B, t[0], t[1], t[2])


def painel():
    linhas = [('prefere', 'sáb', 'Marta', '<em class="rosa">novo</em>', 'Flat, Lóbulo', 'a confirmar'),
              ('sex', '20', 'James', '<em>EN</em>', 'Hélix', '18:30'),
              ('sáb', '21', 'Leonor', '', 'Septo', '11:00'),
              ('sáb', '21', 'Inês', '', 'Narina', '15:00')]
    itens = ''.join('<li><span class="q"><small>%s</small>%s</span><span class="t"><b>%s%s</b><span>%s</span></span>'
                    '<span class="d">%s</span></li>' % l for l in linhas)
    return '''<style>%s
body{background:#F5F5F3;color:#101010}
.xz{background:conic-gradient(#101010 25%%,#F5F5F3 0 50%%,#101010 0 75%%,#F5F5F3 0) 0 0/48px 48px}
h1{position:absolute;left:72px;top:218px;font-size:168px;letter-spacing:-.02em}
.sub{position:absolute;left:72px;top:400px;color:#545454;width:520px}
.tel{position:absolute;left:706px;top:66px;width:404px;height:640px;border-radius:58px;background:#101010;padding:12px;z-index:4;
  box-shadow:0 30px 60px -20px rgba(16,16,16,.35)}
.ecra{height:100%%;border-radius:47px;background:#F5F5F3;padding:58px 26px 0;overflow:hidden}
.ecra h2{font-weight:820;font-stretch:72%%;font-size:44px;line-height:1;letter-spacing:-.01em}
.ecra p{color:#545454;font-size:17px;margin:8px 0 18px}
ul{list-style:none;border-top:1px solid #D6D6D1}
li{display:grid;grid-template-columns:62px 1fr auto;gap:12px;align-items:center;padding:15px 2px;border-bottom:1px solid #E2E2DE}
.q{text-align:center;font-weight:820;font-stretch:72%%;font-size:28px;line-height:1}
.q small{display:block;font-size:13px;font-weight:700;font-stretch:100%%;color:#545454}
.t b{display:block;font-size:19px;white-space:nowrap}
.t span{display:block;color:#545454;font-size:15px;white-space:nowrap}
em{font-style:normal;display:inline-block;font-size:12px;font-weight:800;padding:1px 8px;border-radius:999px;background:#101010;color:#F5F5F3;margin-left:7px;vertical-align:3px}
em.rosa{background:#F2B5CB;color:#101010}
.d{font-weight:800;font-stretch:112%%;font-size:15px;text-align:right;font-variant-numeric:tabular-nums}
</style>
<div class="logo">%s</div>
<h1><span>Painel</span></h1>
<p class="sub">Pedidos, dias, preços e fotos do teu site.</p>
<div class="tel"><div class="ecra"><h2>Pedidos</h2><p>1 pedido novo</p><ul>%s</ul></div></div>
<div class="xz"><i></i></div>''' % (BASE_CSS, LOGO_P, itens)


def avaliar():
    estrela = '<span><svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor"/></svg></span>'
    return '''<style>%s
.foto{width:560px}.foto img{width:560px;height:841px;top:-140px}
.foto::before{content:"";position:absolute;inset:0;background:rgba(10,10,10,.18);z-index:1}
h1{position:absolute;left:72px;top:216px;font-size:112px}
.en{position:absolute;left:72px;top:326px;font-weight:760;font-stretch:74%%;font-size:46px;color:#A3A3A0;letter-spacing:-.005em}
.est{position:absolute;left:72px;top:426px;display:flex;gap:10px}
.est span{display:grid;place-items:center;width:64px;height:64px;border-radius:14px;background:#F4F3F0;color:#0A0A0A}
.est svg{width:38px;height:38px}
</style>
<div class="foto"><img src="%s" alt=""></div>
<div class="logo">%s</div>
<h1><span>Como correu?</span></h1>
<p class="en">How did it go?</p>
<div class="est">%s</div>
<div class="xz"><i></i></div>''' % (BASE_CSS, FOTO('t-lobulo.webp'), LOGO_B, estrela * 5)


def main():
    SAIDA.mkdir(exist_ok=True)
    pecas = {'site-pt': site('pt'), 'site-en': site('en'), 'painel': painel(), 'avaliar': avaliar()}
    tmp = pathlib.Path(tempfile.mkdtemp())
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=2)
        for nome, corpo in pecas.items():
            f = tmp / (nome + '.html')
            f.write_text('<!doctype html><meta charset="utf-8">' + corpo, encoding='utf-8')
            pg.goto(f.as_uri(), wait_until='load')
            pg.evaluate('document.fonts.ready')
            larga = pg.evaluate('''() => [...document.querySelectorAll('h1 span,.sub,.en')].map(e => e.getBoundingClientRect().right)''')
            png = tmp / (nome + '.png')
            pg.screenshot(path=str(png))
            im = Image.open(png).convert('RGB').resize((1200, 630), Image.LANCZOS)
            destino = SAIDA / (nome + '.jpg')
            im.save(destino, 'JPEG', quality=86, optimize=True, progressive=True)
            print(nome, os.path.getsize(destino) // 1024, 'KB', 'texto até', round(max(larga)), 'px')
        nav.close()


if __name__ == '__main__':
    main()
