#!/usr/bin/env python3
"""ganhas.pt: API das partilhas anónimas de salários.

Só biblioteca padrão (http.server + sqlite3). Corre em 127.0.0.1, atrás do Caddy (que trata do HTTPS).

Configuração (variáveis de ambiente, em /etc/ganhas/api.env, fora do repositório):
  GANHAS_DB      base de dados (por omissão /var/lib/ganhas-api/dados.db)
  GANHAS_PORTA   porta local (por omissão 3140)
  ORIGENS        origens aceites nos POST, separadas por espaços
  POW_BITS       dificuldade da prova de trabalho (por omissão 17; sobe sozinha se houver enxurrada)

Privacidade: não se guarda o IP nem cookies. O limite de pedidos usa um hash do IP com sal que muda todos os
dias (ao fim de 2 dias é apagado); a partilha guarda só um hash do mesmo dia (serve para contar pessoas
diferentes numa empresa, nunca para seguir alguém de um dia para o outro).

Proteções: prova de trabalho assinada (HMAC) e de uso único; campo-isco; tempo mínimo de preenchimento;
limites por IP-dia e por dispositivo; teto global por hora; só JSON, até 8 KB, de uma origem aceite;
validação de todos os campos no servidor; valores fora do plausível ficam marcados e não entram nas contas;
os números públicos usam só partilhas com mais de 24 h, n ≥ 5 pessoas diferentes e valores arredondados.
"""
import hashlib, hmac, json, math, os, re, secrets, sqlite3, sys, threading, time, unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

AQUI = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get('GANHAS_DB', '/var/lib/ganhas-api/dados.db')
PORTA = int(os.environ.get('GANHAS_PORTA', '3140'))
ORIGENS = set((os.environ.get('ORIGENS') or 'https://ganhas.pt https://www.ganhas.pt').split())
POW_BITS_BASE = int(os.environ.get('POW_BITS', '17'))
MAX_CORPO = 8 * 1024
K_MIN = 5                   # pessoas diferentes antes de mostrar qualquer número da comunidade
ATRASO_PUBLICO = 24 * 3600  # uma partilha só entra nos números públicos ao fim de 24 h
TETO_HORA = 400             # partilhas por hora no site todo antes de endurecer a prova de trabalho
SALARIO_MIN, SALARIO_MAX = 200, 40000  # € brutos por mês aceites (fora disto é recusado)

with open(os.path.join(AQUI, 'catalogo.json'), encoding='utf-8') as f:
    CATALOGO = json.load(f)
PROFISSOES = {p['id']: p for p in CATALOGO['profissoes']}
DISTRITOS = {d['id']: d for d in CATALOGO['distritos']}
CONTRATOS = {'efetivo', 'termo', 'temporario', 'recibos', 'estagio', 'outro'}
EXPERIENCIA = {'0-2', '3-5', '6-10', '11-20', '21+'}
GENEROS = {'', 'mulher', 'homem', 'outro'}
SMN_FIXO = CATALOGO.get('salario_minimo', 920)
try:
    with open(os.path.join(AQUI, 'dados', 'oficial.json'), encoding='utf-8') as _f:
        SMN_ANOS = {int(a): v for a, v in json.load(_f).get('smn', {}).items()}
except Exception:  # noqa: BLE001
    SMN_ANOS = {}


def smn():
    """Salário mínimo em vigor hoje (muda sozinho a 1 de janeiro, com os valores de dados/oficial.json)."""
    ano = time.localtime().tm_year
    anos = [a for a in SMN_ANOS if a <= ano]
    return SMN_ANOS[max(anos)] if anos else SMN_FIXO

_bloqueio = threading.Lock()
_limites = {}  # chave -> [instantes]


# ---------- base de dados ----------

def ligar():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=15, isolation_level=None)
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA busy_timeout=15000')
    return c


def preparar():
    c = ligar()
    c.executescript('''
    CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS partilhas (
      id INTEGER PRIMARY KEY,
      criado INTEGER NOT NULL,
      profissao TEXT NOT NULL,
      distrito TEXT NOT NULL,
      empresa TEXT,              -- nome normalizado para mostrar
      empresa_id TEXT,           -- forma de comparação (slug)
      bruto_mes REAL NOT NULL,   -- € brutos por mês, base 14 meses
      horas INTEGER NOT NULL,
      contrato TEXT NOT NULL,
      experiencia TEXT NOT NULL,
      genero TEXT NOT NULL DEFAULT '',
      subsidio_dia REAL,
      dispositivo TEXT NOT NULL, -- hash de um identificador aleatório do navegador
      ip_dia TEXT NOT NULL,      -- hash do IP com o sal desse dia
      estado TEXT NOT NULL DEFAULT 'ok'  -- ok | suspeito | removido
    );
    CREATE INDEX IF NOT EXISTS partilhas_prof ON partilhas (profissao, estado, criado);
    CREATE INDEX IF NOT EXISTS partilhas_emp ON partilhas (empresa_id, estado, criado);
    CREATE UNIQUE INDEX IF NOT EXISTS partilhas_unica ON partilhas (dispositivo, profissao, IFNULL(empresa_id, ''));
    CREATE TABLE IF NOT EXISTS desafios_usados (id TEXT PRIMARY KEY, expira INTEGER NOT NULL);
    ''')
    if not c.execute("SELECT 1 FROM config WHERE chave='segredo'").fetchone():
        c.execute("INSERT INTO config VALUES ('segredo', ?)", (secrets.token_hex(32),))
    c.close()


def segredo():
    c = ligar()
    s = c.execute("SELECT valor FROM config WHERE chave='segredo'").fetchone()[0]
    c.close()
    return s.encode()


# ---------- utilidades ----------

def sal_do_dia(dia=None):
    dia = dia or time.strftime('%Y-%m-%d', time.gmtime())
    return hmac.new(SEGREDO, ('dia:' + dia).encode(), hashlib.sha256).digest()


def hash_ip(ip):
    return hmac.new(sal_do_dia(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def hash_disp(d):
    return hmac.new(SEGREDO, ('disp:' + d).encode(), hashlib.sha256).hexdigest()[:32]


def limite(chave, maximo, janela):
    """True se ainda cabe (e regista), False se passou o limite."""
    agora = time.time()
    with _bloqueio:
        lst = [t for t in _limites.get(chave, []) if agora - t < janela]
        if len(lst) >= maximo:
            _limites[chave] = lst
            return False
        lst.append(agora)
        _limites[chave] = lst
        if len(_limites) > 50000:  # limpeza
            for k in list(_limites)[:10000]:
                if not any(agora - t < 86400 for t in _limites[k]):
                    del _limites[k]
        return True


def contar_hora():
    agora = time.time()
    with _bloqueio:
        lst = [t for t in _limites.get('__global__', []) if agora - t < 3600]
        _limites['__global__'] = lst
        return len(lst)


def bits_atuais():
    n = contar_hora()
    if n > TETO_HORA * 2:
        return POW_BITS_BASE + 3
    if n > TETO_HORA:
        return POW_BITS_BASE + 2
    return POW_BITS_BASE


SUFIXOS = re.compile(r'\b(s\.?\s?a\.?|lda\.?|limitada|unipessoal|sgps|s\.?\s?g\.?\s?p\.?\s?s\.?|portugal|pt)\b\.?', re.I)
PROIBIDO = re.compile(r'(https?://|www\.|@|\d{6,}|<|>|\{|\}|\\)', re.I)
PALAVROES = {'merda', 'caralho', 'foda', 'puta', 'cona', 'piça', 'pila', 'cabrao', 'cabrão', 'fdp', 'paneleiro',
             'corno', 'otario', 'otário', 'chulo', 'ladroes', 'ladrões', 'escravos', 'escravatura', 'nazi', 'scam', 'burla'}


def sem_acentos(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))


def normalizar_empresa(nome):
    """Devolve (nome_para_mostrar, id) ou (None, None) se o nome não for aceitável."""
    nome = re.sub(r'\s+', ' ', (nome or '').strip())[:80]
    if not nome:
        return None, None
    if PROIBIDO.search(nome) or len(nome) < 2:
        return None, None
    base = sem_acentos(nome.lower())
    palavras = set(re.findall(r'[a-z]+', base))
    if palavras & {sem_acentos(p) for p in PALAVROES}:
        return None, None
    if not re.search(r'[a-zA-ZÀ-ÿ]', nome):
        return None, None
    ident = SUFIXOS.sub(' ', base)
    ident = re.sub(r'[^a-z0-9]+', '-', ident).strip('-')
    if not ident:
        return None, None
    for e in CATALOGO.get('empresas', []):
        if ident == e['id'] or ident in e.get('outros', []):
            return e['nome'], e['id']
    mostrar = ' '.join(w if w.isupper() and len(w) <= 5 else (w[:1].upper() + w[1:]) for w in nome.split(' '))
    return mostrar, ident


def quantil(ordenados, q):
    if not ordenados:
        return None
    pos = (len(ordenados) - 1) * q
    a, b = math.floor(pos), math.ceil(pos)
    return ordenados[a] + (ordenados[b] - ordenados[a]) * (pos - a)


def arred(v, passo=10):
    return int(round(v / passo) * passo) if v is not None else None


def resumo(c, onde, args):
    limiar = int(time.time()) - ATRASO_PUBLICO
    linhas = c.execute(f"SELECT bruto_mes * 40.0 / horas, ip_dia, dispositivo FROM partilhas WHERE estado='ok' "
                       f"AND criado < ? AND {onde}", [limiar] + list(args)).fetchall()
    pessoas = len({(r[1], r[2]) for r in linhas})
    ips = len({r[1] for r in linhas})
    n = min(pessoas, ips)
    if n < K_MIN:
        return {'n': n, 'faltam': K_MIN - n}
    v = sorted(r[0] for r in linhas)
    return {'n': n, 'p25': arred(quantil(v, .25)), 'mediana': arred(quantil(v, .5)), 'p75': arred(quantil(v, .75))}


# ---------- validação ----------

def num(v, a, b):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x) or x < a or x > b:
        return None
    return x


def validar_pow(d, nonce):
    try:
        ident, sal, bits, expira, ass = str(d['id']), str(d['sal']), int(d['bits']), int(d['expira']), str(d['assinatura'])
    except (KeyError, TypeError, ValueError):
        return 'desafio'
    if not (re.fullmatch(r'[0-9a-f]{32}', ident) and re.fullmatch(r'[0-9a-f]{32}', sal)):
        return 'desafio'
    certo = hmac.new(SEGREDO, f'{ident}|{sal}|{bits}|{expira}'.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(certo, ass):
        return 'desafio'
    if expira < time.time():
        return 'expirado'
    if not re.fullmatch(r'[0-9]{1,12}', str(nonce)):
        return 'prova'
    h = hashlib.sha256(f'{sal}:{nonce}'.encode()).digest()
    if int.from_bytes(h, 'big') >> (256 - bits) != 0:
        return 'prova'
    c = ligar()
    try:
        c.execute('DELETE FROM desafios_usados WHERE expira < ?', (int(time.time()),))
        c.execute('INSERT INTO desafios_usados VALUES (?, ?)', (ident, expira))
    except sqlite3.IntegrityError:
        return 'repetido'
    finally:
        c.close()
    return None


def avaliar(bruto40, profissao):
    """Marca como suspeito o que é pouco plausível (fica guardado, mas não conta)."""
    if bruto40 < smn() * 0.75:
        return 'suspeito'
    ref = PROFISSOES.get(profissao, {}).get('ganho_grupo')
    if bruto40 > 15000 or (ref and bruto40 > ref * 6):
        return 'suspeito'
    return 'ok'


# ---------- servidor ----------

class Pedido(BaseHTTPRequestHandler):
    server_version = 'ganhas'
    sys_version = ''

    def log_message(self, *a):
        pass

    def ip(self):
        return (self.headers.get('X-Real-IP') or self.client_address[0] or '')[:64]

    def responder(self, codigo, corpo, cache='no-store'):
        dados = json.dumps(corpo, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(dados)))
        self.send_header('Cache-Control', cache)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0][:120] for k, v in parse_qs(u.query).items()}
        ip = hash_ip(self.ip())
        if not limite('get:' + ip, 240, 600):
            return self.responder(429, {'erro': 'Demasiados pedidos. Tenta daqui a uns minutos.'})
        if u.path == '/api/desafio':
            bits = bits_atuais()
            ident, sal, expira = secrets.token_hex(16), secrets.token_hex(16), int(time.time()) + 1800
            ass = hmac.new(SEGREDO, f'{ident}|{sal}|{bits}|{expira}'.encode(), hashlib.sha256).hexdigest()
            return self.responder(200, {'id': ident, 'sal': sal, 'bits': bits, 'expira': expira, 'assinatura': ass})
        if u.path == '/api/resumo':
            c = ligar()
            try:
                prof, dist, emp = q.get('profissao', ''), q.get('distrito', ''), q.get('empresa', '')
                if prof and prof not in PROFISSOES:
                    return self.responder(400, {'erro': 'Profissão desconhecida.'})
                if dist and dist not in DISTRITOS:
                    return self.responder(400, {'erro': 'Distrito desconhecido.'})
                if emp and not re.fullmatch(r'[a-z0-9-]{1,80}', emp):
                    return self.responder(400, {'erro': 'Empresa inválida.'})
                onde, args = ['1=1'], []
                if prof:
                    onde.append('profissao=?'); args.append(prof)
                if dist:
                    onde.append('distrito=?'); args.append(dist)
                if emp:
                    onde.append('empresa_id=?'); args.append(emp)
                if not (prof or emp):
                    return self.responder(400, {'erro': 'Indica a profissão ou a empresa.'})
                return self.responder(200, resumo(c, ' AND '.join(onde), args), cache='public, max-age=600')
            finally:
                c.close()
        if u.path == '/api/estado':
            c = ligar()
            try:
                total = c.execute("SELECT COUNT(*) FROM partilhas WHERE estado='ok'").fetchone()[0]
                return self.responder(200, {'partilhas': total}, cache='public, max-age=120')
            finally:
                c.close()
        if u.path == '/api/saude':
            return self.responder(200, {'ok': True})
        return self.responder(404, {'erro': 'Não existe.'})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path not in ('/api/partilhar', '/api/apagar'):
            return self.responder(404, {'erro': 'Não existe.'})
        origem = self.headers.get('Origin', '')
        if origem not in ORIGENS:
            return self.responder(403, {'erro': 'Origem não autorizada.'})
        if 'application/json' not in (self.headers.get('Content-Type') or ''):
            return self.responder(415, {'erro': 'Só JSON.'})
        try:
            tam = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            tam = 0
        if tam <= 0 or tam > MAX_CORPO:
            return self.responder(413, {'erro': 'Pedido demasiado grande.'})
        try:
            d = json.loads(self.rfile.read(tam))
            assert isinstance(d, dict)
        except Exception:  # noqa: BLE001
            return self.responder(400, {'erro': 'Pedido inválido.'})

        ip = hash_ip(self.ip())
        if u.path == '/api/apagar':
            disp = str(d.get('dispositivo', ''))
            if not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', disp) or not limite('apagar:' + ip, 10, 3600):
                return self.responder(400, {'erro': 'Não foi possível apagar.'})
            c = ligar()
            try:
                n = c.execute('DELETE FROM partilhas WHERE dispositivo=?', (hash_disp(disp),)).rowcount
            finally:
                c.close()
            return self.responder(200, {'ok': True, 'apagadas': n})
        # isco e tempo: um robô preenche tudo e depressa
        if d.get('site') or (num(d.get('t'), 0, 86400000) or 0) < 4000:
            return self.responder(200, {'ok': True, 'publicado': False})
        if not limite('tentativa:' + ip, 20, 600):
            return self.responder(429, {'erro': 'Demasiadas tentativas. Espera uns minutos e tenta outra vez.'})
        erro = validar_pow(d.get('desafio') or {}, d.get('nonce'))
        if erro:
            msg = {'expirado': 'O formulário esteve aberto muito tempo. Tenta outra vez.',
                   'repetido': 'Este envio já foi feito.'}.get(erro, 'Não foi possível confirmar o envio. Tenta outra vez.')
            return self.responder(400, {'erro': msg, 'codigo': erro})

        prof = str(d.get('profissao', ''))
        dist = str(d.get('distrito', ''))
        contrato = str(d.get('contrato', ''))
        exp = str(d.get('experiencia', ''))
        genero = str(d.get('genero', '') or '')
        disp = str(d.get('dispositivo', ''))
        bruto = num(d.get('bruto'), SALARIO_MIN, SALARIO_MAX * 14)
        periodo = d.get('periodo', 'mes')
        meses = int(num(d.get('meses'), 12, 14) or 14)
        horas = int(num(d.get('horas'), 10, 60) or 40)
        subs = num(d.get('subsidio_dia'), 0, 40)
        erros = {}
        if prof not in PROFISSOES:
            erros['profissao'] = 'Escolhe a profissão na lista.'
        if dist not in DISTRITOS:
            erros['distrito'] = 'Escolhe o distrito.'
        if contrato not in CONTRATOS:
            erros['contrato'] = 'Escolhe o tipo de contrato.'
        if exp not in EXPERIENCIA:
            erros['experiencia'] = 'Escolhe os anos de experiência.'
        if genero not in GENEROS:
            erros['genero'] = 'Valor inválido.'
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', disp):
            erros['dispositivo'] = 'Recarrega a página e tenta outra vez.'
        if bruto is None or periodo not in ('mes', 'ano'):
            erros['bruto'] = 'Escreve o salário bruto (antes de descontos).'
        if erros:
            return self.responder(422, {'erro': 'Revê os campos marcados.', 'campos': erros})

        bruto_mes = bruto if periodo == 'mes' else bruto / meses
        if periodo == 'mes' and meses == 12:
            bruto_mes = bruto * 12 / 14  # quem recebe em 12 meses (duodécimos) passa à base de 14
        if not (SALARIO_MIN <= bruto_mes <= SALARIO_MAX):
            return self.responder(422, {'erro': 'Esse valor não parece um salário mensal bruto.',
                                        'campos': {'bruto': 'Confirma o valor e se é por mês ou por ano.'}})
        emp_nome, emp_id = normalizar_empresa(d.get('empresa', ''))
        if d.get('empresa') and not emp_id:
            return self.responder(422, {'erro': 'O nome da empresa não foi aceite.',
                                        'campos': {'empresa': 'Escreve só o nome da empresa, sem ligações nem comentários.'}})
        bruto40 = bruto_mes * 40 / horas
        estado = avaliar(bruto40, prof)
        if not limite('post10:' + ip, 3, 600) or not limite('postdia:' + ip, 6, 86400):
            return self.responder(429, {'erro': 'Já partilhaste há pouco. Volta mais tarde.'})
        limite('__global__', 10 ** 9, 3600)
        c = ligar()
        try:
            c.execute('''INSERT INTO partilhas (criado, profissao, distrito, empresa, empresa_id, bruto_mes, horas, contrato,
                           experiencia, genero, subsidio_dia, dispositivo, ip_dia, estado)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                         ON CONFLICT (dispositivo, profissao, IFNULL(empresa_id, '')) DO UPDATE SET
                           criado=excluded.criado, distrito=excluded.distrito, bruto_mes=excluded.bruto_mes,
                           horas=excluded.horas, contrato=excluded.contrato, experiencia=excluded.experiencia,
                           genero=excluded.genero, subsidio_dia=excluded.subsidio_dia, ip_dia=excluded.ip_dia,
                           estado=excluded.estado''',
                      (int(time.time()), prof, dist, emp_nome, emp_id, round(bruto_mes, 2), horas, contrato, exp, genero,
                       subs, hash_disp(disp), ip, estado))
            comunidade = resumo(c, 'profissao=?', [prof])
        finally:
            c.close()
        return self.responder(200, {'ok': True, 'publicado': estado == 'ok', 'comunidade': comunidade,
                                    'empresa': emp_nome})


def main():
    global SEGREDO
    preparar()
    SEGREDO = segredo()
    srv = ThreadingHTTPServer(('127.0.0.1', PORTA), Pedido)
    srv.daemon_threads = True
    print(f'ganhas API em 127.0.0.1:{PORTA}', flush=True)
    srv.serve_forever()


SEGREDO = b''
if __name__ == '__main__':
    main()
