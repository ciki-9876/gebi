/* ============================================================
   v6 · 体验修复（来自模拟用户体验报告）
   口袋 / 房间名片 / 待上传清单 / SDK 说明 / 冷启动 / 来源统计
   ============================================================ */

/* ---------- 口袋：没有房间、只能参观的人也能收藏 ---------- */
const POCKET = { items: store.get('gebi.pocket', []), cloud: false };
const POCKET_MAX = 40;
function pocketList() { return POCKET.items; }
function pocketPath() { return CLOUD.ready ? `data/users/${CLOUD.me.id}/pocket` : null; }
function cleanPocket(list) {
  return (Array.isArray(list) ? list : []).slice(-POCKET_MAX).map(p => {
    if (!p || typeof p !== 'object' || typeof p.key !== 'string' || !KEY_RE.test(p.key)) return null;
    const e = cleanEntry(p.e, null); if (!e) return null;
    return { e, key: p.key, by: String(p.by || '').slice(0, 20), at: +p.at || 0 };
  }).filter(Boolean);
}
async function loadPocket() {
  POCKET.items = cleanPocket(store.get('gebi.pocket', []));
  if (!CLOUD.ready || !canPost()) { syncPocketBtn(); return; }
  try {
    const s = await CLOUD.db.doc(pocketPath()).get();
    const remote = s.exists ? cleanPocket(s.data().items) : [];
    const merged = remote.concat(POCKET.items.filter(p => !remote.some(q => q.key === p.key && q.e.title === p.e.title)));
    POCKET.items = merged.slice(-POCKET_MAX); POCKET.cloud = true;
    if (merged.length !== remote.length) { await CLOUD.db.doc(pocketPath()).set({ items: POCKET.items, updatedAt: Date.now() }); }
    store.set('gebi.pocket', []);
  } catch (e) { /* 读不到就只用本机的口袋 */ }
  syncPocketBtn();
}
function savePocket() {
  if (POCKET.cloud && CLOUD.ready && canPost()) cloudWrite(pocketPath(), { items: POCKET.items, updatedAt: Date.now() }).catch(() => {});
  else store.set('gebi.pocket', POCKET.items);
  syncPocketBtn();
}
function pocketAdd(ent, ctx) {
  if (POCKET.items.some(p => p.key === ctx.key && p.e.title === ent.title)) { toast('这件已经在你的口袋里了'); return; }
  POCKET.items.push({ e: ent, key: ctx.key, by: ctx.by, at: Date.now() });
  if (POCKET.items.length > POCKET_MAX) POCKET.items.shift();
  savePocket();
  if (!ctx.key.startsWith('demo:')) recordVisit(ctx.key, '收藏 ' + String(ent.title).slice(0, 20));
  const where = POCKET.cloud ? '' : '（只存在这台设备上）';
  toast(canPost() ? `已放进口袋${where}：现在 ${POCKET.items.length} 件。入住后可以一键摆进房间` : `已放进这台设备上的口袋，现在 ${POCKET.items.length} 件`, 3800);
  if (OF.el && !OF.el.hidden) renderObjFeed();
}
function pocketClear() { POCKET.items = []; savePocket(); }
function syncPocketBtn() {
  const b = $('#pocketBtn'); if (!b) return;
  const n = POCKET.items.length; b.hidden = !n; b.querySelector('span').textContent = `口袋 · ${n}`;
}
function pocketIt(p) {
  const r = residentOfKey(p.key);
  return { r, key: p.key, e: p.e, handle: p.by || '邻居', city: r ? residentInfo(r).city : '', real: !p.key.startsWith('demo:'), mine: true, playable: !!embedSource(p.e) };
}
function openPocket() {
  if (S.panel) closePanel(true);
  S.panel = { kind: 'pocket' }; if (S.view === 'globe') G.shiftGoal = isNarrow() ? 0 : -200;
  const list = POCKET.items, room = CLOUD.ready ? myRoomKey() : null;
  const rows = list.slice().reverse().map((p, i) => `<li class="pk"><div class="grow"><b>${esc(p.e.title || '作品')}</b><small>${esc(p.by || '邻居')} · ${esc(KIND_LABEL[p.e.kind] || '作品')} · ${esc(ago(p.at))}</small></div><div class="pk-a">${embedSource(p.e) ? `<button type="button" class="btn sm" data-p="play" data-i="${list.length - 1 - i}">试玩</button>` : ''}<button type="button" class="btn sm ghost" data-p="del" data-i="${list.length - 1 - i}" aria-label="从口袋移除">移除</button></div></li>`).join('');
  const foot = !list.length ? '' : room && canPost() ? `<button type="button" class="btn primary" id="pkPlace">全部摆进我的房间</button>` : canPost() ? `<button type="button" class="btn primary" id="pkPick">选址入住，把它们摆进去</button>` : '';
  setPanel('我的口袋', `收藏了 ${list.length} 件`, `
    <p class="mute small u-mb4">${POCKET.cloud ? '口袋跟着你的账号走，换设备也在。' : '口袋现在只存在这台设备上。'}${room ? '' : '有了房间以后，可以一键把它们摆成展台。'}</p>
    ${list.length ? `<ul class="pk-list">${rows}</ul>` : '<p class="mute">口袋是空的。在别人的房间或物件流里点“☆ 收藏”，作品会先放进这里。</p>'}
    ${CLOUD.ready && !canPost() ? `<div class="callout u-mt4">${VIEWER_NOTE}</div>` : ''}`, foot);
  pBody.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const p = POCKET.items[+b.dataset.i]; if (!p) return;
    if (b.dataset.p === 'del') { POCKET.items.splice(+b.dataset.i, 1); savePocket(); openPocket(); }
    else openQuickPlay(pocketIt(p));
  }));
  const pl = $('#pkPlace'); if (pl) pl.addEventListener('click', async () => {
    pl.disabled = true; let n = 0;
    for (const p of POCKET.items.slice()) {
      const r = await addToMyRoom(items => { const sp = freeSpot(items); return { uid: 'k' + Date.now().toString(36) + n, type: 'keepsake', x: sp.x, z: sp.z, rot: 0, entry: p.e }; },
        i => i.type === 'keepsake' && i.entry && i.entry.from && i.entry.from.room === p.key && i.entry.title === p.e.title);
      if (r) n++;
    }
    pocketClear(); closePanel(); toast(`摆好了 ${n} 件展台，署名都保留着`, 3200);
  });
  const pk = $('#pkPick'); if (pk) pk.addEventListener('click', () => { closePanel(); if (S.view === 'room') exitToGlobe().then(() => $('#pickAddr').click()); else $('#pickAddr').click(); });
}

/* ---------- 查看者与分享：说清楚谁能做什么 ---------- */
const VIEWER_NOTE = '你现在是<b>查看者</b>：能逛、能试玩，收藏会放进这台设备上的口袋。留言、入住和留下来访记录需要“参与者”权限，可以请把链接发给你的人帮你开通。';
function shareAccessHTML() {
  if (!CLOUD.ready) return '<div class="callout">离线原型：这个链接只在线上版本里有效。</div>';
  if (CLOUD.isOwner) return `<div class="callout"><b>谁能打开这个链接</b>由页面右上角的分享菜单决定。建议把同组织的成员设为“可参与”：他们能留言、收藏，来访也会被记录。组织外的人用公开链接打开时只能参观：能逛、能试玩，收藏只存在他们自己的设备上。</div>`;
  return `<div class="callout"><b>谁能打开这个链接</b>${S.room && S.room.mine ? '你的房间' : '这间房'}住在 ${esc(ownerHandle302())} 托管的隔壁页面里。陌生人能不能打开，取决于页面所有者是否开放了公开访问；能打开的人至少可以逛和试玩。</div>`;
}

/* ---------- 房间名片 ---------- */
const OPEN_FOR = { '': '', job: '在看工作机会', collab: '欢迎合作', both: '在看机会 · 欢迎合作' };
const DEFAULT_CARD_302 = { bio: '做「拾光」待办 App 和几个网页小游戏。电竞房里开了间小酒吧，Bit 替我招呼客人。', stack: ['Three.js', 'Electron', '浏览器扩展'], github: '', site: '', contact: '', open: 'collab' };
function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const url = v => validUrl(v) ? String(v).trim().slice(0, 200) : '';
  const o = { bio: String(c.bio || '').slice(0, 80), stack: (Array.isArray(c.stack) ? c.stack : []).map(t => String(t || '').trim().slice(0, 14)).filter(Boolean).slice(0, 5), github: url(c.github), site: url(c.site), contact: String(c.contact || '').slice(0, 60), open: OPEN_FOR[c.open] !== undefined ? c.open : '' };
  return o.bio || o.stack.length || o.github || o.site || o.contact || o.open ? o : null;
}
function cardOf(r) {
  if (!r) return null;
  if (r.real) return cleanCard((CLOUD.rooms.get(r.key) || {}).card);
  if (r.preset === 'mine') return cleanCard(CLOUD.ready ? (CLOUD.site && CLOUD.site.card) : store.get('gebi.card302', null)) || cleanCard(DEFAULT_CARD_302);
  if (r.custom) return cleanCard(CUSTOM[r.no] && CUSTOM[r.no].card);
  return null;   // 演示住户的介绍和标签已经显示在面板上，不再生成名片
}
function cardHTML(r, opts = {}) {
  const c = cardOf(r), mine = residentInfo(r).mine;
  if (!c && !mine) return opts.quiet || !(r.real || r.preset === 'mine' || r.custom) ? '' : '<p class="mute small u-mb3">房主还没写名片。</p>';
  if (!c) return mine ? `<div class="rcard empty"><p>还没有名片。写一句介绍、技术栈和联系方式，来看作品的人才知道你是谁、怎么找你。</p><button type="button" class="btn sm" data-card="edit">写名片</button></div>` : '';
  const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } };
  const contact = c.contact ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact) ? `<a href="mailto:${esc(c.contact)}">${esc(c.contact)}</a>` : esc(c.contact)) : '';
  return `<div class="rcard">${c.open ? `<span class="tag ok">${esc(OPEN_FOR[c.open])}</span>` : ''}
    ${c.bio ? `<p class="rc-bio">${esc(c.bio)}</p>` : ''}
    ${c.stack.length ? `<div class="chiprow">${c.stack.map(t => `<span class="tag dim">${esc(t)}</span>`).join('')}</div>` : ''}
    ${c.github || c.site || contact ? `<dl class="kv">${c.github ? `<dt>GitHub</dt><dd><a href="${esc(c.github)}" target="_blank" rel="noopener noreferrer">${esc(host(c.github) + new URL(c.github).pathname.replace(/\/$/, ''))}</a></dd>` : ''}${c.site ? `<dt>主页</dt><dd><a href="${esc(c.site)}" target="_blank" rel="noopener noreferrer">${esc(host(c.site))}</a></dd>` : ''}${contact ? `<dt>联系</dt><dd>${contact}</dd>` : ''}</dl>` : ''}
    ${c.demo ? '<p class="mute small u-mt2">演示住户的名片由介绍和标签生成。</p>' : ''}
    ${mine && !opts.noEdit ? '<button type="button" class="btn sm ghost" data-card="edit">编辑名片</button>' : ''}</div>`;
}
function bindCard(root) { root.querySelectorAll('[data-card="edit"]').forEach(b => b.addEventListener('click', () => openCardEditor(S.panel && S.panel.r || S.resident))); }
function openCard() {
  const r = S.resident; if (!r || S.view !== 'room') return;
  beginPanel('card', null); S.panel.r = r;
  const info = residentInfo(r), gb = findGroup('chalkboard');
  setPanel(`名片 · ${info.no}`, info.mine && !info.custom ? '你的名片' : info.handle, `
    <div class="unit-hero"><div class="plate-no">${esc(info.no)}</div><div><div class="u-strong">${esc(S.room.name)}</div><div class="mute small">${esc(info.city || '')} · 房主 ${esc(S.room.owner)}</div></div></div>
    ${cardHTML(r)}
    <div class="divider"></div>
    <p class="section-t">房间里的作品</p><ul class="works">${(info.works || []).map(w => `<li><span>${esc(w[0])}</span><span class="tag ${w[1] === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[w[1]] || '作品')}</span></li>`).join('') || '<li class="mute">还没有作品</li>'}</ul>`,
    !info.mine && gb ? `<button type="button" class="btn primary" id="cardMsg">给 TA 留言</button>` : '');
  bindCard(pBody);
  const m = $('#cardMsg'); if (m) m.addEventListener('click', () => activate(gb));
}
function openCardEditor(r) {
  if (!r) return;
  const c = cardOf(r) || {}, cur = c.demo ? {} : c;
  if (S.panel) closePanel(true);
  S.panel = { kind: 'cardEdit', r };
  setPanel('房间名片', '编辑名片', `
    <p class="mute small u-mb4">名片会出现在你的门牌、住户面板和分享出去的房间里。来看作品的招聘方和合作者最先看这里。</p>
    <form id="cardForm">
      <div class="field"><label for="cdBio">一句话介绍</label><textarea class="input" id="cdBio" maxlength="80" rows="2" placeholder="比如：用 AI 写小工具的前端，喜欢做像素风小游戏">${esc(cur.bio || '')}</textarea></div>
      <div class="field"><label for="cdStack">技术栈（用逗号分开，最多 5 个）</label><input class="input" id="cdStack" maxlength="80" value="${esc((cur.stack || []).join('，'))}" placeholder="Three.js，React，Python"></div>
      <div class="field"><label for="cdGh">GitHub</label><input class="input" id="cdGh" inputmode="url" value="${esc(cur.github || '')}" placeholder="https://github.com/你的账号"></div>
      <div class="field"><label for="cdSite">个人主页（选填）</label><input class="input" id="cdSite" inputmode="url" value="${esc(cur.site || '')}" placeholder="https://"></div>
      <div class="field"><label for="cdContact">公开的联系方式（选填）</label><input class="input" id="cdContact" maxlength="60" value="${esc(cur.contact || '')}" placeholder="邮箱或“微信 / 即刻：xxx”"><span class="hint-s">所有能打开隔壁的人都看得到，只填你愿意公开的。</span></div>
      <div class="field"><label>现在的状态</label><div class="seg" id="cdOpen">${Object.entries(OPEN_FOR).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${(cur.open || '') === k}">${v || '不显示'}</button>`).join('')}</div></div>
      <span class="err" id="cdErr" hidden></span>
    </form>`, `<button type="submit" form="cardForm" class="btn primary">保存名片</button>`);
  let open = cur.open || '';
  $('#cdOpen').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; open = b.dataset.v; $('#cdOpen').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#cardForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#cdErr'), gh = $('#cdGh').value.trim(), site = $('#cdSite').value.trim();
    if ((gh && !validUrl(gh)) || (site && !validUrl(site))) { err.textContent = '链接需要以 https:// 开头。'; err.hidden = false; return; }
    const card = cleanCard({ bio: $('#cdBio').value.trim(), stack: $('#cdStack').value.split(/[,，、;；]+/), github: gh, site, contact: $('#cdContact').value.trim(), open }) || {};
    try { await saveCard(r, card); } catch (e) { err.textContent = '没保存成功，稍后再试。'; err.hidden = false; return; }
    toast('名片已保存'); if (S.view === 'room') openCard(); else openResident(r);
  });
}
async function saveCard(r, card) {
  if (r.preset === 'mine') { if (CLOUD.ready && CLOUD.isOwner) await writeSite({ card }); else store.set('gebi.card302', card); return; }
  if (r.real) { const d = clone(CLOUD.rooms.get(r.key) || {}); if (!d.no) throw new Error('no room'); d.card = card; d.updatedAt = Date.now(); CLOUD.rooms.set(r.key, d); await cloudWrite(`rooms/${r.key}`, d); return; }
  if (r.custom && CUSTOM[r.no]) { CUSTOM[r.no].card = card; store.set('gebi3.custom', CUSTOM); }
}

/* ---------- 装修：待上传清单 ---------- */
function pendingWorks() {
  if (!S.room || !S.roomRoot) return [];
  return S.room.items.filter(d => d.entry && BIND_KINDS.includes(d.entry.kind) && !validUrl(d.entry.url) && !d.entry.work && !d.entry.from).map(d => findGroup(d.uid)).filter(Boolean);
}
function renderPendingRow() {
  const row = $('#pendingRow'); if (!row) return;
  const list = S.room && S.room.mine ? pendingWorks() : [];
  row.hidden = !list.length;
  row.innerHTML = list.length ? `<span class="pr-l">待上传 · ${list.length}</span>${list.map(g => `<button type="button" class="pr-i" data-uid="${esc(g.userData.iid)}"><i></i>${esc(entryOf(g).title || nameOf(g))}</button>`).join('')}` : '';
}

/* ---------- 打开结果：用来量“作品成功打开的比例” ---------- */
let openT = 0;
function logOpen(key, outcome) {
  if (!canPost() || !key || iOwnRoom(key) || key.startsWith('demo:')) return;
  const uid = CLOUD.me.id, d = clone(CLOUD.visits.get(uid) || {});
  d.log = d.log && typeof d.log === 'object' ? d.log : {};
  const cur = d.log[key] || { n: 1, did: [], at: Date.now() };
  cur.open = cur.open && typeof cur.open === 'object' ? cur.open : {};
  cur.open[outcome] = (+cur.open[outcome] || 0) + 1; d.log[key] = cur; d.updatedAt = Date.now();
  CLOUD.visits.set(uid, d);
  clearTimeout(openT); openT = setTimeout(() => cloudWrite(`visits/${uid}`, CLOUD.visits.get(uid)), 1500);
}

/* ---------- Bit 给房主的问候：按待回复和最近 24 小时，而不是“是否已读” ---------- */
function ownerGreeting(k) {
  const u = myUpdates(), sum = u.count ? updatesSentence(u) : '', pend = CLOUD.ready ? pendingFor(k).length : 0;
  const day = Date.now() - 864e5, me = CLOUD.me && CLOUD.me.id;
  const v24 = CLOUD.ready ? roomVisitors(k).filter(v => v.at > day && v.uid !== me).length : 0;
  const m24 = CLOUD.ready ? roomMessages(k).filter(m => m.at > day && m.author !== me && !m.reply).length : 0;
  if (sum) return `老板回来啦！${sum}${pend ? `还有 ${pend} 条留言等你回复，` : ''}要不要打开访客簿看看？`;
  if (pend) return `老板回来啦！有 ${pend} 条留言还没回复，访客在等。`;
  if (v24 || m24) return `老板回来啦！过去 24 小时${v24 ? `有 ${v24} 位邻居来过` : ''}${v24 && m24 ? '，' : ''}${m24 ? `收到 ${m24} 条留言` : ''}，你都看过、也都回复了。`;
  return '老板回来啦！这一天店里挺安静。去邻居家串个门，他们会顺着来访记录回访你。';
}

/* ---------- 新住户冷启动 ---------- */
function coldStartHTML(key) {
  const me = myResident(); if (!me) return '';
  const near = nearestResidents(me.lat, me.lon, me.no, 3), joined = inTheme(me, TH.cur.id);
  return `<div class="cold"><p class="section-t">Bit 的建议：先去串这三家</p><ul class="nblist">${near.map(x => { const i = residentInfo(x.r); return `<li><button type="button" class="nb" data-visit="${esc(x.r.no)}"><i style="--c:${residentColor(x.r)}"></i>${esc(i.handle)}<span>${esc(i.city)} · ${kmStr(x.km)}</span></button></li>`; }).join('')}</ul>
    <div class="cold-a">${joined ? '' : `<button type="button" class="btn sm" data-cold="theme">参加本周主题「${esc(TH.cur.title)}」</button>`}<button type="button" class="btn sm ghost" data-cold="share">生成分享卡片</button></div></div><div class="divider"></div>`;
}
function bindColdStart(root) {
  root.querySelectorAll('[data-visit]').forEach(b => b.addEventListener('click', () => {
    const r = RESIDENTS.find(x => x.no === b.dataset.visit); if (!r) return; closePanel(true);
    if (S.view === 'room') goRoomFromRoom(r); else { S.via = 'globe'; diveInto(r); }
  }));
  root.querySelectorAll('[data-cold]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.cold === 'theme') { joinTheme().then(() => renderInbox()); return; }
    closePanel();
    if (S.view === 'room' && iOwnRoom(roomKey(S.room))) openShare(); else toast('回到你的房间，点下方“分享”生成卡片');
  }));
}
function viaSummary(visitors) {
  const tot = {}; visitors.forEach(v => Object.entries(v.via || {}).forEach(([k, n]) => { tot[k] = (tot[k] || 0) + n; }));
  const parts = Object.entries(tot).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  const open = visitors.reduce((a, v) => { if (v.open) { a.ok += v.open.sdk + v.open.nosdk; a.fail += v.open.fail; } return a; }, { ok: 0, fail: 0 });
  return (parts.length ? parts.map(([k, n]) => `<span class="tag dim">${esc(VIA[k])} ${n}</span>`).join('') : '<span class="mute small">来源从这一版开始记录。</span>') + (open.fail ? `<span class="tag pink">外链作品打不开 ${open.fail} 次</span>` : '');
}

/* ---------- SDK 接入说明 ---------- */
const SDK_SNIPPET = `// 隔壁 SDK：粘进你的作品，约 15 行
const gebi = { on: false, origin: '*' };
addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.gebi !== 1 || m.type !== 'hello') return;
  gebi.on = true; gebi.origin = e.origin;
  // m.room = { no, name, owner }  m.entry = { title }  m.data = 房间给的初始数据
  parent.postMessage({ gebi: 1, type: 'ready' }, e.origin);
});
gebi.send = (type, extra) => {
  if (gebi.on) parent.postMessage(Object.assign({ gebi: 1, type }, extra), gebi.origin);
};
// 状态变了，同步给房间里的物件
gebi.send('state', { data: { score: 12 } });
// 在房间里弹一句提示（最多 60 字）
gebi.send('toast', { text: '保存好了' });
// 把画面推到物件屏幕上（游戏建议每秒不超过 12 帧）
createImageBitmap(canvas).then((f) => {
  if (gebi.on) parent.postMessage({ gebi: 1, type: 'screen', frame: f }, gebi.origin, [f]);
});`;
const SDK_DOC = 'https://github.com/ciki-9876/gebi/blob/main/docs/SDK.md';
function openSdkGuide() {
  if (S.win) minimizeWin(S.win, true);
  if (S.panel) closePanel(true);
  S.panel = { kind: 'sdk' };
  setPanel('开发者 · 可选', '接入隔壁 SDK', `
    <p class="u-mb3">不接 SDK，作品照样能在房间里打开。接了以后，房间能确认作品“真的打开了”，桌上的物件也会跟着作品变化。</p>
    <ol class="steps-s"><li><b>握手</b><span>房间打开作品后发来 <code>hello</code>，你回一个 <code>ready</code>。窗口标题栏会变成“已接入”。</span></li>
    <li><b>同步状态</b><span>发 <code>state</code>，物件就能显示比分、待办数这类状态。</span></li>
    <li><b>推送画面</b><span>游戏可以发 <code>screen</code>，把画面推到房间里那台游戏机的屏幕上。</span></li></ol>
    <div class="code-box"><button type="button" class="btn sm" id="sdkCopy">复制代码</button><pre><code>${esc(SDK_SNIPPET)}</code></pre></div>
    <dl class="kv u-mt4"><dt>消息格式</dt><dd><code>{ gebi: 1, type, ... }</code></dd><dt>可用 type</dt><dd><code>ready</code> <code>state</code> <code>screen</code> <code>toast</code> <code>close</code></dd><dt>外链作品</dt><dd>网站需要允许被嵌入：不要设 <code>X-Frame-Options: DENY</code></dd><dt>托管作品</dt><dd>上传的单文件 HTML 跑在沙箱里，没有同源权限，也能用 SDK</dd></dl>`,
    `<a class="btn" href="${SDK_DOC}" target="_blank" rel="noopener noreferrer">完整文档 ${ICON.ext}</a>`);
  $('#sdkCopy').addEventListener('click', () => { try { navigator.clipboard.writeText(SDK_SNIPPET).then(() => toast('代码已复制'), () => toast('复制没成功，手动选中代码复制')); } catch (e) { toast('复制没成功，手动选中代码复制'); } });
}
$('#pocketBtn').addEventListener('click', openPocket);
$('#cardBtn').addEventListener('click', () => { const r = S.resident; if (S.room && S.room.mine && !cardOf(r)) openCardEditor(r); else openCard(); });
$('#cardEditBtn').addEventListener('click', () => openCardEditor(S.resident));
$('#pendingRow').addEventListener('click', e => { const b = e.target.closest('[data-uid]'); if (b) selectItem(findGroup(b.dataset.uid)); });
$('#plate').addEventListener('click', () => { if (S.view === 'room' && S.mode === 'visit' && !S.busy) openCard(); });


/* deck */
const deck = $('#deck');
function openDeck() { deck.hidden = false; deck.scrollTop = 0; if (FP.locked && document.exitPointerLock) document.exitPointerLock(); }
$('#openPlan').addEventListener('click', openDeck);
$('#closePlan').addEventListener('click', () => { deck.hidden = true; canvas.focus({ preventScroll: true }); });
deck.addEventListener('click', e => { const a = e.target.closest('.deck-nav a'); if (!a) return; e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) deck.scrollTo({ top: t.offsetTop - 70, behavior: reduceMotion ? 'auto' : 'smooth' }); });
deck.addEventListener('scroll', () => {
  const links = deck.querySelectorAll('.deck-nav a'); let cur = null;
  links.forEach(a => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t && t.offsetTop - 120 <= deck.scrollTop) cur = a; });
  links.forEach(a => a.classList.toggle('on', a === cur));
}, { passive: true });

/* toast */
let toastT = 0;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

