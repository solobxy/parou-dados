"""Casa Sapo (casa.sapo.pt). O robots.txt permite as páginas de resultados e de anúncio.
Não há data de publicação nos resultados: conta a primeira vez que o anúncio foi visto."""
import html, re, urllib.parse
from .comum import attr, classe, curto, preco, area, tipologia, MAX_FOTOS

NOME = 'Casa Sapo'
PREFIXO = 'sapo-'
BASE = 'https://casa.sapo.pt'
TIPOS = {'apartamentos': 'Apartamento', 'moradias': 'Moradia', 'quartos': 'Quarto'}


def paginas(n_pag):
    for slug in TIPOS:
        for p in range(1, (n_pag if slug == 'apartamentos' else max(1, n_pag // 2)) + 1):
            yield slug, f'{BASE}/alugar-{slug}/' + (f'?pn={p}' if p > 1 else '')


def ligacao(bloco):
    for h in re.findall(r'href="([^"]+)"', bloco):
        h = html.unescape(h)
        if 'counter.aspx' in h:
            h = urllib.parse.parse_qs(urllib.parse.urlsplit(h).query).get('l', [''])[0]
        if h.startswith(BASE + '/alugar-') and h.split('?')[0].endswith('.html'):
            return h.split('?')[0]
    return ''


def ler(texto, tipo_slug):
    out = []
    inicios = [m.start() for m in re.finditer(r'<div [^>]*class="property(?: [^"]*)?">', texto)]
    for i, ini in enumerate(inicios):
        b = texto[ini:inicios[i + 1] if i + 1 < len(inicios) else ini + 40000]
        uid = attr(b, 'data-uid')
        url = ligacao(b)
        if not uid or not url:
            continue
        tit = classe(b, 'property-type')
        loc = [x.strip() for x in classe(b, 'property-location').split(',') if x.strip()]
        distrito = ''
        if loc and re.match(r'Distrito d[eoa]s?\s', loc[-1]):
            distrito = re.sub(r'^Distrito d[eoa]s?\s+', '', loc.pop()).strip()
        concelho = loc[-1] if loc else ''
        bairro = loc[-2] if len(loc) >= 2 else concelho
        fotos = []
        for f in re.findall(r'(?:data-src|src)="(https://media\.casasapo\.pt/[^"]+)"', b):
            f = re.sub(r'/Z\d+x\d+/', '/Z720x540/', f)
            if f not in fotos:
                fotos.append(f)
        pid = re.search(r'/P(\d+)/', fotos[0]) if fotos else None
        tipo = TIPOS[tipo_slug]
        out.append({
            'id': 'sapo-' + uid,
            'titulo': tit,
            'tip': '' if tipo == 'Quarto' else tipologia(tit),
            'tipo': tipo,
            'area': area(classe(b, 'property-features')),
            'renda': preco(classe(b, 'property-price-value')),
            'bairro': bairro, 'cidade': concelho, 'distrito': distrito,
            'fotos': fotos[:MAX_FOTOS],
            'data': None,
            'particular': 'particular' in classe(b, 'property-owner').lower(),
            'fonte': NOME,
            'url': url,
            'desc': curto(classe(b, 'property-description')),
            'gid': 'jd-' + pid.group(1) if pid else '',     # id comum da Janela Digital (Casa Sapo e Supercasa)
        })
    return out
