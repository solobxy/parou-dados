#!/usr/bin/env python3
"""dinissousa.pt: páginas de apoio à página inicial (criação de sites por cidade, casos e página 404).

Só há páginas de cidade onde é verdade: o Dinis vive em Gondomar e trabalha no Porto. Cada página tem conteúdo
próprio (o caso de um negócio do Porto, as freguesias e a ourivesaria de Gondomar), não é a mesma página com outro nome.
Os números do caso PAROU vêm das estatísticas próprias (Supabase, estat.visitas, site 'parou'), medidos de 1 a 11 de
novembro de 2026, e ficam datados na página.

Preços: o Caddy do dinissousa.pt corre os «templates» do Go em cada pedido. Até 30/11/2026 (Lisboa = UTC no inverno)
mostra os preços de lançamento; a partir de 1/12/2026 mostra os normais, sem ninguém mexer (e também para os robôs
que não correm JavaScript). Uso: python3 dinissousa/paginas.py
"""
import html
import json
import os
from urllib.parse import quote

AQUI = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(os.path.dirname(AQUI), 'sites', 'dinissousa')
SITE = 'https://dinissousa.pt'
HOJE = '2026-11-12'
e = html.escape

# Preço de lançamento até 30/11/2026, normal a partir de 1/12/2026 (decidido pelo Dinis a 31/10/2026)
L = '{{- $L := lt (dateInZone "20060102" now "UTC") "20261201" -}}'
SE, SENAO, FIM = '{{if $L}}', '{{else}}', '{{end}}'


def preco(lanc, normal):
    return f'{SE}{lanc}{SENAO}{normal}{FIM}'


def so_lanc(txt):
    return f'{SE}{txt}{FIM}'


NB = ' '
P_UNICA = preco(f'75{NB}€', f'149{NB}€')
P_COMPLETO = preco(f'149{NB}€', f'299{NB}€')
P_LOJA = preco(f'249{NB}€', f'499{NB}€')
P_MEDIDA = f'690{NB}€'

WA = 'https://wa.me/351913488258?text='


def wa(msg):
    return WA + quote(msg)


MARCA = ('<svg class="mark" viewBox="10 6 80 88" aria-hidden="true"><mask id="m{n}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
         '<rect width="100" height="100" fill="#fff"/><path d="M96 24H50A13 13 0 0 0 50 50A13 13 0 0 1 50 76H4" fill="none" stroke="#000" stroke-width="10"/></mask>'
         '<path d="M14 10H46A40 40 0 0 1 46 90H14Z" mask="url(#m{n})"/></svg>')

CSS = '''@font-face{font-family:"Archivo";src:url("/fonts/archivo.woff") format("woff");font-weight:100 900;font-stretch:62% 125%;font-display:swap}
:root{--paper:#F1F1EF;--ink:#0E0E0E;--muted:#55554F;--surface:#E2E2DE;--bg:var(--paper);--tx:var(--ink);--mt:var(--muted);--sf:var(--surface);--ac:var(--ink);--on:#F1F1EF;
--font:"Archivo","Helvetica Neue",Arial,sans-serif;--gut:20px;--sec:96px;--ease:cubic-bezier(.2,.7,.2,1)}
@media(min-width:720px){:root{--gut:56px;--sec:144px}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--tx);font:400 18px/1.55 var(--font);-webkit-font-smoothing:antialiased;touch-action:manipulation}
img{display:block;max-width:100%;height:auto}a{color:inherit}
:focus-visible{outline:3px solid currentColor;outline-offset:3px;border-radius:4px}
.saltar{position:absolute;left:-9999px}.saltar:focus{left:var(--gut);top:8px;z-index:20;background:var(--ink);color:var(--paper);padding:10px 16px;border-radius:999px}
.w{max-width:1320px;margin:0 auto;padding-inline:var(--gut)}
.estreito>*{max-width:800px}
header.top{position:sticky;top:0;z-index:10;background:var(--paper);color:var(--ink)}
header.top .w{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-weight:700;letter-spacing:-.01em;min-height:44px}
.mark{width:24px;height:26px;flex-shrink:0;fill:currentColor}
nav.nav{display:flex;align-items:center;gap:22px}nav.nav .lk{text-decoration:none;font-weight:500;display:none}
@media(min-width:720px){nav.nav .lk{display:inline-flex;min-height:44px;align-items:center}}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:10px 26px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;line-height:1.2;text-align:center;background:var(--ac);color:var(--on);transition:transform .25s var(--ease)}
.btn:active{transform:scale(.98)}.btn.sec{background:var(--sf);color:var(--tx)}.btn.peq{min-height:44px;padding:8px 18px;font-size:15px}
.mig{font-size:15px;color:var(--mt);margin:28px 0 0}.mig a{color:var(--mt)}
h1,h2,h3{margin:0;font-weight:800;letter-spacing:-.035em;text-wrap:balance}
h1{font-size:clamp(38px,8.4vw,112px);line-height:.92;font-stretch:108%;margin-top:22px;max-width:15ch}
.caso h1{font-size:clamp(36px,6.4vw,92px);max-width:18ch}
h2{font-size:clamp(32px,5.2vw,64px);line-height:.96;font-stretch:106%}
h3{font-size:22px;line-height:1.2;letter-spacing:-.02em;font-weight:700}
.js h1.estica{animation:estica 1.1s var(--ease) both}
@keyframes estica{from{font-stretch:66%;opacity:.2}to{font-stretch:108%;opacity:1}}
.resp{margin-top:30px;font-size:clamp(19px,2.2vw,24px);line-height:1.42;max-width:38ch}
.resp strong{font-weight:700}
.acoes{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.risco{margin-top:14px;font-size:15px;color:var(--mt)}
.atual{margin-top:18px;font-size:14px;color:var(--mt)}
section{padding-block:var(--sec) 0}
.intro{margin-top:18px;max-width:52ch;color:var(--mt);font-size:19px}
p{margin:0}p+p{margin-top:14px}
.duas{display:grid;gap:40px;align-items:center}
.duas h2{font-size:clamp(32px,4vw,54px)}
.heroi{display:grid;gap:36px;align-items:center;padding-bottom:8px}
.heroi>.topo{grid-column:1/-1}
@media(min-width:900px){.heroi{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:56px}}
.leque{position:relative;height:clamp(330px,40vw,560px);margin-inline:auto;width:100%;max-width:620px}
.leque .tel{position:absolute;left:50%;top:6%;width:clamp(136px,16vw,236px);margin:0;transform:translateX(-50%) translateX(var(--x)) rotate(var(--r))}
.leque .t1{--x:-62%;--r:-7deg;z-index:1}.leque .t2{--x:0%;--r:0deg;z-index:2;top:0}.leque .t3{--x:62%;--r:7deg;z-index:1}
.js .leque .tel{animation:leque .9s var(--ease) .15s both}
@keyframes leque{from{opacity:0;transform:translateX(-50%) translateY(30px) rotate(0deg)}to{opacity:1}}
@media(min-width:900px){.duas{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:72px}.duas.inv>:first-child{order:2}}
.tel{width:min(300px,72vw);margin-inline:auto;padding:7px;border-radius:34px;background:var(--fr,#2A2622)}
.tel img{border-radius:27px;width:100%;aspect-ratio:640/1385;object-fit:cover;object-position:top}
.lista{list-style:none;padding:0;margin:30px 0 0;display:grid;gap:12px}
@media(min-width:720px){.lista{grid-template-columns:repeat(2,minmax(0,1fr))}}
.lista li{background:var(--sf);padding:22px 24px;font-size:17px}
.lista li b{display:block;font-size:19px;margin-bottom:4px;letter-spacing:-.01em}
.planos{display:grid;gap:12px;margin-top:36px}
@media(min-width:720px){.planos{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1080px){.planos{grid-template-columns:repeat(4,minmax(0,1fr))}}
.plano{background:var(--sf);padding:26px;display:flex;flex-direction:column;gap:8px}
.plano.rec{background:var(--ink);color:var(--paper)}.plano.rec .pm{color:#C9C9C3}
.plano .pr{font-size:44px;font-weight:800;font-stretch:104%;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}
.plano .pr small{font-size:16px;font-weight:600;letter-spacing:0;margin-right:6px}
.pm{color:var(--mt);font-size:15.5px}
.lanc{font-size:14.5px;font-weight:600}
.passos{list-style:none;padding:0;margin:30px 0 0;display:grid;gap:12px;counter-reset:p}
@media(min-width:900px){.passos{grid-template-columns:repeat(3,minmax(0,1fr))}}
.passos li{padding:24px;background:var(--sf)}.passos li b{display:block;font-size:20px;margin-bottom:6px}
.faq{margin-top:30px;display:grid;gap:12px}
.faq details{background:var(--sf)}
.faq summary{list-style:none;cursor:pointer;min-height:64px;padding:20px 60px 20px 24px;position:relative;font-weight:700;font-size:19px;line-height:1.3}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";position:absolute;right:26px;top:50%;width:12px;height:12px;margin-top:-9px;border-right:3px solid currentColor;border-bottom:3px solid currentColor;transform:rotate(45deg);transition:transform .3s var(--ease)}
.faq details[open] summary::after{transform:rotate(225deg);margin-top:-3px}
.faq details p{padding:0 24px 24px;color:var(--mt);max-width:62ch}
.numeros{display:grid;gap:12px;margin-top:36px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:900px){.numeros{grid-template-columns:repeat(4,minmax(0,1fr))}}
.numeros div{background:var(--sf);padding:24px}
.numeros b{display:block;font-size:clamp(38px,5vw,60px);font-weight:800;font-stretch:104%;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums}
.numeros span{display:block;margin-top:10px;color:var(--mt);font-size:16px}
.tabela{margin-top:28px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:16px}
@media(max-width:480px){table{font-size:14.5px}th,td{padding:10px 7px}}
th,td{text-align:left;padding:12px 14px}th{color:var(--mt);font-weight:600}
tbody tr:nth-child(odd){background:var(--sf)}td.n,th.n{text-align:right}
.nota{margin-top:16px;font-size:15px;color:var(--mt);max-width:70ch}
.chips{display:flex;flex-wrap:wrap;gap:10px;list-style:none;padding:0;margin:26px 0 0}
.chips li{background:var(--sf);padding:12px 18px;border-radius:999px;font-weight:600;font-size:16px}
.fim{padding-block:var(--sec)}
.fim .caixa{background:var(--ink);color:var(--paper);padding:clamp(28px,6vw,72px)}
.fim .caixa h2{max-width:20ch}.fim .caixa p{color:#C9C9C3;margin-top:16px;max-width:52ch}
.fim .caixa .btn{background:var(--paper);color:var(--ink)}
.fim .caixa .btn.sec{background:#26262A;color:var(--paper)}
footer{background:var(--paper);color:var(--ink);padding-block:56px 72px}
footer .w{display:grid;gap:28px}
@media(min-width:900px){footer .w{grid-template-columns:1.2fr 1fr 1fr}}
footer h2{font-size:15px;letter-spacing:0;font-weight:700;margin-bottom:8px;font-stretch:100%}
footer ul{list-style:none;margin:0;padding:0}footer li a,footer p a{display:inline-flex;align-items:center;min-height:44px;color:var(--muted)}
footer p{color:var(--muted);font-size:15.5px}
.banda{background:var(--bg);color:var(--tx)}
.banda .w{padding-block:clamp(36px,6vw,96px) clamp(56px,8vw,112px)}
[data-mundo="parou"]{--bg:#16151A;--tx:#FFFFFF;--mt:#A8A6AE;--sf:#25242B;--ac:#FF6B1A;--on:#111111;--fr:#2E2D35}
[data-mundo="adri"]{--bg:#0E0C0B;--tx:#EEE8DF;--mt:#BDB5A9;--sf:#1D1A17;--ac:#D9B676;--on:#141210;--fr:#2A2622}
.banda .mig,.banda .mig a{color:var(--mt)}
.rv{opacity:1}
.js .rv{opacity:0;transform:translateY(24px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.js .rv.on{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.js h1.estica,.js .leque .tel{animation:aparece .6s ease both}@keyframes aparece{from{opacity:0}to{opacity:1}}
.js .rv{transform:none;transition:opacity .5s ease}.btn{transition:none}}
'''

JS = '''<script>
(function(){var rv=[].slice.call(document.querySelectorAll('.rv'));
if(!('IntersectionObserver' in window)){rv.forEach(function(el){el.classList.add('on')});return;}
var o=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('on');o.unobserve(x.target);}})},{rootMargin:'0px 0px -6% 0px'});
rv.forEach(function(el){o.observe(el)});
setTimeout(function(){rv.forEach(function(el){el.classList.add('on')})},2500);})();
</script>'''


def pessoa_servico():
    return [
        {'@type': 'Person', '@id': SITE + '/#dinis', 'name': 'Dinis Sousa', 'url': SITE + '/', 'email': 'diniscash@gmail.com',
         'telephone': '+351913488258', 'jobTitle': 'Criador de sites', 'knowsLanguage': 'pt-PT'},
        {'@type': 'ProfessionalService', '@id': SITE + '/#servico', 'name': 'Dinis Sousa', 'url': SITE + '/', 'image': SITE + '/og.jpg',
         'telephone': '+351913488258', 'email': 'diniscash@gmail.com', 'founder': {'@id': SITE + '/#dinis'},
         'areaServed': [{'@type': 'City', 'name': 'Porto'}, {'@type': 'City', 'name': 'Gondomar'}, {'@type': 'Country', 'name': 'Portugal'}]},
    ]


def migalhas(itens):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(itens)]}


def doc(titulo, descricao, url, ld, corpo, og_tipo='website', mundo=None, cor_tema='#F1F1EF'):
    ld_txt = json.dumps({'@context': 'https://schema.org', '@graph': ld}, ensure_ascii=False)
    return f'''{L}<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">
<link rel="canonical" href="{SITE}{url}">
<meta name="theme-color" content="{cor_tema}">
<meta name="color-scheme" content="light">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="{og_tipo}"><meta property="og:site_name" content="Dinis Sousa"><meta property="og:locale" content="pt_PT">
<meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(descricao)}">
<meta property="og:url" content="{SITE}{url}"><meta property="og:image" content="{SITE}/og.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/fonts/archivo.woff" as="font" type="font/woff" crossorigin>
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">{ld_txt}</script>
<style>{CSS}</style>
<script defer src="/_e.js" data-site="dinissousa"></script>
</head>
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="top"><div class="w">
<a class="brand" href="/">{MARCA.format(n=1)}<span>Dinis Sousa</span></a>
<nav class="nav" aria-label="Principal"><a class="lk" href="/#projetos">Projetos</a><a class="lk" href="/#precos">Preços</a>
<a class="btn peq" href="{wa('Olá Dinis! Quero um site.')}">Pedir o meu site</a></nav>
</div></header>
<main id="conteudo">
{corpo}
</main>
{rodape()}
{JS}
</body>
</html>
'''


def rodape():
    return f'''<footer>
<div class="w">
<div><a class="brand" href="/">{MARCA.format(n=2)}<span>Dinis Sousa</span></a>
<p style="margin-top:10px">Sites feitos de raiz, a partir de Gondomar e do Porto, para todo o país.</p>
<p><a href="{wa('Olá Dinis! Quero um site.')}">WhatsApp 913 488 258</a> · <a href="mailto:diniscash@gmail.com">diniscash@gmail.com</a></p></div>
<nav aria-label="Serviço"><h2>Serviço</h2><ul>
<li><a href="/criacao-de-sites-porto/">Criação de sites no Porto</a></li>
<li><a href="/criacao-de-sites-gondomar/">Criação de sites em Gondomar</a></li>
<li><a href="/quanto-custa-um-site/">Quanto custa um site</a></li></ul></nav>
<nav aria-label="Casos"><h2>Casos</h2><ul>
<li><a href="/projetos/parou/">PAROU, app de transportes</a></li>
<li><a href="/projetos/adribodypiercing/">AdriBodyPiercing, estúdio no Porto</a></li>
<li><a href="/#projetos">Todos os projetos</a></li>
<li><a href="https://www.livroreclamacoes.pt" rel="noopener">Livro de Reclamações</a></li></ul></nav>
</div>
</footer>'''


def planos(msg_extra=''):
    return f'''<div class="planos">
<div class="plano rv"><h3>Página única</h3><p class="pr">{P_UNICA}</p><p class="pm">1 página desenhada de raiz, com contacto por WhatsApp, telefone e e-mail.</p>{so_lanc('<p class="lanc">Preço de lançamento até 30/11. Depois, 149' + NB + '€.</p>')}</div>
<div class="plano rec rv"><h3>Site completo</h3><p class="pr">{P_COMPLETO}</p><p class="pm">Até 5 páginas desenhadas de raiz, preparadas para o Google.</p>{so_lanc('<p class="lanc">Preço de lançamento até 30/11. Depois, 299' + NB + '€.</p>')}</div>
<div class="plano rv"><h3>Loja online</h3><p class="pr"><small>desde</small>{P_LOJA}</p><p class="pm">Tudo o que tem o site completo, mais produtos, carrinho e pagamentos.</p>{so_lanc('<p class="lanc">Preço de lançamento até 30/11. Depois, desde 499' + NB + '€.</p>')}</div>
<div class="plano rv"><h3>À medida</h3><p class="pr"><small>desde</small>{P_MEDIDA}</p><p class="pm">Área de cliente, painel, base de dados e CRM, marcações ou ligação à faturação.</p></div>
</div>
<p class="nota rv">Domínio e alojamento do 1.º ano incluídos em todos. Pagas metade quando aprovas o desenho e a outra metade com o site no ar. <a href="/quanto-custa-um-site/">Quanto custa um site, explicado</a>.</p>'''


PASSOS = '''<ol class="passos">
<li class="rv"><b>Desenho sem custo</b>Contas-me o negócio por WhatsApp ou chamada. Mostro-te o site antes de o construir e mudas o que quiseres.</li>
<li class="rv"><b>Aprovas, pagas metade</b>Só começo depois de dizeres que sim ao desenho.</li>
<li class="rv"><b>No ar em 1 a 3 dias</b>Publico no teu domínio, explico-te como tudo funciona e pagas a outra metade.</li>
</ol>'''


def leque(imgs):
    """Três telemóveis em leque (imagens reais dos sites, versão de 480 px)."""
    out = '<div class="leque" aria-hidden="false">'
    for i, (src, alt, fr) in enumerate(imgs, 1):
        out += (f'<div class="tel t{i}" style="--fr:{fr}"><img src="{src}" width="480" height="1039" alt="{e(alt)}"'
                + (' fetchpriority="high"' if i == 2 else ' loading="lazy"') + '></div>')
    return out + '</div>'


def faq(perguntas):
    return '<div class="faq">' + ''.join(f'<details class="rv"><summary>{e(q)}</summary><p>{r}</p></details>' for q, r in perguntas) + '</div>'


def faq_ld(perguntas):
    import re
    return {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub(r'<[^>]+>', '', r)}} for q, r in perguntas]}


def bloco_fim(titulo, texto, msg):
    return f'''<section class="fim"><div class="w"><div class="caixa rv">
<h2>{titulo}</h2><p>{texto}</p>
<div class="acoes"><a class="btn" href="{wa(msg)}">Pedir o meu site</a><a class="btn sec" href="mailto:diniscash@gmail.com">Escrever por e-mail</a></div>
</div></div></section>'''


def oferta_ld(nome_pag):
    """Ofertas com o preço normal (fixo) e o de lançamento só até 30/11/2026, para os dados estruturados serem sempre verdade."""
    def of(nome, normal, lanc=None, desde=False):
        o = {'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': nome}, 'priceCurrency': 'EUR', 'price': str(normal)}
        if desde:
            o['priceSpecification'] = {'@type': 'PriceSpecification', 'minPrice': str(normal), 'priceCurrency': 'EUR'}
        lista = [o]
        if lanc:
            lo = {'@type': 'Offer', 'name': f'{nome}, preço de lançamento', 'itemOffered': {'@type': 'Service', 'name': nome},
                  'priceCurrency': 'EUR', 'price': str(lanc), 'validThrough': '2026-11-30T23:59:59+00:00', 'priceValidUntil': '2026-11-30'}
            lista.append(lo)
        return lista
    itens = of('Página única', 149, 75) + of('Site completo (até 5 páginas)', 299, 149) + of('Loja online', 499, 249, True) + of('Sistema à medida', 690, None, True)
    return {'@type': 'OfferCatalog', 'name': nome_pag, 'itemListElement': itens}


# ---------------------------------------------------------------- Porto
def porto():
    url = '/criacao-de-sites-porto/'
    titulo = 'Criação de sites no Porto, com preço fechado | Dinis Sousa'
    desc = ('Sites de raiz para negócios do Porto: vês o desenho sem pagar, pagas metade quando o aprovas '
            'e fica no ar em 1 a 3 dias. Domínio do 1.º ano incluído.')
    perg = [
        ('Tenho de ir a algum lado?', 'Não. Falamos por WhatsApp ou chamada e vês o desenho no telemóvel. Se fizer diferença para ti conversar pessoalmente, combinamos no Porto.'),
        ('Quanto custa um site no Porto?', 'O mesmo que no resto do país. '
         + preco('Até 30 de novembro, uma página custa 75' + NB + '€, um site de até 5 páginas 149' + NB + '€ e uma loja online desde 249' + NB + '€. A 1 de dezembro passam a 149' + NB + '€, 299' + NB + '€ e desde 499' + NB + '€.',
                 'Uma página custa 149' + NB + '€, um site de até 5 páginas 299' + NB + '€ e uma loja online desde 499' + NB + '€.')
         + ' No mercado, um site de 5 páginas custa normalmente 350 a 500' + NB + '€ (Zaask). <a href="/quanto-custa-um-site/">Ver a comparação</a>.'),
        ('Fazes também o perfil no Google Maps?', 'O perfil fica na tua conta Google e és tu que o crias, mas digo-te o que lá pôr. O site sai com a mesma morada, telefone e horário do perfil, para baterem certo, que é o que o Google procura num negócio local.'),
        ('Em quanto tempo fica pronto?', 'O desenho vem primeiro, sem custo. Depois de o aprovares, o site fica no ar em 1 a 3 dias.'),
        ('E se eu já tiver um site?', 'Refaço-o de raiz. Se as páginas antigas já tiverem visitas do Google, mantenho os endereços ou redireciono-os, para não perderes o que já ganhaste.'),
    ]
    resposta = (f'Faço sites de raiz para negócios do Porto, com desenho próprio e preço fechado. '
                f'{preco("Até 30 de novembro, uma", "Uma")} página custa <strong>{P_UNICA}</strong> e um site de até 5 páginas <strong>{P_COMPLETO}</strong>, '
                'com domínio e alojamento do 1.º ano. Vês o desenho antes de pagar e o site fica no ar em 1 a 3 dias depois de o aprovares.')
    corpo = f'''<div class="w heroi">
<div class="topo"><nav class="mig" aria-label="Estás aqui"><a href="/">Dinis Sousa</a> › Criação de sites no Porto</nav>
<h1 class="estica">Criação de sites no Porto</h1></div>
<div><p class="resp" style="margin-top:0">{resposta}</p>
<div class="acoes"><a class="btn" href="{wa('Olá Dinis! Tenho um negócio no Porto e quero um site.')}">Pedir o meu site</a><a class="btn sec" href="/projetos/adribodypiercing/">Ver um caso no Porto</a></div>
<p class="risco">Só pagas depois de aprovares o desenho.</p>
<p class="atual">Atualizado a 12 de novembro de 2026.</p></div>
{leque([('/img/parou-480.webp', 'App de transportes PAROU no telemóvel', '#2E2D35'), ('/img/adri-480.webp', 'Site do AdriBodyPiercing, um estúdio no Porto, no telemóvel', '#2A2622'), ('/img/caiu-480.webp', 'Comparador de preços caiu.pt no telemóvel', '#1F2A24')])}
</div>

<section class="banda" data-mundo="adri" aria-labelledby="t-caso"><div class="w duas">
<div><h2 id="t-caso" class="rv">Um negócio do Porto já online</h2>
<p class="intro rv">O Adri fura no Kaos Tattoo, na Rua da Torrinha, aos sábados. Fiz-lhe o logótipo e o site: cada piercing tem o preço e o tempo de cicatrização à vista, e a marcação faz-se no próprio site, com aprovação dele. A página inicial já aparece no Google.</p>
<div class="acoes rv"><a class="btn" href="/projetos/adribodypiercing/">Ver o caso completo</a><a class="btn sec" href="https://adribodypiercing.pt" rel="noopener">Abrir o site</a></div></div>
<div class="tel rv"><img src="/img/adri.webp" width="640" height="1385" alt="Site AdriBodyPiercing aberto no telemóvel, com o título O teu piercing, sem stress" loading="lazy"></div>
</div></section>

<section aria-labelledby="t-precisa"><div class="w">
<h2 id="t-precisa" class="rv">O que não pode faltar no teu site</h2>
<p class="intro rv">O que faço em todos, porque é o que as pessoas procuram primeiro quando te encontram no telemóvel.</p>
<ul class="lista">
<li class="rv"><b>Morada, mapa e horário certos</b>Iguais aos do teu perfil no Google, com a ligação para as direções no Google Maps.</li>
<li class="rv"><b>WhatsApp e telefone à mão</b>Um toque com o polegar e a pessoa já está a falar contigo.</li>
<li class="rv"><b>Preços ou «desde» à vista</b>É a primeira pergunta de quem procura. Quem vê o preço não precisa de perguntar.</li>
<li class="rv"><b>Rápido em dados móveis</b>Abre num instante na rua, no metro ou numa rede fraca.</li>
<li class="rv"><b>Fotos do teu trabalho</b>São as que mais convencem. Se não as tiveres, ajudo-te a escolher.</li>
<li class="rv"><b>Uma página por serviço principal</b>Se te procuram pelo nome do serviço, como «piercing hélix Porto», cada um tem a sua página.</li>
</ul>
</div></section>

<section id="precos" aria-labelledby="t-precos"><div class="w">
<h2 id="t-precos" class="rv">Preço fechado, igual em todo o país</h2>
{planos()}
</div></section>

<section aria-labelledby="t-como"><div class="w">
<h2 id="t-como" class="rv">Como funciona</h2>
{PASSOS}
</div></section>

<section aria-labelledby="t-faq"><div class="w estreito">
<h2 id="t-faq" class="rv">Perguntas que me fazem</h2>
{faq(perg)}
</div></section>

{bloco_fim('Um site só do teu negócio.', 'Diz-me o que fazes e mostro-te o desenho. Se não gostares, não pagas nada.', 'Olá Dinis! Tenho um negócio no Porto e quero um site.')}'''
    ld = pessoa_servico() + [
        migalhas([('Dinis Sousa', '/'), ('Criação de sites no Porto', url)]),
        {'@type': 'Service', '@id': SITE + url + '#servico', 'name': 'Criação de sites no Porto', 'serviceType': 'Criação de sites',
         'provider': {'@id': SITE + '/#servico'}, 'areaServed': {'@type': 'City', 'name': 'Porto'}, 'url': SITE + url,
         'hasOfferCatalog': oferta_ld('Sites para negócios do Porto')},
        {'@type': 'WebPage', '@id': SITE + url, 'url': SITE + url, 'name': titulo, 'inLanguage': 'pt-PT', 'dateModified': HOJE,
         'isPartOf': {'@id': SITE + '/#site'}, 'about': {'@id': SITE + url + '#servico'}},
        faq_ld(perg),
    ]
    return url, doc(titulo, desc, url, ld, corpo)


# ---------------------------------------------------------------- Gondomar
FREGUESIAS = ['Rio Tinto', 'Baguim do Monte', 'Fânzeres e São Pedro da Cova', 'Gondomar (São Cosme), Valbom e Jovim',
              'Foz do Sousa e Covelo', 'Lomba', 'Melres e Medas']


def gondomar():
    url = '/criacao-de-sites-gondomar/'
    titulo = 'Criação de sites em Gondomar, por quem vive cá | Dinis Sousa'
    desc = ('Sites e lojas online feitos de raiz para negócios de Gondomar, de Rio Tinto a Melres. Preço fechado, '
            'desenho sem custo e só pagas metade quando o aprovas.')
    perg = [
        ('Fazes sites para Rio Tinto, Valbom ou Fânzeres?', 'Sim, para todo o concelho e para fora dele. Vivo em Gondomar, por isso, se preferires conversar pessoalmente, combinamos perto de ti.'),
        ('Tenho uma ourivesaria. Faz sentido uma loja online?', 'Se vendes peças com preço fixo e as consegues enviar, sim: a loja mostra cada peça com fotos, preço e envio, e recebe pagamentos online. Se o teu negócio é sobretudo por encomenda, uma página com fotos do trabalho e WhatsApp pode chegar, e custa menos.'),
        ('O preço é à hora?', 'Não. O preço é fechado antes de começar e está à vista nesta página. Nos sites de orçamentos o valor aparece muitas vezes à hora, sem total no fim.'),
        ('Posso pagar em duas vezes?', 'É sempre assim: metade quando aprovas o desenho, a outra metade quando o site fica no ar.'),
        ('E o domínio e o alojamento?', 'O 1.º ano está incluído. Depois, renovas só se quiseres e digo-te o valor antes.'),
    ]
    resposta = (f'Sou de Gondomar e faço sites de raiz para negócios do concelho. {preco("Até 30 de novembro, uma", "Uma")} página custa <strong>{P_UNICA}</strong>, '
                f'um site de até 5 páginas <strong>{P_COMPLETO}</strong> e uma loja online <strong>desde {P_LOJA}</strong>, com domínio e alojamento do 1.º ano. '
                'O desenho vem primeiro e só pagas metade quando o aprovares.')
    chips = ''.join(f'<li>{e(f)}</li>' for f in FREGUESIAS)
    corpo = f'''<div class="w heroi">
<div class="topo"><nav class="mig" aria-label="Estás aqui"><a href="/">Dinis Sousa</a> › Criação de sites em Gondomar</nav>
<h1 class="estica">Criação de sites em Gondomar</h1></div>
<div><p class="resp" style="margin-top:0">{resposta}</p>
<div class="acoes"><a class="btn" href="{wa('Olá Dinis! Tenho um negócio em Gondomar e quero um site.')}">Pedir o meu site</a><a class="btn sec" href="/#projetos">Ver os sites que fiz</a></div>
<p class="risco">Só pagas depois de aprovares o desenho.</p>
<p class="atual">Atualizado a 12 de novembro de 2026.</p></div>
{leque([('/img/jinxed-480.webp', 'Loja online jinxed.world no telemóvel', '#2B2325'), ('/img/anjinho-480.webp', 'Loja online anjinho.pt no telemóvel', '#1D1719'), ('/img/ganhas-480.webp', 'Site de salários ganhas.pt no telemóvel', '#1E2230')])}
</div>

<section aria-labelledby="t-concelho"><div class="w">
<h2 id="t-concelho" class="rv">Do concelho, para o concelho</h2>
<p class="intro rv">Faço sites para todas as freguesias de Gondomar. Para quem tem um café, uma oficina, um cabeleireiro ou uma clínica, uma página com horário, mapa e WhatsApp costuma chegar. Para quem vende produtos, uma loja online.</p>
<ul class="chips rv" aria-label="Freguesias de Gondomar">{chips}</ul>
</div></section>

<section aria-labelledby="t-ouro"><div class="w duas inv">
<div><h2 id="t-ouro" class="rv">Ourivesaria e lojas que vendem online</h2>
<p class="intro rv">Gondomar é conhecida pela ourivesaria e pela filigrana. Numa loja online, cada peça tem de aparecer com boas fotos, o preço certo e o envio explicado. Já fiz duas lojas de moda com marca própria, a anjinho e a jinxed, cada uma com um desenho que não se confunde com outra.</p>
<div class="acoes rv"><a class="btn sec" href="https://anjinho.pt" rel="noopener">Ver a anjinho.pt</a><a class="btn sec" href="https://jinxed.world" rel="noopener">Ver a jinxed.world</a></div></div>
<div class="tel rv" style="--fr:#2B2325"><img src="/img/jinxed.webp" width="640" height="1325" alt="Loja online jinxed.world aberta no telemóvel, com casacos e calças" loading="lazy"></div>
</div></section>

<section id="precos" aria-labelledby="t-precos"><div class="w">
<h2 id="t-precos" class="rv">Preço fechado, sem contas à hora</h2>
{planos()}
</div></section>

<section aria-labelledby="t-como"><div class="w">
<h2 id="t-como" class="rv">Como funciona</h2>
{PASSOS}
</div></section>

<section aria-labelledby="t-faq"><div class="w estreito">
<h2 id="t-faq" class="rv">Perguntas que me fazem</h2>
{faq(perg)}
</div></section>

{bloco_fim('O próximo site pode ser o teu.', 'Conta-me o que fazes e mostro-te o desenho. Se não gostares, não pagas nada.', 'Olá Dinis! Tenho um negócio em Gondomar e quero um site.')}'''
    ld = pessoa_servico() + [
        migalhas([('Dinis Sousa', '/'), ('Criação de sites em Gondomar', url)]),
        {'@type': 'Service', '@id': SITE + url + '#servico', 'name': 'Criação de sites em Gondomar', 'serviceType': 'Criação de sites',
         'provider': {'@id': SITE + '/#servico'}, 'areaServed': {'@type': 'City', 'name': 'Gondomar'}, 'url': SITE + url,
         'hasOfferCatalog': oferta_ld('Sites para negócios de Gondomar')},
        {'@type': 'WebPage', '@id': SITE + url, 'url': SITE + url, 'name': titulo, 'inLanguage': 'pt-PT', 'dateModified': HOJE,
         'isPartOf': {'@id': SITE + '/#site'}, 'about': {'@id': SITE + url + '#servico'}},
        faq_ld(perg),
    ]
    return url, doc(titulo, desc, url, ld, corpo)


# ---------------------------------------------------------------- Caso PAROU
# Visitas (entradas no site, sem robôs nem testes), hora de Lisboa. Fonte: estat.visitas, site 'parou', consultado a 12/11/2026.
PAROU_DIAS = [('2026-11-01', 343, 267), ('2026-11-02', 541, 361), ('2026-11-03', 446, 327), ('2026-11-04', 461, 333),
              ('2026-11-05', 574, 323), ('2026-11-06', 456, 303), ('2026-11-07', 382, 257), ('2026-11-08', 299, 210),
              ('2026-11-09', 537, 376), ('2026-11-10', 532, 362), ('2026-11-11', 350, 261)]
PAROU_TOTAL, PAROU_CHATGPT, PAROU_MOTORES, PAROU_TELEMOVEL, PAROU_PT = 4921, 3380, 200, 4185, 4362
DIAS_SEMANA = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']


def milhar(n):
    return f'{n:,}'.replace(',', NB)


def pct(a, b):
    return f'{round(100 * a / b)}{NB}%'


def caso_parou():
    import datetime
    assert sum(v for _, v, _ in PAROU_DIAS) == PAROU_TOTAL and sum(c for _, _, c in PAROU_DIAS) == PAROU_CHATGPT
    url = '/projetos/parou/'
    media = round(PAROU_TOTAL / len(PAROU_DIAS), -1)  # 447 → 450
    media = int(media)
    titulo = 'Caso PAROU: perto de 450 visitas por dia, sem anúncios'
    desc = (f'Caso real: a app de transportes PAROU teve {PAROU_TOTAL} visitas de 1 a 11 de novembro de 2026, sem publicidade. '
            f'{pct(PAROU_CHATGPT, PAROU_TOTAL)} chegaram pelo ChatGPT.').replace(NB, ' ')
    linhas = ''
    for d, v, c in PAROU_DIAS:
        dt = datetime.date.fromisoformat(d)
        linhas += f'<tr><td>{dt.day} nov. ({DIAS_SEMANA[dt.weekday()]})</td><td class="n">{v}</td><td class="n">{c}</td><td class="n">{pct(c, v)}</td></tr>'
    resposta = (f'A PAROU é uma app de transportes públicos gratuita que fiz de raiz, da marca ao código. '
                f'De 1 a 11 de novembro de 2026 teve <strong>{milhar(PAROU_TOTAL)} visitas</strong>, perto de {media} por dia, sem um euro em publicidade. '
                f'Sete em cada dez chegaram a partir de respostas do ChatGPT.')
    corpo = f'''<div class="banda caso" data-mundo="parou"><div class="w heroi">
<div class="topo"><nav class="mig" aria-label="Estás aqui"><a href="/">Dinis Sousa</a> › Caso PAROU</nav>
<h1 class="estica">PAROU: perto de 450 visitas por dia</h1></div>
<div><p class="resp" style="margin-top:0">{resposta}</p>
<div class="acoes"><a class="btn" href="{wa('Olá Dinis! Vi o caso da PAROU e quero um site.')}">Quero um site assim</a><a class="btn sec" href="https://parou.pt" rel="noopener">Abrir parou.pt</a></div>
<p class="atual">Dados de 1 a 11 de novembro de 2026. Página atualizada a 12 de novembro de 2026.</p></div>
<div class="tel" style="--fr:#2E2D35"><img src="/img/parou-480.webp" width="480" height="994" alt="App PAROU no telemóvel, com os autocarros a chegar à paragem mais perto" fetchpriority="high" style="aspect-ratio:480/994"></div>
</div></div>

<section aria-labelledby="t-num"><div class="w">
<h2 id="t-num" class="rv">Os números</h2>
<div class="numeros">
<div class="rv"><b>{milhar(PAROU_TOTAL)}</b><span>visitas em 11 dias</span></div>
<div class="rv"><b>{pct(PAROU_CHATGPT, PAROU_TOTAL)}</b><span>chegaram pelo ChatGPT</span></div>
<div class="rv"><b>{pct(PAROU_TELEMOVEL, PAROU_TOTAL)}</b><span>no telemóvel</span></div>
<div class="rv"><b>{pct(PAROU_PT, PAROU_TOTAL)}</b><span>a partir de Portugal</span></div>
</div>
<p class="nota rv">Os motores de pesquisa (Google, Bing, DuckDuckGo e outros) trouxeram {PAROU_MOTORES} visitas, {str(round(100 * PAROU_MOTORES / PAROU_TOTAL, 1)).replace('.', ',')}{NB}% do total. O resto entrou diretamente, por ligações guardadas ou partilhadas.</p>
<div class="tabela rv"><table><caption class="nota" style="text-align:left;caption-side:bottom">Visitas por dia, hora de Lisboa.</caption>
<thead><tr><th>Dia</th><th class="n">Visitas</th><th class="n">Pelo ChatGPT</th><th class="n">Parte</th></tr></thead>
<tbody>{linhas}</tbody>
<tfoot><tr><th>Total</th><th class="n">{milhar(PAROU_TOTAL)}</th><th class="n">{milhar(PAROU_CHATGPT)}</th><th class="n">{pct(PAROU_CHATGPT, PAROU_TOTAL)}</th></tr></tfoot></table></div>
</div></section>

<section aria-labelledby="t-fiz"><div class="w estreito">
<div><h2 id="t-fiz" class="rv">O que fiz</h2>
<p class="intro rv">A marca, o desenho e a app, para todo o país: tempo real onde os operadores o publicam, horário oficial onde não há, e avisos de greves e ocorrências. É gratuita, sem fins lucrativos e funciona no browser, sem instalar nada.</p>
<p class="intro rv">Cada página abre depressa no telemóvel e tem a informação escrita no próprio HTML, não escondida atrás de código que os robôs de pesquisa não leem.</p></div>
</div></section>

<section aria-labelledby="t-porque"><div class="w estreito">
<h2 id="t-porque" class="rv">Porquê o ChatGPT?</h2>
<p class="intro rv">O ChatGPT não explica porque escolhe uma ligação, por isso isto é uma hipótese, não uma certeza. As páginas respondem logo à pergunta que as pessoas fazem (que autocarro passa e quando), o conteúdo está no HTML e o site deixa entrar os robôs de pesquisa do Google, do Bing e do ChatGPT. Faço o mesmo nos sites dos clientes.</p>
</div></section>

<section aria-labelledby="t-como-medi"><div class="w estreito">
<h2 id="t-como-medi" class="rv">Como foi medido</h2>
<p class="intro rv">Com as estatísticas próprias dos meus sites, sem cookies e sem guardar endereços IP. Uma visita é uma sessão (acaba ao fim de 30 minutos sem atividade). Os robôs e as minhas visitas de teste não contam. A origem «ChatGPT» é a que o próprio ChatGPT junta às ligações que mostra (utm_source=chatgpt.com).</p>
</div></section>

{bloco_fim('Queres um site assim?', 'O mesmo cuidado entra em todos os sites que faço, do mais pequeno ao maior. Mostro-te o desenho antes de pagares.', 'Olá Dinis! Vi o caso da PAROU e quero um site.')}'''
    ld = pessoa_servico() + [
        migalhas([('Dinis Sousa', '/'), ('Caso PAROU', url)]),
        {'@type': 'Article', '@id': SITE + url + '#artigo', 'headline': 'PAROU: perto de 450 visitas por dia, sem anúncios', 'inLanguage': 'pt-PT',
         'datePublished': HOJE, 'dateModified': HOJE, 'author': {'@id': SITE + '/#dinis'}, 'publisher': {'@id': SITE + '/#dinis'},
         'mainEntityOfPage': SITE + url, 'image': SITE + '/img/parou.webp', 'about': {'@type': 'WebApplication', 'name': 'PAROU', 'url': 'https://parou.pt/', 'applicationCategory': 'TravelApplication', 'operatingSystem': 'Web', 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'}}},
        {'@type': 'Dataset', 'name': 'Visitas diárias da PAROU e origem ChatGPT, 1 a 11 de novembro de 2026', 'description': 'Visitas por dia ao site parou.pt e quantas chegaram a partir do ChatGPT, medidas com estatísticas próprias sem cookies.',
         'creator': {'@id': SITE + '/#dinis'}, 'temporalCoverage': '2026-11-01/2026-11-11', 'url': SITE + url, 'license': 'https://creativecommons.org/licenses/by/4.0/', 'inLanguage': 'pt-PT',
         'variableMeasured': ['visitas por dia', 'visitas com origem ChatGPT']},
    ]
    return url, doc(titulo, desc, url, ld, corpo, og_tipo='article', cor_tema='#16151A')


# ---------------------------------------------------------------- Caso AdriBodyPiercing
def caso_adri():
    url = '/projetos/adribodypiercing/'
    titulo = 'Site para um estúdio de piercing no Porto: AdriBodyPiercing'
    desc = ('Caso real: o site do AdriBodyPiercing, no Kaos Tattoo (Porto), com marcação online, preço por piercing '
            'e uma página por sítio do corpo.')
    resposta = ('O Adri estava a começar no body piercing e precisava de um sítio onde as pessoas vissem o preço, percebessem como trabalha e marcassem '
                'sem trocar dez mensagens. Fiz o logótipo e o site, com marcação online, preço por piercing e uma página para cada sítio do corpo.')
    corpo = f'''<div class="banda caso" data-mundo="adri"><div class="w heroi">
<div class="topo"><nav class="mig" aria-label="Estás aqui"><a href="/">Dinis Sousa</a> › Caso AdriBodyPiercing</nav>
<h1 class="estica">Um estúdio de piercing do Porto</h1></div>
<div><p class="resp" style="margin-top:0">{resposta}</p>
<div class="acoes"><a class="btn" href="{wa('Olá Dinis! Vi o site do Adri e quero um para o meu negócio.')}">Quero um site assim</a><a class="btn sec" href="https://adribodypiercing.pt" rel="noopener">Abrir o site</a></div>
<p class="atual">Publicado em novembro de 2026. Página atualizada a 12 de novembro de 2026.</p></div>
<div class="tel"><img src="/img/adri-480.webp" width="480" height="1039" alt="Página inicial do AdriBodyPiercing no telemóvel" fetchpriority="high"></div>
</div></div>

<section aria-labelledby="t-tem"><div class="w">
<h2 id="t-tem" class="rv">O que o site faz</h2>
<ul class="lista">
<li class="rv"><b>Mapa da orelha</b>Tocas num ponto e vês o preço, quanto tempo demora a cicatrizar e a joia com que sais.</li>
<li class="rv"><b>Marcação online</b>Escolhes o sábado e a hora, e o pedido fica à espera da aprovação do Adri. Sem sinal: paga-se no estúdio.</li>
<li class="rv"><b>Uma página por piercing</b>22 páginas, do lóbulo ao microdermal, cada uma com o preço, a joia incluída e os cuidados.</li>
<li class="rv"><b>Vales de oferta</b>Pagos por MB WAY e entregues por WhatsApp, prontos a oferecer.</li>
<li class="rv"><b>WhatsApp sempre à mão</b>Para tirar uma dúvida ou mandar a foto da orelha antes de escolher.</li>
<li class="rv"><b>Uma joia em 3D no topo</b>Roda com o dedo e mostra logo que o site é dele e de mais ninguém.</li>
</ul>
</div></section>

<section aria-labelledby="t-res"><div class="w estreito">
<h2 id="t-res" class="rv">O que já se vê</h2>
<p class="intro rv">A 12 de novembro de 2026, a página inicial já estava no índice do Google (confirmado no Search Console). As páginas de cada piercing foram publicadas a 11 de novembro e ainda estão a entrar. Ainda é cedo para contar marcações, por isso não ponho aqui números que não existem.</p>
<p class="intro rv">Se também tens um negócio no Porto, vê como funciona a <a href="/criacao-de-sites-porto/">criação de sites no Porto</a>: preço à vista, contacto num toque e a morada certa.</p>
</div></section>

{bloco_fim('O próximo pode ser o teu.', 'Diz-me o que fazes. O desenho vem primeiro e só pagas metade quando o aprovares.', 'Olá Dinis! Vi o site do Adri e quero um para o meu negócio.')}'''
    ld = pessoa_servico() + [
        migalhas([('Dinis Sousa', '/'), ('Caso AdriBodyPiercing', url)]),
        {'@type': 'Article', '@id': SITE + url + '#artigo', 'headline': 'Um estúdio de piercing do Porto, com site próprio', 'inLanguage': 'pt-PT',
         'datePublished': HOJE, 'dateModified': HOJE, 'author': {'@id': SITE + '/#dinis'}, 'publisher': {'@id': SITE + '/#dinis'},
         'mainEntityOfPage': SITE + url, 'image': SITE + '/img/adri.webp',
         'about': {'@type': 'WebSite', 'name': 'AdriBodyPiercing', 'url': 'https://adribodypiercing.pt/'}},
    ]
    return url, doc(titulo, desc, url, ld, corpo, og_tipo='article', cor_tema='#0E0C0B')


# ---------------------------------------------------------------- 404
def pagina_404():
    return f'''<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página não encontrada · Dinis Sousa</title><meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><script>document.documentElement.classList.add('js')</script><style>{CSS}
main{{min-height:70svh;display:flex;align-items:center}}</style>
<script defer src="/_e.js" data-site="dinissousa"></script></head>
<body><header class="top"><div class="w"><a class="brand" href="/">{MARCA.format(n=1)}<span>Dinis Sousa</span></a></div></header>
<main id="conteudo"><div class="w">
<h1 class="estica">Esta página não existe.</h1>
<p class="resp">Pode ter mudado de sítio ou o endereço tem uma letra trocada. O resto está aqui à mão:</p>
<div class="acoes"><a class="btn" href="/">Ir para o início</a><a class="btn sec" href="/quanto-custa-um-site/">Ver os preços</a><a class="btn sec" href="/#projetos">Ver os projetos</a></div>
</div></main>
{rodape()}
{JS}
</body></html>
'''


def main():
    paginas = dict([porto(), gondomar(), caso_parou(), caso_adri()])
    for url, h in paginas.items():
        p = os.path.join(SITE_DIR, url.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(h)
    open(os.path.join(SITE_DIR, '404.html'), 'w', encoding='utf-8').write(pagina_404())
    print(len(paginas) + 1, 'páginas')


if __name__ == '__main__':
    main()
