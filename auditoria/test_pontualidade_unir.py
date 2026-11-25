"""Gravação da pontualidade: a UNIR (GTFS-Realtime da TML) grava a próxima paragem de cada viagem com o atraso face ao horário
(feed "unirh" na base). Mesmo leitor da TUB. Uso: python3 auditoria/test_pontualidade_unir.py"""
import importlib.util, os, sqlite3, sys, tempfile, time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
pasta = tempfile.mkdtemp()
base = os.path.join(pasta, 'gtfs.db')
LIS = ZoneInfo('Europe/Lisbon')
agora = datetime.now(LIS)
meia = datetime(agora.year, agora.month, agora.day, tzinfo=LIS)
seg_hor = int((agora - meia).total_seconds()) + 600  # horário: daqui a 10 min
con = sqlite3.connect(base)
con.execute('CREATE TABLE stop_times (trip_id TEXT, stop_id TEXT, arrival_secs INTEGER)')
con.execute("INSERT INTO stop_times VALUES ('unirh:V1', 'unirh:1234', ?)", (seg_hor,))
con.commit(); con.close()
os.environ['PAROU_GTFS'] = base
sys.argv = ['recolher.py', pasta]
spec = importlib.util.spec_from_file_location('recolher', os.path.join(AQUI, '..', 'pontualidade', 'recolher.py'))
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)

def varint(n):
    o = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        o.append(b | (0x80 if n else 0))
        if not n: return bytes(o)
def campo_v(n, v): return varint(n << 3) + varint(v)
def campo_b(n, b): return varint((n << 3) | 2) + varint(len(b)) + b
def campo_t(n, s): return campo_b(n, s.encode())
prev = int((meia + timedelta(seconds=seg_hor + 180)).timestamp())  # 3 min de atraso
tu = campo_b(1, campo_t(1, 'V1') + campo_t(3, agora.strftime('%Y%m%d')) + campo_t(5, 'L1')) + campo_b(2, campo_v(1, 5) + campo_b(2, campo_v(2, prev)) + campo_t(4, '1234'))
feed = campo_b(1, campo_t(1, '2.0') + campo_v(3, int(time.time()))) + campo_b(2, campo_t(1, 'e1') + campo_b(3, tu))
pedidos = []
R.pedir = lambda url, t=20: (pedidos.append(url), feed)[1]
escritos = []
R.escrever = lambda fonte, reg: escritos.append((fonte, reg))
R.unir()
falhas = 0
def ok(nome, cond, extra=''):
    global falhas
    if not cond: falhas += 1
    print('OK     ' if cond else 'FALHOU ', nome, extra)
ok('pede o GTFS-Realtime da UNIR (TMP, 53JAZ)', pedidos and '53JAZ' in pedidos[0], str(pedidos))
ok('grava na fonte "unir"', escritos and escritos[0][0] == 'unir', str(escritos))
ok('com o atraso face ao horário (3 min)', escritos and escritos[0][1].get('atraso_s') == 180, str(escritos[0][1] if escritos else ''))
R.unir()
ok('a mesma previsão não se grava duas vezes', len(escritos) == 1, str(len(escritos)))
ok('a UNIR tem o seu fio no serviço', "('unir', 60, unir)" in open(os.path.join(AQUI, '..', 'pontualidade', 'recolher.py')).read())
print('\n%d FALHA(S)' % falhas if falhas else '\nTudo OK')
sys.exit(1 if falhas else 0)
