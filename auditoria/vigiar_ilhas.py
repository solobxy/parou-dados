"""Vigia diária da Madeira e dos Açores na PAROU.

Confirma, todos os dias, que o que a PAROU mostra nas ilhas é igual ao que os operadores publicam:
  1. Horários do Funchal: o ficheiro oficial (GTFS) contra a base publicada (release `dados`):
     as mesmas paragens (id, nome, posição), as mesmas linhas e o mesmo número de viagens em cada dia
     dos próximos 14 dias; validade do ficheiro oficial com folga.
  2. Rede SIGA (Governo Regional da Madeira): todas as linhas do Funchal (001 a 199) que a SIGA lista
     têm de estar na PAROU, e as da PAROU têm de existir na SIGA.
  3. A app a sério (parou.pt): o Perto no centro do Funchal tem paragens com partidas, os avisos do IPMA
     da Madeira têm previsão, e nos Açores e em Machico aparece o aviso de que não há horários.
  4. Fontes novas: operadores das ilhas no catálogo Mobility Database (entram sozinhos na base) e
     dados dos Açores já na base (o fuso UTC-1 tem de ser confirmado no ecrã).

Sai com erro (e o GitHub manda um email) se alguma verificação falhar. Escreve o relatório em
res/relatorio.txt e res/relatorio.json.
"""
import csv
import datetime as dt
import gzip
import html
import io
import json
import os
import re
import shutil
import sqlite3
import sys
import urllib.request
import zipfile
from zoneinfo import ZoneInfo

RES = os.environ.get("SAIDA", "res")
os.makedirs(RES, exist_ok=True)
SITE = os.environ.get("SITE", "https://parou.pt").rstrip("/")
BASE_DADOS = os.environ.get("DADOS", "https://github.com/solobxy/parou-dados/releases/download/dados")
HF_GTFS = "https://www.horariosdofunchal.pt/googletransit.zip"
SIGA_LISTA = "https://siga.madeira.gov.pt/public/horarios"
MDB = "https://files.mobilitydatabase.org/feeds_v2.csv"
UA = "PAROU-vigia-ilhas/1.0 (+https://parou.pt)"
LISBOA = ZoneInfo("Europe/Lisbon")
agora = dt.datetime.now(LISBOA)
hoje = agora.date()

falhas, avisos, notas = [], [], []


def falha(msg):
    falhas.append(msg)
    print("FALHOU ", msg, flush=True)


def aviso(msg):
    avisos.append(msg)
    print("AVISO  ", msg, flush=True)


def ok(msg):
    notas.append(msg)
    print("OK     ", msg, flush=True)


def obter(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), dict(r.headers)


def ler_csv(z, nome):
    with z.open(nome) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


# ------------------------------------------------------------------ 1. Horários do Funchal
def verificar_funchal():
    try:
        corpo, cab = obter(HF_GTFS, 180)
    except Exception as e:  # noqa: BLE001
        aviso(f"Horários do Funchal: o ficheiro oficial não descarregou hoje ({e}); a PAROU continua com o último bom")
        return
    z = zipfile.ZipFile(io.BytesIO(corpo))
    info = ler_csv(z, "feed_info.txt")[0] if "feed_info.txt" in z.namelist() else {}
    fim = info.get("feed_end_date") or ""
    datas = sorted({r["date"] for r in ler_csv(z, "calendar_dates.txt")}) if "calendar_dates.txt" in z.namelist() else []
    ultimo = max([fim] + datas[-1:]) if (fim or datas) else ""
    if ultimo:
        dias = (dt.date(int(ultimo[:4]), int(ultimo[4:6]), int(ultimo[6:8])) - hoje).days
        (falha if dias < 21 else aviso if dias < 45 else ok)(f"Horários do Funchal: horários publicados até {ultimo[6:8]}/{ultimo[4:6]}/{ultimo[:4]} ({dias} dias)")

    # base publicada
    try:
        man = json.loads(obter(f"{BASE_DADOS}/manifest.json", 60)[0])
        bruto = obter(f"{BASE_DADOS}/gtfs.db.gz", 900)[0]
        with open("/tmp/gtfs.db", "wb") as f:
            f.write(gzip.decompress(bruto))
        del bruto
    except Exception as e:  # noqa: BLE001
        falha(f"Base da PAROU: não foi possível descarregar ({e})")
        return
    feed = next((f for f in man.get("feeds", []) if f.get("id") == "horarios_funchal"), None)
    if not feed or feed.get("status") != "OK":
        falha(f"Base da PAROU: Horários do Funchal sem estado OK ({feed and feed.get('status')})")
    construida = dt.datetime.fromisoformat(man["built_at"].replace("Z", "+00:00"))
    horas = (dt.datetime.now(dt.timezone.utc) - construida).total_seconds() / 3600
    (falha if horas > 50 else ok)(f"Base da PAROU construída há {horas:.0f} h")
    db = sqlite3.connect("/tmp/gtfs.db")
    fonte_mais_nova = False
    lm = cab.get("Last-Modified")
    if lm:
        try:
            fonte_dt = dt.datetime.strptime(lm, "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=dt.timezone.utc)
            fonte_mais_nova = fonte_dt > construida
        except ValueError:
            pass
    problema = aviso if fonte_mais_nova else falha
    if fonte_mais_nova:
        aviso("Horários do Funchal: o ficheiro oficial é mais recente do que a base; diferenças entram na próxima construção")

    # paragens
    paragens = {r["stop_id"]: r for r in ler_csv(z, "stops.txt") if (r.get("location_type") or "0") in ("", "0")}
    base_p = {sid.split(":", 1)[1]: (nome, lat, lon) for sid, nome, lat, lon in db.execute(
        "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE feed_id='horarios_funchal'")}
    so_fonte = sorted(set(paragens) - set(base_p))
    so_base = sorted(set(base_p) - set(paragens))
    dif = [s for s, r in paragens.items() if s in base_p and (r["stop_name"].strip() != base_p[s][0].strip()
           or abs(float(r["stop_lat"]) - base_p[s][1]) > 1e-5 or abs(float(r["stop_lon"]) - base_p[s][2]) > 1e-5)]
    if so_fonte or so_base or dif:
        problema(f"Funchal: paragens diferentes do oficial (novas {len(so_fonte)}, a mais {len(so_base)}, nome/posição {len(dif)}) ex.: {(so_fonte + so_base + dif)[:5]}")
    else:
        ok(f"Funchal: {len(paragens)} paragens iguais às oficiais (id, nome e posição)")

    # linhas
    rotas = {r["route_id"]: r for r in ler_csv(z, "routes.txt")}
    base_r = {rid.split(":", 1)[1]: sn for rid, sn in db.execute("SELECT route_id, route_short_name FROM routes WHERE feed_id='horarios_funchal'")}
    if set(rotas) != set(base_r):
        problema(f"Funchal: linhas diferentes do oficial: novas {sorted(set(rotas) - set(base_r))[:8]}, a mais {sorted(set(base_r) - set(rotas))[:8]}")
    else:
        ok(f"Funchal: {len({r['route_short_name'] for r in rotas.values()})} linhas ({len(rotas)} variantes) iguais às oficiais")

    # viagens por dia (janela da base: hoje + 14 dias)
    viagens = ler_csv(z, "trips.txt")
    por_servico = {}
    for t in viagens:
        por_servico[t["service_id"]] = por_servico.get(t["service_id"], 0) + 1
    datas_servico = {}
    for r in ler_csv(z, "calendar_dates.txt"):
        if r["exception_type"] == "1":
            datas_servico.setdefault(r["date"], set()).add(r["service_id"])
    dias_semana = {}
    if "calendar.txt" in z.namelist():
        for r in ler_csv(z, "calendar.txt"):
            dias_semana[r["service_id"]] = r
    base_serv = {}
    for s, n in db.execute("SELECT service_id, COUNT(*) FROM trips WHERE feed_id='horarios_funchal' GROUP BY service_id"):
        base_serv[s.split(":", 1)[1] if ":" in s else s] = n
    base_datas = {}
    for s, d in db.execute("SELECT service_id, date FROM calendar_dates WHERE feed_id='horarios_funchal' AND exception_type=1"):
        base_datas.setdefault(d, set()).add(s.split(":", 1)[1] if ":" in s else s)
    nomes_dia = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    errados = []
    resumo = []
    for i in range(0, 14):
        d = hoje + dt.timedelta(days=i)
        ymd = d.strftime("%Y%m%d")
        servs = set(datas_servico.get(ymd, set()))
        for s, r in dias_semana.items():
            if r.get(nomes_dia[d.weekday()]) == "1" and r.get("start_date", "0") <= ymd <= r.get("end_date", "99999999"):
                servs.add(s)
        oficial = sum(por_servico.get(s, 0) for s in servs)
        base = sum(base_serv.get(s, 0) for s in base_datas.get(ymd, set()))
        resumo.append((ymd, oficial, base))
        if oficial != base:
            errados.append((ymd, oficial, base))
    if errados:
        problema(f"Funchal: número de viagens diferente do oficial em {len(errados)} dia(s): {errados[:4]} (dia, oficial, PAROU)")
    else:
        ok("Funchal: viagens iguais às oficiais nos próximos 14 dias (" + ", ".join(f"{y[6:]}/{y[4:6]}: {o}" for y, o, _ in resumo[:7]) + " …)")
    if any(o == 0 for _, o, _ in resumo):
        aviso(f"Funchal: há dias sem viagens no ficheiro oficial: {[y for y, o, _ in resumo if o == 0]}")
    db.close()
    return {r["route_short_name"] for r in rotas.values()}


# ------------------------------------------------------------------ 2. Rede SIGA
def verificar_siga(linhas_funchal):
    try:
        pag = obter(SIGA_LISTA, 90)[0].decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        aviso(f"SIGA: a lista oficial de linhas não abriu hoje ({e})")
        return
    texto = html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"<script.*?</script>|<style.*?</style>", "", pag, flags=re.S)))
    L = [x.strip() for x in texto.split("\n") if x.strip()]
    try:
        i = L.index("NOVA NUMERAÇÃO E DENOMINAÇÃO DAS CARREIRAS") + 1
    except ValueError:
        aviso("SIGA: a página das linhas mudou de formato; ver à mão")
        return
    siga = {}
    k = i
    while k < len(L) - 3:
        if re.fullmatch(r"[0-9A-Za-z]{1,4}", L[k]) and re.fullmatch(r"\d{3}", L[k + 1]):
            siga[L[k + 1]] = L[k + 3]
            k += 4
        else:
            k += 1
    if len(siga) < 50:
        aviso(f"SIGA: só se leram {len(siga)} linhas da página oficial; ver à mão")
        return
    ok(f"SIGA: {len(siga)} linhas na lista oficial da Madeira e do Porto Santo")
    if not linhas_funchal:
        return
    funchal_siga = {n for n in siga if int(n) < 200}
    faltam = sorted(funchal_siga - linhas_funchal)
    a_mais = sorted(linhas_funchal - set(siga))
    if faltam:
        falha(f"SIGA: linhas do Funchal na lista oficial que a PAROU não tem: {', '.join(f'{n} {siga[n]}' for n in faltam[:10])}")
    if a_mais:
        aviso(f"SIGA: linhas na PAROU que a lista oficial já não tem: {a_mais[:10]}")
    if not faltam and not a_mais:
        ok(f"SIGA: as {len(linhas_funchal)} linhas dos Horários do Funchal na PAROU são as da lista oficial")
    fora = sorted(set(siga) - linhas_funchal)
    notas.append(f"Linhas da SIGA sem horários abertos (CAM, SIGA Rodoeste, Porto Santo): {len(fora)}")


# ------------------------------------------------------------------ 3. A app a sério
def api(caminho):
    return json.loads(obter(f"{SITE}{caminho}", 60)[0])


def verificar_app():
    hora = agora.hour + agora.minute / 60
    try:
        j = api("/api/transit/nearby?lat=32.6478&lon=-16.9105&radius=500")
        paragens = j.get("stops") or []
        com = [s for s in paragens if s.get("departures")]
        if len(paragens) < 20:
            falha(f"App: no centro do Funchal só aparecem {len(paragens)} paragens")
        elif 6.5 <= hora <= 22 and len(com) < 3:
            falha(f"App: no centro do Funchal só {len(com)} paragens têm partidas às {agora:%H:%M}")
        else:
            ok(f"App: centro do Funchal com {len(paragens)} paragens, {len(com)} com partidas")
    except Exception as e:  # noqa: BLE001
        falha(f"App: o Perto do Funchal não respondeu ({e})")
    for nome, lat, lon in [("Machico", 32.7166, -16.7666), ("Ponta Delgada", 37.74, -25.668)]:
        try:
            j = api(f"/api/transit/nearby?lat={lat}&lon={lon}&radius=500")
            n = len(j.get("stops") or [])
            if nome == "Ponta Delgada" and n > 0:
                falha(f"Açores: já há {n} paragens perto de Ponta Delgada. Confirmar no ecrã que as horas aparecem na hora dos Açores (UTC-1) e tirar o aviso «Ainda não temos os autocarros dos Açores»")
            else:
                ok(f"App: {nome} com {n} paragens (o ecrã explica que ainda não há horários)" if n == 0 else f"App: {nome} com {n} paragens")
        except Exception as e:  # noqa: BLE001
            aviso(f"App: o Perto em {nome} não respondeu ({e})")
    for nome, lat, lon, area in [("Funchal", 32.6478, -16.9105, "MCS"), ("Santana", 32.805, -16.882, "MCS"), ("Porto Santo", 33.06, -16.34, "MPS"), ("Ponta Delgada", 37.74, -25.668, "AOR")]:
        try:
            j = api(f"/api/alertas?lat={lat}&lon={lon}")
            dias = len((j.get("tempo") or {}).get("dias") or [])
            loc = j.get("local") or {}
            if loc.get("area") != area:
                falha(f"Avisos: {nome} ficou na zona {loc.get('area')} ({loc.get('distrito')}) em vez de {area}")
            elif dias == 0:
                falha(f"Avisos: {nome} sem previsão do IPMA")
            else:
                ok(f"Avisos: {nome} → {loc.get('distrito')} ({area}), previsão de {dias} dias")
        except Exception as e:  # noqa: BLE001
            aviso(f"Avisos: {nome} não respondeu ({e})")


# ------------------------------------------------------------------ 4. Fontes novas
def verificar_fontes_novas():
    try:
        corpo = obter(MDB, 180)[0].decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        aviso(f"Mobility Database: catálogo indisponível ({e})")
        return
    conhecidos = {"mdb-1119", "mdb-3104"}
    novos = []
    for r in csv.DictReader(io.StringIO(corpo)):
        if (r.get("location.country_code") or "").upper() != "PT" or (r.get("data_type") or "").lower() != "gtfs":
            continue
        if (r.get("status") or "").lower() in ("deprecated", "inactive"):
            continue
        try:
            lat = (float(r.get("location.bounding_box.minimum_latitude") or "nan") + float(r.get("location.bounding_box.maximum_latitude") or "nan")) / 2
            lon = (float(r.get("location.bounding_box.minimum_longitude") or "nan") + float(r.get("location.bounding_box.maximum_longitude") or "nan")) / 2
        except ValueError:
            lat = lon = float("nan")
        texto = f"{r.get('provider', '')} {r.get('name', '')} {r.get('location.subdivision_name', '')} {r.get('location.municipality', '')}".lower()
        nas_ilhas = (32.4 <= lat <= 33.3 and -17.4 <= lon <= -16.2) or (36.8 <= lat <= 39.9 and -31.4 <= lon <= -24.9) \
            or re.search(r"madeira|funchal|a[cç]ores|azores|ponta delgada|angra|porto santo", texto)
        if nas_ilhas and r.get("id") not in conhecidos:
            novos.append(f"{r.get('id')} {r.get('provider')} ({r.get('urls.latest') or r.get('urls.direct_download')})")
    if novos:
        aviso("Fontes novas das ilhas no catálogo (entram sozinhas na base na próxima construção): " + "; ".join(novos[:6]))
    else:
        ok("Fontes novas das ilhas no catálogo: nenhuma (CAM, SIGA Rodoeste e Açores ainda não publicam)")


def main():
    linhas = None
    for nome, f in [("Funchal", verificar_funchal), ("SIGA", None), ("App", verificar_app), ("Fontes", verificar_fontes_novas)]:
        try:
            if nome == "SIGA":
                verificar_siga(linhas)
            else:
                r = f()
                if nome == "Funchal":
                    linhas = r
        except Exception as e:  # noqa: BLE001
            falha(f"{nome}: erro inesperado na verificação ({type(e).__name__}: {e})")
    rel = [f"Vigia das ilhas — {agora:%d/%m/%Y %H:%M} (hora de Lisboa)", ""]
    rel += [f"FALHOU  {x}" for x in falhas] + [f"AVISO   {x}" for x in avisos] + [f"OK      {x}" for x in notas]
    rel.append("")
    rel.append(f"{len(falhas)} falha(s), {len(avisos)} aviso(s)")
    with open(os.path.join(RES, "relatorio.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(rel) + "\n")
    with open(os.path.join(RES, "relatorio.json"), "w", encoding="utf-8") as f:
        json.dump({"quando": agora.isoformat(), "falhas": falhas, "avisos": avisos, "ok": notas}, f, ensure_ascii=False, indent=1)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("```\n" + "\n".join(rel) + "\n```\n")
    try:
        os.remove("/tmp/gtfs.db")
    except OSError:
        pass
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    shutil.rmtree("/tmp/vigia-ilhas", ignore_errors=True)
    main()
