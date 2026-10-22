# 隔壁 SDK

作品在房间里以站内窗口运行（沙箱 iframe）。**不接 SDK 也能用**；接了以后：

- 窗口标题栏显示“已接入隔壁 SDK”，房间能确认作品真的打开了（这也是“作品成功打开率”指标的来源）；
- 作品可以把状态、画面同步回房间里的物件，比如游戏机屏幕显示你的游戏画面、便签显示待办数。

## 最小接入（约 15 行）

```js
const gebi = { on: false, origin: '*' };
addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.gebi !== 1 || m.type !== 'hello') return;
  gebi.on = true; gebi.origin = e.origin;
  // m.room = { no, name, owner }  m.entry = { title }  m.data = 房间给的初始数据
  parent.postMessage({ gebi: 1, type: 'ready' }, e.origin);
});
gebi.send = (type, extra) => {
  if (gebi.on) parent.postMessage(Object.assign({ gebi: 1, type }, extra), gebi.origin);
};
```

在隔壁之外打开你的作品时，`hello` 不会出现，`gebi.on` 一直是 `false`，所有 `send` 都不发，不影响作品本身。

## 消息

所有消息都是 `{ gebi: 1, type, ... }`。

### 房间 → 作品

| type | 字段 | 什么时候 |
| --- | --- | --- |
| `hello` | `room: { no, name, owner }`，`entry: { title }`，`data` | iframe 加载完成后立即发送；点“重新载入”会再发一次 |

`data` 只对内置作品有内容（拾光：`{ tasks, skin, date }`；贪吃蛇：`{ best }`），普通作品是 `{}`。

### 作品 → 房间

| type | 字段 | 效果 |
| --- | --- | --- |
| `ready` | — | 握手完成。4 秒内没收到，窗口显示“未接入 SDK” |
| `state` | `data: object` | 同步状态给物件。目前内置作品会读取；通用物件的状态显示在规划中 |
| `screen` | `frame: ImageBitmap`（作为 transferable 传入），或 `data:image/png;base64,…` 字符串（≤ 400 KB） | 把画面画到物件屏幕上，按物件屏幕比例裁切铺满 |
| `toast` | `text: string`（≤ 60 字） | 在房间里弹一条轻提示 |
| `close` | — | 关闭这个作品窗口 |

推画面的示例：

```js
function pushFrame(canvas) {
  if (!gebi.on || !window.createImageBitmap) return;
  createImageBitmap(canvas).then((f) => parent.postMessage({ gebi: 1, type: 'screen', frame: f }, gebi.origin, [f]));
}
// 游戏建议每秒不超过 12 帧
setInterval(() => pushFrame(document.querySelector('canvas')), 83);
```

## 两种作品，两种沙箱

| | 外链作品（填网址） | 托管作品（上传单文件 HTML） |
| --- | --- | --- |
| iframe 来源 | 你的网站 | `srcdoc`，不同源 |
| 沙箱权限 | `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock` | `allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups`（没有同源权限：不能用 cookie、localStorage 可能不可用） |
| 消息校验 | 房间只接受来自你网站 origin 的消息 | 按 iframe 窗口识别 |
| 大小 | 不限 | ≤ 200 KB |

## 外链作品必须允许被嵌入

- 不要设置 `X-Frame-Options: DENY` 或 `SAMEORIGIN`。
- 如果设置了 CSP，`frame-ancestors` 要包含隔壁的域名（线上原型运行在 claude.ai 的 Artifact 里）。
- github.com、Notion、Figma 等网站禁止被嵌入，房主绑定时会看到提示，建议改成“新标签页”打开。GitHub Pages 允许嵌入。
- 需要登录的作品：Cookie 设为 `SameSite=None; Secure`，或者引导访客在新标签页登录。

## 窗口状态与排查

| 标题栏显示 | 含义 |
| --- | --- |
| 连接中 | 等待 iframe 加载 |
| 已接入隔壁 SDK · 物件同步中 | 收到了 `ready` |
| 未接入 SDK · 怎么接 | 页面加载完成，但 4 秒内没有 `ready`。画面正常就说明作品能用 |
| 加载失败 | 9 秒内 iframe 没有触发加载完成：网址打不开、太慢，或禁止被嵌入 |

跨站的 iframe 内容对房间不可见，所以“加载完成但一片空白”（多半是禁止嵌入）和“正常但没接 SDK”只能由访客的眼睛判断。接入 SDK 就能消除这种不确定。
