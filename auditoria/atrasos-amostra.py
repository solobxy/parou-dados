# Amostra de atrasos em tempo real (Carris Metropolitana, STCP, TUB) para o estudo de pontualidade da PAROU.
# Só leitura: pede as fontes públicas que a app já usa, com pausas para não pesar nas APIs, e grava os dados em bruto.
import json, os, sys, time, gzip, urllib.request, subprocess
from google.transit import gtfs_realtime_pb2 as rt

DUR = int(os.environ.get('DURACAO_MIN', '300')) * 60
OUT = 'res'
UA = {'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)', 'Accept': 'application/json'}
P = json.load(open('auditoria/atrasos-paragens.json'))
os.makedirs(OUT, exist_ok=True)
fich = {k: open(f'{OUT}/{k}.jsonl', 'a') for k in ('cm_veiculos', 'cm_chegadas', 'stcp', 'tub', 'erros')}

def pedir(url, t=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.read()

def erro(fonte, e):
    fich['erros'].write(json.dumps({'t': int(time.time()), 'fonte': fonte, 'erro': str(e)[:200]}) + '\n')

ultimo = {}
def cm_veiculos():
    d = json.loads(pedir('https://api.carrismetropolitana.pt/v2/vehicles'))
    n = 0
    for v in d:
        chave = (v.get('trip_id'), v.get('stop_id'), v.get('current_status'))
        if ultimo.get(v.get('id')) == chave:
            continue
        ultimo[v.get('id')] = chave
        n += 1
        fich['cm_veiculos'].write(json.dumps({k: v.get(k) for k in ('id', 'trip_id', 'stop_id', 'current_status', 'timestamp', 'line_id', 'pattern_id', 'schedule_relationship')}) + '\n')
    return n

def cm_chegadas():
    for s in P['cm']:
        try:
            d = json.loads(pedir(f'https://api.carrismetropolitana.pt/v2/arrivals/by_stop/{s}'))
            agora = int(time.time())
            for a in d:
                fich['cm_chegadas'].write(json.dumps({'t': agora, 'stop': s, **{k: a.get(k) for k in a if k in (
                    'trip_id', 'line_id', 'pattern_id', 'vehicle_id', 'scheduled_arrival', 'scheduled_arrival_unix',
                    'estimated_arrival', 'estimated_arrival_unix', 'observed_arrival', 'observed_arrival_unix', 'stop_sequence')}}) + '\n')
        except Exception as e:
            erro('cm_chegadas', e)
        time.sleep(1.5)

def stcp():
    for s in P['stcp']:
        try:
            d = json.loads(pedir(f'https://stcp.pt/api/stops/{s}/realtime'))
            fich['stcp'].write(json.dumps({'t': int(time.time()), 'stop': s, 'd': d}, ensure_ascii=False) + '\n')
        except Exception as e:
            erro('stcp', e)
        time.sleep(2)

def tub():
    f = rt.FeedMessage(); f.ParseFromString(pedir('https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/trip_updates.pb'))
    agora = int(time.time())
    for e in f.entity:
        if not e.HasField('trip_update'): continue
        tu = e.trip_update
        stus = [{'stop': u.stop_id, 'seq': u.stop_sequence,
                 'arr_delay': u.arrival.delay if u.HasField('arrival') else None,
                 'arr_time': u.arrival.time if u.HasField('arrival') else None,
                 'dep_delay': u.departure.delay if u.HasField('departure') else None,
                 'sr': u.schedule_relationship} for u in tu.stop_time_update[:2]]
        fich['tub'].write(json.dumps({'t': agora, 'ts': tu.timestamp, 'trip': tu.trip.trip_id, 'route': tu.trip.route_id,
                                      'start_date': tu.trip.start_date, 'start_time': tu.trip.start_time,
                                      'sr': tu.trip.schedule_relationship, 'delay': tu.delay if tu.HasField('delay') else None,
                                      'vehicle': tu.vehicle.id, 'stus': stus}) + '\n')

def publicar(msg):
    for f in fich.values(): f.flush()
    subprocess.run(['bash', '-c', f'''set -e; rm -rf pub; mkdir pub; for f in {OUT}/*.jsonl; do gzip -c "$f" > pub/$(basename "$f").gz; done
cd pub && git init -q -b atrasos-resultado && git config user.name "parou-dados" && git config user.email "actions@users.noreply.github.com"
git add -A && git commit -q -m "{msg}" && git push -q -f "https://x-access-token:$GH_TOKEN@github.com/$REPO.git" atrasos-resultado'''], check=False)

inicio = time.time(); prox = {'veic': 0, 'cheg': 0, 'stcp': 0, 'tub': 0, 'pub': inicio + 300}
while time.time() - inicio < DUR:
    agora = time.time()
    for nome, intervalo, fn in (('veic', 30, cm_veiculos), ('tub', 60, tub), ('cheg', 300, cm_chegadas), ('stcp', 300, stcp)):
        if agora >= prox[nome]:
            prox[nome] = agora + intervalo
            try: fn()
            except Exception as e: erro(nome, e)
    if agora >= prox['pub']:
        prox['pub'] = agora + 1800
        publicar(f'parcial {time.strftime("%H:%MZ", time.gmtime())}')
    time.sleep(3)
publicar(f'final {time.strftime("%H:%MZ", time.gmtime())}')
