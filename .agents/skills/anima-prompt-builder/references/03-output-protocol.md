# ANIMA Prompt 格式校验器

## 用途与调用入口

本文件定义 ANIMA 十二槽 Prompt 的组合格式和校验器调用协议。Skill 执行者完成槽位内容、冲突处理、权重设计和自检后调用校验器。

`scripts/validate-output.mjs` 是相对于当前 `SKILL.md` 所在目录的文件路径。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE`。Skill 执行者设置 `ELECTRON_RUN_AS_NODE=1`，传入 `--expose-internals`，从 Skill 目录执行以下命令，并把“标准输入”一节定义的 JSON 对象写入标准输入：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --quiet --prompt-format
```

Prompt 格式校验使用 `--prompt-format` 选择模式，使用 `--quiet` 省略成功提示。

## 标准输入

标准输入必须是包含且只包含 `slots` 和 `display_text` 两个属性的 JSON 对象：

```json
{
  "slots": {
    "quality": ["masterpiece", "best quality", "score_7", "highres", "safe"],
    "artist_style": ["@say_hana"],
    "count_gender": ["1girl"],
    "character_series": [],
    "appearance": ["long hair"],
    "clothing_state": ["white dress"],
    "pose_action_sex": ["standing"],
    "expression_reaction": ["smile"],
    "camera_shot": ["full body"],
    "scene_environment": ["flower garden"],
    "detail_mood": ["soft lighting"],
    "natural_language": []
  },
  "display_text": "已构建花园人物画面的 ANIMA 提示词。"
}
```

`slots` 必须包含且只包含示例中的十二个属性。每个槽位必须是字符串数组，没有内容时使用空数组。Skill 执行者按照槽位在示例中的顺序组合 Prompt，并保留每个数组中的元素顺序。

`payload` 表示提示词内容，`weight` 表示权重值。前十一个槽位的每个数组元素必须使用 `payload`、`(payload)` 或 `(payload:weight)` 之一，并符合 `references/prompt-weight-policy.json` 的语法。`artist_style` 元素解析后的 payload 必须恰好以一个 `@` 开头。`quality` 必须以 `references/prompt-weight-policy.json` 中 `recommendations.unweighted_quality.content` 的全部元素开头，并保持这些元素的原顺序和未加权形式。

`natural_language` 的每个数组元素必须是英文小写单行句子。`display_text` 必须是面向用户的单行非空中文说明，不进入 `prompt_text`。

## Prompt 组合结果

校验器按照十二个槽位的顺序展开数组，并使用英文逗号和一个空格 `, ` 连接全部元素。连接后的单行非空字符串写入成功结果的 `prompt_text`。

## 成功结果

使用 `--quiet` 校验成功时，命令返回退出码 `0`，stderr 为空，stdout 写入一行包含且只包含以下五个属性的 JSON：

```json
{
  "kind": "noobai_assistant_prompt",
  "result": "success",
  "contract_version": "1.0.0",
  "prompt_text": "masterpiece, best quality, score_7, highres, safe, @say_hana, 1girl, long hair, white dress, standing, smile, full body, flower garden, soft lighting",
  "display_text": "已构建花园人物画面的 ANIMA 提示词。"
}
```

Skill 执行者从 stdout JSON 读取 `prompt_text` 和 `display_text`。

## 输入格式失败

标准输入不符合格式规则时，命令返回退出码 `2`，stdout 为空，stderr 首行写入 JSON：

```json
{
  "violations": [
    {
      "path": "slots.artist_style[0]",
      "message": "artist_style[0] payload must begin with exactly one @"
    }
  ]
}
```

`violations` 必须是非空数组，每个数组元素必须包含非空字符串属性 `path` 和 `message`。第一次调用返回退出码 `2` 时，Skill 执行者使用 `path` 定位不合格输入，按照同一元素的 `message` 修正 `slots` 或 `display_text`，完成冲突处理、权重设计和自检后重试一次。重试返回退出码 `2` 时，Skill 执行者报告全部 `violations` 并停止本次执行。校验器返回退出码 `0` 且返回内容符合“成功结果”一节后，Skill 执行者使用或输出该次 `prompt_text`。

## 命令错误与返回协议错误

命令返回退出码 `1` 时，Skill 执行者报告 stderr 并停止本次执行。命令返回 `0`、`1`、`2` 以外的整数退出码时，Skill 执行者报告退出码和 stderr 并停止本次执行。命令没有返回退出码时，Skill 执行者报告命令调用产生的错误信息并停止本次执行。

退出码 `0` 对应的 stdout、stderr 或成功 JSON 不符合“成功结果”一节，或者退出码 `2` 对应的 stdout、stderr 或 `violations[]` 不符合“输入格式失败”一节时，Skill 执行者报告违反的协议条件并停止本次执行。

## 帮助与操作提示

Skill 执行者运行 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help` 查看输入合同、示例和模式入口。省略 `--quiet` 时，成功结果的 stderr 包含 `NEXT:` 提示。输入格式失败时，stderr 首行 JSON 后附有 `NEXT:` 修正指引。Skill 执行者结合该指引，按照“输入格式失败”一节处理错误。
