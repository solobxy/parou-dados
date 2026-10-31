#!/usr/bin/env python3
"""DupliCasa: páginas para o Google (SEO), feitas a partir dos anúncios recolhidos.

Gera HTML estático (sem JavaScript) para cada cidade com anúncios e para cada tipologia dentro da cidade:
  /arrendar/                      todas as cidades
  /arrendar/<cidade>/             casas para arrendar na cidade
  /arrendar/<cidade>/<tipo>/      quartos, apartamentos, moradias, t0, t1, t2, t3-ou-mais
  /arrendar/precos/               preço das rendas por cidade (mediana dos anúncios)
e ainda /sitemap.xml.
Palavras: em Portugal pesquisa-se mais «alugar» do que «arrendar» (ex.: «casas para alugar lisboa» 5400/mês contra
«casas para arrendar lisboa» 1600; «quartos para alugar lisboa» 4400 contra 880; DataForSEO, Portugal, outubro de 2026).
Por isso as páginas de cidade, quartos e apartamentos usam «alugar» no título e «arrendar» no texto; as de tipologia (T1…)
usam «arrendar» («t1 para arrendar lisboa» 390 contra «alugar t1» 140). Corre depois de cada recolha. Cada página tem título, descrição, canonical, Open Graph,
dados estruturados (BreadcrumbList e ItemList) e texto com números reais da cidade, para não ser conteúdo fino.

Uso: python3 paginas.py anuncios.json pasta_de_saida
"""
import datetime, html, json, os, re, shutil, sys, tempfile, time, unicodedata, urllib.request
from urllib.parse import quote
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ids import id_num

SITE = 'https://duplicasa.pt'
INDEXNOW = '386c1a2d4d17b112c59bb9e697abc415'      # chave pública do IndexNow (Bing, Yandex, Seznam…); o ficheiro com ela está na raiz do site
MIN_CIDADE, MIN_TIPO, MAX_CARTOES = 5, 3, 30
# Páginas por renda máxima («casas para alugar em gaia até 400 euros» 590/mês, «casas para alugar 250€» 480, KD 0): só com
# pelo menos MIN_PRECO casas e quando a faixa não repete a cidade inteira
TETOS, MIN_PRECO = (300, 400, 500, 600, 800, 1000), 5
MIN_ZONA = 5          # páginas por freguesia/zona («casas para alugar em ermesinde» 720/mês)
# Como as pessoas escrevem o nome («casas para alugar gaia» 2400/mês)
CURTO = {'Vila Nova de Gaia': 'Gaia', 'Santa Maria da Feira': 'Feira', 'Vila Nova de Famalicão': 'Famalicão'}
# Regiões que se pesquisam pelo nome da região
REGIAO_NOME = {'Faro': 'Algarve', 'Ilha da Madeira': 'Madeira', 'Ilha de São Miguel': 'São Miguel (Açores)', 'Ilha Terceira': 'Terceira (Açores)'}
REGIAO_EM = {'Algarve': 'no Algarve', 'Madeira': 'na Madeira', 'São Miguel (Açores)': 'em São Miguel, nos Açores', 'Terceira (Açores)': 'na Terceira, nos Açores',
             'Margem Sul': 'na Margem Sul', 'Grande Porto': 'no Grande Porto'}
GRUPOS = {'Margem Sul': ['Almada', 'Seixal', 'Barreiro', 'Moita', 'Montijo', 'Alcochete', 'Sesimbra', 'Palmela', 'Setúbal'],
          'Grande Porto': ['Porto', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Valongo', 'Póvoa de Varzim', 'Vila do Conde', 'Espinho', 'Trofa', 'Santo Tirso']}
RE_DESPESAS = re.compile(r'despesas (estao |est.o )?inclu|inclui (todas as )?despesas|contas inclu')
TIPOS = [('quartos', 'Quartos', 'Quarto'), ('apartamentos', 'Apartamentos', 'Apartamento'), ('moradias', 'Moradias', 'Moradia'),
         ('t0', 'T0', 'T0'), ('t1', 'T1', 'T1'), ('t2', 'T2', 'T2'), ('t3-ou-mais', 'T3 ou mais', 'T3+')]
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
LOGO = '<svg viewBox="-137.5 -96.5 591.8 122.9" width="135" height="28" role="img" aria-label="DupliCasa">' + '<g transform="translate(-153.26 -104.34) scale(1.3593)"><path fill="#0B6E4F" d="M11 88V52.00A22.0 22.0 0 0 1 55 52.00V88Z"/><path fill="#08523B" d="M42 88V36.00A24.0 24.0 0 0 1 90 36.00V88Z"/><path fill="#F2A33A" d="M42 88L42.00 36.00L42.27 32.40L42.54 32.18L42.81 32.31L43.08 32.45L43.35 32.59L43.62 32.74L43.90 32.89L44.17 33.04L44.44 33.21L44.71 33.37L44.98 33.55L45.25 33.73L45.52 33.91L45.79 34.10L46.06 34.30L46.33 34.50L46.60 34.71L46.88 34.93L47.15 35.15L47.42 35.38L47.69 35.62L47.96 35.87L48.23 36.12L48.50 36.39L48.77 36.66L49.04 36.94L49.31 37.24L49.58 37.54L49.85 37.86L50.12 38.19L50.40 38.53L50.67 38.89L50.94 39.26L51.21 39.65L51.48 40.06L51.75 40.49L52.02 40.95L52.29 41.42L52.56 41.93L52.83 42.48L53.10 43.07L53.38 43.70L53.65 44.40L53.92 45.18L54.19 46.08L54.46 47.15L54.73 48.56L55.00 52.00L55 88Z"/></g><path fill="#0F1A17" d="M30.615234375 0.0C52.880859375 0.0 66.2109375 -13.96484375 66.2109375 -36.474609375C66.2109375 -58.837890625 52.783203125 -72.75390625 31.15234375 -72.75390625H6.0546875V0.0ZM18.9453125 -11.03515625V-61.71875H30.322265625C45.654296875 -61.71875 53.173828125 -52.490234375 53.173828125 -36.474609375C53.173828125 -20.3125 45.751953125 -11.03515625 29.931640625 -11.03515625Z M92.3546875 1.025390625C99.48359375 1.025390625 104.708203125 -2.099609375 108.223828125 -7.91015625V0.0H120.333203125V-51.5625H107.9796875V-22.412109375C107.9796875 -13.623046875 103.19453125 -9.765625 96.700390625 -9.765625C90.10859375 -9.765625 86.3 -13.720703125 86.3 -21.2890625V-51.5625H73.9953125V-19.3359375C73.9953125 -6.103515625 81.563671875 1.025390625 92.3546875 1.025390625Z M130.070703125 20.41015625H142.375390625V-7.763671875H142.521875C145.74453125 -1.904296875 151.164453125 1.025390625 157.902734375 1.025390625C171.379296875 1.025390625 180.2171875 -9.765625 180.2171875 -25.830078125C180.2171875 -41.69921875 171.2328125 -52.587890625 157.9515625 -52.587890625C151.262109375 -52.587890625 145.54921875 -49.853515625 142.3265625 -44.384765625H142.180078125V-51.5625H130.070703125ZM155.021875 -9.27734375C146.965234375 -9.27734375 141.691796875 -15.771484375 141.691796875 -25.830078125C141.691796875 -35.83984375 146.965234375 -42.3828125 155.021875 -42.3828125C162.6390625 -42.3828125 167.766015625 -36.474609375 167.766015625 -25.830078125C167.766015625 -15.13671875 162.6390625 -9.27734375 155.021875 -9.27734375Z M199.86679687499998 -72.75390625H187.56210937499998V0.0H199.86679687499998Z M209.604296875 0.0H221.908984375V-51.5625H209.604296875ZM215.756640625 -59.228515625C219.955859375 -59.228515625 223.1296875 -62.255859375 223.1296875 -66.259765625C223.1296875 -70.21484375 219.955859375 -73.2421875 215.756640625 -73.2421875C211.557421875 -73.2421875 208.38359375 -70.21484375 208.38359375 -66.259765625C208.38359375 -62.255859375 211.557421875 -59.228515625 215.756640625 -59.228515625Z"/><g transform="translate(226.18 0)"><path fill="#0B6E4F" d="M37.79296875 1.171875C54.19921875 1.171875 66.69921875 -8.984375 69.140625 -24.853515625H56.0546875C54.00390625 -15.625 47.16796875 -10.400390625 37.890625 -10.400390625C24.51171875 -10.400390625 16.50390625 -20.703125 16.50390625 -36.328125C16.50390625 -52.05078125 24.560546875 -62.353515625 37.890625 -62.353515625C47.216796875 -62.353515625 54.052734375 -57.080078125 56.005859375 -47.802734375H69.140625C66.69921875 -63.720703125 54.19921875 -73.92578125 37.79296875 -73.92578125C17.724609375 -73.92578125 3.515625 -59.1796875 3.515625 -36.328125C3.515625 -13.623046875 17.724609375 1.171875 37.79296875 1.171875Z M92.45234375 0.830078125C100.85078125 0.830078125 105.196484375 -2.685546875 107.637890625 -7.275390625H107.833203125V0.0H119.942578125V-35.15625C119.942578125 -45.8984375 111.98359375 -52.587890625 98.555859375 -52.587890625C85.079296875 -52.587890625 76.680859375 -45.80078125 76.094921875 -35.546875H87.96015625C88.301953125 -39.892578125 92.305859375 -43.017578125 98.31171875 -43.017578125C104.219921875 -43.017578125 107.735546875 -39.892578125 107.735546875 -35.498046875V-35.107421875C107.735546875 -31.591796875 104.4640625 -31.4453125 94.89375 -30.37109375C84.24921875 -29.248046875 74.630078125 -26.3671875 74.630078125 -14.6484375C74.630078125 -4.345703125 82.1984375 0.830078125 92.45234375 0.830078125ZM95.4796875 -8.30078125C90.10859375 -8.30078125 86.641796875 -10.693359375 86.641796875 -14.74609375C86.641796875 -19.43359375 91.133984375 -21.337890625 96.407421875 -22.119140625C101.485546875 -22.900390625 106.270703125 -23.681640625 107.784375 -24.658203125V-19.091796875C107.784375 -13.0859375 103.536328125 -8.30078125 95.4796875 -8.30078125Z M149.84609375 1.220703125C162.590234375 1.220703125 171.72109375 -5.126953125 171.72109375 -15.185546875C171.72109375 -22.75390625 166.984765625 -27.24609375 156.7796875 -29.39453125L147.50234375 -31.298828125C143.20546875 -32.2265625 140.66640625 -34.130859375 140.66640625 -37.20703125C140.66640625 -40.72265625 143.98671875 -43.45703125 149.406640625 -43.45703125C155.021875 -43.45703125 158.781640625 -40.087890625 158.879296875 -35.498046875H170.4515625C170.15859375 -46.09375 161.613671875 -52.685546875 149.113671875 -52.685546875C136.516015625 -52.685546875 128.36171875 -46.2890625 128.36171875 -36.81640625C128.36171875 -29.00390625 133.5375 -23.974609375 143.40078125 -21.923828125L152.18984375 -20.1171875C156.535546875 -19.189453125 159.22109375 -17.3828125 159.22109375 -14.2578125C159.22109375 -10.595703125 155.6078125 -8.0078125 149.65078125 -8.0078125C143.4984375 -8.0078125 139.88515625 -10.888671875 139.348046875 -15.91796875H127.18984375C127.97109375 -4.833984375 137.297265625 1.220703125 149.84609375 1.220703125Z M194.64218749999998 0.830078125C203.04062499999998 0.830078125 207.38632812499998 -2.685546875 209.82773437499998 -7.275390625H210.02304687499998V0.0H222.13242187499998V-35.15625C222.13242187499998 -45.8984375 214.17343749999998 -52.587890625 200.74570312499998 -52.587890625C187.26914062499998 -52.587890625 178.87070312499998 -45.80078125 178.28476562499998 -35.546875H190.14999999999998C190.49179687499998 -39.892578125 194.49570312499998 -43.017578125 200.50156249999998 -43.017578125C206.40976562499998 -43.017578125 209.92539062499998 -39.892578125 209.92539062499998 -35.498046875V-35.107421875C209.92539062499998 -31.591796875 206.65390624999998 -31.4453125 197.08359374999998 -30.37109375C186.43906249999998 -29.248046875 176.81992187499998 -26.3671875 176.81992187499998 -14.6484375C176.81992187499998 -4.345703125 184.38828124999998 0.830078125 194.64218749999998 0.830078125ZM197.66953124999998 -8.30078125C192.29843749999998 -8.30078125 188.83164062499998 -10.693359375 188.83164062499998 -14.74609375C188.83164062499998 -19.43359375 193.32382812499998 -21.337890625 198.59726562499998 -22.119140625C203.67539062499998 -22.900390625 208.46054687499998 -23.681640625 209.97421874999998 -24.658203125V-19.091796875C209.97421874999998 -13.0859375 205.72617187499998 -8.30078125 197.66953124999998 -8.30078125Z"/></g>' + '</svg>'
e = html.escape


def slug(t):
    t = unicodedata.normalize('NFD', t or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def tipo_ok(a, tt):
    """O anúncio entra na página do tipo tt? (quartos, apartamentos e moradias pelo tipo; T0…T3+ pela tipologia)"""
    if tt in ('Apartamento', 'Moradia'):
        return a.get('tipo') == tt
    return tip(a) == tt


def tip(a):
    if a.get('tipo') == 'Quarto':
        return 'Quarto'
    t = a.get('tip') or ''
    if re.fullmatch(r'T\d+', t) and int(t[1:]) >= 3:
        return 'T3+'
    return t


NO = {'porto', 'funchal', 'barreiro', 'seixal', 'cartaxo', 'entroncamento', 'fundao', 'sabugal', 'bombarral', 'crato', 'montijo', 'peso da regua', 'redondo', 'sardoal', 'gavião', 'alandroal'}
NA = {'amadora', 'maia', 'nazare', 'figueira da foz', 'guarda', 'lourinha', 'batalha', 'golega', 'mealhada', 'trofa', 'murtosa', 'sertã', 'chamusca', 'covilha', 'povoa de varzim', 'povoa de lanhoso', 'moita', 'ribeira grande', 'ribeira brava', 'calheta', 'horta', 'praia da vitoria', 'madalena', 'lagoa', 'nazaré', 'vidigueira', 'vila do porto'}


def norm_t(t):
    return unicodedata.normalize('NFD', t or '').encode('ascii', 'ignore').decode().lower()


def nome_pesquisa(cidade):
    """Nome para o título: o curto que as pessoas usam, com o oficial entre parêntesis."""
    return f'{CURTO[cidade]} ({cidade})' if cidade in CURTO else cidade


def em(c):
    n = unicodedata.normalize('NFD', c).encode('ascii', 'ignore').decode().lower()
    if n in NO:
        return 'no ' + c
    if n in NA:
        return 'na ' + c
    return 'em ' + c


def num(n):
    return f'{n:,.0f}'.replace(',', '.')


def mediana(v, minimo=3):
    """Mediana só com pelo menos 3 valores: com menos, um anúncio estranho faria de «preço típico»."""
    v = sorted(v)
    return v[len(v) // 2] if len(v) >= minimo else None


def plausivel(a):
    r = a.get('renda')
    return bool(r) and r >= (150 if a.get('tipo') == 'Quarto' else 300)


def area_ok(a):
    ar = a.get('area') or 0
    lim = 40 if a.get('tipo') == 'Quarto' else (150 if a.get('tip') in ('T0', 'T1') else 1000)
    return 5 <= ar <= lim


# Bom negócio (a mesma regra do site, em index.html): renda pelo menos 15% e 40 € abaixo da mediana
# dos anúncios da mesma tipologia na mesma cidade (últimos 30 dias, pelo menos 6); 40% ou mais abaixo é suspeito.
NORMAL = {}


def chave_tip(a):
    if a.get('tipo') == 'Quarto':
        return 'Q'
    m = re.match(r'T(\d)', a.get('tip') or '')
    return 'T' + str(min(int(m.group(1)), 4)) if m else ''


def calc_normal(anuncios, agora):
    g = {}
    for a in anuncios:
        k, z = chave_tip(a), norm_t((a.get('cidade') or '').strip())
        if not (k and z and plausivel(a)):
            continue
        try:
            idade = (agora - datetime.datetime.fromisoformat(a['data'].replace('Z', '+00:00'))).days if a.get('data') else 0
        except (ValueError, TypeError):
            idade = 0
        if idade > 30:
            continue
        g.setdefault((z, k), []).append(a['renda'])
    NORMAL.clear()
    for k, v in g.items():
        if len(v) >= 6:
            v.sort()
            NORMAL[k] = round(v[len(v) // 2] / 5) * 5


def desconto(a):
    med = NORMAL.get((norm_t((a.get('cidade') or '').strip()), chave_tip(a)))
    if not med or not plausivel(a):
        return 0
    pct = (med - a['renda']) / med
    return round(pct * 100) if 0.15 <= pct < 0.40 and med - a['renda'] >= 40 else 0


def cartao(a):
    i = str(id_num(a['id']))
    t = tip(a) or a.get('tipo') or 'Casa'
    partes = [t] + ([f"{a['area']} m²"] if area_ok(a) else []) + [a.get('bairro') or a.get('cidade') or '']
    foto = (a.get('fotos') or [''])[0]
    preco = f"{num(a['renda'])} €<small> /mês</small>" if a.get('renda') else 'Preço sob consulta'
    img = (f'<img src="{e(foto)}" alt="{e(t)} para arrendar em {e(a.get("bairro") or a.get("cidade") or "")}" '
           f'loading="lazy" width="400" height="250" referrerpolicy="no-referrer">' if foto else '<div class="sem"></div>')
    d = desconto(a)
    selo = f'<span class="neg">{d}% abaixo do normal</span>' if d else ''
    return f'<a class="c" href="/#casa-{i}">{selo}{img}<div class="cc"><p class="p">{preco}</p><p class="l">{e(" · ".join(partes))}</p></div></a>'


def item_ld(a):
    """Cada casa como Accommodation (sem endereço da casa: só a localidade), com o preço como oferta."""
    t = tip(a) or a.get('tipo') or 'Casa'
    d = {'@type': 'Accommodation', 'name': f"{t} para arrendar em {a.get('bairro') or a.get('cidade') or ''}".strip(),
         'address': {'@type': 'PostalAddress', 'addressLocality': a.get('cidade') or '', 'addressRegion': a.get('distrito') or '', 'addressCountry': 'PT'}}
    if area_ok(a):
        d['floorSize'] = {'@type': 'QuantitativeValue', 'value': a['area'], 'unitCode': 'MTK'}
    if (a.get('fotos') or [''])[0]:
        d['image'] = a['fotos'][0]
    if a.get('renda'):
        d['offers'] = {'@type': 'Offer', 'price': a['renda'], 'priceCurrency': 'EUR', 'businessFunction': 'http://purl.org/goodrelations/v1#LeaseOut',
                       'priceSpecification': {'@type': 'UnitPriceSpecification', 'price': a['renda'], 'priceCurrency': 'EUR', 'unitCode': 'MON'}}
    return d


def pagina(caminho, titulo, descricao, h1, intro, migalhas, cartoes, links, ver_todas, atualizado, extra='', faq=None, tabela='', artigo=None, botao='Pesquisar com filtros e alertas'):
    url = SITE + caminho
    if len(titulo) > 65 and titulo.endswith(' | DupliCasa'):     # o Google corta títulos compridos: a marca sai primeiro
        titulo = titulo[:-len(' | DupliCasa')]
    lds = [{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': n + 1, 'name': nome, 'item': SITE + c} for n, (nome, c) in enumerate(migalhas)]}]
    if cartoes:
        lds.append({'@context': 'https://schema.org', '@type': 'ItemList', 'name': h1, 'numberOfItems': len(cartoes),
                    'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'item': item_ld(a)} for n, a in enumerate(cartoes)]})
    if faq:
        lds.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub(r'<[^>]+>', '', r)}} for q, r in faq]})
    if artigo:
        lds.append({'@context': 'https://schema.org', '@type': 'Article', 'headline': h1, 'description': descricao, 'inLanguage': 'pt-PT',
                    'datePublished': artigo, 'dateModified': artigo, 'mainEntityOfPage': url, 'image': SITE + '/marca/duaschaves-og.png',
                    'author': {'@type': 'Organization', 'name': 'DupliCasa', 'url': SITE + '/'},
                    'publisher': {'@type': 'Organization', 'name': 'DupliCasa', 'logo': {'@type': 'ImageObject', 'url': SITE + '/marca/duaschaves-icone.png'}}})
    lds.append({'@context': 'https://schema.org', '@type': 'WebPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT',
                'description': descricao, 'isPartOf': {'@type': 'WebSite', 'name': 'DupliCasa', 'url': SITE + '/'},
                'publisher': {'@type': 'Organization', 'name': 'DupliCasa', 'url': SITE + '/', 'logo': SITE + '/marca/duaschaves-icone.png'}})
    nav = ' <span>›</span> '.join(f'<a href="{c}">{e(n)}</a>' if k < len(migalhas) - 1 else f'<span aria-current="page">{e(n)}</span>'
                                  for k, (n, c) in enumerate(migalhas))
    faq_html = ('<section class="cx"><h2 style="margin-top:0">Perguntas frequentes</h2>' + ''.join(
        f'<details><summary>{e(q)}</summary><p>{r}</p></details>' for q, r in faq) + '</section>') if faq else ''
    grelha = f'<div class="g">{"".join(cartao(a) for a in cartoes)}</div>' if cartoes else ''
    ld_html = ''.join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False).replace('</', '<\\/') + '</script>' for x in lds)
    return f'''<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title><meta name="description" content="{e(descricao)}"><link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#F3F5F4"><meta name="color-scheme" content="light">
<meta property="og:type" content="website"><meta property="og:site_name" content="DupliCasa"><meta property="og:locale" content="pt_PT">
<meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(descricao)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/marca/duaschaves-og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="DupliCasa: casas para arrendar em Portugal, num só lugar"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/marca/duaschaves-simbolo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/marca/duaschaves-icone-180.png">
{ld_html}
<style>
:root{{--f:#F3F5F4;--t:#0F1A17;--t2:#3E4A46;--t3:#55625E;--b:#DDE3E0;--v:#0B6E4F}}
*{{box-sizing:border-box}}body{{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--f);color:var(--t);font-size:16px;line-height:1.5}}
a{{color:inherit}}.w{{max-width:1120px;margin:0 auto;padding:0 20px}}
header{{border-bottom:1px solid var(--b);background:var(--f)}}header .w{{display:flex;align-items:center;justify-content:space-between;height:64px}}
.logo{{display:flex;align-items:center;gap:8px;font-weight:800;font-size:20px;text-decoration:none;letter-spacing:-.02em}}
.bt{{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:14px;background:var(--v);color:#fff;font-weight:700;text-decoration:none}}
.mig{{font-size:14px;color:var(--t3);margin:20px 0 8px}}.mig a{{color:var(--t3)}}.mig span{{margin:0 2px}}
h1{{font-size:34px;line-height:1.1;letter-spacing:-.03em;margin:0 0 12px}}h2{{font-size:22px;margin:40px 0 12px;letter-spacing:-.01em}}
.intro{{font-size:18px;color:var(--t2);max-width:760px;margin:0 0 20px}}
.g{{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}}
.c{{position:relative;display:block;background:#fff;border-radius:18px;overflow:hidden;text-decoration:none}}.c .neg{{position:absolute;left:10px;top:10px;padding:4px 10px;border-radius:999px;background:#F2A33A;color:#2A1A00;font-size:12.5px;font-weight:800}}.c img,.c .sem{{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#D6DDDA}}
.cc{{padding:14px 16px}}.p{{margin:0;font-weight:800;font-size:20px}}.p small{{font-weight:600;color:var(--t3);font-size:14px}}.l{{margin:4px 0 0;color:var(--t2);font-size:15px}}
.ch{{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}}.ch a{{display:inline-flex;min-height:44px;align-items:center;padding:0 16px;border:1px solid #C9D3CF;border-radius:999px;background:#fff;text-decoration:none;font-weight:600}}
.cx{{background:#fff;border-radius:18px;padding:20px;margin-top:32px}}.cx p,.cx li{{color:var(--t2)}}
details{{border-top:1px solid var(--b);padding:12px 0}}details:first-of-type{{border-top:0}}summary{{font-weight:700;cursor:pointer;min-height:24px}}details p{{margin:8px 0 0}}
.tab{{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden;font-size:15px}}.tab th,.tab td{{text-align:left;padding:10px 12px;border-bottom:1px solid var(--b)}}.tab th{{color:var(--t3);font-weight:700}}.tab td.n,.tab th.n{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}.rolar .tab{{min-width:620px}}
.rolar{{overflow-x:auto;border-radius:18px}}
.guia{{max-width:760px}}.guia h2{{margin-top:36px}}.guia p,.guia li{{font-size:17px;line-height:1.65;color:var(--t2)}}.guia li{{margin-bottom:6px}}.guia strong{{color:var(--t)}}.nota{{font-size:14px;color:var(--t3);margin-top:28px}}
footer{{margin-top:56px;border-top:1px solid var(--b);padding:28px 0 40px;font-size:14px;color:var(--t3)}}footer a{{margin-right:14px;white-space:nowrap;display:inline-block;line-height:2}}
@media(min-width:900px){{h1{{font-size:46px}}}}
</style></head><body>
<header><div class="w"><a class="logo" href="/" aria-label="DupliCasa, início">{LOGO}</a><a class="bt" href="{ver_todas}">Ver casas</a></div></header>
<main class="w">
<nav class="mig" aria-label="Estás aqui">{nav}</nav>
<h1>{e(h1)}</h1>
<p class="intro">{intro}</p>
<p><a class="bt" href="{ver_todas}">{botao}</a></p>
{grelha}
{tabela}
{links}
{faq_html}
<section class="cx"><h2 style="margin-top:0">Arrendar sem cair numa burla</h2>
<ul><li>Visita a casa antes de pagar qualquer valor.</li><li>Desconfia de rendas muito abaixo das outras na zona.</li>
<li>Confirma que quem anuncia é mesmo o dono.</li><li>Em breve, com o pagamento seguro da DupliCasa, a entrada só vai chegar ao senhorio quando receberes as chaves.</li></ul>
<p><a href="/arrendar/guias/como-evitar-burlas-no-arrendamento/">Guia: como evitar burlas no arrendamento</a> · <a href="/arrendar/guias/">Todos os guias</a></p></section>
{extra}
</main>
<footer><div class="w"><p>DupliCasa · casas e quartos para alugar em Portugal, num só lugar. Anúncios atualizados a {atualizado}.</p>
<p><a href="/arrendar/">Todas as cidades</a><a href="/arrendar/precos/">Preço das rendas</a><a href="/arrendar/guias/">Guias</a><a href="/">Início</a><a href="/#senhorios">Para senhorios</a><a href="/#termos">Termos e privacidade</a></p></div></footer>
</body></html>
'''


def data_pt(iso):
    try:
        d = datetime.datetime.strptime(iso[:10], '%Y-%m-%d')
        return f'{d.day} de {MESES[d.month - 1]} de {d.year}'
    except Exception:
        return 'hoje'


def nome_tipo(tt, tn):
    return {'Quarto': 'Quartos', 'Apartamento': 'Apartamentos', 'Moradia': 'Moradias', 'T0': 'T0 e estúdios'}.get(tt, tn)


def palavra_alugar(tt):
    """«alugar» onde se pesquisa mais assim (cidade, quartos, apartamentos); «arrendar» nas tipologias e moradias."""
    return 'alugar' if tt in (None, 'Quarto', 'Apartamento') else 'arrendar'


def gerar(anuncios, atualizado):
    hoje = data_pt(atualizado)
    try:
        agora = datetime.datetime.fromisoformat((atualizado or '').replace('Z', '+00:00'))
    except ValueError:
        agora = datetime.datetime.now(datetime.timezone.utc)
    calc_normal(anuncios, agora)
    por_cidade = {}
    for a in anuncios:
        c = (a.get('cidade') or '').strip()
        if c:
            por_cidade.setdefault(c, []).append(a)
    cidades = sorted([(c, l) for c, l in por_cidade.items() if len(l) >= MIN_CIDADE], key=lambda x: -len(x[1]))
    paginas = {}
    resumo = []      # para a página de preços e para o llms.txt
    for cidade, lista in cidades:
        s = slug(cidade)
        boas = sorted([a for a in lista if plausivel(a) and a.get('fotos')], key=lambda a: a['renda'])
        meds = {tt: mediana([a['renda'] for a in lista if plausivel(a) and tipo_ok(a, tt)]) for _, _, tt in TIPOS}
        m2 = mediana([a['renda'] / a['area'] for a in lista if plausivel(a) and area_ok(a) and a.get('tipo') != 'Quarto'])
        n_part = sum(1 for a in lista if a.get('particular'))
        tipos_pag = [(ts, tn, tt) for ts, tn, tt in TIPOS if sum(1 for a in lista if tipo_ok(a, tt)) >= MIN_TIPO]
        resumo.append({'cidade': cidade, 'slug': s, 'n': len(lista), 'quarto': meds.get('Quarto'), 'T0': meds.get('T0'), 'T1': meds.get('T1'),
                       'T2': meds.get('T2'), 'm2': m2, 'min': boas[0]['renda'] if boas else None, 'distrito': lista[0].get('distrito') or ''})
        frases = [f'Há {num(len(lista))} casas, apartamentos e quartos para alugar {e(em(cidade))} na DupliCasa, juntos de vários sites e atualizados a {hoje}.']
        if meds.get('T1'):
            frases.append(f'Um T1 pede, a meio da tabela, {num(meds["T1"])} € por mês.')
        if meds.get('Quarto'):
            frases.append(f'Um quarto anda pelos {num(meds["Quarto"])} €.')
        if boas:
            frases.append(f'A renda mais baixa agora é de {num(boas[0]["renda"])} €.')
        plaus = sorted([a for a in lista if plausivel(a)], key=lambda a: a['renda'])
        precos_pag = []
        for teto in TETOS:
            n_t = sum(1 for a in plaus if a['renda'] <= teto)
            if n_t >= MIN_PRECO and n_t <= 0.85 * len(plaus) and any(a['renda'] <= teto and a.get('fotos') for a in plaus):
                precos_pag.append((teto, n_t))
        zonas = {}
        for a in lista:
            z = (a.get('bairro') or '').strip()
            if z and norm_t(z) != norm_t(cidade):
                zonas.setdefault(z, []).append(a)
        zonas_pag = sorted([(z, l) for z, l in zonas.items() if len(l) >= MIN_ZONA and slug(z)], key=lambda x: -len(x[1]))
        links = ('<h2>Por tipo de casa</h2><ul class="ch">' + ''.join(
            f'<li><a href="/arrendar/{s}/{ts}/">{e(nome_tipo(tt, tn))} {e(em(cidade))}</a></li>' for ts, tn, tt in tipos_pag) + '</ul>') if tipos_pag else ''
        if precos_pag:
            links += '<h2>Por renda máxima</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{s}/ate-{t}/">Até {num(t)} € ({n})</a></li>' for t, n in precos_pag) + '</ul>'
        if zonas_pag:
            links += '<h2>Por zona</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{s}/zona/{slug(z)}/">{e(z)} ({len(l)})</a></li>' for z, l in zonas_pag[:30]) + '</ul>'
        vizinhas = [c for c, _ in cidades if c != cidade and (por_cidade[c][0].get('distrito') == lista[0].get('distrito'))][:12]
        if vizinhas:
            links += '<h2>Perto de ' + e(cidade) + '</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{slug(c)}/">Casas para alugar {e(em(c))}</a></li>' for c in vizinhas) + '</ul>'
        faq = []
        if meds.get('T1'):
            faq.append((f'Quanto custa alugar um T1 {em(cidade)}?', f'A meio da tabela, um T1 para arrendar {e(em(cidade))} pede {num(meds["T1"])} € por mês, nos anúncios da DupliCasa a {hoje}.'
                        + (f' O mais barato que temos agora custa {num(min(a["renda"] for a in lista if plausivel(a) and tip(a) == "T1"))} €.' if any(plausivel(a) and tip(a) == 'T1' for a in lista) else '')))
        if meds.get('Quarto'):
            faq.append((f'Quanto custa um quarto {em(cidade)}?', f'Um quarto para alugar {e(em(cidade))} anda pelos {num(meds["Quarto"])} € por mês (mediana dos anúncios a {hoje}). Há quartos para estudantes e para quem trabalha.'))
        if m2:
            faq.append((f'Qual é o preço por m² das rendas {em(cidade)}?', f'Nos apartamentos e moradias anunciados {e(em(cidade))}, a renda mediana é de {str(round(m2, 1)).replace(".", ",")} € por m² por mês.'))
        faq.append((f'Há casas para alugar a particulares {em(cidade)}?', f'Sim. Dos {num(len(lista))} anúncios {e(em(cidade))}, {num(n_part)} são de particulares, sem agência. Na pesquisa da DupliCasa podes mostrar só esses.' if n_part
                    else f'Neste momento os anúncios {e(em(cidade))} são de agências. Cria um alerta e avisamos-te quando aparecer uma casa de um particular.'))
        faq.append(('Como recebo as casas novas primeiro?', 'Cria um alerta grátis na DupliCasa: recebes um resumo por dia. Com o acesso, o aviso chega no minuto em que a casa aparece.'))
        desde = f' desde {num(boas[0]["renda"])} €' if boas else ''
        paginas[f'/arrendar/{s}/'] = pagina(
            f'/arrendar/{s}/', f'Casas para alugar {em(CURTO.get(cidade, cidade))}{desde} | DupliCasa',
            f'{num(len(lista))} casas, apartamentos e quartos para alugar {em(cidade)}, dos mais baratos para os mais caros. Arrenda sem burlas e sabe das casas novas no minuto.',
            f'Casas para alugar {em(nome_pesquisa(cidade))}', ' '.join(frases),
            [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/')],
            boas[:MAX_CARTOES], links, '/#pesquisa?cidade=' + quote(cidade), hoje, faq=faq)
        for ts, tn, tt in tipos_pag:
            sub = sorted([a for a in lista if tipo_ok(a, tt) and plausivel(a) and a.get('fotos')], key=lambda a: a['renda'])
            if not sub:
                continue
            nome = nome_tipo(tt, tn)
            pal = palavra_alugar(tt)
            md = meds.get(tt)
            n_t = sum(1 for a in lista if tipo_ok(a, tt))
            intro = (f'{num(n_t)} {nome.lower() if tt in ("Quarto", "Apartamento", "Moradia") else tn} para arrendar {e(em(cidade))}, '
                     f'do mais barato para o mais caro. Desde {num(sub[0]["renda"])} €' + (f', a meio da tabela {num(md)} €' if md else '') +
                     f' por mês. Atualizado a {hoje}.' + (' Há quartos para estudantes e para quem trabalha.' if tt == 'Quarto' else ''))
            outros = '<h2>Outros tipos de casa ' + e(em(cidade)) + '</h2><ul class="ch">' + ''.join(
                f'<li><a href="/arrendar/{s}/{x}/">{e(nome_tipo(t2, n))}</a></li>' for x, n, t2 in tipos_pag if x != ts) + f'<li><a href="/arrendar/{s}/">Todas</a></li></ul>'
            faq_t = [(f'Quanto custa {"um quarto" if tt == "Quarto" else ("um apartamento" if tt == "Apartamento" else ("uma moradia" if tt == "Moradia" else "um " + tn))} {em(cidade)}?',
                      f'Desde {num(sub[0]["renda"])} € por mês' + (f'; a meio da tabela, {num(md)} €' if md else '') + f' (anúncios da DupliCasa a {hoje}).')]
            tips_q = {'Quarto': 'Quarto', 'Apartamento': '', 'Moradia': ''}.get(tt, tt)
            paginas[f'/arrendar/{s}/{ts}/'] = pagina(
                f'/arrendar/{s}/{ts}/', f'{nome} para {pal} {em(cidade)} desde {num(sub[0]["renda"])} € | DupliCasa',
                f'{nome} para {pal} {em(cidade)}, dos mais baratos para os mais caros, desde {num(sub[0]["renda"])} € por mês. Alertas de casas novas no minuto em que aparecem.',
                f'{nome} para {pal} {em(cidade)}', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/'), (nome, f'/arrendar/{s}/{ts}/')],
                sub[:MAX_CARTOES], outros, '/#pesquisa?cidade=' + quote(cidade) + ('&amp;tips=' + quote(tips_q) if tips_q else ''), hoje, faq=faq_t)
        voltar = f'<h2>Mais {e(em(cidade))}</h2><ul class="ch"><li><a href="/arrendar/{s}/">Todas as casas {e(em(cidade))}</a></li>' + ''.join(
            f'<li><a href="/arrendar/{s}/{ts}/">{e(nome_tipo(tt, tn))}</a></li>' for ts, tn, tt in tipos_pag) + '</ul>'
        for teto, n_t in precos_pag:
            sub = [a for a in plaus if a['renda'] <= teto and a.get('fotos')]
            n_q = sum(1 for a in plaus if a['renda'] <= teto and a.get('tipo') == 'Quarto')
            n_c = n_t - n_q
            partes = [f'{num(n_c)} {"casa" if n_c == 1 else "casas"}'] if n_c else []
            if n_q:
                partes.append(f'{num(n_q)} {"quarto" if n_q == 1 else "quartos"}')
            intro = (f'{" e ".join(partes).capitalize()} para arrendar {e(em(cidade))} com renda até {num(teto)} € por mês, '
                     f'da mais barata para a mais cara. A mais barata custa {num(plaus[0]["renda"])} €. Atualizado a {hoje}.')
            oque = 'Quartos' if not n_c else ('Casas' if not n_q else 'Casas e quartos')   # o título diz o que há mesmo
            outros_t = '<h2>Outras faixas de preço</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{s}/ate-{t}/">Até {num(t)} €</a></li>' for t, _ in precos_pag if t != teto) + '</ul>'
            faq_p = [(f'Há casas para alugar {em(cidade)} até {num(teto)} €?', f'Sim: {" e ".join(partes)} com renda até {num(teto)} € por mês, nos anúncios da DupliCasa a {hoje}.'),
                     ('Como sei das casas baratas antes dos outros?', 'Cria um alerta com a renda máxima que queres pagar. Recebes um resumo grátis por dia; com o acesso, o aviso chega no minuto em que a casa aparece.')]
            paginas[f'/arrendar/{s}/ate-{teto}/'] = pagina(
                f'/arrendar/{s}/ate-{teto}/', f'{oque} para alugar {em(CURTO.get(cidade, cidade))} até {num(teto)} € | DupliCasa',
                f'{" e ".join(partes).capitalize()} para alugar {em(cidade)} com renda até {num(teto)} € por mês, das mais baratas para as mais caras. Sabe das novas no minuto.',
                f'{oque} para alugar {em(CURTO.get(cidade, cidade))} até {num(teto)} €', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/'), (f'Até {num(teto)} €', f'/arrendar/{s}/ate-{teto}/')],
                sub[:MAX_CARTOES], outros_t + voltar, '/#pesquisa?cidade=' + quote(cidade) + f'&amp;max={teto}', hoje, faq=faq_p)
        for z, lz in zonas_pag:
            zs = slug(z)
            pz = sorted([a for a in lz if plausivel(a)], key=lambda a: a['renda'])
            sub = [a for a in pz if a.get('fotos')]
            if not sub:
                continue
            md_z = mediana([a['renda'] for a in pz if a.get('tipo') != 'Quarto'])
            intro = (f'{num(len(lz))} casas, apartamentos e quartos para arrendar {e(em(z))}, {e(em(cidade))}, do mais barato para o mais caro. '
                     f'Desde {num(pz[0]["renda"])} € por mês' + (f'; a meio da tabela, {num(md_z)} €' if md_z else '') + f'. Atualizado a {hoje}.')
            outras_z = '<h2>Outras zonas ' + e(em(cidade)) + '</h2><ul class="ch">' + ''.join(
                [f'<li><a href="/arrendar/{s}/zona/{slug(x)}/">{e(x)}</a></li>' for x, _ in zonas_pag if x != z][:20]) + '</ul>'
            faq_z = [(f'Quanto custa arrendar casa {em(z)}?', f'Desde {num(pz[0]["renda"])} € por mês' + (f'; a meio da tabela, {num(md_z)} € (sem contar quartos)' if md_z else '') + f', nos anúncios da DupliCasa a {hoje}.')]
            paginas[f'/arrendar/{s}/zona/{zs}/'] = pagina(
                f'/arrendar/{s}/zona/{zs}/', f'Casas para alugar {em(z)} ({CURTO.get(cidade, cidade)}) | DupliCasa',
                f'{num(len(lz))} casas, apartamentos e quartos para alugar {em(z)}, {em(cidade)}, desde {num(pz[0]["renda"])} € por mês. Alertas de casas novas no minuto em que aparecem.',
                f'Casas para alugar {em(z)}', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/'), (z, f'/arrendar/{s}/zona/{zs}/')],
                sub[:MAX_CARTOES], outras_z + voltar, '/#pesquisa?cidade=' + quote(z), hoje, faq=faq_z)
    # regiões: distritos (com o nome por que se pesquisam) e grupos de cidades (Margem Sul, Grande Porto)
    regioes = {}
    for c, l in cidades:
        d = (l[0].get('distrito') or '').strip()
        if d:
            nome = REGIAO_NOME.get(d, 'Distrito ' + ('do ' if norm_t(d) in NO else ('da ' if norm_t(d) in NA else 'de ')) + d)
            regioes.setdefault(nome, []).append((c, l))
    for g, cs in GRUPOS.items():
        regioes[g] = [(c, por_cidade[c]) for c in cs if c in dict(cidades)]
    regioes_pag = {}
    for nome, cs in regioes.items():
        todas = [a for _, l in cs for a in l]
        if len(todas) < 10 or len(cs) < 2:
            continue
        rs = slug(nome)
        prep = REGIAO_EM.get(nome, ('no ' + nome[0].lower() + nome[1:]) if nome.startswith('Distrito') else em(nome))
        pr = sorted([a for a in todas if plausivel(a)], key=lambda a: a['renda'])
        sub = [a for a in pr if a.get('fotos')]
        md = mediana([a['renda'] for a in pr if tip(a) == 'T1'])
        intro = (f'{num(len(todas))} casas, apartamentos e quartos para arrendar {e(prep)}, em {len(cs)} cidades. Desde {num(pr[0]["renda"])} € por mês'
                 + (f'; um T1 pede, a meio da tabela, {num(md)} €' if md else '') + f'. Atualizado a {hoje}.') if pr else ''
        lk = '<h2>Cidades</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{slug(c)}/">Casas para alugar {e(em(CURTO.get(c, c)))} ({len(l)})</a></li>' for c, l in sorted(cs, key=lambda x: -len(x[1]))) + '</ul>'
        regioes_pag[nome] = (rs, len(todas))
        paginas[f'/arrendar/regiao/{rs}/'] = pagina(
            f'/arrendar/regiao/{rs}/', f'Casas para alugar {prep} | DupliCasa',
            f'{num(len(todas))} casas, apartamentos e quartos para alugar {prep}, das mais baratas para as mais caras. Alertas de casas novas no minuto em que aparecem.',
            f'Casas para alugar {prep}', intro,
            [('Início', '/'), ('Arrendar', '/arrendar/'), (nome, f'/arrendar/regiao/{rs}/')],
            sub[:MAX_CARTOES], lk, '/#pesquisa', hoje)
    # renda máxima em todo o país («casas para alugar até 300 euros», «até 600 euros»)
    plaus_pt = sorted([a for a in anuncios if plausivel(a)], key=lambda a: a['renda'])
    for teto in TETOS:
        sub = [a for a in plaus_pt if a['renda'] <= teto]
        if len(sub) < MIN_PRECO:
            continue
        por_c = {}
        for a in sub:
            por_c[a.get('cidade') or ''] = por_c.get(a.get('cidade') or '', 0) + 1
        lk = '<h2>Onde há mais</h2><ul class="ch">' + ''.join(
            f'<li><a href="/arrendar/{slug(c)}/{("ate-" + str(teto) + "/") if (c, teto) in [(cc, t) for cc, _ in cidades for t in TETOS] else ""}">{e(c)} ({n})</a></li>'
            for c, n in sorted(por_c.items(), key=lambda x: -x[1])[:24] if c and slug(c) in {slug(x) for x, _ in cidades}) + '</ul>'
        paginas[f'/arrendar/ate-{teto}/'] = pagina(
            f'/arrendar/ate-{teto}/', f'Casas para alugar até {num(teto)} € em Portugal | DupliCasa',
            f'{num(len(sub))} casas e quartos para alugar em Portugal com renda até {num(teto)} € por mês, das mais baratas para as mais caras. Sabe das novas no minuto.',
            f'Casas para alugar até {num(teto)} € em Portugal',
            f'{num(len(sub))} casas e quartos para arrendar com renda até {num(teto)} € por mês, de vários sites, num só lugar. Atualizado a {hoje}.',
            [('Início', '/'), ('Arrendar', '/arrendar/'), (f'Até {num(teto)} €', f'/arrendar/ate-{teto}/')],
            [a for a in sub if a.get('fotos')][:MAX_CARTOES], lk, f'/#pesquisa?max={teto}', hoje)
    # índice de cidades, agrupado por distrito
    por_distrito = {}
    for c, l in cidades:
        por_distrito.setdefault(l[0].get('distrito') or 'Outros', []).append((c, len(l)))
    blocos = ''.join('<h2>' + e(d) + '</h2><ul class="ch">' + ''.join(
        f'<li><a href="/arrendar/{slug(c)}/">{e(c)} ({n})</a></li>' for c, n in sorted(cs)) + '</ul>' for d, cs in sorted(por_distrito.items()))
    blocos = ('<p><a href="/arrendar/precos/">Ver o preço das rendas em cada cidade</a></p>'
              '<h2>Por renda máxima</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/ate-{t}/">Até {num(t)} €</a></li>' for t in TETOS if f'/arrendar/ate-{t}/' in paginas) + '</ul>'
              '<h2>Por região</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/regiao/{rs}/">{e(n)} ({num(k)})</a></li>' for n, (rs, k) in sorted(regioes_pag.items())) + '</ul>' + blocos)
    baratas = sorted([a for a in anuncios if plausivel(a) and a.get('fotos') and tip(a) in ('T0', 'T1', 'Quarto')], key=lambda a: a['renda'])[:12]
    paginas['/arrendar/'] = pagina(
        '/arrendar/', 'Casas e quartos para alugar em Portugal, por cidade | DupliCasa',
        f'{num(len(anuncios))} casas, apartamentos e quartos para alugar em {len(cidades)} cidades de Portugal, juntos num só lugar. Alertas de casas novas no minuto em que aparecem.',
        'Casas e quartos para alugar em Portugal',
        f'{num(len(anuncios))} casas, apartamentos e quartos para arrendar, de vários sites, num só lugar. Escolhe a cidade. Atualizado a {hoje}.',
        [('Início', '/'), ('Arrendar', '/arrendar/')], baratas, blocos, '/#pesquisa', hoje)
    # preço das rendas por cidade: dados próprios (mediana dos anúncios), úteis para quem pesquisa e para quem cita
    linhas = sorted([r for r in resumo if r['n'] >= 10], key=lambda r: -r['n'])
    f = lambda v: (num(v) + ' €') if v else '—'
    tabela = ('<h2>Renda mediana por cidade</h2><div class="rolar"><table class="tab"><thead><tr><th>Cidade</th><th class="n">Anúncios</th><th class="n">Quarto</th>'
              '<th class="n">T0</th><th class="n">T1</th><th class="n">T2</th><th class="n">€/m²</th></tr></thead><tbody>' + ''.join(
                  f'<tr><td><a href="/arrendar/{r["slug"]}/">{e(r["cidade"])}</a></td><td class="n">{num(r["n"])}</td><td class="n">{f(r["quarto"])}</td>'
                  f'<td class="n">{f(r["T0"])}</td><td class="n">{f(r["T1"])}</td><td class="n">{f(r["T2"])}</td>'
                  f'<td class="n">{(str(round(r["m2"], 1)).replace(".", ",") + " €") if r["m2"] else "—"}</td></tr>' for r in linhas) +
              '</tbody></table></div><p class="intro" style="font-size:15px;margin-top:12px">Mediana das rendas pedidas nos anúncios ativos na DupliCasa a ' + hoje +
              '. É o preço pedido, não o preço final do contrato. Cidades com pelo menos 10 anúncios.</p>')
    lx = next((r for r in linhas if r['cidade'] == 'Lisboa'), None)
    pt = next((r for r in linhas if r['cidade'] == 'Porto'), None)
    intro_p = f'Quanto custa arrendar casa em Portugal, cidade a cidade, a {hoje}.'
    if lx and lx['T1']:
        intro_p += f' Em Lisboa, um T1 pede a meio da tabela {num(lx["T1"])} € por mês'
        intro_p += (f'; no Porto, {num(pt["T1"])} €.' if pt and pt['T1'] else '.')
    faq_p = []
    if lx and lx['T1']:
        faq_p.append(('Qual é a renda média de um T1 em Lisboa?', f'A meio da tabela, {num(lx["T1"])} € por mês nos anúncios da DupliCasa a {hoje}.'))
    if pt and pt['T1']:
        faq_p.append(('Qual é a renda média de um T1 no Porto?', f'A meio da tabela, {num(pt["T1"])} € por mês nos anúncios da DupliCasa a {hoje}.'))
    if lx and lx['quarto']:
        faq_p.append(('Quanto custa um quarto em Lisboa?', f'Cerca de {num(lx["quarto"])} € por mês (mediana dos anúncios a {hoje}).'))
    faq_p.append(('De onde vêm estes números?', 'Da mediana das rendas pedidas nos anúncios ativos na DupliCasa, que junta vários sites de arrendamento em Portugal. Atualizamos de 30 em 30 minutos.'))
    paginas['/arrendar/precos/'] = pagina(
        '/arrendar/precos/', f'Preço das rendas em Portugal por cidade ({MESES[datetime.date.today().month - 1]} {datetime.date.today().year}) | DupliCasa',
        'Quanto custa arrendar casa em Lisboa, Porto, Braga, Coimbra e outras cidades: renda mediana de quartos, T0, T1 e T2 e preço por m², com dados atualizados.',
        'Preço das rendas em Portugal, por cidade', intro_p,
        [('Início', '/'), ('Arrendar', '/arrendar/'), ('Preço das rendas', '/arrendar/precos/')],
        [], '', '/#pesquisa', hoje, faq=faq_p, tabela=tabela)
    return paginas, resumo


# Guias: respostas às perguntas que mais aparecem nas sugestões do Google («como arrendar casa em portugal»,
# «sem fiador», «sem caução», «sem contrato», «aumento das rendas», burlas). As regras legais têm fonte e a data em que
# foram confirmadas (LEI_CONFIRMADA). Antes de mudar uma regra, confirmar no Diário da República e no Portal das Finanças.
# Nunca citar sites de anúncios (concorrentes) como fonte.
LEI_CONFIRMADA = '30 de outubro de 2026'
F_CC = ('Código Civil, artigos 1069.º, 1076.º e 1077.º (Diário da República)', 'https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1966-34509075')
F_AT = ('Portal das Finanças: contrato de arrendamento', 'https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Cidadaos/Casa_e_propriedades/Arrendamento/Contrato%20urbano/Paginas/default.aspx')
F_AT_CAUCAO = ('Autoridade Tributária: informação vinculativa sobre caução e rendas antecipadas', 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/circ/Documents/PIV_25441.pdf')
F_CGD = ('Caixa Geral de Depósitos: a caução no arrendamento', 'https://www.cgd.pt/Site/Saldo-Positivo/leis-e-impostos/Pages/caucao-no-arrendamento.aspx')
F_REFORMA = ('DECO PROteste: o que pode mudar com a revisão da lei do arrendamento', 'https://www.deco.proteste.pt/dinheiro/arrendamento/noticias/que-pode-mudar-com-revisao-lei-arrendamento')
F_INQUILINO = ('DECO PROteste: inquilinos já podem comunicar contratos às Finanças', 'https://www.deco.proteste.pt/dinheiro/arrendamento/noticias/inquilinos-ja-podem-declarar-contratos-arrendamento-financas')
F_GARANTIA = ('RTP: proposta de garantia pública no arrendamento em debate (29/09/2026)', 'https://www.rtp.pt/noticias/economia/arrendamento-em-debate-no-parlamento-com-chumbo-no-horizonte_e1768638')
F_COEF = ('Cuatrecasas: coeficiente de atualização das rendas para 2027 (Aviso n.º 24199/2026/2)', 'https://www.cuatrecasas.com/pt/spain/imobiliario/art/coeficiente-atualizacao-anual-rendas-2027')
REFORMA = ('<p><strong>Pode mudar:</strong> o Governo propôs acabar com o limite da caução e permitir até 3 rendas adiantadas '
           '(Proposta de Lei n.º 103/XVII/1, aprovada na generalidade a 30 de setembro de 2026 e ainda em discussão no Parlamento). '
           'Só muda quando o Governo publicar o decreto-lei e este entrar em vigor. Até lá, valem os limites acima.</p>')
NOTA_LEGAL = ('<p class="nota">Este guia explica a lei em termos simples e não é aconselhamento jurídico. Para o teu caso concreto, '
              'fala com um jurista ou consulta o <a href="https://www.portaldahabitacao.pt/" rel="noopener">Portal da Habitação</a>.</p>')
GUIAS = [
    {'slug': 'como-arrendar-casa-em-portugal', 'data': '2026-10-30',
     'titulo': 'Como arrendar casa em Portugal: passo a passo | DupliCasa',
     'desc': 'Do orçamento às chaves: documentos que costumam pedir, quanto a lei deixa pedir à entrada, o que perguntar na visita e o que confirmar antes de pagar.',
     'h1': 'Como arrendar casa em Portugal, passo a passo',
     'intro': 'Do orçamento à entrega das chaves: o que fazer em cada passo para arrendar casa depressa, sem perder dinheiro nem cair numa burla.',
     'corpo': """<h2>1. Faz as contas antes de procurar</h2>
<p>Uma regra prática muito usada é a renda não passar de um terço do que entra em casa por mês. Conta também com a entrada: além da primeira renda, muitas casas pedem caução e algumas pedem rendas adiantadas.</p>
<p>A lei põe limites: a caução não pode passar do valor de <strong>2 rendas</strong> e as rendas adiantadas de <strong>2 meses</strong> (artigo 1076.º do Código Civil). Ou seja, além da primeira renda, o máximo que te podem pedir à entrada são 4 rendas. Pergunta sempre <strong>quanto é preciso pagar ao todo para entrar</strong>.</p>
<p>Vê quanto custa a zona que queres na página <a href="/arrendar/precos/">preço das rendas por cidade</a>.</p>
<h2>2. Prepara os documentos</h2>
<p>Ter tudo pronto faz-te passar à frente de quem ainda vai juntar papéis. É costume pedirem:</p>
<ul><li>documento de identificação e NIF;</li><li>últimos recibos de vencimento ou declaração da entidade patronal;</li><li>última declaração de IRS;</li><li>se és estudante, comprovativo de matrícula e, muitas vezes, um fiador.</li></ul>
<h2>3. Procura em vários sites ao mesmo tempo</h2>
<p>As casas boas e baratas desaparecem depressa. Na <a href="/#pesquisa">DupliCasa</a> vês as casas dos principais sites num só lugar, sem repetidas, e com um <a href="/#alertas">alerta</a> sabes das novas logo que aparecem.</p>
<h2>4. Contacta depressa e visita</h2>
<p>Na visita, pergunta: as despesas estão incluídas? Quanto é a caução e como é devolvida? Quando fica livre? Pede para ver o certificado energético e confirma se vai haver contrato escrito e recibos.</p>
<h2>5. Confirma antes de pagar</h2>
<ul><li>Nunca pagues nada sem visitar a casa.</li><li>Confirma que quem anuncia é o dono ou tem autorização para arrendar.</li><li>Desconfia de pressa, de preços muito abaixo da zona e de pedidos de pagamento por transferência a quem nunca viste.</li></ul>
<h2>6. Contrato e entrada</h2>
<p>A lei exige contrato escrito. Lê-o todo antes de assinar: duração, renda, quando sobe, caução, quem paga o quê.</p>
<p>Depois, o senhorio tem de comunicar o contrato às Finanças até ao fim do mês seguinte ao início e, em regra, passar recibo eletrónico de cada renda. Se não comunicar o contrato no prazo, podes ser tu a fazê-lo no Portal das Finanças.</p>
<p>No dia em que entras, tira fotos de cada divisão e dos equipamentos e envia-as ao senhorio: ajuda a reaver a caução no fim.</p>""",
     'faq': [('Que documentos pedem para arrendar casa?', 'É costume pedirem documento de identificação, NIF, recibos de vencimento ou declaração da entidade patronal e a última declaração de IRS. A estudantes pedem muitas vezes um fiador.'),
             ('Quantas rendas pode o senhorio pedir à entrada?', 'Além da primeira renda, até 2 rendas adiantadas e uma caução até ao valor de 2 rendas (artigo 1076.º do Código Civil, regras em vigor a 30 de outubro de 2026). Há uma proposta do Governo para alargar estes limites, mas ainda não está em vigor.'),
             ('O senhorio tem de comunicar o contrato às Finanças?', 'Sim, até ao fim do mês seguinte ao início do contrato. Se não o fizer, o inquilino pode comunicá-lo no Portal das Finanças depois desse prazo.')],
     'fontes': [F_CC, F_AT, F_AT_CAUCAO, F_REFORMA],
     'botao': 'Ver casas para arrendar', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'arrendar-casa-sem-fiador', 'data': '2026-10-30',
     'titulo': 'Arrendar casa sem fiador: o que diz a lei e o que propor | DupliCasa',
     'desc': 'A lei não obriga a ter fiador. Porque o pedem, o que podes propor em troca, os limites da lei e como encontrar senhorios que não o exigem.',
     'h1': 'Arrendar casa sem fiador',
     'intro': 'O fiador é uma garantia para o senhorio de que a renda é paga. Nenhuma lei obriga a tê-lo, e há outras formas de dar essa confiança.',
     'corpo': """<h2>Porque é que pedem fiador</h2>
<p>O senhorio quer saber que recebe a renda todos os meses. O fiador responde por ela se o inquilino não pagar. Por isso pedem-no mais a quem tem rendimentos baixos ou recentes, como estudantes ou quem acabou de chegar a Portugal.</p>
<h2>O que diz a lei</h2>
<ul><li><strong>Nenhuma lei obriga a ter fiador.</strong> É uma garantia que o senhorio pode pedir e que só existe se ficar no contrato, assinada pelo fiador.</li>
<li><strong>Se a garantia for em dinheiro, há limites:</strong> a caução não pode passar do valor de 2 rendas e as rendas adiantadas de 2 meses (artigo 1076.º do Código Civil).</li>
<li><strong>Não há garantia do Estado em vez de fiador.</strong> A 30 de outubro de 2026, a garantia pública para o arrendamento é só uma proposta apresentada no Parlamento, ainda não é lei. A garantia pública para jovens que existe é para quem compra casa com crédito à habitação.</li></ul>
<h2>O que podes propor em vez de fiador</h2>
<ul><li><strong>Mostrar rendimentos estáveis:</strong> contrato de trabalho, recibos dos últimos meses e a declaração de IRS.</li>
<li><strong>Seguro de renda:</strong> há seguros que protegem o senhorio se a renda não for paga. Propor que o contrate, ou dividir o custo, pode substituir o fiador.</li>
<li><strong>Referências:</strong> o contacto ou uma carta de um senhorio anterior a dizer que pagaste sempre a horas.</li>
<li><strong>Uma garantia maior à entrada:</strong> alguns senhorios aceitam em troca uma caução ou rendas adiantadas, dentro dos limites da lei. Combina tudo por escrito.</li></ul>
<h2>Onde procurar</h2>
<p>Particulares às vezes são mais flexíveis do que agências. Na <a href="/#pesquisa">pesquisa da DupliCasa</a>, em Filtros, escolhe «Só particulares». Quando o anúncio diz se pede fiador, mostramos isso na ficha da casa.</p>
<p>Cria um <a href="/#alertas">alerta</a> para seres dos primeiros a contactar: quem chega primeiro tem mais margem para negociar.</p>""",
     'faq': [('A lei obriga a ter fiador para arrendar casa?', 'Não. O fiador é uma garantia que o senhorio pode pedir, mas nenhuma lei a impõe. Só existe se ficar no contrato, assinada pelo fiador.'),
             ('É possível arrendar casa sem fiador?', 'Sim. Muitos senhorios aceitam outra garantia: rendimentos estáveis comprovados, um seguro de renda, referências de um senhorio anterior ou uma caução, até ao valor de 2 rendas.'),
             ('Há uma garantia do Estado que substitua o fiador?', 'A 30 de outubro de 2026, não. Foi apresentada no Parlamento uma proposta de garantia pública para o arrendamento, mas ainda não é lei. A garantia pública para jovens que existe é para o crédito à habitação.')],
     'fontes': [F_CC, F_GARANTIA],
     'botao': 'Ver casas de particulares', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'arrendar-casa-sem-caucao', 'data': '2026-10-30',
     'titulo': 'Arrendar casa sem caução: o que diz a lei e como negociar | DupliCasa',
     'desc': 'A caução não é obrigatória e não pode passar de 2 rendas. Como encontrar casas sem caução, como negociar e como a recebes de volta.',
     'h1': 'Arrendar casa sem caução',
     'intro': 'A caução é o dinheiro que entregas ao entrar para cobrir danos ou rendas em falta, e que te devolvem quando sais. Não é obrigatória, e há casas que não a pedem.',
     'corpo': """<h2>O que diz a lei</h2>
<ul><li><strong>A caução não é obrigatória:</strong> só existe se for combinada no contrato.</li>
<li><strong>Não pode passar do valor de 2 rendas</strong> (artigo 1076.º, n.º 2, do Código Civil). Com uma renda de 700 €, o máximo é 1400 €.</li>
<li><strong>Rendas adiantadas são outra coisa:</strong> podem ser até 2 meses, com acordo escrito (artigo 1076.º, n.º 1). Ao contrário da caução, não são devolvidas: pagam os meses seguintes.</li>
<li><strong>A lei não fixa um prazo para devolver a caução.</strong> Por isso, escreve no contrato quando e como é devolvida.</li>
<li>Para as Finanças, a caução conta como rendimento do senhorio e deve aparecer no recibo de renda eletrónico.</li></ul>
""" + REFORMA + """
<h2>Como encontrar casas sem caução</h2>
<p>Na <a href="/#pesquisa">pesquisa da DupliCasa</a>, abre Filtros e escolhe «Sem caução indicada»: ficam as casas cujo anúncio diz que não pedem caução ou que não falam nela. Confirma sempre com quem anuncia antes de visitar.</p>
<h2>Como negociar</h2>
<ul><li>Mostra que és um inquilino de confiança: rendimentos, referências, documentos prontos.</li>
<li>Propõe dividir a caução em prestações nos primeiros meses.</li>
<li>Pergunta se aceitam um seguro de renda no lugar da caução.</li></ul>
<h2>Se pagares caução, garante que a recebes de volta</h2>
<ul><li>O valor da caução e a forma de devolução devem estar no contrato.</li>
<li>Pede recibo de tudo o que pagas.</li>
<li>No dia da entrada, tira fotos de cada divisão e dos equipamentos e envia-as ao senhorio. Faz o mesmo à saída.</li></ul>""",
     'faq': [('Quanto pode ser a caução de uma casa arrendada?', 'No máximo, o valor de 2 rendas (artigo 1076.º do Código Civil, regra em vigor a 30 de outubro de 2026). Há uma proposta do Governo para acabar com este limite, mas ainda não está em vigor.'),
             ('A caução é obrigatória?', 'Não. Só existe se for combinada no contrato. Quando existe, deve ser devolvida no fim se a casa ficar como estava e não houver rendas por pagar.'),
             ('Qual a diferença entre caução e rendas adiantadas?', 'A caução é uma garantia devolvida no fim do contrato, até ao valor de 2 rendas. As rendas adiantadas pagam os meses seguintes, até 2 meses, e não são devolvidas.'),
             ('Como encontro casas sem caução?', 'Na pesquisa da DupliCasa, em Filtros, escolhe «Sem caução indicada» e confirma sempre com quem anuncia.')],
     'fontes': [F_CC, F_AT_CAUCAO, F_CGD, F_REFORMA],
     'botao': 'Procurar casas sem caução', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'arrendar-casa-sem-contrato-riscos', 'data': '2026-10-30',
     'titulo': 'É crime arrendar casa sem contrato? O que diz a lei | DupliCasa',
     'desc': 'Arrendar sem contrato escrito não é crime para o inquilino, mas a lei exige contrato. Como provar que arrendas, as Finanças e como te protegeres.',
     'h1': 'Arrendar casa sem contrato: o que diz a lei',
     'intro': 'A lei exige contrato escrito. Se não o tens, podes ter na mesma direitos, mas fica tudo mais difícil de provar.',
     'corpo': """<h2>O que diz a lei</h2>
<ul><li><strong>Não é crime para o inquilino.</strong> Mas o contrato de arrendamento deve ser feito por escrito (artigo 1069.º, n.º 1, do Código Civil).</li>
<li><strong>Se a falta de contrato não for culpa tua,</strong> podes provar que arrendas a casa por qualquer meio: basta mostrar que vives lá sem oposição do senhorio e que pagas a renda todos os meses há pelo menos 6 meses (artigo 1069.º, n.º 2).</li>
<li><strong>Finanças:</strong> o senhorio tem de comunicar o contrato até ao fim do mês seguinte ao início. Se não o fizer, desde agosto de 2025 podes ser tu a comunicá-lo no Portal das Finanças, depois de acabar o prazo dele.</li>
<li><strong>Recibos:</strong> em regra, o senhorio tem de passar recibo eletrónico de cada renda no Portal das Finanças. Há algumas exceções.</li></ul>
<h2>Os riscos práticos</h2>
<ul><li><strong>Provar o que combinaram:</strong> renda, duração, caução e quem paga as despesas ficam sem registo.</li>
<li><strong>Reaver a caução:</strong> sem nada escrito, é mais difícil exigir a devolução.</li>
<li><strong>Provar que moras lá:</strong> pode complicar a mudança de morada, o atestado de residência ou outros pedidos que precisam de comprovativo.</li>
<li><strong>Sair ou ser mandado sair:</strong> sem prazos escritos, cada parte pode ter uma ideia diferente do que foi combinado.</li></ul>
<h2>Como te proteger</h2>
<ul><li>Pede sempre um contrato escrito antes de pagar.</li>
<li>Paga por transferência, nunca em dinheiro, e guarda os comprovativos: são a melhor prova dos meses de renda pagos.</li>
<li>Pede recibos das rendas.</li>
<li>Guarda as mensagens com o senhorio sobre o que foi combinado.</li></ul>""",
     'faq': [('É crime arrendar casa sem contrato?', 'Para o inquilino, não. A lei exige contrato escrito, e o senhorio tem obrigações nas Finanças (comunicar o contrato e passar recibos). Se a falta de contrato não for culpa tua, podes provar o arrendamento mostrando que vives na casa e pagas a renda há pelo menos 6 meses.'),
             ('Posso provar que arrendo uma casa sem contrato escrito?', 'Sim, se a falta de contrato não for culpa tua: podes provar por qualquer meio que usas a casa sem oposição do senhorio e que pagas a renda todos os meses há pelo menos 6 meses (artigo 1069.º do Código Civil). Transferências bancárias e mensagens ajudam.'),
             ('O senhorio não comunicou o contrato às Finanças. O que faço?', 'Se o senhorio não o comunicar até ao fim do mês seguinte ao início do contrato, podes ser tu a comunicá-lo no Portal das Finanças.'),
             ('Quais são os riscos de arrendar casa sem contrato?', 'Fica mais difícil provar o que foi combinado (renda, duração, caução), reaver a caução e provar que moras na casa.')],
     'fontes': [F_CC, F_AT, F_INQUILINO],
     'botao': 'Ver casas para arrendar', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'aumento-das-rendas-em-2027', 'data': '2026-10-30',
     'titulo': 'Aumento das rendas em 2027: quanto pode subir a renda | DupliCasa',
     'desc': 'Em 2027 a renda pode subir até 2,56%. Como calcular o aumento, quando o senhorio o pode aplicar e com quanto tempo tem de avisar.',
     'h1': 'Aumento das rendas em 2027',
     'intro': 'O coeficiente para 2027 é 1,0256: nos contratos que seguem a regra da lei, a renda pode subir até 2,56%.',
     'corpo': """<h2>Quanto pode subir</h2>
<p>O coeficiente de atualização das rendas para 2027 é <strong>1,0256</strong>, publicado no Aviso n.º 24199/2026/2, no Diário da República de 1 de outubro de 2026. Para saber a renda nova, multiplica a atual por 1,0256:</p>
<ul><li>500 € passam a 512,80 €;</li><li>800 € passam a 820,48 €;</li><li>1000 € passam a 1025,60 €.</li></ul>
<h2>Quando e como</h2>
<ul><li>A renda só pode subir 1 ano depois do início do contrato ou da última atualização.</li>
<li>O senhorio tem de te avisar por escrito com pelo menos 30 dias de antecedência.</li>
<li>Se o contrato tiver outra regra para atualizar a renda, vale a do contrato.</li></ul>
<h2>Vais mudar de casa?</h2>
<p>A renda de um contrato novo é combinada entre as partes. Compara o que te pedem com o <a href="/arrendar/precos/">preço das rendas na zona</a> e vê as <a href="/#pesquisa">casas para arrendar</a> dos principais sites num só lugar.</p>""",
     'faq': [('Quanto pode subir a renda em 2027?', 'Até 2,56%, nos contratos que seguem a regra da lei: multiplica a renda atual por 1,0256 (Aviso n.º 24199/2026/2, Diário da República de 1 de outubro de 2026).'),
             ('Quando pode o senhorio aumentar a renda?', 'Só 1 ano depois do início do contrato ou da última atualização, e com aviso por escrito com pelo menos 30 dias de antecedência.')],
     'fontes': [F_CC, F_COEF],
     'botao': 'Ver casas para arrendar', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'como-evitar-burlas-no-arrendamento', 'data': '2026-10-30',
     'titulo': 'Como evitar burlas no arrendamento: sinais e o que fazer | DupliCasa',
     'desc': 'Os sinais de uma burla em anúncios de casas para arrendar, como confirmar que o anúncio é verdadeiro e o que fazer se fores enganado.',
     'h1': 'Como evitar burlas no arrendamento',
     'intro': 'As burlas em casas para arrendar repetem quase sempre os mesmos sinais. Saber reconhecê-los é a melhor proteção.',
     'corpo': """<h2>Sinais de alerta</h2>
<ul><li>Renda muito abaixo das outras na mesma zona.</li>
<li>Pressa: «há muita gente interessada, paga hoje para reservar».</li>
<li>Quem anuncia diz estar fora do país e não pode mostrar a casa.</li>
<li>Pede pagamento, ou cópias dos teus documentos, antes da visita.</li>
<li>Fala só por mensagens e evita chamadas.</li>
<li>As mesmas fotos aparecem noutros anúncios, com outro preço ou noutra cidade.</li></ul>
<h2>Como confirmar que o anúncio é verdadeiro</h2>
<ul><li>Visita a casa antes de pagar qualquer valor.</li>
<li>Pede para ver um documento que mostre que a casa é de quem anuncia, como a caderneta predial.</li>
<li>Pesquisa as fotos do anúncio numa pesquisa de imagens para ver se aparecem noutro lado.</li>
<li>Compara a renda com o <a href="/arrendar/precos/">preço das rendas na zona</a>.</li></ul>
<h2>Se já pagaste a um burlão</h2>
<ul><li>Contacta logo o teu banco: às vezes ainda dá para travar a transferência.</li>
<li>Guarda tudo: anúncio, mensagens, comprovativos.</li>
<li>Apresenta queixa às autoridades.</li></ul>
<h2>Pagamento seguro (em breve)</h2>
<p>Com o <a href="/#proteger">pagamento seguro da DupliCasa</a>, a entrada vai ficar guardada numa instituição de pagamento autorizada e só chega ao senhorio quando recebes as chaves. Podes entrar já na lista de espera.</p>""",
     'faq': [('Como sei se um anúncio de casa é burla?', 'Desconfia de rendas muito abaixo da zona, de pressa para pagar, de quem não pode mostrar a casa e de pedidos de pagamento antes da visita. Pesquisa as fotos para ver se aparecem noutros anúncios.'),
             ('O que fazer se paguei a um burlão?', 'Contacta logo o teu banco, guarda o anúncio, as mensagens e os comprovativos, e apresenta queixa às autoridades.')],
     'botao': 'Entrar na lista do pagamento seguro', 'link': '/#proteger', 'legal': False},
]


def gerar_guias(paginas, hoje):
    for g in GUIAS:
        caminho = f"/arrendar/guias/{g['slug']}/"
        outros = '<h2>Outros guias</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/guias/{x["slug"]}/">{e(x["h1"])}</a></li>' for x in GUIAS if x is not g) + '</ul>'
        fontes = ''
        if g.get('fontes'):
            fontes = ('<h2>Fontes</h2><ul class="fontes">' + ''.join(f'<li><a href="{e(u)}" rel="noopener">{e(t)}</a></li>' for t, u in g['fontes'])
                      + f'</ul><p class="nota">Regras confirmadas a {LEI_CONFIRMADA}. Se a lei mudar, atualizamos este guia.</p>')
        corpo = '<article class="guia">' + g['corpo'] + fontes + (NOTA_LEGAL if g['legal'] else '') + '</article>' + outros
        paginas[caminho] = pagina(caminho, g['titulo'], g['desc'], g['h1'], g['intro'],
                                  [('Início', '/'), ('Arrendar', '/arrendar/'), ('Guias', '/arrendar/guias/'), (g['h1'], caminho)],
                                  [], corpo, g['link'], hoje, faq=g['faq'], artigo=g['data'], botao=g['botao'])
    lista = '<ul class="ch">' + ''.join(f'<li><a href="/arrendar/guias/{x["slug"]}/">{e(x["h1"])}</a></li>' for x in GUIAS) + '</ul>'
    paginas['/arrendar/guias/'] = pagina('/arrendar/guias/', 'Guias para arrendar casa em Portugal | DupliCasa',
                                         'Guias para arrendar casa em Portugal, com o que diz a lei: passo a passo, sem fiador, sem caução, sem contrato, aumento das rendas em 2027 e burlas.',
                                         'Guias para arrendar casa', 'Respostas práticas às perguntas que mais se fazem antes de arrendar casa em Portugal.',
                                         [('Início', '/'), ('Arrendar', '/arrendar/'), ('Guias', '/arrendar/guias/')], [], lista, '/#pesquisa', hoje)


def llms_full(resumo, n_total, hoje):
    """Versão longa do llms.txt, com os números de hoje: para os assistentes de IA citarem dados atuais."""
    linhas = sorted([r for r in resumo if r['n'] >= 10], key=lambda r: -r['n'])
    f = lambda v: (num(v) + ' €') if v else 'sem dados suficientes'
    t = [f'# DupliCasa: casas e quartos para alugar em Portugal (dados de {hoje})', '',
         f'> {num(n_total)} casas, apartamentos e quartos para arrendar em Portugal, juntos de vários sites na DupliCasa (duplicasa.pt). '
         'Os valores abaixo são a mediana das rendas pedidas nos anúncios ativos (não o preço final do contrato), atualizados de 30 em 30 minutos.', '',
         '## Renda mediana por cidade', '']
    for r in linhas:
        t.append(f'### {r["cidade"]}')
        t.append(f'- Anúncios: {num(r["n"])} ({SITE}/arrendar/{r["slug"]}/)')
        t.append(f'- Quarto: {f(r["quarto"])} por mês')
        t.append(f'- T0: {f(r["T0"])}; T1: {f(r["T1"])}; T2: {f(r["T2"])} por mês')
        if r['m2']:
            t.append(f'- Preço por m² (apartamentos e moradias): {str(round(r["m2"], 1)).replace(".", ",")} € por mês')
        if r['min']:
            t.append(f'- Renda mais baixa agora: {num(r["min"])} €')
        t.append('')
    t += [f'## Regras do arrendamento em Portugal (confirmadas a {LEI_CONFIRMADA})',
          '- Caução: no máximo o valor de 2 rendas; rendas adiantadas: no máximo 2 meses, com acordo escrito (artigo 1076.º do Código Civil). '
          'A Proposta de Lei n.º 103/XVII/1 quer acabar com o limite da caução e permitir 3 rendas adiantadas, mas ainda não está em vigor.',
          '- Contrato: deve ser escrito (artigo 1069.º do Código Civil). Sem contrato escrito por culpa que não seja do inquilino, este pode provar o arrendamento '
          'mostrando que usa a casa sem oposição do senhorio e paga a renda há pelo menos 6 meses.',
          '- Finanças: o senhorio comunica o contrato até ao fim do mês seguinte ao início; se não o fizer, o inquilino pode comunicá-lo no Portal das Finanças.',
          '- Fiador: nenhuma lei o obriga; não existe garantia do Estado que o substitua no arrendamento.',
          '- Atualização das rendas em 2027: até 2,56% (coeficiente 1,0256, Aviso n.º 24199/2026/2), 1 ano após o início ou a última atualização, com 30 dias de aviso.',
          f'- Guias com fontes: {SITE}/arrendar/guias/', '',
          '## Sobre a DupliCasa', '- Ver casas e criar alertas é grátis. O acesso para contactar quem anuncia custa 1 € nos primeiros 30 dias e depois 9,99 € a cada 30 dias, até cancelar.',
          '- Pagamento seguro (em breve): a entrada só chega ao senhorio quando os dois confirmam a entrega das chaves.',
          f'- Mais: {SITE}/llms.txt · {SITE}/arrendar/precos/', '']
    return '\n'.join(t)


def avisar_indexnow(urls, pasta):
    """Avisa o Bing (e quem usa IndexNow) das páginas novas, no máximo uma vez por dia. Falhas não param nada."""
    marca = os.path.join(pasta, '.indexnow')
    try:
        if time.time() - os.path.getmtime(marca) < 86400:
            return
    except OSError:
        pass
    try:
        open(marca, 'w').write(str(int(time.time())))     # uma tentativa por dia, corra bem ou mal
    except OSError:
        return
    corpo = json.dumps({'host': SITE.split('//')[1], 'key': INDEXNOW, 'keyLocation': f'{SITE}/{INDEXNOW}.txt', 'urlList': urls[:10000]}).encode()
    try:
        req = urllib.request.Request('https://api.indexnow.org/indexnow', data=corpo, method='POST', headers={'Content-Type': 'application/json; charset=utf-8'})
        with urllib.request.urlopen(req, timeout=15) as r:
            print('IndexNow:', r.status)
    except Exception as ex:
        print('IndexNow falhou:', type(ex).__name__, getattr(ex, 'code', ''), file=sys.stderr)


def main():
    origem, destino = sys.argv[1], sys.argv[2]
    try:
        dados = json.load(open(origem, encoding='utf-8'))
    except (OSError, ValueError):
        print('Sem anúncios: nada a gerar.', file=sys.stderr)
        return
    anuncios, atualizado = dados.get('anuncios') or [], dados.get('atualizado') or ''
    if len(anuncios) < 50:
        print('Poucos anúncios: mantenho as páginas anteriores.', file=sys.stderr)
        return
    paginas, resumo = gerar(anuncios, atualizado)
    gerar_guias(paginas, data_pt(atualizado))
    pai = os.path.dirname(os.path.abspath(destino))
    os.makedirs(pai, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='.seo-', dir=pai)
    for caminho, conteudo in paginas.items():
        p = os.path.join(tmp, caminho.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(conteudo)
    lastmod = (atualizado or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))[:10]
    urls = [SITE + '/'] + [SITE + c for c in sorted(paginas)]
    open(os.path.join(tmp, 'llms-full.txt'), 'w', encoding='utf-8').write(llms_full(resumo, len(anuncios), data_pt(atualizado)))
    open(os.path.join(tmp, 'sitemap.xml'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        ''.join(f'  <url><loc>{u}</loc><lastmod>{lastmod}</lastmod></url>\n' for u in urls) + '</urlset>\n')
    os.chmod(tmp, 0o755)
    for raiz, ds, fs in os.walk(tmp):
        for d in ds:
            os.chmod(os.path.join(raiz, d), 0o755)
        for f in fs:
            os.chmod(os.path.join(raiz, f), 0o644)
    velho = destino + '.velho'
    shutil.rmtree(velho, ignore_errors=True)
    if os.path.exists(destino):
        os.rename(destino, velho)
    os.rename(tmp, destino)
    shutil.rmtree(velho, ignore_errors=True)
    print(f'Páginas SEO: {len(paginas)} + sitemap.xml ({len(urls)} endereços)')
    if os.environ.get('DC_INDEXNOW', '1') == '1':
        avisar_indexnow(urls, pai)


if __name__ == '__main__':
    main()
