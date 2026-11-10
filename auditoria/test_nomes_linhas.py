#!/usr/bin/env python3
"""Metro do Porto: o ficheiro do operador traz o nome comprido de todas as linhas como «-» (A, B, Bx, C, D, E, F).
A app mostrava a linha B com o nome «-» nas «Mais procuradas» (captura de 10/11/2026). Regra: linha sem nome (vazio ou
só traços/pontos) fica com os dois destinos principais, «destino do sentido 1 – destino do sentido 0». Linhas com nome
ficam como estão, e linhas com um só destino também (CP: uma linha por origem e destino, agrupadas na app).
Uso: python auditoria/test_nomes_linhas.py   (a partir da raiz do repositório; falha com exit 1)"""
import io, os, sqlite3, sys, zipfile, datetime
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

b = io.BytesIO()
with zipfile.ZipFile(b, "w") as z:
    z.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\nA,Trindade,41.1520,-8.6090\nB,Bolhão,41.1500,-8.6060\n")
    z.writestr("routes.txt", "route_id,route_short_name,route_long_name,route_type\nB,B,-,1\nC,C,,1\nA,A,Estádio do Dragão – Senhor de Matosinhos,1\n")
    z.writestr("calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nU,1,1,1,1,1,1,1,20260101,20261231\n")
    viagens = [("B", 0, "Póvoa de Varzim"), ("B", 0, "Póvoa de Varzim"), ("B", 0, "Pedras Rubras"), ("B", 1, "Estádio do Dragão"),
               ("C", 0, "ISMAI"), ("A", 0, "Senhor de Matosinhos")]
    z.writestr("trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id\n" + "".join(f"{r},U,T{i},{h},{d}\n" for i, (r, d, h) in enumerate(viagens)))
    z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" + "".join(f"T{i},08:00:00,08:00:00,A,1\nT{i},08:05:00,08:05:00,B,2\n" for i in range(len(viagens))))
conn = sqlite3.connect(":memory:")
conn.executescript(cd.SCHEMA_TABLES)
cd.ingest_gtfs(conn, "t", b.getvalue(), datetime.datetime(2026, 11, 10, 6, 0))
nome = dict(conn.execute("SELECT route_id, route_long_name FROM routes").fetchall())
ok("[«-»] linha B fica com os destinos principais", nome.get("t:B") == "Estádio do Dragão – Póvoa de Varzim", repr(nome.get("t:B")))
ok("[um só destino] linha C (como as da CP, uma por sentido) fica como estava", nome.get("t:C") == "", repr(nome.get("t:C")))
ok("[com nome] linha A fica como estava", nome.get("t:A") == "Estádio do Dragão – Senhor de Matosinhos", repr(nome.get("t:A")))
sys.exit(1 if falhas else 0)
