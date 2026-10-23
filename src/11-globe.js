/* ============================================================
   The planet: real geography, drawn as a lattice of light
   ============================================================ */
const G = {
  root: null, land: null, landMat: null, ocean: null, oceanMat: null, halo: null, rings: [], stars: null,
  pins: [], pinRoot: null, arcs: [], ambient: null, reticle: null, marker: null, landGrid: null,
  cam: { lat: 22, lon: 112, dist: 9 }, vel: { lat: 0, lon: 0 }, fly: null, idle: 0, shift: 0, shiftGoal: 0,
  hover: null, hoverDir: new THREE.Vector3(0, 1, 0), hoverAmt: 0, clickDir: new THREE.Vector3(0, 1, 0), clickT: -1,
  sun: new THREE.Vector3(1, 0, 0), ready: false, moving: false, pending: null
};
function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)') {
  const c = mkCanvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(.18, mid); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const GLOW_TEX = glowTexture();
const NV = 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';

function buildGlobe(landBuf) {
  const root = new THREE.Group(); G.root = root; globeScene.add(root);
  // ---- ocean: a dark lacquered sphere with a graticule and a lit limb
  G.oceanMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: G.sun }, hoverDir: { value: G.hoverDir }, hoverAmt: { value: 0 }, time: { value: 0 } },
    extensions: { derivatives: true },
    vertexShader: NV,
    fragmentShader: `
      uniform vec3 sunDir, hoverDir; uniform float hoverAmt, time; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(sunDir);
        float ndl = dot(N, L);
        float la = asin(clamp(N.y, -1., 1.)) / 0.2617994, lo = atan(N.z, -N.x) / 0.2617994;
        float gl = abs(fract(la + .5) - .5) / fwidth(la), gm = abs(fract(lo + .5) - .5) / fwidth(lo);
        float grid = (1. - smoothstep(0., 1.2, gl)) + (1. - smoothstep(0., 1.2, gm)) * smoothstep(.98, .9, abs(N.y));
        float eq = 1. - smoothstep(0., 1.6, abs(la) / fwidth(la));
        vec3 col = mix(vec3(.008, .010, .03), vec3(.016, .04, .085), smoothstep(-.25, .7, ndl));
        col += vec3(.06, .16, .26) * clamp(grid, 0., 1.) * (.35 + .4 * smoothstep(-.3, .6, ndl));
        col += vec3(1., .55, .25) * eq * .18;
        float fr = pow(1. - max(dot(N, V), 0.), 3.);
        col += mix(vec3(.85, .25, .6), vec3(.2, .65, 1.), smoothstep(-.35, .45, ndl)) * fr * .9;
        float term = exp(-pow(ndl / .07, 2.));
        col += vec3(1., .5, .2) * term * .07;
        float sweep = pow(max(0., sin(atan(N.z, -N.x) - time * .25)), 60.);
        col += vec3(.2, .6, 1.) * sweep * .05;
        col += vec3(1., .7, .3) * smoothstep(.996, 1., dot(N, hoverDir)) * hoverAmt * .06;
        gl_FragColor = vec4(col, 1.);
      }`
  });
  G.ocean = new THREE.Mesh(new THREE.SphereGeometry(.995, 128, 96), G.oceanMat);
  root.add(G.ocean);

  // ---- land: ~52k dots from real coastlines; brightness from real city lights, lift from real elevation
  const rec = new DataView(landBuf), n = Math.floor(landBuf.byteLength / 6);
  const pos = new Float32Array(n * 3), li = new Float32Array(n), el = new Float32Array(n), co = new Float32Array(n), rnd = new Float32Array(n);
  const grid = new Uint8Array(360 * 720), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const lat = rec.getInt16(i * 6, true) / 100, lon = rec.getInt16(i * 6 + 2, true) / 100, l = rec.getUint8(i * 6 + 4), e = rec.getUint8(i * 6 + 5);
    latLonToVec(lat, lon, 1, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    li[i] = l / 255; el[i] = (e & 254) / 200; co[i] = e & 1; rnd[i] = Math.random();
    grid[Math.floor(90 - lat) * 2 * 720 + Math.floor((lon + 180) * 2) % 720] = 1;
  }
  G.landGrid = grid;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lg.setAttribute('aLi', new THREE.BufferAttribute(li, 1)); lg.setAttribute('aEl', new THREE.BufferAttribute(el, 1));
  lg.setAttribute('aCoast', new THREE.BufferAttribute(co, 1)); lg.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  G.landMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, size: { value: 2.5 }, pr: { value: DPR }, sunDir: { value: G.sun }, hoverDir: { value: G.hoverDir }, hoverAmt: { value: 0 }, clickDir: { value: G.clickDir }, clickT: { value: -1 }, reveal: { value: 0 } },
    vertexShader: `
      uniform float time, size, pr, hoverAmt, clickT, reveal; uniform vec3 sunDir, hoverDir, clickDir;
      attribute float aLi, aEl, aCoast, aRnd; varying vec3 vCol; varying float vA;
      void main(){
        vec3 n = normalize(position);
        float ndl = dot(n, normalize(sunDir)), day = smoothstep(-.1, .25, ndl);
        float hd = acos(clamp(dot(n, hoverDir), -1., 1.)), hl = hoverAmt * smoothstep(.2, .0, hd);
        float wave = 0.;
        if (clickT >= 0.) { float cd = acos(clamp(dot(n, clickDir), -1., 1.)); wave = smoothstep(.045, .0, abs(cd - clickT * .85)) * max(0., 1. - clickT * .6); }
        float rv = smoothstep(aRnd * .6, aRnd * .6 + .4, reveal);
        float h = 1. + aEl * .03 + hl * (.012 + .012 * sin(time * 5. - hd * 60.)) + wave * .035 + (1. - rv) * .25;
        vec4 mv = modelViewMatrix * vec4(n * h, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(size * pr * (1. + hl * .7 + wave * 1.1 + aLi * .3) * pow(3.3 / -mv.z, .72), 40. * pr);
        vec3 dayC = mix(vec3(.42, .5, .68), vec3(1., .86, .66), clamp(aEl * 1.7, 0., 1.));
        dayC = mix(dayC, vec3(.45, .9, 1.), aCoast * .6);
        vec3 nightC = vec3(.13, .1, .3) + vec3(.1, .3, .45) * aCoast * .7;
        vec3 lights = mix(vec3(1., .42, .18), vec3(1., .86, .55), aLi) * aLi * aLi * 3.2 * (.82 + .18 * sin(time * 1.7 + aRnd * 40.));
        vCol = mix(nightC + lights, dayC * (.5 + .42 * day) + lights * .15, day);
        vCol += vec3(1., .7, .32) * hl * .75 + vec3(.45, .9, 1.) * wave * 1.6;
        vec3 V = normalize(cameraPosition - (modelMatrix * vec4(n, 1.)).xyz);
        vA = smoothstep(-.02, .3, dot(n, V)) * rv;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vCol, smoothstep(.5, .22, d) * vA); }`
  });
  G.land = new THREE.Points(lg, G.landMat); root.add(G.land);

  // ---- halo
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { sunDir: { value: G.sun } },
    vertexShader: 'varying vec3 vNv; varying vec3 vN; void main(){ vNv = normalize(normalMatrix * normal); vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `
      uniform vec3 sunDir; varying vec3 vNv; varying vec3 vN;
      void main(){ float i = pow(clamp(.74 - dot(vNv, vec3(0., 0., 1.)), 0., 1.), 3.4);
        vec3 c = mix(vec3(.3, .36, .95), vec3(.42, .7, 1.), smoothstep(-.4, .5, dot(normalize(vN), normalize(sunDir))));
        gl_FragColor = vec4(c * i * 1.15, 1.); }`
  }));
  G.halo = halo; root.add(halo);

  // ---- orbit rings with travelling packets
  [[1.42, .32, .9, '#7db7ff'], [1.7, -.55, .4, '#9d8cff']].forEach(([r, tilt, spin, col], k) => {
    const ring = new THREE.Group(); ring.rotation.set(tilt, spin, k ? .3 : -.2);
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, .0011, 6, 256), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(.6), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    t.rotation.x = Math.PI / 2; ring.add(t);
    const sats = [];
    for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: new THREE.Color(col).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(.05); ring.add(s); sats.push({ s, a: i / 3 * Math.PI * 2, sp: .12 + k * .05 + i * .01 }); }
    root.add(ring); G.rings.push({ ring, sats, r });
  });

  // ---- stars
  const sp = [], ss = [];
  for (let i = 0; i < 3200; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 180 + Math.random() * 60, s = Math.sqrt(1 - u * u); sp.push(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r); ss.push(Math.pow(Math.random(), 6) * 3 + .6, Math.random()); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const sa = new Float32Array(ss.length / 2), sr = new Float32Array(ss.length / 2); for (let i = 0; i < sa.length; i++) { sa[i] = ss[i * 2]; sr[i] = ss[i * 2 + 1]; }
  sg.setAttribute('aS', new THREE.BufferAttribute(sa, 1)); sg.setAttribute('aR', new THREE.BufferAttribute(sr, 1));
  G.stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, pr: { value: DPR } },
    vertexShader: 'uniform float time, pr; attribute float aS, aR; varying float vB; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aS * pr; vB = .45 + .55 * sin(time * (.6 + aR * 2.) + aR * 50.); vC = mix(vec3(.75, .8, 1.), vec3(1., .82, .7), aR); }',
    fragmentShader: 'varying float vB; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vC * (.5 + vB * .7), smoothstep(.5, 0., d) * (.35 + vB * .5)); }'
  }));
  globeScene.add(G.stars);

  // ---- reticle (hover)
  const ret = new THREE.Group();
  const rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TK.accent).multiplyScalar(1.6), transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  ret.add(new THREE.Mesh(new THREE.RingGeometry(.026, .029, 64), rmat));
  const inner = new THREE.Mesh(new THREE.RingGeometry(.012, .0135, 48, 1, 0, Math.PI * 1.4), rmat); ret.add(inner); ret.userData.inner = inner;
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(.011, .0018), rmat); const a = i * Math.PI / 2; t.position.set(Math.cos(a) * .038, Math.sin(a) * .038, 0); t.rotation.z = a; ret.add(t); }
  ret.visible = false; root.add(ret); G.reticle = ret;

  // ---- residents, connections, demo population
  G.pinRoot = new THREE.Group(); root.add(G.pinRoot);
  RESIDENTS.forEach(r => addPin(r));
  buildArcs();
  buildAmbient();
  G.ready = true;
}
function isWater(lat, lon) {
  if (!G.landGrid) return false;
  const y = Math.floor(90 - lat) * 2, x = Math.floor((lon + 180) * 2);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; if (yy < 0 || yy >= 360) continue; if (G.landGrid[yy * 720 + ((x + dx) % 720 + 720) % 720]) return false; }
  return true;
}
function residentColor(r) {
  const info = residentInfo(r);
  if (info.mine) return TK.accent;
  if (r.preset) return ROOM_PRESETS[r.preset].theme.neonColor;
  if (r.state === 'reno') return TK.text3;
  return '#' + new THREE.Color().setHSL(r.hue || .5, .85, .66).getHexString();
}
function addPin(r, landing) {
  const info = residentInfo(r), col = new THREE.Color(residentColor(r));
  const up = latLonToVec(r.lat, r.lon).normalize();
  const g = new THREE.Group(); g.position.copy(up); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const h = info.mine ? .2 : info.state === 'reno' ? .05 : .1;
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: col.clone().multiplyScalar(info.mine ? 2.2 : 1.6) }, grow: { value: landing ? 0 : 1 } },
    vertexShader: 'varying float vY; uniform float grow; void main(){ vY = uv.y; vec3 p = position; p.y *= grow; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }',
    fragmentShader: 'uniform vec3 col; varying float vY; void main(){ gl_FragColor = vec4(col, pow(1. - vY, 1.6) * .95); }'
  });
  const bg = new THREE.CylinderGeometry(.0028, .0028, h, 8, 1, true); bg.translate(0, h / 2, 0);
  g.add(new THREE.Mesh(bg, beamMat));
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: col.clone().multiplyScalar(info.mine ? 2.6 : 1.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  head.scale.setScalar(info.mine ? .07 : .045); head.position.y = .004; g.add(head);
  const ringMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.012, .0145, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = .002; g.add(ring);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = h * .5; hit.userData.pin = r; g.add(hit);
  G.pinRoot.add(g);
  const pin = { r, g, beamMat, head, ring, ringMat, hit, up, h, phase: Math.random(), label: null };
  G.pins.push(pin);
  return pin;
}
function pinOf(no) { return G.pins.find(p => p.r.no === no); }
function arcCurve(a, b) {
  const ang = a.angleTo(b), lift = .06 + ang * .22, pts = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64; const p = new THREE.Vector3().copy(a).lerp(b, t).normalize(); const s = Math.sin(ang * (1 - t)) / Math.sin(ang), s2 = Math.sin(ang * t) / Math.sin(ang); if (ang > 1e-3) p.copy(a).multiplyScalar(s).addScaledVector(b, s2); p.multiplyScalar(1.004 + lift * Math.sin(Math.PI * t)); pts.push(p); }
  return new THREE.CatmullRomCurve3(pts);
}
function buildArcs() {
  G.arcs.forEach(a => G.pinRoot.remove(a.mesh)); G.arcs = [];
  const seen = new Set(), pairs = [];
  RESIDENTS.forEach(r => (r.friends || []).forEach(no => { const o = RESIDENTS.find(x => x.no === no && !x.real); if (o) pairs.push([r, o, false]); }));
  realArcPairs().forEach(([a, b]) => pairs.push([a, b, true]));
  pairs.forEach(([r, o, real]) => {
    const key = [r.real ? r.key : r.no, o.real ? o.key : o.no].sort().join('-'); if (seen.has(key)) return; seen.add(key);
    const a = latLonToVec(r.lat, r.lon).normalize(), b = latLonToVec(o.lat, o.lon).normalize();
    const mine = !real && (r.preset === 'mine' || o.preset === 'mine');
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, phase: { value: Math.random() }, col: { value: new THREE.Color(real ? TK.heat : mine ? TK.accent : TK.info) }, dim: { value: 1 } },
      vertexShader: 'varying float vT; void main(){ vT = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform float time, phase, dim; uniform vec3 col; varying float vT; void main(){ float d = fract(vT - time * .22 - phase); float pulse = smoothstep(0., .02, d) * smoothstep(.16, .0, d); float base = .12 + .1 * sin(vT * 3.14159); gl_FragColor = vec4(col * (1. + pulse * 2.2), (base + pulse * .95) * dim * smoothstep(0., .04, vT) * smoothstep(1., .96, vT)); }'
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(arcCurve(a, b), 96, mine ? .0024 : .0016, 6, false), mat);
    G.pinRoot.add(mesh); G.arcs.push({ mesh, mat });
  });
}
function buildAmbient() {
  // demo population: faint homes scattered around real cities (演示数据)
  const r = rng(11), pts = [], v = new THREE.Vector3();
  let guard = 0;
  while (pts.length < 2600 * 3 && guard++ < 20000) {
    const c = CITIES[Math.floor(r() * CITIES.length)];
    const lat = c.lat + (r() - .5) * (r() < .7 ? 3 : 10), lon = c.lon + (r() - .5) * (r() < .7 ? 4 : 14);
    if (isWater(lat, lon)) continue;
    latLonToVec(lat, lon, 1.006, v); pts.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  G.ambient = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { pr: { value: DPR }, time: { value: 0 } },
    vertexShader: 'uniform float pr, time; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = min(3.2 * pr * pow(3.3 / -mv.z, .72), 30. * pr); vec3 n = normalize(position); vec3 V = normalize(cameraPosition - (modelMatrix * vec4(position, 1.)).xyz); vA = smoothstep(.0, .3, dot(n, V)) * (.55 + .45 * sin(time * 1.3 + position.x * 90. + position.z * 70.)); }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(1., .72, .38) * 1.6, smoothstep(.5, .0, d) * vA * .7); }'
  }));
  G.pinRoot.add(G.ambient);
}
function updateSun() { const s = sunInfo(); latLonToVec(s.decl, s.lon, 1, G.sun).normalize(); }

/* ---------- globe camera ---------- */
function globeCamDir(out) { return latLonToVec(G.cam.lat, G.cam.lon, 1, out); }
function flyGlobe(lat, lon, dist, dur = 1.6) {
  let dl = lon - G.cam.lon; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
  const from = { lat: G.cam.lat, lon: G.cam.lon, dist: G.cam.dist }, to = { lat: clamp(lat, -72, 72), lon: G.cam.lon + dl, dist };
  G.vel.lat = G.vel.lon = 0; G.idle = 0;
  const id = (G.flyId = (G.flyId || 0) + 1);
  return tween(dur, t => {
    if (G.flyId !== id) return;
    G.cam.lat = from.lat + (to.lat - from.lat) * t; G.cam.lon = from.lon + (to.lon - from.lon) * t;
    const arc = Math.sin(Math.PI * t) * Math.min(.9, Math.abs(dl) / 120 + Math.abs(to.lat - from.lat) / 160) * (from.dist + to.dist) * .25;
    G.cam.dist = from.dist + (to.dist - from.dist) * t + arc;
  }, ease.io);
}
function updateGlobeCamera(dt) {
  if (!G.dragging && !G.flyId_active) {
    G.cam.lon += G.vel.lon * dt; G.cam.lat += G.vel.lat * dt;
    const k = Math.exp(-dt * 3.2); G.vel.lon *= k; G.vel.lat *= k;
  }
  G.idle += dt;
  if (G.idle > 5 && !S.panel && !G.dragging && !S.busy && S.view === 'globe') G.cam.lon += dt * 2.2;
  G.cam.lat = clamp(G.cam.lat, -75, 75);
  latLonToVec(G.cam.lat, G.cam.lon, G.cam.dist, gcam.position);
  gcam.up.set(0, 1, 0); gcam.lookAt(0, 0, 0);
  G.shift += (G.shiftGoal - G.shift) * (1 - Math.exp(-dt * 5));
  const W = innerWidth, H = innerHeight;
  gcam.aspect = W / H;
  const sy = S.view === 'globe' && !S.panel ? (isNarrow() ? -H * .04 : 26) : 0;   // 让地球落在舷窗正中（上窗框比下窗框窄）
  if (Math.abs(G.shift) > .5 || sy) gcam.setViewOffset(W, H, -G.shift, sy, W, H); else if (gcam.view) gcam.clearViewOffset();
  gcam.updateProjectionMatrix();
}
function updateGlobe(dt, T) {
  if (!G.ready) return;
  updateGlobeCamera(dt);
  G.oceanMat.uniforms.time.value = T; G.landMat.uniforms.time.value = T;
  G.hoverAmt += ((G.hover ? 1 : 0) - G.hoverAmt) * (1 - Math.exp(-dt * 8));
  G.oceanMat.uniforms.hoverAmt.value = G.hoverAmt; G.landMat.uniforms.hoverAmt.value = G.hoverAmt;
  if (G.clickT >= 0) { G.clickT += dt; if (G.clickT > 2.2) G.clickT = -1; G.landMat.uniforms.clickT.value = G.clickT; }
  G.rings.forEach(({ ring, sats, r }) => { ring.rotation.y += dt * .02; sats.forEach(s => { s.a += dt * s.sp; s.s.position.set(Math.cos(s.a) * r, 0, Math.sin(s.a) * r); }); });
  G.stars.material.uniforms.time.value = T;
  if (G.ambient) G.ambient.material.uniforms.time.value = T;
  for (const p of G.pins) {
    const f = (T * .55 + p.phase) % 1;
    const k = p.dim ? .22 : 1;
    p.ring.scale.setScalar(1 + f * (p.themed ? 4.2 : 2.6)); p.ringMat.opacity = (1 - f) * .9 * k;
    p.head.material.opacity = (.85 + Math.sin(T * 3 + p.phase * 9) * .15) * k;
  }
  G.arcs.forEach(a => { a.mat.uniforms.time.value = T; });
  if (G.reticle.visible) { G.reticle.rotation.z += dt * .6; G.reticle.userData.inner.rotation.z -= dt * 2.4; }
  if (G.marker) { G.marker.userData.t += dt; const f = (G.marker.userData.t * .8) % 1; G.marker.userData.ring.scale.setScalar(1 + f * 3); G.marker.userData.ring.material.opacity = 1 - f; }
}
function placeReticle(dir) {
  const r = G.reticle; r.visible = true;
  r.position.copy(dir).multiplyScalar(1.012);
  r.lookAt(dir.clone().multiplyScalar(2));
}
function dropMarker(lat, lon, color = TK.accent) {
  clearMarker();
  const up = latLonToVec(lat, lon).normalize(), g = new THREE.Group();
  g.position.copy(up); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const c = new THREE.Color(color).multiplyScalar(2);
  const bg = new THREE.CylinderGeometry(.003, .003, .16, 8, 1, true); bg.translate(0, .08, 0);
  g.add(new THREE.Mesh(bg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { col: { value: c } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform vec3 col; varying float vY; void main(){ gl_FragColor = vec4(col, (1. - vY) * .9); }' })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.014, .017, 48), new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .003; g.add(ring);
  g.userData = { t: 0, ring };
  G.root.add(g); G.marker = g;
}
function clearMarker() { if (G.marker) { G.root.remove(G.marker); G.marker = null; } }
function ripple(dir) { G.clickDir.copy(dir).normalize(); G.clickT = 0; }

