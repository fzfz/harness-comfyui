# Prompt 格式校验器接口

## 用途和读取时机

本文件规定 Skill Agent 调用 `scripts/validate-output.mjs` 时使用的输入、输出、退出码和最多三次调用流程。

Skill Agent 完成 [Prompt 自检](prompt-self-check.md) 和 [Prompt 冲突规则](prompt-conflict-rules.md)后，必须完整读取本文件，再调用校验器。

十五个 Prompt 位置的语义职责由 [WAI Prompt 位置顺序与职责](wai-prompt-position-order.md)规定。校验器只检查确定性格式并组合 Prompt，不判断任何位置内容的语义。

## 调用方式

Skill Agent 每次都调用 `run_skill_script`：

```json
{
  "script_path": "scripts/validate-output.mjs",
  "args": [],
  "stdin": "{\"positions\":{\"quality\":[\"masterpiece\"]},\"display_text\":\"已生成提示词。\"}"
}
```

`stdin` 是下节定义的标准输入对象序列化后的完整 JSON 字符串。校验器不接受命令行参数，不保存调用次数，也不判断当前是第几次调用。

## 标准输入

标准输入对象只允许 `positions` 和 `display_text`：

```json
{
  "positions": {
    "quality": ["masterpiece", "best quality"],
    "artist": ["(fukahire:1.1)", "(alzi xiaomi:0.8)"],
    "subject": ["2girls"],
    "character": ["frieren, sousou no frieren", "aura the guillotine, sousou no frieren"],
    "appearance": ["long white hair", "long purple hair"],
    "outfit": ["white capelet", "black dress"],
    "action": ["holding staff", "floating"],
    "expression_reaction": ["focused", "startled"],
    "camera_composition": ["medium wide shot", "rear view"],
    "environment": ["forest clearing", "night"],
    "detail_mood": ["magical particles", "tense atmosphere"],
    "lighting": ["rim lighting", "high contrast"],
    "non_artist_style": ["watercolor effect"],
    "technical": ["vertical poster"],
    "relation_narrative": [
      "Frieren aims her raised staff at Aura.",
      "Aura recoils while magic gathers at the staff tip!"
    ]
  },
  "display_text": "已生成芙莉莲与阿乌拉的竖版海报提示词。"
}
```

### `positions`

`positions` 只允许以下名称：

`quality → artist → subject → character → appearance → outfit → action → expression_reaction → camera_composition → environment → detail_mood → lighting → non_artist_style → technical → relation_narrative`

Skill Agent 必须遵守以下输入规则：

- 只创建本轮实际有内容的位置；不得创建空位置或空数组。
- 每个位置使用非空字符串数组。
- 每个数组元素必须是首尾无空白、不含控制字符的单行非空字符串。
- 每个数组元素只保存一份最终会进入 Prompt 的内容。
- 数组元素按照该位置最终输出顺序排列。
- 输入不得包含预先组合的 `prompt_text`、位置序号、来源、采用记录或 Prompt 内容副本。

`artist[]` 的每个元素必须是一名画师完成 WAI 外层语法和权重后的 `(payload:weight)` 最终片段。一个元素只能包含一名画师。payload 内作为文字使用的圆括号和方括号必须转义。权重必须使用 `0.25` 至 `1.5` 范围内的规范小数格式。

`relation_narrative[]` 的每个元素必须是以 `.`、`!` 或 `?` 结束的完整英文句子。使用 `relation_narrative` 时，前十四个位置必须至少包含一项 Prompt 内容。

### `display_text`

`display_text` 是成功 JSON 向用户显示的中文说明，不属于 Prompt 内容。该属性必须是首尾无空白且不含控制字符的单行非空字符串。

## 组合规则

校验器按照十五位置固定顺序读取实际存在的位置，并保留每个数组的元素顺序。

校验器使用英文逗号和一个空格 `, ` 连接前十四个位置的全部数组元素。存在 `relation_narrative` 时，校验器在完整标签部分后添加一次 `, `，再使用一个空格连接全部关系句。

组合后的 `prompt_text` 必须是首尾无空白且不含控制字符的单行非空字符串。

校验器不得修改输入字符串，不得执行 trim、大小写转换、翻译、逗号拆分、标签替换、重新格式化、语义去重、内容分类、位置迁移或重新排序。

## 校验成功

校验成功时：

- 退出码为 `0`；
- stderr 为空；
- stdout 写入一行完整五键成功 JSON。

```json
{
  "kind": "noobai_assistant_prompt",
  "result": "success",
  "contract_version": "1.0.0",
  "prompt_text": "masterpiece, best quality, ...",
  "display_text": "已生成提示词。"
}
```

校验器返回 `exit_code: 0` 时，本轮任务已经完成。Skill Agent 不再调用任何工具。Skill Agent 的下一条 assistant message 只包含固定文本 `Skill 执行结束。`，然后停止。该固定文本不包含、复制、包装或改写 `stdout`；系统从当前 `run_skill_script` toolResult 采用成功 JSON。

## 输入格式失败

输入格式失败时：

- 退出码为 `2`；
- stderr 写入一行只含 `violations` 的 JSON；
- stdout 为空。

stderr 示例：

```json
{
  "violations": [
    {
      "path": "positions.artist[1]",
      "message": "必须是一个完整的 (payload:weight) 画师片段"
    },
    {
      "path": "positions.relation_narrative[0]",
      "message": "必须以 .、! 或 ? 结束"
    }
  ]
}
```

`path` 指向本次标准输入中的违规位置。整个标准输入不是有效 JSON 时，`path` 使用 `$`。`message` 只说明必须满足的确定性格式，不复制违规原值。

第一次和第二次调用返回 `exit_code: 2` 时，Skill Agent 根据 stderr 的 `violations` 修改对应输入。第三次调用返回 `exit_code: 2` 时，Skill Agent 按照第三次 `violations[].message` 的顺序删除完全相同的重复消息，使用 `；` 连接剩余消息。Skill Agent 调用 `finalize_skill_error`，传入连接后的错误原因字符串，然后立即停止。

## 校验器未产生格式校验结果

`run_skill_script` 返回 Tool error 时，脚本没有返回 `exit_code`。当前 `run_skill_script` toolResult 中第一个 `type: "text"` 内容的完整 `text` 字符串是 `run_skill_script: Tool error message is empty` 时，该字符串表示原始 Tool error message 为空；Skill Agent 调用 `finalize_skill_error`，传入 `校验工具调用失败，但没有提供错误信息`。其他非空 `text` 字符串是完整 Tool error message；Skill Agent 从第一个字符到最后一个字符完整复制该字符串，作为 `finalize_skill_error` 的 `message` 参数，工具名称前缀、冒号和空格都属于该字符串。toolResult 的完整字符串是 `run_skill_script: execution timed out after 30000 ms` 时，`message` 必须是 `run_skill_script: execution timed out after 30000 ms`。

`run_skill_script` 返回 `exit_code: 1` 时，Skill Agent 不重试校验器。stderr 非空时，Skill Agent 删除 stderr 的末尾换行，调用 `finalize_skill_error`，传入剩余 stderr 原文。stderr 为空时，Skill Agent 调用 `finalize_skill_error`，传入 `校验器返回 exit_code: 1，但没有提供错误信息`。

`run_skill_script` 返回 `0`、`1`、`2` 以外的整数 `exit_code` 时，Skill Agent 不采用 stdout 或 stderr。Skill Agent 调用 `finalize_skill_error`，传入 `校验器返回未定义的退出码 <exit_code>`。

以上三种情况不属于输入格式失败，不进入最多三次的格式失败循环。

Skill Agent 调用 `finalize_skill_error` 后立即停止，不再手写或复制 JSON，也不再调用其他工具。`finalize_skill_error` 自身返回 Tool error 时，Skill Agent 不重试该工具，不手写 JSON，并立即停止。

## 最多三次调用

Skill Agent 负责记录本轮校验器调用次数：

1. 第一次或第二次格式失败后，读取 stderr 的全部 `violations`，只修改当前输入中对应的内容，重新执行 Prompt 自检和冲突检查，再调用同一个校验器。
2. 任意一次返回 `exit_code: 0` 后，Skill Agent 按照“校验成功”规则输出固定结束文本并停止。
3. 第三次格式失败后，不再调用校验器。Skill Agent 使用第三次 stderr 中的 `violations[].message` 生成错误原因字符串并调用 `finalize_skill_error`。
4. 不得执行第四次格式校验。
