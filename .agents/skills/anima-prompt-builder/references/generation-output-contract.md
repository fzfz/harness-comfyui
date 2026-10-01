# ANIMA 生成结果合同

## 结果来源

Skill 执行者必须使用 `references/generation-output-schema.json` 取得结果属性、类型、枚举、必填性和额外属性限制，使用 `references/generation-profiles.json` 取得 ANIMA 模型路线、负向模式、基础负向项和画幅尺寸常量。

## 生成目的

Skill 执行者必须按照下列规则选择一个 `generation_purpose`：

1. 用户在同一请求中同时要求测试结果与正式交付时，若用户已经明确划分各结果的画面要求和生成目的，Skill 执行者为每个结果分别执行当前 Skill，测试结果选择 `test`，正式结果选择 `final`；若用户没有划分各结果，Skill 执行者要求用户划分后停止当前执行。
2. 对于一个结果，用户明确确认当前 Prompt 方案并要求正式生成、最终成图、交付图、海报或高质量结果时，选择 `final`。即使当前请求引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版，这条明确的正式交付要求仍然决定该结果选择 `final`。
3. 当前结果没有明确的正式交付要求，并且用户要求测试 Prompt 方向、比较 Prompt 方案、快速预览、批量筛选、根据图片或反馈修改 Prompt，或者继续迭代同一画面时，选择 `test`。
4. 当前结果没有明确的正式交付要求，并且请求具体引用旧 Prompt、旧图片、Generation Run、用户反馈或修改版并继续处理同一画面与同一主体时，该请求连接原测试链并选择 `test`。
5. 对于没有引用旧任务的新画面，Skill 执行者必须将其作为独立任务处理。新画面没有测试、比较、迭代或正式交付表述时选择 `final`。
6. 无法确定当前请求是否连接旧测试链，或者无法确定用户是否要求正式交付时，Skill 执行者请用户确认生成目的，在收到确认后构造结果。

Skill 执行者每次执行当前 Skill 只返回一个结果。用户要求比较多个 Prompt 方案时，Skill 执行者为每个已划分方案分别构造一个 `test` 结果；方案边界不明确时，Skill 执行者要求用户先划分方案。

## 画幅与清晰度

Skill 执行者必须根据主体、动作和镜头从 `references/generation-profiles.json` 选择完整的画幅配置（profile）。全身立绘优先竖幅，双人横向互动或宽场景优先横幅，头像设定、中心主体或对称构图可以使用方形。`test` 使用所选 profile 的 `test` 尺寸，`final` 使用同一 profile 的 `final` 尺寸。

用户覆盖尺寸时，Skill 执行者必须使用下列规则：

1. 用户只指定 `aspect_ratio` 时，先把比例约分为正整数比，再从 `references/generation-profiles.json` 的画幅配置中查找相同比例并按生成目的回填尺寸。没有该比例时，要求用户同时提供 `width` 与 `height`。
2. 用户同时提供正整数 `width` 与 `height` 时，使用约分后的 `width:height` 作为 `aspect_ratio`，使用 `width × height ÷ 1,000,000` 作为 `megapixels`。只提供一个像素边长时，要求用户补齐另一个。
3. 用户同时提供 `aspect_ratio` 与 `megapixels` 时，只能精确匹配同一 profile 的一个清晰度档位，然后回填 `width` 与 `height`。没有精确匹配时，要求用户提供完整像素尺寸。只提供 `megapixels` 时，要求用户补充 `aspect_ratio`。
4. 用户提供全部四项时，约分后的像素比例必须等于 `aspect_ratio`；`abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels` 必须小于或等于 `0.05`。任一条件不成立时，要求用户选择一组完整表示。
5. 允许的覆盖组合只有单独 `aspect_ratio`、完整 `width + height`、完整 `aspect_ratio + megapixels` 和全部四项。用户提供其他组合时，Skill 执行者必须在用户选择前保留已经提供的属性，列出形成合法组合所需的补充或撤回选择，并在用户选择前停止构造结果。例如，用户同时提供 `width` 与 `megapixels` 时，要求用户选择“补充 `height` 并撤回 `megapixels`”或“同时补充 `height` 与 `aspect_ratio` 后按全部四项检查”。

## ANIMA 负向策略

Skill 执行者使用 `references/generation-profiles.json` 中的 `anima-aesthetic-v1.1` 路线，并使用该路线的 `negative_mode` 和 `base_negative_items`。

- Skill 执行者使用 `score_*` 时，必须将其限定在正向或负向其中一侧。
- Skill 执行者只在本轮画面确实包含对应风险时，追加少量人体、手部、足部、多人粘连或文字伪影项。
- Skill 执行者删除重复负向项。原生负向模式把基础负向项和本轮追加项写入非空 `negative_prompt`，并把 `positive_avoidance` 设置为 `null`；正向规避模式把这些项目改写为正向规避要求并写入非空 `positive_avoidance`，同时把 `negative_prompt` 设置为 `null`。

## 结果构造与校验

Skill 执行者按照 `references/03-output-protocol.md` 完成 ANIMA 十二槽 Prompt 格式校验后，把校验器成功结果中的 `prompt_text` 写入 `positive_prompt`，再按照 `references/generation-output-schema.json` 构造一个结果对象。

`scripts/validate-output.mjs` 是相对于当前 `SKILL.md` 所在目录的文件路径。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE`。Skill 执行者从 Skill 目录设置 `ELECTRON_RUN_AS_NODE=1`，传入 `--expose-internals`，执行以下命令，并把完整结果 JSON 写入标准输入：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --quiet
```

上述 `--quiet` 命令退出码 `0` 时，stderr 必须为空，stdout 必须是一行通过校验的完整结果 JSON；Skill 执行者把 stdout 中的对象作为最终结构化结果。退出码 `2` 时，stdout 必须为空，stderr 首行必须是包含非空 `violations` 数组的 JSON，后续行为 `NEXT:` 修正提示；Skill 执行者按照每项 `path` 和 `message` 修正完整结果并重试一次，重试仍返回退出码 `2` 时报告全部 `violations` 并停止。退出码 `1` 时，Skill 执行者报告 stderr 并停止。Skill 执行者仅在退出码为 `0` 且输出符合协议时采用 stdout。命令返回其他退出码，或者输出通道不符合对应规则时，Skill 执行者报告退出码和违反的输出协议并停止。

## 帮助与操作提示

Skill 执行者运行 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help` 查看输入合同、示例和模式入口。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 提示。错误结果按照前述校验结果规则处理。
