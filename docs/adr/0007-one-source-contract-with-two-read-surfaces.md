---
status: accepted
---

# One source contract with two read surfaces

数据源仓库使用一个权威 OpenAPI schema 定义稳定 ID、revision、共用数据结构和错误结构，但从该 schema 投影两个只读 discovery/CLI 表面。现有语义 CLI 只暴露 Agent 安全的 Catalog Operation；Host 专用的本机只读 CLI 只暴露实例连接和完整模板 bundle 等 Source Operation。DeepSeek Harness 只把 Catalog Operation 注册为 Agent Tool，并且不把 Source Operation 注册为 Agent Tool、Skill Tool 或浏览器 RPC。`audience` 元数据只负责 discovery 投影和 Harness Tool 注册分类。本版本不认证调用 Source Operation 的其他本机进程，也不把其他本机进程读取该只读表面列为威胁模型。
