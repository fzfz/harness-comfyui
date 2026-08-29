# Generation CLI

## CLI 作用与调用环境

Harness ComfyUI 管理的 CLI 根据当前前台 shell Tool Call 自动确定 Workspace 和 Session。该 CLI 可以提交新的异步 Generation Run，也可以按一个或多个 `run_id` 读取 Run 创建时保存的 `generate_with_comfyui` 参数和 Actual Workflow。

以下命令只能在 Harness 提供的前台 shell Tool 调用中执行。调用者不传入 Workspace ID、Session ID、Turn 或 Tool Call ID。

## 查询历史 Generation Run

用户要求读取、核对或复用已有 `run_id` 的 Workflow、模板 ID、生成模型、LoRA、Prompt 或其他生成参数时调用查询命令。一次请求可以包含 1 至 20 个 `run_id`。单个 `run_id`、多个 `run_id`、重复的 `run_id` 和可能无效的字符串都使用同一命令；CLI 按输入顺序独立查询每一项。

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

CLI 返回非零退出码时，标准错误包含 `错误码: 错误消息`。命令级错误表示标准输入、受管 CLI 环境、当前 Workspace 身份或 Host 请求失败。Skill 执行者必须报告标准错误；修正命令输入后可以重试，不能把命令级错误解释为所有 `run_id` 都不存在。

## 提交命令

用户明确要求创建新的 Generation Run，且模板、可选生成模型与全部 LoRA 的兼容性已经核对、已经从当前实例目录取得实例 ID、最终 Prompt 已经完成核对时调用提交命令。用户只要求查询已有 `run_id` 时不调用提交命令。

把一个 Generation Request JSON 对象传入标准输入：

```bash
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{
  "title": "角色立绘",
  "instance_id": "2",
  "template_id": "39",
  "model": {
    "id": "3",
    "file_name": "anima-aesthetic-v1.1.safetensors"
  },
  "parameters": {
    "positive_prompt": "1girl, portrait",
    "width": 1024,
    "height": 1024
  },
  "loras": [
    {
      "id": "91",
      "file_name": "example.safetensors",
      "weight": 0.8,
      "trigger_words": ["example trigger"]
    }
  ]
}
JSON
```

成功输出：

```json
{"run_id":"<durable-run-id>"}
```

命令返回 `run_id` 后表示项目已经接受异步 Generation Run；该命令不等待远端 ComfyUI 完成。

同一个 Generation Request 可以多次调用本命令。用户没有声明重复提交次数时默认调用一次；默认一次不是提交次数上限。用户明确要求多个 Run 时按要求次数调用。每次独立提交使用单独的前台 shell Tool Call，并分别产生成功的 `run_id` 或失败结果。同一前台 shell Tool Call 使用同一个执行身份，不代表多个独立提交。重复提交同一个 Generation Request 时，每次调用的完整 JSON 必须逐字段相同，包括 `title`、`instance_id`、`template_id`、`model`、`parameters` 和 `loras`。某次调用失败后可以再次提交同一个请求。

命令返回非零退出码时记录标准错误。该次错误报告使用：“CLI 未返回 `run_id`；项目可能已经持久化失败 Run，不能据此判断不存在 Run。”再次提交不会改变前一次调用可能已经持久化的 Run；汇总结果必须分别列出每次调用返回的 `run_id` 或错误。

## Generation Request 数据结构

- `title`：非空运行标题；
- `instance_id`：当前 `catalog instance list` 的 `results[0].id`；
- `template_id`：当前消息中 Workflow 模板的 `data.id`；
- `model`：所选生成模型 resolve 结果的 `id` 和 `file_name`；没有选择生成模型时必须是 `null`；
- `parameters`：Workflow 运行参数 JSON 对象；
- `loras`：LoRA 执行对象数组；没有 LoRA 时使用空数组。

每个 `loras` 项必须包含：

- `id`：LoRA resolve 结果的 ID；
- `file_name`：LoRA resolve 结果的文件名；
- `weight`：当前结果使用的有限数字权重；
- `trigger_words`：当前最终 Prompt 实际采用的触发词字符串数组。

## 标准语义运行参数

`parameters` 可以使用以下标准语义名称：

- `positive_prompt`
- `negative_prompt`
- `seed`
- `steps`
- `cfg`
- `width`
- `height`
- `batch_size`
- `denoise`
- `sampler_name`
- `scheduler`

用户明确给出 Workflow 输入名时，也可以把该输入名直接作为 `parameters` 属性名。字符串值使用 JSON 字符串，整数值使用 JSON 整数，数值使用 JSON 数字，布尔值使用 `true` 或 `false`。

## ID 来源

Generation Request 不包含 Workspace ID、Session ID、Turn 或 Tool Call ID。调用者不得添加这些属性。运行归属由当前前台 shell Tool 调用自动确定。

模板、生成模型和 LoRA ID 来自当前消息上下文及对应 resolve 结果。实例 ID 来自当前 `catalog instance list` 结果。缺少任一必需 ID 时停止提交并说明缺少的选择或查询结果，不编造 ID。
