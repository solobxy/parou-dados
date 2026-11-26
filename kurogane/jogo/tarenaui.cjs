// menu da arena por passos: equipa → kit (3D, setas) → acessórios; tudo no ecrã, sem deslizar, botões à vista
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { try { localStorage.removeItem('kg.arena'); } catch (e) { } }); await W(1500); await ev(() => { G.net.start = () => { }; G.ui.arenaHide(); });
  await ev(() => { G.ui.arenaMenu && 0; }); await ev(() => { document.getElementById('arw').hidden = true; }); 
  const chk = nm => ev(nm => { const vw = innerWidth, vh = innerHeight, de = document.documentElement, out = [];
    if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1) out.push('página com scroll ' + de.scrollWidth + 'x' + de.scrollHeight);
    for (const e of document.querySelectorAll('#arw *')) { const cs = getComputedStyle(e); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) out.push('scroll dentro: ' + (e.className || e.tagName)); }
    for (const b of document.querySelectorAll('#arw button')) { if (b.offsetParent === null) continue; const r = b.getBoundingClientRect(); if (r.width < 1) continue; if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) { out.push('fora do ecrã: ' + (b.id || b.textContent.trim())); continue; } const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!t || !(b === t || b.contains(t))) out.push('tapado: ' + (b.id || b.textContent.trim())); }
    for (const e of document.querySelectorAll('#arw .ainfo, #arw .ap1')) { if (e.offsetParent === null) continue; if (e.scrollHeight > e.clientHeight + 2) out.push('cortado: ' + e.className + ' ' + e.scrollHeight + '>' + e.clientHeight); }
    return nm + ': ' + (out.length ? out.join(' | ') : 'ok'); }, nm);
  await ev(() => G.ui.arenaHide()); await ev(() => { const el = document.getElementById('arw'); el.hidden = false; }); 
  await ev(() => { G.__aui = 1; }); await ev(() => { document.getElementById('arw').hidden = true; }); await ev(() => { G.ui.arenaLobby ? G.ui.arenaLobby() : null; });
  await ev(() => { const s = document.getElementById('sArena'); }); 
  // abre o passo 1 (equipa)
  await ev(() => { G.ui.arenaHide(); }); await ev(() => { G.ui.toMenu && 0; }); await ev(() => { document.getElementById('arw').hidden = false; }); await ev(() => G.ui.arenaShow('lobby')); await W(700);
  console.log(await chk('passo 1')); await shot('aui-1');
  await ev(() => document.querySelector('#arw .atm.t1').click()); await W(1200); console.log(await chk('passo 2')); await shot('aui-2');
  await ev(() => document.getElementById('arNextK').click()); await W(1000); await ev(() => document.getElementById('arNextK').click()); await W(1200); console.log('kit agora:', await ev(() => document.querySelector('#arw .akh b').textContent)); await shot('aui-2b');
  await ev(() => document.getElementById('arPrevK').click()); await W(300); await ev(() => document.getElementById('arPrevK').click()); await W(900);
  await ev(() => document.getElementById('arAtt').click()); await W(900); console.log(await chk('passo 3')); await shot('aui-3');
  await ev(() => document.getElementById('arGo').click()); await W(2000); console.log('a jogar:', await ev(() => [G.playing, document.getElementById('arw').hidden, G.inv.belt[0] && G.inv.belt[0].k]));
  await ev(() => G.ui.arenaDeath({ by: 'Rui' })); await W(800); console.log(await chk('morte')); await shot('aui-morte');
};
