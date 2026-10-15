#!/usr/bin/env python3
"""Mostra, em tabela, o relatório de um ou dois ficheiros desenhos-extra.json.gz (para comparar os modos «route» e «match»).
Uso: python3 auditoria/comparar-estradas.py a.json.gz [b.json.gz]"""
import gzip, json, sys

def ler(caminho):
    return json.load(gzip.open(caminho, "rt", encoding="utf-8"))["relatorio"]

ficheiros = sys.argv[1:]
relatorios = [ler(f) for f in ficheiros]
grupos = []
for r in relatorios:
    for g in r:
        if g not in grupos:
            grupos.append(g)
campos = ["sequencias", "desenhadas", "fracao_media_pares_bons", "paragens_a_menos_de_80m", "razao_mediana", "razao_p95", "segundos"]
print("%-14s %-7s " % ("grupo", "modo") + " ".join("%-12s" % c[:12] for c in campos) + " motivos")
for g in grupos:
    for r in relatorios:
        v = r.get(g)
        if not v:
            continue
        print("%-14s %-7s " % (g, v.get("modo", "route")) + " ".join("%-12s" % str(v.get(c)) for c in campos) + " " + json.dumps(v.get("motivos", {}), ensure_ascii=False))
print()
for g in grupos:
    for r in relatorios:
        v = r.get(g)
        if not v:
            continue
        por_tipo = {}
        for e in v.get("exemplos", []):
            por_tipo.setdefault(e.get("tipo"), []).append(e)
        for tipo, lista in por_tipo.items():
            print(f"[{g} / {v.get('modo', 'route')}] {tipo}:")
            for e in lista[:8]:
                print("   ", json.dumps({k: x for k, x in e.items() if k != "tipo"}, ensure_ascii=False))
