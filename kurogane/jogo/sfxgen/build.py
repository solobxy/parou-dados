# Sons do jogo a partir de gravações reais (todas CC0): cortar, normalizar e gravar em mp3 pequeno, mono
# Fontes: Free Firearm Sound Library (Ben Jaszczak et al., CC0) e packs CC0 do OpenGameArt e da Kenney (via atomcut-library)
import os, subprocess, json, sys
import numpy as np
SR = 44100
FF = os.environ.get('KG_FF', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fontes', 'freefirearms'))
AC = os.environ.get('KG_AC', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fontes', 'atomcut'))
KN = os.environ.get('KG_KN', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fontes', 'kenney'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'sites', 'kurogane', 'sfx'); os.makedirs(OUT, exist_ok=True)

def load(p):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()

def env(x, w=441):
    a = np.abs(x); k = np.ones(w) / w; return np.convolve(a, k, 'same')

def event(x, n=0, rel=0.08, tail_db=-42, minlen=0.05, maxlen=2.5, pre=0.004):
    """n-ésimo acontecimento (tiro, clique) de uma faixa com vários: do ataque até o som cair tail_db abaixo do pico"""
    e = env(x); pk = e.max(); on = e > pk * rel; idx = []; i = 0; L = len(x)
    while i < L:
        if on[i]:
            j = i; peak = e[i]
            # fim: quando fica abaixo do limite durante 120 ms
            thr = None; k = i; quiet = 0
            while k < L:
                peak = max(peak, e[k]); thr = peak * 10 ** (tail_db / 20)
                if e[k] < thr: quiet += 1
                else: quiet = 0
                if quiet > SR * 0.12 or k - i > SR * maxlen: break
                k += 1
            idx.append((max(0, i - int(pre * SR)), k)); i = k + int(SR * 0.05)
        else: i += 1
    idx = [s for s in idx if s[1] - s[0] > minlen * SR]
    if not idx: return x[:int(SR * maxlen)]
    s, t = idx[min(n, len(idx) - 1)]; return x[s:t]

def fin(x, peak=0.9, fade=0.03, lp=None):
    x = x.astype(np.float32); m = np.abs(x).max() or 1; x = x / m * peak
    f = int(fade * SR);
    if f and len(x) > f: x[-f:] *= np.linspace(1, 0, f)
    x[:64] *= np.linspace(0, 1, 64)
    return x

def loopify(x, secs, xf=0.6):
    """laço sem estalido: corta secs e mistura o fim no início"""
    n = int(secs * SR); f = min(int(xf * SR), n // 2); x = x[:n + f]
    if len(x) < n + f: return x
    a = x[:n].copy(); r = np.linspace(0, 1, f); a[:f] = a[:f] * r + x[n:n + f] * (1 - r); return a

def save(x, name, br=64, sr=SR, filt=None):
    raw = (np.clip(x, -1, 1)).astype(np.float32).tobytes(); p = os.path.join(OUT, name + '.mp3')
    af = ['-af', filt] if filt else []
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', *af, '-ar', str(sr), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', f'{br}k', p], input=raw, check=True)
    print(name, round(len(x) / SR, 2), 's', os.path.getsize(p) // 1024, 'KB')

def ff(gun, f): return os.path.join(FF, gun, f)
P = lambda g, f: ff(os.path.join('Prepared SFX', g), f)
M = lambda g, f: ff(os.path.join('Master Tracks', g), f)
def ac(pack, f): return os.path.join(AC, pack, 'audio', f)

# ---------- tiros: perto (o teu e os de quem está perto) e longe (com reverberação da distância)
GUNS = { 'pistola': ('Walther PPQ', 'X_39P.wav', 'X_31P.wav'), 'revolver': ('Smith & Wesson 642', 'V_27P.wav', 'V_22P.wav'), 'smg': ('Carl Gustav M45', 'G_31P.wav', 'G_20P.wav'),
  'm4': ('AR-15', 'D_32P.wav', 'D_24P.wav'), 'ak': ('AK-47', 'C_28P.wav', 'C_31P.wav'), 'cacadeira': ('Nova', 'O_21P.wav', 'O_17P.wav'), 'caca': ('Tikka', 'W_29P.wav', 'W_24P.wav'), 'grosso': ('Mosin Nagant', 'M_21P.wav', 'M_26P.wav') }
def job_guns():
    for k, (g, near, mid) in GUNS.items():
        x = event(load(P(g, near)), maxlen=1.4); save(fin(x, 0.95), 'tiro-' + k, 80)
        y = event(load(P(g, mid)), maxlen=2.2, tail_db=-36); save(fin(y, 0.8, 0.2), 'longe-' + k, 48, 22050, 'lowpass=f=3200')
    # .50 e .408: a Mosin mais grave e mais comprida
    x = load(P('Mosin Nagant', 'M_21P.wav')); x = event(x, maxlen=1.8); save(fin(x, 0.95), 'tiro-pesado', 80, SR, 'asetrate=44100*0.8,aresample=44100,bass=g=4')
    save(fin(event(load(M('Walther PPQ', 'X_29.wav')), maxlen=0.6), 0.75), 'abafado', 64)
    save(fin(event(load(M('1911', 'A_19.wav')), maxlen=0.4)), 'vazio', 48)
# ---------- recarregar: tirar carregador, meter, puxar a culatra (gravações da AR-15, da 1911 e da Nova)
def seq(parts, total):
    out = np.zeros(int(total * SR), np.float32)
    for x, at, g in parts: s = int(at * SR); n = min(len(x), len(out) - s); out[s:s + n] += x[:n] * g
    return out
def job_reload():
    d3, d4, d7 = (event(load(M('AR-15', f)), maxlen=0.8) for f in ('D_3.wav', 'D_4.wav', 'D_7.wav'))
    save(fin(seq([(fin(d3), 0.05, 0.8), (fin(d4), 0.75, 1.0), (fin(d7), 1.45, 0.9)], 2.0), 0.85), 'recarregar', 64)
    a3, a4, a10 = (event(load(M('1911', f)), maxlen=0.8) for f in ('A_3.wav', 'A_4.wav', 'A_10.wav'))
    save(fin(seq([(fin(a3), 0.05, 0.8), (fin(a4), 0.6, 1.0), (fin(a10), 1.15, 0.9)], 1.6), 0.85), 'recarregar-pistola', 64)
    o7, o6 = event(load(M('Nova', 'O_7.wav')), maxlen=0.7), event(load(M('Nova', 'O_6.wav')), maxlen=1.0)
    save(fin(seq([(fin(o7), 0.05, 0.9), (fin(o7), 0.55, 0.9), (fin(o6), 1.1, 1.0)], 1.9), 0.85), 'recarregar-caca', 64)
    save(fin(event(load(M('Tikka', 'W_14.wav')), maxlen=1.2)), 'ferrolho', 64)
# ---------- corpo a corpo, impactos, zombies, pessoas
def many(pack, files, name, n=None, maxlen=1.5, peak=0.85, br=56, sr=SR, tail=-40, filt=None):
    for i, f in enumerate(files[:n] if n else files):
        try: save(fin(event(load(ac(pack, f)), maxlen=maxlen, tail_db=tail), peak), f'{name}-{i}', br, sr, filt)
        except Exception as e: print('falhou', pack, f, e)
def job_misc():
    many('opengameart-37-hitspunches', ['hit03-mp3.m4a', 'hit07-mp3.m4a', 'hit12-mp3.m4a', 'hit21-mp3.m4a'], 'carne')
    many('opengameart-8-wet-squish-slurp-impacts', ['impactsplat01-mp3.m4a', 'impactsplat03-mp3.m4a', 'impactsplat05-mp3.m4a'], 'cabeca')
    many('opengameart-zombies-sound-pack', [f'zombie-{i}.m4a' for i in (1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23)], 'zombie', maxlen=2.4, br=48, sr=22050)
    many('opengameart-hurt-death-sound-effect-for-character', ['2.m4a', '5.m4a', '8.m4a', '11.m4a'], 'dor', maxlen=1.0)
    many('opengameart-hurt-death-sound-effect-for-character', ['15.m4a', '18.m4a'], 'morte', maxlen=2.2)
    many('opengameart-25-cc0-bang-firework-sfx', ['bang-03.m4a', 'bang-07.m4a', 'cannon-02.m4a'], 'explosao', maxlen=3.0, peak=0.95, br=64, tail=-46)
    many('opengameart-door-open-door-close-set', ['qubodup-door-open01.m4a', 'qubodup-door-open04.m4a', 'qubodup-door-open07.m4a'], 'porta', maxlen=1.6)
    many('opengameart-door-open-door-close-set', ['qubodup-door-close02.m4a', 'qubodup-door-close05.m4a', 'qubodup-door-close08.m4a'], 'portaF', maxlen=1.2)
    many('opengameart-100-cc0-sfx', ['glass-01.m4a', 'glass-03.m4a'], 'vidro', maxlen=1.5)
    many('opengameart-100-cc0-sfx', ['metal-02.m4a', 'metal-05.m4a', 'metal-09.m4a'], 'ricochete', maxlen=0.6, peak=0.6)
    many('opengameart-20-rustles-dry-leaves', ['rustle03.m4a', 'rustle09.m4a'], 'apanhar', maxlen=0.5, peak=0.6, br=48, sr=22050)
    many('kenney-impact-sounds', ['impact-plank-medium-000.m4a', 'impact-plank-medium-001.m4a', 'impact-plank-medium-002.m4a'], 'madeira', maxlen=0.6)
    many('kenney-impact-sounds', ['impact-punch-heavy-000.m4a', 'impact-punch-heavy-001.m4a'], 'pancada', maxlen=0.6)
    many('kenney-impact-sounds', ['impact-metal-heavy-000.m4a', 'impact-metal-heavy-001.m4a', 'impact-metal-heavy-002.m4a'], 'partir', maxlen=1.0)
    many('kenney-impact-sounds', ['impact-generic-light-000.m4a', 'impact-generic-light-001.m4a'], 'construir', maxlen=0.5)
    many('opengameart-100-cc0-sfx', ['hit-01.m4a', 'hit-03.m4a'], 'rocha', maxlen=0.6)
    for i, f in enumerate(['cloth1.ogg', 'cloth3.ogg']): save(fin(event(load(os.path.join(KN, 'Audio (295 files)', 'RPG sounds (50 sounds)', f)), maxlen=0.6), 0.6), f'pano-{i}', 48, 22050)
    save(fin(event(load(os.path.join(KN, 'Audio (295 files)', 'RPG sounds (50 sounds)', 'chop.ogg')), maxlen=0.6)), 'madeira-3', 56)
# ---------- passos: relva, betão/estrada, madeira, gravilha
def job_steps():
    many('kenney-impact-sounds', [f'footstep-grass-00{i}.m4a' for i in range(5)], 'passo-relva', maxlen=0.4, peak=0.7, br=40, sr=22050)
    many('kenney-impact-sounds', [f'footstep-concrete-00{i}.m4a' for i in range(5)], 'passo-betao', maxlen=0.4, peak=0.7, br=40, sr=22050)
    many('kenney-impact-sounds', [f'footstep-wood-00{i}.m4a' for i in range(5)], 'passo-madeira', maxlen=0.4, peak=0.7, br=40, sr=22050)
# ---------- laços: chuva, motor, ambiente de dia e de noite (grilos), vento, rotor do helicóptero
def job_loops():
    whole = lambda pack, f: fin(load(ac(pack, f)), 0.8, 0)  # já são laços feitos para repetir
    save(whole('opengameart-30-cc0-sfx-loops', 'rain.m4a'), 'chuva', 56, 22050)
    for i, f in enumerate(['loop-0.m4a', 'loop-2-0.m4a', 'loop-4-0.m4a']): save(whole('opengameart-racing-car-engine-sound-loops', f), f'motor-{i}', 80)
    x = load(ac('opengameart-swamp-environment-audio', 'cricket-1.m4a')); save(fin(loopify(x, 12), 0.6, 0), 'grilos', 48, 22050)
    x = load(ac('opengameart-swamp-environment-audio', 'atmosphere-2.m4a')); save(fin(loopify(x, 20), 0.6, 0), 'ambiente', 48, 22050)
    save(whole('opengameart-30-cc0-sfx-loops', 'noise-02.m4a'), 'vento', 48, 22050, 'lowpass=f=900')
    save(whole('opengameart-30-cc0-sfx-loops', 'machine-03.m4a'), 'turbina', 64)

for j in (sys.argv[1:] or ['guns', 'reload', 'misc', 'steps', 'loops']): globals()['job_' + j]()
