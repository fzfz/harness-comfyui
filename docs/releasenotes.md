# Harness ComfyUI v0.31.3

v0.31.3 修复 Workflow 模板 42 `turboloar_4步加速_另加一个lora_krea2` 的 `positive_prompt` 编译失败。该模板把正向 Prompt 保存在上游 `StringConcatenate.string_a`，再通过连线送入 `CLIPTextEncode.text`；该输入名称不属于原有 Prompt 输入别名，因此 v0.31.2 返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。

## Prompt 目标解析

- Workflow compiler 继续优先使用公开参数键和已有 Prompt 输入别名。找不到这些输入名称时，compiler 从目标 ComfyUI 实例实时 `/object_info` 中选择类型为 `STRING` 且 `multiline=true` 的未连接 widget，并要求该 widget 的下游执行路径符合正向或负向 Prompt 极性。
- 新解析路径继续执行活动节点、bypass、下游连线、节点编号后缀、正负 Prompt 极性、已占用目标和歧义检查。多个 multiline `STRING` widget 同时符合条件时，compiler 返回 `GENERATION_PARAMETER_TARGET_AMBIGUOUS` 并列出具体 ComfyUI 节点输入。
- 本次修改不包含 Workflow 模板 ID、ComfyUI 节点 ID 或 ComfyUI 节点类型特例，也不读取 Source 模板记录中的 `parameters_json` 或 `bindings_json`。

## 验证

- 保存的失败 Run `run_8a0642e4-43c8-4c5d-a54f-988a2a61050a` 请求已使用当前 Source 模板 42、实例 122 实时 `/object_info`、原 `positive_prompt`、原 Seed 和两个 LoRA 重新执行 Workflow 编译；修复后的编译结果通过。
- 实例 122 的当前 Source Catalog 包含 21 个 Workflow 模板。真实矩阵逐模板验证 15 个公开参数，共 315 项结果全部符合 [`config/verification/comfyui-workflow-parameter-support.json`](https://github.com/fzfz/harness-comfyui/blob/v0.31.3/config/verification/comfyui-workflow-parameter-support.json) 中的精确非空支持集合。
- 21 个模板各自把全部受支持参数组合提交给 Workflow compiler，全部通过。21 个模板还分别完成真实 ComfyUI 页面 Official API Workflow cache miss、同模板 cache hit 和基础对象一致性验证。
- 独立 worktree Host 的 `worktree:status` 与 `worktree:health` 通过。模板 42 的成功用例验证 `StringConcatenate.string_a` 被替换，同时保留 `string_b` 的上游连接、delimiter 和 `CLIPTextEncode.text` 的连接；歧义用例验证两个可执行 multiline `STRING` 候选会被拒绝。
- 完整 `pnpm quality` 已通过：406 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
