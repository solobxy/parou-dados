// Auditoria da API da PAROU: pedidos maliciosos ou estranhos em todas as rotas, à procura de erros 500,
// fugas de informação, lentidão e rotas de administração abertas. Corre contra um servidor local de teste.
import fs from 'fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };
const achados = [];
const achar = (grav, onde, msg) => { achados.push({ grav, onde, msg }); log(`  >> [${grav}] ${onde}: ${msg}`); };
const LONGO = 'A'.repeat(8000);
const EVIL = ['', "'", '"', '%00', '../../etc/passwd', 'NaN', '-1', '0', '1e999', '99999999999999999999', LONGO, '<script>alert(1)</script>', '{{7*7}}', '__proto__', "' OR 1=1 --", '🚌', '‮abc', 'stcp:801', 'null', 'undefined', '%', '*', '[object Object]'];
const NOMES = ['q', 'lat', 'lon', 'radius', 'id', 'linha', 'operador', 'op', 'near', 'r', 'area', 'from', 'to', 'hora', 'date', 'limit', 'offset', 'page', 'lang', 'ids', 'stop', 'stopId', 'lineId', 'modo', 'mode', 'distrito', 'concelho', 'ordem', 'tipo', 'chave', 'linhas', 'bbox', 'x', 'y', 'z'];
const VAZA = /(\bat [^\n]*\((\/|file:)|node_modules|\/home\/|\/opt\/parou|\/root\/|SQLITE_|SqliteError|TypeError:|ReferenceError:|RangeError:|SyntaxError:|Unexpected token|ENOENT|EACCES)/;

const ipAleatorio = () => `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function pedir(metodo, caminho, { corpo, cab = {}, tipo, timeout = 15000 } = {}) {
  const t0 = Date.now();
  if (!cab['x-forwarded-for']) cab = { ...cab, 'x-forwarded-for': ipAleatorio() };
  try {
    const r = await fetch(BASE + caminho, {
      method: metodo,
      headers: { ...(corpo !== undefined && tipo !== null ? { 'Content-Type': tipo || 'application/json' } : {}), ...cab },
      body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
    const texto = await r.text().catch(() => '');
    return { s: r.status, ms: Date.now() - t0, texto, h: r.headers, ct: r.headers.get('content-type') || '' };
  } catch (e) {
    return { s: 0, ms: Date.now() - t0, texto: String(e), h: new Headers(), ct: '', erro: true };
  }
}
function avaliar(onde, r, esperar4xx = false) {
  if (r.erro) return achar('ALTA', onde, `sem resposta (${r.ms} ms): ${r.texto.slice(0, 100)}`);
  if (r.s >= 500) achar('ALTA', onde, `erro ${r.s}: ${r.texto.slice(0, 160).replace(/\s+/g, ' ')}`);
  if (r.ms > 6000) achar('MÉDIA', onde, `lento: ${r.ms} ms`);
  if (VAZA.test(r.texto.slice(0, 4000))) achar('ALTA', onde, `possível fuga de informação interna: ${(r.texto.match(VAZA) || [''])[0]}`);
}

const GETS = ['/api/incendios', '/api/public-sources', '/api/public-sources/preview', '/api/transit-catalog', '/api/transit/search', '/api/transit/discovery/operators', '/api/transit/discovery/sources', '/api/transit/sources', '/api/transit/loading-status', '/api/lines', '/api/lines/:p', '/api/stops/:p/departures', '/api/transit/line/:p', '/api/transit/tml/vehicles', '/api/transit/tml/agencies', '/api/transit/tml/lines', '/api/transit/tml/alerts', '/api/alertas', '/api/mapa', '/api/central-alerts', '/api/transit/nearby', '/api/transit/stops-cell', '/api/transit/destinations', '/api/transit/plan-route', '/api/coverage', '/api/transit/stop/:p', '/api/transit/percurso', '/api/transit/stops', '/api/transit/vehicles', '/api/conta/eu', '/api/comunidade/ocorrencias', '/api/comunidade/ocorrencias/:p', '/api/comunidade/reclamacoes', '/api/comunidade/reclamacoes/:p/comentarios', '/api/comunidade/conversas', '/api/comunidade/conversas/:p', '/api/estatisticas/estado', '/api/dados-utilizador', '/api/push/chave', '/api/push/estado',
  '/linha/:p', '/paragem/:p', '/linhas/:p', '/linhas/:p/:p', '/paragens/:p', '/paragens/:p/:p', '/greves/:p', '/incendios/:p', '/cidade/:p', '/pesquisa', '/sitemap-paragens-:p.xml'];
const ADMIN_ESPERA_403 = [['GET', '/api/estatisticas/resumo'], ['GET', '/api/transit/diagnostic/national'], ['GET', '/api/transit/tml/diagnostic'], ['GET', '/api/transit/tml/unir-diagnostic'], ['GET', '/api/central-alerts/diagnostic'], ['GET', '/api/coverage/logs'], ['GET', '/api/transit/audit/availability'], ['GET', '/debug/stop/stcp:801'], ['GET', '/debug/nearby'], ['POST', '/api/public-sources/sync'], ['POST', '/api/transit-catalog/probe'], ['POST', '/api/transit/discovery/sync'], ['POST', '/api/central-alerts/sync'], ['POST', '/api/coverage/reingest-all'], ['POST', '/api/coverage/run-discovery'], ['POST', '/api/coverage/test-connection'], ['POST', '/api/feeds/manual'], ['POST', '/api/feeds/x/refresh'], ['GET', '/api/comunidade/admin/contas'], ['GET', '/api/comunidade/admin/estatisticas'], ['GET', '/api/comunidade/admin/fila'], ['GET', '/api/comunidade/admin/avisos-canal'], ['POST', '/api/comunidade/admin/moderar'], ['POST', '/api/comunidade/admin/operador'], ['POST', '/api/comunidade/admin/suspender']];  // notify-sent e diagnostico-unir são públicos de propósito (a app chama-os) e têm limite por IP
const POSTS = ['/api/erros', '/api/estatisticas/visita', '/api/estatisticas/preferencia', '/api/dados-utilizador', '/api/push/subscrever', '/api/push/cancelar', '/api/push/teste', '/api/push/lembrete', '/api/push/lembrete/cancelar', '/api/reports/missing-stop', '/api/ai/classify', '/api/ai/extract-location', '/api/ai/identify-operator', '/api/ai/detect-duplicates', '/api/ai/summarize', '/api/ai/analyze-occurrence', '/api/conta/registar', '/api/conta/entrar', '/api/conta/sair', '/api/conta/ponto-diario', '/api/conta/esqueci', '/api/conta/redefinir', '/api/comunidade/ocorrencias', '/api/comunidade/reclamacoes', '/api/comunidade/conversas', '/api/comunidade/votos', '/api/comunidade/denuncias', '/api/comunidade/bloquear'];
const PUTS = ['/api/conta/perfil', '/api/conta/avatar', '/api/conta/palavra-passe', '/api/conta/favoritos'];
const CORPOS = [{ c: '{}' }, { c: '[]' }, { c: 'null' }, { c: '"texto"' }, { c: '{"a":' }, { c: '{"__proto__":{"poluido":1},"constructor":{"prototype":{"poluido":2}}}' }, { c: '{"texto":"' + 'B'.repeat(200000) + '"}' }, { c: 'a=b&c=d', t: 'application/x-www-form-urlencoded' }, { c: 'texto simples', t: 'text/plain' }, { c: JSON.stringify({ lat: 'x', lon: [], nome: { a: 1 }, email: 12, texto: null, id: {}, subscricao: 'x', endpoint: 5, distritos: 'x', tipo: [], linha: {} }) }];
const TRAVESSIA = ['/server.ts', '/server.main.ts', '/package.json', '/package-lock.json', '/.env', '/.git/config', '/.git/HEAD', '/data/', '/src/App.tsx', '/dados/', '/..%2fserver.ts', '/%2e%2e/server.ts', '/assets/../server.ts', '/assets/..%2f..%2fserver.ts', '/api/../server.ts', '/node_modules/express/package.json', '/etc/passwd', '/vite.config.ts', '/tsconfig.json', '/.well-known/../server.ts', '/%00', '/index.html%00.js', '//server.ts', '/robots.txt/../server.ts'];

(async () => {
  log('# Auditoria da API', new Date().toISOString());
  const h = await pedir('GET', '/health'); log('health', h.s, h.texto.slice(0, 40));

  log('\n## 1. GET com valores maliciosos (', GETS.length, 'rotas ×', EVIL.length, 'valores )');
  for (const rota of GETS) {
    let n5 = 0, lentas = 0, fugas = 0, total = 0;
    for (const v of EVIL) {
      const ev = encodeURIComponent(v);
      const caminho = rota.replace(/:p/g, ev) + (rota.includes('?') ? '&' : '?') + NOMES.slice(0, 18).map((k) => `${k}=${ev}`).join('&');
      if (caminho.length > 60000) continue;
      const r = await pedir('GET', caminho.length > 15000 ? rota.replace(/:p/g, 'x') + '?q=' + encodeURIComponent(v.slice(0, 3000)) : caminho);
      total++;
      if (r.erro || r.s >= 500) { n5++; achar('ALTA', `GET ${rota} [${JSON.stringify(v).slice(0, 30)}]`, `estado ${r.s}: ${r.texto.slice(0, 140).replace(/\s+/g, ' ')}`); }
      else { if (r.ms > 6000) { lentas++; achar('MÉDIA', `GET ${rota} [${JSON.stringify(v).slice(0, 30)}]`, `lento ${r.ms} ms`); } if (VAZA.test(r.texto.slice(0, 4000))) { fugas++; achar('ALTA', `GET ${rota} [${JSON.stringify(v).slice(0, 30)}]`, 'fuga: ' + (r.texto.match(VAZA) || [''])[0]); } }
    }
    // formas especiais de parâmetros
    for (const extra of ['?q[]=a&q[]=b&lat[a]=1&id[$ne]=1', '?q=a&q=b&lat=1&lat=2', '?__proto__[x]=1&constructor[prototype][y]=2']) {
      const r = await pedir('GET', rota.replace(/:p/g, 'x') + extra); total++;
      if (r.erro || r.s >= 500) achar('ALTA', `GET ${rota}${extra}`, `estado ${r.s}: ${r.texto.slice(0, 140).replace(/\s+/g, ' ')}`);
    }
    log(`${rota}: ${total} pedidos, ${n5} erros 5xx, ${lentas} lentos, ${fugas} fugas`);
  }
  const h2 = await pedir('GET', '/health'); log('health depois dos GET:', h2.s);

  log('\n## 2. Rotas de administração sem chave (esperado: 403)');
  for (const [m, c] of ADMIN_ESPERA_403) {
    const r = await pedir(m, c, m === 'POST' ? { corpo: {} } : {});
    const ok = r.s === 403 || r.s === 401;
    log(`${ok ? 'OK  ' : 'FALHA'} ${m} ${c} -> ${r.s}`);
    if (!ok) achar('ALTA', `${m} ${c}`, `devia dar 403 e deu ${r.s}`);
    const r2 = await pedir(m, c + (c.includes('?') ? '&' : '?') + 'chave=curta', m === 'POST' ? { corpo: {} } : {}); // chave curta/errada
    if (r2.s !== 403 && r2.s !== 401) achar('ALTA', `${m} ${c}?chave=curta`, `aceite com chave errada: ${r2.s}`);
    const r3 = await pedir(m, c, { ...(m === 'POST' ? { corpo: {} } : {}), cab: { 'x-parou-admin': 'x'.repeat(40) } });
    if (r3.s !== 403 && r3.s !== 401) achar('ALTA', `${m} ${c} (cabeçalho errado)`, `aceite: ${r3.s}`);
  }

  log('\n## 3. POST/PUT com corpos estranhos');
  for (const [m, lista] of [['POST', POSTS], ['PUT', PUTS]]) {
    for (const rota of lista) {
      let n5 = 0; const estados = new Set();
      for (const c of CORPOS) {
        const r = await pedir(m, rota, { corpo: c.c, tipo: c.t });
        estados.add(r.s);
        if (r.erro || r.s >= 500) { n5++; achar(r.s === 0 ? 'ALTA' : 'ALTA', `${m} ${rota} [${c.c.slice(0, 30)}]`, `estado ${r.s}: ${r.texto.slice(0, 140).replace(/\s+/g, ' ')}`); }
        else if (VAZA.test(r.texto.slice(0, 4000))) achar('ALTA', `${m} ${rota} [${c.c.slice(0, 30)}]`, 'fuga: ' + (r.texto.match(VAZA) || [''])[0]);
      }
      log(`${m} ${rota}: estados ${[...estados].sort().join(',')} (${n5} erros)`);
    }
  }
  const gr = await pedir('POST', '/api/erros', { corpo: JSON.stringify({ x: 'C'.repeat(3 * 1024 * 1024) }) });
  log('corpo de 3 MB ->', gr.s, '(esperado 413)'); if (gr.s !== 413) achar('MÉDIA', 'POST /api/erros 3MB', `devia dar 413 e deu ${gr.s}`);
  const h3 = await pedir('GET', '/health'); log('health depois dos POST:', h3.s);

  log('\n## 4. Ficheiros que nunca devem ser servidos');
  for (const c of TRAVESSIA) {
    const r = await pedir('GET', c);
    const codigo = /\b(import |from ['"]|express\(|require\(|process\.env|"dependencies"|\[core\]|root:x:)/.test(r.texto.slice(0, 5000));
    const bad = codigo || VAZA.test(r.texto.slice(0, 3000));
    log(`${bad ? 'FALHA' : 'OK  '} ${c} -> ${r.s} ${r.ct.split(';')[0]} ${r.texto.length}B`);
    if (bad) achar('CRÍTICA', `GET ${c}`, 'devolve código ou dados internos');
  }

  log('\n## 5. Cabeçalhos e CORS');
  const raiz = await pedir('GET', '/'); const hd = {}; raiz.h.forEach((v, k) => { hd[k] = v; }); log(JSON.stringify(hd));
  for (const [k, esp] of [['x-content-type-options', 'nosniff'], ['referrer-policy', null], ['x-frame-options', null], ['content-security-policy', null]]) { if (!hd[k]) achar('BAIXA', 'cabeçalhos', `falta ${k} (o Caddy pode acrescentar em produção)`); }
  if (hd['x-powered-by']) achar('BAIXA', 'cabeçalhos', `x-powered-by: ${hd['x-powered-by']} (revela a tecnologia)`);
  const cors = await pedir('GET', '/api/transit/loading-status', { cab: { Origin: 'https://exemplo-mau.test' } });
  const acao = cors.h.get('access-control-allow-origin'); log('CORS com origem estranha:', acao || '(sem cabeçalho)');
  if (acao === '*' || acao === 'https://exemplo-mau.test') achar('BAIXA', 'CORS', `access-control-allow-origin: ${acao}`);
  const opt = await pedir('OPTIONS', '/api/conta/entrar', { cab: { Origin: 'https://exemplo-mau.test', 'Access-Control-Request-Method': 'POST' } }); log('OPTIONS ->', opt.s, opt.h.get('access-control-allow-origin') || '');

  log('\n## 6. Contas: registo, sessão, cookies, abuso');
  const mail = `auditoria.${Date.now()}@exemplo.test`; const IP6 = { 'x-forwarded-for': '203.0.113.9' };
  const reg = await pedir('POST', '/api/conta/registar', { corpo: { nome: '<img src=x onerror=alert(1)>Teste', email: mail, palavraPasse: 'Palavra-passe-muito-boa-123' }, cab: { ...IP6, 'x-forwarded-proto': 'https' } });
  log('registar ->', reg.s, reg.texto.slice(0, 200).replace(/\s+/g, ' '));
  const sc = reg.h.get('set-cookie') || ''; log('Set-Cookie:', sc.replace(/=[^;]{10,}/, '=<…>'));
  if (reg.s < 300 && sc) {
    if (!/HttpOnly/i.test(sc)) achar('ALTA', 'cookie de sessão', 'sem HttpOnly');
    if (!/SameSite=(Lax|Strict)/i.test(sc)) achar('MÉDIA', 'cookie de sessão', 'sem SameSite Lax/Strict');
    if (!/Secure/i.test(sc)) achar('MÉDIA', 'cookie de sessão', 'sem Secure (com x-forwarded-proto: https)');
  }
  const fraca = await pedir('POST', '/api/conta/registar', { corpo: { nome: 'x', email: `fraca.${Date.now()}@exemplo.test`, palavraPasse: '1' }, cab: IP6 });
  log('registo com palavra-passe "1" ->', fraca.s, fraca.texto.slice(0, 100)); if (fraca.s < 300) achar('MÉDIA', 'registo', 'aceita palavra-passe de 1 caractere');
  const dup = await pedir('POST', '/api/conta/registar', { corpo: { nome: 'Outro', email: mail.toUpperCase(), palavraPasse: 'Palavra-passe-muito-boa-123' }, cab: IP6 });
  log('registo repetido (maiúsculas) ->', dup.s); if (dup.s < 300) achar('ALTA', 'registo', 'aceita o mesmo email em maiúsculas (contas duplicadas)');
  const estados = [];
  for (let i = 0; i < 40; i++) { const r = await pedir('POST', '/api/conta/entrar', { corpo: { email: mail, palavraPasse: 'errada-' + i }, cab: IP6 }); estados.push(r.s); }
  log('40 palavras-passe erradas seguidas ->', [...new Set(estados)].join(','), '(429 = há limite)'); if (!estados.includes(429)) achar('MÉDIA', 'início de sessão', 'sem limite de tentativas por conta/IP (força bruta)');
  const certa = await pedir('POST', '/api/conta/entrar', { corpo: { email: mail, palavraPasse: 'Palavra-passe-muito-boa-123' } });
  log('entrar com a certa depois das erradas ->', certa.s);
  const cookie = (reg.h.get('set-cookie') || certa.h.get('set-cookie') || '').split(';')[0];
  if (cookie) {
    const eu = await pedir('GET', '/api/conta/eu', { cab: { cookie } }); log('/api/conta/eu ->', eu.s, eu.texto.slice(0, 200));
    if (/palavra_passe|palavraPasse|hash|scrypt|\$2[aby]\$/i.test(eu.texto)) achar('ALTA', '/api/conta/eu', 'devolve dados da palavra-passe');
    const csrf = await pedir('POST', '/api/conta/sair', { corpo: {}, cab: { cookie, 'sec-fetch-site': 'cross-site', origin: 'https://exemplo-mau.test' } });
    log('POST /api/conta/sair com Sec-Fetch-Site cross-site ->', csrf.s);
    const perf = await pedir('PUT', '/api/conta/perfil', { corpo: { nome: 'N'.repeat(5000) }, cab: { cookie } }); log('perfil com nome de 5000 caracteres ->', perf.s, perf.texto.slice(0, 80)); if (perf.s < 300) achar('MÉDIA', 'perfil', 'aceita nome de 5000 caracteres');
    const pub = await pedir('POST', '/api/comunidade/conversas', { corpo: { titulo: '<script>alert(1)</script>', texto: '<img src=x onerror=alert(2)> ' + 'z'.repeat(50), tipo: 'duvida' }, cab: { cookie } }); log('publicar com HTML ->', pub.s, pub.texto.slice(0, 160));
    const lista = await pedir('GET', '/api/comunidade/conversas', { cab: { cookie } }); log('lista de conversas ->', lista.s, lista.texto.slice(0, 100));
    const apagar = await pedir('DELETE', '/api/conta', { corpo: { palavraPasse: 'Palavra-passe-muito-boa-123' }, cab: { cookie } }); log('apagar a conta de teste ->', apagar.s, apagar.texto.slice(0, 100));
    const depois = await pedir('GET', '/api/conta/eu', { cab: { cookie } }); log('sessão depois de apagar a conta ->', depois.s, depois.texto.slice(0, 80));
  }
  const h4 = await pedir('GET', '/health'); log('health no fim:', h4.s);

  log('\n## 7. Pedidos concorrentes (carga leve)');
  const t0 = Date.now(); const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => pedir('GET', i % 2 ? '/api/transit/nearby?lat=41.15&lon=-8.61&radius=800' : '/api/lines?near=41.15,-8.61&r=800')));
  const lat = rs.map((r) => r.ms).sort((a, b) => a - b); log(`60 pedidos em paralelo: ${Date.now() - t0} ms no total; p50=${lat[30]} ms p95=${lat[57]} ms; erros=${rs.filter((r) => r.s >= 500 || r.erro).length}`);
  if (lat[57] > 4000) achar('MÉDIA', 'carga', `p95 ${lat[57]} ms com 60 pedidos paralelos`);

  log('\n## Resumo dos achados');
  const ordem = { CRÍTICA: 0, ALTA: 1, MÉDIA: 2, BAIXA: 3 };
  achados.sort((a, b) => ordem[a.grav] - ordem[b.grav]);
  const vistos = new Set();
  for (const a of achados) { const k = a.grav + a.onde.replace(/\[.*\]/, '') + a.msg.slice(0, 40); if (vistos.has(k)) continue; vistos.add(k); log(`[${a.grav}] ${a.onde}: ${a.msg}`); }
  log('total de achados:', achados.length, '(distintos:', vistos.size, ')');
  fs.writeFileSync(process.env.SAIDA || 'api-resultado.txt', out.join('\n'));
})();
