---
文档用途: 定义当前源码使用的领域术语，并索引对应源码和规范。
读取时机: 阅读、设计或修改领域模块前。
---
# Harness ComfyUI 领域上下文

1. 模块边界和运行规则见[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md>)，插件交付决策见 [ADR 0016](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/adr/0016-official-desktop-plugin-delivery.md>)。

## 平台与会话

1. **Harness Core**：项目通过官方公共接口接入的 DeepSeek Harness 运行框架。依赖声明见 [package.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/package.json>)，接入边界见[官方宿主与插件载入](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#官方宿主与插件载入>)。

2. **Workspace**：Harness 按项目目录保存的会话分组与业务隔离记录。项目接入规则见[项目 Preset、Skills 与目录访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#项目-presetskills-与目录访问>)。

3. **Session**：Harness 中的一段持续对话，可以加入 Workspace 分组。项目的会话接入入口见[会话界面入口](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/index.tsx>)。

4. **Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。生成记录中的会话与轮次结构见 [GenerationIdentity](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)。

5. **原始项目目录**：Session 创建时保存到 `SessionHeader.cwd` 的目录。

6. **当前工作目录**：Harness `workingDirectory` 服务管理的会话执行目录。目录变化影响命令执行和相对路径解析。

## 官方 Profile

1. **官方 Profile**：Harness 保存插件安装记录、宿主配置和凭据引用的运行环境。其路径和配置入口见[官方插件配置与存储校验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#官方插件配置与存储校验>)。

## 配置与插件服务

1. **Configuration Profile**：`harness-comfyui` 插件使用的一组结构化业务配置。字段定义见 [config/schema.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/schema.ts>)，加载入口见 [loadProfile()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/config/load-profile.ts>)，配置覆盖规则见 [Configuration Profile 计算顺序](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#configuration-profile-计算顺序>)。

2. **Host Plugin**：官方 Harness Desktop 加载的 `harness-comfyui` 插件模块。插件入口见 [src/host/plugin.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/plugin.ts>)，服务装配见 [ComfyuiCoreService](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/core/plugin.ts>)。

3. **Official Desktop Plugin Runtime**：官方 DeepSeek Harness Desktop 中运行的 Host Plugin 实例。应用进程、官方 Profile 和插件生命周期的职责见[宿主职责](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/startup.md#宿主职责>)。

4. **Plugin Storage**：Host Plugin 保存 SQLite、生成文件、媒体、日志和缓存的持久目录。目录配置见 [config/base.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/base.json>)，路径归属规则见[官方插件配置与存储校验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#官方插件配置与存储校验>)。

5. **Managed CLI Server**：Host Plugin 为官方前台 Bash Tool Call 提供的专用回环 HTTP 服务，使用短期 capability 标识调用者。服务入口见 [src/host/cli/plugin.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/plugin.ts>)，请求入口见 [src/host/cli/route.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/route.ts>)。

6. **Image Reader Configuration**：官方 Profile 中由 `harness-comfyui-image-reader` Settings 管理的命名读图配置。每份配置选择独立视觉 Provider、模型和默认 Prompt。配置结构见 [ImageReaderConfiguration](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/image-reader/settings.ts>)，连接与凭据归属见[图片读取设置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#图片读取设置>)。

7. **Image Inspection**：按照 Image Reader Configuration 调用视觉模型读取单张本地图片的能力，由受管 CLI 的 `image inspect --stdin` 提供。入口见 [ImageReaderService.inspect()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/image-reader-service.ts>)。

8. **Client Module**：Host Plugin 提供的浏览器界面模块，负责设置、上下文选择与生成结果展示。模块入口见 [src/client/index.tsx](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/index.tsx>)，宿主界面接入规则见 [Client 工作台、结果与媒体访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#client-工作台结果与媒体访问>)。

## 数据源

1. **Data Source Service**：使用者独立安装并运行、通过 HTTP 或 HTTPS 提供目录和生成来源数据的服务。服务边界见 [ADR 0015](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/adr/0015-independent-data-source-service.md>)。

2. **Source Service Configuration**：官方 Profile 中 `harness-comfyui-core` Settings 保存的 Data Source Service 地址与端口。字段定义见 [src/source-settings.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/source-settings.ts>)，设置规则见[Host 内部数据源设置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#host-内部数据源设置>)。

3. **Built-in Source Clients**：随 Host Plugin 构建的内部 HTTP 客户端模块，用于访问 Data Source Service。公共 HTTP 入口位于 [src/host/source-client/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/source-client>)，业务入口见 [CatalogClient](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/catalog/catalog-client.ts>) 和 [GenerationSourceClient](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/source-client.ts>)。

4. **Source Template Bundle**：Data Source Service 返回的单个 ComfyUI 工作流模板数据对象。响应解析入口见 [parseTemplate()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/source-client.ts>)。

5. **Catalog 目录图片展示数据**：Data Source Service 提供、用于 Client Module 目录展示的图片 URL。来源映射入口见 [CatalogClient](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/catalog/catalog-client.ts>)，展示结构见 [CatalogItem.sampleImageUrls](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/catalog/contract.ts>)。

## Workflow 格式

1. **Workflow**：ComfyUI 的节点工作流。格式与解析入口见 [workflow-compiler.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workflow-compiler.ts>)。

2. **UI Workflow**：保存节点、连线与控件，供 ComfyUI 前端编辑的 Workflow。

3. **API Workflow**：保存节点类型和输入，供 ComfyUI 执行的 Workflow。

## Workflow 处理

1. **运行时 API Workflow 投影**：编译器为本次 UI Workflow 生成的运行输入和执行结构。投影入口见 [projectRuntimeApiWorkflow()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workflow-compiler.ts>)。

2. **编译后活动输出节点集合**：Workflow 编译结果中用于筛选生成输出的活动输出节点 ID 集合。计算入口见 [projectRuntimeOutputNodes()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workflow-compiler.ts>)，运行时结构见 [PreparedGeneration.expectedOutputNodeIds](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)。

3. **Official Base API Workflow**：目标 ComfyUI 实例的官方前端加载本次 UI Workflow 后，通过 `graphToPrompt()` 导出的 API Workflow。导出接口见 [ComfyFrontendExporter](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/official-api-workflow.ts>)。

4. **ChromeComfyFrontend**：使用本机 Chrome 或 Chromium 导出 Official Base API Workflow 的浏览器适配器。入口见 [ChromeComfyFrontend.exportWorkflow()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/comfy-frontend-browser.ts>)，Worker 调用入口见 [NodeWorkerComfyFrontend](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/comfy-frontend-worker-client.ts>)。

5. **Official API Workflow Cache**：Plugin Storage 中保存 Official Base API Workflow 的文件缓存。目录配置见 [config/base.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/base.json>) 的 `paths.apiWorkflowCacheDirectory`，缓存入口见 [OfficialApiWorkflowCompiler](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/official-api-workflow.ts>)。

6. **Runtime Input Overlay**：将运行时 API Workflow 投影的输入值应用到 Official Base API Workflow 的处理过程。入口见 [overlayRuntimeApiWorkflow()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/official-api-workflow.ts>)。

## 生成记录与媒体

1. **Generation Run**：受管 CLI 的生成请求创建并持久保存的异步生成任务，归属原始项目目录对应的 Workspace。接纳入口见 [GenerationRuntime.acceptGenerations()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)，记录生命周期见 [Generation Run 生命周期与历史查询](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#generation-run-生命周期与历史查询>)。

2. **Run Repository**：Plugin Storage 中保存 Generation Run 记录的 SQLite 数据库。目录配置见 [config/base.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/base.json>) 的 `paths.runRepositoryFile`，建表入口见 [GenerationRuntime.initializeDatabase()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)。

3. **Saved Media**：Generation Run 输出图片和视频的原始文件。目录配置见 [config/base.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/base.json>) 的 `paths.savedMediaDirectory`，保存入口见 [GenerationRuntime.persistMedia()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)。

4. **Generation Media**：Generation Run 保存的一项图片或视频输出记录，关联对应的 Saved Media。记录结构见 [GenerationMediaSnapshot](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)。

5. **Generation Run Input Query**：读取当前 Workspace 中 Generation Run 的生成参数和实际 Workflow 的只读查询，由受管 CLI 的 `generation run-inputs --stdin` 提供。查询入口见 [GenerationRuntime.readGenerationRunInputs()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)，输入输出结构见 [src/generation/run-input-contract.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/generation/run-input-contract.ts>)。

6. **Generation Run Media Query**：读取当前 Workspace 中 Run 状态、错误与本地图片路径的只读查询。调用与返回规则见[生成生命周期与历史查询](docs/system/architecture.md#generation-run-生命周期与历史查询)，结构见 [run-media-contract.ts](src/image-reader/run-media-contract.ts)。

7. **Session Media Viewer**：Host Plugin 为单个 Session 的 Generation Media 提供的同源 HTML 查看页。渲染入口见 [renderGenerationMediaViewerPage()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/media-viewer-page.ts>)，访问与下载入口见 [registerGenerationMediaRoutes()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/media-routes.ts>)，界面行为见 [Client 工作台、结果与媒体访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#client-工作台结果与媒体访问>)。

8. **提交清单**：Agent 保存的生成请求集合，使用 `items` 数组组织各项 `request_id`、`request` 和可选 `parameter_files`。批次指一份提交清单中的请求集合。结构入口见 [src/cli/contract.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/cli/contract.ts>)。

9. **request_id**：Agent 在首次提交前生成并保存的 UUID，用于在同一 Workspace、Session 内识别同一次请求。持久去重规则见 [ADR 0005](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/adr/0005-harness-identities-and-generation-run-ownership.md>)。

## 项目 CLI、Skill 与 Preset

1. **Repository Skills**：仓库 [.agents/skills/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills>) 管理并随插件交付的业务 Skill。使用入口见[项目 Skills](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md#项目-skills>)。

2. **ComfyUI Workbench Preset**：按 Repository Skills 执行 ComfyUI 任务的项目 Agent Preset。身份与组合入口见[项目 Preset、Skills 与目录访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#项目-presetskills-与目录访问>)。

3. 工作台的资源作用域、子 Agent 与项目 Skill 开发规则见[项目预设与 Skill 开发规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/comfyui-workbench-preset-and-skill-development.md>)。

## 发布

1. **Product Version**：根 [package.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/package.json>) 的 `version` 字段保存的 SemVer。版本与候选状态见 [docs/releasenotes.md](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/releasenotes.md>)。

2. **GitHub Release**：与通过发行门禁的源码提交对应的版本标签和插件发布条目。标签命名、插件附件和发布步骤见 [Git tag、GitHub Release 与插件附件](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/releasing.md#git-taggithub-release-与插件附件>)。
