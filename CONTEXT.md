# Harness ComfyUI Generation

本上下文描述 DeepSeek Harness 会话中的生成请求、持久运行、远端 ComfyUI Job 和保存媒体之间的领域关系。

## Conversation

**Workspace**:
生成数据的最高隔离边界。一个 Workspace 包含多个 Session，并聚合该范围内的 Generation Run 与 Saved Media。
_Avoid_: 全局、整个安装、全部用户

**Session**:
Workspace 中的一段持续对话。一个 Session 包含按顺序发生的多个 Chat Turn。
_Avoid_: Workspace、单轮对话

**Chat Turn**:
一条用户消息，以及下一条用户消息出现前产生的全部 Agent 回复、Skill Invocation、Tool Call 和 Generation Run。一个 Chat Turn 可以关联零个、一个或多个 Generation Run。
_Avoid_: Agent 单条回复、最新消息、turn_id

**Message Context**:
附着到一条用户消息并对 Agent 可见的不可变领域资源信息。Catalog Filter 和 Execution Route 不属于 Message Context。
_Avoid_: 页面筛选状态、执行实例配置

**Catalog Filter**:
限制目录候选项范围但不进入 Message Context 的选择条件。底模是 Catalog Filter。
_Avoid_: 上下文引用

**Catalog Operation**:
向 Agent 或上下文选择界面返回安全目录数据的只读来源操作。Catalog Operation 不返回执行凭据或完整执行来源。
_Avoid_: Source Operation、管理写操作

**Source Operation**:
通过 Host 专用的本机只读 discovery/CLI 表面返回精确执行来源的操作。Harness ComfyUI Host 插件不把 Source Operation 注册为 Agent Tool、Skill Tool 或浏览器 RPC。本版本不认证调用该本机只读表面的其他本机进程。
_Avoid_: Catalog Operation、管理写操作

**ComfyUI Instance Authorization**:
Source Operation 在 ComfyUI 实例连接快照中返回的凭据。ComfyUI Instance Authorization 只认证 Host 到该快照所指向的 ComfyUI 实例；Host 只在进程内使用该凭据，不把该凭据写入 Configuration Profile、Run Repository、日志、Tool Result、浏览器响应或部署证据。本版本不使用该凭据认证 Source discovery/CLI 的本机调用者。
_Avoid_: Host Runtime Credential、Source 调用者认证

**Source Contract Identity**:
两个只读 discovery 返回的同一组 `contract_id` 与 `contract_version`。Harness ComfyUI Host 插件只接受配置中明确列出的版本；不兼容版本会阻止对应的数据源能力。
_Avoid_: operation audience、npm package version

## Generation

**Workflow Template**:
用于产生一次 Generation Run 的版本化生成图定义。Workflow Template 既是可选择的执行资源，也可以作为 Message Context 的资源引用。
_Avoid_: Actual Workflow、API Workflow

**Execution Route**:
一次 Generation Run 使用的 ComfyUI 实例选择。浏览器用户可以在生成选项中明确选择安全实例 ID；未选择时，Host 使用当前配置的默认实例 ID。明确选择的实例不可用时，本次运行失败，Host 不切换到其他实例。Execution Route 属于 Tool 执行输入，不属于 Message Context。
_Avoid_: 实例上下文

**Generation Run**:
当前系统持久记录的一次媒体生成尝试。Generation Run 属于一个 Chat Turn，并保留自己的状态、Workflow 和输出事实。
_Avoid_: ComfyUI Job、Harness Job、Tool Call

**Run Repository**:
当前 Harness 安装使用的单个 SQLite 数据库及按 `workspace_id/run_id` 分区的运行文件目录。Run Repository 是 Generation Run 状态、Workflow 和 Saved Media 的权威来源。
_Avoid_: Harness Session 日志、数据源数据库、ComfyUI Job 列表

**Run Change Notification**:
Harness ComfyUI Host 插件在 Generation Run 状态改变后发送给浏览器的非持久通知。通知只携带 `run_id`；浏览器收到通知后从 Run Repository 重新读取权威状态。Run Change Notification 不写入 Harness Session 日志。
_Avoid_: Generation Run 状态快照、Session 事件、持久队列

**ComfyUI Job**:
ComfyUI 实例接受生成请求后创建的远端执行任务。一个 Generation Run 最多关联一个已确认的 ComfyUI Job。
_Avoid_: Generation Run、Harness Job

**Submission Unknown**:
当前系统无法确认 ComfyUI 是否接收生成请求，而且没有已确认 ComfyUI Job 的 Generation Run 终态。Submission Unknown 不会自动产生新的 Generation Run。
_Avoid_: Job Missing、运行失败、自动重试

**Harness Job**:
DeepSeek Harness 对当前进程内异步观察工作的句柄。Harness Job 不替代 Generation Run，也不代表 ComfyUI Job。
_Avoid_: Generation Run、ComfyUI Job

**Cancellation**:
停止活动 ComfyUI Job 的请求。Cancellation 保留 Generation Run、状态轨迹、Workflow 和已经保存的媒体。
_Avoid_: 删除任务、删除媒体

## Artifacts

**Actual Workflow**:
由 Workflow Template 和该次 Generation Run 的不可变输入确定的完整可导入 ComfyUI 图。
_Avoid_: 请求快照、API Workflow

**API Workflow**:
由 Actual Workflow 编译得到并提交给 ComfyUI 的可执行图。
_Avoid_: Actual Workflow、请求快照

**Saved Media**:
当前系统已经验证并持久保存的 Generation Run 输出。Saved Media 在数据源目录不可用时仍属于可读取的运行事实。
_Avoid_: 远端临时输出、预览缓存

## Invocation

**Skill Invocation**:
DeepSeek Harness Session 记录的一次 Skill 使用事件；Agent 按该 Skill 指令工作。一次 Skill Invocation 可以不产生 Generation Tool Call。
_Avoid_: Tool Call

**Tool Call**:
Agent 对 DeepSeek Harness 提供的一个 Tool 的实际调用。Tool Call 使用 Harness 的调用身份关联调用与结果。
_Avoid_: Skill Invocation

**Generation Tool Call**:
Agent 对生成 Tool 的一次实际调用。Generation Tool Call 接纳成功后产生一个持久 Generation Run。
_Avoid_: Skill Invocation、Generation Run

**Generation Tool Result**:
Harness 原生 Tool Result。Generation Tool Result 返回已经持久接纳的 `run_id`，并由 Harness Session 日志保存。Generation Tool Result 不复制 Generation Run 的后续状态变化。
_Avoid_: Generation Run 状态日志、Run Change Notification

**Resubmission**:
用户确认重复远端执行风险后，通过新消息触发的新 Generation Tool Call。Resubmission 产生新的 Generation Run，不改变原 Submission Unknown 运行。
_Avoid_: 自动重试、恢复原运行

## Delivery

**Development Workspace**:
当前项目目录。Development Workspace 保存源码、固定版本依赖、开发用 Harness composition、结构化配置、隔离测试数据和 CI/CD 脚本；它不是 Production Installation，也不是一次性测试 Workspace。
_Avoid_: Production Installation、release-smoke 安装、临时 Workspace

**Configuration Profile**:
development、test、release-smoke 或 production 的一组结构化非敏感配置值。四个 Configuration Profile 使用同一结构 schema；schema 只定义结构和校验，不保存运行时可调值。Configuration Profile 不包含 ComfyUI Instance Authorization 的运行值。Host 自身需要的 production-only credential 通过部署环境 secret 注入。
_Avoid_: 配置 schema、ComfyUI Instance Authorization、凭据文件、静默默认环境

**Host Runtime Credential**:
Host 自身连接 production-only 外部服务时需要、并由部署环境 secret 注入的凭据。Host Runtime Credential 不包括 Source Operation 返回的 ComfyUI Instance Authorization。
_Avoid_: ComfyUI Instance Authorization、Configuration Profile 值

**Release Artifact**:
CI 从一个通过门禁的提交构建一次并完成 release-smoke 验证的版本化 Harness bundle 产物。Release Artifact 包含应用、项目 Skill、配置模板和发布说明，不包含 Run Repository、Saved Media、凭据、测试数据或数据源内容。
_Avoid_: Development Workspace、Production Installation、运行数据备份

**Production Installation**:
部署目标中的独立运行安装。Production Installation 把不可变版本化应用与共享 production 配置、Run Repository、Saved Media 和运行日志分离。
_Avoid_: Development Workspace、Release Artifact

**Active Release**:
Production Installation 当前启动的一个版本化 Release Artifact。部署流程只在配置、持久目录、契约兼容性和启动前检查通过后切换 Active Release。
_Avoid_: Git branch、Development Workspace 当前提交

**Release Preview**:
实际创建 Git tag、GitHub Release 或生产部署前供用户确认的结构化摘要。发布用 Release Preview 包含 SemVer、提交、门禁结果、Release Artifact 内容、依赖审计结论和发布说明；部署用 Release Preview 另外包含目标 Production Installation、非敏感 Configuration Profile revision、preflight 计划和回滚目标。Release Preview 不包含凭据。
_Avoid_: GitHub Release、部署证据

**Deployment Approval**:
用户针对一个 Release Artifact 与一个目标 production 环境做出的独立部署确认。Deployment Approval 只允许该 artifact/environment 组合进入 Active Release 切换；发布批准、其他 environment approver 或先前 artifact 的批准不能替代 Deployment Approval。
_Avoid_: Release publication approval、GitHub environment 通用批准
