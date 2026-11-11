#!/usr/bin/env python3
"""AdriBodyPiercing: uma página por piercing (/piercing/<sítio>/) e a lista de preços (/piercing/).

Para quem pesquisa «piercing nariz porto», «piercing helix», «piercing umbigo preço», «piercing septo porto»… (sugestões do
Google em Portugal, 11/11/2026). Os preços, os tempos de cicatrização, as joias e as combinações vêm do próprio site
(a lista S e COMBINA em sites/adribodypiercing/index.html), por isso nunca ficam diferentes do que o site mostra.
Também atualiza o sitemap.xml. Uso: python3 adri/paginas.py   (a guarda diária verifica que as páginas estão em dia)
"""
import html
import json
import os
import re
import shutil
from urllib.parse import quote

AQUI = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(os.path.dirname(AQUI), 'sites', 'adribodypiercing')
SITE = 'https://adribodypiercing.pt'
e = html.escape

# Como as pessoas pesquisam cada sítio (e o caminho da página)
NOMES = {
    'lobulo': ('Piercing no lóbulo da orelha', 'lobulo'), 'lobulo-alto': ('Piercing no lóbulo alto', 'lobulo-alto'),
    'helix': ('Piercing hélix', 'helix'), 'helix-frontal': ('Piercing hélix frontal', 'helix-frontal'), 'flat': ('Piercing flat', 'flat'),
    'tragus': ('Piercing tragus', 'tragus'), 'antitragus': ('Piercing anti-tragus', 'anti-tragus'), 'conch': ('Piercing conch', 'conch'),
    'daith': ('Piercing daith', 'daith'), 'rook': ('Piercing rook', 'rook'), 'snug': ('Piercing snug', 'snug'), 'industrial': ('Piercing industrial', 'industrial'),
    'narina': ('Piercing no nariz', 'nariz'), 'septo': ('Piercing no septo', 'septo'), 'labio': ('Piercing no lábio', 'labio'),
    'medusa': ('Piercing medusa', 'medusa'), 'smiley': ('Piercing smiley', 'smiley'), 'sobrancelha': ('Piercing na sobrancelha', 'sobrancelha'),
    'umbigo': ('Piercing no umbigo', 'umbigo'), 'mamilo': ('Piercing no mamilo', 'mamilo'), 'surface': ('Piercing de superfície', 'superficie'),
    'microdermal': ('Microdermal', 'microdermal'),
}
ZONA = {'orelha': 'Orelha', 'rosto': 'Rosto', 'corpo': 'Corpo'}
CARTILAGEM = {'helix', 'helix-frontal', 'flat', 'tragus', 'antitragus', 'conch', 'daith', 'rook', 'snug', 'industrial'}


def ler_site():
    s = open(os.path.join(SITE_DIR, 'index.html'), encoding='utf-8').read()
    itens = []
    for m in re.finditer(r"\{id:'([^']+)', n:'([^']+)', z:'([^']+)', p:(\d+)(?:, sc:true)?, c:'([^']+)', j:'([^']+)', img:'([^']+)'", s):
        i, n, z, p, c, j, img = m.groups()
        if z in ZONA and i in NOMES:
            itens.append({'id': i, 'n': n, 'z': z, 'p': int(p), 'c': c, 'j': j, 'img': img})
    imgs = json.loads(re.search(r'var IMG = (\{.*?\});', s).group(1))
    combina = {}
    bloco = re.search(r'var COMBINA = \{(.*?)\};', s, re.S).group(1)
    for k, v in re.findall(r"'?([a-z-]+)'?:\[([^\]]*)\]", bloco):
        combina[k] = re.findall(r"'([^']+)'", v)
    logo = re.search(r'(<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -750 4031 840".*?</svg>)', s, re.S).group(1)
    return itens, imgs, combina, logo


def preco(x):
    return ('desde ' if x['z'] == 'orelha' else '') + f'{x["p"]} €'


def caminho(x):
    return f'/piercing/{NOMES[x["id"]][1]}/'


def dor(x):
    if x['id'] in CARTILAGEM:
        return 'É uma picada forte que dura um ou dois segundos. Na cartilagem costuma doer um pouco mais do que no lóbulo e fica sensível uns dias.'
    if x['id'] in ('lobulo', 'lobulo-alto'):
        return 'É uma picada rápida, que dura um ou dois segundos. O lóbulo é das zonas mais fáceis e que menos dói.'
    return 'É uma picada forte que dura um ou dois segundos. Se estiveres com nervos, diz: vamos com calma e explico cada passo antes de o fazer.'


CSS = '''@font-face{font-family:"Bricolage Grotesque";src:url(/fonts/bricolage.woff) format("woff");font-weight:200 800;font-display:swap}
@font-face{font-family:Figtree;src:url(/fonts/figtree.woff) format("woff");font-weight:300 900;font-display:swap}
:root{--noite:#0E0C0B;--osso:#EEE8DF;--sec:#BDB5A9;--ouro:#D9B676;--tinta:#141210;--cartao:#1D1A17;--linha:#2E2925}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--noite);color:var(--osso);font:400 17px/1.6 Figtree,"Avenir Next","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}img,svg{display:block;max-width:100%}
:focus-visible{outline:3px solid var(--ouro);outline-offset:3px;border-radius:4px}
.w{max-width:960px;margin:0 auto;padding:0 clamp(20px,4vw,40px)}
header{position:sticky;top:0;z-index:5;background:rgba(14,12,11,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--linha)}
header .w{display:flex;align-items:center;justify-content:space-between;height:68px;gap:12px}
.logo svg{height:30px;width:auto}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 26px;border-radius:999px;background:var(--ouro);color:var(--tinta);font-weight:600;text-decoration:none;text-align:center}
.btn.sec{background:transparent;color:var(--osso);box-shadow:inset 0 0 0 1.5px rgba(238,232,223,.35)}
header .btn{min-height:44px;padding:0 18px;font-size:15px}
.mig{font-size:14px;color:var(--sec);margin:28px 0 10px}.mig a{color:var(--sec)}
h1,h2,h3{font-family:"Bricolage Grotesque","Avenir Next",system-ui,sans-serif;letter-spacing:-.025em;margin:0}
h1{font-size:clamp(38px,8vw,72px);line-height:1;font-weight:700;text-wrap:balance}
h2{font-size:clamp(26px,4.4vw,38px);line-height:1.1;margin:56px 0 14px;font-weight:650}
h3{font-size:19px;margin:22px 0 4px}
.lead{font-size:clamp(18px,2.2vw,21px);color:var(--sec);max-width:640px;margin:18px 0 26px}
.ficha{display:grid;grid-template-columns:110px 1fr;gap:18px;align-items:center;background:#1A1715;border:1px solid var(--linha);border-radius:22px;padding:20px;max-width:560px}
.ficha img{width:110px;height:110px;object-fit:contain}
.ficha dl{margin:0;display:grid;grid-template-columns:1fr;gap:2px;font-size:15.5px}.ficha dt{color:var(--sec);font-size:13.5px;margin-top:8px}.ficha dt:first-child{margin-top:0}.ficha dd{margin:0;font-weight:600}
.preco{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-size:34px;font-weight:600;color:var(--ouro);font-variant-numeric:tabular-nums}
.acoes{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0 0}
p,li{color:var(--sec)}strong{color:var(--osso)}
ul.l{padding-left:20px}ul.l li{margin:6px 0}
.ch{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:14px 0 0}
.ch a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:#1A1715;border:1px solid var(--linha);text-decoration:none;color:var(--osso)}
.ch a small{color:var(--ouro);margin-left:8px;font-weight:600}
.tab{width:100%;border-collapse:collapse;font-size:16px}.tab td,.tab th{padding:12px 6px;border-bottom:1px solid var(--linha);text-align:left}.tab th{color:var(--sec);font-weight:500}.tab td.n,.tab th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tab a{color:var(--osso)}
footer{margin-top:72px;border-top:1px solid var(--linha);padding:30px 0 44px;font-size:14px;color:var(--sec)}footer a{color:var(--sec)}
@media(max-width:420px){.ficha{grid-template-columns:84px 1fr}.ficha img{width:84px;height:84px}.preco{font-size:28px}}'''

NEGOCIO = {'@type': 'HealthAndBeautyBusiness', '@id': SITE + '/#negocio', 'name': 'AdriBodyPiercing', 'url': SITE + '/', 'telephone': '+351935837613',
           'address': {'@type': 'PostalAddress', 'streetAddress': 'Rua da Torrinha, 202 (Kaos Tattoo)', 'addressLocality': 'Porto', 'addressCountry': 'PT'},
           'openingHours': ['Sa 10:00-17:30'], 'priceRange': '30 €–60 €'}


def doc(titulo, descricao, url, ld, corpo, logo, rodape_links):
    return f'''<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title><meta name="description" content="{e(descricao)}"><link rel="canonical" href="{SITE}{url}">
<meta name="theme-color" content="#0E0C0B"><meta property="og:type" content="website"><meta property="og:locale" content="pt_PT">
<meta property="og:site_name" content="AdriBodyPiercing"><meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(descricao)}">
<meta property="og:url" content="{SITE}{url}"><meta property="og:image" content="{SITE}/og.jpg"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/bricolage.woff" as="font" type="font/woff" crossorigin>
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@graph": ld}, ensure_ascii=False)}</script>
<script defer src="/_e.js" data-site="adribodypiercing"></script></head><body>
<header><div class="w"><a class="logo" href="/" aria-label="AdriBodyPiercing, início">{logo}</a><a class="btn" href="/#marcar">Marcar</a></div></header>
<main class="w">
{corpo}
</main>
<footer><div class="w"><p>AdriBodyPiercing, de Adriano Filho · Kaos Tattoo, Rua da Torrinha 202, Porto · aos sábados, das 10h às 17h30</p>
<p>{rodape_links}</p>
<p><a href="/">Início</a> · <a href="/#precos">Preços</a> · <a href="/#perguntas">Perguntas</a> · <a href="https://www.instagram.com/adrifilhoo" rel="noopener">Instagram</a> · <a href="https://dinissousa.pt" rel="noopener">feito por dinissousa.pt</a></p></div></footer>
</body></html>
'''


def gerar():
    itens, imgs, combina, logo = ler_site()
    por_id = {x['id']: x for x in itens}
    rodape_links = ' · '.join(f'<a href="{caminho(x)}">{e(NOMES[x["id"]][0])}</a>' for x in itens)
    paginas = {}
    for x in itens:
        nome = NOMES[x['id']][0]
        url = caminho(x)
        pr = preco(x)
        titulo = f'{nome} no Porto: {pr} com joia em titânio'
        if len(titulo) > 60:
            titulo = f'{nome} no Porto: {pr}'
        descricao = (f'{nome} no Porto com o Adri: {pr}, com joia em titânio, soro e revisão incluídos. '
                     f'Cicatriza em {x["c"]}. Agulha de uso único.')
        if len(descricao) > 160:
            descricao = f'{nome} no Porto com o Adri: {pr}, com joia em titânio, soro e revisão incluídos. Agulha de uso único.'
        perg = [
            (f'Quanto custa o {nome.lower()} no Porto?', f'{pr[0].upper() + pr[1:]}, já com a joia em titânio de implante ({x["j"].lower()}), o soro para os cuidados e a revisão às 4–8 semanas.'
             + (' Na orelha o preço pode subir conforme a complexidade, mas digo-te sempre o valor antes de começar.' if x['z'] == 'orelha' else '')),
            (f'Quanto tempo demora a cicatrizar?', f'{x["c"][0].upper() + x["c"][1:]}. Por fora pode parecer pronto antes de estar cicatrizado por dentro, por isso não troques a joia sozinho: passa cá e vemos juntos.'),
            ('Dói?', dor(x)),
            ('Com que joia saio?', f'{x["j"]}, em titânio de implante (sem níquel). Às 4–8 semanas, quando o inchaço baixa, troco a barra por uma mais curta, sem custo.'),
        ]
        comb = [por_id[c] for c in combina.get(x['id'], []) if c in por_id]
        img = imgs.get(x['img'], '').split('?')[0]
        corpo = f'''<nav class="mig" aria-label="Estás aqui"><a href="/">Início</a> › <a href="/piercing/">Piercings</a> › {e(nome)}</nav>
<h1>{e(nome)} no Porto</h1>
<p class="lead">Feito pelo Adri com agulha americana estéril de uso único, aberta à tua frente, e joia em titânio de implante. Aos sábados, no Kaos Tattoo, uma pessoa de cada vez.</p>
<div class="ficha">{f'<img src="{e(img)}" alt="{e(x["j"])}" width="110" height="110" loading="eager">' if img else ''}
<div><p class="preco" style="margin:0 0 8px">{e(pr)}</p><dl><dt>Cicatriza em</dt><dd>{e(x["c"])}</dd><dt>Joia incluída</dt><dd>{e(x["j"])}</dd><dt>Também incluído</dt><dd>Soro e revisão às 4–8 semanas</dd></dl></div></div>
<p class="acoes"><a class="btn" href="/?p={quote(x["id"])}#marcar">Marcar este piercing</a><a class="btn sec" href="https://wa.me/351935837613?text={quote("Olá Adri! Tenho uma dúvida sobre o " + nome.lower() + ".")}" rel="noopener">Tirar uma dúvida no WhatsApp</a></p>
<h2>Como é feito</h2>
<ul class="l"><li>Explico tudo antes de começar e digo-te o preço antes de furar.</li>
<li>Agulha americana oca, muito afiada e de uso único: corta de forma limpa. <strong>Nunca pistola</strong>, que força a joia pelo tecido e cicatriza pior{", sobretudo na cartilagem" if x["id"] in CARTILAGEM else ""}.</li>
<li>Só joias com certificado de titânio de implante, polidas a espelho, sem níquel.</li></ul>
<h2>Cuidados depois</h2>
<ul class="l"><li>Limpa só com soro estéril em spray, uma a duas vezes por dia, e seca com papel limpo. Levas um do estúdio.</li>
<li>Não uses soro feito em casa, álcool nem pomadas: atrasam a cicatrização.</li>
<li>Nas primeiras semanas é normal ficar vermelho e inchado. Se a dor aumentar depois do terceiro dia, manda-me uma foto por WhatsApp.</li></ul>
<h2>Perguntas</h2>
{"".join(f"<h3>{e(q)}</h3><p>{e(r)}</p>" for q, r in perg)}
{('<h2>Fica bem com</h2><ul class="ch">' + "".join(f'<li><a href="{caminho(c)}">{e(NOMES[c["id"]][0])}<small>{e(preco(c))}</small></a></li>' for c in comb) + '</ul>') if comb else ''}
<h2>Onde</h2>
<p>No <strong>Kaos Tattoo</strong>, Rua da Torrinha 202, no Porto. Aos sábados, das 10h às 17h30, com marcação online. Pagas só no estúdio: MB WAY, Multibanco ou numerário.</p>
<p class="acoes"><a class="btn" href="/?p={quote(x["id"])}#marcar">Marcar este piercing</a><a class="btn sec" href="/piercing/">Ver todos os preços</a></p>'''
        ld = [NEGOCIO,
              {'@type': 'BreadcrumbList', 'itemListElement': [
                  {'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': SITE + '/'},
                  {'@type': 'ListItem', 'position': 2, 'name': 'Piercings', 'item': SITE + '/piercing/'},
                  {'@type': 'ListItem', 'position': 3, 'name': nome, 'item': SITE + url}]},
              {'@type': 'Service', 'name': f'{nome} no Porto', 'serviceType': 'Body piercing', 'provider': {'@id': SITE + '/#negocio'}, 'areaServed': 'Porto',
               'offers': {'@type': 'Offer', 'price': x['p'], 'priceCurrency': 'EUR', **({'priceSpecification': {'@type': 'PriceSpecification', 'minPrice': x['p'], 'priceCurrency': 'EUR'}} if x['z'] == 'orelha' else {})}},
              {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': r}} for q, r in perg]}]
        paginas[url] = doc(titulo, descricao, url, ld, corpo, logo, rodape_links)
    # lista de preços
    linhas = ''
    for z, zn in ZONA.items():
        zs = [x for x in itens if x['z'] == z]
        linhas += f'<h2>{zn}</h2><table class="tab"><thead><tr><th>Piercing</th><th>Cicatriza em</th><th class="n">Preço</th></tr></thead><tbody>' + ''.join(
            f'<tr><td><a href="{caminho(x)}">{e(NOMES[x["id"]][0])}</a></td><td>{e(x["c"])}</td><td class="n">{e(preco(x))}</td></tr>' for x in zs) + '</tbody></table>'
    corpo = f'''<nav class="mig" aria-label="Estás aqui"><a href="/">Início</a> › Piercings</nav>
<h1>Preços dos piercings no Porto</h1>
<p class="lead">Todos os piercings do Adri, com a joia em titânio de implante, o soro e a revisão às 4–8 semanas já incluídos no preço. Na orelha, o preço pode subir conforme a complexidade e é sempre dito antes de começar.</p>
<p class="acoes"><a class="btn" href="/#marcar">Marcar piercing</a><a class="btn sec" href="/#sitios">Escolher na orelha</a></p>
{linhas}
<p style="margin-top:28px">A consulta de 15 minutos para escolher é grátis, e a troca da barra na revisão também.</p>'''
    ld = [NEGOCIO, {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': SITE + '/'}, {'@type': 'ListItem', 'position': 2, 'name': 'Piercings', 'item': SITE + '/piercing/'}]},
          {'@type': 'OfferCatalog', 'name': 'Piercings no Porto', 'itemListElement': [
              {'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': NOMES[x['id']][0]}, 'price': x['p'], 'priceCurrency': 'EUR', 'url': SITE + caminho(x)} for x in itens]}]
    paginas['/piercing/'] = doc('Preços dos piercings no Porto, com joia em titânio | Adri',
                                'Preços de todos os piercings no Porto com o Adri: orelha desde 35 €, nariz 30 €, umbigo 50 €. Joia em titânio, soro e revisão incluídos.',
                                '/piercing/', ld, corpo, logo, rodape_links)
    return paginas


def main():
    paginas = gerar()
    raiz = os.path.join(SITE_DIR, 'piercing')
    shutil.rmtree(raiz, ignore_errors=True)
    for url, h in paginas.items():
        p = os.path.join(SITE_DIR, url.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(h)
    sm = os.path.join(SITE_DIR, 'sitemap.xml')
    velho = open(sm, encoding='utf-8').read() if os.path.exists(sm) else ''
    m = re.search(r'<loc>https://adribodypiercing.pt/</loc><lastmod>([^<]+)</lastmod>', velho)
    data = m.group(1) if m else '2026-11-11'
    urls = ['/'] + sorted(paginas)
    open(sm, 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                          + ''.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{data}</lastmod></url>\n' for u in urls) + '</urlset>\n')
    print(len(paginas), 'páginas')


if __name__ == '__main__':
    main()
