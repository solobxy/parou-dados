#!/usr/bin/env python3
"""Rede de caminhos a pé de Portugal (ruas, passeios, escadas, praças) tirada do OpenStreetMap, em mosaicos, para a PAROU
desenhar os troços a pé pelas ruas em vez de em linha reta por cima dos prédios.

Entrada: GeoJSON por linhas (osmium export) só com as vias (highway=…).
Saída:   SQLite com a tabela ape(t INTEGER PRIMARY KEY, d BLOB): um mosaico de 0,01° (~1,1 km) por linha.
         t = mosaico_y * 4000 + mosaico_x, com mosaico_y = floor((lat - 30) * 100) e mosaico_x = floor((lon + 32) * 100).
         d = pedaços de via dentro do mosaico, cada um: n (varint) e n pontos em micrograus (lat, lon), o primeiro em
             relação ao canto do mosaico e os seguintes em relação ao anterior (zigzag + varint).
         Um segmento que passa de um mosaico para outro fica nos dois: a app junta os mosaicos que precisa e liga as vias
         pelos pontos com as mesmas coordenadas (no OpenStreetMap, vias que se cruzam partilham o nó).
Uso: python3 caminhos_a_pe.py vias.geojsonseq caminhos.sqlite
"""
import json
import math
import sqlite3
import sys

PASSO = 100  # mosaicos por grau (0,01°)
LAT0, LON0 = 30.0, -32.0
LARGURA = 4000

# Por onde se anda a pé. Autoestradas não (a não ser que digam foot=yes); estradas «trunk» sim (em Portugal são muitas
# vezes nacionais com paragens dos dois lados), menos as vias reservadas a automóveis (motorroad=yes).
A_PE = {
    "footway", "pedestrian", "path", "steps", "living_street", "residential", "unclassified", "tertiary", "tertiary_link",
    "secondary", "secondary_link", "primary", "primary_link", "service", "track", "cycleway", "bridleway", "corridor",
    "platform", "road", "crossing", "trunk", "trunk_link",
}
PE_SIM = {"yes", "designated", "permissive", "official"}
SEM_ACESSO = {"no", "private"}


def anda_a_pe(p):
    hw = p.get("highway")
    pe = p.get("foot")
    if pe in PE_SIM:
        return True
    if pe == "no" or hw not in A_PE:
        return False
    if p.get("access") in SEM_ACESSO:
        return False
    if p.get("motorroad") == "yes":
        return False
    if p.get("area") == "yes" and hw not in ("pedestrian", "footway"):
        return False
    return True


def mosaico(lat_u, lon_u):
    """Mosaico de um ponto em micrograus"""
    return int(math.floor((lat_u / 1e6 - LAT0) * PASSO)), int(math.floor((lon_u / 1e6 - LON0) * PASSO))


def varint(n, out):
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def zigzag(n):
    return (n << 1) if n >= 0 else ((-n << 1) - 1)


def linhas_de(geom):
    t = geom.get("type")
    c = geom.get("coordinates") or []
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    if t == "Polygon":  # praças pedonais: anda-se pelo contorno
        return c
    if t == "MultiPolygon":
        return [anel for pol in c for anel in pol]
    return []


def construir(entrada, saida):
    pedacos = {}  # (my, mx) -> lista de listas de pontos (lat_u, lon_u)
    vias = segs = 0
    with open(entrada, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip().lstrip("\x1e")
            if not linha:
                continue
            try:
                ft = json.loads(linha)
            except ValueError:
                continue
            p = ft.get("properties") or {}
            if not anda_a_pe(p):
                continue
            for coords in linhas_de(ft.get("geometry") or {}):
                pts = [(int(round(c[1] * 1e6)), int(round(c[0] * 1e6))) for c in coords if len(c) >= 2]
                if len(pts) < 2:
                    continue
                vias += 1
                atual = {}  # mosaico -> pedaço em construção (continua enquanto os segmentos seguidos caem lá)
                for a, b in zip(pts, pts[1:]):
                    if a == b:
                        continue
                    segs += 1
                    for m in {mosaico(*a), mosaico(*b)}:
                        ped = atual.get(m)
                        if ped is not None and ped[-1] == a:
                            ped.append(b)
                        else:
                            ped = [a, b]
                            pedacos.setdefault(m, []).append(ped)
                            atual[m] = ped
    con = sqlite3.connect(saida)
    con.execute("DROP TABLE IF EXISTS ape")
    con.execute("CREATE TABLE ape (t INTEGER PRIMARY KEY, d BLOB NOT NULL)")
    total = 0
    linhas = []
    for (my, mx), lista in pedacos.items():
        out = bytearray()
        base_lat = int(round((LAT0 + my / PASSO) * 1e6))
        base_lon = int(round((LON0 + mx / PASSO) * 1e6))
        for ped in lista:
            varint(len(ped), out)
            plat, plon = base_lat, base_lon
            for lat, lon in ped:
                varint(zigzag(lat - plat), out)
                varint(zigzag(lon - plon), out)
                plat, plon = lat, lon
        total += len(out)
        linhas.append((my * LARGURA + mx, bytes(out)))
    con.executemany("INSERT INTO ape (t, d) VALUES (?, ?)", linhas)
    con.commit()
    con.execute("VACUUM")
    con.close()
    print(f"vias a pé: {vias}, segmentos: {segs}, mosaicos: {len(linhas)}, {total / 1e6:.1f} MB")
    return len(linhas)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    construir(sys.argv[1], sys.argv[2])
