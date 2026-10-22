#!/usr/bin/env node
// 把 styles/tokens.css 导出成设计系统页面用的 design-system/project/tokens.json，
// 并把组件样式打包成 design-system/project/components/bundle.css。
// tokens.css 是唯一的事实来源：不要手改 tokens.json。
//
//   node tools/sync-tokens.mjs          生成
//   node tools/sync-tokens.mjs --check  只检查生成物是否和源文件一致（CI 用）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const CHECK = process.argv.includes('--check');

/* ---------- 1. 解析 tokens.css ---------- */
const css = read('styles/tokens.css');
const body = css.slice(css.indexOf(':root {') + 7, css.lastIndexOf('}'));
const decls = [];
const errors = [];
for (const line of body.split('\n')) {
  const m = /^\s*--([a-z0-9-]+):\s*(.+?);\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/.exec(line);
  if (!m) continue;
  const [, name, value, note] = m;
  if (!note) errors.push(`--${name} 没有用途注释`);
  decls.push({ name, value: value.trim(), usage: note || '' });
}
if (errors.length) { console.error('tokens.css 有问题：\n  ' + errors.join('\n  ')); process.exit(1); }

const SKIP = new Set(['focus-ring', 'gutter']);   // 复合值或依赖 env()，设计系统页面表达不了，只留在代码里
const isColor = v => /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|rgba|hsl|hsla|oklch)\(/.test(v);
const colorNames = new Set(decls.filter(d => isColor(d.value)).map(d => d.name));
const fam = (prefix, list = decls) => list.filter(d => d.name.startsWith(prefix) && !SKIP.has(d.name));
const tok = d => ({ name: d.name, value: d.value.replace(/^-\./, '-0.').replace(/^\./, '0.'), usage: d.usage });

const color = [];
for (const d of decls) {
  if (SKIP.has(d.name)) continue;
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(d.value);
  if (isColor(d.value)) color.push({ name: d.name, value: d.value.replace(/\s+/g, ' ').toLowerCase(), usage: d.usage });
  else if (alias && colorNames.has(alias[1])) { color.push({ name: d.name, value: `{${alias[1]}}`, usage: d.usage }); colorNames.add(d.name); }
}

const font = n => decls.find(d => d.name === n).value;
const px = n => font(n);
const S = (name, size, lh, weight, extra = {}) => Object.assign({ name, fontSize: px(size), lineHeight: +font(lh), fontWeight: +font(weight) }, extra);
const tokens = {
  name: '隔壁设计系统',
  version: 1,
  meta: { source: 'github', repo: 'ciki-9876/gebi', ref: 'main', paths: { tokens: ['styles/tokens.css'], components: ['styles/components.css', 'styles/app.css'] }, generator: 'tools/sync-tokens.mjs' },
  color: { themes: [{ id: 'night', name: '夜间' }], tokens: color },
  type: {
    fonts: [],
    families: { sans: font('font-sans'), mono: font('font-mono') },
    groups: [
      { name: '标题', family: 'sans', styles: [
        S('display-xl', 'fs-5xl', 'lh-tight', 'fw-bold', { letterSpacing: '-0.02em', sample: '给写代码的人一间房', usage: '首页主标题。一屏一个，强调词用 accent-text。' }),
        S('display', 'fs-4xl', 'lh-tight', 'fw-bold', { letterSpacing: '-0.02em', sample: '隔壁 · 产品设计方案', usage: '方案书封面等大标题。' }),
        S('title-page', 'fs-3xl', 'lh-tight', 'fw-bold', { letterSpacing: '-0.02em', sample: '十秒看懂的作品', usage: '整页浮层（物件流、方案书章节）的标题。' }),
        S('title-section', 'fs-2xl', 'lh-snug', 'fw-semibold', { sample: '作品越来越多，被打开的越来越少', usage: '区块标题。' }),
        S('title-panel', 'fs-xl', 'lh-snug', 'fw-semibold', { letterSpacing: '-0.01em', sample: '番茄与像素', usage: '侧边面板与窗口的标题。' })
      ] },
      { name: '正文', family: 'sans', styles: [
        S('lead', 'fs-lg', 'lh-loose', 'fw-regular', { sample: '在地球上挑一个真实地址，把你写的网页作品搬进去。', usage: '引导段落，颜色用 text-2。' }),
        S('body', 'fs-base', 'lh-body', 'fw-regular', { sample: '房主还没写名片。', usage: '正文与面板里的说明。' }),
        S('ui', 'fs-md', 'lh-snug', 'fw-medium', { sample: '敲门进去', usage: '按钮、列表、表单标签：界面的默认字号。' }),
        S('caption', 'fs-sm', 'lh-body', 'fw-regular', { sample: '只能参观的“查看者”不会留下记录。', usage: '辅助说明，颜色用 text-2 或 text-3。' })
      ] },
      { name: '等宽', family: 'mono', styles: [
        S('plate', 'fs-lg', 'lh-tight', 'fw-semibold', { letterSpacing: '0.02em', sample: '302', usage: '门牌号。只用 accent-text，配一扇亮着的小窗。' }),
        S('eyebrow', 'fs-xs', 'lh-snug', 'fw-medium', { letterSpacing: '0.08em', sample: 'ROOM · 642', usage: '眉标与分组标题，全大写，颜色 text-3。' }),
        S('data', 'fs-sm', 'lh-body', 'fw-regular', { sample: '约 35.6°N 139.6°E · 城市级', usage: '坐标、主机名、数字。' })
      ] }
    ]
  },
  spacing: { tokens: fam('sp-').map(tok) },
  radius: { tokens: fam('r-').map(tok) },
  shadow: { tokens: [...fam('shadow-'), ...decls.filter(d => d.name === 'highlight')].map(tok) },
  fontSize: { tokens: fam('fs-').map(tok) },
  lineHeight: { tokens: fam('lh-').map(tok) },
  fontWeight: { tokens: fam('fw-').map(tok) },
  letterSpacing: { tokens: fam('tracking-').map(tok) },
  controlHeight: { tokens: [...fam('h-'), ...decls.filter(d => d.name === 'hit-min')].map(tok) },
  blur: { tokens: decls.filter(d => d.name === 'blur').map(tok) },
  duration: { tokens: fam('dur-').map(tok) },
  easing: { tokens: fam('ease-').map(tok) },
  zIndex: { tokens: fam('z-').map(tok) }
};

/* ---------- 2. 组件样式 bundle.css ---------- */
// components.css 全部 + app.css 里几个会在预览中出现的模块（按选择器前缀抽取单行规则）
const EXPORT = ['.mark', '.oc', '.win-bar', '.win-dot', '.win-t', '.win-sub', '.win-host', '.win-sdk', '.win-act', '.wbtn', '.win-get', '.gsearch', '.gsugg', '.theme-chip', '.gpin', '.pending-row', '.pr-l', '.pr-i'];
const appCss = read('styles/app.css').split('\n').filter(l => EXPORT.some(p => l.startsWith(p)) && l.trim().endsWith('}'));
const PREVIEW_BASE = `/* 预览页底：对应 styles/base.css 里与预览相关的部分 */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--text-1); font-family: var(--font-sans); font-size: var(--fs-base); line-height: var(--lh-body); -webkit-font-smoothing: antialiased; }
button, input, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
[hidden] { display: none !important; }
code { font-family: var(--font-mono); font-size: .88em; background: var(--surface-3); border: 1px solid var(--border-1); padding: 1px 5px; border-radius: var(--r-xs); }
.mute { color: var(--text-2); } .small { font-size: var(--fs-sm); }
.row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
.stack { display: grid; gap: var(--sp-3); }
`;
const bundle = `/* 隔壁设计系统 · 组件样式 —— 由 tools/sync-tokens.mjs 从 styles/components.css 与 styles/app.css 生成，不要手改 */\n${PREVIEW_BASE}\n${read('styles/components.css')}\n/* ---- 来自 styles/app.css ---- */\n${appCss.join('\n')}\n`;

/* ---------- 3. 写出或检查 ---------- */
const out = {
  'design-system/project/tokens.json': JSON.stringify(tokens, null, 2) + '\n',
  'design-system/project/components/bundle.css': bundle
};
let stale = 0;
for (const [p, text] of Object.entries(out)) {
  let cur = null; try { cur = read(p); } catch (e) {}
  if (cur === text) continue;
  if (CHECK) { console.error(`过期：${p}，请运行 node tools/sync-tokens.mjs`); stale++; continue; }
  mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), text); console.log('写入', p);
}
console.log(`颜色 ${color.length} · 间距 ${tokens.spacing.tokens.length} · 圆角 ${tokens.radius.tokens.length} · 字号 ${tokens.fontSize.tokens.length} · 组件样式 ${appCss.length} 条来自 app.css`);
if (stale) process.exit(1);
