#!/usr/bin/env python3
"""
AzoresBus (São Miguel, Açores): horários da API pública do operador -> GTFS
==========================================================================

Desde 1 de setembro de 2026 todas as carreiras de São Miguel são da AzoresBus (Vale do Ave Açores). O operador não
publica GTFS: o site tem um PDF por linha (https://azoresbus.pt/Schedule) e o mapa «Percursos e paragens»
(https://tracking.elevensystems.pt/azb) lê uma API pública (https://azb.elevensystems.pt/api) com:
  - /stops                                  todas as paragens, com coordenadas;
  - /routes?active=true&passengerInfo=true  as linhas (número, nome, cor);
  - /routes/<id>/journeys?day=AAAA-MM-DD    as viagens de cada linha nesse dia (dias úteis, sábados, domingos e
                                            feriados já resolvidos pelo operador);
  - /routes/<id>/journeys/<viagem>          horas em cada paragem e o desenho do percurso.

Este módulo pede as viagens dos próximos dias e monta um GTFS (uma viagem por viagem do operador, com os dias em que
circula em calendar_dates). Corre todos os dias no construtor, por isso as mudanças de horário entram sozinhas.
Fuso: as horas são as dos Açores; a app conta-as em Atlantic/Azores pelas coordenadas (getFeedTimezone).

Só usa a biblioteca padrão.
Uso (ensaio): python azoresbus.py saida.zip [dias]
"""

import concurrent.futures
import csv
import datetime
import io
import json
import re
import sys
import time
import urllib.request
import zipfile

API = "https://azb.elevensystems.pt/api"
PAGINA = "https://azoresbus.pt/Schedule"
UA = "PAROU.PT/1.0 (horarios de transportes; +https://parou.pt)"
AGENCIA = {"agency_id": "azoresbus", "agency_name": "AzoresBus", "agency_url": "https://azoresbus.pt",
           "agency_timezone": "Atlantic/Azores", "agency_lang": "pt"}


def _get(caminho, tentativas=4):
    url = API + caminho
    erro = None
    for n in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json",
                                                       "Referer": "https://tracking.elevensystems.pt/azb/"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as err:  # noqa: BLE001
            erro = err
            time.sleep(1.5 * (n + 1))
    raise RuntimeError(f"{url}: {erro}")


# ---------------------------------------------------------------------------
# Nomes: a API tem tudo em maiúsculas («P. DELGADA (LG. ALMIRANTE DUNN)»)
# ---------------------------------------------------------------------------
PEQUENAS = {"da", "de", "do", "das", "dos", "e", "a", "o", "em", "na", "no", "nas", "nos", "via"}
SIGLAS = {"EB1", "EBI", "EB", "ER", "ES", "BPI", "CTT", "GNR", "PSP", "EDA", "SATA", "IPSS", "ESE", "II", "III", "IV"}


def nome_bonito(nome):
    nome = re.sub(r"\s+", " ", str(nome or "")).strip()
    if not nome:
        return ""
    if nome != nome.upper():
        return nome
    out = []
    for i, p in enumerate(re.split(r"(\s+|[()\-/])", nome)):
        if not p or p.isspace() or p in "()-/":
            out.append(p)
            continue
        base = p.rstrip(".,")
        if base in SIGLAS or re.search(r"\d", base) or base == "X":
            out.append(p)
        elif base.lower() in PEQUENAS and i > 0:
            out.append(p.lower())
        else:
            out.append(p[:1].upper() + p[1:].lower())
    s = "".join(out)
    return s[:1].upper() + s[1:]


def hhmmss(seg):
    seg = int(seg)
    return f"{seg // 3600:02d}:{(seg % 3600) // 60:02d}:{seg % 60:02d}"


def descodificar_polyline(txt):
    """Polyline do Google (precisão 5) -> [(lat, lon)]"""
    pontos, i, lat, lon = [], 0, 0, 0
    while i < len(txt):
        for eixo in (0, 1):
            r, s = 0, 0
            while True:
                b = ord(txt[i]) - 63
                i += 1
                r |= (b & 0x1F) << s
                s += 5
                if b < 0x20:
                    break
            d = ~(r >> 1) if r & 1 else (r >> 1)
            if eixo == 0:
                lat += d
            else:
                lon += d
        pontos.append((lat / 1e5, lon / 1e5))
    return pontos


def _csv(nome, campos, linhas):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=campos, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for r in linhas:
        w.writerow(r)
    return nome, buf.getvalue()


def descarregar(hoje=None, dias=14, log=print, trabalhadores=6):
    """Pede à API as paragens, as linhas e as viagens de cada dia. Devolve um dicionário com tudo."""
    hoje = hoje or datetime.date.today()
    paragens = _get("/stops")
    linhas = [r for r in _get("/routes?active=true&passengerInfo=true") if r.get("isActive", True)]
    log(f"  azoresbus: {len(paragens)} paragens, {len(linhas)} linhas na API")
    datas = [hoje + datetime.timedelta(days=n) for n in range(dias)]
    pedidos = [(r["id"], d) for r in linhas for d in datas]
    por_dia = {}  # (route_id, data) -> [viagens]
    falhas = []

    def um_dia(p):
        rid, d = p
        return p, _get(f"/routes/{rid}/journeys?day={d.isoformat()}")

    with concurrent.futures.ThreadPoolExecutor(trabalhadores) as ex:
        for fut in concurrent.futures.as_completed([ex.submit(um_dia, p) for p in pedidos]):
            try:
                p, js = fut.result()
                por_dia[p] = js or []
            except Exception as err:  # noqa: BLE001
                falhas.append(str(err))
    if falhas:
        log(f"  azoresbus: {len(falhas)} pedidos de dias falharam (ex.: {falhas[0][:160]})")
    if len(falhas) > len(pedidos) * 0.1:
        raise RuntimeError(f"demasiadas falhas na API da AzoresBus ({len(falhas)}/{len(pedidos)})")
    viagens = {}  # (route_id, journey_id) -> detalhe
    pares = sorted({(rid, str(j["id"])) for (rid, _), js in por_dia.items() for j in js})

    def detalhe(par):
        rid, jid = par
        return par, _get(f"/routes/{rid}/journeys/{jid}")

    falhas_v = []
    with concurrent.futures.ThreadPoolExecutor(trabalhadores) as ex:
        for fut in concurrent.futures.as_completed([ex.submit(detalhe, p) for p in pares]):
            try:
                par, det = fut.result()
                viagens[par] = det
            except Exception as err:  # noqa: BLE001
                falhas_v.append(str(err))
    if falhas_v:
        log(f"  azoresbus: {len(falhas_v)} viagens sem detalhe (ex.: {falhas_v[0][:160]})")
    if pares and len(falhas_v) > len(pares) * 0.1:
        raise RuntimeError(f"demasiadas viagens sem detalhe na API da AzoresBus ({len(falhas_v)}/{len(pares)})")
    return {"paragens": paragens, "linhas": linhas, "por_dia": por_dia, "viagens": viagens, "datas": datas}


def construir_gtfs(dados):
    """Monta o GTFS a partir de descarregar(). Devolve (bytes do zip, relatório)."""
    linhas = {str(r["id"]): r for r in dados["linhas"]}
    paragens = {str(p["id"]): p for p in dados["paragens"] if p.get("position")}
    # dias de cada viagem
    dias_da_viagem = {}
    for (rid, d), js in dados["por_dia"].items():
        for j in js:
            dias_da_viagem.setdefault((str(rid), str(j["id"])), set()).add(d)
    servicos = {}  # tuplo de datas -> service_id
    routes, trips, stop_times, shapes = {}, [], [], []
    usadas = {}
    sem_detalhe = 0
    for (rid, jid), datas in sorted(dias_da_viagem.items()):
        det = dados["viagens"].get((rid, jid))
        r = linhas.get(rid)
        circ = sorted((det or {}).get("circulations") or [], key=lambda c: c.get("sequence") or 0)
        if not det or not r or len(circ) < 2:
            sem_detalhe += 1
            continue
        chave = tuple(sorted(datas))
        sid = servicos.setdefault(chave, f"azb_s{len(servicos) + 1}")
        route_id = f"azb_{r['nameShort']}"
        routes[route_id] = {"route_id": route_id, "agency_id": "azoresbus", "route_short_name": r["nameShort"],
                            "route_long_name": nome_bonito(r.get("name")), "route_type": 3,
                            "route_color": (r.get("color") or "2D59A9").lstrip("#")[:6],
                            "route_text_color": "FFFFFF", "route_url": PAGINA}
        tid = f"azb_{rid}_{jid}"
        shape_id = ""
        if det.get("shape"):
            try:
                pts = descodificar_polyline(det["shape"])
                if len(pts) >= 2:
                    shape_id = f"azb_sh_{rid}_{jid}"
                    for n, (la, lo) in enumerate(pts):
                        shapes.append({"shape_id": shape_id, "shape_pt_lat": f"{la:.6f}", "shape_pt_lon": f"{lo:.6f}",
                                       "shape_pt_sequence": n + 1})
            except Exception:  # noqa: BLE001
                shape_id = ""
        ultima = circ[-1]["stage"]
        circular = str(circ[0]["stage"]["id"]) == str(ultima["id"])
        trips.append({"route_id": route_id, "service_id": sid, "trip_id": tid,
                      "trip_headsign": nome_bonito(ultima.get("name")) if not circular else nome_bonito(r.get("name")),
                      "direction_id": int(det.get("direction") or 0) % 2, "shape_id": shape_id})
        anterior = -1
        for n, c in enumerate(circ):
            st = c["stage"]
            sid_p = str(st["id"])
            if sid_p not in paragens and st.get("position"):
                paragens[sid_p] = st
            usadas[sid_p] = True
            chegada = int(c.get("arrivalTime") if c.get("arrivalTime") is not None else c.get("departureTime"))
            partida = int(c.get("departureTime") if c.get("departureTime") is not None else chegada)
            # horas sempre a subir (passagem da meia-noite e erros de digitação do operador)
            while chegada < anterior - 6 * 3600:
                chegada += 86400
                partida += 86400
            partida = max(partida, chegada)
            anterior = partida
            stop_times.append({"trip_id": tid, "arrival_time": hhmmss(chegada), "departure_time": hhmmss(partida),
                               "stop_id": f"azb_{sid_p}", "stop_sequence": n + 1})
    calendar_dates = [{"service_id": sid, "date": d.strftime("%Y%m%d"), "exception_type": 1}
                      for chave, sid in servicos.items() for d in chave]
    stops = [{"stop_id": f"azb_{i}", "stop_code": p.get("nameShort") or "", "stop_name": nome_bonito(p.get("name")) or "Paragem",
              "stop_lat": f"{p['position']['lat']:.6f}", "stop_lon": f"{p['position']['lon']:.6f}"}
             for i, p in paragens.items() if i in usadas and p.get("position")]
    ficheiros = [
        _csv("agency.txt", list(AGENCIA), [AGENCIA]),
        _csv("stops.txt", ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon"], stops),
        _csv("routes.txt", ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color",
                            "route_text_color", "route_url"], sorted(routes.values(), key=lambda x: x["route_short_name"])),
        _csv("trips.txt", ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"], trips),
        _csv("stop_times.txt", ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], stop_times),
        _csv("calendar_dates.txt", ["service_id", "date", "exception_type"], calendar_dates),
        _csv("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"], shapes),
        _csv("feed_info.txt", ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version"],
             [{"feed_publisher_name": "PAROU.PT (a partir da API pública de horários da AzoresBus)",
               "feed_publisher_url": "https://parou.pt", "feed_lang": "pt",
               "feed_version": datetime.date.today().isoformat()}]),
    ]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, txt in ficheiros:
            z.writestr(nome, txt)
    rel = (f"{len(routes)} linhas, {len(trips)} viagens, {len(stops)} paragens, {len(servicos)} calendários"
           + (f", {sem_detalhe} viagens sem detalhe" if sem_detalhe else ""))
    return buf.getvalue(), rel


def descarregar_e_converter(log=print, hoje=None, dias=14):
    dados = descarregar(hoje=hoje, dias=dias, log=log)
    corpo, rel = construir_gtfs(dados)
    log(f"  azoresbus: {rel}")
    if not dados["viagens"]:
        raise RuntimeError("a API da AzoresBus não devolveu viagens")
    return corpo


if __name__ == "__main__":
    saida = sys.argv[1] if len(sys.argv) > 1 else "azoresbus.zip"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 14
    with open(saida, "wb") as f:
        f.write(descarregar_e_converter(dias=n))
    print("escrito", saida)
