# Prompt Builder 结果校验

## 输入与结果

本文件将负责构建图片生成 Prompt 结果的 Skill 称为 Prompt Builder。

本文件将 `../SKILL.md` 的“创建图片”流程交给本文件校验的单个 JSON 对象称为结果 JSON。

Skill 执行者保持结果 JSON 的属性和值不变，并按照结构校验、模型路线校验、负向模式校验和图片尺寸校验的顺序执行；当前校验未通过时，Skill 执行者停止执行后续校验。

结果 JSON 依次通过四项校验时，Skill 执行者在结果 JSON 之外记录校验结论“有效”。

结果 JSON 未通过当前校验时，Skill 执行者在结果 JSON 之外记录校验结论“无效”，停止执行后续校验，并向用户报告当前校验章节规定的错误内容。

## 结构校验

Skill 执行者使用 `references/prompt-result-schema.json` 校验结果 JSON 的属性名称、属性类型、必填属性、枚举值和额外属性。

结果 JSON 出现一项或多项结构错误时，Skill 执行者逐项报告每个错误所在的完整 JSON 路径、该路径的当前值和 JSON Schema 对该路径规定的约束。

必填属性缺失时，Skill 执行者把该属性的当前值报告为“属性不存在”。

结果 JSON 通过结构校验后，Skill 执行者继续执行模型路线校验。

## 模型路线校验

Skill 执行者读取结果 JSON 的 `model_route`，并检查 `references/prompt-builder-model-routes.json` 的 `model_routes` 对象是否包含该 `model_route`。

`model_routes` 不包含结果 JSON 的 `model_route` 时，结果 JSON 未通过模型路线校验。Skill 执行者报告结果 JSON 的 `model_route`，并说明该值没有对应的 Prompt Builder。

`model_routes` 包含结果 JSON 的 `model_route` 时，Skill 执行者从 `model_routes` 中读取该路线的 `skill_name`，并从“核对当前选择”步骤采用的生成模型查询结果中读取 `id` 和 `skill_name`。用户指定了生成模型时，该查询结果属于用户指定的生成模型；用户没有指定生成模型时，该查询结果属于 Workflow 模板保存的默认生成模型。

采用的生成模型查询结果中 `skill_name` 为 `null` 时，结果 JSON 未通过模型路线校验。Skill 执行者报告结果 JSON 的 `model_route`、该路线对应的 `skill_name`、生成模型查询结果的 `id` 和空 `skill_name`。

路线的 `skill_name` 与生成模型查询结果的非空 `skill_name` 相同时，结果 JSON 通过模型路线校验。两个 `skill_name` 不相同时，结果 JSON 未通过模型路线校验；Skill 执行者报告结果 JSON 的 `model_route`、该路线对应的 `skill_name`、生成模型查询结果的 `id` 和生成模型查询结果的 `skill_name`。

结果 JSON 通过模型路线校验后，Skill 执行者继续执行负向模式校验。

## 负向模式校验

`negative_mode` 为 `native_negative` 时，`negative_prompt` 必须是非空字符串，`positive_avoidance` 必须是 `null`。

`negative_mode` 为 `positive_rewrite` 时，`negative_prompt` 必须是 `null`，`positive_avoidance` 必须是非空字符串。

本文件所称可见画面状态，是指观察图片即可判断是否存在的具体人物外观、物体、动作、构图、光照或环境表现。

在 `positive_rewrite` 分支中，`positive_avoidance` 的全部内容必须由一个或多个图片应当呈现的可见画面状态组成。

Skill 执行者先识别 `positive_avoidance` 陈述的每一种可见画面状态，再逐项检查 `positive_prompt`；`positive_prompt` 直接陈述该状态或使用语义等价的肯定表述时，该状态通过检查。

结果 JSON 未通过负向模式校验时，Skill 执行者报告 `negative_mode`、`negative_prompt`、`positive_avoidance` 和 `positive_prompt` 的当前值以及违反的具体规则。

`positive_prompt` 缺少 `positive_avoidance` 陈述的可见画面状态时，Skill 执行者同时报告缺少的具体状态。

结果 JSON 通过负向模式校验后，Skill 执行者继续执行图片尺寸校验。

## 图片尺寸校验

`width` 表示期望图片宽度，单位为像素。

`height` 表示期望图片高度，单位为像素。

`aspect_ratio` 表示期望图片宽度与高度的整数比，格式为 `宽度:高度`。

`megapixels` 表示用百万像素计量的期望图片面积。

结构校验已经确认 `width` 和 `height` 是正整数，并确认 `megapixels` 是大于 `0` 的有限数值。

Skill 执行者计算 `width` 和 `height` 的最大公约数 `gcd`，并构造字符串 `(width ÷ gcd):(height ÷ gcd)`。

Skill 执行者确认构造出的字符串与 `aspect_ratio` 完全一致。

Skill 执行者计算 `abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels`，并确认计算结果小于或等于 `0.05`。

构造出的字符串与 `aspect_ratio` 不一致时，Skill 执行者报告 `width`、`height`、`aspect_ratio` 的当前值和构造出的字符串。

百万像素计算结果大于 `0.05` 时，Skill 执行者报告 `width`、`height`、`megapixels` 的当前值和计算结果。

两项图片尺寸检查均通过时，结果 JSON 通过图片尺寸校验。

## 返回“创建图片”流程

Skill 执行者按照本文件规定的校验顺序得到结论后，把结果 JSON 的“有效”或“无效”结论以及已经发现的全部错误返回给 `../SKILL.md` 的“创建图片”流程。
