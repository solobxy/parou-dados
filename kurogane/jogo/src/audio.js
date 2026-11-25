// Sons: gravações reais (CC0) carregadas de sfx/ ao começar; até chegarem (ou se falharem) usa os sintetizados de sempre.
// Tiros e recargas: Free Firearm Sound Library (CC0). Passos, portas, impactos, zombies, chuva, motor e ambiente: packs CC0 da Kenney e do OpenGameArt.
let ctx = null, master = null, noiseBuf = null;
const BANK = 'abafado:0,ambiente:0,apanhar:2,cabeca:3,carne:4,chuva:0,construir:2,dor:4,explosao:3,ferrolho:0,grilos:0,longe-ak:0,longe-caca:0,longe-cacadeira:0,longe-grosso:0,longe-m4:0,longe-pistola:0,longe-revolver:0,longe-smg:0,madeira:4,morte:2,motor:3,pancada:2,pano:2,partir:3,passo-betao:5,passo-madeira:5,passo-relva:5,porta:3,portaF:3,recarregar-caca:0,recarregar-pistola:0,recarregar:0,ricochete:3,rocha:2,tiro-ak:0,tiro-caca:0,tiro-cacadeira:0,tiro-grosso:0,tiro-m4:0,tiro-pesado:0,tiro-pistola:0,tiro-revolver:0,tiro-smg:0,turbina:0,vazio:0,vento:0,vidro:2,zombie:12';
const B = {}; // nome -> [AudioBuffer]
// nomes antigos -> gravação, e o volume de cada uma (equilibrado à mão)
const ALIAS = { pistola: 'tiro-pistola', m4: 'tiro-m4', grosso: 'tiro-pesado', grunhido: 'zombie' };
const GAIN = { abafado: 0.9, apanhar: 0.45, cabeca: 0.8, carne: 0.75, construir: 0.6, dor: 0.6, explosao: 1.0, madeira: 0.7, morte: 0.6, pancada: 0.7, pano: 0.5, partir: 0.8, porta: 0.55, portaF: 0.6, recarregar: 0.55, 'recarregar-caca': 0.55, 'recarregar-pistola': 0.55, ferrolho: 0.55, ricochete: 0.35, rocha: 0.6, vazio: 0.6, vidro: 0.6, zombie: 0.7, 'passo-relva': 0.32, 'passo-betao': 0.3, 'passo-madeira': 0.32 };
export const audio = {
  on: false,
  // cria o contexto sem ligar os efeitos (a música do menu usa-o antes de se entrar no jogo)
  context() { try { this.init(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch (e) { return null; } },
  init() { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.wind(); } },
  start() {
    try {
      this.init();
      if (ctx.state === 'suspended') ctx.resume();
      this.on = true; this.loadBank();
    } catch (e) { this.on = false; }
  },
  vol(v) { if (master) master.gain.value = v; },
  // carrega as gravações (uma vez); cada uma fica pronta assim que chega
  loadBank(base = 'sfx/') { if (this._bl || !ctx) return; this._bl = 1;
    for (const e of BANK.split(',')) { const [k, n] = e.split(':'), N = +n; const files = N ? Array.from({ length: N }, (_, i) => k + '-' + i) : [k];
      files.forEach((f, i) => fetch(base + f + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(a => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no))).then(buf => { (B[k] || (B[k] = []))[i] = buf; }).catch(() => {})); } },
  count() { let n = 0; for (const k in B) n += B[k].filter(Boolean).length; return n; },
  has(name) { const k = ALIAS[name] || name, L = B[k]; return !!(L && L.some(Boolean)); },
  // toca uma gravação: variante ao calhas, tom um pouco diferente de cada vez; lp abafa (longe, dentro de casa)
  sample(name, v = 1, o = {}) { if (!this.on || !ctx || v < 0.01) return false; const k = ALIAS[name] || name, L = (B[k] || []).filter(Boolean); if (!L.length) return false;
    const t = ctx.currentTime + (o.at || 0), s = ctx.createBufferSource(); s.buffer = L[Math.floor(Math.random() * L.length)]; s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary ?? 0.08));
    const g = ctx.createGain(); g.gain.value = v * (GAIN[k] ?? 1); let n = s; if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; n.connect(f); n = f; }
    if (o.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan)); n.connect(pn); n = pn; } n.connect(g); g.connect(master); s.start(t); return true; },
  // laços (chuva, motor, ambiente): um por nome, só muda o volume e o tom
  loop(name, gain, rate = 1, lp = 0) { if (!this.on || !ctx) return null; let L = (this._lp || (this._lp = {}))[name];
    if (!L) { const buf = (B[name] || []).find(Boolean); if (!buf) return null; if (gain <= 0.001) return null; const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(ctx.currentTime, Math.random() * buf.duration); L = this._lp[name] = { s, f, g }; }
    const t = ctx.currentTime; L.g.gain.setTargetAtTime(Math.max(0, gain), t, 0.25); L.s.playbackRate.setTargetAtTime(rate, t, 0.12); L.f.frequency.setTargetAtTime(lp || 20000, t, 0.2); return L; },
  // tiro: gravação da arma (perto) ou a versão de longe, abafada com a distância
  shot(snd, v = 1, far = 0, o = {}) { const k = (far > 0.5 ? 'longe-' : 'tiro-') + snd; if (far > 0.5 && this.sample(k, v, { lp: 5200 - far * 3000, ...o })) return true; return this.sample('tiro-' + snd, v, { lp: far > 0.2 ? 9000 - far * 6000 : 0, ...o }); },
  // passo: relva, betão (estrada, passeio) ou madeira (dentro de casa)
  step(surf, v = 1) { this.sample('passo-' + surf, v, { vary: 0.12 }); },
  // ambiente: pássaros e insetos de dia, grilos à noite, vento por cima; dentro de casa mais baixo
  ambience(day, inside, wind = 0.3) { if (!this.on) return; const k = inside ? 0.35 : 1; this.loop('ambiente', 0.22 * day * k, 1, inside ? 1600 : 0); this.loop('grilos', 0.2 * (1 - day) * k, 1, inside ? 1400 : 0); this.loop('vento', (0.05 + 0.12 * wind) * k, 1, inside ? 500 : 900); },
  // chuva contínua: ruído filtrado em loop; dentro de casa fica abafada
  rain(level, inside) {
    if (!this.on || !ctx) return; const t = ctx.currentTime;
    if (this.loop('chuva', level * (inside ? 0.25 : 0.55), 1, inside ? 900 : 0)) return; // chuva gravada
    if (!this._rn) { const n = ctx.sampleRate * 2, buf = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let b0 = 0, b1 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + w * 0.15; b1 = 0.6 * b1 + w * 0.4; d[i] = (b0 + b1) * 0.5 + (Math.random() < 0.0015 ? (Math.random() - 0.5) * 1.6 : 0); } }
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5000; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); this._rn = { s, f, g }; }
    const R = this._rn; R.g.gain.setTargetAtTime(level * (inside ? 0.22 : 0.42), t, 0.6); R.f.frequency.setTargetAtTime(inside ? 900 : 5200, t, 0.4);
  },
  // motor do carro: dois osciladores filtrados; o tom sobe com a velocidade
  engine(on, sp, heli = 0) {
    if (!this.on || !ctx) return; const t = ctx.currentTime;
    if (heli) { const L = this.loop('turbina', on ? 0.32 + 0.12 * sp : 0, 0.75 + 0.35 * sp, 2600); this.rotor(on ? 0.5 + 0.25 * sp : 0, 4.2 + 3.4 * sp); this.loop('motor-0', 0); if (L) return; }
    else { this.rotor(0, 1); this.loop('turbina', 0); if (this.loop('motor-0', on ? 0.16 + 0.12 * sp : 0, 0.55 + 1.15 * sp, 1400 + 3000 * sp)) return; }
    if (!this._en) { if (!on) return; const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.2; f.connect(g); g.connect(master);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 38; o2.frequency.value = 19; const g2 = ctx.createGain(); g2.gain.value = 0.35; o1.connect(f); o2.connect(g2); g2.connect(f); o1.start(); o2.start(); this._en = { g, f, o1, o2 }; }
    const E = this._en; E.g.gain.setTargetAtTime(on ? 0.11 + 0.06 * sp : 0, t, 0.15); E.o1.frequency.setTargetAtTime(38 + 95 * sp, t, 0.12); E.o2.frequency.setTargetAtTime(19 + 47 * sp, t, 0.12); E.f.frequency.setTargetAtTime(380 + 900 * sp, t, 0.15);
  },
  // pás do rotor: o vento gravado cortado às batidas (como se ouve um helicóptero)
  rotor(level, hz) { if (!this.on || !ctx) return; let R = this._ro;
    if (!R) { if (level <= 0) return; const buf = (B.vento || [])[0]; if (!buf) return; const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2.5; const am = ctx.createGain(); am.gain.value = 0; const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = hz; const d = ctx.createGain(); d.gain.value = 0.9; lfo.connect(d); d.connect(am.gain); const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(am); am.connect(g); g.connect(master); s.start(); lfo.start(); R = this._ro = { g, lfo }; }
    const t = ctx.currentTime; R.g.gain.setTargetAtTime(level * 1.6, t, 0.3); R.lfo.frequency.setTargetAtTime(hz, t, 0.4); },
  thunder(v = 1) { if (!this.on || !ctx) return; const t = ctx.currentTime + 0.4 + Math.random() * 1.6; this.noise(t, 2.8, 380, 60, 0.7 * v); this.noise(t + 0.15, 2.2, 160, 40, 0.55 * v); this.tone(t, 1.8, 55, 30, 0.35 * v, 'sine'); },
  noise(t0, dur, f0, f1, g0, type = 'lowpass', q = 0.8, dest = master) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  },
  tone(t0, dur, f0, f1, g0, type = 'sine', dest = master) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(g0, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  play(name, v = 1) {
    if (!this.on || !ctx || v < 0.02) return; if (this.sample(name, v)) return; const t = ctx.currentTime;
    switch (name) {
      case 'pistola': this.noise(t, 0.28, 5200, 300, 0.9 * v); this.tone(t, 0.12, 180, 50, 0.6 * v, 'triangle'); break;
      case 'grosso': this.noise(t, 0.5, 3200, 140, 1.0 * v); this.tone(t, 0.28, 90, 28, 0.9 * v, 'triangle'); this.noise(t + 0.03, 0.9, 900, 60, 0.35 * v); break;
      case 'm4': this.noise(t, 0.2, 6500, 400, 0.75 * v); this.tone(t, 0.09, 140, 45, 0.55 * v, 'triangle'); break;
      case 'vazio': this.tone(t, 0.03, 1800, 1200, 0.25 * v, 'square'); break;
      case 'recarregar': this.tone(t, 0.04, 900, 600, 0.2 * v, 'square'); this.tone(t + 0.5, 0.05, 700, 500, 0.25 * v, 'square'); this.noise(t + 0.9, 0.08, 3000, 1500, 0.3 * v, 'bandpass', 2); break;
      case 'swing': this.noise(t, 0.18, 900, 2600, 0.35 * v, 'bandpass', 1.2); break;
      case 'carne': this.noise(t, 0.12, 900, 200, 0.7 * v); this.tone(t, 0.1, 120, 60, 0.4 * v); break;
      case 'madeira': this.tone(t, 0.09, 420, 200, 0.5 * v, 'triangle'); this.noise(t, 0.08, 2400, 800, 0.4 * v, 'bandpass', 3); break;
      case 'rocha': this.tone(t, 0.05, 1600, 900, 0.3 * v, 'square'); this.noise(t, 0.1, 5000, 2000, 0.45 * v, 'highpass', 1); break;
      case 'apanhar': this.tone(t, 0.05, 700, 900, 0.15 * v, 'triangle'); this.tone(t + 0.05, 0.06, 1000, 1200, 0.12 * v, 'triangle'); break;
      case 'ui': this.tone(t, 0.03, 1100, 900, 0.08 * v, 'triangle'); break;
      case 'dor': this.noise(t, 0.2, 700, 250, 0.5 * v); this.tone(t, 0.18, 260, 140, 0.25 * v, 'sawtooth'); break;
      case 'grunhido': { const f = 70 + Math.random() * 50; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.3), t + 0.9); const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 500 + Math.random() * 300; fl.Q.value = 4; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22 * v, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.0); o.connect(fl); fl.connect(g); g.connect(master); o.start(t); o.stop(t + 1.05); break; }
      case 'comer': for (let i = 0; i < 3; i++) this.noise(t + i * 0.22, 0.08, 1400, 600, 0.2 * v, 'bandpass', 2); break;
      case 'construir': this.tone(t, 0.07, 300, 160, 0.4 * v, 'triangle'); this.noise(t, 0.09, 2600, 900, 0.35 * v, 'bandpass', 2.5); this.tone(t + 0.16, 0.07, 280, 150, 0.35 * v, 'triangle'); this.noise(t + 0.16, 0.08, 2400, 800, 0.3 * v, 'bandpass', 2.5); break;
      case 'partir': this.noise(t, 0.35, 1800, 300, 0.55 * v); this.tone(t, 0.25, 160, 60, 0.35 * v, 'sawtooth'); break;
      case 'fogo': this.noise(t, 0.6, 900, 300, 0.25 * v, 'bandpass', 0.8); this.noise(t + 0.1, 0.5, 2500, 900, 0.12 * v, 'highpass', 1); break;
      case 'explosao': this.noise(t, 1.4, 1400, 60, 1.0 * v); this.tone(t, 0.9, 90, 28, 0.9 * v, 'sine'); this.noise(t + 0.05, 0.4, 5000, 800, 0.4 * v, 'highpass', 1); break;
      case 'bip': this.tone(t, 0.06, 1900, 1900, 0.18 * v, 'square'); break;
      case 'porta': this.tone(t, 0.32, 210, 150, 0.12 * v, 'triangle'); this.noise(t, 0.28, 700, 300, 0.12 * v, 'bandpass', 3); this.noise(t + 0.02, 0.06, 2200, 1200, 0.08 * v, 'bandpass', 4); break;
      case 'portaF': this.noise(t, 0.1, 500, 120, 0.45 * v); this.tone(t, 0.09, 120, 60, 0.35 * v, 'triangle'); this.noise(t + 0.03, 0.05, 2600, 1600, 0.12 * v, 'bandpass', 4); break;
      case 'cabeca': this.noise(t, 0.09, 1600, 300, 0.75 * v); this.tone(t, 0.07, 160, 60, 0.5 * v, 'triangle'); this.noise(t + 0.03, 0.12, 700, 200, 0.4 * v); break;
      case 'ricochete': this.tone(t, 0.18, 3400, 1800, 0.18 * v, 'sine'); this.noise(t, 0.05, 5200, 3000, 0.3 * v, 'highpass', 1); break;
      case 'abafado': this.noise(t, 0.11, 1400, 300, 0.5 * v); this.tone(t, 0.06, 200, 80, 0.32 * v, 'triangle'); this.noise(t + 0.01, 0.03, 4200, 2400, 0.12 * v, 'bandpass', 2); break;
      case 'vidro': this.tone(t, 0.08, 3200, 2600, 0.12 * v, 'sine'); break;
      case 'morte': this.tone(t, 1.2, 220, 55, 0.4 * v, 'sawtooth'); this.noise(t, 1.0, 600, 100, 0.3 * v); break;
    }
  },
  wind() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; const g = ctx.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(master); s.start(); const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); },
};
