/* ============================================================
   展厅模式：一场线上活动就是一间展厅。
   地址带 ?hall（或 #hall，或页面里设了 window.GEBI_HALL）时，
   打开就直接进展厅，不加载地球，也不出现个人房间的入口。
   这个文件：活动数据、展位布置、启动、活动说明、报名参展。
   在场的人、聊天、反馈、手机列表页在 29-hall-social.js。
   数据约定见 docs/ARCHITECTURE.md「展厅模式」。
   ============================================================ */
const HALL_NEED = 3;                       // 评满几件别人的作品，才能看自己收到的反馈
const HALL_TAGS = ['好玩', '新奇', '想再玩', '没看懂', '遇到 bug'];
const HALL_EVENT = {
  id: 'demo-01', demo: true,
  title: '隔壁展示夜 · 演示场',
  host: '主理人（演示）',
  intro: '一间线上展厅：每个展位是一件能直接上手的作品，欢迎用 AI 做的东西。逛一圈，玩一玩，给作者留一句具体的话。',
  theme: { wall: '#1c2030', trim: '#2c3350', floor: 'concrete', floorTint: '#34363f', neon: 'OPEN NIGHT', neonColor: '#62e6d4', arcade: '#2a3052', bean: '#62e6d4', sofa: '#2a2f52', rug: ['#20244a', '#62e6d4', '#ffb454', '#141733'] },
  booths: [
    { id: 's1', sample: 'catch', title: '接星星', by: '阿橘', desc: '左右移动接住落下的星星，越到后面落得越快', kind: 'game2', color: '#3b2a6b' },
    { id: 's2', sample: 'bricks', title: '一分钟打砖块', by: '老周', desc: '限时一分钟的打砖块，掉球会扣时间', kind: 'game2', color: '#7a2f3c' },
    { id: 's3', sample: 'lights', title: '跟我亮灯', by: 'Momo', desc: '记住四盏灯亮起的顺序，一轮比一轮长', kind: 'game2', color: '#1f5a66' },
    { id: 's4', sample: 'reflex', title: '反应力测试', by: '小鹿', desc: '屏幕变绿就点，五次取平均，看看你有多快', kind: 'web', color: '#1f9d6b' },
    { id: 's5', sample: 'trees', title: '点一下长棵树', by: 'K', desc: '每点一下长出一棵不一样的树，慢慢点出一片林子', kind: 'web', color: '#3d5afe' },
    { id: 's6', sample: 'beats', title: '节拍垫', by: '阿橘', desc: '点格子编一段鼓点，按空格播放', kind: 'web', color: '#a83cff' }
  ]
};
// 八个展位的位置。先排后墙一排，再排两侧；靠门的两个留给报名的人
const HALL_SLOTS = [
  { x: -3.6, z: -3.4, rot: 0 }, { x: -1.2, z: -3.4, rot: 0 }, { x: 1.2, z: -3.4, rot: 0 }, { x: 3.6, z: -3.4, rot: 0 },
  { x: -4.3, z: -.7, rot: 1 }, { x: -4.3, z: 1.7, rot: 1 }, { x: 4.3, z: -.7, rot: 3 }, { x: 4.3, z: 1.7, rot: 3 }
];
const HALL_ORDER = [0, 1, 2, 3, 4, 6, 5, 7];

const HALL = {
  on: new URLSearchParams(location.search).has('hall') || /^#hall\b/.test(location.hash) || !!window.GEBI_HALL,
  ev: HALL_EVENT, docs: new Map(), clean: new Map(), pres: new Map(), me: null, loaded: false,
  lite: false, three: false, ui: false, playing: '', playT: 0, pendingFb: '', dirty: false, sig: '',
  bots: store.get('gebi.hall.bots', true), botList: [], botChat: [], av: new Map(), avRoot: null,
  iid2b: {}, stand: {}, cnt: {}, liteT: 0, saveT: 0, pres0: { x: 0, z: 0, b: '', at: 0 }, n: 0
};

/* ---------- 我自己的那份数据 ---------- */
function hallUid() { return CLOUD.ready ? CLOUD.me.id : 'local'; }
function hallShared() { return CLOUD.ready && canPost(); }           // 我写的东西别人看得到吗
function hallMyBoothId() { return 'u-' + hallUid(); }
// 本机存的东西按活动和账号分开，同一个浏览器换账号不会串
function hallKey(k) { return `gebi.hall.${k}.${HALL.ev.id}.${hallUid()}`; }
function hallLoadLocal() {
  const d = store.get(hallKey('me'), null) || {};
  return { ev: HALL.ev.id, name: String(d.name || '').slice(0, 12), booth: d.booth && d.booth.title ? d.booth : null, fb: d.fb && typeof d.fb === 'object' ? d.fb : {}, chat: Array.isArray(d.chat) ? d.chat.slice(-20) : [] };
}
function hallSave() {
  const me = HALL.me; me.ev = HALL.ev.id; me.updatedAt = Date.now();
  store.set(hallKey('me'), me);
  if (!hallShared()) return;
  clearTimeout(HALL.saveT);
  HALL.saveT = setTimeout(() => { cloudWrite(`hall/${CLOUD.me.id}`, clone(HALL.me)).catch(() => {}); }, 400);
}
// 别人的文档先清洗再用：只留认识的字段，每个字段都有长度上限
function cleanHallDoc(d) {
  if (!d || typeof d !== 'object' || d.ev !== HALL.ev.id) return null;
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const o = { name: s(d.name, 12), booth: null, fb: {}, chat: [] };
  if (d.booth && typeof d.booth === 'object' && d.booth.title) o.booth = { title: s(d.booth.title, 30), by: s(d.booth.by, 12), desc: s(d.booth.desc, 80), kind: d.booth.kind === 'game2' ? 'game2' : 'web', at: +d.booth.at || 0, bytes: +d.booth.bytes || 0 };
  if (d.fb && typeof d.fb === 'object') Object.keys(d.fb).slice(0, 60).forEach(k => {
    const f = d.fb[k]; if (!f || typeof f !== 'object' || !/^[A-Za-z0-9_\-.~:@+]{1,80}$/.test(k)) return;
    o.fb[k] = { like: s(f.like, 160), tip: s(f.tip, 160), tags: (Array.isArray(f.tags) ? f.tags : []).filter(t => HALL_TAGS.includes(t)).slice(0, 5), at: +f.at || 0 };
  });
  (Array.isArray(d.chat) ? d.chat : []).slice(-20).forEach(m => { if (m && typeof m.t === 'string' && m.t.trim()) o.chat.push({ id: s(m.id, 16), t: s(m.t, 80), at: +m.at || 0 }); });
  return o;
}

/* ---------- 展位 ---------- */
function hallBooths() {
  const out = HALL.ev.booths.map(b => Object.assign({ demo: true }, b));
  const real = [];
  HALL.clean.forEach((c, uid) => { if (CLOUD.ready && uid === CLOUD.me.id) return; if (c.booth) real.push(Object.assign({ id: 'u-' + uid, owner: uid }, c.booth)); });
  const mine = HALL.me && HALL.me.booth;
  if (mine) real.push(Object.assign({}, mine, { id: hallMyBoothId(), owner: hallUid(), mine: true, local: !hallShared() }));
  real.sort((a, b) => a.at - b.at);
  return out.concat(real);
}
function hallBooth(id) { return hallBooths().find(b => b.id === id) || null; }
function hallIid(id) { return 'b-' + String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60); }
function hallEntry(b) { return { kind: b.kind, title: b.title, desc: b.desc, url: '', work: 'hall:' + b.id, color: b.color, size: 'wide', hall: 'booth', hid: b.id, hby: b.by }; }
function hallItems() {
  const booths = hallBooths(), items = [{ uid: 'rug', type: 'rug', x: 0, z: .3 }];
  HALL.iid2b = {}; HALL.stand = {};
  HALL_ORDER.forEach((si, i) => {
    const s = HALL_SLOTS[si], b = booths[i];
    if (b) {
      const uid = hallIid(b.id), n = [[0, 1], [1, 0], [0, -1], [-1, 0]][s.rot];
      HALL.iid2b[uid] = b.id; HALL.stand[b.id] = { x: s.x + n[0] * 1.35, z: s.z + n[1] * 1.35, side: s.rot % 2 === 1 };
      items.push({ uid, type: b.kind === 'game2' ? 'arcade' : 'kiosk', x: s.x, z: s.z, rot: s.rot, name: '展位', entry: hallEntry(b) });
    } else items.push({ uid: 'slot' + si, type: 'kiosk', x: s.x, z: s.z, rot: s.rot, name: '空展位', entry: { kind: 'link', title: '空展位 · 报名参展', desc: '把你的作品摆在这里', url: '', hall: 'slot' } });
  });
  items.push(
    { uid: 'board', type: 'noticeBoard', x: 3.2, z: 3.1, rot: 2, ry: .75, name: '告示板', entry: { kind: 'doc', title: '活动说明', desc: '', url: '', hall: 'info' } },
    // 休息角放在进门左手边，中间留空给人走动，进门第一眼看到的是展位
    { uid: 'bb1', type: 'beanbag', x: -3.4, z: 3.1, ry: .9 }, { uid: 'bb2', type: 'beanbag', x: -2.3, z: 3.3, ry: -.3 },
    { uid: 'p1', type: 'plant', x: -4.4, z: 3.4 }, { uid: 'lp', type: 'floorLamp', x: -4.4, z: -2.2 }, { uid: 'lp2', type: 'floorLamp', x: 4.4, z: -2.2 },
    { uid: 'neon', type: 'neon', wall: 'back', u: 0, y: 3.7 },
    { uid: 'door', type: 'door', wall: 'front', u: 0, y: 0, entry: { kind: 'door', title: '活动说明 · 出口', desc: '' } }
  );
  return items;
}
function hallRoom() {
  const ev = HALL.ev;
  return { id: 'hall', hall: true, no: '展', name: ev.title, owner: ev.host, city: '线上', lat: 31.23, lon: 121.47, tz: tzFor(31.23, 121.47), mine: false, theme: clone(ev.theme), items: hallItems() };
}
function hallSig() { return hallBooths().map(b => b.id + '|' + b.title + '|' + b.kind + '|' + b.at).join(','); }
// 展位名单变了才重搭。有作品窗口开着时先记下，等窗口关了再搭，免得把正在玩的人打断
function hallRebuild(force) {
  const sig = hallSig();
  if (!force && sig === HALL.sig) return;
  if (WINS.size && !force) { HALL.dirty = true; return; }
  HALL.sig = sig; HALL.dirty = false;
  if (S.room && S.room.hall) {
    S.room.items = hallItems();
    if (S.roomRoot) { S.hover = null; S.focus = null; buildRoom(S.room); }
  }
  hallLiteRender(); hallChrome();
}
// 展位上的作品：示例作品在代码里，自己的在本机留了一份，别人的从共享数据里读
async function hallWork(id) {
  const b = hallBooth(id); if (!b) return null;
  if (b.sample) return HALL_WORKS[b.sample] || null;
  if (b.mine) { const own = store.get(hallKey('work'), null); if (own || b.local) return own; }
  if (!CLOUD.ready) return null;
  try { const d = await DATA.get(`hall/${b.owner}/works/main`); return d ? String(d.html || '') : null; } catch (e) { return null; }
}

/* ---------- 启动 ---------- */
async function hallBoot(prog) {
  document.body.dataset.hall = '1';
  HALL.me = hallLoadLocal();
  HALL.lite = isNarrow() || new URLSearchParams(location.search).get('lite') === '1';
  try { await Promise.race([Promise.all([`14px ${FONT.body}`, `700 28px ${FONT.body}`, `13px ${FONT.mono}`].map(f => document.fonts.load(f, HALL.ev.title + '展位反馈'))), sleep(1800)]); } catch (e) {}
  prog(1);
  drawFace(0); drawCode(0); gDraw();
  hallEnsureUi();
  S.room = hallRoom(); HALL.sig = hallSig();
  setFade(1);
  initCloud().then(hallCloud);
  $('#loader').classList.add('gone');
  setTimeout(() => { $('#loader').hidden = true; }, 700);
  setInterval(hallTick, 1000);
  if (HALL.lite) { S.view = 'lite'; setChromeView('lite'); syncChrome(); hallLiteOpen(); hallLobby(); }
  else await hallEnter3D();
  try { const s = await DATA.sample(); if (s) S.sample = s; } catch (e) {}
}
async function hallEnter3D() {
  hallLiteClose();
  if (HALL.three) return;
  HALL.three = true;
  HALL.avRoot = new THREE.Group(); scene.add(HALL.avRoot);
  const arrived = arriveInRoom(S.room);            // 同步部分已经把房间搭好，之后才能开始渲染
  last = performance.now(); raf = requestAnimationFrame(frame);
  await arrived;
  hallTick();
  if (!HALL.greeted) { HALL.greeted = true; hallLobby(); }
}
function hallCloud() {
  if (!CLOUD.ready) { hallChrome(); return; }
  // 连上之后才知道自己是谁：换成这个账号在本机存的那一份
  const typed = HALL.me.name; HALL.me = hallLoadLocal(); if (!HALL.me.name) HALL.me.name = typed;
  hallRebuild();
  if (S.panel && S.panel.kind === 'hall' && !$('#hlName').value) hallLobby();
  const quiet = () => {};
  DATA.watchCollection('hall', hallOnDocs, quiet);
  DATA.watchCollection('hallp', m => { HALL.pres = m; }, quiet);
  hallChrome();
}
function hallOnDocs(m) {
  HALL.docs = m; HALL.clean = new Map();
  m.forEach((d, uid) => { const c = cleanHallDoc(d); if (c) HALL.clean.set(uid, c); });
  if (!HALL.loaded) {
    // 第一次拿到数据：如果云端有我之前写的，以云端为准，再并上这台设备上还没同步的
    HALL.loaded = true;
    const mine = HALL.clean.get(CLOUD.me.id);
    if (mine && canPost()) { HALL.me.name = HALL.me.name || mine.name; HALL.me.booth = HALL.me.booth || mine.booth; HALL.me.fb = Object.assign({}, mine.fb, HALL.me.fb); if (!HALL.me.chat.length) HALL.me.chat = mine.chat; }
  }
  hallRebuild(); hallChatRender(); hallChrome(); hallLiteRender();
  if (S.panel && S.panel.kind === 'hallmine') hallMine();
}

/* ---------- 物件被点到 ---------- */
function hallActivate(g, e) {
  if (e.kind === 'door') { hallLobby(); return true; }
  if (e.hall === 'info') { hallLobby(g); return true; }
  if (e.hall === 'slot') { hallSubmit(g); return true; }
  return false;                                    // 展位走原来的作品窗口
}
function hallModeNote() {
  if (!CLOUD.ready) return '<b>单机预览</b>这一页现在没有连上共享数据：你看到的访客是模拟出来的，反馈和展位只存在这台设备上。';
  if (!canPost()) return '<b>你现在是查看者</b>能逛、能玩。你写的反馈和报名的展位只存在这台设备上，别人看不到。';
  return '<b>多人模式</b>其他人能看到你在展厅里的位置、你说的话和你的展位。你写的反馈只显示给那件作品的作者。';
}

/* ---------- 活动说明 ---------- */
function hallLobby(g) {
  beginPanel('hall', g || null);
  const ev = HALL.ev;
  setPanel('线上展厅' + (ev.demo ? ' · 演示场次' : ''), ev.title, `
    <p class="u-mb3">${esc(ev.intro)}</p>
    <ol class="steps-s">
      <li><b>逛展位</b><span>${HALL.lite ? '点“试玩”' : '走到展位前点一下'}，作品直接在这里打开，不用下载。</span></li>
      <li><b>写反馈</b><span>玩过之后写一两句具体的感受，哪一刻好玩、哪里卡住了。</span></li>
      <li><b>评满 ${HALL_NEED} 件</b><span>评满 ${HALL_NEED} 件别人的作品，就能看到自己的展位收到了什么。</span></li>
    </ol>
    <div class="field"><label for="hlName">你在展厅里的名字</label><input class="input" id="hlName" maxlength="12" value="${esc(HALL.me.name)}" placeholder="比如：做像素游戏的阿橘"></div>
    <label class="check"><input type="checkbox" id="hlBots"${HALL.bots ? ' checked' : ''}>显示演示访客（模拟出来的人，方便一个人预览）</label>
    <div class="callout">${hallModeNote()}</div>
    ${ev.demo ? '<p class="mute small u-mt3">这是演示场次：六件展品和它们的作者都是演示数据。</p>' : ''}`,
    `<button type="button" class="btn primary" id="hlGo">开始逛展</button><button type="button" class="btn" id="hlList">${HALL.lite && !$('#hallLite').hidden ? '进入 3D 展厅' : '展品列表'}</button>`);
  const saveName = () => { const v = $('#hlName').value.trim().slice(0, 12); if (v !== HALL.me.name) { HALL.me.name = v; hallSave(); } };
  $('#hlName').addEventListener('change', saveName);
  $('#hlBots').addEventListener('change', ev2 => { HALL.bots = ev2.target.checked; store.set('gebi.hall.bots', HALL.bots); hallTick(); });
  $('#hlGo').addEventListener('click', () => { saveName(); closePanel(); });
  $('#hlList').addEventListener('click', () => { saveName(); closePanel(); if (HALL.lite && !$('#hallLite').hidden) hallEnter3D(); else hallLiteOpen(); });
}

/* ---------- 报名参展：一人一个展位，放一个单文件网页 ---------- */
function hallSubmit(g) {
  beginPanel('hallsub', g || null);
  const cur = HALL.me.booth || {}, has = !!HALL.me.booth;
  let kind = cur.kind === 'game2' ? 'game2' : 'web', html = '';
  setPanel('报名参展', has ? '更新我的展位' : '把作品摆进展厅', `
    <p class="mute small u-mb4">一个人一个展位，放一个单文件网页（.html，不超过 200 KB）。用 AI 做的完全欢迎。作品在隔离的窗口里运行，碰不到别人的数据。</p>
    <form id="hsForm">
      <div class="field"><label for="hsTitle">作品名</label><input class="input" id="hsTitle" maxlength="30" value="${esc(cur.title || '')}" placeholder="比如：深夜便利店收银模拟器"></div>
      <div class="field"><label for="hsBy">作者署名</label><input class="input" id="hsBy" maxlength="12" value="${esc(cur.by || HALL.me.name)}" placeholder="展位上显示的名字"></div>
      <div class="field"><label for="hsDesc">一句话介绍</label><textarea class="input" id="hsDesc" maxlength="80" rows="2" placeholder="它是什么，怎么玩">${esc(cur.desc || '')}</textarea></div>
      <div class="field"><label>类型</label><div class="seg" id="hsKind"><button type="button" data-v="game2" aria-pressed="${kind === 'game2'}">小游戏</button><button type="button" data-v="web" aria-pressed="${kind === 'web'}">网页或工具</button></div></div>
      <div class="field"><label for="hsFile">作品文件</label><input class="input" type="file" id="hsFile" accept=".html,.htm,text/html"><span class="hint-s" id="hsFileNote">${has ? '不选文件就沿用现在的版本（' + kb(cur.bytes || 0) + '）。' : '也可以把 AI 给你的整段 HTML 粘到下面。'}</span></div>
      <div class="field"><label for="hsHtml">或者粘贴 HTML</label><textarea class="input u-mono" id="hsHtml" rows="4" spellcheck="false" placeholder="&lt;!doctype html&gt; …"></textarea></div>
      <span class="err" id="hsErr" hidden></span>
    </form>
    <div class="callout">${hallModeNote()}</div>`,
    `<button type="submit" form="hsForm" class="btn primary">${has ? '保存展位' : '摆进展厅'}</button>${has ? '<button type="button" class="btn ghost" id="hsDrop">撤下展位</button>' : ''}`);
  $('#hsKind').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; kind = b.dataset.v; $('#hsKind').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#hsFile').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { html = await f.text(); } catch (e) { html = ''; }
    $('#hsFileNote').textContent = html ? `已读取 ${f.name}（${kb(html.length)}）` : '这个文件读不出来，换一个试试。';
    if (html && !$('#hsTitle').value.trim()) $('#hsTitle').value = (titleFromText(html, 'web') || baseName(f.name)).slice(0, 30);
  });
  const drop = $('#hsDrop');
  if (drop) drop.addEventListener('click', () => { HALL.me.booth = null; hallSave(); closeAllWins(); hallRebuild(true); closePanel(); toast('展位已撤下，文件还留在这台设备上，随时可以重新摆出来'); });
  $('#hsForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#hsErr'), fail = t => { err.textContent = t; err.hidden = false; };
    const title = $('#hsTitle').value.trim(), by = $('#hsBy').value.trim() || HALL.me.name || '匿名作者', desc = $('#hsDesc').value.trim();
    const src = html || $('#hsHtml').value.trim();
    if (!title) return fail('先给作品起个名字。');
    if (!src && !has) return fail('还没有作品文件：选一个 .html 文件，或者把 HTML 粘进来。');
    if (src && !/<[a-z!]/i.test(src)) return fail('这看起来不是网页：需要一个完整的 HTML 文件。');
    if (src.length > WORK_MAX) return fail(`文件有 ${kb(src.length)}，超过 200 KB。把图片换成外链，或者压缩一下再试。`);
    const booth = { title: title.slice(0, 30), by: by.slice(0, 12), desc: desc.slice(0, 80), kind, at: cur.at || Date.now(), bytes: src ? src.length : (cur.bytes || 0) };
    if (src) {
      store.set(hallKey('work'), src);
      if (hallShared()) { try { await cloudWrite(`hall/${CLOUD.me.id}/works/main`, { title: booth.title, html: src, bytes: src.length, updatedAt: Date.now() }); } catch (e) { return fail('没保存成功，稍后再试一次。'); } }
    }
    HALL.me.booth = booth; if (!HALL.me.name) HALL.me.name = booth.by;
    hallSave(); closeAllWins(); hallRebuild(true); closePanel();
    const inRoom = S.roomRoot && findGroup(hallIid(hallMyBoothId()));
    toast(inRoom ? `「${booth.title}」已经摆进展厅${hallShared() ? '' : '（只有你自己看得到）'}` : `「${booth.title}」已报名。展厅里的 ${HALL_SLOTS.length} 个展位满了，它在“展品列表”里`, 4200);
    if (inRoom && HALL.three && S.view === 'room') walkTo(inRoom, { panel: false });
  });
}

/* ---------- 顶栏和数据条 ---------- */
function hallChrome() {
  if (!HALL.ui) return;
  const ev = HALL.ev, booths = hallBooths(), given = hallGiven();
  $('#plateNo').textContent = '展'; $('#plateName').textContent = ev.title;
  $('#plateSub').textContent = `线上展厅 · ${booths.length} 件展品 · ${ev.host}`;
  $('#hsN').textContent = HALL.n + 1;
  $('#hsFb').textContent = `${Math.min(given, HALL_NEED)}/${HALL_NEED}`;
  $('#hsDemo').hidden = !(HALL.bots && HALL.botList.length);
  $('#hsSubmit').textContent = HALL.me && HALL.me.booth ? '我的展位' : '报名参展';
  const pb = HALL.pendingFb && hallBooth(HALL.pendingFb), go = $('#hsFbGo');
  go.hidden = !pb; if (pb) go.textContent = `写「${pb.title}」的反馈`;
}
