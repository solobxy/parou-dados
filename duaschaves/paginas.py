#!/usr/bin/env python3
"""Duas Chaves: páginas para o Google (SEO), feitas a partir dos anúncios recolhidos.

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

SITE = 'https://duaschaves.pt'
MIN_CIDADE, MIN_TIPO, MAX_CARTOES = 5, 3, 30
TIPOS = [('quartos', 'Quartos', 'quartos'), ('t0', 'T0', 'T0'), ('t1', 'T1', 'T1'), ('t2', 'T2', 'T2'), ('t3-ou-mais', 'T3 ou mais', 'T3+')]
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
SIMBOLO = 'M5 8.4Q5 7 6.4 7H26A17 17 0 0 1 26 41L24.19 25.69A5.4 5.4 0 1 0 20.59 25.69L18.77 41H6.4Q5 41 5 39.6Z'
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
    i = re.sub(r'\D', '', str(a['id']))
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
          'itemListElement': [{'@type': 'ListItem', 'position': n + 1, 'url': SITE + '/#casa-' + re.sub(r'\D', '', str(a['id']))}
                              for n, a in enumerate(cartoes)]}
    nav = ' <span>›</span> '.join(f'<a href="{c}">{e(n)}</a>' if k < len(migalhas) - 1 else f'<span aria-current="page">{e(n)}</span>'
                                  for k, (n, c) in enumerate(migalhas))
    return f'''<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title><meta name="description" content="{e(descricao)}"><link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Duas Chaves"><meta property="og:locale" content="pt_PT">
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
<header><div class="w"><a class="logo" href="/"><svg viewBox="5 7 38 34" width="30" height="27" aria-hidden="true"><path fill="#0B6E4F" d="{SIMBOLO}"/></svg>Duas Chaves</a><a class="bt" href="{ver_todas}">Ver casas</a></div></header>
<main class="w">
<nav class="mig" aria-label="Estás aqui">{nav}</nav>
<h1>{e(h1)}</h1>
<p class="intro">{intro}</p>
<p><a class="bt" href="{ver_todas}">Pesquisar com filtros e alertas</a></p>
<div class="g">{"".join(cartao(a) for a in cartoes)}</div>
{links}
<section class="cx"><h2 style="margin-top:0">Arrendar sem cair numa burla</h2>
<ul><li>Visita a casa antes de pagar qualquer valor.</li><li>Desconfia de rendas muito abaixo das outras na zona.</li>
<li>Confirma que quem anuncia é mesmo o dono.</li><li>Com o pagamento seguro da Duas Chaves, a entrada só chega ao senhorio quando recebes as chaves.</li></ul></section>
{extra}
</main>
<footer><div class="w">Duas Chaves · casas para arrendar em Portugal, sem burlas. Anúncios atualizados a {atualizado}. <a href="/arrendar/">Todas as cidades</a> · <a href="/">Início</a></div></footer>
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
        frases = [f'Há {num(len(lista))} casas e quartos para arrendar {e(em(cidade))} na Duas Chaves, juntos de vários sites e atualizados a {hoje}.']
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
            f'/arrendar/{s}/', f'Casas para arrendar {em(cidade)}{desde} | Duas Chaves',
            f'{num(len(lista))} casas e quartos para arrendar {em(cidade)}, dos mais baratos para os mais caros. Alertas de casas novas e pagamento seguro contra burlas.',
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
                f'/arrendar/{s}/{ts}/', f'{nome} para arrendar {em(cidade)} desde {num(sub[0]["renda"])} € | Duas Chaves',
                f'{nome} para arrendar {em(cidade)}, dos mais baratos para os mais caros, desde {num(sub[0]["renda"])} € por mês. Alertas de casas novas e pagamento seguro.',
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
        '/arrendar/', 'Casas para arrendar em Portugal, por cidade | Duas Chaves',
        f'{num(len(anuncios))} casas e quartos para arrendar em {len(cidades)} cidades de Portugal, juntos num só lugar. Alertas de casas novas e pagamento seguro.',
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
