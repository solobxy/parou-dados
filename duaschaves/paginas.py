#!/usr/bin/env python3
"""Duplicasa: páginas para o Google (SEO), feitas a partir dos anúncios recolhidos.

Gera HTML estático (sem JavaScript) para cada cidade com anúncios e para cada tipologia dentro da cidade:
  /arrendar/                      todas as cidades
  /arrendar/<cidade>/             casas para arrendar na cidade
  /arrendar/<cidade>/<tipo>/      quartos, t0, t1, t2, t3-ou-mais
e ainda /sitemap.xml. Corre depois de cada recolha. Cada página tem título, descrição, canonical, Open Graph,
dados estruturados (BreadcrumbList e ItemList) e texto com números reais da cidade, para não ser conteúdo fino.

Uso: python3 paginas.py anuncios.json pasta_de_saida
"""
import datetime, html, json, os, re, shutil, sys, tempfile, unicodedata
from urllib.parse import quote
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ids import id_num

SITE = 'https://duplicasa.pt'
MIN_CIDADE, MIN_TIPO, MAX_CARTOES = 5, 3, 30
TIPOS = [('quartos', 'Quartos', 'Quarto'), ('t0', 'T0', 'T0'), ('t1', 'T1', 'T1'), ('t2', 'T2', 'T2'), ('t3-ou-mais', 'T3 ou mais', 'T3+')]
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
LOGO = '<svg viewBox="-137.5 -96.5 591.8 122.9" width="135" height="28" role="img" aria-label="Duplicasa">' + '<g transform="translate(-153.26 -104.34) scale(1.3593)"><path fill="#0B6E4F" d="M11 88V52.00A22.0 22.0 0 0 1 55 52.00V88Z"/><path fill="#08523B" d="M42 88V36.00A24.0 24.0 0 0 1 90 36.00V88Z"/><path fill="#F2A33A" d="M42 88L42.00 36.00L42.27 32.40L42.54 32.18L42.81 32.31L43.08 32.45L43.35 32.59L43.62 32.74L43.90 32.89L44.17 33.04L44.44 33.21L44.71 33.37L44.98 33.55L45.25 33.73L45.52 33.91L45.79 34.10L46.06 34.30L46.33 34.50L46.60 34.71L46.88 34.93L47.15 35.15L47.42 35.38L47.69 35.62L47.96 35.87L48.23 36.12L48.50 36.39L48.77 36.66L49.04 36.94L49.31 37.24L49.58 37.54L49.85 37.86L50.12 38.19L50.40 38.53L50.67 38.89L50.94 39.26L51.21 39.65L51.48 40.06L51.75 40.49L52.02 40.95L52.29 41.42L52.56 41.93L52.83 42.48L53.10 43.07L53.38 43.70L53.65 44.40L53.92 45.18L54.19 46.08L54.46 47.15L54.73 48.56L55.00 52.00L55 88Z"/></g><path fill="#0F1A17" d="M30.615234375 0.0C52.880859375 0.0 66.2109375 -13.96484375 66.2109375 -36.474609375C66.2109375 -58.837890625 52.783203125 -72.75390625 31.15234375 -72.75390625H6.0546875V0.0ZM18.9453125 -11.03515625V-61.71875H30.322265625C45.654296875 -61.71875 53.173828125 -52.490234375 53.173828125 -36.474609375C53.173828125 -20.3125 45.751953125 -11.03515625 29.931640625 -11.03515625Z M92.3546875 1.025390625C99.48359375 1.025390625 104.708203125 -2.099609375 108.223828125 -7.91015625V0.0H120.333203125V-51.5625H107.9796875V-22.412109375C107.9796875 -13.623046875 103.19453125 -9.765625 96.700390625 -9.765625C90.10859375 -9.765625 86.3 -13.720703125 86.3 -21.2890625V-51.5625H73.9953125V-19.3359375C73.9953125 -6.103515625 81.563671875 1.025390625 92.3546875 1.025390625Z M130.070703125 20.41015625H142.375390625V-7.763671875H142.521875C145.74453125 -1.904296875 151.164453125 1.025390625 157.902734375 1.025390625C171.379296875 1.025390625 180.2171875 -9.765625 180.2171875 -25.830078125C180.2171875 -41.69921875 171.2328125 -52.587890625 157.9515625 -52.587890625C151.262109375 -52.587890625 145.54921875 -49.853515625 142.3265625 -44.384765625H142.180078125V-51.5625H130.070703125ZM155.021875 -9.27734375C146.965234375 -9.27734375 141.691796875 -15.771484375 141.691796875 -25.830078125C141.691796875 -35.83984375 146.965234375 -42.3828125 155.021875 -42.3828125C162.6390625 -42.3828125 167.766015625 -36.474609375 167.766015625 -25.830078125C167.766015625 -15.13671875 162.6390625 -9.27734375 155.021875 -9.27734375Z M199.86679687499998 -72.75390625H187.56210937499998V0.0H199.86679687499998Z M209.604296875 0.0H221.908984375V-51.5625H209.604296875ZM215.756640625 -59.228515625C219.955859375 -59.228515625 223.1296875 -62.255859375 223.1296875 -66.259765625C223.1296875 -70.21484375 219.955859375 -73.2421875 215.756640625 -73.2421875C211.557421875 -73.2421875 208.38359375 -70.21484375 208.38359375 -66.259765625C208.38359375 -62.255859375 211.557421875 -59.228515625 215.756640625 -59.228515625Z"/><g transform="translate(226.18 0)"><path fill="#0B6E4F" d="M37.79296875 1.171875C54.19921875 1.171875 66.69921875 -8.984375 69.140625 -24.853515625H56.0546875C54.00390625 -15.625 47.16796875 -10.400390625 37.890625 -10.400390625C24.51171875 -10.400390625 16.50390625 -20.703125 16.50390625 -36.328125C16.50390625 -52.05078125 24.560546875 -62.353515625 37.890625 -62.353515625C47.216796875 -62.353515625 54.052734375 -57.080078125 56.005859375 -47.802734375H69.140625C66.69921875 -63.720703125 54.19921875 -73.92578125 37.79296875 -73.92578125C17.724609375 -73.92578125 3.515625 -59.1796875 3.515625 -36.328125C3.515625 -13.623046875 17.724609375 1.171875 37.79296875 1.171875Z M92.45234375 0.830078125C100.85078125 0.830078125 105.196484375 -2.685546875 107.637890625 -7.275390625H107.833203125V0.0H119.942578125V-35.15625C119.942578125 -45.8984375 111.98359375 -52.587890625 98.555859375 -52.587890625C85.079296875 -52.587890625 76.680859375 -45.80078125 76.094921875 -35.546875H87.96015625C88.301953125 -39.892578125 92.305859375 -43.017578125 98.31171875 -43.017578125C104.219921875 -43.017578125 107.735546875 -39.892578125 107.735546875 -35.498046875V-35.107421875C107.735546875 -31.591796875 104.4640625 -31.4453125 94.89375 -30.37109375C84.24921875 -29.248046875 74.630078125 -26.3671875 74.630078125 -14.6484375C74.630078125 -4.345703125 82.1984375 0.830078125 92.45234375 0.830078125ZM95.4796875 -8.30078125C90.10859375 -8.30078125 86.641796875 -10.693359375 86.641796875 -14.74609375C86.641796875 -19.43359375 91.133984375 -21.337890625 96.407421875 -22.119140625C101.485546875 -22.900390625 106.270703125 -23.681640625 107.784375 -24.658203125V-19.091796875C107.784375 -13.0859375 103.536328125 -8.30078125 95.4796875 -8.30078125Z M149.84609375 1.220703125C162.590234375 1.220703125 171.72109375 -5.126953125 171.72109375 -15.185546875C171.72109375 -22.75390625 166.984765625 -27.24609375 156.7796875 -29.39453125L147.50234375 -31.298828125C143.20546875 -32.2265625 140.66640625 -34.130859375 140.66640625 -37.20703125C140.66640625 -40.72265625 143.98671875 -43.45703125 149.406640625 -43.45703125C155.021875 -43.45703125 158.781640625 -40.087890625 158.879296875 -35.498046875H170.4515625C170.15859375 -46.09375 161.613671875 -52.685546875 149.113671875 -52.685546875C136.516015625 -52.685546875 128.36171875 -46.2890625 128.36171875 -36.81640625C128.36171875 -29.00390625 133.5375 -23.974609375 143.40078125 -21.923828125L152.18984375 -20.1171875C156.535546875 -19.189453125 159.22109375 -17.3828125 159.22109375 -14.2578125C159.22109375 -10.595703125 155.6078125 -8.0078125 149.65078125 -8.0078125C143.4984375 -8.0078125 139.88515625 -10.888671875 139.348046875 -15.91796875H127.18984375C127.97109375 -4.833984375 137.297265625 1.220703125 149.84609375 1.220703125Z M194.64218749999998 0.830078125C203.04062499999998 0.830078125 207.38632812499998 -2.685546875 209.82773437499998 -7.275390625H210.02304687499998V0.0H222.13242187499998V-35.15625C222.13242187499998 -45.8984375 214.17343749999998 -52.587890625 200.74570312499998 -52.587890625C187.26914062499998 -52.587890625 178.87070312499998 -45.80078125 178.28476562499998 -35.546875H190.14999999999998C190.49179687499998 -39.892578125 194.49570312499998 -43.017578125 200.50156249999998 -43.017578125C206.40976562499998 -43.017578125 209.92539062499998 -39.892578125 209.92539062499998 -35.498046875V-35.107421875C209.92539062499998 -31.591796875 206.65390624999998 -31.4453125 197.08359374999998 -30.37109375C186.43906249999998 -29.248046875 176.81992187499998 -26.3671875 176.81992187499998 -14.6484375C176.81992187499998 -4.345703125 184.38828124999998 0.830078125 194.64218749999998 0.830078125ZM197.66953124999998 -8.30078125C192.29843749999998 -8.30078125 188.83164062499998 -10.693359375 188.83164062499998 -14.74609375C188.83164062499998 -19.43359375 193.32382812499998 -21.337890625 198.59726562499998 -22.119140625C203.67539062499998 -22.900390625 208.46054687499998 -23.681640625 209.97421874999998 -24.658203125V-19.091796875C209.97421874999998 -13.0859375 205.72617187499998 -8.30078125 197.66953124999998 -8.30078125Z"/></g>' + '</svg>'
e = html.escape


def slug(t):
    t = unicodedata.normalize('NFD', t or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


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


def mediana(v):
    v = sorted(v)
    return v[len(v) // 2] if v else None


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


def pagina(caminho, titulo, descricao, h1, intro, migalhas, cartoes, links, ver_todas, atualizado, extra=''):
    url = SITE + caminho
    bc = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': n + 1, 'name': nome, 'item': SITE + c} for n, (nome, c) in enumerate(migalhas)]}
    il = {'@context': 'https://schema.org', '@type': 'ItemList', 'name': h1, 'numberOfItems': len(cartoes),
          'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'url': SITE + '/#casa-' + str(id_num(a['id']))}
                              for n, a in enumerate(cartoes)]}
    nav = ' <span>›</span> '.join(f'<a href="{c}">{e(n)}</a>' if k < len(migalhas) - 1 else f'<span aria-current="page">{e(n)}</span>'
                                  for k, (n, c) in enumerate(migalhas))
    return f'''<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title><meta name="description" content="{e(descricao)}"><link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Duplicasa"><meta property="og:locale" content="pt_PT">
<meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(descricao)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/marca/duaschaves-og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/marca/duaschaves-simbolo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/marca/duaschaves-icone-180.png">
<script type="application/ld+json">{json.dumps(bc, ensure_ascii=False)}</script>
<script type="application/ld+json">{json.dumps(il, ensure_ascii=False)}</script>
<style>
:root{{--f:#F3F5F4;--t:#0F1A17;--t2:#3E4A46;--t3:#55625E;--b:#DDE3E0;--v:#0B6E4F}}
*{{box-sizing:border-box}}body{{margin:0;font-family:'Schibsted Grotesk',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--f);color:var(--t);font-size:16px;line-height:1.5}}
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
footer{{margin-top:56px;border-top:1px solid var(--b);padding:28px 0 40px;font-size:14px;color:var(--t3)}}
@media(min-width:900px){{h1{{font-size:46px}}}}
</style></head><body>
<header><div class="w"><a class="logo" href="/">{LOGO}</a><a class="bt" href="{ver_todas}">Ver casas</a></div></header>
<main class="w">
<nav class="mig" aria-label="Estás aqui">{nav}</nav>
<h1>{e(h1)}</h1>
<p class="intro">{intro}</p>
<p><a class="bt" href="{ver_todas}">Pesquisar com filtros e alertas</a></p>
<div class="g">{"".join(cartao(a) for a in cartoes)}</div>
{links}
<section class="cx"><h2 style="margin-top:0">Arrendar sem cair numa burla</h2>
<ul><li>Visita a casa antes de pagar qualquer valor.</li><li>Desconfia de rendas muito abaixo das outras na zona.</li>
<li>Confirma que quem anuncia é mesmo o dono.</li><li>Em breve, com o pagamento seguro da Duplicasa, a entrada só vai chegar ao senhorio quando receberes as chaves.</li></ul></section>
{extra}
</main>
<footer><div class="w">Duplicasa · casas para arrendar em Portugal, sem burlas. Anúncios atualizados a {atualizado}. <a href="/arrendar/">Todas as cidades</a> · <a href="/">Início</a></div></footer>
</body></html>
'''


def data_pt(iso):
    try:
        d = datetime.datetime.strptime(iso[:10], '%Y-%m-%d')
        return f'{d.day} de {MESES[d.month - 1]} de {d.year}'
    except Exception:
        return 'hoje'


def gerar(anuncios, atualizado):
    hoje = data_pt(atualizado)
    por_cidade = {}
    for a in anuncios:
        c = (a.get('cidade') or '').strip()
        if c:
            por_cidade.setdefault(c, []).append(a)
    cidades = sorted([(c, l) for c, l in por_cidade.items() if len(l) >= MIN_CIDADE], key=lambda x: -len(x[1]))
    paginas = {}
    for cidade, lista in cidades:
        s = slug(cidade)
        boas = sorted([a for a in lista if plausivel(a) and a.get('fotos')], key=lambda a: a['renda'])
        meds = {t: mediana([a['renda'] for a in lista if plausivel(a) and tip(a) == t]) for _, _, t in TIPOS}
        tipos_pag = [(ts, tn, tt) for ts, tn, tt in TIPOS if sum(1 for a in lista if tip(a) == tt) >= MIN_TIPO]
        frases = [f'Há {num(len(lista))} casas e quartos para arrendar {e(em(cidade))} na Duplicasa, juntos de vários sites e atualizados a {hoje}.']
        if meds.get('T1'):
            frases.append(f'Um T1 pede, a meio da tabela, {num(meds["T1"])} € por mês.')
        if meds.get('Quarto'):
            frases.append(f'Um quarto anda pelos {num(meds["Quarto"])} €.')
        if boas:
            frases.append(f'A renda mais baixa agora é de {num(boas[0]["renda"])} €.')
        links = ('<h2>Por tipologia</h2><ul class="ch">' + ''.join(
            f'<li><a href="/arrendar/{s}/{ts}/">{e(tn)} {e(em(cidade))}</a></li>' for ts, tn, tt in tipos_pag) + '</ul>') if tipos_pag else ''
        vizinhas = [c for c, _ in cidades if c != cidade and (por_cidade[c][0].get('distrito') == lista[0].get('distrito'))][:12]
        if vizinhas:
            links += '<h2>Perto de ' + e(cidade) + '</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/{slug(c)}/">{e(c)}</a></li>' for c in vizinhas) + '</ul>'
        desde = f' desde {num(boas[0]["renda"])} €' if boas else ''
        paginas[f'/arrendar/{s}/'] = pagina(
            f'/arrendar/{s}/', f'Casas para arrendar {em(cidade)}{desde} | Duplicasa',
            f'{num(len(lista))} casas e quartos para arrendar {em(cidade)}, dos mais baratos para os mais caros. Alertas de casas novas no minuto em que aparecem.',
            f'Casas para arrendar {em(cidade)}', ' '.join(frases),
            [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/')],
            boas[:MAX_CARTOES], links, '/#pesquisa?cidade=' + quote(cidade), hoje)
        for ts, tn, tt in tipos_pag:
            sub = sorted([a for a in lista if tip(a) == tt and plausivel(a) and a.get('fotos')], key=lambda a: a['renda'])
            if not sub:
                continue
            nome = 'Quartos' if tt == 'Quarto' else tn
            md = meds.get(tt)
            intro = (f'{num(sum(1 for a in lista if tip(a) == tt))} {"quartos" if tt == "Quarto" else tn} para arrendar {e(em(cidade))}, '
                     f'do mais barato para o mais caro. Desde {num(sub[0]["renda"])} €' + (f', a meio da tabela {num(md)} €' if md else '') +
                     f' por mês. Atualizado a {hoje}.')
            outros = '<h2>Outras tipologias ' + e(em(cidade)) + '</h2><ul class="ch">' + ''.join(
                f'<li><a href="/arrendar/{s}/{x}/">{e(n)}</a></li>' for x, n, _ in tipos_pag if x != ts) + f'<li><a href="/arrendar/{s}/">Todas</a></li></ul>'
            paginas[f'/arrendar/{s}/{ts}/'] = pagina(
                f'/arrendar/{s}/{ts}/', f'{nome} para arrendar {em(cidade)} desde {num(sub[0]["renda"])} € | Duplicasa',
                f'{nome} para arrendar {em(cidade)}, dos mais baratos para os mais caros, desde {num(sub[0]["renda"])} € por mês. Alertas de casas novas no minuto em que aparecem.',
                f'{nome} para arrendar {em(cidade)}', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, f'/arrendar/{s}/'), (nome, f'/arrendar/{s}/{ts}/')],
                sub[:MAX_CARTOES], outros, '/#pesquisa?cidade=' + quote(cidade) + '&amp;tips=' + quote('Quarto' if tt == 'Quarto' else tt), hoje)
    # índice de cidades, agrupado por distrito
    por_distrito = {}
    for c, l in cidades:
        por_distrito.setdefault(l[0].get('distrito') or 'Outros', []).append((c, len(l)))
    blocos = ''.join('<h2>' + e(d) + '</h2><ul class="ch">' + ''.join(
        f'<li><a href="/arrendar/{slug(c)}/">{e(c)} ({n})</a></li>' for c, n in sorted(cs)) + '</ul>' for d, cs in sorted(por_distrito.items()))
    baratas = sorted([a for a in anuncios if plausivel(a) and a.get('fotos') and tip(a) in ('T0', 'T1', 'Quarto')], key=lambda a: a['renda'])[:12]
    paginas['/arrendar/'] = pagina(
        '/arrendar/', 'Casas para arrendar em Portugal, por cidade | Duplicasa',
        f'{num(len(anuncios))} casas e quartos para arrendar em {len(cidades)} cidades de Portugal, juntos num só lugar. Alertas de casas novas no minuto em que aparecem.',
        'Casas para arrendar em Portugal',
        f'{num(len(anuncios))} casas e quartos para arrendar, de vários sites, num só lugar. Escolhe a cidade. Atualizado a {hoje}.',
        [('Início', '/'), ('Arrendar', '/arrendar/')], baratas, blocos, '/#pesquisa', hoje)
    return paginas


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
    paginas = gerar(anuncios, atualizado)
    pai = os.path.dirname(os.path.abspath(destino))
    os.makedirs(pai, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='.seo-', dir=pai)
    for caminho, conteudo in paginas.items():
        p = os.path.join(tmp, caminho.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(conteudo)
    lastmod = (atualizado or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))[:10]
    urls = [SITE + '/'] + [SITE + c for c in sorted(paginas)]
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


if __name__ == '__main__':
    main()
