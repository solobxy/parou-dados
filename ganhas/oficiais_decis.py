"""ganhas.pt: decis do ganho e da remuneração base a partir da série dos Quadros de Pessoal da DGCP/MTSSS
(quadros 31, 33 e 34 do ficheiro seriesqp_2014_<ano>.xlsx), com as mesmas regras de ganhas/processar.py.
Escreve ganhas/dados/decis.json e refaz a distribuição em oficial.json. Só aceita um ano igual ou mais recente,
e só se a média das médias por decil bater com o ganho médio publicado.
"""
import glob, json, os, re


def _pt(v, casas=1):
    s = f'{v:,.{casas}f}'.replace(',', ' ').replace('.', ',')
    return s


def _ler(xlsx):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)

    def folha(prefixo):
        nome = next(n for n in wb.sheetnames if n.strip() == prefixo)
        return [list(r) for r in wb[nome].iter_rows(values_only=True)]

    def bloco(linhas, titulo, n):
        i = next(k for k, r in enumerate(linhas) if r and isinstance(r[0], str) and r[0].strip().startswith(titulo))
        return linhas[i + 1:i + 1 + n]

    q31, q33, q34 = folha('q31'), folha('q33'), folha('q34')
    anos = next(r for r in q31 if r and any(isinstance(c, int) and 2000 < c < 2100 for c in r[1:]))
    ano = max(c for c in anos if isinstance(c, int) and 2000 < c < 2100)
    col = anos.index(ano)
    base = [r[col] for r in bloco(q31, 'Remuneração base mensal - decis', 9)]
    gdec = [r[col] for r in bloco(q33, 'Ganho mensal - decis', 9)]
    gmed = [r[col] for r in bloco(q33, 'Ganho mensal - média por decil', 10)]
    anos34 = next(r for r in q34 if r and ano in r)
    tot = next(r for r in q34 if r and isinstance(r[0], str) and r[0].strip() == 'Total')
    media = tot[anos34.index(ano)]
    ambito = next((r[0].strip() for r in q31[:4] if r and isinstance(r[0], str) and r[0].strip() in ('Continente', 'Portugal')), 'Continente')
    return ano, ambito, base, gdec, gmed, media


def _serie(dec, decis):
    pontos = [[dec['minimo'], 0]] + [[v, 10 * (k + 1)] for k, v in enumerate(decis)]
    lim = {}
    for x, p in pontos:
        lim[x] = max(p, lim.get(x, 0))
    pontos = [[x, p] for x, p in sorted(lim.items())]

    def cdf(x):
        if x <= pontos[0][0]:
            return pontos[0][1]
        for (x0, p0), (x1, p1) in zip(pontos, pontos[1:]):
            if x <= x1:
                return p0 + (p1 - p0) * (x - x0) / (x1 - x0)
        return None
    ini, passo = 800, 100
    fim = (decis[8] // passo) * passo
    barras, rotulos = [], []
    x = ini
    while x < fim:
        a, b = cdf(x) or 0, cdf(x + passo)
        barras.append(round((b - a) / 100, 4)); rotulos.append(f'{x}–{x + passo} €')
        x += passo
    barras.append(round((100 - cdf(fim)) / 100, 4)); rotulos.append(f'{fim} € ou mais')
    return {'pontos': pontos, 'mediana': decis[4], 'barras': barras, 'rotulos': rotulos, 'eixo': [ini, fim + passo],
            'ate_1000': round(cdf(1000), 1), 'd9': decis[8]}


def atualizar(O, F, DECIS):
    fx = sorted(glob.glob(os.path.join(F, 'dgcp', 'seriesqp_*.xlsx')))
    assert fx, 'sem o ficheiro da DGCP'
    ano, ambito, base, gdec, gmed, media = _ler(fx[-1])
    velho = json.load(open(DECIS, encoding='utf-8')) if os.path.exists(DECIS) else {}
    assert ano >= int(velho.get('ano') or 0), f'ano {ano} mais antigo'
    assert len(base) == 9 and len(gdec) == 9 and len(gmed) == 10, 'quadros incompletos'
    assert all(isinstance(v, (int, float)) for v in base + gdec + gmed + [media]), 'valores em falta'
    assert all(a <= b for a, b in zip(gdec, gdec[1:])) and all(a <= b for a, b in zip(base, base[1:])), 'decis fora de ordem'
    m10 = sum(gmed) / 10
    assert abs(m10 - media) < 1.5, f'a média das médias por decil ({m10:.1f}) não bate com o ganho médio ({media})'
    minimo = (O.get('smn') or {}).get(str(ano)) or round(base[0])
    url = open(os.path.join(F, 'dgcp', 'url.txt')).read().strip() if os.path.exists(os.path.join(F, 'dgcp', 'url.txt')) else velho.get('url', '')
    dec = {
        'fonte': f'DGCP/MTSSS, Quadros de Pessoal, séries 2014-{ano} (quadros 31 e 33)',
        'url': url if ano != velho.get('ano') else velho.get('url', url),
        'ref': f'outubro de {ano}, {ambito}, trabalhadores por conta de outrem a tempo completo com remuneração completa',
        'ano': ano, 'ambito': ambito, 'minimo': minimo,
        'ganho': {'decis': [round(v) for v in gdec], 'media_por_decil': [round(v) for v in gmed], 'media': round(media, 1)},
        'base': {'decis': [round(v) for v in base]},
        'verificacao': f'A média das médias por decil do ganho ({_pt(m10)} €) coincide com o ganho médio publicado no quadro 34 ({_pt(media)} €).',
    }
    if dec != velho:
        tmp = DECIS + '.novo'
        json.dump(dec, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        os.replace(tmp, DECIS)
    O['distribuicao'] = {'ano': dec['ano'], 'ambito': dec['ambito'], 'ref': dec['ref'], 'minimo': dec['minimo'],
                         'media': dec['ganho']['media'], 'media_topo': dec['ganho']['media_por_decil'][9],
                         'ganho': _serie(dec, dec['ganho']['decis']), 'base': _serie(dec, dec['base']['decis'])}
    O['fontes']['decis'] = {'nome': dec['fonte'], 'url': dec['url'], 'ref': dec['ref'],
                            'descricao': 'decis da remuneração base e do ganho mensal; entre decis, o ganhas.pt assume uma distribuição uniforme'}
    return f'{ano}, mediana do ganho {dec["ganho"]["decis"][4]} €' + ('' if dec == velho else ' (decis.json novo)')
