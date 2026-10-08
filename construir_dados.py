#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAROU.PT - Construtor diario da base de dados de horarios
=========================================================

Descarrega os horarios oficiais (GTFS) dos operadores de Portugal e a rede da
Carris Metropolitana (API v2) e grava tudo em gtfs.db, com o MESMO esquema que
a app usa (src/server/db/gtfsDatabase.ts). No fim comprime para gtfs.db.gz e
escreve manifest.json.

- Corre no GitHub Actions (ver .github/workflows/dados.yml), uma vez por dia.
- So usa a biblioteca padrao do Python.
- Se um operador falhar hoje, reaproveita os dados de ontem desse operador
  (da versao anterior publicada), para a app nunca perder linhas.
"""

import csv
import datetime
import difflib
import email.utils
import gzip
import io
import itertools
import json
import os
import re
import shutil
import sqlite3
import ssl
import sys
import time
import unicodedata
import urllib.request
import zipfile
from zoneinfo import ZoneInfo

OUT_DB = "gtfs.db"
OUT_GZ = "gtfs.db.gz"
OUT_MANIFEST = "manifest.json"
PREV_GZ = "anterior.db.gz"
PREV_DB = "anterior.db"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36 PAROU.PT-dados/1.0")
LISBON = ZoneInfo("Europe/Lisbon")
BATCH = 50000
MAX_ZIP_BYTES = 300 * 1024 * 1024
AVISO_DIAS = 14  # avisa quando a validade de um feed acaba dentro deste numero de dias

MDB_CATALOG = "https://files.mobilitydatabase.org/feeds_v2.csv"
CM_API = "https://api.carrismetropolitana.pt/v2"

csv.field_size_limit(10_000_000)

# ---------------------------------------------------------------------------
# OPERADORES (lista inicial com links confirmados)
#   id        -> igual ao que a app ja usa (cp, stcp, metro_porto, carris, ...)
#   mdb       -> palavras para encontrar o espelho no Mobility Database
#   ckan_apis -> portais de dados do Porto (vai buscar o ficheiro mais recente)
#   calendario_semanal -> o portal tem vários ficheiros de vários anos: descarrega todos,
#                         escolhe o que tem o calendário mais recente e, se as datas já
#                         passaram há no máximo N dias, usa o horário semanal (com nota)
# ---------------------------------------------------------------------------
SEED_FEEDS = [
    {"id": "metro_lisboa", "operator_name": "Metro de Lisboa", "mode": "Metro",
     "url": "https://www.metrolisboa.pt/google_transit/googleTransit.zip",
     "mdb": ["metropolitano de lisboa", "metro de lisboa"]},
    {"id": "carris", "operator_name": "Carris (Lisboa)", "mode": "Autocarro",
     "url": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS",
     "mdb": ["carris"], "mdb_exclude": ["metropolitana"]},
    {"id": "cp", "operator_name": "CP - Comboios de Portugal", "mode": "Comboio",
     "url": "https://publico.cp.pt/gtfs/gtfs.zip",
     "mdb": ["comboios de portugal"]},
    {"id": "fertagus", "operator_name": "Fertagus", "mode": "Comboio",
     "url": "https://www.fertagus.pt/GTFSTMLzip/Fertagus_GTFS.zip",
     "mdb": ["fertagus"]},
    {"id": "transtejo_soflusa", "operator_name": "Transtejo Soflusa", "mode": "Barco",
     "url": "https://files.mobilitydatabase.org/mdb-2921/latest.zip",
     "mirror": "https://api.transtejo.pt/files/GTFS.zip",
     "mdb": ["transtejo"]},
    {"id": "mts", "operator_name": "Metro Transportes do Sul", "mode": "Metro",
     "url": "https://mts.pt/imt/MTS-20240129.zip",
     "mdb": ["metro transportes do sul", "mts"]},
    {"id": "tcb_barreiro", "operator_name": "TCB Barreiro", "mode": "Autocarro",
     "url": "https://www.tcbarreiro.pt/front/files/sample_gtfs/GTFS-TCB_24.zip",
     "mdb": ["barreiro"]},
    {"id": "stcp", "operator_name": "STCP (Porto)", "mode": "Autocarro", "calendario_semanal": 730,
     "ckan_apis": [
         "https://dadosabertos.cm-porto.pt/api/3/action/package_show?id=horarios-paragens-e-rotas-stcp",
         "https://opendata.porto.digital/api/3/action/package_show?id=horarios-paragens-e-rotas-em-formato-gtfs-stcp",
     ],
     "url": "https://dadosabertos.cm-porto.pt/dataset/71490e40-9e19-11f1-84ed-6abdb6d5cf34/resource/51340c18-0ef5-4895-b099-cf7247ea54f4/download/gtfs_feed.zip",
     "mirror": "https://files.mobilitydatabase.org/mdb-2148/latest.zip",
     "mdb": ["transportes colectivos do porto", "stcp"]},
    {"id": "metro_porto", "operator_name": "Metro do Porto", "mode": "Metro", "calendario_semanal": 730,
     "ckan_apis": [
         "https://dadosabertos.cm-porto.pt/api/3/action/package_show?id=horarios-paragens-e-rotas-metro-porto",
         "https://opendata.porto.digital/api/3/action/package_show?id=horarios-paragens-e-rotas-em-formato-gtfs",
     ],
     "url": "https://dadosabertos.cm-porto.pt/dataset/713a680c-9e19-11f1-84ed-6abdb6d5cf34/resource/28a13723-2af1-4bbb-a2b1-f8b08df8c7e4/download/___",
     "mirror": "https://files.mobilitydatabase.org/mdb-2147/latest.zip",
     "mdb": ["metro do porto"]},
    {"id": "tub_braga", "operator_name": "TUB Braga", "mode": "Autocarro",
     "url": "https://www.tub.pt/developer/gtfs/feed/tub.zip",
     "mdb": ["transportes urbanos de braga", "tub"]},
    {"id": "guimabus", "operator_name": "Guimabus (Guimarães)", "mode": "Autocarro",
     "url": "https://map.mobility.ubiwhere.com/dataset/ee6d46e4-9f19-4f4a-ab93-1a3cd69df349/resource/08f1ee6c-2d3f-4fb3-a861-5d6fb347a6d4/download/gtfs_gui.zip",
     "mdb": ["guimabus", "guimaraes"]},
    {"id": "tuba_barcelos", "operator_name": "TUBA Barcelos", "mode": "Autocarro", "calendario_semanal": 730,
     "url": "https://map.mobility.ubiwhere.com/dataset/1842a15c-1aec-4f65-8e29-e57c8b4cbd74/resource/a595ee4b-bf86-4323-b1f4-7e3b3eb00e5e/download/gtfs_bar.zip",
     "mdb": ["tuba", "barcelos"]},
    {"id": "mobiave", "operator_name": "Mobiave (Famalicão)", "mode": "Autocarro", "calendario_semanal": 730,
     "url": "https://map.mobility.ubiwhere.com/dataset/fe6015e4-86c7-437a-8d31-10759fe21a1d/resource/7ac67ef8-015c-42e8-9546-f6f0be956270/download/gtfs_vnf.zip",
     "mdb": ["mobiave", "famalicao"]},
    {"id": "smtuc", "operator_name": "SMTUC (Coimbra)", "mode": "Autocarro",
     "url": "https://dados.gov.pt/pt/datasets/r/bdae1dd0-74e5-4c52-8234-b7cb1cf5bee2",
     "mirror": "https://files.mobilitydatabase.org/mdb-2992/latest.zip",
     "mdb": ["smtuc", "transportes urbanos de coimbra"]},
    {"id": "vamus", "operator_name": "Vamus Algarve", "mode": "Autocarro",
     "url": "https://drive.google.com/uc?export=download&id=1CM8O4ndsfSJhka42SxFUZ9eB-wE10NqX",
     "mdb": ["vamus"]},
    {"id": "proximo_faro", "operator_name": "Próximo (Faro)", "mode": "Autocarro",
     "url": "https://drive.google.com/uc?export=download&id=1xNHjM7yl-SS1jCkGrvIBBlOhUkFfNBjY",
     "mdb": ["proximo"]},
    {"id": "giro", "operator_name": "GIRO", "mode": "Autocarro",
     "url": "https://drive.google.com/uc?export=download&id=1tkKV40lQlFcLiJhq8SwZQdxNVjFclRCA",
     "mdb": ["giro"]},
    {"id": "sobe_desce_tavira", "operator_name": "Sobe e Desce (Tavira)", "mode": "Autocarro",
     "url": "https://drive.google.com/uc?export=download&id=1C2KBOVsbm__ymWDgU1bXGbP0Gv3D2yo5",
     "mdb": ["sobe e desce", "tavira"]},
    {"id": "horarios_funchal", "operator_name": "Horários do Funchal", "mode": "Autocarro",
     "url": "https://www.horariosdofunchal.pt/googletransit.zip",
     "mdb": ["horarios do funchal"]},
]

# Feeds do catalogo que NAO se carregam automaticamente (ja estao acima,
# vem pela API, ou sao demasiado grandes para a app).
DISCOVERY_SKIP = [
    "carris", "metropolitano de lisboa", "metro de lisboa", "comboios de portugal",
    "fertagus", "transtejo", "soflusa", "metro transportes do sul", "barreiro",
    "transportes colectivos do porto", "stcp", "metro do porto", "transportes urbanos de braga",
    "guimabus", "tuba", "mobiave", "smtuc", "transportes urbanos de coimbra", "vamus",
    "proximo", "giro", "sobe e desce", "horarios do funchal", "flixbus",
    "metropolitanos de lisboa",
]

# Só se guardam viagens que funcionam entre ontem e daqui a WINDOW_DAYS dias
# (a base é refeita todos os dias). Isto mantém o ficheiro pequeno.
WINDOW_DAYS = 14
# Dias a prolongar o horário semanal quando o operador não atualiza as datas.
EXTEND_DAYS = 60

ROUTE_TYPE_MODE = {0: "Elétrico", 1: "Metro", 2: "Comboio", 3: "Autocarro", 4: "Barco",
                   5: "Elétrico", 6: "Teleférico", 7: "Funicular", 11: "Autocarro", 12: "Comboio"}


# ---------------------------------------------------------------------------
# Utilitarios
# ---------------------------------------------------------------------------
def log(msg):
    print(msg, flush=True)


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def norm(text):
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower()


def http_get_full(url, timeout=180, insecure=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    context = ssl._create_unverified_context() if insecure else None  # noqa: S323
    with urllib.request.urlopen(req, timeout=timeout, context=context) as resp:
        return resp.status, resp.read(), dict(resp.headers)


def http_get(url, timeout=180, insecure=False):
    status, body, _ = http_get_full(url, timeout=timeout, insecure=insecure)
    return status, body


def is_ssl_error(err):
    text = str(err).lower()
    return isinstance(err, ssl.SSLError) or "certificate" in text or "ssl" in text


def download_zip(url):
    """Descarrega e valida um ZIP. Devolve (bytes, http_status, duracao_ms, data_do_ficheiro)."""
    t0 = time.time()
    last_err = None
    insecure = False
    for attempt in range(3):
        try:
            status, body, headers = http_get_full(url, insecure=insecure)
            if len(body) > MAX_ZIP_BYTES:
                raise ValueError(f"ficheiro demasiado grande ({len(body) // 1048576} MB)")
            if len(body) == 0:
                raise ValueError("o ficheiro está vazio (0 bytes)")
            if body[:2] != b"PK":
                raise ValueError("o servidor devolveu uma página em vez de um ficheiro ZIP")
            file_day = None
            modified = headers.get("Last-Modified") or headers.get("last-modified")
            if modified:
                try:
                    file_day = email.utils.parsedate_to_datetime(modified).date().isoformat()
                except (TypeError, ValueError):
                    file_day = None
            return body, status, int((time.time() - t0) * 1000), file_day
        except Exception as err:  # noqa: BLE001
            last_err = err
            if is_ssl_error(err) and not insecure:
                # Certificado do servidor mal configurado: são dados públicos, tenta sem verificação.
                insecure = True
                continue
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(str(last_err))


def secs(value):
    value = (value or "").strip()
    if not value:
        return None
    parts = value.split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + (int(parts[2]) if len(parts) > 2 and parts[2] else 0)
    except ValueError:
        return None


def to_int(value, default=0):
    try:
        return int(float((value or "").strip()))
    except ValueError:
        return default


def to_float(value):
    try:
        f = float((value or "").strip())
        return f if f == f else None
    except ValueError:
        return None


def ymd_to_iso(ymd):
    if ymd and len(ymd) == 8 and ymd.isdigit():
        return f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}"
    return None


def estado_validade(valid_until, hoje):
    """Devolve (estado, dias) para o manifest: caducado, a_caducar, ok ou desconhecido."""
    if not valid_until:
        return "desconhecido", None
    try:
        fim = datetime.date.fromisoformat(str(valid_until)[:10])
    except ValueError:
        return "desconhecido", None
    dias = (fim - hoje).days
    if dias < 0:
        return "caducado", dias
    if dias <= AVISO_DIAS:
        return "a_caducar", dias
    return "ok", dias


# ---------------------------------------------------------------------------
# Esquema (copia exata de src/server/db/gtfsDatabase.ts)
# ---------------------------------------------------------------------------
SCHEMA_TABLES = """
CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY, operator_name TEXT NOT NULL, mode TEXT NOT NULL, feed_type TEXT NOT NULL,
  source_origin TEXT NOT NULL, url TEXT NOT NULL, latest_url TEXT, license_url TEXT, auth_type TEXT,
  auth_key TEXT, etag TEXT, last_modified TEXT, status TEXT NOT NULL, progress TEXT,
  lines_count INTEGER DEFAULT 0, stops_count INTEGER DEFAULT 0, trips_count INTEGER DEFAULT 0,
  valid_from TEXT, valid_until TEXT, realtime_entities TEXT DEFAULT 'Nenhum', last_ok TEXT,
  last_error TEXT, last_fetch_at TEXT
);
CREATE TABLE IF NOT EXISTS fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, feed_id TEXT NOT NULL, url TEXT NOT NULL, http_status INTEGER,
  bytes INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, timestamp TEXT NOT NULL, message TEXT,
  error_details TEXT
);
CREATE TABLE IF NOT EXISTS stops (
  stop_id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, stop_name TEXT NOT NULL, stop_lat REAL,
  stop_lon REAL, zone_id TEXT, parent_station TEXT, location_type INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS routes (
  route_id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, route_short_name TEXT, route_long_name TEXT,
  route_type INTEGER DEFAULT 3, route_color TEXT
);
CREATE TABLE IF NOT EXISTS trips (
  trip_id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, route_id TEXT NOT NULL, service_id TEXT,
  trip_headsign TEXT, direction_id INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stop_times (
  id INTEGER PRIMARY KEY AUTOINCREMENT, feed_id TEXT NOT NULL, trip_id TEXT NOT NULL,
  stop_id TEXT NOT NULL, arrival_secs INTEGER, departure_secs INTEGER, stop_sequence INTEGER,
  pickup_type INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS calendar (
  feed_id TEXT NOT NULL, service_id TEXT NOT NULL, monday INTEGER NOT NULL, tuesday INTEGER NOT NULL,
  wednesday INTEGER NOT NULL, thursday INTEGER NOT NULL, friday INTEGER NOT NULL,
  saturday INTEGER NOT NULL, sunday INTEGER NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  PRIMARY KEY (feed_id, service_id)
);
CREATE TABLE IF NOT EXISTS calendar_dates (
  feed_id TEXT NOT NULL, service_id TEXT NOT NULL, date TEXT NOT NULL, exception_type INTEGER NOT NULL,
  PRIMARY KEY (feed_id, service_id, date)
);
CREATE TABLE IF NOT EXISTS frequencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, feed_id TEXT NOT NULL, trip_id TEXT NOT NULL,
  start_time_secs INTEGER NOT NULL, end_time_secs INTEGER NOT NULL, headway_secs INTEGER NOT NULL,
  exact_times INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);
-- Linhas que passam em cada paragem, para operadores sem horários na base (ex.: UNIR, cujos
-- horários a app vai buscar à AMP a partir do telemóvel). direction_id e stop_sequence quando há.
CREATE TABLE IF NOT EXISTS stop_routes (
  feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0,
  stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id)
);
"""

SCHEMA_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_fetch_logs_timestamp ON fetch_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_logs_feed ON fetch_logs (feed_id);
CREATE INDEX IF NOT EXISTS idx_stops_feed ON stops (feed_id);
CREATE INDEX IF NOT EXISTS idx_stops_name ON stops (stop_name);
CREATE INDEX IF NOT EXISTS idx_stops_coords ON stops (stop_lat, stop_lon);
CREATE INDEX IF NOT EXISTS idx_stops_parent ON stops (parent_station);
CREATE INDEX IF NOT EXISTS idx_routes_feed ON routes (feed_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips (route_id);
CREATE INDEX IF NOT EXISTS idx_trips_feed ON trips (feed_id);
CREATE INDEX IF NOT EXISTS idx_trips_service ON trips (feed_id, service_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times (stop_id, departure_secs);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip_seq ON stop_times (trip_id, stop_sequence);
-- A app faz "CREATE INDEX IF NOT EXISTS" destes dois nomes ao abrir a base. Criados lá, ficam sem
-- estatísticas (o ANALYZE só corre aqui), o SQLite passa a usar o índice por feed_id nas consultas
-- por viagem e as partidas ficam ~100x mais lentas (11-28 s para 8 paragens). Também aumentam a
-- base em ~110 MB, que no Cloud Run ocupam RAM. Não fazem falta: idx_stop_times_trip_seq já serve
-- as consultas por viagem. Por isso ocupamos os dois nomes com índices vazios ("WHERE 0"), que o
-- SQLite nunca usa, e a app deixa de os criar.
CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times (trip_id) WHERE 0;
CREATE INDEX IF NOT EXISTS idx_stop_times_feed ON stop_times (feed_id) WHERE 0;
CREATE INDEX IF NOT EXISTS idx_calendar_lookup ON calendar (feed_id, service_id);
CREATE INDEX IF NOT EXISTS idx_cal_dates_feed_date ON calendar_dates (feed_id, date);
CREATE INDEX IF NOT EXISTS idx_freq_trip ON frequencies (feed_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_routes_route ON stop_routes (route_id, direction_id, stop_sequence);
"""

DATA_TABLES = {
    "stops": "stop_id, feed_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type",
    "routes": "route_id, feed_id, route_short_name, route_long_name, route_type, route_color",
    "trips": "trip_id, feed_id, route_id, service_id, trip_headsign, direction_id",
    "stop_times": "feed_id, trip_id, stop_id, arrival_secs, departure_secs, stop_sequence, pickup_type",
    "calendar": "feed_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date",
    "calendar_dates": "feed_id, service_id, date, exception_type",
    "frequencies": "feed_id, trip_id, start_time_secs, end_time_secs, headway_secs, exact_times",
}


def insert_many(conn, table, rows):
    cols = DATA_TABLES[table]
    marks = ", ".join("?" for _ in cols.split(","))
    sql = f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({marks})"
    batch = []
    total = 0
    for row in rows:
        batch.append(row)
        if len(batch) >= BATCH:
            conn.executemany(sql, batch)
            total += len(batch)
            batch = []
    if batch:
        conn.executemany(sql, batch)
        total += len(batch)
    return total


def log_fetch(conn, feed_id, url, status, size, duration_ms, message, error=None):
    conn.execute(
        "INSERT INTO fetch_logs (feed_id, url, http_status, bytes, duration_ms, timestamp, message, error_details)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (feed_id, url or "", status, size, duration_ms, now_iso(), message, error),
    )


def upsert_feed(conn, row):
    cols = ["id", "operator_name", "mode", "feed_type", "source_origin", "url", "latest_url", "license_url",
            "auth_type", "auth_key", "etag", "last_modified", "status", "progress", "lines_count",
            "stops_count", "trips_count", "valid_from", "valid_until", "realtime_entities", "last_ok",
            "last_error", "last_fetch_at"]
    values = [row.get(c) for c in cols]
    conn.execute(
        f"INSERT OR REPLACE INTO feeds ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})", values
    )


# ---------------------------------------------------------------------------
# Leitura de GTFS
# ---------------------------------------------------------------------------
def gtfs_rows(zf, filename):
    target = filename.lower()
    member = None
    for name in zf.namelist():
        if not name.endswith("/") and os.path.basename(name).lower() == target:
            member = name
            break
    if member is None:
        return
    with zf.open(member) as probe:
        start = probe.read(4)
    encoding = "utf-16" if start[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding=encoding, errors="replace", newline="")
        first = text.readline()
        if not first:
            return
        delim = max([",", ";", "\t", "|"], key=first.count)
        if first.count(delim) == 0:
            delim = ","
        reader = csv.reader(itertools.chain([first], text), delimiter=delim)
        try:
            header = [re.sub(r"[^a-z0-9_]", "", h.replace("\ufeff", "").strip().lower().replace(" ", "_"))
                      for h in next(reader)]
        except StopIteration:
            return
        width = len(header)
        for rec in reader:
            if not rec or (len(rec) == 1 and not rec[0].strip()):
                continue
            if len(rec) < width:
                rec = rec + [""] * (width - len(rec))
            yield {header[i]: rec[i].strip() for i in range(width)}


def feriado_nacional(day):
    """Feriados nacionais de Portugal (fixos + Sexta-feira Santa, Páscoa e Corpo de Deus)."""
    if (day.month, day.day) in {(1, 1), (4, 25), (5, 1), (6, 10), (8, 15), (10, 5), (11, 1), (12, 1), (12, 8), (12, 25)}:
        return True
    y = day.year
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    pascoa = datetime.date(y, (h + l - 7 * m + 114) // 31, ((h + l - 7 * m + 114) % 31) + 1)
    return (day - pascoa).days in (-2, 0, 60)


def window_days(today_dt):
    """Lista (AAAAMMDD, dia_da_semana 0=segunda) de ontem até hoje+WINDOW_DAYS."""
    out = []
    for i in range(-1, WINDOW_DAYS + 1):
        d = today_dt + datetime.timedelta(days=i)
        out.append((d.strftime("%Y%m%d"), d.weekday()))
    return out


def unwrap_zip(zip_bytes):
    """Se o GTFS vier dentro de outro ZIP, devolve o ZIP de dentro."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as outer:
        names = {os.path.basename(n).lower() for n in outer.namelist()}
        inner = [n for n in outer.namelist() if n.lower().endswith(".zip")]
        if "stops.txt" not in names and inner:
            return outer.read(inner[0])
    return zip_bytes


def calendar_end(zip_bytes):
    """Última data (AAAAMMDD) em que o ficheiro tem serviço, lida só do calendário."""
    best = ""
    with zipfile.ZipFile(io.BytesIO(unwrap_zip(zip_bytes))) as zf:
        for r in gtfs_rows(zf, "calendar.txt"):
            best = max(best, r.get("end_date") or "")
        for r in gtfs_rows(zf, "calendar_dates.txt"):
            if to_int(r.get("exception_type"), 1) == 1:
                best = max(best, r.get("date") or "")
    return best


def ingest_gtfs(conn, feed_id, zip_bytes, today_dt, extend_calendar=False, max_back_days=60):
    """Grava um GTFS na base de dados (dentro de um SAVEPOINT). Devolve estatisticas."""
    today = today_dt.strftime("%Y%m%d")
    zip_bytes = unwrap_zip(zip_bytes)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = {os.path.basename(n).lower() for n in zf.namelist()}
        missing = [f for f in ("stops.txt", "routes.txt", "trips.txt", "stop_times.txt") if f not in names]
        if missing:
            raise ValueError("ficheiros GTFS em falta: " + ", ".join(missing)
                             + f" (o ZIP tem: {', '.join(sorted(names))[:200]})")

        p = feed_id + ":"
        route_types = {}

        # 1) Calendário primeiro (é pequeno), para saber que serviços funcionam nos próximos dias.
        cal = {}
        for r in gtfs_rows(zf, "calendar.txt"):
            sid = r.get("service_id")
            if not sid:
                continue
            days = tuple(to_int(r.get(k)) for k in
                         ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))
            cal[sid] = [days, r.get("start_date") or "", r.get("end_date") or ""]
        adds, removes, cal_dates = {}, {}, []
        for r in gtfs_rows(zf, "calendar_dates.txt"):
            sid, date = r.get("service_id"), r.get("date")
            if not sid or not date:
                continue
            etype = to_int(r.get("exception_type"), 1)
            cal_dates.append((feed_id, sid, date, etype))
            (adds if etype == 1 else removes).setdefault(date, set()).add(sid)

        all_dates = [v[1] for v in cal.values() if v[1]] + [v[2] for v in cal.values() if v[2]] + list(adds)
        v_from = min(all_dates) if all_dates else None
        v_until = max(all_dates) if all_dates else None
        expired = bool(v_until and v_until < today)

        # Viagens por serviço (trips.txt) e associação de serviços com nomes quase iguais:
        # alguns operadores escrevem o serviço de forma diferente no calendário e nas viagens
        # (ex.: STCP "UTIL ECOLAR:..." no calendário). Sem isto essas viagens nunca ficam ativas.
        svc_trips = {}
        for r in gtfs_rows(zf, "trips.txt"):
            sid = r.get("service_id")
            if sid:
                svc_trips[sid] = svc_trips.get(sid, 0) + 1
        known = set(cal) | {x for v in adds.values() for x in v} | {x for v in removes.values() for x in v}
        aliases = {}
        if known:
            def _norm(x):
                x = unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode().upper()
                return re.sub(r"[^A-Z0-9]", "", x)
            known_norm = {k: _norm(k) for k in known}
            for orphan in [x for x in svc_trips if x not in known]:
                on = _norm(orphan)
                scored = sorted(((difflib.SequenceMatcher(None, on, kn).ratio(), k) for k, kn in known_norm.items()),
                                reverse=True)
                best = scored[0]
                second = scored[1][0] if len(scored) > 1 else 0.0
                if best[0] >= 0.88 and best[0] - second >= 0.04:
                    aliases[orphan] = best[1]
        for orphan, target in aliases.items():
            if target in cal:
                cal[orphan] = [cal[target][0], cal[target][1], cal[target][2]]
            for date, sids in adds.items():
                if target in sids:
                    sids.add(orphan)
                    cal_dates.append((feed_id, orphan, date, 1))
            for date, sids in removes.items():
                if target in sids:
                    sids.add(orphan)
                    cal_dates.append((feed_id, orphan, date, 2))
        known_after = known | set(aliases)
        sem_calendario = sorted(((n, x) for x, n in svc_trips.items() if x not in known_after), reverse=True)[:10]

        def active_on(ymd, wd):
            on = {sid for sid, (days, start, end) in cal.items() if start <= ymd <= end and days[wd]}
            on |= adds.get(ymd, set())
            on -= removes.get(ymd, set())
            return on

        # Dias da janela em que o operador inteiro não tem serviço publicado (calendário acabado
        # ou com buracos): usa o mesmo dia da semana mais recente que tinha serviço, escolhendo o
        # mais completo de até 4 semanas (evita copiar um feriado). Feeds expirados só são
        # preenchidos se extend_calendar (operadores marcados com calendario_semanal).
        filled_days = 0
        for ymd, wd in window_days(today_dt):
            if v_from and ymd < v_from:
                continue
            if v_until and ymd > v_until and not extend_calendar:
                continue
            if any(svc_trips.get(x) for x in active_on(ymd, wd)):
                continue
            day = datetime.date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:8]))
            holiday = feriado_nacional(day)
            if holiday and not (v_until and ymd > v_until):
                # Dentro da validade, um feriado sem serviço é decisão do operador: não se inventa.
                continue
            ref_wd = 6 if holiday else wd  # feriado com calendário acabado: usa o horário de domingo
            first_back = (day.weekday() - ref_wd) % 7 or 7
            candidates = []
            for back in range(first_back, max_back_days + 1, 7):
                ref_ymd = (day - datetime.timedelta(days=back)).strftime("%Y%m%d")
                if v_from and ref_ymd < v_from:
                    break
                on = {x for x in active_on(ref_ymd, ref_wd) if svc_trips.get(x)}
                if on:
                    candidates.append((sum(svc_trips[x] for x in on), ref_ymd, on))
                    if len(candidates) >= 4:
                        break
            if not candidates:
                continue
            best = max(candidates, key=lambda c: (c[0], c[1]))
            for sid in best[2]:
                adds.setdefault(ymd, set()).add(sid)
                cal_dates.append((feed_id, sid, ymd, 1))
            filled_days += 1
        extended = filled_days > 0
        if extended:
            expired = False

        active = None
        if cal or adds:
            active = set()
            for ymd, wd in window_days(today_dt):
                on = {sid for sid, (days, start, end) in cal.items() if start <= ymd <= end and days[wd]}
                on |= adds.get(ymd, set())
                on -= removes.get(ymd, set())
                active |= on

        kept_trips = set()

        def stops():
            for r in gtfs_rows(zf, "stops.txt"):
                sid = r.get("stop_id")
                if not sid:
                    continue
                parent = r.get("parent_station")
                yield (p + sid, feed_id, r.get("stop_name") or "Paragem", to_float(r.get("stop_lat")),
                       to_float(r.get("stop_lon")), r.get("zone_id") or None,
                       (p + parent) if parent else None, to_int(r.get("location_type"), 0))

        def routes():
            for r in gtfs_rows(zf, "routes.txt"):
                rid = r.get("route_id")
                if not rid:
                    continue
                rtype = to_int(r.get("route_type"), 3)
                route_types[rtype] = route_types.get(rtype, 0) + 1
                color = (r.get("route_color") or "").lstrip("#")
                yield (p + rid, feed_id, r.get("route_short_name") or rid, r.get("route_long_name") or "",
                       rtype, ("#" + color) if color else None)

        def trips():
            for r in gtfs_rows(zf, "trips.txt"):
                tid = r.get("trip_id")
                if not tid:
                    continue
                service = r.get("service_id") or None
                if active is not None and service not in active:
                    continue
                kept_trips.add(tid)
                yield (p + tid, feed_id, p + (r.get("route_id") or ""), service,
                       r.get("trip_headsign") or None, to_int(r.get("direction_id"), 0))

        def stop_times():
            for r in gtfs_rows(zf, "stop_times.txt"):
                tid = r.get("trip_id")
                sid = r.get("stop_id")
                if not tid or not sid or tid not in kept_trips:
                    continue
                arr = secs(r.get("arrival_time"))
                dep = secs(r.get("departure_time"))
                if dep is None:
                    dep = arr
                if arr is None:
                    arr = dep
                yield (feed_id, p + tid, p + sid, arr, dep, to_int(r.get("stop_sequence"), 0),
                       to_int(r.get("pickup_type"), 0))

        def calendar_rows():
            for sid, (days, start, end) in cal.items():
                yield (feed_id, sid, *days, start, end)

        def frequencies():
            for r in gtfs_rows(zf, "frequencies.txt"):
                tid = r.get("trip_id")
                start = secs(r.get("start_time"))
                end = secs(r.get("end_time"))
                headway = to_int(r.get("headway_secs"), 0)
                if not tid or tid not in kept_trips or start is None or end is None or headway <= 0:
                    continue
                yield (feed_id, p + tid, start, end, headway, to_int(r.get("exact_times"), 0))

        conn.execute("SAVEPOINT feed")
        try:
            stats = {
                "stops": insert_many(conn, "stops", stops()),
                "routes": insert_many(conn, "routes", routes()),
                "trips": insert_many(conn, "trips", trips()),
                "stop_times": insert_many(conn, "stop_times", stop_times()),
                "calendar": insert_many(conn, "calendar", calendar_rows()),
                "calendar_dates": insert_many(conn, "calendar_dates", iter(cal_dates)),
                "frequencies": insert_many(conn, "frequencies", frequencies()),
            }
            if stats["stops"] == 0:
                member = next((n for n in zf.namelist() if os.path.basename(n).lower() == "stops.txt"), None)
                head = zf.read(member)[:160] if member else b""
                if b"stop_id" in head:
                    raise ValueError("o operador publicou o ficheiro sem paragens (lista de paragens vazia)")
                raise ValueError(f"o ficheiro não tem paragens (formato não reconhecido; início de stops.txt: {head!r})")
            conn.execute("RELEASE feed")
        except Exception:
            conn.execute("ROLLBACK TO feed")
            conn.execute("RELEASE feed")
            raise

    main_type = max(route_types, key=route_types.get) if route_types else 3
    stats.update({"mode": ROUTE_TYPE_MODE.get(main_type, "Autocarro"), "valid_from": v_from,
                  "valid_until": v_until, "expired": expired, "extended": extended,
                  "filled_days": filled_days, "past_end": bool(v_until and v_until < today),
                  "aliases": aliases, "sem_calendario": [{"service": x, "viagens": n} for n, x in sem_calendario]})
    return stats


def delete_feed(conn, feed_id):
    for table in DATA_TABLES:
        conn.execute(f"DELETE FROM {table} WHERE feed_id = ?", (feed_id,))


# ---------------------------------------------------------------------------
# Versao anterior (para reaproveitar operadores que falhem hoje)
# ---------------------------------------------------------------------------
def load_previous():
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        return False
    url = f"https://github.com/{repo}/releases/download/dados/{OUT_GZ}"
    try:
        _, body = http_get(url, timeout=300)
        with open(PREV_GZ, "wb") as fh:
            fh.write(body)
        with gzip.open(PREV_GZ, "rb") as src, open(PREV_DB, "wb") as dst:
            shutil.copyfileobj(src, dst)
        check = sqlite3.connect(PREV_DB)
        ok = check.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        check.close()
        log(f"Versão anterior carregada: {'OK' if ok else 'inválida'}")
        return ok
    except Exception as err:  # noqa: BLE001
        log(f"Sem versão anterior ({err}). Primeira execução?")
        return False


def carry_over(conn, feed_id):
    """Copia os dados de ontem deste operador. Devolve a linha 'feeds' antiga ou None."""
    try:
        conn.execute("ATTACH DATABASE ? AS prev", (PREV_DB,))
    except sqlite3.OperationalError:
        pass
    try:
        old = conn.execute("SELECT * FROM prev.feeds WHERE id = ?", (feed_id,)).fetchone()
        if old is None:
            return None
        cols = [d[0] for d in conn.execute("SELECT * FROM prev.feeds LIMIT 0").description]
        old_row = dict(zip(cols, old))
        if not old_row.get("stops_count"):
            return None
        delete_feed(conn, feed_id)
        for table, columns in DATA_TABLES.items():
            conn.execute(
                f"INSERT OR REPLACE INTO {table} ({columns}) SELECT {columns} FROM prev.{table} WHERE feed_id = ?",
                (feed_id,),
            )
        return old_row
    except sqlite3.Error as err:
        log(f"  Não foi possível reaproveitar {feed_id}: {err}")
        return None


# ---------------------------------------------------------------------------
# Fontes
# ---------------------------------------------------------------------------
def load_catalog():
    try:
        _, body = http_get(MDB_CATALOG, timeout=120)
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8", errors="replace"))))
        pt = [r for r in rows if (r.get("location.country_code") or "").upper() == "PT"]
        log(f"Catálogo Mobility Database: {len(pt)} entradas de Portugal")
        return pt
    except Exception as err:  # noqa: BLE001
        log(f"Catálogo Mobility Database indisponível: {err}")
        return []


def catalog_mirror(catalog, keywords, exclude=None):
    for r in catalog:
        if (r.get("data_type") or "").lower() != "gtfs":
            continue
        if (r.get("status") or "").lower() in ("deprecated", "inactive"):
            continue
        name = norm((r.get("provider") or "") + " " + (r.get("name") or ""))
        if exclude and any(x in name for x in exclude):
            continue
        if any(k in name for k in keywords):
            return r.get("urls.latest") or None
    return None


def resource_day(res):
    match = re.search(r"(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})", (res.get("name") or "") + " " + (res.get("url") or ""))
    if match:
        try:
            return datetime.date(int(match.group(3)), int(match.group(2)), int(match.group(1))).isoformat()
        except ValueError:
            pass
    return (res.get("last_modified") or res.get("created") or "")[:10] or None


def resolve_ckan_candidates(api_url):
    """Devolve [(url, dia)] dos ficheiros GTFS do conjunto de dados, do mais recente para o mais antigo."""
    _, body = http_get(api_url, timeout=60)
    resources = json.loads(body)["result"]["resources"]
    out = []
    for res in resources:
        url = res.get("url") or ""
        fmt = (res.get("format") or "").lower()
        if not (url.lower().endswith(".zip") or "zip" in fmt or "gtfs" in fmt or "/download/" in url):
            continue
        out.append((url, resource_day(res)))
    out.sort(key=lambda item: item[1] or "", reverse=True)
    return out[:10]


def discovered_feeds(catalog, seed_urls):
    feeds = []
    for r in catalog:
        if (r.get("data_type") or "").lower() != "gtfs":
            continue
        if (r.get("status") or "").lower() in ("deprecated", "inactive"):
            continue
        if (r.get("urls.authentication_type") or "0") not in ("", "0"):
            continue
        name = norm((r.get("provider") or "") + " " + (r.get("name") or ""))
        if any(k in name for k in DISCOVERY_SKIP):
            continue
        direct = r.get("urls.direct_download") or ""
        latest = r.get("urls.latest") or ""
        if direct in seed_urls:
            continue
        if not (latest or direct):
            continue
        provider = (r.get("provider") or "Operador").strip()
        extra = (r.get("name") or "").strip()
        feeds.append({
            "id": (r.get("id") or "").strip() or norm(provider).replace(" ", "_"),
            "operator_name": f"{provider} ({extra})" if extra and extra.lower() not in provider.lower() else provider,
            "mode": None,
            "url": latest or direct,
            "mirror": direct if latest and direct else None,
            "source_origin": "discovered",
        })
    return feeds


# ---------------------------------------------------------------------------
# Processamento
# ---------------------------------------------------------------------------
def process_feed(conn, feed, today_dt, have_prev):
    fid = feed["id"]
    origin = feed.get("source_origin", "seed")
    candidates = []  # (url, dia_do_ficheiro)
    for api in feed.get("ckan_apis", []):
        try:
            found = resolve_ckan_candidates(api)
            log(f"  {fid}: {len(found)} ficheiros no portal ({api.split('/')[2]}), "
                f"mais recente: {found[0][1] if found else '-'}")
            candidates.extend(c for c in found if c[0] not in [x[0] for x in candidates])
            if found:
                break
        except Exception as err:  # noqa: BLE001
            log(f"  {fid}: portal {api.split('/')[2]} indisponível ({err})")
    for u in (feed.get("url"), feed.get("mirror")):
        if u and u not in [x[0] for x in candidates]:
            candidates.append((u, None))
    urls = [c[0] for c in candidates]
    days = dict(candidates)

    base = {
        "id": fid, "operator_name": feed["operator_name"], "mode": feed.get("mode") or "Autocarro",
        "feed_type": "gtfs", "source_origin": origin, "url": urls[0] if urls else (feed.get("url") or ""),
        "latest_url": feed.get("mirror"), "auth_type": "none", "realtime_entities": "Nenhum",
        "last_fetch_at": now_iso(),
    }

    errors = []
    limit = int(feed.get("calendario_semanal") or 0)

    def attempts():
        """Devolve (url, bytes, status, ms, fim_do_calendario) pela ordem a tentar."""
        if not limit:
            for url in urls:
                try:
                    body, status, ms, _ = download_zip(url)
                    yield url, body, status, ms, None
                except Exception as err:  # noqa: BLE001
                    errors.append(f"{url} -> {err}" if str(url) not in str(err) else str(err))
                    log_fetch(conn, fid, url, 0, 0, 0, "Falha", str(err))
            return
        # Porto: os portais têm ficheiros de vários anos e as datas dos metadados não são fiáveis.
        # Descarrega todos e ordena pelo fim do calendário (o mais recente primeiro).
        got = []
        for url in urls:
            try:
                body, status, ms, file_day = download_zip(url)
                end = calendar_end(body)
                log(f"  {fid}: calendário até {ymd_to_iso(end) or '?'} <- {url}")
                got.append((end, days.get(url) or file_day or "", url, body, status, ms))
            except Exception as err:  # noqa: BLE001
                errors.append(f"{url} -> {err}" if str(url) not in str(err) else str(err))
                log_fetch(conn, fid, url, 0, 0, 0, "Falha", str(err))
        got.sort(key=lambda g: (g[0], g[1]), reverse=True)
        for end, _, url, body, status, ms in got:
            yield url, body, status, ms, end

    for url, body, status, ms, end in attempts():
        try:
            log_fetch(conn, fid, url, status, len(body), ms, f"Download concluído ({len(body) // 1024} KB)")
            delete_feed(conn, fid)
            # Prolonga o horário semanal se as datas do operador passaram há no máximo `limit` dias.
            extend = False
            if limit and end:
                try:
                    end_day = datetime.date(int(end[:4]), int(end[4:6]), int(end[6:8]))
                    extend = (today_dt.date() - end_day).days <= limit
                except ValueError:
                    extend = False
            stats = ingest_gtfs(conn, fid, body, today_dt, extend_calendar=extend,
                                max_back_days=limit if limit else 60)
            note = None
            if stats["extended"] and stats["past_end"]:
                note = (f"O operador não atualizou as datas do calendário (terminam em "
                        f"{ymd_to_iso(stats['valid_until'])}); a usar o horário semanal em vigor.")
            elif stats["extended"]:
                note = ("O operador não atualizou as datas do calendário para alguns dias "
                        f"({stats['filled_days']} dias sem horário publicado); a usar o horário semanal mais recente.")
            elif not stats["expired"] and stats["stop_times"] == 0:
                note = f"Sem serviço nos próximos {WINDOW_DAYS} dias."
            row = dict(base)
            row.update({
                "url": url, "mode": feed.get("mode") or stats["mode"],
                "status": "horário expirado" if stats["expired"] else "OK", "progress": "OK",
                "lines_count": stats["routes"], "stops_count": stats["stops"], "trips_count": stats["trips"],
                "valid_from": ymd_to_iso(stats["valid_from"]), "valid_until": ymd_to_iso(stats["valid_until"]),
                "last_ok": now_iso(), "last_error": note,
                "_aliases": stats["aliases"], "_sem_calendario": stats["sem_calendario"],
                "_prolongado": bool(stats["extended"]),
            })
            upsert_feed(conn, row)
            conn.commit()
            flag = " (EXPIRADO)" if stats["expired"] else (" (horário semanal prolongado)" if stats["extended"] else "")
            log(f"  OK  {fid}: {stats['routes']} linhas, {stats['stops']} paragens, "
                f"{stats['trips']} viagens, {stats['stop_times']} horários{flag}")
            return row
        except Exception as err:  # noqa: BLE001
            errors.append(f"{url} -> {err}" if str(url) not in str(err) else str(err))
            log_fetch(conn, fid, url, 0, 0, 0, "Falha", str(err))
            conn.commit()

    message = " | ".join(errors) or "sem link"
    old = carry_over(conn, fid) if have_prev else None
    if old:
        old.update({"last_error": f"Hoje falhou, mantidos os dados de {old.get('last_ok') or 'ontem'}: {message}",
                    "last_fetch_at": now_iso()})
        upsert_feed(conn, old)
        conn.commit()
        log(f"  ~~  {fid}: falhou hoje, mantidos os dados anteriores")
        return old
    row = dict(base)
    row.update({"status": "ERROR", "progress": f"ERROR: {message[:300]}", "last_error": message[:1000]})
    upsert_feed(conn, row)
    conn.commit()
    log(f"  ERRO {fid}: {message[:300]}")
    return row


def process_carris_metropolitana(conn, have_prev):
    fid = "carris_metropolitana"
    try:
        t0 = time.time()
        _, lines_body = http_get(f"{CM_API}/lines", timeout=60)
        _, stops_body = http_get(f"{CM_API}/stops", timeout=120)
        ms = int((time.time() - t0) * 1000)
        lines = json.loads(lines_body)
        stops = json.loads(stops_body)
        if not lines or not stops:
            raise ValueError("a API devolveu listas vazias")
        log_fetch(conn, fid, f"{CM_API}/lines + /stops", 200, len(lines_body) + len(stops_body), ms,
                  f"{len(lines)} linhas e {len(stops)} paragens da API v2")
        delete_feed(conn, fid)
        insert_many(conn, "routes", (
            (f"cm:{ln.get('id')}", fid, ln.get("short_name") or str(ln.get("id")), ln.get("long_name") or "",
             3, ln.get("color") or "#FBC02D")
            for ln in lines if ln.get("id") is not None
        ))
        insert_many(conn, "stops", (
            (f"cm:{s.get('id')}", fid,
             s.get("long_name") or s.get("name") or s.get("tts_name") or f"Paragem {s.get('id')}",
             to_float(str(s.get("lat", ""))), to_float(str(s.get("lon", ""))),
             s.get("locality") or s.get("municipality_name") or "",
             f"cm:{s.get('parent_station')}" if s.get("parent_station") else None, 0)
            for s in stops if s.get("id") is not None
        ))
        row = {
            "id": fid, "operator_name": "Carris Metropolitana", "mode": "Autocarro", "feed_type": "api",
            "source_origin": "seed", "url": CM_API, "latest_url": CM_API, "auth_type": "none",
            "status": "OK", "progress": "OK", "lines_count": len(lines), "stops_count": len(stops),
            "trips_count": 0, "realtime_entities": "Veículos, Chegadas e Alertas (API v2 direta)",
            "last_ok": now_iso(), "last_fetch_at": now_iso(),
        }
        upsert_feed(conn, row)
        conn.commit()
        log(f"  OK  {fid}: {len(lines)} linhas, {len(stops)} paragens (API)")
        return row
    except Exception as err:  # noqa: BLE001
        log_fetch(conn, fid, CM_API, 0, 0, 0, "Falha", str(err))
        conn.commit()
        old = carry_over(conn, fid) if have_prev else None
        if old:
            old["last_error"] = f"Hoje falhou, mantidos os dados anteriores: {err}"
            upsert_feed(conn, old)
            conn.commit()
            return old
        row = {"id": fid, "operator_name": "Carris Metropolitana", "mode": "Autocarro", "feed_type": "api",
               "source_origin": "seed", "url": CM_API, "status": "ERROR", "progress": f"ERROR: {err}",
               "last_error": str(err), "last_fetch_at": now_iso()}
        upsert_feed(conn, row)
        conn.commit()
        return row


UNIR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "unir")
UNIR_COR = "#002B49"


def process_unir(conn):
    """Rede UNIR (Área Metropolitana do Porto): paragens e linhas da AMP.

    Os servidores da AMP só respondem a ligações de Portugal, por isso os dados vêm de ficheiros
    deste repositório (unir/), obtidos a partir de um telemóvel em Portugal. Os horários não ficam
    na base: a app pede as partidas à AMP diretamente do telemóvel de quem a usa.
    """
    fid = "unir"
    base = {"id": fid, "operator_name": "UNIR", "mode": "Autocarro", "feed_type": "amp",
            "source_origin": "seed", "url": "https://paragens.amp.pt/", "auth_type": "none",
            "license_url": "https://www.unirmobilidade.pt/"}
    try:
        with open(os.path.join(UNIR_DIR, "paragens.json"), encoding="utf-8") as fh:
            dados = json.load(fh)
        paragens = dados.get("paragens") or []
        if len(paragens) < 1000:
            raise ValueError(f"só {len(paragens)} paragens no ficheiro")
        nomes = {}
        caminho_linhas = os.path.join(UNIR_DIR, "linhas.json")
        if os.path.exists(caminho_linhas):
            with open(caminho_linhas, encoding="utf-8") as fh:
                nomes = {str(k): v for k, v in (json.load(fh).get("linhas") or {}).items()}
        sequencias = {}
        caminho_seq = os.path.join(UNIR_DIR, "sequencias.json")
        if os.path.exists(caminho_seq):
            with open(caminho_seq, encoding="utf-8") as fh:
                for chave, lista in (json.load(fh).get("sequencias") or {}).items():
                    for i, cod in enumerate(lista):
                        sequencias[(chave, cod)] = i + 1
        delete_feed(conn, fid)
        conn.execute("DELETE FROM stop_routes WHERE feed_id = ?", (fid,))
        linhas = set()
        ligacoes = []
        for p in paragens:
            cod = str(p.get("c") or "").strip()
            if not cod:
                continue
            for linha, sentido in p.get("l") or []:
                linha = str(linha).strip()
                if not linha:
                    continue
                linhas.add(linha)
                ligacoes.append((fid, f"unir:{cod}", f"unir:{linha}", int(sentido or 0),
                                 sequencias.get((f"{linha}_{int(sentido or 0)}", cod))))
        insert_many(conn, "stops", (
            (f"unir:{p['c']}", fid, " ".join(str(p.get("n") or p.get("a") or f"Paragem {p['c']}").split()),
             float(p["la"]), float(p["lo"]), p.get("m") or "", None, 0)
            for p in paragens if p.get("c")
        ))
        insert_many(conn, "routes", (
            (f"unir:{l}", fid, l, (nomes.get(l) or {}).get("nome") or "", int((nomes.get(l) or {}).get("tipo") or 3),
             (nomes.get(l) or {}).get("cor") or UNIR_COR)
            for l in sorted(linhas)
        ))
        conn.executemany("INSERT OR REPLACE INTO stop_routes (feed_id, stop_id, route_id, direction_id, stop_sequence)"
                         " VALUES (?, ?, ?, ?, ?)", ligacoes)
        meta = dados.get("meta") or {}
        log_fetch(conn, fid, "unir/paragens.json", 200, 0, 0,
                  f"{len(linhas)} linhas e {len(paragens)} paragens (AMP, obtido em {meta.get('obtido', '?')})")
        row = dict(base)
        row.update({"status": "OK", "progress": "OK", "lines_count": len(linhas), "stops_count": len(paragens),
                    "trips_count": 0, "realtime_entities": "Partidas da AMP (pedidas pelo telemóvel)",
                    "valid_from": meta.get("obtido"), "last_ok": now_iso(), "last_fetch_at": now_iso()})
        upsert_feed(conn, row)
        conn.commit()
        log(f"  OK  {fid}: {len(linhas)} linhas, {len(paragens)} paragens (ficheiro da AMP de {meta.get('obtido', '?')})")
        return row
    except Exception as err:  # noqa: BLE001
        log(f"  ERRO {fid}: {err}")
        row = dict(base)
        row.update({"status": "ERROR", "progress": f"ERROR: {err}", "last_error": str(err), "last_fetch_at": now_iso()})
        upsert_feed(conn, row)
        conn.commit()
        return row


DIAS_COLUNA = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def viagens_ativas(conn, dia):
    """Viagens por operador ativas num dia, com EXATAMENTE a mesma regra que a app usa."""
    ymd, col = dia.strftime("%Y%m%d"), DIAS_COLUNA[dia.weekday()]
    sql = f"""
        SELECT t.feed_id, COUNT(*) FROM trips t
        WHERE ((t.feed_id, t.service_id) IN (
            SELECT feed_id, service_id FROM calendar WHERE start_date <= '{ymd}' AND end_date >= '{ymd}' AND {col} = 1
            UNION SELECT feed_id, service_id FROM calendar_dates WHERE date = '{ymd}' AND exception_type = 1
            EXCEPT SELECT feed_id, service_id FROM calendar_dates WHERE date = '{ymd}' AND exception_type = 2)
          OR t.feed_id NOT IN (SELECT feed_id FROM calendar UNION SELECT feed_id FROM calendar_dates))
        GROUP BY t.feed_id"""
    return {fid: n for fid, n in conn.execute(sql)}


def verificar_saude(conn, today_dt):
    """Verificação diária escrita no manifest: viagens ativas hoje/amanhã e o calendário do Porto."""
    hoje = today_dt.date()
    amanha = hoje + datetime.timedelta(days=1)
    out = {"data_hoje": hoje.isoformat(), "data_amanha": amanha.isoformat(),
           "hoje": {}, "amanha": {}, "porto": {},
           "dias_uteis_verificados": 0, "dias_uteis_sem_servico": {}}
    try:
        out["hoje"] = viagens_ativas(conn, hoje)
        out["amanha"] = viagens_ativas(conn, amanha)
    except sqlite3.Error as err:
        log(f"AVISO: verificação de viagens falhou: {err}")
    # Dias úteis (sem feriados) dos próximos 7 dias em que cada operador não tem nenhuma viagem.
    # Apanha ficheiros que dizem ser válidos mas cujo horário de semana já acabou.
    try:
        com_viagens = {r[0] for r in conn.execute("SELECT DISTINCT feed_id FROM trips")}
        uteis, sem = 0, {}
        for k in range(7):
            dia = hoje + datetime.timedelta(days=k)
            if dia.weekday() >= 5 or feriado_nacional(dia):
                continue
            uteis += 1
            ativos = viagens_ativas(conn, dia)
            for fid in com_viagens:
                if not ativos.get(fid):
                    sem[fid] = sem.get(fid, 0) + 1
        out["dias_uteis_verificados"] = uteis
        out["dias_uteis_sem_servico"] = sem
        for fid, n in sorted(sem.items()):
            if uteis >= 3 and n >= uteis - 1:
                log(f"AVISO: {fid} não tem viagens em {n} dos {uteis} dias úteis dos próximos 7 dias")
    except sqlite3.Error as err:
        log(f"AVISO: verificação dos dias úteis falhou: {err}")
    for fid in ("stcp", "metro_porto"):
        try:
            ymd = hoje.strftime("%Y%m%d")
            out["porto"][fid] = {
                "calendar": [dict(zip(["service", "inicio", "fim", "seg", "ter", "qua", "qui", "sex", "sab", "dom"], r))
                             for r in conn.execute(
                                 "SELECT service_id, start_date, end_date, monday, tuesday, wednesday, thursday, friday,"
                                 " saturday, sunday FROM calendar WHERE feed_id = ? ORDER BY end_date DESC LIMIT 12", (fid,))],
                "datas_soltas": dict(zip(["primeira", "ultima", "total"], conn.execute(
                    "SELECT MIN(date), MAX(date), COUNT(*) FROM calendar_dates WHERE feed_id = ?", (fid,)).fetchone())),
                "servicos_com_data_hoje": [r[0] for r in conn.execute(
                    "SELECT service_id FROM calendar_dates WHERE feed_id = ? AND date = ? AND exception_type = 1 LIMIT 12",
                    (fid, ymd))],
                "viagens_por_servico": [dict(zip(["service", "viagens"], r)) for r in conn.execute(
                    "SELECT service_id, COUNT(*) FROM trips WHERE feed_id = ? GROUP BY service_id ORDER BY 2 DESC LIMIT 12",
                    (fid,))],
            }
        except sqlite3.Error as err:
            out["porto"][fid] = {"erro": str(err)}
    for fid in ("stcp", "metro_porto"):
        log(f"Verificação {fid}: {out['hoje'].get(fid, 0)} viagens hoje, {out['amanha'].get(fid, 0)} amanhã")
    return out


def main():
    started = time.time()
    today_dt = datetime.datetime.now(LISBON).replace(tzinfo=None)
    log(f"PAROU.PT - construção da base de dados ({today_dt:%Y-%m-%d})")

    for path in (OUT_DB, OUT_GZ):
        if os.path.exists(path):
            os.remove(path)

    have_prev = load_previous()
    conn = sqlite3.connect(OUT_DB)
    conn.execute("PRAGMA journal_mode = MEMORY")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -200000")
    conn.executescript(SCHEMA_TABLES)

    catalog = load_catalog()
    feeds = []
    for seed in SEED_FEEDS:
        feed = dict(seed)
        mirror = catalog_mirror(catalog, seed.get("mdb", []), seed.get("mdb_exclude"))
        if mirror and not feed.get("mirror"):
            feed["mirror"] = mirror
        feeds.append(feed)
    seed_urls = {f.get("url") for f in SEED_FEEDS if f.get("url")}
    seen_ids = {f["id"] for f in feeds}
    for feed in discovered_feeds(catalog, seed_urls):
        if feed["id"] not in seen_ids:
            feeds.append(feed)
            seen_ids.add(feed["id"])

    log(f"Operadores a carregar: {len(feeds)} + Carris Metropolitana (API) + UNIR (AMP)")
    results = []
    for i, feed in enumerate(feeds, 1):
        log(f"[{i}/{len(feeds)}] {feed['operator_name']}")
        results.append(process_feed(conn, feed, today_dt, have_prev))
    results.append(process_carris_metropolitana(conn, have_prev))
    results.append(process_unir(conn))

    try:
        conn.execute("DETACH DATABASE prev")
    except sqlite3.Error:
        pass

    log("A criar índices...")
    conn.executescript(SCHEMA_INDEXES)

    ok = [r for r in results if r.get("status") == "OK"]
    built_at = now_iso()
    conn.execute("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)", (
        "ingestion_progress", json.dumps({
            "isLoading": False, "totalOperators": len(results), "loadedOperators": len(ok),
            "currentOperator": "", "currentFeedId": "", "message": "Todos os operadores carregados",
            "updatedAt": built_at,
        }, ensure_ascii=False)))
    conn.execute("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)",
                 ("dataset_built_at", json.dumps(built_at)))
    conn.commit()
    conn.execute("ANALYZE")
    conn.commit()
    conn.execute("PRAGMA journal_mode = DELETE")
    conn.execute("VACUUM")
    totals = conn.execute(
        "SELECT (SELECT COUNT(*) FROM routes), (SELECT COUNT(*) FROM stops), (SELECT COUNT(*) FROM trips),"
        " (SELECT COUNT(*) FROM stop_times)").fetchone()
    integrity = conn.execute("PRAGMA quick_check").fetchone()[0]
    saude = verificar_saude(conn, today_dt)
    conn.close()

    if integrity != "ok":
        log(f"ERRO: a base de dados final não passou a verificação ({integrity}). Não vou publicar.")
        sys.exit(1)
    if totals[1] < 1000:
        log("ERRO: menos de 1000 paragens no total. Algo correu mal. Não vou publicar.")
        sys.exit(1)

    with open(OUT_DB, "rb") as src, gzip.open(OUT_GZ, "wb", compresslevel=6) as dst:
        shutil.copyfileobj(src, dst)

    hoje = today_dt.date()
    validades = {r.get("id"): estado_validade(r.get("valid_until"), hoje) for r in results}

    manifest = {
        "built_at": built_at,
        "db_bytes": os.path.getsize(OUT_DB),
        "gz_bytes": os.path.getsize(OUT_GZ),
        "totals": {"lines": totals[0], "stops": totals[1], "trips": totals[2], "stop_times": totals[3],
                   "operators": len(results), "operators_ok": len(ok),
                   "operators_desatualizados": sum(1 for e, _ in validades.values() if e == "caducado")},
        "feeds": [{
            "id": r.get("id"), "operator_name": r.get("operator_name"), "status": r.get("status"),
            "lines": r.get("lines_count") or 0, "stops": r.get("stops_count") or 0,
            "trips": r.get("trips_count") or 0, "valid_until": r.get("valid_until"),
            "validade": validades[r.get("id")][0], "dias_validade": validades[r.get("id")][1],
            "horario_prolongado": bool(r.get("_prolongado")),
            "url": r.get("url"), "last_error": r.get("last_error"),
            "servicos_associados": r.get("_aliases") or None,
            "servicos_sem_calendario": r.get("_sem_calendario") or None,
            "viagens_hoje": saude["hoje"].get(r.get("id"), 0),
            "viagens_amanha": saude["amanha"].get(r.get("id"), 0),
            "dias_uteis_sem_servico": saude["dias_uteis_sem_servico"].get(r.get("id"), 0),
        } for r in results],
        "verificacao": {"data_hoje": saude["data_hoje"], "data_amanha": saude["data_amanha"],
                        "dias_uteis_verificados": saude["dias_uteis_verificados"],
                        "porto": saude["porto"]},
        "duration_s": int(time.time() - started),
    }
    with open(OUT_MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    log("")
    log(f"Concluído em {manifest['duration_s']} s: {len(ok)}/{len(results)} operadores OK, "
        f"{totals[0]} linhas, {totals[1]} paragens, {totals[3]} horários.")
    log(f"gtfs.db: {manifest['db_bytes'] // 1048576} MB | gtfs.db.gz: {manifest['gz_bytes'] // 1048576} MB")
    if manifest["db_bytes"] > 900 * 1048576:
        log("AVISO: a base de dados tem mais de 900 MB; a app vai precisar de bastante memória.")


if __name__ == "__main__":
    main()
