"""Andante (Área Metropolitana do Porto): zonas, anéis e preços oficiais, para a app dizer que título comprar em cada trajeto.

Tudo vem do site oficial (andante.pt), todos os dias:
  - distâncias entre zonas (anéis), do mapa oficial «Selecione uma zona no mapa e verifique qual o título necessário»:
    /wp-content/uploads/maps/data/distances.csv  (origem;destino;distância; a própria zona conta 1)
  - polígonos das zonas, do mesmo mapa: /wp-content/uploads/maps/data/zAndante.geojson
  - preços das viagens ocasionais, duração máxima de cada título e preço do cartão Azul: página «Andante Azul»
    (/comprar/andante-azul/), em HTML, com a data em que os valores entraram em vigor.

Regra oficial (andante.pt/titulos-ocasionais): os títulos valem para os anéis de zonas contados à volta da zona da 1.ª
validação (Z2 = 2 anéis, Z3 = 3, …), com um mínimo de 2. A app guarda as zonas e os anéis; o servidor faz a conta.

Zona de cada paragem:
  - Metro do Porto e STCP: a zona que o próprio operador publica no GTFS (zone_id), se for uma zona Andante conhecida.
  - UNIR e CP: o polígono oficial onde a paragem cai, só se estiver a mais de MARGEM_M da fronteira (perto da fronteira
    não há certeza e a app não mostra preço). Na STCP, este método dá a mesma zona do GTFS em 2341 de 2342 paragens.

Se o site não responder, copiam-se os dados de ontem (com a data em que foram obtidos); o servidor só mostra preços
obtidos há poucos dias.
"""

import csv
import datetime
import html
import io
import json
import math
import re
import urllib.request

BASE = "https://andante.pt"
URL_DISTANCIAS = f"{BASE}/wp-content/uploads/maps/data/distances.csv"
URL_POLIGONOS = f"{BASE}/wp-content/uploads/maps/data/zAndante.geojson"
URL_PRECOS = f"{BASE}/comprar/andante-azul/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
MARGEM_M = 60
# Operadores onde valem os títulos ocasionais Andante (andante.pt/perguntas-frequentes): toda a rede da STCP, do Metro e
# da UNIR, e os comboios urbanos e regionais da CP. Para a CP, o servidor confirma também o tipo de comboio.
FEEDS_GTFS = ("metro_porto", "stcp")
FEEDS_POLIGONO = ("unir", "cp")

MESES = {"janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
         "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ---------------------------------------------------------------------------------------------- leitura (sem rede)

def ler_distancias(texto):
    """distances.csv -> {(origem, destino): anéis}. Rejeita ficheiros incompletos ou estranhos."""
    linhas = list(csv.reader(io.StringIO(texto.strip()), delimiter=";"))
    if not linhas or [c.strip().lower() for c in linhas[0]] != ["origin_id", "destination_id", "distance"]:
        raise ValueError("cabeçalho inesperado nas distâncias")
    dist = {}
    for l in linhas[1:]:
        if len(l) != 3:
            continue
        a, b, d = l[0].strip(), l[1].strip(), l[2].strip()
        if not a or not b or not d.isdigit():
            continue
        dist[(a, b)] = int(d)
    zonas = {a for a, _ in dist}
    if len(zonas) < 50 or any(dist.get((z, z)) != 1 for z in zonas):
        raise ValueError("distâncias incompletas (cada zona deve estar a 1 anel de si própria)")
    if len(dist) < len(zonas) * (len(zonas) - 1):
        raise ValueError("faltam pares de zonas nas distâncias")
    return dist


def ler_poligonos(texto):
    """zAndante.geojson -> lista de (zona, lista de polígonos [anel exterior, buracos...], caixa)"""
    gj = json.loads(texto)
    out = []
    for f in gj.get("features") or []:
        zona = ((f.get("properties") or {}).get("zona") or "").strip()
        g = f.get("geometry") or {}
        if not zona or g.get("type") not in ("Polygon", "MultiPolygon"):
            continue
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        xs = [p[0] for poly in polys for p in poly[0]]
        ys = [p[1] for poly in polys for p in poly[0]]
        out.append((zona, polys, (min(xs), min(ys), max(xs), max(ys))))
    if len(out) < 50:
        raise ValueError("poucos polígonos de zonas")
    return out


def _texto_da_pagina(pagina):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", pagina, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _euros(txt):
    return round(float(txt.replace(",", ".")), 2)


def ler_precos(pagina):
    """Página «Andante Azul» -> preços simples e 24 h por título, duração máxima de cada título, cartão Azul e data de
    entrada em vigor. Falha (ValueError) se algo não bater certo: mais vale não mostrar preço do que mostrar um errado."""
    t = _texto_da_pagina(pagina)
    i = t.find("Simples 24 Horas")
    if i < 0:
        raise ValueError("tabela de preços não encontrada")
    simples, h24 = {}, {}
    for m in re.finditer(r"\bZ(\d{1,2}) (\d{1,2},\d{2}) (\d{1,2},\d{2})\b", t[i:i + 600]):
        z = int(m.group(1))
        simples[z], h24[z] = _euros(m.group(2)), _euros(m.group(3))
    if 2 not in simples or len(simples) < 5:
        raise ValueError("tabela de preços incompleta")
    zs = sorted(simples)
    if zs != list(range(2, zs[-1] + 1)):
        raise ValueError("títulos em falta na tabela de preços")
    for a, b in zip(zs, zs[1:]):
        if not (simples[a] < simples[b] and h24[a] < h24[b]):
            raise ValueError("preços que não sobem com as zonas")
    if not all(0.5 <= simples[z] <= 30 and simples[z] < h24[z] <= 60 for z in zs):
        raise ValueError("preços fora do normal")

    j = t.find("Duração máx.")
    if j < 0:
        raise ValueError("tabela de durações não encontrada")
    duracoes = {}
    for m in re.finditer(r"\bZ(\d{1,2}) (\d{1,2})h ?(\d{2})m\b", t[j:j + 400]):
        duracoes[int(m.group(1))] = int(m.group(2)) * 60 + int(m.group(3))
    if any(z not in duracoes for z in zs) or not all(30 <= duracoes[z] <= 300 for z in zs):
        raise ValueError("durações em falta ou estranhas")

    c = re.search(r"Andante Azul (\d{1,2},\d{2}) ?€", t)
    cartao = _euros(c.group(1)) if c else None
    if cartao is not None and not 0.1 <= cartao <= 5:
        cartao = None

    v = re.search(r"em vigor desde (\d{1,2}) de ([a-zç]+) de (\d{4})", t, flags=re.I)
    vigor = None
    if v and v.group(2).lower() in MESES:
        vigor = datetime.date(int(v.group(3)), MESES[v.group(2).lower()], int(v.group(1))).isoformat()
    return {"simples": simples, "h24": h24, "duracao_min": {z: duracoes[z] for z in zs}, "cartao_azul": cartao,
            "em_vigor_desde": vigor}


# ---------------------------------------------------------------------------------------------- geometria

def _dentro_anel(x, y, anel):
    c = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i][0], anel[i][1]
        xj, yj = anel[j][0], anel[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def _dentro(x, y, polys):
    return any(_dentro_anel(x, y, p[0]) and not any(_dentro_anel(x, y, h) for h in p[1:]) for p in polys)


def _dist_borda_m(x, y, polys):
    kx = 111320 * math.cos(math.radians(y))
    ky = 110540
    melhor = float("inf")
    for p in polys:
        for anel in p:
            for i in range(1, len(anel)):
                ax, ay = (anel[i - 1][0] - x) * kx, (anel[i - 1][1] - y) * ky
                bx, by = (anel[i][0] - x) * kx, (anel[i][1] - y) * ky
                dx, dy = bx - ax, by - ay
                l2 = dx * dx + dy * dy
                t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / l2))
                px, py = ax + t * dx, ay + t * dy
                melhor = min(melhor, math.hypot(px, py))
    return melhor


def zona_do_ponto(lat, lon, poligonos, margem_m=MARGEM_M):
    """Zona oficial onde cai o ponto, ou None se fica fora de todas ou perto demais de uma fronteira"""
    for zona, polys, (x0, y0, x1, y1) in poligonos:
        if not (x0 <= lon <= x1 and y0 <= lat <= y1):
            continue
        if _dentro(lon, lat, polys):
            return zona if _dist_borda_m(lon, lat, polys) >= margem_m else None
    return None


# ---------------------------------------------------------------------------------------------- base de dados

def zonas_das_paragens(conn, poligonos, codigos):
    """[(stop_id, zona, origem)] para as paragens dos operadores Andante"""
    out = []
    marcas = ",".join("?" * len(FEEDS_GTFS))
    for sid, z in conn.execute(f"SELECT stop_id, zone_id FROM stops WHERE feed_id IN ({marcas})", FEEDS_GTFS):
        z = (z or "").strip()
        if z in codigos:
            out.append((sid, z, "gtfs"))
    marcas = ",".join("?" * len(FEEDS_POLIGONO))
    for sid, lat, lon in conn.execute(
            f"SELECT stop_id, stop_lat, stop_lon FROM stops WHERE feed_id IN ({marcas})", FEEDS_POLIGONO):
        if lat is None or lon is None:
            continue
        z = zona_do_ponto(float(lat), float(lon), poligonos)
        if z and z in codigos:
            out.append((sid, z, "mapa"))
    return out


def _criar_tabelas(conn):
    conn.execute("DROP TABLE IF EXISTS main.andante_dist")
    conn.execute("DROP TABLE IF EXISTS main.andante_zona")
    conn.execute("CREATE TABLE main.andante_dist (o TEXT NOT NULL, d TEXT NOT NULL, n INTEGER NOT NULL, "
                 "PRIMARY KEY (o, d)) WITHOUT ROWID")
    conn.execute("CREATE TABLE main.andante_zona (stop_id TEXT PRIMARY KEY, zona TEXT NOT NULL, origem TEXT NOT NULL) "
                 "WITHOUT ROWID")


def _estado_anterior(conn):
    try:
        r = conn.execute("SELECT value FROM prev.app_state WHERE key = 'andante'").fetchone()
        return json.loads(r[0]) if r else None
    except Exception:  # noqa: BLE001
        return None


def gravar(conn, log=print, agora=None, buscar=_get):
    """Obtém tudo do site oficial e grava na base. Devolve o estado gravado (ou None se não houve nada)."""
    agora = agora or datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    anterior = _estado_anterior(conn)
    estado = {"fonte_zonas": f"{BASE}/titulos-ocasionais/", "fonte_precos": URL_PRECOS}
    zonas_ok = False
    try:
        dist = ler_distancias(buscar(URL_DISTANCIAS).decode("utf-8-sig"))
        poligonos = ler_poligonos(buscar(URL_POLIGONOS).decode("utf-8-sig"))
        codigos = {a for a, _ in dist}
        if {z for z, _, _ in poligonos} - codigos:
            raise ValueError("há zonas no mapa sem distâncias")
        _criar_tabelas(conn)
        conn.executemany("INSERT INTO main.andante_dist (o, d, n) VALUES (?, ?, ?)",
                         [(a, b, n) for (a, b), n in dist.items()])
        zonas = zonas_das_paragens(conn, poligonos, codigos)
        conn.executemany("INSERT OR REPLACE INTO main.andante_zona (stop_id, zona, origem) VALUES (?, ?, ?)", zonas)
        estado["zonas_obtidas"] = agora
        estado["n_zonas"] = len(codigos)
        estado["n_paragens"] = len(zonas)
        zonas_ok = True
        log(f"Andante: {len(codigos)} zonas, {len(zonas)} paragens com zona "
            f"({sum(1 for z in zonas if z[2] == 'gtfs')} do GTFS, {sum(1 for z in zonas if z[2] == 'mapa')} pelo mapa)")
    except Exception as e:  # noqa: BLE001
        log(f"Andante: zonas do site oficial indisponíveis ({str(e)[:120]}); a copiar as de ontem")
        try:
            _criar_tabelas(conn)
            conn.execute("INSERT INTO main.andante_dist SELECT o, d, n FROM prev.andante_dist")
            conn.execute("INSERT INTO main.andante_zona SELECT stop_id, zona, origem FROM prev.andante_zona")
            if anterior and anterior.get("zonas_obtidas"):
                estado.update({k: anterior[k] for k in ("zonas_obtidas", "n_zonas", "n_paragens") if k in anterior})
                zonas_ok = True
        except Exception as e2:  # noqa: BLE001
            log(f"Andante: sem zonas de ontem ({str(e2)[:80]}); a app não mostra títulos")
            conn.execute("DROP TABLE IF EXISTS main.andante_dist")
            conn.execute("DROP TABLE IF EXISTS main.andante_zona")
    try:
        p = ler_precos(buscar(URL_PRECOS).decode("utf-8", "replace"))
        estado["precos"] = {"simples": p["simples"], "h24": p["h24"], "duracao_min": p["duracao_min"],
                            "cartao_azul": p["cartao_azul"], "em_vigor_desde": p["em_vigor_desde"], "obtidos": agora}
        log(f"Andante: preços em vigor desde {p['em_vigor_desde']}: Z2 {p['simples'][2]} €, "
            f"até Z{max(p['simples'])}")
    except Exception as e:  # noqa: BLE001
        log(f"Andante: preços do site oficial indisponíveis ({str(e)[:120]})")
        if anterior and anterior.get("precos"):
            estado["precos"] = anterior["precos"]
    if not zonas_ok:
        return None
    conn.execute("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)",
                 ("andante", json.dumps(estado, ensure_ascii=False)))
    conn.commit()
    return estado
