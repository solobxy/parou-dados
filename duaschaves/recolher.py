#!/usr/bin/env python3
"""Duas Chaves: recolhe anúncios públicos de arrendamento do Imovirtual (que inclui muitos da OLX).

Só lê páginas que o robots.txt do site permite (resultados e anúncios), devagar (uma página de
2 em 2 segundos) e com um User-Agent que se identifica. NÃO recolhe contactos: as páginas de
contacto estão vedadas no robots.txt e os números são dados pessoais de quem anuncia.

Uso: python3 duaschaves/recolher.py sites/duaschaves/anuncios.json
Variáveis: PAGINAS (páginas por distrito e tipo, por omissão 2), MAX_DETALHES (anúncios novos
cuja página se abre para ler a descrição e as fotos, por omissão 80).
"""
import datetime, html, json, os, re, sys, time, urllib.error, urllib.request

BASE = 'https://www.imovirtual.com'
UA = 'Mozilla/5.0 (compatible; DuasChavesBot/0.1; +https://duaschaves.pt)'
DISTRITOS = ['lisboa', 'porto', 'coimbra', 'braga', 'setubal', 'faro', 'aveiro']
TIPOS = ['apartamento', 'moradia']
PAGINAS = int(os.environ.get('PAGINAS', '2'))
MAX_DETALHES = int(os.environ.get('MAX_DETALHES', '80'))
MAX_ANUNCIOS = 1500
PAUSA = 2.0
PRECO_MIN, PRECO_MAX = 100, 20000   # fora disto o preço é claramente falso: mostra-se «sob consulta»

pedidos = {'ok': 0, 'erro': 0}


def obter(url):
    time.sleep(PAUSA)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            pedidos['ok'] += 1
            return r.read().decode('utf-8', 'replace')
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        pedidos['erro'] += 1
        print(f'  falhou {url}: {e}', file=sys.stderr)
        return None


def next_data(texto):
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', texto or '', re.S)
    return json.loads(m.group(1)) if m else None


def limpar_texto(t):
    t = re.sub(r'<br\s*/?>|</p>|</li>', '\n', t or '', flags=re.I)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n\s*\n+', '\n\n', t).strip()
    return t[:2500]


def tipologia(titulo, quartos):
    m = re.search(r'\bT\s?(\d)\b', titulo or '', re.I)
    if m:
        return 'T' + m.group(1)
    n = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5, 'SIX': 6}.get(quartos or '')
    return f'T{n - 1}' if n else ''


def local(item):
    nomes = {}
    for loc in (((item.get('location') or {}).get('reverseGeocoding') or {}).get('locations') or []):
        nomes[loc.get('locationLevel')] = loc.get('name')
    return nomes.get('parish') or nomes.get('council') or '', nomes.get('council') or '', nomes.get('district') or ''


def preco_valido(item):
    if item.get('hidePrice'):
        return None
    v = (item.get('totalPrice') or {}).get('value')
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return int(round(v)) if PRECO_MIN <= v <= PRECO_MAX else None


def do_resultado(item):
    bairro, concelho, distrito = local(item)
    fotos = [i.get('medium') or i.get('large') for i in item.get('images') or [] if i]
    return {
        'id': 'imo-' + str(item['id']),
        'titulo': item.get('title') or '',
        'tip': tipologia(item.get('title'), item.get('roomsNumber')),
        'tipo': 'Moradia' if item.get('estate') == 'HOUSE' else 'Apartamento',
        'area': item.get('areaInSquareMeters'),
        'renda': preco_valido(item),
        'bairro': bairro, 'cidade': concelho, 'distrito': distrito,
        'fotos': [f for f in fotos if f][:12],
        'data': item.get('createdAtFirst') or item.get('dateCreated'),
        'particular': bool(item.get('isPrivateOwner')),
        'fonte': 'Imovirtual',
        'url': f"{BASE}/pt/anuncio/{item.get('slug')}",
        'desc': '',
    }


def detalhes(anuncio):
    d = next_data(obter(anuncio['url']))
    ad = (((d or {}).get('props') or {}).get('pageProps') or {}).get('ad')
    if not ad:
        return False
    anuncio['desc'] = limpar_texto(ad.get('description'))
    fotos = [i.get('medium') or i.get('large') for i in ad.get('images') or [] if i]
    if fotos:
        anuncio['fotos'] = [f for f in fotos if f][:12]
    for c in ad.get('characteristics') or []:
        if c.get('key') == 'floor_no' and c.get('localizedValue'):
            anuncio['andar'] = c['localizedValue']
    return True


def main():
    saida = sys.argv[1]
    anterior = {}
    try:
        with open(saida, encoding='utf-8') as f:
            anterior = {a['id']: a for a in json.load(f).get('anuncios', [])}
    except (OSError, ValueError):
        pass

    vistos = {}
    for distrito in DISTRITOS:
        for tipo in TIPOS:
            for pagina in range(1, PAGINAS + 1):
                url = f'{BASE}/pt/resultados/arrendar/{tipo}/{distrito}?by=LATEST&direction=DESC&page={pagina}'
                d = next_data(obter(url))
                itens = ((((d or {}).get('props') or {}).get('pageProps') or {}).get('data') or {}).get('searchAds', {}).get('items') or []
                print(f'{distrito}/{tipo} p{pagina}: {len(itens)} anúncios')
                for it in itens:
                    if it.get('transaction') != 'RENT' or not it.get('slug'):
                        continue
                    a = do_resultado(it)
                    vistos[a['id']] = a
                if not itens:
                    break

    if not vistos:
        print('Nenhum anúncio lido: mantenho o ficheiro anterior.', file=sys.stderr)
        sys.exit(1)

    # Descrição e fotos: reaproveita o que já se leu; abre só os anúncios novos (mais recentes primeiro)
    novos = []
    for a in vistos.values():
        velho = anterior.get(a['id'])
        if velho and velho.get('desc'):
            a['desc'] = velho['desc']
            a['fotos'] = velho.get('fotos') or a['fotos']
            if velho.get('andar'):
                a['andar'] = velho['andar']
        else:
            novos.append(a)
    novos.sort(key=lambda a: a.get('data') or '', reverse=True)
    lidos = sum(1 for a in novos[:MAX_DETALHES] if detalhes(a))

    lista = sorted(vistos.values(), key=lambda a: a.get('data') or '', reverse=True)[:MAX_ANUNCIOS]
    if [a['id'] for a in lista] == list(anterior.keys()) and all(a == anterior[a['id']] for a in lista):
        print('Sem alterações.')
        return
    with open(saida, 'w', encoding='utf-8') as f:
        json.dump({'atualizado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'anuncios': lista}, f, ensure_ascii=False, separators=(',', ':'))
    sem_preco = sum(1 for a in lista if a['renda'] is None)
    print(f'Guardados {len(lista)} anúncios ({len(novos)} novos, {lidos} com descrição lida agora, '
          f'{sem_preco} com preço sob consulta). Pedidos: {pedidos}')


if __name__ == '__main__':
    main()
