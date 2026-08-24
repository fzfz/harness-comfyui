# `artist` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `artist` 位置。UI 已选 Style、用户指定具体画师或 Skill Agent 采用 Style 查询结果时，Skill Agent 必须读取本文件。

UI 已选 Style 的字段和处理顺序由 [当前轮输入合同](../input-contract.md)定义。

`artist` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 可用内容

Skill Agent 按照[语义查询接口与调用流程](../semantic-tool-orchestration.md)取得一个或多个被采用画师的画师提示词。只有取得合法画师提示词时才创建 `artist`。

## 一个或多个画师

采用一个画师时，Skill Agent 使用该画师的画师提示词完成一个画师项。

采用多个画师时，Skill Agent 为每个画师分别保留独立的画师提示词，分别应用 WAI 画师语法，再按照已确定的画师顺序组合。多个画师不能合并为一个无法区分来源的画师项。

具体采用步骤由[画师采用规则](../artist-adoption.md)规定；外层格式、转义和权重由[WAI 画师语法](../wai-artist-syntax.md)规定。

## 位置边界

- 具体画师提示词进入 `artist`。
- 普通画风、媒介风格和渲染风格进入 `non_artist_style`。
- 摄影效果、数字效果和整体画面情绪进入 `detail_mood`。
- 光源、阴影、色彩和对比度进入 `lighting`。

## 完成检查

Skill Agent 必须确认 `artist`：

- 每个画师项都来自语义查询接口文档允许采用的画师提示词；
- 多个画师分别应用 WAI 画师语法；
- 位于 `quality` 之后、`subject` 之前；
- 没有混入普通画风、媒介、摄影效果或光线内容。
