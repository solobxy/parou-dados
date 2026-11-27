// menus novos: entrada (sem perfil) → jogar sem conta → lobby → modos → novidades → definições
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await page.waitForFunction(() => !document.getElementById('load') || document.getElementById('load').hidden, { timeout: 120000 }).catch(() => { }); await W(2500);
  await ev(() => { const i = document.getElementById('intro'); if (i) i.hidden = true; });
  const vis = id => ev(id => { const e = document.getElementById(id); return !!e && !e.hidden; }, id);
  console.log('entrada à vista:', await vis('gate'), '· lobby:', await vis('start'));
  if (await vis('gate')) { await shot('m-entrada');
    await page.click('#gGuest'); await W(300); await page.fill('#gN', 'Dinis'); await shot('m-entrada-form'); await page.click('#gOk'); await W(1500); }
  console.log('lobby à vista:', await vis('start'), JSON.stringify(await ev(() => ({ nome: document.getElementById('lbName').textContent, sub: document.getElementById('lbSub').textContent, char: (document.getElementById('lbChar').src || '').slice(0, 22) }))));
  await W(1200); await shot('m-lobby');
  await page.click('#sGo'); await W(900); await shot('m-modos'); await page.click('#mdX'); await W(300);
  await page.click('#sNews'); await W(700); await shot('m-novidades'); await page.click('#nwX'); await W(300);
  await page.click('#sLook'); await W(700); console.log('aparência abre:', await ev(() => !document.getElementById('pfm').hidden && document.getElementById('pfT').textContent === 'Aparência' && !!document.querySelector('#pfB .sw'))); await ev(() => document.getElementById('pfX').click()); await W(300);
  await page.click('#sSet'); await W(600); await ev(() => { const b = document.querySelector('.sside [data-t=img]') || document.querySelector('#setTabs [data-t=img]'); b && b.click(); }); await W(400); await shot('m-defs');
  await ev(() => { const b = document.querySelector('.sside [data-t=conta]') || document.querySelector('#setTabs [data-t=conta]'); b && b.click(); }); await W(400); await shot('m-defs-conta');
  // terminar sessão: volta à entrada; ao recarregar continua na entrada; entrar outra vez com o mesmo nome volta ao mesmo perfil
  await ev(() => { const b = [...document.querySelectorAll('#setBody button')].find(b => b.textContent === 'Terminar'); b && b.click(); }); await W(800);
  console.log('depois de terminar sessão, entrada:', await vis('gate'));
  await page.reload(); await page.waitForFunction(() => document.getElementById('load') && document.getElementById('load').hidden, { timeout: 120000 }).catch(() => { }); await W(2500);
  console.log('ao recarregar, entrada:', await vis('gate'));
  await page.click('#gGuest'); await W(200); await page.fill('#gN', 'dinis'); await page.click('#gOk'); await W(800);
  console.log('perfis:', await ev(() => JSON.parse(localStorage.getItem('kg.perfis')).lista.map(p => p.nome).join(',')));
  await page.reload(); await page.waitForFunction(() => document.getElementById('load') && document.getElementById('load').hidden, { timeout: 120000 }).catch(() => { }); await W(2500);
  console.log('sessão lembrada (lobby direto):', await vis('start'), await vis('gate'));
};
