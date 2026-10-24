#!/usr/bin/env node
// 自动指派评审者，由 .github/workflows/route.yml 在 PR 事件上运行。规则见 AGENTS.md「自动接力」。
// PR 带 ready-for-review、且没有任何 handoff:* 标签时，从登记表里挑一个作者以外、待办最少的 Agent，
// 打上 handoff:<名字> 并留言。不依赖任何 npm 包。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.env.GITHUB_REPOSITORY;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const pr = event.pull_request;

/* 登记表里类型是 Agent 的名字（人和 Agent 都在表里，owner 的类型是“人”） */
const agents = [...readFileSync(join(ROOT, 'docs/agents/roster.md'), 'utf8').matchAll(/^\|\s*`([^`]+)`\s*\|\s*Agent\s*\|/gm)].map(m => m[1]);

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const labels = pr.labels.map(l => l.name);
const author = (pr.head.ref.match(/^([A-Za-z0-9-]+)\//) || [])[1];
if (pr.draft || pr.state !== 'open') { console.log('草稿或已关闭，不指派'); process.exit(0); }
if (!labels.includes('ready-for-review')) { console.log('没有 ready-for-review，不指派'); process.exit(0); }
if (labels.some(l => l.startsWith('handoff:'))) { console.log('已经有人接手：' + labels.filter(l => l.startsWith('handoff:')).join(',')); process.exit(0); }
if (!author || !agents.includes(author)) { console.log('分支作者不在登记表里，不指派'); process.exit(0); }

const candidates = agents.filter(a => a !== author);
if (!candidates.length) {
  // 登记的 Agent 少于两个：只有房主能评审（AGENTS.md「必须由房主做的事」）
  await api('POST', `/issues/${pr.number}/labels`, { labels: ['needs-human'] });
  await api('POST', `/issues/${pr.number}/comments`, { body: `— 路由机器人\n\n登记的 Agent 只有 ${author} 一个，没有别人能评审，已打上 \`needs-human\`：需要房主评审，或者先登记第二个 Agent。` });
  console.log('没有候选评审者，已打 needs-human'); process.exit(0);
}

/* 待办最少的先来：数每个候选者手上带 handoff:<名字> 的开放 PR */
const open = await api('GET', '/pulls?state=open&per_page=100');
const load = Object.fromEntries(candidates.map(c => [c, 0]));
for (const p of open) for (const l of p.labels) { const m = /^handoff:(.+)$/.exec(l.name); if (m && m[1] in load) load[m[1]]++; }
const pick = candidates.sort((a, b) => load[a] - load[b] || a.localeCompare(b))[0];

await api('POST', `/issues/${pr.number}/labels`, { labels: [`handoff:${pick}`] });
await api('POST', `/issues/${pr.number}/comments`, { body: `— 路由机器人\n\n作者是 ${author}，已自动指派 **${pick}** 评审（打上 \`handoff:${pick}\`）。${pick} 下次查看待办（\`node tools/board.mjs ${pick}\`）时会看到。评审流程见 AGENTS.md。` });
console.log(`已指派 ${pick}（待办：${JSON.stringify(load)}）`);
