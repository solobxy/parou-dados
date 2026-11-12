#!/usr/bin/env python3
"""PAROU - resumo diário da pontualidade (corre de madrugada pelo parou-pontualidade-resumo.timer).

Lê <pasta>/bruto/AAAA-MM-DD/*.jsonl (ontem, por omissão), escreve <pasta>/dias/AAAA-MM-DD.json e
<pasta>/dias/indice.json, e comprime os ficheiros em bruto desse dia (ficam guardados, em .gz).
Uso: resumir.py [pasta] [AAAA-MM-DD]
Definições: adiantado < -1 min; a horas entre -1 e +5 min; atrasado > +5 min; muito atrasado > +10 min.
"""
import collections, gzip, json, math, os, sqlite3, statistics, sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

LIS = ZoneInfo('Europe/Lisbon')
PASTA = sys.argv[1] if len(sys.argv) > 1 else '/var/lib/parou-pontualidade'
DIA = sys.argv[2] if len(sys.argv) > 2 else (datetime.now(LIS) - timedelta(days=1)).strftime('%Y-%m-%d')
BASE = os.environ.get('PAROU_GTFS', '/var/lib/parou/gtfs.db')
CONCELHOS = {'01': 'Alcochete', '02': 'Almada', '03': 'Amadora', '04': 'Barreiro', '05': 'Cascais', '06': 'Lisboa',
             '07': 'Loures', '08': 'Mafra', '09': 'Moita', '10': 'Montijo', '11': 'Odivelas', '12': 'Oeiras',
             '13': 'Palmela', '14': 'Seixal', '15': 'Sesimbra', '16': 'Setúbal', '17': 'Sintra', '18': 'Vila Franca de Xira'}


def ler(fonte):
    d = os.path.join(PASTA, 'bruto', DIA)
    for nome in (fonte + '.jsonl', fonte + '.jsonl.gz'):
        p = os.path.join(d, nome)
        if os.path.exists(p):
            with (gzip.open(p, 'rt') if nome.endswith('.gz') else open(p)) as f:
                for l in f:
                    try:
                        yield json.loads(l)
                    except ValueError:
                        pass  # linha cortada (ex.: reinício a meio de uma escrita)
            return


def dist(minutos):
    v = sorted(minutos)
    n = len(v)
    if not n:
        return {'n': 0}
    return {'n': n, 'mediana_min': round(statistics.median(v), 1), 'media_min': round(statistics.mean(v), 1),
            'p90_min': round(v[int(0.9 * (n - 1))], 1),
            'adiantado_pct': round(100 * sum(x < -1 for x in v) / n, 1),
            'a_horas_pct': round(100 * sum(-1 <= x <= 5 for x in v) / n, 1),
            'atrasado_pct': round(100 * sum(x > 5 for x in v) / n, 1),
            'muito_atrasado_pct': round(100 * sum(x > 10 for x in v) / n, 1)}


def por(grupos, minimo=20):
    return {str(k): dist(v) for k, v in sorted(grupos.items()) if len(v) >= minimo}


def hora(t):
    return datetime.fromtimestamp(t, LIS).hour


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def carris_metropolitana():
    pass_ = {}            # (viagem, paragem) -> primeira vez vista parada
    trajetos = collections.defaultdict(list)
    linha_da = {}
    vistas = set()
    for r in ler('cm'):
        trip = r.get('trip_id')
        if not trip:
            continue
        vistas.add(trip)
        ts = (r.get('timestamp') or r['t'] * 1000) / 1000
        linha_da[trip] = r.get('line_id')
        if r.get('lat') and r.get('lon'):
            trajetos[trip].append((ts, r['lat'], r['lon']))
        if r.get('current_status') == 'STOPPED_AT' and 'atraso_s' in r and abs(r['atraso_s']) < 4 * 3600:
            k = (trip, r.get('stop_id'))
            if k not in pass_ or ts < pass_[k][0]:
                pass_[k] = (ts, r['atraso_s'] / 60, r.get('line_id'), r.get('pattern_id'), r.get('stop_id'))
    if not pass_ and not trajetos:
        return None
    todos, h, conc, lin, area = [], collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for ts, a, linha, padrao, stop in pass_.values():
        todos.append(a); h[hora(ts)].append(a); lin[linha].append(a)
        if stop and len(stop) == 6 and stop[:2] in CONCELHOS:
            conc[CONCELHOS[stop[:2]]].append(a)
        if linha and linha[:1].isdigit():
            area['área ' + linha[0]].append(a)
    # autocarros colados: duas passagens seguidas do mesmo percurso na mesma paragem muito mais juntas do que o horário
    seq = collections.defaultdict(list)
    for ts, a, linha, padrao, stop in pass_.values():
        seq[(padrao, stop)].append((ts, ts - a * 60))
    colados = pares = 0
    for v in seq.values():
        v.sort()
        for (t1, p1), (t2, p2) in zip(v, v[1:]):
            prog = p2 - p1
            if prog >= 8 * 60:
                pares += 1
                if (t2 - t1) < 0.25 * prog:
                    colados += 1
    # velocidade média por linha (distância em linha reta entre posições seguidas; subestima um pouco)
    vel = collections.defaultdict(lambda: [0.0, 0.0])
    for trip, pts in trajetos.items():
        pts.sort()
        if len(pts) < 5 or pts[-1][0] - pts[0][0] < 600:
            continue
        d = sum(km(pts[i][1:], pts[i + 1][1:]) for i in range(len(pts) - 1))
        horas = (pts[-1][0] - pts[0][0]) / 3600
        if 0 < d / horas < 90:
            vel[linha_da[trip]][0] += d; vel[linha_da[trip]][1] += horas
    vel_l = {k: round(d / hh, 1) for k, (d, hh) in vel.items() if hh >= 0.5}
    # viagens programadas nesse dia e quantas apareceram com GPS
    programadas = None
    try:
        con = sqlite3.connect(f'file:{BASE}?mode=ro', uri=True, timeout=10)
        programadas = con.execute("""SELECT COUNT(*) FROM trips t JOIN calendar_dates c ON c.feed_id = t.feed_id
            AND c.service_id = t.service_id WHERE t.feed_id = 'cmh' AND c.date = ? AND c.exception_type = 1""",
                                  (DIA.replace('-', ''),)).fetchone()[0]
        con.close()
    except Exception:
        pass
    vistas = len(vistas)
    frota = collections.defaultdict(list)
    for r in ler('cm_frota'):
        frota[hora(r['t'])].append(r.get('com_viagem', 0))
    return {'passagens': dist(todos), 'por_hora': por(h), 'por_concelho': por(conc), 'por_area': por(area),
            'por_linha': por(lin, 30),
            'colados': {'pares_com_horario_8min_ou_mais': pares, 'colados': colados,
                        'colados_pct': round(100 * colados / pares, 1) if pares else None},
            'velocidade_kmh': {'mediana_linhas': round(statistics.median(vel_l.values()), 1) if vel_l else None,
                               'por_linha': dict(sorted(vel_l.items()))},
            'viagens': {'programadas': programadas, 'com_gps': vistas,
                        'com_gps_pct': round(100 * vistas / programadas, 1) if programadas else None},
            'autocarros_em_servico_max_por_hora': {str(k): max(v) for k, v in sorted(frota.items())}}


def tub():
    ult = {}
    for r in ler('tub'):
        if 'atraso_s' in r and abs(r['atraso_s']) < 3 * 3600:
            ult[(r['trip'], r.get('data'), r['stop'])] = r
    if not ult:
        return None
    todos, h, lin = [], collections.defaultdict(list), collections.defaultdict(list)
    for r in ult.values():
        a = r['atraso_s'] / 60
        todos.append(a); h[hora(r['hora'])].append(a); lin[r.get('route')].append(a)
    return {'passagens': dist(todos), 'por_hora': por(h), 'por_linha': por(lin, 30),
            'viagens_com_gps': len({(r['trip'], r.get('data')) for r in ult.values()})}


def stcp():
    ult = {}
    for r in ler('stcp'):
        if r.get('atraso_min') is not None and r.get('trip') and r.get('fonte') in (None, 'realtime'):
            ult[(r['stop'], r['trip'])] = r
    if not ult:
        return None
    todos, h, lin, par = [], collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for r in ult.values():
        a = float(r['atraso_min'])
        todos.append(a); h[hora(r['t'])].append(a); lin[r.get('linha')].append(a); par[r['stop']].append(a)
    return {'nota': '40 paragens de referência (as com mais partidas)', 'passagens': dist(todos),
            'por_hora': por(h), 'por_linha': por(lin, 30), 'por_paragem': por(par, 30)}


def main():
    res = {'dia': DIA, 'gerado': datetime.now(LIS).isoformat(timespec='seconds'),
           'definicoes': 'adiantado < -1 min; a horas -1 a +5 min; atrasado > +5 min; muito atrasado > +10 min',
           'carris_metropolitana': carris_metropolitana(), 'tub_braga': tub(), 'stcp': stcp(),
           'erros': dict(collections.Counter(r.get('fonte') for r in ler('erros')))}
    os.makedirs(os.path.join(PASTA, 'dias'), exist_ok=True)
    destino = os.path.join(PASTA, 'dias', DIA + '.json')
    with open(destino + '.tmp', 'w') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    os.replace(destino + '.tmp', destino)
    # índice com os números principais de cada dia (para gráficos e comparações)
    ind = {}
    for nome in sorted(os.listdir(os.path.join(PASTA, 'dias'))):
        if nome[:4].isdigit() and nome.endswith('.json'):
            try:
                d = json.load(open(os.path.join(PASTA, 'dias', nome)))
            except ValueError:
                continue
            ind[d['dia']] = {k: (d[k] or {}).get('passagens', {}) for k in ('carris_metropolitana', 'tub_braga', 'stcp')}
    with open(os.path.join(PASTA, 'dias', 'indice.json.tmp'), 'w') as f:
        json.dump(ind, f, ensure_ascii=False)
    os.replace(os.path.join(PASTA, 'dias', 'indice.json.tmp'), os.path.join(PASTA, 'dias', 'indice.json'))
    # comprime o bruto do dia (só se o dia já acabou)
    if DIA < datetime.now(LIS).strftime('%Y-%m-%d'):
        d = os.path.join(PASTA, 'bruto', DIA)
        for nome in os.listdir(d) if os.path.isdir(d) else []:
            if nome.endswith('.jsonl'):
                p = os.path.join(d, nome)
                with open(p, 'rb') as fi, gzip.open(p + '.gz', 'wb', compresslevel=6) as fo:
                    while True:
                        b = fi.read(1 << 20)
                        if not b:
                            break
                        fo.write(b)
                os.remove(p)
    print(json.dumps({k: (res[k] or {}).get('passagens') for k in ('carris_metropolitana', 'tub_braga', 'stcp')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
