# WAI 画师语法

## 用途和读取时机

本文件规定 Skill 执行者如何把每名已采用画师的 Prompt 转换为 `artist` 数组中的一个元素。

Skill 执行者开始处理本次一个或多个画师 Prompt 前，依次完整读取[当前用户消息输入合同](input-contract.md)、[画师采用规则](artist-adoption.md)、`prompt-weight-policy.json` 和 [WAI Prompt 权重方法](prompt-weighting.md)；本次处理中的全部画师共用这次读取结果。

## 每名画师的输入

Skill 执行者为每名已采用画师取得以下四项输入：

- 该画师的非空 Prompt；
- 用户在当前用户消息中为该画师直接写出的显式数值权重；
- [画师采用规则](artist-adoption.md)确定的主要、辅助或中性作用；
- [画师采用规则](artist-adoption.md)确定的排列位置。

用户没有为该画师写出显式数值权重时，第二项输入为空。用户写出的显式数值权重必须符合 `prompt-weight-policy.json` 的 `syntax.explicit_weight`；不符合时，Skill 执行者报告画师名称和用户写出的权重，并停止本次执行。用户提供合法权重后，Skill 执行者重新生成整个 `artist` 数组。

## 取得 payload 和来源权重

Skill 执行者按照以下顺序处理每名画师的 Prompt：

1. Skill 执行者删除 Prompt 首尾空白。
2. Skill 执行者按照 `prompt-weight-policy.json` 的 `syntax.forms` 和 `syntax.explicit_weight`，把 Prompt 解析为未加权 `payload`、默认权重 `(payload)` 或显式权重 `(payload:weight)`，并记录来源形式；来源形式为显式权重时，Skill 执行者同时记录来源 `weight` 原文。Prompt 不符合其中任一形式时，Skill 执行者报告画师名称、原 Prompt 和不符合的格式要求，并停止本次执行。用户提供合法 Prompt 后，Skill 执行者重新生成整个 `artist` 数组。
3. `payload` 以不区分大小写的 `by` 及至少一个空白字符开头时，Skill 执行者删除开头的 `by` 及其后连续空白。
4. 完成步骤 3 后，`payload` 以不区分大小写的 `artist:` 开头时，Skill 执行者删除该前缀。
5. Skill 执行者删除 `payload` 首尾空白。结果为空时，Skill 执行者报告画师名称和空 `payload`，并停止本次执行。用户为该画师提供非空 Prompt 后，Skill 执行者重新生成整个 `artist` 数组。

Skill 执行者保留步骤 5 所得 `payload` 内部的空格、下划线、字母大小写和其他可见字符。

## 确定最终权重形式

Skill 执行者按照以下顺序为每名画师确定一种最终形式：

1. 用户为该画师提供合法显式数值权重时，Skill 执行者使用该数值原文生成 `(payload:weight)`。
2. 用户没有提供显式数值权重，且来源形式为显式权重时，Skill 执行者使用来源 `weight` 原文生成 `(payload:weight)`。
3. 用户没有提供显式数值权重，且来源形式为默认权重时，Skill 执行者生成 `(payload)`。
4. 用户和来源都没有提供权重时，主要画师使用 `prompt-weight-policy.json` 的 `recommendations.levels.light` 数值生成 `(payload:weight)`，辅助画师使用该文件的 `recommendations.levels.deemphasis` 数值生成 `(payload:weight)`，中性画师使用未加权 `payload`。

## 转义和最终元素

Skill 执行者从左向右处理 `payload`：

1. 当前字符是反斜杠，并且下一字符属于 `prompt-weight-policy.json` 的 `syntax.payload.escapable_characters` 时，Skill 执行者原样保留这两个字符，跳过这两个字符后继续处理后续字符。
2. 当前字符是反斜杠，但没有下一字符或下一字符不属于 `prompt-weight-policy.json` 的 `syntax.payload.escapable_characters` 时，Skill 执行者报告画师名称和无效反斜杠序列，并停止本次执行。用户为该画师提供合法 Prompt 后，Skill 执行者重新生成整个 `artist` 数组。
3. 当前字符不是反斜杠，但属于 `prompt-weight-policy.json` 的 `syntax.payload.escapable_characters` 时，Skill 执行者在该字符前添加一个反斜杠。
4. 当前字符不满足前三项条件时，Skill 执行者原样保留该字符。

完成转义后，Skill 执行者将“确定最终权重形式”一节选中的下列三种文本之一，作为一个 `artist` 数组元素的完整内容：

```text
payload
(payload)
(payload:weight)
```

`payload` 和 `weight` 是格式占位符。对于 `(payload)` 和 `(payload:weight)`，Skill 执行者不在左括号后、右括号前或冒号两侧添加空白，并且只在转义后的 `payload` 外添加一对括号。

## 重复画师和数组顺序

Skill 执行者逐字符比较每名已采用画师转义后的 `payload`；不同画师转义后的 `payload` 不完全相同时，Skill 执行者分别生成数组元素。

多名已采用画师的转义后 `payload` 完全相同，且最终数组元素逐字符完全相同时，Skill 执行者只保留一个数组元素，并采用这些画师中最靠前的排列位置。

多名已采用画师的转义后 `payload` 完全相同，但最终数组元素不完全相同时，Skill 执行者报告每名画师的名称、作用、最终形式和 `weight`；没有 `weight` 的画师报告“无”。Skill 执行者请求用户选择需要保留的一名画师，并停止本次执行。用户完成选择后，Skill 执行者重新生成整个 `artist` 数组。

Skill 执行者按照[画师采用规则](artist-adoption.md)确定的排列位置，把每个保留的画师元素依次写入 `artist` 数组。
