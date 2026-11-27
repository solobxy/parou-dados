#!/usr/bin/env python3
"""FlixBus em Portugal: do GTFS europeu (horas em UTC) às viagens portuguesas na hora de Portugal. Sem rede.
Uso: python auditoria/test_flixbus_pt.py"""
import csv
import datetime
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import flixbus_pt as F  # noqa: E402

falhas = 0


def ok(nome, cond, extra=""):
    global falhas
    if not cond:
        falhas += 1
    print("OK     " if cond else "FALHOU ", nome, extra)


def zip_de(ficheiros):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for n, linhas in ficheiros.items():
            z.writestr(n, "\n".join(",".join(map(str, l)) for l in linhas) + "\n")
    return b.getvalue()


EU = zip_de({
    "agency.txt": [["agency_id", "agency_name", "agency_url", "agency_timezone"], ["FLIXBUS-eu", "FlixBus-eu", "https://x", "UTC"]],
    "stops.txt": [["stop_id", "stop_name", "stop_lat", "stop_lon", "stop_timezone"],
                  ["LIS", "Lisbon (Oriente)", 38.768, -9.099, "Europe/Lisbon"], ["POR", "Porto (TIC - Campanhã)", 41.148, -8.586, "Europe/Lisbon"],
                  ["CB", "Castelo Branco (Bus Station)", 39.82, -7.49, "Europe/Lisbon"], ["MAD", "Madrid (Estación Sur)", 40.39, -3.68, "Europe/Madrid"]],
    "routes.txt": [["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"], ["R1", "FLIXBUS-eu", "N1", "Lisbon - Porto", 3], ["R2", "FLIXBUS-eu", "N2", "Lisbon - Madrid", 3]],
    "trips.txt": [["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], ["R1", "S1", "T1", "Porto", 0], ["R2", "S1", "T2", "Madrid", 0], ["R2", "S1", "T3", "Madrid", 0]],
    "stop_times.txt": [["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
                       ["T1", "08:00:00", "08:00:00", "LIS", 1], ["T1", "11:30:00", "11:30:00", "POR", 2],
                       ["T2", "09:00:00", "09:00:00", "LIS", 1], ["T2", "11:30:00", "11:40:00", "CB", 2], ["T2", "17:00:00", "17:00:00", "MAD", 3],
                       ["T3", "09:00:00", "09:00:00", "LIS", 1], ["T3", "17:00:00", "17:00:00", "MAD", 2]],
    "calendar.txt": [["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"], ["S1", 1, 1, 1, 1, 1, 1, 1, "20270101", "20271231"]],
})
# janela que atravessa a mudança para a hora de verão (28/3/2027)
corpo = F.converter(EU, hoje=datetime.date(2027, 3, 26), dias=5, log=lambda *_: None)
z = zipfile.ZipFile(io.BytesIO(corpo))
ler = lambda n: list(csv.DictReader(io.StringIO(z.read(n).decode())))  # noqa: E731
st = {s["stop_id"]: s for s in ler("stops.txt")}
ok("só paragens portuguesas", set(st) == {"flix_LIS", "flix_POR", "flix_CB"}, str(set(st)))
ok("nomes em português", st["flix_LIS"]["stop_name"] == "Lisboa (Oriente)" and st["flix_CB"]["stop_name"] == "Castelo Branco (Terminal Rodoviário)", str([s["stop_name"] for s in st.values()]))
tr = ler("trips.txt")
ok("viagem com só uma paragem em Portugal fica de fora (T3: Lisboa→Madrid direta)", not any("T3" in t["trip_id"] for t in tr))
ok("cada viagem dividida em inverno e verão", sorted(t["trip_id"] for t in tr if "T1" in t["trip_id"]) == ["flix_T1_0", "flix_T1_60"], str([t["trip_id"] for t in tr]))
cal = {}
for c in ler("calendar_dates.txt"):
    cal.setdefault(c["service_id"], set()).add(c["date"])
sv = {t["trip_id"]: t["service_id"] for t in tr}
ok("inverno: 25, 26, 27/3; verão: 28 a 30/3", cal[sv["flix_T1_0"]] == {"20270325", "20270326", "20270327"} and cal[sv["flix_T1_60"]] == {"20270328", "20270329", "20270330"}, str({k: sorted(v) for k, v in cal.items()}))
h = {}
for r in ler("stop_times.txt"):
    h.setdefault(r["trip_id"], []).append(r["departure_time"])
ok("hora de Portugal: 08:00 UTC = 08:00 no inverno e 09:00 no verão", h["flix_T1_0"] == ["08:00:00", "11:30:00"] and h["flix_T1_60"] == ["09:00:00", "12:30:00"], str(h))
ok("viagem internacional: só a parte em Portugal, destino Madrid", h["flix_T2_0"] == ["09:00:00", "11:40:00"] and any(t["trip_headsign"] == "Madrid" for t in tr if "T2" in t["trip_id"]))
ok("agência no fuso de Lisboa", ler("agency.txt")[0]["agency_timezone"] == "Europe/Lisbon")
print(("%d FALHOU" % falhas) if falhas else "Tudo OK")
sys.exit(1 if falhas else 0)
