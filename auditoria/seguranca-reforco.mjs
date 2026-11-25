// Reforço de segurança (25/11/2026): scripts estranhos bloqueados (CSP a valer), chave de administração só no cabeçalho, e
// campo isco contra robôs nos formulários. Corre contra a app a correr (no CI com PAROU_ADMIN_TOKEN de ensaio).
// Uso: BASE=http://127.0.0.1:3000 APP=pasta-da-app CHAVE=ensaio-chave-admin-1234567890 node seguranca-reforco.mjs
import fs from 'fs';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const APP = process.env.APP || '../app';
const CHAVE = process.env.CHAVE || 'ensaio-chave-admin-1234567890';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// 1. A regra contra scripts estranhos vale (não é só aviso)
{
  const r = await fetch(BASE + '/');
  const csp = r.headers.get('content-security-policy') || '';
  ok('[CSP] a página traz script-src a valer', /script-src 'self'/.test(csp) && /sha256-/.test(csp), csp.slice(0, 80));
  ok('[CSP] sem o modo «só avisar»', !r.headers.get('content-security-policy-report-only'));
  ok('[CSP] os avisos continuam a chegar (report-uri) com amostra', /report-uri \/api\/csp-report/.test(csp) && /'report-sample'/.test(csp));
}
// 2. Chave de administração só no cabeçalho
{
  const cab = await fetch(BASE + '/api/central-alerts/diagnostic', { headers: { 'x-parou-admin': CHAVE } });
  const end = await fetch(BASE + '/api/central-alerts/diagnostic?chave=' + encodeURIComponent(CHAVE));
  const sem = await fetch(BASE + '/api/central-alerts/diagnostic');
  ok('[admin] com a chave no cabeçalho entra', cab.status === 200, String(cab.status));
  ok('[admin] com a chave no endereço (?chave=) não entra', end.status === 403, String(end.status));
  ok('[admin] sem chave não entra', sem.status === 403, String(sem.status));
}
// 3. Campo isco: o robô recebe «ok» mas nada fica guardado
{
  const corpo = { title: 'Teste robô isco', description: 'Isto não pode ficar guardado', type: 'ATRASO', severity: 'Moderada', district: 'Lisboa', city: 'Lisboa', latitude: 38.72, longitude: -9.14 };
  const r = await fetch(BASE + '/api/comunidade/ocorrencias', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-parou-isco': '1', Origin: BASE }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  ok('[isco] o robô recebe uma resposta normal', r.status === 201 && !!j.id, `${r.status} ${JSON.stringify(j)}`);
  const lida = j.id ? await fetch(BASE + '/api/comunidade/ocorrencias/' + encodeURIComponent(j.id)) : null;
  ok('[isco] mas nada fica guardado', !lida || lida.status === 404, String(lida?.status));
  const lista = await fetch(BASE + '/api/comunidade/ocorrencias').then((x) => x.json()).catch(() => ({}));
  ok('[isco] não aparece na lista', !JSON.stringify(lista).includes('Teste robô isco'));
  const reg = await fetch(BASE + '/api/conta/registar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-parou-isco': '1', Origin: BASE }, body: JSON.stringify({ email: 'robo-isco@exemplo.pt', palavraPasse: 'umapalavragrande1', nome: 'Robo' }) });
  const jr = await reg.json().catch(() => ({}));
  ok('[isco] registo de robô não cria conta nem sessão', reg.status === 200 && jr.utilizador === null && !reg.headers.get('set-cookie'), `${reg.status} ${JSON.stringify(jr)}`);
  for (const f of ['src/components/LoginModal.tsx', 'src/components/ReportModal.tsx', 'src/components/ReclamacoesView.tsx', 'src/components/comunidade/Compositor.tsx']) {
    ok(`[isco] o formulário de ${f.split('/').pop()} tem o campo escondido`, fs.readFileSync(`${APP}/${f}`, 'utf8').includes('<CampoIsco />'));
  }
}
// 4. Com a regra a valer, as páginas da PAROU não perdem nenhum script próprio
{
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'pt-PT', serviceWorkers: 'block' });
  await ctx.addInitScript({ content: `window.__csp=[];document.addEventListener('securitypolicyviolation',function(e){window.__csp.push((e.effectiveDirective||'')+' '+(e.blockedURI||'')+' '+(e.sample||'').slice(0,40))});try{localStorage.setItem('parou_aviso_instalar','1');localStorage.setItem('parou_bemvindo','visto');}catch(e){}` });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  for (const u of ['/', '/horarios', '/alertas', '/sobre', '/privacidade', '/greves', '/linhas', '/linhas/carris-metropolitana', '/nao-existe-xyz']) {
    await p.goto(BASE + u, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const v = await p.evaluate(() => window.__csp || []);
    // Campo isco não aparece a ninguém
    const iscoVisivel = await p.evaluate(() => Array.from(document.querySelectorAll('input[data-isco]')).some((i) => { const r = i.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.width > 0; }));
    ok(`[página ${u}] nenhum script da PAROU bloqueado`, v.length === 0, v.join(' | '));
    if (iscoVisivel) ok(`[página ${u}] o campo isco não se vê`, false);
  }
  ok('[páginas] sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
