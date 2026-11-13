"""webase — «Ligar no telemóvel»: clicas em Ligar no computador e o teu telemóvel mostra uma notificação para ligar.

Como funciona:
- O telemóvel ativa as notificações uma vez (Web Push) e a API guarda o endereço que o serviço de notificações deu
  (Google, Mozilla, Apple ou Microsoft).
- O computador cria um pedido. A API acorda o telemóvel com um aviso vazio: a mensagem não leva dados, por isso não é
  preciso cifrá-la. O telemóvel vai buscar o pedido à API com a própria sessão e mostra «Ligar a …».
- No telemóvel, tocar em «Ligar agora» abre a app de chamadas; ao voltar, escolhe-se o resultado e a chamada fica
  registada. O computador vê o estado a mudar.

Os avisos ao serviço de notificações são assinados com VAPID (JWT ES256). A assinatura ECDSA P-256 está aqui em Python
puro, sem dependências; a chave fica em WB_DADOS/vapid.json (só o serviço a lê). Cada JWT serve 12 horas por serviço,
por isso a assinatura corre poucas vezes e fora do pedido de quem clica.
"""
import base64
import hashlib
import json
import os
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request

import base as B
import crm
import nucleo as N
from nucleo import precisa, rota

RE_ID = N.RE_ID
VALIDADE = 180              # segundos que um pedido espera pelo telemóvel
MAX_DISPOSITIVOS = 6
MODO = os.environ.get('WB_PUSH', 'enviar')     # «registo» nos testes: escreve em WB_DADOS/push.log em vez de enviar
CONTACTO = os.environ.get('WB_PUSH_CONTACTO', 'https://webase.pt')

# Serviços de notificações aceites (o endereço vem do browser; nada fora desta lista recebe pedidos do servidor).
SERVICOS = ('fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com',
            'web.push.apple.com')
SUFIXOS = ('.notify.windows.com', '.push.apple.com', '.push.services.mozilla.com')


# ---------------------------------------------------------------- ECDSA P-256 (só o necessário para assinar)

_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
_G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
      0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5, 1)


def _dobro(p):
    if p is None:
        return None
    x, y, z = p
    if y == 0:
        return None
    delta = z * z % _P
    gama = y * y % _P
    beta = x * gama % _P
    alfa = 3 * (x - delta) * (x + delta) % _P
    x3 = (alfa * alfa - 8 * beta) % _P
    z3 = ((y + z) * (y + z) - gama - delta) % _P
    y3 = (alfa * (4 * beta - x3) - 8 * gama * gama) % _P
    return (x3, y3, z3)


def _soma(p, q):
    if p is None:
        return q
    if q is None:
        return p
    x1, y1, z1 = p
    x2, y2, z2 = q
    z1z1, z2z2 = z1 * z1 % _P, z2 * z2 % _P
    u1, u2 = x1 * z2z2 % _P, x2 * z1z1 % _P
    s1, s2 = y1 * z2 * z2z2 % _P, y2 * z1 * z1z1 % _P
    if u1 == u2:
        return _dobro(p) if s1 == s2 else None
    hh = (u2 - u1) % _P
    r = (s2 - s1) % _P
    h2 = hh * hh % _P
    h3 = hh * h2 % _P
    x3 = (r * r - h3 - 2 * u1 * h2) % _P
    y3 = (r * (u1 * h2 - x3) - s1 * h3) % _P
    return (x3, y3, hh * z1 * z2 % _P)


def _vezes(k, p=_G):
    """k·P com escada de Montgomery (sempre os mesmos passos, seja qual for k)."""
    r0, r1 = None, p
    for i in range(255, -1, -1):
        if (k >> i) & 1:
            r0, r1 = _soma(r0, r1), _dobro(r1)
        else:
            r1, r0 = _soma(r0, r1), _dobro(r0)
    return r0


def _afim(p):
    x, y, z = p
    zi = pow(z, -1, _P)
    zi2 = zi * zi % _P
    return x * zi2 % _P, y * zi2 * zi % _P


def assinar_es256(d, msg):
    e = int.from_bytes(hashlib.sha256(msg).digest(), 'big')
    while True:
        k = secrets.randbelow(_N - 1) + 1
        r = _afim(_vezes(k))[0] % _N
        if not r:
            continue
        s = pow(k, -1, _N) * (e + r * d) % _N
        if s:
            return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


# ---------------------------------------------------------------- chave VAPID e JWT

_chave = None
_jwts = {}
_trinco = threading.Lock()


def chave():
    """(d, chave pública em base64url). Criada na primeira vez e guardada só para o serviço."""
    global _chave
    with _trinco:
        if _chave:
            return _chave
        caminho = os.path.join(B.DADOS, 'vapid.json')
        try:
            with open(caminho) as f:
                j = json.load(f)
            d = int(j['d'], 16)
        except FileNotFoundError:
            d = secrets.randbelow(_N - 1) + 1
            try:
                fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as f:
                    json.dump({'d': '%064x' % d, 'criada': B.agora()}, f)
            except FileExistsError:          # outro processo criou-a entretanto
                with open(caminho) as f:
                    d = int(json.load(f)['d'], 16)
        x, y = _afim(_vezes(d))
        _chave = (d, b64u(b'\x04' + x.to_bytes(32, 'big') + y.to_bytes(32, 'big')))
        return _chave


def jwt_para(aud):
    agora = B.agora()
    with _trinco:
        j = _jwts.get(aud)
        if j and j[1] - 3600 > agora:
            return j[0]
    d, _ = chave()
    exp = agora + 12 * 3600
    corpo = b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}, separators=(',', ':')).encode()) + '.' + \
        b64u(json.dumps({'aud': aud, 'exp': exp, 'sub': CONTACTO}, separators=(',', ':')).encode())
    t = corpo + '.' + b64u(assinar_es256(d, corpo.encode()))
    with _trinco:
        _jwts[aud] = (t, exp)
    return t


def endpoint_ok(v):
    precisa(isinstance(v, str) and 20 < len(v) <= 1024, 'Este browser não deu um endereço de notificações válido.', campo='endpoint')
    u = urllib.parse.urlsplit(v)
    host = (u.hostname or '').lower()
    precisa(u.scheme == 'https' and not u.username and not u.password and u.port in (None, 443)
            and (host in SERVICOS or host.endswith(SUFIXOS)),
            'Este browser usa um serviço de notificações que a webase não conhece.', campo='endpoint')
    return v


def enviar(endpoint):
    """Acorda um telemóvel. Devolve o código HTTP (0 se não houve resposta)."""
    u = urllib.parse.urlsplit(endpoint)
    aud = '%s://%s' % (u.scheme, u.netloc)
    cab = {'TTL': str(VALIDADE), 'Urgency': 'high', 'Content-Length': '0',
           'Authorization': 'vapid t=%s, k=%s' % (jwt_para(aud), chave()[1])}
    if MODO == 'registo':
        with open(os.path.join(B.DADOS, 'push.log'), 'a') as f:
            f.write(json.dumps({'endpoint': endpoint, 'cabecalhos': cab}) + '\n')
        return 201
    pedido = urllib.request.Request(endpoint, data=b'', method='POST', headers=cab)
    try:
        with urllib.request.urlopen(pedido, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def acordar(uid, so=None):
    """Envia para os telemóveis da pessoa (fora do pedido HTTP). Apaga os que o serviço diz que já não existem."""
    def correr():
        c = B.ligar()
        try:
            q = 'SELECT id, endpoint FROM dispositivos WHERE utilizador=?' + (' AND id=?' if so else '')
            for r in c.execute(q, (uid, so) if so else (uid,)).fetchall():
                st = enviar(r['endpoint'])
                if st in (404, 410):
                    c.execute('DELETE FROM dispositivos WHERE id=?', (r['id'],))
                elif 200 <= st < 300:
                    c.execute('UPDATE dispositivos SET usado=?, falhas=0 WHERE id=?', (B.agora(), r['id']))
                else:
                    c.execute('UPDATE dispositivos SET falhas=falhas+1 WHERE id=?', (r['id'],))
        finally:
            c.close()
    threading.Thread(target=correr, daemon=True).start()


# ---------------------------------------------------------------- telemóveis ligados

def disp_json(r):
    return {'id': r['id'], 'nome': r['nome'], 'criado': r['criado'], 'usado': r['usado'], 'falhas': r['falhas']}


@rota('GET', '/api/ligar/dispositivos')
def dispositivos(h, c, u, m, d):
    rows = c.execute('SELECT * FROM dispositivos WHERE utilizador=? ORDER BY criado DESC', (u['id'],)).fetchall()
    return 200, {'chave': chave()[1], 'dispositivos': [disp_json(r) for r in rows]}


@rota('POST', '/api/ligar/dispositivos', limite=4096)
def dispositivo_juntar(h, c, u, m, d):
    precisa(h.limitar('disp', 20, 3600), 'Demasiadas tentativas. Espera um pouco.', 429)
    ep = endpoint_ok(d.get('endpoint'))
    nome = N.campo(d, 'nome', 60) or 'Telemóvel'
    c.execute('DELETE FROM dispositivos WHERE endpoint=?', (ep,))       # o mesmo browser passa a ser só desta pessoa
    did = B.novo_id()
    c.execute('INSERT INTO dispositivos(id, conta, utilizador, endpoint, nome, criado) VALUES(?,?,?,?,?,?)',
              (did, u['conta'], u['id'], ep, nome, B.agora()))
    velhos = c.execute('SELECT id FROM dispositivos WHERE utilizador=? ORDER BY criado DESC LIMIT -1 OFFSET ?',
                       (u['id'], MAX_DISPOSITIVOS)).fetchall()
    for r in velhos:
        c.execute('DELETE FROM dispositivos WHERE id=?', (r['id'],))
    N.auditar(h, c, u, 'telemovel.ligar', did, nome)
    return 201, {'dispositivo': disp_json(c.execute('SELECT * FROM dispositivos WHERE id=?', (did,)).fetchone())}


def meu_dispositivo(c, u, did):
    r = c.execute('SELECT * FROM dispositivos WHERE id=? AND utilizador=?', (did, u['id'])).fetchone()
    precisa(r, 'Telemóvel não encontrado.', 404)
    return r


@rota('POST', '/api/ligar/dispositivos/' + RE_ID + '/apagar')
def dispositivo_apagar(h, c, u, m, d):
    r = meu_dispositivo(c, u, m.group(1))
    c.execute('DELETE FROM dispositivos WHERE id=?', (r['id'],))
    N.auditar(h, c, u, 'telemovel.desligar', r['id'], r['nome'])
    return 200, {'ok': True}


@rota('POST', '/api/ligar/dispositivos/' + RE_ID + '/testar')
def dispositivo_testar(h, c, u, m, d):
    precisa(h.limitar('disp-teste', 10, 600), 'Já enviaste vários testes. Espera uns minutos.', 429)
    r = meu_dispositivo(c, u, m.group(1))
    c.execute("UPDATE pedidos_ligar SET estado='substituido' WHERE utilizador=? AND estado='pendente'", (u['id'],))
    c.execute("INSERT INTO pedidos_ligar(id, conta, utilizador, numero, nome, teste, criado) VALUES(?,?,?,'','',1,?)",
              (B.novo_id(), u['conta'], u['id'], B.agora()))
    acordar(u['id'], so=r['id'])
    return 200, {'ok': True}


# ---------------------------------------------------------------- pedidos de chamada

def pedido_json(r):
    estado = r['estado']
    if estado == 'pendente' and r['criado'] < B.agora() - VALIDADE:
        estado = 'expirado'
    return {'id': r['id'], 'numero': r['numero'], 'nome': r['nome'], 'cliente': r['cliente'], 'estado': estado,
            'teste': bool(r['teste']), 'criado': r['criado'], 'aberto': r['aberto'], 'chamada': r['chamada'],
            'resultado': r['resultado'], 'duracao': r['duracao']}


def meu_pedido(c, u, pid):
    r = c.execute('SELECT * FROM pedidos_ligar WHERE id=? AND utilizador=?', (pid, u['id'])).fetchone()
    precisa(r, 'Pedido não encontrado.', 404)
    return r


@rota('POST', '/api/ligar/pedir')
def pedir(h, c, u, m, d):
    precisa(h.limitar('ligar', 60, 3600), 'Demasiados pedidos seguidos. Espera um pouco.', 429)
    n = c.execute('SELECT COUNT(*) FROM dispositivos WHERE utilizador=?', (u['id'],)).fetchone()[0]
    precisa(n, 'Ainda não ligaste o teu telemóvel. Abre a webase no telemóvel, vai a Definições → Ligar do computador e toca em «Ativar».',
            409, codigo='sem_telemovel')
    cli = N.cliente_acessivel(c, u, d['cliente']) if d.get('cliente') else None
    numero = N.telefone_ok(d.get('numero') or (cli['telefone'] if cli else ''))
    precisa(numero, 'Este contacto não tem número de telefone.', campo='numero')
    nome = (cli['nome'] if cli else N.campo(d, 'nome', 120)) or ''
    if not cli:
        r = c.execute('SELECT id, nome FROM clientes WHERE conta=? AND telefone=?' + N.filtro_ambito(u), (u['conta'], numero)).fetchone()
        if r:
            cli, nome = r, nome or r['nome']
    c.execute("UPDATE pedidos_ligar SET estado='substituido' WHERE utilizador=? AND estado='pendente'", (u['id'],))
    pid = B.novo_id()
    c.execute('INSERT INTO pedidos_ligar(id, conta, utilizador, cliente, numero, nome, criado) VALUES(?,?,?,?,?,?,?)',
              (pid, u['conta'], u['id'], cli['id'] if cli else None, numero, nome, B.agora()))
    acordar(u['id'])
    return 201, {'pedido': pedido_json(meu_pedido(c, u, pid)), 'telemoveis': n}


@rota('GET', '/api/ligar/pendente')
def pendente(h, c, u, m, d):
    r = c.execute("SELECT * FROM pedidos_ligar WHERE utilizador=? AND estado='pendente' AND criado>=? ORDER BY criado DESC LIMIT 1",
                  (u['id'], B.agora() - VALIDADE)).fetchone()
    return 200, {'pedido': pedido_json(r) if r else None}


@rota('GET', '/api/ligar/' + RE_ID)
def pedido_ver(h, c, u, m, d):
    return 200, {'pedido': pedido_json(meu_pedido(c, u, m.group(1)))}


@rota('POST', '/api/ligar/' + RE_ID + '/aberto')
def pedido_aberto(h, c, u, m, d):
    r = meu_pedido(c, u, m.group(1))
    if r['estado'] == 'pendente':
        c.execute("UPDATE pedidos_ligar SET estado='aberto', aberto=? WHERE id=?", (B.agora(), r['id']))
    return 200, {'pedido': pedido_json(meu_pedido(c, u, r['id']))}


@rota('POST', '/api/ligar/' + RE_ID + '/cancelar')
def pedido_cancelar(h, c, u, m, d):
    r = meu_pedido(c, u, m.group(1))
    if r['estado'] in ('pendente', 'aberto'):
        c.execute("UPDATE pedidos_ligar SET estado='cancelado' WHERE id=?", (r['id'],))
    return 200, {'pedido': pedido_json(meu_pedido(c, u, r['id']))}


@rota('POST', '/api/ligar/' + RE_ID + '/resultado', modulo='chamadas', acao='c')
def pedido_resultado(h, c, u, m, d):
    r = meu_pedido(c, u, m.group(1))
    precisa(not r['teste'], 'Isto era só um teste.')
    precisa(r['estado'] in ('pendente', 'aberto'), 'Esta chamada já foi registada.' if r['estado'] == 'feito' else 'Este pedido já não está ativo.', 409)
    precisa(r['criado'] >= B.agora() - 6 * 3600, 'Este pedido é antigo. Regista a chamada em Chamadas.', 409)
    cliente = r['cliente'] if r['cliente'] and c.execute('SELECT 1 FROM clientes WHERE id=? AND conta=?' + N.filtro_ambito(u),
                                                        (r['cliente'], u['conta'])).fetchone() else None
    dados = {'direcao': 'saida', 'resultado': d.get('resultado'), 'numero': r['numero'], 'cliente': cliente,
             'nome': '' if cliente else r['nome'], 'duracao': d.get('duracao') or 0, 'notas': d.get('notas') or '',
             'seguimento': d.get('seguimento')}
    f = crm.validar_chamada(c, u, dados)
    f.setdefault('quando', r['aberto'] or B.agora())
    cid = B.novo_id()
    cols = ['id', 'conta', 'utilizador', 'criado'] + list(f)
    c.execute('BEGIN IMMEDIATE')
    try:
        c.execute('INSERT INTO chamadas(%s) VALUES(%s)' % (','.join(cols), ','.join('?' * len(cols))),
                  [cid, u['conta'], u['id'], B.agora()] + list(f.values()))
        if f.get('cliente'):
            N.atividade(c, u, f['cliente'], 'chamada', crm.texto_chamada(f))
            c.execute('UPDATE clientes SET atualizado=? WHERE id=?', (B.agora(), f['cliente']))
        c.execute("UPDATE pedidos_ligar SET estado='feito', chamada=?, resultado=?, duracao=? WHERE id=?",
                  (cid, f['resultado'], f.get('duracao') or 0, r['id']))
        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise
    return 201, {'pedido': pedido_json(meu_pedido(c, u, r['id'])),
                 'chamada': crm.cham_json(crm.cham_acessivel(c, u, cid), crm.nomes_equipa(c, u))}


def limpar_antigos(c):
    c.execute('DELETE FROM pedidos_ligar WHERE criado<?', (B.agora() - 30 * 86400,))

