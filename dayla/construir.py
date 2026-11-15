#!/usr/bin/env python3
"""Constrói o site da Dayla: sites/dayla/index.html (português) e sites/dayla/en/index.html (inglês).

Uso: python3 dayla/construir.py
Lê dayla/modelo.html, dayla/textos.py e a lista inicial de serviços de dayla/agenda.py. Os preços e o resto
que a Dayla muda no painel chegam depois pelo /api/site; a página já leva os valores de origem, por isso
funciona mesmo sem a API. Gera também o logótipo em caminhos (logo.svg), o ícone e o sitemap.
"""
import html, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SITE = os.path.join(RAIZ, 'sites', 'dayla')
sys.path.insert(0, AQUI)
from textos import T, JS  # noqa: E402
import agenda  # noqa: E402

BASE = 'https://daylapiercing.pt'
IG = 'sendodaylabpiercing'


# ---------- logótipo: «dayla» em caminhos (Archivo 860, largura 118 %) com uma argola no rabo do y ----------
def logotipo():
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.boundsPen import BoundsPen
    f = TTFont(os.path.join(SITE, 'fonts', 'archivo.woff2'))
    f = instancer.instantiateVariableFont(f, {'wght': 860, 'wdth': 112})
    gs, cm = f.getGlyphSet(), f.getBestCmap()
    upm = f['head'].unitsPerEm
    x, partes, caixa_y = 0, [], None
    aperto = -14  # letras um pouco mais juntas do que o normal
    for ch in 'dayla':
        g = gs[cm[ord(ch)]]
        pen = SVGPathPen(gs, ntos=lambda v: '%d' % round(v))
        g.draw(pen)
        partes.append('<path transform="translate(%d 0)" d="%s"/>' % (x, pen.getCommands()))
        if ch == 'y':
            bp = BoundsPen(gs)
            g.draw(bp)
            caixa_y = (x, bp.bounds)
        x += g.width + aperto
    asc, desc = 760, -230
    # argola: círculo a atravessar o fundo do rabo do y
    xy, (x0, y0, x1, y1) = caixa_y
    cx, cy, r = xy + x0 + 100, y0 - 70, 150
    largura = x - aperto
    fundo = -(cy - r - 30)
    vb = '0 %d %d %d' % (-asc, largura + 20, asc + fundo)
    corpo = ''.join(partes)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" role="img" aria-label="Dayla">'
           '<circle class="aro-f" cx="%d" cy="%d" r="%d" fill="none" stroke="#101010" stroke-width="80"/>'
           '<circle class="aro" cx="%d" cy="%d" r="%d" fill="none" stroke="#F2B5CB" stroke-width="48"/>'
           '<g transform="scale(1 -1)" fill="#101010">%s</g></svg>') % (vb, cx, -cy, r, cx, -cy, r, corpo)
    return svg, (cx, -cy, r)


def icone_svg():
    """Ícone: «d» largo em papel sobre tinta, com a argola rosa, e uma casa de xadrez no canto."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.boundsPen import BoundsPen
    f = instancer.instantiateVariableFont(TTFont(os.path.join(SITE, 'fonts', 'archivo.woff2')), {'wght': 900, 'wdth': 112})
    gs, cm = f.getGlyphSet(), f.getBestCmap()
    g = gs[cm[ord('d')]]
    pen = SVGPathPen(gs, ntos=lambda v: '%d' % round(v))
    g.draw(pen)
    bp = BoundsPen(gs)
    g.draw(bp)
    x0, y0, x1, y1 = bp.bounds
    k = 40 / (y1 - y0)  # a letra ocupa 40 de 64
    tx, ty = 32 - (x0 + x1) / 2 * k - 2, 52
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#101010"/>'
            '<rect x="48" y="0" width="16" height="16" fill="#F5F5F3"/>'
            '<path transform="translate(%.1f %.1f) scale(%.4f -%.4f)" fill="#F5F5F3" d="%s"/>'
            '<circle cx="%.1f" cy="54" r="6.5" fill="none" stroke="#F7B8D2" stroke-width="3.6"/></svg>') % (
        tx, ty, k, k, pen.getCommands(), tx + (x0 + 120) * k)


SVG = {
    'svg_mais': '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    'svg_v': '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4.5 11.5l4.2 4.2L17.5 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'svg_x': '<svg viewBox="0 0 22 22" aria-hidden="true" style="color:#F2B5CB"><path d="M5 5l12 12M17 5L5 17" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
    'seta_esq_svg': '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M18 11H5M10 5l-6 6 6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'svg_x_fino': '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    'svg_alerta': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="currentColor"/><path d="M12 10v5M12 17.5v.5" stroke="#0A0A0A" stroke-width="2.2" stroke-linecap="round"/></svg>',
    'svg_estrela': '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.8l-5.1 2.7 1.1-5.7-4.2-4 5.7-.7z" fill="currentColor"/></svg>',
    'wa_svg': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3z"/></svg>',
    'ig_svg': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.3" fill="currentColor"/></svg>',
    'seta_svg': '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13M12 5l6 6-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}



LISTA_FOTOS = os.path.join(AQUI, 'fotos-iniciais', 'lista.json')


def fotos_iniciais():
    with open(LISTA_FOTOS, encoding='utf-8') as f:
        return json.load(f)


def galeria_html(lang):
    out = []
    for n, x in enumerate(fotos_iniciais()[:9]):
        lg = x['legenda_en'] if lang == 'en' and x.get('legenda_en') else x['legenda']
        out.append('<figure><button type="button" data-n="%d" aria-label="%s"><img src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async"></button>'
                   '<figcaption>%s</figcaption></figure>' % (n, html.escape(lg), x['estatico'], html.escape(lg), x['w'], x['h'], html.escape(lg)))
    return ''.join(out)


# Projetos reais da Dayla com os pontos de cada piercing (em % da foto, que é mostrada inteira, 2:3)
# 'anel': círculo oco à volta da joia; 'ponto': ponto rosa ao lado de um grupo (sem tapar as joias) com a etiqueta
PROJETOS = [
    {'img': '/img/t-flat-4-lobulos.webp', 'nome': 'proj_ex1', 'servicos': ['flat', 'lobulo'],
     'pinos': [('anel', 47.1, 40.5, 'p_flat'), ('ponto', 46.0, 61.4, 'p_lobulo4')]},
    {'img': '/img/t-flat-lobulos.webp', 'nome': 'proj_ex2', 'servicos': ['flat', 'lobulo'],
     'pinos': [('anel', 59.6, 37.5, 'p_flat'), ('ponto', 48.6, 56.6, 'p_lobulo2')]},
]


def quadro_proj(lang):
    imgs, pins = [], []
    for n, p in enumerate(PROJETOS):
        alt = T[p['nome']][lang]
        imgs.append('<img src="%s" alt="%s" width="900" height="1351" loading="lazy" decoding="async"%s%s>' % (
            p['img'], html.escape(alt), ' class="fora"' if n else '', ' aria-hidden="true"' if n else ''))
        h = '<div class="pinos%s" aria-hidden="true">' % (' fora' if n else '')
        for k, (tipo, x, y, rot) in enumerate(p['pinos']):
            h += '<span class="%s" style="left:%.1f%%;top:%.1f%%;--k:%d"></span>' % ('pino' if tipo == 'anel' else 'ponto', x, y, k)
            if rot:
                h += '<span class="etq-p%s" style="left:%.1f%%;top:%.1f%%">%s</span>' % (' longe' if tipo == 'anel' else '', x, y, html.escape(T[rot][lang]))
        h += '</div>'
        pins.append(h)
    return ''.join(imgs) + ''.join(pins)


def proj_js(lang):
    return json.dumps([{'nome': T[p['nome']][lang], 'servicos': p['servicos']} for p in PROJETOS], ensure_ascii=False)


def faixa():
    # 2 linhas de 48 casas; no telemóvel só se veem 24 por linha (as cores vêm do CSS)
    out = []
    for k in range(96):
        out.append('<i style="--d:%d"%s></i>' % (k % 24, ' class="r"' if k == 37 else ''))
    return ''.join(out)


def tira(cols, rows, rosa):
    out = []
    for r in range(rows):
        for c in range(cols):
            k = r * cols + c
            cls = 'r' if k == rosa else ('b' if (r + c) % 2 == 0 else '')
            out.append('<i%s></i>' % (' class="%s"' % cls if cls else ''))
    return ''.join(out)


def h1_linhas(lang):
    a, b = {'pt': ('Piercing no Porto,', 'sem dúvidas.'), 'en': ('Piercing in Porto,', 'no guesswork.')}[lang]
    return '<span class="l"><span>%s</span></span><span class="l"><span>%s</span></span>' % (html.escape(a), html.escape(b))


def xadrez(cols, rows, rosa=None, par=False):
    out = []
    for r in range(rows):
        for c in range(cols):
            n = r * cols + c
            # nas linhas pares a ordem inverte-se para dar o xadrez numa grelha de colunas pares
            cls = ''
            if (r + c) % 2 == (0 if not par else 1):
                cls = 't'
            if rosa is not None and n == rosa:
                cls = 'rosa'
            out.append('<i style="--d:%d"%s></i>' % (r + c, ' class="%s"' % cls if cls else ''))
    return ''.join(out)


def precos_html(lang):
    cats = [('orelha', T['cat_orelha'][lang]), ('rosto', T['cat_rosto'][lang]), ('corpo', T['cat_corpo'][lang]), ('servicos', T['cat_servicos'][lang])]
    servs = agenda.servicos_padrao()
    col = {1: '', 2: ''}
    for cid, nome in cats:
        l = [s for s in servs if s['cat'] == cid]
        h = '<div class="grupo" id="cat-%s"><h3>%s<small>%d</small></h3><ul class="lista">' % (cid, html.escape(nome), len(l))
        for s in l:
            cic = s['cic_' + lang]
            h += ('<li><span class="nome">%s%s</span><span class="preco vazio">%s</span>'
                  '<button type="button" class="mais" data-id="%s" aria-pressed="false" aria-label="%s: %s"><span class="m">%s</span><span class="v">%s</span></button></li>') % (
                html.escape(s[lang]), ('<small>%s %s</small>' % (T['cicatriza'][lang], html.escape(cic))) if cic else '',
                html.escape(JS[lang]['a_confirmar']), s['id'], html.escape(JS[lang]['adicionar']), html.escape(s[lang]), SVG['svg_mais'], SVG['svg_v'])
        h += '</ul></div>'
        col[1 if cid in ('orelha', 'servicos') else 2] += h
    return '<div>%s</div><div>%s</div>' % (col[1], col[2])


def cic_html(lang):
    return ''.join('<div><span>%s</span><span>%s</span></div>' % (html.escape(s[lang]), html.escape(s['cic_' + lang]))
                   for s in agenda.servicos_padrao() if s['cic_' + lang])


def dados_iniciais():
    servs = [{k: s[k] for k in ('id', 'cat', 'pt', 'en', 'preco', 'desde', 'cic_pt', 'cic_en')} for s in agenda.servicos_padrao()]
    gal = [{'src': x['estatico'], 'legenda': x['legenda'], 'legenda_en': x['legenda_en'], 'alt': x['alt'], 'w': x['w'], 'h': x['h']} for x in fotos_iniciais()]
    return {'servicos': servs, 'nota': agenda.NOTA_PADRAO, 'dias': [], 'fotos': {'perfil': None, 'galeria': gal}, 'joias': [],
            'contactos': agenda.CONTACTOS_PADRAO, 'avaliacoes': {'n': 0, 'media': None, 'lista': []}}


def jsonld(lang):
    d = {'@context': 'https://schema.org', '@type': 'HealthAndBeautyBusiness', 'name': 'Dayla Araújo Body Piercing',
         'description': T['descricao'][lang], 'url': BASE + ('/' if lang == 'pt' else '/en/'), 'image': BASE + '/partilha/site-%s.jpg' % lang,
         'telephone': '+351930514346', 'areaServed': {'@type': 'City', 'name': 'Porto'},
         'address': {'@type': 'PostalAddress', 'addressLocality': 'Porto', 'addressCountry': 'PT'},
         'availableLanguage': ['pt', 'en'], 'sameAs': ['https://www.instagram.com/%s/' % IG],
         'founder': {'@type': 'Person', 'name': 'Dayla Araújo', 'jobTitle': 'Body piercer'}}
    return json.dumps(d, ensure_ascii=False).replace('</', '<\\/')


def js_str(s):
    """Para pôr dentro de '...' num script."""
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '')


def construir(lang, logo):
    with open(os.path.join(AQUI, 'modelo.html'), encoding='utf-8') as f:
        m = f.read()
    js = dict(JS[lang])
    js['t'] = {k: v[lang] for k, v in T.items() if not k.endswith('_h')}
    especiais = {
        'url': BASE + ('/' if lang == 'pt' else '/en/'), 'url_pt': BASE + '/', 'url_en': BASE + '/en/', 'base': BASE,
        'url_rel': '/' if lang == 'pt' else '/en/', 'url_outra_rel': '/en/' if lang == 'pt' else '/',
        'outra_hreflang': 'en' if lang == 'pt' else 'pt-PT', 'og_locale': 'pt_PT' if lang == 'pt' else 'en_GB', 'og_locale_alt': 'en_GB' if lang == 'pt' else 'pt_PT',
        'og_img': BASE + '/partilha/site-%s.jpg' % lang, 'lang': lang,
        'logo': logo, 'jsonld': jsonld(lang), 'h1_linhas': h1_linhas(lang),
        'facto2': html.escape({'pt': 'por marcação', 'en': 'by appointment'}[lang]), 'facto3': html.escape({'pt': 'PT / EN', 'en': 'EN / PT'}[lang]),
        'tira_v': tira(2, 14, 9), 'tira_s': tira(2, 6, 7), 'faixa': faixa(), 'xadrez_m': tira(24, 2, -1), 'xadrez_d': tira(2, 6, -1),
        'galeria_html': galeria_html(lang), 'quadro_proj': quadro_proj(lang), 'proj_js': proj_js(lang),
        'proj_b1': {'pt': 'Projeto 1', 'en': 'Project 1'}[lang], 'proj_b2': {'pt': 'Projeto 2', 'en': 'Project 2'}[lang],
        'precos_html': precos_html(lang), 'cic_html': cic_html(lang), 'nota': html.escape(agenda.NOTA_PADRAO[lang]),
        'js': json.dumps(js, ensure_ascii=False).replace('</', '<\\/'),
        'dados': json.dumps(dados_iniciais(), ensure_ascii=False).replace('</', '<\\/'),
    }
    for k, v in SVG.items():
        especiais[k] = v
        especiais[k + '_js'] = js_str(v)

    def troca(mo):
        k = mo.group(1)
        if k.startswith('@'):
            return especiais[k[1:]]
        if k not in T:
            raise KeyError('texto em falta: ' + k)
        v = T[k][lang]
        return v if k.endswith('_h') else html.escape(v, quote=True)
    out = re.sub(r'\{\{(@?[a-z0-9_]+)\}\}', troca, m)
    # no script, os textos vêm do L.t (já escapados para JSON); trocar os que ficaram entre plicas
    return out


def main():
    logo, _ = logotipo()
    with open(os.path.join(SITE, 'logo.svg'), 'w', encoding='utf-8') as f:
        f.write(logo)
    with open(os.path.join(SITE, 'logo-branco.svg'), 'w', encoding='utf-8') as f:
        f.write(logo.replace('<g transform="scale(1 -1)" fill="#101010">', '<g transform="scale(1 -1)" fill="#F4F3F0">').replace('stroke="#101010" stroke-width="80"', 'stroke="#0A0A0A" stroke-width="80"'))
    logo_inline = logo.replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg ').replace('role="img" aria-label="Dayla"', 'aria-hidden="true" focusable="false"').replace('<g transform="scale(1 -1)" fill="#101010">', '<g transform="scale(1 -1)" fill="currentColor">').replace('stroke="#101010" stroke-width="80"', 'stroke="#0A0A0A" stroke-width="80"')
    with open(os.path.join(SITE, 'icon.svg'), 'w', encoding='utf-8') as f:
        f.write(icone_svg())
    for lang, caminho in (('pt', 'index.html'), ('en', os.path.join('en', 'index.html'))):
        os.makedirs(os.path.dirname(os.path.join(SITE, caminho)), exist_ok=True)
        with open(os.path.join(SITE, caminho), 'w', encoding='utf-8') as f:
            f.write(construir(lang, logo_inline))
    with open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n')
        for u in ('/', '/en/'):
            f.write('<url><loc>%s%s</loc><xhtml:link rel="alternate" hreflang="pt-PT" href="%s/"/><xhtml:link rel="alternate" hreflang="en" href="%s/en/"/></url>\n' % (BASE, u, BASE, BASE))
        f.write('</urlset>\n')
    print('construído: sites/dayla/index.html e sites/dayla/en/index.html')


if __name__ == '__main__':
    main()
