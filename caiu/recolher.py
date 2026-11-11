"""caiu.pt — recolha diária dos preços do Continente, Pingo Doce e Auchan.

Uso: python3 recolher.py <pasta_dados> [--max-termos N]

Para cada pesquisa de caiu/termos.txt lê a grelha de resultados de cada loja (até 48 produtos), guarda
o preço do dia numa base SQLite (historico.db) e escreve na pasta os ficheiros que o site lê:
  resumo.json   números do dia, cabaz comparado e destaques (pequeno, abre a página)
  lista.json    todos os produtos do dia, agrupados quando são o mesmo produto em lojas diferentes
  h/<id>.json   histórico de preços de cada produto (até 120 dias)
  estado.json   como correu a recolha (por loja)

Só leitura de páginas públicas, um pedido de cada vez, com pausa entre pedidos.
"""
import gzip, html, json, os, re, sqlite3, sys, time, unicodedata, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cabaz
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
PAUSA = float(os.environ.get('CAIU_PAUSA', '2.2'))
SZ = 48
HIST_DIAS = 120

LOJAS = {
    'continente': {'nome': 'Continente', 'base': 'https://www.continente.pt',
                   'url': 'https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Search-UpdateGrid?q={q}&pmin=0.01&start=0&sz={sz}'},
    'pingodoce': {'nome': 'Pingo Doce', 'base': 'https://www.pingodoce.pt',
                  'url': 'https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-UpdateGrid?q={q}&start=0&sz={sz}'},
    'auchan': {'nome': 'Auchan', 'base': 'https://www.auchan.pt',
               'url': 'https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid?q={q}&start=0&sz={sz}'},
}
COD = {'continente': 'c', 'pingodoce': 'p', 'auchan': 'a'}


# ---------- utilitários ----------
def ler(url):
    r = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8',
                                             'Accept-Language': 'pt-PT,pt;q=0.9', 'Accept-Encoding': 'gzip'})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(r, timeout=40) as f:
                b = f.read(6_000_000)
                if f.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
                return f.status, b.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return e.code, ''
            err = e.code
        except Exception as e:
            err = type(e).__name__
        time.sleep(5 * (tentativa + 1))
    return err, ''


def limpo(t):
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t or ''))
    return re.sub(r'\s+', ' ', t.replace('\xa0', ' ')).strip()


def num(t):
    """'1,29 €' / '1.29' / '5,34€' -> 1.29"""
    if t is None:
        return None
    m = re.search(r'(\d+(?:[.,]\d{1,3})?)', str(t).replace(' ', ''))
    if not m:
        return None
    v = float(m.group(1).replace(',', '.'))
    return round(v, 2) if 0 < v < 10000 else None


def norm(t):
    return unicodedata.normalize('NFD', (t or '').lower()).encode('ascii', 'ignore').decode()


def jattr(bloco, nome):
    m = re.search(nome + r"""\s*=\s*(['"])(.*?)\1""", bloco, re.S)
    if not m:
        return {}
    try:
        return json.loads(html.unescape(m.group(2)))
    except Exception:
        return {}


UNID = {'l': 'L', 'lt': 'L', 'litro': 'L', 'kg': 'kg', 'un': 'un', 'unid': 'un', 'dose': 'dose', 'doses': 'dose',
        'rolo': 'rolo', 'rolos': 'rolo', 'm': 'm', 'mt': 'm', 'cl': 'L', 'ml': 'L', 'gr': 'kg', 'g': 'kg', 'lavagem': 'lavagem', 'lavagens': 'lavagem'}


def preco_unidade(t):
    """'0,89€/lt' / '1 L | 0,85 €/L' / '0.85 €/Lt' -> (0.89, 'L')"""
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:€|&euro;)\s*/\s*([A-Za-zÀ-ú]+)', t or '')
    if not m:
        return None, ''
    u = UNID.get(norm(m.group(2)), m.group(2))
    return num(m.group(1)), u


def tamanho(t):
    """Quantidade total em ml, g ou unidades e número de embalagens: 'emb. 6 x 1 lt' -> (6000, 'ml', 6); '500 gr' -> (500, 'g', 1)."""
    s = norm(t).replace(',', '.')
    m = re.search(r'(\d+)\s*(?:un\s*|unid\s*)?x\s*(\d+(?:\.\d+)?)\s*(ml|cl|lt|l|kg|gr|g)\b', s)
    mult = 1
    if m:
        mult, v, u = int(m.group(1)), float(m.group(2)), m.group(3)
    else:
        m = re.search(r'(\d+(?:\.\d+)?)\s*(ml|cl|lt|l|kg|gr|g)\b', s)
        if not m:
            m2 = re.search(r'(\d+)\s*(un|unid|rolos|doses|capsulas|saquetas|lavagens|pastilhas)\b', s)
            return (int(m2.group(1)), 'un', 1) if m2 else (None, '', 1)
        v, u = float(m.group(1)), m.group(2)
    f = {'ml': (1, 'ml'), 'cl': (10, 'ml'), 'lt': (1000, 'ml'), 'l': (1000, 'ml'), 'kg': (1000, 'g'), 'gr': (1, 'g'), 'g': (1, 'g')}[u]
    return int(round(mult * v * f[0])), f[1], mult


def frase(t):
    """Nomes da Auchan vêm em maiúsculas: 'LEITE UHT AUCHAN MEIO GORDO 1L' -> 'Leite UHT Auchan meio gordo 1 L'."""
    if not t or t != t.upper():
        return t
    pal = t.lower().split()
    SIGLAS = {'uht', 'xl', 'xxl', 'dop', 'igp', 'bio', 'spf', 'ml', 'cl', 'kg', 'pvp'}
    out = []
    for i, p in enumerate(pal):
        if p in SIGLAS and p not in ('ml', 'cl', 'kg'):
            out.append(p.upper())
        elif i == 0:
            out.append(p[:1].upper() + p[1:])
        else:
            out.append(p)
    s = ' '.join(out)
    s = re.sub(r'(\d)(l|lt)\b', r'\1 L', s)
    s = re.sub(r'(\d)(ml|cl|kg|g|gr)\b', r'\1 \2', s)
    return s


def img_grande(u, base):
    if not u:
        return ''
    u = html.unescape(u.strip())
    if u.startswith('/'):
        u = base + u
    return re.sub(r'\?.*$', '', u)


# ---------- leitores de cada loja ----------
def ler_continente(t):
    base = LOJAS['continente']['base']
    out = []
    for b in re.split(r'(?=<div class="product-tile )', t)[1:]:
        j = jattr(b, 'data-product-tile-impression')
        if not j.get('id') or not j.get('price'):
            continue
        qtd = limpo((re.search(r'class="pwc-tile--quantity[^"]*">(.*?)</p>', b, re.S) or [None, ''])[1])
        pu, un = preco_unidade(limpo((re.search(r'class="pwc-tile--price-secondary[^"]*">(.*?)</div>', b, re.S) or [None, ''])[1]))
        if pu is None:
            pr = b.find('pwc-price-wrap')
            pu, un = preco_unidade(limpo(b[pr:pr + 3000])) if pr > 0 else (None, '')
        lst = re.search(r'<div class="list[^"]*">(.*?)</div>', b, re.S)
        antes = pvpr = None
        if lst:
            tx = limpo(lst.group(1))
            if 'PVPR' in tx.upper():
                pvpr = num(tx.upper().replace('PVPR', ''))
            else:
                antes = num(tx)
        # Etiquetas da promoção (imagens com texto alternativo e o texto por cima delas)
        badge = re.search(r'<div class="ct-product-tile-badge[^"]*"[^>]*>(.*?)<[^<>]*ct-tile-favorite', b, re.S)
        promo = []
        if badge:
            for a in re.findall(r'alt="([^"]*)"', badge.group(1)):
                a = limpo(a)
                if a and 'PVP Recomendado' not in a:
                    promo.append(a)
            txt = limpo(badge.group(1))
            if (txt and not pvpr and re.search(r'\d', txt) and not re.search(r'[<>="]|class', txt)
                    and not any('%' in x for x in promo)):
                promo.append(txt)
        img = re.search(r'class="ct-tile-image[^"]*"[^>]*data-src="([^"]+)"', b, re.S)
        url = re.search(r'class="image-link[^"]*" href="([^"]+)"', b)
        out.append({'id': str(j['id']), 'nome': html.unescape(j.get('name', '')).strip(), 'marca': html.unescape(j.get('brand') or '').strip(),
                    'cat': html.unescape(j.get('category') or '').split('/')[1] if '/' in (j.get('category') or '') else '',
                    'qtd': qtd, 'preco': round(float(j['price']), 2), 'pun': pu, 'un': un, 'antes': antes, 'pvpr': pvpr,
                    'promo': ' · '.join(dict.fromkeys(promo))[:120], 'img': img_grande(img.group(1) if img else '', base),
                    'url': html.unescape(url.group(1)).replace(base, '') if url else ''})
    return out


def ler_pingodoce(t):
    base = LOJAS['pingodoce']['base']
    out = []
    for b in re.split(r'(?=<div class="product-tile-pd")', t)[1:]:
        g = jattr(b, 'data-gtm-info')
        it = (g.get('items') or [{}])[0]
        pid = it.get('item_id') or (re.search(r'data-pid="([^"]+)"', b) or [None, ''])[1]
        venda = re.search(r'<span class="sales[^"]*">\s*<span class="value" content="([\d.]+)"', b)
        preco = float(venda.group(1)) if venda else it.get('price')
        if not pid or not preco:
            continue
        un_txt = limpo((re.search(r'class="product-unit">(.*?)</div>', b, re.S) or [None, ''])[1])
        pu, un = preco_unidade(un_txt)
        if pu is None:
            # fruta, legumes, carne e peixe a granel: o preço de venda já é ao kg («1,19 €/Kg»)
            kg = re.search(r'<span class="sales[^"]*">\s*<span class="value" content="([\d.]+)"></span>\s*[\d.,]+\s*(?:&euro;|€)\s*/\s*(Kg|kg|KG|L|Lt|lt)\b', b)
            if kg:
                pu, un = round(float(kg.group(1)), 2), ('kg' if kg.group(2).lower() == 'kg' else 'L')
        antes = re.search(r'class="strike-through[^"]*">\s*<span class="value" content="([\d.]+)"', b)
        promo = [limpo(x) for x in re.findall(r'class="promo-message">(.*?)</span>', b, re.S)]
        promo += [limpo(x) for x in re.findall(r'class="product-tile-promo-label"[^>]*>(.*?)</div>', b, re.S)]
        nome = limpo((re.search(r'class="product-name-link">\s*<a[^>]*>(.*?)</a>', b, re.S) or [None, it.get('item_name', '')])[1])
        marca = limpo((re.search(r'class="product-brand-name">(.*?)</div>', b, re.S) or [None, it.get('item_brand', '')])[1])
        img = re.search(r'class="product-tile-component-image" src="([^"]+)"', b)
        url = re.search(r'class="product-tile-image-link" href="([^"]+)"', b)
        out.append({'id': str(pid), 'nome': nome, 'marca': marca, 'cat': html.unescape(it.get('item_category2') or it.get('item_category') or '').replace('​', ''),
                    'qtd': un_txt.split('|')[0].strip(), 'preco': round(float(preco), 2), 'pun': pu, 'un': un,
                    'antes': num(antes.group(1)) if antes else None, 'pvpr': None,
                    'promo': ' · '.join(x for x in dict.fromkeys(promo) if x)[:120],
                    'img': img_grande(img.group(1) if img else '', base), 'url': html.unescape(url.group(1)) if url else ''})
    return out


def ler_auchan(t):
    base = LOJAS['auchan']['base']
    out = []
    for b in re.split(r'(?=<div class="product-tile auc-product-tile)', t)[1:]:
        g = jattr(b, 'data-gtm')
        venda = re.search(r'<span class="sales">\s*<span class="value" content="([\d.]+)"', b)
        preco = float(venda.group(1)) if venda else num(g.get('price'))
        if not g.get('id') or not preco:
            continue
        pu, un = preco_unidade(limpo((re.search(r'auc-measures--price-per-unit">(.*?)</span>', b, re.S) or [None, ''])[1]))
        antes = re.search(r'class="strike-through value" content="([\d.]+)"', b)
        pvpr = re.search(r'class="pvp-recommended">(.*?)</span>', b, re.S)
        promo = []
        if 'auc-price__promotion--show' in b:
            d = re.search(r'auc-price__promotion--pdp__date">(.*?)</span>', b, re.S)
            promo.append('Promoção ' + limpo(d.group(1)) if d else 'Promoção')
        pp = re.search(r'class="pvp-percentage">(.*?)</span>\s*<span class="pvp-recommended"', b, re.S)
        if pp:
            promo.append(limpo(pp.group(1)))
        marca = html.unescape(g.get('brand') or '').strip()
        marca = marca.title() if marca.isupper() else marca
        nome = frase(html.unescape(g.get('name', '')).strip())
        if marca and nome:
            nome = re.sub(r'\b' + re.escape(marca.lower()) + r'\b', marca, nome)
        img = re.search(r'<img[^>]*data-src="([^"]+)"', b)
        url = (jattr(b, 'data-urls') or {}).get('productUrl', '')
        cat = html.unescape(g.get('category') or '').split('/')
        out.append({'id': str(g['id']), 'nome': nome, 'marca': marca,
                    'cat': cat[1].replace('-', ' ').capitalize() if len(cat) > 1 else '',
                    'qtd': '', 'preco': round(float(preco), 2), 'pun': pu, 'un': un,
                    'antes': num(antes.group(1)) if antes else None, 'pvpr': num(limpo(pvpr.group(1))) if pvpr else None,
                    'promo': ' · '.join(dict.fromkeys(promo))[:120], 'img': img_grande(img.group(1) if img else '', base), 'url': url})
    return out


LEITORES = {'continente': ler_continente, 'pingodoce': ler_pingodoce, 'auchan': ler_auchan}


# ---------- agrupar o mesmo produto em lojas diferentes ----------
PARAR = set('de da do das dos e com em para a o as os ao the emb embalagem unidade un pack uht'.split())
MARCAS_PROPRIAS = {'continente', 'pingo doce', 'auchan', 'polegar', 'amanhecer', 'cuidamos', 'selecao', 'pingo', 'e-leclerc'}


def fichas(texto, marca):
    s = norm(texto)
    for p in norm(marca).split():
        s = re.sub(r'\b' + re.escape(p) + r'\b', ' ', s)
    s = re.sub(r'\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:ml|cl|lt|l|kg|gr|g|un|unid)\b', ' ', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return {w for w in s.split() if w not in PARAR and len(w) > 1 and not w.isdigit()}


def agrupar(prods):
    """prods: lista de dicts com loja. Devolve lista de grupos (listas de índices)."""
    baldes = {}
    for i, p in enumerate(prods):
        q, u, mult = tamanho(p['qtd'] + ' ' + p['nome'])
        p['_tam'] = (q, u, mult)
        p['_fi'] = fichas(p['nome'], p['marca'])
        marca = norm(p['marca']).strip()
        if not marca or not q or marca in MARCAS_PROPRIAS:
            continue
        baldes.setdefault((marca, q, u, mult), []).append(i)
    pai = list(range(len(prods)))

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i
    lojas_de = {i: {prods[i]['loja']} for i in range(len(prods))}
    for idx in baldes.values():
        pares = []
        for x in range(len(idx)):
            for y in range(x + 1, len(idx)):
                a, b = prods[idx[x]], prods[idx[y]]
                if a['loja'] == b['loja']:
                    continue
                fa, fb = a['_fi'], b['_fi']
                if not fa or not fb:
                    continue
                sim = len(fa & fb) / len(fa | fb)
                razao = max(a['preco'], b['preco']) / max(0.01, min(a['preco'], b['preco']))
                # o preço por unidade de cada loja tem de bater certo com o preço (apanha packs diferentes)
                if a['pun'] and b['pun'] and a['un'] == b['un']:
                    q = (a['preco'] / b['preco']) / (a['pun'] / b['pun'])
                    if not 0.8 <= q <= 1.25:
                        continue
                if sim >= (0.85 if razao > 1.6 else 0.65):
                    pares.append((sim, idx[x], idx[y]))
        for sim, i, j in sorted(pares, reverse=True):
            ri, rj = raiz(i), raiz(j)
            if ri == rj or lojas_de[ri] & lojas_de[rj]:
                continue
            pai[rj] = ri
            lojas_de[ri] |= lojas_de.pop(rj)
    grupos = {}
    for i in range(len(prods)):
        grupos.setdefault(raiz(i), []).append(i)
    return list(grupos.values())


# ---------- veredito ----------
def veredito(p, hist, outras):
    """p: oferta de hoje; hist: [(dia, preco, antes)] dos dias anteriores (mais recente no fim); outras: ofertas de outras lojas.
    Devolve (classe, [motivos]). classe: 'real' (baixou a sério), 'fachada' (promoção que não é o que parece),
    'pvpr' (desconto calculado sobre o preço recomendado pela marca), 'promo' (ainda sem forma de confirmar), ''."""
    ult30 = [h for h in hist if h[0] >= (datetime.now(ZoneInfo('Europe/Lisbon')).date() - timedelta(days=30)).isoformat()]
    precos30 = [h[1] for h in ult30]
    dias = len(ult30)
    promo = bool(p['antes'] or p['pvpr'] or p['promo'])
    motivos = []
    classe = 'promo' if promo else ''
    if dias >= 7 and precos30 and p['preco'] < min(precos30) - 0.005:
        motivos.append(['min30', round(min(precos30), 2), dias])
        classe = 'real'
    if p['pvpr'] and not p['antes'] and p['preco'] < p['pvpr']:
        motivos.append(['pvpr', p['pvpr']])
        if classe != 'real':
            classe = 'pvpr'
    if promo and p['antes'] and dias >= 25 and precos30 and p['antes'] > max(precos30) + 0.005:
        motivos.append(['antes', p['antes'], round(max(precos30), 2), dias])
        if classe != 'real':
            classe = 'fachada'
    if promo and dias >= 14 and precos30 and p['preco'] >= min(precos30) - 0.005 and classe != 'real':
        motivos.append(['igual', round(min(precos30), 2), dias])
        classe = 'fachada'
    if promo:
        mais_barato = [o for o in outras if o['preco'] < p['preco'] - 0.005]
        if mais_barato:
            o = min(mais_barato, key=lambda o: o['preco'])
            motivos.append(['outra', o['loja'], o['preco']])
            classe = 'fachada'
    return classe, motivos


# ---------- programa ----------
def main():
    pasta = sys.argv[1] if len(sys.argv) > 1 else 'dados'
    max_termos = int(sys.argv[sys.argv.index('--max-termos') + 1]) if '--max-termos' in sys.argv else 9999
    os.makedirs(os.path.join(pasta, 'h'), exist_ok=True)
    termos = [l.strip() for l in open(os.path.join(AQUI, 'termos.txt'), encoding='utf-8') if l.strip() and not l.startswith('#')]
    # pesquisas feitas no site que não deram nada (escritas por alertas.py): entram na recolha
    extra = os.environ.get('CAIU_TERMOS_EXTRA', '/var/lib/caiu-api/termos-extra.txt')
    try:
        vistos_t = {norm(t) for t in termos}
        for l in open(extra, encoding='utf-8'):
            t = l.strip()[:40]
            if t and re.fullmatch(r"[\w' .&-]{3,40}", t) and norm(t) not in vistos_t:
                termos.append(t)
                vistos_t.add(norm(t))
    except OSError:
        pass
    termos = termos[:max_termos]
    agora = datetime.now(ZoneInfo('Europe/Lisbon'))
    hoje = agora.date().isoformat()
    db = sqlite3.connect(os.path.join(pasta, 'historico.db'))
    db.executescript('''
      create table if not exists produtos(loja text, id text, nome text, marca text, cat text, qtd text, pun real, un text,
        img text, url text, visto text, primary key(loja, id));
      create table if not exists precos(loja text, id text, dia text, preco real, antes real, pvpr real, promo text,
        primary key(loja, id, dia));
      create index if not exists precos_dia on precos(dia);''')

    estado = {'inicio': agora.isoformat(timespec='seconds'), 'lojas': {}}
    vistos = {l: {} for l in LOJAS}
    for n, termo in enumerate(termos):
        for loja, cfg in LOJAS.items():
            e = estado['lojas'].setdefault(loja, {'pedidos': 0, 'falhas': 0, 'codigos': {}})
            st, t = ler(cfg['url'].format(q=urllib.parse.quote(termo), sz=SZ))
            e['pedidos'] += 1
            e['codigos'][str(st)] = e['codigos'].get(str(st), 0) + 1
            if st != 200:
                e['falhas'] += 1
            else:
                try:
                    for p in LEITORES[loja](t):
                        vistos[loja].setdefault(p['id'], p)
                except Exception as ex:
                    e['falhas'] += 1
                    e['erro'] = f'{termo}: {type(ex).__name__}: {ex}'[:200]
            time.sleep(PAUSA)
        if n % 10 == 0:
            print(f'{n + 1}/{len(termos)} {termo}: ' + ', '.join(f'{l} {len(v)}' for l, v in vistos.items()), flush=True)
            # estado a meio (visível em /dados/estado.json enquanto a recolha corre)
            parcial = dict(estado, a_correr=f'{n + 1}/{len(termos)}', produtos_vistos={l: len(v) for l, v in vistos.items()})
            with open(os.path.join(pasta, 'estado.json.tmp'), 'w') as f:
                json.dump(parcial, f, ensure_ascii=False)
            os.replace(os.path.join(pasta, 'estado.json.tmp'), os.path.join(pasta, 'estado.json'))

    for loja, prods in vistos.items():
        estado['lojas'].setdefault(loja, {'pedidos': 0, 'falhas': 0, 'codigos': {}})['produtos'] = len(prods)
        for p in prods.values():
            db.execute('insert or replace into produtos values (?,?,?,?,?,?,?,?,?,?,?)',
                       (loja, p['id'], p['nome'], p['marca'], p['cat'], p['qtd'], p['pun'], p['un'], p['img'], p['url'], hoje))
            db.execute('insert or replace into precos values (?,?,?,?,?,?,?)',
                       (loja, p['id'], hoje, p['preco'], p['antes'], p['pvpr'], p['promo']))
    db.commit()

    # Dados de cada loja: os do último dia com recolha boa (até 3 dias), para uma loja em baixo não desaparecer do site
    lim = (agora.date() - timedelta(days=3)).isoformat()
    prods = []
    for loja in LOJAS:
        dia = db.execute('select max(visto) from produtos where loja=? and visto>=?', (loja, lim)).fetchone()[0]
        if not dia:
            continue
        rows = db.execute('''select p.id, p.nome, p.marca, p.cat, p.qtd, p.pun, p.un, p.img, p.url, c.preco, c.antes, c.pvpr, c.promo
                             from produtos p join precos c on c.loja=p.loja and c.id=p.id and c.dia=p.visto
                             where p.loja=? and p.visto=?''', (loja, dia)).fetchall()
        for r in rows:
            prods.append({'loja': loja, 'id': r[0], 'nome': r[1], 'marca': r[2], 'cat': r[3], 'qtd': r[4], 'pun': r[5], 'un': r[6],
                          'img': r[7], 'url': r[8], 'preco': r[9], 'antes': r[10], 'pvpr': r[11], 'promo': r[12] or '', 'dia': dia})

    grupos = agrupar(prods)
    desde = (agora.date() - timedelta(days=HIST_DIAS)).isoformat()
    lista, todos_ids = [], set()
    ordem_loja = ['continente', 'pingodoce', 'auchan']
    for g in grupos:
        ofs = sorted((prods[i] for i in g), key=lambda p: ordem_loja.index(p['loja']))
        gid = COD[ofs[0]['loja']] + ofs[0]['id']
        todos_ids.add(gid)
        hist_g = {}
        o_out = []
        for p in ofs:
            h = db.execute('select dia, preco, antes, pvpr from precos where loja=? and id=? and dia>=? order by dia',
                           (p['loja'], p['id'], desde)).fetchall()
            hist_g[COD[p['loja']]] = [[r[0], r[1], r[2], r[3]] for r in h]
            anteriores = [(r[0], r[1], r[2]) for r in h if r[0] < p['dia']]
            classe, motivos = veredito(p, anteriores, [o for o in ofs if o is not p])
            o_out.append({'l': COD[p['loja']], 'id': p['id'], 'p': p['preco'], 'pu': p['pun'], 'u': p['un'], 'a': p['antes'], 'r': p['pvpr'],
                          't': p['promo'], 'v': classe, 'm': motivos, 'url': p['url'], 'd': len(h)})
        # nome e imagem: preferir o Continente/Pingo Doce (nomes mais limpos que os da Auchan)
        base = ofs[0]
        nome = base['nome']
        if base['loja'] == 'pingodoce' and base['marca'] and norm(base['marca']) not in norm(nome):
            nome = f"{nome} {base['marca']}"
        qtd = next((p['qtd'] for p in ofs if p['qtd']), '')
        img = next((p['img'] for p in ofs if p['img']), '')
        classes = [o['v'] for o in o_out]
        v = next((c for c in ('real', 'fachada', 'pvpr', 'promo') if c in classes), '')
        lista.append({'i': gid, 'n': nome, 'm': base['marca'], 'q': qtd, 'c': base['cat'], 'img': img, 'v': v, 'o': o_out})
        with open(os.path.join(pasta, 'h', gid + '.json'), 'w') as f:
            json.dump(hist_g, f, separators=(',', ':'))
    # apaga históricos de produtos que já não aparecem
    for fn in os.listdir(os.path.join(pasta, 'h')):
        if fn.endswith('.json') and fn[:-5] not in todos_ids:
            os.remove(os.path.join(pasta, 'h', fn))

    # ---------- resumo ----------
    lojas_res = {}
    for loja in LOJAS:
        ofs = [o for g in lista for o in g['o'] if o['l'] == COD[loja]]
        lojas_res[COD[loja]] = {'nome': LOJAS[loja]['nome'], 'produtos': len(ofs),
                                'promos': sum(1 for o in ofs if o['v']), 'pvpr': sum(1 for o in ofs if any(m[0] == 'pvpr' for m in o['m']))}
    # Cabaz: produtos iguais à venda nas três lojas
    comuns = [g for g in lista if len({o['l'] for o in g['o']}) == 3]
    tot = {c: round(sum(o['p'] for g in comuns for o in g['o'] if o['l'] == c), 2) for c in 'cpa'}
    mn = min(tot.values()) if comuns else 0
    # Cabaz «sem promoções que enganam»: quantas vezes cada loja tem o preço mais baixo
    vence = {c: 0 for c in 'cpa'}
    for g in comuns:
        m = min(o['p'] for o in g['o'])
        for o in g['o']:
            if o['p'] <= m + 0.005:
                vence[o['l']] += 1
    promos = [o for g in lista for o in g['o'] if o['v']]
    poupanca = []  # diferença entre a loja mais cara e a mais barata no mesmo produto
    for g in lista:
        if len(g['o']) >= 2:
            ps = sorted(o['p'] for o in g['o'])
            poupanca.append((round(ps[-1] - ps[0], 2), round((ps[-1] - ps[0]) / ps[-1] * 100), g['i']))

    IMGPRE = ['https://www.continente.pt/dw/image/v2/BDVS_PRD/on/demandware.static/-/Sites-col-master-catalog/default/',
              'https://static.pingodoce.pt/dw/image/v2/BLJJ_PRD/on/demandware.static/-/Sites-pingo-doce-master/default/',
              'https://www.auchan.pt/dw/image/v2/BFRC_PRD/on/demandware.static/-/Sites-auchan-pt-master-catalog/default/']

    def cimg(u):
        for n, pre in enumerate(IMGPRE):
            if u.startswith(pre):
                return f'{n}|{u[len(pre):]}'
        return u

    def comp(g):
        """Formato compacto (o site descodifica): [id, nome, marca, qtd, categoria, imagem, veredito, ofertas]
        oferta: [loja, id, preço, preço/unidade, unidade, antes, pvpr, texto da promoção, veredito, motivos, url, dias de histórico]"""
        return [g['i'], g['n'], g['m'], g['q'], g['c'], cimg(g['img']), g['v'],
                [[o['l'], o['id'], o['p'], o['pu'], o['u'], o['a'], o['r'], o['t'], o['v'], o['m'], o['url'], o['d']] for o in g['o']]]

    def confirmado(g, so=None):
        """Todas as ofertas (ou as indicadas) têm preço por unidade na mesma unidade: o tamanho bate certo."""
        os_ = so or g['o']
        return all(o['pu'] for o in os_) and len({o['u'] for o in os_}) == 1

    reais = sorted((g for g in lista if g['v'] == 'real'),
                   key=lambda g: -max(((m[1] - o['p']) / m[1]) for o in g['o'] for m in o['m'] if m[0] == 'min30'))
    def fach_ok(g):
        for o in g['o']:
            for m in o['m']:
                if m[0] == 'outra':
                    outra = next((x for x in g['o'] if x['l'] == COD[m[1]]), None)
                    return bool(outra) and confirmado(g, [o, outra])
        return True
    fach = [g for g in lista if g['v'] == 'fachada' and fach_ok(g)]
    # mais claras primeiro: as que estão mais caras do que noutra loja, pela diferença em percentagem
    def peso_f(g):
        dif = max([(o['p'] - m[2]) / o['p'] for o in g['o'] for m in o['m'] if m[0] == 'outra'] or [0])
        return (-dif, -len(g['o']))
    fach.sort(key=peso_f)
    pv = sorted((g for g in lista if g['v'] == 'pvpr'),
                key=lambda g: -max((m[1] - o['p']) / m[1] for o in g['o'] for m in o['m'] if m[0] == 'pvpr'))
    por_id = {g['i']: g for g in lista}

    def variados(gs, n):
        """Os primeiros n, com no máximo 2 da mesma marca e 3 do mesmo tipo de produto (primeira palavra)."""
        out, marcas, tipos, cats = [], {}, {}, {}
        for g in gs:
            mk, tp, ct = norm(g['m']), norm(g['n']).split(' ')[0], norm(g['c'])
            if marcas.get(mk, 0) >= 2 or tipos.get(tp, 0) >= 3 or cats.get(ct, 0) >= 3:
                continue
            marcas[mk] = marcas.get(mk, 0) + 1
            tipos[tp] = tipos.get(tp, 0) + 1
            cats[ct] = cats.get(ct, 0) + 1
            out.append(g)
            if len(out) >= n:
                break
        return out
    difs = sorted((x for x in poupanca if x[0] >= 0.5 and confirmado(por_id[x[2]])), key=lambda x: (-x[1], -x[0]))
    contar = lambda c: sum(1 for o in promos if o['v'] == c)
    resumo = {
        'atualizado': agora.isoformat(timespec='minutes'), 'dia': hoje, 'img': IMGPRE,
        'base': {COD[l]: LOJAS[l]['base'] for l in LOJAS},
        'lojas': lojas_res, 'produtos': len(lista), 'ofertas': sum(len(g['o']) for g in lista),
        'iguais': sum(1 for g in lista if len(g['o']) >= 2), 'promos': len(promos),
        'pvpr': sum(1 for o in promos if any(m[0] == 'pvpr' for m in o['m'])),
        'outra': sum(1 for o in promos if any(m[0] == 'outra' for m in o['m'])),
        'classes': {c: contar(c) for c in ('real', 'fachada', 'pvpr', 'promo')},
        'cabaz': {'n': len(comuns), 'totais': tot, 'indice': {c: round(v / mn * 100) if mn else 0 for c, v in tot.items()}, 'vence': vence,
                  'dividir': round(sum(min(o['p'] for o in g['o']) for g in comuns), 2)},
        'dias_historico': db.execute('select count(distinct dia) from precos').fetchone()[0],
        'inicio_historico': db.execute('select min(dia) from precos').fetchone()[0],
        'diferenca': [comp(g) + [d, pc] for g, (d, pc) in
                      ((g, next((d, pc) for d, pc, i in difs if i == g['i'])) for g in variados([por_id[i] for d, pc, i in difs], 12))],
        'reais': [comp(g) for g in variados(reais, 12)],
        'fachada': [comp(g) for g in variados(fach, 12)],
        'pvpr_top': [comp(g) for g in variados(pv, 12)],
    }

    # Cabaz do essencial: se falhar, o resto da recolha segue (o administrador é avisado por alertas.py)
    try:
        resumo['essencial'] = cabaz.montar(prods, db, agora, tamanho)
        e = resumo['essencial']
        estado['essencial'] = {'artigos': e['n'], 'total': e['total_artigos'], 'faltam': e['faltam']}
    except Exception as ex:
        estado['essencial'] = {'erro': f'{type(ex).__name__}: {ex}'[:300]}

    def escrever(nome, obj):
        tmp = os.path.join(pasta, nome + '.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, os.path.join(pasta, nome))
    escrever('lista.json', {'dia': hoje, 'g': [comp(g) for g in lista]})
    escrever('resumo.json', resumo)
    estado['fim'] = datetime.now(ZoneInfo('Europe/Lisbon')).isoformat(timespec='seconds')
    estado['grupos'] = len(lista)
    escrever('estado.json', estado)
    db.close()
    print(json.dumps({k: resumo[k] for k in ('produtos', 'ofertas', 'iguais', 'promos', 'pvpr', 'outra', 'classes', 'cabaz')}, ensure_ascii=False))
    print(json.dumps(estado['lojas'], ensure_ascii=False))


if __name__ == '__main__':
    main()
