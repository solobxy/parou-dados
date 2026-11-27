# junta os adereços exportados (out/*.json) num ficheiro binário (props.bin) que o jogo carrega ao lado da página.
# Vértices únicos com índice; posição em 16 bits, normal em 8 bits, cor em 8 bits (raiz quadrada: os escuros não perdem degraus).
import json, glob, struct, math, hashlib
idx = {}; blob = bytearray(); total = 0
def al4():
    while len(blob) % 4: blob.append(0)
for f in sorted(glob.glob('out/*.json')):
    d = json.load(open(f)); parts = []
    for p in d['parts']:
        P, N, C = p['p'], p['n'], p['c']; n = len(P) // 3
        mn = [min(P[i::3]) for i in range(3)]; mx = [max(P[i::3]) for i in range(3)]
        q = lambda v, a, b: int(round((v - a) / ((b - a) or 1) * 65535)) - 32768
        sc = max(1.0, max(C)); key = {}; V = []; I = []
        for i in range(n):
            t = tuple(q(P[i * 3 + k], mn[k], mx[k]) for k in range(3)) + tuple(int(round(max(-1, min(1, N[i * 3 + k])) * 127)) for k in range(3)) + tuple(int(round(math.sqrt(max(0, min(1, C[i * 3 + k] / sc))) * 255)) for k in range(3))
            j = key.get(t)
            if j is None: j = key[t] = len(V); V.append(t)
            I.append(j)
        assert len(V) < 65536
        al4(); o = len(blob)
        blob += b''.join(struct.pack('<hhh', *v[:3]) for v in V); al4()
        blob += bytes(x & 255 for v in V for x in v[3:6]); blob += bytes(x for v in V for x in v[6:9]); al4()
        blob += struct.pack('<%dH' % len(I), *I)
        parts.append({'m': p['m'], 't': p['t'], 'n': n, 'v': len(V), 'a': [round(v, 4) for v in mn + mx], 's': round(sc, 3), 'o': o})
        total += n // 3
    idx[d['name']] = parts
import base64
h = hashlib.sha256(bytes(blob) + json.dumps(idx).encode()).hexdigest()[:10]
# vai como JSON (base64): o servidor dos artefactos só serve tipos conhecidos
open('props.json', 'w').write(json.dumps({'v': h, 'b': base64.b64encode(bytes(blob)).decode()}, separators=(',', ':')))
open('../src/propver.js', 'w').write("// gerado por props/gen.py: índice dos adereços (o ficheiro props.bin vai ao lado da página)\nexport const PROPV = '%s';\nexport const PROPIDX = %s;\n" % (h, json.dumps(idx, separators=(',', ':'))))
print('adereços:', len(idx), 'triângulos:', total, 'dados: %.0f KB' % (len(blob) / 1024))
