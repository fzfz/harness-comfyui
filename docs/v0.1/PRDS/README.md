# Harness ComfyUI v0.1 功能需求索引

本目录保存 v0.1 阶段的工作台功能需求。当前系统运行、配置、测试和发布规则以 [`docs/system/`](../../system/) 为准。

Ticket 02 与 Ticket 16 的需求文档及实现已经删除。下表中的 Ticket 03 至 Ticket 12 文档仅保留 v0.1 历史需求；这些文档依赖已经删除的 Ticket 02 工作台或 Product Agent 时，计划执行者不得把对应条目作为当前实现依据，新需求必须根据 Harness 当前公开扩展面重新设计。

静态原型只提供布局、样式、控件、交互顺序和可见状态的设计证据。生产源码不得导入原型静态目录数组或状态切换器作为运行数据。自动化测试可以使用受控 fixture；系统验收必须通过真实 Harness Host、Client、Run Repository 和配置的只读数据源完成。

源数据仓库已经发布 `v0.84.0`。Harness 按 [v0.84.0 envelope 合同](../source-contract-v0.84.0.md)和唯一结构化合同 [`config/source-contract-v0.84.0.json`](../../../config/source-contract-v0.84.0.json)消费两个 CLI。`contractId` 与 `sourceReleaseVersion` 由 `production` Configuration Profile 固定，不从 live response 读取。

| 编号 | 功能需求 |
| --- | --- |
| 03 | [首批消息上下文](03-message-context-core.md) |
| 04 | [单图生成闭环](04-single-image-generation.md) |
| 05 | [完整目录与执行路线](05-full-catalog-context-and-route.md) |
| 06 | [聊天轮次运行投影](06-turn-run-projection.md) |
| 07 | [持久异步运行观察](07-durable-run-observation.md) |
| 08 | [失败与提交结果未知](08-failure-and-submission-unknown.md) |
| 09 | [Workspace 任务取消](09-workspace-task-cancellation.md) |
| 10 | [Session 媒体](10-session-workspace-media.md) |
| 11 | [多输出媒体](11-multi-output-media.md) |
| 12 | [Prompt 与 LoRA 调整 Skills](12-prompt-skills.md) |
