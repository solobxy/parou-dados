module.exports = async (page) => {
  const r = await page.evaluate(() => { const T = G.TER, W = G.W, o = {}; const chk = (name, L, f) => { let n = 0, ex = []; for (const q of L) { const [x, z] = f(q); const h = T.at(x, z); if (h > 0.3) { n++; if (ex.length < 3) ex.push([Math.round(x), Math.round(z), +h.toFixed(1), q.label || q.k || q.kind || '']); } } o[name] = [L.length, n, ex]; };
    chk('containers', W.containers.filter(c => !c.dep), c => [c.x, c.z]); chk('lamps', W.lamps, l => Array.isArray(l) ? l : [l.x, l.z]); chk('steps', W.steps.filter(s => !s.base), s => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2]);
    chk('cuts', W.cuts, c => [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2]); chk('doors', W.doors.filter(d => !d.base), d => [d.x, d.z]); chk('rects', W.rects.filter(r => !r.base && !r.lv), r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]);
    chk('streetTrees', W.streetTrees || [], t => t); chk('pads', W.pads || [], r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]);
    return o; });
  console.log(JSON.stringify(r, null, 0));
};
