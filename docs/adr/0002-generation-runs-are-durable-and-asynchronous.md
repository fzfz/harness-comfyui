---
文档用途: 记录 Generation Run 的持久接纳、异步执行与恢复决策。
读取时机: 修改生成接纳、任务恢复或取消行为前。
status: accepted
---

# Generation Run 持久接纳与异步执行

## 1. 接纳与执行

1. 受管 CLI 提交清单后，Runtime 在同一事务中持久接纳请求。事务提交后，调用方取得各项接纳结果；coordinator 继续准备与执行 Run。接口入口见[生成生命周期](../system/architecture.md#generation-run-生命周期与历史查询)。
2. 准备失败和执行失败保存在对应 Run，其他 Run 继续执行。调用方通过 Generation Run Media Query 读取结果；术语见 [CONTEXT.md](../../CONTEXT.md#生成记录与媒体)。

## 2. 恢复与取消

1. 前台 Tool Call 结束后，Host 继续处理已接纳请求。Host 停止时，远端任务可继续执行；Host 重启后，coordinator 从持久记录恢复非终态 Run。
2. 数据源不可用时，历史 Run、Workflow 与媒体仍由 Plugin Storage 提供。
3. 取消操作以活动远端任务为目标。Runtime 根据取消响应与远端回读确定最终状态，并保存已有记录和产物。
4. `submission_unknown` 保持结果不明状态。用户确认可能重复执行后，Agent 才创建替代请求。请求标识规则见 [ADR 0005](0005-harness-identities-and-generation-run-ownership.md#2-请求身份与重放)。
