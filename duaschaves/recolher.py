#!/usr/bin/env python3
"""Duplicasa: recolhe anúncios públicos de arrendamento do Imovirtual (que inclui muitos da OLX),
do Supercasa e do Casa Sapo (duaschaves/fontes/). Cada site é lido em paralelo, cada um ao seu ritmo.

Só lê páginas que o robots.txt do site permite (resultados e anúncios), devagar (uma página de
2 em 2 segundos) e com um User-Agent que se identifica. NÃO recolhe contactos: as páginas de
contacto estão vedadas no robots.txt e os números são dados pessoais de quem anuncia.

Uso: python3 duaschaves/recolher.py sites/duaschaves/anuncios.json
Variáveis: PAGINAS (páginas por distrito e tipo, por omissão 2), MAX_DETALHES (anúncios novos
cuja página se abre para ler a descrição e as fotos, por omissão 80), MAX_VERIFICAR (anúncios que já
não aparecem nos resultados e cuja página se abre para confirmar se ainda existem, por omissão 60).

Remoção automática: um anúncio que aparece nos resultados está confirmado. Os que deixam de aparecer
ficam, mas a página deles é verificada aos poucos (os mais antigos primeiro): se der 404/410, se
redirecionar para fora do anúncio ou se o anúncio não estiver ativo, sai logo. Sem confirmação em
DIAS_MAX dias, sai também.
"""
import datetime, hashlib, html, json, os, re, sys, threading, time, unicodedata, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from condicoes import condicoes
from fontes import casasapo, iad, rentola, supercasa

BASE = 'https://www.imovirtual.com'
UA = 'Mozilla/5.0 (compatible; DuplicasaBot/0.1; +https://duplicasa.pt)'
DISTRITOS = ['lisboa', 'porto', 'setubal', 'braga', 'faro', 'coimbra', 'aveiro', 'leiria', 'santarem', 'viseu',
             'viana-do-castelo', 'vila-real', 'braganca', 'guarda', 'castelo-branco', 'portalegre', 'evora', 'beja',
             'ilha-da-madeira', 'ilha-de-sao-miguel', 'ilha-terceira']
GRANDES = {'lisboa', 'porto', 'setubal', 'braga', 'faro'}   # mais anúncios: lê mais páginas
TIPOS = ['apartamento', 'moradia', 'quarto']
NOME_TIPO = {'apartamento': 'Apartamento', 'moradia': 'Moradia', 'quarto': 'Quarto'}
PAGINAS = int(os.environ.get('PAGINAS', '4'))
PAGINAS_GRANDES = int(os.environ.get('PAGINAS_GRANDES', '12'))
MAX_DETALHES = int(os.environ.get('MAX_DETALHES', '150'))
MAX_ANUNCIOS = int(os.environ.get('MAX_ANUNCIOS', '9000'))
PAG_SUPER = int(os.environ.get('PAG_SUPER', '2'))           # páginas por distrito no Supercasa (5 nos grandes)
PAG_SUPER_GRANDES = int(os.environ.get('PAG_SUPER_GRANDES', '5'))
PAUSA_SUPER, PAUSA_SAPO, PAUSA_IAD = 5.0, 10.0, 4.0
PAG_RENTOLA, PAG_RENTOLA_GRANDES, PAUSA_RENTOLA = int(os.environ.get('PAG_RENTOLA', '3')), int(os.environ.get('PAG_RENTOLA_GRANDES', '10')), 4.0
PAG_IAD = int(os.environ.get('PAG_IAD', '10'))               # iad: ~30 anúncios por página, ~250 no total
IDADE_MAX_DIAS = int(os.environ.get('IDADE_MAX_DIAS', '60'))   # publicado há mais de 60 dias: quase de certeza já arrendado ou esquecido
TEMPO_FONTE = int(os.environ.get('TEMPO_FONTE', str(14 * 60)))   # cada site tem no máximo 14 min por volta (a volta toda tem de caber em 40)
DIAS_MAX_EXTRA = 7          # nos outros sites, um anúncio que deixa de aparecer nas páginas lidas sai ao fim de 7 dias
MAX_VERIFICAR_EXTRA = 30
MAX_RELER = int(os.environ.get('MAX_RELER', '80'))   # anúncios antigos relidos por volta (para caução, adiantadas, fiador)
MAX_VERIFICAR = int(os.environ.get('MAX_VERIFICAR', '60'))
DIAS_MAX = 7
MAX_DESC = 700      # a descrição completa fica no anúncio original; aqui só o essencial (ficheiro leve)
MAX_FOTOS = 8
PAUSA = 2.0
PRECO_MIN, PRECO_MAX = 100, 20000   # fora disto o preço é claramente falso: mostra-se «sob consulta»

pedidos = {'ok': 0, 'erro': 0}
ESTADO_FONTES = {}     # resumo de cada site nesta volta (fica no início de lista.json, para se ver de fora)


def obter(url, com_estado=False, pausa=None):
    """Devolve o HTML (ou None). Com com_estado=True devolve (estado, url_final, html):
    estado = código HTTP, ou 0 se a ligação falhou (não se sabe se o anúncio existe)."""
    time.sleep(PAUSA if pausa is None else pausa)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            pedidos['ok'] += 1
            texto = r.read().decode('utf-8', 'replace')
            return (r.status, r.geturl(), texto) if com_estado else texto
    except urllib.error.HTTPError as e:
        pedidos['erro'] += 1
        print(f'  {e.code} {url}', file=sys.stderr)
        return (e.code, url, None) if com_estado else None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        pedidos['erro'] += 1
        print(f'  falhou {url}: {e}', file=sys.stderr)
        return (0, url, None) if com_estado else None


def next_data(texto):
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', texto or '', re.S)
    return json.loads(m.group(1)) if m else None


def limpar_texto(t):
    t = re.sub(r'<br\s*/?>|</p>|</li>', '\n', t or '', flags=re.I)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n\s*\n+', '\n\n', t).strip()
    return t if len(t) <= MAX_DESC else t[:MAX_DESC].rsplit(' ', 1)[0] + '…'


def tipologia(titulo, quartos):
    m = re.search(r'\bT\s?(\d)\b', titulo or '', re.I)
    if m:
        return 'T' + m.group(1)
    n = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5, 'SIX': 6}.get(quartos or '')
    return f'T{n - 1}' if n else ''


def local(item):
    nomes = {}
    for loc in (((item.get('location') or {}).get('reverseGeocoding') or {}).get('locations') or []):
        nomes[loc.get('locationLevel')] = loc.get('name')
    return nomes.get('parish') or nomes.get('council') or '', nomes.get('council') or '', nomes.get('district') or ''


def preco_valido(item):
    if item.get('hidePrice'):
        return None
    v = (item.get('totalPrice') or {}).get('value')
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return int(round(v)) if PRECO_MIN <= v <= PRECO_MAX else None


def do_resultado(item, tipo):
    bairro, concelho, distrito = local(item)
    fotos = [i.get('medium') or i.get('large') for i in item.get('images') or [] if i]
    return {
        'id': 'imo-' + str(item['id']),
        'titulo': item.get('title') or '',
        'tip': '' if tipo == 'quarto' else tipologia(item.get('title'), item.get('roomsNumber')),
        'tipo': NOME_TIPO[tipo],
        'area': item.get('areaInSquareMeters'),
        'renda': preco_valido(item),
        'bairro': bairro, 'cidade': concelho, 'distrito': distrito,
        'fotos': [f for f in fotos if f][:MAX_FOTOS],
        'data': item.get('createdAtFirst') or item.get('dateCreated'),
        'particular': bool(item.get('isPrivateOwner')),
        'fonte': 'Imovirtual',
        'url': f"{BASE}/pt/anuncio/{item.get('slug')}",
        'desc': '',
    }


def detalhes(anuncio):
    d = next_data(obter(anuncio['url']))
    ad = (((d or {}).get('props') or {}).get('pageProps') or {}).get('ad')
    if not ad:
        return False
    completa = html.unescape(re.sub(r'<[^>]+>', ' ', ad.get('description') or ''))
    anuncio['desc'] = limpar_texto(ad.get('description'))
    anuncio.update(condicoes(completa))      # caução, rendas adiantadas e fiador lidos da descrição inteira
    anuncio['lido'] = 3                       # versão da leitura dos detalhes (3: caução «de igual valor» e caução sem valor)
    fotos = [i.get('medium') or i.get('large') for i in ad.get('images') or [] if i]
    if fotos:
        anuncio['fotos'] = [f for f in fotos if f][:MAX_FOTOS]
    for c in ad.get('characteristics') or []:
        if c.get('key') == 'floor_no' and c.get('localizedValue'):
            anuncio['andar'] = c['localizedValue']
        if c.get('key') == 'free_from' and re.fullmatch(r'\d{4}-\d{2}-\d{2}', c.get('value') or c.get('localizedValue') or ''):
            anuncio['livre'] = c.get('value') or c.get('localizedValue')
    return True


def ainda_existe(anuncio):
    """True = confirmado ativo, False = retirado, None = não se conseguiu saber."""
    estado, final, texto = obter(anuncio['url'], com_estado=True)
    if estado in (404, 410):
        return False
    if estado != 200 or texto is None:
        return None
    if '/pt/anuncio/' not in final:
        return False          # redirecionou para resultados: o anúncio saiu
    ad = ((((next_data(texto) or {}).get('props') or {}).get('pageProps') or {}).get('ad'))
    if not ad:
        return False
    st = str(ad.get('status') or '').lower()
    return st not in ('inactive', 'removed', 'expired', 'archived', 'outdated', 'closed', 'deleted', 'blocked', 'unpublished')


def norm(t):
    return unicodedata.normalize('NFD', (t or '').lower()).encode('ascii', 'ignore').decode().strip()


RE_QUARTO = re.compile(r'^(?:(?:arrenda-se|aluga-se|alugo|arrendo|aluguer de|para arrendar|disponivel|otimo|excelente|amplo|grande)\s+)?(?:um\s+|1\s+)?quartos?\b(?!\s*(?:apartamento|moradia|casa)\b)')


def tipo_real(a):
    """O site de origem às vezes classifica um quarto como moradia ou apartamento; o título diz a verdade."""
    t = norm(a.get('titulo') or '')
    if not t and a.get('desc'):
        t = norm(a['desc'][:120])
    if a.get('tipo') != 'Quarto' and RE_QUARTO.match(t):
        a['tipo'] = 'Quarto'
        a['tip'] = ''
        if a.get('area') and a['area'] > 40:
            a['area'] = None            # num quarto, a área anunciada costuma ser a da casa
    return a


def chave_igual(a):
    """O mesmo imóvel noutro site: mesma cidade, renda, área e tipologia."""
    if not (a.get('renda') and a.get('area')):
        return None
    return (norm(a.get('cidade')), a['renda'], a['area'], a.get('tip') or a.get('tipo'))


def correr_fonte(mod, paginas, pausa, resultado):
    """Lê as páginas de resultados de um site. Pára esse site se ele pedir para abrandar (429) ou bloquear (403)."""
    parados, n_pag, n_erros, n_lentos = set(), 0, 0, 0
    estados = {}
    t0 = time.time()
    for grupo, slug, url in paginas:
        if grupo in parados:
            continue
        if time.time() - t0 > TEMPO_FONTE:
            print(f'{mod.NOME}: tempo esgotado ({TEMPO_FONTE // 60} min); continua na próxima volta.')
            break
        estado, _, texto = obter(url, com_estado=True, pausa=pausa)
        n_pag += 1
        estados[str(estado)] = estados.get(str(estado), 0) + 1
        if estado in (429, 503) and n_lentos < 2:
            n_lentos += 1                            # pediu para abrandar: espera 90 s, abranda e tenta outra vez
            pausa *= 2
            print(f'{mod.NOME}: {estado}; espero 90 s e abrando para {pausa:.0f} s entre páginas.')
            time.sleep(90)
            estado, _, texto = obter(url, com_estado=True, pausa=pausa)
        if estado in (403, 429, 503):
            print(f'{mod.NOME}: {estado} em {url}; paro este site nesta volta.')
            break
        if estado in (404, 410):
            parados.add(grupo)
            continue
        if not texto:
            n_erros += 1
            if n_erros >= 5:
                break
            continue
        try:
            itens = mod.ler(texto, slug)
        except Exception as e:                       # a página mudou: não estraga a recolha dos outros sites
            print(f'{mod.NOME}: erro a ler {url}: {e}')
            itens = []
        novos = [a for a in itens if a['id'] not in resultado]
        for a in itens:
            resultado.setdefault(a['id'], a)
        if not novos:
            parados.add(grupo)                       # nada de novo nesta página: as seguintes do mesmo grupo também não terão
    print(f'{mod.NOME}: {len(resultado)} anúncios em {n_pag} páginas')
    ESTADO_FONTES[mod.NOME] = {'lidos': len(resultado), 'paginas': n_pag, 'estados': estados}


def paginas_super():
    for slug, url in supercasa.paginas(PAG_SUPER, PAG_SUPER_GRANDES):
        yield url.split('/pagina-')[0].split('?')[0], slug, url


def paginas_rentola():
    for cid, url in rentola.paginas(PAG_RENTOLA, PAG_RENTOLA_GRANDES):
        yield cid, cid, url


def paginas_iad():
    for slug, url in iad.paginas(PAG_IAD):
        yield 'arr', slug, url


CURSOR = {}     # onde ficou a leitura do Casa Sapo (ele só deixa ler poucas páginas de cada vez)


def paginas_sapo():
    """Começa nas primeiras páginas (as novidades) e depois continua onde ficou na volta anterior,
    para percorrer o site todo ao longo do dia sem pedir mais páginas de seguida do que ele aceita."""
    lst = casasapo.todas()
    for slug, p in lst[:3]:
        yield 'novas-' + slug, slug, casasapo.url_de(slug, p)
    k = CURSOR.get('sapo', 3)
    if k >= len(lst):
        k = 3
    for i in range(k, len(lst)):
        CURSOR['sapo_prox'] = i
        slug, p = lst[i]
        yield f'resto-{i}', slug, casasapo.url_de(slug, p)
    CURSOR['sapo_prox'] = 3


def ainda_existe_extra(a):
    estado, final, texto = obter(a['url'], com_estado=True, pausa=PAUSA_SUPER)
    if estado in (404, 410):
        return False
    if estado != 200 or texto is None:
        return None
    return final.split('?')[0].rstrip('/') == a['url'].split('?')[0].rstrip('/')


def parte(i):
    """Em que ficheiro det/NN.json fica o anúncio (o site calcula o mesmo: h = h*31 + código, 32 bits)."""
    h = 0
    for ch in i:
        h = (h * 31 + ord(ch)) & 0xffffffff
    return h % 64


def escrever_leves(saida, lista):
    """lista.json (o que a pesquisa precisa, leve para o telemóvel) e det/NN.json (descrição e fotos, por anúncio)."""
    pasta = os.path.dirname(os.path.abspath(saida))
    leve = []
    det = {}
    for a in lista:
        l = {k: v for k, v in a.items() if k not in ('desc', 'titulo', 'visto', 'lido', 'gid') and v not in (None, '', False, [])}
        l['fotos'] = (a.get('fotos') or [])[:3]
        if a.get('visto'):
            l['visto'] = a['visto']
        leve.append(l)
        k = parte(a['id'])
        det.setdefault(k, {})[a['id']] = {'desc': a.get('desc') or '', 'fotos': a.get('fotos') or [], 'titulo': a.get('titulo') or ''}
    os.makedirs(os.path.join(pasta, 'det'), exist_ok=True)
    for k in range(64):
        with open(os.path.join(pasta, 'det', f'{k}.json.tmp'), 'w', encoding='utf-8') as f:
            json.dump(det.get(k, {}), f, ensure_ascii=False, separators=(',', ':'))
        os.replace(os.path.join(pasta, 'det', f'{k}.json.tmp'), os.path.join(pasta, 'det', f'{k}.json'))
    with open(os.path.join(pasta, 'lista.json.tmp'), 'w', encoding='utf-8') as f:
        por_fonte = {}
        for a in lista:
            por_fonte[a.get('fonte')] = por_fonte.get(a.get('fonte'), 0) + 1
        json.dump({'atualizado': agora_iso(), 'det': 64, 'por_site': por_fonte, 'recolha': ESTADO_FONTES, 'anuncios': leve}, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(os.path.join(pasta, 'lista.json.tmp'), os.path.join(pasta, 'lista.json'))


def agora_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def main():
    saida = sys.argv[1]
    anterior = {}
    try:
        with open(saida, encoding='utf-8') as f:
            dados = json.load(f)
        anterior = {a['id']: a for a in dados.get('anuncios', [])}
        for a in anterior.values():          # ficheiros antigos ainda sem «visto»
            a.setdefault('visto', dados.get('atualizado') or '')
    except (OSError, ValueError):
        pass

    vistos = {}
    agora = agora_iso()
    f_cursor = os.path.join(os.path.dirname(os.path.abspath(saida)), 'cursor.json')
    try:
        CURSOR.update(json.load(open(f_cursor)))
    except (OSError, ValueError):
        pass
    # os outros sites correm em paralelo com o Imovirtual (servidores diferentes, cada um ao seu ritmo)
    extra = {'super': {}, 'sapo': {}, 'iad': {}, 'rent': {}}
    fios = [threading.Thread(target=correr_fonte, args=(supercasa, paginas_super(), PAUSA_SUPER, extra['super'])),
            threading.Thread(target=correr_fonte, args=(casasapo, paginas_sapo(), PAUSA_SAPO, extra['sapo'])),
            threading.Thread(target=correr_fonte, args=(iad, paginas_iad(), PAUSA_IAD, extra['iad'])),
            threading.Thread(target=correr_fonte, args=(rentola, paginas_rentola(), PAUSA_RENTOLA, extra['rent']))]
    if os.environ.get('SO_IMOVIRTUAL') != '1':
        for t in fios:
            t.start()
    for distrito in DISTRITOS:
        for tipo in TIPOS:
            for pagina in range(1, (PAGINAS_GRANDES if distrito in GRANDES else PAGINAS) + 1):
                url = f'{BASE}/pt/resultados/arrendar/{tipo}/{distrito}?by=LATEST&direction=DESC&page={pagina}'
                d = next_data(obter(url))
                itens = ((((d or {}).get('props') or {}).get('pageProps') or {}).get('data') or {}).get('searchAds', {}).get('items') or []
                novos_pag = sum(1 for it in itens if 'imo-' + str(it.get('id')) not in vistos)
                print(f'{distrito}/{tipo} p{pagina}: {len(itens)} anúncios ({novos_pag} novos)')
                if pagina > 1 and novos_pag == 0:
                    break
                for it in itens:
                    if it.get('transaction') != 'RENT' or not it.get('slug'):
                        continue
                    a = do_resultado(it, tipo)
                    a['visto'] = agora
                    vistos[a['id']] = a
                if not itens:
                    break

    if not vistos:
        print('Imovirtual: nenhum anúncio lido.', file=sys.stderr)

    # Descrição e fotos: reaproveita o que já se leu; abre só os anúncios novos (mais recentes primeiro)
    novos = []
    for a in vistos.values():
        if not a['id'].startswith('imo-'):
            continue
        velho = anterior.get(a['id'])
        if velho and velho.get('desc'):
            a['desc'] = velho['desc']
            a['fotos'] = velho.get('fotos') or a['fotos']
            for k in ('andar', 'caucao', 'adiantadas', 'fiador', 'livre', 'lido'):
                if velho.get(k):
                    a[k] = velho[k]
        else:
            novos.append(a)
    novos.sort(key=lambda a: a.get('data') or '', reverse=True)
    lidos = sum(1 for a in novos[:MAX_DETALHES] if detalhes(a))
    # anúncios já conhecidos mas lidos antes de haver caução/adiantadas/fiador: reler aos poucos, os mais recentes primeiro
    antigos = sorted((a for a in vistos.values() if a['id'].startswith('imo-') and a.get('desc') and a.get('lido') != 3), key=lambda a: a.get('data') or '', reverse=True)
    relidos = sum(1 for a in antigos[:MAX_RELER] if detalhes(a))
    print(f'Relidos para condições de entrada: {relidos} (faltam {max(0, len(antigos) - MAX_RELER)})')

    # Anúncios que já não aparecem nos resultados: verificar uma parte, os há mais tempo sem confirmação primeiro
    limite = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DIAS_MAX)).strftime('%Y-%m-%dT%H:%M:%SZ')
    fora = [a for i, a in anterior.items() if i not in vistos and i.startswith('imo-')]
    fora.sort(key=lambda a: a.get('visto') or '')
    retirados = expirados = confirmados = 0
    for n, a in enumerate(fora):
        if (a.get('visto') or '') < limite:
            expirados += 1
            continue
        if n < MAX_VERIFICAR:
            r = ainda_existe(a)
            if r is False:
                retirados += 1
                continue
            if r is True:
                a['visto'] = agora
                confirmados += 1
        vistos[a['id']] = a
    print(f'Fora dos resultados: {len(fora)} · retirados {retirados} · expirados {expirados} · confirmados {confirmados}')

    # Outros sites: juntar sem repetir o mesmo imóvel (mesmo id da Janela Digital, ou mesma cidade, renda, área e tipologia)
    for t in fios:
        if t.is_alive() or t.ident:
            t.join()
    if 'sapo_prox' in CURSOR:
        CURSOR['sapo'] = CURSOR.pop('sapo_prox')
        try:
            with open(f_cursor, 'w') as f:
                json.dump(CURSOR, f)
        except OSError:
            pass
    ja = {chave_igual(a) for a in vistos.values()} - {None}
    gids = set()
    fontes_antes = {re.sub(r'-.*', '', i) for i in anterior}
    n_extra = {}
    for pref, itens in (('super', extra['super']), ('sapo', extra['sapo']), ('iad', extra['iad']), ('rent', extra['rent'])):
        for a in itens.values():
            if a.get('gid') and a['gid'] in gids:
                continue
            k = chave_igual(a)
            if k and k in ja:
                continue
            velho = anterior.get(a['id'])
            if velho:
                a['data'] = velho.get('data')
            elif not a.get('data'):
                # data desconhecida: na 1.ª leitura de um site fica sem data; depois, conta a 1.ª vez que se viu
                a['data'] = agora if pref in fontes_antes else None
            a.update({k2: v for k2, v in condicoes(a.get('desc') or '').items() if v and not a.get(k2)})
            a['visto'] = agora
            vistos[a['id']] = a
            if not velho:
                n_extra[pref] = n_extra.get(pref, 0) + 1
            if a.get('gid'):
                gids.add(a['gid'])
            if k:
                ja.add(k)
    # anúncios dos outros sites que não apareceram agora: ficam até DIAS_MAX_EXTRA dias; alguns são verificados (Supercasa)
    limite_x = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DIAS_MAX_EXTRA)).strftime('%Y-%m-%dT%H:%M:%SZ')
    fora_x = sorted((a for i, a in anterior.items() if i not in vistos and not i.startswith('imo-')), key=lambda a: a.get('visto') or '')
    ret_x = 0
    ver_x = 0
    for a in fora_x:
        if (a.get('visto') or '') < limite_x:
            continue
        if a['id'].startswith('super-') and ver_x < MAX_VERIFICAR_EXTRA:
            ver_x += 1
            r = ainda_existe_extra(a)
            if r is False:
                ret_x += 1
                continue
            if r is True:
                a['visto'] = agora
        vistos[a['id']] = a
    print(f'Outros sites: novos nesta volta {n_extra} · fora dos resultados {len(fora_x)} · retirados {ret_x}')

    if not vistos:
        print('Nenhum anúncio lido: mantenho o ficheiro anterior.', file=sys.stderr)
        sys.exit(1)
    # Anúncios antigos demais: quem anuncia já não responde (casa arrendada ou anúncio esquecido). Saem.
    limite_idade = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=IDADE_MAX_DIAS)).strftime('%Y-%m-%dT%H:%M:%SZ')
    velhos = [i for i, a in vistos.items() if a.get('data') and a['data'][:19].replace(' ', 'T') + 'Z' < limite_idade]
    for i in velhos:
        del vistos[i]
    print(f'Publicados há mais de {IDADE_MAX_DIAS} dias (retirados): {len(velhos)}')
    # condições de entrada que faltem: tiradas da descrição guardada (até o anúncio ser relido por inteiro)
    for a in vistos.values():
        if a.get('desc'):
            cd = condicoes(a['desc'])
            for k in ('caucao', 'adiantadas', 'fiador'):
                if cd.get(k) and not a.get(k):
                    a[k] = cd[k]
    # tipo corrigido pelo título e o mesmo anúncio repetido (mesma cidade, renda, área, tipo e título) só uma vez
    for a in vistos.values():
        tipo_real(a)
    vistos_dup, apagar = {}, []
    for i, a in sorted(vistos.items(), key=lambda x: (-(len(x[1].get('fotos') or [])), x[1].get('data') or '')):
        k = chave_igual(a)
        if not k:
            continue
        k = k + (norm(a.get('titulo') or '')[:60],)
        if k in vistos_dup:
            apagar.append(i)
        else:
            vistos_dup[k] = i
    for i in apagar:
        del vistos[i]
    print(f'Repetidos retirados: {len(apagar)}')
    lista = sorted(vistos.values(), key=lambda a: a.get('data') or '', reverse=True)[:MAX_ANUNCIOS]
    def sem_visto(a):
        return {k: v for k, v in a.items() if k != 'visto'}
    meio_dia = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=12)).strftime('%Y-%m-%dT%H:%M:%SZ')
    visto_velho = any((anterior.get(a['id'], {}).get('visto') or '') < meio_dia for a in lista if a.get('visto') == agora)
    if not (retirados or confirmados or n_extra or visto_velho) and [a['id'] for a in lista] == list(anterior.keys()) and all(sem_visto(a) == sem_visto(anterior[a['id']]) for a in lista):
        print('Sem alterações.')
        if not os.path.exists(os.path.join(os.path.dirname(os.path.abspath(saida)), 'lista.json')):
            escrever_leves(saida, lista)
        return
    with open(saida + '.tmp', 'w', encoding='utf-8') as f:      # escreve ao lado e troca de uma vez (o site nunca lê meio ficheiro)
        json.dump({'atualizado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'anuncios': lista}, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(saida + '.tmp', saida)
    escrever_leves(saida, lista)
    por_fonte = {}
    for a in lista:
        por_fonte[a.get('fonte')] = por_fonte.get(a.get('fonte'), 0) + 1
    print(f'Por site: {por_fonte}')
    sem_preco = sum(1 for a in lista if a['renda'] is None)
    print(f'Guardados {len(lista)} anúncios ({len(novos)} novos, {lidos} com descrição lida agora, '
          f'{sem_preco} com preço sob consulta). Pedidos: {pedidos}')


if __name__ == '__main__':
    main()
