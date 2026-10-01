# Prompt 内容查询 CLI

## CLI 用途与可执行入口

该 CLI 使用 Search 或 Resolve 查询作品、角色、ANIMA 画师和 Prompt 标签。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和查询脚本路径 `DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI`；Skill 执行者使用以下入口运行本文件中的查询命令：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI"
```

## 上下文记录的定义

本文件把当前消息中 `type=comfyui-context` 且 `data.kind=character` 的 JSON 行称为 Character 上下文记录，把 `type=comfyui-context` 且 `data.kind=style` 的 JSON 行称为 Style 上下文记录。

## 标准输入与通用命令行参数

Skill 执行者通过命令行参数向 CLI 传入查询输入。Search 和 Resolve 命令使用下列通用命令行参数：

| 参数 | 必填条件与允许值 |
|---|---|
| `--url` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_URL`，并且必须是没有用户名、密码、端口、路径、查询字符串或片段的完整 HTTP 或 HTTPS URL。 |
| `--port` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_PORT`，并且必须是 `1` 至 `65535` 的十进制整数。 |
| `--path` | 必填；参数值必须是“查询路径与结果字段”表中的一条完整路径。 |
| `--timeout-ms` | 可选；参数值必须是 `1` 至 `600000` 的十进制整数。本文命令不传入该参数，因此 CLI 使用默认值 `120000`。 |

每个命令行参数最多出现一次。参数名和参数值必须作为两个独立的命令行参数传入。

## 查询路径与结果字段

| 路径 | 调用条件 | Skill 执行者读取的结果字段 |
|---|---|---|
| `/internal/semantic/base-models` | 第一次查询 ANIMA Style 前 | `id`、`name` |
| `/internal/semantic/works` | 需要确认角色所属作品时 | `id`、`name`、`aliases_json`、`category_name`、`character_names` |
| `/internal/semantic/characters` | 需要确认角色或取得角色 Prompt 时 | `id`、`work_id`、`works.name`、`name`、`aliases_json`、`prompt_text` |
| `/internal/semantic/styles` | 需要确认画师或取得 ANIMA 画师 Prompt 时 | `id`、`base_model_id`、`name`、`aliases_json`、`style_description`、`prompt_text` |
| `/internal/semantic/prompt-terms` | 需要把一个自然语言视觉概念转换为 Prompt 标签时 | `id`、`canonical_tag`、`aliases_json`、`post_count` |

## 查询对象与停止范围

本文件把每个需要查询的 Base Model、作品、角色、画师或 Prompt 概念称为一个查询对象。Character Search 前执行的 Work Search 以该作品为查询对象；Style Search 或 Style Resolve 前执行的 Base Model Search 以 ANIMA Base Model 为查询对象。“停止当前查询对象”只停止处理该对象；“停止本次语义查询”表示停止本次 Skill 执行中由本文件规定的全部后续 CLI 查询。

## Search 命令

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode search --query '<query>' --page 1 --page_size 20
```

`<query>` 必须是长度不超过 200 个字符且不含控制字符的字符串。Skill 执行者必须把完整的 `<query>` 作为一个命令行参数传入；当查询文本包含空格或 shell 元字符时，Skill 执行者必须使用 shell 引号或等效的参数数组传递方式，避免 shell 拆分或解释查询文本。

查询角色时，Skill 执行者可以使用已采用 Work 结果的 `id` 限定结果：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/characters --mode search --query '<character-query>' --page 1 --page_size 20 --work_id '<work-id>'
```

查询 Style 时，Skill 执行者必须使用本次 Skill 执行中取得的 ANIMA Base Model ID 限定结果：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/styles --mode search --query '<style-query>' --page 1 --page_size 20 --base_model_id '<anima-base-model-id>'
```

## Resolve 命令

Character 上下文记录或 Style 上下文记录没有非空 `data.prompt_text`，但提供符合“Search 与 Resolve 的参数组合规则”一节格式要求的 `data.id` 时，Skill 执行者使用以下命令查询该 ID：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode resolve --id '<stable-id>'
```

Character 上下文记录使用 `/internal/semantic/characters`，Style 上下文记录使用 `/internal/semantic/styles`。Skill 执行者把 `data.id` 作为 `<stable-id>`。

Resolve 成功结果的 `results` 必须只包含一个对象，并且该对象的 `id` 转为十进制字符串后必须等于 `<stable-id>`。`results` 包含的对象数量不等于 `1`、唯一对象缺少 `id` 或该对象的 ID 不等于 `<stable-id>` 时，Skill 执行者报告实际结果并停止当前查询对象。

## 查询顺序与查询值

1. Skill 执行者先采用 Character 上下文记录和 Style 上下文记录中的非空 `data.prompt_text`。Skill 执行者结束已经取得 Prompt 的记录的查询处理。
2. Character 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用合法 `data.id` 执行 Character Resolve。没有合法 `data.id` 时，Skill 执行者使用非空 `data.character_name` 执行 Character Search；记录同时提供 `data.work_name` 时，先用该名称执行 Work Search，并用已采用 Work 结果的 `id` 限定 Character Search。记录也没有 `data.character_name` 时，Skill 执行者报告缺少角色名称并停止处理该 Character 上下文记录。
3. 当前消息没有与用户指定角色对应的 Character 上下文记录时，Skill 执行者使用当前消息中除 `type=comfyui-context` JSON 行以外的文字所指定的角色名称执行 Character Search；该部分文字同时提供作品名称时，先执行 Work Search，再用已采用 Work 结果的 `id` 限定 Character Search。
4. Skill 执行者第一次查询 Style 前，使用 `anima` 作为 Base Model Search 的 `<query>`。Skill 执行者采用 `name` 精确等于 `anima` 的唯一结果，并把该结果的 `id` 作为 ANIMA Base Model ID。
5. Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用合法 `data.id` 执行 Style Resolve。Resolve 结果的 `base_model_id` 等于 ANIMA Base Model ID 且 `prompt_text` 非空时，Skill 执行者采用该结果；`base_model_id` 等于 ANIMA Base Model ID 但 `prompt_text` 为空时，Skill 执行者报告该画师缺少 ANIMA Prompt，并请求用户补充；`base_model_id` 不等于 ANIMA Base Model ID 时，Skill 执行者报告结果中的 `id`、`base_model_id` 和 ANIMA Base Model ID，并停止处理该 Style 上下文记录。没有合法 `data.id` 时，Skill 执行者使用非空 `data.name` 执行 Style Search。记录也没有 `data.name` 时，Skill 执行者报告缺少画师名称并停止处理该 Style 上下文记录。
6. 当前消息没有与用户指定画师对应的 Style 上下文记录时，Skill 执行者使用当前消息中除 `type=comfyui-context` JSON 行以外的文字所指定的画师名称执行 Style Search。
7. 用户没有指定画师，且当前消息没有 Style 上下文记录时，Skill 执行者根据已经确定的媒介、线条、上色、明暗、纹理和配色形成一个 Style Search 查询文本。
8. 已取得的 Prompt 内容中没有可表达用户要求的某个外貌、服装、动作、表情、构图、场景或氛围概念的标签时，Skill 执行者为该概念单独执行一次 Prompt-term Search。

Work 结果中的 `character_names` 只用于核对或查询用户已经指定的角色。

`name` 精确等于 `anima` 的 Base Model 结果为空时，Skill 执行者报告未找到 ANIMA Base Model；此类结果超过一项时，Skill 执行者报告每项结果的 `id` 和 `name`。发生以上任一情况时，Skill 执行者停止本次 Skill 执行中的全部后续 Style Search 和 Style Resolve。

## Search 与 Resolve 的参数组合规则

除通用参数和 `--quiet` 外，Search 命令的参数限定为 `--mode search`、`--query`、`--page 1`、`--page_size 20`，以及适用的 `--work_id` 或 `--base_model_id`；Resolve 命令的参数限定为 `--mode resolve` 和 `--id`。

`--id`、`--work_id` 和 `--base_model_id` 只接受符合 `^[1-9][0-9]{0,19}$` 的十进制字符串。Skill 执行者把查询结果中的数值 `id` 转为十进制字符串后用于后续命令。

## 成功输出的结构校验与候选选择规则

使用 `--quiet` 的命令返回退出码 `0` 且 stderr 为空时，stdout 必须只包含一个 JSON 对象：

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
- Prompt-term：使用 `canonical_tag` 和 `aliases_json` 核对目标概念。只有一项符合时采用该项；多项表达相同含义时，按照 `post_count` 从大到小、`id` 从小到大的顺序采用第一项；多项表达不同含义且无法从当前消息中除 `type=comfyui-context` JSON 行以外的文字确定唯一含义时，报告各项的 `id`、`canonical_tag` 和 `aliases_json`，并请求用户选择。

Work 或 Character 没有可采用结果时，Skill 执行者报告缺少的作品身份、角色身份或角色 Prompt，并请求用户补充。用户明确指定的 Style 没有可采用结果时，Skill 执行者报告缺少该画师的 ANIMA Prompt，并请求用户补充。自动设计的 Style 没有可采用结果时，Skill 执行者使用已经确定的媒介、线条、上色、明暗、纹理和配色继续构造 Prompt。Prompt-term 没有可采用结果时，Skill 执行者把该视觉概念的英文自然语言描述写入生成 Prompt 的 `slots.natural_language` 数组。

## 命令错误与返回协议错误的处理规则

| 退出码 | stderr `error.code` 或内容 | Skill 执行者的处理动作 |
|---:|---|---|
| `2` | `INVALID_ARGUMENT` | 无效参数是 Skill 执行者构造的 `--path`、`--mode`、`--query`、`--page`、`--page_size`、`--work_id`、`--base_model_id` 或 `--id` 时，Skill 执行者修正该参数后重试一次；无效参数是 `--url`、`--port` 或 `--timeout-ms` 时，Skill 执行者报告 stderr 并停止本次语义查询。重试仍失败时，Skill 执行者报告 stderr 并停止当前查询对象。 |
| `3` | `DISCOVERY_HTTP_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `4` | `SOURCE_CONNECTION_FAILED` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `5` | `TOTAL_TIMEOUT` | Skill 执行者报告发生超时的查询路径，以及本次调用实际传入的 `query`、`id`、`work_id` 或 `base_model_id` 参数值，并停止当前查询对象。 |
| `6` | `CONTRACT_PROTOCOL_ERROR` 或 `INTERNAL_CLI_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `7` | 数据源服务返回的原始 JSON | Skill 执行者报告完整 stderr，并停止当前查询对象。 |
| `130` 或 `143` | `PROCESS_CANCELLED` | Skill 执行者停止本次 Skill 执行。 |

命令返回非零退出码时，Skill 执行者仅依据 stderr 和退出码处理本次调用；退出码未列入上表时，Skill 执行者报告退出码和 stderr，并停止本次语义查询。使用 `--quiet` 的命令返回退出码 `0` 但 stderr 非空时，Skill 执行者报告 stderr 内容并停止当前查询对象。

退出码 `2`、`3`、`4`、`5`、`6`、`130` 和 `143` 的 stderr 首行包含 `{"error":{"code":"<错误代码>","message":"<错误说明>"}}` JSON。退出码 `7` 的 stderr 先保留数据源服务非 2xx 响应中的原始 JSON；该 JSON 没有固定字段。所有失败输出在原始错误正文之后追加换行和 `NEXT:` 修正提示，`--quiet` 仅省略成功提示。Skill 执行者按最后一个换行加 `NEXT:` 分隔错误正文与指引，并解析前者。

命令返回退出码 `0`，但 stdout 不符合“成功输出的结构校验与候选选择规则”一节的结构时，Skill 执行者报告违反的结构要求和实际值，并停止当前查询对象。`results[]` 中用于筛选、核对、排序、报告或采用的每个对象缺少“查询路径与结果字段”表规定的字段时，Skill 执行者报告缺少的字段名，并停止当前查询对象。

## 调用次数与结果复用

查询对象、查询路径、`mode` 以及实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数共同标识一次查询调用。Skill 执行者为每个查询调用执行一次 CLI；本次 Skill 执行的后续步骤再次需要标识相同的查询调用时，Skill 执行者复用已经采用的成功结果。退出码 `2` 的参数修正重试按照“命令错误与返回协议错误的处理规则”一节执行。

## 渐进式帮助与错误指引

Skill 执行者运行 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --help` 查看离线总览，再按照“下一步”查询实时操作列表和指定路径帮助。省略 `--quiet` 的成功查询在 stderr 输出 `NEXT:` 后续操作。帮助调用成功时，Skill 执行者从 stdout 读取帮助文本。
