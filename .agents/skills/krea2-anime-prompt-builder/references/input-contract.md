---
文档用途: 提供 Krea2 当前消息的输入合同。
读取时机: 构建 Krea2 动漫 Prompt、整理画面要求前。
---

# 当前消息输入合同

## 当前用户消息

1. 当前用户消息由普通文字和零个或多个 `type=comfyui-context` JSON 行组成。Skill 执行者把这些 JSON 行以外的文字作为本次自然语言要求。

2. Skill 执行者只采用 `data.kind=character` 和 `data.kind=style` 的 `comfyui-context` 记录。其他 `type=comfyui-context` JSON 行不产生本 Skill 的 Prompt 内容。

## 小说材料与人物设计

1. 用户指定小说原文、人物资料或证据包时，先执行 `character-portrait-prompt-designer`。已有本次人物设计产物时，读取交接的外观基准、当前阶段、画面说明与设计依据。
2. 把当前画面中可见的身份、外貌、服装、动作与环境用于单条 Krea2 Prompt。保留资料事实与设计补充的来源区别。
3. 人物设计作为画面设计来源。用户要求取得目录角色 Prompt 或采用目录身份时，记录待查询对象。

## Character 上下文记录

1. Skill 执行者按下表读取 Character 字段。

   | JSON 属性 | 取值 | Skill 执行者用途 |
   | --- | --- | --- |
   | `type` | `comfyui-context` | 标识当前消息中的上下文记录。 |
   | `data.kind` | `character` | 标识 Character 上下文记录。 |
   | `data.id` | 字符串 | 标识 Character；`data.prompt_text` 为空时可以作为角色目录精确查询 ID；不写入 Prompt。 |
   | `data.work_name` | 字符串 | 识别角色所属作品并构造角色目录查询；不写入 Prompt。 |
   | `data.character_name` | 字符串 | 识别角色并构造角色目录查询；不代替 `data.prompt_text`。 |
   | `data.prompt_text` | 字符串或缺失 | 提供角色身份、外观、服装或触发词的 Prompt 来源。 |

2. `data.prompt_text` 去除首尾空白后非空时，采用该文本。文本缺失或为空时，记录角色 ID、名称与所属作品，交给 [目录查询步骤](../SKILL.md#查询目录中的作品角色画师和-prompt-词条)处理。

## Style 上下文记录

1. Skill 执行者按下表读取 Style 字段。

   | JSON 属性 | 取值 | Skill 执行者用途 |
   | --- | --- | --- |
   | `type` | `comfyui-context` | 标识当前消息中的上下文记录。 |
   | `data.kind` | `style` | 标识 Style 上下文记录。 |
   | `data.id` | 字符串 | 标识 Style；`data.prompt_text` 为空时可以作为 Style 目录精确查询 ID；不写入 Prompt。 |
   | `data.name` | 字符串 | 识别画师或画风并构造 Style 目录查询；不代替 `data.prompt_text`。 |
   | `data.prompt_text` | 字符串或缺失 | 提供画师、媒介、线条、上色或视觉风格的 Prompt 来源。 |

2. `data.prompt_text` 去除首尾空白后非空时，采用该文本。文本缺失或为空时，记录 Style ID 与名称，交给 [目录查询步骤](../SKILL.md#查询目录中的作品角色画师和-prompt-词条)处理。

## 读取、采用和冲突处理顺序

1. Skill 执行者先读取当前用户消息中的全部普通文字，再按照当前消息中的出现顺序读取全部 Character 和 Style 上下文记录；同类记录保持消息顺序。
2. Skill 执行者按 [历史查询步骤](../SKILL.md#查询或复用历史-generation-run) 处理历史输入。用户选定多个历史正向 Prompt 时，Skill 执行者按 `runs[]` 顺序读取对应文本。
3. 按本文件的 Character 与 Style 规则整理已有内容和待查询项。
4. 内容冲突时，Skill 执行者按 [来源优先级](../SKILL.md#构建单条-krea2-动漫-prompt) 选择内容。
5. 同一优先级的内容冲突时，Skill 执行者按以下顺序保留先出现的内容，并遵守更高优先级来源：

   1. 历史正向 Prompt：`runs[]` 顺序。
   2. Character 或 Style 记录：当前消息中的记录顺序。
   3. 语义查询结果：查询目标在当前消息中的首次出现顺序。

6. 当前用户消息普通文字没有指定某项画面内容时，Skill 执行者使用优先级较低来源中的非冲突内容补齐该项。

## 输入整理完成条件

1. 已读取普通文字、本次人物设计与用户指定的历史输入，已按消息顺序整理 Character 和 Style 记录。
2. 已记录输入中的目录查询需求和待补充记录。画师方向与词条查询文本按后续画面设计确定。
