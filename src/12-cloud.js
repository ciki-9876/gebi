/* ============================================================
   Cloud: accounts, shared rooms, visits, messages, hosted works
   (artifact db + user). Without them the page runs on local storage.
   ============================================================ */
const CLOUD = { ready: false, db: null, user: null, me: null, isOwner: false, canWrite: null, readOnly: false, site: null, rooms: new Map(), msgs: new Map(), visits: new Map(), lastSeen: 0, landing: null, greeted: false };
const SHARE_BASE = 'https://claude.ai/artifact/LWAStw84ruoEsCPAvfHYEP';
const NAMES = new Map();
const WQ = new Map();
function cloudWrite(path, body) {
  const prev = WQ.get(path) || Promise.resolve();
  const p = prev.catch(() => {}).then(() => CLOUD.db.doc(path).set(body));
  WQ.set(path, p);
  p.catch(e => {
    const c = e && e.code;
    if (c === 'invalid_argument' && CLOUD.canWrite !== true) { CLOUD.readOnly = true; syncChrome(); toast('你现在只能参观：入住和留言需要房主把你设为“参与者”'); }
    else if (c === 'quota_exceeded') toast('社区的存储空间满了，请联系房主清理后再试');
    else if (c === 'resource_exhausted') toast('操作太快了，稍等几秒再试');
    else if (c !== 'revoked') toast('没保存成功，网络恢复后再试一次');
  });
  return p;
}
const canPost = () => CLOUD.ready && CLOUD.canWrite !== false && !CLOUD.readOnly;
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s / 60) + ' 分钟前'; if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
  const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日`;
}
async function initCloud() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const me = await user.me(); if (!me || !me.id) return;
    Object.assign(CLOUD, { db, user, me, isOwner: !!me.isOwner });
    CLOUD.canWrite = await user.can('data.write');
    try { const st = await db.doc(`data/users/${me.id}/state`).get(); CLOUD.lastSeen = st.exists ? (+st.data().lastSeen || 0) : 0; } catch (e) {}
    CLOUD.ready = true;
    loadPocket();
    const err = e => { if (e && e.code === 'revoked') { CLOUD.ready = false; syncChrome(); } };
    db.doc('site/room302').onSnapshot(s => { CLOUD.site = s.exists ? s.data() : null; onSite(); }, err);
    db.collection('rooms').onSnapshot(s => { CLOUD.rooms = new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()])); onRooms(); }, err);
    db.collection('msgs').onSnapshot(s => { CLOUD.msgs = new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()])); onMsgs(); }, err);
    db.collection('visits').onSnapshot(s => { CLOUD.visits = new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()])); onVisits(); }, err);
    for (let i = RESIDENTS.length - 1; i >= 0; i--) if (RESIDENTS[i].custom) RESIDENTS.splice(i, 1);
    syncChrome();
  } catch (e) { console.warn('cloud unavailable', e); }
}
/* ---------- identity helpers ---------- */
const isMine302 = () => !CLOUD.ready || CLOUD.isOwner;
function roomKey(room) { if (!room) return null; if (room.id === 'mine') return '302'; return room.uid || null; }
function keyOfResident(r) { return r.preset === 'mine' ? '302' : r.real ? r.key : null; }
function iOwnRoom(key) { return CLOUD.ready && !!key && (key === '302' ? CLOUD.isOwner : key === CLOUD.me.id); }
function myRoomKey() { if (!CLOUD.ready) return null; if (CLOUD.isOwner) return '302'; return CLOUD.rooms.has(CLOUD.me.id) ? CLOUD.me.id : null; }
function myResident() { const k = myRoomKey(); if (!k) return null; return k === '302' ? RESIDENTS.find(r => r.preset === 'mine') : RESIDENTS.find(r => r.real && r.key === k); }
function ownerHandle302() { const id = CLOUD.site && CLOUD.site.ownerId; return (id && NAMES.get(id)) || '老板'; }
async function resolveNames(ids) {
  if (!CLOUD.user) return;
  const need = [...new Set(ids)].filter(id => id && !NAMES.has(id));
  if (!need.length) return;
  try { const ps = await CLOUD.user.profiles(need); need.forEach(id => NAMES.set(id, (ps[id] && ps[id].name) || '')); } catch (e) {}
}
function nameOfUid(uid) {
  if (CLOUD.ready && uid === CLOUD.me.id) return '你';
  const r = CLOUD.rooms.get(uid); if (r && r.handle) return String(r.handle).slice(0, 20);
  if (CLOUD.site && CLOUD.site.ownerId === uid) return ownerHandle302() + '（302 房主）';
  return NAMES.get(uid) || '一位访客';
}

/* ---------- privacy: addresses stay at city level ---------- */
function snapToCity(lat, lon, seed) {
  const n = nearestCity({ lat, lon }), r = rng(hash(String(seed)));
  if (n.km < 320) { const a = r() * Math.PI * 2, d = .03 + r() * .06; return { lat: n.city.lat + Math.sin(a) * d, lon: n.city.lon + Math.cos(a) * d / Math.cos(n.city.lat * D2R), city: n.city.zh }; }
  return { lat: Math.round(lat * 2) / 2, lon: Math.round(lon * 2) / 2, city: describePlace(lat, lon, false).title };
}
function fmtCity(lat, lon) { return `约 ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'} · 城市级`; }
RESIDENTS.forEach(r => { const s = snapToCity(r.lat, r.lon, r.no); r.lat = s.lat; r.lon = s.lon; });
{ const r302 = RESIDENTS.find(r => r.preset === 'mine'); if (r302) { ME.lat = r302.lat; ME.lon = r302.lon; } }

/* ---------- sanitising other people's rooms ---------- */
const WORK_RE = /^(site\/room302|rooms\/[A-Za-z0-9_\-.~:@+]+)\/works\/[A-Za-z0-9_-]+$/;
function cleanEntry(e, prefix) {
  if (!e || typeof e !== 'object') return undefined;
  const kind = KIND_LABEL[e.kind] ? e.kind : 'web';
  const o = { kind, title: String(e.title || '').slice(0, 30), desc: String(e.desc || '').slice(0, 80), url: validUrl(e.url) ? String(e.url).trim().slice(0, 500) : '' };
  const fr = cleanFrom(e.from); if (fr) o.from = fr;
  if (typeof e.work === 'string' && WORK_RE.test(e.work) && (!prefix || e.work.startsWith(prefix) || (fr && !fr.adapted))) { o.work = e.work; o.workBytes = +e.workBytes || 0; }
  if (e.open === 'tab') o.open = 'tab';
  if (e.size === 'wide' || e.size === 'tall') o.size = e.size;
  if (typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color)) o.color = e.color;
  if (e.downloads && typeof e.downloads === 'object') { const d = {}; PLATFORMS.forEach(p => { const it = e.downloads[p.k]; if (it && validUrl(it.url)) d[p.k] = { url: String(it.url).slice(0, 500), ver: String(it.ver || '').slice(0, 12) }; }); if (Object.keys(d).length) o.downloads = d; }
  return o;
}
const KEY_RE = /^[A-Za-z0-9_\-.~:@+]{1,60}$/;
function cleanFrom(f) {
  if (!f || typeof f !== 'object' || typeof f.room !== 'string' || !KEY_RE.test(f.room)) return null;
  const o = { room: f.room, by: String(f.by || '').slice(0, 20), title: String(f.title || '').slice(0, 30), at: +f.at || 0 };
  if (f.adapted) o.adapted = true;
  if (Array.isArray(f.chain)) o.chain = f.chain.slice(-4).map(c => ({ by: String((c && c.by) || '').slice(0, 20), title: String((c && c.title) || '').slice(0, 30) }));
  return o;
}
function cleanItems(items, prefix) {
  const num = (v, lo, hi) => clamp(+v || 0, lo, hi);
  return (Array.isArray(items) ? items : []).slice(0, 80).filter(i => i && ITEMS[i.type]).map(i => {
    const o = { uid: String(i.uid || i.type).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'i' + Math.random().toString(36).slice(2, 7), type: i.type };
    if (['back', 'left', 'right', 'front'].includes(i.wall)) { o.wall = i.wall; o.u = num(i.u, -5, 5); o.y = num(i.y, 0, RH); }
    else { o.x = num(i.x, -5, 5); o.z = num(i.z, -4, 4); o.rot = Math.round(num(i.rot, 0, 3)); o.ry = num(i.ry, -3.2, 3.2); }
    if (i.entry) o.entry = cleanEntry(i.entry, prefix);
    if (i.opts && typeof i.opts === 'object') o.opts = { console: i.opts.console !== false, note: i.opts.note !== false };
    if (i.text) o.text = String(i.text).slice(0, 24);
    if (i.children && typeof i.children === 'object') { o.children = {}; for (const k of ['vinyl', 'console', 'note', 'cassette']) if (i.children[k]) o.children[k] = { name: String(i.children[k].name || '').slice(0, 16), entry: cleanEntry(i.children[k].entry, prefix) }; }
    return o;
  });
}
function cleanTheme(t) {
  const c = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v : null;
  const base = ROOM_PRESETS.pixel.theme, o = {};
  for (const k of ['wall', 'trim', 'floorTint', 'neonColor', 'arcade', 'bean', 'sofa']) o[k] = c(t && t[k]) || base[k] || '#2a2238';
  o.floor = ['wood', 'tile', 'concrete'].includes(t && t.floor) ? t.floor : 'wood';
  o.neon = String((t && t.neon) || 'GEBI').slice(0, 16);
  o.rug = Array.isArray(t && t.rug) && t.rug.length === 4 && t.rug.every(c) ? t.rug : base.rug;
  return o;
}
function realResidents() {
  const out = [];
  CLOUD.rooms.forEach((d, uid) => {
    if (!d || typeof d.lat !== 'number' || typeof d.lon !== 'number') return;
    out.push({ no: String(d.no || '000').replace(/\D/g, '').slice(0, 4) || '000', key: uid, real: true, handle: String(d.handle || '@住户').slice(0, 20), name: String(d.name || '新房间').slice(0, 16), city: String(d.city || '').slice(0, 16), lat: clamp(d.lat, -85, 85), lon: clamp(d.lon, -180, 180), tagline: '隔壁住户', tags: ['真实住户'], hue: (hash(uid) % 1000) / 1000, tw: cleanTw(d.tw), twLog: cleanTwLog(d.twLog) });
  });
  return out;
}
function realRoom(r) {
  const d = CLOUD.rooms.get(r.key) || {}, prefix = `rooms/${r.key}/works/`;
  return { id: 'u-' + r.key, uid: r.key, no: r.no, name: r.name, owner: r.key === (CLOUD.me && CLOUD.me.id) ? '你' : r.handle, mine: iOwnRoom(r.key), theme: cleanTheme(d.theme), items: cleanItems(d.items, prefix), lat: r.lat, lon: r.lon, city: r.city };
}

/* ---------- live updates ---------- */
let arcsT = 0;
function refreshArcsSoon() { clearTimeout(arcsT); arcsT = setTimeout(() => { if (G.ready) buildArcs(); }, 800); }
function syncRealResidents() {
  for (let i = RESIDENTS.length - 1; i >= 0; i--) if (RESIDENTS[i].real) RESIDENTS.splice(i, 1);
  RESIDENTS.push(...realResidents());
  resolveNames([...CLOUD.rooms.keys()]);
  if (!G.ready) return;
  for (let i = G.pins.length - 1; i >= 0; i--) { const p = G.pins[i]; if ((p.r.real && p.r.key !== CLOUD.landing) || p.r.custom) { G.pinRoot.remove(p.g); G.pins.splice(i, 1); } }
  RESIDENTS.filter(r => r.real && r.key !== CLOUD.landing).forEach(r => addPin(r));
  buildArcs(); buildGlobeLabels(); applyThemeMap(); syncChrome();
}
function onSite() {
  const s = CLOUD.site, r = RESIDENTS.find(x => x.preset === 'mine');
  if (s && s.ownerId) resolveNames([s.ownerId]).then(() => { if (G.ready) buildGlobeLabels(); syncChrome(); });
  if (r && s && typeof s.lat === 'number' && typeof s.lon === 'number') {
    const moved = Math.abs(r.lat - s.lat) > 1e-6 || Math.abs(r.lon - s.lon) > 1e-6;
    r.lat = clamp(s.lat, -85, 85); r.lon = clamp(s.lon, -180, 180); r.city = String(s.city || r.city).slice(0, 16);
    Object.assign(ME, { lat: r.lat, lon: r.lon, city: r.city });
    if (moved && G.ready) { const p = pinOf('302'); if (p) { G.pinRoot.remove(p.g); G.pins.splice(G.pins.indexOf(p), 1); } addPin(r); buildArcs(); }
  }
  if (G.ready) { buildGlobeLabels(); applyThemeMap(); }
  syncChrome();
}
function onRooms() { syncRealResidents(); }
function onMsgs() {
  if (S.view === 'room' && roomKey(S.room)) drawChalk();
  if (S.panel && S.panel.kind === 'guestbook' && S.panel.render) S.panel.render();
  if (S.panel && S.panel.kind === 'inbox') renderInbox();
  const ids = []; CLOUD.msgs.forEach((d, uid) => ids.push(uid)); resolveNames(ids);
  syncChrome();
}
function onVisits() {
  if (S.panel && S.panel.kind === 'inbox') renderInbox();
  const ids = []; CLOUD.visits.forEach((d, uid) => ids.push(uid)); resolveNames(ids);
  refreshArcsSoon(); syncChrome();
}
function realArcPairs() {
  const pairs = [];
  if (!CLOUD.ready) return pairs;
  CLOUD.visits.forEach((d, uid) => {
    const from = RESIDENTS.find(r => r.real && r.key === uid) || (CLOUD.site && CLOUD.site.ownerId === uid ? RESIDENTS.find(r => r.preset === 'mine') : null);
    if (!from || !d || !d.log) return;
    Object.keys(d.log).forEach(k => { const to = k === '302' ? RESIDENTS.find(r => r.preset === 'mine') : RESIDENTS.find(r => r.real && r.key === k); if (to && to !== from) pairs.push([from, to]); });
  });
  return pairs;
}

/* ---------- messages ---------- */
function roomMessages(key) {
  const out = [];
  CLOUD.msgs.forEach((d, uid) => { (Array.isArray(d && d.list) ? d.list : []).forEach(m => { if (m && m.room === key && typeof m.text === 'string' && m.id) out.push({ id: String(m.id), room: key, text: m.text.slice(0, 200), at: +m.at || 0, reply: m.reply && m.reply.to ? { to: String(m.reply.to), id: String(m.reply.id) } : null, author: uid, kind: m.kind === 'appt' ? 'appt' : '', when: String(m.when || '').slice(0, 30), nudge: +m.nudge || 0 }); }); });
  return out.sort((a, b) => a.at - b.at);
}
async function postMessage(key, text, reply, extra) {
  if (!canPost()) { toast('你现在只能参观：留言需要房主把你设为“参与者”'); return false; }
  const uid = CLOUD.me.id, d = clone(CLOUD.msgs.get(uid) || {});
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), room: key, text: text.slice(0, 120), at: Date.now() };
  if (reply) m.reply = { to: reply.author, id: reply.id };
  if (extra && extra.kind === 'appt') { m.kind = 'appt'; m.when = String(extra.when || '').slice(0, 30); }
  d.list = (Array.isArray(d.list) ? d.list : []).concat(m).slice(-120);
  d.rooms = [...new Set(d.list.map(x => x.room))];
  d.replyTo = [...new Set(d.list.filter(x => x.reply).map(x => x.reply.to))];
  d.updatedAt = Date.now();
  CLOUD.msgs.set(uid, d); onMsgs();
  if (key === '302' && CLOUD.isOwner && !(CLOUD.site && CLOUD.site.ownerId)) writeSite({});
  try { await cloudWrite(`msgs/${uid}`, d); return true; } catch (e) { return false; }
}
function threadHTML(key, opts = {}) {
  const all = roomMessages(key), tops = all.filter(m => !m.reply), owner = iOwnRoom(key);
  if (!tops.length) return `<p class="mute small u-mb3">${opts.empty || '黑板还是空的，第一个写点什么吧。'}</p>`;
  return tops.slice().reverse().slice(0, opts.limit || 40).map(m => {
    const replies = all.filter(x => x.reply && x.reply.id === m.id);
    return `<div class="gb-item" data-id="${esc(m.id)}">${m.kind === 'appt' ? `<span class="tag pink">预约 · ${esc(m.when || '时间待定')}</span> ` : ''}${esc(m.text)}<small><span>— ${esc(nameOfUid(m.author))}</span><span>${m.nudge && !replies.length ? `催过一次 · ` : ''}${esc(ago(m.at))}</span></small>
      ${replies.map(x => `<div class="gb-reply"><b>${esc(nameOfUid(x.author))}</b>：${esc(x.text)}<span>${esc(ago(x.at))}</span></div>`).join('')}
      ${owner && m.author !== CLOUD.me.id && canPost() ? `<form class="gb-rform" data-id="${esc(m.id)}" data-author="${esc(m.author)}"><input class="input" maxlength="120" placeholder="回复 ${esc(nameOfUid(m.author))}" aria-label="回复这条留言"><button class="btn sm" type="submit">回复</button></form>` : ''}</div>`;
  }).join('');
}
function bindReplies(root, key, after) {
  root.querySelectorAll('.gb-rform').forEach(f => f.addEventListener('submit', async ev => {
    ev.preventDefault(); const i = f.querySelector('input'), t = i.value.trim(); if (!t) return;
    i.value = ''; const ok = await postMessage(key, t, { author: f.dataset.author, id: f.dataset.id });
    if (ok) toast('已回复，对方下次打开隔壁会看到'); if (after) after();
  }));
}

/* ---------- visits ---------- */
let visitT = 0;
const VIA = { share: '分享链接', feed: '物件流', globe: '地球', room: '串门', search: '搜索', link: '直接链接' };
function recordVisit(key, did, via) {
  if (!canPost() || !key || iOwnRoom(key) || key.startsWith('demo:')) return;
  const uid = CLOUD.me.id, d = clone(CLOUD.visits.get(uid) || {});
  d.log = d.log && typeof d.log === 'object' ? d.log : {};
  const cur = d.log[key] || { n: 0, did: [] };
  if (did) cur.did = [...new Set([String(did).slice(0, 30)].concat(cur.did || []))].slice(0, 8);
  else { cur.n = (+cur.n || 0) + 1; if (via && VIA[via]) { cur.via = cur.via && typeof cur.via === 'object' ? cur.via : {}; cur.via[via] = (+cur.via[via] || 0) + 1; } }
  cur.at = Date.now(); d.log[key] = cur;
  const keys = Object.keys(d.log).sort((a, b) => d.log[b].at - d.log[a].at).slice(0, 150);
  d.log = Object.fromEntries(keys.map(k => [k, d.log[k]])); d.rooms = keys; d.updatedAt = Date.now();
  CLOUD.visits.set(uid, d);
  clearTimeout(visitT); visitT = setTimeout(() => cloudWrite(`visits/${uid}`, CLOUD.visits.get(uid)), 1500);
}
function roomVisitors(key) {
  const out = [];
  CLOUD.visits.forEach((d, uid) => { const v = d && d.log && d.log[key]; if (v && uid !== (CLOUD.me && CLOUD.me.id && iOwnRoom(key) ? CLOUD.me.id : '')) out.push({ uid, at: +v.at || 0, n: +v.n || 1, did: Array.isArray(v.did) ? v.did.map(x => String(x).slice(0, 30)).slice(0, 8) : [], via: v.via && typeof v.via === 'object' ? Object.fromEntries(Object.keys(VIA).map(k => [k, +v.via[k] || 0])) : {}, open: v.open && typeof v.open === 'object' ? { sdk: +v.open.sdk || 0, nosdk: +v.open.nosdk || 0, fail: +v.open.fail || 0 } : null }); });
  return out.sort((a, b) => b.at - a.at);
}
function myUpdates() {
  if (!CLOUD.ready) return { visits: [], msgs: [], replies: [], nudges: [], curations: [], count: 0 };
  const key = myRoomKey(), since = CLOUD.lastSeen, me = CLOUD.me.id;
  const visits = key ? roomVisitors(key).filter(v => v.at > since && v.uid !== me) : [];
  const msgs = key ? roomMessages(key).filter(m => m.author !== me && m.at > since && !m.reply) : [];
  const replies = [];
  CLOUD.msgs.forEach((d, uid) => (Array.isArray(d && d.list) ? d.list : []).forEach(m => { if (m && m.reply && m.reply.to === me && uid !== me && (+m.at || 0) > since) replies.push({ id: m.id, room: String(m.room), text: String(m.text || '').slice(0, 200), at: +m.at || 0, author: uid }); }));
  const nudges = key ? roomMessages(key).filter(m => m.author !== me && m.nudge > since && !m.reply && !hasReply(key, m)) : [];
  const curations = key ? curationsOf(key).filter(c => c.at > since) : [];
  return { visits, msgs, replies, nudges, curations, count: visits.length + msgs.length + replies.length + nudges.length + curations.length };
}
function didText(did, bare) {
  const seen = [], acts = [];
  did.forEach(x => { const m = /^(收藏|改编|试玩) (.+)$/.exec(x); if (m) acts.push(`${m[1]}了「${m[2]}」`); else if (x === '留言') acts.push('留了言'); else if (x === '预约') acts.push('约了时间'); else seen.push(x); });
  const t = [seen.length ? `看了「${seen.slice(0, 2).join('」「')}」` : '', ...acts.slice(0, 2)].filter(Boolean).join('，');
  return bare ? t : ' ' + t;
}
function updatesSentence(u) {
  const parts = [];
  if (u.visits.length) {
    const v = u.visits[0], who = nameOfUid(v.uid);
    parts.push(`${u.visits.length} 位邻居来过${v.did.length ? `，${who}${didText(v.did)}` : ''}`);
  }
  if (u.msgs.length) parts.push(`${u.msgs.length} 条新留言（${nameOfUid(u.msgs[u.msgs.length - 1].author)}：${u.msgs[u.msgs.length - 1].text.slice(0, 16)}${u.msgs[u.msgs.length - 1].text.length > 16 ? '…' : ''}）`);
  if (u.replies.length) parts.push(`${u.replies.length} 条回复你的消息`);
  if (u.nudges && u.nudges.length) parts.push(`${u.nudges.length} 位访客在等你回复`);
  if (u.curations && u.curations.length) { const a = u.curations.filter(c => c.adapted).length, c = u.curations.length - a; parts.push(`你的作品${c ? `被收藏了 ${c} 次` : ''}${c && a ? '，' : ''}${a ? `被改编了 ${a} 次` : ''}`); }
  return parts.length ? `自从你上次来过：${parts.join('，')}。` : '';
}
async function markSeen() {
  if (!CLOUD.ready) return;
  CLOUD.lastSeen = Date.now(); syncChrome();
  try { await CLOUD.db.doc(`data/users/${CLOUD.me.id}/state`).set({ lastSeen: CLOUD.lastSeen }); } catch (e) {}
}
function hasReply(key, m) { return roomMessages(key).some(x => x.reply && x.reply.id === m.id); }
function pendingFor(key) { const me = CLOUD.me && CLOUD.me.id; return roomMessages(key).filter(m => !m.reply && m.author !== me && !hasReply(key, m)); }
function curationsOf(key) {
  const out = [], scan = (uid, items) => { if (uid === key || !Array.isArray(items)) return; items.forEach(i => { const f = i && i.entry && cleanFrom(i.entry.from); if (f && f.room === key) out.push({ uid, title: f.title, adapted: !!f.adapted, at: f.at, mine: String(i.entry.title || '').slice(0, 30) }); }); };
  CLOUD.rooms.forEach((d, uid) => scan(uid, d && d.items));
  if (CLOUD.site) scan('302', CLOUD.site.items);
  return out.sort((a, b) => b.at - a.at);
}
function roomTitleOfKey(k) { if (k && k.startsWith('demo:')) { const r = RESIDENTS.find(x => x.no === k.slice(5)); return r ? `${r.no} ${residentInfo(r).name}` : '一间房'; } if (k === '302') return '302 零点电竞酒吧'; const d = CLOUD.rooms.get(k); return d ? `${String(d.no || '')} ${String(d.name || '')}`.trim() : '一间房'; }
function residentOfKey(k) { if (k && k.startsWith('demo:')) return RESIDENTS.find(r => r.no === k.slice(5) && !r.real); return k === '302' ? RESIDENTS.find(r => r.preset === 'mine') : RESIDENTS.find(r => r.real && r.key === k); }

/* ---------- inbox: visitors, new messages, replies to me ---------- */
function openInbox() {
  if (!CLOUD.ready) return;
  if (S.panel) closePanel(true);
  S.panel = { kind: 'inbox', seen: CLOUD.lastSeen };
  renderInbox();
  setTimeout(markSeen, 1200);
}
function renderInbox() {
  if (!S.panel || S.panel.kind !== 'inbox') return;
  const key = myRoomKey(), since = S.panel.seen, u = (() => { const s = CLOUD.lastSeen; CLOUD.lastSeen = since; const x = myUpdates(); CLOUD.lastSeen = s; return x; })();
  const visitors = key ? roomVisitors(key).filter(v => v.uid !== CLOUD.me.id).slice(0, 30) : [];
  const sentence = updatesSentence(u), curations = key ? curationsOf(key) : [];
  const replies = u.replies.slice().reverse().map(m => `<li class="ib-item"><div><b>${esc(nameOfUid(m.author))}</b> 在「${esc(roomTitleOfKey(m.room))}」回复了你</div><p>${esc(m.text)}</p><small>${esc(ago(m.at))}</small>${residentOfKey(m.room) ? `<button type="button" class="btn sm ghost" data-go="${esc(m.room)}">去看看</button>` : ''}</li>`).join('');
  const vis = visitors.map(v => `<li class="ib-item${v.at > since ? ' new' : ''}"><div><b>${esc(nameOfUid(v.uid))}</b> 来过 ${v.n > 1 ? `${v.n} 次` : ''}</div>${v.did.length ? `<p>${esc(didText(v.did, true))}</p>` : '<p class="mute">在房间里逛了逛</p>'}<small>${esc(ago(v.at))}</small></li>`).join('');
  setPanel('我的动态', key ? '访客簿' : '回复与动态', `
    <div class="bit-say"><div class="bit-face sm" id="ibFace"></div><p>${esc(sentence || (key ? (visitors.length ? '这段时间没有新动静。' : '还没有人来过。新房间先去串串门最有效：邻居会顺着来访记录回访你。') : '你还没有房间。在地球上选个地址入住，邻居们才找得到你。'))}</p></div>
    ${key && !sentence && visitors.length < 3 ? coldStartHTML(key) : ''}
    ${key && visitors.length ? `<p class="section-t">他们从哪里来</p><div class="chiprow">${viaSummary(visitors)}</div>` : ''}
    ${replies ? `<p class="section-t">回复你的消息</p><ul class="ib-list">${replies}</ul><div class="divider"></div>` : ''}
    ${key && curations.length ? `<p class="section-t">被收藏与改编 · ${curations.length}</p><ul class="ib-list">${curations.slice(0, 12).map(c => `<li class="ib-item${c.at > since ? ' new' : ''}"><div><b>${esc(nameOfUid(c.uid))}</b> ${c.adapted ? '改编了' : '收藏了'}「${esc(c.title)}」</div>${c.adapted ? `<p>改编后的名字：${esc(c.mine)}</p>` : ''}<small>${esc(ago(c.at))}</small>${residentOfKey(c.uid) ? `<button type="button" class="btn sm ghost" data-go="${esc(c.uid)}">去 TA 的房间</button>` : ''}</li>`).join('')}</ul><div class="divider"></div>` : ''}
    ${key ? `<p class="section-t">黑板上的留言${key && pendingFor(key).length ? ` · <span class="pending">${pendingFor(key).length} 条等你回复</span>` : ''}</p><div class="gb-list" id="ibThread">${threadHTML(key, { empty: '还没有人留言。', limit: 20 })}</div><div class="divider"></div>
    <p class="section-t">最近来过的人 · ${visitors.length} 位</p>${vis ? `<ul class="ib-list">${vis}</ul>` : '<p class="mute small u-m0">还没有访客。</p>'}
    <p class="mute small u-mt3">访客记录对房间的主人可见，也会作为邻居连线出现在地球上。只能参观的“查看者”不会留下记录。</p>` : ''}`,
    key ? `<button type="button" class="btn primary" id="ibGo">${S.view === 'room' && roomKey(S.room) === key ? '留在房间里' : '回到我的房间'}</button>` : `<button type="button" class="btn primary" id="ibPick">选址入住</button>`);
  $('#ibFace').appendChild(faceCanvas);
  pBody.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const r = residentOfKey(b.dataset.go); if (!r) return; if (S.view === 'globe') diveInto(r); else { closePanel(); toast('出门后在地球上找到它，或者从这里直接过去'); goRoomFromRoom(r); } }));
  if (key) bindReplies(pBody, key, renderInbox);
  bindColdStart(pBody);
  const go = $('#ibGo'); if (go) go.addEventListener('click', () => { const r = myResident(); closePanel(); if (r && !(S.view === 'room' && roomKey(S.room) === key)) { if (S.view === 'globe') diveInto(r); else goRoomFromRoom(r); } });
  const pk = $('#ibPick'); if (pk) pk.addEventListener('click', () => { closePanel(); if (S.view === 'room') exitToGlobe().then(() => $('#pickAddr').click()); else $('#pickAddr').click(); });
}
async function goRoomFromRoom(r) { await exitToGlobe(); S.via = 'room'; diveInto(r); }

/* ---------- hosted single-file works ---------- */
const WORK_MAX = 200 * 1024;
function workPrefix() {
  if (CLOUD.ready && S.room && S.room.id === 'mine' && CLOUD.isOwner) return 'site/room302/works/';
  if (CLOUD.ready && S.room && S.room.uid && S.room.uid === CLOUD.me.id) return `rooms/${CLOUD.me.id}/works/`;
  return 'local:';
}
async function saveWork(path, title, html) {
  if (path.startsWith('local:')) { store.set('gebi3.work.' + path.slice(6), html); return; }
  await cloudWrite(path, { title: String(title).slice(0, 30), html, bytes: html.length, updatedAt: Date.now() });
}
async function loadWork(path) {
  if (path.startsWith('local:')) return store.get('gebi3.work.' + path.slice(6), null);
  if (!CLOUD.ready || !WORK_RE.test(path)) return null;
  try { const s = await CLOUD.db.doc(path).get(); return s.exists ? String(s.data().html || '') : null; } catch (e) { return null; }
}
function kb(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'; }

/* ---------- share card ---------- */
let snapWait = null;
function requestSnapshot() { return new Promise(res => { snapWait = res; }); }
function takeSnapshotIfAsked() { if (!snapWait) return; const r = snapWait; snapWait = null; try { r(canvas.toDataURL('image/jpeg', .92)); } catch (e) { r(null); } }
function loadImg(src) { return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
async function composeCard(shot) {
  const W = 1080, H = 1440, c = mkCanvas(W, H), g = c.getContext('2d'), room = S.room, sky = S.dyn && S.dyn.sky;
  g.fillStyle = TK.bg; g.fillRect(0, 0, W, H);
  const img = await loadImg(shot);
  if (img) { const s = Math.max(W / img.width, 1080 / img.height), dw = img.width * s, dh = img.height * s; g.drawImage(img, (W - dw) / 2, (1080 - dh) / 2, dw, dh); }
  const gr = g.createLinearGradient(0, 640, 0, 1120); gr.addColorStop(0, 'rgba(12,14,19,0)'); gr.addColorStop(1, TK.bg); g.fillStyle = gr; g.fillRect(0, 640, W, 480);
  // 左上角标志：两栋房子，右边那间亮着灯
  g.fillStyle = 'rgba(12,14,19,.78)'; rr(g, 48, 48, 176, 68, 18); g.fill();
  g.save(); g.translate(66, 58); g.scale(1.5, 1.5); g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = TK.text1; g.beginPath(); g.moveTo(3.5, 27.5); g.lineTo(3.5, 14.2); g.lineTo(11, 7.8); g.lineTo(18.5, 14.2); g.lineTo(18.5, 27.5); g.closePath(); g.stroke();
  g.strokeStyle = TK.text2; g.beginPath(); g.moveTo(18.5, 27.5); g.lineTo(18.5, 15.6); g.lineTo(23.5, 11.3); g.lineTo(28.5, 15.6); g.lineTo(28.5, 27.5); g.closePath(); g.stroke();
  g.shadowColor = TK.accent; g.shadowBlur = 8; g.fillStyle = TK.accent; rr(g, 21.3, 18.6, 4.4, 5.2, 1); g.fill(); g.restore();
  g.fillStyle = TK.text1; g.font = `700 36px ${FONT.disp}`; g.textBaseline = 'middle'; g.fillText('隔壁', 126, 83);
  const bx = 64, by = 1060;
  drawPlate(g, bx, by, 206, 104, room.no, 2.2);
  g.fillStyle = TK.text1; g.font = `700 72px ${FONT.disp}`; g.textBaseline = 'middle'; g.fillText(wrapText(g, room.name, 740, 1)[0] || '', bx + 240, by + 46);
  g.fillStyle = TK.text2; g.font = `30px ${FONT.body}`;
  const pubOwner = room.owner !== '你' ? room.owner : room.uid ? String((CLOUD.rooms.get(room.uid) || {}).handle || '') : (CLOUD.ready ? (NAMES.get(CLOUD.me.id) || '房主') : '房主');
  g.fillText(`${room.city || ''} · 房主 ${pubOwner}${sky ? ` · 当地 ${sky.time} ${sky.label}` : ''}`, bx + 232, by + 112);
  const works = [];
  S.roomRoot && S.roomRoot.traverse(o => { const e = entryOf(o); if (e && !['door', 'view', 'music'].includes(e.kind) && e.title) works.push(e.title); });
  let x = bx, y = 1230; g.font = `30px ${FONT.body}`;
  [...new Set(works)].slice(0, 5).forEach(t => { const w = g.measureText(t).width + 44; if (x + w > W - 64) { x = bx; y += 66; } if (y > 1300) return; g.fillStyle = TK.accentSoft; rr(g, x, y - 26, w, 52, 14); g.fill(); g.fillStyle = TK.accentText; g.fillText(t, x + 22, y + 1); x += w + 14; });
  g.fillStyle = TK.line; g.fillRect(bx, 1350, W - bx * 2, 2);
  g.fillStyle = TK.text3; g.font = `26px ${FONT.body}`; g.fillText('隔壁 · 给写代码的人一间房', bx, 1396);
  g.font = `24px ${FONT.mono}`; g.textAlign = 'right'; g.fillText(room.lat != null ? fmtCity(room.lat, room.lon).replace(' · 城市级', '') : '', W - bx, 1396); g.textAlign = 'left';
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
function shareLink() { const k = roomKey(S.room); return SHARE_BASE + (k && /^[A-Za-z0-9._~-]+$/.test(k) ? '#room-' + k + '&from=share' : ''); }
async function openShare() {
  if (S.view !== 'room' || S.busy) return;
  closePanel(true); closeAllWins(); tip.hidden = true; bubble.hidden = true;
  const room0 = S.room, shot = await requestSnapshot();
  if (S.view !== 'room' || S.room !== room0) return;   // 生成卡片时已经离开了房间
  const blob = await composeCard(shot);
  if (S.view !== 'room' || S.room !== room0) return;
  if (!blob) { toast('卡片没生成成功，再试一次'); return; }
  const url = URL.createObjectURL(blob);
  S.panel = { kind: 'share', g: null };
  setPanel('分享 · 房间卡片', S.room.name, `
    <img class="share-img" src="${url}" alt="${esc(S.room.name)} 的分享卡片">
    <div class="field u-mt4"><label for="shareLink">房间链接</label><div class="share-link"><input class="input" id="shareLink" readonly value="${esc(shareLink())}"><button type="button" class="btn" id="copyLink">复制</button></div></div>
    ${shareAccessHTML()}
    <p class="mute small u-mt3">卡片尺寸 1080 × 1440，适合发小红书和朋友圈。链接打开后会直接飞进这间房，来访会记成“分享链接”。</p>`,
    `<button type="button" class="btn primary" id="saveCard">保存图片</button><span class="mute small" id="saveNote"></span>`);
  $('#copyLink').addEventListener('click', () => {
    const inp = $('#shareLink');
    const fallback = () => { inp.focus(); inp.select(); toast('已选中链接，按 Ctrl/⌘ + C 复制'); };
    try { navigator.clipboard.writeText(inp.value).then(() => toast('链接已复制'), fallback); } catch (e) { fallback(); }
  });
  $('#saveCard').addEventListener('click', async () => {
    const note = $('#saveNote');
    let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) {}
    if (!dl) { note.textContent = '这里不能直接保存，右键或长按图片另存。'; return; }
    try { await dl.save({ filename: `隔壁-${S.room.no}-${S.room.name}.png`, data: blob }); note.textContent = '已保存'; }
    catch (e) { const c = e && e.code; note.textContent = c === 'declined' ? '' : c === 'rate_limited' ? '保存框已经打开了' : '这里不能直接保存，右键或长按图片另存。'; }
  });
}

