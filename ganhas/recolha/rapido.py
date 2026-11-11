#!/usr/bin/env python3
"""ganhas.pt - recolha rápida e incremental (cada ficheiro é guardado logo que chega; orçamento de tempo fixo).

Uso: python3 rapido.py <pasta-de-saída> [minutos]
"""
import gzip, json, os, re, sys, time, urllib.parse, urllib.request

SAIDA = sys.argv[1] if len(sys.argv) > 1 else 'saida'
ORCAMENTO = 60 * float(sys.argv[2] if len(sys.argv) > 2 else 25)
T0 = time.time()
for p in ('ine', 'eurostat', 'docs'):
    os.makedirs(os.path.join(SAIDA, p), exist_ok=True)
UA = 'Mozilla/5.0 (compatible; ganhas-recolha/1.0)'
LOG = open(os.path.join(SAIDA, 'progresso.txt'), 'a', encoding='utf-8')


def log(s):
    linha = f'[{time.time() - T0:6.0f}s] {s}'
    print(linha, flush=True)
    LOG.write(linha + '\n'); LOG.flush()


def obter(url, tempo=40, tentativas=2):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=tempo) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            ultimo = e
            time.sleep(2)
    raise ultimo


def guardar(caminho, dados):
    with open(os.path.join(SAIDA, caminho), 'wb') as f:
        f.write(dados)


# 1. Documentos oficiais
DOCS = {
    'dgaep_tru.html': 'https://www.dgaep.gov.pt/srap/index.htm',
    'circular1_2026_irs_continente.pdf': 'https://at.madeira.gov.pt/ficheiros/Circular_1_2026.pdf',
    'circular5_2026_irs_novembro.pdf': 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Circular_5_2026.pdf',
    'dl29a_2026_tru.pdf': 'https://drh.tecnico.ulisboa.pt/files/sites/45/dl29_a_2026_brap.pdf',
}
for nome, url in DOCS.items():
    try:
        b = obter(url, 90)
        guardar('docs/' + nome, b)
        log(f'doc {nome} {len(b)} B')
    except Exception as e:  # noqa: BLE001
        log(f'ERRO doc {nome}: {e}')
try:
    import pdfplumber
    for nome in os.listdir(os.path.join(SAIDA, 'docs')):
        if nome.endswith('.pdf'):
            with pdfplumber.open(os.path.join(SAIDA, 'docs', nome)) as pdf:
                texto = '\n\n=== página ===\n'.join((p.extract_text() or '') for p in pdf.pages)
            with open(os.path.join(SAIDA, 'docs', nome[:-4] + '.txt'), 'w', encoding='utf-8') as f:
                f.write(texto)
            log(f'texto {nome}: {len(texto)} car.')
except Exception as e:  # noqa: BLE001
    log(f'ERRO pdf: {e}')

# 2. Eurostat
EUROSTAT = {
    'earn_nt_net': 'sinceTimePeriod=2018',
    'earn_mw_cur': 'sinceTimePeriod=2019-S1',
    'nama_10_fte': 'sinceTimePeriod=2018',
    'prc_ppp_ind': 'sinceTimePeriod=2020&na_item=PLI_EU27_2020&ppp_cat=A01',
}
for ds, filtro in EUROSTAT.items():
    url = f'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ds}?format=JSON&lang=EN&{filtro}'
    try:
        b = obter(url, 90)
        guardar(f'eurostat/{ds}.json.gz', gzip.compress(b))
        d = json.loads(b)
        log(f'eurostat {ds}: {len(d.get("value", {}))} valores, atualizado {d.get("updated")}')
    except Exception as e:  # noqa: BLE001
        log(f'ERRO eurostat {ds}: {e}')

# 3. Descoberta no dados.gov.pt (só INE)
PESQUISAS = ['ganho médio mensal', 'ganho mediano mensal', 'remuneração base média mensal',
             'rendimento salarial médio mensal líquido', 'ganho médio horário', 'disparidade salarial ganho']
codigos = {}
for q in PESQUISAS:
    url = 'https://dados.gov.pt/api/1/datasets/?' + urllib.parse.urlencode({'q': q, 'page_size': 100, 'organization': '5a8e9eb7c8f8340b8a70d9f9'})
    url_sem = 'https://dados.gov.pt/api/1/datasets/?' + urllib.parse.urlencode({'q': q, 'page_size': 100})
    for u in (url_sem,):
        try:
            d = json.loads(obter(u, 60))
            for ds in d.get('data', []):
                t = ds.get('title', '')
                for cod in set(re.findall(r'indx/(\d{7})', json.dumps(ds))):
                    codigos.setdefault(cod, t)
        except Exception as e:  # noqa: BLE001
            log(f'ERRO dados.gov.pt {q}: {e}')
with open(os.path.join(SAIDA, 'codigos_ine.json'), 'w', encoding='utf-8') as f:
    json.dump(codigos, f, ensure_ascii=False, indent=1)
log(f'{len(codigos)} códigos INE')

# Prioridade: títulos com ganho/remuneração e profissão/município primeiro
def prioridade(item):
    cod, t = item
    t = t.lower()
    p = 0
    for chave, peso in (('profiss', -5), ('munic', -4), ('localiza', -3), ('ganho', -3), ('mediano', -2), ('remunera', -1), ('sexo', -1)):
        if chave in t:
            p += peso
    return p

linhas = []
for cod, titulo in sorted(codigos.items(), key=prioridade):
    if time.time() - T0 > ORCAMENTO:
        log('orçamento de tempo esgotado')
        break
    url = f'https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd={cod}&lang=PT'
    try:
        b = obter(url, 45)
    except Exception as e:  # noqa: BLE001
        linhas.append(f'{cod}\tERRO {e}\t{titulo}')
        log(f'ERRO ine {cod}')
        continue
    guardar(f'ine/{cod}.json.gz', gzip.compress(b))
    try:
        d = json.loads(b)[0]
        dados = d.get('Dados') or {}
        per = sorted(dados.keys())
        ult = per[-1] if per else ''
        regs = dados.get(ult, []) if ult else []
        dims = sorted({k for r in regs for k in r if k.startswith('dim_') and not k.endswith('_t')})
        cats = {k: len({r.get(k) for r in regs}) for k in dims}
        ex = {k: regs[0].get(k + '_t') for k in dims} if regs else {}
        linha = f"{cod}\t{d.get('IndicadorDsg', titulo)}\t{','.join(per)}\tgeos={len({r.get('geocod') for r in regs})}\tdims={cats}\tex={ex}"
    except Exception as e:  # noqa: BLE001
        linha = f'{cod}\tFORMATO {e}\t{titulo}\t{b[:150]!r}'
    linhas.append(linha)
    with open(os.path.join(SAIDA, 'resumo_ine.tsv'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas) + '\n')
    log(f'ine {cod} ok')
log('fim')
