# Harness ComfyUI

Harness ComfyUI 是通过 DSH Desktop generation 接入 DeepSeek Harness 的 ComfyUI 集成项目。项目提供 Host 插件、使用 Harness 原生扩展位的 Client 插件、完整 Desktop 的生产与开发命令，以及独立 Web Host 调试命令。当前 Client 使用 `sidebar.footer.action`、`conversation.input.dock`、`details` 和 `shell.overlay` 提供 ComfyUI 工作台入口、上下文选择器与生成结果列，并保留 Harness 的 AppFrame、Session 列表、会话区和原生 composer。

会话 Agent 运行期间，右侧“运行状态”持续查询当前会话的 Run；首批尚未创建或上一批已经完成时，面板也能自动显示随后创建的 Run。Agent 停止运行后，面板继续跟踪尚未结束的 Run，直到这些 Run 全部结束。

## 环境要求

- Node.js `22.19.0` 或 `24.0.0` 以上版本
- pnpm `11.7.0`
- 首次启动前，使用者必须把 `fzfz/dsh-desktop` 的 `5e08355a58bb727cb0f48c794550202d9d59ed9f` commit 检出到本地 `.local/upstreams/dsh-desktop`
- 本机 Chrome 或 Chromium；production 默认路径为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，其他安装路径通过 `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH` 配置
- 使用者必须准备一个独立部署并可通过 HTTP 或 HTTPS 访问的数据源服务。

## 首次启动

仅当当前 checkout 尚不存在 `.local/upstreams/dsh-desktop` 时执行以下完整首次准备：

```sh
(
set -e
mkdir -p .local/upstreams
git clone --branch main https://github.com/fzfz/dsh-desktop.git .local/upstreams/dsh-desktop
git -C .local/upstreams/dsh-desktop switch --detach 5e08355a58bb727cb0f48c794550202d9d59ed9f
test "$(git -C .local/upstreams/dsh-desktop rev-parse HEAD)" = "5e08355a58bb727cb0f48c794550202d9d59ed9f"
)
```

按照[docs/system/releasing.md 的受控依赖安装章节](docs/system/releasing.md#dsh-desktop-的受控依赖安装)安装 Desktop 依赖后，在 Harness checkout 根目录继续执行：

```sh
(
set -e
pnpm install --frozen-lockfile
pnpm desktop:dependencies:link
cp .env.example .env
pnpm prod:start
)
```

`.env.example` 列出 Provider API Key、可覆盖的 Harness 业务配置，以及必须在 JSON 配置或 DSH Desktop 设置页修改的 Workspace、路径和图片读取接口。使用者在 Harness 的“ComfyUI”设置页填写数据源服务 URL 和端口。

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

`prod:start` 和 `prod:restart` 根据当前源码生成 Client、Host 与 managed CLI 运行模块，打包并安装当前插件 generation，再启动 Electron。完整配置和运行目录说明见[系统启动](docs/system/startup.md)与[配置规范](docs/system/configuration.md)。

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

`prod:start`、`prod:restart`、`dev:start`、`dev:restart`、`web:start` 和 `web:restart` 都会校验 `agent-presets/` 下两个项目预设的配置及共享 `.mjs` 组件，并将这些文件写入当前运行使用的 DSH home 的 `.agent-presets/`。`ComfyUI工作台预设` 保留内部 ID `harness-comfyui-cli-candidate` 并继续作为默认 Preset，因此已有默认选择和 Session 引用不需要迁移；`ComfyUI迭代预设` 使用内部 ID `harness-comfyui-iteration`，为多轮图片迭代提供前台子 Agent。两个项目 Preset 都不向模型提供 8 个 Host 项目 Tool schema；Agent 按需读取当前 checkout 的项目 Skill 及其 CLI 参考文档，再通过项目 managed CLI 查询目录、提交生成任务、查询历史 Run、读取 Run 图片或读取用户提供的本地图片路径。Host 仍注册全部 8 个项目 Tool，选择 Harness `standard` Preset 的 Session 继续通过 Host 注册的项目 Tool 调用 ComfyUI。项目启动器不会修改 Harness `standard` Preset；启动器只清理本项目已经退役的 Preset 目录，并保留同一 DSH home 中的其他 Preset。

当前 checkout `.agents/skills/` 下的 `anima-prompt-builder/`、`character-portrait-prompt-designer/`、`comfyui-generate/`、`comfyui-image-review/`、`comfyui-iterate-generation/`、`krea2-anime-prompt-builder/`、`local-image-reader/` 和 `wai-sdxl-prompt-builder/` 是这八个项目 Skill 的唯一源码目录。Desktop 与 Web Host 启动器通过受管环境变量 `HARNESS_COMFYUI_SKILL_DIR` 把该目录交给两个项目 Preset。两个项目 Preset 的 filesystem provider 都使用 `includeDefaultRoots: false`，因此外部 Workspace 或真实用户目录中的同名 Skill 不会覆盖这八项；`standard` 和其他非项目 Preset 不读取该目录，并继续按各自规则发现 Skill。

`comfyui-iterate-generation` 根据每轮图片观察结果调整下一轮生成参数、恢复已有迭代任务、使用新 Seed 复验候选参数，并保存用户采用的生成参数与图片。该 Skill 先理解人物与故事、提出构图方案并取得用户确认，再使用 `ComfyUI迭代预设` 提供的前台子 Agent 分别完成构图、Prompt、生成、查询、观察、比较和归档阶段。

`krea2-anime-prompt-builder` 根据当前文字、Character/Style `prompt_text` 和用户明确选定的历史正向 Prompt 构建一条 Krea2 动漫 Prompt。该 Skill 分别定义展示图与舞蹈或姿态迁移源图路线，并通过自己的 `references/generation-cli.md` 只读查询历史 Generation Run；该 Skill 不调用批量生成器，也不创建或覆盖提示词文件。

managed CLI 的 Generation Request 不包含 Workspace、Session、Turn 或 Tool Call ID。Host 从当前前台 shell ToolExecution 和 workspace registry 派生这些身份并写入 Run Repository。同一个 Generation Request 允许多次独立提交；每次独立提交使用不同的前台 shell Tool Call，并产生独立的 `call_id` 与 `run_id`。

Host 额外注册 `read_comfyui_run_inputs`。该 Tool 接收 1 至 20 个完整 Run ID 或最少包含八个 UUID 字符的短 Run ID，按输入顺序返回每个 Run 创建时传入 `generate_with_comfyui` 的 `title`、可选 `instance_id`、`template_id`、可选 `model`、完整 `parameters`、`loras` 和保存的 Actual Workflow。短 ID 只在当前 Workspace 中解析；唯一匹配时成功项返回完整 canonical Run ID，无匹配或匹配多个 Run 时只为该项返回错误并继续查询其他项。managed CLI 提供同一能力：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed","run_d26923be"]}
JSON
```

合法批量请求即使包含单项错误也返回退出码 0；调用者读取 `runs[].lookup_status` 分别处理每个结果。历史记录没有保存 `loras` 属性时，`arguments.loras: []` 只表示该次 `generate_with_comfyui` 调用没有保存显式结构化 LoRA 选择，不能据此判断 Actual Workflow 没有预置或活动 LoRA。历史记录没有保存 `model` 属性时不输出 `arguments.model`，表示该次调用没有保存显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。

### 图片读取与数据源设置

Harness 设置中的“ComfyUI”入口包含“图片读取”和“数据源服务”两个页签。“图片读取”页签支持切换、保存、复制和删除多份图片读取配置。每份图片读取配置可以从当前 LLM 运行时动态选择明确支持图片输入的系统 Provider 与模型，也可以填写 OpenAI 兼容 Chat Completions 完整地址、模型 ID 和可选 API Key；每份配置独立保存默认读图 Prompt、`temperature` 和最大输出 Token。API Key 作为 Harness Settings secret 保存，不进入浏览器设置快照。图片读取模型独立于当前 Session 模型和 ComfyUI 生图模型，设置页不硬编码任何 Provider。

“数据源服务”页签分别保存数据源服务的 HTTP 或 HTTPS URL 与端口。Host 在发送上下文插入和语义查询请求以及读取 ComfyUI 实例信息和 Workflow bundle 前读取最新的数据源服务设置。插件发行包内置语义查询客户端和数据源读取客户端；插件运行时通过 HTTP 或 HTTPS 请求已配置的数据源服务，不读取或执行数据源仓库中的文件。`ComfyUI工作台预设` 启用后，系统在数据源服务 URL 或端口尚未保存时提示使用者填写这两项设置；系统在数据源服务检查请求失败时提示使用者检查 URL、端口和服务状态。

### Run 图片查询与图片读取

Host 注册 `get_generation_run_media` 与 `inspect_image`。前者按输入顺序查询一至二十个完整或唯一短 Run ID，并返回当前 Workspace 中每个 Run 的原始 `parameters` 与本地图片路径；后者一次只读取一个本地图片路径，并使用当前命名配置中的独立视觉模型返回观察文本。系统 Provider 配置复用 Harness LLM Runtime；OpenAI 兼容配置直接调用已配置的 Chat Completions 地址。`local-image-reader` Skill 使用自己的 `references/image-inspection-cli.md`，按用户提供的本地绝对路径逐图调用 `image inspect --stdin` 并返回观察结果。`comfyui-image-review` Skill 使用自己的 `references/cli.md` 先取得 Run 图片，再逐图读取，最后由 Agent 对比原始 Prompt 与观察文本并编写改进 Prompt。

### Workflow 参数检查与生成

Generation 请求只要求导入 UI Workflow。Host 使用当前 UI Workflow、目标实例 `/object_info`、节点输入名称、活动状态和上下游连线定位显式运行参数，不读取 Source 模板记录中的参数定义或 binding 元数据。模板检查只把能够控制全部活动图片输出最终可见尺寸的末端尺寸控件返回给 Agent；图片输出必须通过已连接的 `IMAGE` 输入或 `IMAGE` 类型连线接收图片，只接收非图片数据的辅助 output node 不参与尺寸判定。下游独立 resize 或 upscale 覆盖上游尺寸时，检查结果返回下游控件的精确参数 ID，避免把中间 latent 尺寸误报为最终图片尺寸。Host 使用 `/object_info` 的实时枚举校验运行参数，并在唯一大小写匹配时写入实例返回的精确值；无法匹配时，`generate_with_comfyui` 把具体参数目标、收到值和允许值返回给调用方。Source 读取、Workflow 编译或 Official API Workflow 准备中的其他错误也会在 Tool 返回 `run_id` 前返回调用方；只有成功返回 `run_id` 后的远端提交、观察、执行和媒体下载错误继续异步写入 Run。成功解析的 `/object_info` 在 Host 进程内缓存 10 分钟，同一实例的并发请求共享一个在途请求。Official API Workflow Cache 未命中时，Host 启动配置的本机浏览器，让目标 ComfyUI 官方前端调用 `loadGraphData()` 与 `graphToPrompt()` 生成基础 API Workflow；缓存命中时，Host 复制本地基础对象并覆盖本次已确认的运行输入。官方前端导出失败时请求明确失败，不会静默回退到手写导出。完整数据流见[系统架构](docs/system/architecture.md)。

### 生成结果查看与下载

结果列中的图片或视频在 DSH Desktop 原生 Modal 内打开同源媒体查看页，不创建浏览器新窗口。查看页按当前 Session 的媒体生成时间顺序提供较新与较早方向按钮，也支持不带修饰键的键盘左右键；首项和末项不会循环。Modal 主框架在媒体查看页 iframe 上方显示当前媒体所属 Generation Run 的完整 `run_id`；媒体查看页切换媒体后，Modal 主框架同步更新该值。用户点击独立复制按钮后，Modal 主框架把完整 `run_id` 写入浏览器剪贴板并显示成功或失败状态；Clipboard API 不可用或写入被拒绝时，用户仍可手动选择已显示的完整值。Modal footer 的“下载原文件”按钮通过当前 Session 的同源 Host 路由流式下载当前图片或视频的 Saved Media 原始字节，并使用 Generation Media 保存的 ComfyUI 原文件名；媒体查看页切换媒体后，按钮下载切换后的当前媒体。保存目录和同名文件处理由 DSH Desktop 中 Chromium 的下载策略决定，Client 不读取完整媒体 Blob，也不显示无法可靠确认的下载成功状态。查看页顶部显示媒体文件的固有像素尺寸，并在媒体下方显示该媒体所属 Generation Run 保存的原始正面提示词；未保存正面提示词时显示明确缺失状态。图片和视频保持原始宽高比完整显示，不裁切内容；视频使用浏览器原生播放控件。

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
- [v0.39.10 发布说明](docs/releasenotes.md)
