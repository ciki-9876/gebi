# 参与开发隔壁

隔壁由房主和多个 Agent 共同开发，大家共用一个 GitHub 账号。身份怎么区分、任务怎么领取、PR 怎么评审，写在根目录的 [`AGENTS.md`](AGENTS.md)，先读它。

再读三份文档，十分钟：

1. `docs/ARCHITECTURE.md`：代码怎么组织、数据存在哪、读写约定。
2. `docs/DESIGN.md`：写界面时必须遵守的设计规范；品牌手册在 `design-system/project/README.md`。
3. `docs/SDK.md`：作品和房间之间的消息协议。

## 本地运行

需要 Python 3 和 Node 18 以上（Node 只用来跑检查脚本，没有 npm 依赖）。

```bash
python3 dev/serve.py --mock      # 多人模式，打开 http://127.0.0.1:8765/preview.html
node tools/check.mjs             # 提交前检查
```

多人模式用 URL 参数切换身份，同一个浏览器的多个标签页共享模拟数据库：

| 身份 | 参数 |
| --- | --- |
| 302 房主（页面所有者） | `?uid=u_owner&owner=1` |
| 参与者 | `?uid=u_guest&owner=0&name=小鱼` |
| 查看者（只读） | `?uid=u_view&owner=0&ro=1` |

直达某间房：在地址末尾加 `#room-<uid>`，例如 `#room-302`。

## 分支与提交

- `main` 永远可以发布。不要直接推到 `main`，一律走 PR。
- 分支名：`<名字>/<类型>/<描述>`，例如 `PCClaude/feat/pocket-batch-place`、`PCClaude/fix/share-card-plate`，描述用英文。名字见 [`docs/agents/roster.md`](docs/agents/roster.md)；类型同下面的提交类型，其中 `design` 只改 token 或组件样式。
- 每条提交信息末尾加一行 `Agent: <名字>`，CI 会检查。
- 提交信息用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 的类型前缀，正文用中文：

  ```
  feat(口袋): 入住时可以把口袋里的收藏一起摆进房间
  fix(作品窗口): 加载失败时不再显示“已载入”
  design(tokens): 提高 text-3 对比度到 4.6:1
  ```

  类型：`feat` 新功能 · `fix` 修复 · `design` 设计系统 · `docs` 文档 · `refactor` 重构 · `perf` 性能 · `test` 测试 · `chore` 杂项。
- 一个 PR 做一件事。超过 400 行改动（不含生成文件）请先拆分，或在 issue 里先对齐方案。

## Pull Request

PR 模板会自动出现，请填完：

- **为什么改**：关联 issue，或一句话说明用户遇到的问题。
- **改了什么**：界面改动附截图，桌面和手机各一张（手机用 390 宽）。
- **怎么验证**：按下面“验收清单”勾选你实际走过的路径。
- **数据改动**：新增或修改了数据库字段，写清路径、字段、旧数据怎么兼容。

合并条件：CI 的 `check`、`identity`、`review` 三项通过，由评审者合并。因为大家共用一个账号，GitHub 的“批准”用不了，评审改为作者以外的人发评审评论并打上 `reviewed:<名字>` 标签，详见 [`AGENTS.md`](AGENTS.md)。改到 `styles/tokens.css`、`docs/DESIGN.md`、`design-system/`、数据模型的 PR，要在 `docs/decisions/` 写一条记录，评审者专门检查。

## 验收清单

没有自动化的端到端测试，以下路径请手动走一遍和你改动相关的：

- [ ] **首页**：地球加载、搜索城市和住户、点住户打开面板、敲门进去
- [ ] **入住**：选址、填表、落地后“待上传”清单出现、上传一个 .html 能在房间里打开
- [ ] **访客**：进别人的房间、打开作品窗口、收藏（有房间进房间，没有房间进口袋）、留言、看名片
- [ ] **查看者**（`ro=1`）：能逛和试玩，写操作都有说明而不是报错
- [ ] **房主**：动态里看到来访和留言、回复、Bit 的问候符合实际
- [ ] **物件流**：筛选、试玩、等上传的作品排在最后
- [ ] **手机**（390 宽，触屏）：摇杆可用，没有键盘提示，面板从底部升起不遮挡关键操作
- [ ] **控制台**没有新的报错

## 写代码的约定

- **源码**：逻辑代码只改 `src/`，改完运行 `node tools/build.mjs` 重新生成 `app.js`，两者一起提交。
- **转义**：插进 HTML 的变量一律 `esc()`。
- **清洗**：读别人的数据一律过 `clean*()`，见 `docs/ARCHITECTURE.md`。
- **权限**：写操作先判断 `canPost()`，给出能做什么的说明。
- **隐私**：坐标只到城市；联系方式只显示房主主动公开的。
- **设计**：遵守 `docs/DESIGN.md`，检查脚本会拦下颜色字面量、未定义的 token 和布局用的内联样式。
- **文案**：按钮写动作，提示写结果，错误写怎么改。
- **依赖**：新增 CDN 依赖要锁定精确版本，并在 PR 里说明体积。首屏传输量目前约 1.4 MB，请不要增加。
- **兼容**：最新两版的 Chrome、Safari、Edge，以及 iOS Safari 16 以上。需要 WebGL。

## 发布

线上版本是 claude.ai Artifact，只有页面所有者能发布。合并到 `main` 后由维护者发布，并在发布说明里列出合并的 PR。设计系统页面同理：`design-system/project/` 的改动由维护者同步发布。

## Issue

- **Bug**：用模板，写清身份（房主 / 参与者 / 查看者）、设备、复现步骤、期望和实际。
- **需求**：先写“谁在什么场景下遇到什么问题”，再写方案。
- 标签：`bug` `体验` `设计系统` `数据` `性能` `good first issue`（适合新人，范围小、不碰数据模型）。
- 协作标签：`claimed:<名字>` `ready-for-review` `reviewed:<名字>` `handoff:<名字>` `handoff:any` `needs-human` `agent:<名字>`，含义见 [`AGENTS.md`](AGENTS.md)。

## 还需要维护者决定的事

这些规范里刻意没有替你定：

- **开源许可证**。仓库目前是公开的，但没有 LICENSE 文件，按默认规则别人只能看、不能用。请在邀请协作者前决定用什么许可证（或者明确“暂不开源，只对受邀协作者开放”）。
- **贡献者协议**。如果将来要商业化，是否需要协作者签署贡献者许可协议（CLA）。
- **后端迁移的时间点**。见 `docs/ARCHITECTURE.md` 末尾。
