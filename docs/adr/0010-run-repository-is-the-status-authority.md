---
status: accepted
---

# Run Repository is the status authority

Run Repository 是 Generation Run 状态、错误、Workflow 和 Saved Media 的唯一权威来源。Harness Session 日志只保留原生 Generation Tool Call 与包含 `run_id` 的 Generation Tool Result；Harness ComfyUI Host 插件不写入 `generation.run.created`、`generation.run.updated`、`generation.run.completed`、`generation.run.failed` 或 `generation.run.cancelled` 持久事件。Host 在状态改变后向浏览器发送只包含 `run_id` 的非持久 Run Change Notification，浏览器随后调用 `GenerationRuns.get()` 或 `GenerationRuns.list()` 读取当前状态。重新打开 Session 时，右列按 Workspace、Session 和数字 `turn` 从 Run Repository 恢复结果。
