#!/usr/bin/env python3
"""
Inventário das operadoras: o que existe em Portugal e o que a PAROU tem.

Para nenhuma operadora voltar a ficar esquecida (como a Barraqueiro, avisada no Reddit a 24/11/2026), corre todos os
meses no workflow «inventario.yml» e compara:
  1. a lista oficial de operadores do IMT (PDF) com o inventário em inventario_operadores.json:
     operadora nova na lista do IMT, sem entrada no inventário -> aviso;
  2. os feeds GTFS ativos de Portugal no Mobility Database com as fontes que o construtor usa (manifest.json):
     feed ativo que a PAROU não usa -> aviso.
Escreve inventario.md (o relatório) e sai com 2 quando há novidades (para o workflow abrir um aviso).

Uso: python inventario.py lista_imt.txt mdb-feeds.csv manifest.json
"""
import csv
import json
import os
import re
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.lower()).strip()


def nomes_imt(texto):
    """Nomes de operadores no texto do PDF do IMT (primeira coluna, acabam em Ldª/SA/E.M./Unipessoal).
    Um nome partido em duas linhas conta uma vez: a 2.ª linha (sem início de nome) é ignorada."""
    sufixo = re.compile(r"\b(ld[aª]?|l\.da|sa|s\.a|e\.m|unipessoal|município|municipal|serviços)(?![a-z])", re.I)
    nomes = []
    anterior_aberto = False  # a linha anterior começou um nome sem o acabar
    for linha in texto.splitlines():
        if not linha.strip() or linha.startswith(" " * 10):
            continue  # linhas vazias e as da coluna da área (o nome não continua aí)
        primeiro = re.split(r"\s{2,}|\|", linha.strip())[0].strip()
        if len(primeiro) < 4 or primeiro.lower().startswith(("operador", "lista de")):
            anterior_aberto = False
            continue
        tem_sufixo = bool(sufixo.search(primeiro))
        if anterior_aberto or primeiro.endswith(")"):
            anterior_aberto = not tem_sufixo
            continue
        if tem_sufixo:
            nomes.append(primeiro)
        anterior_aberto = not tem_sufixo
    return nomes


def comparar_imt(nomes, inventario):
    chaves = [norm(o["chave"]) for o in inventario["operadoras"]]
    novos = [n for n in nomes if not any(c in norm(n) for c in chaves)]
    return sorted(set(novos))


def comparar_mdb(caminho_csv, manifest, ignorar=()):
    usados = set(ignorar)
    for f in manifest.get("feeds", []):
        usados.add(f.get("id", ""))
        for k in ("url",):
            if f.get(k):
                usados.add(f[k].split("?")[0].rstrip("/"))
                usados.update(re.findall(r"(?:mdb|tld|tfs)-\d+", f[k]))  # espelho do Mobility Database
    novos = []
    with open(caminho_csv, encoding="utf-8") as fh:
        for l in csv.DictReader(fh):
            if (l.get("location.country_code") or "").upper() != "PT" or l.get("data_type") != "gtfs":
                continue
            if (l.get("status") or "active") not in ("active", ""):
                continue
            url = (l.get("urls.direct_download") or "").split("?")[0].rstrip("/")
            if l["id"] in usados or url in usados:
                continue
            novos.append(f"{l['id']} — {l.get('provider', '')} ({l.get('location.municipality', '')}) {l.get('urls.direct_download', '')}")
    return novos


def relatorio(inventario, novos_imt, novos_mdb):
    ops = inventario["operadoras"]
    conta = {}
    for o in ops:
        conta[o["estado"]] = conta.get(o["estado"], 0) + 1
    linhas = ["# Inventário das operadoras", "",
              f"Operadoras da lista do IMT no inventário: {len(ops)} — tem: {conta.get('tem', 0)}, "
              f"parcial: {conta.get('parcial', 0)}, falta: {conta.get('falta', 0)}, por confirmar: {conta.get('por_confirmar', 0)}.", ""]
    if novos_imt:
        linhas += ["## Novas na lista do IMT (ainda não estão no inventário)", ""] + [f"- {n}" for n in novos_imt] + [""]
    if novos_mdb:
        linhas += ["## Feeds GTFS ativos de Portugal que a PAROU não usa (Mobility Database)", ""] + [f"- {n}" for n in novos_mdb] + [""]
    linhas += ["## Em falta", ""] + [f"- {o['nome']} ({o['zona']})" + (f" — {o['nota']}" if o.get("nota") else "")
                                     for o in ops if o["estado"] == "falta"]
    linhas += ["", "## Só em parte", ""] + [f"- {o['nome']} ({o['zona']}): tem por {o.get('rede', '?')}"
                                            + (f"; falta {o['falta']}" if o.get("falta") else "")
                                            for o in ops if o["estado"] == "parcial"]
    linhas += ["", "## Outras redes", ""] + [f"- {o['nome']}: {o['estado']}" + (f" — {o['nota']}" if o.get("nota") else "")
                                             for o in inventario.get("outras_redes", [])]
    return "\n".join(linhas) + "\n"


def main(argv):
    if len(argv) != 4:
        print(__doc__)
        return 1
    with open(os.path.join(AQUI, "inventario_operadores.json"), encoding="utf-8") as fh:
        inventario = json.load(fh)
    with open(argv[1], encoding="utf-8") as fh:
        nomes = nomes_imt(fh.read())
    with open(argv[3], encoding="utf-8") as fh:
        manifest = json.load(fh)
    novos_imt = comparar_imt(nomes, inventario) if len(nomes) >= 50 else [f"(lista do IMT ilegível: só {len(nomes)} nomes)"]
    novos_mdb = comparar_mdb(argv[2], manifest, inventario.get("mdb_ignorar", {}))
    texto = relatorio(inventario, novos_imt, novos_mdb)
    with open("inventario.md", "w", encoding="utf-8") as fh:
        fh.write(texto)
    print(texto)
    return 2 if (novos_imt or novos_mdb) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
