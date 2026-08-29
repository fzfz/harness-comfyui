# Harness ComfyUI v0.34.1

v0.34.1 为历史 Generation Run 输入查询增加短 Run ID 支持。Agent 可以把完整 `run_<uuid>` 或 `run_` 加最少八个 UUID 起始字符传给 `read_comfyui_run_inputs` Tool 或 managed CLI。

## 短 Run ID 查询

- `read_comfyui_run_inputs` 与 `generation run-inputs --stdin` 都接受 1 至 20 个完整或短 Run ID。
- Runtime 先查找当前 Workspace 中的完整 ID 精确匹配；短 ID 只匹配当前 Workspace 中以该值开头的完整 Run ID。
- 短 ID 唯一匹配时，成功项的 `run_id` 返回完整 canonical Run ID，并继续返回创建 Run 时保存的全部 `generate_with_comfyui` 参数与 Actual Workflow。
- 短 ID 没有匹配时，该项返回 `GENERATION_RUN_NOT_FOUND`；短 ID 匹配多个 Run 时，该项返回 `GENERATION_RUN_ID_AMBIGUOUS` 并要求增加前缀字符。
- 当前 Workspace 之外的同前缀 Run 不参与唯一性判定，查询结果不泄露其他 Workspace 是否存在匹配 Run。

## 批量错误隔离

- 输入顺序和重复项保持不变。无效短 ID、无匹配短 ID、歧义短 ID、损坏请求或读取故障只影响对应结果项。
- 合法批量请求即使包含单项错误也返回退出码 0；调用者继续处理 `runs[]` 中的其他成功项。
- 空数组、超过 20 项、非字符串数组元素、额外请求属性和无效执行身份仍属于命令级错误。

## Skill 与兼容性

- `anima-prompt-builder`、`character-portrait-prompt-designer`、`comfyui-generate` 和 `wai-sdxl-prompt-builder` 的 Generation CLI 参考都说明完整 ID、短 ID、唯一匹配、canonical ID 返回和歧义处理。
- v0.34.0 的历史 `loras`、`model`、Actual Workflow 与逐项错误语义保持不变。
- 本版本没有新增 npm 依赖，没有修改 SQLite schema，也没有改变 `generate_with_comfyui` 请求结构。

## 验证

- 自动化测试覆盖完整 ID、唯一短前缀、无匹配短前缀、歧义短前缀、其他 Workspace 同前缀隔离、canonical ID 返回和批量继续处理。
- 完整 `pnpm quality` 已通过：471 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.92%、branches 86.04%、functions 100%、lines 95.31%；依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- Standards、Spec 和语义独立审查均通过。独立 worktree Host 的 0.34.1 `status` 与 `health` 通过，浏览器确认系统直接使用 DeepSeek V4 Flash 并打开配置的启动 Workspace；GitHub CI 仍必须验证发布提交。生产部署与用户十个短 ID 的真实查询在 GitHub Release 创建后执行。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
