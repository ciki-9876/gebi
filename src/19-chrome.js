/* ============================================================
   Modes, navigation, chrome
   ============================================================ */
const modesEl = $('#modes'), thumb = $('#modeThumb');
function syncChrome() {
  modesEl.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.mode === S.mode);
    if (b.dataset.mode === 'build') b.setAttribute('aria-disabled', !(S.room && S.room.mine) ? 'true' : 'false');
  });
  const on = modesEl.querySelector('[aria-pressed="true"]');
  if (on) { thumb.style.left = on.offsetLeft + 'px'; thumb.style.width = on.offsetWidth + 'px'; }
  if (S.view === 'globe') {
    syncPocketBtn();
    $('#plateNo').textContent = RESIDENTS.length;
    $('#plateName').textContent = '地球 · 隔壁社区';
    $('#plateSub').textContent = `${RESIDENTS.length} 户已入住 · 实时昼夜`;
    $('#stats').hidden = true;
    const mr = CLOUD.ready ? myResident() : RESIDENTS.find(r => r.preset === 'mine');
    $('#goMine').innerHTML = mr ? `<b>回到我的房间</b><small>${esc(mr.city || '')} · ${esc(mr.no)}</small>` : `<b>去 302 串门</b><small>零点电竞酒吧 · 上海</small>`;
    syncHomeLcd(mr);
    $('#roleNote').hidden = !(CLOUD.ready && !canPost());
    if (CLOUD.ready && !canPost()) $('#roleNote').innerHTML = VIEWER_NOTE;
    syncThemeBtn();
  } else if (S.room) {
    const sky = S.dyn && S.dyn.sky;
    $('#plateNo').textContent = S.room.no; $('#plateName').textContent = S.room.name;
    $('#plateSub').textContent = `${S.room.city || ''} · 房主 ${S.room.owner}${sky ? ` · 当地 ${sky.time}` : ''}${themeTag()}`;
    $('#stats').hidden = S.mode === 'build';
    const r = rng(hash(S.room.id)); const base = 60 + Math.floor(r() * 300), likes = 80 + Math.floor(r() * 400);
    const liked = !!S.liked[S.room.id];
    $('#stVisit').textContent = base; $('#stLike').textContent = likes + (liked ? 1 : 0);
    $('#likeBtn').setAttribute('aria-pressed', liked);
  }
  const rk = S.view === 'room' ? roomKey(S.room) : null, ups = myUpdates();
  $('#bell').hidden = !(CLOUD.ready && (myRoomKey() || ups.replies.length || roomMessages && CLOUD.msgs.has(CLOUD.me.id)));
  $('#bellBadge').hidden = !ups.count; $('#bellBadge').textContent = ups.count > 99 ? '99+' : ups.count;
  $('#guestsBtn').hidden = !(S.view === 'room' && iOwnRoom(rk));
  $('#pubBtn').hidden = !(S.view === 'room' && S.room && S.room.mine);
  if (S.view === 'room' && CLOUD.ready && rk) { $('#stVisit').textContent = roomVisitors(rk).length; $('#stLike').parentElement.hidden = true; $('#stDemo').hidden = true; $('#stVisitLbl').textContent = '来过的人'; }
  else { $('#stLike').parentElement.hidden = false; $('#stDemo').hidden = false; $('#stVisitLbl').textContent = '今日访客'; }
  $('#buildbar').hidden = !(S.mode === 'build' && S.view === 'room');
  const touch = matchMedia('(pointer: coarse)').matches;
  $('#ctlHint').hidden = !(S.view === 'room' && S.mode === 'visit') || touch;   // 触屏上没有键盘，不显示 WASD / F
  $('#joy').hidden = !(S.view === 'room' && S.mode === 'visit' && touch);
  $('#bbHint').textContent = touch ? '点一件放进房间 · 按住拖动挪位置 · 选中后可旋转、删除、绑定作品' : '点一件放进房间 · 拖动挪位置 · R 旋转 · Delete 删除 · 任何物件都能绑定作品';
  const cb = $('#cardBtn'); if (cb) { cb.hidden = !(S.view === 'room' && S.room && S.mode === 'visit'); cb.querySelector('span').textContent = S.room && S.room.mine ? '我的名片' : '关于房主'; }
  if (S.mode === 'build') renderPendingRow();
  renderGuide();
  syncDock();
}
function syncDock() { /* the stats dock sits under the top bar, nothing to shift */ }
async function setMode(m) {
  if (m === 'globe') return exitToGlobe();
  if (S.view !== 'room' || (S.busy && !S.room)) return;
  if (m === 'build' && !(S.room && S.room.mine)) { toast(`这是 ${S.room.owner} 的房间，只有房主能动手布置`); return; }
  if (S.mode === m || CAM.mode === 'tween') return;
  closePanel(true); closeAllWins(); bubble.hidden = true; tip.hidden = true;
  S.mode = m; S.hover = null; S.selected = null;
  if (S.selRing) S.selRing.visible = false;
  syncChrome(); refreshHotspots();
  if (m === 'build') {
    if (S.grid) S.grid.visible = true;
    renderCatalog();
    await enterBuildCam();
    toast('装修模式：从物件库添加，拖动摆放，选中后绑定作品');
  } else {
    if (S.grid) S.grid.visible = false;
    rebuildColliders(); collide(FP.pos);
    await exitBuildCam();
    refreshHotspots();
  }
}
modesEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('#pClose').addEventListener('click', () => closePanel());
$('#doneBuild').addEventListener('click', () => setMode('visit'));
$('#resetRoom').addEventListener('click', () => {
  if (!S.room || !S.room.mine) return;
  const btn = $('#resetRoom');
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = '再点一次确认恢复'; setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = '恢复默认'; }, 3000); return; }
  btn.dataset.confirm = ''; btn.textContent = '恢复默认';
  const keep = { lat: S.room.lat, lon: S.room.lon, city: S.room.city, tz: S.room.tz };
  if (S.room.id === 'mine') { store.set('gebi3.room.mine', null); S.room = Object.assign(clone(ROOM_PRESETS.mine), keep, { mine: true, owner: '你' }); }
  else if (S.room.uid) { const tpl = (CLOUD.rooms.get(S.room.uid) || {}).tpl; const base = ROOM_PRESETS[tpl]; if (base) S.room.items = clone(base.items).filter(i => !i.entry || ['door'].includes(i.entry.kind)); }
  else if (CUSTOM[S.room.no]) { S.room = Object.assign(clone(CUSTOM[S.room.no]), keep); }
  closePanel(true); buildRoom(S.room); S.ceiling.visible = CAM.mode === 'fp'; saveLayout(); toast('房间已恢复');
});
$('#likeBtn').addEventListener('click', () => { if (!S.room) return; S.liked[S.room.id] = !S.liked[S.room.id]; store.set('gebi.liked', S.liked); syncChrome(); if (S.liked[S.room.id]) toast(`为 ${S.room.owner} 的房间点亮了一颗星`); });
bubble.addEventListener('click', () => { const g = findGroup('robot'); if (g) activate(g); });
function renderCatalog() {
  $('#catalog').innerHTML = Object.entries(ITEMS).filter(([, m]) => m.catalog).map(([k, m]) => `<button type="button" class="cat" data-t="${k}"><svg viewBox="0 0 40 34" aria-hidden="true">${CAT_ICON[k] || ''}</svg>${m.name}<small>${m.entry ? KIND_LABEL[m.entry.kind] : '装饰'}</small></button>`).join('');
}
$('#catalog').addEventListener('click', e => { const b = e.target.closest('.cat'); if (b) addFromCatalog(b.dataset.t); });
$('#goMine').addEventListener('click', () => { if (S.busy) return; const mr = CLOUD.ready ? myResident() : null; diveInto(mr || RESIDENTS.find(r => r.preset === 'mine')); });
$('#bell').addEventListener('click', () => openInbox());
$('#guestsBtn').addEventListener('click', () => openInbox());
$('#shareBtn').addEventListener('click', () => openShare());
$('#pickAddr').addEventListener('click', () => {
  if (S.busy) return; closePanel();
  flyGlobe(clamp(G.cam.lat, -40, 55), G.cam.lon, 2.6, 1.2);
  toast('在地球上点任意一块陆地，就能在那里入住', 3600);
  G.pickHint = true;
});


