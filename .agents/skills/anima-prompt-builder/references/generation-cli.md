---
文档用途: 提供 Generation Run 查询 CLI 的调用条件、输入输出与错误处理规则。
读取时机: Skill 执行者首次调用本文件所列命令前。
---
# Generation Run 查询 CLI

## 用途与调用入口

1. `generation run-inputs --stdin` 查询一个或多个 Generation Run 保存的生成参数和 Actual Workflow。

2. 受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和 CLI 入口脚本路径 `DSH_HARNESS_COMFYUI_CLI`。Skill 执行者使用以下命令以 Node 模式运行该脚本：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation run-inputs --stdin
   ```

## 标准输入

1. Skill 执行者把用户给出的 `run_id` 按原顺序写入只包含 `run_ids` 的 JSON 对象，并把该对象写入命令的标准输入：

   ```json
   {
     "run_ids": ["run_3c0ad3ed", "run_d26923be"]
   }
   ```

2. `run_ids` 必须是包含 1 至 20 个字符串的数组。Skill 执行者查询单个 Generation Run 时仍使用数组。重复的 `run_id` 保留在原位置。

3. 每个数组元素可以使用完整 Run ID，也可以使用 `run_` 加对应 UUID 起始片段的短 Run ID。短 Run ID 必须包含 UUID 的前八个或更多字符，并保留完整 UUID 中已经出现的连字符位置，例如 `run_3c0ad3ed` 或 `run_3c0ad3ed-9f27`。

## 结果文件中的 JSON

1. 结果文件中的 JSON 对象只包含 `runs`。`runs` 是数组，其元素数量和元素顺序必须分别与输入 `run_ids` 的元素数量和元素顺序一致。

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

1. 当 `lookup_status` 和 `workflow_status` 均为 `"available"` 时，Skill 执行者按照以下属性定义读取结果项：

   1. `run_id`：匹配到的完整 Run ID。
   2. `lookup_status`：固定为 `"available"`。
   3. `arguments.title`：创建该 Generation Run 时提交的标题。
   4. `arguments.instance_id`：创建该 Generation Run 时提交的 ComfyUI 实例 ID；原请求没有该属性时省略。
   5. `arguments.template_id`：创建该 Generation Run 时提交的 Workflow 模板 ID。
   6. `arguments.model`：创建该 Generation Run 时提交的生成模型 `id` 和 `file_name`；原请求没有该属性时省略。
   7. `arguments.parameters`：创建该 Generation Run 时提交的全部 Workflow 参数。
   8. `arguments.loras`：创建该 Generation Run 时提交的 LoRA 数组。每项包含 `id`、`file_name`、`weight` 和 `trigger_words`。原请求没有 `loras` 属性时返回空数组。
   9. `workflow_status`：Actual Workflow 可用时固定为 `"available"`。
   10. `workflow`：该 Generation Run 保存的 Actual Workflow JSON。

### 生成参数可用但 Actual Workflow 不可用

1. 当 `lookup_status` 为 `"available"` 且 Actual Workflow 无法返回时，结果项保留 `run_id`、`lookup_status` 和 `arguments`，并使用以下两个属性说明 Actual Workflow 查询结果：

   1. `workflow_status`：固定为 `"unavailable"`。
   2. `workflow_error`：说明 Actual Workflow 无法返回的错误消息。

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

1. 该结果项中的 `run_id` 保留输入字符串，`lookup_status` 固定为 `"error"`。`error.code` 是错误码，`error.message` 是该项的错误消息。

## 单项错误处理

1. Skill 执行者按照 `runs[]` 的顺序处理每个结果项。一个结果项的 `lookup_status` 为 `"error"` 时，Skill 执行者报告该项的 `run_id`、`error.code` 和 `error.message`，并继续处理后续结果项。

2. `GENERATION_RUN_ID_INVALID`：输入字符串不符合完整 Run ID 或短 Run ID 格式。Skill 执行者请求用户提供符合“标准输入”一节格式的 Run ID。
3. `GENERATION_RUN_ID_AMBIGUOUS`：短 Run ID 匹配多个 Generation Run。Skill 执行者请求用户提供更长的 UUID 起始片段或完整 Run ID。
4. `GENERATION_RUN_NOT_FOUND`：没有找到匹配的 Generation Run。Skill 执行者向用户说明未找到与该结果项 `run_id` 匹配的 Generation Run，并请用户核对后提供正确的 Run ID。
5. `GENERATION_REQUEST_INVALID`：该 Generation Run 保存的生成参数无法解析。Skill 执行者报告 `error.message`，并请用户直接提供该次生成的参数，或提供另一个可查询的 Run ID。
6. `GENERATION_RUN_LOOKUP_FAILED`：读取该 Generation Run 时发生其他错误。Skill 执行者报告 `error.message`，并告知用户可以在解决消息所述问题后明确要求重新查询。

## 命令级错误与返回协议错误

1. 公共文件错误按“命令帮助”处理。发生其他命令级错误时，Skill 执行者检查 stderr 是否为一行 `错误码: 错误消息`。格式不符时，报告实际 stderr 并停止查询；格式符合时，按照以下规则处理：

2. stderr 中的错误码为 `CLI_REQUEST_INVALID` 时，Skill 执行者按照“标准输入”一节检查自己构造的 JSON。发现可修正的输入错误后，Skill 执行者修正 JSON 并自动重试一次，再按照本节处理返回结果。本次历史查询最多自动重试一次。未发现可修正的输入错误或自动重试返回非零退出码时，Skill 执行者报告错误并停止本次历史查询。
3. stderr 中的错误码不是 `CLI_REQUEST_INVALID` 时，Skill 执行者报告 stderr 并停止本次历史查询。

4. 命令返回退出码 `0` 时，Skill 执行者按命令帮助验证输出通道，再按“结果文件中的 JSON”一节验证文件内容和结果项结构。任一条件不满足时，Skill 执行者报告实际返回内容及其违反的协议条件，并停止本次历史查询。

## 调用次数与结果复用

1. Skill 执行者按照“标准输入”一节，将用户一次查询请求中的全部 `run_id` 构造成一个输入数组。用户提供的数量超出该节规定的范围时，Skill 执行者请求用户提供符合数量要求的 `run_id`，并在收到符合要求的输入后继续查询。

2. 只有符合命令帮助的成功条件，且结果文件中的 JSON 符合“结果文件中的 JSON”一节全部返回协议的调用，才产生可复用结果。Skill 执行者按照该次调用使用的完整 `run_ids` 数组及其元素顺序保存可复用结果。

### 调用顺序

1. 用户明确要求重新查询当前完整 `run_ids` 数组时，Skill 执行者使用该数组发起一次新的调用，并使用该次调用的结果。
2. 用户没有明确要求重新查询，并且本次 Skill 执行中已有一次成功调用使用了内容和顺序完全相同的 `run_ids` 数组时，Skill 执行者直接按照数组下标复用该次调用的 `runs[]` 结果项。重复的 `run_id` 分别复用其所在位置对应的结果项。
3. 用户没有明确要求重新查询，并且当前完整 `run_ids` 数组没有可复用结果时，Skill 执行者使用该数组发起一次初始调用。

### 返回处理

1. “调用顺序”第 1 项或第 3 项产生的调用返回后，Skill 执行者按照“命令级错误与返回协议错误”一节处理该次返回。该节允许的自动重试必须使用修正后的标准输入 JSON 中的完整 `run_ids` 数组。Skill 执行者将命令调用限定为初始调用、用户明确要求的重新查询，以及该节规定的唯一一次自动重试。

2. 调用产生可复用结果时，Skill 执行者保存该结果，并按照“结果文件中的 JSON”和“单项错误处理”两节处理 `runs[]`。

## 命令帮助

1. 首次调用受管 CLI 前，Skill 执行者将本文件调用入口中的 `--stdin` 替换为 `--help`，读取该命令帮助。公共输出与文件错误按帮助处理。本文件的成功 JSON 指返回路径中的文件内容。
