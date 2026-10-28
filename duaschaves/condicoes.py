"""Tira da descrição de um anúncio as condições de entrada: caução, rendas adiantadas e fiador.

Os senhorios escrevem isto de muitas formas («2 meses de caução», «caução: 1.500€», «1 renda adiantada»,
«pede-se fiador»). Só se devolve o que se encontra com segurança; o resto fica vazio («Sem informação»).
A mesma lógica existe em JavaScript no site, para os anúncios antigos.
"""
import re, unicodedata

NUM = r'(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis)'
PAL = {'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'quatro': 4, 'cinco': 5, 'seis': 6}
MES = r'(?:\(\s*\w+\s*\)\s*)?(?:meses|mes|rendas?|mensalidades?)'


def _norm(t):
    t = (t or '').replace('€', ' eur ')
    t = unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', t)


def _n(x):
    return PAL.get(x) or (int(x) if x.isdigit() else None)


def _meses(n):
    return '%d %s' % (n, 'mês' if n == 1 else 'meses')


def condicoes(texto):
    t = _norm(texto)
    out = {}
    # caução
    if re.search(r'(sem|nao (?:e )?(?:pedida|exigida|necessaria)a?|isento de) cauca', t):
        out['caucao'] = 'Sem caução'
    else:
        m = (re.search(NUM + r'\s*' + MES + r'\s*(?:de\s*)?(?:cauca|garantia|deposito)', t) or
             re.search(r'(?:cauca[oa]?|deposito de garantia)\s*(?:de|:|-|=|no valor de|equivalente a|correspondente a|igual a)?\s*' + NUM + r'\s*' + MES, t))
        if m and _n(m.group(1)) and 0 < _n(m.group(1)) <= 12:
            out['caucao'] = _meses(_n(m.group(1)))
        else:
            m = re.search(r'cauca[oa]?\s*(?:de|:|-|=|no valor de)?\s*(\d{1,2}[\. ]?\d{3}|\d{2,4})(?:,\d+)?\s*eur', t)
            if m:
                v = int(re.sub(r'\D', '', m.group(1)))
                if 50 <= v <= 30000:
                    out['caucao'] = f'{v:,} €'.replace(',', '.')
    # rendas adiantadas
    m = (re.search(NUM + r'\s*' + MES + r'\s*(?:de renda\s*)?(?:adiantad|antecipad|em adiantamento|de adiantamento|pagos? adiantad|pagas? adiantad)', t) or
         re.search(r'(?:adiantamento|antecipacao|adiantadas?|antecipadas?)\s*(?:de|:|-)?\s*' + NUM + r'\s*' + MES, t))
    if m and _n(m.group(1)) and 0 < _n(m.group(1)) <= 12:
        out['adiantadas'] = _meses(_n(m.group(1)))
    # fiador
    if re.search(r'(sem|nao (?:e )?(?:necessario|exigido|pedido)|dispensa(?:-se)?) (?:de )?fiador', t):
        out['fiador'] = 'Não pede'
    elif re.search(r'\bfiador', t):
        out['fiador'] = 'Pede fiador'
    return out


if __name__ == '__main__':
    for x in ['Caução de 2 meses e 1 renda adiantada.', 'Pedimos 2 (dois) meses de caução + fiador', 'caução: 1.500€',
              'Não é necessário fiador. Sem caução.', 'Entrada: 1ª renda + 2 rendas adiantadas + caução de uma renda',
              'Apartamento T1 renovado', 'adiantamento de 3 meses, caução 900 €']:
        print(x, '->', condicoes(x))
