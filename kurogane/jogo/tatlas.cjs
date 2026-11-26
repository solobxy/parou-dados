module.exports = async (page) => {
  const r = await page.evaluate(() => { const W = G.dbgW, A = window.__atlas, y0 = A.cy; let warn = 0; const ow = console.warn; console.warn = (...a) => { if (String(a[0]).includes('atlas')) warn++; ow(...a); };
    let n = 0; for (const L of W.lazy) { if (!L.meshes && !L.job) { W.lazyBuild(L); n++; } } const y1 = A.cy; for (const L of W.lazy) if (W.lazyDrop) W.lazyDrop(L); console.warn = ow; return { zonas: n, atlasAntes: y0, atlasDepois: y1, avisos: warn }; });
  console.log(JSON.stringify(r));
};
