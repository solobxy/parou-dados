// Sons sintetizados (sem ficheiros): tiros, golpes, zombies, vento.
let ctx = null, master = null, noiseBuf = null;
export const audio = {
  on: false,
  // cria o contexto sem ligar os efeitos (a música do menu usa-o antes de se entrar no jogo)
  context() { try { this.init(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch (e) { return null; } },
  init() { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.wind(); } },
  start() {
    try {
      this.init();
      if (ctx.state === 'suspended') ctx.resume();
      this.on = true;
    } catch (e) { this.on = false; }
  },
  vol(v) { if (master) master.gain.value = v; },
  // chuva contínua: ruído filtrado em loop; dentro de casa fica abafada
  rain(level, inside) {
    if (!this.on || !ctx) return; const t = ctx.currentTime;
    if (!this._rn) { const n = ctx.sampleRate * 2, buf = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let b0 = 0, b1 = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + w * 0.15; b1 = 0.6 * b1 + w * 0.4; d[i] = (b0 + b1) * 0.5 + (Math.random() < 0.0015 ? (Math.random() - 0.5) * 1.6 : 0); } }
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5000; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); this._rn = { s, f, g }; }
    const R = this._rn; R.g.gain.setTargetAtTime(level * (inside ? 0.22 : 0.42), t, 0.6); R.f.frequency.setTargetAtTime(inside ? 900 : 5200, t, 0.4);
  },
  // motor do carro: dois osciladores filtrados; o tom sobe com a velocidade
  engine(on, sp) {
    if (!this.on || !ctx) return; const t = ctx.currentTime;
    if (!this._en) { if (!on) return; const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.2; f.connect(g); g.connect(master);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 38; o2.frequency.value = 19; const g2 = ctx.createGain(); g2.gain.value = 0.35; o1.connect(f); o2.connect(g2); g2.connect(f); o1.start(); o2.start(); this._en = { g, f, o1, o2 }; }
    const E = this._en; E.g.gain.setTargetAtTime(on ? 0.11 + 0.06 * sp : 0, t, 0.15); E.o1.frequency.setTargetAtTime(38 + 95 * sp, t, 0.12); E.o2.frequency.setTargetAtTime(19 + 47 * sp, t, 0.12); E.f.frequency.setTargetAtTime(380 + 900 * sp, t, 0.15);
  },
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
    if (!this.on || !ctx || v < 0.02) return; const t = ctx.currentTime;
    switch (name) {
      case 'pistola': this.noise(t, 0.28, 5200, 300, 0.9 * v); this.tone(t, 0.12, 180, 50, 0.6 * v, 'triangle'); break;
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
