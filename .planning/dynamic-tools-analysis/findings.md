# 实施事实

- Host 继续全局注册 `query_semantic_comfyui_templates`、`query_semantic_loras`、`query_semantic_generation_models`、`query_semantic_comfyui_instances` 和 `generate_with_comfyui`。
- A 的真实模型请求包含 `bash`、`skill` 和上述 5 个项目 Tool；B 只包含 `bash` 与 `skill`。
- `/Users/fzfz/.agents/skills/comfyui-generate/SKILL.md` 负责流程；`references/catalog-cli.md` 和 `references/generation-cli.md` 定义 CLI。
- CLI request contract 不包含 Workspace、Session、Turn 或 Tool Call ID。
- `CliShellCapabilityStore` 从当前前台 shell ToolExecution 读取 `sessionId`、`turn`、`callId` 和 `cwd`。
- Host route 使用 `cwd` 调用 `workspaceRegistry.resolveByPath()`，再调用 `GenerationRuntime.acceptGeneration()`。
- SQLite 集成测试与真实 B Session 都证明 `generation_runs` 的四个身份列来自 Host execution context。
- 远端 ComfyUI 实例恢复后，真实 B Session 通过两个独立 Bash Tool Call 提交完全相同的 Generation Request JSON；两个 Run 均成功完成并各保存一张 512×512 PNG。
- 全局 Skill 和 Generation CLI 参考文档允许同一个 Generation Request 多次独立提交；每次独立提交使用不同的前台 shell Tool Call，并分别记录 `run_id` 或错误。
- 兼容性 A/B 结果：A 3/3 正确，B 3/3 正确；B 平均总输入少 20.6%，平均耗时少 27.8%。
