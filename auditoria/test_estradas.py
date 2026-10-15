#!/usr/bin/env python3
"""Testa a lógica do gerador de desenhos pelo mapa (auditoria/estradas.py) com um OSRM de mentira: leitura das respostas do «match»
(paragens que casam, que não casam, troços divididos), voltas absurdas e a escolha de não inventar caminhos.
Uso: python auditoria/test_estradas.py   (a partir da raiz do repositório; falha com exit 1)"""
import os, sys
sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.join(os.getcwd(), "auditoria"))
import estradas as es
from construir_dados import codificar_polilinha

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

# Linha reta de 6 paragens a ~700 m umas das outras, ao longo de um paralelo
LAT, LON0 = 41.15, -8.60
def ponto(i): return (LAT, LON0 + i * 0.0083)      # 0,0083° de longitude ≈ 700 m
PARAGENS = [ponto(i) for i in range(6)]
NOMES = [f"P{i}" for i in range(6)]

def tp(i, m, w):
    return {"matchings_index": m, "waypoint_index": w, "location": [PARAGENS[i][1], PARAGENS[i][0]], "distance": 8.0}

def matching(indices, extra_m=1.0):
    """Um troço do match que passa pelas paragens `indices` (em ordem), com pernas de ~700 m × extra_m."""
    pts = [PARAGENS[i] for i in indices]
    pernas = [{"distance": es.haversine(PARAGENS[a], PARAGENS[b]) * extra_m} for a, b in zip(indices, indices[1:])]
    return {"geometry": codificar_polilinha(pts, 6), "legs": pernas}

chamadas = []
def falso(respostas):
    """Substitui o pedido ao OSRM por respostas combinadas, pela ordem; guarda os pontos pedidos."""
    fila = list(respostas)
    def f(base, pontos, sigma=None):
        chamadas.append(list(pontos))
        return fila.pop(0)
    return f

# --- 1. tudo casa: todos os pares bons, desenho passa por todas as paragens
es.osrm_match = falso([{"code": "Ok", "matchings": [matching(range(6))], "tracepoints": [tp(i, 0, i) for i in range(6)]}])
ev = []
r = es.desenhar_por_match("x", PARAGENS, NOMES, ev)
ok("[match] tudo casa: devolve desenho", r is not None)
ok("[match] tudo casa: todos os pares bons (fração 1)", r and abs(r[1] - 1.0) < 1e-9, str(r and r[1]))
ok("[match] tudo casa: sem eventos", ev == [], str(ev))
ok("[match] tudo casa: razão ≈ 1", r and 0.99 < r[2] < 1.01, str(r and r[2]))

# --- 2. uma paragem no meio não casa (fora de qualquer carril): os dois pares à volta ficam por casar, o desenho liga as vizinhas
tps = [tp(0, 0, 0), tp(1, 0, 1), None, tp(3, 0, 2), tp(4, 0, 3), tp(5, 0, 4)]
es.osrm_match = falso([{"code": "Ok", "matchings": [matching([0, 1, 3, 4, 5])], "tracepoints": tps}])
ev = []
r = es.desenhar_por_match("x", PARAGENS, NOMES, ev)
ok("[match] paragem sem carril: pares 1-2 e 2-3 não contam (3 de 5 bons)", r and abs(r[1] - 3 / 5) < 1e-9, str(r and r[1]))
ok("[match] paragem sem carril: o evento diz qual paragem", any(e.get("tipo") == "sem_match" and e.get("paragem") == "P2" for e in ev), str(ev))

# --- 3. o match parte-se em dois troços (não há ligação): par do meio fica a direito, os outros dois lados ficam bons
tps = [tp(0, 0, 0), tp(1, 0, 1), tp(2, 0, 2), tp(3, 1, 0), tp(4, 1, 1), tp(5, 1, 2)]
es.osrm_match = falso([{"code": "Ok", "matchings": [matching([0, 1, 2]), matching([3, 4, 5])], "tracepoints": tps}])
ev = []
r = es.desenhar_por_match("x", PARAGENS, NOMES, ev)
ok("[match] dois troços: o par que os liga não conta (4 de 5 bons)", r and abs(r[1] - 4 / 5) < 1e-9, str(r and r[1]))
ok("[match] dois troços: o desenho tem os dois troços, um a seguir ao outro", r and len(es.descodificar_polilinha(r[0], 6)) >= 2)

# --- 4. volta absurda numa perna: parte-se aí e volta a pedir cada lado (a perna absurda fica a direito)
tp_todos = [tp(i, 0, i) for i in range(6)]
m_absurdo = matching(range(6))
m_absurdo["legs"][2]["distance"] = es.haversine(PARAGENS[2], PARAGENS[3]) * 9      # 6 km em vez de 700 m
chamadas.clear()
es.osrm_match = falso([
    {"code": "Ok", "matchings": [m_absurdo], "tracepoints": tp_todos},
    {"code": "Ok", "matchings": [matching([0, 1, 2])], "tracepoints": [tp(0, 0, 0), tp(1, 0, 1), tp(2, 0, 2)]},
    {"code": "Ok", "matchings": [matching([3, 4, 5])], "tracepoints": [tp(3, 0, 0), tp(4, 0, 1), tp(5, 0, 2)]},
])
ev = []
r = es.desenhar_por_match("x", PARAGENS, NOMES, ev)
ok("[match] volta absurda: o par absurdo não conta (4 de 5 bons)", r and abs(r[1] - 4 / 5) < 1e-9, str(r and r[1]))
ok("[match] volta absurda: pede de novo cada lado", len(chamadas) == 3 and len(chamadas[1]) == 3 and len(chamadas[2]) == 3, str([len(c) for c in chamadas]))
ok("[match] volta absurda: registado com as duas paragens", any(e.get("tipo") == "volta_absurda" and e.get("de") == "P2" and e.get("para") == "P3" for e in ev), str(ev))
ok("[match] volta absurda: o desenho final não leva os 6 km (razão perto de 1)", r and r[2] < 1.2, str(r and r[2]))

# --- 5. perna um pouco mais comprida que a reta (esquinas) não é absurda
es.osrm_match = falso([{"code": "Ok", "matchings": [matching(range(6), 1.35)], "tracepoints": [tp(i, 0, i) for i in range(6)]}])
ev = []
r = es.desenhar_por_match("x", PARAGENS, NOMES, ev)
ok("[match] esquinas (35% mais compridas que a reta) são aceites", r and r[1] == 1.0 and ev == [], str(ev))

# --- 6. nada casa: sem desenho (nunca se inventa)
es.osrm_match = falso([{"code": "NoMatch", "message": "nada"}])
ev = []
r = es.desenhar_por_match("x", PARAGENS, NOMES, ev)
ok("[match] nada casa: sem desenho", r is None)
ok("[match] nada casa: fica registado", any(e.get("tipo") == "sem_match" for e in ev), str(ev))

# --- 7. quase nada casa (menos de 60% dos pares): sem desenho
tps = [tp(0, 0, 0), tp(1, 0, 1), None, None, None, None]
es.osrm_match = falso([{"code": "Ok", "matchings": [matching([0, 1])], "tracepoints": tps}])
r = es.desenhar_por_match("x", PARAGENS, NOMES, [])
ok("[match] só 1 de 5 pares casa: sem desenho (abaixo de 60%)", r is None, str(r and r[1]))

# --- 8. métrica: paragens perto do desenho
linha = [(LAT, LON0), (LAT, LON0 + 0.0083 * 5)]
ok("[métrica] paragens em cima do desenho: todas encaixam", es.fracao_encaixada(linha, PARAGENS, 80) == 1.0)
longe = [(LAT + 0.01, LON0 + i * 0.0083) for i in range(6)]          # ~1,1 km ao lado
ok("[métrica] paragens a 1 km do desenho: nenhuma encaixa", es.fracao_encaixada(linha, longe, 80) == 0.0)

print()
if falhas:
    print(f"{falhas} testes falharam")
    sys.exit(1)
print("O gerador de desenhos lê bem as respostas do mapa.")
