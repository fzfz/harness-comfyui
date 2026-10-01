# Workflow 参数检查 CLI

## CLI 用途

Skill 执行者使用 `generation inspect-template-parameters --stdin` 查询指定 Workflow 模板在指定 ComfyUI 实例上接受的生成参数。

## 调用入口

受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和 Workflow 参数检查 CLI 脚本路径 `DSH_HARNESS_COMFYUI_CLI`。Skill 执行者使用以下入口以 Node 模式调用本命令：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation inspect-template-parameters --stdin
```

## 调用条件

Skill 执行者取得 `template_id` 和 `instance_id` 后调用本命令。

## 参数与标准输入

标准输入是只包含 `template_id` 和 `instance_id` 的 JSON 对象：

```json
{"template_id":"36","instance_id":"2"}
```

`template_id` 和 `instance_id` 都是去除首尾空白后仍非空的字符串。

## 输入值的来源

`template_id` 使用 `catalog template resolve` 返回 JSON 中的 `id`。

`instance_id` 使用 `catalog instance list` 返回 JSON 中的 `results[0].id`。

## 成功输出与失败输出

命令成功时输出一个包含 `parameters` 和 `size_candidates` 的 JSON 对象。

### `parameters`

`parameters` 数组中的每一项描述一个生成参数：

- `parameter_id`：Generation Request 的 `parameters` 对象使用的属性名。
- `kind`：参数用途，例如 `positive_prompt`、`negative_prompt`、`seed` 或 `batch_size`。
- `value_type`：参数值的数据类型。`integer` 表示 JSON 整数，`number` 表示 JSON 数字，`string` 表示 JSON 字符串，`boolean` 表示 JSON 布尔值，`choice` 表示参数值必须与 `allowed_values` 数组中的一个元素相等；`value_type` 为 `choice` 但参数对象未包含 `allowed_values` 时，该参数对象不接受任何值。
- `current_value`：Workflow 模板当前保存的参数值。
- `minimum`：参数接受的最小数值；没有数值下限时不返回该属性。
- `maximum`：参数接受的最大数值；没有数值上限时不返回该属性。
- `allowed_values`：由参数允许值组成的数组；参数没有固定值列表时不返回该属性。

### `size_candidates`

`size_candidates` 数组中的每一项描述一组可供选择的图片尺寸参数。每项的 `candidate_id` 标识该尺寸候选项；每项还使用以下一种结构：

- `representation: "width_height"`：`width` 和 `height` 都是与 `parameters[]` 使用相同字段结构的参数对象。
- `representation: "aspect_ratio_megapixels"`：`aspect_ratio` 和 `megapixels` 都是与 `parameters[]` 使用相同字段结构的参数对象。
- `representation: "resolution_preset"`：`parameter` 是与 `parameters[]` 使用相同字段结构的参数对象。`mapped_options` 是预设映射数组；每个数组元素的 `value` 是满足 `parameter` 取值限制的参数值，`width` 和 `height` 是该预设对应的、以像素为单位的正整数图片宽度和高度。`unmapped_values` 是由无法映射到 `width` 和 `height` 的预设参数值组成的数组。

使用 `--quiet` 的命令成功时退出码为 `0`，stderr 为空，stdout 包含一行完整 JSON。命令失败时退出码非零，stderr 使用 `错误码: 错误消息` 格式。

## Generation Request 参数检查

1. `parameters` 中 `kind` 分别为 `positive_prompt`、`seed` 和 `batch_size` 的元素必须各有且只有一个。
2. 当 Skill 执行者准备在 Generation Request 中写入负向 Prompt 时，`parameters` 中必须存在且只存在一个 `kind` 为 `negative_prompt` 的项目。
3. `batch_size` 项的 `value_type` 必须是 `integer`，并且该项的取值限制必须接受整数 `1`。Skill 执行者把该项的 `parameter_id` 写入 Generation Request 的 `parameters` 对象，并将值设为 `1`。
4. 检查结果不符合第 1 至 3 项中任一适用要求时，Skill 执行者停止构造 Generation Request，并报告 `template_id` 和 `instance_id`。对于每个不符合要求的 `kind`，Skill 执行者报告所有具有该 `kind` 的元素的 `parameter_id`；缺少该 `kind` 时，Skill 执行者报告空的 `parameter_id` 列表。

## 图片尺寸选择

`size_candidates` 为空时，Skill 执行者报告该 Workflow 模板没有返回可用的图片尺寸参数，并停止构造 Generation Request。

已经通过 `references/prompt-result-contract.md` 检查的结果 JSON 提供 `width`、`height`、`aspect_ratio` 和 `megapixels`。`width` 和 `height` 是以像素为单位的正整数，分别表示期望图片宽度和高度；`aspect_ratio` 是由两个正整数组成的 `A:B` 字符串，并且 `A / B` 必须等于 `width / height`；`megapixels` 是表示期望图片百万像素数的正数。

参数值必须符合“`parameters`”小节对 `value_type` 的定义。参数对象包含 `minimum` 时，数值必须大于或等于 `minimum`；参数对象包含 `maximum` 时，数值必须小于或等于 `maximum`；参数对象包含 `allowed_values` 时，参数值还必须与 `allowed_values` 数组中的一个元素相等。以下规则将满足 `value_type`、`minimum`、`maximum` 和 `allowed_values` 全部适用要求的情况称为“参数对象接受该值”。

Skill 执行者按照以下顺序选择图片尺寸参数和值：

1. Skill 执行者先查找直接匹配。对一个 `width_height` 项，`width` 参数对象接受结果 JSON 的 `width` 且 `height` 参数对象接受结果 JSON 的 `height` 时，该项产生一个直接匹配。对一个 `aspect_ratio_megapixels` 项，`aspect_ratio` 参数对象包含 `allowed_values` 时，Skill 执行者只检查 `allowed_values` 数组中被该参数对象接受且符合 `A:B` 格式的值；`aspect_ratio` 参数对象未包含 `allowed_values` 时，Skill 执行者只检查结果 JSON 的 `aspect_ratio`。被检查的宽高比值和结果 JSON 的 `aspect_ratio` 分别约分后相同，并且 `aspect_ratio` 参数对象接受该宽高比值、`megapixels` 参数对象接受结果 JSON 的 `megapixels` 时，该宽高比值与结果 JSON 的 `megapixels` 组成一个直接匹配。对一个 `resolution_preset` 项，`mapped_options[]` 中 `width` 和 `height` 分别等于结果 JSON `width` 和 `height` 的每个元素分别产生一个直接匹配。
2. 多种 `representation` 都有直接匹配时，Skill 执行者按照 `width_height`、`aspect_ratio_megapixels`、`resolution_preset` 的顺序选择。最先匹配的 `representation` 中仍有多项直接匹配时，Skill 执行者列出这些匹配的 `candidate_id` 和参数值，并等待用户选择。
3. 没有直接匹配时，Skill 执行者为每个 `width_height` 项分别确定最接近结果 JSON `width` 和 `height` 的可接受整数。参数对象包含 `allowed_values` 时，Skill 执行者在该数组中选择与目标值绝对差最小的可接受正整数。参数对象不包含 `allowed_values` 时，目标值小于 `minimum` 就选择大于或等于 `minimum` 的最小正整数，目标值大于 `maximum` 就选择小于或等于 `maximum` 的最大正整数，其他情况选择目标值；参数对象没有返回其中一项边界时，Skill 执行者只检查已经返回的边界。两个整数与目标值的绝对差相同时，Skill 执行者选择较小的整数。任一参数对象没有可接受的正整数时，该 `width_height` 项不产生候选尺寸。
4. 没有直接匹配时，Skill 执行者为每个 `aspect_ratio_megapixels` 项确定宽高比和百万像素数。`aspect_ratio` 参数对象未包含 `allowed_values` 时，该项不产生候选尺寸；包含 `allowed_values` 时，Skill 执行者保留其中符合 `A:B` 格式、`A` 和 `B` 均为正整数且被 `aspect_ratio` 参数对象接受的值，并按照第 6 项的宽高比偏差公式，选择偏差最小的值。`megapixels` 参数对象包含 `allowed_values` 时，Skill 执行者在该数组中选择与结果 JSON `megapixels` 绝对差最小的可接受正数。`megapixels` 参数对象未包含 `allowed_values` 且 `value_type` 为 `number` 时，Skill 执行者选择满足已返回数值边界且与结果 JSON `megapixels` 绝对差最小的正数；`value_type` 为 `integer` 时，Skill 执行者选择满足已返回数值边界且与结果 JSON `megapixels` 绝对差最小的正整数；其他 `value_type` 不产生百万像素候选值。`aspect_ratio` 或 `megapixels` 有多个并列最小偏差值时，Skill 执行者保留全部并列值，并将每个保留的宽高比值与每个保留的百万像素值组成一个候选尺寸。任一参数对象没有可接受的值时，该 `aspect_ratio_megapixels` 项不产生候选尺寸。
5. 没有直接匹配时，每个 `resolution_preset` 项的 `mapped_options[]` 分别产生一个候选尺寸；`unmapped_values` 不产生候选尺寸。
6. Skill 执行者计算第 3 至 5 项产生的每个候选尺寸相对于结果 JSON 尺寸的宽高比偏差和像素面积偏差。结果 JSON 的宽高比为 `width / height`，像素面积为 `width * height`。`width_height` 和 `resolution_preset` 候选尺寸的宽高比为候选 `width / height`，像素面积为候选 `width * height`；`aspect_ratio_megapixels` 候选尺寸的宽高比为 `A / B`，像素面积为候选 `megapixels * 1,000,000`。宽高比偏差为 `abs(候选宽高比 - 结果 JSON 宽高比) / 结果 JSON 宽高比`；像素面积偏差为 `abs(候选像素面积 - 结果 JSON 像素面积) / 结果 JSON 像素面积`。
7. Skill 执行者排除宽高比偏差大于 `0.05` 或像素面积偏差大于 `0.10` 的候选尺寸。Skill 执行者在剩余候选尺寸中先选择宽高比偏差最小的候选尺寸，再从中选择像素面积偏差最小的候选尺寸。多个候选尺寸的两项偏差均相同时，Skill 执行者列出这些候选尺寸并等待用户选择。
8. Skill 执行者选出直接匹配以外的候选尺寸后，向用户列出结果 JSON 的 `width`、`height`、`aspect_ratio` 和 `megapixels`、准备写入 Generation Request 的每个 `parameter_id` 及其对应值、宽高比偏差和像素面积偏差，并等待用户确认。
9. 没有候选尺寸同时满足两项偏差限制时，Skill 执行者列出 `size_candidates` 数组中每个元素的 `candidate_id`。对于 `width_height` 和 `aspect_ratio_megapixels`，Skill 执行者同时列出各参数对象的 `value_type`、`minimum`、`maximum` 和 `allowed_values`；对于 `resolution_preset`，Skill 执行者同时列出 `mapped_options`。Skill 执行者随后等待用户选择其他 Workflow 模板，或者重新指定符合其中一个候选项取值限制的 `width`、`height`、`aspect_ratio` 和 `megapixels`。
10. Skill 执行者把选定的尺寸值写入 Generation Request 的 `parameters` 对象。`width_height` 使用 `width.parameter_id` 和 `height.parameter_id` 作为属性名；`aspect_ratio_megapixels` 使用 `aspect_ratio.parameter_id` 和 `megapixels.parameter_id` 作为属性名；`resolution_preset` 使用 `parameter.parameter_id` 作为属性名，并写入所选 `mapped_options[]` 项的 `value`。

## 错误处理与重试

- `CLI_REQUEST_INVALID`：Skill 执行者先按照“参数与标准输入”一节检查本次标准输入。Skill 执行者发现自己构造的 JSON 不符合该节要求时，修正 JSON 并重试一次；重试后仍返回 `CLI_REQUEST_INVALID`，或者本次标准输入已经符合该节要求时，Skill 执行者报告完整错误消息并停止构造 Generation Request。用户提供的 `template_id` 或 `instance_id` 不是去除首尾空白后仍非空的字符串时，Skill 执行者报告不符合要求的属性名、属性值和“必须是去除首尾空白后仍非空的字符串”这一要求，并等待用户提供新值。
- `GENERATION_PARAMETER_TARGET_AMBIGUOUS`、`GENERATION_PARAMETER_TARGET_NOT_FOUND`、`GENERATION_PARAMETER_CONTRACT_UNSUPPORTED` 或 `GENERATION_PARAMETER_INVALID`：Skill 执行者报告 stderr 中对应错误码的完整错误消息，并停止构造 Generation Request。
- 其他错误码：Skill 执行者报告错误码、错误消息和本次使用的 `template_id`、`instance_id`，并停止构造 Generation Request。

## 查询结果复用

处理当前用户请求期间，Skill 执行者复用同一组 `template_id` 和 `instance_id` 对应的完整检查结果；`template_id` 或 `instance_id` 改变时，Skill 执行者重新调用本命令。

## 完整调用示例

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation inspect-template-parameters --stdin <<'JSON'
{"template_id":"36","instance_id":"2"}
JSON
```

成功输出内容示例（文档为便于阅读而换行展示）：

```json
{
  "parameters": [
    {"parameter_id":"positive_prompt","kind":"positive_prompt","value_type":"string","current_value":""},
    {"parameter_id":"seed","kind":"seed","value_type":"integer","current_value":0,"minimum":0,"maximum":2147483647},
    {"parameter_id":"batch_size","kind":"batch_size","value_type":"integer","current_value":1,"minimum":1,"maximum":8}
  ],
  "size_candidates": [
    {
      "candidate_id":"aspect_ratio_megapixels:aspect_ratio:megapixels",
      "representation":"aspect_ratio_megapixels",
      "aspect_ratio":{"parameter_id":"aspect_ratio","kind":"aspect_ratio","value_type":"choice","current_value":"1:1","allowed_values":["1:1","9:16","16:9"]},
      "megapixels":{"parameter_id":"megapixels","kind":"megapixels","value_type":"number","current_value":1,"minimum":0.5,"maximum":2}
    }
  ]
}
```

## 帮助与操作提示

需要逐层查看能力、命令和输入示例时，Skill 执行者从 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help` 开始，按“下一步”进入分类和命令帮助。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 操作提示，退出码仍为 `0`。
