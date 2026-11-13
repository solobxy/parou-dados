"""webase: marketplace de bases de contactos entre contas e partilhas diretas entre contas."""
import json
import re

import base as B
import nucleo as N
import perm as P
from nucleo import Erro, precisa, rota, RE_ID

CAMPOS_MK = {'nome': 'Nome', 'empresa': 'Empresa', 'email': 'E-mail', 'telefone': 'Telefone', 'nif': 'NIF',
             'localidade': 'Localidade', 'morada': 'Morada', 'codpostal': 'Código postal', 'etiquetas': 'Etiquetas'}
TIPOS_DADOS = {'empresas': 'Empresas', 'particulares': 'Particulares', 'misto': 'Empresas e particulares'}
DECLARACAO = ('Declaro que tenho base legal para ceder estes dados (incluindo o consentimento das pessoas, quando a lei o exige) '
              'e que respondo por eles perante quem os compra e perante as autoridades.')


def euros(cent):
    s = '{:,.2f}'.format((cent or 0) / 100).replace(',', ' ').replace('.', ',')
    return s + ' €'


def url_logo(k):
    return '/api/logo/%s-%s.png' % (k['codigo'], k['logo']) if k['logo'] else None


def anuncio_json(c, r, u, detalhe=False):
    k = c.execute('SELECT nome, codigo, logo, setor FROM contas WHERE id=?', (r['conta'],)).fetchone()
    minha = c.execute("SELECT estado FROM mk_compras WHERE anuncio=? AND comprador=? AND estado<>'cancelada' ORDER BY criado DESC LIMIT 1",
                      (r['id'], u['conta'])).fetchone()
    o = {'id': r['id'], 'titulo': r['titulo'], 'descricao': r['descricao'] if detalhe else r['descricao'][:180],
         'setor': r['setor'], 'setor_nome': P.SETORES.get(r['setor'], ('Outro',))[0], 'regiao': r['regiao'],
         'tipo_dados': r['tipo_dados'], 'tipo_nome': TIPOS_DADOS.get(r['tipo_dados'], ''), 'campos': N.jl(r['campos'], []),
         'preco': r['preco'], 'n': r['n'], 'vendas': r['vendas'], 'estado': r['estado'], 'criado': r['criado'],
         'meu': r['conta'] == u['conta'], 'compra': minha['estado'] if minha else None,
         'vendedor': {'nome': k['nome'], 'logo': url_logo(k)}}
    if detalhe:
        amostra = []
        for it in c.execute('SELECT dados FROM mk_itens WHERE anuncio=? LIMIT 3', (r['id'],)):
            dd = N.jl(it['dados'], {})
            amostra.append({'nome': N.mascarar_nome(dd.get('nome', '')), 'empresa': N.mascarar_nome(dd.get('empresa', '')) if dd.get('empresa') else '',
                            'email': N.mascarar_email(dd.get('email', '')), 'telefone': N.mascarar_tel(dd.get('telefone', '')),
                            'localidade': dd.get('localidade', '')})
        o['amostra'] = amostra
        o['declaracao'] = r['declaracao']
        o['comissao'] = B.COMISSAO
    return o


def anuncio_ler(c, u, aid, meu=False):
    r = c.execute("SELECT a.* FROM mk_anuncios a JOIN contas k ON k.id=a.conta WHERE a.id=? AND a.estado<>'removido' AND k.apagada=0",
                  (aid,)).fetchone()
    precisa(r and (r['estado'] == 'ativo' or r['conta'] == u['conta']), 'Anúncio não encontrado.', 404)
    if meu:
        precisa(r['conta'] == u['conta'], 'Anúncio não encontrado.', 404)
    return r


def recolher(c, u, d):
    """Escolhe os clientes a ceder (todos ou só uma etiqueta) e guarda só os campos escolhidos."""
    campos = d.get('campos')
    precisa(isinstance(campos, list) and campos and all(x in CAMPOS_MK for x in campos), 'Escolhe os campos a incluir.', campo='campos')
    precisa('nome' in campos or 'empresa' in campos, 'Inclui pelo menos o nome ou a empresa.', campo='campos')
    where, args = 'conta=?' + N.filtro_ambito(u), [u['conta']]
    etiq = (d.get('etiqueta') or '').strip().lower() if isinstance(d.get('etiqueta'), str) else ''
    if etiq:
        where += ' AND EXISTS(SELECT 1 FROM json_each(clientes.etiquetas) WHERE value=?)'
        args.append(etiq[:30])
    tipo = d.get('tipo_dados')
    precisa(tipo in TIPOS_DADOS, 'Escolhe o tipo de contactos.', campo='tipo_dados')
    if tipo in ('empresas', 'particulares'):
        where += ' AND tipo=?'
        args.append('empresa' if tipo == 'empresas' else 'particular')
    if d.get('so_consentimento') is True:
        where += ' AND consentimento=1'
    itens = []
    for r in c.execute('SELECT * FROM clientes WHERE %s LIMIT 50001' % where, args):
        dd = {}
        for k in campos:
            v = N.jl(r['etiquetas'], []) if k == 'etiquetas' else r[k]
            if v:
                dd[k] = v
        if dd.get('nome') or dd.get('empresa'):
            itens.append(dd)
    precisa(itens, 'Não há contactos com esse filtro. Muda a etiqueta ou o tipo de contactos.')
    precisa(len(itens) <= 50000, 'No máximo 50 000 contactos por anúncio.')
    return campos, tipo, itens


@rota('GET', '/api/mk', modulo='marketplace')
def mk_lista(h, c, u, m, d):
    where, args = "k.apagada=0 AND (a.estado='ativo' OR (a.conta=? AND a.estado<>'removido'))", [u['conta']]
    q = (h.q.get('q') or '')[:80].strip()
    if q:
        where += " AND (a.titulo LIKE ? ESCAPE '\\' OR a.descricao LIKE ? ESCAPE '\\' OR a.regiao LIKE ? ESCAPE '\\')"
        args += [N.like(q)] * 3
    if h.q.get('setor') in P.SETORES:
        where += ' AND a.setor=?'
        args.append(h.q['setor'])
    if h.q.get('tipo') in TIPOS_DADOS:
        where += ' AND a.tipo_dados=?'
        args.append(h.q['tipo'])
    if h.q.get('meus') == '1':
        where += ' AND a.conta=?'
        args.append(u['conta'])
    ordem = {'preco': 'a.preco', 'maiores': 'a.n DESC', 'vendidos': 'a.vendas DESC'}.get(h.q.get('ordem'), 'a.criado DESC')
    rows = c.execute('SELECT a.* FROM mk_anuncios a JOIN contas k ON k.id=a.conta WHERE %s ORDER BY %s LIMIT 200' % (where, ordem),
                     args).fetchall()
    return 200, {'itens': [anuncio_json(c, r, u) for r in rows], 'setores': {k: v[0] for k, v in P.SETORES.items()},
                 'tipos': TIPOS_DADOS, 'campos': CAMPOS_MK, 'declaracao': DECLARACAO, 'comissao': B.COMISSAO,
                 'pagamentos': B.PAGAMENTOS}


@rota('GET', '/api/mk/' + RE_ID, modulo='marketplace')
def mk_ver(h, c, u, m, d):
    return 200, {'anuncio': anuncio_json(c, anuncio_ler(c, u, m.group(1)), u, True)}


@rota('POST', '/api/mk', modulo='marketplace', acao='c')
def mk_criar(h, c, u, m, d):
    precisa(h.limitar('mk-criar', 20, 3600), 'Publicaste muitos anúncios nesta hora. Tenta mais tarde.', 429)
    conta = N.conta_de(c, u)
    N.exige(u, conta, 'clientes', 'v')
    precisa(d.get('declaracao') is True, 'Para publicar tens de aceitar a declaração sobre os dados.', campo='declaracao')
    titulo = N.campo(d, 'titulo', 100, True, 'o título')
    descricao = N.campo(d, 'descricao', 1500, linhas=True)
    setor = d.get('setor') if d.get('setor') in P.SETORES else 'outro'
    regiao = N.campo(d, 'regiao', 60)
    preco = N.euros_para_centimos(d.get('preco'), 'preco', 100000)
    campos, tipo, itens = recolher(c, u, d)
    aid = B.novo_id()
    t = B.agora()
    c.execute('BEGIN IMMEDIATE')
    try:
        c.execute('INSERT INTO mk_anuncios(id, conta, titulo, descricao, setor, regiao, tipo_dados, campos, preco, n, declaracao, '
                  'declaracao_uid, criado, atualizado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                  (aid, u['conta'], titulo, descricao, setor, regiao, tipo, json.dumps(campos), preco, len(itens), DECLARACAO,
                   u['id'], t, t))
        c.executemany('INSERT INTO mk_itens(anuncio, dados) VALUES(?,?)', [(aid, json.dumps(x, ensure_ascii=False)) for x in itens])
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    N.auditar(h, c, u, 'mk.publicar', aid, '%s: %d contactos, %s' % (titulo, len(itens), euros(preco)))
    return 201, {'anuncio': anuncio_json(c, anuncio_ler(c, u, aid), u, True)}


@rota('POST', '/api/mk/' + RE_ID, modulo='marketplace', acao='e')
def mk_mudar(h, c, u, m, d):
    r = anuncio_ler(c, u, m.group(1), meu=True)
    titulo = N.campo(d, 'titulo', 100, True, 'o título') if 'titulo' in d else r['titulo']
    descricao = N.campo(d, 'descricao', 1500, linhas=True) if 'descricao' in d else r['descricao']
    preco = N.euros_para_centimos(d.get('preco'), 'preco', 100000) if 'preco' in d else r['preco']
    estado = d.get('estado', r['estado'])
    precisa(estado in ('ativo', 'pausado', 'removido'), 'Estado inválido.')
    c.execute('UPDATE mk_anuncios SET titulo=?, descricao=?, preco=?, estado=?, atualizado=? WHERE id=?',
              (titulo, descricao, preco, estado, B.agora(), r['id']))
    if estado == 'removido':
        c.execute('DELETE FROM mk_itens WHERE anuncio=?', (r['id'],))
        c.execute("UPDATE mk_compras SET estado='cancelada' WHERE anuncio=? AND estado='reservada'", (r['id'],))
    N.auditar(h, c, u, 'mk.mudar', r['id'], estado)
    if estado == 'removido':
        return 200, {'ok': True}
    return 200, {'anuncio': anuncio_json(c, anuncio_ler(c, u, r['id']), u, True)}


def copiar_para_conta(c, u, conta, itens, origem, etiqueta):
    existentes = c.execute('SELECT COUNT(*) FROM clientes WHERE conta=?', (u['conta'],)).fetchone()[0]
    emails = {r[0] for r in c.execute("SELECT email FROM clientes WHERE conta=? AND email<>''", (u['conta'],))}
    tels = {r[0] for r in c.execute("SELECT telefone FROM clientes WHERE conta=? AND telefone<>''", (u['conta'],))}
    criados = repetidos = 0
    t = B.agora()
    for dd in itens:
        if existentes + criados >= N.MAX_CLIENTES:
            break
        email = dd.get('email', '') if isinstance(dd.get('email'), str) else ''
        tel = dd.get('telefone', '') if isinstance(dd.get('telefone'), str) else ''
        if (email and email in emails) or (tel and tel in tels):
            repetidos += 1
            continue
        nome = (dd.get('nome') or dd.get('empresa') or '')[:120]
        et = [x for x in (dd.get('etiquetas') or []) if isinstance(x, str)][:13] + [etiqueta]
        f = {'tipo': 'empresa' if dd.get('empresa') and not dd.get('nome') else 'particular', 'nome': nome, 'email': email,
             'telefone': tel, 'nif': str(dd.get('nif') or '')[:20], 'empresa': str(dd.get('empresa') or '')[:120],
             'morada': str(dd.get('morada') or '')[:200], 'localidade': str(dd.get('localidade') or '')[:60],
             'codpostal': str(dd.get('codpostal') or '')[:12], 'etiquetas': json.dumps(et, ensure_ascii=False),
             'origem': origem[:80], 'responsavel': u['id']}
        f['busca'] = N.normalizar(' '.join([f['nome'], email, tel, f['empresa'], f['nif'], f['localidade'], ' '.join(et)]))
        cols = ['id', 'conta', 'criado', 'atualizado'] + list(f)
        c.execute('INSERT INTO clientes(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))),
                  [B.novo_id(), u['conta'], t, t] + list(f.values()))
        if email:
            emails.add(email)
        if tel:
            tels.add(tel)
        criados += 1
    return criados, repetidos


def etiqueta_de(titulo):
    e = re.sub(r'\s+', ' ', N.normalizar(titulo)).strip()[:24]
    return ('mk ' + e).strip()


@rota('POST', '/api/mk/' + RE_ID + '/comprar', modulo='marketplace', acao='c')
def mk_comprar(h, c, u, m, d):
    precisa(h.limitar('mk-comprar', 30, 3600), 'Muitas compras nesta hora. Tenta mais tarde.', 429)
    r = anuncio_ler(c, u, m.group(1))
    precisa(r['conta'] != u['conta'], 'Este anúncio é teu.')
    precisa(r['estado'] == 'ativo', 'Este anúncio está em pausa.')
    conta = N.conta_de(c, u)
    N.exige(u, conta, 'clientes', 'c')
    ja = c.execute("SELECT * FROM mk_compras WHERE anuncio=? AND comprador=? AND estado IN ('paga','gratis','teste','reservada')",
                   (r['id'], u['conta'])).fetchone()
    if ja and ja['estado'] != 'reservada':
        raise Erro(409, 'Já recebeste estes contactos. Estão nos teus clientes com a etiqueta «%s».' % etiqueta_de(r['titulo']))
    comissao = r['preco'] * B.COMISSAO // 100
    completa = r['preco'] == 0 or (B.PAGAMENTOS == 'teste' and u['email'].lower() in B.ADMINS)
    if not completa:
        if not ja:
            c.execute("INSERT INTO mk_compras(id, anuncio, comprador, vendedor, uid, preco, comissao, estado, criado) "
                      "VALUES(?,?,?,?,?,?,?,'reservada',?)", (B.novo_id(), r['id'], u['conta'], r['conta'], u['id'], r['preco'], comissao,
                                                             B.agora()))
            N.avisar(c, r['conta'], 'mk', '%s quer comprar «%s» (%s). Os pagamentos na webase estão a abrir: avisamos quando fechar.'
                     % (conta['nome'], r['titulo'], euros(r['preco'])), '/app/marketplace')
            N.auditar(h, c, u, 'mk.reservar', r['id'])
        return 200, {'reservada': True, 'mensagem': 'Ficou reservado. Os pagamentos na webase ainda não abriram: quando abrirem, '
                     'avisamos-te para concluíres a compra e receberes os contactos.'}
    c.execute('BEGIN IMMEDIATE')
    try:
        itens = [N.jl(x['dados'], {}) for x in c.execute('SELECT dados FROM mk_itens WHERE anuncio=?', (r['id'],))]
        etiq = etiqueta_de(r['titulo'])
        criados, repetidos = copiar_para_conta(c, u, conta, itens, 'Marketplace: ' + r['titulo'], etiq)
        estado = 'gratis' if r['preco'] == 0 else 'teste'
        if ja:
            c.execute('UPDATE mk_compras SET estado=?, n=?, fechado=? WHERE id=?', (estado, criados, B.agora(), ja['id']))
        else:
            c.execute('INSERT INTO mk_compras(id, anuncio, comprador, vendedor, uid, preco, comissao, n, estado, criado, fechado) '
                      'VALUES(?,?,?,?,?,?,?,?,?,?,?)', (B.novo_id(), r['id'], u['conta'], r['conta'], u['id'], r['preco'], comissao,
                                                        criados, estado, B.agora(), B.agora()))
        c.execute('UPDATE mk_anuncios SET vendas=vendas+1 WHERE id=?', (r['id'],))
        N.avisar(c, r['conta'], 'mk', '%s recebeu a tua base «%s».' % (conta['nome'], r['titulo']), '/app/marketplace')
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    N.auditar(h, c, u, 'mk.comprar', r['id'], '%d criados, %d repetidos' % (criados, repetidos))
    return 200, {'criados': criados, 'repetidos': repetidos, 'etiqueta': etiq}


@rota('GET', '/api/mk/minhas', modulo='marketplace')
def mk_minhas(h, c, u, m, d):
    def linha(r, lado):
        a = c.execute('SELECT titulo FROM mk_anuncios WHERE id=?', (r['anuncio'],)).fetchone()
        outra = c.execute('SELECT nome FROM contas WHERE id=?', (r['vendedor'] if lado == 'compra' else r['comprador'],)).fetchone()
        return {'id': r['id'], 'anuncio': r['anuncio'], 'titulo': a['titulo'] if a else '', 'outra': outra['nome'] if outra else '',
                'preco': r['preco'], 'comissao': r['comissao'], 'n': r['n'], 'estado': r['estado'], 'quando': r['criado']}
    compras = [linha(r, 'compra') for r in c.execute('SELECT * FROM mk_compras WHERE comprador=? ORDER BY criado DESC LIMIT 100', (u['conta'],))]
    vendas = [linha(r, 'venda') for r in c.execute('SELECT * FROM mk_compras WHERE vendedor=? ORDER BY criado DESC LIMIT 100', (u['conta'],))]
    return 200, {'compras': compras, 'vendas': vendas}


# ======================================================================== partilhas diretas entre contas

@rota('POST', '/api/partilhas', modulo='marketplace', acao='c')
def partilha_criar(h, c, u, m, d):
    precisa(h.limitar('partilha', 20, 3600), 'Muitas partilhas nesta hora. Tenta mais tarde.', 429)
    conta = N.conta_de(c, u)
    N.exige(u, conta, 'clientes', 'v')
    codigo = (d.get('codigo') or '').strip().upper() if isinstance(d.get('codigo'), str) else ''
    precisa(re.fullmatch(r'WB-[A-Z0-9]{6}', codigo), 'O código da conta tem este formato: WB-XXXXXX.', campo='codigo')
    dest = c.execute('SELECT * FROM contas WHERE codigo=? AND apagada=0', (codigo,)).fetchone()
    precisa(dest, 'Não encontrámos nenhuma conta com esse código.', 404, campo='codigo')
    precisa(dest['id'] != u['conta'], 'Esse é o código da tua própria conta.', campo='codigo')
    titulo = N.campo(d, 'titulo', 100, True, 'o título')
    d = dict(d)
    d.setdefault('tipo_dados', 'misto')
    campos, tipo, itens = recolher(c, u, d)
    pid = B.novo_id()
    c.execute('BEGIN IMMEDIATE')
    try:
        c.execute('INSERT INTO partilhas(id, de, para, titulo, n, uid, criado) VALUES(?,?,?,?,?,?,?)',
                  (pid, u['conta'], dest['id'], titulo, len(itens), u['id'], B.agora()))
        c.executemany('INSERT INTO partilha_itens(partilha, dados) VALUES(?,?)', [(pid, json.dumps(x, ensure_ascii=False)) for x in itens])
        N.avisar(c, dest['id'], 'partilha', '%s partilhou contigo %d contactos: «%s».' % (conta['nome'], len(itens), titulo), '/app/marketplace')
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    N.auditar(h, c, u, 'partilha.enviar', pid, '%s → %s (%d)' % (titulo, codigo, len(itens)))
    return 201, {'id': pid, 'n': len(itens), 'para': dest['nome']}


@rota('GET', '/api/partilhas', modulo='marketplace')
def partilhas(h, c, u, m, d):
    def linha(r, lado):
        outra = c.execute('SELECT nome FROM contas WHERE id=?', (r['de'] if lado == 'recebida' else r['para'],)).fetchone()
        return {'id': r['id'], 'titulo': r['titulo'], 'n': r['n'], 'estado': r['estado'], 'outra': outra['nome'] if outra else '',
                'quando': r['criado']}
    return 200, {'recebidas': [linha(r, 'recebida') for r in c.execute('SELECT * FROM partilhas WHERE para=? ORDER BY criado DESC LIMIT 100', (u['conta'],))],
                 'enviadas': [linha(r, 'enviada') for r in c.execute('SELECT * FROM partilhas WHERE de=? ORDER BY criado DESC LIMIT 100', (u['conta'],))],
                 'codigo': N.conta_de(c, u)['codigo']}


@rota('POST', '/api/partilhas/' + RE_ID + '/(aceitar|recusar)', modulo='marketplace', acao='v')
def partilha_decidir(h, c, u, m, d):
    r = c.execute("SELECT * FROM partilhas WHERE id=? AND para=? AND estado='pendente'", (m.group(1), u['conta'])).fetchone()
    precisa(r, 'Partilha não encontrada ou já decidida.', 404)
    conta = N.conta_de(c, u)
    if m.group(2) == 'recusar':
        c.execute("UPDATE partilhas SET estado='recusada', decidido=? WHERE id=?", (B.agora(), r['id']))
        c.execute('DELETE FROM partilha_itens WHERE partilha=?', (r['id'],))
        N.avisar(c, r['de'], 'partilha', '%s recusou a partilha «%s».' % (conta['nome'], r['titulo']))
        return 200, {'ok': True}
    N.exige(u, conta, 'clientes', 'c')
    c.execute('BEGIN IMMEDIATE')
    try:
        itens = [N.jl(x['dados'], {}) for x in c.execute('SELECT dados FROM partilha_itens WHERE partilha=?', (r['id'],))]
        etiq = ('partilha ' + re.sub(r'\s+', ' ', N.normalizar(r['titulo'])).strip())[:30]
        de = c.execute('SELECT nome FROM contas WHERE id=?', (r['de'],)).fetchone()
        criados, repetidos = copiar_para_conta(c, u, conta, itens, 'Partilha de ' + (de['nome'] if de else ''), etiq)
        c.execute("UPDATE partilhas SET estado='aceite', decidido=? WHERE id=?", (B.agora(), r['id']))
        c.execute('DELETE FROM partilha_itens WHERE partilha=?', (r['id'],))
        N.avisar(c, r['de'], 'partilha', '%s aceitou a partilha «%s».' % (conta['nome'], r['titulo']))
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    N.auditar(h, c, u, 'partilha.aceitar', r['id'], '%d criados' % criados)
    return 200, {'criados': criados, 'repetidos': repetidos, 'etiqueta': etiq}
