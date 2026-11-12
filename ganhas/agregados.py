"""ganhas.pt: regras únicas para mostrar números das partilhas (usadas pela API e pelas páginas geradas no servidor).

- Nenhum número com menos de K = 5 pessoas diferentes (por ligação do dia e por dispositivo).
- Valores arredondados a 50 € enquanto houver menos de 10 pessoas e à dezena a partir daí: com poucas pessoas,
  a mediana e os quartis caem em cima de valores de alguém, e o arredondamento largo impede que se leia esse valor.
- Supressão complementar: um subconjunto (profissão num distrito, profissão numa empresa) só aparece se o resto do
  conjunto maior também tiver 0 ou pelo menos K pessoas. Assim não se chega a uma ou duas pessoas por diferença
  entre dois números publicados.
"""
import math

K = 5


def passo(n):
    return 50 if n < 10 else 10


def arred(v, p=10):
    return int(round(v / p) * p) if v is not None else None


def quantil(ordenados, q):
    if not ordenados:
        return None
    pos = (len(ordenados) - 1) * q
    a, b = math.floor(pos), math.ceil(pos)
    return ordenados[a] + (ordenados[b] - ordenados[a]) * (pos - a)


def pessoas(linhas):
    """linhas: [(valor, ip_dia, dispositivo)]. Conta pelo mais baixo dos dois (quem muda de rede ou de navegador conta uma vez)."""
    return min(len({(r[1], r[2]) for r in linhas}), len({r[1] for r in linhas}))


def resumo(linhas):
    n = pessoas(linhas)
    if n < K:
        return {'n': n, 'faltam': K - n}
    v = sorted(r[0] for r in linhas)
    p = passo(n)
    return {'n': n, 'p25': arred(quantil(v, .25), p), 'mediana': arred(quantil(v, .5), p), 'p75': arred(quantil(v, .75), p), 'passo': p}


def pode_mostrar(sub, *pais):
    """sub e cada pai: listas de linhas com uma chave única na 4.ª posição (id da partilha).
    True se o subconjunto tem K pessoas e, para cada conjunto maior, o resto tem 0 ou pelo menos K pessoas."""
    if pessoas(sub) < K:
        return False
    ids = {r[3] for r in sub}
    for pai in pais:
        resto = [r for r in pai if r[3] not in ids]
        if resto and pessoas(resto) < K:
            return False
    return True


def euro(v):
    return f'{v:,.0f}'.replace(',', '.') + ' €'


def nota_arredondamento(p):
    return 'arredondados a 50 €' if p == 50 else 'arredondados à dezena'
