/* ============================================================
   AI artifacts · carriers: the object each kind of artifact
   lives in. The artifact itself shows on the object where it
   can (picture on the easel, a frame on the TV, the model on
   the pedestal); the rest show a cover drawn from the entry.
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
  if (opts.play) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cw / 2, ch * .62, 34 * s, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cw / 2 - 11 * s, ch * .62 - 17 * s); g.lineTo(cw / 2 + 19 * s, ch * .62); g.lineTo(cw / 2 - 11 * s, ch * .62 + 17 * s); g.fill(); }
  return c;
}
function screenPlane(c, w, h, k = 1.05) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texOf(c), color: new THREE.Color(k, k, k) })); }
function paintFit(c, src, bg) {
  const g = c.getContext('2d'), r = Math.min(c.width / src.width, c.height / src.height), w = src.width * r, h = src.height * r;
  g.fillStyle = bg || '#0a0a0e'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
}
function legs(g, mat, w, d, h, t = .05) { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => mesh(BG(t, h, t), mat, a * (w / 2 - t), h / 2, b * (d / 2 - t), g)); }

function buildEasel(def) {
  const g = new THREE.Group(), wood = M('#8a5a2b', .6), e = def.entry || { kind: 'image', title: '画' };
  [[-.32, .12], [.32, .12]].forEach(([x, rz]) => { const l = mesh(BG(.05, 1.9, .05), wood, x, .95, .1, g); l.rotation.z = x < 0 ? -rz : rz; l.rotation.x = -.12; });
  const back = mesh(BG(.05, 1.8, .05), wood, 0, .9, -.32, g); back.rotation.x = .3;
  mesh(BG(.86, .05, .14), wood, 0, .62, .15, g);
  const board = new THREE.Group(); board.position.set(0, 1.18, .16); board.rotation.x = -.12; g.add(board);
  const c = artCover(e, 512, 384, { tag: '图片' }), pic = screenPlane(c, .8, .6, 1); pic.position.z = .03; board.add(pic);
  const frame = mesh(BG(.86, .66, .04), M('#2a1d12', .5), 0, 0, 0, board);
  artUrl(e.art).then(u => u && loadImg(u)).then(img => {
    if (!img) return;
    const a = clamp(img.width / img.height, .4, 2.5), w = a >= 1 ? .8 : .6 * a, h = a >= 1 ? .8 / a : .6;
    const cc = mkCanvas(a >= 1 ? 768 : Math.round(768 * a), a >= 1 ? Math.round(768 / a) : 768); paintFit(cc, img);
    pic.material.map = texOf(cc); pic.material.needsUpdate = true; pic.scale.set(w / .8, h / .6, 1);
    frame.scale.set((w + .06) / .86, (h + .06) / .66, 1);
  });
  return g;
}
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
  artUrl(e.art).then(u => {
    if (!u) return;
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = u;
    v.addEventListener('loadeddata', () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch (x) {} }, { once: true });
    v.addEventListener('seeked', () => {
      try { paintFit(c, v); } catch (x) { return; }
      const x = c.getContext('2d'), gr = x.createLinearGradient(0, 180, 0, 288); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.75)');
      x.fillStyle = gr; x.fillRect(0, 180, 512, 108); x.fillStyle = '#fff'; x.font = `700 26px ${FONT.body}`; x.fillText(wrapText(x, e.title || '视频', 470, 1)[0] || '', 20, 270);
      x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.arc(256, 130, 40, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(243, 110); x.lineTo(278, 130); x.lineTo(243, 150); x.fill();
      sc.material.map.needsUpdate = true; v.removeAttribute('src'); v.load();
    }, { once: true });
  });
  return g;
}
function buildReader(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'doc', title: '文档' }, wood = M('#4a3427', .6);
  mesh(CY(.26, .3, .05, 20), wood, 0, .025, 0, g);
  mesh(CY(.05, .06, .95, 12), wood, 0, .5, 0, g);
  const top = new THREE.Group(); top.position.set(0, 1.02, 0); top.rotation.x = -.42; g.add(top);
  mesh(BG(.74, .04, .52), wood, 0, 0, 0, top);
  const pdf = e.kind === 'pdf';
  [-1, 1].forEach(s => {
    const c = s < 0 ? artCover(e, 256, 352, { paper: true, tag: pdf ? 'PDF' : '文档' }) : artCover({ kind: e.kind, title: e.desc || '' }, 256, 352, { paper: true, lines: 10, tag: ' ' });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.34, .47), new THREE.MeshStandardMaterial({ map: texOf(c), roughness: .9 }));
    p.rotation.x = -Math.PI / 2; p.rotation.y = s * .06; p.position.set(s * .175, .032, 0); top.add(p);
  });
  mesh(BG(.02, .03, .48), M(pdf ? '#e04646' : '#8a5a2b', .5), 0, .03, 0, top);
  return g;
}
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
function buildWorkbench(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'project', title: '项目' }, top = M('#6b4a2e', .6);
  mesh(BG(1.7, .06, .8), top, 0, .9, 0, g); legs(g, M('#2a2a30', .5, .4), 1.7, .8, .87, .06);
  mesh(BG(1.6, .04, .7), M('#3a2a1e', .7), 0, .3, 0, g);
  const box = new THREE.Group(); box.position.set(-.35, .93, 0); g.add(box);
  mesh(BG(.7, .42, .5), M('#c79a4a', .7), 0, .21, 0, box);
  const c = artCover(e, 384, 224, { tag: '项目' }), lab = screenPlane(c, .62, .36, 1); lab.position.set(0, .21, .252); box.add(lab);
  const lap = new THREE.Group(); lap.position.set(.45, .93, .05); g.add(lap);
  mesh(BG(.5, .02, .34), M('#202028', .4, .5), 0, .01, 0, lap);
  const scr = mesh(BG(.5, .32, .015), M('#202028', .4, .5), 0, .17, -.17, lap); scr.rotation.x = -.25;
  const cc = artCover({ kind: 'data', title: e.title }, 256, 160, { lines: 4, tag: 'index.html' }), sp = screenPlane(cc, .46, .28); sp.position.set(0, .17, -.16); sp.rotation.x = -.25; lap.add(sp);
  return g;
}
let gltfLoaderP = null;
function gltfLoader() {
  return gltfLoaderP || (gltfLoaderP = new Promise((res, rej) => {
    if (THREE.GLTFLoader) return res(new THREE.GLTFLoader());
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
    s.onload = () => res(new THREE.GLTFLoader()); s.onerror = () => { gltfLoaderP = null; rej(new Error('loader')); }; document.head.appendChild(s);
  }));
}
function buildPedestal(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'model', title: '模型' };
  mesh(CY(.36, .4, .9, 32), M('#e9e6ef', .5), 0, .45, 0, g);
  mesh(CY(.41, .41, .02, 40), GLOW('#62e6ff', 1.3), 0, .91, 0, g);
  const ph = mesh(new THREE.IcosahedronGeometry(.2, 1), new THREE.MeshBasicMaterial({ color: '#62e6ff', wireframe: true }), 0, 1.25, 0, g);
  ph.onBeforeRender = () => { ph.rotation.y += .01; };
  const c = artCover(e, 384, 96, { tag: '3D 模型' }), plate = screenPlane(c, .5, .125); plate.position.set(0, .7, .4); g.add(plate);
  Promise.all([artUrl(e.art), gltfLoader()]).then(([u, loader]) => {
    if (!u) return;
    loader.load(u, gl => {
      const m = gl.scene, box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), k = .75 / Math.max(size.x, size.y, size.z, .001);
      m.scale.setScalar(k); const b2 = new THREE.Box3().setFromObject(m), ctr = b2.getCenter(new THREE.Vector3());
      m.position.set(-ctr.x, .92 - b2.min.y, -ctr.z); m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.remove(ph); g.add(m);
    }, undefined, () => {});
  }).catch(() => {});
  return g;
}
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
function buildCrate(def) {
  const g = new THREE.Group(), e = def.entry || { kind: 'file', title: '文件' }, wood = M('#9a6b3c', .75), dark = M('#6b4a2e', .75);
  mesh(BG(.8, .6, .7), wood, 0, .3, 0, g);
  [.08, .52].forEach(y => mesh(BG(.82, .06, .72), dark, 0, y, 0, g));
  [-1, 1].forEach(s => mesh(BG(.06, .62, .72), dark, s * .38, .3, 0, g));
  const c = artCover(e, 384, 192, { tag: '文件' }), lab = screenPlane(c, .5, .25, 1); lab.position.set(0, .3, .352); g.add(lab);
  return g;
}
Object.assign(ITEMS, {
  easel: { name: '画架', w: .9, d: .8, build: buildEasel, entry: { kind: 'image', title: '新的画', desc: '', url: '' } },
  tv: { name: '电视', w: 1.6, d: .7, build: buildTv, entry: { kind: 'video', title: '新的视频', desc: '', url: '' } },
  reader: { name: '阅读台', w: .9, d: .8, build: buildReader, entry: { kind: 'doc', title: '新的文档', desc: '', url: '' } },
  phono: { name: '唱片机', w: .9, d: .7, build: buildPhono, entry: { kind: 'audio', title: '新的音乐', desc: '', url: '' } },
  workbench: { name: '工作台', w: 1.8, d: .9, build: buildWorkbench, entry: { kind: 'project', title: '新的项目', desc: '', url: '' } },
  pedestal: { name: '展台', w: .9, d: .9, build: buildPedestal, entry: { kind: 'model', title: '新的模型', desc: '', url: '' } },
  monitor: { name: '显示器', w: 1.2, d: .8, build: buildMonitor, entry: { kind: 'data', title: '新的代码', desc: '', url: '' } },
  crate: { name: '储物箱', w: .9, d: .8, build: buildCrate, entry: { kind: 'file', title: '新的文件', desc: '', url: '' } }
});
