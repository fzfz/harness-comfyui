# `relation_narrative` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `relation_narrative` 位置。当前主场景在[场景分支矩阵](../composition-scenario-branches.md)中要求使用本位置，或者其他主场景的标签不能准确表达本位置负责的关系时，Skill Agent 必须读取本文件。

`relation_narrative` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 使用条件

Skill Agent 必须先完成前十四个位置，再按照以下分支处理：

- 当前主场景在[场景分支矩阵](../composition-scenario-branches.md)中把 `relation_narrative` 列为必须位置时，Skill Agent 必须创建本位置。
- 其他主场景按照下列关系是否仍未被标签准确表达决定是否创建本位置：

- 谁对谁执行动作；
- 谁持有、接触、支撑、遮挡、观看或跟随谁；
- 多名主体之间的关系和分组；
- 主体位于哪个对象的内部、外部、前方、后方、上方或下方；
- 多个画格之间的顺序、时间、状态或因果关系；
- 画面必须显示但标签无法确定归属的剧情内容。

其他主场景存在至少一项上述未表达关系时才创建 `relation_narrative`；不存在上述未表达关系时不创建。

## 英文短句

Skill Agent 必须使用简短、完整的英文句子，明确写出具体主体、关系或动作、具体目标以及必要的画格或空间信息。

同一画面存在多项关联关系时，Skill Agent 应当把能够共同表达的内容合并为最少数量的短句，同时保持每项关系的主体和目标清楚。

## 固定位置

`relation_narrative` 位于全部英文标签之后。它不能插入 `action`、`camera_composition`、`environment` 或其他标签位置之间。

场景分支矩阵规定的必需场景使用 `relation_narrative` 明确本位置负责的关系；句子可以引用相关动作或位置标签，以明确具体主体和具体目标。其他主场景的 `relation_narrative` 只补充标签未能准确表达的关系。

## 完成检查

Skill Agent 必须确认 `relation_narrative`：

- 每个句子都具有明确主体和明确目标；
- 场景分支矩阵规定的必需场景已经使用句子明确本位置负责的关系；
- 其他主场景的句子只补充标签无法准确表达的关系；
- 多主体、动作和画格归属不会产生歧义；
- 位于全部标签之后。
