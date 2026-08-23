---
status: accepted
---

# Run Repository is the status authority

Run Repository 是 Generation Run 状态、错误、Workflow 和 Saved Media 的唯一权威来源。Harness Session 日志只保留原生 Generation Tool Call 与包含 `run_id` 的 Generation Tool Result；Harness ComfyUI Host 插件不写入 `generation.run.created`、`generation.run.updated`、`generation.run.completed`、`generation.run.failed` 或 `generation.run.cancelled` 持久事件。

DeepSeek Harness `0.1.0-rc.8` 的公开 Host→Client forwarded-event allowlist 不包含项目 Run 事件。当前项目不修改该 allowlist，也不发送 `generation.run.changed`。项目Client plugin在遇到合法Generation Tool Result、打开右列、切换Session、切换数字`turn`和取消后，通过项目unary Typert Remote立即调用`GenerationRuns.get()`或`GenerationRuns.list()`。页面可见且中列可见Generation Tool行或右列可见运行卡观察非终态Run时，唯一`GenerationRunProjectionStore`按Remote response的`refreshAfterMs`继续查询；两处同时可见时每周期只查询一次。关闭右列但中列Tool行仍可见时继续查询；页面隐藏、两处都没有可见消费者或全部运行终态时停止。重新打开Session时，中列和右列按Workspace、Session、数字`turn`与`run_id`从Run Repository恢复同一快照。
