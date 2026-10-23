#!/usr/bin/env node
// 隔壁发布工具：把任何 AI 做的作品打包成隔壁的发布链接或发布包。协议见 docs/PUBLISH.md
// 不依赖任何 npm 包，需要 Node 18 以上。
//
// 作为 MCP 服务器（Claude Desktop、Claude Code、Cursor、Codex 等）：
//   { "mcpServers": { "gebi": { "command": "node", "args": ["/path/to/gebi-publish.mjs"] } } }
//   Claude Code 也可以：claude mcp add gebi -- node /path/to/gebi-publish.mjs
//   然后对 AI 说“把这个发布到隔壁”。
//
// 作为命令行工具：
//   node gebi-publish.mjs <文件或文件夹…> [--title 名称] [--desc 介绍] [--type 类型] [--carrier 物件] [--made-with 工具] [--out 目录]
//   node gebi-publish.mjs --url https://… [--title 名称]
//
// 环境变量：GEBI_URL 换成别的隔壁地址（默认线上版本）。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative, resolve, extname } from 'node:path';
import { homedir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const BASE = process.env.GEBI_URL || 'https://claude.ai/artifact/LWAStw84ruoEsCPAvfHYEP';
const LINK_MAX = 48 * 1024, FILE_MAX = 20 * 1024 * 1024, MAX_FILES = 400;
const TYPES = ['web', 'game', 'doc', 'image', 'video', 'audio', 'pdf', 'project', 'model', 'data', 'file'];
const CARRIERS = ['kiosk', 'arcade', 'easel', 'tv', 'reader', 'phono', 'workbench', 'pedestal', 'monitor', 'crate', 'serverRack'];
const TEXT = new Set('html htm md markdown txt json csv tsv js mjs cjs ts tsx jsx css scss py rb go rs java c cpp h hpp cs swift kt sql yaml yml toml xml sh lua php vue svelte ini svg'.split(' '));
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', pdf: 'application/pdf', glb: 'model/gltf-binary', gltf: 'model/gltf+json', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', ico: 'image/x-icon' };
const JUNK = /(^|\/)(__MACOSX|\.git|node_modules|\.DS_Store|Thumbs\.db|\.idea|\.vscode|\.env[^/]*)(\/|$)/;
const ext = p => extname(p).slice(1).toLowerCase();
const FORMATS = `隔壁支持的作品类型（type → 默认物件）：
- web 单个网页 .html → kiosk 展示屏（≤ 200 KB，沙箱里运行）
- game 网页小游戏 → arcade 街机（≤ 200 KB）
- doc 文档 .md .txt → reader 阅读台
- image 图片 .png .jpg .gif .webp .svg → easel 画架（≤ 20 MB）
- video 视频 .mp4 .webm .mov → tv 电视（≤ 20 MB）
- audio 音频 .mp3 .m4a .wav .ogg → phono 唱片机（≤ 20 MB，m4a 兼容性最好）
- pdf → reader 阅读台（≤ 20 MB）
- project 多个文件或 .zip → workbench 工作台（代码文本合计 ≤ 1 MB；有 index.html 时可以直接运行，不支持服务器后端）
- model 3D 模型 .glb → pedestal 展台（≤ 2 MB）
- data 代码和数据 .json .csv .js .py 等 → monitor 显示器（≤ 200 KB）
- file 其他文件 → crate 储物箱
发布方式：内容小时生成发布链接，用户点开后在隔壁里点“发布”；内容大时生成 .gebi.zip 发布包，用户拖进隔壁的发布台。`;

/* ---------- collecting files ---------- */
function walk(dir, root, out) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), rel = relative(root, p).split('\\').join('/');
    if (JUNK.test(rel)) continue;
    if (statSync(p).isDirectory()) walk(p, root, out); else out.push({ path: rel, abs: p });
    if (out.length > MAX_FILES) throw new Error(`文件超过 ${MAX_FILES} 个。去掉依赖目录和构建产物后再试。`);
  }
  return out;
}
function collect(paths) {
  const out = [];
  for (const raw of paths) {
    const p = resolve(raw.replace(/^~(?=\/|$)/, homedir()));
    if (!existsSync(p)) throw new Error(`找不到 ${raw}`);
    if (statSync(p).isDirectory()) walk(p, p, out); else out.push({ path: basename(p), abs: p });
  }
  return out.map(f => {
    const buf = readFileSync(f.abs);
    if (buf.length > FILE_MAX) throw new Error(`${f.path} 有 ${(buf.length / 1048576).toFixed(1)} MB，超过了 20 MB。`);
    return toEntry(f.path, buf);
  });
}
function toEntry(path, buf) {
  if (TEXT.has(ext(path)) || /(^|\/)(readme|license)$/i.test(path)) { const s = buf.toString('utf8'); if (!s.includes('\uFFFD')) return { path, text: s }; }
  return { path, base64: buf.toString('base64'), mime: MIME[ext(path)] || 'application/octet-stream' };
}

/* ---------- manifest → link or package ---------- */
function manifestOf(files, o) {
  const m = { gebi: 1 };
  for (const [k, v] of [['title', o.title], ['desc', o.desc], ['type', o.type], ['carrier', o.carrier], ['made_with', o.made_with], ['entry', o.entry]]) if (v) m[k] = String(v);
  if (m.title) m.title = m.title.slice(0, 30); if (m.desc) m.desc = m.desc.slice(0, 80);
  if (m.type && !TYPES.includes(m.type)) throw new Error(`type 只能是 ${TYPES.join('、')}`);
  if (m.carrier && !CARRIERS.includes(m.carrier)) throw new Error(`carrier 只能是 ${CARRIERS.join('、')}`);
  if (o.url) { if (!/^https?:\/\//.test(o.url)) throw new Error('url 需要以 http:// 或 https:// 开头'); m.url = o.url; }
  else { if (!files.length) throw new Error('没有要发布的内容'); m.files = files; }
  return m;
}
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function publish(files, o) {
  const m = manifestOf(files, o), code = 'z.' + b64url(deflateRawSync(Buffer.from(JSON.stringify(m))));
  const name = m.title || (files[0] && basename(files[0].path)) || '作品';
  if (code.length <= LINK_MAX) return { link: `${BASE}#publish=${code}`, text: `「${name}」的发布链接已经生成。请把这个链接交给用户，让用户点开，在隔壁的发布台里确认后点“发布”：\n\n${BASE}#publish=${code}\n\n（打开链接不会自动发布，需要用户在自己的房间里确认。）` };
  const dir = resolve(o.out_dir || defaultOut()), slug = (m.title || 'gebi').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'gebi';
  const file = join(dir, `${slug}.gebi.zip`), head = Object.assign({}, m); delete head.files;
  writeFileSync(file, zip([{ path: 'gebi.json', data: Buffer.from(JSON.stringify(head, null, 2)) }, ...files.map(f => ({ path: f.path, data: f.text != null ? Buffer.from(f.text) : Buffer.from(f.base64, 'base64') }))]));
  return { file, text: `「${name}」内容比较大，已经打包成发布包：\n\n${file}\n\n请让用户打开隔壁（${BASE}），回到自己的房间，把这个文件拖进页面（或点“发布作品”→“选择文件”），确认后点“发布”。` };
}
function defaultOut() { const d = join(homedir(), 'Downloads'); return existsSync(d) ? d : process.cwd(); }

/* ---------- zip (write, deflate) ---------- */
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function zip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path), raw = e.data, def = deflateRawSync(raw), use = def.length < raw.length, body = use ? def : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(use ? 8 : 0, 8);
    lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(use ? 8 : 0, 10);
    ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, body); centrals.push(ch, name); off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

/* ---------- the three tools ---------- */
const common = {
  title: { type: 'string', description: '作品名，30 字以内' },
  desc: { type: 'string', description: '一句话介绍，80 字以内' },
  type: { type: 'string', enum: TYPES, description: '作品类型，省略时由隔壁判断' },
  carrier: { type: 'string', enum: CARRIERS, description: '想用的物件，省略时用类型的默认物件' },
  made_with: { type: 'string', description: '用什么 AI 工具做的，例如 Claude、ChatGPT、Midjourney' },
  out_dir: { type: 'string', description: '内容太大时发布包保存到哪里，默认是下载文件夹' }
};
const TOOLS = [
  { name: 'gebi_publish_files', description: '把本地的文件或文件夹发布到隔壁（一个把作品摆进 3D 房间的社区）。内容小时返回发布链接，内容大时生成 .gebi.zip 发布包。一个文件夹会作为项目发布，入口是 index.html。', inputSchema: { type: 'object', properties: Object.assign({ paths: { type: 'array', items: { type: 'string' }, description: '要发布的文件或文件夹的路径' }, entry: { type: 'string', description: '项目的入口文件，默认 index.html' } }, common), required: ['paths'] } },
  { name: 'gebi_publish_content', description: '把 AI 刚写出来、还没存成文件的作品发布到隔壁：一段网页代码、一篇 Markdown、一段代码，或者几个文件组成的小项目；也可以只发布一个已经在网上的网址。', inputSchema: { type: 'object', properties: Object.assign({ content: { type: 'string', description: '单个作品的完整内容' }, filename: { type: 'string', description: 'content 的文件名，决定类型，例如 index.html、notes.md、chart.py' }, files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, text: { type: 'string' } }, required: ['path', 'text'] }, description: '多个文本文件，作为项目发布' }, url: { type: 'string', description: '作品已经在网上的话，直接给网址' }, entry: { type: 'string' } }, common) } },
  { name: 'gebi_formats', description: '查看隔壁支持哪些作品类型、对应什么物件、大小限制。发布前不确定时先调用。', inputSchema: { type: 'object', properties: {} } }
];
function callTool(name, a = {}) {
  if (name === 'gebi_formats') return FORMATS;
  if (name === 'gebi_publish_files') { if (!Array.isArray(a.paths) || !a.paths.length) throw new Error('paths 不能为空'); return publish(collect(a.paths), a).text; }
  if (name === 'gebi_publish_content') {
    if (a.url) return publish([], a).text;
    const files = Array.isArray(a.files) && a.files.length ? a.files.map(f => ({ path: String(f.path).replace(/^\.?\/+/, ''), text: String(f.text) }))
      : typeof a.content === 'string' ? [{ path: a.filename || (/^\s*</.test(a.content) ? 'index.html' : 'note.md'), text: a.content }] : [];
    return publish(files, a).text;
  }
  throw new Error('没有这个工具：' + name);
}

/* ---------- MCP over stdio ---------- */
function serve() {
  const send = m => process.stdout.write(JSON.stringify(m) + '\n');
  createInterface({ input: process.stdin }).on('line', line => {
    let msg; try { msg = JSON.parse(line); } catch (e) { return; }
    const { id, method, params } = msg; if (id === undefined) return;
    const ok = result => send({ jsonrpc: '2.0', id, result });
    try {
      if (method === 'initialize') return ok({ protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'gebi-publish', version: VERSION }, instructions: '用户想把作品发布到隔壁时使用这些工具。拿到发布链接后原样交给用户点开；拿到发布包时告诉用户把文件拖进隔壁。' });
      if (method === 'ping') return ok({});
      if (method === 'tools/list') return ok({ tools: TOOLS });
      if (method === 'tools/call') { try { return ok({ content: [{ type: 'text', text: callTool(params.name, params.arguments) }] }); } catch (e) { return ok({ content: [{ type: 'text', text: '发布失败：' + e.message }], isError: true }); } }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
    } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }); }
  });
}

/* ---------- command line ---------- */
function cli(argv) {
  const o = {}, paths = [], keys = { '--title': 'title', '--desc': 'desc', '--type': 'type', '--carrier': 'carrier', '--made-with': 'made_with', '--out': 'out_dir', '--url': 'url', '--entry': 'entry' };
  for (let i = 0; i < argv.length; i++) { if (keys[argv[i]]) o[keys[argv[i]]] = argv[++i]; else if (argv[i] === '--formats') { console.log(FORMATS); return; } else paths.push(argv[i]); }
  try { console.log(o.url ? publish([], o).text : publish(collect(paths), o).text); }
  catch (e) { console.error('发布失败：' + e.message); process.exit(1); }
}

const args = process.argv.slice(2);
if (!args.length || args[0] === '--mcp') serve();
else if (args[0] === '--help' || args[0] === '-h') console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
else cli(args);
