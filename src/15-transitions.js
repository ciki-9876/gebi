/* ============================================================
   Transitions: dive into a room, step back out to the planet
   ============================================================ */
function setChromeView(v) { document.body.dataset.view = v; }
async function diveInto(r, opts = {}) {
  if (S.busy) return; S.busy = true;
  closePanel(true); stopMove(); clearMarker(); G.hover = null; G.reticle.visible = false; ghud.hidden = true;
  document.body.classList.add('leaving');
  G.shiftGoal = 0;
  await flyGlobe(r.lat, r.lon, 1.95, 1.1);
  ripple(latLonToVec(r.lat, r.lon));
  await tween(1.15, t => { G.cam.dist = 1.95 - .93 * t; setWarp(t * .95); setFade(clamp((t - .62) / .38, 0, 1), '#07060b'); }, ease.in);
  const room = roomForResident(r);
  S.resident = r;
  await arriveInRoom(room, opts);
}
async function arriveInRoom(room, opts = {}) {
  S.view = 'room'; S.mode = 'visit'; S.room = room; S.hover = null; S.selected = null; S.focus = null;
  setChromeView('room'); document.body.classList.remove('leaving');
  usePostFor('room');
  CAM.mode = 'fp'; camera.fov = 66; camera.updateProjectionMatrix();
  buildRoom(room);
  const d = doorDef(), u = d ? d.u : -1;
  FP.pos.set(u, 0, 5.6); FP.yaw = FP.yawGoal = 0; FP.pitch = FP.pitchGoal = -.03; FP.vel.set(0, 0, 0);
  if (S.dyn.door) S.dyn.door.goal = 1;
  fpUpdate(0);
  syncChrome(); refreshHotspots();
  setWarp(0);
  tween(.9, t => setFade(1 - t), ease.out);
  await fpGo(new THREE.Vector3(u, 0, 2.75), 0, -.06, 1.9);
  if (S.dyn.door) S.dyn.door.goal = 0;
  S.busy = false;
  const rk = roomKey(room);
  if (rk) { recordVisit(rk, null, S.via || 'globe'); if (iOwnRoom(rk)) { const u = myUpdates(); if (u.count && !opts.msg) setTimeout(() => toast(updatesSentence(u) + ' 点右上角“动态”查看', 5200), 1200); } }
  S.via = null;
  if (opts.build) setMode('build').then(() => { if (opts.pickPending) { const p = pendingWorks()[0]; if (p) setTimeout(() => selectItem(p), 300); } });
  if (opts.msg) toast(opts.msg, 4600);
  showControlsHint();
  if (room.agent && !opts.build) setTimeout(() => { if (S.view === 'room' && S.mode === 'visit' && !S.panel && !S.busy) bubble.hidden = false; }, 900);
}
async function exitToGlobe() {
  if (S.busy || S.view !== 'room') return; S.busy = true;
  tip.hidden = true; bubble.hidden = true; closePanel(true); closeAllWins();
  if (FP.locked && document.exitPointerLock) document.exitPointerLock();
  if (S.mode === 'build') { S.mode = 'visit'; await exitBuildCam(); S.grid.visible = false; syncChrome(); }
  if (music.on) toggleMusic();
  const d = doorDef(), u = d ? d.u : -1;
  await fpGo(new THREE.Vector3(u, 0, 2.9), Math.PI, 0, 1.0);
  if (S.dyn.door) S.dyn.door.goal = 1;
  await sleep(380);
  const walk = fpGo(new THREE.Vector3(u, 0, 5.9), Math.PI, .02, 1.35);
  await tween(1.25, t => { setFade(clamp((t - .35) / .65, 0, 1), '#07060b'); setWarp(t * .35); }, ease.in);
  await walk;
  const r = S.resident || RESIDENTS[0];
  S.view = 'globe'; setChromeView('globe'); usePostFor('globe');
  if (S.roomRoot) { scene.remove(S.roomRoot); S.roomRoot = null; }
  S.room = null; S.hotspots = []; hsWrap.innerHTML = ''; renderGuide();
  G.flyId = (G.flyId || 0) + 1;
  G.cam.lat = r.lat; G.cam.lon = r.lon; G.cam.dist = 1.04; G.vel.lat = G.vel.lon = 0; G.shiftGoal = G.shift = homeShift();
  syncChrome();
  setWarp(.55);
  tween(.8, t => setFade(1 - t), ease.out);
  await tween(2.2, t => { G.cam.dist = 1.04 + (HOME_DIST - 1.04) * t; setWarp(.55 * (1 - t)); }, ease.outQuint);
  setWarp(0);
  S.busy = false; G.idle = 0;
}
const goStreet = exitToGlobe;
function homeShift() { return isNarrow() ? 0 : innerWidth * .05; }
const HOME_DIST = isNarrow() ? 6.4 : 5.6;   // 舷窗里的地球整颗可见

/* room helpers shown in the HUD */
const guideEl = $('#guide');
function renderGuide() {
  if (S.view !== 'room' || S.mode !== 'visit' || !S.roomRoot) { guideEl.hidden = true; return; }
  const items = [];
  S.roomRoot.traverse(o => { if (o.userData && o.userData.iid && entryOf(o) && o.userData.iid !== 'window') items.push(o); });
  const order = { agent: 0, shiguang: 1, game: 2, guestbook: 3, music: 4, door: 9 };
  items.sort((a, b) => (order[entryOf(a).kind] ?? 5) - (order[entryOf(b).kind] ?? 5));
  const win = findGroup('window');
  guideEl.innerHTML = `<span class="g-lbl">导览</span>` + items.map(o => `<button type="button" data-iid="${esc(o.userData.iid)}">${esc(entryOf(o).kind === 'door' ? '出门' : entryOf(o).title || nameOf(o))}</button>`).join('') + (win ? `<button type="button" data-iid="window">窗外</button>` : '');
  guideEl.hidden = false;
}
guideEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || S.busy) return; const g = findGroup(b.dataset.iid); if (g) activate(g); });
function lookOutside(g) {
  walkTo(g, { panel: false }).then(() => {
    const s = S.dyn.sky || localSky(31.2, 121.5, 8);
    toast(`窗外是${S.room.city || '这座城市'} · 当地 ${s.time} · ${s.label}${s.phase === 'night' ? '，楼里还亮着不少灯' : s.phase === 'golden' ? '，太阳快落到楼后面了' : ''}`, 4200);
  });
}
let hintT = 0;
function showControlsHint() {
  const h = $('#ctlHint'); h.hidden = false; h.classList.add('show');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('show'), 7000);
}

