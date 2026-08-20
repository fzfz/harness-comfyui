# PRD 04：单张图片生成闭环

## 关联 Ticket

Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow。

## 用户任务

浏览器用户通过 Harness 原生 Skill 入口选择 `comfyui-generate`，发送包含真实 Workflow 模板、角色和图片要求的消息；Agent 调用一次 `generate_with_comfyui`，右列显示同一个 `run_id` 的图片生成结果，用户下载该运行保存的 Actual Workflow。

## 原型依据

- 中列的 `generate_with_comfyui` Tool Call 行和“定位结果”。
- 右列成功图片运行卡片的标题、`run_id`、状态 badge、模板、实例、图片和“下载本次 Workflow JSON（可导入 ComfyUI）”。
- 原型没有定义持久化、Source Operation、Workflow 转换或远端协议；以下条款补足这些生产要求。

## Host-only Source Operation

本 Ticket 必须先在数据源唯一 OpenAPI schema 中落地两个 `audience: source-host` 的只读 operation，再实现 `imagegen-comfyui-source-read` 和当前仓库 `ComfyuiSourceCatalog`：

| Source path | operationId | 输入 | Host-only 输出 |
|---|---|---|---|
| `/internal/comfyui-source/instances/{instance_id}` | `getComfyuiInstanceSourceForHost` | 稳定 `instance_id` | 实例 ID、安全名称、启用/验证状态、能力、URL 与 ComfyUI Instance Authorization |
| `/internal/comfyui-source/templates/{template_id}/bundle` | `getComfyuiTemplateBundleForHost` | 稳定 `template_id` | 模板 ID、revision、UI Workflow 0.4 JSON、`workflow_sha256`、运行时配置 revision、参数定义、绑定定义、输出描述 |

Source discovery 固定为 `/internal/comfyui-source`。它与 Catalog discovery 返回相同 `contract_id` 和 `contract_version`。两个 Source Operation 不声明 Harness Tool 名，不生成 Client remote contribution，也不出现在 Agent Tool、Skill Tool 或 `ctx.remote`。

## Generation Tool

`generate_with_comfyui` 输入固定包含 `title`、可选安全 `instance_id`、`template_id` 和模板声明的 `parameters`。Host 从 Tool 执行上下文派生 `workspace_id`、`session_id`、数字 `turn` 和 `call_id`。浏览器、Agent 或 Tool 参数不能声明这些归属字段。

Tool 在 Run Repository 持久接纳后立即返回 `{ run_id }`。同一 `(workspace_id, session_id, call_id)` 与相同不可变请求快照返回同一 `run_id`；同一调用身份与不同快照返回 `RUN_REQUEST_CONFLICT`。

## 运行与文件顺序

1. Run Repository 在一个事务中创建 `run_id` 与 `created` 记录。
2. Host 读取目标实例连接快照和当前完整模板 bundle。未显式提供 `instance_id` 时使用 Configuration Profile 的 `comfyui.defaultInstanceId`；显式实例不可用时失败，不能切换实例。
3. Host 把非敏感来源快照和不可变 Generation Tool 请求快照保存到当前 Workspace 的运行目录。
4. Actual Workflow Builder 只依据模板 bindings 把提示词、尺寸、CFG、seed 和声明参数写入 UI Workflow 0.4 深拷贝；Workflow Compiler 从该 Actual Workflow 生成 API Workflow。
5. Host 在远端提交前原子保存 source snapshot、request snapshot、`actual-workflow.json` 和 `api-workflow.json`，然后进入 `prepared`。
6. Host 进入 `submitting` 后只向 Source Operation 返回的同一 origin 发送一次 `/prompt`。Fake Jobs API 返回 `prompt_id` 后进入 `remote_pending`。
7. worker 通过 `GET /api/jobs/{prompt_id}` 读取完成输出，按模板输出描述下载图片，使用响应 Content-Type 与文件签名验证，再保存为 Saved Media 并进入 `succeeded`。

## 浏览器投影

- Tool Result 和 Agent 回复都引用同一个 `run_id`，但不复制可变运行状态。
- “定位结果”选择 Tool Call 所属数字 `turn`，打开右列并聚焦同一个 `run_id` 卡片。
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
2. Harness Tool registry 包含 `generate_with_comfyui`，但 Agent Tool、Skill Tool 和浏览器 remote 都不包含两个 Source Operation。
3. 浏览器完成一次真实 Harness 消息与 Tool Call；Tool Result 只包含 `{ run_id }`，右列成功卡片使用同一个 ID。
4. Fake Jobs API 只收到一次 `/prompt`；请求中的 API Workflow 等于当前运行保存的 `api-workflow.json`。
5. 下载的 JSON 等于当前运行保存的 `actual-workflow.json`，可以重新导入 ComfyUI 前端，并保留节点、widget、连接和画布信息。
6. 修改数据源当前模板后再次下载，结果仍与原运行保存文件一致。
7. 视觉审核者并排检查 Tool Call 行、定位动作、成功卡片、图片、状态 badge、元数据和下载按钮。

## 不属于本 Ticket

本 Ticket 只要求图片输出和默认或 Tool 输入提供的安全实例 ID；完整目录 UI、显式 Execution Route 控件、视频/音频、多运行投影和生产 ComfyUI 写操作不属于本 Ticket。
