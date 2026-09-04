---
name: comfyui-generate
description: 用户要求使用当前选择的 ComfyUI Workflow 创建图片、核对所选 Workflow 模板、生成模型和 LoRA 是否兼容、查询历史 Generation Run，或者在创建图片时复用历史 Seed 时使用。
---

## 查询历史 Generation Run 与复用 Seed

用户要求查询或核对一个或多个 `run_id` 保存的生成参数或 Actual Workflow，或者要求在创建图片时复用历史 Seed 时，本节适用。

Skill 执行者完整读取 `references/generation-cli.md`，并按照该文件取得每个 `run_id` 的查询结果。

用户只要求查询或核对历史 Generation Run 时，Skill 执行者返回 `runs[]` 中每一项的查询结果，然后结束本次任务。用户要求复用历史 Seed 创建图片时，Skill 执行者记录用户指定且 `lookup_status` 为 `available` 的每个 `runs[]` 项。Skill 执行者在“校验 Prompt Builder 结果并确定待创建图片”步骤确定待创建图片后，核对每张待创建图片与已记录 `runs[]` 项的对应关系；用户没有明确对应关系时，Skill 执行者列出每张待创建图片和每个已记录的 `runs[]` 项，并等待用户指定对应关系。Skill 执行者在“取得 Seed、构造 Generation Request 并提交”步骤按照 `references/generation-cli.md` 读取并检查对应 `runs[]` 项保存的 Seed。

## 核对当前选择

Skill 执行者完整读取 `references/catalog-cli.md`，并按照该文件确定 `template_id`、`model_id` 和 LoRA ID 有序列表。

创建图片或核对兼容性时，Skill 执行者必须确定一个 `template_id`，接受用户指定零个或一个 `model_id`，并可以确定零个至 100 个 LoRA ID。缺少 `template_id` 时，Skill 执行者报告当前请求缺少 Workflow 模板选择，并等待用户指定一个 `template_id`。存在多个候选 `template_id` 或多个候选 `model_id`，且用户没有指定唯一选择时，Skill 执行者列出对应的候选 ID，并等待用户指定最终选择。LoRA ID 超过 100 个时，Skill 执行者报告当前数量，并等待用户将 LoRA ID 减少到 100 个以内。

Skill 执行者按照 `references/catalog-cli.md` 查询 Workflow 模板、生成模型和各项 LoRA。用户指定了生成模型时，Skill 执行者采用该模型的查询结果；用户没有指定生成模型，并且 Workflow 模板查询结果的 `model_id` 非空时，Skill 执行者采用该默认生成模型的查询结果；用户没有指定生成模型，并且 Workflow 模板查询结果的 `model_id` 为 `null` 时，Skill 执行者报告当前 Workflow 模板没有默认生成模型，并等待用户指定一个 `model_id`。本节完成时必须存在一个已经采用的生成模型查询结果。

Workflow 模板查询结果、采用的生成模型查询结果和每项 LoRA 查询结果的 `base_model_id` 必须相同。存在不同的 `base_model_id` 时，Skill 执行者分别列出 Workflow 模板、生成模型和每项 LoRA 的 `id` 与 `base_model_id`，并等待用户指定要更换的 Workflow 模板、生成模型或 LoRA。

用户只要求核对兼容性时，Skill 执行者返回 Workflow 模板、采用的生成模型和每项 LoRA 的查询结果，以及这些查询结果的 `base_model_id` 比较结论，然后结束本次任务。

## 创建图片

### 1. 校验 Prompt Builder 结果并确定待创建图片

Skill 执行者完整读取 `references/prompt-result-contract.md`、`references/prompt-result-schema.json` 和 `references/prompt-builder-model-routes.json`。当前消息未包含用于创建图片的 Prompt Builder 结果 JSON 时，Skill 执行者报告当前请求缺少 Prompt Builder 结果 JSON，并等待用户提供。当前消息包含一个或多个用于创建图片的 Prompt Builder 结果 JSON 时，Skill 执行者按照 `references/prompt-result-contract.md` 逐个校验这些结果 JSON。

当前消息包含多个结果 JSON 时，Skill 执行者分别校验每个结果 JSON。结果 JSON 之间的边界不明确时，Skill 执行者列出无法划分的内容，并等待用户明确每个结果 JSON 的边界。

任一结果 JSON 无效时，Skill 执行者返回该结果的校验错误，并等待用户提供修正后的完整结果 JSON。

每个有效结果 JSON 默认创建一张图片。用户为某个结果 JSON 指定多张图片时，Skill 执行者按照结果 JSON 在当前消息中的出现顺序，并在每个结果 JSON 内按照图片序号顺序展开待创建图片。待创建图片总数必须为 1 至 20；总数超过 20 时，Skill 执行者报告当前总数，并等待用户减少图片数量。

### 2. 构造 Prompt 并分配生成模型和 LoRA

对于每个有效结果 JSON，Skill 执行者将 `positive_prompt` 用作正向 Prompt。`negative_mode` 为 `native_negative` 时，Skill 执行者将 `negative_prompt` 用作负向 Prompt；`negative_mode` 为 `positive_rewrite` 时，Skill 执行者省略负向 Prompt。

Skill 执行者按照 LoRA ID 有序列表和各项 LoRA 查询结果中 `trigger_words` 的数组顺序，建立触发词字符串有序列表；相同字符串出现多次时，Skill 执行者只保留第一次出现的字符串。Skill 执行者依次检查触发词字符串；正向 Prompt 尚未包含当前完整字符串时，Skill 执行者在非空正向 Prompt 末尾追加英文逗号、一个空格和当前字符串，正向 Prompt 为空时直接写入当前字符串。

每个结果 JSON 对应的图片都使用“核对当前选择”一节采用的生成模型查询结果和同一份 LoRA ID 有序列表。

### 3. 检查 Workflow 参数

Skill 执行者按照 `references/catalog-cli.md` 取得 `instance_id`，然后完整读取 `references/template-parameter-inspection-cli.md`。

Skill 执行者按照该文件查询 Workflow 参数，并根据查询结果确定正向 Prompt 对应的 `parameter_id`、`negative_mode` 为 `native_negative` 时负向 Prompt 对应的 `parameter_id`、Seed 对应的 `parameter_id`、`batch_size` 对应的 `parameter_id` 和参数值，以及图片尺寸对应的一个或多个 `parameter_id`。Skill 执行者按照该文件确定每张图片使用的各项尺寸参数和值。

### 4. 取得 Seed、构造 Generation Request 并提交

本次任务尚未完整读取 `references/generation-cli.md` 时，Skill 执行者完整读取该文件。Skill 执行者按照该文件确定每张图片的 Seed，并为每张图片构造一个 Generation Request。

Skill 执行者按照 `references/generation-cli.md` 检查全部 Generation Request。任一 Generation Request 未通过检查时，Skill 执行者返回该请求对应的图片序号和完整检查错误，不提交任何 Generation Request，并结束本次任务。全部 Generation Request 通过检查后，Skill 执行者按照“校验 Prompt Builder 结果并确定待创建图片”步骤确定的待创建图片顺序，逐项提交 Generation Request。

Skill 执行者把每次提交结果关联到对应的图片序号，并按照 `references/generation-cli.md` 处理成功、失败、重试或跳过结果。Skill 执行者按照图片顺序返回每次成功提交得到的 `run_id`。
