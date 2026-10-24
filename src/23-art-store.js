/* ============================================================
   AI artifacts · storage: binaries go to the artifact `assets`
   store (or IndexedDB offline), text to db docs, projects are
   unzipped in the browser and split across both.
   ============================================================ */
const ART_URLS = new Map();
let artIdb = null;
function idb() {
  return artIdb || (artIdb = new Promise((res, rej) => {
    const r = indexedDB.open('gebi-art', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function idbDo(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => { const tx = d.transaction('blobs', mode), q = fn(tx.objectStore('blobs')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
}
function artAssets() {
  if (!CLOUD.ready || !window.claude || !window.claude.use) return Promise.resolve(null);
  if (!CLOUD.assetsP) CLOUD.assetsP = window.claude.use('assets').catch(() => null);
  return CLOUD.assetsP;
}
function artErr(msg) { const e = new Error(msg); e.friendly = true; return e; }
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- binaries ---------- */
// assets 只收这些类型；音频和模型不在其中，见 docs/PUBLISH.md
const ACCEPT_RE = /^(image\/|video\/|font\/)|^(application\/pdf|text\/csv|text\/markdown|text\/plain|application\/json)$/;
const DB_BLOB_MAX = 2 * 1024 * 1024;
function assetType(name, type) {
  const t = mimeOf(name, type);
  if (ACCEPT_RE.test(t)) return t;
  if (/^audio\//.test(t)) return /ogg/.test(t) ? 'video/ogg' : /webm/.test(t) ? 'video/webm' : 'video/mp4';
  return '';
}
async function putBlob(blob, type) {
  if (blob.size > ART_ASSET_MAX) throw artErr(`文件有 ${mb(blob.size)}，超过了 20 MB。压缩一下，或者把它放到网上后用链接发布。`);
  if (!CLOUD.ready) { const k = rid('local:a'); await idbDo('readwrite', s => s.put(blob, k)); return k; }
  const assets = await artAssets();
  if (!assets) throw artErr('这个页面还不能上传文件：需要房主在发布页面时开启文件上传（assets 能力）。');
  try { return (await assets.upload(blob, { type })).id; }
  catch (e) {
    const c = e && e.code;
    if (c === 'store_unavailable') { try { return (await assets.upload(blob, { type })).id; } catch (x) {} }
    throw artErr(c === 'unsupported_type' || c === 'invalid_request' ? '这种文件不能直接上传。换成常见格式，或者打包成 .zip 当作项目发布。' : c === 'quota_exceeded' ? '社区的文件空间满了，请联系房主清理。' : '上传没成功，稍后再试一次。');
  }
}
// assets 不收的二进制（3D 模型、其他文件）：≤ 2 MB 时拆成 base64 存进数据库
async function saveDbBlob(base, bytes, mime) {
  if (bytes.length > DB_BLOB_MAX) throw artErr(`这种文件只能存 2 MB 以内，这个有 ${mb(bytes.length)}。把它放到网上后用链接发布。`);
  const b = bytesToB64(bytes), n = Math.max(1, Math.ceil(b.length / CHUNK));
  for (let i = 0; i < n; i++) await saveArtDoc(`${base}-c${i}`, { b64: b.slice(i * CHUNK, (i + 1) * CHUNK) });
  await saveArtDoc(base, { kind: 'blob', mime, bytes: bytes.length, chunks: n });
}
async function loadDbBlob(path) {
  const m = await loadArtDoc(path); if (!m) return null;
  if (typeof m.text === 'string') return new Blob([m.text], { type: (assetType(m.name || '', '') || mimeOf(m.name || '', 'text/plain')).replace(/^text\/html$/, 'text/plain') + ';charset=utf-8' });
  if (m.kind !== 'blob') return null;
  const parts = await Promise.all(Array.from({ length: clamp(+m.chunks || 0, 0, 40) }, (_, i) => loadArtDoc(`${path}-c${i}`)));
  return new Blob([b64ToBytes(parts.map(d => (d && d.b64) || '').join(''))], { type: String(m.mime || 'application/octet-stream') });
}
async function artUrl(art) {
  if (!art) return '';
  if (art.url) return art.url;
  const key = art.asset || art.work; if (!key) return '';
  if (art.asset && !art.asset.startsWith('local:')) return '/_blob/' + art.asset;
  if (ART_URLS.has(key)) return ART_URLS.get(key);
  const b = art.asset ? await idbDo('readonly', s => s.get(art.asset)).catch(() => null) : await loadDbBlob(art.work);
  const u = b ? URL.createObjectURL(b) : '';
  ART_URLS.set(key, u); return u;
}
function mb(n) { return n < 1024 * 1024 ? kb(n) : (n / 1048576).toFixed(1) + ' MB'; }

/* ---------- text docs (reuse the hosted-works paths) ---------- */
async function saveArtDoc(path, doc) {
  if (path.startsWith('local:')) { store.set('gebi3.work.' + path.slice(6), doc); return; }
  await cloudWrite(path, Object.assign({ updatedAt: Date.now() }, doc));
}
async function loadArtDoc(path) {
  if (path.startsWith('local:')) return store.get('gebi3.work.' + path.slice(6), null);
  if (!CLOUD.ready || !WORK_RE.test(path)) return null;
  try { const s = await CLOUD.db.doc(path).get(); return s.exists ? s.data() : null; } catch (e) { return null; }
}
async function loadArtText(art) {
  if (art.work) { const d = await loadArtDoc(art.work); return d ? String(d.text || '') : null; }
  const u = await artUrl(art); if (!u) return null;
  try { const r = await fetch(u); return r.ok ? await r.text() : null; } catch (e) { return null; }
}

/* ---------- zip (read) ---------- */
const JUNK_RE = /(^|\/)(__MACOSX|\.git|node_modules|\.DS_Store|Thumbs\.db|\.idea|\.vscode)(\/|$)/;
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw artErr('这不是有效的 zip 文件。');
  const n = dv.getUint16(eocd + 10, true), out = [];
  let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw artErr('zip 文件损坏了，重新打包再试。');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const path = dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    if (path.endsWith('/') || JUNK_RE.test(path) || (flags & 1)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    out.push({ path, size: usize, method, raw: u8.subarray(start, start + csize) });
  }
  return out;
}
async function inflate(ent) {
  if (ent.method === 0) return ent.raw;
  if (ent.method !== 8) throw artErr(`zip 里的 ${ent.path} 用了不支持的压缩方式。`);
  if (typeof DecompressionStream === 'undefined') throw artErr('这个浏览器不能解压 zip，请用最新版的 Chrome、Edge 或 Safari。');
  const s = new Blob([ent.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function readZip(buf) {
  const ents = await unzip(buf), files = [];
  for (const e of ents) files.push({ path: e.path, bytes: await inflate(e) });
  return stripRoot(files);
}
function stripRoot(files) {
  const tops = new Set(files.map(f => f.path.split('/')[0]));
  if (tops.size === 1 && files.every(f => f.path.includes('/'))) { const r = [...tops][0] + '/'; files.forEach(f => { f.path = f.path.slice(r.length); }); }
  return files.filter(f => f.path && !JUNK_RE.test(f.path));
}

/* ---------- projects ---------- */
const CHUNK = 150 * 1024;
const B64_MAX = 96 * 1024;
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function findEntry(paths, want) {
  if (want && paths.includes(want)) return want;
  return paths.find(p => /^index\.html?$/i.test(p)) || paths.filter(p => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => a.length - b.length)[0] || paths.find(p => /\.html?$/i.test(p)) || '';
}
// files: [{ path, bytes?: Uint8Array, text?: string }] → 存好后返回清单文档的路径
async function saveProject(base, title, files, wantEntry, onStep) {
  const dec = new TextDecoder('utf-8', { fatal: true }), recs = [], parts = [], skipped = [];
  let textBytes = 0, total = 0;
  for (const f of files.slice(0, 400)) {
    let text = f.text;
    if (text == null && isTextName(f.path)) { try { text = dec.decode(f.bytes); } catch (e) { text = null; } }
    const size = text != null ? new Blob([text]).size : f.bytes.length;
    total += size;
    if (text != null) {
      textBytes += size;
      if (textBytes > ART_PROJECT_TEXT_MAX) throw artErr('项目里的代码和文本加起来超过了 1 MB。删掉构建产物、依赖目录后再打包。');
      const n = Math.max(1, Math.ceil(text.length / CHUNK));
      for (let i = 0; i < n; i++) parts.push([f.path, i, text.slice(i * CHUNK, (i + 1) * CHUNK)]);
      recs.push({ p: f.path, s: size, k: 't', n });
      continue;
    }
    const mime = mimeOf(f.path);
    if (/^(image|video|font)\//.test(mime) || mime === 'application/pdf') {
      if (onStep) onStep(`上传 ${f.path}`);
      try { recs.push({ p: f.path, s: size, k: 'a', a: await putBlob(new Blob([f.bytes], { type: mime }), mime), m: mime }); continue; } catch (e) { if (size > B64_MAX) { skipped.push(f.path); continue; } }
    }
    if (size <= B64_MAX) { const b = bytesToB64(f.bytes); parts.push([f.path, 0, b]); recs.push({ p: f.path, s: size, k: 'b', m: mime }); }
    else skipped.push(f.path);
  }
  if (files.length > 400) skipped.push(`另外 ${files.length - 400} 个文件`);
  const chunks = []; let cur = [], len = 0;
  for (const pt of parts) { if (cur.length && len + pt[2].length > CHUNK) { chunks.push(cur); cur = []; len = 0; } cur.push(pt); len += pt[2].length + pt[0].length; }
  if (cur.length) chunks.push(cur);
  for (let i = 0; i < chunks.length; i++) { if (onStep) onStep(`保存代码 ${i + 1}/${chunks.length}`); await saveArtDoc(`${base}-c${i}`, { parts: chunks[i] }); }
  const paths = recs.map(r => r.p);
  const readme = paths.find(p => /^readme(\.md|\.markdown|\.txt)?$/i.test(p)) || '';
  await saveArtDoc(base, { title: String(title).slice(0, 30), kind: 'project', entry: findEntry(paths, wantEntry), readme, files: recs, chunks: chunks.length, skipped: skipped.slice(0, 40), bytes: total });
  return { bytes: total, count: recs.length, skipped };
}
async function loadProject(path) {
  const m = await loadArtDoc(path);
  if (!m || m.kind !== 'project' || !Array.isArray(m.files)) return null;
  const docs = await Promise.all(Array.from({ length: clamp(+m.chunks || 0, 0, 40) }, (_, i) => loadArtDoc(`${path}-c${i}`)));
  const got = new Map();
  docs.forEach(d => (d && Array.isArray(d.parts) ? d.parts : []).forEach(([p, i, s]) => { if (!got.has(p)) got.set(p, []); got.get(p)[+i || 0] = String(s || ''); }));
  const files = new Map();
  m.files.slice(0, 400).forEach(r => {
    const p = String(r.p || '').slice(0, 200); if (!p) return;
    if (r.k === 't') files.set(p, { text: (got.get(p) || []).join(''), size: +r.s || 0 });
    else if (r.k === 'b') files.set(p, { b64: (got.get(p) || [''])[0], mime: String(r.m || mimeOf(p)), size: +r.s || 0 });
    else if (r.k === 'a' && ASSET_RE.test(r.a || '')) files.set(p, { asset: r.a, mime: String(r.m || mimeOf(p)), size: +r.s || 0 });
  });
  return { title: String(m.title || ''), entry: String(m.entry || ''), readme: String(m.readme || ''), skipped: (m.skipped || []).map(String).slice(0, 40), bytes: +m.bytes || 0, files };
}
