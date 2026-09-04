# `character` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `character` 位置。Skill Agent 采用一条或多条 Character Prompt 来源时，必须读取本文件。

Character 上下文记录的字段和处理顺序由 [当前轮输入合同](../input-contract.md)定义。

`character` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## Character Prompt 来源

Skill Agent 必须先确定画面中的每个角色，并分别处理每个角色。Skill Agent 按照 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)的“Character 和 Style Prompt 来源”一节，为当前角色确定一条已采用 Character Prompt 来源。当前角色没有可采用的非空完整角色 Prompt 时，Skill Agent 不为该角色创建 `character` 内容。

用户本轮没有新增、替换或排除角色外貌或服装时，Skill Agent 把该角色已采用 Character Prompt 来源中的完整角色 Prompt 原样写入 `character`。

## 新增、替换、排除与来源保留

- 用户本轮明确要求新增某个角色的外貌或服装时，Skill Agent 保留该角色的完整角色 Prompt，并把新增内容写入 `appearance` 或 `outfit`。
- 用户本轮明确要求替换某个角色的外貌或服装时，Skill Agent 从该角色本轮的 `character` 内容中删除与替换内容直接冲突的标签，并把该角色的替换内容写入 `appearance` 或 `outfit`。
- 用户本轮明确要求排除某个角色的外貌或服装时，Skill Agent 从该角色本轮的 `character` 内容中删除被排除的标签，且不向 `appearance` 或 `outfit` 添加该排除内容。
- 画面包含多个角色且用户要求新增、替换或排除外貌或服装时，Skill Agent 必须使用角色名称把要求对应到具体角色。用户没有提供角色名称时，Skill Agent 使用选定构图中已经确定的唯一画面位置和可见外貌共同标识目标角色。现有信息仍无法唯一确定目标角色时，Skill Agent 请求用户明确目标角色，并在收到回复前停止构造 Prompt。
- Skill Agent 保留目标角色的角色名、作品名和其他不冲突的标签，并保留其他角色的全部标签。
- Skill Agent 只修改本轮待输出的 `character` 内容，不修改输入来源中保存的 Prompt 文本。

## 用户只提供作品时

用户只提供作品名称而没有指定角色时，Skill Agent 按照[语义查询接口与调用流程](../semantic-tool-orchestration.md)查询并采用唯一符合的 Work 结果，然后报告该结果的 `id` 和 `name`，请求用户指定角色名称。用户指定角色名称后，Skill Agent 使用该 Work 结果的 `id` 作为 `work_id` 查询角色。用户尚未指定角色名称时，Skill Agent 不执行 Character Search，也不创建 `character` 内容。

## 多角色顺序

画面采用多个角色时，Skill Agent 按照选定构图中的主体顺序排列 `character` 中的各角色 Prompt。`appearance`、`outfit`、`action` 和 `expression_reaction` 按照相同的主体顺序排列角色相关内容，并使用角色名称标明每项内容的所属角色。角色没有名称时，Skill Agent 使用选定构图中已经确定的唯一画面位置和可见外貌共同标明所属角色。某项内容仍无法唯一对应到一个角色时，Skill Agent 请求用户确认所属角色，并在收到确认前停止构造 Prompt。

## 位置边界

- 用户新增角色外貌或服装时，`character` 保存已采用 Character Prompt 来源的完整角色 Prompt；用户替换或排除角色外貌或服装时，`character` 只保存按照“新增、替换、排除与来源保留”一节删除对应标签后的角色 Prompt。
- 整幅画面的主体总数和主体类别进入 `subject`。
- 用户明确要求且本轮 Character Prompt 没有包含的新增或替换外貌进入 `appearance`。
- 用户明确要求且本轮 Character Prompt 没有包含的新增或替换服装或随身物件进入 `outfit`。

## 完成检查

Skill Agent 必须确认 `character`、`appearance`、`outfit`、`action` 和 `expression_reaction` 的角色内容：

- `character` 中每个角色的角色 Prompt 都来自一条已采用 Character Prompt 来源；
- `character`、`appearance`、`outfit`、`action` 和 `expression_reaction` 中按角色组织的内容都采用选定构图中的同一主体顺序；
- 画面采用多个角色时，每项角色内容使用角色名称标明所属角色；角色没有名称时，该项内容使用唯一画面位置和可见外貌的组合标明所属角色；
- 用户没有新增、替换或排除角色外貌或服装时，`character` 完整保留每个角色已采用 Character Prompt 来源中的角色 Prompt；
- 用户新增角色外貌或服装时，`character` 完整保留来源 Prompt，新增内容进入 `appearance` 或 `outfit`；
- 用户替换角色外貌或服装时，`character` 只删除直接冲突的原标签，替换内容进入 `appearance` 或 `outfit`；
- 用户排除角色外貌或服装时，`character` 只删除被排除的标签，最终 Prompt 不加入排除内容；
- `appearance` 和 `outfit` 没有重复写入 `character` 中保留的同一标签或同一项具体内容；
- 输入来源中保存的 Prompt 文本保持不变。
