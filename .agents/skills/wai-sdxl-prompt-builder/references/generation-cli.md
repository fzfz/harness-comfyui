# Generation Run Input CLI

## CLI 作用

Harness ComfyUI 管理的 CLI 根据当前前台 shell Tool Call 自动确定 Workspace 和 Session。历史 Generation Run 查询命令读取一个或多个 `run_id` 创建时保存的 `generate_with_comfyui` 参数，并读取该 Run 保存的 Actual Workflow。该命令不查询运行状态，也不创建新的 Generation Run。

## 调用时机

用户要求读取、核对或复用已有 `run_id` 的 Workflow、模板 ID、生成模型、LoRA、Prompt 或其他生成参数时调用该命令。一次请求可以包含 1 至 20 个 `run_id`。单个 `run_id`、多个 `run_id`、重复的 `run_id` 和可能无效的字符串都使用同一命令；CLI 按输入顺序独立查询每一项。

该命令只能在 Harness 提供的前台 shell Tool 调用中执行。调用者不传入 Workspace ID、Session ID、Turn 或 Tool Call ID。

## 用法

把只包含 `run_ids` 的 JSON 对象传入标准输入：

```bash
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{
  "run_ids": ["run_<first-id>", "run_<second-id>"]
}
JSON
```

查询单个 Run 时仍然使用数组：

```bash
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_<id>"]}
JSON
```

`run_ids` 必须是包含 1 至 20 个字符串的数组。数组为空、超过 20 项、包含非字符串元素或标准输入包含其他属性时，CLI 返回非零退出码。

## 成功输出

合法查询请求返回一个 `runs` 数组。数组长度和顺序与输入 `run_ids` 完全一致，重复的 `run_id` 产生重复的结果项。只要顶层查询请求合法，某个 Run 的查询错误不会使整条命令失败；CLI 仍返回退出码 0，并继续返回其他 Run 的结果。

可用结果项包含：

- `run_id`：输入的 Run ID；
- `lookup_status: "available"`；
- `arguments.title`：创建 Run 时传入的标题；
- 可选的 `arguments.instance_id`：创建 Run 时传入的实例 ID；
- `arguments.template_id`：创建 Run 时传入的 Workflow 模板 ID；
- 可选的 `arguments.model`：创建 Run 时传入的生成模型 `id` 和 `file_name`；
- `arguments.parameters`：创建 Run 时传入的全部运行参数，包括当时的 Prompt；
- `arguments.loras`：创建 Run 时传入的全部 LoRA `id`、`file_name`、`weight` 和 `trigger_words`；
- `workflow_status: "available"` 和 `workflow`：该 Run 保存的 Actual Workflow；或者
- `workflow_status: "unavailable"` 和 `workflow_error`：生成参数可用，但 Actual Workflow 没有保存或无法读取。

历史保存记录没有 `loras` 属性时，结果使用 `arguments.loras: []`。该空数组只表示当时保存的 `generate_with_comfyui` 参数没有显式结构化 LoRA 选择，不能证明 Actual Workflow 没有预置或活动 LoRA。历史保存记录没有 `model` 属性时，结果不包含 `arguments.model`；该省略表示当时保存的调用参数没有显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。

单项查询失败时，结果项包含：

```json
{
  "run_id": "<requested-run-id>",
  "lookup_status": "error",
  "error": {
    "code": "<error-code>",
    "message": "<actionable-message>"
  }
}
```

`GENERATION_RUN_ID_INVALID` 表示该字符串不是合法 Run ID；`GENERATION_RUN_NOT_FOUND` 表示当前 Workspace 看不到该 Run；`GENERATION_REQUEST_INVALID` 表示保存的生成请求损坏；`GENERATION_RUN_LOOKUP_FAILED` 表示 Host 读取该项时发生未分类故障。Skill 执行者必须报告该项错误并继续处理 `runs[]` 中的其他项。

## 命令级错误

CLI 返回非零退出码时，标准错误包含 `错误码: 错误消息`。命令级错误表示标准输入、受管 CLI 环境、当前 Workspace 身份或 Host 请求失败。Skill 执行者必须报告标准错误；修正命令输入后可以重试，不能把命令级错误解释为所有 `run_id` 都不存在。
