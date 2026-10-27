---
文档用途: 说明插件的模块职责、接口边界与业务数据流。
读取时机: 修改模块边界、公共接口或业务调用链前。
---
# 系统架构

## 官方宿主与插件载入

1. 官方 DeepSeek Harness Desktop 提供应用生命周期、Electron Node、Harness Host、Profile、插件管理器、Settings 与内置 Preset。Harness ComfyUI 以预构建 tarball 安装到官方 Profile，由官方 Host 管理插件生命周期。

2. [package.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/package.json>) 定义插件公开子路径、SDK peer 版本、Host bundle 与 Client 声明；[cordis.patch.yml](</Volumes/4Tdisk/work/AI2/harness-comfyui/cordis.patch.yml>) 装配以下入口。

   | 入口 | 服务职责 |
   | --- | --- |
   | `harness-comfyui/core` | 提供 `harnessComfyuiCore`，加载插件配置并初始化 Catalog、Generation Runtime 与 coordinator。 |
   | `harness-comfyui/image-reader` | 提供图片读取服务与配置管理。 |
   | `harness-comfyui/cli` | 提供前台 Tool Call 的受管 CLI 请求入口。 |
   | `harness-comfyui` | 注册 Catalog、Generation、Image Reader Remote 与媒体路由。 |
   | Client bundle | 注册工作台、上下文选择器、结果页与插件设置表单。 |
   | 已安装 Preset component | 载入项目 Preset。 |

3. Core 与 Image Reader 各提供一份 Host service，CLI 和 Web 插件共用这些实例。插件业务数据与安装资源分别存储；Profile 设置和凭据由官方 Host 保存。存储路径、配置覆盖与生效时机见[配置规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md>)，源码与资源定位见[目录结构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/directory-structure.md>)。

## 项目 Preset、Skills 与目录访问

1. 项目预设由 [Preset registry](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/presets.cordis.yml>) 注册。用户通过官方会话界面选择 ComfyUI工作台预设；官方内置 Preset 由宿主管理。

2. ComfyUI工作台预设通过[共享组合](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/shared/agent.cordis.yml>)加载 NoobAI MCP、前台 shell、会话目录、Skill 访问和 compaction。[工作台配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml>)定义绘图任务目标与 MCP、CLI、Skill 的分工，并装配官方子 Agent 组件。

3. 工作台保留宿主提供的当前目录、沙箱、审批、剩余派发深度和委派信息。[workbench-composition.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/workbench-composition.mjs>)通过宿主原生上下文与工具 API 应用工作台范围的配置。字段与来源见[工作台装配配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#工作台装配配置>)。

4. 官方 `subagent` 接纳任务后返回子会话 ID。子会话继承派发时的工作台组合、模型配置和当前工作目录，并独立开始对话。父 Agent 使用 `send_message` 续派，使用 `interrupt_agent` 中断，使用 `list_agents` 查询子会话。调度、深度限制、结束通知和恢复由宿主管理。组件来源与字段见[子 Agent 派发配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#子-agent-派发配置>)。

5. 工作台在原生 Cordis group 中隔离 `skills` 服务。组内的官方 filesystem Skill provider 发现包内业务 Skill，以及明确配置的额外目录。官方 Skill 工具负责摘要与正文读取。其他预设使用各自的 Skill 来源。资源入口见[目录结构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/directory-structure.md#preset-与-skill-资源>)，来源字段见[工作台装配配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#工作台装配配置>)。

6. 工作台 Agent 通过宿主原生 MCP 客户端访问 NoobAI MCP 服务，查询目录记录及业务资源。Host 内部数据源客户端读取 Catalog 展示与 Generation Workflow 准备所需的数据；入口为 [queryCatalog()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/source-client/catalog-client.ts>) 与 [readSourceRecord()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/source-client/source-client.ts>)。协议路径与请求限制由 [config/source-client.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/source-client.json>) 定义。两条访问路径连接同一目录数据；地址与凭据配置见[NoobAI MCP 服务](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#noobai-mcp-服务>)。

7. Agent 通过受管 CLI 检查生成输入、提交生成、查询 Run、取得媒体和读取图片。CLI 与 Remote 复用常驻业务服务；Core 和 Image Reader 的职责是服务装配与生命周期管理。开发约束见[项目预设与 Skill 开发规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/comfyui-workbench-preset-and-skill-development.md>)。

## Host Node 与受管 CLI 身份

1. managed CLI 与 Workflow Worker 使用 Host 的 `process.execPath` 执行 Electron Node 脚本；脚本环境由 [nodeScriptEnvironment()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/node-script-environment.ts>) 提供。插件安装声明提供插件运行依赖，Host 提供 `node:sqlite`。

2. [CLI plugin](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/plugin.ts>) 通过官方 `shellEnv` 为前台 Tool Call 提供受管 CLI 调用环境。[CliShellCapabilityStore](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/shell-capability.ts>) 创建当前 Tool Call 的短期调用凭证（capability），[CLI route](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/route.ts>) 校验该凭证并派生业务调用身份；ToolExecution 完成时撤销该凭证。环境字段、listener 地址与卸载期限见[配置规范的受管 CLI 章节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#受管-cli-配置>)。

3. 宿主 `workingDirectory` 服务管理当前工作目录，并向模型提供目录上下文。官方 `working_directory` 工具读取或切换会话目录。Shell 使用当前工作目录执行命令和解释相对文件路径；shell 的 `workdir` 参数只覆盖单次命令的执行位置。

4. CLI route 通过 [resolveGenerationWorkspaceId()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workspace-access.ts>) 按原始项目目录取得已有 Workspace。Session、Turn 与 Tool Call 身份来自宿主执行上下文。未分组子会话可使用同一业务入口；当前工作目录变化后，Run 仍归属原始项目。原始项目目录尚未注册时，业务接口提示用户通过官方入口选择或创建 Workspace。调用身份入口为 [CLI route](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/route.ts>)。

5. [dispatch()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/dispatch.ts>) 将 Generation 请求交给 Runtime，将图片读取请求交给 Image Reader。Host coordinator 负责持续执行已接纳的 Run。

6. [受管 CLI 入口](</Volumes/4Tdisk/work/AI2/harness-comfyui/scripts/cli/harness-comfyui.mjs>) 通过 [result-file.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/scripts/cli/result-file.mjs>) 将业务响应保存到单次调用的结果文件。写入完成后，CLI 返回文件路径。Run 和业务持久化由 Runtime 管理。CLI 输出格式与结果文件错误信息由 [CLI 帮助配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/managed-cli-help.json>) 定义。

## Generation Run 生命周期与历史查询

1. [GenerationRuntime.acceptGeneration()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>) 先持久化调用身份与 Generation Request，再由 [SourceGenerationPreparer](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/source-preparer.ts>) 读取实例、模板和映射数据并准备 Workflow。准备失败时，Tool Call 与失败 Run 保存同一错误码和错误信息；准备成功时，调用方收到 `run_id`。

2. 同一 Tool Call 的相同 Generation Request 返回同一 Run；同一 Tool Call 的不同请求返回 `RUN_REQUEST_CONFLICT`。独立生成任务使用独立 Tool Call。幂等判断与持久化入口统一为 `GenerationRuntime.acceptGeneration()`。

3. [GenerationCoordinator](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-coordinator.ts>) 推进 `/prompt` 提交、Jobs API 观察、结果下载和媒体保存。Host 停止时 coordinator 中止本地观察；远端 ComfyUI 任务继续运行，Host 重启后从非终态 Run 恢复观察。

4. Run Repository 保存状态和索引；每个 Run 的目录保存请求、来源快照、Actual Workflow 与 API Workflow；Saved Media 保存下载后的媒体文件。对应写入和恢复逻辑由 [GenerationRuntime](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>) 维护，目录字段见[配置规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#configuration-profile-字段>)。

5. `GenerationRuntime.readGenerationRunInputs()` 与 `readGenerationRunMedia()` 统一处理当前 Workspace 的历史查询。批量查询、Run ID 匹配与查询取消规则见 [GenerationRuntime](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>)。

6. 历史参数查询读取创建 Run 时保存的请求参数与 Actual Workflow；媒体查询同时返回本地图片路径。参数转换由 [runInputArguments()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-runtime.ts>) 负责，返回字段与 Workflow 状态由 [src/generation/contract.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/generation/contract.ts>) 定义。

## Workflow 参数化与官方导出

1. Generation 编译分为参数化、官方前端导出与运行参数覆盖三个阶段。

   ```text
   UI Workflow + Generation Request + 目标实例 /object_info
     → ComfyWorkflowCompiler：生成 Actual Workflow 与运行时 API Workflow 投影
     → OfficialApiWorkflowCompiler：读取或创建 Official Base API Workflow
         → 缓存未命中：NodeWorkerComfyFrontend → ChromeComfyFrontend
             → 目标实例官方 loadGraphData() 与 graphToPrompt()
     → overlayRuntimeApiWorkflow：把非连接请求值写入 Official Base API Workflow 的副本
     → ComfyHttpTransport：提交最终 API Workflow
   ```

2. [ComfyWorkflowCompiler.inspectRuntimeParameters() 与 compile()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workflow-compiler.ts>) 共用运行参数计划。UI Workflow 与目标实例 `/object_info` 提供参数发现和参数约束所需的数据，Source TemplateBundle 提供模板 ID、标题与 UI Workflow。该 compiler 负责运行参数解析、校验与 Workflow 编译；Source adapter、Runtime 和 CLI 负责转交输入与结果。

3. `parameters` 描述非尺寸参数，`size_candidates` 描述能够控制全部活动图片输出最终尺寸的候选组合。参数校验规则与错误结果见 [ComfyWorkflowCompiler](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workflow-compiler.ts>)。

4. 目标 ComfyUI 在接收 Prompt 时执行节点自定义 Python 校验。该校验拒绝请求时，Run 返回 `COMFYUI_PROMPT_REJECTED` 并保存 `node_errors`；调用方依据节点 ID、输入名称和校验消息修正参数或 UI Workflow。

5. 官方导出与运行值覆盖的实现入口分别为 [OfficialApiWorkflowCompiler](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/official-api-workflow.ts>) 和 [overlayRuntimeApiWorkflow()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/official-api-workflow.ts>)。这两个阶段保留官方导出的执行节点和连接；官方前端导出、缓存读取或覆盖失败时，Run 以相应错误结束。缓存路径与维护操作见[配置规范的缓存维护章节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#配置生效与缓存维护>)。

6. [NodeWorkerComfyFrontend](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/comfy-frontend-worker-client.ts>) 通过版本化 stdin/stdout JSON 协议调用包内 Worker；实例认证值通过 stdin 传递。Worker 通过 [ChromeComfyFrontend](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/comfy-frontend-browser.ts>) 使用独立临时 browser profile 完成导出。取消和超时清理限定在本次 Worker 进程组与其浏览器资源内。

7. [ComfyHttpTransport](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/comfy-http-transport.ts>) 把 Actual Workflow 写入 `extra_data.extra_pnginfo.workflow`，并按 compiler 返回的活动输出集合筛选结果。`type=output` 的图片和视频经过路径、媒体类型、大小与文件签名校验后保存为 Saved Media；`type=temp` 预览属于远端临时结果。

## Client 工作台、结果与媒体访问

1. Client 通过官方右侧栏扩展位注册 ComfyUI 结果页，展示当前 Session 的媒体与 Run 状态。工作台页签状态由 [WorkbenchController](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/workbench/controller.ts>) 管理，结果页投影由 [GenerationProjectionStore](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/workbench/generation-store.ts>) 管理。该 Store 统一管理结果查询、资源释放和迟到响应处理。

2. [workspaceSessionScopeForSession()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workspace-access.ts>) 使用官方 `subagents.listDescendants()` 查询后代会话。当前 Session 可读取自身结果，以及原始项目目录解析到同一 Workspace 的本地后代结果。后代会话查询返回分支错误，或缺少后代会话头信息时，接口报告对应分支不可读取。调用取消信号传给官方查询；应用重启后，持久化会话信息支持恢复相同的访问范围。

3. Catalog 列表、详情与封面画廊由 [native-surfaces.tsx](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/workbench/native-surfaces.tsx>) 和 [catalog-details.tsx](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/workbench/catalog-details.tsx>) 展示。用户打开预览或详情后，Catalog 界面保留查询条件、选中项和返回位置。展示字段与详情接口定义分别由 [src/catalog/presentation.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/catalog/presentation.json>) 和 [src/catalog/details-schema.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/catalog/details-schema.ts>) 定义；`coverUrl` 与 `sampleImageUrls` 属于 Client 展示投影。

4. [media-routes.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/media-routes.ts>) 经官方 `webServer` 提供查看页、媒体内容、原文件下载与 Actual Workflow 路由。每次访问校验 HTTP 方法、Session、Workspace 和媒体归属。查看页的启动数据包含媒体展示字段、Run ID 与保存的正向 Prompt。

5. [media-viewer-page.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/media-viewer-page.ts>) 展示同一 Session 的媒体，按 Runtime 返回顺序切换并更新当前 URL。图片和视频按原始宽高比完整显示，像素尺寸来自媒体文件。承载查看页 iframe 的 Client 界面提供完整 Run ID、Run ID 复制与原文件下载。iframe 当前媒体消息的结构由 [src/generation/contract.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/generation/contract.ts>) 定义。[ProjectionMediaGallery](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/workbench/results-drawer.tsx>)负责校验该消息的来源与媒体归属。

## 图片读取与 Prompt 对比职责

1. [ImageReaderService.inspect()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/image-reader-service.ts>) 一次读取一个本地图片路径。该服务按活动配置选择独立视觉模型，并返回图片观察文本。CLI 传入的 `sessionId` 来自已验证的调用身份。

2. [prepareImageReaderInput()](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/image-reader-input.ts>) 在 Provider 调用前验证图片并在内存中缩放。格式、透明通道与动画处理以 [config/image-reader-processing.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/image-reader-processing.json>) 为准。

3. 处理后的图片统一保存为宿主 Attachment，并通过 `llm.prepareCall()` 调用宿主 Provider。宿主负责请求协议、流式响应和取消；图片读取服务负责图片输入、观察文本与业务错误。自定义 Chat Completions 地址接入同一调用路径，Provider 适配入口为 [ImageReaderNativeSettings](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/native-settings.ts>)。

4. 执行 [comfyui-image-review](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-image-review/SKILL.md>) 的 Agent 负责依据参数和观察完成 Prompt 比较与改进。[local-image-reader](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/local-image-reader/SKILL.md>) 定义用户提供本地图片时的读取流程。命名配置、凭据、默认提示词和调用诊断见[图片读取设置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#图片读取设置>)。
