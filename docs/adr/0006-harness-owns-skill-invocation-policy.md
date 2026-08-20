---
status: accepted
---

# Harness owns Skill Invocation policy

DeepSeek Harness 原生 Skill provider、Skill 声明与 active profile 共同决定是否允许用户显式 Skill Invocation、模型自动 Skill Invocation 或两者同时存在。本项目不实现 Skill 选择 UI，也不增加另一套调用策略；生成服务只处理经过 Harness 授权的实际 Generation Tool Call。
