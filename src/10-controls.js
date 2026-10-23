/* ============================================================
   First-person controller + dollhouse camera for building
   ============================================================ */
const FP = { pos: new THREE.Vector3(-1, 0, 2.9), yaw: 0, pitch: -.05, yawGoal: 0, pitchGoal: -.05, vel: new THREE.Vector3(), eye: 2.0, bobT: 0, bobAmp: 0, keys: new Set(), joy: { x: 0, y: 0 }, auto: null, locked: false };
const CAM = { mode: 'fp', fov: 66, orb: { th: .62, ph: .92, r: 16.5 }, tween: null };
const PR = .3;
function blocked(p, R = PR) { return S.colliders.some(c => p.x > c.x0 - R && p.x < c.x1 + R && p.z > c.z0 - R && p.z < c.z1 + R); }
function collide(p) {
  for (const c of S.colliders) {
    const x0 = c.x0 - PR, x1 = c.x1 + PR, z0 = c.z0 - PR, z1 = c.z1 + PR;
    if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
      const dl = p.x - x0, dr = x1 - p.x, dn = p.z - z0, df = z1 - p.z, m = Math.min(dl, dr, dn, df);
      if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === dn) p.z = z0; else p.z = z1;
    }
  }
  p.x = clamp(p.x, -5 + PR + .05, 5 - PR - .05); p.z = clamp(p.z, -4 + PR + .05, 4 - PR - .05);
}
function angleLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function anglesTo(pos, look) { const dx = look.x - pos.x, dz = look.z - pos.z; return { yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(look.y - FP.eye, Math.hypot(dx, dz)), -1.05, .9) }; }
function fpGo(pos, yaw, pitch, dur) {
  return new Promise(res => {
    if (FP.auto && FP.auto.res) FP.auto.res();
    FP.auto = { from: { x: FP.pos.x, z: FP.pos.z, yaw: FP.yaw, pitch: FP.pitch }, to: { x: pos.x, z: pos.z, yaw, pitch }, t: 0, t0: performance.now(), dur: reduceMotion ? .2 : Math.max(.2, dur), res };
  });
}
function panelYawOffset() {
  if (isNarrow()) return 0;
  const pw = S.win && S.win.size === 'tall' ? 456 : (S.panel ? 416 : 0); if (!pw) return 0;
  return Math.atan((pw / innerWidth) * Math.tan(camera.fov / 2 * D2R) * camera.aspect);
}
function viewFor(g) {
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const def = g.userData.isChild ? g.userData.parentDef : (g.userData.def || {});
  const wn = { back: [0, 1], left: [1, 0], right: [-1, 0], front: [0, -1] }[def.wall];
  let n;
  if (wn) n = new THREE.Vector3(wn[0], 0, wn[1]);
  else { n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())); n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1); n.normalize(); }
  if (g.userData.iid === 'window') c.y = 2.2;
  let d = clamp(Math.max(size.x, size.y * .85, size.z) * 1.05 + .75, 1.45, 3.4);
  const p = new THREE.Vector3();
  for (let tries = 0; tries < 3; tries++) {
    const nn = n.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), [0, .45, -.45][tries]);
    let dd = d;
    for (let i = 0; i < 12; i++) { p.copy(c).addScaledVector(nn, dd); p.y = 0; p.x = clamp(p.x, -4.55, 4.55); p.z = clamp(p.z, -3.55, 3.55); if (!blocked(p)) return { pos: p, look: c }; dd += .25; }
  }
  return { pos: p, look: c };
}
function walkTo(g, opts = {}) {
  if (!g || S.view !== 'room' || CAM.mode !== 'fp') return Promise.resolve();
  const v = viewFor(g), a = anglesTo(v.pos, v.look);
  const yaw = a.yaw - (opts.panel === false ? 0 : panelYawOffset());
  const dist = Math.hypot(v.pos.x - FP.pos.x, v.pos.z - FP.pos.z);
  return fpGo(v.pos, yaw, a.pitch, clamp(.55 + dist / 3.4, .6, 2.2));
}
function focusOn(g, opts = {}) { if (S.view === 'room' && S.mode !== 'build') walkTo(g, { panel: opts.panel !== false }); }
function setView() { /* camera framing is handled by the first-person controller */ }
function fpUpdate(dt) {
  if (FP.auto) {
    const A = FP.auto; A.t = Math.min(1, (performance.now() - A.t0) / 1000 / A.dur); const e = ease.io(A.t);
    FP.pos.x = A.from.x + (A.to.x - A.from.x) * e; FP.pos.z = A.from.z + (A.to.z - A.from.z) * e;
    FP.yaw = angleLerp(A.from.yaw, A.to.yaw, e); FP.pitch = A.from.pitch + (A.to.pitch - A.from.pitch) * e;
    FP.bobT += dt * 6 * Math.sin(Math.PI * A.t); FP.bobAmp = Math.sin(Math.PI * A.t) * .6;
    FP.yawGoal = FP.yaw; FP.pitchGoal = FP.pitch;
    if (A.t >= 1) { FP.auto = null; A.res(); }
  } else {
    const k = FP.keys; let ix = 0, iz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) iz += 1; if (k.has('KeyS') || k.has('ArrowDown')) iz -= 1;
    if (k.has('KeyA')) ix -= 1; if (k.has('KeyD')) ix += 1;
    if (k.has('ArrowLeft')) FP.yawGoal += dt * 1.9; if (k.has('ArrowRight')) FP.yawGoal -= dt * 1.9;
    ix += FP.joy.x; iz += FP.joy.y;
    const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
    const sp = 2.8 * (k.has('ShiftLeft') || k.has('ShiftRight') ? 1.7 : 1);
    const fx = -Math.sin(FP.yaw), fz = -Math.cos(FP.yaw), rx = Math.cos(FP.yaw), rz = -Math.sin(FP.yaw);
    const a = 1 - Math.exp(-dt * 9);
    FP.vel.x += ((fx * iz + rx * ix) * sp - FP.vel.x) * a; FP.vel.z += ((fz * iz + rz * ix) * sp - FP.vel.z) * a;
    FP.pos.x += FP.vel.x * dt; FP.pos.z += FP.vel.z * dt;
    collide(FP.pos);
    const speed = Math.hypot(FP.vel.x, FP.vel.z);
    FP.bobAmp += (clamp(speed / 2.8, 0, 1) - FP.bobAmp) * a; FP.bobT += dt * speed * 2.6;
    const lk = 1 - Math.exp(-dt * (FP.locked ? 40 : 16));
    FP.pitchGoal = clamp(FP.pitchGoal, -1.15, 1.0);
    FP.yaw += (FP.yawGoal - FP.yaw) * lk; FP.pitch += (FP.pitchGoal - FP.pitch) * lk;
  }
  const bob = Math.sin(FP.bobT * 2) * .03 * FP.bobAmp;
  camera.position.set(FP.pos.x, FP.eye + bob, FP.pos.z);
  camera.rotation.set(FP.pitch, FP.yaw, Math.sin(FP.bobT) * .003 * FP.bobAmp);
}
function orbitPose(out) {
  const o = CAM.orb, cp = Math.cos(o.ph);
  out.pos = new THREE.Vector3(Math.sin(o.th) * cp * o.r, .6 + Math.sin(o.ph) * o.r, Math.cos(o.th) * cp * o.r);
  const m = new THREE.Matrix4().lookAt(out.pos, new THREE.Vector3(0, .6, 0), new THREE.Vector3(0, 1, 0));
  out.quat = new THREE.Quaternion().setFromRotationMatrix(m);
  return out;
}
function camTween(toPose, toFov, dur) {
  const fromPos = camera.position.clone(), fromQ = camera.quaternion.clone(), fromFov = camera.fov;
  CAM.mode = 'tween';
  return tween(dur, t => {
    const to = typeof toPose === 'function' ? toPose() : toPose;
    camera.position.lerpVectors(fromPos, to.pos, t); camera.quaternion.copy(fromQ).slerp(to.quat, t);
    camera.fov = fromFov + (toFov - fromFov) * t; camera.updateProjectionMatrix();
  }, ease.io);
}
async function enterBuildCam() {
  if (CAM.mode !== 'fp') return;
  FP.auto = null; if (FP.locked) document.exitPointerLock && document.exitPointerLock();
  S.ceiling.visible = false;
  await camTween(orbitPose({}), 42, 1.25);
  CAM.mode = 'orbit';
}
async function exitBuildCam() {
  if (CAM.mode !== 'orbit') return;
  const fpPose = () => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(FP.pitch, FP.yaw, 0, 'YXZ')); return { pos: new THREE.Vector3(FP.pos.x, FP.eye, FP.pos.z), quat: q }; };
  await camTween(fpPose, 66, 1.1);
  showAllWalls(); S.ceiling.visible = true;
  camera.rotation.order = 'YXZ'; CAM.mode = 'fp';
}
function showAllWalls() { if (!S.wallGroups) return; Object.values(S.wallGroups).forEach(g => { g.visible = true; }); S.itemGroups.forEach(g => { g.visible = true; }); }
function orbitUpdate(dt) {
  const o = orbitPose({});
  camera.position.lerp(o.pos, 1 - Math.exp(-dt * 10)); camera.lookAt(0, .6, 0);
  const cp = camera.position, hide = { back: cp.z < -4, front: cp.z > 4, left: cp.x < -5, right: cp.x > 5 };
  Object.entries(S.wallGroups).forEach(([k, g]) => { g.visible = !hide[k]; });
  S.itemGroups.forEach(g => { const w = g.userData.def && g.userData.def.wall; g.visible = !(w && hide[w]); });
}
function updateRoomCamera(dt) {
  if (CAM.mode === 'fp') fpUpdate(dt);
  else if (CAM.mode === 'orbit') orbitUpdate(dt);
  if (CAM.mode === 'tween' && S.wallGroups) {
    const cp = camera.position, hide = { back: cp.z < -4, front: cp.z > 4, left: cp.x < -5, right: cp.x > 5 };
    Object.entries(S.wallGroups).forEach(([k, g]) => { g.visible = !hide[k]; });
  }
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}

