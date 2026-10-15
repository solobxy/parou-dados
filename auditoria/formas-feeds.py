#!/usr/bin/env python3
"""Mede, feed a feed, se os horários oficiais (GTFS) trazem o desenho do percurso (shapes.txt) e se esse desenho é bom:
 - tem shapes.txt? quantos desenhos e que parte das viagens aponta para um (shape_id)?
 - quão densos são os pontos (distância mediana entre pontos; desenhos com saltos de mais de 200 m são «a direito»)?
 - numa amostra de viagens: a que distância (m) fica cada paragem do desenho? (se o desenho passa longe das paragens, não serve)
Uso: python auditoria/formas-feeds.py   (corre a partir da raiz do repositório; escreve res/formas-feeds.txt e res/formas-feeds.json)"""
import io, json, math, os, random, sys, zipfile
sys.path.insert(0, os.getcwd())
import construir_dados as cd

random.seed(7)
SAIDA = os.environ.get("SAIDA", "res")
os.makedirs(SAIDA, exist_ok=True)
linhas_txt = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); linhas_txt.append(s)

def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(d))

def dist_ponto_polilinha(pt, pts):
    """distância mínima (m) de pt à polilinha, em plano local"""
    k = math.cos(math.radians(pt[0])) * 111320.0; m = 110540.0
    px, py = 0.0, 0.0
    best = 1e12
    for i in range(len(pts) - 1):
        ax, ay = (pts[i][1] - pt[1]) * k, (pts[i][0] - pt[0]) * m
        bx, by = (pts[i + 1][1] - pt[1]) * k, (pts[i + 1][0] - pt[0]) * m
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, -(ax * dx + ay * dy) / L))
        x, y = ax + t * dx, ay + t * dy
        d = math.hypot(x, y)
        if d < best: best = d
    return best

def obter(feed):
    cands = []
    for api in feed.get("ckan_apis", []):
        try:
            cands += [c[0] for c in cd.resolve_ckan_candidates(api)]
            if cands: break
        except Exception as e:  # noqa: BLE001
            p("   (portal indisponível:", str(e)[:80], ")")
    for u in (feed.get("url"), feed.get("mirror")):
        if u and u not in cands: cands.append(u)
    for u in cands[:4]:
        try:
            body, *_ = cd.download_zip(u)
            return body
        except Exception as e:  # noqa: BLE001
            p("   falhou", u[:70], str(e)[:80])
    return None

def analisar(nome, body):
    zf = zipfile.ZipFile(io.BytesIO(body))
    zf = cd.unwrap_zip(body) if hasattr(cd, "unwrap_zip") and False else zf
    res = {"feed": nome}
    formas = {}
    n_pts = 0
    for r in cd.gtfs_rows(zf, "shapes.txt"):
        try:
            formas.setdefault(r["shape_id"], []).append((int(float(r.get("shape_pt_sequence") or 0)), float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
            n_pts += 1
        except (KeyError, ValueError):
            continue
    res["shapes"] = len(formas); res["pontos"] = n_pts
    if not formas:
        p(f"{nome:22s} SEM shapes.txt"); return res
    for k in formas: formas[k].sort()
    viag_forma = {}; n_viag = 0
    for r in cd.gtfs_rows(zf, "trips.txt"):
        n_viag += 1
        if r.get("shape_id"): viag_forma[r["trip_id"]] = (r["shape_id"], r.get("route_id"))
    res["viagens"] = n_viag; res["viagens_com_forma"] = len(viag_forma)
    sp = []; saltos = 0
    for k, v in formas.items():
        mx = 0
        for i in range(len(v) - 1):
            d = hav(v[i][1:], v[i + 1][1:]); sp.append(d); mx = max(mx, d)
        if mx > 200: saltos += 1
    sp.sort()
    res["espaco_mediano_m"] = round(sp[len(sp) // 2], 1) if sp else None
    res["formas_com_salto_200m"] = saltos
    # amostra de viagens: distância das paragens ao desenho
    amostra = random.sample(list(viag_forma), min(40, len(viag_forma)))
    alvo = set(amostra)
    seq = {}
    for r in cd.gtfs_rows(zf, "stop_times.txt"):
        if r["trip_id"] in alvo:
            seq.setdefault(r["trip_id"], []).append((int(r.get("stop_sequence") or 0), r["stop_id"]))
    stops = {}
    for r in cd.gtfs_rows(zf, "stops.txt"):
        try: stops[r["stop_id"]] = (float(r["stop_lat"]), float(r["stop_lon"]))
        except (KeyError, ValueError): pass
    longe = []; paragens_total = 0
    for t, lista in seq.items():
        fid = viag_forma[t][0]; pts = [(a, b) for _, a, b in formas.get(fid, [])]
        if len(pts) < 2: continue
        for _, sid in sorted(lista):
            if sid in stops:
                paragens_total += 1
                longe.append(dist_ponto_polilinha(stops[sid], pts))
    longe.sort()
    if longe:
        res["paragens_amostra"] = paragens_total
        res["dist_mediana_m"] = round(longe[len(longe) // 2], 1)
        res["dist_p95_m"] = round(longe[int(len(longe) * 0.95)], 1)
        res["paragens_a_mais_de_80m"] = sum(1 for x in longe if x > 80)
    p(f"{nome:22s} shapes={res['shapes']:6d} pontos={n_pts:8d} viagens c/forma={res['viagens_com_forma']}/{res['viagens']} "
      f"espaço mediano={res['espaco_mediano_m']} m; formas c/ salto>200m={saltos}; paragens>80m do desenho: "
      f"{res.get('paragens_a_mais_de_80m','?')}/{res.get('paragens_amostra','?')} (mediana {res.get('dist_mediana_m','?')} m, p95 {res.get('dist_p95_m','?')} m)")
    return res

todos = []
feeds = list(cd.SEED_FEEDS) + [{"id": "cm_gtfs", "operator_name": "Carris Metropolitana (GTFS)", "url": cd.CM_GTFS}]
for f in feeds:
    p(f"== {f['id']}")
    body = obter(f)
    if not body:
        p(f"{f['id']:22s} NÃO FOI POSSÍVEL DESCARREGAR"); todos.append({"feed": f["id"], "erro": "download"}); continue
    try:
        todos.append(analisar(f["id"], body))
    except Exception as e:  # noqa: BLE001
        p(f"{f['id']:22s} ERRO a analisar: {e}"); todos.append({"feed": f["id"], "erro": str(e)[:200]})
open(f"{SAIDA}/formas-feeds.txt", "w").write("\n".join(linhas_txt) + "\n")
json.dump(todos, open(f"{SAIDA}/formas-feeds.json", "w"), indent=1)
