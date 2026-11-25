#!/usr/bin/env python3
"""UNIR com horários no planeador. A TMP publica o GTFS da UNIR na plataforma GO da TML
(https://go.tmlmobilidade.pt/hub/api/v1/53JAZ/plans/gtfs). O construtor junta-o como feed "unirh", só para o planeador
(como o "cmh" da Carris Metropolitana):
- as linhas passam a "unirh:<número>" (o planeador lê a linha "unir:<número>" que a app já tem);
- as paragens passam às da UNIR que a app já tem (pelo código antigo da AMP em legacy_ids, ou pela mais perto até 30 m),
  escritas "unirh:<código>" nos horários; as paragens e linhas próprias do feed saem;
- quando o ficheiro chega bem guarda-se uma cópia (fontes/unir-horarios.zip); se o download falhar usa-se a cópia
  (no máximo 21 dias); com poucas paragens iguais às da UNIR não se junta nada.
Uso: python auditoria/test_unir_horarios.py   (a partir da raiz do repositório; falha com exit 1)"""
import datetime, io, os, sqlite3, sys, tempfile, zipfile, urllib.error
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

if not hasattr(cd, "process_horarios_unir"):
    ok("o construtor tem process_horarios_unir", False)
    sys.exit(1)

pasta = tempfile.mkdtemp()
cd.UNIR_COPIA = os.path.join(pasta, "fontes", "unir-horarios.zip")
cd.time.sleep = lambda s: None

def gtfs(paragens_iguais=True):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("agency.txt", "agency_id,agency_name,agency_url,agency_timezone\nKJTOU,Unir,https://www.unir.pt,Europe/Lisbon\n")
        z.writestr("routes.txt", "agency_id,route_id,route_short_name,route_long_name,route_type,route_color\n"
                                 "KJTOU,[KJTOU]ln:5101:0,5101,Sete Bicas - Fim,3,CE9926\nKJTOU,[KJTOU]ln:5101:1,5101,Sete Bicas - Outro,3,CE9926\n")
        leg = ("KJTOU-prg:mai:1", "KJTOU-prg:mai:2|1H6XC-prg:mai:2", "") if paragens_iguais else ("KJTOU-prg:xxx:1", "KJTOU-prg:xxx:2", "")
        z.writestr("stops.txt", "stop_id,stop_code,stop_name,stop_lat,stop_lon,legacy_ids\n"
                                f"100001,100001,Sete Bicas,41.2000,-8.6000,{leg[0]}\n"
                                f"100002,100002,Meio,41.2100,-8.6000,{leg[1]}\n"
                                # sem código antigo: liga-se à paragem da UNIR mais perto (a 11 m)
                                f"100003,100003,Fim,41.22010,-8.6000,{leg[2]}\n")
        z.writestr("calendar_dates.txt", "date,exception_type,service_id\n" + "".join(
            f"{(datetime.date(2026, 11, 25) + datetime.timedelta(days=i)).strftime('%Y%m%d')},1,[PLAGF][KJTOU]ut1:A-U\n" for i in range(10)))
        z.writestr("trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id\n"
                                "[KJTOU]ln:5101:0,[PLAGF][KJTOU]ut1:A-U,[PLAGF][KJTOU]A-U:5101:0:1:0800,Fim,0\n"
                                "[KJTOU]ln:5101:1,[PLAGF][KJTOU]ut1:A-U,[PLAGF][KJTOU]A-U:5101:1:1:0900,Outro,0\n")
        z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                                     "[PLAGF][KJTOU]A-U:5101:0:1:0800,08:00:00,08:00:00,100001,1\n"
                                     "[PLAGF][KJTOU]A-U:5101:0:1:0800,08:05:00,08:05:00,100002,2\n"
                                     "[PLAGF][KJTOU]A-U:5101:0:1:0800,08:10:00,08:10:00,100003,3\n"
                                     "[PLAGF][KJTOU]A-U:5101:1:1:0900,09:00:00,09:00:00,100001,1\n"
                                     "[PLAGF][KJTOU]A-U:5101:1:1:0900,09:07:00,09:07:00,100002,2\n")
    return b.getvalue()

def base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(cd.SCHEMA_TABLES)
    for sid, la in (("unir:mai:1", 41.2000), ("unir:mai:2", 41.2100), ("unir:mai:3", 41.2200)):
        conn.execute("INSERT INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon) VALUES (?, 'unir', ?, ?, -8.6)", (sid, sid, la))
    conn.execute("INSERT INTO routes (route_id, feed_id, route_short_name, route_long_name, route_type) VALUES ('unir:5101', 'unir', '5101', 'Sete Bicas', 3)")
    return conn

resposta = {"modo": "ok", "corpo": gtfs()}
def falso_http(url, timeout=180, insecure=False):
    if resposta["modo"] == "falha":
        raise urllib.error.URLError("sem ligação")
    return 200, resposta["corpo"]
cd.http_get = falso_http
hoje = datetime.datetime(2026, 11, 25, 3, 30, tzinfo=datetime.timezone.utc)

# 1) O ficheiro chega bem
conn = base()
cd.process_horarios_unir(conn, hoje)
viagens = conn.execute("SELECT trip_id, route_id FROM trips WHERE feed_id = 'unirh' ORDER BY trip_id").fetchall()
ok("[bem] as duas viagens entram no feed unirh", len(viagens) == 2, str(viagens))
ok("[bem] as linhas passam a unirh:<número> (as duas variantes da 5101)", all(r == "unirh:5101" for _, r in viagens), str(viagens))
ok("[bem] o código da viagem fica com o prefixo e o código da TMP (o do tempo real)",
   any(t == "unirh:[PLAGF][KJTOU]A-U:5101:0:1:0800" for t, _ in viagens), str(viagens))
pts = [r[0] for r in conn.execute("SELECT stop_id FROM stop_times WHERE trip_id = 'unirh:[PLAGF][KJTOU]A-U:5101:0:1:0800' ORDER BY stop_sequence")]
ok("[bem] as paragens passam às da UNIR (código antigo e, sem ele, a mais perto)", pts == ["unirh:mai:1", "unirh:mai:2", "unirh:mai:3"], str(pts))
ok("[bem] o feed não fica com paragens nem linhas próprias", conn.execute("SELECT COUNT(*) FROM stops WHERE feed_id = 'unirh'").fetchone()[0] == 0
   and conn.execute("SELECT COUNT(*) FROM routes WHERE feed_id = 'unirh'").fetchone()[0] == 0)
ok("[bem] as paragens e a linha da UNIR ficam como estavam", conn.execute("SELECT COUNT(*) FROM stops WHERE feed_id = 'unir'").fetchone()[0] == 3
   and conn.execute("SELECT COUNT(*) FROM routes WHERE feed_id = 'unir'").fetchone()[0] == 1)
ok("[bem] há calendário para o planeador", conn.execute("SELECT COUNT(*) FROM calendar_dates WHERE feed_id = 'unirh'").fetchone()[0] >= 5)
ok("[bem] guardou a cópia do ficheiro", os.path.exists(cd.UNIR_COPIA))

# 2) O download falha: usa-se a cópia
resposta["modo"] = "falha"
conn = base()
cd.process_horarios_unir(conn, hoje)
ok("[falha] com cópia recente, as viagens entram na mesma", conn.execute("SELECT COUNT(*) FROM trips WHERE feed_id = 'unirh'").fetchone()[0] == 2)

# 3) Cópia antiga demais: não se usa
velho = (hoje - datetime.timedelta(days=30)).timestamp()
os.utime(cd.UNIR_COPIA, (velho, velho))
conn = base()
cd.process_horarios_unir(conn, hoje)
ok("[falha] com cópia de há 30 dias, não entra nada", conn.execute("SELECT COUNT(*) FROM trips WHERE feed_id = 'unirh'").fetchone()[0] == 0)

# 4) Paragens que não batem com as da UNIR: não se junta nada (melhor sem horários do que com paragens erradas)
resposta.update(modo="ok", corpo=gtfs(paragens_iguais=False))
conn = base()
conn.execute("UPDATE stops SET stop_lat = stop_lat + 0.01")  # longe demais para a ligação por proximidade
cd.process_horarios_unir(conn, hoje)
ok("[paragens erradas] não entra nada", conn.execute("SELECT COUNT(*) FROM trips WHERE feed_id = 'unirh'").fetchone()[0] == 0)

print("\nTudo OK" if not falhas else f"\n{falhas} FALHA(S)")
sys.exit(1 if falhas else 0)
