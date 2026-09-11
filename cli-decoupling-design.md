# 内置 CLI 与 Desktop 解耦修复方案

本方案已经用户批准实施。修复范围包括本文规定的核心、CLI、展示层装配和纯 DSH 验收入口。

## 必须要实现的目标

实施 Agent 必须使内置 managed CLI 在纯 Node.js 与 DSH Profile 中完成 Catalog 查询、Generation 提交、运行参数查询、媒体路径查询和图片读取。该运行入口必须通过 DSH 公共接口取得 Session、Tool Call、Workspace、Settings、Attachment 和 LLM 服务。

实施 Agent 必须将 CLI 通信、Catalog/Generation 业务、图片读取和 Web 展示分开。图片读取的独立装配要求按“图片读取插件边界”执行。Desktop 与纯 DSH 入口必须复用同一份业务实现和 CLI 协议。纯 DSH 入口的构建、包解析和启动必须独立于 Desktop 安装目录、Electron、Renderer 和 Desktop WebServer。

本文将“纯 CLI”定义为普通 Node.js 命令行进程，以及运行在前台 DSH 进程内的项目业务服务。Agent 在 DSH 的前台 bash/pwsh Tool Call 中调用 managed CLI；DSH 继续管理调用身份和持久会话。Workflow 导出仍使用项目现有的外部 Chrome/Chromium 与 ComfyUI 官方前端。

## 问题与证据

本方案基于 main 提交 `4eece7355402b0780f3205f3a422d2bf4082bf3c`。用户给出的 [PR #49](https://github.com/fzfz/harness-comfyui/pull/49) 修复 `SourcePresetTip` 对 Settings 生效值的读取。直接涉及 CLI 的 [PR #50](https://github.com/fzfz/harness-comfyui/pull/50) 为 CLI route 添加 `desktopBrowserAccess: route-authenticated`，使请求通过 Desktop 的外层浏览器门禁。

| 文件或接口 | 已确认的问题及影响 |
| --- | --- |
| `scripts/cli/harness-comfyui.mjs` | 客户端本身使用 Node.js 标准库，但必须请求受管 endpoint；其独立运行能力取决于服务端装配。 |
| `src/host/plugin.ts` | `inject` 强制要求 `webServer`；同一 `apply()` 创建 Runtime、CLI、Remote、媒体路由和 coordinator，纯 DSH 无法单独加载业务能力。 |
| `src/host/cli/route.ts` | 同时承担 HTTP、capability 验证、Workspace 身份转换和业务分发，并声明 Desktop 专用路由属性。 |
| `src/host/image-reader/image-reader-host.ts` | Settings 注册函数与 Typert Remote 类位于同一模块；核心导入该函数时仍会加载 Remote 相关依赖。 |
| `scripts/production/cli-module.mjs` | 已经使用 Node.js 构建目标；构建函数可以复用，但当前运行入口的依赖准备与 Desktop 安装关联。 |
| `config/desktop-baseline.json` 与基线 Stable workspace 的安装包 | 当前固定 Desktop `2.0.9`、DSH `0.1.5-rc.1`，上游提交为 `94748d71134ad0912334ffbd420c1bfc0d421b49`。通过该 workspace 解析的 DSH 安装包没有 Desktop/Electron 直接依赖；旧目录链接不作为当前基线证据。 |
| DSH `0.1.5-rc.1` 的 `dsh-base` 与 `dsh-headless` composition | base 提供 shell environment、Settings、Attachment 等服务；headless 完成一次任务后调用退出接口。Workspace 在 Web composition 中另行注册。 |

当前基线安装位于主开发 checkout 的 `.local/upstreams/dsh-desktop-2.0.9-owned/dsh-plugin-desktop/`。从该 workspace 的 `package.json` 创建 Node.js `createRequire` 后，DSH、headless、shell-env 和 workspace 包均解析为 `0.1.5-rc.1`。已安装 shell-env 保留 `register()`、`collect()` 公共接口；headless 仍在任务结束后请求退出。实现与验收必须以这套安装包及当前基线配置为依据。

## 目标架构

```text
DSH 前台 bash/pwsh ToolExecution
  → DSH shellEnv 注入 CLI 入口、专用 endpoint、短期 capability
  → 普通 Node.js managed CLI
  → Node.js 专用 loopback HTTP 服务
  → 命令分发与 DSH 身份检查
  → Catalog / GenerationRuntime / ImageReaderService

harness-comfyui 插件包
  ├─ /core：Catalog 与 Generation 业务插件
  ├─ /image-reader：独立图片读取插件
  ├─ /cli：DSH 服务端 CLI 接入插件
  ├─ /web：DSH Web 服务端展示插件
  └─ /client：现有 DSH Client 插件

Desktop / Web Profile：装配 core、image-reader、cli、web，并加载 client
纯 DSH Profile：装配 core、image-reader、cli、cli-workspace、cli-runner
随附 Node.js CLI：调用 cli 接入层提供的 endpoint
```

实施 Agent 必须使用 `node:http` 在 `127.0.0.1:0` 建立 CLI 专用监听，由操作系统分配端口，在监听完成后把实际 endpoint 交给 shellEnv。该服务运行在当前 DSH 宿主进程内，生命周期由 Cordis 管理。Node.js 标准库提供所需的监听和关闭接口，参见 [HTTP server 文档](https://nodejs.org/api/http.html#serverlisten)。

专用服务必须复用现有 JSON 请求、成功 envelope、失败 envelope 和 capability 校验。实施 Agent 必须删除项目 CLI 对 Desktop WebServer 的注册及 `desktopBrowserAccess` 声明，将网页和媒体请求继续交给 Web 展示插件。新 CLI endpoint 仍使用当前 CLI 路径和环境变量名称，其端口由当前 DSH 实例决定。


## DSH 插件标准与包内归属

实施 Agent 必须在同一个 `harness-comfyui` 包中提供下表中的入口，并通过 `package.json.exports` 公开构建后的模块。`core`、`image-reader`、`cli`、`web` 是采用 DSH/Cordis 插件机制的服务端模块；`client` 继续采用现有 DSH Client 扩展机制。

| 包入口 | 源码归属 | 职责与服务依赖 |
| --- | --- | --- |
| `harness-comfyui/core` | `src/host/core/plugin.ts` 与 `schema.ts` | 注册 `harnessComfyuiCore` Cordis Service，持有 Catalog、GenerationRuntime、数据源 Settings 与 coordinator；使用 DSH tools、workspaceRegistry、settings。 |
| `harness-comfyui/image-reader` | 拟建 `src/host/image-reader/plugin.ts` 与 `settings-registration.ts`，复用该目录读图服务 | 注册 `imageReader` Cordis Service，拥有读图配置、凭据访问、Provider 调用与 `inspect_image` Tool；使用 DSH settings、attachments、llm、tools。 |
| `harness-comfyui/cli` | 拟建 `src/host/cli/plugin.ts`，复用并拆分该目录现有模块 | 注入 `harnessComfyuiCore`、`imageReader`、shellEnv、tools 与 workspaceRegistry，管理专用 HTTP 服务和 capability；Catalog/Generation 命令调用 core，`image inspect` 调用 image-reader。 |
| `harness-comfyui/web` | 拟建 `src/host/web/plugin.ts`，复用现有 Remote 与媒体模块 | 注入 `harnessComfyuiCore`、`imageReader`、webServer 及 Remote 所需的 DSH 服务，注册网页 Remote 与媒体路由。 |
| `harness-comfyui/client` | 现有 `src/client/index.tsx` | 通过现有 Client 服务与扩展位呈现工作台和设置页。 |
| 随附 Node.js CLI 程序 | 现有 `scripts/cli/harness-comfyui.mjs` | 处理 argv、stdin、HTTP 请求及命令行输出，作为包内构建产物交给 DSH shell 执行。 |

实施 Agent 必须通过服务端插件的 `name`、`Config`、`inject` 和 `apply` 声明名称、配置、依赖与初始化行为，并通过 Cordis Service 和生命周期管理共享服务及资源。`harnessComfyuiCore` 的公开服务合同只暴露本次 CLI 与 Web 调用实际需要的业务能力；两个调用方必须使用同一个服务实例。

CLI 插件必须使用 `@deepseek-ai/dsh-shell-env` 的公共 `ctx.shellEnv.register()` 扩展点声明受管变量，通过 DSH ToolExecution 计算变量值，并按“身份、任务与配置生命周期”管理撤销。HTTP 通信、capability 协议和 ComfyUI 命令分发属于 `harness-comfyui/cli` 的自有实现；DSH 提供插件装配、生命周期、执行身份及 shell 环境扩展接口。

`package.json` 的 `dsh.bundle.patch` 必须继续指向根 `cordis.patch.yml`，根 patch 必须按依赖关系装配 `harness-comfyui/core`、`harness-comfyui/image-reader` 与 `harness-comfyui/cli`。Desktop 和 Web 的 Profile patch 必须通过包根入口 `harness-comfyui` 插入 Web 插件，以满足 DSH ClientModuleRegistry 对包根名称的发现规则；`harness-comfyui/web` 导出同一插件。Client 继续通过现有 `dsh.client` 声明进入 Web composition。纯 DSH Profile 必须使用核心 bundle 与项目根 bundle，并加载 headless 参数服务及项目 `harness-comfyui/cli-runner` 任务入口。该入口必须在 Agent 发布前通过公共 `agentPresets.mount()` 挂载项目默认 Preset；Profile 必须停用 base 的全局 Agent 工具组件，由 Preset 提供本地工具。Profile 的 bundles 通过标准包元数据装配，`core`、`image-reader`、`cli` 和 `web` 子路径通过 Cordis patch 的插件 `name` 字段引用。

实施 Agent 必须同步调整现有根服务端导出 `src/index.ts` 及其所有仓库内调用方，使插件实例由上述 composition 统一创建。Desktop Profile 准备脚本与 `profiles/comfyui-workbench/` 必须显式保留 Web 展示插件的装配。纯 DSH 的构建与装配只解析实际使用的服务端入口；Client 元数据的存在不能使该路径加载 Web 产物。

## 图片读取插件边界

`harness-comfyui/image-reader` 必须作为同包内独立 DSH 插件入口装配。它与 core 平级，直接依赖上表列出的 DSH 服务。实施 Agent 必须使其在仅有这些 DSH 服务的 Context 中完成读图，依赖范围限定为读图所需模块，排除 Catalog、GenerationRuntime、Workspace registry、数据源客户端和 Web 展示模块。

图片读取插件必须拥有现有 `harness-comfyui-image-reader-profiles` Settings namespace 的注册、配置校验、保存、激活、删除、凭据访问以及已有旧配置迁移逻辑，并保留当前 namespace、配置 ID 和凭据引用。插件必须通过 `imageReader` Service 提供 `inspect`、模型目录查询及配置管理能力；公共请求与结果结构沿用 `src/image-reader/` 中对应合同，新增服务结构由该目录的 schema 文件统一定义。该插件使用独立的读图配置，core 的数据源与生成配置由 core 管理。现有 Host 的 `imageReaderDefaultModel` 初始化选项必须移交读图插件的 `Config`，由 composition 传入原有默认值。

实施 Agent 必须把 `src/host/image-reader/image-reader-host.ts` 中的读图配置与模型目录业务迁入插件服务，保留其 Remote 适配部分供 web 装配。`src/host/image-reader/image-reader-service.ts` 继续负责读图调用，`image-reader/plugin.ts` 负责服务初始化、Tool 注册与释放。`inspect_image` 必须由读图插件通过 `src/host/tools/register-project-tools.ts` 注册；core 使用同一注册辅助模块注册其余项目 Tool，各自只注册自身负责的 Tool。实施 Agent 必须拆分当前 `src/host/image-reader/image-reader-tool.ts` 中的读图 Tool 与 Generation 媒体查询 Tool，使两者分别归属读图插件和 core 的模块。

CLI 的 `image inspect --stdin` 必须直接调用 `imageReader.inspect`，并传递当前 Session ID、文件路径、Prompt 和取消信号。读图插件必须使用 DSH Attachment 与 LLM 支持系统 Provider，并保留现有 OpenAI 兼容接口调用。Generation 媒体路径查询继续归 core；`comfyui-image-review` 的执行 Agent 先查媒体路径，再调用读图命令。

web 中的 ImageReader Remote 必须将配置操作、模型目录查询和读图请求委托给 `imageReader` Service。Client 的现有统一设置页继续显示数据源和读图两个页签，两个页签分别使用各自服务的配置。插件公共服务名 `imageReader` 与现有 ImageReader Remote namespace 必须分别保留各自职责，避免服务注册重名。

读图插件卸载时必须取消并等待自身活动读图请求，并释放自身注册的 Tool 和服务资源。其关闭行为必须独立于 Generation coordinator；完整产品的 CLI、Web 接入必须先结束对该服务的活动调用，再释放读图服务。

## 模块与实施顺序

| 执行顺序 | 实施 Agent 的改动对象与动作 | 产物与完成条件 |
| --- | --- | --- |
| 1 | 按“DSH 插件标准与包内归属”创建 core、image-reader 插件与各自 Service；按“图片读取插件边界”迁出读图 Settings 和模型目录业务。 | 两个业务插件各自只要求实际使用的 DSH 服务；读图插件可在没有 core 与 Web 的 Context 中单独加载。 |
| 2 | 创建 cli 插件入口，把 `src/host/cli/route.ts` 中的业务分发与 HTTP handler 分开，并增加专用服务生命周期模块。 | CLI 插件按“DSH 插件标准与包内归属”入口表注入服务；所有现有命令通过新 endpoint 执行。 |
| 3 | 创建 web 插件入口，装入 Catalog、Generation、ImageReader Remote 与媒体路由；按前章调整根导出、包 exports 和 Profile composition。 | 各 Profile 按“DSH 插件标准与包内归属”装配；一个 Context 中各业务服务及其 Settings 只注册一次。 |
| 4 | 在 `profiles/` 增加纯 DSH Profile，在 `scripts/cli/` 增加前台准备与运行入口。复用 `scripts/profile/` 的 Preset 配置读取及 CLI/Host 构建函数。 | 提供拟定命令 `pnpm cli:run -- "任务文本"`，准备隔离 DSH home、项目 Preset 和核心产物，再执行固定 DSH 的 headless Profile。该准备入口只读取已准备的依赖环境。 |
| 5 | 为纯 DSH 增加 Workspace composition 与 Session 登记 component。 | 加载公开 `@deepseek-ai/dsh-workspace` 及其所需 storage 服务；真实根 Session 在首次 Agent step 前按 cwd 登记到 Workspace；子 Session 继续使用项目既有父子 Workspace 规则。 |
| 6 | 将纯 DSH 依赖来源与 Desktop baseline 分开，更新构建配置、测试和系统文档。 | 纯 CLI 构建只产出 core、image-reader、CLI 和已有编译 Worker；Desktop 构建另含展示层与 Client；依赖检查能够证明纯 CLI 路径的解析边界。 |

核心服务的共享结构必须由对应 schema 文件定义；新增跨模块服务合同拟放入 `src/host/core/schema.ts`，CLI 请求合同沿用 `src/cli/contract.ts` 并由对应 schema 统一其结构与约束。CLI 监听配置拟在 `config/schema.ts` 增加 `cliServer`，默认值写入 `config/base.json`，按现有 Configuration Profile 覆盖顺序读取。允许监听的 host 固定为回环地址，端口配置固定为 `0`；请求大小和停止期限等运行参数由结构化配置提供。CLI 产物路径继续从 `config/runtime-artifacts.json` 读取。

项目现有业务依赖仍由插件提供，DSH 公共 peer 由纯 DSH 环境提供。Profile 的装配方式按“DSH 插件标准与包内归属”执行。

## 身份、任务与配置生命周期

CLI 插件必须继续从真实 DSH ToolExecution 派生 Session ID、turn、callId 与 cwd。业务参数沿用当前请求合同，Workspace 必须通过 cwd 解析并验证 Session 归属。capability 在 Tool result 时撤销，插件卸载时清空全部 capability；前台 shell 的身份缺失和后台 shell 调用继续按现有规则拒绝发放。

完整 Profile 启动时，core 与 image-reader 插件必须分别初始化自身服务；CLI 插件必须等待两个服务就绪，再启动专用监听并注册 shellEnv，随后才允许 Agent 调用 CLI。完整 Profile 关闭时，CLI 插件必须停止发放 capability 和接收请求，CLI 与 Web 接入必须取消并等待各自活动调用；image-reader 插件随后按“图片读取插件边界”释放读图资源，core 插件停止 coordinator 并关闭 Runtime 和数据库。各插件必须通过 Cordis 生命周期释放自身已取得的资源，关闭等待期限采用配置值。实施 Agent 必须测试上述各阶段失败时的资源清理。

`generation submit` 仍在持久接纳 Run 后返回 `run_id`。同一 Tool Call 的相同请求重放同一个 Run，不同请求保持冲突语义。coordinator 在当前 DSH 进程存活期间推进任务；headless 完成任务并退出后，持久 Run 留待下次使用同一 DSH home 与业务目录启动时恢复。这与 ADR 0002、0005 和 0010 的异步运行、原生身份及状态权威保持一致。

需要一次 CLI 任务取得最终图片时，任务文本必须要求在该 Profile 内执行任务的 Agent 查询生成结果，并在取得最终结果后结束本轮任务。纯 CLI 集成测试必须覆盖“接纳后退出，再启动恢复”，以及“进程存活到结果完成”两种情况。

纯 DSH 实例必须使用自己的 DSH home、Run Repository、Run 目录、媒体和缓存目录。Desktop 实例继续使用其现有运行目录。Settings 继续由 DSH Settings 与 Credentials 管理，数据源地址每次请求读取生效配置，图片读取继续使用现有两种 Provider 路径和真实 Session ID。

## 依赖准备条件

实施 Agent 必须优先复用当前基线已安装的 DSH `0.1.5-rc.1` 与项目依赖，按仓库 worktree 规范准备依赖视图。开发与接口验证从基线 Stable workspace 解析公共包；当前环境具备 DSH，新增安装以实际依赖缺口为条件。

纯 DSH 验收必须在普通 Node.js 进程中装配所需插件，并记录实际解析的包版本与依赖路径。最终交付的纯 CLI 构建和运行配置必须直接解析 DSH 公共包，符合“必须要实现的目标”规定的安装独立性。实施 Agent 必须检查完整依赖图与构建脚本；安装目录位于 Desktop checkout 内这一事实，只说明本机依赖存放位置。

发现已有依赖不足以完成验证或准备独立运行环境时，实施 Agent 必须列出缺少包的准确版本、用途和安全审计意见，将待安装版本固化到对应包管理文件，并提交具体安装动作取得用户显式授权。安装地点必须位于单独批准的依赖准备目录，worktree 继续按仓库规定复用已准备的依赖。

Desktop 回归和纯 DSH 验收均以当前基线 DSH 版本为起点。缺少所需公共接口时，主 Agent 必须提交具体缺口及调整方案供用户决定。

## 验收清单

- [ ] image-reader 在仅装配其 DSH 依赖的 Context 中独立完成两种 Provider 的读图；其初始化和读图过程符合“图片读取插件边界”的依赖范围。
- [ ] core 在未装配 image-reader 时完成 Catalog/Generation 测试；产品完整 Profile 按声明装配读图插件，缺少必需插件时明确报告装配失败。
- [ ] 读图配置与模型目录经 Service、Tool、CLI 和 Web 适用入口保持一致；覆盖已有配置保留、保存/激活/删除、无效配置、Provider 失败、文件错误、取消及插件卸载；`inspect_image` 只注册一次。
- [ ] `package.json.exports` 公开本方案的四个服务端入口和现有 Client 入口；服务端插件使用 DSH/Cordis 的声明、依赖注入与生命周期接口。
- [ ] 根 bundle、Desktop/Web Profile 与纯 DSH Profile 的实际装配符合“DSH 插件标准与包内归属”；core 与 imageReader Service 各只有一份，cli 与 web 引用对应的同一业务实例，纯 DSH 路径只加载两个业务插件与 CLI 模块。
- [ ] 实施 Agent 在普通 Node.js 与独立 DSH 依赖环境中完成纯 CLI 构建和启动；依赖解析与运行进程均符合本文目标架构。
- [ ] 在未提供 webServer、Renderer 和浏览器 Remote 的 Context 中，core、image-reader 与 CLI 插件成功启动；缺少必需 DSH 服务时启动明确失败。
- [ ] 所有现有 CLI command 的成功输出、失败输出、stdin、stderr 与退出码保持合同一致；覆盖参数缺失、非法 JSON、大小边界和服务错误。
- [ ] 有效 capability 成功；缺失、错误、Tool 完成后和插件卸载后的 capability 均失败；错误 Workspace 归属失败；CLI 子进程无法通过业务参数指定其他调用身份。
- [ ] 根 Session 和迭代子 Session 在第一次 CLI 调用前完成真实 Workspace 登记；不同 Workspace 的 Run 互不可读。
- [ ] 真实 Node.js 子进程完成 Catalog、随机 Seed、模板参数、历史 Run、媒体路径和两种图片读取 Provider 的调用；受控 ComfyUI 测试完成 submit、持久化和恢复。
- [ ] 两个并行实例得到各自 endpoint、capability 与数据目录；启动失败、请求断开、停止和重新启动后资源均正确释放。
- [ ] headless 接纳后退出不会把 Run 误报为完成；同一数据目录的下一次前台运行能恢复该 Run；持续运行的任务能取得最终结果。
- [ ] 实施 Agent 更新 `tests/integration/cli-route.test.ts`、`cli-command.test.ts`、`host-plugin.test.ts`、`tests/unit/cli-shell-capability.test.ts` 及相关构建/合同测试，增加纯 DSH 真实 shell 集成测试。
- [ ] Client 保留当前基线的 `sidebar.right.pane.tab` 结果页接入，覆盖空白与已保存 Session、页签关闭隔离和媒体交互。
- [ ] 实施 Agent 按仓库规范运行完整 Desktop 开发实例，核对进程身份、所有监听端口、本次 Renderer 健康和插件安装记录；关闭普通浏览器访问时 CLI 使用专用 endpoint 成功，网页门禁行为保持正确，完成后停止实例。
- [ ] 实施 Agent 按 `docs/agents/comfyui-workbench-preset-and-skill-development.md` 的“真实模型验收”完成 Skill 读取与 shell 调用验收；Skill 执行者按下方参考文档对照读取相应文档，并执行其中的现有业务命令。
- [ ] 独立 Reviewer 完成所需代码与文档审阅；实施 Agent 在最终候选代码树上运行 `pnpm quality` 和 `git diff --check`，两项检查均通过。

## Skill 验收参考文档

以下路径均相对于 `.agents/skills/`，实施 Agent 必须按前述验收清单覆盖这些 CLI 使用入口。

| Skill | Skill 执行者首次调用前读取的文档 |
| --- | --- |
| `anima-prompt-builder`、`character-portrait-prompt-designer`、`wai-sdxl-prompt-builder` | 各自 Skill 目录中的 `references/generation-cli.md` |
| `krea2-anime-prompt-builder` | `references/generation-cli.md`、`references/semantic-query-cli.md` |
| `comfyui-generate` | `references/catalog-cli.md`、`references/generation-cli.md`、`references/template-parameter-inspection-cli.md` |
| `comfyui-image-review` | `references/cli.md` |
| `comfyui-iterate-generation` | `references/run-query-cli.md` |
| `local-image-reader` | `references/image-inspection-cli.md` |

## 非本次目标

自由终端直接指定 Session/Workspace 的独立业务客户端、独立后台 daemon、自动启动、生产数据迁移、Harness Core 修改、Desktop 上游门禁回退以及整体 DSH 版本升级，均属于另行决策的工作。发布和生产部署在代码验收后单独确认。

## 已获得的授权

用户已授权创建独立 worktree、调研问题与需求、设计修复方案，并要求批准后实施。用户随后确认使用 DSH/Cordis 标准插件机制，并要求将图片读取独立为插件，授权把这些职责划分写入本方案。当前 worktree 为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-cli-dsh-decoupling`，分支为 `codex/plan-cli-dsh-decoupling`。

用户通过 implement Skill 已授权实施 Agent 按本文边界修改本仓库的 core、image-reader 与 CLI 装配、Web 展示装配、Profile、配置、构建入口、测试和系统文档，并执行相应验证、独立审阅及当前分支提交。新增依赖的安装授权按“依赖准备条件”办理。若核对发现需要修改 Skill 自有脚本，主 Agent 必须先提交具体文件与修改内容取得显式授权。
