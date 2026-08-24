# `character` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `character` 位置。UI 已选 Character、用户要求具体作品角色或 Skill Agent 采用 Character 查询结果时，Skill Agent 必须读取本文件。

UI 已选 Character 的字段和处理顺序由 [当前轮输入合同](../input-contract.md)定义。

`character` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 可用内容

Skill Agent 按照[语义查询接口与调用流程](../semantic-tool-orchestration.md)取得一个或多个被采用角色的角色提示词。只有取得合法角色提示词时才创建 `character`。

用户本轮没有修改角色外貌或服装时，Skill Agent 把被采用角色的完整 `prompt_text` 原样写入 `character`。

用户本轮明确修改或排除 `prompt_text` 中的外貌或服装时，Skill Agent 只从本轮 `character` 内容中删除直接冲突的标签，并把用户要求写入 `appearance` 或 `outfit`。Skill Agent 保留角色名、作品名和其他不冲突的标签，也不修改查询结果或 UI 选择中的 `prompt_text` 字段值。

## 用户只提供作品时

用户只提供作品而没有指定角色时，Skill Agent 按照语义查询接口文档规定的 Work 到 Character 调用流程取得画面需要的角色提示词。

## 多角色顺序

画面采用多个角色时，Skill Agent 按照选定构图中的主体顺序排列各角色提示词，并确保后续 `appearance`、`outfit`、`action` 和 `expression_reaction` 能够对应到具体角色。

## 位置边界

- 用户没有修改角色外貌或服装时，完整角色来源 Prompt 进入 `character`。
- 整幅画面的主体总数和主体类别进入 `subject`。
- Character 来源内容尚未准确表达的可见外貌进入 `appearance`。
- Character 来源内容尚未准确表达的服装和随身物件进入 `outfit`。

## 完成检查

Skill Agent 必须确认 `character`：

- 每个角色内容都来自语义查询接口文档允许采用的角色提示词；
- 多个角色的顺序与画面主体顺序一致；
- 用户没有修改角色外貌或服装时，每个角色的内容完整保留；
- 用户明确修改或排除角色外貌或服装时，只删除直接冲突的标签；
- `appearance` 和 `outfit` 没有重复写入 Character 来源内容已经准确表达的内容。
