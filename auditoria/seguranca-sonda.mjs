// Sonda de segurança externa da PAROU: faz pedidos ao site publicado e diz o que responde.
// Só lê; não tenta adivinhar chaves nem palavras-passe e não escreve nada. Corre no servidor (rede com saída).
// Uso: node seguranca-sonda.mjs [https://parou.pt]
import tls from 'node:tls';

const BASE = (process.argv[2] || 'https://parou.pt').replace(/\/$/, '');
const HOST = new URL(BASE).hostname;
const res = [];
const nota = (nivel, titulo, extra = '') => { res.push({ nivel, titulo, extra }); console.log(`${nivel.padEnd(5)} ${titulo}${extra ? ' — ' + extra : ''}`); };

async function pedir(caminho, opc = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(caminho.startsWith('http') ? caminho : BASE + caminho, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...opc });
    const corpo = opc.semCorpo ? '' : (await r.text()).slice(0, 4000);
    return { s: r.status, h: r.headers, c: corpo, ms: Date.now() - t0, ct: r.headers.get('content-type') || '' };
  } catch (e) {
    return { s: 0, h: new Headers(), c: '', erro: String(e?.message || e), ms: Date.now() - t0, ct: '' };
  }
}
const ehHtmlDoSite = (r) => /text\/html/.test(r.ct) && /<div id="root"|<title>PAROU|parou/i.test(r.c);

// ---------- 1. cabeçalhos ----------
console.log('\n## 1. Cabeçalhos');
for (const p of ['/', '/api/health', '/linhas']) {
  const r = await pedir(p, { headers: { accept: 'text/html' } });
  const h = r.h;
  const falta = [];
  if (!h.get('strict-transport-security')) falta.push('HSTS');
  if (!h.get('x-content-type-options')) falta.push('nosniff');
  if (!h.get('x-frame-options') && !/frame-ancestors/.test(h.get('content-security-policy') || '')) falta.push('anti-frame');
  if (!h.get('referrer-policy')) falta.push('referrer-policy');
  if (!h.get('content-security-policy')) falta.push('CSP');
  nota(falta.length ? 'AVISO' : 'OK', `cabeçalhos de ${p} (HTTP ${r.s})`, falta.length ? 'faltam: ' + falta.join(', ') : '');
  if (h.get('server')) nota('INFO', `Server: ${h.get('server')}`);
  if (h.get('x-powered-by')) nota('AVISO', `X-Powered-By: ${h.get('x-powered-by')}`);
}
{
  const r = await pedir('/', { semCorpo: true });
  console.log('CSP:', r.h.get('content-security-policy') || '(nenhuma)');
  console.log('HSTS:', r.h.get('strict-transport-security') || '(nenhum)');
  console.log('Permissions-Policy:', r.h.get('permissions-policy') || '(nenhuma)');
}

// ---------- 2. HTTP -> HTTPS e TLS ----------
console.log('\n## 2. HTTP/TLS');
{
  const r = await pedir(`http://${HOST}/`, { semCorpo: true });
  nota(/^30[1278]$/.test(String(r.s)) && /^https:/.test(r.h.get('location') || '') ? 'OK' : 'AVISO', `http://${HOST}/ → ${r.s} ${r.h.get('location') || ''}`, r.erro || '');
}
await new Promise((ok) => {
  const s = tls.connect({ host: HOST, port: 443, servername: HOST, rejectUnauthorized: true }, () => {
    const c = s.getPeerCertificate();
    const dias = Math.round((new Date(c.valid_to).getTime() - Date.now()) / 86400000);
    nota(dias > 14 ? 'OK' : 'AVISO', `certificado válido até ${c.valid_to} (${dias} dias), ${s.getProtocol()}, ${s.getCipher()?.name}`);
    s.end(); ok();
  });
  s.on('error', (e) => { nota('FALHA', 'TLS', e.message); ok(); });
});
for (const v of ['TLSv1', 'TLSv1.1']) {
  await new Promise((ok) => {
    const s = tls.connect({ host: HOST, port: 443, servername: HOST, minVersion: v, maxVersion: v }, () => { nota('AVISO', `${v} aceite`); s.end(); ok(); });
    s.on('error', () => { nota('OK', `${v} recusado`); ok(); });
  });
}

// ---------- 3. rotas de administração sem chave ----------
console.log('\n## 3. Administração sem chave (esperado 403)');
const admin = [
  ['POST', '/api/public-sources/sync'], ['POST', '/api/transit-catalog/probe'], ['POST', '/api/transit/discovery/sync'],
  ['POST', '/api/central-alerts/sync'], ['POST', '/api/coverage/test-connection'], ['POST', '/api/coverage/reingest-all'],
  ['POST', '/api/coverage/run-discovery'], ['POST', '/api/feeds/manual'], ['POST', '/api/feeds/x/refresh'],
  ['GET', '/api/estatisticas/resumo'], ['GET', '/api/transit/diagnostic/national'], ['GET', '/api/transit/tml/diagnostic'],
  ['GET', '/api/transit/tml/unir-diagnostic'], ['GET', '/api/central-alerts/diagnostic'], ['GET', '/api/coverage/logs'],
  ['GET', '/api/transit/audit/availability'], ['GET', '/debug/stop/x'], ['GET', '/debug/nearby?lat=38.7&lon=-9.1'],
  ['GET', '/api/comunidade/admin/contas'], ['GET', '/api/comunidade/admin/estatisticas'], ['GET', '/api/comunidade/admin/fila'],
  ['GET', '/api/comunidade/admin/avisos-canal'], ['POST', '/api/comunidade/admin/moderar'], ['POST', '/api/comunidade/admin/operador'],
  ['POST', '/api/comunidade/admin/suspender'],
];
// variantes que costumam furar guardas: maiúsculas, HEAD, barra final, ponto e vírgula, duplas barras
const variantes = (m, p) => {
  const [base, q = ''] = p.split('?');
  const v = [[m, p, 'normal']];
  v.push([m, base.toUpperCase() + (q ? '?' + q : ''), 'MAIÚSCULAS']);
  v.push([m, base.replace(/\/([a-z])/g, (_, c) => '/' + c.toUpperCase()) + (q ? '?' + q : ''), 'Capitalizado']);
  if (m === 'GET') v.push(['HEAD', p, 'HEAD']);
  v.push([m, base + '/' + (q ? '?' + q : ''), 'barra final']);
  v.push([m, base.replace('/api/', '/api//') + (q ? '?' + q : ''), 'barra dupla']);
  v.push([m, base + ';x=1' + (q ? '?' + q : ''), 'ponto e vírgula']);
  v.push([m, base.replace(/\/([a-z])/, (_, c) => '/%' + c.charCodeAt(0).toString(16)) + (q ? '?' + q : ''), 'percentagem']);
  if (m === 'POST') v.push(['PUT', p, 'PUT']);
  return v;
};
let abertas = 0;
// Ações pesadas: só o pedido normal (se a guarda falhasse, a variante dispararia mesmo o trabalho em produção)
const PESADAS = new Set(['/api/coverage/reingest-all', '/api/coverage/run-discovery', '/api/transit/discovery/sync', '/api/public-sources/sync', '/api/central-alerts/sync', '/api/transit-catalog/probe']);
for (const [m, p] of admin) {
  for (const [mm, pp, como] of variantes(m, p).filter((v) => !PESADAS.has(p) || v[2] === 'normal')) {
    const r = await pedir(pp, { method: mm, headers: { 'content-type': 'application/json', origin: BASE }, body: mm === 'POST' || mm === 'PUT' ? '{}' : undefined });
    const fechado = r.s === 403 || r.s === 404 || r.s === 401 || r.s === 405 || r.s === 429 || (r.s === 200 && ehHtmlDoSite(r));
    if (!fechado) { abertas++; nota('FALHA', `${mm} ${pp} [${como}] respondeu ${r.s}`, (r.c || '').replace(/\s+/g, ' ').slice(0, 120)); }
    else if (como === 'normal' && r.s !== 403) nota('AVISO', `${mm} ${pp} → ${r.s} (não é 403)`);
  }
}
if (!abertas) nota('OK', 'nenhuma rota de administração respondeu sem chave (incluindo variantes)');

// ---------- 4. ficheiros que nunca devem estar expostos ----------
console.log('\n## 4. Ficheiros sensíveis');
const ficheiros = ['/.env', '/.env.local', '/.git/config', '/.git/HEAD', '/package.json', '/package-lock.json', '/server.main.ts', '/tsconfig.json', '/vite.config.ts',
  '/Caddyfile', '/etc/parou.env', '/utilizadores.db', '/comunidade.db', '/estatisticas.db', '/data/', '/dados/', '/backup/', '/backups/', '/db/', '/.DS_Store',
  '/node_modules/.package-lock.json', '/src/server/comunidade/contas.ts', '/src/main.tsx', '/dist/', '/releases/', '/opt/parou/', '/api/../.env', '/%2e%2e/%2e%2e/etc/passwd',
  '/..%2f..%2f..%2fetc%2fpasswd', '/assets/..%2f..%2fpackage.json', '/.well-known/../.env', '/wp-login.php', '/phpinfo.php', '/server-status', '/admin', '/admin/', '/.htaccess',
  '/sitemap.xml.bak', '/index.html.bak', '/debug', '/metrics', '/api/docs', '/swagger.json', '/openapi.json', '/graphql'];
const exp = [];
for (const f of ficheiros) {
  const r = await pedir(f, { headers: { accept: '*/*' } });
  const conteudoSensivel = /root:.*:0:0|DB_PASSWORD|PRIVATE KEY|PAROU_ADMIN|VAPID_PRIVATE|"name":\s*"|SQLite format|\[core\]|import .* from|ref: refs\/heads/.test(r.c);
  const ehSPA = r.s === 200 && ehHtmlDoSite(r);
  if (r.s === 200 && !ehSPA) { exp.push(f); nota('FALHA', `${f} → 200 (${r.ct})`, r.c.replace(/\s+/g, ' ').slice(0, 100)); }
  else if (conteudoSensivel) { exp.push(f); nota('FALHA', `${f} → conteúdo suspeito`, r.c.slice(0, 100)); }
  else if (r.s >= 500) nota('AVISO', `${f} → ${r.s}`);
}
if (!exp.length) nota('OK', `${ficheiros.length} caminhos sensíveis: nenhum expõe ficheiros (o site devolve a página inicial ou 404)`);

// ---------- 5. CORS e métodos ----------
console.log('\n## 5. CORS e métodos');
for (const p of ['/api/conta/eu', '/api/lines?limit=1', '/api/comunidade/ocorrencias']) {
  const r = await pedir(p, { headers: { origin: 'https://evil.example' }, semCorpo: true });
  const ac = r.h.get('access-control-allow-origin'); const cr = r.h.get('access-control-allow-credentials');
  nota(ac && (ac === '*' || /evil/.test(ac)) && cr === 'true' ? 'FALHA' : ac ? 'AVISO' : 'OK', `CORS ${p}`, `allow-origin=${ac || '-'} credentials=${cr || '-'}`);
}
{
  const r = await pedir('/api/conta/entrar', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' }, semCorpo: true });
  nota(r.h.get('access-control-allow-origin') ? 'AVISO' : 'OK', `OPTIONS preflight de origem estranha → ${r.s}`, `allow-origin=${r.h.get('access-control-allow-origin') || '-'}`);
}
for (const m of ['TRACE', 'PUT', 'DELETE', 'PATCH']) {
  const r = await pedir('/', { method: m, semCorpo: true });
  nota(r.s === 200 && m === 'TRACE' ? 'FALHA' : 'INFO', `${m} / → ${r.s}`);
}
// escrita com origem de outro site tem de ser recusada
for (const p of ['/api/conta/registar', '/api/conta/entrar', '/api/comunidade/ocorrencias', '/api/comunidade/conversas']) {
  const r = await pedir(p, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  nota(r.s === 403 ? 'OK' : 'FALHA', `POST ${p} com origem estranha → ${r.s}`);
}
{
  // sem cabeçalho Origin (curl) — tem de ser tratado por outras defesas (cookie SameSite)
  const r = await pedir('/api/conta/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sonda-inexistente@example.invalid', palavraPasse: 'x' }) });
  nota(r.s === 401 || r.s === 429 ? 'OK' : 'AVISO', `login falhado devolve ${r.s}`, (r.c || '').slice(0, 100));
}

// ---------- 6. erros e fugas de informação ----------
console.log('\n## 6. Erros e fugas');
const ruins = [
  ['POST', '/api/conta/entrar', '{"email":'], ['POST', '/api/dados-utilizador', '{"x":'], ['POST', '/api/erros', 'não é json'],
  ['GET', '/api/lines/%', ''], ['GET', '/api/transit/stop/%00', ''], ['GET', '/api/stops/%E0%A4%A/departures', ''], ['GET', '/api/transit/nearby?lat=abc&lon=x', ''],
  ['GET', "/api/lines?q='%20OR%201=1--", ''], ['GET', "/api/transit/search?q=%22%3E%3Cscript%3E", ''], ['GET', '/linha/%3Cscript%3Ealert(1)%3C/script%3E', ''],
  ['GET', '/pesquisa?q=%22%3E%3Cscript%3Ealert(1)%3C/script%3E', ''], ['GET', '/api/lines?cidades[a]=1&q[]=x', ''],
];
for (const [m, p, corpo] of ruins) {
  const r = await pedir(p, { method: m, headers: { 'content-type': 'application/json', origin: BASE }, body: m === 'POST' ? corpo : undefined });
  const vaza = /at .*\(.*\.(ts|js|mjs):\d+|node_modules|\/opt\/parou|\/home\/|SyntaxError|SQLITE|stack/i.test(r.c) || /"details"/.test(r.c);
  const xss = /<script>alert\(1\)/.test(r.c);
  nota(xss ? 'FALHA' : vaza ? 'AVISO' : 'OK', `${m} ${p} → ${r.s}`, xss ? 'REFLETE <script>' : vaza ? 'resposta mostra detalhe interno: ' + r.c.replace(/\s+/g, ' ').slice(0, 140) : '');
}

// ---------- 7. dados que não deviam ser públicos ----------
console.log('\n## 7. Dados públicos (confirmar que são mesmo públicos)');
for (const p of ['/api/health', '/api/coverage', '/api/transit/sources', '/api/push/estado', '/api/transit-catalog', '/api/public-sources', '/api/transit/loading-status', '/api/comunidade/ocorrencias?limit=1']) {
  const r = await pedir(p);
  const mail = (r.c.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).filter((e) => !/example|parou\.pt|noreply/.test(e));
  const ip = /\b(10|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+(\.\d+)?\b/.test(r.c) || /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(r.c);
  const seg = /(api[_-]?key|secret|token|password|passwd|authorization)["']?\s*[:=]\s*["'][^"']{6,}/i.test(r.c);
  nota(mail.length || seg ? 'FALHA' : ip ? 'AVISO' : 'OK', `${p} → ${r.s}, ${r.c.length}+ bytes`, mail.length ? 'tem emails: ' + mail.slice(0, 2).join(',') : seg ? 'parece ter segredos' : ip ? 'tem endereços IP' : '');
}
for (const p of ['/api/coverage', '/api/transit/sources', '/api/transit-catalog', '/api/public-sources']) {
  const r = await pedir(p);
  const urls = [...new Set((r.c.match(/https?:\/\/[^"'\s,)]+\?[^"'\s,)]*(key|token|apikey|api_key|secret)=[^"'\s&,)]+/gi) || []))];
  if (urls.length) nota('FALHA', `${p} mostra URLs com chave`, urls.slice(0, 2).map((u) => u.replace(/=[^&]+/g, '=***')).join(' | '));
}

// ---------- 8. cookies ----------
console.log('\n## 8. Cookies');
for (const [p, m, corpo] of [['/api/dados-utilizador', 'GET'], ['/api/estatisticas/visita', 'POST', '{"o":"site"}']]) {
  const r = await pedir(p, { method: m, headers: { 'content-type': 'application/json', origin: BASE, 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'sec-fetch-site': 'same-origin' }, body: corpo, semCorpo: true });
  const sc = r.h.getSetCookie?.() || [];
  for (const c of sc) {
    const falta = [];
    if (!/httponly/i.test(c)) falta.push('HttpOnly');
    if (!/secure/i.test(c)) falta.push('Secure');
    if (!/samesite/i.test(c)) falta.push('SameSite');
    nota(falta.length ? 'AVISO' : 'OK', `cookie ${c.split('=')[0]} (${p})`, falta.length ? 'falta ' + falta.join(', ') : 'HttpOnly, Secure, SameSite');
  }
}

// ---------- 9. outros nomes do servidor ----------
console.log('\n## 9. Outras portas/nomes');
for (const h of [`www.${HOST}`]) {
  const r = await pedir(`https://${h}/`, { semCorpo: true });
  nota('INFO', `https://${h}/ → ${r.s} ${r.h.get('location') || ''}`, r.erro || '');
}

const f = res.filter((x) => x.nivel === 'FALHA').length, a = res.filter((x) => x.nivel === 'AVISO').length;
console.log(`\nRESUMO: ${res.length} verificações · ${f} falhas · ${a} avisos`);
