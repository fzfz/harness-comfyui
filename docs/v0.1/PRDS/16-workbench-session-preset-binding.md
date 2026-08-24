# Ticket 16 — 只创建并打开 harness-comfyui Preset Session

## 产品目的

浏览器用户打开Ticket 02交付的三列工作台时，左列只能显示和打开`SessionSummary.agentPreset === "harness-comfyui"`的普通Session。当前没有项目Session时，工作台必须通过rc.8公开`session.create` API创建一个真实`harness-comfyui` Session、等待Harness Session列表确认该记录、再打开该Session。用户发送普通消息后，消息必须由该Session对应的真实Agent处理。

本 Ticket补充Ticket 02，不增加“新建Session”按钮，不改变原型桌面三列布局、尺寸、样式、文案或现有输入交互，不实现移动端布局。

## Harness rc.8 公共接口

计划执行者只能使用以下公开接口：

- `@deepseek-ai/dsh-client-connection/client`的`ctx.connection.api.sessions.create(payload, signal)`。
- `ctx.connection.hostDescription.getSnapshot()`与`subscribe()`取得当前Host的`cwd`。
- `@deepseek-ai/dsh-client-runtime/client`的`ctx.sessions.list.getSnapshot()`与`subscribe()`取得唯一Session列表状态。
- `ctx.sessions.open(sessionId)`打开已经进入列表的Session。
- `SessionSummary.agentPreset`、`origin`、`updatedAt`、`id`与`cwd`。

计划执行者不得调用rc.8 package-internal `SessionManager`或`ConversationController`，不得修改Harness核心源码，不得创建第二个Session repository、第二个Session ID、第二个Agent进程或项目私有Session协议。

## 工作台 Session 选择规则

计划执行者必须创建`src/client/workbench/workbench-session-binding.ts`。该模块必须以Harness `ctx.sessions.list`作为唯一持久与可观察状态，并实现以下确定顺序：

1. 等待`ctx.connection.hostDescription`存在且`ctx.sessions.list.phase`进入ready状态。
2. 从`ctx.sessions.list.ids`读取普通Session；`SessionSummary.origin === "subagent"`的记录不属于工作台Session。
3. 只保留`SessionSummary.agentPreset === "harness-comfyui"`的记录。
4. 当前Session符合第3项时保持当前选择。
5. 当前Session不符合第3项且存在项目Session时，按`updatedAt`降序、`id`升序选择唯一记录并调用一次`ctx.sessions.open(id)`。
6. 不存在项目Session时，调用一次`ctx.connection.api.sessions.create({ cwd: hostDescription.cwd, agentPreset: "harness-comfyui" }, signal)`。
7. 创建响应必须为成功结果，并且`result.value.agentPreset`必须等于`harness-comfyui`；否则显示结构化错误且停止。
8. 创建成功后订阅`ctx.sessions.list`，直到相同`sessionId`出现且其`agentPreset`等于`harness-comfyui`，再调用一次`ctx.sessions.open(sessionId)`。

同一连接generation只能有一个create promise。React重复render、Session列表重复通知与Host重连不能产生重复Session。连接generation改变或组件卸载时必须取消未完成请求与订阅；已经由Host确认创建的Session仍由Harness列表管理，项目不得删除或伪造该记录。创建响应进入Session列表的等待时间固定读取`config/product-agent.json#sessionListConvergenceTimeoutMs`的`10000`毫秒。

## Client 组合

Ticket 02当前Client插件的`inject`必须增加公开`connection` service。三列WorkBench root必须在渲染Session列表与会话之前启动唯一`workbench-session-binding`，并直接从过滤后的Harness Session列表渲染左列。

工作台不能把`standard`、`minimal`、用户自建Preset或subagent Session显示为可选择项目Session。Harness其他页面仍可显示这些Session；本 Ticket只限定`harness-comfyui` Workbench root的Session列表与当前Session。

## 错误与空状态

计划执行者必须创建`src/client/workbench/session-binding-errors.ts`作为错误码与中文UI文案的唯一来源，并固定以下映射：

- `WORKBENCH_HOST_DISCONNECTED` → `无法连接 Harness Host，暂时不能打开 ComfyUI 工作台会话。`
- `WORKBENCH_SESSION_CREATE_FAILED` → `Harness 未能创建 ComfyUI 工作台会话，请查看产品日志。`
- `WORKBENCH_SESSION_PRESET_MISMATCH` → `Harness 创建的会话没有使用 harness-comfyui Agent Preset。`
- `WORKBENCH_SESSION_LIST_TIMEOUT` → `Harness 已创建会话，但会话列表在 10 秒内没有确认该记录。`
- `WORKBENCH_SESSION_LIST_MISMATCH` → `Harness 会话列表中的 Agent Preset 与创建结果不一致。`
- `WORKBENCH_SESSION_OPEN_FAILED` → `Harness 已确认会话，但工作台无法打开该会话。`

以下情况必须在Ticket 02现有中列空态/错误区域显示上述具体文案，并保留左列中已经确认的项目Session；项目不能静默改用`standard`，不能继续向错误Session提交消息：

- `hostDescription`连接丢失。
- `session.create`返回RPC或transport错误。
- 创建响应缺少`agentPreset`或返回其他Preset ID。
- `host/session-added`或Session列表在测试固定超时内没有出现创建返回的`sessionId`。
- Session列表中的同一`sessionId`记录了其他Preset ID。
- `ctx.sessions.open()`拒绝目标Session。

错误恢复只能由同一Harness连接generation重新读取Session列表后开始；不能用本地fixture补齐Session记录。

## 产品验收

1. 在仓库根目录执行`pnpm prod:start`，启动当前源码中的真实Host与Client。
2. 初始没有Session时，浏览器只创建一个`harness-comfyui` Session；左列出现该记录并自动打开。
3. 用户在原型对应输入区发送普通文本；真实Harness Agent接收消息并产生流式回复，中列保留Ticket 02的原型1:1布局与状态。
4. 同时存在`standard`、`minimal`、subagent与两个`harness-comfyui` Session时，左列只显示两个项目Session，并按Harness列表数据打开符合规则的项目Session。
5. 刷新浏览器、Host重连与产品restart后，工作台恢复同一持久项目Session，不额外创建Session。
6. 删除或破坏`harness-comfyui` Preset时，工作台显示具体创建错误，不回退到其他Preset。
7. 模拟创建响应Preset不匹配、列表迟到、列表Preset不匹配与open失败，每个分支都有测试且不提交普通消息。
8. 自动化测试读取真实rc.8 Host/Client公开事件；正式runtime不得使用fixture Session。

## 视觉验收

独立视觉审核者必须在`1440×1000`桌面viewport并排检查静态原型与真实WorkBench。该审核只核对Ticket 02已经交付的左列Session列表、当前会话标题、普通消息、流式状态、输入区与右列当前阶段状态；本 Ticket不得新增可见控件或改动三列尺寸。原型没有移动端产品要求，本 Ticket不增加移动端验收。

## Blocked by

- Ticket 15 — 交付`harness-comfyui` Agent Preset与作用域化Tool/Skill。
- Ticket 02 — 完成三列工作台、Harness Session列表与普通消息路径。
