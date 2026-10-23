/* ============================================================
   Textures for room shells
   ============================================================ */
function floorTex(kind, tint) {
  const c = mkCanvas(1024, 1024), g = c.getContext('2d'), r = rng(hash(kind + tint));
  const base = new THREE.Color(tint);
  if (kind === 'wood') {
    const pw = 64;
    for (let x = 0; x < 1024; x += pw) {
      let y = -r() * 300;
      while (y < 1024) {
        const len = 220 + r() * 300, k = .82 + r() * .3;
        const col = base.clone().multiplyScalar(k);
        g.fillStyle = '#' + col.getHexString(); g.fillRect(x, y, pw, len);
        g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1;
        for (let i = 0; i < 5; i++) { g.beginPath(); const gx = x + 6 + r() * (pw - 12); g.moveTo(gx, y); g.bezierCurveTo(gx + 6, y + len * .3, gx - 6, y + len * .6, gx + 2, y + len); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y, pw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, 0, 2, 1024);
    }
  } else if (kind === 'tile') {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const col = base.clone().multiplyScalar((x + y) % 2 ? .78 : 1.04);
      g.fillStyle = '#' + col.getHexString(); g.fillRect(x * 128, y * 128, 128, 128);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x * 128, y * 128, 128, 3); g.fillRect(x * 128, y * 128, 3, 128);
    }
  } else {
    g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '0,0,0'},${r() * .05})`; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 4, 2 + r() * 4); }
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 1024); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); }
  }
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.3); return t;
}
const wallTex = (() => {
  const c = mkCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,.06)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 256);
  g.fillStyle = 'rgba(255,255,255,.4)'; for (let x = 2; x < 256; x += 32) g.fillRect(x, 0, 1, 256);
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); return t;
})();

