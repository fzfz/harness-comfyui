# Prompt 格式校验器

## 读取时机与调用入口

Skill 执行者完成 Prompt 冲突处理、权重设计和自检后，完整读取本文件，再调用 Prompt 格式校验器。

`scripts/validate-output.mjs` 是相对于当前 `SKILL.md` 所在目录的文件路径。Skill 执行者从该目录执行以下命令，并把“标准输入”一节定义的 JSON 对象写入命令的标准输入：

```sh
node scripts/validate-output.mjs --prompt-format
```

Prompt 格式校验只使用 `--prompt-format` 参数。

## 标准输入

标准输入必须是包含且只包含 `positions` 和 `display_text` 两个属性的 JSON 对象：

```json
{
  "positions": {
    "quality": ["masterpiece", "best quality"],
    "artist": ["fukahire", "alzi xiaomi"],
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

`positions` 必须是包含至少一个 Prompt 位置的对象。该对象只允许使用以下属性，并按照以下顺序组合 Prompt：

`quality → artist → subject → character → appearance → outfit → action → expression_reaction → camera_composition → environment → detail_mood → lighting → non_artist_style → technical → relation_narrative`

Skill 执行者只创建具有 Prompt 内容的位置。每个位置的值必须是非空字符串数组；每个数组元素必须是首尾无空白、不含控制字符的单行非空字符串。Skill 执行者按照该位置的最终输出顺序排列数组元素。

### 前十四个标签位置

`relation_narrative` 之前的十四个位置都是标签位置。每个标签数组元素必须使用以下一种格式：

```text
payload
(payload)
(payload:weight)
```

`payload` 是进入 Prompt 的标签文本。`weight` 必须符合 `references/prompt-weight-policy.json` 中 `syntax.explicit_weight` 定义的正有限 ASCII 十进制格式。

带圆括号的数组元素必须按照 `references/prompt-weight-policy.json` 中 `syntax.payload` 的规则转义 `payload` 内作为文本使用的反斜杠、圆括号和方括号。每个数组元素最多使用一层权重圆括号。

`quality[]` 中的 `payload` 与 `references/prompt-weight-policy.json` 中 `recommendations.unweighted_quality.content[]` 的任一字符串相同时，该数组元素必须直接使用 `payload`，不添加圆括号或显式权重。

### `relation_narrative`

`relation_narrative[]` 的每个数组元素必须以 ASCII `.`、`!` 或 `?` 结束。使用 `relation_narrative` 时，前十四个标签位置中至少一个位置必须包含数组元素。

### `display_text`

`display_text` 是向用户说明本次 Prompt 内容的中文文本。该属性必须是首尾无空白、不含控制字符的单行非空字符串，并且不进入 `prompt_text`。

## Prompt 组合结果

校验器按照 `positions` 一节列出的顺序读取实际存在的位置，并保留每个数组中的元素顺序。

校验器使用英文逗号和一个空格 `, ` 连接前十四个标签位置的全部数组元素。存在 `relation_narrative` 时，校验器在标签文本后添加 `, `，再使用一个空格连接 `relation_narrative[]` 中的全部句子。

校验器把连接后的单行非空字符串写入成功结果的 `prompt_text`，并逐字符保留各数组元素的原文。

## 成功结果

校验成功时，命令返回退出码 `0`，stderr 为空，stdout 写入一行包含且只包含以下五个属性的 JSON：

```json
{
  "kind": "noobai_assistant_prompt",
  "result": "success",
  "contract_version": "1.0.0",
  "prompt_text": "masterpiece, best quality",
  "display_text": "已生成提示词。"
}
```

Skill 执行者从 stdout JSON 读取 `prompt_text` 和 `display_text`；`prompt_text` 是校验器组合后的 Prompt，`display_text` 是面向用户的中文说明。

## 输入格式失败

标准输入不符合本文件的格式规则时，命令返回退出码 `2`，stdout 为空，stderr 写入一行 JSON：

```json
{
  "violations": [
    {
      "path": "positions.artist[1]",
      "message": "weight 必须是大于 0 的有限 ASCII 十进制数"
    },
    {
      "path": "positions.relation_narrative[0]",
      "message": "必须以 .、! 或 ? 结束"
    }
  ]
}
```

`violations` 必须是非空数组。每个数组元素必须包含非空字符串属性 `path` 和 `message`。`path` 指向不符合格式规则的输入位置；`path` 为 `$` 时，Skill 执行者修正整个标准输入 JSON 的序列化结构。

第一次或第二次调用返回符合上述结构的退出码 `2` 结果时，Skill 执行者使用每个 `violations[].path` 定位不符合格式规则的输入位置，并按照同一数组元素的 `message` 修正标准输入；完成修正后，Skill 执行者重新执行 `SKILL.md` 中“处理冲突、设计权重并自检”一节，再调用相同命令。第三次调用仍返回符合上述结构的退出码 `2` 结果时，Skill 执行者按照数组顺序报告每个 `path` 和 `message`，然后停止本次执行。

## 命令执行错误

命令返回退出码 `1` 时，Skill 执行者报告 stderr 的完整错误内容并停止本次执行。stderr 为空时，Skill 执行者报告“Prompt 格式校验器返回退出码 1，但没有错误信息”，然后停止本次执行。

命令返回 `0`、`1`、`2` 以外的整数退出码时，Skill 执行者报告该退出码和 stderr 的完整内容，然后停止本次执行。

命令没有返回退出码时，Skill 执行者报告命令调用产生的错误信息并停止本次执行。命令调用没有提供错误信息时，Skill 执行者报告“Prompt 格式校验命令没有返回退出码或错误信息”，然后停止本次执行。

## 返回协议错误

以下任一情况表示校验器返回结果不符合本文件规定的协议：

- 命令返回了退出码值，但该值不是整数；
- 退出码 `0` 对应的 stdout、stderr 或成功 JSON 不符合“成功结果”一节；
- 退出码 `2` 对应的 stdout、stderr 或 `violations[]` 不符合“输入格式失败”一节。

Skill 执行者报告不符合协议的具体退出码值、JSON 属性或输出通道及其不符合协议的内容，然后停止本次执行。返回协议错误不进入三次格式校验流程。
