/* ============================================================
   Home (globe) interface
   ============================================================ */
const FEED_POOL = [
  ['204', '更新了「像素躲避球」v0.3'], ['303', '在黑板上回复了 @pixelmo'], ['101', '给「浇水提醒」加了下雨天模式'], ['102', '开张了，今晚第一杯免费'],
  ['202', '把极光数据接进了「会唱歌的天气」'], ['104', '给调度台加了雪天限速'], ['106', '录了一段新的浪花采样'], ['110', '冲洗了今晚的第一张极光'],
  ['105', '「早高峰」新增了换乘关卡'], ['108', '咖喱 Agent 学会了做素食版'], ['107', '鼓点编辑器支持导出 MIDI 了'], ['109', '开了一节免费的节奏课'], ['301', '「每日一句」换上了打字机音效']
];
const feedEl = $('#feedList');
let feedN = 0;
function pushFeed(item, ago) {
  const r = RESIDENTS.find(x => x.no === item[0]); if (!r) return;
  const info = residentInfo(r);
  const li = document.createElement('li');
  li.innerHTML = `<button type="button"><small>${esc(ago)} · ${esc(info.city)}</small><span><b>${esc(info.handle)}</b> ${esc(item[1])}</span></button>`;
  const btn = li.querySelector('button');
  btn.addEventListener('click', () => { if (!S.busy) openResident(r); });
  const hot = on => { G.feedHot = on ? { r, until: Infinity } : null; };
  btn.addEventListener('pointerenter', () => hot(true)); btn.addEventListener('pointerleave', () => hot(false));
  btn.addEventListener('focus', () => hot(true)); btn.addEventListener('blur', () => hot(false));
  li._r = r;
  feedEl.prepend(li); while (feedEl.children.length > 4) feedEl.lastChild.remove();
  if (ago === '刚刚' && S.view === 'globe') G.feedHot = { r, until: performance.now() + 4200 };   // 新动态到达：引线亮 4 秒
  if (ago === '刚刚' && S.view === 'globe' && G.ready) ripple(latLonToVec(r.lat, r.lon));
  layoutOrbit();
}
function startFeed() {
  [['110', '42 分钟前'], ['202', '25 分钟前'], ['101', '11 分钟前'], ['303', '4 分钟前'], ['204', '1 分钟前']].forEach(([no, ago]) => pushFeed(FEED_POOL.find(f => f[0] === no), ago));
  setInterval(() => { if (document.hidden || S.view !== 'globe') return; feedN = (feedN + 1) % FEED_POOL.length; pushFeed(FEED_POOL[(feedN * 5) % FEED_POOL.length], '刚刚'); }, 7000);
}
function tickClock() {
  const s = sunInfo(), u = new Date();
  const hh = String(u.getUTCHours()).padStart(2, '0'), mm = String(u.getUTCMinutes()).padStart(2, '0');
  const me = localSky(ME.lat, ME.lon, tzFor(ME.lat, ME.lon));
  $('#gclock').innerHTML = `<i></i>实时昼夜 · UTC ${hh}:${mm} · ${esc(ME.city)} ${me.time}`;
  updateSun();
}
/* search */
const gsIn = $('#gsearchIn'), gsSugg = $('#gsugg');
// 繁体 / 日文汉字 → 简体，只覆盖城市名里常见的字
const HANZI = { 東: '东', 臺: '台', 灣: '湾', 爾: '尔', 蘭: '兰', 華: '华', 倫: '伦', 約: '约', 紐: '纽', 舊: '旧', 聖: '圣', 羅: '罗', 馬: '马', 漢: '汉', 溫: '温', 哥: '哥', 廣: '广', 門: '门', 島: '岛', 濱: '滨', 莊: '庄', 慶: '庆', 陽: '阳', 寧: '宁', 蘇: '苏', 鄭: '郑', 瀋: '沈', 嶺: '岭', 葉: '叶', 達: '达', 亞: '亚', 歐: '欧', 雪: '雪', 澳: '澳', 灘: '滩', 屋: '屋', 阪: '阪', 橫: '横', 横: '横', 濟: '济', 豐: '丰', 鹽: '盐', 長: '长', 開: '开', 雲: '云', 貝: '贝', 維: '维', 納: '纳', 薩: '萨', 斯: '斯', 黎: '黎', 遜: '逊', 頓: '顿', 賓: '宾', 圖: '图' };
const normQ = q => q.trim().toLowerCase().replace(/[\u3400-\u9fff]/g, c => HANZI[c] || c);
function searchMatches(q) {
  q = normQ(q); if (!q) return [];
  const res = [], seen = new Set();
  const addR = (r, sub) => { if (seen.has(r)) return; seen.add(r); const i = residentInfo(r); res.push({ type: 'r', r, label: `${i.handle} · ${i.name}`, sub: sub || `${i.city} · ${r.no}` }); };
  const cities = CITIES.filter(c => [c.zh, c.en, c.country].some(s => normQ(s).includes(q)));
  // 搜城市时先给出住在那里的人，再给出“在这里选址”
  cities.slice(0, 2).forEach(c => RESIDENTS.filter(r => r.city === c.zh).forEach(r => addR(r, `住在${c.zh} · ${r.no}`)));
  RESIDENTS.forEach(r => { const i = residentInfo(r); if ([i.handle, i.name, i.city, r.no].some(s => s && normQ(String(s)).includes(q))) addR(r); });
  cities.forEach(c => res.push({ type: 'c', c, label: c.zh, sub: `${c.country} · ${c.en} · 在这里选址` }));
  return res.slice(0, 8);
}
function renderSugg() {
  const m = searchMatches(gsIn.value);
  gsSugg.hidden = !m.length;
  gsSugg.innerHTML = m.map((x, i) => `<li><button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}"><b>${esc(x.label)}</b><span>${esc(x.sub)}</span>${x.type === 'r' ? '<em>住户</em>' : ''}</button></li>`).join('');
  gsSugg._m = m;
}
function chooseSugg(x) {
  if (!x) return; gsSugg.hidden = true; gsIn.value = ''; gsIn.blur();
  if (x.type === 'r') openResident(x.r, 'search'); else openAddress(x.c.lat, x.c.lon);
}
gsIn.addEventListener('input', renderSugg);
gsIn.addEventListener('focus', renderSugg);
gsIn.addEventListener('blur', () => setTimeout(() => { gsSugg.hidden = true; }, 150));
gsSugg.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); chooseSugg(gsSugg._m[+b.dataset.i]); } });
$('#gsearch').addEventListener('submit', e => { e.preventDefault(); const m = searchMatches(gsIn.value); if (m.length) chooseSugg(m[0]); else if (gsIn.value.trim()) toast('没找到这个城市，换个写法试试，比如“东京”或“Tokyo”'); });

/* resident card */
function nearestResidents(lat, lon, skipNo, n = 3) {
  return RESIDENTS.filter(r => r.no !== skipNo).map(r => ({ r, km: gcDist({ lat, lon }, r) })).sort((a, b) => a.km - b.km).slice(0, n);
}
function kmStr(km) { return km < 10 ? km.toFixed(1) + ' 公里' : km < 1000 ? Math.round(km) + ' 公里' : (km / 1000).toFixed(1) + ' 千公里'; }
function skyChip(sky) { return `<span class="sky sky-${sky.phase}"><i></i>当地 ${sky.time} · ${sky.label}</span>`; }
function openResident(r, via) {
  const info = residentInfo(r);
  if (S.panel) closePanel(true);
  S.panel = { kind: 'resident', r, via: via || 'globe' }; G.hover = null;
  G.shiftGoal = isNarrow() ? 0 : -200;
  clearMarker();
  flyGlobe(r.lat, r.lon, isNarrow() ? 2.6 : 2.25, 1.5);
  ripple(latLonToVec(r.lat, r.lon));
  const sky = localSky(r.lat, r.lon, tzFor(r.lat, r.lon));
  const works = (info.works || []).map(w => `<li><span>${esc(w[0])}</span><span class="tag ${w[1] === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[w[1]] || '作品')}</span></li>`).join('');
  const near = nearestResidents(r.lat, r.lon, r.no).map(x => { const i = residentInfo(x.r); return `<li><button type="button" class="nb" data-no="${esc(x.r.no)}"><i style="--c:${residentColor(x.r)}"></i>${esc(i.handle)}<span>${esc(i.city)} · ${kmStr(x.km)}</span></button></li>`; }).join('');
  const st = rng(hash(r.no));
  setPanel(`${info.city} · ${info.no}`, info.name || '未命名房间', `
    <div class="unit-hero"><div class="plate-no">${esc(info.no)}</div><div><div class="u-strong">${esc(info.mine && !info.custom ? '你的房间' : info.handle)}</div><div class="mute small">${esc(info.tagline || '')}</div></div></div>
    <div class="chiprow">${skyChip(sky)}${(info.tags || []).map(t => `<span class="tag dim">${esc(t)}</span>`).join('')}${info.state === 'reno' ? '<span class="tag pink">装修中</span>' : ''}${info.demo ? '<span class="tag dim">演示住户</span>' : ''}</div>
    <p class="coord">${fmtCity(r.lat, r.lon)}</p>
    ${cardHTML(r)}
    ${works ? `<p class="section-t">房间里的作品</p><ul class="works">${works}</ul>` : ''}
    <div class="divider"></div>
    <p class="section-t">离得最近的邻居</p><ul class="nblist">${near}</ul>
    <div class="divider"></div>
    ${CLOUD.ready && keyOfResident(r) ? `<dl class="kv"><dt>来过的人</dt><dd>${roomVisitors(keyOfResident(r)).length} 位</dd><dt>留言</dt><dd>${roomMessages(keyOfResident(r)).filter(m => !m.reply).length} 条</dd></dl>` : `<dl class="kv"><dt>本周访客</dt><dd>${80 + Math.floor(st() * 900)} <span class="mute small">（演示数据）</span></dd><dt>点亮</dt><dd>${20 + Math.floor(st() * 400)}</dd></dl>`}`,
    info.state === 'reno' ? `<button type="button" class="btn" disabled>装修中，暂不开放</button>` :
      `<button type="button" class="btn primary" id="enterUnit">${info.mine ? '回到我的房间' : '敲门进去'}</button>${info.mine && !info.custom && (!CLOUD.ready || canPost()) ? '<button type="button" class="btn ghost" id="moveHome">搬家</button>' : ''}`);
  const b = $('#enterUnit'); if (b) b.addEventListener('click', () => { S.via = via || 'globe'; diveInto(r); });
  const mv = $('#moveHome'); if (mv) mv.addEventListener('click', startMove);
  bindCard(pBody);
  pBody.querySelectorAll('.nb').forEach(x => x.addEventListener('click', () => { const o = RESIDENTS.find(y => y.no === x.dataset.no); if (o) openResident(o); }));
}
function startMove() {
  closePanel(); G.moving = true;
  $('#gbanner').hidden = false; $('#gbanner').querySelector('span').textContent = '搬家中：点地球上任意一块陆地，把你的房间搬过去';
}
function stopMove() { G.moving = false; $('#gbanner').hidden = true; }
$('#gbannerX').addEventListener('click', () => { stopMove(); clearMarker(); });

/* address card: pick a spot, move in */
function newRoomNo(lat, lon) {
  let n = 100 + hash(lat.toFixed(2) + ',' + lon.toFixed(2)) % 880;
  while (RESIDENTS.some(r => r.no === String(n))) n++;
  return String(n);
}
function openAddress(lat, lon) {
  const water = isWater(lat, lon), place = describePlace(lat, lon, water);
  if (S.panel) closePanel(true);
  S.panel = { kind: 'address', lat, lon }; G.hover = null; G.reticle.visible = false; ghud.hidden = true;
  G.shiftGoal = isNarrow() ? 0 : -200;
  dropMarker(lat, lon, water ? TK.info : TK.accent); ripple(latLonToVec(lat, lon));
  flyGlobe(lat, lon, isNarrow() ? 2.6 : 2.15, 1.3);
  const sky = localSky(lat, lon, tzFor(lat, lon));
  const near = nearestResidents(lat, lon, null, 2);
  const nearTxt = near.map(x => `${esc(residentInfo(x.r).handle)}（${kmStr(x.km)}）`).join('、');
  const head = `<p class="coord big">${fmtCity(lat, lon)}</p><div class="chiprow">${skyChip(sky)}<span class="tag dim">${esc(place.sub)}</span></div>${water ? '' : `<p class="privacy">为保护隐私，地址只公开到城市：房子会落在${esc(place.km < 320 ? place.city.zh : '这一带')}的一个随机位置，地图上不会出现你点的精确点。</p>`}`;
  if (water) {
    const c = place.city;
    setPanel('选址 · 海上', place.title, `${head}<p class="u-mb2">这里是海上，暂时盖不了房子。</p><p class="mute small u-m0">离这里最近的城市是${esc(c.zh)}，约 ${kmStr(place.km)}。</p>`,
      `<button type="button" class="btn primary" id="goCity">去${esc(c.zh)}看看</button>`);
    $('#goCity').addEventListener('click', () => openAddress(c.lat, c.lon));
    return;
  }
  if (G.moving) {
    setPanel('搬家 · 新地址', place.title, `${head}<p class="u-m0">把${CLOUD.ready && !CLOUD.isOwner ? '你的房间' : ' 302「零点电竞酒吧」'}搬到这里？房间里的布置和作品都会跟着走，窗外会换成这里的天色。</p><p class="mute small u-mt3">新邻居：${nearTxt}</p>`,
      `<button type="button" class="btn primary" id="doMove">搬到这里</button><button type="button" class="btn ghost" id="cancelMove">再看看</button>`);
    $('#doMove').addEventListener('click', () => doMove(lat, lon, place));
    $('#cancelMove').addEventListener('click', () => { closePanel(); });
    return;
  }
  if (CLOUD.ready) {
    const mine = myResident();
    if (!canPost()) {
      setPanel('选址 · 陆地', place.title, `${head}<p class="u-m0">你现在是参观者，可以逛地球、进房间看作品。入住和留言需要房主在页面的分享菜单里把你设为“参与者”。</p>`, `<button type="button" class="btn" id="goNear">去最近的邻居家看看</button>`);
      $('#goNear').addEventListener('click', () => near[0] && openResident(near[0].r)); return;
    }
    if (mine) {
      const mi = residentInfo(mine);
      setPanel('选址 · 陆地', place.title, `${head}<p class="u-m0">你在${esc(mi.city)}已经有一间「${esc(mi.name)}」了。每人一间房，可以把它搬到这里。</p>`,
        `<button type="button" class="btn primary" id="mvHere">搬到这里</button><button type="button" class="btn ghost" id="goMineHere">回我的房间</button>`);
      $('#mvHere').addEventListener('click', () => doMove(lat, lon, place));
      $('#goMineHere').addEventListener('click', () => diveInto(mine)); return;
    }
  }
  let tpl = 'pixel';
  setPanel('选址 · 陆地', place.title, `${head}
    <p class="mute small u-mb4">附近的住户：${nearTxt}。填三样东西，房间会按模板摆好，每个作品一块展示屏。</p>
    <form id="applyForm">
      <div class="field"><label for="apHandle">门牌名</label><input class="input" id="apHandle" maxlength="16" value="newdev" autocomplete="off"><span class="err" id="apErr" hidden></span></div>
      <div class="field"><label for="apName">房间名</label><input class="input" id="apName" maxlength="12" value="周末作坊"></div>
      <div class="field"><label>房间模板</label><div class="tpl-grid" id="tplGrid">${TEMPLATES.map(t => `<button type="button" class="tpl" data-t="${t.id}" aria-pressed="${t.id === tpl}"><i style="background:linear-gradient(120deg,${t.sw[0]} 55%,${t.sw[1]})"></i><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div></div>
      <div class="field"><label for="apWorks">先给作品占个位（每行一个名字，最多 4 个）</label><textarea class="input" id="apWorks" rows="3" placeholder="番茄钟小工具&#10;像素画板"></textarea><span class="hint-s">每个名字会变成一块展示屏。入住后在“待上传”清单里点它，上传 .html 或填地址就能打开。没想好可以留空。</span></div>
      <div class="field"><label for="apBio">一句话介绍自己（选填）</label><input class="input" id="apBio" maxlength="60" placeholder="比如：用 AI 写小工具的前端，在找远程合作" autocomplete="off"></div>
      ${pocketList().length ? `<label class="check"><input type="checkbox" id="apPocket" checked><span>把口袋里的 ${pocketList().length} 件收藏一起摆进房间</span></label>` : ''}
    </form>`, `<button type="submit" form="applyForm" class="btn primary">在这里入住</button><span class="mute small">${CLOUD.ready ? '保存到隔壁社区，参与者都能看到' : '原型中保存在本机'}</span>`);
  $('#tplGrid').addEventListener('click', e => { const b = e.target.closest('.tpl'); if (!b) return; tpl = b.dataset.t; $('#tplGrid').querySelectorAll('.tpl').forEach(x => x.setAttribute('aria-pressed', x.dataset.t === tpl)); });
  $('#applyForm').addEventListener('submit', e => {
    e.preventDefault();
    const handle = $('#apHandle').value.trim().replace(/^@/, ''), err = $('#apErr');
    if (!/^[a-zA-Z0-9_-]{2,16}$/.test(handle)) { err.textContent = '门牌名用 2 到 16 个英文字母、数字、下划线或短横线。'; err.hidden = false; return; }
    err.hidden = true;
    const works = $('#apWorks').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4);
    const base = tpl === 'empty' ? { theme: { wall: '#2a2238', trim: '#3c2f58', floor: 'wood', floorTint: '#5a4030', neonColor: '#ffb454' }, items: [] } : clone(ROOM_PRESETS[tpl]);
    const items = base.items.filter(i => !i.entry || i.entry.kind === 'door').filter(i => i.type !== 'neon' && i.type !== 'door');
    const slots = [[.2, -1.2, 0], [2.4, -.3, -.45], [-1.5, -1.5, .35], [3.2, .9, -.7]];
    works.forEach((w, i) => { const [x, z, ry] = slots[i]; items.push({ uid: 'w' + i + Date.now().toString(36), type: 'kiosk', x, z, ry, entry: { kind: 'web', title: w, desc: '', url: '' } }); });
    items.push({ uid: 'neon', type: 'neon', wall: 'back', u: -.8, y: 3.6 }, DOOR(tpl === 'leaf' ? -2.6 : 0));
    items.push({ uid: 'chalkboard', type: 'chalkboard', wall: 'back', u: 2.6, y: 1.85, entry: { kind: 'guestbook', title: '留言黑板', desc: '' } });
    const bio = ($('#apBio').value || '').trim().slice(0, 60), fromPocket = $('#apPocket') && $('#apPocket').checked ? pocketList() : [];
    fromPocket.forEach(p => { const sp = freeSpot(items); items.push({ uid: 'k' + Math.random().toString(36).slice(2, 8), type: 'keepsake', x: sp.x, z: sp.z, rot: 0, entry: p.e }); });
    const no = newRoomNo(lat, lon), name = $('#apName').value.trim().slice(0, 12) || '新房间';
    const theme = Object.assign({}, base.theme, { neon: handle.toUpperCase() });
    const btn = pFoot.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    if (CLOUD.ready) {
      const uid = CLOUD.me.id, sn = snapToCity(lat, lon, uid);
      const doc = { v: 1, no, handle: '@' + handle, name, tpl, theme, items, lat: sn.lat, lon: sn.lon, city: sn.city, createdAt: Date.now(), updatedAt: Date.now() };
      if (bio) doc.card = { bio };
      if (fromPocket.length) pocketClear();
      CLOUD.landing = uid; CLOUD.rooms.set(uid, doc); syncRealResidents();
      const r = RESIDENTS.find(x => x.real && x.key === uid);
      closePanel(true); clearMarker(); document.body.classList.add('leaving'); syncChrome();
      cloudWrite(`rooms/${uid}`, doc).catch(() => {});
      landPin(r).then(() => { CLOUD.landing = null; syncRealResidents(); return sleep(500); }).then(() => diveInto(r, { build: true, pickPending: true, msg: works.length ? `欢迎入住 ${sn.city} · ${no}！下面“待上传”里是你的 ${works.length} 件作品，点一件开始上传` : `欢迎入住 ${sn.city} · ${no}！从物件库挑一件，绑定你的第一个作品` }));
      return;
    }
    const sn = snapToCity(lat, lon, no), city = sn.city;
    const room = { id: 'custom-' + no, no, name, owner: '@' + handle, mine: true, lat: sn.lat, lon: sn.lon, city, theme, items };
    CUSTOM[no] = room; store.set('gebi3.custom', CUSTOM);
    const r = { no, custom: true, handle: '@' + handle, name, city, lat: sn.lat, lon: sn.lon, tagline: '刚入住的新邻居', tags: ['新入住'], friends: near.map(x => x.r.no).slice(0, 1) };
    RESIDENTS.push(r);
    closePanel(true); clearMarker(); document.body.classList.add('leaving'); syncChrome();
    if (fromPocket.length) pocketClear();
    landPin(r).then(() => { pushFeed([no, `在${city}入住了「${name}」`], '刚刚'); return sleep(500); }).then(() => diveInto(r, { build: true, pickPending: true, msg: works.length ? `欢迎入住 ${city} · ${no}！下面“待上传”里是你的 ${works.length} 件作品，点一件开始上传` : `欢迎入住 ${city} · ${no}！从物件库挑一件，绑定你的第一个作品` }));
  });
}
async function landPin(r) {
  const pin = addPin(r, true); buildArcs(); buildGlobeLabels();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1.4, 10, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { a: { value: 1 } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform float a; varying float vY; void main(){ gl_FragColor = vec4(vec3(1., .78, .45) * 2.4, (1. - vY) * a); }' }));
  beam.geometry.translate(0, .7, 0);
  pin.g.add(beam); beam.scale.y = 0;
  ripple(pin.up);
  await tween(.7, t => { beam.scale.y = 1 - t * .0; beam.position.y = (1 - t) * 1.2; beam.material.uniforms.a.value = 1; }, ease.out);
  await tween(.9, t => { pin.beamMat.uniforms.grow.value = t; beam.material.uniforms.a.value = 1 - t; }, ease.out);
  pin.g.remove(beam);
}
async function doMove(lat, lon, place) {
  stopMove(); closePanel(true); clearMarker();
  if (CLOUD.ready && !CLOUD.isOwner) {
    const uid = CLOUD.me.id, d = clone(CLOUD.rooms.get(uid) || {}); if (!d.no) return;
    const sn = snapToCity(lat, lon, uid + Date.now());
    Object.assign(d, { lat: sn.lat, lon: sn.lon, city: sn.city, updatedAt: Date.now() });
    CLOUD.rooms.set(uid, d); CLOUD.landing = uid; syncRealResidents();
    const me = RESIDENTS.find(r => r.real && r.key === uid);
    cloudWrite(`rooms/${uid}`, d);
    await landPin(me); CLOUD.landing = null; syncRealResidents();
    toast(`搬到了${sn.city}，窗外的天色也换了`); openResident(me); return;
  }
  const me = RESIDENTS.find(r => r.no === '302'), sn = snapToCity(lat, lon, 'move' + Date.now()), city = sn.city;
  Object.assign(ME, { lat: sn.lat, lon: sn.lon, city }); store.set('gebi3.me', ME);
  Object.assign(me, { lat: sn.lat, lon: sn.lon, city });
  if (CLOUD.ready && CLOUD.isOwner) writeSite({ lat: sn.lat, lon: sn.lon, city });
  const old = pinOf('302'); if (old) { G.pinRoot.remove(old.g); G.pins.splice(G.pins.indexOf(old), 1); }
  await landPin(me);
  toast(`302 搬到了${city}，窗外的天色也换了`);
  tickClock(); syncChrome();
  openResident(me);
}

