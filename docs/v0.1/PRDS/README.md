# Harness ComfyUI v0.1 产品需求文档索引

本目录为 Tickets 01–16 提供逐票产品需求。每份 PRD 与对应 Ticket 正文共同构成执行输入：PRD 定义用户或操作员能够完成的任务、真实数据来源、前后端行为、错误分支和产品验收；Ticket 定义实现跨度、阻塞关系和工程落点。Tickets 15与16分别是已关闭Ticket 01和开发中Ticket 02的附加Ticket。

静态原型只提供布局、样式、控件、交互顺序和可见状态的设计证据。正式产品不得导入 `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`、`prototype/generation-workbench/app.js` 中的静态目录数组或原型状态切换器作为运行时数据或业务逻辑。自动化测试可以在隔离环境使用受控 fixture；浏览器产品验收必须通过真实 Harness Host/Client、真实 Run Repository 和指定的只读数据源 adapter 完成。

Tickets 03–05与12需要的数据源OpenAPI、只读handler、Catalog/Source discovery和两个CLI由[源数据目录Catalog与Host Source合同实施文档](../source-data-catalog-implementation.md)交给数据源仓库独立实施和发布。源数据仓库当前已发布`v0.82.2`；Harness只按[Harness v0.82.2 envelope合同](../source-contract-v0.82.2.md)和唯一结构化合同[`config/source-contract-v0.82.2.json`](../../config/source-contract-v0.82.2.json)消费两个CLI，不得跨仓库直接修改数据源代码。`contractId`与`sourceReleaseVersion`由Installation固定，不从live response读取；`expected_output_node_ids_json`为空时模板生成入口失败关闭。

| Ticket | PRD | 原型单独是否足够 | 主要缺口 |
|---|---|---|---|
| 01 | [完整系统生命周期基线](01-engineering-baseline.md) | 否 | 原型没有产品安装、配置预检、启动、进程状态、健康检查、日志、停止、升级、回滚、构建、测试或 CI/CD 行为 |
| 02 | [三列布局与普通聊天](02-three-column-chat.md) | 否 | 原型没有真实 Session、消息提交、流式协议和错误恢复 |
| 03 | [首批消息上下文](03-message-context-core.md) | 否 | 原型候选来自静态数组，没有真实Catalog、Context resolver或一次原生Session提交契约 |
| 04 | [单图生成闭环](04-single-image-generation.md) | 否 | 原型没有 Source Operation、持久运行、Workflow 转换和远端协议 |
| 05 | [完整目录与执行路线](05-full-catalog-context-and-route.md) | 否 | 原型缺少提示词条目导航，并把 ComfyUI 实例错误放入上下文汇总 |
| 06 | [聊天轮次运行投影](06-turn-run-projection.md) | 否 | 原型没有 Harness 数字 `turn`、`call_id` 与 Run Repository 查询契约 |
| 07 | [持久异步运行观察](07-durable-run-observation.md) | 否 | 原型没有 worker、Jobs API、重启恢复和通知回读契约 |
| 08 | [失败与提交结果未知](08-failure-and-submission-unknown.md) | 否 | 原型没有冲突判定、崩溃边界和结构化错误来源 |
| 09 | [Workspace 任务取消](09-workspace-task-cancellation.md) | 否 | 原型没有授权查询、取消竞态和最终状态回读 |
| 10 | [Session 与 Workspace 媒体](10-session-workspace-media.md) | 否 | 原型没有媒体授权、二进制读取、计数和文件错误契约 |
| 11 | [多输出媒体](11-multi-output-media.md) | 否 | 原型没有输出描述器、MIME/签名验证和多文件持久化 |
| 12 | [Prompt 与 LoRA 调整 Skills](12-prompt-skills.md) | 否 | 原型没有Harness Skill注册、三个来源Skill的迁移合同、LoRA连续调整或与独立生成Skill的交接 |
| 13 | [Release Artifact 验收](13-release-artifact-acceptance.md) | 否 | 原型没有构建一次、产品 CLI 全生命周期、干净安装和发布证据 |
| 14 | [发布已验收版本](14-approved-release-publication.md) | 否 | 原型没有 Release Approval、tag、GitHub Release、artifact identity 或用户自行安装边界 |
| 15 | [项目Agent Preset与作用域化Tool/Skill](15-agent-preset-and-scoped-capabilities.md) | 否 | 原型没有Agent Preset、Agent scope、Tool allowlist、Skill provider root或安装时Preset组合 |
| 16 | [工作台Session绑定项目Preset](16-workbench-session-preset-binding.md) | 否 | 原型没有Session创建API、resolved Preset ID、Host列表收敛或错误Preset拒绝逻辑 |
