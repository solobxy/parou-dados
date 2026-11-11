#!/usr/bin/env python3
"""ganhas.pt: descarrega as fontes oficiais que o site usa, para ganhas/oficiais_auto.py as ler.
Corre no GitHub Actions (o servidor de desenvolvimento não chega a estes sites). Uso: python3 fontes_auto.py <saida>
  ine/<código>.json.gz       indicadores do INE (Quadros de Pessoal): concelhos, profissões, sexo e idade, educação, dimensão
  eurostat/<conjunto>.json.gz salário líquido anual e salário mínimo na Europa
  dgaep/index.htm            Sistema Remuneratório da Administração Pública (DGAEP)
  dgcp/*                     série dos Quadros de Pessoal da DGCP/MTSSS (decis do ganho e da remuneração base)"""
import datetime as dt, gzip, json, os, re, sys, time, urllib.request

SAIDA = sys.argv[1]
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 ganhas.pt'
INE = ['0012656', '0012655', '0014412', '0012653', '0012651']
EUROSTAT = {'earn_nt_net': 'sinceTimePeriod=2018', 'earn_mw_cur': 'sinceTimePeriod=2019-S1'}
resumo = []


def obter(url, tempo=120, tent=3):
    ult = None
    for i in range(tent):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=tempo) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            ult = e
            time.sleep(3 + 4 * i)
    raise ult


def guardar(caminho, dados):
    p = os.path.join(SAIDA, caminho)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'wb').write(dados)


for cod in INE:
    try:
        b = obter(f'https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd={cod}&lang=PT', 180)
        per = sorted((json.loads(b)[0].get('Dados') or {}).keys())
        guardar(f'ine/{cod}.json.gz', gzip.compress(b))
        resumo.append(f'INE {cod}: {per[0] if per else "?"}..{per[-1] if per else "?"}')
    except Exception as e:  # noqa: BLE001
        resumo.append(f'ERRO INE {cod}: {e}')

for ds, filtro in EUROSTAT.items():
    try:
        b = obter(f'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ds}?format=JSON&lang=EN&{filtro}', 180)
        guardar(f'eurostat/{ds}.json.gz', gzip.compress(b))
        resumo.append(f'Eurostat {ds}: atualizado {json.loads(b).get("updated")}')
    except Exception as e:  # noqa: BLE001
        resumo.append(f'ERRO Eurostat {ds}: {e}')

try:
    b = obter('https://www.dgaep.gov.pt/srap/index.htm', 120)
    guardar('dgaep/index.htm', b)
    resumo.append(f'DGAEP: {len(b)} bytes')
    # scripts externos da página (os dados podem estar num .js à parte)
    for src in sorted(set(re.findall(rb'<script[^>]+src="([^"]+)"', b)))[:12]:
        u = src.decode()
        if u.startswith('//'):
            u = 'https:' + u
        elif not u.startswith('http'):
            u = 'https://www.dgaep.gov.pt/srap/' + u.lstrip('./')
        if 'dgaep.gov.pt' not in u:
            continue
        try:
            guardar('dgaep/js/' + re.sub(r'[^A-Za-z0-9._-]', '_', u.split('/')[-1])[:80], obter(u, 60))
        except Exception as e:  # noqa: BLE001
            resumo.append(f'ERRO DGAEP js {u}: {e}')
except Exception as e:  # noqa: BLE001
    resumo.append(f'ERRO DGAEP: {e}')

# DGCP: série dos Quadros de Pessoal. O nome do ficheiro tem o último ano; tenta os anos seguintes ao que já se conhece.
ano = dt.date.today().year
for a in range(ano, 2023, -1):
    for u in (f'https://www.dgcp.mtsss.gov.pt/documents/10182/10928/seriesqp_2014_{a}.xlsx',):
        try:
            b = obter(u, 120, tent=1)
            if b[:2] == b'PK':
                guardar(f'dgcp/seriesqp_2014_{a}.xlsx', b)
                resumo.append(f'DGCP: série até {a} ({len(b)} bytes)')
                break
            resumo.append(f'DGCP {a}: resposta não é xlsx')
        except Exception as e:  # noqa: BLE001
            resumo.append(f'DGCP {a}: {e}')
    if os.path.exists(os.path.join(SAIDA, f'dgcp/seriesqp_2014_{a}.xlsx')):
        break
for nome, u in (('estatisticas.html', 'https://www.dgcp.mtsss.gov.pt/estatisticas'), ('gep_qp.html', 'https://www.gep.mtsss.gov.pt/estatisticas-quadros-de-pessoal')):
    try:
        guardar('dgcp/' + nome, obter(u, 60, tent=1))
    except Exception as e:  # noqa: BLE001
        resumo.append(f'DGCP página {nome}: {e}')

open(os.path.join(SAIDA, 'resumo.txt'), 'w', encoding='utf-8').write('\n'.join(resumo) + '\n')
print('\n'.join(resumo))
