// hitmarker: sons diferentes para acertar, cabeça, matar, colete; levar um tiro tem som próprio; o gemido não se repete a cada bala
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.audio.start(); }); await W(14000);
  const miss = await ev(() => ['hm', 'hm-cabeca', 'hm-morte', 'hm-colete', 'levar', 'dor'].filter(k => !G.audio.has(k))); console.log((miss.length ? 'FALHA' : 'OK   ') + ' sons carregam ' + miss.join(','));
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { window.__s = []; const a = G.audio, p0 = a.play.bind(a), s0 = a.sample.bind(a); a.play = (n, ...r) => { __s.push(n); return p0(n, ...r); }; a.sample = (n, ...r) => { if (!a.__inPlay) __s.push(n); return s0(n, ...r); }; const p1 = a.play; a.play = (...x) => { a.__inPlay = 1; try { return p1(...x); } finally { a.__inPlay = 0; } }; });
  const rec = async (fn, ms = 200) => { await ev(() => { __s.length = 0; }); await ev(fn); await W(ms); return ev(() => [...__s]); };
  const ok = (c, t, r) => console.log((c ? 'OK   ' : 'FALHA') + ' ' + t + ': ' + r.join(','));
  let r = await rec(() => G.ui.hit(false, 'body', false)); ok(r[0] === 'hm', 'acertar', r);
  r = await rec(() => G.ui.hit(false, 'head', false)); ok(r[0] === 'hm-cabeca', 'cabeça', r);
  r = await rec(() => G.ui.hit(true, 'body', false)); ok(r[0] === 'hm-morte', 'matar', r);
  r = await rec(() => G.ui.hit(false, 'body', true)); ok(r[0] === 'hm-colete', 'colete travou', r);
  r = await rec(async () => { G.p.hp = 100; for (let i = 0; i < 4; i++) G.dbgPvp(5, 'body'); }, 300); ok(r.filter(x => x === 'levar').length === 4 && r.filter(x => x === 'dor').length === 1, '4 balas seguidas: 4× levar, 1 gemido', r);
};
