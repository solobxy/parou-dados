#!/usr/bin/env python3
"""Duplicasa: páginas para o Google (SEO), feitas a partir dos anúncios recolhidos.

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
TIPOS = [('quartos', 'Quartos', 'Quarto'), ('apartamentos', 'Apartamentos', 'Apartamento'), ('moradias', 'Moradias', 'Moradia'),
         ('t0', 'T0', 'T0'), ('t1', 'T1', 'T1'), ('t2', 'T2', 'T2'), ('t3-ou-mais', 'T3 ou mais', 'T3+')]
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
LOGO = '<svg viewBox="-137.5 -96.5 591.8 122.9" width="135" height="28" role="img" aria-label="Duplicasa">' + '<g transform="translate(-153.26 -104.34) scale(1.3593)"><path fill="#0B6E4F" d="M11 88V52.00A22.0 22.0 0 0 1 55 52.00V88Z"/><path fill="#08523B" d="M42 88V36.00A24.0 24.0 0 0 1 90 36.00V88Z"/><path fill="#F2A33A" d="M42 88L42.00 36.00L42.27 32.40L42.54 32.18L42.81 32.31L43.08 32.45L43.35 32.59L43.62 32.74L43.90 32.89L44.17 33.04L44.44 33.21L44.71 33.37L44.98 33.55L45.25 33.73L45.52 33.91L45.79 34.10L46.06 34.30L46.33 34.50L46.60 34.71L46.88 34.93L47.15 35.15L47.42 35.38L47.69 35.62L47.96 35.87L48.23 36.12L48.50 36.39L48.77 36.66L49.04 36.94L49.31 37.24L49.58 37.54L49.85 37.86L50.12 38.19L50.40 38.53L50.67 38.89L50.94 39.26L51.21 39.65L51.48 40.06L51.75 40.49L52.02 40.95L52.29 41.42L52.56 41.93L52.83 42.48L53.10 43.07L53.38 43.70L53.65 44.40L53.92 45.18L54.19 46.08L54.46 47.15L54.73 48.56L55.00 52.00L55 88Z"/></g><path fill="#0F1A17" d="M30.615234375 0.0C52.880859375 0.0 66.2109375 -13.96484375 66.2109375 -36.474609375C66.2109375 -58.837890625 52.783203125 -72.75390625 31.15234375 -72.75390625H6.0546875V0.0ZM18.9453125 -11.03515625V-61.71875H30.322265625C45.654296875 -61.71875 53.173828125 -52.490234375 53.173828125 -36.474609375C53.173828125 -20.3125 45.751953125 -11.03515625 29.931640625 -11.03515625Z M92.3546875 1.025390625C99.48359375 1.025390625 104.708203125 -2.099609375 108.223828125 -7.91015625V0.0H120.333203125V-51.5625H107.9796875V-22.412109375C107.9796875 -13.623046875 103.19453125 -9.765625 96.700390625 -9.765625C90.10859375 -9.765625 86.3 -13.720703125 86.3 -21.2890625V-51.5625H73.9953125V-19.3359375C73.9953125 -6.103515625 81.563671875 1.025390625 92.3546875 1.025390625Z M130.070703125 20.41015625H142.375390625V-7.763671875H142.521875C145.74453125 -1.904296875 151.164453125 1.025390625 157.902734375 1.025390625C171.379296875 1.025390625 180.2171875 -9.765625 180.2171875 -25.830078125C180.2171875 -41.69921875 171.2328125 -52.587890625 157.9515625 -52.587890625C151.262109375 -52.587890625 145.54921875 -49.853515625 142.3265625 -44.384765625H142.180078125V-51.5625H130.070703125ZM155.021875 -9.27734375C146.965234375 -9.27734375 141.691796875 -15.771484375 141.691796875 -25.830078125C141.691796875 -35.83984375 146.965234375 -42.3828125 155.021875 -42.3828125C162.6390625 -42.3828125 167.766015625 -36.474609375 167.766015625 -25.830078125C167.766015625 -15.13671875 162.6390625 -9.27734375 155.021875 -9.27734375Z M199.86679687499998 -72.75390625H187.56210937499998V0.0H199.86679687499998Z M209.604296875 0.0H221.908984375V-51.5625H209.604296875ZM215.756640625 -59.228515625C219.955859375 -59.228515625 223.1296875 -62.255859375 223.1296875 -66.259765625C223.1296875 -70.21484375 219.955859375 -73.2421875 215.756640625 -73.2421875C211.557421875 -73.2421875 208.38359375 -70.21484375 208.38359375 -66.259765625C208.38359375 -62.255859375 211.557421875 -59.228515625 215.756640625 -59.228515625Z"/><g transform="translate(226.18 0)"><path fill="#0B6E4F" d="M37.79296875 1.171875C54.19921875 1.171875 66.69921875 -8.984375 69.140625 -24.853515625H56.0546875C54.00390625 -15.625 47.16796875 -10.400390625 37.890625 -10.400390625C24.51171875 -10.400390625 16.50390625 -20.703125 16.50390625 -36.328125C16.50390625 -52.05078125 24.560546875 -62.353515625 37.890625 -62.353515625C47.216796875 -62.353515625 54.052734375 -57.080078125 56.005859375 -47.802734375H69.140625C66.69921875 -63.720703125 54.19921875 -73.92578125 37.79296875 -73.92578125C17.724609375 -73.92578125 3.515625 -59.1796875 3.515625 -36.328125C3.515625 -13.623046875 17.724609375 1.171875 37.79296875 1.171875Z M92.45234375 0.830078125C100.85078125 0.830078125 105.196484375 -2.685546875 107.637890625 -7.275390625H107.833203125V0.0H119.942578125V-35.15625C119.942578125 -45.8984375 111.98359375 -52.587890625 98.555859375 -52.587890625C85.079296875 -52.587890625 76.680859375 -45.80078125 76.094921875 -35.546875H87.96015625C88.301953125 -39.892578125 92.305859375 -43.017578125 98.31171875 -43.017578125C104.219921875 -43.017578125 107.735546875 -39.892578125 107.735546875 -35.498046875V-35.107421875C107.735546875 -31.591796875 104.4640625 -31.4453125 94.89375 -30.37109375C84.24921875 -29.248046875 74.630078125 -26.3671875 74.630078125 -14.6484375C74.630078125 -4.345703125 82.1984375 0.830078125 92.45234375 0.830078125ZM95.4796875 -8.30078125C90.10859375 -8.30078125 86.641796875 -10.693359375 86.641796875 -14.74609375C86.641796875 -19.43359375 91.133984375 -21.337890625 96.407421875 -22.119140625C101.485546875 -22.900390625 106.270703125 -23.681640625 107.784375 -24.658203125V-19.091796875C107.784375 -13.0859375 103.536328125 -8.30078125 95.4796875 -8.30078125Z M149.84609375 1.220703125C162.590234375 1.220703125 171.72109375 -5.126953125 171.72109375 -15.185546875C171.72109375 -22.75390625 166.984765625 -27.24609375 156.7796875 -29.39453125L147.50234375 -31.298828125C143.20546875 -32.2265625 140.66640625 -34.130859375 140.66640625 -37.20703125C140.66640625 -40.72265625 143.98671875 -43.45703125 149.406640625 -43.45703125C155.021875 -43.45703125 158.781640625 -40.087890625 158.879296875 -35.498046875H170.4515625C170.15859375 -46.09375 161.613671875 -52.685546875 149.113671875 -52.685546875C136.516015625 -52.685546875 128.36171875 -46.2890625 128.36171875 -36.81640625C128.36171875 -29.00390625 133.5375 -23.974609375 143.40078125 -21.923828125L152.18984375 -20.1171875C156.535546875 -19.189453125 159.22109375 -17.3828125 159.22109375 -14.2578125C159.22109375 -10.595703125 155.6078125 -8.0078125 149.65078125 -8.0078125C143.4984375 -8.0078125 139.88515625 -10.888671875 139.348046875 -15.91796875H127.18984375C127.97109375 -4.833984375 137.297265625 1.220703125 149.84609375 1.220703125Z M194.64218749999998 0.830078125C203.04062499999998 0.830078125 207.38632812499998 -2.685546875 209.82773437499998 -7.275390625H210.02304687499998V0.0H222.13242187499998V-35.15625C222.13242187499998 -45.8984375 214.17343749999998 -52.587890625 200.74570312499998 -52.587890625C187.26914062499998 -52.587890625 178.87070312499998 -45.80078125 178.28476562499998 -35.546875H190.14999999999998C190.49179687499998 -39.892578125 194.49570312499998 -43.017578125 200.50156249999998 -43.017578125C206.40976562499998 -43.017578125 209.92539062499998 -39.892578125 209.92539062499998 -35.498046875V-35.107421875C209.92539062499998 -31.591796875 206.65390624999998 -31.4453125 197.08359374999998 -30.37109375C186.43906249999998 -29.248046875 176.81992187499998 -26.3671875 176.81992187499998 -14.6484375C176.81992187499998 -4.345703125 184.38828124999998 0.830078125 194.64218749999998 0.830078125ZM197.66953124999998 -8.30078125C192.29843749999998 -8.30078125 188.83164062499998 -10.693359375 188.83164062499998 -14.74609375C188.83164062499998 -19.43359375 193.32382812499998 -21.337890625 198.59726562499998 -22.119140625C203.67539062499998 -22.900390625 208.46054687499998 -23.681640625 209.97421874999998 -24.658203125V-19.091796875C209.97421874999998 -13.0859375 205.72617187499998 -8.30078125 197.66953124999998 -8.30078125Z"/></g>' + '</svg>'
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


def cartao(a):
    i = str(id_num(a['id']))
    t = tip(a) or a.get('tipo') or 'Casa'
    partes = [t] + ([f"{a['area']} m²"] if area_ok(a) else []) + [a.get('bairro') or a.get('cidade') or '']
    foto = (a.get('fotos') or [''])[0]
    preco = f"{num(a['renda'])} €<small> /mês</small>" if a.get('renda') else 'Preço sob consulta'
    img = (f'<img src="{e(foto)}" alt="{e(t)} para arrendar em {e(a.get("bairro") or a.get("cidade") or "")}" '
           f'loading="lazy" width="400" height="250" referrerpolicy="no-referrer">' if foto else '<div class="sem"></div>')
    return f'<a class="c" href="/#casa-{i}">{img}<div class="cc"><p class="p">{preco}</p><p class="l">{e(" · ".join(partes))}</p></div></a>'


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


def pagina(caminho, titulo, descricao, h1, intro, migalhas, cartoes, links, ver_todas, atualizado, extra='', faq=None, tabela=''):
    url = SITE + caminho
    if len(titulo) > 65 and titulo.endswith(' | Duplicasa'):     # o Google corta títulos compridos: a marca sai primeiro
        titulo = titulo[:-len(' | Duplicasa')]
    lds = [{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': n + 1, 'name': nome, 'item': SITE + c} for n, (nome, c) in enumerate(migalhas)]}]
    if cartoes:
        lds.append({'@context': 'https://schema.org', '@type': 'ItemList', 'name': h1, 'numberOfItems': len(cartoes),
                    'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'item': item_ld(a)} for n, a in enumerate(cartoes)]})
    if faq:
        lds.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub(r'<[^>]+>', '', r)}} for q, r in faq]})
    lds.append({'@context': 'https://schema.org', '@type': 'WebPage', 'name': titulo, 'url': url, 'inLanguage': 'pt-PT',
                'description': descricao, 'isPartOf': {'@type': 'WebSite', 'name': 'Duplicasa', 'url': SITE + '/'},
                'publisher': {'@type': 'Organization', 'name': 'Duplicasa', 'url': SITE + '/', 'logo': SITE + '/marca/duaschaves-icone.png'}})
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
<meta property="og:type" content="website"><meta property="og:site_name" content="Duplicasa"><meta property="og:locale" content="pt_PT">
<meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(descricao)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/marca/duaschaves-og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Duplicasa: casas para arrendar em Portugal, num só lugar"><meta name="twitter:card" content="summary_large_image">
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
.c{{display:block;background:#fff;border-radius:18px;overflow:hidden;text-decoration:none}}.c img,.c .sem{{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#D6DDDA}}
.cc{{padding:14px 16px}}.p{{margin:0;font-weight:800;font-size:20px}}.p small{{font-weight:600;color:var(--t3);font-size:14px}}.l{{margin:4px 0 0;color:var(--t2);font-size:15px}}
.ch{{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}}.ch a{{display:inline-flex;min-height:44px;align-items:center;padding:0 16px;border:1px solid #C9D3CF;border-radius:999px;background:#fff;text-decoration:none;font-weight:600}}
.cx{{background:#fff;border-radius:18px;padding:20px;margin-top:32px}}.cx p,.cx li{{color:var(--t2)}}
details{{border-top:1px solid var(--b);padding:12px 0}}details:first-of-type{{border-top:0}}summary{{font-weight:700;cursor:pointer;min-height:24px}}details p{{margin:8px 0 0}}
.tab{{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden;font-size:15px}}.tab th,.tab td{{text-align:left;padding:10px 12px;border-bottom:1px solid var(--b)}}.tab th{{color:var(--t3);font-weight:700}}.tab td.n,.tab th.n{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}.rolar .tab{{min-width:620px}}
.rolar{{overflow-x:auto;border-radius:18px}}
footer{{margin-top:56px;border-top:1px solid var(--b);padding:28px 0 40px;font-size:14px;color:var(--t3)}}footer a{{margin-right:12px}}
@media(min-width:900px){{h1{{font-size:46px}}}}
</style></head><body>
<header><div class="w"><a class="logo" href="/" aria-label="Duplicasa, início">{LOGO}</a><a class="bt" href="{ver_todas}">Ver casas</a></div></header>
<main class="w">
<nav class="mig" aria-label="Estás aqui">{nav}</nav>
<h1>{e(h1)}</h1>
<p class="intro">{intro}</p>
<p><a class="bt" href="{ver_todas}">Pesquisar com filtros e alertas</a></p>
{grelha}
{tabela}
{links}
{faq_html}
<section class="cx"><h2 style="margin-top:0">Arrendar sem cair numa burla</h2>
<ul><li>Visita a casa antes de pagar qualquer valor.</li><li>Desconfia de rendas muito abaixo das outras na zona.</li>
<li>Confirma que quem anuncia é mesmo o dono.</li><li>Em breve, com o pagamento seguro da Duplicasa, a entrada só vai chegar ao senhorio quando receberes as chaves.</li></ul></section>
{extra}
</main>
<footer><div class="w"><p>Duplicasa · casas e quartos para alugar em Portugal, num só lugar. Anúncios atualizados a {atualizado}.</p>
<p><a href="/arrendar/">Todas as cidades</a><a href="/arrendar/precos/">Preço das rendas</a><a href="/">Início</a><a href="/#senhorios">Para senhorios</a><a href="/#termos">Termos e privacidade</a></p></div></footer>
</body></html>
'''


def data_pt(iso):
    try:
        d = datetime.datetime.strptime(iso[:10], '%Y-%m-%d')
        return f'{d.day} de {MESES[d.month - 1]} de {d.year}'
    except Exception:
        return 'hoje'


def nome_tipo(tt, tn):
    return {'Quarto': 'Quartos', 'Apartamento': 'Apartamentos', 'Moradia': 'Moradias'}.get(tt, tn)


def palavra_alugar(tt):
    """«alugar» onde se pesquisa mais assim (cidade, quartos, apartamentos); «arrendar» nas tipologias e moradias."""
    return 'alugar' if tt in (None, 'Quarto', 'Apartamento') else 'arrendar'


def gerar(anuncios, atualizado):
    hoje = data_pt(atualizado)
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
        frases = [f'Há {num(len(lista))} casas, apartamentos e quartos para alugar {e(em(cidade))} na Duplicasa, juntos de vários sites e atualizados a {hoje}.']
        if meds.get('T1'):
            frases.append(f'Um T1 pede, a meio da tabela, {num(meds["T1"])} € por mês.')
        if meds.get('Quarto'):
            frases.append(f'Um quarto anda pelos {num(meds["Quarto"])} €.')
        if boas:
            frases.append(f'A renda mais baixa agora é de {num(boas[0]["renda"])} €.')
        links = ('<h2>Por tipo de casa</h2><ul class="ch">' + ''.join(
            f'<li><a href="/arrendar/{s}/{ts}/">{e(nome_tipo(tt, tn))} {e(em(cidade))}</a></li>' for ts, tn, tt in tipos_pag) + '</ul>') if tipos_pag else ''
        vizinhas = [c for c, _ in cidades if c != cidade and (por_cidade[c][0].get('distrito') == lista[0].get('distrito'))][:12]
        if vizinhas:
            links += '<h2>Perto de ' + e(cidade) + '</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{slug(c)}/">Casas para alugar {e(em(c))}</a></li>' for c in vizinhas) + '</ul>'
        faq = []
        if meds.get('T1'):
            faq.append((f'Quanto custa alugar um T1 {em(cidade)}?', f'A meio da tabela, um T1 para arrendar {e(em(cidade))} pede {num(meds["T1"])} € por mês, nos anúncios da Duplicasa a {hoje}.'
                        + (f' O mais barato que temos agora custa {num(min(a["renda"] for a in lista if plausivel(a) and tip(a) == "T1"))} €.' if any(plausivel(a) and tip(a) == 'T1' for a in lista) else '')))
        if meds.get('Quarto'):
            faq.append((f'Quanto custa um quarto {em(cidade)}?', f'Um quarto para alugar {e(em(cidade))} anda pelos {num(meds["Quarto"])} € por mês (mediana dos anúncios a {hoje}). Há quartos para estudantes e para quem trabalha.'))
        if m2:
            faq.append((f'Qual é o preço por m² das rendas {em(cidade)}?', f'Nos apartamentos e moradias anunciados {e(em(cidade))}, a renda mediana é de {str(round(m2, 1)).replace(".", ",")} € por m² por mês.'))
        faq.append((f'Há casas para alugar a particulares {em(cidade)}?', f'Sim. Dos {num(len(lista))} anúncios {e(em(cidade))}, {num(n_part)} são de particulares, sem agência. Na pesquisa da Duplicasa podes mostrar só esses.' if n_part
                    else f'Neste momento os anúncios {e(em(cidade))} são de agências. Cria um alerta e avisamos-te quando aparecer uma casa de um particular.'))
        faq.append(('Como recebo as casas novas primeiro?', 'Cria um alerta grátis na Duplicasa: recebes um resumo por dia. Com o acesso, o aviso chega no minuto em que a casa aparece.'))
        desde = f' desde {num(boas[0]["renda"])} €' if boas else ''
        paginas[f'/arrendar/{s}/'] = pagina(
            f'/arrendar/{s}/', f'Casas para alugar {em(cidade)}{desde} | Duplicasa',
            f'{num(len(lista))} casas, apartamentos e quartos para alugar {em(cidade)}, dos mais baratos para os mais caros. Arrenda sem burlas e sabe das casas novas no minuto.',
            f'Casas para alugar {em(cidade)}', ' '.join(frases),
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
                      f'Desde {num(sub[0]["renda"])} € por mês' + (f'; a meio da tabela, {num(md)} €' if md else '') + f' (anúncios da Duplicasa a {hoje}).')]
            tips_q = {'Quarto': 'Quarto', 'Apartamento': '', 'Moradia': ''}.get(tt, tt)
            paginas[f'/arrendar/{s}/{ts}/'] = pagina(
                f'/arrendar/{s}/{ts}/', f'{nome} para {pal} {em(cidade)} desde {num(sub[0]["renda"])} € | Duplicasa',
                f'{nome} para {pal} {em(cidade)}, dos mais baratos para os mais caros, desde {num(sub[0]["renda"])} € por mês. Alertas de casas novas no minuto em que aparecem.',
                f'{nome} para {pal} {em(cidade)}', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/'), (nome, f'/arrendar/{s}/{ts}/')],
                sub[:MAX_CARTOES], outros, '/#pesquisa?cidade=' + quote(cidade) + ('&amp;tips=' + quote(tips_q) if tips_q else ''), hoje, faq=faq_t)
    # índice de cidades, agrupado por distrito
    por_distrito = {}
    for c, l in cidades:
        por_distrito.setdefault(l[0].get('distrito') or 'Outros', []).append((c, len(l)))
    blocos = ''.join('<h2>' + e(d) + '</h2><ul class="ch">' + ''.join(
        f'<li><a href="/arrendar/{slug(c)}/">{e(c)} ({n})</a></li>' for c, n in sorted(cs)) + '</ul>' for d, cs in sorted(por_distrito.items()))
    blocos = '<p><a href="/arrendar/precos/">Ver o preço das rendas em cada cidade</a></p>' + blocos
    baratas = sorted([a for a in anuncios if plausivel(a) and a.get('fotos') and tip(a) in ('T0', 'T1', 'Quarto')], key=lambda a: a['renda'])[:12]
    paginas['/arrendar/'] = pagina(
        '/arrendar/', 'Casas e quartos para alugar em Portugal, por cidade | Duplicasa',
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
              '</tbody></table></div><p class="intro" style="font-size:15px;margin-top:12px">Mediana das rendas pedidas nos anúncios ativos na Duplicasa a ' + hoje +
              '. É o preço pedido, não o preço final do contrato. Cidades com pelo menos 10 anúncios.</p>')
    lx = next((r for r in linhas if r['cidade'] == 'Lisboa'), None)
    pt = next((r for r in linhas if r['cidade'] == 'Porto'), None)
    intro_p = f'Quanto custa arrendar casa em Portugal, cidade a cidade, a {hoje}.'
    if lx and lx['T1']:
        intro_p += f' Em Lisboa, um T1 pede a meio da tabela {num(lx["T1"])} € por mês'
        intro_p += (f'; no Porto, {num(pt["T1"])} €.' if pt and pt['T1'] else '.')
    faq_p = []
    if lx and lx['T1']:
        faq_p.append(('Qual é a renda média de um T1 em Lisboa?', f'A meio da tabela, {num(lx["T1"])} € por mês nos anúncios da Duplicasa a {hoje}.'))
    if pt and pt['T1']:
        faq_p.append(('Qual é a renda média de um T1 no Porto?', f'A meio da tabela, {num(pt["T1"])} € por mês nos anúncios da Duplicasa a {hoje}.'))
    if lx and lx['quarto']:
        faq_p.append(('Quanto custa um quarto em Lisboa?', f'Cerca de {num(lx["quarto"])} € por mês (mediana dos anúncios a {hoje}).'))
    faq_p.append(('De onde vêm estes números?', 'Da mediana das rendas pedidas nos anúncios ativos na Duplicasa, que junta vários sites de arrendamento em Portugal. Atualizamos de 30 em 30 minutos.'))
    paginas['/arrendar/precos/'] = pagina(
        '/arrendar/precos/', f'Preço das rendas em Portugal por cidade ({MESES[datetime.date.today().month - 1]} {datetime.date.today().year}) | Duplicasa',
        'Quanto custa arrendar casa em Lisboa, Porto, Braga, Coimbra e outras cidades: renda mediana de quartos, T0, T1 e T2 e preço por m², com dados atualizados.',
        'Preço das rendas em Portugal, por cidade', intro_p,
        [('Início', '/'), ('Arrendar', '/arrendar/'), ('Preço das rendas', '/arrendar/precos/')],
        [], '', '/#pesquisa', hoje, faq=faq_p, tabela=tabela)
    return paginas, resumo


def llms_full(resumo, n_total, hoje):
    """Versão longa do llms.txt, com os números de hoje: para os assistentes de IA citarem dados atuais."""
    linhas = sorted([r for r in resumo if r['n'] >= 10], key=lambda r: -r['n'])
    f = lambda v: (num(v) + ' €') if v else 'sem dados suficientes'
    t = [f'# Duplicasa: casas e quartos para alugar em Portugal (dados de {hoje})', '',
         f'> {num(n_total)} casas, apartamentos e quartos para arrendar em Portugal, juntos de vários sites na Duplicasa (duplicasa.pt). '
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
    t += ['## Sobre a Duplicasa', '- Ver casas e criar alertas é grátis. O acesso para contactar quem anuncia custa 1 € nos primeiros 30 dias e depois 9,99 € a cada 30 dias, até cancelar.',
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
