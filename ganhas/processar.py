#!/usr/bin/env python3
"""ganhas.pt: transforma as fontes em bruto (descarregadas pelo GitHub) em ganhas/dados/oficial.json.

Uso: python3 ganhas/processar.py <pasta-recolha-rapida> <dgaep.json> [pasta-pedidos]
Cada número guarda a fonte e o ano. Nada é estimado aqui, exceto onde está escrito (interpolação dos decis).
"""
import datetime as dt, gzip, json, math, os, re, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1]
DGAEP = json.load(open(sys.argv[2], encoding='utf-8'))
P = sys.argv[3] if len(sys.argv) > 3 else None


def slug(s):
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def ine(cod, pasta=None):
    for p in filter(None, [pasta, R, P]):
        f = os.path.join(p, 'ine', cod + '.json.gz')
        if os.path.exists(f):
            return json.loads(gzip.open(f).read())[0]
    return None


def num(s):
    return float(s) if s not in (None, '', 'x', '-') else None


FONTES = {
    'qp': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal', 'url': 'https://www.ine.pt/xurl/indx/0012656/PT',
           'ref': 'outubro de 2024, publicado a 27/03/2026',
           'descricao': 'ganho mensal bruto dos trabalhadores por conta de outrem a tempo completo com remuneração completa, no setor privado e no setor empresarial do Estado (não inclui a Administração Pública)'},
    'concelhos': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal (indicador 0012656)', 'url': 'https://www.ine.pt/xurl/indx/0012656/PT',
                  'ref': '2024', 'descricao': 'ganho médio mensal por concelho do local de trabalho'},
    'grupos': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal (indicador 0012655)', 'url': 'https://www.ine.pt/xurl/indx/0012655/PT',
               'ref': '2024', 'descricao': 'ganho médio mensal por grande grupo da Classificação Portuguesa das Profissões e local de trabalho'},
    'sexo_idade': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal (indicador 0014412)', 'url': 'https://www.ine.pt/xurl/indx/0014412/PT',
                   'ref': '2024', 'descricao': 'ganho médio mensal por sexo e grupo etário'},
    'educacao': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal (indicador 0012653)', 'url': 'https://www.ine.pt/xurl/indx/0012653/PT',
                 'ref': '2024', 'descricao': 'ganho médio mensal por nível de educação'},
    'dimensao': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal (indicador 0012651)', 'url': 'https://www.ine.pt/xurl/indx/0012651/PT',
                 'ref': '2024', 'descricao': 'ganho médio mensal por escalão de pessoal ao serviço da empresa'},
    'irs': {'nome': 'Autoridade Tributária, Circular n.º 1/2026 (Despacho n.º 233-A/2026)', 'url': 'https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/tabela_ret_doclib/Pages/default.aspx',
            'ref': 'tabelas de retenção na fonte para o Continente em 2026', 'descricao': 'taxas e parcelas a abater da retenção na fonte do IRS'},
    'irs_novembro': {'nome': 'Autoridade Tributária, Circular n.º 5/2026 (Despacho n.º 12523-A/2026)', 'url': 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Circular_5_2026.pdf',
                     'ref': 'novembro de 2026', 'descricao': 'retenção na fonte reduzida a metade nos rendimentos pagos em novembro de 2026'},
    'tru': {'nome': 'DGAEP, Sistema Remuneratório da Administração Pública 2026 (Decreto-Lei n.º 29-A/2026)', 'url': 'https://www.dgaep.gov.pt/srap/index.htm',
            'ref': 'versão de 10/04/2026', 'descricao': 'Tabela Remuneratória Única e remuneração de cada carreira e categoria da Administração Pública'},
    'europa': {'nome': 'Eurostat, earn_nt_net', 'url': 'https://ec.europa.eu/eurostat/databrowser/view/earn_nt_net/default/table',
               'ref': 'pessoa sozinha sem filhos com 100 % do salário médio', 'descricao': 'salário líquido anual por país, em euros e em paridades de poder de compra'},
    'europa_minimo': {'nome': 'Eurostat, earn_mw_cur', 'url': 'https://ec.europa.eu/eurostat/databrowser/view/earn_mw_cur/default/table',
                      'ref': '', 'descricao': 'salário mínimo nacional mensal por país'},
    'smn': {'nome': 'Decreto-Lei n.º 29-A/2026 (preâmbulo) e acordo de Concertação Social', 'url': 'https://dre.pt/',
            'ref': '920 € em 2026', 'descricao': 'retribuição mínima mensal garantida'},
    'tsu': {'nome': 'Código dos Regimes Contributivos do Sistema Previdencial de Segurança Social, artigo 53.º', 'url': 'https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34514575',
            'ref': 'regime geral', 'descricao': 'taxa contributiva de 34,75 %: 23,75 % pagos pela empresa e 11 % pelo trabalhador'},
    'genero': {'nome': 'INE, GEP/MTSSS, Quadros de Pessoal (indicador 0014412)', 'url': 'https://www.ine.pt/xurl/indx/0014412/PT',
               'ref': '2024', 'descricao': 'ganho médio mensal de homens e de mulheres; a diferença em percentagem é calculada pelo ganhas.pt'},
    'subsidio': {'nome': 'Portaria n.º 51-B/2026/1 e Código do IRS, artigo 2.º', 'url': 'https://dre.pt/',
                 'ref': '6,15 € por dia em 2026', 'descricao': 'subsídio de alimentação da função pública e limites de isenção'},
}

# ---------- concelhos (0012656) e grupos de profissões (0012655) ----------
d = ine('0012656')
ano_conc = sorted(d['Dados'])[-1]
regs = d['Dados'][ano_conc]
DISTRITO_DICO = {'01': 'aveiro', '02': 'beja', '03': 'braga', '04': 'braganca', '05': 'castelo-branco', '06': 'coimbra', '07': 'evora',
                 '08': 'faro', '09': 'guarda', '10': 'leiria', '11': 'lisboa', '12': 'portalegre', '13': 'porto', '14': 'santarem',
                 '15': 'setubal', '16': 'viana-do-castelo', '17': 'vila-real', '18': 'viseu'}
nomes_nuts3 = {r['geocod']: r['geodsg'] for r in regs if len(r['geocod']) == 3}
nomes_nuts2 = {r['geocod']: r['geodsg'] for r in regs if len(r['geocod']) == 2}
media_pt = next(num(r.get('valor')) for r in regs if r['geocod'] == 'PT')
concelhos, vistos = [], {}
for r in regs:
    g = r['geocod']
    if len(g) != 7:
        continue
    nome = r['geodsg'].strip()
    dico = g[3:]
    dist = DISTRITO_DICO.get(dico[:2]) or ('madeira' if g.startswith('30') else 'acores' if g.startswith('20') else '')
    s = slug(nome)
    if s in vistos:
        s = s + '-' + dist
    vistos[s] = 1
    concelhos.append({'id': s, 'nome': nome, 'geocod': g, 'nuts3': g[:3], 'nuts3_nome': nomes_nuts3.get(g[:3], ''),
                      'nuts2': g[:2], 'distrito': dist, 'ganho_medio': num(r.get('valor'))})
assert len(concelhos) == 308, len(concelhos)

dg = ine('0012655')
ano_g = sorted(dg['Dados'])[-1]
grupos, por_conc, por_reg = {}, {}, {}
for r in dg['Dados'][ano_g]:
    cod, v = r['dim_3'], num(r.get('valor'))
    if r['geocod'] == 'PT' and cod != 'T':
        grupos[cod] = {'nome': r['dim_3_t'], 'ganho': v, 'ano': int(ano_g)}
    if len(r['geocod']) == 7 and cod != 'T' and v:
        por_conc.setdefault(r['geocod'], {})[cod] = v
    if len(r['geocod']) == 2 and cod != 'T' and v:
        por_reg.setdefault(cod, {})[r['geocod']] = v
for cod, g in grupos.items():
    g['regioes'] = por_reg.get(cod, {})


for c in concelhos:
    c['grupos'] = por_conc.get(c['geocod'], {})

# ---------- sexo e idade (0014412) ----------
ds = ine('0014412')
ano_s = sorted(ds['Dados'])[-1]
sexo = {}
idades = {}
sexo_reg = {}
for r in ds['Dados'][ano_s]:
    if r['geocod'] != 'PT':
        if r['dim_4'] == 'T' and len(r['geocod']) == 2 and r['dim_3_t'] in ('H', 'M'):
            sexo_reg.setdefault(r['geocod'], {})[r['dim_3_t']] = num(r.get('valor'))
        continue
    if r['dim_4'] == 'T':
        sexo[r['dim_3_t']] = num(r.get('valor'))
    elif r['dim_3'] == 'T':
        idades[r['dim_4_t']] = num(r.get('valor'))

# ---------- educação (0012653) e dimensão da empresa (0012651) ----------
def nacional_por_dim(cod):
    x = ine(cod)
    if not x:
        return None, {}
    a = sorted(x['Dados'])[-1]
    return int(a), {r['dim_3_t']: num(r.get('valor')) for r in x['Dados'][a] if r['geocod'] == 'PT'}


ano_ed, educacao = nacional_por_dim('0012653')
ano_dim, dimensao = nacional_por_dim('0012651')

# ---------- distribuição nacional (decis) ----------
DECIS = os.path.join(AQUI, 'dados', 'decis.json')
dec = json.load(open(DECIS, encoding='utf-8')) if os.path.exists(DECIS) else None

# ---------- IRS 2026 (Circular 1/2026) ----------
txt = open(os.path.join(R, 'docs', 'circular1_2026_irs_continente.txt'), encoding='utf-8').read()


def tabela(nome_inicio, nome_fim):
    i = txt.index(nome_inicio)
    j = txt.index(nome_fim, i + 10)
    bloco = txt[i:j]
    linhas = []
    dep = None
    for l in bloco.split('\n'):
        l = l.strip()
        m = re.match(r'^(Até|Superior a) ([\d ]+,\d\d) ([\d,]+)%\s+(.*)$', l)
        if not m:
            continue
        limite = float(m.group(2).replace(' ', '').replace(',', '.'))
        taxa = round(float(m.group(3).replace(',', '.')) / 100, 6)
        resto = m.group(4)
        mf = re.match(r'^[\d,]+% x ([\d,]+) x \( ([\d ]+,\d\d) - R \) ([\d,]+)', resto)
        if mf:
            parcela = {'t': taxa, 'f': float(mf.group(1).replace(',', '.')), 'b': float(mf.group(2).replace(' ', '').replace(',', '.'))}
            dep = float(mf.group(3).replace(',', '.'))
        else:
            nums = re.findall(r'[\d ]*\d,\d\d', resto)
            parcela = float(nums[0].replace(' ', '').replace(',', '.'))
            dep = float(nums[1].replace(' ', '').replace(',', '.')) if len(nums) > 1 else dep
        linhas.append([None if m.group(1) == 'Superior a' else limite, taxa, parcela])
    return {'linhas': linhas, 'dependente': dep}


irs = {
    'ano': 2026, 'ss': 0.11, 'subsidio_dinheiro': 6.15, 'subsidio_cartao': 10.46,
    'tabelas': {'I': tabela('Tabela I - Trabalho dependente', 'Tabela II - Trabalho dependente'),
                'II': tabela('Tabela II - Trabalho dependente', 'Tabela III - Trabalho dependente'),
                'III': tabela('Tabela III - Trabalho dependente', 'Tabela IV - Trabalho dependente')},
    'novembro': {'fator': 0.5, 'limite': {'I': 20221.0, 'II': 20221.0, 'III': 20265.0}},
    'nota': 'Em novembro de 2026 a retenção é reduzida a metade (Circular n.º 5/2026), exceto acima do penúltimo escalão.',
    'tsu_empresa': 0.2375,
}
for k, t in irs['tabelas'].items():
    assert len(t['linhas']) == 12, (k, len(t['linhas']))


def reter(R_, tab='I', dep=0):
    for lim, taxa, parc in irs['tabelas'][tab]['linhas']:
        if lim is None or R_ <= lim:
            if isinstance(parc, dict):
                parc = parc['t'] * parc['f'] * (parc['b'] - R_)
            if dep >= 3 and tab in ('I', 'II'):
                taxa -= 0.01  # Despacho 233-A/2026, n.º 5, al. h)
            # Código do IRS, art. 99.º-E, n.º 1: arredonda para a unidade de euro inferior
            return float(max(0, math.floor(R_ * taxa - parc - irs['tabelas'][tab]['dependente'] * dep + 1e-9)))


# verificação com exemplos publicados (Montepio: 2 000 € tabela II com 1 dependente = 267 €)
assert reter(2000, 'II', 1) == 267.0, reter(2000, 'II', 1)
assert reter(920, 'I') == 0.0
exemplo_bruto = 1200
exemplo = {'bruto': exemplo_bruto, 'ss': round(exemplo_bruto * 0.11, 2), 'irs': reter(exemplo_bruto, 'I')}
exemplo['liquido'] = round(exemplo_bruto - exemplo['ss'] - exemplo['irs'], 2)

# ---------- função pública (DGAEP) ----------
tru = [[t['nivel'], t['vn'] if t['vn'] is not None else DGAEP['CONFIG']['brapN']] for t in DGAEP['TRU_DATA']]
carreiras = []
for g in DGAEP['GERAIS']:
    carreiras.append({'grupo': 'Carreiras gerais', 'carreira': g['career'], 'nome': g['cat'],
                      'posicoes': [{'posicao': p['l'], 'nivel': p['n'], 'valor': float(p['v'].replace(' ', ' ').replace(' €', '').replace(' ', '').replace(',', '.'))} for p in g['posNormais']]})


def fp_lista(lst, grupo):
    for x in lst:
        pos = []
        for i, p in enumerate(x.get('positions', [])):
            if p.get('vn') is None:
                continue
            pos.append({'posicao': str(p.get('p') or p.get('id') or p.get('escalao') or i + 1), 'nivel': str(p.get('n') or p.get('nivel') or ''),
                        'indice': str(p.get('indice') or ''), 'valor': round(float(p['vn']), 2)})
        if pos:
            carreiras.append({'grupo': grupo, 'carreira': x['career'], 'subgrupo': x.get('subgroup') or x.get('regime') or '',
                              'nome': x['cat'], 'posicoes': pos})


fp_lista(DGAEP['ESPECIAIS_RAW'], 'Carreiras especiais')
fp_lista(DGAEP['SEMTRU'], 'Carreiras fora da TRU')
fp_lista(DGAEP['NRE'], 'Carreiras especiais não revistas')
fp_lista(DGAEP['NRG'], 'Carreiras não revistas')
fp_lista(DGAEP['NRCE'], 'Carreiras e cargos específicos')

# ---------- Eurostat ----------
def eurostat(ds):
    f = os.path.join(R, 'eurostat', ds + '.json.gz')
    return json.loads(gzip.open(f).read()) if os.path.exists(f) else None


def valor_js(d, **filtro):
    dims, size = d['id'], d['size']
    idx = 0
    for k, n in zip(dims, size):
        cat = d['dimension'][k]['category']['index']
        pos = cat[filtro[k]] if k in filtro else 0
        idx = idx * n + pos
    return d['value'].get(str(idx))


NOMES_PAISES = {'EU27_2020': 'Média da UE', 'BE': 'Bélgica', 'BG': 'Bulgária', 'CZ': 'Chéquia', 'DK': 'Dinamarca', 'DE': 'Alemanha',
                'EE': 'Estónia', 'IE': 'Irlanda', 'EL': 'Grécia', 'ES': 'Espanha', 'FR': 'França', 'HR': 'Croácia', 'IT': 'Itália',
                'CY': 'Chipre', 'LV': 'Letónia', 'LT': 'Lituânia', 'LU': 'Luxemburgo', 'HU': 'Hungria', 'MT': 'Malta', 'NL': 'Países Baixos',
                'AT': 'Áustria', 'PL': 'Polónia', 'PT': 'Portugal', 'RO': 'Roménia', 'SI': 'Eslovénia', 'SK': 'Eslováquia', 'FI': 'Finlândia',
                'SE': 'Suécia'}
europa = None
en = eurostat('earn_nt_net')
if en:
    anos = sorted(en['dimension']['time']['category']['index'], reverse=True)
    for a in anos:
        pt = valor_js(en, freq='A', currency='EUR', estruct='NET', ecase='P1_NCH_AW100', geo='PT', time=a)
        if pt:
            ano_eu = a
            break
    lst = []
    for g in NOMES_PAISES:
        if g not in en['dimension']['geo']['category']['index']:
            continue
        v = valor_js(en, freq='A', currency='EUR', estruct='NET', ecase='P1_NCH_AW100', geo=g, time=ano_eu)
        pps = valor_js(en, freq='A', currency='PPS', estruct='NET', ecase='P1_NCH_AW100', geo=g, time=ano_eu)
        if v:
            lst.append({'codigo': g, 'pais': NOMES_PAISES[g], 'eur': round(v), 'pps': round(pps) if pps else None})
    europa = {'ano': int(ano_eu), 'liquido': lst}
    mw = eurostat('earn_mw_cur')
    if mw:
        per = sorted(mw['dimension']['time']['category']['index'], reverse=True)
        for p in per:
            if valor_js(mw, freq='S', currency='EUR', geo='PT', time=p):
                break
        mins = []
        for g in NOMES_PAISES:
            if g in mw['dimension']['geo']['category']['index']:
                v = valor_js(mw, freq='S', currency='EUR', geo=g, time=p)
                if v:
                    mins.append({'codigo': g, 'pais': NOMES_PAISES[g], 'eur': round(v)})
        europa['minimo'] = mins
        europa['minimo_periodo'] = p.replace('-S1', ', 1.º semestre').replace('-S2', ', 2.º semestre')
        FONTES['europa_minimo']['ref'] = europa['minimo_periodo']
    FONTES['europa']['ref'] = f'{ano_eu}, pessoa sozinha sem filhos com 100 % do salário médio'

# ---------- distribuição (decis) ----------
distribuicao = None
if dec:
    assert abs(sum(dec['ganho']['media_por_decil']) / 10 - dec['ganho']['media']) < 1, 'decis incoerentes'
    def serie(decis):
        pontos = [[dec['minimo'], 0]] + [[v, 10 * (k + 1)] for k, v in enumerate(decis)]
        # se vários decis têm o mesmo valor (muita gente no salário mínimo), fica o percentil mais alto desse valor
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
    distribuicao = {'ano': dec['ano'], 'ambito': dec['ambito'], 'ref': dec['ref'], 'minimo': dec['minimo'],
                    'media': dec['ganho']['media'], 'media_topo': dec['ganho']['media_por_decil'][9],
                    'ganho': serie(dec['ganho']['decis']), 'base': serie(dec['base']['decis'])}
    FONTES['decis'] = {'nome': dec['fonte'], 'url': dec['url'], 'ref': dec['ref'],
                       'descricao': 'decis da remuneração base e do ganho mensal; entre decis, o ganhas.pt assume uma distribuição uniforme'}

O = {
    'atualizado': dt.date.today().isoformat(),
    'fontes': FONTES,
    'smn': {'2024': 820, '2025': 870, '2026': 920, '2027': 970},
    'distribuicao': distribuicao,
    'media_nacional': media_pt,
    'grupos': grupos,
    'concelhos': concelhos, 'concelhos_ano': int(ano_conc),
    'nuts3': nomes_nuts3, 'nuts2': nomes_nuts2,
    'sexo': {'ano': int(ano_s), **sexo}, 'idades': idades, 'sexo_regioes': sexo_reg,
    'educacao': {'ano': ano_ed, 'valores': educacao}, 'dimensao': {'ano': ano_dim, 'valores': dimensao},
    'irs': irs, 'exemplo': exemplo,
    'funcao_publica': {'ano': 2026, 'brap': DGAEP['CONFIG']['brapN'], 'tru': tru, 'carreiras': carreiras},
    'europa': europa,
}
os.makedirs(os.path.join(AQUI, 'dados'), exist_ok=True)
with open(os.path.join(AQUI, 'dados', 'oficial.json'), 'w', encoding='utf-8') as f:
    json.dump(O, f, ensure_ascii=False, indent=1)
print('concelhos', len(concelhos), 'ano', ano_conc, '| grupos', len(grupos), '| carreiras FP', len(carreiras), '| média PT', media_pt,
      '| sexo', sexo, '| europa', europa and europa['ano'], len(europa['liquido']) if europa else 0, '| decis', bool(dec))
print('exemplo 1200 €:', exemplo)
