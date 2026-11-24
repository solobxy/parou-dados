#!/usr/bin/env python3
"""
Códigos postais de Portugal (4+3 dígitos) para a pesquisa «Para onde vais?» da PAROU.

Fonte: GeoNames, ficheiro PT.zip (https://download.geonames.org/export/zip/), licença CC BY 4.0. Tem os ~200 mil
códigos postais completos, cada um com a localidade, o concelho e uma posição aproximada.

Junta os códigos ao fim da lista de locais feita pelo locais.py (locais.json.gz), com importância baixa: só aparecem
quando alguém escreve um código («4420-155», «4420 155», «4420155» ou só «4420»), nunca à frente de um local com nome.
Cada código entra uma vez; quando o GeoNames dá várias localidades para o mesmo código, a posição é a média e o
«sítio» mostra a primeira localidade e o concelho.

Uso: python codigos_postais.py PT.txt locais.json.gz   (acrescenta ao ficheiro e reescreve-o)
"""
import gzip
import json
import re
import sys

IMPORTANCIA = 0.02
RE_CP = re.compile(r"^\d{4}-\d{3}$")


def ler_geonames(caminho):
    """PT.txt (separado por tabulações) -> {código: {"lat", "lon", "sitios": [..], "concelho"}}"""
    codigos = {}
    with open(caminho, encoding="utf-8") as fh:
        for linha in fh:
            c = linha.rstrip("\n").split("\t")
            if len(c) < 11 or not RE_CP.match(c[1]):
                continue
            try:
                lat, lon = float(c[9]), float(c[10])
            except ValueError:
                continue
            if not (29 < lat < 43.5 and -32 < lon < -6):  # Portugal, Madeira e Açores
                continue
            d = codigos.setdefault(c[1], {"lat": [], "lon": [], "sitios": [], "concelho": c[5].strip()})
            d["lat"].append(lat)
            d["lon"].append(lon)
            nome = c[2].strip()
            if nome and nome not in d["sitios"]:
                d["sitios"].append(nome)
    return codigos


def linhas_locais(codigos):
    """Linhas no formato do locais.json.gz: [nome, cat, sítio, lat, lon, imp, alt]"""
    out = []
    for cp in sorted(codigos):
        d = codigos[cp]
        lat = sum(d["lat"]) / len(d["lat"])
        lon = sum(d["lon"]) / len(d["lon"])
        partes = []
        if d["sitios"]:
            partes.append(d["sitios"][0])
        if d["concelho"] and d["concelho"] not in partes:
            partes.append(d["concelho"])
        out.append([cp, "localidade", ", ".join(partes), round(lat, 5), round(lon, 5), IMPORTANCIA, cp.replace("-", "")])
    return out


def juntar(locais_gz, linhas):
    with gzip.open(locais_gz, "rt", encoding="utf-8") as fh:
        dados = json.load(fh)
    # Se o ficheiro já tiver códigos (corrido duas vezes), tira-os antes de voltar a pôr
    dados["linhas"] = [l for l in dados["linhas"] if not (l and isinstance(l[0], str) and RE_CP.match(l[0]))]
    dados["linhas"].extend(linhas)
    dados.setdefault("por_categoria", {})["codigo_postal"] = len(linhas)
    dados["codigos_postais"] = {"fonte": "GeoNames (CC BY 4.0)", "n": len(linhas)}
    with gzip.open(locais_gz, "wt", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
    return len(dados["linhas"])


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 1
    codigos = ler_geonames(argv[1])
    if len(codigos) < 100000:
        print(f"Só {len(codigos)} códigos postais no ficheiro: esperava mais de 100 mil, não junto nada")
        return 1
    total = juntar(argv[2], linhas_locais(codigos))
    print(f"Códigos postais: {len(codigos)} juntos aos locais ({total} no total)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
