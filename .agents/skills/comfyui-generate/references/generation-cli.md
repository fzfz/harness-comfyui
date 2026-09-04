# Generation CLI

## CLI 用途

- `generation run-inputs --stdin` 查询一个或多个 Generation Run 保存的生成参数和 Actual Workflow。
- `generation random-seeds --stdin` 返回指定数量且互不相同的 Seed 整数。
- `generation submit --stdin` 创建一项异步 Generation Run。

## 调用入口

`DSH_HARNESS_COMFYUI_CLI` 保存 Generation CLI 入口脚本路径。Skill 执行者使用以下入口调用三个命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation random-seeds --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin
```

## 命令与调用条件

- 用户要求查询、核对或复用一个或多个 `run_id` 保存的生成参数或 Actual Workflow 时，Skill 执行者调用 `generation run-inputs --stdin`。
- 一张或多张图片没有使用用户给出的 Seed 或历史 Generation Run 保存的 Seed 时，Skill 执行者调用一次 `generation random-seeds --stdin`，并使 `count` 等于这些图片的数量。
- 每张图片的 Generation Request 通过全部参数检查后，Skill 执行者为该图片调用一次 `generation submit --stdin`。

## 参数与标准输入

### 查询 Generation Run

`generation run-inputs --stdin` 的标准输入是只包含 `run_ids` 的 JSON 对象。`run_ids` 是包含 1 至 20 个字符串的数组。每个字符串可以是完整 Run ID，也可以是 `run_` 加 canonical UUID 起始片段的短 Run ID；UUID 起始片段至少包含八个字符。命令按照数组顺序查询每一项，并保留重复项。

### 取得 Seed

`generation random-seeds --stdin` 的标准输入是只包含 `count` 的 JSON 对象。`count` 是 1 至 20 的整数，并等于本次需要命令返回 Seed 的图片数量。

### 提交 Generation Request

`generation submit --stdin` 的标准输入是包含以下六个属性的 JSON 对象：

- `title` 必须是包含 1 至 500 个字符且不含控制字符的运行标题。
- `instance_id` 保存 ComfyUI 实例 ID。
- `template_id` 保存 Workflow 模板 ID。
- `model` 必须是包含所选生成模型 `id` 和 `file_name` 的 JSON 对象；没有选择生成模型时，`model` 必须是 `null`。
- `parameters` 必须是以 Workflow 参数检查结果中的 `parameter_id` 为属性名的 JSON 对象。
- `loras` 必须是按用户指定顺序排列的 LoRA 数组，并且最多包含 100 项；没有选择 LoRA 时，`loras` 必须是空数组。每项 LoRA 必须包含 `id`、`file_name`、有限数字 `weight` 和不重复的 `trigger_words` 字符串数组；`trigger_words` 最多包含 100 项，每个字符串必须包含 1 至 500 个字符且不含控制字符。

`parameters` 使用 Workflow 参数检查结果中 `kind` 分别为 `positive_prompt`、`seed` 和 `batch_size` 的唯一项目的 `parameter_id` 作为属性名。结果 JSON 的 `negative_mode` 为 `native_negative` 时，负向 Prompt 写入 `kind` 为 `negative_prompt` 的唯一项目的 `parameter_id` 对应属性；`negative_mode` 为 `positive_rewrite` 时，`parameters` 中省略负向 Prompt 属性。`batch_size` 对应属性的值是整数 `1`。图片尺寸使用 Workflow 参数检查后选定的一种尺寸参数组合。

Skill 执行者使用 Workflow 参数检查结果中 `kind` 为 `seed` 的项目验证每个 Seed。Seed 必须是整数，并且满足该项目返回的 `minimum`、`maximum` 和 `allowed_values`。用户给出的 Seed 或历史 Seed 不符合限制时，报告该 Seed 和限制，并等待用户提供新值。`generation random-seeds --stdin` 返回的 Seed 不符合限制时，报告该 Seed 和限制，并等待用户提供一个符合限制的整数。

## 输入值的来源

- `run_ids[]` 来自用户指定的 Generation Run ID。
- `title` 来自用户指定的运行标题；用户没有指定运行标题时，Skill 执行者按照待创建图片顺序使用 `图片 1`、`图片 2` 至 `图片 20`。
- `template_id` 来自 `catalog template resolve` 返回的 `id`。
- `instance_id` 来自 `catalog instance list` 返回的 `results[0].id`。
- `model.id`、`model.file_name` 和 `loras[]` 的各属性来自对应的 Catalog 查询结果。
- `parameters` 的属性名和取值限制来自 `generation inspect-template-parameters --stdin` 的返回结果。
- 正向 Prompt、负向 Prompt 或正向规避内容来自已经通过 `prompt-result-contract.md` 检查的结果 JSON。

### Seed 的来源

1. 用户为一张图片给出整数 Seed 时，该图片使用这个整数。用户给出整数 Seed 但没有指定图片时，当前请求中的全部图片使用这个整数。
2. 用户要求固定 Seed，但没有给出整数或历史 `run_id` 时，Skill 执行者等待用户提供整数或 `run_id`。
3. 用户要求复用历史 Seed 时，Skill 执行者先查询该 `run_id`。当前 Workflow 参数检查结果中只有一个 `kind` 为 `seed` 的项目，并且历史 Run 的 `arguments.parameters` 在该项目的 `parameter_id` 下保存了整数时，使用该整数；其他情况均报告无法确定历史 Seed，并等待用户提供整数或选择重新取得 Seed。
4. 没有使用前三项来源的图片，按照图片顺序使用 `generation random-seeds --stdin` 返回的 `seeds[]`。

## 成功输出与失败输出

三个命令成功时退出码为 `0`，stderr 为空，stdout 包含一行完整 JSON。命令失败时退出码非零，stderr 使用 `错误码: 错误消息` 格式。

`generation run-inputs --stdin` 在当前 Workspace 中匹配 `run_id`。短 Run ID 只匹配一项时，返回完整 Run ID；匹配多项或没有匹配项时，在对应的 `runs[]` 项中返回错误。

`generation run-inputs --stdin` 返回与 `run_ids` 等长且顺序相同的 `runs` 数组：

- 查询成功且 Actual Workflow 可用时，该项包含 `run_id`、`lookup_status: "available"`、`arguments`、`workflow_status: "available"` 和 `workflow`。
- 查询成功但 Actual Workflow 不可用时，该项包含 `run_id`、`lookup_status: "available"`、`arguments`、`workflow_status: "unavailable"` 和 `workflow_error`。
- 单项查询失败时，该项包含请求的 `run_id`、`lookup_status: "error"` 和 `error`；`error` 包含 `code` 和 `message`。

`arguments` 包含 `title`、`template_id`、`parameters` 和 `loras`，并可能包含 `instance_id` 和 `model`。`workflow` 是该 Generation Run 保存的 Actual Workflow。

`generation random-seeds --stdin` 返回 `{"seeds":[...]}`。`seeds` 的长度等于 `count`；每项是 0 至 2,147,483,647 的整数；同一数组中的整数互不相同。

`generation submit --stdin` 成功时返回：

```json
{"run_id":"<durable-run-id>"}
```

该 `run_id` 表示 Generation Run 已接受异步处理。Skill 执行者向用户返回每张图片对应的 `run_id`。

## 错误处理与重试

`generation run-inputs --stdin` 的单项错误保存在对应的 `runs[]` 中。Skill 执行者报告该项的 `run_id`、`error.code` 和 `error.message`，并继续处理数组中的其他项。

- `GENERATION_RUN_ID_INVALID`：Skill 执行者等待用户提供符合“参数与标准输入”一节的 Run ID。
- `GENERATION_RUN_ID_AMBIGUOUS`：Skill 执行者等待用户提供更长的 Run ID。
- `GENERATION_RUN_NOT_FOUND`：Skill 执行者报告当前 Workspace 中没有匹配的 Run。
- `GENERATION_REQUEST_INVALID` 或 `GENERATION_RUN_LOOKUP_FAILED`：Skill 执行者报告错误消息。

`generation run-inputs --stdin` 或 `generation random-seeds --stdin` 返回 `CLI_REQUEST_INVALID` 时，标准输入未通过对应命令的结构检查。`generation submit --stdin` 返回 `CLI_ARGUMENT_INVALID` 时，标准输入未通过 JSON 解析或 Generation Request 结构检查，并且该次调用没有创建 Generation Run。错误来自 Skill 执行者构造的 JSON 时，Skill 执行者修正 JSON 后重试一次；重试仍返回对应错误码时，Skill 执行者报告错误码和错误消息，并停止依赖该命令结果的操作。错误来自用户提供的 JSON 属性值时，Skill 执行者报告属性名、无效值和该属性的约束，并等待用户修正。

`generation run-inputs --stdin` 返回退出码 `0`，但 stdout 不符合“成功输出与失败输出”一节时，Skill 执行者报告实际输出与预期结构的差异，不采用该输出，并停止依赖本次查询结果的操作。

`generation random-seeds --stdin` 的成功输出不符合“成功输出与失败输出”一节时，Skill 执行者报告输出与预期结构的差异，并停止构造使用这些 Seed 的 Generation Request。

`generation submit --stdin` 返回退出码 `0`，但 stdout 不符合“成功输出与失败输出”一节时，Skill 执行者报告输出与预期结构的差异，并说明该次提交可能已经创建 Generation Run。Skill 执行者不自动再次提交，并等待用户决定是否再次提交同一个 Generation Request。

`generation submit --stdin` 返回 `CLI_ARGUMENT_INVALID` 以外的非零退出码时，Skill 执行者报告 stderr，并等待用户决定是否再次提交。用户决定再次提交且命令成功时，命令创建一项新的 Generation Run。

前述规则未覆盖的命令级错误发生时，Skill 执行者报告失败命令、stderr 中的错误码和错误消息。`generation run-inputs --stdin` 失败时，不返回本次查询结果；`generation random-seeds --stdin` 失败时，停止构造需要这些 Seed 的 Generation Request。

## 调用次数与结果复用

- 本次待创建图片总数必须为 1 至 20；总数不在该范围内时，Skill 执行者报告实际数量，并且不调用 `generation random-seeds --stdin` 或 `generation submit --stdin`。
- 对于一份完整且顺序不变的 `run_ids` 数组，Skill 执行者调用一次 `generation run-inputs --stdin`。本次任务后续步骤再次需要同一数组的成功结果时，Skill 执行者按数组下标复用已经返回的 `runs[]`；用户明确要求重新查询时，Skill 执行者调用一次该命令，并用新的成功结果替换此前保存的结果。
- Skill 执行者为全部尚未取得 Seed 的图片调用一次 `generation random-seeds --stdin`，再按图片顺序与数组下标分配并复用返回的 `seeds[]`。待取得 Seed 的图片集合发生变化，或者用户明确要求重新取得这些图片的 Seed 时，Skill 执行者按变化后的图片集合调用一次该命令，并用新的成功结果替换此前为这些图片保存的结果。
- Skill 执行者按照待创建图片顺序为每张图片建立独立的提交序号，并为每张图片的第一次提交调用一次 `generation submit --stdin`。Skill 执行者把成功返回的 `run_id` 和完整 Generation Request 保存到该图片的当前提交序号下。本次 Skill 执行的后续步骤再次处理同一图片的同一成功提交时，Skill 执行者复用该提交序号对应的 `run_id`；另一张图片即使使用完全相同的 Generation Request，也必须独立提交。某张图片的 Generation Request 在成功提交后发生变化，或者用户明确要求使用相同 Generation Request 再创建一项 Run 时，Skill 执行者为该图片建立下一个提交序号、调用一次命令，并分别保留新旧提交序号及其 `run_id`。
- `generation submit --stdin` 返回 `CLI_ARGUMENT_INVALID` 以外的非零退出码时，该调用仍可能对应一项失败状态的 Generation Run。Skill 执行者保留完整 Generation Request。

Skill 执行者只复用退出码为 `0` 且符合“成功输出与失败输出”一节结构的命令结果。

## 完整调用示例

Skill 执行者使用以下命令查询两个 Generation Run：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed","run_d26923be"]}
JSON
```

Skill 执行者使用以下命令为三张图片取得 Seed：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation random-seeds --stdin <<'JSON'
{"count":3}
JSON
```

Skill 执行者使用以下命令提交一张图片：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{
  "title":"角色立绘",
  "instance_id":"2",
  "template_id":"39",
  "model":{"id":"3","file_name":"anima-aesthetic-v1.1.safetensors"},
  "parameters":{
    "positive_prompt":"1girl, portrait",
    "negative_prompt":"worst quality, low quality",
    "seed":184273991,
    "width":1024,
    "height":1024,
    "batch_size":1
  },
  "loras":[]
}
JSON
```
