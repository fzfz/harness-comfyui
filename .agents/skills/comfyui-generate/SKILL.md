---
name: comfyui-generate
description: 使用当前消息中已选的 ComfyUI Workflow 模板和画面要求创建异步图片生成运行。用户要求开始生成、出图或运行已选 Workflow 时使用。
---

# ComfyUI Generate

从当前用户消息读取 `type: "comfyui-context"` 的 JSON。每个对象的 `data.kind` 表示该上下文的用途，`data.id` 是数据源记录 ID。

当前消息必须恰好包含一个 `data.kind: "comfyui-template"` 对象。使用 `data.id` 作为 `template_id`，使用 `data.title` 识别 Workflow 模板。缺少模板或存在多个模板时，请用户选择一个 Workflow 模板并结束本次执行。

当前消息包含 `data.kind: "lora"` 对象时，使用 `data.file_name` 识别当前 LoRA，请用户取消当前 LoRA 选择并结束本次执行。当前消息包含 `data.kind: "model"` 对象时，使用 `data.file_name` 识别当前生成模型，请用户取消当前生成模型选择并结束本次执行。以上检查必须在 Tool 调用前完成。

按以下优先级取得正向提示词：

1. 用户在当前消息中明确提供的完整提示词；
2. 用户在当前消息中明确引用的本 Session 最近一条 Prompt Skill 输出；
3. 用户的画面要求与当前消息中的以下上下文共同构成的完整提示词：

先选择最高的可用优先级，忽略更低优先级的候选。同一优先级存在多个完整提示词候选且用户没有明确指定时，请用户选择一个并结束本次执行。

- `data.kind: "character"`：`data.work_name` 是作品名，`data.character_name` 是角色名，`data.prompt_text` 是角色提示词；
- `data.kind: "style"`：`data.name` 是画风名，`data.prompt_text` 是画风提示词；
- `data.kind: "artist-string"`：`data.title` 是画师串名称，`data.prompt_text` 是画师串提示词；
- `data.kind: "prompt-term"`：`data.tag` 是提示词条目。
- `data.kind: "work"`：`data.name` 是作品名，用于确定用户要求的作品语境。

同一 `data.kind` 出现多项时全部处理。不能得到非空正向提示词时，请用户补充画面要求并结束本次执行。

读取 Workflow 模板对象的 `data.parameters`。该数组每项包含 `parameter_id`、`kind`、`value_type` 和 `required`。`kind: "positive_prompt"` 必须恰好出现一次；把完整正向提示词写入该项的 `parameter_id`。用户明确提供的每个运行值必须按语义匹配唯一 `kind`，并写入该项的 `parameter_id`。`value_type: "string"` 或 `"asset_reference"` 接受字符串，`"integer"` 接受整数，`"number"` 接受数字，`"boolean"` 接受布尔值。逐项检查所有 `required: true` 参数；必填参数没有对应值时，报告该参数的 `parameter_id`。用户值没有匹配参数时，报告缺少的 `kind`。同一单值 `kind` 存在多个参数时，列出全部冲突的 `parameter_id`。值不符合 `value_type` 时，报告该值对应的 `parameter_id`。任一检查失败后结束本次执行。

调用一次 `generate_with_comfyui`：

- `title` 是当前画面任务的简短标题；
- `template_id` 是所选 Workflow 模板的 `data.id`；
- `parameters` 只包含 Workflow 模板 `data.parameters` 声明的 `parameter_id` 与对应值。

Tool 返回 `run_id` 后，向用户返回该 `run_id` 和已进入异步处理的状态。
