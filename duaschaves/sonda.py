"""Sonda de fontes: para cada site, lê o robots.txt e uma página de pesquisa de arrendamento
e guarda-os em sonda/ (para estudar a estrutura antes de escrever um recolhedor). Só leitura, 1 pedido de cada vez, 3 s entre pedidos."""
import os, sys, time, urllib.request, urllib.parse, json, re
UA = 'Mozilla/5.0 (compatible; DuasChavesBot/1.0; +https://duaschaves.pt/bot)'
URLS = [l.split() for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]
os.makedirs('sonda', exist_ok=True)
res = []
def ler(u):
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'pt-PT,pt;q=0.9'})
    try:
        with urllib.request.urlopen(r, timeout=30) as f:
            return f.status, f.read(1_500_000), dict(f.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(200_000), dict(e.headers)
    except Exception as e:
        return 0, str(e).encode(), {}
vistos = set()
for nome, url in URLS:
    host = urllib.parse.urlsplit(url).scheme + '://' + urllib.parse.urlsplit(url).netloc
    if host not in vistos:
        vistos.add(host); s, b, h = ler(host + '/robots.txt')
        open(f'sonda/{nome}.robots.txt', 'wb').write(b); time.sleep(3)
    s, b, h = ler(url)
    # tira chaves de API que venham nas páginas (o GitHub recusa o envio se as encontrar)
    b = re.sub(rb'AIza[0-9A-Za-z_\-]{30,}|(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{10,}|eyJ[0-9A-Za-z_\-]{20,}\.[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}|gh[pousr]_[0-9A-Za-z]{30,}|xox[abp]-[0-9A-Za-z\-]{10,}|AKIA[0-9A-Z]{16}', b'[chave]', b)
    open(f'sonda/{nome}.html', 'wb').write(b)
    txt = b.decode('utf-8', 'replace')
    if url.endswith('.json'):
        try:
            d = json.loads(txt); an = d.get('anuncios') or []
            cont = {}
            for a in an:
                cont[a.get('fonte')] = cont.get(a.get('fonte'), 0) + 1
            print('RESUMO', url, d.get('atualizado'), len(an), cont)
        except Exception as e:
            print('RESUMO falhou', url, e)
    res.append({'nome': nome, 'url': url, 'estado': s, 'bytes': len(b), 'server': h.get('Server', ''), 'next_data': '__NEXT_DATA__' in txt, 'ld_json': txt.count('application/ld+json'), 'titulo': (re.search(r'<title[^>]*>(.*?)</title>', txt, re.S) or [None, ''])[1].strip()[:120]})
    print(json.dumps(res[-1], ensure_ascii=False)); time.sleep(3)
json.dump(res, open('sonda/resumo.json', 'w'), ensure_ascii=False, indent=1)
