# Auditoria de SEO e GEO dos sites, ao vivo (corre no servidor ou em qualquer máquina com acesso à internet).
# Para cada site: redirecionamentos (http, www), robots.txt, sitemap (amostra de páginas), título, descrição,
# canónico, lang, h1, noindex, JSON-LD, Open Graph, hreflang, texto sem JavaScript, 404 a sério, llms.txt,
# compressão, HSTS e, com --psi, Core Web Vitals e notas do Lighthouse (PageSpeed Insights, telemóvel).
# Uso: python3 seo_sites.py [--psi] [--amostra N] [dominio ...]
import gzip, json, random, re, sys, threading, time, urllib.error, urllib.parse, urllib.request, zlib
from html.parser import HTMLParser

SITES = ['parou.pt', 'caiu.pt', 'ganhas.pt', 'duplicasa.pt', 'dinissousa.pt', 'adribodypiercing.pt', 'tapmoss.com']
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 (auditoria-seo)'
args = sys.argv[1:]
PSI = '--psi' in args
AMOSTRA = 25
if '--amostra' in args:
    AMOSTRA = int(args[args.index('--amostra') + 1])
alvo = [a for a in args if '.' in a and not a.startswith('--')] or SITES


class SemRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


ABRIR_SEM = urllib.request.build_opener(SemRedir)


def pedir(url, seguir=True, cab=None, tempo=20):
    h = {'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate', 'Accept': 'text/html,application/xhtml+xml,*/*'}
    h.update(cab or {})
    r = urllib.request.Request(url, headers=h)
    try:
        x = (urllib.request.urlopen if seguir else ABRIR_SEM.open)(r, timeout=tempo)
        st, hd, url_f, corpo = x.status, x.headers, x.geturl(), x.read()
    except urllib.error.HTTPError as e:
        st, hd, url_f, corpo = e.code, e.headers, url, e.read() if hasattr(e, 'read') else b''
    except Exception as e:
        return {'st': 0, 'erro': type(e).__name__ + ': ' + str(e)[:80], 'h': {}, 'url': url, 'txt': ''}
    enc = (hd.get('Content-Encoding') or '').lower()
    try:
        if enc == 'gzip':
            corpo = gzip.decompress(corpo)
        elif enc == 'deflate':
            corpo = zlib.decompress(corpo)
    except Exception:
        pass
    return {'st': st, 'h': hd, 'url': url_f, 'txt': corpo.decode('utf-8', 'replace'), 'enc': enc}


class Pag(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None; self._t = False; self.metas = {}; self.links = []; self.h1 = 0; self.lang = None
        self.ld = []; self._ld = None; self.texto = []; self._salta = 0; self.img_sem_alt = 0; self.imgs = 0
        self.a = []

    def handle_starttag(self, tag, at):
        d = dict(at)
        if tag == 'html':
            self.lang = d.get('lang')
        elif tag == 'title' and self.title is None:
            self._t = True; self.title = ''
        elif tag == 'meta':
            k = (d.get('name') or d.get('property') or '').lower()
            if k:
                self.metas[k] = d.get('content') or ''
        elif tag == 'link':
            self.links.append(d)
        elif tag == 'h1':
            self.h1 += 1
        elif tag == 'script' and (d.get('type') or '') == 'application/ld+json':
            self._ld = ''
        elif tag in ('script', 'style', 'noscript', 'template'):
            self._salta += 1
        elif tag == 'img':
            self.imgs += 1
            if d.get('alt') is None:
                self.img_sem_alt += 1
        elif tag == 'a' and d.get('href'):
            self.a.append(d['href'])

    def handle_endtag(self, tag):
        if tag == 'title':
            self._t = False
        elif tag == 'script' and self._ld is not None:
            self.ld.append(self._ld); self._ld = None
        elif tag in ('script', 'style', 'noscript', 'template') and self._salta:
            self._salta -= 1

    def handle_data(self, d):
        if self._t:
            self.title += d
        elif self._ld is not None:
            self._ld += d
        elif not self._salta:
            self.texto.append(d)


def analisar(html):
    p = Pag()
    try:
        p.feed(html)
    except Exception:
        pass
    tipos, erros_ld = [], 0
    for b in p.ld:
        try:
            j = json.loads(b)
            pilha = [j]
            while pilha:
                o = pilha.pop()
                if isinstance(o, dict):
                    t = o.get('@type')
                    if t:
                        tipos += t if isinstance(t, list) else [t]
                    pilha += list(o.values())
                elif isinstance(o, list):
                    pilha += o
        except Exception:
            erros_ld += 1
    canon = [l.get('href') for l in p.links if (l.get('rel') or '').lower() == 'canonical']
    hreflang = [(l.get('hreflang'), l.get('href')) for l in p.links if (l.get('rel') or '').lower() == 'alternate' and l.get('hreflang')]
    palavras = len(re.findall(r'\w+', ' '.join(p.texto)))
    return {'title': (p.title or '').strip(), 'desc': p.metas.get('description'), 'robots': p.metas.get('robots', ''),
            'canon': canon, 'lang': p.lang, 'h1': p.h1, 'ld': sorted(set(tipos)), 'ld_erros': erros_ld,
            'og': {k: p.metas.get(k) for k in ('og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'twitter:card')},
            'hreflang': hreflang, 'palavras': palavras, 'imgs': p.imgs, 'img_sem_alt': p.img_sem_alt,
            'icone': any('icon' in (l.get('rel') or '') for l in p.links), 'viewport': 'viewport' in p.metas, 'a': p.a}


def bloqueados_robots(txt):
    """Agentes importantes com «Disallow: /» no seu grupo (grupos = linhas User-agent seguidas + regras)."""
    grupos, uas, regras, ultimo_ua = [], [], [], False
    for linha in txt.splitlines():
        linha = linha.split('#')[0].strip()
        if not linha or ':' not in linha:
            continue
        k, v = [x.strip() for x in linha.split(':', 1)]
        k = k.lower()
        if k == 'user-agent':
            if not ultimo_ua and uas:
                grupos.append((uas, regras)); uas, regras = [], []
            uas.append(v.lower()); ultimo_ua = True
        elif k in ('allow', 'disallow'):
            regras.append((k, v)); ultimo_ua = False
    if uas:
        grupos.append((uas, regras))
    importantes = ['*', 'googlebot', 'bingbot', 'gptbot', 'oai-searchbot', 'chatgpt-user', 'claudebot', 'claude-searchbot', 'perplexitybot', 'google-extended', 'applebot']
    maus = []
    for uas, regras in grupos:
        if ('disallow', '/') in regras and ('allow', '/') not in regras:
            maus += [u for u in uas if u in importantes]
    return maus


def urls_sitemap(url, prof=0):
    r = pedir(url)
    if r['st'] != 200:
        return [], ['sitemap %s → %s' % (url, r['st'])]
    locs = re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', r['txt'])
    if '<sitemapindex' in r['txt'] and prof < 2:
        tudo, avisos = [], []
        for l in locs[:30]:
            u, a = urls_sitemap(l.replace('&amp;', '&'), prof + 1)
            tudo += u; avisos += a
        return tudo, avisos
    lastmods = re.findall(r'<lastmod>([^<]+)</lastmod>', r['txt'])
    av = []
    if locs and not lastmods:
        av.append('sitemap sem lastmod: %s' % url)
    return [l.replace('&amp;', '&') for l in locs], av


def psi(url, res):
    q = urllib.parse.urlencode([('url', url), ('strategy', 'mobile')] + [('category', c) for c in ('performance', 'seo', 'accessibility', 'best-practices')])
    for tent in range(3):
        r = pedir('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' + q, tempo=120)
        if r['st'] == 200:
            break
        time.sleep(20)
    if r['st'] != 200:
        res[url] = 'PSI falhou (%s) %s' % (r['st'], r.get('erro') or r['txt'][:120]); return
    j = json.loads(r['txt'])
    lh = j.get('lighthouseResult', {})
    cat = {k: round((v.get('score') or 0) * 100) for k, v in lh.get('categories', {}).items()}
    au = lh.get('audits', {})
    lab = {k: au.get(a, {}).get('displayValue') for k, a in (('LCP', 'largest-contentful-paint'), ('CLS', 'cumulative-layout-shift'), ('TBT', 'total-blocking-time'))}
    campo = j.get('loadingExperience', {}).get('metrics') or {}
    cp = {k.replace('_MS', '').replace('LARGEST_CONTENTFUL_PAINT', 'LCP').replace('INTERACTION_TO_NEXT_PAINT', 'INP').replace('CUMULATIVE_LAYOUT_SHIFT_SCORE', 'CLS'): v.get('percentile')
          for k, v in campo.items() if k in ('LARGEST_CONTENTFUL_PAINT_MS', 'INTERACTION_TO_NEXT_PAINT', 'CUMULATIVE_LAYOUT_SHIFT_SCORE')}
    falhas_seo = [a for a, v in au.items() if v.get('score') == 0 and a in {x['id'] for x in lh.get('categories', {}).get('seo', {}).get('auditRefs', [])}]
    res[url] = 'notas %s | lab %s | campo %s%s' % (cat, lab, cp or 'sem dados (pouco tráfego)', (' | SEO falha: ' + ', '.join(falhas_seo)) if falhas_seo else '')


def site(dom, out):
    L = []; prob = []
    base = 'https://' + dom + '/'
    # redirecionamentos
    r = pedir('http://' + dom + '/', seguir=False)
    loc = r['h'].get('Location') if r['h'] else None
    if not (r['st'] in (301, 308) and loc and loc.startswith('https://')):
        prob.append('http → https: %s %s' % (r['st'], loc))
    r = pedir('https://www.' + dom + '/', seguir=False)
    loc = r['h'].get('Location') if r['h'] else None
    if r['st'] == 0:
        L.append('www: não responde (%s)' % r.get('erro'))
    elif not (r['st'] in (301, 308) and loc and loc.rstrip('/') == base.rstrip('/')):
        prob.append('www → sem www: %s %s' % (r['st'], loc))
    home = pedir(base)
    if home['st'] != 200:
        prob.append('início → %s' % home['st'])
    hh = home['h'] or {}
    if 'max-age' not in (hh.get('Strict-Transport-Security') or ''):
        prob.append('sem HSTS')
    if home.get('enc') not in ('gzip', 'br', 'zstd', 'deflate'):
        prob.append('início sem compressão')
    if 'noindex' in (hh.get('X-Robots-Tag') or '').lower():
        prob.append('X-Robots-Tag noindex no início!')
    # robots
    rb = pedir(base + 'robots.txt')
    sms = re.findall(r'(?im)^\s*sitemap:\s*(\S+)', rb['txt']) if rb['st'] == 200 else []
    if rb['st'] != 200:
        prob.append('robots.txt → %s' % rb['st'])
    else:
        for ua in bloqueados_robots(rb['txt']):
            prob.append('robots.txt bloqueia o site inteiro a %s' % ua)
    if not sms:
        prob.append('robots.txt sem Sitemap')
    bots_ia = [b for b in ('GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended') if b.lower() in rb['txt'].lower()]
    # sitemap
    urls, av = [], []
    for s in sms or [base + 'sitemap.xml']:
        u, a = urls_sitemap(s)
        urls += u; av += a
    prob += av
    fora = [u for u in urls if urllib.parse.urlsplit(u).netloc != dom]
    if fora:
        prob.append('sitemap com %d endereços de outro domínio (ex.: %s)' % (len(fora), fora[0]))
    L.append('sitemap: %d endereços; robots menciona bots de IA: %s' % (len(urls), ', '.join(bots_ia) or 'nenhum'))
    for nome, ua in (('Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
                     ('bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'),
                     ('GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'),
                     ('OAI-SearchBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'),
                     ('ClaudeBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'),
                     ('PerplexityBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)')):
        rr = pedir(base, cab={'User-Agent': ua})
        if rr['st'] != 200:
            prob.append('%s recebe %s no início' % (nome, rr['st']))
    # llms.txt e 404
    ll = pedir(base + 'llms.txt')
    L.append('llms.txt: %s (%d caracteres)' % (ll['st'], len(ll['txt']) if ll['st'] == 200 else 0))
    n4 = pedir(base + 'esta-pagina-nao-existe-%d' % random.randint(1000, 9999))
    if n4['st'] != 404:
        prob.append('página inexistente responde %s (devia ser 404: «soft 404»)' % n4['st'])
    # páginas
    random.seed(dom)
    amostra = [base] + ([u for u in urls if u.rstrip('/') != base.rstrip('/')][:5] + random.sample(urls, min(len(urls), AMOSTRA)) if urls else [])
    vistos, titulos, descs = set(), {}, {}
    for u in amostra:
        if u in vistos:
            continue
        vistos.add(u)
        r = home if u == base else pedir(u)
        if r['st'] != 200:
            prob.append('%s → %s' % (u, r['st'])); continue
        if r['url'].rstrip('/') != u.rstrip('/'):
            prob.append('%s redireciona para %s (o sitemap deve ter o endereço final)' % (u, r['url']))
        a = analisar(r['txt'])
        cur = u.replace(base, '/')
        t, d = a['title'], a['desc']
        titulos.setdefault(t, []).append(cur); descs.setdefault(d, []).append(cur)
        if not t:
            prob.append('%s sem <title>' % cur)
        elif len(t) > 65:
            prob.append('%s título longo (%d): %s' % (cur, len(t), t[:70]))
        if not d:
            prob.append('%s sem meta description' % cur)
        elif not (50 <= len(d) <= 170):
            prob.append('%s descrição com %d caracteres' % (cur, len(d)))
        if not a['canon']:
            prob.append('%s sem canónico' % cur)
        elif a['canon'][0].rstrip('/') != r['url'].rstrip('/'):
            prob.append('%s canónico aponta para %s' % (cur, a['canon'][0]))
        if not a['lang']:
            prob.append('%s sem lang' % cur)
        if a['h1'] != 1:
            prob.append('%s com %d h1' % (cur, a['h1']))
        if 'noindex' in a['robots'].lower():
            prob.append('%s tem noindex mas está no sitemap' % cur)
        if a['ld_erros']:
            prob.append('%s JSON-LD inválido (%d)' % (cur, a['ld_erros']))
        if not a['viewport']:
            prob.append('%s sem viewport' % cur)
        falta_og = [k for k in ('og:title', 'og:description', 'og:image') if not a['og'].get(k)]
        if falta_og:
            prob.append('%s sem %s' % (cur, ', '.join(falta_og)))
        if a['palavras'] < 120:
            prob.append('%s só %d palavras sem JavaScript' % (cur, a['palavras']))
        if a['img_sem_alt']:
            prob.append('%s %d de %d imagens sem alt' % (cur, a['img_sem_alt'], a['imgs']))
        if u == base:
            L.append('início: «%s» | lang=%s | JSON-LD %s | hreflang %d | %d palavras sem JS | ícone %s | og:image %s' % (
                t[:70], a['lang'], ','.join(a['ld']) or '-', len(a['hreflang']), a['palavras'], a['icone'], bool(a['og'].get('og:image'))))
            for hl, hu in a['hreflang']:
                if pedir(hu)['st'] != 200:
                    prob.append('hreflang %s → %s não responde 200' % (hl, hu))
    for t, us in titulos.items():
        if t and len(us) > 1:
            prob.append('título repetido em %d páginas: «%s» (%s)' % (len(us), t[:50], ', '.join(us[:3])))
    for d, us in descs.items():
        if d and len(us) > 1:
            prob.append('descrição repetida em %d páginas (%s)' % (len(us), ', '.join(us[:3])))
    L.append('páginas vistas: %d' % len(vistos))
    out[dom] = (L, prob)


out = {}
ts = [threading.Thread(target=site, args=(d, out)) for d in alvo]
res_psi = {}
if PSI:
    ts += [threading.Thread(target=psi, args=('https://%s/' % d, res_psi)) for d in alvo]
for t in ts:
    t.start()
    time.sleep(0.3)
for t in ts:
    t.join(timeout=500)
for d in alvo:
    L, prob = out.get(d, (['sem resultado'], []))
    print('\n=== %s — %d problemas' % (d, len(prob)))
    for l in L:
        print('  ' + l)
    if PSI:
        print('  PSI: ' + str(res_psi.get('https://%s/' % d, 'sem resposta')))
    for p in prob[:40]:
        print('  ✗ ' + p)
    if len(prob) > 40:
        print('  … e mais %d' % (len(prob) - 40))
