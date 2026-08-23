# Harness ComfyUI Generation

本上下文描述 DeepSeek Harness 会话中的生成请求、持久运行、远端 ComfyUI Job 和保存媒体之间的领域关系。

## Platform

**Harness Core**:
主工作树实际安装的DeepSeek Harness `0.1.0-rc.8`已发布package中的Client模块加载、Cordis插件生命周期、Slot系统、Session、AgentLoop、Host Skill发现与调用校验、Tool execution pipeline、持久Session日志、Jobs registry和forwarded-event allowlist。当前项目把这些Harness Core能力作为不可修改的宿主权威；`ui-layout`、`ui-conversation`、`ui-input-trigger`、`ui-skill`和`ui-tool`属于上游随附插件，不属于不可替换的核心UI。
_Avoid_: 当前项目插件、项目 Run Repository、项目 Client component

**Public Plugin Seam**:
Issues #2–#15的正文和对应PRD分别直接列出所属产品功能使用的package public export、Cordis composition、Client slot、Service、Tool、Workspace、Jobs、Skill filesystem、Typert Remote与Web route registration API。Issue执行者只落地所属Issue正文已经列出的Public Plugin Seam，不承担接口调研或替代设计。
_Avoid_: `@deepseek-ai/*/src/*`、Harness source patch、DOM monkey patch、local fork

**Workbench Desktop Shell Composition**:
项目bundle通过公开`dsh.bundle.patch`按Loader row id停用上游随附`ui-layout`插件。项目Client plugin向内建`root` slot注册唯一root occupant，声明并渲染rc.8标准`sidebar`、`conversation`、`details`与`shell.overlay`，在`1440×1000`使用`294px minmax(0, 1fr) 432px`。项目root先声明四个child slot，再提供公开`ILayout` service；ConversationRoot继续注册到`conversation` slot并渲染`conversation.input.overlay`，所以Harness原生`/` Skill候选菜单保持可见。项目桌面Shell从公开`ThemeSnapshot`投影color scheme与tokens。产品验收只覆盖桌面布局，移动端不属于本版本范围。
_Avoid_: 第二个root、第二套Skill菜单、AppFrame源码复制、查询或移动上游DOM、Harness Core patch

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

**Generation Context V1 Block**:
项目Workbench在发送前通过真实Catalog resolve ContextRef并写入Harness原生`user/message`单个text content的版本化快照block。每个block由`<generation-context.v1>`、固定字段顺序的一行JSON和结束标签组成，并按用户确认的chip顺序排列在用户正文之后。项目user-message renderer从同一Session消息重放正文与折叠快照。
_Avoid_: 临时chip状态持久化、独立metadata消息、`agent.inject()`快照

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
Source Operation 在 ComfyUI 实例连接快照中返回的凭据。ComfyUI Instance Authorization 只认证 Host 到该快照所指向的 ComfyUI 实例；Host 只在进程内使用该凭据，不把该凭据写入 Configuration Profile、Run Repository、日志、Tool Result、浏览器响应或 Release Preview。本版本不使用该凭据认证 Source discovery/CLI 的本机调用者。
_Avoid_: Host Runtime Credential、Source 调用者认证

**Source Contract Identity**:
Harness Installation固定`source.contractId: "imagegen-source-contract"`与`source.sourceReleaseVersion: "0.82.2"`。这两个字段是Harness-owned pin，不是v0.82.2 live discovery或目标响应中的字段。Host插件通过两个已发布CLI的`--discovery-json`读取实际discovery shape，再按照`config/source-contract-v0.82.2.json`校验OpenAPI、operation metadata、分页envelope和业务字段；shape、operation或版本pin不一致时阻止对应数据源能力。
_Avoid_: 把source版本pin误当成live body字段、operation audience、npm package version

**Source Release Version**:
Harness从Installation的`source.sourceReleaseVersion`读取已批准的源数据仓库package SemVer，并在内部Catalog item与Host snapshot中作为来源发布标识。v0.82.2 live Catalog/Source响应不返回该字段；Source Release Version不表示目录记录、Workflow Template或runtime config的修订。
_Avoid_: 把source_release_version当成live body字段、source_revision、workflow_revision、runtime_config_revision

**Source Data Release Handoff**:
数据源仓库按照`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`在自己的Issue、分支、测试和版本发布流程中交付OpenAPI、Catalog/Source handler、discovery和两个只读CLI。当前仓库只消费数据源仓库已经发布的commit/tag、contract version和CLI；当前仓库Issue不修改或复制数据源仓库实现。
_Avoid_: 跨仓库直接改代码、当前仓库伪造数据源Schema、未发布contract

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

**Run Refresh Polling**:
项目Client plugin通过项目unary Typert Remote读取Run Repository的浏览器刷新过程。Client在遇到合法Generation Tool Result、打开results panel、切换Session、切换数字Chat Turn和取消后立即查询。页面可见且中列可见Generation Tool行或右列可见运行卡观察非终态Generation Run时，唯一`GenerationRunProjectionStore`按Remote response的`refreshAfterMs`继续查询；两处同时可见时每周期只查询一次。results panel关闭但中列Tool行仍可见时继续查询；页面隐藏、两处都没有可见消费者或全部运行终态时停止。Run Refresh Polling不写入Harness Session日志，也不增加Harness forwarded event。
_Avoid_: Run Change Notification、Generation Run 状态快照事件、固定后台 daemon

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

**Project Tool Registry**:
`src/host/tools/register-project-tools.ts`提供的当前项目唯一Tool注册入口。业务Ticket使用Harness公开`defineTool()`构造闭合定义并交给`registerProjectTools()`；只有该模块直接调用`ctx.tools.register()`。registry按稳定顺序注册，失败和Host plugin卸载时反向注销。
_Avoid_: 第二个Tool registry、业务模块直接调用`ctx.tools.register()`、修改Harness Tool runtime

**Skill Invocation**:
DeepSeek Harness Session 记录的一次 Skill 使用事件；Agent 按该 Skill 指令工作。一次 Skill Invocation 可以不产生 Generation Tool Call。
_Avoid_: Tool Call

**Prompt Skill**:
`anima-prompt-builder`或`wai-sdxl-prompt-builder`。该Skill读取当前普通用户消息、不可变Message Context和真实Catalog Tool结果，并在中列返回完整Prompt。Prompt Skill不调用Generation Tool，也不产生`run_id`。
_Avoid_: ComfyUI Generation Skill、Generation Tool Call

**LoRA Adjustment Skill**:
迁移后的`lora-adjustment`。该Skill读取当前Prompt、Workflow模板安全快照、有序LoRA快照和当前调整要求，并在中列返回调整后的`prompt_text`以及逐项LoRA权重和实际触发词。该Skill不拥有专用Session，不调用Generation Tool，也不产生`run_id`。
_Avoid_: 专用LoRA Session、ComfyUI Generation Skill

**ComfyUI Generation Skill**:
当前项目新增的`comfyui-generate`。该Skill与Prompt Skill、LoRA Adjustment Skill处于同一Harness Skill层；用户必须显式选择它。该Skill把当前消息、当前Message Context、可选Execution Route和用户明确引用的先前Skill结果转换为`generate_with_comfyui` Tool Call。Tool Call显示在中列，关联Generation Run显示在右侧第三列。
_Avoid_: Prompt Skill的自动生成阶段、LoRA Adjustment Skill的自动提交阶段

**Tool Call**:
Agent 对 DeepSeek Harness 提供的一个 Tool 的实际调用。Tool Call 使用 Harness 的调用身份关联调用与结果。
_Avoid_: Skill Invocation

**Generation Tool Call**:
Agent 对生成 Tool 的一次实际调用。Generation Tool Call 接纳成功后产生一个持久 Generation Run。
_Avoid_: Skill Invocation、Generation Run

**Generation Tool Result**:
Harness 原生 Tool Result。Generation Tool Result 返回已经持久接纳的 `run_id`，并由 Harness Session 日志保存。Generation Tool Result 不复制 Generation Run 的后续状态变化。
_Avoid_: Generation Run 状态日志、Run Refresh Polling 结果副本

**Resubmission**:
用户确认重复远端执行风险后，通过新消息触发的新 Generation Tool Call。Resubmission 产生新的 Generation Run，不改变原 Submission Unknown 运行。
_Avoid_: 自动重试、恢复原运行

## Delivery

**Development Workspace**:
当前 Issue 的 Git worktree。Development Workspace 保存该 Issue 的源码、固定版本依赖、Harness composition、结构化配置、自动化测试数据、CI 与版本发布脚本。Tickets 02–13 必须在自己的 worktree 中通过产品管理 CLI 创建 `runtime/production/` Product Installation；Ticket 14 只发布 Ticket 13 已验收的同一 Release Artifact。clean checkout 与 release-smoke 只承担 artifact 自动化技术门禁。
_Avoid_: 共享主 worktree 运行目录、按 Issue 编号再建运行根、development 专用部署逻辑

**Configuration Profile**:
development、test、release-smoke 或 production 的一组结构化非敏感配置值。四个 Configuration Profile 使用同一结构 schema；schema 只定义结构和校验，不保存运行时可调值。每张产品功能 Issue 的 worktree 使用 production Configuration Profile 运行 Product Installation。Configuration Profile 不包含 ComfyUI Instance Authorization 的运行值。
_Avoid_: 配置 schema、ComfyUI Instance Authorization、凭据文件、静默默认环境

**Product Installation**:
`harness-comfyui` 产品管理 CLI 创建和管理的完整运行目录。目录包含不可变版本目录、跨版本共享的 Run Repository、Run 文件、Saved Media 与日志，以及 active release、进程和 health state。Tickets 02–13 的每张产品 Issue 在自己的 worktree 中使用 `runtime/production/` Product Installation 验证同一产品流程；Ticket 14 只发布 Ticket 13 已验收的同一 Release Artifact；GitHub Release 发布后，用户自行选择 installation root。
_Avoid_: 第二套开发启动目录、测试专用进程管理器、项目替用户维护的运行目录

**Product Management CLI**:
Release Artifact 内 `bin.harness-comfyui` 暴露的唯一系统生命周期程序。固定子命令是 install、preflight、start、stop、restart、status、health、logs、upgrade 和 rollback。worktree 验收与用户安装调用相同程序。
_Avoid_: package script 中复制实现、Issue 专用 wrapper、仅 fixture 可运行的部署骨架

**Release Artifact**:
CI 从一个通过门禁的提交构建一次的版本化 Harness bundle 产物。clean checkout、composition、e2e 和 release-smoke 对该产物执行自动化技术门禁；Ticket 13 自己的 Git worktree、该 worktree 的 `runtime/production/` Product Installation 和当前本地浏览器对同一 SHA-256 产物执行`1440×1000`桌面完整人工1:1验收。Release Artifact 包含应用、项目 Skill、配置模板、产品管理 CLI、profile helpers、profile templates 和 installation-local Harness runtime manifest/lock/workspace，不包含 Run Repository、Saved Media、凭据、测试数据、原型或数据源内容。
_Avoid_: Development Workspace、用户安装目录、运行数据备份

**Release Preview**:
实际创建 Git tag 和 GitHub Release 前供用户确认的结构化摘要。Release Preview 包含 SemVer、精确 commit、门禁结果、Release Artifact identity 与内容、依赖审计结论、`1440×1000`桌面独立1:1 PASS证据和 release notes。Release Preview 不包含凭据。
_Avoid_: GitHub Release、用户安装说明

**Release Approval**:
用户针对一个 Release Preview 做出的明确发布确认。Release Approval 绑定 SemVer、精确 commit、artifact SHA-256、byte length、自动化门禁、`1440×1000`桌面独立1:1 PASS证据和 release notes，只授权创建对应 Git tag、推送该 tag 和创建 GitHub Release。任一绑定对象变化会使批准失效。
_Avoid_: 用户安装授权、环境操作授权、先前版本批准
