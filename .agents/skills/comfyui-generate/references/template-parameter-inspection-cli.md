---
文档用途: 提供 Workflow 参数检查 CLI 的调用条件、输入输出与错误处理规则。
读取时机: Skill 执行者首次调用本文件所列命令前。
---
# Workflow 参数检查 CLI

## CLI 用途

1. Skill 执行者使用 `generation inspect-template-parameters --stdin` 查询指定 Workflow 模板在指定 ComfyUI 实例上接受的生成参数。

## 调用入口

1. 调用环境与结果读取遵循 [Generation CLI 第 1 节](generation-cli.md#1-调用入口与结果文件)。本命令的调用形式如下：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation inspect-template-parameters --stdin
   ```

## 调用条件

1. Skill 执行者按 [SKILL.md](../SKILL.md#3-检查参数并承接提示词) 第 3 节确定资源和实例后调用本命令。

## 参数与标准输入

1. 标准输入是只包含 `template_id` 和 `instance_id` 的 JSON 对象：

   ```json
   {"template_id":"36","instance_id":"2"}
   ```

2. `template_id` 和 `instance_id` 都是去除首尾空白后仍非空的字符串。

## 输入值的来源

1. `template_id` 使用 [SKILL.md](../SKILL.md#2-查询并核对资源) 第 2 节确定的模板 ID。
2. `instance_id` 使用 [SKILL.md](../SKILL.md#3-检查参数并承接提示词) 第 3 节确定的实例 ID。

## 结果文件中的 JSON

1. 结果文件中的 JSON 对象包含 `parameters` 和 `size_candidates`。

### `parameters`

1. `parameter_id`：Generation Request 的 `parameters` 对象使用的属性名。
2. `kind`：参数用途，例如 `positive_prompt`、`negative_prompt`、`seed` 或 `batch_size`。
3. `value_type`：参数值的数据类型。`integer` 表示 JSON 整数，`number` 表示 JSON 数字，`string` 表示 JSON 字符串，`boolean` 表示 JSON 布尔值，`choice` 表示参数值必须与 `allowed_values` 数组中的一个元素相等；`value_type` 为 `choice` 但参数对象未包含 `allowed_values` 时，该参数对象不接受任何值。
4. `current_value`：Workflow 模板当前保存的参数值。
5. `minimum`：参数接受的最小数值；没有数值下限时不返回该属性。
6. `maximum`：参数接受的最大数值；没有数值上限时不返回该属性。
7. `allowed_values`：由参数允许值组成的数组；参数没有固定值列表时不返回该属性。

### 参数值的接受条件

1. 参数值必须符合“`parameters`”小节对 `value_type` 的定义。参数对象包含 `minimum` 时，数值必须大于或等于 `minimum`；参数对象包含 `maximum` 时，数值必须小于或等于 `maximum`；参数对象包含 `allowed_values` 时，参数值还必须与 `allowed_values` 数组中的一个元素相等。本文件将满足 `value_type`、`minimum`、`maximum` 和 `allowed_values` 全部适用要求的情况称为“参数对象接受该值”。

### `size_candidates`

1. 每项 `candidate_id` 标识一组尺寸参数。候选项使用以下一种结构。

   1. `representation: "width_height"`：`width` 和 `height` 都是与 `parameters[]` 使用相同字段结构的参数对象。
   2. `representation: "aspect_ratio_megapixels"`：`aspect_ratio` 和 `megapixels` 都是与 `parameters[]` 使用相同字段结构的参数对象。
   3. `representation: "resolution_preset"`：`parameter` 是与 `parameters[]` 使用相同字段结构的参数对象。`mapped_options` 是预设映射数组；每个元素的 `value` 满足 `parameter` 的取值限制。`width` 和 `height` 是预设对应的正整数像素宽高。`unmapped_values` 是由无法映射到 `width` 和 `height` 的预设参数值组成的数组。

## Generation Request 参数检查

1. `parameters` 中 `kind` 分别为 `positive_prompt`、`seed` 和 `batch_size` 的元素必须各有且只有一个。
2. 当 Skill 执行者准备在 Generation Request 中写入负向 Prompt 时，`parameters` 中必须存在且只存在一个 `kind` 为 `negative_prompt` 的项目。
3. `batch_size` 项的 `value_type` 必须是 `integer`，并且该参数对象必须接受整数 `1`。Skill 执行者把该项的 `parameter_id` 写入 Generation Request 的 `parameters` 对象，并将值设为 `1`。
4. 检查结果不符合第 1 至 3 项中任一适用要求时，Skill 执行者停止构造 Generation Request，并报告 `template_id` 和 `instance_id`。对于每个不符合要求的 `kind`，Skill 执行者报告所有具有该 `kind` 的元素的 `parameter_id`；缺少该 `kind` 时，Skill 执行者报告空的 `parameter_id` 列表。

## 图片尺寸选择

### 目标尺寸

1. Skill 执行者从用户要求与提示词产物取得目标尺寸。用户已指定尺寸时采用用户值。产物尺寸补全用户未指定的值。
2. 尺寸以像素宽高或宽高比与百万像素数表达。缺少这些信息时，执行者只询问缺失项。
3. 目标尺寸的换算使用以下关系。

   1. `width`、`height` 为正数，表示目标像素宽高。
   2. `aspect_ratio` 为正整数构成的 `A:B`，比值等于 `width / height`。
   3. `megapixels` 为 `width * height / 1,000,000`。
   4. 已知 `aspect_ratio` 与 `megapixels` 时，`width = sqrt(megapixels * 1,000,000 * A / B)`，`height = sqrt(megapixels * 1,000,000 * B / A)`。

4. 写入整数参数的值必须满足参数约束。换算得到的目标宽高可用于选择最接近的可接受整数。
5. `size_candidates` 为空时，执行者报告模板没有可用尺寸参数，停止构造请求。

### 直接匹配

1. 执行者按每项的 `representation` 寻找直接匹配。

   1. `width_height`：两个参数分别接受目标 `width` 与 `height`。
   2. `aspect_ratio_megapixels`：两个参数接受目标宽高比与 `megapixels`。有 `allowed_values` 时，宽高比从列表中选择。两个比例约分后相同即为相同宽高比。
   3. `resolution_preset`：`mapped_options` 中的宽高与目标宽高相等。

2. 多种表示都有直接匹配时，执行者依次选择 `width_height`、`aspect_ratio_megapixels`、`resolution_preset`。同一种表示有多个直接匹配时，执行者列出候选 ID 与参数值，等待用户选择。

### 近似候选

1. 没有直接匹配时，执行者按以下规则取得近似候选。第 2 至 4 项确定候选值，第 5 项计算偏差。
2. `width_height` 的宽高分别选择最接近目标的可接受正整数。有 `allowed_values` 时从列表中选择；无列表时按数值边界选择。两个候选整数与目标值的绝对差相同时，执行者选择较小值。任一参数没有可接受整数时，执行者排除该项。
3. `aspect_ratio_megapixels` 按以下规则选择。

   1. 宽高比从 `allowed_values` 中选择。保留参数接受且符合正整数 `A:B` 的值，再选择宽高比偏差最小者。缺少列表时排除该项。
   2. 百万像素数有 `allowed_values` 时，选择最接近目标的可接受正数。
   3. 百万像素数无列表时，`number` 选择边界内最接近目标的正数；`integer` 选择最接近目标的正整数。其他类型排除该项。
   4. 最小偏差有并列值时保留全部，并组合每个宽高比与百万像素数。任一参数没有可接受值时排除该项。

4. `resolution_preset` 的每个 `mapped_options` 元素产生一个候选。`unmapped_values` 不参与选择。
5. 执行者计算各候选与目标尺寸的偏差。

   1. 目标宽高比为 `width / height`，像素面积为 `width * height`。
   2. `width_height` 与 `resolution_preset` 使用候选宽高计算比值和面积。
   3. `aspect_ratio_megapixels` 使用 `A / B` 和 `megapixels * 1,000,000`。
   4. 宽高比偏差为 `abs(候选宽高比 - 目标宽高比) / 目标宽高比`。
   5. 像素面积偏差为 `abs(候选面积 - 目标面积) / 目标面积`。

6. 执行者排除宽高比偏差大于 `0.05` 或面积偏差大于 `0.10` 的候选。剩余候选先取宽高比偏差最小者，再取面积偏差最小者。两项均并列时，执行者等待用户选择。
7. 采用近似候选前，执行者向用户列出以下内容，等待用户确认。

   1. 目标尺寸。
   2. 候选的每个 `parameter_id` 与值。
   3. 宽高比偏差与像素面积偏差。

8. 没有候选同时满足偏差上限时，执行者列出每项候选 ID。宽高与宽高比表示附参数类型、边界和允许值；预设表示附 `mapped_options`。执行者等待用户更换模板或指定可用尺寸。

### 写入尺寸参数

1. 执行者将选定值写入请求的 `parameters`。
2. `width_height` 使用 `width.parameter_id` 和 `height.parameter_id`。
3. `aspect_ratio_megapixels` 使用 `aspect_ratio.parameter_id` 和 `megapixels.parameter_id`。
4. `resolution_preset` 使用 `parameter.parameter_id`，值为选定映射项的 `value`。

## 错误处理与重试

1. 公共文件错误按 [Generation CLI 第 1 节](generation-cli.md#1-调用入口与结果文件) 处理。
2. `CLI_REQUEST_INVALID`：执行者核对输入属性与字符串约束。用户提供的 ID 无效时，执行者报告属性名、值与约束，等待用户修正。执行者构造的 JSON 有误时，执行者修正后重试一次。输入已符合约束或重试仍失败时，执行者报告完整错误，停止构造请求。
3. `GENERATION_PARAMETER_TARGET_AMBIGUOUS`、`GENERATION_PARAMETER_TARGET_NOT_FOUND`、`GENERATION_PARAMETER_CONTRACT_UNSUPPORTED` 或 `GENERATION_PARAMETER_INVALID`：执行者报告完整错误，停止构造请求。
4. 其他错误：执行者报告错误码、消息、模板 ID 与实例 ID，停止构造请求。

## 查询结果复用

1. 处理当前用户请求期间，Skill 执行者复用同一组 `template_id` 和 `instance_id` 对应的完整检查结果；`template_id` 或 `instance_id` 改变时，Skill 执行者重新调用本命令。
