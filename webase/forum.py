"""webase: fórum de quem usa a webase (perguntas, dicas, notícias do setor e novidades da plataforma)."""
import base as B
import nucleo as N
from nucleo import Erro, precisa, rota, RE_ID

CATEGORIAS = {'perguntas': 'Perguntas', 'dicas': 'Dicas', 'noticias': 'Notícias do setor', 'geral': 'Conversa',
              'novidades': 'Novidades da webase'}
SO_ADMIN = {'novidades'}
DIA = 86400


def e_admin(u):
    return u['email'].lower() in B.ADMINS


def autor(c, uid, conta_id):
    r = c.execute('SELECT u.nome, u.email, k.nome negocio, k.codigo, k.logo FROM utilizadores u JOIN contas k ON k.id=u.conta '
                  'WHERE u.id=?', (uid,)).fetchone()
    if not r:
        return {'nome': 'Conta apagada', 'negocio': '', 'logo': None, 'equipa': False}
    partes = (r['nome'] or '').split()
    nome = partes[0] + (' ' + partes[-1][0] + '.' if len(partes) > 1 else '') if partes else 'Utilizador'
    return {'nome': nome, 'negocio': r['negocio'], 'logo': '/api/logo/%s-%s.png' % (r['codigo'], r['logo']) if r['logo'] else None,
            'equipa': r['email'].lower() in B.ADMINS}


def topico_json(c, r, u, completo=False):
    gostei = bool(c.execute('SELECT 1 FROM forum_gostos WHERE alvo=? AND uid=?', (r['id'], u['id'])).fetchone())
    o = {'id': r['id'], 'categoria': r['categoria'], 'categoria_nome': CATEGORIAS.get(r['categoria'], ''), 'titulo': r['titulo'],
         'resumo': r['texto'][:180] if not completo else None, 'autor': autor(c, r['uid'], r['conta']), 'respostas': r['respostas'],
         'gostos': r['gostos'], 'gostei': gostei, 'fixo': bool(r['fixo']), 'fechado': bool(r['fechado']), 'ultima': r['ultima'],
         'criado': r['criado'], 'editado': r['editado'], 'meu': r['uid'] == u['id']}
    if completo:
        o['texto'] = r['texto']
        o['pode_editar'] = (r['uid'] == u['id'] and B.agora() - r['criado'] < 7 * DIA) or e_admin(u)
    return o


def topico_ler(c, tid):
    r = c.execute('SELECT * FROM forum_topicos WHERE id=? AND apagado=0', (tid,)).fetchone()
    precisa(r, 'Tópico não encontrado.', 404)
    return r


@rota('GET', '/api/forum', modulo='forum')
def forum(h, c, u, m, d):
    where, args = 'apagado=0', []
    cat = h.q.get('categoria')
    if cat in CATEGORIAS:
        where += ' AND categoria=?'
        args.append(cat)
    q = (h.q.get('q') or '')[:80].strip()
    if q:
        where += " AND (titulo LIKE ? ESCAPE '\\' OR texto LIKE ? ESCAPE '\\')"
        args += [N.like(q)] * 2
    if h.q.get('meus') == '1':
        where += ' AND uid=?'
        args.append(u['id'])
    pagina = N.inteiro(h.q.get('pagina', '1'), 1, 10000)
    total = c.execute('SELECT COUNT(*) FROM forum_topicos WHERE ' + where, args).fetchone()[0]
    rows = c.execute('SELECT * FROM forum_topicos WHERE %s ORDER BY fixo DESC, ultima DESC LIMIT 30 OFFSET ?' % where,
                     args + [(pagina - 1) * 30]).fetchall()
    return 200, {'itens': [topico_json(c, r, u) for r in rows], 'total': total, 'pagina': pagina,
                 'categorias': [{'id': k, 'nome': v, 'so_equipa': k in SO_ADMIN} for k, v in CATEGORIAS.items()],
                 'admin': e_admin(u)}


@rota('POST', '/api/forum', modulo='forum', acao='c')
def forum_criar(h, c, u, m, d):
    precisa(B.limite('forum-t:%d' % u['id'], 8, 3600), 'Já abriste vários tópicos nesta hora. Volta daqui a pouco.', 429)
    cat = d.get('categoria')
    precisa(cat in CATEGORIAS, 'Escolhe a categoria.', campo='categoria')
    precisa(cat not in SO_ADMIN or e_admin(u), 'As novidades da webase são publicadas pela equipa da webase.', 403, campo='categoria')
    titulo = N.campo(d, 'titulo', 140, True, 'o título')
    precisa(len(titulo) >= 6, 'O título precisa de pelo menos 6 letras.', campo='titulo')
    texto = N.campo(d, 'texto', 8000, True, 'o texto', linhas=True)
    precisa(len(texto) >= 10, 'Escreve um pouco mais (pelo menos 10 letras).', campo='texto')
    tid = B.novo_id()
    t = B.agora()
    c.execute('INSERT INTO forum_topicos(id, conta, uid, categoria, titulo, texto, ultima, criado) VALUES(?,?,?,?,?,?,?,?)',
              (tid, u['conta'], u['id'], cat, titulo, texto, t, t))
    return 201, {'topico': topico_json(c, topico_ler(c, tid), u, True)}


@rota('GET', '/api/forum/' + RE_ID, modulo='forum')
def forum_ver(h, c, u, m, d):
    r = topico_ler(c, m.group(1))
    resp = []
    for x in c.execute('SELECT * FROM forum_respostas WHERE topico=? ORDER BY criado LIMIT 500', (r['id'],)):
        gostei = bool(c.execute('SELECT 1 FROM forum_gostos WHERE alvo=? AND uid=?', (x['id'], u['id'])).fetchone())
        resp.append({'id': x['id'], 'texto': '' if x['apagado'] else x['texto'], 'apagado': bool(x['apagado']),
                     'autor': autor(c, x['uid'], x['conta']) if not x['apagado'] else None, 'gostos': x['gostos'], 'gostei': gostei,
                     'criado': x['criado'], 'editado': x['editado'], 'meu': x['uid'] == u['id'],
                     'pode_editar': not x['apagado'] and ((x['uid'] == u['id'] and B.agora() - x['criado'] < 7 * DIA) or e_admin(u))})
    return 200, {'topico': topico_json(c, r, u, True), 'respostas': resp, 'admin': e_admin(u)}


@rota('POST', '/api/forum/' + RE_ID + '/responder', modulo='forum', acao='c')
def forum_responder(h, c, u, m, d):
    precisa(B.limite('forum-r:%d' % u['id'], 30, 3600), 'Já respondeste muitas vezes nesta hora. Volta daqui a pouco.', 429)
    r = topico_ler(c, m.group(1))
    precisa(not r['fechado'] or e_admin(u), 'Este tópico está fechado a novas respostas.', 403)
    texto = N.campo(d, 'texto', 5000, True, 'a resposta', linhas=True)
    precisa(len(texto) >= 2, 'A resposta está vazia.', campo='texto')
    rid = B.novo_id()
    t = B.agora()
    c.execute('INSERT INTO forum_respostas(id, topico, conta, uid, texto, criado) VALUES(?,?,?,?,?,?)', (rid, r['id'], u['conta'], u['id'], texto, t))
    c.execute('UPDATE forum_topicos SET respostas=respostas+1, ultima=? WHERE id=?', (t, r['id']))
    if r['conta'] != u['conta']:
        N.avisar(c, r['conta'], 'forum', 'Nova resposta no tópico «%s».' % r['titulo'][:80], '/app/forum/' + r['id'])
    return 201, {'id': rid}


@rota('POST', '/api/forum/' + RE_ID + '/editar', modulo='forum', acao='c')
def forum_editar(h, c, u, m, d):
    r = topico_ler(c, m.group(1))
    precisa((r['uid'] == u['id'] and B.agora() - r['criado'] < 7 * DIA) or e_admin(u), 'Já não podes editar este tópico.', 403)
    titulo = N.campo(d, 'titulo', 140, True, 'o título')
    texto = N.campo(d, 'texto', 8000, True, 'o texto', linhas=True)
    precisa(len(titulo) >= 6 and len(texto) >= 10, 'O título ou o texto estão demasiado curtos.')
    c.execute('UPDATE forum_topicos SET titulo=?, texto=?, editado=? WHERE id=?', (titulo, texto, B.agora(), r['id']))
    return 200, {'topico': topico_json(c, topico_ler(c, r['id']), u, True)}


@rota('POST', '/api/forum/' + RE_ID + '/(apagar|fixar|fechar|gosto)', modulo='forum')
def forum_acao(h, c, u, m, d):
    r = topico_ler(c, m.group(1))
    acao = m.group(2)
    if acao == 'gosto':
        return 200, alternar_gosto(c, u, r['id'], 'forum_topicos')
    if acao == 'apagar':
        precisa(r['uid'] == u['id'] or e_admin(u), 'Só quem escreveu pode apagar.', 403)
        c.execute('UPDATE forum_topicos SET apagado=1 WHERE id=?', (r['id'],))
        N.auditar(h, c, u, 'forum.apagar', r['id'], r['titulo'])
        return 200, {'ok': True}
    precisa(e_admin(u), 'Só a equipa da webase pode fazer isto.', 403)
    col = 'fixo' if acao == 'fixar' else 'fechado'
    c.execute('UPDATE forum_topicos SET %s=1-%s WHERE id=?' % (col, col), (r['id'],))
    return 200, {'topico': topico_json(c, topico_ler(c, r['id']), u, True)}


def alternar_gosto(c, u, alvo, tabela):
    if c.execute('SELECT 1 FROM forum_gostos WHERE alvo=? AND uid=?', (alvo, u['id'])).fetchone():
        c.execute('DELETE FROM forum_gostos WHERE alvo=? AND uid=?', (alvo, u['id']))
        c.execute('UPDATE %s SET gostos=MAX(0, gostos-1) WHERE id=?' % tabela, (alvo,))
        gostei = False
    else:
        c.execute('INSERT INTO forum_gostos(alvo, uid, criado) VALUES(?,?,?)', (alvo, u['id'], B.agora()))
        c.execute('UPDATE %s SET gostos=gostos+1 WHERE id=?' % tabela, (alvo,))
        gostei = True
    n = c.execute('SELECT gostos FROM %s WHERE id=?' % tabela, (alvo,)).fetchone()[0]
    return {'gostei': gostei, 'gostos': n}


@rota('POST', '/api/forum/r/' + RE_ID + '/(apagar|editar|gosto)', modulo='forum')
def forum_resposta_acao(h, c, u, m, d):
    r = c.execute('SELECT * FROM forum_respostas WHERE id=? AND apagado=0', (m.group(1),)).fetchone()
    precisa(r, 'Resposta não encontrada.', 404)
    topico_ler(c, r['topico'])
    acao = m.group(2)
    if acao == 'gosto':
        return 200, alternar_gosto(c, u, r['id'], 'forum_respostas')
    if acao == 'apagar':
        precisa(r['uid'] == u['id'] or e_admin(u), 'Só quem escreveu pode apagar.', 403)
        c.execute('UPDATE forum_respostas SET apagado=1 WHERE id=?', (r['id'],))
        c.execute('UPDATE forum_topicos SET respostas=MAX(0, respostas-1) WHERE id=?', (r['topico'],))
        return 200, {'ok': True}
    precisa((r['uid'] == u['id'] and B.agora() - r['criado'] < 7 * DIA) or e_admin(u), 'Já não podes editar esta resposta.', 403)
    texto = N.campo(d, 'texto', 5000, True, 'a resposta', linhas=True)
    c.execute('UPDATE forum_respostas SET texto=?, editado=? WHERE id=?', (texto, B.agora(), r['id']))
    return 200, {'ok': True}


@rota('POST', '/api/forum/denunciar', modulo='forum')
def forum_denunciar(h, c, u, m, d):
    alvo = d.get('alvo')
    precisa(isinstance(alvo, str) and len(alvo) == 12, 'Pedido inválido.')
    existe = c.execute('SELECT 1 FROM forum_topicos WHERE id=? AND apagado=0 UNION SELECT 1 FROM forum_respostas WHERE id=? AND apagado=0',
                       (alvo, alvo)).fetchone()
    precisa(existe, 'Não encontrado.', 404)
    motivo = N.campo(d, 'motivo', 300, True, 'o motivo')
    c.execute('INSERT OR IGNORE INTO forum_denuncias(alvo, uid, motivo, criado) VALUES(?,?,?,?)', (alvo, u['id'], motivo, B.agora()))
    return 200, {'ok': True}


@rota('GET', '/api/forum/denuncias')
def forum_denuncias(h, c, u, m, d):
    precisa(e_admin(u), 'Não encontrado.', 404)
    l = []
    for r in c.execute("SELECT * FROM forum_denuncias WHERE estado='aberta' ORDER BY id DESC LIMIT 100"):
        t = c.execute('SELECT id, titulo, texto FROM forum_topicos WHERE id=?', (r['alvo'],)).fetchone()
        rr = None if t else c.execute('SELECT topico, texto FROM forum_respostas WHERE id=?', (r['alvo'],)).fetchone()
        l.append({'id': r['id'], 'alvo': r['alvo'], 'motivo': r['motivo'], 'quando': r['criado'],
                  'topico': t['id'] if t else (rr['topico'] if rr else None),
                  'texto': (t['titulo'] + ' — ' + t['texto'][:200]) if t else (rr['texto'][:240] if rr else '')})
    return 200, {'denuncias': l}


@rota('POST', r'/api/forum/denuncias/([0-9]{1,10})/resolver')
def forum_denuncia_resolver(h, c, u, m, d):
    precisa(e_admin(u), 'Não encontrado.', 404)
    c.execute("UPDATE forum_denuncias SET estado='resolvida' WHERE id=?", (int(m.group(1)),))
    return 200, {'ok': True}
