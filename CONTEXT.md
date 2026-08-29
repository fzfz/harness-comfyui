# Harness ComfyUI 领域上下文

本文件定义当前源码已经实现的领域术语。系统结构和运行规则以 [`docs/system/`](docs/system/) 中的规范为准。

## 平台

**Harness Core**：项目依赖的 DeepSeek Harness `0.1.1-rc.2` 公共运行能力，包括 Cordis 生命周期、Session、Agent、Tool、Skill 和 Web Client 加载。项目通过公共 package export 与 profile composition 接入，不修改 Harness package 源码。

**Host Plugin**：`src/host/plugin.ts` 导出的 Harness Host 插件。Host Plugin 在启动时加载并校验唯一的 `production` Configuration Profile，注册 Catalog Remote、Generation Remote、Generation Tool、媒体路由和 Generation Coordinator。

**Client Module**：`src/client/index.tsx` 提供的浏览器模块。Client Module 通过 Harness ModuleLoader 加载，并使用 Harness 原生 `sidebar.footer.action`、`conversation.input.dock`、`details` 与 `shell.overlay` 扩展位呈现项目入口、上下文控件和 Generation Run/Media 结果列。Harness `0.1.1-rc.2` 在空白 Session 中把 `details` 列宽固定为零，因此空白 Session 使用 `shell.overlay` 显示空结果列；已保存 Session 使用 `details` 读取真实 Generation Run/Media 投影。两个结果列的 Session 条件互斥。Client Module 不替换 Harness 的 root、sidebar、conversation 或 composer，也不自动创建或打开项目 Session。

**Project Tool Registry**：`src/host/tools/register-project-tools.ts` 提供的项目 Tool 唯一注册入口。Host Plugin 通过该入口注册 `query_semantic_comfyui_templates`、`query_semantic_loras`、`query_semantic_generation_models`、`query_semantic_comfyui_instances` 和 `generate_with_comfyui` 五个项目 Tool。

**Repository ComfyUI Generate Skill**：`.agents/skills/comfyui-generate/SKILL.md` 提供的仓库 Harness Skill。rc.2 文件系统 Skill provider 从当前 Workspace Git 根目录发现该 Skill，Harness 原生 `/` 菜单负责显示和调用。

**Global ComfyUI Generate Skill**：Harness 用户自行安装在 `$HOME/.agents/skills/comfyui-generate/` 的全局 Harness Skill。A/B Agent Preset 的实测使用该 Skill、该 Skill 目录中的 CLI 参考文档和项目 managed CLI；v0.33.0 不复制或发布该 Skill。

## 运行

**Source Process Manager**：`scripts/production/` 实现的当前源码进程管理器。它提供 start、stop、restart、status、health 和 logs 六种共享生命周期操作；`prod:*` 管理生产 checkout，`scripts/worktree/` 提供独立 linked worktree 的 `worktree:*` 适配入口。`prod:test` 自动验证这些操作及其异常分支。

**Source Runtime**：当前源码进程使用的本地运行状态。生产 checkout 使用 `.local/production/`；独立 linked worktree 使用 `.local/worktree-development/`。每个运行目录保存自己的 DSH home、进程状态、操作日志、Run Repository、Run 文件和 Saved Media；`.local/source-client/client.js` 是 start 或 restart 根据当前 Client 源码生成的浏览器 ModuleLoader 输入。以上目录不保存另一份产品源码。

**Configuration Profile**：Host 使用的一组结构化配置。当前系统只有 `production`，其结构由 `config/schema.ts` 定义，其值由 `config/base.json`、`config/profiles/production.json` 和允许的环境变量合成。

**Managed Source State**：生产入口把运行中配置快照保存在 `.local/source-production-managed.json`，独立 linked worktree 入口把运行中配置快照保存在 `.local/worktree-development/state/source-managed.json`。`prod:stop`、`prod:status`、`prod:health` 和 `prod:logs` 使用生产快照；对应的 `worktree:*` 命令使用 worktree 快照。

**Source Contract Identity**：当前数据源合同固定为 `imagegen-source-contract` 版本 `0.84.0`。Catalog CLI 与 Source CLI 的实际路径由 `config/source-production.json` 定义。Catalog 资源的 `sample_image_urls` 只投影为 Client Module 展示使用的 `CatalogItem.sampleImageUrls`，不进入 Message Context。

## 数据

**Workspace**：Harness 中的最高会话隔离边界。一个 Workspace 包含多个 Session。

**Session**：Workspace 中的一段持续对话。

**Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。

**Run Repository**：默认位于 `.local/production/shared/data/runs.sqlite` 的运行记录数据库。

**Saved Media**：默认位于 `.local/production/shared/saved-media/` 的已保存媒体。

**Generation Run**：一次 `generate_with_comfyui` Tool Call 对应的持久异步运行。不同 `callId` 创建不同 Run；每个 Run 独立保存请求、来源快照、Actual Workflow 和 API Workflow。

**Generation Media**：一个 Generation Run 保存的一项图片或视频输出。每项 Media 通过自己的 `run_id` 解析所属 Run 的 Actual Workflow，Session 和 Chat Turn 只用于筛选。

**Session Media Viewer**：Host 为单个 Session 的 Generation Media 提供的同源 HTML 查看页。查看页按 `created_at DESC, output_index DESC, media_id DESC` 排列当前 Session 的媒体，顶部显示当前媒体所属 Generation Run 的完整 `run_id` 和媒体文件固有像素尺寸，底部显示该 Run 保存的 `parameters.positive_prompt`，并通过较新与较早方向在同一页面切换媒体。用户点击顶部 `run_id` 后，查看页把完整值写入浏览器剪贴板。

**运行时 API Workflow 投影**：`ComfyWorkflowCompiler` 根据当前 UI Workflow、目标实例的 `/object_info`、请求参数、模型、LoRA、节点输入名称、节点活动状态和上下游连线生成输入值与执行结构。该投影继续承载原编译器已经通过回归测试的参数语义，但不能直接提交给 ComfyUI `/prompt`。

**Official Base API Workflow**：目标 ComfyUI 实例的官方前端加载 Actual Workflow 后，通过 `graphToPrompt()` 返回的 API Workflow。该对象是最终节点拓扑、连接 tuple、虚拟节点和自定义 widget 序列化结构的权威来源。

**Official API Workflow Cache**：默认位于 `.local/production/shared/data/api-workflow-cache/` 的本地 JSON 缓存。每个缓存项保存实例身份、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希、执行结构哈希和 Official Base API Workflow；缓存项不保存认证信息，也不保存覆盖后的本次请求值。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。

**Runtime Input Overlay**：Host 深拷贝 Official Base API Workflow，并使用运行时 API Workflow 投影覆盖已经存在的同名非连接输入。Runtime Input Overlay 保留官方连接 tuple、虚拟节点和额外输入；官方值使用 `{ "__value__": ... }` 包装时只替换 `__value__`。

**ChromeComfyFrontend**：`src/host/generation/comfy-frontend-browser.ts` 实现的官方前端导出适配器。该适配器只在 Official API Workflow Cache 未命中时启动配置的本机 Chrome 或 Chromium，通过 Chrome DevTools Protocol 在导航前设置实例认证信息，等待前端与自定义节点完成初始化，再调用 `loadGraphData()` 与 `graphToPrompt()`。

## 发布

**Product Version**：根 `package.json.version` 中的 SemVer。当前值为 `0.33.1`。

**GitHub Release**：指向已通过 CI 的精确提交的 Git tag 与 GitHub Release 记录。本次目标发布标签为 `v0.33.1`；发布不创建或附加产品包。
