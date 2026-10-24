#!/usr/bin/env node
// 现在该我做什么：node tools/board.mjs <你的名字>
// 列出：待我评审的 PR、等我修改的 PR、评审通过可以由我合并的 PR、指派给我的 issue。
// 需要 gh（GitHub CLI）已登录。没有要做的事时只输出一行，适合放在定时检查里。规则见 AGENTS.md「自动接力」。
import { execFileSync } from 'node:child_process';

const me = process.argv[2];
if (!me) { console.error('用法：node tools/board.mjs <你的名字>'); process.exit(2); }

function repoName() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(url); if (!m) throw new Error('认不出仓库地址：' + url); return m[1];
}
const repo = repoName();
const gh = path => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${path}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
const authorOf = p => (p.head.ref.match(/^([A-Za-z0-9-]+)\//) || [])[1];
const names = p => p.labels.map(l => l.name);
const link = p => `#${p.number} ${p.title}  ${p.html_url}`;

function checksGreen(p) {
  const runs = gh(`commits/${p.head.sha}/check-runs?per_page=100`).check_runs, last = {};
  for (const r of runs) if (!last[r.name] || r.started_at > last[r.name].started_at) last[r.name] = r;
  return ['check', 'identity', 'review'].every(n => last[n] && last[n].conclusion === 'success');
}

const todo = { review: [], fix: [], merge: [], issues: [], waiting: [] };
for (const p of gh('pulls?state=open&per_page=100')) {
  if (p.draft) continue;
  const author = authorOf(p), ls = names(p), reviewers = ls.filter(l => l.startsWith('reviewed:')).map(l => l.slice(9)).filter(r => r !== author);
  if (author === me) {
    if (ls.includes(`handoff:${me}`)) todo.fix.push(link(p));
    else todo.waiting.push(link(p) + (reviewers.length ? `（已由 ${reviewers.join('、')} 评审，等它合并）` : '（等评审）'));
    continue;
  }
  if (reviewers.length && checksGreen(p)) { todo.merge.push(link(p) + `（${reviewers.join('、')} 已评审，三项检查通过）`); continue; }
  if (ls.includes('ready-for-review') && (ls.includes(`handoff:${me}`) || ls.includes('handoff:any')) && !ls.includes(`reviewed:${me}`)) todo.review.push(link(p) + `（作者 ${author}）`);
}
for (const i of gh(`issues?state=open&labels=${encodeURIComponent('handoff:' + me)}&per_page=100`)) if (!i.pull_request) todo.issues.push(`#${i.number} ${i.title}  ${i.html_url}`);

const section = (t, list) => list.length ? `\n${t}\n${list.map(x => '  - ' + x).join('\n')}` : '';
const out = [
  section('待你评审（先读 AGENTS.md「评审」，评论格式在那里）：', todo.review),
  section('等你修改（评审给了“需修改”）：', todo.fix),
  section('可以由你合并（评审通过，三项检查全绿，你不是作者）：', todo.merge),
  section('指派给你的 issue：', todo.issues),
].join('');
if (!out) console.log(`${me}：现在没有需要你处理的事。${todo.waiting.length ? '（你的 PR 在等别人：' + todo.waiting.join('；') + '）' : ''}`);
else { console.log(`${me} 的待办：${out}`); if (todo.waiting.length) console.log('\n你的 PR 在等别人：\n' + todo.waiting.map(x => '  - ' + x).join('\n')); }
