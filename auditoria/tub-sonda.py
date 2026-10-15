# Sonda dos dados em tempo real da TUB (Braga): descarrega o GTFS e os dois ficheiros GTFS-Realtime e mostra o que têm,
# e se os identificadores (viagens, linhas, paragens) batem com o GTFS. Só leitura.
import io, sys, time, json, zipfile, csv, urllib.request, collections
from google.transit import gtfs_realtime_pb2 as rt

GTFS = 'https://www.tub.pt/developer/gtfs/feed/tub.zip'
VP = 'https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/vehicle_positions.pb'
TU = 'https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/trip_updates.pb'
UA = {'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)'}

def pedir(url):
    t0 = time.time()
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        corpo = r.read()
        print(f'GET {url}\n  -> {r.status} {len(corpo)} bytes em {time.time()-t0:.2f}s; content-type={r.headers.get("content-type")}; cache-control={r.headers.get("cache-control")}; last-modified={r.headers.get("last-modified")}; etag={r.headers.get("etag")}; server={r.headers.get("server")}')
        return corpo

def hora(ts):
    return time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(ts)) + 'Z' if ts else '-'

# ---------- GTFS estático
zf = zipfile.ZipFile(io.BytesIO(pedir(GTFS)))
print('ficheiros no zip:', zf.namelist())
def tabela(nome):
    if nome not in zf.namelist(): return []
    return list(csv.DictReader(io.TextIOWrapper(zf.open(nome), encoding='utf-8-sig')))
rotas = {r['route_id']: r for r in tabela('routes.txt')}
viagens = {v['trip_id']: v for v in tabela('trips.txt')}
paragens = {s['stop_id']: s for s in tabela('stops.txt')}
print(f'GTFS: {len(rotas)} rotas, {len(viagens)} viagens, {len(paragens)} paragens')
print('exemplo rota:', json.dumps(next(iter(rotas.values())), ensure_ascii=False))
print('exemplo viagem:', json.dumps(next(iter(viagens.values())), ensure_ascii=False))
print('exemplo paragem:', json.dumps(next(iter(paragens.values())), ensure_ascii=False))
cal = tabela('calendar.txt'); cd = tabela('calendar_dates.txt')
print('calendar.txt:', len(cal), 'linhas; calendar_dates.txt:', len(cd), 'linhas')
if cal: print('exemplo calendar:', json.dumps(cal[0], ensure_ascii=False))
for f in ('shapes.txt', 'frequencies.txt', 'feed_info.txt'):
    print(f, 'existe' if f in zf.namelist() else 'não existe')
fi = tabela('feed_info.txt')
if fi: print('feed_info:', json.dumps(fi[0], ensure_ascii=False))

# ---------- posições
def ler(corpo):
    f = rt.FeedMessage(); f.ParseFromString(corpo); return f

for rodada in range(3):
    print(f'\n===== rodada {rodada+1} (agora {hora(time.time())}) =====')
    fv = ler(pedir(VP))
    print('cabeçalho posições:', fv.header.gtfs_realtime_version, 'incrementality', fv.header.incrementality, 'timestamp', hora(fv.header.timestamp), f'(há {time.time()-fv.header.timestamp:.0f}s)')
    veic = [e for e in fv.entity if e.HasField('vehicle')]
    print('entidades:', len(fv.entity), 'com veículo:', len(veic))
    idade = [time.time() - e.vehicle.timestamp for e in veic if e.vehicle.timestamp]
    if idade: print(f'idade das posições: min {min(idade):.0f}s, mediana {sorted(idade)[len(idade)//2]:.0f}s, máx {max(idade):.0f}s')
    com_trip = [e for e in veic if e.vehicle.trip.trip_id]
    com_route = [e for e in veic if e.vehicle.trip.route_id]
    print(f'com trip_id: {len(com_trip)}; com route_id: {len(com_route)}')
    bate_trip = [e for e in com_trip if e.vehicle.trip.trip_id in viagens]
    bate_route = [e for e in com_route if e.vehicle.trip.route_id in rotas]
    print(f'trip_id que existe no GTFS: {len(bate_trip)}/{len(com_trip)}; route_id que existe no GTFS: {len(bate_route)}/{len(com_route)}')
    for e in veic[:4]:
        v = e.vehicle
        print('  exemplo:', text_format if False else '', json.dumps({
            'entity': e.id, 'trip': v.trip.trip_id, 'route': v.trip.route_id, 'dir': v.trip.direction_id if v.trip.HasField('direction_id') else None,
            'start': v.trip.start_time, 'date': v.trip.start_date, 'veiculo_id': v.vehicle.id, 'etiqueta': v.vehicle.label, 'matricula': v.vehicle.license_plate,
            'lat': v.position.latitude, 'lon': v.position.longitude, 'rumo': v.position.bearing if v.position.HasField('bearing') else None,
            'vel_ms': v.position.speed if v.position.HasField('speed') else None, 'stop_id': v.stop_id, 'seq': v.current_stop_sequence if v.HasField('current_stop_sequence') else None,
            'estado': v.current_status if v.HasField('current_status') else None, 'ocupacao': v.occupancy_status if v.HasField('occupancy_status') else None,
            'ts': hora(v.timestamp)}, ensure_ascii=False))
    linhas = collections.Counter(rotas.get(e.vehicle.trip.route_id, {}).get('route_short_name', '?') for e in veic)
    print('veículos por linha (route_short_name):', dict(linhas))
    if rodada == 0 and veic:
        lat = [e.vehicle.position.latitude for e in veic]; lon = [e.vehicle.position.longitude for e in veic]
        print(f'caixa dos veículos: lat {min(lat):.4f}..{max(lat):.4f}, lon {min(lon):.4f}..{max(lon):.4f}')

    # ---------- atualizações de viagens
    ft = ler(pedir(TU))
    print('cabeçalho viagens:', ft.header.gtfs_realtime_version, 'timestamp', hora(ft.header.timestamp), f'(há {time.time()-ft.header.timestamp:.0f}s)')
    tus = [e for e in ft.entity if e.HasField('trip_update')]
    print('entidades:', len(ft.entity), 'com trip_update:', len(tus))
    n_stu = [len(e.trip_update.stop_time_update) for e in tus]
    if n_stu: print(f'stop_time_update por viagem: min {min(n_stu)}, mediana {sorted(n_stu)[len(n_stu)//2]}, máx {max(n_stu)}')
    bate = [e for e in tus if e.trip_update.trip.trip_id in viagens]
    print(f'trip_id que existe no GTFS: {len(bate)}/{len(tus)}')
    stu_all = [s for e in tus for s in e.trip_update.stop_time_update]
    print('stop_id que existe no GTFS:', sum(1 for s in stu_all if s.stop_id in paragens), '/', len(stu_all))
    print('com arrival.time:', sum(1 for s in stu_all if s.HasField('arrival') and s.arrival.time), 'com arrival.delay:', sum(1 for s in stu_all if s.HasField('arrival') and s.arrival.HasField('delay')),
          'com departure.time:', sum(1 for s in stu_all if s.HasField('departure') and s.departure.time), 'com departure.delay:', sum(1 for s in stu_all if s.HasField('departure') and s.departure.HasField('delay')),
          'com stop_sequence:', sum(1 for s in stu_all if s.HasField('stop_sequence')), 'schedule_relationship!=SCHEDULED:', sum(1 for s in stu_all if s.schedule_relationship != 0))
    for e in tus[:2]:
        tu = e.trip_update
        print('  exemplo viagem:', json.dumps({'entity': e.id, 'trip': tu.trip.trip_id, 'route': tu.trip.route_id, 'start': tu.trip.start_time, 'date': tu.trip.start_date, 'veiculo': tu.vehicle.id, 'delay': tu.delay if tu.HasField('delay') else None, 'ts': hora(tu.timestamp), 'n_stu': len(tu.stop_time_update)}, ensure_ascii=False))
        for s in list(tu.stop_time_update)[:3]:
            print('     stu:', json.dumps({'seq': s.stop_sequence if s.HasField('stop_sequence') else None, 'stop': s.stop_id, 'arr': hora(s.arrival.time) if s.HasField('arrival') else None, 'arr_delay': s.arrival.delay if s.HasField('arrival') and s.arrival.HasField('delay') else None, 'dep': hora(s.departure.time) if s.HasField('departure') else None, 'dep_delay': s.departure.delay if s.HasField('departure') and s.departure.HasField('delay') else None, 'rel': s.schedule_relationship}))
    # cruzamento: viagens com posição e com atualização
    tv = {e.vehicle.trip.trip_id for e in com_trip}; tt = {e.trip_update.trip.trip_id for e in tus}
    print(f'viagens com posição: {len(tv)}; com atualização: {len(tt)}; em ambas: {len(tv & tt)}')
    if rodada < 2: time.sleep(12)
