#!/usr/bin/env python3
"""Verifica as páginas SEO geradas por paginas.py (pasta de saída), sem browser:
HTML bem formado, título/descrição, canonical, robots, JSON-LD válido, resposta direta (40–60 palavras), ligações internas
que não dão 404, páginas no sitemap sem noindex, órfãs, hreflang recíproco, 410 e redirecionamentos.
Uso: python3 verificar_seo.py pasta_seo [pasta_do_site_estatico]"""
import collections, json, os, re, sys
from html.parser import HTMLParser

SITE = 'https://duplicasa.pt'
VAZIOS = {'meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track', 'path'}


class Leitor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pilha, self.erros, self.links, self.ld, self.meta, self.alt = [], [], [], [], {}, []
        self.titulo, self.h1, self._em, self._ld, self.intro, self._intro, self.canonical = '', [], None, None, '', False, None
        self.svg = 0

    def handle_starttag(self, t, a):
        a = dict(a)
        if t == 'svg':
            self.svg += 1
        if t not in VAZIOS and not self.svg:
            self.pilha.append(t)
        if t == 'a' and a.get('href'):
            self.links.append(a['href'])
        if t == 'meta':
            self.meta[a.get('name') or a.get('property') or a.get('http-equiv') or ''] = a.get('content')
        if t == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href')
        if t == 'link' and a.get('rel') == 'alternate' and a.get('hreflang'):
            self.alt.append((a['hreflang'], a['href']))
        if t in ('title', 'h1'):
            self._em = t
        if t == 'script' and a.get('type') == 'application/ld+json':
            self._ld = ''
        if t == 'p' and 'intro' in (a.get('class') or '') and not self.intro:
            self._intro = True

    def handle_endtag(self, t):
        if t == 'svg':
            self.svg -= 1
            return
        if t in VAZIOS or self.svg:
            return
        if not self.pilha or self.pilha[-1] != t:
            self.erros.append(f'fecho </{t}> com {self.pilha[-3:]} abertos')
            if t in self.pilha:
                while self.pilha and self.pilha.pop() != t:
                    pass
        else:
            self.pilha.pop()
        if t in ('title', 'h1'):
            self._em = None
        if t == 'script' and self._ld is not None:
            try:
                self.ld.append(json.loads(self._ld))
            except ValueError as ex:
                self.erros.append(f'JSON-LD inválido: {ex}')
            self._ld = None
        if t == 'p' and self._intro:
            self._intro = False

    def handle_data(self, d):
        if self._em == 'title':
            self.titulo += d
        elif self._em == 'h1':
            self.h1.append(d)
        if self._ld is not None:
            self._ld += d
        if self._intro:
            self.intro += d


def main():
    raiz = sys.argv[1]
    estatico = sys.argv[2] if len(sys.argv) > 2 else None
    pags, erros, avisos = {}, collections.defaultdict(list), collections.defaultdict(list)
    saiu, csv = set(), set()
    for d, _, fs in os.walk(raiz):
        for f in fs:
            c = '/' + os.path.relpath(os.path.join(d, f), raiz).replace(os.sep, '/')
            if f == 'index.html':
                c = c[:-len('index.html')]
                l = Leitor()
                l.feed(open(os.path.join(d, f), encoding='utf-8').read())
                pags[c] = l
            elif f == '410.html':
                saiu.add(c[:-len('410.html')])
            elif f.endswith('.csv'):
                csv.add(c)
    mapa = re.findall(r'<loc>' + re.escape(SITE) + r'([^<]*)</loc>', open(os.path.join(raiz, 'sitemap.xml'), encoding='utf-8').read())
    no_mapa = set(mapa)
    existentes = set(pags) | csv | {'/'}
    if estatico:
        for d, _, fs in os.walk(estatico):
            for f in fs:
                existentes.add('/' + os.path.relpath(os.path.join(d, f), estatico).replace(os.sep, '/'))
    entram = collections.Counter()
    titulos = collections.defaultdict(list)
    for c, l in pags.items():
        robots = l.meta.get('robots') or ''
        redir = l.meta.get('refresh')
        if l.erros:
            erros[c] += l.erros[:3]
        if l.pilha:
            erros[c].append(f'por fechar: {l.pilha[-4:]}')
        if not redir:
            if l.canonical != SITE + c:
                erros[c].append(f'canonical {l.canonical}')
            if not l.titulo.strip() or len(l.titulo) > 70:
                avisos[c].append(f'título {len(l.titulo)}: {l.titulo}')
            ds = l.meta.get('description') or ''
            if not ds or len(ds) > 165:
                avisos[c].append(f'descrição {len(ds)}')
            if len(l.h1) != 1 and not l.h1:
                erros[c].append('sem h1')
            if 'noindex' not in robots:
                titulos[l.titulo].append(c)
        tipos = [x.get('@type') for x in l.ld]
        if 'BreadcrumbList' not in tipos:
            erros[c].append('sem BreadcrumbList')
        for x in l.ld:
            for k in ('ItemList', 'FAQPage'):
                if x.get('@type') == k:
                    erros[c].append(f'{k} ainda presente')
        if c in no_mapa and 'noindex' in robots:
            erros[c].append('no sitemap com noindex')
        if c not in no_mapa and 'noindex' not in robots and not redir:
            erros[c].append('indexável fora do sitemap')
        n_pal = len(l.intro.split())
        if c.startswith('/arrendar/') and 'noindex' not in robots and not redir and '/guias/' not in c and '/ate-' not in c and not (40 <= n_pal <= 60):
            avisos[c].append(f'resposta com {n_pal} palavras')
        for h in l.links:
            if h.startswith(SITE):
                h = h[len(SITE):]
            if not h.startswith('/') or h.startswith('//'):
                continue
            h = h.split('#')[0].split('?')[0] or '/'
            if h not in existentes and h + 'index.html' not in existentes:
                erros[c].append(f'ligação partida {h}')
            elif h != c:
                entram[h] += 1
                if h in pags and 'noindex' in (pags[h].meta.get('robots') or '') and 'noindex' not in robots:
                    avisos[c].append(f'liga a página sem índice {h}')
        for lang, href in l.alt:
            alvo = href[len(SITE):] if href.startswith(SITE) else href
            if alvo not in pags:
                erros[c].append(f'hreflang {lang} para página inexistente {alvo}')
            elif SITE + c not in [x[1] for x in pags[alvo].alt]:
                erros[c].append(f'hreflang {lang} sem volta ({alvo})')
            elif 'noindex' in (pags[alvo].meta.get('robots') or ''):
                erros[c].append(f'hreflang {lang} para página sem índice')
    orfas = [c for c in no_mapa if c != '/' and entram[c] == 0]
    dup = {t: cs for t, cs in titulos.items() if len(cs) > 1}
    print(f'páginas {len(pags)} · no sitemap {len(no_mapa)} · 410 {len(saiu)} · CSV {len(csv)} · órfãs {len(orfas)} · títulos repetidos {len(dup)}')
    for c in sorted(erros)[:40]:
        print('ERRO', c, '|', '; '.join(erros[c][:4]))
    tipos_av = collections.Counter(re.sub(r'[0-9]+', 'N', a.split(':')[0]) for v in avisos.values() for a in v)
    print('avisos por tipo:', dict(tipos_av))
    for c in sorted(avisos)[:25]:
        print('AVISO', c, '|', '; '.join(avisos[c][:3]))
    for c in orfas[:15]:
        print('ÓRFÃ', c)
    for t, cs in list(dup.items())[:10]:
        print('TÍTULO REPETIDO', t, cs[:4])
    sys.exit(1 if erros else 0)


if __name__ == '__main__':
    main()
