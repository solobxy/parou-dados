/*! Estatísticas próprias (dinissousa) — sem cookies, sem guardar IPs.
 * Uso: <script defer src="/_e.js" data-site="ID"></script>
 * Eventos próprios: estat('nome', 'valor')
 * Não contar este dispositivo: abrir qualquer site com ?naocontar (volta a contar com ?contar)
 */
(function () {
  'use strict';
  var w = window, d = document, n = navigator, loc = location;
  var script = d.currentScript || d.querySelector('script[data-site][src*="_e.js"]');
  var SITE = script && script.getAttribute('data-site');
  var URL_ENVIO = (script && script.getAttribute('data-endpoint')) || '/_e';
  if (!SITE || w.__estat) return;
  w.__estat = 1;

  // Opção de não contar (o Dinis e quem trabalha nos sites)
  try {
    var qs0 = loc.search;
    if (/[?&]naocontar\b/.test(qs0)) localStorage.setItem('estat_ignorar', '1');
    if (/[?&]contar\b/.test(qs0)) localStorage.removeItem('estat_ignorar');
    if (localStorage.getItem('estat_ignorar') === '1') { w.estat = function () {}; return; }
  } catch (e) {}

  var ua = n.userAgent || '';
  if (n.webdriver || /bot|crawl|spider|headless|lighthouse|pagespeed|preview/i.test(ua)) return;

  function uuid() {
    if (w.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (w.crypto || w.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = ''; for (var i = 0; i < 16; i++) h += (b[i] + 256).toString(16).slice(1);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function corta(s, k) { s = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); return s.length > k ? s.slice(0, k) : s; }
  function alturaDoc() { var b = d.body, e = d.documentElement; return Math.max(b ? b.scrollHeight : 0, e.scrollHeight, e.clientHeight); }
  function larguraDoc() { var b = d.body, e = d.documentElement; return Math.max(b ? b.scrollWidth : 0, e.scrollWidth, e.clientWidth) || w.innerWidth || 1; }

  // Dispositivo, sistema e navegador (só categorias, nada que identifique a pessoa)
  function dispositivo() {
    if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1)) return 'tablet';
    if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'telemovel';
    return 'computador';
  }
  function sistema() {
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Outro';
  }
  function navegador() {
    if (/Instagram/.test(ua)) return 'Instagram (app)';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook (app)';
    if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'TikTok (app)';
    if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
    if (/OPR\/|Opera/.test(ua)) return 'Opera';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
    if (/CriOS/.test(ua)) return 'Chrome';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Outro';
  }
  function app() {
    if (/Instagram/.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook';
    if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'TikTok';
    if (/LinkedInApp/.test(ua)) return 'LinkedIn';
    return '';
  }

  // Estado da página vista atual
  var pv, fila = { c: [], e: [], x: [] }, errosVistos = {};
  var ativoMs, ultimoAtivo, scrollMax, nCliques, vitals, ultimos = [];

  function novaPagina() {
    pv = { id: uuid(), caminho: loc.pathname || '/', inicio: Date.now() };
    ativoMs = 0; ultimoAtivo = Date.now(); scrollMax = 0; nCliques = 0;
    vitals = { lcp: 0, cls: 0, inp: 0 };
    medirScroll();
    var ref = '', rd = '';
    try {
      if (d.referrer) {
        var r = new URL(d.referrer);
        if (r.hostname !== loc.hostname) { rd = r.hostname.replace(/^www\./, ''); ref = corta(r.hostname + r.pathname, 300); }
      }
    } catch (e) {}
    var p = new URLSearchParams(loc.search);
    var ad = p.get('gclid') || p.get('gbraid') || p.get('wbraid') ? 'google' : (p.get('fbclid') ? 'meta' : (p.get('ttclid') ? 'tiktok' : ''));
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var v = {
      p: corta(pv.caminho, 300), ti: corta(d.title, 200), r: ref, rd: rd,
      us: corta(p.get('utm_source'), 100), um: corta(p.get('utm_medium'), 100), uc: corta(p.get('utm_campaign'), 150),
      uo: corta(p.get('utm_content'), 150), ut: corta(p.get('utm_term'), 150), ad: ad, ap: app(),
      fu: tz, il: corta(n.language, 20), dp: dispositivo(), so: sistema(), nv: navegador(),
      el: screen.width, ea: screen.height, jl: w.innerWidth, ja: w.innerHeight
    };
    pv.v = v;
    enviar({}, false);
  }

  // Tempo ativo: conta só com a página à vista e alguém a mexer nos últimos 30 s
  function mexeu() { ultimoAtivo = Date.now(); }
  setInterval(function () {
    if (d.visibilityState === 'visible' && Date.now() - ultimoAtivo < 30000) ativoMs += 1000;
  }, 1000);
  ['mousemove', 'keydown', 'touchstart', 'pointerdown', 'wheel'].forEach(function (t) { w.addEventListener(t, mexeu, { passive: true, capture: true }); });

  // Até onde a pessoa desceu (%)
  var agendado = false;
  function medirScroll() {
    agendado = false;
    var h = alturaDoc(), vis = (w.scrollY || d.documentElement.scrollTop || 0) + w.innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round(vis / h * 100)) : 100;
    if (pct > scrollMax) scrollMax = pct;
  }
  w.addEventListener('scroll', function () { mexeu(); if (!agendado) { agendado = true; requestAnimationFrame(medirScroll); } }, { passive: true });

  // Cliques: posição na página, o elemento e se parece clicável
  var INTERATIVO = 'a,button,input,select,textarea,label,summary,option,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[onclick],[tabindex]:not([tabindex="-1"])';
  function nomeElemento(el) {
    var partes = [], i = 0;
    while (el && el.nodeType === 1 && el !== d.body && i < 3) {
      var s = el.tagName.toLowerCase();
      if (el.id && !/\d{3,}/.test(el.id)) { partes.unshift(s + '#' + el.id); break; }
      var cl = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(function (c) { return c && !/\d{3,}|^(is-|has-)/.test(c) && c.length < 30; });
      if (cl.length) s += '.' + cl.slice(0, 2).join('.');
      partes.unshift(s); el = el.parentElement; i++;
    }
    return corta(partes.join(' > '), 200);
  }
  function textoDe(el) {
    if (!el || el.closest('[data-estat-ignorar],[contenteditable],input,textarea,select')) return '';
    var t = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '';
    if (!t) t = el.innerText || el.textContent || '';
    if (!t) { var img = el.querySelector && el.querySelector('img[alt]'); if (img) t = img.getAttribute('alt'); }
    return corta(t, 80);
  }
  d.addEventListener('click', function (ev) {
    try {
      var alvo = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target && ev.target.parentElement;
      if (!alvo) return;
      mexeu(); nCliques++;
      var inter = alvo.closest(INTERATIVO);
      var el = inter || alvo;
      var clicavel = !!inter;
      if (!clicavel) { try { clicavel = getComputedStyle(alvo).cursor === 'pointer'; } catch (e) {} }
      var px = ev.pageX, py = ev.pageY;
      if (px == null || (px === 0 && py === 0 && ev.detail === 0)) { var rc = el.getBoundingClientRect(); px = rc.left + rc.width / 2 + w.scrollX; py = rc.top + rc.height / 2 + w.scrollY; }
      // Cliques de raiva: 3 ou mais no mesmo sítio em menos de 1 s
      var agora = Date.now();
      ultimos = ultimos.filter(function (u) { return agora - u.t < 1000 && Math.abs(u.x - ev.clientX) < 30 && Math.abs(u.y - ev.clientY) < 30; });
      ultimos.push({ t: agora, x: ev.clientX, y: ev.clientY });
      var href = '';
      var a = alvo.closest('a[href]');
      if (a) href = a.href;
      var c = {
        x: Math.round(px / larguraDoc() * 1000), y: Math.round(py), ap: alturaDoc(), jl: w.innerWidth,
        el: nomeElemento(el), tx: (inter || /^(H[1-6]|IMG|svg)$/i.test(el.tagName)) ? textoDe(el) : '',
        hr: href ? corta(href.split('?')[0].split('#')[0], 300) : '', tg: el.tagName.toLowerCase(),
        i: clicavel ? 1 : 0, r: ultimos.length >= 3 ? 1 : 0
      };
      if (fila.c.length < 60) fila.c.push(c);
      if (a) acaoLink(a);
      if (fila.c.length >= 20) enviar({}, false);
    } catch (e) {}
  }, { capture: true, passive: true });

  // Ações que contam como contacto ou conversão
  function evento(nome, valor) {
    if (!nome) return;
    fila.e.push({ n: corta(nome, 40), v: corta(valor, 200) });
    enviar({}, false);
  }
  function acaoLink(a) {
    var h = a.getAttribute('href') || '', url;
    if (/^tel:/i.test(h)) return evento('telefone', h.slice(4));
    if (/^mailto:/i.test(h)) return evento('email', h.slice(7).split('?')[0]);
    if (/^(https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com)|whatsapp:)/i.test(h)) return evento('whatsapp', h.split('?')[0]);
    try { url = new URL(a.href); } catch (e) { return; }
    if (a.hasAttribute('download') || /\.(pdf|zip|docx?|xlsx?|pptx?|csv|apk|dmg|exe)$/i.test(url.pathname)) return evento('download', url.pathname.split('/').pop());
    if (/^https?:$/.test(url.protocol) && url.hostname !== loc.hostname) {
      var hn = url.hostname.replace(/^www\./, '');
      if (/instagram\.com$/.test(hn)) return evento('instagram', url.pathname);
      if (/facebook\.com$/.test(hn)) return evento('facebook', url.pathname);
      if (/tiktok\.com$/.test(hn)) return evento('tiktok', url.pathname);
      if (/google\.[a-z.]+$|goo\.gl$|maps\.app\.goo\.gl$/.test(hn) && /maps|place|dir/.test(url.pathname + hn)) return evento('mapa', hn);
      return evento('link_externo', hn + url.pathname);
    }
  }
  d.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f && f.tagName === 'FORM') evento('formulario', f.getAttribute('id') || f.getAttribute('name') || (f.getAttribute('action') || '').split('?')[0] || loc.pathname);
  }, true);

  // Erros de JavaScript (para os corrigir)
  function erro(msg, fich, l, c) {
    msg = corta(msg, 300); if (!msg) return;
    var k = msg + l; if (errosVistos[k] || fila.x.length >= 10) return; errosVistos[k] = 1;
    fila.x.push({ m: msg, f: corta((fich || '').split('?')[0], 200), l: l || 0, c: c || 0 });
  }
  w.addEventListener('error', function (ev) {
    if (ev.target && ev.target !== w && ev.target.tagName) { var s = ev.target.src || ev.target.href || ''; if (s) erro('Não carregou: ' + ev.target.tagName.toLowerCase(), s, 0, 0); return; }
    erro(ev.message, ev.filename, ev.lineno, ev.colno);
  }, true);
  w.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason; erro('Promise: ' + (r && (r.message || r)), r && r.stack ? (String(r.stack).match(/https?:\/\/[^\s)]+/) || [''])[0] : '', 0, 0);
  });

  // Velocidade (Core Web Vitals): LCP, CLS e INP
  try {
    new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) vitals.lcp = Math.round(e[e.length - 1].startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  try {
    var janela = 0, ultimaSh = 0, primeiraSh = 0;
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (s) {
        if (s.hadRecentInput) return;
        if (s.startTime - ultimaSh > 1000 || s.startTime - primeiraSh > 5000) { janela = 0; primeiraSh = s.startTime; }
        janela += s.value; ultimaSh = s.startTime;
        if (janela > vitals.cls) vitals.cls = janela;
      });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) { if (e.interactionId && e.duration > vitals.inp) vitals.inp = Math.round(e.duration); });
    }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
  } catch (e) {}
  function tempos() {
    try {
      var nv = performance.getEntriesByType('navigation')[0];
      if (nv) return { tt: Math.round(nv.responseStart), cg: nv.loadEventEnd > 0 ? Math.round(nv.loadEventEnd) : 0 };
    } catch (e) {}
    return {};
  }

  // Envio: pelo próprio domínio (/_e), sem cookies
  var ultimoEnvio = 0;
  function metricas() {
    medirScroll();
    var m = { t: ativoMs, sc: scrollMax, ap: alturaDoc(), n: nCliques };
    if (vitals.lcp) m.lcp = vitals.lcp;
    if (vitals.cls) m.cls = Math.round(vitals.cls * 10000) / 10000;
    if (vitals.inp) m.inp = vitals.inp;
    var t = tempos(); if (t.tt) m.tt = t.tt; if (t.cg) m.cg = t.cg;
    return m;
  }
  function enviar(extra, aSair) {
    if (!pv) return;
    var corpo = { s: SITE, id: pv.id, h: loc.hostname };
    for (var k in extra) corpo[k] = extra[k];
    // Nos primeiros 10 s repete o início da página (se o 1.º pedido chegar depois do 2.º, nada se perde)
    if (Date.now() - pv.inicio < 10000) corpo.v = pv.v;
    if (pv.enviado) corpo.m = metricas();
    pv.enviado = true;
    if (fila.c.length) { corpo.c = fila.c; fila.c = []; }
    if (fila.e.length) { corpo.e = fila.e; fila.e = []; }
    if (fila.x.length) { corpo.x = fila.x; fila.x = []; }
    var txt = JSON.stringify({ d: corpo });
    ultimoEnvio = Date.now();
    try {
      if (aSair && n.sendBeacon && n.sendBeacon(URL_ENVIO, txt)) return;
      fetch(URL_ENVIO, { method: 'POST', body: txt, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }

  // A cada minuto (se a página estiver à vista) e sempre que a pessoa sai ou muda de separador
  setInterval(function () { if (d.visibilityState === 'visible' && Date.now() - ultimoEnvio > 55000) enviar({}, false); }, 60000);
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') enviar({}, true); });
  w.addEventListener('pagehide', function () { enviar({}, true); });
  w.addEventListener('pageshow', function (ev) { if (ev.persisted) novaPagina(); });

  // Sites de uma só página (React, etc.): cada mudança de endereço conta como página nova
  function mudouEndereco() {
    if ((loc.pathname || '/') === pv.caminho) return;
    enviar({}, false);
    novaPagina();
  }
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    if (!orig) return;
    history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(mudouEndereco, 0); return r; };
  });
  w.addEventListener('popstate', function () { setTimeout(mudouEndereco, 0); });

  // API para eventos próprios: estat('subscrever', 'mensal')
  var antes = (w.estat && w.estat.q) || [];
  w.estat = function (nome, valor) { evento(nome, valor); };
  novaPagina();
  antes.forEach(function (a) { evento(a[0], a[1]); });
})();
