#!/usr/bin/env node
// board.mjs 的回归测试：node tools/test-board.mjs
// 用假的 gh（按路径返回固定数据），覆盖：无待办、有待办、出错、暂停、休眠与恢复、机器人活动不算、作者 PR 的新评论。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOARD = join(dirname(fileURLToPath(import.meta.url)), 'board.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'gebi-board-test-'));
let failed = 0;
const ok = (c, m) => { console.log((c ? '通过  ' : '失败  ') + m); if (!c) failed++; };

const NOW = '2026-10-27T12:00:00Z';
const ago = h => new Date(Date.parse(NOW) - h * 3600000).toISOString();
const pr = (number, author, labels, extra = {}) => ({ number, title: 'PR' + number, html_url: 'https://x/' + number, draft: false, state: 'open', head: { ref: `${author}/feat/x`, sha: 'sha' + number }, labels: labels.map(name => ({ name })), created_at: ago(100), updated_at: ago(1), ...extra });
const ev = (type, login, h) => ({ type, actor: { login }, created_at: ago(h) });
const checks = names => ({ check_runs: names.map(n => ({ name: n, conclusion: 'success', started_at: ago(1) })) });

// 假 gh：data.json 里 key 是 API 路径的前缀，值是返回内容；"__fail" 表示失败
const fake = join(tmp, 'gh.cjs');
writeFileSync(fake, `const fs=require('fs');const d=JSON.parse(fs.readFileSync(${JSON.stringify(join(tmp, 'data.json'))},'utf8'));
const p=process.argv[3].replace(/^repos\\/[^/]+\\/[^/]+\\//,'');
if(d.__fail){console.error('gh: HTTP 500');process.exit(1)}
const k=Object.keys(d).filter(k=>p.startsWith(k)).sort((a,b)=>b.length-a.length)[0];
if(!k){console.error('gh: no fixture for '+p);process.exit(1)}
console.log(JSON.stringify(d[k]));`);

function run(data, flags = ['--quiet'], who = 'PCClaude') {
  writeFileSync(join(tmp, 'data.json'), JSON.stringify(data));
  return spawnSync(process.execPath, [BOARD, who, ...flags], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'o/r', GEBI_GH_SCRIPT: fake, GEBI_NOW: NOW } });
}
const base = (over = {}) => ({ 'issues?state=open&labels=project%3Apaused': [], 'issues?state=open&labels=handoff': [], 'events': [ev('IssueCommentEvent', 'ciki-9876', 2)], 'pulls?state=open': [], ...over });

let r = run(base());
ok(r.status === 0 && r.stdout === '', '无待办：退出 0，什么也不输出');

r = run(base({ pulls: [] , 'pulls?state=open': [pr(5, 'HomeGPT', ['ready-for-review', 'handoff:PCClaude'])] }));
ok(r.status === 10 && /^mode=active/.test(r.stdout) && /待你评审/.test(r.stdout) && /#5/.test(r.stdout), '有待办：退出 10，第一行带 mode=active，列出待评审');

r = run({ __fail: true });
ok(r.status === 20 && r.stdout === '' && /board 出错：gh: HTTP 500/.test(r.stderr), 'gh 出错：退出 20，原因在标准错误，标准输出为空');

r = run(base({ 'issues?state=open&labels=project%3Apaused': [{ number: 9 }], 'pulls?state=open': [pr(5, 'HomeGPT', ['ready-for-review', 'handoff:PCClaude'])] }));
ok(r.status === 0 && r.stdout === '', '房主暂停：有待办也退出 0，不叫醒');
r = run(base({ 'issues?state=open&labels=project%3Apaused': [{ number: 9 }], 'pulls?state=open': [pr(5, 'HomeGPT', ['ready-for-review', 'handoff:PCClaude'])] }), []);
ok(r.status === 0 && /mode=paused/.test(r.stdout) && /#5/.test(r.stdout), '暂停时手动运行：仍然列出待办，并说明已暂停');

const old = [ev('IssueCommentEvent', 'ciki-9876', 80), ev('PushEvent', 'ciki-9876', 100)];
r = run(base({ events: old }), ['--status']);
ok(/mode=dormant/.test(r.stdout), '72 小时没有活动：休眠');
r = run(base({ events: [ev('IssueCommentEvent', 'github-actions[bot]', 1), ev('PullRequestEvent', 'github-actions[bot]', 2), ...old] }), ['--status']);
ok(/mode=dormant/.test(r.stdout), '机器人的评论和标签变化不算活动，仍然休眠');
r = run(base({ events: [ev('WatchEvent', 'someone', 1), ...old] }), ['--status']);
ok(/mode=dormant/.test(r.stdout), '点星标之类不是活动');

r = run(base({ events: old, 'pulls?state=open': [pr(5, 'HomeGPT', ['ready-for-review', 'handoff:PCClaude'], { updated_at: ago(90) })] }));
ok(r.status === 10 && /mode=dormant/.test(r.stdout) && /天没动静/.test(r.stdout), '休眠时遗留的交接不会丢：照样退出 10，标出放了几天');
r = run(base({ events: [ev('IssuesEvent', 'ciki-9876', 0.2), ...old] }), ['--status']);
ok(/mode=active/.test(r.stdout), '房主一动（改标签、开 issue）就恢复活跃');

// 作者自己的 PR
const mine = pr(7, 'PCClaude', ['ready-for-review', 'handoff:HomeGPT']);
const c = (who, h, body) => ({ user: { login: 'ciki-9876' }, body: `— ${who}\n\n${body}`, created_at: ago(h) });
r = run(base({ 'pulls?state=open': [mine], 'issues/7/comments': [c('PCClaude', 10, '交付'), c('HomeGPT', 3, '这里有个疑问')] }));
ok(r.status === 10 && /新评论/.test(r.stdout) && /HomeGPT/.test(r.stdout), '我的 PR 上有人在我最后一次发言之后留言（没改标签）：列为待办');
r = run(base({ 'pulls?state=open': [mine], 'issues/7/comments': [c('HomeGPT', 12, '先前的疑问'), c('PCClaude', 3, '已回复')] }));
ok(r.status === 0, '我已经回复过：不再提醒');
r = run(base({ 'pulls?state=open': [mine], 'issues/7/comments': [c('PCClaude', 10, '交付'), c('路由机器人', 3, '已指派')] }));
ok(r.status === 0, '路由机器人的评论不算');
r = run(base({ 'pulls?state=open': [pr(7, 'PCClaude', ['handoff:PCClaude'])] }));
ok(r.status === 10 && /等你修改/.test(r.stdout), '评审给了“需修改”：列为等你修改');

// 评论超过 100 条：新反馈在第二页也要看到
const page1 = Array.from({ length: 100 }, (_, i) => c('PCClaude', 200 - i * 0.5, '旧'));
r = run(base({ 'pulls?state=open': [mine], 'issues/7/comments?per_page=100&page=1': page1, 'issues/7/comments?per_page=100&page=2': [c('HomeGPT', 1, '第 101 条是新反馈')] }));
ok(r.status === 10 && /新评论/.test(r.stdout), '评论超过 100 条：第二页的新反馈也能看到');

// 每日辩论 issue 上的活动不算
const dbg = (type, h, labels) => ({ ...ev(type, 'ciki-9876', h), payload: { issue: { labels: labels.map(name => ({ name })) } } });
r = run(base({ events: [dbg('IssueCommentEvent', 1, ['debate']), dbg('IssuesEvent', 2, ['debate-eval', 'needs-human']), ...old] }), ['--status']);
ok(/mode=dormant/.test(r.stdout), '辩论 issue 上的发言和标签变化不算活动，仍然休眠');
r = run(base({ events: [dbg('IssueCommentEvent', 1, ['bug']), ...old] }), ['--status']);
ok(/mode=active/.test(r.stdout), '别的 issue 上的发言照常算活动');

// 最近 100 条事件全是辩论或机器人的，真实活动在第二页：不能误判休眠
const dbgEvents = n => Array.from({ length: n }, (_, i) => dbg('IssueCommentEvent', 0.1 + i * 0.001, ['debate']));
r = run(base({ 'events?per_page=100&page=1': dbgEvents(100), 'events?per_page=100&page=2': [ev('PushEvent', 'ciki-9876', 30)] }), ['--status']);
ok(/mode=active/.test(r.stdout) && !/90 天内/.test(r.stdout), '第一页全是辩论事件，第二页有真实活动：判活跃，不误判休眠');
r = run(base({ 'events?per_page=100&page=1': dbgEvents(100), 'events?per_page=100&page=2': [ev('PushEvent', 'ciki-9876', 100)] }), ['--status']);
ok(/mode=dormant/.test(r.stdout), '第一页全是辩论事件，第二页的活动已超过 72 小时：休眠');
r = run(base({ 'events?per_page=100&page=1': dbgEvents(100), 'events?per_page=100&page=2': dbgEvents(100), 'events?per_page=100&page=3': dbgEvents(100) }), ['--status']);
ok(/mode=active/.test(r.stdout) && /无法判断/.test(r.stdout), '翻到页数上限还没结论：按活跃处理，不静默判休眠');

// 只能定时唤醒模型的环境：下次隔多久
const nc = d => run(d, ['--next-check']).stdout.trim();
ok(nc(base()) === '30', '--next-check：活跃 30 分钟');
ok(nc(base({ events: old })) === '1440', '--next-check：休眠 1440 分钟');
ok(nc(base({ 'issues?state=open&labels=project%3Apaused': [{ number: 9 }] })) === '1440', '--next-check：暂停也是 1440（不停掉定时，只拉到最慢）');

// 出错时 --next-check 不输出数字，调用方就不会误改定时
r = run({ __fail: true }, ['--next-check']);
ok(r.status === 20 && r.stdout.trim() === '', '--next-check 出错：退出 20，标准输出为空（不会误改定时）');
// 活跃 → 休眠 → 活跃 的完整过程（模型定时环境每次醒来都问一次）
const flow = [base(), base({ events: old }), base({ events: [ev('IssuesEvent', 'ciki-9876', 0.2), ...old] })].map(d => run(d, ['--next-check']).stdout.trim());
ok(flow.join() === '30,1440,30', 'active → dormant → active：--next-check 依次是 30、1440、30');

// 暂停 → 撤销标签 → 自动恢复（脚本环境：定时一直在跑，下一次就列出待办）
const todoPR = [pr(5, 'HomeGPT', ['ready-for-review', 'handoff:PCClaude'])];
const pausedD = base({ 'issues?state=open&labels=project%3Apaused': [{ number: 9 }], 'pulls?state=open': todoPR });
const resumedD = base({ 'pulls?state=open': todoPR });
const seq = [run(pausedD).status, run(pausedD).status, run(resumedD).status];
ok(seq.join() === '0,0,10', '暂停期间两次检查都退出 0，撤销 project:paused 后的下一次检查退出 10');

// 可合并
r = run(base({ 'pulls?state=open': [pr(8, 'HomeGPT', ['reviewed:MacGPT'])], 'commits/sha8/check-runs': checks(['check', 'identity', 'review']) }));
ok(r.status === 10 && /可以由你合并/.test(r.stdout), '评审通过且三项检查全绿：可以合并');
r = run(base({ 'pulls?state=open': [pr(8, 'HomeGPT', ['reviewed:MacGPT'])], 'commits/sha8/check-runs': checks(['check', 'identity']) }));
ok(r.status === 0, '检查没全绿：不叫醒');

rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
