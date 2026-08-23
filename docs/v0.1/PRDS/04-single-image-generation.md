# PRD 04：单张图片生成闭环

## 关联 Ticket

Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow。

## Harness 核心零改动与公共接口

Release Artifact必须包含`skills/comfyui-generate/`。Ticket 15交付的`harness-comfyui` Agent Preset必须通过`includeDefaultRoots: false`与`customSkillDirs: [HARNESS_COMFYUI_SKILL_DIR]`只读取当前release的`package/skills`；安装程序不得把项目Skill复制到`DSH_HOME/skills`。用户必须通过Ticket 02保留的Harness原生`/` Skill菜单选择`comfyui-generate`；项目不得调用SkillsApi重做该菜单或保存Skill选择状态。Host `dsh-tool-skill`在执行前重新发现并校验。

本Ticket只使用`@deepseek-ai/dsh-tools`的`defineTool()`和`ToolRunContext.callId`构造`generate_with_comfyui`，并通过PRD 01的`registerProjectTools()`注册；项目从`exec.agent.id`、`exec.agent.session.events`与`@deepseek-ai/dsh-workspace`的`ctx.workspaceRegistry.list()`取得Session、数字turn与Workspace关联。Tool Host adapter必须先按`exec.callId`在公开事件序列中唯一找到原生`tool/call`，读取该事件的数字`turn`与`seq`；然后唯一找到同一数字`turn`且`seq`小于Tool Call的最近一条`turn/start`边界；最后只扫描`turn/start.seq < event.seq < tool/call.seq`范围内的`user/message.source`，要求至少一条完全等于`{ kind: "skill-invocation", name: "comfyui-generate", form: "instructions" }`。`tool/call`、`turn/start`或边界无法唯一确定，或者该范围没有目标Context时，Host返回`GENERATION_SKILL_INVOCATION_REQUIRED`并且不得创建Run、持久映射或调用`/prompt`。Host不得扫描整个Session，也不得把上一数字turn的Skill Invocation用于当前Tool Call。模型参数不得包含`call_id`、Session ID、数字turn或Workspace ID。

本Ticket复用`ui-conversation`注册的标准conversation event definitions，并在Ticket 02注册到公开`conversation.view`、`id: "chat"`的项目occupant中从`ConversationSnapshot`渲染Skill Invocation和Tool Call。Harness Host必须把用户显式`/comfyui-generate`识别为当前数字`turn`内的持久`user/message`上下文，该上下文的`source`固定为`{ kind: "skill-invocation", name: "comfyui-generate", form: "instructions" }`。AgentLoop随后产生的原生`tool/call`与`tool/result`使用同一`callId`，项目不注册第二套Skill事件或Tool事件。

`generate_with_comfyui`必须使用`defineTool()`的唯一结构化输出定义。`output.schema`固定为只允许必填字符串`run_id`的封闭对象；`output.render()`把同一`{ "run_id": "..." }`渲染为Harness Tool Result内容；`output.presentationMeta()`固定返回`{ "contract_id": "harness-comfyui-generation-run", "contract_version": 1, "run_id": "..." }`。Harness必须把该元数据持久到公开`ToolResultNode.meta`，使Session重放与实时投影使用同一结构；Client不得从Agent回复、Tool标题或Tool Result文字中提取`run_id`。

公开`ToolResultNode.call`在配对Tool Call尚未进入当前history window时可以是`null`。Client验证Generation Tool Result必须使用唯一规则：`call !== null`时同时要求`call.name === "generate_with_comfyui"`、settled success和合法meta；`call === null`时不得丢弃合法meta或仅信任meta，而必须使用公开`ToolResultNode.callId`、当前Session ID和meta中的`run_id`调用项目Remote `GenerationRuns.resolveToolResultLink()`。Host从当前连接派生Workspace授权，核对Run Repository中的`(workspace_id, session_id, call_id) -> run_id`持久映射后，只返回`{ "contract_id": "harness-comfyui-generation-tool-link", "contract_version": 1, "tool_name": "generate_with_comfyui", "session_id": "...", "turn": 1, "call_id": "...", "run_id": "..." }`。映射不存在、Session或`run_id`不一致时返回`GENERATION_RUN_LINK_INVALID`，Client不建立中列或右列Run链接。

项目Client plugin必须实现唯一`GenerationRunProjectionStore`。该Store以当前Harness Workspace授权范围和`run_id`为查询键，只通过项目Typert Remote读取Run Repository，并为中列`generate_with_comfyui` Tool行与右列运行卡提供同一`GenerationRunSnapshot`。实时投影中，`RunningToolCall`还没有`run_id`时，中列固定显示“正在创建 ComfyUI 运行”；Tool Result成功且`meta`通过合同校验后，中列和右列同时改为Store中该`run_id`的真实状态。Tool Result失败时，中列显示Harness Tool错误且右列不创建卡片。

未匹配的Tool使用项目Workbench的通用Tool行；完整Tool参数、结果与顺序继续来自Harness标准conversation projection。项目Client plugin注销或abdicate后，默认AppFrame与上游Tool UI恢复。

项目使用`@deepseek-ai/dsh-jobs`的`ctx.jobs`表示当前Agent的进程内等待，使用`@deepseek-ai/dsh-host-webserver`的`ctx.webServer.register()`提供同源Actual Workflow下载，并使用项目Typert Remote读取Run Repository。Harness原生Tool execution identity与标准conversation projection必须保留；项目不得重写Tool execution pipeline或复制Tool identity。

## 用户任务

浏览器用户在中列项目输入框输入`/`并从Harness原生Skill菜单选择`comfyui-generate`，发送包含真实Workflow模板、角色和图片要求的消息；Agent调用一次`generate_with_comfyui`。Tool运行期间中列显示“正在创建 ComfyUI 运行”；Tool Result返回合法meta后，中列持续显示该`run_id`的异步状态摘要，右列显示同一Store快照的详细图片生成状态与结果；用户下载该运行保存的Actual Workflow。

tarball-only验收必须在来源 checkout不存在时完成 Skill发现与选择；测试不得从当前仓库 `skills/`、用户全局 `DSH_HOME` 或测试 fixture补入该 Skill。

## 原型依据

- 中列的 `generate_with_comfyui` Tool Call 行和“定位结果”。
- 右列成功图片运行卡片的标题、`run_id`、状态 badge、模板、实例、图片和“下载本次 Workflow JSON（可导入 ComfyUI）”。
- 原型没有定义持久化、Source Operation、Workflow 转换或远端协议；以下条款补足这些正式产品要求。

## Host-only Source Operation

以下两个`audience: source-host`只读operation及`imagegen-comfyui-source-read`必须先按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`在数据源仓库自己的计划、测试和发布流程中实现。本Ticket不得修改数据源checkout；本Ticket只实现当前仓库`ComfyuiSourceCatalog`并消费Installation中`source.sourceCliPath`指向的已发布CLI。未取得受支持的数据源contract版本时，本Ticket状态为阻塞：

| Source GET path | operationId | 输入 | Host-only 输出 |
|---|---|---|---|
| `/internal/comfyui-source/instances/{instance_id}` | `getComfyuiInstanceSourceForHost` | 稳定 `instance_id` | v0.82.2 `results[0]` 实例记录；adapter 映射为内部 InstanceSnapshot，不把 `authorization` 写入持久快照；不存在和凭据不可用分别返回`SOURCE_INSTANCE_NOT_FOUND`与`SOURCE_CREDENTIAL_UNAVAILABLE` |
| `/internal/comfyui-source/templates/{template_id}/bundle` | `getComfyuiTemplateBundleForHost` | 稳定 `template_id` | v0.82.2 `results[0]` 模板记录；adapter 映射为内部 TemplateBundle；不存在或 `expected_output_node_ids_json` 缺失/空/非法分别返回`SOURCE_TEMPLATE_NOT_FOUND`与`SOURCE_TEMPLATE_UNAVAILABLE` |

Source discovery固定为 v0.82.2 `imagegen-comfyui-source-read --discovery-json` 成功 envelope；Harness adapter 要求顶层 `status`、`message`、`results`、`page`、`page_size`、`total_count`，并要求 `results[0]` 为 OpenAPI 3.1 文档。Harness Installation pin 来自 `source.contractId` 与 `source.sourceReleaseVersion`，不从 live body 读取。两个Source Operation不声明Harness Tool名，不生成Client remote contribution，也不出现在Agent Tool、Skill Tool或`ctx.remote`。

`ComfyuiSourceCatalog`必须逐字段采用源数据实施文档规定的`InstanceSource -> PrivateComfyuiInstanceSnapshot`映射，并逐错误采用以下唯一映射：四个实例错误和两个模板错误保持同名；discovery identity或版本不匹配返回`SOURCE_CONTRACT_UNSUPPORTED`；`SOURCE_REQUEST_INVALID`、`SOURCE_DATABASE_BUSY`和`SOURCE_INTERNAL_ERROR`逐项返回`SOURCE_PROTOCOL_ERROR`；CLI连接、超时、未声明服务错误、非JSON、空stdout、多JSON或响应Schema错误也返回`SOURCE_PROTOCOL_ERROR`。Issue执行者不得为缺失字段提供默认值，也不得把禁用与未验证合并。

当前仓库合同测试必须让Source CLI分别以退出码`7`返回`SOURCE_REQUEST_INVALID`、`SOURCE_DATABASE_BUSY`和`SOURCE_INTERNAL_ERROR`，并断言三者都产生项目`SOURCE_PROTOCOL_ERROR`；Generation Run必须在调用`/prompt`前停止并保存相同结构化错误。

## v0.82.2 正式 Source 消费合同

本节是本 PRD 中 Source discovery、InstanceSource 和 TemplateBundle 的最新规范，优先于本文件前面要求旧 `contract_id`/`contract_version` wrapper 或直接 Source response 的句子；唯一结构化字段来源是 `config/source-contract-v0.82.2.json`。

Harness Installation 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`。`imagegen-comfyui-source-read --port <source-service-port> --discovery-json` 必须返回成功 Source envelope，顶层字段为 `status`、`message`、`results`、`page`、`page_size`、`total_count`，且 `results[0]` 是 OpenAPI 3.1 文档；live body 不要求返回 source pin 字段。Source 目标成功响应同样先通过 v0.82.2 envelope 校验，再从 `results` 读取一条记录。

InstanceSource 的 `results[0]` 必须包含 `id`、`title`、`url`、`credential_type` 和 `authorization`；`authorization` 只保存在 Host 进程内存，持久快照不保存它。TemplateBundle 的 `results[0]` 必须包含 `id`、`title`、`revision_number`、`workflow_sha256`、`workflow_json`、`config_revision`、`dimension_strategy`、`parameters_json`、`bindings_json` 和 `expected_output_node_ids_json`。Harness adapter 按结构化合同映射这些字段，不从源数据库读取或推导字段。

`expected_output_node_ids_json` 必须是非空数组。值为 `null`、空数组、缺失或非法值时返回 `SOURCE_TEMPLATE_UNAVAILABLE`，在 `/prompt` 前停止；不得从 `workflow_json` 推导或补默认输出节点。v0.82.2 CLI 只验证非空、严格 UTF-8 和单个 JSON 值，业务 Schema 由 Harness adapter 验证。

## `comfyui-generate` Skill 合同

`comfyui-generate`是与Prompt Skill、LoRA调整Skill并列的普通Harness Skill。它只负责把当前用户消息、当前消息的不可变上下文快照、可选Execution Route和用户明确引用的先前Skill结果转换为一次Generation Tool调用；它不实现Workflow节点写入、远端状态观察、媒体保存或右列renderer。

本Ticket的单图路径要求当前用户消息包含一项`comfyui-template`的`generation-context.v1`快照和具体画面要求。后续Ticket允许同一消息另外包含LoRA、角色、作品、画师或画风、提示词条目、画师串、生成模型、Saved Media和图片附件。Skill按以下优先级确定正向Prompt：

1. 当前用户消息明确给出的完整Prompt；
2. 当前用户明确指向的同一Session内最近一条Prompt Skill单行输出；
3. 当前用户明确指向的同一Session内最近一条`lora-adjustment` JSON的`prompt_text`。

存在多个候选且当前用户没有明确指向时，Skill必须请求用户选择，不能调用Generation Tool。Skill不得自行调用另一个Skill，也不得把Prompt Skill或LoRA调整Skill作为隐式前置步骤。

Workflow模板安全快照必须包含`template_id`、revision和可见运行参数定义；每个参数定义固定包含`parameter_id`、`kind`、`value_type`、`default_value`、`required`和`visible`。`kind`沿用方案中的`positive_prompt`、`negative_prompt`、`width`、`height`、`resolution_preset`、`aspect_ratio`、`megapixels`、`cfg`、`seed`、`lora_model`、`lora_model_weight`、`lora_clip_weight`、`lora_trigger_word`、`reference_image`或`workflow_input`。可供`comfyui-generate`使用的模板必须恰好声明一个`positive_prompt`参数。

Skill只按模板声明的`parameter_id`构造`parameters`。正向Prompt写入`kind: positive_prompt`对应的`parameter_id`；用户明确给出的尺寸、像素、CFG、seed和其他值只写入匹配`kind`的参数；用户没有提供的可选参数使用模板`default_value`；缺少必填值、出现多个同一单值语义参数或用户值不符合`value_type`时，Skill在中列报告具体`parameter_id`并停止。Skill不得猜测节点ID、input name、widget index或未声明参数。

当前消息包含LoRA上下文时，Skill只接受用户明确提供或明确引用的`{prompt_text, loras}`调整结果。每个`source_lora_id`必须与当前消息的一项不可变LoRA快照一一匹配，顺序必须相同，权重和触发词必须满足PRD 12；否则停止调用。没有LoRA上下文时，`lora_applications`固定为空数组。

Skill对本Ticket的单张图片任务只调用一次`generate_with_comfyui`。Tool Result返回`{run_id}`后，中列显示原型Tool Call行和“定位结果”；右侧第三列按相同`run_id`显示运行卡片。Skill不得把Prompt或LoRA调整JSON渲染为右列结果。

## Generation Tool

本Ticket必须使用PRD 01的`registerProjectTools()`注册`generate_with_comfyui`，不得直接调用`ctx.tools.register()`或创建Generation专用registry。该Tool的description固定为：`Create one durable ComfyUI Generation Run from one approved template, explicit runtime parameters, ordered LoRA applications, and an optional safe instance route; return the accepted run_id without waiting for remote completion.`。Tool description、闭合参数schema、闭合输出schema和adapter必须在同一个`defineTool()`定义中交付；Harness profile卸载时由统一registry注销该Tool。

`generate_with_comfyui` 输入固定包含 `title`、可选安全 `instance_id`、`template_id`、模板声明的 `parameters` 和 `lora_applications`。`lora_applications`固定为有序数组，每项只包含`source_lora_id`、`strength_model`、适用时的`strength_clip`和`applied_trigger_words`。Host 从 Tool 执行上下文派生 `workspace_id`、`session_id`、数字 `turn` 和 `call_id`，并读取当前用户消息已经记录的不可变Context快照。浏览器、Agent 或 Tool 参数不能声明这些归属字段。

Host必须拒绝Tool参数中的`source_lora_id`没有在当前消息的LoRA快照中恰好出现一次、顺序不一致、触发词不属于快照允许集合、权重不符合模板范围或节点类型与`strength_clip`形状不匹配。Host只从当前消息快照解析LoRA文件名；不得根据名称回搜或使用先前消息中的可变Catalog记录补齐来源。

Tool 在 Run Repository 持久接纳后立即返回 `{ run_id }`。持久worker属于项目Host plugin生命周期，它从Run Repository领取已接纳运行并继续准备、提交、观察和保存媒体；Tool返回后不创建未受Host plugin生命周期所有的Promise、daemon或后台进程。同一 `(workspace_id, session_id, call_id)` 与相同不可变请求快照返回同一 `run_id`；同一调用身份与不同快照返回 `RUN_REQUEST_CONFLICT`。

## 运行与文件顺序

1. Run Repository 在一个事务中创建 `run_id` 与 `created` 记录。
2. Host 读取目标实例连接快照和当前完整模板 bundle。未显式提供 `instance_id` 时使用 Configuration Profile 的 `comfyui.defaultInstanceId`；显式实例不可用时失败，不能切换实例。
3. Host 把非敏感来源快照和不可变 Generation Tool 请求快照保存到当前 Workspace 的运行目录。
4. Actual Workflow Builder 只依据模板 bindings 把提示词、尺寸、CFG、seed 和声明参数写入 UI Workflow 0.4 深拷贝；Workflow Compiler 从该 Actual Workflow 生成 API Workflow。
5. Host 在远端提交前原子保存 source snapshot、request snapshot、`actual-workflow.json` 和 `api-workflow.json`，然后进入 `prepared`。
6. Host 进入 `submitting` 后只向 Source Operation 返回的同一 origin 发送一次 `/prompt`。Fake Jobs API 返回 `prompt_id` 后进入 `remote_pending`。
7. worker 通过 `GET /api/jobs/{prompt_id}` 读取完成输出，按模板输出描述下载图片，使用响应 Content-Type 与文件签名验证，再保存为 Saved Media 并进入 `succeeded`。

## 浏览器投影

- Harness的`skill-invocation`Context行证明当前数字`turn`显式调用了`comfyui-generate`；Host adapter必须通过同一公开Session event序列执行上述前置校验。同一`turn`中名为`generate_with_comfyui`的原生Tool Call/Result证明AgentLoop实际执行了Generation Tool。右列不监听或猜测“Skill完成”文本；右列只在Tool Result的`ToolResultNode.meta`通过合同校验后取得`run_id`并订阅项目Run投影。
- 中列Tool行和右列运行卡都读取`GenerationRunProjectionStore`的同一`GenerationRunSnapshot`。中列必须按原型显示`run_id`以及队列等待、远程运行、保存媒体、提交结果未知、正在取消、已取消、成功和失败状态；右列在同一Store revision下显示详细进度、媒体和Workflow操作。
- 项目Workbench Tool renderer中的“定位结果”选择Tool Call所属数字`turn`，切换到项目results panel并聚焦同一个`run_id`卡片。
- 页面可见且中列存在可见的非终态Generation Tool行，或右列results panel可见且存在非终态运行时，唯一轮询协调器按Remote返回的`refreshAfterMs`重新查询。两处同时可见时不得建立两个计时器或两份状态缓存；页面隐藏且没有可见消费者，或所有已观察运行终态时停止。
- 当前轮次成功卡片只提供 Actual Workflow 下载，不提供原文件链接。原文件入口由 Ticket 10 的媒体卡片交付。
- 下载处理器只能读取该运行已经保存的 `actual-workflow.json`；不能重新读取当前模板或重新构建。文件名为 `comfyui-run-<run_id>-workflow.json`。
- Client、Tool Result、日志和下载响应不得提供 API Workflow、实例 URL、Authorization、数据库路径或本机文件路径。

## 错误行为

- Source contract 不兼容、实例不存在/禁用/无凭据、模板不存在或 bundle 不完整时在 `/prompt` 前失败，并保存具体结构化错误。
- Actual Workflow 不是 UI Workflow 0.4、绑定目标缺失、参数不允许、节点定义缺失或没有声明输出时停止提交。
- `/prompt` 明确拒绝进入 `failed`。响应是否成功无法确认的分支由 Ticket 08 完整交付；本 Ticket 的测试仍必须证明不会自动再次调用 `/prompt`。
- 图片 Content-Type 不允许或文件签名不匹配时不保存 Saved Media，并返回媒体错误。

## 产品验收

1. Source contract test 调用两个真实只读 CLI operation，并确认查询前后数据源数据库与媒体目录没有变化。
2. Harness Tool registry只通过PRD 01的`registerProjectTools()`包含`generate_with_comfyui`，其description和闭合输入/输出schema与本PRD完全一致；Agent Tool、Skill Tool和浏览器remote都不包含两个Source Operation。Host plugin卸载后该Tool不存在，重复名称或统一registry中任一Tool注册失败时Host启动失败并反向注销本次已注册Tool。
3. 浏览器完成一次真实Harness消息与Tool Call；Session同一数字`turn`包含名为`comfyui-generate`的`skill-invocation`Context、`generate_with_comfyui` Tool Call和Tool Result。Tool Result的canonical output只包含`{ run_id }`，`ToolResultNode.meta`符合本PRD固定合同；项目Tool renderer显示相同ID并能定位右列卡片。上一数字turn存在目标Skill Invocation、当前数字turn不存在但调用Tool时，Host必须返回`GENERATION_SKILL_INVOCATION_REQUIRED`，Run Repository、持久映射和Fake Jobs API `/prompt`调用数都不增加。历史窗口只包含Tool Result且`ToolResultNode.call === null`时，Client必须通过`resolveToolResultLink()`核对持久映射后恢复同一链接；伪造`call_id`或`run_id`必须返回`GENERATION_RUN_LINK_INVALID`。注销项目Client plugin后，默认AppFrame和上游Tool UI恢复。
4. Fake Jobs API 只收到一次 `/prompt`；请求中的 API Workflow 等于当前运行保存的 `api-workflow.json`。
5. 下载的 JSON 等于当前运行保存的 `actual-workflow.json`，可以重新导入 ComfyUI 前端，并保留节点、widget、连接和画布信息。
6. 修改数据源当前模板后再次下载，结果仍与原运行保存文件一致。
7. 视觉审核者并排检查 Tool Call 行、定位动作、成功卡片、图片、状态 badge、元数据和下载按钮。
8. Skill黑盒测试证明当前消息只有Prompt Skill输出或LoRA调整结果时不会创建Run；用户显式选择`comfyui-generate`并提供唯一模板与完整Prompt后才调用一次Generation Tool。当前消息包含LoRA时，Tool的`lora_applications`与当前消息快照和被引用的LoRA调整结果逐项一致。
9. Fake Jobs API驱动同一`run_id`依次进入`remote_pending`、`remote_running`、`downloading`和`succeeded`；每次Remote刷新后，中列Tool行和右列卡片必须在同一Client Store revision下显示相同状态。只显示中列时状态继续刷新；中列和右列同时显示时每个`refreshAfterMs`周期只产生一次网络查询。

## 不属于本 Ticket

本 Ticket 只要求图片输出和默认或 Tool 输入提供的安全实例 ID；完整目录 UI、显式 Execution Route 控件、视频/音频、多运行投影和版本发布后的用户环境操作不属于本 Ticket。
