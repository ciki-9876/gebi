# 架构与数据约定

## 运行形态

隔壁目前是一个**单页原型**，发布为 claude.ai Artifact：

- 没有自己的服务器。账号、共享数据、AI 对话全部来自 Artifact 运行时能力（`user`、`db`、`sample`、`downloads`）。
- 几乎没有构建步骤：`index.html` 引用 `styles/*.css` 和 `app.js`，Three.js 等依赖从 CDN 加载。`app.js` 由 `tools/build.mjs` 把 `src/` 下的文件拼接而成，没有转译和压缩。
- 本地开发用 `dev/serve.py`，`--mock` 时用 `dev/mock-claude.js` 模拟 `db` 和 `user`。

> 这个形态有一个硬限制：组织外的人用公开链接打开时，平台只给“查看者”权限，**写不了任何共享数据**（不能入住、留言，来访不被记录）。面向公众开放之前，需要迁到自己的后端，见文末“迁移路线”。

## 代码结构

源码在 `src/` 下，按区块拆成 30 个文件，文件名前的编号就是加载顺序。`tools/build.mjs` 把它们按顺序拼接、包进一个 IIFE，生成 `app.js`，页面加载的是 `app.js`。

- **只改 `src/`，不要直接改 `app.js`。** 改完运行 `node tools/build.mjs`，把 `src/` 和 `app.js` 一起提交。`node tools/check.mjs` 会检查两者是否同步。
- `dev/serve.py` 每次请求 `app.js` 都会自动重新生成，本地改完刷新页面即可。
- 所有文件共享同一个作用域，和拆分前一样：一个文件里定义的函数和变量，其他文件可以直接用，不需要导入导出。顶层直接执行的代码（不在函数里的）只能用编号更小的文件里已经定义的 `const`/`let`。
- 拼接后的 `app.js` 和拆分前逐字节一致（只多了第一行注释），所以发布流程不变。
- 新增文件：编号插在合适的位置，名字只用小写字母、数字和连字符，例如 `src/16-panels-bit.js`；需要插在两个编号之间时，可以给后面的文件统一重新编号。

| 文件 | 内容 |
| --- | --- |
| `00-utils.js` | `$`、`esc`、`store`、`clamp` 等基础工具 |
| `01-renderer.js` | 渲染器、后期处理、相机 |
| `02-helpers.js` | 几何、材质、canvas 工具；`FONT`、`TK`（从 CSS 读取的语义 token，画布和 3D 里的界面元素都用它取色）、`drawPlate()` |
| `03-state.js` | 全局状态 `S` |
| `04-geography.js` | 城市表 `CITIES`、演示住户 `RESIDENTS`、太阳位置 |
| `05-canvases.js` | 动态画布：机器人脸、显示器代码、便签、游戏、黑板 |
| `06-textures.js` | 房间外壳的贴图 |
| `07-items.js` | 家具的程序化建模（`build*` 函数）、物件定义 `ITEMS` |
| `08-rooms.js` | 房间布局 |
| `09-room-build.js` | 房间搭建：可以走进去的封闭房间 |
| `10-controls.js` | 第一人称控制、装修时的娃娃屋相机 |
| `11-globe.js` | 地球点阵、住户标签、连线、选址；状态 `G` |
| `12-cloud.js` | `CLOUD` 状态、`initCloud()`、读写封装 `cloudWrite()`、清洗函数 `clean*()`；留言、来访、动态、访客簿、托管作品、分享卡片 |
| `13-overlays.js` | 3D 热点、地球标签、轨道动态 `layoutOrbit()`、控制台小屏 `syncHomeLcd()` |
| `14-home.js` | 地球首页界面、搜索 |
| `15-transitions.js` | `diveInto()`（从地球进房间）、`exitToGlobe()` |
| `16-panels.js` | `setPanel()` 与各类面板：Bit、作品、黑板、住户、选址 |
| `17-windows.js` | 站内作品窗口与 SDK 消息处理（`WINS`）、装修模式的选中与属性面板 |
| `18-mood.js` | 氛围与音乐 |
| `19-chrome.js` | 模式切换、导航、页面外框 |
| `20-p1.js` | 收藏与改编、主题周（`TH`）、物件流（`OF`）、试玩（`QP`）、Bit 转达 |
| `21-v6.js` | 口袋（`POCKET`）、房间名片、待上传清单、打开结果统计、冷启动、SDK 说明 |
| `22-art-types.js` | AI 产物的类型表 `ART_TYPES`（怎么存、怎么打开）和展示类别 `ART_CATS`（能放进哪些物件）；识别文件类型；清洗 `entry.art` |
| `23-art-store.js` | AI 产物的存储：assets、数据库、离线时的 IndexedDB；在浏览器里解压 zip；项目的拆分保存与读取 |
| `24-art-carriers.js` | 各展示类别的载体物件（19 件，加上已有的展示屏、街机、白板、机柜）和它们在物件库里的图标；把图片、视频帧、模型、图表放到物件上的工具函数 |
| `25-art-viewers.js` | 打开 AI 产物的窗口：图片、播放器、PDF、沙箱里的文档与代码、项目的文件树与运行 |
| `26-publish.js` | 发布台：拖放、粘贴、发布链接、发布包都在这里汇合，Bit 补全介绍，存好后摆进房间 |
| `27-input.js` | 键盘、鼠标、触屏输入 |
| `28-loop.js` | 主循环 |
| `29-boot.js` | 启动 `boot()` |

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
| `rooms/<uid>/works/<id>` | 本人 | 托管的单文件作品（≤ 200 KB）；也存 AI 产物的文本、项目清单、数据库里的二进制，见下 |
| `rooms/<uid>/works/<id>-c<n>` | 本人 | 项目和大文件的分块 |
| `msgs/<uid>` | 本人 | 本人发出的留言与回复，最近 120 条；预约带 `kind:"appt"`、`when`；被催过带 `nudge` |
| `visits/<uid>` | 本人 | 本人去过的房间：`log[<roomKey>] = { n 次数, did 做过的事, at, via 来源计数, open 打开结果计数 }` |
| `data/users/<uid>/state` | 本人，私有 | 上次查看动态的时间 |
| `data/users/<uid>/pocket` | 本人，私有 | 口袋：还没摆进房间的收藏 |

### AI 产物 `entry.art`

发布的 AI 产物挂在物件的 `entry` 上，`entry.kind` 是类型（`doc` `image` `video` `audio` `pdf` `project` `model` `data` `file`；网页和小游戏仍是 `web` `game2`，沿用 `work` 字段）。`entry.art` 的字段：`t` 类型、`cat` 展示类别（旧数据没有时按类型推算）、`name` 文件名、`mime`、`bytes`、`made` 用什么 AI 做的，以及下面三者之一：`asset`（assets 的 id，显示地址是 `/_blob/<id>`）、`url`（外部网址）、`work`（数据库路径：文本文档 `{text}`、项目清单 `{kind:"project", files, chunks}`、二进制 `{kind:"blob", chunks}`）。清洗函数是 `cleanArt()`，协议见 `docs/PUBLISH.md`。

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
| 1 | 拆分 `app.js` 为 ES 模块（scene / globe / cloud / panels / windows / build / community），引入一个零配置打包（esbuild）。规则不变。**已完成第一步**：按区块拆到 `src/`，用拼接生成 `app.js`，还没有改成 ES 模块。 |
| 2 | 抽出数据访问层：所有 `CLOUD.db` 调用集中到一个 `store` 模块，接口保持 `get / set / onSnapshot`。 |
| 3 | 换成自己的后端（账号、房间、留言、来访、托管作品），实现同一套接口；Artifact 版本保留为演示环境。 |
| 4 | 托管作品迁到独立域名，用真正的跨源隔离替代 `srcdoc`。 |
