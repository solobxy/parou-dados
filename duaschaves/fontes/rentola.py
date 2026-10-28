"""Rentola (rentola.pt). O robots.txt só veda contactos, o mapa e /api/events.
Os anúncios vêm no JSON-LD das páginas de resultados (ItemList de RealEstateListing): nome, preço, data,
tipo (quarto/apartamento/moradia), localidade, área e quartos, e uma foto. Não se guarda nada de quem anuncia."""
import json, re
from .comum import MAX_FOTOS, PRECO_MIN, PRECO_MAX

NOME = 'Rentola'
BASE = 'https://rentola.pt'
CIDADES = ['lisboa', 'porto', 'braga', 'coimbra', 'aveiro', 'faro', 'setubal', 'funchal', 'almada', 'amadora', 'oeiras',
           'cascais', 'sintra', 'matosinhos', 'vila-nova-de-gaia', 'maia', 'odivelas', 'loures', 'leiria', 'evora',
           'guimaraes', 'barreiro', 'seixal']
GRANDES = {'lisboa', 'porto'}
TIPO = {'Room': 'Quarto', 'Apartment': 'Apartamento', 'House': 'Moradia', 'SingleFamilyResidence': 'Moradia', 'Accommodation': 'Apartamento'}


def paginas(n_pag, n_grandes):
    for c in CIDADES:
        for p in range(1, (n_grandes if c in GRANDES else n_pag) + 1):
            yield c, f'{BASE}/alugar/{c}' + (f'?page={p}' if p > 1 else '')


def ler(texto, _slug):
    out = []
    for bloco in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', texto, re.S):
        try:
            d = json.loads(bloco)
        except ValueError:
            continue
        me = d.get('mainEntity') if isinstance(d, dict) else None
        lista = (me.get('itemListElement') or []) if isinstance(me, dict) else []
        for el in lista:
            it = (el or {}).get('item') or {}
            if it.get('@type') != 'RealEstateListing' or not it.get('url'):
                continue
            url = it['url'].split('?')[0]
            m = re.search(r'-([a-z0-9]{5,12})$', url)
            if not m:
                continue
            of = it.get('offers') or {}
            io = of.get('itemOffered') or {}
            tipo = TIPO.get(io.get('@type'), 'Apartamento')
            try:
                renda = int(round(float(of.get('price'))))
            except (TypeError, ValueError):
                renda = None
            if renda is not None and not (PRECO_MIN <= renda <= PRECO_MAX):
                renda = None
            area = (io.get('floorSize') or {}).get('value')
            try:
                area = int(round(float(area))) if area else None
            except (TypeError, ValueError):
                area = None
            quartos = (io.get('numberOfBedrooms') or {}).get('value') if isinstance(io.get('numberOfBedrooms'), dict) else io.get('numberOfBedrooms')
            tip = ''
            if tipo != 'Quarto':
                mt = re.search(r'\bT\s?(\d)\b', it.get('name') or '')
                tip = 'T' + mt.group(1) if mt else ('T%d' % int(quartos) if isinstance(quartos, (int, float)) and 0 <= quartos <= 9 else '')
            else:
                area = None                     # num quarto, a área do JSON é a da casa inteira
            ad = io.get('address') or {}
            local = ad.get('addressLocality') or ''
            rua = (ad.get('streetAddress') or '').split(',')[0].strip()
            data = of.get('validFrom') or ''
            out.append({
                'id': 'rent-' + m.group(1), 'titulo': (it.get('name') or '')[:140],
                'tip': tip, 'tipo': tipo, 'area': area if area and 5 <= area <= 2000 else None, 'renda': renda,
                'bairro': local, 'cidade': local, 'distrito': '',
                'fotos': [it['image']][:MAX_FOTOS] if isinstance(it.get('image'), str) and it['image'].startswith('https://') else [],
                'data': data if re.match(r'\d{4}-\d{2}-\d{2}T', data) else None,
                'particular': False, 'fonte': NOME, 'url': url,
                'desc': (it.get('name') or '') + ('. ' + rua if rua and not re.search(r'\d{4}-\d{3}', rua) else ''),
                'gid': '',
            })
    return out
