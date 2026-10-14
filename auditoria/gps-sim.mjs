// Simulação: autocarro com ruído de GPS realista. Compara: leitura crua, filtro antigo, filtro novo.
// Uso: node --experimental-strip-types auditoria/gps-sim.mjs   (FILTRO=caminho do filtroGps.ts; por omissão a app ao lado)
const { FiltroGps, Deslizador } = await import(process.env.FILTRO || '../app/src/utils/filtroGps.ts');

// Gerador pseudo-aleatório com semente
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const LAT0 = 41.15, LON0 = -8.61, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const toLL = (x, y) => ({ lat: LAT0 + y / M, lon: LON0 + x / (M * COS) });

// Trajetória verdadeira a 10 Hz: [tempo, x, y, vx, vy]
function trajeto() {
  const dt = 0.1, pts = [];
  let x = 0, y = 0, h = 0.4 /* rad desde o norte */, v = 0, t = 0;
  // plano: [duração, aceleração alvo/velocidade alvo, taxa de viragem rad/s]
  const plano = [
    [25, 0, 0],            // parado na paragem
    [10, 1.2, 0],          // arranca
    [40, 0, 0],            // cruzeiro a ~12 m/s
    [6, 0, 0.26],          // curva de 90º
    [30, 0, 0],            // reta
    [8, -1.4, 0],          // trava
    [20, 0, 0],            // semáforo parado
    [10, 1.3, 0],
    [50, 0, 0],
    [6, 0, -0.26],
    [40, 0, 0],
    [9, -1.3, 0],
    [25, 0, 0],            // paragem
    [12, 1.1, 0],
    [60, 0, 0],
  ];
  for (const [dur, acc, w] of plano) {
    for (let i = 0; i < dur / dt; i++) {
      v = Math.max(0, Math.min(13, v + acc * dt));
      h += w * dt;
      x += v * Math.sin(h) * dt; y += v * Math.cos(h) * dt;
      t += dt;
      pts.push({ t, x, y, vx: v * Math.sin(h), vy: v * Math.cos(h), v, h });
    }
  }
  return pts;
}

function verdade(pts, t) { // interpolação linear
  const i = Math.min(pts.length - 1, Math.max(0, Math.round(t / 0.1) - 1));
  return pts[i];
}

// Filtro antigo (o que estava na app)
function metros(a, b, c, d) { return Math.hypot((d - b) * M * Math.cos(a * Math.PI / 180), (c - a) * M); }
function filtroAntigo(prev, lat, lon, acc, t, velMs) {
  const medida = Math.max(acc, 3), v2 = medida * medida;
  if (!prev) return { lat, lon, variancia: v2, t };
  if (t <= prev.t) return prev;
  const dt = (t - prev.t) / 1000;
  const d = metros(prev.lat, prev.lon, lat, lon);
  if (dt > 30 || d > Math.max(60, 4 * (medida + Math.sqrt(prev.variancia)))) return { lat, lon, variancia: v2, t };
  const vel = velMs !== null && Number.isFinite(velMs) ? velMs : d / Math.max(dt, 1);
  const q = Math.min(30, Math.max(3, vel * 1.5 + 2));
  const variancia = prev.variancia + dt * q * q;
  const k = variancia / (variancia + v2);
  return { lat: prev.lat + (lat - prev.lat) * k, lon: prev.lon + (lon - prev.lon) * k, variancia: (1 - k) * variancia, t };
}

function cenario(semente, { ruido = 1, saltos = 1, tunel = false, semDoppler = false } = {}) {
  const r = rng(semente);
  const pts = trajeto();
  const T = pts[pts.length - 1].t;
  // leituras a 1 Hz com erro correlacionado (multipath), saltos e atraso
  let bx = 0, by = 0, saltoRest = 0, sx = 0, sy = 0;
  const leituras = [];
  for (let t = 1; t < T - 2; t += 1) {
    const f = Math.exp(-1 / 25);
    bx = f * bx + Math.sqrt(1 - f * f) * 5 * ruido * gauss(r);
    by = f * by + Math.sqrt(1 - f * f) * 5 * ruido * gauss(r);
    if (saltoRest <= 0 && r() < 0.012 * saltos) { saltoRest = 2 + Math.floor(r() * 3); const ang = r() * 6.283, mag = 40 + r() * 60; sx = Math.cos(ang) * mag; sy = Math.sin(ang) * mag; }
    let ex = bx + 2.5 * ruido * gauss(r), ey = by + 2.5 * ruido * gauss(r);
    let accRep = 5 + Math.abs(gauss(r)) * 4;
    if (saltoRest > 0) { ex += sx; ey += sy; saltoRest--; if (r() < 0.5) accRep = 8 + r() * 30; }
    const p = verdade(pts, t);
    if (tunel && t >= 70 && t < 95) { ex = (r() - 0.5) * 900; ey = (r() - 0.5) * 900; accRep = 300 + r() * 500; }
    const llm = toLL(p.x + ex, p.y + ey);
    const atraso = 0.4 + r() * 0.9;
    const v = Math.max(0, p.v + 0.35 * gauss(r));
    const velOk = !semDoppler && r() > 0.03;
    leituras.push({
      tFix: t, chegada: t + atraso, lat: llm.lat, lon: llm.lon, acc: Math.round(accRep), x: p.x, y: p.y,
      velocidade: velOk ? v : null, rumo: velOk && v >= 0.5 ? ((p.h * 180 / Math.PI + 3 * gauss(r)) % 360 + 360) % 360 : null,
    });
  }
  return { pts, leituras, T };
}

const rmse = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };

function correr(semente, opcoes) {
  const { pts, leituras, T } = cenario(semente, opcoes);
  const t0 = 1_700_000_000_000; // época arbitrária
  const novo = new FiltroGps();
  if (process.env.AJ) Object.assign(novo.ajustes, JSON.parse(process.env.AJ));
  const desl = new Deslizador();
  let ant = null;
  let proxLeitura = 0;
  // Erros nos instantes das leituras (posição à hora da leitura)
  const eCru = [], eAnt = [], eNovo = [];
  // Erros do que se vê no ecrã (60 Hz) face à posição verdadeira *agora*
  const vCru = [], vAnt = [], vNovo = [];
  // Tremor do que se vê (aceleração aparente) e paragens
  const trAnt = [], trNovo = [], trCru = [];
  const paradoCru = [], paradoAnt = [], paradoNovo = [];
  let cru = null, antPos = null, posAnterior = { cru: null, ant: null, novo: null }, velAnterior = { cru: null, ant: null, novo: null };
  const dtF = 1 / 60;
  let realAnt = null;
  let ultimoLocalFrame = 0;
  for (let t = 0; t < T; t += dtF) {
    // chegam leituras
    while (proxLeitura < leituras.length && leituras[proxLeitura].chegada <= t) {
      const l = leituras[proxLeitura++];
      const tms = t0 + l.tFix * 1000;
      cru = { lat: l.lat, lon: l.lon };
      const velMs = l.velocidade;
      ant = filtroAntigo(ant, l.lat, l.lon, l.acc, tms, velMs);
      antPos = { lat: ant.lat, lon: ant.lon };
      const e = novo.atualizar({ lat: l.lat, lon: l.lon, precisao: l.acc, t: tms, chegada: t0 + l.chegada * 1000, velocidade: l.velocidade, rumo: l.rumo }, t0 + l.chegada * 1000);
      const tr = { x: l.x, y: l.y };
      const m = (p) => ({ x: (p.lon - LON0) * M * COS, y: (p.lat - LAT0) * M });
      eCru.push(Math.hypot(m(cru).x - tr.x, m(cru).y - tr.y));
      eAnt.push(Math.hypot(m(antPos).x - tr.x, m(antPos).y - tr.y));
      if (e) eNovo.push(Math.hypot(m(e).x - tr.x, m(e).y - tr.y));
      if (process.env.DBG && e) console.log(l.tFix.toFixed(0).padStart(4), 'real v', Math.hypot(verdade(pts,l.tFix).vx, verdade(pts,l.tFix).vy).toFixed(1).padStart(5), 'est v', e.velocidade.toFixed(1).padStart(5), e.parado ? 'PARADO' : '      ', 'err crua', Math.hypot(m(cru).x - tr.x, m(cru).y - tr.y).toFixed(1).padStart(5), 'err novo', Math.hypot(m(e).x - tr.x, m(e).y - tr.y).toFixed(1).padStart(5), 'acc', l.acc);
    }
    if (!cru) continue;
    const agoraLocal = t0 + t * 1000;
    const real = verdade(pts, t);
    const m = (p) => ({ x: (p.lon - LON0) * M * COS, y: (p.lat - LAT0) * M });
    const est = novo.estimarEm(agoraLocal);
    if (!est) continue;
    desl.passo(dtF, est);
    const pn = m({ lat: desl.lat, lon: desl.lon }), pc = m(cru), pa = m(antPos);
    vCru.push(Math.hypot(pc.x - real.x, pc.y - real.y));
    vAnt.push(Math.hypot(pa.x - real.x, pa.y - real.y));
    vNovo.push(Math.hypot(pn.x - real.x, pn.y - real.y));
    // saltos: quanto o ponto desenhado se move num fotograma a mais (ou a menos) do que o autocarro real
    for (const [nome, p, lista] of [['cru', pc, trCru], ['ant', pa, trAnt], ['novo', pn, trNovo]]) {
      const pr = posAnterior[nome];
      if (pr && realAnt) lista.push(Math.abs(Math.hypot(p.x - pr.x, p.y - pr.y) - Math.hypot(real.x - realAnt.x, real.y - realAnt.y)));
      posAnterior[nome] = p;
    }
    realAnt = real;
    // paragem: movimento do ponto desenhado enquanto o autocarro está parado (primeiros 25 s depois do arranque do filtro)
    if (real.v < 0.01 && t > 8 && t < 25) { paradoCru.push(pc); paradoAnt.push(pa); paradoNovo.push(pn); }
  }
  const dispersao = (ps) => { const mx = ps.reduce((s, p) => s + p.x, 0) / ps.length, my = ps.reduce((s, p) => s + p.y, 0) / ps.length; return Math.sqrt(ps.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / ps.length); };
  return {
    rmseLeitura: [rmse(eCru), rmse(eAnt), rmse(eNovo)],
    p95Leitura: [pct(eCru, .95), pct(eAnt, .95), pct(eNovo, .95)],
    rmseEcra: [rmse(vCru), rmse(vAnt), rmse(vNovo)],
    p95Ecra: [pct(vCru, .95), pct(vAnt, .95), pct(vNovo, .95)],
    maxEcra: [Math.max(...vCru), Math.max(...vAnt), Math.max(...vNovo)],
    tremor95: [pct(trCru, .99), pct(trAnt, .99), pct(trNovo, .99)],
    tremorMax: [Math.max(...trCru), Math.max(...trAnt), Math.max(...trNovo)],
    parado: [dispersao(paradoCru), dispersao(paradoAnt), dispersao(paradoNovo)],
  };
}

const nomes = ['crua', 'antigo', 'novo'];
function resumo(titulo, opcoes) {
  const runs = [];
  for (let s = 1; s <= (process.env.DBG ? 1 : 20); s++) runs.push(correr(s * 7919, opcoes));
  const med = (k, i) => runs.reduce((a, r) => a + r[k][i], 0) / runs.length;
  console.log(`\n== ${titulo} (média de ${runs.length} viagens) ==`);
  const linha = (rot, k, un) => console.log(rot.padEnd(46), [0, 1, 2].map((i) => `${nomes[i]} ${med(k, i).toFixed(2).padStart(7)}`).join('  '), un);
  linha('erro na leitura (RMSE)', 'rmseLeitura', 'm');
  linha('erro na leitura (95%)', 'p95Leitura', 'm');
  linha('erro do ponto no ecrã vs posição real (RMSE)', 'rmseEcra', 'm');
  linha('erro do ponto no ecrã (95%)', 'p95Ecra', 'm');
  linha('pior erro no ecrã', 'maxEcra', 'm');
  linha('salto do ponto num fotograma (99% dos fotogr.)', 'tremor95', 'm');
  linha('maior salto num só fotograma', 'tremorMax', 'm');
  linha('parado: dispersão do ponto', 'parado', 'm');
}
const so = process.env.SO;
if (!so || so === 'normal') resumo('GPS normal', { ruido: 1, saltos: 1 });
if (!so || so === 'mau') resumo('GPS mau', { ruido: 2, saltos: 3 });
if (!so || so === 'semdop') resumo('sem Doppler', { ruido: 1, saltos: 1, semDoppler: true });
if (!so || so === 'tunel') resumo('túnel', { ruido: 1, saltos: 1, tunel: true });
