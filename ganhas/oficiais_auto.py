#!/usr/bin/env python3
"""ganhas.pt: põe em ganhas/dados/oficial.json os números oficiais mais recentes, sozinho.

Lê as fontes descarregadas por ganhas/recolha/fontes_auto.py e refaz cada parte com as mesmas regras de
ganhas/processar.py. Cada parte só muda se os dados novos forem do mesmo ano ou mais recentes e passarem nas
verificações; se uma fonte falhar ou vier estranha, essa parte fica como estava e as outras seguem.
Uso: python3 ganhas/oficiais_auto.py <pasta-das-fontes>
"""
import datetime as dt, gzip, json, os, re, subprocess, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
OF = os.path.join(AQUI, 'dados', 'oficial.json')
DECIS = os.path.join(AQUI, 'dados', 'decis.json')
F = sys.argv[1]
O = json.load(open(OF, encoding='utf-8'))
FONTES = O['fontes']
notas = []


def slug(s):
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def num(s):
    return float(s) if s not in (None, '', 'x', '-') else None


def ine(cod):
    f = os.path.join(F, 'ine', cod + '.json.gz')
    return json.loads(gzip.open(f).read())[0] if os.path.exists(f) else None


def publicado(d):
    s = (d or {}).get('DataUltimoAtualizacao') or ''
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s) or re.match(r'(\d{2})-(\d{2})-(\d{4})', s)
    if not m:
        return ''
    a, b, c = m.groups()
    return f'{c}/{b}/{a}' if len(a) == 4 else f'{a}/{b}/{c}'


def parte(nome, fn):
    try:
        r = fn()
        notas.append(f'{nome}: {r}')
    except Exception as e:  # noqa: BLE001
        notas.append(f'{nome}: ficou como estava ({type(e).__name__}: {str(e)[:160]})')


# ---------- concelhos (0012656) ----------
DISTRITO_DICO = {'01': 'aveiro', '02': 'beja', '03': 'braga', '04': 'braganca', '05': 'castelo-branco', '06': 'coimbra', '07': 'evora',
                 '08': 'faro', '09': 'guarda', '10': 'leiria', '11': 'lisboa', '12': 'portalegre', '13': 'porto', '14': 'santarem',
                 '15': 'setubal', '16': 'viana-do-castelo', '17': 'vila-real', '18': 'viseu'}


def concelhos():
    d = ine('0012656')
    assert d, 'sem ficheiro'
    ano = sorted(d['Dados'])[-1]
    assert int(ano) >= int(O['concelhos_ano']), f'ano {ano} mais antigo'
    regs = d['Dados'][ano]
    n3 = {r['geocod']: r['geodsg'] for r in regs if len(r['geocod']) == 3}
    n2 = {r['geocod']: r['geodsg'] for r in regs if len(r['geocod']) == 2}
    media = next(num(r.get('valor')) for r in regs if r['geocod'] == 'PT')
    lst, vistos = [], {}
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
        lst.append({'id': s, 'nome': nome, 'geocod': g, 'nuts3': g[:3], 'nuts3_nome': n3.get(g[:3], ''),
                    'nuts2': g[:2], 'distrito': dist, 'ganho_medio': num(r.get('valor'))})
    assert len(lst) == 308, f'{len(lst)} concelhos'
    assert 0.7 < media / O['media_nacional'] < 1.5, f'média {media} fora do normal'
    assert sum(1 for c in lst if c['ganho_medio'] and 400 < c['ganho_medio'] < 8000) >= 300, 'valores fora do normal'
    antigos = {c['geocod']: c for c in O['concelhos']}
    for c in lst:  # os ids publicados não mudam (são as moradas das páginas)
        if c['geocod'] in antigos:
            c['id'] = antigos[c['geocod']]['id']
        c['grupos'] = antigos.get(c['geocod'], {}).get('grupos', {})
    O.update({'concelhos': lst, 'concelhos_ano': int(ano), 'nuts3': n3, 'nuts2': n2, 'media_nacional': media})
    FONTES['concelhos']['ref'] = str(ano)
    pub = publicado(d)
    FONTES['qp']['ref'] = f'outubro de {ano}' + (f', publicado a {pub}' if pub else '')
    return f'{ano}, média {media}'


def grupos():
    d = ine('0012655')
    assert d, 'sem ficheiro'
    ano = sorted(d['Dados'])[-1]
    velho = max((g.get('ano', 0) for g in O['grupos'].values()), default=0)
    assert int(ano) >= velho, f'ano {ano} mais antigo'
    gr, por_conc, por_reg = {}, {}, {}
    for r in d['Dados'][ano]:
        cod, v = r['dim_3'], num(r.get('valor'))
        if r['geocod'] == 'PT' and cod != 'T':
            gr[cod] = {'nome': r['dim_3_t'], 'ganho': v, 'ano': int(ano)}
        if len(r['geocod']) == 7 and cod != 'T' and v:
            por_conc.setdefault(r['geocod'], {})[cod] = v
        if len(r['geocod']) == 2 and cod != 'T' and v:
            por_reg.setdefault(cod, {})[r['geocod']] = v
    assert len(gr) >= 8 and all(g['ganho'] and 400 < g['ganho'] < 9000 for g in gr.values()), 'grupos fora do normal'
    for cod, g in gr.items():
        g['regioes'] = por_reg.get(cod, {})
    O['grupos'] = gr
    for c in O['concelhos']:
        c['grupos'] = por_conc.get(c['geocod'], {})
    FONTES['grupos']['ref'] = str(ano)
    return f'{ano}, {len(gr)} grupos'


def sexo():
    d = ine('0014412')
    assert d, 'sem ficheiro'
    ano = sorted(d['Dados'])[-1]
    assert int(ano) >= int(O['sexo']['ano']), f'ano {ano} mais antigo'
    sx, idades, reg = {}, {}, {}
    for r in d['Dados'][ano]:
        if r['geocod'] != 'PT':
            if r['dim_4'] == 'T' and len(r['geocod']) == 2 and r['dim_3_t'] in ('H', 'M'):
                reg.setdefault(r['geocod'], {})[r['dim_3_t']] = num(r.get('valor'))
            continue
        if r['dim_4'] == 'T':
            sx[r['dim_3_t']] = num(r.get('valor'))
        elif r['dim_3'] == 'T':
            idades[r['dim_4_t']] = num(r.get('valor'))
    assert sx.get('H') and sx.get('M') and len(idades) >= 4, 'sem homens/mulheres ou idades'
    O['sexo'] = {'ano': int(ano), **sx}
    O['idades'], O['sexo_regioes'] = idades, reg
    FONTES['sexo_idade']['ref'] = str(ano)
    if 'genero' in FONTES:
        FONTES['genero']['ref'] = str(ano)
    return f'{ano}'


def por_dim(cod, chave, fonte):
    def f():
        d = ine(cod)
        assert d, 'sem ficheiro'
        a = sorted(d['Dados'])[-1]
        assert int(a) >= int(O[chave]['ano'] or 0), f'ano {a} mais antigo'
        v = {r['dim_3_t']: num(r.get('valor')) for r in d['Dados'][a] if r['geocod'] == 'PT'}
        assert len(v) >= 3 and all(x is None or 300 < x < 12000 for x in v.values()), 'valores fora do normal'
        O[chave] = {'ano': int(a), 'valores': v}
        FONTES[fonte]['ref'] = str(a)
        return f'{a}'
    return f


# ---------- Eurostat ----------
NOMES_PAISES = {'EU27_2020': 'Média da UE', 'BE': 'Bélgica', 'BG': 'Bulgária', 'CZ': 'Chéquia', 'DK': 'Dinamarca', 'DE': 'Alemanha',
                'EE': 'Estónia', 'IE': 'Irlanda', 'EL': 'Grécia', 'ES': 'Espanha', 'FR': 'França', 'HR': 'Croácia', 'IT': 'Itália',
                'CY': 'Chipre', 'LV': 'Letónia', 'LT': 'Lituânia', 'LU': 'Luxemburgo', 'HU': 'Hungria', 'MT': 'Malta', 'NL': 'Países Baixos',
                'AT': 'Áustria', 'PL': 'Polónia', 'PT': 'Portugal', 'RO': 'Roménia', 'SI': 'Eslovénia', 'SK': 'Eslováquia', 'FI': 'Finlândia',
                'SE': 'Suécia'}


def eurostat(ds):
    f = os.path.join(F, 'eurostat', ds + '.json.gz')
    return json.loads(gzip.open(f).read()) if os.path.exists(f) else None


def valor_js(d, **filtro):
    idx = 0
    for k, n in zip(d['id'], d['size']):
        cat = d['dimension'][k]['category']['index']
        pos = cat[filtro[k]] if k in filtro else 0
        idx = idx * n + pos
    return d['value'].get(str(idx))


def europa():
    en = eurostat('earn_nt_net')
    assert en, 'sem ficheiro'
    ano_eu = next(a for a in sorted(en['dimension']['time']['category']['index'], reverse=True)
                  if valor_js(en, freq='A', currency='EUR', estruct='NET', ecase='P1_NCH_AW100', geo='PT', time=a))
    assert int(ano_eu) >= int((O.get('europa') or {}).get('ano') or 0), f'ano {ano_eu} mais antigo'
    lst = []
    for g in NOMES_PAISES:
        if g not in en['dimension']['geo']['category']['index']:
            continue
        v = valor_js(en, freq='A', currency='EUR', estruct='NET', ecase='P1_NCH_AW100', geo=g, time=ano_eu)
        pps = valor_js(en, freq='A', currency='PPS', estruct='NET', ecase='P1_NCH_AW100', geo=g, time=ano_eu)
        if v:
            lst.append({'codigo': g, 'pais': NOMES_PAISES[g], 'eur': round(v), 'pps': round(pps) if pps else None})
    assert len(lst) >= 20, f'{len(lst)} países'
    eu = {'ano': int(ano_eu), 'liquido': lst}
    mw = eurostat('earn_mw_cur')
    if mw:
        p = next(p for p in sorted(mw['dimension']['time']['category']['index'], reverse=True)
                 if valor_js(mw, freq='S', currency='EUR', geo='PT', time=p))
        mins = [{'codigo': g, 'pais': NOMES_PAISES[g], 'eur': round(v)} for g in NOMES_PAISES
                if g in mw['dimension']['geo']['category']['index'] and (v := valor_js(mw, freq='S', currency='EUR', geo=g, time=p))]
        if len(mins) >= 15:
            eu['minimo'] = mins
            eu['minimo_periodo'] = p.replace('-S1', ', 1.º semestre').replace('-S2', ', 2.º semestre')
            FONTES['europa_minimo']['ref'] = eu['minimo_periodo']
    elif (O.get('europa') or {}).get('minimo'):
        eu['minimo'], eu['minimo_periodo'] = O['europa']['minimo'], O['europa'].get('minimo_periodo')
    O['europa'] = eu
    FONTES['europa']['ref'] = f'{ano_eu}, pessoa sozinha sem filhos com 100 % do salário médio'
    return f'{ano_eu}, {len(lst)} países, mínimo {eu.get("minimo_periodo")}'


parte('Concelhos', concelhos)
parte('Profissões', grupos)
parte('Sexo e idade', sexo)
parte('Educação', por_dim('0012653', 'educacao', 'educacao'))
parte('Dimensão da empresa', por_dim('0012651', 'dimensao', 'dimensao'))
parte('Europa', europa)

# Função pública e decis: módulos próprios (só se existirem)
for nome, mod in (('Função pública', 'oficiais_fp'), ('Decis', 'oficiais_decis')):
    if os.path.exists(os.path.join(AQUI, mod + '.py')):
        sys.path.insert(0, AQUI)
        m = __import__(mod)
        parte(nome, lambda m=m: m.atualizar(O, F, DECIS))

novo = json.dumps(O, ensure_ascii=False, indent=1)
if novo != open(OF, encoding='utf-8').read().rstrip('\n') and novo != open(OF, encoding='utf-8').read():
    O['atualizado'] = dt.date.today().isoformat()
    tmp = OF + '.novo'
    json.dump(O, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, OF)
    notas.append('oficial.json atualizado')
else:
    notas.append('nada mudou')
print('\n'.join(notas))
