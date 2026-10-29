---
文档用途: 规定 WAI 生成结果的构造与校验。
读取时机: 按 SKILL.md 构造生成结果时。
---
# WAI 生成结果构造与校验

## 结构化数据来源

1. Skill 执行者使用 `references/generation-profiles.json` 选择 WAI 模型路线、负向模式、基础负向项和尺寸档位。生成结果的结构与校验按 SKILL.md 第 7 节执行。

2. `references/generation-profiles.json` 的 `validation.megapixels_divisor` 提供像素数换算为百万像素的除数。

## 选择生成目的

1. 每个生成结果必须使用一个 `generation_purpose`：

   1. 用户要求测试 Prompt、比较方案、快速预览或批量筛选时，Skill 执行者使用 `"test"`。用户要求根据旧 Prompt、旧图片、已有 Generation Run（图片生成运行记录）或用户反馈继续修改同一画面，并且没有明确要求正式生成、最终成图、交付图、海报或高质量结果时，Skill 执行者使用 `"test"`。
   2. 用户确认 Prompt 并要求正式生成、最终成图、交付图、海报或高质量结果时，Skill 执行者使用 `"final"`。
   3. 用户提出一个没有测试、比较或继续修改要求的新画面时，Skill 执行者使用 `"final"`。

2. 一次 Skill 执行只构造一个生成结果。用户要求同一次执行同时返回测试结果和正式结果时，Skill 执行者请求用户选择当前结果使用 `"test"` 或 `"final"`，并在用户选择前停止构造结果。

## 选择目标尺寸

1. 用户没有指定尺寸时，Skill 执行者按以下步骤选择配置：

   1. Skill 执行者逐项比较用户要求的主体数量、画面长宽方向和交付形式与 `references/generation-profiles.json` 中每个 `size_profiles[].composition`，并采用唯一符合用户要求的 `size_profiles[]` 项。
   2. 没有符合项时，Skill 执行者列出 `size_profiles[]` 中全部项的 `aspect_ratio` 和 `composition`，并请求用户选择。用户选择前，停止构造结果。
   3. 有多项同时符合时，Skill 执行者列出这些符合项的 `aspect_ratio` 和 `composition`，并请求用户选择。用户选择前，停止构造结果。
   4. 确定唯一项后，Skill 执行者按以下来源填写尺寸：

      1. `generation_purpose: "test"` 使用该项的 `test.width`、`test.height` 和 `test.megapixels`。
      2. `generation_purpose: "final"` 使用该项的 `final.width`、`final.height` 和 `final.megapixels`。
      3. 结果的 `aspect_ratio` 使用该项的 `aspect_ratio`。

2. 用户指定尺寸时，Skill 执行者按照用户提供的属性执行以下一项规则：

   1. 用户只提供 `aspect_ratio` 时，Skill 执行者按以下步骤处理：

      1. Skill 执行者把比例约分为正整数比，并在 `size_profiles[]` 中查找 `aspect_ratio` 相同的唯一项。
      2. 找到唯一项后，Skill 执行者把约分后的比例写入生成结果的 `aspect_ratio`。
      3. 找到唯一项后，Skill 执行者按 `generation_purpose` 选用该项的 `test` 或 `final` 尺寸档位，把档位的 `width`、`height` 和 `megapixels` 分别写入生成结果的同名属性。
      4. 没有找到唯一项时，Skill 执行者请求用户用同时且只包含 `width` 和 `height` 的新尺寸输入替换当前尺寸输入。用户提供前，停止构造结果。

   2. 用户同时且只提供 `width` 和 `height` 时，两个值必须是正整数。Skill 执行者把用户提供的 `width` 和 `height` 分别写入生成结果的同名属性，把 `width:height` 约分后写入生成结果的 `aspect_ratio`，并把 `width × height ÷ validation.megapixels_divisor` 写入生成结果的 `megapixels`。
   3. 用户同时且只提供 `aspect_ratio` 和 `megapixels` 时，Skill 执行者按以下步骤处理：

      1. Skill 执行者核对 `aspect_ratio` 为约分后的正整数比，`megapixels` 为正有限数值，再在 `size_profiles[]` 的 `test` 和 `final` 尺寸档位中查找同时具有相同 `aspect_ratio` 和 `megapixels` 的唯一档位。
      2. 找到唯一档位后，Skill 执行者把用户提供的 `aspect_ratio` 和 `megapixels` 以及该档位的 `width` 和 `height` 分别写入生成结果的同名属性。
      3. 没有找到唯一档位时，Skill 执行者请求用户补充 `width` 和 `height`。收到后，按照本节第 2 项第 4 子项处理全部 4 项尺寸属性。用户补充前，停止构造结果。

   4. 用户同时提供 `aspect_ratio`、`width`、`height` 和 `megapixels` 时，Skill 执行者按当前校验模式帮助核对比例与清晰度约束。全部属性通过后，分别写入生成结果的同名属性。

3. 尺寸输入不符合本节第 2 项时，Skill 执行者按以下步骤处理：

   1. 属性组合不符时，Skill 执行者列出已经收到的尺寸属性，并请求用户选择本节第 2 项定义的一种组合。
   2. 属性组合正确但属性值不符时，Skill 执行者逐项指出不符合要求的属性，以及本节第 2 项对应规则的数值要求，并请求用户修正。
   3. 用户提供有效尺寸输入前，Skill 执行者停止构造结果。

## 构造正向与负向内容

1. Skill 执行者按 [SKILL.md 第 7 节](../SKILL.md#7-构造并校验生成结果) 采用 `prompt_text`，写入生成结果的 `positive_prompt`。

2. Skill 执行者使用 `references/generation-profiles.json` 中 `model_routes.wai-illustrious-sdxl` 的属性构造以下结果：

   1. `model_route` 使用 `"wai-illustrious-sdxl"`。
   2. `negative_mode` 使用该路线的 `negative_mode`。
   3. Skill 执行者按以下步骤构造 `negative_prompt`：

      1. Skill 执行者按原顺序复制该路线的 `base_negative_items[]`。
      2. Skill 执行者按用户要求出现的顺序，把每项明确排除内容写成一个或多个英文标签或短语，再按写出顺序追加。
      3. Skill 执行者删除完全相同的重复字符串。
      4. Skill 执行者使用 `, ` 连接全部字符串。

   4. `positive_avoidance` 使用 `null`。
