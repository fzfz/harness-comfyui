---
文档用途: 记录 Run Repository 与 Workspace 运行目录的存储决策。
读取时机: 修改生成记录、文件存储或访问范围前。
status: accepted
---

# Run Repository 与 Workspace 运行目录

## 1. 持久记录

1. 每个 Plugin Storage 使用一份 SQLite 数据库保存 Generation Run 元数据。每条 Run 保存 `workspace_id`、`session_id`、数字 `turn`、`call_id`、`request_id` 和 `run_id`。身份用途见 [ADR 0005](0005-harness-identities-and-generation-run-ownership.md)。
2. 接纳事务与请求唯一约束统一由 Runtime 管理。记录结构与迁移入口见 [GenerationRuntime](../../src/host/generation/generation-runtime.ts)。

## 2. 文件与查询范围

1. Run 文件保存在配置目录中的 `workspaces/<workspace_id>/runs/<run_id>/`。请求、来源快照、Workflow 与媒体的目录配置见[Configuration Profile 字段](../system/configuration.md#configuration-profile-字段)。
2. Workspace 查询与取消按 `workspace_id` 限定。Session 结果查询同时限定 Workspace 与会话访问范围，规则见[Client 结果与媒体访问](../system/architecture.md#client-工作台结果与媒体访问)。
