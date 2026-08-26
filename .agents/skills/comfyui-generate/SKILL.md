---
name: comfyui-generate
description: 解析当前消息中已选的 ComfyUI Workflow、生成模型和 LoRA，重写最终 Prompt，并创建一个或多个异步图片生成运行。用户要求开始生成、出图或运行已选 Workflow 时使用。
---

# ComfyUI Generate

## 1. 解析当前消息上下文

读取当前用户消息中的 `type: "comfyui-context"` JSON。每个对象的 `data.kind` 表示上下文用途，`data.id` 是数据源记录 ID。

当前消息恰好包含一个 `data.kind: "comfyui-template"` 对象时进入下一步。缺少模板或存在多个模板时，请用户选择一个 Workflow 模板并结束本次执行。

当前消息最多包含一个 `data.kind: "model"` 对象。存在多个生成模型时，请用户选择一个生成模型并结束本次执行。按消息顺序保存全部 `data.kind: "lora"` 对象；每个 LoRA 的 `data.id` 是后续 resolve 的唯一身份，`data.file_name` 只用于向用户指明具体选择。

## 2. Resolve 模板、生成模型和 LoRA

使用模板 `data.id` 调用一次 `query_semantic_comfyui_templates`。取得模板 `id`、`title`、`base_model_id`、可选 `model_id` 和 `parameters`。返回 `id` 与消息模板 ID 不同、查询失败或结果不完整时，报告具体模板查询错误并结束本次执行。

存在生成模型上下文时，使用该对象的 `data.id` 调用一次 `query_semantic_generation_models`。取得 `id`、`base_model_id`、`file_name`、`description`、`usage` 和可选 `skill_name`。返回 ID 与消息生成模型 ID 不同或查询失败时，报告具体生成模型查询错误并结束本次执行。

按消息顺序为每个 LoRA 使用 `data.id` 调用一次 `query_semantic_loras`。每项结果包含：

- `id`：LoRA 数据源身份；
- `base_model_id`：LoRA 所属底模；
- `model_id`：LoRA 关联的生成模型；
- `file_name`：Host 用于解析目标实例实际路径的文件名；
- `description`：LoRA 的视觉效果、适用主体和适用场景；
- `usage`：LoRA 的使用方式与触发词选择说明；
- `trigger_words`：可用于重写 Prompt 的触发词；
- `weight`：用户没有指定权重时采用的模型权重。

任一 LoRA 返回 ID 与消息 ID 不同、查询失败或缺少上述字段时，报告该 LoRA 的消息 ID 与具体查询错误并结束本次执行。

## 3. 校验模型兼容性

模板、所选生成模型与每项 LoRA 的 `base_model_id` 必须相同。模板 `model_id` 表示 Workflow 当前保存的默认生成模型；所选生成模型的 `id` 与每项 LoRA 的 `model_id` 均不需要等于模板 `model_id`。任一 `base_model_id` 不同时，报告模板 ID、冲突的生成模型或 LoRA ID 及各自的 `base_model_id`，然后结束本次执行。

## 4. 建立 Generation Request

用户明确要求多个独立生成结果时，按声明顺序建立多项 Generation Request；否则建立一项。每项分别保存简短标题、正向提示词候选、运行值和适用 LoRA。用户没有为不同结果分配 LoRA 时，全部已选 LoRA 适用于每项 Generation Request。无法确定多个结果的边界、运行值或 LoRA 归属时，请用户明确每项结果并结束本次执行。

按以下优先级取得每项 Generation Request 的基础 Prompt：

1. 用户在当前消息中为该结果明确提供的完整 Prompt；
2. 用户在当前消息中为该结果明确引用的本 Session 最近一条 Prompt Skill 输出；
3. 用户的画面要求与当前消息的角色、画风、画师串、提示词条目和作品上下文共同构成的完整 Prompt。

同一优先级存在多个完整 Prompt 候选且用户没有指定时，请用户选择一个并结束本次执行。无法得到非空基础 Prompt 时，请用户补充该项 Generation Request 的画面要求并结束本次执行。

## 5. 重写最终 Prompt 和 LoRA 执行值

对每项 Generation Request 依次处理其适用 LoRA。存在所选生成模型时，结合基础 Prompt、生成模型 resolve 返回的 `description` 与 `usage`、每项 LoRA 的 `description`、`usage` 和 `trigger_words`，重写适配当前生成模型与全部 LoRA 的完整最终 Prompt。没有选择生成模型时，结合基础 Prompt 与每项 LoRA 的 `description`、`usage` 和 `trigger_words` 重写完整最终 Prompt。保留用户的主体、动作、构图和场景意图；根据 LoRA 用途调整相关表现，并只使用该结果实际需要的触发词。最终 Prompt 必须包含每项 LoRA 实际采用的触发词，且同一触发词只出现一次。

为每项适用 LoRA 建立一个执行对象：

- `id` 使用 resolve 返回的 `id`；
- `file_name` 使用 resolve 返回的 `file_name`，保持原字符串，不拼接目录或路径分隔符；
- `weight` 优先使用用户明确指定给该 LoRA 和该结果的权重，否则使用 resolve 返回的 `weight`；
- `trigger_words` 只保存该结果最终 Prompt 实际采用的触发词，顺序与最终 Prompt 一致。

存在所选生成模型时，为每项 Generation Request 建立同一个生成模型执行对象：`id` 和 `file_name` 分别使用生成模型 resolve 返回的同名字段。`file_name` 保持原字符串，不拼接目录或路径分隔符。没有选择生成模型时不建立生成模型执行对象，Workflow 使用模板保存的默认生成模型。

## 6. 映射模板运行参数

读取模板 `parameters` 中每项 `parameter_id`、`kind`、`value_type` 和 `required`。LoRA 文件、权重和触发词通过 Generation Tool 的 `loras` 数组传递，因此不把 `lora_model`、`lora_model_weight`、`lora_clip_weight` 或 `lora_trigger_word` 写入模板 `parameters`。

对每项 Generation Request，把完整最终 Prompt 写入全部 `kind: "positive_prompt"` 参数。其余用户运行值按语义匹配模板 `kind`：字符串类 value type 接受字符串，`integer` 接受整数，`number` 接受数字，`boolean` 接受布尔值。逐项校验除四种 LoRA kind 以外的全部 `required: true` 参数。用户值没有对应模板 kind、值类型不符或一个不可广播的单值 kind 对应多个参数时，报告该 Generation Request、具体 kind 和相关 `parameter_id`。

在第一次调用 `generate_with_comfyui` 前完成全部 Generation Request 的 resolve、Prompt 重写、LoRA 执行对象、参数映射和校验。任一请求失败时结束本次执行，不创建 Run。

## 7. 查询实例并创建异步运行

完成全部 Generation Request 的 resolve、Prompt 重写、LoRA 执行对象、参数映射和校验后，按用户声明顺序逐项创建运行。每项 Generation Request 都先调用一次 `query_semantic_comfyui_instances`，使用以下 search 请求读取该 Tool 当前返回的实例目录：

```json
{"mode":"search","query":"","page":1,"page_size":100}
```

成功响应必须满足 `status: "ok"`、`message: null`、`results` 是非空数组，且 `results[0].id` 是正整数或正十进制整数字符串。把 `results[0].id` 转为十进制字符串，作为该项 Generation Request 的实例 ID。实例 ID 的唯一来源是本次查询的 `results[0].id`；模板、生成模型、LoRA 和运行参数不参与实例选择。

实例查询失败、成功响应结构无效、`results` 为空或第一个实例 ID 无效时，结束本次执行，不为当前及后续 Generation Request 调用 `generate_with_comfyui`。此前已经成功创建 Run 时，返回每个已创建的 `run_id`、当前失败的 Generation Request 和具体实例查询错误。

实例查询通过后，立即为当前 Generation Request 调用一次 `generate_with_comfyui`：

- `title` 使用该项 Generation Request 的简短标题；
- `instance_id` 使用本次实例查询得到的十进制字符串 ID；
- `template_id` 使用模板上下文的 `data.id`；
- 存在生成模型执行对象时，`model` 使用该对象；没有生成模型执行对象时省略 `model`；
- `parameters` 只包含模板返回的非 LoRA `parameter_id` 与该项请求的对应值；
- `loras` 使用该项请求的 LoRA 执行对象数组。

每项 Tool Call 返回 `run_id` 后记录该请求与 `run_id`。全部调用成功后，按用户声明顺序返回每项请求的 `run_id` 和异步处理状态。后续调用失败时，返回已经创建的每个 `run_id`、失败的 Generation Request 和 Tool 错误；已成功的 Tool Call 不重复提交。
