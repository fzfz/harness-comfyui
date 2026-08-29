# Harness ComfyUI v0.34.0

v0.34.0 增加历史 Generation Run 输入查询。Agent 可以使用 `read_comfyui_run_inputs` Tool 或 managed CLI，按一个或多个 `run_id` 读取创建 Run 时传入 `generate_with_comfyui` 的完整参数和该 Run 保存的 Actual Workflow。

## 历史 Run 查询

- `read_comfyui_run_inputs` 接收 1 至 20 个 `run_id`，并按输入顺序返回相同数量的结果项。重复 ID 保留重复结果。
- 每个可用结果包含 `title`、可选 `instance_id`、`template_id`、可选 `model`、完整 `parameters`、全部 `loras` 和 Actual Workflow。`parameters` 包含创建 Run 时保存的 Prompt 与其他运行参数。
- 历史请求没有保存 `loras` 属性时返回 `loras: []`；该空数组只表示调用参数没有保存显式结构化 LoRA 选择，不能证明 Actual Workflow 没有预置或活动 LoRA。历史请求没有保存 `model` 属性时不返回 `model`；该省略表示调用参数没有保存显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。
- Actual Workflow 尚未保存、文件缺失或文件无效时，结果仍返回创建 Run 时保存的参数，并通过 `workflow_status: "unavailable"` 和 `workflow_error` 说明 Workflow 错误。

## 批量错误隔离

- 无效 ID、当前 Workspace 中不存在的 Run、损坏的请求记录和未分类读取故障只影响对应的结果项。Host 继续查询批量请求中的其余 `run_id`。
- 当前 Workspace 之外的 Run 与不存在的 Run 都返回 `GENERATION_RUN_NOT_FOUND`，不会暴露其他 Workspace 中是否存在该 ID。
- managed CLI 的命令是 `generation run-inputs --stdin`。合法批量请求即使包含单项错误也返回退出码 0；调用者根据 `runs[].lookup_status` 处理每一项。
- 空数组、超过 20 项、非字符串数组元素、无效请求属性和无效执行身份属于命令级错误，不进入逐项结果。

## Skill 与全局链接

- `anima-prompt-builder`、`character-portrait-prompt-designer`、`comfyui-generate` 和 `wai-sdxl-prompt-builder` 都能独立响应历史 `run_id` 查询，不要求先进入 `comfyui-generate`。
- 四个 Skill 都包含 `references/generation-cli.md`。每份参考文档明确说明 CLI 的作用、调用时机、命令用法、结果结构、逐项错误和命令级错误。
- 主开发 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/<skill-name>` 是四个 Skill 的 canonical source。发布后，全局 `$HOME/.agents/skills/<skill-name>` 通过绝对符号链接指向该主开发 checkout 中对应目录，不得指向独立 linked worktree；切换前逐个比较目录条目类型、相对路径、符号链接目标和普通文件 SHA-256，并保留可恢复备份。

## 验证与兼容性

- 自动化测试覆盖 Tool、CLI、Runtime、项目 Tool 注册、批量顺序、重复 ID、逐项错误、历史请求属性缺失、Workflow 不可用、取消传播和错误脱敏。
- 完整 `pnpm quality` 已通过：470 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.87%、branches 85.93%、functions 100%、lines 95.28%；依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- v0.33.2 的单一 `ComfyUI工作台预设`、兼容性内部 ID 和退役 Preset 清理行为保持不变；Host 项目 Tool 注册数量从 5 个增加到 6 个。
- 本版本没有新增 npm 依赖，没有修改数据库 schema，也没有改变已有 `generate_with_comfyui` 请求结构。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
