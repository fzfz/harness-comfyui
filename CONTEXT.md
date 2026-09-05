# Harness ComfyUI 领域上下文

本文件定义当前源码已经实现的领域术语。系统结构和运行规则以 [`docs/system/`](docs/system/) 中的规范为准。

## 平台

**Harness Core**：项目依赖的 DeepSeek Harness `0.1.2-rc.1` 公共运行能力，包括 Cordis 生命周期、Session、Agent、Tool、Skill 和 Web Client 加载。项目通过公共 package export 与 profile composition 接入，不修改 Harness package 源码。

**Host Plugin**：`src/host/plugin.ts` 导出的 Harness Host 插件。Host Plugin 在启动时加载并校验唯一的 `production` Configuration Profile，注册 Catalog Remote、Generation Remote、两个 Generation Tool、媒体路由和 Generation Coordinator。

**Client Module**：`src/client/index.tsx` 提供的浏览器模块。Client Module 通过 Harness ModuleLoader 加载，并使用 Harness 原生 `sidebar.footer.action`、`conversation.input.dock`、`details` 与 `shell.overlay` 扩展位呈现项目入口、上下文控件和 Generation Run/Media 结果列。Harness `0.1.2-rc.1` 在空白 Session 中把 `details` 列宽固定为零，因此空白 Session 使用 `shell.overlay` 显示空结果列；已保存 Session 使用 `details` 读取真实 Generation Run/Media 投影。两个结果列的 Session 条件互斥。Client Module 不替换 Harness 的 root、sidebar、conversation 或 composer，也不自动创建或打开项目 Session。

**Project Tool Registry**：`src/host/tools/register-project-tools.ts` 提供的项目 Tool 唯一注册入口。Host Plugin 通过该入口注册 `query_semantic_comfyui_templates`、`query_semantic_loras`、`query_semantic_generation_models`、`query_semantic_comfyui_instances`、`generate_with_comfyui`、`read_comfyui_run_inputs`、`get_generation_run_media` 和 `inspect_image` 八个项目 Tool。

**Repository Skills**：主开发 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/` 中的 `anima-prompt-builder/`、`character-portrait-prompt-designer/`、`comfyui-generate/`、`comfyui-image-review/`、`krea2-anime-prompt-builder/`、`local-image-reader/` 和 `wai-sdxl-prompt-builder/` 提供的七个仓库 Harness Skill。五个 Prompt/生成 Skill 使用各自目录中的 `references/generation-cli.md` 查询历史 Generation Run；`krea2-anime-prompt-builder` 使用历史正向 Prompt、当前文字、Character/Style `prompt_text` 和构建过程中采用的作品、角色、Krea2 Style 与 Prompt 词条目录结果，构建一条 Krea2 动漫展示图或动作迁移源图 Prompt；`comfyui-image-review` 使用自己目录中的 `references/cli.md` 查询 Run 图片并逐图调用视觉模型；`local-image-reader` 使用自己的 CLI 参考读取用户提供的本地图片绝对路径。

**Global Skill Links**：`$HOME/.agents/skills/<skill-name>` 中指向主开发 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/<skill-name>` 的绝对符号链接。每个全局路径的名称与目标 Skill 的目录名相同；全局符号链接不得指向独立 linked worktree。

**ComfyUI Workbench Preset**：新 Session roster 中用户可选的项目 Agent Preset，用户可见名称为 `ComfyUI工作台预设`。该 Preset 的兼容性内部 ID 为 `harness-comfyui-cli-candidate`，通过 `local-only` Tool visibility mode 隐藏 8 个 Host 项目 Tool schema，并从该 Preset 的系统提示词 assembly 中删除 `harness:identity`、`harness:source` 和 `app:web-surface` 三个 Harness 自维护段落。当前插件 `cordis.patch.yml` 把该 Preset 设置为 Desktop 开发与生产的默认 Preset。

## 运行

**Desktop Lifecycle Manager**：`scripts/desktop/` 实现的完整产品进程管理器。`prod:*` 在生产 checkout 执行 DSH Desktop `preview`，`dev:*` 在 linked worktree 执行 DSH Desktop `dev`。两条入口共同负责插件 generation 打包安装、PID、日志、端口和停止行为。

**Desktop Runtime**：完整 Desktop 使用的本地运行状态。生产 checkout 使用 `.local/desktop-production/`；独立 linked worktree 使用 `.local/desktop-development/`。每个运行目录保存自己的 Desktop HOME、DSH home、PID、日志、Run Repository、Run 文件和 Saved Media。

**Web Host Process Manager**：`scripts/production/` 的共享 Source 进程模块与 `scripts/worktree/` 的 `web:*` 适配入口。该入口提供 start、stop、restart、status、health 和 logs，只用于 linked worktree 的 Web Host 调试。

**Web Host Runtime**：独立 Web Host 调试状态，位于 `.local/web-development/`。`.local/source-client/client.js` 是 Web Host 与 Desktop generation 根据当前 Client 源码生成的浏览器 ModuleLoader 输入。

**Configuration Profile**：Host 使用的一组结构化配置。当前系统只有 `production`，其结构由 `config/schema.ts` 定义，其值由 `config/base.json`、`config/profiles/production.json` 和允许的环境变量合成。

**Managed Web Host State**：`web:*` 把运行中配置快照保存在 `.local/web-development/state/source-managed.json`。`web:stop`、`web:status`、`web:health` 和 `web:logs` 使用该快照定位独立 Web Host。

**Source Contract Identity**：当前数据源合同固定为 `imagegen-source-contract` 版本 `0.86.1`。Catalog CLI 与 Source CLI 的实际路径由 `config/source-production.json` 定义。Source TemplateBundle 只向 Host 提供 `id`、`title` 和 `workflow_json`。Catalog 资源的 `sample_image_urls` 只投影为 Client Module 展示使用的 `CatalogItem.sampleImageUrls`，不进入 Message Context。

## 数据

**Workspace**：Harness 中的最高会话隔离边界。一个 Workspace 包含多个 Session。

**Session**：Workspace 中的一段持续对话。

**Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。

**Run Repository**：Desktop 生产环境默认使用 `.local/desktop-production/data/runs.sqlite`，Desktop 开发环境默认使用 `.local/desktop-development/data/runs.sqlite`，Web Host 调试环境默认使用 `.local/web-development/shared/data/runs.sqlite`。

**Saved Media**：Desktop 生产环境默认使用 `.local/desktop-production/saved-media/`，Desktop 开发环境默认使用 `.local/desktop-development/saved-media/`，Web Host 调试环境默认使用 `.local/web-development/shared/saved-media/`。

**Generation Run**：一次 `generate_with_comfyui` Tool Call 对应的持久异步运行。不同 `callId` 创建不同 Run；每个 Run 独立保存请求、来源快照、Actual Workflow 和 API Workflow。

**Generation Run Input Query**：`read_comfyui_run_inputs` Tool 和 managed CLI 的 `generation run-inputs --stdin` 命令提供的只读查询。一次查询接收 1 至 20 个完整 Run ID 或最少包含八个 UUID 字符的短 Run ID。Runtime 在当前 Workspace 中把短 ID 解析为唯一匹配的完整 Run ID，并按输入顺序独立返回创建 Run 时保存的 Generation Tool 参数和 Actual Workflow；单项无匹配或歧义不终止其他 Run 的查询。

**Generation Run Media Query**：`get_generation_run_media` Tool 和 managed CLI 的 `generation resolve-media --stdin` 命令提供的只读查询。一次查询接收一至二十个完整 Run ID 或当前 Workspace 中的唯一规范前缀，保留输入顺序和重复值，并为每个成功 Run 返回原始 `parameters` 与确定排序的本地图片路径。单个 Run 的查询错误不终止其他 Run 的查询。

**Image Reader Configuration**：Harness Settings namespace `harness-comfyui-image-reader-profiles` 中原子保存的当前配置 ID、命名配置列表和每份 OpenAI 兼容配置的独立凭据。每份配置选择“系统 Provider”或“OpenAI 兼容接口”，并独立保存视觉模型、默认读图 Prompt、`temperature` 和最大输出 Token。Client 不从当前 Session 模型或 ComfyUI 生图模型推导视觉模型。

**Image Inspection**：`inspect_image` Tool 和 managed CLI 的 `image inspect --stdin` 命令提供的单图视觉读取。系统 Provider 配置通过 Harness Attachment 与 LLM Runtime 调用视觉模型；OpenAI 兼容配置把单张本地图片编码为 Data URL，并向配置的完整 Chat Completions 地址发送请求。该能力不读取 Generation Request 参数，也不比较或改写 Prompt。

**Generation Media**：一个 Generation Run 保存的一项图片或视频输出。每项 Media 通过自己的 `run_id` 解析所属 Run 的 Actual Workflow，Session 和 Chat Turn 只用于筛选。

**Session Media Viewer**：Host 为单个 Session 的 Generation Media 提供的同源 HTML 查看页。查看页按 `created_at DESC, output_index DESC, media_id DESC` 排列当前 Session 的媒体，顶部显示媒体文件固有像素尺寸，底部显示该 Run 保存的 `parameters.positive_prompt`，并通过较新与较早方向在同一页面切换媒体。查看页 iframe 把当前 `mediaId` 和 `runId` 同步给 DSH Desktop 主框架 Modal；Modal 验证消息来源和当前 Session 媒体归属，在 iframe 上方显示完整 `run_id`，并由主框架的独立按钮把该值写入浏览器剪贴板。Modal footer 的“下载原文件”按钮通过同源 `/download` 路由流式下载当前媒体的 Saved Media 原始字节，并使用 Generation Media 记录保存的 ComfyUI 原文件名；iframe 切换媒体后，下载目标与当前 `mediaId` 同步更新。

**运行时 API Workflow 投影**：`ComfyWorkflowCompiler` 根据当前 UI Workflow、目标实例的 `/object_info`、请求参数、模型、LoRA、节点输入名称、节点活动状态和上下游连线生成输入值与执行结构。该投影继续承载原编译器已经通过回归测试的参数语义，但不能直接提交给 ComfyUI `/prompt`。

**编译后活动输出节点集合**：`ComfyWorkflowCompiler` 从目标实例实时 `/object_info` 中选择 `output_node: true` 且已满足必需输入的 Workflow 节点。Generation Runtime 把该集合保存到 `generation_runs.expected_output_node_ids_json`，并把该集合传给 Comfy transport 以筛选 Jobs API 输出。该集合是 compiler 输出，不是 Source TemplateBundle 字段。

**Official Base API Workflow**：目标 ComfyUI 实例的官方前端加载 Actual Workflow 后，通过 `graphToPrompt()` 返回的 API Workflow。该对象是最终节点拓扑、连接 tuple、虚拟节点和自定义 widget 序列化结构的权威来源。

**Official API Workflow Cache**：Desktop 生产环境默认使用 `.local/desktop-production/data/api-workflow-cache/`，Desktop 开发环境默认使用 `.local/desktop-development/data/api-workflow-cache/`，Web Host 调试环境默认使用 `.local/web-development/shared/data/api-workflow-cache/`。每个缓存项保存实例身份、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希、执行结构哈希和 Official Base API Workflow；缓存项不保存认证信息，也不保存覆盖后的本次请求值。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。

**Runtime Input Overlay**：Host 深拷贝 Official Base API Workflow，并使用运行时 API Workflow 投影覆盖已经存在的同名非连接输入。Runtime Input Overlay 保留官方连接 tuple、虚拟节点和额外输入；官方值使用 `{ "__value__": ... }` 包装时只替换 `__value__`。

**ChromeComfyFrontend**：`src/host/generation/comfy-frontend-browser.ts` 实现的官方前端导出适配器。该适配器只在 Official API Workflow Cache 未命中时启动配置的本机 Chrome 或 Chromium，通过 Chrome DevTools Protocol 在导航前设置实例认证信息，等待前端与自定义节点完成初始化，再调用 `loadGraphData()` 与 `graphToPrompt()`。

## 发布

**Product Version**：根 `package.json.version` 中的 SemVer。当前值为 `0.39.5`。

**GitHub Release**：指向已通过本地发布门禁和独立审查的精确提交的 Git tag 与 GitHub Release 记录。本版本发布完成后的标签为 `v0.39.5`；发布不创建或附加产品包。
