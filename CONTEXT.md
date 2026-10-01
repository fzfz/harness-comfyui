# Harness ComfyUI 领域上下文

本文件定义当前源码已经实现的领域术语。系统结构和运行规则以 `docs/system/` 中的规范为准。官方插件交付决策见 [ADR 0016](docs/adr/0016-official-desktop-plugin-delivery.md)。

## 平台

**Harness Core**：项目接入的 DeepSeek Harness `0.2.0-rc.2` 公共运行能力，包括 Cordis 生命周期、Session、Agent、Tool、Skill 和 Web Client 加载。项目通过官方公开 package exports 与 Profile plugin composition 接入，不修改 Harness package 源码。

**Host Plugin**：官方 Harness Desktop 加载的 `harness-comfyui` 插件模块。Host Plugin 在启用时加载并校验 `production` Configuration Profile，注册数据源服务 Settings、Catalog Remote、Generation Remote、两个 Generation Tool、图片读取能力、插件存储和 Generation Coordinator。

**Client Module**：插件提供的浏览器模块。Client Module 通过官方 Harness ModuleLoader 加载，并使用 Harness 原生设置入口、会话输入区和右侧栏呈现统一 ComfyUI 设置页、项目入口、上下文控件及 Generation Run/Media 结果页。插件通过宿主服务操作自有页签，保留 Harness 对 root、sidebar、conversation 和 composer 的管理。Session 的创建和打开由宿主响应用户操作处理。

**Project Tool Registry**：`src/host/tools/register-project-tools.ts` 定义的项目 Tool 唯一注册入口。Host Plugin 通过该入口注册 `query_semantic_comfyui_templates`、`query_semantic_loras`、`query_semantic_generation_models`、`query_semantic_comfyui_instances`、`generate_with_comfyui`、`read_comfyui_run_inputs`、`get_generation_run_media` 和 `inspect_image` 八个项目 Tool。

**Repository Skills**：随插件包发布在 `.agents/skills/` 的八个 Harness Skill：`anima-prompt-builder`、`character-portrait-prompt-designer`、`comfyui-generate`、`comfyui-image-review`、`comfyui-iterate-generation`、`krea2-anime-prompt-builder`、`local-image-reader` 和 `wai-sdxl-prompt-builder`。各 Skill 按自身参考文档调用业务 CLI、读取生成结果或执行图片观察。

**Preset-scoped Repository Skill Source**：安装包内的 `.agents/skills/` 目录。`ComfyUI工作台预设` 与 `ComfyUI迭代预设` 从自己的包内 component 解析该目录；其他 Preset 不读取项目 Repository Skills。Preset component 与 Skill 路径相对安装包解析，不依赖 checkout 或调用者用户主目录中的项目链接。

**ComfyUI Workbench Preset**：官方插件注册的可选项目 Agent Preset，显示名称为 `ComfyUI工作台预设`，兼容性内部 ID 为 `harness-comfyui-cli-candidate`。用户在官方会话界面选择该 Preset；插件保留用户设定的官方全局默认 Preset。该 Preset 隐藏项目 Host Tool schema，使用包内 Repository Skills，并移除 `harness:identity`、`harness:source` 和 `app:web-surface` 三个系统提示词段落。

**ComfyUI Iteration Preset**：官方插件注册的可选项目 Agent Preset，显示名称为 `ComfyUI迭代预设`，内部 ID 为 `harness-comfyui-iteration`。用户在官方会话界面选择该 Preset；插件保留用户设定的官方全局默认 Preset。该 Preset 读取与工作台 Preset 相同的包内 Repository Skills，隐藏相同的项目 Host Tool schema，并使用四个角色工具分别执行构图、生成、观察和比较。构图与生成角色可续派原有子会话，观察与比较角色每轮创建新会话；各角色使用自己的 persona、模型和工具限制。子 Session 在开始执行前加入父 Session 所属 Workspace。

## 运行

**Official Desktop Plugin Runtime**：官方 DeepSeek Harness Desktop 中运行的 `harness-comfyui` 插件实例。官方应用管理应用进程、Profile 和插件启停；插件 Host 使用官方 DSH home 与配置保存业务数据。

**Plugin Storage**：插件 Host 的 SQLite、Run、媒体、日志和缓存存储。默认根目录为 `<DSH_HOME>/data/plugins/harness-comfyui/`；用户可在官方 Profile 的 `harness-comfyui-core.config.dataDirectory` 设置绝对目录。插件在激活时验证存储目录及 Run Repository 文件可访问。

**Configuration Profile**：Host 使用的一组结构化业务配置。当前只有 `production` Configuration Profile；其结构由 `config/schema.ts` 定义，默认值由 `config/base.json` 与 `config/profiles/production.json` 合并，再按 `config/environment-overrides.json` 处理已声明环境覆盖。

**Data Source Service**：使用者独立安装并运行、通过 HTTP 或 HTTPS 接受请求的数据源服务。使用者可连接本机服务，也可连接部署在另一台机器上的服务。

**Built-in Source Clients**：插件发行包中的 `scripts/source-client/imagegen-semantic-query.mjs` 与 `scripts/source-client/imagegen-comfyui-source-read.mjs`。Host 使用前者完成 Catalog discovery 和语义查询，使用后者完成 Source discovery、ComfyUI 实例读取和 Workflow bundle 读取。两个客户端只请求 Data Source Service，不读取或执行数据源仓库文件。

**Managed CLI Server**：插件 Host 启动的专用回环 HTTP listener。该服务只接收由官方 Harness 前台 Bash Tool Call 提供短期 capability 的项目 CLI 请求；路由校验 capability 和调用者身份。卸载插件时 listener 停止并等待已接纳请求结束。

**Source Template Bundle**：Data Source Service 为一个 Workflow 模板返回的对象，包含 `id`、`title` 和 `workflow_json`。

**Catalog 目录图片展示数据**：Data Source Service Catalog 资源通过 `sample_image_urls` 提供目录图片 URL。Host 将这些 URL 映射为 Client Module 的 `CatalogItem.sampleImageUrls` 用于 Catalog 图片展示；这些 URL 不进入 Message Context。

## 数据

**Workspace**：Harness 中的最高会话隔离边界。一个 Workspace 包含多个 Session。

**Session**：Workspace 中的一段持续对话。

**Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。

**Run Repository**：保存 Generation Run 记录的 SQLite 数据库，位于 Plugin Storage 根目录的 `runs.sqlite`。

**Saved Media**：Generation Run 输出图片和视频的原文件，位于 Plugin Storage 根目录的 `media/`。

**Generation Run**：一次 `generate_with_comfyui` Tool Call 对应的持久异步运行。不同 `callId` 创建不同 Run；每个 Run 独立保存请求、来源快照、Actual Workflow 和 API Workflow。

**Generation Run Input Query**：`read_comfyui_run_inputs` Tool 与 managed CLI 的 `generation run-inputs --stdin` 只读查询。一次查询接收 1 至 20 个完整 Run ID 或至少包含八个 UUID 字符的短 Run ID。Runtime 在当前 Workspace 中把短 ID 解析为唯一匹配的完整 Run ID，按输入顺序返回创建 Run 时保存的 Generation Tool 参数与 Actual Workflow；单项无匹配或歧义不终止其他 Run 的查询。

**Generation Run Media Query**：`get_generation_run_media` Tool 与 managed CLI 的 `generation resolve-media --stdin` 只读查询。一次查询接收一至二十个完整 Run ID，或以 `run_` 开头且至少包含 UUID 前八个字符、并在当前 Workspace 中唯一匹配的规范前缀。查询保留输入顺序和重复值；单个 Run 的查询错误不终止其他 Run 的查询。

**Image Reader Configuration**：官方 Profile 中 `harness-comfyui-image-reader` Settings 保存的当前配置 ID、命名配置列表和每份 OpenAI 兼容配置的独立凭据。每份配置选择系统 Provider 或 OpenAI 兼容接口，并独立保存视觉模型、默认读图 Prompt、`temperature` 和最大输出 Token。Client 不从当前 Session 模型或 ComfyUI 生图模型推导视觉模型。

**Source Service Configuration**：官方 Profile 中 `harness-comfyui-core` Settings 保存的数据源服务 URL 和端口。Host 在每次 Catalog 查询、ComfyUI 实例读取和 Workflow bundle 读取前读取最新值。Client 在统一 ComfyUI 设置页的“数据源服务”页签修改该值。

**Image Inspection**：`inspect_image` Tool 与 managed CLI 的 `image inspect --stdin` 单图视觉读取。系统 Provider 配置通过 Harness Attachment 和 LLM Runtime 调用视觉模型；OpenAI 兼容配置把单张本地图片编码为 Data URL，并向配置的完整 Chat Completions 地址发送请求。该能力不读取 Generation Request 参数，也不比较或改写 Prompt。

**Generation Media**：一个 Generation Run 保存的一项图片或视频输出。每项 Media 通过自己的 `run_id` 解析所属 Run 的 Actual Workflow；Session 和 Chat Turn 只用于筛选。

**Session Media Viewer**：Host 为单个 Session 的 Generation Media 提供的同源 HTML 查看页。查看页按 `created_at DESC, output_index DESC, media_id DESC` 排列当前 Session 媒体，显示文件固有像素尺寸与该 Run 保存的 `parameters.positive_prompt`，并通过较新与较早方向切换媒体。官方 Desktop Modal 验证当前 iframe 消息与 Session 媒体归属，在 iframe 上方显示完整 `run_id`，并以独立按钮复制该 ID。下载操作通过同源 `/download` 路由返回 Saved Media 原始字节及 ComfyUI 原文件名。

**运行时 API Workflow 投影**：`ComfyWorkflowCompiler` 根据当前 UI Workflow、目标实例 `/object_info`、请求参数、模型、LoRA、节点输入名称、节点活动状态和上下游连线生成输入值与执行结构。该投影不能直接提交给 ComfyUI `/prompt`。

**编译后活动输出节点集合**：`ComfyWorkflowCompiler` 从目标实例实时 `/object_info` 选择 `output_node: true` 且已满足必需输入的 Workflow 节点。Generation Runtime 把该集合保存到 `generation_runs.expected_output_node_ids_json`，并传给 Comfy transport 筛选 Jobs API 输出。该集合是 compiler 输出，不是 Source TemplateBundle 字段。

**Official Base API Workflow**：目标 ComfyUI 实例官方前端加载 Actual Workflow 后，通过 `graphToPrompt()` 返回的 API Workflow。该对象是最终节点拓扑、连接 tuple、虚拟节点和自定义 widget 序列化结构的权威来源。

**Official API Workflow Cache**：Plugin Storage 下的 `api-workflow-cache/`。每个缓存项保存实例身份、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希、执行结构哈希和 Official Base API Workflow；缓存项不保存认证信息或覆盖后的本次请求值。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。

**Runtime Input Overlay**：Host 深拷贝 Official Base API Workflow，并使用运行时 API Workflow 投影覆盖已存在的同名非连接输入。Runtime Input Overlay 保留官方连接 tuple、虚拟节点和额外输入；官方值使用 `{ "__value__": ... }` 包装时只替换 `__value__`。

**ChromeComfyFrontend**：Host 通过 `process.execPath` 启动的官方前端导出 Worker。Worker 在缓存未命中时直接启动配置的本机 Chrome 或 Chromium，通过 Chrome DevTools Protocol 在导航前设置实例认证信息，等待前端与自定义节点初始化，再调用 `loadGraphData()` 和 `graphToPrompt()`。

## 发布

**Product Version**：根 `package.json.version` 中的 SemVer。候选变更及状态见 `docs/releasenotes.md`。

**GitHub Release**：指向已通过本地发布门禁和独立审查的精确提交的 Git tag 与 GitHub Release。标签按 `v<package.json.version>` 命名；Release 附加该提交构建的 `harness-comfyui-<version>.tgz` 插件包。
