#!/usr/bin/env python3
"""Inventário das operadoras (inventario.py): com o texto real da lista do IMT (24/11/2026) não há operadoras
esquecidas, e uma operadora nova na lista é apanhada (foi assim que a Barraqueiro ficou de fora até ao Reddit avisar).
Uso: python auditoria/test_inventario.py   (a partir da raiz do repositório; falha com exit 1)"""
import json, os, sys
sys.path.insert(0, os.getcwd())
import inventario as inv

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

texto = open(os.path.join("auditoria", "fixtures", "inventario", "imt.txt"), encoding="utf-8").read()
inventario = json.load(open("inventario_operadores.json", encoding="utf-8"))
nomes = inv.nomes_imt(texto)
ok("[imt] lê os operadores da lista (mais de 80)", len(nomes) > 80, str(len(nomes)))
ok("[imt] nomes partidos em duas linhas contam uma vez", not any(n.endswith(")") or n.startswith(("Genros", "Regionais")) for n in nomes))
novos = inv.comparar_imt(nomes, inventario)
ok("[inventário] todas as operadoras da lista do IMT estão no inventário", novos == [], str(novos))
novo = texto + "\nTransportes Imaginários do Norte, Ldª.       ALTO MINHO\n"
ok("[inventário] uma operadora nova na lista do IMT é apanhada",
   inv.comparar_imt(inv.nomes_imt(novo), inventario) == ["Transportes Imaginários do Norte, Ldª."])
ok("[inventário] estados válidos", all(o["estado"] in ("tem", "parcial", "falta", "por_confirmar") for o in inventario["operadoras"]))
sys.exit(1 if falhas else 0)
