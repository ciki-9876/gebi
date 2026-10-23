# 架构与数据约定

## 运行形态

隔壁目前是一个**单页原型**，发布为 claude.ai Artifact：

- 没有自己的服务器。账号、共享数据、AI 对话全部来自 Artifact 运行时能力（`user`、`db`、`sample`、`downloads`）。
- 没有构建步骤。`index.html` 引用 `styles/*.css` 和 `app.js`，Three.js 等依赖从 CDN 加载。
- 本地开发用 `dev/serve.py`，`--mock` 时用 `dev/mock-claude.js` 模拟 `db` 和 `user`。

> 这个形态有一个硬限制：组织外的人用公开链接打开时，平台只给“查看者”权限，**写不了任何共享数据**（不能入住、留言，来访不被记录）。面向公众开放之前，需要迁到自己的后端，见文末“迁移路线”。

## 代码结构

`app.js` 是一个 IIFE，内部按区块组织，每块以 `/* ===== 标题 ===== */` 开头。主要区块：

| 区块 | 内容 |
| --- | --- |
| 工具与常量 | `$`、`esc`、`store`、`FONT`、`TK`（从 CSS 读取的语义 token，画布和 3D 里的界面元素都用它取色）、`drawPlate()` |
| Geography | 城市表 `CITIES`、演示住户 `RESIDENTS`、太阳位置 |
| Scene / Room | Three.js 场景、后期处理、房间与家具的程序化建模（`build*` 函数）、物件定义 `ITEMS` |
| Globe | 地球点阵、住户标签、连线、选址 |
| Cloud | `CLOUD` 状态、`initCloud()`、读写封装 `cloudWrite()`、清洗函数 `clean*()` |
| Community | 留言、来访、动态、访客簿、托管作品、分享卡片 |
| Overlays / Search | 3D 热点、地球标签、轨道动态 `layoutOrbit()`、控制台小屏 `syncHomeLcd()`、搜索 |
| Transitions | `diveInto()`（从地球进房间）、`exitToGlobe()` |
| Panels | `setPanel()` 与各类面板：Bit、作品、黑板、住户、选址 |
| Windows | 站内作品窗口与 SDK 消息处理 |
| Build | 装修模式：选中、属性面板、物件库 |
| P1 | 收藏与改编、主题周、物件流、试玩、Bit 转达 |
| v6 体验修复 | 口袋、房间名片、待上传清单、打开结果统计、冷启动、SDK 说明 |

### 全局状态

- `S`：视图与交互状态（当前视图、房间、面板、选中物件、聊天记录）。
- `G`：地球相关状态。
- `CLOUD`：账号与共享数据的内存镜像（`rooms`、`msgs`、`visits` 是 `Map`，由 `onSnapshot` 实时更新）。
- `POCKET`、`TH`（主题周）、`OF`（物件流）、`QP`（试玩）、`WINS`（作品窗口）。

### 写一个新面板

```js
function openSomething(r) {
  if (S.panel) closePanel(true);
  S.panel = { kind: 'something', r };
  setPanel('眉标 · 编号', '标题', `<p>内容，只用设计系统里的类名</p>`, `<button type="button" class="btn primary" id="smGo">主操作</button>`);
  $('#smGo').addEventListener('click', () => { /* … */ });
}
```

- 所有插进 HTML 的变量都要过 `esc()`。
- 面板 `kind` 要唯一；关闭时需要清理的东西写进 `closePanel()`。

## 数据模型（claude.ai Artifact 数据库）

| 路径 | 谁能写 | 内容 |
| --- | --- | --- |
| `site/room302` | 页面所有者 | 302 的布置、地址、房主 id、名片 `card`、主题周记录 |
| `site/room302/works/<id>` | 页面所有者 | 302 托管的单文件作品 |
| `rooms/<uid>` | 本人 | 一间房：`no` 门牌号、`handle`、`name`、`tpl`、`theme`、`items` 家具、`lat`/`lon`/`city` 城市级坐标、`card` 名片、`tw`/`twLog` 主题周、`createdAt`/`updatedAt` |
| `rooms/<uid>/works/<id>` | 本人 | 托管的单文件作品（≤ 200 KB） |
| `msgs/<uid>` | 本人 | 本人发出的留言与回复，最近 120 条；预约带 `kind:"appt"`、`when`；被催过带 `nudge` |
| `visits/<uid>` | 本人 | 本人去过的房间：`log[<roomKey>] = { n 次数, did 做过的事, at, via 来源计数, open 打开结果计数 }` |
| `data/users/<uid>/state` | 本人，私有 | 上次查看动态的时间 |
| `data/users/<uid>/pocket` | 本人，私有 | 口袋：还没摆进房间的收藏 |

### 约定

- **每人只写自己的文档**。别人的房间被收藏、被改编、被访问，都通过扫描所有人的数据得出，不往别人的文档里写。
- **读别人的数据必须清洗**：用 `cleanItems()`、`cleanEntry()`、`cleanFrom()`、`cleanCard()`、`cleanTheme()`、`cleanPocket()`。新增字段时，先在清洗函数里加白名单和长度上限，再使用。
- **地址只到城市**：坐标一律经过 `snapToCity()`，不存精确位置。
- **新增字段要向后兼容**：旧文档没有这个字段时，页面必须能正常显示。
- **写入失败要有提示**：用 `cloudWrite()`，它会把 `invalid_argument`（没有写权限）、`quota_exceeded`、`resource_exhausted` 翻译成用户能看懂的提示。
- **权限判断**：`canPost()` 为假时，所有写操作都要提前拦下并说明原因，不要等写入失败。

### 来访来源 `via`

| 值 | 含义 |
| --- | --- |
| `share` | 分享链接（链接带 `&from=share`） |
| `feed` | 物件流 |
| `globe` | 地球上点住户 |
| `search` | 搜索 |
| `room` | 从别的房间串门过来 |
| `link` | 不带来源的直接链接 |

### 打开结果 `open`

`sdk` 已握手 · `nosdk` 加载完成但没握手 · `fail` 9 秒内没加载完成。用于计算“作品成功打开率”。

## 安全

- 作品一律在沙箱 iframe 里运行，权限见 `docs/SDK.md`。托管作品没有同源权限。
- 只接受 `gebi: 1` 的消息；外链作品的消息还要校验 origin。
- 不在页面里放任何密钥。Bit 的对话走 `sample` 能力，不需要 API Key。

## 迁移路线（面向公众前要做）

| 阶段 | 内容 |
| --- | --- |
| 1 | 拆分 `app.js` 为 ES 模块（scene / globe / cloud / panels / windows / build / community），引入一个零配置打包（esbuild）。规则不变。 |
| 2 | 抽出数据访问层：所有 `CLOUD.db` 调用集中到一个 `store` 模块，接口保持 `get / set / onSnapshot`。 |
| 3 | 换成自己的后端（账号、房间、留言、来访、托管作品），实现同一套接口；Artifact 版本保留为演示环境。 |
| 4 | 托管作品迁到独立域名，用真正的跨源隔离替代 `srcdoc`。 |
