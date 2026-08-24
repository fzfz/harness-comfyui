---
status: accepted
---

# Run Repository is the status authority

Run Repository 是 Generation Run 状态、错误、Workflow 和 Saved Media 的唯一权威来源。Harness Session 日志只保留原生 Generation Tool Call 与包含 `run_id` 的 Generation Tool Result；Harness ComfyUI Host 插件不写入 `generation.run.created`、`generation.run.updated`、`generation.run.completed`、`generation.run.failed` 或 `generation.run.cancelled` 持久事件。

DeepSeek Harness `0.1.1-rc.2` 的公开 Host→Client forwarded-event allowlist 不包含项目 Run 事件。当前项目不修改该 allowlist，也不发送 `generation.run.changed`。项目 Client plugin 在结果列存在可见消费者时，通过项目 unary Typert Remote `harnessComfyuiGeneration.list()`读取当前 Session 的 Run 与 Media 投影，并由唯一 `GenerationProjectionStore` 按 Remote 返回的 `refreshAfterMs`继续查询。相同 Session 的多个消费者共享一份快照和一个轮询周期；最后一个消费者注销时中止请求、清除计时器和该 Session 缓存。重新打开 Session 时，右列按 Session 与数字 turn 从 Run Repository 恢复 Run 和 Media。
