# 设计规范（开发者版）

隔壁的设计系统有两份载体，内容一致：

| 载体 | 给谁看 | 地址 |
| --- | --- | --- |
| **代码**（事实来源） | 写代码的人 | `styles/tokens.css`、`styles/components.css` |
| **设计系统页面** | 所有人：设计、产品、新协作者 | https://claude.ai/artifact/HhRjb3bzSRvWut8DoRvgiG ，源文件在 `design-system/project/` |

品牌概念、颜色角色、文案原则写在 `design-system/project/README.md`（页面上的“品牌手册”）。这一页只讲**写代码时怎么遵守**。

## 样式文件分工

| 文件 | 放什么 | 不放什么 |
| --- | --- | --- |
| `styles/tokens.css` | 全部 token：颜色、字体、字号、间距、圆角、尺寸、阴影、动效、层级 | 选择器 |
| `styles/base.css` | 重置、排版角色（`.t-*`）、工具类（`.u-*`） | 颜色字面量、组件 |
| `styles/components.css` | 跨页面复用的组件：按钮、标签、门牌、表单、面板、列表行、名片、轻提示 | 颜色字面量、只在一个地方出现的布局 |
| `styles/app.css` | 按界面区域分节的布局与功能模块：顶栏、首页、房间 HUD、作品窗口、物件流、方案书 | 已经在 components.css 里定义过的东西 |

## 硬规则（`node tools/check.mjs` 会检查）

1. **颜色只用语义 token**：`--bg`、`--surface-1…4`、`--border-1…3`、`--text-1…3`、`--accent*`、`--info*`、`--success*`、`--heat*`、`--danger*`。不直接引用 `--ink-*`、`--lamp-*` 等原始色板。
2. **base.css 与 components.css 里不写颜色字面量**。app.css 里现有的字面量（房主作品自带皮肤、天色标签）有基线数量，只能减少。
3. **用到的 `var(--x)` 都必须在 tokens.css 里定义**。按数据传入的局部变量只有 `--c`（住户颜色）和 `--tc`（主题色）。
4. **JS 里不写布局用的内联样式**。`style="..."` 只用来传数据（`style="--c:${color}"`）；间距、对齐用 `.u-*` 工具类。
5. **改 token 后同步设计系统**：运行 `node tools/sync-tokens.mjs`，把生成的 `design-system/project/tokens.json` 和 `bundle.css` 一起提交。

## 软规则（评审时看）

- **一屏一个主按钮**（`.btn.primary`），放在面板底部最左。
- **房间号永远用门牌** `.plate-no`，canvas 里用 `drawPlate()`。
- **字号只用阶梯里的值**：`--fs-xs` 到 `--fs-5xl`。需要新字号，先在 PR 里说明为什么现有的不够。
- **间距是 4 的倍数**，优先用 `--sp-*`。
- **新组件先看有没有现成的**：按钮、标签、列表行、说明块、名片基本覆盖了面板里的所有需要。确实要新增，放进 components.css，并在 `design-system/project/components/<Name>/` 写 README 和预览。
- **3D 场景里的美术**（霓虹、黑板、作品屏幕、地球光点）不受 token 约束；叠在场景上的 HTML 必须用 token；canvas 上画的界面元素通过 `app.js` 里的 `TK` 读 token。
- **触屏**：可点区域不小于 `--hit-min`（40px）；不出现键盘提示（WASD、F、R、Delete）。
- **对比度**：正文不低于 4.5:1。`--text-3` 只放在 `--bg` 与 `--surface-1/2/3` 上。
- **动效**：只用 `--dur-*` 和 `--ease-*`；`prefers-reduced-motion` 时全部关闭（base.css 已处理）。

## 文案

- 按钮写动作，轻提示写结果，错误写怎么改。见品牌手册“文案”一节。
- 所有用户可见的文字目前直接写在 `app.js` 和 `index.html` 里。英文界面立项后会统一迁到字符串表，到时再定 key 的命名；在那之前，新文字请集中写在函数开头或常量里，不要散落在拼接的 HTML 中间。

## 新增或修改 token 的流程

1. 在 `styles/tokens.css` 里加一行，行尾注释写清用途（用在哪、放在什么底色上）。没有注释，`sync-tokens` 会拒绝。
2. 运行 `node tools/sync-tokens.mjs`，再运行 `node tools/check.mjs`。
3. PR 里贴改动前后的截图，说明为什么现有 token 不够。改到 `styles/tokens.css` 的 PR 需要维护者评审（见 `.github/CODEOWNERS`）。
4. 合并后，维护者把 `design-system/project/` 的改动发布到设计系统页面。
