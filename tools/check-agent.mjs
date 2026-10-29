#!/usr/bin/env node
// 多 Agent 协作检查，规则见 AGENTS.md。不依赖任何 npm 包。
//   node tools/check-agent.mjs            本地：检查当前分支名和相对 origin/main 的提交尾注
//   node tools/check-agent.mjs            CI：检查 PR 的分支名、提交尾注，自动加 agent: 标签
// 不检查评审：Agent 之间不做交叉评审（docs/decisions/0006）。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = ['feat', 'fix', 'design', 'docs', 'refactor', 'perf', 'test', 'chore'];
const BRANCH = new RegExp(`^([A-Za-z0-9-]+)/(${TYPES.join('|')})/.+`);
const errors = [], notes = [];

/* 登记表：docs/agents/roster.md 里表格第一列用反引号包住的名字 */
const roster = new Set(
  [...readFileSync(join(ROOT, 'docs/agents/roster.md'), 'utf8').matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(m => m[1])
);

/* 分支名 → 作者名字；不合规时记错误并返回 null */
function authorOf(branch) {
  const m = branch.match(BRANCH);
  if (!m) { errors.push(`分支名 ${branch} 不符合 <名字>/<类型>/<描述>，类型只能是 ${TYPES.join('、')}`); return null; }
  if (!roster.has(m[1])) { errors.push(`${m[1]} 不在 docs/agents/roster.md 的登记表里`); return null; }
  return m[1];
}

/* 每条非合并提交都要有 Agent: <作者> 尾注 */
function checkCommits(commits, author) {
  for (const c of commits) {
    if (c.parents > 1) continue;
    const tag = c.message.match(/^Agent:\s*(\S+)\s*$/m);
    const head = `${c.sha.slice(0, 7)} ${c.message.split('\n')[0]}`;
    if (!tag) errors.push(`提交 ${head} 缺少 “Agent: ${author}” 尾注`);
    else if (tag[1] !== author) errors.push(`提交 ${head} 的尾注是 Agent: ${tag[1]}，与分支作者 ${author} 不一致`);
  }
}

function finish(okText) {
  for (const n of notes) console.log('说明  ' + n);
  for (const e of errors) console.log('错误  ' + e);
  console.log(errors.length ? `\n${errors.length} 个错误，规则见 AGENTS.md` : `\n${okText}`);
  process.exit(errors.length ? 1 : 0);
}

const eventPath = process.env.GITHUB_EVENT_PATH;

if (!eventPath) {
  /* 本地模式 */
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  const author = authorOf(git('rev-parse', '--abbrev-ref', 'HEAD'));
  if (author) {
    const name = git('config', 'user.name');
    if (name !== author) errors.push(`git config user.name 是 ${name}，应为 ${author}`);
    const shas = git('rev-list', '--no-merges', 'origin/main..HEAD').split('\n').filter(Boolean);
    checkCommits(shas.map(sha => ({ sha, parents: 1, message: git('log', '-1', '--format=%B', sha) })), author);
  }
  finish('协作检查通过');
}

/* CI 模式 */
const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const pr = event.pull_request;
const repo = process.env.GITHUB_REPOSITORY;
async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 || res.status === 404 ? null : res.json();
}

const author = authorOf(pr.head.ref);
const labels = new Set(pr.labels.map(l => l.name));

if (author) {
  const commits = [];
  for (let page = 1; ; page++) {
    const batch = await api('GET', `/pulls/${pr.number}/commits?per_page=100&page=${page}`);
    commits.push(...batch.map(c => ({ sha: c.sha, parents: c.parents.length, message: c.commit.message })));
    if (batch.length < 100) break;
  }
  checkCommits(commits, author);

  if (!labels.has(`agent:${author}`)) {
    await api('POST', `/issues/${pr.number}/labels`, { labels: [`agent:${author}`] });
    notes.push(`已加上标签 agent:${author}`);
  }
}

finish('协作检查通过');
