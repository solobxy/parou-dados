#!/usr/bin/env python3
"""Barraqueiro Oeste (TUT, Torres Vedras): o operador só publica horários em PDF. O construtor lê o texto dos PDFs e
junta a ordem e as coordenadas das paragens do OpenStreetMap (barraqueiro_oeste.py). Pedido no Reddit (24/11/2026).
Testa, com o texto real de dois PDFs (794 e 797, tirado com pdftotext -layout):
  leitura das tabelas (dias úteis / sábados, domingos e feriados, viagens que saltam pontos com «-»),
  casamento dos pontos com as paragens do OSM (pela ordem e pelo nome), escolha da variante,
  horas interpoladas sempre a subir, feriados, e entrada na base pela via normal (process_feed).
Uso: python auditoria/test_barraqueiro_oeste.py   (a partir da raiz do repositório; falha com exit 1)"""
import collections, csv, datetime, io, json, os, sqlite3, sys, zipfile
sys.path.insert(0, os.getcwd())
import barraqueiro_oeste as bo
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

FIX = os.path.join("auditoria", "fixtures", "barraqueiro_oeste")
def texto(ref):
    with open(os.path.join(FIX, f"{ref}.layout.txt"), encoding="utf-8") as fh:
        return fh.read()
with open(bo.OSM_JSON, encoding="utf-8") as fh:
    OSM = json.load(fh)

# --- Fonte ---------------------------------------------------------------------------------------------------------
f = next((x for x in cd.SEED_FEEDS if x["id"] == "barraqueiro_oeste"), {})
ok("[fonte] Barraqueiro Oeste está na lista de operadores", bool(f))
ok("[fonte] vem dos PDFs do site do operador", f.get("formato") == "pdf_barraqueiro"
   and f.get("url") == "https://barraqueiro-oeste.pt/horarios-em-pdf/", str(f.get("url")))
ok("[fonte] não entra outra vez pelo catálogo automático", "barraqueiro" in cd.DISCOVERY_SKIP)
ok("[fonte] percursos do OSM para as 5 linhas TUT", all(OSM.get(r) for r in bo.LINHAS), str(sorted(OSM)))
html = ('<h3><a href="/wp-content/uploads/2026/10/794.pdf">794</a></h3>'
        '<a href="https://barraqueiro-oeste.pt/wp-content/uploads/2026/10/705.pdf">705</a>'
        '<a href="/wp-content/uploads/2026/10/705.pdf">706</a>')
ok("[fonte] links relativos dos PDFs, sem repetidos", bo.links_pdf(html) == [
    ("794", "https://barraqueiro-oeste.pt/wp-content/uploads/2026/10/794.pdf"),
    ("705", "https://barraqueiro-oeste.pt/wp-content/uploads/2026/10/705.pdf")], str(bo.links_pdf(html)))

# --- Leitura do PDF ------------------------------------------------------------------------------------------------
h794 = bo.ler_horario(texto("794"))
tipos = collections.Counter(v["tipo"] for v in h794["viagens"])
ok("[pdf] 794: linha, nome e data de entrada em vigor", (h794["ref"], h794["nome"], h794["em_vigor"]) ==
   ("794", "Catefica - Torres Vedras", datetime.date(2026, 1, 5)), str((h794["ref"], h794["nome"], h794["em_vigor"])))
ok("[pdf] 794: 15 viagens nos dias úteis e 6 ao fim de semana", tipos == {"du": 15, "sdf": 6}, str(tipos))
v0 = h794["viagens"][0]["pontos"]
ok("[pdf] 794: 1.ª viagem sai às 07:00 do Terminal e chega às 07:30", v0[0] == ("Terminal", 420) and v0[-1] == ("Terminal", 450),
   str((v0[0], v0[-1])))
v1 = h794["viagens"][1]["pontos"]
ok("[pdf] 794: viagem das 07:40 salta Arneiros/Louriceira/Orjariça («-»)",
   v1[0] == ("Terminal", 460) and not any(r in ("Arneiros", "Louriceira", "Orjariça") for r, _ in v1), str(v1))
fds = [v for v in h794["viagens"] if v["tipo"] == "sdf"]
ok("[pdf] 794: ao fim de semana a 1.ª é às 08:00 e passa em Arneiros às 08:13",
   fds[0]["pontos"][0] == ("Terminal", 480) and ("Arneiros", 493) in fds[0]["pontos"], str(fds[0]["pontos"]))
h797 = bo.ler_horario(texto("797"))
ok("[pdf] 797: 14 + 6 viagens", collections.Counter(v["tipo"] for v in h797["viagens"]) == {"du": 14, "sdf": 6})
ok("[pdf] 797: última dos dias úteis às 19:20, chega às 20:00", [v for v in h797["viagens"] if v["tipo"] == "du"][-1]["pontos"][0] == ("Terminal TVD", 1160)
   and [v for v in h797["viagens"] if v["tipo"] == "du"][-1]["pontos"][-1] == ("Terminal TVD", 1200))

# --- Casar com o OSM -----------------------------------------------------------------------------------------------
_, var, idx, horas = bo.escolher_variante(v0, OSM["794"])
ok("[osm] viagem completa da 794 usa a variante por Arneiros", "Arneiros" in var["nome"], var["nome"])
_, var1, _, _ = bo.escolher_variante(v1, OSM["794"])
ok("[osm] viagem curta da 794 usa a variante só por Catefica", "Arneiros" not in var1["nome"], var1["nome"])
nomes = {r: var["paragens"][i]["nome"] for (r, _), i in zip(v0, idx) if i is not None}
ok("[osm] abreviaturas: «Pq. Cor. Vitor Alves» = Parque Coronel Vítor Alves",
   nomes.get("Pq. Cor. Vitor Alves") == "Parque Coronel Vítor Alves", str(nomes))
_, v97, i97, _ = bo.escolher_variante(h797["viagens"][0]["pontos"], OSM["797"])
n97 = {r: v97["paragens"][i]["nome"] for (r, _), i in zip(h797["viagens"][0]["pontos"], i97) if i is not None}
ok("[osm] «Varandas de Arenes» é essa paragem, não o «Arenes, Cruzamento» antes", n97.get("Varandas de Arenes") == "Varandas de Arenes", str(n97))
ok("[osm] horas sempre a subir e certas nos pontos da tabela",
   all(a <= b for a, b in zip(horas, horas[1:])) and horas[0] == 420 and horas[-1] == 450)

# --- GTFS ------------------------------------------------------------------------------------------------------------
HOJE = datetime.date(2026, 11, 24)
zip_bytes, rel = bo.construir_gtfs([h794, h797], OSM, hoje=HOJE)
z = zipfile.ZipFile(io.BytesIO(zip_bytes))
def ler(nome):
    return list(csv.DictReader(io.StringIO(z.read(nome).decode("utf-8"))))
ok("[gtfs] 2 linhas, 41 viagens", len(ler("routes.txt")) == 2 and len(ler("trips.txt")) == 41, "; ".join(rel))
ok("[gtfs] relatório diz que pontos ficaram sem paragem", any("João Pereira" in r for r in rel), "; ".join(rel))
cd_rows = ler("calendar_dates.txt")
ok("[gtfs] 8/12 (feriado, terça): sem dias úteis, com horário de fim de semana",
   {"service_id": "bo_du_20260105", "date": "20261208", "exception_type": "2"} in cd_rows
   and {"service_id": "bo_sdf_20260105", "date": "20261208", "exception_type": "1"} in cd_rows)
st = ler("stop_times.txt")
ok("[gtfs] paragens intermédias com horas", len(st) > 41 * 8 and all(r["arrival_time"] for r in st))

# --- Entrada na base pela via normal ---------------------------------------------------------------------------------
conn = sqlite3.connect(":memory:")
conn.executescript(cd.SCHEMA_TABLES)
orig = bo.descarregar_e_converter
bo.descarregar_e_converter = lambda log=print, hoje=None: zip_bytes
try:
    row = cd.process_feed(conn, f, datetime.datetime(2026, 11, 24, 6, 0), False)
finally:
    bo.descarregar_e_converter = orig
ok("[base] feed OK com 2 linhas", row.get("status") == "OK" and row.get("lines_count") == 2,
   str({k: row.get(k) for k in ("status", "lines_count", "stops_count", "trips_count", "last_error")}))
ok("[base] ids com o prefixo do operador", conn.execute(
    "SELECT COUNT(*) FROM stops WHERE stop_id LIKE 'barraqueiro_oeste:%'").fetchone()[0] == row.get("stops_count"))

bo.descarregar_e_converter = lambda log=print, hoje=None: (_ for _ in ()).throw(ValueError("site em baixo"))
conn2 = sqlite3.connect(":memory:")
conn2.executescript(cd.SCHEMA_TABLES)
try:
    row = cd.process_feed(conn2, f, datetime.datetime(2026, 11, 24, 6, 0), False)
except Exception as err:  # noqa: BLE001
    row = {"status": f"exceção {err}"}
finally:
    bo.descarregar_e_converter = orig
ok("[base] site em baixo: erro registado, sem rebentar o construtor", row.get("status") == "ERROR", str(row.get("status")))

sys.exit(1 if falhas else 0)
