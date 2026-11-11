"""caiu.pt — cabaz do essencial (alimentação, água, casa e higiene), montado em cada recolha.

Para cada artigo do cabaz escolhe, em cada loja, o produto mais barato ao kg, ao litro ou à unidade que
cumpre as regras do artigo (palavras obrigatórias e proibidas, unidade, tamanho máximo da embalagem e um
intervalo de preço plausível, que trava leituras erradas). Soma as quantidades de referência de 1 pessoa
durante 1 semana; o site multiplica pelas pessoas e pelo mês (52/12 semanas).

Só entram nos totais os artigos que as três lojas têm hoje: assim os totais comparam sempre o mesmo cabaz.
O histórico (um ponto por dia) fica na tabela essencial do historico.db; na primeira vez é reconstruído com
os preços já guardados.
"""
import re, unicodedata
from datetime import timedelta

ORDEM = ['continente', 'pingodoce', 'auchan']
COD = {'continente': 'c', 'pingodoce': 'p', 'auchan': 'a'}
SEMANAS_MES = 52 / 12
HIST_DIAS = 120


def norm(t):
    return unicodedata.normalize('NFD', (t or '').lower()).encode('ascii', 'ignore').decode()


# q: quantidade de 1 pessoa numa semana, na unidade u. tem: o nome tem de começar por uma destas expressões.
# e: e conter todas estas. nao: nenhuma destas. banda: preço por unidade plausível (€). max: maior embalagem aceite.
ITENS = [
    # Mercearia
    {'id': 'arroz', 'nome': 'Arroz agulha', 'g': 'mercearia', 'q': 0.3, 'u': 'kg', 'max': 2,
     'tem': [r'arroz'], 'e': [r'\bagulha\b'], 'nao': [r'\bdoce\b', r'cozid', r'pronto', r'micro', r'refeic', r'basmati', r'integral', r'vaporiz'],
     'banda': (0.6, 4.5)},
    {'id': 'massa', 'nome': 'Massa esparguete', 'g': 'mercearia', 'q': 0.15, 'u': 'kg', 'max': 1.5,
     'tem': [r'massa', r'esparguete'], 'e': [r'esparguete'], 'nao': [r'fresc', r'gluten', r'integral', r'arroz', r'lentilha', r'grao', r'feijao', r'refeic', r'bolonhesa', r'\bovo\b', r'konjac'],
     'banda': (0.6, 5)},
    {'id': 'azeite', 'nome': 'Azeite', 'g': 'mercearia', 'q': 0.15, 'u': 'L', 'max': 3,
     'tem': [r'azeite'], 'e': [], 'nao': [r'spray', r'aromatiz', r'\balho\b', r'malagueta', r'piri', r'limao', r'trufa', r'manjeric', r'oregao', r'ervas', r'gotas'],
     'banda': (3.5, 20)},
    {'id': 'acucar', 'nome': 'Açúcar', 'g': 'mercearia', 'q': 0.1, 'u': 'kg', 'max': 2,
     'tem': [r'acucar'], 'e': [], 'nao': [r'baunilh', r'glace', r'confeit', r'pacotes', r'saquetas', r'stick', r'cana', r'mascavado', r'amarelo', r'coco', r'\bem po\b', r'canela', r'pedra', r'cubos', r'sem acucar'],
     'banda': (0.6, 3.5)},
    {'id': 'atum', 'nome': 'Atum em lata', 'g': 'mercearia', 'q': 0.12, 'u': 'kg', 'max': 1,
     'tem': [r'atum'], 'e': [], 'nao': [r'fresco', r'posta\b', r'lombo', r'salada', r'pate', r'pasta', r'sandes', r'molho', r'tomate', r'pimento', r'refeic', r'bife', r'cebolada', r'escabeche', r'congel'],
     'banda': (4, 40)},
    {'id': 'pao', 'nome': 'Pão de forma', 'g': 'mercearia', 'q': 0.25, 'u': 'kg', 'max': 1.2,
     'tem': [r'pao de forma'], 'e': [], 'nao': [r'gluten', r'proteic', r'keto'],
     'banda': (1, 8)},
    # Frescos, talho e peixe
    {'id': 'leite', 'nome': 'Leite meio-gordo', 'g': 'frescos', 'q': 1.5, 'u': 'L', 'max': 6,
     'tem': [r'leite'], 'e': [r'meio[ -]?gordo'], 'nao': [r'chocolat', r'cacau', r'lactose', r'condensad', r'infantil', r'crescimento', r'proteina', r'\bcabra\b', r'ovelha', r'\bem po\b', r'fermentad', r'aveia', r'soja', r'amendoa', r'coco', r'cafe', r'morango', r'baunilha', r'vitamin', r'calcio', r'omega', r'digest', r'\bmini\b'],
     'banda': (0.5, 2)},
    {'id': 'ovos', 'nome': 'Ovos', 'g': 'frescos', 'q': 4, 'u': 'un', 'max': 30,
     'tem': [r'ovos?\b'], 'e': [], 'nao': [r'classe s\b', r'\bs\b$', r'chocolate', r'codorniz', r'pascoa', r'kinder', r'liquid', r'cozid', r'clara', r'gema', r'massa', r'moles', r'\bpo\b'],
     'banda': (0.12, 0.6)},
    {'id': 'iogurte', 'nome': 'Iogurte natural', 'g': 'frescos', 'q': 0.5, 'u': 'kg', 'max': 1.2,
     'tem': [r'iogurte'], 'e': [r'natural'], 'nao': [r'grego', r'liquid', r'bebivel', r'proteina', r'skyr', r'kefir', r'lactose', r'vegetal', r'soja', r'coco', r'aveia', r'aromas', r'frutos', r'morango', r'pedacos', r'cereais', r'mel\b', r'bifidus'],
     'banda': (1, 6)},
    {'id': 'queijo', 'nome': 'Queijo flamengo', 'g': 'frescos', 'q': 0.1, 'u': 'kg', 'max': 1.2,
     'tem': [r'queijo'], 'e': [r'flamengo'], 'nao': [r'ralado', r'light', r'magro', r'lactose', r'tostas', r'sandes'],
     'banda': (5, 22)},
    {'id': 'fiambre', 'nome': 'Fiambre', 'g': 'frescos', 'q': 0.1, 'u': 'kg', 'max': 1.2,
     'tem': [r'fiambre'], 'e': [], 'nao': [r'tostas', r'sandes', r'pizza', r'croissant', r'queijo'],
     'banda': (4, 25)},
    {'id': 'manteiga', 'nome': 'Manteiga', 'g': 'frescos', 'q': 0.05, 'u': 'kg', 'max': 1,
     'tem': [r'manteiga'], 'e': [], 'nao': [r'magra', r'50 ?%', r'light', r'para barrar', r'barravel', r'amendoim', r'cacau', r'karite', r'corpo', r'labios', r'\balho\b', r'ervas', r'amendoa', r'caju', r'avela', r'bolach', r'biscoit', r'croissant', r'\bclarificad', r'ghee', r'spray', r'vegetal'],
     'banda': (6, 20)},
    {'id': 'frango', 'nome': 'Frango', 'g': 'frescos', 'q': 0.5, 'u': 'kg', 'max': 3,
     'tem': [r'frango', r'peito de frango', r'coxas? de frango', r'perna de frango', r'asas de frango', r'bifes? de frango', r'lombinhos de frango', r'peitos? de frango'],
     'e': [], 'nao': [r'panad', r'nugget', r'assad', r'fumad', r'hamburg', r'salsich', r'refeic', r'caldo', r'croquet', r'cordon', r'pizza', r'cozid', r'grelhad', r'marinad', r'temperad', r'piri', r'barbecue', r'churrasco', r'tikka', r'curry', r'fiambre', r'peru', r'tiras', r'kebab', r'empad', r'rissol', r'sopa', r'massa', r'arroz', r'lasanha', r'wrap', r'sandes', r'salada', r'pate', r'pele', r'figado', r'lenha', r'fatiad', r'\bfat\b', r'recheio', r'recheado', r'manteiga', r'\balho\b', r'cogumel', r'moelas', r'carcaca', r'\bcao\b', r'\bgato\b', r'nuggets'],
     'banda': (1.8, 12)},
    {'id': 'picada', 'nome': 'Carne picada de porco', 'g': 'frescos', 'q': 0.25, 'u': 'kg', 'max': 2,
     'tem': [r'carne picada', r'preparado:? (de )?carne picada', r'picado de porco'], 'e': [r'porco|suino'],
     'nao': [r'soja', r'vegetal', r'veggie', r'lasanha', r'bolonhesa', r'empad', r'tarte', r'\bcao\b', r'\bgato\b', r'frango', r'peru', r'bovino', r'vaca', r'novilh', r'mista'],
     'banda': (3, 14)},
    {'id': 'pescada', 'nome': 'Pescada', 'g': 'frescos', 'q': 0.3, 'u': 'kg', 'max': 3,
     'tem': [r'pescada', r'filetes? de pescada', r'postas? de pescada', r'lombos? de pescada', r'medalh[oõ]es de pescada'], 'e': [],
     'nao': [r'panad', r'croquet', r'refeic', r'empad', r'pastel', r'pasteis', r'bolinhos', r'douradinh', r'molho', r'gratinad', r'arroz', r'massa', r'ovas', r'cabeca', r'\d\s*kg a \d', r'\d\s*a \d[.,]?\d*\s*kg'],
     'banda': (3, 25)},
    # Fruta e legumes
    {'id': 'batata', 'nome': 'Batata', 'g': 'fruta', 'q': 1, 'u': 'kg', 'max': 5,
     'tem': [r'batatas?'], 'e': [], 'nao': [r'\bdoce\b', r'frita', r'congel', r'palha', r'chips', r'pre-frit', r'pure', r'rosti', r'gomos', r'\bpala\b', r'snack', r'cozer em', r'micro', r'salada', r'gratin', r'murro', r'cozid', r'assad'],
     'banda': (0.4, 3)},
    {'id': 'cebola', 'nome': 'Cebola', 'g': 'fruta', 'q': 0.3, 'u': 'kg', 'max': 3,
     'tem': [r'cebolas?'], 'e': [], 'nao': [r'frita', r'conserva', r'congel', r'\bpo\b', r'picad', r'caramel', r'crocante', r'doce de', r'compota', r'pickles', r'chalota', r'cebolinho'],
     'banda': (0.5, 4)},
    {'id': 'cenoura', 'nome': 'Cenoura', 'g': 'fruta', 'q': 0.3, 'u': 'kg', 'max': 3,
     'tem': [r'cenouras?'], 'e': [], 'nao': [r'sumo', r'ralada', r'congel', r'baby', r'conserva', r'bolo', r'creme', r'sopa', r'palitos', r'rodelas', r'bio\b'],
     'banda': (0.5, 4)},
    {'id': 'tomate', 'nome': 'Tomate', 'g': 'fruta', 'q': 0.3, 'u': 'kg', 'max': 2,
     'tem': [r'tomates?'], 'e': [], 'nao': [r'pelado', r'polpa', r'concentrad', r'\bseco', r'cherry', r'cereja', r'ketchup', r'molho', r'frito', r'triturad', r'passata', r'lata', r'sumo', r'doce', r'pedacos', r'cubos', r'pesto', r'mozzarella'],
     'banda': (0.8, 6)},
    {'id': 'banana', 'nome': 'Banana', 'g': 'fruta', 'q': 0.6, 'u': 'kg', 'max': 3,
     'tem': [r'bananas?'], 'e': [], 'nao': [r'chips', r'desidrat', r'\bseca', r'pao\b', r'bolo', r'iogurte', r'batido', r'pure', r'pacotinho', r'baby', r'bio\b', r'pedacos'],
     'banda': (0.6, 3.5)},
    {'id': 'maca', 'nome': 'Maçã', 'g': 'fruta', 'q': 0.5, 'u': 'kg', 'max': 3,
     'tem': [r'macas?'], 'e': [], 'nao': [r'sumo', r'desidrat', r'chips', r'compota', r'pure', r'vinagre', r'nectar', r'doce', r'bolo', r'tarte', r'pacotinho', r'snack', r'pedacos', r'iogurte', r'canela', r'\bbio\b', r'baby'],
     'banda': (0.6, 4.5)},
    {'id': 'laranja', 'nome': 'Laranja', 'g': 'fruta', 'q': 0.5, 'u': 'kg', 'max': 5,
     'tem': [r'laranjas?'], 'e': [], 'nao': [r'sumo', r'nectar', r'compota', r'doce', r'refrigerante', r'bolo', r'chocolate', r'cha\b', r'iogurte', r'gelado', r'\bbio\b', r'baby'],
     'banda': (0.5, 3.5)},
    {'id': 'agua', 'nome': 'Água', 'g': 'mercearia', 'q': 7, 'u': 'L', 'max': 10,
     'tem': [r'agua'], 'e': [], 'nao': [r'(com|c/) ?gas\b', r'gaseific', r'alcalin', r'sabor', r'tonica', r'oxigen', r'micelar', r'colonia', r'\bcoco\b', r'destilad', r'perfum', r'termal', r'rosas', r'limao', r'frutos', r'lima', r'pessego', r'morango', r'framboesa', r'maracuja', r'vitamin', r'alcalin', r'bebe\b', r'infantil', r'lisa\b.*sabor', r'flor', r'passar', r'engomar', r'bateria', r'radiador', r'ferro', r'cha\b', r'kombucha', r'gelo'],
     'banda': (0.08, 0.9)},
    # Casa e higiene
    {'id': 'papel', 'nome': 'Papel higiénico', 'g': 'casa', 'q': 1.5, 'u': 'un', 'max': 40,
     'tem': [r'papel higienico'], 'e': [], 'nao': [r'humido', r'molhado', r'toalhit', r'bebe'],
     'banda': (0.08, 1)},
    {'id': 'loica', 'nome': 'Detergente da loiça', 'g': 'casa', 'q': 0.1, 'u': 'L', 'max': 2,
     'tem': [r'detergente'], 'e': [r'loica|louca'], 'nao': [r'maquina', r'pastilha', r'capsula', r'\bpo\b', r'gel maquina', r'abrilhant', r'sal\b', r'limpa maquina', r'tudo em 1'],
     'banda': (0.8, 8)},
    {'id': 'roupa', 'nome': 'Detergente da roupa', 'g': 'casa', 'q': 1.5, 'u': 'dose', 'max': 120,
     'tem': [r'detergente'], 'e': [r'roupa'], 'nao': [r'loica|louca', r'tira[ -]?nodoa', r'amaciador', r'pre[ -]?lavag', r'\bmao\b', r'la\b', r'delicad', r'preta', r'escura', r'bebe', r'sensivel', r'roupa interior'],
     'banda': (0.04, 0.6)},
    {'id': 'dentes', 'nome': 'Pasta de dentes', 'g': 'casa', 'q': 0.02, 'u': 'L', 'max': 0.3,
     'tem': [r'pasta (de )?dentes', r'pasta dentifrica', r'dentifrico'], 'e': [], 'nao': [r'infantil', r'crianca', r'kids', r'junior', r'escova', r'sensib', r'branquead', r'white', r'gengiva', r'protese'],
     'banda': (5, 80)},
    {'id': 'banho', 'nome': 'Gel de banho', 'g': 'casa', 'q': 0.1, 'u': 'L', 'max': 2,
     'tem': [r'gel (de )?banho', r'gel de duche', r'gel duche'], 'e': [], 'nao': [r'bebe', r'infantil', r'crianca', r'kids', r'intimo', r'oleo', r'esfoliant', r'creme'],
     'banda': (1, 15)},
]
GRUPOS = [['mercearia', 'Mercearia e água'], ['frescos', 'Frescos, talho e peixe'], ['fruta', 'Fruta e legumes'],
          ['casa', 'Casa e higiene']]

_COMP = {}


def _re(it):
    if it['id'] not in _COMP:
        _COMP[it['id']] = (
            [re.compile(r'^' + t + r'\b') for t in it['tem']],
            [re.compile(t) for t in it['e']],
            [re.compile(t) for t in it['nao']],
        )
    return _COMP[it['id']]


UNI = {'kg': 'kg', 'l': 'L', 'lt': 'L', 'un': 'un', 'unid': 'un', 'dose': 'dose', 'dos': 'dose', 'doses': 'dose',
       'lavagem': 'dose', 'lavagens': 'dose', 'doz': 'doz', 'rolo': 'un', 'ro': 'un'}


def tamanho_total(texto, tamanho):
    """Quantidade da embalagem na unidade do cabaz: (valor, unidade) ou (None, '')."""
    q, u, _ = tamanho(texto)
    if not q:
        return None, ''
    if u == 'ml':
        return q / 1000, 'L'
    if u == 'g':
        return q / 1000, 'kg'
    return q, 'un'


def doses(texto):
    m = re.search(r'(\d+)\s*(?:doses|lavagens|lav\b|dos\b)', norm(texto))
    return int(m.group(1)) if m else None


def ao_kg(p, emb):
    """O preço da loja é ao kg (fruta, legumes, carne e peixe a granel)?
    Auchan: o nome acaba em «kg» sem quantidade. Continente: o preço por unidade que mostra é o preço vezes o peso
    de cada peça. Pingo Doce: o leitor da loja já devolve o preço por unidade em kg."""
    nome = norm(p['nome']).strip()
    if p['loja'] == 'auchan' and re.search(r'\bkg$', nome) and not re.search(r'\d\s*kg$', nome):
        return True
    un = UNI.get(norm(p.get('un') or ''), '')
    if p['loja'] == 'continente' and un == 'un' and p.get('pun') and emb:
        m = re.search(r'\((\d+)\s*un\)', norm(p.get('qtd') or ''))
        n = int(m.group(1)) if m else 1
        esperado = p['preco'] * emb / n
        return abs(esperado - p['pun']) <= max(0.02, 0.03 * p['pun'])
    return False


def preco_unit(p, it, tamanho):
    """Preço por unidade do artigo (€/kg, €/L, €/un, €/dose) e tamanho da embalagem, ou (None, None)."""
    alvo = it['u']
    texto = f"{p['qtd']} {p['nome']}"
    emb = None
    if alvo == 'dose':
        emb = doses(texto)
    else:
        v, u = tamanho_total(texto, tamanho)
        if u == alvo:
            emb = v
    un = UNI.get(norm(p.get('un') or ''), '')
    pu = p.get('pun')
    if alvo == 'kg' and un == 'un' and pu and re.fullmatch(r'0[.,]\d+\s*un', norm(p.get('qtd') or '').strip()):
        return pu, None
    if alvo == 'kg' and un != 'kg' and ao_kg(p, emb):
        return p['preco'], None
    if un == 'doz' and alvo == 'un' and pu:
        pu, un = pu / 12, 'un'
    if pu and un == alvo:
        # o preço por unidade da própria loja é o de referência (no atum, por exemplo, é ao peso escorrido)
        return pu, emb
    if emb:
        return p['preco'] / emb, emb
    return None, None


def preparar(p):
    nome = re.sub(r'\s+', ' ', norm(p['nome']).replace('-', ' ')).strip()
    return nome, nome + ' ' + norm(p.get('qtd') or '')


def candidato(p, it, tamanho, prep=None):
    """Se o produto serve para o artigo, devolve (preço por unidade, embalagem); senão None."""
    tem, e, nao = _re(it)
    nome, alvo = prep or preparar(p)
    if not any(r.search(nome) for r in tem):
        return None
    if not all(r.search(alvo) for r in e) or any(r.search(alvo) for r in nao):
        return None
    pu, emb = preco_unit(p, it, tamanho)
    if not pu:
        return None
    lo, hi = it['banda']
    if not lo <= pu <= hi:
        return None
    if emb and emb > it['max']:
        return None
    return round(pu, 4), emb


def escolher(prods, tamanho):
    """{artigo: {loja: produto escolhido}} com o mais barato por unidade de cada loja."""
    melhor = {it['id']: {} for it in ITENS}
    for p in prods:
        if not p.get('preco'):
            continue
        prep = preparar(p)
        for it in ITENS:
            r = candidato(p, it, tamanho, prep)
            if not r:
                continue
            pu, emb = r
            atual = melhor[it['id']].get(p['loja'])
            if not atual or pu < atual['pu'] - 1e-9:
                melhor[it['id']][p['loja']] = {'pu': pu, 'emb': emb, 'p': p}
    return melhor


def totais(melhor):
    """Totais de 1 pessoa numa semana, só com os artigos que as três lojas têm."""
    comuns = [it for it in ITENS if all(l in melhor[it['id']] for l in ORDEM)]
    tot = {COD[l]: round(sum(melhor[it['id']][l]['pu'] * it['q'] for it in comuns), 2) for l in ORDEM}
    div = round(sum(min(melhor[it['id']][l]['pu'] for l in ORDEM) * it['q'] for it in comuns), 2)
    return comuns, tot, div


def montar(prods, db, agora, tamanho, compacto_img=lambda u: u):
    """Escolhe os produtos de hoje, guarda o ponto de hoje no histórico e devolve o bloco do resumo."""
    hoje = agora.date().isoformat()
    melhor = escolher(prods, tamanho)
    comuns, tot, div = totais(melhor)
    db.execute('create table if not exists essencial(dia text, loja text, total real, artigos int, primary key(dia, loja))')
    if not db.execute('select 1 from essencial limit 1').fetchone():
        reconstruir(db, agora, tamanho)
    if comuns:
        for l in ORDEM:
            db.execute('insert or replace into essencial values (?,?,?,?)', (hoje, COD[l], tot[COD[l]], len(comuns)))
        db.execute('insert or replace into essencial values (?,?,?,?)', (hoje, 'd', div, len(comuns)))
    db.commit()
    desde = (agora.date() - timedelta(days=HIST_DIAS)).isoformat()
    hist = {}
    for dia, loja, total, n in db.execute('select dia, loja, total, artigos from essencial where dia>=? order by dia', (desde,)):
        hist.setdefault(dia, {'n': n})[loja] = total
    artigos = []
    for it in ITENS:
        lojas = {}
        for l in ORDEM:
            m = melhor[it['id']].get(l)
            if not m:
                continue
            p = m['p']
            lojas[COD[l]] = [p['nome'], round(p['preco'], 2), round(m['pu'], 4), m['emb'], p.get('url') or '', 1 if (p.get('antes') or p.get('pvpr') or p.get('promo')) else 0]
        artigos.append({'id': it['id'], 'n': it['nome'], 'g': it['g'], 'q': it['q'], 'u': it['u'], 'l': lojas,
                        'comum': it in comuns})
    return {
        'dia': hoje, 'semanas_mes': round(SEMANAS_MES, 4), 'grupos': GRUPOS,
        'artigos': artigos, 'n': len(comuns), 'total_artigos': len(ITENS),
        'totais': tot, 'dividir': div,
        'hist': [[d, v.get('c'), v.get('p'), v.get('a'), v.get('d'), v['n']] for d, v in sorted(hist.items())],
        'faltam': [[it['nome'], [COD[l] for l in ORDEM if l not in melhor[it['id']]]] for it in ITENS if it not in comuns],
    }


def reconstruir(db, agora, tamanho):
    """Primeira vez: refaz o histórico do cabaz com os preços diários já guardados (preço por unidade de hoje
    corrigido pela variação do preço da embalagem nesse dia)."""
    dias = [r[0] for r in db.execute('select distinct dia from precos where dia<? order by dia', (agora.date().isoformat(),))]
    if not dias:
        return
    base = {}
    for loja, pid, nome, marca, cat, qtd, pun, un in db.execute('select loja, id, nome, marca, cat, qtd, pun, un from produtos'):
        base[(loja, pid)] = {'loja': loja, 'id': pid, 'nome': nome or '', 'marca': marca or '', 'cat': cat or '', 'qtd': qtd or '', 'pun': pun, 'un': un or ''}
    ult = {}
    for loja, pid, preco in db.execute('''select c.loja, c.id, c.preco from precos c join produtos p on p.loja=c.loja and p.id=c.id and c.dia=p.visto'''):
        ult[(loja, pid)] = preco
    for dia in dias:
        prods = []
        for loja, pid, preco, antes, pvpr, promo in db.execute('select loja, id, preco, antes, pvpr, promo from precos where dia=?', (dia,)):
            b = base.get((loja, pid))
            if not b or not preco:
                continue
            p = dict(b, preco=preco, antes=antes, pvpr=pvpr, promo=promo)
            if b['pun'] and ult.get((loja, pid)):
                p['pun'] = b['pun'] * preco / ult[(loja, pid)]
            prods.append(p)
        melhor = escolher(prods, tamanho)
        comuns, tot, div = totais(melhor)
        # só dias com quase todo o cabaz (no início a recolha tinha menos pesquisas)
        if len(comuns) < len(ITENS) * 0.8:
            continue
        for l in ORDEM:
            db.execute('insert or replace into essencial values (?,?,?,?)', (dia, COD[l], tot[COD[l]], len(comuns)))
        db.execute('insert or replace into essencial values (?,?,?,?)', (dia, 'd', div, len(comuns)))
