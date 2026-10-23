/* ============================================================
   Item builders. Every builder makes a group facing +z; wall items
   have their back at z = 0.
   ============================================================ */
function child(g, key, def, defaults) {
  def.children = def.children || {};
  if (!def.children[key]) def.children[key] = clone(defaults);
  g.userData.iid = def.uid + ':' + key; g.userData.def = def.children[key]; g.userData.parentDef = def; g.userData.isChild = true; g.userData.childKey = key;
  return g;
}
function ledMat() { if (!S.dyn.leds.length) S.dyn.leds.push(new THREE.MeshBasicMaterial({ color: 0xff5aa8 })); return S.dyn.leds[0]; }

function buildBarCounter(def) {
  const g = new THREE.Group();
  mesh(BG(4.2, 1.45, .85), M('#2b1b16', .75), 0, .725, 0, g);
  const slat = M('#3d271d', .7);
  for (let i = 0; i < 14; i++) mesh(BG(.2, 1.18, .04), slat, -1.95 + i * .3, .74, .44, g);
  mesh(BG(4.45, .12, 1.12), M('#8a5634', .38), 0, 1.51, .05, g);
  mesh(BG(4.2, .03, .03), GLOW('#ffb454', 2.4), 0, 1.42, .5, g);
  const rod = mesh(CY(.035, .035, 4.1, 10), M('#c79a4a', .28, .9), 0, .32, .62, g); rod.rotation.z = Math.PI / 2;
  // glasses on the counter
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: .05, metalness: .2, transparent: true, opacity: .45 });
  [[-1.2, .25], [-.9, .1], [.2, .2]].forEach(([x, z]) => { mesh(CY(.07, .055, .2, 14), glass, x, 1.67, z, g); });
  const drink = mesh(CY(.06, .05, .1, 14), GLOW('#ff5aa8', 1.2), -1.2, 1.63, .25, g);
  drink.castShadow = false;
  // pendant lamps
  S.dyn.pendants = S.dyn.pendants || [];
  for (const x of [-1.4, 0, 1.4]) {
    const cord = mesh(CY(.012, .012, 2.2, 6), M('#111', .6), x, 4.1, .05, g); cord.castShadow = false;
    const shade = mesh(CY(.08, .3, .32, 20, true), new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: .4, metalness: .6, side: THREE.DoubleSide }), x, 2.86, .05, g);
    shade.castShadow = false;
    const bulb = mesh(SPH(.09), GLOW('#ffcf8a', 2.6), x, 2.74, .05, g);
    const pl = new THREE.PointLight(0xffa04a, 1.2, 6.5, 2); pl.position.set(x, 2.55, .2); g.add(pl);
    S.dyn.pendants.push({ light: pl, bulb });
  }
  // vinyl player (child)
  const vin = new THREE.Group(); vin.position.set(1.55, 1.57, 0); vin.rotation.y = -.25;
  mesh(rboxGeo(.9, .16, .7, .05), M('#c9a06a', .55), 0, .08, 0, vin);
  mesh(CY(.29, .29, .03, 32), M('#2b2b30', .4, .6), -.1, .175, 0, vin);
  const rec = new THREE.Group(); rec.position.set(-.1, .2, 0); vin.add(rec);
  mesh(CY(.27, .27, .012, 40), M('#0d0d10', .25, .2), 0, 0, 0, rec);
  const label = mesh(CY(.09, .09, .014, 24), M('#ff5aa8', .5), 0, .001, 0, rec);
  mesh(BG(.03, .016, .05), M('#fff', .5), .05, .006, 0, rec);
  const arm = mesh(BG(.03, .03, .42), M('#d8d8dc', .3, .8), .28, .24, .02, vin); arm.rotation.y = .5;
  S.dyn.vinyl = rec;
  child(vin, 'vinyl', def, { name: '唱片机', entry: { kind: 'music', title: '唱片机', desc: '点一下放 lo-fi，再点一下停' } });
  g.add(vin);
  return g;
}
function buildBackShelf(def) {
  const g = new THREE.Group(), W = 3.8, r = rng(hash(def.uid));
  mesh(BG(W + .2, 2.3, .04), M('#1a1218', .22, .6), 0, 2.75, .02, g);
  const wood = M('#5b3a26', .55);
  const glassMats = ['#c9792d', '#3f7d4f', '#9fc7d8', '#7a1f3d', '#d8c48a'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .12, metalness: .2, transparent: true, opacity: .84, emissive: c, emissiveIntensity: .25 }));
  for (const y of [1.95, 2.7, 3.45]) {
    mesh(BG(W, .07, .42), wood, 0, y, .23, g);
    mesh(BG(W - .1, .02, .02), GLOW('#ffb06a', 2), 0, y + .05, .05, g);
    let x = -W / 2 + .2;
    while (x < W / 2 - .2) {
      const m = glassMats[Math.floor(r() * glassMats.length)], t = r();
      if (t < .5) { const h = .34 + r() * .12; mesh(CY(.085, .085, h, 14), m, x, y + .035 + h / 2, .24, g); mesh(CY(.028, .04, .16, 10), m, x, y + .035 + h + .08, .24, g); }
      else if (t < .8) { mesh(BG(.16, .3, .16), m, x, y + .185, .24, g); mesh(CY(.03, .03, .1, 8), m, x, y + .385, .24, g); }
      else { const s = mesh(SPH(.12, 14, 10), m, x, y + .155, .24, g); s.scale.y = 1.1; mesh(CY(.025, .03, .14, 8), m, x, y + .33, .24, g); }
      x += .22 + r() * .14;
    }
  }
  for (const x of [-W / 2 - .05, W / 2 + .05]) mesh(BG(.08, 1.7, .44), wood, x, 2.7, .23, g);
  return g;
}
function buildStool() {
  const g = new THREE.Group(), metal = M('#9ea3ad', .3, .85);
  mesh(CY(.36, .33, .13, 24), M('#8c2f39', .55), 0, 1.12, 0, g);
  mesh(CY(.045, .045, 1.05, 10), metal, 0, .55, 0, g);
  mesh(CY(.3, .32, .05, 24), metal, 0, .025, 0, g);
  const ring = mesh(new THREE.TorusGeometry(.24, .022, 8, 28), metal, 0, .45, 0, g); ring.rotation.x = Math.PI / 2;
  return g;
}
function buildRobot(def) {
  const g = new THREE.Group();
  const shell = M('#ece6da', .32, .08), dark = M('#262a33', .45, .5), accent = M('#ff5a6e', .45);
  mesh(CY(.26, .36, 1.25, 22), dark, 0, .625, 0, g);
  mesh(CY(.42, .46, .06, 26), GLOW('#62e6ff', 1.4), 0, 1.22, 0, g);
  const rig = new THREE.Group(); rig.position.y = 1.25; g.add(rig);
  mesh(rboxGeo(.95, 1.0, .75, .24), shell, 0, .55, 0, rig);
  mesh(rboxGeo(.52, .3, .04, .06), dark, 0, .55, .38, rig);
  for (let i = 0; i < 3; i++) mesh(BG(.07, .07, .02), GLOW(['#62e6ff', '#ffb454', '#ff5aa8'][i], 1.8), -.13 + i * .13, .55, .405, rig);
  const b1 = mesh(new THREE.ConeGeometry(.1, .18, 4), accent, -.09, .98, .37, rig); b1.rotation.z = -Math.PI / 2;
  const b2 = mesh(new THREE.ConeGeometry(.1, .18, 4), accent, .09, .98, .37, rig); b2.rotation.z = Math.PI / 2;
  mesh(SPH(.045), accent, 0, .98, .39, rig);
  const mkArm = (side) => {
    const a = new THREE.Group(); a.position.set(side * .56, .84, 0); rig.add(a);
    mesh(SPH(.13, 16, 12), shell, 0, 0, 0, a); mesh(CY(.085, .085, .5, 12), shell, 0, -.3, 0, a); mesh(SPH(.1, 14, 10), dark, 0, -.6, 0, a);
    return a;
  };
  const armL = mkArm(-1); armL.rotation.z = -.18;
  const armR = mkArm(1); armR.rotation.z = 2.35; armR.rotation.x = -.2;
  const shaker = new THREE.Group(); shaker.position.set(0, -.68, 0); armR.add(shaker);
  mesh(CY(.09, .075, .3, 16), M('#d9dde3', .18, .95), 0, -.1, 0, shaker); mesh(CY(.05, .09, .1, 16), M('#d9dde3', .18, .95), 0, -.3, 0, shaker);
  const head = new THREE.Group(); head.position.y = 1.18; rig.add(head);
  mesh(CY(.12, .14, .18, 14), dark, 0, -.06, 0, head);
  mesh(rboxGeo(1.06, .78, .82, .26), shell, 0, .38, 0, head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.84, .58), new THREE.MeshBasicMaterial({ map: faceTex, color: new THREE.Color(1.15, 1.15, 1.15) }));
  face.position.set(0, .4, .418); head.add(face);
  for (const s of [-1, 1]) { const e = mesh(CY(.13, .13, .08, 18), accent, s * .56, .4, 0, head); e.rotation.z = Math.PI / 2; }
  mesh(CY(.018, .018, .32, 8), dark, 0, .92, 0, head);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#62e6ff').multiplyScalar(2.4) });
  const bulb = mesh(SPH(.07, 14, 10), bulbMat, 0, 1.1, 0, head);
  S.dyn.robot = { g, rig, head, armR, armL, bulb, bulbMat };
  return g;
}
function buildDesk(def) {
  const g = new THREE.Group(), opts = def.opts || {};
  mesh(BG(3.8, .1, 1.4), M('#18171d', .45, .2), 0, 1.2, 0, g);
  const strip = mesh(BG(3.8, .03, .03), ledMat(), 0, 1.16, .71, g); strip.castShadow = false;
  for (const x of [-1.8, 1.8]) mesh(BG(.08, 1.15, 1.2), M('#222129', .5, .4), x, .575, 0, g);
  mesh(BG(3.4, .06, .06), M('#222129', .5, .4), 0, .4, -.4, g);
  mesh(BG(1.7, .01, .62), M('#2a1f3d', .9), .25, 1.256, .25, g);
  // main monitor
  mesh(BG(.5, .03, .3), M('#1c1c22', .4, .6), .15, 1.265, -.35, g);
  mesh(BG(.07, .55, .07), M('#1c1c22', .4, .6), .15, 1.53, -.42, g);
  mesh(rboxGeo(2.1, 1.22, .08, .04), M('#0d0d12', .35, .3), .15, 2.14, -.44, g);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.98, 1.1), new THREE.MeshBasicMaterial({ map: codeTex })); scr.position.set(.15, 2.14, -.395); g.add(scr);
  // vertical monitor
  const vm = new THREE.Group(); vm.position.set(-1.35, 0, -.3); vm.rotation.y = .35; g.add(vm);
  mesh(BG(.4, .03, .26), M('#1c1c22', .4, .6), 0, 1.265, 0, vm);
  mesh(BG(.06, .4, .06), M('#1c1c22', .4, .6), 0, 1.46, -.06, vm);
  mesh(rboxGeo(.72, 1.14, .07, .03), M('#0d0d12', .35, .3), 0, 2.02, -.08, vm);
  const vs = new THREE.Mesh(new THREE.PlaneGeometry(.64, 1.04), new THREE.MeshBasicMaterial({ map: heatTex })); vs.position.set(0, 2.02, -.04); vm.add(vs);
  // keyboard with per-key RGB (merged into one draw call)
  mesh(rboxGeo(1.1, .05, .38, .02), M('#111116', .4, .3), .15, 1.28, .25, g);
  const keys = [];
  for (let col = 0; col < 15; col++) for (let row = 0; row < 5; row++) {
    const c = new THREE.Color().setHSL(col / 15 * .8 + .5, .9, .6);
    keys.push({ w: .058, h: .028, d: .058, x: .15 - .49 + col * .07, y: 1.318, z: .25 - .14 + row * .07, color: '#' + c.getHexString() });
  }
  const km = new THREE.Mesh(mergeBoxes(keys), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.2, 1.2, 1.2) }));
  g.add(km);
  mesh(rboxGeo(.13, .05, .22, .05), M('#16161c', .4, .2), .95, 1.28, .25, g);
  mesh(SPH(.012), GLOW('#ff5aa8', 2), .95, 1.31, .2, g);
  // mug
  mesh(CY(.08, .07, .17, 16), M('#e7e1d6', .5), 1.55, 1.335, .1, g);
  const h = mesh(new THREE.TorusGeometry(.05, .014, 8, 16), M('#e7e1d6', .5), 1.64, 1.34, .1, g);
  // monitor glow on wall
  const gl = new THREE.PointLight(0x62e6ff, .7, 4.5, 2); gl.position.set(.15, 2.1, .4); g.add(gl);
  if (opts.console !== false) {
    const c = new THREE.Group();
    c.position.set(-1.35, 1.25, .3); c.rotation.order = 'YXZ'; c.rotation.y = -.55; g.add(c);
    const stand = mesh(BG(.5, .08, .34), M('#2c2c35', .5, .3), 0, .04, 0, c);
    const body = new THREE.Group(); body.position.set(0, .52, -.02); body.rotation.x = -.28; c.add(body);
    mesh(rboxGeo(.62, .94, .15, .09), M('#ff6f61', .42), 0, 0, 0, body);
    mesh(rboxGeo(.52, .42, .02, .03), M('#272033', .5), 0, .17, .075, body);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(.44, .35), new THREE.MeshBasicMaterial({ map: game.tex, color: new THREE.Color(1.1, 1.1, 1.1) })); sm.position.set(0, .17, .087); body.add(sm);
    mesh(BG(.15, .045, .03), M('#272033', .5), -.15, -.2, .08, body); mesh(BG(.045, .15, .03), M('#272033', .5), -.15, -.2, .08, body);
    for (const [x, y] of [[.13, -.16], [.22, -.23]]) { const b = mesh(CY(.045, .045, .03, 16), M('#2b2340', .4), x, y, .085, body); b.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 3; i++) { const sl = mesh(BG(.015, .09, .01), M('#c94f44', .5), .12 + i * .04, -.37, .077, body); sl.rotation.z = -.5; }
    c.userData.screen = { canvas: game.c, tex: game.tex, pixel: true, restore() {} };
    child(c, 'console', def, { name: '游戏机', entry: { kind: 'game', title: '霓虹贪吃蛇', desc: '房主自己写的网页小游戏，屏幕里一直在自动演示' } });
  }
  return g;
}
function buildChair() {
  const g = new THREE.Group(), black = M('#18171c', .55), pink = M('#d43d86', .5);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = mesh(BG(.07, .06, .5), M('#2a2a30', .4, .6), Math.sin(a) * .25, .12, Math.cos(a) * .25, g); leg.rotation.y = a; mesh(SPH(.05, 10, 8), black, Math.sin(a) * .5, .05, Math.cos(a) * .5, g); }
  mesh(CY(.05, .05, .5, 12), M('#2a2a30', .4, .6), 0, .4, 0, g);
  mesh(rboxGeo(1.0, .2, .95, .08), black, 0, .76, .05, g);
  for (const s of [-1, 1]) mesh(rboxGeo(.13, .17, .9, .05), pink, s * .47, .85, .05, g);
  const back = new THREE.Group(); back.position.set(0, .85, -.4); back.rotation.x = -.16; g.add(back);
  mesh(rboxGeo(.95, 1.6, .2, .1), black, 0, .8, 0, back);
  for (const s of [-1, 1]) mesh(BG(.12, 1.4, .02), pink, s * .3, .8, .105, back);
  mesh(rboxGeo(.5, .22, .14, .06), pink, 0, 1.38, .12, back);
  for (const s of [-1, 1]) { mesh(BG(.07, .32, .07), M('#2a2a30', .4, .6), s * .58, 1.0, .05, g); mesh(rboxGeo(.13, .05, .46, .02), black, s * .58, 1.18, .05, g); }
  return g;
}
function buildRug(def, theme) {
  const c = mkCanvas(512, 512), x = c.getContext('2d');
  const cols = theme.rug || ['#3a2350', '#ff5aa8', '#62e6ff', '#2a1a3c'];
  x.fillStyle = cols[0]; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6; i++) { x.strokeStyle = cols[1 + i % 3]; x.globalAlpha = .55; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 230 - i * 38, 0, Math.PI * 2); x.stroke(); }
  x.globalAlpha = 1;
  const t = texOf(c);
  const side = M(cols[3], .95), top = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  const m = new THREE.Mesh(CY(1.7, 1.7, .03, 56), [side, top, top]); m.position.y = .016; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}
function buildBeanbag(def, theme) {
  const g = new THREE.Group();
  const m = mesh(SPH(.7, 28, 18), M(theme.bean || '#2f6f73', .95), 0, .38, 0, g); m.scale.set(1, .6, .95);
  const t = mesh(SPH(.42, 20, 14), M(theme.bean || '#2f6f73', .95), -.05, .62, -.25, g); t.scale.set(1.2, .7, .7);
  return g;
}
function buildCoffeeTable() {
  const g = new THREE.Group();
  mesh(CY(.58, .58, .06, 40), M('#c9a06a', .5), 0, .58, 0, g);
  mesh(CY(.05, .05, .55, 12), M('#1c1c22', .4, .6), 0, .29, 0, g);
  mesh(CY(.3, .32, .04, 24), M('#1c1c22', .4, .6), 0, .02, 0, g);
  mesh(new THREE.ConeGeometry(.12, .14, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: .45, roughness: .05, side: THREE.DoubleSide }), .15, .83, .1, g).rotation.x = Math.PI;
  mesh(CY(.012, .012, .12, 6), M('#cfe8ff', .1), .15, .67, .1, g);
  mesh(CY(.1, .03, .08, 20), GLOW('#62e6ff', 1.3), .15, .84, .1, g);
  mesh(rboxGeo(.3, .04, .2, .02), M('#2b2b33', .4), -.2, .63, -.12, g);
  return g;
}
function buildPlant(def) {
  const g = new THREE.Group(), r = rng(hash(def.uid));
  mesh(CY(.32, .25, .6, 22), M('#3a3350', .6), 0, .3, 0, g);
  mesh(CY(.29, .29, .03, 22), M('#2a1d14', 1), 0, .58, 0, g);
  const greens = [M('#3f8f5a', .7), M('#2f7a4c', .7), M('#57a86e', .7)];
  for (let i = 0; i < 11; i++) {
    const p = new THREE.Group(); p.position.y = .58; p.rotation.y = i / 11 * Math.PI * 2 + r(); p.rotation.x = .35 + r() * .5; g.add(p);
    const l = mesh(SPH(.3, 12, 8), greens[i % 3], 0, .55 + r() * .25, 0, p); l.scale.set(.32, 1.1 + r() * .5, .08);
  }
  return g;
}
function buildFloorLamp(def) {
  const g = new THREE.Group();
  mesh(CY(.3, .32, .05, 24), M('#1c1c22', .4, .6), 0, .025, 0, g);
  mesh(CY(.025, .025, 2.6, 8), M('#c79a4a', .3, .85), 0, 1.33, 0, g);
  const shade = mesh(CY(.22, .4, .48, 28, true), new THREE.MeshStandardMaterial({ color: '#efe0c4', roughness: .8, emissive: '#ffb36b', emissiveIntensity: .7, side: THREE.DoubleSide }), 0, 2.62, 0, g);
  shade.castShadow = false;
  mesh(SPH(.1), GLOW('#ffd59a', 2.2), 0, 2.55, 0, g);
  if (def.light !== false) { const pl = new THREE.PointLight(0xffb36b, .9, 6, 2); pl.position.set(0, 2.4, 0); g.add(pl); }
  return g;
}
function kioskCanvas(entry, cw = 384, ch = 232) {
  const c = mkCanvas(cw, ch), g = c.getContext('2d');
  const sc = cw / 384; g.scale(sc, sc); const w = 384, h = ch / sc;
  const kc0 = KIND_COLOR[entry.kind] || KIND_COLOR.link, kc = /^#[0-9a-f]{6}$/i.test(entry.color || '') ? [entry.color, shadeHex(entry.color, -.4)] : kc0;
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, kc[0]); gr.addColorStop(1, kc[1]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * .82, h * .2, 30 + i * 26, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.28)'; rr(g, 18, 18, 92, 26, 13); g.fill();
  g.fillStyle = '#fff'; g.font = '500 14px ' + FONT.body; g.fillText(KIND_LABEL[entry.kind] || '作品', 32, 36);
  g.font = '700 34px ' + FONT.body; g.fillStyle = '#fff';
  const lines = wrapText(g, entry.title || '未命名作品', w - 40, 2);
  lines.forEach((l, i) => g.fillText(l, 20, 100 + i * 42));
  g.font = '15px ' + FONT.mono; g.fillStyle = 'rgba(255,255,255,.75)';
  let host = entry.work ? '隔壁托管 · 单文件作品' : '还没绑定地址';
  if (!entry.work && validUrl(entry.url)) { try { host = new URL(entry.url).host; } catch (e) {} }
  g.fillText(host, 20, h - 22);
  if (entry.from) {
    const t = (entry.from.adapted ? '改编自 ' : '收藏自 ') + String(entry.from.by || '').slice(0, 12);
    g.font = '500 13px ' + FONT.body; const tw = g.measureText(t).width + 22;
    g.fillStyle = 'rgba(8,6,16,.55)'; rr(g, w - tw - 14, 18, tw, 26, 13); g.fill();
    g.fillStyle = '#ffd9a0'; g.fillText(t, w - tw - 3, 36);
  }
  return c;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); const t = k < 0 ? 0 : 1, a = Math.abs(k); c.r += (t - c.r) * a; c.g += (t - c.g) * a; c.b += (t - c.b) * a; return '#' + c.getHexString(); }
function buildKeepsake(def) {
  const g = new THREE.Group();
  mesh(CY(.32, .36, .7, 24), M('#2a2236', .5, .2), 0, .35, 0, g);
  mesh(CY(.37, .37, .04, 24), M('#c79a4a', .35, .7), 0, .72, 0, g);
  mesh(CY(.3, .3, .012, 24), GLOW('#ffb454', 1.3), 0, .745, 0, g);
  mesh(BG(.04, .34, .04), M('#2a2a30', .4, .6), 0, .9, -.02, g);
  const head = new THREE.Group(); head.position.y = 1.2; head.rotation.x = -.2; g.add(head);
  mesh(rboxGeo(.82, .54, .05, .03), M('#101016', .35, .3), 0, 0, 0, head);
  const entry = def.entry || { kind: 'web', title: '收藏' };
  const kc = kioskCanvas(entry), ktex = texOf(kc);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(.74, .447), new THREE.MeshBasicMaterial({ map: ktex, color: new THREE.Color(1.05, 1.05, 1.05) }));
  sc.position.z = .03; head.add(sc);
  g.userData.screen = { canvas: kc, tex: ktex, restore() { const x = kc.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(kioskCanvas(entry), 0, 0); ktex.needsUpdate = true; } };
  return g;
}
function buildKiosk(def) {
  const g = new THREE.Group();
  mesh(CY(.36, .38, .06, 24), M('#1c1c22', .4, .6), 0, .03, 0, g);
  mesh(BG(.09, 1.05, .09), M('#2a2a30', .4, .6), 0, .58, 0, g);
  const head = new THREE.Group(); head.position.y = 1.4; head.rotation.x = -.18; g.add(head);
  mesh(rboxGeo(1.5, .95, .08, .05), M('#101016', .35, .3), 0, 0, 0, head);
  const entry = def.entry || { kind: 'web', title: '展示屏' };
  const kc = kioskCanvas(entry), ktex = texOf(kc);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.38, .835), new THREE.MeshBasicMaterial({ map: ktex, color: new THREE.Color(1.05, 1.05, 1.05) }));
  sc.position.z = .042; head.add(sc);
  g.userData.screen = { canvas: kc, tex: ktex, restore() { const x = kc.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(kioskCanvas(entry), 0, 0); ktex.needsUpdate = true; } };
  return g;
}
function buildArcade(def, theme) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-.35, 0); s.lineTo(.3, 0); s.lineTo(.3, .95); s.lineTo(.46, 1.06); s.lineTo(.27, 1.17); s.lineTo(.16, 1.86); s.lineTo(.27, 2.06); s.lineTo(-.35, 2.06); s.lineTo(-.35, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: .9, bevelEnabled: false }); geo.rotateY(-Math.PI / 2); geo.translate(.45, 0, 0);
  const col = (def.entry && def.entry.color) || theme.arcade || '#3b2a6b';
  mesh(geo, M(col, .5), 0, 0, 0, g);
  const r = rng(hash(def.uid + (def.entry ? def.entry.title : '')));
  const c = mkCanvas(128, 112), x = c.getContext('2d');
  x.fillStyle = '#05060c'; x.fillRect(0, 0, 128, 112);
  const pal = ['#ff5aa8', '#62e6ff', '#ffb454', '#7ee0a1'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { if (r() < .25) continue; x.fillStyle = pal[i]; x.fillRect(12 + j * 18, 14 + i * 14, 10, 7); }
  x.fillStyle = '#e8e4f0'; x.fillRect(58, 96, 12, 5);
  x.font = '9px ' + FONT.mono; x.fillStyle = '#ffb454'; x.fillText('INSERT COIN', 34, 84);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.66, .58), new THREE.MeshBasicMaterial({ map: texOf(c, true), color: new THREE.Color(1.25, 1.25, 1.25) }));
  scr.position.set(0, 1.515, .228); scr.rotation.x = -Math.atan2(.11, .69); g.add(scr);
  const mc = mkCanvas(256, 64), mx = mc.getContext('2d');
  mx.fillStyle = '#120a1c'; mx.fillRect(0, 0, 256, 64); mx.font = '700 30px ' + FONT.body; mx.fillStyle = '#ffd36b'; mx.textAlign = 'center'; mx.textBaseline = 'middle';
  mx.fillText((def.entry && def.entry.title) || 'ARCADE', 128, 33);
  const mq = new THREE.Mesh(new THREE.PlaneGeometry(.82, .2), new THREE.MeshBasicMaterial({ map: texOf(mc), color: new THREE.Color(1.5, 1.5, 1.5) }));
  mq.position.set(0, 1.965, .222); mq.rotation.x = Math.atan2(.11, .2); g.add(mq);
  const stick = mesh(CY(.018, .018, .1, 8), M('#222', .4), -.16, 1.17, .35, g); stick.rotation.x = .4;
  mesh(SPH(.045), M('#ff5a6e', .4), -.16, 1.22, .37, g);
  [[.05, '#62e6ff'], [.15, '#ffb454'], [.25, '#7ee0a1']].forEach(([px, cc]) => mesh(CY(.03, .03, .03, 12), GLOW(cc, 1.3), px, 1.14, .37, g));
  return g;
}
function buildBookshelf(def) {
  const g = new THREE.Group(), r = rng(hash(def.uid)), wood = M('#4a3427', .6);
  mesh(BG(1.6, 2.6, .05), wood, 0, 1.3, -.3, g);
  for (const x of [-.78, .78]) mesh(BG(.05, 2.6, .62), wood, x, 1.3, 0, g);
  const books = [];
  const pal = ['#d9534f', '#f0ad4e', '#5bc0de', '#e9e2d0', '#6f5bd5', '#3f8f5a', '#ff8fb1', '#2c3e50'];
  for (let i = 0; i < 5; i++) {
    const y = .05 + i * .62; mesh(BG(1.52, .04, .6), wood, 0, y, 0, g);
    if (i === 4) break;
    let x = -.72;
    while (x < .68) { const w = .06 + r() * .07, h = .34 + r() * .2; if (r() < .1) { x += .12; continue; } books.push({ w, h, d: .4, x: x + w / 2, y: y + .02 + h / 2, z: .02, color: pal[Math.floor(r() * pal.length)] }); x += w + .008; }
  }
  mesh(BG(1.6, .05, .62), wood, 0, 2.6, 0, g);
  mesh(mergeBoxes(books), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), 0, 0, 0, g);
  return g;
}
function buildSofa(def, theme) {
  const g = new THREE.Group(), col = theme.sofa || '#5b4a8a', mat = M(col, .9);
  mesh(rboxGeo(2.3, .4, 1.0, .08), mat, 0, .3, 0, g);
  for (const x of [-.55, .55]) mesh(rboxGeo(1.05, .22, .82, .1), mat, x, .6, .06, g);
  mesh(rboxGeo(2.3, .72, .28, .1), mat, 0, .82, -.38, g);
  for (const x of [-1.16, 1.16]) mesh(rboxGeo(.26, .58, 1.0, .1), mat, x, .55, 0, g);
  mesh(rboxGeo(.42, .36, .14, .08), M('#ffb454', .9), -.7, .86, -.15, g).rotation.z = .15;
  return g;
}
function buildServerRack(def) {
  const g = new THREE.Group();
  mesh(BG(.95, 2.5, .9), M('#15161c', .45, .45), 0, 1.25, 0, g);
  mesh(BG(.85, 2.36, .02), M('#0b0b10', .3, .5), 0, 1.25, .455, g);
  for (let i = 0; i < 12; i++) {
    mesh(BG(.8, .14, .02), M('#22232c', .4, .4), 0, .3 + i * .18, .47, g);
    for (let j = 0; j < 3; j++) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(j === 0 ? '#7ee0a1' : j === 1 ? '#ffb454' : '#62e6ff').multiplyScalar(1.8) });
      const led = new THREE.Mesh(BG(.03, .03, .02), m); led.position.set(-.32 + j * .06, .3 + i * .18, .485); g.add(led);
      S.dyn.blinkers.push({ m, base: m.color.clone(), ph: Math.random() * 10, sp: 1 + Math.random() * 6 });
    }
  }
  return g;
}
function buildWhiteboard(def) {
  const g = new THREE.Group(), metal = M('#9ea3ad', .3, .8);
  for (const x of [-.95, .95]) { mesh(BG(.05, 2.2, .05), metal, x, 1.1, 0, g); mesh(BG(.05, .05, .7), metal, x, .03, 0, g); }
  mesh(BG(2.0, 1.3, .05), M('#e9e9ee', .4), 0, 1.6, 0, g);
  const c = mkCanvas(400, 260), x = c.getContext('2d'), entry = def.entry || {};
  x.fillStyle = '#f7f7fa'; x.fillRect(0, 0, 400, 260);
  x.strokeStyle = '#3d5afe'; x.lineWidth = 3; x.font = '22px ' + FONT.chalk; x.fillStyle = '#20232b';
  x.fillText(entry.title || '项目说明', 20, 36);
  const boxes = [[30, 80], [160, 80], [290, 80], [160, 170]];
  boxes.forEach(([bx, by], i) => { x.strokeStyle = ['#3d5afe', '#e53935', '#43a047', '#fb8c00'][i]; rr(x, bx, by, 86, 44, 8); x.stroke(); });
  x.strokeStyle = '#20232b'; x.lineWidth = 2; x.beginPath(); x.moveTo(116, 102); x.lineTo(160, 102); x.moveTo(246, 102); x.lineTo(290, 102); x.moveTo(203, 124); x.lineTo(203, 170); x.stroke();
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.22), new THREE.MeshBasicMaterial({ map: texOf(c), color: new THREE.Color(.95, .95, .95) }));
  sc.position.set(0, 1.6, .027); g.add(sc);
  return g;
}
function buildPegboard(def) {
  const g = new THREE.Group(), W = 3.8, H = 2.2;
  const pc = mkCanvas(512, 296), px = pc.getContext('2d');
  px.fillStyle = '#d9cfbf'; px.fillRect(0, 0, 512, 296);
  for (let x = 10; x < 512; x += 18) for (let y = 10; y < 296; y += 18) { px.fillStyle = '#7f7363'; px.beginPath(); px.arc(x, y, 3.2, 0, 7); px.fill(); px.fillStyle = 'rgba(255,255,255,.4)'; px.beginPath(); px.arc(x + .8, y + 1.2, 1.2, 0, 7); px.fill(); }
  const side = M('#bfb3a0', .8);
  const board = new THREE.Mesh(BG(W, H, .06), [side, side, side, side, new THREE.MeshStandardMaterial({ map: texOf(pc), roughness: .85 }), side]);
  board.position.z = .05; board.receiveShadow = true; g.add(board);
  const bar = mesh(BG(W - .2, .035, .035), ledMat(), 0, H / 2 + .06, .1, g); bar.castShadow = false;
  const hook = (x, y) => { const h = mesh(CY(.018, .018, .16, 8), M('#9a9aa2', .3, .8), x, y, .14, g); h.rotation.x = Math.PI / 2; };
  // 拾光 e-note
  const opts = def.opts || {};
  if (opts.note !== false) {
    const note = new THREE.Group(); note.position.set(-.5, -.02, .14); note.rotation.z = .035; g.add(note);
    const frameMat = new THREE.MeshStandardMaterial({ color: SKINS[SG.skin].frame, roughness: .45 }); S.dyn.noteFrame = frameMat;
    mesh(rboxGeo(1.02, 1.28, .07, .08), frameMat, 0, 0, 0, note);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.88, 1.1), new THREE.MeshBasicMaterial({ map: noteTex, color: new THREE.Color(.8, .8, .8) })); scr.position.z = .037; note.add(scr);
    mesh(SPH(.024), GLOW('#7ee0a1', 2.2), .42, -.57, .04, note);
    hook(-.5, .7);
    child(note, 'note', def, { name: '电子便签', entry: { kind: 'shiguang', title: '拾光', desc: '房主做的待办与便签 App：网页版、Windows 桌面版和浏览器扩展' } });
  }
  // headphones
  const hp = new THREE.Group(); hp.position.set(1.3, .45, .2); g.add(hp);
  mesh(new THREE.TorusGeometry(.3, .04, 10, 28, Math.PI), M('#1a1a20', .4, .3), 0, 0, 0, hp);
  for (const s of [-1, 1]) { const cu = mesh(CY(.12, .12, .1, 20), M('#d43d86', .45), s * .3, -.05, 0, hp); cu.rotation.z = Math.PI / 2; }
  hook(1.3, .74);
  // cassette (bindable)
  const cas = new THREE.Group(); cas.position.set(.72, -.62, .14); cas.rotation.z = -.06; g.add(cas);
  mesh(rboxGeo(.8, .52, .09, .04), M('#2b2b33', .45), 0, 0, 0, cas);
  const lc = mkCanvas(256, 96), lx = lc.getContext('2d'); lx.fillStyle = '#ffb454'; lx.fillRect(0, 0, 256, 96); lx.fillStyle = '#2a1706'; lx.font = '700 30px ' + FONT.body; lx.fillText('MIX · 通勤', 18, 44); lx.font = '18px ' + FONT.mono; lx.fillText('SIDE A', 18, 78);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(.66, .25), new THREE.MeshStandardMaterial({ map: texOf(lc), roughness: .7 })); lab.position.set(0, .07, .047); cas.add(lab);
  for (const s of [-1, 1]) { const rl = mesh(CY(.06, .06, .02, 16), M('#e9e2d0', .5), s * .15, -.12, .05, cas); rl.rotation.x = Math.PI / 2; }
  hook(.72, -.3);
  child(cas, 'cassette', def, { name: '磁带', entry: { kind: 'link', title: '通勤歌单', desc: '任何物件都可以绑定作品：在建造模式里给这盘磁带填上歌单地址', url: '' } });
  // pixel heart
  const pat = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  const bx = []; pat.forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') bx.push({ w: .07, h: .07, d: .07, x: (i - 3) * .075, y: (2.5 - j) * .075, z: 0, color: j < 2 && i < 3 ? '#ff9ab2' : '#ff4d6d' }); }));
  const heart = new THREE.Mesh(mergeBoxes(bx), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.25, 1.25) }));
  heart.position.set(.48, .5, .14); g.add(heart);
  // little cat figure
  const cat = new THREE.Group(); cat.position.set(-1.42, -.75, .14); g.add(cat);
  mesh(BG(.42, .05, .2), M('#8a6a4a', .6), 0, -.08, .04, cat);
  const cb = mesh(SPH(.13, 16, 12), M('#f2c14e', .6), 0, .05, .07, cat); cb.scale.set(1, .85, .9);
  mesh(SPH(.1, 16, 12), M('#f2c14e', .6), 0, .22, .09, cat);
  for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(.035, .07, 6), M('#f2c14e', .6), s * .06, .32, .09, cat); }
  // hanging plant
  const hpl = new THREE.Group(); hpl.position.set(-1.42, .42, .2); g.add(hpl);
  mesh(CY(.15, .11, .2, 16), M('#e9e2d0', .6), 0, 0, 0, hpl);
  for (let i = 0; i < 6; i++) { const l = mesh(SPH(.12, 10, 8), M(i % 2 ? '#3f8f5a' : '#57a86e', .7), Math.cos(i) * .12, -.1 - (i % 3) * .1, Math.sin(i) * .06 + .04, hpl); l.scale.set(.6, 1.3, .35); }
  hook(-1.42, .62);
  // trophy
  const pts = [[0, 0], [.09, 0], [.09, .02], [.03, .04], [.03, .12], [.1, .16], [.12, .28], [0, .3]].map(p => new THREE.Vector2(p[0], p[1]));
  mesh(new THREE.LatheGeometry(pts, 20), M('#e8b84a', .25, .9), 1.42, -.86, .18, g);
  return g;
}
function neonCanvas(text, color) {
  const c = mkCanvas(1024, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `120px ${FONT.neon}`;
  let size = 120; while (g.measureText(text).width > 940 && size > 40) { size -= 6; g.font = `${size}px ${FONT.neon}`; }
  g.shadowColor = color; g.shadowBlur = 34; g.strokeStyle = color; g.lineWidth = 10; g.strokeText(text, 512, 132);
  g.shadowBlur = 12; g.lineWidth = 5; g.strokeText(text, 512, 132);
  g.shadowBlur = 0; g.strokeStyle = '#fff2f8'; g.lineWidth = 2.2; g.strokeText(text, 512, 132);
  return c;
}
function buildNeon(def, theme) {
  const g = new THREE.Group();
  const text = def.text || theme.neon || 'GEBI', color = theme.neonColor || '#ff5aa8';
  mesh(BG(3.6, .95, .04), new THREE.MeshStandardMaterial({ color: '#120f18', roughness: .2, metalness: .3, transparent: true, opacity: .7 }), 0, 0, .03, g);
  const nc = neonCanvas(text, color);
  const mat = new THREE.MeshBasicMaterial({ map: texOf(nc), transparent: true, depthWrite: false, color: new THREE.Color(1.9, 1.9, 1.9) });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(3.5, .875), mat); p.position.z = .06; g.add(p);
  const pl = new THREE.PointLight(new THREE.Color(color), .7, 5, 2); pl.position.set(0, -.2, .8); g.add(pl);
  S.dyn.neons.push({ mat, light: pl, canvas: nc, text, color });
  return g;
}
function buildChalkboard() {
  const g = new THREE.Group();
  mesh(BG(2.4, 1.8, .07), M('#5b3a26', .6), 0, 0, .035, g);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.22, 1.62), new THREE.MeshStandardMaterial({ map: chalkTex, roughness: .95, emissive: '#ffffff', emissiveMap: chalkTex, emissiveIntensity: .12 }));
  b.position.z = .072; b.receiveShadow = true; g.add(b);
  mesh(BG(2.2, .05, .12), M('#5b3a26', .6), 0, -.86, .1, g);
  mesh(BG(.14, .04, .04), M('#f3efe2', .9), .6, -.82, .12, g);
  return g;
}
function buildDoor(def, theme) {
  const g = new THREE.Group(), trim = M(theme.trim || '#3c2f58', .55);
  mesh(BG(1.5, .14, .16), trim, 0, 2.75, .03, g);
  for (const x of [-.69, .69]) mesh(BG(.12, 2.75, .16), trim, x, 1.375, .03, g);
  const pivot = new THREE.Group(); pivot.position.set(-.6, 0, 0); g.add(pivot);
  const leaf = new THREE.Group(); leaf.position.set(.6, 0, 0); pivot.add(leaf);
  mesh(BG(1.18, 2.66, .07), M('#3b2a24', .55), 0, 1.33, 0, leaf);
  for (const y of [.72, 1.86]) { mesh(BG(.86, .66, .02), M('#33231e', .6), 0, y, .045, leaf); mesh(BG(.86, .66, .02), M('#33231e', .6), 0, y, -.045, leaf); }
  const win = mesh(CY(.16, .16, .08, 28), GLOW('#ffcf8a', 1.5), 0, 2.2, 0, leaf); win.rotation.x = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(.17, .028, 8, 28), M('#c79a4a', .3, .85), 0, 2.2, .05, leaf);
  mesh(SPH(.05), M('#c79a4a', .3, .85), .46, 1.2, .08, leaf); mesh(SPH(.05), M('#c79a4a', .3, .85), .46, 1.2, -.08, leaf);
  const pc = mkCanvas(128, 64), px = pc.getContext('2d');
  px.fillStyle = TK.bg; px.fillRect(0, 0, 128, 64); drawPlate(px, 2, 6, 124, 52, S.room ? S.room.no : '302', .9);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(.36, .18), new THREE.MeshStandardMaterial({ map: texOf(pc), roughness: .3, metalness: .5 }));
  plate.position.set(0, 1.64, .046); leaf.add(plate);
  S.dyn.door = { pivot, open: 0, goal: 0 };
  return g;
}
const ITEMS = {
  barCounter: { name: '吧台', w: 4.4, d: 1.1, build: buildBarCounter, nodelete: true },
  backShelf: { name: '酒柜', wall: true, build: buildBackShelf },
  stool: { name: '吧凳', w: .8, d: .8, build: buildStool, catalog: true },
  robot: { name: '酒保 Bit', w: 1.1, d: 1, build: buildRobot, nodelete: true },
  desk: { name: '电竞桌', w: 3.9, d: 1.5, build: buildDesk },
  chair: { name: '电竞椅', w: 1.2, d: 1.2, build: buildChair, catalog: true },
  rug: { name: '地毯', w: 3.4, d: 3.4, build: buildRug, flat: true },
  beanbag: { name: '懒人沙发', w: 1.4, d: 1.3, build: buildBeanbag, catalog: true },
  coffeeTable: { name: '小圆桌', w: 1.2, d: 1.2, build: buildCoffeeTable, catalog: true },
  plant: { name: '盆栽', w: .8, d: .8, build: buildPlant, catalog: true },
  floorLamp: { name: '落地灯', w: .8, d: .8, build: buildFloorLamp, catalog: true },
  keepsake: { name: '收藏品', w: .9, d: .9, build: buildKeepsake },
  kiosk: { name: '展示屏', w: 1.5, d: .8, build: buildKiosk, catalog: true, entry: { kind: 'web', title: '新作品', desc: '', url: '' } },
  arcade: { name: '街机', w: 1, d: 1, build: buildArcade, catalog: true, entry: { kind: 'game2', title: '新游戏', desc: '', url: '' } },
  bookshelf: { name: '书架', w: 1.7, d: .7, build: buildBookshelf, catalog: true },
  sofa: { name: '沙发', w: 2.4, d: 1.1, build: buildSofa, catalog: true },
  serverRack: { name: '机柜', w: 1, d: 1, build: buildServerRack, catalog: true, entry: { kind: 'app', title: '服务面板', desc: '', url: '' } },
  whiteboard: { name: '白板', w: 2.1, d: .8, build: buildWhiteboard, catalog: true, entry: { kind: 'repo', title: '项目说明', desc: '', url: '' } },
  pegboard: { name: '洞洞板', wall: true, build: buildPegboard },
  neon: { name: '霓虹招牌', wall: true, build: buildNeon },
  chalkboard: { name: '留言黑板', wall: true, build: buildChalkboard },
  door: { name: '门', wall: true, build: buildDoor, nodelete: true }
};
const KIND_LABEL = { view: '窗外', agent: 'AI 助手', shiguang: 'App', game: '小游戏', guestbook: '留言板', music: '音乐', door: '出口', web: '网页作品', game2: '小游戏', app: '工具 App', repo: '开源仓库', link: '链接' };
const KIND_COLOR = { web: ['#3d5afe', '#7c4dff'], game2: ['#ff5a6e', '#ff9a3d'], game: ['#ff5a6e', '#ff9a3d'], app: ['#00a389', '#3ec6e0'], repo: ['#2b2f3a', '#56607a'], link: ['#7a3cff', '#ff5aa8'], shiguang: ['#4b7bec', '#8fb3ff'], agent: ['#1f8fa8', '#62e6ff'], guestbook: ['#1f2b24', '#3d5a49'], music: ['#a83cff', '#ff5aa8'] };
const BIND_KINDS = ['web', 'game2', 'app', 'repo', 'link'];
const CAT_ICON = {
  kiosk: '<rect x="8" y="5" width="24" height="15" rx="2" fill="#3d5afe"/><rect x="19" y="20" width="2" height="9" fill="#a99db4"/><rect x="13" y="29" width="14" height="2" rx="1" fill="#a99db4"/>',
  arcade: '<path d="M12 4h16v8l-2 10 4 2v8H10v-8l4-2-2-10z" fill="#ff5a6e"/><rect x="15" y="8" width="10" height="9" fill="#0a0e1c"/>',
  bookshelf: '<rect x="9" y="4" width="22" height="27" fill="#4a3427"/><rect x="11" y="7" width="3" height="8" fill="#5bc0de"/><rect x="15" y="8" width="3" height="7" fill="#f0ad4e"/><rect x="11" y="19" width="4" height="8" fill="#d9534f"/><rect x="16" y="20" width="3" height="7" fill="#e9e2d0"/>',
  sofa: '<rect x="6" y="12" width="28" height="10" rx="3" fill="#5b4a8a"/><rect x="4" y="16" width="6" height="12" rx="2" fill="#5b4a8a"/><rect x="30" y="16" width="6" height="12" rx="2" fill="#5b4a8a"/><rect x="9" y="20" width="22" height="7" rx="2" fill="#6e5ca0"/>',
  beanbag: '<ellipse cx="20" cy="22" rx="14" ry="9" fill="#2f6f73"/><ellipse cx="18" cy="16" rx="8" ry="5" fill="#3a8288"/>',
  plant: '<path d="M14 22h12l-2 10h-8z" fill="#3a3350"/><ellipse cx="16" cy="14" rx="3" ry="8" fill="#3f8f5a" transform="rotate(-25 16 14)"/><ellipse cx="24" cy="14" rx="3" ry="8" fill="#57a86e" transform="rotate(25 24 14)"/><ellipse cx="20" cy="11" rx="3" ry="9" fill="#2f7a4c"/>',
  floorLamp: '<path d="M14 4h12l3 8H11z" fill="#efe0c4"/><rect x="19" y="12" width="2" height="18" fill="#c79a4a"/><rect x="14" y="30" width="12" height="2" rx="1" fill="#a99db4"/>',
  stool: '<ellipse cx="20" cy="9" rx="9" ry="3" fill="#8c2f39"/><rect x="19" y="10" width="2" height="18" fill="#9ea3ad"/><ellipse cx="20" cy="30" rx="7" ry="2" fill="#9ea3ad"/>',
  chair: '<rect x="13" y="3" width="14" height="17" rx="3" fill="#18171c" stroke="#d43d86" stroke-width="1.5"/><rect x="11" y="19" width="18" height="5" rx="2" fill="#18171c" stroke="#d43d86" stroke-width="1.5"/><rect x="19" y="24" width="2" height="6" fill="#a99db4"/>',
  coffeeTable: '<ellipse cx="20" cy="15" rx="12" ry="4" fill="#c9a06a"/><rect x="19" y="18" width="2" height="11" fill="#a99db4"/><ellipse cx="20" cy="30" rx="6" ry="2" fill="#a99db4"/>',
  serverRack: '<rect x="12" y="3" width="16" height="29" rx="1" fill="#15161c" stroke="#3a3d45"/><g fill="#7ee0a1"><rect x="15" y="7" width="2" height="2"/><rect x="15" y="12" width="2" height="2"/><rect x="15" y="17" width="2" height="2"/></g><g fill="#ffb454"><rect x="18" y="7" width="2" height="2"/><rect x="18" y="17" width="2" height="2"/></g>',
  whiteboard: '<rect x="6" y="5" width="28" height="18" fill="#e9e9ee"/><path d="M10 12h6M20 12h6M16 17h8" stroke="#3d5afe" stroke-width="1.5"/><path d="M9 23l-2 9M31 23l2 9" stroke="#9ea3ad" stroke-width="1.5"/>'
};

