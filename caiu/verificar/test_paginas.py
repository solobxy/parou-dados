"""Testa caiu/paginas.py com uma amostra dos preços reais (caiu/verificar/amostra, 11/11/2026):
páginas certas (o «sal» não traz salsichas), títulos e descrições com o tamanho do Google, canonical, sitemap,
nada das marcas próprias das lojas, preços por litro impossíveis fora e troca de pasta sem restos.
Uso: python3 caiu/verificar/test_paginas.py
"""
import os, re, shutil, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CAIU = os.path.dirname(AQUI)
falhas = 0


def ok(nome, cond, extra=''):
    global falhas
    if not cond:
        falhas += 1
    print(('OK     ' if cond else 'FALHOU ') + nome + (f'  {extra}' if extra else ''))


pasta = tempfile.mkdtemp(prefix='caiu-paginas-')
for f in ('lista.json', 'resumo.json'):
    shutil.copy(os.path.join(AQUI, 'amostra', f), pasta)
os.makedirs(os.path.join(pasta, 'paginas', 'velha'))  # página de uma recolha anterior: tem de desaparecer
r = subprocess.run([sys.executable, os.path.join(CAIU, 'paginas.py'), pasta], capture_output=True, text=True)
ok('[correr] termina sem erro', r.returncode == 0, (r.stderr or '')[-300:])
P = os.path.join(pasta, 'paginas')
ler = lambda *c: open(os.path.join(P, *c), encoding='utf-8').read()
existe = lambda *c: os.path.exists(os.path.join(P, *c))

ok('[páginas] azeite, sal, leite e mimosa', all(existe(s, 'index.html') for s in ('azeite', 'sal', 'leite', 'mimosa')))
ok('[páginas] nada das marcas próprias (Continente, Pingo Doce, Auchan)', not existe('continente') and not existe('pingo-doce') and not existe('auchan'))
ok('[troca] sem restos da recolha anterior nem pastas temporárias', not existe('velha') and not os.path.exists(os.path.join(pasta, 'paginas.novo')) and not os.path.exists(os.path.join(pasta, 'paginas.velho')))

sal = ler('sal', 'index.html')
nomes_sal = re.findall(r'class="ln__nome"><a [^>]*>([^<]+)<', sal) + re.findall(r'class="et__nome"><a [^>]*>([^<]+)<', sal)
ok('[relevância] a página do sal só tem sal (nada de salsichas ou salmão)', nomes_sal and all(n.lower().startswith('sal ') or n.lower().startswith('sal ') for n in nomes_sal), str([n for n in nomes_sal if not n.lower().startswith('sal')][:3]))
if existe('limao', 'index.html'):
    lim = ler('limao', 'index.html')
    ok('[relevância] a página do limão não tem ice tea nem detergente', 'Ice Tea' not in lim and 'Detergente' not in lim)

EXTRA = {'promocoes', 'supermercado-mais-barato'}
for s in [d for d in os.listdir(P) if os.path.isdir(os.path.join(P, d)) and d not in EXTRA]:
    h = ler(s, 'index.html')
    t = re.search(r'<title>([^<]*)</title>', h).group(1)
    d = re.search(r'<meta name="description" content="([^"]*)"', h).group(1)
    if len(t) > 75 or len(d) > 160 or h.count('<h1') != 1 or f'<link rel="canonical" href="https://caiu.pt/preco/{s}/">' not in h:
        ok(f'[{s}] título, descrição, h1 e canonical', False, f'{len(t)} {len(d)} {h.count("<h1")}')
        break
else:
    ok('[todas] título até 75 caracteres, descrição até 160, um h1 e canonical certo', True)

az = ler('azeite', 'index.html')
ok('[azeite] título para o Google', '<title>Azeite mais barato hoje: Continente, Pingo Doce e Auchan</title>' in az)
ok('[azeite] preços com vírgula e €', re.search(r'\d,\d\d €', az) is not None and 'NaN' not in az and 'None' not in az and 'undefined' not in az)
ok('[azeite] diz a hora da recolha', 'às 17:52' in az)
ok('[azeite] liga ao comparador e à folha do produto', 'href="/#q=azeite"' in az and 'href="/#p=' in az)
pus = [float(x.replace(',', '.')) for x in re.findall(r'<span>(\d+,\d\d) €/L</span>', az)]
ok('[azeite] mais barato por litro: por ordem e sem preços impossíveis', pus == sorted(pus) and pus and min(pus) > 2, str(pus[:5]))
le = ler('leite', 'index.html')
pul = [float(x.replace(',', '.')) for x in re.findall(r'<span>(\d+,\d\d) €/L</span>', le)]
ok('[leite] o leite «6 × 1 L a 1,29 €» (0,22 €/L, erro da loja) não aparece como o mais barato', pul and min(pul) > 0.4, str(pul[:5]))

sm = ler('sitemap.xml')
urls = re.findall(r'<loc>([^<]+)</loc>', sm)
paginas = [d for d in os.listdir(P) if os.path.isdir(os.path.join(P, d)) and d not in EXTRA]
ok('[sitemap] tem o índice e todas as páginas', 'https://caiu.pt/preco/' in urls and len(urls) == len(paginas) + 1, f'{len(urls)} {len(paginas)}')
ind = ler('index.html')
ok('[índice] liga a todas as páginas', all(f'href="/preco/{s}/"' in ind for s in paginas))
ok('[rodapé] feito por dinissousa.pt', 'Feito por <a href="https://dinissousa.pt"' in az and 'claude' not in az.lower())

# promoções da semana por loja e «qual é o supermercado mais barato»
for loja, nome in (('continente', 'Continente'), ('pingo-doce', 'Pingo Doce'), ('auchan', 'Auchan')):
    ok(f'[promoções] página do {nome}', existe('promocoes', loja, 'index.html'))
    h = ler('promocoes', loja, 'index.html')
    t = re.search(r'<title>([^<]*)</title>', h).group(1); d = re.search(r'<meta name="description" content="([^"]*)"', h).group(1)
    ok(f'[promoções {nome}] título, descrição, h1, canonical e sem valores partidos',
       t.startswith(f'Promoções {nome} esta semana') and len(t) <= 70 and len(d) <= 160 and h.count('<h1') == 1
       and f'<link rel="canonical" href="https://caiu.pt/promocoes/{loja}/">' in h and 'NaN' not in h and 'None' not in h, f'{len(t)} {len(d)}')
    outras = [x for x in ('continente', 'pingo-doce', 'auchan') if x != loja]
    ok(f'[promoções {nome}] liga às outras lojas e ao mais barato', all(f'href="/promocoes/{x}/"' in h for x in outras) and 'href="/supermercado-mais-barato/"' in h)
pd = ler('promocoes', 'pingo-doce', 'index.html')
ok('[promoções Pingo Doce] diz quando acaba a maioria («Promoção até 16/11» = segunda-feira)', 'acabam na segunda-feira, 16 de novembro' in pd, re.findall(r'acabam [^.<]*', pd)[:2])
hub = ler('promocoes', 'index.html')
ok('[promoções] página geral liga às três lojas', all(f'href="/promocoes/{x}/"' in hub for x in ('continente', 'pingo-doce', 'auchan')))
mb = ler('supermercado-mais-barato', 'index.html')
ok('[mais barato] ordem certa (Auchan, Pingo Doce, Continente) e totais com €',
   '<title>Supermercado mais barato hoje: Auchan, Pingo Doce ou Continente?</title>' in mb and '1161,74\xa0€' in mb and '1087,36\xa0€' in mb)
ok('[mais barato] FAQ em JSON-LD válido', '"@type":"FAQPage"' in mb)
import json as _j
for f in [os.path.join(r, n) for r, _, fs in os.walk(P) for n in fs if n == 'index.html']:
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', open(f, encoding='utf-8').read(), re.S):
        _j.loads(b)
ok('[JSON-LD] válido em todas as páginas', True)
raiz = re.findall(r'<loc>([^<]+)</loc>', ler('sitemap-raiz.xml'))
ok('[sitemap do site] início, promoções, mais barato e preços', {'https://caiu.pt/', 'https://caiu.pt/promocoes/', 'https://caiu.pt/promocoes/pingo-doce/',
   'https://caiu.pt/supermercado-mais-barato/', 'https://caiu.pt/preco/azeite/'} <= set(raiz) and len(raiz) == len(set(raiz)))
ok('[rodapé] liga às promoções e ao mais barato', 'href="/promocoes/"' in az and 'href="/supermercado-mais-barato/"' in az)

shutil.rmtree(pasta, ignore_errors=True)
print(f'\n{falhas} falha(s)' if falhas else '\nTudo OK')
sys.exit(1 if falhas else 0)
