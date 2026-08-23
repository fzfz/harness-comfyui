# PRD 09：Workspace 任务中心与单 Job Cancellation

## 关联 Ticket

Ticket 09 — 在 Workspace 任务中心筛选并取消一项运行。

## Harness 核心零改动与公共接口

Ticket 02注册到公开`sidebar`的项目occupant已经在左列搜索框之后、Session列表之前预留项目入口区域。本Ticket在该项目组件中直接渲染“所有 ComfyUI 异步任务”入口，使用`@deepseek-ai/dsh-client-ui-primitives`的`Modal`，并调用项目Typert Remote的task list/cancel。项目取消服务调用ComfyUI `POST /api/jobs/{prompt_id}/cancel`并更新Run Repository；`ctx.jobs.kill`只会停止进程内等待，不能代替远端Job取消。

本Ticket不得注册第二个root、重复声明Ticket 02项目root拥有的child slot或通过DOM修改项目桌面Shell。真实composition必须证明Ticket 02的项目`sidebar` occupant通过公开`ctx.sessions`显示真实Session列表，并在原型规定位置显示项目任务入口。

## 用户任务

浏览器用户从左列打开“所有 ComfyUI 异步任务”，按 Session、Chat Turn 和创建时间筛选当前 Workspace 的任务，定位一个排队或运行中的 ComfyUI Job，确认准确目标并取消该 Job。

## 原型依据

左列入口、居中任务 Modal、三个筛选器、五列任务表、每页五项分页、状态 badge、取消按钮、不可取消原因、确认 Modal、“正在取消”和“已取消”。

## 查询契约

1. Host 从当前 Harness 上下文派生 Workspace scope；浏览器不能指定 Workspace ID。
2. `GenerationRuns.list()` 接受 Session、数字 `turn`、创建时间范围、状态、page 与固定 `page_size: 5`，返回 `items` 与 `total_count`。
3. 每行返回安全实例名称、`run_id`、可选 `prompt_id`、Session 标题/ID、数字 `turn`、创建时间、本仓库状态、可选 ComfyUI Job 原始状态、`can_cancel` 和具体 `cancel_unavailable_reason`。
4. 原始状态来自该运行最近一次 Jobs API 回读；没有 `prompt_id` 或尚未回读时显示具体原因，不能伪造 queued/running。

## 取消规则

- 只有本仓库状态 `remote_pending` 或 `remote_running` 且保存 `prompt_id` 的运行可取消。
- 用户确认后，Host 先在事务中把运行更新为 `cancelling`，再向该运行来源快照对应实例发送 `POST /api/jobs/{prompt_id}/cancel`。
- `{ cancelled: true }` 只表示取消请求被接受；Host 必须继续 `GET /api/jobs/{prompt_id}`，只有远端状态为 `cancelled` 时写入 `cancelled`。
- `{ cancelled: false }` 或取消与完成竞态时，Host 根据回读的 completed、failed、cancelled 或 404 收敛，不能直接记为取消成功。
- `created`、`prepared`、`submitting`、`downloading`、`submission_unknown` 和所有终态不可取消，并返回各自具体原因。
- Cancellation 保留 Run 记录、状态轨迹、Workflow 和已经保存的媒体。

## 前端交互

1. 三个筛选器各自改变查询条件并把页码重置为 1；任务分页不改变媒体 Modal 或右列分页。
2. 取消确认 Modal 显示安全实例名称、`run_id`、`prompt_id`、Session 和数字 `turn`，并明确只取消这个 Job。
3. 确认后任务行和右列同一 `run_id` 显示“正在取消”；最终回读后同时显示实际终态。
4. 关闭确认 Modal 不发送请求，返回任务 Modal 后保留筛选和页码。
5. 不可取消行在操作列显示具体原因，不显示可点击的伪按钮。

## 产品验收

1. 当前 Workspace 至少包含可取消和不可取消的多种运行；筛选、清空筛选和两页数据的 `total_count` 正确。
2. 确认取消一个 pending Job，Fake Jobs API 只收到该 `prompt_id` 的一次 cancel 请求；任务 Modal 与右列同步收敛为 cancelled。
3. 覆盖取消 no-op、取消与完成竞态、回读失败和 Job missing；每个分支显示实际结果，不谎报取消成功。
4. 伪造其他 Workspace 的 `run_id` 不发送远端取消请求，也不泄露目标详情。
5. 视觉与语义审核者检查表头顺序、筛选、分页、状态、确认目标和不可取消原因。

## 不属于本 Ticket

本 Ticket 不删除 Generation Run、Workflow 或 Saved Media，也不把 Harness `ctx.jobs.kill()` 当作 ComfyUI Cancellation。
