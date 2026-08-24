# `subject` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `subject` 位置。当前主场景、用户要求或跨位置配方需要说明主体数量、性别组合、主体类别或特殊身份类型时，Skill Agent 必须读取本文件。

`subject` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 主体数量

Skill Agent 必须使用与最终画面一致的精确主体数量。画面包含多类主体时，Skill Agent 分别表达每类主体的数量，确保总数与构图一致。

Character 来源内容包含 `1girl`、`1boy` 或其他单角色数量标签时，`subject` 仍然表达整幅画面的准确主体总数。该总数标签与 Character 来源内容中的单角色数量标签可以重复。

环境叙事主场景可以没有主体；此时不创建 `subject`。用户在环境叙事中加入人物、动物、非人生命或其他主体时，Skill Agent 根据实际内容创建 `subject`。

## 主体类别和身份类型

`subject` 可以表达：

- 人物的数量和性别组合；
- 动物、怪物、机械体、拟人主体或其他主体类别；
- 画面关系必须明确的特殊身份类型。

具体角色身份不进入 `subject`。例如作品角色的触发 Prompt 进入 `character`，头发、眼睛、体型和非人身体特征进入 `appearance`。

## 多主体对应关系

画面包含多名主体时，Skill Agent 必须确保 `subject` 的数量与 `appearance`、`outfit`、`action`、`expression_reaction` 和 `relation_narrative` 中实际出现的主体一致。

`subject` 只说明“画面中有哪些主体”；每名主体是谁、长什么样、穿什么、做什么以及与谁发生关系，由后续位置分别表达。

## 完成检查

Skill Agent 必须确认 `subject`：

- 主体总数与选定构图一致；
- 性别组合和主体类别与用户要求一致；
- 没有把具体角色 Prompt、外貌、动作或关系句写入本位置；
- 多主体数量与后续各位置中的主体能够逐一对应。
