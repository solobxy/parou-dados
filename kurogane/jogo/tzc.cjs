module.exports = async (page) => { const ev = (f, a) => page.evaluate(f, a);
  console.log(await ev(async () => { const m = await import('./main.js').catch(() => null); return 'x'; }).catch(e => 'n/a'));
};
