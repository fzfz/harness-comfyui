# PRD 06：聊天轮次与 Generation Run 投影

## 关联 Ticket

Ticket 06 — 在多个聊天轮次之间准确查看零个、一个或多个运行。

## Harness 核心零改动与公共接口

本Ticket复用Ticket 02注册到公开`conversation.view`、`id: "chat"`的项目occupant和公开`details`的项目occupant。项目Workbench的用户消息renderer在用户消息之前渲染原型轮次按钮，并从公开ConversationSnapshot节点的`location.turn.turn`读取数字`turn`。项目Tool renderer按PRD 04唯一规则验证settled Tool Result：`call`存在时校验`call.name`与meta；`call === null`时使用公开`callId`、当前Session和meta中的`run_id`调用`GenerationRuns.resolveToolResultLink()`核对持久映射。验证成功后，两类renderer更新同一项目选择状态，并从同一`GenerationRunProjectionStore`取得Run Repository公开投影；中列Tool行显示异步状态摘要，右列显示同一快照的详细卡片。项目不得向Harness Session日志写入`generation.run.*`事件，也不得把Session最新Run当作选中turn的结果。

## 用户任务

浏览器用户在同一 Session 中选择不同 Chat Turn，并准确看到该数字 `turn` 对应的零个、一个或多个 Generation Run；用户从任一 Tool Call 点击“定位结果”后直接聚焦该 Tool Call 创建的运行卡片。

## 原型依据

- 中列“第 N 轮 · 任务摘要”按钮、运行数量文案、选中态和 Tool Call“定位结果”。
- 右列“当前结果来自”、数字 `turn`、零项空态和多张运行卡片。
- 左列 Session 行的运行总数。

## 身份与权威来源

- Chat Turn 使用 Harness Session ID 与原生数字 `turn`；当前项目不得创建字符串 `turn_id`。
- Generation Tool Call 使用 Harness `call_id`。Run Repository 保存 `workspace_id`、`session_id`、数字 `turn`、`call_id` 和 `run_id`。
- Harness Session 日志只保存原生 Tool Call 和只含 `{ run_id }` 的 Tool Result。Run Repository 是运行集合与状态的唯一权威来源。

## Host/Client 契约

Harness `0.1.1-rc.2` 的公开 Typert unary Remote 与 WebServer route handler 不提供浏览器调用者身份或当前 Workspace 授权主体。当前插件只运行在绑定 `127.0.0.1` 的单用户 Harness 进程中；同一浏览器用户可以访问 Harness 已列出的全部 Workspace。`workspaceIdForSession()`只验证 Session 与 Workspace 的唯一归属，不能作为多用户授权。需要调用者级 Workspace 隔离时，必须先由 Harness 公共接口提供经过认证的请求主体；项目插件不得伪造该身份。

1. `GenerationRuns.list()`接受浏览器当前页面的 Session ID与可选数字`turn`。Host通过Workspace Registry解析该Session的唯一Workspace；浏览器不能提交Workspace ID。
2. 当前轮次查询固定使用当前 Workspace、当前 Session 和选中数字 `turn`；本会话运行计数固定使用当前 Workspace 与当前 Session。
3. 返回页至少包含 `items`、`page`、`page_size` 和 `total_count`。每项包含运行卡片需要的安全字段，不包含来源快照、内部请求、API Workflow、路径或凭据。
4. `GenerationRuns.resolveToolResultLink({ session_id, call_id, run_id })`必须通过Workspace Registry解析请求中Session ID的唯一Workspace归属，并要求Run Repository中的`(workspace_id, session_id, call_id) -> run_id`映射完全一致；成功响应固定包含`contract_id: "harness-comfyui-generation-tool-link"`、`contract_version: 1`、`tool_name: "generate_with_comfyui"`、`session_id`、数字`turn`、`call_id`与`run_id`。该归属校验不构成多用户调用者授权。该Remote不得接受Workspace ID，也不得返回路径、凭据或内部请求。
5. Client遇到通过call+meta校验或持久映射校验的Generation Tool Result、打开右列、切换Session、切换数字`turn`或完成取消请求后，必须立即调用`GenerationRuns.get()`或`list()`；项目Remote response返回`hasNonterminalRuns`与`refreshAfterMs`，Store按`run_id`归并返回项。
6. 页面可见，且中列至少一个可见Generation Tool行引用非终态Run，或右列results panel可见且引用非终态Run时，唯一Run投影协调器按`refreshAfterMs`继续查询。中列和右列同时可见时共享订阅并且每个周期只调用一次Remote；页面隐藏、两处都没有可见消费者或全部已观察运行终态时停止。Session重新打开时，Client直接按Session与数字`turn`查询Run Repository，不依赖页面内存或项目事件历史。

## 前端交互

- 每个 Chat Turn 按原生顺序渲染一个轮次按钮。按钮显示“第 N 轮 · <任务摘要>”；有运行时显示“查看 N 项 ComfyUI 运行”，无运行时显示“查看本轮回复 · 无 ComfyUI 运行”。
- 名为`generate_with_comfyui`的中列Tool行必须同时显示`run_id`和当前异步状态摘要。它不得把Tool Result刚返回时的“已接纳”当作永久状态，也不得只在用户打开右列后才刷新。
- 点击轮次按钮更新中列选中态、右列来源标题和当前轮次运行集合。右列不得显示同一 Session 其他 turn 的运行。
- 点击Tool Call“定位结果”读取该Tool Result的`run_id`，选择Tool Call所属数字`turn`，切换到项目results panel，滚动并高亮对应卡片。不存在或无权读取时显示具体错误，不切换到其他运行。
- Session 行的运行数量等于该 Session 所有数字 `turn` 的去重 `run_id` 数量。切换 Session 后数量来自 Run Repository 查询，不使用 DOM 计数。
- 当前选择属于 Client 显示状态；用户切换 Session 再返回时恢复该 Session 最近选择的数字 `turn`。如果该 turn 不再存在，则选择最新存在的 turn 并说明原选择不可用。

## 状态与错误

- 零运行是成功查询后的产品空态，不是加载错误。
- Run Repository 查询失败时，右列保留当前来源标题并显示可重试错误；不得保留上一轮次的卡片。
- Tool Result缺少`run_id`、`call !== null`但Tool名不匹配、`call === null`且持久映射不存在，或运行与Tool Call的Session/turn不一致时返回`GENERATION_RUN_LINK_INVALID`，并停止定位。
- Session ID 与 Run 或 Media 的持久归属不一致时返回不存在；错误文案不得暴露目标属于哪个 Workspace。

## 产品验收

1. 一个 Session 依次创建零运行、单运行和四运行 Chat Turn；三个轮次按钮和右列数量逐项正确。
2. 每个 Tool Call 的“定位结果”聚焦其自身 `run_id`，多个 Tool Call 不互相覆盖。
3. 切换到其他 Session 再返回，轮次选择、卡片集合和 Session 运行总数保持正确。
4. 修改浏览器请求中的 Session ID 后，原 Session 的 Run 或 Media 标识不能通过归属校验。调用者级跨 Workspace 隔离不属于当前 rc.2 本机单用户插件接口的能力。
5. 视觉审核者检查轮次标题、数量文案、选中态、右列来源、空态、卡片顺序、滚动与聚焦样式。
6. 同一`run_id`从队列等待进入远程运行、保存媒体和成功时，中列Tool行和右列卡片在每次Store更新后显示同一状态；中列单独可见时仍能刷新。
7. 初始history window只包含Tool Result、配对Tool Call在更早分页且`ToolResultNode.call === null`时，Client通过`resolveToolResultLink()`恢复中列Tool行与右列卡片；篡改`call_id`、Session或meta `run_id`后不建立链接。

## 不属于本 Ticket

本 Ticket 不推进远端 Job 状态，不实现取消、媒体库、多媒体下载或 Harness 尚未公开请求主体接口的多用户 Workspace 授权。
