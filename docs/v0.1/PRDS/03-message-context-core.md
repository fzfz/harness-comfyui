# PRD 03：首批真实消息上下文

## 关联 Ticket

Ticket 03 — 为一条消息选择 Workflow 模板与角色上下文并原子发送。

## 用户任务

浏览器用户用真实底模目录筛选真实 Workflow 模板候选，搜索真实角色候选，选择一个 Workflow 模板和一个角色，然后通过一次发送动作把正文与两个不可变 Message Context 快照写入当前 Harness Session。

## 原型依据与原型限制

- 原型依据是 `index.html` 的“本次消息上下文”条、“添加本次消息上下文”Modal、底模筛选、资源导航、候选列表、候选详情、底部确认区、chip 和已发送消息折叠块。
- `app.js` 中的 `baseModelFilters`、`catalog`、`initialDraftRefs` 和“模拟查询失败”只用于静态原型。正式 Client、Host 和数据源代码不得导入或复制这些数组作为运行数据。
- 底模是 Catalog Filter，不是 Message Context。ComfyUI Instance 不属于本 Ticket 的 Modal 候选。

## 首批真实数据来源

| UI 对象 | 生产所有者 | Catalog operation | 本 Ticket 的责任 |
|---|---|---|---|
| 底模筛选 | `fzfz/NoobAI-XL-FZ` 的 `generation_base_models` | `/internal/semantic/base-models`，`querySemanticBaseModelsForSkill`，Tool `query_semantic_base_models` | 在数据源唯一 OpenAPI、只读 handler、Catalog discovery/CLI 和 Host adapter 中落地 |
| Workflow 模板候选 | 同一数据源的模板、当前 revision 和运行参数安全摘要 | `/internal/semantic/comfyui-templates`，`querySemanticComfyuiTemplatesForSkill`，Tool `query_semantic_comfyui_templates` | 在数据源唯一 OpenAPI、只读 handler、Catalog discovery/CLI 和 Host adapter 中落地；不得返回完整 Workflow JSON |
| 角色候选 | 同一数据源的 `characters` 语义目录 | `/internal/semantic/characters`，现有 `querySemanticCharactersForSkill`，Tool `query_semantic_characters` | 保留现有语义并增加 `search`/`resolve` 模式所需的稳定 ID 精确解析 |

数据源实现以 committed tree `6bc3fc6a027eecf45ccf86dd681e30621c4bc591` 为修改基线。该 revision 已经存在角色语义 operation 和生成资源 repository；本 Ticket 增加的 Catalog 契约必须进入该数据源的唯一 `schema/api/openapi.yaml`，不能在当前仓库伪造第二份来源 schema。

## Catalog 请求与响应

首批三个 operation 必须使用 OpenAPI 定义的闭合输入。输入固定包含 `mode: "search" | "resolve"`：

- `search`：接受 `query`、`page`、`page_size` 和该资源允许的筛选；Workflow 模板允许 `base_model_id`，角色允许 `work_id`，底模没有 `base_model_id` 筛选。
- `resolve`：接受唯一稳定 `id`，不接受名称回搜；不存在时返回 `CATALOG_REF_NOT_FOUND`。

成功响应固定包含 `contract_id`、`contract_version`、`kind`、`items`、`page`、`page_size` 和 `total_count`。每个 item 至少包含稳定字符串 `id`、`title`、可选 `subtitle`、可为空的浏览器安全 `cover_url`、安全 `data` 和对应 `result_contract_id`。`cover_url` 不得是本机文件路径，也不得包含凭据；Host 必须把数据源安全封面投影转换为浏览器可读取的同源 URL。Workflow 模板 item 可以返回 revision、底模 ID、输出种类与运行参数摘要，但不能返回完整 Workflow、节点连接、实例 URL或凭据。

## 前端交互

1. 打开 Modal 时保留当前草稿正文和已有 chip；`pendingDialogRefs` 只能是 Modal 内临时选择，取消或关闭不能改变草稿 chip。
2. 中央候选区域在宽屏固定显示 3 列多行卡片。每张卡片固定为 `150 × 160` 像素，封面区固定为 `150 × 88` 像素，每页固定 6 项，形成完整的 3×2 网格；卡片不能因标题或副标题长度改变尺寸。
3. 卡片显示封面、资源标签、标题、副标题和选择标记。`cover_url` 存在且可读取时显示实际封面；值为空时显示包含资源种类缩写和“暂无封面”的统一占位符；封面读取失败时显示“封面不可用”占位符并保留候选选择能力。
4. 候选分页显示“第 N / M 页 · T 项”和上一页/下一页。第一页禁用上一页，末页禁用下一页。搜索词、底模或资源种类改变时页码重置为 1；跨页选择必须保留。窄屏不缩小卡片，候选区保留 3 个固定列并允许水平滚动。
5. 切换底模后，Client 重新查询 Workflow 模板；已选择但不符合新筛选的模板必须显示“与当前筛选不一致”并要求用户删除或恢复原筛选，不能静默删除。
6. 切换资源种类、输入搜索词、翻页、选择候选、查看详情、再次点击取消选择、点击“取消”和点击“添加所选上下文”的布局、样式、选中标记、数量和焦点返回必须与原型一致。
7. chip 只保存 `{ kind, id, label }`。底模筛选不生成 chip，也不计入 Modal 底部选择数量。
8. 发送时 `ReferenceCodec.serialize()` 按 chip 顺序以 `resolve` 模式读取每个稳定 ID，生成 `generation-context.v1` 不可变快照，然后由 Harness 原生一次消息提交同时写入正文和全部快照。
9. 发送成功后清空正文与 chip；已发送消息折叠块按选择顺序显示资源种类和标题。发送失败时正文、chip 和选择顺序全部保留。

## 错误行为

- Catalog discovery、CLI、contract identity 或查询不可用时显示 `GENERATION_CATALOG_SOURCE_UNAVAILABLE` 对应的用户文案和“重新查询”；页面保留现有草稿与 chip。
- `contract_id` 或 `contract_version` 不受支持时返回 `SOURCE_CONTRACT_UNSUPPORTED`，并阻止打开候选结果或发送引用。
- 任何引用在发送时不存在、类型不允许或响应不符合 schema 时，整条消息不写入 Session；页面指出失败的资源种类、稳定 ID 和可执行的重新选择动作。
- `base-model` 和 `comfyui-instance` 传给 `ReferenceCodec.serialize()` 时返回 `CONTEXT_KIND_NOT_INSERTABLE`。

## 产品验收

1. 使用数据源本地真实只读 CLI 查询至少一个真实底模、Workflow 模板和角色；浏览器候选的稳定 ID、标题和详情与 CLI 响应一致。
2. 数据源数据库或服务记录在查询、选择、解析和发送期间没有写操作。
3. 用户选择一个模板和一个角色并发送；Session 只增加一条用户消息，该消息同时包含正文和两个不可变快照，底模不在快照中。
4. 删除或隐藏已选来源记录后执行发送，消息提交失败且草稿完整保留；恢复来源后同一草稿可以发送成功。
5. production bundle 不包含 prototype catalog 数组；运行 Client 断网或数据源停止时不能继续显示一组伪造候选。
6. 视觉与语义审核者逐项检查 Modal 三栏、3×2 固定卡片、实际封面、无封面占位、第二页、详情、确认区、chip、错误态、折叠快照和文案指代。

## 不属于本 Ticket

本 Ticket 不实现生成模型、LoRA、作品、画风、提示词条目、画师串、Saved Media 或 ComfyUI Instance 选择，也不提交 ComfyUI Job。
