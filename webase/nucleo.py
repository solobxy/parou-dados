"""webase: peças comuns às rotas (erros, registo de rotas, validação de campos, acesso por conta)."""
import json
import re
import time
import unicodedata
from datetime import datetime

import base as B
import perm as P

try:
    from zoneinfo import ZoneInfo
    LISBOA = ZoneInfo('Europe/Lisbon')
except Exception:          # sem base de fusos: usa a hora local do servidor (TZ=Europe/Lisbon no serviço)
    LISBOA = None

DIA = 86400
RE_EMAIL = re.compile(r'^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[A-Za-z]{2,24}$')
RE_ID = r'([A-Za-z0-9_-]{12})'
POR_PAGINA = 50
MAX_CLIENTES = 50000
MAX_UTILIZADORES = 25


class Erro(Exception):
    def __init__(self, estado, msg, **extra):
        super().__init__(msg)
        self.estado, self.msg, self.extra = estado, msg, extra


def precisa(cond, msg='Pedido inválido.', estado=400, **extra):
    if not cond:
        raise Erro(estado, msg, **extra)


ROTAS = []


def rota(metodo, padrao, conta=True, modulo=None, acao='v', extra=None, limite=64 * 1024):
    """Regista uma rota. Com «modulo», o servidor confirma que o módulo está ligado e que a pessoa tem a ação."""
    def dec(f):
        ROTAS.append((metodo, re.compile('^' + padrao + '$'), f, conta, modulo, acao, extra, limite))
        return f
    return dec


# ---------------------------------------------------------------- texto e campos

def limpo(v, maximo, linhas=False):
    if v is None:
        return ''
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        v = str(v)
    if not isinstance(v, str):
        raise Erro(400, 'Pedido inválido.')
    v = unicodedata.normalize('NFC', v).replace('\t', ' ')
    # tira caracteres de controlo (mantém mudanças de linha onde se pede)
    v = ''.join(ch for ch in v if ch in ('\n', '\t') and linhas or unicodedata.category(ch)[0] != 'C')
    v = v.replace('\r', '')
    if not linhas:
        v = ' '.join(v.split())
    else:
        v = re.sub(r'\n{3,}', '\n\n', v).strip()
    precisa(len(v) <= maximo, 'Texto demasiado longo (máximo %d caracteres).' % maximo)
    return v


def campo(d, k, maximo, obrig=False, nome=None, linhas=False):
    v = limpo(d.get(k), maximo, linhas)
    if obrig:
        precisa(v, 'Falta preencher: %s.' % (nome or k), campo=k)
    return v


def email_ok(v, obrig=False):
    v = (v or '').strip().lower()
    if not v and not obrig:
        return ''
    precisa(RE_EMAIL.match(v) and len(v) <= 254, 'Esse e-mail não parece certo. Confirma se tem @ e domínio.', campo='email')
    return v


def telefone_ok(v):
    v = limpo(v, 40)
    if not v:
        return ''
    so = re.sub(r'[\s().-]', '', v)
    precisa(re.fullmatch(r'\+?[0-9]{6,15}', so), 'O telefone só pode ter números (e o + do indicativo).', campo='telefone')
    pt = re.fullmatch(r'(?:\+|00)351([0-9]{9})', so)      # +351 912 345 678 e 912 345 678 são o mesmo número
    return pt.group(1) if pt else so


def nif_ok(v):
    v = re.sub(r'\s', '', limpo(v, 20))
    if not v:
        return ''
    if re.fullmatch(r'[0-9]{9}', v):
        soma = sum(int(v[i]) * (9 - i) for i in range(8))
        ctrl = 11 - soma % 11
        ctrl = 0 if ctrl >= 10 else ctrl
        precisa(ctrl == int(v[8]), 'O NIF não está certo. Confirma os 9 algarismos.', campo='nif')
        return v
    precisa(re.fullmatch(r'[A-Za-z]{2}[A-Za-z0-9]{2,18}', v), 'O NIF tem 9 algarismos (ou o código do país, se for estrangeiro).', campo='nif')
    return v.upper()


def euros_para_centimos(v, campo_nome='valor', maximo=10_000_000):
    if v in (None, ''):
        return 0
    if isinstance(v, str):
        v = v.replace('€', '').replace(' ', '').replace(' ', '').replace(' ', '')
        if ',' in v:
            v = v.replace('.', '').replace(',', '.')
        elif re.fullmatch(r'[0-9]{1,3}(\.[0-9]{3})+', v):      # «1.250» em Portugal é mil duzentos e cinquenta
            v = v.replace('.', '')
        try:
            v = float(v)
        except ValueError:
            raise Erro(400, 'O valor tem de ser um número (ex.: 12,50).', campo=campo_nome)
    precisa(isinstance(v, (int, float)) and not isinstance(v, bool), 'O valor tem de ser um número.', campo=campo_nome)
    precisa(0 <= v <= maximo, 'O valor tem de estar entre 0 e %d €.' % maximo, campo=campo_nome)
    return int(round(v * 100))


def inteiro(v, minimo, maximo, nome='valor'):
    if isinstance(v, str) and re.fullmatch(r'-?[0-9]{1,9}', v.strip()):
        v = int(v.strip())
    precisa(isinstance(v, int) and not isinstance(v, bool) and minimo <= v <= maximo,
            'O número tem de estar entre %d e %d.' % (minimo, maximo), campo=nome)
    return v


def data_ok(v, obrig=False, nome='data'):
    v = (v or '').strip() if isinstance(v, str) else ''
    if not v:
        precisa(not obrig, 'Falta a data.', campo=nome)
        return ''
    try:
        datetime.strptime(v, '%Y-%m-%d')
    except ValueError:
        raise Erro(400, 'Data inválida.', campo=nome)
    precisa('1900-01-01' <= v <= '2200-12-31', 'Data fora do intervalo.', campo=nome)
    return v


def momento_ok(v, obrig=False, nome='quando'):
    """Aceita 'AAAA-MM-DDTHH:MM' (hora de Lisboa) ou um número (segundos). Devolve segundos."""
    if v in (None, ''):
        precisa(not obrig, 'Falta a data e a hora.', campo=nome)
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        precisa(946684800 <= v <= 7258118400, 'Data inválida.', campo=nome)
        return int(v)
    precisa(isinstance(v, str), 'Data inválida.', campo=nome)
    try:
        dt = datetime.strptime(v.strip()[:16], '%Y-%m-%dT%H:%M')
    except ValueError:
        raise Erro(400, 'Data inválida.', campo=nome)
    if LISBOA:
        return int(dt.replace(tzinfo=LISBOA).timestamp())
    return int(time.mktime(dt.timetuple()))


def hoje_lisboa():
    if LISBOA:
        return datetime.now(LISBOA)
    return datetime.now()


def inicio_do_dia(dt=None):
    dt = dt or hoje_lisboa()
    d0 = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(d0.timestamp())


def etiquetas_ok(v):
    if v in (None, ''):
        return []
    if isinstance(v, str):
        v = v.split(',')
    precisa(isinstance(v, list) and len(v) <= 15, 'No máximo 15 etiquetas.')
    out = []
    for e in v:
        e = limpo(e, 30).strip().lower()
        if e and e not in out:
            out.append(e)
    return out


def normalizar(s):
    """Para pesquisa sem acentos nem maiúsculas: «João» encontra-se com «joao»."""
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()


def like(q):
    return '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'


def jl(v, defeito):
    try:
        r = json.loads(v) if v else defeito
    except ValueError:
        return defeito
    return r if isinstance(r, type(defeito)) else defeito


def mascarar_nome(n):
    partes = [p for p in (n or '').split() if p]
    return ' '.join(p[0] + '***' for p in partes[:3]) or '***'


def mascarar_email(e):
    if not e or '@' not in e:
        return ''
    local, dom = e.split('@', 1)
    return local[:1] + '***@' + dom


def mascarar_tel(t):
    so = re.sub(r'\D', '', t or '')
    if len(so) < 6:
        return ''
    return so[:2] + '*' * (len(so) - 3) + so[-1]


# ---------------------------------------------------------------- registo e auditoria

def auditar(h, c, u, acao, alvo='', detalhe=''):
    c.execute('INSERT INTO auditoria(conta, uid, acao, alvo, detalhe, ip_h, criado) VALUES(?,?,?,?,?,?,?)',
              (u['conta'] if u else None, u['id'] if u else None, acao, str(alvo)[:80], str(detalhe)[:300],
               getattr(h, 'ip_h', None), B.agora()))


def atividade(c, u, cliente, tipo, texto):
    if not cliente:
        return
    c.execute('INSERT INTO atividade(conta, cliente, tipo, texto, uid, criado) VALUES(?,?,?,?,?,?)',
              (u['conta'], cliente, tipo, texto[:400], u['id'], B.agora()))


def avisar(c, conta, tipo, texto, ligacao=''):
    c.execute('INSERT INTO avisos(conta, tipo, texto, ligacao, criado) VALUES(?,?,?,?,?)',
              (conta, tipo, texto[:300], ligacao[:200], B.agora()))


# ---------------------------------------------------------------- acesso aos registos

def conta_de(c, u):
    return c.execute('SELECT * FROM contas WHERE id=?', (u['conta'],)).fetchone()


def exige(u, conta, mod, acao='v'):
    if not P.pode(u, conta, mod, acao):
        if mod not in P.modulos_conta(conta):
            raise Erro(403, 'Este módulo está desligado na tua conta. Liga-o em Definições → Módulos.', modulo=mod)
        raise Erro(403, 'Não tens permissão para isto. Pede a quem gere a conta.')


def exige_x(u, extra):
    precisa(P.pode_x(u, extra), 'Não tens permissão para isto. Pede a quem gere a conta.', 403)


def filtro_ambito(u, coluna='responsavel', alias=''):
    """Fragmento SQL que limita aos registos da própria pessoa quando o âmbito é «só os meus»."""
    if P.so_meus(u):
        return ' AND %s%s=%d' % (alias, coluna, int(u['id']))
    return ''


def cliente_acessivel(c, u, cid, para='v'):
    precisa(isinstance(cid, str) and re.fullmatch(r'[A-Za-z0-9_-]{8,24}', cid), 'Cliente não encontrado.', 404)
    r = c.execute('SELECT * FROM clientes WHERE id=? AND conta=?' + filtro_ambito(u), (cid, u['conta'])).fetchone()
    precisa(r, 'Cliente não encontrado.', 404)
    return r


def nome_utilizador(c, uid):
    if not uid:
        return ''
    r = c.execute('SELECT nome FROM utilizadores WHERE id=?', (uid,)).fetchone()
    return r['nome'] if r else ''


def utilizador_da_conta(c, u, uid):
    """Confirma que um responsável indicado é da mesma conta (e ativo)."""
    if uid in (None, '', 0):
        return None
    uid = inteiro(uid, 1, 10 ** 9, 'responsavel')
    r = c.execute('SELECT id FROM utilizadores WHERE id=? AND conta=? AND ativo=1', (uid, u['conta'])).fetchone()
    precisa(r, 'Essa pessoa não é da tua equipa.', campo='responsavel')
    return uid


def responsavel_para(c, u, d):
    """Quem só vê os seus registos fica sempre como responsável do que cria."""
    if P.so_meus(u):
        return u['id']
    if 'responsavel' in d:
        return utilizador_da_conta(c, u, d.get('responsavel'))
    return u['id']
