# PRD 05：完整目录、Saved Media 上下文与 Execution Route

## 关联 Ticket

Ticket 05 — 使用完整目录准备一条可生成消息。

## Harness 核心零改动与公共接口

本 Ticket复用PRD 03的项目Workbench输入区、Harness `Modal`、固定`generation-context.v1`格式、项目Context resolver、用户消息renderer和项目Typert Remote。九类可插入Catalog记录形成项目临时`ContextRef`，ComfyUI Instance只通过输入区的Execution Route控件选择，不能形成`ContextRef`、chip或`generation-context.v1`快照。

项目输入区必须把正文、已解析ContextRef、可选`generation-route.v1`控制block和浏览器图片编码为公开`PromptContentPart[]`，并只调用一次当前Session的`SessionFace.prompt(parts, 'queue')`。调用失败时保留正文、chip、Execution Route、File与preview；调用成功后只清除本次发送快照并回收对应object URL。Harness原生attachment store、`user/message`、AgentLoop、Tool pipeline和Session replay继续是运行时权威。项目不得从原型数组产生正式候选，不得把实例连接数据写入浏览器、Context block或Session日志。

## 用户任务

浏览器用户在同一个“添加本次消息上下文”Modal 中搜索并选择所有可插入资源，在生成选项中单独选择一个 ComfyUI Instance Execution Route，然后发送一条只包含真实资源快照且不泄露实例连接信息的消息。

## 原型依据与必须修正的缺口

- 继续使用原型 Modal 的顶部底模筛选、左侧资源种类、中央搜索与 3×2 固定候选卡片、右侧详情、底部候选分页与选择汇总和消息 chip。
- 原型缺少“提示词条目”资源导航。正式产品必须在“画师或画风”之后、“画师串”之前增加“提示词条目”行，使用与其他资源行相同的图标、计数、选中态和键盘焦点样式。
- 原型把“ComfyUI 实例”放进通用上下文选择汇总。正式产品必须从可插入资源导航与上下文计数中移除该行，并在消息输入区的生成选项中提供独立 Execution Route 控件。

## 正式产品数据来源与负责 Ticket

| UI 对象 | 正式产品来源 | Catalog operation / 本地服务 | 首次负责 Ticket |
|---|---|---|---|
| 底模筛选 | 数据源 `generation_base_models` | `querySemanticBaseModelsForSkill` / `query_semantic_base_models` | Ticket 03 |
| 生成模型 | 数据源 `generation_models` | `querySemanticGenerationModelsForSkill` / `query_semantic_generation_models` | Ticket 05 |
| LoRA | 数据源 `generation_loras` | `querySemanticLorasForSkill` / `query_semantic_loras` | Ticket 05 |
| 作品 | 数据源 `works` | 现有 `querySemanticWorksForSkill` / `query_semantic_works` | Ticket 05 接入 Modal |
| 角色 | 数据源 `characters` | 现有 `querySemanticCharactersForSkill` / `query_semantic_characters` | Ticket 03 |
| 画师或画风 | 数据源 `styles` | 现有 `querySemanticStylesForSkill` / `query_semantic_styles` | Ticket 05 接入 Modal |
| 提示词条目 | 数据源 prompt-term semantic index | 现有 `querySemanticPromptTermsForSkill` / `query_semantic_prompt_terms` | Ticket 05 新增原型缺失 UI |
| 画师串 | 数据源 `artist_prompt_strings` | `querySemanticArtistPromptStringsForSkill` / `query_semantic_artist_prompt_strings` | Ticket 05 |
| Workflow 模板 | 数据源模板安全摘要 | `querySemanticComfyuiTemplatesForSkill` / `query_semantic_comfyui_templates` | Ticket 03 |
| 已保存媒体 | 当前仓库 Run Repository 与 MediaStore | `GenerationRuns.listMedia()` 和 `getMediaDescriptor()` 的当前 Workspace 投影 | Ticket 05 |
| ComfyUI Instance Execution Route | 数据源实例安全投影 | `querySemanticComfyuiInstancesForSkill` / `query_semantic_comfyui_instances` | Ticket 05 |
| 实例 URL 与 Authorization | 数据源 Host-only source surface | `getComfyuiInstanceSourceForHost` | Ticket 04；Ticket 05 只复用 |
| 完整 Workflow Template bundle | 数据源 Host-only source surface | `getComfyuiTemplateBundleForHost` | Ticket 04；Ticket 05 只复用 |

正式 runtime 不得从 `prototype/generation-workbench/app.js` 的 `catalog`、`baseModelFilters` 或 `workflow-fixtures.mjs` 取得任何候选、计数、稳定 ID、状态或详情。测试可以使用受控 Catalog/Source fixture，但源码生产验收必须能切换到真实只读 CLI。

## v0.82.2 正式 Catalog 消费合同

本节是本 PRD 中 Catalog discovery、Catalog response 和十个 operation 的最新规范，优先于本文件前面要求旧 `contract_id`/`contract_version` wrapper 或直接 `items` response 的句子；唯一结构化字段来源是 `config/source-contract-v0.82.2.json`。

`production` Configuration Profile 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`。Catalog CLI discovery 是顶层字段为 `openapi`、`info`、`x-imagegen-media-origin`、`paths`、`components` 的 OpenAPI 3.1 对象，不要求返回 source pin 字段。每个 Catalog operation 的成功 body 是 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count` envelope；Catalog adapter 将 `results` 映射为内部 `items`，并从 Configuration Profile 与 operation manifest补充内部 `source_release_version`、`kind` 和 `result_contract_id`。

v0.82.2 CLI 只验证非空、严格 UTF-8 和单个 JSON 值并原始透传；Harness adapter 负责业务 Schema、operation 字段和 `resolve` 单项约束。CLI 退出码为0但 envelope或业务字段不符合结构化合同时返回 `SOURCE_PROTOCOL_ERROR`；discovery shape、operation metadata或Configuration Profile中的source pin不支持时返回 `SOURCE_CONTRACT_UNSUPPORTED`。

## 十个 Catalog Operation 契约

十个`audience: catalog` operation必须先按`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`在数据源仓库自己的计划、测试和版本发布流程中完成。本Ticket不得修改数据源checkout；本Ticket只消费`production` Configuration Profile中`source.catalogCliPath`指向的已发布CLI。未取得包含以下十项合同的受支持数据源版本时，本Ticket状态为阻塞，Issue执行者不得在当前仓库复制数据源schema、handler或CLI。

每个operation使用PRD 03的`mode: search | resolve`、分页、稳定ID、浏览器安全`cover_url`和结构化错误规则。十个operation共享 v0.82.2 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count` envelope；`contractId`与`sourceReleaseVersion`只来自 `production` Configuration Profile，不要求 live body 返回，不允许Client组件直接读取数据源表字段。

### 十个 Tool 的固定manifest

Ticket 05必须扩展PRD 03的`src/host/tools/catalog-tool-manifest.ts`，使其恰好包含以下十项。表中的description必须进入数据源OpenAPI `description`并由当前仓库`defineTool()`原样使用；当前仓库不得另写第二份Tool文案。

| Tool名称 | operationId / Catalog path | search允许筛选 | 固定description | `resolve`安全数据 |
|---|---|---|---|---|
| `query_semantic_base_models` | `querySemanticBaseModelsForSkill` / `/internal/semantic/base-models` | 无 | `Search or resolve safe semantic base-model records for generation catalog filtering.` | 稳定ID、标题、别名和安全说明 |
| `query_semantic_generation_models` | `querySemanticGenerationModelsForSkill` / `/internal/semantic/generation-models` | `base_model_id` | `Search or resolve safe generation-model records compatible with an optional base model.` | 稳定ID、底模ID、标题和安全模型说明；无本机路径 |
| `query_semantic_loras` | `querySemanticLorasForSkill` / `/internal/semantic/loras` | `base_model_id` | `Search or resolve LoRA catalog records with usage, trigger words, and safe default weight guidance.` | `source_lora_id`、安全`file_name`、description、usage、trigger_words和默认weight |
| `query_semantic_works` | `querySemanticWorksForSkill` / `/internal/semantic/works` | 无 | `Search or resolve semantic work records with aliases, category, and known character names.` | 稳定ID、规范名、别名、分类和角色名称 |
| `query_semantic_characters` | `querySemanticCharactersForSkill` / `/internal/semantic/characters` | `work_id` | `Search or resolve semantic character records, optionally restricted to one work.` | 稳定ID、作品ID、规范名、别名和安全prompt语义 |
| `query_semantic_styles` | `querySemanticStylesForSkill` / `/internal/semantic/styles` | `base_model_id` | `Search or resolve artist or style records with safe descriptions and prompt semantics.` | 稳定ID、画师或画风说明与安全prompt语义 |
| `query_semantic_prompt_terms` | `querySemanticPromptTermsForSkill` / `/internal/semantic/prompt-terms` | 无 | `Search or resolve canonical prompt-term records and their aliases.` | 稳定ID、规范tag、别名和安全说明 |
| `query_semantic_artist_prompt_strings` | `querySemanticArtistPromptStringsForSkill` / `/internal/semantic/artist-prompt-strings` | `base_model_id` | `Search or resolve curated artist prompt strings compatible with an optional base model.` | 稳定ID、底模ID、标题和安全prompt string |
| `query_semantic_comfyui_instances` | `querySemanticComfyuiInstancesForSkill` / `/internal/semantic/comfyui-instances` | 无 | `Search or resolve safe ComfyUI instance routes without exposing connection details or credentials.` | 稳定ID、安全名称、`enabled`和`validated` |
| `query_semantic_comfyui_templates` | `querySemanticComfyuiTemplatesForSkill` / `/internal/semantic/comfyui-templates` | `base_model_id` | `Search or resolve safe ComfyUI template summaries and visible runtime parameter definitions.` | template_id、revision、底模ID和可见参数定义；无Workflow或bindings |

Ticket 05复用PRD 03的`createCatalogTool()`、`StructuredCliGenerationCatalog`和PRD 01的`registerProjectTools()`，不得创建第二个Catalog adapter或第二个Tool registry。Host启动时必须先核对已发布discovery的十项`x-harness-tool-name`、description、operationId、path、request schema和response schema与manifest完全一致，再一次性构造并注册十个Tool；任一项缺失或漂移时返回`SOURCE_CONTRACT_UNSUPPORTED`并且一个Catalog Tool都不注册。

每个Tool只接受一个闭合`search`对象或一个闭合`resolve`对象。Prompt Skill需要多个作品、角色、画风或提示词条目时必须发出多次独立Tool Call，不得恢复来源系统旧`queries[]`或`groups[]`批量合同。LoRA Skill每个稳定`source_lora_id`发出一次`{ mode: "resolve", id }`调用；不得调用旧`query_generation_loras`，不得依赖Host隐式注入底模。

支持 `base_model_id` 的 operation 固定为生成模型、LoRA、画师或画风、画师串和 Workflow 模板。底模选“全部”时请求不包含 `base_model_id`；选择具体底模时只向这五类请求传入该稳定 ID。作品、角色、提示词条目和 Saved Media 不受底模筛选影响。

实例安全投影只包含稳定ID、安全名称、`enabled`和`validated`。Catalog CLI按查询条件返回源数据库记录，不替调用方排除禁用或未验证实例，也不决定Execution Route。该投影不得包含URL、origin、Authorization、header、credential、数据库路径、本机路径或没有权威来源的能力字段。

LoRA的`resolve`响应和对应`generation-context.v1.snapshot`必须固定包含`source_lora_id`、`file_name`、`description`、`usage`、`trigger_words`和默认`weight`。Workflow模板的`resolve`响应和对应快照必须固定包含`template_id`、revision、`base_lora_node_type`、MODEL/CLIP闭区间，以及PRD 04定义的可见`RuntimeParameterDefinition[]`。浏览器安全模板快照不得包含Workflow节点、binding目标、实例连接或凭据；Host-only bundle继续拥有完整Workflow与bindings。

## Message Context Resource Registry

Registry 必须为 `model`、`lora`、`work`、`character`、`style`、`prompt-term`、`artist-string`、`comfyui-template` 和 `media` 各保存一条结构化定义：Catalog operation或本地服务、允许筛选、候选renderer、详情renderer、chip label、`result_contract_id`和Context resolver。`base-model`与`comfyui-instance`只能注册为不可插入种类；运行时和类型系统都拒绝把它们转换为`ContextRef`。

Modal左侧资源行的固定顺序、首次负责Ticket和实现步骤如下：

| 顺序 | 左侧显示名称 | Registry kind | 首次负责Ticket | 查询、选择与发送实现 |
|---|---|---|---|---|
| 1 | 生成模型 | `model` | Ticket 05 | `query_semantic_generation_models` search显示卡片；confirm保存`ContextRef`；发送时resolve生成模型安全快照 |
| 2 | LoRA | `lora` | Ticket 05 | `query_semantic_loras` search显示卡片；confirm保存`ContextRef`；发送时resolve生成含文件名、usage、触发词和默认权重的安全快照 |
| 3 | 作品 | `work` | Ticket 05 | `query_semantic_works` search显示卡片；confirm保存`ContextRef`；发送时resolve生成作品身份快照 |
| 4 | 角色 | `character` | Ticket 03 | `query_semantic_characters` search显示卡片；confirm保存`ContextRef`；发送时resolve生成角色与作品快照 |
| 5 | 画师或画风 | `style` | Ticket 05 | `query_semantic_styles` search显示卡片；confirm保存`ContextRef`；发送时resolve生成画师或画风语义快照 |
| 6 | 提示词条目 | `prompt-term` | Ticket 05 | `query_semantic_prompt_terms` search显示卡片；confirm保存`ContextRef`；发送时resolve生成规范tag与别名快照 |
| 7 | 画师串 | `artist-string` | Ticket 05 | `query_semantic_artist_prompt_strings` search显示卡片；confirm保存`ContextRef`；发送时resolve生成安全prompt string快照 |
| 8 | Workflow模板 | `comfyui-template` | Ticket 03 | `query_semantic_comfyui_templates` search显示卡片；confirm保存`ContextRef`；发送时resolve生成revision、LoRA节点类型、权重范围和可见运行参数快照 |
| 9 | 已保存媒体 | `media` | Ticket 05 | `GenerationRuns.listMedia()`显示当前Workspace卡片；confirm保存`ContextRef`；发送时`getMediaDescriptor()`生成已验证媒体快照 |

Ticket 03先创建同一Registry和`character`、`comfyui-template`两条可插入定义，同时实现顶部底模筛选；Ticket 05只能扩展这一个Registry，补充其余七条定义，不能创建第二个Modal目录或第二套Context resolver。每行统一执行：打开或切换资源行→使用该行保存的search text、page和当前允许筛选查询真实来源→渲染每页6张固定卡片→把用户选择写入`pendingDialogRefs`→确认后按原型顺序转换成草稿`ContextRef[]`和chip→发送时逐项resolve最新真实记录→全部成功后一次`SessionFace.prompt(parts, 'queue')`提交不可变快照。任一resolve失败时不提交消息并保留全部草稿。

顶部底模筛选不是左侧资源行，不生成`ContextRef`或chip；它只向生成模型、LoRA、画师或画风、画师串和Workflow模板五类search请求附加`base_model_id`。ComfyUI实例不是左侧资源行，只在输入区Execution Route控件中使用`query_semantic_comfyui_instances`安全投影；它不计入Modal数量、chip或`generation-context.v1`。

Saved Media `resolve` 必须从当前 Workspace 的 Run Repository 读取稳定 `media_id`、所属 `run_id`、数字 `turn`、媒体种类、已验证 MIME、创建时间和安全描述。Message Context 快照不得包含本机路径或可绕过授权的文件 URL。

## Execution Route 交互

1. Execution Route 控件位于消息输入区的生成选项，不在 Modal 资源种类列中。
2. 控件默认项显示“使用默认实例”；选择后草稿只保存安全 `instance_id`，不生成 chip、Message Context 或 `generation-context.v1`折叠快照。
3. 候选显示安全名称、enabled/validated状态和固定不可用原因。不可用实例可以显示但不能被选择；`disabled`显示“实例已禁用”，`not_validated`显示“实例尚未通过连接验证”。
4. 用户不选择实例时，Host 使用 Configuration Profile 的 `comfyui.defaultInstanceId`。用户明确选择的实例在 Tool Call 时不可用则该运行失败；Host 不切换实例。

Ticket 05必须在产品代码中定义`generation-route.v1`的唯一运行时schema，并由Workbench发送逻辑、用户消息renderer和`comfyui-generate` Skill黑盒测试共同使用。用户显式选择实例时，发送逻辑在全部`generation-context.v1` block之后追加：换行、`<generation-route.v1>`、一行JSON、`</generation-route.v1>`。JSON字段顺序固定为`contract_id`、`contract_version`、`instance_id`；`contract_id`固定为`generation-route`，`contract_version`固定为`1`。选择“使用默认实例”时不写该block。

`generation-route.v1`是当前用户消息中的生成控制信息，不是Message Context。用户消息renderer必须从正文中分离该完整block，并在已发送消息中显示独立“执行路线：<安全实例名称>”行；该行不进入“已记录N项上下文”的计数。标签不完整、版本未知、schema不匹配或实例ID无法按当前Catalog安全投影显示时，发送前失败并保留草稿；renderer不得把无效block解释为Execution Route。`comfyui-generate`只把该block的安全`instance_id`传给`generate_with_comfyui`；Host通过Source Operation解析连接。

## 状态与错误

- 每类候选支持 loading、成功、空集合、无搜索结果、非法筛选、稳定 ID 不存在、数据源不可用和 contract 不兼容状态。
- 切换资源种类时每类保留自己的搜索词和分页位置，关闭 Modal 后不保留未确认选择。
- 某一类查询失败不能删除其他种类已经确认的 chip；发送时任一已选引用解析失败必须阻止整条消息。
- 数据源不可用时，Saved Media 候选仍可从当前仓库读取；新的数据源资源和新的 Generation Run 必须明确失败，不能用 fixture 补齐。
- 九类可插入资源全部复用 PRD 03 的 `150 × 160` 固定卡片、`150 × 88` 封面区、每页 6 项和 3 列多行布局。Saved Media 使用当前仓库的安全预览 URL；其他资源使用 Catalog `cover_url`。没有封面时显示统一占位符，不能用任意示例图片填充。

## 产品验收

1. 对十个 Catalog operation 分别执行成功、空集合、`resolve` 不存在、非法筛选、contract 不兼容和数据源不可用测试；查询前后数据源没有写入。
2. 浏览器逐项打开九个可插入资源种类，候选与真实 Catalog/Run Repository 响应一致；每类至少验收一张真实封面卡片或确认来源确实没有封面后显示统一占位；“提示词条目”行可见且能完成选择、详情、chip、发送和快照。
3. 选择底模后只有五类候选请求携带 `base_model_id`；选择“全部”后这些请求不携带该筛选。
4. 选择 Execution Route 后 Modal计数、chip和`generation-context.v1`都不包含实例；原生用户消息保存一个独立`generation-route.v1` block，重放时显示独立执行路线行，Generation Tool收到相同安全`instance_id`。选择默认实例时用户消息没有route block且Tool省略`instance_id`。
5. 浏览器 remote、Agent Tool、Skill Tool、Session log、Run Repository、日志和错误响应中都不存在实例 URL 或 Authorization。
6. 停止数据源服务后，Modal 的来源类显示明确错误，Saved Media 类仍显示当前 Workspace 的真实已保存媒体。
7. 视觉与语义审核者检查新增提示词条目行、移除实例上下文行后的导航顺序、Execution Route 控件、九类候选的固定三列卡片、封面/占位、分页、详情、chip、空态和错误态。
8. 用户在选择Execution Route和九类Message Context的同一输入区添加真实图片附件；项目显示preview，并通过一次`SessionFace.prompt(parts, 'queue')`发送正文、上下文、独立route block和图片。发送失败时保留Execution Route、File、preview、正文和chip；发送成功或删除附件时回收对应object URL；Harness Host attachment store保存已发送图片。
9. LoRA与Workflow模板的真实`resolve`快照包含PRD 12需要的全部安全字段；`lora-adjustment`不需要读取来源路径、数据库或Host-only template bundle即可完成`LoraLoader`与`LoraLoaderModelOnly`结果。
10. 真实Harness Tool registry通过唯一`registerProjectTools()`恰好注册上述十个Catalog Tool；逐Tool测试核对名称、description、闭合schema、operation/path、允许筛选、CLI参数顺序、search/resolve输出和Host卸载注销。discovery缺少任一Tool、description不同、schema开放或operation/path漂移时，Host启动失败且registry中不存在部分Catalog Tool。

## 不属于本 Ticket

本 Ticket 不新增 Source Operation，不改变 Ticket 04 的 Generation Tool 和单图执行流程，也不实现 Workspace 媒体库或任务取消 Modal。
