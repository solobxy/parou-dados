# O que as pessoas escrevem no Google e no Bing, a partir de sementes por site (sugestões automáticas).
# Não dá volumes, mas a ordem das sugestões segue a popularidade. Uso: python3 sugestoes_pesquisa.py [site ...]
import json, sys, time, urllib.parse, urllib.request

LETRAS = ' abcdefghijlmnopqrstuvxz'
# site: [(semente, língua, país, expandir com letras)]
SEMENTES = {
    'caiu': [('preço', 'pt', 'pt', 0), ('promoções continente', 'pt', 'pt', 1), ('promoções pingo doce', 'pt', 'pt', 1),
             ('folheto', 'pt', 'pt', 0), ('supermercado mais barato', 'pt', 'pt', 1), ('preço do azeite', 'pt', 'pt', 1),
             ('preço do', 'pt', 'pt', 1), ('comparar preços', 'pt', 'pt', 1), ('promoções auchan', 'pt', 'pt', 0),
             ('cabaz', 'pt', 'pt', 0), ('descontos falsos', 'pt', 'pt', 0)],
    'ganhas': [('salário', 'pt', 'pt', 1), ('salário líquido', 'pt', 'pt', 1), ('simulador', 'pt', 'pt', 1),
               ('quanto ganha um', 'pt', 'pt', 1), ('ordenado', 'pt', 'pt', 1), ('calcular irs', 'pt', 'pt', 1),
               ('recibos verdes', 'pt', 'pt', 1), ('salário médio', 'pt', 'pt', 0), ('salário mínimo', 'pt', 'pt', 0),
               ('salary portugal', 'en', 'pt', 1), ('net salary portugal', 'en', 'pt', 0), ('portugal tax calculator', 'en', 'pt', 0),
               ('average salary in portugal', 'en', 'pt', 0), ('salario portugal', 'es', 'pt', 0)],
    'duplicasa': [('casas para alugar', 'pt', 'pt', 1), ('arrendar', 'pt', 'pt', 1), ('apartamento para arrendar', 'pt', 'pt', 1),
                  ('quarto para alugar', 'pt', 'pt', 1), ('t1 para arrendar', 'pt', 'pt', 1), ('casas para arrendar', 'pt', 'pt', 1),
                  ('arrendamento', 'pt', 'pt', 1), ('rent apartment', 'en', 'pt', 1), ('apartment for rent', 'en', 'pt', 1),
                  ('room for rent', 'en', 'pt', 1), ('rent in portugal', 'en', 'pt', 0), ('alquiler piso', 'es', 'pt', 0),
                  ('location appartement', 'fr', 'pt', 0)],
    'parou': [('horário', 'pt', 'pt', 1), ('horários', 'pt', 'pt', 1), ('autocarro', 'pt', 'pt', 1), ('greve', 'pt', 'pt', 1),
              ('metro do porto', 'pt', 'pt', 1), ('carris metropolitana', 'pt', 'pt', 1), ('stcp', 'pt', 'pt', 1),
              ('cp', 'pt', 'pt', 1), ('comboio', 'pt', 'pt', 1), ('app transportes', 'pt', 'pt', 0),
              ('lisbon bus', 'en', 'pt', 1), ('porto metro', 'en', 'pt', 1), ('lisbon metro', 'en', 'pt', 1),
              ('train lisbon', 'en', 'pt', 1), ('porto bus', 'en', 'pt', 1), ('public transport', 'en', 'pt', 1)],
    'adri': [('piercing porto', 'pt', 'pt', 1), ('body piercing', 'pt', 'pt', 1), ('piercing', 'pt', 'pt', 1),
             ('piercing no', 'pt', 'pt', 1), ('piercing preço', 'pt', 'pt', 0), ('piercing porto', 'en', 'pt', 0),
             ('piercer porto', 'pt', 'pt', 0)],
    'dinissousa': [('criar site', 'pt', 'pt', 1), ('fazer um site', 'pt', 'pt', 1), ('quanto custa um site', 'pt', 'pt', 1),
                   ('web designer', 'pt', 'pt', 1), ('site para', 'pt', 'pt', 1), ('criação de sites', 'pt', 'pt', 1)],
    'tapmoss': [('idle game', 'en', 'us', 1), ('cozy game', 'en', 'us', 1), ('browser game', 'en', 'us', 1),
                ('moss', 'en', 'us', 1), ('garden game', 'en', 'us', 1), ('jogo idle', 'pt', 'pt', 0),
                ('juego idle', 'es', 'es', 0), ('放置ゲーム', 'ja', 'jp', 0)],
}
UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'


def obter(url):
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=15) as r:
                return json.loads(r.read().decode(r.headers.get_content_charset() or 'utf-8', 'replace'))
        except Exception:
            time.sleep(2 + 3 * t)
    return None


def google(q, hl, gl):
    j = obter('https://suggestqueries.google.com/complete/search?' + urllib.parse.urlencode({'client': 'firefox', 'hl': hl, 'gl': gl, 'q': q}))
    return j[1] if j and len(j) > 1 else []


def bing(q, hl, gl):
    j = obter('https://api.bing.com/osjson.aspx?' + urllib.parse.urlencode({'query': q, 'mkt': '%s-%s' % (hl, gl.upper())}))
    return j[1] if j and len(j) > 1 else []


alvo = sys.argv[1:] or list(SEMENTES)
for site in alvo:
    pontos = {}
    for sem, hl, gl, exp in SEMENTES[site]:
        qs = [sem] + ([sem + ' ' + l for l in LETRAS.strip()] if exp else [])
        for q in qs:
            for fonte, peso in ((google, 1.0), (bing, 0.6)):
                if fonte is bing and q != sem:
                    continue
                for i, s in enumerate(fonte(q, hl, gl)):
                    s = s.strip().lower()
                    pontos[s] = pontos.get(s, 0) + peso * (10 - min(i, 9)) * (1.5 if q == sem else 1)
                time.sleep(0.12)
    ordem = sorted(pontos, key=lambda s: -pontos[s])
    print('\n=== %s (%d pesquisas)' % (site, len(ordem)))
    print(' | '.join(ordem[:260]))
