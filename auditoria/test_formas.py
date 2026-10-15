#!/usr/bin/env python3
"""Testa que o construtor guarda o desenho do percurso (shapes.txt) dos horários, para a app desenhar as linhas pela estrada
e não em reta de paragem a paragem (erro: as linhas atravessavam prédios, como entre «Noeda» e o Freixo, no Porto).
Uso: python auditoria/test_formas.py   (a partir da raiz do repositório; falha com exit 1)"""
import io, math, os, sqlite3, sys, tempfile, zipfile, datetime
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(d))

# --- 1. polilinha codificada: ida e volta
pts = [(41.14850, -8.58550), (41.14871, -8.58412), (41.15003, -8.58330), (41.15200, -8.58001)]
txt = cd.codificar_polilinha(pts)
volta = cd.descodificar_polilinha(txt)
ok("[polilinha] ida e volta sem perder mais de 0,2 m", len(volta) == len(pts) and max(hav(a, b) for a, b in zip(pts, volta)) < 0.2, f"{len(txt)} caracteres")
ok("[polilinha] valor conhecido (precisão 6, igual ao que a app descodifica)", cd.codificar_polilinha([(38.5, -120.2)], 5) == "_p~iF~ps|U")

# --- 2. simplificação: tira pontos em linha reta, guarda as curvas e nunca se afasta mais do que o limite
reta = [(41.0 + i * 0.0001, -8.0) for i in range(200)]
s = cd.simplificar(reta, 1.5)
ok("[simplificar] uma reta fica só com as pontas", len(s) == 2, str(len(s)))
curva = [(41.0 + 0.0003 * math.sin(i / 6.0), -8.0 + i * 0.0001) for i in range(400)]
s = cd.simplificar(curva, 1.5)
ok("[simplificar] uma curva fica com bem menos pontos", 10 < len(s) < 250, str(len(s)))
def dist_a_polilinha(p, linha):
    k = math.cos(math.radians(p[0])) * 111320.0; m = 110540.0
    best = 1e12
    for i in range(len(linha) - 1):
        ax, ay = (linha[i][1] - p[1]) * k, (linha[i][0] - p[0]) * m
        bx, by = (linha[i + 1][1] - p[1]) * k, (linha[i + 1][0] - p[0]) * m
        dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, -(ax * dx + ay * dy) / L))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best
ok("[simplificar] nenhum ponto original fica a mais de 1,6 m do desenho simplificado", max(dist_a_polilinha(p, s) for p in curva) <= 1.6)
ok("[simplificar] guarda sempre o primeiro e o último ponto", s[0] == curva[0] and s[-1] == curva[-1])

# --- 3. um GTFS pequeno com shapes: a base guarda o desenho e liga as viagens a ele
def gtfs_zip(com_shapes=True, shape_em_falta=False):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\nA,Noeda,41.1485,-8.5855\nB,Freixo,41.1512,-8.5760\nC,Rio Tinto,41.1760,-8.5560\n")
        z.writestr("routes.txt", "route_id,route_short_name,route_long_name,route_type\nR1,805,Teste,3\n")
        z.writestr("calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,1,1,20200101,20991231\n")
        z.writestr("trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n"
                   + "R1,S,T1,Rio Tinto,0,SH1\n" + ("R1,S,T2,Rio Tinto,0,SH_QUE_NAO_EXISTE\n" if shape_em_falta else "R1,S,T2,Rio Tinto,0,SH1\n") + "R1,S,T3,Rio Tinto,0,\n")
        z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                   + "".join(f"{t},08:0{i}:00,08:0{i}:00,{s},{i + 1}\n" for t in ("T1", "T2", "T3") for i, s in enumerate("ABC")))
        if com_shapes:
            linhas = ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence"]
            # desenho propositadamente com curva (a estrada dá a volta, não é reta entre A e B)
            caminho = [(41.1485, -8.5855), (41.1480, -8.5820), (41.1490, -8.5790), (41.1512, -8.5760), (41.1600, -8.5700), (41.1760, -8.5560)]
            for i, (la, lo) in reversed(list(enumerate(caminho))):  # fora de ordem de propósito
                linhas.append(f"SH1,{la},{lo},{i + 1}")
            z.writestr("shapes.txt", "\n".join(linhas) + "\n")
    return b.getvalue()

def base_nova():
    conn = sqlite3.connect(":memory:")
    conn.executescript(cd.SCHEMA_TABLES)
    return conn

hoje = datetime.datetime(2026, 10, 15, 12, 0)
conn = base_nova()
try:
    cd.ingest_gtfs(conn, "teste", gtfs_zip(), hoje)
except Exception as e:  # noqa: BLE001
    ok("[ingestão] o GTFS com shapes entra na base", False, repr(e)[:200])
else:
    colunas = [r[1] for r in conn.execute("PRAGMA table_info(trips)")]
    ok("[ingestão] a tabela trips tem shape_id", "shape_id" in colunas)
    tabelas = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    ok("[ingestão] existe a tabela shapes", "shapes" in tabelas)
    if "shape_id" in colunas and "shapes" in tabelas:
        viagens = dict(conn.execute("SELECT trip_id, shape_id FROM trips").fetchall())
        ok("[ingestão] as viagens T1 e T2 apontam para o desenho (com o prefixo do operador)", viagens.get("teste:T1") == "teste:SH1" and viagens.get("teste:T2") == "teste:SH1", str(viagens))
        ok("[ingestão] a viagem sem shape_id fica sem desenho", viagens.get("teste:T3") is None)
        linha = conn.execute("SELECT shape_id, feed_id, pontos FROM shapes").fetchall()
        ok("[ingestão] só se guarda o desenho que as viagens usam (1)", len(linha) == 1 and linha[0][0] == "teste:SH1" and linha[0][1] == "teste", str(len(linha)))
        pontos = cd.descodificar_polilinha(linha[0][2]) if linha else []
        ok("[ingestão] o desenho vem pela ordem certa (shape_pt_sequence), do Noeda ao Rio Tinto", len(pontos) >= 5 and abs(pontos[0][0] - 41.1485) < 1e-5 and abs(pontos[-1][0] - 41.1760) < 1e-5, str(pontos[:2]))
        ok("[ingestão] a curva da estrada fica guardada (o desenho passa por 41.1480,-8.5820)", dist_a_polilinha((41.1480, -8.5820), pontos) < 2.0)

conn = base_nova()
cd.ingest_gtfs(conn, "teste", gtfs_zip(shape_em_falta=True), hoje)
viagens = dict(conn.execute("SELECT trip_id, shape_id FROM trips").fetchall())
ok("[ingestão] viagem que aponta para um shape que não existe fica sem desenho (nunca aponta para o vazio)", viagens.get("teste:T2") is None, str(viagens))

conn = base_nova()
cd.ingest_gtfs(conn, "teste", gtfs_zip(com_shapes=False), hoje)
ok("[ingestão] feed sem shapes.txt entra na mesma, sem desenhos", conn.execute("SELECT COUNT(*) FROM trips").fetchone()[0] == 3 and conn.execute("SELECT COUNT(*) FROM shapes").fetchone()[0] == 0)

# --- 4. apagar um operador apaga os desenhos dele
conn = base_nova()
cd.ingest_gtfs(conn, "teste", gtfs_zip(), hoje)
cd.delete_feed(conn, "teste")
ok("[apagar] apagar o operador apaga os desenhos dele", conn.execute("SELECT COUNT(*) FROM shapes").fetchone()[0] == 0)

# --- 5. reaproveitar os dados de ontem funciona mesmo que a base de ontem ainda não tivesse shapes
with tempfile.TemporaryDirectory() as d:
    antes = os.path.join(d, "antes.db")
    c = sqlite3.connect(antes)
    c.executescript(cd.SCHEMA_TABLES.replace("trip_headsign TEXT, direction_id INTEGER DEFAULT 0,\n  shape_id TEXT", "trip_headsign TEXT, direction_id INTEGER DEFAULT 0"))
    c.execute("DROP TABLE IF EXISTS shapes")
    c.execute("INSERT INTO feeds (id, operator_name, mode, feed_type, source_origin, url, status, stops_count) VALUES ('teste','T','Autocarro','gtfs','seed','x','ok',3)")
    c.execute("INSERT INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon) VALUES ('teste:A','teste','A',41.1,-8.5)")
    c.execute("INSERT INTO routes (route_id, feed_id, route_short_name) VALUES ('teste:R1','teste','1')")
    c.execute("INSERT INTO trips (trip_id, feed_id, route_id, service_id) VALUES ('teste:T1','teste','teste:R1','S')")
    c.commit(); c.close()
    cd.PREV_DB = antes
    conn = base_nova()
    try:
        velho = cd.carry_over(conn, "teste")
        ok("[reaproveitar] base de ontem sem shapes: os dados de ontem entram na mesma", velho is not None and conn.execute("SELECT COUNT(*) FROM trips").fetchone()[0] == 1)
    except Exception as e:  # noqa: BLE001
        ok("[reaproveitar] base de ontem sem shapes: os dados de ontem entram na mesma", False, repr(e)[:200])

print(f"\n{falhas} FALHA(S)" if falhas else "\nOs desenhos dos percursos ficam guardados na base.")
sys.exit(1 if falhas else 0)
