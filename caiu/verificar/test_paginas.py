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

for s in [d for d in os.listdir(P) if os.path.isdir(os.path.join(P, d))]:
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
paginas = [d for d in os.listdir(P) if os.path.isdir(os.path.join(P, d))]
ok('[sitemap] tem o índice e todas as páginas', 'https://caiu.pt/preco/' in urls and len(urls) == len(paginas) + 1, f'{len(urls)} {len(paginas)}')
ind = ler('index.html')
ok('[índice] liga a todas as páginas', all(f'href="/preco/{s}/"' in ind for s in paginas))
ok('[rodapé] feito por dinissousa.pt', 'Feito por <a href="https://dinissousa.pt"' in az and 'claude' not in az.lower())

shutil.rmtree(pasta, ignore_errors=True)
print(f'\n{falhas} falha(s)' if falhas else '\nTudo OK')
sys.exit(1 if falhas else 0)
