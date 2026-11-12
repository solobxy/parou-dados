#!/usr/bin/env python3
"""IndexNow para os sites estáticos (caiu, ganhas, dinissousa, adribodypiercing, tapmoss).

Lê os sitemaps de cada site (pelos robots.txt), descarrega cada página e compara o texto com o da última vez.
Só avisa o IndexNow (Bing, e por ele o Copilot e a pesquisa do ChatGPT; Yandex, Seznam, Naver…) das páginas novas
ou mudadas, como pede o protocolo. A DupliCasa e a PAROU têm o seu próprio aviso.
Estado em /var/lib/indexnow-sites/estado.json. Corre de 6 em 6 horas (indexnow-sites.timer).
"""
import hashlib, json, os, re, sys, time, urllib.request

CHAVE = '442644c16cf8fc26416691d7b34ead8e'
SITES = {
    'caiu.pt': CHAVE,
    'ganhas.pt': CHAVE,
    'dinissousa.pt': CHAVE,
    'adribodypiercing.pt': CHAVE,
    'tapmoss.com': 'eb2a5fb21be349a3ae6481f8f745352d',
}
PASTA = os.environ.get('STATE_DIRECTORY', '/var/lib/indexnow-sites')
ESTADO = os.path.join(PASTA, 'estado.json')
MAX_URLS = 20000  # o caiu.pt tem milhares de páginas de produto
UA = 'Mozilla/5.0 (compatible; indexnow-sites/1.0)'


def obter(url, tempo=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=tempo) as r:
        return r.status, r.read().decode('utf-8', 'replace')


def sitemaps(dom):
    try:
        _, rb = obter('https://%s/robots.txt' % dom)
        sm = re.findall(r'(?im)^\s*sitemap:\s*(\S+)', rb)
    except Exception:
        sm = []
    return sm or ['https://%s/sitemap.xml' % dom]


def urls_de(sm, prof=0):
    try:
        _, x = obter(sm)
    except Exception as e:
        print('  sitemap falhou', sm, type(e).__name__, file=sys.stderr)
        return []
    locs = [l.replace('&amp;', '&') for l in re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', x)]
    if '<sitemapindex' in x and prof < 2:
        return [u for l in locs for u in urls_de(l, prof + 1)]
    return locs


def impressao(html):
    """Texto visível da página (sem scripts, estilos nem espaços), para saber se o conteúdo mudou.
    Datas e horas em <time> não contam (a página não «muda» só porque diz a hora da última verificação).
    Se a página marcar o que interessa com <!--indexnow-->…<!--/indexnow--> (preços do caiu.pt), só isso conta."""
    m = re.search(r'(?is)<title>(.*?)</title>', html)
    marcado = re.findall(r'(?s)<!--indexnow-->(.*?)<!--/indexnow-->', html)
    if marcado:
        html = ' '.join(marcado)
    html = re.sub(r'(?is)<(script|style|noscript|time)[^>]*>.*?</\1>', ' ', html)
    t = re.sub(r'(?s)<[^>]+>', ' ', html)
    t = re.sub(r'\s+', ' ', t).strip()
    return hashlib.sha256(((m.group(1) if m else '') + '|' + t).encode()).hexdigest()[:20]


def avisar(dom, chave, urls):
    for i in range(0, len(urls), 10000):
        corpo = json.dumps({'host': dom, 'key': chave, 'keyLocation': 'https://%s/%s.txt' % (dom, chave),
                            'urlList': urls[i:i + 10000]}).encode()
        req = urllib.request.Request('https://api.indexnow.org/indexnow', data=corpo, method='POST',
                                     headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                print('  IndexNow %s: %d endereços → HTTP %s' % (dom, len(urls[i:i + 10000]), r.status))
        except Exception as e:
            print('  IndexNow %s falhou: %s %s' % (dom, type(e).__name__, getattr(e, 'code', '')), file=sys.stderr)
            return False
    return True


def main():
    os.makedirs(PASTA, exist_ok=True)
    try:
        estado = json.load(open(ESTADO))
    except Exception:
        estado = {}
    for dom, chave in SITES.items():
        try:
            st, txt = obter('https://%s/%s.txt' % (dom, chave))
            if st != 200 or txt.strip() != chave:
                print('%s: ficheiro da chave em falta, salto' % dom); continue
        except Exception as e:
            print('%s: ficheiro da chave não responde (%s), salto' % (dom, type(e).__name__)); continue
        urls = []
        for sm in sitemaps(dom):
            urls += [u for u in urls_de(sm) if u.split('/')[2] == dom]
        urls = list(dict.fromkeys(urls))[:MAX_URLS]
        antes = estado.get(dom, {})
        agora, mudadas = {}, []
        for u in urls:
            try:
                st, html = obter(u)
                if st != 200:
                    continue
                h = impressao(html)
            except Exception:
                h = antes.get(u)
                if h is None:
                    continue
            agora[u] = h
            if antes.get(u) != h:
                mudadas.append(u)
            time.sleep(0.05)
        print('%s: %d páginas, %d novas ou mudadas' % (dom, len(agora), len(mudadas)))
        if not mudadas or avisar(dom, chave, mudadas):
            estado[dom] = agora
    tmp = ESTADO + '.novo'
    json.dump(estado, open(tmp, 'w'))
    os.replace(tmp, ESTADO)


if __name__ == '__main__':
    main()
