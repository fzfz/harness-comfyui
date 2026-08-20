# Harness ComfyUI 原型方案调研计划

## Goal
计划执行者基于已经发布的 DeepSeek Harness ComfyUI 工作台规格，逐项识别并处理计划依赖闭包中的 high advisory；安全门禁通过前不安装正式依赖、不连接生产 ComfyUI 写路径。

## Next Step
依赖 advisory 门禁、build-script 门禁与 frozen install 已经通过。下一阶段由计划执行者实现 Issue #1 的正式 Harness bundle、Host plugin、Client plugin、Run Repository 和测试流程。

## Current Phase
Phase 9 completed

## Phases

### Phase 1: 检查两个仓库的现有接口
- [x] 计划编写者检查 DeepSeek Harness 的 Web 页面、插件、会话事件与 Skill 目录。
- [x] 计划编写者检查 NoobAI-XL-FZ-PROD-ENV 的查询 CLI、会话 Skill、管理 Skill、ComfyUI 实例与工作流模板数据。
- [x] 计划编写者把已确认的文件路径、结构化数据字段和缺口写入 findings.md。
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
- [x] 计划执行者根据 DeepSeek Harness 的 `sidebar.footer.action` 与 `Modal` 能力实现左侧“所有媒体”入口和居中跨会话媒体库。
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
| Run Repository 是异步运行状态的权威来源 | Harness Session 日志只保留原生 Generation Tool Call 与包含 `run_id` 的 Tool Result；Host 使用非持久 Run Change Notification 提醒浏览器重新读取。 |
| `submitting` 崩溃恢复为 `submission_unknown` | 当前没有经过验证的远端业务幂等键，恢复流程不能安全自动重提。 |
| 依赖 advisory、build-script 与 frozen install 门禁均已通过 | 当前项目完整与 production audit 均为 0；`allowBuilds` 明确允许五个已经完成安全审计的精确版本，不裁剪依赖包的安装行为。 |
| 原 DeepSeek Harness 目录保持只读 | 用户指定该目录只供调研；正式宿主、Host 插件和 Skill 必须安装到当前仓库。 |
| Skill 选择交互归 DeepSeek Harness 所有 | 本项目不实现 Skill 选择器、菜单或选择状态，只消费 Harness Session 中已经记录的 Skill 与 Tool 调用事件。 |
| Tool 调用详情归 DeepSeek Harness 轨迹功能所有 | 本项目右列只显示 ComfyUI 运行与媒体，不复制单一 Tool 的参数或结构化结果面板。 |
| 当前系统没有专用 LoRA Session | LoRA 是可选运行参数；任何获得 `generate_with_comfyui` Tool 权限的普通 Skill 都可以在普通 Session 中创建 ComfyUI 运行。 |
| 底模是资源查询筛选条件 | 上下文选择器用底模 ID 筛选具有 `base_model_id` 关系的候选项；底模筛选值不写入消息上下文。 |
| 底模筛选器提供“全部” | 选择“全部”时，上下文目录查询不附加具体底模限制；底模仍不写入消息上下文。 |
| 全局媒体库使用 Harness 左侧入口和居中弹层 | 当前仓库 Client plugin 注册 `sidebar.footer.action`，并使用 Harness `Modal` 呈现按会话、轮次、类型、时间筛选的跨会话媒体。 |
| 全局异步任务列表使用 ComfyUI Jobs API | 当前仓库保存 Harness Session ID、数字 `turn`、`run_id`、实例 ID 与 `prompt_id` 关联；服务使用 `GET /api/jobs/{prompt_id}` 观察任务，并使用 `POST /api/jobs/{prompt_id}/cancel` 取消指定的排队或运行中 Job。 |
| 原型不保留没有已实现行为的可见控件 | 每个可见按钮必须触发原型中能够核对的状态变化、导航、筛选、复制、下载或对话框操作。 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 当前目标目录不是 Git 仓库 | 1 | 本轮只创建调研文件；用户确认方案后再确定仓库初始化与原型分支策略。 |
