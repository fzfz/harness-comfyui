# `quality` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `quality` 位置。Skill Agent 每次生成 Prompt 时都必须读取本文件。

`quality` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 固定质量内容

Skill Agent 必须读取 `../prompt-weight-policy.json` 的 `recommendations.unweighted_quality.content`，并把该数组按原顺序作为一个连续、未加权的质量段放在最终 Prompt 开头。

## 用户明确质量要求

用户明确要求更高或更低的细节量、清晰度、分辨率或其他质量特征时，Skill Agent 必须先判断固定质量内容是否已经表达该要求。

- 固定质量内容已经表达用户要求时，不重复添加同义内容。
- 固定质量内容没有表达用户要求时，把对应英文质量内容加入 `quality`。
- 用户明确要求删除或替换某项固定质量内容时，按照用户本轮要求修改该项内容。

## 位置边界

- 画师提示词进入 `artist`。
- 画面风格和媒介风格进入 `non_artist_style`。
- 摄影效果和数字效果进入 `detail_mood`。
- 输出形态和生产用途进入 `technical`。

## 完成检查

Skill Agent 必须确认 `quality`：

- 位于最终 Prompt 第一位；
- 使用连续的英文质量标签；
- 没有重复同义质量内容；
- 没有混入主体、角色、画师、动作、镜头、环境、风格或技术内容。
