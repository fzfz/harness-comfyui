---
name: comfyui-generate
description: 解析当前消息中已选的 ComfyUI Workflow、生成模型和 LoRA，重写最终 Prompt，并通过项目 CLI 创建一个或多个异步图片生成运行；也可按一个或多个 run_id 独立查询历史 ComfyUI Generation Run 的原始生成参数和 Actual Workflow。用户要求开始生成、出图、运行已选 Workflow、核对兼容性或查询历史 run_id 时使用。
---

# ComfyUI Generate

## 查询历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 对应的生成参数或 Actual Workflow 时，Skill 执行者必须先完整读取 `references/generation-cli.md`，再按该文件调用历史 Generation Run 查询命令。该查询不要求当前消息包含 `comfyui-context`、Workflow、生成模型或 LoRA 选择。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别报告每个 `run_id`。一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。用户只要求查询历史 Generation Run 时，Skill 执行者返回查询结果后结束本次执行；用户还要求创建新 Run 时，Skill 执行者完成查询后继续执行本文件的生成流程。

## 1. 解析当前消息上下文

读取当前用户消息中的 `type: "comfyui-context"` JSON。每个对象的 `data.kind` 表示上下文用途，`data.id` 是数据源记录 ID。

当前消息必须恰好包含一个 `data.kind: "comfyui-template"` 对象。缺少模板或存在多个模板时，请用户选择一个 Workflow 模板并结束本次执行。

当前消息最多包含一个 `data.kind: "model"` 对象。存在多个生成模型时，请用户选择一个生成模型并结束本次执行。按消息顺序保存全部 `data.kind: "lora"` 对象。不要根据名称、文件名、模板默认值或历史消息猜测缺少的 ID。

## 2. Resolve 模板、生成模型和 LoRA

开始查询前读取 [references/catalog-cli.md](references/catalog-cli.md)，并按该文件定义的命令调用项目 CLI。

使用模板 `data.id` resolve 模板。存在生成模型上下文时，使用该对象的 `data.id` resolve 生成模型。按消息顺序使用每个 LoRA 的 `data.id` resolve LoRA。

每项 resolve 结果的 `id` 必须等于对应上下文 ID。CLI 返回非零退出码、结果缺少参考文档定义的属性或 ID 不相等时，报告具体对象、上下文 ID 和 CLI 错误并结束本次执行。

## 3. 校验模型兼容性

模板、所选生成模型与每项 LoRA 的 `base_model_id` 必须相同。模板 `model_id` 是 Workflow 保存的默认生成模型 ID；所选生成模型的 `id` 与 LoRA 的 `model_id` 不需要等于模板 `model_id`。

任一 `base_model_id` 不同时，报告模板 ID、冲突的生成模型或 LoRA ID 及各自的 `base_model_id`，然后结束本次执行。用户只要求核对兼容性时，返回 resolve 结果和兼容性结论，不创建 Generation Run。

## 4. 建立 Generation Request

用户明确要求多个独立生成结果时，按声明顺序建立多项 Generation Request；否则建立一项。每项分别保存简短标题、基础 Prompt、运行参数和适用 LoRA。用户没有为不同结果分配 LoRA 时，全部已选 LoRA 适用于每项 Generation Request。无法确定多个结果的边界、运行参数或 LoRA 归属时，请用户明确每项结果并结束本次执行。

Generation Request 的数量与同一 Generation Request 的提交次数是两个独立概念。用户没有声明重复提交次数时，每项 Generation Request 默认提交一次；用户明确要求同一 Generation Request 生成多个 Run 时，按用户要求的次数重复提交。默认一次不是提交次数上限。

按以下优先级取得每项 Generation Request 的基础 Prompt：

1. 用户在当前消息中为该结果明确提供的完整 Prompt；
2. 用户在当前消息中为该结果明确引用的本 Session 最近一条 Prompt Skill 输出；
3. 用户的画面要求与当前消息的角色、画风、画师串、提示词条目和作品上下文共同构成的完整 Prompt。

同一优先级存在多个完整 Prompt 候选且用户没有指定时，请用户选择一个并结束本次执行。无法得到非空基础 Prompt 时，请用户补充该项 Generation Request 的画面要求并结束本次执行。

## 5. 重写最终 Prompt 和 LoRA 执行值

对每项 Generation Request 依次处理其适用 LoRA。存在所选生成模型时，结合基础 Prompt、生成模型的 `description` 与 `usage`、每项 LoRA 的 `description`、`usage` 和 `trigger_words`，重写适配当前生成模型与全部 LoRA 的完整最终 Prompt。没有选择生成模型时，结合基础 Prompt 与每项 LoRA 的相同信息重写最终 Prompt。

保留用户的主体、动作、构图和场景意图。最终 Prompt 必须包含每项 LoRA 实际采用的触发词，且同一触发词只出现一次。

为每项适用 LoRA 建立执行对象：

- `id` 和 `file_name` 使用 resolve 结果的同名属性；
- `weight` 优先使用用户明确指定给该 LoRA 和该结果的权重，否则使用 resolve 结果的 `weight`；
- `trigger_words` 只保存最终 Prompt 实际采用的触发词，顺序与最终 Prompt 一致。

存在所选生成模型时，使用生成模型 resolve 结果的 `id` 和 `file_name` 建立生成模型执行对象。没有选择生成模型时使用 `null`，由 Workflow 使用其已保存的默认模型。

## 6. 建立运行参数

把完整最终 Prompt 写入 `parameters.positive_prompt`。用户提供的其他运行参数使用 [references/generation-cli.md](references/generation-cli.md) 定义的标准语义参数名；用户明确提供 Workflow 输入名时，也可把该输入名作为 `parameters` 属性名。值必须保持用户声明的 JSON 类型。

LoRA 文件、权重和触发词通过 `loras` 数组传递，不把 `lora_model`、`lora_model_weight`、`lora_clip_weight` 或 `lora_trigger_word` 写入 `parameters`。

在第一次提交前完成全部 Generation Request 的 resolve、Prompt 重写、LoRA 执行对象和运行参数检查。任一请求失败时结束本次执行，不创建 Run。

## 7. 查询实例并创建异步运行

第一次提交前读取 [references/generation-cli.md](references/generation-cli.md)。对每项 Generation Request 按用户声明顺序执行以下操作：

1. 调用实例目录命令；
2. 校验结果的 `status` 是 `ok`、`message` 是 `null`、`results` 是非空数组，且 `results[0].id` 是正十进制字符串；
3. 使用 `results[0].id` 作为当前 Generation Request 的 `instance_id`；
4. 用户没有声明重复提交次数时提交一次；用户明确要求多次时按要求次数提交；
5. 为每次独立提交分别发起一个前台 shell Tool Call，并使用参考文档定义的 JSON 数据结构调用生成提交命令；
6. 分别记录每次 CLI 调用返回的 `run_id` 或错误。

实例 ID 的唯一来源是当前实例目录结果的 `results[0].id`。不要使用模板 ID、生成模型 ID、LoRA ID、历史实例 ID 或猜测值替代实例目录结果。

同一 Generation Request 可以多次调用生成提交命令。每次独立提交使用单独的前台 shell Tool Call；重复提交同一请求时，每次调用使用完全相同的 Generation Request JSON。按照 [references/generation-cli.md](references/generation-cli.md) 处理成功、失败和再次提交，并保留每次调用的结果。

全部计划提交结束后，按用户声明顺序返回每项请求的全部 `run_id`、已接受异步处理结论和各次失败信息。只有取得额外的运行状态证据时才报告最终状态。
