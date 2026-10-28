---
文档用途: 记录生成请求身份、Run 归属与持久去重决策。
读取时机: 修改生成身份、请求重放或会话归属前。
status: accepted
---

# Harness 身份与 Generation Run 归属

## 1. 调用身份与归属

1. Host 从已验证的前台 Tool Call 取得原生 Session、数字 turn 和 `call_id`。Workspace 按原始项目目录解析，入口见[受管 CLI 身份](../system/architecture.md#host-node-与受管-cli-身份)。
2. Runtime 接纳请求时创建 `run_id`，并保存调用来源。子会话创建的 Run 继续归属该子会话；父会话按现有后代访问范围查询结果。

## 2. 请求身份与重放

1. `request_id` 使用 [CONTEXT.md](../../CONTEXT.md#生成记录与媒体) 的定义。Runtime 以 `(workspace_id, session_id, request_id)` 建立持久唯一约束。
2. 相同身份与相同规范化请求返回原 Run，接纳结果为 `reused`。跨 Tool Call 重放、响应丢失后重试和应用重启后重试均遵循该规则。
3. 相同身份对应不同请求时返回 `RUN_REQUEST_CONFLICT`。Runtime 在接纳事务中检查全部项；发生冲突时，本次新增 Run 数为零。
4. 修改参数后重做，或用户要求相同参数再次生成时，Agent 为该项保存新的 UUID。`call_id` 保留调用来源，同一 Tool Call 可提交多个独立请求。
5. 历史记录迁移入口见 [GenerationRuntime](../../src/host/generation/generation-runtime.ts)。
