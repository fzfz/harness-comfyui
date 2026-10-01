# Catalog CLI

## CLI 用途

Skill 执行者使用 Catalog CLI 查询 Workflow 模板、生成模型、LoRA 和 ComfyUI 实例。

## 调用入口

受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和 Catalog CLI 入口脚本路径 `DSH_HARNESS_COMFYUI_CLI`。Skill 执行者使用以下格式以 Node 模式调用 Catalog CLI；命令不接受参数时省略 `[options]`。

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet <command> [options]
```

## 命令与调用条件

- Skill 执行者取得 `template_id` 后，调用 `catalog template resolve --id '<template_id>'`。
- 用户指定了 `model_id` 时，Skill 执行者调用 `catalog generation-model resolve --id '<model_id>'`。用户没有指定 `model_id`，并且 Workflow 模板查询结果的 `model_id` 非空时，Skill 执行者使用该值调用同一命令。用户没有指定 `model_id`，并且 Workflow 模板查询结果的 `model_id` 为 `null` 时，Skill 执行者报告当前模板没有默认生成模型，并等待用户指定 `model_id` 后查询该模型。
- Skill 执行者取得一个或多个 `lora_id` 后，按每个 `lora_id` 首次出现的顺序去重，并针对去重后的每个 `lora_id` 调用一次 `catalog lora resolve --id '<lora_id>'`。
- Skill 执行者检查 Workflow 参数或构造 Generation Request 时，如果需要 `instance_id`，则调用 `catalog instance list`。
- 用户要求搜索 Workflow 模板、生成模型或 LoRA 时，Skill 执行者调用 `catalog search`。
- 搜索结果中的 `context.kind` 决定 resolve 命令：`comfyui-template` 对应 `catalog template resolve`，`model` 对应 `catalog generation-model resolve`，`lora` 对应 `catalog lora resolve`。

## 参数与标准输入

三条 resolve 命令各自接受一个 `--id`，并且不读取标准输入。`--id` 是由 1 至 20 位十进制数字组成且首位不是 `0` 的字符串。

`catalog instance list` 不接受参数，也不读取标准输入。

`catalog search` 不读取标准输入，并接受以下参数：

- `--kind` 是必填参数。Skill 执行者搜索 Workflow 模板时将该参数设为 `comfyui-template`，搜索生成模型时将该参数设为 `model`，搜索 LoRA 时将该参数设为 `lora`。
- `--query` 是必填参数。Skill 执行者将用户的搜索文本作为该参数值；该参数值包含 0 至 200 个字符，并且不包含控制字符。
- `--page` 是必填参数。用户给出页码时，Skill 执行者将该参数设为用户给出的页码；用户未给出页码时，Skill 执行者将该参数设为 `1`。该参数接受 1 至 100000 的整数。
- `--base-model-id` 是可选参数。用户以 `base_model_id: 4` 形式给出底模 ID 时，Skill 执行者将该参数设为该底模 ID；该参数值采用与 `--id` 相同的格式。

## 输入值的来源

`template_id` 来自当前消息中 Workflow 模板选择的 `comfyui-context.data.id`、用户按照 `template_id: 36` 形式给出的 ID，或者用户从 `catalog search` 结果中选定的 `items[].context.id`。多个来源给出不同 ID 时，Skill 执行者报告这些 ID，并等待用户指定一个 `template_id`。

`model_id` 来自当前消息中生成模型选择的 `comfyui-context.data.id`、用户按照 `model_id: 12` 形式给出的 ID，或者用户从 `catalog search` 结果中选定的 `items[].context.id`。多个来源给出不同 ID 时，Skill 执行者报告这些 ID，并等待用户指定一个 `model_id`。

用户指定了 `model_id` 时，Skill 执行者把该模型的成功查询结果用于构造 Generation Request 的 `model` 对象。用户没有指定 `model_id`，并且查询了 Workflow 模板的默认生成模型时，Skill 执行者把 Generation Request 的 `model` 设为 `null`。

`lora_id` 有序列表来自以下任一来源：当前消息中的一个或多个 LoRA 选择，其 ID 按选择顺序取自各自的 `comfyui-context.data.id`；用户依次给出的一个或多个 `lora_id: <ID>` 项；用户依次从 `catalog search` 结果中选定的 `items[].context.id`。多个来源给出不同的 LoRA ID 有序列表时，Skill 执行者报告这些有序列表，并等待用户指定最终列表。

`catalog instance list` 返回至少一个实例对象时，Skill 执行者将 `results[0].id` 用作 `instance_id`。`results` 为空时，Skill 执行者报告没有取得 ComfyUI 实例 ID，并停止需要 `instance_id` 的后续操作。

## 成功输出与失败输出

`catalog template resolve` 成功时输出一个 JSON 对象。`id` 保存 Workflow 模板 ID，`title` 保存 Workflow 模板标题，`base_model_id` 保存底模 ID；该对象还包含 `model_id`。结构示例如下：

```json
{"id":"36","title":"Portrait","base_model_id":"4","model_id":"12"}
```

`model_id` 是 Workflow 模板保存的默认生成模型 ID；未保存默认生成模型 ID 时，该值为 `null`。

`catalog generation-model resolve` 成功时输出 JSON 对象。`id` 保存生成模型 ID，`base_model_id` 保存底模 ID，`file_name` 保存模型文件名，`description` 保存模型说明，`usage` 保存模型使用说明，`skill_name` 保存与该模型关联的 Prompt Builder 名称；`skill_name` 的值是字符串或 `null`。

`catalog lora resolve` 成功时输出 JSON 对象。`id` 保存 LoRA ID，`base_model_id` 保存底模 ID，`model_id` 保存生成模型 ID，`file_name` 保存 LoRA 文件名，`description` 保存 LoRA 说明，`usage` 保存 LoRA 使用说明，`trigger_words` 保存触发词，`weight` 保存 LoRA 权重；`trigger_words` 是字符串数组，`weight` 是有限数字。

`catalog instance list` 成功时输出一个 JSON 对象。`status` 保存查询状态，`message` 保存 Catalog 返回的消息或 `null`，`results` 保存当前页的 ComfyUI 实例对象数组，`page` 保存当前页码，`page_size` 保存本次查询使用的每页数量，`total_count` 保存全部 ComfyUI 实例数量；结构示例如下：

```json
{"status":"ok","message":null,"results":[{"id":"2"}],"page":1,"page_size":100,"total_count":1}
```

`results[]` 中每个 ComfyUI 实例对象的 `id` 属性保存该实例的 ID。

`catalog search` 成功时输出一个 JSON 对象。`kind` 保存搜索对象类型，`query` 保存搜索文本，`page` 保存当前结果页码，`items` 保存当前页的搜索结果数组，`totalCount` 保存符合搜索条件的结果总数。每个 `items[]` 的 `context` 保存搜索结果的对象类型和对象 ID，`label` 保存展示名称，`subtitle` 保存展示副标题，`coverUrl` 保存封面图片地址，`sampleImageUrls` 保存样图地址数组。Workflow 模板、生成模型和 LoRA 的 `context` 分别包含 `{kind,id,title}`、`{kind,id,file_name}` 和 `{kind,id,file_name}`；`kind` 保存对象类型，`id` 保存对象 ID，`title` 保存 Workflow 模板标题，`file_name` 保存生成模型或 LoRA 文件名。

`catalog search` 返回非空 `items` 时，Skill 执行者按照返回顺序列出每项的 `context.id`、`context.kind`、`label` 和 `subtitle`，然后等待用户选择。`items` 为空时，Skill 执行者报告本页没有搜索结果。

使用 `--quiet` 调用命令且命令成功时，退出码为 `0`，stderr 为空，stdout 包含一行完整 JSON。命令失败时退出码非零，stderr 使用 `错误码: 错误消息` 格式。

## 错误处理与重试

- `CLI_ARGUMENT_INVALID`：如果 Skill 执行者构造的命令不符合“参数与标准输入”一节，Skill 执行者修正命令并重试一次；重试后仍返回 `CLI_ARGUMENT_INVALID` 时，Skill 执行者报告错误码、错误消息和失败命令，并停止依赖本次查询结果的操作。如果用户给出的值不符合该节，Skill 执行者报告无效值并等待用户提供新值。
- `CLI_ENVIRONMENT_INVALID`、`CLI_REQUEST_FAILED`、`CATALOG_QUERY_FAILED`、`CATALOG_RESPONSE_TOO_LARGE`、`CATALOG_PROTOCOL_ERROR`、`CLI_RESPONSE_TOO_LARGE`、`CLI_PROTOCOL_ERROR` 或 `CLI_INTERNAL_ERROR`：Skill 执行者报告错误码、错误消息和失败命令，并停止依赖本次查询结果的操作。

resolve 命令返回的 `id` 与输入 `--id` 不相同时，Skill 执行者按照 `CATALOG_PROTOCOL_ERROR` 处理。任一命令的成功输出缺少“成功输出与失败输出”一节为该命令列出的属性时，Skill 执行者按照 `CATALOG_PROTOCOL_ERROR` 处理。

## 查询结果复用

处理当前用户请求期间，Skill 执行者保存每个成功输出的完整 JSON。Skill 执行者再次需要相同命令和参数的查询结果时，使用已保存的 JSON；命令或参数发生变化时，Skill 执行者重新调用对应命令。

## 帮助与操作提示

需要逐层查看能力、命令和输入示例时，Skill 执行者从 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help` 开始，按“下一步”进入分类和命令帮助。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 操作提示，退出码仍为 `0`。
