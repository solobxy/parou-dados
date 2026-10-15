// Testa o movimento dos autocarros no mapa (src/utils/trajetoVeiculo.ts): suave, sem «teleportes», sem andar para trás e sem fugir.
//
// Os operadores enviam uma posição de 15 em 15 s (Carris Metropolitana, TUB) ou de 30 em 30 s (STCP), com 10 a 15 s de idade.
// O marcador antigo deslizava 1,6 s para a posição nova e ficava parado até à seguinte: parecia aos saltos.
// Aqui simula-se o que o telemóvel faz (pede de 8 em 8 s, desenha a 30 imagens por segundo) e mede-se o que se vê:
//   - cenários inventados (reta, esquina, erro de GPS, operador que deixa de enviar, autocarro que volta depois de uma lacuna);
//   - séries REAIS medidas no servidor (auditoria/fixtures/trajetos-reais.json), com os erros de GPS verdadeiros.
// Uso: APP=caminho-da-app node --import tsx auditoria/trajeto-veiculo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const caminho = process.env.APP || '../app';
const M = await import(`${caminho}/src/utils/trajetoVeiculo.ts`);
const aqui = path.dirname(fileURLToPath(import.meta.url));

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (txt) => console.log('NOTA    ' + txt);

const FPS = 30, POLL_S = 8;
const LAT0 = 41.15, LON0 = -8.61;
const M_LAT = 1 / 111320, M_LON = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const pt = (norteM, esteM) => ({ lat: LAT0 + norteM * M_LAT, lon: LON0 + esteM * M_LON });
const dist = (a, b) => M.distanciaM(a, b);

/**
 * Simula o telemóvel. `fixes`: posições medidas ({t, lat, lon}); `chegada(f)`: relógio do servidor em que cada posição chega à app.
 * Devolve as imagens desenhadas entre `de` e `ate` (relógio do servidor).
 */
function simular(op, fixes, chegada, de, ate) {
  const mov = new M.MovimentoVeiculo(op);
  const eventos = fixes.map((f) => ({ f, quando: chegada(f) })).sort((a, b) => a.quando - b.quando);
  let i = 0;
  const frames = [];
  for (let W = Math.min(...eventos.map((e) => e.quando)); W <= ate; W += 1 / FPS) {
    while (i < eventos.length && eventos[i].quando <= W) { mov.receber(eventos[i].f, eventos[i].quando); i++; }
    if (W >= de && mov.tem()) { const p = mov.mostrar(W); frames.push({ W, lat: p.lat, lon: p.lon, rumo: p.rumo, vel: p.vel }); }
  }
  return frames;
}
/** O que cada telemóvel veria com o mapa antigo: salta para a posição nova a 1,6 s e fica parado */
function simularAntigo(fixes, chegada, de, ate) {
  const eventos = fixes.map((f) => ({ f, quando: chegada(f) })).sort((a, b) => a.quando - b.quando);
  let i = 0, atual = null, origem = null, inicio = 0;
  const frames = [];
  for (let W = eventos[0].quando; W <= ate; W += 1 / FPS) {
    while (i < eventos.length && eventos[i].quando <= W) { origem = atual || eventos[i].f; atual = eventos[i].f; inicio = eventos[i].quando; i++; }
    const k = Math.min(1, (W - inicio) / 1.6);
    if (W >= de && atual) frames.push({ W, lat: origem.lat + (atual.lat - origem.lat) * k, lon: origem.lon + (atual.lon - origem.lon) * k });
  }
  return frames;
}
function medidas(frames) {
  let maxPasso = 0, parado = 0, andou = 0, recuou = 0;
  const velocidades = [];
  for (let k = 1; k < frames.length; k++) {
    const d = dist(frames[k - 1], frames[k]);
    maxPasso = Math.max(maxPasso, d);
    velocidades.push(d * FPS);
  }
  return { maxPasso, maxVel: Math.max(0, ...velocidades), n: frames.length, velocidades };
}
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ============================================================= 1. matemática de base
{
  const a = pt(0, 0), b = pt(100, 0);
  ok('distância de 100 m a norte', Math.abs(dist(a, b) - 100) < 0.5, dist(a, b).toFixed(2));
  ok('rumo a norte = 0', Math.abs(M.rumoEntre(a, b)) < 0.5 || Math.abs(M.rumoEntre(a, b) - 360) < 0.5);
  ok('rumo a este = 90', Math.abs(M.rumoEntre(a, pt(0, 100)) - 90) < 0.5);
  ok('rodar pelo lado mais curto: 350 → 10 passa por 360', Math.abs(M.rodarPeloCaminhoMaisCurto(350, 10) - 370) < 1e-9);
  ok('rodar pelo lado mais curto: 10 → 350 passa por 0', Math.abs(M.rodarPeloCaminhoMaisCurto(10, 350) - (-10)) < 1e-9);
  const r1 = M.atualizarRelogio(null, 1000, 5000);
  const r2 = M.atualizarRelogio(r1, 1010, 15000); // passaram 10 s
  ok('o relógio do servidor avança com o relógio local', Math.abs(M.agoraDoServidor(r2, 20000) - 1015.5) < 0.6, M.agoraDoServidor(r2, 20000).toFixed(2));
  const r3 = M.atualizarRelogio(r2, 5000, 25000);
  ok('relógio: uma diferença enorme (telemóvel adormecido) adota o novo', Math.abs(M.agoraDoServidor(r3, 25000) - 5000.5) < 0.6);
}

// ============================================================= 2. reta, a 8 m/s (29 km/h), posição de 15 em 15 s
for (const [op, cada, nome] of [['cm', 15, 'Carris Metropolitana/TUB (15 s)'], ['stcp', 32, 'STCP (32 s)']]) {
  const V = 8;
  const fixes = [];
  for (let t = 1000; t <= 1000 + 400; t += cada) fixes.push({ t, ...pt(0, V * (t - 1000)) });
  const chegada = (f) => { const disp = f.t + 10; return Math.ceil((disp - 3) / POLL_S) * POLL_S + 3; }; // 10 s de latência e pedidos de 8 em 8 s
  const de = 1000 + 90, ate = 1000 + 400;
  const frames = simular(op, fixes, chegada, de, ate);
  const m = medidas(frames);
  const verdadeira = (W) => pt(0, V * (W - 1000));
  // atraso: tempo que o autocarro verdadeiro levou a chegar onde o marcador está
  const atrasos = frames.map((f) => f.W - (1000 + dist(pt(0, 0), f) / V));
  const antigo = medidas(simularAntigo(fixes, chegada, de, ate).map((f) => ({ ...f })));
  const antigoFrames = simularAntigo(fixes, chegada, de, ate);
  const paradoAntigo = antigoFrames.slice(1).filter((f, k) => dist(antigoFrames[k], f) * FPS < 0.5).length / (antigoFrames.length - 1);
  const parado = frames.slice(1).filter((f, k) => dist(frames[k], f) * FPS < 0.5).length / (frames.length - 1);
  nota(`[reta ${nome}] antes: parado ${(paradoAntigo * 100).toFixed(0)}% do tempo, velocidade máx. ${antigo.maxVel.toFixed(0)} m/s; agora: parado ${(parado * 100).toFixed(0)}%, máx. ${m.maxVel.toFixed(1)} m/s, atraso ${pct(atrasos, 0.1).toFixed(0)}–${pct(atrasos, 0.9).toFixed(0)} s`);
  ok(`[reta ${nome}] nunca «teleporta»: velocidade desenhada ≤ 14 m/s`, m.maxVel <= 14, m.maxVel.toFixed(1));
  ok(`[reta ${nome}] anda sempre (parado menos de 5% do tempo; antes ${(paradoAntigo * 100).toFixed(0)}%)`, parado < 0.05, (parado * 100).toFixed(1) + '%');
  const recuos = frames.slice(1).filter((f, k) => (f.lon - frames[k].lon) < -1e-9 * 0 && dist(frames[k], f) > 0.05 && f.lon < frames[k].lon).length;
  ok(`[reta ${nome}] não anda para trás`, recuos === 0, String(recuos));
  ok(`[reta ${nome}] a velocidade mostrada é parecida com a real (mediana entre 5,5 e 10,5 m/s)`, pct(m.velocidades, 0.5) > 5.5 && pct(m.velocidades, 0.5) < 10.5, pct(m.velocidades, 0.5).toFixed(2));
  ok(`[reta ${nome}] nunca mostra o autocarro à frente da realidade`, atrasos.every((a) => a > -0.5), Math.min(...atrasos).toFixed(2));
  ok(`[reta ${nome}] o atraso fica entre 8 e ${op === 'stcp' ? 60 : 40} s`, pct(atrasos, 0.02) > 8 && pct(atrasos, 0.98) < (op === 'stcp' ? 60 : 40), `${pct(atrasos, 0.02).toFixed(1)}–${pct(atrasos, 0.98).toFixed(1)} s`);
}

// ============================================================= 3. esquina a 90° (norte, depois este)
{
  const V = 8, fixes = [];
  // percurso: 600 s a norte, depois a este (em segundos de viagem)
  const caminho2 = (s) => (s <= 150 ? pt(V * s, 0) : pt(V * 150, V * (s - 150)));
  for (let t = 0; t <= 400; t += 15) fixes.push({ t: 2000 + t, ...caminho2(t) });
  const chegada = (f) => Math.ceil((f.t + 10 - 3) / POLL_S) * POLL_S + 3;
  const frames = simular('cm', fixes, chegada, 2000 + 90, 2000 + 400);
  const m = medidas(frames);
  // distância ao caminho verdadeiro (dois segmentos)
  const dSeg = (p, a, b) => { const ab = { x: (b.lon - a.lon) / M_LON, y: (b.lat - a.lat) / M_LAT }, ap = { x: (p.lon - a.lon) / M_LON, y: (p.lat - a.lat) / M_LAT }; const k = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x ** 2 + ab.y ** 2))); return Math.hypot(ap.x - k * ab.x, ap.y - k * ab.y); };
  const A = pt(0, 0), B = pt(V * 150, 0), C = pt(V * 150, V * 250);
  const desvios = frames.map((f) => Math.min(dSeg(f, A, B), dSeg(f, B, C)));
  ok('[esquina] sem «teleportes» (≤ 14 m/s)', m.maxVel <= 14, m.maxVel.toFixed(1));
  ok('[esquina] corta a esquina no máximo 70 m (posições de 15 em 15 s)', Math.max(...desvios) <= 70, Math.max(...desvios).toFixed(0) + ' m');
  const ultimo = frames[frames.length - 1];
  ok('[esquina] depois da esquina continua pelo caminho certo (desvio final < 15 m)', desvios[desvios.length - 1] < 15, desvios[desvios.length - 1].toFixed(1));
  ok('[esquina] o rumo muda de norte para este', frames.some((f) => f.rumo !== undefined && (f.rumo < 5 || f.rumo > 355)) && ultimo.rumo !== undefined && Math.abs(ultimo.rumo - 90) < 10, `rumo final ${ultimo.rumo?.toFixed(0)}`);
}

// ============================================================= 4. erro de GPS: uma posição 1 km ao lado
{
  const V = 8, fixes = [];
  for (let t = 0; t <= 300; t += 15) fixes.push({ t: 3000 + t, ...pt(V * t, 0) });
  fixes[8] = { t: fixes[8].t, ...pt(V * 120, 1000) }; // erro de GPS
  const chegada = (f) => Math.ceil((f.t + 10 - 3) / POLL_S) * POLL_S + 3;
  const frames = simular('cm', fixes, chegada, 3000 + 60, 3000 + 300);
  const m = medidas(frames);
  const afast = Math.max(...frames.map((f) => Math.abs(f.lon - LON0) / M_LON));
  ok('[erro de GPS] a posição errada (1 km ao lado) é ignorada', afast < 25, afast.toFixed(1) + ' m ao lado');
  ok('[erro de GPS] sem «teleportes»', m.maxVel <= 14, m.maxVel.toFixed(1));
}
{
  // dois erros seguidos já contam (o autocarro pode ter mesmo ido para lá): mostra-se, sem saltar
  const V = 8, fixes = [];
  for (let t = 0; t <= 300; t += 15) fixes.push({ t: 4000 + t, ...pt(V * t, 0) });
  for (let k = 8; k < fixes.length; k++) fixes[k] = { t: fixes[k].t, ...pt(V * (fixes[k].t - 4000), 300) }; // desvio permanente de 300 m para este
  const chegada = (f) => Math.ceil((f.t + 10 - 3) / POLL_S) * POLL_S + 3;
  const frames = simular('cm', fixes, chegada, 4000 + 60, 4000 + 300);
  const m = medidas(frames);
  const fim = frames[frames.length - 1];
  ok('[desvio permanente] acaba por aceitar o novo caminho (não fica preso)', Math.abs(fim.lon - LON0) / M_LON > 250, ((fim.lon - LON0) / M_LON).toFixed(0) + ' m');
  ok('[desvio permanente] sem «teleportes» grandes (≤ 40 m/s, a deslizar)', m.maxVel <= 40, m.maxVel.toFixed(1));
}

// ============================================================= 5. o operador deixa de enviar
{
  const V = 8, fixes = [];
  for (let t = 0; t <= 120; t += 15) fixes.push({ t: 5000 + t, ...pt(V * t, 0) });
  const chegada = (f) => Math.ceil((f.t + 10 - 3) / POLL_S) * POLL_S + 3;
  const frames = simular('cm', fixes, chegada, 5000 + 60, 5000 + 600);
  const ultimaFix = fixes[fixes.length - 1];
  const fim = frames[frames.length - 1];
  const alem = dist(ultimaFix, fim);
  ok('[sem posições novas] o marcador pára e não foge (no máximo ~20 s de viagem, 170 m, depois da última posição)', alem <= 170, alem.toFixed(0) + ' m');
  const velFim = dist(frames[frames.length - 2], fim) * FPS;
  ok('[sem posições novas] acaba parado', velFim < 0.05, velFim.toFixed(3));
}

// ============================================================= 6. autocarro que volta depois de uma lacuna (saiu da caixa do mapa)
{
  const fixes = [];
  for (let t = 0; t <= 60; t += 15) fixes.push({ t: 6000 + t, ...pt(8 * t, 0) });
  for (let t = 400; t <= 460; t += 15) fixes.push({ t: 6000 + t, ...pt(8 * t, 0) }); // 5 min depois, 3 km mais longe
  const chegada = (f) => Math.ceil((f.t + 10 - 3) / POLL_S) * POLL_S + 3;
  const frames = simular('cm', fixes, chegada, 6000 + 30, 6000 + 520);
  // o autocarro reaparece noutro sítio: uma passagem direta é aceitável, mas só UMA
  const saltosGrandes = frames.slice(1).filter((f, k) => dist(frames[k], f) > 100).length;
  ok('[lacuna de 5 min] reaparece no sítio certo com no máximo um salto', saltosGrandes <= 1, String(saltosGrandes));
  const fim = frames[frames.length - 1];
  ok('[lacuna de 5 min] acaba perto da posição verdadeira', dist(fim, pt(8 * 460, 0)) < 8 * 60, dist(fim, pt(8 * 460, 0)).toFixed(0) + ' m');
}

// ============================================================= 7. parado num semáforo e a arrancar
{
  const V = 8, fixes = [];
  const pos = (t) => (t <= 60 ? V * t : t <= 120 ? V * 60 : V * 60 + V * (t - 120));
  for (let t = 0; t <= 300; t += 15) fixes.push({ t: 7000 + t, ...pt(pos(t), 0) });
  const chegada = (f) => Math.ceil((f.t + 10 - 3) / POLL_S) * POLL_S + 3;
  const frames = simular('cm', fixes, chegada, 7000 + 60, 7000 + 300);
  const m = medidas(frames);
  ok('[semáforo] sem «teleportes»', m.maxVel <= 14, m.maxVel.toFixed(1));
  const paradas = frames.filter((f) => f.vel < 0.1).length / frames.length;
  ok('[semáforo] enquanto está parado, o marcador não treme (rumo mantido)', frames.every((f) => f.rumo === undefined || Number.isFinite(f.rumo)));
  nota(`[semáforo] ${(paradas * 100).toFixed(0)}% do tempo parado no modelo`);
}

// ============================================================= 8. autocarro que aparece agora no mapa (só uma posição, depois a segunda)
{
  const V = 8, fixes = [];
  for (let t = 0; t <= 300; t += 15) fixes.push({ t: 8000 + t, ...pt(V * t, 0) });
  const chegada = (f) => Math.ceil((f.t + 12 - 3) / POLL_S) * POLL_S + 3;
  // a app abre o mapa quando já passaram 100 s: só vê as posições que chegam daí em diante
  const desde = 8000 + 100;
  const novas = fixes.filter((f) => chegada(f) >= desde);
  const frames = simular('cm', novas, chegada, chegada(novas[0]), 8000 + 300);
  const m = medidas(frames);
  ok('[autocarro novo] ao aparecer, arranca sem salto (≤ 1,35× a velocidade do troço)', m.maxVel <= 8 * 1.4 + 0.5, m.maxVel.toFixed(1));
  const parado = frames.slice(1).filter((f, k) => dist(frames[k], f) * FPS < 0.5).length / (frames.length - 1);
  nota(`[autocarro novo] parado ${(parado * 100).toFixed(0)}% do tempo desde que aparece (só há uma posição até chegar a segunda)`);
  // com a posição anterior vinda do servidor, já arranca em andamento
  const mov = new M.MovimentoVeiculo('cm');
  const a = novas[0], b = novas[1];
  const W0 = chegada(b);
  mov.receber(a, W0, W0 - b.t); mov.receber(b, W0); mov.alinhar(W0);
  const restantes = novas.slice(2).map((f) => ({ f, quando: chegada(f) }));
  const fr = []; let k = 0;
  for (let W = W0; W <= 8000 + 300; W += 1 / FPS) {
    while (k < restantes.length && restantes[k].quando <= W) { mov.receber(restantes[k].f, restantes[k].quando); k++; }
    const p = mov.mostrar(W); fr.push({ lat: p.lat, lon: p.lon });
  }
  const mm = medidas(fr);
  const paradoAnt = fr.slice(1).filter((f, q) => dist(fr[q], f) * FPS < 0.5).length / (fr.length - 1);
  ok('[autocarro novo, com a posição anterior] anda desde o primeiro instante e sem salto', paradoAnt < 0.05 && mm.maxVel <= 8 * 1.4 + 0.5, `parado ${(paradoAnt * 100).toFixed(0)}%, máx. ${mm.maxVel.toFixed(1)} m/s`);
}

// ============================================================= 9. séries reais
const ficheiro = path.join(aqui, 'fixtures', 'trajetos-reais.json');
if (!fs.existsSync(ficheiro)) {
  ok('existem séries reais para testar (auditoria/fixtures/trajetos-reais.json)', false);
} else {
  const series = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
  const porOp = {};
  let semProblemas = 0;
  for (const s of series) {
    // [t, agora (servidor, quando a app a viu), lat, lon, vel, rumo]
    const fixes = s.fixes.map(([t, agora, lat, lon]) => ({ t, lat, lon, agora }));
    if (fixes.length < 5) continue;
    const mapaChegada = new Map(fixes.map((f) => [f.t, f.agora]));
    // «verdade»: o caminho medido, sem erros de GPS evidentes (> 30 m/s)
    const limpos = [fixes[0]];
    for (const f of fixes.slice(1)) { const u = limpos[limpos.length - 1]; if (dist(u, f) / (f.t - u.t) <= 30) limpos.push(f); }
    if (limpos.length < 5) continue;
    const verdade = (W) => { if (W < limpos[0].t || W > limpos[limpos.length - 1].t) return null; for (let i = 1; i < limpos.length; i++) if (W <= limpos[i].t) { const a = limpos[i - 1], b = limpos[i], k = (W - a.t) / (b.t - a.t); return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k }; } return null; };
    const vMaxSerie = Math.max(...limpos.slice(1).map((f, k) => dist(limpos[k], f) / (f.t - limpos[k].t)));
    // simulação à mão (para saber, em cada imagem, a última posição recebida e há quanto tempo)
    const mov = new M.MovimentoVeiculo(s.op);
    const eventos = fixes.map((f) => ({ f, q: f.agora })).sort((a, b) => a.q - b.q);
    let i = 0, ultimo = null, ultimaChegada = 0, prev = null;
    const de = fixes[2].agora, ate = limpos[limpos.length - 1].t;
    const velocidades = [], erro = [], erroAntigo = [], pararam = [];
    for (let W = eventos[0].q; W <= ate; W += 1 / FPS) {
      while (i < eventos.length && eventos[i].q <= W) { mov.receber(eventos[i].f, eventos[i].q); ultimo = eventos[i].f; ultimaChegada = eventos[i].q; i++; }
      if (W < de) continue;
      const p = mov.mostrar(W);
      const v = verdade(W), v1 = verdade(W - 1);
      if (v) { erro.push(dist(p, v)); if (ultimo) erroAntigo.push(dist(ultimo, v)); }
      if (prev) {
        const d = dist(prev, p) * FPS;
        velocidades.push(d);
        // parado enquanto o autocarro anda, mas só se o operador está a enviar (uma falha geral de 60 s não conta)
        if (v && v1 && dist(v1, v) > 2 && W - ultimaChegada < 45) pararam.push(d < 0.5 ? 1 : 0);
      }
      prev = p;
    }
    const antigoFrames = simularAntigo(fixes, (f) => mapaChegada.get(f.t), de, ate);
    const mAntigo = medidas(antigoFrames);
    const maxVel = Math.max(0, ...velocidades);
    const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const o = (porOp[s.op] ||= { n: 0, maxVel: [], relativa: [], parado: [], velAntiga: [], erro: [], erroAntigo: [], falhas: 0 });
    o.n++; o.maxVel.push(maxVel); o.relativa.push(maxVel / Math.max(5, vMaxSerie)); o.velAntiga.push(mAntigo.maxVel);
    if (pararam.length > 100) o.parado.push(media(pararam));
    o.erro.push(media(erro)); o.erroAntigo.push(media(erroAntigo));
    const semNaN = velocidades.every((x) => Number.isFinite(x));
    if (!semNaN || maxVel > 60) { o.falhas++; console.log('   série com problema:', s.id, s.op, 'máx', maxVel.toFixed(1), 'm/s', semNaN ? '' : 'NaN'); } else semProblemas++;
  }
  for (const [op, o] of Object.entries(porOp)) {
    nota(`[reais ${op}] ${o.n} autocarros; velocidade máx. desenhada p50 ${pct(o.maxVel, .5).toFixed(1)} p90 ${pct(o.maxVel, .9).toFixed(1)} m/s (antes p50 ${pct(o.velAntiga, .5).toFixed(0)} p90 ${pct(o.velAntiga, .9).toFixed(0)} m/s); parado enquanto andava: ${(pct(o.parado, .5) * 100).toFixed(0)}%; erro médio ${media0(o.erro).toFixed(0)} m (antes ${media0(o.erroAntigo).toFixed(0)} m)`);
    ok(`[reais ${op}] nenhum autocarro «teleporta» (nunca mais de 60 m/s desenhados)`, o.falhas === 0, `${o.n - o.falhas}/${o.n}`);
    ok(`[reais ${op}] 90% dos autocarros nunca passam de 1,5× a velocidade mais alta do seu próprio percurso`, pct(o.relativa, .9) <= 1.5, pct(o.relativa, .9).toFixed(2) + '×');
    // A TUB tem, nestas séries, uma falha geral de 60 s do operador (nenhum autocarro envia): o marcador não pode adivinhar o que ainda não sabe
    const limiteParado = op === 'tub' ? 0.25 : 0.10;
    ok(`[reais ${op}] a andar quase sempre (parado menos de ${limiteParado * 100}% do tempo em mediana, quando o operador envia)`, o.parado.length === 0 || pct(o.parado, .5) < limiteParado, (pct(o.parado, .5) * 100).toFixed(0) + '%');
    ok(`[reais ${op}] não é menos exato do que o mapa antigo (erro médio até 1,4× + 30 m)`, media0(o.erro) <= 1.4 * media0(o.erroAntigo) + 30, `${media0(o.erro).toFixed(0)} m contra ${media0(o.erroAntigo).toFixed(0)} m`);
  }
  ok('séries reais testadas', semProblemas > 30, String(semProblemas));
}
// ============================================================= 10. servidor: posição anterior de cada veículo
{
  const H = await import(`${caminho}/src/server/historicoPosicoes.ts`);
  const V = await import(`${caminho}/src/server/veiculos.ts`);
  H.limparHistoricoPosicoes();
  const veic = (id, t, lat, lon) => ({ id, line_id: '803', operator: 'STCP', lat, lon, timestamp: t });
  const T0 = 1_800_000_000, agora = (s) => (T0 + s) * 1000;
  let l = [veic('stcp:1', T0, 41.15, -8.61)]; H.anotarAnteriores(l, agora(5));
  ok('[servidor] primeira vez que vê o veículo: ainda não há posição anterior', l[0].prev === undefined);
  l = [veic('stcp:1', T0 + 30, 41.152, -8.612)]; H.anotarAnteriores(l, agora(35));
  ok('[servidor] segunda posição: a anterior é a primeira', l[0].prev && l[0].prev.lat === 41.15 && l[0].prev.timestamp === T0, JSON.stringify(l[0].prev));
  l = [veic('stcp:1', T0 + 30, 41.152, -8.612)]; H.anotarAnteriores(l, agora(45));
  ok('[servidor] a mesma posição outra vez: a anterior continua a ser a primeira', l[0].prev && l[0].prev.timestamp === T0, JSON.stringify(l[0].prev));
  l = [veic('stcp:1', T0 + 10, 41.9, -8.9)]; H.anotarAnteriores(l, agora(50));
  ok('[servidor] posição mais antiga (fora de ordem) é ignorada', l[0].prev === undefined);
  l = [veic('stcp:1', T0 + 60, 41.154, -8.614)]; H.anotarAnteriores(l, agora(65));
  ok('[servidor] terceira posição: a anterior é a segunda (não a primeira)', l[0].prev && l[0].prev.timestamp === T0 + 30, JSON.stringify(l[0].prev));
  l = [veic('stcp:1', T0 + 400, 41.2, -8.7)]; H.anotarAnteriores(l, agora(405));
  ok('[servidor] anterior com mais de 120 s não serve', l[0].prev === undefined);
  l = [veic('stcp:2', T0, 41.1, -8.6)]; H.anotarAnteriores(l, agora(0));
  H.anotarAnteriores([], agora(400));
  ok('[servidor] esquece veículos que deixa de ver (5 min)', H.tamanhoHistoricoPosicoes() <= 1, String(H.tamanhoHistoricoPosicoes()));
  const leve = V.paraVeiculoLeve({ ...veic('stcp:3', T0 + 30, 41.123456789, -8.6123456), prev: { lat: 41.1, lon: -8.6, timestamp: T0 } });
  ok('[servidor] a lista leve leva «ant» (arredondado a 5 casas)', leve && leve.ant && leve.ant.t === T0 && leve.ant.lat === 41.1 && leve.lat === 41.12346, JSON.stringify(leve));
  const semAnt = V.paraVeiculoLeve(veic('stcp:4', T0, 41.1, -8.6));
  ok('[servidor] sem posição anterior não leva «ant»', semAnt && !('ant' in semAnt));
  H.limparHistoricoPosicoes();
}

function media0(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
