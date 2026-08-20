# PRD 05：完整目录、Saved Media 上下文与 Execution Route

## 关联 Ticket

Ticket 05 — 使用完整目录准备一条可生成消息。

## 用户任务

浏览器用户在同一个“添加本次消息上下文”Modal 中搜索并选择所有可插入资源，在生成选项中单独选择一个 ComfyUI Instance Execution Route，然后发送一条只包含真实资源快照且不泄露实例连接信息的消息。

## 原型依据与必须修正的缺口

- 继续使用原型 Modal 的顶部底模筛选、左侧资源种类、中央搜索与 3×2 固定候选卡片、右侧详情、底部候选分页与选择汇总和消息 chip。
- 原型缺少“提示词条目”资源导航。正式产品必须在“画师或画风”之后、“画师串”之前增加“提示词条目”行，使用与其他资源行相同的图标、计数、选中态和键盘焦点样式。
- 原型把“ComfyUI 实例”放进通用上下文选择汇总。正式产品必须从可插入资源导航与上下文计数中移除该行，并在消息输入区的生成选项中提供独立 Execution Route 控件。

## 生产数据来源与负责 Ticket

| UI 对象 | 生产来源 | Catalog operation / 本地服务 | 首次负责 Ticket |
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

正式 runtime 不得从 `prototype/generation-workbench/app.js` 的 `catalog`、`baseModelFilters` 或 `workflow-fixtures.mjs` 取得任何候选、计数、稳定 ID、状态或详情。测试可以使用受控 Catalog/Source fixture，但 release-smoke 和开发验收必须能切换到真实只读 CLI。

## 十个 Catalog Operation 契约

数据源唯一 `schema/api/openapi.yaml` 必须定义十个 `audience: catalog` operation。每个 operation 使用 PRD 03 的 `mode: search | resolve`、分页、稳定 ID、浏览器安全 `cover_url` 和结构化错误规则。十个 operation 共享同一 `contract_id`、`contract_version`、`CatalogPage` envelope 和字段命名，不允许 Client 组件直接读取数据源表字段。

支持 `base_model_id` 的 operation 固定为生成模型、LoRA、画师或画风、画师串和 Workflow 模板。底模选“全部”时请求不包含 `base_model_id`；选择具体底模时只向这五类请求传入该稳定 ID。作品、角色、提示词条目和 Saved Media 不受底模筛选影响。

实例安全投影只包含稳定 ID、安全名称、`enabled`、`validated`、能力和用户可理解的不可用原因。它不得包含 URL、origin、Authorization、header、credential、数据库路径或本机路径。

## Message Context Resource Registry

Registry 必须为 `model`、`lora`、`work`、`character`、`style`、`prompt-term`、`artist-string`、`comfyui-template` 和 `media` 各保存一条结构化定义：Catalog operation 或本地服务、允许筛选、候选 renderer、详情 renderer、chip label、`result_contract_id` 和 `ReferenceCodec` serializer。`base-model` 与 `comfyui-instance` 只能注册为不可插入种类；运行时和类型系统都拒绝把它们转换为 `ContextRef`。

Saved Media `resolve` 必须从当前 Workspace 的 Run Repository 读取稳定 `media_id`、所属 `run_id`、数字 `turn`、媒体种类、已验证 MIME、创建时间和安全描述。Message Context 快照不得包含本机路径或可绕过授权的文件 URL。

## Execution Route 交互

1. Execution Route 控件位于消息输入区的生成选项，不在 Modal 资源种类列中。
2. 控件默认项显示“使用默认实例”；选择后草稿只保存安全 `instance_id` 作为 Generation Tool 选项，不生成 chip、Message Context 或 Session 折叠快照。
3. 候选显示安全名称、状态和能力。不可用实例可以显示但不能被选择，并显示具体原因。
4. 用户不选择实例时，Host 使用 Configuration Profile 的 `comfyui.defaultInstanceId`。用户明确选择的实例在 Tool Call 时不可用则该运行失败；Host 不切换实例。

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
4. 选择 Execution Route 后 Modal 计数、chip、`ReferenceCodec.serialize()` 和 Session 快照都不包含实例；Generation Tool 收到安全 `instance_id`。
5. 浏览器 remote、Agent Tool、Skill Tool、Session log、Run Repository、日志和错误响应中都不存在实例 URL 或 Authorization。
6. 停止数据源服务后，Modal 的来源类显示明确错误，Saved Media 类仍显示当前 Workspace 的真实已保存媒体。
7. 视觉与语义审核者检查新增提示词条目行、移除实例上下文行后的导航顺序、Execution Route 控件、九类候选的固定三列卡片、封面/占位、分页、详情、chip、空态和错误态。

## 不属于本 Ticket

本 Ticket 不新增 Source Operation，不改变 Ticket 04 的 Generation Tool 和单图执行流程，也不实现 Workspace 媒体库或任务取消 Modal。
