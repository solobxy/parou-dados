#!/usr/bin/env python3
"""Testa que os SMTUC (Coimbra) usam o GTFS oficial (gtfs-api.smtuc.pt, indicado pelos SMTUC a 23/10/2026)
e o espelho da Mobility Database só como reserva.
Uso: python auditoria/test_smtuc_fonte.py   (a partir da raiz do repositório; falha com exit 1)"""
import os, sys
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

f = next((x for x in cd.SEED_FEEDS if x["id"] == "smtuc"), {})
ok("[smtuc] fonte principal é a oficial", f.get("url") == "https://gtfs-api.smtuc.pt/api/static/", str(f.get("url")))
ok("[smtuc] espelho Mobility Database como reserva", f.get("mirror") == "https://files.mobilitydatabase.org/mdb-2992/latest.zip", str(f.get("mirror")))
sys.exit(1 if falhas else 0)
