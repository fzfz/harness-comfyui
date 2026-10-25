---
文档用途: 定义当前源码实现的领域术语，并索引对应源码和规范。
读取时机: 阅读、设计或修改领域模块前。
---
# Harness ComfyUI 领域上下文

1. 模块边界和运行规则见[系统架构](docs/system/architecture.md)，插件交付决策见 [ADR 0016](docs/adr/0016-official-desktop-plugin-delivery.md)。

## 平台与会话

1. **Harness Core**：项目通过官方公共接口接入的 DeepSeek Harness 运行框架。依赖声明见 [package.json](package.json)，接入边界见[官方宿主与插件载入](docs/system/architecture.md#官方宿主与插件载入)。

2. **Workspace**：Harness 中的最高会话隔离边界，一个 Workspace 包含多个会话。项目接入规则见[项目 Preset、Skills 与目录访问](docs/system/architecture.md#项目-presetskills-与目录访问)。

3. **Session**：Workspace 中的一段持续对话。项目的会话接入入口见[会话界面入口](src/client/index.tsx)。

4. **Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。生成记录中的会话与轮次结构见 [GenerationIdentity](src/host/generation/generation-runtime.ts)。

## 配置与插件服务

1. **Configuration Profile**：Host 使用的一组结构化业务配置。字段定义见 [config/schema.ts](config/schema.ts)，加载入口见 [loadProfile()](src/config/load-profile.ts)，配置覆盖规则见 [Configuration Profile 计算顺序](docs/system/configuration.md#configuration-profile-计算顺序)。

2. **Host Plugin**：官方 Harness Desktop 加载的 `harness-comfyui` 插件模块。插件入口见 [src/host/plugin.ts](src/host/plugin.ts)，服务装配见 [ComfyuiCoreService](src/host/core/plugin.ts)。

3. **Official Desktop Plugin Runtime**：官方 DeepSeek Harness Desktop 中运行的 Host Plugin 实例。应用进程、Profile 和插件生命周期的职责见[宿主职责](docs/system/startup.md#宿主职责)。

4. **Plugin Storage**：Host Plugin 保存 SQLite、生成文件、媒体、日志和缓存的持久目录。目录配置见 [config/base.json](config/base.json)，路径归属规则见[官方插件配置与存储校验](docs/system/configuration.md#官方插件配置与存储校验)。

5. **Managed CLI Server**：Host Plugin 为官方前台 Bash Tool Call 提供的专用回环 HTTP 服务，使用短期 capability 标识调用者。服务入口见 [src/host/cli/plugin.ts](src/host/cli/plugin.ts)，请求入口见 [src/host/cli/route.ts](src/host/cli/route.ts)。

6. **Image Reader Configuration**：官方 Profile 中由 `harness-comfyui-image-reader` Settings 管理的命名读图配置与独立凭据。配置结构见 [ImageReaderConfiguration](src/image-reader/settings.ts)，设置规则见[图片读取设置](docs/system/configuration.md#图片读取设置)。

7. **Image Inspection**：按照 Image Reader Configuration 调用视觉模型读取单张本地图片的能力，由 `inspect_image` 与 `image inspect --stdin` 提供。实现入口见 [ImageReaderService.inspect()](src/host/image-reader/image-reader-service.ts)。

8. **Client Module**：Host Plugin 提供的浏览器界面模块，负责设置、上下文选择与生成结果展示。模块入口见 [src/client/index.tsx](src/client/index.tsx)，宿主界面接入规则见 [Client 工作台、结果与媒体访问](docs/system/architecture.md#client-工作台结果与媒体访问)。

## 数据源

1. **Data Source Service**：使用者独立安装并运行、通过 HTTP 或 HTTPS 提供目录和生成来源数据的服务。服务边界见 [ADR 0015](docs/adr/0015-independent-data-source-service.md)。

2. **Source Service Configuration**：官方 Profile 中 `harness-comfyui-core` Settings 保存的 Data Source Service 地址与端口。字段定义见 [src/source-settings.ts](src/source-settings.ts)，设置规则见[Host 内部数据源设置](docs/system/configuration.md#host-内部数据源设置)。

3. **Built-in Source Clients**：随 Host Plugin 构建的内部 HTTP 客户端模块，用于访问 Data Source Service。公共 HTTP 入口位于 [src/host/source-client/](src/host/source-client/)，业务入口见 [CatalogClient](src/host/catalog/catalog-client.ts) 和 [GenerationSourceClient](src/host/generation/source-client.ts)。

4. **Source Template Bundle**：Data Source Service 返回的单个 Workflow 模板数据对象。响应解析入口见 [parseTemplate()](src/host/generation/source-client.ts)。

5. **Catalog 目录图片展示数据**：Data Source Service 提供、用于 Client Module 目录展示的图片 URL。来源映射入口见 [CatalogClient](src/host/catalog/catalog-client.ts)，展示结构见 [CatalogItem.sampleImageUrls](src/catalog/contract.ts)。

## Workflow 处理

1. **运行时 API Workflow 投影**：编译器为本次 UI Workflow 生成的运行输入和执行结构。投影入口见 [projectRuntimeApiWorkflow()](src/host/generation/workflow-compiler.ts)。

2. **编译后活动输出节点集合**：Workflow 编译结果中用于筛选生成输出的活动输出节点 ID 集合。计算入口见 [projectRuntimeOutputNodes()](src/host/generation/workflow-compiler.ts)，运行时结构见 [PreparedGeneration.expectedOutputNodeIds](src/host/generation/generation-runtime.ts)。

3. **Official Base API Workflow**：目标 ComfyUI 实例的官方前端加载本次 UI Workflow 后，通过 `graphToPrompt()` 导出的 API Workflow。导出接口见 [ComfyFrontendExporter](src/host/generation/official-api-workflow.ts)。

4. **ChromeComfyFrontend**：使用本机 Chrome 或 Chromium 导出 Official Base API Workflow 的浏览器适配器。实现入口见 [ChromeComfyFrontend.exportWorkflow()](src/host/generation/comfy-frontend-browser.ts)，Worker 调用入口见 [NodeWorkerComfyFrontend](src/host/generation/comfy-frontend-worker-client.ts)。

5. **Official API Workflow Cache**：Plugin Storage 中保存 Official Base API Workflow 的文件缓存。目录配置见 [config/base.json](config/base.json) 的 `paths.apiWorkflowCacheDirectory`，缓存实现见 [OfficialApiWorkflowCompiler](src/host/generation/official-api-workflow.ts)。

6. **Runtime Input Overlay**：将运行时 API Workflow 投影的输入值应用到 Official Base API Workflow 的处理过程。实现入口见 [overlayRuntimeApiWorkflow()](src/host/generation/official-api-workflow.ts)。

## 生成记录与媒体

1. **Generation Run**：一次 `generate_with_comfyui` Tool Call 对应的持久异步运行。创建入口见 [GenerationRuntime.acceptGeneration()](src/host/generation/generation-runtime.ts)，记录生命周期见 [Generation Run 生命周期与历史查询](docs/system/architecture.md#generation-run-生命周期与历史查询)。

2. **Run Repository**：Plugin Storage 中保存 Generation Run 记录的 SQLite 数据库。目录配置见 [config/base.json](config/base.json) 的 `paths.runRepositoryFile`，建表入口见 [GenerationRuntime.initializeDatabase()](src/host/generation/generation-runtime.ts)。

3. **Saved Media**：Generation Run 输出图片和视频的原始文件。目录配置见 [config/base.json](config/base.json) 的 `paths.savedMediaDirectory`，保存入口见 [GenerationRuntime.persistMedia()](src/host/generation/generation-runtime.ts)。

4. **Generation Media**：Generation Run 保存的一项图片或视频输出记录，关联对应的 Saved Media。记录结构见 [GenerationMediaSnapshot](src/host/generation/generation-runtime.ts)。

5. **Generation Run Input Query**：读取当前 Workspace 中 Generation Run 的生成参数和实际 Workflow 的只读查询，由 `read_comfyui_run_inputs` 与 `generation run-inputs --stdin` 提供。查询实现见 [GenerationRuntime.readGenerationRunInputs()](src/host/generation/generation-runtime.ts)，输入输出结构见 [src/generation/run-input-contract.ts](src/generation/run-input-contract.ts)。

6. **Generation Run Media Query**：读取当前 Workspace 中 Generation Run 的生成参数和本地输出图片路径的只读查询，由 `get_generation_run_media` 与 `generation resolve-media --stdin` 提供。查询实现见 [GenerationRuntime.readGenerationRunMedia()](src/host/generation/generation-runtime.ts)，输出结构见 [src/image-reader/run-media-contract.ts](src/image-reader/run-media-contract.ts)。

7. **Session Media Viewer**：Host Plugin 为单个 Session 的 Generation Media 提供的同源 HTML 查看页。渲染入口见 [renderGenerationMediaViewerPage()](src/host/generation/media-viewer-page.ts)，访问与下载入口见 [registerGenerationMediaRoutes()](src/host/generation/media-routes.ts)，界面行为见 [Client 工作台、结果与媒体访问](docs/system/architecture.md#client-工作台结果与媒体访问)。

## 项目 Tool、Skill 与 Preset

1. **Project Tool Registry**：Host Plugin 注册项目 Tool 的唯一入口。实现见 [registerProjectTools()](src/host/tools/register-project-tools.ts)。

2. **Repository Skills**：仓库 [.agents/skills/](.agents/skills/) 管理的项目 Skill。各 Skill 的用途与执行步骤由其 `SKILL.md` 定义，安装方法见[安装项目 Skills](docs/user/install-update.md#安装项目-skills)。

3. **ComfyUI Workbench Preset**：显示名称为 `ComfyUI工作台预设`、内部 ID 为 `harness-comfyui-cli-candidate` 的可选项目 Agent Preset，负责按 Repository Skills 执行 ComfyUI 任务。定义入口见 [工作台 Preset 配置](agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml)。

4. **ComfyUI Iteration Preset**：显示名称为 `ComfyUI迭代预设`、内部 ID 为 `harness-comfyui-iteration` 的可选项目 Agent Preset，负责协调构图、生成、观察和比较四个角色完成图片迭代。定义入口见[迭代 Preset 配置](agent-presets/harness-comfyui-iteration/agent.cordis.yml)。

5. 两项 ComfyUI 产品 Preset 的资源作用域、Tool schema 可见性、系统提示词和子 Agent 执行规则见[产品预设与项目 Skill 开发规范](docs/agents/comfyui-workbench-preset-and-skill-development.md)。

## 发布

1. **Product Version**：根 [package.json](package.json) 的 `version` 字段保存的 SemVer。版本与候选状态见 [docs/releasenotes.md](docs/releasenotes.md)。

2. **GitHub Release**：与通过发行门禁的源码提交对应的版本标签和插件发布条目。标签命名、插件附件和发布步骤见 [Git tag、GitHub Release 与插件附件](docs/system/releasing.md#git-taggithub-release-与插件附件)。
