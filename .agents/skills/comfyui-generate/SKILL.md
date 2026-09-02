---
name: comfyui-generate
description: 解析当前消息中已选的 ComfyUI Workflow、生成模型和 LoRA，重写最终 Prompt，并通过项目 CLI 创建一个或多个异步图片生成运行；也可按一个或多个 run_id 独立查询历史 ComfyUI Generation Run 的原始生成参数和 Actual Workflow。用户要求开始生成、出图、运行已选 Workflow、核对兼容性或查询历史 run_id 时使用。
---

# ComfyUI Generate

## 查询历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 对应的生成参数或 Actual Workflow 时，Skill 执行者必须先完整读取 `references/generation-cli.md`，再按该文件调用历史 Generation Run 查询命令。该查询不要求当前消息包含 `comfyui-context`、Workflow、生成模型或 LoRA 选择。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别报告每个 `run_id`。一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。用户只要求查询历史 Generation Run 时，Skill 执行者返回查询结果后结束本次执行；用户还要求创建新 Run 时，Skill 执行者完成查询后继续执行本文件的生成流程。

## 1. 解析 Prompt Builder 结果与当前消息

用户要求创建新图片时，Skill 执行者必须在解析任何 Prompt Builder 结构化结果以前完整读取 `references/prompt-result-contract.md` 与 `references/prompt-result-schema.json`，再按这两个文件校验每个明确划分的 Builder 结果。多个结果的边界不明确时，请用户先划分结果并结束本次执行。

读取当前用户消息中的 `type: "comfyui-context"` JSON。当前消息必须恰好包含一个 `data.kind: "comfyui-template"` 对象，最多包含一个 `data.kind: "model"` 对象，并按消息顺序保存全部 `data.kind: "lora"` 对象。缺少模板、存在多个模板或存在多个生成模型时，请用户完成唯一选择并结束本次执行。Skill 执行者不得根据名称、文件名、模板默认值或历史消息猜测缺少的 ID。

## 2. Resolve 模板、生成模型、LoRA 和实例

Skill 执行者必须在第一次目录查询前完整读取 `references/catalog-cli.md`，并按该文件依次 resolve 当前模板、可选生成模型与全部 LoRA。每项 resolve 结果的 `id` 必须等于对应上下文 ID。

模板、所选生成模型与每项 LoRA 的 `base_model_id` 必须相同。任一结果缺失、ID 不相等或 `base_model_id` 冲突时，Skill 执行者报告具体对象与冲突值并停止。用户只要求核对兼容性时，Skill 执行者返回 resolve 结果和兼容性结论，不创建 Generation Run。

创建新图片时，Skill 执行者继续按 `references/catalog-cli.md` 查询当前实例目录，并取得当前可用的非空 `instance_id`。

## 3. 构造最终 Prompt 与 LoRA 执行对象

Skill 执行者按照 `references/prompt-result-contract.md` 消费每个 Builder 结果。生成模型和 LoRA resolve 结果可以用于重写适配当前模型的最终正向 Prompt；重写必须保留 Builder 的主体、动作、构图、场景、质量要求和正向规避内容。最终正向 Prompt 必须包含每项实际采用的 LoRA 触发词，且同一触发词只出现一次。

Skill 执行者使用各项 resolve 结果构造生成模型与 LoRA 执行对象。LoRA 文件、权重和触发词只通过 Generation Request 的 `loras` 数组传递。用户没有划分不同结果的 LoRA 归属时，全部已选 LoRA 适用于每个结果；归属不明确时，请用户确认后停止。

## 4. 检查模板实际参数并适配尺寸

模板 resolve 已取得非空 `template_id` 且实例目录已取得非空 `instance_id` 后，Skill 执行者必须在组织第一条模板检查命令或把 Builder 目标尺寸转换为实际参数以前完整读取 `references/template-parameter-inspection-cli.md`。

Skill 执行者按该文件检查每组唯一模板与实例，确认当前模板实际接受正向 Prompt、当前负向模式需要的负向分支、Seed 和一种完整尺寸表示，再按该文件选择原值尺寸或允许范围内的调整尺寸。检查错误发生后，Skill 执行者必须在修正输入或重试以前重新读取该文件的“错误、修正与重试”章节。

## 5. 取得 Seed、建立请求并提交

Skill 执行者必须在解析或校验任一 Seed、查询历史 Seed、取得随机 Seed、构造任一 Generation Request 或首次提交以前完整读取 `references/generation-cli.md`。

Skill 执行者按该文件把每张图片建立为一个独立请求，使用模板检查返回的精确运行参数 ID，并在创建任何 Run 前完成全部结果解析、目录 resolve、兼容性、Prompt、LoRA、模板检查、尺寸和 Seed 检查。任一项失败时不创建 Run。

Skill 执行者按用户声明顺序为每项请求发起独立前台 shell Tool Call，并按 `references/generation-cli.md` 处理成功、失败与重试。任一历史查询、随机 Seed 或提交命令返回错误后，Skill 执行者必须在修改输入或再次调用以前重新读取该文件的“错误、修正与重试”章节。全部计划提交结束后，Skill 执行者按顺序返回各项 `run_id`、已接受异步处理结论和各次失败信息。只有取得额外运行状态证据时才报告最终状态。

当前上下文经过压缩而不再完整保留对应参考内容时，Skill 执行者必须在下一次结果解析、目录解析、模板检查、检查结果消费、尺寸适配、Seed 处理、请求构造或 CLI 调用前重新完整读取对应参考文件。
