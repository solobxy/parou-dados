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


def linha(g, extra=''):
    ordem = sorted(g['o'], key=lambda o: o['p'])
    lojas = ''.join(f'<span class="{"melhor" if destaca(g, o) else ""}">{LOJAS[o["l"]]} <b>{eur(o["p"])}</b></span>' for o in ordem)
    carimbo = f'<span class="carimbo carimbo--{g["v"]} carimbo--fixo">{CARIMBO[g["v"]]}</span>' if g['v'] in CARIMBO else ''
    return (f'<li class="ln">{img_html(g, "ln__img", 64)}'
            f'<p class="ln__nome"><a href="/#p={e(g["i"])}">{e(g["n"])}</a></p>{preco_html(g["min"])}'
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


def cartao(g):
    o = next((x for x in g['o'] if x['v'] == g['v']), g['o'][0])
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
.pp-heroi h1{{margin:0 0 10px}}
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
</style>
<script defer src="/_e.js" data-site="caiu"></script>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, separators=(",", ":"))}</script>
</head>
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="topo__in">
    <a class="marca" href="/" aria-label="caiu.pt, início"><span class="marca__txt" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</span></a>
    <nav class="topo__nav" aria-label="Atalhos"><a class="topo__link" href="/preco/">Todos os preços</a><a class="topo__link" href="/">Pesquisar</a></nav>
  </div>
</header>
'''


def rodape(dia, hora):
    return f'''<footer class="rodape">
  <div class="caixa rodape__in">
    <p class="rodape__marca" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</p>
    <p class="rodape__dados">Preços recolhidos a {data_longa(dia)}, às {hora}, nas lojas online do Continente, Pingo Doce e Auchan. Podem mudar durante o dia e ser diferentes na loja física ou com cartão de cliente. O caiu.pt não tem ligação a estas lojas.</p>
    <p class="rodape__links"><a href="/preco/">Preços por produto</a> · <a href="/#avisos">Avisos de preço</a> · <a href="/privacidade.html">Privacidade</a></p>
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
    urls = [SITE + '/preco/'] + [f'{SITE}/preco/{slug(t)}/' for t in gss]
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
