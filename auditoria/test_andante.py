#!/usr/bin/env python3
"""Andante (Porto): zonas, anéis e preços oficiais para a app dizer que título comprar em cada trajeto (andante.py).
Testa: leitura da página oficial «Andante Azul» (preços Z2–Z9, 24 h, durações, cartão Azul, data de entrada em vigor),
rejeição de páginas estranhas (mais vale sem preço do que com um errado), distâncias (a própria zona = 1 anel),
zona pelo polígono com margem à fronteira, zonas do GTFS só quando são zonas Andante, e cópia dos dados de ontem
quando o site falha.
Uso: python auditoria/test_andante.py   (a partir da raiz do repositório; falha com exit 1)"""
import json, os, sqlite3, sys
sys.path.insert(0, os.getcwd())
import andante as an

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

AQUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "andante")
pagina = open(os.path.join(AQUI, "andante-azul-2026-11-25.html"), encoding="utf-8").read()

# --- Preços (página oficial guardada a 25/11/2026) -------------------------------------------------------------------
p = an.ler_precos(pagina)
ok("[preços] Z2 simples 1,40 € e 24 h 5,35 €", p["simples"][2] == 1.40 and p["h24"][2] == 5.35, str(p["simples"].get(2)))
ok("[preços] Z3 1,85 €, Z6 3,25 €, Z9 4,65 €", (p["simples"][3], p["simples"][6], p["simples"][9]) == (1.85, 3.25, 4.65))
ok("[preços] títulos Z2 a Z9, sem saltos", sorted(p["simples"]) == list(range(2, 10)))
ok("[preços] durações: Z2 e Z3 1 h, Z4 1h15, Z9 2h30",
   (p["duracao_min"][2], p["duracao_min"][3], p["duracao_min"][4], p["duracao_min"][9]) == (60, 60, 75, 150))
ok("[preços] cartão Azul 0,60 €", p["cartao_azul"] == 0.60, str(p["cartao_azul"]))
ok("[preços] em vigor desde 1 de janeiro de 2026", p["em_vigor_desde"] == "2026-01-01", str(p["em_vigor_desde"]))

def rejeita(nome, html_):
    try:
        an.ler_precos(html_)
        ok(nome, False, "aceitou")
    except ValueError:
        ok(nome, True)

rejeita("[preços] página sem tabela é rejeitada", "<html><body>Manutenção</body></html>")
rejeita("[preços] tabela cortada (só Z2) é rejeitada", pagina.replace("Z3", "X3").replace("Z4", "X4").replace("Z5", "X5"))
rejeita("[preços] preço que desce com as zonas é rejeitado", pagina.replace("1,85", "1,20", 1))
rejeita("[preços] sem durações é rejeitada", pagina.replace("Duração máx.", "Outra coisa"))

# --- Distâncias ----------------------------------------------------------------------------------------------------
zonas = [f"Z{i:02d}" for i in range(60)]
linhas = ["origin_id;destination_id;distance"] + [f"{a};{b};{1 if a == b else 1 + abs(i - j)}"
                                                  for i, a in enumerate(zonas) for j, b in enumerate(zonas)]
d = an.ler_distancias("\n".join(linhas))
ok("[distâncias] a própria zona conta 1 anel", d[("Z00", "Z00")] == 1)
ok("[distâncias] lê todos os pares", len(d) == 60 * 60)
try:
    an.ler_distancias("\n".join(linhas[:-500]))
    ok("[distâncias] ficheiro cortado é rejeitado", False)
except ValueError:
    ok("[distâncias] ficheiro cortado é rejeitado", True)

# --- Zona pelo polígono --------------------------------------------------------------------------------------------
# Dois quadrados lado a lado (~1,1 km), fronteira em lon = -8.60
sq = lambda x0, x1: [[[x0, 41.15], [x1, 41.15], [x1, 41.16], [x0, 41.16], [x0, 41.15]]]
gj = {"type": "FeatureCollection", "features": [
    {"properties": {"zona": "AAA1"}, "geometry": {"type": "Polygon", "coordinates": sq(-8.62, -8.60)}},
    {"properties": {"zona": "BBB1"}, "geometry": {"type": "MultiPolygon", "coordinates": [sq(-8.60, -8.58)]}},
] + [{"properties": {"zona": f"X{i}"}, "geometry": {"type": "Polygon", "coordinates": sq(10 + i, 10.01 + i)}} for i in range(50)]}
pol = an.ler_poligonos(json.dumps(gj))
ok("[mapa] ponto no meio da zona A", an.zona_do_ponto(41.155, -8.61, pol) == "AAA1")
ok("[mapa] ponto no meio da zona B (MultiPolygon)", an.zona_do_ponto(41.155, -8.59, pol) == "BBB1")
ok("[mapa] a 30 m da fronteira: sem zona (sem certeza)", an.zona_do_ponto(41.155, -8.6004, pol) is None)
ok("[mapa] fora de todas as zonas: sem zona", an.zona_do_ponto(38.7, -9.1, pol) is None)

# --- Gravar na base (site a responder e site em baixo) ---------------------------------------------------------------
distancias_txt = "\n".join(["origin_id;destination_id;distance"] + [
    f"{a};{b};{1 if a == b else 2}" for a in ["AAA1", "BBB1"] + [f"X{i}" for i in range(50)]
    for b in ["AAA1", "BBB1"] + [f"X{i}" for i in range(50)]])

def base():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE stops (stop_id TEXT, feed_id TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL, zone_id TEXT)")
    c.execute("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)")
    c.executemany("INSERT INTO stops VALUES (?,?,?,?,?,?)", [
        ("metro_porto:1", "metro_porto", "Trindade", 41.155, -8.61, "AAA1"),
        ("stcp:2", "stcp", "Paragem", 41.155, -8.59, "BBB1"),
        ("stcp:3", "stcp", "Zona estranha", 41.155, -8.59, "Lisboa"),
        ("unir:4", "unir", "UNIR no meio", 41.155, -8.59, "Gondomar"),
        ("unir:5", "unir", "UNIR na fronteira", 41.155, -8.6003, "Gondomar"),
        ("cp:6", "cp", "Estação", 41.155, -8.61, ""),
        ("cm:7", "cm", "Lisboa", 41.155, -8.61, "AAA1"),
    ])
    return c

fontes = {an.URL_DISTANCIAS: distancias_txt.encode(), an.URL_POLIGONOS: json.dumps(gj).encode(), an.URL_PRECOS: pagina.encode()}
c = base()
e = an.gravar(c, log=lambda *_: None, agora="2026-11-25T23:00:00+00:00", buscar=lambda u: fontes[u])
z = dict(c.execute("SELECT stop_id, zona FROM andante_zona").fetchall())
ok("[base] Metro e STCP com a zona do GTFS", z.get("metro_porto:1") == "AAA1" and z.get("stcp:2") == "BBB1")
ok("[base] zona do GTFS que não é Andante fica de fora", "stcp:3" not in z)
ok("[base] UNIR e CP pela zona do mapa", z.get("unir:4") == "BBB1" and z.get("cp:6") == "AAA1", str(z))
ok("[base] UNIR perto da fronteira fica sem zona", "unir:5" not in z)
ok("[base] outros operadores não entram", "cm:7" not in z)
st = json.loads(c.execute("SELECT value FROM app_state WHERE key = 'andante'").fetchone()[0])
ok("[base] estado com preços e datas", st["precos"]["simples"]["2"] == 1.4 and st["precos"]["obtidos"].startswith("2026-11-25")
   and st["zonas_obtidas"].startswith("2026-11-25"))

# Site em baixo: copia os de ontem, com a data de ontem
ontem = c
hoje = base()
caminho = os.path.join(os.environ.get("TMPDIR", "/tmp"), "andante-ontem.db")
if os.path.exists(caminho): os.remove(caminho)
ontem.execute("VACUUM INTO ?", (caminho,))
hoje.execute("ATTACH DATABASE ? AS prev", (caminho,))
def em_baixo(u):
    raise OSError("sem ligação")
e2 = an.gravar(hoje, log=lambda *_: None, agora="2026-11-26T23:00:00+00:00", buscar=em_baixo)
z2 = dict(hoje.execute("SELECT stop_id, zona FROM andante_zona").fetchall())
ok("[ontem] site em baixo: ficam as zonas de ontem", z2 == z)
ok("[ontem] e os preços de ontem, com a data em que foram obtidos",
   e2 and e2["precos"]["obtidos"].startswith("2026-11-25") and e2["zonas_obtidas"].startswith("2026-11-25"))
sem = base()
ok("[ontem] sem nada de ontem: não grava estado (a app não mostra títulos)",
   an.gravar(sem, log=lambda *_: None, buscar=em_baixo) is None
   and sem.execute("SELECT COUNT(*) FROM app_state WHERE key = 'andante'").fetchone()[0] == 0)

print()
print("Tudo OK" if not falhas else f"{falhas} falha(s)")
sys.exit(1 if falhas else 0)
