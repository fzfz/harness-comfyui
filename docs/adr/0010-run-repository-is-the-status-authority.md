---
status: accepted
---

# Run Repository is the status authority

Run Repository 是 Generation Run 状态、错误、Workflow 和 Saved Media 的唯一权威来源。Harness Session 日志只保留原生 Generation Tool Call 与包含 `run_id` 的 Generation Tool Result；Harness ComfyUI Host 插件不写入 `generation.run.created`、`generation.run.updated`、`generation.run.completed`、`generation.run.failed` 或 `generation.run.cancelled` 持久事件。

项目 Client plugin 通过 unary Typert Remote `harnessComfyuiGeneration.list()` 读取当前 Session 的 Run 与 Media 投影。项目不发送 `generation.run.changed`，也不修改 Harness 的 Host→Client forwarded-event allowlist。

`WorkbenchDetails` 订阅 `GenerationProjectionStore` 后，把 Harness `SessionSnapshot.running` 传给 Store 的 `setSessionRunning()`。此后，`WorkbenchDetails` 仅在该布尔值变化时再次调用 `setSessionRunning()`。`running` 表示会话 Agent 是否正在执行对话轮次，Run 状态仍由 Run Repository 提供。普通工具调用、工具结果和正文事件不会改变 Harness `0.1.2-rc.1` 的 `SessionSnapshot`，因此 Store 不依赖这些事件触发查询。

只要当前 Session 有实际订阅者，且会话 Agent 正在运行或最近一次成功投影的 `hasActiveRuns` 为 true，Store 就按投影的 `refreshAfterMs` 继续查询。即使最近一次查询返回空列表，或前一批 Run 已全部结束，只要会话 Agent 仍在运行，Store 就继续查询后续 Run。`running` 变化时，Store 立即查询一次；会话 Agent 停止且投影没有活动 Run 后，Store 停止安排计时器。

查询失败时，Store 保留上次成功投影并发布错误码。只要当前 Session 仍有订阅者，并且会话 Agent 正在运行或最近一次成功投影包含活动 Run，Store 就继续重试。首次查询失败时，Store 保留初始空投影；会话 Agent 正在运行且仍有订阅者时，Store 按构造时的刷新间隔安排下一次查询。成功响应清除错误。

相同 Session 的多个消费者共享一份快照和一个轮询周期。用户关闭 details 列后，Harness 可能保留已挂载的组件和 Store 订阅。最后一个消费者注销时，Store 中止请求，清除计时器、运行状态和缓存；Store 释放时对全部 Session 执行这些清理。已取消或被替换的请求不能发布结果或重新启动计时器。重新打开 Session 时，`WorkbenchDetails` 所在的结果列按 Session 与数字 turn 从 Run Repository 恢复 Run 和 Media。
