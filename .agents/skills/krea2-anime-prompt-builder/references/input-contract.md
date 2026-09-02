# 当前回合输入合同

## 用途和读取时机

本文件定义当前用户消息中的普通文字、Character 记录、Style 记录和记录顺序。Skill 执行者每次构建 Krea2 动漫 Prompt 时，必须在整理画面要求前完整读取本文件。

历史 Generation Run 查询的 `run_id`、命令和输出由 `generation-cli.md` 定义，不由本文件定义。

## 当前用户消息

当前用户消息由普通文字和零个或多个 `type=comfyui-context` JSON 行组成。Skill 执行者把这些 JSON 行以外的文字作为本次自然语言要求。

Skill 执行者只采用 `data.kind=character` 和 `data.kind=style` 的 `comfyui-context` 记录。其他 JSON 行不产生本 Skill 的 Prompt 内容。

## Character 记录

| JSON 属性 | 取值 | Builder 用途 |
| --- | --- | --- |
| `type` | `comfyui-context` | 标识当前消息中的上下文记录。 |
| `data.kind` | `character` | 标识 Character 记录。 |
| `data.id` | 字符串 | 标识 Character；`data.prompt_text` 为空时可以作为角色目录精确查询 ID；不写入 Prompt。 |
| `data.work_name` | 字符串 | 识别角色所属作品并构造角色目录查询；不写入 Prompt。 |
| `data.character_name` | 字符串 | 识别角色并构造角色目录查询；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串 | 提供角色身份、外观、服装或触发词的 Prompt 来源。 |

Skill 执行者直接采用非空 `data.prompt_text` 产生角色内容。`data.prompt_text` 为空或缺失时，该 Character 记录的 ID、角色名称和所属作品只按照 `semantic-query-cli.md` 查询角色记录；只有被采用查询结果的 `prompt_text` 可以产生角色内容。

## Style 记录

| JSON 属性 | 取值 | Builder 用途 |
| --- | --- | --- |
| `type` | `comfyui-context` | 标识当前消息中的上下文记录。 |
| `data.kind` | `style` | 标识 Style 记录。 |
| `data.id` | 字符串 | 标识 Style；`data.prompt_text` 为空时可以作为 Style 目录精确查询 ID；不写入 Prompt。 |
| `data.name` | 字符串 | 识别画师或画风并构造 Style 目录查询；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串 | 提供画师、媒介、线条、上色或视觉风格的 Prompt 来源。 |

Skill 执行者直接采用非空 `data.prompt_text` 产生风格内容。`data.prompt_text` 为空或缺失时，该 Style 记录的 ID 和名称只按照 `semantic-query-cli.md` 查询 Style 记录；只有被采用查询结果的 `prompt_text` 可以产生画师内容。

## 处理顺序和冲突

1. Skill 执行者按照 Character 和 Style JSON 行在当前消息中的出现顺序处理记录。
2. Skill 执行者保留同类记录的消息顺序，不按照名称或 ID 重新排序。
3. 当前普通文字中的明确修改、排除或风格要求优先于 Character/Style `data.prompt_text`。
4. 后出现的上下文记录不得覆盖用户普通文字中的明确要求；多个上下文记录互相冲突时，Skill 执行者保留先出现且与用户要求一致的内容，并删除后出现的冲突内容。
5. 当前普通文字没有指定某项画面内容时，Skill 执行者可以使用 Character/Style `data.prompt_text` 或被采用目录候选的对应 `prompt_text` 补齐该项。

## 完成条件

Skill 执行者已经读取全部普通文字，并按消息顺序处理全部 Character/Style 记录时，当前回合输入读取完成。普通文字、可识别 Character/Style 记录和用户选定的历史正向 Prompt 全部不存在时，Skill 执行者必须请用户提供具体画面要求，然后停止 Prompt 构建。
