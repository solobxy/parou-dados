"""ganhas.pt: salários por subgrupo de profissões (CPP/2010, 2 dígitos) a partir da série dos Quadros de Pessoal da
DGCP/MTSSS (ficheiro seriesqp_2014_<ano>.xlsx, o mesmo dos decis):
  quadro 40: ganho médio mensal por profissão; quadro 28: remuneração base média mensal; quadro 19: trabalhadores;
  quadro 36: ganho médio mensal por distrito (contexto das páginas «profissão num distrito»).
É o dado oficial mais fino que existe por profissão em Portugal (o INE só publica o 1.º dígito).
Só aceita um ano igual ou mais recente e só se o total do quadro 40 bater com o ganho médio dos decis (quadro 33/34).
Chamado por ganhas/oficiais_auto.py (atualizar) e à mão: python3 ganhas/oficiais_subgrupos.py <seriesqp.xlsx>.
"""
import glob, json, os

QUADROS = {'ganho': 'q40', 'base': 'q28', 'tco': 'q19'}


def _ler(xlsx):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    out, anos, ambito = {}, None, 'Continente'
    for chave, q in QUADROS.items():
        nome = next(n for n in wb.sheetnames if n.strip() == q)
        linhas = [list(r) for r in wb[nome].iter_rows(values_only=True)]
        cab = next(r for r in linhas if r and any(isinstance(c, int) and 2000 < c < 2100 for c in r[1:]))
        cols = [(i, c) for i, c in enumerate(cab) if isinstance(c, int) and 2000 < c < 2100]
        a = [c for _, c in cols]
        assert anos is None or a == anos, f'{q}: anos diferentes dos outros quadros'
        anos = a
        if any(r and isinstance(r[0], str) and r[0].strip() == 'Portugal' for r in linhas[:5]):
            ambito = 'Portugal'
        for r in linhas:
            if not r or len(r) < 2:
                continue
            cod = r[0]
            if isinstance(cod, str) and cod.strip().isdigit():
                cod = int(cod.strip())
            if cod is None and isinstance(r[1], str) and r[1].strip() == 'Total':
                k = 'T'
            elif isinstance(cod, int) and 0 <= cod < 100:
                k = str(cod)  # 1 dígito = grande grupo, 2 dígitos = subgrupo
            else:
                continue
            vals = [r[i] if isinstance(r[i], (int, float)) else None for i, _ in cols]
            x = out.setdefault(k, {'nome_oficial': (r[1] or '').strip() if isinstance(r[1], str) else ''})
            x[chave] = [round(v, 2) if v is not None and chave != 'tco' else (int(v) if v is not None else None) for v in vals]
    # quadro 36: ganho médio por distrito do estabelecimento (Continente), para dar contexto às páginas por distrito
    nome = next(n for n in wb.sheetnames if n.strip() == 'q36')
    linhas = [list(r) for r in wb[nome].iter_rows(values_only=True)]
    cab = next(r for r in linhas if r and any(isinstance(c, int) and 2000 < c < 2100 for c in r))
    col = max((i for i, c in enumerate(cab) if isinstance(c, int) and 2000 < c < 2100), key=lambda i: cab[i])
    assert cab[col] == anos[-1], 'quadro 36 com outro ano'
    dist = {}
    for r in linhas:
        txt = next((c for c in r if isinstance(c, str)), None) if r else None
        if txt and txt.strip() != 'Total' and len(r) > col and isinstance(r[col], (int, float)):
            dist[_slug(txt.strip())] = {'nome': txt.strip(), 'ganho': round(r[col], 2)}
    return anos, ambito, out, dist


def _slug(s):
    import re, unicodedata
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def atualizar(O, F, DECIS=None):
    fx = sorted(glob.glob(os.path.join(F, 'dgcp', 'seriesqp_*.xlsx')))
    assert fx, 'sem o ficheiro da DGCP'
    anos, ambito, linhas, dist = _ler(fx[-1])
    ano = anos[-1]
    velho = (O.get('subgrupos') or {}).get('ano') or 0
    assert ano >= velho, f'ano {ano} mais antigo'
    subs = {k: v for k, v in linhas.items() if len(k) == 2}
    assert len(subs) >= 38, f'só {len(subs)} subgrupos'
    for k, v in subs.items():
        assert all(c in v for c in QUADROS), f'subgrupo {k} sem os três quadros'
        g, b = v['ganho'][-1], v['base'][-1]
        assert g is None or 400 < g < 12000, f'subgrupo {k}: ganho {g} fora do normal'
        assert g is None or b is None or b <= g + 1, f'subgrupo {k}: base acima do ganho'
    tot = linhas.get('T') or {}
    media = (O.get('distribuicao') or {}).get('media')
    if media and (O.get('distribuicao') or {}).get('ano') == ano:
        assert abs(tot['ganho'][-1] - media) < 1.5, f'total do quadro 40 ({tot["ganho"][-1]}) não bate com o ganho médio ({media})'
    soma = sum(v['tco'][-1] or 0 for v in subs.values())
    assert 0.9 < soma / tot['tco'][-1] <= 1.0, 'a soma dos subgrupos não bate com o total de trabalhadores'
    assert len(dist) == 18 and all(600 < d['ganho'] < 5000 for d in dist.values()), f'distritos: {len(dist)}'
    import datetime as dt
    antes = O.get('subgrupos') or {}
    # data em que este ano de dados entrou no site (é a data da edição do estudo /estudos/salarios-por-profissao/)
    entrou = antes.get('entrou') if antes.get('ano') == ano and antes.get('entrou') else dt.date.today().isoformat()
    O['subgrupos'] = {'ano': ano, 'anos': anos, 'ambito': ambito, 'entrou': entrou, 'linhas': linhas}
    O['distritos_qp'] = {'ano': ano, 'ambito': ambito, 'valores': dist}
    url = O.get('fontes', {}).get('decis', {}).get('url', 'https://www.dgcp.mtsss.gov.pt/estatisticas')
    O['fontes']['subgrupos'] = {
        'nome': f'DGCP/MTSSS, Quadros de Pessoal, séries 2014-{ano} (quadros 19, 28, 36 e 40)', 'url': url,
        'ref': f'outubro de {ano}, {ambito}, trabalhadores por conta de outrem a tempo completo com remuneração completa',
        'descricao': 'ganho médio mensal, remuneração base média mensal e número de trabalhadores por subgrupo de profissões '
                     '(CPP/2010, 2 dígitos), no setor privado e no setor empresarial do Estado (não inclui a Administração Pública)'}
    return f'{ano}, {len(subs)} subgrupos, {soma} trabalhadores'


if __name__ == '__main__':
    import sys, tempfile, shutil
    AQUI = os.path.dirname(os.path.abspath(__file__))
    OF = os.path.join(AQUI, 'dados', 'oficial.json')
    O = json.load(open(OF, encoding='utf-8'))
    t = tempfile.mkdtemp()
    os.makedirs(os.path.join(t, 'dgcp'))
    shutil.copy(sys.argv[1], os.path.join(t, 'dgcp', os.path.basename(sys.argv[1]) if os.path.basename(sys.argv[1]).startswith('seriesqp_') else 'seriesqp_x.xlsx'))
    print(atualizar(O, t))
    import datetime as dt
    O['atualizado'] = dt.date.today().isoformat()
    json.dump(O, open(OF, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
