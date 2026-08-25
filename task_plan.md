# Harness ComfyUI 原型方案调研计划

## Goal
计划执行者使用 DeepSeek Harness `0.1.1-rc.2` 公开插件接口交付可运行的 Harness ComfyUI 插件；插件必须实现真实上下文选择、异步 Generation Run、分片媒体存储、逐媒体 Actual Workflow 下载和原生三列界面。

## Next Step
Phase 22 没有待执行工作；Harness 生产实例保持运行，等待用户验收真实运行与媒体结果。

## Current Phase
Phase 22 completed

## Phases

## Phase 22：实现真实 Generation Run、媒体存储与右列异步投影

### 必须要实现的目标

- 计划执行者必须先以提交 `e9f78b3` 保存当前 Harness ComfyUI 原型，后续实现提交必须能够与该基线比较和回滚。
- 计划执行者必须实现 `Session 1 → N Run`、`Run 1 → N Media`、`Run 1 → 1 Actual Workflow + 1 API Workflow` 的 SQLite 与文件系统持久化。
- 计划执行者必须为每个不同 Harness Tool `callId` 接纳一个独立 Run，并让相同 `callId` 的重复执行返回原 `run_id`。
- 计划执行者必须实现 Host 生命周期内的异步 coordinator、Source CLI TemplateBundle 读取、ComfyUI 提交/观察/输出下载 adapter 和非终态 Run 重启恢复。
- 计划执行者必须实现 Generation Run Typert Remote、按 `media_id` 返回媒体和所属 Actual Workflow 的同源 HTTP 路由。
- 计划执行者必须把右列静态任务和媒体替换为真实投影，并把 Workflow 下载图标从 Session 级 header 移到每张媒体卡片。
- 计划执行者必须使用 Harness `0.1.1-rc.2` 公开插件、Tool、Remote、WebServer 和原生 Client UI 接口；计划执行者不得修改 Harness 核心或数据源仓库。

### 已确认的 TDD Seam

- `GenerationRuntime.acceptGeneration(identity, request)` 是 Tool 接纳与幂等行为的公开 seam。
- `GenerationRuntime.advance()` 是持久 Run 状态推进与恢复行为的公开 seam。
- `GenerationRuns` 项目 Remote 是 Client 结构化查询的公开 seam。
- `/api/harness-comfyui/media/<media_id>/content` 与 `/api/harness-comfyui/media/<media_id>/workflow` 是浏览器文件响应的公开 seam。
- 右列 Harness Client slot 是任务卡、媒体卡和逐媒体 Workflow 下载交互的公开 seam。

### 验收清单

- 一个 Session 的同一数字 turn 内两个不同 `callId` 产生两个不同 Run 和两份不同 Actual Workflow。
- 一个 Run 的多个媒体都解析到该 Run 的 Actual Workflow；另一个 Run 的媒体不能下载前一 Run 的 Workflow。
- Tool 在 SQLite 持久接纳 `created` Run 后立即返回 `run_id`；Host coordinator 随后异步准备来源快照和两份 Workflow，ComfyUI 执行不阻塞 Tool Result。
- Host 重启后，已有 `prompt_id` 的非终态 Run 继续观察原 Job，`downloading` Run 继续保存未完成输出，`submitting` 且没有可靠 `prompt_id` 的 Run 进入 `submission_unknown`。
- 媒体原文件按随机 `media_id` 两级分片保存；SQLite 不保存媒体二进制；浏览器只能访问 SQLite 记录的相对路径。
- 右列任务按 Run 展示真实状态；右列媒体按 Media 展示真实文件；每张媒体卡片包含自己的 Workflow 下载图标；右列 header 不包含 Workflow 下载按钮。
- 目标单测、集成测试、类型检查、完整 `pnpm quality`、生产重启、生产健康检查和浏览器验收全部通过。
- `code-review` 的 Standards 与 Spec 两个独立审核结果没有未解决的阻断问题。
- 计划执行者提交最终实现到当前分支。

### 非本次目标

- 本阶段不实现跨进程分布式 worker、独立 HTTP 服务、对象存储、云端数据库或媒体 CDN。
- 本阶段不修改 ComfyUI、Harness 核心、`node_modules/@deepseek-ai/*` 或数据源仓库。
- 本阶段不新增未经安全审计和版本锁定的第三方依赖。
- 本阶段不把 Harness Jobs registry 作为 Generation Run 持久状态来源。

### 已获得的授权

- 用户已明确要求执行 Phase 21 已确认的完整方案。
- 用户已明确要求实现前提交当前工作树，提交 `e9f78b3` 已完成该回滚基线。
- 用户已指定 Harness `0.1.1-rc.2` 为实现权威，并授权修改、测试、提交和启动当前 Harness 插件。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 针对安装包的类型搜索只使用 `*.d.ts` 与 `*.ts`，没有命中 rc.2 发布包的实际构建扩展名 | 1 | 计划执行者改为先列出安装包真实文件，再按实际扩展名读取公开声明。 |
| 初次记录 Tool 身份时误把 Code Mode 外层 `rootCallId` 选为 Run 身份 | 1 | 用户不变量要求每次 Generation Tool 调用创建 Run；计划执行者立即改为使用当前 Tool `callId`。 |
| 第一条 GenerationRuntime green 测试通过后，TypeScript 没有从 `Array.isArray()` 正确缩窄只读 JSON 数组联合 | 1 | 计划执行者在对象分支显式收窄为只读 JSON record，不改变运行行为。 |
| SourceGenerationPreparer 首次 green 检查的 fixture 只提供一个 widget 值，但测试 binding 指向索引 1 | 1 | 计划执行者把 fixture 修正为与两个声明 binding 一致的两个 widget 值，并把 Workflow 类型收窄为必填 `widgets_values`。 |
| 生产源码加载首次失败于 Node strip-only 不支持 TypeScript constructor parameter property | 1 | 计划执行者把 Generation Host 类改为显式字段声明，并用 `prod:test` 锁定源码直接加载。 |
| 浏览器首次加载新增 Generation Remote 时，Typert 拒绝第二次注册同名 `harness-comfyui` package | 1 | 计划执行者新增单次 `$mount()` 回归测试，并把 Catalog 与 Generation descriptors 合并为一份 Remote contribution。 |

- **Status:** completed

## Phase 23：修复空白 Session 的右侧结果列

### 必须要实现的目标

- Client 插件必须在 Harness `0.1.1-rc.2` 的空白 Session 中显示可展开、可关闭的 ComfyUI 结果列。
- Client 插件必须在已保存 Session 中继续使用 Harness 原生 `details` 列。
- 空白 Session 与已保存 Session 只能各显示一个可见的 ComfyUI 结果列。

### 验收清单

- 空白 Session 点击“ComfyUI 工作台”后，右侧结果列的可见宽度大于 `0px`。
- 空白 Session 关闭右侧结果列后，右侧结果列不再显示。
- 已保存 Session 点击“ComfyUI 工作台”后，Harness 原生 `details` 列的可见宽度大于 `0px`，且 `shell.overlay` 结果列不显示。
- 新增测试覆盖空白 Session、已保存 Session、展开和关闭分支。
- `pnpm quality`、`git diff --check`、生产健康检查和浏览器验收全部通过。

### 非本次目标

- 本阶段不修改 Harness 核心源码或 `node_modules/@deepseek-ai/*`。
- 本阶段不修改 Generation Run、Media 或 Workflow 的 Host 数据合同。
- 本阶段不新增产品文案或第二套结果列交互。

### 已获得的授权

- 用户已要求修复当前无法打开的右侧列。
- 用户已授权继续修改、重启并验证当前 Harness 插件。

状态：已完成

### Phase 1: 检查两个仓库的现有接口
- [x] 计划编写者检查 DeepSeek Harness 的 Web 页面、插件、会话事件与 Skill 目录。
- [x] 计划编写者检查 NoobAI-XL-FZ-PROD-ENV 的查询 CLI、会话 Skill、管理 Skill、ComfyUI 实例与工作流模板数据。
- [x] 计划编写者把已确认的文件路径、结构化数据字段和缺口写入 findings.md。
- **Status:** completed

## Phase 21：设计真实媒体存储与异步 ComfyUI 运行链路

### 必须要实现的目标

- 计划编写者必须以 Harness `0.1.1-rc.2` 官方文档、已安装包和当前仓库 ADR/PRD 为证据，确定 Host WebServer、Typert Remote、Jobs、Tool 和 Skill 的责任。
- 计划编写者必须定义 `Session 1 → N Run`、`Run 1 → N Media`、`Run 1 → 1 Actual Workflow` 的持久化关联，禁止按 Session 共享 Workflow。
- 计划编写者必须给出 SQLite 表职责、媒体文件分目录结构、异步运行状态机、崩溃恢复策略、Client 投影与同源下载路由。
- 计划编写者必须给出可执行的实现顺序，优先交付一条单 Run 端到端纵向切片，然后扩展 Session 媒体库与任务列表。

### 验收清单

- 方案中的每个 Harness 能力都对应 `0.1.1-rc.2` 的公开导出或已安装包行为。
- 任意媒体只能通过自身 `run_id` 下载所属 Run 已持久化的 Actual Workflow。
- Skill 只指导 Agent 调用 Generation Tool；Tool 只在 Run Repository 接纳成功后返回 `run_id`；Host worker 负责后续观察、保存与恢复。
- 方案明确是否需要独立 HTTP 进程，并解释进程启停与非终态 Run 恢复。

### 非本次目标

- 本阶段不修改业务源码、数据库 Schema、生产配置或 Harness 进程。
- 本阶段不实际提交 ComfyUI 任务，不写入真实媒体。
- 本阶段不修改 Harness 核心、`node_modules/@deepseek-ai/*` 或数据源仓库。

### 已获得的授权

- 用户已授权计划编写者继续媒体存储、异步 ComfyUI 任务、Tool/Skill 与 Host 启动方案的调研与实现顺序设计。
- 用户已指定 Harness `0.1.1-rc.2` 为可实现性版本权威。
- 用户已明确同一 Session 可以有多次 Tool 调用和多份不同 Actual Workflow。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 首次记录 Phase 21 时使用了不存在的 `findings.md` 尾行作为补丁锚点 | 1 | 补丁未应用；计划编写者重新读取三个计划文件的真实尾部后使用精确锚点。 |

- **Status:** completed

## Phase 20：补充右侧结果抽屉的 Workflow 下载入口

### 必须要实现的目标

- 右侧“生成结果”抽屉必须提供原原型已有的 Workflow 下载入口。
- Workflow 下载入口必须使用 Harness `0.1.1-rc.2` 原生图标按钮，并在窄标题栏中保持可用。
- 下载动作必须生成浏览器可下载的 Workflow JSON 文件，不得修改输入框上下文 JSON 或结果抽屉状态。
- 新会话 root overlay 与已连接 Session 原生 details 必须共享同一个下载入口和下载实现。

### 验收清单

- 原原型中的 Workflow 下载位置和静态 Workflow 数据来源已经核对。
- 图标按钮具有“下载 Workflow”可访问名称和原生 tooltip。
- 点击图标按钮会产生一个 `.json` 下载，文件内容是结构化 Workflow JSON。
- 新会话与已连接 Session 的右侧结果抽屉均显示图标按钮。
- 目标测试、`pnpm run quality`、生产健康检查和浏览器实际下载验收全部通过。

### 非本次目标

- 本阶段不接入真实 ComfyUI Run、远端 Workflow 查询接口或按运行记录切换 Workflow。
- 本阶段不增加文字按钮、不修改右侧结果卡片布局、不改变中间输入框上下文 JSON。
- 本阶段不修改 Harness 核心源码或 rc.2 安装包。

### 已获得的授权

- 用户已要求补充原原型中的 Workflow 下载按钮，并允许使用图标以适配右侧容器宽度。
- 用户此前已授权修改、重启并验证当前 Harness 插件和生产实例。

- **Status:** completed

## Phase 19：让新会话页面实际显示右侧结果抽屉

### 当前进度

- 用户截图证明 Chrome 中当前选中的“新会话”页面只有左侧工作区列和中间新会话区域，右侧结果抽屉没有显示。
- 计划执行者正在建立新会话页面的确定性失败检查，并核对 Harness `0.1.1-rc.2` 对 unconnected 页面开放的原生布局插槽。

### 必须要实现的目标

- “新会话”页面点击中间“生成结果”按钮后必须显示右侧结果抽屉。
- 右侧结果抽屉必须继续使用 Harness `0.1.1-rc.2` 公开插件机制和原生 UI 组件。
- 已连接 Session 的三列布局、静态任务卡片、媒体筛选和分页必须保持可用。
- 计划执行者必须用用户截图对应的新会话状态和已连接 Session 状态分别完成浏览器验收。

### 验收清单

- 自动化失败检查能够在修复前识别“新会话点击生成结果后 details 宽度仍为 0”的具体症状。
- 新会话页面点击“生成结果”后能够看到右侧“生成结果”标题、关闭按钮、两个结果 tab 和静态内容。
- 点击“关闭生成结果”后右侧抽屉消失，再次点击中间“生成结果”后右侧抽屉重新出现。
- `pnpm run quality`、`git diff --check`、生产健康检查和 Chrome 实际页面验收全部通过。

### 非本次目标

- 本阶段不接入真实媒体结果、ComfyUI 异步任务 API、任务取消或媒体下载。
- 本阶段不修改 Harness 核心源码或 `node_modules/@deepseek-ai/*`。
- 本阶段不要求新会话页面在用户未点击“生成结果”时默认展开右侧抽屉。

### 已获得的授权

- 用户已要求修复当前截图中的新会话页面，使右侧列实际可见。
- 用户此前已授权修改并重启当前仓库的 Harness 插件和生产实例。

- **Status:** completed

### Phase 2: 定义原型页面与模块接口
- [x] 计划编写者定义三个结构明显不同的 UI 原型变体。
- [x] 计划编写者定义会话、上下文选择、Skill 调用、ComfyUI 任务和媒体产物的领域对象。
- [x] 计划编写者定义 DeepSeek Harness、数据查询 CLI、ComfyUI 任务模块和媒体目录模块之间的接口与事件顺序。
- [x] 计划编写者定义生产实现阶段的目录、测试范围和迁移顺序。
- **Status:** completed

### Phase 3: 语义独立审核
- [x] 独立审核队员检查方案中的每个名词是否已经定义。
- [x] 独立审核队员检查每个需求是否映射到具体页面区域、模块接口或阶段产物。
- [x] 独立审核队员检查方案是否混淆计划执行者、Skill 执行者、DeepSeek Harness Agent 和 ComfyUI 实例。
- **Status:** completed

### Phase 4: 交付讨论稿
- [x] 计划编写者根据独立审核清单修改讨论稿。
- [x] 计划编写者向用户提交推荐方案、备选方案、待确认决策和下一轮原型产物清单。
- **Status:** completed

### Phase 5: 锁定变体 A 与 Workflow JSON 持久化边界
- [x] 计划编写者只读调研数据源系统的请求数据到本轮实际 Workflow JSON、API Workflow JSON、运行前持久化和浏览器下载链路。
- [x] 计划编写者把变体 A 改为已确认方案，并删除 B、C 的实现路径。
- [x] 计划编写者把第二个下载产物定义为由请求数据和模板来源快照转换得到的本次实际 Workflow JSON；页面不下载原始请求快照。
- [x] 独立审核队员复审两个 Workflow JSON 的名称、来源、持久化时点、页面下载边界和验收测试。
- **Status:** completed

### Phase 6: 实现变体 A 静态原型
- [x] 计划执行者创建零依赖 HTML、CSS 和浏览器 JavaScript 页面，并使用静态 fixture 表示会话、上下文、Harness Tool 调用、运行状态和媒体。
- [x] 计划执行者实现上下文分层选择、消息发送、Agent 流式文本、会话切换、右列标签和原型状态切换；Skill 选择继续使用 DeepSeek Harness 原生交互，不在本项目实现。
- [x] 计划执行者实现同一 Session 的多聊天轮次选择，并分别演示零个、一个和多个 `run_id` 的轮次关联。
- [x] 计划执行者实现本次实际 Workflow JSON 的浏览器 Blob 下载入口，并保持 API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用。
- [x] 计划执行者把“本会话结果”实现为按聊天轮次、媒体种类和保存时间筛选的固定尺寸媒体网格，并增加独立分页。
- [x] 计划执行者在静态原型中实现左侧“所有媒体”入口和居中跨会话媒体库；正式 Harness 实现接口由 Phase 10 单独审计。
- [x] 计划执行者为会话媒体库和全局媒体库的共用媒体卡片实现原文件新窗口打开和所属运行 Workflow JSON 下载。
- [x] 计划执行者只读探测数据源登记的两个 ComfyUI 实例，确认当前实例通过 Jobs API 列出、查询和取消单个 Job。
- [x] 计划执行者实现左侧“所有 ComfyUI 异步任务”入口、按会话/聊天轮次/创建时间筛选、独立分页和排队/运行中 Job 取消交互。
- [x] 计划执行者在浏览器中验证三列布局、原型状态、弹窗顶层行为、键盘关闭、焦点返回和下载文件名。
- [x] 独立语义审核队员检查页面文案、具体名词和用户需求覆盖。
- **Status:** completed

### Phase 7: 确认正式实现边界
- [x] 用户确认 Workspace 范围、Chat Turn 定义、Generation Run 持久化、Tool 接纳返回、数据源不可用行为和 ComfyUI Job 取消边界。
- [x] 用户确认当前仓库拥有独立 Harness bundle，项目使用 Harness 原生 Session/数字 turn/callId，并且只有实际 Generation Tool Call 创建 `run_id`。
- [x] 用户确认单用户安装、Host 前台 worker、Harness 原生 Skill 调用策略和 `submission_unknown` 显式新消息重提边界。
- [x] 用户确认一个 OpenAPI schema 投影 Agent Catalog CLI 与 Host 专用只读 Source CLI；本版本不认证其他本机进程。
- [x] 用户确认 Tool 调用时读取当前模板 bundle；本版本不设计选择时 revision 锁定或 revision 冲突。
- [x] 用户确认 ComfyUI 实例采用显式安全 ID 或 Host 配置默认值，显式实例不可用时不切换。
- [x] 用户确认当前安装使用一个 SQLite 保存运行元数据，运行文件按 Workspace 与 Run 分区。
- [x] 用户确认两个 discovery 返回同一契约身份，Host adapter 遇到不兼容版本时阻止对应数据源能力。
- [x] 用户确认异步运行状态只保存在 Run Repository，并且不把每次状态变化复制为持久 Harness Session 事件。
- [x] 计划编写者在设计树没有未决叶节点后发布实现规格 Issue #1。
- **Status:** completed

### Phase 8: 逐项处理 high dependency advisory
- [x] 计划执行者从只读原 DeepSeek Harness manifest 与 lockfile 取得当前 high advisory 原始报告。
- [x] 计划执行者把报告映射为 advisory 编号、受影响包、依赖链、计划 production closure、修复版本和来源证据。
- [x] 计划执行者逐项处理每个唯一 advisory，并记录精确升级或当前项目闭包排除结论。
- [x] 计划执行者在当前仓库创建精确版本依赖计划、七个受影响版本 override 和 lockfile 审计门禁。
- [x] 计划执行者重新运行完整闭包与 production 闭包门禁；两个范围的 critical、high、moderate 和 low 都为 0。
- **Status:** completed

### Phase 9: 审核 dependency build script 并完成正式依赖安装
- [x] 计划执行者从官方 npm registry 下载五个精确版本 tarball，并在不执行 lifecycle script 的隔离目录中检查文件清单、registry integrity、安装命令及其本地调用链。
- [x] 计划执行者分别完成五个精确版本的 lifecycle script 安全审计，并在 `allowBuilds` 中明确允许五个精确版本。
- [x] 计划执行者保留五个依赖包的完整安装行为，不使用 `allowBuilds` 裁剪 package lifecycle script。
- [x] 计划执行者完成 `pnpm install --frozen-lockfile`，并验证 pnpm 没有自动忽略未分类 build script。
- [x] 计划执行者重新运行完整依赖 audit、production 依赖 audit、27 项原型测试和工作区差异格式检查。
- **Status:** completed

### Phase 10: 审核 Harness 核心零改动与公共插件接口闭包
- [x] 计划编写者从指定 Harness commit 的已提交源码和 package exports 核对 Host plugin、Client plugin、AppFrame slots、Modal、输入引用、Typert RPC、Tool、Jobs、Skill 与媒体访问接口。
- [x] 计划编写者为 Issues #2–#15 逐票列出允许使用的已导出接口，并对没有对应 public plugin seam 的产品功能和原型 UI 在规划阶段直接写入阻塞结论。
- [x] 计划编写者把禁止修改 Harness 仓库、修改 `node_modules/@deepseek-ai/*`、deep import、vendor、`patch-package`、DOM 劫持和重建 Harness 核心交互的硬门禁写入父 Issue、各子 Issue 与对应 PRD。
- [x] 计划编写者为当前仓库增加能够证明 tarball-only composition 不依赖 Harness 源码目录或核心补丁的验收要求。
- [x] 独立语义审核队员检查本地规格和 GitHub Issues #1–#15；审核队员确认每张票的接口、实现主体、验收对象和阻塞行为明确。
- **Status:** completed

### Phase 11: 纠正默认UI限制被误判为插件阻塞
- [x] 计划编写者把Harness核心、上游随附UI插件与项目UI插件的责任直接写入ADR、父Issue、PRD和Tickets。
- [x] 计划编写者把项目UI固定为保留AppFrame root与ConversationRoot，并通过`priority: -10`替换公开`sidebar`、`details`、`conversation.session.header`、`conversation.view`的`chat` occupant和`conversation.composer.bar`。
- [x] 计划编写者确认ConversationRoot继续渲染`conversation.input.overlay`；项目composer原样渲染该overlay，并通过公开InputTriggerController连接Harness原生`/` Skill菜单。
- [x] 计划编写者保留原型规定的composer可见界面与产品行为：当前Session草稿、Message Context、一次发送、失败保留、成功清理和附件生命周期。
- [x] 计划编写者把Issues #3、#4和#6恢复为已验证public plugin机制可实现，并同步GitHub正文、标签和native依赖图。
- [x] 独立审核队员确认本地与远端不再包含错误阻塞，且每张票仍满足核心零改动、原型1:1与产品验收要求。
- **Status:** completed

### Phase 12: 补全Prompt、LoRA调整与ComfyUI生成Skills的可执行迁移方案
- [x] 计划编写者逐文件核对固定revision中的Anima Prompt Skill与WAI Prompt Skill，列出保留、改写和删除责任。
- [x] 计划编写者逐文件核对来源系统`management-skills/lora-adjustment/`，冻结`lora-adjustment`在Harness中的安装目录、输入、输出、Catalog依赖、连续调整语义和黑盒验收。
- [x] 计划编写者核对Harness rc.7 Skill正文加载、reference读取、脚本执行与Tool调用能力，禁止假设来源宿主专用工具仍然存在。
- [x] 计划编写者冻结迁移后Prompt Skill读取普通用户正文与`generation-context.v1`快照的输入合同、Prompt输出格式、失败行为和逐文件迁移清单；两个Prompt Skill不创建Generation Run。
- [x] 计划编写者冻结独立`comfyui-generate`Skill读取模板、Execution Route和显式运行参数的合同，以及它调用Generation Tool的唯一顺序。
- [x] 计划编写者同步PRD 04、PRD 05、PRD 12、原型方案、受影响Ticket草稿与GitHub Issues，并保证执行者不承担研究或设计决定。
- [ ] 独立语义审核队员确认计划执行者不需要重新调研、解释旧宿主合同或设计迁移方案。
- **Status:** in_progress

### Phase 13: 删除移动端范围并核对桌面列宽
- [x] 计划编写者把父Issue、Tickets 02–14与对应PRD的移动端、窄屏single-panel和九viewport要求删除，验收尺寸只保留`1440×1000`。
- [x] 计划编写者把本地父Issue与Tickets 01–14完整同步到GitHub Issues #1–#15，并逐票验证远端正文与本地来源一致。
- [x] 计划编写者核对rc.7 AppFrame默认列宽、公开`ILayout`方法与slot declaration/render ownership。
- [ ] 用户决定是否接受AppFrame默认桌面列宽作为原型可见例外；如果不接受，当前rc.7公共插件机制与“不得实现第二套Skill菜单”约束共同构成Ticket 02阻塞。
- **Status:** in_progress

### Phase 14: 正式采用源数据仓库 v0.82.2 envelope
- [x] 在唯一结构化合同文件中冻结 v0.82.2 Catalog/Source discovery、成功响应、错误响应、CLI 退出码和字段映射。
- [x] 同步 CONTEXT、ADR、Configuration Profile、PRD 01/03/04/05、父 Issue 和 Tickets 03/04/05/12/13 的旧 wrapper、旧 Schema 校验和旧模板字段。
- [x] 将 `expected_output_node_ids_json: null` 定义为不限制输出节点；Workflow compiler 使用目标 ComfyUI 实例 `/object_info` 中 `output_node: true` 的活动节点，不按节点名称猜测。
- [x] 回读并核对 GitHub Issues #1–#14 的可执行正文；只发布 v0.82.2 envelope 的消费规范，不修改源数据仓库。
- **Status:** completed

### Phase 15: 将工作台原型直接实现为 Harness rc.2 插件并运行验证

#### 必须要实现的目标
- [x] 计划执行者必须读取用户指定的 DeepSeek Harness `develop/basic/` 官方文档、`dsh-v0.1.1-rc.2` 的 package exports 与已提交 Harness 源码，再为每个新增或保留的原型 UI 元素记录可实现的公开接口证据。
- [x] 计划执行者必须读取 GitHub Issues #3 和 #4 的正文、评论、标签与失败结论，并删除原型中依赖失败设计的界面和交互。
- [x] 计划执行者必须先调研并记录 `0.1.1-rc.2` 精确依赖版本的发布元数据、peerDependency、lifecycle script与安全 advisory，再把当前项目的 DeepSeek Harness 依赖闭包升级到精确 rc.2版本。
- [x] 计划执行者必须在真实 Client plugin中向 `sidebar.footer.action`增加“ComfyUI 工作台”原生入口；用户点击入口后，插件必须切换非持久工作台状态，并在当前原生Session的中列显示工作台上下文扩展。
- [x] 计划执行者必须保留原生 AppFrame、SidebarRoot、ConversationRoot、Chat view与 InputBar；项目不得注册 root、top-level sidebar、top-level conversation、`conversation.view#chat`或`conversation.composer.bar`替代项。
- [x] 计划执行者必须向 `conversation.input.dock`注册上下文扩展；中列输入区上方必须同时显示“插入上下文”按钮和从原生 InputState读取的已选上下文展示。
- [x] 计划执行者必须覆盖插件成功、拒绝、清理和错误分支测试；随后使用 `pnpm prod:start/status/health/logs`启动真实Harness，并在 `1440×1000`浏览器页面验证入口、Session打开、原生中列和上下文扩展。

#### 验收清单
- [x] 每个原型可见界面元素都能映射到官方文档、`dsh-v0.1.1-rc.2` 的 public export、公开 slot/service 或 Harness 源码中已经存在的原生组件。
- [x] 左列“ComfyUI 工作台”入口能够进入和退出非持久工作台状态；左列没有替换原生 Session浏览区或 Settings，也没有创建第二套Session导航。
- [x] 中列完全由原生会话 header、Chat view和 InputBar渲染；输入区上方同时显示“插入上下文”按钮与一个或多个已选上下文标签，原生 Skill、图片、Model、Permission与发送路径保持可用。
- [x] Issue #3 与 #4 中已证明无法实现的设计没有出现在修改后的原型中。
- [x] `pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm prod:test`、`pnpm quality`与 `git diff --check`通过；真实 `prod:health` 与浏览器验收通过后进程被停止。

#### 非本次目标
- 本次任务不修改 DeepSeek Harness 核心源码、`node_modules/@deepseek-ai/*` 或外部源码目录。
- 本次任务不实现后端 ComfyUI调用，不修改 GitHub Issue正文或标签，也不恢复静态原型的三列 1:1复刻要求。
- 本次任务不重做 Harness 原生 Session、Skill 菜单、Agent 消息或 Tool trace 机制。

#### 已获得的授权
- 用户已经授权计划执行者修改当前仓库中的现有 ComfyUI 工作台原型及其必要测试和本地说明。
- 用户已经授权计划执行者只读访问官方开发文档、GitHub Issues #3/#4、当前项目依赖与本机 Harness 源码，用于证明原型可实现性。
- 用户已经明确指定 DeepSeek Harness `0.1.1-rc.2` 作为本次原型可实现性基线。
- 用户已经授权计划执行者把原型直接实现为当前仓库 Harness plugin，并启动真实 Harness完成可行性验证；该授权包含完成上述目标所必需的精确 rc.2依赖升级。

- **Status:** completed

### Phase 16: 接入数据源CLI并完成原生上下文选择器

#### 必须要实现的目标
- [x] 计划执行者必须读取当前配置指向的数据源CLI文件、数据源仓库发布合同与当前Host插件边界，确定搜索请求、资源类型、分页参数、成功响应和错误响应的唯一结构化合同。
- [x] Host插件必须通过已配置的`imagegen-semantic-query` CLI读取真实候选数据；Client不得直接运行CLI，也不得读取数据源仓库文件或数据库。
- [x] 当前项目必须直接声明 Harness `@deepseek-ai/dsh-typert-protocol@0.1.1-rc.2`，并通过其公开 Remote Service、Remote descriptor和`ctx.remote.$mount()`完成Host到Client调用；依赖更新不得执行生命周期脚本。
- [x] Client插件必须在原生Modal中实现资源类型左列、搜索输入、候选列表、选择状态和插入操作，并通过原生`SessionInput.setDraft()`把选中记录的结构化JSON写入当前InputBar。
- [x] 产品界面必须只显示产品名称、数据和必要操作；界面不得显示实现机制、开发说明或交互解释。
- [x] 测试必须覆盖CLI成功、空结果、非零退出、无效响应、搜索更新、资源类型切换、选择、插入、关闭和插件清理分支。
- [x] 计划执行者必须重启真实Harness，并在`1440×1000`页面用数据源CLI返回的真实记录验收搜索、左列切换、选择、插入与原生InputBar共存。

#### 验收清单
- [x] 弹窗左列显示数据源CLI支持的资源类型；搜索只查询当前资源类型；候选列表来自真实CLI响应。
- [x] 用户选择候选记录后，“插入”把该记录的结构化JSON写入Harness原生草稿；Dock显示可移除标签，用户移除标签时同步删除对应JSON且保留普通正文。
- [x] CLI错误使用唯一错误码映射为简短产品错误文案；CLI错误不会写入输入框，也不会保留错误选择状态。
- [x] 插件不注册`root`、top-level `sidebar`、top-level `conversation`、`conversation.view#chat`或`conversation.composer.bar`。
- [x] `pnpm quality`、`git diff --check`、真实`prod:status`、真实`prod:health`与浏览器验收全部通过。

#### 非本次目标
- 本次任务不实现ComfyUI生成、任务管理、媒体库、数据源编辑或数据库写入。
- [x] 计划执行者必须按已确认原型恢复上下文弹窗的信息架构：顶部底模下拉框、左侧资源类型列表、右侧带封面与标题的候选卡片、搜索、分页和多项选择。
- [x] 计划执行者必须通过真实CLI读取底模和候选资源；底模只作为支持该筛选参数的资源查询条件，不插入消息上下文。
- [x] 计划执行者必须在真实Harness中验证底模切换、资源类型切换、搜索、分页、多项选择、取消和批量插入。
- 本次任务不修改数据源仓库、Harness核心源码或`node_modules`。
- 本次任务不新增Harness之外的第三方依赖，不恢复失败Issue #3/#4的整页替换设计。

#### 已获得的授权
- 用户已经授权计划执行者修改当前仓库的Host插件、Client插件、测试与必要结构化合同。
- 用户已经授权当前仓库运行配置中声明的数据源CLI作为只读数据源。
- 用户已经授权计划执行者重启并保持真实Harness进程，用于完成页面验收。
- 用户已经授权计划执行者按锁定的 Harness `0.1.1-rc.2` 机制实现插件；计划执行者据此直接声明同版本 `@deepseek-ai/dsh-typert-protocol`，该包来自已安装的官方 Harness 发布、使用 MIT 许可证、没有安装脚本，且当前 lockfile 已包含该精确版本。

- **Status:** completed

## Key Questions
1. DeepSeek Harness 当前通过哪个 Web 插件接口向会话页面增加三列式工作台？
2. DeepSeek Harness 当前如何向浏览器发送用户消息、Agent 增量文本、Tool 调用和 Tool 结果？
3. NoobAI-XL-FZ-PROD-ENV 当前有哪些 CLI 命令能够查询底模、模板、LoRA、角色、画师、画师串、ComfyUI 实例和工作流模板？
4. 哪些会话 Skill 和管理 Skill 可以迁移，哪些实现依赖 NoobAI 系统仓库运行时？
5. ComfyUI 任务模块如何从内部请求快照和模板来源快照确定性生成本次实际 Workflow JSON，并从该文件编译实际 API Workflow JSON？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮只产出设计讨论稿 | 用户明确要求先设计和讨论方案。 |
| 原型采用 `$prototype` 的 UI 分支与新页面子形态 | 当前目标目录为空，目标问题是页面布局和交互，而不是后端状态机正确性。 |
| 讨论稿提供三个结构明显不同的变体，静态实现只保留变体 A | 用户已经选择变体 A；B、C 只保留为设计记录。 |
| 原型使用静态夹具并在页面显示完整状态 | 原型需要验证交互含义，不需要在讨论前连接真实数据库或 ComfyUI 实例。 |
| 数据源仓库只提供实例、模板和目录数据的只读 CLI | 用户明确要求异步运行、状态观察和媒体持久化不能写入数据源仓库。 |
| 当前仓库保存 `run_id`、内部来源快照、内部请求快照、本次实际 Workflow JSON、API Workflow JSON、状态和媒体 | 当前仓库必须成为 ComfyUI 运行和结果的唯一持久事实来源；数据源仓库不保存本项目运行产物。 |
| 页面只下载本次实际 Workflow JSON | 该文件由内部请求数据和模板来源快照转换并保留 ComfyUI 前端图信息。API Workflow JSON 仍由当前仓库持久化并实际提交 `/prompt`，但不注册浏览器下载。原始请求快照不作为下载产物。 |
| DeepSeek Harness 决定迁移后 Skill 的文件与工具可见性 | 迁移后的 `SKILL.md` 不沿用原仓库的宿主沙箱假设。 |
| 完善原数据源 CLI 并由 Harness Tool 提供给 Skill | 用户要求保留原 CLI 的数据提供责任，并通过 DeepSeek Harness 的工具机制调用。 |
| 一个权威 `schema/api/openapi.yaml` 投影两个只读 discovery/CLI 表面 | `imagegen-semantic-query` 只发现 Agent 安全 Catalog Operation；Host 私有 CLI 只发现 Source Operation。两个表面复用稳定 ID、revision、共用 schema 和错误结构，不创建第二个 schema manifest。 |
| Source Operation 本版本不做本机进程认证 | Source Operation 只通过 Host 专用的本机只读表面提供，Harness 不把它注册为 Agent Tool、Skill Tool 或浏览器 RPC；其他本机进程不属于本版本威胁模型。 |
| Tool 调用时读取当前模板 bundle | 用户选择模板后到 Tool 调用前的 revision 变化不属于本版本并发模型；Host 在 Tool 调用中读取一次当前 bundle，并把该结果保存为运行来源快照。 |
| ComfyUI 实例采用显式选择或配置默认值 | 用户可以选择安全实例 ID；未选择时 Host 使用配置默认实例。明确选择不可用时失败，不自动切换。 |
| 一个 SQLite 保存当前安装的运行元数据 | 每条记录包含 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id`；文件按 Workspace 和 Run 分区。 |
| 两个 discovery 返回同一契约身份 | Host adapter 只接受配置中声明支持的 `contract_id` 与 `contract_version`，不猜测或回退。 |
| Run Repository 是异步运行状态的权威来源 | Harness Session日志保存同一数字`turn`中的`comfyui-generate` Skill Invocation、原生Generation Tool Call与含结构化`run_id` meta的Tool Result；Client只通过项目unary Typert Remote读取。页面可见且中列Tool行或右列卡片观察非终态Run时，唯一`GenerationRunProjectionStore`继续轮询；两处同时可见时每周期只查询一次。 |
| `submitting` 崩溃恢复为 `submission_unknown` | 当前没有经过验证的远端业务幂等键，恢复流程不能安全自动重提。 |
| 依赖 advisory、build-script 与 frozen install 门禁均已通过 | 当前项目完整与 production audit 均为 0；`allowBuilds` 明确允许五个已经完成安全审计的精确版本，不裁剪依赖包的安装行为。 |
| 原 DeepSeek Harness 目录保持只读 | 用户指定该目录只供调研；正式宿主、Host 插件和 Skill 必须安装到当前仓库。 |
| Skill选择、发现与调用校验使用DeepSeek Harness现有交互 | 项目中列保留Harness原生composer、`ui-input-trigger`与`ui-skill`：用户输入`/`后由Harness显示Skill，选择后由Harness插入`/skill-name `。项目不调用SkillsApi重做菜单、不保存Skill选择状态，也不注册第二个Skill provider或invocation policy。 |
| Tool 调用详情归 DeepSeek Harness 轨迹功能所有 | 本项目右列只显示 ComfyUI 运行与媒体，不复制单一 Tool 的参数或结构化结果面板。 |
| 当前系统不迁移旧专用 LoRA Session，但必须迁移 `lora-adjustment` Skill | 用户在普通Harness Session中显式调用`lora-adjustment`取得Prompt、LoRA权重和触发词；该Skill不创建Run。用户随后显式调用`comfyui-generate`才创建ComfyUI运行。 |
| 底模是资源查询筛选条件 | 上下文选择器用底模 ID 筛选具有 `base_model_id` 关系的候选项；底模筛选值不写入消息上下文。 |
| 底模筛选器提供“全部” | 选择“全部”时，上下文目录查询不附加具体底模限制；底模仍不写入消息上下文。 |
| 全局媒体库使用项目Workbench左侧入口和居中弹层 | Issue #3注册到公开`sidebar`的项目occupant在搜索框之后、Session列表之前直接渲染“所有媒体”入口；媒体票使用Harness `Modal`呈现跨会话媒体库。 |
| 全局异步任务列表使用 ComfyUI Jobs API | 当前仓库保存 Harness Session ID、数字 `turn`、`run_id`、实例 ID 与 `prompt_id` 关联；服务使用 `GET /api/jobs/{prompt_id}` 观察任务，并使用 `POST /api/jobs/{prompt_id}/cancel` 取消指定的排队或运行中 Job。 |
| 原型不保留没有已实现行为的可见控件 | 每个可见按钮必须触发原型中能够核对的状态变化、导航、筛选、复制、下载或对话框操作。 |
| 项目Workbench保留AppFrame与ConversationRoot | 项目通过公开`sidebar`、`details`和conversation slots替换可见产品区域，保留ConversationRoot声明的`conversation.input.overlay`，因此不需要第二个root或第二套Skill菜单。 |
| 本版本只交付桌面布局 | 产品验收固定为`1440×1000`桌面三列及原型列宽关系；移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本。 |
| Composer状态所有权不是产品需求 | 原型只规定composer的可见结构、Message Context、发送与失败/成功行为；计划不得要求用户选择状态由项目store或Harness InputHub持有，也不得把默认InputBar路径写成唯一产品验收路径。 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 当前目标目录不是 Git 仓库 | 1 | 本轮只创建调研文件；用户确认方案后再确定仓库初始化与原型分支策略。 |
| 官方文档页面通过 Web 检索没有返回可读正文 | 1 | 不重复相同调用；后续用只读 HTTP 获取官方页面，并与当前项目锁定源码交叉核对。 |
| rc.2源码搜索中的未引用 `packages/client/ui-*` 被 zsh 解释为当前仓库glob | 1 | 后续只使用明确目录或引用后的 Git pathspec；该失败没有修改文件，其他同批只读命令正常完成。 |
| lockfile-only生成后 pnpm把未授权的占位键写入 `allowBuilds` | 1 | 计划执行者删除 `@deepseek-ai/dsh-subprocess-local: set this to true or false`占位键，保留已审计的精确 `@0.1.1-rc.2`许可，再重新运行三道preinstall门禁。 |
| 首次Client类型检查把Cordis Host的`SessionStore`声明解析到`ctx.sessions` | 1 | Client插件在边界处把`ctx.sessions`显式收窄为公开`ISessions`，运行时对象不变，之后`pnpm typecheck`通过。 |
| 首次测试补丁同时删除并新增`client-plugin.test.ts`，补丁工具拒绝同路径重复操作 | 1 | 改为原位更新测试文件；拒绝发生在应用前，没有部分写入。 |
| 首次定向测试直接加载原生primitives的CSS，且测试替身把Button图标与文字组成数组 | 1 | Client注册测试用无渲染primitives替身隔离CSS；surface测试的Button替身只投影文字，11项定向测试随后通过。 |
## Phase 17：精简 Agent 上下文 JSON

### 必须要实现的目标

- 插件必须从数据源仓库 CLI 的真实响应中提取 Agent 需要的名称字段、`prompt_text`、`id`、`tag`，并通过上下文类型说明每条 JSON 的语义。
- 卡片展示数据继续服务原生选择弹窗；写入 Harness 输入框的 JSON 只能包含上下文类型和 Agent 需要的数据。
- 已选上下文取消操作必须同步删除输入框中的对应 JSON。

### 验收清单

- 每条输入框 JSON 必须包含可识别上下文用途的类型字段。
- 生成模型和 LoRA 必须保留 `file_name`；作品、角色和画风必须保留 `name`；ComfyUI 模板必须保留 `title`。
- 角色上下文必须使用 `work_name` 和 `character_name` 分别表达作品名和角色名，并包含 `id` 与 `prompt_text`。
- 数据源存在的 `prompt_text` 和 `tag` 必须原值写入输入框 JSON。
- 输入框 JSON 不包含封面地址、卡片副标题或其他 Agent 不需要的展示字段。
- 角色卡片的 `label`、`subtitle`、`coverUrl` 只能用于 UI 展示，不能进入输入框 JSON。
- 类型检查、单元测试、生产检查和 Harness 浏览器交互验证全部通过。

### 非本次目标

- 本阶段不修改上下文弹窗的卡片布局、分页方式和原生组件选择。
- 本阶段不把完整数据源记录或 ComfyUI 工作流 JSON 写入 Harness 输入框。

### 已获得的授权

- 用户已授权直接修改并运行 Harness 插件。
- 用户已明确要求 Agent 上下文 JSON 只保留可理解的名称、`prompt_text`、`id`、`tag`，并要求每条 JSON 能表达插入用途和数据语义。

状态：已完成
## Phase 18：加载项目 Skill 并实现静态右侧抽屉

### 当前进度

- Harness 原生 `/` 菜单已经加载当前仓库 `.agents/skills` 中的三个 Skill。
- 右侧静态结果抽屉已经使用 Harness `details` 插槽和 `layout.openDetails()/closeDetails()` 实现并通过浏览器验收。

### 必须要实现的目标

- 计划执行者必须核对 Harness `0.1.1-rc.2` 文档、已安装包和本机源码，确定项目级 Skill 的发现目录、配置字段和 `/` 选择器加载条件。
- Harness 生产实例必须加载当前仓库 `.agents/skills` 中符合 Harness Skill 合同的 Skill，并在原生输入框输入 `/` 后显示可用 Skill。
- Client 插件必须通过 Harness `0.1.1-rc.2` 的公开原生 UI 组件和公开布局插槽实现右侧抽屉。
- 右侧抽屉展开后必须按旧原型的信息架构展示媒体结果、异步任务和相关静态详情；抽屉必须支持展开和收起。
- 右侧抽屉本阶段只能读取仓库内静态结构化夹具，不能查询真实媒体结果或异步任务。

### 验收清单

- 原生输入框输入 `/` 后能够看到 `.agents/skills` 中已安装且符合合同的 Skill。
- 右侧抽屉的展开、收起、媒体结果筛选、任务筛选和静态详情切换均有可见状态变化。
- 右侧抽屉使用 Harness 原生按钮、标签、菜单或其他公开组件；产品界面不显示实现说明和设计逻辑。
- 中列原生会话、上下文选择器、输入框、模型选择和发送路径保持可用。
- 新增代码包含各状态分支测试；`pnpm quality`、`git diff --check`、生产健康检查和浏览器验收全部通过。

### 非本次目标

- 本阶段不接入真实媒体结果、ComfyUI 异步任务 API、任务取消、媒体下载或跨 Session 媒体查询。
- 本阶段不修改 Harness 核心源码、`node_modules/@deepseek-ai/*` 或数据源仓库。
- 本阶段不创建第二套 Skill 菜单，也不替换 Harness 原生输入框。
- 本阶段不提供多个右侧抽屉变体；用户已经要求按旧原型布局与交互实现一个可验收版本。

### 已获得的授权

- 用户已授权计划执行者修改当前仓库的 Harness 配置、插件源码、静态夹具和测试。
- 用户已授权计划执行者重启并保持 Harness 生产实例运行，用于验证 Skill 菜单和右侧抽屉。
- 用户已授权右侧抽屉本阶段只展示静态媒体结果和异步任务数据，待样式确认后再接入实际功能。

- **Status:** completed
