# WAI-Illustrious-SDXL 生成结果合同

## 结果来源

Skill 执行者必须使用 `generation-output-schema.json` 取得结果属性、类型、枚举、必填性和额外属性限制，使用 `generation-profiles.json` 取得 WAI 模型路线、负向模式、基础负向项和画幅尺寸常量。本文件只定义这些结构化数据的选择语义。

Prompt Builder 只设计模板无关的画面目标。历史查询可以返回 Actual Workflow 和包含 Seed 的生成参数；Prompt Builder 可以按本 Skill 的历史查询参考读取或报告历史 Prompt 与 Actual Workflow，但不依据当前或历史 Workflow 的模板参数能力调整目标尺寸。Prompt Builder 不解析、选择、校验、复用或输出 Seed 决定，也不检查模板参数。

## 生成目的

Skill 执行者必须按照下列规则选择一个 `generation_purpose`：

1. 用户要求测试 Prompt 方向、比较 Prompt 方案、快速预览、批量筛选、根据图片或反馈修改 Prompt，或者继续迭代同一画面时，选择 `test`。
2. 当前请求具体引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版，并且继续处理同一画面与同一主体时，该请求连接原测试链并继续选择 `test`。
3. 用户明确确认 Prompt 方案并要求正式生成、最终成图、交付图、海报或高质量结果时，选择 `final`。
4. 没有引用旧任务的新画面不连接可见的旧测试链。新画面没有测试、比较或迭代表述时选择 `final`。
5. 无法确定当前请求是否连接旧测试链时，Skill 执行者必须请用户确认是继续测试还是开始新的正式任务。
6. 用户在同一请求中同时要求测试结果与正式交付时，若用户已经明确划分各结果的画面要求和生成目的，Skill 执行者必须把每个结果作为独立 Builder 执行，测试结果选择 `test`，正式结果选择 `final`；若用户没有划分各结果，Skill 执行者必须要求用户划分后停止当前执行。

一次 Builder 执行只返回一个结果。用户要求比较多个 Prompt 方案时，Skill 执行者为每个已划分方案分别构造一个 `test` 结果；方案边界不明确时，Skill 执行者要求用户先划分方案。一个结果不能同时表示测试和正式生成。

## 画幅与清晰度

Skill 执行者必须根据主体、动作和镜头从 `generation-profiles.json` 选择完整 profile。全身立绘优先竖幅，双人横向互动或宽场景优先横幅，头像设定、中心主体或对称构图可以使用方形。`test` 使用所选 profile 的 `test` 尺寸，`final` 使用同一 profile 的 `final` 尺寸。

用户覆盖尺寸时，Skill 执行者必须使用下列规则：

1. 用户只指定 `aspect_ratio` 时，先把比例约分为正整数比，再从 profiles 中查找相同比例并按生成目的回填尺寸。没有该比例时，要求用户同时提供 `width` 与 `height`。
2. 用户同时提供正整数 `width` 与 `height` 时，使用约分后的 `width:height` 作为 `aspect_ratio`，使用 `width × height ÷ 1,000,000` 作为 `megapixels`。只提供一个像素边长时，要求用户补齐另一个。
3. 用户同时提供 `aspect_ratio` 与 `megapixels` 时，只能精确匹配同一 profile 的一个清晰度档位，然后回填 `width` 与 `height`。没有精确匹配时，要求用户提供完整像素尺寸。只提供 `megapixels` 时，要求用户补充 `aspect_ratio`。
4. 用户提供全部四项时，约分后的像素比例必须等于 `aspect_ratio`；`abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels` 必须小于或等于 `0.05`。任一条件不成立时，要求用户选择一组完整表示。
5. 允许的覆盖组合只有单独 `aspect_ratio`、完整 `width + height`、完整 `aspect_ratio + megapixels` 和全部四项。其他组合不得丢弃用户已经提供的属性，必须列出形成合法组合所需的补充或撤回选择，并在用户选择前停止构造结果。例如，用户同时提供 `width` 与 `megapixels` 时，要求用户选择“补充 `height` 并撤回 `megapixels`”或“同时补充 `height` 与 `aspect_ratio` 后按全部四项检查”；不能只补充 `height` 后静默忽略 `megapixels`。

## WAI 负向策略

Skill 执行者必须使用 `generation-profiles.json` 中 WAI 路线的 `negative_mode` 和 `base_negative_items`。

- Skill 执行者先使用基础负向项，再只针对本轮可见主体追加少量缺陷项。手部清晰入镜时可以追加手指或手部缺陷项；多人接触时可以追加肢体粘连项。
- Skill 执行者不自动把 `sensitive`、`nsfw` 或 `explicit` 写入负向 Prompt；只有用户明确要求排除对应画面类型时才加入。
- Skill 执行者删除重复质量项和缺陷项，并保持负向 Prompt 简短。
- WAI 的原生负向模式必须设置非空 `negative_prompt`，并把 `positive_avoidance` 设置为 `null`。

## 结果构造与校验

Skill 执行者完成 WAI 位置化 Prompt 的原有格式校验以后，把该校验器产生的最终 Prompt 文本写入 `positive_prompt`，再按照 `generation-output-schema.json` 构造一个结果对象。结果不得包含 `seed`、`seed_mode` 或任何 Seed 决定。

Skill 执行者必须把结果 JSON 通过标准输入交给本 Skill 的确定性校验器：

```sh
node scripts/validate-output.mjs
```

退出码 `0` 表示 stdout 返回通过校验的同一结果对象。退出码 `2` 表示 stderr 返回 `violations` 数组；Skill 执行者必须按照每项 `path` 修正结果，并使用完整修正结果重试。退出码 `1` 表示校验器调用或运行错误；Skill 执行者必须先修正调用环境或参数，不能把该结果交给生图 Skill。
