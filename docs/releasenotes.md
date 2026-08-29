# Harness ComfyUI v0.33.0

v0.33.0 新增两个可选的 ComfyUI Agent Preset 和受管项目 CLI。A 组保留 5 个 Host 项目 Tool schema；B 组只向模型暴露 shell 与 Skill Tool，并由全局 Skill 按需读取 CLI 参考文档。版本不改变 Harness 默认 Preset，也不删除现有 Host Tool。

## 可选 Agent Preset

- `harness-comfyui-schema-control` 是 A 组。模型请求包含 shell、Skill 和 5 个 Host 项目 Tool schema。
- `harness-comfyui-cli-candidate` 是 B 组。模型请求只包含 shell 与 Skill Tool；Catalog resolve 和 Generation submit 由全局 `comfyui-generate` Skill 通过 managed CLI 完成。
- A/B 实测的 CLI-compatible 全局 `comfyui-generate` Skill 由 Harness 用户安装在 `$HOME/.agents/skills/comfyui-generate/`，并从该目录提供 CLI 用途、参数和 ID 获取方式的参考文档。v0.33.0 不复制或发布该全局 Skill。未安装该全局 Skill 时，两个 Preset 仍会物化，项目 managed CLI 仍可通过 shell 直接调用；当当前 Workspace 也不提供同名 Workspace Skill 时，Skill roster 中不会出现 `comfyui-generate`。以本仓库为 Workspace 时，仓库内 `.agents/skills/comfyui-generate/` 可能提供同名 Skill，但该仓库 Skill 不是本次 A/B 实测的全局 CLI-compatible Skill。
- `prod:start`、`prod:restart`、`worktree:start` 和 `worktree:restart` 在 Host 启动前校验两个 Preset、共享 Tool visibility component 和全部 DSH composition，再原子物化受管文件。物化过程保留同一 DSH home 中的其他 Preset；失败时不写入受管运行状态，也不启动 Host。
- 两个项目 Preset 出现在新 Session 的可选 roster 中，发布过程不把任一项目 Preset 设为默认值。已有 Session、原生 Host Tool 路径和数据库记录继续保持原行为。

## Managed CLI 与运行身份

- Host 为前台 shell ToolExecution 签发短期 capability，并通过当前 ToolExecution 取得 Session、Turn、Tool Call ID 和工作目录。Host 使用工作目录解析 Workspace，再把完整运行归属写入 SQLite。
- Generation Request 只包含标题、ComfyUI 实例 ID、Workflow 模板 ID、可选生成模型、运行参数和 LoRA；模型不填写 Workspace、Session、Turn 或 Tool Call ID。
- 同一个前台 shell Tool Call 重放相同 Generation Request 时返回原 `run_id`；该 Tool Call 改交不同请求时返回 `RUN_REQUEST_CONFLICT`。同一个 Generation Request 可以通过多个独立前台 shell Tool Call 多次提交，每次提交创建不同的 `call_id` 和 `run_id`。
- managed CLI 提供模板、生成模型、LoRA 和 ComfyUI 实例目录查询，以及异步 Generation submit。CLI 返回 `run_id` 只表示 Host 已接受异步运行；最终状态仍来自 Generation Run 状态证据。

## 真实模型与质量验证

- 使用 `opencode-go/deepseek-v4-flash` 完成 3 对相同兼容性任务。A 与 B 均为 3/3 正确；B 的平均总输入 token 比 A 少 20.6%，平均耗时少 27.8%。A 的 serialized Tool JSON 为 7,458 bytes，B 为 3,401 bytes，减少 54.4%。这些小样本结果只作为当前任务集的行为与成本证据，不代表统计显著性。
- B 的真实生成 Session 使用两个独立 Bash Tool Call 提交逐字段完全相同的 Generation Request。SQLite 保存 2 个 Run、1 个 distinct `request_json`、2 个 distinct `call_id` 和 2 个 distinct `run_id`；两个远端 ComfyUI Run 均成功并各保存一张 512×512 PNG。
- 完整 `pnpm quality` 已通过：445 项 unit/integration、24 项 contract/security、59 项 production 和 32 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有新增 npm 依赖，没有修改 `pnpm-lock.yaml`，没有数据库迁移，也没有切换默认 Preset。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
