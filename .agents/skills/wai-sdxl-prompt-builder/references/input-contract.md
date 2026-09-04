# 当前用户消息输入合同

## 用途和读取时机

本文件是当前用户消息普通文字、`comfyui-context` Character 上下文记录、`comfyui-context` Style 上下文记录和这些上下文记录出现顺序的唯一输入合同。

Skill 执行者每次解析当前用户消息并构建最终 Prompt 前完整读取本文件。

## 当前用户消息

当前用户消息由普通文字和零个或多个 `comfyui-context` 上下文记录 JSON 行组成；每条上下文记录的 `type` 字段值均为 `comfyui-context`。Skill 执行者把这些 JSON 行以外的普通文字作为本轮自然语言画面要求。

Skill 执行者只把 `data.kind` 字段值为 `character` 或 `style` 的 `comfyui-context` 上下文记录纳入本轮最终 Prompt 的构建输入。

## Character 上下文记录

| 字段 | 取值 | 用途 |
|---|---|---|
| `type` | `comfyui-context` | 标识上下文记录。 |
| `data.kind` | `character` | 标识 Character 上下文记录。 |
| `data.id` | 字符串 | 标识 Character 上下文记录对应的被选角色；不写入 Prompt。 |
| `data.work_name` | 字符串 | 标识角色所属作品并辅助消歧；不直接写入 Prompt。 |
| `data.character_name` | 字符串 | 标识被选角色并辅助消歧；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串 | 作为最终 Prompt 中 `character` 位置的角色描述来源。 |

## Style 上下文记录

| 字段 | 取值 | 用途 |
|---|---|---|
| `type` | `comfyui-context` | 标识上下文记录。 |
| `data.kind` | `style` | 标识 Style 上下文记录。 |
| `data.id` | 字符串 | 标识 Style 上下文记录对应的被选画师；不写入 Prompt。 |
| `data.name` | 字符串 | 标识被选画师并辅助消歧；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串 | 作为最终 Prompt 中 `artist` 位置的画师描述来源。 |

## 处理顺序和采用位置

1. Skill 执行者按照 Character 上下文记录和 Style 上下文记录在当前用户消息中的出现顺序读取并采用各条记录。
2. Skill 执行者根据 [画师采用规则](artist-adoption.md)和 [WAI 画师语法](wai-artist-syntax.md)确定用户明确指定的画师在 `artist` 位置中的排列顺序，并确定每名画师承担主要、中性或辅助作用；Skill 执行者根据 [`character` 位置规则](prompt-position-rules/character.md)确定 Character 上下文记录与 `character` 位置中画面主体的对应顺序。
3. 上下文记录在当前用户消息中的出现顺序只决定记录处理顺序，不改变最终 Prompt 的位置顺序；最终 Prompt 中 `artist` 位置始终位于 `character` 位置之前。
4. 当前用户消息既没有 Character 上下文记录，也没有 Style 上下文记录时，Skill 执行者只根据普通文字构建最终 Prompt。
