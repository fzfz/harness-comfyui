# Harness ComfyUI A/B Preset 设计

## 必须实现的目标

当前实验只定义两个项目 Preset：

| 组 | Preset ID | 模型请求中的 Tool schema |
| --- | --- | --- |
| A | `harness-comfyui-schema-control` | `bash`、`skill` 和 5 个 Host 全局项目 Tool |
| B | `harness-comfyui-cli-candidate` | `bash`、`skill` |

A 与 B 必须使用相同的 persona、agent instructions、shell 配置、Tool presentation、Skill filesystem、Skill Tool 和 compaction 配置。两组必须读取同一份 `/Users/fzfz/.agents/skills/comfyui-generate`，并使用同一默认 Workspace、Provider、Model 和用户 Prompt。两组的唯一实验变量是是否向模型请求序列化 5 个 Host 全局项目 Tool schema。

`agent-presets/project-tool-visibility.mjs` 在 Preset 激活时取得当时继承的 Host 全局 Tool 名称。A 使用 `inherit-host-global`；B 使用 `local-only` 并对继承名称建立 Session standing restriction。B 后续注册的 Preset 本地 `bash` 和 `skill` 保持可见。该 restriction 不按 Turn、消息内容或模型输出变化。

## Interface 与身份链路

全局 Skill 的主 `SKILL.md` 负责生成流程，`references/catalog-cli.md` 和 `references/generation-cli.md` 定义 CLI 命令、参数、用途、结果和 ID 来源。Agent 按需读取参考文件后，通过 shell 执行：

```text
node "$DSH_HARNESS_COMFYUI_CLI" catalog ...
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin
```

模型只填写模板、生成模型、LoRA、实例和 Generation Request 等业务参数。CLI 不接收 Workspace ID、Session ID、Turn 或 Tool Call ID。

```text
当前前台 bash ToolExecution
  -> CliShellCapabilityStore 读取 sessionId / turn / callId / cwd
  -> shell environment 注入短期 capability
  -> CLI 使用 capability 调用 loopback Host route
  -> Host 通过 cwd 调用 workspaceRegistry.resolveByPath()
  -> GenerationRuntime.acceptGeneration()
  -> generation_runs.workspace_id / session_id / turn / call_id
```

capability 在 `tools/result` 后失效。后台、无 Agent、缺少匹配 Tool Call 或上下文歧义的 shell execution 不取得 capability。

## 验收清单

- A 的真实 `request/header.tools` 必须包含 7 个名称；B 必须只包含 `bash` 与 `skill`。
- A 与 B 必须调用同一份全局 Skill 和同一项目 CLI。
- B 的模型请求和 CLI argv、stdin 都不得包含 Workspace、Session、Turn 或 Tool Call ID。
- Generation CLI 集成测试必须使用真实 SQLite 并断言四个身份列来自 capability。
- 同一个 Generation Request 必须允许多次独立 submit；每次独立 submit 必须使用不同的前台 shell Tool Call，且重复请求的完整 JSON 必须逐字段相同。每次 CLI 调用必须分别返回 `run_id` 或错误，Host 必须为每次 shell Tool Call 建立独立 Run 身份。
- worktree Host 必须通过 `worktree:status` 与 `worktree:health`，结束时必须停止。

## 非本次目标

- 不定义第三个 C 方案。
- 不切换生产默认 Preset。
- 不删除 Host 中的 5 个项目 Tool 注册。
- 不发布版本、不部署、不推送分支。
- 不修改 Generation preparation 与远端 ComfyUI 连接语义。

## 已获得的授权

- 用户授权在独立 worktree 中实现 B，并在同一 worktree 执行 A。
- 用户授权使用 worktree `.env` 中的 `opencode-go/deepseek-v4-flash` 发起真实模型调用。
- 用户指定默认 Workspace 和 `/Users/fzfz/.agents/skills` 全局 Skill 根目录。
