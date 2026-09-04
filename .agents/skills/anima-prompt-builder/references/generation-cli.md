# Generation Run 查询 CLI

## 用途与调用入口

`generation run-inputs --stdin` 查询一个或多个 Generation Run 保存的生成参数和 Actual Workflow。

`DSH_HARNESS_COMFYUI_CLI` 保存 CLI 入口脚本路径。Skill 执行者使用以下命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
```

## 标准输入

Skill 执行者把用户给出的 `run_id` 按原顺序写入只包含 `run_ids` 的 JSON 对象，并把该对象写入命令的标准输入：

```json
{
  "run_ids": ["run_3c0ad3ed", "run_d26923be"]
}
```

`run_ids` 必须是包含 1 至 20 个字符串的数组。Skill 执行者查询单个 Generation Run 时仍使用数组。重复的 `run_id` 保留在原位置。

每个数组元素可以使用完整 Run ID，也可以使用 `run_` 加对应 UUID 起始片段的短 Run ID。短 Run ID 必须包含 UUID 的前八个或更多字符，并保留完整 UUID 中已经出现的连字符位置，例如 `run_3c0ad3ed` 或 `run_3c0ad3ed-9f27`。

## 成功输出

命令成功时返回退出码 `0`，stderr 为空，stdout 写入一行只包含 `runs` 的 JSON 对象。`runs` 是数组，其元素数量和元素顺序必须分别与输入 `run_ids` 的元素数量和元素顺序一致。

### `runs` 数组项：生成参数和 Actual Workflow 均可用

```json
{
  "run_id": "run_3c0ad3ed-9f27-4d07-b0c3-6d9d78ec2171",
  "lookup_status": "available",
  "arguments": {
    "title": "角色立绘",
    "instance_id": "2",
    "template_id": "39",
    "model": {
      "id": "3",
      "file_name": "anima3.safetensors"
    },
    "parameters": {
      "positive_prompt": "1girl, portrait",
      "seed": 184273991
    },
    "loras": []
  },
  "workflow_status": "available",
  "workflow": {}
}
```

当 `lookup_status` 和 `workflow_status` 均为 `"available"` 时，Skill 执行者按照以下属性定义读取结果项：

- `run_id`：匹配到的完整 Run ID。
- `lookup_status`：固定为 `"available"`。
- `arguments.title`：创建该 Generation Run 时提交的标题。
- `arguments.instance_id`：创建该 Generation Run 时提交的 ComfyUI 实例 ID；原请求没有该属性时省略。
- `arguments.template_id`：创建该 Generation Run 时提交的 Workflow 模板 ID。
- `arguments.model`：创建该 Generation Run 时提交的生成模型 `id` 和 `file_name`；原请求没有该属性时省略。
- `arguments.parameters`：创建该 Generation Run 时提交的全部 Workflow 参数。
- `arguments.loras`：创建该 Generation Run 时提交的 LoRA 数组。每项包含 `id`、`file_name`、`weight` 和 `trigger_words`。原请求没有 `loras` 属性时返回空数组。
- `workflow_status`：Actual Workflow 可用时固定为 `"available"`。
- `workflow`：该 Generation Run 保存的 Actual Workflow JSON。

### 生成参数可用但 Actual Workflow 不可用

当 `lookup_status` 为 `"available"` 且 Actual Workflow 无法返回时，结果项保留 `run_id`、`lookup_status` 和 `arguments`，并使用以下两个属性说明 Actual Workflow 查询结果：

- `workflow_status`：固定为 `"unavailable"`。
- `workflow_error`：说明 Actual Workflow 无法返回的错误消息。

### `runs` 数组项：Generation Run 查询失败

```json
{
  "run_id": "run_deadbeef",
  "lookup_status": "error",
  "error": {
    "code": "GENERATION_RUN_NOT_FOUND",
    "message": "Generation Run was not found."
  }
}
```

该结果项中的 `run_id` 保留输入字符串，`lookup_status` 固定为 `"error"`。`error.code` 是错误码，`error.message` 是该项的错误消息。

## 单项错误处理

Skill 执行者按照 `runs[]` 的顺序处理每个结果项。一个结果项的 `lookup_status` 为 `"error"` 时，Skill 执行者报告该项的 `run_id`、`error.code` 和 `error.message`，并继续处理后续结果项。

- `GENERATION_RUN_ID_INVALID`：输入字符串不符合完整 Run ID 或短 Run ID 格式。Skill 执行者请求用户提供符合“标准输入”一节格式的 Run ID。
- `GENERATION_RUN_ID_AMBIGUOUS`：短 Run ID 匹配多个 Generation Run。Skill 执行者请求用户提供更长的 UUID 起始片段或完整 Run ID。
- `GENERATION_RUN_NOT_FOUND`：没有找到匹配的 Generation Run。Skill 执行者向用户说明未找到与该结果项 `run_id` 匹配的 Generation Run。
- `GENERATION_REQUEST_INVALID`：该 Generation Run 保存的生成参数无法解析。Skill 执行者报告 `error.message`。
- `GENERATION_RUN_LOOKUP_FAILED`：读取该 Generation Run 时发生其他错误。Skill 执行者报告 `error.message`。

## 命令级错误与返回协议错误

命令返回非零退出码时，Skill 执行者检查 stdout 是否为空，并检查 stderr 是否为一行 `错误码: 错误消息`。任一条件不满足时，Skill 执行者逐条报告违反的返回协议条件并停止本次历史查询。两项条件均满足时，Skill 执行者按照以下规则处理：

- stderr 中的错误码为 `CLI_REQUEST_INVALID` 时，Skill 执行者检查标准输入 JSON 是否只包含 `run_ids` 属性，并检查 `run_ids` 是否为包含 1 至 20 个字符串的数组。Skill 执行者发现并修正自己构造的 JSON 后自动重试一次；该次重试是本次历史查询唯一允许的自动重试。Skill 执行者没有发现可修正的输入错误时，不重试，直接报告 stderr 并停止本次历史查询。自动重试返回非零退出码时，Skill 执行者按照本节首段重新检查 stdout 和 stderr；任一返回协议条件不满足时，逐条报告违反的条件并停止本次历史查询；两项条件均满足时，报告 stderr 并停止本次历史查询。自动重试返回退出码 `0` 时，Skill 执行者按照本节最后一段检查 stderr 和 stdout。
- stderr 中的错误码不是 `CLI_REQUEST_INVALID` 时，Skill 执行者不重试，报告 stderr 并停止本次历史查询。

命令返回退出码 `0` 后，如果 stderr 非空，Skill 执行者报告 stderr 内容并停止本次历史查询。如果 stdout 不是单行 JSON 对象、该对象包含 `runs` 之外的属性、`runs` 不是数组、`runs` 的元素数量与输入 `run_ids` 的元素数量不同、`runs` 的元素不能按输入 `run_ids` 的顺序一一对应，或者任一结果项不符合“成功输出”一节定义的对应结构，Skill 执行者逐条报告 stdout 违反的返回协议条件，并停止本次历史查询。

## 调用次数与结果复用

Skill 执行者把用户一次查询请求中给出的全部 `run_id` 按原顺序放入同一个 `run_ids` 数组。用户给出的 `run_id` 数量不在 1 至 20 个范围内时，Skill 执行者请求用户提供 1 至 20 个 `run_id`，并且不调用命令。

只有同时满足退出码为 `0`、stderr 为空且 stdout 符合“成功输出”一节全部返回协议的调用，才产生可复用结果。Skill 执行者按照该次调用使用的完整 `run_ids` 数组及其元素顺序保存可复用结果。

Skill 执行者按照以下顺序处理当前完整 `run_ids` 数组：

1. 用户明确要求重新查询当前完整 `run_ids` 数组时，Skill 执行者使用该数组调用命令一次，不复用已有结果。
2. 用户没有明确要求重新查询，并且本次 Skill 执行中已有一次成功调用使用了内容和顺序完全相同的 `run_ids` 数组时，Skill 执行者不调用命令，按照数组下标复用该次调用的 `runs[]` 结果项。重复的 `run_id` 分别复用其所在位置对应的结果项。
3. 用户没有明确要求重新查询，并且当前完整 `run_ids` 数组没有可复用结果时，Skill 执行者使用该数组发起一次初始调用。

第 1 项或第 3 项产生的调用返回后，Skill 执行者按照“命令级错误与返回协议错误”一节处理该次返回。该次调用因 `CLI_REQUEST_INVALID` 触发自动重试时，Skill 执行者只使用修正后的标准输入 JSON 中的完整 `run_ids` 数组重试一次。初始调用、用户明确要求的重新查询和该次唯一允许的自动重试之外，Skill 执行者不再调用命令。

初始调用、用户明确要求的重新查询或自动重试满足成功条件时，Skill 执行者保存该次调用的可复用结果，并按照“成功输出”和“单项错误处理”两节处理 `runs[]`。调用没有满足成功条件时，Skill 执行者按照“命令级错误与返回协议错误”一节报告对应错误并停止本次历史查询。
