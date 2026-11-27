// clarão do cano: uma estrela de luz que aparece ~50 ms em cada tiro (sem silenciador). Textura feita uma vez num canvas.
let TEX = null;
export const flashTex = THREE => { if (TEX) return TEX; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,235,1)'); r.addColorStop(0.18, 'rgba(255,226,140,0.95)'); r.addColorStop(0.45, 'rgba(255,150,40,0.45)'); r.addColorStop(1, 'rgba(255,90,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter'; g.translate(64, 64); for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3 + (i % 2) * 0.2); const s = g.createLinearGradient(0, 0, 60, 0); s.addColorStop(0, 'rgba(255,240,190,0.9)'); s.addColorStop(1, 'rgba(255,140,30,0)'); g.fillStyle = s; g.beginPath(); g.moveTo(0, -5); g.lineTo(i % 2 ? 46 : 62, 0); g.lineTo(0, 5); g.fill(); }
  TEX = new THREE.CanvasTexture(c); return TEX; };
export const flashSprite = (THREE, size = 0.35) => { const m = new THREE.SpriteMaterial({ map: flashTex(THREE), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }); const s = new THREE.Sprite(m); s.scale.setScalar(size); s.visible = false; s.renderOrder = 5; return s; };
