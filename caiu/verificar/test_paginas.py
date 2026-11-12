"""Testa caiu/paginas.py com uma amostra dos preços reais (caiu/verificar/amostra, 11/11/2026, com o histórico de cada
produto em amostra/h): páginas certas (o «sal» não traz salsichas), títulos e descrições com o tamanho do Google,
canonical, sitemaps, nada das marcas próprias das lojas, preços por litro impossíveis fora, troca de pasta sem restos,
páginas de produto (resposta no topo, schema Product só com preços verdadeiros, só produtos com dados que cheguem),
endereços que não mudam de uma recolha para a outra, produtos que desaparecem e produtos que se juntam, e o cabaz.
Uso: python3 caiu/verificar/test_paginas.py
"""
import html as H, json, os, re, shutil, sqlite3, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CAIU = os.path.dirname(AQUI)
falhas = 0


def ok(nome, cond, extra=''):
    global falhas
    if not cond:
        falhas += 1
    print(('OK     ' if cond else 'FALHOU ') + nome + (f'  {extra}' if extra else ''))


def correr(pasta):
    r = subprocess.run([sys.executable, os.path.join(CAIU, 'paginas.py'), pasta], capture_output=True, text=True)
    return r


pasta = tempfile.mkdtemp(prefix='caiu-paginas-')
for f in ('lista.json', 'resumo.json'):
    shutil.copy(os.path.join(AQUI, 'amostra', f), pasta)
shutil.copytree(os.path.join(AQUI, 'amostra', 'h'), os.path.join(pasta, 'h'))
os.makedirs(os.path.join(pasta, 'paginas', 'velha'))  # página de uma recolha anterior: tem de desaparecer
r = correr(pasta)
ok('[correr] termina sem erro', r.returncode == 0, (r.stderr or '')[-400:])
P = os.path.join(pasta, 'paginas')
ler = lambda *c: open(os.path.join(P, *c), encoding='utf-8').read()
existe = lambda *c: os.path.exists(os.path.join(P, *c))

ok('[páginas] azeite, sal, leite e mimosa', all(existe('preco', s, 'index.html') for s in ('azeite', 'sal', 'leite', 'mimosa')))
ok('[páginas] nada das marcas próprias (Continente, Pingo Doce, Auchan)', not existe('preco', 'continente') and not existe('preco', 'pingo-doce') and not existe('preco', 'auchan'))
ok('[troca] sem restos da recolha anterior nem pastas temporárias', not existe('velha') and not os.path.exists(os.path.join(pasta, 'paginas.novo')) and not os.path.exists(os.path.join(pasta, 'paginas.velho')))

sal = ler('preco', 'sal', 'index.html')
nomes_sal = re.findall(r'class="ln__nome"><a [^>]*>([^<]+)<', sal) + re.findall(r'class="et__nome"><a [^>]*>([^<]+)<', sal)
ok('[relevância] a página do sal só tem sal (nada de salsichas ou salmão)', nomes_sal and all(n.lower().startswith('sal ') for n in nomes_sal), str([n for n in nomes_sal if not n.lower().startswith('sal')][:3]))
if existe('preco', 'limao', 'index.html'):
    lim = ler('preco', 'limao', 'index.html')
    ok('[relevância] a página do limão não tem ice tea nem detergente', 'Ice Tea' not in lim and 'Detergente' not in lim)

termos = [d for d in os.listdir(os.path.join(P, 'preco')) if os.path.isdir(os.path.join(P, 'preco', d))]
for s in termos:
    h = ler('preco', s, 'index.html')
    t = re.search(r'<title>([^<]*)</title>', h).group(1)
    d = H.unescape(re.search(r'<meta name="description" content="([^"]*)"', h).group(1))
    if len(t) > 75 or len(d) > 155 or h.count('<h1') != 1 or f'<link rel="canonical" href="https://caiu.pt/preco/{s}/">' not in h:
        ok(f'[{s}] título, descrição, h1 e canonical', False, f'{len(t)} {len(d)} {h.count("<h1")}')
        break
else:
    ok('[todas] título até 75 caracteres, descrição até 155, um h1 e canonical certo', True)

az = ler('preco', 'azeite', 'index.html')
ok('[azeite] título para o Google', '<title>Azeite mais barato hoje: Continente, Pingo Doce e Auchan</title>' in az)
ok('[azeite] preços com vírgula e €', re.search(r'\d,\d\d\xa0€', az) is not None and 'NaN' not in az and 'None' not in az and 'undefined' not in az)
ok('[azeite] diz a hora da recolha', 'às <time>17:52</time>' in az)
ok('[azeite] liga ao comparador e às páginas dos produtos', 'href="/#q=azeite"' in az and 'href="/produto/' in az)
pus = [float(x.replace(',', '.')) for x in re.findall(r'<span>(\d+,\d\d)\xa0€/L</span>', az)]
ok('[azeite] mais barato por litro: por ordem e sem preços impossíveis', pus == sorted(pus) and pus and min(pus) > 2, str(pus[:5]))
le = ler('preco', 'leite', 'index.html')
pul = [float(x.replace(',', '.')) for x in re.findall(r'<span>(\d+,\d\d)\xa0€/L</span>', le)]
ok('[leite] o leite «6 × 1 L a 1,29 €» (0,22 €/L, erro da loja) não aparece como o mais barato', pul and min(pul) > 0.4, str(pul[:5]))

sm = ler('preco', 'sitemap.xml')
urls = re.findall(r'<loc>([^<]+)</loc>', sm)
ok('[sitemap dos preços] tem o índice e todas as páginas de termo', 'https://caiu.pt/preco/' in urls and len(urls) == len(termos) + 1, f'{len(urls)} {len(termos)}')
ind = ler('preco', 'index.html')
ok('[índice] liga a todas as páginas', all(f'href="/preco/{s}/"' in ind for s in termos))
ok('[rodapé] feito por dinissousa.pt', 'Feito por <a href="https://dinissousa.pt"' in az and 'claude' not in az.lower())

# promoções da semana por loja e «qual é o supermercado mais barato»
for loja, nome in (('continente', 'Continente'), ('pingo-doce', 'Pingo Doce'), ('auchan', 'Auchan')):
    ok(f'[promoções] página do {nome}', existe('promocoes', loja, 'index.html'))
    h = ler('promocoes', loja, 'index.html')
    t = re.search(r'<title>([^<]*)</title>', h).group(1); d = H.unescape(re.search(r'<meta name="description" content="([^"]*)"', h).group(1))
    ok(f'[promoções {nome}] título, descrição, h1, canonical e sem valores partidos',
       t.startswith(f'Promoções {nome} esta semana') and len(t) <= 70 and len(d) <= 155 and h.count('<h1') == 1
       and f'<link rel="canonical" href="https://caiu.pt/promocoes/{loja}/">' in h and 'NaN' not in h and 'None' not in h, f'{len(t)} {len(d)}')
    outras = [x for x in ('continente', 'pingo-doce', 'auchan') if x != loja]
    ok(f'[promoções {nome}] liga às outras lojas, ao mais barato e ao cabaz', all(f'href="/promocoes/{x}/"' in h for x in outras)
       and 'href="/supermercado-mais-barato/"' in h and 'href="/cabaz-mais-barato/"' in h)
pd = ler('promocoes', 'pingo-doce', 'index.html')
ok('[promoções Pingo Doce] diz quando acaba a maioria («Promoção até 16/11» = segunda-feira)', 'acabam na segunda-feira, 16 de novembro' in pd, re.findall(r'acabam [^.<]*', pd)[:2])
ok('[promoções] o que mudou de preço na semana, com o preço de há 7 dias', 'O que mudou de preço no' in pd and '→' in pd)
hub = ler('promocoes', 'index.html')
ok('[promoções] página geral liga às três lojas', all(f'href="/promocoes/{x}/"' in hub for x in ('continente', 'pingo-doce', 'auchan')))
mb = ler('supermercado-mais-barato', 'index.html')
ok('[mais barato] ordem certa (Auchan, Pingo Doce, Continente) e totais com €',
   '<title>Supermercado mais barato hoje: Auchan, Pingo Doce ou Continente?</title>' in mb and '1161,74\xa0€' in mb and '1087,36\xa0€' in mb)
ok('[mais barato] FAQ em JSON-LD válido', '"@type":"FAQPage"' in mb)


def jsonld(h):
    return [json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)]


todas = [os.path.join(r, n) for r, _, fs in os.walk(P) for n in fs if n == 'index.html']
for f in todas:
    for j in jsonld(open(f, encoding='utf-8').read()):
        pass
ok('[JSON-LD] válido em todas as páginas', True)
ok('[JSON-LD] organização e site em todas as páginas', all('"@id":"https://caiu.pt/#organizacao"' in open(f, encoding='utf-8').read() for f in todas if 'refresh' not in open(f, encoding='utf-8').read()))

# sitemaps: índice com páginas e produtos
idx = ler('sitemap.xml')
ok('[sitemap] índice com páginas e produtos', '<sitemapindex' in idx and 'https://caiu.pt/sitemap-paginas.xml' in idx and 'https://caiu.pt/sitemap-produtos.xml' in idx)
raiz = re.findall(r'<loc>([^<]+)</loc>', ler('sitemap-paginas.xml'))
ok('[sitemap das páginas] início, promoções, mais barato, cabaz e preços', {'https://caiu.pt/', 'https://caiu.pt/promocoes/', 'https://caiu.pt/promocoes/pingo-doce/',
   'https://caiu.pt/supermercado-mais-barato/', 'https://caiu.pt/cabaz-mais-barato/', 'https://caiu.pt/preco/azeite/'} <= set(raiz) and len(raiz) == len(set(raiz)))
ok('[rodapé] liga às promoções, ao cabaz e ao mais barato', 'href="/promocoes/"' in az and 'href="/supermercado-mais-barato/"' in az and 'href="/cabaz-mais-barato/"' in az)

# ---------- páginas de produto ----------
lista = json.load(open(os.path.join(pasta, 'lista.json'), encoding='utf-8'))
est = json.load(open(os.path.join(pasta, 'estado-paginas.json'), encoding='utf-8'))
prod_urls = re.findall(r'<loc>https://caiu.pt/produto/([^/<]+)/</loc>', ler('sitemap-produtos.xml'))
pags = [d for d in os.listdir(os.path.join(P, 'produto')) if os.path.isdir(os.path.join(P, 'produto', d))]
ok('[produtos] há páginas e estão todas no sitemap', len(pags) > 100 and sorted(prod_urls) == sorted(pags), f'{len(pags)} {len(prod_urls)}')
g_de = {a[0]: a for a in lista['g']}
sem = [a for a in lista['g'] if len(a[7]) == 1 and max(x[11] for x in a[7]) < 7]
ok('[produtos] só uma loja e menos de 7 dias de registos: sem página', sem and all(not any(est['k'].get(x[0] + x[1]) for x in a[7]) for a in sem), str(len(sem)))
erros = []
for s in pags:
    h = ler('produto', s, 'index.html')
    m = re.search(r'<p class="pr-resposta">(.*?)</p>', h, re.S)
    w = len(H.unescape(re.sub(r'<[^>]+>', '', m.group(1))).split()) if m else 0
    t = H.unescape(re.search(r'<title>([^<]*)</title>', h).group(1))
    d = H.unescape(re.search(r'<meta name="description" content="([^"]*)"', h).group(1))
    vis = sorted(float(f'{a}.{b}') for a, b in re.findall(r'<span class="fp__precos"><span class="preco">(\d+),(\d\d)', h))
    prods = [n for j in jsonld(h) for n in j['@graph'] if n.get('@type') == 'Product']
    if not (40 <= w <= 60):
        erros.append((s, 'resposta', w))
    if len(t) > 60 or len(d) > 155 or h.count('<h1') != 1 or f'<link rel="canonical" href="https://caiu.pt/produto/{s}/">' not in h:
        erros.append((s, 'título/descrição/h1/canonical', len(t), len(d)))
    if '<time datetime=' not in h or 'noindex' in h[:2500]:
        erros.append((s, 'data ou noindex'))
    if len(prods) != 1:
        erros.append((s, 'sem Product'))
    else:
        o = prods[0]['offers']
        ps = sorted(float(x['price']) for x in o['offers'])
        if not (o['@type'] == 'AggregateOffer' and o['priceCurrency'] == 'EUR' and float(o['lowPrice']) == ps[0]
                and float(o['highPrice']) == ps[-1] and o['offerCount'] == len(ps) and ps == vis):
            erros.append((s, 'AggregateOffer diferente dos preços à vista', o, vis))
    if '<svg class="grafico' not in h and 'Preço nos últimos' in h:
        erros.append((s, 'histórico sem gráfico'))
    if 'Preço nos últimos' not in h and 'Começámos a registar' not in h:
        erros.append((s, 'sem histórico nem aviso'))
ok('[produtos] resposta de 40 a 60 palavras, título até 60, descrição até 155, h1, canonical, data, Product = preços à vista', not erros, str(erros[:3]))
MIG = r'class="pp-migalhas">[^\n]*?href="(/preco/[^/"]+/)"'
um = next(s for s in sorted(pags) if 'Últimas mudanças de preço' in ler('produto', s, 'index.html') and re.search(MIG, ler('produto', s, 'index.html')))
h = ler('produto', um, 'index.html')
termo_um = re.search(MIG, h).group(1)
ok('[produto] histórico: tabela dia a dia, mudanças e mínimo dos 30 dias', 'Ver os preços dia a dia' in h and 'Últimas mudanças de preço' in h and 'Mais baixo nos' in h, um)
ok('[produto] liga à página do termo e a outros produtos, e ao comparador para seguir o preço',
   f'href="{termo_um}"' in h and h.count('href="/produto/') >= 3 and 'href="/#p=' in h, um)
ok('[produto] a página do termo liga a este produto', f'href="/produto/{um}/"' in ler(*termo_um.strip('/').split('/'), 'index.html'))
ids = json.loads(ler('produto', 'ids.json'))
ok('[produto] ids.json para o comparador ligar às páginas', len(ids) == len(pags) and all(v in pags for v in ids.values()))
ok('[produto] /produto/ fora do Google mas a ligar a tudo', 'noindex, follow' in ler('produto', 'index.html'))

# ---------- cabaz ----------
cz = ler('cabaz-mais-barato', 'index.html')
m = re.search(r'<p class="pr-resposta">(.*?)</p>', cz, re.S)
w = len(H.unescape(re.sub(r'<[^>]+>', '', m.group(1))).split()) if m else 0
ok('[cabaz] resposta no topo com 40 a 60 palavras e as três lojas', 40 <= w <= 60 and all(n in m.group(1) for n in ('Continente', 'Pingo Doce', 'Auchan')), str(w))
ok('[cabaz] Dataset com CSV, e o CSV existe', '"@type":"Dataset"' in cz and existe('cabaz-mais-barato', 'historico.csv')
   and ler('cabaz-mais-barato', 'historico.csv').startswith('dia,continente,pingo_doce,auchan'))
ok('[cabaz] título', '<title>Cabaz mais barato esta semana: Continente, Pingo Doce ou Auchan?</title>' in cz)
ok('[estudos] ainda sem estudo (o mês não acabou)', not existe('estudos'))

# ---------- segunda recolha: endereços iguais, produto que desaparece, produtos que se juntam ----------
antes = {s: json.dumps(est['s'][s].get('k')) for s in pags}
pares = [(a, b) for a in lista['g'] for b in lista['g'] if len(a[7]) == 1 and len(b[7]) == 1 and a[7][0][0] == 'c' and b[7][0][0] == 'a'
         and est['k'].get('c' + a[7][0][1]) and est['k'].get('a' + b[7][0][1])]
a, b = pares[0]
sl_a, sl_b = est['k']['c' + a[7][0][1]], est['k']['a' + b[7][0][1]]
some = next(x for x in lista['g'] if len(x[7]) >= 2 and est['k'].get(x[7][0][0] + x[7][0][1]) not in (sl_a, sl_b))
sl_some = est['k'][some[7][0][0] + some[7][0][1]]
novos = []
for x in lista['g']:
    if x is some or x is b:
        continue
    if x is a:
        x = list(x)
        x[7] = x[7] + b[7]  # o mesmo produto encontrado agora nas duas lojas
    novos.append(x)
lista['g'] = novos
lista['dia'] = '2026-11-12'
json.dump(lista, open(os.path.join(pasta, 'lista.json'), 'w', encoding='utf-8'), ensure_ascii=False)
res = json.load(open(os.path.join(pasta, 'resumo.json'), encoding='utf-8'))
res['dia'] = '2026-11-12'
json.dump(res, open(os.path.join(pasta, 'resumo.json'), 'w', encoding='utf-8'), ensure_ascii=False)
db = sqlite3.connect(os.path.join(pasta, 'historico.db'))
db.executescript('create table produtos(loja text, id text, nome text, marca text, cat text, qtd text, pun real, un text, img text, url text, visto text, primary key(loja, id));'
                 'create table precos(loja text, id text, dia text, preco real, antes real, pvpr real, promo text, primary key(loja, id, dia));')
LJ = {'c': 'continente', 'p': 'pingodoce', 'a': 'auchan'}
for o in some[7]:
    db.execute('insert into produtos values (?,?,?,?,?,?,?,?,?,?,?)', (LJ[o[0]], o[1], some[1], some[2], '', some[3], o[3], o[4], '', o[10], '2026-11-11'))
    for d, p in (('2026-11-10', o[2] + 0.1), ('2026-11-11', o[2])):
        db.execute('insert into precos values (?,?,?,?,?,?,?)', (LJ[o[0]], o[1], d, p, None, None, ''))
db.commit(); db.close()
r = correr(pasta)
ok('[2.ª recolha] termina sem erro', r.returncode == 0, (r.stderr or '')[-400:])
est2 = json.load(open(os.path.join(pasta, 'estado-paginas.json'), encoding='utf-8'))
pags2 = [d for d in os.listdir(os.path.join(P, 'produto')) if os.path.isdir(os.path.join(P, 'produto', d))]
iguais = [s for s in pags if s not in (sl_a, sl_b, sl_some) and s in pags2]
ok('[2.ª recolha] os endereços dos produtos não mudam', len(iguais) == len(pags) - 3, f'{len(iguais)} de {len(pags) - 3}')
g_some = ler('produto', sl_some, 'index.html') if os.path.exists(os.path.join(P, 'produto', sl_some, 'index.html')) else ''
ok('[2.ª recolha] produto que não apareceu: a página fica, com o último preço visto e sem schema de oferta',
   'não o encontrámos nas pesquisas de hoje' in g_some and '"@type":"Product"' not in g_some and f'/produto/{sl_some}/' in ler('sitemap-produtos.xml'), sl_some)
fica = sorted((sl_a, sl_b), key=lambda s: (est['s'][s]['criado'], s))[0]
sai = sl_b if fica == sl_a else sl_a
red = ler('produto', sai, 'index.html')
ok('[2.ª recolha] dois produtos que se juntam: um endereço fica, o outro reencaminha para ele',
   f'url=/produto/{fica}/' in red and 'noindex' in red and f'/produto/{sai}/' not in ler('sitemap-produtos.xml')
   and est2['s'][sai].get('alias') == fica, f'{fica} {sai}')
juntos = ler('produto', fica, 'index.html')
ok('[2.ª recolha] o produto junto mostra as duas lojas', 'Continente' in juntos and 'Auchan' in juntos and juntos.count('<li class="fp__loja') == 2, fica)

print("PASTA", pasta) if falhas else shutil.rmtree(pasta, ignore_errors=True)
print(f'\n{falhas} falha(s)' if falhas else '\nTudo OK')
sys.exit(1 if falhas else 0)
