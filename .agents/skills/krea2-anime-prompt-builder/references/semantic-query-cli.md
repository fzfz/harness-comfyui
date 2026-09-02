# Imagegen Semantic Query CLI 参考

## CLI 的用途与适用任务

`imagegen-semantic-query` 只读查询本机 Catalog 服务。Krea2 Anime Prompt Builder 使用该 CLI 完成五项职责：

1. 查询 `krea2` 底模记录并取得用于 Style 查询的稳定 `id`；
2. 确认作品、系列或 IP，并取得作品记录中的 `character_names`；
3. 确认角色身份并取得角色记录中的 `prompt_text`；
4. 查询 Krea2 底模下的画师或画风记录，并取得 `style_description` 和 `prompt_text`；
5. 把外貌、服装、动作、表情、构图、场景、光线或氛围概念查询为规范 `canonical_tag`。

该 CLI 不构建最终 Prompt，不查询 Generation Run，不创建生成任务，不修改 Catalog 记录，也不读取本地图片。

## 调用环境与可执行入口

Skill 执行者必须在提供前台 shell Tool 的本机 Harness 环境中，通过 `PATH` 中的以下入口调用 CLI：

```sh
imagegen-semantic-query --port 18093 --help
```

`18093` 是本 Skill 使用的本机 Catalog 回环端口。CLI 只连接 `127.0.0.1`，不接收远程 URL、主机名、认证信息或代理目标。

调用前，本机 Catalog 服务必须正在 `127.0.0.1:18093` 监听并能够返回 live discovery。Skill 执行者从当前 Session 的 Workspace 工作目录发起前台 shell Tool Call；CLI 不使用当前工作目录推导 Workspace、身份或查询值，也不读取 Skill 目录之外的文件。

第一次语义查询前，Skill 执行者必须执行上述 live discovery，并确认结果包含本文件使用的五条路径。随后在第一次调用每条路径前执行对应的路径级帮助：

```sh
imagegen-semantic-query --port 18093 --path '<operation-path>' --help
```

路径级帮助是当前参数名、参数类型、默认值和约束的运行时来源。帮助与本文件冲突时，Skill 执行者停止该路径的业务查询并报告具体差异，不使用猜测参数调用。

## 命令与调用时机

本 Builder 只调用下表中的 Catalog 路径：

| 路径 | 调用时机 | Builder 读取的结果 |
| --- | --- | --- |
| `/internal/semantic/base-models` | 第一次需要查询 Krea2 Style 前 | 名称等于 `krea2` 的候选 `id` 与 `name` |
| `/internal/semantic/works` | 需要确认作品身份或取得该作品的角色名称时 | `id`、`name`、`aliases_json`、`category_name`、`character_names` |
| `/internal/semantic/characters` | 需要确认角色身份或取得角色 Prompt 时 | `id`、`work_id`、`works.name`、`name`、`aliases_json`、`prompt_text` |
| `/internal/semantic/styles` | 需要确认具体画师，或需要为未指定画师的画面选择 Krea2 Style 时 | `id`、`base_model_id`、`name`、`aliases_json`、`style_description`、`prompt_text` |
| `/internal/semantic/prompt-terms` | 本 Skill 资料不能确定自然语言视觉概念对应的精确标签时 | `id`、`canonical_tag`、`aliases_json`、`category`、`post_count` |

文本查询使用 `search`：

```sh
imagegen-semantic-query --port 18093 --path '<operation-path>' \
  --mode search \
  --query '<query>' \
  --page 1 \
  --page_size 20
```

当前 Character 或 Style 记录缺少非空 `data.prompt_text`，但提供了符合稳定 ID 规则的 `data.id` 时，精确查询使用 `resolve`：

```sh
imagegen-semantic-query --port 18093 --path '<operation-path>' \
  --mode resolve \
  --id '<stable-id>'
```

Skill 执行者按以下顺序调用：

1. 先采用当前消息中非空的 Character/Style `data.prompt_text`，对应对象不再查询。
2. Character 记录缺少 `data.prompt_text` 时，有合法稳定 `data.id` 就 resolve Character 记录；没有合法稳定 ID，但有明确角色名称时才 search Character。
3. 用户只提供作品时，先 search Work；确认作品后，使用选中 Work 的 `id` 限定 Character search，并从 `character_names` 中选择本幅画面需要的角色名称。
4. 任何 Style search 或 resolve 前，先 search Base Model 并确认唯一的 `krea2` 记录。Style 记录有合法稳定 `data.id` 时 resolve 该 Style，并要求结果的 `base_model_id` 等于 Krea2 Base Model ID；没有合法稳定 ID 但有明确画师名称或画师方向时才 search，且必须传入 Krea2 Base Model ID 作为 `--base_model_id`。
5. Prompt-term search 只处理无法从已读取 Skill 资料精确确定的普通视觉概念。

## 参数与标准输入

该 CLI 不读取 stdin。每次调用通过 argv 传入参数；一个调用只查询一条 Catalog 路径。

公共参数：

| 参数 | 取值 |
| --- | --- |
| `--port` | 固定使用 `18093` |
| `--path` | 本文件“命令与调用时机”列出的五条路径之一 |
| `--help` | 无值布尔标志；与 `--port 18093` 单独使用时执行 live discovery，与 `--port 18093 --path '<operation-path>'` 一起使用时输出该路径的实时帮助 |
| `--mode` | `search` 或 `resolve` |
| `--query` | `search` 使用的零至二百字符文本 |
| `--page` | `search` 使用的一至十万之间整数；本 Builder 从 `1` 开始 |
| `--page_size` | `search` 使用的一至一百之间整数；本 Builder 使用 `20` |
| `--id` | `resolve` 使用的一至二十位正十进制稳定 ID |

`/internal/semantic/characters` 的 `search` 可以追加 `--work_id '<work-id>'`；该值必须来自本轮选中 Work 结果的 `id`。`/internal/semantic/styles` 的 `search` 必须追加 `--base_model_id '<krea2-base-model-id>'`；该值必须来自本轮确认的 `krea2` Base Model 结果。

`--help` 不与 `--mode`、`--query`、`--page`、`--page_size`、`--id`、`--work_id` 或 `--base_model_id` 同时使用。`search` 不传 `--id`，`resolve` 不传 `--query`、`--page`、`--page_size`、`--work_id` 或 `--base_model_id`。Shell 调用必须引用包含空格、括号或其他特殊字符的值，使每个值作为一个 argv 传入。

## ID 与运行值的来源

Base Model 查询文本固定为 `krea2`。Skill 执行者只有在候选 `name` 等于 `krea2` 时采用其 `id`；多个候选都满足时，报告候选 ID 并停止 Style 查询。

Work search 的 `--query` 只能来自当前用户普通文字中实际出现的作品名、系列名、IP 名、作品别名或类别限定。第一次没有合适候选时，第二次查询只能重新组合这些原文信息，不能加入查询结果中的 `character_names`。

Character 查询值按以下优先顺序取得：

1. 缺少 `data.prompt_text` 的 Character 记录提供的合法稳定 `data.id`；
2. 当前消息中的 `data.character_name` 与 `data.work_name`；
3. 用户普通文字中的角色名称与所属作品；
4. 已采用 Work 结果的 `character_names` 中符合本幅画面要求的名称。

Style 查询值按以下优先顺序取得：

1. 缺少 `data.prompt_text` 的 Style 记录提供的合法稳定 `data.id`；
2. 当前消息中的 `data.name`；
3. 用户普通文字中的具体画师名称或别名；
4. 用户没有指定画师时，根据已经确定的动漫媒介、线条、上色、明暗、纹理与配色形成的一个具体画师方向。

Prompt-term 的每个 `--query` 只描述一个普通视觉概念。不同人物、作品、画师或互不相同的视觉概念分别调用，不能把它们拼成一个宽泛查询。

只有符合 `^[1-9][0-9]{0,19}$` 的 ID 才能传给 `--id`、`--work_id` 或 `--base_model_id`。输出中的数值 `id` 在后续 argv 中按十进制字符串使用。

## 输出与完成语义

查询成功时，CLI 退出码为 `0`，stderr 为空，stdout 是 Catalog 服务返回的一个 JSON 对象：

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

`results` 为空表示本次查询成功但没有候选，不表示 CLI 失败。Skill 执行者逐项比较候选，不按照数组第一项自动采用：

- Work：使用 `name`、`aliases_json` 和 `category_name` 确认作品；`character_names` 只用于后续 Character 查询。两个候选无法通过这些字段区分时，Skill 执行者报告候选 ID 并请用户选择，不任意采用数组第一项。
- Character：使用 `works.name`、`name` 和 `aliases_json` 确认身份；只有被采用候选的非空 `prompt_text` 进入最终 Prompt。
- Style：候选的 `base_model_id` 必须等于本轮 Krea2 Base Model ID；使用 `name`、`aliases_json` 和 `style_description` 比较画师方向；只有被采用候选的非空 `prompt_text` 进入最终 Prompt。
- Prompt-term：使用 `canonical_tag` 和 `aliases_json` 核对概念；只有被采用候选的 `canonical_tag` 进入最终 Prompt，`aliases_json`、`category` 和 `post_count` 只用于比较。

Work 目标最多执行两次 search。每个 Character 目标最多执行一次 search 或一次 resolve。每个 Style 目标最多执行三次 search，或者执行一次 resolve；后续 Style search 只能改写同一画师或同一画师方向。每个 Prompt-term 目标最多执行一次 search。达到次数上限、返回空 `results` 或没有合适候选时，该目标查询完成。

Work 目标没有可采用候选时，只有当前普通文字、用户选定的历史正向 Prompt、Character `data.prompt_text` 或已采用 Character 结果已经完整定义当前请求要求的全部主体及作品相关内容，Skill 执行者才继续构建；否则必须报告没有找到可采用的 Work 候选，请用户补充作品或角色身份，然后停止。Style 与 Prompt-term 目标没有可采用候选时，可以继续使用用户明确内容、已读取 Skill 资料和默认设计。Character 目标没有可采用候选时，必须回到 `SKILL.md` 的必需主体检查，只有其他合法来源已经完整定义当前请求要求的全部主体时才能继续。

`resolve` 成功时，`results` 必须只包含一个 `id` 与请求 ID 相同的对象。结果数量不是一、结果 ID 不同、`status` 不是 `ok`、`message` 不是 `null` 或必要字段缺失时，Skill 执行者把该响应视为当前目标的协议错误，不采用其中内容。

## 错误、修正与重试

| 退出码 | 含义 | Skill 执行者动作 |
| --- | --- | --- |
| `0` | discovery、帮助或业务查询成功 | 按命令类型读取文本或 JSON；业务查询继续执行候选比较。 |
| `2` | 参数错误或请求 Schema 校验错误 | 根据该路径的 live help 修正参数；同一业务目标最多修正一次。 |
| `3` | discovery HTTP 错误 | 报告 Catalog discovery 错误；服务恢复后才能重新 discovery。 |
| `4` | discovery 或 Catalog 连接错误 | 报告本机回环服务不可连接；连接状态改变后才能重试。 |
| `5` | discovery 与业务查询共享的总超时 | 报告超时的具体路径与查询目标；服务状态改变或用户缩小查询后重试。 |
| `6` | discovery 或响应体不符合 CLI JSON 协议 | 报告协议错误；不采用 stdout 或 stderr 中的业务字段。 |
| `7` | Catalog HTTP 错误 | 读取 stderr 中的原始 JSON 错误并报告；只有用户修正业务值或服务状态改变时重试。 |
| `130`、`143` | 当前调用被取消 | 立即停止本次 Skill 执行。 |

CLI 失败时 stdout 与 stderr 的职责不能互换。退出码 `0` 只从 stdout 读取结果；非零退出码只从 stderr 读取错误。Skill 执行者不得把非零退出码的响应内容作为 Prompt 来源，也不得在调用参数和外部状态都未改变时原样重试。

## 副作用与重复调用

`imagegen-semantic-query`、live discovery、路径级帮助、`search` 和 `resolve` 都是只读操作。它们不创建、修改或删除 Catalog、Generation Run、Prompt、配置或本地文件。

同一查询的后续调用会重新读取当前 Catalog 服务，不复用前一次响应。Skill 执行者按照本文件规定的每目标次数完成查询；一个查询目标失败不要求重复已经完成的其他目标。

## 完整调用示例

查询 Krea2 Base Model，并使用返回的稳定 ID `3` 限定 Style 查询：

```sh
imagegen-semantic-query --port 18093 --path /internal/semantic/base-models \
  --mode search --query 'krea2' --page 1 --page_size 20

imagegen-semantic-query --port 18093 --path /internal/semantic/styles \
  --mode search --query '精致赛璐璐动漫插画，干净线稿，柔和层次阴影' \
  --page 1 --page_size 20 --base_model_id '3'
```

查询作品；用户从无法由名称、别名和分类继续区分的候选中确认稳定 ID `775` 后，使用该 ID 限定角色查询：

```sh
imagegen-semantic-query --port 18093 --path /internal/semantic/works \
  --mode search --query '原神' --page 1 --page_size 20

imagegen-semantic-query --port 18093 --path /internal/semantic/characters \
  --mode search --query '雷电将军' --page 1 --page_size 20 --work_id '775'
```

当前 Character 记录提供稳定 ID `7738` 但缺少 `data.prompt_text` 时精确查询：

```sh
imagegen-semantic-query --port 18093 --path /internal/semantic/characters \
  --mode resolve --id '7738'
```

查询一个普通视觉概念：

```sh
imagegen-semantic-query --port 18093 --path /internal/semantic/prompt-terms \
  --mode search --query '完整全身' --page 1 --page_size 20
```
