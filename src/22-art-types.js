/* ============================================================
   AI artifacts · types: what each kind of AI output is, which
   object carries it, where it is stored. Protocol: docs/PUBLISH.md
   ============================================================ */
const ART_DB_MAX = 200 * 1024;
const ART_ASSET_MAX = 20 * 1024 * 1024;
const ART_PROJECT_TEXT_MAX = 1024 * 1024;
const ART_LINK_MAX = 48 * 1024;
const TEXT_EXTS = ['html', 'htm', 'md', 'markdown', 'txt', 'json', 'csv', 'tsv', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'sql', 'yaml', 'yml', 'toml', 'xml', 'sh', 'lua', 'php', 'vue', 'svelte', 'ini', 'env', 'gitignore', 'svg'];
// store: work = 单文件网页（沿用托管作品）· text = 文本进数据库 · asset = 二进制进 assets · project = 拆成多份
const ART_TYPES = {
  web: { label: '网页', kind: 'web', carriers: ['kiosk', 'arcade', 'monitor'], store: 'work', exts: ['html', 'htm'] },
  game: { label: '小游戏', kind: 'game2', carriers: ['arcade', 'kiosk'], store: 'work', exts: [] },
  doc: { label: '文档', kind: 'doc', carriers: ['reader', 'monitor', 'crate'], store: 'text', exts: ['md', 'markdown', 'txt'] },
  image: { label: '图片', kind: 'image', carriers: ['easel', 'kiosk', 'crate'], store: 'asset', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] },
  video: { label: '视频', kind: 'video', carriers: ['tv', 'kiosk', 'crate'], store: 'asset', exts: ['mp4', 'webm', 'mov', 'm4v'] },
  audio: { label: '音频', kind: 'audio', carriers: ['phono', 'crate'], store: 'asset', exts: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'] },
  pdf: { label: 'PDF', kind: 'pdf', carriers: ['reader', 'crate'], store: 'asset', exts: ['pdf'] },
  project: { label: '项目', kind: 'project', carriers: ['workbench', 'serverRack', 'crate'], store: 'project', exts: ['zip'] },
  model: { label: '3D 模型', kind: 'model', carriers: ['pedestal', 'crate'], store: 'asset', exts: ['glb', 'gltf'] },
  data: { label: '代码与数据', kind: 'data', carriers: ['monitor', 'reader', 'crate'], store: 'text', exts: ['json', 'csv', 'tsv', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'sql', 'yaml', 'yml', 'toml', 'xml', 'sh', 'lua', 'php', 'vue', 'svelte', 'ini'] },
  file: { label: '文件', kind: 'file', carriers: ['crate'], store: 'asset', exts: [] }
};
const ART_KINDS = Object.values(ART_TYPES).map(t => t.kind).filter(k => !['web', 'game2'].includes(k));
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', pdf: 'application/pdf', glb: 'model/gltf-binary', gltf: 'model/gltf+json', json: 'application/json', csv: 'text/csv', tsv: 'text/tab-separated-values', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', ico: 'image/x-icon' };
Object.assign(KIND_LABEL, { doc: '文档', image: '图片', video: '视频', audio: '音频', pdf: 'PDF', project: '项目', model: '3D 模型', data: '代码与数据', file: '文件' });
Object.assign(KIND_COLOR, { doc: ['#c9a06a', '#8a5a2b'], image: ['#ff9a3d', '#ff5aa8'], video: ['#3d5afe', '#62e6ff'], audio: ['#7c4dff', '#ff5aa8'], pdf: ['#e04646', '#ff9a3d'], project: ['#34b88a', '#3d9be8'], model: ['#62e6ff', '#7ee0a1'], data: ['#2b2f3a', '#62e6ff'], file: ['#56607a', '#a99db4'] });

function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
function baseName(name) { return String(name || '').split('/').pop().replace(/\.[a-z0-9]+$/i, ''); }
function mimeOf(name, fallback) { return MIME[extOf(name)] || fallback || 'application/octet-stream'; }
function isTextName(name) { return TEXT_EXTS.includes(extOf(name)) || /(^|\/)(readme|license|makefile|dockerfile)$/i.test(name); }
function typeOfName(name, mime) {
  const ext = extOf(name);
  for (const [t, d] of Object.entries(ART_TYPES)) if (d.exts.includes(ext)) return t;
  if (/^image\//.test(mime || '')) return 'image';
  if (/^video\//.test(mime || '')) return 'video';
  if (/^audio\//.test(mime || '')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (/zip/.test(mime || '')) return 'project';
  if (/^text\//.test(mime || '')) return 'doc';
  return 'file';
}
// 强信号：关键字开头、;{} 结尾、整行是 name(...) 调用、单独的闭括号
const CODE_STRONG = /^\s*(import |export |from \S+ import |def \w+\s*\(|class \w+\s*[:({]|class \w+ extends |(async )?function\b\s*[\w$]*\s*\(|async (def|\()|(const|let|var) [\w$[{][^=]*[=;]|return\b|package |#include|#!|SELECT |CREATE |INSERT |UPDATE |\/\/)|[;{}]\s*$|^\s*[\w$.]+\s*\(.*\)\s*;?\s*$|^\s*[)\]]+[;,]?\s*$/;
// 弱信号：缩进（不含 Markdown 列表）、关键字开头以 : 结尾的块、赋值、装饰器
const CODE_WEAK = /^(\t| {2,})(?![-*+] |\d+\. )\S|^\s*(if|elif|else|for|while|try|except|finally|with)\b.*:\s*$|^\s*[\w$.[\]]+\s*[-+*\/]?=[^=]|^\s*@\w/;
// 粘贴的文本或 .html 文件：网页、小游戏、文档还是代码
function sniffText(text) {
  const t = String(text || '').trim();
  if (/^<(!doctype html|html|head|body)\b/i.test(t) || (/<(script|canvas|div|style|svg)\b/i.test(t) && /<\/\w+>/.test(t) && !/^#{1,6} /m.test(t))) {
    return /<canvas\b/i.test(t) && /(keydown|requestAnimationFrame|gamepad|score)/i.test(t) ? 'game' : 'web';
  }
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return 'data'; } catch (e) {} }
  const lines = t.split('\n').filter(l => l.trim()), md = lines.filter(l => /^(#{1,6} |[-*] |\d+\. |> |```)/.test(l)).length;
  const strong = lines.filter(l => CODE_STRONG.test(l)).length, weak = lines.filter(l => !CODE_STRONG.test(l) && CODE_WEAK.test(l)).length;
  // 至少一行强信号，避免把首行缩进的段落当成代码；空行不进分母，短片段也能过半
  return strong > 0 && strong + weak >= md * 2 && strong + weak >= lines.length * .5 ? 'data' : 'doc';
}
function titleFromText(text, type) {
  const t = String(text || '');
  if (type === 'web' || type === 'game') { const m = /<title>([^<]{1,60})<\/title>/i.exec(t) || /<h1[^>]*>([^<]{1,60})<\/h1>/i.exec(t); if (m) return m[1].trim(); }
  const h = /^#{1,2} +(.{1,60})$/m.exec(t); if (h) return h[1].trim();
  const first = t.split('\n').map(s => s.trim()).find(Boolean); return first ? first.replace(/^[#>*\-\s]+/, '').slice(0, 30) : '';
}
function artCarrier(type, want) { const d = ART_TYPES[type] || ART_TYPES.file; return d.carriers.includes(want) ? want : d.carriers[0]; }
function carrierName(type) { return (ITEMS[type] && ITEMS[type].name) || type; }

/* ---------- cleaning entry.art from other people's rooms ---------- */
const ASSET_RE = /^(local:)?[A-Za-z0-9_.-]{1,100}$/;
function cleanArt(a, prefix, collected) {
  if (!a || typeof a !== 'object' || !ART_TYPES[a.t]) return null;
  const o = { t: a.t, name: String(a.name || '').slice(0, 80), mime: String(a.mime || '').slice(0, 60), bytes: Math.max(0, +a.bytes || 0) };
  if (typeof a.asset === 'string' && ASSET_RE.test(a.asset)) o.asset = a.asset;
  if (validUrl(a.url)) o.url = String(a.url).trim().slice(0, 500);
  if (typeof a.work === 'string' && WORK_RE.test(a.work) && (!prefix || a.work.startsWith(prefix) || collected)) o.work = a.work;
  else if (!CLOUD.ready && typeof a.work === 'string' && /^local:[A-Za-z0-9_-]{1,60}$/.test(a.work)) o.work = a.work;
  if (a.made) o.made = String(a.made).slice(0, 30);
  if (a.w > 0 && a.h > 0) { o.w = Math.round(+a.w); o.h = Math.round(+a.h); }
  return o.asset || o.url || o.work ? o : null;
}
