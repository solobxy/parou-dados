"""Supercasa (supercasa.pt). O robots.txt só veda /VCS/. Resultados ordenados pelos mais recentes.
Não há data de publicação nos resultados: conta a primeira vez que o anúncio foi visto."""
import html, re
from .comum import attr, classe, curto, preco, area, tipologia, txt, MAX_FOTOS

NOME = 'Supercasa'
BASE = 'https://supercasa.pt'
# distritos (o Supercasa usa «<nome>-distrito»)
DISTRITOS = ['lisboa', 'porto', 'setubal', 'braga', 'algarve', 'coimbra', 'aveiro', 'leiria', 'santarem', 'viseu',
             'viana-do-castelo', 'vila-real', 'braganca', 'guarda', 'castelo-branco', 'portalegre', 'evora', 'beja',
             'madeira', 'sao-miguel']
GRANDES = {'lisboa', 'porto', 'setubal', 'braga', 'algarve'}
# nomes com acentos (o endereço do anúncio vem sem eles)
NOMES = {'setubal': 'Setúbal', 'evora': 'Évora', 'santarem': 'Santarém', 'braganca': 'Bragança', 'guimaraes': 'Guimarães',
         'portimao': 'Portimão', 'olhao': 'Olhão', 'vila-nova-de-famalicao': 'Vila Nova de Famalicão', 'sao-joao-da-madeira': 'São João da Madeira',
         'lagoa-algarve': 'Lagoa', 'tavira': 'Tavira', 'loule': 'Loulé', 'agueda': 'Águeda', 'ilhavo': 'Ílhavo', 'obidos': 'Óbidos',
         'alcobaca': 'Alcobaça', 'covilha': 'Covilhã', 'oliveira-de-azemeis': 'Oliveira de Azeméis', 'paredes': 'Paredes',
         'vila-nova-de-gaia': 'Vila Nova de Gaia', 'povoa-de-varzim': 'Póvoa de Varzim', 'odemira': 'Odemira', 'mertola': 'Mértola',
         'ponta-delgada': 'Ponta Delgada', 'camara-de-lobos': 'Câmara de Lobos', 'santa-cruz': 'Santa Cruz', 'mafra': 'Mafra',
         'peniche': 'Peniche', 'sesimbra': 'Sesimbra', 'palmela': 'Palmela', 'montijo': 'Montijo', 'alcochete': 'Alcochete',
         'vila-real-de-santo-antonio': 'Vila Real de Santo António', 'sao-bras-de-alportel': 'São Brás de Alportel',
         'castelo-branco': 'Castelo Branco', 'viana-do-castelo': 'Viana do Castelo', 'vila-real': 'Vila Real'}
TIPOS = {'casas': None, 'quartos': 'Quarto'}


def paginas(n_pag, n_grandes):
    for d in DISTRITOS:
        for slug in TIPOS:
            n = (n_grandes if d in GRANDES else n_pag) if slug == 'casas' else max(1, n_pag // 2)
            for p in range(1, n + 1):
                yield slug, f'{BASE}/arrendar-{slug}/{d}-distrito' + (f'/pagina-{p}' if p > 1 else '') + '?ordem=atualizado-desc'


def slides(texto):
    """Fotos de cada anúncio: vêm num JSON da página ({"id":..,"slides":[{"image1x":..}]})."""
    r = {}
    for m in re.finditer(r'\{"id":(\d+),"limit":\d+,"total":\d+,"slides":\[(.*?)\]\}', texto):
        fs = [f.replace('\\/', '/') for f in re.findall(r'"image1x":"([^"]+)"', m.group(2))]
        if fs and m.group(1) not in r:
            r[m.group(1)] = fs
    return r


def datas(texto):
    """Data de publicação de cada anúncio, do JSON-LD da página (availabilityStarts)."""
    r = {}
    for m in re.finditer(r'"identifier":"?(\d+)"?.{0,600}?"availabilityStarts":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', texto, re.S):
        r.setdefault(m.group(1), m.group(2) + 'Z')
    return r


def ler(texto, slug):
    por_id = {}
    sl = slides(texto)
    dt = datas(texto)
    inicios = [m.start() for m in re.finditer(r'<article class="property-card', texto)]
    for i, ini in enumerate(inicios):
        b = texto[ini:inicios[i + 1] if i + 1 < len(inicios) else ini + 40000]
        m = re.search(r'href="(/arrendamento-[^"]+/i(\d+))"', b)
        if not m:
            continue
        caminho, rid = m.group(1), m.group(2)
        tit = classe(b, 'property-card__title')
        # «Apartamento T3 na Rua X, Freguesia, Concelho» ou «Apartamento T3 em Freguesia, Concelho»
        sl_conc = re.sub(r'^arrendamento-[a-z]+(?:-t\d+)?-', '', caminho.strip('/').split('/')[0])
        conc_url = NOMES.get(sl_conc) or sl_conc.replace('-', ' ').title().replace(' Da ', ' da ').replace(' De ', ' de ').replace(' Do ', ' do ').replace(' Dos ', ' dos ').replace(' Das ', ' das ')
        if re.search(r'\s(?:em|na|no|nas|nos)\s', tit):
            partes = [x.strip() for x in re.split(r'\s+(?:em|na|no|nas|nos)\s+', tit, 1)[-1].split(',') if x.strip()]
        else:
            partes = []
        concelho = partes[-1] if partes else conc_url
        bairro = partes[-2] if len(partes) >= 2 else concelho
        tipo = TIPOS[slug] or ('Moradia' if re.match(r'(?i)(moradia|vivenda|casa)\b', tit) else 'Apartamento')
        fotos = []
        for f in sl.get(rid, []) + re.findall(r'(?:data-src|src)="(https://imagens\.supercasa\.pt/[^"]+)"', b):
            if '/S58/C1/P1/' in f or 'imagens.supercasa.pt' not in f:
                continue
            f = re.sub(r'/Z\d+x\d+/', '/Z720x540/', f)
            if f not in fotos:
                fotos.append(f)
        pid = re.search(r'/P(\d{5,})/', fotos[0]) if fotos else None
        feats = ' '.join(txt(x) for x in re.findall(r'class="property-card__feature[^"]*"[^>]*>(.*?)</', b, re.S))
        desc = re.search(r'class="property-card__description[^"]*"[^>]*>(.*?)</div>', b, re.S)
        a = {
            'id': 'super-' + rid,
            'titulo': tit,
            'tip': '' if tipo == 'Quarto' else tipologia(tit),
            'tipo': tipo,
            'area': area(feats),
            'renda': preco(classe(b, 'property-card__price')),
            'bairro': bairro, 'cidade': concelho, 'distrito': '',
            'fotos': fotos[:MAX_FOTOS],
            'data': dt.get(rid),
            'particular': bool(re.search(r'(?i)particular', classe(b, 'property-card__tags'))),
            'fonte': NOME,
            'url': BASE + caminho,
            'desc': curto((desc.group(1) if desc else '').replace('~~', '\n')),
            'gid': 'jd-' + pid.group(1) if pid else '',
        }
        v = por_id.get(a['id'])
        if v:                      # os destaques repetem-se na lista: junta o que faltar
            for k, x in a.items():
                if x and not v.get(k):
                    v[k] = x
        else:
            por_id[a['id']] = a
    return list(por_id.values())
