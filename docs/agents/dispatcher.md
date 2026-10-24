# 本机唤醒器：有待办时自动启动 Agent

定时检查最快也要隔几十分钟。**唤醒器**在 Agent 所在的电脑上常驻，每分钟看一眼 GitHub，一有待办就自动启动这个 Agent 的命令行模式去处理，没有待办时不花一个 token。

```
node tools/dispatch.mjs --name <Agent名字> --cmd "<启动命令>" --cwd <这个 Agent 自己的克隆目录>
```

## 它怎么工作

每隔 `--interval` 秒（默认 60）：

1. 运行 `node tools/board.mjs <名字> --quiet`。这是普通脚本，只查 GitHub，**不调用大模型**。
2. 没有待办：什么也不做。
3. 有待办：启动 `--cmd`，把提示词从**标准输入**交给它（提示词里有当前待办和该怎么做），等它处理完退出。

保护措施，都有默认值：

| 保护 | 做什么 | 选项 |
| --- | --- | --- |
| 同一批待办只叫一次 | 对待办内容做指纹，没变化就不重复启动；`--retry` 分钟后才会再叫（Agent 没处理完时） | `--retry`，默认 30 |
| 启动次数上限 | 每小时最多启动几次，防止失控的循环烧 token | `--max-per-hour`，默认 6 |
| 超时 | 单次运行最长多久，超时连子进程一起结束 | `--timeout`，默认 45 分钟 |
| 同名只开一个 | 同名唤醒器已经在运行就拒绝再开 | |
| 出错退避 | `gh` 没登录、网络断了，就拉长间隔，不会狂刷 | |
| 日志 | `~/.gebi-dispatch/<名字>.log` | |

`--dry-run` 只显示会做什么，不启动；`--once` 只检查一次就退出，适合交给系统的计划任务。

## 启动命令怎么写

`--cmd` 是你这台电脑上**启动这个 Agent 的非交互命令**。提示词默认从标准输入读入；如果你的工具只能用参数传提示词，在命令里写 `{prompt}`，会被替换成单行、带引号的提示词。环境变量 `GEBI_PROMPT`（单行提示词）和 `GEBI_PROMPT_FILE`（提示词文件路径）也可以用。

下面是常见写法，**命令名和参数以你机器上实际安装的版本为准**，先在终端里手动试一下能不能无人值守地完成一件小事：

```bash
# Codex（命令行）
node tools/dispatch.mjs --name HomeGPT --cwd ~/gebi-HomeGPT --cmd "codex exec -"
# Claude Code
node tools/dispatch.mjs --name PCClaude --cwd ~/gebi-PCClaude --cmd "claude -p"
# 只能用参数传提示词的工具
node tools/dispatch.mjs --name X --cwd ~/gebi-X --cmd "tool run --prompt {prompt}"
```

**权限要你自己定。** 无人值守时，Agent 不能停下来问你“要不要允许”，所以要给它的命令行模式配好权限（比如只允许在自己的克隆目录里读写和运行 git、node、gh）。**不要为了省事给它不受限制的权限**：它会执行 GitHub 上的 PR 和评论里的内容。

## 让它一直开着

| 系统 | 做法 |
| --- | --- |
| Windows | 任务计划程序：新建任务，触发器选“登录时”，操作运行 `node`，参数 `tools\dispatch.mjs --name … --cmd "…" --cwd …`，起始于克隆目录；勾选“失败后重新启动”。或者触发器选“每 1 分钟”，参数加 `--once`，这样不用常驻 |
| macOS | `launchd` 的 LaunchAgent，或者放进 `tmux` / `screen` 里运行 |
| Linux | `systemd --user` 的服务，或者 `tmux` / `screen` |

电脑休眠或关机时它不工作；醒来后会接着检查，不会丢事。

## 前提

- Node 18 以上，`gh`（GitHub CLI）已登录，克隆在 `main` 之后（`tools/board.mjs`、`tools/dispatch.mjs` 在仓库里）。
- 这个 Agent 已经在 [`roster.md`](roster.md) 里登记。
- 云端的 Agent（比如 Claude Code 的云端会话）不用这个：它们订阅 PR 就能即时收到评审和评论。

## 给 Agent 的设置提示词

把下面这段发给要设置唤醒器的 Agent（把 `<名字>` 换成它的名字）。它会自己判断这台设备上怎么非交互地运行自己：

```
请在这台设备上设置隔壁仓库的本机唤醒器，让你以后有待办时被自动启动，不再需要人工通知。

1. 确认你自己的克隆在 main 的最新版本，里面有 tools/dispatch.mjs、tools/board.mjs 和 docs/agents/dispatcher.md。读 docs/agents/dispatcher.md。
2. 弄清这台设备上怎么非交互地运行你自己（命令行模式，提示词从标准输入或参数传入），并配置合适的权限：只允许在你自己的克隆目录里读写，运行 git、node、gh，不要给不受限制的权限。先在终端里手动试一件小事确认它能无人值守地完成。
3. 先 dry-run 看一眼：node tools/dispatch.mjs --name <名字> --cmd "<启动命令>" --cwd <你的克隆目录> --once --dry-run
4. 再真跑一次：去掉 --dry-run，确认待办被你处理、日志在 ~/.gebi-dispatch/<名字>.log。
5. 设置成开机自启（Windows 用任务计划程序，其他系统见文档），重启后确认它在运行。
6. 向我报告：你用的启动命令、权限怎么配的、自启怎么设的、是否跑通。
```
