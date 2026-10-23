/* ============================================================
   Room construction: a closed room you can walk through
   ============================================================ */
const RH = 4.8;                                   // ceiling height
const WIN = { z0: -.9, z1: 2.3, y0: 1.25, y1: 3.55 }; // window on the right wall (x = 5)
let ENV = null;
function buildEnv() {
  if (ENV || !THREE.PMREMGenerator) return ENV;
  try {
    const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x0d0a13, side: THREE.BackSide })));
    const panel = (c, k, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel('#ffb36b', 2.4, 0, 2.95, 0, 5, 1.2); panel('#ff5aa8', 1.8, -4.9, .8, 0, .4, 7); panel('#62e6ff', 1.4, 4.9, 1.2, .5, 3, 2);
    panel('#ffcf8a', 1.6, 0, 1, -4.9, 4, .5); panel('#9d8cff', .8, 0, 1.5, 4.9, 3, 1.4);
    ENV = pm.fromScene(es, .04).texture; pm.dispose();
  } catch (e) { ENV = null; }
  return ENV;
}
function wallpaperTex(th, seed) {
  const c = mkCanvas(512, 512), g = c.getContext('2d'), r = rng(seed);
  const base = new THREE.Color(th.wall);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) { g.fillStyle = `rgba(255,255,255,${x % 64 ? .025 : .045})`; g.fillRect(x, 0, 14, 512); }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '0,0,0'},${r() * .04})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,.05)';
  for (let y = 32; y < 512; y += 64) for (let x = 16; x < 512; x += 64) { g.beginPath(); g.arc(x + (y % 128 ? 32 : 0), y, 3, 0, 7); g.fill(); }
  const t = texOf(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function buildShell(room) {
  const th = room.theme, root = new THREE.Group();
  const W = { back: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group(), front: new THREE.Group() };
  Object.values(W).forEach(g => root.add(g)); S.wallGroups = W;
  // floor
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: floorTex(th.floor, th.floorTint), roughness: .48, metalness: .05, envMapIntensity: .8 }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; fl.userData.floor = true; root.add(fl);
  // walls (inner faces sit on the room bounds)
  const wp = wallpaperTex(th, hash(room.id || 'r'));
  const wallMat = (rep) => { const t = wp.clone(); t.needsUpdate = true; t.repeat.set(rep, RH / 2.4); return new THREE.MeshStandardMaterial({ map: t, roughness: .92, envMapIntensity: .25 }); };
  const box = (grp, mat, x0, x1, y0, y1, z0, z1) => { const m = mesh(BG(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, grp); return m; };
  const T = .22;
  box(W.back, wallMat(4), -5 - T, 5 + T, 0, RH, -4 - T, -4);
  box(W.left, wallMat(3.2), -5 - T, -5, 0, RH, -4, 4);
  // right wall with a window opening
  const rm = wallMat(3.2);
  box(W.right, rm, 5, 5 + T, 0, WIN.y0, -4, 4); box(W.right, rm, 5, 5 + T, WIN.y1, RH, -4, 4);
  box(W.right, rm, 5, 5 + T, WIN.y0, WIN.y1, -4, WIN.z0); box(W.right, rm, 5, 5 + T, WIN.y0, WIN.y1, WIN.z1, 4);
  // front wall with a door gap
  const door = room.items.find(i => i.type === 'door'), du = door ? door.u : -1;
  const fm = wallMat(4);
  box(W.front, fm, -5 - T, du - .62, 0, RH, 4, 4 + T); box(W.front, fm, du + .62, 5 + T, 0, RH, 4, 4 + T); box(W.front, fm, du - .62, du + .62, 2.68, RH, 4, 4 + T);
  // wainscot, rail and skirting
  const trim = M(th.trim, .55), dark = M('#' + new THREE.Color(th.trim).multiplyScalar(.6).getHexString(), .6);
  [['back', -5, 5, -4, -4], ['left', -5, -5, -4, 4], ['right', 5, 5, -4, 4], ['front', -5, 5, 4, 4]].forEach(([k, x0, x1, z0, z1]) => {
    const along = x0 !== x1, n = { back: [0, 1], left: [1, 0], right: [-1, 0], front: [0, -1] }[k], g = W[k];
    const seg = (a, b) => {
      if (b - a < .05) return;
      const len = b - a, mid = (a + b) / 2, cx = along ? mid : x0 + n[0] * .02, cz = along ? z0 + n[1] * .02 : mid;
      const w = along ? len : .04, d = along ? .04 : len;
      mesh(BG(w, 1.1, d), dark, cx, .55, cz, g);
      mesh(BG(along ? len : .07, .06, along ? .07 : len), trim, along ? mid : x0 + n[0] * .035, 1.12, along ? z0 + n[1] * .035 : mid, g);
      mesh(BG(along ? len : .06, .16, along ? .06 : len), trim, along ? mid : x0 + n[0] * .03, .08, along ? z0 + n[1] * .03 : mid, g);
      mesh(BG(along ? len : .06, .08, along ? .06 : len), trim, along ? mid : x0 + n[0] * .03, RH - .04, along ? z0 + n[1] * .03 : mid, g);
    };
    if (k === 'front') { seg(-5, du - .7); seg(du + .7, 5); } else seg(along ? x0 : z0, along ? x1 : z1);
  });
  // ceiling, beams, LED cove, downlights
  const ceil = new THREE.Group(); root.add(ceil); S.ceiling = ceil;
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 8.4), new THREE.MeshStandardMaterial({ color: '#141019', roughness: .95 }));
  cm.rotation.x = Math.PI / 2; cm.position.y = RH; cm.receiveShadow = true; ceil.add(cm);
  for (const x of [-3.75, -1.25, 1.25, 3.75]) mesh(BG(.26, .3, 8), M('#2a1d17', .7), x, RH - .15, 0, ceil);
  const led = new THREE.MeshBasicMaterial({ color: 0xff5aa8 }); S.dyn.leds.push(led);
  [[0, -3.93, 10, .04], [0, 3.93, 10, .04], [-4.93, 0, .04, 8], [4.93, 0, .04, 8]].forEach(([x, z, w, d]) => { const l = new THREE.Mesh(BG(w, .04, d), led); l.position.set(x, RH - .34, z); ceil.add(l); });
  for (const [x, z] of [[-2.5, 1.2], [.6, 1.2], [-3.4, -1.6], [.6, -.6]]) { const d = new THREE.Mesh(CY(.11, .11, .02, 20), GLOW('#ffd9a8', 2.2)); d.position.set(x, RH - .01, z); ceil.add(d); }
  const spot = new THREE.SpotLight(0xffcc99, .9, 9, .75, .6, 1.5); spot.position.set(0, RH - .05, 1.2); spot.target.position.set(.2, 0, 1.2); ceil.add(spot); ceil.add(spot.target);
  const p1 = new THREE.PointLight(0xff5aa8, .8, 11, 2); p1.position.set(-4.2, RH - .5, -3.2); root.add(p1);
  const p2 = new THREE.PointLight(0x62e6ff, .55, 11, 2); p2.position.set(3.8, RH - .5, -3.3); root.add(p2);
  S.dyn.ledLights.push(p1, p2);
  buildWindow(W.right, room);
  buildCorridor(W.front, du);
  return root;
}
function buildCorridor(g, du) {
  const c = new THREE.Group(); c.position.set(du, 0, 4 + .22); g.add(c);
  const mat = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: .9, side: THREE.BackSide });
  const b = new THREE.Mesh(BG(1.6, 2.9, 2.6), mat); b.position.set(0, 1.45, 1.3); c.add(b);
  const end = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc887').multiplyScalar(1.5) }));
  end.position.set(0, 1.4, 2.58); end.rotation.y = Math.PI; c.add(end);
  const pl = new THREE.PointLight(0xffb36b, 0, 7, 2); pl.position.set(0, 2.2, 1.2); c.add(pl);
  S.dyn.corridorLight = pl;
}
function buildWindow(g, room) {
  const fr = M('#1b1a20', .4, .6), wood = M('#5b3a26', .55);
  const zc = (WIN.z0 + WIN.z1) / 2, yc = (WIN.y0 + WIN.y1) / 2, wz = WIN.z1 - WIN.z0, hy = WIN.y1 - WIN.y0;
  mesh(BG(.3, .1, wz + .2), fr, 5.08, WIN.y1 + .05, zc, g); mesh(BG(.3, .1, wz + .2), fr, 5.08, WIN.y0 - .05, zc, g);
  mesh(BG(.3, hy + .2, .1), fr, 5.08, yc, WIN.z0 - .05, g); mesh(BG(.3, hy + .2, .1), fr, 5.08, yc, WIN.z1 + .05, g);
  mesh(BG(.08, hy, .06), fr, 5.1, yc, zc, g); mesh(BG(.08, .06, wz), fr, 5.1, WIN.y0 + hy * .62, zc, g);
  mesh(BG(.42, .07, wz + .5), wood, 4.86, WIN.y0 - .02, zc, g);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wz, hy), new THREE.MeshStandardMaterial({ color: '#a8c8ff', transparent: true, opacity: .07, roughness: .04, metalness: 0, envMapIntensity: 1.2, depthWrite: false }));
  glass.rotation.y = -Math.PI / 2; glass.position.set(5.12, yc, zc); g.add(glass);
  buildOutside(g, room);
  // the window as something you can look at
  const hit = new THREE.Mesh(BG(.2, hy, wz), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(5.0, yc, zc);
  const grp = new THREE.Group(); grp.add(hit); g.add(grp);
  grp.userData.iid = 'window'; grp.userData.def = { uid: 'window', wall: 'right', name: '窗', entry: { kind: 'view', title: '窗外 · ' + (room.city || '') } };
}
function buildOutside(g, room) {
  const sky = localSky(room.lat == null ? 31.23 : room.lat, room.lon == null ? 121.47 : room.lon, room.tz);
  S.dyn.sky = sky;
  const P = {
    day: { top: '#3d7fd0', mid: '#8ec3ee', hor: '#d9ecf7', far: '#a7b9cc', mid2: '#7489a3', near: '#4a5a70', lit: .03, light: ['#fff1dc', 1.55], fill: .55 },
    golden: { top: '#3b4d8f', mid: '#e7866a', hor: '#ffd08a', far: '#c48a86', mid2: '#7a566b', near: '#3a2c40', lit: .08, light: ['#ffae66', 1.45], fill: .45 },
    dusk: { top: '#141a45', mid: '#5a3f7c', hor: '#c46a86', far: '#3f3766', mid2: '#2a2546', near: '#191528', lit: .3, light: ['#a68cff', .35], fill: .25 },
    night: { top: '#04060f', mid: '#0b1030', hor: '#2a2350', far: '#151a35', mid2: '#0e1228', near: '#080a17', lit: .42, light: ['#8fb0ff', .32], fill: .18 }
  }[sky.phase];
  const r = rng(hash((room.city || '') + room.no));
  const out = new THREE.Group(); g.add(out);
  const plane = (cw, ch, w, h, x, yBottom, draw, k = 1) => {
    const c = mkCanvas(cw, ch), ctx = c.getContext('2d'); draw(ctx, cw, ch);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texOf(c), transparent: true, depthWrite: false, color: new THREE.Color(k, k, k), fog: false }));
    m.rotation.y = -Math.PI / 2; m.position.set(x, yBottom + h / 2, .7); out.add(m); return m;
  };
  // sky
  plane(1024, 1024, 240, 140, 5 + 80, -50, (x, w, h) => {
    const hy = h * (1 - (2 + 50) / 140);
    const gr = x.createLinearGradient(0, 0, 0, hy); gr.addColorStop(0, P.top); gr.addColorStop(.62, P.mid); gr.addColorStop(1, P.hor);
    x.fillStyle = gr; x.fillRect(0, 0, w, hy); x.fillStyle = P.hor; x.fillRect(0, hy, w, h - hy);
    if (sky.phase === 'night' || sky.phase === 'dusk') { for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(255,255,255,${(sky.phase === 'night' ? .9 : .4) * r()})`; const s = r() < .08 ? 2 : 1; x.fillRect(r() * w, r() * hy * .8, s, s); } }
    const altY = clamp(hy - Math.tan(clamp(sky.alt, -5, 60) * D2R) * 80 / 140 * h, 30, hy + 10);
    if (sky.phase === 'night') { x.fillStyle = '#f4f1e6'; x.shadowColor = '#cfe0ff'; x.shadowBlur = 30; x.beginPath(); x.arc(w * .68, hy * .32, 22, 0, 7); x.fill(); x.shadowBlur = 0; x.fillStyle = P.top; x.beginPath(); x.arc(w * .68 + 9, hy * .32 - 5, 19, 0, 7); x.fill(); }
    else if (sky.phase !== 'dusk') { const sr = sky.phase === 'golden' ? 46 : 26; const sg = x.createRadialGradient(w * .58, altY, 0, w * .58, altY, sr * 5); sg.addColorStop(0, sky.phase === 'golden' ? 'rgba(255,200,120,1)' : 'rgba(255,250,235,1)'); sg.addColorStop(.2, sky.phase === 'golden' ? 'rgba(255,150,80,.55)' : 'rgba(255,245,220,.35)'); sg.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = sg; x.fillRect(0, 0, w, h); }
    if (sky.phase === 'day' || sky.phase === 'golden') { for (let i = 0; i < 9; i++) { const cx = r() * w, cy = hy * (.25 + r() * .5), s = 40 + r() * 90; x.fillStyle = sky.phase === 'golden' ? 'rgba(255,190,160,.35)' : 'rgba(255,255,255,.55)'; for (let j = 0; j < 6; j++) { x.beginPath(); x.ellipse(cx + (r() - .5) * s * 1.6, cy + (r() - .5) * s * .25, s * (.4 + r() * .4), s * (.14 + r() * .1), 0, 0, 7); x.fill(); } } }
  }, sky.phase === 'night' ? 1 : 1);
  // skylines: far / mid / near with lit windows
  const skyline = (layer, cw, ch, color, minH, maxH, density, landmark) => (x, w, h) => {
    let px = -20;
    while (px < w + 20) {
      const bw = (30 + r() * 70) * density, bh = h * (minH + r() * (maxH - minH));
      x.fillStyle = color; x.fillRect(px, h - bh, bw, bh);
      if (r() < .35) { x.fillRect(px + bw * .2, h - bh - bh * .12, bw * .6, bh * .12); }
      if (r() < .25) { x.fillRect(px + bw * .48, h - bh - 30, 3, 30); if (sky.phase !== 'day') { x.fillStyle = '#ff3b3b'; x.fillRect(px + bw * .48 - 1, h - bh - 32, 5, 5); x.fillStyle = color; } }
      const cols = Math.floor(bw / 10), rows = Math.floor(bh / 14);
      for (let i = 1; i < cols - 0; i++) for (let j = 1; j < rows; j++) {
        if (sky.phase === 'day') { if (r() < .5) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(px + i * 10 - 4, h - bh + j * 14, 5, 7); } continue; }
        if (r() < P.lit * (layer === 'near' ? .8 : 1)) { x.fillStyle = r() < .8 ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 50 | 0},${.7 + r() * .3})` : 'rgba(150,215,255,.85)'; x.fillRect(px + i * 10 - 4, h - bh + j * 14, 5, 7); }
      }
      x.fillStyle = color;
      px += bw + r() * 6;
    }
    if (landmark) {
      const lx = w * .62, base = h * .5;
      x.fillStyle = color; x.fillRect(lx - 10, h - base, 20, base); x.beginPath(); x.moveTo(lx - 22, h - base); x.lineTo(lx, h - base - 120); x.lineTo(lx + 22, h - base); x.fill();
      x.beginPath(); x.arc(lx, h - base - 40, 14, 0, 7); x.fill(); x.fillRect(lx - 2, h - base - 260, 4, 140);
      if (sky.phase !== 'day') { x.fillStyle = '#ff5aa8'; x.beginPath(); x.arc(lx, h - base - 40, 6, 0, 7); x.fill(); x.fillStyle = '#ff3b3b'; x.fillRect(lx - 3, h - base - 264, 6, 6); }
    }
    if (layer === 'near' && sky.phase !== 'day') { for (let i = 0; i < 5; i++) { x.fillStyle = ['#ff5aa8', '#62e6ff', '#ffb454'][i % 3]; x.shadowColor = x.fillStyle; x.shadowBlur = 16; x.fillRect(r() * w, h * (.55 + r() * .3), 40 + r() * 50, 8); } x.shadowBlur = 0; }
  };
  const lk = sky.phase === 'night' || sky.phase === 'dusk' ? 1.35 : 1;
  plane(2048, 512, 170, 34, 5 + 46, -14, skyline('far', 2048, 512, P.far, .2, .75, 1, true), lk);
  plane(2048, 512, 90, 22, 5 + 24, -14, skyline('mid', 2048, 512, P.mid2, .25, .8, 1.2), lk);
  plane(2048, 640, 38, 14, 5 + 10, -14, skyline('near', 2048, 640, P.near, .3, .9, 1.6), lk);
  // light coming through the window
  const sunH = sky.phase === 'day' ? clamp(Math.tan(clamp(sky.alt, 20, 60) * D2R) * 9, 4, 14) : sky.phase === 'golden' ? 2.4 : 7;
  const wl = new THREE.DirectionalLight(new THREE.Color(P.light[0]), P.light[1]);
  wl.position.set(5 + 9, 2 + sunH, sky.morning ? -1.5 : 2.6); wl.target.position.set(0, 0, .7);
  wl.castShadow = true; wl.shadow.mapSize.set(2048, 2048);
  Object.assign(wl.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 32 });
  wl.shadow.bias = -.0004; wl.shadow.normalBias = .03;
  g.add(wl); g.add(wl.target);
  const fill = new THREE.PointLight(new THREE.Color(P.mid), P.fill, 6, 2); fill.position.set(4.4, 2.4, .7); g.add(fill);
  S.dyn.windowLight = wl;
}
function buildRoom(data) {
  if (S.roomRoot) scene.remove(S.roomRoot);
  S.dyn = { leds: [], ledLights: [], pendants: [], blinkers: [], neons: [], robot: null, vinyl: null, noteFrame: null, door: null, corridorLight: null };
  S.itemGroups = new Map();
  scene.environment = buildEnv();
  const root = new THREE.Group(); S.roomRoot = root; scene.add(root);
  root.add(buildShell(data));
  for (const def of data.items) placeItem(def);
  const pts = [];
  for (let x = -5; x <= 5.001; x += .5) pts.push(x, .012, -4, x, .012, 4);
  for (let z = -4; z <= 4.001; z += .5) pts.push(-5, .012, z, 5, .012, z);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  S.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: .22 }));
  S.grid.visible = S.mode === 'build'; root.add(S.grid);
  S.selRing = new THREE.Mesh(new THREE.RingGeometry(.92, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(TK.accent).multiplyScalar(1.6), transparent: true, opacity: .9, side: THREE.DoubleSide }));
  S.selRing.rotation.x = -Math.PI / 2; S.selRing.position.y = .02; S.selRing.visible = false; root.add(S.selRing);
  rebuildColliders();
  drawNote(); drawChalk();
  refreshHotspots();
}
function placeItem(def) {
  const meta = ITEMS[def.type]; if (!meta) return null;
  const g = meta.build(def, S.room.theme);
  g.userData.iid = def.uid; g.userData.def = def; g.userData.meta = meta;
  positionItem(g, def);
  S.roomRoot.add(g); S.itemGroups.set(def.uid, g);
  return g;
}
function positionItem(g, def) {
  const y = def.y || 0;
  if (def.wall === 'back') { g.position.set(def.u, y, -4); g.rotation.set(0, 0, 0); }
  else if (def.wall === 'left') { g.position.set(-5, y, def.u); g.rotation.set(0, Math.PI / 2, 0); }
  else if (def.wall === 'right') { g.position.set(5, y, def.u); g.rotation.set(0, -Math.PI / 2, 0); }
  else if (def.wall === 'front') { g.position.set(def.u, y, 4); g.rotation.set(0, Math.PI, 0); }
  else { g.position.set(def.x, y, def.z); g.rotation.set(0, (def.rot || 0) * Math.PI / 2 + (def.ry || 0), 0); }
}
function rebuildColliders() {
  S.colliders = [];
  if (!S.room) return;
  for (const def of S.room.items) {
    if (def.wall || def.type === 'rug') continue;
    const meta = ITEMS[def.type] || {}, odd = (def.rot || 0) % 2;
    const hw = ((odd ? meta.d : meta.w) || 1) / 2 * .92, hd = ((odd ? meta.w : meta.d) || 1) / 2 * .92;
    S.colliders.push({ x0: def.x - hw, x1: def.x + hw, z0: def.z - hd, z1: def.z + hd, uid: def.uid });
  }
}
function findGroup(iid) {
  if (!S.roomRoot) return null;
  let found = null;
  S.roomRoot.traverse(o => { if (!found && o.userData && o.userData.iid === iid) found = o; });
  return found;
}
function nameOf(g) { const d = g.userData.def || {}; if (g.userData.isChild) return d.name || '物件'; return d.name || (g.userData.meta && g.userData.meta.name) || '物件'; }
function entryOf(g) { const d = g && g.userData.def; return d && d.entry ? d.entry : null; }
function doorDef() { return S.room && S.room.items.find(i => i.type === 'door'); }

