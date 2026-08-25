---
name: comfyui-generate
description: 使用当前消息中已选的 ComfyUI Workflow 模板和画面要求创建异步图片生成运行。用户要求开始生成、出图或运行已选 Workflow 时使用。
---

# ComfyUI Generate

从当前用户消息读取 `type: "comfyui-context"` 的 JSON。每个对象的 `data.kind` 表示该上下文的用途，`data.id` 是数据源记录 ID。

当前消息必须恰好包含一个 `data.kind: "comfyui-template"` 对象。使用 `data.id` 作为 `template_id`，使用 `data.title` 识别 Workflow 模板。缺少模板或存在多个模板时，请用户选择一个 Workflow 模板并结束本次执行。

当前消息包含 `data.kind: "lora"` 对象时，使用 `data.file_name` 识别当前 LoRA，请用户取消当前 LoRA 选择并结束本次执行。当前消息包含 `data.kind: "model"` 对象时，使用 `data.file_name` 识别当前生成模型，请用户取消当前生成模型选择并结束本次执行。以上检查必须在 Tool 调用前完成。

使用模板对象的 `data.id` 调用一次 `query_semantic_comfyui_templates`。该 Tool 返回模板 `id`、`title` 和 `parameters`。Tool 返回的 `id` 必须与模板对象的 `data.id` 相同；查询失败或 ID 不相同时，报告模板查询错误并结束本次执行。

从当前消息识别一项或多项 Generation Request。用户明确要求多个独立生成结果时，按用户声明的顺序为每个结果建立一项 Generation Request；否则建立一项 Generation Request。每项 Generation Request 分别保存简短标题、正向提示词候选和用户明确归属于该结果的运行值。用户明确声明多个结果共享的运行值时，把该值分别写入每项 Generation Request。无法确定多个结果的边界或运行值归属时，请用户明确每项结果并结束本次执行。

对每项 Generation Request 按以下优先级取得正向提示词：

1. 用户在当前消息中为该结果明确提供的完整提示词；
2. 用户在当前消息中为该结果明确引用的本 Session 最近一条 Prompt Skill 输出；
3. 用户为该结果提供的画面要求与当前消息中的以下上下文共同构成的完整提示词：

每项 Generation Request 选择最高的可用优先级并忽略该项更低优先级的候选。同一 Generation Request 的同一优先级存在多个完整提示词候选且用户没有明确指定时，请用户选择一个并结束本次执行。多个 Generation Request 各自拥有一个完整提示词不构成提示词冲突。

- `data.kind: "character"`：`data.work_name` 是作品名，`data.character_name` 是角色名，`data.prompt_text` 是角色提示词；
- `data.kind: "style"`：`data.name` 是画风名，`data.prompt_text` 是画风提示词；
- `data.kind: "artist-string"`：`data.title` 是画师串名称，`data.prompt_text` 是画师串提示词；
- `data.kind: "prompt-term"`：`data.tag` 是提示词条目。
- `data.kind: "work"`：`data.name` 是作品名，用于确定用户要求的作品语境。

同一 `data.kind` 出现多项时全部处理。任一 Generation Request 不能得到非空正向提示词时，请用户补充该项 Generation Request 的画面要求并结束本次执行。

读取 `query_semantic_comfyui_templates` 返回的 `parameters`。该数组每项包含 `parameter_id`、`kind`、`value_type` 和 `required`。对每项 Generation Request 分别执行以下映射和校验：`kind: "positive_prompt"` 必须恰好出现一次；把该项完整正向提示词写入对应 `parameter_id`。该项每个运行值必须按语义匹配唯一 `kind`，并写入对应 `parameter_id`。`value_type: "string"`、`"enum"`、`"asset_reference"` 或 `"image_reference"` 接受字符串，`"integer"` 接受整数，`"number"` 接受数字，`"boolean"` 接受布尔值。逐项检查所有 `required: true` 参数；必填参数没有对应值时，报告该 Generation Request 和参数的 `parameter_id`。用户值没有匹配参数时，报告该 Generation Request 和缺少的 `kind`。同一单值 `kind` 存在多个参数时，报告该 Generation Request 和全部冲突的 `parameter_id`。值不符合 `value_type` 时，报告该 Generation Request 和该值对应的 `parameter_id`。

必须在第一次调用 `generate_with_comfyui` 前完成全部 Generation Request 的映射和校验。任一 Generation Request 校验失败时结束本次执行，不创建任何 Run。

全部 Generation Request 校验通过后，按用户声明顺序为每项 Generation Request 调用一次 `generate_with_comfyui`：

- `title` 是该项 Generation Request 的简短标题；
- `template_id` 是所选 Workflow 模板的 `data.id`；
- `parameters` 只包含 `query_semantic_comfyui_templates` 返回的 `parameter_id` 与该项 Generation Request 的对应值。

每项 Tool Call 返回 `run_id` 后记录该 Generation Request 与 `run_id`。全部 Tool Call 成功后，按用户声明顺序返回每项 Generation Request 的 `run_id` 和已进入异步处理的状态。后续 Tool Call 失败时，返回已经创建的每个 `run_id`、失败的 Generation Request 和 Tool 错误；不自动重复已经成功的 Tool Call。
