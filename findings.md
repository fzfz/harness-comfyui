# Harness ComfyUI 原型方案调研结果

## 2026-08-21 Harness 核心零改动审核

- 用户要求 DeepSeek Harness 核心仓库和已安装的 `@deepseek-ai/*` package 保持不变；当前项目的全部 Host 功能、Client UI、会话输入扩展、Tool、Jobs、Skill、媒体访问和生命周期组合只能使用 Harness 对外导出的插件接口。
- 父 Issue、Ticket 01 的调研表与 PRD 02 已经记录部分公开接口和 `root`、`sidebar`、`conversation` 占用边界，但是 Issues #3–#15 尚未逐票内联核心零改动硬门禁，也没有逐票列出完成产品任务所使用的公开接口。
- 本轮只把 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 的提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 及当前项目安装的精确 rc.7 package 当作接口证据；来源仓库中的未提交文件不作为规格证据。
- 如果某张 Issue 的产品任务没有对应的已导出插件接口，计划编写者必须在实现开始前改写该任务或把该 Issue 标记为阻塞；计划执行者不得通过核心补丁、修改 `node_modules`、deep import、复制 Harness 源码或 DOM 劫持补齐缺口。
- `ui-layout`注册的AppFrame是公开`root` single slot的实际winner，并合法声明`sidebar`、`conversation`、`details`与`shell.overlay`。项目必须保留该root，不注册第二个root。
- `ui-conversation`注册的ConversationRoot继续占用`conversation`并声明`conversation.session.header`、`conversation.view`、`conversation.composer.bar`与`conversation.input.overlay`。项目以`priority: -10`替换`sidebar`、`details`、session header、`conversation.view`中`id: "chat"`的occupant和composer bar；项目注销这些registrations后，上游occupants自动恢复。
- 项目composer渲染ConversationRoot传入的`conversation.input.overlay`，并用公开`useInput`、`inputActions`与`ctx.inputTriggers.sessionOf(sessionScope)`连接textarea。该挂载链保留`ui-input-trigger`与`ui-skill`拥有的原生`/`候选菜单，不需要公开导出上游`MenuView`组件。
- 本版本只实现和验收`1440×1000`桌面三列及原型列宽关系；移动端布局、移动端导航、窄屏single-panel与原型CSS断点不属于本版本。
- 桌面列宽存在一个需要用户决定的可见差异：原型`grid-template-columns: minmax(236px, 0.68fr) minmax(500px, 1.65fr) minmax(340px, 1fr)`在`1440px`下约为`294 / 714 / 432`；rc.7 AppFrame首次打开右列后的默认宽度是`280 / 800 / 360`。
- rc.7公开`ILayout`只提供`toggleSidebar()`、`openDetails()`和`closeDetails()`，没有设置sidebar/details像素宽度的方法。AppFrame的内部`setSidebar`与`setDetails` actions没有通过public plugin face暴露；项目不能在不操作Harness DOM的情况下把初始列宽改成原型数值。
- 用项目root替换AppFrame可以实现原型列宽，但现有ConversationRoot是`conversation.input.overlay`的唯一declarer；非winner entry的声明仍然存在，项目root既不能重新声明该slot，也没有render授权。项目root因此不能呈现`ui-input-trigger`已经注册的原生MenuView。当前约束下不能同时满足“原型精确初始列宽”和“项目不实现第二套Skill菜单”。
- 原型只规定composer可见结构与发送行为，没有规定项目必须拥有或修改Harness InputHub状态。实施规格选择项目按Session保存发送前的正文、ContextRef、File和preview URL；这些是临时UI状态，Harness接受消息后原生Session日志成为唯一持久权威。
- 项目发送协调器解析每个ContextRef并构造固定`generation-context.v1` block，把图片编码为公开`PromptContentPart`，然后只调用一次公开`SessionFace.prompt()`。失败保留本次草稿与对象，成功只清理本次发送快照并revoke对应object URL；该路径不修改AgentLoop，也不创建第二个消息后端。
- `@deepseek-ai/dsh-client-ui-primitives` 根 package export 公开 `Modal`；该组件使用 portal、`role=dialog`、`aria-modal=true`、Escape 和遮罩关闭。项目的上下文选择器、全局媒体库、异步任务列表和取消确认可以直接组合该公开 React primitive。
- Harness Typert 为 Loader plugin 提供公开生成与发现链路：插件 package 可以导出 `./typert`，`@deepseek-ai/dsh-typert-loader` 会读取并注册 `TYPERT` contribution；Typert registry 也公开 `ctx.typert.register()`。Host 业务 Service 使用 Typert Remote 描述，Client 通过 generated `/remote` contribution 与 `ctx.remote.$mount()` 调用。
- 当前项目的 Catalog 查询、Run Repository 查询、任务取消、媒体列表和 Workflow 下载元数据可以定义在项目自己的 Host Service 中，并由项目自己的 Typert 生成产物向 Client 暴露；该链路不要求向 Harness `api/remotes` package 写入项目代码。
- 项目 Client plugin 可以从自身 package 的 generated `/remote` export 导入 `TypertRemoteContribution`，再调用公开的 `ctx.remote.$mount()`；因此项目不需要修改 Harness `@deepseek-ai/dsh-api-remotes` 的固定 namespace 列表。
- rc.7 的 Host→Client forwarded event 只允许 `@deepseek-ai/dsh-api-remotes/src/remote-events.ts` 中固定的 11 个 Harness 事件。`generation.run.changed` 不在该 allowlist；增加该事件必须修改 Harness application assembly，因此现有“Host 发送非持久 Run Change Notification”设计违反核心零改动要求。
- Run状态刷新必须由项目Client plugin通过项目Typert Remote查询Run Repository。页面可见且中列Generation Tool行或右列运行卡存在可见非终态Run时，唯一`GenerationRunProjectionStore`按`refreshAfterMs`继续查询；中列和右列同时可见时每周期只查询一次；关闭右列但中列Tool行仍可见时继续查询；页面隐藏、两处都没有可见消费者或全部终态时停止。该轮询使用公开unary Remote，不修改Harness forwarded event allowlist。
- `@deepseek-ai/dsh-tools` 根 export 公开 `defineTool()`、`ToolRuntime`、`ctx.tools.register()`、输出 schema、`presentCall()` 与 `presentResult()`。项目可以把 `generate_with_comfyui` 注册为原生 Harness Tool，并让 Tool Result 持久记录 `run_id`；该实现不需要修改 AgentLoop、Session 日志格式或原生 Tool UI。
- Tool 的`output.presentationMeta()`、`presentCall()`和`presentResult()`是回放安全的公开呈现接口。`ui-conversation`把Tool事件投影到公开`ConversationSnapshot`；项目Workbench依据该projection呈现Generation Tool行，项目右列只从Run Repository投影生成运行与媒体，不复制Tool execution identity。
- `@deepseek-ai/dsh-jobs` 根 export 公开 `ctx.jobs.start/list/get/read/kill/wait`、`onJobDone()`、`onJobsChanged()` 和 `attachController()`；plugin 可以通过 declaration merge 增加自己的 `JobKindMap` 条目。该服务只保存当前进程状态，不能承担 Generation Run 的跨重启权威状态。
- 项目可以把当前 Agent 等待某个持久 `run_id` 的过程登记为 Harness Job，并把取消等待映射到 `ctx.jobs.kill()`；ComfyUI Job 取消仍必须调用项目 Run Repository/Transport 的公开业务接口，不能把进程内 Job ID 当作持久 `run_id`。
- `@deepseek-ai/dsh-skill`根export公开`ctx.skills.register()`与`registerProvider()`；`@deepseek-ai/dsh-skill-filesystem`已公开并实现`<projectRoot>/.dsh/skills`、`<projectRoot>/.agents/skills`、`customSkillDirs`和bundled skill root扫描。Prompt Skill可以作为Release Artifact内项目Skill交付并由现有provider加载；Harness随附`ui-input-trigger`与`ui-skill`负责输入`/`后的候选和文本插入，Host继续负责调用校验。
- `@deepseek-ai/dsh-host-webserver` 根 export 公开 `ctx.webServer.register({ kind: 'exact' | 'prefix', path, handler })`，并保证 named route 在 SPA fallback 之前匹配。项目 Host plugin 可以注册自己的同源媒体与 Workflow 下载前缀，不需要修改 `frontend-static` 或 `/api` route。
- 项目媒体路由必须只接受项目生成的 `media_id`/`run_id`，通过 Run Repository 解析服务器内路径，拒绝 URL 路径穿越并返回持久文件的真实 `Content-Type`；浏览器响应不得包含本机路径、ComfyUI URL 或 Authorization。项目 Workflow 路由必须只返回该运行保存的 Actual Workflow JSON，不返回 API Workflow JSON。
- `@deepseek-ai/dsh-client-modules` 会扫描 Loader entries 的 `package.json` `dsh.client` 声明，并从 `exports["./client"]` 加载构建后的 Client plugin bundle。项目 package 只要作为 profile dependency 与 Loader entry 安装，并提供公开 `./client` export，就能进入真实 Harness Web composition；不需要改 Harness Web shell。
- `@deepseek-ai/dsh-client-ui-slots`根export明确规定single slot或相同list id的不同`priority`可以shadow，最低值渲染。项目分别替换产品需要的公开occupant，不替换AppFrame root或ConversationRoot。
- `ui-conversation`继续注册标准event definitions与snapshot builder；项目`conversation.view`的`chat` occupant从公开`ConversationSnapshot`呈现消息、Agent partial和Tool call/result，项目`details` occupant从Run Repository呈现运行与媒体。
- `ToolRunContext` 公开 `callId`、`name`、`arguments`、`signal` 和当前 `agent`；`agent.id` 与 `agent.session.id` 是同一个 Session ID。AgentLoop 会在调用 Tool body 前把 `tool/call` 写入 `agent.session.events`，该公开事件包含 `turn`、`step`、`callId`、Tool 名和 arguments。
- `generate_with_comfyui` Tool body 可以用 `exec.callId` 在 `exec.agent.session.events` 中读取唯一的原生 `tool/call`，取得 Harness 数字 `turn`；实现不需要修改 Tool pipeline，也不能要求模型传入 `session_id`、`turn` 或 `call_id`。
- rc.7的`user/message`事件本身没有数字`turn`。Generation Tool Host adapter必须以`exec.callId`对应`tool/call`的数字turn与`seq`为终点，以同turn最近唯一`turn/start.seq`为起点，只在该事件区间内核对`comfyui-generate`的`skill-invocation` source；扫描整个Session会错误继承上一turn授权。
- rc.7公开`ToolResultNode.call`在配对Tool Call尚未进入当前history window时可以是`null`。实时/完整窗口用`call.name`与Tool Result meta校验；截断窗口使用公开`callId`、当前Session和meta `run_id`调用项目`GenerationRuns.resolveToolResultLink()`，由Run Repository持久`(workspace_id, session_id, call_id) -> run_id`映射完成重放校验。

## Requirements
- DeepSeek Harness 必须作为 Agent 宿主。
- HTML 前端必须包含会话列表、单会话流式聊天区和生成结果卡片区。
- 用户每次发送消息前必须能够插入结构化上下文；上下文类型来自数据源仓库并能够持续扩展。
- 用户必须能够在项目中列挂载的Harness原生composer输入`/`并使用Harness原生Skill菜单；Host必须在执行前重新发现并校验Skill。本项目不得实现第二套Skill菜单、选择状态、provider或invocation policy。
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
- 本项目不使用 `ConversationNodeDefinition` 复制 Generation Run 状态。Harness Session 日志只保存原生 Tool Call/Tool Result 与 `run_id` 关联；Run Repository 保存权威运行状态，Client 通过项目 unary Typert Remote条件轮询。
- DeepSeek Harness 已有浏览器端附件、Skill、任务、交付物、会话、侧栏、布局、工具结果与工作流运行 UI 包；方案应组合这些扩展点，不应另建一套独立聊天协议。
- DeepSeek Harness 的 Agent 输入通过统一 inbox 接收；`agent.inject()` 添加的上下文会等待下一条能够唤醒 Agent 的消息，适合“选择上下文后随本次用户消息发送”的交互。
- 数据源仓库当前可见的仓库级 Skill 只有 `anima-prompt-builder` 和 `wai-sdxl-prompt-builder`；管理 Skill 与会话 Skill 的宿主逻辑主要位于 `app/pi` 和 `app/session`，需要继续定位它们的实际运行目录与契约。
- DeepSeek Harness默认`AppFrame`实现`sidebar`、`conversation`和`details`三列。项目保留该frame，通过公开occupants实现原型桌面内容；本版本不实现或验收移动端与窄屏行为。
- DeepSeek Harness的`details`是AppFrame内部single slot。项目以`priority: -10`注册结果列occupant，并在选中真实Session后调用公开`ctx.layout.openDetails()`使右列可见。
- DeepSeek Harness默认输入状态机支持引用chip，但项目Workbench没有复用其私有附件registry。项目以自己的临时`ContextRef`与File呈现原型输入区，并通过公开`SessionFace.prompt()`一次提交。
- DeepSeek Harness 的 Skill 文件提供器能够读取项目 `.dsh/skills`、项目 `.agents/skills` 和显式 `customSkillDirs`；Skill UI 使用 `/skill-name` 触发器并从当前会话的 Skill 列表 RPC 读取候选。
- 项目Context resolver异步解析`ContextRef`并生成`generation-context.v1`模型文本；任一解析失败会在调用`SessionFace.prompt()`前停止，并保留临时正文、chip与附件。
- 一次`SessionFace.prompt()`能够把正文、上下文block和图片作为同一用户动作提交，不需要修改AgentLoop；项目Workbench的user-message renderer负责把完整block折叠呈现。
- DeepSeek Harness 的 `agent.inject()` 能够保存带插件来源的非唤醒上下文，但单独执行“注入 RPC”后再执行普通 prompt RPC 会留下失败窗口；当前方案不采用两个独立浏览器请求拼接一个用户动作。
- 数据源仓库现有会话服务把 `selection` 转换为 `ui_explicit` 快照后构建 Pi prompt；这套选择快照语义可以迁移为新上下文查询模块的输入，但旧 Pi 会话持久化与三轮限制不应迁入 DeepSeek Harness 会话。
- 源数据代码实施基线 `2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a` 已发布为 `v0.81.0`。该revision的 `/internal/semantic` discovery 暴露六个只读操作：`querySemanticWorksForSkill`、`querySemanticCharactersForSkill`、`querySemanticStylesForSkill`、`querySemanticPromptTermsForSkill`、`querySemanticGenerationLorasForCli` 和 `querySemanticArtistPromptStringsForCli`。
- 同一实施基线的 `imagegen-semantic-query` CLI 根据 `/internal/semantic` OpenAPI 3.1 文档动态生成参数和调用方式；它没有底模、生成模型、ComfyUI 实例、模板或媒体操作，也不支持新的 Catalog `search`/`resolve` 结构化协议。
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
- 同一 ToolExecution 的传输或恢复重试复用原 `(workspace_id, session_id, call_id)` 与原 `run_id`。用户通过新的聊天消息明确要求 Agent 再次生成，且在 `submission_unknown` 情况下确认重复任务风险后，Harness 才创建新的 `call_id` 和 `run_id`；`submission_unknown` 不会自动重提。
- 一个 DeepSeek Harness Session 包含多个聊天轮次；每个聊天轮次可以包含零个或多个由 DeepSeek Harness 记录的 Skill 调用事件，并且可以关联零个、一个或多个 ComfyUI `run_id`。本项目只消费这些宿主事件，不保存自有 Skill 选择状态。右列“当前轮次结果”必须使用 Harness 原生 Session ID 与数字 `turn` 投影关联运行，不能显示 Session 最新运行作为替代。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Harness Tool 向迁移后的 Skill 返回结构化结果 | DeepSeek Harness 决定 Skill 的实际文件和工具可见性；本项目通过 Host 工具隔离数据源实现，不由 `SKILL.md` 声明宿主沙箱。 |
| DeepSeek Harness拥有Skill选择、发现与调用权威 | 项目保留ConversationRoot并在项目composer中渲染原生`conversation.input.overlay`；用户输入`/`后由Harness显示候选并插入普通`/skill-name `文本，Host在Agent执行前重新按Session cwd和preset scope验证并加载Skill。 |
| 只有显式`comfyui-generate`调用链可以创建ComfyUI运行 | `generate_with_comfyui`是目标Harness profile授权的普通Tool，但Host adapter必须在创建Run前通过公开Session event核对同一数字`turn`存在`comfyui-generate`的原生`skill-invocation`Context。缺失时返回`GENERATION_SKILL_INVOCATION_REQUIRED`并且不创建Run。 |
| ComfyUI 任务模块拥有工作流绑定、提交、轮询、媒体保存和请求快照 | 多个 Skill 与页面调用者只需要学习一个较小接口，复杂实现集中在一个模块中。 |
| 原型不执行真实写操作 | 原型问题是页面信息层级和交互是否正确，真实写操作不增加当前问题的判断价值。 |
| 用户插入的上下文必须形成会话日志事件 | DeepSeek Harness 要求每个模型可见输入都能够从会话日志重建。 |
| 项目Workbench保留AppFrame与ConversationRoot并替换可见occupants | 项目通过公开`sidebar`、`details`和conversation slots工作；ConversationRoot继续渲染原生input overlay，因此Harness Session、ConversationSnapshot、Tool projection和`/` Skill菜单保持权威。rc.7不存在已确认的桌面产品阻塞。 |
| 全局媒体库使用左侧栏入口和居中弹层 | Issue #3的项目`sidebar` occupant在原型位置直接渲染“所有媒体”入口，`ui-primitives`的`Modal`承载居中媒体库。 |
| 生成结果面板不复制 Tool 详情 | DeepSeek Harness 轨迹功能已经显示多个 Tool 的参数、结果和事件顺序；本项目右列只投影 ComfyUI 运行与媒体。 |
| 底模只作为上下文资源查询条件 | 用户选择的底模 ID 用于筛选生成模型、LoRA、画师或画风、画师串和 Workflow 模板；底模筛选值不生成消息上下文引用。 |
| `CatalogKind`与`ContextKind`使用不同边界 | `CatalogKind`保留`base-model`查询能力；`ContextKind`、`ContextRef`、`ContextSnapshot`和项目Context resolver在类型与运行时schema中排除`base-model`。 |
| 数据源仓库提供两个只读 CLI 表面，当前项目只实现对应 adapter | 现有语义 CLI 扩展 Agent 安全 Catalog Operation；Host 私有 CLI 从同一个 OpenAPI schema 读取 Source Operation。新项目和迁移后的 Skill 不能静态导入数据源仓库内部模块。 |
| 数据源仓库只提供实例、模板和目录数据的只读 CLI | 用户明确要求任务运行与媒体保存不能在数据源仓库中持久化。 |
| 当前仓库拥有 `run_id`、内部来源快照、内部请求快照、本次实际 Workflow JSON、API Workflow JSON 和媒体文件 | 当前仓库必须成为任务运行和结果的唯一持久事实来源。 |
| 两个 Workflow JSON 在远端提交前同时持久化 | 本次实际 Workflow JSON 是可导入 ComfyUI 前端的完整图；API Workflow JSON 是实际提交 `/prompt` 的执行图。浏览器只下载前者；Host 私有逻辑读取后者。 |
| Harness `ctx.jobs` 只代理一个持久 `run_id` 的当前观察过程 | 该注册表能够向 Agent 和现有 Web UI 提供实时任务状态，但其进程内记录不能替代当前仓库的运行数据库。 |
| DeepSeek Harness 决定迁移后 Skill 的执行环境 | 原仓库的 Skill 可见性要求不能替代 DeepSeek Harness 的 Skill provider、profile 和工具注册行为。 |
| 完善原数据源 CLI 并通过 Harness Tool 提供给 Skill | 用户要求沿用“CLI 提供结构化数据、Harness 负责 Tool 注册和调用”的机制，不创建第二套 Skill 数据服务。 |
| 一个权威 OpenAPI schema 投影两个只读数据表面 | `GET /internal/semantic`及其operation直接替换为新Catalog合同；不创建`/internal/catalog`且不保留旧semantic协议。Host专用的本机只读discovery只投影Source Operation。 |
| 两个 discovery 使用同一契约身份 | Catalog discovery 与 Source discovery 返回相同的 `contract_id` 和 `contract_version`；Host adapter 只接受配置明确列出的版本，不猜测、不回退。 |
| ComfyUI 实例属于 Execution Route | 浏览器用户可以明确选择安全实例 ID；未选择时 Host 使用配置的默认实例。明确选择的实例不可用时失败，不静默切换。 |
| 当前仓库使用一个运行 SQLite | 每条运行记录保存 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id`；运行文件按 `workspace_id/run_id` 分区，数据源仓库不保存运行产物。 |
| Run Repository 是运行状态权威来源 | Harness Session 日志只保存原生 Generation Tool Call 与包含 `run_id` 的 Tool Result；Host 不写入持久 `generation.run.*` 状态事件，Client 通过项目 unary Typert Remote条件轮询。 |
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

## 2026-08-21 Harness 核心零改动审核补充

- `@deepseek-ai/dsh-client-ui-input-trigger/client`公开InputTrigger服务。项目composer通过公开`useInput`、`inputActions`与InputTriggerController连接textarea，并渲染ConversationRoot传入的原生overlay；Message Context仍由项目临时`ContextRef[]`和一次`SessionFace.prompt()`负责。
- Host的Skill列表按当前Session cwd与preset scope筛选user-invocable Skill；Harness默认`ui-skill`选择器在用户输入`/`后显示该列表并插入普通`/skill-name `文本。`dsh-tool-skill`在Agent pre-step重新发现并验证Skill；本项目保留该原生交互，不替换选择呈现。
- Message Context Client在项目Workbench composer中渲染“添加本次消息上下文”按钮、chip和Modal。确认选择只更新项目当前Session的临时ContextRef列表；发送时必须重新通过真实Catalog resolve稳定ID，任何失败都阻止整条原生Session消息。
- 原型多个chip的顺序由项目临时ContextRef列表保存；不经过默认InputBar的引用插入状态机。已发送持久事实仍是同一条原生user/message text中的`generation-context.v1` blocks，不另建Session事件或数据库消息副本。
- 当前 GitHub Issues #1–#15 都已创建。父 Issue #1 当前只声明 Harness 所有权，没有逐项列出允许的公开 package/export/slot/service，也没有定义公共 seam 不足时的失败关闭门禁；每张子 Issue 必须内联补齐对应的 UI 与功能 seam，不能只依赖父 Issue 的抽象所有权句子。
- `@deepseek-ai/dsh-api-remotes/client` 只挂载 Harness 预选的五组 Remote contribution；项目生成的 `harness-comfyui/remote` 不会自动进入该固定数组。项目 Client plugin 可以在 `@deepseek-ai/dsh-api-remotes` 已提供 `ctx.remote` 后，调用公开 `ctx.remote.$mount(harnessComfyuiRemote)` 挂载自己的严格 Typert Remote contribution；该路径不需要修改 `packages/api/remotes/src/client/index.ts`。
- 项目 Client bundle 不需要把 `@deepseek-ai/dsh-api-gateway/client` 作为运行时 value import；`@deepseek-ai/dsh-api-remotes/client` 提供 Cordis 类型合并和 runtime 依赖，项目只 value-import 自己生成的 `harness-comfyui/remote` 并调用既有 `ctx.remote`。
- 后续 Host 实现会直接导入的公开 Harness packages 至少包含 `@deepseek-ai/dsh-host-webserver` 和 `@deepseek-ai/dsh-workspace`；这两个 package 当前没有出现在项目根 manifest 的 direct peer/dev dependency 列表中。Ticket 01 必须在任何安装前把实际 direct imports 的精确 rc.7 包补入 manifest、runtime manifest 同步规则、lockfile 和既有 dependency security gate，不能依赖 `dsh-base` 的传递依赖。
- `@deepseek-ai/dsh-client-modules` 的 package metadata 明确把 `dsh.client` scan、Client bundle route 与 browser lazy-CJS module table作为插件发现机制；项目只需提供公开 `./client` export 和 `dsh.client` metadata，不需要修改 Web App assembly。
- `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-jobs`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-skill-filesystem`、`@deepseek-ai/dsh-host-webserver` 和 `@deepseek-ai/dsh-workspace` 都在 rc.7 package 根 export 提供公开 service 类型或注册接口。项目规格必须只允许 package 根、`./client`、`./types`、`./remote`、`./typert`、`./presentation`、`./invariant` 和 `./package.json` 等已构建 export；即使 package metadata 暴露 `./src/*`，本项目也不得以 source export 代替稳定插件接口。
- Run Repository 的浏览器刷新间隔与 ComfyUI Jobs API 观察间隔属于不同配置对象。Ticket 01 必须为浏览器状态查询增加 `client.runRefreshIntervalMs`；Run projection Remote response 返回 `refreshAfterMs` 与是否存在非终态运行，Client 只在右列可见且存在非终态运行时按该值继续查询。
- `@deepseek-ai/dsh-skill-filesystem`的公开默认root包含当前`DSH_HOME/skills`。两个Prompt Skill、`lora-adjustment`与当前项目新增的`comfyui-generate`作为Release Artifact文件由产品安装程序复制到每个release自己的`<release>/dsh-home/skills/`；Host provider发现它们，Harness原生`/` Skill菜单显示可调用Skill，项目不增加第二套菜单、选择状态、provider或invocation policy。
- Issues #2–#15的正文和对应PRD已经分别直接列出所属功能使用的public plugin seams；执行者只按所属Issue正文落地，不负责重新调研或改变设计。当前规划审计没有发现public plugin seam阻塞。
- `docs/adr/0012-harness-core-is-immutable.md` 已接受 Harness 核心零改动决定，并明确 `cordis.patch.yml` 只允许通过 `dsh.bundle.patch` 增加项目 Loader row，不等于允许 patch Harness 源文件。

## 2026-08-21 Skill迁移方案结论

- 唯一迁移来源固定为`NoobAI-XL-FZ-PROD-ENV@799b7759029d70076791321e2b02bf53c651c98f`。该committed tree同时包含`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`和`management-skills/lora-adjustment/`。
- 与先前检查的`6bc3fc6a027eecf45ccf86dd681e30621c4bc591`相比，两个Prompt Skill目录没有变化；`lora-adjustment`目录是后续新增的完整来源包。因此统一改用`799b7759029d70076791321e2b02bf53c651c98f`不会改变已核对的Prompt知识，并补齐了遗漏的LoRA管理Skill。
- 来源Anima Skill直接读取`noobai_user_prompt.user_text`与`noobai_user_prompt.ui_explicit.selections[]`；来源WAI Skill的`references/input-contract.md`还要求种类、版本、旧调用标识、底模名称和UI选择。当前Harness产品发送普通用户正文与`generation-context.v1`文本block，不提供该旧输入对象。
- 两个来源Skill都通过`run_skill_script`调用`scripts/validate-output.mjs`，失败时调用`finalize_skill_error`，校验成功后立即结束；两个来源Skill都没有调用`generate_with_comfyui`。
- 两个来源校验器只说明旧Skill曾要求的Prompt结构：Anima使用12槽，WAI使用15位置；两者最后都形成`prompt_text`与`display_text`。用户已经明确决定新环境不迁移`run_skill_script`、`finalize_skill_error`、三次校验、五键中间输出或固定结束文本，也不通过Harness`bash`复刻这套旧执行协议。迁移后的Prompt Skill直接按Skill指令在中列返回最终单行`prompt_text`，不调用Generation Tool。
- `generate_with_comfyui`输入已经冻结为`title`、可选`instance_id`、`template_id`、模板声明的`parameters`和有序`lora_applications[]`；Host私有地补充Workspace、Session、turn和call identity。独立`comfyui-generate`只按模板安全摘要的`parameter_id`与`kind`映射Prompt和显式运行值。
- 来源Skill中只有四个语义查询工具真正参与Prompt构建：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`和`query_semantic_prompt_terms`。当前PRD 12要求两个Skill可调用十个Catalog Tool是过宽授权，不是逐Skill最小Tool合同。
- 模板安全摘要与Host-only bundle现在共享闭合`RuntimeParameterDefinition.kind`；可供`comfyui-generate`使用的模板必须恰好声明一个`kind: positive_prompt`，Skill通过该项的稳定`parameter_id`写入Prompt，不根据label或ComfyUI节点类型猜测。
- 当前消息上下文已把每个已选资源保存为`generation-context.v1`block，字段固定为`contract_id`、`contract_version`、`kind`、`id`、`label`、`source_release_version`和`snapshot`；迁移后的Skill应直接读取同一条用户消息中的普通正文和这些block，不再构造`noobai_user_prompt`包装对象，也不保留来源系统的旧调用标识字段。
- 来源文件审计显示必须改写的不是只有两个`SKILL.md`：Anima的`references/01-quick-start.md`、`02-role.md`、`03-output-protocol.md`、`semantic-query-interfaces.md`引用旧输入或旧工具；WAI的`input-contract.md`、`prompt-format-validator.md`、`semantic-tool-orchestration.md`及多个“UI已选内容”引用必须改为`generation-context.v1`语义。`agents/openai.yaml`不是Harness filesystem Skill的执行输入；两个`validate-output.mjs`和两份旧运行时校验协议不进入迁移后的发布目录。
- 当前Execution Route设计还有一处跨Ticket架构缺口：Workbench只把`instance_id`保存在浏览器草稿，但唯一发送接口`SessionFace.prompt(parts,'queue')`没有单独的项目metadata参数；如果消息中没有确定的route指令，Agent不能把用户选择传给`generate_with_comfyui`。应在同一用户text part中增加独立于Message Context的`generation-route.v1`控制block；默认实例时不写block，明确选择时只写安全`instance_id`。它不是`ContextRef`、chip或`generation-context.v1`，但由Harness原生user/message持久化并由Skill读取。
- 迁移后的两个Prompt Skill只需要四个Prompt构建Catalog Tool：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`和`query_semantic_prompt_terms`。其他Catalog Tool与Generation Tool仍可供独立`comfyui-generate`Skill或Workbench目录使用，但不属于两个Prompt Skill的运行路径。
- 用户已经纠正上一条中的生成调用：`anima-prompt-builder`与`wai-sdxl-prompt-builder`只负责生成最终Prompt；`comfyui-generate`是需求7要求新增的独立Skill，它才调用底层运行服务/Generation Tool。两个Prompt Skill不得直接调用`generate_with_comfyui`，也不得把生成运行作为自身成功条件。
- 最初需求明确分成两项并列Skill责任：需求5迁移现有会话/管理/后续Skill并把数据读取改为可扩展Catalog Tool；需求7单独新增`comfyui-generate`，调用需求6的ComfyUI异步底层服务并修改模板字段；需求8右侧第三列显示需求7产生的`run_id`结果。
- 预期用户链路应保持显式Skill选择：用户先调用Anima或WAI Prompt Skill取得最终Prompt文本；需要实际生成时，用户再在普通Harness Session中调用独立`comfyui-generate`Skill，并把该Prompt作为当前消息或明确引用上一轮Prompt交给它。Harness Session保留两次用户消息、两个Skill调用和第二步产生的Generation Tool Call；Prompt Skill调用本身不创建`run_id`。
- 最初需求中的“管理Skill”包括来源系统`management-skills/lora-adjustment/`。PRD12、Ticket12与父Issue已把该Skill补为第三个迁移Skill；`lora-adjustment`与两个Prompt Skill、`comfyui-generate`同属Harness可调用Skill，但职责不同。
- 来源系统当前`lora-adjustment`读取`original_generation_request`、`prompt_text`、有序`loras[]`快照、MODEL/CLIP权重范围和`base_lora_node_type`，输出调整后的完整单行`prompt_text`及按原顺序返回的每个`source_lora_id`、MODEL/CLIP权重和实际触发词。迁移必须保留这项产品能力，但必须移除旧环境的`run_skill_script`、`scripts/validate-output.mjs`、`scripts/report-error.mjs`调用协议，并重新定义适配Harness的输入输出合同。

## 2026-08-21 Skill Tool 注册与 Message Context 数据责任审计

- 当前方案已经选择`Skill → Harness Tool → StructuredCliGenerationCatalog → imagegen-semantic-query CLI → 数据源`，并明确只有Host adapter启动CLI；Skill不直接执行CLI，Source Operation不注册为Agent Tool、Skill Tool或浏览器Remote。
- GitHub Issue #13已经要求重写三个迁移`SKILL.md`的输入、Tool与直接assistant输出协议，并删除`run_skill_script`、finalizer、旧Pi调用标识和来源运行时说明；GitHub Issue #5已经完整定义`generate_with_comfyui`的`defineTool()`、`ctx.tools.register()`和结构化结果。
- GitHub Issues #4、#6与#13尚未共同冻结Catalog Tool的唯一注册模块、十个Tool逐项名称、Tool description、`defineTool()`输入/输出schema、OpenAPI operation到CLI参数的确定映射、CLI退出/协议错误到Harness Tool错误的映射、Cordis卸载注销责任、profile授权和冲突失败行为。Issue #13也没有逐文件列出旧`queries[]/groups[]`工具说明如何改写为新的`mode: search | resolve`、分页与稳定ID合同。当前三票不能据此直接实现完整Skill Tool迁移。
- “添加本次消息上下文”正式支持九类可插入资源：`model`、`lora`、`work`、`character`、`style`、`prompt-term`、`artist-string`、`comfyui-template`与`media`。Ticket 03首次实现`character`与`comfyui-template`，Ticket 05实现其余七类并复用前两类。`base-model`只用于筛选五类Catalog请求；`comfyui-instance`只属于Execution Route，两者都不能转换为`ContextRef`。

## 2026-08-21 Catalog Tool与数据源仓库交接结论

- 数据源仓库的OpenAPI、10个Catalog handler、2个Host-only Source handler、Catalog/Source discovery、`imagegen-semantic-query`、`imagegen-comfyui-source-read`、测试和版本发布必须由数据源仓库自己的Issue与发布流程实施；当前仓库Issue不得跨仓库修改这些对象。
- 当前仓库新增`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`作为数据源仓库实施输入。数据源版本未发布前，当前仓库Issue #4保持`needs-info`，Issues #5、#6与#13通过既有依赖链等待；当前仓库只消费发布commit/tag、contract version、CLI和release acceptance。
- Ticket 01交付唯一`registerProjectTools()`；只有`register-project-tools.ts`直接调用`ctx.tools.register()`。Ticket 03、04、05分别通过同一入口注册首批Catalog Tool、Generation Tool和完整十个Catalog Tool。
- 十个Catalog Tool已经冻结名称、description、operationId、HTTP path、允许筛选、闭合search/resolve输入、CLI参数映射、失败清理和Host卸载注销。旧批量查询合同和来源旧LoRA Tool不属于新Skill可见接口。
- 三个迁移Skill已经冻结逐文件结果与真实Harness黑盒测试：Anima和WAI按一个目标一次search调用四个Prompt Catalog Tool；LoRA按快照顺序一个稳定ID一次resolve调用`query_semantic_loras`；三者不运行来源脚本、不调用finalizer、不直连CLI或数据源HTTP。
- Message Context Modal左侧固定九行：生成模型、LoRA、作品、角色、画师或画风、提示词条目、画师串、Workflow模板、已保存媒体。Ticket 03首次实现角色与Workflow模板，Ticket 05在同一Registry补齐其余七行；底模只在顶部筛选五类请求，ComfyUI实例只在输入区Execution Route中出现。

## 2026-08-23 v0.82.2 Harness envelope 消费决定

- 源数据仓库当前 detached tag 为 `v0.82.2`，commit 为 `621c35b071a4f23c1cd27485e1cca23faf88f7c9`，服务运行在 `127.0.0.1:18093`；本次只读核对未修改源仓库。
- 十个 Catalog operation 的 live CLI search、两个实例 Source 读取和真实 TemplateBundle `1/2/37` 均退出码 0；上一轮 v0.82.1 的模板失败结论不再成立。
- v0.82.2 的 Catalog discovery 是裸 OpenAPI 3.1 对象；Source discovery 是 `status/message/results/page/page_size/total_count` envelope，OpenAPI 位于 `results[0]`；两者都没有顶层 `contract_id`、`contract_version` 或 `source_release_version`。
- v0.82.2 CLI 只验证非空、严格 UTF-8、单个 JSON 值并原始透传；业务响应 Schema 由 Harness adapter 验证。Catalog 与 Source 成功响应统一采用 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count`。
- 已选择正式采用 v0.82.2 envelope：Harness Installation 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`，这两个字段是 Harness-owned pin，不是从 live body 读取；adapter 依据唯一结构化合同文件校验 discovery、分页 envelope、operation metadata 和业务字段。
- Source TemplateBundle 的 `expected_output_node_ids_json: null` 不得由 Harness 推导或补默认值；模板生成入口必须失败关闭并返回 `SOURCE_TEMPLATE_UNAVAILABLE`，直到真实 Source 响应提供非空、通过 schema 的输出节点数组。
- 已将 v0.82.2 合同同步到实际部署 gate：`config/base.json`、`config/schema.ts`、`scripts/deploy/contracts.mjs`、`scripts/deploy/preflight.mjs`、`scripts/deploy/health.mjs` 和所有部署测试夹具均使用 `sourceReleaseVersion: "0.82.2"`；Catalog discovery 与 Source discovery 分别按两种 live shape 校验。
- 已将 `config/source-contract-v0.82.2.json` 纳入 Release Artifact 文件清单，并把同一消费合同同步到 GitHub Issues #1–#15；源数据仓库未被修改。
