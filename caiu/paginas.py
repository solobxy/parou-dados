"""caiu.pt — páginas de preços por produto («Azeite mais barato hoje»), para quem procura no Google.

Uso: python3 paginas.py <pasta_dados>
Lê <pasta_dados>/lista.json e resumo.json (escritos por recolher.py) e escreve <pasta_dados>/paginas/:
  index.html             todas as páginas, por secção (servida em https://caiu.pt/preco/)
  <slug>/index.html      uma página por pesquisa de termos.txt com produtos suficientes (/preco/<slug>/)
  sitemap.xml            para o Google (/preco/sitemap.xml)
Corre depois de cada recolha (caiu-recolha.service) e quando este ficheiro muda (servidor/atualizar.sh).
Os produtos de cada página são os da pesquisa do site, só os que são mesmo daquele produto (o «sal» não traz salsichas).
"""
import html, json, os, re, shutil, sys, urllib.parse
from collections import Counter, OrderedDict
from datetime import datetime
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import comum as C

SITE = 'https://caiu.pt'
LOJAS = {'c': 'Continente', 'p': 'Pingo Doce', 'a': 'Auchan'}
CARIMBO = {'real': 'A sério', 'fachada': 'Fachada', 'pvpr': 'Sobre o PVPR', 'promo': 'Promoção'}
UNIDADE = {'kg': 'quilo', 'L': 'litro', 'un': 'unidade'}
MIN_PRODUTOS = 6
LIGAS = {'de', 'do', 'da', 'dos', 'das', 'e', 'com', 'para', 'em', 'sem'}
FORA = {'auchan', 'continente', 'pingo doce'}  # marcas próprias das lojas: não dão uma página de «produto»
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
ESTILO_V = '4'

e = html.escape


def eur(v):
    return ('%.2f' % v).replace('.', ',') + ' €'


def slug(t):
    return re.sub(r'[^a-z0-9]+', '-', C.norm(t)).strip('-')


def palavras(t):
    return [x for x in re.split(r'[^a-z0-9]+', C.norm(t)) if x and x not in LIGAS]


def variantes(w):
    v = {w}
    if w.endswith('oes'):
        v.add(w[:-3] + 'ao')
    if w.endswith('ao'):
        v.add(w[:-2] + 'oes')
    if w.endswith('es') and len(w) > 4:
        v.add(w[:-2])
    if w.endswith('s') and len(w) > 3:
        v.add(w[:-1])
    if not w.endswith('s'):
        v.add(w + 's')
    return v


def relevante(g, termo, marca):
    """O produto é mesmo deste termo? Todas as palavras no nome (ou na marca, para marcas) e, nos produtos,
    o nome começa por uma delas («Sal Marinho» sim, «Salsichas» e «Ice Tea Limão» não)."""
    nome = palavras(g[1])
    if not nome:
        return False
    alvo = set(nome) | (set(palavras(g[2])) if marca else set())
    tw = palavras(termo)
    if not tw or not all(variantes(w) & alvo for w in tw):
        return False
    return marca or any(nome[0] in variantes(w) for w in tw)


def ler_termos():
    """[(secção, termo)] pela ordem de termos.txt, sem repetidos."""
    out, sec, vistos = [], 'Outros', set()
    for l in open(os.path.join(AQUI, 'termos.txt'), encoding='utf-8'):
        l = l.strip()
        if not l:
            continue
        if l.startswith('#'):
            t = l[1:].strip()
            if not t.lower().startswith('pesquisas'):
                sec = 'Mais categorias' if t.lower().startswith('cabaz') else t
            continue
        s = slug(l)
        if s and s not in vistos and C.norm(l) not in FORA:
            vistos.add(s)
            out.append((sec, l))
    return out


def titulo_termo(t):
    return t[:1].upper() + t[1:]


def data_longa(iso_dia):
    a, m, d = iso_dia.split('-')
    return f'{int(d)} de {MESES[int(m) - 1]}'


# ---------- dados ----------
class Dados:
    def __init__(self, pasta):
        self.P = C.Produtos(pasta)
        self.P.atualizar()
        with open(os.path.join(pasta, 'resumo.json'), encoding='utf-8') as f:
            self.R = json.load(f)
        self.img = self.R.get('img') or []
        self.dia = self.P.dia or self.R.get('dia', '')
        self.atualizado = self.R.get('atualizado', '')

    def img_url(self, s):
        if not s:
            return ''
        k = s.find('|')
        if 0 < k < 3 and s[:k].isdigit() and int(s[:k]) < len(self.img):
            return self.img[int(s[:k])] + s[k + 1:] + '?sw=240&sh=240&sm=fit'
        return s if s.startswith('https://') else ''

    def g(self, i):
        a = self.P.g[i]
        o = [{'l': x[0], 'p': x[2], 'pu': x[3], 'u': x[4], 'a': x[5], 'r': x[6], 't': x[7], 'v': x[8], 'm': x[9] or [], 'd': x[11]} for x in a[7]]
        return {'i': a[0], 'n': a[1], 'm': a[2], 'q': a[3], 'img': self.img_url(a[5]), 'v': a[6], 'o': o, 'min': min(x['p'] for x in o)}

    def produtos(self, termo, sec):
        ids = self.P.procurar(termo)
        marca = sec.startswith('Marcas')
        if not marca and ids:
            # Termos que são marcas noutras secções (ex.: «coca-cola» nas Bebidas)
            tw = palavras(termo)
            com_marca = sum(1 for i in ids[:60] if all(variantes(w) & set(palavras(self.P.g[i][2])) for w in tw))
            marca = com_marca >= 0.3 * min(60, len(ids))
        return [self.g(i) for i in ids if relevante(self.P.g[i], termo, marca)]


# ---------- pedaços de HTML (as mesmas classes do site) ----------
def qtd_texto(q):
    q = re.sub(r'^emb\.\s*', '', q or '', flags=re.I)
    q = re.sub(r'^Quant\.\s*M[ií]nima\s*=\s*', 'mín. ', q, flags=re.I)
    q = re.sub(r'(\d)\.(\d)', r'\1,\2', q)
    return re.sub(r'\blt\b', 'L', re.sub(r'\bgr\b', 'g', re.sub(r'\bKg\b', 'kg', q)), flags=re.I)


def preco_html(v):
    return f'<span class="preco">{("%.2f" % v).replace(".", ",")}<span class="eur">€</span></span>'


def img_html(g, cls, tam):
    if g['img']:
        return (f'<img class="{cls}" src="{e(g["img"])}" alt="" width="{tam}" height="{tam}" loading="lazy" decoding="async" '
                f'referrerpolicy="no-referrer">')
    return f'<div class="{cls} et__img--vazio" aria-hidden="true">{e((g["n"] or "?")[0])}</div>'


def igual(a, b):
    return abs(a - b) < 0.005


def destaca(g, o):
    return len(g['o']) > 1 and igual(o['p'], g['min']) and not all(igual(x['p'], g['min']) for x in g['o'])


def linha(g, extra='', o_loja=None):
    """Uma linha de produto. Com o_loja (página de uma loja): o preço grande e o carimbo são os dessa loja."""
    ordem = sorted(g['o'], key=lambda o: o['p'])
    lojas = ''.join(f'<span class="{"melhor" if destaca(g, o) else ""}">{LOJAS[o["l"]]} <b>{eur(o["p"])}</b></span>' for o in ordem)
    v = o_loja['v'] if o_loja else g['v']
    carimbo = f'<span class="carimbo carimbo--{v} carimbo--fixo">{CARIMBO[v]}</span>' if v in CARIMBO else ''
    return (f'<li class="ln">{img_html(g, "ln__img", 64)}'
            f'<p class="ln__nome"><a href="/#p={e(g["i"])}">{e(g["n"])}</a></p>{preco_html(o_loja["p"] if o_loja else g["min"])}'
            f'<p class="ln__meta"><span>{e(qtd_texto(g["q"]))}</span>{lojas}{extra}</p>'
            f'<div class="ln__pe">{carimbo}</div></li>')


ORDEM_M = {'outra': 0, 'antes': 1, 'igual': 2, 'min30': 3, 'pvpr': 4}


def motivo(o):
    for m in sorted(o['m'], key=lambda m: ORDEM_M.get(m[0], 9))[:1]:
        if m[0] == 'min30':
            return f'Está mais barato do que em qualquer um dos {m[2]} dias anteriores. O mínimo tinha sido {eur(m[1])}.'
        if m[0] == 'outra':
            return f'No {LOJAS.get({"continente": "c", "pingodoce": "p", "auchan": "a"}.get(m[1], m[1]), m[1])} está mais barato: {eur(m[2])}.'
        if m[0] == 'antes':
            return f'O preço riscado ({eur(m[1])}) não aparece nos nossos registos: nos últimos {m[3]} dias o mais alto foi {eur(m[2])}.'
        if m[0] == 'igual':
            return f'Nos últimos 30 dias já esteve a {eur(m[1])}. Esta promoção não é o preço mais baixo do mês.'
        if m[0] == 'pvpr':
            return f'O desconto é calculado sobre o PVPR de {eur(m[1])}, o preço recomendado pela marca, e não sobre o preço a que a loja vendia.'
    return ''


def cartao(g, o=None):
    o = o or next((x for x in g['o'] if x['v'] == g['v']), g['o'][0])
    outras = sorted((x for x in g['o'] if x is not o), key=lambda x: x['p'])
    tag = ''
    if o['r'] and o['p'] < o['r']:
        tag = f'−{round((o["r"] - o["p"]) / o["r"] * 100)} % · PVPR <span class="riscado">{eur(o["r"])}</span>'
    elif o['a'] and o['p'] < o['a']:
        tag = f'antes <span class="riscado">{eur(o["a"])}</span>'
    out = ''.join(f'<li class="{"melhor" if destaca(g, x) and x["p"] < o["p"] - 0.005 else ""}"><span>{LOJAS[x["l"]]}</span><b>{eur(x["p"])}</b></li>' for x in outras)
    return (f'<li class="et"><div class="et__cab">{img_html(g, "et__img", 84)}<div><h3 class="et__nome"><a href="/#p={e(g["i"])}">{e(g["n"])}</a></h3>'
            f'<p class="et__q">{e(qtd_texto(g["q"]))}</p></div></div>'
            + (f'<span class="carimbo carimbo--{o["v"]} carimbo--fixo">{CARIMBO[o["v"]]}</span>' if o['v'] in CARIMBO else '')
            + f'<div class="et__fita"><div class="et__loja">{LOJAS[o["l"]]}{f"<small>{tag}</small>" if tag else ""}</div>{preco_html(o["p"])}</div>'
            + (f'<ul class="et__outras">{out}</ul>' if out else '')
            + f'<p class="et__motivo">{e(motivo(o))}</p></li>')


def cabeca(titulo, descricao, url, ld, dia):
    return f'''<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">
<meta name="theme-color" content="#FFD83D">
<meta name="color-scheme" content="light">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_PT">
<meta property="og:site_name" content="caiu.pt">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(descricao)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{SITE}/partilha.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icone-180.png">
<link rel="preload" href="/fontes/mona.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/estilo.css?v={ESTILO_V}">
<style>
.pp-migalhas{{font-size:14px;color:var(--tinta-2);margin:0 0 14px}}
.pp-heroi{{padding-top:28px}}
.pp-migalhas a{{color:inherit}}
.pp-heroi h1{{margin:0 0 10px;font-size:clamp(34px,10.4vw,88px);overflow-wrap:break-word}}
.pp-heroi .talao{{margin:22px 0 18px;max-width:440px}}
.pp-acoes{{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}}
.pp-rel{{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:14px 0 0;list-style:none}}
.pp-rel a{{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:var(--superficie,#fff);
  color:var(--tinta);text-decoration:none;font-weight:650;box-shadow:inset 0 0 0 2px var(--tinta)}}
.pp-rel a:hover{{background:var(--etiqueta)}}
.pp-sec h2{{margin-bottom:6px}}
.pp-indice h2{{margin:34px 0 4px}}
.pp-indice .pp-rel a small{{margin-left:8px;font-weight:500;color:var(--tinta-2)}}
.pp-nota{{font-size:14px;color:var(--tinta-2);margin-top:12px}}
.pp-sec h3{{font-size:19px;line-height:1.3;margin:26px 0 6px}}
.etiquetas > .et{{min-width:0}}
.et__cab{{grid-template-columns:84px minmax(0,1fr)}}
.ln{{grid-template-columns:64px minmax(0,1fr) auto}}
.ln__nome{{overflow-wrap:break-word}}
.et__nome{{overflow-wrap:break-word}}
.pp-acoes .botao{{max-width:100%;white-space:normal;text-align:center}}
.topo__nav{{gap:14px}}
.pp-sec h3 + p{{margin-top:0}}
</style>
<script defer src="/_e.js" data-site="caiu"></script>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, separators=(",", ":"))}</script>
</head>
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="topo__in">
    <a class="marca" href="/" aria-label="caiu.pt, início"><span class="marca__txt" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</span></a>
    <nav class="topo__nav" aria-label="Atalhos"><a class="topo__link" href="/promocoes/">Promoções</a><a class="topo__link" href="/preco/">Preços</a></nav>
  </div>
</header>
'''


def rodape(dia, hora):
    return f'''<footer class="rodape">
  <div class="caixa rodape__in">
    <p class="rodape__marca" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</p>
    <p class="rodape__dados">Preços recolhidos a {data_longa(dia)}, às {hora}, nas lojas online do Continente, Pingo Doce e Auchan. Podem mudar durante o dia e ser diferentes na loja física ou com cartão de cliente. O caiu.pt não tem ligação a estas lojas.</p>
    <p class="rodape__links"><a href="/promocoes/">Promoções da semana</a> · <a href="/supermercado-mais-barato/">Supermercado mais barato</a> · <a href="/preco/">Preços por produto</a> · <a href="/#avisos">Avisos de preço</a> · <a href="/privacidade.html">Privacidade</a></p>
    <p class="rodape__autor">Feito por <a href="https://dinissousa.pt" rel="noopener">dinissousa.pt</a></p>
  </div>
</footer>
</body>
</html>
'''


METODO = '''<section class="bloco bloco--metodo" aria-labelledby="t-metodo">
    <div class="caixa metodo">
      <h2 id="t-metodo">Como decidimos</h2>
      <div class="metodo__col">
        <div class="metodo__item"><span class="carimbo carimbo--real carimbo--fixo">A sério</span><p>O preço de hoje está abaixo de todos os preços dos 30 dias anteriores. Precisamos de pelo menos 7 dias de registos para o dizer.</p></div>
        <div class="metodo__item"><span class="carimbo carimbo--fachada carimbo--fixo">Fachada</span><p>Está em promoção mas outra loja vende mais barato, o preço riscado não aparece nos nossos registos ou já esteve a este preço no último mês.</p></div>
        <div class="metodo__item"><span class="carimbo carimbo--pvpr carimbo--fixo">Sobre o PVPR</span><p>O desconto é calculado sobre o preço de venda recomendado pela marca, que muitas vezes nenhuma loja pratica.</p></div>
      </div>
    </div>
  </section>'''


def por_unidade(gs):
    """Os mais baratos por litro/quilo/unidade (unidade da maioria), sem preços por unidade impossíveis
    (alguns anúncios das lojas trazem o preço de uma garrafa com o preço por litro do pack)."""
    us = Counter()
    for g in gs:
        o = min(g['o'], key=lambda o: o['p'])
        if o['pu'] and o['u'] in UNIDADE:
            us[o['u']] += 1
    if not us:
        return None, []
    u, n = us.most_common(1)[0]
    if n < max(4, 0.5 * len(gs)):
        return None, []
    vals = []
    for g in gs:
        cand = [o for o in g['o'] if o['pu'] and o['u'] == u]
        if cand:
            o = min(cand, key=lambda o: o['pu'])
            vals.append((o['pu'], o, g))
    if len(vals) < 4:
        return None, []
    med = sorted(v[0] for v in vals)[len(vals) // 2]
    ok = sorted((v for v in vals if 0.4 * med <= v[0] <= 3 * med), key=lambda v: v[0])
    return u, ok


def lojas_mais_baratas(gs):
    """Nos produtos iguais à venda em mais de uma loja: quantas vezes cada loja tem o preço mais baixo."""
    vence, n = Counter(), 0
    for g in gs:
        if len(g['o']) < 2:
            continue
        n += 1
        for o in g['o']:
            if igual(o['p'], g['min']) and not all(igual(x['p'], g['min']) for x in g['o']):
                vence[o['l']] += 1
    return n, vence


def pagina_termo(D, sec, termo, gs, irmaos, hora):
    s = slug(termo)
    nome = titulo_termo(termo)
    url = f'{SITE}/preco/{s}/'
    dia_l = data_longa(D.dia)
    promos = [g for g in gs if g['v']]
    reais = [g for g in gs if g['v'] == 'real']
    fach = [g for g in gs if g['v'] == 'fachada' and any(m[0] == 'outra' for o in g['o'] for m in o['m'])] or [g for g in gs if g['v'] == 'fachada']
    pvpr = sum(1 for g in gs if g['v'] == 'pvpr')
    n_iguais, vence = lojas_mais_baratas(gs)
    u, baratos = por_unidade(gs)

    # resposta curta (talão)
    linhas = [('Produtos comparados', str(len(gs))), ('À venda em mais de uma loja', str(n_iguais)), ('Em promoção', str(len(promos))),
              ('Desceram a sério', str(len(reais))), ('Desconto sobre o PVPR', str(pvpr))]
    if vence:
        lid, nv = vence.most_common(1)[0]
        pe = f'Nos {n_iguais} produtos iguais, o {LOJAS[lid]} foi o mais barato em {nv}.'
    else:
        pe = 'Ainda não há produtos iguais à venda em mais de uma loja.'
    talao = (f'<figure class="talao" aria-label="Resumo de hoje"><div class="talao__cab"><strong>{e(nome)} · hoje</strong><span>às {hora}</span></div>'
             f'<dl class="talao__linhas">' + ''.join(f'<div><dt>{e(a)}</dt><dd>{b}</dd></div>' for a, b in linhas) + f'</dl><p class="talao__pe">{e(pe)}</p></figure>')

    desc_extra = ''
    if baratos:
        pu, o, g = baratos[0]
        desc_extra = f' O mais barato por {UNIDADE[u]}: {g["n"]}, {eur(pu)}/{u} no {LOJAS[o["l"]]}.'
    descricao = f'Preços de {termo} hoje, {dia_l}, no Continente, Pingo Doce e Auchan: {len(gs)} produtos comparados e as promoções que são a sério.{desc_extra}'
    if len(descricao) > 160:
        descricao = descricao[:157].rsplit(' ', 1)[0] + '…'
    titulo = f'{nome} mais barato hoje: Continente, Pingo Doce e Auchan'
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'caiu.pt', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Preços', 'item': SITE + '/preco/'},
            {'@type': 'ListItem', 'position': 3, 'name': nome, 'item': url}]},
        {'@type': 'WebPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado, 'description': descricao}]}

    corpo = [cabeca(titulo, descricao, url, ld, D.dia), '<main id="conteudo">']
    corpo.append(f'''<section class="bloco pp-heroi"><div class="caixa">
<p class="pp-migalhas"><a href="/">caiu.pt</a> › <a href="/preco/">Preços</a> › {e(nome)}</p>
<h1>{e(nome)} mais barato hoje</h1>
<p class="lead">Preços de hoje, {dia_l}, no Continente, Pingo Doce e Auchan, e as promoções que são mesmo a sério.</p>
{talao}
<p class="pp-acoes"><a class="botao" href="/#q={e(urllib.parse.quote(termo))}">Comparar e fazer a lista</a></p>
</div></section>''')
    if baratos:
        extra = lambda pu, o: f'<span>{eur(pu)}/{u}</span>'
        corpo.append(f'''<section class="bloco pp-sec" aria-labelledby="t-unid"><div class="caixa">
<h2 id="t-unid">Mais barato por {UNIDADE[u]}</h2>
<p class="lead">Pelo preço por {UNIDADE[u]} que cada loja indica.</p>
<ol class="linhas">{"".join(linha(g, extra(pu, o)) for pu, o, g in baratos[:8])}</ol>
</div></section>''')
    if reais:
        corpo.append(f'''<section class="bloco bloco--reais pp-sec" aria-labelledby="t-reais"><div class="caixa">
<h2 id="t-reais">Desceram a sério</h2>
<p class="lead">Hoje mais baratos do que em qualquer dia do último mês.</p>
<ul class="etiquetas">{"".join(cartao(g) for g in reais[:6])}</ul>
</div></section>''')
    if fach:
        corpo.append(f'''<section class="bloco pp-sec" aria-labelledby="t-fachada"><div class="caixa">
<h2 id="t-fachada">Promoções que enganam</h2>
<p class="lead">Em promoção, mas há melhor preço noutra loja ou já esteve assim há pouco.</p>
<ul class="etiquetas">{"".join(cartao(g) for g in fach[:6])}</ul>
</div></section>''')
    corpo.append(f'''<section class="bloco pp-sec" aria-labelledby="t-todos"><div class="caixa">
<h2 id="t-todos">Todos os produtos ({len(gs)})</h2>
<p class="lead">Primeiro os que estão à venda em mais lojas. Toca num para ver o histórico e seguir o preço.</p>
<ol class="linhas">{"".join(linha(g) for g in gs[:30])}</ol>
{f'<p class="pp-acoes"><a class="botao botao--leve" href="/#q={e(urllib.parse.quote(termo))}">Ver os {len(gs)} no comparador</a></p>' if len(gs) > 30 else ''}
</div></section>''')
    if irmaos:
        corpo.append(f'''<section class="bloco pp-sec" aria-labelledby="t-mais"><div class="caixa">
<h2 id="t-mais">Mais preços de {e(sec.lower() if not sec.startswith('Marcas') else 'marcas')}</h2>
<ul class="pp-rel">{"".join(f'<li><a href="/preco/{slug(t)}/">{e(titulo_termo(t))}</a></li>' for t in irmaos)}</ul>
</div></section>''')
    corpo.append(METODO)
    corpo.append('</main>')
    corpo.append(rodape(D.dia, hora))
    return s, '\n'.join(corpo)


def pagina_indice(D, secoes, hora):
    url = SITE + '/preco/'
    titulo = 'Preços do supermercado hoje: Continente, Pingo Doce e Auchan'
    n = sum(len(v) for v in secoes.values())
    descricao = f'Os preços de hoje de {n} produtos do Continente, Pingo Doce e Auchan, do azeite ao detergente, e as promoções que são a sério.'
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'caiu.pt', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Preços', 'item': url}]},
        {'@type': 'CollectionPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado}]}
    blocos = ''.join(
        f'<h2>{e(sec)}</h2><ul class="pp-rel">' + ''.join(f'<li><a href="/preco/{slug(t)}/">{e(titulo_termo(t))}<small>{c}</small></a></li>' for t, c in itens) + '</ul>'
        for sec, itens in secoes.items())
    return '\n'.join([cabeca(titulo, descricao, url, ld, D.dia), f'''<main id="conteudo">
<section class="bloco pp-heroi pp-indice"><div class="caixa">
<p class="pp-migalhas"><a href="/">caiu.pt</a> › Preços</p>
<h1>Preços do supermercado hoje</h1>
<p class="lead">Os preços de hoje, {data_longa(D.dia)}, de {n} produtos do dia a dia no Continente, Pingo Doce e Auchan. Atualizamos três vezes por dia. O número ao lado diz quantos produtos comparamos em cada um.</p>
{blocos}
</div></section>
{METODO}
</main>''', rodape(D.dia, hora)])


# ---------- promoções da semana por loja e «qual é o supermercado mais barato» ----------
SLUG_LOJA = {'c': 'continente', 'p': 'pingo-doce', 'a': 'auchan'}
DIAS_SEMANA = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']


def desconto(o):
    """Desconto em relação ao preço anterior (ou ao PVPR, se não houver), de 0 a 1."""
    ref = o['a'] if o['a'] and o['a'] > o['p'] else (o['r'] if o['r'] and o['r'] > o['p'] else None)
    return (ref - o['p']) / ref if ref else 0.0


def promos_loja(D, l):
    """[(g, o)] das promoções da loja l, com o = a oferta dessa loja."""
    res = []
    for i, a in D.P.g.items():
        if any(x[0] == l and x[8] for x in a[7]):
            g = D.g(i)
            res.append((g, next(o for o in g['o'] if o['l'] == l)))
    return res


def fim_promocoes(pares, dia):
    """Dia em que acaba a maioria das promoções («Promoção até 16/11»), se a loja o indicar."""
    c = Counter()
    for _, o in pares:
        m = re.search(r'até (\d{1,2})/(\d{1,2})|a (\d{1,2})/(\d{1,2})/\d{4}', o['t'] or '')
        if m:
            d, mes = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
            c[(int(d), int(mes))] += 1
    if not c:
        return None, 0
    (d, mes), n = c.most_common(1)[0]
    if n < 0.4 * len(pares):
        return None, 0
    try:
        ano = int(dia[:4]) + (1 if int(dia[5:7]) == 12 and mes == 1 else 0)
        semana = DIAS_SEMANA[datetime(ano, mes, d).weekday()]
    except ValueError:
        return None, 0
    return f'{semana}, {d} de {MESES[mes - 1]}', n


def no_dia(fim):
    """«no sábado, 15 de novembro» / «na segunda-feira, 17 de novembro»"""
    return ('no ' if fim.startswith(('sábado', 'domingo')) else 'na ') + fim


def talao_html(nome, hora, linhas_t, pe):
    return (f'<figure class="talao" aria-label="Resumo de hoje"><div class="talao__cab"><strong>{e(nome)} · hoje</strong><span>às {hora}</span></div>'
            '<dl class="talao__linhas">' + ''.join(f'<div><dt>{e(a)}</dt><dd>{b}</dd></div>' for a, b in linhas_t)
            + f'</dl><p class="talao__pe">{e(pe)}</p></figure>')


def curta(d):
    return d if len(d) <= 160 else d[:157].rsplit(' ', 1)[0] + '…'


def migalhas_ld(*itens):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': k + 1, 'name': n, 'item': u} for k, (n, u) in enumerate(itens)]}


def bloco_cartoes(ident, tit, lead, itens, classe=''):
    if not itens:
        return ''
    return (f'<section class="bloco pp-sec{classe}" aria-labelledby="t-{ident}"><div class="caixa">\n'
            f'<h2 id="t-{ident}">{tit}</h2>\n<p class="lead">{lead}</p>\n'
            f'<ul class="etiquetas">{"".join(cartao(g, o) for g, o in itens)}</ul>\n</div></section>')


def pagina_loja(D, l, pares, hora):
    nome = LOJAS[l]
    url = f'{SITE}/promocoes/{SLUG_LOJA[l]}/'
    dia_l = data_longa(D.dia)
    reais = sorted((p for p in pares if p[1]['v'] == 'real'), key=lambda p: -desconto(p[1]))
    fach = sorted((p for p in pares if p[1]['v'] == 'fachada'), key=lambda p: -sum(1 for m in p[1]['m'] if m[0] == 'outra'))
    pvpr = [p for p in pares if p[1]['v'] == 'pvpr']
    maiores = sorted((p for p in pares if p[1]['v'] in ('promo', 'real') and desconto(p[1]) > 0), key=lambda p: -desconto(p[1]))
    todas = sorted(pares, key=lambda p: ({'real': 0, 'promo': 1, 'fachada': 2, 'pvpr': 3}.get(p[1]['v'], 4), -desconto(p[1])))
    fim, nfim = fim_promocoes(pares, D.dia)
    linhas_t = [('Produtos em promoção', str(len(pares))), ('Desceram a sério', str(len(reais))),
                ('Mais baratos noutra loja', str(len(fach)))]
    if pvpr:
        linhas_t.append(('Desconto sobre o PVPR', str(len(pvpr))))
    pe = f'{nfim} destas promoções acabam {no_dia(fim)}.' if fim else 'Verificamos todas as promoções três vezes por dia.'
    titulo = f'Promoções {nome} esta semana: as que são a sério | caiu.pt'
    descricao = curta(f'As {len(pares)} promoções do {nome} hoje, {dia_l}: {len(reais)} desceram a sério e {len(fach)} são mais baratas '
                      'noutra loja. Verificamos três vezes por dia.')
    ld = {'@context': 'https://schema.org', '@graph': [
        migalhas_ld(('caiu.pt', SITE + '/'), ('Promoções', SITE + '/promocoes/'), (nome, url)),
        {'@type': 'WebPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado, 'description': descricao}]}
    vistos = {g['i'] for g, _ in reais[:12]}
    outras = [x for x in LOJAS if x != l]
    rel = ''.join(f'<li><a href="/promocoes/{SLUG_LOJA[x]}/">Promoções {LOJAS[x]}</a></li>' for x in outras)
    linhas_todas = ''.join(linha(g, f'<span>−{round(desconto(o) * 100)} %</span>' if desconto(o) >= 0.01 else '', o) for g, o in todas[:80])
    corpo = [
        cabeca(titulo, descricao, url, ld, D.dia), '<main id="conteudo">',
        '<section class="bloco pp-heroi"><div class="caixa">',
        f'<p class="pp-migalhas"><a href="/">caiu.pt</a> › <a href="/promocoes/">Promoções</a> › {e(nome)}</p>',
        f'<h1>Promoções do {e(nome)} esta semana</h1>',
        f'<p class="lead">As promoções da loja online do {e(nome)} hoje, {dia_l}, verificadas uma a uma: quais descem mesmo de preço, '
        'quais estão mais baratas noutra loja e quais são só desconto sobre o PVPR.</p>',
        talao_html(nome, hora, linhas_t, pe),
        '<p class="pp-acoes"><a class="botao" href="/">Comparar e fazer a lista</a></p>',
        '</div></section>',
        bloco_cartoes('reais', 'Desceram a sério', 'Hoje mais baratos do que em qualquer dia do último mês.', reais[:12], ' bloco--reais'),
        bloco_cartoes('maiores', 'Os maiores descontos', 'Em relação ao preço a que a loja vendia antes da promoção.',
                      [p for p in maiores if p[0]['i'] not in vistos][:12]),
        bloco_cartoes('fachada', 'Em promoção, mas mais barato noutra loja',
                      'O mesmo produto custa menos noutra loja, ou já esteve a este preço há pouco.', fach[:12]),
        '<section class="bloco pp-sec" aria-labelledby="t-todas"><div class="caixa">',
        f'<h2 id="t-todas">Todas as promoções ({len(pares)})</h2>',
        '<p class="lead">Primeiro as que descem mesmo de preço, depois as de maior desconto. Toca numa para ver o histórico e seguir o preço.</p>',
        f'<ol class="linhas">{linhas_todas}</ol>',
        '</div></section>',
        '<section class="bloco pp-sec" aria-labelledby="t-outras"><div class="caixa">',
        '<h2 id="t-outras">Promoções noutras lojas</h2>',
        f'<ul class="pp-rel">{rel}<li><a href="/supermercado-mais-barato/">Qual é o mais barato?</a></li><li><a href="/preco/">Preços por produto</a></li></ul>',
        '</div></section>',
        METODO, '</main>', rodape(D.dia, hora)]
    return '\n'.join(x for x in corpo if x)


def pagina_promocoes(D, por_loja, hora):
    url = SITE + '/promocoes/'
    dia_l = data_longa(D.dia)
    total = sum(len(v) for v in por_loja.values())
    reais = sum(1 for v in por_loja.values() for p in v if p[1]['v'] == 'real')
    titulo = 'Promoções da semana: Continente, Pingo Doce e Auchan | caiu.pt'
    descricao = curta(f'{total} promoções do Continente, Pingo Doce e Auchan verificadas hoje, {dia_l}: {reais} descem mesmo de preço. '
                      'Vê quais são a sério em cada loja.')
    ld = {'@context': 'https://schema.org', '@graph': [
        migalhas_ld(('caiu.pt', SITE + '/'), ('Promoções', url)),
        {'@type': 'CollectionPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado, 'description': descricao}]}
    corpo = [cabeca(titulo, descricao, url, ld, D.dia), '<main id="conteudo">',
             '<section class="bloco pp-heroi"><div class="caixa">',
             '<p class="pp-migalhas"><a href="/">caiu.pt</a> › Promoções</p>',
             '<h1>Promoções da semana nos supermercados</h1>',
             f'<p class="lead">Hoje, {dia_l}, verificámos {total} promoções nas lojas online do Continente, Pingo Doce e Auchan. '
             'Uma promoção só é «a sério» se o preço estiver abaixo de todos os do último mês.</p>',
             '</div></section>']
    for l, pares in por_loja.items():
        top = sorted(pares, key=lambda p: ({'real': 0, 'promo': 1}.get(p[1]['v'], 2), -desconto(p[1])))[:4]
        nr = sum(1 for p in pares if p[1]['v'] == 'real')
        nf = sum(1 for p in pares if p[1]['v'] == 'fachada')
        fim, _ = fim_promocoes(pares, D.dia)
        corpo += [f'<section class="bloco pp-sec" aria-labelledby="t-{l}"><div class="caixa">',
                  f'<h2 id="t-{l}">{LOJAS[l]}: {len(pares)} promoções</h2>',
                  f'<p class="lead">{nr} desceram a sério e {nf} estão mais baratas noutra loja.' + (f' A maioria acaba {no_dia(fim)}.' if fim else '') + '</p>',
                  f'<ul class="etiquetas">{"".join(cartao(g, o) for g, o in top)}</ul>',
                  f'<p class="pp-acoes"><a class="botao botao--leve" href="/promocoes/{SLUG_LOJA[l]}/">Ver as promoções do {LOJAS[l]}</a></p>',
                  '</div></section>']
    corpo += [METODO, '</main>', rodape(D.dia, hora)]
    return '\n'.join(corpo)


def pagina_mais_barato(D, hora):
    cz = D.R.get('cabaz') or {}
    tot = cz.get('totais') or {}
    if not cz.get('n') or len(tot) < 3:
        return None
    url = SITE + '/supermercado-mais-barato/'
    dia_l = data_longa(D.dia)
    ordem = sorted(tot, key=lambda l: tot[l])
    l1, l2, l3 = ordem
    titulo = f'Supermercado mais barato hoje: {LOJAS[l1]}, {LOJAS[l2]} ou {LOJAS[l3]}?'
    descricao = curta(f'Comparámos hoje, {dia_l}, {cz["n"]} produtos iguais nas três lojas. O {LOJAS[l1]} sai mais barato: '
                      f'{eur(tot[l3] - tot[l1])} menos do que o {LOJAS[l3]} no total.')
    perguntas = [('Qual é o supermercado mais barato em Portugal?',
                  f'Hoje, {dia_l}, nos {cz["n"]} produtos iguais à venda no Continente, Pingo Doce e Auchan online, o mais barato no total é '
                  f'o {LOJAS[l1]} ({eur(tot[l1])}), seguido do {LOJAS[l2]} ({eur(tot[l2])}) e do {LOJAS[l3]} ({eur(tot[l3])}). Muda de dia para dia.')]
    if cz.get('dividir'):
        perguntas.append(('Vale a pena dividir as compras por várias lojas?',
                          f'Se comprasses cada um destes produtos na loja onde está mais barato, pagavas {eur(cz["dividir"])}, '
                          f'menos {eur(tot[l1] - cz["dividir"])} do que tudo no {LOJAS[l1]}.'))
    ld = {'@context': 'https://schema.org', '@graph': [
        migalhas_ld(('caiu.pt', SITE + '/'), ('Supermercado mais barato', url)),
        {'@type': 'WebPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado, 'description': descricao},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': r}} for q, r in perguntas]}]}
    ind = cz.get('indice') or {}
    vence = cz.get('vence') or {}
    linhas_t = [(LOJAS[l], eur(tot[l])) for l in ordem]
    if cz.get('dividir'):
        linhas_t.append(('Cada um na loja mais barata', eur(cz['dividir'])))
    vtxt = ''
    if vence:
        vtxt = ('<p class="lead">Produto a produto, o mais barato foi o '
                + ', o '.join(f'{LOJAS[l]} em {vence[l]}' for l in sorted(vence, key=lambda l: -vence[l]))
                + ' dos produtos. Nenhuma loja é a mais barata em tudo.</p>')
    rel = ''.join(f'<li><a href="/promocoes/{SLUG_LOJA[x]}/">Promoções {LOJAS[x]}</a></li>' for x in LOJAS)
    corpo = [cabeca(titulo, descricao, url, ld, D.dia), '<main id="conteudo">',
             '<section class="bloco pp-heroi"><div class="caixa">',
             '<p class="pp-migalhas"><a href="/">caiu.pt</a> › Supermercado mais barato</p>',
             '<h1>Qual é o supermercado mais barato hoje?</h1>',
             f'<p class="lead">Comparámos os mesmos {cz["n"]} produtos (mesma marca e mesma embalagem) à venda nas lojas online do Continente, '
             f'Pingo Doce e Auchan, hoje, {dia_l}, já com as promoções do dia.</p>',
             talao_html(f'{cz["n"]} produtos iguais', hora, linhas_t,
                        ('Índice (100 = a mais barata): ' + ', '.join(f'{LOJAS[l]} {ind[l]}' for l in ordem if l in ind) + '.') if ind else 'Total dos mesmos produtos em cada loja.'),
             vtxt,
             '<p class="pp-acoes"><a class="botao" href="/">Somar a minha lista em cada loja</a></p>',
             '</div></section>',
             '<section class="bloco pp-sec" aria-labelledby="t-perg"><div class="caixa">',
             '<h2 id="t-perg">Perguntas</h2>',
             ''.join(f'<h3>{e(q)}</h3><p>{e(r)}</p>' for q, r in perguntas),
             '<p class="pp-nota">Só contam os produtos iguais nas três lojas, sem as marcas próprias, que não se podem comparar. '
             'Os preços são os das lojas online e não incluem descontos em cartão nem portes.</p>',
             '</div></section>',
             '<section class="bloco pp-sec" aria-labelledby="t-promos"><div class="caixa">',
             '<h2 id="t-promos">Promoções desta semana</h2>',
             f'<ul class="pp-rel">{rel}<li><a href="/preco/">Preços por produto</a></li></ul>',
             '</div></section>', METODO, '</main>', rodape(D.dia, hora)]
    return '\n'.join(x for x in corpo if x)


def main():
    pasta = sys.argv[1] if len(sys.argv) > 1 else 'dados'
    D = Dados(pasta)
    if not D.P.g:
        print('sem lista.json: nada a fazer')
        return
    try:
        hora = datetime.fromisoformat(D.atualizado).astimezone(ZoneInfo('Europe/Lisbon')).strftime('%H:%M')
    except ValueError:
        hora = ''
    termos = ler_termos()
    feitos = OrderedDict()  # secção -> [(termo, n)]
    gss = {}
    for sec, t in termos:
        gs = D.produtos(t, sec)
        if len(gs) >= MIN_PRODUTOS:
            gss[t] = (sec, gs)
            feitos.setdefault(sec, []).append((t, len(gs)))
    novo = os.path.join(pasta, 'paginas.novo')
    shutil.rmtree(novo, ignore_errors=True)
    os.makedirs(novo)
    for t, (sec, gs) in gss.items():
        irmaos = [x for x, _ in feitos[sec] if x != t][:24]
        s, doc = pagina_termo(D, sec, t, gs, irmaos, hora)
        os.makedirs(os.path.join(novo, s), exist_ok=True)
        with open(os.path.join(novo, s, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(doc)
    with open(os.path.join(novo, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(pagina_indice(D, feitos, hora))
    # promoções da semana por loja (/promocoes/<loja>/) e «qual é o mais barato» (/supermercado-mais-barato/)
    extra = []
    por_loja = OrderedDict((l, v) for l, v in ((l, promos_loja(D, l)) for l in LOJAS) if v)
    if por_loja:
        os.makedirs(os.path.join(novo, 'promocoes'))
        with open(os.path.join(novo, 'promocoes', 'index.html'), 'w', encoding='utf-8') as f:
            f.write(pagina_promocoes(D, por_loja, hora))
        extra.append(SITE + '/promocoes/')
        for l, pares in por_loja.items():
            os.makedirs(os.path.join(novo, 'promocoes', SLUG_LOJA[l]))
            with open(os.path.join(novo, 'promocoes', SLUG_LOJA[l], 'index.html'), 'w', encoding='utf-8') as f:
                f.write(pagina_loja(D, l, pares, hora))
            extra.append(f'{SITE}/promocoes/{SLUG_LOJA[l]}/')
    mb = pagina_mais_barato(D, hora)
    if mb:
        os.makedirs(os.path.join(novo, 'supermercado-mais-barato'))
        with open(os.path.join(novo, 'supermercado-mais-barato', 'index.html'), 'w', encoding='utf-8') as f:
            f.write(mb)
        extra.append(SITE + '/supermercado-mais-barato/')
    urls = [SITE + '/preco/'] + [f'{SITE}/preco/{slug(t)}/' for t in gss]
    # sitemap de todo o site (servido em /sitemap.xml): início, promoções, mais barato e preços
    with open(os.path.join(novo, 'sitemap-raiz.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + ''.join(f'  <url><loc>{u}</loc><lastmod>{D.dia}</lastmod><changefreq>daily</changefreq></url>\n' for u in [SITE + '/'] + extra + urls)
                + '</urlset>\n')
    with open(os.path.join(novo, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + ''.join(f'  <url><loc>{u}</loc><lastmod>{D.dia}</lastmod><changefreq>daily</changefreq></url>\n' for u in urls)
                + '</urlset>\n')
    # troca de uma vez (o Caddy serve sempre uma pasta completa)
    final = os.path.join(pasta, 'paginas')
    velho = os.path.join(pasta, 'paginas.velho')
    shutil.rmtree(velho, ignore_errors=True)
    if os.path.isdir(final):
        os.rename(final, velho)
    os.rename(novo, final)
    shutil.rmtree(velho, ignore_errors=True)
    print(json.dumps({'paginas': len(gss), 'dia': D.dia, 'secoes': {k: len(v) for k, v in feitos.items()}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
