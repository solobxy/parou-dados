#!/usr/bin/env python3
"""Rede SIGA (Madeira): o IMT Madeira publica num só ficheiro os autocarros de três operadores (Horários do Funchal,
SIGA Rodoeste e CAM). O Funchal já vem da fonte própria, por isso cada operador da SIGA entra à parte, só com o que é dele.
Cada linha vem partida em muitas variantes (CAM: «Boqueirão0I», «BoqueirãoAI», «Boqueirão 0V»; Rodoeste: «Funchal -
Castelejo», «Castelejo - Funchal via Covão»…): juntam-se numa só linha pelo número, com o nome da variante com mais
viagens no sentido de ida (sem o código de variante no fim, na CAM). Os destinos «Fajã Penedo|via Cabo Girão» ficam
«Fajã Penedo via Cabo Girão».
Confirma também que só entram as paragens, desenhos e serviços que as viagens do operador usam (nada do Funchal).
Uso: python auditoria/test_siga_agencias.py   (a partir da raiz do repositório; falha com exit 1)"""
import io, os, sqlite3, sys, zipfile, datetime, csv
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

b = io.BytesIO()
with zipfile.ZipFile(b, "w") as z:
    z.writestr("agency.txt", "agency_id,agency_name,agency_url,agency_timezone\n"
               "1,HF,https://www.horariosdofunchal.pt/,Europe/Lisbon\n2,SIGA RODOESTE,https://www.rodoeste.com.pt/,Europe/Lisbon\n"
               "3,Companhia de Autocarros da Madeira (CAM),https://www.cam-madeira.pt/,Europe/Lisbon\n")
    z.writestr("feed_info.txt", "feed_publisher_name,feed_publisher_url,feed_lang\nIMT IP-RAM - Rede SIGA,https://siga.madeira.gov.pt/,pt\n")
    z.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon,parent_station,location_type\n"
               "00001,Marina (00001),32.6440,-16.9100,,0\n"            # só do Funchal
               "00025,Teleférico Término (00025),32.6460,-16.9050,E1,0\n"  # partilhada CAM/Funchal, com estação
               "E1,Teleférico,32.6461,-16.9051,,1\n"
               "68137,Fonte Almocreves (68137),32.6600,-16.8500,,0\n"
               "01289,Praia Formosa (01289),32.6380,-16.9500,,0\n"
               "24114,Estacao R Brava (24114),32.6720,-17.0640,,0\n"
               "99999,Paragem sem viagens (99999),32.7000,-17.0000,,0\n")
    z.writestr("routes.txt", "route_id,agency_id,route_short_name,route_long_name,route_type\n"
               "HF1,1,1,Funchal - Barreiros,3\n"
               "C1,3,503,Boqueirão0I,3\nC2,3,503,BoqueirãoAI,3\nC3,3,503,Boqueirão 0V,3\nC4,3,503,BoqueirãoCV,3\n"
               "C5,3,500,Aerobus Praia Formosa - Aeroporto,3\nC6,3,500,Aerobus Aeroporto - Praia Formosa,3\n"
               "C7,3,726,Ribeira SecaV,3\n"
               "C8,3,995,0I,3\nC9,3,995,Porto de AbrigoAV,3\n"  # variante com mais viagens cujo nome é só o código
               "R1,2,203,Funchal - Castelejo,3\nR2,2,203,Castelejo - Funchal via Covão,3\nR3,2,203,Funchal - Castelejo Via Rapida,3\n"
               "RX,2,207,Funchal - Ribeira Brava via Cabo Girão,3\n")  # linha sem viagens: não entra
    z.writestr("calendar_dates.txt", "service_id,date,exception_type\nSF,20261118,1\nSC,20261118,1\nSR,20261118,1\nSX,20261118,1\n")
    viagens = [  # trip, route, service, headsign, direction, shape, paragens
        ("HF_T1", "HF1", "SF", "Barreiros", 0, "SH_HF", ["00001", "00025"]),
        ("C_T1", "C1", "SC", "", 0, "SH_C1", ["00025", "68137"]), ("C_T2", "C1", "SC", "", 0, "SH_C1", ["00025", "68137"]),
        ("C_T3", "C2", "SC", "", 0, "SH_C1", ["00025", "68137"]), ("C_T4", "C3", "SC", "", 1, "SH_C3", ["68137", "00025"]),
        ("C_T5", "C4", "SC", "", 1, "SH_C3", ["68137", "00025"]), ("C_T6", "C5", "SC", "", 0, "", ["01289", "00025"]),
        ("C_T7", "C6", "SC", "", 1, "", ["00025", "01289"]), ("C_T8", "C7", "SC", "", 1, "", ["68137", "00025"]),
        ("C_T9", "C8", "SC", "", 0, "", ["68137", "00025"]), ("C_T10", "C8", "SC", "", 0, "", ["68137", "00025"]),
        ("C_T11", "C9", "SC", "", 1, "", ["00025", "68137"]),
        ("R_T1", "R1", "SR", "Castelejo|via Fontes", 0, "", ["01289", "24114"]),
        ("R_T2", "R1", "SR", "Castelejo", 0, "", ["01289", "24114"]),
        ("R_T3", "R3", "SR", "Castelejo|Via Rapida", 0, "", ["01289", "24114"]),
        ("R_T4", "R2", "SR", "Funchal|via Covão", 1, "", ["24114", "01289"]),
    ]
    z.writestr("trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n"
               + "".join(f"{r},{s},{t},{h},{d},{sh}\n" for t, r, s, h, d, sh, _ in viagens))
    z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
               + "".join(f"{t},08:0{i}:00,08:0{i}:00,{p},{i + 1}\n" for t, *_, ps in viagens for i, p in enumerate(ps)))
    z.writestr("shapes.txt", "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
               + "".join(f"{s},32.64,-16.9{k},{k}\n" for s in ("SH_HF", "SH_C1", "SH_C3") for k in range(3)))
original = b.getvalue()

def ficheiro(zbytes, nome):
    with zipfile.ZipFile(io.BytesIO(zbytes)) as z:
        return list(csv.DictReader(io.TextIOWrapper(z.open(nome), "utf-8-sig")))

# --- CAM (agência 3), com o código de variante no fim do nome
cam = cd.filtrar_agencias(original, ["3"], juntar_variantes=True, sufixo_variante=True)
rotas = {r["route_short_name"]: r for r in ficheiro(cam, "routes.txt")}
ok("CAM: só as linhas da CAM, uma por número", sorted(rotas) == ["500", "503", "726", "995"], str(sorted(rotas)))
ok("CAM: 995 fica com o nome da variante que tem nome («Porto de Abrigo»), não vazio", rotas.get("995", {}).get("route_long_name") == "Porto de Abrigo",
   repr(rotas.get("995", {}).get("route_long_name")))
ok("CAM: 503 fica «Boqueirão» (variante com mais viagens de ida, sem o código)", rotas.get("503", {}).get("route_long_name") == "Boqueirão",
   repr(rotas.get("503", {}).get("route_long_name")))
ok("CAM: 500 fica com o nome de ida inteiro (sem código para tirar)", rotas.get("500", {}).get("route_long_name") == "Aerobus Praia Formosa - Aeroporto",
   repr(rotas.get("500", {}).get("route_long_name")))
ok("CAM: 726 só com volta fica «Ribeira Seca» (o «V» sozinho também é código)", rotas.get("726", {}).get("route_long_name") == "Ribeira Seca",
   repr(rotas.get("726", {}).get("route_long_name")))
viag = ficheiro(cam, "trips.txt")
ok("CAM: as 11 viagens da CAM, nenhuma do Funchal nem da Rodoeste", sorted(t["trip_id"] for t in viag) == sorted(f"C_T{i}" for i in range(1, 12)))
ok("CAM: as viagens das variantes apontam para a linha juntada", {t["route_id"] for t in viag if t["trip_id"] in ("C_T1", "C_T3", "C_T4", "C_T5")} == {rotas["503"]["route_id"]})
ok("CAM: o sentido de cada viagem mantém-se", {t["trip_id"]: t["direction_id"] for t in viag}.get("C_T4") == "1")
par = {p["stop_id"] for p in ficheiro(cam, "stops.txt")}
ok("CAM: só as paragens que as viagens da CAM usam (e a estação-mãe)", par == {"00025", "E1", "68137", "01289"}, str(sorted(par)))
ok("CAM: só os desenhos usados", {s["shape_id"] for s in ficheiro(cam, "shapes.txt")} == {"SH_C1", "SH_C3"})
ok("CAM: só os serviços usados", {s["service_id"] for s in ficheiro(cam, "calendar_dates.txt")} == {"SC"})
ok("CAM: agency.txt só com a CAM", [a["agency_id"] for a in ficheiro(cam, "agency.txt")] == ["3"])

# --- Rodoeste (agência 2), sem código de variante (o nome não perde letras no fim)
rod = cd.filtrar_agencias(original, ["2"], juntar_variantes=True)
rotas = {r["route_short_name"]: r for r in ficheiro(rod, "routes.txt")}
ok("Rodoeste: uma linha 203 e nenhuma linha sem viagens (207)", sorted(rotas) == ["203"], str(sorted(rotas)))
ok("Rodoeste: 203 fica com o nome de ida com mais viagens", rotas.get("203", {}).get("route_long_name") == "Funchal - Castelejo",
   repr(rotas.get("203", {}).get("route_long_name")))
dest = {t["trip_id"]: t["trip_headsign"] for t in ficheiro(rod, "trips.txt")}
ok("Rodoeste: «Castelejo|via Fontes» fica «Castelejo via Fontes»", dest.get("R_T1") == "Castelejo via Fontes", repr(dest.get("R_T1")))
ok("Rodoeste: destino sem «|» fica igual", dest.get("R_T2") == "Castelejo", repr(dest.get("R_T2")))

# --- Sem juntar variantes: as linhas ficam como vêm (só o filtro do operador)
so = cd.filtrar_agencias(original, ["3"])
ok("sem juntar: as 9 linhas da CAM como vêm", len(ficheiro(so, "routes.txt")) == 9)

# --- Passa pela gravação normal da base
conn = sqlite3.connect(":memory:")
conn.executescript(cd.SCHEMA_TABLES)
st = cd.ingest_gtfs(conn, "cam_madeira", cam, datetime.datetime(2026, 11, 18, 6, 0))
ok("gravação: 4 linhas, 4 paragens e 11 viagens da CAM", (st["routes"], st["stops"], st["trips"]) == (4, 4, 11), str((st["routes"], st["stops"], st["trips"])))
ok("gravação: nenhuma paragem só do Funchal", not conn.execute("SELECT 1 FROM stops WHERE stop_id = 'cam_madeira:00001'").fetchone())
sys.exit(1 if falhas else 0)
