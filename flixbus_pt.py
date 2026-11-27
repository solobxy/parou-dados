#!/usr/bin/env python3
"""
FlixBus em Portugal: do GTFS europeu da FlixBus (https://gtfs.gis.flix.tech/gtfs_generic_eu.zip) às viagens em Portugal
=====================================================================================================================

O ficheiro da FlixBus tem a Europa toda (~2000 paragens) e as horas em UTC (agency_timezone = UTC). Este módulo:
  - fica só com as paragens portuguesas (stop_timezone = Europe/Lisbon) e com as viagens que param em pelo menos duas;
  - passa as horas para a hora de Portugal, dia a dia (no inverno UTC+0, no verão UTC+1): cada viagem é copiada uma vez
    por fuso usado nos dias da janela, com os seus dias em calendar_dates (a mudança de hora nunca baralha as horas);
  - traduz os nomes mais comuns («Lisbon (Oriente)» → «Lisboa (Oriente)», «Bus Station» → «Terminal Rodoviário»).
As viagens internacionais ficam só com a parte em Portugal (o destino continua a ser o da viagem, ex.: Madrid).

Só usa a biblioteca padrão. Uso (ensaio): python flixbus_pt.py entrada.zip saida.zip
"""

import csv
import datetime
import io
import re
import sys
import zipfile
from zoneinfo import ZoneInfo

URL = "https://gtfs.gis.flix.tech/gtfs_generic_eu.zip"
LISBOA = ZoneInfo("Europe/Lisbon")
TRADUCOES = [
    (r"\bLisbon\b", "Lisboa"), (r"\bOporto\b", "Porto"), (r"\(Bus Station\)", "(Terminal Rodoviário)"),
    (r"\bBus Station\b", "Terminal Rodoviário"), (r"\(Airport\)", "(Aeroporto)"), (r"\bAirport\b", "Aeroporto"),
    (r"\bTrain Station\b", "Estação"), (r"\bCity Center\b", "Centro"),
]
DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def nome_pt(nome):
    n = re.sub(r"\s+", " ", str(nome or "")).strip()
    for a, b in TRADUCOES:
        n = re.sub(a, b, n)
    return n


def _ler(z, nome):
    with z.open(nome) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))


def _seg(hms):
    h, m, s = (hms or "0:0:0").split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def _hms(seg):
    return f"{seg // 3600:02d}:{(seg % 3600) // 60:02d}:{seg % 60:02d}"


def _csv(nome, campos, linhas):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=campos, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for r in linhas:
        w.writerow(r)
    return nome, buf.getvalue()


def converter(corpo, hoje=None, dias=17, log=print):
    hoje = hoje or datetime.date.today()
    z = zipfile.ZipFile(io.BytesIO(corpo))
    paragens = {s["stop_id"]: s for s in _ler(z, "stops.txt") if (s.get("stop_timezone") or "") == "Europe/Lisbon"}
    if not paragens:
        raise RuntimeError("sem paragens em Portugal (stop_timezone Europe/Lisbon) no ficheiro da FlixBus")
    fuso_agencia = {a.get("agency_id") or "": a.get("agency_timezone") or "UTC" for a in _ler(z, "agency.txt")}
    # dias da janela em que cada serviço circula
    janela = [hoje + datetime.timedelta(days=n) for n in range(-1, dias)]
    janela_ymd = {d.strftime("%Y%m%d"): d for d in janela}
    servico_dias = {}
    for c in _ler(z, "calendar.txt"):
        ini, fim = c["start_date"], c["end_date"]
        for ymd, d in janela_ymd.items():
            if ini <= ymd <= fim and c.get(DIAS[d.weekday()]) == "1":
                servico_dias.setdefault(c["service_id"], set()).add(ymd)
    if "calendar_dates.txt" in z.namelist():
        for c in _ler(z, "calendar_dates.txt"):
            if c["date"] not in janela_ymd:
                continue
            s = servico_dias.setdefault(c["service_id"], set())
            if c.get("exception_type") == "1":
                s.add(c["date"])
            else:
                s.discard(c["date"])
    viagens = {t["trip_id"]: t for t in _ler(z, "trips.txt") if servico_dias.get(t["service_id"])}
    rotas = {r["route_id"]: r for r in _ler(z, "routes.txt")}
    # horas das paragens portuguesas de cada viagem da janela
    horas = {}
    for r in _ler(z, "stop_times.txt"):
        if r["trip_id"] in viagens and r["stop_id"] in paragens:
            horas.setdefault(r["trip_id"], []).append(r)
    trips, stop_times, cal = [], [], []
    rotas_usadas, paragens_usadas = {}, set()
    for tid, linhas in horas.items():
        if len(linhas) < 2:
            continue
        t = viagens[tid]
        rota = rotas.get(t["route_id"]) or {}
        tz = fuso_agencia.get(rota.get("agency_id") or "", "UTC")
        zona = ZoneInfo(tz) if tz else ZoneInfo("UTC")
        linhas.sort(key=lambda x: int(x["stop_sequence"]))
        # os dias desta viagem, agrupados pela diferença entre o fuso da agência e o de Lisboa nesse dia
        por_desvio = {}
        for ymd in sorted(servico_dias[t["service_id"]]):
            d = janela_ymd[ymd]
            meio_dia = datetime.datetime(d.year, d.month, d.day, 12, tzinfo=zona)
            desvio = int((meio_dia.astimezone(LISBOA).utcoffset() - meio_dia.utcoffset()).total_seconds())
            por_desvio.setdefault(desvio, []).append(ymd)
        for desvio, datas in por_desvio.items():
            novo = f"flix_{tid}" + (f"_{desvio // 60}" if len(por_desvio) > 1 else "")
            sid = f"s_{novo}"
            # hora local antes da meia-noite do dia de serviço: o dia passa para o anterior
            primeira = _seg(linhas[0]["departure_time"] or linhas[0]["arrival_time"]) + desvio
            mudar_dia = -1 if primeira < 0 else 0
            for ymd in datas:
                d = janela_ymd[ymd] + datetime.timedelta(days=mudar_dia)
                cal.append({"service_id": sid, "date": d.strftime("%Y%m%d"), "exception_type": 1})
            trips.append({"route_id": f"flix_{t['route_id']}", "service_id": sid, "trip_id": novo,
                          "trip_headsign": nome_pt(t.get("trip_headsign") or ""), "direction_id": t.get("direction_id") or 0})
            for n, r in enumerate(linhas):
                ch = _seg(r["arrival_time"] or r["departure_time"]) + desvio - mudar_dia * 86400
                pa = _seg(r["departure_time"] or r["arrival_time"]) + desvio - mudar_dia * 86400
                stop_times.append({"trip_id": novo, "arrival_time": _hms(ch), "departure_time": _hms(max(pa, ch)),
                                   "stop_id": f"flix_{r['stop_id']}", "stop_sequence": n + 1})
                paragens_usadas.add(r["stop_id"])
            rotas_usadas[t["route_id"]] = rota
    routes = [{"route_id": f"flix_{rid}", "agency_id": "flixbus", "route_short_name": re.sub(r"^Flix(Bus|Train)\s*", "", r.get("route_short_name") or "").strip() or "Flix",
               "route_long_name": nome_pt(r.get("route_long_name") or ""), "route_type": r.get("route_type") or 3,
               "route_color": "73D700", "route_text_color": "FFFFFF", "route_url": "https://www.flixbus.pt"}
              for rid, r in rotas_usadas.items()]
    stops = [{"stop_id": f"flix_{i}", "stop_name": nome_pt(paragens[i]["stop_name"]), "stop_lat": paragens[i]["stop_lat"],
              "stop_lon": paragens[i]["stop_lon"]} for i in sorted(paragens_usadas)]
    agencia = {"agency_id": "flixbus", "agency_name": "FlixBus", "agency_url": "https://www.flixbus.pt",
               "agency_timezone": "Europe/Lisbon", "agency_lang": "pt"}
    ficheiros = [
        _csv("agency.txt", list(agencia), [agencia]),
        _csv("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"], stops),
        _csv("routes.txt", ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color",
                            "route_text_color", "route_url"], routes),
        _csv("trips.txt", ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], trips),
        _csv("stop_times.txt", ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], stop_times),
        _csv("calendar_dates.txt", ["service_id", "date", "exception_type"], cal),
    ]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as out:
        for nome, txt in ficheiros:
            out.writestr(nome, txt)
    log(f"  flixbus_pt: {len(routes)} linhas, {len(trips)} viagens, {len(stops)} paragens em Portugal (janela de {dias} dias)")
    if not trips:
        raise RuntimeError("nenhuma viagem da FlixBus em Portugal na janela")
    return buf.getvalue()


if __name__ == "__main__":
    with open(sys.argv[1], "rb") as f:
        dados = converter(f.read())
    with open(sys.argv[2] if len(sys.argv) > 2 else "flixbus_pt.zip", "wb") as f:
        f.write(dados)
