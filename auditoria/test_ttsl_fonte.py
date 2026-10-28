#!/usr/bin/env python3
"""Testa que a Transtejo Soflusa usa o GTFS oficial (api.ttsl.pt, enviado pela TTSL a 28/10/2026) e o espelho
da Mobility Database só como reserva. O espelho estava atrasado: não tinha a linha AL (Trafaria - Porto Brandão - Algés).
Uso: python auditoria/test_ttsl_fonte.py   (a partir da raiz do repositório; falha com exit 1)"""
import os, sys
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

ttsl = [f for f in cd.SEED_FEEDS if f["id"] == "transtejo_soflusa"]
ok("[ttsl] existe uma só entrada", len(ttsl) == 1, str(len(ttsl)))
f = ttsl[0] if ttsl else {}
ok("[ttsl] fonte principal é a oficial", f.get("url") == "https://api.ttsl.pt/files/GTFS.ZIP", str(f.get("url")))
ok("[ttsl] espelho Mobility Database como reserva", f.get("mirror") == "https://files.mobilitydatabase.org/mdb-2921/latest.zip", str(f.get("mirror")))
ok("[ttsl] sem o domínio antigo api.transtejo.pt (certificado expirado)", "api.transtejo.pt" not in str(f))
sys.exit(1 if falhas else 0)
