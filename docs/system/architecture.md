# 系统架构

## 启动与重启链路

Desktop generation 是 DSH Desktop 把当前插件发布包及其依赖安装到 `<DSH_HOME>/profiles/.generations/live/<generation-id>/` 后形成的不可变完整安装目录。`<DSH_HOME>/profiles/.generations/desired.json` 保存需要启用的 generation ID；Desktop 启动前的 generation projection 把 `<DSH_HOME>/profiles/web/node_modules/harness-comfyui` 链接到所选 generation 中的 `node_modules/harness-comfyui`，并把 `harness-comfyui` 写入 web profile 的 bundle composition。

```text
pnpm prod:start|restart
  → scripts/desktop/production-cli.mjs
  → config/desktop-production.json
  → scripts/desktop/legacy-session-migration.mjs 合并旧生产 Session 数据
  → 当前插件 Client/Host/managed CLI/Preset 物化与 generation 打包
  → 当前 checkout 的 .local/upstreams/dsh-desktop
  → DSH Desktop pnpm preview
  → .local/desktop-production/ 中的 PID、日志、DSH home 和业务数据
```

独立 worktree 的完整 Desktop 开发入口复用同一产品配置和 Desktop 生命周期：

```text
pnpm dev:start|restart
  → scripts/desktop/cli.mjs
  → config/desktop-worktree.json 与 linked-worktree 门禁
  → <worktree>/.env 和 <worktree>/node_modules 链接到 main
  → config/desktop-production.json
  → main 的 .local/upstreams/dsh-desktop
  → 当前 worktree 插件 generation
  → 当前 worktree 的移动桥接端口与 Electron Vite 输出目录
  → DSH Desktop pnpm dev --outDir <worktree>/.local/desktop-development/desktop-out
  → .local/desktop-development/
```

旧 Web Host 是独立调试入口：

```text
pnpm web:start|restart
  → scripts/worktree/cli.mjs
  → config/web-development.json
  → scripts/production/ 中的共享 Web Host 生命周期
  → .local/web-development/
```

`package.json.exports` 的 Host 入口直接指向 `src/index.ts`。Client 类型入口指向 `src/client/index.tsx`，浏览器运行入口是根据当前 Client 源码生成的 `.local/source-client/client.js`。managed CLI 运行入口是根据 `scripts/cli/harness-comfyui.mjs` 及其 TypeScript 依赖生成的 `.local/source-cli/harness-comfyui.mjs`。Desktop generation 打包包含 `scripts/source-client/` 中的两个数据源 HTTP 客户端。Desktop generation 打包和 Web Host start/restart 都先生成 Client 与 managed CLI 运行模块；运行中的插件不要求 Node.js 解释 `node_modules/harness-comfyui` 内的 TypeScript 文件。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/development/` | Desktop 与独立 Web Host 共用的跨进程端口声明、分配和释放 |
| `scripts/desktop/` | Desktop 产品配置解析、worktree 链接准备、generation 打包安装、Electron dev/preview 启停、状态和日志 |
| `scripts/desktop/legacy-session-migration.mjs` | 把旧 Web 生产 DSH home 的 Session、Attachment、Session 投影索引和 Workspace Session 关系合并到当前生产 DSH home |
| `scripts/production/` | Client 与 managed CLI 运行模块生成、Web Host 配置解析、PID 与端口所有权、启停、状态、健康和日志的共享实现 |
| `scripts/worktree/` | `web:*` 的 linked-worktree 门禁、Web 调试配置和共享 Web Host 生命周期适配 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `scripts/profile/product-agent-config.mjs` | 解析并验证当前 checkout 的产品 Preset 配置、Repository Skills 根目录和受管环境变量名称 |
| `scripts/profile/agent-preset.mjs` | 校验并物化 production/worktree 的 `ComfyUI工作台预设`、`ComfyUI迭代预设` 及其共享 component，并删除配置声明的已退役项目 Preset |
| `scripts/cli/` | managed CLI 构建的源码入口；启动器把该入口及其 TypeScript 依赖生成到 `.local/source-cli/` 后交给受管前台 shell Tool Call |
| `scripts/source-client/` | 插件内置的语义查询客户端和数据源读取客户端；两个客户端通过 HTTP 或 HTTPS 请求数据源服务 |
| `src/cli/` | 项目 CLI 的环境变量名称、argv、request、Generation Request、模板运行参数检查、随机 Seed 和历史 Run 输入查询合同 |
| `src/host/catalog/` | 通过插件内置语义查询客户端查询数据源服务，把数据源服务返回的封面与样例图片字段映射为 Client 使用的展示字段，提供 Agent 模板、LoRA、生成模型与 ComfyUI 实例 ID 查询 Tool，并向 Client 提供 Catalog Remote |
| `src/host/cli/` | 从前台 shell ToolExecution 建立短期 capability，并通过 loopback route 把 CLI 请求交给 Catalog adapter 或 Generation Runtime |
| `src/host/generation/` | Run Repository、Source adapter、运行时 Workflow 参数化、标准 Node.js 官方前端编译 Worker、API Workflow 导出与缓存、Comfy transport、coordinator、Generation 创建 Tool、历史 Run 输入查询 Tool、Generation Remote、媒体路由和 Session Media Viewer 页面生成器 |
| `src/host/image-reader/` | 图片读取设置迁移、单份配置保存、激活与删除、运行时视觉模型目录、系统 Provider/OpenAI 兼容适配和单图视觉模型调用 Tool |
| `src/host/tools/` | 项目 Tool 唯一注册入口 |
| `src/generation/` | Host、Tool 与 CLI 共用的 Generation Remote、媒体 URL 和历史 Run 输入查询合同 |
| `src/image-reader/` | Host 与 Client 共用的命名图片读取配置、逐规则校验、凭据动作、视觉模型目录和单份配置保存、激活与删除 Remote 合同 |
| `src/client/` | 使用 Harness 原生扩展位的工作台、上下文选择器、Generation Run/Media 投影，以及包含图片读取与数据源服务两个页签的统一 ComfyUI 设置页 |
| `.agents/skills/` | 八个项目 Skill 的 canonical source；每个 Skill 都包含自身执行所需的参考文档与运行资源 |
| `config/` | 生产配置、schema 和环境变量映射 |
| `profiles/` | Harness bundle composition 模板 |

DSH Desktop、DeepSeek Harness 与当前仓库保持三个源码边界。当前仓库通过公共接口接入 DeepSeek Harness；DSH Desktop 在自身的 `patches/` 目录维护受管依赖补丁，包括把模型请求的 Session ID 写入 `x-deepseek-harness-session-id` 请求头的 pi-ai 适配器补丁。DSH Desktop 的 `main` 分支维护移动桥接端口入口、聚合 Client Remote 补丁和产品 adapter 启用状态；当前 Harness ComfyUI 仓库只在启动 DSH Desktop 时传入 `DSH_DESKTOP_MOBILE_BRIDGE_PORT`，不复制 DSH Desktop 源码，也不把 Desktop 写入当前仓库 manifest 或 lockfile。开发启动从已安装 Desktop 提供 Harness 模块，只把当前仓库打包为 `harness-comfyui` generation。Desktop generation registry 的 `desired.json` 和 profile 中的 generation `link:` 负责启用插件，插件源码不进入 Desktop 仓库。

Client 在已保存 Session 中通过 Harness 原生 `details` 扩展位显示真实 Generation Run/Media 投影。Harness `0.1.2-rc.1` 不为尚未保存的空白 Session 分配 `details` 列宽；Client 仅在该状态通过公开 `shell.overlay` 扩展位显示空结果列。Session 保存后，`shell.overlay` 结果列退出，原生 `details` 结果列接管，页面只保留一个可见结果列。结果列按照“本会话媒体”“运行状态”的顺序显示页签，并在每次创建结果列组件时默认选择“本会话媒体”。工作台首次启用时自动打开结果列。`WorkbenchDock` 观察包含工作台按钮的 Harness AppFrame 上的 `data-details-collapsed` 属性；详情列关闭时，controller 的结果列状态为关闭，按钮显示“打开结果列”，详情列打开时，controller 的结果列状态为打开，按钮显示“关闭结果列”。用户点击工作台按钮、用户切换已保存 Session 或 Harness 的聊天和工具详情入口打开详情列后，`WorkbenchDock` 都会读取 `data-details-collapsed` 的新值、更新 controller 的结果列状态并显示与详情列状态一致的按钮文案。

`WorkbenchDetails` 在订阅 `GenerationProjectionStore` 后，把 `SessionSnapshot.running` 传给 Store 的 `setSessionRunning()`。此后，`WorkbenchDetails` 仅在该布尔值变化时再次调用 `setSessionRunning()`。Store 按 Session 共享查询、快照和计时器：有实际订阅者时，只要会话 Agent 正在运行或最近一次成功投影包含活动 Run，就继续调用 Generation Remote。会话运行状态变化会立即触发查询；会话 Agent 停止且投影没有活动 Run 后，Store 停止轮询。普通正文事件和工具事件不会触发结果查询。最后一个订阅者退出或 Store 释放时，Store 取消请求并清除对应的计时器、运行状态和缓存；旧请求的迟到响应不能更新快照或恢复计时器。

“插入上下文”资源卡片把封面预览按钮与记录选择按钮作为同级交互。封面预览按钮在同一个 Catalog `Modal` 中切换到图片画廊；关闭画廊后恢复 Catalog 查询、分页和待确认选择。画廊 header 不参与 flex 收缩，画廊 body 只占用 Modal 中 header 之外的剩余高度；图片按固有尺寸显示，超出查看区域时由该区域提供水平和垂直滚动条。`CatalogItem.coverUrl` 与 `CatalogItem.sampleImageUrls` 只属于 Client 展示投影，不进入 `CatalogContext` 或 composer 草稿。

## 进程与状态

`prod:start` 先把旧 Web 生产 DSH home 的 Session 数据合并到当前生产 DSH home，再更新浏览器 Client、Host 与 managed CLI 运行模块，物化 `ComfyUI工作台预设` 和 `ComfyUI迭代预设`、安装当前插件 generation 并执行 DSH Desktop `pnpm preview`。`dev:start` 不读取旧生产 DSH home；该命令更新相同产品模块和两个项目 Preset，安装当前 worktree generation，通过主开发 checkout 的端口声明目录取得移动桥接端口，并执行具有当前 worktree 独立输出目录的 DSH Desktop `pnpm dev`。启动器在 Desktop 确认监听后发布当前 PID 与端口状态。两个环境读取同一个 `cordis.patch.yml`、`config/desktop-production.json` 和当前 checkout 的 `config/product-agent.json`，把 Repository Skills 绝对路径写入 `HARNESS_COMFYUI_SKILL_DIR`，并写入各自隔离的 Desktop HOME、DSH home、PID 和日志目录。`cordis.patch.yml` 继续把 `harness-comfyui-cli-candidate` 设置为默认 Preset；`harness-comfyui-iteration` 只在用户显式选择时启用。

`web:start` 与 `web:restart` 通过主开发 checkout 的端口声明目录取得空闲回环端口，更新浏览器 Client 与 managed CLI 运行模块、物化相同的两个项目 Preset，再以前台子进程运行独立 Harness Web Host。Web Host 环境构建器从当前 checkout 的 `config/product-agent.json` 解析 Repository Skills，并在删除调用者提供的全部 `HARNESS_COMFYUI_*` 值后写入受管的 `HARNESS_COMFYUI_SKILL_DIR`。Web 进程管理器确认该 PID 监听声明端口后释放声明，并记录 PID、进程启动时间、命令和实际端口；`web:health` 只检查源码版本、Harness Web、Client ModuleLoader、Run Repository、Official API Workflow Cache 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖 `start`、`stop`、`restart`、`status`、`health`、`logs`、PID 身份和端口异常分支。

生产 Desktop 状态写入 `.local/desktop-production/`；开发 Desktop 状态写入当前 worktree 的 `.local/desktop-development/`；Web Host 调试状态写入 `.local/web-development/`。配置变更在下一次对应入口的 start 或 restart 时生效。

## Generation 生命周期

八个项目 Skill 以当前 checkout 的 `.agents/skills/<skill-name>` 为 canonical source。`loadProductAgentConfiguration(repositoryRoot)` 从 `config/product-agent.json.skills` 解析并验证该根目录，Desktop 与 Web Host 再把该绝对路径写入 `HARNESS_COMFYUI_SKILL_DIR`。`ComfyUI工作台预设` 和 `ComfyUI迭代预设` 的 filesystem provider 都使用 `includeDefaultRoots: false` 和唯一的 `customSkillDirs` 表达式读取该目录，因此默认采用 `ComfyUI工作台预设` 或显式采用任一项目 Preset 的 Session 都能够跨 Workspace 读取 Repository Skills；采用 `standard` 或其他非项目 Preset 的 Session 不会继承该 provider。Desktop 同时通过 `DSH_AGENTS_HOME=<real HOME>/.agents` 保留 `standard` Preset 对其他用户 Skill 的读取。`anima-prompt-builder`、`krea2-anime-prompt-builder`、`wai-sdxl-prompt-builder`、`character-portrait-prompt-designer`、`comfyui-generate` 和 `comfyui-image-review` 通过各自文档定义的受管项目 CLI 查询所需的历史 Generation Run 数据。`local-image-reader` 按照自身 CLI 参考调用图片读取命令，读取用户指定绝对路径对应的本地图片。`comfyui-iterate-generation` 由主 Agent 调度构图、生成、独立观察和比较，按反馈小步修改 Prompt 直至画面目标达成。四个角色配置的 persona 分别定义构图、生成、观察和比较流程。project-iteration-dispatch.mjs 按角色配置的参数和模板组装首次与后续任务消息，调用原生 startContinuable 或 sendMessage；DSH 负责子会话执行与完成通知。主 Agent 分配结果路径并读取子 Agent 写入的文件。CLI 身份链路如下：

```text
前台 bash/pwsh ToolExecution
  → CliShellCapabilityStore 取得 Session、Turn、Call ID 与 cwd
  → shell environment 提供构建后的 CLI 路径、loopback URL 与短期 capability
  → .local/source-cli/harness-comfyui.mjs 提交业务参数
  → src/host/cli/route.ts 验证短期 capability
      → generation submit、run-inputs、resolve-media：通过 cwd 解析 Workspace 并校验 Session 归属
          → generation submit：GenerationRuntime.acceptGeneration(identity, request)
          → generation run-inputs：GenerationRuntime.readGenerationRunInputs({ workspaceId, runIds })
          → generation resolve-media：GenerationRuntime.readGenerationRunMedia({ workspaceId, runIds })
      → generation inspect-template-parameters、random-seeds：不解析 Workspace
          → generation inspect-template-parameters：GenerationRuntime.inspectTemplateRuntimeParameters({ templateId, instanceId })
          → generation random-seeds：CLI route 返回本次调用的普通随机 Seed 数组
  → image inspect：ImageReaderService.inspect(filePath, { prompt, signal })
```

ANIMA、Krea2 和 WAI Prompt Builder 的语义查询命令使用同一个前台 shell ToolExecution。`CliShellCapabilityStore` 向该调用提供插件内置语义查询客户端路径，以及 `harness-comfyui-source` Settings 中保存的数据源服务 URL 和端口。Skill 通过这些值直接执行内置语义查询客户端；该客户端先请求数据源服务的实时 discovery，再请求选定的语义查询路径。

`read_comfyui_run_inputs` Tool 从 Tool Call、Session cwd 和 workspace registry 派生当前 Workspace；CLI 查询从短期 shell capability 派生当前 Workspace。两条入口都只把 `workspaceId` 和用户提供的 `run_id` 交给 `GenerationRuntime.readGenerationRunInputs()`，不接受调用者提供的 Workspace ID、Session ID、Turn 或 Tool Call ID。

`GenerationRuntime.readGenerationRunInputs()` 要求一次查询包含 1 至 20 个字符串，并按照输入顺序逐项读取 Run Repository 的 `request_json` 和 Run 目录中的 Actual Workflow。Runtime 先检查当前 Workspace 中的完整 Run ID 精确匹配；没有精确匹配且输入是最少八个 UUID 字符的 canonical 起始片段时，Runtime 只在当前 Workspace 中读取最多两个前缀匹配。零个匹配返回 `GENERATION_RUN_NOT_FOUND`，唯一匹配返回完整 canonical `run_id`，多个匹配返回 `GENERATION_RUN_ID_AMBIGUOUS` 并要求调用者增加前缀长度。当前 Workspace 之外的 Run 不参与前缀唯一性判定。合法请求中的无效 ID、缺失 Run、歧义前缀、损坏请求或未分类读取故障只产生对应结果项；后续 Run 继续查询。取消信号终止整个查询。

`krea2-anime-prompt-builder` 使用自身 `references/generation-cli.md` 调用 `generation run-inputs --stdin`。用户只要求查询时，该 Skill 按 `runs[]` 顺序报告生成参数、Actual Workflow 状态和逐项错误；可用项使用 CLI 返回的 canonical 完整 `run_id`，错误项保留 CLI 返回的请求 `run_id`。用户还要求构建或修改 Prompt 时，该 Skill 完成查询后继续 Prompt 流程；用户明确要求复用某个可用结果时，该 Skill 读取该结果实际保存的 `arguments.parameters.positive_prompt`。该 Skill 不自动拆分查询，不调用 Python 生成器，也不创建批量输出文件。

可用结果项投影创建 Run 时传入 `generate_with_comfyui` 的 `title`、可选 `instance_id`、`template_id`、可选 `model`、完整 `parameters` 和 `loras`。历史请求缺少 `loras` 属性时投影空数组；该空数组只表示调用参数没有保存显式结构化 LoRA 选择，不能证明 Actual Workflow 没有预置或活动 LoRA。历史请求缺少 `model` 属性时不投影 `model`；该省略表示调用参数没有保存显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。Actual Workflow 可用时返回完整 JSON；准备失败、文件缺失或文件无效时仍返回生成参数，并通过 `workflow_status: "unavailable"` 和 `workflow_error` 说明 Workflow 错误。

同一个 shell Tool Call 的相同 Generation Request 重放同一个 Run；同一个 shell Tool Call 的不同 Generation Request 返回 `RUN_REQUEST_CONFLICT`。创建多个独立 Run 时，每次 submit 使用不同的前台 shell Tool Call，因此 Host 为每次调用保存不同的 `call_id`。

`comfyui-generate` 按自身 CLI 参考文档规定的 Catalog 入口使用固定 search 请求，读取数据源服务当前返回的 ComfyUI 实例目录；每个实例结果项只向 Agent 投影 `id`。该 Skill 再按 CLI 参考文档规定的 `generation submit --stdin` 入口，把当前查询的首个有效 ID 写入 Generation Request 的 `instance_id`。Host 不根据 Workflow、生成模型、LoRA、运行参数或已有 Run 记录选择实例。

`generate_with_comfyui` 在 Run Repository 持久化当前 Tool `callId` 后，使用插件内置数据源读取客户端从数据源服务读取实例和模板，再完成 `/object_info` 读取、运行参数解析、模型和 LoRA 映射以及 Official API Workflow 准备。上述阶段失败时，Tool Call 收到原始错误码和错误信息，失败 Run 同时保存该错误。准备成功时，Tool 返回 `run_id`；Host 内的 Generation Coordinator 继续异步执行 ComfyUI `/prompt` 提交、Jobs API 观察、远端结果处理和媒体保存。Host 停止时 coordinator 中止本地观察但不取消远端 ComfyUI 任务；Host 重启后从非终态 Run 继续观察。

Generation 编译链路分为参数语义和最终导出两个阶段：

```text
原始 UI Workflow + 请求参数
  → ComfyWorkflowCompiler 读取或复用 10 分钟进程内 /object_info 缓存
  → 修改 Actual Workflow，并生成运行时 API Workflow 投影
  → OfficialApiWorkflowCompiler 查找本地缓存
      → cache miss：NodeWorkerComfyFrontend 启动标准 Node.js Worker
          → ChromeComfyFrontend 调用目标实例官方 loadGraphData() 与 graphToPrompt()
      → cache hit：直接读取 Official Base API Workflow
  → Runtime Input Overlay 把非连接请求值写入官方基础对象的深拷贝
  → Comfy transport 把最终 API Workflow 提交给 /prompt
```

cache miss 时，Desktop Helper 通过 `NodeWorkerComfyFrontend` 启动 `.local/source-host/comfy-frontend-worker.js`。该标准 Node.js Worker 使用 `ChromeComfyFrontend` 完成浏览器启动、CDP session、前端 readiness、`loadGraphData()` 和 `graphToPrompt()`。Desktop Helper 通过版本化 stdin/stdout JSON 协议发送一份编译请求并接收结构化诊断和结果；实例 authorization 包含在标准输入的编译请求中，不进入进程命令行。

Worker 直接执行配置中的 Chrome 或 Chromium 可执行文件，不通过 macOS LaunchServices。每次浏览器会话使用独立临时 profile，并传入 `--use-mock-keychain` 和 `--disable-features=DialMediaRouteProvider`，防止 macOS 钥匙串与网络权限对话阻塞 headless 编译。Host 把每个 Worker 启动为独立进程组；调用者取消时，Host 先向该进程组发送 `SIGTERM`，Worker 协作清理自己的 Chrome 子进程和临时 profile。宽限期内没有退出时，Host 只对该 Worker 进程组发送 `SIGKILL`，不向用户的其他 Chrome 进程发送信号。

Source v0.86.1 TemplateBundle 只提供模板 ID、模板标题和 UI Workflow。`ComfyWorkflowCompiler` 不读取 Source 模板参数定义、参数绑定或输出节点过滤器。Generation Tool 把用户显式提供的运行参数键和值交给 compiler；compiler 使用当前 UI Workflow、目标实例 `/object_info`、节点输入名、节点标题、活动状态和上下游连线定位可写 widget。参数键中的节点 ID 后缀可以选择同类控件；两个参数用不同值占用同一 widget 时终止编译。

`ComfyWorkflowCompiler.inspectRuntimeParameters()` 与 `compile()` 共享同一个私有 runtime-parameter plan。检查方法把非尺寸参数及其实际合同投影到 `parameters`，把能够控制全部活动图片输出最终可见尺寸的末端精确尺寸、Selector 或可确定像素尺寸的 preset 投影到 `size_candidates`。活动图片输出必须是 `/object_info` 标记的活动 output node，并且通过已连接的 `IMAGE` 输入或 `IMAGE` 类型连线接收图片；只接收 `COMBO`、字符串或其他非图片数据的辅助 output node 不参与图片尺寸判定。输出路径中的下游独立 resize 或 upscale 尺寸会覆盖上游尺寸；检查结果删除被覆盖的上游候选，并在下游尺寸可写时返回带精确节点后缀的参数 ID。没有一组尺寸控件能够控制全部活动图片输出时，检查结果不返回尺寸候选。检查方法不修改输入 Workflow，也不调用 Official API Workflow compiler。`SourceGenerationPreparer`、`GenerationRuntime` 与 managed CLI 只转交模板、显式实例和检查结果，不复制 Workflow 参数发现与配对逻辑。新模板只要 Source 返回有效 Workflow 且目标实例能够解析该 Workflow 就可以接受检查，不依赖静态模板能力白名单。

compiler 为每个已解析的运行参数目标建立明确的节点输入合同。`INT` 只接受有限整数，`FLOAT` 接受有限整数或有限小数，两个数值类型都执行 `/object_info` 明确发布的 `min` 和 `max`。`STRING` 与 `AUTOCOMPLETE_TEXT_LORAS` 只接受字符串，`BOOLEAN` 只接受布尔值。compiler 不把字符串控件或整数控件的 `options` UI 元数据解释为服务端允许值集合。运行参数违反已知合同后，compiler 返回 `GENERATION_PARAMETER_INVALID`，错误信息包含运行参数键、目标 ComfyUI 节点输入、收到值和违反的类型、范围或候选值。

旧式候选数组和新式 `COMBO.options` 都使用 JSON 深比较。数组元素顺序必须相同；对象属性名称集合和每个属性值必须相同，但对象属性插入顺序不影响结果。候选值可以是字符串、数值、布尔值、`null`、数组或对象。只有候选值全部是字符串时，compiler 才允许唯一的大小写无关匹配并写入实例发布的精确字符串。多选 `COMBO` 要求运行参数是数组，并逐项验证每个成员。目标自定义控件没有发布 compiler 可以解释的合同时，compiler 只允许与 UI Workflow 当前值 JSON 深度相等的 no-op；改值返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`。

本地运行参数合同只覆盖目标实例通过 `/object_info` 公开且 compiler 可以解释的机器约束。本地合同校验通过后，目标 ComfyUI 仍会在接收 Prompt 时执行节点自定义 `VALIDATE_INPUTS` 或 V3 `validate_inputs` Python 校验；该自定义校验拒绝 API Workflow 时，Generation Run 返回 `COMFYUI_PROMPT_REJECTED`，错误详情保留目标 ComfyUI 的 `node_errors`。调用方必须根据具体节点 ID、输入名称和校验消息修正运行参数或 UI Workflow。本地 compiler 不复制、不执行并且不声称等价于这些自定义 Python 校验。

`COMFY_DYNAMICCOMBO_V3` 的选项必须发布唯一且非空的字符串 `key`，每个选项必须发布 `inputs.required` 和 `inputs.optional` 子输入描述。compiler 先解析同一次请求中的全部运行参数目标，再根据父控件和嵌套父控件的最终选项递归建立子输入合同。选中分支的必填未连接子输入必须存在序列化值；可选子输入可以缺省；已序列化或本次提供的可选子输入必须属于选中分支并符合该子输入合同；未选分支遗留的子输入会终止编译。compiler 在全部目标和动态分支通过校验后统一写入 Actual Workflow，因此运行参数在请求对象中的属性顺序不改变校验结果，失败请求也不会产生部分写入。

`ComfyWorkflowCompiler` 使用 `Response.text()` 读取 `/object_info`，并在 `JSON.parse` 阶段保存每个数值 token 的原始十进制文本。数值合同与嵌套候选值继续使用普通 JSON 值；独立数值元数据保存原始 token。compiler 根据运行参数实际 JSON 序列化的十进制 token 比较上下限和数值候选值，因此最大值 `9223372036854775807` 不会被 JavaScript 解析后的 `9223372036854776000` 代替。十进制比较统一处理符号、系数、小数位、指数、尾随零和正负零，并且不会按照指数值构造补零字符串。

`ComfyWorkflowCompiler` 按实例 ID 和实例 URL 在 Host 进程内缓存成功解析的 `/object_info` 10 分钟。节点定义对象和对应的数值 token 元数据组成同一个缓存快照；首次读取、缓存命中、并发在途请求共享和 TTL 刷新不会拆分两者。相同缓存键的并发 compile 共享一个在途请求；不同实例 ID 或 URL 使用独立缓存项；请求失败或响应无效时不写入缓存。该缓存不持久化认证值或节点定义。

正向 Prompt 与负向 Prompt 使用采样路径的 `positive`、`negative` 输入和明确节点标题区分。compiler 优先匹配公开参数键和 Prompt 输入别名；没有名称候选时，compiler 从实时 `/object_info` 中选择类型为 `STRING` 且 `multiline=true`、没有输入连线并且下游执行路径符合目标 Prompt 极性的 widget。一个 Prompt 控件同时连接正向分支和零化负向分支时只暴露为正向 Prompt；断开执行路径的 Prompt 节点不覆盖具有下游执行连线的 Prompt 节点。精确 `width`、`height` 只修改唯一的 latent 构造 widget或其唯一上游标量控件；使用 `aspect_ratio` 与 `megapixels` 生成尺寸的 selector 不会被强制断开。目标不存在或仍不唯一时，compiler 返回包含具体参数键的错误；目标不唯一时，错误还列出候选 ComfyUI 节点输入。

实时输入定义为 `BOOLEAN` 且 UI Workflow 序列化值不是布尔值时，compiler 使用该输入定义中的布尔默认值；实时定义没有布尔默认值时终止编译。Seed、模型实例路径、标准 LoRA、Power LoRA、LoraManager、bypass 解析和活动输出节点筛选继续由该阶段负责。compiler 根据实时 `/object_info` 选择 `output_node: true` 且已满足必需输入的节点，并从运行时 API Workflow 投影删除未满足必需输入的输出节点；没有活动输出节点时返回 `WORKFLOW_COMPILE_FAILED`。Generation Runtime 保存 compiler 返回的活动输出节点集合，并把该集合交给 Comfy transport 筛选 Jobs API 输出。空 LoRA 选择保留 UI Workflow 保存的 LoRA 状态；非空结构化 LoRA 选择只修改活动 Loader，不激活 bypass Loader。compiler 不根据源尺寸自动改写独立下游放大尺寸。

`ComfyWorkflowCompiler` 产生的手写 API Workflow 现在只作为运行时 API Workflow 投影。Official Base API Workflow 才是最终执行节点集合、连接 tuple、虚拟节点和自定义 widget 序列化的权威来源。官方前端把某些字面量序列化为没有`class_type`、只有`inputs.UNKNOWN`和可选`_meta`的载体对象时，`OfficialApiWorkflowCompiler`只在一个合法执行节点输入以`[载体节点ID, 0]`引用该对象时，把载体值折叠进消费者输入并在严格结构校验前删除已消费载体。非零输出索引、未被合法执行节点引用的同形对象和其他无`class_type`对象均导致导出失败。Runtime Input Overlay 只替换官方对象中已经存在的同名非连接输入；当官方输入使用 `{ "__value__": ... }` 包装时，overlay 先确认该包装并只替换 `__value__`，不会把包装内形如 `["node-id", 0]` 的字面量数组解释为连接。Runtime Input Overlay 不替换官方连接，也不删除官方执行节点、额外节点或额外输入。官方前端导出、缓存读取或 Runtime Input Overlay 失败时，本次 Generation Run 明确失败，生产路径不会直接提交手写投影。

Official API Workflow Cache 的 identity 包含目标实例 ID、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希和参数化后执行结构哈希。执行结构哈希包含节点 ID、`class_type`、输入名称、连接 tuple 和非连接值类型，因此 bypass、连接断开和 Power LoRA 动态输入数量变化会产生新的缓存项；Prompt、seed、尺寸和权重变化复用同一基础对象。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。损坏或 identity 不匹配的缓存文件返回明确错误，不触发静默重编译。同一 Host 进程中的并发 cache miss 合并为一次官方前端导出。

非空结构化 LoRA 选择命中精确类型为 `Lora Loader (LoraManager)` 的活动节点时，compiler 同时更新 `text` 与结构化 `loras` widget。空 LoRA 选择不修改模板保存的 `text` 与 `loras`。最终官方输出中的数组包装由目标实例前端生成，因此非空选择对应节点的 `inputs.loras.__value__` 与本次 LoRA 名称、模型权重、CLIP 权重和 active 状态一致。

Comfy transport 向 `/prompt` 发送 API Workflow，并把同一 Run 的 Actual Workflow 放入 `extra_data.extra_pnginfo.workflow`，供读取 `EXTRA_PNGINFO` 的节点使用。Jobs API 完成响应中的 `type=temp` 预览不进入 Saved Media；`type=output` 图片或视频继续执行 descriptor 路径、响应媒体类型、大小和文件签名校验。

Run Repository 保存状态和索引；Run 目录保存每次运行独立的请求、来源快照、Actual Workflow 和 API Workflow；Saved Media 使用随机 `media_id` 的两级前缀分片。媒体预览内容、原文件下载与媒体所属 Actual Workflow 通过同一个 Harness HTTP 服务的 `/api/harness-comfyui/media/<media_id>/content|download|workflow` 提供。

Client 结果列把每项 Generation Media 链接到 `/api/harness-comfyui/media/<media_id>/view?session_id=<session_id>`，缩略图仍从该媒体的 `/content` 路由读取。Host 在返回查看页、媒体内容或下载响应前验证 HTTP 方法、Session、workspace 和媒体归属。查看页的启动数据只包含当前 Session 中每项媒体的媒体 ID、所属 Generation Run 的 `runId`、媒体类型、文件名、生成时间、同源内容 URL、查看页 URL 和所属 Run 保存的原始 `parameters.positive_prompt`；启动数据不包含完整生成请求、Actual Workflow、API Workflow 或远端实例认证信息。

Session Media Viewer 使用 `GenerationRuntime.queryMedia()` 返回的 `created_at DESC, output_index DESC, media_id DESC` 顺序。左侧按钮和裸 `ArrowLeft` 切换到较新媒体，右侧按钮和裸 `ArrowRight` 切换到较早媒体；首项与末项禁用对应方向并且不循环。页面切换媒体后使用 `history.replaceState()` 更新当前媒体 URL，刷新该 URL 后 Host 仍以同一媒体作为当前项。

媒体查看页 iframe 在初始渲染和每次媒体切换后，向父框架发送类型为 `harness-comfyui.session-media-viewer.current.v1` 且只包含 `type`、`mediaId` 和 `runId` 的当前媒体消息。DSH Desktop 主框架 Modal 只接收来源 origin 等于当前页面 origin、来源 window 等于当前媒体查看页 iframe、消息通过 `src/generation/contract.ts` 严格解析、`mediaId` 与 `runId` 对应当前 Session 同一项 Generation Media 的消息。合法消息更新 Modal 中 iframe 上方独立显示的完整 `run_id`；其他消息不改变 Modal 状态。

用户点击 Modal 主框架的独立复制按钮后，主框架使用浏览器 Clipboard API 写入当前完整 `run_id`；成功时按钮显示“已复制”，`aria-live` 播报已复制的完整值。Clipboard API 缺失或拒绝写入时，按钮显示“复制失败”，`aria-live` 分别要求用户手动选择已显示的完整值，或要求用户重试后仍可手动选择该值。复制 Promise 完成时，Modal 只有在同一个 Modal 实例仍然打开并且当前 `mediaId` 与 `runId` 都未变化时才更新状态；已经关闭的 Modal 或已经切换的媒体不会接收迟到结果。媒体查看页 iframe 不调用 Clipboard API，也不请求 `clipboard-write` 权限。

用户点击 Modal footer 的“下载原文件”按钮后，主框架使用临时锚点发起当前 `mediaId` 的同源 `/download?session_id=<session_id>` GET，并在触发 Chromium 原生下载后立即删除锚点。该路由使用 `GenerationRuntime.mediaContentPath()` 流式读取 `/content` 对应的同一个 Saved Media 文件，返回媒体记录中的 MIME、文件 `stat` 长度、`nosniff` 与 `attachment; filename*=UTF-8''...`；原文件名使用 UTF-8 RFC 5987/8187 百分号编码，不进入普通 `filename` 参数。Client 不读取媒体 Blob、不创建 Object URL、不打开新窗口，也不声称已经收到原生下载完成信号。查看页切换媒体后，父框架的当前媒体映射同时更新标题、Run ID 与下载目标。

页面用浏览器原生视频控件播放视频；图片和视频保持原始宽高比完整显示，不裁切内容。图片加载后，页面读取 `naturalWidth` 和 `naturalHeight`；视频元数据加载后，页面读取 `videoWidth` 和 `videoHeight`。上述值定义为媒体文件的固有像素尺寸，不使用 Generation Request 中的 `width` 或 `height` 推测。切换媒体时尺寸先显示“读取中”，零尺寸或媒体加载失败时显示“尺寸不可用”；已经被替换的媒体产生迟到事件时不得覆盖当前媒体的尺寸。页面在媒体下方逐字符显示保存的正面提示词或明确缺失状态。

## 图片读取与 Prompt 对比

`ImageReaderService.inspect()` 接收内部 `sessionId` 参数。`inspect_image` Tool 从 `exec.agent.session.id` 取得该值，受管 CLI 的 `image.inspect` 路由从已验证的 capability identity 取得该值；服务把该值传入 runtime 模型的 `prepared.stream()`。该参数不属于 Agent 可填写的 Tool schema、CLI 请求体或用户设置。

`GenerationRuntime.readGenerationRunMedia()` 接受一至二十个完整 `run_id` 或唯一规范前缀，按输入顺序查询当前 Workspace，并为每个输入返回独立的成功元素或错误元素。成功元素包含原始 Generation Request 参数和 Saved Media 的本地图片路径。DSH Tool `get_generation_run_media` 与受管 CLI 命令 `generation resolve-media --stdin` 复用该运行时方法，且两种入口都不调用视觉模型。

`ImageReaderService.inspect()` 一次读取一个本地图片路径，并从 `configuration.activeProfileId` 解析当前命名配置。DSH Tool `inspect_image` 与受管 CLI `image inspect --stdin` 都可以提供本次调用专用的 `prompt`；该值通过非空与长度校验后原样覆盖本次默认提示词，不修改 Settings。Tool 或 CLI 省略 `prompt` 时，服务使用活动配置保存的 `defaultPrompt`。

图片读取设置页分别维护 Host 返回的 `persistedConfiguration` 和 Client 当前表单的 `editorDraft`。已保存配置选择器只显示 `persistedConfiguration.profiles`；使用者选择已保存配置后，Client 通过 `activateProfile({ profileId })` 请求 Host 只修改 `configuration.activeProfileId`。新建或复制配置只创建 Client 草稿，保存成功前不会进入已保存配置选择器，也不会参与下一次图片读取。已保存配置或未保存配置存在修改时，保存并切换另一份已保存配置的请求通过一次 `saveProfile({ operation, activateProfileId, profile, ... })` 完成 Settings 提交。Settings scope 在草稿编辑期间报告另一份实际生效配置时，普通保存请求把该实际配置作为 `activateProfileId`，避免保存草稿时隐式撤销外部激活结果。

Host 使用同一设置修改队列串行处理保存、激活和删除请求。`operation: 'create'` 只追加不存在的配置 ID，`operation: 'update'` 只更新仍然存在的配置 ID；Host 在同一次 `settings.replace()` 中保存草稿、处理该配置的凭据动作并设置最终 `activeProfileId`。写请求发出后，Client 等待 Host 的权威结果；Host 已经返回成功配置时，Client 即使同时收到本地取消信号也采用该配置。

`ImageReaderRemoteService` 在 Typert Remote 边界把保存、激活和删除产生的 `ImageReaderError` 转换为 `TypertRemoteFailure`。Typert carrier 因此把具体业务错误码、错误消息和空 details 对象写入 Remote 失败结果；Client 不使用 carrier 的通用异常码替换图片读取设置业务错误码。

`prepareImageReaderInput()` 在两个 Provider 分支之前读取并验证 PNG、JPEG、WebP 或 GIF 文件。该函数在内存中把每一帧等比缩放到原宽高的 70%，再按输入文件签名对应的格式重新编码；整数像素使用长边四舍五入和最小一像素规则。PNG、WebP 与 GIF 保留 alpha 通道，动画 GIF 与动画 WebP 保留帧数、各帧延时和循环次数。该函数不覆盖原图，也不创建磁盘临时文件。

`runtime` 配置把缩放后的同格式图片保存为 Harness Attachment，再使用配置中的系统 Provider、模型、`temperature` 和最大输出 Token 准备独立 LLM 调用。`openai-compatible` 配置不经过 Harness LLM Runtime 或 Attachment Store；Host 把缩放后的同格式图片编码为使用对应 MIME 类型的 Data URL，向配置的完整 Chat Completions 地址发送模型 ID、提示词、`temperature` 和 `max_tokens`。OpenAI 兼容适配器只解析 Chat Completions 的 HTTP JSON 传输外壳，并把 `choices[0].message.content` 当作普通字符串；runtime 适配器也直接收集普通模型文本。两种适配器都不要求或解析模型文本中的 JSON。`inspect_image` 在模型调用完成后把普通字符串包装为包含 `provider`、`model`、`file_path` 和 `observation` 的结构化 Tool 结果；CLI stdout 继续输出同一对象的 JSON，其中 `file_path` 仍指向用户原图。OpenAI 兼容响应体的声明长度与实际流式累计长度都不能超过 1 MiB，读取响应体和解析传输外壳时继续传播调用者取消。

API Key 作为 `credentials.<profileId>` Settings secret 保存，Client 收到的凭据状态只包含每份配置的 `hasApiKey`。OpenAI 兼容配置的 `keep` 保留已有 API Key，`replace` 写入新值，`clear` 删除已有值。删除已保存配置时，Host 同时删除对应凭据；删除活动配置时，Host 优先激活原列表中的后一项，不存在后一项时激活前一项。新 namespace 尚无用户值时，Host 把旧单配置 namespace 的用户 Provider、模型、提示词、`temperature` 和最大输出 Token 迁移为一份 `runtime` 配置。

`ImageReaderService`、Tool 和 CLI 都不读取 Generation Request 参数，也不比较或改写 Generation Prompt。

Runtime LLM stream 以 `error` 或非调用者 `aborted` finish 结束时，`ImageReaderService` 返回稳定错误码 `IMAGE_READER_PROVIDER_FAILED`。错误文案按固定顺序包含本次 profile 名称、profile ID、`runtime` 连接类型、Provider、模型、温度、最大输出 Token 数、finish kind、`LlmFailure.code`，并在 Provider 提供时追加合法 HTTP status、正数 `providerRetryAfterMs` 和 request ID。profile 名称、profile ID、Provider、模型、failure code 和 request ID 先替换非法 UTF-16、控制字符与 Unicode 行分隔符，再限制为 96 个 UTF-16 code unit；完整错误文案限制为 2048 个 UTF-16 code unit且不会执行尾部截断。

Runtime failure context 不读取或复制 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 或 `LlmFailure.message`。调用者 AbortSignal 已取消时，服务继续抛出 AbortError，不把调用者取消记录为 Provider failure。`inspect_image` Tool 与受管 CLI 原样传播 `ImageReaderError.message`，因此两种入口显示同一份本次调用诊断。

`local-image-reader` Skill 按自己的 `references/image-inspection-cli.md` 为用户提供的每个本地图片绝对路径分别调用一次 `image inspect --stdin`。用户指定本次观察重点、返回格式或读图提示词时，该 Skill 传递完整的本次 `prompt`；一般读图请求省略该属性并使用活动配置的 `defaultPrompt`。该 Skill 只返回视觉模型观察或单图读取错误，不查询 Generation Run，也不生成改进 Prompt。

`comfyui-image-review` Skill 按自己的 `references/cli.md` 先批量调用 `generation resolve-media --stdin`，再为每张图片分别调用 `image inspect --stdin`。用户指定本次图片观察要求时，该 Skill 把完整的本次 `prompt` 传给相关图片调用；未指定时使用活动配置的 `defaultPrompt`。执行该 Skill 的 Agent 使用原始参数与图片观察结果完成比较和 Prompt 改进，因此 Run 解析、图片读取和 Prompt 对比保持三个独立职责。
