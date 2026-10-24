# 写给参与开发隔壁的 Agent

隔壁由**一位房主**（GitHub 账号 `ciki-9876` 的主人）和**多个 Agent** 共同开发。Agent 运行在不同的设备和工具里，彼此不能直接对话，也不记得上一次会话做过什么，而且**所有人共用同一个 GitHub 账号**。

所以这里的规则只有一个出发点：**仓库和 GitHub 是唯一的共享黑板。** 身份、任务、交接、决定，全部写在 GitHub 上，任何一个 Agent 进来读一遍就能接上，不需要问别人。

目前所有 Agent 的角色都是**设计与开发者**：都可以做设计、写代码、评审和合并别人的 PR，没有固定分工。

**房主只做必须由房主做的事。** 能由 Agent 完成的，包括评审、合并、处理冲突、做技术决定，都不要交给房主。确实需要房主时，按下面[“必须由房主做的事”](#必须由房主做的事)的要求，说明为什么只有房主能做。

## 开工清单

每次会话开始，按顺序做完：

1. **确认你的名字。** 名字由房主起，登记在 [`docs/agents/roster.md`](docs/agents/roster.md)。不知道自己叫什么，先问房主，不要自己起。
2. **设置身份**（每个本地仓库一次）：

   ```bash
   git config user.name "<你的名字>"
   git config user.email "ciki-9876@users.noreply.github.com"
   ```

3. **读规范**：本文件、[`CONTRIBUTING.md`](CONTRIBUTING.md)，以及和任务相关的 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/DESIGN.md`](docs/DESIGN.md)、[`docs/SDK.md`](docs/SDK.md)。已经定下的事记在 [`docs/decisions/`](docs/decisions/)，不要重新争论。
4. **同步主干**：`git fetch origin main`，从最新的 `main` 切分支。
5. **看黑板**：运行 `node tools/board.mjs <你的名字>`（需要 `gh` 已登录），它会列出待你评审的 PR、等你修改的 PR、可以由你合并的 PR、指派给你的 issue。只有这一行输出“现在没有需要你处理的事”时，才算没事。

## 身份：同一个账号，用四处标记区分

| 位置 | 规则 | 示例 |
| --- | --- | --- |
| 提交作者名 | `git config user.name` 设为你的名字 | `PCClaude` |
| 提交尾注 | 每条提交信息末尾一行 `Agent: <名字>` | `Agent: PCClaude` |
| 分支名 | `<名字>/<类型>/<描述>`，类型同 CONTRIBUTING；描述用英文小写和连字符，中文会让 GitHub 显示“隐藏字符”警告 | `PCClaude/feat/pocket-batch-place` |
| PR 标签 | `agent:<名字>`，CI 会自动加上 | `agent:PCClaude` |

PR 描述的第一项“作者”也写上你的名字。在 issue 和 PR 里发的每条评论，第一行写 `— <你的名字>`，否则大家看到的都是同一个头像，分不清是谁说的。

## 任务协议

### 领取

- 动手之前，先确认 issue 上**没有** `claimed:*` 标签。
- 打上 `claimed:<你的名字>`，并评论：打算怎么做、会动哪些文件（具体到 `src/` 下的文件名）、预计多久。
- 没有 issue 的工作，先建 issue 再领取。改错别字这类一行的修改可以直接开 PR。
- 一个 issue 同一时间只有一个 Agent 在做。

### 续租与放弃

- 领取后超过 **24 小时**没有新的提交或评论，视为放弃，其他 Agent 可以接手：评论说明，换成自己的 `claimed:` 标签。
- 做不下去了，主动去掉标签，评论写清做到哪里、卡在哪里。

### 提交 PR

- 做完后开 PR，按模板填写，打上 `ready-for-review`，去掉 issue 上的 `claimed:` 标签。
- PR 描述的“交接”一节写清：还有什么没做、下一步建议做什么。下一个接手的 Agent 只看得到这些文字。

### 评审

- **不能评审自己的 PR。** 评审者必须是作者以外的 Agent，或者房主。
- 同一个账号点不了“批准”，所以评审写成一条普通评论，格式见下，然后打上 `reviewed:<你的名字>`。
- 结论是“需修改”时，不打 `reviewed:` 标签，去掉 `ready-for-review`，改为 `handoff:<作者名字>`。
- 作者推了新提交，CI 会自动去掉已有的 `reviewed:*` 标签，需要重新评审。

```markdown
— <评审者名字>

**结论**：通过 / 需修改

**看了什么**：读了哪些改动，跑了什么，走了验收清单的哪几条

**问题**：
1. 文件:行号，问题，建议怎么改（没有就写“无”）
```

### 评审档位

路由机器人会按改动自动给 PR 打 `lane:*` 标签（改动变了会自动换），评审的深度跟着档位走，别人只改文档的 PR 不用你搭一整套复现：

| 档位 | 什么时候 | 评审者要做的 |
| --- | --- | --- |
| `lane:light` | 只改 `.md`，或者改动不超过 50 行（不含生成文件）且不碰 `src/` | 快速读一遍 diff，确认 `check`、`identity` 通过，没有明显问题就通过。不需要独立复现 |
| `lane:standard` | 其余的功能和修复 | 按下面的格式完整评审：读改动、跑检查、走相关的验收路径 |
| `lane:heavy` | 改到 `.github/`、`tools/`、`AGENTS.md`、`docs/agents/`、`docs/decisions/`、`docs/PUBLISH.md`、`docs/ARCHITECTURE.md`、`docs/DESIGN.md`、`design-system/`、`styles/tokens.css`、`src/12-cloud.js`（数据模型） | 必须独立复现：自己写或跑一个测试，评审评论里写明复现了什么、结果是什么 |

档位只管评审的深度，不改变其他规则：作者不能评审和合并自己的 PR，三项检查必须全绿。作者在 PR 描述的“怎么验证”里写清楚验证了什么，评审者才能少做重复的事；有可复用的测试脚本，直接说在哪里。

### 合并与发布

- 由**评审者**合并，作者不能合并自己的 PR。三项 CI 检查全部通过才能合并：`check`（代码规范）、`identity`（身份标记）、`review`（已由作者以外的人评审），`main` 的规则集会拦下不合规的合并。
- 合并用网页上的按钮，或者 `gh api -X PUT repos/ciki-9876/gebi/pulls/<编号>/merge`。合并后，合并者能删除这个 PR 的分支就删除（`git push origin --delete <分支名>`）；所在环境不允许删除时不用管，已合并的分支留着没有影响。
- 评审者所在的工具做不了合并时，在 PR 里评论说明，打上 `handoff:any`，请别的 Agent 合并。
- 发布到 claude.ai 见下面“必须由房主做的事”。

## 自动接力

Agent 之间不能直接对话，也不会主动看 GitHub，所以“有事等你”要靠下面三件事自动传达，**不要让房主去通知别人**：

1. **自动指派评审者**：PR 打上 `ready-for-review` 且没有任何 `handoff:*` 标签时，工作流 `route`（`tools/route-pr.mjs`）会从登记表里挑一个作者以外、手上待办最少的 Agent，自动打上 `handoff:<名字>` 并留言。作者不用自己指定评审者，开 PR 打上 `ready-for-review` 就行。只登记了一个 Agent 时，机器人会打 `needs-human`。
2. **轮询**：每个 Agent 开工先跑 `node tools/board.mjs <名字>`，并且在工具支持时设一个每 20～30 分钟的定时检查。**定时检查先用脚本过滤**：`node tools/board.mjs <名字> --quiet` 没有待办时什么也不输出（退出码 0），有待办才输出（退出码 10），只有退出码是 10 才叫醒大模型，没事的时候不花 token。设置方法见 [`docs/agents/polling.md`](docs/agents/polling.md)。电脑上常开着的 Agent，更好的办法是装**本机唤醒器**（`tools/dispatch.mjs`）：每分钟用脚本检查，一有待办就自动启动这个 Agent 的命令行模式，见 [`docs/agents/dispatcher.md`](docs/agents/dispatcher.md)。
3. **作者那边**：作者订阅了自己的 PR（有这个能力的工具），评审意见、合并会自动叫醒作者，不需要轮询。

处理完一件待办之后，再跑一遍 board，直到它说没有事了。

## 交接与求助

Agent 之间的消息就是 issue 和 PR 评论，用标签指明收件人：

| 标签 | 含义 |
| --- | --- |
| `handoff:<名字>` | 交给指定的 Agent 处理 |
| `handoff:any` | 谁有空谁接 |
| `needs-human` | 只有房主能做的事，见下一节。房主只看这个标签 |

## 必须由房主做的事

只有下面这些情况打 `needs-human`。打的时候在评论里写清两件事：要房主做什么（具体到在哪个页面点什么），以及为什么 Agent 做不了。能准备好的东西（比如要导入的配置文件）先准备好，让房主的操作尽量少。

| 事项 | 为什么必须是房主 |
| --- | --- |
| 修改仓库设置：规则集、分支保护、合并方式、Actions 权限 | Agent 的 GitHub 访问不允许修改仓库设置，这类请求会被拒绝 |
| 发布到 claude.ai | 线上版本是房主账号下的 Artifact，只有房主账号能发布 |
| 给新 Agent 起名、启动 Agent | 名字由房主起；Agent 不能在别的设备和工具里启动另一个 Agent |
| 许可证、贡献者协议、付费服务、新的密钥或令牌 | 涉及房主本人的权利、钱和账号安全 |
| 登记的 Agent 少于两个时评审 PR | 不能评审自己的 PR，此时没有别人能评审 |

其余的事 Agent 自己决定，包括改数据模型、改设计系统、新增依赖、推翻 `docs/decisions/` 里的旧决定。这类改动要在 `docs/decisions/` 写一条记录，评审者要专门检查这条记录站不站得住，拿不准就给“需修改”，不要推给房主。

## 避免冲突

- 逻辑代码在 `src/` 下，按区块分成多个文件。改之前，先看打开的 PR 里有没有动同一个文件，有的话等它合并，或者在 issue 里协调。
- **只改 `src/`，不要直接改 `app.js`**，它是 `node tools/build.mjs` 生成的。改完 `src/` 运行一次 build，两者一起提交。变基时 `app.js` 冲突了不要手动解决：先解决 `src/` 的冲突，再运行 build 重新生成 `app.js`，然后 `git add app.js`。
- PR 要小。开 PR 前和推送前，都先 `git fetch origin main` 并变基到最新的 `main`。
- 推送前跑两个检查：`node tools/check.mjs`（代码规范）和 `node tools/check-agent.mjs`（分支名、提交尾注、作者名）。
- 只推送自己名字开头的分支。

## 红线

- 不推送到 `main`，不强推别人的分支，不删除别人未合并的分支。
- 不合并自己的 PR，不评审自己的 PR。
- 不冒用别人的名字，不修改登记表里别人的那一行。
- 不提交密钥、令牌和 `.env` 文件。

## 加入新 Agent

新 Agent 拿到名字后，第一个 PR 就是在 [`docs/agents/roster.md`](docs/agents/roster.md) 里登记自己。名字只用英文字母、数字和连字符，不含空格和斜杠，因为它要出现在分支名和标签里。
