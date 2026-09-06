# Harness ComfyUI 领域上下文

本文件定义当前源码已经实现的领域术语。系统结构和运行规则以 [`docs/system/`](docs/system/) 中的规范为准。

## 平台

**Harness Core**：项目依赖的 DeepSeek Harness `0.1.2-rc.1` 公共运行能力，包括 Cordis 生命周期、Session、Agent、Tool、Skill 和 Web Client 加载。项目通过公共 package export 与 profile composition 接入，不修改 Harness package 源码。

**Host Plugin**：`src/host/plugin.ts` 导出的 Harness Host 插件。Host Plugin 在启动时加载并校验唯一的 `production` Configuration Profile，注册数据源服务 Settings、Catalog Remote、Generation Remote、两个 Generation Tool、媒体路由和 Generation Coordinator。

**Client Module**：`src/client/index.tsx` 提供的浏览器模块。Client Module 通过 Harness ModuleLoader 加载，并使用 Harness 原生设置入口、`sidebar.footer.action`、`conversation.input.dock`、`details` 与 `shell.overlay` 扩展位呈现统一 ComfyUI 设置页、项目入口、上下文控件和 Generation Run/Media 结果列。`.local/source-client/client.js` 是 Web Host 与 Desktop generation 根据 Client Module 源码生成并交给 Harness ModuleLoader 的浏览器构建产物。Harness `0.1.2-rc.1` 在空白 Session 中把 `details` 列宽固定为零，因此空白 Session 使用 `shell.overlay` 显示空结果列；已保存 Session 使用 `details` 读取真实 Generation Run/Media 投影。两个结果列的 Session 条件互斥。Client Module 不替换 Harness 的 root、sidebar、conversation 或 composer，也不自动创建或打开项目 Session。

**Project Tool Registry**：`src/host/tools/register-project-tools.ts` 提供的项目 Tool 唯一注册入口。Host Plugin 通过该入口注册 `query_semantic_comfyui_templates`、`query_semantic_loras`、`query_semantic_generation_models`、`query_semantic_comfyui_instances`、`generate_with_comfyui`、`read_comfyui_run_inputs`、`get_generation_run_media` 和 `inspect_image` 八个项目 Tool。

**Repository Skills**：当前 checkout `.agents/skills/` 中的 `anima-prompt-builder/`、`character-portrait-prompt-designer/`、`comfyui-generate/`、`comfyui-image-review/`、`comfyui-iterate-generation/`、`krea2-anime-prompt-builder/`、`local-image-reader/` 和 `wai-sdxl-prompt-builder/` 提供八个仓库 Harness Skill。`anima-prompt-builder`、`character-portrait-prompt-designer`、`comfyui-generate`、`krea2-anime-prompt-builder` 和 `wai-sdxl-prompt-builder` 使用各自目录中的 `references/generation-cli.md` 查询历史 Generation Run；`krea2-anime-prompt-builder` 使用历史正向 Prompt、当前文字、Character/Style `prompt_text` 和构建过程中采用的作品、角色、Krea2 Style 与 Prompt 词条目录结果，构建一条 Krea2 动漫展示图或动作迁移源图 Prompt；`comfyui-image-review` 使用自己目录中的 `references/cli.md` 查询 Run 图片并逐图调用视觉模型；`local-image-reader` 使用自己的 CLI 参考读取用户提供的本地图片绝对路径；`comfyui-iterate-generation` 取得用户对画面目标的确认后，调度子 Agent 完成多轮生成、观察、比较、复验和归档。

**Preset-scoped Repository Skill Source**：Desktop 与 Web Host 启动器从当前 checkout 的 `config/product-agent.json.skills` 解析 Repository Skills 目录，并通过受管环境变量 `HARNESS_COMFYUI_SKILL_DIR` 交给 `ComfyUI工作台预设` 与 `ComfyUI迭代预设` 的 filesystem provider。两个项目 Preset 读取该来源；`standard` 和其他非项目 Preset 不读取该来源。该来源不依赖真实 `$HOME/.agents/skills/` 或隔离 Desktop HOME 中的项目链接。

**ComfyUI Workbench Preset**：新 Session roster 中用户可选的项目 Agent Preset，用户可见名称为 `ComfyUI工作台预设`。该 Preset 的兼容性内部 ID 为 `harness-comfyui-cli-candidate`，通过 `local-only` Tool visibility mode 隐藏 8 个 Host 项目 Tool schema；该 Preset 的 filesystem provider 使用 `includeDefaultRoots: false`，并从只包含 `!!js process.env.HARNESS_COMFYUI_SKILL_DIR` 的 `customSkillDirs` 数组读取该环境变量所指目录中的 Preset-scoped Repository Skills；该 Preset 的系统提示词 assembly 删除 `harness:identity`、`harness:source` 和 `app:web-surface` 三个 Harness 自维护段落。仓库根目录的 `cordis.patch.yml` 配置文件把该 Preset 设置为 Desktop 开发与生产的默认 Preset；未显式指定 Preset 而采用该默认值的 Session，以及用户显式选择该 Preset 的 Session，均最终采用 `ComfyUI工作台预设`。

**ComfyUI Iteration Preset**：新 Session roster 中用户可选的项目 Agent Preset，用户可见名称为 `ComfyUI迭代预设`，内部 ID 为 `harness-comfyui-iteration`。该 Preset 读取与 `ComfyUI工作台预设` 相同的八个 Repository Skills，隐藏相同的八个 Host 项目 Tool schema，并删除相同的 `harness:identity`、`harness:source` 和 `app:web-surface` 系统提示词段落。该 Preset 还提供前台 spawn subagent Tool；该 Tool 关闭后台运行和模型选择，把子 Agent 深度限制为一层。该 Preset 加载 `project-subagent-workspace.mjs` Workspace component；该 component 在子 Agent 首个 step 执行业务调用前，把真实子 Session 登记到父 Session 所属 Workspace。用户必须显式选择该 Preset；`ComfyUI工作台预设` 继续作为默认 Preset。

## 运行

**Desktop Lifecycle Manager**：`scripts/desktop/` 实现的完整产品进程管理器。`prod:*` 在生产 checkout 执行 DSH Desktop `preview`，`dev:*` 在 linked worktree 执行 DSH Desktop `dev`。两条入口共同负责插件 generation 打包安装、PID、日志、端口和停止行为。

**Desktop Runtime**：完整 Desktop 使用的本地运行状态。生产 checkout 使用 `.local/desktop-production/`；独立 linked worktree 使用 `.local/desktop-development/`。每个运行目录保存自己的 Desktop HOME、DSH home、PID、日志、Run Repository、Run 文件和 Saved Media。

**Web Host Process Manager**：`scripts/production/` 的共享 Source 进程模块与 `scripts/worktree/` 的 `web:*` 适配入口。该入口提供 start、stop、restart、status、health 和 logs，只用于 linked worktree 的 Web Host 调试。

**Web Host Runtime**：独立 Web Host 调试状态，位于 `.local/web-development/`。

**Configuration Profile**：Host 使用的一组结构化配置。当前系统只有 `production`，其结构由 `config/schema.ts` 定义，其值由 `config/base.json`、`config/profiles/production.json` 和允许的环境变量合成。

**Managed Web Host State**：`web:*` 把运行中配置快照保存在 `.local/web-development/state/source-managed.json`。`web:stop`、`web:status`、`web:health` 和 `web:logs` 使用该快照定位独立 Web Host。

**Data Source Service**：该术语指使用者独立安装并运行、通过 HTTP 或 HTTPS 接受请求的数据源服务。使用者可以连接本机运行的 Data Source Service，也可以连接部署在另一台机器上的 Data Source Service。

**Built-in Source Clients**：该术语指插件发行包中的两个客户端文件：`scripts/source-client/imagegen-semantic-query.mjs` 和 `scripts/source-client/imagegen-comfyui-source-read.mjs`。Host 使用前者完成 Catalog discovery 和语义查询，使用后者完成 Source discovery、ComfyUI 实例读取和 Workflow bundle 读取。两个客户端只请求 Data Source Service，不读取或执行数据源仓库中的文件。

**Source Template Bundle**：该术语指 Data Source Service 为一个 Workflow 模板返回的对象；该对象包含 `id`、`title` 和 `workflow_json` 字段。

**Catalog 目录图片展示数据**：Data Source Service 的 Catalog 资源通过 `sample_image_urls` 提供目录图片 URL。Host 把这些 URL 投影为 Client Module 的 `CatalogItem.sampleImageUrls`，供 Catalog 页面展示图片；这些 URL 不进入 Message Context。

## 数据

**Workspace**：Harness 中的最高会话隔离边界。一个 Workspace 包含多个 Session。

**Session**：Workspace 中的一段持续对话。

**Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。

**Run Repository**：保存 Generation Run 数据库记录的 SQLite 数据库。Desktop 生产环境默认使用 `.local/desktop-production/data/runs.sqlite`，Desktop 开发环境默认使用 `.local/desktop-development/data/runs.sqlite`，Web Host 调试环境默认使用 `.local/web-development/shared/data/runs.sqlite`。

**Saved Media**：保存 Generation Run 输出图片和视频原文件的目录。Desktop 生产环境默认使用 `.local/desktop-production/saved-media/`，Desktop 开发环境默认使用 `.local/desktop-development/saved-media/`，Web Host 调试环境默认使用 `.local/web-development/shared/saved-media/`。

**Generation Run**：一次 `generate_with_comfyui` Tool Call 对应的持久异步运行。不同 `callId` 创建不同 Run；每个 Run 独立保存请求、来源快照、Actual Workflow 和 API Workflow。

**Generation Run Input Query**：`read_comfyui_run_inputs` Tool 和 managed CLI 的 `generation run-inputs --stdin` 命令提供的只读查询。一次查询接收 1 至 20 个完整 Run ID 或最少包含八个 UUID 字符的短 Run ID。Runtime 在当前 Workspace 中把短 ID 解析为唯一匹配的完整 Run ID，并按输入顺序独立返回创建 Run 时保存的 Generation Tool 参数和 Actual Workflow；单项无匹配或歧义不终止其他 Run 的查询。

**Generation Run Media Query**：`get_generation_run_media` Tool 和 managed CLI 的 `generation resolve-media --stdin` 命令提供的只读查询。一次查询接收一至二十个完整 Run ID，或以 `run_` 开头、至少包含 UUID 前八个字符并在当前 Workspace 中唯一匹配的规范前缀；查询保留输入顺序和重复值，并为每个成功 Run 返回原始 `parameters` 与本地图片路径。单个 Run 的查询错误不终止其他 Run 的查询。

**Image Reader Configuration**：Harness Settings namespace `harness-comfyui-image-reader-profiles` 中原子保存的当前配置 ID、命名配置列表和每份 OpenAI 兼容配置的独立凭据。每份配置选择“系统 Provider”或“OpenAI 兼容接口”，并独立保存视觉模型、默认读图 Prompt、`temperature` 和最大输出 Token。Client 不从当前 Session 模型或 ComfyUI 生图模型推导视觉模型。

**Source Service Configuration**：该术语指 Harness Settings namespace `harness-comfyui-source` 中保存的数据源服务 URL 和端口。Host 在每次 Catalog 查询、ComfyUI 实例读取和 Workflow bundle 读取前读取最新值。Client 在统一“ComfyUI”设置页的“数据源服务”页签修改该值。

**Image Inspection**：`inspect_image` Tool 和 managed CLI 的 `image inspect --stdin` 命令提供的单图视觉读取。系统 Provider 配置通过 Harness Attachment 与 LLM Runtime 调用视觉模型；OpenAI 兼容配置把单张本地图片编码为 Data URL，并向配置的完整 Chat Completions 地址发送请求。该能力不读取 Generation Request 参数，也不比较或改写 Prompt。

**Generation Media**：一个 Generation Run 保存的一项图片或视频输出。每项 Media 通过自己的 `run_id` 解析所属 Run 的 Actual Workflow，Session 和 Chat Turn 只用于筛选。

**Session Media Viewer**：Host 为单个 Session 的 Generation Media 提供的同源 HTML 查看页。查看页按 `created_at DESC, output_index DESC, media_id DESC` 排列当前 Session 的媒体，顶部显示媒体文件固有像素尺寸，底部显示该 Run 保存的 `parameters.positive_prompt`，并通过较新与较早方向在同一页面切换媒体。查看页 iframe 把当前 `mediaId` 和 `runId` 同步给 DSH Desktop 主框架 Modal；Modal 验证消息来源和当前 Session 媒体归属，在 iframe 上方显示完整 `run_id`，并由主框架的独立按钮把该值写入浏览器剪贴板。Modal footer 的“下载原文件”按钮通过同源 `/download` 路由流式下载当前媒体的 Saved Media 原始字节，并使用 Generation Media 记录保存的 ComfyUI 原文件名；iframe 切换媒体后，下载目标与当前 `mediaId` 同步更新。

**运行时 API Workflow 投影**：`ComfyWorkflowCompiler` 根据当前 UI Workflow、目标实例的 `/object_info`、请求参数、模型、LoRA、节点输入名称、节点活动状态和上下游连线生成输入值与执行结构。该投影不能直接提交给 ComfyUI `/prompt`。

**编译后活动输出节点集合**：`ComfyWorkflowCompiler` 从目标实例实时 `/object_info` 中选择 `output_node: true` 且已满足必需输入的 Workflow 节点。Generation Runtime 把该集合保存到 `generation_runs.expected_output_node_ids_json`，并把该集合传给 Comfy transport 以筛选 Jobs API 输出。该集合是 compiler 输出，不是 Source TemplateBundle 字段。

**Official Base API Workflow**：目标 ComfyUI 实例的官方前端加载 Actual Workflow 后，通过 `graphToPrompt()` 返回的 API Workflow。该对象是最终节点拓扑、连接 tuple、虚拟节点和自定义 widget 序列化结构的权威来源。

**Official API Workflow Cache**：Desktop 生产环境默认使用 `.local/desktop-production/data/api-workflow-cache/`，Desktop 开发环境默认使用 `.local/desktop-development/data/api-workflow-cache/`，Web Host 调试环境默认使用 `.local/web-development/shared/data/api-workflow-cache/`。每个缓存项保存实例身份、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希、执行结构哈希和 Official Base API Workflow；缓存项不保存认证信息，也不保存覆盖后的本次请求值。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。

**Runtime Input Overlay**：Host 深拷贝 Official Base API Workflow，并使用运行时 API Workflow 投影覆盖已经存在的同名非连接输入。Runtime Input Overlay 保留官方连接 tuple、虚拟节点和额外输入；官方值使用 `{ "__value__": ... }` 包装时只替换 `__value__`。

**ChromeComfyFrontend**：`src/host/generation/comfy-frontend-browser.ts` 实现的官方前端导出适配器。该适配器只在 Official API Workflow Cache 未命中时启动配置的本机 Chrome 或 Chromium，通过 Chrome DevTools Protocol 在导航前设置实例认证信息，等待前端与自定义节点完成初始化，再调用 `loadGraphData()` 与 `graphToPrompt()`。

## 发布

**Product Version**：根 `package.json.version` 中的 SemVer。当前值为 `0.39.9`。

**GitHub Release**：指向已通过本地发布门禁和独立审查的精确提交的 Git tag 与 GitHub Release 记录。本版本发布完成后的标签为 `v0.39.9`；发布不创建或附加产品包。
