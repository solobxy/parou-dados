module.exports = async (page, shot) => {
  for (const [t, n] of [[500, 'e0-intro-a'], [1300, 'e1-intro-b']]) { await page.evaluate(t => { const o = document.getElementById('intro'); o.hidden = false; for (const a of o.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t; } }, t); await shot(n); }
};
