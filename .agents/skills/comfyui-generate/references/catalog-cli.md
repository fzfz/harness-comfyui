# Catalog CLI

## CLI 作用

Catalog CLI 读取当前目录服务保存的 Workflow 模板、生成模型、LoRA 和 ComfyUI 实例记录。Skill 执行者使用 resolve 结果核对当前消息选择的精确 ID、文件名和底模兼容性，并使用实例目录结果取得本次 Generation Request 的实例 ID。

## 调用时机

用户要求创建 Generation Run 或核对当前选择的兼容性时，Skill 执行者调用与当前消息选择对应的 resolve 命令。Skill 执行者只在准备提交 Generation Request 时调用实例目录命令取得当前可用实例。用户明确要求发现或选择目录记录时才调用搜索命令。

## 调用方式

以下命令只能在 Harness 提供的前台 shell Tool 调用中执行。每条命令把一个 JSON 对象写入标准输出；命令失败时把 `错误码: 错误消息` 写入标准错误并返回非零退出码。

```bash
node "$DSH_HARNESS_COMFYUI_CLI" <command> <options>
```

CLI 不接收 Workspace ID、Session ID、Turn 或 Tool Call ID。调用者只填写本文件定义的业务参数。

## Resolve Workflow 模板

当前消息包含唯一 `data.kind: "comfyui-template"` 选择，且需要核对兼容性或提交 Generation Request 时调用本命令。

```bash
node "$DSH_HARNESS_COMFYUI_CLI" catalog template resolve --id '<template-id>'
```

`--id` 来自当前消息中 `data.kind: "comfyui-template"` 的 `data.id`。输出包含：

- `id`：模板 ID；
- `title`：模板标题；
- `base_model_id`：模板要求的底模 ID；
- `model_id`：模板保存的默认生成模型 ID 或 `null`。

## Resolve 生成模型

当前消息包含唯一 `data.kind: "model"` 选择，且需要核对兼容性或提交 Generation Request 时调用本命令。

```bash
node "$DSH_HARNESS_COMFYUI_CLI" catalog generation-model resolve --id '<model-id>'
```

`--id` 来自当前消息中 `data.kind: "model"` 的 `data.id`。输出包含 `id`、`base_model_id`、`file_name`、`description`、`usage` 和 `skill_name`；`skill_name` 可以是 `null`。

## Resolve LoRA

当前消息包含一个或多个 `data.kind: "lora"` 选择，且需要核对兼容性或提交 Generation Request 时，对每个 LoRA ID 分别调用本命令。

```bash
node "$DSH_HARNESS_COMFYUI_CLI" catalog lora resolve --id '<lora-id>'
```

`--id` 来自当前消息中 `data.kind: "lora"` 的 `data.id`。输出包含 `id`、`base_model_id`、`model_id`、`file_name`、`description`、`usage`、`trigger_words` 和 `weight`。

## 查询实例目录

每次准备提交 Generation Request 时调用本命令，并从该次返回结果取得实例 ID。

```bash
node "$DSH_HARNESS_COMFYUI_CLI" catalog instance list
```

输出包含 `status`、`message`、`results`、`page`、`page_size` 和 `total_count`。`results[].id` 是可以提交 Generation Request 的实例 ID。生成流程每次从当前结果取得实例 ID，不猜测或复用其他类型的 ID。

## 搜索目录

用户明确要求发现或选择 Workflow 模板、生成模型、LoRA 或其他目录记录时调用本命令。

```bash
node "$DSH_HARNESS_COMFYUI_CLI" catalog search \
  --kind '<kind>' \
  --query '<query>' \
  --page '<positive-integer>'
```

需要限定底模时追加：

```bash
--base-model-id '<base-model-id>'
```

`--kind` 允许 `model`、`lora`、`work`、`character`、`style`、`prompt-term`、`artist-string` 和 `comfyui-template`。搜索结果中的 `items[].context.id` 是对应目录记录 ID。搜索用于用户明确要求发现或选择目录记录的任务；生成流程缺少用户选择时，先请用户选择，不用搜索结果替代当前消息选择。
