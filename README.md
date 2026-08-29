# Harness ComfyUI

Harness ComfyUI 是运行在 DeepSeek Harness 中的 ComfyUI 集成项目。项目当前提供 Host 插件、使用 Harness 原生扩展位的 Client 插件、直接管理当前源码的生产进程命令，以及隔离的独立 worktree 开发启动命令。当前 Client 使用 `sidebar.footer.action`、`conversation.input.dock`、`details` 和 `shell.overlay` 提供 ComfyUI 工作台入口、上下文选择器与生成结果列，并保留 Harness 的 AppFrame、Session 列表、会话区和原生 composer。

## 环境要求

- Node.js `22.19.0` 或 `24.0.0` 以上版本
- pnpm `11.7.0`
- 本机 Chrome 或 Chromium；production 默认路径为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，其他安装路径通过 `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH` 配置
- 两个已发布的 Catalog/Source CLI；默认路径见 [`config/source-production.json`](config/source-production.json)
- 使用 `ComfyUI工作台预设` 的 CLI-compatible 流程时，Harness 用户需要自行在 `$HOME/.agents/skills/comfyui-generate/` 安装对应 Skill；本项目不复制或发布该全局 Skill

## 启动

```sh
pnpm install
pnpm prod:start
```

`prod:start` 在前台运行当前目录中的源码。另开一个终端检查状态和健康：

```sh
pnpm prod:status
pnpm prod:health
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm prod:start` | 启动当前源码 |
| `pnpm prod:stop` | 停止受管进程 |
| `pnpm prod:restart` | 使用当前源码和配置重启 |
| `pnpm prod:status` | 查看进程状态 |
| `pnpm prod:health` | 检查进程、Web、Client 和数据目录 |
| `pnpm prod:logs` | 读取 Host 与操作日志 |
| `pnpm prod:test` | 自动测试生产进程的完整生命周期和异常分支 |

这些命令不要求单独执行构建、打包或版本安装。`prod:start` 和 `prod:restart` 会根据当前 `src/client/` 自动更新 `.local/source-client/client.js`，供 Harness 浏览器 ModuleLoader 加载。完整配置和运行目录说明见[系统启动](docs/system/startup.md)与[配置规范](docs/system/configuration.md)。

### 独立 worktree 开发验证

Agent 在 `git worktree` 创建的独立 linked worktree 中验证未发布源码时使用：

```sh
pnpm worktree:start
pnpm worktree:status
pnpm worktree:health
pnpm worktree:stop
```

`worktree:start` 使用独立的 `.local/worktree-development/` 运行目录和 `comfyui-workbench-development` DSH Profile。启动器根据 [`config/worktree-development.json`](config/worktree-development.json) 在开发 DSH home 中创建指向主开发 worktree `.env` 的符号链接，并在 Host 暴露项目能力前注册 startup workspace。启动器不读取或复制 `.env` 内容，也不会覆盖已经存在的普通文件或指向其他目标的符号链接。`prod:*` 不读取该开发定义，不创建该符号链接，也不注册开发 workspace。完整操作步骤见[独立 worktree 开发验证流程](docs/agents/worktree-development.md)。

### Agent Preset 与项目 CLI

`prod:start`、`prod:restart`、`worktree:start` 和 `worktree:restart` 都会校验并把用户可见名称为 `ComfyUI工作台预设` 的一个项目 Preset 物化到当前运行 DSH home。该 Preset 保留内部 ID `harness-comfyui-cli-candidate`，因此已有对该内部 ID 的默认选择和 Session 引用不需要迁移。该 Preset 不向模型提供 5 个 Host 项目 Tool schema；Agent 按需读取 Harness 用户安装在 `$HOME/.agents/skills/comfyui-generate/` 的全局 `comfyui-generate` Skill 及其 CLI 参考文档，再通过项目 managed CLI 查询目录、获取 ID 和提交生成任务。Host 仍注册全部 5 个项目 Tool，选择其他 Preset 的 Session 继续使用原有 Tool 路径。未安装该全局 Skill 时，项目 managed CLI 仍可通过 shell 直接调用；当当前 Workspace 也不提供同名 Workspace Skill 时，Skill roster 中不会出现 `comfyui-generate`。以本仓库为 Workspace 时，仓库内 `.agents/skills/comfyui-generate/` 可以提供同名 Workspace Skill。项目启动器不会修改 Harness 默认 Preset；启动器只清理本项目已经退役的 Preset 目录，并保留同一 DSH home 中的其他 Preset。

managed CLI 的 Generation Request 不包含 Workspace、Session、Turn 或 Tool Call ID。Host 从当前前台 shell ToolExecution 和 workspace registry 派生这些身份并写入 Run Repository。同一个 Generation Request 允许多次独立提交；每次独立提交使用不同的前台 shell Tool Call，并产生独立的 `call_id` 与 `run_id`。

Generation 请求只要求导入 UI Workflow。Host 使用当前 UI Workflow、目标实例 `/object_info`、节点输入名称、活动状态和上下游连线定位显式运行参数，不读取 Source 模板记录中的参数定义或 binding 元数据。Host 使用 `/object_info` 的实时枚举校验运行参数，并在唯一大小写匹配时写入实例返回的精确值；无法匹配时，`generate_with_comfyui` 把具体参数目标、收到值和允许值返回给调用方。Source 读取、Workflow 编译或 Official API Workflow 准备中的其他错误也会在 Tool 返回 `run_id` 前返回调用方；只有成功返回 `run_id` 后的远端提交、观察、执行和媒体下载错误继续异步写入 Run。成功解析的 `/object_info` 在 Host 进程内缓存 10 分钟，同一实例的并发请求共享一个在途请求。Official API Workflow Cache 未命中时，Host 启动配置的本机浏览器，让目标 ComfyUI 官方前端调用 `loadGraphData()` 与 `graphToPrompt()` 生成基础 API Workflow；缓存命中时，Host 复制本地基础对象并覆盖本次已确认的运行输入。官方前端导出失败时请求明确失败，不会静默回退到手写导出。完整数据流见[系统架构](docs/system/architecture.md)。

结果列中的图片或视频在新标签页打开本会话媒体查看页。查看页按当前 Session 的媒体生成时间顺序提供较新与较早方向按钮，也支持不带修饰键的键盘左右键；首项和末项不会循环。查看页顶部显示当前媒体所属 Generation Run 的完整 `run_id` 和媒体文件的固有像素尺寸；用户点击 `run_id` 后，页面把完整值写入浏览器剪贴板并显示成功或失败状态。查看页在媒体下方显示该媒体所属 Generation Run 保存的原始正面提示词，未保存正面提示词时显示明确缺失状态。图片和视频保持原始宽高比完整显示，不裁切内容；视频使用浏览器原生播放控件。

## 测试

```sh
pnpm quality
```

独立 linked worktree 的人工验证使用 `worktree:*`，生产 checkout 的进程管理使用 `prod:*`。`prod:test` 使用临时目录和端口自动验证共享生命周期、独立 worktree 配置和生产隔离。

## 文档

- [技术栈](docs/system/technology-stack.md)
- [系统架构](docs/system/architecture.md)
- [目录结构](docs/system/directory-structure.md)
- [配置规范](docs/system/configuration.md)
- [测试规范](docs/system/testing.md)
- [版本发布](docs/system/releasing.md)
- [系统启动](docs/system/startup.md)
- [v0.33.2 发布说明](docs/releasenotes.md)

当前产品版本是 `0.33.2`。对应发布记录在最终提交、`v0.33.2` tag 和 GitHub Release 创建后显示于 [GitHub Releases](https://github.com/fzfz/harness-comfyui/releases)。
