#!/usr/bin/env python3
"""STCP: a API oficial tem uma quota diária partilhada com o tempo real do servidor. A 9/11/2026 às 23:49 respondeu
«HTTP 429» e o Porto voltou ao ficheiro do portal aberto (datas até 23/09, sem horário escolar; às 03:29 a mesma API
deu o ficheiro certo, válido até 9/12). Regra: quando o ficheiro oficial chega bem, guarda-se uma cópia; quando a API
recusa, usa-se a cópia (se tiver no máximo STCP_COPIA_MAX_DIAS dias). Sem cópia, ou com cópia antiga, falha como antes.
Uso: python auditoria/test_stcp_copia.py   (a partir da raiz do repositório; falha com exit 1)"""
import io, os, sys, tempfile, time, zipfile, urllib.error
sys.path.insert(0, os.getcwd())
import construir_dados as cd

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

pasta = tempfile.mkdtemp()
cd.STCP_COPIA = os.path.join(pasta, "fontes", "stcp-oficial.zip")
cd.time.sleep = lambda s: None  # sem esperas entre tentativas

def zip_bytes(texto):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("feed_info.txt", texto)
    return b.getvalue()

resposta = {"modo": "429"}
def falso_http(url, timeout=180, insecure=False):
    if resposta["modo"] == "429":
        raise urllib.error.HTTPError(url, 429, "Too Many Requests", {}, None)
    return 200, resposta["corpo"], {}
cd.http_get_full = falso_http

# 1) Sem cópia: a recusa da API continua a ser uma falha (o construtor passa às outras fontes)
try:
    cd.download_zip(cd.STCP_ESTATICO)
    ok("[sem cópia] 429 continua a falhar", False)
except RuntimeError as e:
    ok("[sem cópia] 429 continua a falhar", "429" in str(e), str(e))

# 2) Ficheiro oficial chega bem: guarda a cópia
resposta.update(modo="ok", corpo=zip_bytes("oficial-escolar"))
body, status, _, _ = cd.download_zip(cd.STCP_ESTATICO)
ok("[ok] devolve o ficheiro oficial", body == resposta["corpo"] and status == 200)
ok("[ok] guarda a cópia", os.path.exists(cd.STCP_COPIA) and open(cd.STCP_COPIA, "rb").read() == resposta["corpo"])

# 3) No dia seguinte a API recusa: usa a cópia
resposta["modo"] = "429"
try:
    body, status, _, dia = cd.download_zip(cd.STCP_ESTATICO)
    ok("[429] usa a cópia do ficheiro oficial", body == zip_bytes("oficial-escolar") and status == 200, f"cópia de {dia}")
except RuntimeError as e:
    ok("[429] usa a cópia do ficheiro oficial", False, str(e))

# 4) Outras fontes não usam a cópia da STCP
try:
    cd.download_zip("https://exemplo.pt/gtfs.zip")
    ok("[outras fontes] não usam a cópia da STCP", False)
except RuntimeError:
    ok("[outras fontes] não usam a cópia da STCP", True)

# 5) Cópia antiga demais: não se usa
antiga = time.time() - (cd.STCP_COPIA_MAX_DIAS + 2) * 86400
os.utime(cd.STCP_COPIA, (antiga, antiga))
try:
    cd.download_zip(cd.STCP_ESTATICO)
    ok("[cópia antiga] não se usa", False)
except RuntimeError:
    ok("[cópia antiga] não se usa", True)
sys.exit(1 if falhas else 0)
