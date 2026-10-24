/* ============================================================
   AI artifacts · carriers: the objects each display category
   offers (ART_CATS in 22-art-types.js). The work itself shows on
   the object where it can (the picture in a frame, a video frame
   on a screen, the model in a case, a chart from the data); the
   rest show a cover drawn from the entry.
   ============================================================ */
function artCover(entry, cw, ch, opts = {}) {
  const c = mkCanvas(cw, ch), g = c.getContext('2d'), art = entry.art || {};
  const kc = KIND_COLOR[entry.kind] || KIND_COLOR.file;
  if (opts.paper) { g.fillStyle = '#f3ecdc'; g.fillRect(0, 0, cw, ch); }
  else { const gr = g.createLinearGradient(0, 0, cw, ch); gr.addColorStop(0, kc[0]); gr.addColorStop(1, kc[1]); g.fillStyle = gr; g.fillRect(0, 0, cw, ch); }
  const ink = opts.paper ? '#2a2620' : '#fff', s = cw / 384;
  g.fillStyle = ink; g.globalAlpha = .7; g.font = `500 ${15 * s}px ${FONT.body}`;
  g.fillText((opts.tag || KIND_LABEL[entry.kind] || '作品') + (art.name && extOf(art.name) ? ' · .' + extOf(art.name) : ''), 18 * s, 32 * s);
  g.globalAlpha = 1; g.font = `700 ${30 * s}px ${FONT.body}`;
  wrapText(g, entry.title || '未命名作品', cw - 36 * s, 2).forEach((l, i) => g.fillText(l, 18 * s, 78 * s + i * 38 * s));
  if (opts.lines) { g.globalAlpha = .35; for (let i = 0; i < opts.lines; i++) { g.fillStyle = ink; g.fillRect(18 * s, (150 + i * 16) * s, (cw - 36 * s) * (.55 + ((i * 37) % 40) / 100), 5 * s); } g.globalAlpha = 1; }
  if (opts.play) playMark(g, cw / 2, ch * .62, 34 * s);
  return c;
}
function playMark(g, x, y, r) { g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - r * .32, y - r * .5); g.lineTo(x + r * .56, y); g.lineTo(x - r * .32, y + r * .5); g.fill(); }
function screenPlane(c, w, h, k = 1.05) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texOf(c), color: new THREE.Color(k, k, k) })); }
function paperPlane(c, w, h) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texOf(c), roughness: .9 })); }
function paintFit(c, src, bg) {
  const g = c.getContext('2d'), r = Math.min(c.width / src.width, c.height / src.height), w = src.width * r, h = src.height * r;
  g.fillStyle = bg || '#0a0a0e'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
}
function legs(g, mat, w, d, h, t = .05) { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => mesh(BG(t, h, t), mat, a * (w / 2 - t), h / 2, b * (d / 2 - t), g)); }
const isArt = (e, t) => !!(e && e.art && e.art.t === t);

/* ---------- the work itself on the object ---------- */
// 图片贴进 pic（尺寸 maxW × maxH），按图片比例缩放；onFit(w, h) 用来让外框跟着缩放
function fitPicture(e, pic, maxW, maxH, onFit) {
  if (!isArt(e, 'image')) return;
  artUrl(e.art).then(u => u && loadImg(u)).then(img => {
    if (!img) return;
    const a = clamp(img.width / img.height, .4, 2.5), w = a >= maxW / maxH ? maxW : maxH * a, h = a >= maxW / maxH ? maxW / a : maxH;
    const cc = mkCanvas(a >= 1 ? 768 : Math.round(768 * a), a >= 1 ? Math.round(768 / a) : 768); paintFit(cc, img);
    pic.material.map = texOf(cc); pic.material.needsUpdate = true; pic.scale.set(w / maxW, h / maxH, 1);
    if (onFit) onFit(w, h);
  });
}
// 视频的一帧画到屏幕画布上，再叠上标题和播放键
function videoPoster(e, c, sc) {
  if (!isArt(e, 'video')) return;
  artUrl(e.art).then(u => {
    if (!u) return;
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = u;
    v.addEventListener('loadeddata', () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch (x) {} }, { once: true });
    v.addEventListener('seeked', () => {
      try { paintFit(c, v); } catch (x) { return; }
      const W = c.width, H = c.height, x = c.getContext('2d'), gr = x.createLinearGradient(0, H * .62, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.75)'); x.fillStyle = gr; x.fillRect(0, H * .62, W, H * .38);
      x.fillStyle = '#fff'; x.font = `700 ${Math.round(W / 20)}px ${FONT.body}`; x.fillText(wrapText(x, e.title || '视频', W * .92, 1)[0] || '', W * .04, H * .94);
      playMark(x, W / 2, H * .45, W / 13);
      sc.material.map.needsUpdate = true; v.removeAttribute('src'); v.load();
    }, { once: true });
  });
}
let gltfLoaderP = null;
function gltfLoader() {
  return gltfLoaderP || (gltfLoaderP = new Promise((res, rej) => {
    if (THREE.GLTFLoader) return res(new THREE.GLTFLoader());
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
    s.onload = () => res(new THREE.GLTFLoader()); s.onerror = () => { gltfLoaderP = null; rej(new Error('loader')); }; document.head.appendChild(s);
  }));
}
// 占位的线框；模型加载好后换成模型，放在 y 高度、最大边长 size
function modelOnto(e, g, y, size) {
  const ph = mesh(new THREE.IcosahedronGeometry(size * .27, 1), new THREE.MeshBasicMaterial({ color: '#62e6ff', wireframe: true }), 0, y + size * .45, 0, g);
  ph.onBeforeRender = () => { ph.rotation.y += .01; };
  if (!isArt(e, 'model')) return;
  Promise.all([artUrl(e.art), gltfLoader()]).then(([u, loader]) => {
    if (!u) return;
    loader.load(u, gl => {
      const m = gl.scene, size3 = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
      m.scale.setScalar(size / Math.max(size3.x, size3.y, size3.z, .001));
      const b2 = new THREE.Box3().setFromObject(m), ctr = b2.getCenter(new THREE.Vector3());
      m.position.set(-ctr.x, y - b2.min.y, -ctr.z); m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.remove(ph); g.add(m);
    }, undefined, () => {});
  }).catch(() => {});
}
// 表格或 JSON 里的一列数字画成柱状图
function chartData(text, name) {
  let rows = [];
  try {
    if (/\.json$/i.test(name || '')) {
      const j = JSON.parse(text), arr = Array.isArray(j) ? j : Object.entries(j).map(([k, v]) => ({ k, v }));
      rows = arr.slice(0, 12).map(o => { if (typeof o !== 'object' || !o) return [String(o), +o]; const ks = Object.keys(o), n = ks.find(k => typeof o[k] === 'number' || (o[k] !== '' && !isNaN(+o[k]))); return [String(o[ks.find(k => k !== n)] ?? ''), +o[n]]; });
    } else {
      const sep = /\.tsv$/i.test(name || '') ? '\t' : ',', L = text.split(/\r?\n/).filter(Boolean).map(l => l.split(sep).map(s => s.replace(/^"|"$/g, '').trim()));
      const col = (L[1] || []).findIndex(v => v !== '' && !isNaN(+v));
      if (col >= 0) rows = L.slice(1, 13).map(r => [r[col === 0 ? 1 : 0] || '', +r[col]]);
    }
  } catch (e) { rows = []; }
  return rows.filter(r => isFinite(r[1]));
}
function drawChart(c, e, rows) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e8e4f0'; x.font = `700 ${Math.round(H / 12)}px ${FONT.body}`; x.fillText(wrapText(x, e.title || '数据', W * .9, 1)[0] || '', W * .04, H * .12);
  x.strokeStyle = 'rgba(232,228,240,.12)'; x.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const y = H * (.28 + i * .18); x.beginPath(); x.moveTo(W * .04, y); x.lineTo(W * .96, y); x.stroke(); }
  if (!rows.length) { x.fillStyle = 'rgba(232,228,240,.5)'; x.font = `${Math.round(H / 16)}px ${FONT.body}`; x.fillText('放进表格或 JSON 数据，这里会画成图表', W * .04, H * .6); return; }
  const max = Math.max(...rows.map(r => Math.abs(r[1])), 1e-9), bw = W * .92 / rows.length, kc = KIND_COLOR.data;
  rows.forEach(([lab, v], i) => {
    const h = H * .6 * Math.abs(v) / max, bx = W * .04 + i * bw + bw * .15, by = H * .82 - h;
    const gr = x.createLinearGradient(0, by, 0, H * .82); gr.addColorStop(0, kc[1]); gr.addColorStop(1, '#3d5afe'); x.fillStyle = gr; x.fillRect(bx, by, bw * .7, h);
    x.fillStyle = 'rgba(232,228,240,.75)'; x.font = `${Math.round(Math.min(bw * .32, H / 20))}px ${FONT.mono}`; x.fillText(String(lab).slice(0, 6), bx, H * .9);
  });
}

/* ---------- 网页类 ---------- */
function browserCanvas(e) {
  const c = mkCanvas(640, 400), x = c.getContext('2d'), kc = /^#[0-9a-f]{6}$/i.test(e.color || '') ? [e.color, shadeHex(e.color, -.4)] : (KIND_COLOR[e.kind] || KIND_COLOR.web);
  x.fillStyle = '#dfe1e8'; x.fillRect(0, 0, 640, 400);
  [['#ff5f57', 20], ['#febc2e', 40], ['#28c840', 60]].forEach(([col, px]) => { x.fillStyle = col; x.beginPath(); x.arc(px, 20, 6, 0, Math.PI * 2); x.fill(); });
  x.fillStyle = '#f6f7fa'; rr(x, 84, 8, 200, 26, 7); x.fill();
  x.fillStyle = '#3a3d48'; x.font = `500 13px ${FONT.body}`; x.fillText(wrapText(x, e.title || '新标签页', 176, 1)[0] || '', 98, 26);
  x.fillStyle = '#f6f7fa'; rr(x, 16, 42, 608, 26, 13); x.fill();
  x.fillStyle = '#7a7f8e'; x.font = `13px ${FONT.mono}`; x.fillText('gebi.room/' + (String(e.title || 'work').replace(/\s+/g, '-').slice(0, 30)), 34, 60);
  const gr = x.createLinearGradient(0, 76, 640, 400); gr.addColorStop(0, kc[0]); gr.addColorStop(1, kc[1]); x.fillStyle = gr; x.fillRect(0, 76, 640, 324);
  x.fillStyle = '#fff'; x.font = `700 40px ${FONT.body}`; wrapText(x, e.title || '网页作品', 560, 2).forEach((l, i) => x.fillText(l, 40, 170 + i * 50));
  x.globalAlpha = .75; x.font = `16px ${FONT.body}`; x.fillText(wrapText(x, e.desc || '点开就能在这个窗口里浏览', 560, 1)[0] || '', 40, 290); x.globalAlpha = 1;
  return c;
}
function buildBrowser(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'web', title: '网页' }, dark = M('#1c1c22', .4, .5);
  mesh(rboxGeo(1, .05, .45, .02), dark, 0, .025, 0, g);
  mesh(BG(.08, 1.05, .08), dark, 0, .55, -.05, g);
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); g.add(head);
  mesh(rboxGeo(1.72, 1.1, .06, .04), M('#c9ccd6', .35, .4), 0, 0, 0, head);
  const sc = screenPlane(browserCanvas(e), 1.64, 1.025); sc.position.z = .032; head.add(sc);
  return g;
}

/* ---------- 游戏类 ---------- */
function buildHandheld(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'game2', title: '小游戏' }, shell = M(e.color || '#d6d2c4', .55);
  mesh(rboxGeo(.6, .55, .42, .04), M('#2a2a30', .5, .3), 0, .275, 0, g);
  const body = new THREE.Group(); body.position.set(0, 1.08, 0); body.rotation.x = -.12; g.add(body);
  mesh(rboxGeo(.62, 1.02, .14, .07), shell, 0, 0, 0, body);
  mesh(BG(.5, .42, .01), M('#5b5f6b', .5), 0, .2, .071, body);
  const c = artCover(e, 256, 224, { tag: '游戏' }), sc = screenPlane(c, .4, .34); sc.position.set(0, .2, .077); body.add(sc);
  const dk = M('#26262c', .45);
  mesh(BG(.16, .05, .03), dk, -.15, -.22, .075, body); mesh(BG(.05, .16, .03), dk, -.15, -.22, .075, body);
  [[.12, -.25], [.21, -.18]].forEach(([px, py]) => { const b = mesh(CY(.04, .04, .03, 16), M('#a3245d', .4), px, py, .08, body); b.rotation.x = Math.PI / 2; });
  [-.06, 0, .06].forEach(px => mesh(BG(.012, .07, .01), dk, .17 + px, -.4, .072, body));
  return g;
}

/* ---------- 图片类 ---------- */
function buildEasel(def) {
  const g = new THREE.Group(), wood = M('#8a5a2b', .6), e = def.entry || { kind: 'image', title: '画' };
  [[-.32, .12], [.32, .12]].forEach(([x, rz]) => { const l = mesh(BG(.05, 1.9, .05), wood, x, .95, .1, g); l.rotation.z = x < 0 ? -rz : rz; l.rotation.x = -.12; });
  const back = mesh(BG(.05, 1.8, .05), wood, 0, .9, -.32, g); back.rotation.x = .3;
  mesh(BG(.86, .05, .14), wood, 0, .62, .15, g);
  const board = new THREE.Group(); board.position.set(0, 1.18, .16); board.rotation.x = -.12; g.add(board);
  const pic = screenPlane(artCover(e, 512, 384, { tag: '图片' }), .8, .6, 1); pic.position.z = .03; board.add(pic);
  const frame = mesh(BG(.86, .66, .04), M('#2a1d12', .5), 0, 0, 0, board);
  fitPicture(e, pic, .8, .6, (w, h) => frame.scale.set((w + .06) / .86, (h + .06) / .66, 1));
  return g;
}
function buildPhotoFrame(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'image', title: '照片' }, wood = M('#5a3a24', .55);
  mesh(rboxGeo(1.2, .72, .46, .03), wood, 0, .36, 0, g);
  [-.3, .3].forEach(px => mesh(BG(.5, .26, .01), M('#4a2f1d', .6), px, .4, .232, g));
  [-.3, .3].forEach(px => mesh(SPH(.022), M('#c9a24a', .3, .8), px, .4, .245, g));
  const f = new THREE.Group(); f.position.set(0, 1.17, -.02); f.rotation.x = -.08; g.add(f);
  const gold = M('#c9a24a', .32, .85);
  const frame = mesh(BG(.92, .74, .05), gold, 0, 0, 0, f);
  const mat = mesh(BG(.82, .64, .01), M('#f4efe4', .9), 0, 0, .027, f);
  const pic = screenPlane(artCover(e, 512, 384, { tag: '照片' }), .7, .52, 1); pic.position.z = .034; f.add(pic);
  const stand = mesh(BG(.04, .7, .04), wood, 0, -.02, -.16, f); stand.rotation.x = .45;
  fitPicture(e, pic, .7, .52, (w, h) => { mat.scale.set((w + .12) / .82, (h + .12) / .64, 1); frame.scale.set((w + .22) / .92, (h + .22) / .74, 1); });
  return g;
}
function buildDrawingBoard(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'image', title: '设计稿' }, metal = M('#3a3d45', .45, .6), wood = M('#d8c3a0', .6);
  [-.5, .5].forEach(px => { const a = mesh(BG(.05, 1.05, .05), metal, px, .52, .18, g); a.rotation.x = -.3; const b = mesh(BG(.05, 1.05, .05), metal, px, .52, -.18, g); b.rotation.x = .3; });
  mesh(BG(1.05, .04, .04), metal, 0, .3, 0, g);
  const top = new THREE.Group(); top.position.set(0, 1.12, 0); top.rotation.x = -.85; g.add(top);
  mesh(BG(1.2, .85, .04), wood, 0, 0, 0, top);
  mesh(BG(1.2, .04, .07), metal, 0, -.44, .03, top);
  const pic = screenPlane(artCover(e, 512, 384, { tag: '设计稿' }), .9, .66, 1); pic.position.z = .022; top.add(pic);
  [-.38, .38].forEach(px => mesh(BG(.08, .03, .01), M('#c8c8d0', .3, .8), px, .33, .03, top));
  const arm = mesh(BG(.03, .7, .03), metal, .62, 1.55, -.15, g); arm.rotation.z = -.4;
  const lamp = mesh(CY(.04, .1, .12, 16, true), M('#e04646', .4), .78, 1.83, -.05, g); lamp.rotation.z = .9;
  fitPicture(e, pic, .9, .66);
  return g;
}

/* ---------- 影像类 ---------- */
function buildTv(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'video', title: '视频' };
  mesh(rboxGeo(1.5, .46, .5, .04), M('#3a2c22', .6), 0, .23, 0, g);
  mesh(BG(1.3, .02, .02), GLOW('#62e6ff', 1.2), 0, .05, .26, g);
  mesh(BG(.3, .06, .2), M('#16161c', .4, .5), 0, .49, 0, g);
  mesh(BG(.06, .22, .06), M('#16161c', .4, .5), 0, .6, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.16, .02); g.add(head);
  mesh(rboxGeo(1.46, .86, .06, .03), M('#0d0d12', .35, .3), 0, 0, 0, head);
  const c = artCover(e, 512, 288, { play: true, tag: '视频' }), sc = screenPlane(c, 1.38, .78); sc.position.z = .032; head.add(sc);
  g.userData.screen = { canvas: c, tex: sc.material.map, restore() {} };
  videoPoster(e, c, sc);
  return g;
}
function buildProjector(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'video', title: '放映' }, metal = M('#2a2a30', .45, .6);
  [-.85, .85].forEach(px => { mesh(BG(.04, 2.1, .04), metal, px, 1.05, -.2, g); mesh(BG(.3, .03, .3), metal, px, .015, -.2, g); });
  mesh(BG(1.8, .08, .08), metal, 0, 2.12, -.2, g);
  const c = artCover(e, 640, 360, { play: true, tag: '放映' }), sc = screenPlane(c, 1.62, .91, .95); sc.position.set(0, 1.55, -.17); g.add(sc);
  mesh(BG(1.66, .02, .01), metal, 0, 1.08, -.18, g);
  const pj = new THREE.Group(); pj.position.set(0, .2, .75); g.add(pj);
  mesh(BG(.06, .4, .06), metal, 0, -.0, 0, pj);
  mesh(rboxGeo(.34, .14, .28, .03), M('#e9e6ef', .5), 0, .26, 0, pj);
  const lens = mesh(CY(.05, .05, .04, 20), GLOW('#e8f4ff', 1.6), 0, .26, -.15, pj); lens.rotation.x = Math.PI / 2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.03, .75, .95, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: .05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.rotation.x = Math.PI / 2 + .55; beam.position.set(0, 1.0, .25); g.add(beam);
  g.userData.screen = { canvas: c, tex: sc.material.map, restore() {} };
  videoPoster(e, c, sc);
  return g;
}

/* ---------- 声音类 ---------- */
function buildPhono(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'audio', title: '音乐' }, kc = KIND_COLOR.audio;
  mesh(rboxGeo(.8, .62, .6, .03), M('#5a3a24', .55), 0, .31, 0, g);
  mesh(BG(.7, .03, .52), M('#1a1a20', .4, .4), 0, .635, 0, g);
  const disc = mesh(CY(.22, .22, .012, 40), M('#0b0b0f', .25, .2), -.08, .66, 0, g);
  const lc = mkCanvas(64, 64), lx = lc.getContext('2d'); lx.fillStyle = (e.color || kc[0]); lx.fillRect(0, 0, 64, 64); lx.fillStyle = '#fff'; lx.fillRect(30, 4, 4, 24);
  const label = new THREE.Mesh(new THREE.CircleGeometry(.08, 24), new THREE.MeshBasicMaterial({ map: texOf(lc) })); label.rotation.x = -Math.PI / 2; label.position.y = .007; disc.add(label);
  const arm = mesh(BG(.02, .02, .3), M('#c8c8d0', .3, .8), .2, .69, .02, g); arm.rotation.y = .5;
  disc.onBeforeRender = () => { if (S.artPlaying === def.uid) disc.rotation.y -= .03; };
  const c = artCover(e, 384, 96, { tag: '音频' }), plate = screenPlane(c, .6, .15); plate.position.set(0, .4, .305); g.add(plate);
  return g;
}
function buildSpeaker(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'audio', title: '音乐' }, box = M('#2b2420', .6), cone = M('#141418', .5, .2), ring = M('#9a9aa6', .3, .8);
  const cones = [];
  [-.42, .42].forEach(px => {
    mesh(rboxGeo(.38, 1.1, .36, .03), box, px, .55, 0, g);
    [[.78, .07], [.38, .13]].forEach(([py, r]) => {
      const rim = mesh(CY(r + .02, r + .02, .02, 28), ring, px, py, .18, g); rim.rotation.x = Math.PI / 2;
      const c = mesh(CY(r, r * .4, .05, 28), cone, px, py, .2, g); c.rotation.x = -Math.PI / 2; cones.push(c);
    });
  });
  const t0 = performance.now();
  cones.forEach((c, i) => { c.onBeforeRender = () => { c.scale.y = S.artPlaying === def.uid ? 1 + .35 * Math.abs(Math.sin((performance.now() - t0) / 90 + i)) : 1; }; });
  const plate = screenPlane(artCover(e, 384, 96, { tag: '音箱' }), .44, .11); plate.position.set(0, .3, .1); g.add(plate);
  mesh(BG(.5, .02, .2), box, 0, .2, 0, g);
  return g;
}

/* ---------- 阅读类 ---------- */
function buildReader(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'doc', title: '文档' }, wood = M('#4a3427', .6);
  mesh(CY(.26, .3, .05, 20), wood, 0, .025, 0, g);
  mesh(CY(.05, .06, .95, 12), wood, 0, .5, 0, g);
  // 台面朝向站在前面的人倾斜
  const top = new THREE.Group(); top.position.set(0, 1.02, 0); top.rotation.x = .42; g.add(top);
  mesh(BG(.74, .04, .52), wood, 0, 0, 0, top);
  const pdf = e.kind === 'pdf';
  [-1, 1].forEach(s => {
    const c = s < 0 ? artCover(e, 256, 352, { paper: true, tag: pdf ? 'PDF' : '文档' }) : artCover({ kind: e.kind, title: e.desc || '' }, 256, 352, { paper: true, lines: 10, tag: ' ' });
    const p = paperPlane(c, .34, .47); p.rotation.x = -Math.PI / 2; p.rotation.y = s * .06; p.position.set(s * .175, .032, 0); top.add(p);
  });
  mesh(BG(.02, .03, .48), M(pdf ? '#e04646' : '#8a5a2b', .5), 0, .03, 0, top);
  return g;
}
function buildMagazineRack(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'doc', title: '杂志' }, wood = M('#8a5a2b', .6), r = rng(hash(def.uid));
  [-.48, .48].forEach(px => { const s = mesh(BG(.05, 1.45, .4), wood, px, .72, 0, g); s.rotation.x = -.12; });
  const tiers = [[.35, .14], [.82, .08], [1.28, .02]];
  tiers.forEach(([py, pz], i) => {
    mesh(BG(.92, .03, .16), wood, 0, py - .02, pz + .06, g);
    mesh(BG(.92, .05, .02), wood, 0, py + .02, pz + .14, g);
    const own = i === 1, c = own ? artCover(e, 256, 336, { tag: e.kind === 'pdf' ? 'PDF' : '阅读' }) : artCover({ kind: ['doc', 'pdf', 'image'][i], title: ['周末特刊', '', '设计年鉴'][i] }, 256, 336, { lines: 3 });
    [-.24, .24].forEach((px, k) => { if (!own && k && r() < .3) return; const p = paperPlane(own && k ? artCover({ kind: 'doc', title: e.desc || '' }, 256, 336, { paper: true, lines: 12, tag: ' ' }) : c, .38, .5); p.position.set(px, py + .26, pz + .02); p.rotation.x = -.12; g.add(p); });
  });
  return g;
}
function buildNoticeBoard(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'doc', title: '告示' }, metal = M('#3a3d45', .45, .6);
  [-.6, .6].forEach(px => { mesh(BG(.05, 1.75, .05), metal, px, .87, 0, g); mesh(BG(.06, .03, .5), metal, px, .015, 0, g); });
  const board = new THREE.Group(); board.position.set(0, 1.35, .03); g.add(board);
  mesh(BG(1.32, .92, .05), M('#6b4a2e', .6), 0, 0, 0, board);
  mesh(BG(1.22, .82, .01), M('#b98a5a', .95), 0, 0, .027, board);
  const page = paperPlane(artCover(e, 256, 340, { paper: true, lines: 9, tag: e.kind === 'pdf' ? 'PDF' : '告示' }), .42, .56); page.position.set(-.12, .01, .036); page.rotation.z = .02; board.add(page);
  [['#ffe27a', .36, .2, -.05], ['#9be7c4', .38, -.18, .06]].forEach(([col, px, py, rz]) => { const n = mesh(BG(.2, .2, .004), M(col, .9), px, py, .034, board); n.rotation.z = rz; });
  [[-.12, .27], [.36, .29], [.38, -.09]].forEach(([px, py]) => mesh(SPH(.018), M('#e04646', .4), px, py, .045, board));
  return g;
}

/* ---------- 代码类 ---------- */
function buildMonitor(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'data', title: '代码' };
  mesh(BG(1.1, .05, .62), M('#2a2a30', .5, .3), 0, .76, 0, g); legs(g, M('#1a1a20', .4, .5), 1.1, .62, .74, .04);
  mesh(BG(.24, .02, .16), M('#16161c', .4, .5), 0, .79, -.08, g); mesh(BG(.04, .26, .04), M('#16161c', .4, .5), 0, .92, -.1, g);
  const head = new THREE.Group(); head.position.set(0, 1.2, -.08); g.add(head);
  mesh(rboxGeo(.96, .58, .04, .02), M('#0d0d12', .35, .3), 0, 0, 0, head);
  const c = mkCanvas(448, 256), x = c.getContext('2d'); x.fillStyle = '#0a0e1c'; x.fillRect(0, 0, 448, 256);
  x.font = '600 16px ' + FONT.mono; x.fillStyle = '#ffb454'; x.fillText((e.art && e.art.name) || e.title || 'code', 14, 24);
  const pal = ['#62e6ff', '#ff5aa8', '#7ee0a1', '#c792ea', '#e8e4f0'], r = rng(hash(def.uid));
  for (let i = 0; i < 11; i++) { let px = 14 + (r() < .5 ? 0 : 18); for (let j = 0; j < 4; j++) { const w = 20 + r() * 60; x.fillStyle = pal[Math.floor(r() * pal.length)]; x.globalAlpha = .8; x.fillRect(px, 40 + i * 19, w, 8); px += w + 8; } }
  x.globalAlpha = 1;
  const sc = screenPlane(c, .9, .52); sc.position.z = .022; head.add(sc);
  g.userData.screen = { canvas: c, tex: sc.material.map, restore() {} };
  return g;
}
function buildWorkbench(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'project', title: '项目' }, top = M('#6b4a2e', .6);
  mesh(BG(1.7, .06, .8), top, 0, .9, 0, g); legs(g, M('#2a2a30', .5, .4), 1.7, .8, .87, .06);
  mesh(BG(1.6, .04, .7), M('#3a2a1e', .7), 0, .3, 0, g);
  const box = new THREE.Group(); box.position.set(-.35, .93, 0); g.add(box);
  mesh(BG(.7, .42, .5), M('#c79a4a', .7), 0, .21, 0, box);
  const lab = screenPlane(artCover(e, 384, 224, { tag: '项目' }), .62, .36, 1); lab.position.set(0, .21, .252); box.add(lab);
  const lap = new THREE.Group(); lap.position.set(.45, .93, .05); g.add(lap);
  mesh(BG(.5, .02, .34), M('#202028', .4, .5), 0, .01, 0, lap);
  const scr = mesh(BG(.5, .32, .015), M('#202028', .4, .5), 0, .17, -.17, lap); scr.rotation.x = -.25;
  const sp = screenPlane(artCover({ kind: 'data', title: e.title }, 256, 160, { lines: 4, tag: 'index.html' }), .46, .28); sp.position.set(0, .17, -.16); sp.rotation.x = -.25; lap.add(sp);
  return g;
}

/* ---------- 数据类 ---------- */
function buildDashboard(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'data', title: '数据' }, dark = M('#1c1c22', .4, .5);
  [-.6, .6].forEach(px => { mesh(BG(.06, 1.2, .06), dark, px, .6, 0, g); mesh(BG(.08, .03, .5), dark, px, .015, 0, g); });
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); g.add(head);
  mesh(rboxGeo(1.5, .9, .07, .03), M('#0d0d12', .35, .3), 0, 0, 0, head);
  mesh(BG(1.3, .015, .015), GLOW('#62e6ff', 1.2), 0, -.47, .03, head);
  const c = mkCanvas(640, 380); drawChart(c, e, []);
  const sc = screenPlane(c, 1.42, .84); sc.position.z = .037; head.add(sc);
  if (isArt(e, 'data')) loadArtText(e.art).then(t => { if (t == null) return; drawChart(c, e, chartData(t, e.art.name)); sc.material.map.needsUpdate = true; });
  return g;
}

/* ---------- 立体类 ---------- */
function buildPedestal(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'model', title: '模型' };
  mesh(CY(.36, .4, .9, 32), M('#e9e6ef', .5), 0, .45, 0, g);
  mesh(CY(.41, .41, .02, 40), GLOW('#62e6ff', 1.3), 0, .91, 0, g);
  const plate = screenPlane(artCover(e, 384, 96, { tag: '3D 模型' }), .5, .125); plate.position.set(0, .7, .4); g.add(plate);
  modelOnto(e, g, .92, .75);
  return g;
}
function buildVitrine(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'model', title: '藏品' }, white = M('#f1eee8', .5);
  mesh(rboxGeo(.82, .82, .82, .02), white, 0, .41, 0, g);
  mesh(BG(.86, .04, .86), M('#c9a24a', .3, .85), 0, .84, 0, g);
  const glass = new THREE.Mesh(BG(.8, .82, .8), new THREE.MeshPhongMaterial({ color: '#9fb4c4', transparent: true, opacity: .1, shininess: 90, specular: '#ffffff', depthWrite: false }));
  glass.position.y = 1.27; g.add(glass);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => mesh(BG(.02, .82, .02), M('#c9a24a', .3, .85), a * .4, 1.27, b * .4, g));
  mesh(BG(.84, .05, .84), white, 0, 1.7, 0, g);
  const plate = screenPlane(artCover(e, 384, 96, { tag: '藏品' }), .5, .125); plate.position.set(0, .55, .415); g.add(plate);
  modelOnto(e, g, .86, .6);
  return g;
}

/* ---------- 文件类 ---------- */
function buildCrate(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'file', title: '文件' }, wood = M('#9a6b3c', .75), dark = M('#6b4a2e', .75);
  mesh(BG(.8, .6, .7), wood, 0, .3, 0, g);
  [.08, .52].forEach(y => mesh(BG(.82, .06, .72), dark, 0, y, 0, g));
  [-1, 1].forEach(s => mesh(BG(.06, .62, .72), dark, s * .38, .3, 0, g));
  const lab = screenPlane(artCover(e, 384, 192, { tag: '文件' }), .5, .25, 1); lab.position.set(0, .3, .352); g.add(lab);
  return g;
}
function buildFileCabinet(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'file', title: '档案' }, metal = M('#7d8796', .45, .55), dark = M('#5d6676', .45, .55);
  mesh(rboxGeo(.62, 1.32, .6, .02), metal, 0, .66, 0, g);
  [1.07, .66, .25].forEach((py, i) => {
    mesh(BG(.56, .36, .02), dark, 0, py, .305, g);
    mesh(BG(.18, .03, .03), M('#c8c8d0', .3, .85), 0, py - .08, .325, g);
    const lab = i === 0 ? screenPlane(artCover(e, 256, 96, { tag: '档案' }), .26, .1, 1) : paperPlane(artCover({ kind: 'file', title: '' }, 128, 48, { paper: true }), .16, .06);
    lab.position.set(0, py + .07, .317); g.add(lab);
  });
  return g;
}

/* ---------- registry ---------- */
const ART_ITEMS = {
  browser: { name: '浏览器窗口', w: 1.8, d: .6, build: buildBrowser, entry: { kind: 'web', title: '新的网页', desc: '', url: '' } },
  handheld: { name: '掌机', w: .8, d: .6, build: buildHandheld, entry: { kind: 'game2', title: '新的游戏', desc: '', url: '' } },
  easel: { name: '画架', w: .9, d: .8, build: buildEasel, entry: { kind: 'image', title: '新的画', desc: '', url: '' } },
  photoFrame: { name: '相框', w: 1.2, d: .6, build: buildPhotoFrame, entry: { kind: 'image', title: '新的照片', desc: '', url: '' } },
  drawingBoard: { name: '画板', w: 1.4, d: .9, build: buildDrawingBoard, entry: { kind: 'image', title: '新的设计稿', desc: '', url: '' } },
  tv: { name: '电视', w: 1.6, d: .7, build: buildTv, entry: { kind: 'video', title: '新的视频', desc: '', url: '' } },
  projector: { name: '投影幕', w: 1.9, d: 1.2, build: buildProjector, entry: { kind: 'video', title: '新的放映', desc: '', url: '' } },
  phono: { name: '唱片机', w: .9, d: .7, build: buildPhono, entry: { kind: 'audio', title: '新的音乐', desc: '', url: '' } },
  speaker: { name: '音箱', w: 1.3, d: .5, build: buildSpeaker, entry: { kind: 'audio', title: '新的声音', desc: '', url: '' } },
  reader: { name: '阅读台', w: .9, d: .8, build: buildReader, entry: { kind: 'doc', title: '新的文档', desc: '', url: '' } },
  magazineRack: { name: '杂志架', w: 1.1, d: .6, build: buildMagazineRack, entry: { kind: 'doc', title: '新的文章', desc: '', url: '' } },
  noticeBoard: { name: '告示板', w: 1.4, d: .6, build: buildNoticeBoard, entry: { kind: 'doc', title: '新的告示', desc: '', url: '' } },
  monitor: { name: '显示器', w: 1.2, d: .8, build: buildMonitor, entry: { kind: 'data', title: '新的代码', desc: '', url: '' } },
  workbench: { name: '工作台', w: 1.8, d: .9, build: buildWorkbench, entry: { kind: 'project', title: '新的项目', desc: '', url: '' } },
  dashboard: { name: '数据看板', w: 1.5, d: .6, build: buildDashboard, entry: { kind: 'data', title: '新的数据', desc: '', url: '' } },
  pedestal: { name: '展台', w: .9, d: .9, build: buildPedestal, entry: { kind: 'model', title: '新的模型', desc: '', url: '' } },
  vitrine: { name: '玻璃展柜', w: .9, d: .9, build: buildVitrine, entry: { kind: 'model', title: '新的藏品', desc: '', url: '' } },
  crate: { name: '储物箱', w: .9, d: .8, build: buildCrate, entry: { kind: 'file', title: '新的文件', desc: '', url: '' } },
  fileCabinet: { name: '档案柜', w: .7, d: .7, build: buildFileCabinet, entry: { kind: 'file', title: '新的档案', desc: '', url: '' } }
};
Object.entries(ART_ITEMS).forEach(([k, m]) => { ITEMS[k] = Object.assign({ catalog: true }, m); });
['kiosk', 'arcade', 'whiteboard', 'serverRack'].forEach(k => { ITEMS[k].catalog = true; });
Object.assign(CAT_ICON, {
  browser: '<rect x="4" y="4" width="32" height="22" rx="2" fill="#c9ccd6"/><rect x="4" y="4" width="32" height="5" rx="2" fill="#dfe1e8"/><circle cx="7.5" cy="6.5" r="1" fill="#ff5f57"/><circle cx="10.5" cy="6.5" r="1" fill="#febc2e"/><circle cx="13.5" cy="6.5" r="1" fill="#28c840"/><rect x="6" y="11" width="28" height="13" fill="#3d5afe"/><rect x="19" y="26" width="2" height="5" fill="#a99db4"/><rect x="13" y="31" width="14" height="2" rx="1" fill="#a99db4"/>',
  handheld: '<rect x="11" y="3" width="18" height="28" rx="3" fill="#d6d2c4"/><rect x="14" y="6" width="12" height="10" fill="#5b5f6b"/><rect x="15" y="7" width="10" height="8" fill="#ff9a3d"/><path d="M14 22h5M16.5 19.5v5" stroke="#26262c" stroke-width="2"/><circle cx="24" cy="23" r="1.6" fill="#a3245d"/><circle cx="26.5" cy="20.5" r="1.6" fill="#a3245d"/>',
  easel: '<path d="M13 32 19 4h2l6 28" stroke="#8a5a2b" stroke-width="2" fill="none"/><rect x="9" y="7" width="22" height="16" fill="#2a1d12"/><rect x="11" y="9" width="18" height="12" fill="#ff9a3d"/><circle cx="16" cy="13" r="2" fill="#ffe27a"/><path d="M11 21l6-5 4 3 4-4 4 6z" fill="#ff5aa8"/>',
  photoFrame: '<rect x="5" y="21" width="30" height="12" rx="1" fill="#5a3a24"/><rect x="10" y="3" width="20" height="17" fill="#c9a24a"/><rect x="12" y="5" width="16" height="13" fill="#f4efe4"/><rect x="14" y="7" width="12" height="9" fill="#7c4dff"/>',
  drawingBoard: '<path d="M9 33l5-13M31 33l-5-13" stroke="#3a3d45" stroke-width="2"/><path d="M5 20 9 6h26l-4 14z" fill="#d8c3a0"/><path d="M10 18l2.6-9h17l-2.6 9z" fill="#ff9a3d"/>',
  tv: '<rect x="4" y="5" width="32" height="19" rx="2" fill="#0d0d12"/><rect x="6" y="7" width="28" height="15" fill="#3d5afe"/><path d="M18 11v7l6-3.5z" fill="#fff"/><rect x="6" y="26" width="28" height="6" rx="1" fill="#3a2c22"/>',
  projector: '<rect x="5" y="3" width="30" height="18" fill="#e9e6ef"/><path d="M17 9v6l5-3z" fill="#3d5afe"/><path d="M5 3v29M35 3v29" stroke="#2a2a30" stroke-width="1.5"/><path d="M20 30 12 21h16z" fill="#cfe8ff" opacity=".5"/><rect x="16" y="28" width="8" height="4" rx="1" fill="#e9e6ef"/>',
  phono: '<rect x="6" y="12" width="28" height="20" rx="2" fill="#5a3a24"/><ellipse cx="18" cy="12" rx="10" ry="4" fill="#0b0b0f"/><ellipse cx="18" cy="12" rx="3" ry="1.2" fill="#7c4dff"/><path d="M30 8l-5 6" stroke="#c8c8d0" stroke-width="1.5"/>',
  speaker: '<rect x="5" y="4" width="12" height="28" rx="1.5" fill="#2b2420"/><rect x="23" y="4" width="12" height="28" rx="1.5" fill="#2b2420"/><circle cx="11" cy="11" r="2.5" fill="#9a9aa6"/><circle cx="11" cy="23" r="4.5" fill="#9a9aa6"/><circle cx="29" cy="11" r="2.5" fill="#9a9aa6"/><circle cx="29" cy="23" r="4.5" fill="#9a9aa6"/>',
  reader: '<path d="M20 31V18" stroke="#4a3427" stroke-width="3"/><path d="M8 13l12 3 12-3v8l-12 3-12-3z" fill="#f3ecdc"/><path d="M20 16v8" stroke="#8a5a2b"/>',
  magazineRack: '<path d="M7 33 9 4M33 33 31 4" stroke="#8a5a2b" stroke-width="2"/><rect x="11" y="5" width="8" height="10" fill="#3d5afe"/><rect x="21" y="5" width="8" height="10" fill="#ff5aa8"/><rect x="11" y="19" width="8" height="10" fill="#c9a06a"/><rect x="21" y="19" width="8" height="10" fill="#34b88a"/>',
  noticeBoard: '<rect x="5" y="4" width="30" height="21" fill="#6b4a2e"/><rect x="7" y="6" width="26" height="17" fill="#b98a5a"/><rect x="10" y="8" width="9" height="12" fill="#f3ecdc"/><rect x="22" y="9" width="7" height="7" fill="#ffe27a"/><path d="M8 25v8M32 25v8" stroke="#3a3d45" stroke-width="2"/>',
  monitor: '<rect x="6" y="4" width="28" height="18" rx="1.5" fill="#0d0d12"/><path d="M9 9h8M11 13h12M9 17h6" stroke="#62e6ff" stroke-width="1.6"/><rect x="18" y="22" width="4" height="4" fill="#16161c"/><rect x="5" y="26" width="30" height="3" fill="#2a2a30"/>',
  workbench: '<rect x="3" y="18" width="34" height="3" fill="#6b4a2e"/><path d="M5 21v12M35 21v12" stroke="#2a2a30" stroke-width="2"/><rect x="6" y="9" width="12" height="9" fill="#c79a4a"/><rect x="22" y="10" width="11" height="7" fill="#202028"/><rect x="23" y="11" width="9" height="5" fill="#34b88a"/>',
  dashboard: '<rect x="4" y="4" width="32" height="20" rx="1.5" fill="#0b1020"/><rect x="8" y="16" width="4" height="5" fill="#62e6ff"/><rect x="14" y="11" width="4" height="10" fill="#62e6ff"/><rect x="20" y="14" width="4" height="7" fill="#62e6ff"/><rect x="26" y="8" width="4" height="13" fill="#62e6ff"/><path d="M9 24v9M31 24v9" stroke="#1c1c22" stroke-width="2"/>',
  pedestal: '<rect x="13" y="16" width="14" height="17" fill="#e9e6ef"/><rect x="12" y="15" width="16" height="2" fill="#62e6ff"/><path d="M20 3l6 4v6l-6 3-6-3V7z" fill="#7ee0a1"/>',
  vitrine: '<rect x="10" y="20" width="20" height="13" fill="#f1eee8"/><rect x="10" y="5" width="20" height="15" fill="#cfeaff" opacity=".6" stroke="#c9a24a"/><path d="M20 9l4 2.5v4.5l-4 2-4-2v-4.5z" fill="#62e6ff"/><rect x="9" y="3" width="22" height="2" fill="#f1eee8"/>',
  crate: '<rect x="7" y="10" width="26" height="22" fill="#9a6b3c"/><path d="M7 14h26M7 28h26" stroke="#6b4a2e" stroke-width="2"/><rect x="14" y="17" width="12" height="7" fill="#f3ecdc"/>',
  fileCabinet: '<rect x="11" y="3" width="18" height="30" rx="1" fill="#7d8796"/><path d="M11 13h18M11 23h18" stroke="#5d6676"/><rect x="17" y="7" width="6" height="2" fill="#f3ecdc"/><rect x="18" y="10" width="4" height="1.2" fill="#c8c8d0"/><rect x="18" y="20" width="4" height="1.2" fill="#c8c8d0"/><rect x="18" y="30" width="4" height="1.2" fill="#c8c8d0"/>'
});
