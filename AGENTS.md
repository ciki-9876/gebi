# 写给参与开发隔壁的 Agent

隔壁由**一位房主**（GitHub 账号 `ciki-9876` 的主人）和**多个 Agent** 共同开发。Agent 运行在不同的设备和工具里，彼此不能直接对话，也不记得上一次会话做过什么，而且**所有人共用同一个 GitHub 账号**。

所以这里的规则只有一个出发点：**仓库和 GitHub 是唯一的共享黑板。** 身份、任务、交接、决定，全部写在 GitHub 上，任何一个 Agent 进来读一遍就能接上，不需要问别人。

目前所有 Agent 的角色都是**设计与开发者**：都可以做设计、写代码、评审别人的 PR，没有固定分工。

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
5. **看黑板**：打开的 issue 和 PR 里，有没有交给你的（`handoff:<你的名字>`）、等你修改的、等人评审的（`ready-for-review`）。

## 身份：同一个账号，用四处标记区分

| 位置 | 规则 | 示例 |
| --- | --- | --- |
| 提交作者名 | `git config user.name` 设为你的名字 | `PCClaude` |
| 提交尾注 | 每条提交信息末尾一行 `Agent: <名字>` | `Agent: PCClaude` |
| 分支名 | `<名字>/<类型>/<描述>`，类型同 CONTRIBUTING | `PCClaude/feat/口袋-批量摆放` |
| PR 标签 | `agent:<名字>`，CI 会自动加上 | `agent:PCClaude` |

PR 描述的第一项“作者”也写上你的名字。在 issue 和 PR 里发的每条评论，第一行写 `— <你的名字>`，否则大家看到的都是同一个头像，分不清是谁说的。

## 任务协议

### 领取

- 动手之前，先确认 issue 上**没有** `claimed:*` 标签。
- 打上 `claimed:<你的名字>`，并评论：打算怎么做、会动哪些文件（改 `app.js` 写明区块名）、预计多久。
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

### 合并与发布

- 由**房主**合并。三项 CI 检查全部通过才能合并：`check`（代码规范）、`identity`（身份标记）、`review`（已由作者以外的人评审）。
- 发布到 claude.ai 只有房主能做，Agent 不要尝试。

## 交接与求助

Agent 之间的消息就是 issue 和 PR 评论，用标签指明收件人：

| 标签 | 含义 |
| --- | --- |
| `handoff:<名字>` | 交给指定的 Agent 处理 |
| `handoff:any` | 谁有空谁接 |
| `needs-human` | 需要房主决定。写清选项和你的建议，房主只看这个标签 |

遇到这些情况，打 `needs-human` 并停下等待，不要自己拍板：

- 改数据模型（新增或修改数据库路径、字段）
- 改设计系统的 token 或组件规范
- 新增 CDN 依赖，或明显增加首屏体积
- 和 `docs/decisions/` 里已有的决定冲突
- 需要删除别人的分支、关闭别人的 PR

## 避免冲突

- `app.js` 是单个大文件，冲突的重灾区。改之前，先看打开的 PR 里有没有动同一个区块（`/* ===== 标题 ===== */`），有的话等它合并，或者在 issue 里协调。
- PR 要小。开 PR 前和推送前，都先 `git fetch origin main` 并变基到最新的 `main`。
- 推送前跑两个检查：`node tools/check.mjs`（代码规范）和 `node tools/check-agent.mjs`（分支名、提交尾注、作者名）。
- 只推送自己名字开头的分支。

## 红线

- 不推送到 `main`，不强推别人的分支，不删除别人的分支。
- 不合并自己的 PR，不评审自己的 PR。
- 不冒用别人的名字，不修改登记表里别人的那一行。
- 不提交密钥、令牌和 `.env` 文件。

## 加入新 Agent

新 Agent 拿到名字后，第一个 PR 就是在 [`docs/agents/roster.md`](docs/agents/roster.md) 里登记自己。名字只用英文字母、数字和连字符，不含空格和斜杠，因为它要出现在分支名和标签里。
