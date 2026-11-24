#!/usr/bin/env python3
"""Testa os desenhos pelas estradas dos autocarros sem desenho bom (TUB, TUBA, TUT de Torres Vedras):
- o gerador diário (construir_dados.aplicar_desenhos_extra) só troca o desenho das viagens sem desenho ou com um desenho
  oficial que a app não aceita (lista desenhos_maus); as que têm um desenho oficial bom ficam com ele;
- o estradas.py tira as sequências de paragens das viagens que a app indicou (precisam.json), uma por sequência.
Uso: python auditoria/test_desenhos_autocarros.py   (a partir da raiz do repositório; falha com exit 1)"""
import os, sqlite3, sys
sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.join(os.getcwd(), "auditoria"))
import construir_dados as cd
import estradas

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

conn = sqlite3.connect(":memory:")
conn.executescript("""
CREATE TABLE trips (trip_id TEXT PRIMARY KEY, feed_id TEXT, route_id TEXT, service_id TEXT, trip_headsign TEXT, direction_id INTEGER, shape_id TEXT);
CREATE TABLE stop_times (feed_id TEXT, trip_id TEXT, stop_id TEXT, arrival_secs INTEGER, departure_secs INTEGER, stop_sequence INTEGER);
CREATE TABLE stops (stop_id TEXT PRIMARY KEY, feed_id TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL);
CREATE TABLE shapes (shape_id TEXT PRIMARY KEY, feed_id TEXT, pontos TEXT);
CREATE TABLE stop_routes (feed_id TEXT, stop_id TEXT, route_id TEXT, direction_id INTEGER, stop_sequence INTEGER);
CREATE TABLE route_shapes (route_id TEXT, direction_id INTEGER, shape_id TEXT);
""")
for i in range(4):
    conn.execute("INSERT INTO stops VALUES (?, 'tub', ?, ?, ?)", (f"tub:P{i}", f"P{i}", 41.55, -8.42 + i * 0.01))
conn.execute("INSERT INTO shapes VALUES ('tub:bom', 'tub', 'x'), ('tub:mau', 'tub', 'y')")
viagens = {"tub:sem": None, "tub:mau1": "tub:mau", "tub:bom1": "tub:bom", "tub:mau_outra_seq": "tub:mau"}
for tid, sh in viagens.items():
    conn.execute("INSERT INTO trips VALUES (?, 'tub', 'tub:L', 'S', 'x', 0, ?)", (tid, sh))
    seq = ["tub:P0", "tub:P1", "tub:P2"] if tid != "tub:mau_outra_seq" else ["tub:P0", "tub:P3"]
    for k, sid in enumerate(seq):
        conn.execute("INSERT INTO stop_times VALUES ('tub', ?, ?, 0, 0, ?)", (tid, sid, k + 1))
chave = cd.chave_padrao(["tub:P0", "tub:P1", "tub:P2"])
extras = {"caminhos": {chave: "_desenho_estrada_"}, "carris": [], "autocarros": ["tub"], "desenhos_maus": ["tub:mau"]}
cont = cd.aplicar_desenhos_extra(conn, extras)
sh = dict(conn.execute("SELECT trip_id, shape_id FROM trips"))
ok("[gerador] viagem sem desenho ganha o desenho pelas estradas", sh["tub:sem"] == "osrm:" + chave, sh["tub:sem"])
ok("[gerador] viagem com desenho oficial que não serve ganha o desenho pelas estradas", sh["tub:mau1"] == "osrm:" + chave, sh["tub:mau1"])
ok("[gerador] viagem com desenho oficial bom fica com ele", sh["tub:bom1"] == "tub:bom", sh["tub:bom1"])
ok("[gerador] sequência sem desenho pelas estradas fica como estava", sh["tub:mau_outra_seq"] == "tub:mau", sh["tub:mau_outra_seq"])
ok("[gerador] contagem", cont.get("autocarros") == 2, str(cont))
ok("[gerador] o desenho guardado na tabela shapes", conn.execute("SELECT pontos FROM shapes WHERE shape_id = ?", ("osrm:" + chave,)).fetchone()[0] == "_desenho_estrada_")
ok("[gerador] desenho oficial bom não é apagado", conn.execute("SELECT COUNT(*) FROM shapes WHERE shape_id = 'tub:bom'").fetchone()[0] == 1)
ok("[gerador] sem lista de autocarros não muda nada (versões antigas do ficheiro)", cd.aplicar_desenhos_extra(conn, {"caminhos": {chave: "z"}}).get("autocarros") == 0)

seqs = estradas.sequencias_autocarros(conn, {"viagens": ["tub:sem", "tub:mau1", "tub:mau_outra_seq"]})
ok("[estradas] uma sequência por conjunto de paragens", len(seqs) == 2, str(len(seqs)))
ok("[estradas] com as coordenadas das paragens", all(len(x) == 4 and isinstance(x[1], float) for s in seqs for x in s))
ok("[estradas] chave igual à do gerador", cd.chave_padrao([x[0] for x in seqs[0]]) == chave)
sys.exit(1 if falhas else 0)
