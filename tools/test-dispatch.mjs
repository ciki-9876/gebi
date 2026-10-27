#!/usr/bin/env node
// dispatch.mjs 的回归测试：node tools/test-dispatch.mjs
// 用假的 board 和假的 Agent，覆盖：命令注入、无待办、有待办、重复启动、超时结束进程树。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DISPATCH = join(dirname(fileURLToPath(import.meta.url)), 'dispatch.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'gebi-dispatch-test-'));
let failed = 0;
const ok = (c, m) => { console.log((c ? '通过  ' : '失败  ') + m); if (!c) failed++; };

// 假 board：内容由 todo.txt 决定，有内容就退出 10
writeFileSync(join(tmp, 'board.mjs'), `import { readFileSync, existsSync } from 'node:fs';
const f = ${JSON.stringify(join(tmp, 'todo.txt'))};
if (existsSync(f) && readFileSync(f, 'utf8').trim()) { console.log(readFileSync(f, 'utf8')); process.exit(10); }`);
// 假 Agent：把标准输入存下来，并记一次启动
writeFileSync(join(tmp, 'agent.cjs'), `const fs = require('fs'); let d = ''; process.stdin.on('data', c => d += c).on('end', () => { fs.appendFileSync(${JSON.stringify(join(tmp, 'runs.txt'))}, 'x'); fs.writeFileSync(${JSON.stringify(join(tmp, 'stdin.txt'))}, d); });`);
// 假 Agent：起一个孙进程后一直挂着，测超时
writeFileSync(join(tmp, 'hang.cjs'), `const { spawn } = require('child_process'); const c = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(join(tmp, 'grandchild.pid'))}, String(c.pid)); setInterval(() => {}, 1000);`);

let n = 0;
function run(extra, env = {}) {
  const home = join(tmp, 'home' + (env.HOMEKEY || ++n)); delete env.HOMEKEY;
  return spawnSync(process.execPath, [DISPATCH, '--name', 'T', '--once', '--cwd', tmp, ...extra], { encoding: 'utf8', timeout: 60000, env: { ...process.env, GEBI_DISPATCH_HOME: home, GEBI_BOARD_SCRIPT: join(tmp, 'board.mjs'), ...env } });
}
const agent = `"${process.execPath}" "${join(tmp, 'agent.cjs')}"`;
const runs = () => existsSync(join(tmp, 'runs.txt')) ? readFileSync(join(tmp, 'runs.txt'), 'utf8').length : 0;

/* 1. --cmd 里写 {prompt} 一律拒绝，不启动 */
let r = run(['--cmd', `${agent} {prompt}`]);
ok(r.status === 2 && /\{prompt\}/.test(r.stderr) && runs() === 0, '--cmd 含 {prompt} 时直接报错退出，不启动');

/* 2. 无待办不启动 */
writeFileSync(join(tmp, 'todo.txt'), '');
r = run(['--cmd', agent]);
ok(r.status === 0 && runs() === 0, '无待办：不启动 Agent');

/* 3. 恶意标题：引号、cmd 元字符、$()、反引号，都不能产生副作用，且原样出现在标准输入里 */
const marker = join(tmp, 'INJECTED');
const evil = [
  `title " & echo INJECTED> "${marker}" & rem "`,
  `title $(touch "${marker}") \`touch "${marker}"\` ; touch "${marker}" ; | touch "${marker}"`,
  `title ' ; touch "${marker}" ; '`,
];
for (const [i, t] of evil.entries()) {
  writeFileSync(join(tmp, 'todo.txt'), `  - #1 ${t}\n`);
  r = run(['--cmd', agent]);
  ok(!existsSync(marker), `恶意标题 ${i + 1}：没有执行其中的命令`);
  ok(readFileSync(join(tmp, 'stdin.txt'), 'utf8').includes(t) && /不可信/.test(readFileSync(join(tmp, 'stdin.txt'), 'utf8')), `恶意标题 ${i + 1}：原样交给 Agent（标准输入），并标明是不可信数据`);
}
ok(runs() === 3, '有待办：每次都启动了 Agent');

/* 4. 同一批待办不重复启动（同一个状态目录跑两次） */
writeFileSync(join(tmp, 'todo.txt'), '  - #2 same\n');
const before = runs();
run(['--cmd', agent], { HOMEKEY: 'dup' }); run(['--cmd', agent], { HOMEKEY: 'dup' });
ok(runs() === before + 1, '同一批待办：连续检查两次只启动一次');

/* 5. 超时：Agent 和它的子进程都被结束 */
writeFileSync(join(tmp, 'todo.txt'), '  - #3 hang\n');
const t0 = Date.now();
r = run(['--cmd', `"${process.execPath}" "${join(tmp, 'hang.cjs')}"`, '--timeout', '0.05']);
const pid = +readFileSync(join(tmp, 'grandchild.pid'), 'utf8');
let alive = true; for (let i = 0; i < 20 && alive; i++) { try { process.kill(pid, 0); spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},200)']); } catch (e) { alive = false; } }
ok(Date.now() - t0 < 30000 && !alive, '超时：Agent 和它启动的子进程都已结束');

rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
