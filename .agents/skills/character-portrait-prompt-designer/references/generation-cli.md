# Generation Run Input CLI

## CLI 作用

历史 Generation Run 查询命令只读取一个或多个 `run_id` 创建时保存的生成请求参数，以及对应 Run 保存的 Actual Workflow（实际执行的工作流）。

## 调用时机

用户要求读取、核对或复用已有 `run_id` 的 Workflow、模板 ID、生成模型、LoRA、Prompt 或其他生成参数时，Skill 执行者调用该命令。Run ID 支持完整 ID 和短 ID；短 ID 由 `run_` 和完整 UUID 的起始片段组成，该片段至少包含前八个 UUID 字符。

Skill 执行者必须通过 Harness 提供的前台 shell Tool 调用，在当前会话的 Workspace 工作目录执行该命令。

## 用法

把只包含 `run_ids` 的 JSON 对象传入标准输入：

```bash
node "$DSH_HARNESS_COMFYUI_CLI" --quiet generation run-inputs --stdin <<'JSON'
{
  "run_ids": ["run_3c0ad3ed", "run_d26923be"]
}
JSON
```

`run_ids` 必须是包含 1 至 20 个字符串的数组。数组为空、超过 20 项、包含非字符串元素或标准输入包含其他属性时，CLI 返回非零退出码。

短 Run ID 只匹配当前 Workspace 中以该值开头的完整 Run ID。唯一匹配时查询成功；没有匹配时该项返回不存在错误；匹配多个 Run 时该项返回歧义错误，调用者在短 ID 后增加更多完整 Run ID 字符后重试。

## 查询输出

合法查询请求返回一个 `runs` 数组。数组长度和顺序与输入 `run_ids` 完全一致，重复的 `run_id` 产生重复的结果项。只要顶层查询请求合法，某个 Run 的查询错误不会使整条命令失败；CLI 仍返回退出码 0，并继续返回其他 Run 的结果。

可用结果项包含：

- `run_id`：匹配到的完整 Run ID；
- `lookup_status: "available"`；
- `arguments.title`：创建 Run 时传入的标题；
- 可选的 `arguments.instance_id`：创建 Run 时传入的实例 ID；
- `arguments.template_id`：创建 Run 时传入的 Workflow 模板 ID；
- 可选的 `arguments.model`：创建 Run 时传入的生成模型 `id` 和 `file_name`；
- `arguments.parameters`：创建 Run 时传入的全部运行参数，包括当时的 Prompt；
- `arguments.loras`：创建 Run 时传入的全部 LoRA `id`、`file_name`、`weight` 和 `trigger_words`；
- `workflow_status: "available"` 和 `workflow`：该 Run 保存的 Actual Workflow；或者
- `workflow_status: "unavailable"` 和 `workflow_error`：生成参数可用，但 Actual Workflow 没有保存或无法读取。

历史保存记录没有 `loras` 属性时，结果使用 `arguments.loras: []`。该空数组只表示当时保存的调用参数没有显式结构化 LoRA 选择；Skill 执行者必须依据 Actual Workflow 判断其中预置或活动的 LoRA。历史保存记录没有 `model` 属性时，结果不包含 `arguments.model`；该省略表示当时保存的调用参数没有显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。

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

单项查询错误码的含义如下：

- `GENERATION_RUN_ID_INVALID`：输入包含不安全字符，或短 ID 的 UUID 片段格式、长度不符合要求。
- `GENERATION_RUN_ID_AMBIGUOUS`：短 ID 在当前 Workspace 中匹配多个 Run；Skill 执行者按照“用法”一节补全短 ID 后重试。
- `GENERATION_RUN_NOT_FOUND`：当前 Workspace 中没有与输入匹配的 Run。
- `GENERATION_REQUEST_INVALID`：保存的生成请求损坏。
- `GENERATION_RUN_LOOKUP_FAILED`：服务读取该项时发生未分类故障。

Skill 执行者必须报告失败项的错误，并继续处理 `runs[]` 中的其他项。

## 命令级错误

CLI 返回非零退出码时，标准错误包含 `错误码: 错误消息`。命令级错误表示标准输入、受管 CLI 环境、当前 Workspace 身份或服务请求存在问题。Skill 执行者必须报告标准错误，并按错误类型处理：输入错误由 Skill 执行者修正后重试；环境或身份错误由用户修复受管会话环境后，Skill 执行者重新调用；服务请求错误由用户按照错误消息检查服务并决定是否重新查询。Skill 执行者必须依据单项查询结果判断对应 `run_id` 是否存在。

## 帮助与操作提示

需要逐层查看能力、命令和输入示例时，Skill 执行者从 `node "$DSH_HARNESS_COMFYUI_CLI" --help` 开始，按“下一步”进入分类和命令帮助。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 操作提示，退出码仍为 `0`。
