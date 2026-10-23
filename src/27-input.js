/* ============================================================
   Input
   ============================================================ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function setNdc(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); }
function pickRoom(cx, cy) {
  if (!S.roomRoot) return null;
  setNdc(cx, cy); raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(S.roomRoot, true);
  for (const h of hits) {
    if (h.object === S.grid || h.object === S.selRing || !h.object.visible) continue;
    let o = h.object, vis = true; while (o) { if (!o.visible) vis = false; o = o.parent; } if (!vis) continue;
    o = h.object; while (o && !(o.userData && o.userData.iid)) o = o.parent;
    if (o) return { g: o, point: h.point, dist: h.distance };
    if (h.object.userData.floor || Math.abs(h.point.y) < .02) return { g: null, floor: true, point: h.point, dist: h.distance };
    return null;
  }
  return null;
}
function pickGlobe(cx, cy) {
  setNdc(cx, cy); raycaster.setFromCamera(ndc, gcam);
  const eh = raycaster.intersectObject(G.ocean, false), ed = eh.length ? eh[0].distance : 1e9;
  const ph = raycaster.intersectObjects(G.pins.map(p => p.hit), false);
  if (ph.length && ph[0].distance < ed + .03) return { pin: G.pins.find(p => p.hit === ph[0].object) };
  if (eh.length) return { point: eh[0].point };
  return null;
}
let walkRing = null;
function clickWalk(point) {
  const p = new THREE.Vector3(clamp(point.x, -4.5, 4.5), 0, clamp(point.z, -3.5, 3.5));
  const from = FP.pos.clone();
  for (let i = 0; i < 20 && blocked(p); i++) p.lerp(from, .15);
  if (p.distanceTo(from) < .4) return;
  if (!walkRing) { walkRing = new THREE.Mesh(new THREE.RingGeometry(.16, .2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(TK.accent).multiplyScalar(1.8), transparent: true, side: THREE.DoubleSide, depthWrite: false })); walkRing.rotation.x = -Math.PI / 2; }
  S.roomRoot.add(walkRing); walkRing.position.set(p.x, .02, p.z); walkRing.userData.t = 0;
  fpGo(p, FP.yaw, FP.pitch, clamp(.4 + p.distanceTo(from) / 3.2, .5, 2));
}
const pointers = new Map();
let drag = null, downAt = null, pinch0 = 0, pinchV = 0;
canvas.addEventListener('pointerdown', e => {
  if (S.busy) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchV = S.view === 'globe' ? G.cam.dist : CAM.orb.r; drag = null; downAt = null; return; }
  downAt = { x: e.clientX, y: e.clientY, moved: false };
  if (S.view === 'globe') { drag = { type: 'globe', lx: e.clientX, ly: e.clientY, lt: performance.now() }; return; }
  if (FP.locked) { const h = pickRoom(innerWidth / 2, innerHeight / 2); if (h && h.g && entryOf(h.g)) activate(h.g); drag = null; downAt = null; return; }
  drag = { type: CAM.mode === 'orbit' ? 'orbit' : 'look', lx: e.clientX, ly: e.clientY };
  if (S.mode === 'build' && CAM.mode === 'orbit') {
    const h = pickRoom(e.clientX, e.clientY);
    if (h && h.g && h.g.userData.def && !h.g.userData.def.wall && !h.g.userData.isChild && (h.g.userData.def.type !== 'rug' || S.selected === h.g)) {
      const p = new THREE.Vector3(); raycaster.ray.intersectPlane(floorPlane, p);
      const def = h.g.userData.def;
      drag = { type: 'item', g: h.g, ox: def.x - p.x, oz: def.z - p.z };
      if (S.selected !== h.g) selectItem(h.g);
    }
  }
});
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinch0) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (S.view === 'globe') { G.flyId++; G.cam.dist = clamp(pinchV * pinch0 / d, 1.25, 7.5); } else if (CAM.mode === 'orbit') CAM.orb.r = clamp(pinchV * pinch0 / d, 8, 26);
    return;
  }
  if (drag && downAt) {
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    if (!downAt.moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) { downAt.moved = true; tip.hidden = true; ghud.hidden = true; canvas.classList.add('dragging'); }
    if (downAt.moved) {
      if (drag.type === 'globe') {
        const k = .075 * (G.cam.dist - 1) + .008, now = performance.now(), dt = Math.max(1, now - drag.lt) / 1000;
        G.flyId++; G.cam.lon -= dx * k; G.cam.lat += dy * k; G.vel.lon = -dx * k / dt * .5; G.vel.lat = dy * k / dt * .5; G.idle = 0; G.dragging = true; drag.lt = now;
      } else if (drag.type === 'look') { FP.yawGoal += dx * .0042; FP.pitchGoal += dy * .0034; if (FP.auto) { FP.auto.res(); FP.auto = null; } }
      else if (drag.type === 'orbit') { CAM.orb.th -= dx * .006; CAM.orb.ph = clamp(CAM.orb.ph + dy * .004, .38, 1.38); }
      else if (drag.type === 'item') {
        setNdc(e.clientX, e.clientY); raycaster.setFromCamera(ndc, camera);
        const p = new THREE.Vector3(); if (raycaster.ray.intersectPlane(floorPlane, p)) {
          const def = drag.g.userData.def; def.x = Math.round((p.x + drag.ox) * 4) / 4; def.z = Math.round((p.z + drag.oz) * 4) / 4; clampDef(def);
          positionItem(drag.g, def); S.selRing.position.set(def.x, .02, def.z);
        }
      }
      drag.lx = e.clientX; drag.ly = e.clientY;
    }
    return;
  }
  if (e.pointerType === 'touch') return;
  hoverAt(e.clientX, e.clientY);
});
function hoverAt(x, y) {
  if (S.busy) { tip.hidden = true; return; }
  if (S.view === 'globe') {
    if (!G.ready) return;
    const h = pickGlobe(x, y);
    G.hoverPin = h && h.pin ? h.pin : null;
    if (h && h.point) {
      const dir = h.point.clone().normalize(); G.hover = dir; G.hoverDir.copy(dir); placeReticle(dir);
      const ll = vecToLatLon(dir), water = isWater(ll.lat, ll.lon), place = describePlace(ll.lat, ll.lon, water);
      ghud.innerHTML = `<b>${esc(place.title)}</b><span>${fmtCoord(ll.lat, ll.lon)}</span><em>${water ? '海上 · 盖不了房子' : G.moving ? '点击把房间搬到这里' : '点击在这里入住 · 只公开到城市'}</em>`;
      ghud.hidden = false; ghud.style.transform = `translate(${clamp(x + 18, 8, innerWidth - 240)}px, ${clamp(y + 18, 8, innerHeight - 90)}px)`;
      canvas.classList.toggle('pointer', !water);
    } else { G.hover = null; G.reticle.visible = false; ghud.hidden = true; canvas.classList.toggle('pointer', !!G.hoverPin); }
    if (G.hoverPin) { G.reticle.visible = false; ghud.hidden = true; canvas.classList.add('pointer'); }
    return;
  }
  if (FP.locked) return;
  const h = pickRoom(x, y);
  const g = h && h.g;
  if (g && S.mode === 'visit' && !entryOf(g)) { canvas.classList.remove('pointer'); S.hover = null; showTip(g, x, y); return; }
  S.hover = g || null; canvas.classList.toggle('pointer', !!g || (h && h.floor && S.mode === 'visit'));
  if (g) showTip(g, x, y); else tip.hidden = true;
}
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
  canvas.classList.remove('dragging');
  G.dragging = false;
  if (!drag || !downAt) { drag = null; return; }
  const moved = downAt.moved, d = drag; drag = null;
  if (d.type === 'item' && moved) { saveLayout(); if (S.selected) renderInspector(S.selected); downAt = null; return; }
  if (!moved && e.type === 'pointerup') {
    if (S.view === 'globe') {
      const h = pickGlobe(e.clientX, e.clientY);
      if (h && h.pin) openResident(h.pin.r);
      else if (h && h.point) { const ll = vecToLatLon(h.point); openAddress(ll.lat, ll.lon); }
      else if (S.panel) closePanel();
    } else if (S.mode === 'build') { const h = pickRoom(e.clientX, e.clientY); if (h && h.g) selectItem(h.g); else closePanel(); }
    else {
      const h = pickRoom(e.clientX, e.clientY);
      if (h && h.g && entryOf(h.g)) activate(h.g);
      else if (h && h.floor) { if (S.panel && !isNarrow()) closePanel(); clickWalk(h.point); }
      else if (S.panel) closePanel();
    }
  }
  downAt = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!drag) { S.hover = null; tip.hidden = true; if (S.view === 'globe') { G.hover = null; G.reticle && (G.reticle.visible = false); ghud.hidden = true; } } });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (S.view === 'globe') { G.flyId++; G.cam.dist = clamp(G.cam.dist * Math.exp(e.deltaY * .0011), 1.25, 7.5); G.idle = 0; }
  else if (CAM.mode === 'orbit') CAM.orb.r = clamp(CAM.orb.r * Math.exp(e.deltaY * .001), 8, 26);
  else if (CAM.mode === 'fp' && !FP.auto) { const s = clamp(-e.deltaY * .004, -.6, .6); FP.pos.x += -Math.sin(FP.yaw) * s; FP.pos.z += -Math.cos(FP.yaw) * s; collide(FP.pos); }
}, { passive: false });
/* pointer lock "mouse look" */
function toggleLock() {
  if (S.view !== 'room' || S.mode !== 'visit') return;
  if (FP.locked) { document.exitPointerLock && document.exitPointerLock(); return; }
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => toast('这个环境不支持锁定鼠标，按住拖动也能环顾')); } catch (e) { toast('这个环境不支持锁定鼠标，按住拖动也能环顾'); }
}
$('#lockBtn').addEventListener('click', toggleLock);
document.addEventListener('pointerlockchange', () => {
  FP.locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('locked', FP.locked);
  if (FP.locked) { closePanel(); tip.hidden = true; } else $('#xprompt').hidden = true;
});
document.addEventListener('mousemove', e => { if (!FP.locked || S.busy) return; FP.yawGoal -= e.movementX * .0023; FP.pitchGoal -= e.movementY * .0023; });
function crosshairPick() {
  const h = pickRoom(innerWidth / 2, innerHeight / 2), g = h && h.g && entryOf(h.g) ? h.g : null;
  S.hover = g;
  const xp = $('#xprompt');
  if (g) { xp.hidden = false; xp.innerHTML = `<kbd>E</kbd> 或点击 · ${esc(entryOf(g).title || nameOf(g))}`; } else xp.hidden = true;
}
/* touch joystick */
(() => {
  const joy = $('#joy'), knob = joy.querySelector('i'); let id = null, cx = 0, cy = 0;
  joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(id); const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; });
  joy.addEventListener('pointermove', e => { if (e.pointerId !== id) return; const dx = clamp((e.clientX - cx) / 42, -1, 1), dy = clamp((e.clientY - cy) / 42, -1, 1); FP.joy.x = dx; FP.joy.y = -dy; knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`; });
  const end = e => { if (e.pointerId !== id) return; id = null; FP.joy.x = FP.joy.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
})();
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
addEventListener('keydown', e => {
  if (!deck.hidden) { if (e.key === 'Escape') { deck.hidden = true; } return; }
  const typing = /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
  if (S.panel && S.panel.kind === 'game' && !typing) {
    const map = { ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 } };
    if (map[e.code]) { e.preventDefault(); gInput(map[e.code]); return; }
    if (e.code === 'Space') { e.preventDefault(); gReset(); game.mode = 'ready'; updateGameHud(); return; }
  }
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); if (S.win) { minimizeWin(S.win); return; } if (G.moving) { stopMove(); clearMarker(); } closePanel(); return; }
  if (typing) return;
  if (S.view === 'room' && S.mode === 'visit' && !S.busy) {
    if (MOVE_KEYS.has(e.code)) { if (e.code.startsWith('Arrow')) e.preventDefault(); FP.keys.add(e.code); if (FP.auto && !e.code.startsWith('Shift')) { FP.auto.res(); FP.auto = null; } return; }
    if (e.code === 'KeyE') { const g = S.hover; if (g && entryOf(g)) activate(g); return; }
    if (e.code === 'KeyF') { toggleLock(); return; }
  }
  if (S.mode === 'build' && S.selected) {
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  }
});
addEventListener('keyup', e => { FP.keys.delete(e.code); });
addEventListener('blur', () => FP.keys.clear());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) composer.setSize(innerWidth, innerHeight);
  if (gradePass) gradePass.uniforms.uRes.value.set(innerWidth, innerHeight);
  if (S.view === 'globe' && !S.panel) G.shiftGoal = homeShift();
  syncChrome();
});
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { drawNote(); drawChalk(); drawCode(codeOff); });

