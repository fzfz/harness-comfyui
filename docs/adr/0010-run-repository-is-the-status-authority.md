---
文档用途: 记录 Run 状态来源、查询投影与 Client 刷新职责。
读取时机: 修改 Run 查询、状态投影或 Client 刷新行为前。
status: accepted
---

# Run Repository 状态与查询投影

## 1. 状态来源

1. Run Repository 是 Run 状态与错误的唯一权威来源。受管 CLI 与 Client Remote 读取同一持久记录。Workflow 与 Saved Media 的存储职责见[生成生命周期与历史查询](../system/architecture.md#generation-run-生命周期与历史查询)。
2. Generation Run Media Query 默认返回状态、错误与媒体路径，显式请求时附带参数。历史输入查询提供保存的参数与 Actual Workflow。合同入口见[生成生命周期与历史查询](../system/architecture.md#generation-run-生命周期与历史查询)。
3. Session 日志记录原生 shell Tool Call 和调用结果；Run 的执行状态由 Run Repository 持续保存。

## 2. Client 查询与刷新

1. Client 通过 `harnessComfyuiGeneration.list()` 读取当前 Session 及可访问后代的 Run 与媒体投影。访问范围见[Client 结果与媒体访问](../system/architecture.md#client-工作台结果与媒体访问)。
2. [GenerationProjectionStore](../../src/client/workbench/generation-store.ts) 统一管理同一 Session 的查询、刷新、错误和资源释放。
