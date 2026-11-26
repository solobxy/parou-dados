// o que o renderer desenha numa imagem: chamadas e triângulos por objeto, na passagem principal e nas sombras
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  const spot = process.env.SPOT || 'cidade';
  await ev(s => { const p = G.p; if (s === 'cidade') { p.x = -6; p.z = 3; } else if (s === 'floresta') { p.x = 300; p.z = 300; } else if (s === 'vila') { p.x = 2602; p.z = -2560; } if (s === 'noite') { p.x = -6; p.z = 3; G.cyc = 1710; } G.camT.set(p.x, 0, p.z); }, spot); await W(4000);
  await ev(() => { window.__byCalls = true; }); const out = await ev(() => new Promise(res => { const { cam } = G.dbgL, R = G.renderer, orig = R.renderBufferDirect; const by = {}; let on = false;
    const lab = o => { let s = o.name, q = o; while (!s && q.parent && q.parent.type !== 'Scene') { q = q.parent; s = q.name; } return (s || (o.isInstancedMesh ? 'inst' : o.isPoints ? 'pts' : 'mesh')) + '/' + (o.material.type || '').replace('Material', '') + '/' + (o.geometry.attributes.position ? o.geometry.attributes.position.count : 0) + 'v'; };
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) { if (on) { const pass = camera === cam ? 'M' : camera.isOrthographicCamera ? 'Sol' : 'Luz'; const n = (geometry.index ? (group ? group.count : geometry.index.count) : geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1); const k = pass + ' ' + lab(object); by[k] = by[k] || [0, 0]; by[k][0] += n; by[k][1]++; } return orig.apply(this, arguments); };
    requestAnimationFrame(() => { on = true; requestAnimationFrame(() => { on = false; R.renderBufferDirect = orig; const tot = {}; for (const [k, v] of Object.entries(by)) { const p = k.split(' ')[0]; tot[p] = tot[p] || [0, 0]; tot[p][0] += v[0]; tot[p][1] += v[1]; }
      res({ tot: Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, Math.round(v[0] / 1000) + 'k tris, ' + v[1] + ' calls'])), top: Object.entries(by).sort((a, b) => (window.__byCalls ? b[1][1] - a[1][1] : b[1][0] - a[1][0])).slice(0, 28).map(([k, v]) => (v[0] / 1000).toFixed(0) + 'k ×' + v[1] + ' ' + k), pr: R.getPixelRatio(), size: [R.domElement.width, R.domElement.height] }); }); }); }));
  console.log(JSON.stringify(out, null, 1));
};
