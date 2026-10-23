#!/usr/bin/env node
// 把 src/*.js 按文件名顺序拼成 app.js：node tools/build.mjs
// node tools/build.mjs --check 只检查 app.js 是否与 src/ 同步，不写文件（check.mjs 会调用）
// 不依赖任何 npm 包。拼接结果包在一个 IIFE 里，各文件共享同一个作用域，和拆分前的 app.js 完全一样。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADER = '// 生成文件：由 tools/build.mjs 把 src/ 里的文件按顺序拼接而成。不要直接修改，改 src/ 后运行 node tools/build.mjs\n';

const files = readdirSync(join(ROOT, 'src')).filter(n => /^\d{2}-[a-z0-9-]+\.js$/.test(n)).sort();
const parts = files.map(n => {
  const t = readFileSync(join(ROOT, 'src', n), 'utf8');
  return t.endsWith('\n') ? t : t + '\n';
});
const out = HEADER + "(() => {\n'use strict';\n" + parts.join('') + '})();\n';

if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(join(ROOT, 'app.js'), 'utf8'); } catch (e) {}
  if (cur !== out) { console.log('app.js 与 src/ 不同步，运行 node tools/build.mjs'); process.exit(1); }
  console.log(`app.js 与 src/ 同步（${files.length} 个文件）`);
} else {
  writeFileSync(join(ROOT, 'app.js'), out);
  console.log(`已生成 app.js（${files.length} 个文件，${(Buffer.byteLength(out) / 1024).toFixed(0)} KB）`);
}
