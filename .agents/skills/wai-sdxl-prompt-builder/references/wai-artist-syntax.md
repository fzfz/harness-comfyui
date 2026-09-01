# WAI 画师语法

## 用途和读取时机

本文件规定 Skill Agent 如何把每个被采用画师的画师提示词转换为 `artist` 位置的一个数组元素。

UI 已选 Style 的字段和选择顺序由 [当前轮输入合同](input-contract.md)定义。Skill Agent 每次采用一个或多个画师时，必须先完整读取 `prompt-weight-policy.json` 和 `prompt-weighting.md`，再读取本文件。画师查询和候选比较由[画师采用规则](artist-adoption.md)规定。

## 允许的最终形式

一名画师使用一个独立数组元素。该元素使用以下一种形式：

```text
payload
(payload)
(payload:weight)
```

以上文本中的 `payload` 和 `weight` 是格式占位符。未加权画师保持 `payload`；来源提供默认权重时使用 `(payload)`；来源或权重方法提供显式数值时使用 `(payload:weight)`。多个画师分别使用独立数组元素，不能合并为一个无法区分来源的画师项。

## 从画师提示词取得 payload

Skill Agent 按照以下顺序解析每个被采用画师的画师提示词并记录最终权重所需信息：

1. 删除字符串首尾空白。
2. 按照 `prompt-weight-policy.json` 解析未加权、默认权重或显式权重形式，并记录来源形式与合法 weight 原文。
3. payload 以不区分大小写的 `by` 加空白开头时，删除这一组开头内容。
4. payload 以不区分大小写的 `artist:` 开头时，删除该前缀。
5. 再次删除 payload 首尾空白；空 payload 不进入 `artist`。
6. Skill Agent 分别记录规范化 payload、用户合法显式 weight 原文、合法来源形式、合法来源 weight 原文和主要、辅助或中性作用；该步骤不生成最终权重外层，也不生成主要或辅助画师的自主 weight。
7. Skill Agent 完成 `SKILL.md` 第 5 章的冲突与重复内容删除后，按照“用户合法显式数值 > 合法来源权重形式 > 主要、辅助或中性作用”的顺序选择一次最终形式。显式数值逐字符写回最终元素；Skill Agent 不执行截断、补零、删除末尾零或数值格式化。

Skill Agent 保留 payload 内部的空格、下划线、字母大小写和当前画师提示词中的其他可见字符。payload 必须来自语义查询接口文档允许采用的一个 Style 来源。画师身份和来源由 Skill Agent 的采用流程与语义自检确认，格式校验器不判断画师身份。

## 括号和方括号转义

payload 内部作为文字出现的圆括号、方括号和反斜杠按照 `prompt-weight-policy.json` 的 `syntax.payload` 转义。Skill Agent 从左向右消费转义对，并保留合法来源转义。

权重外层内部开头和结尾不保留空白，冒号两侧不保留空白。一个元素只有一层权重外层。

## 主要、辅助和中性画师

| 画师作用 | 处理方式 |
| --- | --- |
| 中性画师 | 保持未加权 payload |
| 主要画师 | 读取 `recommendations.levels.light` 的数值并生成显式权重 |
| 辅助画师 | 读取 `recommendations.levels.deemphasis` 的数值并生成显式权重 |

用户或合法来源权重的优先级高于本表。Skill Agent 必须把属性值读取为数值后写入最终 Prompt，不能把属性路径字符串写入 Prompt。

## 去重和顺序

Skill Agent 在 `SKILL.md` 第 5 章的冲突处理阶段解析来源外层和来源前缀后比较 payload，并删除完全相同的重复画师项。Skill Agent 为保留的 payload 同时保留来源优先级最高的权重记录，并且只在冲突处理结束后的权重设计步骤生成一次最终数组元素。

用户明确指定顺序时，Skill Agent 保留用户顺序。用户没有指定顺序时，主要画师位于中性画师之前，中性画师位于辅助画师之前；同一作用内保持 UI 选择顺序或采用顺序。

完整 `artist` 位置位于 `quality` 之后和 `subject` 之前。

## 完成检查

Skill Agent 必须确认：

- 每个数组元素只对应一个合法 Style 来源画师；
- payload、来源权重和用户权重按照来源优先级处理；
- payload 内部字符和必要转义得到保留；
- 中性、主要和辅助作用读取了正确的策略属性；
- `artist` 中没有普通画风、媒介、摄影效果或光线内容。
