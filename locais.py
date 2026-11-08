#!/usr/bin/env python3
"""
Locais de Portugal para a pesquisa «Para onde vais?» da PAROU.

Lê os locais com nome do OpenStreetMap (exportados pelo osmium em GeoJSON, uma linha por local) e faz uma lista
com o nome, o tipo (centro comercial, hospital, praia, rua…), a localidade e o concelho, a posição e a IMPORTÂNCIA
(0 a 1): quanto mais conhecido, mais acima aparece na pesquisa. A importância vem do tipo de local (um aeroporto
antes de uma escola), de ter página na Wikipédia/Wikidata, do tamanho (área) e, nas localidades, da população.

Antes, a pesquisa só tinha as paragens e um serviço externo (Photon) que demorava e falhava muitas vezes:
«Torre de Belém» e «Hospital de São João» não davam nada, e «Colombo» mostrava primeiro um sítio em Porto Santo.

Uso: python locais.py locais.geojsonseq locais.json.gz
O gerador diário dos dados (construir_dados.py) junta esta lista à base (tabela locais, com pesquisa FTS5).
"""
import datetime
import gzip
import json
import math
import re
import sys
import unicodedata

try:
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    from shapely.geometry import Point
except ImportError:  # pragma: no cover - no GitHub instala-se
    shape = None

# ---------------------------------------------------------------------------------------------
# Tipos de local: categoria (código que a app traduz) e importância de base
# ---------------------------------------------------------------------------------------------
TIPOS = [
    # (chave, valores, categoria, importância)
    ("aeroway", {"aerodrome"}, "aeroporto", 0.55),
    ("shop", {"mall"}, "centro_comercial", 0.72),
    ("shop", {"department_store"}, "grande_armazem", 0.55),
    ("shop", {"supermarket"}, "supermercado", 0.30),
    ("amenity", {"hospital"}, "hospital", 0.72),
    ("healthcare", {"hospital"}, "hospital", 0.70),
    ("amenity", {"clinic"}, "clinica", 0.32),
    ("healthcare", {"centre", "clinic"}, "centro_saude", 0.34),
    ("amenity", {"university"}, "universidade", 0.66),
    ("amenity", {"college"}, "faculdade", 0.48),
    ("amenity", {"school"}, "escola", 0.30),
    ("leisure", {"stadium"}, "estadio", 0.62),
    ("leisure", {"sports_centre"}, "pavilhao", 0.30),
    ("leisure", {"park"}, "parque", 0.38),
    ("leisure", {"garden"}, "jardim", 0.32),
    ("leisure", {"water_park"}, "parque_aquatico", 0.52),
    ("leisure", {"marina"}, "marina", 0.42),
    ("leisure", {"golf_course"}, "golfe", 0.36),
    ("leisure", {"nature_reserve"}, "reserva", 0.36),
    ("natural", {"beach"}, "praia", 0.50),
    ("natural", {"peak"}, "pico", 0.26),
    ("natural", {"cape"}, "cabo", 0.45),
    ("tourism", {"zoo"}, "zoo", 0.66),
    ("tourism", {"theme_park"}, "parque_tematico", 0.62),
    ("tourism", {"aquarium"}, "aquario", 0.66),
    ("tourism", {"museum"}, "museu", 0.52),
    ("tourism", {"gallery"}, "cultura", 0.34),
    ("tourism", {"attraction"}, "atracao", 0.46),
    ("tourism", {"viewpoint"}, "miradouro", 0.36),
    ("tourism", {"hotel"}, "hotel", 0.30),
    ("tourism", {"hostel", "guest_house", "apartment"}, "alojamento", 0.18),
    ("tourism", {"camp_site"}, "campismo", 0.28),
    ("historic", {"castle"}, "castelo", 0.58),
    ("historic", {"palace"}, "palacio", 0.56),
    ("historic", {"fort"}, "castelo", 0.46),
    ("historic", {"monument", "memorial"}, "monumento", 0.36),
    ("historic", {"archaeological_site"}, "monumento", 0.30),
    ("historic", {"city_gate"}, "monumento", 0.34),
    ("amenity", {"theatre"}, "teatro", 0.48),
    ("amenity", {"cinema"}, "cinema", 0.42),
    ("amenity", {"arts_centre", "exhibition_centre", "conference_centre", "events_venue"}, "cultura", 0.44),
    ("amenity", {"library"}, "biblioteca", 0.34),
    ("amenity", {"marketplace"}, "mercado", 0.42),
    ("amenity", {"townhall"}, "camara", 0.46),
    ("amenity", {"courthouse"}, "tribunal", 0.40),
    ("amenity", {"police"}, "policia", 0.32),
    ("amenity", {"fire_station"}, "bombeiros", 0.26),
    ("amenity", {"post_office"}, "correios", 0.28),
    ("amenity", {"bus_station"}, "terminal_autocarros", 0.50),
    ("amenity", {"ferry_terminal"}, "terminal_fluvial", 0.50),
    ("amenity", {"embassy"}, "embaixada", 0.36),
    ("office", {"government"}, "servico_publico", 0.30),
    ("amenity", {"community_centre", "public_building"}, "servico_publico", 0.24),
    ("amenity", {"place_of_worship"}, "igreja", 0.22),
]
LOCALIDADES = {
    "city": ("cidade", 0.80), "town": ("vila", 0.62), "village": ("aldeia", 0.40), "suburb": ("bairro", 0.46),
    "borough": ("bairro", 0.46), "quarter": ("bairro", 0.38), "neighbourhood": ("bairro", 0.34),
    "hamlet": ("localidade", 0.22), "locality": ("localidade", 0.16), "isolated_dwelling": ("localidade", 0.10),
    "island": ("ilha", 0.55), "square": ("praca", 0.36),
}
RUAS = {"motorway": 0.04, "trunk": 0.12, "primary": 0.16, "secondary": 0.14, "tertiary": 0.12, "unclassified": 0.08,
        "residential": 0.08, "living_street": 0.08, "pedestrian": 0.12}

AEROPORTOS_GRANDES = {"LIS", "OPO", "FAO", "FNC", "PDL"}
# Lojas grandes que as pessoas procuram pelo nome (o resto das lojas de móveis, bricolage ou desporto não entra)
MARCAS_LOJA = re.compile(r"(?i)\b(ikea|leroy merlin|decathlon|worten|fnac|media ?markt|conforama|aki|bricomarch[eé]|maxmat|primark|el corte ingl[eé]s|auchan|jumbo|makro|staples|radio popular)\b")

GRANDES = {"aeroporto", "universidade", "parque", "reserva", "golfe", "praia", "estadio", "parque_tematico", "zoo", "parque_aquatico", "cidade", "vila", "ilha"}
SEM_LUGAR = {"aeroporto", "cidade", "vila", "ilha", "reserva"}

NOMES_ALT = ("alt_name", "short_name", "official_name", "name:pt", "name:en", "loc_name", "int_name", "old_name")


def norm(texto):
    t = unicodedata.normalize("NFD", str(texto or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def tipo_de(p):
    """(categoria, importância) de um local pelas etiquetas do OSM; None se não interessa"""
    if p.get("place") in LOCALIDADES:
        return LOCALIDADES[p["place"]]
    for chave, valores, cat, imp in TIPOS:
        if p.get(chave) in valores:
            return cat, imp
    if p.get("shop") and MARCAS_LOJA.search(f"{p.get('brand') or ''} {p.get('name') or ''}"):
        return "loja", 0.5
    if p.get("highway") in RUAS:
        return "rua", RUAS[p["highway"]]
    return None


def area_m2(geo):
    """Área aproximada (m²) de um polígono em graus"""
    try:
        a = geo.area
        lat = geo.centroid.y
        return a * 111_320 * 111_320 * math.cos(math.radians(lat))
    except Exception:  # noqa: BLE001
        return 0.0


def ponto_de(geo):
    """Ponto que representa o local: o centro (ou um ponto dentro, se o centro cair fora), o meio de uma rua"""
    t = geo.geom_type
    if t == "Point":
        return geo.y, geo.x
    if t in ("LineString", "MultiLineString"):
        try:
            p = geo.interpolate(0.5, normalized=True)
            return p.y, p.x
        except Exception:  # noqa: BLE001
            c = geo.centroid
            return c.y, c.x
    c = geo.centroid
    if not geo.contains(c):
        c = geo.representative_point()
    return c.y, c.x


def principal():
    entrada, saida = sys.argv[1], sys.argv[2]
    concelhos = []  # (nome, geometria)
    localidades = []  # (lat, lon, nome, tipo, pop)
    locais = []  # dicionários
    ruas = {}  # (nome normalizado, célula) -> dict
    lidos = 0
    with open(entrada, encoding="utf-8") as fh:
        for linha in fh:
            linha = linha.strip().lstrip("\x1e")
            if not linha:
                continue
            lidos += 1
            try:
                f = json.loads(linha)
            except ValueError:
                continue
            p = f.get("properties") or {}
            g = f.get("geometry")
            if not g:
                continue
            if p.get("boundary") == "administrative" and str(p.get("admin_level")) == "7" and g.get("type") in ("Polygon", "MultiPolygon"):
                try:
                    concelhos.append((p.get("name") or "", shape(g)))
                except Exception:  # noqa: BLE001
                    pass
                continue
            nome = (p.get("name") or "").strip()
            if not nome or len(nome) > 90:
                continue
            tp = tipo_de(p)
            if not tp:
                continue
            cat, imp = tp
            try:
                geo = shape(g)
                if geo.is_empty:
                    continue
                lat, lon = ponto_de(geo)
            except Exception:  # noqa: BLE001
                continue
            if not (32.0 <= lat <= 42.3 and -31.5 <= lon <= -6.0):
                continue
            if cat in ("cidade", "vila", "aldeia", "bairro", "localidade"):
                try:
                    pop = int(re.sub(r"[^0-9]", "", str(p.get("population") or "0")) or 0)
                except ValueError:
                    pop = 0
                localidades.append((lat, lon, nome, p.get("place"), pop))
                if pop > 0:
                    imp += min(0.18, math.log10(pop) / 35)
            if cat == "rua":
                # Os vários bocados da mesma rua (cada cruzamento corta a rua no OSM) ficam um só, por zona de ~1 km
                chave = (norm(nome), round(lat / 0.01), round(lon / 0.012))
                r = ruas.get(chave)
                comp = geo.length * 111_000 if hasattr(geo, "length") else 0
                if r:
                    r["comp"] += comp
                    if imp > r["imp_base"]:
                        r["imp_base"] = imp
                else:
                    ruas[chave] = {"nome": nome, "cat": "rua", "lat": lat, "lon": lon, "imp_base": imp, "comp": comp,
                                   "alt": [], "wd": False}
                continue
            if p.get("aeroway") == "aerodrome":
                # Os grandes aeroportos primeiro; os outros com voos (código IATA) a seguir; aeródromos e pistas pouco
                iata = str(p.get("iata") or "").upper()
                imp = 0.98 if iata in AEROPORTOS_GRANDES else (0.7 if iata else (0.35 if p.get("icao") else 0.18))
            if cat in ("parque", "jardim", "praia", "reserva", "golfe", "estadio", "universidade", "hospital", "centro_comercial") and geo.geom_type in ("Polygon", "MultiPolygon"):
                a = area_m2(geo)
                if a > 2000:
                    imp += min(0.14, 0.035 * math.log10(a / 2000))
            alt = []
            for k in NOMES_ALT:
                for v in str(p.get(k) or "").split(";"):
                    v = v.strip()
                    if v and v.lower() != nome.lower() and v not in alt:
                        alt.append(v)
            if cat == "supermercado" and p.get("brand") and p["brand"].lower() not in nome.lower():
                alt.append(p["brand"])
            wd = bool(p.get("wikidata") or p.get("wikipedia"))
            if p.get("wikidata"):
                imp += 0.12
            if p.get("wikipedia"):
                imp += 0.04
            if cat == "hotel":
                try:
                    imp += min(0.08, 0.015 * int(str(p.get("stars") or "0")[:1]))
                except ValueError:
                    pass
            locais.append({"nome": nome, "cat": cat, "lat": lat, "lon": lon, "imp": imp, "alt": alt, "wd": wd,
                           "cidade": (p.get("addr:city") or "").strip()})

    for r in ruas.values():
        imp = r["imp_base"] + min(0.06, 0.02 * math.log10(max(1.0, r["comp"] / 100))) if r["comp"] > 100 else r["imp_base"]
        if re.match(r"(?i)^(avenida|av\.)\s", r["nome"]):
            imp += 0.02
        locais.append({"nome": r["nome"], "cat": "rua", "lat": r["lat"], "lon": r["lon"], "imp": imp, "alt": [], "wd": False, "cidade": ""})

    # Concelho de cada local (polígonos do OSM) e localidade mais perto (aldeia, bairro…)
    arvore = STRtree([g for _, g in concelhos]) if concelhos else None
    nomes_conc = [n for n, _ in concelhos]

    def concelho(lat, lon):
        if not arvore:
            return ""
        pt = Point(lon, lat)
        for i in arvore.query(pt):
            if concelhos[int(i)][1].contains(pt):
                return nomes_conc[int(i)]
        return ""

    grelha = {}
    for loc in localidades:
        if loc[3] in ("city", "town", "village", "suburb", "borough", "quarter", "neighbourhood", "hamlet"):
            grelha.setdefault((int(loc[0] / 0.02), int(loc[1] / 0.02)), []).append(loc)

    def localidade(lat, lon, raio_m=2500):
        cy, cx = int(lat / 0.02), int(lon / 0.02)
        melhor, md = None, raio_m
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for loc in grelha.get((cy + dy, cx + dx), []):
                    d = math.hypot((loc[0] - lat) * 111_000, (loc[1] - lon) * 111_000 * math.cos(math.radians(lat)))
                    if d < md:
                        melhor, md = loc[2], d
        return melhor or ""

    # Locais repetidos (o mesmo centro comercial como ponto e como edifício): fica o mais importante
    vistos = {}
    finais = []
    for loc in sorted(locais, key=lambda x: -x["imp"]):
        k = (norm(loc["nome"]), loc["cat"])
        perto = vistos.setdefault(k, [])
        # Locais grandes (aeroportos, parques, universidades) aparecem como ponto e como área com o centro longe: raio maior
        r = 0.02 if loc["cat"] in GRANDES else 0.004
        if any(abs(a - loc["lat"]) < r and abs(o - loc["lon"]) < r * 1.25 for a, o in perto):
            continue
        perto.append((loc["lat"], loc["lon"]))
        finais.append(loc)

    linhas = []
    for loc in finais:
        conc = concelho(loc["lat"], loc["lon"])
        lugar = "" if loc["cat"] in SEM_LUGAR else localidade(loc["lat"], loc["lon"])
        partes = []
        # O concelho manda; a localidade escrita no próprio local (addr:city) só quando não se sabe o concelho
        for v in (lugar, conc or loc["cidade"]):
            if v and v != loc["nome"] and norm(v) not in [norm(x) for x in partes]:
                partes.append(v)
        sitio = ", ".join(partes[:2])
        imp = max(0.0, min(1.0, loc["imp"]))
        linhas.append([loc["nome"], loc["cat"], sitio, round(loc["lat"], 6), round(loc["lon"], 6), round(imp, 3), "|".join(loc["alt"][:6])])
    # Ordem: os mais importantes primeiro (a pesquisa da app conta com isto: o rowid é a posição)
    linhas.sort(key=lambda x: (-x[5], x[0]))
    por_cat = {}
    for l in linhas:
        por_cat[l[1]] = por_cat.get(l[1], 0) + 1
    dados = {
        "versao": 1,
        "criado": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fonte": "OpenStreetMap (ODbL), © contribuidores do OpenStreetMap",
        "colunas": ["nome", "cat", "sitio", "lat", "lon", "imp", "alt"],
        "linhas": linhas,
        "por_categoria": por_cat,
    }
    with gzip.open(saida, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"Lidos {lidos} objetos; {len(concelhos)} concelhos; {len(linhas)} locais")
    for cat, n in sorted(por_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {n}")
    print("Os 40 mais importantes:")
    for l in linhas[:40]:
        print(f"  {l[5]:.2f} {l[1]:<18} {l[0]} ({l[2]})")
    for alvo in ("Torre de Belém", "Centro Comercial Colombo", "Hospital de São João", "NorteShopping", "Aeroporto Humberto Delgado"):
        achados = [l for l in linhas if norm(l[0]) == norm(alvo)]
        print(f"  verificação «{alvo}»: {achados[:2]}")


if __name__ == "__main__":
    principal()
