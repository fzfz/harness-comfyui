# DeepSeek Harness ComfyUI 工作台原型方案

## 1. 方案目标

本方案定义一个运行在 DeepSeek Harness Web客户端中的三列式ComfyUI工作台。用户在中列与一个DeepSeek Harness Agent进行流式聊天，并在发送每条消息前选择数据源仓库中的结构化上下文；中列项目composer渲染Harness原生input overlay，用户输入`/`后由`ui-input-trigger`与`ui-skill`显示当前Session可调用Skill并完成文本插入，当前项目不实现第二套Skill菜单。Generation Tool持久接纳`run_id`后，中列Tool行持续显示该运行的异步状态摘要，右列按同一`run_id`展示详细生成状态、图片、视频、音频和可导入ComfyUI前端的本次实际Workflow JSON。两处从唯一Client Run投影Store读取同一Run Repository快照。API Workflow JSON由当前仓库保存并提交给ComfyUI，不作为浏览器下载项。

当前阶段交付方案和零依赖静态原型。当前阶段不复制 Skill、不修改两个来源仓库、不提交真实 ComfyUI 任务、不安装依赖。

`/Volumes/4Tdisk/work/AI2/deepseek-harness` 只作为 DeepSeek Harness 接口、版本和插件机制的只读调研来源。正式实现阶段必须把 DeepSeek Harness 宿主、本项目 Host 插件和项目级 Skill 安装到 `/Volumes/4Tdisk/work/AI2/harness-comfyui`；计划执行者不得修改只读调研来源目录中的文件。

## 2. 执行主体

| 名称 | 定义 | 负责的动作 |
|---|---|---|
| 浏览器用户 | 使用 DeepSeek Harness Web客户端的人 | 在项目Workbench选择会话、选择上下文、选择或输入Host公开的Skill、发送消息、查看生成结果、下载JSON |
| DeepSeek Harness Agent | DeepSeek Harness 当前会话中的单个 Agent | 读取当前用户消息及其上下文快照、选择是否调用模型工具、向用户输出流式文本 |
| Harness ComfyUI插件 | 安装到当前仓库所拥有的DeepSeek Harness宿主中的项目Host/Client插件 | Client通过公开bundle row覆盖停用上游`ui-layout`，向内建`root`注册唯一桌面Shell并声明标准列slot；Client继续运行ConversationRoot与Harness原生`/` Skill菜单；Host注册数据源只读CLITool、项目Typert Remote、ComfyUI模型Tool和同源媒体路由；不修改Harness Core |
| 数据源只读 CLI | 由 Installation 配置指向的 `NoobAI-XL-FZ` 已发布版本提供的结构化命令行接口 | 查询目录数据、ComfyUI 实例连接数据、Workflow 模板、模板 revision 和运行时配置；不创建运行，不保存媒体，不更新数据源数据库 |
| 本仓库 ComfyUI 运行服务 | 在 `harness-comfyui` 中实现并由 Harness Host 插件调用的底层服务 | 复制本次运行需要的只读来源快照、编译 API workflow、提交 ComfyUI、观察队列、下载并保存媒体、保存运行快照 |
| ComfyUI 实例 | 数据源仓库已经登记的远端或本地 ComfyUI 服务 | 执行 API workflow 并产生图片、视频或音频输出 |
| Skill 执行者 | DeepSeek Harness 加载 Skill 后执行 `SKILL.md` 的 Agent | 按 Skill 说明收集用户意图并调用当前 Harness profile 向该 Agent 提供的模型工具 |

## 3. 当前仓库基线与能力缺口

### 3.1 可以直接复用的 DeepSeek Harness 能力

- 项目bundle通过rc.8公开composition按row id停用上游随附`ui-layout`。项目Client plugin向内建`root`注册唯一root occupant，声明并渲染标准`sidebar`、`conversation`、`details`与`shell.overlay`，在`1440×1000`固定使用`294px minmax(0, 1fr) 432px`。
- 项目root先声明四个child slot，再提供公开`ILayout` service。`ui-conversation`的ConversationRoot注册到项目声明的`conversation` slot并继续声明、渲染`conversation.input.overlay`；项目不得运行第二个root或通过DOM/CSS选择器移动Harness节点。
- 项目`sidebar` occupant使用公开`useSessions/useWorkspaces`、`ctx.sessions.search()`与`ctx.sessions.open()`渲染原型左列，并在搜索框之后、Session列表之前直接渲染“所有 ComfyUI 异步任务”和“所有媒体”两个入口。
- `@deepseek-ai/dsh-client-ui-primitives` 提供全视口遮罩上的居中 `Modal`；全局媒体库使用该容器，不创建独立页面。
- Session、Agent stream、Tool call/result和持久消息属于DeepSeek Harness核心权威；项目只通过公开`ctx.sessions`、`SessionFace`与`ConversationSnapshot`读取或调用，不创建第二套会话协议。
- 项目`conversation.composer.bar` occupant渲染原型输入区和ConversationRoot传入的原生`conversation.input.overlay`。项目textarea使用公开`useInput`、`inputActions`与`ctx.inputTriggers.sessionOf(sessionScope)`连接Harness InputTriggerController；用户输入`/`后由Harness显示按当前Session过滤的Skill并插入普通`/skill-name `文本，Host在Agent执行前重新验证。项目不调用SkillsApi实现第二套菜单。
- 项目发送协调器按chip顺序resolve稳定ContextRef并生成`generation-context.v1`文本；任一引用解析或附件编码失败都会阻止一次`SessionFace.prompt()`并保留当前草稿。
- `ConversationNodeDefinition` 可以把带稳定业务 ID 的持久 Session 事件重放为聊天节点；本项目不使用该能力复制 Generation Run 状态。
- `ctx.jobs` 可以为 Agent 提供当前进程中的等待、状态通知和“停止等待”入口；该入口不取消远端 ComfyUI prompt。

### 3.2 数据源仓库已经存在的能力

- 数据库已经保存底模、生成模型、LoRA、作品、角色、画师或画风、画师串、ComfyUI 实例、Workflow 模板、模板 revision、运行时配置、运行记录和运行输出。
- `comfyui-run-runtime.mjs` 和 `comfyui-runtime-gateway.mjs` 可以作为协议调研依据，但本方案不调用它们保存运行或媒体。
- 运行时绑定已经支持正向提示词、负向提示词、宽度、高度、分辨率预设、宽高比、像素总量、seed、LoRA、参考图片和显式工作流输入。
- 当前数据源数据库中的 35 个 Workflow 模板全部声明 `version: 0.4`；本方案的第一版 compiler 只接受该实际版本。
- 源数据代码实施基线是`NoobAI-XL-FZ`已提交并发布为`v0.81.0`的`main` revision `2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a`；该revision包含`prepareIterativeWorkflow()`、运行前双JSON持久化、运行详情投影、浏览器Blob下载、六类向量对象和两个旧`/internal/semantic/*` CLI-only查询。`NoobAI-XL-FZ-PROD-ENV`停在已发布`v0.80.0`，只作为用户安装目录和三个迁移Skill的已发布来源，不是源数据代码修改目标。当前项目只消费源数据仓库按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`后续发布的CLI与合同，不静态导入源数据模块，也不修改用户安装目录。
- 2026-08-20 对数据源数据库登记的两个实例执行了只读接口探测：`mac mini` 运行 ComfyUI `0.28.3`，`win3080` 运行 ComfyUI `0.33.1`；两个实例的 `GET /api/jobs` 都返回 `jobs` 与 `pagination`。`win3080` 的 `GET /api/jobs/{prompt_id}` 返回单 Job 详情；对一个已完成 Job 调用 `POST /api/jobs/{prompt_id}/cancel` 返回 HTTP 200 与 `{ "cancelled": false }`，回读状态仍为 `completed`。该结果与 [ComfyUI 官方 OpenAPI](https://github.com/Comfy-Org/ComfyUI/blob/master/openapi.yaml) 和 [官方 server.py 实现](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py) 一致：排队 Job 按 ID 出队，运行中 Job 通过 `interrupt_if_running(prompt_id)` 原子中断，终态或未知 Job 返回幂等 no-op。

### 3.3 必须实现的缺口

- 当前语义 CLI 通过旧 `/internal/semantic` discovery 查询作品、角色、画师或画风、提示词条目、LoRA 和画师串；它不能查询底模、生成模型、ComfyUI 实例和模板，也不支持新的 Catalog `search`/`resolve` 结构化协议。
- 当前 ComfyUI 输出只接受 JPEG、PNG 和 WebP；视频与音频需要新的媒体种类、MIME 配置、文件签名校验、保存逻辑和浏览器 renderer。
- 当前仓库尚未实现自己的运行数据库、运行 worker、媒体目录、本次实际 Workflow JSON、API Workflow JSON 和重启恢复。
- DeepSeek Harness 已经通过轨迹功能展示多个 Tool 的调用详情；本项目生成结果面板不得重复实现 Tool 详情或占用 Harness 的轨迹职责。
- 用户指定的生产checkout当前固定在`799b7759029d70076791321e2b02bf53c651c98f`，并包含`management-skills/lora-adjustment/`；本方案把该Skill与两个Prompt Skill一起迁移到release-local Harness Skill目录。
- 数据源只读 CLI 尚未提供 Host 私有的 ComfyUI 实例连接投影、模板 revision workflow 和运行时配置查询。

## 4. 选定的产品结构

### 4.1 已选方案 A：稳定工作台

用户已经选定原型变体A。项目bundle通过rc.8公开bundle row覆盖停用上游随附`ui-layout`插件；项目Client plugin向内建`root`注册唯一root occupant，声明并渲染标准`sidebar`、`conversation`、`details`与`shell.overlay`，在`1440×1000`使用`294px minmax(0, 1fr) 432px`。项目继续运行ConversationRoot、`ui-input-trigger`与`ui-skill`，所以标准conversation projection和Harness原生`/` Skill菜单继续工作；Harness核心继续拥有Session、Agent、Skill验证、Tool execution与持久日志。当前rc.8规划审计没有等待用户决定的public plugin seam阻塞。

```text
┌──────────────────────┬────────────────────────────────────────────┬──────────────────────────────────┐
│ 会话列表             │ 单会话聊天                                 │ 生成结果                         │
│                      │                                            │                                  │
│ 搜索会话             │ Agent 流式文本                             │ [当前轮次结果] [本会话结果]       │
│ [所有媒体]           │ 用户消息                                   │                                  │
│ [所有 ComfyUI 任务]  │                                            │                                  │
│ 今天                 │                                            │                                  │
│ · 角色立绘调整       │ ┌ 底模筛选: 全部 / Anima ─────────────┐ │ 运行中卡片                      │
│ · 测试视频工作流     │ │ 已附上下文: 模板 #17 · 角色 · 画风 │ │ 状态 / 模板 / 实例              │
│ 昨天                 │ └─────────────────────────────────────┘ │                                  │
│ · 画风参数对比       │                                            │ 已完成卡片                      │
│                      │ [＋添加上下文]                             │ 图片、视频或音频                │
│                      │ [项目 Workbench 消息输入与 Skill 候选区]    │ [下载本次 Workflow JSON]     │
└──────────────────────┴────────────────────────────────────────────┴──────────────────────────────────┘
```

#### 左列：会话列表

- 左列继续使用 DeepSeek Harness 的 Session 数据和当前会话选择行为。
- 每个会话行只显示会话标题、最后更新时间和当前运行数量。
- 点击会话行必须同时切换中列消息和右列的“本会话结果”。
- 项目`sidebar` occupant在搜索框之后、Session列表之前直接渲染“所有 ComfyUI 异步任务”和“所有媒体”。“所有媒体”打开居中的全局媒体库；全局媒体库按会话、聊天轮次、媒体种类和保存时间筛选媒体，并使用独立分页状态。
- “所有 ComfyUI 异步任务”打开居中的全局任务列表。列表按会话、聊天轮次和创建时间筛选当前 Workspace 的任务并使用独立分页状态；每行显示本仓库状态、ComfyUI Job 原始状态或未取得 Job 的具体原因、实例名称、`run_id` 和可用的`prompt_id`。`remote_pending`与`remote_running`行显示取消按钮，其他状态显示不能取消的具体原因。
- 本版本只实现和验收`1440×1000`桌面三列布局与原型列宽关系，不实现移动端布局、移动端导航、窄屏单panel或原型CSS断点。

#### 中列：流式聊天与本次消息上下文

- 用户消息和 Agent 增量文本继续使用现有 conversation 流。
- 一个 Session 包含按时间排序的多个聊天轮次。每个聊天轮次使用 DeepSeek Harness 原生的 Session ID 与数字 `turn` 关联一条用户消息、对应的 Agent 输出、DeepSeek Harness 已经记录的零个或多个 Skill 调用事件、零个或多个 Harness Tool 调用以及零个或多个 `run_id`。
- 页面允许用户选择一个聊天轮次。每个轮次按钮显示“第 N 轮 · 本轮任务摘要”和明确动作“查看 N 项 ComfyUI 运行”；没有运行的轮次显示“查看本轮回复 · 无 ComfyUI 运行”。被选轮次具有明确的选中样式，右列同时显示相同任务摘要和数字 `turn`。
- 输入框上方显示“本次消息上下文条”。每个上下文 chip 显示资源种类、名称和删除按钮。
- “添加上下文”打开分层选择器。选择器顶部的底模筛选器包含“全部”和具体底模；它为具有 `base_model_id` 关系的资源查询提供条件，选择“全部”时不传入具体底模限制。底模筛选值不生成消息上下文引用。第一层选择可插入的资源种类，第二层执行搜索，第三层显示候选项详情。ComfyUI 实例不出现在可插入上下文种类中。
- 生成选项允许浏览器用户选择一个只包含实例 ID、安全名称和可用状态的 ComfyUI 实例。用户不选择实例时，Host 使用 `config/runtime.json` 中的默认实例 ID；用户明确选择的实例不可用时，本次运行失败，Host 不切换到其他实例。
- 项目保留ConversationRoot并在项目`conversation.composer.bar` occupant中渲染原生`conversation.input.overlay`。用户输入`/`后，`ui-input-trigger`与`ui-skill`在该overlay显示Skill并把选择结果插入普通`/<skill-name> `文本。Host在执行前按当前Session的cwd与preset scope重新发现并校验Skill；本项目不实现第二套Skill菜单、选择状态、provider或invocation policy。
- 本项目只消费 DeepSeek Harness Session 中已经存在的 Skill 与 Tool 调用事件，并使用 Tool 调用事件返回的 `run_id` 投影右列结果。
- 用户发送消息后，本次上下文 chip 清空；已经发送的用户消息以折叠块显示不可变上下文快照。
- 引用解析失败时，发送操作保持失败状态并显示具体错误；页面保留用户正文和全部 chip。

#### 右列：生成结果面板

- “当前轮次结果”显示当前选中聊天轮次的数字 `turn` 及其关联的一个或多个 `run_id`。
- 当前选中聊天轮次没有关联 `run_id` 时，“当前轮次结果”明确显示“此轮对话没有创建 ComfyUI 运行”；页面不得从同一 Session 的其他轮次借用运行卡片。
- “本会话结果”按保存时间倒序显示当前 Session 全部聊天轮次的已保存媒体。页面使用固定尺寸的两列多行卡片，支持按聊天轮次、媒体种类和保存时间筛选，并使用与全局媒体库相同的分页行为。
- 聊天记录中的 ComfyUI Tool 调用只提供“定位结果”动作。多个 Tool 的参数、结构化结果和完整调用轨迹由 DeepSeek Harness 轨迹功能展示，本项目右列不复制这些信息。
- 每张成功运行卡片显示标题、运行状态、模板名称、ComfyUI 实例名称、媒体输出和“下载本次 Workflow JSON（可导入 ComfyUI）”按钮。
- “下载本次 Workflow JSON（可导入 ComfyUI）”读取本仓库为该运行保存的、由不可变请求数据与模板来源快照确定性生成的完整 ComfyUI UI Workflow 0.4；该文件保留节点、widget 当前值、连接和画布信息，可导入 ComfyUI 前端。
- 每张媒体卡片显示固定尺寸预览、媒体标题、媒体种类、所属会话、所属聊天轮次、保存时间、`output_index` 和 `run_id`。点击媒体主体在新窗口打开原文件；点击“下载本次 Workflow JSON（可导入 ComfyUI）”下载所属 `run_id` 的本次实际 Workflow JSON。页面不提供 API Workflow JSON 下载按钮。
- 单次工具调用可以返回多个媒体输出；一张运行卡片按 `output_index` 排列所有输出。
- 一个聊天轮次可以产生零个、一个或多个运行；页面不得用“最新一条消息”代替 `run_id` 关联。

### 4.2 备选原型 B：命令面板

该变体未被选用，不进入静态原型实现。

变体 B 保留三列，但把结构化上下文选择改为中列中的命令面板。

- 用户点击“添加上下文”后打开全屏宽命令面板。
- 命令面板使用底模筛选模板和 LoRA，并搜索角色、画师和画师串；底模不是可插入消息上下文的候选项。Skill 仍由 DeepSeek Harness 原生交互负责。
- 右列使用高密度瀑布流，强调浏览本会话的历史生成结果。
- 该方案适合熟练用户快速键盘操作，但同名资源容易增加识别成本，且首次使用时不如变体 A 清楚。

### 4.3 备选原型 C：运行检查器

该变体未被选用，不进入静态原型实现。

变体 C 保留三列，但把右列设计为当前运行检查器。

- 中列顶部固定显示当前消息的上下文摘要；正文输入和 Skill 交互继续使用 DeepSeek Harness 原生会话输入区。
- 右列上半部分显示当前 `run_id` 的状态时间线，下半部分显示媒体胶片条、实际参数和 API Workflow JSON 查看器。
- 历史结果通过右列顶部的运行下拉框切换。
- 该方案适合调试 Workflow 参数与 ComfyUI 协议，但日常查看多张结果的效率低于变体 A。

### 4.4 原型实现约束

用户确认进入原型实现后，计划执行者只创建变体 A 的静态页面路由：

```text
/prototype/generation-workbench
```

原型必须显示以下状态：空会话、包含多个聊天轮次的 Session、没有创建运行的聊天轮次、一个聊天轮次关联多个运行、Agent 流式输出、上下文选择器、上下文查询错误、排队运行、远端运行、媒体下载中、成功图片、成功视频、成功音频、失败运行和“提交结果未知”。成功运行卡片与媒体卡片必须演示本次实际 Workflow JSON 下载入口；页面不得显示 API Workflow JSON 下载入口。“提交结果未知”卡片必须明确显示“`/prompt` 成功响应尚未确认、本仓库没有可查询的 `prompt_id`、系统不会自动重新提交”。原型不得连接真实数据库、真实 CLI 或真实 ComfyUI 实例。

默认 Session 的已选聊天轮次必须通过 Session ID 与数字 `turn` 同时关联排队运行、远端运行、媒体保存中运行和“提交结果未知”运行。失败运行必须属于另一个普通 Session 的普通聊天轮次。浏览器用户不操作底部原型状态选择器时，也必须能够从会话列表和聊天轮次看到这些状态。

## 5. 本次消息上下文设计

### 5.1 资源种类

上下文选择器从 `generation_base_models` 读取底模筛选选项。用户选择的底模只作为支持 `base_model_id` 查询条件的 operation 参数；Harness 不为底模筛选值创建消息上下文引用或不可变上下文快照项。

Modal左侧固定显示以下九行，顺序、来源与首次负责Ticket不能由实现者调整：

| 顺序 | UI名称 | `kind` | 真实来源 | 首次负责Ticket |
|---|---|---|---|---|
| 1 | 生成模型 | `model` | 数据源Catalog `query_semantic_generation_models` | Ticket 05 |
| 2 | LoRA | `lora` | 数据源Catalog `query_semantic_loras` | Ticket 05 |
| 3 | 作品 | `work` | 数据源Catalog `query_semantic_works` | Ticket 05 |
| 4 | 角色 | `character` | 数据源Catalog `query_semantic_characters` | Ticket 03 |
| 5 | 画师或画风 | `style` | 数据源Catalog `query_semantic_styles` | Ticket 05 |
| 6 | 提示词条目 | `prompt-term` | 数据源Catalog `query_semantic_prompt_terms` | Ticket 05 |
| 7 | 画师串 | `artist-string` | 数据源Catalog `query_semantic_artist_prompt_strings` | Ticket 05 |
| 8 | Workflow模板 | `comfyui-template` | 数据源Catalog `query_semantic_comfyui_templates` | Ticket 03 |
| 9 | 已保存媒体 | `media` | 当前仓库`GenerationRuns.listMedia()`与`getMediaDescriptor()` | Ticket 05 |

底模不属于左侧资源行。Modal顶部底模筛选器读取`query_semantic_base_models`；具体`base_model_id`只附加到生成模型、LoRA、画师或画风、画师串与Workflow模板的search请求。ComfyUI实例不属于Modal；输入区Execution Route控件读取`query_semantic_comfyui_instances`并只保存安全`instance_id`。

“底模 → 模板”和“底模 → LoRA”不是独立数据表。上下文选择器把选中的底模 ID 作为查询条件，分别以 `base_model_id` 查询 `comfyui-template` 和 `lora`；只有用户从查询结果中选择的模板或 LoRA 才会写入消息上下文。

### 5.2 可扩展资源定义

数据源仓库按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`扩展现有`schema/api/openapi.yaml`。该OpenAPI 3.1文档是Catalog Operation与Source Operation的可调用路径、输入schema、返回schema、operationId、audience和错误结构的唯一契约来源。数据源服务用新Catalog合同直接替换`GET /internal/semantic` discovery及其旧operation，并从同一文档投影Host专用的本机只读source discovery；本方案不增加第二个schema manifest。两个discovery都返回`contract_id: "imagegen-source-contract"`与`contract_version: 1`。React组件不硬编码数据表字段。

两仓变更必须由两个执行主体分别完成：

1. 源数据仓库执行者必须先按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`，在源数据仓库自己的Issue、分支、测试和发布流程中修改`schema/api/openapi.yaml`、handler manifest、只读catalog service、两个CLI和源仓库测试，并发布明确commit/tag与`imagegen-source-contract`版本。
2. 源数据版本发布前，当前仓库Ticket保持`needs-info`阻塞；当前仓库执行者不得进入源数据checkout，也不得复制或猜测源数据Schema。
3. 源数据版本发布后，当前仓库执行者只在`harness-comfyui`实现Catalog adapter、唯一Harness Tool registry、remote RPC、上下文renderer registry、chip、Context resolver和消费端测试。
4. 以后新增资源种类时仍重复上述两阶段责任链；不能让一个当前仓库Issue跨仓库修改并发布两套代码。

### 5.3 原子发送

每个 chip 在草稿中只保存轻量引用：

```json
{
  "kind": "character",
  "id": "39936",
  "label": "角色名称"
}
```

用户点击发送后，项目Context resolver按chip顺序查询数据源CLI，并把每个可插入的轻量引用解析为带`contract_id`的不可变上下文快照。`CatalogRef<'base-model'>`只能作为查询筛选来源，不能传给Context resolver。项目把正文与全部快照放入一个text `PromptContentPart`，把浏览器图片编码为image `PromptContentPart`，然后只调用一次当前Session的`SessionFace.prompt()`；Harness把已发送内容写入同一条`user/message`。临时ContextRef列表不会作为独立metadata持久化；浏览器不得先发送独立`agent.inject()`请求再发送用户正文。

每个 occurrence序列化为Ticket 03产品代码中唯一`generation-context.v1`运行时schema定义的版本化block。正文位于全部block之前；多个block按occurrence顺序排列：

```text
用户输入的正文

<generation-context.v1>
{"contract_id":"generation-context","contract_version":1,"kind":"character","id":"39936","label":"角色名称","source_release_version":"...","snapshot":{...}}
</generation-context.v1>
```

JSON字段顺序固定为`contract_id`、`contract_version`、`kind`、`id`、`label`、`source_release_version`、`snapshot`。这项转换只执行字段校验、固定字段排序和JSON序列化，不执行语义推断。项目Workbench user-message renderer只解析正文末尾标签完整且通过同一schema的block，并把正文与上下文显示为原型折叠块；不完整标签、未知版本或schema不匹配的文本按普通用户正文显示。模型可见内容仍能从Session log完整重建。

### 5.4 跨模块领域数据结构

本仓库在 `src/contract/` 中为 CLI adapter、Host 工具、运行服务、Run projection Remote 和前端 fixture 提供一份结构化 TypeScript contract。以下类型是方案中的字段定义；实现阶段不得在各模块复制另一套字段名称。

```ts
type JsonValue =
  | null | boolean | number | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type JsonDocument = { [key: string]: JsonValue }

type CatalogKind =
  | 'base-model' | 'model' | 'lora' | 'work' | 'character'
  | 'style' | 'prompt-term' | 'artist-string'
  | 'comfyui-instance' | 'comfyui-template' | 'media'

type ContextKind = Exclude<CatalogKind, 'base-model' | 'comfyui-instance'>

interface CatalogRef<K extends CatalogKind = CatalogKind> {
  kind: K
  id: string
  label: string
}

type ContextRef = CatalogRef<ContextKind>

interface CatalogKindDefinition {
  kind: CatalogKind
  provider: 'source-semantic-cli' | 'local-generation-runs'
  operation_id: string | null
  tool_name: string | null
  filters: Array<{
    name: string
    value_type: 'string' | 'integer' | 'number' | 'boolean'
    required: boolean
  }>
  result_contract_id: string
}

interface CatalogSearchInput {
  kind: CatalogKind
  query?: string
  filters?: Record<string, string | number | boolean>
  page: number
  page_size: number
}

interface CatalogItem {
  ref: CatalogRef
  title: string
  subtitle: string | null
  cover_url: string | null
  source_release_version: string
  result_contract_id: string
  data: JsonDocument
}

interface CatalogPage {
  contract_id: 'imagegen-source-contract'
  contract_version: 1
  kind: CatalogKind
  items: CatalogItem[]
  page: number
  page_size: number
  total_count: number
}

interface ContextSnapshot {
  ref: ContextRef
  contract_id: string
  source_release_version: string
  title: string
  data: JsonDocument
}

interface ContextResolver {
  serialize(refs: ContextRef[]): Promise<{
    snapshots: ContextSnapshot[]
    model_text: string
  }>
}
```

`CatalogKind`是可查询种类，因此包含`base-model`和`comfyui-instance`。`ContextKind`是可插入消息上下文的种类，因此在类型层排除`base-model`和`comfyui-instance`。运行时schema对`GenerationCatalog.resolve()`、`ContextResolver.serialize()`、`CreateGenerationRun.context_snapshots`和`RunRequestSnapshot.context_snapshots`执行同一约束；输入包含这两个种类时返回`CONTEXT_KIND_NOT_INSERTABLE`，并且不得写入Session log或运行请求快照。生成选项把安全实例ID作为Execution Route交给Host，不通过Context resolver。

Host 私有来源类型：

```ts
interface PrivateComfyuiInstanceSnapshot {
  id: string
  title: string
  url: string
  credential_type: 'none' | 'http_basic' | 'bearer'
  authorization: string | null
  is_enabled: boolean
  is_valid: boolean
  updated_at: string
}

interface RuntimeParameterDefinition {
  parameter_id: string
  kind:
    | 'positive_prompt' | 'negative_prompt' | 'width' | 'height'
    | 'resolution_preset' | 'aspect_ratio' | 'megapixels' | 'cfg' | 'seed'
    | 'lora_model' | 'lora_model_weight' | 'lora_clip_weight'
    | 'lora_trigger_word' | 'reference_image' | 'workflow_input'
  label: string
  value_type: 'integer' | 'number' | 'boolean' | 'string'
    | 'enum' | 'asset_reference' | 'image_reference'
  default_value: string | number | boolean | null
  required: boolean
  visible: boolean
}

type RuntimeBinding =
  | {
      operation: 'replace_input'
      binding_id: string
      parameter_id: string
      node_id: string
      input_name: string
      widget_index: number
    }
  | {
      operation: 'compose_text'
      binding_id: string
      parameter_id: string
      target_parameter_id: string
    }

interface ComfyuiUiWorkflowV04 extends JsonDocument {
  version: 0.4
  nodes: Array<JsonDocument & { id: string | number; type: string }>
  links: JsonValue[][]
}

interface ComfyuiTemplateBundle {
  contract_id: 'imagegen-source-contract'
  contract_version: 1
  source_release_version: string
  template_id: string
  title: string
  workflow_revision: number
  workflow_sha256: string
  source_format: 'comfyui-ui-workflow-v0.4'
  source_workflow: ComfyuiUiWorkflowV04
  runtime_config_revision: number
  dimension_strategy:
    | 'direct_width_height'
    | 'direct_resolution_preset'
    | 'direct_aspect_megapixels'
  parameters: RuntimeParameterDefinition[]
  bindings: RuntimeBinding[]
  expected_output_node_ids: string[]
}
```

`authorization` 是进程内敏感值，不属于可持久化来源快照。`source-snapshot.json` 使用下文的 `PersistedRunSourceSnapshot`，保存非敏感实例连接投影、完整模板 bundle 和本次使用的 LoRA 来源投影，但省略 `authorization`。

运行服务类型：

```ts
type RunStatus =
  | 'created' | 'prepared' | 'submitting' | 'submission_unknown'
  | 'remote_pending' | 'remote_running' | 'downloading'
  | 'cancelling' | 'cancelled' | 'succeeded' | 'failed'

interface CreateGenerationRun {
  title: string
  workspace_id: string
  session_id: string
  turn: number
  call_id: string
  instance_id: string
  template_id: string
  parameters: Record<string, JsonValue>
  lora_applications: RequestedLoraApplication[]
  context_snapshots: ContextSnapshot[]
}

interface RequestedLoraApplication {
  source_lora_id: string
  strength_model: number
  strength_clip?: number
  applied_trigger_words: string[]
}

interface RunRequestSnapshot {
  title: string
  workspace_id: string
  session_id: string
  turn: number
  call_id: string
  instance_id: string
  template_id: string
  template_revision: number
  parameters: Record<string, JsonValue>
  lora_applications: RequestedLoraApplication[]
  context_snapshots: ContextSnapshot[]
}

interface StoredMediaDescriptor {
  media_id: string
  run_id: string
  output_index: number
  kind: 'image' | 'video' | 'audio'
  mime_type: string
  title: string
  byte_length: number
  created_at: string
}

interface PersistedRunLoraSourceSnapshot {
  source_lora_id: string
  selection_order: number
  file_name: string
  trigger_words: string[]
}

interface PersistedRunSourceSnapshot {
  instance: {
    instance_id: string
    instance_title: string
    instance_url: string
    credential_type: 'none' | 'http_basic' | 'bearer'
    instance_updated_at: string
  }
  template: ComfyuiTemplateBundle
  loras: PersistedRunLoraSourceSnapshot[]
}

interface GenerationRunSnapshot {
  run_id: string
  title: string
  workspace_id: string
  session_id: string
  turn: number
  call_id: string
  status: RunStatus
  prompt_id: string | null
  source: {
    instance_id: string
    instance_title: string
    template_id: string
    template_revision: number
    workflow_sha256: string
    runtime_config_revision: number
  }
  resolved_parameters: Record<string, JsonValue>
  outputs: StoredMediaDescriptor[]
  actual_workflow_json_available: boolean
  api_workflow_json_available: boolean
  error: null | { code: string; message: string; details: JsonDocument }
  created_at: string
  updated_at: string
}

interface ListGenerationRuns {
  session_id: string
  turn?: number
  status?: RunStatus
  page: number
  page_size: number
}

interface GenerationRunPage {
  items: GenerationRunSnapshot[]
  page: number
  page_size: number
  total_count: number
}

interface ListStoredMedia {
  session_id: string
  turn?: number
  run_id?: string
  kind?: 'image' | 'video' | 'audio'
  created_from?: string
  created_to?: string
  page: number
  page_size: number
}

interface StoredMediaPage {
  items: StoredMediaDescriptor[]
  page: number
  page_size: number
  total_count: number
}
```

`PersistedRunSourceSnapshot` 只保存到本仓库 Host 私有的 `source-snapshot.json` 和所需数据库列。`template` 保存 `ComfyuiTemplateBundle` 的完整非敏感内容；`loras` 从本次请求已经解析并校验的 LoRA `ContextSnapshot.data` 生成，并按照 `selection_order` 固定顺序。每个 `RequestedLoraApplication.source_lora_id` 必须与 `loras` 中恰好一个成员匹配；文件名和允许的触发词只取自持久来源投影，权重与实际采用触发词只取自 `RunRequestSnapshot`。`GenerationRunSnapshot` 是浏览器 RPC 使用的公开投影；Generation Tool Result 只返回 `run_id`。两者都不包含 `instance_url`、`source_workflow`、`authorization` 或凭据字段。

来源 `source_workflow` 是 ComfyUI UI Workflow 0.4 图结构，至少包含 `version: 0.4`、`nodes` 和 `links`。本仓库先使用 `ActualWorkflowBuilder` 把 `source_workflow`、本次不可变请求数据和解析后的运行参数转换为 `actual_workflow_json`。该产物仍是完整 ComfyUI UI Workflow 0.4，并且可以导入 ComfyUI 前端。`WorkflowCompiler` 再结合目标实例 `/object_info` 返回的 node definitions，把 `actual_workflow_json` 编译为以下 API format：

```ts
type ComfyuiApiWorkflow = Record<string, {
  class_type: string
  inputs: Record<string, JsonValue>
  _meta?: { title: string }
}>
```

`ActualWorkflowBuilder` 或 `WorkflowCompiler` 遇到 UI Workflow 版本不等于 0.4、静态图错误、缺失绑定目标、缺失节点定义、缺失必填输入、非法枚举值、无活动输出节点或未声明运行参数时返回结构化错误并阻止远端提交。

## 6. 深模块与接口

本方案采用三个深模块、一组 OpenAPI 驱动的 `query_semantic_*` 查询工具和一个 `generate_with_comfyui` 生成工具。`GenerationCatalog` 隐藏用户可选目录查询，`ComfyuiSourceCatalog` 隐藏 Host 私有的实例与模板只读查询，`GenerationRuns` 隐藏当前仓库中的 ComfyUI 生命周期；生成工具向 Skill 提供单一任务创建路径。

### 6.1 `GenerationCatalog`

`GenerationCatalog` 隐藏 OpenAPI discovery、CLI 进程、分页、数据表查询和安全投影。

```ts
interface GenerationCatalog {
  describe(kind: CatalogKind): Promise<CatalogKindDefinition>
  search(input: CatalogSearchInput): Promise<CatalogPage>
  resolve(ref: ContextRef): Promise<ContextSnapshot>
}
```

前置条件：`kind`、operation 和筛选名称必须由数据源 OpenAPI 声明。  
成功结果：`search()` 返回分页候选；`resolve()` 返回不可变上下文快照。  
错误码：`CATALOG_KIND_NOT_FOUND`、`CATALOG_FILTER_INVALID`、`CATALOG_REF_NOT_FOUND`、`CONTEXT_KIND_NOT_INSERTABLE`、`CATALOG_PROTOCOL_ERROR`、`CATALOG_SOURCE_UNAVAILABLE`。

生产 adapter 是 `StructuredCliGenerationCatalog`；测试 adapter 是 `MemoryGenerationCatalog`。

`provider: 'source-semantic-cli'` 的资源种类使用以下调用链：

```text
迁移后的 Skill
  → 当前项目Host plugin通过统一registerProjectTools()注册的query_semantic_* Tool
  → StructuredCliGenerationCatalog
  → 数据源仓库中完善后的只读 CLI
  → 数据源仓库数据库
```

`provider: 'local-generation-runs'` 的 `media` 资源种类不调用数据源 CLI。浏览器和被目标 profile 授权的 Harness Tool 通过 Host 当前入口派生的 `ArtifactAccessScope` 调用 `GenerationRuns.listMedia(input, access_scope)` 查询分页媒体，并通过相同范围调用 `GenerationRuns.getMediaDescriptor(media_id, access_scope)` 精确读取一个 `media_id`。

Ticket 01创建`src/host/tools/register-project-tools.ts`，该模块是当前项目唯一直接调用Harness公开`ctx.tools.register()`的位置。Host plugin只读取Agent安全discovery，使用`defineTool()`构造完整定义，再通过该统一registry注册PRD 05固定的十个Catalog Tool。registry按稳定顺序注册、失败时反向注销本次Tool、Host plugin卸载时反向注销全部项目Tool。Host plugin不得把Source Operation、项目Remote、产品管理CLI或GenerationRuns方法注册为模型Tool。

每个工具直接使用对应OpenAPI operation的闭合`search`或`resolve`输入对象和成功结果，不使用通用的`invoke(operation, any)`：

```ts
query_semantic_loras(
  | {
      mode: 'search'
      query?: string
      page?: number
      page_size?: number
      base_model_id?: string
    }
  | {
      mode: 'resolve'
      id: string
    }
): Promise<CatalogPage>
```

原数据源OpenAPI、handler、catalog service、两个只读CLI和源仓库契约测试的修改必须按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`在数据源仓库自己的Issue、分支、测试和版本发布流程中完成。当前仓库Issues只消费已发布CLI并实现Harness plugin adapter；所需数据源版本尚未发布时保持阻塞，不得跨仓库直接修改或复制数据源实现。

每个可插入上下文的查询 operation 必须支持按稳定 ID 精确查询。`GenerationCatalog.resolve(ref)` 使用对应 operation 的稳定 ID 条件并要求结果恰好一条；它不通过名称再次搜索选中项。

### 6.2 `ComfyuiSourceCatalog`

`ComfyuiSourceCatalog` 是本仓库对数据源只读 CLI 的 Host 私有接口。它取得一次运行需要的来源数据，但不允许创建或更新数据源仓库中的运行记录。

```ts
interface ComfyuiSourceCatalog {
  getInstance(input: {
    instanceId: string
  }): Promise<PrivateComfyuiInstanceSnapshot>

  getTemplateBundle(input: {
    templateId: string
  }): Promise<ComfyuiTemplateBundle>
}
```

`PrivateComfyuiInstanceSnapshot` 包含连接 ComfyUI 所需的 URL 和认证信息。该对象只存在于本仓库 Host 进程内存中；运行数据库、日志、模型工具结果、Run projection Remote 和浏览器响应只保存实例 ID 与安全名称，不保存认证信息。

`ComfyuiTemplateBundle` 包含 Tool 调用执行时数据源返回的当前模板 ID、模板 revision、原始 workflow JSON、`workflow_sha256`、运行时配置 revision、参数定义和绑定定义。本版本不锁定用户选择模板时的 revision，也不处理用户选择后、Tool 调用前模板发生更新的并发情形。Host 在 Tool 调用中读取一次当前 bundle，并把这次返回的完整 bundle 复制为该 Generation Run 的不可变来源快照；运行创建后的数据源变化不得改变该运行。

本方案不把实例认证信息加入 `/internal/semantic` discovery，因为该 discovery 只包含 Catalog Operation。数据源仓库从同一个 `schema/api/openapi.yaml` 投影 Host 专用的本机只读 source discovery，并新增读取该 discovery 的只读命令 `imagegen-comfyui-source-read`；该表面只提供实例连接和当前完整模板 bundle 的 Source Operation。DeepSeek Harness profile 不注册 Source Operation 为 Agent Tool、Skill Tool 或浏览器 RPC；`ComfyuiSourceCatalog` adapter 负责从 Host 进程启动命令并读取 stdout。命令不记录完整响应，也不执行数据源写操作。operation audience 只负责 discovery 投影和 Harness Tool 注册分类。本版本不认证调用 Source Operation 的其他本机进程。

`ComfyuiSourceCatalog` 返回 `SOURCE_INSTANCE_NOT_FOUND`、`SOURCE_CREDENTIAL_UNAVAILABLE`、`SOURCE_TEMPLATE_NOT_FOUND`、`SOURCE_TEMPLATE_UNAVAILABLE`、`SOURCE_CONTRACT_UNSUPPORTED` 或 `SOURCE_PROTOCOL_ERROR`。两个实例读取错误和两个模板读取错误与Source CLI错误同名；discovery identity或版本不匹配映射为`SOURCE_CONTRACT_UNSUPPORTED`；`SOURCE_REQUEST_INVALID`、`SOURCE_DATABASE_BUSY`和`SOURCE_INTERNAL_ERROR`逐项映射为`SOURCE_PROTOCOL_ERROR`；CLI连接、超时、未声明服务错误、非JSON、空stdout、多JSON或响应Schema错误也映射为`SOURCE_PROTOCOL_ERROR`。任一错误都会在本仓库运行进入远端提交前终止该运行。

### 6.3 `GenerationRuns`

`GenerationRuns` 隐藏来源快照、请求数据到实际 Workflow 的确定性转换、API workflow 编译、ComfyUI 协议、本仓库持久运行、状态恢复、媒体校验和本地保存。

```ts
type ArtifactAccessScope =
  | { kind: 'session', session_id: string }
  | { kind: 'workspace', workspace_id: string }

interface GenerationRuns {
  create(input: CreateGenerationRun): Promise<GenerationRunSnapshot>
  get(runId: string): Promise<GenerationRunSnapshot>
  list(input: ListGenerationRuns): Promise<GenerationRunPage>
  cancel(runId: string, accessScope: ArtifactAccessScope): Promise<GenerationRunSnapshot>
  listMedia(input: ListStoredMedia, accessScope: ArtifactAccessScope): Promise<StoredMediaPage>
  getActualWorkflowJson(runId: string, accessScope: ArtifactAccessScope): Promise<ComfyuiUiWorkflowV04>
  getApiWorkflowJson(runId: string): Promise<ComfyuiApiWorkflow>
  getMediaDescriptor(mediaId: string, accessScope: ArtifactAccessScope): Promise<StoredMediaDescriptor>
  openMedia(mediaId: string, accessScope: ArtifactAccessScope): Promise<{
    stream: ReadableStream<Uint8Array>
    mime_type: string
    byte_length: number
  }>
}
```

生产实现 `LocalGenerationRuns` 属于当前 `harness-comfyui` 仓库。它依赖 `ComfyuiSourceCatalog`、`WorkflowCompiler`、`ComfyuiTransport`、`RunRepository` 和 `MediaStore`。测试实现使用 `MemoryGenerationRuns` 和 `FakeComfyuiTransport`。

`create()` 和异步 worker 必须按以下顺序运行：

1. Host 直接使用 Harness 提供的 `(workspace_id, session_id, call_id)` 作为唯一 Tool Call identity。同一个 ToolExecution 重试时必须复用该 identity。
2. `RunRepository` 先在一个事务中为唯一 `(workspace_id, session_id, call_id)` 创建 `run_id` 和 `created` 记录。相同 identity与相同请求返回原运行；相同 identity与不同请求返回 `RUN_REQUEST_CONFLICT`。
3. worker 通过数据源只读 Source Operation 读取已解析实例连接和当前完整模板 bundle，并把这次返回的模板 revision、`workflow_sha256` 和运行时配置 revision 写入本次运行的来源快照。
4. worker 校验运行参数，通过 runtime bindings 把不可变请求数据应用到模板 UI Workflow 的深拷贝，生成本次实际 Workflow JSON；worker 随后读取 ComfyUI `/object_info`，并从本次实际 Workflow JSON 编译 API Workflow JSON。
5. worker 先把来源快照、内部请求快照、本次实际 Workflow JSON 和 API Workflow JSON 原子写入 `<run_id>` 目录，再把数据库状态更新为 `prepared`。
6. worker 把数据库状态更新为 `submitting` 后调用 ComfyUI `/prompt`。收到成功响应后，worker 在一个事务中保存 `prompt_id` 并把状态更新为 `remote_pending`。
7. worker 通过 `GET /api/jobs/{prompt_id}` 观察 Job。远端状态为 `completed` 时，worker 从 Job 的 `outputs` 读取模板声明的输出描述，下载并验证全部输出，在每个媒体文件安全落盘后把状态更新为 `succeeded`。

同一 ToolExecution 的网络传输重试、Harness 恢复和 worker 恢复都复用原 `(workspace_id, session_id, call_id)` 与原 `run_id`。只有用户在新的聊天消息中明确要求 Agent 再次生成，并在 `submission_unknown` 情况下确认可能产生重复远端任务后，Harness 才创建新的 ToolExecution；新的 `call_id` 产生新的 `run_id`。运行卡片只说明风险和下一步，不提供绕过 Harness 会话与 Tool 调用机制的直接提交按钮。

ComfyUI `/prompt` 没有经本轮验证的业务幂等键。worker 在 `submitting` 时崩溃，或者请求超时且无法确定远端是否接收任务时，恢复流程必须把运行更新为终态 `submission_unknown`，并返回 `COMFYUI_SUBMISSION_RESULT_UNKNOWN`。恢复流程不得自动再次提交该运行。该规则优先保证不会为同一个 Harness Tool Call identity创建第二个远端任务。

`get()` 必须从当前仓库的运行数据库返回以下状态之一：

```text
created → prepared → submitting → remote_pending → remote_running → downloading → succeeded
                         │                                                │
                         └→ submission_unknown                            └→ failed
                                            remote_pending ─┐
                                            remote_running ─┴→ cancelling → cancelled
```

`created` 和 `prepared` 可以在恢复后安全继续；`submitting` 只能进入 `submission_unknown`；具有已保存 `prompt_id` 的 `remote_pending`、`remote_running`、`cancelling` 和 `downloading` 可以恢复观察。除 `submitting` 外，任一非终态遇到明确的本地校验错误、ComfyUI 拒绝、Job 失败或媒体验证错误时都可以进入 `failed`。

Harness 的 `ctx.jobs` 只包装当前 Agent 对一个持久 `run_id` 的观察过程。DeepSeek Harness 重启后，本仓库运行服务从自己的运行数据库恢复非终态任务；右列通过 `GenerationRuns.get()` 或 `list()` 恢复状态。运行恢复不依赖已经丢失的进程内 job ID，也不读取数据源仓库中的历史运行表。

`ctx.jobs` 的 kill 操作只停止当前 Agent 对任务的等待与通知，不取消远端 ComfyUI Job，也不停止本仓库 worker。左侧全局任务列表中的取消按钮调用 `GenerationRuns.cancel(run_id, workspace_scope)`；两种取消不是同一个操作。

`GenerationRuns.cancel()` 只接受本仓库状态为 `remote_pending` 或 `remote_running` 且已经保存 `prompt_id` 的运行。服务先把状态更新为 `cancelling`，再向该运行保存的实例发送 `POST /api/jobs/{prompt_id}/cancel`，随后重新调用 `GET /api/jobs/{prompt_id}`。返回 `{ "cancelled": true }` 表示取消动作已经投递；最终只有 Job 状态回读为 `cancelled` 时，本仓库状态才更新为 `cancelled`。返回 `{ "cancelled": false }` 表示任务可能已经进入终态或不再存在；服务必须根据回读的 `completed`、`failed`、`cancelled` 或 404 结果收敛，不能把 no-op 直接记为取消成功。`downloading` 表示远端 Job 已经完成，本地媒体保存仍需完成，因此该状态不能取消。`submission_unknown` 没有可确认的远端 Job，页面不得向任意实例发送取消请求。

#### 6.3.1 请求数据到两个 Workflow JSON 的确定性转换

本方案使用以下单向链路：

```text
source-snapshot.json 中 template.source_workflow、template.parameters、template.bindings 和 loras
  + request.json 中的提示词、运行参数和 LoRA 应用项
  → ActualWorkflowBuilder
  → actual-workflow.json（完整 UI Workflow，可导入 ComfyUI 前端）
  → WorkflowCompiler
  → api-workflow.json（实际提交给 ComfyUI /prompt 的 prompt 对象）
```

`request.json` 严格符合 `RunRequestSnapshot`，是当前仓库内部保存的幂等请求事实；`source-snapshot.json` 严格符合 `PersistedRunSourceSnapshot`，包含离线重建该运行 Workflow 所需的完整非敏感来源数据。页面不把任一快照文件作为下载产物。用户要求下载的另一类文件是 `actual-workflow.json`，也就是由这两个快照转换得到的完整 Workflow JSON，而不是 `request.json` 或 `source-snapshot.json` 本身。

`ActualWorkflowBuilder` 采用数据源系统现有实现已经验证的确定性规则：

1. builder 深拷贝来源模板，不能修改 `source-snapshot.json` 中的模板对象。
2. builder 只按照运行时配置中明确声明的 `replace_input` 绑定定位 `node_id`、`input_name` 和 `widget_index`；builder 不根据节点标题或提示词语义猜测目标。
3. builder 把最终正向提示词以及宽度、高度、像素、CFG、seed、采样器、LoRA 文件和权重等已解析值写入对应 `widgets_values`。未提供的非必填参数保留模板快照值；必填参数缺失时停止创建远端任务。
4. 一个模板包含 LoRA 基础节点时，builder 按 `PersistedRunSourceSnapshot.loras.selection_order` 对 `RunRequestSnapshot.lora_applications` 进行一一匹配，再写入或复制 LoRA 节点，并同步重建受影响的 `inputs[].link`、`outputs[].links`、顶层 `links`、`last_node_id` 和 `last_link_id`。没有 LoRA 应用项时，builder 按模板配置明确绕过该 LoRA 节点。
5. builder 在转换前后分别执行 UI Workflow 静态校验。`WorkflowCompiler` 只接收校验通过的 `actual-workflow.json`，并且不再执行第二套参数或 LoRA 改写。
6. 运行服务在调用 `/prompt` 前把两个 JSON 保存到同一 `run_id`。下载操作只读取已经保存的文件，不能重新读取数据源当前模板，不能再次转换，也不能用一个 JSON 替代另一个 JSON。

测试必须在运行创建后修改或删除数据源中的模板、运行配置和 LoRA 来源记录，然后只用当前仓库保存的 `source-snapshot.json` 与 `request.json` 重新生成实际 Workflow。重新生成结果必须等于已保存的 `actual-workflow.json`，且再次编译结果必须等于已保存的 `api-workflow.json`；`source-snapshot.json` 不得包含认证值。

#### 6.3.2 `ComfyuiTransport`

```ts
interface ComfyuiTransport {
  getNodeDefinitions(
    instance: PrivateComfyuiInstanceSnapshot
  ): Promise<JsonDocument>

  submitWorkflow(input: {
    instance: PrivateComfyuiInstanceSnapshot
    client_id: string
    workflow: ComfyuiApiWorkflow
  }): Promise<{ prompt_id: string }>

  getJob(input: {
    instance: PrivateComfyuiInstanceSnapshot
    prompt_id: string
  }): Promise<
    | { state: 'not_found' }
    | { state: 'pending'; queue_position?: number }
    | { state: 'in_progress'; progress?: JsonDocument }
    | { state: 'failed'; error: JsonDocument }
    | { state: 'completed'; outputs: RemoteOutputDescriptor[] }
    | { state: 'cancelled' }
  >

  cancelJob(input: {
    instance: PrivateComfyuiInstanceSnapshot
    prompt_id: string
  }): Promise<{ cancelled: boolean }>

  downloadOutput(input: {
    instance: PrivateComfyuiInstanceSnapshot
    output: RemoteOutputDescriptor
  }): Promise<{
    stream: ReadableStream<Uint8Array>
    content_type: string
    content_length: number | null
  }>
}

interface RemoteOutputDescriptor {
  node_id: string
  output_index: number
  kind: 'image' | 'video' | 'audio'
  filename: string
  subfolder: string
  storage_type: string
}
```

状态映射：

| 远端观察结果 | 本仓库状态 |
|---|---|
| `/prompt` 返回 `prompt_id` | `remote_pending` |
| `/prompt` 请求结果无法确认，而且本仓库尚未保存 `prompt_id` | `submission_unknown`，错误码 `COMFYUI_SUBMISSION_RESULT_UNKNOWN`；不能查询或取消 Job；不自动重提 |
| `GET /api/jobs/{prompt_id}` 返回 `pending` | `remote_pending` |
| `GET /api/jobs/{prompt_id}` 返回 `in_progress` | `remote_running` |
| `GET /api/jobs/{prompt_id}` 返回 `completed` | `downloading` |
| `GET /api/jobs/{prompt_id}` 返回 `failed` | `failed`，错误码 `COMFYUI_JOB_FAILED` |
| `GET /api/jobs/{prompt_id}` 返回 `cancelled` | `cancelled` |
| `GET /api/jobs/{prompt_id}` 返回 404，但尚未超过配置的观察期限 | 保持进入本次查询前的 `remote_pending` 或 `remote_running`；保留 `prompt_id`；不自动重提 |
| `GET /api/jobs/{prompt_id}` 持续返回 404 并超过配置的观察期限 | `failed`，错误码 `COMFYUI_JOB_MISSING` |
| 网络中断但未超过配置的观察期限 | 保持当前远端状态并按配置间隔重试 |

本仓库用结构化 output extractor registry 把 ComfyUI Job 详情的 `outputs` 中不同输出字段转换为 `RemoteOutputDescriptor`。图片、视频和音频 extractor 都必须通过真实受控 fixture 或登记测试实例验证；未知输出字段返回 `COMFYUI_OUTPUT_DESCRIPTOR_UNSUPPORTED`，不能按文件扩展名猜测媒体种类。

`FakeComfyuiTransport` 必须覆盖排队、运行、完成、Job 失败、取消请求成功、取消 no-op、取消与完成竞态、任务消失、网络中断、多输出、非法 MIME、文件签名不匹配、图片、视频和音频分支。

`ComfyuiTransport` 使用以下错误码：`COMFYUI_CONNECTION_FAILED`、`COMFYUI_REQUEST_TIMEOUT`、`COMFYUI_PROMPT_REJECTED`、`COMFYUI_PROTOCOL_ERROR`、`COMFYUI_JOB_FAILED`、`COMFYUI_JOB_MISSING`、`COMFYUI_JOB_CANCEL_FAILED`、`COMFYUI_OUTPUT_DESCRIPTOR_UNSUPPORTED`、`COMFYUI_OUTPUT_DOWNLOAD_FAILED`、`MEDIA_TYPE_UNSUPPORTED` 和 `MEDIA_SIGNATURE_INVALID`。错误对象必须包含 `code`、帮助用户定位问题的 `message` 和结构化 `details`；错误对象不得包含 Authorization header。

`ComfyuiTransport` 只接受 `ComfyuiSourceCatalog` 返回的实例 URL；模型工具不能提交 URL。HTTP redirect 必须被拒绝，Authorization header 只能发送到来源快照中的同一 origin。远端输出的 `filename`、`subfolder` 和 `storage_type` 只作为 ComfyUI 下载请求参数，不能成为本地保存路径。本仓库用自己生成的 `media_id` 与 `media-policy.json` 中的验证扩展名创建本地文件名。请求超时、最大响应字节数和轮询间隔来自 `config/runtime.json`。

### 6.4 本仓库的持久存储

本仓库是新任务、运行状态、内部来源快照、内部请求快照、本次实际 Workflow JSON、API Workflow JSON 和媒体文件的唯一持久事实来源。数据源仓库只在创建运行时提供只读来源数据。

```text
configured-data-directory/
├── runs.sqlite
└── workspaces/
    └── <workspace_id>/
        └── runs/
            └── <run_id>/
                ├── source-snapshot.json
                ├── request.json
                ├── actual-workflow.json
                ├── api-workflow.json
                └── outputs/
                    ├── <media_id>.<validated-extension>
                    └── ...
```

`runs.sqlite` 是当前 Harness 安装唯一的运行元数据数据库。每条运行记录保存 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id`、`run_id`、来源 ID、非敏感实例 URL 快照、状态、ComfyUI `prompt_id`、四个运行 JSON 文件的相对路径、媒体文件相对路径、错误结构和时间戳；数据库对 `(workspace_id, session_id, call_id)` 建立唯一约束。JSON 文件保存不可变事实。数据库不得重复保存一份可独立修改的完整 workflow JSON。服务用同一运行目录内的临时文件完成写入和同步后再执行原子 rename；数据库只在目标文件完成后保存其相对路径。

运行服务通过显式项目命令或 DeepSeek Harness 插件生命周期以前台方式启动；本方案不创建隐藏 daemon、系统登录项或定时任务。服务启动后扫描本仓库数据库中的非终态运行，并通过已保存的 `prompt_id` 向原 ComfyUI 实例恢复观察。

恢复 worker 根据来源快照中的实例 ID 重新调用 `ComfyuiSourceCatalog.getInstance()`。如果数据源中的实例 URL 已经改变，worker 返回 `COMFYUI_INSTANCE_SOURCE_CHANGED` 并停止观察该运行；worker 不把任务静默切换到另一个 ComfyUI endpoint。

### 6.5 模型工具 `generate_with_comfyui`

迁移后的 ComfyUI Skill 可以先调用零个或多个 `query_semantic_*` 数据查询工具；每个需要创建的 ComfyUI 运行调用一次 `generate_with_comfyui`：

```ts
generate_with_comfyui({
  title: string,
  instance_id?: string,
  template_id: string,
  parameters: Record<string, string | number | boolean>,
  lora_applications: Array<{
    source_lora_id: string,
    strength_model: number,
    strength_clip?: number,
    applied_trigger_words: string[]
  }>
}): Promise<{ run_id: string }>
```

`generate_with_comfyui`的`defineTool()`输出必须同时定义以下确定投影：

```ts
type GenerationToolValue = { run_id: string }

type GenerationToolPresentationMeta = {
  contract_id: 'harness-comfyui-generation-run'
  contract_version: 1
  run_id: string
}
```

`output.schema`只接受必填`run_id`的封闭对象，`output.render()`向Harness Tool Result写入同一JSON对象，`output.presentationMeta()`返回`GenerationToolPresentationMeta`。Harness原生`tool/result`持久该meta，Client公开`ToolResultNode.meta`在实时投影和Session重放中都返回它。公开`ToolResultNode.call`可在配对call尚未进入当前history window时为`null`：`call !== null`时Client校验`call.name === "generate_with_comfyui"`、settled success与meta；`call === null`时Client使用公开`callId`、当前Session和meta `run_id`调用项目`GenerationRuns.resolveToolResultLink()`，由Host核对持久`(workspace_id, session_id, call_id) -> run_id`映射。映射校验成功才建立Run链接；Client不从Agent文本、Tool标题或Tool Result文字解析该链接。

Harness Host 插件从当前 ToolExecution 绑定 `workspace_id`、`session_id`、数字 `turn` 和 `call_id`，并读取该用户消息已经记录的不可变 `ContextSnapshot[]`。模型不提供这四类关联数据。`instance_id` 只允许使用实例 Catalog Operation 返回的安全 ID；省略时，Host 读取 `config/runtime.json` 的默认实例 ID。明确选择的实例不可用时，Host 返回具体 Source 错误，不切换实例。Host 直接使用 `(workspace_id, session_id, call_id)` 调用本仓库 `GenerationRuns.create()` 并注册一个 `ctx.jobs` 观察任务。工具不得根据轻量 `ContextRef` 再次查询当前数据源，否则数据源变化会使任务上下文与用户消息上下文不一致。

每个`lora_applications`成员必须与当前用户消息的一项LoRA`ContextSnapshot`按稳定ID和顺序一一匹配；Host只从该不可变快照读取文件名和允许触发词。权重必须位于模板声明范围内，实际触发词必须来自该成员的允许集合并已经包含在正向Prompt中。工具不得接受任意 API workflow、任意 ComfyUI 节点 ID 或数据库文件路径。只有模板运行时配置声明为 `workflow_input` 的参数才能修改对应节点输入。

## 7. 数据源只读 CLI 协议

### 7.1 传输格式

数据源用结构化Catalog模式替换现有`imagegen-semantic-query` CLI的旧semantic协议。CLI请求`GET /internal/semantic`的新OpenAPI 3.1 discovery，再根据`--path`、`--mode`和OpenAPI参数定义请求一个目录operation；旧批量调用形状不再保留。成功时CLI向stdout写一个Catalog JSON值和末尾换行并保持stderr为空；服务错误、协议错误或取消时stdout为空，CLI按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`固定的退出码向stderr写一个闭合错误对象。当前仓库执行者不得修改该CLI；CLI变更只由源数据仓库执行者在源仓库自己的发布流程中完成。

两个 discovery 必须返回同一契约身份：

```ts
interface SourceContractIdentity {
  contract_id: 'imagegen-source-contract'
  contract_version: 1
}
```

`config/runtime.json`使用`supported_source_contracts`保存Host明确支持的组合，本版本只包含`{"contract_id":"imagegen-source-contract","contract_version":1}`。`StructuredCliGenerationCatalog`启动时执行`imagegen-semantic-query --port <source-service-port> --discovery-json`，`ComfyuiSourceCatalog`启动时执行`imagegen-comfyui-source-read --port <source-service-port> --discovery-json`；两者都要求唯一stdout JSON包含`contract_id`、`contract_version`、`source_release_version`和对应OpenAPI 3.1对象，并执行精确identity匹配。`source_release_version`由数据源服务从其`package.json.version`产生，Harness不向CLI传入该值。未知契约或不受支持版本返回`SOURCE_CONTRACT_UNSUPPORTED`。adapter不猜测字段含义、不回退到旧路径，也不忽略版本差异。`<source-service-port>`表示调用方提供给CLI的本机源服务端口；本源数据实施文档不定义目标仓库保存该值的配置字段。

示例调用形状：

```text
imagegen-semantic-query \
  --port 18093 \
  --path /internal/semantic/loras \
  --mode search \
  --base_model_id 3 \
  --query portrait \
  --page 1 \
  --page_size 20
```

CLI 的参数名称、必填性、类型、范围、示例和响应 schema 全部来自 live discovery。所有新增语义 operation 都是只读查询；handler 不得插入或更新 `comfyui_runs`、`comfyui_run_outputs` 或其他数据源表，也不得把媒体写入数据源目录。

### 7.2 十个 Catalog operation

| path | operationId | Harness Tool | 返回内容 |
|---|---|---|---|
| `/internal/semantic/works` | `querySemanticWorksForSkill` | `query_semantic_works` | 作品安全投影分页 |
| `/internal/semantic/characters` | `querySemanticCharactersForSkill` | `query_semantic_characters` | 角色安全投影分页，可按作品ID筛选 |
| `/internal/semantic/styles` | `querySemanticStylesForSkill` | `query_semantic_styles` | 画师或画风安全投影分页，可按底模ID筛选 |
| `/internal/semantic/prompt-terms` | `querySemanticPromptTermsForSkill` | `query_semantic_prompt_terms` | Prompt术语安全投影分页 |
| `/internal/semantic/base-models` | `querySemanticBaseModelsForSkill` | `query_semantic_base_models` | 底模安全投影分页 |
| `/internal/semantic/generation-models` | `querySemanticGenerationModelsForSkill` | `query_semantic_generation_models` | 生成模型安全投影分页 |
| `/internal/semantic/loras` | `querySemanticLorasForSkill` | `query_semantic_loras` | LoRA 安全投影分页 |
| `/internal/semantic/artist-prompt-strings` | `querySemanticArtistPromptStringsForSkill` | `query_semantic_artist_prompt_strings` | 画师串安全投影分页 |
| `/internal/semantic/comfyui-instances` | `querySemanticComfyuiInstancesForSkill` | `query_semantic_comfyui_instances` | 实例ID、安全名称、enabled和validated；不返回URL或凭据 |
| `/internal/semantic/comfyui-templates` | `querySemanticComfyuiTemplatesForSkill` | `query_semantic_comfyui_templates` | 模板、当前 revision 与运行时参数摘要；不返回完整 workflow |

DeepSeek Harness Host 插件根据 discovery 注册上表的模型工具；目标 Harness profile 决定哪些工具对一个 Agent 可见。浏览器上下文选择器通过 Harness 类型化 remote RPC 使用同一个 `StructuredCliGenerationCatalog` adapter。目标 profile 不向 Skill 暴露启动 CLI 进程的 Host 能力；只有 Host adapter 启动 CLI。

完整模板 bundle 和实例认证信息不属于模型工具结果。本仓库 `ComfyuiSourceCatalog` 使用数据源仓库的 `imagegen-comfyui-source-read` 读取 Host 专用的本机只读 source discovery，并调用其中的 Source Operation。该命令不读取 `/internal/semantic` discovery，不进入 DeepSeek Harness Agent Tool、Skill Tool 或浏览器 RPC 列表，并且不修改数据源记录。本版本不认证调用该命令或只读 source discovery 的其他本机进程。两个 discovery 均由同一个 `schema/api/openapi.yaml` 投影并复用相同的契约身份、稳定 ID、revision、共用 schema 和错误结构。

### 7.3 本仓库服务接口

Host 调用媒体与 Workflow 读取方法时必须提供第 6.3 节定义的 `ArtifactAccessScope`。右列会话结果入口使用 Host 当前 Session 生成 Session 结构；左侧全局媒体库和全局任务列表入口使用 Host 当前 Workspace 生成 Workspace 结构。浏览器请求不包含 `ArtifactAccessScope`，也不能指定授权范围。全局任务列表 RPC 只返回 Workspace scope 内的任务；取消 RPC 使用同一 Workspace scope 校验目标 `run_id`，不能取消其他 Workspace 的 Job。

本仓库运行服务提供独立的类型化接口；这些接口不经过数据源 CLI：

| Service method | 用途 |
|---|---|
| `GenerationRuns.create` | 创建本仓库持久运行并异步提交 ComfyUI |
| `GenerationRuns.get` | 读取本仓库中的一个运行及其输出描述 |
| `GenerationRuns.list` | 按 Host 授权的 Harness Workspace、Session、数字 `turn`、状态和创建时间分页查询本仓库运行 |
| `GenerationRuns.resolveToolResultLink` | 当公开`ToolResultNode.call === null`时，按Host派生Workspace、当前Session、公开`callId`与meta `run_id`核对持久Tool→Run映射，并返回固定Generation Tool link合同 |
| `GenerationRuns.cancel(run_id, access_scope)` | 在 Host 派生的 Workspace 授权范围内取消指定的 `remote_pending` 或 `remote_running` Job，并通过 Jobs API 回读最终状态 |
| `GenerationRuns.listMedia(input, access_scope)` | 按 Host 授权的 Harness Workspace 或单个 Session、数字 `turn`、`run_id`、媒体种类和创建时间范围分页查询本仓库媒体 |
| `GenerationRuns.getActualWorkflowJson(run_id, access_scope)` | 在 `ArtifactAccessScope` 授权范围内读取本仓库保存的本次实际 Workflow JSON |
| `GenerationRuns.getApiWorkflowJson` | 供 Host 私有提交、恢复和诊断逻辑读取本仓库保存的实际 API Workflow JSON；该方法不注册浏览器 RPC |
| `GenerationRuns.getMediaDescriptor(media_id, access_scope)` | 在 `ArtifactAccessScope` 授权范围内读取本仓库保存的媒体公开描述 |
| `GenerationRuns.openMedia(media_id, access_scope)` | 在 Host 派生的 `ArtifactAccessScope` 范围内读取本仓库保存的媒体二进制流 |

## 8. 运行刷新与结果卡片

### 8.1 Session 关联与 Run Refresh Polling

Harness Session日志在用户显式选择`comfyui-generate`时保存`source.kind: "skill-invocation"`与`source.name: "comfyui-generate"`的原生Context消息，并保存原生Generation Tool Call和包含`run_id`与meta合同的Generation Tool Result。Generation Tool Host adapter先按`exec.callId`唯一找到`tool/call`及其数字turn与`seq`，再找到同一turn且位于Tool Call之前的最近唯一`turn/start`，并且只扫描`turn/start.seq < event.seq < tool/call.seq`内的`user/message.source`。边界缺失、歧义、目标Context缺失或只在上一turn存在时返回`GENERATION_SKILL_INVOCATION_REQUIRED`，不得创建Run、持久映射或调用`/prompt`。Harness ComfyUI Host插件不得写入`generation.run.created`、`generation.run.updated`、`generation.run.completed`、`generation.run.failed`或`generation.run.cancelled`持久事件。

DeepSeek Harness `0.1.0-rc.8` 的 public forwarded-event allowlist 不包含项目 Run 事件。当前项目不修改该 allowlist，也不发送自定义 Host→Client 事件。项目 Typert Remote 的 Run projection response 包含当前 Workspace、Session、数字 `turn` 的运行列表、`hasNonterminalRuns` 和 `refreshAfterMs`；response 不包含凭据、文件路径或 ComfyUI URL。

Client必须实现唯一`GenerationRunProjectionStore`和唯一轮询协调器。中列Generation Tool行用`run_id`订阅单项投影，右列用当前Session和数字`turn`订阅分页投影；Remote返回项全部按`run_id`归并到同一Store，两处不保存独立的Run副本。Client遇到通过call+meta校验或`resolveToolResultLink()`映射校验的Tool Result、打开results panel、切换Session、切换数字`turn`或完成取消请求后立即调用Run projection Remote。页面可见，且中列可见Tool行或右列可见卡片订阅了非终态Run时，Client按`refreshAfterMs`继续查询；两处同时可见时合并为一个计时器和一次查询。页面隐藏、两处都没有可见消费者或全部已观察运行终态时停止。浏览器重新打开Session时，项目Store直接按当前Workspace、Session和数字`turn`查询运行，不依赖项目事件历史。

### 8.2 媒体描述

`StoredMediaDescriptor` 使用第 5.4 节的字段定义，不包含本地文件系统路径。右列会话媒体库使用 Session `ArtifactAccessScope` 调用 `GenerationRuns.listMedia()`；左侧全局媒体库使用当前 Harness Workspace 的 `ArtifactAccessScope` 调用 `GenerationRuns.listMedia()`。Host 从自己的 Workspace 与 Session 目录解析授权范围，不接受浏览器提交的任意 `session_id` 集合。Host 插件把 `GenerationRuns.openMedia(media_id, access_scope)` 暴露为经过相同范围授权检查的媒体读取路由，并返回已保存的 `mime_type`、`byte_length` 和二进制流。前端卡片从该路由获得临时 `media_url`，而不是直接拼接本地文件路径。

右列 Workflow JSON 下载处理器使用 Host 当前 Session 派生的 Session `ArtifactAccessScope`；全局媒体库 Workflow JSON 下载处理器使用 Host 当前 Workspace 派生的 Workspace `ArtifactAccessScope`。两个处理器都调用 `GenerationRuns.getActualWorkflowJson(run_id, access_scope)`，且只读取所属运行已经保存的 `actual-workflow.json`。因此浏览器用户停留在 Session A 时，可以从全局媒体库下载同一 Workspace 内 Session B 的媒体所属 Workflow；右列下载不能读取 Session B 的运行；两个入口都不能读取其他 Workspace 的运行。媒体或运行不存在时返回 `MEDIA_NOT_FOUND` 或 `RUN_NOT_FOUND`；Workflow JSON 尚未保存时返回 `GENERATION_ARTIFACT_NOT_READY`；授权范围不包含所属运行时返回 `GENERATION_ARTIFACT_ACCESS_DENIED`。`GenerationRuns.getApiWorkflowJson(run_id)` 只供 Host 私有提交、恢复和诊断逻辑使用，不注册为浏览器下载 RPC。

本仓库运行服务在保存媒体前必须依据配置的 MIME allowlist 和文件签名验证实际内容。URL 扩展名不能决定媒体种类。媒体凭据和 ComfyUI 实例凭据不得出现在 `StoredMediaDescriptor`、Run projection Remote 或浏览器响应中。

### 8.3 可下载 JSON 的定义

成功运行卡片和媒体卡片提供以下浏览器下载按钮：

| 按钮 | 保存文件 | JSON 类型 | 明确定义 |
|---|---|---|---|
| 下载本次 Workflow JSON（可导入 ComfyUI） | `comfyui-run-<run_id>-workflow.json` | `ComfyuiUiWorkflowV04` | 由该运行的模板来源快照和不可变请求数据确定性转换得到的本次实际 Workflow JSON；保留节点、widget 当前值、连接和画布信息，可以导入 ComfyUI 前端 |

页面不提供名为“请求快照 JSON”或“下载本次 API Workflow JSON”的按钮。`request.json` 仍由当前仓库内部持久化，用于幂等判断、恢复和追溯；`api-workflow.json` 仍由当前仓库内部持久化，用于远端提交、恢复和诊断。浏览器下载按钮只在所属 `run_id` 已经保存 `actual-workflow.json` 时启用；卡片处于 `succeeded` 但该文件缺失时，页面显示“该运行缺少已保存的 Workflow 文件”，不能读取当前模板重新生成。

数据源系统现有浏览器实现能够从运行详情投影取得 `workflow_json` 与 `api_workflow_json`，并使用浏览器 Blob 下载。本项目只沿用 `workflow_json` 的文件内容、MIME 和文件名语义；为保持 Harness 授权范围隔离，本项目先通过经过 Host 入口 `ArtifactAccessScope` 授权的浏览器 RPC 读取所属运行已经保存的本次实际 Workflow JSON，再在浏览器创建 Blob。右列入口使用 Session scope，全局媒体库入口使用 Workspace scope；两个 RPC 都不执行转换或编译。

## 9. Skill 迁移方案

### 9.1 目标目录

Release Artifact固定包含`skills/comfyui-generate/`、`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`和`skills/lora-adjustment/`。产品安装程序把四个目录复制到每个release自己的`<release>/dsh-home/skills/`；rc.8既有`@deepseek-ai/dsh-skill-filesystem` provider从当前`DSH_HOME/skills`发现它们。Harness原生`/` Skill菜单显示当前Session可调用Skill并插入普通`/<skill-name> `文本，Host在执行前重新发现并校验。当前项目不实现第二套Skill菜单、选择状态、provider或invocation policy。

四个Skill都是同一Harness Skill层中的普通可调用Skill。Prompt Skill与LoRA调整Skill在中列返回内容，不调用Generation Tool；`comfyui-generate`才根据用户显式请求调用`generate_with_comfyui`。Skill之间不存在上下级关系，任何Skill调用本身都不创建专用Session。

### 9.2 来源系统的三个迁移 Skill

唯一来源是`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`的committed tree`799b7759029d70076791321e2b02bf53c651c98f`（tag`v0.80.0`）：

- `skills/anima-prompt-builder/`
- `skills/wai-sdxl-prompt-builder/`
- `management-skills/lora-adjustment/`

计划执行者把第三个目录迁入当前仓库的`skills/lora-adjustment/`。三个迁移Skill保留各自领域知识和需要的references，但重写为Harness普通Skill的输入、Tool和直接assistant输出协议；不迁移来源Pi、专用管理Skill会话、`agents/openai.yaml`、validation/report脚本、旧调用标识字段、来源输入包装对象、旧Skill脚本执行器或任何finalizer协议。Anima必须新建`references/catalog-tools.md`与`references/output-format.md`并移除旧语义接口和输出协议文件；WAI必须新建`references/catalog-tools.md`、`references/message-input.md`与`references/prompt-output-format.md`并改写全部旧语义Tool链接；LoRA只保留并修订`references/weight-guidance.md`，不迁移`config/`或`scripts/`。

### 9.3 Prompt Skills

`anima-prompt-builder`与`wai-sdxl-prompt-builder`读取当前普通用户消息、同一消息的不可变`generation-context.v1`快照和相关Harness Session历史。两个Skill只能使用`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`和`query_semantic_prompt_terms`取得真实语义记录。一个查询目标固定产生一次`{mode:'search',query,page:1,page_size:10}`Tool Call；多个目标分别调用，不发送批量查询数组。成功时它们在中列直接返回完整单行Prompt；失败时返回缺少的具体信息和下一步。两个Skill都不调用`generate_with_comfyui`，因此其当前聊天轮次没有`run_id`，右列显示本轮无ComfyUI运行。

### 9.4 LoRA 调整 Skill

`lora-adjustment`读取当前用户调整要求、当前消息中的一个Workflow模板快照、一个或多个有序LoRA快照和当前完整Prompt。它按快照顺序为每个字符串`source_lora_id`调用一次`query_semantic_loras({mode:'resolve',id:source_lora_id})`，保持消息快照的成员、顺序、文件名和允许触发词不变，不调用来源旧LoRA查询Tool，也不接受Host隐式注入底模或LoRA集合。成功时它在中列直接返回`{prompt_text, loras}`；每个LoRA结果包含原`source_lora_id`、MODEL权重、适用时的CLIP权重和实际采用触发词。停用成员使用零权重和空触发词；`LoraLoaderModelOnly`不返回CLIP权重。连续调整使用同一Harness Session中最近一次成功结果作为当前基线。

`lora-adjustment`不创建或拥有专用LoRA Session，不调用`generate_with_comfyui`，不创建、编号或推进Generation Run。其当前聊天轮次的右列显示本轮无ComfyUI运行。

### 9.5 新增 Skill：`comfyui-generate`

`comfyui-generate`是与前三个Skill并列的普通可选Skill。用户必须在一条新消息中显式选择它，并附加当前生成所需的Workflow模板、LoRA和其他上下文；用户可以明确引用同一Session内最近的Prompt Skill输出或LoRA调整结果。Skill不得自动调用另一个Skill，也不得把前三个Skill成功解释为自动生成授权。

`comfyui-generate` 的 `SKILL.md` 负责以下动作：

1. 从当前用户消息、`generation-context.v1`快照、可选`generation-route.v1`和用户明确引用的先前Skill结果确认生成意图、唯一模板、Prompt和可选LoRA调整结果。
2. 只按模板安全摘要中声明的`parameter_id`与`kind`映射Prompt、宽度、高度、像素总量、CFG、seed和其他显式运行值；不得猜测节点ID、input name、widget index或未声明参数。
3. 当前消息包含LoRA快照时，把被引用LoRA调整结果逐项转换为`generate_with_comfyui.lora_applications[]`；成员、顺序、稳定ID、权重和触发词必须与当前消息快照一致。
4. 对每个用户明确要求的运行调用一次`generate_with_comfyui`。Generation Tool Result只包含已经持久接纳的`{run_id}`。
5. 中列保留Agent文本、Tool Call/Result与“定位结果”，并从唯一Client Run投影Store持续显示该`run_id`的异步状态摘要；右侧第三列从同一Store快照显示详细状态、媒体和Actual Workflow下载。

确定性的模板字段绑定、节点写入、参数类型校验、状态轮询和媒体保存属于 `GenerationRuns`，不写入 Skill 脚本。

## 10. 推荐目录结构

用户确认方案后，计划执行者在当前项目中创建以下插件与原型结构。名称表示责任边界，不表示已经存在的文件。

```text
harness-comfyui/
├── package.json
├── config/
│   ├── runtime.json
│   ├── media-policy.json
│   └── comfyui-output-descriptors.json
├── src/
│   ├── contract/
│   │   ├── catalog.ts
│   │   ├── generation-run.ts
│   │   └── generation-events.ts
│   ├── host/
│   │   ├── catalog-cli-adapter.ts
│   │   ├── comfyui-source-cli-adapter.ts
│   │   ├── context-reference-codec.ts
│   │   ├── generate-with-comfyui-tool.ts
│   │   └── generation-event-projector.ts
│   ├── service/
│   │   ├── generation-runs.ts
│   │   ├── actual-workflow-builder.ts
│   │   ├── workflow-compiler.ts
│   │   ├── comfyui-transport.ts
│   │   ├── run-repository.ts
│   │   ├── media-store.ts
│   │   └── recovery-worker.ts
│   ├── client/
│   │   ├── context-picker/
│   │   ├── generation-details-panel/
│   │   └── generation-conversation-node/
│   └── testing/
│       ├── memory-generation-catalog.ts
│       ├── memory-generation-runs.ts
│       └── fixtures/
├── .dsh/
│   └── skills/
│       └── comfyui-generate/
└── prototype/
    └── generation-workbench/
```

`config/runtime.json` 是本仓库数据目录、默认 ComfyUI 实例 ID、受支持数据源契约版本、Job 观察间隔和任务消失观察期限的唯一运行配置来源。`config/media-policy.json` 是媒体种类、MIME allowlist、文件签名和保存扩展名的唯一来源。`config/comfyui-output-descriptors.json` 是 ComfyUI Job `outputs` 字段与 `image`、`video`、`audio` extractor 的唯一来源。运行时可调整值不写入 TypeScript schema。

数据源仓库完善现有 OpenAPI 驱动的语义 CLI，并从同一个 OpenAPI schema 增加 Host 专用的本机只读 source discovery 与 CLI；它不增加本项目的运行表、媒体目录或运行 worker：

```text
NoobAI-XL-FZ-PROD-ENV/
├── schema/api/openapi.yaml
├── scripts/imagegen-semantic-query.mjs
├── app/http/semantic-handler-routes.mjs
├── app/catalog/catalog-service.mjs
└── scripts/imagegen-comfyui-source-read.mjs
```

计划执行者开始正式实现前必须只读核对两个来源仓库的实际构建配置和包边界，再确定当前仓库中的精确文件名。计划执行者只能在当前仓库安装 DeepSeek Harness 宿主和本项目依赖，并且不得在未制定依赖计划的情况下安装新依赖。

### 10.1 依赖计划与安全门禁

静态原型使用原生 HTML、CSS 和浏览器 JavaScript，新增依赖数量为 0。当前仓库的运行服务使用 Node 内置 `fetch`、`node:sqlite`、`node:fs`、`node:crypto` 和 Web Stream；本方案不选择新的第三方数据库、HTTP、队列或媒体库。

正式 out-of-tree bundle 只声明当前 DeepSeek Harness checkout 已有的 Host peer package。计划执行者创建 `package.json` 时必须把下表版本写成精确版本，不使用 `^`、`~`、`latest` 或未固定 Git revision：

| 依赖 | 计划版本 | 用途 |
|---|---:|---|
| `@deepseek-ai/cordis` | `4.0.1` | Host 与 Client 插件组合 |
| 所需 `@deepseek-ai/dsh-*` peer package | `0.1.0-rc.8` | Session、Tool、Remote、Client runtime 和 UI slot |
| `react` / `react-dom` | `18.3.1` | Client renderer |
| `typescript` | `6.0.3` | 类型检查与构建 |
| `tsdown` | `0.22.2` | 与当前 Harness 一致的 bundle 构建 |
| `vitest` | `4.1.8` | contract、unit 和组合测试 |
| `@types/node` | `22.20.0` | Node 类型 |
| `@types/react` | `18.3.31` | React 类型 |
| package manager | `pnpm@11.7.0` | 与当前 Harness 根项目一致 |

2026-08-20 对只读 DeepSeek Harness 来源仓库 `pnpm-lock.yaml` 执行的生产依赖审计返回 0 个 critical、12 个 high、12 个 moderate 和 1 个 low advisory。计划执行者已经逐项处理这 12 条来源基线：当前 Development Workspace 使用精确直接依赖、七个受影响版本 override 和自己的 lockfile；当前完整闭包与 production 闭包的 audit 都返回 0 个 critical、0 个 high、0 个 moderate 和 0 个 low advisory。具体 GHSA、版本与处理结论记录在 `docs/security/dependency-advisory-audit-2026-08-20.md`。

high/critical advisory 门禁与 build-script 门禁都已经通过。`pnpm-workspace.yaml` 明确允许 `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7`、`@google/genai@1.52.0`、`koffi@3.1.5`、`node-pty@1.2.0-beta.15` 和 `protobufjs@7.6.5` 的生命周期脚本。计划执行者不得使用 `allowBuilds` 裁剪这些依赖包的安装行为。计划执行者新增或升级任一第三方依赖前必须更新精确版本、lockfile、`allowBuilds` 决定和安全审计结论。

## 11. 实现顺序与门禁

### 阶段 1：静态交互原型

计划执行者使用静态 fixture 实现用户已经选定的变体 A。变体 B 与变体 C 只保留在本方案中作为已讨论但未选用的设计记录，不创建对应页面路由。

验收内容：

- 浏览器用户能够识别三列的职责。
- 页面不得显示没有已实现行为的“新建会话”“会话选项”或其他占位按钮。
- 浏览器用户能够在底模筛选器中选择“全部”或具体底模，并完成“设置底模筛选 → 选择模板或 LoRA 上下文 → 发送消息”的本项目静态交互；发送后的不可变上下文快照不包含底模筛选值。Skill 选择由 DeepSeek Harness 原生会话输入能力验收，不由本项目静态原型模拟。
- 浏览器用户能够从聊天轮次的数字 `turn` 定位对应的 `run_id` 卡片。
- 浏览器用户能够在同一 Session 中选择不同聊天轮次；右列“当前轮次结果”分别显示零个、一个和多个关联运行，不使用 Session 最新运行替代轮次关联。
- 默认已选聊天轮次直接显示队列等待、ComfyUI 执行、保存媒体和提交结果未知四个运行；普通画风参数对比 Session 直接显示成功与失败运行。以上状态不得只存在于底部原型状态选择器。
- 图片、视频、音频和失败运行具有不同且明确的视觉状态。
- 成功运行卡片与媒体卡片显示“下载本次 Workflow JSON（可导入 ComfyUI）”；页面不显示 API Workflow JSON 下载按钮。
- 浏览器用户能够在右列“本会话结果”按聊天轮次、媒体种类和保存时间筛选已保存媒体，并使用独立分页定位任一媒体。每张媒体卡片的主体在新窗口打开原文件。
- 浏览器用户能够从左侧“所有媒体”入口打开居中的全局媒体库，按会话、聊天轮次、媒体种类和保存时间筛选跨会话媒体，并使用独立分页定位任一媒体。
- 浏览器用户能够从左侧“所有 ComfyUI 异步任务”入口打开居中的全局任务列表，按会话、聊天轮次和创建时间筛选当前 Workspace 的任务，并使用独立分页定位任一任务。
- 排队和运行中的任务显示取消按钮；确认取消时页面明确显示目标 `run_id`、`prompt_id`、实例名称和 `POST /api/jobs/{prompt_id}/cancel`。取消交互依次显示“正在取消”和“已取消”，并同步更新右列同一 `run_id` 的运行卡片。保存媒体、提交结果未知和终态任务不显示可用取消按钮。
- 浏览器用户停留在 Session A 时，能够从全局媒体库下载当前 Workspace 内 Session B 的媒体所属本次实际 Workflow JSON；同一 `run_id` 不能通过右列 Session A 下载入口读取，其他 Workspace 的运行也不能通过全局媒体库读取。
- “提交结果未知”卡片显示系统不会自动重提，并与普通失败和排队状态具有不同文案。
- 右列不显示 Tool 详情标签或 Tool 结构化结果；浏览器用户通过 DeepSeek Harness 轨迹功能查看多个 Tool 的调用详情。

### 阶段 2：结构化查询 CLI

源数据仓库执行者必须先按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`在源数据仓库自己的Issue、分支、测试和版本发布流程中实现并发布10个Catalog Operation、2个Source Operation、两个discovery、只读handler、catalog service和两个CLI。源数据测试必须证明`imagegen-semantic-query`只能发现Catalog Operation，`imagegen-comfyui-source-read`只能发现Source Operation，两个discovery返回相同的`contract_id`与`contract_version`，并且全部Source Operation都不修改数据源。源数据仓库完成发布后，用户把发布commit/tag、CLI版本、合同版本和release acceptance提供给本仓库。

当前仓库Ticket在上述源数据发布前保持阻塞。解除阻塞后，当前仓库执行者只能在自己的worktree中实现Harness Tool provider、唯一registry、adapter、remote RPC、上下文选择器和Context resolver；Harness Agent Tool列表、Skill Tool列表和浏览器RPC不得包含Source Operation。本仓库Issue不得修改、提交或发布源数据仓库文件。

验收内容：

- 每个资源种类都具有成功、空集合、非法筛选、资源不存在和数据源不可用测试。
- `base-model` 查询测试必须返回底模筛选选项；类型测试必须阻止 `CatalogRef<'base-model'>` 与 `CatalogRef<'comfyui-instance'>` 赋值给 `ContextRef`。
- 运行时契约测试必须确认`GenerationCatalog.resolve()`、`ContextResolver.serialize()`和消息提交接口收到`kind: 'base-model'`或`kind: 'comfyui-instance'`时返回`CONTEXT_KIND_NOT_INSERTABLE`，并且Session log与`RunRequestSnapshot.context_snapshots`均不新增对应项。
- adapter 契约测试必须覆盖支持的 `contract_id`/`contract_version`、未知契约和不受支持版本；不兼容契约必须阻止对应数据源能力并返回 `SOURCE_CONTRACT_UNSUPPORTED`。
- 浏览器无法获得 ComfyUI 凭据字段或数据库内部字段。
- ComfyUI 实例模型 Tool 结果和生成浏览器 RPC 的契约测试断言不存在 `instance_url`、实例 `url`、`authorization` 和凭据字段；Host source adapter 仍能取得 URL 与认证信息。
- 用户正文与上下文快照通过一个消息提交动作写入 Session log。

### 阶段 3：持久 ComfyUI 运行

计划执行者在当前仓库实现 `LocalGenerationRuns`、运行数据库、`ActualWorkflowBuilder`、Workflow compiler、ComfyUI transport、媒体目录和恢复 worker，使当前仓库同时保存本次实际 Workflow JSON 与 API Workflow JSON，支持幂等创建、重启恢复以及图片、视频、音频输出。随后计划执行者实现 Harness Tool、`ctx.jobs` 代理、项目 Run projection Typert Remote 和条件轮询 Client。

验收内容：

- 数据源只读 CLI 返回的模板 revision、workflow hash 或运行时配置 revision 不完整时，本仓库运行服务拒绝提交并返回明确错误。
- 重复 `(workspace_id, session_id, call_id)` 不会创建第二个远端 ComfyUI 任务。
- 测试分别在远端提交前、`submitting` 状态、远端返回 `prompt_id` 后和 `prompt_id` 落库后注入进程崩溃；同一个 Harness Tool Call identity的恢复流程不产生第二个远端任务。
- `/prompt` 请求超时且本仓库没有保存 `prompt_id` 时，运行进入 `submission_unknown`，错误码为 `COMFYUI_SUBMISSION_RESULT_UNKNOWN`，取消能力为 false，worker 不自动重提。
- 已保存 `prompt_id` 后首次收到 Jobs API 404 且尚未超过观察期限时，运行保持进入本次查询前的远端状态，不生成错误码，取消能力按 `remote_pending` 或 `remote_running` 状态计算，worker 不自动重提。
- 已保存 `prompt_id` 后持续收到 Jobs API 404 并超过观察期限时，运行进入 `failed`，错误码为 `COMFYUI_JOB_MISSING`，取消能力为 false，worker 不自动重提。
- DeepSeek Harness 进程重启后，右列能够根据持久 `run_id` 恢复状态。
- Harness Session日志契约测试必须确认`comfyui-generate`的`skill-invocation`Context位于目标`turn/start`与`generate_with_comfyui` Tool Call之间，Tool Call与Tool Result使用同一`callId`；Tool Result的canonical output保存`run_id`，`ToolResultNode.meta`保存`harness-comfyui-generation-run` v1合同。上一turn有Invocation但当前turn缺失时必须返回`GENERATION_SKILL_INVOCATION_REQUIRED`且不创建Run。history window只有Tool Result且`ToolResultNode.call === null`时，`resolveToolResultLink()`必须恢复合法映射并拒绝篡改的Session、`call_id`或`run_id`。日志中不存在`generation.run.created`、`generation.run.updated`、`generation.run.completed`、`generation.run.failed`和`generation.run.cancelled`。
- 浏览器刷新测试必须确认Tool Result meta合同被验证，且打开右列、切换Session、切换数字`turn`和取消后立即读取Run Repository；页面可见、中列或右列存在可见的非终态运行时按`refreshAfterMs`继续查询，两处同时可见时不重复轮询，页面隐藏、两处都没有可见消费者或全部终态时停止。每次Store revision中，中列Tool行与右列卡片必须显示同一状态。实现与产物中不得出现`generation.run.changed`或其他项目forwarded event。
- 媒体类型由响应 Content-Type 与文件签名共同确认。
- 多运行、多输出 fixture 验证 `listMedia()` 的 Session 与 Workspace 授权隔离、数字 `turn`、`run_id`、媒体种类、创建时间范围、分页和 `total_count`。
- fake transport 覆盖 `GET /api/jobs/{prompt_id}` 的排队、运行、完成、Job 失败、Job 取消、任务消失、网络中断、多输出、非法 MIME、签名不匹配、图片、视频和音频分支，并覆盖 `POST /api/jobs/{prompt_id}/cancel` 的成功、幂等 no-op 和完成竞态。
- 下载的本次实际 Workflow JSON 与该运行保存的模板来源快照、内部请求快照和运行参数转换结果一致，并且保留 ComfyUI UI Workflow 0.4 的节点、widget、连接和画布结构。
- Host 私有读取的 API Workflow JSON 与实际传给 ComfyUI `/prompt` 的 `prompt` 对象一致；测试断言它由同一个本次实际 Workflow JSON 编译得到。
- 测试在浏览器下载动作前修改数据源当前模板，本次实际 Workflow JSON 下载结果仍保持不变；Host 私有 API Workflow JSON 读取结果也保持不变。
- 测试分别覆盖两个 JSON 已保存、其中一个缺失、运行失败、多个失败尝试后一个成功运行和跨 Session 访问分支；只有本次实际 Workflow JSON 注册浏览器下载动作。
- 右列媒体读取和本次实际 Workflow JSON 下载拒绝访问其他 Harness Session 的运行产物；全局媒体库媒体读取和 Workflow 下载拒绝访问其他 Harness Workspace 的运行产物；Host 私有 API Workflow JSON 读取不暴露给浏览器。
- 全局媒体库下载测试覆盖：停留在 Session A 下载同一 Workspace 内 Session B 的媒体所属 Workflow 成功；其他 Workspace 的 `run_id`、伪造 `run_id` 和右列跨 Session 下载失败。
- 数据源数据库和数据源媒体目录在任务创建、运行、成功、失败与恢复过程中保持不变。
- Host 日志和结构化错误只记录实例 ID 与错误码，不记录实例 URL、Authorization header 或凭据值。

### 阶段 4：Skill 适配

计划执行者从固定来源revision迁移`anima-prompt-builder`、`wai-sdxl-prompt-builder`和`lora-adjustment`，并新增普通可选Skill`comfyui-generate`。四个Skill都通过同一Harness Skill provider发现。计划执行者不得创建专用Prompt或LoRA Session，也不得让Prompt或LoRA调整Skill调用`generate_with_comfyui`。

验收内容：

- 计划执行者使用 DeepSeek Harness 当前版本的原生 Skill provider、目标 profile 和已注册工具完成组合测试，不模拟原仓库的 Skill 可见性规则。
- 两个Prompt Skill只调用四个Prompt语义Catalog Tool并在中列返回单行Prompt；`lora-adjustment`调用`query_semantic_loras`并在中列返回`{prompt_text,loras}`；三者都不创建Run。
- `comfyui-generate`只在用户显式选择后，把当前消息与用户明确引用的先前Skill结果转换为一次Generation Tool调用。
- 四个Skill不在`SKILL.md`中保存数据源仓库绝对路径、SQLite路径或ComfyUI URL，也不包含来源系统的旧调用标识字段、`run_skill_script`或finalizer协议。
- Skill缺少模板、Prompt、LoRA快照、实例或必填运行参数时返回具体缺失项。
- 只有`comfyui-generate`调用成功后，右侧第三列才按工具返回的`run_id`显示同一运行。

### 阶段 5：真实组合测试

计划执行者使用 DeepSeek Harness 的真实插件组合测试覆盖用户消息、流式 Agent 输出、Tool Call/Tool Result、Run projection Remote 条件轮询、右列结果和 Session 重新打开。ComfyUI transport 使用受控测试实例或 fake transport。

## 12. 需求映射

| 用户需求 | 方案位置 |
|---|---|
| DeepSeek Harness 作为 Agent 宿主 | 第 2、3、6、8 节 |
| 三列 HTML 前端 | 第 4 节 |
| 会话列表 | 第 4.1 节左列 |
| 单会话流式聊天 | 第 4.1 节中列 |
| 生成结果卡片 | 第 4.1 节右列与第 8 节 |
| 每条消息插入结构化上下文 | 第 5 节 |
| 上下文种类可持续扩展 | 第 5.2 节与第 7 节 |
| 聊天中选择不同Skill | 用户在项目输入框输入`/`并使用Harness原生Skill菜单；Host继续负责Skill发现、文本插入与调用校验 |
| 迁移会话 Skill、管理 Skill 和后续 Skill | 第9.2至9.4节迁移两个Prompt Skill与`lora-adjustment`；第9.5节新增`comfyui-generate` |
| 异步 ComfyUI 底层服务 | 第 6.3、6.4、7.3、8、11 节 |
| Skill 修改模板参数并提交任务 | 第 6.5、9.4 节 |
| 结果块显示 Skill 运行结果 | 第 8 节 |

## 13. 决策状态

已经确认：

1. 右列采用变体 A，并只保留“当前轮次结果 / 本会话结果”两个标签；多个 Tool 的调用详情由 DeepSeek Harness 轨迹功能展示。
2. 成功运行卡片和媒体卡片提供本次实际 Workflow JSON 下载。该文件由内部请求数据与模板来源快照转换得到，不是原始请求快照；API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用，页面不提供请求快照或 API Workflow JSON 下载。
3. 项目`sidebar` occupant在原型规定位置直接渲染“所有媒体”入口，并使用DeepSeek Harness的居中`Modal`显示跨会话媒体库。右列“本会话结果”和全局媒体库复用固定尺寸媒体卡片、轮次/类型/时间筛选及分页行为；全局媒体库额外提供会话筛选。
4. 项目`sidebar` occupant在原型规定位置直接渲染“所有 ComfyUI 异步任务”入口；入口使用居中`Modal`显示按会话、聊天轮次和创建时间筛选的Workspace任务列表。排队与运行中Job通过当前实例已经验证的`POST /api/jobs/{prompt_id}/cancel`取消。
5. Skill候选、`/`菜单、文本插入、发现与调用校验使用DeepSeek Harness现有交互；项目`conversation.composer.bar` occupant渲染ConversationRoot传入的原生`conversation.input.overlay`，同时提供结构化上下文和项目消息发送控件。

Skill迁移来源与职责已经确认：两个Prompt Skill和`lora-adjustment`来自`NoobAI-XL-FZ-PROD-ENV@799b7759029d70076791321e2b02bf53c651c98f`；`comfyui-generate`由当前项目新增。Prompt与LoRA结果位于中列，生成结果位于右侧第三列。

## 14. 推荐结论

变体A已经选定。该变体通过rc.8公开bundle row覆盖、内建root slot、标准child slot与公开`ILayout` service渲染项目Workbench，并继续运行ConversationRoot、真实Session、标准conversation projection、Skill校验和Tool执行；右列只显示当前轮次与本会话的ComfyUI结果，多个Tool的参数、结果与顺序来自Harness公开projection；底模只作为目录查询筛选条件，`ContextRef`在类型与运行时schema中排除`base-model`；消息上下文由Context resolver与正文通过一次`SessionFace.prompt()`原子写入Session log；`GenerationCatalog`隔离目录查询，`ComfyuiSourceCatalog`隔离实例与模板只读查询，`GenerationRuns`隔离当前仓库中的持久ComfyUI生命周期；`generate_with_comfyui`向目标Harness profile授权的普通Skill提供统一Tool接口，不要求专用Session或前置Skill。数据源仓库只提供来源数据，当前仓库是`run_id`、状态、媒体文件、内部来源快照、内部请求快照、本次实际Workflow JSON和API Workflow JSON的唯一持久事实来源。
