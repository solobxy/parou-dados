"""TUBA (Barcelos): horários em PDF -> GTFS.

A Câmara de Barcelos publica os horários dos transportes urbanos (U1–U5) e municipais (M20–M94)
só em PDF, em https://tuba.barcelos.pt. O GTFS aberto que existe (portal da ubiwhere) é de 2025 e
não tem o horário em vigor desde 14/09/2026. Este módulo:

  - descarrega os dois PDFs (procura as ligações na página; se falhar, usa os últimos conhecidos);
  - tira as palavras com a posição de cada uma (`pdftotext -bbox`) e monta as tabelas: uma linha por
    paragem, uma coluna por viagem; «X» = não passa, «-» = passa sem hora (interpola-se);
  - lê os dias (dias úteis / sábados, pela posição do cabeçalho «SÁBADOS») e as notas por letra
    (A/B: só em período escolar, só fora do período escolar, também aos sábados, domingos e feriados);
  - encaixa cada viagem num percurso do GTFS antigo da mesma linha (paragens, coordenadas e traçado),
    pelos nomes e pelas horas dos pontos da tabela; as paragens do meio ficam com hora interpolada;
  - monta o calendário com os feriados nacionais e o calendário escolar.

Só usa a biblioteca padrão; o texto dos PDFs vem do `pdftotext` (poppler-utils), instalado no workflow.
"""
import csv
import difflib
import datetime as dt
import html
import io
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict

PAGINA = "https://tuba.barcelos.pt/"
PDFS_CONHECIDOS = [
    "https://tuba.barcelos.pt/assets/docs/horarios-urbanos-14092026.pdf",
    "https://tuba.barcelos.pt/assets/docs/horarios-municipais-14092026.pdf",
]
GTFS_BASE = ("https://map.mobility.ubiwhere.com/dataset/1842a15c-1aec-4f65-8e29-e57c8b4cbd74/resource/"
             "a595ee4b-bf86-4323-b1f4-7e3b3eb00e5e/download/gtfs_bar.zip")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 PAROU"

# ---------------------------------------------------------------------------------------------
# PDF -> palavras com posição
# ---------------------------------------------------------------------------------------------
_WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
_PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)


def paginas_de_bbox(xhtml):
    """Texto de `pdftotext -bbox` -> [[(x0, y0, x1, y1, texto), ...] por página]."""
    paginas = []
    for m in _PAGE.finditer(xhtml):
        ws = []
        for w in _WORD.finditer(m.group(3)):
            x0, y0, x1, y1 = (float(w.group(i)) for i in range(1, 5))
            ws.append((x0, y0, x1, y1, html.unescape(w.group(5))))
        paginas.append(ws)
    return paginas


def pdf_para_paginas(pdf_bytes):
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "h.pdf")
        with open(p, "wb") as f:
            f.write(pdf_bytes)
        out = subprocess.run(["pdftotext", "-bbox", p, "-"], check=True, capture_output=True, timeout=180)
    return paginas_de_bbox(out.stdout.decode("utf-8", "replace"))


# ---------------------------------------------------------------------------------------------
# Palavras -> tabelas
# ---------------------------------------------------------------------------------------------
_HORA = re.compile(r"^(\d{1,2})[:h.](\d{2})$")
_TOKEN_SEM = {"X", "x", "-", "–", "—"}
_LINHA = re.compile(r"^[MU]\d{1,3}$")
_LETRA = re.compile(r"^[A-W*]$")


def limpar_token(t):
    return t.strip(":.;,") if _HORA.match(t.strip(":.;,")) else t


def e_token(t):
    t = limpar_token(t)
    return bool(_HORA.match(t)) or t in _TOKEN_SEM


def minutos(t):
    m = _HORA.match(limpar_token(t))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def agrupar_linhas(words):
    """Junta as palavras com o mesmo centro vertical (±2.5 pt), ordenadas da esquerda para a direita."""
    linhas = []
    for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        cy = (w[1] + w[3]) / 2
        if linhas and abs(linhas[-1][0] - cy) <= 2.5:
            linhas[-1][1].append(w)
        else:
            linhas.append([cy, [w]])
    return [(cy, sorted(ws, key=lambda w: w[0])) for cy, ws in linhas]


def separar_nome(ws):
    """Linha de tabela -> (nome, [(x_centro, token)]) ou None. Os tokens são as palavras finais
    (horas, X, -) depois de um espaço claro a seguir ao nome."""
    i = len(ws)
    while i > 0 and e_token(ws[i - 1][4]):
        i -= 1
    if i == 0 or i == len(ws):
        return None
    nome_ws, toks = ws[:i], ws[i:]
    if toks[0][0] - nome_ws[-1][2] < 8:
        # o «X» de «Calvelhe X» colado ao nome é parte do nome
        while toks and toks[0][0] - nome_ws[-1][2] < 8:
            nome_ws = nome_ws + [toks[0]]
            toks = toks[1:]
        if not toks:
            return None
    nome = " ".join(w[4] for w in nome_ws).strip()
    if len(re.findall(r"[A-Za-zÀ-ÿ]", nome)) < 2:
        return None
    return nome, [((w[0] + w[2]) / 2, w[4]) for w in toks]


def colunas(xs, junta=9.0):
    """Centros de coluna a partir dos centros dos tokens (agrupa os que distam menos de `junta`)."""
    grupos = []
    for x in sorted(xs):
        if grupos and x - grupos[-1][-1] <= junta:
            grupos[-1].append(x)
        else:
            grupos.append([x])
    return [sum(g) / len(g) for g in grupos]


def mais_perto(cols, x, maximo=12.0):
    best, bd = None, maximo
    for i, c in enumerate(cols):
        d = abs(c - x)
        if d < bd:
            best, bd = i, d
    return best


def normalizar(t):
    t = unicodedata.normalize("NFKD", t)
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


def regra_da_nota(texto):
    """Texto de uma nota (A - ...) -> 'escolar' | 'ferias' | 'sab_dom_fer' | 'sab' | None (só informativa)."""
    n = normalizar(texto)
    if "fora do periodo escolar" in n:
        return "ferias"
    if re.search(r"so se efe(c)?tua", n) and "periodo escolar" in n:
        return "escolar"
    if re.search(r"so (funciona|se realiza)", n) and ("aulas" in n or "periodo escolar" in n):
        return "escolar"
    if "tambem se efe" in n and "domingo" in n:
        return "sab_dom_fer"
    if "tambem se efe" in n and "sabado" in n:
        return "sab"
    return None


def ler_blocos(paginas):
    """Páginas -> [{'linha': 'M20', 'titulo': str, 'tabelas': [{'paragens': [...], 'viagens': [...]}]}].

    Cada viagem: {'dias': 'uteis'|'sab', 'regra': None|'escolar'|..., 'celulas': [token ou None por paragem]}.
    """
    blocos = []
    atual = None
    for words in paginas:
        linhas = agrupar_linhas(words)
        # cabeçalhos de linha (M20, U1...) nesta página: começam um bloco novo
        cabecalhos = [(cy, ws[0][4]) for cy, ws in linhas if _LINHA.match(ws[0][4]) and ws[0][0] < 250]
        idx_cab = 0
        for cy, ws in linhas:
            while idx_cab < len(cabecalhos) and cy >= cabecalhos[idx_cab][0] - 0.1:
                if atual:
                    blocos.append(atual)
                atual = {"linha": cabecalhos[idx_cab][1], "linhas": [], "sab_x": None, "notas": {}}
                idx_cab += 1
            if atual is None:
                continue
            atual["linhas"].append((cy, ws))
    if atual:
        blocos.append(atual)
    # índice (1.ª página): «M20 Barcelos – Vila Chã, via Creixomil e Vila Cova» -> nome da linha
    nomes = {}
    for b in blocos:
        if len(b["linhas"]) == 1:
            ws = b["linhas"][0][1]
            nome = " ".join(w[4] for w in ws[1:]).strip()
            if len(ws) >= 3 and ws[1][0] - ws[0][2] < 60:
                nomes[b["linha"]] = re.sub(r"\s+", " ", nome)
    saida = [b for b in (_montar_bloco(b) for b in blocos) if b["tabelas"]]
    for b in saida:
        b["nome"] = nomes.get(b["linha"]) or b["titulo"]
    return saida


def _montar_bloco(b):
    sab_x = None
    notas = {}
    filas = []  # ('paragem', cy, nome, toks) | ('letras', cy, [(x, letra)])
    titulo_ws = []
    for cy, ws in b["linhas"]:
        texto = " ".join(w[4] for w in ws)
        for w in ws:
            # cabeçalho «SÁBADOS» (em maiúsculas; «sábados» nas notas não conta)
            if w[4].isupper() and normalizar(w[4]).startswith("sabado"):
                sab_x = w[0] if sab_x is None else min(sab_x, w[0])
        m = re.match(r"^([A-Z])\s*[-–]\s*(.+)$", texto) or re.match(r"^(\*)\s*(\S.+)$", texto)
        if m and ws[0][0] < 120 and len(ws) > 3 and not any(_HORA.match(w[4]) for w in ws):
            notas[m.group(1)] = m.group(2)
            continue
        if all(_LETRA.match(w[4]) for w in ws) and len(ws) >= 1 and ws[0][0] > 150:
            filas.append(("letras", cy, [((w[0] + w[2]) / 2, w[4]) for w in ws]))
            continue
        sep = separar_nome(ws)
        if sep and ws[0][0] < 150:
            filas.append(("paragem", cy, sep[0], sep[1]))
        elif not filas and ws[0][0] > 200:
            titulo_ws.append(texto)
    # tabelas: paragens seguidas sem buraco grande entre elas
    tabelas = []
    passo = None
    ys = [f[1] for f in filas if f[0] == "paragem"]
    difs = sorted(b2 - a for a, b2 in zip(ys, ys[1:]) if b2 > a)
    if difs:
        passo = difs[len(difs) // 2]
    for f in filas:
        if f[0] != "paragem":
            continue
        if tabelas and f[1] - tabelas[-1]["ys"][-1] <= (passo or 10) * 1.8:
            t = tabelas[-1]
        else:
            t = {"ys": [], "filas": []}
            tabelas.append(t)
        t["ys"].append(f[1])
        t["filas"].append((f[2], f[3]))
    # letras: à tabela mais perto (acima ou abaixo)
    letras_por_tabela = defaultdict(list)
    for f in filas:
        if f[0] != "letras" or not tabelas:
            continue
        dist = [min(abs(f[1] - t["ys"][0]), abs(f[1] - t["ys"][-1])) for t in tabelas]
        letras_por_tabela[dist.index(min(dist))].extend(f[2])
    regras = {k: regra_da_nota(v) for k, v in notas.items()}
    saida = []
    for ti, t in enumerate(tabelas):
        cols = colunas([x for _, toks in t["filas"] for x, _ in toks])
        n = len(cols)
        paragens = [nome for nome, _ in t["filas"]]
        cel = [[None] * len(paragens) for _ in range(n)]
        for pi, (_, toks) in enumerate(t["filas"]):
            for x, tok in toks:
                ci = mais_perto(cols, x)
                if ci is not None:
                    cel[ci][pi] = tok
        letra_col = {}
        for x, letra in letras_por_tabela.get(ti, []):
            ci = mais_perto(cols, x, maximo=14.0)
            if ci is not None:
                letra_col[ci] = letra
        viagens = []
        for ci in range(n):
            dias = "sab" if sab_x is not None and cols[ci] >= sab_x - 5 else "uteis"
            letra = letra_col.get(ci)
            viagens.append({"dias": dias, "letra": letra, "regra": regras.get(letra) if letra else None,
                            "celulas": cel[ci], "x": cols[ci]})
        toks = [c for v in cel for c in v if c and c not in ("X", "x")]
        tracos = sum(1 for c in toks if c in ("-", "–", "—"))
        # urbanos: a tabela lista todas as paragens (muitos «-»); municipais: só os pontos principais
        saida.append({"paragens": paragens, "viagens": viagens, "completa": bool(toks) and tracos / len(toks) >= 0.2})
    return {"linha": b["linha"], "titulo": " ".join(titulo_ws).strip(), "notas": notas, "tabelas": saida}


def _sem_horas_fora_de_ordem(seq):
    """Gralhas do PDF (ex.: 18:46 entre 14:36 e 14:53): fica a maior sequência de horas que não anda
    para trás; as outras passam a «-» (interpoladas). Devolve quantas mudou."""
    idx = [k for k, (_, m) in enumerate(seq) if m is not None]
    if len(idx) < 3:
        return 0
    vals = [seq[k][1] for k in idx]
    n = len(vals)
    # maior sequência que não anda para trás; em empate, a de menor duração (a gralha faz um salto)
    comp, ant, ini = [1] * n, [-1] * n, list(vals)
    for a in range(n):
        for b in range(a):
            if vals[b] <= vals[a] and (comp[b] + 1, -(vals[a] - ini[b])) > (comp[a], -(vals[a] - ini[a])):
                comp[a], ant[a], ini[a] = comp[b] + 1, b, ini[b]
    fim = max(range(n), key=lambda k: (comp[k], -(vals[k] - ini[k]), -k))
    manter = set()
    while fim >= 0:
        manter.add(fim)
        fim = ant[fim]
    mudou = 0
    for pos, k in enumerate(idx):
        if pos not in manter:
            seq[k] = (seq[k][0], None)
            mudou += 1
    return mudou


def viagens_da_tabela(tabela):
    """Tabela -> [(viagem, [(indice_paragem, minutos ou None)])]: tira os «X», mantém os «-» (None)
    entre a primeira e a última hora. Viagens com menos de duas horas ficam de fora."""
    out = []
    for v in tabela["viagens"]:
        seq = []
        for pi, tok in enumerate(v["celulas"]):
            if tok is None or tok in ("X", "x"):
                if tok is None:
                    seq.append((pi, None))
                continue
            seq.append((pi, minutos(tok)))
        v["corrigidas"] = _sem_horas_fora_de_ordem(seq)
        horas = [i for i, (_, m) in enumerate(seq) if m is not None]
        if len(horas) < 2:
            continue
        seq = seq[horas[0]: horas[-1] + 1]
        out.append((v, seq))
    return out


# ---------------------------------------------------------------------------------------------
# Encaixe no GTFS antigo (paragens, coordenadas e traçado)
# ---------------------------------------------------------------------------------------------
_ABREV = {"s": "sao", "sr": "senhor", "sra": "senhora", "sta": "santa", "sto": "santo", "esc": "escola",
          "sec": "secundaria", "av": "avenida", "lg": "largo", "r": "rua", "h": "hospital", "q": "quinta",
          "jf": "junta", "j": "junta", "f": "freguesia", "cm": "camara", "ipca": "ipca", "etg": "etg",
          "egito": "egipto", "eb": "escola", "escolas": "escola", "ebi": "escola", "conservatorio": "conservatorio", "nascente": "nascente", "poente": "poente", "centro": "centro"}
_VAZIAS = {"de", "da", "do", "dos", "das", "e", "a", "o", "em", "ao"}


def fichas(nome):
    n = normalizar(nome)
    n = n.replace("e.t.g", "etg").replace("j.f", "jf").replace("c.m", "cm")
    out = []
    for w in re.findall(r"[a-z0-9]+", n):
        w = _ABREV.get(w, w)
        if w not in _VAZIAS and not (w.isdigit() and len(w) == 1):
            out.append(w)
    return out


class Semelhanca:
    """Semelhança entre nomes de paragens: Dice pesado pelo IDF das palavras nos nomes do GTFS antigo
    (palavras comuns como «Barcelos» pesam pouco)."""

    def __init__(self, nomes):
        df = Counter()
        for n in set(nomes):
            for w in set(fichas(n)):
                df[w] += 1
        total = max(1, len(set(nomes)))
        import math
        self.peso = {w: math.log(1 + total / c) for w, c in df.items()}
        self.padrao = math.log(1 + total)
        self._cache = {}

    def p(self, w):
        return self.peso.get(w, self.padrao)

    def __call__(self, a, b):
        k = (a, b)
        if k in self._cache:
            return self._cache[k]
        fa, fb = set(fichas(a)), set(fichas(b))
        if not fa or not fb:
            r = 0.0
        else:
            comum = 0.0
            for w in fa:
                if w in fb:
                    comum += self.p(w)
                elif len(w) >= 5 and any(len(x) >= 5 and (x.startswith(w[:5])) for x in fb):
                    comum += self.p(w) * 0.7
                elif len(w) >= 6 and any(len(x) >= 6 and difflib.SequenceMatcher(None, w, x).ratio() >= 0.8
                                         for x in fb):
                    comum += self.p(w) * 0.7
            r = 2 * comum / (sum(self.p(w) for w in fa) + sum(self.p(w) for w in fb))
            r = min(1.0, r)
        self._cache[k] = r
        return r


def ler_gtfs(zbytes):
    """GTFS antigo -> dict com stops, trips (com a sequência de (stop_id, minutos)), shapes por id e linhas."""
    z = zipfile.ZipFile(io.BytesIO(zbytes))

    def tabela(nome):
        if nome not in z.namelist():
            return []
        return list(csv.DictReader(io.TextIOWrapper(z.open(nome), encoding="utf-8-sig")))

    stops = {r["stop_id"]: r for r in tabela("stops.txt")}
    routes = {r["route_id"]: r for r in tabela("routes.txt")}
    trips = {r["trip_id"]: r for r in tabela("trips.txt")}
    seqs = defaultdict(list)
    with z.open("stop_times.txt") as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            h, m, _ = (r["arrival_time"] or r["departure_time"] or "0:0:0").split(":")
            seqs[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"], int(h) * 60 + int(m)))
    viagens = defaultdict(list)  # nome curto da linha -> [ {stops, mins, shape, dir} ]
    vistos = set()
    for tid, l in seqs.items():
        t = trips.get(tid)
        if not t or t["route_id"] not in routes:
            continue
        l.sort()
        ids = tuple(x[1] for x in l if x[1] in stops)
        mins = tuple(x[2] for x in l if x[1] in stops)
        linha = routes[t["route_id"]]["route_short_name"].strip().upper()
        chave = (linha, ids, mins)
        if len(ids) < 2 or chave in vistos:
            continue
        vistos.add(chave)
        viagens[linha].append({"stops": ids, "mins": mins, "shape": t.get("shape_id") or "",
                               "dir": t.get("direction_id") or "0", "trip": tid})
    return {"z": z, "stops": stops, "routes": routes, "viagens": viagens}


def alinhar(pdf, velha, sem, desvio=0, peso_hora=1.0):
    """Alinha as paragens da viagem do PDF [(nome, minutos|None)] com as da viagem antiga
    ([(nome, minutos)]), pela ordem. Devolve (pontuação, [(i_pdf, j_velha)])."""
    n, m = len(pdf), len(velha)
    neg = -1e9
    # dp[i][j]: melhor pontuação usando pdf[:i] e velha[:j]
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    de = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        nome_i, h_i = pdf[i - 1]
        row, prev = dp[i], dp[i - 1]
        for j in range(1, m + 1):
            best, how = prev[j], 1          # salta a paragem do PDF
            if row[j - 1] > best:
                best, how = row[j - 1], 2   # salta a paragem antiga
            nome_j, h_j = velha[j - 1]
            s = parecido(sem, nome_i, nome_j) * 1.5
            if h_i is not None and peso_hora:
                d = abs(h_i - (h_j + desvio))
                s += peso_hora * (2.0 if d <= 1 else 1.0 if d <= 3 else -0.5 if d > 10 else 0.0)
            if s >= 0.9 and prev[j - 1] + s > best:
                best, how = prev[j - 1] + s, 3
            row[j] = best
            de[i][j] = how
    pares = []
    i, j = n, m
    while i > 0 and j > 0:
        how = de[i][j]
        if how == 3:
            pares.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif how == 1:
            i -= 1
        else:
            j -= 1
    _ = neg
    return dp[n][m], pares[::-1]


def _mediana(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2] if xs else 0


def melhor_alinhamento(linha, pdf, velho, sem):
    """Viagem antiga da mesma linha que melhor encaixa (nomes + horas). -> (pontuação, pares, viagem, velha)."""
    cands = velho["viagens"].get(linha, [])
    nomes = velho["stops"]
    horas = [h for _, h in pdf if h is not None]
    melhor = None
    if not cands or not horas:
        return None
    hs = set(horas)
    rapido = sorted(cands, key=lambda c: -sum(1 for x in c["mins"] if x in hs))[:4]
    por_padrao = {}
    for c in cands:
        d = abs(c["mins"][0] - horas[0])
        if c["stops"] not in por_padrao or d < por_padrao[c["stops"]][0]:
            por_padrao[c["stops"]] = (d, c)
    lista = {id(c): c for c in rapido}
    for _, c in por_padrao.values():
        lista[id(c)] = c
    for c in lista.values():
        velha = [(nomes[s]["stop_name"], h) for s, h in zip(c["stops"], c["mins"])]
        _, p1 = alinhar(pdf, velha, sem, peso_hora=0)
        difs = [pdf[i][1] - velha[j][1] for i, j in p1 if pdf[i][1] is not None]
        for desvio in {0, _mediana(difs)}:
            sc, pares = alinhar(pdf, velha, sem, desvio=desvio)
            if melhor is None or sc > melhor[0]:
                melhor = (sc, pares, c, velha)
    return melhor


def encaixar(linha, pdf, velho, sem, completa=False):
    """Viagem do PDF [(nome, minutos|None)] -> (paragens [(stop_id, segundos)], shape_id, cobertura, modo).

    completa=True: o PDF lista todas as paragens (urbanos) -> a sequência é a do PDF; cada paragem fica
    com a paragem antiga com que encaixou (ou, se não encaixou, a do mesmo nome mais perto do caminho).
    completa=False: o PDF só tem os pontos principais (municipais) -> as paragens do meio vêm do
    percurso antigo, com hora interpolada."""
    horas = [h for _, h in pdf if h is not None]
    melhor = melhor_alinhamento(linha, pdf, velho, sem)
    pares = dict(melhor[1]) if melhor else {}
    if completa:
        sims = {i: parecido(sem, pdf[i][0], melhor[3][j][0]) for i, j in pares.items()}

        def entalada(i):
            # nome diferente (paragem renomeada?) só vale entre dois vizinhos que encaixam bem, com o
            # percurso antigo a ter esta paragem no mesmo sítio entre eles
            ip = next((k for k in range(i - 1, max(-1, i - 3), -1) if sims.get(k, 0) >= 0.6), None)
            inn = next((k for k in range(i + 1, min(len(pdf), i + 3)) if sims.get(k, 0) >= 0.6), None)
            if ip is None or inn is None:
                return False
            jp, j, jn = pares[ip], pares[i], pares[inn]
            return jp < j < jn and jn - jp <= (inn - ip) + 2

        linhas = []
        for i, (nome, h) in enumerate(pdf):
            # só pela hora não chega quando o percurso mudou: o nome tem de ser parecido ou estar entalado
            if i in pares and (sims[i] >= 0.35 or entalada(i)):
                linhas.append(([melhor[2]["stops"][pares[i]]], h))
            else:
                linhas.append((candidatos(nome, linha, velho, sem, minimo=0.6 if h is None else 0.5), h))
        out, cob = percurso(linhas, velho, len(horas))
        c = melhor[2] if melhor else None
        shape = c["shape"] if c and tuple(s for s, _ in out) == c["stops"] else ""
        return out, shape, cob, "lista"
    if melhor:
        sc, pares_l, c, velha = melhor
        timed = [(i, j) for i, j in pares_l if pdf[i][1] is not None]
        limpo = []
        for i, j in timed:  # monotonia (as gralhas já saíram em viagens_da_tabela)
            if limpo and (pdf[i][1] < pdf[limpo[-1][0]][1] or j <= limpo[-1][1]):
                continue
            limpo.append((i, j))
        if len(limpo) >= 2 and len(limpo) / len(horas) >= 0.6:
            j0, j1 = limpo[0][1], limpo[-1][1]
            anc = {j: pdf[i][1] * 60 for i, j in limpo}
            js = sorted(anc)
            out = []
            for j in range(j0, j1 + 1):
                if j in anc:
                    t = anc[j]
                else:
                    a = max(x for x in js if x < j)
                    b = min(x for x in js if x > j)
                    va, vb, vj = velha[a][1], velha[b][1], velha[j][1]
                    f = (vj - va) / (vb - va) if vb > va else (j - a) / (b - a)
                    t = int(round(anc[a] + (anc[b] - anc[a]) * min(1.0, max(0.0, f))))
                out.append((c["stops"][j], t))
            inteira = j0 == 0 and j1 == len(velha) - 1
            shape = c["shape"] if inteira else ""
            # pontas do PDF que não encaixaram (ex.: terminal novo): pelo nome, se houver
            ti = [k for k, (_, h) in enumerate(pdf) if h is not None]
            i0, i1 = limpo[0][0], limpo[-1][0]
            antes = [k for k in ti if k < i0]
            depois = [k for k in ti if k > i1]
            extra_a, extra_d = [], []
            for k in antes:
                cs = candidatos(pdf[k][0], linha, velho, sem)
                if cs:
                    extra_a.append((_mais_perto_de(cs, out[0][0], velho), pdf[k][1] * 60))
            for k in depois:
                cs = candidatos(pdf[k][0], linha, velho, sem)
                if cs:
                    extra_d.append((_mais_perto_de(cs, out[-1][0], velho), pdf[k][1] * 60))
            if extra_a or extra_d:
                shape = ""
            out = [x for x in extra_a if x[0] != out[0][0]] + out + [x for x in extra_d if x[0] != out[-1][0]]
            cob = (len(limpo) + len(extra_a) + len(extra_d)) / len(horas)
            return out, shape, cob, "percurso"
    linhas = [(candidatos(nome, linha, velho, sem, minimo=0.6 if h is None else 0.5), h) for nome, h in pdf]
    out, cob = percurso(linhas, velho, len(horas))
    return out, "", cob, "nomes" if out else "falhou"


def _pos(velho, s):
    try:
        st = velho["stops"][s]
        return float(st["stop_lat"]), float(st["stop_lon"])
    except (KeyError, ValueError):
        return None


def _mais_perto_de(cs, ref, velho):
    pr = _pos(velho, ref)
    if not pr:
        return cs[0]
    return min(cs, key=lambda s: _dist(_pos(velho, s), pr) if _pos(velho, s) else 1e12)


def percurso(linhas, velho, n_horas):
    """[(candidatos, minutos|None)] -> ([(stop_id, segundos)], cobertura). Escolhe entre paragens com o
    mesmo nome o caminho mais curto (Viterbi) e interpola as horas em falta pela distância percorrida."""
    passos = [([s for s in cs if _pos(velho, s)], h) for cs, h in linhas]
    passos = [(cs, h) for cs, h in passos if cs]
    if not passos:
        return [], 0.0
    custo = [{s: 0.0 for s in passos[0][0]}]
    back = [{s: None for s in passos[0][0]}]
    for cs, _ in passos[1:]:
        ant = custo[-1]
        c, b = {}, {}
        for s in cs:
            ps = _pos(velho, s)
            p = min(ant, key=lambda q: ant[q] + _dist(_pos(velho, q), ps))
            c[s], b[s] = ant[p] + _dist(_pos(velho, p), ps), p
        custo.append(c)
        back.append(b)
    s = min(custo[-1], key=custo[-1].get)
    escolha = []
    for k in range(len(passos) - 1, -1, -1):
        escolha.append(s)
        s = back[k][s]
    escolha.reverse()
    out = []
    for (cs, h), s in zip(passos, escolha):
        if out and out[-1][0] == s:
            if h is not None and out[-1][1] is None:
                out[-1][1] = h * 60
            continue
        out.append([s, h * 60 if h is not None else None])
    ti = [k for k, (_, t) in enumerate(out) if t is not None]
    if len(ti) < 2:
        return [], 0.0
    out = out[ti[0]: ti[-1] + 1]
    ti = [k for k, (_, t) in enumerate(out) if t is not None]
    # horas a andar para trás (paragem repetida mal escolhida): a hora sai e é interpolada
    for a, b in zip(ti, ti[1:]):
        if out[b][1] < out[a][1]:
            out[b][1] = None
    ti = [k for k, (_, t) in enumerate(out) if t is not None]
    acum = [0.0]
    for k in range(1, len(out)):
        acum.append(acum[-1] + _dist(_pos(velho, out[k - 1][0]), _pos(velho, out[k][0])))
    for a, b in zip(ti, ti[1:]):
        for k in range(a + 1, b):
            f = (acum[k] - acum[a]) / (acum[b] - acum[a]) if acum[b] > acum[a] else (k - a) / (b - a)
            out[k][1] = int(round(out[a][1] + (out[b][1] - out[a][1]) * f))
    out = out[: ti[-1] + 1]
    return [tuple(x) for x in out], len(ti) / max(1, n_horas)


def _dist(a, b):
    import math
    la, lo = math.radians(a[0]), math.radians(a[1])
    lb, lob = math.radians(b[0]), math.radians(b[1])
    x = (lob - lo) * math.cos((la + lb) / 2)
    return math.hypot(x, lb - la) * 6371000


def variantes(nome):
    """«Barcelos (Central) | (Central Camionagem)» -> ['Barcelos (Central)', 'Barcelos (Central Camionagem)']."""
    if "|" not in nome:
        return [nome]
    partes = [p.strip() for p in nome.split("|") if p.strip()]
    base = partes[0].split("(")[0].strip()
    out = [partes[0]]
    for p in partes[1:]:
        out.append(f"{base} {p}" if p.startswith("(") else p)
    return out


def parecido(sem, nome, outro):
    return max(sem(v, outro) for v in variantes(nome))


def candidatos(nome, linha, velho, sem, minimo=0.6):
    """Paragens antigas com nome parecido: primeiro as da mesma linha, depois todas."""
    nomes = velho["stops"]
    usados = velho.setdefault("_usados", {})
    if linha not in usados:
        usados[linha] = {s for c in velho["viagens"].get(linha, []) for s in c["stops"]}
    for pool in (usados[linha], nomes.keys()):
        sc = [(parecido(sem, nome, nomes[s]["stop_name"]), s) for s in pool]
        top = max((x for x, _ in sc), default=0)
        if top >= minimo:
            return [s for x, s in sc if x >= top - 0.05]
    return []




# ---------------------------------------------------------------------------------------------
# Calendário
# ---------------------------------------------------------------------------------------------
def _pascoa(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    mes = (h + l_ - 7 * m + 114) // 31
    dia = (h + l_ - 7 * m + 114) % 31 + 1
    return dt.date(y, mes, dia)


def feriado(day):
    """Feriados nacionais + feriado municipal de Barcelos (3 de maio)."""
    if (day.month, day.day) in {(1, 1), (4, 25), (5, 1), (6, 10), (8, 15), (10, 5), (11, 1), (12, 1), (12, 8),
                                (12, 25), (5, 3)}:
        return True
    p = _pascoa(day.year)
    return day in (p - dt.timedelta(days=2), p, p + dt.timedelta(days=60))


# Calendário escolar (Despacho n.º 8368/2024): períodos de aulas, sem as interrupções.
# 3.º período até 11/06 (5.º–8.º e 10.º anos; o pré-escolar e o 1.º ciclo vão até 30/06).
PERIODOS_ESCOLARES = [
    (dt.date(2026, 9, 14), dt.date(2026, 12, 15)),
    (dt.date(2027, 1, 4), dt.date(2027, 2, 7)),
    (dt.date(2027, 2, 11), dt.date(2027, 3, 19)),
    (dt.date(2027, 4, 5), dt.date(2027, 6, 11)),
    (dt.date(2027, 9, 14), dt.date(2027, 12, 17)),
    (dt.date(2028, 1, 3), dt.date(2028, 2, 25)),
    (dt.date(2028, 3, 2), dt.date(2028, 3, 31)),
    (dt.date(2028, 4, 18), dt.date(2028, 6, 9)),
]


def dia_de_aulas(day):
    """Há aulas neste dia útil? Para anos letivos ainda sem despacho conhecido, usa o padrão habitual
    (meados de setembro a meados de dezembro, janeiro até à semana antes da Páscoa, depois da Páscoa
    até meados de junho; sem o Carnaval)."""
    if day.weekday() >= 5:
        return False
    if PERIODOS_ESCOLARES[0][0] <= day <= PERIODOS_ESCOLARES[-1][1]:
        return any(a <= day <= b for a, b in PERIODOS_ESCOLARES)
    y = day.year
    p = _pascoa(y)
    carnaval = p - dt.timedelta(days=47)
    if dt.date(y, 9, 14) <= day <= dt.date(y, 12, 16):
        return True
    if dt.date(y, 1, 4) <= day <= dt.date(y, 6, 11):
        if carnaval - dt.timedelta(days=1) <= day <= carnaval + dt.timedelta(days=1):
            return False
        if p - dt.timedelta(days=7) <= day <= p + dt.timedelta(days=7):
            return False
        return True
    return False


def circula(dias, regra, day):
    """A viagem (dias: 'uteis'|'sab'; regra: nota da letra) circula neste dia?"""
    fer = feriado(day)
    wd = day.weekday()
    util = wd < 5 and not fer
    sabado = wd == 5 and not fer
    base = util if dias == "uteis" else sabado
    if regra == "sab_dom_fer":
        return True if dias == "uteis" else base
    if regra == "sab":
        return base or sabado
    if regra == "escolar":
        return base and dia_de_aulas(day)
    if regra == "ferias":
        return base and not dia_de_aulas(day)
    return base


# ---------------------------------------------------------------------------------------------
# GTFS
# ---------------------------------------------------------------------------------------------
def _hhmmss(seg):
    return f"{seg // 3600:02d}:{seg // 60 % 60:02d}:{seg % 60:02d}"


def _csv(nome, campos, linhas):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=campos, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for r in linhas:
        w.writerow(r)
    return nome, buf.getvalue()


def construir_gtfs(blocos, velho, hoje=None, dias=60, log=print):
    """blocos: ler_blocos() dos dois PDFs; velho: ler_gtfs() do GTFS antigo. -> (bytes do zip, relatório)."""
    hoje = hoje or dt.date.today()
    sem = Semelhanca([s["stop_name"] for s in velho["stops"].values()])
    rotas_velhas = {r["route_short_name"].strip().upper(): r for r in velho["routes"].values()}
    routes, trips, stop_times, usados, shapes = [], [], [], set(), set()
    servicos = {}
    rel = Counter()
    vistas = set()
    for b in blocos:
        linha = b["linha"]
        rv = rotas_velhas.get(linha)
        route_id = rv["route_id"] if rv else f"BAR{linha}"
        n_viagens = 0
        for ti, t in enumerate(b["tabelas"]):
            direcao = "0" if ti % 2 == 0 else "1"
            for v, seq in viagens_da_tabela(t):
                pdf = [(t["paragens"][pi], m) for pi, m in seq]
                out, shape, cob, modo = encaixar(linha, pdf, velho, sem, t.get("completa"))
                rel[modo] += 1
                rel["horas_corrigidas"] += v.get("corrigidas", 0)
                if len(out) < 2:
                    rel["sem_paragens"] += 1
                    continue
                if cob < 0.99:
                    rel["cobertura_parcial"] += 1
                chave_sv = (v["dias"], v["regra"] or "")
                sid = servicos.setdefault(chave_sv, "TUBA_" + "_".join(x for x in chave_sv if x))
                chave = (route_id, sid, tuple(out))
                if chave in vistas:  # a mesma viagem repetida em duas tabelas
                    continue
                vistas.add(chave)
                n_viagens += 1
                tid = f"{linha}_{direcao}_{out[0][1] // 60:04d}_{sid[5:]}_{n_viagens}"
                trips.append({"route_id": route_id, "service_id": sid, "trip_id": tid, "direction_id": direcao,
                              "trip_headsign": velho["stops"][out[-1][0]]["stop_name"], "shape_id": shape})
                if shape:
                    shapes.add(shape)
                ult = -1
                for k, (sid_p, seg) in enumerate(out, 1):
                    seg = max(seg, ult)
                    ult = seg
                    stop_times.append({"trip_id": tid, "arrival_time": _hhmmss(seg), "departure_time": _hhmmss(seg),
                                       "stop_id": sid_p, "stop_sequence": k})
                    usados.add(sid_p)
        if n_viagens:
            nome = b.get("nome") or (rv or {}).get("route_long_name") or linha
            routes.append({"route_id": route_id, "agency_id": "BAR", "route_short_name": linha,
                           "route_long_name": nome.replace("–", "-"), "route_type": 3})
        rel["linhas"] += 1 if n_viagens else 0
    # calendário: dia a dia, de ontem até ao fim da janela
    cal = []
    for k in range(-1, dias + 1):
        day = hoje + dt.timedelta(days=k)
        for (dias_v, regra), sid in servicos.items():
            if circula(dias_v, regra or None, day):
                cal.append({"service_id": sid, "date": day.strftime("%Y%m%d"), "exception_type": 1})
    stops = []
    for s in sorted(usados):
        r = velho["stops"][s]
        stops.append({"stop_id": s, "stop_code": r.get("stop_code", ""), "stop_name": r["stop_name"],
                      "stop_lat": r["stop_lat"], "stop_lon": r["stop_lon"]})
    shape_rows = []
    if shapes and "shapes.txt" in velho["z"].namelist():
        with velho["z"].open("shapes.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if r["shape_id"] in shapes:
                    shape_rows.append(r)
    ficheiros = [
        _csv("agency.txt", ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
             [{"agency_id": "BAR", "agency_name": "TUBA Barcelos", "agency_url": "https://tuba.barcelos.pt",
               "agency_timezone": "Europe/Lisbon", "agency_lang": "pt"}]),
        _csv("routes.txt", ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"], routes),
        _csv("trips.txt", ["route_id", "service_id", "trip_id", "direction_id", "trip_headsign", "shape_id"], trips),
        _csv("stop_times.txt", ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], stop_times),
        _csv("stops.txt", ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon"], stops),
        _csv("calendar_dates.txt", ["service_id", "date", "exception_type"], cal),
    ]
    if shape_rows:
        ficheiros.append(_csv("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence",
                                             "shape_dist_traveled"], shape_rows))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, txt in ficheiros:
            z.writestr(nome, txt)
    rel.update({"viagens": len(trips), "paragens": len(stops), "servicos": len(servicos), "tracados": len(shapes)})
    log(f"  tuba_barcelos: {dict(rel)}")
    return buf.getvalue(), dict(rel)


# ---------------------------------------------------------------------------------------------
# Descarregar
# ---------------------------------------------------------------------------------------------
def _get(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def links_pdf(html_txt, base="https://tuba.barcelos.pt/"):
    """Ligações para os PDFs de horários urbanos e municipais mais recentes na página."""
    out = {}
    for href in re.findall(r'href="([^"]+\.pdf)"', html_txt, re.I):
        url = urllib.request.urljoin(base, html.unescape(href))
        n = normalizar(url)
        for tipo in ("urbanos", "municipais"):
            if "horario" in n and tipo in n:
                data = re.search(r"(\d{2})(\d{2})(\d{4})", url)
                chave = (data.group(3), data.group(2), data.group(1)) if data else ("", "", "")
                if tipo not in out or chave > out[tipo][0]:
                    out[tipo] = (chave, url)
    return [u for _, u in out.values()]


def descarregar_e_converter(log=print, hoje=None, dias=60):
    urls = []
    for pagina in (PAGINA, "https://tuba.barcelos.pt/index.html"):
        try:
            urls = links_pdf(_get(pagina).decode("utf-8", "replace"))
            if len(urls) >= 2:
                break
        except Exception as err:  # noqa: BLE001
            log(f"  tuba_barcelos: página {pagina} falhou ({err})")
    if len(urls) < 2:
        log("  tuba_barcelos: ligações dos PDFs não encontradas na página; uso as últimas conhecidas")
        urls = PDFS_CONHECIDOS
    blocos = []
    for u in urls:
        log(f"  tuba_barcelos: {u}")
        blocos += ler_blocos(pdf_para_paginas(_get(u)))
    if len(blocos) < 40:
        raise ValueError(f"só {len(blocos)} linhas lidas nos PDFs (esperava ~60)")
    velho = ler_gtfs(_get(GTFS_BASE, timeout=180))
    corpo, rel = construir_gtfs(blocos, velho, hoje=hoje, dias=dias, log=log)
    if rel.get("viagens", 0) < 300:
        raise ValueError(f"só {rel.get('viagens')} viagens montadas")
    return corpo


def main(argv):
    """python3 tuba_barcelos.py urbanos.pdf municipais.pdf gtfs_antigo.zip saida.zip [AAAA-MM-DD]"""
    if len(argv) < 5:
        print(main.__doc__)
        return 2
    hoje = dt.date.fromisoformat(argv[5]) if len(argv) > 5 else dt.date.today()
    blocos = []
    for p in argv[1:3]:
        with open(p, "rb") as f:
            blocos += ler_blocos(pdf_para_paginas(f.read()))
    with open(argv[3], "rb") as f:
        velho = ler_gtfs(f.read())
    corpo, _ = construir_gtfs(blocos, velho, hoje=hoje)
    with open(argv[4], "wb") as f:
        f.write(corpo)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
