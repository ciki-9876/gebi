/* ============================================================
   P1 · 收藏与改编 / 主题周 / 物件流 / Bit 转达
   ============================================================ */

/* ---------- 收藏与改编 ---------- */
const CURATE_NO = ['agent', 'guestbook', 'door', 'view', 'music'];
function originHTML(e) { return e && e.from && residentOfKey(e.from.room) ? `<button type="button" class="btn ghost" data-act="author">去 ${esc(e.from.by || 'TA')} 的房间</button>` : ''; }
function curateOK(e) { return !!(e && !CURATE_NO.includes(e.kind) && S.room && !S.room.mine && S.view === 'room' && embedSource(e)); }
function curateHTML(e) {
  let h = '';
  if (curateOK(e)) h += '<button type="button" class="btn" data-act="collect">☆ 收藏到我的房间</button><button type="button" class="btn" data-act="adapt">改编一份</button>';
  return h + originHTML(e);
}
function srcCtx() {
  const r = S.room;
  return { key: roomKey(r) || ('demo:' + r.no), by: String(r.owner === '你' ? '' : (r.owner || '')).slice(0, 20) || '邻居' };
}
function curateGate() {
  if (CLOUD.ready) {
    if (!canPost()) { toast('改编需要参与者权限。可以先点“收藏”，放进你的口袋'); return false; }
    if (!myRoomKey()) { toast('改编要先有自己的房间。可以先点“收藏”放进口袋，入住后一起摆进去', 3600); return false; }
  }
  return true;
}
function mkFrom(e, ctx, adapted) {
  const chain = ((e.from && e.from.chain) || []).concat(e.from ? [{ by: e.from.by, title: e.from.title }] : []).slice(-4);
  const f = { room: ctx.key, by: ctx.by, title: String(e.title || '').slice(0, 30), at: Date.now() };
  if (adapted) f.adapted = true;
  if (chain.length) f.chain = chain;
  return f;
}
function freeSpot(items) {
  const boxes = items.filter(i => !i.wall && i.type !== 'rug' && typeof i.x === 'number').map(i => { const m = ITEMS[i.type] || {}, odd = (i.rot || 0) % 2; return { x: i.x, z: i.z, hw: ((odd ? m.d : m.w) || 1) / 2, hd: ((odd ? m.w : m.d) || 1) / 2 }; });
  for (let z = -3.3; z <= 2.5; z += .9) for (let x = -4.3; x <= 4.3; x += .9) {
    if (!boxes.some(b => Math.abs(b.x - x) < b.hw + .6 && Math.abs(b.z - z) < b.hd + .6)) return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }
  return { x: 0, z: 0 };
}
function myWorkPrefix() { return CLOUD.ready ? (CLOUD.isOwner ? 'site/room302/works/' : `rooms/${CLOUD.me.id}/works/`) : 'local:'; }
async function addToMyRoom(make, dup) {
  if (S.room && S.room.mine && S.view === 'room') {
    if (dup && S.room.items.some(dup)) return 'dup';
    const def = make(S.room.items); S.room.items.push(def); placeItem(def); rebuildColliders(); refreshHotspots(); saveLayout(); return def;
  }
  if (CLOUD.ready) {
    if (CLOUD.isOwner) {
      const base = CLOUD.site && Array.isArray(CLOUD.site.items) && CLOUD.site.items.length ? CLOUD.site.items : ROOM_PRESETS.mine.items;
      const items = cleanItems(base, 'site/room302/works/');
      if (dup && items.some(dup)) return 'dup';
      const def = make(items); items.push(def); await writeSite({ items }); return def;
    }
    const d = clone(CLOUD.rooms.get(CLOUD.me.id) || {}); if (!d.no) return null;
    const items = cleanItems(d.items, `rooms/${CLOUD.me.id}/works/`);
    if (dup && items.some(dup)) return 'dup';
    const def = make(items); items.push(def); d.items = items; d.updatedAt = Date.now();
    CLOUD.rooms.set(CLOUD.me.id, d); await cloudWrite(`rooms/${CLOUD.me.id}`, d); return def;
  }
  const items = loadRoom('mine').items;
  if (dup && items.some(dup)) return 'dup';
  const def = make(items); items.push(def); store.set('gebi3.room.mine', items); return def;
}
async function collectEntry(e, ctx0) {
  if (!e) return;
  const ctx = ctx0 || srcCtx();
  const copy = clone(e); copy.from = mkFrom(e, ctx, false);
  const ent = cleanEntry(copy, null); if (!ent) return;
  // 没有房间、或者只能参观的人：先放进口袋，不再挡在门外
  if (CLOUD.ready && (!canPost() || !myRoomKey())) { pocketAdd(ent, ctx); return; }
  const r = await addToMyRoom(items => { const sp = freeSpot(items); return { uid: 'k' + Date.now().toString(36), type: 'keepsake', x: sp.x, z: sp.z, rot: 0, entry: ent }; },
    i => i.type === 'keepsake' && i.entry && i.entry.from && i.entry.from.room === ctx.key && i.entry.title === ent.title);
  if (r === 'dup') { toast('这件已经在你的房间里了'); return; }
  if (!r) { toast('没放进去，稍后再试一次'); return; }
  if (!ctx.key.startsWith('demo:')) recordVisit(ctx.key, '收藏 ' + String(ent.title).slice(0, 20));
  toast(`已收藏「${ent.title}」：摆在你房间的展台上，署名 ${ctx.by}`, 3600);
  if (OF.el && !OF.el.hidden) renderObjFeed();
}
async function adaptEntry(e, ctx0) {
  if (!e || !curateGate()) return;
  const ctx = ctx0 || srcCtx();
  const type = ({ game2: 'arcade', game: 'arcade', repo: 'whiteboard' })[e.kind] || 'kiosk';
  const copy = clone(e); copy.from = mkFrom(e, ctx, true);
  if (copy.kind === 'shiguang') copy.kind = 'app';
  if (e.work) {
    const html = await loadWork(e.work);
    if (html) {
      const path = myWorkPrefix() + 'w' + Date.now().toString(36);
      try { await saveWork(path, e.title || '作品', html); copy.work = path; copy.workBytes = new Blob([html]).size; } catch (x) { delete copy.work; delete copy.workBytes; }
    } else { delete copy.work; delete copy.workBytes; }
  }
  const ent = cleanEntry(copy, myWorkPrefix()); if (!ent) return;
  if (copy.work && copy.work.startsWith('local:')) { ent.work = copy.work; ent.workBytes = copy.workBytes; }
  const r = await addToMyRoom(items => { const sp = freeSpot(items); return { uid: type + Date.now().toString(36), type, x: sp.x, z: sp.z, rot: 0, entry: ent }; });
  if (!r) { toast('没放进去，稍后再试一次'); return; }
  if (!ctx.key.startsWith('demo:')) recordVisit(ctx.key, '改编 ' + String(ent.title).slice(0, 20));
  toast(`已把「${ent.title}」复制进你的房间：去装修模式里换色、改名、绑定你自己的地址。署名会一直保留`, 4800);
  if (OF.el && !OF.el.hidden) renderObjFeed();
}
function goOrigin(e) {
  const r = e && e.from && residentOfKey(e.from.room);
  if (!r) { toast('原作者的房间暂时找不到'); return; }
  closePanel(true); closeAllWins();
  if (S.view === 'room') goRoomFromRoom(r); else diveInto(r);
}

/* ---------- 主题周 ---------- */
const THEMES = [
  { t: '理想中的深夜小店', b: '把你的房间布置成理想中的深夜小店：几点开门，卖什么，谁会在凌晨推门进来？作品就是小店的招牌商品。', c: '#ffb454' },
  { t: '十平米的创作角落', b: '只给自己十平米：你会放下什么，留下什么？让作品从桌面一角长出来。', c: '#62e6ff' },
  { t: '屋顶上的小游戏厅', b: '把房间改成一间只有三台机器的小游戏厅，每台机器一个你最想让人试玩的作品。', c: '#ff5aa8' },
  { t: '下雨天的图书馆', b: '雨声、台灯、书架：布置一间适合慢慢读、慢慢写代码的房间。', c: '#9d8cff' },
  { t: '给陌生人的一间客房', b: '假设明天有位陌生的开发者要来借住：你想让他先看到哪三样东西？', c: '#7ee0a1' }
];
// 主题周统一按北京时间（UTC+8）切换：周一 00:00 开始，周日 24:00 结束，全世界同一个时刻
const THEME_TZ = 8, THEME_REF = Date.UTC(2026, 9, 19) - THEME_TZ * 3600e3;
function themeFor(idx) { const n = THEMES.length, t = THEMES[((idx % n) + n) % n]; return { id: 'w' + idx, idx, title: t.t, brief: t.b, c: t.c }; }
function curTheme() {
  const now = Date.now(), idx = Math.floor((now - THEME_REF) / (7 * 864e5));
  const th = themeFor(idx);
  th.start = new Date(THEME_REF + idx * 7 * 864e5); th.end = new Date(THEME_REF + (idx + 1) * 7 * 864e5);
  th.left = Math.max(1, Math.ceil((th.end - now) / 864e5));
  return th;
}
function themeEndText(th) {
  const e = th.end, local = `${e.getMonth() + 1}月${e.getDate()}日 ${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  const off = -new Date().getTimezoneOffset() / 60;
  return off === THEME_TZ ? '北京时间周日 24:00 结束并归档' : `北京时间周日 24:00 结束 · 你的时间 ${local}`;
}
const TH = { cur: curTheme(), on: false, local: store.get('gebi.tw', []) };
const DEMO_TW_NOW = ['204', '303', '101', '106', '108', '110', '202'], DEMO_TW_PAST = ['204', '101', '301', '202', '105'];
function cleanTw(v) { return typeof v === 'string' && /^w-?\d{1,4}$/.test(v) ? v : ''; }
function cleanTwLog(l) { return (Array.isArray(l) ? l : []).slice(-12).filter(x => x && cleanTw(x.id)).map(x => ({ id: x.id, t: String(x.t || '').slice(0, 24), at: +x.at || 0 })); }
function twMerge(list, entry) { return cleanTwLog((list || []).filter(x => x.id !== entry.id).concat(entry)); }
function themeLogOf(r) {
  if (r.real) return r.twLog || [];
  if (r.preset === 'mine') return cleanTwLog(CLOUD.ready ? (CLOUD.site && CLOUD.site.twLog) : TH.local);
  if (r.custom || r.state === 'reno') return [];
  const out = [], now = TH.cur, prev = themeFor(now.idx - 1);
  if (DEMO_TW_NOW.includes(r.no)) out.push({ id: now.id, t: now.title });
  if (DEMO_TW_PAST.includes(r.no)) out.push({ id: prev.id, t: prev.title });
  return out;
}
function inTheme(r, id) { return themeLogOf(r).some(x => x.id === id); }
function themeMembers(id) { return RESIDENTS.filter(r => inTheme(r, id)); }
function myThemeResident() { return CLOUD.ready ? myResident() : RESIDENTS.find(r => r.preset === 'mine'); }
function themeTag() { return S.resident && inTheme(S.resident, TH.cur.id) ? ' · 主题周' : ''; }
function themeArchive() {
  const m = new Map();
  RESIDENTS.forEach(r => themeLogOf(r).forEach(x => { if (x.id === TH.cur.id) return; const e = m.get(x.id) || { id: x.id, t: x.t, rs: [] }; e.rs.push(r); m.set(x.id, e); }));
  return [...m.values()].sort((a, b) => parseInt(b.id.slice(1)) - parseInt(a.id.slice(1)));
}
function applyThemeMap() {
  if (!G.ready) return;
  const col = new THREE.Color(TH.cur.c);
  G.pins.forEach(p => {
    if (!p.base) p.base = { head: p.head.material.color.clone(), scale: p.head.scale.x, beam: p.beamMat.uniforms.col.value.clone(), ring: p.ringMat.color.clone() };
    const mem = TH.on && inTheme(p.r, TH.cur.id);
    p.themed = mem; p.dim = TH.on && !mem;
    p.head.material.color.copy(mem ? col.clone().multiplyScalar(3) : p.base.head);
    p.head.scale.setScalar(mem ? .12 : p.dim ? p.base.scale * .7 : p.base.scale);
    p.beamMat.uniforms.col.value.copy(mem ? col.clone().multiplyScalar(2.6) : p.dim ? p.base.beam.clone().multiplyScalar(.25) : p.base.beam);
    p.ringMat.color.copy(mem ? col.clone().multiplyScalar(2) : p.dim ? p.base.ring.clone().multiplyScalar(.3) : p.base.ring);
  });
}
function syncThemeBtn() {
  const b = $('#themeBtn'); if (!b) return;
  TH.cur = Object.assign(TH.cur, curTheme());
  const n = themeMembers(TH.cur.id).length;
  b.querySelector('.th-t').textContent = TH.cur.title;
  b.querySelector('.th-n').textContent = `${n} 间亮灯 · 剩 ${TH.cur.left} 天`;
  const leds = b.querySelector('.th-leds'); if (leds) leds.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="led${i < n ? ' on' : ''}"></i>`).join('');
  b.style.setProperty('--tc', TH.cur.c);
  b.setAttribute('aria-pressed', TH.on);
}
async function joinTheme() {
  const th = TH.cur, entry = { id: th.id, t: th.title, at: Date.now() };
  if (CLOUD.ready) {
    if (!canPost()) { toast('你现在只能参观：参加主题周需要房主把你设为“参与者”'); return; }
    if (CLOUD.isOwner) await writeSite({ tw: th.id, twLog: twMerge(CLOUD.site && CLOUD.site.twLog, entry) });
    else {
      const d = clone(CLOUD.rooms.get(CLOUD.me.id) || {});
      if (!d.no) { toast('先在地球上选址入住，再来参加'); return; }
      d.tw = th.id; d.twLog = twMerge(d.twLog, entry); d.updatedAt = Date.now();
      CLOUD.rooms.set(CLOUD.me.id, d); await cloudWrite(`rooms/${CLOUD.me.id}`, d); syncRealResidents();
    }
  } else { TH.local = twMerge(TH.local, entry); store.set('gebi.tw', TH.local); }
  toast(`你的房间已为「${th.title}」亮灯`, 3200);
  applyThemeMap(); syncThemeBtn(); if (S.panel && S.panel.kind === 'theme') openThemePanel(true);
}
function openThemePanel(keep) {
  const th = TH.cur = Object.assign(TH.cur, curTheme());
  if (S.panel && !keep) closePanel(true);
  S.panel = { kind: 'theme' }; G.shiftGoal = isNarrow() ? 0 : -200;
  const mem = themeMembers(th.id), mr = myThemeResident(), joined = !!(mr && inTheme(mr, th.id));
  const li = r => { const i = residentInfo(r); return `<li><button type="button" class="nb" data-no="${esc(r.no)}"><i style="--c:${residentColor(r)}"></i>${esc(i.mine && !i.custom ? '你的房间' : i.handle)}<span>${esc(i.city)} · ${esc(i.name || '')}</span></button></li>`; };
  const arch = themeArchive();
  setPanel(`主题周 · 第 ${th.idx + 1} 期`, th.title, `
    <p class="u-mb3 u-loose">${esc(th.brief)}</p>
    <div class="th-meta"><span class="tag theme" style="--tc:${th.c}">还剩 ${th.left} 天</span><span class="tag dim">${esc(themeEndText(th))}</span></div>
    <div class="divider"></div>
    <p class="section-t">已亮灯的房间 · ${mem.length}</p>
    ${mem.length ? `<ul class="nblist">${mem.map(li).join('')}</ul>` : '<p class="mute small u-m0">还没有人参加，做第一个。</p>'}
    <p class="mute small u-mt3">亮灯的房间会在地球上变成主题色，其余的暗下去。其中一部分是演示数据。</p>
    ${arch.length ? `<div class="divider"></div><p class="section-t">往期归档</p><ul class="th-arch">${arch.map(a => `<li><b>${esc(a.t)}</b><span>${a.rs.length} 间房 · ${a.rs.slice(0, 3).map(r => esc(residentInfo(r).handle)).join('、')}${a.rs.length > 3 ? ' 等' : ''}</span></li>`).join('')}</ul>` : ''}`,
    `${joined ? `<button type="button" class="btn primary" id="thGo">去我的房间布置</button>` : `<button type="button" class="btn primary" id="thJoin">让我的房间亮灯参加</button>`}<button type="button" class="btn ghost" id="thOff">${TH.on ? '关闭主题地图' : '打开主题地图'}</button>`);
  pBody.querySelectorAll('.nb').forEach(x => x.addEventListener('click', () => { const o = RESIDENTS.find(y => y.no === x.dataset.no); if (o) openResident(o); }));
  const j = $('#thJoin'); if (j) j.addEventListener('click', joinTheme);
  const go = $('#thGo'); if (go) go.addEventListener('click', () => { if (mr) diveInto(mr); });
  $('#thOff').addEventListener('click', () => { TH.on = !TH.on; applyThemeMap(); syncThemeBtn(); openThemePanel(true); });
}
function toggleTheme() {
  if (S.busy) return;
  if (S.panel && S.panel.kind === 'theme' && TH.on) { TH.on = false; applyThemeMap(); syncThemeBtn(); closePanel(); return; }
  TH.on = true; applyThemeMap(); syncThemeBtn(); openThemePanel();
}

/* ---------- 物件流 ---------- */
const OF = { el: null, filter: 'all', open: false };
const OF_FILTERS = [['all', '全部'], ['game', '小游戏'], ['tool', '工具'], ['web', '网页'], ['repo', '开源'], ['theme', '本周主题']];
const OF_KIND = { game: ['game', 'game2'], tool: ['app', 'shiguang'], web: ['web', 'link'], repo: ['repo'] };
function flatEntries(items) {
  const out = [];
  (items || []).forEach(i => {
    if (i.entry && !CURATE_NO.includes(i.entry.kind)) out.push(i.entry);
    if (i.children) Object.values(i.children).forEach(c => { if (c && c.entry && !CURATE_NO.includes(c.entry.kind)) out.push(c.entry); });
  });
  return out;
}
const R302_ENTRIES = [{ kind: 'shiguang', title: '拾光', desc: '房主做的待办与便签 App：网页版、Windows 桌面版和浏览器扩展' }, { kind: 'game', title: '霓虹贪吃蛇', desc: '房主自己写的网页小游戏，屏幕里一直在自动演示' }];
function collectFeed() {
  const out = [];
  RESIDENTS.forEach(r => {
    if (r.state === 'reno') return;
    const info = residentInfo(r);
    let list = [], key = keyOfResident(r) || (r.preset || r.custom ? null : null);
    if (r.real) list = flatEntries(cleanItems((CLOUD.rooms.get(r.key) || {}).items, `rooms/${r.key}/works/`));
    else if (r.preset === 'mine') {
      const items = CLOUD.ready && CLOUD.site && Array.isArray(CLOUD.site.items) && CLOUD.site.items.length ? cleanItems(CLOUD.site.items, 'site/room302/works/') : ROOM_PRESETS.mine.items;
      const own = flatEntries(items), titles = new Set(own.map(x => x.title));
      list = R302_ENTRIES.filter(x => !own.some(o => o.kind === x.kind)).concat(own).filter((x, i, a) => a.findIndex(y => y.title === x.title) === i);
    }
    else if (r.preset) list = flatEntries(ROOM_PRESETS[r.preset].items);
    else if (r.custom && CUSTOM[r.no]) list = flatEntries(CUSTOM[r.no].items);
    else if (r.works) list = r.works.map(w => ({ kind: w[1], title: w[0], desc: r.tagline || '' }));
    const doc = r.real ? (CLOUD.rooms.get(r.key) || {}) : {}, fresh = r.real && Date.now() - (+doc.createdAt || 0) < 7 * 864e5;
    list.forEach(e => out.push({ r, key: key || ('demo:' + r.no), e, handle: info.mine && !info.custom ? '你' : info.handle, city: info.city, demo: !!info.demo, real: !!r.real || r.preset === 'mine', mine: !!info.mine, at: r.real ? (+doc.updatedAt || 0) : 0, theme: inTheme(r, TH.cur.id), playable: !!embedSource(e), fresh }));
  });
  // 能玩的排前面；新邻居（7 天内入住）能玩的作品再往前；还没上传的真实作品沉底
  const rank = it => (it.real && !it.playable ? 2 : 0) - (it.fresh && it.playable ? 1 : 0);
  return out.sort((a, b) => (rank(a) - rank(b)) || (b.at - a.at) || (hash(a.e.title + a.key) % 97) - (hash(b.e.title + b.key) % 97));
}
function ofPass(it) {
  if (OF.filter === 'all') return true;
  if (OF.filter === 'theme') return it.theme;
  return (OF_KIND[OF.filter] || []).includes(it.e.kind);
}
function ensureObjFeed() {
  if (OF.el) return;
  const el = document.createElement('section'); el.className = 'of'; el.id = 'of'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '物件流');
  el.innerHTML = `<header class="of-h"><div><div class="eyebrow">物件流</div><h2>十秒看懂的作品</h2><p>房间是目的地，物件流是街道。点“试玩”直接上手，喜欢就收藏进自己的房间，也可以当场给作者留一句话。</p></div><button type="button" class="icon-btn" id="ofClose" aria-label="关闭物件流"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8m0-8-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></header>
    <div class="of-f" id="ofFilters" role="tablist"></div><div class="of-grid" id="ofGrid"></div>`;
  document.body.appendChild(el); OF.el = el;
  $('#ofClose').addEventListener('click', closeObjFeed);
  $('#ofFilters').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; OF.filter = b.dataset.f; renderObjFeed(); });
  $('#ofGrid').addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const card = b.closest('.oc'), it = OF.items[+card.dataset.i]; if (!it) return;
    const a = b.dataset.a;
    if (a === 'play') openQuickPlay(it);
    else if (a === 'go') { closeObjFeed(); if (!S.busy) { S.via = 'feed'; diveInto(it.r); } }
    else if (a === 'collect') collectEntry(it.e, { key: it.key, by: it.handle === '你' ? '邻居' : it.handle });
    else if (a === 'adapt') adaptEntry(it.e, { key: it.key, by: it.handle === '你' ? '邻居' : it.handle });
    else if (a === 'say') { const f = card.querySelector('.oc-say'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus(); }
  });
  $('#ofGrid').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target.closest('.oc-say'), card = f.closest('.oc'), it = OF.items[+card.dataset.i];
    const inp = f.querySelector('input'), t = inp.value.trim(); if (!t || !it) return;
    inp.value = ''; if (await postMessage(it.key, t)) { recordVisit(it.key, '留言'); toast(`已留言给 ${it.handle}，TA 回复后你会在“动态”里看到`); f.hidden = true; }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (QP.el && !QP.el.hidden) closeQuickPlay(); else if (OF.el && !OF.el.hidden) closeObjFeed(); } });
}
function renderObjFeed() {
  const all = collectFeed(); OF.items = all.filter(ofPass);
  $('#ofFilters').innerHTML = OF_FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" role="tab" aria-selected="${OF.filter === k}">${l}${k === 'theme' ? ` · ${all.filter(x => x.theme).length}` : ''}</button>`).join('');
  const grid = $('#ofGrid'); grid.innerHTML = '';
  if (!OF.items.length) { grid.innerHTML = '<p class="mute u-span-all u-center u-pad-xl">这个分类下暂时没有作品。</p>'; return; }
  OF.items.forEach((it, i) => {
    const card = document.createElement('article'); card.className = 'oc'; card.dataset.i = i;
    const cv = kioskCanvas(it.e, 384, 232); cv.className = 'oc-cover'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', it.e.title || '作品'); card.appendChild(cv);
    const canSay = CLOUD.ready && it.real && canPost() && !it.mine;
    const waiting = it.real && !it.playable, canCurate = !it.mine && it.playable;
    if (waiting) card.classList.add('waiting');
    card.insertAdjacentHTML('beforeend', `<div class="oc-b"><div class="oc-t"><b>${esc(it.e.title || '未命名')}</b><span class="tag ${/game/.test(it.e.kind) ? 'pink' : ''}">${esc(KIND_LABEL[it.e.kind] || '作品')}</span></div>
      <p>${esc(waiting ? '作者还没上传这件作品，先去 TA 的房间看看别的。' : it.e.desc || '房主还没写介绍')}</p>
      <div class="oc-m"><i style="--c:${residentColor(it.r)}"></i><span>${esc(it.handle)} · ${esc(it.city || '')}</span>${it.fresh ? '<span class="tag ok">新邻居</span>' : ''}${it.theme ? '<span class="tag">本周主题</span>' : ''}${it.e.from ? `<span class="tag pink">${it.e.from.adapted ? '改编' : '收藏'}自 ${esc(it.e.from.by || '邻居')}</span>` : ''}${it.demo ? '<span class="tag dim">演示</span>' : ''}${waiting ? '<span class="tag dim">等作者上传</span>' : ''}</div>
      <div class="oc-a">${waiting ? '' : '<button type="button" class="btn sm primary" data-a="play">试玩</button>'}<button type="button" class="btn sm${waiting ? ' primary' : ''}" data-a="go">进房间</button>${canCurate ? '<button type="button" class="btn sm" data-a="collect">☆ 收藏</button><button type="button" class="btn sm ghost" data-a="adapt">改编</button>' : ''}${canSay ? '<button type="button" class="btn sm ghost" data-a="say">说一句</button>' : ''}</div>
      ${canSay ? '<form class="oc-say" hidden><input class="input" maxlength="120" placeholder="给作者留一句话，TA 会在动态里看到" aria-label="给作者留言"><button class="btn sm primary" type="submit">发送</button></form>' : ''}</div>`);
    grid.appendChild(card);
  });
}
function openObjFeed() {
  ensureObjFeed(); if (S.busy) return;
  closePanel(true); OF.el.hidden = false; OF.el.scrollTop = 0; document.body.classList.add('of-open');
  renderObjFeed(); setTimeout(() => $('#ofClose').focus({ preventScroll: true }), 50);
}
function closeObjFeed() { if (!OF.el) return; closeQuickPlay(); OF.el.hidden = true; document.body.classList.remove('of-open'); }

/* quick play: try a work without walking into the room */
const QP = { el: null, it: null };
function placeholderDoc(e) {
  const kc = KIND_COLOR[e.kind] || KIND_COLOR.link;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,${kc[0]},${kc[1]});color:#fff;font:600 22px system-ui;text-align:center;overflow:hidden;touch-action:none"><canvas id="c" style="position:fixed;inset:0"></canvas><div style="position:relative;pointer-events:none;padding:0 24px"><div>${esc(e.title || '作品')}</div><div style="font:400 13px system-ui;opacity:.85;margin-top:8px">演示房间里的占位作品 · 点画面放烟花</div></div><script>var c=document.getElementById('c'),x=c.getContext('2d'),P=[];function R(){c.width=innerWidth;c.height=innerHeight}R();onresize=R;onpointerdown=function(e){for(var i=0;i<26;i++){var a=Math.random()*6.283,s=1+Math.random()*4;P.push({x:e.clientX,y:e.clientY,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1})}};(function L(){x.clearRect(0,0,c.width,c.height);P=P.filter(function(p){return p.l>0});P.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.vy+=.06;p.l-=.014;x.fillStyle='rgba(255,255,255,'+p.l+')';x.beginPath();x.arc(p.x,p.y,3*p.l+1,0,6.283);x.fill()});requestAnimationFrame(L)})()<\/script>`;
}
function ensureQP() {
  if (QP.el) return;
  const el = document.createElement('section'); el.className = 'qp'; el.hidden = true; el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="qp-box"><header class="qp-bar"><div class="qp-t"><b></b><span></span></div><div class="qp-act"><button type="button" class="win-get" data-q="collect">☆ 收藏</button><button type="button" class="win-get" data-q="go">进房间</button><a class="wbtn" data-q="tab" target="_blank" rel="noopener noreferrer" hidden aria-label="在新标签页打开">${ICON.ext}</a><button type="button" class="wbtn x" data-q="close" aria-label="关闭">${WICON.x}</button></div></header><div class="qp-body"></div></div>`;
  document.body.appendChild(el); QP.el = el;
  el.addEventListener('click', ev => {
    if (ev.target === el) return closeQuickPlay();
    const b = ev.target.closest('[data-q]'); if (!b || !QP.it) return; const it = QP.it;
    if (b.dataset.q === 'close') closeQuickPlay();
    else if (b.dataset.q === 'go') { if (!it.r) { toast('作者的房间暂时找不到'); return; } closeQuickPlay(); closeObjFeed(); closePanel(true); if (S.busy) return; S.via = 'feed'; if (S.view === 'room') goRoomFromRoom(it.r); else diveInto(it.r); }
    else if (b.dataset.q === 'collect') collectEntry(it.e, { key: it.key, by: it.handle === '你' ? '邻居' : it.handle });
  });
}
async function openQuickPlay(it) {
  ensureQP(); const e = it.e; QP.it = it;
  const body = QP.el.querySelector('.qp-body'); body.innerHTML = '';
  QP.el.querySelector('.qp-t b').textContent = e.title || '作品';
  if (e.art) {
    QP.el.querySelector('.qp-t span').textContent = `${it.handle} · ${it.city || ''} · ${artInfo(e)}`;
    QP.el.querySelector('[data-q="tab"]').hidden = true; QP.el.querySelector('[data-q="collect"]').hidden = !!it.mine;
    const box = document.createElement('div'); box.className = 'art-view'; body.appendChild(box); QP.el.hidden = false;
    renderArt(box, e, { autorun: true });
    if (it.real && !it.key.startsWith('demo:')) recordVisit(it.key, '试玩 ' + String(e.title || '').slice(0, 20));
    return;
  }
  const real = embedSource(e);
  if (!real && it.real) {
    // 真实住户还没上传：不放占位动画，直接说清楚
    QP.el.querySelector('.qp-t span').textContent = `${it.handle} · ${it.city || ''} · 等作者上传`;
    QP.el.querySelector('[data-q="tab"]').hidden = true; QP.el.querySelector('[data-q="collect"]').hidden = true;
    body.innerHTML = `<div class="empty"><b>作者还没上传「${esc(e.title || '这件作品')}」</b><p>房间里已经给它留了位置。去 ${esc(it.handle)} 的房间看看别的作品，或者给 TA 留一句话催一催。</p></div>`;
    QP.el.hidden = false; return;
  }
  const src = real || { srcdoc: placeholderDoc(e), external: false, demo: true };
  QP.el.querySelector('.qp-t span').textContent = `${it.handle} · ${it.city || ''}${src.demo ? ' · 演示房间的占位作品' : src.hosted ? ' · 隔壁托管' : ''}`;
  const tab = QP.el.querySelector('[data-q="tab"]'); tab.hidden = !src.external; if (src.external) tab.href = src.src;
  QP.el.querySelector('[data-q="collect"]').hidden = !!it.mine || !!src.demo;
  const f = document.createElement('iframe'); f.title = e.title || '作品';
  f.setAttribute('sandbox', src.external ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock' : 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups');
  f.setAttribute('allow', 'fullscreen; gamepad; clipboard-write; autoplay'); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  body.appendChild(f); QP.el.hidden = false;
  if (src.hosted) { const html = await loadWork(src.hosted); if (QP.it !== it) return; if (!html) { body.innerHTML = '<p class="mute u-center u-pad-xl">作品文件没找到，房主可能刚刚移除了它。</p>'; return; } f.srcdoc = html; }
  else if (src.srcdoc) f.srcdoc = src.srcdoc; else f.src = src.src;
  if (it.real && !it.key.startsWith('demo:')) recordVisit(it.key, '试玩 ' + String(e.title || '').slice(0, 20));
}
$('#themeBtn').addEventListener('click', toggleTheme);
$('#openObjFeed').addEventListener('click', openObjFeed);
function closeQuickPlay() { if (!QP.el || QP.el.hidden) return; QP.el.hidden = true; QP.it = null; QP.el.querySelector('.qp-body').innerHTML = ''; }

/* ---------- Bit：接待与转达 ---------- */
function relayKey() { return S.room ? roomKey(S.room) : null; }
async function relaySend(kind, text, when) {
  const key = relayKey(); if (!key) return false;
  if (CLOUD.ready) {
    if (!canPost()) { toast('你现在只能参观：留言需要房主把你设为“参与者”'); return false; }
    const ok = await postMessage(key, text, null, kind === 'appt' ? { kind: 'appt', when } : null);
    if (ok) recordVisit(key, kind === 'appt' ? '预约' : '留言');
    return ok;
  }
  GB.unshift({ name: '访客', text: (kind === 'appt' ? `【预约 ${when || '时间待定'}】` : '') + text, time: '刚刚' }); if (GB.length > 20) GB.pop();
  store.set('gebi.guestbook', GB); drawChalk(); return true;
}
async function relayNudge() {
  const key = relayKey(); if (!key || !CLOUD.ready) return 'offline';
  if (!canPost()) return 'readonly';
  const me = CLOUD.me.id, mine = roomMessages(key).filter(m => m.author === me && !m.reply && !hasReply(key, m)).pop();
  if (!mine) return 'none';
  if (mine.nudge && Date.now() - mine.nudge < 6 * 3600e3) return 'cool';
  const d = clone(CLOUD.msgs.get(me) || {}), m = (d.list || []).find(x => x.id === mine.id); if (!m) return 'none';
  m.nudge = Date.now(); d.updatedAt = Date.now(); CLOUD.msgs.set(me, d); onMsgs();
  try { await cloudWrite(`msgs/${me}`, d); return 'ok'; } catch (e) { return 'fail'; }
}
function hasUnrepliedOfMine() { const key = relayKey(); if (!key || !CLOUD.ready) return false; const me = CLOUD.me.id; return roomMessages(key).some(m => m.author === me && !m.reply && !hasReply(key, m)); }
function relayLog(text) { S.chat.log.push({ role: 'act', text }); renderChat(); }
function openRelay(mode) { S.relayMode = mode; renderRelay(); }
function renderRelay() {
  const box = $('#relay'); if (!box) return;
  const key = relayKey(), owner = CLOUD.ready && iOwnRoom(key);
  if (owner) {
    const n = CLOUD.ready ? pendingFor(key).length : 0;
    box.innerHTML = n ? `<div class="rl-owner"><b>${n} 条留言等你回复</b><span>访客在等，Bit 只转达，回复得你自己来。</span><button type="button" class="btn sm primary" id="rlInbox">去访客簿回复</button></div>` : '';
    const b = $('#rlInbox'); if (b) b.addEventListener('click', () => openInbox());
    return;
  }
  const mode = S.relayMode;
  if (!mode) {
    box.innerHTML = `<div class="rl-bar"><span>我只负责接待和转达</span><div><button type="button" class="btn sm" data-r="msg">给老板留言</button><button type="button" class="btn sm" data-r="appt">约个时间</button>${hasUnrepliedOfMine() ? '<button type="button" class="btn sm ghost" data-r="nudge">提醒老板回复</button>' : ''}</div></div>`;
  } else {
    box.innerHTML = `<form class="rl-form" id="rlForm"><label for="rlText">${mode === 'appt' ? '想和老板聊什么？' : '想对老板说什么？'}</label>
      ${mode === 'appt' ? '<div class="rl-when" id="rlWhen">' + ['今晚', '这周内', '下周', '随时都行'].map((w, i) => `<button type="button" data-w="${w}" aria-pressed="${i === 0}">${w}</button>`).join('') + '</div>' : ''}
      <textarea class="input" id="rlText" maxlength="120" rows="2" placeholder="${mode === 'appt' ? '一句话说清楚事由，比如：想聊聊你的拾光怎么做桌面托盘' : '我原话贴到黑板上，老板回复后你会在“动态”里看到'}"></textarea>
      <div class="rl-act"><button type="submit" class="btn sm primary">${mode === 'appt' ? '帮我约' : '帮我转达'}</button><button type="button" class="btn sm ghost" data-r="cancel">算了</button></div></form>`;
  }
  box.onclick = async ev => {
    const b = ev.target.closest('[data-r],[data-w]'); if (!b) return;
    if (b.dataset.w) { box.querySelectorAll('[data-w]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    const r = b.dataset.r;
    if (r === 'cancel') { S.relayMode = null; renderRelay(); }
    else if (r === 'msg' || r === 'appt') openRelay(r);
    else if (r === 'nudge') {
      const res = await relayNudge();
      const msg = { ok: '已提醒老板：你的留言还在等回复', cool: '刚催过，老板看到了。过几个小时再来', none: '没有等回复的留言可催', readonly: '你现在只能参观，不能催', offline: '离线演示里没法催', fail: '没催成功，稍后再试' }[res];
      relayLog(msg); renderRelay();
    }
  };
  const f = $('#rlForm'); if (f) { f.onsubmit = async ev => {
    ev.preventDefault(); const t = $('#rlText').value.trim(); if (!t) { $('#rlText').focus(); return; }
    const w = mode === 'appt' ? ((box.querySelector('[data-w][aria-pressed="true"]') || {}).dataset || {}).w || '时间待定' : '';
    const ok = await relaySend(mode, t, w);
    if (ok) { S.relayMode = null; relayLog(mode === 'appt' ? `已转达：想约老板「${w}」聊一聊，贴在了黑板上` : '已转达：你的话贴到了后墙黑板'); const m = { role: 'bit', text: mode === 'appt' ? '约好啦，我把时间和事由贴给老板了。他看到会回复你，别忘了回来看“动态”。' : '收到，已经贴到黑板上。老板回复后你会在“动态”里看到。' }; S.chat.log.push(m); renderChat(); renderRelay(); }
  }; setTimeout(() => { const i = $('#rlText'); if (i && !isNarrow()) i.focus({ preventScroll: true }); }, 30); }
}


