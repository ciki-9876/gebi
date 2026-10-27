#!/usr/bin/env node
// tools/debate.mjs 的测试：用内存里的假 GitHub 把一场场辩论走一遍。node tools/test-debate.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tick, replay, finalWinner, parseRoster, assignRoles, parseWinner, laParts, TRIAL } from './debate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROSTER = readFileSync(join(ROOT, 'docs/agents/roster.md'), 'utf8');
let passed = 0; const failed = [];
const ok = (cond, name) => { if (cond) passed++; else failed.push(name); };

/* ---------- 假 GitHub ---------- */
// 标签按最严格的情况模拟：打一个仓库里不存在的标签就报错，所以机器人必须先建好标签。
// failOnce(method, 片段) 让下一次匹配的请求失败一次，用来测试中途失败后重试。
function fakeGitHub(labels = []) {
  const issues = [], catalog = new Map(labels.map(n => [n, {}])), fails = [];
  const find = n => issues.find(i => i.number === n);
  const known = names => { const miss = names.filter(n => !catalog.has(n)); if (miss.length) throw new Error('422 标签不存在：' + miss.join()); };
  const api = async (method, path, body) => {
    const f = fails.findIndex(x => x.method === method && path.includes(x.part)); if (f >= 0) { fails.splice(f, 1); throw new Error(`模拟失败 ${method} ${path}`); }
    const [p, q = ''] = path.split('?'), qs = new URLSearchParams(q), seg = p.split('/').filter(Boolean);
    if (seg[0] === 'labels') {
      if (method === 'GET') return catalog.has(decodeURIComponent(seg[1])) ? { name: decodeURIComponent(seg[1]) } : null;
      if (method === 'POST') { if (catalog.has(body.name)) throw new Error('422 标签已存在'); catalog.set(body.name, body); return body; }
    }
    if (seg[0] !== 'issues') throw new Error('没模拟 ' + path);
    if (seg.length === 1 && method === 'GET') {
      let list = issues.filter(i => qs.get('state') === 'all' || i.state === (qs.get('state') || 'open'));
      if (qs.get('labels')) list = list.filter(i => i.labels.some(l => l.name === qs.get('labels')));
      const per = +qs.get('per_page') || 30, page = +qs.get('page') || 1;
      return list.slice((page - 1) * per, page * per).map(i => ({ ...i, labels: i.labels.map(l => ({ ...l })) }));
    }
    if (seg.length === 1 && method === 'POST') { known(body.labels || []); const i = { number: issues.length + 1, title: body.title, body: body.body, state: 'open', labels: (body.labels || []).map(name => ({ name })), comments: [] }; issues.push(i); return i; }
    const i = find(+seg[1]);
    if (seg.length === 2 && method === 'PATCH') { Object.assign(i, body); return i; }
    if (seg[2] === 'labels' && method === 'POST') { known(body.labels); for (const name of body.labels) if (!i.labels.some(l => l.name === name)) i.labels.push({ name }); return i.labels; }
    if (seg[2] === 'labels' && method === 'DELETE') { i.labels = i.labels.filter(l => l.name !== decodeURIComponent(seg[3])); return null; }
    if (seg[2] === 'comments' && method === 'GET') { const per = +qs.get('per_page') || 30, page = +qs.get('page') || 1; return i.comments.slice((page - 1) * per, page * per); }
    if (seg[2] === 'comments' && method === 'POST') { const c = { body: body.body, user: { type: 'Bot' }, created_at: clock.toISOString() }; i.comments.push(c); return c; }
    throw new Error(`没模拟 ${method} ${path}`);
  };
  // Agent 发言：用的是房主账号，所以 user.type 是 User
  const say = (n, name, text, at = clock) => find(n).comments.push({ body: `— ${name}\n\n${text}`, user: { type: 'User' }, created_at: at.toISOString() });
  return { issues, api, say, find, catalog, failOnce: (method, part) => fails.push({ method, part }) };
}
let clock = new Date('2026-10-28T16:30:00Z');
const at = iso => { clock = new Date(iso); return clock; };
const handoffs = i => i.labels.map(l => l.name).filter(l => l.startsWith('handoff:')).sort();
const run = gh => tick({ api: gh.api, roster: ROSTER, now: clock, repo: 'ciki-9876/gebi' });

/* ---------- 登记表、时间、裁决解析 ---------- */
const agents = parseRoster(ROSTER);
ok(agents.length >= 3 && !agents.some(a => a.name === 'owner'), '登记表只取 Agent，不含房主');
ok(agents.find(a => a.name === 'PCClaude').family === 'claude' && agents.find(a => a.name === 'HomeGPT').family === 'gpt', '按工具列分出模型家族');
ok(laParts(new Date('2026-10-28T17:05:00Z')).hour === 10, '夏令时：UTC 17 点是洛杉矶 10 点');
ok(laParts(new Date('2026-11-02T18:05:00Z')).hour === 10, '冬令时：UTC 18 点是洛杉矶 10 点');
ok(parseWinner('**胜方**：蓝方') === 'blue' && parseWinner('胜方: 红方') === 'red' && parseWinner('胜方：**平局**') === 'draw' && parseWinner('没写') === null, '解析裁决里的胜方');

/* ---------- 排班：5 个 Agent，5 场一轮 ---------- */
{
  const five = parseRoster('| `A1` | Agent | Claude Code | x |\n| `A2` | Agent | Codex | x |\n| `A3` | Agent | Codex | x |\n| `A4` | Agent | Claude Code | x |\n| `A5` | Agent | Codex | x |\n');
  const h = []; for (let i = 0; i < 5; i++) h.push(assignRoles(five, h));
  const c = role => Object.fromEntries(five.map(a => [a.name, h.filter(x => role === 'red' ? x.red === a.name : x[role].includes(a.name)).length]));
  ok(Object.values(c('red')).every(v => v === 1), '5 场里每人当 1 次红方');
  ok(Object.values(c('blue')).every(v => v === 2) && Object.values(c('judges')).every(v => v === 2), '5 场里每人当 2 次蓝方、2 次裁判');
  ok(h.every(x => new Set([x.red, ...x.blue, ...x.judges]).size === 5), '同一场里没有人身兼两职');
  const fam = Object.fromEntries(five.map(a => [a.name, a.family]));
  ok(h.filter(x => fam[x.judges[0]] !== fam[x.judges[1]]).length >= 4, '2 个 Claude、3 个 GPT 时，至少 4 场裁判是一家一个');
  const three = parseRoster('| `A1` | Agent | Claude Code | x |\n| `A2` | Agent | Codex | x |\n| `A3` | Agent | Codex | x |\n');
  const r3 = assignRoles(three, []);
  ok(r3 && r3.blue.length === 1 && r3.judges.length === 1, '只有 3 个 Agent 时：1 红方、1 蓝方、1 裁判');
  ok(assignRoles(three.slice(0, 2), []) === null, '少于 3 个 Agent 开不了');
}

/* ---------- 一整场：开场、推进、超时、裁决 ---------- */
const gh = fakeGitHub();
at('2026-10-28T16:30:00Z'); await run(gh);
ok(gh.issues.length === 0, '洛杉矶 10 点以前不开场');
at('2026-10-28T17:05:00Z'); await run(gh);
const d1 = gh.find(1), s1 = JSON.parse(/<!-- debate (\{.*?\}) -->/.exec(d1.body)[1]);
ok(d1 && d1.labels.some(l => l.name === 'debate') && d1.title.includes('2026-10-28') && d1.title.includes('商业化'), '10 点开场，周三的主题是商业化');
ok(handoffs(d1).join() === `handoff:${s1.red}`, '开场把 handoff 交给红方');
ok(d1.comments.filter(c => c.body.includes('<!-- debate-round 1 -->')).length === 1, '开场发出第 1 轮通知');
ok(d1.body.includes('https://github.com/ciki-9876/gebi/blob/main/docs/debates/README.md'), '正文链到规则');
at('2026-10-28T17:35:00Z'); await run(gh);
ok(gh.issues.length === 1 && d1.comments.length === 1, '同一天重复运行不重复开场、不重复通知');

gh.say(1, s1.blue[0], '【立论】我替红方说'); gh.say(1, s1.red, '我先想想，没带标记');
at('2026-10-28T17:50:00Z'); await run(gh);
ok(handoffs(d1).join() === `handoff:${s1.red}`, '不是本轮的人、或者没带标记，都不算发言');

gh.say(1, s1.red, '【立论】\n1. 主张……'); at('2026-10-28T18:00:00Z'); await run(gh);
ok(handoffs(d1).join() === `handoff:${s1.blue[0]}`, '红方立论后交给蓝方一');
ok(d1.comments.some(c => c.body.includes('<!-- debate-round 2 -->')), '发出第 2 轮通知');

at('2026-10-28T21:10:00Z'); await run(gh); // 蓝方一 3 小时没发言
ok(handoffs(d1).join() === `handoff:${s1.blue[1]}`, '蓝方一超时，跳到蓝方二');
ok(d1.comments.find(c => c.body.includes('<!-- debate-round 3 -->')).body.includes(`第 2 轮（${s1.blue[0]}）`), '通知里写明谁超时被跳过');
gh.say(1, s1.blue[0], '【驳论】晚了'); at('2026-10-28T21:20:00Z'); await run(gh);
ok(handoffs(d1).join() === `handoff:${s1.blue[1]}`, '超时之后的发言不算');

gh.say(1, s1.blue[1], '【补充】……'); at('2026-10-28T21:40:00Z'); await run(gh);
ok(handoffs(d1).join() === `handoff:${s1.red}`, '蓝方二补充后交回红方回应');
gh.say(1, s1.red, '【回应】……'); at('2026-10-28T22:00:00Z'); await run(gh);
ok(handoffs(d1).join() === s1.judges.map(j => `handoff:${j}`).sort().join(), '红方回应后两位裁判同时接手');
gh.say(1, s1.judges[0], '【裁决】\n**胜方**：蓝方'); at('2026-10-28T22:30:00Z'); await run(gh);
ok(handoffs(d1).join() === `handoff:${s1.judges[1]}` && d1.state === 'open', '一位裁判交了，只剩另一位');
gh.say(1, s1.judges[1], '【裁决】\n**胜方**：红方'); at('2026-10-28T23:00:00Z'); await run(gh);
ok(d1.state === 'closed' && d1.labels.some(l => l.name === 'winner:draw'), '两位裁判不一致判平局，关闭 issue');
ok(handoffs(d1).length === 0, '结束后撤下所有 handoff');
ok(d1.comments.filter(c => c.body.includes('<!-- debate-done')).length === 1, '发出结束总结');
at('2026-10-28T23:30:00Z'); await run(gh);
ok(d1.comments.filter(c => c.body.includes('<!-- debate-done')).length === 1, '已关闭的不再处理');

/* ---------- 第二天：换红方、列出以前的辩论；红方没立论就流局 ---------- */
at('2026-10-29T17:10:00Z'); await run(gh);
const d2 = gh.find(2), s2 = JSON.parse(/<!-- debate (\{.*?\}) -->/.exec(d2.body)[1]);
ok(s2.n === 2 && s2.red !== s1.red, '第二天换一个红方');
ok(d2.body.includes('#1 ') && d2.body.includes('平局'), '正文列出以前的辩论和结果');
at('2026-10-29T20:20:00Z'); await run(gh);
ok(d2.state === 'closed' && d2.labels.some(l => l.name === 'winner:void'), '红方 3 小时没立论：流局');

/* ---------- 只有一位裁判交了：按这一位 ---------- */
{
  const st = { red: 'R', blue: ['B1', 'B2'], judges: ['J1', 'J2'], opened: '2026-10-30T17:00:00Z' };
  const c = (name, text, t) => ({ body: `— ${name}\n${text}`, user: { type: 'User' }, created_at: t });
  const r = replay(st, [c('R', '【立论】', '2026-10-30T17:10:00Z'), c('B1', '【驳论】', '2026-10-30T17:20:00Z'), c('B2', '【补充】', '2026-10-30T17:30:00Z'), c('R', '【回应】', '2026-10-30T17:40:00Z'), c('J1', '【裁决】胜方：红方', '2026-10-30T18:00:00Z')], new Date('2026-10-30T21:00:00Z').getTime());
  ok(r.round === 6 && r.verdicts.J1 === 'red' && r.skipped.length === 1 && r.skipped[0].who.join() === 'J2', '一位裁判超时，结果按另一位');
  const bot = replay(st, [{ body: '— 辩论机器人\n轮到 R：【立论】', user: { type: 'Bot' }, created_at: '2026-10-30T17:01:00Z' }], new Date('2026-10-30T17:30:00Z').getTime());
  ok(bot.round === 1, '机器人自己的通知不算发言');
}

/* ---------- 暂停 ---------- */
{
  const g = fakeGitHub(['project:paused']);
  await g.api('POST', '/issues', { title: '项目开关', body: '', labels: ['project:paused'] });
  at('2026-10-28T17:05:00Z'); await run(g);
  ok(g.issues.length === 1, '项目暂停时不开场');
}

/* ---------- 冬令时开场时间 ---------- */
{
  const g = fakeGitHub();
  at('2026-11-02T17:30:00Z'); await run(g);
  ok(g.issues.length === 0, '冬令时 UTC 17:30 是洛杉矶 9:30，不开场');
  at('2026-11-02T18:05:00Z'); await run(g);
  ok(g.issues.length === 1 && g.find(1).title.includes('2026-11-02'), '冬令时 UTC 18:05 开场');
}

/* ---------- 试行结束：办满之后开一次评估 ---------- */
{
  const g = fakeGitHub();
  for (let d = 0; d < TRIAL; d++) {
    const day = new Date(Date.UTC(2026, 9, 28 + d, 18, 5)); // UTC 18:05 冬夏令时都在洛杉矶 10 点以后
    at(day.toISOString()); await run(g);
    at(new Date(day.getTime() + 3.5 * 3600e3).toISOString()); await run(g); // 每场都流局，快速走完
  }
  const held = g.issues.filter(i => i.labels.some(l => l.name === 'debate'));
  ok(held.length === TRIAL && held.every(i => i.state === 'closed'), `${TRIAL} 场都办完`);
  at('2026-11-05T18:05:00Z'); await run(g);
  const ev = g.issues.filter(i => i.labels.some(l => l.name === 'debate-eval'));
  ok(ev.length === 1 && ev[0].labels.some(l => l.name === 'needs-human') && ev[0].body.includes('为什么是房主'), '办满后开一个评估 issue，打 needs-human，写明为什么要房主');
  ok(g.issues.filter(i => i.labels.some(l => l.name === 'debate')).length === TRIAL, '办满后不再开新的一场');
  at('2026-11-06T18:05:00Z'); await run(g);
  ok(g.issues.filter(i => i.labels.some(l => l.name === 'debate-eval')).length === 1, '评估 issue 只开一次');
}

/* ---------- 标签：第一次运行时仓库里一个都没有 ---------- */
{
  const g = fakeGitHub();
  at('2026-10-28T17:05:00Z'); await run(g);
  const st = JSON.parse(/<!-- debate (\{.*?\}) -->/.exec(g.find(1).body)[1]);
  ok(g.catalog.has('debate') && g.catalog.get('debate').description === '每日红蓝辩论' && g.catalog.has(`handoff:${st.red}`), '第一次运行先建 debate 和 handoff 标签，再开场');
  g.say(1, st.red, '【立论】……'); at('2026-10-28T17:30:00Z'); await run(g);
  ok(g.catalog.has(`handoff:${st.blue[0]}`), '换人时缺的 handoff 标签也会先建');
  at('2026-10-29T06:00:00Z'); await run(g); // 后面 4 轮各 3 小时，全部超时；这时洛杉矶还是 10-28 晚上，不会开新场
  ok(g.find(1).state === 'closed' && g.catalog.has('winner:none') && g.find(1).labels.some(l => l.name === 'winner:none'), '结束时先建 winner 标签再打上');
}

/* ---------- 裁决要写明胜方才算 ---------- */
{
  const st = { red: 'R', blue: ['B1', 'B2'], judges: ['J1', 'J2'], opened: '2026-10-30T17:00:00Z' };
  const c = (name, text, t) => ({ body: `— ${name}\n${text}`, user: { type: 'User' }, created_at: t });
  const pre = [c('R', '【立论】', '2026-10-30T17:10:00Z'), c('B1', '【驳论】', '2026-10-30T17:20:00Z'), c('B2', '【补充】', '2026-10-30T17:30:00Z'), c('R', '【回应】', '2026-10-30T17:40:00Z'), c('J1', '【裁决】\n**胜方**：红方', '2026-10-30T18:00:00Z'), c('J2', '【裁决】我还需要时间', '2026-10-30T18:10:00Z')];
  const r1 = replay(st, pre, new Date('2026-10-30T18:20:00Z').getTime());
  ok(r1.round === 5 && r1.speakers.join() === 'J2' && !('J2' in r1.verdicts), '没写胜方的裁决不算交了，handoff 留给这位裁判');
  const r2 = replay(st, [...pre, c('J2', '【裁决】\n**胜方**：蓝方', '2026-10-30T18:30:00Z')], new Date('2026-10-30T18:40:00Z').getTime());
  ok(r2.round === 6 && r2.verdicts.J2 === 'blue', '补一条写明胜方的裁决就算数');
  const r3 = replay(st, pre, new Date('2026-10-30T21:00:00Z').getTime());
  ok(r3.round === 6 && finalWinner(st, r3) === 'red' && r3.skipped.some(s => s.round === 5 && s.who.join() === 'J2'), '一直没写胜方就按超时处理，结果按另一位');
}

/* ---------- 结束时中途失败，重试不重复 ---------- */
for (const [method, part, name] of [['POST', '/labels', '打 winner 标签'], ['PATCH', '/issues/1', '关闭 issue']]) {
  const g = fakeGitHub();
  at('2026-10-28T17:05:00Z'); await run(g);
  at('2026-10-28T20:10:00Z'); g.failOnce(method, part); // 红方超时流局，结束的某一步失败
  let threw = false; try { await run(g); } catch (e) { threw = true; }
  at('2026-10-28T20:20:00Z'); await run(g);
  const d = g.find(1);
  ok(threw && d.state === 'closed' && d.comments.filter(c => c.body.includes('<!-- debate-done')).length === 1 && d.labels.filter(l => l.name === 'winner:void').length === 1, `${name}失败后重试：只发一次总结、只打一次标签，最后关闭`);
}

for (const f of failed) console.log('失败  ' + f);
console.log(failed.length ? `\n${failed.length} 项失败，${passed} 项通过` : `\n${passed} 项全部通过`);
process.exit(failed.length ? 1 : 0);
