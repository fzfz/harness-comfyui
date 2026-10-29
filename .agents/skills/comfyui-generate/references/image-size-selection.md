---
文档用途: 规定生成任务的尺寸换算、候选选择与近似尺寸确认方法。
读取时机: 模板需要转换尺寸表示，或目标尺寸没有直接匹配时。
---

# 图片尺寸换算与近似选择

## 目标尺寸换算

1. 目标尺寸来自 [SKILL.md 第 4 节](../SKILL.md#4-确定参数与提示词)。执行者按以下关系换算目标尺寸。

   1. `width`、`height` 为正数，表示目标像素宽高。
   2. `aspect_ratio` 为正整数构成的 `A:B`，比值等于 `width / height`。
   3. `megapixels` 为 `width * height / 1,000,000`。
   4. 已知 `aspect_ratio` 与 `megapixels` 时，`width = sqrt(megapixels * 1,000,000 * A / B)`，`height = sqrt(megapixels * 1,000,000 * B / A)`。

2. 写入整数参数的值必须满足参数约束。换算得到的目标宽高可用于选择最接近的可接受整数。

## 直接匹配

1. 执行者按每项的 `representation` 寻找直接匹配。

   1. `width_height`：两个参数分别接受目标 `width` 与 `height`。
   2. `aspect_ratio_megapixels`：两个参数接受目标宽高比与 `megapixels`。有 `allowed_values` 时，宽高比从列表中选择。两个比例约分后相同即为相同宽高比。
   3. `resolution_preset`：`mapped_options` 中的宽高与目标宽高相等。

2. 多种表示都有直接匹配时，执行者依次选择 `width_height`、`aspect_ratio_megapixels`、`resolution_preset`。同一种表示有多个直接匹配时，执行者列出候选 ID 与参数值，等待用户选择。

## 近似候选

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

## 写入尺寸参数

1. 执行者将选定值写入请求的 `parameters`。
2. `width_height` 使用 `width.parameter_id` 和 `height.parameter_id`。
3. `aspect_ratio_megapixels` 使用 `aspect_ratio.parameter_id` 和 `megapixels.parameter_id`。
4. `resolution_preset` 使用 `parameter.parameter_id`，值为选定映射项的 `value`。
