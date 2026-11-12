#!/usr/bin/env python3
"""PAROU - gravação contínua do tempo real dos autocarros (pontualidade, autocarros sem GPS, autocarros colados).

Corre como serviço próprio (parou-pontualidade.service), separado da app: não toca no site nem na sua memória.
Só lê fontes públicas que a app já usa, com pausas largas:
  Carris Metropolitana  /v2/vehicles (todos os autocarros num só pedido)      de 30 em 30 s
  TUB (Braga)           GTFS-Realtime trip_updates (um ficheiro)              de 60 em 60 s
  STCP (Porto)          stcp.pt, chegadas de 40 paragens de referência        de 5 em 5 min, 06h-01h30
Grava tudo em bruto em <pasta>/bruto/AAAA-MM-DD/<fonte>.jsonl (um registo por mudança, não por pedido) e,
para a Carris Metropolitana e a TUB, junta logo o atraso em segundos, calculado com a base de horários da app
(/var/lib/parou/gtfs.db, só leitura). O resumo diário é feito pelo resumir.py.
"""
import gzip, json, os, sqlite3, sys, threading, time, traceback, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

PASTA = sys.argv[1] if len(sys.argv) > 1 else '/var/lib/parou-pontualidade'
BASE = os.environ.get('PAROU_GTFS', '/var/lib/parou/gtfs.db')
AQUI = os.path.dirname(os.path.abspath(__file__))
LIS = ZoneInfo('Europe/Lisbon')
UA = {'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)', 'Accept': 'application/json', 'Accept-Encoding': 'gzip'}
STCP = json.load(open(os.path.join(AQUI, 'paragens.json')))['stcp']


def pedir(url, t=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=t) as r:
        corpo = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            corpo = gzip.decompress(corpo)
        return corpo


# ---------- ficheiros do dia (o dia é o de Lisboa)
abertos = {}
contagem = {}
trinco = threading.Lock()

def escrever(fonte, reg):
    with trinco:
        _escrever(fonte, reg)

def _escrever(fonte, reg):
    dia = datetime.now(LIS).strftime('%Y-%m-%d')
    chave = (dia, fonte)
    f = abertos.get(chave)
    if f is None:
        for k in [k for k in abertos if k[0] != dia]:
            abertos.pop(k).close()
        os.makedirs(os.path.join(PASTA, 'bruto', dia), exist_ok=True)
        f = abertos[chave] = open(os.path.join(PASTA, 'bruto', dia, fonte + '.jsonl'), 'a', buffering=1 << 16)
    f.write(json.dumps(reg, separators=(',', ':'), ensure_ascii=False) + '\n')
    contagem[chave] = contagem.get(chave, 0) + 1

def erro(fonte, e):
    escrever('erros', {'t': int(time.time()), 'fonte': fonte, 'erro': str(e)[:300]})


# ---------- horários (para o atraso): base da app em só leitura, reaberta de hora a hora
_bd = {'con': None, 'aberta': 0}
_cache = {}

def bd():
    if _bd['con'] is None or time.time() - _bd['aberta'] > 3600:
        try:
            if _bd['con'] is not None:
                _bd['con'].close()
            _bd['con'] = sqlite3.connect(f'file:{BASE}?mode=ro', uri=True, timeout=5, check_same_thread=False)
            _bd['aberta'] = time.time()
            _cache.clear()
        except Exception as e:
            _bd['con'] = None
            erro('base', e)
    return _bd['con']

_trinco_bd = threading.Lock()

def horario(trip_id):
    with _trinco_bd:
        return _horario(trip_id)

def _horario(trip_id):
    """{stop_id: [segundos desde a meia-noite, ...]} de uma viagem (com cache)."""
    if trip_id in _cache:
        return _cache[trip_id]
    h = {}
    con = bd()
    if con is not None:
        try:
            for stop, seg in con.execute('SELECT stop_id, arrival_secs FROM stop_times WHERE trip_id = ?', (trip_id,)):
                if seg is not None:
                    h.setdefault(stop, []).append(seg)
        except Exception as e:
            erro('base', e)
    if len(_cache) > 20000:
        _cache.clear()
    _cache[trip_id] = h
    return h

def atraso(trip_id, stop_id, quando):
    """Atraso em segundos de uma passagem real em 'quando' (epoch) face ao horário da viagem, ou None."""
    segs = horario(trip_id).get(stop_id)
    if not segs:
        return None
    t = datetime.fromtimestamp(quando, LIS)
    melhor = None
    for d in (0, -1):  # viagens que passam da meia-noite contam no dia de serviço anterior
        meia = datetime(t.year, t.month, t.day, tzinfo=LIS) + timedelta(days=d)
        for s in segs:
            prev = (meia + timedelta(seconds=s)).timestamp()
            dif = quando - prev
            if melhor is None or abs(dif) < abs(melhor):
                melhor = dif
    return int(melhor)


# ---------- Carris Metropolitana
ult_cm = {}
CAMPOS_CM = ('id', 'trip_id', 'line_id', 'pattern_id', 'stop_id', 'current_status', 'timestamp', 'lat', 'lon',
             'speed', 'bearing', 'schedule_relationship', 'shift_id', 'block_id', 'occupancy_status',
             'occupancy_estimated', 'door_status', 'odometer')

def cm():
    dados = json.loads(pedir('https://api.carrismetropolitana.pt/v2/vehicles'))
    agora = int(time.time())
    vistos = 0
    for v in dados:
        vid = v.get('id')
        chave = (v.get('trip_id'), v.get('stop_id'), v.get('current_status'))
        if not vid or ult_cm.get(vid) == chave:
            continue
        ult_cm[vid] = chave
        reg = {k: v.get(k) for k in CAMPOS_CM if v.get(k) is not None}
        reg['t'] = agora
        if v.get('current_status') == 'STOPPED_AT' and v.get('trip_id') and v.get('stop_id'):
            ts = (v.get('timestamp') or agora * 1000) / 1000
            a = atraso('cmh:' + v['trip_id'], 'cmh:' + v['stop_id'], ts)
            if a is not None:
                reg['atraso_s'] = a
        escrever('cm', reg)
        vistos += 1
    escrever('cm_frota', {'t': agora, 'n': len(dados), 'com_viagem': sum(1 for v in dados if v.get('trip_id'))})


# ---------- TUB (GTFS-Realtime): leitor mínimo de protobuf, sem dependências
def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if c < 0x80:
            return r, i

def campos(b):
    i, n = 0, len(b)
    while i < n:
        k, i = _varint(b, i)
        f, w = k >> 3, k & 7
        if w == 0:
            v, i = _varint(b, i)
        elif w == 1:
            v = b[i:i + 8]; i += 8
        elif w == 2:
            l, i = _varint(b, i); v = b[i:i + l]; i += l
        elif w == 5:
            v = b[i:i + 4]; i += 4
        else:
            return
        yield f, v

def _int(v):
    return v - (1 << 64) if v >= (1 << 63) else v

def _txt(v):
    return bytes(v).decode('utf-8', 'replace')

ult_tub = {}

def tub():
    feed = pedir('https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/trip_updates.pb')
    agora = int(time.time())
    for f, ent in campos(feed):
        if f != 2:
            continue
        for g, tu in campos(ent):
            if g != 3:
                continue
            trip = route = data = veic = ''
            prox = []
            for h, v in campos(tu):
                if h == 1:
                    for a, x in campos(v):
                        if a == 1: trip = _txt(x)
                        elif a == 3: data = _txt(x)
                        elif a == 5: route = _txt(x)
                elif h == 3:
                    for a, x in campos(v):
                        if a == 1: veic = _txt(x)
                elif h == 2 and len(prox) < 1:
                    st = {}
                    for a, x in campos(v):
                        if a == 1: st['seq'] = x
                        elif a == 4: st['stop'] = _txt(x)
                        elif a == 2:
                            for c, y in campos(x):
                                if c == 2: st['hora'] = _int(y)
                    prox.append(st)
            if not trip or not prox or not prox[0].get('stop') or not prox[0].get('hora'):
                continue
            st = prox[0]
            chave = (trip, data, st['stop'])
            # um registo por viagem e paragem, atualizado só quando a previsão muda mais de 20 s
            ant = ult_tub.get(chave)
            if ant is not None and abs(ant - st['hora']) < 20:
                continue
            ult_tub[chave] = st['hora']
            reg = {'t': agora, 'trip': trip, 'data': data, 'route': route, 'veic': veic, 'stop': st['stop'],
                   'seq': st.get('seq'), 'hora': st['hora']}
            a = atraso('tub_braga:' + trip, 'tub_braga:' + st['stop'], st['hora'])
            if a is not None:
                reg['atraso_s'] = a
            escrever('tub', reg)
    if len(ult_tub) > 50000:
        ult_tub.clear()


# ---------- STCP (chegadas das paragens de referência)
def stcp():
    agora = int(time.time())
    for s in STCP:
        try:
            d = json.loads(pedir(f'https://stcp.pt/api/stops/{s}/realtime'))
            for a in d.get('arrivals') or []:
                if a.get('arrival_minutes') is None or a['arrival_minutes'] > 6:
                    continue
                escrever('stcp', {'t': agora, 'stop': s, 'linha': a.get('route_short_name'), 'trip': a.get('trip_id'),
                                  'destino': a.get('trip_headsign'), 'atraso_min': a.get('delay_minutes'),
                                  'faltam_min': a.get('arrival_minutes'), 'estado': a.get('status'),
                                  'veic': a.get('vehicle_id'), 'fonte': d.get('data_source')})
        except Exception as e:
            erro('stcp', e)
        time.sleep(2)

def horas_stcp():
    h = datetime.now(LIS)
    m = h.hour * 60 + h.minute
    return m >= 6 * 60 or m <= 90


def estado():
    dia = datetime.now(LIS).strftime('%Y-%m-%d')
    e = {'atualizado': datetime.now(LIS).isoformat(timespec='seconds'), 'dia': dia,
         'registos_hoje': {f: n for (d, f), n in contagem.items() if d == dia}}
    tmp = os.path.join(PASTA, 'estado.json.tmp')
    with open(tmp, 'w') as f:
        json.dump(e, f)
    os.replace(tmp, os.path.join(PASTA, 'estado.json'))
    with trinco:
        for f in abertos.values():
            f.flush()


def ciclo(nome, intervalo, fn, quando=None):
    """Cada fonte corre no seu próprio fio: uma fonte lenta (ex.: a STCP) não atrasa as outras."""
    while True:
        inicio = time.time()
        if quando is None or quando():
            try:
                fn()
            except Exception as e:
                erro(nome, f'{e} | {traceback.format_exc(limit=2)[-200:]}')
        time.sleep(max(1.0, intervalo - (time.time() - inicio)))


def main():
    os.makedirs(PASTA, exist_ok=True)
    fios = [threading.Thread(target=ciclo, args=a, daemon=True) for a in
            (('cm', 30, cm), ('tub', 60, tub), ('stcp', 300, stcp, horas_stcp), ('estado', 60, estado))]
    for f in fios:
        f.start()
    while all(f.is_alive() for f in fios):
        time.sleep(30)
    sys.exit(1)  # um fio morreu: o systemd volta a arrancar o serviço


if __name__ == '__main__':
    main()
