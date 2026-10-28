#!/usr/bin/env python3
"""Duas Chaves: recolhe anúncios públicos de arrendamento do Imovirtual (que inclui muitos da OLX).

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
import datetime, html, json, os, re, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from condicoes import condicoes

BASE = 'https://www.imovirtual.com'
UA = 'Mozilla/5.0 (compatible; DuasChavesBot/0.1; +https://duaschaves.pt)'
DISTRITOS = ['lisboa', 'porto', 'setubal', 'braga', 'faro', 'coimbra', 'aveiro', 'leiria', 'santarem', 'viseu',
             'viana-do-castelo', 'vila-real', 'braganca', 'guarda', 'castelo-branco', 'portalegre', 'evora', 'beja',
             'ilha-da-madeira', 'ilha-de-sao-miguel', 'ilha-terceira']
GRANDES = {'lisboa', 'porto', 'setubal', 'braga', 'faro'}   # mais anúncios: lê mais páginas
TIPOS = ['apartamento', 'moradia', 'quarto']
NOME_TIPO = {'apartamento': 'Apartamento', 'moradia': 'Moradia', 'quarto': 'Quarto'}
PAGINAS = int(os.environ.get('PAGINAS', '2'))
PAGINAS_GRANDES = int(os.environ.get('PAGINAS_GRANDES', '5'))
MAX_DETALHES = int(os.environ.get('MAX_DETALHES', '80'))
MAX_ANUNCIOS = 3000
MAX_RELER = int(os.environ.get('MAX_RELER', '40'))   # anúncios antigos relidos por volta (para caução, adiantadas, fiador)
MAX_VERIFICAR = int(os.environ.get('MAX_VERIFICAR', '60'))
DIAS_MAX = 7
MAX_DESC = 700      # a descrição completa fica no anúncio original; aqui só o essencial (ficheiro leve)
MAX_FOTOS = 8
PAUSA = 2.0
PRECO_MIN, PRECO_MAX = 100, 20000   # fora disto o preço é claramente falso: mostra-se «sob consulta»

pedidos = {'ok': 0, 'erro': 0}


def obter(url, com_estado=False):
    """Devolve o HTML (ou None). Com com_estado=True devolve (estado, url_final, html):
    estado = código HTTP, ou 0 se a ligação falhou (não se sabe se o anúncio existe)."""
    time.sleep(PAUSA)
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
    anuncio['lido'] = 2                       # versão da leitura dos detalhes
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
        print('Nenhum anúncio lido: mantenho o ficheiro anterior.', file=sys.stderr)
        sys.exit(1)

    # Descrição e fotos: reaproveita o que já se leu; abre só os anúncios novos (mais recentes primeiro)
    novos = []
    for a in vistos.values():
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
    antigos = sorted((a for a in vistos.values() if a.get('desc') and a.get('lido') != 2), key=lambda a: a.get('data') or '', reverse=True)
    relidos = sum(1 for a in antigos[:MAX_RELER] if detalhes(a))
    print(f'Relidos para condições de entrada: {relidos} (faltam {max(0, len(antigos) - MAX_RELER)})')

    # Anúncios que já não aparecem nos resultados: verificar uma parte, os há mais tempo sem confirmação primeiro
    limite = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DIAS_MAX)).strftime('%Y-%m-%dT%H:%M:%SZ')
    fora = [a for i, a in anterior.items() if i not in vistos]
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

    lista = sorted(vistos.values(), key=lambda a: a.get('data') or '', reverse=True)[:MAX_ANUNCIOS]
    def sem_visto(a):
        return {k: v for k, v in a.items() if k != 'visto'}
    if not (retirados or confirmados) and [a['id'] for a in lista] == list(anterior.keys()) and all(sem_visto(a) == sem_visto(anterior[a['id']]) for a in lista):
        print('Sem alterações.')
        return
    with open(saida, 'w', encoding='utf-8') as f:
        json.dump({'atualizado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'anuncios': lista}, f, ensure_ascii=False, separators=(',', ':'))
    sem_preco = sum(1 for a in lista if a['renda'] is None)
    print(f'Guardados {len(lista)} anúncios ({len(novos)} novos, {lidos} com descrição lida agora, '
          f'{sem_preco} com preço sob consulta). Pedidos: {pedidos}')


if __name__ == '__main__':
    main()
