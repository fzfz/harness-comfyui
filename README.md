# Harness ComfyUI

Harness ComfyUI 是通过 DSH Desktop generation 接入 DeepSeek Harness 的 ComfyUI 集成项目。项目提供 Host 插件、使用 Harness 原生扩展位的 Client 插件、完整 Desktop 的生产与开发命令，以及独立 Web Host 调试命令。当前 Client 使用 `sidebar.footer.action`、`conversation.input.dock`、`details` 和 `shell.overlay` 提供 ComfyUI 工作台入口、上下文选择器与生成结果列，并保留 Harness 的 AppFrame、Session 列表、会话区和原生 composer。

## 环境要求

- Node.js `22.19.0` 或 `24.0.0` 以上版本
- pnpm `11.7.0`
- 当前 checkout 的 `.local/upstreams/dsh-desktop` 中已经准备的 DSH Desktop 底座
- 本机 Chrome 或 Chromium；production 默认路径为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，其他安装路径通过 `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH` 配置
- 两个已发布的 Catalog/Source CLI；默认路径见 [`config/source-production.json`](config/source-production.json)
- 主开发 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/` 中的五个 Skill 是本项目 Skill 的唯一源码；生产部署把 `$HOME/.agents/skills/` 中对应名称配置为指向主开发 checkout 对应目录的绝对符号链接，绝不指向独立 linked worktree

## 启动

```sh
pnpm install --frozen-lockfile
pnpm prod:start
```

`prod:start` 在前台执行 DSH Desktop `pnpm preview`，加载当前 Git tag 的插件 generation。另开一个终端检查状态：

```sh
pnpm prod:status
pnpm prod:logs
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm prod:start` | 启动完整 DSH Desktop 生产环境 |
| `pnpm prod:stop` | 停止受管进程 |
| `pnpm prod:restart` | 使用当前 tag 和配置重启生产 Desktop |
| `pnpm prod:status` | 查看进程状态 |
| `pnpm prod:logs` | 读取生产 Desktop 日志 |
| `pnpm prod:test` | 自动测试 Desktop、Web Host、worktree 配置和进程隔离 |

`prod:start` 和 `prod:restart` 根据当前源码生成 Client/Host 模块，打包并安装当前插件 generation，再启动 Electron。完整配置和运行目录说明见[系统启动](docs/system/startup.md)与[配置规范](docs/system/configuration.md)。

### 独立 worktree 开发验证

Agent 在 `git worktree` 创建的独立 linked worktree 中验证未发布源码时使用：

```sh
pnpm dev:start
pnpm dev:status
pnpm dev:logs
pnpm dev:stop
```

`dev:start` 创建 `<worktree>/.env -> <main>/.env` 与 `<worktree>/node_modules -> <main>/node_modules`，然后从主开发 checkout 的 DSH Desktop 底座执行原生 `pnpm dev`。worktree 不执行 `pnpm install`，不复制 `.env`，也不 clone 第二份 DSH Desktop。开发运行状态保存在 `.local/desktop-development/`。完整操作步骤见[独立 worktree 开发验证流程](docs/agents/worktree-development.md)。

单独调试 Web Host 时使用 `pnpm web:start|stop|restart|status|health|logs`；`web:*` 不启动 Electron，不能替代完整 Desktop 验收。

### Agent Preset 与项目 CLI

`prod:start`、`prod:restart`、`dev:start`、`dev:restart`、`web:start` 和 `web:restart` 都会校验并把用户可见名称为 `ComfyUI工作台预设` 的一个项目 Preset 物化到当前运行 DSH home。该 Preset 保留内部 ID `harness-comfyui-cli-candidate`，因此已有对该内部 ID 的默认选择和 Session 引用不需要迁移。该 Preset 不向模型提供 8 个 Host 项目 Tool schema；Agent 按需读取全局项目 Skill 及其 CLI 参考文档，再通过项目 managed CLI 查询目录、提交生成任务、查询历史 Run 或读取 Run 图片。Host 仍注册全部 8 个项目 Tool，选择 Harness `standard` Preset 的 Session 继续使用 Host 项目 Tool 路径。项目启动器只清理本项目已经退役的 Preset 目录，并保留同一 DSH home 中的其他 Preset。

主开发 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/` 下的 `anima-prompt-builder/`、`character-portrait-prompt-designer/`、`comfyui-generate/`、`comfyui-image-review/` 和 `wai-sdxl-prompt-builder/` 是五个 Skill 的 canonical source。生产部署逐个核对主开发 checkout 目录与 `$HOME/.agents/skills/<skill-name>/` 的目录条目类型、相对路径、符号链接目标和普通文件 SHA-256 后，把五个全局路径配置为指向主开发 checkout canonical source 的绝对符号链接；全局路径不得指向任何独立 linked worktree。不同仓库必须使用不同 Skill 名称，不能让两个仓库占用同一个全局 Skill 路径。

managed CLI 的 Generation Request 不包含 Workspace、Session、Turn 或 Tool Call ID。Host 从当前前台 shell ToolExecution 和 workspace registry 派生这些身份并写入 Run Repository。同一个 Generation Request 允许多次独立提交；每次独立提交使用不同的前台 shell Tool Call，并产生独立的 `call_id` 与 `run_id`。

Host 额外注册 `read_comfyui_run_inputs`。该 Tool 接收 1 至 20 个完整 Run ID 或最少包含八个 UUID 字符的短 Run ID，按输入顺序返回每个 Run 创建时传入 `generate_with_comfyui` 的 `title`、可选 `instance_id`、`template_id`、可选 `model`、完整 `parameters`、`loras` 和保存的 Actual Workflow。短 ID 只在当前 Workspace 中解析；唯一匹配时成功项返回完整 canonical Run ID，无匹配或匹配多个 Run 时只为该项返回错误并继续查询其他项。managed CLI 提供同一能力：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed","run_d26923be"]}
JSON
```

合法批量请求即使包含单项错误也返回退出码 0；调用者读取 `runs[].lookup_status` 分别处理每个结果。历史记录没有保存 `loras` 属性时，`arguments.loras: []` 只表示该次 `generate_with_comfyui` 调用没有保存显式结构化 LoRA 选择，不能据此判断 Actual Workflow 没有预置或活动 LoRA。历史记录没有保存 `model` 属性时不输出 `arguments.model`，表示该次调用没有保存显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。

Harness 设置中的“图片读取”页面可以保存、复制、删除和切换多份命名配置。每份配置可以从当前 LLM 运行时动态选择明确支持图片输入的系统 Provider 与模型，也可以填写 OpenAI 兼容 Chat Completions 完整地址、模型 ID 和可选 API Key；每份配置独立保存默认读图 Prompt、`temperature` 和最大输出 Token。API Key 作为 Harness Settings secret 保存，不进入浏览器设置快照。图片读取模型独立于当前 Session 模型和 ComfyUI 生图模型，设置页不硬编码任何 Provider。

Host 注册 `get_generation_run_media` 与 `inspect_image`。前者按输入顺序查询一至二十个完整或唯一短 Run ID，并返回当前 Workspace 中每个 Run 的原始 `parameters` 与本地图片路径；后者一次只读取一个本地图片路径，并使用当前命名配置中的独立视觉模型返回观察文本。系统 Provider 配置复用 Harness LLM Runtime；OpenAI 兼容配置直接调用已配置的 Chat Completions 地址。`comfyui-image-review` Skill 使用自己的 `references/cli.md` 调用对应 managed CLI，先取得 Run 图片，再逐图读取，最后由 Agent 对比原始 Prompt 与观察文本并编写改进 Prompt。Run 查询、视觉读取和语义对比不会耦合在同一个 Tool 中。

Generation 请求只要求导入 UI Workflow。Host 使用当前 UI Workflow、目标实例 `/object_info`、节点输入名称、活动状态和上下游连线定位显式运行参数，不读取 Source 模板记录中的参数定义或 binding 元数据。Host 使用 `/object_info` 的实时枚举校验运行参数，并在唯一大小写匹配时写入实例返回的精确值；无法匹配时，`generate_with_comfyui` 把具体参数目标、收到值和允许值返回给调用方。Source 读取、Workflow 编译或 Official API Workflow 准备中的其他错误也会在 Tool 返回 `run_id` 前返回调用方；只有成功返回 `run_id` 后的远端提交、观察、执行和媒体下载错误继续异步写入 Run。成功解析的 `/object_info` 在 Host 进程内缓存 10 分钟，同一实例的并发请求共享一个在途请求。Official API Workflow Cache 未命中时，Host 启动配置的本机浏览器，让目标 ComfyUI 官方前端调用 `loadGraphData()` 与 `graphToPrompt()` 生成基础 API Workflow；缓存命中时，Host 复制本地基础对象并覆盖本次已确认的运行输入。官方前端导出失败时请求明确失败，不会静默回退到手写导出。完整数据流见[系统架构](docs/system/architecture.md)。

结果列中的图片或视频在 DSH Desktop 原生 Modal 内打开同源媒体查看页，不创建浏览器新窗口。查看页按当前 Session 的媒体生成时间顺序提供较新与较早方向按钮，也支持不带修饰键的键盘左右键；首项和末项不会循环。查看页顶部显示当前媒体所属 Generation Run 的完整 `run_id` 和媒体文件的固有像素尺寸；用户点击 `run_id` 后，页面把完整值写入浏览器剪贴板并显示成功或失败状态。查看页在媒体下方显示该媒体所属 Generation Run 保存的原始正面提示词，未保存正面提示词时显示明确缺失状态。图片和视频保持原始宽高比完整显示，不裁切内容；视频使用浏览器原生播放控件。

## 测试

```sh
pnpm quality
```

独立 linked worktree 的完整 Desktop 人工验证使用 `dev:*`，生产 checkout 使用 `prod:*`，独立 Web Host 调试使用 `web:*`。`prod:test` 使用临时目录和端口自动验证三种环境的生命周期、配置和进程隔离。

## 文档

- [技术栈](docs/system/technology-stack.md)
- [系统架构](docs/system/architecture.md)
- [目录结构](docs/system/directory-structure.md)
- [配置规范](docs/system/configuration.md)
- [测试规范](docs/system/testing.md)
- [版本发布](docs/system/releasing.md)
- [系统启动](docs/system/startup.md)
- [v0.36.1 发布说明](docs/releasenotes.md)

当前产品版本是 `0.36.1`。对应发布记录在最终提交、`v0.36.1` tag 和 GitHub Release 创建后显示于 [GitHub Releases](https://github.com/fzfz/harness-comfyui/releases)。
