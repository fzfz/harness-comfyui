# 当前消息输入合同

## 用途和读取时机

本文件定义当前用户消息普通文字、当前消息 Character 或 Style 上下文记录、历史 Generation Run 查询结果和语义查询结果的来源身份、读取顺序、采用条件与冲突优先级。Skill 执行者每次构建 Krea2 动漫 Prompt 时，必须在整理画面要求前完整读取本文件。

历史 Generation Run 查询结果是 `generation-cli.md` 返回的查询结果，独立于当前用户消息普通文字、当前消息 `comfyui-context` 记录和语义查询结果。当前用户消息普通文字明确要求采用历史正向 Prompt 时，Skill 执行者才采用对应查询结果中的 `arguments.parameters.positive_prompt`。

## 当前用户消息

当前用户消息由普通文字和零个或多个 `type=comfyui-context` JSON 行组成。Skill 执行者把这些 JSON 行以外的文字作为本次自然语言要求。

Skill 执行者只采用 `data.kind=character` 和 `data.kind=style` 的 `comfyui-context` 记录。其他 `type=comfyui-context` JSON 行不产生本 Skill 的 Prompt 内容。

## Character 上下文记录

| JSON 属性 | 取值 | Builder 用途 |
| --- | --- | --- |
| `type` | `comfyui-context` | 标识当前消息中的上下文记录。 |
| `data.kind` | `character` | 标识 Character 上下文记录。 |
| `data.id` | 字符串 | 标识 Character；`data.prompt_text` 为空时可以作为角色目录精确查询 ID；不写入 Prompt。 |
| `data.work_name` | 字符串 | 识别角色所属作品并构造角色目录查询；不写入 Prompt。 |
| `data.character_name` | 字符串 | 识别角色并构造角色目录查询；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串或缺失 | 提供角色身份、外观、服装或触发词的 Prompt 来源。 |

Skill 执行者直接采用删除首尾空白后非空的 `data.prompt_text` 产生角色内容。`data.prompt_text` 缺失或删除首尾空白后为空时，该 Character 上下文记录的 ID、角色名称和所属作品按照 `semantic-query-cli.md` 查询角色记录；被采用 Character 查询结果的 `prompt_text` 产生角色内容。

## Style 上下文记录

| JSON 属性 | 取值 | Builder 用途 |
| --- | --- | --- |
| `type` | `comfyui-context` | 标识当前消息中的上下文记录。 |
| `data.kind` | `style` | 标识 Style 上下文记录。 |
| `data.id` | 字符串 | 标识 Style；`data.prompt_text` 为空时可以作为 Style 目录精确查询 ID；不写入 Prompt。 |
| `data.name` | 字符串 | 识别画师或画风并构造 Style 目录查询；不代替 `data.prompt_text`。 |
| `data.prompt_text` | 字符串或缺失 | 提供画师、媒介、线条、上色或视觉风格的 Prompt 来源。 |

Skill 执行者直接采用删除首尾空白后非空的 `data.prompt_text` 产生风格内容。`data.prompt_text` 缺失或删除首尾空白后为空时，该 Style 上下文记录的 ID 和名称按照 `semantic-query-cli.md` 查询 Style 记录；被采用 Style 查询结果的 `prompt_text` 产生风格内容。

## 读取、采用和冲突处理顺序

1. Skill 执行者先读取当前用户消息中的全部普通文字，再按照当前消息中的出现顺序读取全部 Character 和 Style 上下文记录；同类记录保持消息顺序。
2. 当前用户消息普通文字明确要求查询历史 Generation Run 时，Skill 执行者按照 `generation-cli.md` 查询指定的 `run_id`。普通文字明确要求采用某个查询结果的历史正向 Prompt 时，Skill 执行者按照查询结果的 `runs[]` 顺序读取对应 `arguments.parameters.positive_prompt`。
3. Skill 执行者直接采用 Character 和 Style 上下文记录中删除首尾空白后非空的 `data.prompt_text`。该属性缺失或删除首尾空白后为空时，Skill 执行者按照 `semantic-query-cli.md` 查询对应记录；候选比较产生选中结果时，Skill 执行者采用该结果的 `prompt_text`，未产生选中结果时不采用语义查询内容。
4. 内容冲突时，Skill 执行者依次采用当前用户消息普通文字中的明确要求、用户明确选定的历史正向 Prompt、当前消息 Character 或 Style 上下文记录产生的内容、语义查询结果产生的内容。
5. 同一优先级的内容互相冲突时，多个历史正向 Prompt 按查询结果的 `runs[]` 顺序保留先出现的内容；多个 Character 或 Style 上下文记录产生的内容按记录在当前消息中的顺序保留先出现的内容；多个语义查询结果产生的内容按查询目标在当前用户消息中的首次出现顺序保留先出现的内容。保留的内容必须符合所有更高优先级来源。
6. 当前用户消息普通文字没有指定某项画面内容时，Skill 执行者使用优先级较低来源中的非冲突内容补齐该项。

## 完成条件

Skill 执行者已经读取全部普通文字、按消息顺序处理全部 Character 和 Style 上下文记录、完成普通文字明确要求的历史 Generation Run 查询，并完成所有因 `data.prompt_text` 为空或缺失而触发的语义查询时，当前消息输入读取完成。普通文字没有具体画面要求，并且所有已采用来源都没有产生可用的正向 Prompt 内容时，Skill 执行者必须请用户提供具体画面要求，然后停止 Prompt 构建。
