# Prompt Builder 结果消费合同

## 输入边界

Skill 执行者必须使用 `prompt-result-schema.json` 校验当前消息明确引用的 Prompt Builder 结果。每个逻辑结果恰好消费一个 Builder 结果对象；一次 Skill 执行可以处理多个已经明确划分的逻辑结果，并分别建立 Generation Request，不能合并多个 `positive_prompt` 或多个生成目的。

结果必须恰好包含 schema 定义的十个属性。结果缺少属性、包含额外属性、类型不符或枚举不符时，Skill 执行者必须报告具体属性并要求 Prompt Builder 重新给出完整结果。生成 Skill不得为缺失属性猜值，也不得从结果读取 `seed`、`seed_mode` 或其他 Seed 决定。

## 模型路线与生成目的

`model_route` 表示 Prompt Builder 采用的模型路线。Skill 执行者必须结合当前已选生成模型的 resolve 结果确认路线一致；明确不一致时停止提交，并要求用户选择对应模型或重新构建 Prompt。

`generation_purpose` 表示 Builder 已经选择测试档或正式档。生成 Skill使用结果中的完整目标尺寸，不把 `test` 自行提升为正式尺寸，也不把 `final` 自行缩小为测试尺寸。实际模板不接受原目标时，尺寸调整只按模板检查参考处理。

## 正向 Prompt 与负向分支

Skill 执行者把非空 `positive_prompt` 作为当前 Generation Request 的基础正向 Prompt。生成 Skill为所选 LoRA 重写最终 Prompt 时，必须保留 Builder 的主体、动作、构图、场景和质量约束。

`negative_mode` 只允许以下两条分支：

- `native_negative`：`negative_prompt` 必须是非空字符串，`positive_avoidance` 必须是 `null`。生成 Skill把最终正向 Prompt 写入实际正向参数，把 `negative_prompt` 原样写入实际负向参数。
- `positive_rewrite`：`negative_prompt` 必须是 `null`，`positive_avoidance` 必须是非空字符串，并且该字符串表达的可见约束必须已经出现在 `positive_prompt` 中。生成 Skill重写 LoRA Prompt 时必须保留这些约束，并且不得创建任何负向 Prompt 参数。

属性组合不符合对应分支时，生成 Skill停止提交并要求 Prompt Builder 修正结果。生成 Skill不把原生负向文本改写成正向规避，也不为正向规避路线合成负向文本。

## 模板无关目标尺寸

`aspect_ratio`、`width`、`height` 和 `megapixels` 同时描述一个模板无关目标。生成 Skill必须确认：

1. `width` 与 `height` 是正整数；`aspect_ratio` 是两者约分后的正整数比。
2. `megapixels` 是正有限数值，并且 `abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels <= 0.05`。

生成 Skill不得因为结果包含 `width` 与 `height` 就假定模板使用精确尺寸参数，也不得因为结果包含 `aspect_ratio` 与 `megapixels` 就假定模板使用 Selector。生成 Skill必须先按模板参数检查参考取得实际候选，再选择一种实际尺寸表示。

## 拒绝与修正

以下任一情况发生时，生成 Skill不得建立或提交 Generation Request：

- 结果没有通过 `prompt-result-schema.json`；
- `model_route` 与当前明确选择的模型路线冲突；
- `negative_mode`、`negative_prompt` 与 `positive_avoidance` 的组合冲突；
- 正向规避文本没有实际进入 `positive_prompt`；
- 目标比例、像素尺寸和百万像素值不一致。

Skill 执行者必须报告冲突属性、当前值和预期组合。修正后的结果必须重新按本文件从头检查。
