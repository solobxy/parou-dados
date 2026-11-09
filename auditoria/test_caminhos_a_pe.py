#!/usr/bin/env python3
"""A base diária junta os caminhos a pé (release «caminhos») na tabela ape; sem o ficheiro (ou estragado) a base sai
sem eles e nada falha (a app fica com a linha reta). Uso: python auditoria/test_caminhos_a_pe.py (raiz do repositório)"""
import gzip, os, sqlite3, sys, tempfile, json
sys.path.insert(0, os.getcwd())
import construir_dados as cd
import caminhos_a_pe as ca

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

d = tempfile.mkdtemp()
geo = os.path.join(d, "v.geojsonseq")
with open(geo, "w") as f:
    f.write(json.dumps({"type": "Feature", "properties": {"highway": "residential"}, "geometry": {"type": "LineString", "coordinates": [[-9.14, 38.71], [-9.139, 38.711]]}}) + "\n")
sq = os.path.join(d, "c.sqlite")
ca.construir(geo, sq)
gz = os.path.join(d, "c.sqlite.gz")
with open(sq, "rb") as a, gzip.open(gz, "wb") as b:
    b.write(a.read())

conn = sqlite3.connect(":memory:")
n = cd.juntar_caminhos_a_pe(conn, "file://" + gz)
ok("junta os mosaicos à base", n and conn.execute("SELECT COUNT(*) FROM ape").fetchone()[0] == n, str(n))
ok("os mosaicos têm dados", conn.execute("SELECT length(d) FROM ape LIMIT 1").fetchone()[0] > 4)

conn2 = sqlite3.connect(":memory:")
n2 = cd.juntar_caminhos_a_pe(conn2, "file://" + os.path.join(d, "nao-existe.gz"), tentativas=1)
ok("sem o ficheiro, a base sai sem a tabela e nada falha", n2 == 0 and not conn2.execute("SELECT 1 FROM sqlite_master WHERE name='ape'").fetchone())
estragado = os.path.join(d, "x.gz")
with open(estragado, "wb") as f:
    f.write(b"isto nao e gzip")
n3 = cd.juntar_caminhos_a_pe(conn2, "file://" + estragado, tentativas=1)
ok("ficheiro estragado: sem a tabela, sem falhar", n3 == 0)
sys.exit(1 if falhas else 0)
