/* ============================================================
   AI artifacts · publish desk: everything that arrives (a dropped
   file, pasted text, a publish link, a .gebi package) becomes a
   card; Bit can fill in the details; one click stores it and puts
   the right object in the room. Protocol: docs/PUBLISH.md
   ============================================================ */
const PUB = { items: [], busy: false };
const PUB_TOOL_URL = 'https://raw.githubusercontent.com/ciki-9876/gebi/main/tools/gebi-publish.mjs';
const textBytes = s => new Blob([s]).size;

/* ---------- intake ---------- */
function pubItem(o) {
  const t = ART_TYPES[o.type] ? o.type : 'file';
  return Object.assign({ id: rid('p'), made: '', desc: '' }, o, { type: t, carrier: artCarrier(t, o.carrier), title: String(o.title || baseName(o.name) || ART_TYPES[t].label).slice(0, 30) });
}
async function fileItems(f) {
  const name = f.name || 'file', low = name.toLowerCase();
  if (low.endsWith('.gebi.json') || (low.endsWith('.json') && f.size < 30 * 1024 * 1024 && /^\s*\{\s*"gebi"/.test(await f.slice(0, 64).text()))) {
    let m; try { m = JSON.parse(await f.text()); } catch (e) { throw artErr(`${name} 不是有效的发布清单。`); }
    return manifestItems(m);
  }
  if (/\.zip$/.test(low) || /zip/.test(f.type)) {
    const files = await readZip(await f.arrayBuffer());
    const mf = files.find(x => x.path === 'gebi.json');
    if (mf) { let m = {}; try { m = JSON.parse(new TextDecoder().decode(mf.bytes)); } catch (e) {} return manifestItems(m, files.filter(x => x !== mf)); }
    return [pubItem({ type: 'project', name, files, size: f.size, title: baseName(name) })];
  }
  const type = typeOfName(name, f.type);
  if ((type === 'web' || type === 'doc' || type === 'data') && f.size <= 4 * 1024 * 1024) {
    const text = await f.text(), t = type === 'web' ? sniffText(text) === 'game' ? 'game' : 'web' : type;
    return [pubItem({ type: t, name, text, size: f.size, mime: mimeOf(name, f.type), title: (t !== 'data' && titleFromText(text, t)) || baseName(name) })];
  }
  return [pubItem({ type, name, blob: f, size: f.size, mime: mimeOf(name, f.type) })];
}
function textItems(raw) {
  const text = String(raw || '').trim(); if (!text) return [];
  if (/^\{\s*"gebi"/.test(text)) { try { return manifestItems(JSON.parse(text)); } catch (e) {} }
  if (/^https?:\/\/\S+$/.test(text)) return [urlItem(text)];
  const t = sniffText(text), name = { web: 'index.html', game: 'index.html', doc: 'note.md', data: 'snippet.txt' }[t];
  return [pubItem({ type: t, name, text, size: textBytes(text), mime: mimeOf(name), title: titleFromText(text, t) })];
}
function urlItem(url, o = {}) {
  let path = ''; try { path = new URL(url).pathname; } catch (e) {}
  const guess = typeOfName(path), t = o.type && ART_TYPES[o.type] ? o.type : ['image', 'video', 'audio', 'pdf', 'model'].includes(guess) ? guess : 'web';
  return pubItem(Object.assign({ name: path.split('/').pop() || url, url, size: 0, mime: mimeOf(path) }, o, { type: t }));
}
function manifestItems(m, zipFiles) {
  if (!m || typeof m !== 'object') throw artErr('发布清单格式不对，见 docs/PUBLISH.md。');
  const base = { title: String(m.title || '').slice(0, 30), desc: String(m.desc || '').slice(0, 80), made: String(m.made_with || '').slice(0, 30), carrier: m.carrier };
  const want = ART_TYPES[m.type] ? m.type : '';
  if (validUrl(m.url)) return [urlItem(String(m.url).trim(), Object.assign({}, base, { type: want }))];
  let files = zipFiles || [];
  if (!zipFiles && Array.isArray(m.files)) files = m.files.slice(0, 400).filter(f => f && typeof f.path === 'string').map(f => {
    const path = f.path.replace(/^\.?\/+/, '').replace(/\\/g, '/');
    if (typeof f.text === 'string') return { path, text: f.text };
    if (typeof f.base64 === 'string') { try { return { path, bytes: b64ToBytes(f.base64.replace(/\s+/g, '')), mime: f.mime }; } catch (e) {} }
    return null;
  }).filter(Boolean);
  if (!files.length) throw artErr('发布清单里没有文件，也没有网址。');
  if (files.length === 1 && want !== 'project') {
    const f = files[0], type = want || typeOfName(f.path, f.mime);
    if (f.text == null && isTextName(f.path)) { try { f.text = new TextDecoder('utf-8', { fatal: true }).decode(f.bytes); } catch (e) {} }
    if (f.text != null) { const t = type === 'web' && sniffText(f.text) === 'game' ? 'game' : type; return [pubItem(Object.assign({ type: t, name: f.path, text: f.text, size: textBytes(f.text), mime: mimeOf(f.path) }, base, { title: base.title || titleFromText(f.text, t) || baseName(f.path) }))]; }
    return [pubItem(Object.assign({ type, name: f.path, blob: new Blob([f.bytes], { type: f.mime || mimeOf(f.path) }), size: f.bytes.length, mime: f.mime || mimeOf(f.path) }, base))];
  }
  const size = files.reduce((s, f) => s + (f.text != null ? textBytes(f.text) : f.bytes.length), 0);
  return [pubItem(Object.assign({ type: 'project', name: (base.title || 'project') + '.zip', files, size, entry: String(m.entry || '') }, base))];
}
async function linkManifest(code) {
  const m = /^([zj])\.([A-Za-z0-9_-]+)$/.exec(code || '');
  if (!m) throw artErr('发布链接不完整，可能被截断了。让 AI 重新生成一次。');
  const bytes = b64ToBytes(m[2].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((m[2].length + 3) % 4));
  let json;
  if (m[1] === 'z') {
    if (typeof DecompressionStream === 'undefined') throw artErr('这个浏览器打不开压缩的发布链接，请用最新版的 Chrome、Edge 或 Safari。');
    json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  } else json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

/* ---------- the desk ---------- */
function aiGuide() {
  return `请帮我把作品发布到「隔壁」（一个把作品摆进 3D 房间的社区）。按下面的顺序选一种做法：

1. 如果你能调用 MCP 工具 gebi_publish_files 或 gebi_publish_content，直接调用，然后把返回的发布链接或 .gebi.zip 文件交给我。
2. 如果你能运行命令：下载 ${PUB_TOOL_URL}
   运行 node gebi-publish.mjs <文件或文件夹> --title "作品名" --made-with "<你的名字>"
   把输出的发布链接或 .gebi.zip 文件交给我。
3. 都不能的话：把作品整理成一个 .gebi.json 文件给我，内容是：
   {"gebi":1,"title":"作品名（30 字内）","desc":"一句话介绍（80 字内）","type":"web|game|doc|image|video|audio|pdf|project|model|data|file","made_with":"<你的名字>","files":[{"path":"index.html","text":"文件内容"}]}
   - 文本文件写在 text 里；图片等二进制文件写成 {"path":"a.png","base64":"…","mime":"image/png"}。
   - 有多个文件时会作为项目运行，入口是 index.html，可以用相对路径引用其他文件。
   - 作品已经在网上的话，用 "url":"https://…" 代替 files。

限制：单个文件不超过 20 MB；单个网页、文档、代码不超过 200 KB；项目里的代码和文本合计不超过 1 MB；不支持需要服务器的后端。
拿到链接我会直接打开；拿到文件我会拖进隔壁的发布台。`;
}
function mcpConfig() { return `{\n  "mcpServers": {\n    "gebi": { "command": "node", "args": ["<保存位置>/gebi-publish.mjs"] }\n  }\n}`; }
async function openPublish(seed) {
  if (!seed && PUB.pending) { seed = PUB.pending; PUB.pending = null; }
  if (!(S.view === 'room' && S.room && S.room.mine)) { if (!(await pubGoHome())) { if (seed) PUB.pending = seed; return; } }
  if (CLOUD.ready && !canPost()) { toast('你现在只能参观：发布作品需要房主把你设为“参与者”', 4200); return; }
  if (S.win) minimizeWin(S.win, true);
  if (S.panel && S.panel.kind !== 'publish') closePanel(true);
  S.panel = { kind: 'publish' };
  if (seed) await pubAdd(seed); else renderPublish();
}
async function pubGoHome() {
  if (window.claude && window.claude.use) for (let i = 0; i < 30 && !CLOUD.ready; i++) await sleep(200);
  const r = CLOUD.ready ? myResident() : RESIDENTS.find(x => x.preset === 'mine');
  if (!r) { toast('先在地球上选址入住，入住后再发布作品', 4600); return false; }
  for (let i = 0; i < 40 && S.busy; i++) await sleep(150);
  if (S.view === 'room') await exitToGlobe();
  await diveInto(r);
  for (let i = 0; i < 60 && (S.busy || S.view !== 'room'); i++) await sleep(150);
  return S.view === 'room' && S.room && S.room.mine;
}
async function pubAdd(seed) {
  const errs = [];
  const add = list => { PUB.items.push(...list); };
  try {
    if (seed.files) for (const f of [...seed.files].slice(0, 20)) { try { add(await fileItems(f)); } catch (e) { errs.push(e.friendly ? e.message : `${f.name} 读不出来`); } }
    if (seed.text) add(textItems(seed.text));
    if (seed.manifest) add(manifestItems(seed.manifest));
  } catch (e) { errs.push(e.friendly ? e.message : '没能识别这些内容'); }
  renderPublish(errs);
}
function pubWarn(it) {
  if (it.url) return '';
  const st = ART_TYPES[it.type].store;
  if (st === 'work' && it.size > WORK_MAX) return `网页有 ${kb(it.size)}，超过了 200 KB。把图片换成链接，或者打包成 .zip 当作项目发布。`;
  if (st === 'project' && !it.files) return '只有项目包（.zip）或多个文件才能作为项目发布。';
  if ((st === 'work' || st === 'text') && it.text == null) return '这个文件不是文本，换一种类型试试。';
  if (it.size > ART_ASSET_MAX) return `文件有 ${mb(it.size)}，超过了 20 MB。压缩一下，或者放到网上后用网址发布。`;
  if ((it.type === 'model' || it.type === 'file') && it.blob && !assetType(it.name, it.mime) && it.size > DB_BLOB_MAX) return `这种文件只能存 2 MB 以内。放到网上后用网址发布。`;
  if (S.room.items.length + PUB.items.length > 80) return '房间里的物件快放满了（最多 80 件），先删掉一些。';
  return '';
}
function typeChoices(it) {
  if (it.url) return [it.type];
  if (it.files) return ['project'];
  if (it.text != null) return ['web', 'game', 'doc', 'data'];
  return [it.type, 'file'].filter((v, i, a) => a.indexOf(v) === i);
}
function renderPublish(errs = []) {
  if (!S.panel || S.panel.kind !== 'publish') return;
  const n = PUB.items.length;
  const cards = PUB.items.map((it, i) => {
    const warn = pubWarn(it), types = typeChoices(it);
    return `<div class="pub-card" data-i="${i}">
      <div class="pub-head"><span class="tag">${esc(ART_TYPES[it.type].label)}</span><b>${esc(it.name || it.url || '')}</b><small class="mute">${it.size ? esc(mb(it.size)) : it.url ? '网址' : ''}</small><button type="button" class="icon-btn" data-x="rm" aria-label="移除">${ICON.del}</button></div>
      ${types.length > 1 ? `<div class="field"><label>类型</label><div class="seg" data-f="type">${types.map(t => `<button type="button" data-v="${t}" aria-pressed="${t === it.type}">${esc(ART_TYPES[t].label)}</button>`).join('')}</div></div>` : ''}
      <div class="field"><label>放进</label><div class="seg" data-f="carrier">${ART_TYPES[it.type].carriers.map(c => `<button type="button" data-v="${c}" aria-pressed="${c === it.carrier}">${esc(carrierName(c))}</button>`).join('')}</div></div>
      <div class="field"><label for="pt${i}">作品名称</label><input class="input" id="pt${i}" data-f="title" maxlength="30" value="${esc(it.title)}"></div>
      <div class="field"><label for="pd${i}">一句话介绍</label><input class="input" id="pd${i}" data-f="desc" maxlength="80" value="${esc(it.desc)}" placeholder="可以留空，或者让 Bit 来写"></div>
      ${it.made ? `<p class="mute small">用 ${esc(it.made)} 做的</p>` : ''}${warn ? `<p class="err">${esc(warn)}</p>` : ''}<p class="pub-state mute small" data-s></p>
    </div>`;
  }).join('');
  setPanel('发布台 · 任何 AI 做的东西', n ? `准备发布 ${n} 件` : '发布作品', `
    ${errs.map(e => `<p class="err u-mb3">${esc(e)}</p>`).join('')}
    ${cards}
    <div class="pub-drop" id="pubDrop" tabindex="0"><b>${n ? '再加一些' : '把 AI 做的东西拖到这里'}</b><span>网页、文档、图片、视频、音频、PDF、3D 模型、整个项目的 .zip，或者 AI 给你的 .gebi 发布包</span>
      <span class="u-row u-center"><label class="btn sm" for="pubFile">选择文件</label><input type="file" id="pubFile" multiple hidden></span></div>
    <div class="field"><label for="pubPaste">或者粘贴 AI 的回复</label><textarea class="input code" id="pubPaste" rows="4" placeholder="网页代码、Markdown 文章、代码、作品网址，或者发布清单"></textarea>
      <button type="button" class="btn sm u-mt2" id="pubPasteGo">识别粘贴的内容</button></div>
    <div class="divider"></div>
    <p class="section-t">让你的 AI 直接发布</p>
    <p class="mute small u-mb3">把发布说明发给你用的 AI（ChatGPT、Claude、Gemini、Cursor……），它会把作品打包好，交给你一个链接或文件。</p>
    <div class="u-row"><button type="button" class="btn sm" id="pubCopyGuide">复制发布说明</button><button type="button" class="btn sm ghost" id="pubCopyMcp">复制 MCP 配置</button></div>
    <details class="pub-more"><summary>装上隔壁发布工具（MCP）</summary><p class="mute small">下载 <a href="${PUB_TOOL_URL}" target="_blank" rel="noopener noreferrer">gebi-publish.mjs</a>（需要 Node 18 以上），把下面的配置加进 Claude Desktop、Cursor、Codex 等工具的 MCP 设置，然后对 AI 说“把这个发布到隔壁”。</p><pre class="code">${esc(mcpConfig())}</pre></details>`,
    n ? `<button type="button" class="btn primary" id="pubGo"${PUB.busy ? ' disabled' : ''}>发布 ${n} 件到房间</button><button type="button" class="btn" id="pubBit"${PUB.busy ? ' disabled' : ''}>让 Bit 补全介绍</button>` : '');
  pBody.querySelectorAll('.pub-card').forEach(card => {
    const it = PUB.items[+card.dataset.i];
    card.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || PUB.busy) return;
      if (b.dataset.x === 'rm') { PUB.items.splice(+card.dataset.i, 1); renderPublish(); return; }
      const seg = b.closest('[data-f]'); if (!seg) return;
      if (seg.dataset.f === 'type') { it.type = b.dataset.v; it.carrier = artCarrier(it.type, it.carrier); renderPublish(); }
      else { it.carrier = b.dataset.v; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); }
    });
    card.querySelectorAll('input[data-f]').forEach(inp => inp.addEventListener('input', () => { it[inp.dataset.f] = inp.value; }));
  });
  const fi = $('#pubFile'); fi.addEventListener('change', () => { if (fi.files && fi.files.length) pubAdd({ files: fi.files }); });
  const drop = $('#pubDrop');
  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', ev => { ev.preventDefault(); ev.stopPropagation(); drop.classList.remove('over'); if (ev.dataTransfer.files.length) pubAdd({ files: ev.dataTransfer.files }); });
  $('#pubPasteGo').addEventListener('click', () => { const v = $('#pubPaste').value; if (v.trim()) pubAdd({ text: v }); });
  $('#pubCopyGuide').addEventListener('click', () => copyText(aiGuide(), '发布说明已复制，发给你的 AI 吧'));
  $('#pubCopyMcp').addEventListener('click', () => copyText(mcpConfig(), 'MCP 配置已复制'));
  const go = $('#pubGo'); if (go) go.addEventListener('click', pubCommit);
  const bit = $('#pubBit'); if (bit) bit.addEventListener('click', pubAutofill);
}
async function copyText(s, ok) {
  try { await navigator.clipboard.writeText(s); toast(ok); }
  catch (e) { const t = document.createElement('textarea'); t.value = s; document.body.appendChild(t); t.select(); let done = false; try { done = document.execCommand('copy'); } catch (x) {} t.remove(); toast(done ? ok : '浏览器不让复制，请手动选中文字复制'); }
}
function cardState(i, text) { const el = pBody.querySelector(`.pub-card[data-i="${i}"] [data-s]`); if (el) el.textContent = text; }

/* ---------- Bit fills in the details ---------- */
async function pubAutofill() {
  if (!S.sample) { toast('Bit 现在不在线：页面需要开启 AI 能力。先手动填写吧'); return; }
  PUB.busy = true; renderPublish();
  let lim = {}; try { lim = await S.sample.limits(); } catch (e) {}
  for (let i = 0; i < PUB.items.length; i++) {
    const it = PUB.items[i]; cardState(i, 'Bit 正在看……');
    const peek = it.text != null ? it.text.slice(0, 4000) : it.files ? it.files.slice(0, 60).map(f => f.path).join('\n') + '\n\n' + ((it.files.find(f => /^readme/i.test(f.path) && f.text != null) || {}).text || '').slice(0, 2000) : '';
    const prompt = `你是「隔壁」社区的发布助手。用户要把一件 AI 做的作品摆进自己的 3D 房间。根据下面的信息，用中文给出：
- title：作品名，12 字以内，具体，不要“我的作品”这类空话
- desc：一句话介绍，40 字以内，说清楚它是什么、能做什么
- carrier：从 ${JSON.stringify(ART_TYPES[it.type].carriers)} 里选最合适的一个
只输出 JSON，例如 {"title":"…","desc":"…","carrier":"…"}。

文件名：${it.name || it.url || ''}
类型：${ART_TYPES[it.type].label}
现在的名称：${it.title}
${peek ? '内容节选：\n' + peek : ''}`;
    const opts = { modelTier: 'quick' };
    if (it.type === 'image' && it.blob && lim.images && it.size < 5 * 1024 * 1024) opts.images = [it.blob];
    try {
      const r = await S.sample(prompt, opts), j = JSON.parse((/\{[\s\S]*\}/.exec(r.text || '') || ['{}'])[0]);
      if (j.title) it.title = String(j.title).slice(0, 30);
      if (j.desc) it.desc = String(j.desc).slice(0, 80);
      if (j.carrier) it.carrier = artCarrier(it.type, j.carrier);
    } catch (e) { if (e && e.code === 'not_granted') { toast('没有授权 Bit 使用 AI，先手动填写吧'); break; } if (e && e.code === 'rate_limited') { toast('Bit 有点忙，稍后再试'); break; } }
  }
  PUB.busy = false; renderPublish();
}

/* ---------- store + place ---------- */
async function pubStore(it, i) {
  const prefix = workPrefix(), path = prefix + rid('a'), t = it.type, d = ART_TYPES[t];
  const e = { kind: d.kind, title: (it.title || '').trim() || d.label, desc: (it.desc || '').trim(), url: '' };
  const art = { t, name: String(it.name || '').slice(0, 80), mime: it.mime || '', bytes: it.size || 0 };
  if (it.made) art.made = it.made;
  if (it.url) { if (d.store === 'work') { e.url = it.url; e.open = 'embed'; } else e.art = Object.assign(art, { url: it.url }); return e; }
  if (d.store === 'work') {
    cardState(i, '正在托管网页……'); await saveWork(path, e.title, it.text);
    Object.assign(e, { work: path, workBytes: textBytes(it.text), open: 'embed', size: t === 'game' ? 'wide' : 'tall' }); return e;
  }
  if (d.store === 'text') {
    cardState(i, '正在保存……');
    if (it.size <= ART_DB_MAX) { await saveArtDoc(path, { title: e.title, kind: t, name: art.name, text: it.text }); art.work = path; }
    else { const ty = /\.(md|markdown)$/i.test(art.name) ? 'text/markdown' : /\.csv$/i.test(art.name) ? 'text/csv' : /\.json$/i.test(art.name) ? 'application/json' : 'text/plain'; art.asset = await putBlob(new Blob([it.text], { type: ty }), ty); }
    e.art = art; return e;
  }
  if (d.store === 'project') {
    const r = await saveProject(path, e.title, it.files, it.entry, s => cardState(i, s));
    Object.assign(art, { work: path, bytes: r.bytes }); e.art = art;
    if (r.skipped.length) toast(`「${e.title}」里有 ${r.skipped.length} 个文件太大或格式不支持，已跳过`, 4200);
    return e;
  }
  cardState(i, `正在上传 ${mb(it.size)}……`);
  const ty = assetType(it.name, it.mime);
  if (ty) art.asset = await putBlob(it.blob, ty);
  else { await saveDbBlob(path, new Uint8Array(await it.blob.arrayBuffer()), it.mime); art.work = path; }
  e.art = art; return e;
}
async function pubCommit() {
  if (PUB.busy || !PUB.items.length) return;
  if (!(S.room && S.room.mine)) { toast('回到自己的房间再发布'); return; }
  const bad = PUB.items.findIndex(it => pubWarn(it));
  if (bad >= 0) { toast(`第 ${bad + 1} 件还有问题：${pubWarn(PUB.items[bad])}`, 4600); return; }
  PUB.busy = true; renderPublish();
  const done = [], ok = new Set();
  for (let i = 0; i < PUB.items.length; i++) {
    const it = PUB.items[i];
    try {
      const e = await pubStore(it, i), sp = freeSpot(S.room.items);
      const def = { uid: it.carrier + Date.now().toString(36) + i, type: it.carrier, x: sp.x, z: sp.z, rot: 0, entry: e };
      clampDef(def); S.room.items.push(def); done.push(placeItem(def)); ok.add(it); cardState(i, '已摆进房间');
    } catch (err) { cardState(i, err && err.friendly ? err.message : '没发布成功，稍后再试'); console.warn('publish', err); }
  }
  PUB.busy = false;
  if (!done.length) { renderPublish(); return; }
  saveLayout(); rebuildColliders(); refreshHotspots();
  const left = PUB.items.length - done.length;
  PUB.items = PUB.items.filter(it => !ok.has(it));
  if (left) { renderPublish([`${left} 件没有发布成功，原因写在卡片里。`]); toast(`摆好了 ${done.length} 件`); return; }
  closePanel(true); toast(`摆好了 ${done.length} 件，点它们就能打开`, 3600);
  setTimeout(() => { const g = done[done.length - 1]; if (g) focusOn(g, { loose: true }); }, 200);
}

/* ---------- ways in ---------- */
$('#pubBtn').addEventListener('click', () => openPublish());
$('#pubBuildBtn').addEventListener('click', () => openPublish());
addEventListener('dragover', ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
addEventListener('drop', ev => {
  if (!ev.dataTransfer || !ev.dataTransfer.files.length) return;
  ev.preventDefault();
  if (S.view === 'room' && S.room && S.room.mine) openPublish({ files: ev.dataTransfer.files });
  else toast('回到自己的房间，再把作品拖进来');
});
async function pubFromHash() {
  const m = /^#publish=([^&]+)/.exec(location.hash || ''); if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  let manifest;
  try { manifest = await linkManifest(m[1]); } catch (e) { toast(e.friendly ? e.message : '发布链接打不开，让 AI 重新生成一次', 5000); return; }
  toast('收到一件要发布的作品，正在带你回自己的房间', 3000);
  openPublish({ manifest });
}
