"""iad Portugal (iadportugal.pt), rede de consultores. O robots.txt permite /anuncios/arrendamento e os anúncios.
Os dados vêm no JSON da página (__NUXT_DATA__, formato «devalue»: cada valor é o índice de outro).
Não se guarda nada do consultor (nome, foto, contacto): são dados pessoais."""
import json, re
from .comum import curto, tipologia, MAX_FOTOS, PRECO_MIN, PRECO_MAX

NOME = 'iad'
BASE = 'https://www.iadportugal.pt'
# código postal (4 primeiros algarismos) -> concelho, só para as cidades grandes; nos outros fica a localidade
CP = [((1000, 1999), 'Lisboa'), ((4000, 4369), 'Porto'), ((4400, 4439), 'Vila Nova de Gaia'), ((4450, 4465), 'Matosinhos'),
      ((3000, 3049), 'Coimbra'), ((4700, 4719), 'Braga'), ((8000, 8099), 'Faro'), ((2750, 2769), 'Cascais'),
      ((2780, 2799), 'Oeiras'), ((2610, 2659), 'Amadora'), ((2700, 2709), 'Amadora'), ((2800, 2819), 'Almada'), ((2710, 2714), 'Sintra'),
      ((2900, 2929), 'Setúbal'), ((3800, 3849), 'Aveiro'), ((4800, 4839), 'Guimarães'), ((7000, 7099), 'Évora'),
      ((2400, 2429), 'Leiria'), ((9000, 9099), 'Funchal'), ((9500, 9599), 'Ponta Delgada')]
TIPO = {'apartment': 'Apartamento', 'house': 'Moradia', 'room': 'Quarto', 'studio': 'Apartamento'}


def paginas(n_pag):
    for p in range(1, n_pag + 1):
        yield 'arr', f'{BASE}/anuncios/arrendamento' + (f'?page={p}' if p > 1 else '')


def resolver(d, v, n=0):
    if n > 12:
        return None
    if isinstance(v, int) and not isinstance(v, bool) and 0 <= v < len(d):
        v = d[v]
        if isinstance(v, list) and v and v[0] in ('ShallowReactive', 'Reactive', 'Ref', 'ShallowRef'):
            return resolver(d, v[1], n + 1)
        if isinstance(v, dict):
            return {k: resolver(d, x, n + 1) for k, x in v.items()}
        if isinstance(v, list):
            return [resolver(d, x, n + 1) for x in v]
        return v
    return v


def concelho(cp, lugar):
    m = re.match(r'(\d{4})', cp or '')
    if m:
        n = int(m.group(1))
        for (a, b), nome in CP:
            if a <= n <= b:
                return nome
    return lugar


def ler(texto, _slug):
    m = re.search(r'id="__NUXT_DATA__">(.*?)</script>', texto, re.S)
    if not m:
        return []
    d = json.loads(m.group(1))
    # fotos que a página mostra em cada cartão (servidas por images.iadportugal.pt)
    fotos_html = {}
    for art in re.findall(r'<article.*?</article>', texto, re.S):
        r = re.search(r'href="/anuncio/[^"]+/r(\d+)"', art)
        if r:
            fotos_html[r.group(1)] = [f.split('?')[0] + '?format=auto&width=900' for f in re.findall(r'<img[^>]+src="(https://images\.iadportugal\.pt/real_estate_pictures/[^"]+)"', art)]
    out = []
    for i, x in enumerate(d):
        if not (isinstance(x, dict) and 'propertyListingRef' in x and 'price' in x and 'slugs' in x):
            continue
        a = {k: resolver(d, v) for k, v in x.items() if k not in ('agent', 'agentLocalId')}
        if a.get('transactionType') != 'rental':
            continue
        ref = str(a.get('propertyListingRef') or '')
        slug = (a.get('slugs') or {}).get('pt') or ''
        if not ref or not slug:
            continue
        preco = (a.get('price') or {}).get('main')
        try:
            preco = int(round(float(preco)))
        except (TypeError, ValueError):
            preco = None
        if preco is not None and not (PRECO_MIN <= preco <= PRECO_MAX):
            preco = None
        loc = a.get('location') or {}
        lugar = loc.get('place') or ''
        area = None
        for s in a.get('surfaceList') or []:
            if isinstance(s, dict) and s.get('value'):
                try:
                    area = int(round(float(s['value'])))
                except (TypeError, ValueError):
                    pass
                break
        fotos = list(fotos_html.get(ref, []))
        for f in a.get('photos') or []:
            u = f.get('url') if isinstance(f, dict) else f
            if isinstance(u, str) and u.startswith('http'):
                h = re.search(r'/([0-9a-f]{40,})\.', u)
                if h and any(h.group(1) in g for g in fotos):
                    continue
                fotos.append(u.split('?')[0] + '?format=auto&width=900')
        tit = a.get('title') or ''
        tipo = TIPO.get(a.get('propertyType') or '', 'Apartamento')
        out.append({
            'id': 'iad-' + ref, 'titulo': tit,
            'tip': '' if tipo == 'Quarto' else tipologia(tit),
            'tipo': tipo, 'area': area if area and 5 <= area <= 5000 else None, 'renda': preco,
            'bairro': lugar, 'cidade': concelho(loc.get('postcode'), lugar), 'distrito': '',
            'fotos': fotos[:MAX_FOTOS], 'data': None, 'particular': False, 'fonte': NOME,
            'url': BASE + '/anuncio/' + slug.strip('/') + '/r' + ref,
            'desc': curto(a.get('description') or ''), 'gid': '',
        })
    return out
