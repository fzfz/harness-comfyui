# 语义查询接口与调用流程

## 用途和读取时机

本文件统一定义四个 Pi 语义查询接口的用途、公共输入、成功结果、错误结果、各接口字段用途、调用顺序、继续查询条件、停止查询条件和结果采用方式。

本文件使用的 `user_text` 和 UI Character、UI Style 选择项由 [当前轮输入合同](input-contract.md)定义。

Skill Agent 完成构图选择、画面设计和 WAI Prompt 位置映射后，如果本轮需要调用 `query_semantic_works`、`query_semantic_characters`、`query_semantic_styles` 或 `query_semantic_prompt_terms` 中的任一接口，必须在第一次调用前完整读取本文件。读取完成后，Skill Agent 按照本文件取得尚未完成的角色、画师和普通视觉概念 Prompt 内容。

## 公共输入、成功结果和错误结果

| 对象 | 字段 | 用途 |
|---|---|---|
| 四个 Pi 语义工具的输入 | `queries` | 保存本次调用的一至三个具体查询；每项查询对应一个独立业务对象或一个紧密相关的普通视觉概念。 |
| 成功结果 | `groups` | 按照 `queries` 的顺序保存查询组。 |
| `groups[]` | `query` | 保存该组对应的规范化查询文本。 |
| `groups[]` | `items` | 保存该查询的候选结果；空数组表示本次查询没有候选。 |
| 错误结果 | `tool` | 标明返回错误的 Pi 语义工具。 |
| 错误结果 | `code` | 标明本次工具调用的错误类型；错误影响的查询目标由本文件的继续查询和停止查询规则确定。 |
| 错误结果 | `message` | 提供本次错误的具体说明。 |

## `query_semantic_works`

用途：确认用户提供的作品，并取得该作品下全部可用角色的规范名称。

`query_semantic_works.queries[]` 的每一项只能由当前 `user_text` 中实际出现的作品名、系列名、IP 名、作品别名或类别限定组成。多个作品分别占用独立数组项。UI 已选 Character、UI 已选 Style、作品候选的 `aliases`、`category_name`、`character_names` 和 Skill Agent 自主补充的内容都不能作为 Work 查询文本来源。候选的 `name`、`aliases` 和 `category_name` 能够确认用户所指作品时，Skill Agent 采用该候选的 `name` 和 `character_names`，并结束该作品查询目标。第一次 Work 查询返回空结果或候选不合适时，第二次 Work 查询只能重新组合当前 `user_text` 中上述作品身份文本；第二次查询结束后停止该作品查询目标。`query_semantic_works` 返回结构化错误时，本次调用中 `queries[]` 包含的全部作品查询目标立即结束。

| 字段 | 用途 |
|---|---|
| `name` | 作品的规范名称，用于确认候选作品。 |
| `aliases` | 作品的其他名称，用于核对用户称呼。 |
| `category_name` | 作品所属分类，用于区分名称或题材接近的作品。 |
| `character_names` | 该作品下全部可用角色的规范名称；Skill Agent 从中选择画面需要的角色名称并调用 `query_semantic_characters`。 |

## `query_semantic_characters`

用途：查询用户提供的角色，或者查询从 Work `character_names` 中选出的角色，并取得角色 Prompt。

| 字段 | 用途 |
|---|---|
| `work_name` | 角色所属作品的规范名称，用于区分不同作品中的同名或近名角色。 |
| `name` | 角色的规范名称，用于确认候选角色。 |
| `aliases` | 角色的其他名称，用于核对用户称呼。 |
| `prompt_text` | 被采用角色的完整角色 Prompt 来源字符串；Skill Agent 按照 `character` 位置规则采用该字符串，不修改查询结果中的字段值。 |

一个具体角色构成一个 Character 查询目标，并对应 `query_semantic_characters.queries[]` 中的一个数组元素。每个 Character 查询目标调用一次。Skill Agent 采用具有合法 `prompt_text` 的合适候选；空结果或没有合适候选时，该目标结束。`query_semantic_characters` 返回结构化错误时，本次调用中 `queries[]` 包含的全部角色查询目标立即结束。

## `query_semantic_styles`

用途：查询 Style 表中的画师记录，并取得画师 Prompt。用户没有指定具体画师时，该接口根据已经设计的目标画面风格查询一名或多名画师。

| 字段 | 用途 |
|---|---|
| `name` | 画师的规范名称，用于确认候选画师。 |
| `aliases` | 画师的其他名称，用于核对用户称呼。 |
| `style_description` | 对该画师画风的具体描述，用于理解和比较候选画师与目标画面风格；该字段不是提示词。 |
| `prompt_text` | 被采用画师的画师 Prompt，准确用于 `artist` 位置。 |

一个具体画师或一个独立画师方向构成一个 Style 查询目标，并对应 `query_semantic_styles.queries[]` 中的一个数组元素。Style 查询目标每次进入 `queries[]` 时增加一次调用次数；每个 Style 查询目标最多调用三次。

- `groups[].items` 包含经 [画师采用规则](artist-adoption.md)确认且具有合法 `prompt_text` 的候选时，Skill Agent 采用候选并结束该目标。
- `groups[].items` 是空数组或没有能够采用的候选时，Skill Agent 把该目标标记为未完成。
- 未完成目标仍有剩余调用次数时，Skill Agent 可以修改同一具体画师或同一画师方向的查询并再次调用；没有剩余调用次数时，该目标结束。
- 后续调用不得创建新的画师目标，也不得把失败的画师目标改为 Prompt-term 查询或普通画风。
- `query_semantic_styles` 返回结构化错误时，本次调用中 `queries[]` 包含的全部 Style 查询目标立即结束，不再重试。未包含在本次调用中的其他 Style 查询目标继续按照各自调用次数处理。

一次调用同时包含多个 Style 查询目标并返回成功结果时，Skill Agent 按照上述规则分别处理每个 `groups[]`。

## `query_semantic_prompt_terms`

用途：查询外貌、服装、动作、表情、构图、环境、媒介效果、摄影效果、数字效果、普通画风、氛围、光线和技术表现等普通视觉概念的规范 Prompt 标签。

| 字段 | 用途 |
|---|---|
| `canonical_tag` | 被采用普通视觉概念的规范 Prompt 标签，用于该概念所属的 WAI Prompt 位置。 |
| `aliases` | 该规范标签的其他自然语言表达，用于理解和核对候选含义。 |

一个普通视觉概念构成一个 Prompt-term 查询目标，并对应 `query_semantic_prompt_terms.queries[]` 中的一个数组元素。每个 Prompt-term 查询目标调用一次。Skill Agent 采用符合当前概念的 `canonical_tag`；空结果或没有合适候选时，该目标结束。`query_semantic_prompt_terms` 返回结构化错误时，本次调用中 `queries[]` 包含的全部普通视觉概念查询目标立即结束。

## 调用与采用流程

1. 先按照采用优先级处理 UI 已选内容：UI 已选 Character 的 `prompt_text` 用于 `character` 位置，UI 已选 Style 的 `prompt_text` 用于 `artist` 位置。随后查询仍然缺少的作品、角色、画师或普通视觉概念。
2. 用户只提供作品时，调用 `query_semantic_works`；确定画面需要的角色后，调用 `query_semantic_characters`。
3. 用户直接提供角色而 UI 已选内容没有提供该角色 Prompt 时，调用 `query_semantic_characters`。
4. 用户要求一名或多名具体画师而 UI 已选内容没有提供对应画师 Prompt 时，分别调用 `query_semantic_styles`。
5. 用户没有指定具体画师时，按照[画师采用规则](artist-adoption.md#用户没有指定具体画师)确定一个或多个 Style 查询目标，并为每个目标分别调用 `query_semantic_styles`。
6. 画面需要普通视觉概念的规范标签时，调用 `query_semantic_prompt_terms`。

## 查询结束后的内容处理

- Work 查询取得 `character_names` 后，Skill Agent 使用画面需要的角色名称调用 Character 接口；角色 Prompt 由 Character 结果提供。
- Character 查询结束后仍未取得角色 Prompt 时，Skill Agent 使用用户已经明确提供的角色外观或身份内容完成画面，但不把这些内容视为 Character 结果。
- Style 查询结束后，`artist` 位置使用 UI 已选 Style 或被采用 Style 结果提供的画师 Prompt。
- Prompt-term 查询结束后仍然缺少普通视觉内容时，读取对应位置的 [位置示例](prompt-position-examples/)，按照该位置规则设计英文 Prompt。

## 多画师采用与组装

准备采用一名或多名画师时，Skill Agent 读取 [画师采用规则](artist-adoption.md)。生成 `artist` 位置前，Skill Agent 读取 [WAI 画师语法](wai-artist-syntax.md)。
