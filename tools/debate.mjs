#!/usr/bin/env node
// 每日红蓝辩论的主持机器人，由 .github/workflows/debate.yml 运行。规则见 docs/debates/README.md。
//   每小时一次：洛杉矶时间 10 点以后、今天还没开场，就按登记表排班开一场；推进进行中的辩论，超时的轮次跳过。
//   辩论 issue 有新评论时：立即推进。
// 轮次的状态不另存，每次都从评论重放出来，所以重复运行、漏跑一次都不会出错。不依赖任何 npm 包。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TZ = 'America/Los_Angeles', OPEN_HOUR = 10, ROUND_HOURS = 3, TRIAL = 7;
export const BOT = '— 辩论机器人';
const H = 3600e3;
// 休眠判断和 tools/board.mjs（0005）用同一套规则：72 小时内没有人（机器人不算，辩论 issue 上的动静也不算）
// 在仓库里提交、评论、评审、开关 issue/PR、改标签，就是休眠。休眠时只能定时唤醒模型的 Agent 一天才查一次，
// 赶不上每轮 3 小时的时限，所以不开场；有人活动后下一次运行自动恢复
export const DORMANT_HOURS = 72;
const ACTIVITY = new Set(['PushEvent', 'PullRequestEvent', 'PullRequestReviewEvent', 'PullRequestReviewCommentEvent', 'IssueCommentEvent', 'IssuesEvent']);
const QUIET_LABELS = ['debate', 'debate-eval'];
// 返回 { last } 最近一次有效活动的时间（0 表示 72 小时内没有），或 { unknown: true } 翻了 3 页还判断不了（按活跃处理，同 board）
export async function lastActivity(api, now) {
  for (let page = 1; page <= 3; page++) {
    const b = await api('GET', `/events?per_page=100&page=${page}`) || [];
    const hit = b.filter(e => ACTIVITY.has(e.type) && !/\[bot\]$/.test((e.actor && e.actor.login) || '')
      && !((e.payload && e.payload.issue && e.payload.issue.labels) || []).some(l => QUIET_LABELS.includes(l.name)));
    if (hit.length) return { last: Math.max(...hit.map(e => Date.parse(e.created_at))) };
    if (b.length < 100 || now - Date.parse(b[b.length - 1].created_at) > DORMANT_HOURS * H) return { last: 0 };
  }
  return { unknown: true };
}
export const ROUNDS = [
  null,
  { mark: '【立论】', side: 'red', text: '红方立论' },
  { mark: '【驳论】', side: 'blue0', text: '蓝方一驳论' },
  { mark: '【补充】', side: 'blue1', text: '蓝方二补充' },
  { mark: '【回应】', side: 'red', text: '红方回应' },
  { mark: '【裁决】', side: 'judges', text: '裁判裁决' },
];
// 按洛杉矶的星期几轮换主题，0 是周日
export const TOPICS = ['自由选题', '产品', '市场', '商业化', '技术', '合规与隐私', '协作与流程'];
const WINNER = { red: '红方', blue: '蓝方', draw: '平局', none: '无裁决', void: '流局' };

/* ---------- 登记表 ---------- */
// 类型是 Agent 的行；工具列用来区分模型家族，裁判尽量一家一个
export function parseRoster(md) {
  return [...md.matchAll(/^\|\s*`([^`]+)`\s*\|\s*Agent\s*\|\s*([^|]+?)\s*\|/gm)].map(m => ({ name: m[1], family: /claude/i.test(m[2]) ? 'claude' : /codex|gpt/i.test(m[2]) ? 'gpt' : m[2].toLowerCase() }));
}

/* ---------- 时间 ---------- */
export function laParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
export const laTime = d => { const p = laParts(d); return `${p.day.slice(5).replace('-', '/')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`; };

/* ---------- 排班 ---------- */
// 按历史次数挑：红方挑当红方最少的；裁判挑当裁判最少的两人，次数相同时优先一家一个；剩下的当蓝方。
// 5 个 Agent 时，5 场一轮，每人 1 次红方、2 次蓝方、2 次裁判。
export function assignRoles(agents, history) {
  const n = agents.length; if (n < 3) return null;
  const count = (name, role) => history.filter(h => role === 'red' ? h.red === name : (h[role] || []).includes(name)).length;
  const names = agents.map(a => a.name), fam = Object.fromEntries(agents.map(a => [a.name, a.family]));
  // 次数相同时从上一场的下一位开始轮，避免总是登记表前面的人先上
  const rot = name => (names.indexOf(name) - history.length % n + n) % n;
  const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const red = [...names].sort((a, b) => lex([count(a, 'red'), rot(a)], [count(b, 'red'), rot(b)]))[0];
  const rest = names.filter(x => x !== red);
  const judgesN = n >= 5 ? 2 : 1, blueN = Math.min(2, rest.length - judgesN);
  const pairs = judgesN === 1 ? rest.map(a => [a]) : rest.flatMap((a, i) => rest.slice(i + 1).map(b => [a, b]));
  // 先看当裁判的总次数，再看两人里多的那个，再看是不是同一家，最后轮转顺序
  const key = p => [p.reduce((s, x) => s + count(x, 'judges'), 0), Math.max(...p.map(x => count(x, 'judges'))), p.length > 1 && fam[p[0]] === fam[p[1]] ? 1 : 0, p.reduce((s, x) => s + rot(x), 0)];
  const judges = pairs.sort((a, b) => lex(key(a), key(b)))[0];
  const blue = rest.filter(x => !judges.includes(x)).sort((a, b) => lex([count(a, 'blue'), rot(a)], [count(b, 'blue'), rot(b)])).slice(0, blueN);
  return { red, blue, judges };
}

/* ---------- issue 正文里的状态 ---------- */
export const STATE_RE = /<!-- debate (\{.*?\}) -->/;
export function readState(body) { const m = STATE_RE.exec(body || ''); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } }

/* ---------- 从评论重放轮次 ---------- */
const speakerOf = body => { const m = /^\s*—\s*([A-Za-z0-9-]+)\s*$/m.exec(String(body || '').split('\n').find(l => l.trim()) || ''); return m ? m[1] : null; };
export const isBotComment = c => (c.user && c.user.type === 'Bot') || String(c.body || '').trim().startsWith(BOT);
export function parseWinner(body) { const m = /胜方\**\s*[：:]\s*\**\s*(红方|蓝方|平局)/.exec(body || ''); return m ? { 红方: 'red', 蓝方: 'blue', 平局: 'draw' }[m[1]] : null; }

// 返回现在是第几轮（6 表示结束）、谁该发言、截止时间、跳过了哪些、裁决
export function replay(st, comments, now) {
  const who = r => { const s = ROUNDS[r].side; return s === 'red' ? [st.red] : s === 'judges' ? st.judges : [st.blue[+s.slice(4)]].filter(Boolean); };
  let round = 1, start = new Date(st.opened).getTime();
  const skipped = [], verdicts = {}, spoke = {};
  const deadline = () => start + ROUND_HOURS * H;
  const next = (t, timedOut) => {
    if (timedOut) { const missing = who(round).filter(x => round !== 5 || !(x in verdicts)); skipped.push({ round, who: missing }); }
    if (round === 1 && timedOut) { round = 6; return; } // 红方没立论：流局
    round++; start = t;
    while (round <= 5 && !who(round).length) round++; // 蓝方不足两人时跳过空轮
  };
  const list = comments.filter(c => !isBotComment(c)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const c of list) {
    const t = new Date(c.created_at).getTime();
    while (round <= 5 && t > deadline()) next(deadline(), true);
    if (round > 5) break;
    const name = speakerOf(c.body);
    if (!who(round).includes(name) || !String(c.body).includes(ROUNDS[round].mark)) continue;
    // 裁决要写明胜方才算；没写的不算交了，handoff 留着，等他补一条或者超时
    if (round === 5) { const w = parseWinner(c.body); if (w && !(name in verdicts)) verdicts[name] = w; if (st.judges.every(j => j in verdicts)) next(t, false); }
    else { spoke[round] = name; next(t, false); }
  }
  while (round <= 5 && now > deadline()) next(deadline(), true);
  return { round, deadline: round <= 5 ? new Date(deadline()) : null, speakers: round <= 5 ? who(round).filter(x => round !== 5 || !(x in verdicts)) : [], skipped, verdicts, spoke };
}

// 两位裁判一致取一致的结论；不一致是平局；只有一位裁判交了就按这一位；红方没立论是流局
export function finalWinner(st, r) {
  if (r.skipped.some(s => s.round === 1)) return 'void';
  const v = st.judges.map(j => r.verdicts[j]).filter(Boolean);
  if (!v.length) return 'none';
  return v.every(x => x === v[0]) ? v[0] : 'draw';
}

/* ---------- 文案 ---------- */
const roleLine = st => `- 红方：**${st.red}**\n- 蓝方：${st.blue.map(b => `**${b}**`).join('、') || '（无）'}\n- 裁判：${st.judges.map(j => `**${j}**`).join('、')}`;
export function issueBody(st, previous, repo) {
  const prev = previous.length ? previous.map(p => `- #${p.number} ${p.title}（${p.result}）`).join('\n') : '- （这是第一场）';
  return `${BOT}

第 ${st.n} 场（试行 ${TRIAL} 场）。今天的主题：**${st.topic}**。规则和发言模板见 [docs/debates/README.md](https://github.com/${repo}/blob/main/docs/debates/README.md)，发言前先读。

${roleLine(st)}

**轮次**（每轮 ${ROUND_HOURS} 小时，超时跳过；时间是洛杉矶时间）：
1. 红方 ${st.red} 【立论】：最多 3 条论点，每条写清主张、证据、后果、什么情况下你会认输
2. 蓝方一 ${st.blue[0] || '—'} 【驳论】：逐条反驳
3. 蓝方二 ${st.blue[1] || '—'} 【补充】：补蓝方一没覆盖的，不重复
4. 红方 ${st.red} 【回应】：逐条认输或加证据
5. 裁判 ${st.judges.join('、')} 【裁决】：各自独立判，写完自己的再看对方的

发言是一条评论：第一行 \`— <你的名字>\`，正文里带上本轮的标记（比如 \`【立论】\`）。机器人看到后会把 \`handoff:\` 交给下一位。

**以前的辩论**（不许重复旧论点，除非带来新证据）：
${prev}

<!-- debate ${JSON.stringify(st)} -->`;
}
const roundNote = (st, r) => {
  const skip = r.skipped.length ? `\n\n超时跳过：${r.skipped.map(s => `第 ${s.round} 轮（${s.who.join('、')}）`).join('；')}。` : '';
  const R = ROUNDS[r.round];
  return `${BOT}\n\n轮到 ${r.speakers.map(s => `**${s}**`).join('、')}：第 ${r.round} 轮${R.text}，评论里带上 \`${R.mark}\`，截止 ${laTime(r.deadline)}（洛杉矶）。${skip}\n\n<!-- debate-round ${r.round} -->`;
};
const closeNote = (st, r, w) => {
  const v = st.judges.map(j => `${j}：${r.verdicts[j] ? WINNER[r.verdicts[j]] : '未裁决'}`).join('；');
  const skip = r.skipped.length ? `\n\n超时跳过：${r.skipped.map(s => `第 ${s.round} 轮（${s.who.join('、')}）`).join('；')}。` : '';
  return `${BOT}\n\n本场结束：**${WINNER[w]}**。${w === 'void' ? '红方没有在时限内立论。' : `裁判：${v}。`}${skip}\n\n裁判留下的观点在上面的裁决里；每位裁判最多开 1 个 \`from-debate\` issue。论点被判成立、并且关系到项目方向的，那个 issue 打 \`needs-human\`。\n\n<!-- debate-done ${w} -->`;
};
export function evalBody(rows, fromDebate) {
  const t = rows.map(r => `| #${r.number} | ${r.day} | ${r.red} | ${r.result} | ${r.skips} |`).join('\n');
  return `${BOT}

每日红蓝辩论试行的 ${TRIAL} 场已经结束，机器人不再开新的一场，等房主决定。

| 场次 | 日期 | 红方 | 结果 | 超时跳过的轮次 |
| --- | --- | --- | --- | --- |
${t}

辩论产出的 \`from-debate\` issue：${fromDebate.total} 个，已关闭 ${fromDebate.closed} 个。

**要房主决定**：继续每天、改成每周几次，还是停止。在这里回复就行，任何 Agent 看到后按回复改 \`tools/debate.mjs\` 的 \`TRIAL\` 和开场频率，走 PR。
**为什么是房主**：辩论每天要用到 5 个 Agent 的 token，其中 3 个跑在房主自己的电脑上，涉及房主的钱和设备（AGENTS.md「必须由房主做的事」）。`;
}

/* ---------- 一次运行 ---------- */
// api(method, path, body) 同 GitHub REST；now 是 Date
export const LABELS = {
  debate: ['d93f0b', '每日红蓝辩论'],
  'debate-eval': ['d93f0b', '每日红蓝辩论的试行评估'],
  'winner:red': ['b60205', '辩论结果：红方胜'], 'winner:blue': ['1d76db', '辩论结果：蓝方胜'], 'winner:draw': ['c5def5', '辩论结果：平局'],
  'winner:none': ['ededed', '辩论结果：无裁决'], 'winner:void': ['ededed', '辩论结果：红方没立论，流局'],
};
export async function tick({ api, roster, now, repo }) {
  const log = [], known = new Set();
  // 用到的标签先确认存在，不存在就建，不依赖 GitHub 加标签时会不会自动建
  const ensure = async names => {
    for (const name of names) {
      if (known.has(name)) continue;
      if (!(await api('GET', `/labels/${encodeURIComponent(name)}`))) {
        const [color, description] = LABELS[name] || ['ededed', name.startsWith('handoff:') ? `交给 ${name.slice(8)} 处理` : ''];
        await api('POST', '/labels', { name, color, description });
      }
      known.add(name);
    }
  };
  const all = async path => { const out = []; for (let page = 1; ; page++) { const b = await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`); out.push(...b); if (b.length < 100) return out; } };
  const debates = (await all('/issues?state=all&labels=debate')).filter(i => !i.pull_request && readState(i.body)).sort((a, b) => readState(a.body).n - readState(b.body).n);

  /* 推进进行中的辩论 */
  for (const issue of debates.filter(i => i.state === 'open')) {
    const st = readState(issue.body), comments = await all(`/issues/${issue.number}/comments`);
    const r = replay(st, comments, now.getTime());
    const want = r.round <= 5 ? r.speakers.map(s => `handoff:${s}`) : [];
    const have = issue.labels.map(l => l.name).filter(l => l.startsWith('handoff:'));
    for (const l of have.filter(l => !want.includes(l))) await api('DELETE', `/issues/${issue.number}/labels/${encodeURIComponent(l)}`);
    const add = want.filter(l => !have.includes(l)); if (add.length) { await ensure(add); await api('POST', `/issues/${issue.number}/labels`, { labels: add }); }
    if (r.round <= 5) {
      if (!comments.some(c => isBotComment(c) && c.body.includes(`<!-- debate-round ${r.round} -->`))) await api('POST', `/issues/${issue.number}/comments`, { body: roundNote(st, r) });
      log.push(`#${issue.number} 第 ${r.round} 轮，等 ${r.speakers.join('、')}`);
    } else {
      // 三步各自可重试：中途失败了，下次运行跳过已经做完的
      const w = finalWinner(st, r), label = `winner:${w}`;
      if (!comments.some(c => isBotComment(c) && c.body.includes('<!-- debate-done'))) await api('POST', `/issues/${issue.number}/comments`, { body: closeNote(st, r, w) });
      if (!issue.labels.some(l => l.name === label)) { await ensure([label]); await api('POST', `/issues/${issue.number}/labels`, { labels: [label] }); issue.labels.push({ name: label }); }
      await api('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
      issue.state = 'closed';
      log.push(`#${issue.number} 结束：${WINNER[w]}`);
    }
  }

  /* 开场 */
  const la = laParts(now);
  const paused = (await api('GET', '/issues?state=open&labels=project%3Apaused&per_page=1')).length > 0;
  if (paused) { log.push('项目暂停中（有带 project:paused 的 issue），不开场'); return log; }
  if (debates.length >= TRIAL) {
    if (debates.every(i => i.state === 'closed') && !(await api('GET', '/issues?state=all&labels=debate-eval&per_page=1')).length) {
      const rows = [];
      for (const i of debates) {
        const st = readState(i.body), w = (i.labels.map(l => l.name).find(l => l.startsWith('winner:')) || 'winner:none').slice(7);
        const done = await all(`/issues/${i.number}/comments`), r = replay(st, done, now.getTime());
        rows.push({ number: i.number, day: st.day, red: st.red, result: WINNER[w] || w, skips: r.skipped.length });
      }
      const fd = await all('/issues?state=all&labels=from-debate');
      await ensure(['debate-eval', 'needs-human']);
      await api('POST', '/issues', { title: '每日红蓝辩论：试行结束，请房主决定是否继续', body: evalBody(rows, { total: fd.length, closed: fd.filter(i => i.state === 'closed').length }), labels: ['debate-eval', 'needs-human'] });
      log.push('试行结束，已开评估 issue');
    } else log.push(`已办满 ${TRIAL} 场`);
    return log;
  }
  if (la.hour < OPEN_HOUR) { log.push(`洛杉矶 ${la.hour} 点，还没到 ${OPEN_HOUR} 点`); return log; }
  if (debates.some(i => readState(i.body).day === la.day)) { log.push(`${la.day} 已经开过`); return log; }
  const act = await lastActivity(api, now.getTime());
  if (!act.unknown && !(act.last && now.getTime() - act.last <= DORMANT_HOURS * H)) { log.push(`项目休眠中（${DORMANT_HOURS} 小时内没有人活动），不开场`); return log; }
  const agents = parseRoster(roster), history = debates.map(i => readState(i.body));
  const roles = assignRoles(agents, history);
  if (!roles) { log.push('登记的 Agent 少于 3 个，开不了辩论'); return log; }
  const st = { n: debates.length + 1, day: la.day, topic: TOPICS[la.weekday], opened: now.toISOString(), ...roles };
  const previous = debates.map(i => ({ number: i.number, title: i.title, result: WINNER[(i.labels.map(l => l.name).find(l => l.startsWith('winner:')) || 'winner:').slice(7)] || '进行中' }));
  await ensure(['debate', `handoff:${st.red}`]);
  const issue = await api('POST', '/issues', { title: `辩论 ${la.day}：${st.topic}（红方 ${st.red}）`, body: issueBody(st, previous, repo), labels: ['debate', `handoff:${st.red}`] });
  await api('POST', `/issues/${issue.number}/comments`, { body: roundNote(st, replay(st, [], now.getTime())) });
  log.push(`已开场 #${issue.number}：红方 ${st.red}，蓝方 ${st.blue.join('、')}，裁判 ${st.judges.join('、')}`);
  return log;
}

/* ---------- 在 Actions 里运行 ---------- */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), repo = process.env.GITHUB_REPOSITORY;
  const api = async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    // GET 查标签、DELETE 撤标签时，404 表示不存在，不算错
    if (!res.ok && !((method === 'DELETE' || method === 'GET') && res.status === 404)) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 || res.status === 404 ? null : res.json();
  };
  const log = await tick({ api, roster: readFileSync(join(ROOT, 'docs/agents/roster.md'), 'utf8'), now: new Date(), repo });
  for (const l of log) console.log(l);
}
