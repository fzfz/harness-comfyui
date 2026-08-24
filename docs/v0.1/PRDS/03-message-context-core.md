# PRD 03：首批真实消息上下文

## 关联 Ticket

Ticket 03 — 为一条消息选择 Workflow 模板与角色上下文并原子发送。

## Harness 核心零改动与公共接口

本 Ticket扩展 Harness原生InputBar上方的项目Workbench输入区。Workbench输入区渲染“已选中上下文”、可移除chip和“插入上下文”按钮；正文、结构化上下文JSON、图片附件与发送控件继续由Harness原生InputBar负责。

Modal使用 `@deepseek-ai/dsh-client-ui-primitives` 的公开 `Modal`。真实Catalog只通过项目生成的 `harness-comfyui/remote`和公开 `ctx.remote.$mount()`读取。Modal内部选择只在确认时通过公开`SessionInput.setDraft()`写入每行一个`{"type":"comfyui-context","data":<CatalogItem>}`记录；确认与移除都保留草稿中的普通正文。

用户使用Harness原生发送按钮或Enter提交草稿；结构化上下文JSON与普通正文通过同一条原生消息发送。插件不注册第二个发送按钮，不替换`conversation.composer.bar`，也不直接调用`SessionFace.prompt()`绕过原生InputBar。

Ticket 03必须在产品代码中定义`generation-context.v1`的唯一运行时schema，并由Context resolver与项目Workbench的用户消息renderer直接复用同一个export。每个Context resolver结果必须按顺序输出换行、`<generation-context.v1>`、一行JSON和`</generation-context.v1>`。JSON字段顺序固定为`contract_id`、`contract_version`、`kind`、`id`、`label`、`source_release_version`、`snapshot`；`contract_id`固定为`generation-context`，`contract_version`固定为`1`。项目Workbench的用户消息renderer只解析正文末尾、标签完整且JSON通过该运行时schema的block；renderer把正文和原型折叠快照分开显示。不完整标签、未知版本或schema不匹配的文本必须按普通用户正文显示。`ui-conversation`继续负责标准conversation projection，项目不得注册第二套Session事件定义。

Skill选择继续使用Ticket 02项目composer渲染的Harness原生input overlay以及`ui-input-trigger`与`ui-skill`交互。项目Message Context控件不得替换或复制输入`/`后的Harness Skill菜单，也不得保存Skill选择状态。Host在执行前按当前Session的cwd与preset scope重新发现并校验Skill。

## 用户任务

浏览器用户用真实底模目录筛选真实 Workflow 模板候选，搜索真实角色候选，选择一个 Workflow 模板和一个角色，然后通过一次发送动作把正文与两个不可变 Message Context 快照写入当前 Harness Session。

## 原型依据与原型限制

- 原型依据是 `index.html` 的“本次消息上下文”条、“添加本次消息上下文”Modal、底模筛选、资源导航、候选列表、候选详情、底部确认区、chip 和已发送消息折叠块。
- `app.js` 中的 `baseModelFilters`、`catalog`、`initialDraftRefs` 和“模拟查询失败”只用于静态原型。正式 Client、Host 和数据源代码不得导入或复制这些数组作为运行数据。
- 底模是 Catalog Filter，不是 Message Context。ComfyUI Instance 不属于本 Ticket 的 Modal 候选。

## 首批真实数据来源

| UI 对象 | 正式产品数据所有者 | Catalog operation | 本 Ticket 的责任 |
|---|---|---|---|
| 底模筛选 | `fzfz/NoobAI-XL-FZ` 的 `generation_base_models` | `/internal/semantic/base-models`，`querySemanticBaseModelsForSkill`，Tool `query_semantic_base_models` | 消费已发布Catalog contract并实现当前仓库Host adapter、Tool注册与Modal投影 |
| Workflow 模板候选 | 同一数据源的模板、当前 revision 和运行参数安全摘要 | `/internal/semantic/comfyui-templates`，`querySemanticComfyuiTemplatesForSkill`，Tool `query_semantic_comfyui_templates` | 消费已发布安全摘要并实现当前仓库Host adapter、Tool注册与Modal投影；不得读取完整Workflow JSON |
| 角色候选 | 同一数据源的 `characters` 语义目录 | `/internal/semantic/characters`，`querySemanticCharactersForSkill`，Tool `query_semantic_characters` | 消费已发布`search`/`resolve`合同并实现当前仓库Host adapter、Tool注册与Modal投影 |

数据源仓库的OpenAPI、只读handler、Catalog discovery、CLI和版本发布不属于本Ticket执行范围。它们已经由数据源仓库发布 v0.82.2；本Ticket只能通过 `production` Configuration Profile 的`source.catalogCliPath`消费该已发布CLI，并按`config/source-contract-v0.82.2.json`校验，不得进入数据源checkout修改文件或伪造第二份来源schema或CLI。

> v0.82.2 已正式采用：本 PRD 中旧的 `contract_id`/`contract_version` wrapper 与 CLI 业务 Schema 校验表述由 `docs/v0.1/source-contract-v0.82.2.md` 和 `config/source-contract-v0.82.2.json` 取代。Harness 读取 v0.82.2 raw-passthrough envelope，source pin 来自 `production` Configuration Profile，不来自 live body。

## Catalog 请求与响应

首批三个 operation 必须使用 OpenAPI 定义的闭合输入。输入固定包含 `mode: "search" | "resolve"`：

- `search`：接受 `query`、`page`、`page_size` 和该资源允许的筛选；Workflow 模板允许 `base_model_id`，角色允许 `work_id`，底模没有 `base_model_id` 筛选。
- `resolve`：接受唯一稳定 `id`，不接受名称回搜；不存在时返回 `CATALOG_REF_NOT_FOUND`。

Catalog CLI 成功 body 采用 v0.82.2 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count` envelope。Harness adapter 将 `results` 映射为内部 `items`，从 `production` Configuration Profile 写入内部 `source_release_version`，从 `config/source-contract-v0.82.2.json` 的 operation manifest 写入 `kind` 与 `result_contract_id`。每个内部 item 至少包含稳定字符串`id`、`title`、可选`subtitle`、可为空的浏览器安全`cover_url`和安全`data`；`cover_url`不得是本机文件路径或凭据。live body 不要求返回 `contract_id`、`contract_version`、`source_release_version` 或 `items`。

## Catalog CLI 与 Harness Tool 落地

本Ticket必须创建`src/host/tools/catalog-tool-manifest.ts`、`src/host/tools/create-catalog-tool.ts`和`src/catalog/structured-cli-generation-catalog.ts`。`catalog-tool-manifest.ts`是当前仓库中Catalog Tool名称、OpenAPI `operationId`、Catalog path、资源`kind`、允许模式和允许筛选参数的唯一结构化来源；TypeScript类型、Tool注册、CLI参数构造和contract test必须导入该同一个manifest，不能从PRD Markdown解析这些值。

首批manifest记录固定为：

| Tool名称 | operationId | Catalog path | 允许筛选 | 安全结果用途 |
|---|---|---|---|---|
| `query_semantic_base_models` | `querySemanticBaseModelsForSkill` | `/internal/semantic/base-models` | 无 | Modal顶部底模筛选；不得生成`ContextRef` |
| `query_semantic_comfyui_templates` | `querySemanticComfyuiTemplatesForSkill` | `/internal/semantic/comfyui-templates` | `base_model_id` | Workflow模板卡片、详情和不可变快照；不得包含完整Workflow或bindings |
| `query_semantic_characters` | `querySemanticCharactersForSkill` | `/internal/semantic/characters` | `work_id` | 角色卡片、详情和不可变快照 |

已发布数据源OpenAPI中的每个Catalog operation必须按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`提供`x-harness-tool-name`、非空`description`、闭合request schema和闭合response schema。当前仓库的`createCatalogTool()`必须核对discovery中的`x-harness-tool-name`、`operationId`、path和schema identity与manifest完全一致，使用Harness公开`defineTool()`生成Tool，并把定义交给PRD 01的`registerProjectTools()`。任一记录不匹配时Host启动返回`SOURCE_CONTRACT_UNSUPPORTED`，三个Catalog Tool均不得部分注册。当前实现不得读取来源OpenAPI的`x-noobai-pi-tool-name`或旧Pi Tool contract。

Catalog Tool参数只能是以下两个闭合对象之一：`search`对象为`{ mode: "search", query?, page?, page_size?, <manifest允许的筛选>? }`；`resolve`对象为`{ mode: "resolve", id }`。一次Tool Call只能查询一个资源目标。Tool参数不得出现批量`queries`、批量`groups`、CLI路径、OpenAPI path、operationId、Workspace ID、Session ID、数字turn、Tool call identity或数据源传输关联字段。`resolve`成功时`items`必须恰好包含一项，并且`page`、`page_size`和`total_count`都等于`1`。

`StructuredCliGenerationCatalog`只能从Host Configuration读取`source.catalogCliPath`。Host启动时先以前台子进程执行`imagegen-semantic-query --discovery-json`，要求 v0.82.2 Catalog 裸 OpenAPI 3.1 shape，再完成 `config/source-contract-v0.82.2.json` manifest 核对。每次Tool调用执行同一已配置 CLI 的 operation 参数；CLI路径、operationId、HTTP path和宿主身份只能来自 manifest或Configuration Profile，不能由 Agent、Skill、浏览器或Tool参数提供。adapter必须把Harness Tool执行的`AbortSignal`传给子进程，取消Tool时终止该子进程。

CLI非零退出、空stdout、stdout含多个JSON值、响应schema不匹配或operation identity不匹配时，Catalog Tool必须返回固定Catalog错误码和可执行的用户说明。Tool Result、日志和浏览器错误不得包含CLI stderr、可执行文件路径、数据库路径、凭据或数据源传输关联值。Catalog查询不允许静默重试、回退到原型数组或改用另一个operation。

## v0.82.2 正式消费合同

本节是本 PRD 中关于源数据响应和 discovery 的最新规范，优先于本文件前面引用旧 `contract_id`/`contract_version` wrapper、直接 `items` 响应或 CLI 业务 Schema 校验的句子；唯一结构化字段来源是 `config/source-contract-v0.82.2.json`。

`production` Configuration Profile 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`。Catalog discovery 必须是顶层字段为 `openapi`、`info`、`x-imagegen-media-origin`、`paths`、`components` 的 OpenAPI 3.1 对象；Source discovery 必须是 `status`、`message`、`results`、`page`、`page_size`、`total_count` 成功 envelope，OpenAPI 位于 `results[0]`。live body 不要求返回 source pin 字段。

Catalog 与 Source 目标成功响应都必须先通过 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count` envelope 校验。Catalog adapter 将 `results` 映射为内部 `items`，从 `production` Configuration Profile 写入内部 `source_release_version`，从 operation manifest 写入内部 `kind` 与 `result_contract_id`；Source adapter 以 `results` 单项记录为输入。CLI 只做非空、严格 UTF-8、单个 JSON 值检查，Harness adapter 负责业务 Schema 校验。

Source TemplateBundle 的 `expected_output_node_ids_json` 必须是非空数组；`null`、空数组、缺失或非法值统一返回 `SOURCE_TEMPLATE_UNAVAILABLE`，不得从 `workflow_json` 推导或补默认值。

## 前端交互

1. 打开 Modal 时保留当前草稿正文和已有 chip；`pendingDialogRefs` 只能是 Modal 内临时选择，取消或关闭不能改变草稿 chip。
2. 中央候选区域在宽屏固定显示 3 列多行卡片。每张卡片固定为 `150 × 160` 像素，封面区固定为 `150 × 88` 像素，每页固定 9 项，形成完整的 3×3 九宫格；封面图片必须在封面区内居中完整缩放，卡片不能因标题或副标题长度改变尺寸。
3. 卡片显示封面、资源标签、标题、副标题和选择标记。`cover_url` 存在且可读取时显示实际封面；值为空时显示包含资源种类缩写和“暂无封面”的统一占位符；封面读取失败时显示“封面不可用”占位符并保留候选选择能力。
4. 候选分页显示“第 N / M 页 · T 项”和上一页/下一页。第一页禁用上一页，末页禁用下一页。搜索词、底模或资源种类改变时页码重置为 1；跨页选择必须保留。本版本只验收桌面3列固定卡片。
5. 切换底模后，Client 重新查询 Workflow 模板；已选择但不符合新筛选的模板必须显示“与当前筛选不一致”并要求用户删除或恢复原筛选，不能静默删除。
6. 切换资源种类、输入搜索词、翻页、选择候选、查看详情、再次点击取消选择、点击“取消”和点击“添加所选上下文”的布局、样式、选中标记、数量和焦点返回必须与原型一致。
7. 每个chip由当前原生草稿中的严格`comfyui-context` JSON记录投影。底模筛选不生成JSON或chip，也不计入Modal底部选择数量。
8. 用户点击chip的移除操作时，插件通过公开`SessionInput.setDraft()`只删除该chip对应的JSON行，并保留草稿中的普通正文和其他上下文JSON。
9. Harness原生发送成功后清空草稿及其chip投影；发送失败时原生InputBar保留正文和上下文JSON。

## 错误行为

- Catalog discovery、CLI、contract identity 或查询不可用时显示 `GENERATION_CATALOG_SOURCE_UNAVAILABLE` 对应的用户文案和“重新查询”；页面保留现有草稿与 chip。
- `contract_id` 或 `contract_version` 不受支持时返回 `SOURCE_CONTRACT_UNSUPPORTED`，并阻止打开候选结果或发送引用。
- 任何引用在发送时不存在、类型不允许或响应不符合 schema 时，整条消息不写入 Session；页面指出失败的资源种类、稳定 ID 和可执行的重新选择动作。
- `base-model` 和 `comfyui-instance` 传给项目Context resolver时返回 `CONTEXT_KIND_NOT_INSERTABLE`。

## 产品验收

1. 使用数据源本地真实只读 CLI 查询至少一个真实底模、Workflow 模板和角色；浏览器候选的稳定 ID、标题和详情与 CLI 响应一致。
2. 数据源数据库或服务记录在查询、选择、解析和发送期间没有写操作。
3. 用户选择一个模板和一个角色并发送；Session只增加一条用户消息和一个 text content，该 content包含正文和两个顺序固定的不可变快照，底模不在快照中。关闭浏览器并重新打开 Session后，项目 user renderer仍从该原生消息显示正文和两个折叠快照。
4. 删除或隐藏已选来源记录后执行发送，消息提交失败且草稿完整保留；恢复来源后同一草稿可以发送成功。
5. 生产源码不包含 prototype catalog 数组；运行 Client 断网或数据源停止时不能继续显示一组伪造候选。
6. 视觉与语义审核者逐项检查 Modal 三栏、3×3 固定卡片、实际封面、无封面占位、第二页、详情、确认区、chip、错误态、折叠快照和文案指代。
7. 用户在同一输入区添加真实图片附件，查看预览，删除后重新添加，并与正文和Message Context通过一次`SessionFace.prompt(parts, 'queue')`发送；发送失败时File、preview、正文和chip全部保留，发送成功或用户删除附件时回收对应object URL。Harness原生Session只增加一条用户消息，Host attachment store保存该消息的图片。
8. 真实Harness Tool registry只通过`registerProjectTools()`出现上述三个Catalog Tool；contract test逐项核对Tool名称、description、闭合输入/输出schema、Catalog operation path、CLI参数顺序、search/resolve结果、取消子进程、discovery漂移整组拒绝和Host卸载注销。测试必须确认Tool调用及Tool Result均不存在旧批量字段、来源Pi字段或数据源传输关联字段。

## 不属于本 Ticket

本 Ticket 不实现生成模型、LoRA、作品、画风、提示词条目、画师串、Saved Media 或 ComfyUI Instance 选择，也不提交 ComfyUI Job。
