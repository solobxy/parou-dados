#!/usr/bin/env python3
"""Desenha pela estrada (ou pelo carril) as linhas que não trazem desenho nos horários oficiais, com o OSRM e o mapa do OpenStreetMap.

Quem:  UNIR (só tem a ordem das paragens), Comboio CP (sem desenhos) e, opcionalmente, Metro de Lisboa e do Porto (desenhos muito esparsos).
Como:  para cada sequência de paragens pede ao OSRM a rota que passa por todas, pela ordem, sem inverter a marcha nas paragens.
       Carros: estradas. Carris: perfil osrm/comboio.lua (caminho de ferro, metro, metro ligeiro).
       Onde o OSRM não encontra estrada/carril perto de uma paragem, ou dá uma volta absurda, o troço fica a direito entre essas paragens
       (a app faz o mesmo: une só essas paragens em linha reta) — nunca se inventa um caminho.
Saída: desenhos-extra.json.gz  { "caminhos": { chave_da_sequencia: polilinha(6 casas) }, "relatorio": {...} }
       A chave é construir_dados.chave_padrao(ids das paragens) e é a que o gerador diário dos dados usa para ligar o desenho às viagens.

Uso: python3 auditoria/estradas.py --db gtfs.db --carro http://127.0.0.1:5000 --comboio http://127.0.0.1:5001 --saida desenhos-extra.json.gz [--limite 30]
"""
import argparse
import concurrent.futures
import gzip
import json
import math
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from construir_dados import chave_padrao, codificar_polilinha, descodificar_polilinha, simplificar  # noqa: E402

RAIO_M = 150            # distância máxima de uma paragem à estrada/carril onde se encaixa
JANELA = 50             # paragens por pedido (com 1 de sobreposição)
RAZAO_MAX_PAR = 3.0     # uma volta destas entre duas paragens seguidas é absurda
EXCESSO_MIN_M = 800     # (e só conta se passar de tudo isto metros além da linha reta)
FRACAO_MIN_BOA = 0.6    # sequências com menos pares bem encaixados ficam sem desenho
SIGMA_M = 40            # incerteza que se dá ao OSRM sobre onde a paragem está (ele procura até 3× isto à volta)


def haversine(a, b):
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def comprimento(pontos):
    return sum(haversine(pontos[i], pontos[i + 1]) for i in range(len(pontos) - 1))


def osrm_rota(base, pontos):
    """Rota por todos os pontos (lat, lon), pela ordem. Devolve (pontos da rota, distâncias das pernas) ou (None, mensagem)."""
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in pontos)
    raios = ";".join(str(RAIO_M) for _ in pontos)
    url = (f"{base}/route/v1/driving/{coords}?overview=full&geometries=polyline6&steps=false&alternatives=false"
           f"&continue_straight=true&radiuses={raios}")
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            dados = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            dados = json.loads(e.read())
        except Exception:
            return None, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:120]
    if dados.get("code") != "Ok" or not dados.get("routes"):
        return None, f"{dados.get('code')}: {dados.get('message', '')}"
    rota = dados["routes"][0]
    return descodificar_polilinha(rota["geometry"], 6), [leg["distance"] for leg in rota["legs"]]


def mais_perto(base, lat, lon):
    """Distância (m) do ponto à estrada/carril mais próximo, sem limite de raio (só para explicar falhas)."""
    try:
        with urllib.request.urlopen(f"{base}/nearest/v1/driving/{lon:.6f},{lat:.6f}?number=1", timeout=30) as r:
            return round(json.loads(r.read())["waypoints"][0]["distance"])
    except Exception:  # noqa: BLE001
        return None


def osrm_match(base, pontos, sigma=None):
    """Pede ao OSRM que case a sequência de paragens com a estrada/carril (escolhe, para todas as paragens em conjunto, os pontos
    que dão o caminho mais coerente: assim as duas vias de um metro, ou os dois lados de uma rua, não se misturam).
    Devolve a resposta (dict com "code"); em caso de falha, {"code": "Erro", "message": ...}."""
    sigma = sigma or SIGMA_M
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in pontos)
    raios = ";".join(str(sigma) for _ in pontos)
    url = (f"{base}/match/v1/driving/{coords}?overview=full&geometries=polyline6&steps=false&annotations=false"
           f"&gaps=ignore&tidy=false&radiuses={raios}")
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except Exception:  # noqa: BLE001
            return {"code": "Erro", "message": f"HTTP {e.code}"}
    except Exception as e:  # noqa: BLE001
        return {"code": "Erro", "message": str(e)[:120]}


def fracao_encaixada(linha, pontos, raio_m):
    """Fração das paragens que ficam a menos de `raio_m` metros do desenho (é o que a app exige para aceitar o desenho)."""
    if len(linha) < 2 or not pontos:
        return 0.0
    perto = 0
    for (lat, lon) in pontos:
        k = math.cos(math.radians(lat)) * 111320.0
        m = 110540.0
        melhor = 1e12
        for i in range(len(linha) - 1):
            ax, ay = (linha[i][1] - lon) * k, (linha[i][0] - lat) * m
            bx, by = (linha[i + 1][1] - lon) * k, (linha[i + 1][0] - lat) * m
            if min(ax, bx) > raio_m or max(ax, bx) < -raio_m or min(ay, by) > raio_m or max(ay, by) < -raio_m:
                continue
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            t = 0.0 if L == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L))
            d = math.hypot(ax + t * dx, ay + t * dy)
            if d < melhor:
                melhor = d
        if melhor <= raio_m:
            perto += 1
    return perto / len(pontos)


def rota_com_janelas(base, pontos):
    """Rota por todos os pontos, em janelas de JANELA paragens. (pontos da rota, distâncias das pernas) ou (None, mensagem)."""
    geometria, pernas = [], []
    i = 0
    while i < len(pontos) - 1:
        fim = min(len(pontos), i + JANELA)
        g, extra = osrm_rota(base, pontos[i:fim])
        if g is None:
            return None, extra
        if geometria and g and haversine(geometria[-1], g[0]) < 5:
            g = g[1:]
        geometria.extend(g)
        pernas.extend(extra)
        i = fim - 1
    return geometria, pernas


def desenhar_sequencia(base, pontos, nomes=None, eventos=None):
    """Desenho de uma sequência de paragens: (polilinha, fração de pares bem encaixados, razão comprimento/linha reta) ou None.
    `eventos` (opcional) recebe o que correu mal, para o relatório."""
    n = len(pontos)
    nomes = nomes or [str(i) for i in range(n)]
    eventos = eventos if eventos is not None else []
    if n < 2:
        return None
    bom = [True] * (n - 1)       # o par (k, k+1) tem estrada
    fora = [False] * n           # paragem sem estrada à volta

    def resolver(ini, fim, profundidade=0):
        """Rota de ini..fim (inclusive). Devolve lista de troços (listas de pontos da rota)."""
        if fim - ini < 1:
            return []
        g, extra = rota_com_janelas(base, pontos[ini:fim + 1])
        if g is None:
            # NoSegment: "Could not find a matching segment for coordinate 3"
            m = re.search(r"coordinate (\d+)", str(extra))
            if m and profundidade < 12:
                k = ini + int(m.group(1))
                if 0 <= k - ini <= fim - ini:
                    eventos.append({"tipo": "sem_estrada", "paragem": nomes[k], "mais_perto_m": mais_perto(base, *pontos[k])})
                    fora[k] = True
                    if k > ini:
                        bom[k - 1] = False
                    if k < fim:
                        bom[k] = False
                    return resolver(ini, k - 1, profundidade + 1) + resolver(k + 1, fim, profundidade + 1)
            eventos.append({"tipo": "erro_osrm", "mensagem": str(extra)[:100], "paragens": f"{nomes[ini]} … {nomes[fim]}"})
            for k in range(ini, fim):
                bom[k] = False
            return []
        for k, d in enumerate(extra):
            reta = haversine(pontos[ini + k], pontos[ini + k + 1])
            if reta > 0 and d > RAZAO_MAX_PAR * reta and d - reta > EXCESSO_MIN_M:
                # Volta absurda: parte-se aqui e este par fica a direito
                eventos.append({"tipo": "volta_absurda", "de": nomes[ini + k], "para": nomes[ini + k + 1], "reta_m": round(reta), "rota_m": round(d)})
                bom[ini + k] = False
                return resolver(ini, ini + k, profundidade + 1) + resolver(ini + k + 1, fim, profundidade + 1)
        return [g]

    troços = resolver(0, n - 1)
    if not troços:
        return None
    fracao = sum(bom) / (n - 1)
    if fracao < FRACAO_MIN_BOA:
        return None
    linha = [p for t in troços for p in t]
    if len(linha) < 2:
        return None
    reta = sum(haversine(pontos[k], pontos[k + 1]) for k in range(n - 1))
    razao = comprimento(linha) / reta if reta > 0 else 1.0
    return codificar_polilinha(simplificar(linha, 1.5), 6), fracao, razao


def desenhar_por_match(base, pontos, nomes=None, eventos=None):
    """Como desenhar_sequencia, mas com o «match» do OSRM: escolhe de uma vez o caminho de toda a sequência.
    Paragem que não casa com nenhuma estrada/carril, ou troço sem ligação, ou volta absurda: esses pares ficam a direito."""
    n = len(pontos)
    nomes = nomes or [str(i) for i in range(n)]
    eventos = eventos if eventos is not None else []
    if n < 2:
        return None
    bom = [False] * (n - 1)

    def resolver(ini, fim, profundidade=0):
        if fim - ini < 1:
            return []
        dados = osrm_match(base, pontos[ini:fim + 1])
        if dados.get("code") != "Ok" or not dados.get("matchings"):
            eventos.append({"tipo": "sem_match", "paragem": f"{nomes[ini]} … {nomes[fim]}", "codigo": dados.get("code"), "mensagem": str(dados.get("message", ""))[:80]})
            return []
        tps, ms = dados.get("tracepoints") or [], dados["matchings"]
        por_troco = {}
        for k, t in enumerate(tps):
            if t is None:
                eventos.append({"tipo": "sem_match", "paragem": nomes[ini + k], "mais_perto_m": mais_perto(base, *pontos[ini + k])})
                continue
            por_troco.setdefault(t["matchings_index"], []).append((t["waypoint_index"], ini + k))
        for m_i in sorted(por_troco):
            lista = sorted(por_troco[m_i])
            for (w, a), (_, b) in zip(lista, lista[1:]):
                d = ms[m_i]["legs"][w]["distance"]
                reta = haversine(pontos[a], pontos[b])
                if reta > 0 and d > RAZAO_MAX_PAR * reta and d - reta > EXCESSO_MIN_M and profundidade < 12:
                    eventos.append({"tipo": "volta_absurda", "de": nomes[a], "para": nomes[b], "reta_m": round(reta), "rota_m": round(d)})
                    return resolver(ini, a, profundidade + 1) + resolver(b, fim, profundidade + 1)
        troços = []
        for m_i in sorted(por_troco):
            lista = sorted(por_troco[m_i])
            for (_, a), (_, b) in zip(lista, lista[1:]):
                if b == a + 1:
                    bom[a] = True
            troços.append(descodificar_polilinha(ms[m_i]["geometry"], 6))
        return troços

    troços = resolver(0, n - 1)
    if not troços:
        return None
    fracao = sum(bom) / (n - 1)
    if fracao < FRACAO_MIN_BOA:
        return None
    linha = [p for t in troços for p in t]
    if len(linha) < 2:
        return None
    reta = sum(haversine(pontos[k], pontos[k + 1]) for k in range(n - 1))
    razao = comprimento(linha) / reta if reta > 0 else 1.0
    return codificar_polilinha(simplificar(linha, 1.5), 6), fracao, razao


def sequencias_unir(conn, limite=None):
    cur = conn.execute(
        "SELECT sr.route_id, sr.direction_id, sr.stop_id, s.stop_lat, s.stop_lon, s.stop_name FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id "
        "WHERE sr.route_id LIKE 'unir:%' AND s.stop_lat IS NOT NULL AND s.stop_lon IS NOT NULL ORDER BY sr.route_id, sr.direction_id, sr.stop_sequence")
    grupos = {}
    for rota, sentido, sid, lat, lon, nome in cur:
        grupos.setdefault((rota, sentido), []).append((sid, lat, lon, nome))
    return limitar(list(grupos.values()), limite)


def sequencias_viagens(conn, feeds, limite=None):
    padroes = {}
    for feed in feeds:
        cur = conn.execute(
            "SELECT t.trip_id, st.stop_id, s.stop_lat, s.stop_lon, s.stop_name FROM trips t JOIN stop_times st ON st.trip_id = t.trip_id "
            "JOIN stops s ON s.stop_id = st.stop_id WHERE t.feed_id = ? AND s.stop_lat IS NOT NULL ORDER BY t.trip_id, st.stop_sequence", (feed,))
        atual, seq = None, []
        def fecha():
            if len(seq) >= 2:
                padroes.setdefault(chave_padrao([x[0] for x in seq]), list(seq))
        for tid, sid, lat, lon, nome in cur:
            if tid != atual:
                fecha()
                atual, seq = tid, []
            seq.append((sid, lat, lon, nome))
        fecha()
    return limitar(list(padroes.values()), limite)


def limitar(lista, limite):
    if not limite or len(lista) <= limite:
        return lista
    passo = len(lista) / limite
    return [lista[int(i * passo)] for i in range(limite)]


def correr(nome, base, sequencias, relatorio, caminhos, modo="route", metricas=False):
    t0 = time.time()
    feitas = 0
    sem = 0
    fracoes, razoes, encaixes = [], [], []
    motivos, exemplos = {}, []
    desenhar = desenhar_por_match if modo == "match" else desenhar_sequencia

    def um(seq):
        eventos = []
        pontos = [(s[1], s[2]) for s in seq]
        res = desenhar(base, pontos, [s[3] if len(s) > 3 else s[0] for s in seq], eventos)
        enc = fracao_encaixada(descodificar_polilinha(res[0], 6), pontos, 80) if (metricas and res) else None
        return chave_padrao([s[0] for s in seq]), res, eventos, enc

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for chave, res, eventos, enc in ex.map(um, sequencias):
            for e in eventos:
                motivos[e["tipo"]] = motivos.get(e["tipo"], 0) + 1
                if sum(1 for x in exemplos if x["tipo"] == e["tipo"]) < 8:
                    exemplos.append(e)
            if res is None:
                sem += 1
                continue
            caminhos[chave] = res[0]
            feitas += 1
            fracoes.append(res[1])
            razoes.append(res[2])
            if enc is not None:
                encaixes.append(enc)
    razoes.sort()
    relatorio[nome] = {
        "sequencias": len(sequencias), "desenhadas": feitas, "sem_desenho": sem,
        "fracao_media_pares_bons": round(sum(fracoes) / len(fracoes), 3) if fracoes else None,
        "razao_mediana": round(razoes[len(razoes) // 2], 3) if razoes else None,
        "razao_p95": round(razoes[int(len(razoes) * 0.95)], 3) if razoes else None,
        "paragens_a_menos_de_80m": round(sum(encaixes) / len(encaixes), 3) if encaixes else None,
        "modo": modo, "motivos": motivos, "exemplos": exemplos,
        "segundos": round(time.time() - t0, 1),
    }
    print(f"{nome}: {json.dumps(relatorio[nome], ensure_ascii=False)}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--carro", help="OSRM de estradas (ex.: http://127.0.0.1:5000)")
    ap.add_argument("--comboio", help="OSRM de carris (ex.: http://127.0.0.1:5001)")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--limite", type=int, default=0, help="só uma amostra de N sequências por grupo (sonda)")
    ap.add_argument("--carris", default="cp,metro_porto,metro_lisboa", help="operadores desenhados pelo carril")
    ap.add_argument("--modo", choices=["route", "match"], default="route", help="como pedir ao OSRM: route (paragem a paragem) ou match (sequência inteira)")
    ap.add_argument("--metricas", action="store_true", help="mede também quantas paragens ficam a menos de 80 m do desenho (mais lento; para ensaios)")
    args = ap.parse_args()

    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    caminhos, relatorio = {}, {}
    if args.carro:
        correr("unir", args.carro, sequencias_unir(conn, args.limite), relatorio, caminhos, args.modo, args.metricas)
    if args.comboio:
        for feed in [f for f in args.carris.split(",") if f]:
            correr(feed, args.comboio, sequencias_viagens(conn, [feed], args.limite), relatorio, caminhos, args.modo, args.metricas)
    saida = {"versao": 1, "criado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "caminhos": caminhos, "relatorio": relatorio,
             "carris": [f for f in args.carris.split(",") if f] if args.comboio else []}
    with gzip.open(args.saida, "wt", encoding="utf-8") as f:
        json.dump(saida, f, separators=(",", ":"))
    print(f"desenhos: {len(caminhos)}  ficheiro: {os.path.getsize(args.saida)} bytes", flush=True)


if __name__ == "__main__":
    main()
