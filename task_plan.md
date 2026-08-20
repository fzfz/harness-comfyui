# Harness ComfyUI 原型方案调研计划

## Goal
计划编写者基于 DeepSeek Harness 与 NoobAI-XL-FZ-PROD-ENV 的现有实现，产出一份供用户讨论的三列式 Agent 生图工作台原型方案；本轮不迁移 Skill、不实现底层服务、不连接真实 ComfyUI 实例。

## Next Step
用户检查 `/prototype/generation-workbench` 的交互和信息层级，并决定静态原型需要修改的内容；正式 DeepSeek Harness 宿主安装、Host 插件、数据 CLI 和 ComfyUI 运行服务仍属于后续实现阶段。

## Current Phase
Phase 6

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
| 原 CLI 继续使用 `schema/api/openapi.yaml` 和 live discovery | 当前 `imagegen-semantic-query` 已经动态读取 OpenAPI operation；方案不创建第二个 manifest。 |
| `submitting` 崩溃恢复为 `submission_unknown` | 当前没有经过验证的远端业务幂等键，恢复流程不能安全自动重提。 |
| 正式 bundle 与生产连接暂时 NO-GO | 当前 DeepSeek Harness 生产依赖审计存在 12 个 high advisory；静态零依赖原型仍可讨论和实现。 |
| 原 DeepSeek Harness 目录保持只读 | 用户指定该目录只供调研；正式宿主、Host 插件和 Skill 必须安装到当前仓库。 |
| Skill 选择交互归 DeepSeek Harness 所有 | 本项目不实现 Skill 选择器、菜单或选择状态，只消费 Harness Session 中已经记录的 Skill 与 Tool 调用事件。 |
| Tool 调用详情归 DeepSeek Harness 轨迹功能所有 | 本项目右列只显示 ComfyUI 运行与媒体，不复制单一 Tool 的参数或结构化结果面板。 |
| 当前系统没有专用 LoRA Session | LoRA 是可选运行参数；任何获得 `generate_with_comfyui` Tool 权限的普通 Skill 都可以在普通 Session 中创建 ComfyUI 运行。 |
| 底模是资源查询筛选条件 | 上下文选择器用底模 ID 筛选具有 `base_model_id` 关系的候选项；底模筛选值不写入消息上下文。 |
| 底模筛选器提供“全部” | 选择“全部”时，上下文目录查询不附加具体底模限制；底模仍不写入消息上下文。 |
| 全局媒体库使用 Harness 左侧入口和居中弹层 | 当前仓库 Client plugin 注册 `sidebar.footer.action`，并使用 Harness `Modal` 呈现按会话、轮次、类型、时间筛选的跨会话媒体。 |
| 全局异步任务列表使用 ComfyUI Jobs API | 当前仓库保存 Session、`turn_id`、`run_id`、实例 ID 与 `prompt_id` 关联；服务使用 `GET /api/jobs/{prompt_id}` 观察任务，并使用 `POST /api/jobs/{prompt_id}/cancel` 取消指定的排队或运行中 Job。 |
| 原型不保留没有已实现行为的可见控件 | 每个可见按钮必须触发原型中能够核对的状态变化、导航、筛选、复制、下载或对话框操作。 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 当前目标目录不是 Git 仓库 | 1 | 本轮只创建调研文件；用户确认方案后再确定仓库初始化与原型分支策略。 |
