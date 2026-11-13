"""webase: configuração, base de dados e utilitários partilhados pela API."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time

DADOS = os.environ.get('WB_DADOS', '/var/lib/webase-api')
DB = os.path.join(DADOS, 'dados.db')
PORTA = int(os.environ.get('WB_PORTA', '3160'))
DEV = os.environ.get('WB_DEV') == '1'          # só para testes locais em http
ORIGENS = set((os.environ.get('ORIGENS') or 'https://webase.pt https://www.webase.pt').split())
ADMINS = set((os.environ.get('ADMINS') or 'diniscash@gmail.com').lower().split())
# Pagamentos: «desligado» até haver um prestador ligado. Com «teste», as compras pagas só fecham para os ADMINS.
PAGAMENTOS = os.environ.get('WB_PAGAMENTOS', 'desligado')
FUNDADORES = int(os.environ.get('WB_FUNDADORES', '100'))     # lugares com preço de fundador
SESSAO_DIAS = 30
COOKIE = 'wb' if DEV else '__Host-wb'
COMISSAO = 15                                                 # % da webase em cada venda no marketplace


def agora():
    return int(time.time())


def novo_id(n=9):
    return secrets.token_urlsafe(n)


def ligar():
    c = sqlite3.connect(DB, timeout=15, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA busy_timeout=15000')
    return c


ESQUEMA = '''
CREATE TABLE IF NOT EXISTS config(chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contas(
  id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL, setor TEXT NOT NULL DEFAULT 'outro', nif TEXT NOT NULL DEFAULT '', telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', morada TEXT NOT NULL DEFAULT '', localidade TEXT NOT NULL DEFAULT '',
  plano TEXT NOT NULL DEFAULT 'gratis', fundador INTEGER NOT NULL DEFAULT 0,
  modulos TEXT NOT NULL DEFAULT '[]', pontos_euro REAL NOT NULL DEFAULT 1, pontos_boas_vindas INTEGER NOT NULL DEFAULT 0,
  cor TEXT NOT NULL DEFAULT '#2B3FD6', logo TEXT NOT NULL DEFAULT '', fases TEXT NOT NULL DEFAULT '', campos TEXT NOT NULL DEFAULT '[]',
  configurada INTEGER NOT NULL DEFAULT 0, apagada INTEGER NOT NULL DEFAULT 0, criado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS utilizadores(
  id INTEGER PRIMARY KEY AUTOINCREMENT, conta INTEGER NOT NULL REFERENCES contas(id),
  email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, nome TEXT NOT NULL,
  dono INTEGER NOT NULL DEFAULT 0, papel TEXT NOT NULL DEFAULT 'personalizado', perm TEXT NOT NULL DEFAULT '{}',
  ativo INTEGER NOT NULL DEFAULT 1, trocar_senha INTEGER NOT NULL DEFAULT 0, tema TEXT NOT NULL DEFAULT 'auto',
  criado INTEGER NOT NULL, visto INTEGER);
CREATE INDEX IF NOT EXISTS i_util_conta ON utilizadores(conta);
CREATE TABLE IF NOT EXISTS sessoes(hash TEXT PRIMARY KEY, uid INTEGER NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
  criada INTEGER NOT NULL, expira INTEGER NOT NULL, disp TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS i_sessoes_uid ON sessoes(uid);
CREATE TABLE IF NOT EXISTS clientes(
  id TEXT PRIMARY KEY, conta INTEGER NOT NULL REFERENCES contas(id),
  tipo TEXT NOT NULL DEFAULT 'particular', nome TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', telefone TEXT NOT NULL DEFAULT '',
  nif TEXT NOT NULL DEFAULT '', empresa TEXT NOT NULL DEFAULT '', morada TEXT NOT NULL DEFAULT '', localidade TEXT NOT NULL DEFAULT '',
  codpostal TEXT NOT NULL DEFAULT '', nascimento TEXT NOT NULL DEFAULT '', etiquetas TEXT NOT NULL DEFAULT '[]',
  notas TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'ativo', responsavel INTEGER, origem TEXT NOT NULL DEFAULT '',
  consentimento INTEGER NOT NULL DEFAULT 0, consentimento_quando INTEGER, consentimento_como TEXT NOT NULL DEFAULT '',
  pontos INTEGER NOT NULL DEFAULT 0, gasto INTEGER NOT NULL DEFAULT 0, ultima_visita INTEGER, extra TEXT NOT NULL DEFAULT '{}', busca TEXT NOT NULL DEFAULT '',
  criado INTEGER NOT NULL, atualizado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_cli_conta ON clientes(conta, atualizado);
CREATE INDEX IF NOT EXISTS i_cli_resp ON clientes(conta, responsavel);
CREATE INDEX IF NOT EXISTS i_cli_tel ON clientes(conta, telefone);
CREATE INDEX IF NOT EXISTS i_cli_email ON clientes(conta, email);
CREATE TABLE IF NOT EXISTS atividade(id INTEGER PRIMARY KEY AUTOINCREMENT, conta INTEGER NOT NULL, cliente TEXT NOT NULL,
  tipo TEXT NOT NULL, texto TEXT NOT NULL, uid INTEGER, criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_ativ_cli ON atividade(cliente, id);
CREATE TABLE IF NOT EXISTS leads(
  id TEXT PRIMARY KEY, conta INTEGER NOT NULL REFERENCES contas(id), titulo TEXT NOT NULL,
  cliente TEXT REFERENCES clientes(id) ON DELETE SET NULL, contacto TEXT NOT NULL DEFAULT '', telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', empresa TEXT NOT NULL DEFAULT '', valor INTEGER NOT NULL DEFAULT 0,
  fase TEXT NOT NULL DEFAULT 'prospect', origem TEXT NOT NULL DEFAULT '', responsavel INTEGER,
  proximo TEXT NOT NULL DEFAULT '', proximo_quando INTEGER, notas TEXT NOT NULL DEFAULT '',
  ordem REAL NOT NULL DEFAULT 0, criado INTEGER NOT NULL, atualizado INTEGER NOT NULL, fechado INTEGER);
CREATE INDEX IF NOT EXISTS i_leads_conta ON leads(conta, fase);
CREATE TABLE IF NOT EXISTS chamadas(
  id TEXT PRIMARY KEY, conta INTEGER NOT NULL REFERENCES contas(id),
  cliente TEXT REFERENCES clientes(id) ON DELETE SET NULL, lead TEXT REFERENCES leads(id) ON DELETE SET NULL,
  numero TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL DEFAULT '', direcao TEXT NOT NULL, resultado TEXT NOT NULL,
  duracao INTEGER NOT NULL DEFAULT 0, notas TEXT NOT NULL DEFAULT '', quando INTEGER NOT NULL,
  seguimento INTEGER, seguimento_feito INTEGER NOT NULL DEFAULT 0, utilizador INTEGER, criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_cham_conta ON chamadas(conta, quando);
CREATE INDEX IF NOT EXISTS i_cham_seg ON chamadas(conta, seguimento_feito, seguimento);
CREATE TABLE IF NOT EXISTS contratos(
  id TEXT PRIMARY KEY, conta INTEGER NOT NULL REFERENCES contas(id), cliente TEXT REFERENCES clientes(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, referencia TEXT NOT NULL DEFAULT '', valor INTEGER NOT NULL DEFAULT 0,
  periodicidade TEXT NOT NULL DEFAULT 'mensal', inicio TEXT NOT NULL, fim TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'ativo', renovacao INTEGER NOT NULL DEFAULT 0, notas TEXT NOT NULL DEFAULT '',
  responsavel INTEGER, criado INTEGER NOT NULL, atualizado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_contr_conta ON contratos(conta, estado);
CREATE TABLE IF NOT EXISTS pontos(id INTEGER PRIMARY KEY AUTOINCREMENT, conta INTEGER NOT NULL, cliente TEXT NOT NULL
  REFERENCES clientes(id) ON DELETE CASCADE, delta INTEGER NOT NULL, motivo TEXT NOT NULL, valor INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL DEFAULT '', uid INTEGER, criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_pontos_cli ON pontos(cliente, id);
CREATE INDEX IF NOT EXISTS i_pontos_conta ON pontos(conta, criado);
CREATE TABLE IF NOT EXISTS recompensas(id TEXT PRIMARY KEY, conta INTEGER NOT NULL, nome TEXT NOT NULL, custo INTEGER NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1, criado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS produtos(id TEXT PRIMARY KEY, conta INTEGER NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL,
  preco INTEGER NOT NULL DEFAULT 0, periodo TEXT NOT NULL DEFAULT 'mensal', usos INTEGER NOT NULL DEFAULT 0,
  validade INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, criado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS adesoes(id TEXT PRIMARY KEY, conta INTEGER NOT NULL, cliente TEXT NOT NULL REFERENCES clientes(id)
  ON DELETE CASCADE, produto TEXT NOT NULL REFERENCES produtos(id), inicio INTEGER NOT NULL, proxima INTEGER,
  fim INTEGER, usos INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'ativa', criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_ades_conta ON adesoes(conta, estado);
CREATE INDEX IF NOT EXISTS i_ades_cli ON adesoes(cliente);
CREATE TABLE IF NOT EXISTS adesao_usos(id INTEGER PRIMARY KEY AUTOINCREMENT, adesao TEXT NOT NULL REFERENCES adesoes(id)
  ON DELETE CASCADE, tipo TEXT NOT NULL, nota TEXT NOT NULL DEFAULT '', uid INTEGER, criado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mk_anuncios(id TEXT PRIMARY KEY, conta INTEGER NOT NULL REFERENCES contas(id), titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '', setor TEXT NOT NULL DEFAULT 'outro', regiao TEXT NOT NULL DEFAULT '',
  tipo_dados TEXT NOT NULL DEFAULT 'empresas', campos TEXT NOT NULL DEFAULT '[]', preco INTEGER NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 0, declaracao TEXT NOT NULL, declaracao_uid INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ativo', vendas INTEGER NOT NULL DEFAULT 0, criado INTEGER NOT NULL, atualizado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_mk_estado ON mk_anuncios(estado, criado);
CREATE TABLE IF NOT EXISTS mk_itens(anuncio TEXT NOT NULL REFERENCES mk_anuncios(id) ON DELETE CASCADE, dados TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS i_mk_itens ON mk_itens(anuncio);
CREATE TABLE IF NOT EXISTS mk_compras(id TEXT PRIMARY KEY, anuncio TEXT NOT NULL REFERENCES mk_anuncios(id), comprador INTEGER NOT NULL,
  vendedor INTEGER NOT NULL, uid INTEGER NOT NULL, preco INTEGER NOT NULL, comissao INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL, criado INTEGER NOT NULL, fechado INTEGER);
CREATE INDEX IF NOT EXISTS i_mkc_comp ON mk_compras(comprador, criado);
CREATE INDEX IF NOT EXISTS i_mkc_vend ON mk_compras(vendedor, criado);
CREATE TABLE IF NOT EXISTS partilhas(id TEXT PRIMARY KEY, de INTEGER NOT NULL, para INTEGER NOT NULL, titulo TEXT NOT NULL,
  n INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'pendente', uid INTEGER NOT NULL, criado INTEGER NOT NULL, decidido INTEGER);
CREATE INDEX IF NOT EXISTS i_part_para ON partilhas(para, estado);
CREATE TABLE IF NOT EXISTS partilha_itens(partilha TEXT NOT NULL REFERENCES partilhas(id) ON DELETE CASCADE, dados TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS avisos(id INTEGER PRIMARY KEY AUTOINCREMENT, conta INTEGER NOT NULL, tipo TEXT NOT NULL,
  texto TEXT NOT NULL, ligacao TEXT NOT NULL DEFAULT '', lido INTEGER NOT NULL DEFAULT 0, criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_avisos ON avisos(conta, id);
CREATE TABLE IF NOT EXISTS auditoria(id INTEGER PRIMARY KEY AUTOINCREMENT, conta INTEGER, uid INTEGER, acao TEXT NOT NULL,
  alvo TEXT NOT NULL DEFAULT '', detalhe TEXT NOT NULL DEFAULT '', ip_h TEXT, criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS i_aud_conta ON auditoria(conta, id);
CREATE TABLE IF NOT EXISTS forum_topicos(id TEXT PRIMARY KEY, conta INTEGER NOT NULL, uid INTEGER NOT NULL, categoria TEXT NOT NULL,
  titulo TEXT NOT NULL, texto TEXT NOT NULL, respostas INTEGER NOT NULL DEFAULT 0, gostos INTEGER NOT NULL DEFAULT 0,
  fixo INTEGER NOT NULL DEFAULT 0, fechado INTEGER NOT NULL DEFAULT 0, apagado INTEGER NOT NULL DEFAULT 0,
  ultima INTEGER NOT NULL, criado INTEGER NOT NULL, editado INTEGER);
CREATE INDEX IF NOT EXISTS i_ft_ultima ON forum_topicos(apagado, fixo, ultima);
CREATE INDEX IF NOT EXISTS i_ft_cat ON forum_topicos(categoria, apagado, ultima);
CREATE TABLE IF NOT EXISTS forum_respostas(id TEXT PRIMARY KEY, topico TEXT NOT NULL REFERENCES forum_topicos(id), conta INTEGER NOT NULL,
  uid INTEGER NOT NULL, texto TEXT NOT NULL, gostos INTEGER NOT NULL DEFAULT 0, apagado INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL, editado INTEGER);
CREATE INDEX IF NOT EXISTS i_fr_topico ON forum_respostas(topico, criado);
CREATE TABLE IF NOT EXISTS forum_gostos(alvo TEXT NOT NULL, uid INTEGER NOT NULL, criado INTEGER NOT NULL, PRIMARY KEY(alvo, uid));
CREATE TABLE IF NOT EXISTS forum_denuncias(id INTEGER PRIMARY KEY AUTOINCREMENT, alvo TEXT NOT NULL, uid INTEGER NOT NULL, motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'aberta', criado INTEGER NOT NULL, UNIQUE(alvo, uid));
CREATE TABLE IF NOT EXISTS dispositivos(id TEXT PRIMARY KEY, conta INTEGER NOT NULL, utilizador INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '', criado INTEGER NOT NULL, usado INTEGER, falhas INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS i_disp_u ON dispositivos(utilizador);
CREATE TABLE IF NOT EXISTS pedidos_ligar(id TEXT PRIMARY KEY, conta INTEGER NOT NULL, utilizador INTEGER NOT NULL, cliente TEXT,
  numero TEXT NOT NULL, nome TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'pendente', teste INTEGER NOT NULL DEFAULT 0,
  criado INTEGER NOT NULL, aberto INTEGER, chamada TEXT, resultado TEXT, duracao INTEGER);
CREATE INDEX IF NOT EXISTS i_pl_u ON pedidos_ligar(utilizador, estado, criado);
CREATE TABLE IF NOT EXISTS interesse(id INTEGER PRIMARY KEY AUTOINCREMENT, conta INTEGER NOT NULL, plano TEXT NOT NULL, criado INTEGER NOT NULL);
'''


LOGOS = os.path.join(DADOS, 'logos')


def criar():
    os.makedirs(DADOS, exist_ok=True)
    os.makedirs(LOGOS, exist_ok=True)
    c = ligar()
    c.executescript(ESQUEMA)
    if not c.execute("SELECT 1 FROM config WHERE chave='segredo'").fetchone():
        c.execute("INSERT INTO config VALUES('segredo', ?)", (secrets.token_hex(32),))
    c.close()


_segredo = None


def segredo():
    global _segredo
    if _segredo is None:
        c = ligar()
        _segredo = bytes.fromhex(c.execute("SELECT valor FROM config WHERE chave='segredo'").fetchone()[0])
        c.close()
    return _segredo


def hmac_curto(v):
    if not v:
        return None
    return hmac.new(segredo(), v.encode(), hashlib.sha256).hexdigest()[:20]


def sha(t):
    return hashlib.sha256(t.encode()).hexdigest()


# ---------------------------------------------------------------- palavras-passe (scrypt)

def hash_senha(senha):
    sal = secrets.token_bytes(16)
    d = hashlib.scrypt(senha.encode(), salt=sal, n=2 ** 15, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)
    return 'scrypt$15$8$1$%s$%s' % (base64.b64encode(sal).decode(), base64.b64encode(d).decode())


def confere_senha(senha, guardado):
    try:
        _, n, r, p, sal, d = guardado.split('$')
        novo = hashlib.scrypt(senha.encode(), salt=base64.b64decode(sal), n=2 ** int(n), r=int(r), p=int(p),
                              maxmem=64 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(novo, base64.b64decode(d))
    except Exception:
        return False


HASH_FALSO = None


def gastar_tempo(senha):
    """Mesmo custo quando o e-mail não existe (não revela que contas existem)."""
    global HASH_FALSO
    if HASH_FALSO is None:
        HASH_FALSO = hash_senha(secrets.token_hex(8))
    confere_senha(senha, HASH_FALSO)


SENHAS_FRACAS = {'123456789', '1234567890', 'password', 'password1', 'qwertyuiop', 'palavrapasse', 'benfica1904', 'portugal123',
                 '12345678910', 'iloveyou12', 'aaaaaaaaaa', '0123456789', 'abcdefghij', 'passw0rd12', 'webase1234', 'webase.pt',
                 'sporting1906', 'fcporto1893', 'qwerty1234', 'password123'}


def senha_fraca(senha, email):
    if not isinstance(senha, str) or len(senha) < 10 or len(senha) > 128:
        return 'A palavra-passe precisa de ter entre 10 e 128 caracteres.'
    if senha.lower() in SENHAS_FRACAS or len(set(senha)) < 5:
        return 'Essa palavra-passe é demasiado fácil de adivinhar. Junta mais palavras.'
    local = (email or '').split('@')[0].lower()
    if len(local) >= 4 and local in senha.lower():
        return 'Não uses o teu e-mail na palavra-passe.'
    return ''


def senha_temporaria():
    """Palavra-passe inicial de um membro da equipa (mostrada uma vez a quem a cria)."""
    alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789'
    return '-'.join(''.join(secrets.choice(alfabeto) for _ in range(4)) for _ in range(3))


def codigo_conta():
    alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    return 'WB-' + ''.join(secrets.choice(alfabeto) for _ in range(6))


# ---------------------------------------------------------------- limites de pedidos (em memória)

_bloq = threading.Lock()
_contagens = {}


def limite(chave, n, janela):
    """True se ainda cabe (e conta este pedido); False se passou o limite."""
    t = time.time()
    with _bloq:
        l = [x for x in _contagens.get(chave, ()) if t - x < janela]
        if len(l) >= n:
            _contagens[chave] = l
            return False
        l.append(t)
        _contagens[chave] = l
        if len(_contagens) > 100000:
            _contagens.clear()
        return True


def json_bytes(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':')).encode()
