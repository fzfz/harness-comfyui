# Prompt 内容查询 CLI

## CLI 用途与可执行入口

该 CLI 使用 Search 或 Resolve 查询作品、角色、Krea2 画师和 Prompt 标签。Skill 执行者使用以下可执行入口运行本文件中的查询命令：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI"
```

## Character 与 Style 上下文记录定义

本文件把当前消息中 `type=comfyui-context` 且 `data.kind=character` 的 JSON 行称为 Character 上下文记录，把 `type=comfyui-context` 且 `data.kind=style` 的 JSON 行称为 Style 上下文记录。

## 标准输入与通用命令行参数

该 CLI 不读取 stdin。Search 和 Resolve 命令使用下列通用命令行参数：

| 参数 | 必填条件与允许值 |
|---|---|
| `--url` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_URL`，并且必须是没有用户名、密码、端口、路径、查询字符串或片段的完整 HTTP 或 HTTPS URL。 |
| `--port` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_PORT`，并且必须是 `1` 至 `65535` 的十进制整数。 |
| `--path` | 必填；参数值必须是“查询路径、调用条件与结果字段”表中的一条完整路径。 |
| `--timeout-ms` | 可选；参数值必须是 `1` 至 `600000` 的十进制整数。本文命令不传入该参数，因此 CLI 使用默认值 `120000`。 |

每个命令行参数最多出现一次。参数名和参数值必须作为两个独立的命令行参数传入；该 CLI 不接受 `--参数名=参数值` 格式。

## 查询路径、调用条件与结果字段

| 路径 | 调用条件 | Skill 执行者读取的结果字段 |
|---|---|---|
| `/internal/semantic/base-models` | 第一次查询 Krea2 Style 前 | `id`、`name` |
| `/internal/semantic/works` | 需要确认角色所属作品时 | `id`、`name`、`aliases_json`、`category_name`、`character_names` |
| `/internal/semantic/characters` | 需要确认角色或取得角色 Prompt 时 | `id`、`work_id`、`works.name`、`name`、`aliases_json`、`prompt_text` |
| `/internal/semantic/styles` | 需要确认画师或取得 Krea2 画师 Prompt 时 | `id`、`base_model_id`、`name`、`aliases_json`、`style_description`、`prompt_text` |
| `/internal/semantic/prompt-terms` | 需要把一个自然语言视觉概念转换为 Prompt 标签时 | `id`、`canonical_tag`、`aliases_json`、`post_count` |

## 查询对象与停止范围

本文件把每个需要查询的 Base Model、作品、角色、画师或 Prompt 概念称为一个查询对象。Character Search 前执行的 Work Search 以该作品为查询对象；Style Search 或 Style Resolve 前执行的 Base Model Search 以 Krea2 Base Model 为查询对象。“停止当前查询对象”只停止处理该对象；“停止本次语义查询”表示停止本次 Skill 执行中由本文件规定的全部后续 CLI 查询。

## Search 命令

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode search --query '<query>' --page 1 --page_size 20
```

`<operation-path>` 必须取自“查询路径、调用条件与结果字段”表。`<query>` 必须是长度不超过 200 个字符且不含控制字符的字符串。Skill 执行者使用 shell 参数引用规则把 `<query>` 作为一个参数传入命令。

查询角色时，Skill 执行者可以使用已采用 Work 结果的 `id` 限定结果：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/characters --mode search --query '<character-query>' --page 1 --page_size 20 --work_id '<work-id>'
```

查询 Style 时，Skill 执行者必须使用本次 Skill 执行中取得的 Krea2 Base Model ID 限定结果：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/styles --mode search --query '<style-query>' --page 1 --page_size 20 --base_model_id '<krea2-base-model-id>'
```

## Resolve 命令

Character 上下文记录或 Style 上下文记录没有非空 `data.prompt_text`，但提供符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 时，Skill 执行者使用以下命令查询该 ID：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode resolve --id '<stable-id>'
```

Character 上下文记录使用 `/internal/semantic/characters`，Style 上下文记录使用 `/internal/semantic/styles`。Skill 执行者把 `data.id` 作为 `<stable-id>`。

Resolve 成功结果的 `results` 必须只包含一个对象，且该对象的 `id` 转为十进制字符串后必须等于 `<stable-id>`。当 `results` 中的对象数量不等于 1、对象缺少 `id` 或 ID 不相等时，Skill 执行者报告实际结果并停止当前查询对象。

## Work、Character、Style、Base Model 与 Prompt-term 的查询顺序、查询值和结果处理

1. Character 上下文记录和 Style 上下文记录中的非空 `data.prompt_text` 是用户当前选择的直接 Prompt 来源。Skill 执行者先采用这些 `data.prompt_text`，再处理缺少 Prompt 的上下文记录。
2. Character 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用合法 `data.id` 执行 Character Resolve。没有合法 `data.id` 时，Skill 执行者使用非空 `data.character_name` 执行 Character Search；记录同时提供 `data.work_name` 时，先用该名称执行 Work Search，并用已采用 Work 结果的 `id` 限定 Character Search。记录也没有 `data.character_name` 时，Skill 执行者报告缺少角色名称并停止处理该 Character 上下文记录。
3. 当前消息没有与用户指定角色对应的 Character 上下文记录时，Skill 执行者使用用户普通文字中的角色名称执行 Character Search；普通文字同时提供作品名称时，先执行 Work Search，再用已采用 Work 结果的 `id` 限定 Character Search。
4. Skill 执行者第一次查询 Style 前，使用 `krea2` 作为 Base Model Search 的 `<query>`。Skill 执行者采用 `name` 精确等于 `krea2` 的唯一结果，并把该结果的 `id` 作为 Krea2 Base Model ID。
5. Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用合法 `data.id` 执行 Style Resolve。Resolve 结果的 `base_model_id` 等于 Krea2 Base Model ID 且 `prompt_text` 非空时，Skill 执行者采用该结果；`base_model_id` 等于 Krea2 Base Model ID 但 `prompt_text` 为空时，Skill 执行者报告该画师缺少 Krea2 Prompt，并请求用户补充；`base_model_id` 不等于 Krea2 Base Model ID 时，Skill 执行者报告结果中的 `id`、`base_model_id` 和 Krea2 Base Model ID，并停止处理该 Style 上下文记录。没有合法 `data.id` 时，Skill 执行者使用非空 `data.name` 执行 Style Search。记录也没有 `data.name` 时，Skill 执行者报告缺少画师名称并停止处理该 Style 上下文记录。
6. 当前消息没有与用户指定画师对应的 Style 上下文记录时，Skill 执行者使用用户普通文字中的画师名称执行 Style Search。
7. 用户没有指定画师，且当前消息没有 Style 上下文记录时，Skill 执行者根据已经确定的媒介、线条、上色、明暗、纹理和配色形成一个 Style Search 查询文本。
8. 已取得的 Prompt 内容中没有可表达用户要求的某个外貌、服装、动作、表情、构图、场景、光线或氛围概念的标签时，Skill 执行者为该概念单独执行一次 Prompt-term Search。

Work 结果中的 `character_names` 只用于核对或查询用户已经指定的角色。Skill 执行者不查询用户没有指定的角色。

Base Model Search 中没有 `name` 精确等于 `krea2` 的结果时，Skill 执行者报告未找到 Krea2 Base Model，并且不执行本次 Skill 执行中的任何 Style Search 或 Style Resolve。存在多项 `name` 精确等于 `krea2` 的结果时，Skill 执行者报告这些结果的 `id` 和 `name`，并且不执行本次 Skill 执行中的任何 Style Search 或 Style Resolve。

## 参数规则

Search 使用 `--mode search`、`--query`、`--page 1` 和 `--page_size 20`；Search 不使用 `--id`。Resolve 使用 `--mode resolve` 和 `--id`；Resolve 不使用 `--query`、`--page`、`--page_size`、`--work_id` 或 `--base_model_id`。

`--id`、`--work_id` 和 `--base_model_id` 只接受符合 `^[1-9][0-9]{0,19}$` 的十进制字符串。Skill 执行者把查询结果中的数值 `id` 转为十进制字符串后用于后续命令。

## 成功输出结构、候选选择与结果使用

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
- Style：只比较 `base_model_id` 等于 Krea2 Base Model ID 的结果。用户指定画师时，Skill 执行者使用 `name` 和 `aliases_json` 核对画师身份；用户没有指定画师时，Skill 执行者使用 `style_description` 比较已经确定的媒介、线条、上色、明暗、纹理和配色。只有一项符合且 `prompt_text` 非空时，Skill 执行者采用该项；多项仍符合时，Skill 执行者报告各项的 `id`、`name`、`aliases_json` 和 `style_description`，并请求用户选择。Skill 执行者按照“Work、Character、Style、Base Model 与 Prompt-term 的查询顺序、查询值和结果处理”一节的规则处理 Style Resolve 结果。
- Prompt-term：使用 `canonical_tag` 和 `aliases_json` 核对目标概念。只有一项符合时采用该项；多项表达相同含义时，按照 `post_count` 从大到小、`id` 从小到大的顺序采用第一项；多项表达不同含义且无法从用户普通文字确定唯一含义时，报告各项的 `id`、`canonical_tag` 和 `aliases_json`，并请求用户选择。

Skill 执行者把已采用的 Character 上下文记录或 Character 查询结果的 `prompt_text`、Style 上下文记录或 Style 查询结果的 `prompt_text`，以及 Prompt-term 查询结果的 `canonical_tag` 写入最终 `positive_prompt`。Work 结果和 Base Model 结果只用于身份核对与查询限定。

Work 没有可采用结果时，Skill 执行者报告未找到用户所给作品名称，并请求用户补充作品信息。Character 没有可采用结果时，Skill 执行者报告未找到与用户所给角色名称相符且具有非空 `prompt_text` 的候选，并请求用户补充角色信息或角色 Prompt。用户明确指定的 Style 没有可采用结果时，Skill 执行者报告缺少该画师的 Krea2 Prompt，并请求用户补充。自动设计的 Style 没有可采用结果时，Skill 执行者使用已经确定的媒介、线条、上色、明暗、纹理和配色继续构造 Prompt。Prompt-term 没有可采用结果时，Skill 执行者把该视觉概念的英文自然语言描述直接写入 `positive_prompt`，不把该描述当作 `canonical_tag`。

## 命令错误与返回协议错误

| 退出码 | stderr `error.code` 或内容 | Skill 执行者的处理动作 |
|---:|---|---|
| `2` | `INVALID_ARGUMENT` | 无效参数是 Skill 执行者构造的 `--path`、`--mode`、`--query`、`--page`、`--page_size`、`--work_id`、`--base_model_id` 或 `--id` 时，Skill 执行者修正该参数后重试一次；无效参数是 `--url`、`--port` 或 `--timeout-ms` 时，Skill 执行者报告 stderr 并停止本次语义查询。重试仍失败时，Skill 执行者报告 stderr 并停止当前查询对象。 |
| `3` | `DISCOVERY_HTTP_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `4` | `SOURCE_CONNECTION_FAILED` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `5` | `TOTAL_TIMEOUT` | Skill 执行者报告发生超时的查询路径、`mode` 以及本次调用实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数值，并停止当前查询对象。 |
| `6` | `CONTRACT_PROTOCOL_ERROR` 或 `INTERNAL_CLI_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `7` | 数据源服务返回的原始 JSON | Skill 执行者报告完整 stderr，并停止当前查询对象。 |
| `130` 或 `143` | `PROCESS_CANCELLED` | Skill 执行者停止本次 Skill 执行。 |

命令返回非零退出码时，Skill 执行者不采用 stdout 中的内容，并按照上表处理；退出码未列入上表时，Skill 执行者报告退出码和 stderr 内容，并停止本次语义查询。命令返回退出码 `0` 但 stderr 非空时，Skill 执行者报告 stderr 内容并停止当前查询对象。

退出码 `2`、`3`、`4`、`5`、`6`、`130` 和 `143` 的 stderr 只包含一行 `{"error":{"code":"<错误代码>","message":"<错误说明>"}}` JSON。退出码 `7` 的 stderr 是数据源服务非 2xx 响应中的原始 JSON；该 JSON 没有固定字段。

命令返回退出码 `0`，但 stdout 不符合“成功输出结构、候选选择与结果使用”一节规定的输出结构时，Skill 执行者报告违反的结构要求和实际值，并停止当前查询对象。`results[]` 中用于筛选、核对、排序、报告或采用的每个对象缺少“查询路径、调用条件与结果字段”表规定的字段时，Skill 执行者报告缺少的字段名，并停止当前查询对象。

## 调用次数与结果复用

查询对象、查询路径、`mode` 以及实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数共同标识一次查询调用。Skill 执行者为每个查询调用执行一次 CLI；本次 Skill 执行的后续步骤再次需要标识相同的查询调用时，Skill 执行者复用已经采用的成功结果。

退出码 `2` 的参数修正重试按照“命令错误与返回协议错误”一节执行。
