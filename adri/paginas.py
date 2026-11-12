#!/usr/bin/env python3
"""AdriBodyPiercing: uma página por piercing (/piercing/<sítio>/) e a lista de preços (/piercing/).

Para quem pesquisa «piercing nariz porto», «piercing helix», «piercing umbigo preço», «piercing septo porto»… (sugestões do
Google em Portugal, 11/11/2026). Os preços, os tempos de cicatrização, as joias e as combinações vêm do próprio site
(a lista S e COMBINA em sites/adribodypiercing/index.html), por isso nunca ficam diferentes do que o site mostra.
Cada página tem conteúdo próprio do sítio (onde fica, cuidados específicos, o que pede da anatomia) e o tempo de
cicatrização com a referência médica ao lado (HealthLink BC/Healthwise, revisto por médicos, 2023), mais as fontes no fim.
Também atualiza o sitemap.xml (a data de cada página só muda quando a página muda).
Uso: python3 adri/paginas.py   (a guarda diária verifica que as páginas estão em dia)
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

# Fontes citadas nas páginas
F_HL = ('HealthLink BC (Healthwise, revisto por médicos, 2023): tempos de cicatrização', 'https://www.healthlinkbc.ca/healthwise/body-piercing-healing-times')
F_APP = ('Association of Professional Piercers: folheto de cuidados para piercings no corpo (2021)', 'https://safepiercing.org/')
F_ORAL = ('Public Health England e Torbay Council: cuidados com piercings na boca', 'https://www.torbay.gov.uk/business/licensing/skin-piercing-acupuncture-and-tattooing/oral-piercing-aftercare/')
F_DAITH = ('Drugs.com (revisto por Sally Chao, MD, 2024): daith, tragus e enxaquecas', 'https://www.drugs.com/medical-answers/daith-tragus-piercings-migraines-3563520')

# Referência médica (HealthLink BC) por grupo; None quando a fonte não fala desse sítio
REF = {'lobulo': ('6 a 8 semanas', 'o rosto, que inclui o lóbulo'), 'cartilagem': ('2 a 4 meses', 'a cartilagem da orelha'),
       'narina': ('2 a 8 meses', 'a narina'), 'labios': ('6 a 8 semanas', 'o rosto, que inclui os lábios'),
       'boca': ('3 a 6 semanas', 'o interior da boca'), 'sobrancelha': ('6 a 8 semanas', 'o rosto, que inclui as sobrancelhas'),
       'umbigo': ('até 9 meses', 'o umbigo'), 'mamilo': ('6 a 12 meses', 'o mamilo')}

ORAL = 'Depois de comer, bochecha com um elixir sem álcool. Não brinques com a joia com a língua nem com os dentes.'
SONO_ORELHA = 'Não durmas em cima: uma almofada de viagem, com a orelha no buraco do meio, ajuda muito.'

# Por sítio: onde fica, o que pede da anatomia ou do dia a dia, cuidados próprios, referência e fontes
DADOS = {
    'lobulo': dict(onde='Na parte mole de baixo da orelha, onde se põem os brincos.',
                   nota='É o melhor sítio para o primeiro piercing: é carne, não cartilagem, e cicatriza depressa.',
                   cuid=['Cuidado com os auriculares e com o fecho de brincos de outras pessoas nas primeiras semanas.'], ref='lobulo'),
    'lobulo-alto': dict(onde='Também no lóbulo, mais acima, ao lado do primeiro furo.',
                        nota='Se já tens o primeiro furo, alinhamos os dois ao espelho antes de furar, para ficarem em escada.',
                        cuid=['Como fica mais perto da cartilagem, pode demorar um pouco mais do que o primeiro furo.'], ref='lobulo'),
    'helix': dict(onde='Na borda de cartilagem do topo da orelha.',
                  nota='É dos que mais prendem no cabelo, nos óculos e na almofada.',
                  cuid=[SONO_ORELHA, 'Prende o cabelo comprido ao pentear e ao tirar camisolas.'], ref='cartilagem'),
    'helix-frontal': dict(onde='Na cartilagem da frente da orelha, junto à cara, por cima do tragus.',
                          nota='Fica perto da pele da cara e do cabelo, por isso champô, laca e cremes não devem cair no furo.',
                          cuid=[SONO_ORELHA, 'Enxagua bem o cabelo no duche para não ficarem restos de champô junto à joia.'], ref='cartilagem'),
    'flat': dict(onde='Na parte plana de cartilagem, por dentro da borda do topo da orelha.',
                 nota='Tem espaço para uma joia com pedra, que se vê bem de frente.',
                 cuid=[SONO_ORELHA, 'Evita bonés e auscultadores que encostem por cima nas primeiras semanas.'], ref='cartilagem'),
    'tragus': dict(onde='Na pequena aba de cartilagem à frente do canal do ouvido.',
                   nota='Os auriculares e o telemóvel encostam aqui.',
                   cuid=['Usa o outro ouvido para auriculares e chamadas enquanto cicatriza e limpa o ecrã do telemóvel.', SONO_ORELHA], ref='cartilagem'),
    'antitragus': dict(onde='Na saliência de cartilagem por cima do lóbulo, em frente ao tragus.',
                       nota='Precisa de uma saliência com tamanho suficiente. Vejo na consulta se a tua orelha tem.',
                       cuid=[SONO_ORELHA], ref='cartilagem'),
    'conch': dict(onde='Na concha, a parte côncava do meio da orelha.',
                  nota='Pode ser interior (perto do canal do ouvido) ou exterior (mais acima). Escolhemos juntos ao espelho.',
                  cuid=['Auriculares que entram no ouvido encostam à joia: evita-os desse lado nas primeiras semanas.', SONO_ORELHA], ref='cartilagem'),
    'daith': dict(onde='Na dobra de cartilagem mais interior da orelha, mesmo por cima do canal do ouvido.',
                  nota='Depende muito da forma da orelha. Há quem o faça por causa das enxaquecas, mas não há provas científicas de que ajude, por isso não o recomendo por essa razão.',
                  cuid=['Auriculares que entram no ouvido podem tocar na argola: usa os de pôr por cima.', SONO_ORELHA], ref='cartilagem', extra=[F_DAITH]),
    'rook': dict(onde='Na dobra de cartilagem por cima do daith, do lado de dentro da orelha.',
                 nota='Precisa de uma dobra bem marcada. É dos que mais incham no início, por isso a barra vem mais comprida.',
                 cuid=[SONO_ORELHA], ref='cartilagem'),
    'snug': dict(onde='Na borda interior de cartilagem, a meio da orelha, por dentro do hélix.',
                 nota='É dos mais exigentes com a anatomia. Na consulta digo-te com franqueza se a tua orelha dá.',
                 cuid=[SONO_ORELHA, 'Incha mais do que os outros: não mexas na joia mesmo que pareça presa.'], ref='cartilagem'),
    'industrial': dict(onde='Dois furos no topo da orelha, ligados por uma barra reta.',
                       nota='Os dois furos têm de ficar alinhados com a forma da tua orelha, para a barra não forçar a cartilagem.',
                       cuid=[SONO_ORELHA, 'Se um dos furos incomodar mais do que o outro, manda-me uma foto: pode ser preciso ajustar a barra.'], ref='cartilagem'),
    'narina': dict(onde='Na asa do nariz, de um lado.',
                   nota='Fecha depressa se tirares a joia, por isso não a tires nos primeiros meses.',
                   cuid=['Cuidado ao assoar e com cremes e maquilhagem da cara, que não devem entrar no furo.'], ref='narina'),
    'septo': dict(onde='Na parte mole entre as narinas, à frente, e não na cartilagem.',
                  nota='Com uma ferradura, a joia pode virar-se para dentro do nariz e ficar escondida, mas só depois de cicatrizar.',
                  cuid=['Não vires a joia para cima nem para baixo enquanto cicatriza.', 'Cuidado ao assoar: devagar e com lenço limpo.'], ref=None),
    'labio': dict(onde='Por baixo do lábio inferior, ao centro ou de lado.',
                  nota='Por dentro, a joia tem um disco liso que fica encostado à gengiva.',
                  cuid=[ORAL], ref='labios', extra=[F_ORAL]),
    'medusa': dict(onde='No sulco por cima do lábio superior, ao centro.',
                   nota='Fica bem centrado se o marcarmos com a boca relaxada, por isso confirmas ao espelho antes.',
                   cuid=[ORAL, 'Batom e maquilhagem ficam longe do furo até cicatrizar.'], ref='labios', extra=[F_ORAL]),
    'smiley': dict(onde='Na pele fina por dentro do lábio superior, que liga o lábio à gengiva. Só se vê quando sorris.',
                   nota='Precisa de um freio com tamanho suficiente. Vejo na consulta se dá.',
                   cuid=[ORAL, 'Se sentires a argola a bater nos dentes, fala comigo para ajustar.'], ref='boca', extra=[F_ORAL]),
    'sobrancelha': dict(onde='Na ponta exterior da sobrancelha, na vertical.',
                        nota='A posição segue a forma da tua sobrancelha. Marco o ponto e confirmas ao espelho.',
                        cuid=['Cuidado ao tirar camisolas e com a maquilhagem dos olhos.'], ref='sobrancelha'),
    'umbigo': dict(onde='Na dobra de pele por cima do umbigo.',
                   nota='Depende da forma do umbigo: se a dobra não tiver altura, digo-te na consulta.',
                   cuid=['Calças e cintos de cintura subida esfregam na joia: prefere roupa larga na cintura nas primeiras semanas.',
                         'No desporto, protege com um protetor rígido com furos (como os dos olhos) preso com uma ligadura, e não com adesivo.'], ref='umbigo'),
    'mamilo': dict(onde='Na horizontal, na base do mamilo.',
                   nota='Antes de furar, vemos juntos a posição ao espelho, com o corpo direito, para os dois ficarem à mesma altura.',
                   cuid=['Uma t-shirt de algodão justa ou um soutien de desporto protege, sobretudo a dormir.'], ref='mamilo'),
    'surface': dict(onde='Uma barra por baixo da pele numa zona plana, como a nuca ou a clavícula, com as duas pontas à vista.',
                    nota='É dos piercings com mais risco de rejeição: a pele pode ir empurrando a joia para fora.',
                    cuid=['Se a barra começar a ver-se por baixo da pele, manda-me uma foto logo.', 'Evita roupa que esfregue por cima.'], ref=None),
    'microdermal': dict(onde='Uma base pequena por baixo da pele, com só o topo à vista, feita num só furo.',
                        nota='Pede cuidados para sempre e pode durar menos tempo do que outros piercings.',
                        cuid=['Mesmo depois de cicatrizar, enxagua no duche: por baixo do topo junta-se sujidade.', 'Não ponhas maquilhagem por cima.'], ref=None),
}
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
.cic{display:grid;gap:10px;margin:18px 0 0;max-width:640px}.cic div{background:#1A1715;border:1px solid var(--linha);border-radius:18px;padding:16px 18px}
.cic b{display:block;color:var(--osso);font-size:20px;font-family:"Bricolage Grotesque",system-ui,sans-serif}.cic small{color:var(--sec);font-size:14px}
.fontes{font-size:14px}.fontes li{margin:4px 0}
footer{margin-top:72px;border-top:1px solid var(--linha);padding:30px 0 44px;font-size:14px;color:var(--sec)}footer a{color:var(--sec)}
@media(max-width:420px){.ficha{grid-template-columns:84px 1fr}.ficha img{width:84px;height:84px}.preco{font-size:28px}}'''

# Nome, morada e telefone iguais em todo o lado (site, dados estruturados, llms.txt e perfil do Google)
NAP = 'Kaos Tattoo, Rua da Torrinha 202, 4050-610 Porto'
TEL, TEL_TXT = '+351935837613', '935 837 613'
MAPA = 'https://www.google.com/maps/search/?api=1&query=Kaos%20Tattoo%2C%20Rua%20da%20Torrinha%20202%2C%20Porto'
NEGOCIO = {'@type': 'HealthAndBeautyBusiness', '@id': SITE + '/#negocio', 'name': 'AdriBodyPiercing', 'alternateName': 'Adri Body Piercing',
           'description': 'Estúdio de body piercing do Adri no Kaos Tattoo, no Porto: agulha americana de uso único e joias só em titânio de implante.',
           'url': SITE + '/', 'image': SITE + '/og.jpg', 'logo': SITE + '/icon-512.png', 'telephone': TEL, 'email': 'adrianosillvaa@icloud.com',
           'address': {'@type': 'PostalAddress', 'streetAddress': 'Rua da Torrinha, 202', 'postalCode': '4050-610', 'addressLocality': 'Porto',
                       'addressRegion': 'Porto', 'addressCountry': 'PT'},
           'containedInPlace': {'@type': 'TattooParlor', 'name': 'Kaos Tattoo',
                                'address': {'@type': 'PostalAddress', 'streetAddress': 'Rua da Torrinha, 202', 'postalCode': '4050-610', 'addressLocality': 'Porto', 'addressCountry': 'PT'}},
           'hasMap': MAPA, 'areaServed': {'@type': 'City', 'name': 'Porto'},
           'openingHoursSpecification': [{'@type': 'OpeningHoursSpecification', 'dayOfWeek': 'https://schema.org/Saturday', 'opens': '10:00', 'closes': '17:30'}],
           'priceRange': '30 € – 60 €', 'currenciesAccepted': 'EUR', 'paymentAccepted': 'MB WAY, Multibanco, numerário',
           'founder': {'@type': 'Person', 'name': 'Adriano Filho', 'alternateName': 'Adri', 'jobTitle': 'Body piercer', 'sameAs': ['https://www.instagram.com/adrifilhoo']},
           'sameAs': ['https://www.instagram.com/adrifilhoo']}


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
<footer><div class="w"><p>AdriBodyPiercing, de Adriano Filho · {NAP} · <a href="tel:{TEL}">{TEL_TXT}</a> · aos sábados, das 10h às 17h30</p>
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
        d = DADOS[x['id']]
        ref = REF.get(d['ref']) if d['ref'] else None
        fontes = ([F_HL] if ref else []) + [F_APP] + d.get('extra', [])
        if ref:
            cic_txt = (f'Conto com <strong>{e(x["c"])}</strong> até estar cicatrizado por dentro. A referência médica da HealthLink BC dá '
                       f'<strong>{e(ref[0])}</strong> para {e(ref[1])}. A diferença vem de o furo fechar por fora antes de estar pronto por dentro: '
                       'por isso só troco a joia quando vejo que está mesmo cicatrizado.')
        else:
            cic_txt = (f'Conto com <strong>{e(x["c"])}</strong> até estar cicatrizado por dentro. As referências médicas que uso não dão um prazo '
                       'para este sítio, por isso este é o prazo da minha prática, e só troco a joia quando vejo que está mesmo cicatrizado.')
        perg = [
            (f'Quanto custa o {nome.lower()} no Porto?', f'{pr[0].upper() + pr[1:]}, já com a joia em titânio de implante ({x["j"].lower()}), o soro para os cuidados e a revisão às 4–8 semanas.'
             + (' Na orelha o preço pode subir conforme a complexidade, mas digo-te sempre o valor antes de começar.' if x['z'] == 'orelha' else '')),
            ('Dói?', dor(x)),
            ('Com que joia saio?', f'{x["j"]}, em titânio de implante (sem níquel). Às 4–8 semanas, quando o inchaço baixa, troco a barra por uma mais curta, sem custo.'),
        ]
        if x['id'] == 'daith':
            perg.append(('O daith ajuda nas enxaquecas?', 'Não há provas científicas de que ajude. Se o queres fazer, que seja por gostares dele, não para tratar enxaquecas: para isso, fala com o teu médico.'))
        comb = [por_id[c] for c in combina.get(x['id'], []) if c in por_id]
        img = imgs.get(x['img'], '').split('?')[0]
        lead = (f'{e(nome)} com o Adri, no Kaos Tattoo (Porto): <strong>{e(pr)}</strong>, com a joia em titânio de implante, o soro e a revisão incluídos. '
                f'{e(d["onde"])} Feito com agulha americana de uso único, nunca pistola, aos sábados e uma pessoa de cada vez.')
        cuidados = ''.join(f'<li>{e(c)}</li>' for c in d['cuid'])
        corpo = f'''<nav class="mig" aria-label="Estás aqui"><a href="/">Início</a> › <a href="/piercing/">Piercings</a> › {e(nome)}</nav>
<h1>{e(nome)} no Porto</h1>
<p class="lead">{lead}</p>
<div class="ficha">{f'<img src="{e(img)}" alt="{e(x["j"])}" width="110" height="110" loading="eager">' if img else ''}
<div><p class="preco" style="margin:0 0 8px">{e(pr)}</p><dl><dt>Cicatriza em</dt><dd>{e(x["c"])}</dd><dt>Joia incluída</dt><dd>{e(x["j"])}</dd><dt>Também incluído</dt><dd>Soro e revisão às 4–8 semanas</dd></dl></div></div>
<p class="acoes"><a class="btn" href="/?p={quote(x["id"])}#marcar">Marcar este piercing</a><a class="btn sec" href="https://wa.me/351935837613?text={quote("Olá Adri! Tenho uma dúvida sobre o " + nome.lower() + ".")}" rel="noopener">Tirar uma dúvida no WhatsApp</a></p>
<h2>Onde fica e o que pede</h2>
<p>{e(d["onde"])} {e(d["nota"])}</p>
<h2>Quanto tempo demora a cicatrizar</h2>
<p>{cic_txt}</p>
<div class="cic"><div><b>{e(x["c"])}</b><small>o prazo com que conto no estúdio</small></div>{f'<div><b>{e(ref[0])}</b><small>referência médica para {e(ref[1])} (HealthLink BC)</small></div>' if ref else ''}</div>
<h2>Cuidados depois</h2>
<ul class="l">{cuidados}
<li>Limpa só com soro estéril em spray, uma a duas vezes por dia, e seca com papel limpo. Levas um do estúdio.</li>
<li>Não uses soro feito em casa, álcool, água oxigenada nem pomadas. Se a dor aumentar depois do terceiro dia, manda-me uma foto por WhatsApp. <a href="/#cuidados">Todos os cuidados</a>.</li></ul>
<h2>Perguntas</h2>
{"".join(f"<h3>{e(q)}</h3><p>{e(r)}</p>" for q, r in perg)}
{('<h2>Fica bem com</h2><ul class="ch">' + "".join(f'<li><a href="{caminho(c)}">{e(NOMES[c["id"]][0])}<small>{e(preco(c))}</small></a></li>' for c in comb) + '</ul>') if comb else ''}
<h2>Onde</h2>
<p>No <strong>Kaos Tattoo</strong>, Rua da Torrinha 202, 4050-610 Porto. Aos sábados, das 10h às 17h30, com marcação online. Telefone e WhatsApp: <a href="tel:{TEL}">{TEL_TXT}</a>. Pagas só no estúdio: MB WAY, Multibanco ou numerário.</p>
<p class="acoes"><a class="btn" href="/?p={quote(x["id"])}#marcar">Marcar este piercing</a><a class="btn sec" href="{MAPA}" rel="noopener">Abrir no mapa</a></p>
<h2>Fontes</h2>
<ul class="l fontes">{"".join(f'<li><a href="{u}" rel="noopener">{e(t)}</a></li>' for t, u in fontes)}</ul>
<p class="fontes">Página revista a 12 de novembro de 2026.</p>'''
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
<p style="margin-top:28px">A consulta de 15 minutos para escolher é grátis, e a troca da barra na revisão também. Não faço piercing de língua.</p>
<p>«Cicatriza em» é o prazo com que conto no estúdio até o piercing estar pronto por dentro. Em cada página está também a referência médica, quando existe, e a fonte.</p>
<h2>Onde</h2>
<p>No <strong>Kaos Tattoo</strong>, Rua da Torrinha 202, 4050-610 Porto. Aos sábados, das 10h às 17h30, com marcação online. Telefone e WhatsApp: <a href="tel:{TEL}">{TEL_TXT}</a>.</p>
<p class="acoes"><a class="btn" href="/#marcar">Marcar piercing</a><a class="btn sec" href="{MAPA}" rel="noopener">Abrir no mapa</a></p>'''
    ld = [NEGOCIO, {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': SITE + '/'}, {'@type': 'ListItem', 'position': 2, 'name': 'Piercings', 'item': SITE + '/piercing/'}]},
          {'@type': 'OfferCatalog', '@id': SITE + '/piercing/#precos', 'name': 'Piercings no Porto', 'itemListElement': [
              {'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': NOMES[x['id']][0]}, 'price': x['p'], 'priceCurrency': 'EUR', 'url': SITE + caminho(x)} for x in itens]}]
    paginas['/piercing/'] = doc('Preços dos piercings no Porto, com joia em titânio | Adri',
                                'Preços de todos os piercings no Porto com o Adri: orelha desde 35 €, nariz 30 €, umbigo 50 €. Joia em titânio, soro e revisão incluídos.',
                                '/piercing/', ld, corpo, logo, rodape_links)
    return paginas


def main():
    import datetime
    paginas = gerar()
    raiz = os.path.join(SITE_DIR, 'piercing')
    # a data de cada página no sitemap só muda quando a página muda
    antes = {}
    for url in paginas:
        f = os.path.join(SITE_DIR, url.strip('/'), 'index.html')
        if os.path.exists(f):
            antes[url] = open(f, encoding='utf-8').read()
    shutil.rmtree(raiz, ignore_errors=True)
    for url, h in paginas.items():
        p = os.path.join(SITE_DIR, url.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(h)
    sm = os.path.join(SITE_DIR, 'sitemap.xml')
    velho = open(sm, encoding='utf-8').read() if os.path.exists(sm) else ''
    datas = dict(re.findall(r'<loc>https://adribodypiercing\.pt([^<]*)</loc><lastmod>([^<]+)</lastmod>', velho))
    hoje = datetime.date.today().isoformat()
    data = {'/': datas.get('/', hoje)}
    for url, h in paginas.items():
        data[url] = datas[url] if (url in datas and antes.get(url) == h) else hoje
    urls = ['/'] + sorted(paginas)
    open(sm, 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                          + ''.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{data[u]}</lastmod></url>\n' for u in urls) + '</urlset>\n')
    print(len(paginas), 'páginas')


if __name__ == '__main__':
    main()
