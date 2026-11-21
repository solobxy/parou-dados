// Grelhas de inventário (estilo Tarkov), cinto, equipamento e loot.
import { ITEMS, LOOT, LOOT_N, COUNT, ammoOf } from './items.js';

let uid = 1;
export const mkItem = (k, n = 1) => { const it = { id: uid++, k, n }; const d = ITEMS[k], g = d.gun; if (g) { it.ammo = 0; it.ak = ammoOf(g)[0]; it.att = {}; if (g.clip) it.mg = g.clip; } if (d.clip) { it.am = 0; it.ak = d.clip.ammo[0]; } return it; };
// balas que cabem na arma agora (com carregador: as do carregador metido; sem ele, zero)
export const capOf = it => { const g = ITEMS[it.k].gun; if (!g) return 0; return g.clip ? (it.mg ? ITEMS[it.mg].clip.cap : 0) : g.mag; };

// tamanho na grelha (rodado troca largura e altura)
export const IW = it => it.r ? ITEMS[it.k].h : ITEMS[it.k].w;
export const IH = it => it.r ? ITEMS[it.k].w : ITEMS[it.k].h;

export class Grid {
  constructor(cols, rows) { this.cols = cols; this.rows = rows; this.list = []; }
  occ(x, y, w, h, ignore) { for (const e of this.list) { if (e.it === ignore) continue; const ew = IW(e.it), eh = IH(e.it); if (x < e.x + ew && x + w > e.x && y < e.y + eh && y + h > e.y) return true; } return false; }
  fits(it, x, y, rows = this.rows) { const w = IW(it), h = IH(it); return x >= 0 && y >= 0 && x + w <= this.cols && y + h <= rows && !this.occ(x, y, w, h, it); }
  // procura espaço; se não houver, tenta rodado
  firstFit(it, rows = this.rows) { const scan = () => { for (let y = 0; y < rows; y++) for (let x = 0; x < this.cols; x++) if (this.fits(it, x, y, rows)) return [x, y]; return null; }; let p = scan(); if (p) return p; const d = ITEMS[it.k]; if (d.w === d.h) return null; it.r = !it.r; p = scan(); if (!p) it.r = !it.r; return p; }
  add(it, x, y) { this.list.push({ it, x, y }); }
  remove(it) { const i = this.list.findIndex(e => e.it === it); if (i >= 0) this.list.splice(i, 1); return i >= 0; }
  has(it) { return this.list.some(e => e.it === it); }
  at(x, y) { for (const e of this.list) { if (x >= e.x && x < e.x + IW(e.it) && y >= e.y && y < e.y + IH(e.it)) return e; } return null; }
  // junta a pilhas e depois procura espaço; devolve o que sobrou
  insert(it, rows = this.rows) {
    const d = ITEMS[it.k];
    if (d.st) for (const e of this.list) if (e.it.k === it.k && e.it.n < d.st) { const m = Math.min(d.st - e.it.n, it.n); e.it.n += m; it.n -= m; if (!it.n) return 0; }
    const p = this.firstFit(it, rows); if (p) { this.add(it, p[0], p[1]); return 0; }
    return it.n;
  }
  count(k) { let n = 0; for (const e of this.list) if (e.it.k === k) n += e.it.n; return n; }
  take(k, n) { let got = 0; const st = this.list.filter(e => e.it.k === k).sort((a, b) => a.it.n - b.it.n); for (const e of st) { const m = Math.min(e.it.n, n - got); e.it.n -= m; got += m; if (!e.it.n) this.remove(e.it); if (got >= n) break; } return got; }
  get empty() { return this.list.length === 0; }
}

export class Inv {
  constructor() { this.bag = new Grid(6, 6); this.belt = Array(6).fill(null); this.eq = { head: null, vest: null, back: null }; }
  rows() { return 4 + (this.eq.back ? ITEMS[this.eq.back.k].rows : 0); }
  count(k) { let n = this.bag.count(k); for (const b of this.belt) if (b && b.k === k) n += b.n; return n; }
  take(k, n) { let got = this.bag.take(k, n); for (let i = 0; i < 6 && got < n; i++) { const b = this.belt[i]; if (b && b.k === k) { const m = Math.min(b.n, n - got); b.n -= m; got += m; if (!b.n) this.belt[i] = null; } } return got; }
  // devolve o que não coube
  give(it) {
    const d = ITEMS[it.k];
    if (d.st) for (const b of this.belt) if (b && b.k === it.k && b.n < d.st) { const m = Math.min(d.st - b.n, it.n); b.n += m; it.n -= m; if (!it.n) return 0; }
    if (d.melee || d.gun) { const i = this.belt.indexOf(null); if (i >= 0) { this.belt[i] = it; return 0; } }
    const left = this.bag.insert(it, this.rows()); if (!left) return 0;
    if (d.eq && !this.eq[d.eq]) { this.eq[d.eq] = it; return 0; }
    const i = this.belt.indexOf(null); if (i >= 0) { this.belt[i] = it; return 0; }
    return left;
  }
  where(it) {
    if (this.bag.has(it)) return { t: 'bag' };
    const i = this.belt.indexOf(it); if (i >= 0) return { t: 'belt', i };
    for (const s in this.eq) if (this.eq[s] === it) return { t: 'eq', s };
    return null;
  }
  // peso total: objetos, balas carregadas nas armas e acessórios montados
  weight() { let kg = 0; for (const it of this.all()) { const d = ITEMS[it.k]; kg += (d.kg || 0) * (it.n || 1); if (d.gun) { if (it.ammo && it.ak && ITEMS[it.ak]) kg += ITEMS[it.ak].kg * it.ammo; if (it.mg && ITEMS[it.mg]) kg += ITEMS[it.mg].kg; for (const a of Object.values(it.att || {})) if (a && ITEMS[a]) kg += ITEMS[a].kg; } if (d.clip && it.am && ITEMS[it.ak]) kg += ITEMS[it.ak].kg * it.am; } return kg; }
  all() { return [...this.bag.list.map(e => e.it), ...this.belt.filter(Boolean), ...Object.values(this.eq).filter(Boolean)]; }
}

export function rollLoot(table, grid) {
  const T = LOOT[table], [a, b] = LOOT_N[table]; const n = a + Math.floor(Math.random() * (b - a + 1));
  const tot = T.reduce((s, x) => s + x[1], 0);
  for (let i = 0; i < n; i++) {
    let r = Math.random() * tot, k = T[0][0]; for (const [kk, w] of T) { r -= w; if (r <= 0) { k = kk; break; } }
    const c = COUNT[k] ? COUNT[k][0] + Math.floor(Math.random() * (COUNT[k][1] - COUNT[k][0] + 1)) : 1;
    const it = mkItem(k, c); if (ITEMS[k].gun) it.ammo = Math.max(1, Math.round(capOf(it) * (0.45 + Math.random() * 0.55))); if (ITEMS[k].clip && Math.random() < 0.6) it.am = Math.round(ITEMS[k].clip.cap * Math.random());
    grid.insert(it);
  }
}
