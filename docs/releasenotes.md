# Harness ComfyUI v0.33.2

v0.33.2 把项目提供的新 Session Preset roster 收敛为一个用户可选项，用户可见名称为 `ComfyUI工作台预设`。该修复保留现有内部 ID、默认选择、Session 引用、Host 项目 Tool 注册和数据库记录。

## ComfyUI 工作台 Preset

- 产品 Preset 的显示名称是 `ComfyUI工作台预设`。兼容性内部 ID `harness-comfyui-cli-candidate` 保持不变，因此已经选择该 Preset 的默认配置和 Session 日志不需要迁移。
- 新 Session roster 只包含一个本项目提供的 Preset。启动准备会删除本项目已经退役的 `harness-comfyui-schema-control` 目录，并保留同一 DSH home 中的其他 Preset。
- Tool schema 对照 composition 只保留在 `tests/fixtures/agent-presets/` 中，用于回归测试；production 与 worktree 启动器不会物化该测试夹具。
- Host 继续注册模板、LoRA、生成模型、ComfyUI 实例和图片生成这 5 个项目 Tool。`ComfyUI工作台预设` 不把这些项目 Tool schema 提供给模型；Agent 按需读取全局 `comfyui-generate` Skill 的 CLI 参考文档，再通过项目 managed CLI 完成目录查询、ID 获取和图片生成提交。
- 启动器不会修改 Harness 默认 Preset。使用其他 Preset 的 Session 继续使用 Host 已注册的项目 Tool。

## 兼容性与质量验证

- `config/product-agent.json` 现在只声明一个产品 Preset，并通过 `retiredManagedPresetIds` 精确声明需要清理的项目 Preset ID。启动器删除退役 Preset 符号链接时只删除链接本身，不改变外部目标。
- 完整 `pnpm quality` 已通过：447 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有新增 npm 依赖，没有修改 `pnpm-lock.yaml`，没有数据库迁移，也没有修改已有 Session 日志。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
