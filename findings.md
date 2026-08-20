# Harness ComfyUI 原型方案调研结果

## Requirements
- DeepSeek Harness 必须作为 Agent 宿主。
- HTML 前端必须包含会话列表、单会话流式聊天区和生成结果卡片区。
- 用户每次发送消息前必须能够插入结构化上下文；上下文类型来自数据源仓库并能够持续扩展。
- 用户必须能够通过 DeepSeek Harness 原生会话输入交互选择并调用可用 Skill；本项目不得实现第二个 Skill 选择按钮、菜单或选择状态。
- 当前系统的会话 Skill、管理 Skill和后续 Skill 必须迁移到当前项目，并通过数据查询 CLI 读取数据源。
- 底层模块必须读取已有 ComfyUI 实例和工作流模板、创建本次实际 Workflow JSON 与可执行 API Workflow JSON、异步提交任务、查询任务状态、保存图片/视频/音频，并查询本地媒体和两个 Workflow JSON。
- ComfyUI Skill 必须能够修改工作流模板的宽度、高度、提示词、像素、CFG 等运行时参数并提交任务。
- 生成结果卡片必须展示 ComfyUI Skill 的媒体结果、标题和可下载的生成 JSON。

## Research Findings
- `/Volumes/4Tdisk/work/AI2/harness-comfyui` 当前为空目录且不是 Git 仓库。
- `/Volumes/4Tdisk/work/AI2/deepseek-harness` 当前存在用户未提交修改；本轮只读检查必须保留这些修改。
- `/Volumes/4Tdisk/work/AI2/deepseek-harness` 永久作为只读调研来源。正式实现使用的 DeepSeek Harness 宿主、Host 插件和项目级 Skill 必须安装在当前仓库 `/Volumes/4Tdisk/work/AI2/harness-comfyui`。
- `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` 当前是 detached HEAD，且存在用户未提交文件；本轮只读检查必须保留这些文件。
- 既有记忆记录了 DeepSeek Harness 的 AgentLoop、Agent Preset、`conversation.view` 和 Skill 宿主能力，但该记录属于静态调研，不能替代当前仓库检查和运行时验证。
- 既有记忆记录了 NoobAI 的 ComfyUI 运行时参数契约、管理 Skill 会话契约和异步任务接口；当前方案必须重新检查现有文件与数据结构。
- DeepSeek Harness 根目录 `AGENTS.md` 规定所有产品行为通过插件接入，并规定所有进入模型请求的内容必须能够从会话日志重建。
- DeepSeek Harness 根目录 `AGENTS.md` 规定产品可见插件需要真实组合测试；工具的 UI 展示意图必须在工具设计时定义。
- 数据源仓库已经存在 `comfyui-run-runtime.mjs`、`comfyui-runtime-gateway.mjs`、`comfyui-runtime-media.mjs`、模板工作流模块、运行时参数模块、会话模块和 Pi Skill 宿主模块。
- 数据源仓库 `package.json` 已使用精确依赖版本；本轮不新增或安装依赖。
- DeepSeek Harness 提供 `ConversationNodeDefinition` 和 keyed renderer；客户端插件能够把一组具有稳定业务 ID 的持久会话事件聚合为单个聊天节点，并按事件序号重放状态。
- 本项目不使用 `ConversationNodeDefinition` 复制 Generation Run 状态。Harness Session 日志只保存原生 Tool Call/Tool Result 与 `run_id` 关联；Run Repository 保存权威运行状态，Host 只发送非持久 Run Change Notification。
- DeepSeek Harness 已有浏览器端附件、Skill、任务、交付物、会话、侧栏、布局、工具结果与工作流运行 UI 包；方案应组合这些扩展点，不应另建一套独立聊天协议。
- DeepSeek Harness 的 Agent 输入通过统一 inbox 接收；`agent.inject()` 添加的上下文会等待下一条能够唤醒 Agent 的消息，适合“选择上下文后随本次用户消息发送”的交互。
- 数据源仓库当前可见的仓库级 Skill 只有 `anima-prompt-builder` 和 `wai-sdxl-prompt-builder`；管理 Skill 与会话 Skill 的宿主逻辑主要位于 `app/pi` 和 `app/session`，需要继续定位它们的实际运行目录与契约。
- DeepSeek Harness 的现有 `AppFrame` 已实现三列布局：左列 `sidebar`、中列 `conversation`、右列 `details`；左列宽度范围为 264–420px，中列目标最小宽度为 640px，右列宽度范围为 300–520px。
- DeepSeek Harness 的 `details` 是单占用 slot。现有 `DetailsPanel` 已占用该位置并声明 `conversation.details.tool`；新的生成结果面板不能与它并列注册。
- DeepSeek Harness 的输入状态机已经支持带 `source`、`ref`、`label` 和 `clipboardText` 的引用 chip，并支持撤销、重做、粘贴升级和失效样式。数据上下文选择器可以复用引用 chip 的表现层，但仍需定义 Host 如何把引用解析为持久的模型上下文事件。
- DeepSeek Harness 的 Skill 文件提供器能够读取项目 `.dsh/skills`、项目 `.agents/skills` 和显式 `customSkillDirs`；Skill UI 使用 `/skill-name` 触发器并从当前会话的 Skill 列表 RPC 读取候选。
- DeepSeek Harness 的输入引用源支持异步 `ReferenceCodec.serialize(ref, signal)`。发送操作会在提交前把每个 chip 序列化为模型文本；任一序列化失败会阻止发送并保留草稿，不会静默替换为剪贴板文本。
- 仅使用 `ReferenceCodec` 能够在一个普通用户消息中原子保存用户正文和上下文快照；该方案不需要修改 AgentLoop。代价是聊天历史会显示序列化后的上下文文本，除非另行增加确定性的折叠呈现。
- DeepSeek Harness 的 `agent.inject()` 能够保存带插件来源的非唤醒上下文，但单独执行“注入 RPC”后再执行普通 prompt RPC 会留下失败窗口；当前方案不采用两个独立浏览器请求拼接一个用户动作。
- 数据源仓库现有会话服务把 `selection` 转换为 `ui_explicit` 快照后构建 Pi prompt；这套选择快照语义可以迁移为新上下文查询模块的输入，但旧 Pi 会话持久化与三轮限制不应迁入 DeepSeek Harness 会话。
- 当前运行中的数据源语义发现接口只暴露四个只读操作：`querySemanticWorksForSkill`、`querySemanticCharactersForSkill`、`querySemanticStylesForSkill` 和 `querySemanticPromptTermsForSkill`。
- 当前 `imagegen-semantic-query` CLI 根据 `/internal/semantic` OpenAPI 3.1 文档动态生成参数和调用方式；它没有底模、模型、LoRA、画师串、ComfyUI 实例、模板或媒体操作。
- 用户明确要求继续使用并完善数据源仓库的原 CLI。DeepSeek Harness Host 把完善后的 CLI 包装为结构化 Harness Tool，迁移后的 Skill 通过 Harness Tool 查询原仓库数据。
- `schema/api/openapi.yaml` 是 Catalog Operation 与 Source Operation 的 operation、输入 schema、响应 schema、稳定 ID、revision 和错误结构的唯一来源；数据源服务从该文档投影 Agent 安全 discovery 与 Host 私有 source discovery，方案不增加第二个 schema manifest。
- 数据源 SQLite 已包含 `generation_base_models`、`generation_models`、`generation_loras`、`artist_prompt_strings`、`comfyui_instances`、`comfyui_templates`、`comfyui_template_revisions`、`comfyui_template_runtime_configs`、`comfyui_runs` 和 `comfyui_run_outputs`。
- 当前生产版本的 `comfyui_run_outputs.media_type` 只允许 `image/jpeg`、`image/png` 和 `image/webp`。用户要求的视频和音频需要新增结构化媒体种类、MIME 配置、文件校验和页面呈现。
- 当前 ComfyUI 工作流运行参数契约已经定义 `positive_prompt`、`negative_prompt`、`width`、`height`、`resolution_preset`、`aspect_ratio`、`megapixels`、`seed`、LoRA 参数、参考图片和通用工作流输入等绑定种类。
- 当前生产数据包含 3 个底模、13 个文生图模型、86 个 LoRA、3760 个作品、39936 个角色、12413 个画风、2 个 ComfyUI 实例和 35 个 ComfyUI 模板；`artist_prompt_strings` 当前为 0 行，但接口仍需把空集合当作正常结果。
- 当前生产 checkout 没有 `management-skills/`、`config/management-pi/` 或 `schema/management-pi/` 文件。历史记录显示管理 Skill 契约已经在 NoobAI 主仓库后续版本合并，但该事实不等于当前指定数据源目录已经包含可迁移文件。
- DeepSeek Harness 的通用 `ctx.jobs` 已提供 owner 隔离、`job_output`、`job_list`、`job_kill` 和完成通知；`jobs-local` 状态只存在于 Harness 进程内，不足以承担 ComfyUI 运行的跨重启持久化。
- 用户明确要求数据源仓库只提供已有 ComfyUI 实例、Workflow 模板、模板 revision、运行时配置和其他目录数据。当前仓库必须拥有异步运行、队列观察、API Workflow JSON、媒体保存和重启恢复；任务运行过程不得向数据源仓库写入持久数据。
- Harness `ctx.jobs` 只承担当前 Agent 存活期间的等待、通知和取消入口；当前仓库的运行数据库和媒体目录承担稳定 `run_id` 的持久事实来源。
- ComfyUI `/prompt` 没有本轮已验证的业务幂等键。当前仓库必须在远端提交前持久创建 `run_id` 和 API Workflow JSON；恢复流程遇到 `submitting` 时必须返回 `submission_unknown`，不能自动重提。
- 2026-08-20 从数据源 `data/app.sqlite` 只读取得两个已启用且已验证实例：`mac mini` 为 `http://192.168.110.16:8188/`，`win3080` 为 `http://192.168.110.122:8188/`。`GET /system_stats` 实测版本分别为 ComfyUI `0.28.3` 和 `0.33.1`。
- 两个现有实例的 `GET /api/jobs?limit=1&offset=0` 都实测返回 `jobs` 与 `pagination`。`win3080` 的 `GET /api/jobs/{prompt_id}` 实测返回 `id`、`status`、创建与执行时间、`outputs`、`execution_status` 和 `workflow`。数据源开发仓库的当前 `comfyui-runtime-gateway.mjs` 也已经使用持久 `prompt_id` 调用该单 Job 查询接口，不再使用旧 `/queue` 与 `/history` 组合观察任务。
- `win3080` 的 `POST /api/jobs/{prompt_id}/cancel` 实测存在。对查询确认为 `completed` 的 Job 调用后返回 HTTP 200 与 `{ "cancelled": false }`，回读仍为 `completed`，证明终态取消是幂等 no-op。ComfyUI 官方 `server.py` 对 `pending` Job 按 ID 出队，对 `in_progress` Job调用 `PromptQueue.interrupt_if_running(prompt_id)` 原子中断；该实现不会把取消请求落到随后开始运行的其他 Job。
- `/prompt` 请求结果无法确认且本仓库尚未保存 `prompt_id` 时，本仓库状态为 `submission_unknown`；页面不能查询或取消 Job。已经保存 `prompt_id` 后，Jobs API 首次返回 404 且尚未超过观察期限时，本仓库保持原远端状态；持续 404 超过观察期限后，本仓库状态为 `failed`，错误码为 `COMFYUI_JOB_MISSING`。
- 当前数据源开发仓库的运行网关只封装 `submit()`、`observe()` 和输出下载，尚未封装 `POST /api/jobs/{prompt_id}/cancel`。本项目正式实现必须在当前仓库的 `ComfyuiTransport` 和 `GenerationRuns.cancel()` 中实现取消；数据源仓库仍不保存本项目的任务状态或取消结果。
- 2026-08-20 的来源 DeepSeek Harness monorepo 锁文件基线是 0 critical、12 high、12 moderate、1 low；该历史基线不代表当前项目 lockfile。当前项目完整闭包与 production 闭包均为 0 critical、0 high、0 moderate、0 low，dependency advisory 门禁已经通过。五个 build-script 包也已经完成独立审核，frozen install 已经成功。
- 用户已经选择 UI 变体 A。静态实现不再创建 B、C 页面，B、C 只作为讨论记录保留。
- `NoobAI-XL-FZ-PROD-ENV` v0.71.8 的 `docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md` 明确定义“本轮实际 Workflow JSON”与“实际 Workflow API 请求 JSON”；该 checkout 的下载行为目前位于静态 `iterative-image-tasks-prototype.html`，不是正式后端接口。
- 相邻开发仓库 `NoobAI-XL-FZ` 的已提交 `HEAD` 已经实现这条链路；当前工作树存在用户修改和删除，本轮证据通过 `git show HEAD:<path>` 读取。`prepareIterativeWorkflow()` 深拷贝 UI Workflow 0.4，按 `replace_input` bindings 写入最终提示词和固定参数，处理 LoRA 节点链并在转换前后执行静态校验。
- `createComfyuiIterativeRunService()` 先从本次实际 Workflow JSON 编译 `api_workflow_json`，再通过 `beforeSubmit` 把 `workflow_json` 与 `api_workflow_json` 一起交给运行时；`comfyui-run-runtime.mjs` 在远端提交开始前持久化两者。
- 数据源开发仓库的正式工作台从成功运行投影读取已经保存的 `workflow_json` 与 `api_workflow_json`，使用 `application/json` Blob 下载。下载逻辑不读取当前模板，也不重新运行转换器或 compiler。
- 用户所说的“请求快照转换为 workflow json”对应本方案的本次实际 Workflow JSON：它由模板来源快照与内部请求数据确定性转换而来，保留 ComfyUI 前端节点、widget、连接和画布信息。原始 `request.json` 只作为本仓库内部幂等与恢复事实，不是页面下载产物。页面只提供“下载本次 Workflow JSON（可导入 ComfyUI）”；API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用。
- 独立语义复审发现原 `PrivateRunSourceSnapshot` 只保存模板身份，不能离线重建实际 Workflow。方案已改为 `PersistedRunSourceSnapshot`：该类型保存完整 `ComfyuiTemplateBundle`、非敏感实例投影和本次 LoRA 来源投影；`RunRequestSnapshot` 单独保存运行关联、参数、LoRA 权重和上下文。两个快照都只写入当前仓库。
- 同一 ToolExecution 的传输或恢复重试复用稳定 `request_id` 与原 `run_id`。用户通过新的聊天消息明确要求 Agent 再次生成，且在 `submission_unknown` 情况下确认重复任务风险后，Harness 才创建新的 `call_id`、`request_id` 和 `run_id`；`submission_unknown` 不会自动重提。
- 一个 DeepSeek Harness Session 包含多个聊天轮次；每个聊天轮次可以包含零个或多个由 DeepSeek Harness 记录的 Skill 调用事件，并且可以关联零个、一个或多个 ComfyUI `run_id`。本项目只消费这些宿主事件，不保存自有 Skill 选择状态。右列“当前轮次结果”必须使用 Harness 原生 Session ID 与数字 `turn` 投影关联运行，不能显示 Session 最新运行作为替代。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Harness Tool 向迁移后的 Skill 返回结构化结果 | DeepSeek Harness 决定 Skill 的实际文件和工具可见性；本项目通过 Host 工具隔离数据源实现，不由 `SKILL.md` 声明宿主沙箱。 |
| DeepSeek Harness 拥有 Skill 选择交互 | 本项目不实现 Skill 按钮、菜单或选择状态；本项目只注册可用 Tool 并消费 Session 中的 Skill 与 Tool 调用事件。 |
| 普通 Skill 可以直接创建 ComfyUI 运行 | `generate_with_comfyui` 是目标 Harness profile 授权的普通 Tool；当前系统不创建专用 LoRA Session，也不要求先进入 `comfyui-generate` Skill。 |
| ComfyUI 任务模块拥有工作流绑定、提交、轮询、媒体保存和请求快照 | 多个 Skill 与页面调用者只需要学习一个较小接口，复杂实现集中在一个模块中。 |
| 原型不执行真实写操作 | 原型问题是页面信息层级和交互是否正确，真实写操作不增加当前问题的判断价值。 |
| 用户插入的上下文必须形成会话日志事件 | DeepSeek Harness 要求每个模型可见输入都能够从会话日志重建。 |
| 复用现有 `AppFrame`、会话列表和流式聊天 | DeepSeek Harness 已经实现用户要求的左列和中列，重复实现会产生另一套会话协议。 |
| 全局媒体库使用左侧栏入口和居中弹层 | DeepSeek Harness 的 `sidebar.footer.action` slot 可承载当前仓库 Client plugin 的入口，`ui-primitives` 的 `Modal` 可承载全视口遮罩上的居中媒体库。 |
| 生成结果面板不复制 Tool 详情 | DeepSeek Harness 轨迹功能已经显示多个 Tool 的参数、结果和事件顺序；本项目右列只投影 ComfyUI 运行与媒体。 |
| 底模只作为上下文资源查询条件 | 用户选择的底模 ID 用于筛选生成模型、LoRA、画师或画风、画师串和 Workflow 模板；底模筛选值不生成消息上下文引用。 |
| `CatalogKind` 与 `ContextKind` 使用不同边界 | `CatalogKind` 保留 `base-model` 查询能力；`ContextKind`、`ContextRef`、`ContextSnapshot` 和 `ReferenceCodec` 在类型与运行时 schema 中排除 `base-model`。 |
| 数据源仓库提供两个只读 CLI 表面，当前项目只实现对应 adapter | 现有语义 CLI 扩展 Agent 安全 Catalog Operation；Host 私有 CLI 从同一个 OpenAPI schema 读取 Source Operation。新项目和迁移后的 Skill 不能静态导入数据源仓库内部模块。 |
| 数据源仓库只提供实例、模板和目录数据的只读 CLI | 用户明确要求任务运行与媒体保存不能在数据源仓库中持久化。 |
| 当前仓库拥有 `run_id`、内部来源快照、内部请求快照、本次实际 Workflow JSON、API Workflow JSON 和媒体文件 | 当前仓库必须成为任务运行和结果的唯一持久事实来源。 |
| 两个 Workflow JSON 在远端提交前同时持久化 | 本次实际 Workflow JSON 是可导入 ComfyUI 前端的完整图；API Workflow JSON 是实际提交 `/prompt` 的执行图。浏览器只下载前者；Host 私有逻辑读取后者。 |
| Harness `ctx.jobs` 只代理一个持久 `run_id` 的当前观察过程 | 该注册表能够向 Agent 和现有 Web UI 提供实时任务状态，但其进程内记录不能替代当前仓库的运行数据库。 |
| DeepSeek Harness 决定迁移后 Skill 的执行环境 | 原仓库的 Skill 可见性要求不能替代 DeepSeek Harness 的 Skill provider、profile 和工具注册行为。 |
| 完善原数据源 CLI 并通过 Harness Tool 提供给 Skill | 用户要求沿用“CLI 提供结构化数据、Harness 负责 Tool 注册和调用”的机制，不创建第二套 Skill 数据服务。 |
| 一个权威 OpenAPI schema 投影两个 discovery/CLI 表面 | `/internal/semantic` 只投影 Agent 安全 Catalog Operation；Host 专用的本机只读 discovery 只投影 Source Operation。Harness 不把 Source Operation 注册为 Agent Tool、Skill Tool 或浏览器 RPC；本版本不认证其他本机进程。 |
| 两个 discovery 使用同一契约身份 | Catalog discovery 与 Source discovery 返回相同的 `contract_id` 和 `contract_version`；Host adapter 只接受配置明确列出的版本，不猜测、不回退。 |
| ComfyUI 实例属于 Execution Route | 浏览器用户可以明确选择安全实例 ID；未选择时 Host 使用配置的默认实例。明确选择的实例不可用时失败，不静默切换。 |
| 当前仓库使用一个运行 SQLite | 每条运行记录保存 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id`；运行文件按 `workspace_id/run_id` 分区，数据源仓库不保存运行产物。 |
| Run Repository 是运行状态权威来源 | Harness Session 日志只保存原生 Generation Tool Call 与包含 `run_id` 的 Tool Result；Host 不写入持久 `generation.run.*` 状态事件，浏览器通过非持久通知触发重新读取。 |
| `submitting` 恢复为 `submission_unknown` 且不自动重提 | 远端可能已经接收，但本仓库未确认并保存 `prompt_id`，因此无法证明再次提交安全。 |
| 依赖 advisory、build-script 与 frozen install 门禁均已通过 | 来源 Harness 的 12 个 high advisory 已逐项处理，当前项目完整与 production audit 均为 0；`allowBuilds` 明确允许五个已经完成安全审计的精确版本。 |
| 正式 DeepSeek Harness 宿主只安装到当前仓库 | 用户指定原 Harness 目录只供调研；当前项目必须拥有并隔离自己的宿主安装和持久数据。 |
| “当前轮次结果”按 Session ID 与数字 `turn` 投影运行 | 一个 Session 有多个聊天轮次，并且每轮可能关联零个或多个 `run_id`；Session 最新运行不能替代轮次关联。 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 当前目标目录没有现有页面路由可挂载原型 | 方案采用明确命名的临时 prototype 页面；正式实现阶段重写获选交互。 |

## Resources
- `/Volumes/4Tdisk/work/AI2/deepseek-harness`
- `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`
- `/Users/fzfz/.codex/skills/prototype/UI.md`

## Visual/Browser Findings
- 桌面宽度下，页面稳定显示会话列表、聊天区和生成结果三个并列区域；右列 Workflow 状态轨、运行元数据和媒体卡片保持清晰层级。
- 390 × 844 视口下，页面一次只显示会话、聊天或结果中的一个区域；底部移动导航能够切换三个区域，上下文选择器使用全屏布局。
- 上下文选择器使用原生模态对话框；浏览器验证确认 `:modal`、背景滚动锁定、Escape 关闭和焦点返回到“添加上下文”按钮。
- 角色 Session 的第一轮关联一个运行，第二轮不关联运行；普通“画风参数对比”Session 的第一轮关联两个运行。没有运行的聊天轮次不会显示该 Session 其他聊天轮次的结果。当前系统不存在专用 LoRA Session，LoRA 只是一种可选运行参数。
- 普通画风参数对比轮次点击失败运行的“定位结果”后，右列仍显示该聊天轮次的成功运行和失败运行，并只高亮目标卡片。
- 连续发送两条消息会创建两个独立聊天轮次和两个不同的 `run_id`；每段 Agent 输出和 Tool 按钮保留在所属聊天轮次。
- 用户在角色 Session 新增两轮后切换到视频 Session，再返回角色 Session 时，新增聊天轮次、三个运行、会话运行数量和“本会话结果”均保留。
- 运行卡片、会话媒体卡片和全局媒体卡片都按所属 `run_id` 下载本次实际 Workflow JSON，文件名以 `-workflow.json` 结尾；页面不存在 API Workflow JSON 下载按钮。
- 左侧“所有媒体”入口打开居中媒体库。全局媒体库按会话、聊天轮次、媒体种类和保存时间筛选；右列会话媒体库固定当前 Session，并按聊天轮次、媒体种类和保存时间筛选。两个媒体库复用固定尺寸卡片与分页行为。
- 左侧“所有 ComfyUI 异步任务”入口打开居中任务列表。任务列表按会话、聊天轮次和创建时间筛选并独立分页；每行显示本仓库状态、ComfyUI Job 原始状态或尚未取得 Job 的具体原因、`run_id`、可用的 `prompt_id` 和实例名称。排队与运行中任务通过确认弹窗演示单 Job 取消，其他状态显示不能取消的具体原因。
- 静态原型 fixture 仍使用页面内部字符串键关联演示轮次与 `run_id`；该键不是正式契约。正式组合使用 DeepSeek Harness 原生 Session ID 与数字 `turn`，Skill 交互由 DeepSeek Harness 原生会话输入区负责。
- 默认角色 Session 的 `turn_portrait_03` 同时显示队列等待、ComfyUI 执行中、保存媒体和提交结果未知四个真实关联运行；普通画风参数对比 Session 同时显示成功和失败运行。用户不需要操作底部原型状态选择器才能看到这些状态。
- 页面删除没有实现行为的“新建会话”和“会话选项”按钮。聊天轮次按钮改为“第 N 轮 · 本轮任务摘要 / 查看 N 项 ComfyUI 运行”，右列同时显示任务摘要和轮次序号，使按钮动作与结果来源可见。
- 页面为会话搜索、上下文搜索和聊天输入补充明确名称；页面提供“跳到生成工作区”的键盘入口；媒体元素预留固定宽高；上下文对话框限制自身滚动范围。
- 失败和提交结果未知卡片不提供绕过 Harness 的直接提交按钮；卡片要求用户通过新的聊天消息请求新运行。当前轮次卡片使用没有播放按钮的静态视频封面和音频波形；媒体库卡片打开本地 MP4 或 WAV 原文件。媒体筛选无匹配时显示筛选空态，不声称 Session 没有媒体。
- 上下文选择器把底模放在独立筛选栏中；底模不出现在资源种类、草稿标签或已发送消息的上下文快照。右列删除 Tool 详情标签；聊天 Tool 调用仍可定位 `run_id`，完整调用详情由 DeepSeek Harness 轨迹功能展示。

## 2026-08-20 Dependency Advisory Audit

- 只读来源仓库 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 当前提交是 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`；`pnpm-lock.yaml` SHA-256 是 `f517dc3978d57531cda747df62a2abdde1df5b9f25415fcf1fc5d51f8b7547ea`。来源仓库包含用户未提交文件，本任务不修改该仓库。
- 对来源 DeepSeek Harness monorepo 执行 `pnpm audit --prod --registry=https://registry.npmjs.org --json` 复现 0 critical、12 high、12 moderate、1 low；来源 monorepo 的完整开发闭包是 0 critical、15 high、20 moderate、3 low。
- 12 个 production audit 条目不是 12 个独立升级动作：三个 `brace-expansion@5.0.6` high 可由 `5.0.9` 同时处理；两个 `js-yaml@4.2.0` high 可由 `4.3.1` 同时处理；两个 `fast-uri@3.1.3` high 可由 `3.1.5` 同时处理；两个 `nanoid@3.3.12` high 可由 `3.3.18` 同时处理；`undici@7.28.0`、`ip-address@10.2.0`、`postcss@8.5.15` 各需要一个版本处理结论。
- 原 DeepSeek Harness monorepo 的 production audit 包含 E2B、MCP、subagent 与 test-support workspace 路径。在当前项目建立 `package.json` 和 lockfile 之前，计划编写者没有把来源 monorepo 的 12 条路径声明为当前项目 production closure；随后生成的当前项目 lockfile 已经通过完整闭包与 production 闭包审计。
- 本机 `ctx7@0.3.5` 低于 registry 当前 `0.5.8`。依赖规则禁止为了文档查询临时安装或运行未审计的新版本，因此本任务不升级 ctx7，公告证据改用官方 pnpm、npm 与 GitHub Advisory 来源。
- 当前项目 lockfile SHA-256 是 `31575c342f4838904459d5b3daccad309ef3a1f227ef0fb9b0f982168e46e3c3`。完整闭包包含 591 个依赖，production 闭包含 475 个依赖；两个范围的 critical、high、moderate 和 low advisory 均为 0。
- 当前项目实际包含 `js-yaml@4.3.1`、`nanoid@3.3.18` 和 `postcss@8.5.26`。当前项目不包含 `brace-expansion`、`fast-uri`、`undici` 或 `ip-address`；相应 override 防止后续受影响版本进入 lockfile。
- `strict-dep-builds` 发现的五个精确版本已经完成安装脚本审计。`allowBuilds` 明确允许 `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7`、`@google/genai@1.52.0`、`koffi@3.1.5`、`node-pty@1.2.0-beta.15` 和 `protobufjs@7.6.5`，不裁剪五个依赖包的 lifecycle script。
