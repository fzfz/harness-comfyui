---
文档用途: 定义 Prompt Builder 结果的校验顺序、约束和返回内容。
读取时机: comfyui-generate 执行者校验用于创建图片的结果 JSON 时。
---

# Prompt Builder 结果校验

## 输入定义与校验顺序

1. 本文件将负责构建图片生成 Prompt 结果的 Skill 称为 Prompt Builder。

2. 本文件将 `../SKILL.md` 的“创建图片”流程交给本文件校验的单个 JSON 对象称为结果 JSON。

3. Skill 执行者保持结果 JSON 的属性和值不变。Skill 执行者依次执行结构校验、负向模式校验和图片尺寸校验。

4. 结果 JSON 依次通过三项校验时，Skill 执行者在结果 JSON 之外记录校验结论“有效”。

5. 结果 JSON 未通过当前校验时，Skill 执行者在结果 JSON 之外记录校验结论“无效”。Skill 执行者停止后续校验，并向用户报告当前校验章节规定的错误内容。

## 结构校验

1. Skill 执行者使用 `references/prompt-result-schema.json` 校验结果 JSON 的属性名称、属性类型、必填属性、枚举值和额外属性。

2. 结果 JSON 出现结构错误时，Skill 执行者逐项报告错误。每项错误包含完整 JSON 路径、当前值和 JSON Schema 规定的约束。

3. 必填属性缺失时，Skill 执行者把该属性的当前值报告为“属性不存在”。

## 负向模式校验

1. `negative_mode` 为 `native_negative` 时，`negative_prompt` 必须是非空字符串，`positive_avoidance` 必须是 `null`。

2. `negative_mode` 为 `positive_rewrite` 时，`negative_prompt` 必须是 `null`，`positive_avoidance` 必须是非空字符串。

3. 可见画面状态指观察图片即可判断是否存在的具体表现。具体表现包括人物外观、物体、动作、构图、光照或环境。

4. 在 `positive_rewrite` 分支中，`positive_avoidance` 的全部内容必须由一个或多个图片需要呈现的可见画面状态组成。

5. Skill 执行者先识别 `positive_avoidance` 陈述的每一种可见画面状态，再逐项检查 `positive_prompt`；`positive_prompt` 直接陈述该状态或使用语义等价的肯定表述时，该状态通过检查。

6. 结果 JSON 未通过负向模式校验时，Skill 执行者报告 `negative_mode`、`negative_prompt`、`positive_avoidance` 和 `positive_prompt` 的当前值以及违反的具体规则。

7. `positive_prompt` 缺少 `positive_avoidance` 陈述的可见画面状态时，Skill 执行者同时报告缺少的具体状态。

## 图片尺寸校验

1. `width` 表示期望图片宽度，单位为像素。

2. `height` 表示期望图片高度，单位为像素。

3. `aspect_ratio` 表示期望图片宽度与高度的整数比，格式为 `宽度:高度`。

4. `megapixels` 表示用百万像素计量的期望图片面积。

5. Skill 执行者计算 `width` 和 `height` 的最大公约数 `gcd`，并构造字符串 `(width ÷ gcd):(height ÷ gcd)`。

6. Skill 执行者确认构造出的字符串与 `aspect_ratio` 完全一致。

7. Skill 执行者计算面积相对偏差 `abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels`，并确认相对偏差小于或等于 `0.05`。

8. 构造出的字符串与 `aspect_ratio` 不一致时，Skill 执行者报告 `width`、`height`、`aspect_ratio` 的当前值和构造出的字符串。

9. 面积相对偏差大于 `0.05` 时，Skill 执行者报告 `width`、`height`、`megapixels` 的当前值和相对偏差。

10. 两项图片尺寸检查均通过时，结果 JSON 通过图片尺寸校验。

## 返回“创建图片”流程

1. Skill 执行者将校验结论和已发现的全部错误返回给 `../SKILL.md` 的“创建图片”流程。
