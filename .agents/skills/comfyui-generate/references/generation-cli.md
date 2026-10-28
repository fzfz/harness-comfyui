---
文档用途: 定义生成清单提交、历史输入查询、Seed 获取和状态查询的 CLI 用法。
读取时机: Skill 执行者首次调用本文件所列命令前。
---

# Generation CLI

## 1. 调用入口与结果文件

1. 官方前台 shell Tool Call 提供 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和 `DSH_HARNESS_COMFYUI_CLI`。执行者使用以下入口：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation <子命令> <选项>
   ```

2. 首次使用子命令前，执行者将选项设为 `--help`，读取命令帮助。公共文件错误与传输限制按帮助处理。
3. 命令成功后，stdout 返回 JSON 结果文件路径。执行者读取该文件取得业务结果；stderr 提供诊断，非零退出码表示命令失败。

## 2. 命令与调用条件

1. `run-inputs --stdin`：查询已保存的生成参数与 Actual Workflow，用于历史核对或复用 Seed。
2. `random-seeds --stdin`：为尚未确定 Seed 的图片取得随机整数。
3. `submit --file <清单路径>` 或 `submit --stdin`：接纳一项或多项生成请求。
4. `resolve-media --stdin`：查询已有 Run 的状态、错误与本地图片路径。

## 3. 参数与标准输入

### 3.1 历史输入与 Seed

1. `run-inputs` 的 stdin 为 `{"run_ids":["run_3c0ad3ed"]}`。`run_ids` 包含 1 至 20 个字符串，保留顺序和重复项。完整 Run ID 或 `run_` 加 UUID 起始片段均可；UUID 片段至少含 8 个小写十六进制字符，并保留所经位置的连字符。
2. `random-seeds` 的 stdin 为 `{"count":3}`。`count` 为 1 至 20 的整数，等于需要随机 Seed 的图片数量。

### 3.2 提交清单

1. `submit` 必须使用互斥的 `--file <清单路径>` 或 `--stdin`。输入为只含 `items` 的 JSON 对象。`items` 包含 1 至 20 项，单项生成使用一项数组。
2. 每项包含以下属性：

   1. `request_id`：必填 UUID，同一清单中的 UUID 必须各不相同。
   2. `request`：必填对象，字段见第 3.3 节。
   3. `parameter_files`：可选对象。属性名为文本参数的 `parameter_id`，值为本地 UTF-8 文件路径。

3. `--file` 中的相对参数文件路径以清单目录为基准。`--stdin` 中的参数文件路径必须为绝对路径。
4. 文件正文原样写入对应参数，保留换行与 JSON 文本。同一参数不得同时出现在 `request.parameters` 和 `parameter_files`。
5. 文件展开后的请求体最多为 1,048,576 字节。全部文件通过读取、编码和大小校验后，CLI 才发送请求。

### 3.3 request 字段

1. `title`：必填字符串，包含 1 至 500 个字符，且不含控制字符。
2. `instance_id`：必填 ComfyUI 实例 ID 字符串。
3. `template_id`：必填 Workflow 模板 ID 字符串。
4. `model`：必填模型对象或 `null`。对象包含 `id`、`file_name`。用户指定模型时使用该对象；采用模板默认模型时使用 `null`。
5. `parameters`：必填对象，以 Workflow 参数的 `parameter_id` 为属性名。内联值与文件展开后的值共同满足 [参数检查参考](template-parameter-inspection-cli.md#generation-request-参数检查) 的约束。
6. `loras`：必填有序数组，最多 100 项。未选择 LoRA 时使用空数组。每项包含 `id`、`file_name`、有限数字 `weight` 和不重复的 `trigger_words` 字符串数组。触发词最多 100 项，每项包含 1 至 500 个字符且不含控制字符。

### 3.4 状态与媒体查询

1. `resolve-media` 的 stdin 为 `{"run_ids":["run_3c0ad3ed"],"include_parameters":false}`。`run_ids` 使用第 3.1 节的数量和 ID 规则。
2. `include_parameters` 为可选布尔值，默认 `false`；设为 `true` 时返回原始参数。

## 4. 输入值来源

1. 模板、实例、模型和 LoRA 使用 `../SKILL.md` 第 2 至 3 节取得的 NoobAI MCP 结果。
2. 参数名与取值限制来自 Workflow 参数查询。Prompt 来自当前消息或已知产物；尺寸按 [图片尺寸选择](template-parameter-inspection-cli.md#图片尺寸选择) 确定。
3. `title` 使用用户指定标题；用户未指定时按图片顺序使用“图片 1”“图片 2”依次编号。
4. `run_ids` 来自用户指定或当前任务已保存的提交结果。执行者查询前保留图片与 Run 的对应关系。

### 4.1 Seed 来源与验证

1. 用户为某张图片指定整数 Seed 时，该图片采用该值。用户未指定对应图片时，全部图片采用该值。
2. 用户要求固定 Seed，但未提供整数或历史 Run ID 时，执行者只询问该输入。
3. 用户要求复用历史 Seed 时，执行者读取对应 Run 的 `arguments.parameters`。当前 Workflow 的 Seed 参数唯一，且该参数名下的历史值为整数时，执行者采用该值。无法确定时，执行者报告具体 Run，等待用户提供整数或选择随机 Seed。
4. 其余图片按顺序使用 `random-seeds` 返回的 `seeds`。执行者按第 3.1 节的数量上限分组取得 Seed，并在首次提交前保存每张图片的 Seed。
5. 每个 Seed 必须满足当前 Seed 参数的整数类型、`minimum`、`maximum` 和 `allowed_values`。不满足时，执行者列出 Seed 与约束，等待用户提供有效值或选择重新取得 Seed。

## 5. 结果文件中的 JSON

### 5.1 历史输入与 Seed

1. `run-inputs` 返回与输入等长同序的 `runs`。成功项包含完整 `run_id`、`lookup_status: "available"` 和 `arguments`。
2. `arguments` 包含 `title`、`template_id`、`parameters`、`loras`，并可包含 `instance_id`、`model`。
3. Actual Workflow 可用时，成功项还含 `workflow_status: "available"` 与 `workflow`；不可用时含 `workflow_status: "unavailable"` 与 `workflow_error`。
4. 单项查询失败时，结果包含输入的 `run_id`、`lookup_status: "error"` 与 `error`。`error` 包含 `code`、`message`。
5. `random-seeds` 返回 `{"seeds":[...]}`。数组长度等于 `count`，整数互不相同，范围为 0 至 2,147,483,647。

### 5.2 清单接纳

1. `submit` 按输入顺序返回：

   ```json
   {"items":[{"request_id":"8cc6f783-3374-4b14-9ae5-d5ce375de8f6","run_id":"run_3c0ad3ed-89ab-4cde-8fab-0123456789ab","acceptance":"accepted"}]}
   ```

2. `accepted` 表示请求已持久接纳。`reused` 表示复用此前接纳的同一请求。
3. 接纳完成后，Run 异步准备并执行 Workflow。准备与执行结果通过 `resolve-media` 查询。

### 5.3 状态与媒体

1. `resolve-media` 返回与输入等长同序的 `runs`。找到记录时，`lookup_status` 为 `available`，Run 执行状态由 `status` 表达。
2. 成功项包含以下字段：

   1. `run_id`、`request_id`：完整 Run ID 与已保存请求标识。
   2. `title`、`status`、`revision`、`updated_at`：标题、当前状态、数字修订号与毫秒时间戳。
   3. `instance_id`、`prompt_id`：目标实例与远端任务标识；尚未取得时为 `null`。
   4. `run_error`：执行错误的 `code`、`message`；没有错误时为 `null`。
   5. `images`：本地图片数组。每项包含 `media_id`、`node_id`、`output_index`、`filename`、`media_type`、`file_path`。尚未保存图片时为空数组。

3. `include_parameters: true` 时，成功项再含 `parameters`。默认结果省略该字段。Actual Workflow 通过 `run-inputs` 查询。
4. 查询失败项使用第 5.1 节第 4 项的错误结构。逐项查询错误保留其他项结果，命令退出码仍为 `0`。

## 6. 请求复用与重做

1. 执行者重放 `../SKILL.md` 第 4 节保存的清单时，保持清单与提示词文件正文不变。
2. 同一 Workspace、Session 中，相同 `request_id` 与相同请求复用原 Run。跨 shell Tool Call 重放也使用原清单。
3. 相同标识对应不同请求时返回 `RUN_REQUEST_CONFLICT`。整批接纳校验失败时，本次新增 Run 数为零。执行者报告冲突项，再核对保存的请求与文件。
4. 修改参数后重做，或用户明确要求相同参数再生成时，执行者为该项保存新的 UUID。只重做指定项，其他项继续使用已有 Run。
5. 接纳响应丢失、输出文件写入失败或 Host 重启后，执行者可重放原清单恢复 Run ID。已失败 Run 也返回原 Run；再次生成按第 4 项处理。
6. `submission_unknown` 表示远端是否接纳尚不明确。执行者不得自动创建替代请求。用户确认可能重复执行后，执行者才为替代请求保存新 UUID。

## 7. 状态处理

1. `created`、`prepared`、`submitting`、`remote_pending`、`remote_running`、`downloading` 和 `cancelling` 为执行中的状态。执行者继续查询已有 Run。
2. `succeeded` 且已保存目标图片时，本项生成已完成。目标图片缺失时，执行者报告该 Run 的状态与实际媒体数量。
3. `failed`、`cancelled` 或 `submission_unknown` 时，执行者按错误消息处理可修正项；依赖用户输入的操作等待用户处理。
4. 执行者按 `../SKILL.md` 第 5 节交付逐项结果。重做遵循第 6 节。

## 8. 错误修正与调用复用

1. `CLI_REQUEST_INVALID`：执行者按报错的项序号、属性和约束修正结构。文件错误按命令帮助修正路径或编码；超限时拆分清单，保留各项 UUID。
2. `GENERATION_RUN_ID_INVALID` 或 `GENERATION_RUN_ID_AMBIGUOUS`：执行者取得完整或更长 ID 后，只重新查询该项。
3. `GENERATION_RUN_NOT_FOUND`：执行者报告当前 Workspace 中没有该 Run，等待用户更换 ID。
4. `GENERATION_RUN_LOOKUP_FAILED` 或其他命令错误：执行者报告失败命令、错误码和消息，按错误指引处理。提交结果不明确时按第 6 节恢复。
5. 输出字段缺失或类型不符时，执行者报告实际结构与预期结构的差异，停止依赖该结果的操作。提交结果不明确时保留原清单。
6. 执行者复用相同历史查询的成功结果。用户要求刷新或 Run 尚在执行时，执行者重新查询状态。
7. 图片集合未变且 Seed 已保存时，执行者复用 Seed。用户要求重新取值时，执行者保存新的分配结果；受影响的生成请求按第 6 节第 4 项处理。

## 9. 文件提交示例

1. 以下清单中的参数名与资源 ID 为示例。执行者按参数查询和资源选择填写实际值，并将 `prompt.txt` 放在清单目录。

   ```json
   {
     "items": [{
       "request_id": "8cc6f783-3374-4b14-9ae5-d5ce375de8f6",
       "request": {
         "title": "角色立绘",
         "instance_id": "2",
         "template_id": "39",
         "model": null,
         "parameters": {"seed":184273991,"width":1024,"height":1024,"batch_size":1},
         "loras": []
       },
       "parameter_files": {"positive_prompt":"prompt.txt"}
     }]
   }
   ```

2. 执行者提交清单，再用结果文件中的 Run ID 查询媒体：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation submit --file '<清单路径>'
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation resolve-media --stdin <<'JSON'
   {"run_ids":["run_3c0ad3ed-89ab-4cde-8fab-0123456789ab"]}
   JSON
   ```
