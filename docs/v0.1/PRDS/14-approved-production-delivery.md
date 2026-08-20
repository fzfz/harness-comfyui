# PRD 14：独立批准后的发布、部署与生产写验证

## 关联 Ticket

Ticket 14 — 经独立批准发布、部署并执行受控生产写验证。

## 操作员任务

发布负责人在批准 Release Preview 后发布 Ticket 13 验收的同一 artifact；部署负责人对该 artifact 与一个 production 环境完成独立 Deployment Approval 后激活它并执行只读健康检查；生产写验证批准者再对一项具体 Generation Tool 请求完成独立批准，随后浏览器用户只向目标实例提交一次写请求并检查 Saved Media。

## 三个独立批准边界

1. Release approval 绑定 SemVer、commit 与 artifact SHA-256，只授权创建 tag、推送 tag 和创建 GitHub Release。
2. Deployment Approval 绑定 GitHub Release artifact、目标 Production Installation、非敏感配置 revision、preflight 结果与回滚目标，只授权切换 Active Release 和执行只读健康检查。
3. Production Write Approval 绑定目标实例稳定 ID/安全名称、测试 Workflow Template ID、Generation Tool 参数、预期一项 ComfyUI Job、预期 Saved Media、停止条件和回滚条件，只授权该请求的一次 `/prompt`。

任一绑定对象变化会使对应批准失效。前一批准不能替代后一批准。

## 发布与部署

- 发布 workflow 只附加 Ticket 13 的现有 artifact，不重新 build。
- 部署 workflow 从 GitHub Release 下载并验证 artifact version、byte length 与 SHA-256，不从生产工作树或 Development Workspace 复制文件。
- Production Installation 按版本安装不可变应用；共享 Configuration Profile、Run Repository、Saved Media 和日志位于版本目录之外。
- preflight 验证配置 schema、必需环境覆盖、持久目录可写、Run Repository 兼容、Source Contract Identity、artifact 完整性和显式 start/stop/health 命令。
- 激活通过项目命令停止当前前台 Harness、切换 Active Release、启动候选版本。流程不创建 daemon、登录项、cron 或隐藏启动器。

## 只读健康检查

Deployment Approval 后只允许：验证 Harness Host/Client 可访问、Catalog/Source discovery contract、Run Repository 只读打开，并在浏览器选择已有测试 Session、读取已有消息与数字 `turn`、读取右列既有空态。该路径不发送消息、不创建 Generation Run、不调用 `/prompt`、不调用 Cancellation。

## 生产写验证

Production Write Approval 后，浏览器用户在指定 Session 发送获批消息；Agent 产生一次 Generation Tool Call；Host 只向获批实例发送一次 `/prompt`。右列显示同一个 `run_id` 从 remote_pending 或 remote_running 到 downloading 和 succeeded；用户打开该运行的 Saved Media。流程不得自动重复或改用其他实例。

## 回滚

- 候选启动或只读健康检查失败时恢复上一 Active Release并重新启动；共享 Run Repository 与 Saved Media 不回滚、不移动、不删除。
- 生产写验证失败时停止后续写动作并保存运行证据。应用回滚只能在已定义条件满足时执行，不能删除失败 Generation Run 或已保存媒体。
- 需要不兼容 persistence migration 的版本必须另有批准的迁移与回滚规格；本 Ticket 不自动迁移。

## 部署证据

结构化记录必须包含环境、SemVer、commit、artifact identity、非敏感配置 revision、preflight、Release/Deployment/Production Write approval identity、activation、只读健康检查、写验证、rollback 和时间。记录不得包含 secret、Authorization、实例私有 URL、媒体内容或 API Workflow。

## 产品验收

1. 缺少任一批准时，对应受控动作不能开始。
2. 部署消费的 artifact SHA-256 与 Ticket 13、GitHub Release 完全一致。
3. 只读健康检查的 HTTP/Tool 记录证明没有消息写入、Run 创建、`/prompt` 或 cancel 请求。
4. 获批写验证只产生一个 Tool Call、一个 `run_id` 和目标实例的一次 `/prompt`。
5. 候选启动失败与健康检查失败分别触发上一版本恢复，持久 Run/Media 数据保持不变。
6. 浏览器三列布局、空态、运行状态卡片和 Saved Media 与 Ticket 13 验收 artifact 一致。

## 不属于本 Ticket

本 PRD 不构成任何实际 Release、Deployment 或 Production Write Approval。未经对应用户确认，执行者只能实现和隔离测试流程，不能发布、部署或连接 production 写接口。
