"""caiu.pt — páginas para quem procura no Google e nas respostas de IA, feitas com os preços recolhidos.

Uso: python3 paginas.py <pasta_dados>
Lê <pasta_dados>/lista.json, resumo.json e h/<id>.json (escritos por recolher.py; historico.db só para ler) e escreve
<pasta_dados>/paginas/ com o mesmo caminho que têm no site (o Caddy serve esta pasta tal como está):
  preco/                 índice e uma página por pesquisa de termos.txt com produtos suficientes (/preco/<termo>/)
  produto/<slug>/        uma página por produto com dados que chegam (2+ lojas, ou 7+ dias de registos com mudança
                         de preço ou promoção): preço em cada loja, mínimo de 30 dias, histórico e se a promoção é a sério
  promocoes/             promoções da semana, no geral e por loja
  supermercado-mais-barato/, cabaz-mais-barato/ (com historico.csv)
  estudos/               estudos do mês, só quando há dados para os fazer (ver estudo_mes)
  sitemap.xml            índice dos sitemaps (sitemap-paginas.xml e sitemap-produtos.xml)
Guarda em <pasta_dados>/estado-paginas.json o endereço de cada produto (não muda de uma recolha para a outra)
e em estado-estudos.json os números de cada dia que os estudos usam.
Corre depois de cada recolha (caiu-recolha.service) e quando este ficheiro muda (servidor/atualizar.sh).
Os produtos de cada página de termo são os da pesquisa do site, só os que são mesmo daquele produto (o «sal» não traz salsichas).
"""
import html, json, os, re, shutil, sqlite3, sys, urllib.parse
from collections import Counter, OrderedDict
from datetime import date, datetime, timedelta
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
MESES_C = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']
ESTILO_V = '5'      # estilo.css (o mesmo do início)
PAGINAS_V = '1'     # paginas.css (só destas páginas)
ORG = {'@type': 'Organization', '@id': SITE + '/#organizacao', 'name': 'caiu.pt', 'url': SITE + '/', 'logo': SITE + '/icone-512.png'}
WEBSITE = {'@type': 'WebSite', '@id': SITE + '/#site', 'name': 'caiu.pt', 'url': SITE + '/', 'inLanguage': 'pt-PT',
           'publisher': {'@id': SITE + '/#organizacao'}}
# produtos: quando há página e quando entra no Google
DIAS_MIN = 7          # com uma loja só: pelo menos 7 dias de registos (e o preço mudou ou está em promoção)
DIAS_GRACA = 7        # produto que deixou de aparecer nas pesquisas: a página fica com o último preço visto
DIAS_FICA = 14        # depois de cumprir, continua no Google 14 dias mesmo que deixe de cumprir (não entra e sai)
DIAS_ALIAS = 120      # endereço antigo de um produto que passou a ter outro: reencaminha durante 120 dias

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


def termo_frase(sec_t):
    """Termo para usar a meio de uma frase: marcas com maiúscula («Finish»), produtos não («azeite»)."""
    sec, t = sec_t
    return titulo_termo(t) if sec.startswith('Marcas') else t


def data_longa(iso_dia):
    a, m, d = iso_dia.split('-')
    return f'{int(d)} de {MESES[int(m) - 1]}'


def data_ano(iso_dia):
    return f'{data_longa(iso_dia)} de {iso_dia[:4]}'


def data_curta(iso_dia):
    return f'{int(iso_dia[8:10])} {MESES_C[int(iso_dia[5:7]) - 1]}'


def intervalo(a, b):
    """«9 a 12 de novembro» ou «28 de outubro a 2 de novembro»"""
    return f'{int(a[8:10])} a {data_longa(b)}' if a[:7] == b[:7] else f'{data_longa(a)} a {data_longa(b)}'


def dia_mais(iso_dia, n):
    return (date.fromisoformat(iso_dia) + timedelta(days=n)).isoformat()


def dias_entre(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def palavras_n(t):
    return len(re.sub(r'<[^>]+>', ' ', t).split())


# ---------- dados ----------
class Dados:
    def __init__(self, pasta):
        self.pasta = pasta
        self.P = C.Produtos(pasta)
        self.P.atualizar()
        with open(os.path.join(pasta, 'resumo.json'), encoding='utf-8') as f:
            self.R = json.load(f)
        self.img = self.R.get('img') or []
        self.dia = self.P.dia or self.R.get('dia', '')
        self.atualizado = self.R.get('atualizado', '')
        self.base = self.R.get('base') or {'c': 'https://www.continente.pt', 'p': 'https://www.pingodoce.pt', 'a': 'https://www.auchan.pt'}
        self._h = {}

    def hist(self, i):
        """Histórico de preços de um produto de hoje: {loja: [[dia, preço, antes, pvpr], ...]} (vazio se não houver)."""
        if i not in self._h:
            try:
                with open(os.path.join(self.pasta, 'h', i + '.json'), encoding='utf-8') as f:
                    self._h[i] = {l: v for l, v in json.load(f).items() if v}
            except (OSError, ValueError):
                self._h[i] = {}
        return self._h[i]

    def img_url(self, s):
        if not s:
            return ''
        k = s.find('|')
        if 0 < k < 3 and s[:k].isdigit() and int(s[:k]) < len(self.img):
            return self.img[int(s[:k])] + s[k + 1:] + '?sw=240&sh=240&sm=fit'
        return s if s.startswith('https://') else ''

    def g(self, i):
        a = self.P.g[i]
        o = [{'l': x[0], 'id': x[1], 'p': x[2], 'pu': x[3], 'u': x[4], 'a': x[5], 'r': x[6], 't': x[7], 'v': x[8], 'm': x[9] or [],
              'url': x[10] or '', 'd': x[11]} for x in a[7]]
        return {'i': a[0], 'n': a[1], 'm': a[2], 'q': a[3], 'c': a[4], 'img': self.img_url(a[5]), 'v': a[6], 'o': o, 'min': min(x['p'] for x in o)}

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
URLS = {}  # id do produto de hoje -> /produto/<slug>/ (preenchido em main, antes de fazer as páginas)


def href(g):
    """Para onde vai o nome de um produto: a página dele, se tiver, ou a folha do produto no comparador."""
    return URLS.get(g['i']) or f'/#p={urllib.parse.quote(g["i"])}'

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
            f'<p class="ln__nome"><a href="{e(href(g))}">{e(g["n"])}</a></p>{preco_html(o_loja["p"] if o_loja else g["min"])}'
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
    return (f'<li class="et"><div class="et__cab">{img_html(g, "et__img", 84)}<div><h3 class="et__nome"><a href="{e(href(g))}">{e(g["n"])}</a></h3>'
            f'<p class="et__q">{e(qtd_texto(g["q"]))}</p></div></div>'
            + (f'<span class="carimbo carimbo--{o["v"]} carimbo--fixo">{CARIMBO[o["v"]]}</span>' if o['v'] in CARIMBO else '')
            + f'<div class="et__fita"><div class="et__loja">{LOJAS[o["l"]]}{f"<small>{tag}</small>" if tag else ""}</div>{preco_html(o["p"])}</div>'
            + (f'<ul class="et__outras">{out}</ul>' if out else '')
            + f'<p class="et__motivo">{e(motivo(o))}</p></li>')


def cabeca(titulo, descricao, url, ld, dia, robots='', og='website'):
    """<head> e topo comuns. ld: dicionário JSON-LD com @graph; junta-lhe a organização e o site."""
    if '@graph' in ld:
        ld = dict(ld, **{'@graph': ld['@graph'] + [ORG, WEBSITE]})
    meta_robots = f'\n<meta name="robots" content="{robots}">' if robots else ''
    ld_txt = json.dumps(ld, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return f'''<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">{meta_robots}
<meta name="theme-color" content="#FFD83D">
<meta name="color-scheme" content="light">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="{og}">
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
<link rel="stylesheet" href="/paginas.css?v={PAGINAS_V}">
<script defer src="/_e.js" data-site="caiu"></script>
<script type="application/ld+json">{ld_txt}</script>
</head>
<body>
<a class="saltar" href="#conteudo">Saltar para o conteúdo</a>
<header class="topo">
  <div class="topo__in">
    <a class="marca" href="/"><span class="sr">caiu.pt, início</span><span class="marca__txt" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</span></a>
    <nav class="topo__nav" aria-label="Atalhos"><a class="topo__link" href="/promocoes/">Promoções</a><a class="topo__link" href="/cabaz-mais-barato/">Cabaz</a><a class="topo__link" href="/preco/">Preços</a></nav>
  </div>
</header>
'''


def rodape(dia, hora):
    return f'''<footer class="rodape">
  <div class="caixa rodape__in">
    <p class="rodape__marca" aria-hidden="true">ca<span class="marca__i">ı<span class="marca__ponto"></span></span>u</p>
    <p class="rodape__dados">Preços recolhidos a <time datetime="{dia}">{data_longa(dia)}</time>{f", às <time>{hora}</time>" if hora else ""}, nas lojas online do Continente, Pingo Doce e Auchan. Podem mudar durante o dia e ser diferentes na loja física ou com cartão de cliente. O caiu.pt não tem ligação a estas lojas.</p>
    <p class="rodape__links"><a href="/promocoes/">Promoções da semana</a> · <a href="/cabaz-mais-barato/">Cabaz mais barato</a> · <a href="/supermercado-mais-barato/">Supermercado mais barato</a> · <a href="/preco/">Preços por produto</a> · <a href="/#avisos">Avisos de preço</a> · <a href="/privacidade.html">Privacidade</a></p>
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
    descricao = curta(f'Preços de {termo} hoje, {dia_l}, no Continente, Pingo Doce e Auchan: {len(gs)} produtos comparados e as promoções que são a sério.{desc_extra}')
    titulo = f'{nome} mais barato hoje: Continente, Pingo Doce e Auchan'
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'caiu.pt', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Preços', 'item': SITE + '/preco/'},
            {'@type': 'ListItem', 'position': 3, 'name': nome, 'item': url}]},
        {'@type': 'WebPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado, 'description': descricao}]}

    resto = [g for g in gs[30:] if g['i'] in URLS]
    mais_html = ''
    if resto:
        mais_html = (f'<h3>Mais {e(termo_frase((sec, termo)))} com histórico de preço</h3><ul class="pp-lista">'
                     + ''.join(f'<li><a href="{e(URLS[g["i"]])}">{e(g["n"])}</a> <span>{e(qtd_texto(g["q"]))} · {eur(g["min"])}</span></li>' for g in resto)
                     + '</ul>')
    corpo = [cabeca(titulo, descricao, url, ld, D.dia), '<main id="conteudo">']
    corpo.append(f'''<section class="bloco pp-heroi"><div class="caixa">
<p class="pp-migalhas"><a href="/">caiu.pt</a> › <a href="/preco/">Preços</a> › {e(nome)}</p>
<h1>{e(nome)} mais barato hoje</h1>
<p class="lead">Preços de hoje, <time datetime="{D.dia}">{dia_l}</time>, no Continente, Pingo Doce e Auchan, e as promoções que são mesmo a sério.</p>
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
{mais_html}{f'<p class="pp-acoes"><a class="botao botao--leve" href="/#q={e(urllib.parse.quote(termo))}">Ver os {len(gs)} no comparador</a></p>' if len(gs) > 30 else ''}
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
    return d if len(d) <= 155 else d[:152].rsplit(' ', 1)[0] + '…'


def migalhas_ld(*itens):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': k + 1, 'name': n, 'item': u} for k, (n, u) in enumerate(itens)]}


def bloco_cartoes(ident, tit, lead, itens, classe=''):
    if not itens:
        return ''
    return (f'<section class="bloco pp-sec{classe}" aria-labelledby="t-{ident}"><div class="caixa">\n'
            f'<h2 id="t-{ident}">{tit}</h2>\n<p class="lead">{lead}</p>\n'
            f'<ul class="etiquetas">{"".join(cartao(g, o) for g, o in itens)}</ul>\n</div></section>')


def pagina_loja(D, l, pares, hora, ms=None):
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
        bloco_semana_loja(D, l, ms or {}),
        '<section class="bloco pp-sec" aria-labelledby="t-todas"><div class="caixa">',
        f'<h2 id="t-todas">Todas as promoções ({len(pares)})</h2>',
        '<p class="lead">Primeiro as que descem mesmo de preço, depois as de maior desconto. Toca numa para ver o histórico e seguir o preço.</p>',
        f'<ol class="linhas">{linhas_todas}</ol>',
        '</div></section>',
        '<section class="bloco pp-sec" aria-labelledby="t-outras"><div class="caixa">',
        '<h2 id="t-outras">Promoções noutras lojas</h2>',
        f'<ul class="pp-rel">{rel}<li><a href="/cabaz-mais-barato/">Cabaz mais barato esta semana</a></li><li><a href="/supermercado-mais-barato/">Qual é o mais barato?</a></li><li><a href="/preco/">Preços por produto</a></li></ul>',
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


# ---------- páginas por produto (/produto/<slug>/) ----------
LOJA_DB = {'c': 'continente', 'p': 'pingodoce', 'a': 'auchan'}
POR_UNID = {'kg': 'o quilo', 'L': 'o litro', 'un': 'a unidade', 'dose': 'a dose', 'rolo': 'o rolo', 'm': 'o metro', 'lavagem': 'a lavagem'}
TRACOS = {'c': '', 'p': '7 5', 'a': '2 4'}


def ler_json(f, padrao):
    try:
        with open(f, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return padrao


def gravar_json(f, obj):
    tmp = f + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, f)


def nome_qtd(n, q):
    """Nome com a embalagem, sem a repetir se o nome já a tem («Leite Mimosa 1 L» não fica «… 1 L 1 L»)."""
    qt = qtd_texto(q)
    if not qt or C.norm(qt).replace(' ', '') in C.norm(n).replace(' ', ''):
        return n
    return f'{n} {qt}'


def resumo_hist(h, hoje):
    """Números do histórico de um produto: dias com registo, se o preço mudou, a última mudança."""
    dias = sorted({r[0] for v in h.values() for r in v})
    mudou = any(len({round(r[1], 2) for r in v}) > 1 for v in h.values())
    ult = ''
    for v in h.values():
        for a, b in zip(v, v[1:]):
            if (round(a[1], 2), a[2], a[3]) != (round(b[1], 2), b[2], b[3]):
                ult = max(ult, b[0])
    return {'dias': len(dias), 'mudou': mudou, 'ultima': ult or (dias[0] if dias else hoje), 'inicio': dias[0] if dias else hoje}


def merece_pagina(g, rh):
    """Tem informação própria para uma página? Duas ou mais lojas, ou uma loja com 7+ dias de registos em que o preço
    mudou ou está em promoção. Os restantes (uma loja, preço sempre igual, sem promoção) ficam só no comparador."""
    if len({o['l'] for o in g['o']}) >= 2:
        return True
    return rh['dias'] >= DIAS_MIN and (rh['mudou'] or any(o['v'] or o['t'] or o['a'] or o['r'] for o in g['o']))


def slug_produto(g):
    s = slug(nome_qtd(g['n'] + ('' if not g['m'] or C.norm(g['m']) in C.norm(g['n']) else ' ' + g['m']), g['q']))
    if len(s) > 72:
        s = s[:72].rsplit('-', 1)[0]
    return s or 'produto'


def atribuir_enderecos(D, est, grupos, hoje):
    """Dá a cada produto de hoje com página um endereço que não muda: o mesmo produto (as mesmas ofertas das lojas)
    fica sempre com o endereço que teve da primeira vez. Se dois produtos se juntam, o endereço mais novo passa a
    reencaminhar para o mais antigo. grupos: [(g, rh, merece)]. Devolve {slug: (g, rh, merece)}."""
    K, S = est.setdefault('k', {}), est.setdefault('s', {})
    tomados, referidos = {}, {}

    def resolver(s):
        vistos = set()
        while s in S and S[s].get('alias') and s not in vistos:
            vistos.add(s)
            s = S[s]['alias']
        return s if s in S else None
    for g, rh, merece in sorted(grupos, key=lambda x: (-len(x[0]['o']), x[0]['i'])):
        chaves = [o['l'] + o['id'] for o in g['o']]
        antigos = sorted({resolver(K[k]) for k in chaves if k in K} - {None}, key=lambda s: (S[s].get('criado', hoje), s))
        livres = [s for s in antigos if s not in tomados]
        if livres:
            sl = livres[0]
        elif merece:
            base = slug_produto(g)
            sl, n = base, 1
            while sl in S or sl in tomados:
                sl = f'{base}-{g["i"].lower()}' + (f'-{n}' if n > 1 else '')
                n += 1
            S[sl] = {'criado': hoje}
        else:
            continue
        tomados[sl] = (g, rh, merece)
        for s in antigos:
            if s != sl:
                referidos.setdefault(s, sl)
        for k in chaves:
            K[k] = sl
        x = S[sl]
        x.pop('alias', None)
        x.update({'k': chaves, 'g': g['i'], 'n': g['n'], 'm': g['m'], 'q': g['q'], 'img': g['img'], 'visto': hoje})
        if merece:
            x['idx'] = hoje
    for s, alvo in referidos.items():
        if s not in tomados and not S[s].get('alias'):
            S[s]['alias'] = alvo
            S[s]['alias_desde'] = hoje
    # limpeza: reencaminhamentos velhos e produtos que não aparecem há mais de um ano
    for s in list(S):
        x = S[s]
        velho = (x.get('alias') and dias_entre(x.get('alias_desde', hoje), hoje) > DIAS_ALIAS) or \
            (not x.get('alias') and dias_entre(x.get('visto', hoje), hoje) > 365)
        if velho:
            del S[s]
    for k in [k for k, s in K.items() if s not in S]:
        del K[k]
    return tomados


def hist_db(pasta, chaves, desde):
    """Histórico e última oferta de cada loja, do historico.db (para produtos que não apareceram hoje)."""
    f = os.path.join(pasta, 'historico.db')
    if not os.path.exists(f):
        return {}, []
    try:
        db = sqlite3.connect(f'file:{f}?mode=ro', uri=True, timeout=15)
    except sqlite3.Error:
        return {}, []
    h, ofs = {}, []
    try:
        for k in chaves:
            l, pid = k[0], k[1:]
            if l not in LOJA_DB:
                continue
            rows = db.execute('select dia, preco, antes, pvpr, promo from precos where loja=? and id=? and dia>=? order by dia',
                              (LOJA_DB[l], pid, desde)).fetchall()
            if not rows:
                continue
            h[l] = [[r[0], r[1], r[2], r[3]] for r in rows]
            p = db.execute('select url, pun, un from produtos where loja=? and id=?', (LOJA_DB[l], pid)).fetchone() or ('', None, '')
            u = rows[-1]
            ofs.append({'l': l, 'id': pid, 'p': u[1], 'pu': None, 'u': p[2] or '', 'a': u[2], 'r': u[3], 't': u[4] or '', 'v': '', 'm': [],
                        'url': p[0] or '', 'd': len(rows), 'dia': u[0]})
    except sqlite3.Error:
        return {}, []
    finally:
        db.close()
    return h, ofs


def estat_loja(v, hoje):
    """Números de uma loja: hoje, mínimo e máximo dos 30 dias anteriores (com o dia), média e dias em promoção."""
    lim = dia_mais(hoje, -30)
    ant = [r for r in v if lim <= r[0] < hoje]
    tudo30 = [r for r in v if r[0] >= lim]
    out = {'n_ant': len(ant), 'n30': len(tudo30), 'promo30': sum(1 for r in tudo30 if r[2] or r[3])}
    if ant:
        mn = min(r[1] for r in ant)
        out['min'] = (mn, max(r[0] for r in ant if igual(r[1], mn)))
        mx = max(r[1] for r in ant)
        out['max'] = (mx, max(r[0] for r in ant if igual(r[1], mx)))
    if tudo30:
        out['media'] = sum(r[1] for r in tudo30) / len(tudo30)
    return out


def mudancas(h, n=8):
    """As últimas mudanças de preço: [(dia, loja, antes, depois)], mais recentes primeiro."""
    out = []
    for l, v in h.items():
        for a, b in zip(v, v[1:]):
            if not igual(a[1], b[1]):
                out.append((b[0], l, a[1], b[1]))
    return sorted(out, key=lambda x: (x[0], x[1]), reverse=True)[:n]


def grafico_svg(h, W, cls):
    """O mesmo gráfico da folha do produto no site (app.js, grafico), desenhado aqui para vir já no HTML."""
    series = [(c, h[c]) for c in 'cpa' if h.get(c)]
    dias = sorted({r[0] for _, v in series for r in v})
    if len(dias) < 2:
        return ''
    H, e_, d, t, b = 190, 44, 12, 12, 26
    estreito = W < 500
    passo, l0, tl = (W / 3, 0, 18) if estreito else (150, e_, 26)
    vals = [r[1] for _, v in series for r in v]
    mn, mx = min(vals), max(vals)
    if mx - mn < 0.1:
        mn, mx = mn - 0.1, mx + 0.1
    pos = {dia: k for k, dia in enumerate(dias)}
    x = lambda dia: e_ + pos[dia] / (len(dias) - 1) * (W - e_ - d)
    y = lambda v: t + (1 - (v - mn) / (mx - mn)) * (H - t - b)
    nf = lambda v: ('%.2f' % v).replace('.', ',')
    linhas = ''.join(
        '<polyline fill="none" stroke="#141414" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"'
        + (f' stroke-dasharray="{TRACOS[c]}"' if TRACOS[c] else '')
        + ' points="' + ' '.join(f'{x(r[0]):.1f},{y(r[1]):.1f}' for r in v) + '"/>' for c, v in series)
    leg = ''.join(
        f'<g transform="translate({l0 + k * passo:.0f},{H + 18})"><line x1="0" x2="{tl}" y1="-4" y2="-4" stroke="#141414" stroke-width="2.5"'
        + (f' stroke-dasharray="{TRACOS[c]}"' if TRACOS[c] else '') + f'/><text x="{tl + 6}" y="0">{LOJAS[c]}</text></g>'
        for k, (c, _) in enumerate(series))
    menor = min(((r[1], c, r[0]) for c, v in series for r in v), key=lambda z: (z[0], z[2]))
    rot = f'Preço desde {data_curta(dias[0])}: o mais baixo foi {eur(menor[0])} no {LOJAS[menor[1]]} a {data_curta(menor[2])}'
    return (f'<svg class="grafico {cls}" viewBox="0 0 {W} {H + 28}" role="img" aria-label="{e(rot)}">'
            f'<text x="{e_ - 8}" y="{y(mx) + 4:.1f}" text-anchor="end">{nf(mx)}</text>'
            f'<text x="{e_ - 8}" y="{y(mn) + 4:.1f}" text-anchor="end">{nf(mn)}</text>'
            f'<line x1="{e_}" x2="{W - d}" y1="{H - b + 6}" y2="{H - b + 6}" stroke="#D8D8D0" stroke-width="2"/>'
            f'<text x="{e_}" y="{H - 4}">{data_curta(dias[0])}</text><text x="{W - d}" y="{H - 4}" text-anchor="end">{data_curta(dias[-1])}</text>'
            f'<g class="pr-linhas">{linhas}</g><g class="legenda">{leg}</g></svg>')


def frase_promo(o):
    """Uma frase a dizer se a promoção desta loja é a sério."""
    L = LOJAS[o['l']]
    ms = {m[0]: m for m in o['m']}
    if o['v'] == 'real' and 'min30' in ms:
        return f'A promoção do {L} é a sério: está abaixo de todos os preços dos {ms["min30"][2]} dias anteriores.'
    if o['v'] == 'fachada':
        if 'outra' in ms:
            outra = {'continente': 'Continente', 'pingodoce': 'Pingo Doce', 'auchan': 'Auchan'}.get(ms['outra'][1], ms['outra'][1])
            return f'A promoção do {L} engana: no {outra} o mesmo produto está mais barato, a {eur(ms["outra"][2])}.'
        if 'igual' in ms:
            return f'A promoção do {L} não é o preço mais baixo do mês: nos últimos 30 dias já esteve a {eur(ms["igual"][1])}.'
        if 'antes' in ms:
            return f'O preço riscado do {L} ({eur(ms["antes"][1])}) não aparece nos nossos registos dos últimos {ms["antes"][3]} dias.'
    if o['v'] == 'pvpr' and 'pvpr' in ms:
        return f'O desconto do {L} é sobre o PVPR de {eur(ms["pvpr"][1])}, o preço recomendado pela marca, e não sobre o preço a que vendia.'
    if o['v'] or o['t'] or o['a'] or o['r']:
        return f'Está em promoção no {L}, mas ainda não temos dias de registos suficientes para dizer se é a sério.'
    return ''


def lista_lojas(ls):
    """['c','p','a'] -> «no Continente, no Pingo Doce e no Auchan»"""
    n = [f'no {LOJAS[l]}' for l in ls]
    return n[0] if len(n) == 1 else ', '.join(n[:-1]) + ' e ' + n[-1]


def precos_lojas(ofs):
    """«1,64 € no Continente e no Auchan, 1,69 € no Pingo Doce» (lojas com o mesmo preço juntas)."""
    por = OrderedDict()
    for o in sorted(ofs, key=lambda o: o['p']):
        por.setdefault(round(o['p'], 2), []).append(o['l'])
    return ', '.join(f'{eur(p)} {lista_lojas(ls)}' for p, ls in por.items())


def resposta_produto(P, hoje):
    """Resposta direta no topo da página (40 a 60 palavras): onde está mais barato hoje, quanto custa nas outras lojas,
    se a promoção é a sério e o mais baixo dos 30 dias anteriores. Só com números do dia."""
    nome = P['nome']
    ofs = sorted(P['ofs'], key=lambda o: o['p'])
    dia = data_longa(hoje)
    f1 = ''
    f2 = ''
    if not P['presente']:
        o = ofs[0]
        f1 = (f'{nome}: não o encontrámos nas pesquisas de hoje, {dia}, nas lojas online. '
              f'O último preço que vimos foi {eur(o["p"])} no {LOJAS[o["l"]]}, a {data_longa(o["dia"])}.')
    elif len(ofs) >= 2:
        mn = ofs[0]['p']
        emp = [o for o in ofs if igual(o['p'], mn)]
        resto = [o for o in ofs if not igual(o['p'], mn)]
        nomes = lista_lojas([o['l'] for o in emp])
        if not resto:
            f1 = f'{nome}: hoje, {dia}, custa o mesmo {nomes}: {eur(mn)}.'
        else:
            f1 = f'{nome}: hoje, {dia}, está mais barato {nomes}, a {eur(mn)}.'
            f2 = 'No ' + ' e no '.join(f'{LOJAS[o["l"]]} custa {eur(o["p"])}' for o in resto) + '.'
    else:
        o = ofs[0]
        outras = [LOJAS[l] for l in LOJAS if l != o['l']]
        f1 = f'{nome}: hoje, {dia}, custa {eur(o["p"])} no {LOJAS[o["l"]]}.'
        f2 = f'Nas pesquisas de hoje não o encontrámos no {outras[0]} nem no {outras[1]}.'
    # promoção
    fp = ''
    if P['presente']:
        com = [o for o in ofs if o['v'] or o['t'] or o['a'] or o['r']]
        ordem = {'fachada': 0, 'real': 1, 'pvpr': 2, 'promo': 3, '': 4}
        if com:
            fp = frase_promo(sorted(com, key=lambda o: (ordem.get(o['v'], 4), o['p']))[0])
        else:
            fp = 'Hoje não está em promoção em nenhuma das lojas.' if len(ofs) > 1 else 'Hoje não está em promoção.'
    # histórico
    fh = ''
    ant = [(r[1], l, r[0]) for l, v in P['h'].items() for r in v if dia_mais(hoje, -30) <= r[0] < hoje]
    if ant:
        n = len({a[2] for a in ant})
        mn = min(a[0] for a in ant)
        d_mn = max(a[2] for a in ant if igual(a[0], mn))
        ls_mn = [l for l in 'cpa' if any(a[1] == l and a[2] == d_mn and igual(a[0], mn) for a in ant)]
        nd = f'{n} dias anteriores' if n > 1 else 'dia anterior'
        if P['presente'] and ofs[0]['p'] < mn - 0.005:
            fh = f'É o preço mais baixo dos {nd} que temos registados.' if n > 1 else 'Está mais barato do que no dia anterior.'
        else:
            fh = f'Nos {nd}, o mais baixo foi {eur(mn)}, {lista_lojas(ls_mn)}, a {data_longa(d_mn)}.' if n > 1 else \
                f'No dia anterior, o mais baixo foi {eur(mn)}, {lista_lojas(ls_mn)}.'
    elif P['h']:
        fh = f'Começámos a registar o preço a {data_longa(min(r[0] for v in P["h"].values() for r in v))}.'
    fu = ''
    o = ofs[0]
    if P['presente'] and o.get('pu') and o.get('u') in POR_UNID:
        fu = f'No {LOJAS[o["l"]]} fica a {eur(o["pu"])} {POR_UNID[o["u"]]}.'
    fx = 'Verificamos os preços nas lojas online três vezes por dia.'
    partes = [f1, f2, fp, fh, fu]
    texto = ' '.join(p for p in partes if p)
    for tira in (fu, f2, fh):  # longo demais: tira primeiro o menos importante
        if palavras_n(texto) <= 60:
            break
        if tira:
            partes = [p for p in partes if p != tira]
            texto = ' '.join(p for p in partes if p)
    if palavras_n(texto) < 40:
        texto += ' ' + fx
    if palavras_n(texto) < 40 and fu not in texto and fu:
        texto += ' ' + fu
    return texto


def titulo_produto(nome):
    for t in (f'{nome}: preço hoje e histórico', f'{nome}: preço hoje'):
        if len(t) <= 60:
            return t
    corte = nome[:47].rsplit(' ', 1)[0].rstrip(' ,.-–')
    return f'{corte}…: preço hoje'


def pagina_produto(D, P, hora, irmaos):
    """P: {'slug','gid','nome','n','m','q','img','ofs','h','presente','termo':(sec, termo)|None,'indexavel'}"""
    hoje = D.dia
    if P['h'] is None:  # produto de hoje: o histórico lê-se agora (não ficam todos em memória)
        P = dict(P, h=D.hist(P['gid']))
        D._h.pop(P['gid'], None)
        P['ofs'] = [dict(o, dia=(P['h'].get(o['l']) or [[hoje]])[-1][0]) for o in P['ofs']]
    url = f'{SITE}/produto/{P["slug"]}/'
    nome = P['nome']
    ofs = sorted(P['ofs'], key=lambda o: o['p'])
    resposta = resposta_produto(P, hoje)
    resposta_html = e(resposta).replace(e(data_longa(hoje)), f'<time datetime="{hoje}">{data_longa(hoje)}</time>', 1)
    titulo = titulo_produto(nome)
    precos = precos_lojas(ofs)
    ant = [r[1] for v in P['h'].values() for r in v if dia_mais(hoje, -30) <= r[0] < hoje]
    if P['presente']:
        base_d = f'Preço hoje, {data_longa(hoje)}: {precos}.'
        mn_d = f' Mínimo dos 30 dias anteriores: {eur(min(ant))}.' if ant else ''
        cands = [base_d + mn_d + ' Histórico e se a promoção é a sério.', base_d + mn_d + ' Com histórico.', base_d + mn_d,
                 base_d + ' Histórico e se a promoção é a sério.', base_d]
        descricao = curta(next((d for d in cands if len(d) <= 155), base_d))
    else:
        descricao = curta(f'Último preço visto: {precos}. Histórico de preços no Continente, Pingo Doce e Auchan.')
    sec_t = P.get('termo')
    mig = [('caiu.pt', SITE + '/'), ('Preços', SITE + '/preco/')]
    if sec_t:
        mig.append((titulo_termo(sec_t[1]), f'{SITE}/preco/{slug(sec_t[1])}/'))
    mig.append((nome, url))
    graf = [migalhas_ld(*mig),
            {'@type': 'WebPage', '@id': url, 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'description': descricao,
             'dateModified': D.atualizado, 'isPartOf': {'@id': SITE + '/#site'}}]
    if P['presente']:
        prod = {'@type': 'Product', '@id': url + '#produto', 'name': nome, 'url': url}
        if P['img']:
            prod['image'] = P['img']
        if P['m']:
            prod['brand'] = {'@type': 'Brand', 'name': P['m']}
        prod['offers'] = {'@type': 'AggregateOffer', 'priceCurrency': 'EUR', 'lowPrice': '%.2f' % ofs[0]['p'],
                          'highPrice': '%.2f' % ofs[-1]['p'], 'offerCount': len(ofs),
                          'offers': [{'@type': 'Offer', 'price': '%.2f' % o['p'], 'priceCurrency': 'EUR',
                                      'url': (D.base.get(o['l'], '') + o['url']) if o['url'] else url,
                                      'seller': {'@type': 'Organization', 'name': LOJAS[o['l']]}} for o in ofs]}
        graf[1]['mainEntity'] = {'@id': url + '#produto'}
        graf.append(prod)
    ld = {'@context': 'https://schema.org', '@graph': graf}
    robots = '' if P['indexavel'] else 'noindex, follow'
    mig_html = ' › '.join(f'<a href="{e(u.replace(SITE, "") or "/")}">{e(n)}</a>' for n, u in mig[:-1]) + f' › {e(nome)}'

    # lojas (como a folha do produto do site)
    lojas_html = []
    min_g = ofs[0]['p']
    for o in ofs:
        melhor = len(ofs) > 1 and igual(o['p'], min_g) and not all(igual(x['p'], min_g) for x in ofs)
        st = estat_loja(P['h'].get(o['l'], []), hoje)
        sub = []
        if o.get('pu') and o.get('u'):
            sub.append(f'{eur(o["pu"])}/{e(o["u"])}')
        if melhor:
            sub.append('o mais barato')
        if not P['presente'] or o.get('dia', hoje) != hoje:
            sub.append(f'preço de {data_curta(o.get("dia", hoje))}')
        tag = ''
        if o['r'] and o['p'] < o['r']:
            tag = f'−{round((o["r"] - o["p"]) / o["r"] * 100)} % sobre o PVPR <span class="riscado">{eur(o["r"])}</span>'
        elif o['a'] and o['p'] < o['a']:
            tag = f'antes <span class="riscado">{eur(o["a"])}</span>'
        elif o['t']:
            tag = e(o['t'])
        extra = ''
        if P['presente'] and (o['v'] in CARIMBO or tag):
            extra = ('<div class="fp__extra">' + (f'<span class="carimbo carimbo--{o["v"]}">{CARIMBO[o["v"]]}</span>' if o['v'] in CARIMBO else '')
                     + (f'<span>{tag}</span>' if tag else '') + '</div>')
        mn30 = (f'<p class="pr-mn">Mais baixo nos {st["n_ant"]} dias anteriores: <b>{eur(st["min"][0])}</b> a {data_curta(st["min"][1])}</p>'
                if st.get('min') and st['n_ant'] > 1 else '')
        ir = (f'<a class="fp__ir" href="{e(D.base.get(o["l"], "") + o["url"])}" target="_blank" rel="noopener nofollow">Ver no {LOJAS[o["l"]]} ↗</a>'
              if o['url'] else '')
        # o que está entre <!--indexnow--> é o que conta para avisar o Bing de que a página mudou (servidor/indexnow-sites.py)
        lojas_html.append(f'<li class="fp__loja{" fp__loja--melhor" if melhor else ""}"><!--indexnow--><span class="fp__nome">{LOJAS[o["l"]]}'
                          f'<small>{" · ".join(sub)}</small></span>'
                          f'<span class="fp__precos">{preco_html(o["p"])}</span>{extra}<!--/indexnow-->{mn30}{ir}</li>')

    data_txt = (f'Preços de <time datetime="{e(D.atualizado)}">{data_ano(hoje)}, às {hora}</time>, recolhidos nas lojas online.'
                if P['presente'] else f'Página atualizada a <time datetime="{hoje}">{data_ano(hoje)}</time>.')
    seguir = (f'<a class="botao" href="/#p={e(urllib.parse.quote(P["gid"]))}">Seguir o preço</a>' if P['presente'] else '')
    voltar = (f'<a class="botao botao--leve" href="/preco/{slug(sec_t[1])}/">Mais preços de {e(termo_frase(sec_t))}</a>' if sec_t else
              '<a class="botao botao--leve" href="/preco/">Preços por produto</a>')
    img = (f'<img class="pr-img" src="{e(P["img"])}" alt="{e(nome)}" width="120" height="120" decoding="async" referrerpolicy="no-referrer">'
           if P['img'] else f'<div class="pr-img et__img--vazio" aria-hidden="true">{e(nome[:1])}</div>')
    d_ini = min((r[0] for v in P['h'].values() for r in v), default=hoje)
    nl = len({o['l'] for o in ofs})
    sub_h1 = ' · '.join(x for x in (
        P['m'] if P['m'] and C.norm(P['m']) not in C.norm(nome) else '',
        (f'à venda em {nl} lojas' if nl > 1 else f'só no {LOJAS[ofs[0]["l"]]}') if P['presente'] else '',
        f'registos desde {data_curta(d_ini)}') if x)
    corpo = [cabeca(titulo, descricao, url, ld, hoje, robots, 'product' if P['presente'] else 'website'), '<main id="conteudo">',
             f'''<section class="bloco pp-heroi pr-heroi"><div class="caixa">
<p class="pp-migalhas">{mig_html}</p>
<div class="pr-grelha"><div class="pr-texto">
<div class="pr-cab">{img}<div><h1>{e(nome)}</h1>{f'<p class="pr-q">{e(sub_h1)}</p>' if sub_h1 else ''}</div></div>
<p class="pr-resposta">{resposta_html}</p>
<p class="pr-data">{data_txt}</p>
</div>
<ul class="fp__lojas pr-lojas" aria-label="Preço em cada loja">{"".join(lojas_html)}</ul>
<p class="pp-acoes pr-acoes">{seguir}{voltar}</p>
</div></div></section>''']

    # a promoção é a sério?
    if P['presente']:
        com = [o for o in ofs if o['v'] or o['t'] or o['a'] or o['r']]
        if com:
            itens = ''.join(f'<li><span class="carimbo carimbo--{o["v"] or "promo"} carimbo--fixo">{CARIMBO.get(o["v"], "Promoção")}</span>'
                            f'<p>{e(frase_promo(o))}</p></li>' for o in com)
            corpo.append(f'''<section class="bloco pp-sec" aria-labelledby="t-promo"><div class="caixa">
<h2 id="t-promo">A promoção é a sério?</h2>
<p class="lead">Comparamos o preço de hoje com o que registámos em cada loja nos 30 dias anteriores e com o preço nas outras lojas.</p>
<ul class="pr-veredito">{itens}</ul>
</div></section>''')

    # histórico
    h = P['h']
    dias = sorted({r[0] for v in h.values() for r in v})
    if len(dias) < 2:
        corpo.append(f'''<section class="bloco pp-sec pr-hist" aria-labelledby="t-hist"><div class="caixa">
<h2 id="t-hist">Histórico de preço</h2>
<p class="lead">Começámos a registar o preço deste produto a <time datetime="{dias[0] if dias else hoje}">{data_longa(dias[0] if dias else hoje)}</time>. O gráfico vai-se enchendo a cada recolha.</p>
</div></section>''')
    else:
        n = len(dias)
        g_estreito, g_largo = grafico_svg(h, 340, 'pr-graf pr-graf--estreito'), grafico_svg(h, 640, 'pr-graf pr-graf--largo')
        linhas_t = []
        for l in 'cpa':
            if l not in h:
                continue
            st = estat_loja(h[l], hoje)
            linhas_t.append(f'<tr><th scope="row">{LOJAS[l]}</th><td>{eur(h[l][-1][1])}</td>'
                            f'<td>{eur(st["min"][0]) if st.get("min") else "—"}</td><td>{eur(st["max"][0]) if st.get("max") else "—"}</td>'
                            f'<td>{eur(st["media"]) if st.get("media") else "—"}</td><td>{st["promo30"]} de {st["n30"]}</td></tr>')
        muds = mudancas(h)
        muds_html = ''
        if muds:
            muds_html = ('<h3>Últimas mudanças de preço</h3><ol class="pr-muds">'
                         + ''.join(f'<li><time datetime="{d}">{data_curta(d)}</time> <b>{LOJAS[l]}</b> {eur(a)} → {eur(b)}'
                                   f'<span class="{"pr-desce" if b < a else "pr-sobe"}">{"desceu" if b < a else "subiu"} {abs(b - a) / a * 100:.0f} %</span></li>'
                                   for d, l, a, b in muds) + '</ol>')
        else:
            muds_html = f'<p class="pp-nota">O preço não mudou nos {n} dias de registos.</p>'
        dia_a_dia = ''.join(
            f'<tr><th scope="row"><time datetime="{d}">{data_curta(d)}</time></th>'
            + ''.join(f'<td>{next((eur(r[1]) for r in h[l] if r[0] == d), "—")}</td>' for l in 'cpa' if l in h) + '</tr>'
            for d in reversed(dias))
        cab_lojas = ''.join(f'<th scope="col">{LOJAS[l]}</th>' for l in 'cpa' if l in h)
        corpo.append(f'''<section class="bloco pp-sec pr-hist" aria-labelledby="t-hist"><div class="caixa">
<h2 id="t-hist">Preço nos últimos {n} dias</h2>
<p class="lead">Um registo por dia desde <time datetime="{dias[0]}">{data_longa(dias[0])}</time>, o primeiro dia em que o vimos.</p>
<div class="pr-graf-caixa">{g_estreito}{g_largo}</div>
<div class="pr-tabela"><table><caption class="sr">Resumo dos últimos 30 dias em cada loja</caption>
<thead><tr><th scope="col">Loja</th><th scope="col">Último</th><th scope="col">Mínimo</th><th scope="col">Máximo</th><th scope="col">Média</th><th scope="col">Dias em promoção</th></tr></thead>
<tbody>{"".join(linhas_t)}</tbody></table></div>
<p class="pp-nota">Mínimo e máximo dos 30 dias anteriores a hoje; média e dias em promoção dos últimos 30 dias, com hoje.</p>
{muds_html}
<details class="pr-dias"><summary>Ver os preços dia a dia</summary>
<div class="pr-tabela"><table><thead><tr><th scope="col">Dia</th>{cab_lojas}</tr></thead><tbody>{dia_a_dia}</tbody></table></div></details>
</div></section>''')

    if irmaos:
        corpo.append(f'''<section class="bloco pp-sec" aria-labelledby="t-irmaos"><div class="caixa">
<h2 id="t-irmaos">Outros preços de {e(termo_frase(sec_t)) if sec_t else "produtos parecidos"}</h2>
<ol class="linhas">{"".join(linha(g) for g in irmaos)}</ol>
{f'<p class="pp-acoes"><a class="botao botao--leve" href="/preco/{slug(sec_t[1])}/">Todos os preços de {e(termo_frase(sec_t))}</a></p>' if sec_t else ''}
</div></section>''')
    corpo += [METODO, '</main>', rodape(hoje, hora)]
    return '\n'.join(corpo)


def pagina_reencaminhar(destino):
    """Endereço antigo de um produto que passou a ter outro: o browser e o Google vão logo para o novo."""
    u = f'{SITE}/produto/{destino}/'
    return (f'<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>caiu.pt</title>'
            f'<meta name="robots" content="noindex"><link rel="canonical" href="{u}">'
            f'<meta http-equiv="refresh" content="0; url=/produto/{destino}/"></head>'
            f'<body><p><a href="/produto/{destino}/">Este produto mudou de endereço.</a></p></body></html>')


def produtos_do_dia(D, est, termos_gs):
    """Escolhe os produtos com página, dá-lhes endereço e prepara os dados de cada página.
    termos_gs: OrderedDict termo -> (secção, [g]) das páginas de termo. Devolve (paginas, reencaminhar)."""
    hoje = D.dia
    termo_de = {}
    for t, (sec, gs) in termos_gs.items():
        for g in gs:
            termo_de.setdefault(g['i'], (sec, t))
    S = est.setdefault('s', {})
    K = est.setdefault('k', {})
    cands = []
    for i, a in D.P.g.items():
        g = D.g(i)
        tem_endereco = any((o['l'] + o['id']) in K for o in g['o'])
        nl = len({o['l'] for o in g['o']})
        dmax = max(o['d'] or 0 for o in g['o'])
        if not tem_endereco and nl < 2 and dmax < DIAS_MIN:
            continue  # nem vale a pena abrir o histórico
        rh = resumo_hist(D.hist(i), hoje)
        D._h.pop(i, None)  # os históricos voltam a ser lidos página a página (não ficam todos em memória)
        m = merece_pagina(g, rh)
        if m or tem_endereco:
            cands.append((g, rh, m))
    tomados = atribuir_enderecos(D, est, cands, hoje)
    for sl, (g, rh, m) in tomados.items():
        URLS[g['i']] = f'/produto/{sl}/'
    paginas = {}
    for sl, (g, rh, m) in tomados.items():
        x = S[sl]
        if m and g['i'] in termo_de:
            x['termo'] = list(termo_de[g['i']])
        idx = bool(x.get('idx')) and dias_entre(x['idx'], hoje) <= DIAS_FICA
        paginas[sl] = {'slug': sl, 'gid': g['i'], 'nome': nome_qtd(g['n'], g['q']), 'n': g['n'], 'm': g['m'], 'q': g['q'], 'img': g['img'],
                       'ofs': [dict(o) for o in g['o']], 'h': None, 'presente': True, 'termo': tuple(x['termo']) if x.get('termo') else None,
                       'indexavel': idx, 'lastmod': max(rh['ultima'], x.get('criado', hoje)), 'g': g}
    # produtos que não apareceram hoje: a página fica DIAS_GRACA dias com o último preço visto
    desde = dia_mais(hoje, -120)
    reenc = {}
    for sl, x in S.items():
        if sl in tomados:
            continue
        if x.get('alias'):
            reenc[sl] = x['alias']
            continue
        if not x.get('idx') or dias_entre(x.get('visto', hoje), hoje) > DIAS_GRACA or dias_entre(x['idx'], hoje) > DIAS_FICA:
            continue
        h, ofs = hist_db(D.pasta, x.get('k', []), desde)
        if not ofs:
            continue
        paginas[sl] = {'slug': sl, 'gid': x.get('g', ''), 'nome': nome_qtd(x.get('n', ''), x.get('q', '')), 'n': x.get('n', ''),
                       'm': x.get('m', ''), 'q': x.get('q', ''), 'img': x.get('img', ''), 'ofs': ofs, 'h': h, 'presente': False,
                       'termo': tuple(x['termo']) if x.get('termo') else None, 'indexavel': True, 'lastmod': x.get('visto', hoje), 'g': None}
    # reencaminhamentos só para endereços que ainda têm destino
    reenc = {a: b for a, b in reenc.items() if b in paginas}
    return paginas, reenc


def irmaos_de(P, termos_gs, n=6):
    """Outros produtos da mesma página de termo, com página própria (primeiro os que estão em mais lojas)."""
    if not P['termo'] or P['termo'][1] not in termos_gs:
        return []
    gs = termos_gs[P['termo'][1]][1]
    return [g for g in gs if g['i'] != P['gid'] and g['i'] in URLS][:n]


def pagina_produtos_indice(D, prods, gss, hora):
    """/produto/: liga às páginas de preços por termo e aos produtos com página que não aparecem em nenhuma delas
    (nenhuma página fica sem ligações). Fica fora do Google (noindex): é só um caminho para os produtos."""
    url = SITE + '/produto/'
    ligados = {g['i'] for _, gs in gss.values() for g in gs}
    orfaos = sorted((P for P in prods.values() if P['indexavel'] and (not P['presente'] or P['gid'] not in ligados)),
                    key=lambda P: C.norm(P['nome']))
    n = sum(1 for P in prods.values() if P['indexavel'])
    titulo = 'Produtos com histórico de preço | caiu.pt'
    descricao = curta(f'{n} produtos do Continente, Pingo Doce e Auchan com preço de hoje, mínimo de 30 dias e histórico.')
    ld = {'@context': 'https://schema.org', '@graph': [migalhas_ld(('caiu.pt', SITE + '/'), ('Produtos', url)),
                                                         {'@type': 'CollectionPage', '@id': url, 'name': titulo, 'url': url, 'inLanguage': 'pt-PT'}]}
    secs = OrderedDict()
    for t, (sec, gs) in gss.items():
        k = sum(1 for g in gs if g['i'] in URLS)
        if k:
            secs.setdefault(sec, []).append((t, k))
    blocos = ''.join(f'<h2>{e(sec)}</h2><ul class="pp-rel">' + ''.join(
        f'<li><a href="/preco/{slug(t)}/">{e(titulo_termo(t))}<small>{k}</small></a></li>' for t, k in itens) + '</ul>' for sec, itens in secs.items())
    outros = ''
    if orfaos:
        outros = ('<h2>Outros produtos</h2><ul class="pp-lista">'
                  + ''.join(f'<li><a href="/produto/{P["slug"]}/">{e(P["nome"])}</a></li>' for P in orfaos) + '</ul>')
    return '\n'.join([cabeca(titulo, descricao, url, ld, D.dia, 'noindex, follow'), '<main id="conteudo">',
                      '<section class="bloco pp-heroi pp-indice"><div class="caixa">',
                      '<p class="pp-migalhas"><a href="/">caiu.pt</a> › Produtos</p>', '<h1>Produtos com histórico de preço</h1>',
                      f'<p class="lead">{n} produtos com página própria: o preço de hoje em cada loja, o mais baixo dos 30 dias anteriores e o histórico. '
                      'Estão arrumados pelas páginas de preços; o número diz quantos tem cada uma.</p>', blocos, outros,
                      '</div></section>', '</main>', rodape(D.dia, hora)])


# ---------- cabaz mais barato esta semana (/cabaz-mais-barato/) ----------
ESSENCIAL_DESDE = '2026-11-11'  # primeiro dia em que o cabaz foi calculado na recolha (os dias antes foram reconstruídos)


def segunda(iso_dia):
    d = date.fromisoformat(iso_dia)
    return (d - timedelta(days=d.weekday())).isoformat()


def media_lojas(rows):
    """[dia, c, p, a, dividir, n] -> {c, p, a, div} médias."""
    if not rows:
        return {}
    k = {'c': 1, 'p': 2, 'a': 3, 'div': 4}
    return {l: sum(r[i] for r in rows) / len(rows) for l, i in k.items()}


def pct(a, b):
    return (b - a) / a * 100 if a else 0.0


def e_lista(xs):
    return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' e ' + xs[-1]


def pct_abs(v):
    return ('%.1f' % abs(v)).replace('.', ',') + ' %'


def pct_txt(v):
    s = ('%.1f' % abs(v)).replace('.', ',')
    return ('+' if v > 0.05 else '−' if v < -0.05 else '') + s + ' %'


def hist_cabaz(E):
    return [h for h in (E.get('hist') or []) if h[5] == E.get('n')]


def mapa_url_produto(D):
    """(loja, url na loja) -> id do produto de hoje (para ligar os artigos do cabaz às páginas de produto)."""
    m = {}
    for i, a in D.P.g.items():
        for x in a[7]:
            if x[10]:
                m[(x[0], x[10])] = i
    return m


def pagina_cabaz(D, hora):
    E = D.R.get('essencial') or {}
    tot = E.get('totais') or {}
    hist = hist_cabaz(E)
    if not E.get('n') or len(tot) < 3 or not hist:
        return None, None
    hoje = D.dia
    url = SITE + '/cabaz-mais-barato/'
    sm = E.get('semanas_mes') or 52 / 12
    seg = segunda(hoje)
    esta = [r for r in hist if r[0] >= seg]
    passada = [r for r in hist if dia_mais(seg, -7) <= r[0] < seg]
    me, mp = media_lojas(esta), media_lojas(passada)
    ordem = sorted('cpa', key=lambda l: me[l])
    l1, l2, l3 = ordem
    if esta[0][0] == hoje:
        periodo = f'hoje, {data_longa(hoje)}'
        periodo_c = f'preços de {data_longa(hoje)}'
    else:
        periodo = intervalo(esta[0][0], hoje)
        periodo_c = f'média de {periodo}'
    dif4 = (me[l3] - me[l1]) * 4 * sm
    n = E['n']
    resposta = (f'Esta semana ({periodo}), o cabaz de {n} produtos essenciais fica mais barato no {LOJAS[l1]}: '
                f'{eur(me[l1])} por pessoa e por semana. No {LOJAS[l2]} custa {eur(me[l2])} e no {LOJAS[l3]} {eur(me[l3])}. '
                f'Para quatro pessoas, num mês, são {eur(dif4)} de diferença entre o mais barato e o mais caro.')
    if passada and len(passada) >= 3:
        v = pct(mp[l1], me[l1])
        extra = (f' Face à semana passada, o {LOJAS[l1]} está {"mais caro" if v > 0.05 else "mais barato" if v < -0.05 else "igual"}'
                 + (f' ({pct_txt(v)}).' if abs(v) > 0.05 else '.'))
        if palavras_n(resposta + extra) <= 60:
            resposta += extra
    if palavras_n(resposta) < 40:
        resposta += ' Se comprasses cada produto na loja onde está mais barato, pagavas ' + eur(me['div']) + ' por pessoa e por semana.'
    titulo = 'Cabaz mais barato esta semana: Continente, Pingo Doce, Auchan'
    descricao = curta(f'Esta semana, o cabaz de {n} produtos essenciais custa {eur(me[l1])} por pessoa no {LOJAS[l1]}, '
                      f'{eur(me[l2])} no {LOJAS[l2]} e {eur(me[l3])} no {LOJAS[l3]}. Atualizado todos os dias.')
    d0 = hist[0][0]
    csv_url = url + 'historico.csv'
    ld = {'@context': 'https://schema.org', '@graph': [
        migalhas_ld(('caiu.pt', SITE + '/'), ('Cabaz mais barato', url)),
        {'@type': 'WebPage', '@id': url, 'name': titulo, 'url': url, 'inLanguage': 'pt-PT', 'dateModified': D.atualizado,
         'description': descricao, 'isPartOf': {'@id': SITE + '/#site'}},
        {'@type': 'Dataset', 'name': 'Cabaz do essencial: total diário no Continente, Pingo Doce e Auchan',
         'description': (f'Total diário de um cabaz de {n} produtos essenciais (alimentação, água, casa e higiene) com as quantidades de '
                         'referência de 1 pessoa durante 1 semana, em cada um dos três supermercados online, com o produto mais barato por '
                         'quilo, litro ou unidade de cada loja. Inclui o total se cada produto for comprado na loja mais barata. '
                         f'Valores em euros. Dados recolhidos pelo caiu.pt nas lojas online desde {data_ano(d0)}.'),
         'url': url, 'creator': {'@id': SITE + '/#organizacao'}, 'license': 'https://creativecommons.org/licenses/by/4.0/',
         'isAccessibleForFree': True, 'inLanguage': 'pt-PT', 'spatialCoverage': 'Portugal', 'temporalCoverage': f'{d0}/{hist[-1][0]}',
         'dateModified': D.atualizado, 'variableMeasured': ['Total do cabaz no Continente (€)', 'Total do cabaz no Pingo Doce (€)',
                                                            'Total do cabaz no Auchan (€)', 'Total na loja mais barata de cada produto (€)'],
         'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': csv_url}]}]}

    # cartões das três lojas (como no início do site)
    def cartao_loja(l, k):
        sub = f'por pessoa e por semana · {periodo_c}'
        if passada and len(passada) >= 3:
            sub += f' · {pct_txt(pct(mp[l], me[l]))} face à semana passada'
        return (f'<li class="pl{" pl--melhor" if k == 0 else ""}">' + ('<span class="carimbo pl__carimbo carimbo--fixo">Mais barato</span>' if k == 0 else '')
                + f'<span class="pl__loja">{LOJAS[l]}</span><span class="pl__total">{preco_html(me[l])}</span><span class="pl__sub">{sub}</span></li>')
    lojas3 = '<ol class="lojas3 cz-lojas">' + ''.join(cartao_loja(l, k) for k, l in enumerate(ordem)) + '</ol>'

    # quanto custa por agregado
    agreg = ''.join(
        f'<tr><th scope="row">{p} {"pessoa" if p == 1 else "pessoas"}</th>'
        + ''.join(f'<td class="{"cz-melhor" if l == l1 else ""}">{eur(me[l] * p * sm)}</td>' for l in 'cpa') + '</tr>'
        for p in (1, 2, 3, 4))
    cab = ''.join(f'<th scope="col">{LOJAS[l]}</th>' for l in 'cpa')

    # artigos do cabaz
    murl = mapa_url_produto(D)
    grupos = OrderedDict((g, (t, [])) for g, t in (E.get('grupos') or []))
    for a in E.get('artigos', []):
        if a.get('comum') and a['g'] in grupos:
            grupos[a['g']][1].append(a)
    UN = {'kg': 'kg', 'L': 'L', 'un': 'un.', 'dose': 'doses'}
    art_html = []
    for g, (t, arts) in grupos.items():
        if not arts:
            continue
        linhas_a = []
        for a in arts:
            pus = {l: a['l'][l][2] for l in 'cpa' if l in a['l']}
            mn = min(pus.values())
            q = ('%g' % a['q']).replace('.', ',')
            cel = []
            for l in 'cpa':
                x = a['l'].get(l)
                if not x:
                    cel.append('<td>—</td>')
                    continue
                gid = murl.get((l, x[4]))
                nome_p = e(x[0])
                if gid and gid in URLS:
                    nome_p = f'<a href="{e(URLS[gid])}">{nome_p}</a>'
                cel.append(f'<td class="{"cz-melhor" if igual(x[2], mn) and not all(igual(v, mn) for v in pus.values()) else ""}">'
                           f'<b>{eur(x[2])}/{UN.get(a["u"], a["u"])}</b><small>{nome_p}{" · em promoção" if x[5] else ""}</small></td>')
            linhas_a.append(f'<tr><th scope="row">{e(a["n"])}<small>{q} {UN.get(a["u"], a["u"])} por pessoa e semana</small></th>{"".join(cel)}</tr>')
        art_html.append(f'<tbody><tr class="cz-grupo"><th colspan="4" scope="colgroup">{e(t)}</th></tr>{"".join(linhas_a)}</tbody>')

    # histórico: gráfico e semanas
    hh = {l: [[r[0], r[i], None, None] for r in hist] for l, i in (('c', 1), ('p', 2), ('a', 3))}
    g1, g2 = grafico_svg(hh, 340, 'pr-graf pr-graf--estreito'), grafico_svg(hh, 640, 'pr-graf pr-graf--largo')
    semanas = OrderedDict()
    for r in hist:
        semanas.setdefault(segunda(r[0]), []).append(r)
    sem_html = ''.join(
        f'<tr><th scope="row">Semana de {data_curta(s)}{" (esta)" if s == seg else ""}<small>{len(rs)} {"dia" if len(rs) == 1 else "dias"}</small></th>'
        + ''.join(f'<td class="{"cz-melhor" if l == min("cpa", key=lambda x: media_lojas(rs)[x]) else ""}">{eur(media_lojas(rs)[l])}</td>' for l in 'cpa')
        + '</tr>' for s, rs in reversed(list(semanas.items())[-10:]))
    reconstr = hist[0][0] < ESSENCIAL_DESDE
    nota_rec = (f' Os dias antes de {data_longa(ESSENCIAL_DESDE)} foram calculados depois, com os preços que já tínhamos guardado.' if reconstr else '')

    faltam = E.get('faltam') or []
    corpo = [cabeca(titulo, descricao, url, ld, hoje), '<main id="conteudo">',
             '<section class="bloco pp-heroi cz-heroi"><div class="caixa">',
             '<p class="pp-migalhas"><a href="/">caiu.pt</a> › Cabaz mais barato</p>',
             '<h1>Cabaz mais barato esta semana</h1>',
             f'<p class="pr-resposta">{e(resposta)}</p>',
             f'<p class="pr-data">Preços de <time datetime="{e(D.atualizado)}">{data_ano(hoje)}, às {hora}</time>, nas lojas online. '
             'Atualizado três vezes por dia.</p>',
             lojas3,
             f'<p class="essencial__dividir">Se comprasses cada produto na loja onde está mais barato, pagavas <strong>{eur(me["div"])}</strong> por pessoa e por semana.</p>',
             '<p class="pp-acoes"><a class="botao" href="/#essencial">Fazer as contas para a minha casa</a></p>',
             '</div></section>',
             '<section class="bloco pp-sec" aria-labelledby="t-agreg"><div class="caixa">',
             '<h2 id="t-agreg">Quanto custa num mês</h2>',
             f'<p class="lead">O mesmo cabaz para 1 a 4 pessoas durante um mês ({("%.2f" % sm).replace(".", ",")} semanas), com os preços desta semana.</p>',
             f'<div class="pr-tabela cz-agreg"><table><thead><tr><th scope="col">Por mês</th>{cab}</tr></thead><tbody>{agreg}</tbody></table></div>',
             '</div></section>',
             '<section class="bloco pp-sec" aria-labelledby="t-arts"><div class="caixa">',
             f'<h2 id="t-arts">Os {n} produtos do cabaz</h2>',
             '<p class="lead">Em cada loja escolhemos o produto mais barato ao quilo, ao litro ou à unidade, de qualquer marca. '
             'A amarelo, a loja onde esse produto está mais barato hoje.</p>',
             f'<div class="pr-tabela cz-arts"><table><thead><tr><th scope="col">Produto</th>{cab}</tr></thead>{"".join(art_html)}</table></div>',
             (f'<p class="pp-nota">Hoje ficaram de fora por faltarem em alguma loja: {e(", ".join(f[0] for f in faltam))}.</p>' if faltam else ''),
             '</div></section>',
             '<section class="bloco pp-sec pr-hist" aria-labelledby="t-chist"><div class="caixa">',
             '<h2 id="t-chist">Como tem mudado</h2>',
             f'<p class="lead">Total do cabaz de 1 pessoa por semana, um ponto por dia desde <time datetime="{d0}">{data_longa(d0)}</time>.{nota_rec}</p>',
             f'<div class="pr-graf-caixa">{g1}{g2}</div>',
             f'<div class="pr-tabela"><table><thead><tr><th scope="col">Semana</th>{"".join(f"<th scope=col>{LOJAS[l]}</th>" for l in "cpa")}</tr></thead><tbody>{sem_html}</tbody></table></div>',
             f'<p class="pp-acoes"><a class="botao botao--leve" href="{csv_url.replace(SITE, "")}" download>Descarregar os dados (CSV)</a></p>',
             '<p class="pp-nota">Dados livres para usar e citar (licença CC BY 4.0), indicando o caiu.pt como fonte.</p>',
             '</div></section>',
             '<section class="bloco pp-sec" aria-labelledby="t-como"><div class="caixa">',
             '<h2 id="t-como">Como montamos o cabaz</h2>',
             '<ol class="cz-passos">',
             f'<li>São {E.get("total_artigos", n)} produtos do dia a dia: mercearia, frescos, fruta e legumes, água, casa e higiene, com a quantidade que uma pessoa adulta gasta numa semana.</li>',
             '<li>Em cada loja, para cada produto, escolhemos o mais barato ao quilo, ao litro ou à unidade que cumpre as regras do artigo (por exemplo, leite meio-gordo e não com chocolate), de qualquer marca, incluindo as das lojas.</li>',
             '<li>Só entram nas contas os produtos que as três lojas têm à venda nesse dia, para comparar sempre o mesmo cabaz.</li>',
             '<li>Usamos os preços das lojas online, com as promoções do dia, sem descontos em cartão nem portes. O mês tem 52/12 semanas.</li>',
             '</ol>',
             '<p class="pp-nota">Para comparar os mesmos produtos, da mesma marca e embalagem, vê <a href="/supermercado-mais-barato/">qual é o supermercado mais barato</a>. '
             'Promoções de cada loja: <a href="/promocoes/continente/">Continente</a>, <a href="/promocoes/pingo-doce/">Pingo Doce</a> e <a href="/promocoes/auchan/">Auchan</a>.</p>',
             '</div></section>', METODO, '</main>', rodape(hoje, hora)]
    csv = 'dia,continente,pingo_doce,auchan,cada_um_na_loja_mais_barata,artigos\n' + ''.join(
        f'{r[0]},{r[1]:.2f},{r[2]:.2f},{r[3]:.2f},{r[4]:.2f},{r[5]}\n' for r in hist)
    return '\n'.join(x for x in corpo if x), csv


# ---------- o que mudou de preço esta semana em cada loja ----------
def mudancas_semana(D, hoje):
    """Para cada loja: produtos cujo preço mudou desde há 7 dias. {loja: {'n': acompanhados, 'sobe': [...], 'desce': [...]}}"""
    lim = dia_mais(hoje, -7)
    lim30 = dia_mais(hoje, -30)
    out = {l: {'n': 0, 'sobe': [], 'desce': [], 'pvpr_7d': 0, 'pvpr_habitual': 0} for l in LOJAS}
    for i, a in D.P.g.items():
        if max(x[11] or 0 for x in a[7]) < 8:
            continue
        h = D.hist(i)
        D._h.pop(i, None)
        for l, v in h.items():
            if not v or v[-1][0] != hoje:
                continue
            # desconto só sobre o PVPR: o preço «com desconto» é o mesmo que a loja já cobrava? (para os estudos)
            ult = v[-1]
            ant30 = [r[1] for r in v[:-1] if r[0] >= lim30]
            if ult[3] and not ult[2] and ult[1] < ult[3] and len(ant30) >= 7:
                out[l]['pvpr_7d'] += 1
                if max(ant30) <= ult[1] + 0.005:
                    out[l]['pvpr_habitual'] += 1
            antes = [r for r in v if r[0] <= lim and r[0] >= dia_mais(lim, -3)]
            if not antes:
                continue
            r0 = antes[-1]
            out[l]['n'] += 1
            p0, p1 = r0[1], v[-1][1]
            if igual(p0, p1):
                continue
            item = (abs(p1 - p0) / p0, i, p0, p1, bool(r0[2] or r0[3]), bool(v[-1][2] or v[-1][3]))
            out[l]['sobe' if p1 > p0 else 'desce'].append(item)
    for l in out:
        for k in ('sobe', 'desce'):
            out[l][k].sort(key=lambda x: (-x[0], x[1]))
    return out


def bloco_semana_loja(D, l, ms):
    m = ms.get(l) or {}
    if not m.get('n') or not (m['sobe'] or m['desce']):
        return ''
    nome = LOJAS[l]
    lim = dia_mais(D.dia, -7)

    def lista(itens):
        out = []
        for _, i, p0, p1, pr0, pr1 in itens:
            g = D.g(i)
            o = next((x for x in g['o'] if x['l'] == l), None)
            if not o:
                continue
            nota = ' · fim da promoção' if pr0 and not pr1 and p1 > p0 else (' · em promoção' if pr1 and p1 < p0 else '')
            out.append(linha(g, f'<span class="{"pr-sobe" if p1 > p0 else "pr-desce"}">{eur(p0)} → {eur(p1)}{nota}</span>', o))
            if len(out) >= 6:
                break
        return ''.join(out)
    ns, nd = len(m['sobe']), len(m['desce'])
    return (f'<section class="bloco pp-sec" aria-labelledby="t-semana"><div class="caixa">\n'
            f'<h2 id="t-semana">O que mudou de preço no {nome} esta semana</h2>\n'
            f'<p class="lead">Desde <time datetime="{lim}">{data_longa(lim)}</time>, dos {m["n"]} produtos que acompanhamos todos os dias no {nome}, '
            f'{ns} subiram e {nd} desceram de preço. Muitas descidas são promoções que começaram; muitas subidas, promoções que acabaram.</p>\n'
            + (f'<h3>Subiram mais</h3><ol class="linhas">{lista(m["sobe"])}</ol>' if ns else '')
            + (f'<h3>Desceram mais</h3><ol class="linhas">{lista(m["desce"])}</ol>' if nd else '')
            + '\n</div></section>')


# ---------- estudos (para jornalistas): só quando há dados para os fazer ----------
def foto_do_dia(D, semana=None):
    """Números de hoje para os estudos: promoções por loja e por veredito (guardados em estado-estudos.json).
    semana (de mudancas_semana): descontos sobre o PVPR em que o preço é o mesmo que a loja já cobrava nos 30 dias anteriores."""
    out = {}
    for l in LOJAS:
        ofs = [x for a in D.P.g.values() for x in a[7] if x[0] == l]
        promo = [x for x in ofs if x[8] or x[7] or x[5] or x[6]]
        ms = lambda x, k: any(m[0] == k for m in (x[9] or []))
        out[l] = {'ofertas': len(ofs), 'promos': len(promo),
                  'real': sum(1 for x in promo if x[8] == 'real'), 'fachada': sum(1 for x in promo if x[8] == 'fachada'),
                  'pvpr': sum(1 for x in promo if ms(x, 'pvpr')), 'outra': sum(1 for x in promo if ms(x, 'outra')),
                  'igual': sum(1 for x in promo if ms(x, 'igual')), 'antes': sum(1 for x in promo if ms(x, 'antes')),
                  'sem_confirmar': sum(1 for x in promo if x[8] == 'promo'),
                  'pvpr_7d': (semana or {}).get(l, {}).get('pvpr_7d', 0), 'pvpr_habitual': (semana or {}).get(l, {}).get('pvpr_habitual', 0)}
    out['dias_historico'] = D.R.get('dias_historico') or 0
    return out


def estudo_mes(D, est_estudos, ano, mes):
    """Estudo de um mês completo: quanto mudou o cabaz do essencial e quantas promoções não eram o que pareciam.
    Só sai quando há dados que chegam: o mês acabou, 25+ dias com o cabaz calculado na recolha (desde ESSENCIAL_DESDE)
    e, para a parte das promoções, 15+ dias com 30+ dias de histórico (para todos os critérios do veredito valerem).
    Devolve (slug, html, comunicado, csv) ou (None, motivo)."""
    ini = f'{ano}-{mes:02d}-01'
    fim = dia_mais(f'{ano + (mes == 12)}-{(mes % 12) + 1:02d}-01', -1)
    nome_mes = f'{MESES[mes - 1]} de {ano}'
    if D.dia <= fim:
        return None, f'{nome_mes}: o mês ainda não acabou'
    slug_e = f'precos-supermercado-{MESES[mes - 1]}-{ano}'.replace('ç', 'c')
    cong = (est_estudos.get('congelados') or {}).get(slug_e)
    if cong:  # já publicado: os números ficam os do dia em que saiu
        hist, fotos, pub = cong['hist'], cong['fotos'], cong['pub']
    else:
        E = D.R.get('essencial') or {}
        hist = [r for r in hist_cabaz(E) if ini <= r[0] <= fim and r[0] >= ESSENCIAL_DESDE]
        if len(hist) < 25:
            return None, f'{nome_mes}: só {len(hist)} dias com o cabaz calculado na recolha (são precisos 25)'
        fotos = {d: f for d, f in (est_estudos.get('dias') or {}).items() if ini <= d <= fim and f.get('dias_historico', 0) >= 30}
        pub = D.dia
        est_estudos.setdefault('congelados', {})[slug_e] = {'hist': hist, 'fotos': fotos, 'pub': pub}
    url = f'{SITE}/estudos/{slug_e}/'
    p1, p2 = hist[:7], hist[-7:]
    m1, m2 = media_lojas(p1), media_lojas(p2)
    var = {l: pct(m1[l], m2[l]) for l in 'cpa'}
    ordem = sorted('cpa', key=lambda l: m2[l])
    n = hist[-1][5]
    linhas_c = ''.join(f'<tr><th scope="row">{LOJAS[l]}</th><td>{eur(m1[l])}</td><td>{eur(m2[l])}</td><td>{pct_txt(var[l])}</td></tr>' for l in ordem)
    sobe = max('cpa', key=lambda l: var[l])
    titular = (f'Em {nome_mes}, o cabaz do essencial {"subiu" if var[sobe] > 0.05 else "não subiu"} '
               + (f'{pct_abs(var[sobe])} no {LOJAS[sobe]}' if var[sobe] > 0.05 else 'em nenhuma das três lojas'))
    promo_html, promo_com = '', ''
    if len(fotos) >= 15:
        soma = {l: Counter() for l in LOJAS}
        for f in fotos.values():
            for l in LOJAS:
                soma[l].update({k: v for k, v in f.get(l, {}).items()})
        tot_p = sum(soma[l]['promos'] for l in LOJAS)
        tot_f = sum(soma[l]['fachada'] for l in LOJAS)
        tot_v = sum(soma[l]['pvpr'] for l in LOJAS)
        linhas_p = ''.join(
            f'<tr><th scope="row">{LOJAS[l]}</th><td>{soma[l]["promos"] / len(fotos):.0f}</td>'
            f'<td>{soma[l]["real"] / max(1, soma[l]["promos"]) * 100:.0f} %</td><td>{soma[l]["fachada"] / max(1, soma[l]["promos"]) * 100:.0f} %</td>'
            f'<td>{soma[l]["pvpr"] / max(1, soma[l]["promos"]) * 100:.0f} %</td></tr>' for l in LOJAS)
        promo_html = (f'<h2 id="t-promos">As promoções</h2><p class="lead">Em {len(fotos)} dias de {nome_mes} verificámos, em média, '
                      f'{tot_p / len(fotos):.0f} promoções por dia nas três lojas. {tot_f / max(1, tot_p) * 100:.0f} % eram fachada '
                      f'(mais baratas noutra loja, já estiveram a esse preço no último mês ou com um preço riscado que não aparece nos registos) '
                      f'e {tot_v / max(1, tot_p) * 100:.0f} % davam o desconto sobre o PVPR, o preço recomendado pela marca.</p>'
                      f'<div class="pr-tabela"><table><thead><tr><th scope="col">Loja</th><th scope="col">Promoções por dia</th><th scope="col">A sério</th>'
                      f'<th scope="col">Fachada</th><th scope="col">Sobre o PVPR</th></tr></thead><tbody>{linhas_p}</tbody></table></div>')
        promo_com = (f' Nas promoções, {tot_f / max(1, tot_p) * 100:.0f} % das que verificámos eram fachada e '
                     f'{tot_v / max(1, tot_p) * 100:.0f} % calculavam o desconto sobre o PVPR.')
        p7 = sum(soma[l]['pvpr_7d'] for l in LOJAS)
        if p7:
            hab = sum(soma[l]['pvpr_habitual'] for l in LOJAS)
            frase_hab = (f' Em {hab / p7 * 100:.0f} % dos descontos sobre o PVPR, o preço «com desconto» não estava abaixo de nenhum '
                         'preço que a loja cobrou nos 30 dias anteriores.')
            promo_com += frase_hab
            promo_html += f'<p class="lead">{e(frase_hab.strip())}</p>'
    titulo = f'Preços do supermercado em {nome_mes}: o que mudou'
    descricao = curta(f'{titular}. Dados diários do Continente, Pingo Doce e Auchan online, com método e dados para descarregar.')
    ld = {'@context': 'https://schema.org', '@graph': [
        migalhas_ld(('caiu.pt', SITE + '/'), ('Estudos', SITE + '/estudos/'), (f'Preços em {nome_mes}', url)),
        {'@type': 'Article', '@id': url, 'headline': titular[:110], 'url': url, 'inLanguage': 'pt-PT', 'datePublished': pub,
         'dateModified': pub, 'author': {'@id': SITE + '/#organizacao'}, 'publisher': {'@id': SITE + '/#organizacao'},
         'description': descricao, 'image': SITE + '/partilha.png'}]}
    corpo = [cabeca(titulo, descricao, url, ld, pub, '', 'article'), '<main id="conteudo">',
             '<section class="bloco pp-heroi"><div class="caixa es-texto">',
             f'<p class="pp-migalhas"><a href="/">caiu.pt</a> › <a href="/estudos/">Estudos</a> › {e(nome_mes)}</p>',
             f'<h1>{e(titular)}</h1>',
             f'<p class="pr-resposta">Comparámos a média dos primeiros sete dias de {nome_mes} ({intervalo(p1[0][0], p1[-1][0])}) com a dos últimos sete '
             f'({intervalo(p2[0][0], p2[-1][0])}) num cabaz de {n} produtos essenciais para uma pessoa, durante uma semana. '
             f'No fim do mês, o mais barato era o {LOJAS[ordem[0]]} ({eur(m2[ordem[0]])}) e o mais caro o {LOJAS[ordem[-1]]} ({eur(m2[ordem[-1]])}).{promo_com}</p>',
             f'<p class="pr-data">Publicado a <time datetime="{pub}">{data_ano(pub)}</time>. Amostra: {len(hist)} dias, {n} produtos, 3 lojas online.</p>',
             '</div></section>',
             '<section class="bloco pp-sec" aria-labelledby="t-cabaz"><div class="caixa es-texto">',
             '<h2 id="t-cabaz">O cabaz do essencial</h2>',
             f'<div class="pr-tabela"><table><thead><tr><th scope="col">Loja</th><th scope="col">Início do mês</th><th scope="col">Fim do mês</th><th scope="col">Variação</th></tr></thead><tbody>{linhas_c}</tbody></table></div>',
             '<p class="pp-nota">Valores para 1 pessoa durante 1 semana. Média de 7 dias em cada ponta, para um dia de promoções não mudar a conclusão.</p>',
             (f'<section aria-labelledby="t-promos">{promo_html}</section>' if promo_html else ''),
             '<h2>Método</h2><p>Preços recolhidos nas lojas online do Continente, Pingo Doce e Auchan três vezes por dia. Em cada loja, o produto mais '
             'barato ao quilo, ao litro ou à unidade que cumpre as regras de cada artigo. Só contam os produtos que as três lojas tinham. '
             'Uma promoção é «a sério» quando o preço está abaixo de todos os dos 30 dias anteriores. Os preços podem ser diferentes na loja física e com cartão.</p>',
             f'<p class="pp-acoes"><a class="botao botao--leve" href="/estudos/{slug_e}/dados.csv" download>Descarregar os dados (CSV)</a>'
             '<a class="botao botao--leve" href="/cabaz-mais-barato/">O cabaz desta semana</a></p>',
             '<p class="pp-nota">Para jornalistas: os dados são livres para usar (CC BY 4.0), citando o caiu.pt.</p>',
             '</div></section>', '</main>', rodape(pub, '')]
    comunicado = (f'{titular}\n\n'
                  f'{data_ano(pub)[:1].upper() + data_ano(pub)[1:]}. O caiu.pt, comparador gratuito que verifica todos os dias os preços do Continente, Pingo Doce e Auchan online, '
                  f'mediu o custo de um cabaz de {n} produtos essenciais ao longo de {nome_mes}. Entre a primeira e a última semana do mês, o cabaz '
                  + e_lista([(f'{"subiu" if var[l] > 0 else "desceu"} {pct_abs(var[l])}' if abs(var[l]) > 0.05 else 'ficou igual') + f' no {LOJAS[l]}' for l in ordem])
                  + f'. No fim do mês, o mais barato era o {LOJAS[ordem[0]]}, com {eur(m2[ordem[0]])} por pessoa e por semana.{promo_com}\n\n'
                  f'Amostra: {len(hist)} dias, {n} produtos, 3 supermercados online. Método e dados: {url}\n'
                  'Os dados são livres para usar (CC BY 4.0), citando o caiu.pt.\n')
    csv = 'dia,continente,pingo_doce,auchan,cada_um_na_loja_mais_barata,artigos\n' + ''.join(
        f'{r[0]},{r[1]:.2f},{r[2]:.2f},{r[3]:.2f},{r[4]:.2f},{r[5]}\n' for r in hist)
    return slug_e, ('\n'.join(x for x in corpo if x), comunicado, csv, titular)


def pagina_estudos(D, feitos, hora):
    url = SITE + '/estudos/'
    titulo = 'Estudos de preços do supermercado | caiu.pt'
    descricao = 'Estudos mensais com os preços recolhidos todos os dias no Continente, Pingo Doce e Auchan: o cabaz e as promoções.'
    ld = {'@context': 'https://schema.org', '@graph': [migalhas_ld(('caiu.pt', SITE + '/'), ('Estudos', url)),
                                                         {'@type': 'CollectionPage', '@id': url, 'name': titulo, 'url': url, 'inLanguage': 'pt-PT'}]}
    itens = ''.join(f'<li><a href="/estudos/{s}/">{e(t)}</a></li>' for s, t in feitos)
    if not itens:  # ainda sem estudos: a página existe (para quem a procura) mas fica fora do Google
        itens = ('<li><p>O primeiro estudo sai quando houver um mês inteiro de dados com todos os critérios a valer. '
                 'Até lá, os dados diários do cabaz estão em <a href="/cabaz-mais-barato/">cabaz mais barato</a> '
                 '(<a href="/cabaz-mais-barato/historico.csv">CSV</a>).</p></li>')
    return '\n'.join([cabeca(titulo, descricao, url, ld, D.dia, '' if feitos else 'noindex, follow'),
                      '<main id="conteudo"><section class="bloco pp-heroi"><div class="caixa es-texto">',
                      '<p class="pp-migalhas"><a href="/">caiu.pt</a> › Estudos</p><h1>Estudos</h1>',
                      '<p class="lead">Um estudo por mês, feito com os preços que recolhemos todos os dias. Dados livres para usar, citando o caiu.pt.</p>',
                      f'<ul class="{"pp-rel" if feitos else "es-vazio"}">{itens}</ul></div></section></main>', rodape(D.dia, hora)])


def opcional(nome, f, padrao):
    """Partes que não podem impedir as outras páginas de sair: se falharem, fica o aviso e segue."""
    try:
        return f()
    except Exception as ex:  # noqa: BLE001
        print(f'AVISO: {nome} falhou: {type(ex).__name__}: {ex}', file=sys.stderr)
        return padrao


def escrever(raiz, caminho, texto):
    f = os.path.join(raiz, *caminho.strip('/').split('/'))
    os.makedirs(os.path.dirname(f), exist_ok=True)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(texto)


def urlset(itens):
    """itens: [(url, lastmod)]"""
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + ''.join(f'  <url><loc>{e(u)}</loc><lastmod>{d}</lastmod></url>\n' for u, d in itens) + '</urlset>\n')


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
    hoje = D.dia
    termos = ler_termos()
    feitos = OrderedDict()  # secção -> [(termo, n)]
    gss = OrderedDict()
    for sec, t in termos:
        gs = D.produtos(t, sec)
        if len(gs) >= MIN_PRODUTOS:
            gss[t] = (sec, gs)
            feitos.setdefault(sec, []).append((t, len(gs)))
    novo = os.path.join(pasta, 'paginas.novo')
    shutil.rmtree(novo, ignore_errors=True)
    os.makedirs(novo)
    lastmod = {}  # url -> dia, para os sitemaps

    # produtos com página: endereços que não mudam (estado-paginas.json) e ligações a partir das outras páginas
    f_est = os.path.join(pasta, 'estado-paginas.json')
    est = ler_json(f_est, {})
    URLS.clear()
    prods, reenc = produtos_do_dia(D, est, gss)

    for t, (sec, gs) in gss.items():
        irmaos = [x for x, _ in feitos[sec] if x != t][:24]
        s, doc = pagina_termo(D, sec, t, gs, irmaos, hora)
        escrever(novo, f'preco/{s}/index.html', doc)
        lastmod[f'{SITE}/preco/{s}/'] = hoje
    escrever(novo, 'preco/index.html', pagina_indice(D, feitos, hora))
    lastmod[SITE + '/preco/'] = hoje

    n_idx = 0
    for sl, P in prods.items():
        escrever(novo, f'produto/{sl}/index.html', pagina_produto(D, P, hora, irmaos_de(P, gss)))
        if P['indexavel']:
            n_idx += 1
    for sl, alvo in reenc.items():
        escrever(novo, f'produto/{sl}/index.html', pagina_reencaminhar(alvo))
    # para o comparador ligar à página do produto (só os de hoje)
    escrever(novo, 'produto/ids.json', json.dumps({g: u.split('/')[2] for g, u in URLS.items()}, separators=(',', ':')))
    escrever(novo, 'produto/index.html', pagina_produtos_indice(D, prods, gss, hora))

    # promoções da semana por loja (/promocoes/<loja>/) e «qual é o mais barato» (/supermercado-mais-barato/)
    ms = opcional('mudanças da semana', lambda: mudancas_semana(D, hoje), {})
    por_loja = OrderedDict((l, v) for l, v in ((l, promos_loja(D, l)) for l in LOJAS) if v)
    if por_loja:
        escrever(novo, 'promocoes/index.html', pagina_promocoes(D, por_loja, hora))
        lastmod[SITE + '/promocoes/'] = hoje
        for l, pares in por_loja.items():
            escrever(novo, f'promocoes/{SLUG_LOJA[l]}/index.html', pagina_loja(D, l, pares, hora, ms))
            lastmod[f'{SITE}/promocoes/{SLUG_LOJA[l]}/'] = hoje
    mb = pagina_mais_barato(D, hora)
    if mb:
        escrever(novo, 'supermercado-mais-barato/index.html', mb)
        lastmod[SITE + '/supermercado-mais-barato/'] = hoje
    cz, csv = opcional('cabaz', lambda: pagina_cabaz(D, hora), (None, None))
    if cz:
        escrever(novo, 'cabaz-mais-barato/index.html', cz)
        escrever(novo, 'cabaz-mais-barato/historico.csv', csv)
        lastmod[SITE + '/cabaz-mais-barato/'] = hoje

    # estudos: guarda os números de hoje e faz o estudo de cada mês que já tem dados que cheguem
    f_estudos = os.path.join(pasta, 'estado-estudos.json')
    ee = ler_json(f_estudos, {})
    ee.setdefault('dias', {})[hoje] = opcional('números do dia', lambda: foto_do_dia(D, ms), {})
    ee['dias'] = dict(sorted(ee['dias'].items())[-400:])
    feitos_e, motivos = [], []
    a, m = int(ESSENCIAL_DESDE[:4]), int(ESSENCIAL_DESDE[5:7])
    while (a, m) <= (int(hoje[:4]), int(hoje[5:7])):
        s_e, r = opcional(f'estudo {m}/{a}', lambda: estudo_mes(D, ee, a, m), (None, f'{m}/{a}: erro'))
        if s_e:
            pag, com, csv_e, tit = r
            escrever(novo, f'estudos/{s_e}/index.html', pag)
            escrever(novo, f'estudos/{s_e}/dados.csv', csv_e)
            # o comunicado não fica público: alertas.py manda-o por e-mail ao administrador para ele o enviar
            escrever(pasta, f'estudos-para-enviar/{s_e}.txt', com)
            feitos_e.append((s_e, tit))
            lastmod[f'{SITE}/estudos/{s_e}/'] = ee.setdefault('publicados', {}).setdefault(s_e, hoje)
        else:
            motivos.append(r)
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    escrever(novo, 'estudos/index.html', pagina_estudos(D, list(reversed(feitos_e)), hora))
    if feitos_e:
        lastmod[SITE + '/estudos/'] = hoje

    # sitemaps: índice em /sitemap.xml, páginas e produtos (só os que entram no Google) à parte
    paginas_sm = [(SITE + '/', hoje)] + sorted(lastmod.items(), key=lambda x: x[0])
    prod_sm = sorted(((f'{SITE}/produto/{sl}/', P['lastmod']) for sl, P in prods.items() if P['indexavel']), key=lambda x: x[0])
    escrever(novo, 'sitemap-paginas.xml', urlset(paginas_sm))
    partes = [prod_sm[i:i + 40000] for i in range(0, len(prod_sm), 40000)] or [[]]
    nomes = []
    for k, parte in enumerate(partes):
        nome = 'sitemap-produtos.xml' if k == 0 else f'sitemap-produtos-{k + 1}.xml'
        escrever(novo, nome, urlset(parte))
        nomes.append((nome, max((d for _, d in parte), default=hoje)))
    escrever(novo, 'sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
             + f'  <sitemap><loc>{SITE}/sitemap-paginas.xml</loc><lastmod>{hoje}</lastmod></sitemap>\n'
             + ''.join(f'  <sitemap><loc>{SITE}/{n}</loc><lastmod>{d}</lastmod></sitemap>\n' for n, d in nomes) + '</sitemapindex>\n')
    # o endereço antigo do sitemap dos preços continua a responder
    escrever(novo, 'preco/sitemap.xml', urlset([(u, d) for u, d in paginas_sm if '/preco/' in u]))

    # troca de uma vez (o Caddy serve sempre uma pasta completa); o estado só se grava depois de tudo correr bem
    final = os.path.join(pasta, 'paginas')
    velho = os.path.join(pasta, 'paginas.velho')
    shutil.rmtree(velho, ignore_errors=True)
    if os.path.isdir(final):
        os.rename(final, velho)
    os.rename(novo, final)
    shutil.rmtree(velho, ignore_errors=True)
    gravar_json(f_est, est)
    gravar_json(f_estudos, ee)
    print(json.dumps({'paginas': len(gss), 'produtos': len(prods), 'produtos_no_google': n_idx, 'reencaminhados': len(reenc),
                      'fora_de_hoje': sum(1 for P in prods.values() if not P['presente']), 'estudos': [s for s, _ in feitos_e],
                      'estudos_por_fazer': motivos, 'dia': hoje, 'secoes': {k: len(v) for k, v in feitos.items()}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
