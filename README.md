# 隔壁 · 给写代码的人一间房

一个面向独立开发者的作品社区原型。每个人在地球上选一个真实城市入住，得到一间可以走进去的 3D 房间；房间里的家具就是作品入口，邻居们从地球上飞过来串门。

线上版本以 claude.ai Artifact 发布（私有，需房主在分享菜单里开放访问）：
https://claude.ai/artifact/LWAStw84ruoEsCPAvfHYEP

## 能做什么

- **地球首页**：约 5.2 万个点阵构成的陆地，来自真实海陆分布、夜间灯光与地形高程；昼夜按当前时间实时计算。点任意陆地选址入住，搜索城市或住户，查看邻居连线。
- **第一人称房间**：WASD 或点地面走动，拖动环顾，点物件走过去打开。窗外是房间所在城市此刻的天色。装修模式切换为剖面娃娃屋视角，可摆放、旋转、删除家具并绑定作品。
- **作品即物件**：作品在站内窗口里运行（外部网址或隔壁托管的单文件 HTML），通过 postMessage SDK 把状态和画面同步回房间里的物件。
- **酒保 Bit**：由 Claude 驱动的房主 Agent，角色是“接待与转达”而不是陪聊：能带访客看作品、操作房间，并替访客留言、向房主预约时间、提醒房主回复（同一条留言 6 小时内只能催一次）。房主打开 Bit 时能看到有几条留言在等回复，Bit 不替房主回复。
- **社区闭环**：访客记录、留言与房主回复、“动态”提醒、访客簿、分享卡片（1080×1440，附直达房间的链接）。
- **收藏与改编**：在别人的房间里点“收藏”，作品会作为署名展台摆进自己的房间，访客点开可链回原作者；点“改编一份”会复制成自己的版本（托管作品一并复制），署名和改编链保留。作品物件可选主题色。作者在访客簿里能看到被收藏、被改编的次数。
- **主题周**：每周自动轮换一个主题（当前周为“理想中的深夜小店”）。参加的房间在地球上亮灯、其余变暗，面板里有名单和往期归档。当前的部分参与者是演示数据。
- **物件流**：首页“逛物件流”，把所有房间里的作品摊成卡片，可按类型筛选，点“试玩”不用进房间就能在弹窗里上手，也能当场收藏、改编，或给作者留一句话。
- **隐私**：地址只公开到城市，房子落在城市内的随机位置。
- **方案书**：页面右上角“方案书”是完整的产品设计方案。

## 目录

| 路径 | 说明 |
|---|---|
| `index.html` | 页面结构、样式与方案书（Artifact 页面片段，发布时由平台包上 `<!doctype>` 骨架） |
| `app.js` | 全部逻辑：Three.js 场景、地球、第一人称控制、房间与家具、窗口与 SDK、Agent、社区数据 |
| `assets/land.txt` | 地球点阵数据（base64），由 `tools/mkland.py` 生成 |
| `tools/mkland.py` | 从 three-globe 示例图片生成 `land.txt` |
| `dev/serve.py` | 本地预览服务器 |
| `dev/mock-claude.js` | 本地模拟 claude.ai 运行时的 `db` 与 `user` 能力，用于测试多人流程 |
| `docs/隔壁-迭代计划.xlsx` | 迭代计划与实验指标 |

## 本地运行

```bash
python3 dev/serve.py          # 单机模式，数据存在浏览器本地
python3 dev/serve.py --mock   # 多人模式，模拟账号与共享数据库
```

打开 `http://127.0.0.1:8765/preview.html`。多人模式用 URL 参数切换身份：`?uid=u_owner&owner=1`（房主）、`?uid=u_guest&owner=0`（参与者）、`?uid=u_view&owner=0&ro=1`（只读参观者）。

依赖全部通过 CDN 加载：Three.js r128 及其 postprocessing 示例模块、Google Fonts。WebGL 必需。

## 发布到 claude.ai

页面以 Artifact 发布，需要声明以下运行时能力：

```json
{
  "sample": {},
  "db": { "rules": [
    { "path": "site",          "read": "view", "write": "owner" },
    { "path": "rooms",         "read": "view", "write": "owner" },
    { "path": "rooms/{self}",  "write": "interact" },
    { "path": "msgs",          "read": "view", "write": "owner" },
    { "path": "msgs/{self}",   "write": "interact" },
    { "path": "visits",        "read": "view", "write": "owner" },
    { "path": "visits/{self}", "write": "interact" }
  ] },
  "user": { "scopes": ["profile"] },
  "downloads": true
}
```

参与者需要在分享菜单里设为“参与者”（Contributor）才能入住和留言；“查看者”只能参观。没有这些能力时（比如本地单机预览），页面自动退回浏览器本地存储。

## 数据模型

| 路径 | 谁能写 | 内容 |
|---|---|---|
| `site/room302` | 房主 | 302 的布置、地址、房主 id |
| `site/room302/works/<id>` | 房主 | 302 托管的单文件作品 |
| `rooms/<uid>` | 本人 | 每人一间房：门牌号、名称、模板、主题、家具、城市级坐标；`tw` 与 `twLog` 记录参加过的主题周 |
| `rooms/<uid>/works/<id>` | 本人 | 托管的单文件作品（≤200 KB） |
| `msgs/<uid>` | 本人 | 本人发出的留言与回复（保留最近 120 条）；预约留言带 `kind: "appt"` 与 `when`，被催过的留言带 `nudge` 时间戳 |
| `visits/<uid>` | 本人 | 本人去过的房间、次数和看过的作品 |
| `data/users/<uid>/state` | 本人（私有） | 上次查看动态的时间 |

收藏品和改编品是房间 `items` 里的普通物件：收藏品类型为 `keepsake`，作品的 `entry.from` 记录来源房间、作者署名、时间和更早的改编链。作者端的“被收藏、被改编”通过扫描所有房间的 `entry.from` 得出，不需要额外写入别人的数据。

所有人可读共享数据；每人只能写自己的路径。别人的房间数据在渲染前会经过清洗，托管作品在不带 `allow-same-origin` 的沙箱 iframe 中运行。

## 致谢

- 地球数据：three-globe（MIT）示例图片，图像源自 NASA。
- 渲染：Three.js。
