---
文档用途: 规定 ANIMA 生成结果的构造与校验。
读取时机: 按 SKILL.md 构造生成结果时。
---
# ANIMA 生成结果构造

## 结果来源

1. Skill 执行者使用 `references/generation-profiles.json` 取得 ANIMA 模型路线、负向模式、基础负向项和画幅尺寸常量。

2. `references/generation-profiles.json` 的 `validation.megapixels_divisor` 提供像素数换算为百万像素的除数。

## 生成目的

1. Skill 执行者必须按照下列规则选择一个 `generation_purpose`：

   1. 用户在同一请求中同时要求测试结果与正式交付时，若用户已经明确划分各结果的画面要求和生成目的，Skill 执行者为每个结果分别执行当前 Skill，测试结果选择 `test`，正式结果选择 `final`；若用户没有划分各结果，Skill 执行者要求用户划分后停止当前执行。
   2. 对于一个结果，用户明确确认当前 Prompt 方案并要求正式生成、最终成图、交付图、海报或高质量结果时，选择 `final`。即使当前请求引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版，这条明确的正式交付要求仍然决定该结果选择 `final`。
   3. 当前结果没有明确的正式交付要求，并且用户要求测试 Prompt 方向、比较 Prompt 方案、快速预览、批量筛选、根据图片或反馈修改 Prompt，或者继续迭代同一画面时，选择 `test`。
   4. 当前结果没有明确的正式交付要求，并且请求具体引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版并继续处理同一画面与同一主体时，该请求连接原测试链并选择 `test`。
   5. 对于没有引用旧任务的新画面，Skill 执行者必须将其作为独立任务处理。新画面没有测试、比较、迭代或正式交付表述时选择 `final`。
   6. 无法确定当前请求是否连接旧测试链，或者无法确定用户是否要求正式交付时，Skill 执行者请用户确认生成目的，在收到确认后构造结果。

2. Skill 执行者每次执行当前 Skill 只返回一个结果。用户要求比较多个 Prompt 方案时，Skill 执行者为每个已划分方案分别构造一个 `test` 结果；方案边界不明确时，Skill 执行者要求用户先划分方案。

## 画幅与清晰度

1. Skill 执行者必须根据主体、动作和镜头从 `references/generation-profiles.json` 选择完整的画幅配置（profile）。全身立绘优先竖幅，双人横向互动或宽场景优先横幅，头像设定、中心主体或对称构图可以使用方形。`test` 使用所选 profile 的 `test` 尺寸，`final` 使用同一 profile 的 `final` 尺寸。

2. 用户覆盖尺寸时，Skill 执行者必须使用下列规则：

   1. 用户只指定 `aspect_ratio` 时，先把比例约分为正整数比，再从 `references/generation-profiles.json` 的画幅配置中查找相同比例并按生成目的回填尺寸。没有该比例时，要求用户同时提供 `width` 与 `height`。
   2. 用户同时提供正整数 `width` 与 `height` 时，使用约分后的 `width:height` 作为 `aspect_ratio`，使用 `width × height ÷ validation.megapixels_divisor` 作为 `megapixels`。只提供一个像素边长时，要求用户补齐另一个。
   3. 用户同时提供 `aspect_ratio` 与 `megapixels` 时，只能精确匹配同一 profile 的一个清晰度档位，然后回填 `width` 与 `height`。没有精确匹配时，要求用户提供完整像素尺寸。只提供 `megapixels` 时，要求用户补充 `aspect_ratio`。
   4. 用户提供全部四项时，Skill 执行者按当前校验模式帮助核对比例与清晰度约束。任一条件不成立时，要求用户选择一组完整表示。
   5. 允许的覆盖组合只有单独 `aspect_ratio`、完整 `width + height`、完整 `aspect_ratio + megapixels` 和全部四项。用户提供其他组合时，Skill 执行者必须在用户选择前保留已经提供的属性，列出形成合法组合所需的补充或撤回选择，并在用户选择前停止构造结果。例如，用户同时提供 `width` 与 `megapixels` 时，要求用户选择“补充 `height` 并撤回 `megapixels`”或“同时补充 `height` 与 `aspect_ratio` 后按全部四项检查”。

## ANIMA 负向策略

1. Skill 执行者使用 `references/generation-profiles.json` 中的 `anima-aesthetic-v1.1` 路线，并使用该路线的 `negative_mode` 和 `base_negative_items`。

2. Skill 执行者使用 `score_*` 时，必须将其限定在正向或负向其中一侧。
3. Skill 执行者只在本轮画面确实包含对应风险时，追加少量人体、手部、足部、多人粘连或文字伪影项。
4. Skill 执行者删除重复负向项。原生负向模式把基础负向项和本轮追加项写入非空 `negative_prompt`，并把 `positive_avoidance` 设置为 `null`；正向规避模式把这些项目改写为正向规避要求并写入非空 `positive_avoidance`，同时把 `negative_prompt` 设置为 `null`。

## 正向内容来源

1. Skill 执行者采用 SKILL.md 的“构建并校验提示词”通过格式校验的 `prompt_text`，写入生成结果的 `positive_prompt`。
