#!/usr/bin/env python3
"""DupliCasa: páginas para o Google (SEO), feitas a partir dos anúncios recolhidos.

Gera HTML estático (sem JavaScript) para cada cidade com anúncios e para cada tipologia dentro da cidade:
  /arrendar/                      todas as cidades
  /arrendar/<cidade>/             casas para arrendar na cidade
  /arrendar/<cidade>/<tipo>/      quartos, apartamentos, moradias, t0, t1, t2, t3-ou-mais
  /arrendar/precos/               preço das rendas por cidade (mediana dos anúncios)
e ainda /sitemap.xml.
Palavras: em Portugal pesquisa-se mais «alugar» do que «arrendar» (ex.: «casas para alugar lisboa» 5400/mês contra
«casas para arrendar lisboa» 1600; «quartos para alugar lisboa» 4400 contra 880; DataForSEO, Portugal, outubro de 2026).
Por isso as páginas de cidade, quartos e apartamentos usam «alugar» no título e «arrendar» no texto; as de tipologia (T1…)
usam «arrendar» («t1 para arrendar lisboa» 390 contra «alugar t1» 140). Corre depois de cada recolha. Cada página tem título, descrição, canonical, Open Graph,
dados estruturados (BreadcrumbList e ItemList) e texto com números reais da cidade, para não ser conteúdo fino.

Dados próprios em cada página de zona (12/11/2026): preço médio (média aparada), mediana, metade das rendas entre, n.º de
anúncios, tendência e data/hora da atualização, com uma resposta direta de 40 a 60 palavras no topo. Os anúncios em si
nunca são páginas próprias (só aparecem como cartões que abrem /#casa-N): quem vai para o Google são as páginas de zona.
Regras de índice: uma página só vai para o Google e para o sitemap com pelo menos MIN_AMOSTRA anúncios com preço. As que
já existiram e agora têm menos ficam com noindex (fora do sitemap); as que ficaram sem anúncios nenhuns respondem 410
(ficheiro 410.html na pasta, servido com esse código pelo Caddy) durante REG_DIAS dias e depois 404.
Tendência: guarda-se por dia a mediana de cada zona e tipologia (historico-rendas.json, ao lado da pasta de saída) e
compara-se com a de há cerca de 30 dias (entre 14 e 45), só com pelo menos TEND_MIN_N anúncios nos dois dias.
Estudo para imprensa: /arrendar/precos/t1-por-distrito/ (quanto custa um T1 em cada distrito), com CSV por dia.

Uso: python3 paginas.py anuncios.json pasta_de_saida
"""
import collections, datetime, hashlib, html, json, os, re, shutil, sys, tempfile, time, unicodedata, urllib.request
from urllib.parse import quote
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ids import id_num

SITE = 'https://duplicasa.pt'
INDEXNOW = '386c1a2d4d17b112c59bb9e697abc415'      # chave pública do IndexNow (Bing, Yandex, Seznam…); o ficheiro com ela está na raiz do site
MIN_CIDADE, MIN_TIPO, MAX_CARTOES = 5, 3, 24
MIN_AMOSTRA = 5       # anúncios com preço para uma página ir para o Google e para se mostrar média e mediana
TEND_MIN_N, TEND_DIAS = 10, (14, 45)     # tendência: pelo menos 10 anúncios hoje e no dia de comparação, há 14 a 45 dias
HIST_DIAS, REG_DIAS = 400, 180
TIPOS_ZONA = ('quartos', 't0', 't1', 't2')     # tipologias com página própria em cada freguesia (com amostra)
# Páginas por renda máxima («casas para alugar em gaia até 400 euros» 590/mês, «casas para alugar 250€» 480, KD 0): só com
# pelo menos MIN_PRECO casas e quando a faixa não repete a cidade inteira
TETOS, MIN_PRECO = (300, 400, 500, 600, 800, 1000), 5
MIN_ZONA = 5          # páginas por freguesia/zona («casas para alugar em ermesinde» 720/mês)
# Como as pessoas escrevem o nome («casas para alugar gaia» 2400/mês)
CURTO = {'Vila Nova de Gaia': 'Gaia', 'Santa Maria da Feira': 'Feira', 'Vila Nova de Famalicão': 'Famalicão'}
# Regiões que se pesquisam pelo nome da região
REGIAO_NOME = {'Faro': 'Algarve', 'Ilha da Madeira': 'Madeira', 'Ilha de São Miguel': 'São Miguel (Açores)', 'Ilha Terceira': 'Terceira (Açores)'}
REGIAO_EM = {'Algarve': 'no Algarve', 'Madeira': 'na Madeira', 'São Miguel (Açores)': 'em São Miguel, nos Açores', 'Terceira (Açores)': 'na Terceira, nos Açores',
             'Margem Sul': 'na Margem Sul', 'Grande Porto': 'no Grande Porto'}
GRUPOS = {'Margem Sul': ['Almada', 'Seixal', 'Barreiro', 'Moita', 'Montijo', 'Alcochete', 'Sesimbra', 'Palmela', 'Setúbal'],
          'Grande Porto': ['Porto', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Valongo', 'Póvoa de Varzim', 'Vila do Conde', 'Espinho', 'Trofa', 'Santo Tirso']}
RE_DESPESAS = re.compile(r'despesas (estao |est.o )?inclu|inclui (todas as )?despesas|contas inclu')
TIPOS = [('quartos', 'Quartos', 'Quarto'), ('apartamentos', 'Apartamentos', 'Apartamento'), ('moradias', 'Moradias', 'Moradia'),
         ('t0', 'T0', 'T0'), ('t1', 'T1', 'T1'), ('t2', 'T2', 'T2'), ('t3-ou-mais', 'T3 ou mais', 'T3+')]
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
LOGO = '<svg viewBox="-137.5 -96.5 591.8 122.9" width="135" height="28" role="img" aria-label="DupliCasa">' + '<g transform="translate(-153.26 -104.34) scale(1.3593)"><path fill="#0B6E4F" d="M11 88V52.00A22.0 22.0 0 0 1 55 52.00V88Z"/><path fill="#08523B" d="M42 88V36.00A24.0 24.0 0 0 1 90 36.00V88Z"/><path fill="#F2A33A" d="M42 88L42.00 36.00L42.27 32.40L42.54 32.18L42.81 32.31L43.08 32.45L43.35 32.59L43.62 32.74L43.90 32.89L44.17 33.04L44.44 33.21L44.71 33.37L44.98 33.55L45.25 33.73L45.52 33.91L45.79 34.10L46.06 34.30L46.33 34.50L46.60 34.71L46.88 34.93L47.15 35.15L47.42 35.38L47.69 35.62L47.96 35.87L48.23 36.12L48.50 36.39L48.77 36.66L49.04 36.94L49.31 37.24L49.58 37.54L49.85 37.86L50.12 38.19L50.40 38.53L50.67 38.89L50.94 39.26L51.21 39.65L51.48 40.06L51.75 40.49L52.02 40.95L52.29 41.42L52.56 41.93L52.83 42.48L53.10 43.07L53.38 43.70L53.65 44.40L53.92 45.18L54.19 46.08L54.46 47.15L54.73 48.56L55.00 52.00L55 88Z"/></g><path fill="#0F1A17" d="M30.615234375 0.0C52.880859375 0.0 66.2109375 -13.96484375 66.2109375 -36.474609375C66.2109375 -58.837890625 52.783203125 -72.75390625 31.15234375 -72.75390625H6.0546875V0.0ZM18.9453125 -11.03515625V-61.71875H30.322265625C45.654296875 -61.71875 53.173828125 -52.490234375 53.173828125 -36.474609375C53.173828125 -20.3125 45.751953125 -11.03515625 29.931640625 -11.03515625Z M92.3546875 1.025390625C99.48359375 1.025390625 104.708203125 -2.099609375 108.223828125 -7.91015625V0.0H120.333203125V-51.5625H107.9796875V-22.412109375C107.9796875 -13.623046875 103.19453125 -9.765625 96.700390625 -9.765625C90.10859375 -9.765625 86.3 -13.720703125 86.3 -21.2890625V-51.5625H73.9953125V-19.3359375C73.9953125 -6.103515625 81.563671875 1.025390625 92.3546875 1.025390625Z M130.070703125 20.41015625H142.375390625V-7.763671875H142.521875C145.74453125 -1.904296875 151.164453125 1.025390625 157.902734375 1.025390625C171.379296875 1.025390625 180.2171875 -9.765625 180.2171875 -25.830078125C180.2171875 -41.69921875 171.2328125 -52.587890625 157.9515625 -52.587890625C151.262109375 -52.587890625 145.54921875 -49.853515625 142.3265625 -44.384765625H142.180078125V-51.5625H130.070703125ZM155.021875 -9.27734375C146.965234375 -9.27734375 141.691796875 -15.771484375 141.691796875 -25.830078125C141.691796875 -35.83984375 146.965234375 -42.3828125 155.021875 -42.3828125C162.6390625 -42.3828125 167.766015625 -36.474609375 167.766015625 -25.830078125C167.766015625 -15.13671875 162.6390625 -9.27734375 155.021875 -9.27734375Z M199.86679687499998 -72.75390625H187.56210937499998V0.0H199.86679687499998Z M209.604296875 0.0H221.908984375V-51.5625H209.604296875ZM215.756640625 -59.228515625C219.955859375 -59.228515625 223.1296875 -62.255859375 223.1296875 -66.259765625C223.1296875 -70.21484375 219.955859375 -73.2421875 215.756640625 -73.2421875C211.557421875 -73.2421875 208.38359375 -70.21484375 208.38359375 -66.259765625C208.38359375 -62.255859375 211.557421875 -59.228515625 215.756640625 -59.228515625Z"/><g transform="translate(226.18 0)"><path fill="#0B6E4F" d="M37.79296875 1.171875C54.19921875 1.171875 66.69921875 -8.984375 69.140625 -24.853515625H56.0546875C54.00390625 -15.625 47.16796875 -10.400390625 37.890625 -10.400390625C24.51171875 -10.400390625 16.50390625 -20.703125 16.50390625 -36.328125C16.50390625 -52.05078125 24.560546875 -62.353515625 37.890625 -62.353515625C47.216796875 -62.353515625 54.052734375 -57.080078125 56.005859375 -47.802734375H69.140625C66.69921875 -63.720703125 54.19921875 -73.92578125 37.79296875 -73.92578125C17.724609375 -73.92578125 3.515625 -59.1796875 3.515625 -36.328125C3.515625 -13.623046875 17.724609375 1.171875 37.79296875 1.171875Z M92.45234375 0.830078125C100.85078125 0.830078125 105.196484375 -2.685546875 107.637890625 -7.275390625H107.833203125V0.0H119.942578125V-35.15625C119.942578125 -45.8984375 111.98359375 -52.587890625 98.555859375 -52.587890625C85.079296875 -52.587890625 76.680859375 -45.80078125 76.094921875 -35.546875H87.96015625C88.301953125 -39.892578125 92.305859375 -43.017578125 98.31171875 -43.017578125C104.219921875 -43.017578125 107.735546875 -39.892578125 107.735546875 -35.498046875V-35.107421875C107.735546875 -31.591796875 104.4640625 -31.4453125 94.89375 -30.37109375C84.24921875 -29.248046875 74.630078125 -26.3671875 74.630078125 -14.6484375C74.630078125 -4.345703125 82.1984375 0.830078125 92.45234375 0.830078125ZM95.4796875 -8.30078125C90.10859375 -8.30078125 86.641796875 -10.693359375 86.641796875 -14.74609375C86.641796875 -19.43359375 91.133984375 -21.337890625 96.407421875 -22.119140625C101.485546875 -22.900390625 106.270703125 -23.681640625 107.784375 -24.658203125V-19.091796875C107.784375 -13.0859375 103.536328125 -8.30078125 95.4796875 -8.30078125Z M149.84609375 1.220703125C162.590234375 1.220703125 171.72109375 -5.126953125 171.72109375 -15.185546875C171.72109375 -22.75390625 166.984765625 -27.24609375 156.7796875 -29.39453125L147.50234375 -31.298828125C143.20546875 -32.2265625 140.66640625 -34.130859375 140.66640625 -37.20703125C140.66640625 -40.72265625 143.98671875 -43.45703125 149.406640625 -43.45703125C155.021875 -43.45703125 158.781640625 -40.087890625 158.879296875 -35.498046875H170.4515625C170.15859375 -46.09375 161.613671875 -52.685546875 149.113671875 -52.685546875C136.516015625 -52.685546875 128.36171875 -46.2890625 128.36171875 -36.81640625C128.36171875 -29.00390625 133.5375 -23.974609375 143.40078125 -21.923828125L152.18984375 -20.1171875C156.535546875 -19.189453125 159.22109375 -17.3828125 159.22109375 -14.2578125C159.22109375 -10.595703125 155.6078125 -8.0078125 149.65078125 -8.0078125C143.4984375 -8.0078125 139.88515625 -10.888671875 139.348046875 -15.91796875H127.18984375C127.97109375 -4.833984375 137.297265625 1.220703125 149.84609375 1.220703125Z M194.64218749999998 0.830078125C203.04062499999998 0.830078125 207.38632812499998 -2.685546875 209.82773437499998 -7.275390625H210.02304687499998V0.0H222.13242187499998V-35.15625C222.13242187499998 -45.8984375 214.17343749999998 -52.587890625 200.74570312499998 -52.587890625C187.26914062499998 -52.587890625 178.87070312499998 -45.80078125 178.28476562499998 -35.546875H190.14999999999998C190.49179687499998 -39.892578125 194.49570312499998 -43.017578125 200.50156249999998 -43.017578125C206.40976562499998 -43.017578125 209.92539062499998 -39.892578125 209.92539062499998 -35.498046875V-35.107421875C209.92539062499998 -31.591796875 206.65390624999998 -31.4453125 197.08359374999998 -30.37109375C186.43906249999998 -29.248046875 176.81992187499998 -26.3671875 176.81992187499998 -14.6484375C176.81992187499998 -4.345703125 184.38828124999998 0.830078125 194.64218749999998 0.830078125ZM197.66953124999998 -8.30078125C192.29843749999998 -8.30078125 188.83164062499998 -10.693359375 188.83164062499998 -14.74609375C188.83164062499998 -19.43359375 193.32382812499998 -21.337890625 198.59726562499998 -22.119140625C203.67539062499998 -22.900390625 208.46054687499998 -23.681640625 209.97421874999998 -24.658203125V-19.091796875C209.97421874999998 -13.0859375 205.72617187499998 -8.30078125 197.66953124999998 -8.30078125Z"/></g>' + '</svg>'
e = html.escape


def slug(t):
    t = unicodedata.normalize('NFD', t or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def tipo_ok(a, tt):
    """O anúncio entra na página do tipo tt? (quartos, apartamentos e moradias pelo tipo; T0…T3+ pela tipologia)"""
    if tt in ('Apartamento', 'Moradia'):
        return a.get('tipo') == tt
    return tip(a) == tt


def tip(a):
    if a.get('tipo') == 'Quarto':
        return 'Quarto'
    t = a.get('tip') or ''
    if re.fullmatch(r'T\d+', t) and int(t[1:]) >= 3:
        return 'T3+'
    return t


def norm_t(t):
    return unicodedata.normalize('NFD', t or '').encode('ascii', 'ignore').decode().lower()


# «no Porto», «na Amadora» (cidades e freguesias); o resto leva «em»
NO = {norm_t(x) for x in ('porto', 'funchal', 'barreiro', 'seixal', 'cartaxo', 'entroncamento', 'fundão', 'sabugal', 'bombarral', 'crato', 'montijo',
                          'peso da régua', 'redondo', 'sardoal', 'gavião', 'alandroal', 'areeiro', 'lumiar', 'beato', 'bonfim', 'parque das nações', 'restelo')}
NA = {norm_t(x) for x in ('amadora', 'maia', 'nazaré', 'figueira da foz', 'guarda', 'lourinhã', 'batalha', 'golegã', 'mealhada', 'trofa', 'murtosa', 'sertã',
                          'chamusca', 'covilhã', 'póvoa de varzim', 'póvoa de lanhoso', 'moita', 'ribeira grande', 'ribeira brava', 'calheta', 'horta',
                          'praia da vitória', 'madalena', 'lagoa', 'vidigueira', 'vila do porto', 'ajuda', 'estrela', 'misericórdia', 'penha de frança', 'graça')}


def nome_pesquisa(cidade):
    """Nome para o título: o curto que as pessoas usam, com o oficial entre parêntesis."""
    return f'{CURTO[cidade]} ({cidade})' if cidade in CURTO else cidade


def em(c):
    n = unicodedata.normalize('NFD', c).encode('ascii', 'ignore').decode().lower()
    if n in NO:
        return 'no ' + c
    if n in NA:
        return 'na ' + c
    return 'em ' + c


def num(n):
    return f'{n:,.0f}'.replace(',', '.')


def mediana(v, minimo=MIN_AMOSTRA):
    """Mediana (com número par de valores, a média dos dois do meio), só com pelo menos MIN_AMOSTRA valores:
    com menos, um anúncio estranho faria de «preço típico»."""
    v = sorted(v)
    n = len(v)
    if n < max(minimo, 1):
        return None
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def quantil(v, q):
    """Quantil por interpolação linear (v já ordenado)."""
    i = (len(v) - 1) * q
    lo = int(i)
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


def numeros(rendas):
    """Números de um conjunto de rendas pedidas: n, mais baixa e, com amostra, média aparada (sem os 10% mais
    baixos e os 10% mais altos, pelo menos 1 de cada lado, arredondada a 5 €), mediana e, com 10 ou mais, o intervalo
    onde fica a metade do meio (1.º e 3.º quartis)."""
    v = sorted(rendas)
    n = len(v)
    r = {'n': n, 'min': v[0] if v else None}
    if n >= MIN_AMOSTRA:
        k = max(1, n // 10)
        meio = v[k:n - k]
        r['media'] = int(round(sum(meio) / len(meio) / 5) * 5)
        r['mediana'] = int(round(mediana(v)))
        if n >= 10:
            r['p25'], r['p75'] = int(round(quantil(v, .25))), int(round(quantil(v, .75)))
    return r


def conjunto(lista, tt=None):
    """Números de uma zona (e tipologia): só anúncios com renda plausível; €/m² só de casas (sem quartos)."""
    sel = [a for a in lista if plausivel(a) and (tt is None or tipo_ok(a, tt))]
    r = numeros([a['renda'] for a in sel])
    r['total'] = sum(1 for a in lista if tt is None or tipo_ok(a, tt))
    r['m2'] = mediana([a['renda'] / a['area'] for a in sel if area_ok(a) and a.get('tipo') != 'Quarto'])
    limite = (AGORA - datetime.timedelta(days=7)).isoformat()
    r['novos7'] = sum(1 for a in lista if (tt is None or tipo_ok(a, tt)) and (a.get('data') or '')[:19] >= limite[:19])
    return r


def eur(v):
    return f'{num(v)} €'


def m2txt(v):
    return (str(round(v, 1)).replace('.', ',') + ' €') if v else '—'


# Histórico das medianas (para a tendência) e registo das páginas (para lastmod, noindex e 410)
HIST = {'dias': {}}
SNAP = {}
REG = {'paginas': {}, 'zonas': {}}
INDEXAVEIS = set()
VOLATEIS = set()          # textos que mudam a cada volta (data e hora): não contam para saber se a página mudou
AGORA = datetime.datetime.now(datetime.timezone.utc)


def guardar(chave, st, completo=False):
    """Guarda os números de hoje para a tendência de amanhã (só com amostra)."""
    if st.get('mediana') is None:
        return
    v = [st['n'], st['mediana'], st['media']]
    if completo:
        v += [st.get('p25'), st.get('p75'), st.get('min')]
    SNAP[chave] = v


def inicio_hist():
    dias = sorted(HIST.get('dias') or {})
    return datetime.date.fromisoformat(dias[0]) if dias else AGORA.date()


def tendencia(chave, st):
    """Variação da mediana face a há cerca de 30 dias. Devolve {'curto', 'frase'} ou {'curto', 'nota'} se ainda não dá."""
    if st.get('mediana') is None or st['n'] < TEND_MIN_N:
        return {'curto': '—', 'nota': f'Tendência só com pelo menos {TEND_MIN_N} anúncios com preço.'}
    hoje = AGORA.date()
    melhor = None
    for dia, snap in (HIST.get('dias') or {}).items():
        try:
            idade = (hoje - datetime.date.fromisoformat(dia)).days
        except ValueError:
            continue
        v = snap.get(chave)
        if TEND_DIAS[0] <= idade <= TEND_DIAS[1] and v and v[0] >= TEND_MIN_N and v[1]:
            if melhor is None or abs(idade - 30) < abs(melhor[0] - 30):
                melhor = (idade, dia, v[1])
    if not melhor:
        i = inicio_hist()
        return {'curto': 'a recolher', 'nota': f'Guardamos o histórico desde {data_pt(i.isoformat())}; a tendência aparece a partir de '
                                                f'{data_pt((i + datetime.timedelta(days=TEND_DIAS[0])).isoformat())}.'}
    _, dia, ref = melhor
    pct = (st['mediana'] - ref) / ref * 100
    quando = data_pt(dia)
    if abs(pct) < 2:
        return {'curto': 'estável', 'frase': f'a mediana manteve-se estável (menos de 2% de diferença) desde {quando}'}
    p = round(abs(pct))
    return {'curto': f'{"+" if pct > 0 else "-"}{p}%', 'frase': f'a mediana {"subiu" if pct > 0 else "desceu"} {p}% desde {quando} ({eur(ref)})'}


def palavras(t):
    return len(re.sub(r'<[^>]+>', ' ', t).split())


def resposta(frases, minimo=40, maximo=60):
    """Junta frases pela ordem até ter pelo menos `minimo` palavras, sem passar de `maximo` (salta as que não cabem)."""
    out = []
    for f in frases:
        if not f:
            continue
        if palavras(' '.join(out + [f])) <= maximo:
            out.append(f)
        if palavras(' '.join(out)) >= minimo:
            break
    return ' '.join(out)


def artigo_tt(tt):
    return {'Quarto': 'um quarto', 'T0': 'um T0', 'T1': 'um T1', 'T2': 'um T2', 'T3+': 'um T3 ou maior',
            'Apartamento': 'um apartamento', 'Moradia': 'uma moradia'}.get(tt, 'uma casa')


def plural_tt(tt):
    return {'Quarto': 'quartos', 'T0': 'T0', 'T1': 'T1', 'T2': 'T2', 'T3+': 'T3 ou maiores', 'Apartamento': 'apartamentos', 'Moradia': 'moradias'}.get(tt, 'casas')


def quando_html():
    """«12 de novembro de 2026, 03:56» (hora de Lisboa), dentro de <time>."""
    try:
        from zoneinfo import ZoneInfo
        local = AGORA.astimezone(ZoneInfo('Europe/Lisbon'))
    except Exception:
        local = AGORA
    hora = f'{local.hour:02d}:{local.minute:02d}'
    VOLATEIS.add(hora)
    VOLATEIS.add(AGORA.strftime('%Y-%m-%dT%H:%M:%SZ'))
    dia = data_pt(local.date().isoformat())
    VOLATEIS.add(dia)
    return f'<time datetime="{AGORA.strftime("%Y-%m-%dT%H:%M:%SZ")}">{dia}, {hora}</time>'


FONTE_NUM = ('Rendas pedidas nos anúncios ativos na DupliCasa (vários sites de arrendamento, sem casas repetidas). '
             'É o preço pedido, não o do contrato.')


def caixa(titulo, st, tend, extra=None):
    """Caixa «em números» de uma zona e tipologia."""
    itens = [('Preço médio', eur(st['media']) if st.get('media') else '—'), ('Mediana', eur(st['mediana']) if st.get('mediana') else '—')]
    if st.get('p25'):
        itens.append(('Metade pede entre', f'{num(st["p25"])} e {eur(st["p75"])}'))
    if st.get('min'):
        itens.append(('O mais barato agora', eur(st['min'])))
    itens.append(('Anúncios com preço', num(st['n'])))
    if st.get('m2'):
        itens.append(('Preço por m²', m2txt(st['m2'])))
    itens.append(('Tendência (30 dias)', tend['curto']))
    itens += extra or []
    nota = tend.get('frase')
    nota = (nota[0].upper() + nota[1:] + '. ') if nota else (tend.get('nota', '') + ' ')
    return (f'<section class="num" aria-labelledby="num-t"><h2 id="num-t">{e(titulo)}</h2><dl>'
            + ''.join(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>' for k, v in itens) + '</dl>'
            f'<p class="fonte">{e(nota)}{e(FONTE_NUM)} Atualizado a {quando_html()}. <a href="/arrendar/precos/#metodo">Como calculamos</a></p></section>')


def mapa_distritos(anuncios):
    """Distrito de cada cidade (o mais frequente nos anúncios que o trazem): há sites que não o dizem."""
    c = {}
    for a in anuncios:
        if a.get('distrito') and a.get('cidade'):
            c.setdefault(a['cidade'].strip(), collections.Counter())[a['distrito']] += 1
    return {k: v.most_common(1)[0][0] for k, v in c.items()}


DIST = {}


def distrito_de(a):
    return a.get('distrito') or DIST.get((a.get('cidade') or '').strip(), '')


STOP_ZONA = {'e', 'de', 'do', 'da', 'dos', 'das', 'sao', 'santo', 'santa', 's'}


def chave_zona(z):
    """A mesma freguesia escrita de maneiras diferentes («Cedofeita, Ildefonso, Sé…» e «Cedofeita, Santo Ildefonso, Sé…») dá a mesma chave."""
    return ' '.join(sorted({t for t in re.findall(r'[a-z0-9]+', norm_t(z)) if t not in STOP_ZONA}))


def plausivel(a):
    r = a.get('renda')
    return bool(r) and r >= (150 if a.get('tipo') == 'Quarto' else 300)


def area_ok(a):
    ar = a.get('area') or 0
    lim = 40 if a.get('tipo') == 'Quarto' else (150 if a.get('tip') in ('T0', 'T1') else 1000)
    return 5 <= ar <= lim


# Bom negócio (a mesma regra do site, em index.html): renda pelo menos 15% e 40 € abaixo da mediana
# dos anúncios da mesma tipologia na mesma cidade (últimos 30 dias, pelo menos 6); 40% ou mais abaixo é suspeito.
NORMAL = {}


def chave_tip(a):
    if a.get('tipo') == 'Quarto':
        return 'Q'
    m = re.match(r'T(\d)', a.get('tip') or '')
    return 'T' + str(min(int(m.group(1)), 4)) if m else ''


def calc_normal(anuncios, agora):
    g = {}
    for a in anuncios:
        k, z = chave_tip(a), norm_t((a.get('cidade') or '').strip())
        if not (k and z and plausivel(a)):
            continue
        try:
            idade = (agora - datetime.datetime.fromisoformat(a['data'].replace('Z', '+00:00'))).days if a.get('data') else 0
        except (ValueError, TypeError):
            idade = 0
        if idade > 30:
            continue
        g.setdefault((z, k), []).append(a['renda'])
    NORMAL.clear()
    for k, v in g.items():
        if len(v) >= 6:
            v.sort()
            NORMAL[k] = round(v[len(v) // 2] / 5) * 5


def desconto(a):
    med = NORMAL.get((norm_t((a.get('cidade') or '').strip()), chave_tip(a)))
    if not med or not plausivel(a):
        return 0
    pct = (med - a['renda']) / med
    return round(pct * 100) if 0.15 <= pct < 0.40 and med - a['renda'] >= 40 else 0


UI = {
    'pt': {'html': 'pt-PT', 'og': 'pt_PT', 'mes': '/mês', 'consulta': 'Preço sob consulta', 'abaixo': '{d}% abaixo do normal', 'alt': '{t} para arrendar em {l}',
           'tipos': {}, 'casa': 'Casa', 'aqui': 'Estás aqui', 'faq': 'Perguntas frequentes', 'ver': 'Ver casas', 'botao': 'Pesquisar com filtros e alertas',
           'og_alt': 'DupliCasa: casas para arrendar em Portugal, num só lugar',
           'burla_t': 'Arrendar sem cair numa burla',
           'burla': ['Visita a casa antes de pagar qualquer valor.', 'Desconfia de rendas muito abaixo das outras na zona.', 'Confirma que quem anuncia é mesmo o dono.',
                     'Em breve, com o pagamento seguro da DupliCasa, a entrada só vai chegar ao senhorio quando receberes as chaves.'],
           'burla_links': '<a href="/arrendar/guias/como-evitar-burlas-no-arrendamento/">Guia: como evitar burlas no arrendamento</a> · <a href="/arrendar/guias/">Todos os guias</a>',
           'rodape': 'DupliCasa · casas e quartos para alugar em Portugal, num só lugar. Anúncios atualizados a {d}.',
           'rodape_links': '<a href="/arrendar/">Todas as cidades</a><a href="/arrendar/precos/">Preço das rendas</a><a href="/arrendar/precos/t1-por-distrito/">T1 por distrito</a><a href="/arrendar/guias/">Guias</a><a href="/">Início</a><a href="/#senhorios">Para senhorios</a><a href="/#termos">Termos e privacidade</a><a href="/en/rent/" hreflang="en">English</a><a href="/es/alquiler/" hreflang="es">Español</a><a href="/fr/location/" hreflang="fr">Français</a>'},
    'en': {'html': 'en', 'og': 'en_GB', 'mes': '/month', 'consulta': 'Price on request', 'abaixo': '{d}% below typical', 'alt': '{t} for rent in {l}',
           'tipos': {'Quarto': 'Room', 'Apartamento': 'Apartment', 'Moradia': 'House', 'T0': 'Studio', 'T1': '1-bed (T1)', 'T2': '2-bed (T2)', 'T3+': '3+ bed'},
           'casa': 'Home', 'aqui': 'You are here', 'faq': 'Frequently asked questions', 'ver': 'See homes', 'botao': 'Search with filters and alerts',
           'og_alt': 'DupliCasa: homes for rent in Portugal, in one place',
           'burla_t': 'Renting without falling for a scam',
           'burla': ['Visit the home before paying anything.', 'Be wary of rents far below the others in the area.', 'Check that the advertiser really is the owner.',
                     'Never pay a deposit to someone you have not met, by transfer, to "hold" a home.'],
           'burla_links': '',
           'rodape': 'DupliCasa · apartments and rooms for rent in Portugal, in one place. Listings updated on {d}.',
           'rodape_links': '<a href="/en/rent/">All cities</a><a href="/en/rent/prices/">Rent prices</a><a href="/">DupliCasa (Portuguese)</a><a href="/es/alquiler/" hreflang="es">Español</a><a href="/fr/location/" hreflang="fr">Français</a>'},
    'es': {'html': 'es', 'og': 'es_ES', 'mes': '/mes', 'consulta': 'Precio a consultar', 'abaixo': '{d}% por debajo de lo normal', 'alt': '{t} en alquiler en {l}',
           'tipos': {'Quarto': 'Habitación', 'Apartamento': 'Piso', 'Moradia': 'Casa', 'T0': 'Estudio', 'T1': 'T1 (1 dorm.)', 'T2': 'T2 (2 dorm.)', 'T3+': 'T3 o más'},
           'casa': 'Vivienda', 'aqui': 'Estás aquí', 'faq': 'Preguntas frecuentes', 'ver': 'Ver viviendas', 'botao': 'Buscar con filtros y alertas',
           'og_alt': 'DupliCasa: viviendas en alquiler en Portugal, en un solo lugar',
           'burla_t': 'Alquilar sin caer en una estafa',
           'burla': ['Visita la vivienda antes de pagar nada.', 'Desconfía de alquileres muy por debajo de los demás de la zona.', 'Confirma que quien anuncia es de verdad el propietario.',
                     'No pagues una señal por transferencia a alguien que no conoces para «reservar» una vivienda.'],
           'burla_links': '',
           'rodape': 'DupliCasa · pisos y habitaciones en alquiler en Portugal, en un solo lugar. Anuncios actualizados el {d}.',
           'rodape_links': '<a href="/es/alquiler/">Todas las ciudades</a><a href="/es/alquiler/precios/">Precio del alquiler</a><a href="/">DupliCasa (portugués)</a><a href="/en/rent/" hreflang="en">English</a><a href="/fr/location/" hreflang="fr">Français</a>'},
    'fr': {'html': 'fr', 'og': 'fr_FR', 'mes': '/mois', 'consulta': 'Prix sur demande', 'abaixo': '{d} % sous le prix habituel', 'alt': '{t} à louer à {l}',
           'tipos': {'Quarto': 'Chambre', 'Apartamento': 'Appartement', 'Moradia': 'Maison', 'T0': 'Studio', 'T1': 'T1 (1 chambre)', 'T2': 'T2 (2 chambres)', 'T3+': 'T3 ou plus'},
           'casa': 'Logement', 'aqui': 'Vous êtes ici', 'faq': 'Questions fréquentes', 'ver': 'Voir les logements', 'botao': 'Chercher avec filtres et alertes',
           'og_alt': 'DupliCasa : logements à louer au Portugal, en un seul endroit',
           'burla_t': 'Louer sans tomber dans une arnaque',
           'burla': ['Visitez le logement avant de payer quoi que ce soit.', 'Méfiez-vous des loyers très en dessous des autres dans le quartier.',
                     'Vérifiez que l’annonceur est bien le propriétaire.', 'Ne payez jamais d’acompte par virement à un inconnu pour « réserver » un logement.'],
           'burla_links': '',
           'rodape': 'DupliCasa · appartements et chambres à louer au Portugal, en un seul endroit. Annonces mises à jour le {d}.',
           'rodape_links': '<a href="/fr/location/">Toutes les villes</a><a href="/fr/location/prix/">Prix des loyers</a><a href="/">DupliCasa (portugais)</a><a href="/en/rent/" hreflang="en">English</a><a href="/es/alquiler/" hreflang="es">Español</a>'},
}


def cartao(a, lang='pt'):
    u = UI[lang]
    i = str(id_num(a['id']))
    t = tip(a) or a.get('tipo') or 'Casa'
    t = u['tipos'].get(t, u['casa'] if t == 'Casa' else t)
    partes = [t] + ([f"{a['area']} m²"] if area_ok(a) else []) + [a.get('bairro') or a.get('cidade') or '']
    foto = (a.get('fotos') or [''])[0]
    preco = (f"{num(a['renda']) if lang != 'en' else num(a['renda']).replace('.', ',')} €<small> {u['mes']}</small>") if a.get('renda') else u['consulta']
    img = (f'<img src="{e(foto)}" alt="{e(u["alt"].format(t=t, l=a.get("bairro") or a.get("cidade") or ""))}" '
           f'loading="lazy" width="400" height="250" referrerpolicy="no-referrer">' if foto else '<div class="sem"></div>')
    d = desconto(a)
    selo = f'<span class="neg">{u["abaixo"].format(d=d)}</span>' if d else ''
    return f'<a class="c" href="/#casa-{i}">{selo}{img}<div class="cc"><p class="p">{preco}</p><p class="l">{e(" · ".join(partes))}</p></div></a>'


def pagina(caminho, titulo, descricao, h1, intro, migalhas, cartoes, links, ver_todas, atualizado, extra='', faq=None, tabela='', artigo=None, botao=None,
           lang='pt', numeros_html='', titulo_cartoes='', indexar=True, dados=None, canonico=None, refrescar=None):
    """Uma página estática. `intro` é a resposta direta (40 a 60 palavras) nas páginas que respondem a uma pergunta.
    Sem `indexar`, leva noindex e fica fora do sitemap. `dados` acrescenta um Dataset (schema.org)."""
    u = UI[lang]
    botao = botao or u['botao']
    url = SITE + caminho
    if indexar and not refrescar:
        INDEXAVEIS.add(caminho)
    if len(titulo) > 65 and titulo.endswith(' | DupliCasa'):     # o Google corta títulos compridos: a marca sai primeiro
        titulo = titulo[:-len(' | DupliCasa')]
    org = {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'DupliCasa', 'url': SITE + '/', 'logo': SITE + '/marca/duaschaves-icone.png'}
    lds = [{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': n + 1, 'name': nome, 'item': SITE + c} for n, (nome, c) in enumerate(migalhas)]}]
    # Sem ItemList dos anúncios (são de outros sites e não têm endereço próprio aqui) e sem FAQPage (o Google já não
    # mostra a caixa): as perguntas ficam só como texto, onde ajudam quem lê.
    if artigo:
        lds.append({'@context': 'https://schema.org', '@type': 'Article', 'headline': h1, 'description': descricao, 'inLanguage': 'pt-PT',
                    'datePublished': artigo, 'dateModified': artigo if isinstance(artigo, str) and len(artigo) == 10 and not dados else '__MOD__',
                    'mainEntityOfPage': url, 'image': SITE + '/marca/duaschaves-og.png', 'author': org, 'publisher': org})
    if dados:
        lds.append(dict({'@context': 'https://schema.org', '@type': 'Dataset', 'url': url, 'inLanguage': u['html'], 'isAccessibleForFree': True,
                         'license': 'https://creativecommons.org/licenses/by/4.0/', 'creator': org, 'publisher': org,
                         'dateModified': '__MOD__', 'spatialCoverage': {'@type': 'Place', 'name': 'Portugal'}}, **dados))
    lds.append({'@context': 'https://schema.org', '@type': 'WebPage', '@id': url + '#pagina', 'name': titulo, 'url': url, 'inLanguage': u['html'],
                'description': descricao, 'dateModified': '__MOD__',
                'isPartOf': {'@type': 'WebSite', '@id': SITE + '/#site', 'name': 'DupliCasa', 'url': SITE + '/'}, 'publisher': org})
    nav = ' <span>›</span> '.join(f'<a href="{c}">{e(n)}</a>' if k < len(migalhas) - 1 else f'<span aria-current="page">{e(n)}</span>'
                                  for k, (n, c) in enumerate(migalhas))
    faq_html = (f'<section class="cx"><h2 style="margin-top:0">{u["faq"]}</h2>' + ''.join(
        f'<details><summary>{e(q)}</summary><p>{r}</p></details>' for q, r in faq) + '</section>') if faq else ''
    grelha = ((f'<h2>{e(titulo_cartoes)}</h2>' if titulo_cartoes else '') + f'<div class="g">{"".join(cartao(a, lang) for a in cartoes)}</div>') if cartoes else ''
    burla = ''.join(f'<li>{e(x)}</li>' for x in u['burla'])
    ld_html = ''.join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False).replace('</', '<\\/') + '</script>' for x in lds)
    robots = 'index, follow, max-image-preview:large, max-snippet:-1' if indexar and not refrescar else 'noindex, follow'
    meta_refrescar = f'<meta http-equiv="refresh" content="0; url={refrescar}">' if refrescar else ''
    return f'''<!DOCTYPE html>
<html lang="{u['html']}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title><meta name="description" content="{e(descricao)}"><link rel="canonical" href="{SITE + (canonico or caminho)}">{meta_refrescar}<!--alternos-->
<meta name="robots" content="{robots}">
<meta name="theme-color" content="#F3F5F4"><meta name="color-scheme" content="light">
<meta property="og:type" content="website"><meta property="og:site_name" content="DupliCasa"><meta property="og:locale" content="{u['og']}">
<meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(descricao)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/marca/duaschaves-og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(u['og_alt'])}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/marca/duaschaves-simbolo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/marca/duaschaves-icone-180.png">
{ld_html}
<style>
:root{{--f:#F3F5F4;--t:#0F1A17;--t2:#3E4A46;--t3:#55625E;--b:#DDE3E0;--v:#0B6E4F;--vc:#E3F1EA}}
*{{box-sizing:border-box}}body{{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--f);color:var(--t);font-size:16px;line-height:1.5}}
a{{color:inherit}}.w{{max-width:1120px;margin:0 auto;padding:0 20px}}
header{{border-bottom:1px solid var(--b);background:var(--f)}}header .w{{display:flex;align-items:center;justify-content:space-between;height:64px}}
.logo{{display:flex;align-items:center;gap:8px;font-weight:800;font-size:20px;text-decoration:none;letter-spacing:-.02em}}
.bt{{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:14px;background:var(--v);color:#fff;font-weight:700;text-decoration:none}}
.mig{{font-size:14px;color:var(--t3);margin:20px 0 8px}}.mig a{{color:var(--t3)}}.mig span{{margin:0 2px}}
h1{{font-size:34px;line-height:1.1;letter-spacing:-.03em;margin:0 0 12px}}h2{{font-size:22px;margin:40px 0 12px;letter-spacing:-.01em}}
.intro{{font-size:18px;color:var(--t2);max-width:760px;margin:0 0 20px}}.intro strong{{color:var(--t)}}
.g{{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}}
.c{{position:relative;display:block;background:#fff;border-radius:18px;overflow:hidden;text-decoration:none}}.c .neg{{position:absolute;left:10px;top:10px;padding:4px 10px;border-radius:999px;background:#F2A33A;color:#2A1A00;font-size:12.5px;font-weight:800}}.c img,.c .sem{{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#D6DDDA}}
.cc{{padding:14px 16px}}.p{{margin:0;font-weight:800;font-size:20px}}.p small{{font-weight:600;color:var(--t3);font-size:14px}}.l{{margin:4px 0 0;color:var(--t2);font-size:15px}}
.ch{{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}}.ch a{{display:inline-flex;min-height:44px;align-items:center;padding:0 16px;border:1px solid #C9D3CF;border-radius:999px;background:#fff;text-decoration:none;font-weight:600}}.ch a span{{font-weight:500;color:var(--t3);margin-left:6px;font-variant-numeric:tabular-nums}}
.cx{{background:#fff;border-radius:18px;padding:20px;margin-top:32px}}.cx p,.cx li{{color:var(--t2)}}
.num{{background:#fff;border-radius:18px;padding:20px;margin:28px 0 8px;border:1px solid var(--b)}}.num h2{{margin:0 0 14px;font-size:20px}}
.num dl{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 20px;margin:0}}.num dl div{{border-top:1px solid var(--b);padding-top:10px}}
.num dt{{font-size:14px;color:var(--t3)}}.num dd{{margin:2px 0 0;font-size:22px;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums}}
.fonte{{font-size:14px;color:var(--t3);margin:16px 0 0;max-width:820px}}.fonte a{{color:var(--v)}}
details{{border-top:1px solid var(--b);padding:12px 0}}details:first-of-type{{border-top:0}}summary{{font-weight:700;cursor:pointer;min-height:24px}}details p{{margin:8px 0 0}}
.tab{{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden;font-size:15px}}.tab th,.tab td{{text-align:left;padding:10px 12px;border-bottom:1px solid var(--b)}}.tab th{{color:var(--t3);font-weight:700}}.tab td.n,.tab th.n{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}.tab td a{{color:var(--v);font-weight:600}}.rolar .tab{{min-width:620px}}.tab tr.peq td{{color:var(--t3)}}
.rolar{{overflow-x:auto;border-radius:18px}}
.guia{{max-width:760px}}.guia h2{{margin-top:36px}}.guia p,.guia li{{font-size:17px;line-height:1.65;color:var(--t2)}}.guia li{{margin-bottom:6px}}.guia strong{{color:var(--t)}}.nota{{font-size:14px;color:var(--t3);margin-top:28px}}
footer{{margin-top:56px;border-top:1px solid var(--b);padding:28px 0 40px;font-size:14px;color:var(--t3)}}footer a{{margin-right:14px;white-space:nowrap;display:inline-block;line-height:2}}
@media(min-width:720px){{.num dl{{grid-template-columns:repeat(4,minmax(0,1fr))}}}}
@media(min-width:900px){{h1{{font-size:46px}}}}
</style><script defer src="/_e.js" data-site="duplicasa"></script></head><body>
<header><div class="w"><a class="logo" href="/" aria-label="DupliCasa, início">{LOGO}</a><a class="bt" href="{ver_todas}">{u['ver']}</a></div></header>
<main class="w">
<nav class="mig" aria-label="{u['aqui']}">{nav}</nav>
<h1>{e(h1)}</h1>
<p class="intro">{intro}</p>
<p><a class="bt" href="{ver_todas}">{botao}</a></p>
{numeros_html}
{grelha}
{tabela}
{links}
{faq_html}
<section class="cx"><h2 style="margin-top:0">{u['burla_t']}</h2>
<ul>{burla}</ul>
{f'<p>{u["burla_links"]}</p>' if u['burla_links'] else ''}</section>
{extra}
</main>
<footer><div class="w"><p>{e(u['rodape'].format(d=atualizado))}</p>
<p>{u['rodape_links']}<a href="https://dinissousa.pt" rel="noopener">Feito por dinissousa.pt</a></p></div></footer>
</body></html>
'''


def data_pt(iso):
    try:
        d = datetime.datetime.strptime(iso[:10], '%Y-%m-%d')
        return f'{d.day} de {MESES[d.month - 1]} de {d.year}'
    except Exception:
        return 'hoje'


def nome_tipo(tt, tn):
    return {'Quarto': 'Quartos', 'Apartamento': 'Apartamentos', 'Moradia': 'Moradias', 'T0': 'T0 e estúdios'}.get(tt, tn)


def palavra_alugar(tt):
    """«alugar» onde se pesquisa mais assim (cidade, quartos, apartamentos); «arrendar» nas tipologias e moradias."""
    return 'alugar' if tt in (None, 'Quarto', 'Apartamento') else 'arrendar'


NOME_LINHA = {'Quarto': 'Quarto', 'T0': 'T0 (estúdio)', 'T1': 'T1', 'T2': 'T2', 'T3+': 'T3 ou mais', 'Apartamento': 'Apartamento', 'Moradia': 'Moradia'}
TT_LINHAS = ('Quarto', 'T0', 'T1', 'T2', 'T3+')
SLUG_TT = {tt: ts for ts, _, tt in TIPOS}


def cap(t):
    return t[:1].upper() + t[1:]


def de(c):
    """«de Lisboa», «do Porto», «da Amadora» (a partir de em())."""
    x = em(c)
    return {'no ': 'do ', 'na ': 'da '}.get(x[:3], 'de ') + x[3:]


def chips(titulo, itens):
    """Lista de ligações em pastilhas. itens: (href, texto, número opcional)."""
    if not itens:
        return ''
    return f'<h2>{e(titulo)}</h2><ul class="ch">' + ''.join(
        f'<li><a href="{h}">{e(t)}{f"<span>{e(x)}</span>" if x else ""}</a></li>' for h, t, x in itens) + '</ul>'


def linha_fonte(extra=''):
    return (f'<p class="fonte">{e(FONTE_NUM)} Preço médio sem os 10% de rendas mais altas e mais baixas; sem número quando há menos de '
            f'{MIN_AMOSTRA} anúncios. {extra}Atualizado a {quando_html()}. <a href="/arrendar/precos/#metodo">Como calculamos</a></p>')


def tabela_tipologias(titulo, linhas, nome_cmp=None):
    """linhas: (tt, números, tendência, ligação, números para comparar)."""
    if not linhas:
        return ''
    cab = ('<th scope="col">Tipologia</th><th scope="col" class="n">Anúncios</th><th scope="col" class="n">Preço médio</th><th scope="col" class="n">Mediana</th>'
           + (f'<th scope="col" class="n">Mediana {e(em(nome_cmp))}</th>' if nome_cmp else '') + '<th scope="col" class="n">Tendência</th>')
    corpo = ''
    for tt, st, tend, href, cmp in linhas:
        nome = f'<a href="{href}">{e(NOME_LINHA[tt])}</a>' if href else e(NOME_LINHA[tt])
        corpo += (f'<tr{"" if st.get("media") else " class=peq"}><th scope="row">{nome}</th><td class="n">{num(st["n"])}</td>'
                  f'<td class="n">{eur(st["media"]) if st.get("media") else "—"}</td><td class="n">{eur(st["mediana"]) if st.get("mediana") else "—"}</td>'
                  + (f'<td class="n">{eur(cmp["mediana"]) if cmp and cmp.get("mediana") else "—"}</td>' if nome_cmp else '')
                  + f'<td class="n">{e(tend["curto"]) if st.get("media") else "—"}</td></tr>')
    return f'<h2>{e(titulo)}</h2><div class="rolar"><table class="tab"><thead><tr>{cab}</tr></thead><tbody>{corpo}</tbody></table></div>'


def tabela_zonas(titulo, linhas, colunas):
    """linhas: (nome, ligação, n, {coluna: números}); colunas: [(rótulo, chave, campo)]."""
    if not linhas:
        return ''
    cab = '<th scope="col">Freguesia</th><th scope="col" class="n">Anúncios</th>' + ''.join(f'<th scope="col" class="n">{e(r)}</th>' for r, _, _ in colunas)
    corpo = ''.join(f'<tr><th scope="row"><a href="{h}">{e(z)}</a></th><td class="n">{num(n)}</td>' + ''.join(
        f'<td class="n">{eur(d[k][c]) if d.get(k) and d[k].get(c) else "—"}</td>' for _, k, c in colunas) + '</tr>' for z, h, n, d in linhas)
    return f'<h2>{e(titulo)}</h2><div class="rolar"><table class="tab"><thead><tr>{cab}</tr></thead><tbody>{corpo}</tbody></table></div>'


def ordenar_cartoes(lista, tt=None):
    """Para a grelha: com fotografia, das mais baratas para as mais caras (as sem preço no fim)."""
    sel = [a for a in lista if a.get('fotos') and (tt is None or tipo_ok(a, tt))]
    return sorted(sel, key=lambda a: (not plausivel(a), a.get('renda') or 10 ** 9))


def frase_principal(st, tt, onde, hoje, pal='arrendar'):
    return (f'{cap(artigo_tt(tt))} para {pal} {onde} custa em média <strong>{eur(st["media"])}</strong> por mês (mediana de {eur(st["mediana"])}), '
            f'segundo {num(st["n"])} anúncios ativos a {hoje}.')


def frase_outras(sts, ordem):
    o = [t for t in ordem if sts.get(t, {}).get('media')][:2]
    if not o:
        return ''
    t = f'{cap(artigo_tt(o[0]))} custa em média {eur(sts[o[0]]["media"])}'
    if len(o) > 1:
        t += f' e {artigo_tt(o[1])} {eur(sts[o[1]]["media"])}'
    return t + '.'


def titulo_de(*bases):
    """O 1.º título que cabe: com a marca até 65 caracteres, sem ela até 60; se nenhum couber, o mais curto."""
    bases = [b for b in bases if b]
    for b in bases:
        if len(b) + 12 <= 65:
            return b + ' | DupliCasa'
        if len(b) <= 60:
            return b
    return min(bases, key=len)


def descricao_de(*frases, maximo=155):
    """Junta frases até 155 caracteres (salta as que não cabem)."""
    out = ''
    for f in frases:
        if f and len((out + ' ' + f).strip()) <= maximo:
            out = (out + ' ' + f).strip()
    return out


def curto_z(nz):
    """Nome curto de uma união de freguesias, para títulos («Almada, Cova da Piedade, Pragal e Cacilhas» -> «Almada»)."""
    return re.split(r',| e ', nz)[0].strip() if len(nz) > 24 else nz


def frases_extra(lista, tt=None):
    """Frases de apoio para a resposta direta (entram só se faltar texto): composição, €/m², novos, particulares, intervalo."""
    sel = [a for a in lista if tt is None or tipo_ok(a, tt)]
    pl = sorted(a['renda'] for a in sel if plausivel(a))
    out = []
    if tt is None:
        comp = []
        for t in TT_LINHAS:
            k = sum(1 for a in sel if tipo_ok(a, t))
            if k:
                comp.append(f'{num(k)} ' + ({'Quarto': 'quarto', 'T3+': 'T3 ou maior'}.get(t, t) if k == 1 else plural_tt(t)))
        if len(comp) > 1:
            out.append('Entre os anúncios há ' + ', '.join(comp[:-1]) + ' e ' + comp[-1] + '.')
    m2 = mediana([a['renda'] / a['area'] for a in sel if plausivel(a) and area_ok(a) and a.get('tipo') != 'Quarto'])
    if m2 and tt != 'Quarto':
        out.append(f'Por m², a mediana é de {m2txt(m2)} por mês.')
    limite = (AGORA - datetime.timedelta(days=7)).isoformat()[:19]
    k = sum(1 for a in sel if (a.get('data') or '')[:19] >= limite)
    if k:
        out.append(f'{num(k)} {"anúncio é" if k == 1 else "anúncios são"} dos últimos 7 dias.')
    k = sum(1 for a in sel if a.get('particular'))
    if k:
        out.append(f'{num(k)} {"é de um particular" if k == 1 else "são de particulares"}, sem agência.')
    if len(pl) >= 2:
        out.append(f'As rendas pedidas vão de {eur(pl[0])} a {eur(pl[-1])} por mês.')
    return out


def comparar(v, ref):
    """«12% abaixo» / «8% acima» / None se a diferença for pequena."""
    if not v or not ref:
        return None
    p = (v - ref) / ref * 100
    if abs(p) < 3:
        return 'ao nível'
    return f'{round(abs(p))}% {"abaixo" if p < 0 else "acima"}'


def gerar(anuncios, atualizado):
    global AGORA
    hoje = data_pt(atualizado)
    try:
        agora = datetime.datetime.fromisoformat((atualizado or '').replace('Z', '+00:00'))
    except ValueError:
        agora = datetime.datetime.now(datetime.timezone.utc)
    AGORA = agora
    VOLATEIS.add(hoje)
    SNAP.clear()
    INDEXAVEIS.clear()
    DIST.clear()
    DIST.update(mapa_distritos(anuncios))
    calc_normal(anuncios, agora)
    conhecidas = REG['paginas']
    paginas, mudou = {}, {}       # mudou: endereço antigo (zona escrita de outra maneira) -> endereço novo
    por_cidade = {}
    for a in anuncios:
        c = (a.get('cidade') or '').strip()
        if c:
            por_cidade.setdefault(c, []).append(a)

    def com_amostra(lista, minimo=MIN_CIDADE):
        """Vai para o Google: pelo menos 5 anúncios com preço e pelo menos uma tipologia com 5 (para haver média e mediana nossas)."""
        return (len(lista) >= minimo and sum(1 for a in lista if plausivel(a)) >= MIN_AMOSTRA
                and any(sum(1 for a in lista if plausivel(a) and tipo_ok(a, tt)) >= MIN_AMOSTRA for tt in TT_LINHAS))

    cidades = sorted([(c, l) for c, l in por_cidade.items() if com_amostra(l)], key=lambda x: -len(x[1]))
    nomes_idx = {c for c, _ in cidades}
    slugs_conhecidos = {p.split('/')[2] for p in conhecidas if p.startswith('/arrendar/') and p.count('/') >= 3}
    # cidades que já tiveram página e agora têm pouco: a página fica (sem índice) enquanto houver casas
    restantes = [(c, l) for c, l in por_cidade.items() if c not in nomes_idx and slug(c) in slugs_conhecidos]
    resumo = []      # para a página de preços, as outras línguas e o llms.txt
    for cidade, lista in cidades + restantes:
        s = slug(cidade)
        idx_c = cidade in nomes_idx
        base = f'/arrendar/{s}/'
        plaus = sorted([a for a in lista if plausivel(a)], key=lambda a: a['renda'])
        sts = {tt: conjunto(lista, tt) for _, _, tt in TIPOS}
        st_all = conjunto(lista)
        if idx_c:
            for tt, st in sts.items():
                guardar(f'c:{s}|{tt}', st)
        tends = {tt: tendencia(f'c:{s}|{tt}', st) for tt, st in sts.items()}
        meds = {tt: st.get('mediana') for tt, st in sts.items()}
        n_part = sum(1 for a in lista if a.get('particular'))
        minimo = plaus[0]['renda'] if plaus else None
        tipos_idx = [(ts, tn, tt) for ts, tn, tt in TIPOS if idx_c and sts[tt]['n'] >= MIN_AMOSTRA]
        tipos_fracos = [(ts, tn, tt) for ts, tn, tt in TIPOS if (ts, tn, tt) not in tipos_idx and sts[tt]['total'] and f'{base}{ts}/' in conhecidas]
        if idx_c:
            resumo.append({'cidade': cidade, 'slug': s, 'n': len(lista), 'quarto': meds.get('Quarto'), 'T0': meds.get('T0'), 'T1': meds.get('T1'),
                           'T2': meds.get('T2'), 't1_media': sts['T1'].get('media'), 'n_t1': sts['T1']['n'], 'm2': st_all['m2'], 'min': minimo,
                           'distrito': DIST.get(cidade, '')})
        # ---------- freguesias (zonas) da cidade ----------
        grupos = {}
        for a in lista:
            z = (a.get('bairro') or '').strip()
            if z and norm_t(z) != norm_t(cidade) and slug(z):
                grupos.setdefault(chave_zona(z), []).append(a)
        zonas = []
        for k, lz in grupos.items():
            variantes = collections.Counter(a['bairro'].strip() for a in lz)
            nome = variantes.most_common(1)[0][0]
            rk = f'{s}|{k}'
            zs = REG['zonas'].get(rk)
            if not zs:
                ja = [v for v, _ in variantes.most_common() if f'{base}zona/{slug(v)}/' in conhecidas]
                zs = slug(ja[0] if ja else nome)
            idx_z = idx_c and com_amostra(lz, MIN_ZONA)
            zst = {tt: conjunto(lz, tt) for tt in TT_LINHAS}
            if idx_z:
                for tt, st in zst.items():
                    guardar(f'z:{s}/{zs}|{tt}', st)
            zonas.append({'zs': zs, 'nome': nome, 'lista': lz, 'idx': idx_z, 'st': zst, 'rk': rk,
                          'outros': {slug(v) for v in variantes} - {zs}})
        zonas.sort(key=lambda z: -len(z['lista']))
        zonas_idx = [z for z in zonas if z['idx']]
        for z in zonas_idx:
            REG['zonas'][z['rk']] = z['zs']
        # ---------- página da cidade ----------
        ordem = ['T1', 'T2', 'T0', 'Quarto', 'T3+']
        p = next((t for t in ordem if sts[t].get('media')), None)
        onde = e(em(cidade))
        frases = []
        if p:
            frases.append(frase_principal(sts[p], p, onde, hoje))
            frases.append(frase_outras(sts, [t for t in ordem if t != p]))
            if tends[p].get('frase'):
                frases.append(f'Nos {plural_tt(p)}, {tends[p]["frase"]}.')
        frases.append(f'Há {num(len(lista))} casas e quartos para alugar {onde} na DupliCasa' + (f'; a renda mais baixa agora é de {eur(minimo)}.' if minimo else '.'))
        intro = resposta(frases + frases_extra(lista))
        linhas = [(tt, sts[tt], tends[tt], f'{base}{SLUG_TT[tt]}/' if any(x[2] == tt for x in tipos_idx) else None, None)
                  for tt in TT_LINHAS if sts[tt]['n']]
        extra_fonte = (f'Preço por m² (apartamentos e moradias): {m2txt(st_all["m2"])}. ' if st_all['m2'] else '') + \
                      (f'{num(st_all["novos7"])} anúncios novos nos últimos 7 dias. ' if st_all['novos7'] else '')
        bloco_num = (tabela_tipologias(f'Quanto custa arrendar {em(cidade)}', linhas) + linha_fonte(extra_fonte)) if linhas else ''
        lz_tab = [(z['nome'], f'{base}zona/{z["zs"]}/', len(z['lista']), z['st']) for z in zonas_idx[:40]]
        links = tabela_zonas(f'Rendas por freguesia {em(cidade)}', lz_tab, [('Quarto', 'Quarto', 'mediana'), ('T1', 'T1', 'mediana'), ('T2', 'T2', 'mediana')])
        if lz_tab:
            links += '<p class="fonte">Mediana das rendas pedidas em cada freguesia; «—» quando há menos de 5 anúncios dessa tipologia.</p>'
        links += chips('Por tipo de casa', [(f'{base}{ts}/', f'{nome_tipo(tt, tn)} {em(cidade)}', eur(sts[tt]['media']) if sts[tt].get('media') else '') for ts, tn, tt in tipos_idx])
        precos_pag = []
        for teto in TETOS:
            n_t = sum(1 for a in plaus if a['renda'] <= teto)
            bom = idx_c and n_t >= MIN_PRECO and n_t <= 0.85 * len(plaus) and any(a['renda'] <= teto and a.get('fotos') for a in plaus)
            if bom or (n_t and f'{base}ate-{teto}/' in conhecidas):
                precos_pag.append((teto, n_t, bom))
        links += chips('Por renda máxima', [(f'{base}ate-{t}/', f'Até {num(t)} €', f'{n}') for t, n, b in precos_pag if b])
        if idx_c:
            vizinhas = [c for c, _ in cidades if c != cidade and DIST.get(c) and DIST.get(c) == DIST.get(cidade)][:12]
            links += chips('Perto ' + de(cidade), [(f'/arrendar/{slug(c)}/', f'Casas para alugar {em(c)}', '') for c in vizinhas])
        links += chips('Preços em todo o país', [('/arrendar/precos/', 'Preço das rendas por concelho', ''),
                                                  ('/arrendar/precos/t1-por-distrito/', 'Quanto custa um T1 em cada distrito', '')])
        faq = [(f'Há casas para alugar a particulares {em(cidade)}?',
                f'Sim. Dos {num(len(lista))} anúncios {e(em(cidade))}, {num(n_part)} são de particulares, sem agência. Na pesquisa da DupliCasa podes mostrar só esses.'
                if n_part else f'Neste momento os anúncios {e(em(cidade))} são de agências. Cria um alerta e avisamos-te quando aparecer uma casa de um particular.'),
               ('Como recebo as casas novas primeiro?', 'Cria um alerta grátis na DupliCasa: recebes um resumo por dia. Com o acesso, o aviso chega no minuto em que a casa aparece.')]
        desde = f' desde {eur(minimo)}' if minimo else ''
        desc = f'{num(len(lista))} casas e quartos para alugar {em(cidade)}.'
        if sts['T1'].get('media'):
            desc += f' Um T1 custa em média {eur(sts["T1"]["media"])}' + (f' e um quarto {eur(sts["Quarto"]["media"])}.' if sts['Quarto'].get('media') else '.')
        desc += ' Preços por tipologia e freguesia, atualizados todos os dias.'
        paginas[base] = pagina(
            base, f'Casas para alugar {em(CURTO.get(cidade, cidade))}{desde} | DupliCasa', desc,
            f'Casas para alugar {em(nome_pesquisa(cidade))}', intro,
            [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, base)],
            ordenar_cartoes(lista)[:MAX_CARTOES], links, '/#pesquisa?cidade=' + quote(cidade), hoje, faq=faq,
            numeros_html=bloco_num, titulo_cartoes=f'As mais baratas {em(cidade)} agora', indexar=idx_c)
        # ---------- cidade + tipologia ----------
        for ts, tn, tt in tipos_idx + tipos_fracos:
            st, tend = sts[tt], tends[tt]
            idx_t = (ts, tn, tt) in tipos_idx
            nome = nome_tipo(tt, tn)
            pal = palavra_alugar(tt)
            cam = f'{base}{ts}/'
            zt = [(z, z['st'].get(tt) or conjunto(z['lista'], tt)) for z in zonas_idx]
            zt = [(z, x) for z, x in zt if x.get('mediana')]
            if st.get('media'):
                frases = [frase_principal(st, tt, onde, hoje, pal)]
                frases.append(f'Metade pede entre {num(st["p25"])} e {eur(st["p75"])}; o mais barato agora custa {eur(st["min"])}.' if st.get('p25')
                              else f'O mais barato agora custa {eur(st["min"])}.')
                if tend.get('frase'):
                    frases.append(cap(tend['frase']) + '.')
                if len(zt) >= 2:
                    zb = min(zt, key=lambda x: x[1]['mediana'])
                    frases.append(f'Na freguesia mais barata, {e(zb[0]["nome"])}, a mediana é de {eur(zb[1]["mediana"])}.')
                intro = resposta(frases + frases_extra(lista, tt))
            else:
                intro = (f'Há {num(st["total"])} {plural_tt(tt)} para {pal} {onde} na DupliCasa a {hoje}. Com menos de {MIN_AMOSTRA} anúncios com preço, '
                         f'não calculamos média nem mediana: vê as casas ou cria um alerta para saberes das novas.')
            caixa_html = caixa(f'{nome} {em(cidade)} em números', st, tend) if st.get('media') else ''
            tab_z = tabela_zonas(f'{nome} por freguesia {em(cidade)}', [
                (z['nome'], f'{base}zona/{z["zs"]}/' + (f'{ts}/' if ts in TIPOS_ZONA and x['n'] >= MIN_AMOSTRA else ''), x['n'], {'x': x})
                for z, x in sorted(zt, key=lambda y: -y[1]['n'])[:40]], [('Preço médio', 'x', 'media'), ('Mediana', 'x', 'mediana')])
            outros = chips(f'Outros tipos de casa {em(cidade)}', [(f'{base}{x}/', f'{nome_tipo(t2, n)} {em(cidade)}', eur(sts[t2]['media']) if sts[t2].get('media') else '')
                                                                   for x, n, t2 in tipos_idx if x != ts] + [(base, f'Todas as casas {em(cidade)}', '')])
            tips_q = {'Quarto': 'Quarto', 'Apartamento': '', 'Moradia': ''}.get(tt, tt)
            if st.get('media'):
                cc = CURTO.get(cidade, cidade)
                titulo = titulo_de(f'{nome} para {pal} {em(cidade)} desde {eur(st["min"])}, média {eur(st["media"])}',
                                   f'{nome} para {pal} {em(cc)} desde {eur(st["min"])}, média {eur(st["media"])}',
                                   f'{nome} para {pal} {em(cc)}: média {eur(st["media"])}', f'{nome} {em(cc)}: média {eur(st["media"])}')
                desc = descricao_de(f'{nome} para {pal} {em(cidade)}: preço médio {eur(st["media"])} por mês, mediana {eur(st["mediana"])}, {num(st["n"])} anúncios.',
                                    'Por freguesia e os mais baratos, atualizados todos os dias.', 'Atualizado todos os dias.')
            else:
                titulo = f'{nome} para {pal} {em(cidade)} | DupliCasa'
                desc = f'{nome} para {pal} {em(cidade)}, dos mais baratos para os mais caros. Alertas de casas novas no minuto em que aparecem.'
            paginas[cam] = pagina(
                cam, titulo, desc, f'{nome} para {pal} {em(cidade)}', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, base), (nome, cam)],
                ordenar_cartoes(lista, tt)[:MAX_CARTOES], tab_z + outros,
                '/#pesquisa?cidade=' + quote(cidade) + ('&amp;tips=' + quote(tips_q) if tips_q else ''), hoje,
                numeros_html=caixa_html, titulo_cartoes=f'{cap(plural_tt(tt))} mais {"baratas" if tt == "Moradia" else "baratos"} {em(cidade)} agora',
                indexar=idx_t)
        voltar = chips(f'Mais {em(cidade)}', [(base, f'Todas as casas {em(cidade)}', '')] + [(f'{base}{ts}/', f'{nome_tipo(tt, tn)} {em(cidade)}', '') for ts, tn, tt in tipos_idx])
        # ---------- renda máxima na cidade ----------
        for teto, n_t, bom in precos_pag:
            sub = [a for a in plaus if a['renda'] <= teto and a.get('fotos')]
            n_q = sum(1 for a in plaus if a['renda'] <= teto and a.get('tipo') == 'Quarto')
            n_c = n_t - n_q
            partes = [f'{num(n_c)} {"casa" if n_c == 1 else "casas"}'] if n_c else []
            if n_q:
                partes.append(f'{num(n_q)} {"quarto" if n_q == 1 else "quartos"}')
            intro = (f'{cap(" e ".join(partes))} para arrendar {onde} com renda até {num(teto)} € por mês, '
                     f'da mais barata para a mais cara. A mais barata custa {eur(plaus[0]["renda"])}. Atualizado a {hoje}.')
            oque = 'Quartos' if not n_c else ('Casas' if not n_q else 'Casas e quartos')   # o título diz o que há mesmo
            outros_t = chips('Outras faixas de preço', [(f'{base}ate-{t}/', f'Até {num(t)} €', '') for t, _, b in precos_pag if t != teto and b])
            faq_p = [(f'Há casas para alugar {em(cidade)} até {num(teto)} €?', f'Sim: {" e ".join(partes)} com renda até {num(teto)} € por mês, nos anúncios da DupliCasa a {hoje}.'),
                     ('Como sei das casas baratas antes dos outros?', 'Cria um alerta com a renda máxima que queres pagar. Recebes um resumo grátis por dia; com o acesso, o aviso chega no minuto em que a casa aparece.')]
            paginas[f'{base}ate-{teto}/'] = pagina(
                f'{base}ate-{teto}/', f'{oque} para alugar {em(CURTO.get(cidade, cidade))} até {num(teto)} € | DupliCasa',
                f'{cap(" e ".join(partes))} para alugar {em(cidade)} com renda até {num(teto)} € por mês, das mais baratas para as mais caras. Sabe das novas no minuto.',
                f'{oque} para alugar {em(CURTO.get(cidade, cidade))} até {num(teto)} €', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, base), (f'Até {num(teto)} €', f'{base}ate-{teto}/')],
                sub[:MAX_CARTOES], outros_t + voltar, '/#pesquisa?cidade=' + quote(cidade) + f'&amp;max={teto}', hoje, faq=faq_p, indexar=bom)
        # ---------- freguesias ----------
        for z in zonas:
            zs, nz, lz, zst = z['zs'], z['nome'], z['lista'], z['st']
            cam_z = f'{base}zona/{zs}/'
            if not z['idx'] and cam_z not in conhecidas:
                continue
            ondez = e(em(nz))
            tends_z = {tt: tendencia(f'z:{s}/{zs}|{tt}', st) for tt, st in zst.items()}
            pz = sorted([a for a in lz if plausivel(a)], key=lambda a: a['renda'])
            tz_idx = [ts for ts in TIPOS_ZONA if z['idx'] and zst[TT_DE_SLUG[ts]]['n'] >= MIN_AMOSTRA]
            pz_t = next((t for t in ordem if zst[t].get('media')), None)
            frases = []
            if pz_t:
                frases.append(f'{cap(ondez)}, {e(cidade)}, {artigo_tt(pz_t)} para arrendar custa em média <strong>{eur(zst[pz_t]["media"])}</strong> por mês '
                              f'(mediana de {eur(zst[pz_t]["mediana"])}), segundo {num(zst[pz_t]["n"])} anúncios ativos a {hoje}.')
                frases.append(frase_outras(zst, [t for t in ordem if t != pz_t]))
                cmp = comparar(zst[pz_t]['media'], sts[pz_t].get('media'))
                if cmp and cmp != 'ao nível':
                    frases.append(f'É {cmp} da média dos {plural_tt(pz_t)} {e(de(cidade))} ({eur(sts[pz_t]["media"])}).')
            frases.append(f'Há {num(len(lz))} casas e quartos para alugar {ondez} na DupliCasa' + (f'; a renda mais baixa é de {eur(pz[0]["renda"])}.' if pz else '.'))
            intro = resposta(frases + frases_extra(lz))
            linhas = [(tt, zst[tt], tends_z[tt], f'{cam_z}{SLUG_TT[tt]}/' if SLUG_TT[tt] in tz_idx else None, sts[tt]) for tt in TT_LINHAS if zst[tt]['n']]
            bloco = (tabela_tipologias(f'Quanto custa arrendar {em(nz)}', linhas, nome_cmp=cidade) + linha_fonte()) if linhas else ''
            outras_z = chips('Outras freguesias ' + em(cidade), [(f'{base}zona/{x["zs"]}/', x['nome'], f'{len(x["lista"])}') for x in zonas_idx if x is not z][:24])
            tipos_z = chips(f'Por tipologia {em(nz)}', [(f'{cam_z}{ts}/', f'{nome_tipo(tt, tn)} {em(nz)}', '') for ts, tn, tt in TIPOS if ts in tz_idx])
            t1z = zst['T1'].get('media')
            desc = descricao_de(f'{num(len(lz))} casas e quartos para alugar {em(nz)}, {cidade}.', f'Um T1 custa em média {eur(t1z)}.' if t1z else '',
                                'Preço médio e mediana por tipologia, atualizados todos os dias.', 'Atualizado todos os dias.')
            cc = CURTO.get(cidade, cidade)
            paginas[cam_z] = pagina(
                cam_z, titulo_de(f'Casas para alugar {em(nz)} ({cc})', f'Casas para alugar {em(nz)}', f'Casas para alugar {em(curto_z(nz))} ({cc})',
                                 f'Casas para alugar {em(curto_z(nz))}'), desc,
                f'Casas para alugar {em(nz)}, {cidade}', intro,
                [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, base), (nz, cam_z)],
                ordenar_cartoes(lz)[:MAX_CARTOES], tipos_z + outras_z + voltar, '/#pesquisa?cidade=' + quote(nz), hoje,
                numeros_html=bloco, titulo_cartoes=f'As mais baratas {em(nz)} agora', indexar=z['idx'])
            # ---------- freguesia + tipologia (T0, T1, T2, quartos) ----------
            for ts, tn, tt in TIPOS:
                if ts not in TIPOS_ZONA:
                    continue
                cam_t = f'{cam_z}{ts}/'
                st = zst[tt]
                idx_t = ts in tz_idx
                if not idx_t and not (st['total'] and cam_t in conhecidas):
                    continue
                nome, pal = nome_tipo(tt, tn), palavra_alugar(tt)
                tend = tends_z[tt]
                stc = sts[tt]
                if st.get('media'):
                    frases = [f'{cap(artigo_tt(tt))} para {pal} {ondez}, {e(cidade)}, custa em média <strong>{eur(st["media"])}</strong> por mês '
                              f'(mediana de {eur(st["mediana"])}), segundo {num(st["n"])} anúncios ativos a {hoje}.']
                    cmp = comparar(st['media'], stc.get('media'))
                    if cmp:
                        frases.append(f'Está ao nível da média dos {plural_tt(tt)} {e(de(cidade))} ({eur(stc["media"])}).' if cmp == 'ao nível'
                                      else f'Fica {cmp} da média dos {plural_tt(tt)} {e(de(cidade))} ({eur(stc["media"])}).')
                    frases.append(f'Metade pede entre {num(st["p25"])} e {eur(st["p75"])}; o mais barato agora custa {eur(st["min"])}.' if st.get('p25')
                                  else f'O mais barato agora custa {eur(st["min"])}.')
                    if tend.get('frase'):
                        frases.append(cap(tend['frase']) + '.')
                    intro = resposta(frases + frases_extra(lz, tt))
                else:
                    intro = (f'Há {num(st["total"])} {plural_tt(tt)} para {pal} {ondez}, {e(cidade)}, na DupliCasa a {hoje}. Com menos de {MIN_AMOSTRA} anúncios com preço, '
                             'não calculamos média nem mediana: vê também as outras freguesias.')
                extra_c = [(f'Média {de(cidade)}', eur(stc['media']) if stc.get('media') else '—')]
                caixa_html = caixa(f'{nome} {em(nz)} em números', st, tend, extra_c) if st.get('media') else ''
                outras = [(x, x['st'][tt]) for x in zonas_idx if x is not z and x['st'][tt].get('media')]
                outras.sort(key=lambda y: -y[1]['n'])
                lk = chips(f'{nome} noutras freguesias {de(cidade)}', [(f'{base}zona/{x["zs"]}/' + (f'{ts}/' if xs['n'] >= MIN_AMOSTRA else ''), f'{nome} {em(x["nome"])}', eur(xs['media']))
                                                                     for x, xs in outras[:24]])
                lk += chips(f'Mais {em(nz)}', [(cam_z, f'Todas as casas {em(nz)}', '')] + [(f'{cam_z}{x}/', f'{nome_tipo(t2, n2)} {em(nz)}', '') for x, n2, t2 in TIPOS if x in tz_idx and x != ts])
                lk += chips(f'Mais {em(cidade)}', [(f'{base}{ts}/', f'{nome} {em(cidade)}', eur(stc['media']) if stc.get('media') else ''), (base, f'Todas as casas {em(cidade)}', '')])
                tips_q = 'Quarto' if tt == 'Quarto' else tt
                if st.get('media'):
                    cc = CURTO.get(cidade, cidade)
                    md = eur(st['media'])
                    titulo = titulo_de(f'{nome} para {pal} {em(nz)} ({cc}): média {md}', f'{nome} para {pal} {em(nz)}: média {md}',
                                       f'{nome} {em(nz)} ({cc}): média {md}', f'{nome} para {pal} {em(curto_z(nz))} ({cc}): média {md}',
                                       f'{nome} {em(curto_z(nz))} ({cc}): média {md}', f'{nome} {em(curto_z(nz))}: média {md}')
                    desc = descricao_de(f'{nome} para {pal} {em(nz)}, {cidade}: preço médio {md}, mediana {eur(st["mediana"])} e {num(st["n"])} anúncios.',
                                        f'Comparados com o resto {de(cidade)} e atualizados todos os dias.', 'Atualizado todos os dias.')
                else:
                    titulo = titulo_de(f'{nome} para {pal} {em(nz)} ({CURTO.get(cidade, cidade)})', f'{nome} para {pal} {em(curto_z(nz))} ({CURTO.get(cidade, cidade)})')
                    desc = f'{nome} para {pal} {em(nz)}, {cidade}, dos mais baratos para os mais caros. Alertas de casas novas no minuto em que aparecem.'
                paginas[cam_t] = pagina(
                    cam_t, titulo, desc, f'{nome} para {pal} {em(nz)}, {cidade}', intro,
                    [('Início', '/'), ('Arrendar', '/arrendar/'), (cidade, base), (nz, cam_z), (nome, cam_t)],
                    ordenar_cartoes(lz, tt)[:MAX_CARTOES], lk, '/#pesquisa?cidade=' + quote(nz) + '&amp;tips=' + quote(tips_q), hoje,
                    numeros_html=caixa_html, titulo_cartoes=f'{cap(plural_tt(tt))} mais baratos {em(nz)} agora', indexar=idx_t)
            # a mesma freguesia escrita de outra maneira (endereço antigo): passa para o endereço novo
            if z['idx']:
                for velho in z['outros']:
                    for suf in [''] + [f'{ts}/' for ts in TIPOS_ZONA]:
                        antigo = f'{base}zona/{velho}/{suf}'
                        if antigo in conhecidas:
                            novo = f'{cam_z}{suf}' if (not suf or suf[:-1] in tz_idx) else cam_z
                            mudou[antigo] = novo
    # ---------- regiões: distritos (com o nome por que se pesquisam) e grupos de cidades ----------
    regioes = {}
    medias = sorted([(c, l) for c, l in por_cidade.items() if len(l) >= MIN_CIDADE], key=lambda x: -len(x[1]))
    for c, l in medias:
        d = DIST.get(c, '')
        if d:
            nome = REGIAO_NOME.get(d, 'Distrito ' + ('do ' if norm_t(d) in NO else ('da ' if norm_t(d) in NA else 'de ')) + d)
            regioes.setdefault(nome, []).append((c, l))
    for g, cs in GRUPOS.items():
        regioes[g] = [(c, por_cidade[c]) for c in cs if c in por_cidade and len(por_cidade[c]) >= MIN_CIDADE]
    regioes_pag = {}
    for nome, cs in regioes.items():
        todas = [a for _, l in cs for a in l]
        rs = slug(nome)
        bom = len(cs) >= 2 and com_amostra(todas, 10)
        if not bom and f'/arrendar/regiao/{rs}/' not in conhecidas:
            continue
        prep = REGIAO_EM.get(nome, ('no ' + nome[0].lower() + nome[1:]) if nome.startswith('Distrito') else em(nome))
        pr = sorted([a for a in todas if plausivel(a)], key=lambda a: a['renda'])
        sub = [a for a in pr if a.get('fotos')]
        st1 = conjunto(todas, 'T1')
        frases = []
        if st1.get('media'):
            frases.append(frase_principal(st1, 'T1', e(prep), hoje))
        stq = conjunto(todas, 'Quarto')
        if stq.get('media'):
            frases.append(f'Um quarto custa em média {eur(stq["media"])}.')
        if pr:
            frases.append(f'Há {num(len(todas))} casas, apartamentos e quartos para arrendar {e(prep)}, em {len(cs)} cidades; a renda mais baixa é de {eur(pr[0]["renda"])}.')
        intro = resposta(frases + frases_extra(todas))
        cs_ord = sorted(cs, key=lambda x: -len(x[1]))
        r_cid = {c: {tt: conjunto(l, tt) for tt in ('Quarto', 'T1', 'T2')} for c, l in cs_ord}
        tab = ('<h2>Rendas por cidade</h2><div class="rolar"><table class="tab"><thead><tr><th scope="col">Cidade</th><th scope="col" class="n">Anúncios</th>'
               '<th scope="col" class="n">Quarto</th><th scope="col" class="n">T1</th><th scope="col" class="n">T2</th></tr></thead><tbody>' + ''.join(
                   '<tr><th scope="row">' + (f'<a href="/arrendar/{slug(c)}/">{e(c)}</a>' if c in nomes_idx else e(c)) + f'</th><td class="n">{num(len(l))}</td>' + ''.join(
                       f'<td class="n">{eur(r_cid[c][tt]["mediana"]) if r_cid[c][tt].get("mediana") else "—"}</td>' for tt in ('Quarto', 'T1', 'T2')) + '</tr>'
                   for c, l in cs_ord) + '</tbody></table></div>' + linha_fonte('Valores da tabela: mediana. ')) if cs_ord else ''
        if bom:
            regioes_pag[nome] = (rs, len(todas))
        paginas[f'/arrendar/regiao/{rs}/'] = pagina(
            f'/arrendar/regiao/{rs}/', f'Casas para alugar {prep} | DupliCasa',
            f'{num(len(todas))} casas, apartamentos e quartos para alugar {prep}.' + (f' Um T1 custa em média {eur(st1["media"])}.' if st1.get('media') else '')
            + ' Rendas por cidade, atualizadas todos os dias.',
            f'Casas para alugar {prep}', intro,
            [('Início', '/'), ('Arrendar', '/arrendar/'), (nome, f'/arrendar/regiao/{rs}/')],
            sub[:MAX_CARTOES], '', '/#pesquisa', hoje, numeros_html=tab, titulo_cartoes=f'As mais baratas {prep} agora', indexar=bom)
    # ---------- renda máxima em todo o país ----------
    plaus_pt = sorted([a for a in anuncios if plausivel(a)], key=lambda a: a['renda'])
    tetos_pt = []
    for teto in TETOS:
        sub = [a for a in plaus_pt if a['renda'] <= teto]
        if len(sub) < MIN_PRECO and f'/arrendar/ate-{teto}/' not in conhecidas:
            continue
        if not sub:
            continue
        bom = len(sub) >= MIN_PRECO
        if bom:
            tetos_pt.append(teto)
        por_c = collections.Counter(a.get('cidade') or '' for a in sub)
        com_teto = {(cc, t) for cc, l in cidades for t in TETOS if f'/arrendar/{slug(cc)}/ate-{t}/' in paginas and f'/arrendar/{slug(cc)}/ate-{t}/' in INDEXAVEIS}
        lk = chips('Onde há mais', [(f'/arrendar/{slug(c)}/' + (f'ate-{teto}/' if (c, teto) in com_teto else ''), c, f'{n}')
                                    for c, n in por_c.most_common(40) if c in nomes_idx][:24])
        paginas[f'/arrendar/ate-{teto}/'] = pagina(
            f'/arrendar/ate-{teto}/', f'Casas para alugar até {num(teto)} € em Portugal | DupliCasa',
            f'{num(len(sub))} casas e quartos para alugar em Portugal com renda até {num(teto)} € por mês, das mais baratas para as mais caras. Sabe das novas no minuto.',
            f'Casas para alugar até {num(teto)} € em Portugal',
            f'{num(len(sub))} casas e quartos para arrendar com renda até {num(teto)} € por mês, de vários sites, num só lugar. Atualizado a {hoje}.',
            [('Início', '/'), ('Arrendar', '/arrendar/'), (f'Até {num(teto)} €', f'/arrendar/ate-{teto}/')],
            [a for a in sub if a.get('fotos')][:MAX_CARTOES], lk, f'/#pesquisa?max={teto}', hoje, indexar=bom)
    # ---------- índice de cidades, agrupado por distrito ----------
    por_distrito = {}
    for c, l in cidades:
        por_distrito.setdefault(DIST.get(c) or 'Outros', []).append((c, len(l)))
    blocos = ''.join(chips(d, [(f'/arrendar/{slug(c)}/', c, f'{n}') for c, n in sorted(cs)]) for d, cs in sorted(por_distrito.items()))
    blocos = (chips('Quanto custa arrendar', [('/arrendar/precos/', 'Preço das rendas por concelho', ''), ('/arrendar/precos/t1-por-distrito/', 'Quanto custa um T1 em cada distrito', '')])
              + chips('Por renda máxima', [(f'/arrendar/ate-{t}/', f'Até {num(t)} €', '') for t in tetos_pt])
              + chips('Por região', [(f'/arrendar/regiao/{rs}/', n, num(k)) for n, (rs, k) in sorted(regioes_pag.items())]) + blocos)
    baratas = sorted([a for a in anuncios if plausivel(a) and a.get('fotos') and tip(a) in ('T0', 'T1', 'Quarto')], key=lambda a: a['renda'])[:12]
    st_pt = {tt: conjunto(anuncios, tt) for tt in TT_LINHAS}
    for tt, st in st_pt.items():
        guardar(f'pt|{tt}', st, completo=True)
    frases = []
    if st_pt['T1'].get('media'):
        frases.append(frase_principal(st_pt['T1'], 'T1', 'em Portugal', hoje))
    frases.append(frase_outras(st_pt, ['Quarto', 'T2']))
    frases.append(f'Há {num(len(anuncios))} casas, apartamentos e quartos para arrendar em {len(cidades)} cidades, de vários sites, num só lugar. Escolhe a cidade.')
    paginas['/arrendar/'] = pagina(
        '/arrendar/', 'Casas e quartos para alugar em Portugal, por cidade | DupliCasa',
        f'{num(len(anuncios))} casas, apartamentos e quartos para alugar em {len(cidades)} cidades de Portugal, juntos num só lugar. Alertas de casas novas no minuto em que aparecem.',
        'Casas e quartos para alugar em Portugal', resposta(frases),
        [('Início', '/'), ('Arrendar', '/arrendar/')], baratas, blocos, '/#pesquisa', hoje, titulo_cartoes='T0, T1 e quartos mais baratos agora')
    ficheiros = {}
    gerar_precos(paginas, ficheiros, resumo, hoje, anuncios)
    gerar_estudo(paginas, ficheiros, anuncios, hoje)
    return paginas, resumo, ficheiros, mudou


NOME_DIST = {'Ilha da Madeira': 'Madeira', 'Ilha de São Miguel': 'Açores (São Miguel)', 'Ilha Terceira': 'Açores (Terceira)'}
TT_DE_SLUG = {ts: tt for ts, _, tt in TIPOS}


def metodo_html():
    i = inicio_hist()
    return ('<section class="cx guia" id="metodo"><h2 style="margin-top:0">Como calculamos</h2><ul>'
            '<li><strong>Fonte:</strong> anúncios públicos de arrendamento de vários sites portugueses, recolhidos pela DupliCasa de 30 em 30 minutos. '
            'A mesma casa anunciada em mais de um site conta uma vez.</li>'
            '<li><strong>Que anúncios:</strong> os que estão ativos, publicados há menos de 60 dias. Quando saem do site de origem, saem também daqui.</li>'
            '<li><strong>Preço pedido, não preço de contrato:</strong> são as rendas que os senhorios pedem nos anúncios. As estatísticas do INE medem os '
            'contratos novos, em euros por m², e por isso não se comparam diretamente com estas.</li>'
            '<li><strong>Rendas implausíveis ficam de fora:</strong> quartos abaixo de 150 € e casas abaixo de 300 € por mês (quase sempre erros).</li>'
            '<li><strong>Preço médio:</strong> média sem os 10% de rendas mais baixas e os 10% mais altas (pelo menos uma de cada lado), arredondada a 5 €, '
            'para que um anúncio de luxo ou um erro não puxem a média.</li>'
            '<li><strong>Mediana:</strong> a renda do meio: metade dos anúncios pede menos, metade pede mais.</li>'
            f'<li><strong>Amostra mínima:</strong> só mostramos média e mediana com pelo menos {MIN_AMOSTRA} anúncios com preço; a tendência, com pelo menos '
            f'{TEND_MIN_N} no dia de hoje e no dia com que comparamos. Páginas com menos de {MIN_AMOSTRA} anúncios não vão para o Google.</li>'
            f'<li><strong>Tendência:</strong> diferença da mediana face a há cerca de 30 dias (entre {TEND_DIAS[0]} e {TEND_DIAS[1]}), com o histórico diário '
            f'que guardamos desde {data_pt(i.isoformat())}.</li>'
            '<li><strong>Tipologias:</strong> T0, T1, T2… pelo número de quartos de apartamentos e moradias; «quarto» é um quarto para alugar numa casa partilhada.</li>'
            '<li><strong>Distrito:</strong> o do concelho da casa. A Madeira e os Açores aparecem como regiões autónomas.</li></ul>'
            '<p>Pode usar estes números citando a DupliCasa (duplicasa.pt), com a licença CC BY 4.0.</p></section>')


def csv_txt(linhas):
    """CSV para abrir no Excel em português: ponto e vírgula, vírgula decimal e BOM UTF-8."""
    def c(v):
        if v is None:
            return ''
        if isinstance(v, float):
            return str(round(v, 2)).replace('.', ',')
        v = str(v)
        return '"' + v.replace('"', '""') + '"' if any(x in v for x in ';"\n') else v
    return '﻿' + ''.join(';'.join(c(v) for v in l) + '\r\n' for l in linhas)


def gerar_precos(paginas, ficheiros, resumo, hoje, anuncios):
    """Preço das rendas por concelho: a tabela, a resposta direta, o método e os dados para descarregar (Dataset)."""
    linhas = sorted([r for r in resumo if r['n'] >= 10], key=lambda r: -r['n'])
    f = lambda v: eur(v) if v else '—'
    tabela = ('<h2>Renda mediana por concelho</h2><div class="rolar"><table class="tab"><thead><tr><th scope="col">Concelho</th><th scope="col">Distrito</th>'
              '<th scope="col" class="n">Anúncios</th><th scope="col" class="n">Quarto</th><th scope="col" class="n">T0</th><th scope="col" class="n">T1</th>'
              '<th scope="col" class="n">T2</th><th scope="col" class="n">€/m²</th></tr></thead><tbody>' + ''.join(
                  f'<tr><th scope="row"><a href="/arrendar/{r["slug"]}/">{e(r["cidade"])}</a></th><td>{e(NOME_DIST.get(r["distrito"], r["distrito"]))}</td>'
                  f'<td class="n">{num(r["n"])}</td><td class="n">{f(r["quarto"])}</td><td class="n">{f(r["T0"])}</td><td class="n">{f(r["T1"])}</td>'
                  f'<td class="n">{f(r["T2"])}</td><td class="n">{m2txt(r["m2"])}</td></tr>' for r in linhas) +
              '</tbody></table></div>' + linha_fonte('Concelhos com pelo menos 10 anúncios. Valores da tabela: mediana. ') +
              '<p><a class="bt" href="/arrendar/precos/rendas-por-concelho.csv" download>Descarregar os dados (CSV)</a></p>')
    dia = AGORA.date().isoformat()
    ficheiros['/arrendar/precos/rendas-por-concelho.csv'] = csv_txt(
        [['data', 'concelho', 'distrito', 'anuncios', 'quarto_mediana', 't0_mediana', 't1_mediana', 't1_preco_medio', 't1_anuncios_com_preco', 't2_mediana', 'eur_m2_mediana', 'pagina']] +
        [[dia, r['cidade'], NOME_DIST.get(r['distrito'], r['distrito']), r['n'], r['quarto'], r['T0'], r['T1'], r['t1_media'], r['n_t1'], r['T2'], r['m2'],
          f'{SITE}/arrendar/{r["slug"]}/'] for r in linhas])
    st1 = conjunto(anuncios, 'T1')
    frases = []
    if st1.get('media'):
        frases.append(frase_principal(st1, 'T1', 'em Portugal', hoje))
    lx = next((r for r in linhas if r['cidade'] == 'Lisboa'), None)
    pt = next((r for r in linhas if r['cidade'] == 'Porto'), None)
    if lx and lx['T1']:
        frases.append(f'Em Lisboa, a mediana de um T1 é de {eur(lx["T1"])}' + (f'; no Porto, de {eur(pt["T1"])}.' if pt and pt['T1'] else '.'))
    t1s = [r for r in linhas if r['T1'] and r['n_t1'] >= 10]
    if len(t1s) >= 3:
        mx, mn = max(t1s, key=lambda r: r['T1']), min(t1s, key=lambda r: r['T1'])
        frases.append(f'Nos concelhos com pelo menos 10 anúncios de T1, o mais caro é {e(mx["cidade"])} ({eur(mx["T1"])}) e o mais barato {e(mn["cidade"])} ({eur(mn["T1"])}).')
    frases.append(f'A tabela tem {len(linhas)} concelhos.')
    mes = f'{MESES[AGORA.month - 1]} {AGORA.year}'
    paginas['/arrendar/precos/'] = pagina(
        '/arrendar/precos/', f'Preço das rendas por concelho ({mes}) | DupliCasa',
        f'Quanto custa arrendar casa em {len(linhas)} concelhos: renda mediana de quartos, T0, T1 e T2 e preço por m², com os anúncios de hoje. Dados para descarregar.',
        'Preço das rendas por concelho', resposta(frases),
        [('Início', '/'), ('Arrendar', '/arrendar/'), ('Preço das rendas', '/arrendar/precos/')],
        [], chips('Mais preços', [('/arrendar/precos/t1-por-distrito/', 'Quanto custa um T1 em cada distrito', '')]), '/#pesquisa', hoje, tabela=tabela,
        extra=metodo_html(),
        dados={'name': 'Rendas pedidas por concelho em Portugal (DupliCasa)',
               'description': ('Mediana das rendas pedidas nos anúncios de arrendamento ativos em Portugal, por concelho e tipologia (quarto, T0, T1, T2) e '
                               'preço por m², a partir dos anúncios públicos de vários sites, sem casas repetidas. Atualizado todos os dias.'),
               'temporalCoverage': dia, 'variableMeasured': ['renda mediana pedida (euros por mês)', 'preço médio de um T1 (euros por mês)', 'preço por m² (euros por mês)', 'número de anúncios'],
               'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': SITE + '/arrendar/precos/rendas-por-concelho.csv'}]})



def gerar_estudo(paginas, ficheiros, anuncios, hoje):
    """Estudo para a imprensa: quanto custa um T1 em cada distrito. Números de hoje, CSV de cada dia (para citar com data) e método."""
    cam = '/arrendar/precos/t1-por-distrito/'
    por_d = {}
    for a in anuncios:
        d = distrito_de(a)
        if d:
            por_d.setdefault(d, []).append(a)
    sts = {d: {tt: conjunto(l, tt) for tt in TT_LINHAS} for d, l in por_d.items()}
    for d, s_ in sts.items():
        for tt, st in s_.items():
            guardar(f'd:{d}|{tt}', st, completo=True)
    st_pt = {tt: conjunto(anuncios, tt) for tt in TT_LINHAS}
    com = sorted([d for d in sts if sts[d]['T1'].get('mediana')], key=lambda d: -sts[d]['T1']['mediana'])
    poucos = sorted([d for d in sts if not sts[d]['T1'].get('mediana')], key=lambda d: NOME_DIST.get(d, d))
    fortes = [d for d in com if sts[d]['T1']['n'] >= 10]

    def nome_d(d):
        return NOME_DIST.get(d, d)

    def com_artigo(d):
        n = nome_d(d)
        if n == 'Madeira':
            return 'a Madeira'
        if n.startswith('Açores'):
            return 'os ' + n
        return 'o distrito ' + de(d)

    def link_d(d):
        nome = REGIAO_NOME.get(d, 'Distrito ' + ('do ' if norm_t(d) in NO else ('da ' if norm_t(d) in NA else 'de ')) + d)
        c = f'/arrendar/regiao/{slug(nome)}/'
        return c if c in INDEXAVEIS else None

    frases = []
    if st_pt['T1'].get('media'):
        frases.append(frase_principal(st_pt['T1'], 'T1', 'em Portugal', hoje))
    if len(fortes) >= 2:
        mx, mn = fortes[0], fortes[-1]
        frases.append(f'Nos distritos e regiões com pelo menos 10 anúncios de T1, o mais caro é {e(com_artigo(mx))} (mediana de {eur(sts[mx]["T1"]["mediana"])}) '
                      f'e o mais barato {e(com_artigo(mn))} ({eur(sts[mn]["T1"]["mediana"])}).')
    intro = resposta(frases)
    corpo = ''
    for d in com:
        st = sts[d]['T1']
        tend = tendencia(f'd:{d}|T1', st)
        h = link_d(d)
        nome = f'<a href="{h}">{e(nome_d(d))}</a>' if h else e(nome_d(d))
        peq = st['n'] < 10
        corpo += (f'<tr{" class=peq" if peq else ""}><th scope="row">{nome}{" (amostra pequena)" if peq else ""}</th><td class="n">{num(st["n"])}</td>'
                  f'<td class="n">{eur(st["media"])}</td><td class="n">{eur(st["mediana"])}</td>'
                  f'<td class="n">{(num(st["p25"]) + " a " + eur(st["p75"])) if st.get("p25") else "—"}</td><td class="n">{e(tend["curto"])}</td></tr>')
    for d in poucos:
        corpo += f'<tr class="peq"><th scope="row">{e(nome_d(d))}</th><td class="n">{num(sts[d]["T1"]["n"])}</td><td class="n" colspan="4">menos de {MIN_AMOSTRA} anúncios de T1 com preço</td></tr>'
    dia = AGORA.date().isoformat()
    tabela = ('<h2>Renda de um T1 em cada distrito</h2><div class="rolar"><table class="tab"><thead><tr><th scope="col">Distrito</th>'
              '<th scope="col" class="n">Anúncios de T1</th><th scope="col" class="n">Preço médio</th><th scope="col" class="n">Mediana</th>'
              f'<th scope="col" class="n">Metade pede entre</th><th scope="col" class="n">Tendência</th></tr></thead><tbody>{corpo}</tbody></table></div>'
              + linha_fonte('«Amostra pequena»: entre 5 e 9 anúncios, o número é indicativo. '))
    tabela += ('<h2>As outras tipologias</h2><div class="rolar"><table class="tab"><thead><tr><th scope="col">Distrito</th><th scope="col" class="n">Quarto</th>'
               '<th scope="col" class="n">T0</th><th scope="col" class="n">T1</th><th scope="col" class="n">T2</th></tr></thead><tbody>' + ''.join(
                   f'<tr><th scope="row">{e(nome_d(d))}</th>' + ''.join(f'<td class="n">{eur(sts[d][tt]["mediana"]) if sts[d][tt].get("mediana") else "—"}</td>'
                                                                       for tt in ('Quarto', 'T0', 'T1', 'T2')) + '</tr>' for d in com + poucos)
               + '</tbody></table></div><p class="fonte">Mediana das rendas pedidas; «—» com menos de 5 anúncios.</p>')
    # dados de cada dia (os de hoje e os guardados no histórico), para se poder citar um número com a data
    cab = ['data', 'distrito', 'tipologia', 'anuncios_com_preco', 'preco_medio', 'mediana', 'p25', 'p75', 'mais_barato']
    dias = {k: v for k, v in (HIST.get('dias') or {}).items()}
    dias[dia] = dict(SNAP)
    edicoes = []
    for k in sorted(dias):
        ls = []
        for chave, v in sorted(dias[k].items()):
            if chave.startswith('d:') and len(v) >= 6:
                dd, tt = chave[2:].rsplit('|', 1)
                ls.append([k, nome_d(dd), tt, *v[:1], v[2], v[1], v[3], v[4], v[5]])
        if ls:
            ficheiros[f'{cam}dados-{k}.csv'] = csv_txt([cab] + ls)
            edicoes.append(k)
    if dia in edicoes:
        ficheiros[f'{cam}dados.csv'] = ficheiros[f'{cam}dados-{dia}.csv']
    arquivo = [k for k in reversed(edicoes) if k != dia][:12]
    tabela += ('<p><a class="bt" href="dados.csv" download>Descarregar os dados de hoje (CSV)</a></p>'
               f'<p class="fonte">Cada dia fica guardado num ficheiro próprio, para poder citar os números com a data: <a href="dados-{dia}.csv">{data_pt(dia)}</a>'
               + ''.join(f' · <a href="dados-{k}.csv">{data_pt(k)}</a>' for k in arquivo) + '. CSV separado por ponto e vírgula.</p>')
    cidades_t1 = [(c, f'/arrendar/{slug(c)}/t1/') for c in ('Lisboa', 'Porto', 'Braga', 'Coimbra', 'Faro', 'Aveiro', 'Setúbal', 'Leiria', 'Funchal', 'Viseu')
                  if f'/arrendar/{slug(c)}/t1/' in INDEXAVEIS]
    links = chips('T1 para arrendar por cidade', [(h, f'T1 {em(c)}', '') for c, h in cidades_t1]) + chips(
        'Mais preços', [('/arrendar/precos/', 'Preço das rendas por concelho', '')])
    mes = f'{MESES[AGORA.month - 1]} {AGORA.year}'
    paginas[cam] = pagina(
        cam, f'Quanto custa um T1 em cada distrito ({mes}) | DupliCasa',
        'Preço médio e mediana da renda de um T1 em cada distrito, com o número de anúncios e a tendência. Dados próprios, atualizados todos os dias.',
        'Quanto custa um T1 em cada distrito', intro,
        [('Início', '/'), ('Arrendar', '/arrendar/'), ('Preço das rendas', '/arrendar/precos/'), ('T1 por distrito', cam)],
        [], links, '/#pesquisa?tips=T1', hoje, tabela=tabela, extra=metodo_html(), artigo=inicio_hist().isoformat(), botao='Ver T1 para arrendar',
        dados={'name': 'Renda pedida de T1 (e de quartos, T0 e T2) por distrito em Portugal (DupliCasa)',
               'description': ('Preço médio, mediana, quartis e número de anúncios das rendas pedidas por um T1, um T0, um T2 e um quarto em cada distrito de '
                               'Portugal e nas regiões autónomas, a partir dos anúncios de arrendamento ativos em vários sites, sem casas repetidas. Um ficheiro por dia.'),
               'temporalCoverage': f'{edicoes[0] if edicoes else dia}/{dia}',
               'variableMeasured': ['renda pedida: preço médio (euros por mês)', 'renda pedida: mediana (euros por mês)', 'número de anúncios com preço'],
               'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': SITE + cam + 'dados.csv'}]})


# Guias: respostas às perguntas que mais aparecem nas sugestões do Google («como arrendar casa em portugal»,
# «sem fiador», «sem caução», «sem contrato», «aumento das rendas», burlas). As regras legais têm fonte e a data em que
# foram confirmadas (LEI_CONFIRMADA). Antes de mudar uma regra, confirmar no Diário da República e no Portal das Finanças.
# Nunca citar sites de anúncios (concorrentes) como fonte.
LEI_CONFIRMADA = '30 de outubro de 2026'
F_CC = ('Código Civil, artigos 1069.º, 1076.º e 1077.º (Diário da República)', 'https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1966-34509075')
F_AT = ('Portal das Finanças: contrato de arrendamento', 'https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Cidadaos/Casa_e_propriedades/Arrendamento/Contrato%20urbano/Paginas/default.aspx')
F_AT_CAUCAO = ('Autoridade Tributária: informação vinculativa sobre caução e rendas antecipadas', 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/informacoes_vinculativas/rendimento/circ/Documents/PIV_25441.pdf')
F_CGD = ('Caixa Geral de Depósitos: a caução no arrendamento', 'https://www.cgd.pt/Site/Saldo-Positivo/leis-e-impostos/Pages/caucao-no-arrendamento.aspx')
F_REFORMA = ('DECO PROteste: o que pode mudar com a revisão da lei do arrendamento', 'https://www.deco.proteste.pt/dinheiro/arrendamento/noticias/que-pode-mudar-com-revisao-lei-arrendamento')
F_INQUILINO = ('DECO PROteste: inquilinos já podem comunicar contratos às Finanças', 'https://www.deco.proteste.pt/dinheiro/arrendamento/noticias/inquilinos-ja-podem-declarar-contratos-arrendamento-financas')
F_GARANTIA = ('RTP: proposta de garantia pública no arrendamento em debate (29/09/2026)', 'https://www.rtp.pt/noticias/economia/arrendamento-em-debate-no-parlamento-com-chumbo-no-horizonte_e1768638')
F_COEF = ('Cuatrecasas: coeficiente de atualização das rendas para 2027 (Aviso n.º 24199/2026/2)', 'https://www.cuatrecasas.com/pt/spain/imobiliario/art/coeficiente-atualizacao-anual-rendas-2027')
REFORMA = ('<p><strong>Pode mudar:</strong> o Governo propôs acabar com o limite da caução e permitir até 3 rendas adiantadas '
           '(Proposta de Lei n.º 103/XVII/1, aprovada na generalidade a 30 de setembro de 2026 e ainda em discussão no Parlamento). '
           'Só muda quando o Governo publicar o decreto-lei e este entrar em vigor. Até lá, valem os limites acima.</p>')
NOTA_LEGAL = ('<p class="nota">Este guia explica a lei em termos simples e não é aconselhamento jurídico. Para o teu caso concreto, '
              'fala com um jurista ou consulta o <a href="https://www.portaldahabitacao.pt/" rel="noopener">Portal da Habitação</a>.</p>')
GUIAS = [
    {'slug': 'como-arrendar-casa-em-portugal', 'data': '2026-10-30',
     'titulo': 'Como arrendar casa em Portugal: passo a passo | DupliCasa',
     'desc': 'Do orçamento às chaves: documentos que costumam pedir, quanto a lei deixa pedir à entrada, o que perguntar na visita e o que confirmar antes de pagar.',
     'h1': 'Como arrendar casa em Portugal, passo a passo',
     'intro': 'Do orçamento à entrega das chaves: o que fazer em cada passo para arrendar casa depressa, sem perder dinheiro nem cair numa burla.',
     'corpo': """<h2>1. Faz as contas antes de procurar</h2>
<p>Uma regra prática muito usada é a renda não passar de um terço do que entra em casa por mês. Conta também com a entrada: além da primeira renda, muitas casas pedem caução e algumas pedem rendas adiantadas.</p>
<p>A lei põe limites: a caução não pode passar do valor de <strong>2 rendas</strong> e as rendas adiantadas de <strong>2 meses</strong> (artigo 1076.º do Código Civil). Ou seja, além da primeira renda, o máximo que te podem pedir à entrada são 4 rendas. Pergunta sempre <strong>quanto é preciso pagar ao todo para entrar</strong>.</p>
<p>Vê quanto custa a zona que queres na página <a href="/arrendar/precos/">preço das rendas por cidade</a>.</p>
<h2>2. Prepara os documentos</h2>
<p>Ter tudo pronto faz-te passar à frente de quem ainda vai juntar papéis. É costume pedirem:</p>
<ul><li>documento de identificação e NIF;</li><li>últimos recibos de vencimento ou declaração da entidade patronal;</li><li>última declaração de IRS;</li><li>se és estudante, comprovativo de matrícula e, muitas vezes, um fiador.</li></ul>
<h2>3. Procura em vários sites ao mesmo tempo</h2>
<p>As casas boas e baratas desaparecem depressa. Na <a href="/#pesquisa">DupliCasa</a> vês as casas dos principais sites num só lugar, sem repetidas, e com um <a href="/#alertas">alerta</a> sabes das novas logo que aparecem.</p>
<h2>4. Contacta depressa e visita</h2>
<p>Na visita, pergunta: as despesas estão incluídas? Quanto é a caução e como é devolvida? Quando fica livre? Pede para ver o certificado energético e confirma se vai haver contrato escrito e recibos.</p>
<h2>5. Confirma antes de pagar</h2>
<ul><li>Nunca pagues nada sem visitar a casa.</li><li>Confirma que quem anuncia é o dono ou tem autorização para arrendar.</li><li>Desconfia de pressa, de preços muito abaixo da zona e de pedidos de pagamento por transferência a quem nunca viste.</li></ul>
<h2>6. Contrato e entrada</h2>
<p>A lei exige contrato escrito. Lê-o todo antes de assinar: duração, renda, quando sobe, caução, quem paga o quê.</p>
<p>Depois, o senhorio tem de comunicar o contrato às Finanças até ao fim do mês seguinte ao início e, em regra, passar recibo eletrónico de cada renda. Se não comunicar o contrato no prazo, podes ser tu a fazê-lo no Portal das Finanças.</p>
<p>No dia em que entras, tira fotos de cada divisão e dos equipamentos e envia-as ao senhorio: ajuda a reaver a caução no fim.</p>""",
     'faq': [('Que documentos pedem para arrendar casa?', 'É costume pedirem documento de identificação, NIF, recibos de vencimento ou declaração da entidade patronal e a última declaração de IRS. A estudantes pedem muitas vezes um fiador.'),
             ('Quantas rendas pode o senhorio pedir à entrada?', 'Além da primeira renda, até 2 rendas adiantadas e uma caução até ao valor de 2 rendas (artigo 1076.º do Código Civil, regras em vigor a 30 de outubro de 2026). Há uma proposta do Governo para alargar estes limites, mas ainda não está em vigor.'),
             ('O senhorio tem de comunicar o contrato às Finanças?', 'Sim, até ao fim do mês seguinte ao início do contrato. Se não o fizer, o inquilino pode comunicá-lo no Portal das Finanças depois desse prazo.')],
     'fontes': [F_CC, F_AT, F_AT_CAUCAO, F_REFORMA],
     'botao': 'Ver casas para arrendar', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'arrendar-casa-sem-fiador', 'data': '2026-10-30',
     'titulo': 'Arrendar casa sem fiador: o que diz a lei e o que propor | DupliCasa',
     'desc': 'A lei não obriga a ter fiador. Porque o pedem, o que podes propor em troca, os limites da lei e como encontrar senhorios que não o exigem.',
     'h1': 'Arrendar casa sem fiador',
     'intro': 'O fiador é uma garantia para o senhorio de que a renda é paga. Nenhuma lei obriga a tê-lo, e há outras formas de dar essa confiança.',
     'corpo': """<h2>Porque é que pedem fiador</h2>
<p>O senhorio quer saber que recebe a renda todos os meses. O fiador responde por ela se o inquilino não pagar. Por isso pedem-no mais a quem tem rendimentos baixos ou recentes, como estudantes ou quem acabou de chegar a Portugal.</p>
<h2>O que diz a lei</h2>
<ul><li><strong>Nenhuma lei obriga a ter fiador.</strong> É uma garantia que o senhorio pode pedir e que só existe se ficar no contrato, assinada pelo fiador.</li>
<li><strong>Se a garantia for em dinheiro, há limites:</strong> a caução não pode passar do valor de 2 rendas e as rendas adiantadas de 2 meses (artigo 1076.º do Código Civil).</li>
<li><strong>Não há garantia do Estado em vez de fiador.</strong> A 30 de outubro de 2026, a garantia pública para o arrendamento é só uma proposta apresentada no Parlamento, ainda não é lei. A garantia pública para jovens que existe é para quem compra casa com crédito à habitação.</li></ul>
<h2>O que podes propor em vez de fiador</h2>
<ul><li><strong>Mostrar rendimentos estáveis:</strong> contrato de trabalho, recibos dos últimos meses e a declaração de IRS.</li>
<li><strong>Seguro de renda:</strong> há seguros que protegem o senhorio se a renda não for paga. Propor que o contrate, ou dividir o custo, pode substituir o fiador.</li>
<li><strong>Referências:</strong> o contacto ou uma carta de um senhorio anterior a dizer que pagaste sempre a horas.</li>
<li><strong>Uma garantia maior à entrada:</strong> alguns senhorios aceitam em troca uma caução ou rendas adiantadas, dentro dos limites da lei. Combina tudo por escrito.</li></ul>
<h2>Onde procurar</h2>
<p>Particulares às vezes são mais flexíveis do que agências. Na <a href="/#pesquisa">pesquisa da DupliCasa</a>, em Filtros, escolhe «Só particulares». Quando o anúncio diz se pede fiador, mostramos isso na ficha da casa.</p>
<p>Cria um <a href="/#alertas">alerta</a> para seres dos primeiros a contactar: quem chega primeiro tem mais margem para negociar.</p>""",
     'faq': [('A lei obriga a ter fiador para arrendar casa?', 'Não. O fiador é uma garantia que o senhorio pode pedir, mas nenhuma lei a impõe. Só existe se ficar no contrato, assinada pelo fiador.'),
             ('É possível arrendar casa sem fiador?', 'Sim. Muitos senhorios aceitam outra garantia: rendimentos estáveis comprovados, um seguro de renda, referências de um senhorio anterior ou uma caução, até ao valor de 2 rendas.'),
             ('Há uma garantia do Estado que substitua o fiador?', 'A 30 de outubro de 2026, não. Foi apresentada no Parlamento uma proposta de garantia pública para o arrendamento, mas ainda não é lei. A garantia pública para jovens que existe é para o crédito à habitação.')],
     'fontes': [F_CC, F_GARANTIA],
     'botao': 'Ver casas de particulares', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'arrendar-casa-sem-caucao', 'data': '2026-10-30',
     'titulo': 'Arrendar casa sem caução: o que diz a lei e como negociar | DupliCasa',
     'desc': 'A caução não é obrigatória e não pode passar de 2 rendas. Como encontrar casas sem caução, como negociar e como a recebes de volta.',
     'h1': 'Arrendar casa sem caução',
     'intro': 'A caução é o dinheiro que entregas ao entrar para cobrir danos ou rendas em falta, e que te devolvem quando sais. Não é obrigatória, e há casas que não a pedem.',
     'corpo': """<h2>O que diz a lei</h2>
<ul><li><strong>A caução não é obrigatória:</strong> só existe se for combinada no contrato.</li>
<li><strong>Não pode passar do valor de 2 rendas</strong> (artigo 1076.º, n.º 2, do Código Civil). Com uma renda de 700 €, o máximo é 1400 €.</li>
<li><strong>Rendas adiantadas são outra coisa:</strong> podem ser até 2 meses, com acordo escrito (artigo 1076.º, n.º 1). Ao contrário da caução, não são devolvidas: pagam os meses seguintes.</li>
<li><strong>A lei não fixa um prazo para devolver a caução.</strong> Por isso, escreve no contrato quando e como é devolvida.</li>
<li>Para as Finanças, a caução conta como rendimento do senhorio e deve aparecer no recibo de renda eletrónico.</li></ul>
""" + REFORMA + """
<h2>Como encontrar casas sem caução</h2>
<p>Na <a href="/#pesquisa">pesquisa da DupliCasa</a>, abre Filtros e escolhe «Sem caução indicada»: ficam as casas cujo anúncio diz que não pedem caução ou que não falam nela. Confirma sempre com quem anuncia antes de visitar.</p>
<h2>Como negociar</h2>
<ul><li>Mostra que és um inquilino de confiança: rendimentos, referências, documentos prontos.</li>
<li>Propõe dividir a caução em prestações nos primeiros meses.</li>
<li>Pergunta se aceitam um seguro de renda no lugar da caução.</li></ul>
<h2>Se pagares caução, garante que a recebes de volta</h2>
<ul><li>O valor da caução e a forma de devolução devem estar no contrato.</li>
<li>Pede recibo de tudo o que pagas.</li>
<li>No dia da entrada, tira fotos de cada divisão e dos equipamentos e envia-as ao senhorio. Faz o mesmo à saída.</li></ul>""",
     'faq': [('Quanto pode ser a caução de uma casa arrendada?', 'No máximo, o valor de 2 rendas (artigo 1076.º do Código Civil, regra em vigor a 30 de outubro de 2026). Há uma proposta do Governo para acabar com este limite, mas ainda não está em vigor.'),
             ('A caução é obrigatória?', 'Não. Só existe se for combinada no contrato. Quando existe, deve ser devolvida no fim se a casa ficar como estava e não houver rendas por pagar.'),
             ('Qual a diferença entre caução e rendas adiantadas?', 'A caução é uma garantia devolvida no fim do contrato, até ao valor de 2 rendas. As rendas adiantadas pagam os meses seguintes, até 2 meses, e não são devolvidas.'),
             ('Como encontro casas sem caução?', 'Na pesquisa da DupliCasa, em Filtros, escolhe «Sem caução indicada» e confirma sempre com quem anuncia.')],
     'fontes': [F_CC, F_AT_CAUCAO, F_CGD, F_REFORMA],
     'botao': 'Procurar casas sem caução', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'arrendar-casa-sem-contrato-riscos', 'data': '2026-10-30',
     'titulo': 'É crime arrendar casa sem contrato? O que diz a lei | DupliCasa',
     'desc': 'Arrendar sem contrato escrito não é crime para o inquilino, mas a lei exige contrato. Como provar que arrendas, as Finanças e como te protegeres.',
     'h1': 'Arrendar casa sem contrato: o que diz a lei',
     'intro': 'A lei exige contrato escrito. Se não o tens, podes ter na mesma direitos, mas fica tudo mais difícil de provar.',
     'corpo': """<h2>O que diz a lei</h2>
<ul><li><strong>Não é crime para o inquilino.</strong> Mas o contrato de arrendamento deve ser feito por escrito (artigo 1069.º, n.º 1, do Código Civil).</li>
<li><strong>Se a falta de contrato não for culpa tua,</strong> podes provar que arrendas a casa por qualquer meio: basta mostrar que vives lá sem oposição do senhorio e que pagas a renda todos os meses há pelo menos 6 meses (artigo 1069.º, n.º 2).</li>
<li><strong>Finanças:</strong> o senhorio tem de comunicar o contrato até ao fim do mês seguinte ao início. Se não o fizer, desde agosto de 2025 podes ser tu a comunicá-lo no Portal das Finanças, depois de acabar o prazo dele.</li>
<li><strong>Recibos:</strong> em regra, o senhorio tem de passar recibo eletrónico de cada renda no Portal das Finanças. Há algumas exceções.</li></ul>
<h2>Os riscos práticos</h2>
<ul><li><strong>Provar o que combinaram:</strong> renda, duração, caução e quem paga as despesas ficam sem registo.</li>
<li><strong>Reaver a caução:</strong> sem nada escrito, é mais difícil exigir a devolução.</li>
<li><strong>Provar que moras lá:</strong> pode complicar a mudança de morada, o atestado de residência ou outros pedidos que precisam de comprovativo.</li>
<li><strong>Sair ou ser mandado sair:</strong> sem prazos escritos, cada parte pode ter uma ideia diferente do que foi combinado.</li></ul>
<h2>Como te proteger</h2>
<ul><li>Pede sempre um contrato escrito antes de pagar.</li>
<li>Paga por transferência, nunca em dinheiro, e guarda os comprovativos: são a melhor prova dos meses de renda pagos.</li>
<li>Pede recibos das rendas.</li>
<li>Guarda as mensagens com o senhorio sobre o que foi combinado.</li></ul>""",
     'faq': [('É crime arrendar casa sem contrato?', 'Para o inquilino, não. A lei exige contrato escrito, e o senhorio tem obrigações nas Finanças (comunicar o contrato e passar recibos). Se a falta de contrato não for culpa tua, podes provar o arrendamento mostrando que vives na casa e pagas a renda há pelo menos 6 meses.'),
             ('Posso provar que arrendo uma casa sem contrato escrito?', 'Sim, se a falta de contrato não for culpa tua: podes provar por qualquer meio que usas a casa sem oposição do senhorio e que pagas a renda todos os meses há pelo menos 6 meses (artigo 1069.º do Código Civil). Transferências bancárias e mensagens ajudam.'),
             ('O senhorio não comunicou o contrato às Finanças. O que faço?', 'Se o senhorio não o comunicar até ao fim do mês seguinte ao início do contrato, podes ser tu a comunicá-lo no Portal das Finanças.'),
             ('Quais são os riscos de arrendar casa sem contrato?', 'Fica mais difícil provar o que foi combinado (renda, duração, caução), reaver a caução e provar que moras na casa.')],
     'fontes': [F_CC, F_AT, F_INQUILINO],
     'botao': 'Ver casas para arrendar', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'aumento-das-rendas-em-2027', 'data': '2026-10-30',
     'titulo': 'Aumento das rendas em 2027: quanto pode subir a renda | DupliCasa',
     'desc': 'Em 2027 a renda pode subir até 2,56%. Como calcular o aumento, quando o senhorio o pode aplicar e com quanto tempo tem de avisar.',
     'h1': 'Aumento das rendas em 2027',
     'intro': 'O coeficiente para 2027 é 1,0256: nos contratos que seguem a regra da lei, a renda pode subir até 2,56%.',
     'corpo': """<h2>Quanto pode subir</h2>
<p>O coeficiente de atualização das rendas para 2027 é <strong>1,0256</strong>, publicado no Aviso n.º 24199/2026/2, no Diário da República de 1 de outubro de 2026. Para saber a renda nova, multiplica a atual por 1,0256:</p>
<ul><li>500 € passam a 512,80 €;</li><li>800 € passam a 820,48 €;</li><li>1000 € passam a 1025,60 €.</li></ul>
<h2>Quando e como</h2>
<ul><li>A renda só pode subir 1 ano depois do início do contrato ou da última atualização.</li>
<li>O senhorio tem de te avisar por escrito com pelo menos 30 dias de antecedência.</li>
<li>Se o contrato tiver outra regra para atualizar a renda, vale a do contrato.</li></ul>
<h2>Vais mudar de casa?</h2>
<p>A renda de um contrato novo é combinada entre as partes. Compara o que te pedem com o <a href="/arrendar/precos/">preço das rendas na zona</a> e vê as <a href="/#pesquisa">casas para arrendar</a> dos principais sites num só lugar.</p>""",
     'faq': [('Quanto pode subir a renda em 2027?', 'Até 2,56%, nos contratos que seguem a regra da lei: multiplica a renda atual por 1,0256 (Aviso n.º 24199/2026/2, Diário da República de 1 de outubro de 2026).'),
             ('Quando pode o senhorio aumentar a renda?', 'Só 1 ano depois do início do contrato ou da última atualização, e com aviso por escrito com pelo menos 30 dias de antecedência.')],
     'fontes': [F_CC, F_COEF],
     'botao': 'Ver casas para arrendar', 'link': '/#pesquisa', 'legal': True},
    {'slug': 'como-evitar-burlas-no-arrendamento', 'data': '2026-10-30',
     'titulo': 'Como evitar burlas no arrendamento: sinais e o que fazer | DupliCasa',
     'desc': 'Os sinais de uma burla em anúncios de casas para arrendar, como confirmar que o anúncio é verdadeiro e o que fazer se fores enganado.',
     'h1': 'Como evitar burlas no arrendamento',
     'intro': 'As burlas em casas para arrendar repetem quase sempre os mesmos sinais. Saber reconhecê-los é a melhor proteção.',
     'corpo': """<h2>Sinais de alerta</h2>
<ul><li>Renda muito abaixo das outras na mesma zona.</li>
<li>Pressa: «há muita gente interessada, paga hoje para reservar».</li>
<li>Quem anuncia diz estar fora do país e não pode mostrar a casa.</li>
<li>Pede pagamento, ou cópias dos teus documentos, antes da visita.</li>
<li>Fala só por mensagens e evita chamadas.</li>
<li>As mesmas fotos aparecem noutros anúncios, com outro preço ou noutra cidade.</li></ul>
<h2>Como confirmar que o anúncio é verdadeiro</h2>
<ul><li>Visita a casa antes de pagar qualquer valor.</li>
<li>Pede para ver um documento que mostre que a casa é de quem anuncia, como a caderneta predial.</li>
<li>Pesquisa as fotos do anúncio numa pesquisa de imagens para ver se aparecem noutro lado.</li>
<li>Compara a renda com o <a href="/arrendar/precos/">preço das rendas na zona</a>.</li></ul>
<h2>Se já pagaste a um burlão</h2>
<ul><li>Contacta logo o teu banco: às vezes ainda dá para travar a transferência.</li>
<li>Guarda tudo: anúncio, mensagens, comprovativos.</li>
<li>Apresenta queixa às autoridades.</li></ul>
<h2>Pagamento seguro (em breve)</h2>
<p>Com o <a href="/#proteger">pagamento seguro da DupliCasa</a>, a entrada vai ficar guardada numa instituição de pagamento autorizada e só chega ao senhorio quando recebes as chaves. Podes entrar já na lista de espera.</p>""",
     'faq': [('Como sei se um anúncio de casa é burla?', 'Desconfia de rendas muito abaixo da zona, de pressa para pagar, de quem não pode mostrar a casa e de pedidos de pagamento antes da visita. Pesquisa as fotos para ver se aparecem noutros anúncios.'),
             ('O que fazer se paguei a um burlão?', 'Contacta logo o teu banco, guarda o anúncio, as mensagens e os comprovativos, e apresenta queixa às autoridades.')],
     'botao': 'Entrar na lista do pagamento seguro', 'link': '/#proteger', 'legal': False},
]


def gerar_guias(paginas, hoje):
    for g in GUIAS:
        caminho = f"/arrendar/guias/{g['slug']}/"
        outros = '<h2>Outros guias</h2><ul class="ch">' + ''.join(f'<li><a href="/arrendar/guias/{x["slug"]}/">{e(x["h1"])}</a></li>' for x in GUIAS if x is not g) + '</ul>'
        fontes = ''
        if g.get('fontes'):
            fontes = ('<h2>Fontes</h2><ul class="fontes">' + ''.join(f'<li><a href="{e(u)}" rel="noopener">{e(t)}</a></li>' for t, u in g['fontes'])
                      + f'</ul><p class="nota">Regras confirmadas a {LEI_CONFIRMADA}. Se a lei mudar, atualizamos este guia.</p>')
        corpo = '<article class="guia">' + g['corpo'] + fontes + (NOTA_LEGAL if g['legal'] else '') + '</article>' + outros
        paginas[caminho] = pagina(caminho, g['titulo'], g['desc'], g['h1'], g['intro'],
                                  [('Início', '/'), ('Arrendar', '/arrendar/'), ('Guias', '/arrendar/guias/'), (g['h1'], caminho)],
                                  [], corpo, g['link'], hoje, faq=g['faq'], artigo=g['data'], botao=g['botao'])
    lista = '<ul class="ch">' + ''.join(f'<li><a href="/arrendar/guias/{x["slug"]}/">{e(x["h1"])}</a></li>' for x in GUIAS) + '</ul>'
    paginas['/arrendar/guias/'] = pagina('/arrendar/guias/', 'Guias para arrendar casa em Portugal | DupliCasa',
                                         'Guias para arrendar casa em Portugal, com o que diz a lei: passo a passo, sem fiador, sem caução, sem contrato, aumento das rendas em 2027 e burlas.',
                                         'Guias para arrendar casa', 'Respostas práticas às perguntas que mais se fazem antes de arrendar casa em Portugal.',
                                         [('Início', '/'), ('Arrendar', '/arrendar/'), ('Guias', '/arrendar/guias/')], [], lista, '/#pesquisa', hoje)


def llms_full(resumo, n_total, hoje):
    """Versão longa do llms.txt, com os números de hoje: para os assistentes de IA citarem dados atuais."""
    linhas = sorted([r for r in resumo if r['n'] >= 10], key=lambda r: -r['n'])
    f = lambda v: eur(v) if v else 'sem dados suficientes'
    t = [f'# DupliCasa: casas e quartos para alugar em Portugal (dados de {hoje})', '',
         f'> {num(n_total)} casas, apartamentos e quartos para arrendar em Portugal, juntos de vários sites na DupliCasa (duplicasa.pt), sem casas repetidas. '
         'Os valores abaixo são rendas pedidas nos anúncios ativos (não o preço final do contrato), atualizados de 30 em 30 minutos. '
         f'Mediana = renda do meio; preço médio = média sem os 10% de rendas mais baixas e mais altas. Só com pelo menos {MIN_AMOSTRA} anúncios. '
         f'Método: {SITE}/arrendar/precos/#metodo', '']
    d = [(k[2:].rsplit('|', 1)[0], v) for k, v in SNAP.items() if k.startswith('d:') and k.endswith('|T1')]
    if d:
        t += ['## Quanto custa um T1 em cada distrito', f'Fonte: {SITE}/arrendar/precos/t1-por-distrito/ (CSV do dia: {SITE}/arrendar/precos/t1-por-distrito/dados.csv)', '']
        for nome, v in sorted(d, key=lambda x: -x[1][1]):
            t.append(f'- {NOME_DIST.get(nome, nome)}: preço médio {eur(v[2])}, mediana {eur(v[1])} por mês ({num(v[0])} anúncios de T1'
                     + ('; amostra pequena)' if v[0] < 10 else ')'))
        t.append('')
    t += ['## Renda mediana por concelho', '']
    for r in linhas:
        t.append(f'### {r["cidade"]}')
        t.append(f'- Anúncios: {num(r["n"])} ({SITE}/arrendar/{r["slug"]}/)')
        t.append(f'- Quarto: {f(r["quarto"])} por mês')
        t.append(f'- T0: {f(r["T0"])}; T1: {f(r["T1"])}' + (f' (preço médio {eur(r["t1_media"])})' if r.get('t1_media') else '') + f'; T2: {f(r["T2"])} por mês')
        if r['m2']:
            t.append(f'- Preço por m² (apartamentos e moradias): {m2txt(r["m2"])} por mês')
        if r['min']:
            t.append(f'- Renda mais baixa agora: {eur(r["min"])}')
        t.append(f'- Por freguesia e tipologia: {SITE}/arrendar/{r["slug"]}/ (secção «Rendas por freguesia»)')
        t.append('')
    t += [f'## Regras do arrendamento em Portugal (confirmadas a {LEI_CONFIRMADA})',
          '- Caução: no máximo o valor de 2 rendas; rendas adiantadas: no máximo 2 meses, com acordo escrito (artigo 1076.º do Código Civil). '
          'A Proposta de Lei n.º 103/XVII/1 quer acabar com o limite da caução e permitir 3 rendas adiantadas, mas ainda não está em vigor.',
          '- Contrato: deve ser escrito (artigo 1069.º do Código Civil). Sem contrato escrito por culpa que não seja do inquilino, este pode provar o arrendamento '
          'mostrando que usa a casa sem oposição do senhorio e paga a renda há pelo menos 6 meses.',
          '- Finanças: o senhorio comunica o contrato até ao fim do mês seguinte ao início; se não o fizer, o inquilino pode comunicá-lo no Portal das Finanças.',
          '- Fiador: nenhuma lei o obriga; não existe garantia do Estado que o substitua no arrendamento.',
          '- Atualização das rendas em 2027: até 2,56% (coeficiente 1,0256, Aviso n.º 24199/2026/2), 1 ano após o início ou a última atualização, com 30 dias de aviso.',
          f'- Guias com fontes: {SITE}/arrendar/guias/', '',
          '## Sobre a DupliCasa', '- Ver casas e criar alertas é grátis. O acesso para contactar quem anuncia custa 1 € nos primeiros 30 dias e depois 9,99 € a cada 30 dias, se quiser continuar (sem renovação automática).',
          '- Pagamento seguro (em breve): a entrada só chega ao senhorio quando os dois confirmam a entrega das chaves.',
          f'- Mais: {SITE}/llms.txt · {SITE}/arrendar/precos/', '']
    return '\n'.join(t)


def com_alternos(html_txt, grupo):
    """Põe as ligações hreflang (pt, en, es, fr e x-default = pt) no lugar marcado no <head>."""
    if not grupo:
        return html_txt.replace('<!--alternos-->', '', 1)
    ls = ''.join(f'<link rel="alternate" hreflang="{"pt-PT" if l == "pt" else l}" href="{SITE}{c}">' for l, c in grupo.items())
    ls += f'<link rel="alternate" hreflang="x-default" href="{SITE}{grupo["pt"]}">'
    return html_txt.replace('<!--alternos-->', ls, 1)


def avisar_indexnow(urls, pasta):
    """Avisa o Bing (e quem usa IndexNow) das páginas novas, mudadas ou retiradas, no máximo uma vez por dia. Falhas não param nada."""
    marca = os.path.join(pasta, '.indexnow')
    try:
        if time.time() - os.path.getmtime(marca) < 86400:
            return False
    except OSError:
        pass
    if not urls:
        return False
    try:
        open(marca, 'w').write(str(int(time.time())))     # uma tentativa por dia, corra bem ou mal
    except OSError:
        return False
    corpo = json.dumps({'host': SITE.split('//')[1], 'key': INDEXNOW, 'keyLocation': f'{SITE}/{INDEXNOW}.txt', 'urlList': urls[:10000]}).encode()
    try:
        req = urllib.request.Request('https://api.indexnow.org/indexnow', data=corpo, method='POST', headers={'Content-Type': 'application/json; charset=utf-8'})
        with urllib.request.urlopen(req, timeout=15) as r:
            print('IndexNow:', r.status, len(urls), 'endereços')
    except Exception as ex:
        print('IndexNow falhou:', type(ex).__name__, getattr(ex, 'code', ''), file=sys.stderr)
    return True


def ler_json(caminho, omissao):
    try:
        with open(caminho, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return omissao


def escrever_json(caminho, dados):
    with open(caminho + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(caminho + '.tmp', caminho)


def podar_hist(hist, hoje):
    """Guarda HIST_DIAS dias. Depois de 60 dias, de cada dia só ficam os distritos e o país (para os CSV do estudo),
    menos no dia 1 de cada mês, que fica inteiro."""
    for dia in list(hist['dias']):
        try:
            idade = (hoje - datetime.date.fromisoformat(dia)).days
        except ValueError:
            del hist['dias'][dia]
            continue
        if idade > HIST_DIAS:
            del hist['dias'][dia]
        elif idade > 60 and not dia.endswith('-01'):
            hist['dias'][dia] = {k: v for k, v in hist['dias'][dia].items() if k.startswith('d:') or k.startswith('pt|')}


def impressao(txt):
    """O que conta para saber se a página mudou: o HTML sem a data e a hora da atualização."""
    for v in sorted(VOLATEIS, key=len, reverse=True):
        txt = txt.replace(v, '')
    return hashlib.sha256(txt.encode()).hexdigest()[:16]


def pagina_saiu(caminho, paginas, hoje):
    """Resposta 410 (servida pelo Caddy): a página já não tem casas. Liga à página de cima que ainda existe."""
    partes = caminho.strip('/').split('/')
    cima = '/arrendar/'
    for k in range(len(partes) - 1, 0, -1):
        c = '/' + '/'.join(partes[:k]) + '/'
        if c in paginas and c in INDEXAVEIS:
            cima = c
            break
    lk = chips('Continuar a procurar', [(cima, 'Casas nesta zona' if cima != '/arrendar/' else 'Todas as cidades', ''), ('/arrendar/precos/', 'Preço das rendas', ''), ('/#pesquisa', 'Pesquisar com filtros', '')])
    return pagina(caminho, 'Já não há casas aqui | DupliCasa', 'As casas desta página já foram arrendadas ou saíram dos anúncios.',
                  'Já não há casas aqui', 'As casas desta página já foram arrendadas ou saíram dos sites de origem. Vê as que há agora na zona ou cria um alerta para saberes das novas.',
                  [('Início', '/'), ('Arrendar', '/arrendar/')], [], lk, cima, hoje, indexar=False)


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
    pai = os.path.dirname(os.path.abspath(destino))
    os.makedirs(pai, exist_ok=True)
    f_hist, f_reg = os.path.join(pai, 'historico-rendas.json'), os.path.join(pai, 'paginas-registo.json')
    HIST.clear()
    HIST.update(ler_json(f_hist, {'dias': {}}))
    HIST.setdefault('dias', {})
    REG.clear()
    REG.update(ler_json(f_reg, {}))
    REG.setdefault('paginas', {})
    REG.setdefault('zonas', {})
    if not REG['paginas']:
        # 1.ª vez: as páginas que já estavam no sitemap contam como conhecidas (não passam a 404 de repente)
        try:
            velhas = re.findall(r'<loc>' + re.escape(SITE) + r'([^<]*)</loc>', open(os.path.join(destino, 'sitemap.xml'), encoding='utf-8').read())
        except OSError:
            velhas = []
        REG['paginas'] = {c: {'h': '', 'mod': '', 'visto': ''} for c in velhas if c != '/'}
    paginas, resumo, ficheiros, mudou = gerar(anuncios, atualizado)
    hoje = data_pt(atualizado)
    gerar_guias(paginas, hoje)
    # as mesmas páginas em inglês, espanhol e francês, ligadas por hreflang
    sys.modules.setdefault('paginas', sys.modules[__name__])     # o paginas_idiomas usa este mesmo módulo (mesmos registos), não uma 2.ª cópia
    import paginas_idiomas
    outras, alternos = paginas_idiomas.gerar(anuncios, atualizado, resumo)
    paginas.update(outras)
    for L in ('en', 'es', 'fr'):
        VOLATEIS.add(paginas_idiomas.data(atualizado, L))
    paginas = {c: com_alternos(h, alternos.get(c)) for c, h in paginas.items()}
    # endereços antigos de freguesias escritas de outra maneira: redirecionamento imediato (o Google trata-o como 301)
    for antigo, novo in mudou.items():
        if antigo not in paginas:
            paginas[antigo] = pagina(antigo, 'Esta página mudou de endereço | DupliCasa', 'Esta página mudou de endereço.', 'Esta página mudou de endereço',
                                     f'As casas desta freguesia estão agora em <a href="{novo}">{SITE}{novo}</a>.', [('Início', '/'), ('Arrendar', '/arrendar/')],
                                     [], '', novo, hoje, canonico=novo, refrescar=novo)
    dia = AGORA.date().isoformat()
    # registo: data da última mudança de cada página (lastmod), páginas que deixaram de existir (410)
    novas_ou_mudadas = []
    for c, h in list(paginas.items()):
        imp = impressao(h)
        r = REG['paginas'].get(c) or {}
        if r.get('h') != imp:
            r['h'], r['mod'] = imp, dia
            if c in INDEXAVEIS:
                novas_ou_mudadas.append(SITE + c)
        r['visto'] = dia
        REG['paginas'][c] = r
        paginas[c] = h.replace('__MOD__', r['mod'])
    saiu = {}
    for c, r in list(REG['paginas'].items()):
        if c in paginas:
            continue
        visto = r.get('visto') or dia
        try:
            idade = (AGORA.date() - datetime.date.fromisoformat(visto)).days
        except ValueError:
            idade = 0
        if idade > REG_DIAS:
            del REG['paginas'][c]
            continue
        if not r.get('visto'):
            r['visto'] = dia            # conhecida do sitemap antigo: começa a contar hoje
        saiu[c] = pagina_saiu(c, paginas, hoje).replace('__MOD__', dia)
        if not r.get('saiu'):
            r['saiu'] = dia
            novas_ou_mudadas.append(SITE + c)
    tmp = tempfile.mkdtemp(prefix='.seo-', dir=pai)
    for caminho, conteudo in paginas.items():
        p = os.path.join(tmp, caminho.strip('/'), 'index.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(conteudo)
    for caminho, conteudo in saiu.items():
        p = os.path.join(tmp, caminho.strip('/'), '410.html')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(conteudo)
    for caminho, conteudo in ficheiros.items():
        p = os.path.join(tmp, caminho.strip('/'))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(conteudo)
    for c in paginas:
        if c in REG['paginas']:
            REG['paginas'][c].pop('saiu', None)
    try:
        mod_inicio = datetime.datetime.fromtimestamp(os.path.getmtime('/var/www/duaschaves/index.html'), datetime.timezone.utc).date().isoformat()
    except OSError:
        mod_inicio = dia
    no_mapa = sorted(c for c in paginas if c in INDEXAVEIS)
    open(os.path.join(tmp, 'llms-full.txt'), 'w', encoding='utf-8').write(llms_full(resumo, len(anuncios), hoje))
    open(os.path.join(tmp, 'sitemap.xml'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'  <url><loc>{SITE}/</loc><lastmod>{mod_inicio}</lastmod></url>\n' +
        ''.join(f'  <url><loc>{SITE}{c}</loc><lastmod>{REG["paginas"][c]["mod"]}</lastmod></url>\n' for c in no_mapa) + '</urlset>\n')
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
    # histórico (tendência) e registo, escritos ao lado e trocados de uma vez
    HIST['dias'][dia] = dict(SNAP)
    podar_hist(HIST, AGORA.date())
    if os.environ.get('DC_INDEXNOW', '1') == '1':
        ultimo = REG.get('indexnow') or ''
        mudadas = sorted({SITE + c for c, r in REG['paginas'].items() if c in INDEXAVEIS and r.get('mod', '') > ultimo}
                         | {SITE + c for c, r in REG['paginas'].items() if r.get('saiu', '') > ultimo})
        if avisar_indexnow(mudadas, pai):
            REG['indexnow'] = dia
    escrever_json(f_hist, HIST)
    escrever_json(f_reg, REG)
    n_noidx = sum(1 for c in paginas if c not in INDEXAVEIS)
    print(f'Páginas SEO: {len(paginas)} ({len(no_mapa)} no sitemap, {n_noidx} sem índice ou redirecionadas, {len(saiu)} com 410) + {len(ficheiros)} CSV; '
          f'mudadas hoje: {len(novas_ou_mudadas)}; histórico: {len(HIST["dias"])} dias')


if __name__ == '__main__':
    main()
