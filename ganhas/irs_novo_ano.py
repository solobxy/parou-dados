#!/usr/bin/env python3
"""ganhas.pt: quando sai a circular com as tabelas de retenção na fonte do IRS de um ano novo, mete-as em
ganhas/dados/oficial.json sozinho (corre no GitHub Actions, em ganhas-atualizar.yml).

- Só faz alguma coisa se o ano corrente ainda não tiver tabelas (oficial.json → irs.ano < ano corrente).
- Procura a Circular n.º 1/<ano> da Autoridade Tributária nos endereços onde costuma ser publicada.
- Lê as tabelas I, II e III do Continente com as mesmas regras de ganhas/processar.py.
- Só aceita se tudo bater certo: 12 escalões por tabela, limites a subir, taxas plausíveis, parcela por
  dependente, retenção zero no salário mínimo e valores normais para salários de referência.
  Se alguma coisa não bater, não mexe em nada (o site continua com as tabelas do ano anterior, com o ano à vista).
Uso: python3 ganhas/irs_novo_ano.py [ano]
"""
import datetime as dt, json, math, os, re, subprocess, sys, tempfile, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
OF = os.path.join(AQUI, 'dados', 'oficial.json')
ANO = int(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today().year

O = json.load(open(OF, encoding='utf-8'))
TESTE = bool(os.environ.get('IRS_TESTE'))   # lê e compara com as tabelas guardadas, sem escrever nada
if int(O['irs']['ano']) >= ANO and not TESTE:
    print(f'IRS: já tenho as tabelas de {O["irs"]["ano"]}.')
    sys.exit(0)

URLS = [
    f'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/instrucoes_administrativas/Documents/Circular_1_{ANO}.pdf',
    f'https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/tabela_ret_doclib/Documents/Circular_1_{ANO}.pdf',
    f'https://at.madeira.gov.pt/ficheiros/Circular_1_{ANO}.pdf',
]


def baixar(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (ganhas.pt)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def texto_pdf(dados, layout):
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, 'c.pdf')
        open(p, 'wb').write(dados)
        args = ['pdftotext'] + (['-layout'] if layout else []) + [p, '-']
        return subprocess.run(args, capture_output=True, check=True).stdout.decode('utf-8', 'replace')


def tabela(txt, inicio, fim):
    i = txt.index(inicio)
    j = txt.index(fim, i + 10)
    linhas, dep = [], None
    for l in txt[i:j].split('\n'):
        l = re.sub(r'\s+', ' ', l.strip())
        m = re.match(r'^(Até|Superior a) ([\d ]+,\d\d) ([\d,]+)\s?%\s+(.*)$', l)
        if not m:
            continue
        limite = float(m.group(2).replace(' ', '').replace(',', '.'))
        taxa = round(float(m.group(3).replace(',', '.')) / 100, 6)
        resto = m.group(4)
        mf = re.match(r'^[\d,]+\s?% x ([\d,]+) x \( ?([\d ]+,\d\d) - R ?\) ([\d,]+)', resto)
        if mf:
            parcela = {'t': taxa, 'f': float(mf.group(1).replace(',', '.')), 'b': float(mf.group(2).replace(' ', '').replace(',', '.'))}
            dep = float(mf.group(3).replace(',', '.'))
        else:
            nums = re.findall(r'\d[\d ]*,\d\d', resto)
            if not nums:
                continue
            parcela = float(nums[0].replace(' ', '').replace(',', '.'))
            dep = float(nums[1].replace(' ', '').replace(',', '.')) if len(nums) > 1 else dep
        linhas.append([None if m.group(1) == 'Superior a' else limite, taxa, parcela])
    return {'linhas': linhas, 'dependente': dep}


def ler(txt):
    T = {'I': tabela(txt, 'Tabela I - Trabalho dependente', 'Tabela II - Trabalho dependente'),
         'II': tabela(txt, 'Tabela II - Trabalho dependente', 'Tabela III - Trabalho dependente'),
         'III': tabela(txt, 'Tabela III - Trabalho dependente', 'Tabela IV - Trabalho dependente')}
    return T


def reter(T, R, tab='I', dep=0):
    for lim, taxa, parc in T[tab]['linhas']:
        if lim is None or R <= lim:
            if isinstance(parc, dict):
                parc = parc['t'] * parc['f'] * (parc['b'] - R)
            if dep >= 3 and tab in ('I', 'II'):
                taxa -= 0.01
            return float(max(0, math.floor(R * taxa - parc - T[tab]['dependente'] * dep + 1e-9)))
    return 0.0


def valido(T):
    smn = O['smn'].get(str(ANO)) or max(O['smn'].values())
    for k, t in T.items():
        L = t['linhas']
        if len(L) != 12 or L[-1][0] is not None or not t['dependente'] or not (5 < t['dependente'] < 200):
            return f'tabela {k}: {len(L)} escalões, dependente {t["dependente"]}'
        lims = [l[0] for l in L[:-1]]
        if any(b <= a for a, b in zip(lims, lims[1:])) or not all(0 <= l[1] <= 0.6 for l in L):
            return f'tabela {k}: limites ou taxas fora do normal'
    if reter(T, smn, 'I') != 0:
        return f'retenção no salário mínimo ({smn} €) não dá zero'
    for R, a, b in ((1500, 40, 300), (2500, 250, 800), (5000, 1000, 2200)):
        v = reter(T, R, 'I')
        if not (a <= v <= b):
            return f'retenção de {R} € na tabela I fora do normal: {v}'
    return ''


erros = []
for url in URLS:
    try:
        pdf = baixar(url)
    except Exception as e:  # noqa: BLE001
        erros.append(f'{url}: {e}')
        continue
    if not pdf.startswith(b'%PDF'):
        erros.append(f'{url}: não é PDF')
        continue
    for layout in (False, True):
        try:
            txt = texto_pdf(pdf, layout)
            if 'Continente' not in txt or str(ANO) not in txt:
                raise ValueError('não parece a circular das tabelas do Continente deste ano')
            T = ler(txt)
            prob = valido(T)
            if prob:
                raise ValueError(prob)
        except Exception as e:  # noqa: BLE001
            erros.append(f'{url} ({"layout" if layout else "texto"}): {e}')
            continue
        if TESTE:
            igual = T == O['irs']['tabelas']
            print(f'TESTE {url} ({"layout" if layout else "texto"}): {"igual às tabelas guardadas" if igual else "DIFERENTE"}')
            if not igual:
                print(json.dumps(T)[:1500])
            sys.exit(0 if igual else 1)
        irs = O['irs']
        irs.update({'ano': ANO, 'tabelas': T, 'nota': ''})
        irs.pop('novembro', None)
        ex = O.get('exemplo') or {'bruto': 1200}
        b = ex.get('bruto', 1200)
        ex.update({'bruto': b, 'ss': round(b * irs['ss'], 2), 'irs': reter(T, b, 'I')})
        ex['liquido'] = round(b - ex['ss'] - ex['irs'], 2)
        O['exemplo'] = ex
        f = O.setdefault('fontes', {}).setdefault('irs', {})
        f.update({'nome': f'Autoridade Tributária, Circular n.º 1/{ANO}', 'url': url,
                  'ref': f'tabelas de retenção na fonte para o Continente em {ANO}'})
        O['atualizado'] = dt.date.today().isoformat()
        tmp = OF + '.novo'
        json.dump(O, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        os.replace(tmp, OF)
        print(f'IRS: tabelas de {ANO} postas a partir de {url}')
        sys.exit(0)

print(f'IRS: ainda sem tabelas de {ANO} que passem nas verificações. O site continua com as de {O["irs"]["ano"]}.')
print('\n'.join(erros))
