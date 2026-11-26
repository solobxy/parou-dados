// Marcadores do mapa (cor e símbolo à escolha), grelha com letras e números e a bússola no topo do ecrã.
// Norte = -z (o mapa grande tem o norte para cima); rumo em graus no sentido dos ponteiros do relógio.
import { MAP } from './world.js';

export const MCOL = ['#F2C14E', '#F07A68', '#7fd38a', '#6FA8FF', '#C792EA', '#F4F1EA'];
export const MSYM = ['ponto', 'casa', 'perigo', 'estrela', 'bandeira', 'alvo', 'caixa'];
export const MSYM_N = { ponto: 'Ponto', casa: 'Casa', perigo: 'Perigo', estrela: 'Estrela', bandeira: 'Bandeira', alvo: 'Alvo', caixa: 'Loot' };
const MAXM = 16;
const key = () => 'kg.marks.' + (window.KG_ONLINE ? 'on' : 'off');
export const marks = (() => { try { const a = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(a) ? a.filter(m => isFinite(m.x) && isFinite(m.z)).slice(0, MAXM) : []; } catch (e) { return []; } })();
export const saveMarks = () => { try { localStorage.setItem(key(), JSON.stringify(marks)); } catch (e) { } };
export const addMark = (x, z, c, s) => { if (marks.length >= MAXM) marks.shift(); const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: Math.round(x), z: Math.round(z), c: c ?? 0, s: s || 'ponto' }; marks.push(m); saveMarks(); return m; };
export const delMark = m => { const i = marks.indexOf(m); if (i >= 0) marks.splice(i, 1); saveMarks(); };

// grelha de 500 m: colunas A–P (oeste → este) e linhas 1–16 (norte → sul), como no Rust
export const CELL = 500;
const LET = 'ABCDEFGHIJKLMNOP';
export const gridName = (x, z) => { const i = Math.max(0, Math.min(15, Math.floor((x + MAP) / CELL))), j = Math.max(0, Math.min(15, Math.floor((z + MAP) / CELL))); return LET[i] + (j + 1); };
export const gridLet = i => LET[i];

export const bearing = (dx, dz) => { let b = Math.atan2(dx, -dz) * 180 / Math.PI; if (b < 0) b += 360; return b; };
export const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const cardOf = b => CARD[Math.round(((b % 360) + 360) % 360 / 45) % 8];
export const distTxt = d => d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m';

// símbolo centrado em (X, Y), raio r
export function drawSym(c, s, X, Y, r, col, out = 'rgba(10,10,10,.9)') {
  c.save(); c.translate(X, Y); c.lineJoin = 'round'; c.lineCap = 'round';
  // pino: disco de fundo com contorno, o símbolo escuro por cima
  c.fillStyle = col; c.strokeStyle = out; c.lineWidth = Math.max(1.2, r * 0.18);
  c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.stroke();
  c.fillStyle = c.strokeStyle = 'rgba(16,15,14,.92)'; c.lineWidth = Math.max(1, r * 0.16); const k = r * 0.56;
  c.beginPath();
  if (s === 'casa') { c.moveTo(-k, 0); c.lineTo(0, -k); c.lineTo(k, 0); c.lineTo(k * 0.7, 0); c.lineTo(k * 0.7, k * 0.8); c.lineTo(-k * 0.7, k * 0.8); c.lineTo(-k * 0.7, 0); c.closePath(); c.fill(); }
  else if (s === 'perigo') { c.moveTo(0, -k); c.lineTo(k, k * 0.8); c.lineTo(-k, k * 0.8); c.closePath(); c.fill(); c.fillStyle = col; c.fillRect(-k * 0.1, -k * 0.3, k * 0.2, k * 0.6); c.fillRect(-k * 0.1, k * 0.42, k * 0.2, k * 0.2); }
  else if (s === 'estrela') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? k * 0.45 : k; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); }
  else if (s === 'bandeira') { c.moveTo(-k * 0.6, k); c.lineTo(-k * 0.6, -k); c.stroke(); c.beginPath(); c.moveTo(-k * 0.6, -k); c.lineTo(k * 0.9, -k * 0.55); c.lineTo(-k * 0.6, -k * 0.05); c.closePath(); c.fill(); }
  else if (s === 'alvo') { c.arc(0, 0, k * 0.75, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -k * 1.1); c.lineTo(0, k * 1.1); c.moveTo(-k * 1.1, 0); c.lineTo(k * 1.1, 0); c.stroke(); }
  else if (s === 'caixa') { c.rect(-k * 0.8, -k * 0.55, k * 1.6, k * 1.15); c.fill(); c.fillStyle = col; c.fillRect(-k * 0.8, -k * 0.15, k * 1.6, k * 0.16); c.fillRect(-k * 0.12, -k * 0.15, k * 0.24, k * 0.4); }
  else { c.arc(0, 0, k * 0.42, 0, 7); c.fill(); }
  c.restore();
}

// bússola: tira com o rumo, letras a cada 45°, números a cada 15°, marcadores e colegas de clã
export function drawCompass(cv, head, me, mates) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr); if (!W || !H) return;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const c = cv.getContext('2d'), FOVD = 130, ppd = W / FOVD, X = b => { let d = b - head; d = ((d + 540) % 360) - 180; return W / 2 + d * ppd; };
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(12,11,10,0)'); g.addColorStop(0.12, 'rgba(12,11,10,.55)'); g.addColorStop(0.88, 'rgba(12,11,10,.55)'); g.addColorStop(1, 'rgba(12,11,10,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H * 0.62);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const fade = x => Math.max(0, 1 - Math.pow(Math.abs(x - W / 2) / (W / 2), 3));
  for (let b = 0; b < 360; b += 5) { const x = X(b); if (x < 0 || x > W) continue; const a = fade(x), card = b % 45 === 0, num = b % 15 === 0;
    c.globalAlpha = a; c.fillStyle = card ? '#F4F1EA' : 'rgba(238,233,224,.7)';
    if (card) { c.font = `700 ${Math.round(H * 0.3)}px "Roboto Condensed",sans-serif`; c.fillStyle = b === 0 ? '#F07A68' : '#F4F1EA'; c.fillText(CARD[b / 45], x, H * 0.3); }
    else if (num) { c.font = `600 ${Math.round(H * 0.22)}px "Roboto Condensed",sans-serif`; c.fillText(String(b), x, H * 0.3); }
    else c.fillRect(x - dpr * 0.5, H * 0.24, dpr, H * 0.12); }
  c.globalAlpha = 1;
  // marcadores e colegas: na borda da tira quando estão fora
  const pin = (b, draw) => { let x = X(b); const off = x < H * 0.4 || x > W - H * 0.4; x = Math.max(H * 0.4, Math.min(W - H * 0.4, x)); c.globalAlpha = off ? 0.55 : 1; draw(x); c.globalAlpha = 1; };
  for (const m of (window.G && window.G.ARENA ? [] : marks)) { const dx = m.x - me.x, dz = m.z - me.z, d = Math.hypot(dx, dz); if (d < 3) continue; pin(bearing(dx, dz), x => { drawSym(c, m.s, x, H * 0.66, H * 0.15, MCOL[m.c] || MCOL[0]); c.font = `600 ${Math.round(H * 0.17)}px "Roboto Condensed",sans-serif`; c.fillStyle = '#EEE9E0'; c.fillText(distTxt(d), x, H * 0.9); }); }
  for (const m of mates || []) { const dx = m.x - me.x, dz = m.z - me.z; pin(bearing(dx, dz), x => { c.fillStyle = '#6FA8FF'; c.strokeStyle = '#0d1520'; c.lineWidth = dpr; c.beginPath(); c.arc(x, H * 0.66, H * 0.08, 0, 7); c.fill(); c.stroke(); }); }
  // rumo atual: marca ao centro e o número
  c.fillStyle = '#F4F1EA'; c.beginPath(); c.moveTo(W / 2 - H * 0.08, H * 0.56); c.lineTo(W / 2 + H * 0.08, H * 0.56); c.lineTo(W / 2, H * 0.47); c.closePath(); c.fill();
  return Math.round(head) % 360;
}
