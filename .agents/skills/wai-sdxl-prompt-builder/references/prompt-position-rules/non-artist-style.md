# `non_artist_style` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `non_artist_style` 位置。用户要求普通画风、媒介风格或其他不指向具体画师的描述性风格，或者完整画面设计需要这些内容时，Skill Agent 必须读取本文件。

`non_artist_style` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 可用内容

`non_artist_style` 可以采用：

- 用户明确要求的普通画风或媒介风格；
- 按照语义查询接口文档采用的普通视觉概念；
- Skill Agent 根据用户要求、选定构图和完整画面设计完成的普通画面风格内容。

Prompt-term 接口和字段用途由[语义查询接口与调用流程](../semantic-tool-orchestration.md)统一规定。

## 风格组合

画面需要多个普通风格方向时，Skill Agent 必须判断这些方向是否能够共同作用于同一画面。能够组合时，每项风格承担明确作用；不能组合时，按照用户本轮意图和选定画面目的保留更匹配的方向。

具体画师和普通画风可以同时存在。具体画师进入 `artist`，普通画风和媒介风格进入 `non_artist_style`，两者保持各自位置。

## 位置边界

- 被采用的具体画师内容进入 `artist`。
- 可见媒介质感、摄影效果、数字效果、运动表现和整体画面情绪进入 `detail_mood`。
- 光源、阴影、色彩和对比度进入 `lighting`。
- 用户明确要求的输出形态或生产用途进入 `technical`。

## 完成检查

Skill Agent 必须确认 `non_artist_style`：

- 每项内容都是非画师画风、媒介风格或其他描述性风格；
- 被采用的普通视觉概念准确使用语义查询接口文档规定的内容；
- 没有使用具体画师内容表达普通画风；
- 多个风格方向能够共同形成同一画面；
- 没有重复 `detail_mood`、`lighting` 或 `technical` 中的内容。
