#!/usr/bin/env python3
"""webase: API do CRM (contas, equipa e permissões, clientes, leads, chamadas, contratos, pontos, subscrições,
marketplace, partilhas e fórum).

Só biblioteca padrão (http.server + sqlite3). Corre em 127.0.0.1, atrás do Caddy, que trata do HTTPS e serve o site.

Configuração (variáveis de ambiente, em /etc/webase/api.env, fora do repositório):
  ORIGENS         origens aceites (ex.: https://webase.pt https://webase.2-31-13-85.sslip.io)
  ADMINS          e-mails com acesso à administração da plataforma (fórum e resumo)
  WB_DADOS        pasta dos dados (por omissão /var/lib/webase-api)
  WB_PORTA        porta local (por omissão 3160)
  WB_PAGAMENTOS   «desligado» (por omissão) até haver um prestador de pagamentos ligado

Segurança: sessões guardadas só como hash; cookie __Host- HttpOnly, Secure, SameSite=Lax; pedidos que mudam dados só
com JSON, cabeçalho X-Wb e de uma origem aceite; cada registo é procurado sempre com a conta de quem pede (e, com o
âmbito «só os meus», com o responsável); permissões por módulo e ação verificadas aqui, nunca só no browser;
limites por IP e por conta; textos limpos e com tamanho máximo; exportações sem fórmulas (CSV seguro).
"""
import base64
import json
import os
import re
import secrets
import sys
import threading
import time
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import base as B          # noqa: E402
import imagens            # noqa: E402
import nucleo as N        # noqa: E402
import perm as P          # noqa: E402
from nucleo import Erro, precisa, rota   # noqa: E402
import crm                # noqa: E402,F401  (regista as rotas do CRM)
import mk                 # noqa: E402,F401  (marketplace e partilhas)
import forum              # noqa: E402,F401  (fórum)
import ligar              # noqa: E402  (ligar no telemóvel)

DIA = 86400
SITE = os.environ.get('WB_SITE')     # só em testes locais: a API serve também o site
MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
        '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
        '.ico': 'image/x-icon', '.xml': 'application/xml'}


# ======================================================================== sessões

def criar_sessao(h, c, uid):
    tok = secrets.token_urlsafe(32)
    t = B.agora()
    disp = (h.headers.get('User-Agent') or '')[:160]
    c.execute('INSERT INTO sessoes(hash, uid, criada, expira, disp) VALUES(?,?,?,?,?)',
              (B.sha(tok), uid, t, t + B.SESSAO_DIAS * DIA, disp))
    c.execute('DELETE FROM sessoes WHERE uid=? AND expira<?', (uid, t))
    seg = '' if B.DEV else ' Secure;'
    h.cookies.append('%s=%s; Path=/; Max-Age=%d; HttpOnly;%s SameSite=Lax' % (B.COOKIE, tok, B.SESSAO_DIAS * DIA, seg))


def apagar_cookie(h):
    seg = '' if B.DEV else ' Secure;'
    h.cookies.append('%s=; Path=/; Max-Age=0; HttpOnly;%s SameSite=Lax' % (B.COOKIE, seg))


def url_logo(conta):
    return '/api/logo/%s-%s.png' % (conta['codigo'], conta['logo']) if conta['logo'] else None


def resumo_conta(c, conta):
    return {'nome': conta['nome'], 'codigo': conta['codigo'], 'setor': conta['setor'], 'nif': conta['nif'],
            'telefone': conta['telefone'], 'email': conta['email'], 'morada': conta['morada'],
            'localidade': conta['localidade'], 'plano': conta['plano'], 'fundador': bool(conta['fundador']),
            'modulos': P.modulos_conta(conta), 'cor': conta['cor'], 'logo': url_logo(conta),
            'fases': P.fases_conta(conta), 'campos': P.campos_conta(conta),
            'pontos_euro': conta['pontos_euro'], 'pontos_boas_vindas': conta['pontos_boas_vindas'],
            'configurada': bool(conta['configurada'])}


def eu_completo(c, u):
    conta = N.conta_de(c, u)
    avisos = c.execute('SELECT COUNT(*) FROM avisos WHERE conta=? AND lido=0', (u['conta'],)).fetchone()[0]
    return {'id': u['id'], 'nome': u['nome'], 'email': u['email'], 'dono': bool(u['dono']), 'papel': u['papel'],
            'tema': u['tema'], 'trocar_senha': bool(u['trocar_senha']), 'perm': P.perm_efetiva(u),
            'admin': u['email'].lower() in B.ADMINS, 'conta': resumo_conta(c, conta), 'avisos': avisos,
            'pagamentos': B.PAGAMENTOS}


# ======================================================================== público

@rota('GET', '/api/publico/estado', conta=False)
def publico_estado(h, c, u, m, d):
    fund = c.execute('SELECT COUNT(*) FROM contas WHERE fundador=1 AND apagada=0').fetchone()[0]
    return 200, {'fundadores_restantes': max(0, B.FUNDADORES - fund), 'fundadores_total': B.FUNDADORES,
                 'pagamentos': B.PAGAMENTOS,
                 'setores': [{'id': k, 'nome': v[0], 'modulos': v[1]} for k, v in P.SETORES.items()],
                 'modulos': [{'id': k, 'nome': v} for k, v in P.MODULOS.items()]}


@rota('POST', '/api/conta/criar', conta=False)
def conta_criar(h, c, u, m, d):
    precisa(h.limitar('criar', 10, 3600), 'Muitas contas criadas a partir desta rede. Tenta daqui a uma hora.', 429)
    precisa(not d.get('site'), 'Pedido recusado.', 400)                       # campo isco (só robôs o preenchem)
    nome = N.campo(d, 'nome', 80, True, 'o teu nome')
    negocio = N.campo(d, 'negocio', 80, True, 'o nome do negócio')
    email = N.email_ok(d.get('email'), True)
    senha = d.get('senha')
    erro = B.senha_fraca(senha, email)
    precisa(not erro, erro, campo='senha')
    precisa(d.get('aceito') is True, 'Para criar a conta tens de aceitar os termos e a política de privacidade.', campo='aceito')
    setor = d.get('setor') if d.get('setor') in P.SETORES else 'outro'
    if c.execute('SELECT 1 FROM utilizadores WHERE email=?', (email,)).fetchone():
        B.gastar_tempo(senha)
        raise Erro(409, 'Já existe uma conta com este e-mail. Entra com ele ou usa outro.', campo='email')
    t = B.agora()
    c.execute('BEGIN IMMEDIATE')
    try:
        fundador = 1 if c.execute('SELECT COUNT(*) FROM contas WHERE fundador=1 AND apagada=0').fetchone()[0] < B.FUNDADORES else 0
        codigo = B.codigo_conta()
        while c.execute('SELECT 1 FROM contas WHERE codigo=?', (codigo,)).fetchone():
            codigo = B.codigo_conta()
        cur = c.execute('INSERT INTO contas(codigo, nome, setor, email, fundador, modulos, criado) VALUES(?,?,?,?,?,?,?)',
                        (codigo, negocio, setor, email, fundador, json.dumps(P.SETORES[setor][1]), t))
        cid = cur.lastrowid
        cur = c.execute('INSERT INTO utilizadores(conta, email, senha, nome, dono, papel, perm, criado, visto) '
                        'VALUES(?,?,?,?,1,?,?,?,?)', (cid, email, B.hash_senha(senha), nome, 'administrador', '{}', t, t))
        uid = cur.lastrowid
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    criar_sessao(h, c, uid)
    novo = c.execute('SELECT * FROM utilizadores WHERE id=?', (uid,)).fetchone()
    N.auditar(h, c, novo, 'conta.criar', codigo)
    return 201, eu_completo(c, novo)


@rota('POST', '/api/conta/entrar', conta=False)
def conta_entrar(h, c, u, m, d):
    email = (d.get('email') or '').strip().lower() if isinstance(d.get('email'), str) else ''
    senha = d.get('senha') if isinstance(d.get('senha'), str) else ''
    precisa(h.limitar('entrar', 12, 900) and B.limite('entrar-email:' + B.sha(email), 8, 900),
            'Demasiadas tentativas. Espera 15 minutos e tenta outra vez.', 429)
    precisa(email and senha and len(senha) <= 128, 'Escreve o e-mail e a palavra-passe.')
    r = c.execute('SELECT * FROM utilizadores WHERE email=?', (email,)).fetchone()
    if not r:
        B.gastar_tempo(senha)
        raise Erro(401, 'E-mail ou palavra-passe errados.')
    if not B.confere_senha(senha, r['senha']):
        N.auditar(h, c, r, 'entrar.falhou')
        raise Erro(401, 'E-mail ou palavra-passe errados.')
    conta = c.execute('SELECT apagada FROM contas WHERE id=?', (r['conta'],)).fetchone()
    precisa(r['ativo'] and conta and not conta['apagada'], 'Esta conta está desativada. Fala com quem gere a conta do teu negócio.', 403)
    criar_sessao(h, c, r['id'])
    c.execute('UPDATE utilizadores SET visto=? WHERE id=?', (B.agora(), r['id']))
    N.auditar(h, c, r, 'entrar')
    return 200, eu_completo(c, r)


@rota('POST', '/api/conta/sair', conta=False)
def conta_sair(h, c, u, m, d):
    if h.token:
        c.execute('DELETE FROM sessoes WHERE hash=?', (B.sha(h.token),))
    apagar_cookie(h)
    return 200, {'ok': True}


@rota('GET', '/api/eu')
def eu(h, c, u, m, d):
    return 200, eu_completo(c, u)


@rota('POST', '/api/eu/senha')
def eu_senha(h, c, u, m, d):
    precisa(h.limitar('senha', 10, 900), 'Demasiadas tentativas. Espera um pouco.', 429)
    atual = d.get('atual') if isinstance(d.get('atual'), str) else ''
    nova = d.get('nova')
    precisa(B.confere_senha(atual, u['senha']), 'A palavra-passe atual não está certa.', 400, campo='atual')
    erro = B.senha_fraca(nova, u['email'])
    precisa(not erro, erro, campo='nova')
    precisa(nova != atual, 'A nova palavra-passe tem de ser diferente da atual.', campo='nova')
    c.execute('UPDATE utilizadores SET senha=?, trocar_senha=0 WHERE id=?', (B.hash_senha(nova), u['id']))
    c.execute('DELETE FROM sessoes WHERE uid=? AND hash<>?', (u['id'], B.sha(h.token or '')))
    N.auditar(h, c, u, 'senha.mudar')
    return 200, {'ok': True}


@rota('POST', '/api/eu/preferencias')
def eu_preferencias(h, c, u, m, d):
    if 'tema' in d:
        precisa(d['tema'] in ('auto', 'claro', 'escuro'), 'Tema inválido.')
        c.execute('UPDATE utilizadores SET tema=? WHERE id=?', (d['tema'], u['id']))
    if 'nome' in d:
        nome = N.campo(d, 'nome', 80, True, 'o teu nome')
        c.execute('UPDATE utilizadores SET nome=? WHERE id=?', (nome, u['id']))
    novo = c.execute('SELECT * FROM utilizadores WHERE id=?', (u['id'],)).fetchone()
    return 200, eu_completo(c, novo)


@rota('GET', '/api/eu/sessoes')
def eu_sessoes(h, c, u, m, d):
    atual = B.sha(h.token or '')
    l = [{'criada': s['criada'], 'disp': s['disp'], 'esta': s['hash'] == atual}
         for s in c.execute('SELECT * FROM sessoes WHERE uid=? AND expira>? ORDER BY criada DESC LIMIT 20', (u['id'], B.agora()))]
    return 200, {'sessoes': l}


@rota('POST', '/api/eu/sessoes/terminar')
def eu_sessoes_terminar(h, c, u, m, d):
    n = c.execute('DELETE FROM sessoes WHERE uid=? AND hash<>?', (u['id'], B.sha(h.token or ''))).rowcount
    N.auditar(h, c, u, 'sessoes.terminar', n)
    return 200, {'terminadas': n}


# ======================================================================== definições da conta

@rota('POST', '/api/conta/configurar', extra='definicoes')
def conta_configurar(h, c, u, m, d):
    setor = d.get('setor')
    precisa(setor in P.SETORES, 'Escolhe o tipo de negócio.', campo='setor')
    mods = d.get('modulos')
    precisa(isinstance(mods, list) and all(x in P.MODULOS for x in mods), 'Módulos inválidos.')
    mods = ['clientes'] + [x for x in P.MODULOS if x in mods and x != 'clientes']
    c.execute('UPDATE contas SET setor=?, modulos=?, configurada=1 WHERE id=?', (setor, json.dumps(mods), u['conta']))
    N.auditar(h, c, u, 'conta.modulos', ','.join(mods))
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/dados', extra='definicoes')
def conta_dados(h, c, u, m, d):
    nome = N.campo(d, 'nome', 80, True, 'o nome do negócio')
    nif = N.nif_ok(d.get('nif'))
    tel = N.telefone_ok(d.get('telefone'))
    email = N.email_ok(d.get('email'))
    morada = N.campo(d, 'morada', 160)
    loc = N.campo(d, 'localidade', 60)
    c.execute('UPDATE contas SET nome=?, nif=?, telefone=?, email=?, morada=?, localidade=? WHERE id=?',
              (nome, nif, tel, email, morada, loc, u['conta']))
    N.auditar(h, c, u, 'conta.dados')
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/marca', extra='definicoes')
def conta_marca(h, c, u, m, d):
    cor = d.get('cor')
    precisa(P.cor_valida(cor), 'Essa cor não tem contraste suficiente com texto branco. Escolhe uma mais escura.', campo='cor')
    c.execute('UPDATE contas SET cor=? WHERE id=?', (cor.upper(), u['conta']))
    N.auditar(h, c, u, 'conta.cor', cor)
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/logo', extra='definicoes', limite=900 * 1024)
def conta_logo(h, c, u, m, d):
    precisa(h.limitar('logo', 20, 3600), 'Demasiadas mudanças de logótipo. Tenta mais tarde.', 429)
    b64 = d.get('png')
    precisa(isinstance(b64, str) and len(b64) < 880 * 1024, 'O logótipo é demasiado grande (máximo 600 KB).')
    try:
        bruto = base64.b64decode(b64.split(',', 1)[-1], validate=True)
        png, _, _ = imagens.limpar_png(bruto)
    except imagens.ImagemInvalida as e:
        raise Erro(400, str(e))
    except ValueError:
        raise Erro(400, 'O logótipo tem de ser uma imagem PNG.')
    conta = N.conta_de(c, u)
    versao = secrets.token_hex(6)
    destino = os.path.join(B.LOGOS, '%s-%s.png' % (conta['codigo'], versao))
    with open(destino + '.tmp', 'wb') as f:
        f.write(png)
    os.replace(destino + '.tmp', destino)
    if conta['logo']:
        try:
            os.remove(os.path.join(B.LOGOS, '%s-%s.png' % (conta['codigo'], conta['logo'])))
        except OSError:
            pass
    c.execute('UPDATE contas SET logo=? WHERE id=?', (versao, u['conta']))
    N.auditar(h, c, u, 'conta.logo')
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/logo/apagar', extra='definicoes')
def conta_logo_apagar(h, c, u, m, d):
    conta = N.conta_de(c, u)
    if conta['logo']:
        try:
            os.remove(os.path.join(B.LOGOS, '%s-%s.png' % (conta['codigo'], conta['logo'])))
        except OSError:
            pass
    c.execute("UPDATE contas SET logo='' WHERE id=?", (u['conta'],))
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/fases', extra='definicoes')
def conta_fases(h, c, u, m, d):
    fases = P.limpar_fases(d.get('fases'))
    precisa(fases, 'As fases precisam de nome (até 30 letras), pelo menos uma aberta, uma «ganho» e uma «perdido» (máx. 12).')
    antigas = {f['id'] for f in P.fases_conta(N.conta_de(c, u))}
    novas = {f['id'] for f in fases}
    for fid in antigas - novas:            # leads de fases que desapareceram passam para a primeira fase aberta
        primeira = next(f['id'] for f in fases if f['tipo'] == 'aberta')
        c.execute('UPDATE leads SET fase=? WHERE conta=? AND fase=?', (primeira, u['conta'], fid))
    c.execute('UPDATE contas SET fases=? WHERE id=?', (json.dumps(fases, ensure_ascii=False), u['conta']))
    N.auditar(h, c, u, 'conta.fases')
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/campos', extra='definicoes')
def conta_campos(h, c, u, m, d):
    campos = P.limpar_campos(d.get('campos'))
    precisa(campos is not None, 'Cada campo precisa de nome (até 40 letras) e tipo; as escolhas precisam de opções (máx. 20 campos).')
    c.execute('UPDATE contas SET campos=? WHERE id=?', (json.dumps(campos, ensure_ascii=False), u['conta']))
    N.auditar(h, c, u, 'conta.campos')
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/pontos', extra='definicoes')
def conta_pontos(h, c, u, m, d):
    pe = d.get('pontos_euro')
    precisa(isinstance(pe, (int, float)) and not isinstance(pe, bool) and 0 <= pe <= 100, 'Pontos por euro: entre 0 e 100.')
    bv = N.inteiro(d.get('pontos_boas_vindas', 0), 0, 100000, 'pontos_boas_vindas')
    c.execute('UPDATE contas SET pontos_euro=?, pontos_boas_vindas=? WHERE id=?', (round(float(pe), 2), bv, u['conta']))
    return 200, eu_completo(c, u)


@rota('POST', '/api/conta/plano')
def conta_plano(h, c, u, m, d):
    """Enquanto os pagamentos não abrem, guarda o interesse no plano (para avisar quando abrirem)."""
    plano = d.get('plano')
    precisa(plano in ('negocio', 'equipa', 'empresa'), 'Plano inválido.')
    c.execute('INSERT INTO interesse(conta, plano, criado) VALUES(?,?,?)', (u['conta'], plano, B.agora()))
    N.auditar(h, c, u, 'plano.interesse', plano)
    return 200, {'ok': True}


@rota('GET', '/api/conta/exportar-tudo', extra='exportar')
def conta_exportar_tudo(h, c, u, m, d):
    precisa(u['dono'], 'Só quem criou a conta pode exportar tudo de uma vez.', 403)
    precisa(h.limitar('exp-tudo', 5, 3600), 'Já exportaste várias vezes. Tenta daqui a uma hora.', 429)
    cid = u['conta']
    out = {'exportado': B.agora(), 'conta': resumo_conta(c, N.conta_de(c, u))}
    for t in ('clientes', 'leads', 'chamadas', 'contratos', 'pontos', 'recompensas', 'produtos', 'adesoes', 'atividade'):
        out[t] = [dict(r) for r in c.execute('SELECT * FROM %s WHERE conta=?' % t, (cid,))]
    out['equipa'] = [{'nome': r['nome'], 'email': r['email'], 'papel': r['papel'], 'ativo': bool(r['ativo'])}
                     for r in c.execute('SELECT * FROM utilizadores WHERE conta=?', (cid,))]
    N.auditar(h, c, u, 'exportar.tudo')
    corpo = json.dumps(out, ensure_ascii=False, indent=1).encode()
    return 'ficheiro', (corpo, 'application/json; charset=utf-8', 'webase-%s.json' % time.strftime('%Y-%m-%d'))


@rota('POST', '/api/conta/apagar')
def conta_apagar(h, c, u, m, d):
    precisa(u['dono'], 'Só quem criou a conta a pode apagar.', 403)
    precisa(B.confere_senha(d.get('senha') if isinstance(d.get('senha'), str) else '', u['senha']),
            'A palavra-passe não está certa.', campo='senha')
    conta = N.conta_de(c, u)
    precisa((d.get('confirmacao') or '').strip() == conta['nome'], 'Escreve o nome do negócio exatamente como está para confirmar.',
            campo='confirmacao')
    cid = u['conta']
    c.execute('BEGIN IMMEDIATE')
    try:
        for t in ('atividade', 'pontos', 'chamadas', 'contratos', 'leads', 'recompensas', 'avisos'):
            c.execute('DELETE FROM %s WHERE conta=?' % t, (cid,))
        c.execute('DELETE FROM adesao_usos WHERE adesao IN (SELECT id FROM adesoes WHERE conta=?)', (cid,))
        c.execute('DELETE FROM adesoes WHERE conta=?', (cid,))
        c.execute('DELETE FROM produtos WHERE conta=?', (cid,))
        c.execute('DELETE FROM clientes WHERE conta=?', (cid,))
        c.execute("UPDATE mk_anuncios SET estado='removido' WHERE conta=?", (cid,))
        c.execute('DELETE FROM mk_itens WHERE anuncio IN (SELECT id FROM mk_anuncios WHERE conta=?)', (cid,))
        c.execute('DELETE FROM partilha_itens WHERE partilha IN (SELECT id FROM partilhas WHERE de=? OR para=?)', (cid, cid))
        c.execute("UPDATE partilhas SET estado='apagada' WHERE de=? OR para=?", (cid, cid))
        c.execute('DELETE FROM sessoes WHERE uid IN (SELECT id FROM utilizadores WHERE conta=?)', (cid,))
        c.execute('DELETE FROM dispositivos WHERE conta=?', (cid,))
        c.execute('DELETE FROM pedidos_ligar WHERE conta=?', (cid,))
        # utilizadores ficam sem dados pessoais (o e-mail fica livre para uma conta nova)
        for r in c.execute('SELECT id FROM utilizadores WHERE conta=?', (cid,)).fetchall():
            c.execute("UPDATE utilizadores SET email=?, nome='Conta apagada', senha='x', ativo=0 WHERE id=?",
                      ('apagado-%d-%s@webase.invalid' % (r['id'], secrets.token_hex(4)), r['id']))
        c.execute("UPDATE contas SET apagada=1, fundador=0, nome='Conta apagada', nif='', telefone='', email='', morada='', logo='' WHERE id=?", (cid,))
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    if conta['logo']:
        try:
            os.remove(os.path.join(B.LOGOS, '%s-%s.png' % (conta['codigo'], conta['logo'])))
        except OSError:
            pass
    apagar_cookie(h)
    return 200, {'ok': True}


# ======================================================================== equipa e permissões

def resumo_utilizador(r):
    return {'id': r['id'], 'nome': r['nome'], 'email': r['email'], 'dono': bool(r['dono']), 'papel': r['papel'],
            'perm': P.perm_efetiva(r), 'ativo': bool(r['ativo']), 'visto': r['visto'], 'criado': r['criado'],
            'trocar_senha': bool(r['trocar_senha'])}


@rota('GET', '/api/equipa')
def equipa(h, c, u, m, d):
    # todos veem os nomes da equipa (para escolher responsáveis); só quem gere vê e-mails e permissões
    gere = P.pode_x(u, 'equipa')
    l = []
    for r in c.execute('SELECT * FROM utilizadores WHERE conta=? ORDER BY dono DESC, nome', (u['conta'],)):
        if gere:
            l.append(resumo_utilizador(r))
        elif r['ativo']:
            l.append({'id': r['id'], 'nome': r['nome'], 'ativo': True})
    return 200, {'equipa': l, 'gere': gere,
                 'papeis': [{'id': k, 'nome': v[0], 'perm': P.perm_papel(k)} for k, v in P.PAPEIS.items()],
                 'modulos': [{'id': k, 'nome': v} for k, v in P.MODULOS.items()],
                 'extras': [{'id': k, 'nome': v} for k, v in P.EXTRAS.items()], 'maximo': N.MAX_UTILIZADORES}


def perm_pedida(u, d):
    papel = d.get('papel')
    precisa(papel in P.PAPEIS or papel == 'personalizado', 'Escolhe um papel.', campo='papel')
    base = P.perm_papel(papel) if papel in P.PAPEIS else d.get('perm')
    p = P.limpar_perm(base, limite=None if u['dono'] else P.perm_efetiva(u))
    precisa(p is not None, 'Permissões inválidas.')
    return papel, p


@rota('POST', '/api/equipa/criar', extra='equipa')
def equipa_criar(h, c, u, m, d):
    precisa(h.limitar('equipa', 40, 3600), 'Demasiadas contas criadas. Tenta mais tarde.', 429)
    n = c.execute('SELECT COUNT(*) FROM utilizadores WHERE conta=? AND ativo=1', (u['conta'],)).fetchone()[0]
    precisa(n < N.MAX_UTILIZADORES, 'Chegaste ao máximo de %d pessoas nesta conta.' % N.MAX_UTILIZADORES)
    nome = N.campo(d, 'nome', 80, True, 'o nome')
    email = N.email_ok(d.get('email'), True)
    precisa(not c.execute('SELECT 1 FROM utilizadores WHERE email=?', (email,)).fetchone(),
            'Este e-mail já tem conta na webase. Usa outro e-mail para esta pessoa.', 409, campo='email')
    papel, p = perm_pedida(u, d)
    temp = B.senha_temporaria()
    t = B.agora()
    cur = c.execute('INSERT INTO utilizadores(conta, email, senha, nome, dono, papel, perm, trocar_senha, criado) '
                    'VALUES(?,?,?,?,0,?,?,1,?)', (u['conta'], email, B.hash_senha(temp), nome, papel, json.dumps(p), t))
    N.auditar(h, c, u, 'equipa.criar', cur.lastrowid, '%s (%s)' % (nome, papel))
    r = c.execute('SELECT * FROM utilizadores WHERE id=?', (cur.lastrowid,)).fetchone()
    return 201, {'utilizador': resumo_utilizador(r), 'senha_temporaria': temp}


def membro(c, u, uid):
    uid = N.inteiro(uid, 1, 10 ** 9)
    r = c.execute('SELECT * FROM utilizadores WHERE id=? AND conta=?', (uid, u['conta'])).fetchone()
    precisa(r, 'Pessoa não encontrada.', 404)
    precisa(not r['dono'], 'Quem criou a conta tem sempre acesso total.', 403)
    precisa(r['id'] != u['id'], 'Não podes mudar as tuas próprias permissões.', 403)
    return r


@rota('POST', r'/api/equipa/([0-9]{1,10})', extra='equipa')
def equipa_mudar(h, c, u, m, d):
    r = membro(c, u, int(m.group(1)))
    if not u['dono']:
        # quem não é dono não mexe em quem tem mais do que ele (ex.: outro administrador)
        alvo, meu = P.perm_efetiva(r), P.perm_efetiva(u)
        maior = any(a not in meu['m'].get(mod, '') for mod, letras in alvo['m'].items() for a in letras) or \
            any(x not in meu['x'] for x in alvo['x'])
        precisa(not maior, 'Esta pessoa tem mais permissões do que tu. Só quem criou a conta a pode mudar.', 403)
    nome = N.campo(d, 'nome', 80, True, 'o nome') if 'nome' in d else r['nome']
    papel, p = perm_pedida(u, d) if 'papel' in d else (r['papel'], P.perm_efetiva(r))
    ativo = r['ativo']
    if 'ativo' in d:
        precisa(isinstance(d['ativo'], bool), 'Pedido inválido.')
        if d['ativo'] and not r['ativo']:
            n = c.execute('SELECT COUNT(*) FROM utilizadores WHERE conta=? AND ativo=1', (u['conta'],)).fetchone()[0]
            precisa(n < N.MAX_UTILIZADORES, 'Chegaste ao máximo de %d pessoas ativas.' % N.MAX_UTILIZADORES)
        ativo = 1 if d['ativo'] else 0
    c.execute('UPDATE utilizadores SET nome=?, papel=?, perm=?, ativo=? WHERE id=?', (nome, papel, json.dumps(p), ativo, r['id']))
    if not ativo:
        c.execute('DELETE FROM sessoes WHERE uid=?', (r['id'],))
        c.execute('DELETE FROM dispositivos WHERE utilizador=?', (r['id'],))
    N.auditar(h, c, u, 'equipa.mudar', r['id'], '%s: %s%s' % (nome, papel, '' if ativo else ', desativado'))
    return 200, {'utilizador': resumo_utilizador(c.execute('SELECT * FROM utilizadores WHERE id=?', (r['id'],)).fetchone())}


@rota('POST', r'/api/equipa/([0-9]{1,10})/senha', extra='equipa')
def equipa_senha(h, c, u, m, d):
    r = membro(c, u, int(m.group(1)))
    temp = B.senha_temporaria()
    c.execute('UPDATE utilizadores SET senha=?, trocar_senha=1 WHERE id=?', (B.hash_senha(temp), r['id']))
    c.execute('DELETE FROM sessoes WHERE uid=?', (r['id'],))
    N.auditar(h, c, u, 'equipa.senha', r['id'])
    return 200, {'senha_temporaria': temp}


@rota('POST', r'/api/equipa/([0-9]{1,10})/apagar', extra='equipa')
def equipa_apagar(h, c, u, m, d):
    r = membro(c, u, int(m.group(1)))
    c.execute('DELETE FROM sessoes WHERE uid=?', (r['id'],))
    c.execute('DELETE FROM dispositivos WHERE utilizador=?', (r['id'],))
    c.execute('DELETE FROM pedidos_ligar WHERE utilizador=?', (r['id'],))
    for t, col in (('clientes', 'responsavel'), ('leads', 'responsavel'), ('contratos', 'responsavel')):
        c.execute('UPDATE %s SET %s=? WHERE conta=? AND %s=?' % (t, col, col), (u['id'], u['conta'], r['id']))
    c.execute("UPDATE utilizadores SET email=?, nome=?, senha='x', ativo=0 WHERE id=?",
              ('removido-%d-%s@webase.invalid' % (r['id'], secrets.token_hex(4)), r['nome'] + ' (removido)', r['id']))
    N.auditar(h, c, u, 'equipa.apagar', r['id'], r['nome'])
    return 200, {'ok': True}


@rota('GET', '/api/auditoria', extra='auditoria')
def auditoria(h, c, u, m, d):
    antes = int(h.q['antes']) if h.q.get('antes', '').isdigit() and len(h.q['antes']) < 13 else 10 ** 12
    nomes = {r['id']: r['nome'] for r in c.execute('SELECT id, nome FROM utilizadores WHERE conta=?', (u['conta'],))}
    l = [{'id': r['id'], 'quem': nomes.get(r['uid'], ''), 'acao': r['acao'], 'alvo': r['alvo'], 'detalhe': r['detalhe'],
          'quando': r['criado']}
         for r in c.execute('SELECT * FROM auditoria WHERE conta=? AND id<? ORDER BY id DESC LIMIT 100', (u['conta'], antes))]
    return 200, {'registos': l}


# ======================================================================== avisos

@rota('GET', '/api/avisos')
def avisos(h, c, u, m, d):
    l = [{'id': r['id'], 'tipo': r['tipo'], 'texto': r['texto'], 'ligacao': r['ligacao'], 'lido': bool(r['lido']),
          'quando': r['criado']} for r in c.execute('SELECT * FROM avisos WHERE conta=? ORDER BY id DESC LIMIT 50', (u['conta'],))]
    return 200, {'avisos': l}


@rota('POST', '/api/avisos/lidos')
def avisos_lidos(h, c, u, m, d):
    c.execute('UPDATE avisos SET lido=1 WHERE conta=? AND lido=0', (u['conta'],))
    return 200, {'ok': True}


# ======================================================================== administração da plataforma

@rota('GET', '/api/admin/resumo')
def admin_resumo(h, c, u, m, d):
    precisa(u['email'].lower() in B.ADMINS, 'Não encontrado.', 404)
    sem = B.agora() - 7 * DIA
    return 200, {
        'contas': c.execute('SELECT COUNT(*) FROM contas WHERE apagada=0').fetchone()[0],
        'contas_semana': c.execute('SELECT COUNT(*) FROM contas WHERE apagada=0 AND criado>?', (sem,)).fetchone()[0],
        'utilizadores': c.execute('SELECT COUNT(*) FROM utilizadores WHERE ativo=1').fetchone()[0],
        'ativos_semana': c.execute('SELECT COUNT(*) FROM utilizadores WHERE visto>?', (sem,)).fetchone()[0],
        'clientes': c.execute('SELECT COUNT(*) FROM clientes').fetchone()[0],
        'interesse': [dict(r) for r in c.execute('SELECT plano, COUNT(*) n FROM interesse GROUP BY plano')],
        'por_setor': [dict(r) for r in c.execute('SELECT setor, COUNT(*) n FROM contas WHERE apagada=0 GROUP BY setor ORDER BY n DESC')],
        'denuncias': c.execute("SELECT COUNT(*) FROM forum_denuncias WHERE estado='aberta'").fetchone()[0],
        'mk_reservas': c.execute("SELECT COUNT(*) FROM mk_compras WHERE estado='reservada'").fetchone()[0],
    }


# ======================================================================== servidor HTTP

class API(BaseHTTPRequestHandler):
    server_version = 'webase'
    sys_version = ''
    protocol_version = 'HTTP/1.1'
    timeout = 30

    def log_message(self, fmt, *args):      # sem IPs nem caminhos completos nos registos
        pass

    def limitar(self, nome, n, janela):
        return B.limite('%s:%s' % (nome, self.ip_h), n, janela)

    def enviar(self, estado, obj=None, corpo=None, tipo='application/json; charset=utf-8', extra=None):
        if corpo is None:
            corpo = B.json_bytes(obj if obj is not None else {})
        self.send_response(estado)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(corpo)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        if 'Cache-Control' not in (extra or {}):
            self.send_header('Cache-Control', 'no-store')
        for ck in getattr(self, 'cookies', []):
            self.send_header('Set-Cookie', ck)
        if not getattr(self, 'corpo_lido', False) and (self.headers.get('Content-Length') or '0').strip() not in ('0', ''):
            self.send_header('Connection', 'close')
            self.close_connection = True
        self.end_headers()
        if self.command != 'HEAD':
            try:
                self.wfile.write(corpo)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True

    def do_GET(self):
        self.tratar('GET')

    def do_HEAD(self):
        self.tratar('GET')

    def do_POST(self):
        self.tratar('POST')

    def do_PUT(self):
        self.enviar(405, {'erro': 'Método não permitido.'})

    do_DELETE = do_PATCH = do_OPTIONS = do_PUT

    def tratar(self, metodo):
        self.cookies = []
        self.token = None
        self.corpo_lido = False
        partes = urllib.parse.urlsplit(self.path)
        caminho = partes.path
        self.q = {k: v[0] for k, v in urllib.parse.parse_qs(partes.query, keep_blank_values=False).items()}
        ip = (self.headers.get('X-Forwarded-For') or '').split(',')[-1].strip() if not B.DEV else ''
        self.ip_h = B.hmac_curto(ip or self.client_address[0])
        try:
            if caminho.startswith('/api/logo/'):
                return self.logo(caminho)
            if not caminho.startswith('/api/'):
                if SITE and metodo == 'GET':
                    return self.ficheiro_site(caminho)
                return self.enviar(404, {'erro': 'Não encontrado.'})
            if not self.limitar('geral', 1500, 60):
                return self.enviar(429, {'erro': 'Demasiados pedidos. Espera um pouco.'})
            c = B.ligar()
            try:
                return self.rotear(metodo, caminho, c)
            finally:
                c.close()
        except Erro as e:
            try:
                self.enviar(e.estado, {'erro': e.msg, **e.extra})
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc(file=sys.stderr)
            try:
                self.enviar(500, {'erro': 'Algo correu mal do nosso lado. Tenta outra vez.'})
            except Exception:
                pass

    def utilizador(self, c):
        ck = self.headers.get('Cookie') or ''
        for parte in ck.split(';'):
            k, _, v = parte.strip().partition('=')
            if k == B.COOKIE and v:
                self.token = v
        if not self.token or len(self.token) > 100:
            return None
        s = c.execute('SELECT uid, expira FROM sessoes WHERE hash=?', (B.sha(self.token),)).fetchone()
        if not s or s['expira'] < B.agora():
            return None
        u = c.execute('SELECT u.* FROM utilizadores u JOIN contas k ON k.id=u.conta WHERE u.id=? AND u.ativo=1 AND k.apagada=0',
                      (s['uid'],)).fetchone()
        if u and (u['visto'] or 0) < B.agora() - 600:
            c.execute('UPDATE utilizadores SET visto=? WHERE id=?', (B.agora(), u['id']))
        return u

    def rotear(self, metodo, caminho, c):
        metodo_rota = 'GET' if metodo == 'GET' else 'POST'
        for (mt, rx, f, conta, modulo, acao, extra, limite) in ROTAS_ORD:
            if mt != metodo_rota:
                continue
            m = rx.match(caminho)
            if not m:
                continue
            u = self.utilizador(c)
            d = {}
            if metodo == 'POST':
                self.verificar_origem()
                d = self.ler_json(limite)
            if conta and not u:
                raise Erro(401, 'A tua sessão terminou. Entra outra vez.')
            if u and u['trocar_senha'] and caminho not in ('/api/eu', '/api/eu/senha', '/api/conta/sair'):
                raise Erro(403, 'Antes de continuar, escolhe uma palavra-passe só tua.', trocar_senha=True)
            if modulo:
                N.exige(u, N.conta_de(c, u), modulo, acao)
            if extra:
                N.exige_x(u, extra)
            estado, obj = f(self, c, u, m, d)
            if estado == 'ficheiro':
                corpo, tipo, nome = obj
                return self.enviar(200, corpo=corpo, tipo=tipo, extra={
                    'Content-Disposition': 'attachment; filename="%s"' % nome, 'Cache-Control': 'no-store'})
            return self.enviar(estado, obj)
        raise Erro(404, 'Não encontrado.')

    def verificar_origem(self):
        """Pedidos que mudam dados: só do próprio site (origem aceite) e com o cabeçalho X-Wb (bloqueia CSRF)."""
        if self.headers.get('X-Wb') != '1':
            raise Erro(403, 'Pedido recusado.')
        origem = self.headers.get('Origin')
        if origem is not None and origem not in B.ORIGENS and not (B.DEV and origem.startswith('http://127.0.0.1')):
            raise Erro(403, 'Pedido recusado.')
        sfs = self.headers.get('Sec-Fetch-Site')
        if sfs and sfs not in ('same-origin', 'none'):
            raise Erro(403, 'Pedido recusado.')

    def ler_json(self, limite):
        if (self.headers.get('Content-Type') or '').split(';')[0].strip() != 'application/json':
            raise Erro(415, 'Pedido inválido.')
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = -1
        if n < 0 or n > limite:
            raise Erro(413, 'Pedido demasiado grande.')
        corpo = self.rfile.read(n) if n else b'{}'
        self.corpo_lido = True
        try:
            d = json.loads(corpo or b'{}')
        except ValueError:
            raise Erro(400, 'Pedido inválido.')
        if not isinstance(d, dict):
            raise Erro(400, 'Pedido inválido.')
        return d

    def logo(self, caminho):
        nome = caminho[len('/api/logo/'):]
        if not re.fullmatch(r'WB-[A-Z0-9]{6}-[0-9a-f]{12}\.png', nome):
            return self.enviar(404, {'erro': 'Não encontrado.'})
        try:
            with open(os.path.join(B.LOGOS, nome), 'rb') as f:
                corpo = f.read()
        except FileNotFoundError:
            return self.enviar(404, {'erro': 'Não encontrado.'})
        self.enviar(200, corpo=corpo, tipo='image/png', extra={
            'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; sandbox"})

    def ficheiro_site(self, caminho):
        """Só em testes locais (WB_SITE): serve o site com a mesma regra do Caddy."""
        raiz = os.path.realpath(SITE)
        if caminho == '/_e.js':
            return self.enviar(200, corpo=b'', tipo='text/javascript; charset=utf-8')
        if caminho.startswith('/_'):
            return self.enviar(404, {'erro': 'Não encontrado.'})
        p = os.path.realpath(os.path.join(raiz, caminho.lstrip('/')))
        if os.path.isdir(p):
            p = os.path.join(p, 'index.html')
        if caminho.startswith('/app') and not os.path.isfile(p):
            p = os.path.join(raiz, 'app', 'index.html')
        if not (p + os.sep).startswith(raiz + os.sep) or not os.path.isfile(p):
            return self.enviar(404, corpo=b'404', tipo='text/plain; charset=utf-8')
        with open(p, 'rb') as f:
            corpo = f.read()
        self.enviar(200, corpo=corpo, tipo=MIME.get(os.path.splitext(p)[1], 'application/octet-stream'),
                    extra={'Cache-Control': 'no-cache'})


ROTAS_ORD = N.ROTAS


def ciclo():
    while True:
        time.sleep(300)
        try:
            c = B.ligar()
            crm.trabalho_periodico(c)
            ligar.limpar_antigos(c)
            c.execute('DELETE FROM sessoes WHERE expira<?', (B.agora(),))
            c.close()
        except Exception:
            traceback.print_exc(file=sys.stderr)


def main():
    os.environ.setdefault('TZ', 'Europe/Lisbon')
    try:
        time.tzset()
    except AttributeError:
        pass
    B.criar()
    try:
        c = B.ligar()
        crm.trabalho_periodico(c)
        c.close()
    except Exception:
        traceback.print_exc(file=sys.stderr)
    threading.Thread(target=ciclo, daemon=True).start()
    srv = ThreadingHTTPServer(('127.0.0.1', B.PORTA), API)
    srv.daemon_threads = True
    print('webase API em 127.0.0.1:%d (pagamentos: %s)' % (B.PORTA, B.PAGAMENTOS), file=sys.stderr)
    srv.serve_forever()


if __name__ == '__main__':
    main()
