// Vista de satélite do aeroporto: a Terra desenhada em canvas (projeção ortográfica), com as rotas em círculo máximo
// e o avião a andar na hora certa. Aqui só se desenha: o voo e o resultado são do servidor.
import { LAND } from './terra.js';
import { h } from './ui.js';

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const DISP = '"Shoulders", "Arial Narrow", sans-serif';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// lat/lon (graus) -> vetor na esfera
const vec = (lat, lon) => { const f = lat * RAD, l = lon * RAD; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
// ponto a meio caminho (u de 0 a 1) no círculo máximo entre a e b
function slerp(a, b, u) {
  const w = Math.acos(clamp(dot(a, b), -1, 1)); if (w < 1e-6) return a;
  const s = Math.sin(w), k1 = Math.sin((1 - u) * w) / s, k2 = Math.sin(u * w) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}
const LANDV = LAND.map((r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(vec(r[i + 1] / 10, r[i] / 10)); return o; });
// algumas cidades com luz, para a noite não ficar vazia (lat, lon)
const LIGHTS = [[51.5, -0.1], [48.9, 2.3], [40.4, -3.7], [41.9, 12.5], [52.5, 13.4], [55.8, 37.6], [41, 29], [30, 31.2], [6.5, 3.4], [-26.2, 28], [25.3, 55.3], [19.1, 72.9], [28.6, 77.2], [39.9, 116.4], [31.2, 121.5], [35.7, 139.7], [1.3, 103.8], [-33.9, 151.2], [40.7, -74], [34, -118.2], [41.9, -87.6], [19.4, -99.1], [4.7, -74.1], [-23.5, -46.6], [-34.6, -58.4], [-12, -77], [45.5, -73.6], [59.3, 18.1], [33.6, -7.6], [14.7, -17.4]].map(([a, b]) => vec(a, b));

// home: { lat, lon }; routes: [{ lat, lon, name }]; clock: () => ms (hora do servidor)
export function globe({ home, routes, homeName, clock }) {
  const W = 340, H = 300, cx = W / 2, cy = H / 2, R0 = 132;
  const c = document.createElement('canvas'), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.className = 'gl3'; c.style.aspectRatio = `${W} / ${H}`;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  const el = h('div', { class: 'glbox', role: 'img' }, c);
  const HV = vec(home.lat, home.lon), RV = routes.map((r) => vec(r.lat, r.lon));
  const st = { cam: HV, tgt: HV, zoom: 1, ztgt: 1, sel: -1, flight: null, on: false, last: 0 };
  // base da câmara: e1 (direita), e2 (cima), e3 (para nós)
  const basis = (cv) => { const e1 = norm([-cv[1], cv[0], 0]); const e2 = [cv[1] * e1[2] - cv[2] * e1[1], cv[2] * e1[0] - cv[0] * e1[2], cv[0] * e1[1] - cv[1] * e1[0]]; return [e1, e2, cv]; };
  // onde está o avião: vai (0–47%), carrega (47–53%), volta (53–100%)
  function planeAt(f, t) {
    const u = clamp((t - f.t0) / (f.t1 - f.t0), 0, 1), dest = RV[f.r];
    if (u < 0.47) return { p: norm(slerp(HV, dest, u / 0.47)), u, leg: 0, k: u / 0.47 };
    if (u < 0.53) return { p: dest, u, leg: 1, k: 1 };
    return { p: norm(slerp(dest, HV, (u - 0.53) / 0.47)), u, leg: 2, k: 1 - (u - 0.53) / 0.47 };
  }
  function draw(ts) {
    const t = clock(), f = st.flight, B = basis(st.cam), R = R0 * st.zoom;
    const P = (v) => { const z = dot(v, B[2]); return [cx + R * dot(v, B[0]), cy - R * dot(v, B[1]), z]; };
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.clip();
    // espaço
    ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, W, H);
    // atmosfera
    const ag = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.12); ag.addColorStop(0, 'rgba(90,170,255,.55)'); ag.addColorStop(1, 'rgba(90,170,255,0)');
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, TAU); ctx.fill();
    // mar
    const og = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R); og.addColorStop(0, '#16507f'); og.addColorStop(0.55, '#0c2f52'); og.addColorStop(1, '#06162b');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    // grelha de meridianos e paralelos
    ctx.strokeStyle = 'rgba(160,210,255,.09)'; ctx.lineWidth = 1;
    const line = (pts) => { let pen = false; ctx.beginPath(); for (const v of pts) { const q = P(v); if (q[2] <= 0) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } } ctx.stroke(); };
    for (let lon = -180; lon < 180; lon += 30) { const pts = []; for (let lat = -90; lat <= 90; lat += 6) pts.push(vec(lat, lon)); line(pts); }
    for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lon = -180; lon <= 180; lon += 6) pts.push(vec(lat, lon)); line(pts); }
    // terra: os pontos do lado de lá encostam-se ao limbo e seguem pelo arco
    ctx.fillStyle = '#1d4a36'; ctx.strokeStyle = '#4f9a6c'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
    for (const poly of LANDV) {
      let any = false; const q = poly.map((v) => { const p = P(v); if (p[2] > 0) any = true; return p; });
      if (!any) continue;
      ctx.beginPath(); let prevHid = false, prevA = 0;
      q.forEach((p, i) => {
        if (p[2] > 0) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); prevHid = false; return; }
        const a = Math.atan2(p[1] - cy, p[0] - cx), x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        if (!i) ctx.moveTo(x, y);
        else if (prevHid) { let d = a - prevA; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; ctx.arc(cx, cy, R, prevA, prevA + d, d < 0); }
        else ctx.lineTo(x, y);
        prevHid = true; prevA = a;
      });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // luzes das cidades
    for (const v of LIGHTS) { const q = P(v); if (q[2] <= 0.05) continue; ctx.fillStyle = `rgba(255,214,120,${0.25 + 0.45 * q[2]})`; ctx.beginPath(); ctx.arc(q[0], q[1], 1.3, 0, TAU); ctx.fill(); }
    // sombra da noite e brilho do sol
    const ng = ctx.createLinearGradient(cx - R, cy - R * 0.5, cx + R, cy + R * 0.6); ng.addColorStop(0, 'rgba(255,255,255,.07)'); ng.addColorStop(0.45, 'rgba(0,0,0,0)'); ng.addColorStop(1, 'rgba(0,3,12,.62)');
    ctx.fillStyle = ng; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    // rotas
    const arc = (a, b, from, to, n = 48) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(norm(slerp(a, b, from + (to - from) * (i / n)))); return pts; };
    const pathOf = (pts) => { let pen = false; ctx.beginPath(); for (const v of pts) { const q = P(v); if (q[2] <= 0) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } } };
    const show = f ? f.r : st.sel;
    RV.forEach((dv, i) => {
      if (i === show) return;
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]); pathOf(arc(HV, dv, 0, 1, 32)); ctx.stroke();
    });
    ctx.setLineDash([]);
    const labels = [], hq = P(HV);
    const mark = (v, col, name, big, isHome) => {
      const q = P(v); if (q[2] <= 0) return;
      const pulse = 0.5 + 0.5 * Math.sin(ts / 420);
      if (big) { ctx.strokeStyle = col; ctx.globalAlpha = 0.5 * (1 - pulse); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 5 + 9 * pulse, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#04060b'; ctx.beginPath(); ctx.arc(q[0], q[1], big ? 5.5 : 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q[0], q[1], big ? 4 : 2.4, 0, TAU); ctx.fill();
      if (name && (big || isHome || Math.hypot(q[0] - hq[0], q[1] - hq[1]) > 52)) labels.push([q[0], q[1], name, big]);
    };
    const drawLabels = () => {
      for (const [x, y, name, big] of labels) {
        ctx.font = `900 ${big ? 13 : 10.5}px ${DISP}`; ctx.textBaseline = 'middle'; const w = ctx.measureText(name).width, left = x + 9 + w > W - 6;
        ctx.textAlign = left ? 'right' : 'left'; const tx = x + (left ? -9 : 9);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineJoin = 'round'; ctx.strokeText(name, tx, y + 0.5); ctx.fillStyle = big ? '#fff' : 'rgba(255,255,255,.72)'; ctx.fillText(name, tx, y + 0.5);
      }
    };
    if (show >= 0) {
      const dv = RV[show];
      // caminho todo, a tracejado que corre
      ctx.strokeStyle = 'rgba(255,214,94,.5)'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -(ts / 60) % 11; pathOf(arc(HV, dv, 0, 1)); ctx.stroke(); ctx.setLineDash([]);
      if (f) {
        const pl = planeAt(f, t);
        // já feito: linha cheia (na ida até ao avião; na volta, do destino até ao avião)
        ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        if (pl.leg === 0) pathOf(arc(HV, dv, 0, pl.k)); else pathOf(arc(HV, dv, pl.k, 1));
        ctx.stroke();
      }
    }
    RV.forEach((dv, i) => mark(dv, i === show ? '#ff5a52' : 'rgba(255,255,255,.6)', routes[i].name, i === show));
    mark(HV, '#42e08a', homeName, true, true);
    // avião
    if (f) {
      const pl = planeAt(f, t), q = P(pl.p);
      if (q[2] > 0) {
        const dest = RV[f.r], ahead = pl.leg === 1 ? HV : norm(slerp(pl.p, pl.leg === 0 ? dest : HV, 0.04)), q2 = P(ahead);
        const ang = Math.atan2(q2[1] - q[1], q2[0] - q[0]), bob = pl.leg === 1 ? 0 : Math.sin(ts / 300) * 0.8, s = pl.leg === 1 ? 0.85 : 1;
        // sombra no chão
        ctx.save(); ctx.translate(q[0] + 4, q[1] + 6); ctx.rotate(ang); ctx.scale(s, s); ctx.fillStyle = 'rgba(0,0,0,.4)'; plane(ctx); ctx.fill(); ctx.restore();
        ctx.save(); ctx.translate(q[0], q[1] + bob); ctx.rotate(ang); ctx.scale(s, s);
        ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff'; plane(ctx); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#1a1100'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
    // aro do planeta
    ctx.strokeStyle = 'rgba(140,200,255,.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    drawLabels();
    ctx.restore();
  }
  // silhueta de um avião a apontar para a direita, centrada em (0,0)
  function plane(x) {
    x.beginPath(); x.moveTo(12, 0); x.lineTo(4, -2.2); x.lineTo(-1, -11); x.lineTo(-4, -11); x.lineTo(-2, -2.4); x.lineTo(-8, -2); x.lineTo(-10.5, -5.5); x.lineTo(-12.5, -5.5); x.lineTo(-11, 0);
    x.lineTo(-12.5, 5.5); x.lineTo(-10.5, 5.5); x.lineTo(-8, 2); x.lineTo(-2, 2.4); x.lineTo(-4, 11); x.lineTo(-1, 11); x.lineTo(4, 2.2); x.closePath();
  }
  function frame(ts) {
    if (!el.isConnected) { st.on = false; return; }
    const dt = Math.min(0.1, (ts - st.last) / 1000 || 0.016); st.last = ts;
    // a câmara segue o avião; parada, olha para o meio da rota escolhida (ou para casa, a rodar devagar)
    const f = st.flight;
    if (f) { const pl = planeAt(f, clock()); st.tgt = norm(slerp(pl.p, HV, 0.18)); st.ztgt = zoomFor(f.r) * 1.25; }
    else if (st.sel >= 0) { st.tgt = norm(slerp(HV, RV[st.sel], 0.5)); st.ztgt = zoomFor(st.sel); }
    else { const a = ts / 26000; st.tgt = norm(slerp(HV, vec(home.lat + 8 * Math.sin(a * 1.3), home.lon + 55 * Math.sin(a)), 0.5)); st.ztgt = 1; }
    const k = 1 - Math.exp(-dt * 2.4);
    st.cam = norm([st.cam[0] + (st.tgt[0] - st.cam[0]) * k, st.cam[1] + (st.tgt[1] - st.cam[1]) * k, st.cam[2] + (st.tgt[2] - st.cam[2]) * k]);
    st.zoom += (st.ztgt - st.zoom) * k;
    draw(ts);
    requestAnimationFrame(frame);
  }
  // aproxima nas rotas curtas, para se ver o caminho
  const zoomFor = (i) => { const d = Math.acos(clamp(dot(HV, RV[i]), -1, 1)); return clamp(0.95 / Math.max(0.3, Math.sin(Math.min(d, Math.PI / 2))), 1, 3.1); };
  const wake = () => { if (!st.on) { st.on = true; st.last = performance.now(); requestAnimationFrame(frame); } };
  return {
    el, wake,
    select(i) { st.sel = i; wake(); },
    // f: { r, t0, t1 } ou null
    flight(f) { st.flight = f; wake(); },
  };
}
