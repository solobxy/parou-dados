module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1500);
  const st = () => ev(() => { const it = G.inv.belt[G.sel]; return it.k + ' mg=' + it.mg + ' ammo=' + it.ammo + ' | carreg: ' + G.clipsOf(it.mg || ITEMS[it.k].gun.clip).map(m => m.am).join(',') + ' | soltas a556=' + G.inv.count('a556') + ' | HUD: ' + document.getElementById('aN').textContent + ' ' + document.getElementById('aW').textContent; });
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; } G.select(0); }); await W(300);
  console.log('início:', await st());
  await ev(() => { G.inv.belt[0].ammo = 0; G.reload(); G.p.reload = 0.02; }); await W(800);
  console.log('troca (rápida):', await st());
  await ev(() => { for (const m of G.clipsOf('cStanag')) m.am = 0; G.inv.belt[0].ammo = 3; G.reload(); }); await W(300);
  console.log('sem carregadores cheios, a encher à mão:', await ev(() => G.p.reloadMode + ' ' + G.p.reloadDur.toFixed(2) + 's'));
  await ev(() => { G.p.reload = 0.02; }); await W(800); console.log('depois de encher à mão:', await st());
  // ações do carregador no inventário
  await page.click('#bInv'); await W(600);
  const act = async (pred, label) => ev(([pred, label]) => { const e = G.inv.bag.list.find(e => e.it.k === pred && (e.it.am || 0) === 0) || G.inv.bag.list.find(e => e.it.k === pred); const el = document.querySelector(`[data-src="bag:${e.it.id}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: el.getBoundingClientRect().x + 5, clientY: el.getBoundingClientRect().y + 5, pointerId: 9 })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: el.getBoundingClientRect().x + 5, clientY: el.getBoundingClientRect().y + 5, pointerId: 9 })); const bs = [...document.querySelectorAll('#iAct button')]; const names = bs.map(b => b.textContent).join(' | '); const b = bs.find(b => b.textContent === label); if (b) b.click(); return names + (b ? ' → ' + label + ' feito' : ' (sem ' + label + ')'); }, [pred, label]);
  console.log('carregador vazio:', await act('cStanag', 'Encher'));
  console.log('depois de encher:', await st());
  await W(300); await shot('inv-carreg');
  console.log('M4: tirar mira 4x:', await ev(() => { const it = G.inv.belt[0]; const loc = { t: 'belt', i: 0 }; const a = G.inv.belt[0].att.scope; G.inv.belt[0].att.scope = null; const m = G.inv.give({ id: 9999, k: a, n: 1 }); return 'ok ' + m; }));
  console.log('montar ponto vermelho e lanterna:', await ev(() => { const it = G.inv.belt[0]; it.att.scope = 'reddot'; it.att.light = 'lantArma'; G.refresh(); return JSON.stringify(it.att); }));
  await page.click('#iClose').catch(() => {}); await ev(() => G.closeInv && G.closeInv()); await W(400);
  await ev(() => { G.p.x = 60; G.p.z = 1.5; G.p.yaw = G.p.root = Math.PI / 2; G.lightOn = false; G.toggleLight(); G.aimStart(true); }); await W(2600);
  console.log('fp com ponto vermelho:', await ev(() => 'fp=' + G.fp + ' rd=' + document.getElementById('scope').classList.contains('rd') + ' zero oculto=' + document.getElementById('szero').hidden + ' luz=' + G.lightOn));
  await shot('reddot');
  await ev(() => G.aimEnd()); await W(800);
};
