// paredes dos pisos de cima: procura buracos no contorno de cada prédio (onde se atravessa a parede e se cai)
module.exports = async (page) => {
  const r = await page.evaluate(() => { const W = G.W || G.dbgW; const out = []; let nb = 0;
    for (const c of W.cuts) { if (!c.n || c.n < 2) continue; nb++;
      for (let L = 1; L < c.n; L++) { const R = W.rects.filter(r => (r.lv || 0) === L && r.x1 > c.x0 - 0.5 && r.x0 < c.x1 + 0.5 && r.z1 > c.z0 - 0.5 && r.z0 < c.z1 + 0.5 && r.h > 0.5);
        const gaps = []; const test = (x, z) => R.some(r => x >= r.x0 - 0.12 && x <= r.x1 + 0.12 && z >= r.z0 - 0.12 && z <= r.z1 + 0.12);
        const e = 0.12; let run = 0, st = null;
        const walk = (pts) => { for (const [x, z] of pts) { if (!test(x, z)) { run++; if (!st) st = [x, z]; } else { if (run >= 3) gaps.push([...st.map(v => +v.toFixed(1)), run * 0.25]); run = 0; st = null; } } if (run >= 3) gaps.push([...st.map(v => +v.toFixed(1)), run * 0.25]); run = 0; st = null; };
        const xs = [], zs = []; for (let x = c.x0 + 0.3; x <= c.x1 - 0.3; x += 0.25) xs.push(x); for (let z = c.z0 + 0.3; z <= c.z1 - 0.3; z += 0.25) zs.push(z);
        walk(xs.map(x => [x, c.z0 + e])); walk(xs.map(x => [x, c.z1 - e])); walk(zs.map(z => [c.x0 + e, z])); walk(zs.map(z => [c.x1 - e, z]));
        if (gaps.length) out.push({ id: c.id, L, n: c.n, box: [c.x0, c.z0, c.x1, c.z1].map(v => +v.toFixed(1)), gaps: gaps.slice(0, 4) }); } }
    return { nb, bad: out.length, list: out.slice(0, 25) }; });
  console.log(JSON.stringify(r, null, 0));
};
