// Imagens para a Play Store: capturas do site em produção (1080x1920, como pede a Google),
// versões com legenda sobre fundo laranja, imagem de destaque (1024x500) e imagem para partilhas (1200x630).
// Uso: SITE=https://parou.pt node fazer.cjs   (PW=caminho do playwright e PREPARAR=ficheiro.js só nos testes locais)
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright');

const base = (process.env.SITE || 'https://parou.pt').replace(/\/$/, '');
const saida = process.env.SAIDA || '.';
const preparar = process.env.PREPARAR ? require(path.resolve(process.env.PREPARAR)) : null;
const executavel = process.env.CHROMIUM || undefined;

const tel = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' };
const porto = { geolocation: { latitude: 41.1462, longitude: -8.6110 }, permissions: ['geolocation'] };
const lisboa = { geolocation: { latitude: 38.7107, longitude: -9.1365 }, permissions: ['geolocation'] };

// <mark> = palavra que fica em destaque (branco sobre preto)
const ECRAS = [
  { id: 'perto', geo: porto, caminho: '/', espera: 11000, legenda: 'O que passa perto de ti,<br><mark>agora.</mark>' },
  {
    id: 'percurso', geo: porto, caminho: '/', espera: 11000, legenda: 'Toca numa linha e<br><mark>vê o percurso.</mark>',
    acao: async (p) => {
      await p.locator('[data-teste="paragem-perto"]:visible').first().click();
      await p.waitForTimeout(4000);
      const linhas = p.locator('[aria-label^="Ver o percurso da linha"]:visible');
      const n = Math.min(await linhas.count(), 8);
      for (let i = 0; i < n; i++) {
        await linhas.nth(i).click();
        await p.waitForTimeout(5000);
        const txt = await p.locator('[data-teste="percurso-linha"]').innerText().catch(() => '');
        console.log('percurso', i, JSON.stringify(txt.slice(0, 90)));
        if (/paragens? até ao fim/i.test(txt) && !/Percurso indispon/i.test(txt)) return;
        await p.locator('[aria-label="Voltar às partidas da paragem"]').click().catch(() => {});
        await p.waitForTimeout(1200);
      }
    },
  },
  { id: 'mapa', geo: porto, caminho: '/mapa', espera: 10000, legenda: 'Incêndios e avisos<br><mark>no mapa.</mark>' },
  { id: 'horarios', geo: lisboa, caminho: '/transportes', espera: 9000, legenda: 'Horários de<br><mark>todas as linhas.</mark>' },
  { id: 'noticias', geo: porto, caminho: '/alertas', espera: 9000, legenda: 'Greves, tempo e feriados<br><mark>num só sítio.</mark>' },
  { id: 'comunidade', geo: porto, caminho: '/comunidade', espera: 8000, legenda: 'Fala com quem<br><mark>viaja contigo.</mark>' },
  { id: 'escuro', geo: porto, caminho: '/', espera: 11000, tema: 'escuro', legenda: 'Claro, escuro<br><mark>ou laranja.</mark>' },
];

const FONTES = '<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;700&family=Barlow+Condensed:wght@700&display=swap" rel="stylesheet">';

(async () => {
  fs.mkdirSync(saida, { recursive: true });
  const browser = await chromium.launch({ executablePath: executavel, args: ['--no-sandbox'] });

  // 1) Capturas do ecrã (sem legenda): são o que a Google pede e o que aparece na loja
  for (const e of ECRAS) {
    const ctx = await browser.newContext({ ...tel, ...e.geo });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('parou_aviso_instalar', '1'); if (t) localStorage.setItem('parou_tema', t); } catch {}
    }, e.tema || null);
    if (preparar) await preparar(ctx);
    const p = await ctx.newPage();
    try {
      await p.goto(base + e.caminho + '?origem=android', { waitUntil: 'load', timeout: 60000 });
      await p.waitForTimeout(e.espera);
      const mosaicosCarregados = () => p.waitForFunction(() => !document.querySelector('.leaflet-tile-loading'), null, { timeout: 20000 }).catch(() => console.log(e.id, 'mapa ainda a carregar'));
      await mosaicosCarregados();
      if (e.acao) { try { await e.acao(p); } catch (err) { console.log(e.id, 'ação:', err.message.split('\n')[0]); } await p.waitForTimeout(1500); await mosaicosCarregados(); await p.waitForTimeout(1000); }
      await p.screenshot({ path: path.join(saida, `crua-${e.id}.jpg`), type: 'jpeg', quality: 94 });
      console.log('ok', e.id);
    } catch (err) { console.log('FALHOU', e.id, err.message.split('\n')[0]); }
    await ctx.close();
  }

  // 2) Versões com legenda (laranja da marca, texto escuro: contraste 7:1)
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  let n = 0;
  for (const e of ECRAS) {
    const f = path.join(saida, `crua-${e.id}.jpg`);
    if (!fs.existsSync(f)) continue;
    n++;
    const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTES}<style>
      *{box-sizing:border-box;margin:0}
      body{width:1080px;height:1920px;overflow:hidden;background:#FF6B1A;font-family:Barlow,Arial,sans-serif;position:relative}
      .marca{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:18px;font-family:'Barlow Condensed','Barlow',Arial,sans-serif;font-weight:700;font-size:44px;letter-spacing:3px;color:#111}
      .marca svg{width:46px;height:46px}
      h1{position:absolute;left:72px;right:72px;top:150px;white-space:nowrap;font-family:'Barlow Condensed','Barlow',Arial,sans-serif;font-weight:700;font-size:124px;line-height:1.02;color:#111111;letter-spacing:-.5px}
      mark{display:inline-block;margin-top:18px;line-height:1.02;background:#111111;color:#FFFFFF;padding:0 22px 8px;border-radius:22px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
      .tel{position:absolute;left:50%;top:500px;transform:translateX(-50%);width:828px;height:1440px;border-radius:84px 84px 0 0;background:#111111;padding:16px 16px 0;box-shadow:0 -10px 60px rgba(0,0,0,.28)}
      .tel img{display:block;width:796px;height:1416px;border-radius:70px 70px 0 0;object-fit:cover;object-position:top}
    </style></head><body>
      <div class="marca"><svg viewBox="0 0 100 100"><path d="M12 0H80L100 20V88Q100 100 88 100H12Q0 100 0 88V12Q0 0 12 0Z" fill="#111111"/><path d="M34 80V25H56L66 35V57H52" fill="none" stroke="#FF6B1A" stroke-width="10"/><circle cx="49" cy="57" r="6.5" fill="#FFFFFF" stroke="#111111" stroke-width="3"/></svg>PAROU</div>
      <h1>${e.legenda}</h1>
      <div class="tel"><img src="${dataUrl}"></div>
    </body></html>`);
    await p.evaluate(async () => {
      await document.fonts.ready;
      // A legenda cabe sempre em 2 linhas acima do telemóvel: se for comprida, o tipo encolhe
      const h = document.querySelector('h1');
      let t = 124;
      while ((h.getBoundingClientRect().height > 290 || h.scrollWidth > h.clientWidth) && t > 60) { t -= 4; h.style.fontSize = t + 'px'; }
    });
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(saida, `loja-${n}-${e.id}.jpg`), type: 'jpeg', quality: 94 });
  }

  // 3) Imagem de destaque 1024x500 e imagem para partilhas 1200x630
  const html = (w, h, pad) => `<!doctype html><html><head><meta charset="utf-8">${FONTES}</head>
    <body style="margin:0;width:${w}px;height:${h}px;background:#111111;display:flex;align-items:center;font-family:Barlow,sans-serif;overflow:hidden">
      <div style="padding:0 0 0 ${pad}px;display:flex;align-items:center;gap:44px">
        <svg width="190" height="190" viewBox="0 0 100 100"><path d="M12 0H80L100 20V88Q100 100 88 100H12Q0 100 0 88V12Q0 0 12 0Z" fill="#FFFFFF"/><path d="M34 80V25H56L66 35V57H52" fill="none" stroke="#111111" stroke-width="10"/><circle cx="49" cy="57" r="6.5" fill="#FF6B1A" stroke="#FFFFFF" stroke-width="3"/></svg>
        <div>
          <div style="font-family:'Barlow Condensed','Barlow',Arial,sans-serif;font-weight:700;font-size:108px;letter-spacing:4px;color:#FFFFFF;line-height:1">PAROU</div>
          <div style="font-size:34px;font-weight:500;color:#FFFFFF;margin-top:14px;line-height:1.2">O que passa perto de ti,<br><span style="color:#FF6B1A;font-weight:700">em tempo real.</span></div>
          <div style="font-size:20px;color:#B5B5B5;margin-top:18px">Autocarros · Metro · Comboios · Alertas · Gratuita</div>
        </div>
      </div>
    </body></html>`;
  await p.setViewportSize({ width: 1024, height: 500 });
  await p.setContent(html(1024, 500, 80));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(saida, 'destaque-1024x500.jpg'), type: 'jpeg', quality: 95 });
  await p.setViewportSize({ width: 1200, height: 630 });
  await p.setContent(html(1200, 630, 120));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(saida, 'og-1200x630.jpg'), type: 'jpeg', quality: 95 });
  await browser.close();
})();
