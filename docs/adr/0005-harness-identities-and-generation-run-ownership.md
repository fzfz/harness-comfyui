---
status: accepted
---

# Harness identities and Generation Run ownership

本项目使用 DeepSeek Harness 原生的 Session、数字 turn 和 callId 标识对话与 Tool Call，不创建平行字符串 turn_id。Generation Run 服务只在 Agent 实际调用生成 Tool 后创建 run_id，并把 Harness callId 与 run_id 的关联写入持久运行记录和 Tool 结构化结果；浏览器发送消息时不预分配 run_id。
