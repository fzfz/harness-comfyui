---
文档用途: 定义 WAI 画面要求、材料型输入与上下文记录的采用方式。
读取时机: 构建 WAI Prompt、整理本轮画面要求前。
---

# 当前用户消息输入合同

## 当前用户消息

1. 当前用户消息由普通文字和零个或多个 `comfyui-context` 上下文记录 JSON 行组成。Skill 执行者把这些 JSON 行以外的普通文字作为本轮自然语言画面要求。

2. Skill 执行者只把 `data.kind` 为 `character` 或 `style` 的上下文记录纳入本轮 Prompt 输入。

## 材料型输入

1. 材料型输入指用户指定的小说原文、人物资料、证据包，以及据此形成的人物外观基准和画面说明。
2. 输入仍为原始材料时，先执行 `character-portrait-prompt-designer`。已有本次人物设计产物时，读取交接的外观基准、剧情阶段、画面说明与设计依据。
3. 将可见内容作为本轮画面要求，按 [WAI Prompt 位置顺序与职责](wai-prompt-position-order.md)映射位置。保留资料事实与设计补充的来源区别。
4. 材料型输入可独立用于构建 Prompt。完整 Character Prompt 的处理仍按 `character` 位置规则执行。

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
4. 当前消息没有 Character 或 Style 上下文记录时，按本文件采用的自然语言要求、材料型输入和已确定的历史来源构建 Prompt。
