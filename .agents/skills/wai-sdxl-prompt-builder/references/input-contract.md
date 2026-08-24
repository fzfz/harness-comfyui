# 当前轮输入合同

## 用途和读取时机

本文件是 Skill Agent 可见的当前轮输入对象、字段用途、UI 选择顺序和空选择行为的唯一来源。

Skill Agent 每次执行本 Skill 时，必须在整理用户要求前完整读取本文件。

## 顶层对象

| 字段 | 取值 | 用途 |
|---|---|---|
| `kind` | `noobai_user_prompt` | 标识当前轮输入对象；不写入 Prompt。 |
| `version` | `1.0.0` | 标识当前轮输入合同版本；不写入 Prompt。 |
| `request_id` | 字符串 | 标识当前请求；不写入 Prompt。 |
| `base_model_name` | 字符串 | 标识当前文生图底模；不写入 Prompt。 |
| `user_text` | 字符串 | 保存用户本轮自然语言画面要求。 |
| `ui_explicit` | 对象 | 保存用户在 UI 中明确选择的 Character 和 Style 快照。 |

## `ui_explicit`

| 字段 | 取值 | 用途 |
|---|---|---|
| `selection_snapshot_version` | `1.0.0` | 标识 UI 选择快照版本；不写入 Prompt。 |
| `source` | `ui_explicit` | 标识选择来源；不写入 Prompt。 |
| `selections` | 数组 | 按照本文件规定的顺序提供 Character 和 Style 选择项。 |

## `ui_explicit.selections[]`

每个选择项包含以下字段：

| 字段 | 取值 | 用途 |
|---|---|---|
| `kind` | `character` 或 `style` | 区分 Character 和 Style 选择项。 |
| `id` | 整数 | 标识被选目录项；不写入 Prompt。 |
| `name` | 字符串 | 标识被选 Character 或 Style 的名称。 |
| `prompt_text` | 字符串 | 提供该 UI 选择项的 Prompt 来源内容。 |
| `work_id` | 整数或 `null` | 标识 Character 所属作品；不写入 Prompt。 |
| `work_name` | 字符串或 `null` | 标识 Character 所属作品名称，用于区分不同作品中的同名角色。 |
| `selection_order` | 整数 | 控制 UI 选择项的稳定处理顺序，并在没有其他排序要求时提供同类选择项的默认顺序。 |
| `source` | `ui_explicit` | 标识选择项来源；不写入 Prompt。 |

Character 选择项的 `kind` 是 `character`，`work_id` 是整数，`work_name` 是字符串。Style 选择项的 `kind` 是 `style`，`work_id` 和 `work_name` 都是 `null`。

## 处理顺序和采用位置

1. Skill Agent 按照 `selection_order` 数值升序处理选择项。多个选择项具有相同 `selection_order` 时，Skill Agent 保持它们在 `selections` 数组中的原始先后顺序。
2. Character 选择项的 `prompt_text` 进入 `character` 采用流程；Style 选择项的 `prompt_text` 进入 `artist` 采用流程。
3. `selection_order` 控制输入消费顺序，并在没有其他排序要求时控制同类选择项的默认顺序。用户明确的画师顺序和画师作用顺序按照 [画师采用规则](artist-adoption.md)与 [WAI 画师语法](wai-artist-syntax.md)处理；角色主体对应顺序按照 [`character` 位置规则](prompt-position-rules/character.md)处理。最终 Prompt 仍按照十五位置固定顺序排列，`artist` 位于 `character` 之前。
4. `selections` 是空数组时，Skill Agent 不创建 UI 选择内容，并继续根据 `user_text` 完成本轮画面。

## 完成条件

Skill Agent 已经读取 `user_text`，按照稳定顺序处理每个选择项，并且没有把输入元数据写入 Prompt 时，当前轮输入处理完成。
