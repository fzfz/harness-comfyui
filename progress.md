# Harness ComfyUI 原型方案进度

## Session: 2026-08-20

### Phase 1: 检查两个仓库的现有接口
- **Status:** completed
- **Started:** 2026-08-20
- Actions taken:
  - 计划编写者读取 `$prototype`、`planning-with-files` 和 `codebase-design` 的完整入口说明与本任务所需参考文件。
  - 计划编写者确认目标目录为空且不是 Git 仓库。
  - 计划编写者确认两个数据来源仓库都存在用户未提交修改，本轮只执行只读检查。
  - 计划编写者搜索相关历史调研记录并把静态结论标记为待当前仓库验证。
  - 计划编写者读取 DeepSeek Harness 根目录、packages 目录和 Web 包的开发约束。
  - 计划编写者列出数据源仓库现有 ComfyUI、会话和 Pi Skill 相关模块。
  - 计划编写者确认 DeepSeek Harness 提供会话节点、附件、Skill、任务、交付物和工作流运行的浏览器扩展包。
  - 计划编写者确认 DeepSeek Harness 的业务会话节点可以使用稳定业务 ID 关联持久事件并支持顺序重放；后续设计决定不把该能力用于复制 Generation Run 状态。
  - 计划编写者确认 DeepSeek Harness 已实现三列布局、Skill 斜杠触发器和输入引用 chip。
  - 计划编写者识别 `details` 单占用 slot 与现有工具详情面板之间的布局冲突。
  - 计划编写者确认输入引用 chip 能够在发送时通过异步 codec 生成模型文本，并在序列化失败时阻止发送。
  - 计划编写者排除“先调用注入 RPC、再调用普通 prompt RPC”的双请求方案，因为第二个请求失败时会遗留未配对上下文。
  - 计划编写者读取当前运行中的语义 OpenAPI，并确认现有 CLI 只提供四类语义查询。
  - 计划编写者读取数据源 SQLite 表结构和 ComfyUI 工作流运行参数契约，并识别视频与音频能力缺口。
  - 计划编写者统计当前生产目录数据规模，并确认画师串空集合是实际数据状态。
  - 计划编写者确认指定生产 checkout 不含已在后续主仓库合并的管理 Skill 文件。
  - 计划编写者确认 Harness 通用后台任务注册表只能承担进程内观察，不能替代当前仓库需要实现的持久 ComfyUI 运行数据库。
- Files created/modified:
  - `task_plan.md`（新建）
  - `findings.md`（新建）
  - `progress.md`（新建）

### Phase 2: 定义原型页面与模块接口
- **Status:** completed
- Actions taken:
  - 三名独立接口设计队员分别提交极简接口、常用场景接口和可扩展接口方案。
  - 计划编写者比较三套方案后定义 `GenerationCatalog`、`ComfyuiSourceCatalog`、`GenerationRuns` 和 `generate_with_comfyui`。
  - 计划编写者定义稳定工作台、命令面板和运行检查器三个 UI 原型变体。
  - 计划编写者根据用户补充要求，把数据源仓库改为只读来源，并把异步运行、状态恢复、API Workflow JSON 和媒体持久化全部移入当前仓库。
  - 计划编写者根据用户补充要求，删除“Skill 只能看到自身目录”的迁移假设，并把 Skill 文件与工具可见性归还给 DeepSeek Harness 的原生宿主配置。
  - 计划编写者根据用户补充要求，明确迁移后的 Skill 通过 DeepSeek Harness Tool 调用完善后的原数据源 CLI，不创建第二套 Skill 数据服务。
  - 计划编写者定义当前仓库的 `runs.sqlite`、运行 JSON 目录、媒体目录和恢复 worker。
- Files created/modified:
  - `prototype-scheme.md`（新建）
  - `findings.md`（更新）
  - `task_plan.md`（更新）
  - `progress.md`（更新）

### Phase 3: 语义独立审核
- **Status:** completed
- Actions taken:
  - 独立审核队员第一次审核判定 FAIL，并报告远端提交崩溃窗口、transport 契约缺失、跨模块类型缺失、Skill 工具与权限表述冲突以及依赖计划缺失。
  - 计划编写者定义稳定 `request_id`、提交状态、`submission_unknown` 终态和四个崩溃注入测试位置。
  - 计划编写者定义 ComfyUI transport、状态映射、媒体 descriptor、媒体流读取和 Session 访问控制。
  - 计划编写者定义目录、来源、运行、Workflow 和媒体的跨模块数据结构。
  - 计划编写者把原 CLI 方案校正为现有 OpenAPI 3.1 live discovery，并把每个 operation 注册为资源专用 `query_semantic_*` Harness Tool。
  - 计划编写者对来源 DeepSeek Harness monorepo 执行生产依赖审计；该历史基线返回 12 个 high advisory，当时正式 bundle 安装和生产连接保持 NO-GO。Phase 8 已经完成当前项目依赖处理，当前项目完整闭包与 production 闭包均为 0 advisory。
  - 独立审核队员第二轮复审发现实例 URL 公开投影矛盾；计划编写者拆分 Host 私有来源快照与模型、Session、浏览器公开投影。
  - 独立审核队员第三轮复审发现本地媒体分页接口缺失；计划编写者增加 `GenerationRuns.listMedia()` 和媒体分页契约。
  - 独立审核队员最终复审未发现剩余 P0、P1 或 P2，并判定 PASS。
- Files created/modified:
  - 无。

### Phase 4: 交付讨论稿
- **Status:** completed
- Actions taken:
  - 计划编写者完成 `prototype-scheme.md` 并准备向用户提交推荐方案、备选 UI、关键仓库边界、NO-GO 门禁和待确认决策。
- Files created/modified:
  - 无。

### Phase 5: 锁定变体 A 与 Workflow JSON 持久化边界
- **Status:** completed
- Actions taken:
  - 用户已经选择变体 A；计划编写者把静态原型范围收敛为单一路由，不实现 B、C 页面。
  - 计划编写者只读检查 `NoobAI-XL-FZ-PROD-ENV` v0.71.8 的领域定义、ADR 和静态下载原型。
  - 计划编写者只读检查相邻 `NoobAI-XL-FZ` 开发 checkout 中的 `prepareIterativeWorkflow()`、双 JSON 运行前持久化、运行详情投影、Blob 下载和 E2E 下载断言。
  - 计划编写者把用户所说的“请求快照转换为 workflow json”定义为本次实际 Workflow JSON；原始内部 `request.json` 不进入下载入口。
  - 计划编写者确认两个 Workflow JSON 的运行前持久化边界；当前页面只提供“下载本次 Workflow JSON（可导入 ComfyUI）”，API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用。
  - 计划编写者把当前仓库持久目录改为同时保存 `request.json`、`actual-workflow.json` 和 `api-workflow.json`，并保持数据源仓库只读。
  - 独立语义复审发现持久来源快照缺少模板内容、bindings 和 LoRA 来源投影；计划编写者新增 `PersistedRunSourceSnapshot` 与 `RunRequestSnapshot`，并增加数据源变更后的离线重建测试。
  - 计划编写者区分同一 ToolExecution 的恢复重试与用户通过新聊天消息明确请求的新运行；前者复用原运行，后者由 Harness 创建新的 `tool_call_id` 和 `run_id`。
  - 独立语义复审确认 `PersistedRunSourceSnapshot`、`RunRequestSnapshot`、`submission_unknown` 和两类重试边界已经修复，最终判定 PASS。
- Files created/modified:
  - `prototype-scheme.md`（更新）
  - `findings.md`（更新）
  - `task_plan.md`（更新）
  - `progress.md`（更新）
  - `workflow-json-conversion-research.md`（调研队员撰写中）

### Phase 6: 实现变体 A 静态原型
- **Status:** completed
- Actions taken:
  - 用户确认进入静态原型实现。
  - 计划执行者读取 `$prototype` 的 UI 原型约束和 `frontend-design` 的两阶段设计要求。
  - 用户已经选择变体 A；计划执行者不创建 B、C 页面和变体切换器，只实现 `/prototype/generation-workbench`。
  - 页面采用日光工作台视觉：蓝灰背景、白色工作面、钴蓝操作色、琥珀运行态和赤红错误态；正文、标题与运行标识分别使用无衬线、圆角标题和等宽字体角色。
  - 页面沿用三列信息层级，并把右列运行卡片的纵向 Workflow 信号轨作为识别性视觉元素。
  - 用户明确 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 只供调研；计划执行者把正式宿主、Host 插件和项目级 Skill 的安装位置锁定为当前仓库。
  - 用户明确一个 Session 包含多个聊天轮次，而且每轮可以由普通授权 Skill 调用或不调用 `generate_with_comfyui`；计划执行者使“当前轮次结果”按稳定 `turn_id` 显示零个、一个或多个关联运行。
  - 计划执行者把 Session、Turn 和运行关系统一为页面生命周期内的内存状态；“本会话结果”和会话运行数量都从所属聊天轮次的 `run_id` 去重并集生成。
  - 计划执行者使每次新发送创建独立的 `turn_id`、独立的 `run_id` 和限定在该聊天轮次内的 Agent 流式节点。
  - 计划执行者修复多运行轮次的“定位结果”交互；定位操作重新投影该聊天轮次的全部运行后再滚动并高亮目标卡片。
  - 计划执行者完成 26 项结构测试；测试覆盖本地资源、全部状态、单一 Workflow 浏览器下载、内部 API Workflow 图完整性、媒体输出、零个/一个/多个运行、Session 与 Turn 集合一致性、LoRA 不创建专用 Session、控件行为与轮次文案、底模“全部”选项、Harness 轨迹所有权、会话媒体库、全局媒体库、全局异步任务列表、动态聊天任务投影、提交超时与 Jobs API 404 状态边界、单 Job 取消、独立分页、默认中间态、连续发送身份、项目层不实现 Skill 选择器和原生上下文模态弹窗。
  - 计划执行者在浏览器中验证底模“全部”、左侧“所有媒体”入口、居中媒体库、会话/轮次/类型联动筛选、会话媒体两列两行分页、原文件新窗口打开，以及运行卡片和媒体卡片的本次实际 Workflow JSON 下载入口。
  - 用户明确 Skill 选择属于 DeepSeek Harness 原生交互；计划执行者删除静态原型中的项目级 Skill 按钮、菜单、选择状态和消息内预选标记，并把方案中的交互所有者统一为 DeepSeek Harness。
  - 用户明确数据源系统的 LoRA 会话流程不得迁入当前系统；计划执行者把“LoRA 对比”改为普通“画风参数对比”Session，并明确任意获得 `generate_with_comfyui` Tool 权限的普通 Skill 都能直接创建运行。
  - 用户指出原型的正常会话只显示完成结果；计划执行者把队列等待、ComfyUI 执行、媒体保存和提交结果未知四个运行绑定到默认 `turn_portrait_03`，失败运行绑定到普通画风参数对比 Session。
  - 用户指出页面存在没有交互的控件和含义不清的轮次标签；计划执行者删除“新建会话”与“会话选项”死控件，并把轮次按钮和右列来源改为完整任务摘要与明确查看动作。
  - 独立语义审核队员发现失败/未知卡片的伪创建按钮、无媒体源的原生播放控件、固定 Tool 详情和错误筛选空态；计划执行者删除直接提交按钮和无效播放控件，并增加独立筛选空态。
  - 用户明确底模只作为筛选条件；计划执行者把底模移出上下文资源、草稿标签和历史快照，并在上下文选择器顶部增加独立筛选器。
  - 用户明确 Tool 调用详情由 DeepSeek Harness 轨迹功能负责；计划执行者删除右列 Tool 详情标签、固定 Tool 名称和结构化结果复制交互。
  - 用户要求媒体结果改为会话级媒体库；计划执行者把“本会话结果”改为固定尺寸媒体网格，并增加聊天轮次、媒体种类、保存时间筛选和独立分页。
  - 用户要求跨会话浏览媒体；计划执行者只读确认 DeepSeek Harness 提供 `sidebar.footer.action` slot 与居中 `Modal`，并在原型左侧增加“所有媒体”入口及按会话、轮次、类型、时间筛选的全局媒体库。
  - 用户要求每个媒体能够打开原文件并下载所属 Workflow；计划执行者为共用媒体卡片增加原文件新窗口链接和“下载本次 Workflow JSON（可导入 ComfyUI）”按钮，同时保持 API Workflow JSON 不在页面下载。
  - 用户要求左侧新增所有 ComfyUI 异步任务入口；计划执行者只读取得数据源登记实例并实际确认两个实例均支持 `GET /api/jobs`，`win3080` 支持单 Job 查询和幂等 `POST /api/jobs/{prompt_id}/cancel`。
  - 计划执行者把原型任务观察契约从旧 `/queue` 与 `/history` 组合修正为 `GET /api/jobs/{prompt_id}`，并实现按会话、聊天轮次、创建时间筛选、每页五项、排队与运行中任务取消、取消确认、“正在取消”与“已取消”状态同步。
  - 独立语义审核队员发现方案的 `CatalogRef` 仍允许底模进入 `ContextSnapshot`；计划执行者增加排除 `base-model` 的 `ContextKind` 与 `ContextRef`，并把 `GenerationCatalog.resolve()` 和 `ReferenceCodec.serialize()` 收窄到该类型。
  - 独立语义审核队员发现 `submission_unknown` fixture、Jobs API 404 状态映射和方案状态机不一致；计划执行者把 `/prompt` 未确认、首次 Job 404 和持续 Job 404 分别收敛为 `submission_unknown`、保持远端状态和 `failed / COMFYUI_JOB_MISSING`，并把 `ComfyuiTransport` 接口统一为 `getJob()` 与 `cancelJob()`。
  - 独立语义审核队员完成页面文案、领域主体和多轮运行关系验收；审核发现的问题已经全部修改。
- Files created/modified:
  - `task_plan.md`（更新）
  - `progress.md`（更新）
  - `findings.md`（更新）
  - `prototype-scheme.md`（更新）
  - `prototype/generation-workbench/index.html`（新建）
  - `prototype/generation-workbench/styles.css`（新建）
  - `prototype/generation-workbench/app.js`（新建）
  - `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`（新建）
  - `prototype/generation-workbench/fixtures/generated-portrait.svg`（新建）
  - `prototype/generation-workbench/fixtures/video-poster.svg`（新建）
  - `prototype/generation-workbench/tests/prototype-contract.test.mjs`（新建）
  - `prototype/generation-workbench/README.md`（新建）

### Phase 7: 确认正式实现边界
- **Status:** in_progress
- Actions taken:
  - 用户确认一个权威 OpenAPI schema 投影 Catalog discovery/CLI 与 Source discovery/CLI；两个表面复用稳定 ID、revision、共用 schema 和错误结构。
  - 用户确认本版本不认证调用 Source Operation 的其他本机进程。Harness 只通过注册边界确保 Source Operation 不进入 Agent Tool、Skill Tool 或浏览器 RPC；数据源 operation 保持只读。
  - 用户确认本版本不处理用户选择模板后到 Generation Tool Call 前发生模板 revision 更新的并发情形。Host 在 Tool 调用中读取当前模板 bundle，并把该次返回结果保存为运行来源快照。
  - 用户确认生成选项允许显式选择安全 ComfyUI 实例 ID；未选择时 Host 使用配置默认实例，明确选择的实例不可用时不切换。
  - 用户确认当前 Harness 安装使用一个 SQLite 保存包含 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id` 的运行元数据，并按 Workspace 与 Run 分区保存文件。
  - 用户确认 Catalog discovery 与 Source discovery 返回相同的 `contract_id` 和 `contract_version`；Host adapter 只接受配置声明支持的组合。
  - 用户确认异步运行状态不复制进 Harness Session 日志。Session 只保存原生 Generation Tool Call 与包含 `run_id` 的 Tool Result；Run Repository 保存权威状态，浏览器使用非持久 Run Change Notification 触发重新读取。
- Files created/modified:
  - `CONTEXT.md`（更新）
  - `docs/adr/0003-message-context-excludes-execution-routing.md`（更新）
  - `docs/adr/0007-one-source-contract-with-two-read-surfaces.md`（更新）
  - `docs/adr/0008-one-sqlite-and-workspace-run-directories.md`（新建）
  - `docs/adr/0009-source-contract-version-gate.md`（新建）
  - `docs/adr/0010-run-repository-is-the-status-authority.md`（新建）
  - `prototype-scheme.md`（更新）
  - `findings.md`（更新）
  - `task_plan.md`（更新）
  - `progress.md`（更新）

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| 目标目录检查 | `ls -la` 与 `git status` | 确认目录状态且不修改文件 | 目录为空且不是 Git 仓库 | PASS |
| 来源仓库工作树检查 | 两个来源仓库的 `git status --short --branch` | 识别用户文件并保持只读 | 两个来源仓库都有用户未提交修改 | PASS |
| 静态原型结构测试 | `node --test prototype/generation-workbench/tests/*.test.mjs` | 全部分支与结构契约通过 | 27/27 通过 | PASS |
| 现有 ComfyUI Jobs API | 只读请求两个登记实例的 `/system_stats` 与 `/api/jobs` | 取得现有版本和分页 Job 响应 | `mac mini` 0.28.3、`win3080` 0.33.1；两个实例均返回 `jobs + pagination` | PASS |
| 单 Job 查询与取消路由 | 查询 `win3080` 的已完成 Job，调用单 Job cancel 后回读 | 取消路由存在；终态请求为幂等 no-op | cancel 返回 HTTP 200、`cancelled=false`；回读仍为 `completed` | PASS |
| 控件与轮次语义 | 页面加载、选择三个静态聊天轮次 | 没有死控件；轮次按钮说明任务、动作和运行数量 | 删除 `+` 与 `…`；显示本轮任务摘要和“查看 N 项 ComfyUI 运行” | PASS |
| 底模筛选边界 | 打开上下文选择器并切换底模 | 底模筛选候选项但不进入草稿或历史上下文 | 底模只显示在独立筛选栏；上下文资源和快照不包含底模 | PASS |
| Harness 轨迹所有权 | 检查右列标签和聊天 Tool 调用 | 右列不复制 Tool 详情；聊天 Tool 调用仍可定位结果 | 右列只保留当前轮次与本会话结果 | PASS |
| 静态媒体预览 | 打开视频 Session | 没有不可用的原生播放按钮；视频和音频类型仍可辨认 | 显示视频封面与音频波形静态预览 | PASS |
| 会话媒体库 | 打开视频 Session 的“本会话结果” | 固定两列多行卡片、每页四个、可按轮次/类型/时间筛选 | 第一页 2 列 × 2 行，第二页显示视频和音频 | PASS |
| 全局媒体库 | 点击左侧“所有媒体”并选择视频 Session 和视频类型 | 居中弹层按会话联动轮次，并筛选跨会话媒体 | 轮次选项收敛为视频 Session 的一轮，媒体数量由 8 变为 6，再变为 1 | PASS |
| 全局异步任务列表 | 点击左侧“所有 ComfyUI 异步任务”并选择视频 Session | 居中弹层按会话联动聊天轮次并筛选任务 | 全部会话显示 8 项和 2 页；视频 Session 收敛为 1 个聊天轮次和 1 项任务 | PASS |
| 动态聊天任务投影 | 发送一条新消息并在 Agent 静态流式输出完成后打开全局任务列表 | 新聊天轮次创建的任务进入全局列表；列表计数增加；任务按真实时间戳倒序显示 | 任务数量由 8 增至 9；新任务显示在第一页首行；本仓库状态和 ComfyUI Job 原始状态均为已完成 | PASS |
| 提交超时与 Job 缺失边界 | 检查 `/prompt` 未确认、首次 Job 404、持续 Job 404 三个结构化 fixture | 三条路径分别具有唯一的本仓库状态、错误码、取消能力和自动重提规则 | 分别映射为 `submission_unknown`、保持远端状态、`failed / COMFYUI_JOB_MISSING`；三条路径都不自动重提 | PASS |
| 异步任务分页与窄窗口 | 在 635px 宽窗口查看第一页并切换下一页 | 弹层不横向撑出视口；第一页 5 项、第二页 3 项 | 任务表在窄窗口转换为卡片；分页数量为 5 / 3 | PASS |
| 运行中任务取消 | 点击“取消运行中任务”并确认 | 显示目标 `run_id`、`prompt_id`、实例和 Jobs API；状态从正在取消收敛为已取消 | 700ms 静态状态转换完成，Job 状态为 `cancelled`，取消按钮消失，右列同一运行同步更新 | PASS |
| 任务弹层模态行为 | 打开任务列表并按 Esc | 使用顶层模态并在关闭后把焦点返回入口 | `#task-library-dialog:modal` 数量为 1；Esc 后入口恢复 active | PASS |
| 媒体原文件与 Workflow | 点击视频媒体主体并检查媒体卡片按钮 | 原文件在新窗口打开；按钮下载所属运行的本次实际 Workflow JSON | 新标签页打开 `demo-video.mp4`；每张媒体卡片显示“下载本次 Workflow JSON（可导入 ComfyUI）” | PASS |
| 默认中间态 | 直接打开 `?state=success` | 不操作底部切换器即可看到排队、执行中、保存媒体和提交未知 | `turn_portrait_03` 同时显示四个状态卡片 | PASS |
| 普通 Skill/Session 边界 | 打开画风参数对比 Session | 不存在专用 LoRA Session；普通轮次显示成功和失败运行 | `session=comparison` 的 `turn_comparison_01` 显示两个运行 | PASS |
| Skill 交互所有权 | 页面加载并发送一条新消息 | 页面不包含项目级 Skill 选择交互；消息和运行仍正常创建 | 没有 Skill 按钮、菜单、选择状态或预选文案；消息创建独立 `turn_id/run_id` | PASS |
| 多运行定位 | 普通画风参数对比轮次点击失败运行的“定位结果” | 当前聊天轮次的两个运行仍显示 | 成功运行与失败运行同时保留，失败卡片获得定位高亮 | PASS |
| 连续发送 | 在角色 Session 连续发送两条消息 | 两个聊天轮次分别拥有独立 Agent 输出和 `run_id` | 创建 `turn_portrait_live_1/2` 与 `run_DEMO_PORTRAIT_001/002` | PASS |
| Session 往返恢复 | 角色 Session 新增两轮后切换视频 Session 再返回 | 新轮次、运行、计数和会话汇总保持 | 角色 Session 保留四个轮次与三个运行 | PASS |
| 来源 Harness production audit | `pnpm audit --prod --registry=https://registry.npmjs.org --json` | 复现规格中的 high advisory 基线 | 0 critical、12 high、12 moderate、1 low | PASS |
| 当前项目完整依赖审计 | `pnpm audit --json` | critical/high 至少为 0；记录全部严重级别 | 591 个依赖，critical/high/moderate/low 全部为 0 | PASS |
| 当前项目 production 依赖审计 | `pnpm audit --prod --json` | critical/high 至少为 0；记录全部严重级别 | 475 个依赖，critical/high/moderate/low 全部为 0 | PASS |
| Frozen lockfile-only | `pnpm install --lockfile-only --ignore-scripts --frozen-lockfile` | lockfile 与 manifest/override 一致且不创建 `node_modules` | 通过 supply-chain policy；没有 `node_modules` | PASS |
| Advisory 修复后原型回归 | `node --test prototype/generation-workbench/tests/*.test.mjs` | 原有静态原型测试不受依赖配置影响 | 27/27 通过 | PASS |
| 工作区差异格式 | `git diff --check` | 没有空白错误 | 无输出 | PASS |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-08-20 | 当前目标目录不是 Git 仓库 | 1 | 本轮不创建提交或分支；用户确认方案后确定初始化方式。 |
| 2026-08-20 | 默认 pnpm registry 的 audit endpoint 不存在 | 1 | `registry.npmmirror.com` 返回 `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`；后续审计命令只对当前调用显式使用 `https://registry.npmjs.org`，不修改全局或仓库配置。 |
| 2026-08-20 | `pnpm why` 不支持 `--lockfile-only` | 1 | 停止重复调用；使用 `pnpm list <package> --lockfile-only --depth Infinity --parseable` 和 lockfile 查询验证依赖路径。 |
| 2026-08-20 | `pnpm run` 在缺少 `node_modules` 时触发依赖准备 | 1 | `strict-dep-builds` 在执行任何 build script 前失败；把 464 MB 生成目录移入系统废纸篓，后续 pre-install 门禁直接调用 `pnpm audit`，测试直接调用 `node --test`。 |

### Phase 8: 逐项处理 high dependency advisory
- **Status:** completed
- Actions taken:
  - 读取当前计划、已发布规格和依赖安全门禁；在生成当前项目 lockfile 前没有安装依赖。
  - 保持原 DeepSeek Harness 仓库只读，并记录其提交、lockfile 摘要和用户未提交文件。
  - 使用官方 npm registry 对来源 DeepSeek Harness monorepo 重新执行完整与 `--prod` audit；来源完整闭包为 15 high，来源 production 闭包为 12 high。
  - 把 12 条 production audit 条目归并为 7 个受影响包版本和对应修复版本，并逐条记录当前项目处理结论。
  - 创建精确直接依赖 manifest、官方 registry 配置、七个受影响版本 override 和 lockfile；lockfile-only 解析没有执行依赖脚本。
  - 当前项目完整闭包与 production 闭包的 audit 均为 critical/high/moderate/low 全部 0。
  - `pnpm run` 的意外依赖准备发现五个未审计 build-script 包；所有脚本在 Phase 9 审核完成前保持拒绝状态。

### Phase 9: 审核 dependency build script 并完成正式依赖安装
- **Status:** completed
- Actions taken:
  - 从官方 npm registry 下载五个精确版本 tarball，并在隔离临时目录中验证路径、registry integrity、文件清单、安装命令和本地调用链；下载与检查阶段没有执行 lifecycle script。
  - 第一版 `allowBuilds` 决定错误地把四个依赖包标记为拒绝；用户指出 build-script 安全审核不得变成安装行为裁剪。
  - 计划执行者撤销四个拒绝决定，并在 `allowBuilds` 中明确允许五个已经完成安全审计的精确版本。
  - 计划执行者运行此前未执行的四个 lifecycle script，并再次执行 frozen install，验证五个依赖包保留完整安装行为。
  - 完整依赖与 production 依赖 audit 均为 0 critical、0 high、0 moderate、0 low；原型测试 27/27 通过。

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 9 已完成：dependency advisory、build-script 和 frozen install 门禁全部通过。 |
| Where am I going? | 按 Issue #1 实现正式 Harness bundle、Host plugin、Client plugin、Run Repository 和完整交付流程。 |
| What's the goal? | 在精确项目依赖闭包和失败关闭的 build-script 策略上实现 DeepSeek Harness ComfyUI 工作台。 |
| What have I learned? | 来源 monorepo 的 production audit 数量不能代表当前项目 closure；当前项目只实际包含修复后的 `js-yaml`、`nanoid` 和 `postcss`，其他受影响包不在 closure 中。 |
| What have I done? | 已创建精确 manifest、七个安全 override、五个精确 build-script 允许决定和两份标准化安全报告；完成完整 lifecycle、frozen install、full/prod audit 和 26 项原型回归验证。 |
