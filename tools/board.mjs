#!/usr/bin/env node
// 现在该我做什么：node tools/board.mjs <你的名字>
// 列出：待我评审的 PR、等我修改的 PR、有人在我的 PR 上留了新评论、评审通过可以由我合并的 PR、指派给我的 issue。
// 需要 gh（GitHub CLI）已登录。规则见 AGENTS.md「自动接力」和 docs/agents/polling.md。
//   --quiet   没有待办时什么也不输出、退出码 0；有待办时输出待办、退出码 10；出错退出码 20（原因在标准错误）。
//             定时任务先用它过滤，只有退出码是 10 才叫醒大模型，没事的时候不花 token。
//   --status  只显示项目现在的模式（活跃 / 休眠 / 暂停）和最近一次活动，退出码 0。
//   --next-check  只输出一个数字：只能定时唤醒模型的环境下次该隔多少分钟再醒（活跃 30，休眠 1440，暂停 1440），退出码 0。
//                 能用脚本过滤的环境不需要它：脚本一直照常跑，暂停和休眠时 --quiet 自己会退出 0。
// 模式（决定别人多久来查一次，见 docs/decisions/0005）：
//   paused   有打着 project:paused 标签的开放 issue：房主暂停了自动检查，--quiet 一律退出 0
//   dormant  最近 72 小时没有人（机器人不算）在仓库里提交、评论、改标签：可以降到每 6 小时检查一次
//   active   其他情况：每 30 分钟检查一次
// 待办每次都是“现在还有哪些”，不是“新发生了什么”，所以休眠醒来后第一次检查就能补上所有遗留的事。
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const me = args.find(a => !a.startsWith('--')), quiet = args.includes('--quiet'), statusOnly = args.includes('--status'), nextCheck = args.includes('--next-check');
if (!me) { console.error('用法：node tools/board.mjs <你的名字> [--quiet|--status]'); process.exit(2); }

const NOW = process.env.GEBI_NOW ? Date.parse(process.env.GEBI_NOW) : Date.now();
const DORMANT_AFTER = 72 * 3600000;
// 算“活动”的事件：人或 Agent 的提交、评论、评审、开关 issue/PR、改标签。机器人（路由、CI）的不算，否则它一发言就永远醒着
const QUIET_LABELS = ['debate', 'debate-eval'];   // 每日辩论 issue 上的发言和标签变化不算活动，否则每天都是活跃，永远休眠不了
const ACTIVITY = new Set(['PushEvent', 'PullRequestEvent', 'PullRequestReviewEvent', 'PullRequestReviewCommentEvent', 'IssueCommentEvent', 'IssuesEvent']);
const BOT_SIGNATURES = ['路由机器人'];

function repoName() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(url); if (!m) throw new Error('认不出仓库地址：' + url); return m[1];
}
const repo = repoName();
const GH = process.env.GEBI_GH_SCRIPT ? [process.execPath, [process.env.GEBI_GH_SCRIPT]] : ['gh', []];   // 测试时换成假的 gh
const gh = path => JSON.parse(execFileSync(GH[0], [...GH[1], 'api', `repos/${repo}/${path}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
// 列表接口一页最多 100 条，翻页读到底（评论按时间排，最新的在最后一页）
function ghAll(path) {
  const all = [];
  for (let page = 1; page <= 50; page++) { const b = gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`); all.push(...b); if (b.length < 100) break; }
  return all;
}
const authorOf = p => (p.head.ref.match(/^([A-Za-z0-9-]+)\//) || [])[1];
const names = p => p.labels.map(l => l.name);
const lane = p => (names(p).find(l => l.startsWith('lane:')) || '').slice(5);
const link = p => `#${p.number} ${p.title}${lane(p) ? ` [${lane(p)}]` : ''}  ${p.html_url}`;
const signer = body => (/^\s*—\s*([^\s\n]+)/.exec(body || '') || [])[1];   // 评论第一行“— 名字”
const stale = p => NOW - Date.parse(p.updated_at) > DORMANT_AFTER ? `（${Math.floor((NOW - Date.parse(p.updated_at)) / 86400000)} 天没动静）` : '';

function checksGreen(p) {
  const runs = gh(`commits/${p.head.sha}/check-runs?per_page=100`).check_runs, last = {};
  for (const r of runs) if (!last[r.name] || r.started_at > last[r.name].started_at) last[r.name] = r;
  return ['check', 'identity', 'review'].every(n => last[n] && last[n].conclusion === 'success');
}

function projectMode() {
  const paused = gh(`issues?state=open&labels=${encodeURIComponent('project:paused')}&per_page=1`).length > 0;
  const events = gh('events?per_page=100').filter(e => ACTIVITY.has(e.type) && !/\[bot\]$/.test(e.actor.login)
    && !((e.payload && e.payload.issue && e.payload.issue.labels) || []).some(l => QUIET_LABELS.includes(l.name)));
  const last = events.map(e => Date.parse(e.created_at)).sort((a, b) => b - a)[0];
  const mode = paused ? 'paused' : (!last || NOW - last > DORMANT_AFTER ? 'dormant' : 'active');
  return { mode, last, text: { paused: '暂停（房主暂停了自动检查）', dormant: '休眠（72 小时没有活动，可降到每 6 小时检查）', active: '活跃（每 30 分钟检查）' }[mode] };
}

function main() {
  const { mode, last, text } = projectMode();
  const when = last ? new Date(last).toISOString() : '90 天内没有';
  if (nextCheck) { console.log(mode === 'active' ? 30 : 1440); return 0; }
  if (statusOnly) { console.log(`mode=${mode}\n项目现在：${text}\n最近一次活动：${when}`); return 0; }
  if (mode === 'paused' && quiet) return 0;

  const todo = { review: [], fix: [], reply: [], merge: [], issues: [], waiting: [] };
  for (const p of ghAll('pulls?state=open')) {
    if (p.draft) continue;
    const author = authorOf(p), ls = names(p), reviewers = ls.filter(l => l.startsWith('reviewed:')).map(l => l.slice(9)).filter(r => r !== author);
    if (author === me) {
      if (ls.includes(`handoff:${me}`)) todo.fix.push(link(p) + stale(p));
      else {
        // 别人在我最后一次发言之后留了评论，但没改标签：board 靠这条补上
        const cs = ghAll(`issues/${p.number}/comments`).filter(c => !BOT_SIGNATURES.includes(signer(c.body)));
        const mine = cs.filter(c => signer(c.body) === me).map(c => Date.parse(c.created_at)).sort((a, b) => b - a)[0] || Date.parse(p.created_at);
        const fresh = cs.filter(c => signer(c.body) !== me && Date.parse(c.created_at) > mine);
        if (fresh.length) todo.reply.push(link(p) + `（${fresh.length} 条新评论，来自 ${[...new Set(fresh.map(c => signer(c.body) || '未署名'))].join('、')}）`);
        else todo.waiting.push(link(p) + (reviewers.length ? `（已由 ${reviewers.join('、')} 评审，等它合并）` : '（等评审）'));
      }
      continue;
    }
    if (reviewers.length && checksGreen(p)) { todo.merge.push(link(p) + `（${reviewers.join('、')} 已评审，三项检查通过）`); continue; }
    if (ls.includes('ready-for-review') && (ls.includes(`handoff:${me}`) || ls.includes('handoff:any')) && !ls.includes(`reviewed:${me}`)) todo.review.push(link(p) + `（作者 ${author}）` + stale(p));
  }
  for (const i of ghAll(`issues?state=open&labels=${encodeURIComponent('handoff:' + me)}`)) if (!i.pull_request) todo.issues.push(`#${i.number} ${i.title}  ${i.html_url}` + stale(i));

  const section = (t, list) => list.length ? `\n${t}\n${list.map(x => '  - ' + x).join('\n')}` : '';
  const out = [
    section('待你评审（先读 AGENTS.md「评审」，评论格式在那里）：', todo.review),
    section('等你修改（评审给了“需修改”）：', todo.fix),
    section('有人在你的 PR 上留了新评论（读一读，需要的话回复或修改）：', todo.reply),
    section('可以由你合并（评审通过，三项检查全绿，你不是作者）：', todo.merge),
    section('指派给你的 issue：', todo.issues),
  ].join('');
  const head = `mode=${mode}\n`;
  if (!out && quiet) return 0;
  if (!out) console.log(`${me}：现在没有需要你处理的事。${mode === 'paused' ? '（房主暂停了自动检查）' : ''}${todo.waiting.length ? '（你的 PR 在等别人：' + todo.waiting.join('；') + '）' : ''}`);
  else {
    console.log(`${head}${me} 的待办：${out}`);
    if (mode === 'paused') console.log('\n（房主暂停了自动检查；你在手动查看，所以仍然列出）');
    if (todo.waiting.length) console.log('\n你的 PR 在等别人：\n' + todo.waiting.map(x => '  - ' + x).join('\n'));
    if (quiet) return 10;
  }
  return 0;
}

try { process.exitCode = main(); }
catch (e) {
  const detail = String((e.stderr && e.stderr.toString().trim()) || e.message).split('\n')[0].slice(0, 200);
  console.error('board 出错：' + detail);
  process.exitCode = 20;
}
