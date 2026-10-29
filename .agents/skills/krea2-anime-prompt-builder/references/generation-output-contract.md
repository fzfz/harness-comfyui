---
文档用途: 规定 Krea2 生成结果的构造与校验。
读取时机: 按 SKILL.md 构造生成结果时。
---
# Krea2 Turbo 生成结果构造

## 结果来源

1. Skill 执行者使用 `references/generation-profiles.json` 取得 Krea2 模型路线、正向规避示例和画幅尺寸常量。

2. `references/generation-profiles.json` 的 `validation.megapixels_divisor` 提供像素数换算为百万像素的除数。

## 生成目的

1. Skill 执行者必须按照下列规则选择一个 `generation_purpose`：

   1. 当前结果没有明确的正式交付要求，且用户要求测试 Prompt 方向、比较 Prompt 方案、快速预览、批量筛选、根据图片或反馈修改 Prompt，或者继续迭代同一画面时，选择 `test`。
   2. 当前请求具体引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版，并且继续处理同一画面与同一主体时，Skill 执行者必须将该请求连接原测试链；生成目的按照本节第 1 项第 3 子项处理明确正式交付请求，其余情况继续选择 `test`。
   3. 用户明确要求当前结果作为正式生成、最终成图、交付图、海报或高质量结果时，选择 `final`。该交付要求优先于同一结果的测试、比较或迭代表述；从旧测试链转入正式生成时，用户还必须明确确认 Prompt 方案。
   4. 用户提出独立于旧任务的新画面时，Skill 执行者必须将其作为新任务处理。新画面没有测试、比较或迭代表述时选择 `final`。
   5. 无法确定当前请求是否连接旧测试链时，Skill 执行者必须请用户确认是继续测试还是开始新的正式任务。
   6. 用户在同一请求中同时要求测试结果与正式交付时，若用户已经明确划分各结果的画面要求和生成目的，Skill 执行者必须为每个结果分别执行当前 Skill，测试结果选择 `test`，正式结果选择 `final`；若用户没有划分各结果，Skill 执行者必须要求用户划分后停止当前执行。

2. Skill 执行者每次执行当前 Skill 只返回一个结果。用户要求比较多个 Prompt 方案时，Skill 执行者为每个已划分方案分别构造一个 `test` 结果；方案边界不明确时，Skill 执行者要求用户先划分方案。

## 画幅与清晰度

1. Skill 执行者必须根据主体、动作和镜头从 `references/generation-profiles.json` 选择完整的画幅配置（profile）。舞蹈迁移源图和鞋履完整全身图优先 `1:2`，一般全身立绘优先 `2:3`，横向人物与场景优先 `3:2` 或 `16:9`，中心主体可以使用 `1:1`，手机竖屏内容可以使用 `9:16`。`test` 使用所选 profile 的 `test` 尺寸，`final` 使用同一 profile 的 `final` 尺寸。

2. 用户覆盖尺寸时，Skill 执行者必须使用下列规则：

   1. 用户只指定 `aspect_ratio` 时，先把比例约分为正整数比，再从 `references/generation-profiles.json` 的画幅配置中查找相同比例并按生成目的回填尺寸。没有该比例时，要求用户同时提供 `width` 与 `height`。
   2. 用户同时提供正整数 `width` 与 `height` 时，使用约分后的 `width:height` 作为 `aspect_ratio`，使用 `width × height ÷ validation.megapixels_divisor` 作为 `megapixels`。只提供一个像素边长时，要求用户补齐另一个。
   3. 用户同时提供 `aspect_ratio` 与 `megapixels` 时，只能精确匹配同一 profile 的一个清晰度档位，然后回填 `width` 与 `height`。没有精确匹配时，要求用户提供完整像素尺寸。只提供 `megapixels` 时，要求用户补充 `aspect_ratio`。
   4. 用户提供全部四项时，Skill 执行者按当前校验模式帮助核对比例与清晰度约束。任一条件不成立时，要求用户选择一组完整表示。
   5. 允许的覆盖组合只有单独 `aspect_ratio`、完整 `width + height`、完整 `aspect_ratio + megapixels` 和全部四项。用户提供其他组合时，Skill 执行者必须在用户选择前保留已经提供的属性，列出形成合法组合所需的补充或撤回选择，并在用户选择前停止构造结果。例如，用户同时提供 `width` 与 `megapixels` 时，要求用户选择“补充 `height` 并撤回 `megapixels`”或“同时补充 `height` 与 `aspect_ratio` 后按全部四项检查”。

## Krea2 正向规避策略

1. Krea2 使用 `positive_rewrite`。Skill 执行者必须把 `negative_prompt` 设置为 `null`，并把待规避缺陷改写成可直接观察的正向画面约束。Skill 执行者可以从 `references/generation-profiles.json` 的 `model_routes[model_route].positive_avoidance_examples` 选择与本轮风险相符的表达，再按照具体主体改写。

2. 画面突出手部时，描述两只手、每只手的清晰手指数和自然连接。
3. 构图需要完整全身时，描述人物从头顶到鞋底完整入镜。
4. 画面包含多人或复杂动作时，描述每名人物的独立轮廓、明确间距和自然关节连接。
5. Skill 执行者只加入与本轮画面风险相关的约束，并把完整约束实际并入 `positive_prompt`。
6. `positive_avoidance` 必须用非空字符串记录已经并入 `positive_prompt` 的正向规避内容。

## 正向内容来源

1. Skill 执行者把完成自检的 Krea2 单条自然语言 Prompt 写入生成结果的 `positive_prompt`。
