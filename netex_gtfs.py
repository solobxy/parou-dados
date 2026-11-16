#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NeTEx (perfil europeu EPIP) -> GTFS, só com a biblioteca padrão.

Alguns operadores publicam os horários só em NeTEx (ex.: Metro Mondego, pela AGIT, a agência de transportes da região
de Coimbra). O construtor converte aqui o ZIP NeTEx num ZIP GTFS e depois trata-o como os outros.

- Paragens: ScheduledStopPoint -> Quay (PassengerStopAssignment), com o nome e a posição do Quay.
- Linhas: Line (nome curto = Name, ex.: «U1»; cor = Presentation/Colour).
- Viagens: ServiceJourney + ServiceJourneyPattern (ordem das paragens) + Route (sentido).
- Dias: DayType + DayTypeAssignment + UicOperatingPeriod (ValidDayBits) ou OperatingPeriod + dias da semana.
- Desenhos (opcional): rede de eixos em KML (ex.: «rede-metrobus.kmz» publicado pela AGIT): o percurso entre duas
  paragens segue o caminho mais curto pela rede; sem rede (ou longe dela) fica a linha reta entre as paragens.
"""

import csv
import datetime
import hashlib
import heapq
import io
import math
import re
import xml.etree.ElementTree as ET
import zipfile

ROUTE_TYPE = {"bus": 3, "coach": 3, "trolleyBus": 11, "tram": 0, "metro": 1, "rail": 2, "water": 4, "ferry": 4,
              "cableway": 6, "funicular": 7, "lightRail": 0}
DIAS_SEMANA = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
# Sufixos internos de sentido nos nomes das paragens («República (desc)» / «(asc)»): a app mostra só «República».
SUFIXO_SENTIDO = re.compile(r"\s*\((asc|desc|ascendente|descendente)\)\s*$", re.I)


def _ln(tag):
    return tag.rsplit("}", 1)[-1]


def _filho(el, nome):
    for c in el:
        if _ln(c.tag) == nome:
            return c
    return None


def _texto(el, *caminho):
    for nome in caminho:
        if el is None:
            return None
        el = _filho(el, nome)
    return (el.text or "").strip() if el is not None and el.text else None


def _ref(el, nome):
    c = _filho(el, nome)
    return c.get("ref") if c is not None else None


def _chave(el, chave):
    kl = _filho(el, "keyList")
    if kl is None:
        return None
    for kv in kl:
        if _texto(kv, "Key") == chave:
            return _texto(kv, "Value")
    return None


def _id_curto(netex_id):
    return hashlib.sha1(netex_id.encode("utf-8")).hexdigest()[:10]


def _posicao(el):
    """(lat, lon) de um elemento com Location direto ou dentro de Centroid."""
    loc = _filho(el, "Location")
    if loc is None:
        loc = _filho(_filho(el, "Centroid") if _filho(el, "Centroid") is not None else el, "Location")
    if loc is None:
        return None
    try:
        return float(_texto(loc, "Latitude")), float(_texto(loc, "Longitude"))
    except (TypeError, ValueError):
        return None


def _data(texto):
    return datetime.date.fromisoformat(texto[:10]) if texto else None


def _hora(texto, offset):
    if not texto:
        return None
    h, m, s = (int(x) for x in texto[:8].split(":"))
    h += 24 * (offset or 0)
    return f"{h:02d}:{m:02d}:{s:02d}"


def nome_paragem(nome):
    return SUFIXO_SENTIDO.sub("", nome or "").strip() or (nome or "Paragem")


def ler_netex(xml_bytes):
    """Lê o XML NeTEx e devolve um dicionário com as tabelas GTFS (listas de dicionários)."""
    raiz = ET.fromstring(xml_bytes)
    por_tipo = {}
    for el in raiz.iter():
        nome = _ln(el.tag)
        if nome in ("Operator", "Line", "StopPlace", "ScheduledStopPoint", "PassengerStopAssignment", "Route",
                    "ServiceJourneyPattern", "JourneyPattern", "ServiceJourney", "DayType", "DayTypeAssignment",
                    "UicOperatingPeriod", "OperatingPeriod") and el.get("id") or nome == "PassengerStopAssignment":
            por_tipo.setdefault(nome, []).append(el)

    # Operadores
    agencias = []
    for op in por_tipo.get("Operator", []):
        agencias.append({
            "agency_id": _chave(op, "gtfs:agency_id") or _id_curto(op.get("id")),
            "agency_name": _texto(op, "Name") or "Operador",
            "agency_url": _texto(op, "ContactDetails", "Url") or "",
            "agency_timezone": "Europe/Lisbon",
            "agency_lang": "pt",
            "agency_phone": _texto(op, "ContactDetails", "Phone") or "",
            "_netex": op.get("id"),
        })
    agencia_por_op = {a["_netex"]: a["agency_id"] for a in agencias}

    # Linhas
    linhas, linha_gtfs = [], {}
    for ln in por_tipo.get("Line", []):
        rid = _chave(ln, "gtfs:route_id") or _id_curto(ln.get("id"))
        linha_gtfs[ln.get("id")] = rid
        pres = _filho(ln, "Presentation")
        linhas.append({
            "route_id": rid,
            "agency_id": agencia_por_op.get(_ref(ln, "OperatorRef")) or (agencias[0]["agency_id"] if agencias else ""),
            "route_short_name": _texto(ln, "PublicCode") or _texto(ln, "Name") or rid,
            # Nome comprido vazio: o construtor usa os dois destinos principais (nomes_de_linha_em_falta).
            "route_long_name": "",
            "route_type": ROUTE_TYPE.get(_texto(ln, "TransportMode") or "bus", 3),
            "route_color": (_texto(pres, "Colour") or "") if pres is not None else "",
            "route_text_color": (_texto(pres, "TextColour") or "") if pres is not None else "",
        })

    # Paragens: Quay (com o nome e a posição); cada ScheduledStopPoint aponta para um Quay.
    quays = {}
    for sp in por_tipo.get("StopPlace", []):
        qs = _filho(sp, "quays")
        for q in (qs if qs is not None else []):
            if _ln(q.tag) != "Quay":
                continue
            quays[q.get("id")] = {
                "stop_id": _chave(q, "gtfs:stop_id") or _id_curto(q.get("id")),
                "stop_code": _texto(q, "PublicCode") or "",
                "stop_name": nome_paragem(_texto(q, "Name") or _texto(sp, "Name")),
                "pos": _posicao(q) or _posicao(sp),
            }
    ssp_quay = {}
    for a in por_tipo.get("PassengerStopAssignment", []):
        s, q = _ref(a, "ScheduledStopPointRef"), _ref(a, "QuayRef")
        if s and q in quays:
            ssp_quay[s] = q
    paragem_de_ssp = {}
    paragens = {}
    for ssp in por_tipo.get("ScheduledStopPoint", []):
        q = quays.get(ssp_quay.get(ssp.get("id")))
        if q is None:
            pos = _posicao(ssp)
            q = {"stop_id": _chave(ssp, "gtfs:stop_id") or _id_curto(ssp.get("id")),
                 "stop_code": _texto(ssp, "PublicCode") or "", "stop_name": nome_paragem(_texto(ssp, "Name")), "pos": pos}
        if not q.get("pos"):
            continue
        paragem_de_ssp[ssp.get("id")] = q["stop_id"]
        paragens[q["stop_id"]] = q

    # Percursos (sentido) e padrões (ordem das paragens)
    sentido_route = {}
    linha_route = {}
    for r in por_tipo.get("Route", []):
        dt = (_texto(r, "DirectionType") or "").lower()
        sentido_route[r.get("id")] = 1 if dt in ("inbound", "anticlockwise") else 0
        linha_route[r.get("id")] = _ref(r, "LineRef")
    padroes = {}
    for jp in por_tipo.get("ServiceJourneyPattern", []) + por_tipo.get("JourneyPattern", []):
        pts = _filho(jp, "pointsInSequence")
        seq = []
        for i, sp in enumerate(pts if pts is not None else []):
            if _ln(sp.tag) != "StopPointInJourneyPattern":
                continue
            ordem = int(sp.get("order") or i + 1)
            seq.append((ordem, sp.get("id"), _ref(sp, "ScheduledStopPointRef"),
                        _texto(sp, "ForBoarding") != "false", _texto(sp, "ForAlighting") != "false"))
        seq.sort()
        padroes[jp.get("id")] = {"route": _ref(jp, "RouteRef"), "seq": seq}

    # Dias: DayType -> conjunto de datas
    periodos, periodos_uic = {}, set()
    for p in por_tipo.get("UicOperatingPeriod", []):
        periodos_uic.add(p.get("id"))
        ini, bits = _data(_texto(p, "FromDate")), _texto(p, "ValidDayBits") or ""
        periodos[p.get("id")] = {ini + datetime.timedelta(days=i) for i, b in enumerate(bits) if b == "1"} if ini else set()
    for p in por_tipo.get("OperatingPeriod", []):
        ini, fim = _data(_texto(p, "FromDate")), _data(_texto(p, "ToDate"))
        if ini and fim:
            periodos[p.get("id")] = {ini + datetime.timedelta(days=i) for i in range((fim - ini).days + 1)}
    dias_semana_tipo = {}
    for d in por_tipo.get("DayType", []):
        props = d.find(".//{*}DaysOfWeek")
        if props is not None and props.text:
            dias = set()
            for palavra in props.text.split():
                if palavra in DIAS_SEMANA:
                    dias.add(DIAS_SEMANA[palavra])
                elif palavra == "Weekdays":
                    dias |= {0, 1, 2, 3, 4}
                elif palavra == "Weekend":
                    dias |= {5, 6}
                elif palavra == "Everyday":
                    dias |= set(range(7))
            dias_semana_tipo[d.get("id")] = dias
    datas_tipo, tiradas_tipo = {}, {}
    for a in sorted(por_tipo.get("DayTypeAssignment", []), key=lambda x: int(x.get("order") or 0)):
        tipo = _ref(a, "DayTypeRef")
        if not tipo:
            continue
        datas = set()
        periodo = _ref(a, "OperatingPeriodRef") or _ref(a, "UicOperatingPeriodRef")
        if periodo in periodos:
            datas = set(periodos[periodo])
            # Os bits do UicOperatingPeriod já dizem os dias; num OperatingPeriod (de data a data) contam os dias da semana.
            if periodo not in periodos_uic and tipo in dias_semana_tipo:
                datas = {x for x in datas if x.weekday() in dias_semana_tipo[tipo]}
        elif _texto(a, "Date"):
            datas = {_data(_texto(a, "Date"))}
        if _texto(a, "isAvailable") == "false":
            tiradas_tipo.setdefault(tipo, set()).update(datas)
        else:
            datas_tipo.setdefault(tipo, set()).update(datas)
    nome_tipo = {d.get("id"): _chave(d, "gtfs:service_id") or _id_curto(d.get("id")) for d in por_tipo.get("DayType", [])}

    # Viagens
    servicos = {}  # tuplo de DayTypes -> service_id
    viagens, horarios = [], []
    for sj in por_tipo.get("ServiceJourney", []):
        jp = padroes.get(_ref(sj, "ServiceJourneyPatternRef") or _ref(sj, "JourneyPatternRef"))
        if not jp:
            continue
        route_netex = jp["route"]
        linha_netex = _ref(sj, "LineRef") or linha_route.get(route_netex)
        rid = linha_gtfs.get(linha_netex)
        if not rid:
            continue
        dts = _filho(sj, "dayTypes")
        tipos = tuple(sorted(x.get("ref") for x in (dts if dts is not None else []) if x.get("ref")))
        if not tipos:
            continue
        if tipos not in servicos:
            servicos[tipos] = "+".join(nome_tipo.get(t, _id_curto(t)) for t in tipos)
        tid = _chave(sj, "gtfs:trip_id") or _id_curto(sj.get("id"))
        por_ponto = {}
        pts = _filho(sj, "passingTimes")
        for tp in (pts if pts is not None else []):
            ref = _ref(tp, "StopPointInJourneyPatternRef")
            chegada = _hora(_texto(tp, "ArrivalTime"), int(_texto(tp, "ArrivalDayOffset") or 0))
            partida = _hora(_texto(tp, "DepartureTime"), int(_texto(tp, "DepartureDayOffset") or 0))
            por_ponto[ref] = (chegada or partida, partida or chegada)
        linhas_viagem = []
        for ordem, spid, ssp, sobe, desce in jp["seq"]:
            if spid not in por_ponto or ssp not in paragem_de_ssp:
                continue
            chegada, partida = por_ponto[spid]
            if not chegada:
                continue
            linhas_viagem.append({"trip_id": tid, "arrival_time": chegada, "departure_time": partida,
                                  "stop_id": paragem_de_ssp[ssp], "stop_sequence": ordem,
                                  "pickup_type": 0 if sobe else 1, "drop_off_type": 0 if desce else 1})
        if len(linhas_viagem) < 2:
            continue
        horarios.extend(linhas_viagem)
        destino = paragens[linhas_viagem[-1]["stop_id"]]["stop_name"]
        viagens.append({"route_id": rid, "service_id": servicos[tipos], "trip_id": tid, "trip_headsign": destino,
                        "trip_short_name": _texto(sj, "PublicCode") or _texto(sj, "Name") or "",
                        "direction_id": sentido_route.get(route_netex, 0), "shape_id": "",
                        "_paragens": tuple(x["stop_id"] for x in linhas_viagem)})

    datas_servico = []
    for tipos, sid in servicos.items():
        datas = set()
        for t in tipos:
            datas |= datas_tipo.get(t, set()) - tiradas_tipo.get(t, set())
        for d in sorted(datas):
            datas_servico.append({"service_id": sid, "date": d.strftime("%Y%m%d"), "exception_type": 1})

    return {"agencias": agencias, "linhas": linhas, "paragens": paragens, "viagens": viagens,
            "horarios": horarios, "datas": datas_servico}


# ---------------------------------------------------------------------------
# Desenhos pela rede de eixos (KML)
# ---------------------------------------------------------------------------
def _dist(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(min(1.0, h)))


def ler_kml(dados):
    """Lista de linhas [(lat, lon), ...] de um KML ou KMZ."""
    if dados[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(dados)) as z:
            nome = next((n for n in z.namelist() if n.lower().endswith(".kml")), None)
            if not nome:
                return []
            dados = z.read(nome)
    linhas = []
    for el in ET.fromstring(dados).iter():
        if _ln(el.tag) != "LineString":
            continue
        coords = _filho(el, "coordinates")
        if coords is None or not coords.text:
            continue
        pts = []
        for trio in coords.text.split():
            partes = trio.split(",")
            try:
                pts.append((float(partes[1]), float(partes[0])))
            except (IndexError, ValueError):
                continue
        if len(pts) >= 2:
            linhas.append(pts)
    return linhas


class Rede:
    """Grafo não dirigido feito com os eixos do KML. Pontos a menos de `junta_m` metros ficam no mesmo nó; pontas soltas
    ligam-se ao ponto mais perto de outra linha (até `ponte_m`), para fechar pequenas falhas do desenho."""

    def __init__(self, linhas, junta_m=2.5, ponte_m=25.0):
        self.nos, self.viz, self.grelha = [], [], {}
        pontas = []
        for pts in linhas:
            anterior = None
            for i, p in enumerate(pts):
                n = self._no(p, junta_m)
                if anterior is not None and anterior != n:
                    self._liga(anterior, n)
                if i in (0, len(pts) - 1):
                    pontas.append(n)
                anterior = n
        for n in pontas:
            if len(self.viz[n]) > 1:
                continue
            perto = [m for m in self._perto(self.nos[n], ponte_m) if m != n and m not in self.viz[n]]
            perto = [m for m in perto if not self._ligados_perto(n, m)]
            if perto:
                m = min(perto, key=lambda m: _dist(self.nos[n], self.nos[m]))
                self._liga(n, m)

    def _celula(self, p):
        return (int(p[0] * 2000), int(p[1] * 2000))  # ~55 m x 42 m

    def _perto(self, p, raio_m):
        ci, cj = self._celula(p)
        alcance = max(1, int(raio_m / 40) + 1)
        for di in range(-alcance, alcance + 1):
            for dj in range(-alcance, alcance + 1):
                for m in self.grelha.get((ci + di, cj + dj), ()):
                    if _dist(p, self.nos[m]) <= raio_m:
                        yield m

    def _no(self, p, junta_m):
        for m in self._perto(p, junta_m):
            return m
        self.nos.append(p)
        self.viz.append({})
        self.grelha.setdefault(self._celula(p), []).append(len(self.nos) - 1)
        return len(self.nos) - 1

    def _liga(self, a, b):
        d = _dist(self.nos[a], self.nos[b])
        self.viz[a][b] = d
        self.viz[b][a] = d

    def _ligados_perto(self, a, b, limite=8):
        """True se b já se alcança a partir de a em poucos passos (é o mesmo traço; não precisa de ponte)."""
        vistos, fila = {a}, [(a, 0)]
        while fila:
            n, k = fila.pop()
            if n == b:
                return True
            if k >= limite:
                continue
            for m in self.viz[n]:
                if m not in vistos:
                    vistos.add(m)
                    fila.append((m, k + 1))
        return False

    def no_mais_perto(self, p, raio_m=80.0):
        melhor, dm = None, raio_m
        for m in self._perto(p, raio_m):
            d = _dist(p, self.nos[m])
            if d < dm:
                melhor, dm = m, d
        return melhor

    def caminho(self, a, b, limite_m):
        dist, antes, fila = {a: 0.0}, {}, [(0.0, a)]
        while fila:
            d, n = heapq.heappop(fila)
            if n == b:
                break
            if d > dist.get(n, math.inf) or d > limite_m:
                continue
            for m, w in self.viz[n].items():
                nd = d + w
                if nd < dist.get(m, math.inf):
                    dist[m], antes[m] = nd, n
                    heapq.heappush(fila, (nd, m))
        if b not in dist or dist[b] > limite_m:
            return None
        pts, n = [b], b
        while n != a:
            n = antes[n]
            pts.append(n)
        return [self.nos[x] for x in reversed(pts)]


def desenhar(rede, paragens, seq):
    """Pontos do percurso que passa pelas paragens `seq` (ids), pela rede quando é possível."""
    pontos = []
    for a, b in zip(seq, seq[1:]):
        pa, pb = paragens[a]["pos"], paragens[b]["pos"]
        troco = None
        if rede is not None:
            na, nb = rede.no_mais_perto(pa), rede.no_mais_perto(pb)
            reta = _dist(pa, pb)
            if na is not None and nb is not None and na != nb:
                troco = rede.caminho(na, nb, limite_m=max(400.0, 2.5 * reta + 200))
        if not troco:
            troco = [pa, pb]
        else:
            troco = [pa] + troco + [pb]
        if pontos and pontos[-1] == troco[0]:
            troco = troco[1:]
        pontos.extend(troco)
    return pontos


# ---------------------------------------------------------------------------
# Escrita do ZIP GTFS
# ---------------------------------------------------------------------------
def _csv(linhas, campos):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=campos, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for linha in linhas:
        w.writerow(linha)
    return buf.getvalue().encode("utf-8")


def _xml_do_zip(dados):
    if dados[:2] != b"PK":
        return dados
    with zipfile.ZipFile(io.BytesIO(dados)) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith(".xml")]
        if not nomes:
            raise ValueError("o ZIP NeTEx não tem nenhum ficheiro .xml")
        nome = max(nomes, key=lambda n: z.getinfo(n).file_size)
        return z.read(nome)


def netex_para_gtfs(dados_netex, kml=None):
    """Converte um ZIP (ou XML) NeTEx num ZIP GTFS (bytes). `kml`: bytes de um KML/KMZ com os eixos da rede (opcional)."""
    t = ler_netex(_xml_do_zip(dados_netex))
    if not t["paragens"]:
        raise ValueError("o ficheiro NeTEx não tem paragens")
    rede = None
    if kml:
        try:
            linhas = ler_kml(kml)
            rede = Rede(linhas) if linhas else None
        except ET.ParseError:
            rede = None
    formas, forma_por_seq = [], {}
    for v in t["viagens"]:
        seq = v.pop("_paragens")
        if seq not in forma_por_seq:
            sid = "f" + str(len(forma_por_seq) + 1)
            forma_por_seq[seq] = sid
            for i, (la, lo) in enumerate(desenhar(rede, t["paragens"], seq)):
                formas.append({"shape_id": sid, "shape_pt_lat": f"{la:.6f}", "shape_pt_lon": f"{lo:.6f}",
                               "shape_pt_sequence": i + 1})
        v["shape_id"] = forma_por_seq[seq]
    usadas = {h["stop_id"] for h in t["horarios"]}
    stops = [{"stop_id": sid, "stop_code": p["stop_code"], "stop_name": p["stop_name"],
              "stop_lat": f"{p['pos'][0]:.6f}", "stop_lon": f"{p['pos'][1]:.6f}", "location_type": 0}
             for sid, p in t["paragens"].items() if sid in usadas]
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("agency.txt", _csv(t["agencias"], ["agency_id", "agency_name", "agency_url", "agency_timezone",
                                                      "agency_lang", "agency_phone"]))
        z.writestr("stops.txt", _csv(stops, ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon", "location_type"]))
        z.writestr("routes.txt", _csv(t["linhas"], ["route_id", "agency_id", "route_short_name", "route_long_name",
                                                    "route_type", "route_color", "route_text_color"]))
        z.writestr("trips.txt", _csv(t["viagens"], ["route_id", "service_id", "trip_id", "trip_headsign",
                                                    "trip_short_name", "direction_id", "shape_id"]))
        z.writestr("stop_times.txt", _csv(t["horarios"], ["trip_id", "arrival_time", "departure_time", "stop_id",
                                                          "stop_sequence", "pickup_type", "drop_off_type"]))
        z.writestr("calendar_dates.txt", _csv(t["datas"], ["service_id", "date", "exception_type"]))
        if formas:
            z.writestr("shapes.txt", _csv(formas, ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"]))
    return saida.getvalue()
