// A app e as páginas do servidor têm de carregar o script das estatísticas (/_e.js, data-site="parou").
// Fora do servidor real a app responde a /_e.js com um script vazio (200) e a /_e com 204, para não haver erros na consola.
// Uso: BASE=http://127.0.0.1:3000 node estatisticas-etiqueta.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const ETIQUETA = '<script defer src="/_e.js" data-site="parou"></script>';
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
for (const caminho of ['/', '/linhas', '/greves', '/transportes']) {
  try {
    const r = await fetch(BASE + caminho, { headers: { 'User-Agent': 'Mozilla/5.0 (teste)' } });
    const t = await r.text();
    ok(r.status === 200 && t.includes(ETIQUETA), `${caminho} (${r.status}) tem a etiqueta das estatísticas`);
    ok(t.split('/_e.js').length === 2, `${caminho} carrega o script uma só vez`);
  } catch (e) { ok(false, `${caminho}: ${e}`); }
}
const js = await fetch(BASE + '/_e.js');
ok(js.status === 200 && /javascript/.test(js.headers.get('content-type') || ''), `/_e.js responde ${js.status} ${js.headers.get('content-type')}`);
const env = await fetch(BASE + '/_e', { method: 'POST', body: '{"d":{}}', headers: { 'Content-Type': 'text/plain' } });
ok(env.status === 204, `/_e (POST) responde ${env.status}`);
console.log(falhas ? `${falhas} falha(s)` : 'estatísticas: tudo OK');
process.exit(falhas ? 1 : 0);
