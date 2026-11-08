#!/usr/bin/env python3
"""Operadores que só publicam as próximas semanas (SMTUC, Coimbra: datas até 12/11, o ficheiro novo chega depois; os
sábados vinham só como «especial»). Sem ponte, Coimbra ficava sem autocarros ao sábado e, a partir de dia 13, em todos
os dias. Regra: quando as datas acabam dentro da janela e o operador tinha serviço nos dias antes do fim, continua o
horário semanal (o mesmo dia da semana mais recente com viagens; feriado = domingo) até PONTE_DIAS depois do fim.
Um operador que deixou de ter serviço (sem viagens na última semana) ou que acabou há muito tempo não é inventado.
Uso: python auditoria/test_calendario_ponte.py   (a partir da raiz do repositório; falha com exit 1)"""
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

def gtfs(fim, sem_servico_no_fim=False):
    """Só calendar_dates, como os SMTUC: dias úteis (U), domingos (DOM), sábados só como especial (ESP) num sábado."""
    linhas = ["service_id,date,exception_type"]
    d = fim - datetime.timedelta(days=40)
    while d <= fim:
        ultima_semana = (fim - d).days < 8
        if sem_servico_no_fim and ultima_semana:
            linhas.append(f"NADA,{ymd(d)},1")  # as datas continuam até ao fim, mas sem viagens (o serviço acabou)
        else:
            if d.weekday() < 5: linhas.append(f"U,{ymd(d)},1")
            elif d.weekday() == 6: linhas.append(f"DOM,{ymd(d)},1")
            else: linhas.append(f"SAB,{ymd(d)},1")  # serviço de sábado sem viagens (como nos SMTUC)
        d += datetime.timedelta(days=1)
    sab = fim - datetime.timedelta(days=(fim.weekday() - 5) % 7)  # último sábado até ao fim
    if not sem_servico_no_fim:
        linhas.append(f"ESP,{ymd(sab)},1")
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\nA,Portagem,40.2070,-8.4290\nB,Celas,40.2180,-8.4150\n")
        z.writestr("routes.txt", "route_id,route_short_name,route_long_name,route_type\nR1,7,Teste,3\n")
        z.writestr("calendar_dates.txt", "\n".join(linhas) + "\n")
        viagens = [("U", "TU1"), ("U", "TU2"), ("U", "TU3"), ("DOM", "TD1"), ("ESP", "TE1"), ("ESP", "TE2")]
        z.writestr("trips.txt", "route_id,service_id,trip_id\n" + "".join(f"R1,{s},{t}\n" for s, t in viagens))
        z.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                   + "".join(f"{t},08:00:00,08:00:00,A,1\n{t},08:10:00,08:10:00,B,2\n" for _, t in viagens))
    return b.getvalue()

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
fim = D(2026, 11, 12)                          # quinta: o operador publicou até aqui
conn = base()
st = cd.ingest_gtfs(conn, "t", gtfs(fim), hoje)
ok("[ponte] dentro das datas: quarta tem os autocarros dos dias úteis", ativos(conn, D(2026, 11, 11)) == 3, str(ativos(conn, D(2026, 11, 11))))
ok("[ponte] sexta 13 (depois do fim das datas) continua com os dias úteis", ativos(conn, D(2026, 11, 13)) == 3, str(ativos(conn, D(2026, 11, 13))))
ok("[ponte] sábado 14 usa o último sábado com viagens (o especial)", ativos(conn, D(2026, 11, 14)) == 2, str(ativos(conn, D(2026, 11, 14))))
ok("[ponte] domingo 15 usa o domingo", ativos(conn, D(2026, 11, 15)) == 1, str(ativos(conn, D(2026, 11, 15))))
ok("[ponte] segunda 23 (fim da janela) continua", ativos(conn, D(2026, 11, 23)) == 3, str(ativos(conn, D(2026, 11, 23))))
ok("[ponte] fica marcado como prolongado (nota no manifesto), não como expirado", st.get("extended") and not st.get("expired"), str({k: st.get(k) for k in ("extended", "expired", "past_end")}))
ok("[ponte] feriado de 1 de dezembro (fora das datas) usa o horário de domingo",
   (lambda c: (cd.ingest_gtfs(c, "t", gtfs(D(2026, 11, 26)), datetime.datetime(2026, 11, 24, 6, 0)), ativos(c, D(2026, 12, 1)))[1])(base()) == 1)

# Operador que deixou de ter serviço na última semana antes do fim: não se inventa
conn = base()
cd.ingest_gtfs(conn, "t", gtfs(fim, sem_servico_no_fim=True), hoje)
ok("[sem ponte] sem viagens na última semana, não se prolonga", ativos(conn, D(2026, 11, 13)) == 0, str(ativos(conn, D(2026, 11, 13))))
# Datas que acabaram há muito (mais de PONTE_DIAS): não se inventa
conn = base()
cd.ingest_gtfs(conn, "t", gtfs(D(2026, 9, 1)), hoje)
ok("[sem ponte] datas acabadas há mais de dois meses: não se prolonga", ativos(conn, D(2026, 11, 11)) == 0, str(ativos(conn, D(2026, 11, 11))))
sys.exit(1 if falhas else 0)
