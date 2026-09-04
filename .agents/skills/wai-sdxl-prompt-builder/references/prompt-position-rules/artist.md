# `artist` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何填写 `artist` 位置。Skill Agent 采用一项或多项 Style Prompt 来源时，必须读取本文件。

Style 上下文记录的字段和处理顺序由 [当前轮输入合同](../input-contract.md)定义。

`artist` 的内容职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)定义。

## 可用内容

Skill Agent 按照[画师采用规则](../artist-adoption.md)确定一个或多个已采用的画师，并为每名画师取得一项已采用的 Style Prompt 内容。Skill Agent 仅在该画师具有非空 Style Prompt 内容时为其创建画师项。

## 多个画师

采用多个画师时，Skill Agent 为每名画师保留独立的画师提示词，并按照已确定的画师顺序排列各画师对应的 `artist` 数组元素。

## 画师项格式

Skill Agent 按照 [WAI 画师语法](../wai-artist-syntax.md)规定的画师项格式、转义方式和权重写法，把每名画师的提示词转换为对应的 `artist` 数组元素。

## 位置边界

- 具体画师提示词进入 `artist`。
- 普通画风、媒介风格和渲染风格进入 `non_artist_style`。
- 摄影效果、数字效果和整体画面情绪进入 `detail_mood`。
- 光源、阴影、色彩和对比度进入 `lighting`。

## 完成检查

Skill Agent 必须确认 `artist`：

- `artist` 位于 `quality` 之后、`subject` 之前。
