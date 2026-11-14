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
    cx, cy, r = xy + x0 + 96, y0 - 62, 138
    largura = x - aperto
    fundo = -(cy - r - 30)
    vb = '0 %d %d %d' % (-asc, largura + 20, asc + fundo)
    corpo = ''.join(partes)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" role="img" aria-label="Dayla">'
           '<circle class="aro-f" cx="%d" cy="%d" r="%d" fill="none" stroke="#101010" stroke-width="66"/>'
           '<circle class="aro" cx="%d" cy="%d" r="%d" fill="none" stroke="#F7B8D2" stroke-width="36"/>'
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
    'svg_mais': '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="square"/></svg>',
    'svg_v': '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11.5l4.5 4.5L18 6.5" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="square"/></svg>',
    'svg_x': '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M5 5l12 12M17 5L5 17" stroke="#B02A66" stroke-width="2.8" fill="none" stroke-linecap="square"/></svg>',
    'svg_x_fino': '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="square"/></svg>',
    'svg_alerta': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="currentColor"/><path d="M12 10v5M12 17.5v.5" stroke="#101010" stroke-width="2.4" stroke-linecap="square"/></svg>',
    'svg_estrela': '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.8l-5.1 2.7 1.1-5.7-4.2-4 5.7-.7z" fill="#101010"/></svg>',
    'wa_svg': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3z"/></svg>',
    'ig_svg': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.3" fill="currentColor"/></svg>',
    'seta_svg': '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M4 11h13M12 5l6 6-6 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="square"/></svg>',
}


def orelha(lang):
    """Desenho de uma orelha com um projeto de exemplo (5 pontos). Linhas da tinta, pontos rosa."""
    nomes = {'pt': ('Hélix', 'Flat', 'Conch', 'Lóbulo ×2'), 'en': ('Helix', 'Flat', 'Conch', 'Lobe ×2')}[lang]
    desc = html.escape(T['proj_svg_desc'][lang])
    return f'''<svg viewBox="0 0 420 470" role="img" aria-labelledby="orelha-t"><title id="orelha-t">{desc}</title>
<g transform="translate(30 14)"><path d="M188 28c-72 0-122 52-122 124 0 46 18 76 40 104 18 23 26 42 26 70 0 44 26 84 70 84 40 0 62-30 62-62 0-26-14-40-14-62 0-18 12-32 26-52 22-32 38-62 38-104 0-62-52-102-126-102z" fill="none" stroke="#101010" stroke-width="7" stroke-linejoin="round"/>
<path d="M120 150c0-48 34-82 78-82 46 0 80 30 80 72 0 30-14 50-30 70" fill="none" stroke="#101010" stroke-width="6" stroke-linecap="round"/>
<path d="M158 168c6-30 26-48 52-48 26 0 42 18 42 40 0 28-24 42-24 72 0 16 6 26 6 40" fill="none" stroke="#101010" stroke-width="6" stroke-linecap="round"/>
<path d="M168 226c14 20 34 26 50 22" fill="none" stroke="#101010" stroke-width="6" stroke-linecap="round"/>
<path d="M232 300c-10-10-26-12-38-6" fill="none" stroke="#101010" stroke-width="6" stroke-linecap="round"/>
<circle class="ponto" cx="96" cy="110" r="11"/><circle class="ponto" cx="182" cy="96" r="11"/><circle class="ponto" cx="206" cy="196" r="11"/>
<circle class="ponto" cx="196" cy="372" r="11"/><circle class="ponto" cx="232" cy="360" r="11"/>
<path d="M84 98L52 66" stroke="#101010" stroke-width="2.5"/><text x="12" y="56">{nomes[0]}</text>
<path d="M190 84l22-34" stroke="#101010" stroke-width="2.5"/><text x="206" y="40">{nomes[1]}</text>
<path d="M218 200l64 10" stroke="#101010" stroke-width="2.5"/><text x="288" y="216">{nomes[2]}</text>
<path d="M244 366l36 18" stroke="#101010" stroke-width="2.5"/><text x="246" y="408">{nomes[3]}</text>
</g></svg>'''


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
        h = '<div class="grupo"><h3>%s</h3><ul class="lista">' % html.escape(nome)
        for s in l:
            cic = s['cic_' + lang]
            h += ('<li><span class="nome">%s%s</span><span class="preco vazio">%s</span>'
                  '<button type="button" class="mais" data-id="%s" aria-pressed="false" aria-label="%s: %s"><span class="m">%s</span><span class="v">%s</span></button></li>') % (
                html.escape(s[lang]), ('<small>%s %s</small>' % (T['cicatriza'][lang], html.escape(cic))) if cic else '',
                html.escape(JS[lang]['a_confirmar']), s['id'], html.escape(JS[lang]['adicionar']), html.escape(s[lang]), SVG['svg_mais'], SVG['svg_v'])
        h += '</ul></div>'
        col[1 if cid == 'orelha' else 2] += h
    return '<div>%s</div><div>%s</div>' % (col[1], col[2])


def cic_html(lang):
    return ''.join('<div><span>%s</span><span>%s</span></div>' % (html.escape(s[lang]), html.escape(s['cic_' + lang]))
                   for s in agenda.servicos_padrao() if s['cic_' + lang])


def dados_iniciais():
    servs = [{k: s[k] for k in ('id', 'cat', 'pt', 'en', 'preco', 'desde', 'cic_pt', 'cic_en')} for s in agenda.servicos_padrao()]
    return {'servicos': servs, 'nota': agenda.NOTA_PADRAO, 'dias': [], 'fotos': {'perfil': None, 'galeria': []}, 'joias': [],
            'contactos': agenda.CONTACTOS_PADRAO, 'avaliacoes': {'n': 0, 'media': None, 'lista': []}}


def jsonld(lang):
    d = {'@context': 'https://schema.org', '@type': 'HealthAndBeautyBusiness', 'name': 'Dayla Araújo Body Piercing',
         'description': T['descricao'][lang], 'url': BASE + ('/' if lang == 'pt' else '/en/'), 'image': BASE + '/og.jpg',
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
        'outra_hreflang': 'en' if lang == 'pt' else 'pt-PT', 'og_locale': 'pt_PT' if lang == 'pt' else 'en_GB', 'lang': lang,
        'logo': logo, 'jsonld': jsonld(lang), 'orelha': orelha(lang),
        'xadrez_heroi': xadrez(7, 7, rosa=5), 'xadrez_bilhete': xadrez(6, 2), 'xadrez_rodape': xadrez(24, 1),
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
    logo_inline = logo.replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg ').replace('role="img" aria-label="Dayla"', 'aria-hidden="true" focusable="false"')
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
