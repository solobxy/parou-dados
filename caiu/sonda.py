"""Sonda dos supermercados: para cada loja lê o robots.txt e uma página de pesquisa e guarda-os em sonda/,
para estudar a estrutura antes de escrever o recolhedor. Só leitura, 1 pedido de cada vez, 3 s entre pedidos."""
import os, sys, time, urllib.request, urllib.parse, json, re, gzip

UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
URLS = [l.split() for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]
os.makedirs('sonda', exist_ok=True)
res = []


def ler(u):
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
                                           'Accept-Language': 'pt-PT,pt;q=0.9', 'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(r, timeout=30) as f:
            b = f.read(3_000_000)
            if f.headers.get('Content-Encoding') == 'gzip':
                b = gzip.decompress(b)
            return f.status, b, dict(f.headers), f.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.read(200_000), dict(e.headers), u
    except Exception as e:
        return 0, str(e).encode(), {}, u


vistos = set()
for nome, url in URLS:
    p = urllib.parse.urlsplit(url)
    host = p.scheme + '://' + p.netloc
    if host not in vistos:
        vistos.add(host)
        s, b, h, _ = ler(host + '/robots.txt')
        open(f'sonda/{nome}.robots.txt', 'wb').write(b)
        time.sleep(3)
    s, b, h, final = ler(url)
    b = re.sub(rb'AIza[0-9A-Za-z_\-]{30,}|(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{10,}|eyJ[0-9A-Za-z_\-]{20,}\.[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}|gh[pousr]_[0-9A-Za-z]{30,}|xox[abp]-[0-9A-Za-z\-]{10,}|AKIA[0-9A-Z]{16}', b'[chave]', b)
    open(f'sonda/{nome}.html', 'wb').write(b)
    txt = b.decode('utf-8', 'replace')
    res.append({'nome': nome, 'url': url, 'final': final, 'estado': s, 'bytes': len(b), 'server': h.get('Server', ''),
                'tiles': txt.count('product-tile'), 'euros': txt.count('€'), 'next_data': '__NEXT_DATA__' in txt,
                'ld_json': txt.count('application/ld+json'),
                'titulo': (re.search(r'<title[^>]*>(.*?)</title>', txt, re.S) or [None, ''])[1].strip()[:120]})
    print(json.dumps(res[-1], ensure_ascii=False), flush=True)
    time.sleep(3)
json.dump(res, open('sonda/resumo.json', 'w'), ensure_ascii=False, indent=1)
