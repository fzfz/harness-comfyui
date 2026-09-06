# Prompt 内容查询 CLI

## CLI 用途与可执行入口

该 CLI 使用 Search 或 Resolve 查询作品、角色、WAI 画师和 Prompt 标签。Skill 执行者使用以下可执行入口运行本文件中的查询命令：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI"
```

## 上下文记录

本文件把当前消息中 `type=comfyui-context` 且 `data.kind=character` 的 JSON 行称为 Character 上下文记录，把 `type=comfyui-context` 且 `data.kind=style` 的 JSON 行称为 Style 上下文记录。

## 数据源连接参数与标准输入

该 CLI 不读取 stdin。Search 和 Resolve 命令必须包含下列数据源连接参数：

| 参数 | 必填条件与允许值 |
|---|---|
| `--url` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_URL`，并且必须是没有用户名、密码、端口、路径、查询字符串或片段的完整 HTTP 或 HTTPS URL。 |
| `--port` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_PORT`，并且必须是 `1` 至 `65535` 的十进制整数。 |
| `--path` | 必填；参数值必须是“查询路径与结果字段”表中的一条完整路径。 |
| `--timeout-ms` | 可选；参数值必须是 `1` 至 `600000` 的十进制整数。本文命令不传入该参数，因此 CLI 使用默认值 `120000`。 |

每个命令行参数最多出现一次。参数名和参数值必须作为两个独立的命令行参数传入；该 CLI 不接受 `--参数名=参数值` 格式。

## 查询路径与结果字段

| 路径 | 调用条件 | Skill 执行者读取的结果字段 |
|---|---|---|
| `/internal/semantic/base-models` | 当前 Skill 执行中第一次执行 Style Search 或 Style Resolve 之前 | `id`、`name` |
| `/internal/semantic/works` | 需要确认角色所属作品时 | `id`、`name`、`aliases_json`、`category_name` |
| `/internal/semantic/characters` | 需要确认角色或取得角色 Prompt 时 | `id`、`work_id`、`works.name`、`name`、`aliases_json`、`prompt_text` |
| `/internal/semantic/styles` | 需要确认画师或取得 WAI 画师 Prompt 时 | `id`、`base_model_id`、`name`、`aliases_json`、`style_description`、`prompt_text` |
| `/internal/semantic/prompt-terms` | 需要把一个自然语言视觉概念转换为 Prompt 标签时 | `id`、`canonical_tag`、`aliases_json`、`post_count` |

## 查询目标的定义

用户要求确认的每个作品、角色、画师或 Prompt 概念分别构成一个查询目标。`<query>` 超过本文件规定的 200 个字符限制或查询命令返回错误时，停止当前查询目标只停止处理该作品、角色、画师或 Prompt 概念；“停止本次语义查询”表示停止处理本文件规定的全部查询目标。

## Search 命令

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode search --query '<query>' --page 1 --page_size 20
```

`<operation-path>` 必须取自“查询路径与结果字段”表。`<query>` 必须是长度不超过 200 个字符且不含控制字符的字符串。Skill 执行者在每次 Search 前检查已经构造的完整 `<query>`；长度超过 200 个字符时，Skill 执行者报告实际字符数，请求用户提供不超过 200 个字符的查询文本，并在收到文本前停止当前查询目标。Skill 执行者使用单引号包裹包含空格或 shell 特殊字符的参数值；参数值中的每个单引号写成 `'\''`，使整个值作为一个命令行参数传入。

查询角色时，Skill 执行者可以使用已采用 Work 结果的 `id` 限定结果：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/characters --mode search --query '<character-query>' --page 1 --page_size 20 --work_id '<work-id>'
```

查询 Style 时，Skill 执行者必须使用当前 Skill 执行中通过 Base Model Search 取得的 WAI Base Model ID 限定结果：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/styles --mode search --query '<style-query>' --page 1 --page_size 20 --base_model_id '<wai-base-model-id>'
```

## Resolve 命令

Character 上下文记录或 Style 上下文记录没有非空 `data.prompt_text`，但提供符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 时，Skill 执行者使用以下命令查询该 ID：

```sh
node "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode resolve --id '<stable-id>'
```

Character 上下文记录使用 `/internal/semantic/characters`，Style 上下文记录使用 `/internal/semantic/styles`。Skill 执行者把 `data.id` 作为 `<stable-id>`。

Resolve 成功结果的 `results` 必须只包含一个对象。`results` 的对象数量不等于 1 时，Skill 执行者报告实际对象数量，并停止该上下文记录对应的查询目标。唯一结果对象缺少 `id` 时，Skill 执行者报告缺少 `id`，并停止该上下文记录对应的查询目标。唯一结果对象包含 `id` 时，Skill 执行者把该 `id` 转为十进制字符串后与 `<stable-id>` 比较；两者不相同时，Skill 执行者报告 `<stable-id>` 和转换后的实际 `id`，并停止该上下文记录对应的查询目标。

## 查询顺序与查询值

1. Skill 执行者先采用 Character 上下文记录和 Style 上下文记录中的非空 `data.prompt_text`。已经取得 Prompt 的上下文记录不再查询。
2. Character 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 执行 Character Resolve。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.character_name` 执行 Character Search；存在非空 `data.work_name` 时，Skill 执行者按照角色名称、一个半角空格、作品名称的顺序构造同一个 `<query>`。不存在非空 `data.character_name` 时，Skill 执行者报告缺少角色名称并停止该 Character 查询。
3. 当前消息没有与用户指定角色对应的 Character 上下文记录，且用户同时提供作品名称和角色名称时，Skill 执行者先使用用户原文中的作品名称执行 Work Search。采用一项 Work 结果后，Skill 执行者使用该结果的 `id` 作为 Character Search 的 `<work-id>`，并使用用户原文中的角色名称作为 `<character-query>`。
4. 当前消息没有与用户指定角色对应的 Character 上下文记录，且用户只提供角色名称时，Skill 执行者使用用户原文中的角色名称执行 Character Search。
5. Skill 执行者第一次执行 Style Search 或 Style Resolve 前，使用 `wai` 作为 Base Model Search 的 `<query>`。Skill 执行者采用 `name` 精确等于 `wai` 的唯一结果，并把该结果的 `id` 记作 WAI Base Model ID。执行 Style Search 时，Skill 执行者把该 ID 作为 `<wai-base-model-id>`。
6. Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 执行 Style Resolve。Resolve 结果的 `base_model_id` 等于 WAI Base Model ID，且 `prompt_text` 为非空字符串时，Skill 执行者采用该结果。`base_model_id` 不相等时，Skill 执行者报告 Style 上下文记录的 `data.id`、实际 `base_model_id` 和 WAI Base Model ID，并停止该上下文记录对应的 Style 查询目标。`base_model_id` 相等但 `prompt_text` 为空时，Skill 执行者按照“查询次数与空结果”一节的 Style 空结果规则处理。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.name` 执行 Style Search；不存在非空 `data.name` 时，Skill 执行者报告缺少画师名称并停止该 Style 查询目标。
7. 当前消息没有与用户指定画师对应的 Style 上下文记录时，Skill 执行者使用用户原文中的画师名称执行 Style Search。
8. 用户没有指定画师，且当前消息没有 Style 上下文记录时，Skill 执行者按照 [画师采用规则](artist-adoption.md)“用户未指定画师”一节取得一组画风查询词，按该组查询词的既定顺序使用一个半角空格连接，形成一个 `<query>`，并使用该 `<query>` 执行 Style Search。
9. 已取得的 Prompt 内容中没有可表达用户要求的某个外貌、服装、动作、表情、构图、环境、媒介效果、摄影效果、数字效果、画面情绪、光线或技术表现概念的标签时，Skill 执行者为该概念单独执行一次 Prompt-term Search。

多个精确名称为 `wai` 的 Base Model 结果同时存在时，Skill 执行者报告每项结果的 `id` 和 `name`，并且不执行本次 Skill 执行中的任何 Style Search 或 Style Resolve。没有精确名称为 `wai` 的结果时，Skill 执行者报告未找到 WAI Base Model，并且不执行本次 Skill 执行中的任何 Style Search 或 Style Resolve。

## Search 与 Resolve 的参数规则

Search 使用 `--mode search`、`--query`、`--page 1` 和 `--page_size 20`；Search 不使用 `--id`。Resolve 使用 `--mode resolve` 和 `--id`；Resolve 不使用 `--query`、`--page`、`--page_size`、`--work_id` 或 `--base_model_id`。

`--id`、`--work_id` 和 `--base_model_id` 只接受符合 `^[1-9][0-9]{0,19}$` 的十进制字符串。Skill 执行者把查询结果中的数值 `id` 转为十进制字符串后用于后续命令。

## 成功输出

命令返回退出码 `0` 且 stderr 为空时，命令必须向 stdout 写入一个 JSON 对象：

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

成功结果必须包含且只包含 `status`、`message`、`results`、`page`、`page_size` 和 `total_count`。`status` 必须是 `"ok"`，`message` 必须是 `null`，`results` 必须是数组，且 `results` 中的每一项必须是对象；`total_count` 必须是非负整数。Search 结果的 `page` 和 `page_size` 必须与本次 Search 参数相同。Resolve 结果的 `page` 和 `page_size` 必须分别是 `1` 和 `1`，`total_count` 必须等于 `results` 的对象数量。

### 结果对象字段

| 查询对象 | 字段 | 类型与用途 |
|---|---|---|
| Base Model | `id` | 正整数；用作 Style Search 的 `base_model_id`。 |
| Base Model | `name` | 字符串；用于确认结果是否为 `wai`。 |
| Work | `id` | 正整数；用作 Character Search 的 `work_id`。 |
| Work | `name` | 字符串；作品名称。 |
| Work | `aliases_json` | 字符串数组；作品别名。 |
| Work | `category_name` | 字符串；作品所属类别。 |
| Character | `id` | 正整数；角色记录 ID。 |
| Character | `work_id` | 正整数；用于确认角色所属作品的 ID 与 Character Search 的 `<work-id>` 相同。 |
| Character | `works.name` | 字符串；角色所属作品的名称。 |
| Character | `name` | 字符串；角色名称。 |
| Character | `aliases_json` | 字符串数组；角色别名。 |
| Character | `prompt_text` | 字符串；非空时写入生成 Prompt 的 `character` 槽位。 |
| Style | `id` | 正整数；画师记录 ID。 |
| Style | `base_model_id` | 正整数；画师记录适用的 Base Model ID。 |
| Style | `name` | 字符串；画师名称。 |
| Style | `aliases_json` | 字符串数组；画师别名。 |
| Style | `style_description` | 字符串；画师作品的视觉特点。 |
| Style | `prompt_text` | 字符串；非空时写入生成 Prompt 的 `artist` 槽位。 |
| Prompt-term | `id` | 正整数；Prompt 标签记录 ID。 |
| Prompt-term | `canonical_tag` | 字符串；规范 Prompt 标签。 |
| Prompt-term | `aliases_json` | 字符串数组；该 Prompt 标签表示的自然语言概念。 |
| Prompt-term | `post_count` | 非负整数；使用该 Prompt 标签的样本数量。 |

### Work 结果

Skill 执行者使用每项候选的 `name` 和 `aliases_json` 匹配用户提供的作品名称或作品别名；用户提供作品类别时，Skill 执行者还使用候选的 `category_name` 匹配该作品类别。Skill 执行者把被采用候选的 `id` 用作 Character Search 的 `<work-id>`。符合用户已提供信息的候选超过一项时，Skill 执行者报告每项候选的 `id`、`name`、`aliases_json` 和 `category_name`，请求用户选择后再继续。

### Character 结果

使用 `<work-id>` 查询角色时，Skill 执行者只评估 `work_id` 等于 `<work-id>` 的结果。用户提供作品名称时，Skill 执行者使用候选的 `works.name` 匹配该作品名称。Skill 执行者使用候选的 `name` 和 `aliases_json` 匹配用户提供的角色名称或角色别名，并且只采用 `prompt_text` 为非空字符串的候选。没有符合用户已提供信息且包含非空 `prompt_text` 的候选时，Skill 执行者按照“查询次数与空结果”一节关于 Work 或 Character 查询无可采用结果的规则处理。采用候选后，Skill 执行者把该候选的 `prompt_text` 写入生成 Prompt 的 `character` 槽位。可采用候选超过一项时，Skill 执行者报告每项候选的 `id`、`works.name`、`name` 和 `aliases_json`，请求用户选择后再继续。

### Style 结果

Skill 执行者只评估 `base_model_id` 等于 WAI Base Model ID 的结果。用户指定画师名称时，Skill 执行者使用每项候选的 `name` 和 `aliases_json` 匹配该画师名称；用户未指定画师名称时，Skill 执行者使用每项候选的 `style_description` 筛选视觉特点符合“查询顺序与查询值”第 8 步取得的画风查询词的候选。Skill 执行者只采用 `prompt_text` 为非空字符串的候选，并把被采用候选的 `prompt_text` 写入生成 Prompt 的 `artist` 槽位。没有符合筛选条件且包含非空 `prompt_text` 的候选时，Skill 执行者按照“查询次数与空结果”一节关于 Style 查询无可采用结果的规则继续构造 Prompt。可采用候选超过一项时，Skill 执行者报告每项候选的 `id`、`name`、`aliases_json` 和 `style_description`，请求用户选择后再继续。

### Prompt-term 结果

Skill 执行者使用 `canonical_tag` 和 `aliases_json` 筛选含义符合目标概念的候选。只有一个候选符合时，Skill 执行者按照 [WAI Prompt 位置顺序与职责](wai-prompt-position-order.md) 的“固定顺序和唯一职责”表，把该候选的 `canonical_tag` 写入唯一职责包含该目标概念的位置。多个候选表达相同含义时，Skill 执行者按照 `post_count` 从大到小、`id` 从小到大的顺序采用第一项。多个候选表达不同含义，且仅凭用户要求无法确定唯一含义时，Skill 执行者报告每项候选的 `id`、`canonical_tag` 和 `aliases_json`，请求用户选择后再继续。

## 查询次数与空结果

- 用户要求确认的每个作品分别构成一个 Work 查询目标，每个 Work 查询目标最多执行两次 Search。第一次没有可采用的 Work 结果时，Skill 执行者从用户原文中按出现顺序取出非空的作品名称、作品别名和作品类别，并使用一个半角空格连接，得到第二次 Search 的 `<query>`。该 `<query>` 超过 200 个字符时，Skill 执行者报告实际字符数，停止该 Work 查询目标，不执行第二次 Search。Skill 执行者使用该 `<query>` 执行第二次且最后一次 Search。第二次 Search 仍属于原 Work 查询目标。
- 每个 Character 目标执行一次 Search 或一次 Resolve。
- 每个 Style 目标执行一次 Search 或一次 Resolve。
- 每个 Prompt-term 目标执行一次 Search。

Work 或 Character 查询没有可采用结果时，Skill 执行者检查当前消息和已经采用的查询结果是否已经提供用户明确要求的作品名称、每个角色的名称和每个角色的非空 Prompt。用户明确要求的内容均已提供时，Skill 执行者继续构造 Prompt；缺少任一内容时，Skill 执行者报告具体缺少的作品名称、角色名称或角色 Prompt，请求用户补充后停止本次执行。

Style 查询没有可采用结果时，如果用户在当前消息中直接提供了非空画师 Prompt，Skill 执行者使用该画师 Prompt 继续构造 Prompt；如果用户已经明确指定媒介、线条、上色、明暗、纹理或配色中的至少一项，Skill 执行者使用用户指定的描述继续构造 Prompt。上述画师 Prompt 和视觉特点描述均不存在时，Skill 执行者报告缺少可用的画师 Prompt 和画师视觉特点，请求用户补充后停止本次执行。Prompt-term 查询没有可采用结果时，Skill 执行者把用户描述该概念的文字改写为一个不含逗号的英文小写短语，并按照 [WAI Prompt 位置顺序与职责](wai-prompt-position-order.md) 的“固定顺序和唯一职责”表，把该短语写入唯一职责包含该概念的位置。

## 命令错误与返回协议错误

| 退出码 | stderr `error.code` 或内容 | Skill 执行者的处理动作 |
|---:|---|---|
| `2` | `INVALID_ARGUMENT` | 无效参数是 Skill 执行者构造的 `--path`、`--mode`、`--query`、`--page`、`--page_size`、`--work_id`、`--base_model_id` 或 `--id` 时，Skill 执行者修正该参数后重试一次；无效参数是 `--url`、`--port` 或 `--timeout-ms` 时，Skill 执行者报告 stderr 并停止本次语义查询。首次失败调用不计入“查询次数与空结果”一节规定的 Search 或 Resolve 次数；重试返回退出码 `0` 时，该重试计为原查询目标的一次 Search 或 Resolve；重试仍返回退出码 `2` 时，该重试不计入查询次数，Skill 执行者停止当前查询目标。 |
| `3` | `DISCOVERY_HTTP_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `4` | `SOURCE_CONNECTION_FAILED` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `5` | `TOTAL_TIMEOUT` | Skill 执行者报告发生超时的查询路径，以及本次调用实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数中存在的参数名与参数值，并停止当前查询目标。 |
| `6` | `CONTRACT_PROTOCOL_ERROR` 或 `INTERNAL_CLI_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
| `7` | 数据源服务返回的原始 JSON | Skill 执行者报告完整 stderr，并停止当前查询目标。 |
| `130` 或 `143` | `PROCESS_CANCELLED` | Skill 执行者停止本次 Skill 执行。 |

命令返回非零退出码时，Skill 执行者只使用 stderr 报告错误，不采用 stdout 中的内容。

命令返回上表未列出的退出码时，Skill 执行者报告退出码和 stderr，并停止本次语义查询。

退出码 `2`、`3`、`4`、`5`、`6`、`130` 和 `143` 的 stderr 只包含一行 `{"error":{"code":"<错误代码>","message":"<错误说明>"}}` JSON。退出码 `7` 的 stderr 是数据源服务非 2xx 响应中的原始 JSON；该 JSON 没有固定字段。

命令返回退出码 `0` 但 stderr 非空时，Skill 执行者报告 stderr 内容，并停止当前查询目标。

命令返回退出码 `0`，但 stdout 不符合“成功输出”一节的结构时，Skill 执行者报告违反的结构要求、期望类型或期望值以及实际类型或实际值；问题涉及字段时，同时报告字段名，然后停止当前查询目标。`results[]` 中被采用的对象缺少对应查询路径规定的结果字段时，Skill 执行者报告缺少的字段名，并停止当前查询目标。

## 调用次数与结果复用

查询路径、`mode` 以及实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数共同标识一次查询调用。Skill 执行者保存每次查询调用已经采用的成功结果；本次 Skill 执行的后续步骤再次需要相同查询调用时，Skill 执行者复用该结果，不再次调用 CLI。“查询次数与空结果”一节规定的 Work 第二次 Search 不复用第一次 Search 的结果，并计入该 Work 查询目标最多两次的调用总数。

用户更改要查询的作品、角色、画师或 Prompt 概念，或者更改对应的查询参数时，Skill 执行者按照“查询次数与空结果”一节为更改后的对象开始新的查询目标。退出码 `2` 触发的参数修正仍属于原查询目标的唯一一次自动重试。

用户明确要求重新查询某个已有目标时，Skill 执行者为该目标开始一轮新的查询：Work 查询目标在该轮最多执行两次 Search；Character 和 Style 查询目标在该轮执行一次 Search 或 Resolve；Prompt-term 查询目标在该轮执行一次 Search。重新查询期间不复用该目标此前保存的结果。重新查询成功并采用新结果时，Skill 执行者使用新结果替换此前保存的结果。重新查询失败或没有可采用结果时，Skill 执行者报告本轮结果；用户在获知本轮结果后明确要求采用此前保存的成功结果时，Skill 执行者才重新采用该结果。
