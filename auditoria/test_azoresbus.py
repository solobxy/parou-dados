#!/usr/bin/env python3
"""AzoresBus (São Miguel): da API do operador ao GTFS, com dados pequenos feitos à mão (sem rede).
Uso: python auditoria/test_azoresbus.py"""
import csv
import datetime
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import azoresbus as A  # noqa: E402

falhas = 0


def ok(nome, cond, extra=""):
    global falhas
    if not cond:
        falhas += 1
    print("OK     " if cond else "FALHOU ", nome, extra)


ok("nome: abreviaturas e parênteses", A.nome_bonito("P. DELGADA (LG. ALMIRANTE DUNN)") == "P. Delgada (Lg. Almirante Dunn)", A.nome_bonito("P. DELGADA (LG. ALMIRANTE DUNN)"))
ok("nome: «via» e «e» em minúsculas", A.nome_bonito("PONTA DELGADA - SETE CIDADES (VIA CANDELÁRIA E MOSTEIROS)") == "Ponta Delgada - Sete Cidades (via Candelária e Mosteiros)")
ok("nome: códigos ficam (EB1, ER3-1A)", A.nome_bonito("PICO DA PEDRA (X ER3-1A)") == "Pico da Pedra (X ER3-1A)" and A.nome_bonito("ARRIFES (EB1) - RELVA") == "Arrifes (EB1) - Relva", A.nome_bonito("PICO DA PEDRA (X ER3-1A)"))
ok("nome já com minúsculas não muda", A.nome_bonito("Ribeira Grande") == "Ribeira Grande")
ok("polyline do Google", [tuple(round(x, 3) for x in p) for p in A.descodificar_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")] == [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)])

st = lambda i, nome, la, lo: {"id": str(i), "name": nome, "nameShort": str(1000 + i), "position": {"lat": la, "lon": lo}}  # noqa: E731
P = [st(1, "P. DELGADA (ALFÂNDEGA)", 37.7376, -25.6704), st(2, "RIBEIRA GRANDE (TERMINAL)", 37.8226, -25.5178), st(3, "FURNAS (IGREJA)", 37.7716, -25.3108)]
hoje = datetime.date(2026, 11, 27)  # sexta
sab, dom = hoje + datetime.timedelta(days=1), hoje + datetime.timedelta(days=2)
viagem = lambda jid, ini, d: {"id": jid, "start": "", "startTime": ini, "direction": d}  # noqa: E731
circ = lambda seq, p, t: {"sequence": seq, "stage": p, "departureTime": t, "arrivalTime": t}  # noqa: E731
dados = {
    "paragens": P,
    "linhas": [{"id": "7", "name": "PONTA DELGADA - FURNAS", "nameShort": "110", "color": "2D59A9", "isActive": True}],
    "datas": [hoje, sab, dom],
    "por_dia": {("7", hoje): [viagem("100", 26100, 0), viagem("101", 54000, 0)], ("7", sab): [viagem("100", 26100, 0)], ("7", dom): []},
    "viagens": {
        ("7", "100"): {"circulations": [circ(1, P[0], 26100), circ(2, P[1], 28200), circ(3, P[2], 31500)], "shape": "_p~iF~ps|U_ulLnnqC", "direction": 0},
        ("7", "101"): {"circulations": [circ(1, P[0], 85800), circ(2, P[1], 86700), circ(3, P[2], 600)], "shape": "", "direction": 0},
    },
}
corpo, rel = A.construir_gtfs(dados)
z = zipfile.ZipFile(io.BytesIO(corpo))
ler = lambda n: list(csv.DictReader(io.StringIO(z.read(n).decode())))  # noqa: E731
ok("GTFS com os ficheiros todos", {"agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar_dates.txt", "shapes.txt"} <= set(z.namelist()), str(z.namelist()))
ok("agência no fuso dos Açores", ler("agency.txt")[0]["agency_timezone"] == "Atlantic/Azores")
r = ler("routes.txt")
ok("linha 110 com nome bonito", len(r) == 1 and r[0]["route_short_name"] == "110" and r[0]["route_long_name"] == "Ponta Delgada - Furnas", str(r))
t = {x["trip_id"]: x for x in ler("trips.txt")}
ok("duas viagens, destino = última paragem", len(t) == 2 and t["azb_7_100"]["trip_headsign"] == "Furnas (Igreja)", str(t))
cd = ler("calendar_dates.txt")
dias = {}
for x in cd:
    dias.setdefault(x["service_id"], set()).add(x["date"])
ok("viagem das 7h15: sexta e sábado; a das 23h50: só sexta", dias[t["azb_7_100"]["service_id"]] == {"20261127", "20261128"} and dias[t["azb_7_101"]["service_id"]] == {"20261127"}, str(dias))
sts = [x for x in ler("stop_times.txt") if x["trip_id"] == "azb_7_101"]
ok("passagem da meia-noite: 24:10:00 (não volta a 00:10)", [x["departure_time"] for x in sts] == ["23:50:00", "24:05:00", "24:10:00"], str([x["departure_time"] for x in sts]))
ok("desenho do percurso", t["azb_7_100"]["shape_id"] and len([x for x in ler("shapes.txt") if x["shape_id"] == t["azb_7_100"]["shape_id"]]) == 2)
ok("paragens com coordenadas e nome", {x["stop_name"] for x in ler("stops.txt")} == {"P. Delgada (Alfândega)", "Ribeira Grande (Terminal)", "Furnas (Igreja)"})
print(("%d FALHOU" % falhas) if falhas else "Tudo OK")
sys.exit(1 if falhas else 0)
