#!/usr/bin/env python3
"""caiu.pt — luz e gás: as ofertas de todos os comercializadores, atualizadas sozinhas todos os dias.

Uso: python3 energia.py <pasta_dados> [--estado <pasta_privada>] [--fixtures <pasta>] [--sem-rede]

Fontes (só leitura, um pedido de cada vez):
  ERSE      ficheiro com todas as ofertas comerciais (os comercializadores são obrigados a enviá-las) e o simulador
            oficial, que serve para tirar as tarifas de acesso às redes e confirmar, oferta a oferta, as nossas contas;
  Galp      tabelas de preços COMBINA e Casa & Estrada (estes planos não estão no ficheiro da ERSE);
  parcerias páginas oficiais de cada parceria (energia_vantagens.json): só contam se a página ainda o disser.

Escreve:
  <dados>/energia.json                ofertas, parâmetros e vantagens que o site usa (o cálculo é feito no telemóvel)
  <dados>/energia-estado.json         como correu (fontes, contas confirmadas, avisos)
  <dados>/energia-paginas/luz-e-gas/index.html  página /luz-e-gas/ (o Caddy serve-a; paginas.py põe-na no sitemap)
  <estado>/energia.db                 histórico diário (preço de cada oferta nos casos tipo)
  <estado>/erse/<data>.zip, galp/*.pdf  ficheiros originais

O cálculo é o de sites/caiu/energia-calc.js (o mesmo do site), chamado aqui com o node.
Se uma fonte falhar, fica a última versão boa e o estado diz há quanto tempo.
"""
import csv, gzip, hashlib, html, io, json, os, re, shutil, sqlite3, subprocess, sys, time, unicodedata, urllib.parse, urllib.request, zipfile
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
CALC = os.path.join(RAIZ, 'sites', 'caiu', 'energia-calc.js')
CLI = os.path.join(AQUI, 'energia_cli.js')
VANT = os.path.join(AQUI, 'energia_vantagens.json')
LX = ZoneInfo('Europe/Lisbon')
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
ERSE = 'https://simuladorprecos.erse.pt'
NODE = shutil.which('node') or '/usr/bin/node'
PAUSA = float(os.environ.get('CAIU_PAUSA', '2'))

POTENCIAS = ['1,15', '2,3', '3,45', '4,6', '5,75', '6,9', '10,35', '13,8', '17,25', '20,7']
ORD_GAS = {'Lisboagás': 'LIS', 'REN PORTGÁS': 'REN', 'Beiragás': 'BEI', 'Lusitâniagás': 'LUS', 'Tagusgás': 'TAG',
           'Setgás': 'SET', 'Sonorgás': 'SON', 'Medigás': 'MED', 'Dianagás': 'DIA', 'Paxgás': 'PAX', 'Duriensegás': 'DUR'}
NOMES = {'EDPC': 'EDP', 'END': 'Endesa', 'IBD': 'Iberdrola', 'GOLD': 'Goldenergy', 'REPSOL': 'Repsol', 'GALP': 'Galp',
         'ENIPLENITUDE': 'Plenitude', 'MEOENERGIA': 'MEO Energia', 'TUR': 'SU Eletricidade (regulado)',
         'CUR': 'Mercado regulado (gás)', 'NABALIAENERGIA': 'Nabalia', 'AUDAX': 'Audax', 'ALFAENERGIA': 'Alfa Energia',
         'DOUROGAS': 'Dourogás', 'EZUENERGIA': 'EZU Energia', 'LUZBOA': 'Luzboa', 'NOSSAENERGIA': 'Nossa Energia',
         'JAFPLUS': 'JAF Plus', 'LUZIGAS': 'Luzigás', 'ACCIONA': 'Acciona', 'AXPO': 'Axpo', 'LOGICA': 'Logica Energy',
         'OENEO': 'Oeneo', 'PORTULOGOS': 'Portulogos', 'YESENERGY': 'YES Energy', 'ZUG POWER': 'Zug Power',
         'COOP': 'Coopérnico', 'ELERGONE': 'Elergone', 'G9': 'G9 Energy', 'MUON': 'Muon', 'PLENITUDE': 'Plenitude'}

# Parâmetros por omissão (2026). As tarifas de acesso são confirmadas todos os dias no simulador da ERSE.
PARAM = {'iva': 0.23, 'iva_red': 0.06, 'lim6': 200, 'lim6_fn': 300, 'iec': 0.001, 'cav': 2.85,
         'tar_tf_kva': 0.0498, 'tar_tv': 0.0607, 'gas_iec': 0.01525, 'gas_tar_tf': [0.01589, 0.05148, 0.08595, 0.14573],
         'kwh_m3': 11.667}

# Condições que limitam quem pode contratar (texto da ERSE -> o que a pessoa tem de ter)
CONDICOES = [
    ('vodafone', r'vodafone'), ('meo', r'\bMEO\b.*(M4|M5)|M4e|M5e'), ('santander', r'santander'),
    ('acp', r'\bACP\b'), ('parceiro_repsol', r'FC Porto|Sporting|Benfica|Interpass|AGEAS|Seguro Direct'),
    ('amigo', r'plano\s*amigo|c[óo]digo.*amigo|\bamigo\b'), ('pingodoce', r'pingo doce'), ('coop', r'coop[ée]rnico|cooperant'),
    ('jovem', r'jovem|35 anos'), ('ve', r've[íi]culo el[ée]trico|mobilidade el[ée]trica|charger|\bVE\d*\b'),
    ('empresa', r'empresa|neg[óo]cio|n[ãa]o dom[ée]stic'),
]
REQ_NOMES = {'vodafone': 'cliente Vodafone', 'meo': 'pacote MEO M4e ou M5e', 'santander': 'cliente Santander',
             'acp': 'sócio do ACP', 'parceiro_repsol': 'sócio do FC Porto, Sporting, Benfica, Interpass, Ageas ou Seguro Directo',
             'amigo': 'código de amigo de um cliente', 'pingodoce': 'app O Meu Pingo Doce', 'coop': 'cooperante da Coopérnico',
             'jovem': 'até 35 anos', 've': 'carro elétrico', 'empresa': 'empresas', 'outra': 'condição especial'}


def agora():
    return datetime.now(LX)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def norm(t):
    return unicodedata.normalize('NFD', (t or '').lower()).encode('ascii', 'ignore').decode()


def ler(url, dados=None, cab=None, maximo=60_000_000, tentativas=3):
    sp = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit((sp.scheme, sp.netloc, urllib.parse.quote(urllib.parse.unquote(sp.path)), sp.query, ''))
    h = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'pt-PT,pt;q=0.9', 'Accept-Encoding': 'gzip'}
    h.update(cab or {})
    err = None
    for i in range(tentativas):
        try:
            r = urllib.request.Request(url, data=dados, headers=h, method='POST' if dados else 'GET')
            with urllib.request.urlopen(r, timeout=90) as f:
                b = f.read(maximo)
                if f.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
                return f.status, b
        except urllib.error.HTTPError as e:
            if e.code in (403, 404, 410):
                return e.code, b''
            err = e.code
        except Exception as e:
            err = type(e).__name__
        time.sleep(4 * (i + 1))
    return err, b''


def f(x):
    """'0,1604' / '2E-05' / '' -> float (0 quando vazio)"""
    x = (x or '').strip().replace(',', '.')
    try:
        return float(x)
    except ValueError:
        return 0.0


def limpo(t, n=None):
    t = re.sub(r'\s+', ' ', (t or '').replace('\xa0', ' ')).strip(' -;')
    if n and len(t) > n:
        t = t[:n].rsplit(' ', 1)[0] + '…'
    return t


def link(u):
    u = (u or '').strip()
    if not u or u in ('NA', '-'):
        return ''
    if not u.startswith('http'):
        u = 'https://' + u.lstrip('/')
    return u


# ---------------------------------------------------------------- ERSE: ficheiro das ofertas
def erse_ficheiro(estado, fixtures=None):
    """Descarrega (ou lê das fixtures) o zip mais recente da ERSE. Devolve (nome, bytes) ou (None, None)."""
    pasta = os.path.join(estado, 'erse')
    os.makedirs(pasta, exist_ok=True)
    if fixtures:
        p = os.path.join(fixtures, 'erse.zip')
        return ('fixtures', open(p, 'rb').read()) if os.path.exists(p) else (None, None)
    s, b = ler(ERSE + '/config/Settings.json')
    caminho = None
    if s == 200:
        try:
            caminho = json.loads(b.decode('utf-8-sig')).get('csvPath')
        except ValueError:
            pass
    if caminho:
        nome = re.sub(r'[^\w.]+', '_', os.path.basename(urllib.parse.unquote(caminho)))
        local = os.path.join(pasta, nome)
        if os.path.exists(local) and os.path.getsize(local) > 10_000:
            return nome, open(local, 'rb').read()
        s, b = ler(caminho)
        if s == 200 and b[:2] == b'PK':
            open(local + '.tmp', 'wb').write(b)
            os.replace(local + '.tmp', local)
            return nome, b
        log('ERSE: zip falhou', s)
    # sem rede ou ERSE em baixo: o último que temos
    zs = sorted(x for x in os.listdir(pasta) if x.endswith('.zip'))
    if zs:
        return zs[-1], open(os.path.join(pasta, zs[-1]), 'rb').read()
    return None, None


def ler_csvs(zbytes):
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    out = {}
    for i in z.infolist():
        base = i.filename.replace('\\', '/').split('/')[-1].lower()
        txt = z.read(i).decode('utf-8-sig', 'replace')
        linhas = list(csv.DictReader(io.StringIO(txt), delimiter=';'))
        if base.startswith('cond'):
            out['cond'] = linhas
        elif base.startswith('precos'):
            out['precos'] = linhas
    if 'cond' not in out or 'precos' not in out:
        raise ValueError('zip da ERSE sem CondComerciais/Precos')
    return out['cond'], out['precos']


def condicoes(r):
    """Etiquetas do que a pessoa tem de ter para contratar (vazio = qualquer pessoa)."""
    txt = ' '.join([r.get('NomeProposta', ''), r.get('TxTRestricoesAdic', ''), r.get('Detalhe restrições', '')])
    tags = []
    if r.get('FiltroRestrições') == 'S' or re.search(r'\bamigo\b|parceria|vodafone|santander|\bACP\b|L.Or[ée]al', txt, re.I):
        for tag, rx in CONDICOES:
            if re.search(rx, txt, re.I):
                tags.append(tag)
        if r.get('FiltroRestrições') == 'S' and not tags:
            # condições que não limitam ninguém em especial (ex.: escalões, contratar pelo Poupa Energia)
            if not re.search(r'escal[ãa]o|consumos? inferior|pot[êe]ncias? entre|poupa energia|d[ée]bito direto|fatura digital', txt, re.I):
                tags.append('outra')
    return sorted(set(tags))


def temporario(r):
    t = ' '.join([r.get('TxTOferta', ''), r.get('TxTReembolsos', '')])
    return bool(re.search(r'primeiros? (12|doze|6|seis|24) meses|durante (um per[íi]odo de )?(12|6|24) meses|nos primeiros \d+ meses', t, re.I))


def campanha_fixa(r):
    """O «ReembFixo» da ERSE é uma oferta de boas-vindas (não se repete no 2.º ano)?"""
    t = norm(r.get('TxTReembolsos', '') + ' ' + r.get('DetalheOutrosDesc/benefi', ''))
    if re.search(r'para sempre|todos os meses|mensalmente|permanente', t) and not re.search(r'boas.vindas|oferta de \d', t):
        return False
    return bool(re.search(r'boas.vindas|oferta de|adesao|primeir|novo cliente|amigo', t))


def combustivel(r):
    """Saldo garantido em combustível (cênt./l) descrito pela ERSE, ex.: Repsol «até 20 cênt./l (15 cênt./l em saldo)»."""
    t = ' '.join([r.get('TxTReembolsos', ''), r.get('DetalheOutrosDesc/benefi', ''), r.get('TxTOferta', '')])
    m = re.search(r'at[ée] (\d+(?:[.,]\d+)?) c[êe]nt\.?/l[^()]{0,80}\((\d+(?:[.,]\d+)?) c[êe]nt\.?/l em saldo', t, re.I)
    if m:
        return f(m.group(2)) / 100, f(m.group(1)) / 100
    return None


def credito_fatura(r):
    """Crédito em percentagem da fatura com limite mensal (ex.: EDP + Pingo Doce: 10 % até 10 € por mês)."""
    t = r.get('TxTOferta', '') + ' ' + r.get('TxTReembolsos', '')
    m = re.search(r'cr[ée]dito de (\d+(?:[.,]\d+)?) ?% do valor da fatura.{0,160}?limite m[áa]ximo de (\d+(?:[.,]\d+)?) ?€ por m[êe]s', t, re.I | re.S)
    if m:
        return f(m.group(1)) / 100, f(m.group(2))
    return None


def montar_erse(cond, precos):
    """Ofertas no formato compacto do site."""
    por_cod = {}
    for p in precos:
        por_cod.setdefault(p['COD_Proposta'], []).append(p)
    hoje = agora().date()
    ofertas, coms = [], {}
    for r in cond:
        com, cod = r['COM'].strip(), r['COD_Proposta'].strip()
        if com in ('U1',) or r.get('Segmento') == 'Ndom':
            continue
        forn = r.get('Fornecimento')
        t = {'ELE': 'E', 'GN': 'G', 'DUAL': 'D'}.get(forn)
        if not t:
            continue
        fim = r.get('Data fim', '').strip()
        if fim:
            try:
                if datetime.strptime(fim, '%d/%m/%Y').date() < hoje:
                    continue
            except ValueError:
                pass
        of = {'id': cod, 'com': com, 'n': limpo(r['NomeProposta']), 't': t}
        req = condicoes(r)
        if 'empresa' in req:
            continue
        if req:
            of['req'] = req
        fl = lambda k: r.get(k, '')
        if fl('FiltroPagamento') == '100':
            of['dd'] = 1
        if fl('Filtrofaturacao') == '10':
            of['fe'] = 1
        if fl('FiltroNovosClientes') == 'S':
            of['novos'] = 1
        if fl('FiltroFidelização') == 'S':
            of['fid'] = 1
        if fl('FiltroPrecosIndex_ELE') == 'S' or re.search(r'index', of['n'], re.I):
            of['idx'] = 1
        if fl('FiltroRenovavel_ELE') == 'S':
            of['ren'] = 1
        if temporario(r):
            of['tmp'] = 1
        srv = f(fl('CustoServicos_s/IVA (€/ano)'))
        if srv:
            of['srv'] = round(srv, 4)
            srvc = f(fl('CustoServicos_c/IVA (€/ano)'))
            if srvc:
                of['srvc'] = round(srvc, 4)
        for k, ck in [('rf', 'ReembFixo (€/ano)'), ('rtf', 'ReembTF_ELE (%)'), ('rtw', 'ReembTW_ELE (%)'), ('rw', 'ReembW_ELE (€/kWh)'),
                      ('rgtf', 'ReembTF_GN (%)'), ('rgtw', 'ReembTW_GN (%)'), ('rgw', 'ReembW_GN (€/kWh)'),
                      ('nc', 'DescontNovoCliente_c/IVA (€/ano)'), ('nctf', 'Desc. TF_ELE (%) - Novo Cliente'),
                      ('nctw', 'Desc. TW_ELE (%) - Novo Cliente'), ('ncw', 'Desc. W_ELE (€/kWh) - Novo Cliente'),
                      ('ncgtf', 'Desc. TF_GN (%) - Novo Cliente'), ('ncgtw', 'Desc. TW_GN (%) - Novo Cliente'),
                      ('ncgw', 'Desc. W_GN (€/kWh) - Novo Cliente')]:
            v = f(fl(ck))
            if v:
                of[k] = round(v, 6)
        if of.get('rf') and campanha_fixa(r):
            of['rfc'] = 1
        cb = combustivel(r)
        if cb:
            of['cpl'], of['cpl_ate'] = round(cb[0], 3), round(cb[1], 3)
        cf = credito_fatura(r)
        if cf:
            of['credito'] = [cf[0], cf[1]]
        of['url'] = link(fl('LinkOfertaCom')) or link(fl('LinkCOM'))
        ficha = link(fl('LinkFichaPadrao'))
        if ficha:
            of['ficha'] = ficha
        of['txt'] = limpo(fl('TxTOferta'), 420)
        extra = limpo(fl('TxTReembolsos'), 260)
        if extra and norm(extra[:60]) not in norm(fl('TxTOferta')):
            of['txt2'] = extra
        if fl('Data ini'):
            of['ini'] = fl('Data ini')
        if fim:
            of['fim'] = fim
        # preços
        linhas = por_cod.get(cod, [])
        if com == 'CUR':   # gás regulado: um preço por operador da rede
            linhas = [p for p in precos if p['COM'].startswith('CUR') and p['ORD']]
        e, g, go = {}, {}, {}
        for p in linhas:
            if p.get('Pot_Cont') and p.get('Contagem') and t in ('E', 'D'):
                kva = p['Pot_Cont'].strip()
                c = int(p['Contagem'])
                tf = f(p['TF'])
                tvs = [f(p['TV|TVFV|TVP']), f(p['TVV|TVC']), f(p['TVVz'])][:c]
                if kva in POTENCIAS and tf > 0 and all(x > 0 for x in tvs):
                    e.setdefault(kva, {})[c] = [round(tf, 6)] + [round(x, 6) for x in tvs]
            if p.get('Escalao') and t in ('G', 'D'):
                esc = int(p['Escalao'])
                tf, tv = f(p['TFGN']), f(p['TVGN'])
                if tf > 0 and tv > 0:
                    if p.get('ORD'):
                        go.setdefault(p['ORD'], {})[esc] = [round(tf, 6), round(tv, 6)]
                    else:
                        g[esc] = [round(tf, 6), round(tv, 6)]
        if t in ('E', 'D') and not e:
            continue
        if t in ('G', 'D') and not (g or go):
            continue
        if e:
            of['e'] = e
        if g:
            of['g'] = g
        if go:
            of['go'] = go
        ofertas.append(of)
        coms[com] = {'n': NOMES.get(com, com.title()), 'url': link(fl('LinkCOM')) or of['url'], 'tel': fl('ContactoComercialTel').strip()}
    return ofertas, coms


# ---------------------------------------------------------------- Galp (COMBINA e Casa & Estrada)
GALP_PDF = 'https://www.galp.com/pt/casa/system/files/{a}-{m:02d}/galp-plano-{plano}-tabela-precos-descontos-{m:02d}{a2}.pdf'


def galp_pdf(plano, estado, fixtures=None):
    """Tabela mais recente publicada (procura de este mês para trás). Devolve (url, texto) ou (None, None)."""
    pasta = os.path.join(estado, 'galp')
    os.makedirs(pasta, exist_ok=True)
    if fixtures:
        p = os.path.join(fixtures, 'galp-%s.txt' % plano)
        return ('fixtures', open(p, encoding='utf-8').read()) if os.path.exists(p) else (None, None)
    d = agora().date().replace(day=1)
    for i in range(10):
        a, m = d.year, d.month
        url = GALP_PDF.format(a=a, m=m, a2=str(a)[2:], plano=plano)
        local = os.path.join(pasta, os.path.basename(url))
        if os.path.exists(local):
            b = open(local, 'rb').read()
        else:
            s, b = ler(url, tentativas=1)
            time.sleep(PAUSA)
            if s != 200 or not b.startswith(b'%PDF'):
                b = None
            else:
                open(local, 'wb').write(b)
        if b:
            txt = pdf_texto(local)
            if txt:
                return url, txt
        d = (d - timedelta(days=1)).replace(day=1)
    return None, None


def pdf_texto(caminho):
    exe = shutil.which('pdftotext')
    if not exe:
        log('falta o pdftotext (poppler-utils)')
        return None
    try:
        return subprocess.run([exe, '-layout', caminho, '-'], capture_output=True, timeout=60).stdout.decode('utf-8', 'replace')
    except Exception as e:
        log('pdftotext falhou', e)
        return None


def nums(linha):
    return [f(x) for x in re.findall(r'\d+,\d+', linha)]


def galp_tabela(txt):
    """Preços base (sem descontos) da tabela COMBINA: eletricidade por potência e gás por escalão."""
    e, g = {}, {}
    for ln in txt.splitlines():
        v = nums(ln)
        if len(v) == 5 and 1 <= v[0] <= 20.7 and v[1] < 3:          # kVA, €/dia, simples, fora de vazio, vazio
            kva = ('%g' % v[0]).replace('.', ',')
            if kva in POTENCIAS:
                e[kva] = {1: [v[1], v[2]], 2: [v[1], v[3], v[4]]}
        m = re.search(r'([1-4])º escal[ãa]o', ln)
        if m and len(v) >= 2:
            g[int(m.group(1))] = [v[-2], v[-1]]
    m = re.search(r'em vigor a partir de (\d{1,2}) de (\w+) de(?: de)? (\d{4})', txt, re.I)
    vigor = None
    if m:
        meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
        try:
            vigor = date(int(m.group(3)), meses.index(m.group(2).lower()) + 1, int(m.group(1))).isoformat()
        except ValueError:
            pass
    m = re.search(r'ades[õo]es at[ée] (\d{1,2}) de (\w+) (?:de )?(\d{4})', txt, re.I)
    ate = None
    if m:
        meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
        try:
            ate = date(int(m.group(3)), meses.index(m.group(2).lower()) + 1, int(m.group(1))).isoformat()
        except ValueError:
            pass
    return e, g, vigor, ate


def galp_combina_niveis(txt):
    """Níveis COMBINA: cênt./l e % no Continente (1, 2 e 3 serviços) e limites."""
    t = re.sub(r'\s+', ' ', txt)
    m = re.search(r'(\d{2})\s+(\d{2})\s+(\d{2})\s+Desconto em\s+Combust', t)
    cpl = [int(m.group(i)) / 100 for i in (1, 2, 3)] if m else None
    m = re.search(r'(\d{1,2})%\s+(\d{1,2})%\s+(\d{1,2})%', t)
    pct = [int(m.group(i)) / 100 for i in (1, 2, 3)] if m else None
    m1 = re.search(r'at[ée] ao max de (\d+)€/m[êe]s', t)
    m2 = re.search(r'at[ée] ao max de (\d+)l/m[êe]s', t)
    if not (cpl and pct):
        return None
    return {'niveis': [{'cpl': cpl[i], 'continente': pct[i]} for i in range(3)],
            'limites': {'continente_mes': int(m1.group(1)) if m1 else 450, 'litros_mes': int(m2.group(1)) if m2 else 250}}


def galp_casa_estrada(txt):
    """Descontos Casa & Estrada (1 e 2 energias, sem e com débito direto) e cashback em combustível."""
    t = re.sub(r'\s+', ' ', txt)
    d = {}
    m = re.search(r'1 energia – sem DD \((\d+)%\).*?com DD \((\d+)%\)', t)
    if m:
        d['1'] = [int(m.group(1)) / 100, int(m.group(2)) / 100]
    m = re.search(r'2 energias – sem DD \((\d+)%\).*?com DD \((\d+)%\)', t)
    if m:
        d['2'] = [int(m.group(1)) / 100, int(m.group(2)) / 100]
    m = re.search(r'Desconto de (\d+) c[êe]nt/litro em cashback', t)
    cpl = int(m.group(1)) / 100 if m else None
    m = re.search(r'(\d+) litros por m[êe]s', t)
    lim = int(m.group(1)) if m else 250
    return (d if len(d) == 2 else None), cpl, lim


def montar_galp(estado, fixtures=None):
    """Ofertas Galp que não estão no ficheiro da ERSE, a partir das tabelas oficiais. Devolve (ofertas, fontes, regras)."""
    ofertas, fontes, regras = [], {}, {}
    u, txt = galp_pdf('combina', estado, fixtures)
    if not txt:
        return ofertas, fontes, regras
    e, g, vigor, ate = galp_tabela(txt)
    niveis = galp_combina_niveis(txt)
    if len(e) < 8 or len(g) < 4 or not niveis:
        log('Galp COMBINA: tabela por ler (%d potências, %d escalões)' % (len(e), len(g)))
        return ofertas, fontes, regras
    fontes['combina'] = {'url': u, 'vigor': vigor, 'ate': ate}
    regras['combina'] = niveis
    url_c = 'https://www.galp.com/pt/energias/pt/combina'
    txt_c = ('Preços da tabela COMBINA da Galp' + (f' em vigor desde {data_curta(vigor)}' if vigor else '') +
             '. Benefícios em saldo no Cartão Continente: desconto nas compras do Continente e em combustível Galp, '
             'conforme o número de serviços COMBINA (luz, gás, solar Galp e pacote NOS com TV).')
    for t, sufixo, nome in [('E', 'E', 'COMBINA Eletricidade'), ('G', 'G', 'COMBINA Gás Natural'), ('D', 'D', 'COMBINA Eletricidade e Gás')]:
        of = {'id': 'GALP_COMBINA_' + sufixo, 'com': 'GALP', 'n': nome, 't': t, 'url': url_c, 'txt': txt_c, 'fonte': 'galp'}
        if t in ('E', 'D'):
            of['e'] = e
        if t in ('G', 'D'):
            of['g'] = g
        ofertas.append(of)
    u2, txt2 = galp_pdf('casa-estrada', estado, fixtures)
    if txt2:
        desc, cpl, lim = galp_casa_estrada(txt2)
        _, _, vigor2, ate2 = galp_tabela(txt2)
        base_e, base_g = e, g
        igual = galp_base_igual(txt2, e, g)
        if not igual:
            log('Galp Casa & Estrada: preço base diferente do COMBINA, fica de fora')
        if desc and igual:
            fontes['casa_estrada'] = {'url': u2, 'vigor': vigor2, 'ate': ate2}
            regras['casa_estrada'] = {'cpl': cpl, 'litros_mes': lim}
            url_ce = 'https://www.galp.com/pt/casa/planos-eletricidade-e-gas/casa-estrada/contrato-luz-online'
            for t, sufixo, nome, n_en in [('E', 'E', 'Casa & Estrada Eletricidade', '1'), ('G', 'G', 'Casa & Estrada Gás Natural', '1'),
                                           ('D', 'D', 'Casa & Estrada Eletricidade e Gás', '2')]:
                for dd in (0, 1):
                    pct = desc[n_en][dd]
                    k = lambda x: round(x * (1 - pct), 4)
                    of = {'id': 'GALP_CE_%s%s' % (sufixo, '_DD' if dd else ''), 'com': 'GALP',
                          'n': nome + (' (débito direto)' if dd else ''), 't': t, 'url': url_ce, 'tmp': 1, 'fonte': 'galp',
                          'txt': (f'Preços da tabela Casa & Estrada da Galp com {round(pct * 100)} % de desconto no total da fatura '
                                  f'durante 12 meses' + (' (com débito direto)' if dd else '') +
                                  (f' e {round(cpl * 100)} cênt./l em cashback na app Mundo Galp' if cpl else '') + '.')}
                    if dd:
                        of['dd'] = 1
                    if t in ('E', 'D'):
                        of['e'] = {kva: {c: [k(x) for x in v] for c, v in cs.items()} for kva, cs in base_e.items()}
                    if t in ('G', 'D'):
                        of['g'] = {esc: [k(x) for x in v] for esc, v in base_g.items()}
                    ofertas.append(of)
    return ofertas, fontes, regras


def galp_base_igual(txt, e, g):
    """A coluna «Preço Base» da tabela Casa & Estrada é igual aos preços COMBINA?
    Linhas com 8 números: potência + 7 preços do termo fixo. Linhas com 7 números, por ordem: 12 da energia da luz
    (4 escalões de potência × simples, fora de vazio, vazio), 4 da energia do gás e 4 do termo fixo do gás."""
    tf, sete = {}, []
    for ln in txt.splitlines():
        v = nums(ln)
        if len(v) == 8 and 1 <= v[0] <= 20.7:
            tf[('%g' % v[0]).replace('.', ',')] = v[1]
        elif len(v) == 7:
            sete.append(v[0])
    if len(tf) < 8 or len(sete) != 20:
        return False
    if any(k in e and abs(e[k][1][0] - tf[k]) > 0.00005 for k in tf):
        return False
    luz = sete[:12]
    for b, kva in enumerate(['1,15', '3,45', '6,9', '13,8']):
        s1, fv, vz = luz[3 * b: 3 * b + 3]
        if kva in e and (abs(e[kva][1][1] - s1) > 0.00005 or abs(e[kva][2][1] - fv) > 0.00005 or abs(e[kva][2][2] - vz) > 0.00005):
            return False
    en, fx = sete[12:16], sete[16:20]
    return all(abs(g[i + 1][1] - en[i]) < 0.00005 and abs(g[i + 1][0] - fx[i]) < 0.00005 for i in range(4))


def data_curta(iso):
    meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    d = date.fromisoformat(iso)
    return f'{d.day} de {meses[d.month - 1]} de {d.year}'


# ---------------------------------------------------------------- simulador da ERSE (tarifas de acesso e confirmação)
# 1 = conta com (restrições, reembolsos, fidelização, novos clientes); ServicosAdicionais 1 seria «só com serviços»
FILTROS_TODOS = {'idioma': '1', 'socialOffer': '1', 'filtro_IndexacaoSpot': '0', 'filtro_ServicosAdicionais': '0',
                 'filtro_SemRestricoesAdicionais': '1', 'filtro_SemPrecosIndexados': '1', 'filtro_SemReembolsos': '1',
                 'filtro_energia100Renovavel': '0', 'filtro_Fidelizacao': '1', 'filtro_FamiliasNumerosas': '0',
                 'filtro_NovosClientes': '1', 'pageStartIndex': '0', 'pageStep': '2000', 'filtro_comercializadores': '',
                 'filtro_contratacao': '1', 'filtro_faturacao': '1', 'filtro_pagamento': '1', 'filtro_TipoOfertaELE': '1',
                 'filtro_TipoOfertaGas': '1', 'filtro_gas100Renovavel': '0', 'filtro_comercializadorUnico': '0'}
POT_IDX = {k: str(i) for i, k in enumerate(['1,15', '2,3', '3,45', '4,6', '5,75', '6,9', '10,35', '13,8', '17,25', '20,7'])}

# perfis: (nome, serviço, campos, perfil para o nosso cálculo)
CALIBRAR = [
    ('ea', 'simular_eletricidade', {'electSupply': '2', 'cycle': '1', 'electPonta': '1900'}),
    ('eb', 'simular_eletricidade', {'electSupply': '2', 'cycle': '1', 'electPonta': '3800'}),
    ('g1a', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '1610'}),
    ('g1b', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '2400'}),
    ('g2a', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '3407'}),
    ('g2b', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '5000'}),
    ('g3a', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '7467'}),
    ('g3b', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '10000'}),
    ('g4a', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '15000'}),
    ('g4b', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '30000'}),
]
CONFIRMAR = [
    ('c1', 'simular_eletricidade', {'electSupply': '2', 'cycle': '1', 'electPonta': '1900'},
     {'tipo': 'E', 'ele': {'kva': '3,45', 'kvaN': 3.45, 'ciclo': 1, 'kwh': [1900]}}),
    ('c2', 'simular_eletricidade', {'electSupply': '5', 'cycle': '1', 'electPonta': '5000'},
     {'tipo': 'E', 'ele': {'kva': '6,9', 'kvaN': 6.9, 'ciclo': 1, 'kwh': [5000]}}),
    ('c3', 'simular_eletricidade', {'electSupply': '5', 'cycle': '2', 'electPonta': '3000', 'electCheias': '2000'},
     {'tipo': 'E', 'ele': {'kva': '6,9', 'kvaN': 6.9, 'ciclo': 2, 'kwh': [3000, 2000]}}),
    ('c4', 'simular_eletricidade', {'electSupply': '7', 'cycle': '1', 'electPonta': '10900'},
     {'tipo': 'E', 'ele': {'kva': '13,8', 'kvaN': 13.8, 'ciclo': 1, 'kwh': [10900]}}),
    ('c5', 'simular_gas', {'gasCodPostal': '1000', 'codPostal': '1000', 'gasConsumo': '3407'},
     {'tipo': 'G', 'gas': {'kwh': 3407, 'ord': 'LIS'}}),
    ('c6', 'simular_dual', {'electSupply': '2', 'cycle': '1', 'electPonta': '1900', 'gasCaseType': '3', 'gasCodPostal': '4420',
                            'codPostal': '4420', 'gasConsumo': '1610', 'gasCalendar': '2', 'showGasPrice': 'false'},
     {'tipo': 'D', 'ele': {'kva': '3,45', 'kvaN': 3.45, 'ciclo': 1, 'kwh': [1900]}, 'gas': {'kwh': 1610, 'ord': 'REN'}}),
]


def simular(servico, campos, fixtures=None, nome=None):
    if fixtures:
        p = os.path.join(fixtures, 'oraculo_%s.json' % nome)
        return json.load(open(p)) if os.path.exists(p) else None
    dados = dict(FILTROS_TODOS, caseType='3', electCalendar='2', gasCalendar='2', showElectPrice='false', showGasPrice='false')
    dados.update(campos)
    s, b = ler('%s/connectors/%s/' % (ERSE, servico), dados=urllib.parse.urlencode(dados).encode(), tentativas=2,
               cab={'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
                    'Origin': ERSE, 'Referer': ERSE + '/eletricidade/'})
    time.sleep(PAUSA)
    if s != 200:
        return None
    try:
        j = json.loads(b.decode('utf-8-sig'))
    except ValueError:
        return None
    return j if j.get('status') == 'OK' and j.get('Resultados') else None


def codigos_postais(estado, fixtures=None):
    """Código postal (4 dígitos) -> operador da rede de gás, da lista do simulador da ERSE (para o gás regulado)."""
    local = os.path.join(estado, 'codigos-postais.json')
    if fixtures:
        local = os.path.join(fixtures, 'codigos-postais.json')
    else:
        s, b = ler(ERSE + '/config/PostalCodes.json', tentativas=2)
        try:
            lista = json.loads(b.decode('utf-8-sig')) if s == 200 else None
        except ValueError:
            lista = None
        if lista and len(lista) > 300:
            open(local, 'w').write(json.dumps(lista, ensure_ascii=False))
    try:
        lista = json.load(open(local))
    except (OSError, ValueError):
        return {}
    return {x['code']: ORD_GAS[x['provider']] for x in lista if x.get('provider') in ORD_GAS}


def calibrar(param, fixtures=None):
    """Tarifas de acesso às redes a partir do simulador (duas simulações por caso, mesma potência/escalão)."""
    r = {n: simular(s, c, fixtures, n) for n, s, c in CALIBRAR}
    acc = lambda n: r[n]['Resultados'][0]['PrecoAcesso'] if r.get(n) else None
    novo, avisos = dict(param), []
    a, b = acc('ea'), acc('eb')
    if a and b:
        tv = (b - a) / 1900
        tf = (a - tv * 1900) / 365
        if 0.02 < tv < 0.2 and 0.05 < tf < 0.5:
            novo['tar_tv'], novo['tar_tf_kva'] = round(tv, 5), round(tf / 3.45, 5)
        else:
            avisos.append('tarifas de acesso da luz fora do esperado (%.4f; %.4f)' % (tv, tf))
    else:
        avisos.append('simulador da ERSE sem resposta para a luz: ficam as tarifas de acesso anteriores')
    tfs = list(param['gas_tar_tf'])
    for i, (x, y, k1, k2) in enumerate([('g1a', 'g1b', 1610, 2400), ('g2a', 'g2b', 3407, 5000), ('g3a', 'g3b', 7467, 10000), ('g4a', 'g4b', 15000, 30000)]):
        A, B = acc(x), acc(y)
        if A and B:
            tv = (B - A) / (k2 - k1)
            tf = (A - tv * k1) / 365
            if 0 < tf < 1 and 0 < tv < 0.2:
                tfs[i] = round(tf, 5)
            else:
                avisos.append('tarifa de acesso do gás (escalão %d) fora do esperado' % (i + 1))
        else:
            avisos.append('simulador da ERSE sem resposta para o gás (escalão %d)' % (i + 1))
    novo['gas_tar_tf'] = tfs
    return novo, avisos


def node(pedido):
    p = subprocess.run([NODE, CLI], input=json.dumps(pedido).encode(), capture_output=True, timeout=300)
    if p.returncode != 0:
        raise RuntimeError('node: ' + p.stderr.decode()[:500])
    return json.loads(p.stdout)


def confirmar(dados, fixtures=None):
    """Compara, oferta a oferta, o nosso total com o do simulador da ERSE nos casos de CONFIRMAR."""
    ids = {o['id']: o for o in dados['of']}
    pedidos, esperado = [], []
    for nome, servico, campos, perfil in CONFIRMAR:
        j = simular(servico, campos, fixtures, nome)
        if not j:
            continue
        for x in j['Resultados']:
            ofs = x.get('Oferta') or []
            cods = [o.get('CodOferta') for o in ofs]
            if len(cods) != 1 or cods[0] not in ids:   # combinações de duas ofertas: só as conjuntas
                continue
            of = ids[cods[0]]
            if of.get('idx'):
                continue          # preços indexados: a ERSE usa a média dos futuros, nós a média do mês anterior
            pf = json.loads(json.dumps(perfil))
            cic = (ofs[0].get('TipoContagem') or '').strip()
            if pf.get('ele') and cic.isdigit() and int(cic) != pf['ele']['ciclo']:
                if int(cic) != 1:
                    continue
                pf['ele']['ciclo'], pf['ele']['kwh'] = 1, [sum(pf['ele']['kwh'])]
            pedidos.append({'id': of['id'], 'perfil': pf})
            esperado.append((nome, of['id'], x['PrecoTotal']))
    if not pedidos:
        return {'casos': 0, 'ok': None}
    res = node({'dados': dados, 'faturas': pedidos})['faturas']
    difs = []
    for (nome, oid, total), r in zip(esperado, res):
        nosso = r['total'] if r else None
        d = None if nosso is None else round(nosso - total, 2)
        difs.append({'caso': nome, 'id': oid, 'erse': total, 'caiu': nosso, 'dif': d})
    # tolerância: 1 € ou 0,75 % (ofertas com bónus raros, como a «fatura grátis» da Endesa, ficam a menos de 1 %)
    maus = [x for x in difs if x['dif'] is None or abs(x['dif']) > max(1.0, 0.0075 * x['erse'])]
    return {'casos': len(difs), 'maus': len(maus), 'ok': len(maus) == 0, 'max_dif': max((abs(x['dif'] or 0) for x in difs), default=0),
            'detalhe': difs[:60], 'maus_detalhe': maus[:20]}


# ---------------------------------------------------------------- vantagens fora da fatura
def verificar_vantagens(vs, cond, estado_ant, fontes_galp, regras_galp, fixtures=None):
    """Confirma cada vantagem na fonte oficial. estado: ok (confirmada hoje), velho (confirmada há <15 dias), parado."""
    hoje = agora().date()
    textos_erse = {}
    for r in cond:
        textos_erse.setdefault(r['COM'], []).append(norm(' '.join([r.get('TxTOferta', ''), r.get('TxTReembolsos', ''), r.get('DetalheOutrosDesc/benefi', ''), r.get('TxTRestricoesAdic', '')])))
    cache = {}
    out = []
    for v in vs:
        v = dict(v)
        fonte = v.get('fonte') or {}
        prova = [norm(p) for p in fonte.get('prova', [])]
        ok = False
        if fonte.get('tipo') == 'erse':
            txt = ' '.join(textos_erse.get(fonte.get('com'), []))
            ok = bool(txt) and all(p in txt for p in prova)
        elif fonte.get('tipo') == 'galp':
            regra = regras_galp.get(fonte.get('tabela'))
            if regra:
                ok = True
                v.update(regra)                  # níveis e limites lidos da tabela em vigor
                fg = fontes_galp.get(fonte.get('tabela')) or {}
                v['fonte'] = dict(fonte, url=fg.get('url') or fonte.get('url'))
                if fg.get('ate'):
                    v['ate'] = fg['ate']
        elif fonte.get('url'):
            u = fonte['url']
            if u not in cache:
                if fixtures:
                    p = os.path.join(fixtures, 'pag_%s.html' % v['id'])
                    cache[u] = open(p, encoding='utf-8', errors='replace').read() if os.path.exists(p) else ''
                else:
                    s, b = ler(u, tentativas=2)
                    time.sleep(PAUSA)
                    cache[u] = b.decode('utf-8', 'replace') if s == 200 else ''
            txt = norm(html.unescape(re.sub(r'<[^>]+>', ' ', cache[u])))
            txt = re.sub(r'\s+', ' ', txt)
            ok = bool(txt) and all(p in txt for p in prova)
        ant = (estado_ant or {}).get(v['id'], {})
        ultimo = hoje.isoformat() if ok else ant.get('ultimo_ok')
        if ok:
            st = 'ok'
        elif ultimo and (hoje - date.fromisoformat(ultimo)).days < 15:
            st = 'velho'
        else:
            st = 'parado'
        if v.get('ate') and v['ate'] < hoje.isoformat():
            st = 'parado'
        v['estado'], v['confirmado'] = st, ultimo
        out.append(v)
    return out


# ---------------------------------------------------------------- saída
CASOS = [  # casos tipo da ERSE
    ('e1', 'Casal sem filhos', {'tipo': 'E', 'ele': {'kva': '3,45', 'kvaN': 3.45, 'ciclo': 1, 'kwh': [1900]}}, '3,45 kVA, 1900 kWh por ano'),
    ('e2', 'Casal com 2 filhos', {'tipo': 'E', 'ele': {'kva': '6,9', 'kvaN': 6.9, 'ciclo': 1, 'kwh': [5000]}}, '6,9 kVA, 5000 kWh por ano'),
    ('e3', 'Casal com 4 filhos', {'tipo': 'E', 'ele': {'kva': '13,8', 'kvaN': 13.8, 'ciclo': 1, 'kwh': [10900]}}, '13,8 kVA, 10 900 kWh por ano'),
    ('g1', 'Gás: casal sem filhos', {'tipo': 'G', 'gas': {'kwh': 1610, 'ord': 'LIS'}}, '1610 kWh por ano (1.º escalão)'),
    ('g2', 'Gás: casal com 2 filhos', {'tipo': 'G', 'gas': {'kwh': 3407, 'ord': 'LIS'}}, '3407 kWh por ano (2.º escalão)'),
    ('d2', 'Luz e gás: casal com 2 filhos', {'tipo': 'D', 'ele': {'kva': '6,9', 'kvaN': 6.9, 'ciclo': 1, 'kwh': [5000]}, 'gas': {'kwh': 3407, 'ord': 'LIS'}},
     '6,9 kVA e 5000 kWh de luz, 3407 kWh de gás'),
]
PREF_GERAL = {'indexado': False}   # nas páginas: sem preços indexados (mudam todos os meses) e sem condições especiais


def escrever(caminho, texto):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    tmp = caminho + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(texto)
    os.replace(tmp, caminho)


def historico(estado, dia, casos):
    db = sqlite3.connect(os.path.join(estado, 'energia.db'))
    db.execute('CREATE TABLE IF NOT EXISTS precos(dia TEXT, caso TEXT, id TEXT, com TEXT, nome TEXT, total REAL, sem_campanhas REAL, '
               'PRIMARY KEY(dia, caso, id))')
    for caso, linhas in casos.items():
        db.executemany('INSERT OR REPLACE INTO precos VALUES(?,?,?,?,?,?,?)',
                       [(dia, caso, l['id'], l['com'], l['n'], l['total'], l['semCampanhas']) for l in linhas])
    db.commit()
    # variação face a há 7 e 30 dias (para dizer «subiu» / «desceu»)
    var = {}
    for caso in casos:
        for d in (7, 30):
            ant = (date.fromisoformat(dia) - timedelta(days=d)).isoformat()
            r = db.execute('SELECT dia FROM precos WHERE caso=? AND dia<=? ORDER BY dia DESC LIMIT 1', (caso, ant)).fetchone()
            if not r:
                continue
            for oid, tot in db.execute('SELECT id, total FROM precos WHERE caso=? AND dia=?', (caso, r[0])):
                var.setdefault(caso, {}).setdefault(oid, {})['d%d' % d] = tot
    db.close()
    return var


def correr(pasta, estado, fixtures=None):
    t0 = time.time()
    os.makedirs(estado, exist_ok=True)
    ant_estado = {}
    p_est = os.path.join(pasta, 'energia-estado.json')
    if os.path.exists(p_est):
        try:
            ant_estado = json.load(open(p_est))
        except ValueError:
            pass
    avisos = []
    nome, zb = erse_ficheiro(estado, fixtures)
    if not zb:
        raise SystemExit('sem ficheiro da ERSE e sem cópia anterior')
    cond, precos = ler_csvs(zb)
    ofertas, coms = montar_erse(cond, precos)
    if len(ofertas) < 150:
        raise SystemExit('ficheiro da ERSE com poucas ofertas (%d): fica o anterior' % len(ofertas))
    galp, fontes_galp, regras_galp = montar_galp(estado, fixtures)
    if not galp:
        avisos.append('tabelas da Galp por ler: a Galp aparece só com as ofertas da ERSE')
    ofertas += galp
    coms.setdefault('GALP', {'n': 'Galp', 'url': 'https://www.galp.com/pt/casa/'})
    param, av = calibrar(PARAM, fixtures)
    avisos += av
    vs = json.load(open(VANT, encoding='utf-8'))['vantagens']
    vs = verificar_vantagens(vs, cond, (ant_estado.get('vantagens') or {}), fontes_galp, regras_galp, fixtures)
    dia = agora().date().isoformat()
    dados = {'v': 1, 'dia': dia, 'atualizado': agora().isoformat(timespec='minutes'), 'param': param, 'com': coms,
             'req': REQ_NOMES, 'of': ofertas, 'vant': vs,
             'fonte': {'erse': nome, 'galp': fontes_galp},
             'cp': codigos_postais(estado, fixtures)}
    conf = confirmar(dados, fixtures)
    if conf.get('ok') is False:
        avisos.append('%d de %d contas diferentes do simulador da ERSE (máx. %.2f €)' % (conf['maus'], conf['casos'], conf['max_dif']))
    if not conf.get('casos'):
        avisos.append('simulador da ERSE sem resposta: contas por confirmar hoje')
    dados['confirmado'] = {'casos': conf.get('casos', 0), 'ok': conf.get('ok'), 'max_dif': conf.get('max_dif'), 'dia': dia}
    # casos tipo (página e histórico)
    res = node({'dados': dados, 'casos': [{'id': c[0], 'perfil': dict(c[2], pref=PREF_GERAL)} for c in CASOS]})['casos']
    var = historico(estado, dia, res)
    dados['casos'] = {c[0]: {'nome': c[1], 'desc': c[3], 'top': res[c[0]][:12]} for c in CASOS}
    dados['variacao'] = var
    escrever(os.path.join(pasta, 'energia.json'), json.dumps(dados, ensure_ascii=False, separators=(',', ':')))
    import energia_pagina
    # fora de paginas/ (essa pasta é trocada inteira por paginas.py em cada recolha)
    escrever(os.path.join(pasta, 'energia-paginas', 'luz-e-gas', 'index.html'), energia_pagina.pagina(dados))
    est = {'dia': dia, 'hora': agora().strftime('%H:%M'), 'segundos': round(time.time() - t0),
           'erse': {'ficheiro': nome, 'ofertas': len(ofertas) - len(galp), 'comercializadores': len(coms)},
           'galp': fontes_galp, 'param': param, 'confirmado': conf,
           'vantagens': {v['id']: {'estado': v['estado'], 'ultimo_ok': v['confirmado']} for v in vs},
           'avisos': avisos}
    escrever(p_est, json.dumps(est, ensure_ascii=False, indent=1))
    log('energia: %d ofertas (%d Galp), %d vantagens ok, contas %s (%s casos), %ds' %
        (len(ofertas), len(galp), sum(v['estado'] == 'ok' for v in vs), conf.get('ok'), conf.get('casos'), time.time() - t0))
    for a in avisos:
        log('aviso:', a)
    return est


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    pasta = args[0]
    estado = args[args.index('--estado') + 1] if '--estado' in args else os.path.join(pasta, '..', 'caiu-energia')
    fixtures = args[args.index('--fixtures') + 1] if '--fixtures' in args else None
    sys.path.insert(0, AQUI)
    correr(pasta, estado, fixtures)
