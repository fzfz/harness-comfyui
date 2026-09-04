# Prompt 内容查询 CLI

## 用途与调用入口

Skill 执行者使用 `imagegen-semantic-query` 查询作品、角色、ANIMA 画师和 Prompt 标签。本文件中的命令固定使用端口 `18093`，每次调用只查询一条路径，并通过命令行参数提供查询值。

本文件把当前消息中 `type=comfyui-context` 且 `data.kind=character` 的 JSON 行称为 Character 上下文记录，把 `type=comfyui-context` 且 `data.kind=style` 的 JSON 行称为 Style 上下文记录。

## 查询路径与结果字段

| 路径 | 调用条件 | Skill 执行者读取的结果字段 |
|---|---|---|
| `/internal/semantic/base-models` | 第一次查询 ANIMA Style 前 | `id`、`name` |
| `/internal/semantic/works` | 需要确认角色所属作品时 | `id`、`name`、`aliases_json`、`category_name`、`character_names` |
| `/internal/semantic/characters` | 需要确认角色或取得角色 Prompt 时 | `id`、`work_id`、`works.name`、`name`、`aliases_json`、`prompt_text` |
| `/internal/semantic/styles` | 需要确认画师或取得 ANIMA 画师 Prompt 时 | `id`、`base_model_id`、`name`、`aliases_json`、`style_description`、`prompt_text` |
| `/internal/semantic/prompt-terms` | 需要把一个自然语言视觉概念转换为 Prompt 标签时 | `id`、`canonical_tag`、`aliases_json`、`category`、`post_count` |

## Search 命令

```sh
imagegen-semantic-query --port 18093 --path '<operation-path>' --mode search --query '<query>' --page 1 --page_size 20
```

`<operation-path>` 必须取自“查询路径与结果字段”表。`<query>` 必须是长度不超过 200 个字符且不含控制字符的字符串。Skill 执行者使用 shell 参数引用规则把 `<query>` 作为一个参数传入命令。

查询角色时，Skill 执行者可以使用已采用 Work 结果的 `id` 限定结果：

```sh
imagegen-semantic-query --port 18093 --path /internal/semantic/characters --mode search --query '<character-query>' --page 1 --page_size 20 --work_id '<work-id>'
```

查询 Style 时，Skill 执行者必须使用本轮取得的 ANIMA Base Model ID 限定结果：

```sh
imagegen-semantic-query --port 18093 --path /internal/semantic/styles --mode search --query '<style-query>' --page 1 --page_size 20 --base_model_id '<anima-base-model-id>'
```

## Resolve 命令

Character 上下文记录或 Style 上下文记录没有非空 `data.prompt_text`，但提供符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 时，Skill 执行者使用以下命令查询该 ID：

```sh
imagegen-semantic-query --port 18093 --path '<operation-path>' --mode resolve --id '<stable-id>'
```

Character 上下文记录使用 `/internal/semantic/characters`，Style 上下文记录使用 `/internal/semantic/styles`。Skill 执行者把 `data.id` 作为 `<stable-id>`。

Resolve 成功结果的 `results` 必须只包含一个对象，并且该对象的 `id` 转为十进制字符串后必须等于 `<stable-id>`。结果数量不是一、结果缺少 `id` 或 ID 不相等时，Skill 执行者报告实际结果并停止当前查询目标。

## 查询顺序与查询值

1. Skill 执行者先采用 Character 上下文记录和 Style 上下文记录中的非空 `data.prompt_text`。已经取得 Prompt 的上下文记录不再查询。
2. Character 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用合法 `data.id` 执行 Character Resolve。没有合法 `data.id` 时，Skill 执行者使用非空 `data.character_name` 执行 Character Search；记录同时提供 `data.work_name` 时，先用该名称执行 Work Search，并用已采用 Work 结果的 `id` 限定 Character Search。记录也没有 `data.character_name` 时，Skill 执行者报告缺少角色名称并停止当前 Character 查询目标。
3. 当前消息没有与用户指定角色对应的 Character 上下文记录时，Skill 执行者使用用户普通文字中的角色名称执行 Character Search；普通文字同时提供作品名称时，先执行 Work Search，再用已采用 Work 结果的 `id` 限定 Character Search。
4. Skill 执行者第一次查询 Style 前，使用 `anima` 作为 Base Model Search 的 `<query>`。Skill 执行者采用 `name` 精确等于 `anima` 的唯一结果，并把该结果的 `id` 作为 ANIMA Base Model ID。
5. Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用合法 `data.id` 执行 Style Resolve。Resolve 结果的 `base_model_id` 等于 ANIMA Base Model ID 且 `prompt_text` 非空时，Skill 执行者采用该结果；`base_model_id` 等于 ANIMA Base Model ID 但 `prompt_text` 为空时，Skill 执行者报告该画师缺少 ANIMA Prompt，并请求用户补充；`base_model_id` 不等于 ANIMA Base Model ID 时，Skill 执行者报告结果中的 `id`、`base_model_id` 和 ANIMA Base Model ID，并停止当前 Style 查询目标。没有合法 `data.id` 时，Skill 执行者使用非空 `data.name` 执行 Style Search。记录也没有 `data.name` 时，Skill 执行者报告缺少画师名称并停止当前 Style 查询目标。
6. 当前消息没有与用户指定画师对应的 Style 上下文记录时，Skill 执行者使用用户普通文字中的画师名称执行 Style Search。
7. 用户没有指定画师，且当前消息没有 Style 上下文记录时，Skill 执行者根据已经确定的媒介、线条、上色、明暗、纹理和配色形成一个 Style Search 查询文本。
8. 已取得的 Prompt 内容中没有可表达用户要求的某个外貌、服装、动作、表情、构图、场景或氛围概念的标签时，Skill 执行者为该概念单独执行一次 Prompt-term Search。

Work 结果中的 `character_names` 只用于核对或查询用户已经指定的角色。Skill 执行者不查询用户没有指定的角色。

`name` 精确等于 `anima` 的 Base Model 结果为空时，Skill 执行者报告未找到 ANIMA Base Model，并停止 Style 查询。此类结果超过一项时，Skill 执行者报告每项结果的 `id` 和 `name`，并停止 Style 查询。

## 参数规则

该 CLI 不读取 stdin。每次调用通过命令行参数传入查询值。Search 使用 `--mode search`、`--query`、`--page 1` 和 `--page_size 20`；Search 不使用 `--id`。Resolve 使用 `--mode resolve` 和 `--id`；Resolve 不使用 `--query`、`--page`、`--page_size`、`--work_id` 或 `--base_model_id`。

`--id`、`--work_id` 和 `--base_model_id` 只接受符合 `^[1-9][0-9]{0,19}$` 的十进制字符串。Skill 执行者把查询结果中的数值 `id` 转为十进制字符串后用于后续命令。

## 成功输出

命令返回退出码 `0` 且 stderr 为空时，stdout 写入一个 JSON 对象：

```json
{
  "status": "ok",
  "message": null,
  "results": [],
  "page": 1,
  "page_size": 20,
  "total_count": 0
}
```

成功结果必须包含且只包含 `status`、`message`、`results`、`page`、`page_size` 和 `total_count`。`status` 必须是 `"ok"`，`message` 必须是 `null`，`results` 必须是对象数组，`total_count` 必须是非负整数。Search 结果的 `page` 和 `page_size` 必须与本次 Search 参数相同。Resolve 结果的 `page`、`page_size` 和 `total_count` 必须分别是 `1`、`1` 和 `1`。

`results` 为空表示查询成功但没有候选。Skill 执行者按照以下规则选择候选：

- Work：使用 `name`、`aliases_json` 和 `category_name` 核对用户指定的作品。只有一项符合时采用该项；多项仍符合时报告各项的 `id`、`name`、`aliases_json` 和 `category_name`，并请求用户选择。
- Character：使用 `works.name`、`name` 和 `aliases_json` 核对用户指定的角色；使用 `<work-id>` 查询时，只比较 `work_id` 等于 `<work-id>` 的结果。只有一项身份符合且 `prompt_text` 非空时采用该项；多项仍符合时报告各项的 `id`、`works.name`、`name` 和 `aliases_json`，并请求用户选择。
- Style：只比较 `base_model_id` 等于 ANIMA Base Model ID 的结果。Style Search 由用户指定画师时，使用 `name` 和 `aliases_json` 核对身份；Style Search 没有用户指定的画师时，使用 `style_description` 比较已经确定的媒介、线条、上色、明暗、纹理和配色。只有一项符合且 `prompt_text` 非空时采用该项；多项仍符合时报告各项的 `id`、`name`、`aliases_json` 和 `style_description`，并请求用户选择。Style Resolve 结果按照“查询顺序与查询值”一节的规则处理。
- Prompt-term：使用 `canonical_tag` 和 `aliases_json` 核对目标概念。只有一项符合时采用该项；多项表达相同含义时，按照 `post_count` 从大到小、`id` 从小到大的顺序采用第一项；多项表达不同含义且无法从用户普通文字确定唯一含义时，报告各项的 `id`、`canonical_tag` 和 `aliases_json`，并请求用户选择。

Work 或 Character 没有可采用结果时，Skill 执行者报告缺少的作品身份、角色身份或角色 Prompt，并请求用户补充。用户明确指定的 Style 没有可采用结果时，Skill 执行者报告缺少该画师的 ANIMA Prompt，并请求用户补充。自动设计的 Style 没有可采用结果时，Skill 执行者使用已经确定的媒介、线条、上色、明暗、纹理和配色继续构造 Prompt。Prompt-term 没有可采用结果时，Skill 执行者把该视觉概念的英文自然语言描述放入 `natural_language`，不把该描述当作规范标签。

## 命令错误与返回协议错误

| 退出码 | Skill 执行者的处理动作 |
|---:|---|
| `2` | Skill 执行者修正自己构造的参数后重试一次；重试仍失败时报告 stderr 并停止当前查询目标。 |
| `3` | Skill 执行者报告 CLI 无法取得查询路径，并停止本次语义查询。 |
| `4` | Skill 执行者报告 Catalog 服务连接错误，并停止本次语义查询。 |
| `5` | Skill 执行者报告发生超时的查询路径和查询值，并停止当前查询目标。 |
| `6` | Skill 执行者报告返回内容不是单个有效 JSON，并停止本次语义查询。 |
| `7` | Skill 执行者报告 stderr 中的 Catalog 错误，并停止当前查询目标。 |
| `130` 或 `143` | Skill 执行者停止本次 Skill 执行。 |

命令返回非零退出码时，Skill 执行者只使用 stderr 报告错误，不采用 stdout 中的内容；退出码未列入上表时，Skill 执行者报告退出码和 stderr，并停止本次语义查询。命令返回退出码 `0` 但 stderr 非空时，Skill 执行者报告 stderr 内容并停止当前查询目标。

命令返回退出码 `0`，但 stdout 不符合“成功输出”一节的结构时，Skill 执行者报告违反的结构要求和实际值，并停止当前查询目标。`results[]` 中用于筛选、核对、排序、报告或采用的每个对象缺少“查询路径与结果字段”表规定的字段时，Skill 执行者报告缺少的字段名，并停止当前查询目标。

## 调用次数与结果复用

当两次调用的查询路径、`mode` 以及实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数完全相同时，这两次调用属于同一个查询目标。Skill 执行者按照“查询顺序与查询值”一节为每个查询目标调用一次 CLI。

Skill 执行者采用某个成功结果后，在本次 Skill 执行的后续步骤中复用该结果，不用相同参数再次查询。

用户更改查询对象或上述查询参数时，Skill 执行者为新的查询目标调用一次 CLI。退出码 `2` 的参数修正重试按照“命令错误与返回协议错误”一节执行。
