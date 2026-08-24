## 2026-08-24 完整用户消息解析修订（唯一最新规范）

- 不可变实施计划：[Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)
- `anima-prompt-builder`、`wai-sdxl-prompt-builder`和 `lora-adjustment`必须扫描完整当前 user message中的 schema有效 `generation-context.v1` block。
- 三个 Skill不得假设 Context block位于用户正文末尾，不得按消息尾部截取 Context block。
- 三个 Skill必须按 schema有效 `generation-context.v1` block在完整当前 user message中的出现顺序读取 Message Context。Issue #4的 parser负责保留用户正文中的空格与换行。
- 计划执行者必须同步修改 `docs/v0.1/PRDS/12-prompt-skills.md`和对应真实 Harness Skill黑盒测试。

本节替代本 Issue与 PRD 12中依赖 Context block位于用户正文末尾的冲突条款。GitHub Issue #12负责多媒体结果交付，不承担 Prompt Skill解析合同。
