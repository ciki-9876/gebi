#!/usr/bin/env node
// 立即评审：node tools/review-now.mjs <PR号> [评审者名字] [--dry-run]
// 房主（或任何人）决定“这个 PR 现在就要评审”时用。它会
//   1. 把 PR 指派给评审者（handoff:<名字>，换掉别的 handoff），打上 ready-for-review 和 urgent；
//   2. 在 PR 上留一条说明；
//   3. 打印一段可以直接粘贴给那个 Agent 的话，以及能在终端里直接触发它的命令行写法。
// 不指定评审者时，从登记表里挑一个作者以外、手上待办最少的 Agent。
// Agent 没有被推送的入口，所以最后一步仍然是让那个 Agent 的工具现在跑一次：把打印出来的话发给它。
// 需要 gh（GitHub CLI）已登录。不依赖任何 npm 包。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('uncaughtException', e => { console.error('出错了：' + String(e.stderr || e.message).trim().split('\n')[0]); process.exit(1); });
const args = process.argv.slice(2), dry = args.includes('--dry-run'), pos = args.filter(a => !a.startsWith('--'));
const num = +pos[0], want = pos[1];
if (!num) { console.error('用法：node tools/review-now.mjs <PR号> [评审者名字] [--dry-run]'); process.exit(2); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = (() => {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const m = /github\.com[:/]([^/\s]+\/[^/.\s]+)/.exec(execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: ROOT, encoding: 'utf8' })); if (!m) throw new Error('认不出仓库地址'); return m[1];
})();
const gh = (method, path, body) => {
  const a = ['api', '-X', method, `repos/${repo}/${path}`];
  if (body) for (const [k, v] of Object.entries(body)) a.push('-f', `${k}=${v}`);
  const out = execFileSync('gh', a, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); return out ? JSON.parse(out) : null;
};
const addLabels = (n, ls) => { const a = ['api', `repos/${repo}/issues/${n}/labels`]; ls.forEach(l => a.push('-f', `labels[]=${l}`)); execFileSync('gh', a, { encoding: 'utf8' }); };

const agents = [...readFileSync(join(ROOT, 'docs/agents/roster.md'), 'utf8').matchAll(/^\|\s*`([^`]+)`\s*\|\s*Agent\s*\|/gm)].map(m => m[1]);
const pr = gh('GET', `pulls/${num}`);
if (pr.state !== 'open') { console.error(`#${num} 已经${pr.merged ? '合并' : '关闭'}了。`); process.exit(1); }
const author = (pr.head.ref.match(/^([A-Za-z0-9-]+)\//) || [])[1];
const labels = pr.labels.map(l => l.name);
const lane = (labels.find(l => l.startsWith('lane:')) || '').slice(5) || 'standard';

let reviewer = want;
if (!reviewer) {
  const load = Object.fromEntries(agents.filter(a => a !== author).map(a => [a, 0]));
  for (const p of gh('GET', 'pulls?state=open&per_page=100')) for (const l of p.labels) { const m = /^handoff:(.+)$/.exec(l.name); if (m && m[1] in load) load[m[1]]++; }
  reviewer = Object.keys(load).sort((a, b) => load[a] - load[b] || a.localeCompare(b))[0];
}
if (!reviewer) { console.error('登记表里没有作者以外的 Agent 可以评审，需要先登记第二个 Agent。'); process.exit(1); }
if (!agents.includes(reviewer)) { console.error(`${reviewer} 不在登记表里。已登记：${agents.join('、')}`); process.exit(1); }
if (reviewer === author) { console.error(`${reviewer} 是这个 PR 的作者，不能评审自己的 PR。`); process.exit(1); }

const oldHandoffs = labels.filter(l => l.startsWith('handoff:') && l !== `handoff:${reviewer}`);
console.log(`PR #${num}「${pr.title}」作者 ${author}，档位 ${lane}\n评审者：${reviewer}${want ? '（你指定的）' : '（待办最少的）'}`);
console.log(dry ? '\n[dry-run] 不改动任何东西。会做的事：' : '\n正在做：');
console.log(`  - ${oldHandoffs.length ? '去掉 ' + oldHandoffs.join('、') + '，' : ''}打上 handoff:${reviewer}、ready-for-review、urgent，留一条说明`);

if (!dry) {
  for (const l of oldHandoffs) gh('DELETE', `issues/${num}/labels/${encodeURIComponent(l)}`);
  addLabels(num, [`handoff:${reviewer}`, 'ready-for-review', 'urgent']);
  gh('POST', `issues/${num}/comments`, { body: `— 房主（经 review-now）\n\n这个 PR 现在就要评审，已指派 **${reviewer}**（\`handoff:${reviewer}\`，\`urgent\`）。${reviewer} 请现在评审这个 PR（读 AGENTS.md「评审」「评审档位」）；评审通过且三项检查全绿后，由评审者合并。` });
}

const prompt = `立即评审并处理 ${repo} 的 PR #${num}（作者 ${author}，档位 lane:${lane}），这是房主要求的加急任务。
1. 进入你自己的克隆，git fetch origin main，直接打开 PR #${num}（如果有 tools/board.mjs，也可以运行 node tools/board.mjs ${reviewer} 确认）。
2. 读 AGENTS.md 的「评审」和「评审档位」，按档位评审${lane === 'heavy' ? '（重档：必须独立复现，评论里写明复现了什么）' : lane === 'light' ? '（轻档：快速过一遍 diff，确认检查通过）' : ''}。
3. 通过：发评审评论，打 reviewed:${reviewer}，等 check、identity、review 三项全绿后合并，能删分支就删。需要修改：按格式写明问题，去掉 ready-for-review，改为 handoff:${author}。
4. 完成后回复一句结果。`;
console.log('\n把下面这段话发给 ' + reviewer + '：\n────────────────────────────────────────\n' + prompt + '\n────────────────────────────────────────');
const oneLine = prompt.replace(/\n/g, ' ');
console.log(`\n如果 ${reviewer} 的工具有命令行模式，也可以在你的电脑终端里直接触发（在它自己的克隆目录里运行）：\n  Claude Code：  claude -p ${JSON.stringify(oneLine)}\n  Codex：        codex exec ${JSON.stringify(oneLine)}\n（命令名以你机器上实际安装的版本为准。）`);
