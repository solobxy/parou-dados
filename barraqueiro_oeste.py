#!/usr/bin/env python3
"""
Barraqueiro Oeste (Torres Vedras e região Oeste): horários em PDF -> GTFS
========================================================================

A Barraqueiro Oeste não publica GTFS, só um PDF por linha em https://barraqueiro-oeste.pt/horarios-em-pdf/.
Cada PDF tem a lista completa das paragens (sem horas) e uma tabela com as horas só nalguns pontos («Localidades»),
para os dias úteis e para sábados, domingos e feriados.

O conversor junta duas fontes:
  - os PDFs (texto tirado com `pdftotext -layout`): linhas, viagens, horas nos pontos da tabela e data de entrada em vigor;
  - o OpenStreetMap (barraqueiro_oeste_osm.json): a ordem das paragens de cada linha e as coordenadas,
    a partir das relações route=bus da rede (TUT). Atualiza-se com `python barraqueiro_oeste.py osm ...`.
Os pontos da tabela casam-se com as paragens do OSM pela ordem e pelo nome; as horas das paragens intermédias são
interpoladas pela distância. Uma viagem que salta pontos («-») usa a variante do OSM que passa só nos pontos dela.

Por agora entram as 5 linhas urbanas de Torres Vedras (TUT): 794, 796, 797, 798 e 799. A 795 (TUT Praia) só funciona
no verão e fica de fora até haver horário em vigor.

Só usa a biblioteca padrão; o texto dos PDFs vem do `pdftotext` (poppler-utils), instalado no workflow.

Uso:
  python barraqueiro_oeste.py osm osm-rotas.opl osm-paragens.geojsonseq > barraqueiro_oeste_osm.json
  python barraqueiro_oeste.py gtfs pasta_com_txt saida.zip      # ensaio local com textos já tirados
"""

import csv
import datetime
import io
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile

PAGINA = "https://barraqueiro-oeste.pt/horarios-em-pdf/"
BASE = "https://barraqueiro-oeste.pt/"
OSM_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "barraqueiro_oeste_osm.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

AGENCIA = {"agency_id": "barraqueiro_oeste", "agency_name": "Barraqueiro Oeste",
           "agency_url": "https://barraqueiro-oeste.pt", "agency_timezone": "Europe/Lisbon",
           "agency_lang": "pt", "agency_phone": "261 910 380"}

# Linhas TUT (Transportes Urbanos de Torres Vedras): nome da linha e cores
LINHAS = {
    "794": ("TUT Linha Roxa", "7B3FA0", "FFFFFF"),
    "796": ("TUT Linha Verde", "2E9D4C", "FFFFFF"),
    "797": ("TUT Linha Vermelha", "D7262E", "FFFFFF"),
    "798": ("TUT Linha Amarela", "F2C200", "000000"),
    "799": ("TUT Linha Azul", "1F6FD1", "FFFFFF"),
}

MESES = {"janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
         "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

DIAS_UTEIS = "du"
FIM_DE_SEMANA = "sdf"  # sábados, domingos e feriados

# Abreviaturas usadas nos PDFs
ABREV = {"s": "sao", "sto": "santo", "sta": "santa", "esc": "escola", "pq": "parque", "cor": "coronel",
         "rot": "rotunda", "cruz": "cruzamento", "av": "avenida", "gen": "general", "tvd": "", "r": "rua"}
VAZIAS = {"de", "da", "do", "das", "dos", "e", "a", "o", "x", "junto", "frente", "n", "linha"}


# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------
def sem_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn")


def palavras(nome):
    """Palavras com significado de um nome de paragem, sem acentos e com as abreviaturas por extenso."""
    out = []
    for p in re.split(r"[^a-z0-9]+", sem_acentos(nome).lower()):
        p = ABREV.get(p, p)
        if p and p not in VAZIAS and not p.isdigit():
            out.append(p)
    return out


def parecenca(rotulo, nome_osm):
    """0..1: quantas palavras do ponto da tabela estão no nome da paragem do OSM (prefixos contam: Fisíca/Fisica)."""
    a = palavras(rotulo)
    b = palavras(nome_osm)
    if not a or not b:
        return 0.0
    hits = 0
    for p in a:
        if any(q == p or (len(p) >= 4 and (q.startswith(p) or p.startswith(q)) and len(q) >= 4) for q in b):
            hits += 1
    return hits / len(a)


def distancia_m(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    x = (lon2 - lon1) * math.cos((lat1 + lat2) / 2)
    return 6371000 * math.hypot(x, lat2 - lat1)


# ---------------------------------------------------------------------------
# PDF (texto de `pdftotext -layout`)
# ---------------------------------------------------------------------------
RE_LINHA_HORAS = re.compile(r"^(?P<antes>.*?\S)(?P<horas>(?:\s+(?:\d{1,2}:\d{2}|-))+)\s*$")
RE_HORA = re.compile(r"\d{1,2}:\d{2}|-")


def minutos(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def ler_horario(texto):
    """Lê o texto de um PDF. Devolve {ref, nome, em_vigor, viagens: [{tipo, pontos: [(rótulo, minutos)]}]}."""
    linhas = texto.splitlines()
    cab = re.search(r"(\d{3})_([^\n]+?)\s{2,}", texto)
    ref = cab.group(1) if cab else None
    nome = re.sub(r"\s+", " ", cab.group(2)).strip() if cab else ""
    vig = re.search(r"Em vigor desde (\d{1,2}) de (\w+) de (\d{4})", texto)
    em_vigor = None
    if vig:
        mes = MESES.get(sem_acentos(vig.group(2)).lower())
        if mes:
            em_vigor = datetime.date(int(vig.group(3)), mes, int(vig.group(1)))

    viagens = []
    cabecalhos = []  # [(centro_x, tipo)] da última linha com «Dias úteis» / «Sábados…»
    bloco = None     # {cab, colunas: [x], linhas: [(rótulo, [(x, token)])]}

    def fechar():
        if not bloco or not bloco["linhas"]:
            return
        # colunas: posições dos tokens na primeira linha com horas
        ancoras = [x for x, _ in bloco["linhas"][0][1]]
        tipos = []
        for x in ancoras:
            if bloco["cab"]:
                tipos.append(min(bloco["cab"], key=lambda c: abs(c[0] - x))[1])
            else:
                tipos.append(DIAS_UTEIS)
        cols = [[] for _ in ancoras]
        for rotulo, toks in bloco["linhas"]:
            for x, tok in toks:
                i = min(range(len(ancoras)), key=lambda k: abs(ancoras[k] - x))
                if tok != "-":
                    cols[i].append((rotulo, minutos(tok)))
        for i, pontos in enumerate(cols):
            if len(pontos) >= 2:
                # horas depois da meia-noite continuam a contar (GTFS aceita 24:xx)
                for k in range(1, len(pontos)):
                    if pontos[k][1] < pontos[k - 1][1]:
                        pontos[k] = (pontos[k][0], pontos[k][1] + 1440)
                viagens.append({"tipo": tipos[i], "pontos": pontos})

    for ln in linhas:
        if "Dias úteis" in ln or "Sábados" in ln:
            fechar()
            bloco = None
            cabecalhos = []
            for m in re.finditer(r"Dias úteis|Sábados, Domingos e Feriados|Sábados", ln):
                tipo = DIAS_UTEIS if m.group(0) == "Dias úteis" else FIM_DE_SEMANA
                cabecalhos.append(((m.start() + m.end()) / 2, tipo))
            continue
        if "Localidades" in ln:
            fechar()
            bloco = {"cab": list(cabecalhos), "linhas": []}
            continue
        if bloco is None:
            continue
        if "LEGENDA" in ln or "Contact Center" in ln:
            fechar()
            bloco = None
            continue
        m = RE_LINHA_HORAS.match(ln)
        if not m:
            continue
        toks = [(m.start("horas") + t.start(), t.group(0)) for t in RE_HORA.finditer(m.group("horas"))]
        if not any(t != "-" for _, t in toks):
            continue
        # rótulo: o último pedaço antes das horas que não seja um ponto da lista (•)
        pedacos = [p.strip() for p in re.split(r"\s{2,}", m.group("antes")) if p.strip()]
        pedacos = [p for p in pedacos if not p.startswith("•")]
        if not pedacos:
            continue
        bloco["linhas"].append((pedacos[-1], toks))
    fechar()
    return {"ref": ref, "nome": nome, "em_vigor": em_vigor, "viagens": viagens}


# ---------------------------------------------------------------------------
# OpenStreetMap
# ---------------------------------------------------------------------------
def _opl_decode(texto):
    return re.sub(r"%([0-9a-fA-F]+)%", lambda m: chr(int(m.group(1), 16)), texto)


def osm_para_json(opl_path, geojsonseq_path):
    """Relações route=bus da Barraqueiro Oeste (OPL do osmium) + paragens (GeoJSON) -> {ref: [variantes]}."""
    nos = {}
    with open(geojsonseq_path, encoding="utf-8") as fh:
        for linha in fh:
            linha = linha.strip().lstrip("\x1e")
            if not linha:
                continue
            f = json.loads(linha)
            if f["geometry"]["type"] != "Point":
                continue
            lon, lat = f["geometry"]["coordinates"][:2]
            nos[int(f["properties"]["@id"])] = {"nome": f["properties"].get("name"), "lat": round(lat, 6),
                                                "lon": round(lon, 6)}
    rotas = {}
    with open(opl_path, encoding="utf-8") as fh:
        for linha in fh:
            campos = linha.split()
            tags_txt = next((c[1:] for c in campos if c.startswith("T")), "")
            mem_txt = next((c[1:] for c in campos if c.startswith("M")), "")
            tags = {}
            for t in _opl_decode(tags_txt).split(","):
                if "=" in t:
                    k, v = t.split("=", 1)
                    tags[k] = v
            if "barraqueiro" not in sem_acentos(tags.get("operator", "")).lower():
                continue
            ref = tags.get("ref")
            if not ref:
                continue
            paragens = []
            for m in mem_txt.split(","):
                if "@" not in m:
                    continue
                tipo_id, papel = m.split("@", 1)
                if not tipo_id.startswith("n") or not papel.startswith("platform"):
                    continue
                no = nos.get(int(tipo_id[1:]))
                if no:
                    paragens.append({"id": tipo_id[1:], **no})
            if len(paragens) >= 2:
                rotas.setdefault(ref, []).append({"relacao": campos[0][1:], "nome": tags.get("name", ""),
                                                  "paragens": paragens})
    return rotas


# ---------------------------------------------------------------------------
# Casar os pontos da tabela com as paragens do OSM
# ---------------------------------------------------------------------------
LIMIAR = 0.5


def casar(pontos, paragens):
    """Para cada ponto (rótulo, minutos) dá o índice da paragem do OSM (ou None), pela ordem do percurso.
    O primeiro ponto casa com a primeira paragem e o último com a última (linhas circulares: Terminal)."""
    n = len(paragens)
    idx = [None] * len(pontos)
    inicio = 0
    for k, (rotulo, _) in enumerate(pontos):
        ultimo = k == len(pontos) - 1
        candidatos = range(n - 1, inicio - 1, -1) if ultimo else range(inicio, n - (0 if k == 0 else 1))
        # A paragem com o nome mais parecido no resto do percurso; em empate, a primeira que aparece
        # («Varandas de Arenes» é a paragem com esse nome, não o «Arenes, Cruzamento» que vem antes).
        melhor = None
        for i in candidatos:
            s = parecenca(rotulo, paragens[i]["nome"] or "")
            if s >= LIMIAR and (melhor is None or s > melhor[0] + 1e-9):
                melhor = (s, i)
                if s >= 0.999:
                    break
        if k == 0 and (melhor is None or melhor[1] != 0) and parecenca(rotulo, paragens[0]["nome"] or "") > 0:
            melhor = (1.0, 0)
        if melhor:
            idx[k] = melhor[1]
            inicio = melhor[1] + 1
    return idx


def horas_por_paragem(pontos, idx, paragens):
    """Horas (minutos) em todas as paragens, interpoladas pela distância entre os pontos casados."""
    casados = [(i, t) for i, (_, t) in zip(idx, pontos) if i is not None]
    if len(casados) < 2 or casados[0][0] != 0 or casados[-1][0] != len(paragens) - 1:
        return None
    acum = [0.0]
    for a, b in zip(paragens, paragens[1:]):
        acum.append(acum[-1] + distancia_m((a["lat"], a["lon"]), (b["lat"], b["lon"])))
    horas = [None] * len(paragens)
    for (i0, t0), (i1, t1) in zip(casados, casados[1:]):
        d = acum[i1] - acum[i0]
        for i in range(i0, i1 + 1):
            f = (acum[i] - acum[i0]) / d if d > 0 else (i - i0) / max(1, i1 - i0)
            horas[i] = t0 + (t1 - t0) * f
    return horas


def escolher_variante(pontos, variantes):
    """Variante do OSM onde casam mais pontos da viagem (com o início e o fim); em empate, a mais curta."""
    melhor = None
    for v in variantes:
        idx = casar(pontos, v["paragens"])
        horas = horas_por_paragem(pontos, idx, v["paragens"])
        if horas is None:
            continue
        nota = (sum(1 for i in idx if i is not None), -len(v["paragens"]))
        if melhor is None or nota > melhor[0]:
            melhor = (nota, v, idx, horas)
    return melhor


# ---------------------------------------------------------------------------
# GTFS
# ---------------------------------------------------------------------------
def feriado_nacional(day):
    if (day.month, day.day) in {(1, 1), (4, 25), (5, 1), (6, 10), (8, 15), (10, 5), (11, 1), (12, 1), (12, 8), (12, 25)}:
        return True
    y = day.year
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    pascoa = datetime.date(y, (h + l - 7 * m + 114) // 31, ((h + l - 7 * m + 114) % 31) + 1)
    return (day - pascoa).days in (-2, 0, 60)


def hhmmss(minutos_float):
    s = int(round(minutos_float * 60))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def _csv(nome, campos, linhas):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=campos, lineterminator="\n")
    w.writeheader()
    for r in linhas:
        w.writerow(r)
    return nome, buf.getvalue()


def construir_gtfs(horarios, osm, hoje=None, dias=365):
    """horarios: lista de ler_horario(); osm: {ref: [variantes]}. Devolve (bytes do zip, relatório)."""
    hoje = hoje or datetime.date.today()
    stops, routes, trips, stop_times = {}, [], [], []
    servicos = {}
    relatorio = []
    for h in horarios:
        ref = h["ref"]
        if ref not in LINHAS:
            continue
        variantes = osm.get(ref) or []
        if not variantes:
            relatorio.append(f"{ref}: sem percurso no OpenStreetMap, linha não incluída")
            continue
        nome_linha, cor, cor_texto = LINHAS[ref]
        rid = f"bo_{ref}"
        routes.append({"route_id": rid, "agency_id": AGENCIA["agency_id"], "route_short_name": ref,
                       "route_long_name": f"{h['nome']} ({nome_linha})", "route_type": 3,
                       "route_color": cor, "route_text_color": cor_texto,
                       "route_url": "https://barraqueiro-oeste.pt/horarios-em-pdf/"})
        inicio = h["em_vigor"] or hoje
        ok = falhou = 0
        nao_casados = set()
        for n, v in enumerate(h["viagens"]):
            escolha = escolher_variante(v["pontos"], variantes)
            if not escolha:
                falhou += 1
                continue
            _, var, idx, horas = escolha
            for (rotulo, _), i in zip(v["pontos"], idx):
                if i is None:
                    nao_casados.add(rotulo)
            sid = f"bo_{v['tipo']}_{inicio:%Y%m%d}"
            servicos[sid] = (v["tipo"], inicio)
            tid = f"bo_{ref}_{v['tipo']}_{n + 1:03d}"
            trips.append({"route_id": rid, "service_id": sid, "trip_id": tid,
                          "trip_headsign": "Terminal (circular)" if var["paragens"][0]["id"] == var["paragens"][-1]["id"]
                          else (var["paragens"][-1]["nome"] or ""), "direction_id": 0})
            for seq, (p, t) in enumerate(zip(var["paragens"], horas)):
                stops[p["id"]] = p
                stop_times.append({"trip_id": tid, "arrival_time": hhmmss(t), "departure_time": hhmmss(t),
                                   "stop_id": f"osm_{p['id']}", "stop_sequence": seq + 1,
                                   "timepoint": 1 if seq in idx else 0})
            ok += 1
        relatorio.append(f"{ref}: {ok} viagens" + (f", {falhou} sem percurso que case" if falhou else "")
                         + (f"; pontos sem paragem no OSM: {', '.join(sorted(nao_casados))}" if nao_casados else ""))

    calendar, calendar_dates = [], []
    fim = hoje + datetime.timedelta(days=dias)
    for sid, (tipo, inicio) in servicos.items():
        du = tipo == DIAS_UTEIS
        calendar.append({"service_id": sid, "monday": int(du), "tuesday": int(du), "wednesday": int(du),
                         "thursday": int(du), "friday": int(du), "saturday": int(not du), "sunday": int(not du),
                         "start_date": f"{inicio:%Y%m%d}", "end_date": f"{fim:%Y%m%d}"})
        d = max(inicio, hoje - datetime.timedelta(days=7))
        while d <= fim:
            if d.weekday() < 5 and feriado_nacional(d):
                calendar_dates.append({"service_id": sid, "date": f"{d:%Y%m%d}", "exception_type": 2 if du else 1})
            d += datetime.timedelta(days=1)

    ficheiros = [
        _csv("agency.txt", list(AGENCIA), [AGENCIA]),
        _csv("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"],
             [{"stop_id": f"osm_{p['id']}", "stop_name": p["nome"] or "Paragem", "stop_lat": p["lat"],
               "stop_lon": p["lon"]} for p in stops.values()]),
        _csv("routes.txt", ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type",
                            "route_color", "route_text_color", "route_url"], routes),
        _csv("trips.txt", ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], trips),
        _csv("stop_times.txt", ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "timepoint"],
             stop_times),
        _csv("calendar.txt", ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
                              "sunday", "start_date", "end_date"], calendar),
        _csv("calendar_dates.txt", ["service_id", "date", "exception_type"], calendar_dates),
        _csv("feed_info.txt", ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version"],
             [{"feed_publisher_name": "PAROU.PT (a partir dos horários em PDF da Barraqueiro Oeste e do OpenStreetMap)",
               "feed_publisher_url": "https://parou.pt", "feed_lang": "pt", "feed_version": f"{hoje:%Y%m%d}"}]),
    ]
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, conteudo in ficheiros:
            z.writestr(nome, conteudo)
    if not trips:
        raise ValueError("Barraqueiro Oeste: nenhuma viagem convertida (" + "; ".join(relatorio) + ")")
    return out.getvalue(), relatorio


# ---------------------------------------------------------------------------
# Descarregar e converter (usado pelo construtor diário)
# ---------------------------------------------------------------------------
def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - URLs fixos do operador
        return r.read()


def links_pdf(html):
    """Links dos PDFs das linhas na página de horários (o site usa caminhos relativos)."""
    vistos = []
    for m in re.finditer(r'href="([^"]*wp-content/uploads/[^"]*/(\d{3})\.pdf)"', html):
        url = m.group(1)
        if url.startswith("/"):
            url = BASE + url.lstrip("/")
        elif not url.startswith("http"):
            url = BASE + url
        if (m.group(2), url) not in vistos:
            vistos.append((m.group(2), url))
    return vistos


def pdf_para_texto(pdf_bytes):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "h.pdf")
        with open(p, "wb") as fh:
            fh.write(pdf_bytes)
        return subprocess.run(["pdftotext", "-layout", p, "-"], check=True, capture_output=True,
                              timeout=60).stdout.decode("utf-8", "replace")


def descarregar_e_converter(log=print, hoje=None):
    """Página -> PDFs das linhas TUT -> texto -> GTFS. Devolve os bytes do zip."""
    html = _get(PAGINA).decode("utf-8", "replace")
    links = [(ref, url) for ref, url in links_pdf(html) if ref in LINHAS]
    if not links:
        raise ValueError("Barraqueiro Oeste: a página de horários não tem os PDFs das linhas TUT")
    with open(OSM_JSON, encoding="utf-8") as fh:
        osm = json.load(fh)
    horarios = []
    for ref, url in links:
        h = ler_horario(pdf_para_texto(_get(url)))
        if h["ref"] != ref:
            log(f"  barraqueiro_oeste: {url} diz ser a linha {h['ref']}, esperava {ref}")
        h["ref"] = ref
        horarios.append(h)
    zip_bytes, relatorio = construir_gtfs(horarios, osm, hoje=hoje)
    for r in relatorio:
        log(f"  barraqueiro_oeste: {r}")
    return zip_bytes


def main(argv):
    if len(argv) >= 4 and argv[1] == "osm":
        json.dump(osm_para_json(argv[2], argv[3]), sys.stdout, ensure_ascii=False, indent=1, sort_keys=True)
        sys.stdout.write("\n")
        return 0
    if len(argv) >= 4 and argv[1] == "gtfs":
        with open(OSM_JSON, encoding="utf-8") as fh:
            osm = json.load(fh)
        horarios = []
        for ref in sorted(LINHAS):
            p = os.path.join(argv[2], f"{ref}.layout.txt")
            if os.path.exists(p):
                with open(p, encoding="utf-8") as fh:
                    h = ler_horario(fh.read())
                h["ref"] = ref
                horarios.append(h)
        zip_bytes, relatorio = construir_gtfs(horarios, osm)
        with open(argv[3], "wb") as fh:
            fh.write(zip_bytes)
        print("\n".join(relatorio))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
