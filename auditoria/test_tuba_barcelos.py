#!/usr/bin/env python3
"""TUBA (Barcelos): do PDF (palavras com posição, como as dá o `pdftotext -bbox`) ao GTFS, com dados
pequenos feitos à mão (sem rede nem pdftotext).
Uso: python auditoria/test_tuba_barcelos.py"""
import csv
import datetime as dt
import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tuba_barcelos as T  # noqa: E402

falhas = 0


def ok(nome, cond, extra=""):
    global falhas
    if not cond:
        falhas += 1
    print("OK     " if cond else "FALHOU ", nome, extra)


# ---------------------------------------------------------------- página de PDF feita à mão
def w(x, y, texto, cw=4.0):
    return f'<word xMin="{x:.2f}" yMin="{y:.2f}" xMax="{x + cw * len(texto):.2f}" yMax="{y + 8:.2f}">{texto}</word>'


def linha_texto(x, y, texto):
    out, xx = [], x
    for p in texto.split():
        out.append(w(xx, y, p))
        xx += 4.0 * len(p) + 3
    return out


def celula(cx, y, tok):
    largura = 4.0 * len(tok)
    return w(cx - largura / 2, y, tok)


COLS = [300, 340, 380, 420, 620]  # as 4 primeiras: dias úteis; a última: sábados
palavras = []
palavras += linha_texto(100, 66, "Horário")
palavras += [w(110, 91, "M99")] + linha_texto(500, 91, "Barcelos - Teste")
palavras += linha_texto(53, 110, "2ª a 6ª Feira (exceto feriados)") + [w(600, 110, "SÁBADOS")]
palavras += [celula(340, 118, "A"), celula(380, 118, "B")]
tab1 = [
    ("Paragem Um", ["07:00", "08:00", "08:00", "10:00", "12:00"]),
    ("Paragem Dois", ["07:05", "X", "08:06", "19:05", "12:05"]),   # 19:05: gralha do PDF
    ("Paragem Três", ["07:10", "08:10", "8:12", "10:10", "12:10"]),
]
y = 127
for nome, toks in tab1:
    palavras += linha_texto(53, y, nome)
    palavras += [celula(cx, y, t) for cx, t in zip(COLS, toks)]
    y += 8.4
y = 170
palavras += [celula(300, y - 9, "A")]
tab2 = [("Paragem Três", ["17:00", "18:00"]), ("Paragem Dois", ["17:04", "-"]), ("Paragem Um", ["17:10", "18:10"])]
for nome, toks in tab2:
    palavras += linha_texto(53, y, nome)
    palavras += [celula(cx, y, t) for cx, t in zip(COLS, toks)]
    y += 8.4
palavras += linha_texto(52, 210, "A - Só se efetua no período escolar")
palavras += linha_texto(52, 218, "B - Só se efetua fora do período escolar")
palavras += linha_texto(52, 226, "X - Paragem sem passagem de autocarro")
xhtml = ('<doc><page width="841.0" height="595.0">' + "".join(palavras) + "</page>"
         '<page width="841.0" height="595.0">' + "".join(linha_texto(60, 80, "M99 Barcelos – Teste, via Algures")) + "</page></doc>")

paginas = T.paginas_de_bbox(xhtml)
ok("bbox: palavras lidas", len(paginas) == 2 and len(paginas[0]) > 40, len(paginas[0]))
blocos = T.ler_blocos(paginas)
ok("um bloco M99 com 2 tabelas", len(blocos) == 1 and blocos[0]["linha"] == "M99" and len(blocos[0]["tabelas"]) == 2,
   [(b["linha"], len(b["tabelas"])) for b in blocos])
b = blocos[0]
t1, t2 = b["tabelas"]
ok("tabela 1: 3 paragens, 5 viagens", len(t1["paragens"]) == 3 and len(t1["viagens"]) == 5, (t1["paragens"], len(t1["viagens"])))
ok("coluna à direita de «SÁBADOS» é de sábado", [v["dias"] for v in t1["viagens"]] == ["uteis"] * 4 + ["sab"],
   [v["dias"] for v in t1["viagens"]])
ok("letras A/B -> escolar/férias", [v["regra"] for v in t1["viagens"]] == [None, "escolar", "ferias", None, None],
   [v["regra"] for v in t1["viagens"]])
ok("letra por cima da 2.ª tabela", [v["regra"] for v in t2["viagens"]] == ["escolar", None], [v["regra"] for v in t2["viagens"]])
ok("municipal: só pontos principais (não é lista completa)", not t1["completa"])
vs = T.viagens_da_tabela(t1)
ok("«X» tira a paragem da viagem", [pi for pi, _ in vs[1][1]] == [0, 2], vs[1][1])
ok("hora «8:12» lida", vs[2][1][-1][1] == 8 * 60 + 12, vs[2][1])
ok("gralha 19:05 passa a interpolada", vs[3][1] == [(0, 600), (1, None), (2, 610)], vs[3][1])
vs2 = T.viagens_da_tabela(t2)
ok("«-» fica como paragem sem hora", vs2[1][1] == [(0, 1080), (1, None), (2, 1090)], vs2[1][1])

# ---------------------------------------------------------------- notas
ok("nota: período escolar", T.regra_da_nota("Só se efetua em dias úteis, no período escolar") == "escolar")
ok("nota: fora do período escolar", T.regra_da_nota("Só se efetua fora do período escolar") == "ferias")
ok("nota: também sábados, domingos e feriados", T.regra_da_nota("Também se efectua aos sábados, domingos e feriados") == "sab_dom_fer")
ok("nota: também aos sábados", T.regra_da_nota("Também se efectua aos sábados") == "sab")
ok("nota: «* Só funciona em Tempo de Aulas»", T.regra_da_nota("Só funciona em Tempo de Aulas") == "escolar")
ok("nota informativa não restringe", T.regra_da_nota("Horário efetuado pela linha M77") is None
   and T.regra_da_nota("Efetua Transbordo em Lijó (Escola) em período Escolar para Barcelos") is None)

# ---------------------------------------------------------------- calendário
sexta, sabado, domingo = dt.date(2026, 11, 27), dt.date(2026, 11, 28), dt.date(2026, 11, 29)
ok("feriados: 8/12, Sexta-feira Santa 2027, 3/5 (Barcelos)", T.feriado(dt.date(2026, 12, 8)) and T.feriado(dt.date(2027, 3, 26))
   and T.feriado(dt.date(2027, 5, 3)) and not T.feriado(sexta))
ok("aulas: 27/11 sim, 16/12 não, 9/2/2027 (Carnaval) não, 5/4/2027 sim",
   T.dia_de_aulas(sexta) and not T.dia_de_aulas(dt.date(2026, 12, 16)) and not T.dia_de_aulas(dt.date(2027, 2, 9))
   and T.dia_de_aulas(dt.date(2027, 4, 5)))
ok("aulas fora da tabela (2029): padrão habitual", T.dia_de_aulas(dt.date(2029, 10, 15)) and not T.dia_de_aulas(dt.date(2029, 8, 1)))
ok("escolar: sexta sim, férias de Natal não", T.circula("uteis", "escolar", sexta) and not T.circula("uteis", "escolar", dt.date(2026, 12, 21)))
ok("férias: o contrário", not T.circula("uteis", "ferias", sexta) and T.circula("uteis", "ferias", dt.date(2026, 12, 21)))
ok("dias úteis: não no feriado nem ao sábado", not T.circula("uteis", None, dt.date(2026, 12, 8)) and not T.circula("uteis", None, sabado))
ok("«também sábados, domingos e feriados»", T.circula("uteis", "sab_dom_fer", domingo) and T.circula("uteis", "sab_dom_fer", dt.date(2026, 12, 8)))
ok("«também aos sábados»: sábado sim, domingo não", T.circula("uteis", "sab", sabado) and not T.circula("uteis", "sab", domingo))
ok("sábados: só ao sábado", T.circula("sab", None, sabado) and not T.circula("sab", None, sexta))

# ---------------------------------------------------------------- GTFS antigo (base de paragens e traçados)
def zip_gtfs(ficheiros):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for nome, linhas in ficheiros.items():
            z.writestr(nome, "\n".join(linhas) + "\n")
    return buf.getvalue()


velho_zip = zip_gtfs({
    "stops.txt": ["stop_id,stop_name,stop_lat,stop_lon",
                  "S1,Paragem Um,41.5300,-8.6200", "S1b,Rua do Meio,41.5310,-8.6210",
                  "S2,Paragem Dois,41.5320,-8.6220", "S3,Paragem Três (Centro),41.5340,-8.6240",
                  "S3x,Paragem Três (Centro),41.5341,-8.6239", "Z9,Outra Terra,41.6000,-8.7000"],
    "routes.txt": ["route_id,route_short_name,route_long_name,route_type", "BAR99,M99,Teste,3"],
    "trips.txt": ["route_id,service_id,trip_id,direction_id,shape_id", "BAR99,X,v1,0,SH1", "BAR99,X,v2,1,SH2"],
    "stop_times.txt": ["trip_id,arrival_time,departure_time,stop_id,stop_sequence",
                       "v1,07:00:00,07:00:00,S1,1", "v1,07:03:00,07:03:00,S1b,2", "v1,07:05:00,07:05:00,S2,3",
                       "v1,07:10:00,07:10:00,S3,4",
                       "v2,17:00:00,17:00:00,S3x,1", "v2,17:04:00,17:04:00,S2,2", "v2,17:10:00,17:10:00,S1,3"],
    "shapes.txt": ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
                   "SH1,41.53,-8.62,1", "SH1,41.534,-8.624,2", "SH2,41.534,-8.624,1", "SH2,41.53,-8.62,2"],
})
velho = T.ler_gtfs(velho_zip)
sem = T.Semelhanca([s["stop_name"] for s in velho["stops"].values()])
pdf = [(t1["paragens"][pi], m) for pi, m in vs[0][1]]
out, shape, cob, modo = T.encaixar("M99", pdf, velho, sem, False)
ok("encaixe no percurso antigo: paragem do meio com hora interpolada",
   [s for s, _ in out] == ["S1", "S1b", "S2", "S3"] and [x // 60 for _, x in out] == [420, 423, 425, 430] and cob == 1.0,
   (out, cob, modo))
ok("percurso inteiro leva o traçado antigo", shape == "SH1", shape)
pdf_g = [(t1["paragens"][pi], m) for pi, m in vs[3][1]]
out_g, _, _, _ = T.encaixar("M99", pdf_g, velho, sem, False)
ok("gralha: hora do meio interpolada (não 19:05)", [x // 60 for _, x in out_g] == [600, 603, 605, 610], out_g)
lista = [("Paragem Um", 480), ("Paragem Dois", None), ("Paragem Três", 490)]
out_l, _, cob_l, modo_l = T.encaixar("M99", lista, velho, sem, True)
ok("lista completa (urbanos): só as paragens do PDF, «-» pela distância",
   modo_l == "lista" and [s for s, _ in out_l] == ["S1", "S2", "S3"] and out_l[1][1] // 60 in (484, 485), (out_l, modo_l))
ok("nomes com «|»", T.variantes("Barcelos (Central) | (Central Camionagem)") == ["Barcelos (Central)", "Barcelos (Central Camionagem)"])
ok("ligações dos PDFs: a mais recente de cada tipo",
   T.links_pdf('<a href="./assets/docs/horarios-urbanos-14092026.pdf"></a><a href="./assets/docs/horarios-urbanos-01022027.pdf"></a>'
               '<a href="./assets/docs/horarios-municipais-14092026.pdf"></a><a href="./assets/docs/Regulamento.pdf"></a>')
   == ["https://tuba.barcelos.pt/assets/docs/horarios-urbanos-01022027.pdf",
       "https://tuba.barcelos.pt/assets/docs/horarios-municipais-14092026.pdf"])

# ---------------------------------------------------------------- GTFS final
corpo, rel = T.construir_gtfs(blocos, velho, hoje=sexta, dias=30, log=lambda *_: None)
z = zipfile.ZipFile(io.BytesIO(corpo))


def ler(nome):
    return list(csv.DictReader(io.TextIOWrapper(z.open(nome), encoding="utf-8")))


trips = ler("trips.txt")
cal = ler("calendar_dates.txt")
st = ler("stop_times.txt")
routes = ler("routes.txt")
ok("7 viagens (5 + 2)", len(trips) == 7, len(trips))
ok("destino = nome do horário oficial", {x["trip_headsign"] for x in trips} == {"Paragem Três", "Paragem Um"},
   {x["trip_headsign"] for x in trips})
ok("nome da linha vem do índice", routes and routes[0]["route_long_name"] == "Barcelos - Teste, via Algures" and routes[0]["route_id"] == "BAR99",
   routes)
dias_por_sv = {}
for c in cal:
    dias_por_sv.setdefault(c["service_id"], set()).add(c["date"])
sv_escolar = next(t["service_id"] for t in trips if t["service_id"].endswith("escolar"))
sv_ferias = next(t["service_id"] for t in trips if t["service_id"].endswith("ferias"))
sv_sab = next(t["service_id"] for t in trips if t["service_id"] == "TUBA_sab")
ok("escolar circula hoje (27/11) e não a 16/12", "20261127" in dias_por_sv[sv_escolar] and "20261216" not in dias_por_sv[sv_escolar])
ok("férias circula a 16/12 e não hoje", "20261216" in dias_por_sv[sv_ferias] and "20261127" not in dias_por_sv[sv_ferias])
ok("sábado só ao sábado", "20261128" in dias_por_sv[sv_sab] and "20261127" not in dias_por_sv[sv_sab])
ok("nada nos dias úteis a 8/12 (feriado)", all("20261208" not in d for s, d in dias_por_sv.items() if s.startswith("TUBA_uteis")))
por_viagem = {}
for r in st:
    por_viagem.setdefault(r["trip_id"], []).append((int(r["stop_sequence"]), r["arrival_time"]))
ok("horas nunca andam para trás", all(all(a[1] <= b[1] for a, b in zip(sorted(v), sorted(v)[1:])) for v in por_viagem.values()))
ok("só as paragens usadas", {r["stop_id"] for r in ler("stops.txt")} <= {"S1", "S1b", "S2", "S3", "S3x"})
ok("traçados copiados", {r["shape_id"] for r in ler("shapes.txt")} >= {"SH1"})

print(f"\n{'TUDO OK' if not falhas else f'{falhas} FALHAS'}")
sys.exit(1 if falhas else 0)
