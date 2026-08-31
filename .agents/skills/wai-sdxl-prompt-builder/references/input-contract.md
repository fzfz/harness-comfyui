# 当前轮输入合同

## 用途和读取时机

本文件是当前用户消息普通文字、UI Character 记录、UI Style 记录和记录顺序的唯一输入合同。

Skill Agent 每次执行本 Skill 时，必须在整理用户要求前完整读取本文件。

## 当前用户消息

当前用户消息由普通文字和零个或多个 `type=comfyui-context` JSON 行组成。Skill Agent 把除这些 JSON 行以外的普通文字作为本轮自然语言画面要求。

Skill Agent 只采用 `data.kind=character` 和 `data.kind=style` 的 `comfyui-context` 记录。

## Character 记录

| 字段 | 取值 | 用途 |
|---|---|---|
| `type` | `comfyui-context` | 标识上下文记录。 |
| `data.kind` | `character` | 标识 Character 记录。 |
| `data.id` | 字符串 | 标识被选 Character；不写入 Prompt。 |
| `data.work_name` | 字符串 | 标识角色所属作品并辅助消歧；不直接写入 Prompt。 |
| `data.character_name` | 字符串 | 标识被选角色并辅助消歧；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串 | 提供进入 `character` 采用流程的角色 Prompt 来源。 |

## Style 记录

| 字段 | 取值 | 用途 |
|---|---|---|
| `type` | `comfyui-context` | 标识上下文记录。 |
| `data.kind` | `style` | 标识 Style 记录。 |
| `data.id` | 字符串 | 标识被选 Style；不写入 Prompt。 |
| `data.name` | 字符串 | 标识被选画师并辅助消歧；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串 | 提供进入 `artist` 采用流程的画师 Prompt 来源。 |

## 处理顺序和采用位置

1. Skill Agent 按照 Character 和 Style JSON 行在当前用户消息中的出现顺序处理记录。没有其他排序要求时，同类记录保持该顺序。
2. Character 记录的 `data.prompt_text` 进入 `character` 采用流程；Style 记录的 `data.prompt_text` 进入 `artist` 采用流程。
3. 用户明确的画师顺序和画师作用顺序按照 [画师采用规则](artist-adoption.md)与 [WAI 画师语法](wai-artist-syntax.md)处理；角色主体对应顺序按照 [`character` 位置规则](prompt-position-rules/character.md)处理。
4. 最终 Prompt 仍按照十五位置固定顺序排列，`artist` 位于 `character` 之前。
5. 当前消息没有 Character 或 Style 记录时，Skill Agent 只使用普通文字完成本轮画面设计。

## 完成条件

Skill Agent 已读取当前用户消息中的普通文字，并按消息行顺序处理全部 Character 和 Style 记录时，当前轮输入处理完成。
