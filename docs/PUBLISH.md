# 发布协议：把任何 AI 产物摆进隔壁

用任何 AI 工具做出来的东西，网页、文档、图片、视频、音频、PDF、3D 模型、整个项目，都可以一键发布到自己的房间里，变成一件能走过去打开的物件。

这份文档是**发布协议的唯一标准**。房间页面（`src/22-art-types.js` 到 `src/26-publish.js`）、发布工具（`tools/gebi-publish.mjs`）、以后的 HTTP 接口，都实现同一份协议。

## 三种发布方式

| 方式 | 适合 | 用户要做的 |
| --- | --- | --- |
| **发布链接** | 用户的 AI 装了隔壁发布工具（MCP），或者能运行脚本；内容不大（压缩后 ≤ 48 KB，大多数网页、文档、代码） | 点 AI 给的链接 → 在隔壁里点“发布” |
| **发布包** | 内容大，或者包含图片、视频、整个项目 | 把 AI 生成的 `.gebi.zip`（或 `.gebi.json`）拖进隔壁 → 点“发布” |
| **直接拖放 / 粘贴** | 什么工具都没有 | 把 AI 做出的文件直接拖进隔壁，或者把 AI 回复里的代码、文章粘贴进来 → 点“发布” |

三种方式最后都进入同一个“发布台”：隔壁识别类型、分配物件，房间里的 AI（Bit）读一遍内容，补全标题、介绍和推荐的物件，用户确认后发布。

有了自己的后端之后（`docs/ARCHITECTURE.md` 迁移路线第 3 阶段），会增加第四种：AI 直接调用 HTTP 接口发布，用户什么都不用点。接口用的也是下面同一份清单格式，见文末。

## 清单 `gebi.json`

所有方式都用同一个 JSON 清单描述“要发布什么”。字段都是可选的，隔壁能从文件本身猜出来的，不写也行。

```json
{
  "gebi": 1,
  "title": "霓虹贪吃蛇",
  "desc": "方向键控制的像素小游戏",
  "type": "web",
  "carrier": "arcade",
  "made_with": "Claude",
  "entry": "index.html",
  "url": "https://example.com/snake",
  "files": [
    { "path": "index.html", "text": "<!doctype html>…" },
    { "path": "cover.png", "base64": "iVBORw0KGgo…", "mime": "image/png" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `gebi` | 协议版本，目前是 `1` |
| `title` | 作品名，最多 30 字 |
| `desc` | 一句话介绍，最多 80 字 |
| `type` | 作品类型，见下表。省略或 `auto` 时由隔壁判断 |
| `carrier` | 想用的物件，见下表。省略时用类型的默认物件 |
| `made_with` | 用什么 AI 工具做的，最多 30 字，显示在作品窗口里 |
| `entry` | 项目的入口文件，默认 `index.html` |
| `url` | 不上传文件，只引用一个公开网址（已部署的网站、图床上的图片、视频直链） |
| `files` | 要上传的文件。文本文件用 `text`，二进制文件用 `base64` 加 `mime` |

`url` 和 `files` 二选一。两个都没有时，清单无效。

## 类型与物件

| `type` | 识别依据 | 默认物件 `carrier` | 打开后 | 存在哪里 |
| --- | --- | --- | --- | --- |
| `web` | 单个 `.html`，或粘贴的 HTML | `kiosk` 展示屏 | 沙箱窗口里运行 | 数据库，≤ 200 KB |
| `game` | 同上，内容像游戏（canvas、键盘控制） | `arcade` 街机 | 沙箱窗口里运行（横版） | 数据库，≤ 200 KB |
| `doc` | `.md` `.markdown` `.txt`，或粘贴的文章 | `reader` 阅读台 | 排版好的阅读视图 | 数据库，≤ 200 KB；更大的放 assets |
| `image` | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` `.avif` | `easel` 画架，画布上就是这张图 | 大图查看 | assets，≤ 20 MiB |
| `video` | `.mp4` `.webm` `.mov` | `tv` 电视 | 播放器 | assets，≤ 20 MiB |
| `audio` | `.mp3` `.wav` `.ogg` `.m4a` `.flac` | `phono` 唱片机 | 播放器 | assets，≤ 20 MiB（见下方说明） |
| `pdf` | `.pdf` | `reader` 阅读台 | 浏览器的 PDF 阅读器 | assets，≤ 20 MiB |
| `project` | `.zip`，或清单里有多个文件 | `workbench` 工作台 | 文件树、README；有 `index.html` 时可以直接运行 | 文本文件在数据库，图片等在 assets |
| `model` | `.glb` `.gltf` | `pedestal` 展台，模型就摆在展台上 | 展台上的实物 + 详情 | 数据库，≤ 2 MB |
| `data` | `.json` `.csv` `.js` `.py` `.ts` 等代码和数据 | `monitor` 显示器 | 代码高亮 / 表格视图 | 数据库，≤ 200 KB |
| `file` | 其他所有文件 | `crate` 储物箱 | 说明 + 下载 | assets 收的类型放 assets，其余放数据库，≤ 2 MB |

一个 `type` 可以换用别的物件，比如图片也可以放在展示屏上。可用的组合以页面里的 `ART_TYPES` 为准。

### 项目怎么运行

项目在沙箱 iframe 里运行，和托管的单文件网页一样没有同源权限。隔壁在运行前把入口页面处理成一个自包含的页面：

- `<script src>`、`<link rel="stylesheet">` 换成内联内容；ES 模块之间的 `import` 换成内联的模块。
- 图片、字体等换成 `data:` 网址。
- `fetch('相对路径')` 由注入的小脚本从项目文件里返回。
- 点击指向项目内其他 `.html` 的链接，会切换到那个页面。

需要服务器的项目（Node 后端、数据库）在这里跑不起来。工作台会显示文件树和 README，并说明这一点。

### 存储说明

Artifact 的 `assets` 只接受图片、视频、PDF、字体和几种文本（Markdown、纯文本、CSV、JSON），所以：

- **音频**按视频容器类型上传（m4a、mp3、wav、flac 用 `video/mp4`，ogg 用 `video/ogg`，webm 用 `video/webm`），浏览器会按内容播放。兼容性最好的是 m4a；mp3 在 Chrome、Edge、Firefox 上正常。
- **3D 模型和其他 assets 不收的文件**拆成 base64 存进数据库，单个 ≤ 2 MB。更大的请放到网上，用 `url` 发布。
- **文本**（Markdown、代码、数据）≤ 200 KB 时放数据库，所有人都能看到；更大的放 assets。
- 页面声明了参与者上传（`upload: "interact"`）之后，平台要求**任何上传的文件都不能作为代码运行，也不能把文件里的文字当 HTML 插进页面**（Markdown 渲染后也算）。所以文档、代码、项目一律在**沙箱 iframe** 里显示：文档和代码的沙箱不允许脚本，项目的沙箱允许脚本但没有同源权限。

### 限制

- 单个文件 ≤ 20 MiB（assets 的上限）；3D 模型和其他文件 ≤ 2 MB。
- 项目：文本文件合计 ≤ 1 MB，二进制文件按单个文件 20 MiB 计；不支持的文件类型会跳过并告诉用户。
- 参与者（不是页面所有者的住户）上传到 assets 的文件，平台只对同一个组织内的人显示。面向公众开放之前，媒体文件也要迁到自己的后端。
- assets 里的文件**永远不作为代码运行**。网页和项目的代码只从数据库读取，在沙箱里运行。
- 项目里的图片、字体等先由页面读出来，转成 `data:` 网址再交给沙箱，沙箱本身不直接请求 assets。

## 发布链接

发布链接是在隔壁的地址后面加上 `#publish=` 和编码后的清单：

```
https://claude.ai/artifact/LWAStw84ruoEsCPAvfHYEP#publish=z.<base64url(deflate-raw(清单 JSON))>
```

- `z.` 开头：清单 JSON 用 raw deflate 压缩后做 base64url 编码。发布工具生成的都是这种。
- `j.` 开头：清单 JSON 直接做 base64url 编码，不压缩。
- 编码后超过 48 KB 的内容，用发布包。

打开链接后，隔壁会先把人带回自己的房间（还没有房间的先入住），再打开发布台。链接里的内容只在点“发布”之后才会写入，**打开链接本身不会发布任何东西**，所以别人发来的链接也不会悄悄往你房间里放东西。

## 发布包

- **`.gebi.zip`**：普通 zip 文件，根目录有 `gebi.json` 清单，其他文件就是作品文件。清单里不用再写 `files`。
- **`.gebi.json`**：只有清单，文件内容都写在 `files` 里。适合只能输出文本的 AI。
- 没有清单的普通 `.zip` 也可以，按项目处理。

## 发布工具（MCP）

`tools/gebi-publish.mjs` 是一个不依赖任何 npm 包的 MCP 服务器，也可以当命令行工具用。用户把它加进自己的 AI 工具（Claude Desktop、Claude Code、Cursor、Codex 等支持 MCP 的都行），然后对 AI 说“把这个发布到隔壁”。

提供三个工具：

| 工具 | 作用 |
| --- | --- |
| `gebi_publish_files` | 发布本地的文件或文件夹。内容小就返回发布链接，大就生成 `.gebi.zip` 并告诉用户拖进隔壁 |
| `gebi_publish_content` | 发布 AI 刚刚写出来的内容（不在磁盘上的网页、文章、代码） |
| `gebi_formats` | 返回支持的类型、物件和大小限制，让 AI 在发布前自己检查 |

安装方式写在工具文件开头的注释里，隔壁页面的“发布说明”里也有，可以一键复制。

不支持 MCP 的 AI 工具，可以直接运行命令行：

```bash
node gebi-publish.mjs ./my-site --title "我的作品"
```

## 写给 AI 的发布说明

隔壁页面的发布台里有一段“复制给你的 AI”的文字，内容是这份协议的精简版：有发布工具就调用工具；没有工具就把作品整理成 `.gebi.json` 或 `.gebi.zip`，让用户拖进隔壁。

## 以后的 HTTP 接口（规划，未实现）

迁到自己的后端之后：

```
POST /v1/publish
Authorization: Bearer <房主在隔壁设置里生成的发布令牌>
Content-Type: multipart/form-data   字段 manifest = 清单 JSON，其余字段是文件
→ 201 { "room": "<房间链接>", "item": "<物件 id>", "url": "<直达这件作品的链接>" }
```

发布工具检测到环境变量 `GEBI_TOKEN` 时改走这个接口，用户就不用再点链接或拖文件了。令牌属于“新的密钥或令牌”，按 `AGENTS.md` 由房主决定何时启用。
