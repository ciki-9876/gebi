/* ============================================================
   展厅里的人：谁在场、谁在玩哪件、全场聊天、反馈卡、反馈报告，
   以及给手机用的展品列表页。
   演示访客是本机模拟出来的，名字后面一律带“演示”。
   ============================================================ */
const HALL_BOTS = [['bot-1', '阿橘'], ['bot-2', 'Momo'], ['bot-3', '老周'], ['bot-4', '小鹿'], ['bot-5', 'K']];
const HALL_BOT_LINES = ['「{t}」我玩了三遍', '有人试过「{t}」吗，手感不错', '「{t}」的作者在吗，想问个问题', '刚在「{t}」卡了一下，不过挺上头', '「{t}」适合拿来开场'];
// 示例展位自带的几条反馈，用来预览“我的反馈”和反馈报告长什么样
const HALL_SEED = {
  s1: [
    { by: '老周', like: '星星越落越快的节奏刚好，三十颗左右开始手忙脚乱', tip: '漏掉的时候希望屏幕闪一下，现在不太容易发现自己漏了', tags: ['好玩', '想再玩'] },
    { by: 'Momo', like: '上手零门槛，鼠标一动就知道怎么玩', tip: '可以加一种要躲开的东西，现在只有接这一个动作', tags: ['好玩'] },
    { by: '小鹿', like: '星星的颜色很舒服', tip: '手机上挡板有点窄，手指会挡住视线', tags: ['新奇', '遇到 bug'] },
    { by: 'K', like: '结束画面直接显示接了多少颗，想马上再来一局', tip: '想看到自己的最高纪录', tags: ['想再玩'] }
  ],
  s2: [{ by: '阿橘', like: '限时一分钟这个设定让人很紧张', tip: '球速后期太快，挡板跟不上', tags: ['好玩'] }, { by: 'K', like: '掉球扣时间比直接结束友好', tip: '砖块打完重新出现的时候没有提示', tags: ['没看懂'] }],
  s3: [{ by: '小鹿', like: '四种颜色配得好看', tip: '想要声音，每盏灯一个音', tags: ['想再玩'] }],
  s5: [{ by: 'Momo', like: '每棵树都不一样，点着点着就停不下来', tip: '想保存成图片发给朋友', tags: ['新奇', '想再玩'] }]
};

/* ---------- 界面骨架（只在展厅模式创建） ---------- */
function hallEnsureUi() {
  if (HALL.ui) return;
  const st = document.createElement('div'); st.className = 'stats hall-stats'; st.id = 'hallStats';
  st.innerHTML = `<span><span class="lbl">在场</span> <b id="hsN">1</b></span><span><span class="lbl">已评</span> <b id="hsFb">0/${HALL_NEED}</b></span><span class="demo" id="hsDemo" hidden>含演示访客</span>
    <button type="button" class="like" data-h="fb" id="hsFbGo" hidden></button><button type="button" class="like" data-h="list">展品列表</button><button type="button" class="like" data-h="submit" id="hsSubmit">报名参展</button><button type="button" class="like" data-h="mine">我的反馈</button><button type="button" class="like" data-h="info">活动说明</button>`;
  $('#dock').appendChild(st);
  const hallDo = h => {
    if (h === 'list') hallLiteOpen(); else if (h === 'submit') hallSubmit(); else if (h === 'mine') hallMine(); else if (h === 'info') hallLobby();
    else if (h === 'fb' && HALL.pendingFb) hallFeedback(HALL.pendingFb); else if (h === '3d') hallEnter3D();
  };
  st.addEventListener('click', ev => { const b = ev.target.closest('[data-h]'); if (b && !S.busy) hallDo(b.dataset.h); });
  const tags = document.createElement('div'); tags.className = 'hall-tags'; tags.id = 'hallTags'; tags.setAttribute('aria-hidden', 'true'); document.body.appendChild(tags);
  const chat = document.createElement('section'); chat.className = 'hall-chat'; chat.id = 'hallChat'; chat.setAttribute('aria-label', '全场聊天');
  chat.innerHTML = `<div class="hall-chat-log" id="hcLog" aria-live="polite"></div><form class="composer" id="hcForm" autocomplete="off"><input class="input" id="hcIn" maxlength="80" placeholder="说点什么，全场都看得到" aria-label="全场聊天"><button class="btn sm primary" type="submit">发送</button></form>`;
  document.body.appendChild(chat);
  $('#hcForm').addEventListener('submit', ev => { ev.preventDefault(); const t = $('#hcIn').value.trim(); if (!t) return; $('#hcIn').value = ''; hallSay(t); });
  const lite = document.createElement('section'); lite.className = 'hall-lite'; lite.id = 'hallLite'; lite.hidden = true; lite.setAttribute('aria-label', '展品列表');
  lite.innerHTML = `<header class="of-h"><div><div class="eyebrow" id="hlEyebrow"></div><h2 id="hlTitle"></h2><p id="hlIntro"></p></div><div class="hall-lite-act" id="hlAct"></div></header><div class="of-grid" id="hlGrid"></div><div id="hlChatSlot"></div>`;
  document.body.appendChild(lite);
  lite.addEventListener('click', ev => {
    const h = ev.target.closest('[data-h]'); if (h) { hallDo(h.dataset.h); return; }
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('.oc').dataset.b;
    if (b.dataset.a === 'play') hallPlay(id); else if (b.dataset.a === 'fb') hallFeedback(id);
  });
  HALL.ui = true;
  hallChatRender();
}

/* ---------- 谁在场 ---------- */
// 除了我以外在场的人：别人最近 45 秒内写过位置的，加上演示访客
function hallPeople() {
  const out = [], now = Date.now(), me = CLOUD.ready ? CLOUD.me.id : '';
  HALL.pres.forEach((p, uid) => {
    if (!p || p.ev !== HALL.ev.id || uid === me || now - (+p.at || 0) > 45000) return;
    out.push({ id: uid, name: String(p.n || '').slice(0, 12) || '访客', x: clamp(+p.x || 0, -4.6, 4.6), z: clamp(+p.z || 0, -3.6, 3.6), booth: typeof p.b === 'string' ? p.b.slice(0, 80) : '', list: !!p.l });
  });
  if (HALL.bots) HALL.botList.forEach(b => out.push({ id: b.id, name: b.name, x: b.x, z: b.z, booth: b.booth, demo: true, bot: b }));
  return out;
}
function hallPlayingAt(bid) { return hallPeople().filter(p => p.booth === bid).length + (HALL.playing === bid ? 1 : 0); }
function hallLiveIid(iid) { const bid = HALL.iid2b[iid]; return !!bid && HALL.cnt && HALL.cnt[bid] > 0; }
function hallColor(id) { return '#' + new THREE.Color().setHSL((hash(String(id)) % 360) / 360, .6, .64).getHexString(); }
function hallBoothTitle(bid) { const b = bid && hallBooth(bid); return b ? b.title : ''; }

/* 演示访客：在展位之间走动，站一会儿再换下一个 */
function hallBotsStep() {
  if (!HALL.bots) return;
  if (!HALL.botList.length) HALL_BOTS.forEach(([id, name], i) => { const x = -2.2 + i * 1.1, z = -.9 + (i % 2) * 1.1; HALL.botList.push({ id, name, x, z, tx: x, tz: z, booth: '', goal: '', walking: false, until: Date.now() + 400 + i * 1700 }); });
  const now = Date.now(), ids = Object.keys(HALL.stand);
  HALL.botList.forEach((b, i) => {
    if (b.walking) {                                 // 走到了才算“在玩”，然后站一会儿
      if (!HALL.three) { b.x = b.tx; b.z = b.tz; }
      if (Math.hypot(b.tx - b.x, b.tz - b.z) > .2) return;
      b.walking = false; b.booth = b.goal; b.until = now + 7000 + Math.random() * 14000;
      return;
    }
    if (now < b.until) return;
    b.booth = ''; b.walking = true;
    if (ids.length && Math.random() < .82) {
      b.goal = ids[Math.floor(Math.random() * ids.length)];
      const s = HALL.stand[b.goal], k = (i - 2) * .32;
      b.tx = clamp(s.x + (s.side ? 0 : k), -4.5, 4.5); b.tz = clamp(s.z + (s.side ? k : 0), -3.5, 3.5);
    } else { b.goal = ''; b.tx = -2.4 + Math.random() * 4.8; b.tz = .6 + Math.random() * 2.4; }
  });
  // 偶尔有一位在聊天里说一句
  if (now > (HALL.botSayAt || 0)) {
    HALL.botSayAt = now + 22000 + Math.random() * 26000;
    const at = HALL.botList.filter(b => b.booth);
    if (at.length && HALL.botSayAt0) { const b = at[Math.floor(Math.random() * at.length)], t = hallBoothTitle(b.booth); if (t) { HALL.botChat.push({ id: 'd' + now, uid: b.id, name: b.name, t: HALL_BOT_LINES[Math.floor(Math.random() * HALL_BOT_LINES.length)].replace('{t}', t), at: now, demo: true }); HALL.botChat = HALL.botChat.slice(-12); hallChatRender(); } }
    HALL.botSayAt0 = true;
  }
}

/* 3D 里的人偶和头顶的名字 */
function hallAvatars(people) {
  if (!HALL.three) return;
  const seen = new Set();
  people.forEach(p => {
    if (p.list) return;                              // 在列表页里逛的人没有位置
    seen.add(p.id);
    let a = HALL.av.get(p.id);
    if (!a) {
      const g = new THREE.Group(), col = hallColor(p.id);
      mesh(CY(.15, .24, .96, 16), M(col, .75), 0, .48, 0, g);
      mesh(SPH(.19), M(col, .6), 0, 1.2, 0, g);
      [-.07, .07].forEach(ex => mesh(SPH(.028, 8, 6), M('#14161c', .4), ex, 1.23, .165, g));   // 眼睛朝着走的方向
      g.position.set(p.x, 0, p.z); HALL.avRoot.add(g);
      const el = document.createElement('div'); el.className = 'hall-tag'; $('#hallTags').appendChild(el);
      a = { g, el, col, text: '' }; HALL.av.set(p.id, a);
    }
    a.tx = p.bot ? p.bot.tx : p.x; a.tz = p.bot ? p.bot.tz : p.z; a.bot = p.bot || null;
    const t = hallBoothTitle(p.booth), text = p.name + '|' + (p.demo ? 1 : 0) + '|' + t;
    if (text !== a.text) { a.text = text; a.el.innerHTML = `<i style="--c:${a.col}"></i><b>${esc(p.name)}</b>${p.demo ? '<span>演示</span>' : ''}${t ? `<span>在玩「${esc(t)}」</span>` : ''}`; }
  });
  HALL.av.forEach((a, id) => { if (!seen.has(id)) { HALL.avRoot.remove(a.g); a.el.remove(); HALL.av.delete(id); } });
}
// 每一帧：人偶走向目标位置，名字跟着走
let hallLastF = 0;
function hallFrame() {
  if (!HALL.three) return;
  const now = performance.now(), dt = Math.min(.05, (now - (hallLastF || now)) / 1000); hallLastF = now;
  const hide = S.busy || S.view !== 'room' || !$('#hallLite').hidden || (S.win && S.win.size === 'wide');
  HALL.av.forEach(a => {
    const p = a.g.position, dx = a.tx - p.x, dz = a.tz - p.z, d = Math.hypot(dx, dz);
    if (d > .03) {
      const step = Math.min(d, (a.bot ? 1.15 : Math.max(1.4, d * 2.2)) * dt);
      p.x += dx / d * step; p.z += dz / d * step; p.y = Math.abs(Math.sin(now / 130)) * .035;
      a.g.rotation.y = Math.atan2(dx, dz);
      if (a.bot) { a.bot.x = p.x; a.bot.z = p.z; }
    } else { p.y = 0; if (a.bot && a.bot.goal && a.faced !== a.bot.goal) { a.faced = a.bot.goal; const s = HALL_SLOTS.find(q => Math.hypot(q.x - p.x, q.z - p.z) < 2.2); if (s) a.g.rotation.y = Math.atan2(s.x - p.x, s.z - p.z); } }
    _v.set(p.x, 1.62, p.z);
    const s = toScreen(_v), off = hide || s.z > 1 || s.x < -60 || s.x > innerWidth + 60;
    a.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%)`;
    a.el.style.opacity = off ? '0' : clamp(5.5 / camera.position.distanceTo(_v), .55, 1).toFixed(2);
  });
}
// 把我的位置告诉别人：动了才写，最快 4 秒一次；不动时 20 秒报一次平安
function hallPresence() {
  if (!hallShared()) return;
  const now = Date.now(), last0 = HALL.pres0, inList = !HALL.three || !$('#hallLite').hidden;
  const x = HALL.three ? +FP.pos.x.toFixed(2) : 0, z = HALL.three ? +FP.pos.z.toFixed(2) : 3;
  const moved = Math.hypot(x - last0.x, z - last0.z) > .5 || last0.b !== HALL.playing || last0.n !== HALL.me.name;
  if (!(moved && now - last0.at > 4000) && now - last0.at < 20000) return;
  HALL.pres0 = { x, z, b: HALL.playing, n: HALL.me.name, at: now };
  try { DATA.set(`hallp/${CLOUD.me.id}`, { ev: HALL.ev.id, n: HALL.me.name || '访客', x, z, b: HALL.playing, l: inList ? 1 : 0, at: now }).catch(() => {}); } catch (e) {}
}
// 每秒一次：演示访客做决定、同步人偶、上报位置、刷新数字和展位上的小字
function hallTick() {
  if (!HALL.ui) return;
  hallBotsStep();
  const people = hallPeople();
  HALL.n = people.length; HALL.cnt = {};
  people.forEach(p => { if (p.booth) HALL.cnt[p.booth] = (HALL.cnt[p.booth] || 0) + 1; });
  if (HALL.playing) HALL.cnt[HALL.playing] = (HALL.cnt[HALL.playing] || 0) + 1;
  hallAvatars(people); hallPresence(); hallChrome();
  S.hotspots.forEach(h => {
    const bid = HALL.iid2b[h.iid]; if (!bid) return;
    const sp = h.el.firstChild, n = HALL.cnt[bid] || 0, base = h.el.dataset.t || (h.el.dataset.t = sp.textContent);
    const txt = base + (n ? ` · ${n} 人在玩` : '') + (HALL.me.fb[bid] ? ' · 已评' : '');
    if (sp.textContent !== txt) sp.textContent = txt;
  });
  if (!$('#hallLite').hidden && ++HALL.liteT % 4 === 0 && !/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) hallLiteRender();
}
function hallOnPlay(w) { const bid = w.e && w.e.hid; if (!bid) return; HALL.playing = bid; HALL.playT = Date.now(); HALL.pres0.at -= 4000; }
function hallOnStop(w) {
  const bid = w.e && w.e.hid; if (!bid || bid !== HALL.playing) return;
  const b = hallBooth(bid), long = Date.now() - HALL.playT > 6000;
  HALL.playing = '';
  if (long && b && !b.mine && !HALL.me.fb[bid]) HALL.pendingFb = bid;
  hallChrome();
  if (HALL.dirty) setTimeout(() => hallRebuild(), 50);
}

/* ---------- 全场聊天 ---------- */
function hallChatAll() {
  const out = HALL.botChat.filter(() => HALL.bots).slice();
  const me = CLOUD.ready ? CLOUD.me.id : '';
  HALL.clean.forEach((c, uid) => { if (uid === me) return; c.chat.forEach(m => out.push({ id: uid + m.id, uid, name: c.name || '访客', t: m.t, at: m.at })); });
  if (HALL.me) HALL.me.chat.forEach(m => out.push({ id: 'me' + m.id, uid: hallUid(), name: HALL.me.name || '我', t: m.t, at: m.at, mine: true }));
  return out.sort((a, b) => a.at - b.at).slice(-40);
}
function hallChatRender() {
  const log = $('#hcLog'); if (!log) return;
  const list = hallChatAll(), stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.innerHTML = list.length ? list.map(m => `<p><b style="--c:${hallColor(m.uid)}">${esc(m.name)}${m.demo ? '（演示）' : ''}</b>${esc(m.t)}</p>`).join('') : '<p class="sys">还没有人说话。看到喜欢的作品，在这里喊一声。</p>';
  if (stick) log.scrollTop = log.scrollHeight;
}
function hallSay(t) {
  HALL.me.chat = HALL.me.chat.concat({ id: Date.now().toString(36), t: t.slice(0, 80), at: Date.now() }).slice(-20);
  hallSave(); hallChatRender();
  $('#hcLog').scrollTop = $('#hcLog').scrollHeight;
  if (!hallShared() && !HALL.saidLocal) { HALL.saidLocal = true; toast(CLOUD.ready ? '你现在是查看者，这句话只有你自己看得到' : '单机预览：这句话只有你自己看得到', 3600); }
}

/* ---------- 反馈 ---------- */
function hallGiven() { const mine = hallMyBoothId(); return HALL.me ? Object.keys(HALL.me.fb).filter(k => k !== mine).length : 0; }
function hallReceived(bid) {
  const out = (HALL_SEED[bid] || []).map((f, i) => Object.assign({ demo: true, at: i }, f));
  const me = CLOUD.ready ? CLOUD.me.id : '';
  HALL.clean.forEach((c, uid) => { if (uid !== me && c.fb[bid]) out.push(Object.assign({ by: c.name || '一位访客' }, c.fb[bid])); });
  return out.sort((a, b) => a.at - b.at);
}
function hallFeedback(bid) {
  const b = hallBooth(bid); if (!b) return;
  if (b.mine) { hallMine(); return; }
  const g = HALL.three && S.view === 'room' ? findGroup(hallIid(bid)) : null, cur = HALL.me.fb[bid] || {};
  beginPanel('hallfb', g);
  const tags = new Set(cur.tags || []);
  setPanel(`写反馈 · 作者 ${b.by}`, b.title, `
    <p class="mute small u-mb4">只显示给作者。具体的一句话比打分有用：哪一刻觉得好玩，哪里卡住了。</p>
    <form id="hfForm">
      <div class="field"><label for="hfLike">最打动你的一点</label><textarea class="input" id="hfLike" maxlength="160" rows="3" placeholder="比如：第三关突然变速的那一下，我笑出来了">${esc(cur.like || '')}</textarea></div>
      <div class="field"><label for="hfTip">一个具体的建议</label><textarea class="input" id="hfTip" maxlength="160" rows="3" placeholder="比如：失败之后想直接重开，现在要点两次">${esc(cur.tip || '')}</textarea></div>
      <div class="field"><label>顺手标几个（可以不选）</label><div class="seg" id="hfTags">${HALL_TAGS.map(t => `<button type="button" data-v="${t}" aria-pressed="${tags.has(t)}">${t}</button>`).join('')}</div></div>
      <span class="err" id="hfErr" hidden></span>
    </form>
    ${b.demo ? '<p class="mute small">这是演示展位，没有真实的作者：反馈只计入你的进度。</p>' : ''}`,
    `<button type="submit" form="hfForm" class="btn primary">${cur.at ? '更新反馈' : '交给作者'}</button>`);
  $('#hfTags').addEventListener('click', ev => { const x = ev.target.closest('button'); if (!x) return; const v = x.dataset.v; if (tags.has(v)) tags.delete(v); else tags.add(v); x.setAttribute('aria-pressed', tags.has(v)); });
  $('#hfForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const like = $('#hfLike').value.trim(), tip = $('#hfTip').value.trim(), err = $('#hfErr');
    if ((like + tip).length < 10) { err.textContent = '再写具体一点：两项加起来至少 10 个字。'; err.hidden = false; return; }
    const before = hallGiven();
    HALL.me.fb[bid] = { like: like.slice(0, 160), tip: tip.slice(0, 160), tags: [...tags], at: Date.now() };
    if (HALL.pendingFb === bid) HALL.pendingFb = '';
    hallSave(); closePanel(); hallTick(); hallLiteRender();
    const n = hallGiven(), has = !!HALL.me.booth;
    toast(has && n < HALL_NEED ? `已评 ${n}/${HALL_NEED}，再评 ${HALL_NEED - n} 件就能看自己收到的反馈`
      : has && before < HALL_NEED && n >= HALL_NEED ? `评满 ${HALL_NEED} 件了，点“我的反馈”看看别人怎么说你的作品`
        : b.demo ? `已记下，进度 ${Math.min(n, HALL_NEED)}/${HALL_NEED}（演示展位没有真实作者）` : `反馈已交给 ${b.by}`, 4200);
  });
}
function hallFbHTML(list) {
  return `<ul class="ib-list">${list.map(f => `<li class="ib-item"><b>${esc(f.by)}${f.demo ? ' <span class="tag dim">演示</span>' : ''}</b>${f.like ? `<p>打动 TA 的：${esc(f.like)}</p>` : ''}${f.tip ? `<p>建议：${esc(f.tip)}</p>` : ''}${(f.tags || []).length ? `<small>${f.tags.map(esc).join(' · ')}</small>` : ''}</li>`).join('')}</ul>`;
}
function hallMine() {
  beginPanel('hallmine', null);
  const given = hallGiven(), mineId = hallMyBoothId(), my = HALL.me.booth, left = Math.max(0, HALL_NEED - given);
  const done = Object.keys(HALL.me.fb).filter(k => k !== mineId).map(k => hallBooth(k)).filter(Boolean);
  const got = my ? hallReceived(mineId) : [];
  let mineHtml;
  if (!my) mineHtml = `<p class="mute u-mb3">你还没有展位。报名之后，别人玩过你的作品，留下的话会出现在这里。</p><div class="u-row"><button type="button" class="btn" id="hmSubmit">报名参展</button><button type="button" class="btn ghost" id="hmSample">看一份示例报告</button></div>`;
  else if (left) mineHtml = `<div class="callout"><b>已经收到 ${got.length} 条</b>再评 ${left} 件别人的作品就能打开。大家都先看别人的，每件作品才都有人看。</div>`;
  else if (!got.length) mineHtml = `<p class="mute">「${esc(my.title)}」还没有收到反馈。${hallShared() ? '在聊天里喊一声，请大家来玩。' : '现在是单机预览，别人看不到你的展位。'}</p>`;
  else mineHtml = hallFbHTML(got) + `<button type="button" class="btn u-mt3" id="hmReport">整理成反馈报告</button>`;
  setPanel('我的反馈', `已评 ${Math.min(given, HALL_NEED)}/${HALL_NEED}`, `
    <div class="section-t">我写给别人的</div>
    ${done.length ? `<ul class="works">${done.map(b => `<li><span>${esc(b.title)}</span><span class="mute small">${esc(b.by)}</span></li>`).join('')}</ul>` : '<p class="mute">还没有。玩过一件作品之后，在窗口右上角点“写反馈”。</p>'}
    <div class="divider"></div>
    <div class="section-t">我的展位收到的</div>${mineHtml}`, '');
  const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
  on('hmSubmit', () => hallSubmit()); on('hmSample', () => hallReport('s1')); on('hmReport', () => hallReport(mineId));
}
function hallReportLocal(b, list) {
  const tally = {}; list.forEach(f => (f.tags || []).forEach(t => { tally[t] = (tally[t] || 0) + 1; }));
  const tg = Object.keys(tally).sort((a, c) => tally[c] - tally[a]).map(t => `${t} ×${tally[t]}`).join(' · ');
  return `共 ${list.length} 条反馈${tg ? '\n标签：' + tg : ''}\n\n大家提到的亮点\n${list.filter(f => f.like).map(f => '· ' + f.like).join('\n') || '· 还没有'}\n\n大家给的建议\n${list.filter(f => f.tip).map(f => '· ' + f.tip).join('\n') || '· 还没有'}\n\n（按原话排列，没有经过 AI 总结）`;
}
async function hallReport(bid) {
  const b = hallBooth(bid); if (!b) return;
  const list = hallReceived(bid);
  beginPanel('hallrep', null);
  setPanel('反馈报告' + (b.demo ? ' · 演示数据' : ''), b.title, `<div class="hall-report" id="hrBody">正在整理 ${list.length} 条反馈……</div>`, '<button type="button" class="btn" id="hrBack">回到我的反馈</button>');
  $('#hrBack').addEventListener('click', () => hallMine());
  let text = hallReportLocal(b, list);
  if (S.sample && list.length >= 2) {
    const prompt = `你在帮一位独立开发者读懂一场线上展示活动里收到的玩家反馈。作品叫「${b.title}」，介绍是：${b.desc || '无'}。下面是全部反馈，每条包含“打动”和“建议”。请用中文写一份简短的报告，分三段，每段两到三条，每条一句话：\n一、玩家喜欢什么\n二、玩家卡在哪里\n三、下一版最值得先改的事（按重要程度排）\n只根据反馈里写到的内容，不要补充反馈里没有的事。不要用 Markdown 符号。\n\n` + list.map((f, i) => `${i + 1}. 打动：${f.like || '无'}；建议：${f.tip || '无'}；标签：${(f.tags || []).join('、') || '无'}`).join('\n');
    try { const r = await S.sample(prompt, { modelTier: 'quick' }); if (r && r.text && r.text.trim()) text = r.text.trim().slice(0, 1400) + `\n\n（由 AI 根据 ${list.length} 条反馈整理，原话在“我的反馈”里）`; } catch (e) {}
  }
  const el = $('#hrBody'); if (el && S.panel && S.panel.kind === 'hallrep') el.textContent = text;
}

/* ---------- 展品列表（手机默认看这一页，桌面上也能从数据条打开） ---------- */
function hallFake(b) { const type = b.kind === 'game2' ? 'arcade' : 'kiosk'; return { userData: { fake: true, iid: hallIid(b.id), def: { uid: hallIid(b.id), type, name: '展位', entry: hallEntry(b) }, meta: ITEMS[type] } }; }
function hallPlay(bid) {
  const b = hallBooth(bid); if (!b) return;
  const real = HALL.three && S.roomRoot ? findGroup(hallIid(bid)) : null;
  if (real && S.view === 'room') { hallLiteClose(); activate(real); return; }
  openWindow(hallFake(b));
}
function hallLiteOpen() {
  HALL.liteT = 0; HALL.listOpen = true;
  const el = $('#hallLite'); el.hidden = false;
  $('#hlChatSlot').appendChild($('#hallChat'));
  document.body.classList.add('hall-list');
  if (FP.locked && document.exitPointerLock) document.exitPointerLock();
  hallLiteRender(); el.scrollTop = 0;
}
function hallLiteClose() {
  const el = $('#hallLite'); if (!el || el.hidden) return;
  el.hidden = true; HALL.listOpen = false; document.body.classList.remove('hall-list');
  document.body.appendChild($('#hallChat'));
}
function hallLiteRender() {
  const el = $('#hallLite'); if (!el || el.hidden) return;
  const ev = HALL.ev, booths = hallBooths(), my = HALL.me.booth;
  $('#hlEyebrow').textContent = `线上展厅${ev.demo ? ' · 演示场次' : ''} · 在场 ${HALL.n + 1} 人${HALL.bots && HALL.botList.length ? '（含演示访客）' : ''}`;
  $('#hlTitle').textContent = ev.title; $('#hlIntro').textContent = ev.intro;
  $('#hlAct').innerHTML = `<button type="button" class="btn primary" data-h="3d">${HALL.three ? '回到 3D 展厅' : '进入 3D 展厅'}</button><button type="button" class="btn" data-h="submit">${my ? '我的展位' : '报名参展'}</button><button type="button" class="btn" data-h="mine">我的反馈 · ${Math.min(hallGiven(), HALL_NEED)}/${HALL_NEED}</button><button type="button" class="btn ghost" data-h="info">活动说明</button>`;
  const grid = $('#hlGrid'); grid.innerHTML = '';
  booths.forEach(b => {
    const card = document.createElement('article'); card.className = 'oc'; card.dataset.b = b.id;
    const cv = kioskCanvas(hallEntry(b), 384, 232); cv.className = 'oc-cover'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', b.title); card.appendChild(cv);
    const n = (HALL.cnt && HALL.cnt[b.id]) || 0, done = !!HALL.me.fb[b.id];
    card.insertAdjacentHTML('beforeend', `<div class="oc-b"><div class="oc-t"><b>${esc(b.title)}</b><span class="tag ${b.kind === 'game2' ? 'pink' : ''}">${b.kind === 'game2' ? '小游戏' : '网页作品'}</span></div>
      <p>${esc(b.desc || '作者还没写介绍')}</p>
      <div class="oc-m"><i style="--c:${hallColor(b.owner || b.by)}"></i><span>${esc(b.by)}</span>${b.mine ? '<span class="tag">我的展位</span>' : ''}${n ? `<span class="tag ok">${n} 人在玩</span>` : ''}${done ? '<span class="tag ok">已评</span>' : ''}${b.demo ? '<span class="tag dim">演示</span>' : ''}${b.local ? '<span class="tag dim">只有你看得到</span>' : ''}</div>
      <div class="oc-a"><button type="button" class="btn sm primary" data-a="play">试玩</button><button type="button" class="btn sm" data-a="fb">${b.mine ? '收到的反馈' : done ? '改反馈' : '写反馈'}</button></div></div>`);
    grid.appendChild(card);
  });
}
