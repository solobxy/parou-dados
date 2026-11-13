"""webase: módulos, papéis e permissões (verificados sempre no servidor)."""
import json
import re

# Módulos que cada conta pode ligar ou desligar. As fichas de clientes estão sempre ligadas (são a base).
MODULOS = {
    'clientes': 'Fichas de clientes',
    'leads': 'Leads e oportunidades',
    'chamadas': 'Chamadas',
    'contratos': 'Contratos',
    'pontos': 'Pontos e recompensas',
    'adesoes': 'Subscrições e pacotes',
    'marketplace': 'Marketplace',
    'forum': 'Fórum',
}
ACOES = {'v': 'ver', 'c': 'criar', 'e': 'editar', 'a': 'apagar'}
EXTRAS = {
    'importar': 'Importar contactos',
    'exportar': 'Exportar dados',
    'equipa': 'Gerir a equipa e as permissões',
    'definicoes': 'Mudar as definições e a marca da conta',
    'auditoria': 'Ver o registo de atividade',
}

# Sugestões de módulos por setor (a pessoa muda à vontade, no início ou quando quiser)
SETORES = {
    'barbearia': ('Barbearia ou salão', ['clientes', 'pontos', 'adesoes', 'forum']),
    'restauracao': ('Café ou restaurante', ['clientes', 'pontos', 'adesoes', 'forum']),
    'bar': ('Bar ou discoteca', ['clientes', 'pontos', 'adesoes', 'forum']),
    'desporto': ('Ginásio, clube ou desporto', ['clientes', 'adesoes', 'pontos', 'contratos', 'forum']),
    'telecom': ('Telecomunicações', ['clientes', 'leads', 'chamadas', 'contratos', 'marketplace', 'forum']),
    'vendas': ('Equipa de vendas', ['clientes', 'leads', 'chamadas', 'contratos', 'marketplace', 'forum']),
    'servicos': ('Serviços e consultoria', ['clientes', 'leads', 'contratos', 'forum']),
    'loja': ('Loja ou comércio', ['clientes', 'pontos', 'adesoes', 'forum']),
    'outro': ('Outro', ['clientes', 'leads', 'forum']),
}

TODAS = 'vcea'
PAPEIS = {
    'administrador': ('Administrador', {m: TODAS for m in MODULOS}, 'todos', list(EXTRAS)),
    'gestor': ('Gestor', {m: TODAS for m in MODULOS}, 'todos', ['importar', 'exportar']),
    'comercial': ('Comercial', {'clientes': 'vce', 'leads': 'vce', 'chamadas': 'vce', 'contratos': 'vc', 'pontos': 'vc',
                                'adesoes': 'vc', 'marketplace': 'v', 'forum': 'vc'}, 'meus', []),
    'operador': ('Operador de chamadas', {'clientes': 'vce', 'leads': 'vc', 'chamadas': 'vce', 'forum': 'vc'}, 'meus', []),
    'balcao': ('Balcão', {'clientes': 'vce', 'pontos': 'vc', 'adesoes': 'vce', 'forum': 'vc'}, 'todos', []),
    'leitura': ('Só leitura', {m: 'v' for m in MODULOS}, 'todos', []),
}

# Fases do funil por omissão (cada conta pode mudar nomes e ordem; «ganho» e «perdido» são os fechos)
FASES = [
    {'id': 'prospect', 'nome': 'Por contactar', 'tipo': 'aberta'},
    {'id': 'contactado', 'nome': 'Contactado', 'tipo': 'aberta'},
    {'id': 'proposta', 'nome': 'Proposta', 'tipo': 'aberta'},
    {'id': 'negociacao', 'nome': 'Negociação', 'tipo': 'aberta'},
    {'id': 'ganho', 'nome': 'Ganho', 'tipo': 'ganho'},
    {'id': 'perdido', 'nome': 'Perdido', 'tipo': 'perdido'},
]

TIPOS_CAMPO = {'texto': 'Texto', 'numero': 'Número', 'data': 'Data', 'escolha': 'Escolha', 'sim_nao': 'Sim ou não'}

# Cores da marca para a app: todas com contraste ≥ 4,5:1 com texto branco
CORES = ['#2B3FD6', '#0F766E', '#1E7A4C', '#9A3412', '#B42318', '#A21CAF', '#6D28D9', '#14161B', '#0B5CAD', '#7A5A00']


def perm_de(u):
    try:
        p = json.loads(u['perm'] or '{}')
    except ValueError:
        p = {}
    if not isinstance(p, dict):
        p = {}
    return p


def perm_papel(papel):
    _, m, ambito, x = PAPEIS[papel]
    return {'m': dict(m), 'ambito': ambito, 'x': list(x)}


def limpar_perm(p, limite=None):
    """Valida uma matriz de permissões vinda do browser. Com «limite» (a de quem dá), não deixa dar mais do que se tem."""
    precisa = isinstance(p, dict)
    if not precisa:
        return None
    m_in = p.get('m') if isinstance(p.get('m'), dict) else {}
    m = {}
    for mod in MODULOS:
        v = m_in.get(mod, '')
        if not isinstance(v, str):
            v = ''
        letras = ''.join(a for a in 'vcea' if a in v)
        if letras and 'v' not in letras:
            letras = 'v' + letras           # quem cria, edita ou apaga tem de conseguir ver
        if limite is not None:
            letras = ''.join(a for a in letras if a in limite['m'].get(mod, ''))
        if letras:
            m[mod] = letras
    ambito = 'meus' if p.get('ambito') == 'meus' else 'todos'
    if limite is not None and limite.get('ambito') == 'meus':
        ambito = 'meus'
    x = [e for e in (p.get('x') if isinstance(p.get('x'), list) else []) if e in EXTRAS]
    if limite is not None:
        x = [e for e in x if e in limite['x']]
    return {'m': m, 'ambito': ambito, 'x': sorted(set(x))}


def perm_efetiva(u):
    """Permissões de um utilizador; o dono tem tudo."""
    if u['dono']:
        return {'m': {m: TODAS for m in MODULOS}, 'ambito': 'todos', 'x': list(EXTRAS)}
    p = limpar_perm(perm_de(u))
    return p or {'m': {}, 'ambito': 'meus', 'x': []}


def modulos_conta(conta):
    try:
        l = json.loads(conta['modulos'] or '[]')
    except ValueError:
        l = []
    l = [m for m in l if m in MODULOS]
    if 'clientes' not in l:
        l.insert(0, 'clientes')
    return l


def pode(u, conta, mod, acao='v'):
    if mod not in MODULOS:
        return False
    if mod not in modulos_conta(conta):
        return False
    return acao in perm_efetiva(u)['m'].get(mod, '')


def pode_x(u, extra):
    return extra in perm_efetiva(u)['x']


def so_meus(u):
    return perm_efetiva(u)['ambito'] == 'meus'


def fases_conta(conta):
    try:
        f = json.loads(conta['fases'] or 'null')
    except (ValueError, KeyError, IndexError):
        f = None
    return f if isinstance(f, list) and f else [dict(x) for x in FASES]


def limpar_fases(lista):
    if not isinstance(lista, list) or not 2 <= len(lista) <= 12:
        return None
    out, ids = [], set()
    for f in lista:
        if not isinstance(f, dict):
            return None
        nome = f.get('nome')
        tipo = f.get('tipo') if f.get('tipo') in ('aberta', 'ganho', 'perdido') else 'aberta'
        fid = f.get('id') if isinstance(f.get('id'), str) and re.fullmatch(r'[a-z0-9_-]{2,24}', f.get('id') or '') else None
        if not isinstance(nome, str) or not 1 <= len(nome.strip()) <= 30:
            return None
        if not fid:
            base = re.sub(r'[^a-z0-9]+', '-', nome.strip().lower())[:18].strip('-') or 'fase'
            fid, i = base, 2
            while fid in ids:
                fid = '%s-%d' % (base, i)
                i += 1
        if fid in ids:
            return None
        ids.add(fid)
        out.append({'id': fid, 'nome': nome.strip(), 'tipo': tipo})
    if not any(f['tipo'] == 'ganho' for f in out) or not any(f['tipo'] == 'perdido' for f in out):
        return None
    if not any(f['tipo'] == 'aberta' for f in out):
        return None
    return out


def campos_conta(conta):
    try:
        l = json.loads(conta['campos'] or '[]')
    except (ValueError, KeyError, IndexError):
        l = []
    return l if isinstance(l, list) else []


def limpar_campos(lista):
    if not isinstance(lista, list) or len(lista) > 20:
        return None
    out, ids = [], set()
    for f in lista:
        if not isinstance(f, dict):
            return None
        nome = f.get('nome')
        tipo = f.get('tipo')
        if not isinstance(nome, str) or not 1 <= len(nome.strip()) <= 40 or tipo not in TIPOS_CAMPO:
            return None
        fid = f.get('id') if isinstance(f.get('id'), str) and re.fullmatch(r'c_[a-z0-9]{4,12}', f.get('id') or '') else None
        if not fid:
            import secrets
            fid = 'c_' + secrets.token_hex(4)
        if fid in ids:
            return None
        ids.add(fid)
        opcoes = []
        if tipo == 'escolha':
            ops = f.get('opcoes')
            if not isinstance(ops, list) or not 1 <= len(ops) <= 20:
                return None
            for o in ops:
                if not isinstance(o, str) or not 1 <= len(o.strip()) <= 40:
                    return None
                opcoes.append(o.strip())
        out.append({'id': fid, 'nome': nome.strip(), 'tipo': tipo, 'opcoes': opcoes})
    return out


def luminancia(hexcor):
    r, g, b = (int(hexcor[i:i + 2], 16) / 255 for i in (1, 3, 5))

    def lin(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contraste_branco(hexcor):
    return 1.05 / (luminancia(hexcor) + 0.05)


def cor_valida(hexcor):
    return isinstance(hexcor, str) and re.fullmatch(r'#[0-9A-Fa-f]{6}', hexcor) and contraste_branco(hexcor) >= 4.5
