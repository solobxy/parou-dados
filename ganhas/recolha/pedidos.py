#!/usr/bin/env python3
"""ganhas.pt - recolha à medida: lê ganhas/recolha/pedidos.json ({"ine": [...], "pesquisas": [...], "urls": {nome: url}})
e guarda tudo em <saída>, com progresso.txt. Uso: python3 pedidos.py <saída> [minutos]"""
import gzip, json, os, re, sys, time, urllib.parse, urllib.request
SAIDA = sys.argv[1]; ORC = 60 * float(sys.argv[2] if len(sys.argv) > 2 else 20); T0 = time.time()
os.makedirs(os.path.join(SAIDA, 'ine'), exist_ok=True); os.makedirs(os.path.join(SAIDA, 'urls'), exist_ok=True)
P = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pedidos.json'), encoding='utf-8'))
UA = 'Mozilla/5.0 (compatible; ganhas-recolha/1.0)'
LOG = open(os.path.join(SAIDA, 'progresso.txt'), 'a', encoding='utf-8')
def log(s):
    l = f'[{time.time() - T0:6.0f}s] {s}'; print(l, flush=True); LOG.write(l + '\n'); LOG.flush()
def obter(url, tempo=60, tent=3):
    ult = None
    for i in range(tent):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=tempo) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            ult = e; time.sleep(3)
    raise ult
for nome, url in P.get('urls', {}).items():
    try:
        b = obter(url, 120); open(os.path.join(SAIDA, 'urls', nome), 'wb').write(b); log(f'url {nome} {len(b)} B')
    except Exception as e:  # noqa: BLE001
        log(f'ERRO url {nome}: {e}')
achados = {}
for q in P.get('pesquisas', []):
    try:
        d = json.loads(obter('https://dados.gov.pt/api/1/datasets/?' + urllib.parse.urlencode({'q': q, 'page_size': 100}), 60))
        for ds in d.get('data', []):
            for cod in set(re.findall(r'indx/(\d{7})', json.dumps(ds))):
                achados.setdefault(cod, ds.get('title', '') + ' | ' + (ds.get('description') or '')[:200])
    except Exception as e:  # noqa: BLE001
        log(f'ERRO pesquisa {q}: {e}')
json.dump(achados, open(os.path.join(SAIDA, 'achados.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log(f'{len(achados)} códigos nas pesquisas')
resumo = []
for cod in P.get('ine', []):
    if time.time() - T0 > ORC:
        log('orçamento esgotado'); break
    try:
        b = obter(f'https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd={cod}&lang=PT', 90)
        open(os.path.join(SAIDA, 'ine', cod + '.json.gz'), 'wb').write(gzip.compress(b))
        d = json.loads(b)[0]; dados = d.get('Dados') or {}; per = sorted(dados)
        regs = dados.get(per[-1], []) if per else []
        dims = sorted({k for r in regs for k in r if k.startswith('dim_') and not k.endswith('_t')})
        resumo.append(f"{cod}\t{d.get('IndicadorDsg', '')}\t{','.join(per)}\tgeos={len({r.get('geocod') for r in regs})}\t"
                      f"dims={ {k: len({r.get(k) for r in regs}) for k in dims} }\tex={ {k: regs[0].get(k + '_t') for k in dims} if regs else {} }")
        log(f'ine {cod} ok')
    except Exception as e:  # noqa: BLE001
        resumo.append(f'{cod}\tERRO {e}'); log(f'ERRO ine {cod}: {e}')
    open(os.path.join(SAIDA, 'resumo_ine.tsv'), 'w', encoding='utf-8').write('\n'.join(resumo) + '\n')
log('fim')
