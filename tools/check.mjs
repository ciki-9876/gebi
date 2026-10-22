#!/usr/bin/env node
// 提交前检查：node tools/check.mjs
// 不依赖任何 npm 包。CI（.github/workflows/check.yml）在每个 PR 上跑同一个脚本。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const errors = [], warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/* 1. app.js 能被解析 */
const app = read('app.js');
try { new Function(app); } catch (e) { err('app.js', '语法错误：' + e.message); }

/* 2. 所有 var(--x) 都在 tokens.css 里定义（--c、--tc 是按数据传入的局部变量） */
const tokensCss = read('styles/tokens.css');
const defined = new Set([...tokensCss.matchAll(/--([a-z0-9-]+):/g)].map(m => m[1]));
const LOCAL = new Set(['c', 'tc']);
const sheets = ['styles/base.css', 'styles/components.css', 'styles/app.css'];
for (const f of sheets) {
  const t = read(f);
  for (const m of t.matchAll(/var\(--([a-z0-9-]+)/g)) if (!defined.has(m[1]) && !LOCAL.has(m[1])) err(f, `第 ${lineOf(t, m.index)} 行用了未定义的 token --${m[1]}`);
  // 3. 组件只用语义 token，不直接引用原始色板
  for (const m of t.matchAll(/var\(--(ink|fog|lamp|screen|live|alarm)-[0-9a-z]+\)|var\(--heat-400\)/g)) err(f, `第 ${lineOf(t, m.index)} 行直接引用了原始色板 ${m[0]}，请改用语义 token`);
}
for (const m of app.matchAll(/var\(--([a-z0-9-]+)/g)) if (!defined.has(m[1]) && !LOCAL.has(m[1]) && !['acc', 'on'].includes(m[1])) err('app.js', `第 ${lineOf(app, m.index)} 行用了未定义的 token --${m[1]}`);

/* 4. base.css 与 components.css 里不写颜色字面量；app.css 里的字面量只报提醒 */
const LIT = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)v]*\)/g;
for (const f of ['styles/base.css', 'styles/components.css']) {
  const t = read(f).replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  for (const m of t.matchAll(LIT)) err(f, `第 ${lineOf(t, m.index)} 行写了颜色字面量 ${m[0]}，请改用 token`);
}
{
  const f = 'styles/app.css', t = read(f).replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const n = [...t.matchAll(LIT)].length;
  const BASELINE = 39;   // 现有字面量：房主作品自带皮肤、天色、毛玻璃光晕。只能减少，不要增加
  if (n > BASELINE) err(f, `颜色字面量 ${n} 处，超过基线 ${BASELINE}。新样式请用 token`);
  else if (n) warn(f, `还有 ${n} 处颜色字面量（基线 ${BASELINE}）`);
}

/* 5. app.js 里的 style="..." 只允许传数据（自定义属性或模板插值），布局用工具类 */
for (const m of app.matchAll(/style="([^"]*)"/g)) {
  const v = m[1];
  if (/^--[a-z]+:\$\{/.test(v) || v.includes('${') || /^position:|^margin:0;height:100vh|^font:400 13px/.test(v)) continue;
  err('app.js', `第 ${lineOf(app, m.index)} 行有内联样式 style="${v.slice(0, 40)}"，请用 styles/base.css 里的工具类`);
}

/* 6. 设计系统导出与 tokens.css 同步 */
try { execFileSync(process.execPath, [join(ROOT, 'tools/sync-tokens.mjs'), '--check'], { stdio: 'pipe' }); }
catch (e) { err('design-system/', '与 styles/tokens.css 不同步，运行 node tools/sync-tokens.mjs'); }

/* 7. 不提交本地预览产物和大文件 */
const walk = d => readdirSync(join(ROOT, d)).flatMap(n => { if (n.startsWith('.') || n === 'node_modules') return []; const p = d ? `${d}/${n}` : n; return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]; });
for (const p of walk('')) {
  const size = statSync(join(ROOT, p)).size;
  if (p === 'preview.html') warn(p, '本地预览产物，不要提交（已在 .gitignore）');
  if (size > 1024 * 1024 && !['assets/land.txt'].includes(p) && extname(p) !== '.xlsx') err(p, `文件 ${(size / 1048576).toFixed(1)} MB，超过 1 MB`);
}

for (const w of warns) console.log('提醒  ' + w);
for (const e of errors) console.log('错误  ' + e);
console.log(errors.length ? `\n${errors.length} 个错误` : '\n检查通过');
process.exit(errors.length ? 1 : 0);
