/* ============================================================
   Panels
   ============================================================ */
const panel = $('#panel'), pEyebrow = $('#pEyebrow'), pTitle = $('#pTitle'), pBody = $('#pBody'), pFoot = $('#pFoot');
const ICON = {
  ext: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: d => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${{ up: 'M10 5l-5 6h10z', down: 'M10 15l-5-6h10z', left: 'M5 10l6-5v10z', right: 'M15 10l-6-5v10z' }[d]}" fill="currentColor"/></svg>`,
  rot: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  del: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
};
function setPanel(eyebrow, title, body, foot) {
  pEyebrow.textContent = eyebrow; pTitle.textContent = title; pBody.innerHTML = body; pFoot.innerHTML = foot || '';
  pBody.scrollTop = 0;
  panel.classList.remove('off');
}
function closePanel(silent) {
  if (!S.panel) return;
  const was = S.panel; S.panel = null; S.focus = null;
  panel.classList.add('off');
  if (was.kind === 'game') { if (game.mode !== 'attract') { game.mode = 'attract'; gReset(); } $('#gameHolder').appendChild(game.c); }
  if (was.kind === 'agent') { $('#gameHolder').appendChild(faceCanvas); }
  if (was.kind === 'inspect') { S.selected = null; if (S.selRing) S.selRing.visible = false; }
  if (S.view === 'globe' && !silent) { G.shiftGoal = homeShift(); if (was.kind === 'address') clearMarker(); }
}
function entryFooter(e, g) {
  const bound = validUrl(e.url);
  const canBind = S.room && S.room.mine;
  let html = bound ? `<a class="btn ${e.open === 'tab' ? 'primary' : ''}" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">新标签页打开 ${ICON.ext}</a>` : '';
  if (!bound && canBind) html += `<button type="button" class="btn" data-act="bind">去绑定地址</button>`;
  return html + curateHTML(e);
}
function bindFooter(g) {
  pFoot.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { setMode('build'); setTimeout(() => selectItem(findGroup(g.userData.iid)), 60); }));
  const e = entryOf(g);
  pFoot.querySelectorAll('[data-act="collect"]').forEach(b => b.addEventListener('click', () => collectEntry(e)));
  pFoot.querySelectorAll('[data-act="adapt"]').forEach(b => b.addEventListener('click', () => adaptEntry(e)));
  pFoot.querySelectorAll('[data-act="author"]').forEach(b => b.addEventListener('click', () => goOrigin(e)));
}
function activate(g) {
  const e = entryOf(g); if (!e) return;
  if (!['door', 'view'].includes(e.kind) && S.room) recordVisit(roomKey(S.room), e.title || nameOf(g));
  bubble.hidden = true;
  switch (e.kind) {
    case 'agent': openAgent(g); break;
    case 'shiguang': if (canEmbed(e)) openWindow(g); else openShiguang(g); break;
    case 'game': if (canEmbed(e)) openWindow(g); else openGame(g); break;
    case 'guestbook': openGuestbook(g); break;
    case 'music': walkTo(g, { panel: false }); toggleMusic(); break;
    case 'door': exitToGlobe(); break;
    case 'view': lookOutside(g); break;
    default: if (isEmptyCarrier(g)) openEmptyCarrier(g); else if (e.art || canEmbed(e)) openWindow(g); else openEntry(g);
  }
}
function beginPanel(kind, g) { if (S.win) minimizeWin(S.win, true); if (S.panel) closePanel(true); S.panel = { kind, g }; S.focus = g; if (g) focusOn(g, { loose: kind === 'agent' }); }

/* ---------- Agent ---------- */
const TARGETS = { shiguang_note: 'pegboard:note', game_console: 'desk:console', guestbook: 'chalkboard', vinyl: 'bar:vinyl', door: 'door', pegboard: 'pegboard', desk: 'desk', bar: 'bar', robot: 'robot' };
function agentRules() {
  const done = SG.tasks.filter(t => t.done).length;
  return `你是“Bit”，一台站在吧台后面的酒保机器人，也是房主在「隔壁」社区里的 AI 助手。「隔壁」是一个让写代码的人把自己的网页作品摆进一间可以走进去的 3D 房间的社区：每个人在地球上选一个真实地址入住，家具就是作品入口，访客从地球上飞过来串门。
你所在的房间：${ME.city} · 302「零点电竞酒吧」，电竞房加小酒吧的风格，右边有一扇窗，窗外就是${ME.city}的街景。你称呼房主为“老板”，现在和你说话的是来串门的访客。
房间里的作品入口（编号 → 内容）：
- shiguang_note：左墙洞洞板上的电子便签，就是老板做的「拾光」。拾光是待办与便签 App，有网页版、Windows 桌面版和 Chrome/Edge 扩展；界面有三套设计语言“轻”“扭蛋”“键”，所有控件都不用浏览器原生样式，桌面版自绘标题栏和托盘菜单。老板今天的待办完成了 ${done}/${SG.tasks.length}。
- game_console：电竞桌上的游戏机，里面是老板写的网页小游戏《霓虹贪吃蛇》，屏幕会自动演示，点开就能玩。
- guestbook：后墙的黑板留言板。
- vinyl：吧台上的唱片机，能放 lo-fi。
- door：门，出去就回到地球，东京的 @pixelmo、柏林的 @byte、成都的 @leafcode 都是邻居。
你的角色是“接待与转达”，不是陪聊：先用一两句话接住访客，带他看感兴趣的作品；只要访客提到想联系老板、合作、提问或见面，就主动用工具帮忙转达，而不是自己替老板回答。
你可以调用工具：focus_object 移动镜头指路，open_entry 打开作品，set_mood 切换灯光，toggle_music 开关音乐，leave_message 把访客的原话贴到黑板，request_appointment 替访客向老板约一个时间，nudge_owner 提醒老板回复访客上一条还没回复的留言（6 小时内只能催一次），owner_pending 仅在对面是老板本人时查看还没回复的留言。
你不替老板社交：不替老板回复，不替老板答应任何事，也不说老板“一定会”怎样。聊了三句还没落到具体事情上，就礼貌地问一句要不要帮他留言或约时间。
回答规则：用中文，口语、俏皮但不油腻，每次 1 到 3 句、不超过 80 个字；只介绍房间里真实存在的东西，不编造作品、数据或链接；不清楚的就说会转告老板。`;
}
function agentTools() {
  const ids = Object.keys(TARGETS);
  return [
    { name: 'focus_object', description: '把访客的镜头移到房间里的某个物件并高亮，用来指路。返回执行结果。', inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ids } }, required: ['target'] }, execute: (i) => { if (!agentFocus(String(i.target))) throw new Error('房间里没有这个物件'); return '镜头已移到 ' + i.target; } },
    { name: 'open_entry', description: '为访客打开一个作品入口：拾光、游戏机或留言黑板。拾光和游戏会以站内窗口运行作品原站，聊天面板会收起，访客点机器人可以回来。', inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ['shiguang_note', 'game_console', 'guestbook'] } }, required: ['target'] }, execute: (i) => { const g = findGroup(TARGETS[String(i.target)]); if (!g) throw new Error('找不到这个入口'); setTimeout(() => activate(g), 500); return '已打开 ' + i.target; } },
    { name: 'set_mood', description: '切换房间灯光氛围：chill 是微醺暖光，party 是派对彩光，focus 是专注冷光。', inputSchema: { type: 'object', properties: { mood: { type: 'string', enum: ['chill', 'party', 'focus'] } }, required: ['mood'] }, execute: (i) => { setMood(String(i.mood)); return '灯光已切换为 ' + i.mood; } },
    { name: 'toggle_music', description: '打开或关闭吧台唱片机的 lo-fi 音乐。', inputSchema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] }, execute: (i) => { const on = i.on === true || i.on === 'true'; if (on !== music.on) toggleMusic(); return on ? '音乐已打开' : '音乐已关闭'; } },
    { name: 'leave_message', description: '访客明确要求给老板留言或转告老板时，把访客的原话贴到后墙黑板上。返回是否成功。不要替访客编写内容。', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '访客要留给老板的原话，最多 120 字' } }, required: ['text'] }, execute: async (i) => { if (!CLOUD.ready) throw new Error('留言板现在离线，只能请访客点后墙的黑板留言'); if (iOwnRoom('302')) throw new Error('现在和你说话的就是老板本人'); const t = String(i.text || '').trim().slice(0, 120); if (!t) throw new Error('留言内容是空的'); const ok = await postMessage('302', t); if (!ok) throw new Error('访客目前只能参观，不能留言'); recordVisit('302', '留言'); return '已贴到黑板上，老板回复后访客会在“动态”里看到'; } },
    { name: 'request_appointment', description: '访客想约老板聊一聊时，替访客向老板预约。when 是访客说的时间，note 是事由原话。会在黑板上留一条带“预约”标记的留言。', inputSchema: { type: 'object', properties: { when: { type: 'string', description: '访客期望的时间，比如“今晚”“这周内”' }, note: { type: 'string', description: '事由，最多 100 字' } }, required: ['when', 'note'] }, execute: async (i) => { if (iOwnRoom(roomKey(S.room))) throw new Error('现在和你说话的就是老板本人'); const t = String(i.note || '').trim().slice(0, 100), w = String(i.when || '时间待定').trim().slice(0, 20); if (!t) throw new Error('事由是空的'); const ok = await relaySend('appt', t, w); if (!ok) throw new Error('访客目前只能参观，没法预约'); relayLog(`已替访客向老板预约「${w}」`); renderRelay(); return '已预约，老板回复后访客会在“动态”里看到'; } },
    { name: 'nudge_owner', description: '提醒老板回复访客上一条还没回复的留言。6 小时内只能催一次。', inputSchema: { type: 'object', properties: {} }, execute: async () => { const r = await relayNudge(); if (r === 'ok') { relayLog('已提醒老板回复'); renderRelay(); return '已提醒老板'; } throw new Error({ cool: '刚催过了，过几个小时再说', none: '访客没有等回复的留言', readonly: '访客目前只能参观', offline: '离线演示里没法催', fail: '没催成功' }[r] || '催不了'); } },
    { name: 'owner_pending', description: '仅当和你说话的是老板本人时，查看还没回复的访客留言。', inputSchema: { type: 'object', properties: {} }, execute: () => { const k = roomKey(S.room); if (!iOwnRoom(k)) throw new Error('只有老板本人可以看'); const l = pendingFor(k); return l.length ? l.slice(-6).map(m => `${nameOfUid(m.author)}：${m.text}${m.kind === 'appt' ? '（预约 ' + m.when + '）' : ''}${m.nudge ? '（催过）' : ''}`).join('；') : '没有等回复的留言'; } }
  ];
}
function agentFocus(target) {
  const iid = TARGETS[target] || target; const g = findGroup(iid); if (!g) return false;
  S.focus = g; focusOn(g, { panel: true });
  logAct('镜头移到「' + (entryOf(g) ? entryOf(g).title : nameOf(g)) + '」');
  return true;
}
function logAct(text) {
  const m = { role: 'act', text }; const i = S.chat.log.length - 1;
  if (i >= 0 && S.chat.log[i].role === 'bit' && !S.chat.log[i].text) S.chat.log.splice(i, 0, m); else S.chat.log.push(m);
  renderChat();
}
function openAgent(g) {
  beginPanel('agent', g);
  const live = !!S.sample;
  setPanel('AI 助手 · 房主配置', '酒保 Bit',
    `<div class="bit-head"><div class="bit-face" id="bitFace"></div><div><div class="bit-name">Bit · 零点酒吧当班</div><div class="bit-status ${live ? 'live' : ''}" id="bitStatus"><i></i><span>${live ? '由 Claude 驱动 · 能操作这个房间' : '离线演示 · 内置台词'}</span></div></div></div>
     <div class="chat" id="chatLog"></div>
     <div class="relay" id="relay"></div>
     <div class="chips" id="chips">${['带我看看拾光', '你的游戏好玩吗？', '来点派对气氛', '放点音乐', '隔壁是什么地方？'].map(t => `<button type="button">${t}</button>`).join('')}</div>`,
    `<form class="composer" id="composer"><input class="input" id="chatInput" autocomplete="off" maxlength="200" placeholder="和 Bit 说点什么…"><button class="btn primary" id="chatSend" type="submit">发送</button></form>`);
  $('#bitFace').appendChild(faceCanvas);
  if (!S.chat.log.length) {
    S.chat.log.push({ role: 'bit', text: iOwnRoom(roomKey(S.room)) ? ownerGreeting(roomKey(S.room)) : '欢迎光临零点酒吧！我是 Bit，负责接待和转达：想看老板的作品我带你去，想对老板说什么、想约个时间，我帮你转达。' });
  }
  renderChat();
  $('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) agentSend(b.textContent); });
  $('#composer').addEventListener('submit', e => { e.preventDefault(); if (S.chat.busy) { if (S.chat.ctl) S.chat.ctl.abort(); return; } const i = $('#chatInput'); const v = i.value; i.value = ''; agentSend(v); });
  setBusy(S.chat.busy);
  S.relayMode = null; renderRelay();
  if (!isNarrow()) setTimeout(() => { const i = $('#chatInput'); if (i && !S.relayMode) i.focus({ preventScroll: true }); }, 380);
}
function renderChat() {
  const log = $('#chatLog'); if (!log) return;
  log.innerHTML = '';
  for (const m of S.chat.log) { const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'me' : m.role === 'act' ? 'act' : 'bit') + (m.typing ? ' typing' : ''); d.textContent = m.text || (m.role === 'bit' ? '…' : ''); m.el = d; log.appendChild(d); }
  pBody.scrollTop = pBody.scrollHeight;
}
function setBusy(b) {
  S.chat.busy = b; const s = $('#chatSend'); if (!s) return;
  s.textContent = b ? (S.chat.ctl ? '停止' : '…') : '发送';
  s.classList.toggle('primary', !b);
}
function updateMsg(m) { if (m.el && m.el.isConnected) { m.el.textContent = m.text || '…'; m.el.classList.toggle('typing', !!m.typing); pBody.scrollTop = pBody.scrollHeight; } }
async function agentSend(text) {
  text = String(text || '').trim(); if (!text || S.chat.busy) return;
  S.chat.log.push({ role: 'user', text });
  const reply = { role: 'bit', text: '', typing: true }; S.chat.log.push(reply);
  renderChat(); robotMood('think'); S.chat.ctl = null; setBusy(true);
  if (S.sample) {
    S.chat.turns.push({ role: 'user', content: text });
    const ctl = new AbortController(); S.chat.ctl = ctl; setBusy(true);
    const opts = { modelTier: 'quick', signal: ctl.signal, onText: ({ text: t }) => { reply.text = t; updateMsg(reply); robotMood('talk'); } };
    if (S.sampleTools) opts.tools = agentTools(); else opts.cache = false;
    try {
      const res = await S.sample([{ role: 'user', content: agentRules() }].concat(S.chat.turns.slice(-10)), opts);
      reply.text = res.text; S.chat.turns.push({ role: 'assistant', content: res.text });
    } catch (e) {
      const code = e && e.code;
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable', 'session_expired'].includes(code)) {
        if (code === 'tools_unavailable') S.sampleTools = false; else S.sample = null;
        S.chat.turns.pop(); updateAgentStatus();
        reply.text = ''; await fallbackReply(text, reply);
      } else if (code === 'cancelled') { reply.text = e.text || '好的，先不说了。'; S.chat.turns.push({ role: 'assistant', content: reply.text }); }
      else if (code === 'rate_limited') reply.text = e.text || '今晚点单的人有点多，过一会儿再来找我聊吧。';
      else if (code === 'refused') reply.text = '这个我不方便聊，换个话题？比如看看老板的作品。';
      else reply.text = (e && e.text) ? e.text + '（信号断了一下）' : '信号断了一下，再说一次？';
    }
  } else {
    await fallbackReply(text, reply);
  }
  reply.typing = false; updateMsg(reply); S.chat.ctl = null; setBusy(false);
  if (!S.relayMode && !iOwnRoom(relayKey()) && S.chat.log.filter(m => m.role === 'user').length === 3 && !S.chat.log.some(m => m.role === 'act' && /已转达|已替访客/.test(m.text))) openRelay('msg');
  robotMood('happy'); setTimeout(() => { if (robotState.mood === 'happy') robotMood('idle'); }, 1600);
}
function scriptReply(t) {
  const has = (re) => re.test(t);
  if (has(/拾光|便签|待办|todo|清单/i)) return { act: () => agentFocus('shiguang_note'), text: `那块洞洞板上的电子便签就是拾光～老板今天完成了 ${SG.tasks.filter(x => x.done).length}/${SG.tasks.length} 条。点它能直接用，还能换“轻 / 扭蛋 / 键”三套皮肤。` };
  if (has(/游戏|玩|贪吃蛇|game/i)) return { act: () => agentFocus('game_console'), text: '桌上那台红色游戏机！老板写的霓虹贪吃蛇，屏幕上一直在自动演示，点开就能接手。' };
  if (has(/派对|party|嗨|蹦迪|彩/i)) return { act: () => setMood('party'), text: '收到，派对模式启动！灯带已经开始转了。' };
  if (has(/专注|安静|冷光|focus|写代码/i)) return { act: () => setMood('focus'), text: '切到专注模式，灯光调冷了，适合写代码。' };
  if (has(/微醺|暖|chill|放松/i)) return { act: () => setMood('chill'), text: '回到微醺暖光，这才是酒吧该有的样子。' };
  if (has(/音乐|歌|lo-?fi|唱片/i)) return { act: () => { if (!music.on) toggleMusic(); agentFocus('vinyl'); }, text: '唱片机转起来了，是老板挑的 lo-fi。再点一下唱片机就能停。' };
  if (has(/预约|约个|约一下|见面|聊聊|合作|面谈/)) return { act: () => openRelay('appt'), text: '好，我帮你约老板。选个时间，写一句事由，我转达给他。' };
  if (has(/催|回复了吗|怎么还没回/)) return { act: null, text: '想催老板的话，点下面的“提醒老板回复”，我帮你提醒一次。' };
  if (has(/留言|黑板|转告|告诉老板/)) return { act: () => openRelay('msg'), text: '行，把你想说的话写在下面，我原话贴到黑板上，老板回复后你会在“动态”里看到。' };
  if (has(/隔壁|平台|社区|街区|邻居/)) return { act: null, text: '隔壁是一颗住满开发者的地球：每人在真实地址有一间房，家具就是作品入口。出门就能飞去东京找 @pixelmo。' };
  if (has(/特调|喝|酒|饮/)) return { act: null, text: '零点特调：一份荧光青柠，一份熬夜，再加一勺上线前的紧张。今晚算我请！' };
  if (has(/你是谁|介绍|hello|hi|你好|嗨/i)) return { act: null, text: '我是 Bit，老板配置的 AI 酒保。可以带你看拾光、玩游戏，或者帮你调灯光和音乐。' };
  return { act: () => { if (!iOwnRoom(relayKey())) openRelay('msg'); }, text: '这个我替老板答不了。要是想问他，下面写一句话，我帮你转达。' };
}
async function fallbackReply(text, reply) {
  const r = scriptReply(text);
  await sleep(450);
  if (r.act) r.act();
  robotMood('talk');
  for (let i = 1; i <= r.text.length; i += 2) { reply.text = r.text.slice(0, i); updateMsg(reply); await sleep(26); }
  reply.text = r.text; updateMsg(reply);
}
function updateAgentStatus() {
  const s = $('#bitStatus'); if (!s) return;
  s.classList.toggle('live', !!S.sample);
  s.querySelector('span').textContent = S.sample ? '由 Claude 驱动 · 能操作这个房间' : '离线演示 · 内置台词';
}

/* ---------- 拾光 ---------- */
function openShiguang(g) {
  beginPanel('shiguang', g);
  const e = entryOf(g);
  setPanel('App · 洞洞板电子便签', '拾光', `
    <p class="mute small u-mb3">${esc(e.desc || '')}</p>
    <div class="sg" id="sg" data-skin="${SG.skin}">
      <div class="sg-skins seg" id="sgSkins">${Object.entries(SKINS).map(([k, v]) => `<button type="button" data-skin="${k}" aria-pressed="${SG.skin === k}">${v.name}</button>`).join('')}</div>
      <div class="sg-app"><div class="sg-top"><b>今天</b><span id="sgCount"></span></div><ul class="sg-list" id="sgList"></ul>
      <form class="sg-add" id="sgAdd"><input id="sgInput" maxlength="40" autocomplete="off" placeholder="添加待办，回车保存"></form></div>
      <div class="sync-note"><i></i>勾选、新增或换皮肤，墙上的电子便签会同步变化。</div>
    </div><div class="divider"></div>${downloadsHTML(e)}`, entryFooter(e, g));
  pBody.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { setMode('build'); setTimeout(() => selectItem(findGroup(g.userData.iid)), 60); }));
  bindFooter(g);
  renderSG();
  $('#sgSkins').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; SG.skin = b.dataset.skin; saveSG(); $('#sg').dataset.skin = SG.skin; $('#sgSkins').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.skin === SG.skin)); drawNote(); });
  $('#sgAdd').addEventListener('submit', ev => { ev.preventDefault(); const i = $('#sgInput'); const v = i.value.trim(); if (!v) return; SG.tasks.unshift({ t: v, done: false }); if (SG.tasks.length > 8) SG.tasks.pop(); i.value = ''; saveSG(); renderSG(); drawNote(); });
}
function renderSG() {
  const ul = $('#sgList'); if (!ul) return;
  ul.innerHTML = SG.tasks.map((t, i) => `<li class="sg-item ${t.done ? 'done' : ''}"><button type="button" role="checkbox" aria-checked="${t.done}" aria-label="完成 ${esc(t.t)}" data-i="${i}">${ICON.check}</button><span>${esc(t.t)}</span></li>`).join('');
  $('#sgCount').textContent = `${DATE_STR} · ${SG.tasks.filter(t => t.done).length}/${SG.tasks.length}`;
  ul.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const t = SG.tasks[+b.dataset.i]; t.done = !t.done; saveSG(); renderSG(); drawNote(); }));
}

/* ---------- game ---------- */
function openGame(g) {
  beginPanel('game', g);
  const e = entryOf(g);
  setPanel('小游戏 · 桌上的游戏机', e.title || '霓虹贪吃蛇', `
    <div class="gm-screen" id="gmScreen"></div>
    <div class="gm-hud"><span>得分 <b id="gmScore">0</b></span><span>最高 <b id="gmBest">${game.best}</b></span></div>
    <div class="gm-pad" id="gmPad">${['up', 'left', 'down', 'right'].map(d => `<button type="button" class="${d}" data-d="${d}" aria-label="${{ up: '上', left: '左', down: '下', right: '右' }[d]}">${ICON.arrow(d)}</button>`).join('')}</div>
    <p class="mute small u-m0">方向键或 WASD 操作。这块画面和房间里那台游戏机的屏幕是同一块，玩的时候可以看看桌上。</p>`, entryFooter(e, g));
  bindFooter(g);
  $('#gmScreen').appendChild(game.c);
  game.mode = 'ready'; gReset(); updateGameHud();
  const D = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  $('#gmPad').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) gInput(D[b.dataset.d]); });
  let sx = 0, sy = 0;
  game.c.onpointerdown = ev => { sx = ev.clientX; sy = ev.clientY; };
  game.c.onpointerup = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { if (game.mode !== 'play') gInput({ x: 1, y: 0 }); return; } gInput(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }); };
}
function updateGameHud() { const s = $('#gmScore'), b = $('#gmBest'); if (s) s.textContent = game.score; if (b) b.textContent = game.best; }

/* ---------- guestbook ---------- */
function openGuestbook(g) {
  const key = CLOUD.ready ? roomKey(S.room) : null;
  if (key) return openCloudGuestbook(g, key);
  beginPanel('guestbook', g);
  const render = () => {
    const list = GB.concat(GB_EXAMPLES);
    $('#gbList').innerHTML = list.map(m => `<div class="gb-item">${esc(m.text)}<small><span>— ${esc(m.name)}</span><span>${esc(m.time)}${m.ex ? ' · 示例' : ''}</span></small></div>`).join('');
  };
  setPanel('留言板 · 后墙黑板', '访客留言', `
    <div class="gb-list" id="gbList"></div>
    <form id="gbForm">
      <div class="field"><label for="gbName">署名</label><input class="input" id="gbName" maxlength="16" placeholder="比如 @你的门牌名" value="${esc(store.get('gebi.gbname', ''))}"></div>
      <div class="field"><label for="gbText">留言</label><textarea class="input" id="gbText" maxlength="60" placeholder="写给房主的话，最多 60 字"></textarea><span class="err" id="gbErr" hidden></span></div>
    </form>`, `<button type="submit" form="gbForm" class="btn primary">贴到黑板上</button><span class="mute small">新留言会出现在黑板最上面</span>`);
  render();
  $('#gbForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('#gbName').value.trim() || '路过的访客', text = $('#gbText').value.trim(), err = $('#gbErr');
    if (!text) { err.textContent = '先写一句留言再贴上去。'; err.hidden = false; return; }
    err.hidden = true;
    GB.unshift({ name, text, time: '刚刚' }); if (GB.length > 20) GB.pop();
    store.set('gebi.guestbook', GB); store.set('gebi.gbname', name);
    $('#gbText').value = ''; render(); drawChalk(); toast('已贴到黑板上');
  });
}

function openCloudGuestbook(g, key) {
  beginPanel('guestbook', g);
  const owner = iOwnRoom(key);
  setPanel('留言板 · 黑板', owner ? '我的留言板' : '给房主留言', `<div class="gb-list" id="gbList"></div>
    ${canPost() ? `<form id="gbForm"><div class="field"><label for="gbText">${owner ? '在自己的黑板上写点什么' : '以你的账号留言，房主可以直接回复你'}</label><textarea class="input" id="gbText" maxlength="120" placeholder="${owner ? '比如：本周在做拾光的托盘菜单' : '写给房主的话，最多 120 字'}"></textarea><span class="err" id="gbErr" hidden></span></div></form>` : '<p class="mute small u-m0">你现在是参观者，可以看留言。留言需要房主把你设为“参与者”。</p>'}`,
    canPost() ? `<button type="submit" form="gbForm" class="btn primary">贴到黑板上</button><span class="mute small">${owner ? '留言下面可以直接回复' : '回复会出现在你的“动态”里'}</span>` : '');
  const render = () => { const l = $('#gbList'); if (!l) return; l.innerHTML = threadHTML(key); bindReplies(l, key, render); };
  S.panel.render = render; render();
  const f = $('#gbForm'); if (f) f.addEventListener('submit', async ev => {
    ev.preventDefault(); const t = $('#gbText').value.trim(), err = $('#gbErr');
    if (!t) { err.textContent = '先写一句再贴上去。'; err.hidden = false; return; }
    err.hidden = true; $('#gbText').value = '';
    if (await postMessage(key, t)) { toast(owner ? '已贴到黑板上' : '已贴到黑板上，房主回复后你会在“动态”里看到'); }
  });
}

/* ---------- generic entry ---------- */
function openEntry(g) {
  beginPanel('entry', g);
  const e = entryOf(g), bound = validUrl(e.url);
  setPanel(`${KIND_LABEL[e.kind] || '作品'} · ${nameOf(g)}`, e.title || '未命名作品', `
    <div class="preview" id="pv"></div>
    ${e.desc ? `<p class="u-mb3">${esc(e.desc)}</p>` : ''}
    <dl class="kv"><dt>房主</dt><dd>${esc(S.room.owner)}</dd>${e.from ? `<dt>${e.from.adapted ? '改编自' : '收藏自'}</dt><dd>${esc(e.from.by || '一位邻居')} 的「${esc(e.from.title)}」${(e.from.chain || []).length ? `<br><span class="mute small">更早：${e.from.chain.map(c => esc(c.by) + '「' + esc(c.title) + '」').join(' → ')}</span>` : ''}</dd>` : ''}<dt>物件</dt><dd>${esc(nameOf(g))}</dd><dt>地址</dt><dd>${bound ? `<span class="u-mono">${esc(e.url)}</span>` : '<span class="mute">还没有绑定</span>'}</dd></dl>
    ${bound ? '' : `<div class="unbound">这个物件还没绑定作品地址。${S.room.mine ? '在建造模式里选中它，填上地址，就能直接在房间里打开。' : '房主绑定后，这里会出现“打开完整版”。'}</div>`}
    ${hasDownloads(e) ? '<div class="divider"></div>' + downloadsHTML(e) : ''}`,
    entryFooter(e, g));
  pBody.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { setMode('build'); setTimeout(() => selectItem(findGroup(g.userData.iid)), 60); }));
  bindFooter(g);
  $('#pv').appendChild(kioskCanvas(e, 768, 420));
}

