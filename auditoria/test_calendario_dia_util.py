#!/usr/bin/env python3
"""STCP (Porto), ficheiro do portal aberto com as datas até 23/09/2026: as viagens só existem para o serviço de férias
(«UTIL FERIAS», de terça 1/9 a sexta 4/9); as segundas-feiras publicadas são todas do serviço escolar («UTIL ECOLAR»),
que não tem viagens. Ao prolongar o horário semanal, cada dia copiava o mesmo dia da semana mais recente com viagens:
como nunca houve uma segunda-feira com viagens, o Porto ficava sem autocarros da STCP todas as segundas-feiras
(confirmado na base de 9/11/2026: segunda 9 e segunda 16 com 0 viagens, terça a sexta com 5386).
Regra: depois do fim das datas do operador, um dia útil sem nenhum dia útil igual com viagens usa o dia útil mais
recente com viagens (nunca um sábado, domingo ou feriado). Dentro das datas do operador nada se inventa.
Uso: python auditoria/test_calendario_dia_util.py   (a partir da raiz do repositório; falha com exit 1)"""
import io, os, sqlite3, sys, zipfile, datetime
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

D = datetime.date
def ymd(d): return d.strftime("%Y%m%d")

def zip_gtfs(datas, viagens):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\nA,Aliados,41.1489,-8.6113\nB,Bolhão,41.1500,-8.6060\n")
        z.writestr("routes.txt", "route_id,route_short_name,route_long_name,route_type\nR1,200,Teste,3\n")
        z.writestr("calendar_dates.txt", "service_id,date,exception_type\n" + "".join(f"{s},{ymd(d)},1\n" for d, s in datas))
        z.writestr("trips.txt", "route_id,service_id,trip_id\n" + "".join(f"R1,{s},{t}\n" for s, t in viagens))
        z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                   + "".join(f"{t},08:00:00,08:00:00,A,1\n{t},08:10:00,08:10:00,B,2\n" for _, t in viagens))
    return b.getvalue()

def stcp_portal():
    """Como o ficheiro do portal: 1/9 (terça) a 4/9 férias; depois escolar nos dias úteis (sem viagens) até 23/9."""
    datas = []
    d = D(2026, 9, 1)
    while d <= D(2026, 9, 23):
        if d.weekday() == 5: datas.append((d, "SABADO"))
        elif d.weekday() == 6: datas.append((d, "DOM"))
        elif d <= D(2026, 9, 4): datas.append((d, "UTIL FERIAS"))
        else: datas.append((d, "UTIL ECOLAR"))
        d += datetime.timedelta(days=1)
    viagens = [("UTIL FERIAS", "F1"), ("UTIL FERIAS", "F2"), ("UTIL FERIAS", "F3"), ("SABADO", "S1"), ("SABADO", "S2"), ("DOM", "D1")]
    return zip_gtfs(datas, viagens)

def base():
    c = sqlite3.connect(":memory:")
    c.executescript(cd.SCHEMA_TABLES)
    return c

def ativos(conn, dia):
    col = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][dia.weekday()]
    return conn.execute(f"""SELECT COUNT(*) FROM trips WHERE feed_id = 't' AND service_id IN (
        SELECT service_id FROM calendar WHERE feed_id = 't' AND start_date <= :d AND end_date >= :d AND {col} = 1
        UNION SELECT service_id FROM calendar_dates WHERE feed_id = 't' AND date = :d AND exception_type = 1
        EXCEPT SELECT service_id FROM calendar_dates WHERE feed_id = 't' AND date = :d AND exception_type = 2)""", {"d": ymd(dia)}).fetchone()[0]

hoje = datetime.datetime(2026, 11, 10, 6, 0)  # terça
conn = base()
st = cd.ingest_gtfs(conn, "t", stcp_portal(), hoje, extend_calendar=True, max_back_days=730)
ok("[STCP] segunda 9/11 (ontem) tem os autocarros dos dias úteis", ativos(conn, D(2026, 11, 9)) == 3, str(ativos(conn, D(2026, 11, 9))))
ok("[STCP] segunda 16/11 tem os autocarros dos dias úteis", ativos(conn, D(2026, 11, 16)) == 3, str(ativos(conn, D(2026, 11, 16))))
ok("[STCP] segunda 23/11 (fim da janela) tem os autocarros dos dias úteis", ativos(conn, D(2026, 11, 23)) == 3, str(ativos(conn, D(2026, 11, 23))))
ok("[STCP] terça 10/11 continua igual", ativos(conn, D(2026, 11, 10)) == 3, str(ativos(conn, D(2026, 11, 10))))
ok("[STCP] sábado 14/11 continua com o sábado", ativos(conn, D(2026, 11, 14)) == 2, str(ativos(conn, D(2026, 11, 14))))
ok("[STCP] domingo 15/11 continua com o domingo", ativos(conn, D(2026, 11, 15)) == 1, str(ativos(conn, D(2026, 11, 15))))
ok("[STCP] feriado 1/12 fora da janela não é tocado", ativos(conn, D(2026, 12, 1)) == 0, str(ativos(conn, D(2026, 12, 1))))

# Dentro das datas do operador: se não publicou segundas-feiras, não se inventam
datas, d = [], D(2026, 11, 1)
while d <= D(2026, 11, 30):
    if d.weekday() != 0: datas.append((d, "U" if d.weekday() < 5 else ("S" if d.weekday() == 5 else "DOM")))
    d += datetime.timedelta(days=1)
conn = base()
cd.ingest_gtfs(conn, "t", zip_gtfs(datas, [("U", "U1"), ("U", "U2"), ("S", "S1"), ("DOM", "D1")]), hoje)
ok("[dentro das datas] operador sem segundas-feiras continua sem segundas-feiras", ativos(conn, D(2026, 11, 16)) == 0, str(ativos(conn, D(2026, 11, 16))))
ok("[dentro das datas] terça continua com os dias úteis", ativos(conn, D(2026, 11, 17)) == 2, str(ativos(conn, D(2026, 11, 17))))

# Depois das datas, um dia útil nunca copia um sábado nem um domingo
datas = [(D(2026, 9, 5), "S"), (D(2026, 9, 6), "DOM"), (D(2026, 9, 7), "VAZIO")]
conn = base()
cd.ingest_gtfs(conn, "t", zip_gtfs(datas, [("S", "S1"), ("DOM", "D1")]), hoje, extend_calendar=True, max_back_days=730)
ok("[só fins de semana] segunda continua sem autocarros (não copia o sábado)", ativos(conn, D(2026, 11, 16)) == 0, str(ativos(conn, D(2026, 11, 16))))
ok("[só fins de semana] sábado continua com o sábado", ativos(conn, D(2026, 11, 14)) == 1, str(ativos(conn, D(2026, 11, 14))))
sys.exit(1 if falhas else 0)
