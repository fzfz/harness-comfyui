# Harness ComfyUI v0.1 产品需求文档索引

本目录为 Tickets 01–14 提供逐票产品需求。每份 PRD 与对应 Ticket 正文共同构成执行输入：PRD 定义用户或操作员能够完成的任务、真实数据来源、前后端行为、错误分支和产品验收；Ticket 定义实现跨度、阻塞关系和工程落点。

静态原型只提供布局、样式、控件、交互顺序和可见状态的设计证据。正式产品不得导入 `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`、`prototype/generation-workbench/app.js` 中的静态目录数组或原型状态切换器作为运行时数据或业务逻辑。自动化测试可以在隔离环境使用受控 fixture；浏览器产品验收必须通过真实 Harness Host/Client、真实 Run Repository 和指定的只读数据源 adapter 完成。

| Ticket | PRD | 原型单独是否足够 | 主要缺口 |
|---|---|---|---|
| 01 | [工程基线](01-engineering-baseline.md) | 否 | 原型没有安装、启动、配置、构建、测试或 CI/CD 行为 |
| 02 | [三列布局与普通聊天](02-three-column-chat.md) | 否 | 原型没有真实 Session、消息提交、流式协议和错误恢复 |
| 03 | [首批消息上下文](03-message-context-core.md) | 否 | 原型候选来自静态数组，没有 Catalog、ReferenceCodec 或原子提交契约 |
| 04 | [单图生成闭环](04-single-image-generation.md) | 否 | 原型没有 Source Operation、持久运行、Workflow 转换和远端协议 |
| 05 | [完整目录与执行路线](05-full-catalog-context-and-route.md) | 否 | 原型缺少提示词条目导航，并把 ComfyUI 实例错误放入上下文汇总 |
| 06 | [聊天轮次运行投影](06-turn-run-projection.md) | 否 | 原型没有 Harness 数字 `turn`、`call_id` 与 Run Repository 查询契约 |
| 07 | [持久异步运行观察](07-durable-run-observation.md) | 否 | 原型没有 worker、Jobs API、重启恢复和通知回读契约 |
| 08 | [失败与提交结果未知](08-failure-and-submission-unknown.md) | 否 | 原型没有冲突判定、崩溃边界和结构化错误来源 |
| 09 | [Workspace 任务取消](09-workspace-task-cancellation.md) | 否 | 原型没有授权查询、取消竞态和最终状态回读 |
| 10 | [Session 与 Workspace 媒体](10-session-workspace-media.md) | 否 | 原型没有媒体授权、二进制读取、计数和文件错误契约 |
| 11 | [多输出媒体](11-multi-output-media.md) | 否 | 原型没有输出描述器、MIME/签名验证和多文件持久化 |
| 12 | [Prompt Skill](12-prompt-skills.md) | 否 | 原型没有 Harness 原生 Skill 注册、权限和黑盒调用链 |
| 13 | [Release Artifact 验收](13-release-artifact-acceptance.md) | 否 | 原型没有构建一次、干净安装、受控服务和发布证据 |
| 14 | [批准后的生产交付](14-approved-production-delivery.md) | 否 | 原型没有批准边界、激活、只读健康检查、写验证和回滚 |
