#!/usr/bin/env python3
"""ganhas.pt - descarrega as fontes públicas de salários (corre numa máquina do GitHub).

Fontes:
  - INE (via catálogo do dados.gov.pt): indicadores de ganho, remuneração e rendimento salarial
  - Eurostat: salários líquidos e brutos, salário mínimo (comparação com a Europa)
  - DGAEP: Tabela Remuneratória Única da função pública
  - Portal das Finanças / Diário da República: tabelas de retenção na fonte do IRS e decreto da TRU

Uso: python3 descarregar.py <pasta-de-saída>
Escreve os ficheiros em bruto e um resumo.txt curto para ler sem abrir tudo.
"""
import gzip, json, os, re, sys, time, urllib.parse, urllib.request

SAIDA = sys.argv[1] if len(sys.argv) > 1 else 'saida'
os.makedirs(os.path.join(SAIDA, 'ine'), exist_ok=True)
os.makedirs(os.path.join(SAIDA, 'eurostat'), exist_ok=True)
os.makedirs(os.path.join(SAIDA, 'docs'), exist_ok=True)
UA = 'ganhas.pt recolha de dados publicos (contacto: diniscash@gmail.com)'
resumo = []


def obter(url, tentativas=3, tempo=90):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=tempo) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            ultimo = e
            time.sleep(2 + 3 * i)
    raise ultimo


def guardar(caminho, dados):
    with open(os.path.join(SAIDA, caminho), 'wb') as f:
        f.write(dados)


# 1. Catálogo dados.gov.pt -> códigos de indicadores do INE
PESQUISAS = [
    'ganho médio mensal', 'ganho mediano mensal', 'remuneração base média mensal',
    'remuneração base mediana', 'rendimento salarial médio mensal líquido', 'ganho médio horário',
    'quadros de pessoal ganho', 'salário', 'remuneração média mensal', 'disparidade salarial',
]
codigos = {}
for q in PESQUISAS:
    for pagina in (1, 2, 3):
        url = 'https://dados.gov.pt/api/1/datasets/?' + urllib.parse.urlencode({'q': q, 'page_size': 100, 'page': pagina})
        try:
            d = json.loads(obter(url))
        except Exception as e:  # noqa: BLE001
            resumo.append(f'ERRO dados.gov.pt {q} p{pagina}: {e}')
            break
        for ds in d.get('data', []):
            texto = json.dumps(ds, ensure_ascii=False)
            for cod in set(re.findall(r'indx/(\d{7})', texto)):
                codigos.setdefault(cod, ds.get('title', ''))
        if not d.get('next_page'):
            break
resumo.append(f'INE: {len(codigos)} indicadores encontrados no catálogo')

# 2. Dados de cada indicador (op=2 = todos os períodos e dimensões)
linhas = []
for cod, titulo in sorted(codigos.items()):
    url = f'https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd={cod}&Dim1=T&lang=PT'
    try:
        bruto = obter(url, tempo=180)
    except Exception as e:  # noqa: BLE001
        linhas.append(f'{cod}\tERRO {e}\t{titulo}')
        continue
    guardar(f'ine/{cod}.json.gz', gzip.compress(bruto))
    try:
        d = json.loads(bruto)[0]
        dados = d.get('Dados') or {}
        periodos = sorted(dados.keys())
        ultimo = periodos[-1] if periodos else ''
        regs = dados.get(ultimo, []) if ultimo else []
        dims = sorted({k for r in regs for k in r if k.startswith('dim_') and not k.endswith('_t')})
        cats = {k: len({r.get(k) for r in regs}) for k in dims}
        geos = len({r.get('geocod') for r in regs})
        exemplo = {k: regs[0].get(k + '_t') for k in dims} if regs else {}
        linhas.append(f"{cod}\t{d.get('IndicadorDsg', titulo)}\tperíodos={periodos[0] if periodos else ''}..{ultimo}"
                      f"\tgeos={geos}\tdims={cats}\tex={exemplo}\tatualizado={d.get('DataUltimoAtualizacao', '')}")
    except Exception as e:  # noqa: BLE001
        linhas.append(f'{cod}\tFORMATO {e}\t{titulo}\t{bruto[:200]!r}')
    time.sleep(0.4)
with open(os.path.join(SAIDA, 'resumo_ine.tsv'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(linhas) + '\n')

# 3. Eurostat (JSON-stat)
EUROSTAT = {
    'earn_nt_net': 'sinceTimePeriod=2018',        # salário líquido anual por tipo de agregado
    'earn_mw_cur': 'sinceTimePeriod=2019-S1',     # salário mínimo mensal
    'earn_ses_monthly': '',                       # ganho mensal (Inquérito à Estrutura dos Ganhos)
    'nama_10_fte': 'sinceTimePeriod=2018',        # remuneração média por trabalhador a tempo completo
    'prc_ppp_ind': 'sinceTimePeriod=2020&na_item=PLI_EU27_2020&ppp_cat=A01',  # nível de preços
}
for ds, filtro in EUROSTAT.items():
    url = f'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ds}?format=JSON&lang=EN' + (('&' + filtro) if filtro else '')
    try:
        bruto = obter(url, tempo=180)
        guardar(f'eurostat/{ds}.json.gz', gzip.compress(bruto))
        d = json.loads(bruto)
        dims = {k: len(v['category']['index']) for k, v in d.get('dimension', {}).items()}
        resumo.append(f'Eurostat {ds}: {len(d.get("value", {}))} valores, dims={dims}, atualizado={d.get("updated")}')
    except Exception as e:  # noqa: BLE001
        resumo.append(f'ERRO Eurostat {ds}: {e}')

# 4. Documentos oficiais (HTML e PDF)
DOCS = {
    'dgaep_tru.html': 'https://www.dgaep.gov.pt/srap/index.htm',
    'circular1_2026_irs_continente.pdf': 'https://at.madeira.gov.pt/ficheiros/Circular_1_2026.pdf',
    'circular5_2026_irs_novembro.pdf': 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Circular_5_2026.pdf',
    'dl29a_2026_tru.pdf': 'https://drh.tecnico.ulisboa.pt/files/sites/45/dl29_a_2026_brap.pdf',
}
for nome, url in DOCS.items():
    try:
        bruto = obter(url, tempo=120)
        guardar(f'docs/{nome}', bruto)
        resumo.append(f'Doc {nome}: {len(bruto)} bytes')
    except Exception as e:  # noqa: BLE001
        resumo.append(f'ERRO doc {nome}: {e}')

# 5. Texto dos PDFs (para conferir números sem abrir o PDF)
try:
    import pdfplumber
    for nome in os.listdir(os.path.join(SAIDA, 'docs')):
        if nome.endswith('.pdf'):
            with pdfplumber.open(os.path.join(SAIDA, 'docs', nome)) as pdf:
                texto = '\n\n=== página ===\n'.join((p.extract_text() or '') for p in pdf.pages)
            with open(os.path.join(SAIDA, 'docs', nome[:-4] + '.txt'), 'w', encoding='utf-8') as f:
                f.write(texto)
except Exception as e:  # noqa: BLE001
    resumo.append(f'ERRO texto dos PDFs: {e}')

with open(os.path.join(SAIDA, 'resumo.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(resumo) + '\n')
print('\n'.join(resumo))
