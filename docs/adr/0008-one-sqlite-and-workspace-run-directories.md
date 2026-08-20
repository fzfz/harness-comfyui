---
status: accepted
---

# One SQLite database and Workspace Run directories

当前 Harness 安装使用一个 SQLite 数据库保存 Generation Run 元数据。每条运行记录必须保存 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id`。运行文件保存在配置数据目录的 `workspaces/<workspace_id>/runs/<run_id>/` 中。数据源仓库不保存本项目的运行、状态、Workflow 或媒体。Workspace 查询与取消使用 SQLite 中的 `workspace_id`，Session 结果查询同时使用 `workspace_id` 与 `session_id`。
