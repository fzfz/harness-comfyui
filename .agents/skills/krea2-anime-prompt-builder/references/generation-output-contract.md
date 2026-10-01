# Krea2 Turbo 生成结果合同

## 结果来源

Skill 执行者必须使用 `references/generation-output-schema.json` 取得结果属性、类型、枚举、必填性和额外属性限制，使用 `references/generation-profiles.json` 取得 Krea2 模型路线、正向规避示例和画幅尺寸常量。

## 生成目的

Skill 执行者必须按照下列规则选择一个 `generation_purpose`：

1. 当前结果没有明确的正式交付要求，且用户要求测试 Prompt 方向、比较 Prompt 方案、快速预览、批量筛选、根据图片或反馈修改 Prompt，或者继续迭代同一画面时，选择 `test`。
2. 当前请求具体引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版，并且继续处理同一画面与同一主体时，Skill 执行者必须将该请求连接原测试链；生成目的按照第 3 条处理明确正式交付请求，其余情况继续选择 `test`。
3. 用户明确要求当前结果作为正式生成、最终成图、交付图、海报或高质量结果时，选择 `final`。该交付要求优先于同一结果的测试、比较或迭代表述；从旧测试链转入正式生成时，用户还必须明确确认 Prompt 方案。
4. 用户提出独立于旧任务的新画面时，Skill 执行者必须将其作为新任务处理。新画面没有测试、比较或迭代表述时选择 `final`。
5. 无法确定当前请求是否连接旧测试链时，Skill 执行者必须请用户确认是继续测试还是开始新的正式任务。
6. 用户在同一请求中同时要求测试结果与正式交付时，若用户已经明确划分各结果的画面要求和生成目的，Skill 执行者必须为每个结果分别执行当前 Skill，测试结果选择 `test`，正式结果选择 `final`；若用户没有划分各结果，Skill 执行者必须要求用户划分后停止当前执行。

Skill 执行者每次执行当前 Skill 只返回一个结果。用户要求比较多个 Prompt 方案时，Skill 执行者为每个已划分方案分别构造一个 `test` 结果；方案边界不明确时，Skill 执行者要求用户先划分方案。

## 画幅与清晰度

Skill 执行者必须根据主体、动作和镜头从 `references/generation-profiles.json` 选择完整的画幅配置（profile）。舞蹈迁移源图和鞋履完整全身图优先 `1:2`，一般全身立绘优先 `2:3`，横向人物与场景优先 `3:2` 或 `16:9`，中心主体可以使用 `1:1`，手机竖屏内容可以使用 `9:16`。`test` 使用所选 profile 的 `test` 尺寸，`final` 使用同一 profile 的 `final` 尺寸。

用户覆盖尺寸时，Skill 执行者必须使用下列规则：

1. 用户只指定 `aspect_ratio` 时，先把比例约分为正整数比，再从 `references/generation-profiles.json` 的画幅配置中查找相同比例并按生成目的回填尺寸。没有该比例时，要求用户同时提供 `width` 与 `height`。
2. 用户同时提供正整数 `width` 与 `height` 时，使用约分后的 `width:height` 作为 `aspect_ratio`，使用 `width × height ÷ 1,000,000` 作为 `megapixels`。只提供一个像素边长时，要求用户补齐另一个。
3. 用户同时提供 `aspect_ratio` 与 `megapixels` 时，只能精确匹配同一 profile 的一个清晰度档位，然后回填 `width` 与 `height`。没有精确匹配时，要求用户提供完整像素尺寸。只提供 `megapixels` 时，要求用户补充 `aspect_ratio`。
4. 用户提供全部四项时，约分后的像素比例必须等于 `aspect_ratio`；`abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels` 必须小于或等于 `0.05`。任一条件不成立时，要求用户选择一组完整表示。
5. 允许的覆盖组合只有单独 `aspect_ratio`、完整 `width + height`、完整 `aspect_ratio + megapixels` 和全部四项。用户提供其他组合时，Skill 执行者必须在用户选择前保留已经提供的属性，列出形成合法组合所需的补充或撤回选择，并在用户选择前停止构造结果。例如，用户同时提供 `width` 与 `megapixels` 时，要求用户选择“补充 `height` 并撤回 `megapixels`”或“同时补充 `height` 与 `aspect_ratio` 后按全部四项检查”。

## Krea2 正向规避策略

Krea2 使用 `positive_rewrite`。Skill 执行者必须把 `negative_prompt` 设置为 `null`，并把待规避缺陷改写成可直接观察的正向画面约束。Skill 执行者可以从 `references/generation-profiles.json` 的 `model_routes[model_route].positive_avoidance_examples` 选择与本轮风险相符的表达，再按照具体主体改写。

- 画面突出手部时，描述两只手、每只手的清晰手指数和自然连接。
- 构图需要完整全身时，描述人物从头顶到鞋底完整入镜。
- 画面包含多人或复杂动作时，描述每名人物的独立轮廓、明确间距和自然关节连接。
- Skill 执行者只加入与本轮画面风险相关的约束，并把完整约束实际并入 `positive_prompt`。
- `positive_avoidance` 必须用非空字符串记录已经并入 `positive_prompt` 的正向规避内容。

## 结果构造与校验

Skill 执行者完成 Krea2 单条自然语言 Prompt 后，把完整 Prompt 写入 `positive_prompt`，再按照 `references/generation-output-schema.json` 构造一个结果对象。

`scripts/validate-output.mjs` 是相对于当前 `SKILL.md` 所在目录的文件路径。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE`。Skill 执行者从 Skill 目录设置 `ELECTRON_RUN_AS_NODE=1`，传入 `--expose-internals`，执行以下命令，并把完整结果 JSON 写入标准输入：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --quiet
```

上述 `--quiet` 命令退出码 `0` 时，stderr 必须为空，stdout 必须是一行通过校验的完整结果 JSON；Skill 执行者把 stdout 中的对象作为最终结构化结果。退出码 `2` 时，stdout 必须为空，stderr 首行必须是包含非空 `violations` 数组的 JSON，后续行为 `NEXT:` 修正提示；Skill 执行者按照每项 `path` 和 `message` 修正完整结果并重试一次。修正需要用户补充信息或作出选择时，Skill 执行者列出所需输入并停止当前执行；重试仍返回退出码 `2` 时，Skill 执行者报告全部 `violations` 并停止。退出码 `1` 时，Skill 执行者报告 stderr 并停止。Skill 执行者仅在退出码为 `0` 且输出符合协议时采用 stdout。命令返回其他退出码，或者输出通道不符合对应规则时，Skill 执行者报告退出码和违反的输出协议并停止。

## 帮助与操作提示

Skill 执行者运行 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help` 查看输入合同、示例和模式入口。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 提示。错误结果按照前述校验结果规则处理。
