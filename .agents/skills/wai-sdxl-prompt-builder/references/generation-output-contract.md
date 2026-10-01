# WAI 生成结果构造与校验

## 结构化数据来源

Skill 执行者使用 `references/generation-output-schema.json` 取得生成结果的属性名称、数据类型、必填属性和允许值，使用 `references/generation-profiles.json` 取得 WAI 模型路线、负向模式、基础负向项和尺寸档位。

## 选择生成目的

每个生成结果必须使用一个 `generation_purpose`：

- 用户要求测试 Prompt、比较方案、快速预览或批量筛选时，Skill 执行者使用 `"test"`。用户要求根据旧 Prompt、旧图片、已有 Generation Run（图片生成运行记录）或用户反馈继续修改同一画面，并且没有明确要求正式生成、最终成图、交付图、海报或高质量结果时，Skill 执行者使用 `"test"`。
- 用户确认 Prompt 并要求正式生成、最终成图、交付图、海报或高质量结果时，Skill 执行者使用 `"final"`。
- 用户提出一个没有测试、比较或继续修改要求的新画面时，Skill 执行者使用 `"final"`。

一次 Skill 执行只构造一个生成结果。用户要求同一次执行同时返回测试结果和正式结果时，Skill 执行者请求用户选择当前结果使用 `"test"` 或 `"final"`，并在用户选择前停止构造结果。

## 选择目标尺寸

用户没有指定尺寸时，Skill 执行者逐项比较用户要求的主体数量、画面长宽方向和交付形式与 `references/generation-profiles.json` 中每个 `size_profiles[].composition`，并采用唯一符合用户要求的 `size_profiles[]` 项。没有符合项时，Skill 执行者列出 `size_profiles[]` 中全部项的 `aspect_ratio` 和 `composition` 并请求用户选择；有多项同时符合时，Skill 执行者列出这些符合项的 `aspect_ratio` 和 `composition` 并请求用户选择。Skill 执行者在用户选择前停止构造结果。确定唯一项后，Skill 执行者为 `generation_purpose: "test"` 使用该项的 `test.width`、`test.height` 和 `test.megapixels`，为 `generation_purpose: "final"` 使用该项的 `final.width`、`final.height` 和 `final.megapixels`。结果的 `aspect_ratio` 使用该项的 `aspect_ratio`。

用户指定尺寸时，Skill 执行者按照用户提供的属性执行以下一项规则：

1. 用户只提供 `aspect_ratio` 时，Skill 执行者把比例约分为正整数比，并在 `size_profiles[]` 中查找 `aspect_ratio` 相同的唯一项。找到唯一项后，Skill 执行者把约分后的比例写入生成结果的 `aspect_ratio`；当 `generation_purpose` 为 `"test"` 时，Skill 执行者把该项的 `test.width`、`test.height` 和 `test.megapixels` 分别写入生成结果的 `width`、`height` 和 `megapixels`；当 `generation_purpose` 为 `"final"` 时，Skill 执行者把该项的 `final.width`、`final.height` 和 `final.megapixels` 分别写入生成结果的 `width`、`height` 和 `megapixels`。没有找到唯一项时，Skill 执行者请求用户用同时且只包含 `width` 和 `height` 的新尺寸输入替换当前尺寸输入，并在用户提供新尺寸输入前停止构造结果。
2. 用户同时且只提供 `width` 和 `height` 时，两个值必须是正整数。Skill 执行者把用户提供的 `width` 和 `height` 分别写入生成结果的同名属性，把 `width:height` 约分后写入生成结果的 `aspect_ratio`，并把 `width × height ÷ 1,000,000` 写入生成结果的 `megapixels`。
3. 用户同时且只提供 `aspect_ratio` 和 `megapixels` 时，`aspect_ratio` 必须是约分后的正整数比，`megapixels` 必须是正有限数值。Skill 执行者在 `size_profiles[]` 的 `test` 和 `final` 尺寸档位中查找同时具有相同 `aspect_ratio` 和 `megapixels` 的唯一档位。找到唯一档位后，Skill 执行者把用户提供的 `aspect_ratio` 和 `megapixels` 以及该档位的 `width` 和 `height` 分别写入生成结果的同名属性。没有找到唯一档位时，Skill 执行者请求用户补充提供 `width` 和 `height`，并在收到这两个属性后按照第 4 项规则处理全部四项尺寸属性。Skill 执行者在用户补充属性前停止构造结果。
4. 用户同时提供 `aspect_ratio`、`width`、`height` 和 `megapixels` 时，`width` 和 `height` 必须是正整数，`aspect_ratio` 必须等于 `width:height` 约分后的比例，`megapixels` 必须是正有限数值，并且 `abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels` 必须小于或等于 `0.05`。四项属性满足这些要求时，Skill 执行者把用户提供的值分别写入生成结果的同名属性。

用户提供的尺寸属性组合不属于上述四种组合时，Skill 执行者列出已经收到的尺寸属性，并请求用户选择以下一种输入：只提供 `aspect_ratio`；同时且只提供 `width` 和 `height`；同时且只提供 `aspect_ratio` 和 `megapixels`；同时且只提供全部四项。用户提供的属性组合正确但属性值不符合对应规则时，Skill 执行者逐项指出不符合要求的属性及该属性在上述规则中的数值要求，并请求用户修正这些属性。Skill 执行者在用户提供有效尺寸输入前停止构造结果。

## 构造正向与负向内容

Skill 执行者按照 `references/prompt-format-validator.md` 完成格式校验。该文档定义的校验命令成功后，Skill 执行者解析命令 stdout 中的 JSON 对象，并把该对象的 `prompt_text` 值写入生成结果的 `positive_prompt` 属性。

Skill 执行者使用 `references/generation-profiles.json` 中 `model_routes.wai-illustrious-sdxl` 的属性构造以下结果：

- `model_route` 使用 `"wai-illustrious-sdxl"`。
- `negative_mode` 使用该路线的 `negative_mode`。
- `negative_prompt` 先按原顺序复制该路线的 `base_negative_items[]`。Skill 执行者再按用户要求出现的顺序，把用户明确要求从画面中排除的每项内容写成一个或多个描述不应出现内容的英文标签或短语，并按写出顺序追加每个标签或短语。Skill 执行者删除完全相同的重复字符串，最后使用 `, ` 连接全部字符串。
- `positive_avoidance` 使用 `null`。

## 生成结果

Skill 执行者构造包含且只包含下列十个属性的 JSON 对象。下列 JSON 中的属性值仅用于展示数据类型和对象结构；Skill 执行者使用前述规则得出的实际属性值。

```json
{
  "model_route": "wai-illustrious-sdxl",
  "positive_prompt": "masterpiece, best quality, 1girl, portrait",
  "negative_mode": "native_negative",
  "negative_prompt": "bad quality, worst quality, worst detail, sketch, censor",
  "positive_avoidance": null,
  "generation_purpose": "test",
  "aspect_ratio": "1:1",
  "width": 1024,
  "height": 1024,
  "megapixels": 1
}
```

## 校验命令

`scripts/validate-output.mjs` 是相对于当前 `SKILL.md` 所在目录的文件路径。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE`。Skill 执行者设置 `ELECTRON_RUN_AS_NODE=1`，传入 `--expose-internals`，从 Skill 目录执行以下命令，并把完整生成结果 JSON 写入命令的标准输入：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --quiet
```

## 校验结果

使用 `--quiet` 校验成功时，命令返回退出码 `0`，stderr 为空，stdout 写入一行通过校验的生成结果 JSON。Skill 执行者返回 stdout 中的生成结果。

生成结果不符合 `references/generation-output-schema.json`、模型路线、负向模式或尺寸一致性规则时，命令返回退出码 `2`，stdout 为空，stderr 首行写入一个 JSON 对象，后续行写入 `NEXT:` 修正提示；`--quiet` 仅省略成功提示。该对象的 `violations` 属性必须是非空数组；数组中的每个对象必须包含字符串属性 `path` 和 `message`。`path` 指向生成结果中不符合规则的属性，`message` 说明该属性违反的规则：

```json
{
  "violations": [
    {
      "path": "aspect_ratio",
      "message": "aspect_ratio does not match width and height"
    }
  ]
}
```

第一次返回符合上述结构的退出码 `2` 结果时，Skill 执行者按照数组顺序读取每个 `violations[]` 元素，使用 `path` 定位违规位置，并结合 `message` 和本文件前述构造规则确定导致违规的一个或多个生成结果属性。Skill 执行者修正这些属性后重试一次。第二次仍返回退出码 `2` 时，Skill 执行者按照数组顺序报告每个 `path` 和 `message`，然后停止本次执行。

命令返回退出码 `1` 时，Skill 执行者报告 stderr 的完整错误内容并停止本次执行。stderr 为空时，Skill 执行者报告“生成结果校验器返回退出码 1，但没有错误信息”，然后停止本次执行。

命令没有返回退出码时，Skill 执行者报告命令调用提供的完整错误信息并停止本次执行。命令调用没有提供错误信息时，Skill 执行者报告“生成结果校验命令没有返回退出码或错误信息”，然后停止本次执行。命令返回 `0`、`1`、`2` 以外的退出码时，Skill 执行者报告实际退出码和 stderr 的完整内容，然后停止本次执行。

退出码 `0` 对应的 stdout、stderr 或从 stdout 解析得到的 JSON 对象不符合退出码 `0` 的成功结果结构，或者退出码 `2` 对应的 stdout、stderr 或从 stderr 首行解析得到的 `violations[]` 不符合退出码 `2` 的失败结果结构时，Skill 执行者报告实际退出码、不符合要求的输出通道或属性、实际结果和预期要求，然后停止本次执行。

## 帮助与操作提示

Skill 执行者运行 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help` 查看输入合同、示例和模式入口。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 提示。错误结果按照前述校验结果规则处理。
