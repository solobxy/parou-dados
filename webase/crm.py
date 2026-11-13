"""webase: rotas do CRM — clientes, importar/exportar, leads, chamadas, contratos, pontos, subscrições e painel."""
import csv
import io
import json
import re
import time
from datetime import date, datetime, timedelta

import base as B
import nucleo as N
import perm as P
from nucleo import Erro, precisa, rota, RE_ID

DIA = 86400
RESULTADOS = {'atendida': 'Atendida', 'nao_atendida': 'Não atendida', 'ocupado': 'Ocupado', 'voicemail': 'Caixa de correio',
              'venda': 'Venda', 'ligar_depois': 'Ligar depois', 'sem_interesse': 'Sem interesse', 'errado': 'Número errado'}
PERIODOS = {'mensal': 1, 'trimestral': 3, 'semestral': 6, 'anual': 12}


def euros(cent):
    s = '{:,.2f}'.format((cent or 0) / 100).replace(',', ' ').replace('.', ',')
    return s + ' €'


def soma_meses(d, meses):
    m = d.month - 1 + meses
    ano, mes = d.year + m // 12, m % 12 + 1
    dias = [31, 29 if ano % 4 == 0 and (ano % 100 or ano % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
    return d.replace(year=ano, month=mes, day=min(d.day, dias))


def ts_soma_meses(ts, meses):
    dt = datetime.fromtimestamp(ts, N.LISBOA) if N.LISBOA else datetime.fromtimestamp(ts)
    return int(soma_meses(dt, meses).timestamp())


# ======================================================================== clientes

def cli_json(c, r, nomes=None, completo=False):
    o = {'id': r['id'], 'tipo': r['tipo'], 'nome': r['nome'], 'email': r['email'], 'telefone': r['telefone'],
         'empresa': r['empresa'], 'localidade': r['localidade'], 'etiquetas': N.jl(r['etiquetas'], []), 'estado': r['estado'],
         'responsavel': r['responsavel'], 'pontos': r['pontos'], 'gasto': r['gasto'], 'ultima_visita': r['ultima_visita'],
         'consentimento': bool(r['consentimento']), 'criado': r['criado'], 'atualizado': r['atualizado']}
    if nomes is not None:
        o['responsavel_nome'] = nomes.get(r['responsavel'], '')
    if completo:
        o.update({'nif': r['nif'], 'morada': r['morada'], 'codpostal': r['codpostal'], 'nascimento': r['nascimento'],
                  'notas': r['notas'], 'origem': r['origem'], 'consentimento_quando': r['consentimento_quando'],
                  'consentimento_como': r['consentimento_como'], 'extra': N.jl(r['extra'], {})})
    return o


def nomes_equipa(c, u):
    return {r['id']: r['nome'] for r in c.execute('SELECT id, nome FROM utilizadores WHERE conta=?', (u['conta'],))}


def validar_extra(conta, v):
    if v in (None, ''):
        return {}
    precisa(isinstance(v, dict), 'Campos personalizados inválidos.')
    defs = {f['id']: f for f in P.campos_conta(conta)}
    out = {}
    for k, val in v.items():
        f = defs.get(k)
        if not f or val in (None, ''):
            continue
        if f['tipo'] == 'texto':
            out[k] = N.limpo(val, 300)
        elif f['tipo'] == 'numero':
            try:
                num = float(str(val).replace(',', '.'))
            except ValueError:
                raise Erro(400, '«%s» tem de ser um número.' % f['nome'], campo=k)
            precisa(abs(num) < 1e12, '«%s» é demasiado grande.' % f['nome'], campo=k)
            out[k] = num
        elif f['tipo'] == 'data':
            out[k] = N.data_ok(val, nome=k)
        elif f['tipo'] == 'escolha':
            precisa(val in f['opcoes'], 'Escolhe uma das opções de «%s».' % f['nome'], campo=k)
            out[k] = val
        elif f['tipo'] == 'sim_nao':
            precisa(isinstance(val, bool), 'Pedido inválido.', campo=k)
            out[k] = val
    return out


def validar_cliente(c, u, conta, d, atual=None):
    def tem(k):
        return atual is None or k in d

    def ant(k, defeito=''):
        return atual[k] if atual is not None else defeito
    f = {}
    f['nome'] = N.campo(d, 'nome', 120, True, 'o nome') if tem('nome') else ant('nome')
    f['tipo'] = (d.get('tipo') if d.get('tipo') in ('particular', 'empresa') else 'particular') if tem('tipo') else ant('tipo')
    f['email'] = N.email_ok(d.get('email')) if tem('email') else ant('email')
    f['telefone'] = N.telefone_ok(d.get('telefone')) if tem('telefone') else ant('telefone')
    f['nif'] = N.nif_ok(d.get('nif')) if tem('nif') else ant('nif')
    f['empresa'] = N.campo(d, 'empresa', 120) if tem('empresa') else ant('empresa')
    f['morada'] = N.campo(d, 'morada', 200) if tem('morada') else ant('morada')
    f['localidade'] = N.campo(d, 'localidade', 60) if tem('localidade') else ant('localidade')
    if tem('codpostal'):
        cp = N.campo(d, 'codpostal', 12)
        precisa(not cp or re.fullmatch(r'[0-9A-Za-z -]{3,12}', cp), 'Código postal inválido (ex.: 4420-155).', campo='codpostal')
        f['codpostal'] = cp
    else:
        f['codpostal'] = ant('codpostal')
    f['nascimento'] = N.data_ok(d.get('nascimento'), nome='nascimento') if tem('nascimento') else ant('nascimento')
    f['etiquetas'] = json.dumps(N.etiquetas_ok(d.get('etiquetas')), ensure_ascii=False) if tem('etiquetas') else ant('etiquetas', '[]')
    f['notas'] = N.campo(d, 'notas', 4000, linhas=True) if tem('notas') else ant('notas')
    f['estado'] = (d.get('estado') if d.get('estado') in ('ativo', 'inativo') else 'ativo') if tem('estado') else ant('estado', 'ativo')
    f['origem'] = N.campo(d, 'origem', 80) if tem('origem') else ant('origem')
    f['extra'] = json.dumps(validar_extra(conta, d.get('extra')), ensure_ascii=False) if tem('extra') else ant('extra', '{}')
    if tem('consentimento'):
        cons = d.get('consentimento') is True
        f['consentimento'] = 1 if cons else 0
        if cons and not (atual is not None and atual['consentimento']):
            f['consentimento_quando'] = B.agora()
        elif not cons:
            f['consentimento_quando'] = None
        else:
            f['consentimento_quando'] = atual['consentimento_quando']
        f['consentimento_como'] = N.campo(d, 'consentimento_como', 120) if cons else ''
    if atual is None or 'responsavel' in d:
        f['responsavel'] = N.responsavel_para(c, u, d)
    if f['nascimento']:
        precisa(f['nascimento'] <= date.today().isoformat(), 'A data de nascimento não pode ser no futuro.', campo='nascimento')
    f['busca'] = N.normalizar(' '.join([f['nome'], f['email'], f['telefone'], f['empresa'], f['nif'], f['localidade'],
                                        ' '.join(N.jl(f['etiquetas'], []))]))
    return f


def duplicado(c, u, f, excluir=None):
    for col in ('email', 'telefone'):
        if f.get(col):
            r = c.execute('SELECT id, nome, responsavel FROM clientes WHERE conta=? AND %s=? AND id<>?' % col,
                          (u['conta'], f[col], excluir or '')).fetchone()
            if r:
                return r, col
    return None, None


def erro_duplicado(u, dup, col, outro=False):
    qual = 'e-mail' if col == 'email' else 'telefone'
    if P.so_meus(u) and dup['responsavel'] != u['id']:
        # a ficha é de outra pessoa da equipa: avisa sem mostrar quem é
        return Erro(409, 'Este %s já está numa ficha de outra pessoa da equipa. Fala com quem gere a conta.' % qual, campo=col)
    return Erro(409, 'Já tens %scliente com este %s: %s.' % ('outro ' if outro else 'um ', qual, dup['nome']),
                duplicado={'id': dup['id'], 'nome': dup['nome']}, campo=col)


def inserir_cliente(c, u, conta, f, origem_atividade='Ficha criada'):
    t = B.agora()
    cid = B.novo_id()
    f = dict(f)
    f.setdefault('responsavel', u['id'])
    cols = ['id', 'conta', 'criado', 'atualizado'] + list(f.keys())
    vals = [cid, u['conta'], t, t] + list(f.values())
    c.execute('INSERT INTO clientes(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))), vals)
    N.atividade(c, u, cid, 'criado', origem_atividade)
    if 'pontos' in P.modulos_conta(conta) and conta['pontos_boas_vindas'] > 0:
        dar_pontos(c, u, cid, conta['pontos_boas_vindas'], 'boas_vindas', 0, 'Pontos de boas-vindas')
    return cid


@rota('GET', '/api/clientes', modulo='clientes')
def clientes(h, c, u, m, d):
    q = N.normalizar((h.q.get('q') or '')[:80]).strip()
    where, args = 'conta=?' + N.filtro_ambito(u), [u['conta']]
    if q:
        for parte in q.split()[:5]:
            where += " AND busca LIKE ? ESCAPE '\\'"
            args.append(N.like(parte))
    if h.q.get('etiqueta'):
        where += ' AND EXISTS(SELECT 1 FROM json_each(clientes.etiquetas) WHERE value=?)'
        args.append(h.q['etiqueta'][:30].lower())
    if h.q.get('tipo') in ('particular', 'empresa'):
        where += ' AND tipo=?'
        args.append(h.q['tipo'])
    if h.q.get('estado') in ('ativo', 'inativo'):
        where += ' AND estado=?'
        args.append(h.q['estado'])
    if h.q.get('responsavel') and h.q['responsavel'].isdigit():
        where += ' AND responsavel=?'
        args.append(int(h.q['responsavel']))
    ordem = {'nome': 'nome COLLATE NOCASE', 'pontos': 'pontos DESC', 'gasto': 'gasto DESC', 'visita': 'ultima_visita DESC',
             'antigos': 'criado'}.get(h.q.get('ordem'), 'atualizado DESC')
    pagina = N.inteiro(h.q.get('pagina', '1'), 1, 100000)
    total = c.execute('SELECT COUNT(*) FROM clientes WHERE ' + where, args).fetchone()[0]
    args_ordem = []
    if q and not h.q.get('ordem'):
        # primeiro quem tem o nome igual ou a começar pelo que se escreveu
        qe = q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        ordem = ("CASE WHEN busca LIKE ? ESCAPE '\\' THEN 0 WHEN busca LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, " + ordem)
        args_ordem = [qe + ' %', qe + '%']
    rows = c.execute('SELECT * FROM clientes WHERE %s ORDER BY %s LIMIT ? OFFSET ?' % (where, ordem),
                     args + args_ordem + [N.POR_PAGINA, (pagina - 1) * N.POR_PAGINA]).fetchall()
    nomes = nomes_equipa(c, u)
    etiq = [r[0] for r in c.execute('SELECT DISTINCT j.value FROM clientes, json_each(clientes.etiquetas) j WHERE clientes.conta=?' +
                                    N.filtro_ambito(u, alias='clientes.') + ' ORDER BY 1 LIMIT 200', (u['conta'],))]
    return 200, {'itens': [cli_json(c, r, nomes) for r in rows], 'total': total, 'pagina': pagina,
                 'por_pagina': N.POR_PAGINA, 'etiquetas': etiq}


@rota('POST', '/api/clientes', modulo='clientes', acao='c')
def cliente_criar(h, c, u, m, d):
    precisa(h.limitar('cli-criar', 600, 3600), 'Demasiadas fichas criadas de seguida. Espera um pouco.', 429)
    conta = N.conta_de(c, u)
    n = c.execute('SELECT COUNT(*) FROM clientes WHERE conta=?', (u['conta'],)).fetchone()[0]
    precisa(n < N.MAX_CLIENTES, 'Chegaste ao máximo de %d clientes nesta conta. Fala connosco.' % N.MAX_CLIENTES)
    f = validar_cliente(c, u, conta, d)
    if not d.get('forcar'):
        dup, col = duplicado(c, u, f)
        if dup:
            raise erro_duplicado(u, dup, col)
    cid = inserir_cliente(c, u, conta, f)
    r = c.execute('SELECT * FROM clientes WHERE id=?', (cid,)).fetchone()
    return 201, {'cliente': cli_json(c, r, nomes_equipa(c, u), True)}


@rota('GET', '/api/clientes/' + RE_ID, modulo='clientes')
def cliente_ver(h, c, u, m, d):
    r = N.cliente_acessivel(c, u, m.group(1))
    conta = N.conta_de(c, u)
    nomes = nomes_equipa(c, u)
    out = {'cliente': cli_json(c, r, nomes, True)}
    out['atividade'] = [{'tipo': a['tipo'], 'texto': a['texto'], 'quem': nomes.get(a['uid'], ''), 'quando': a['criado']}
                        for a in c.execute('SELECT * FROM atividade WHERE cliente=? AND conta=? ORDER BY criado DESC, id DESC LIMIT 100',
                                           (r['id'], u['conta']))]
    if P.pode(u, conta, 'chamadas'):
        out['chamadas'] = [cham_json(x, nomes) for x in c.execute(
            'SELECT * FROM chamadas WHERE conta=? AND cliente=?' + N.filtro_ambito(u, 'utilizador') + ' ORDER BY quando DESC LIMIT 30',
            (u['conta'], r['id']))]
    if P.pode(u, conta, 'contratos'):
        out['contratos'] = [contrato_json(x, nomes) for x in c.execute(
            'SELECT * FROM contratos WHERE conta=? AND cliente=? ORDER BY inicio DESC', (u['conta'], r['id']))]
    if P.pode(u, conta, 'leads'):
        out['leads'] = [lead_json(x, nomes) for x in c.execute(
            'SELECT * FROM leads WHERE conta=? AND cliente=? ORDER BY atualizado DESC', (u['conta'], r['id']))]
    if P.pode(u, conta, 'pontos'):
        out['pontos'] = [{'delta': x['delta'], 'motivo': x['motivo'], 'valor': x['valor'], 'descricao': x['descricao'],
                          'quem': nomes.get(x['uid'], ''), 'quando': x['criado']}
                         for x in c.execute('SELECT * FROM pontos WHERE cliente=? AND conta=? ORDER BY id DESC LIMIT 40',
                                            (r['id'], u['conta']))]
    if P.pode(u, conta, 'adesoes'):
        out['adesoes'] = [adesao_json(c, x) for x in c.execute(
            'SELECT a.*, p.nome pnome, p.tipo ptipo, p.preco ppreco, p.periodo pperiodo, p.usos pusos FROM adesoes a '
            'JOIN produtos p ON p.id=a.produto WHERE a.conta=? AND a.cliente=? ORDER BY a.criado DESC', (u['conta'], r['id']))]
    return 200, out


@rota('POST', '/api/clientes/' + RE_ID, modulo='clientes', acao='e')
def cliente_mudar(h, c, u, m, d):
    r = N.cliente_acessivel(c, u, m.group(1))
    conta = N.conta_de(c, u)
    f = validar_cliente(c, u, conta, d, atual=r)
    mudou_contacto = f['email'] != r['email'] or f['telefone'] != r['telefone']
    if mudou_contacto and not d.get('forcar'):
        dup, col = duplicado(c, u, {k: f[k] for k in ('email', 'telefone') if f[k] != r[k]}, excluir=r['id'])
        if dup:
            raise erro_duplicado(u, dup, col, outro=True)
    f['atualizado'] = B.agora()
    sets = ','.join('%s=?' % k for k in f)
    c.execute('UPDATE clientes SET %s WHERE id=? AND conta=?' % sets, list(f.values()) + [r['id'], u['conta']])
    mudou = [k for k in ('nome', 'email', 'telefone', 'empresa', 'nif', 'morada', 'localidade', 'estado', 'responsavel')
             if k in f and f[k] != r[k]]
    if mudou:
        N.atividade(c, u, r['id'], 'editado', 'Ficha atualizada: ' + ', '.join(mudou))
    if 'consentimento' in f and f['consentimento'] != r['consentimento']:
        N.atividade(c, u, r['id'], 'consentimento', 'Consentimento para marketing ' + ('dado' if f['consentimento'] else 'retirado'))
    novo = c.execute('SELECT * FROM clientes WHERE id=?', (r['id'],)).fetchone()
    return 200, {'cliente': cli_json(c, novo, nomes_equipa(c, u), True)}


@rota('POST', '/api/clientes/' + RE_ID + '/apagar', modulo='clientes', acao='a')
def cliente_apagar(h, c, u, m, d):
    r = N.cliente_acessivel(c, u, m.group(1))
    c.execute('BEGIN IMMEDIATE')
    try:
        c.execute('DELETE FROM atividade WHERE cliente=? AND conta=?', (r['id'], u['conta']))
        c.execute('DELETE FROM adesao_usos WHERE adesao IN (SELECT id FROM adesoes WHERE cliente=?)', (r['id'],))
        c.execute('DELETE FROM clientes WHERE id=? AND conta=?', (r['id'], u['conta']))
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    N.auditar(h, c, u, 'cliente.apagar', r['id'], r['nome'])
    return 200, {'ok': True}


@rota('POST', '/api/clientes/' + RE_ID + '/nota', modulo='clientes', acao='e')
def cliente_nota(h, c, u, m, d):
    r = N.cliente_acessivel(c, u, m.group(1))
    texto = N.campo(d, 'texto', 2000, True, 'a nota', linhas=True)
    N.atividade(c, u, r['id'], 'nota', texto)
    c.execute('UPDATE clientes SET atualizado=? WHERE id=?', (B.agora(), r['id']))
    return 201, {'ok': True}


@rota('GET', '/api/clientes/' + RE_ID + '/dados', modulo='clientes', extra='exportar')
def cliente_dados(h, c, u, m, d):
    """Tudo o que a conta guarda sobre uma pessoa (para responder a um pedido de acesso do RGPD)."""
    r = N.cliente_acessivel(c, u, m.group(1))
    out = {'cliente': {k: r[k] for k in r.keys() if k not in ('conta', 'busca')}}
    for t in ('atividade', 'pontos', 'chamadas', 'contratos', 'leads', 'adesoes'):
        out[t] = [{k: x[k] for k in x.keys() if k != 'conta'}
                  for x in c.execute('SELECT * FROM %s WHERE conta=? AND cliente=?' % t, (u['conta'], r['id']))]
    N.auditar(h, c, u, 'cliente.dados', r['id'])
    nome = re.sub(r'[^A-Za-z0-9]+', '-', N.normalizar(r['nome']))[:40] or 'cliente'
    return 'ficheiro', (json.dumps(out, ensure_ascii=False, indent=1).encode(), 'application/json; charset=utf-8',
                        'dados-%s.json' % nome)


# ---------------------------------------------------------------- importar

MAPA_AUTO = {
    'nome': ['nome', 'name', 'cliente', 'nome completo', 'full name', 'contacto', 'primeiro nome'],
    'email': ['email', 'e-mail', 'mail', 'correio', 'correio eletronico', 'e mail'],
    'telefone': ['telefone', 'telemovel', 'telemóvel', 'phone', 'tel', 'tlm', 'numero', 'número', 'mobile', 'contacto telefonico'],
    'nif': ['nif', 'contribuinte', 'nipc', 'vat', 'numero de contribuinte'],
    'empresa': ['empresa', 'company', 'organizacao', 'organização', 'entidade', 'firma'],
    'morada': ['morada', 'endereco', 'endereço', 'address', 'rua'],
    'localidade': ['localidade', 'cidade', 'city', 'concelho', 'local', 'distrito'],
    'codpostal': ['codigo postal', 'código postal', 'cp', 'cod postal', 'postal code', 'zip'],
    'nascimento': ['nascimento', 'data de nascimento', 'aniversario', 'aniversário', 'birthday', 'data nascimento'],
    'etiquetas': ['etiquetas', 'tags', 'grupo', 'categoria', 'segmento'],
    'notas': ['notas', 'observacoes', 'observações', 'notes', 'comentarios', 'comentários', 'obs'],
    'tipo': ['tipo'],
}
CAMPOS_IMPORT = list(MAPA_AUTO)


def mapa_automatico(cabecalho):
    out = {}
    usados = set()
    for i, col in enumerate(cabecalho):
        k = N.normalizar(col).strip().replace('_', ' ')
        for campo, nomes in MAPA_AUTO.items():
            if campo in usados:
                continue
            if k in [N.normalizar(x) for x in nomes]:
                out[str(i)] = campo
                usados.add(campo)
                break
    return out


def ler_csv(texto):
    texto = texto.lstrip('﻿')
    amostra = texto[:4096]
    try:
        dialeto = csv.Sniffer().sniff(amostra, delimiters=',;\t')
        sep = dialeto.delimiter
    except csv.Error:
        sep = ';' if amostra.count(';') > amostra.count(',') else ','
    leitor = csv.reader(io.StringIO(texto), delimiter=sep)
    linhas = []
    for i, l in enumerate(leitor):
        if i > 10001:
            break
        if any(x.strip() for x in l):
            linhas.append([x.strip() for x in l][:40])
    return linhas


def data_import(v):
    v = (v or '').strip()
    if not v:
        return ''
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y'):
        try:
            return datetime.strptime(v, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return ''


def linha_para_cliente(linha, mapa):
    d = {}
    for idx, campo in mapa.items():
        i = int(idx)
        if i < len(linha) and campo in CAMPOS_IMPORT:
            d[campo] = linha[i]
    avisos = []
    out = {}
    nome = N.limpo(d.get('nome', ''), 120)
    out['empresa'] = N.limpo(d.get('empresa', ''), 120)
    for campo, fn in (('email', N.email_ok), ('telefone', N.telefone_ok), ('nif', N.nif_ok)):
        try:
            out[campo] = fn(d.get(campo, ''))
        except Erro:
            out[campo] = ''
            avisos.append(campo)
    if not nome:
        nome = out['empresa'] or out['email'] or out['telefone']
    if not nome:
        return None, ['sem nome']
    out['nome'] = nome
    out['morada'] = N.limpo(d.get('morada', ''), 200)
    out['localidade'] = N.limpo(d.get('localidade', ''), 60)
    out['codpostal'] = N.limpo(d.get('codpostal', ''), 12)
    out['nascimento'] = data_import(d.get('nascimento'))
    out['notas'] = N.limpo(d.get('notas', ''), 4000, linhas=True)
    tipo = N.normalizar(d.get('tipo', ''))
    out['tipo'] = 'empresa' if tipo.startswith('empresa') or tipo in ('b2b', 'company') or (out['empresa'] and not d.get('nome')) else 'particular'
    try:
        out['etiquetas'] = N.etiquetas_ok(d.get('etiquetas', ''))
    except Erro:
        out['etiquetas'] = []
    return out, avisos


@rota('POST', '/api/clientes/importar', modulo='clientes', acao='c', extra='importar', limite=4 * 1024 * 1024)
def clientes_importar(h, c, u, m, d):
    texto = d.get('csv')
    precisa(isinstance(texto, str) and texto.strip(), 'Escolhe um ficheiro CSV com os teus contactos.')
    precisa(len(texto) <= 3 * 1024 * 1024, 'O ficheiro é demasiado grande (máximo 3 MB). Divide-o em partes.')
    linhas = ler_csv(texto)
    precisa(len(linhas) >= 2, 'O ficheiro precisa de uma linha de títulos e pelo menos um contacto.')
    precisa(len(linhas) <= 10001, 'No máximo 10 000 contactos de cada vez. Divide o ficheiro.')
    cab, corpo = linhas[0], linhas[1:]
    mapa = d.get('mapa') if isinstance(d.get('mapa'), dict) else mapa_automatico(cab)
    mapa = {str(k): v for k, v in mapa.items() if str(k).isdigit() and v in CAMPOS_IMPORT}
    if d.get('previa'):
        exemplo = []
        for l in corpo[:5]:
            cli, _ = linha_para_cliente(l, mapa)
            exemplo.append(cli)
        return 200, {'colunas': cab, 'mapa': mapa, 'campos': CAMPOS_IMPORT, 'total': len(corpo), 'exemplo': exemplo}
    precisa('nome' in mapa.values() or 'empresa' in mapa.values() or 'email' in mapa.values() or 'telefone' in mapa.values(),
            'Liga pelo menos uma coluna ao nome, à empresa, ao e-mail ou ao telefone.')
    precisa(h.limitar('importar', 20, 3600), 'Já importaste muitas vezes nesta hora. Tenta daqui a pouco.', 429)
    conta = N.conta_de(c, u)
    existentes = c.execute('SELECT COUNT(*) FROM clientes WHERE conta=?', (u['conta'],)).fetchone()[0]
    emails = {r[0] for r in c.execute("SELECT email FROM clientes WHERE conta=? AND email<>''", (u['conta'],))}
    tels = {r[0] for r in c.execute("SELECT telefone FROM clientes WHERE conta=? AND telefone<>''", (u['conta'],))}
    etiq_extra = N.etiquetas_ok(d.get('etiqueta')) if d.get('etiqueta') else []
    resp = N.responsavel_para(c, u, d)
    criados = repetidos = sem_nome = com_avisos = 0
    t = B.agora()
    c.execute('BEGIN IMMEDIATE')
    try:
        for l in corpo:
            if existentes + criados >= N.MAX_CLIENTES:
                break
            cli, av = linha_para_cliente(l, mapa)
            if cli is None:
                sem_nome += 1
                continue
            if (cli['email'] and cli['email'] in emails) or (cli['telefone'] and cli['telefone'] in tels):
                repetidos += 1
                continue
            if av:
                com_avisos += 1
            et = cli['etiquetas'] + [e for e in etiq_extra if e not in cli['etiquetas']]
            cli['etiquetas'] = json.dumps(et[:15], ensure_ascii=False)
            cli['busca'] = N.normalizar(' '.join([cli['nome'], cli['email'], cli['telefone'], cli['empresa'], cli['nif'],
                                                  cli['localidade'], ' '.join(et)]))
            cli['origem'] = 'Importação'
            cli['responsavel'] = resp
            cid = B.novo_id()
            cols = ['id', 'conta', 'criado', 'atualizado'] + list(cli)
            c.execute('INSERT INTO clientes(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))),
                      [cid, u['conta'], t, t] + list(cli.values()))
            if cli['email']:
                emails.add(cli['email'])
            if cli['telefone']:
                tels.add(cli['telefone'])
            criados += 1
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    N.auditar(h, c, u, 'importar', criados, '%d criados, %d repetidos, %d sem nome' % (criados, repetidos, sem_nome))
    return 200, {'criados': criados, 'repetidos': repetidos, 'sem_nome': sem_nome, 'com_avisos': com_avisos,
                 'limite': existentes + criados >= N.MAX_CLIENTES}


# ---------------------------------------------------------------- exportar (CSV seguro para Excel)

def celula(v):
    if v is None:
        return ''
    s = str(v)
    if s and s[0] in '=+-@\t\r':          # não deixa o Excel tratar o texto como fórmula
        s = "'" + s
    return s


def csv_bytes(cab, linhas):
    out = io.StringIO()
    w = csv.writer(out, delimiter=';', quoting=csv.QUOTE_MINIMAL, lineterminator='\r\n')
    w.writerow(cab)
    for l in linhas:
        w.writerow([celula(x) for x in l])
    return ('﻿' + out.getvalue()).encode('utf-8')


def data_pt(ts):
    if not ts:
        return ''
    dt = datetime.fromtimestamp(ts, N.LISBOA) if N.LISBOA else datetime.fromtimestamp(ts)
    return dt.strftime('%d/%m/%Y %H:%M')


def iso_pt(s):
    return '%s/%s/%s' % (s[8:10], s[5:7], s[:4]) if s and len(s) == 10 else ''


@rota('GET', r'/api/exportar/(clientes|leads|chamadas|contratos)\.csv', extra='exportar')
def exportar(h, c, u, m, d):
    tipo = m.group(1)
    conta = N.conta_de(c, u)
    N.exige(u, conta, tipo, 'v')
    precisa(h.limitar('exportar', 30, 3600), 'Já exportaste muitas vezes nesta hora. Tenta daqui a pouco.', 429)
    nomes = nomes_equipa(c, u)
    if tipo == 'clientes':
        campos = P.campos_conta(conta)
        cab = ['Nome', 'Tipo', 'E-mail', 'Telefone', 'NIF', 'Empresa', 'Morada', 'Localidade', 'Código postal', 'Nascimento',
               'Etiquetas', 'Estado', 'Pontos', 'Total gasto (€)', 'Consentimento marketing', 'Responsável', 'Origem', 'Criado',
               'Notas'] + [f['nome'] for f in campos]
        linhas = []
        for r in c.execute('SELECT * FROM clientes WHERE conta=?' + N.filtro_ambito(u) + ' ORDER BY nome COLLATE NOCASE', (u['conta'],)):
            ex = N.jl(r['extra'], {})
            linhas.append([r['nome'], r['tipo'], r['email'], r['telefone'], r['nif'], r['empresa'], r['morada'], r['localidade'],
                           r['codpostal'], iso_pt(r['nascimento']), ', '.join(N.jl(r['etiquetas'], [])), r['estado'], r['pontos'],
                           '%.2f' % (r['gasto'] / 100), 'sim' if r['consentimento'] else 'não', nomes.get(r['responsavel'], ''),
                           r['origem'], data_pt(r['criado']), r['notas']] + [ex.get(f['id'], '') for f in campos])
    elif tipo == 'leads':
        fases = {f['id']: f['nome'] for f in P.fases_conta(conta)}
        cab = ['Título', 'Contacto', 'Empresa', 'Telefone', 'E-mail', 'Valor (€)', 'Fase', 'Origem', 'Responsável', 'Próximo passo',
               'Quando', 'Criado', 'Notas']
        linhas = [[r['titulo'], r['contacto'], r['empresa'], r['telefone'], r['email'], '%.2f' % (r['valor'] / 100),
                   fases.get(r['fase'], r['fase']), r['origem'], nomes.get(r['responsavel'], ''), r['proximo'],
                   data_pt(r['proximo_quando']), data_pt(r['criado']), r['notas']]
                  for r in c.execute('SELECT * FROM leads WHERE conta=?' + N.filtro_ambito(u) + ' ORDER BY criado DESC', (u['conta'],))]
    elif tipo == 'chamadas':
        cab = ['Quando', 'Direção', 'Número', 'Nome', 'Resultado', 'Duração (s)', 'Quem', 'Seguimento', 'Notas']
        linhas = [[data_pt(r['quando']), 'Entrada' if r['direcao'] == 'entrada' else 'Saída', r['numero'], r['nome'],
                   RESULTADOS.get(r['resultado'], r['resultado']), r['duracao'], nomes.get(r['utilizador'], ''),
                   data_pt(r['seguimento']), r['notas']]
                  for r in c.execute('SELECT * FROM chamadas WHERE conta=?' + N.filtro_ambito(u, 'utilizador') +
                                     ' ORDER BY quando DESC LIMIT 50000', (u['conta'],))]
    else:
        cab = ['Título', 'Referência', 'Cliente', 'Valor (€)', 'Periodicidade', 'Início', 'Fim', 'Estado', 'Renovação automática',
               'Responsável', 'Notas']
        linhas = [[r['titulo'], r['referencia'], r['cnome'] or '', '%.2f' % (r['valor'] / 100), r['periodicidade'], iso_pt(r['inicio']),
                   iso_pt(r['fim']), r['estado'], 'sim' if r['renovacao'] else 'não', nomes.get(r['responsavel'], ''), r['notas']]
                  for r in c.execute('SELECT k.*, cl.nome cnome FROM contratos k LEFT JOIN clientes cl ON cl.id=k.cliente WHERE k.conta=?' +
                                     N.filtro_ambito(u, alias='k.') + ' ORDER BY k.inicio DESC', (u['conta'],))]
    N.auditar(h, c, u, 'exportar', tipo, '%d linhas' % len(linhas))
    return 'ficheiro', (csv_bytes(cab, linhas), 'text/csv; charset=utf-8', 'webase-%s-%s.csv' % (tipo, time.strftime('%Y-%m-%d')))


# ======================================================================== leads

def lead_json(r, nomes=None):
    o = {'id': r['id'], 'titulo': r['titulo'], 'cliente': r['cliente'], 'contacto': r['contacto'], 'telefone': r['telefone'],
         'email': r['email'], 'empresa': r['empresa'], 'valor': r['valor'], 'fase': r['fase'], 'origem': r['origem'],
         'responsavel': r['responsavel'], 'proximo': r['proximo'], 'proximo_quando': r['proximo_quando'], 'notas': r['notas'],
         'ordem': r['ordem'], 'criado': r['criado'], 'atualizado': r['atualizado'], 'fechado': r['fechado']}
    if nomes is not None:
        o['responsavel_nome'] = nomes.get(r['responsavel'], '')
    return o


def lead_acessivel(c, u, lid):
    r = c.execute('SELECT * FROM leads WHERE id=? AND conta=?' + N.filtro_ambito(u), (lid, u['conta'])).fetchone()
    precisa(r, 'Lead não encontrada.', 404)
    return r


def validar_lead(c, u, conta, d, atual=None):
    def tem(k):
        return atual is None or k in d
    f = {}
    if tem('titulo'):
        f['titulo'] = N.campo(d, 'titulo', 120, True, 'o título')
    if tem('cliente'):
        f['cliente'] = N.cliente_acessivel(c, u, d['cliente'])['id'] if d.get('cliente') else None
    for k, mx in (('contacto', 120), ('empresa', 120), ('origem', 60), ('proximo', 160)):
        if tem(k):
            f[k] = N.campo(d, k, mx)
    if tem('telefone'):
        f['telefone'] = N.telefone_ok(d.get('telefone'))
    if tem('email'):
        f['email'] = N.email_ok(d.get('email'))
    if tem('valor'):
        f['valor'] = N.euros_para_centimos(d.get('valor'))
    if tem('fase'):
        fases = {x['id']: x for x in P.fases_conta(conta)}
        fase = d.get('fase') or next(x['id'] for x in fases.values() if x['tipo'] == 'aberta')
        precisa(fase in fases, 'Fase inválida.', campo='fase')
        f['fase'] = fase
        f['fechado'] = B.agora() if fases[fase]['tipo'] != 'aberta' else None
    if tem('proximo_quando'):
        f['proximo_quando'] = N.momento_ok(d.get('proximo_quando'), nome='proximo_quando')
    if tem('notas'):
        f['notas'] = N.campo(d, 'notas', 4000, linhas=True)
    if atual is None or 'responsavel' in d:
        f['responsavel'] = N.responsavel_para(c, u, d)
    return f


@rota('GET', '/api/leads', modulo='leads')
def leads(h, c, u, m, d):
    conta = N.conta_de(c, u)
    fases = P.fases_conta(conta)
    abertas = [f['id'] for f in fases if f['tipo'] == 'aberta']
    desde = B.agora() - 90 * DIA
    where = 'conta=?' + N.filtro_ambito(u)
    args = [u['conta']]
    q = (h.q.get('q') or '')[:80].strip()
    if q:
        where += " AND (titulo LIKE ? ESCAPE '\\' OR contacto LIKE ? ESCAPE '\\' OR empresa LIKE ? ESCAPE '\\')"
        args += [N.like(q)] * 3
    if h.q.get('responsavel', '').isdigit():
        where += ' AND responsavel=?'
        args.append(int(h.q['responsavel']))
    rows = c.execute('SELECT * FROM leads WHERE %s AND (fase IN (%s) OR fechado>? OR fechado IS NULL) ORDER BY ordem, criado DESC LIMIT 2000'
                     % (where, ','.join('?' * len(abertas))), args + abertas + [desde]).fetchall()
    nomes = nomes_equipa(c, u)
    return 200, {'fases': fases, 'leads': [lead_json(r, nomes) for r in rows]}


@rota('POST', '/api/leads', modulo='leads', acao='c')
def lead_criar(h, c, u, m, d):
    conta = N.conta_de(c, u)
    f = validar_lead(c, u, conta, d)
    t = B.agora()
    lid = B.novo_id()
    menor = c.execute('SELECT MIN(ordem) FROM leads WHERE conta=? AND fase=?', (u['conta'], f['fase'])).fetchone()[0]
    f['ordem'] = (menor or 0) - 1
    cols = ['id', 'conta', 'criado', 'atualizado'] + list(f)
    c.execute('INSERT INTO leads(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))), [lid, u['conta'], t, t] + list(f.values()))
    if f.get('cliente'):
        N.atividade(c, u, f['cliente'], 'lead', 'Nova oportunidade: %s (%s)' % (f['titulo'], euros(f['valor'])))
    return 201, {'lead': lead_json(lead_acessivel(c, u, lid), nomes_equipa(c, u))}


@rota('POST', '/api/leads/' + RE_ID, modulo='leads', acao='e')
def lead_mudar(h, c, u, m, d):
    r = lead_acessivel(c, u, m.group(1))
    conta = N.conta_de(c, u)
    f = validar_lead(c, u, conta, d, atual=r)
    if 'fase' in f and f['fase'] == r['fase']:
        f['fechado'] = r['fechado']
    f['atualizado'] = B.agora()
    c.execute('UPDATE leads SET %s WHERE id=? AND conta=?' % ','.join('%s=?' % k for k in f), list(f.values()) + [r['id'], u['conta']])
    novo = lead_acessivel(c, u, r['id'])
    if 'fase' in f and f['fase'] != r['fase']:
        registar_fase(c, u, conta, novo)
    return 200, {'lead': lead_json(novo, nomes_equipa(c, u))}


def registar_fase(c, u, conta, lead):
    fase = next((x for x in P.fases_conta(conta) if x['id'] == lead['fase']), None)
    if fase and lead['cliente']:
        if fase['tipo'] == 'ganho':
            N.atividade(c, u, lead['cliente'], 'ganho', 'Negócio ganho: %s (%s)' % (lead['titulo'], euros(lead['valor'])))
        elif fase['tipo'] == 'perdido':
            N.atividade(c, u, lead['cliente'], 'perdido', 'Oportunidade perdida: %s' % lead['titulo'])
        else:
            N.atividade(c, u, lead['cliente'], 'lead', '«%s» passou para %s' % (lead['titulo'], fase['nome']))


@rota('POST', '/api/leads/' + RE_ID + '/fase', modulo='leads', acao='e')
def lead_fase(h, c, u, m, d):
    r = lead_acessivel(c, u, m.group(1))
    conta = N.conta_de(c, u)
    fases = {x['id']: x for x in P.fases_conta(conta)}
    fase = d.get('fase')
    precisa(fase in fases, 'Fase inválida.')
    ordem = d.get('ordem')
    if not isinstance(ordem, (int, float)) or isinstance(ordem, bool) or abs(ordem) > 1e12:
        ordem = (c.execute('SELECT MIN(ordem) FROM leads WHERE conta=? AND fase=?', (u['conta'], fase)).fetchone()[0] or 0) - 1
    fechado = r['fechado'] if fase == r['fase'] else (B.agora() if fases[fase]['tipo'] != 'aberta' else None)
    c.execute('UPDATE leads SET fase=?, ordem=?, fechado=?, atualizado=? WHERE id=? AND conta=?',
              (fase, float(ordem), fechado, B.agora(), r['id'], u['conta']))
    novo = lead_acessivel(c, u, r['id'])
    if fase != r['fase']:
        registar_fase(c, u, conta, novo)
    return 200, {'lead': lead_json(novo, nomes_equipa(c, u)), 'tipo': fases[fase]['tipo']}


@rota('POST', '/api/leads/' + RE_ID + '/cliente', modulo='leads', acao='e')
def lead_para_cliente(h, c, u, m, d):
    r = lead_acessivel(c, u, m.group(1))
    conta = N.conta_de(c, u)
    N.exige(u, conta, 'clientes', 'c')
    precisa(not r['cliente'], 'Esta lead já tem ficha de cliente.')
    nome = r['contacto'] or r['empresa'] or r['titulo']
    f = validar_cliente(c, u, conta, {'nome': nome, 'tipo': 'empresa' if r['empresa'] and not r['contacto'] else 'particular',
                                      'email': r['email'], 'telefone': r['telefone'], 'empresa': r['empresa'], 'origem': 'Lead'})
    dup, _ = duplicado(c, u, f)
    cid = dup['id'] if dup else inserir_cliente(c, u, conta, f, 'Ficha criada a partir da lead «%s»' % r['titulo'])
    c.execute('UPDATE leads SET cliente=?, atualizado=? WHERE id=?', (cid, B.agora(), r['id']))
    return 200, {'cliente': cid, 'existia': bool(dup)}


@rota('POST', '/api/leads/' + RE_ID + '/apagar', modulo='leads', acao='a')
def lead_apagar(h, c, u, m, d):
    r = lead_acessivel(c, u, m.group(1))
    c.execute('DELETE FROM leads WHERE id=? AND conta=?', (r['id'], u['conta']))
    N.auditar(h, c, u, 'lead.apagar', r['id'], r['titulo'])
    return 200, {'ok': True}


# ======================================================================== chamadas

def cham_json(r, nomes=None):
    o = {'id': r['id'], 'cliente': r['cliente'], 'lead': r['lead'], 'numero': r['numero'], 'nome': r['nome'],
         'direcao': r['direcao'], 'resultado': r['resultado'], 'duracao': r['duracao'], 'notas': r['notas'],
         'quando': r['quando'], 'seguimento': r['seguimento'], 'seguimento_feito': bool(r['seguimento_feito']),
         'utilizador': r['utilizador']}
    if nomes is not None:
        o['quem'] = nomes.get(r['utilizador'], '')
    return o


def cham_acessivel(c, u, cid):
    r = c.execute('SELECT * FROM chamadas WHERE id=? AND conta=?' + N.filtro_ambito(u, 'utilizador'), (cid, u['conta'])).fetchone()
    precisa(r, 'Chamada não encontrada.', 404)
    return r


def validar_chamada(c, u, d, atual=None):
    def tem(k):
        return atual is None or k in d
    f = {}
    if tem('direcao'):
        precisa(d.get('direcao') in ('entrada', 'saida'), 'Escolhe se a chamada foi recebida ou feita.', campo='direcao')
        f['direcao'] = d['direcao']
    if tem('resultado'):
        precisa(d.get('resultado') in RESULTADOS, 'Escolhe o resultado da chamada.', campo='resultado')
        f['resultado'] = d['resultado']
    if tem('numero'):
        f['numero'] = N.telefone_ok(d.get('numero'))
    if tem('nome'):
        f['nome'] = N.campo(d, 'nome', 120)
    if tem('cliente'):
        f['cliente'] = N.cliente_acessivel(c, u, d['cliente'])['id'] if d.get('cliente') else None
    if tem('lead'):
        f['lead'] = lead_acessivel(c, u, d['lead'])['id'] if d.get('lead') else None
    if tem('duracao'):
        f['duracao'] = N.inteiro(d.get('duracao') or 0, 0, 86400, 'duracao')
    if tem('notas'):
        f['notas'] = N.campo(d, 'notas', 4000, linhas=True)
    if tem('quando'):
        f['quando'] = N.momento_ok(d.get('quando'), nome='quando') or B.agora()
        precisa(f['quando'] <= B.agora() + 600, 'Uma chamada registada não pode ser no futuro. Para isso, usa o seguimento.', campo='quando')
    if tem('seguimento'):
        f['seguimento'] = N.momento_ok(d.get('seguimento'), nome='seguimento')
        f['seguimento_feito'] = 0
    if atual is None:
        precisa(f.get('numero') or f.get('cliente') or f.get('nome'), 'Indica o número, o nome ou o cliente.', campo='numero')
        if not f.get('cliente') and f.get('numero'):
            r = c.execute('SELECT id, nome FROM clientes WHERE conta=? AND telefone=?' + N.filtro_ambito(u),
                          (u['conta'], f['numero'])).fetchone()
            if r:
                f['cliente'] = r['id']
                f['nome'] = f.get('nome') or r['nome']
        if f.get('cliente') and not f.get('nome'):
            f['nome'] = c.execute('SELECT nome FROM clientes WHERE id=?', (f['cliente'],)).fetchone()['nome']
    return f


def texto_chamada(f):
    dur = f.get('duracao') or 0
    t = ('Chamada recebida' if f.get('direcao') == 'entrada' else 'Chamada feita') + ' · ' + RESULTADOS.get(f.get('resultado'), '')
    if dur:
        t += ' · %d min %02d s' % (dur // 60, dur % 60)
    if f.get('notas'):
        t += ' — ' + f['notas'][:200]
    return t


@rota('GET', '/api/chamadas', modulo='chamadas')
def chamadas(h, c, u, m, d):
    vista = h.q.get('vista', 'todas')
    where, args = 'conta=?' + N.filtro_ambito(u, 'utilizador'), [u['conta']]
    ordem = 'quando DESC'
    if vista in ('entrada', 'saida'):
        where += ' AND direcao=?'
        args.append(vista)
    elif vista == 'seguimentos':
        where += ' AND seguimento IS NOT NULL AND seguimento_feito=0'
        ordem = 'seguimento'
    q = (h.q.get('q') or '')[:80].strip()
    if q:
        where += " AND (nome LIKE ? ESCAPE '\\' OR numero LIKE ? ESCAPE '\\' OR notas LIKE ? ESCAPE '\\')"
        args += [N.like(q)] * 3
    pagina = N.inteiro(h.q.get('pagina', '1'), 1, 100000)
    total = c.execute('SELECT COUNT(*) FROM chamadas WHERE ' + where, args).fetchone()[0]
    rows = c.execute('SELECT * FROM chamadas WHERE %s ORDER BY %s LIMIT ? OFFSET ?' % (where, ordem),
                     args + [N.POR_PAGINA, (pagina - 1) * N.POR_PAGINA]).fetchall()
    hoje = N.inicio_do_dia()
    base = 'conta=?' + N.filtro_ambito(u, 'utilizador')
    st = c.execute("SELECT SUM(direcao='entrada'), SUM(direcao='saida'), SUM(resultado IN ('atendida','venda','ligar_depois','sem_interesse')), "
                   "COUNT(*), SUM(duracao) FROM chamadas WHERE %s AND quando>=?" % base, (u['conta'], hoje)).fetchone()
    seg = c.execute('SELECT COUNT(*) FROM chamadas WHERE %s AND seguimento IS NOT NULL AND seguimento_feito=0 AND seguimento<?' % base,
                    (u['conta'], hoje + DIA)).fetchone()[0]
    return 200, {'itens': [cham_json(r, nomes_equipa(c, u)) for r in rows], 'total': total, 'pagina': pagina,
                 'por_pagina': N.POR_PAGINA, 'resultados': RESULTADOS,
                 'hoje': {'entrada': st[0] or 0, 'saida': st[1] or 0, 'atendidas': st[2] or 0, 'total': st[3] or 0,
                          'duracao': st[4] or 0, 'seguimentos': seg}}


@rota('POST', '/api/chamadas', modulo='chamadas', acao='c')
def chamada_criar(h, c, u, m, d):
    precisa(h.limitar('cham', 1000, 3600), 'Demasiadas chamadas registadas de seguida. Espera um pouco.', 429)
    f = validar_chamada(c, u, d)
    f.setdefault('quando', B.agora())
    cid = B.novo_id()
    cols = ['id', 'conta', 'utilizador', 'criado'] + list(f)
    c.execute('INSERT INTO chamadas(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))),
              [cid, u['conta'], u['id'], B.agora()] + list(f.values()))
    if f.get('cliente'):
        N.atividade(c, u, f['cliente'], 'chamada', texto_chamada(f))
        c.execute('UPDATE clientes SET atualizado=? WHERE id=?', (B.agora(), f['cliente']))
    return 201, {'chamada': cham_json(cham_acessivel(c, u, cid), nomes_equipa(c, u))}


@rota('POST', '/api/chamadas/' + RE_ID, modulo='chamadas', acao='e')
def chamada_mudar(h, c, u, m, d):
    r = cham_acessivel(c, u, m.group(1))
    f = validar_chamada(c, u, d, atual=r)
    if f:
        c.execute('UPDATE chamadas SET %s WHERE id=? AND conta=?' % ','.join('%s=?' % k for k in f), list(f.values()) + [r['id'], u['conta']])
    return 200, {'chamada': cham_json(cham_acessivel(c, u, r['id']), nomes_equipa(c, u))}


@rota('POST', '/api/chamadas/' + RE_ID + '/feito', modulo='chamadas', acao='e')
def chamada_feito(h, c, u, m, d):
    r = cham_acessivel(c, u, m.group(1))
    c.execute('UPDATE chamadas SET seguimento_feito=1 WHERE id=? AND conta=?', (r['id'], u['conta']))
    return 200, {'ok': True}


@rota('POST', '/api/chamadas/' + RE_ID + '/apagar', modulo='chamadas', acao='a')
def chamada_apagar(h, c, u, m, d):
    r = cham_acessivel(c, u, m.group(1))
    c.execute('DELETE FROM chamadas WHERE id=? AND conta=?', (r['id'], u['conta']))
    N.auditar(h, c, u, 'chamada.apagar', r['id'])
    return 200, {'ok': True}


# ======================================================================== contratos

def contrato_json(r, nomes=None, cnome=None):
    hoje = date.today().isoformat()
    em30 = (date.today() + timedelta(days=30)).isoformat()
    o = {'id': r['id'], 'cliente': r['cliente'], 'titulo': r['titulo'], 'referencia': r['referencia'], 'valor': r['valor'],
         'periodicidade': r['periodicidade'], 'inicio': r['inicio'], 'fim': r['fim'], 'estado': r['estado'],
         'renovacao': bool(r['renovacao']), 'notas': r['notas'], 'responsavel': r['responsavel'],
         'a_terminar': r['estado'] == 'ativo' and bool(r['fim']) and hoje <= r['fim'] <= em30, 'criado': r['criado']}
    if nomes is not None:
        o['responsavel_nome'] = nomes.get(r['responsavel'], '')
    if cnome is not None:
        o['cliente_nome'] = cnome
    return o


def contrato_acessivel(c, u, kid):
    r = c.execute('SELECT * FROM contratos WHERE id=? AND conta=?' + N.filtro_ambito(u), (kid, u['conta'])).fetchone()
    precisa(r, 'Contrato não encontrado.', 404)
    return r


def validar_contrato(c, u, d, atual=None):
    def tem(k):
        return atual is None or k in d
    f = {}
    if tem('cliente'):
        precisa(d.get('cliente'), 'Escolhe o cliente do contrato.', campo='cliente')
        f['cliente'] = N.cliente_acessivel(c, u, d['cliente'])['id']
    if tem('titulo'):
        f['titulo'] = N.campo(d, 'titulo', 120, True, 'o título')
    if tem('referencia'):
        f['referencia'] = N.campo(d, 'referencia', 40)
    if tem('valor'):
        f['valor'] = N.euros_para_centimos(d.get('valor'))
    if tem('periodicidade'):
        precisa(d.get('periodicidade') in ('unico', 'mensal', 'trimestral', 'semestral', 'anual'), 'Escolhe a periodicidade.',
                campo='periodicidade')
        f['periodicidade'] = d['periodicidade']
    if tem('inicio'):
        f['inicio'] = N.data_ok(d.get('inicio'), True, 'inicio')
    if tem('fim'):
        f['fim'] = N.data_ok(d.get('fim'), nome='fim')
    inicio = f.get('inicio', atual['inicio'] if atual else '')
    fim = f.get('fim', atual['fim'] if atual else '')
    precisa(not fim or fim >= inicio, 'O fim tem de ser depois do início.', campo='fim')
    if tem('estado'):
        precisa(d.get('estado', 'ativo') in ('rascunho', 'ativo', 'terminado', 'cancelado'), 'Estado inválido.', campo='estado')
        f['estado'] = d.get('estado', 'ativo')
    if tem('renovacao'):
        f['renovacao'] = 1 if d.get('renovacao') is True else 0
    if tem('notas'):
        f['notas'] = N.campo(d, 'notas', 4000, linhas=True)
    if atual is None or 'responsavel' in d:
        f['responsavel'] = N.responsavel_para(c, u, d)
    return f


def mrr(rows):
    tot = 0
    for r in rows:
        if r['estado'] == 'ativo' and r['periodicidade'] in PERIODOS:
            tot += r['valor'] / PERIODOS[r['periodicidade']]
    return int(round(tot))


@rota('GET', '/api/contratos', modulo='contratos')
def contratos(h, c, u, m, d):
    where, args = 'k.conta=?' + N.filtro_ambito(u, alias='k.'), [u['conta']]
    est = h.q.get('estado')
    if est in ('rascunho', 'ativo', 'terminado', 'cancelado'):
        where += ' AND k.estado=?'
        args.append(est)
    elif est == 'a_terminar':
        where += " AND k.estado='ativo' AND k.fim<>'' AND k.fim BETWEEN ? AND ?"
        args += [date.today().isoformat(), (date.today() + timedelta(days=30)).isoformat()]
    q = (h.q.get('q') or '')[:80].strip()
    if q:
        where += " AND (k.titulo LIKE ? ESCAPE '\\' OR k.referencia LIKE ? ESCAPE '\\' OR cl.nome LIKE ? ESCAPE '\\')"
        args += [N.like(q)] * 3
    rows = c.execute('SELECT k.*, cl.nome cnome FROM contratos k LEFT JOIN clientes cl ON cl.id=k.cliente WHERE %s '
                     'ORDER BY CASE k.estado WHEN \'ativo\' THEN 0 WHEN \'rascunho\' THEN 1 ELSE 2 END, k.fim=\'\', k.fim, k.inicio DESC LIMIT 1000'
                     % where, args).fetchall()
    todos = c.execute('SELECT valor, periodicidade, estado, fim FROM contratos k WHERE k.conta=?' + N.filtro_ambito(u, alias='k.'),
                      (u['conta'],)).fetchall()
    nomes = nomes_equipa(c, u)
    em30 = (date.today() + timedelta(days=30)).isoformat()
    return 200, {'itens': [contrato_json(r, nomes, r['cnome'] or '') for r in rows],
                 'resumo': {'ativos': sum(1 for r in todos if r['estado'] == 'ativo'), 'mensal': mrr(todos),
                            'a_terminar': sum(1 for r in todos if r['estado'] == 'ativo' and r['fim'] and
                                              date.today().isoformat() <= r['fim'] <= em30)}}


@rota('POST', '/api/contratos', modulo='contratos', acao='c')
def contrato_criar(h, c, u, m, d):
    f = validar_contrato(c, u, d)
    kid = B.novo_id()
    t = B.agora()
    cols = ['id', 'conta', 'criado', 'atualizado'] + list(f)
    c.execute('INSERT INTO contratos(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))), [kid, u['conta'], t, t] + list(f.values()))
    N.atividade(c, u, f['cliente'], 'contrato', 'Contrato «%s» (%s, %s)' % (f['titulo'], euros(f['valor']), f['periodicidade']))
    return 201, {'contrato': contrato_json(contrato_acessivel(c, u, kid), nomes_equipa(c, u))}


@rota('POST', '/api/contratos/' + RE_ID, modulo='contratos', acao='e')
def contrato_mudar(h, c, u, m, d):
    r = contrato_acessivel(c, u, m.group(1))
    f = validar_contrato(c, u, d, atual=r)
    f['atualizado'] = B.agora()
    c.execute('UPDATE contratos SET %s WHERE id=? AND conta=?' % ','.join('%s=?' % k for k in f), list(f.values()) + [r['id'], u['conta']])
    novo = contrato_acessivel(c, u, r['id'])
    if novo['estado'] != r['estado'] and novo['cliente']:
        N.atividade(c, u, novo['cliente'], 'contrato', 'Contrato «%s» passou a %s' % (novo['titulo'], novo['estado']))
    return 200, {'contrato': contrato_json(novo, nomes_equipa(c, u))}


@rota('POST', '/api/contratos/' + RE_ID + '/apagar', modulo='contratos', acao='a')
def contrato_apagar(h, c, u, m, d):
    r = contrato_acessivel(c, u, m.group(1))
    c.execute('DELETE FROM contratos WHERE id=? AND conta=?', (r['id'], u['conta']))
    N.auditar(h, c, u, 'contrato.apagar', r['id'], r['titulo'])
    return 200, {'ok': True}


# ======================================================================== pontos e recompensas

def dar_pontos(c, u, cid, delta, motivo, valor, descricao):
    c.execute('INSERT INTO pontos(conta, cliente, delta, motivo, valor, descricao, uid, criado) VALUES(?,?,?,?,?,?,?,?)',
              (u['conta'], cid, delta, motivo, valor, descricao[:200], u['id'], B.agora()))
    c.execute('UPDATE clientes SET pontos=MAX(0, pontos+?), atualizado=? WHERE id=? AND conta=?', (delta, B.agora(), cid, u['conta']))


@rota('GET', '/api/pontos', modulo='pontos')
def pontos(h, c, u, m, d):
    conta = N.conta_de(c, u)
    desde = B.agora() - 30 * DIA
    amb = N.filtro_ambito(u, alias='cl.')
    st = c.execute('SELECT SUM(CASE WHEN p.delta>0 THEN p.delta ELSE 0 END), SUM(CASE WHEN p.delta<0 THEN -p.delta ELSE 0 END), '
                   'COUNT(DISTINCT p.cliente) FROM pontos p JOIN clientes cl ON cl.id=p.cliente WHERE p.conta=? AND p.criado>?' + amb,
                   (u['conta'], desde)).fetchone()
    nomes = nomes_equipa(c, u)
    mov = [{'cliente': r['cliente'], 'cliente_nome': r['cnome'], 'delta': r['delta'], 'motivo': r['motivo'], 'valor': r['valor'],
            'descricao': r['descricao'], 'quem': nomes.get(r['uid'], ''), 'quando': r['criado']}
           for r in c.execute('SELECT p.*, cl.nome cnome FROM pontos p JOIN clientes cl ON cl.id=p.cliente WHERE p.conta=?' + amb +
                              ' ORDER BY p.id DESC LIMIT 40', (u['conta'],))]
    top = [{'id': r['id'], 'nome': r['nome'], 'pontos': r['pontos'], 'gasto': r['gasto']}
           for r in c.execute('SELECT id, nome, pontos, gasto FROM clientes cl WHERE conta=? AND pontos>0' + amb +
                              ' ORDER BY pontos DESC LIMIT 10', (u['conta'],))]
    rec = [{'id': r['id'], 'nome': r['nome'], 'custo': r['custo'], 'ativa': bool(r['ativa'])}
           for r in c.execute('SELECT * FROM recompensas WHERE conta=? ORDER BY ativa DESC, custo', (u['conta'],))]
    return 200, {'pontos_euro': conta['pontos_euro'], 'pontos_boas_vindas': conta['pontos_boas_vindas'],
                 'resumo': {'dados': st[0] or 0, 'trocados': st[1] or 0, 'clientes': st[2] or 0},
                 'movimentos': mov, 'top': top, 'recompensas': rec}


@rota('POST', '/api/pontos/movimento', modulo='pontos', acao='c')
def pontos_movimento(h, c, u, m, d):
    conta = N.conta_de(c, u)
    precisa(d.get('cliente'), 'Escolhe o cliente.', campo='cliente')
    cli = N.cliente_acessivel(c, u, d.get('cliente'))
    tipo = d.get('tipo')
    precisa(tipo in ('compra', 'resgate', 'ajuste'), 'Escolhe o que queres fazer.')
    descricao = N.campo(d, 'descricao', 160)
    c.execute('BEGIN IMMEDIATE')
    try:
        saldo = c.execute('SELECT pontos FROM clientes WHERE id=?', (cli['id'],)).fetchone()[0]
        if tipo == 'compra':
            valor = N.euros_para_centimos(d.get('valor'), maximo=100000)
            precisa(valor > 0, 'Escreve o valor da compra.', campo='valor')
            delta = int(valor / 100 * conta['pontos_euro'])
            dar_pontos(c, u, cli['id'], delta, 'compra', valor, descricao or 'Compra de %s' % euros(valor))
            c.execute('UPDATE clientes SET gasto=gasto+?, ultima_visita=? WHERE id=?', (valor, B.agora(), cli['id']))
            texto = 'Compra de %s · +%d pontos' % (euros(valor), delta)
        elif tipo == 'resgate':
            r = c.execute('SELECT * FROM recompensas WHERE id=? AND conta=? AND ativa=1', (d.get('recompensa'), u['conta'])).fetchone()
            precisa(r, 'Escolhe uma recompensa.', campo='recompensa')
            precisa(saldo >= r['custo'], 'Faltam %d pontos para esta recompensa.' % (r['custo'] - saldo))
            delta = -r['custo']
            dar_pontos(c, u, cli['id'], delta, 'resgate', 0, 'Trocou por: ' + r['nome'])
            texto = 'Trocou %d pontos por «%s»' % (r['custo'], r['nome'])
        else:
            precisa(P.pode(u, conta, 'pontos', 'e'), 'Não tens permissão para acertar pontos à mão.', 403)
            delta = N.inteiro(d.get('pontos'), -1000000, 1000000, 'pontos')
            precisa(delta != 0, 'Escreve quantos pontos queres dar ou tirar.', campo='pontos')
            precisa(saldo + delta >= 0, 'O cliente só tem %d pontos.' % saldo, campo='pontos')
            precisa(descricao, 'Diz porque estás a acertar os pontos.', campo='descricao')
            dar_pontos(c, u, cli['id'], delta, 'ajuste', 0, descricao)
            texto = 'Acerto de pontos: %+d (%s)' % (delta, descricao)
        N.atividade(c, u, cli['id'], 'pontos', texto)
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    novo = c.execute('SELECT pontos FROM clientes WHERE id=?', (cli['id'],)).fetchone()[0]
    return 200, {'pontos': novo, 'delta': delta}


@rota('POST', '/api/recompensas', modulo='pontos', acao='e')
def recompensa_criar(h, c, u, m, d):
    nome = N.campo(d, 'nome', 80, True, 'o nome da recompensa')
    custo = N.inteiro(d.get('custo'), 1, 1000000, 'custo')
    n = c.execute('SELECT COUNT(*) FROM recompensas WHERE conta=?', (u['conta'],)).fetchone()[0]
    precisa(n < 50, 'No máximo 50 recompensas.')
    rid = B.novo_id()
    c.execute('INSERT INTO recompensas(id, conta, nome, custo, criado) VALUES(?,?,?,?,?)', (rid, u['conta'], nome, custo, B.agora()))
    return 201, {'id': rid}


@rota('POST', '/api/recompensas/' + RE_ID, modulo='pontos', acao='e')
def recompensa_mudar(h, c, u, m, d):
    r = c.execute('SELECT * FROM recompensas WHERE id=? AND conta=?', (m.group(1), u['conta'])).fetchone()
    precisa(r, 'Recompensa não encontrada.', 404)
    nome = N.campo(d, 'nome', 80, True, 'o nome') if 'nome' in d else r['nome']
    custo = N.inteiro(d.get('custo'), 1, 1000000, 'custo') if 'custo' in d else r['custo']
    ativa = (1 if d['ativa'] else 0) if isinstance(d.get('ativa'), bool) else r['ativa']
    c.execute('UPDATE recompensas SET nome=?, custo=?, ativa=? WHERE id=?', (nome, custo, ativa, r['id']))
    return 200, {'ok': True}


# ======================================================================== subscrições e pacotes

def adesao_json(c, r):
    agora = B.agora()
    estado = r['estado']
    if estado == 'ativa':
        if r['ptipo'] == 'subscricao' and r['proxima'] and r['proxima'] < agora:
            estado = 'em_atraso'
        elif r['ptipo'] == 'pacote' and r['usos'] <= 0:
            estado = 'esgotado'
        elif r['ptipo'] == 'pacote' and r['fim'] and r['fim'] < agora:
            estado = 'expirada'
    o = {'id': r['id'], 'cliente': r['cliente'], 'produto': r['produto'], 'produto_nome': r['pnome'], 'tipo': r['ptipo'],
         'preco': r['ppreco'], 'periodo': r['pperiodo'], 'usos_total': r['pusos'], 'inicio': r['inicio'], 'proxima': r['proxima'],
         'fim': r['fim'], 'usos': r['usos'], 'estado': estado, 'criado': r['criado']}
    if 'cnome' in r.keys():
        o['cliente_nome'] = r['cnome']
    return o


SQL_ADESAO = ('SELECT a.*, p.nome pnome, p.tipo ptipo, p.preco ppreco, p.periodo pperiodo, p.usos pusos, cl.nome cnome '
              'FROM adesoes a JOIN produtos p ON p.id=a.produto JOIN clientes cl ON cl.id=a.cliente ')


def adesao_acessivel(c, u, aid):
    r = c.execute(SQL_ADESAO + 'WHERE a.id=? AND a.conta=?' + N.filtro_ambito(u, alias='cl.'), (aid, u['conta'])).fetchone()
    precisa(r, 'Subscrição ou pacote não encontrado.', 404)
    return r


def produto_json(r):
    return {'id': r['id'], 'nome': r['nome'], 'tipo': r['tipo'], 'preco': r['preco'], 'periodo': r['periodo'], 'usos': r['usos'],
            'validade': r['validade'], 'ativo': bool(r['ativo'])}


@rota('GET', '/api/adesoes', modulo='adesoes')
def adesoes(h, c, u, m, d):
    where, args = 'a.conta=?' + N.filtro_ambito(u, alias='cl.'), [u['conta']]
    q = (h.q.get('q') or '')[:80].strip()
    if q:
        where += " AND (cl.busca LIKE ? ESCAPE '\\' OR p.nome LIKE ? ESCAPE '\\')"
        args += [N.like(N.normalizar(q)), N.like(q)]
    rows = c.execute(SQL_ADESAO + 'WHERE ' + where + ' ORDER BY a.estado<>\'ativa\', a.criado DESC LIMIT 1000', args).fetchall()
    itens = [adesao_json(c, r) for r in rows]
    agora = B.agora()
    resumo = {'ativas': sum(1 for x in itens if x['estado'] == 'ativa'),
              'em_atraso': sum(1 for x in itens if x['estado'] == 'em_atraso'),
              'a_renovar': sum(1 for x in itens if x['estado'] == 'ativa' and x['tipo'] == 'subscricao' and x['proxima']
                               and x['proxima'] < agora + 7 * DIA),
              'mensal': int(sum(x['preco'] / PERIODOS.get(x['periodo'], 1) for x in itens
                                if x['tipo'] == 'subscricao' and x['estado'] in ('ativa', 'em_atraso')))}
    filtro = h.q.get('estado')
    if filtro:
        itens = [x for x in itens if x['estado'] == filtro]
    prods = [produto_json(r) for r in c.execute('SELECT * FROM produtos WHERE conta=? ORDER BY ativo DESC, nome', (u['conta'],))]
    return 200, {'produtos': prods, 'itens': itens, 'resumo': resumo}


def validar_produto(d, atual=None):
    f = {}
    f['nome'] = N.campo(d, 'nome', 80, True, 'o nome') if (atual is None or 'nome' in d) else atual['nome']
    tipo = d.get('tipo', atual['tipo'] if atual else None)
    precisa(tipo in ('subscricao', 'pacote'), 'Escolhe se é uma subscrição (mensalidade) ou um pacote (ex.: 10 cortes).', campo='tipo')
    if atual is None:
        f['tipo'] = tipo
    f['preco'] = N.euros_para_centimos(d.get('preco'), 'preco', 100000) if (atual is None or 'preco' in d) else atual['preco']
    if tipo == 'subscricao':
        per = d.get('periodo', atual['periodo'] if atual else 'mensal')
        precisa(per in PERIODOS, 'Escolhe a periodicidade.', campo='periodo')
        f['periodo'] = per
    else:
        f['usos'] = N.inteiro(d.get('usos', atual['usos'] if atual else None), 1, 1000, 'usos')
        f['validade'] = N.inteiro(d.get('validade', atual['validade'] if atual else 0) or 0, 0, 3650, 'validade')
    if isinstance(d.get('ativo'), bool):
        f['ativo'] = 1 if d['ativo'] else 0
    return f


@rota('POST', '/api/produtos', modulo='adesoes', acao='e')
def produto_criar(h, c, u, m, d):
    n = c.execute('SELECT COUNT(*) FROM produtos WHERE conta=?', (u['conta'],)).fetchone()[0]
    precisa(n < 100, 'No máximo 100 planos e pacotes.')
    f = validar_produto(d)
    pid = B.novo_id()
    cols = ['id', 'conta', 'criado'] + list(f)
    c.execute('INSERT INTO produtos(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))), [pid, u['conta'], B.agora()] + list(f.values()))
    return 201, {'produto': produto_json(c.execute('SELECT * FROM produtos WHERE id=?', (pid,)).fetchone())}


@rota('POST', '/api/produtos/' + RE_ID, modulo='adesoes', acao='e')
def produto_mudar(h, c, u, m, d):
    r = c.execute('SELECT * FROM produtos WHERE id=? AND conta=?', (m.group(1), u['conta'])).fetchone()
    precisa(r, 'Plano ou pacote não encontrado.', 404)
    f = validar_produto(d, atual=r)
    c.execute('UPDATE produtos SET %s WHERE id=?' % ','.join('%s=?' % k for k in f), list(f.values()) + [r['id']])
    return 200, {'produto': produto_json(c.execute('SELECT * FROM produtos WHERE id=?', (r['id'],)).fetchone())}


@rota('POST', '/api/adesoes', modulo='adesoes', acao='c')
def adesao_criar(h, c, u, m, d):
    precisa(d.get('cliente'), 'Escolhe o cliente.', campo='cliente')
    cli = N.cliente_acessivel(c, u, d.get('cliente'))
    p = c.execute('SELECT * FROM produtos WHERE id=? AND conta=? AND ativo=1', (d.get('produto'), u['conta'])).fetchone()
    precisa(p, 'Escolhe o plano ou o pacote.', campo='produto')
    ini = N.data_ok(d.get('inicio'), nome='inicio')
    if ini:
        dt = datetime.strptime(ini, '%Y-%m-%d')
        inicio = int(dt.replace(tzinfo=N.LISBOA).timestamp()) if N.LISBOA else int(time.mktime(dt.timetuple()))
    else:
        inicio = B.agora()
    aid = B.novo_id()
    proxima = fim = None
    usos = 0
    if p['tipo'] == 'subscricao':
        proxima = ts_soma_meses(inicio, PERIODOS[p['periodo']])
    else:
        usos = p['usos']
        fim = inicio + p['validade'] * DIA if p['validade'] else None
    c.execute('INSERT INTO adesoes(id, conta, cliente, produto, inicio, proxima, fim, usos, criado) VALUES(?,?,?,?,?,?,?,?,?)',
              (aid, u['conta'], cli['id'], p['id'], inicio, proxima, fim, usos, B.agora()))
    c.execute("INSERT INTO adesao_usos(adesao, tipo, nota, uid, criado) VALUES(?, 'inicio', ?, ?, ?)",
              (aid, 'Pago %s' % euros(p['preco']), u['id'], B.agora()))
    N.atividade(c, u, cli['id'], 'adesao', '%s: %s (%s)' % ('Nova subscrição' if p['tipo'] == 'subscricao' else 'Novo pacote',
                                                             p['nome'], euros(p['preco'])))
    conta = N.conta_de(c, u)
    if d.get('pontos') is not False and 'pontos' in P.modulos_conta(conta) and conta['pontos_euro'] > 0 and p['preco'] > 0 \
            and P.pode(u, conta, 'pontos', 'c'):
        dar_pontos(c, u, cli['id'], int(p['preco'] / 100 * conta['pontos_euro']), 'compra', p['preco'], p['nome'])
    c.execute('UPDATE clientes SET gasto=gasto+?, ultima_visita=? WHERE id=?', (p['preco'], B.agora(), cli['id']))
    return 201, {'adesao': adesao_json(c, adesao_acessivel(c, u, aid))}


@rota('POST', '/api/adesoes/' + RE_ID + '/usar', modulo='adesoes', acao='c')
def adesao_usar(h, c, u, m, d):
    r = adesao_acessivel(c, u, m.group(1))
    a = adesao_json(c, r)
    precisa(a['estado'] in ('ativa', 'em_atraso'), 'Este %s já não está ativo (%s).' % (
        'pacote' if a['tipo'] == 'pacote' else 'plano', a['estado'].replace('_', ' ')))
    nota = N.campo(d, 'nota', 160)
    if a['tipo'] == 'pacote':
        c.execute('UPDATE adesoes SET usos=usos-1 WHERE id=? AND usos>0', (r['id'],))
    c.execute("INSERT INTO adesao_usos(adesao, tipo, nota, uid, criado) VALUES(?, 'uso', ?, ?, ?)", (r['id'], nota, u['id'], B.agora()))
    c.execute('UPDATE clientes SET ultima_visita=?, atualizado=? WHERE id=?', (B.agora(), B.agora(), r['cliente']))
    if a['tipo'] == 'pacote':
        texto = 'Usou o pacote «%s» (faltam %d de %d)' % (r['pnome'], a['usos'] - 1, r['pusos'])
    else:
        texto = 'Visita com o plano «%s»' % r['pnome']
    N.atividade(c, u, r['cliente'], 'uso', texto + (' — ' + nota if nota else ''))
    return 200, {'adesao': adesao_json(c, adesao_acessivel(c, u, r['id']))}


@rota('POST', '/api/adesoes/' + RE_ID + '/pagamento', modulo='adesoes', acao='e')
def adesao_pagamento(h, c, u, m, d):
    r = adesao_acessivel(c, u, m.group(1))
    precisa(r['estado'] != 'cancelada', 'Esta adesão foi cancelada. Cria uma nova.')
    if r['ptipo'] == 'subscricao':
        base = max(r['proxima'] or B.agora(), r['inicio'])
        if base < B.agora() - 62 * DIA:             # muito atrasada: recomeça a contar de hoje
            base = B.agora()
        nova = ts_soma_meses(base, PERIODOS[r['pperiodo']])
        c.execute("UPDATE adesoes SET proxima=?, estado='ativa' WHERE id=?", (nova, r['id']))
    else:
        p = c.execute('SELECT * FROM produtos WHERE id=?', (r['produto'],)).fetchone()
        fim = B.agora() + p['validade'] * DIA if p['validade'] else None
        c.execute("UPDATE adesoes SET usos=usos+?, fim=?, estado='ativa' WHERE id=?", (p['usos'], fim, r['id']))
    c.execute("INSERT INTO adesao_usos(adesao, tipo, nota, uid, criado) VALUES(?, 'pagamento', ?, ?, ?)",
              (r['id'], 'Pago %s' % euros(r['ppreco']), u['id'], B.agora()))
    c.execute('UPDATE clientes SET gasto=gasto+?, ultima_visita=? WHERE id=?', (r['ppreco'], B.agora(), r['cliente']))
    conta = N.conta_de(c, u)
    if d.get('pontos') is not False and 'pontos' in P.modulos_conta(conta) and conta['pontos_euro'] > 0 and r['ppreco'] > 0 \
            and P.pode(u, conta, 'pontos', 'c'):
        dar_pontos(c, u, r['cliente'], int(r['ppreco'] / 100 * conta['pontos_euro']), 'compra', r['ppreco'], r['pnome'])
    N.atividade(c, u, r['cliente'], 'adesao', 'Pagamento de %s: %s' % (r['pnome'], euros(r['ppreco'])))
    return 200, {'adesao': adesao_json(c, adesao_acessivel(c, u, r['id']))}


@rota('POST', '/api/adesoes/' + RE_ID + '/cancelar', modulo='adesoes', acao='e')
def adesao_cancelar(h, c, u, m, d):
    r = adesao_acessivel(c, u, m.group(1))
    c.execute("UPDATE adesoes SET estado='cancelada' WHERE id=?", (r['id'],))
    N.atividade(c, u, r['cliente'], 'adesao', 'Cancelou %s' % r['pnome'])
    return 200, {'adesao': adesao_json(c, adesao_acessivel(c, u, r['id']))}


# ======================================================================== painel

@rota('GET', '/api/painel')
def painel(h, c, u, m, d):
    conta = N.conta_de(c, u)
    agora = B.agora()
    hoje = N.inicio_do_dia()
    amanha = hoje + DIA
    dt = N.hoje_lisboa()
    mes = int(dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    out = {'modulos': P.modulos_conta(conta), 'hoje': [], 'nome': u['nome'].split()[0] if u['nome'] else ''}
    nomes = nomes_equipa(c, u)
    if P.pode(u, conta, 'clientes'):
        amb = N.filtro_ambito(u)
        out['clientes'] = {
            'total': c.execute('SELECT COUNT(*) FROM clientes WHERE conta=?' + amb, (u['conta'],)).fetchone()[0],
            'novos_mes': c.execute('SELECT COUNT(*) FROM clientes WHERE conta=? AND criado>=?' + amb, (u['conta'], mes)).fetchone()[0],
            'semanas': [c.execute('SELECT COUNT(*) FROM clientes WHERE conta=? AND criado>=? AND criado<?' + amb,
                                  (u['conta'], hoje - (i + 1) * 7 * DIA + DIA, hoje - i * 7 * DIA + DIA)).fetchone()[0]
                        for i in range(11, -1, -1)]}
        md = dt.strftime('%m-%d')
        bissexto = dt.year % 4 == 0 and (dt.year % 100 != 0 or dt.year % 400 == 0)
        md2 = '02-29' if md == '02-28' and not bissexto else md
        for r in c.execute("SELECT id, nome, nascimento FROM clientes WHERE conta=? AND nascimento<>'' AND substr(nascimento,6,5) IN (?,?)" + amb +
                           ' LIMIT 20', (u['conta'], md, md2)):
            out['hoje'].append({'tipo': 'aniversario', 'texto': 'Faz anos hoje: %s' % r['nome'], 'cliente': r['id']})
        out['recentes'] = [{'tipo': a['tipo'], 'texto': a['texto'], 'cliente': a['cliente'], 'cliente_nome': a['cnome'],
                            'quem': nomes.get(a['uid'], ''), 'quando': a['criado']}
                           for a in c.execute('SELECT a.*, cl.nome cnome FROM atividade a JOIN clientes cl ON cl.id=a.cliente '
                                              'WHERE a.conta=?' + N.filtro_ambito(u, alias='cl.') + ' ORDER BY a.id DESC LIMIT 8',
                                              (u['conta'],))]
    if P.pode(u, conta, 'leads'):
        fases = P.fases_conta(conta)
        abertas = [f['id'] for f in fases if f['tipo'] == 'aberta']
        ganhos = [f['id'] for f in fases if f['tipo'] == 'ganho']
        amb = N.filtro_ambito(u)
        ab = c.execute('SELECT COUNT(*), SUM(valor) FROM leads WHERE conta=? AND fase IN (%s)' % ','.join('?' * len(abertas)) + amb,
                       [u['conta']] + abertas).fetchone()
        gm = c.execute('SELECT COUNT(*), SUM(valor) FROM leads WHERE conta=? AND fase IN (%s) AND fechado>=?' % ','.join('?' * len(ganhos)) + amb,
                       [u['conta']] + ganhos + [mes]).fetchone()
        out['leads'] = {'abertas': ab[0] or 0, 'valor': ab[1] or 0, 'ganhos_mes': gm[0] or 0, 'ganho_valor': gm[1] or 0,
                        'por_fase': [{'id': f['id'], 'nome': f['nome'], 'tipo': f['tipo'],
                                      'n': c.execute('SELECT COUNT(*) FROM leads WHERE conta=? AND fase=?' + amb, (u['conta'], f['id'])).fetchone()[0]}
                                     for f in fases if f['tipo'] == 'aberta']}
        for r in c.execute('SELECT * FROM leads WHERE conta=? AND proximo_quando IS NOT NULL AND proximo_quando<? AND fase IN (%s)'
                           % ','.join('?' * len(abertas)) + amb + ' ORDER BY proximo_quando LIMIT 15', [u['conta'], amanha] + abertas):
            out['hoje'].append({'tipo': 'lead', 'texto': '%s: %s' % (r['titulo'], r['proximo'] or 'próximo passo'),
                                'quando': r['proximo_quando'], 'atrasado': r['proximo_quando'] < hoje, 'lead': r['id']})
    if P.pode(u, conta, 'chamadas'):
        amb = N.filtro_ambito(u, 'utilizador')
        st = c.execute("SELECT SUM(direcao='entrada'), SUM(direcao='saida') FROM chamadas WHERE conta=? AND quando>=?" + amb,
                       (u['conta'], hoje)).fetchone()
        out['chamadas'] = {'entrada': st[0] or 0, 'saida': st[1] or 0}
        for r in c.execute('SELECT * FROM chamadas WHERE conta=? AND seguimento IS NOT NULL AND seguimento_feito=0 AND seguimento<?' + amb +
                           ' ORDER BY seguimento LIMIT 15', (u['conta'], amanha)):
            out['hoje'].append({'tipo': 'seguimento', 'texto': 'Ligar a %s' % (r['nome'] or r['numero']), 'quando': r['seguimento'],
                                'atrasado': r['seguimento'] < hoje, 'chamada': r['id'], 'numero': r['numero'], 'cliente': r['cliente']})
    if P.pode(u, conta, 'contratos'):
        rows = c.execute('SELECT k.*, cl.nome cnome FROM contratos k LEFT JOIN clientes cl ON cl.id=k.cliente WHERE k.conta=?' +
                         N.filtro_ambito(u, alias='k.'), (u['conta'],)).fetchall()
        em30 = (date.today() + timedelta(days=30)).isoformat()
        hj = date.today().isoformat()
        terminar = [r for r in rows if r['estado'] == 'ativo' and r['fim'] and hj <= r['fim'] <= em30]
        out['contratos'] = {'ativos': sum(1 for r in rows if r['estado'] == 'ativo'), 'mensal': mrr(rows), 'a_terminar': len(terminar)}
        for r in sorted(terminar, key=lambda x: x['fim'])[:10]:
            out['hoje'].append({'tipo': 'contrato', 'texto': 'Contrato a terminar: %s (%s)' % (r['titulo'], r['cnome'] or ''),
                                'data': r['fim'], 'cliente': r['cliente']})
    if P.pode(u, conta, 'adesoes'):
        rows = c.execute(SQL_ADESAO + "WHERE a.conta=? AND a.estado='ativa'" + N.filtro_ambito(u, alias='cl.'), (u['conta'],)).fetchall()
        itens = [adesao_json(c, r) for r in rows]
        out['adesoes'] = {'ativas': sum(1 for x in itens if x['estado'] == 'ativa'),
                          'em_atraso': sum(1 for x in itens if x['estado'] == 'em_atraso'),
                          'mensal': int(sum(x['preco'] / PERIODOS.get(x['periodo'], 1) for x in itens
                                            if x['tipo'] == 'subscricao' and x['estado'] in ('ativa', 'em_atraso')))}
        for x in sorted(itens, key=lambda x: x['proxima'] or 0):
            if x['tipo'] == 'subscricao' and x['proxima'] and x['proxima'] < amanha:
                out['hoje'].append({'tipo': 'renovacao', 'texto': '%s: %s %s' % (x['cliente_nome'], x['produto_nome'],
                                                                                   'em atraso' if x['estado'] == 'em_atraso' else 'renova hoje'),
                                    'quando': x['proxima'], 'atrasado': x['estado'] == 'em_atraso', 'cliente': x['cliente']})
    if P.pode(u, conta, 'pontos'):
        st = c.execute('SELECT SUM(CASE WHEN p.delta>0 THEN p.delta ELSE 0 END), SUM(CASE WHEN p.delta<0 THEN -p.delta ELSE 0 END) '
                       'FROM pontos p JOIN clientes cl ON cl.id=p.cliente WHERE p.conta=? AND p.criado>?' + N.filtro_ambito(u, alias='cl.'),
                       (u['conta'], agora - 30 * DIA)).fetchone()
        out['pontos'] = {'dados': st[0] or 0, 'trocados': st[1] or 0}
    out['hoje'] = out['hoje'][:30]
    return 200, out


# ======================================================================== trabalho de fundo

def trabalho_periodico(c):
    hoje = date.today()
    for r in c.execute("SELECT * FROM contratos WHERE estado='ativo' AND fim<>'' AND fim<?", (hoje.isoformat(),)).fetchall():
        if r['renovacao'] and r['periodicidade'] in PERIODOS:
            fim = date.fromisoformat(r['fim'])
            while fim < hoje:
                fim = soma_meses(fim, PERIODOS[r['periodicidade']])
            c.execute('UPDATE contratos SET fim=?, atualizado=? WHERE id=?', (fim.isoformat(), B.agora(), r['id']))
            if r['cliente']:
                c.execute('INSERT INTO atividade(conta, cliente, tipo, texto, uid, criado) VALUES(?,?,?,?,NULL,?)',
                          (r['conta'], r['cliente'], 'contrato', 'Contrato «%s» renovado até %s' % (r['titulo'], iso_pt(fim.isoformat())),
                           B.agora()))
        else:
            c.execute("UPDATE contratos SET estado='terminado', atualizado=? WHERE id=?", (B.agora(), r['id']))
