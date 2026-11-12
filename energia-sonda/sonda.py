"""Sonda da ERSE e das páginas de campanhas: guarda o que encontra em saida/ para estudar antes de escrever a recolha.
Só leitura, um pedido de cada vez, com pausa."""
import gzip, json, os, re, sys, time, urllib.parse, urllib.request

UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
OUT = 'saida'
os.makedirs(OUT, exist_ok=True)
registo = []


def ler(u, maximo=40_000_000):
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'pt-PT,pt;q=0.9',
                                           'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(r, timeout=60) as f:
            b = f.read(maximo)
            if f.headers.get('Content-Encoding') == 'gzip':
                b = gzip.decompress(b)
            return f.status, b, dict(f.headers), f.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.read(300_000), dict(e.headers), u
    except Exception as e:
        return 0, str(e).encode(), {}, u


def guardar(nome, u):
    s, b, h, final = ler(u)
    nome = re.sub(r'[^\w.\-]+', '_', nome)[:120]
    open(os.path.join(OUT, nome), 'wb').write(b)
    item = {'nome': nome, 'url': u, 'final': final, 'estado': s, 'bytes': len(b), 'tipo': h.get('Content-Type', '')}
    registo.append(item)
    print(json.dumps(item, ensure_ascii=False), flush=True)
    time.sleep(1.5)
    return s, b, final


# 1) ERSE: página inicial do simulador, scripts e ligações a CSV/ZIP
base = 'https://simuladorprecos.erse.pt/'
s, b, final = guardar('erse_inicio.html', base)
txt = b.decode('utf-8', 'replace')
ligacoes = set(re.findall(r'''(?:href|src)\s*=\s*["']([^"'#]+)["']''', txt))
csvs, scripts = set(), set()
for l in ligacoes:
    u = urllib.parse.urljoin(final, l)
    if re.search(r'\.(csv|zip|xlsx?)(\?|$)', u, re.I) or 'csv' in u.lower():
        csvs.add(u)
    elif re.search(r'\.js(\?|$)', u, re.I) and urllib.parse.urlsplit(u).netloc.endswith('erse.pt'):
        scripts.add(u)
for i, u in enumerate(sorted(scripts)[:12]):
    s2, b2, _ = guardar('erse_js_%02d.js' % i, u)
    for m in re.findall(rb'''["'`]([^"'`\s]{3,200}?\.(?:csv|zip))["'`]''', b2, re.I):
        csvs.add(urllib.parse.urljoin(final, m.decode('utf-8', 'replace')))
    for m in re.findall(rb'''["'`](/?api/[^"'`\s]{2,160})["'`]''', b2):
        registo.append({'api': m.decode('utf-8', 'replace'), 'de': u})
s3, b3, _ = guardar('erse_settings.json', urllib.parse.urljoin(final, '/config/Settings.json'))
try:
    for k, v in json.loads(b3.decode('utf-8-sig')).items():
        if isinstance(v, str) and v.startswith('http') and ('csv' in k.lower() or re.search(r'\.(csv|zip)', v, re.I)):
            csvs.add(v)
except ValueError:
    pass
guardar('erse_config.json', urllib.parse.urljoin(final, '/connectors/config'))
for extra in (sys.argv[2:] if len(sys.argv) > 2 else []):
    csvs.add(extra)
for i, u in enumerate(sorted(csvs)[:20]):
    guardar('erse_dados_%02d_%s' % (i, os.path.basename(urllib.parse.urlsplit(u).path) or 'x'), u)

# 2) páginas de campanhas (lista: nome url)
if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
    for linha in open(sys.argv[1]):
        p = linha.split()
        if len(p) >= 2 and not linha.startswith('#'):
            guardar('pag_' + p[0] + '.html', p[1])

json.dump(registo, open(os.path.join(OUT, 'resumo.json'), 'w'), ensure_ascii=False, indent=1)
