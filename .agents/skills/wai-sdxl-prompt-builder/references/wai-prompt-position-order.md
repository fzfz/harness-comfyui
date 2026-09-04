# WAI Prompt 位置顺序与职责

## 用途和读取时机

本文件是十五个 WAI Prompt 位置、固定顺序、唯一职责和位置选择方法的唯一来源。

Skill 执行者完成画面设计后，必须先完整读取本文件，再把画面内容映射到对应位置。Skill 执行者确定本轮位置集合后，只读取这些位置在[位置规则目录](prompt-position-rules/)中的规则。

## 固定顺序和唯一职责

| 顺序 | 位置 | 唯一职责 | 位置规则 |
|---:|---|---|---|
| 1 | `quality` | WAI 质量标签和用户明确要求的质量内容 | [quality](prompt-position-rules/quality.md) |
| 2 | `artist` | 已采用 Style Prompt 内容中的具体画师提示词 | [artist](prompt-position-rules/artist.md) |
| 3 | `subject` | 主体数量、性别组合、主体类别和特殊身份类型 | [subject](prompt-position-rules/subject.md) |
| 4 | `character` | 已采用 Character Prompt 内容中经过冲突处理后保留的角色 Prompt | [character](prompt-position-rules/character.md) |
| 5 | `appearance` | 头发、眼睛、脸部、体型、肤色、身体标记、非人特征，以及当前画面中可见的头发、皮肤和身体标记状态 | [appearance](prompt-position-rules/appearance.md) |
| 6 | `outfit` | 服装、服装材质、服装颜色、穿着状态、配饰和随身物件 | [outfit](prompt-position-rules/outfit.md) |
| 7 | `action` | 每名主体的姿态、动作、动作方向和身体朝向 | [action](prompt-position-rules/action.md) |
| 8 | `expression_reaction` | 每名主体的表情、视线和身体反应 | [expression_reaction](prompt-position-rules/expression-reaction.md) |
| 9 | `camera_composition` | 景别、相机角度、POV、画面布局、前中后景、裁剪、焦点、景深和遮挡 | [camera_composition](prompt-position-rules/camera-composition.md) |
| 10 | `environment` | 地点、空间结构、时间、季节、天气和环境对象 | [environment](prompt-position-rules/environment.md) |
| 11 | `detail_mood` | 表面纹理、摄影后期效果、整体调色、数字效果、运动表现和整体画面情绪 | [detail_mood](prompt-position-rules/detail-mood.md) |
| 12 | `lighting` | 光源、光源颜色、色温、光照染色、阴影、亮度和对比度 | [lighting](prompt-position-rules/lighting.md) |
| 13 | `non_artist_style` | 非画师画风和创作媒介类别 | [non_artist_style](prompt-position-rules/non-artist-style.md) |
| 14 | `technical` | 用户明确要求的输出形态或生产用途 | [technical](prompt-position-rules/technical.md) |
| 15 | `relation_narrative` | 主体关系或分组、动作归属、物件或接触关系归属、空间关系、画格关系和剧情内容归属的英文短句 | [relation_narrative](prompt-position-rules/relation-narrative.md) |

## Character 和 Style Prompt 来源

Skill 执行者按照 [SKILL.md 第 1 节](../SKILL.md#1-读取本轮输入)规定的来源优先级，为每名角色采用以下一种 Character Prompt 来源：

1. 第一优先级：Skill 执行者选择当前用户消息作为来源，并采用该消息中直接提供且要求整体采用的完整角色 Prompt 作为 Character Prompt 内容。
2. 第二优先级：Skill 执行者选择 `data.prompt_text` 非空的 Character 上下文记录作为来源，并采用该记录的 `data.prompt_text` 作为 Character Prompt 内容。
3. 第三优先级：Skill 执行者选择用户指定复用的历史 Generation Run 输入作为来源，并采用该输入中的完整角色 Prompt 作为 Character Prompt 内容。
4. 第四优先级：Skill 执行者选择按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得的 Character 查询结果作为来源，并采用该结果的 `prompt_text` 作为 Character Prompt 内容。

前三种来源均未提供当前角色的完整角色 Prompt 时，Skill 执行者才查询该角色。本节把 Skill 执行者为角色选定的用户消息、Character 上下文记录、历史 Generation Run 输入或 Character 查询结果称为“已采用 Character Prompt 来源”，把从该来源取得的完整角色 Prompt 文本称为“已采用 Character Prompt 内容”。

Skill 执行者按照 [SKILL.md 第 1 节](../SKILL.md#1-读取本轮输入)规定的来源优先级，为每名画师采用以下一种 Style Prompt 来源：

1. 第一优先级：Skill 执行者选择当前用户消息作为来源，并采用该消息中直接提供且要求采用的画师 Prompt 作为 Style Prompt 内容。
2. 第二优先级：Skill 执行者选择 `data.prompt_text` 非空的 Style 上下文记录作为来源，并采用该记录的 `data.prompt_text` 作为 Style Prompt 内容。
3. 第三优先级：Skill 执行者选择用户指定复用的历史 Generation Run 输入作为来源，并采用该输入中的画师 Prompt 作为 Style Prompt 内容。
4. 第四优先级：Skill 执行者选择按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得的 Style 查询结果作为来源，并采用该结果的 `prompt_text` 作为 Style Prompt 内容。

前三种来源均未提供当前画师的 Prompt 时，Skill 执行者才查询该画师。本节把 Skill 执行者为画师选定的用户消息、Style 上下文记录、历史 Generation Run 输入或 Style 查询结果称为“已采用 Style Prompt 来源”，把从该来源取得的画师 Prompt 文本称为“已采用 Style Prompt 内容”。

## Character 来源内容

`character` 使用每项已采用 Character Prompt 内容作为基础。用户没有新增、替换或排除其中的固有外貌或服装时，Skill 执行者把该 Prompt 内容原样写入 `character`。

用户要求新增其中没有包含的固有外貌或服装时，Skill 执行者保持写入 `character` 的内容不变，并把新增内容写入 `appearance` 或 `outfit`。用户要求替换其中的固有外貌或服装时，Skill 执行者只从写入 `character` 的内容中删除与替换内容直接冲突的标签，并把替换内容写入 `appearance` 或 `outfit`。用户要求排除其中的固有外貌或服装时，Skill 执行者只从写入 `character` 的内容中删除被排除的标签，不把排除内容写入任何位置。经过上述处理后写入 `character` 的内容称为“本轮 Character Prompt”。Skill 执行者不修改输入来源中保存的 Prompt 文本。

不存在已采用 Character Prompt 内容时，本轮不创建 `character`。Skill 执行者把已保留的外貌内容写入 `appearance`，把已保留的服装、配饰和随身物件内容写入 `outfit`。

本轮位置集合包含 `subject` 时，该位置必须准确表达整幅画面的主体总数，并包含本轮画面设计中已经确定的性别组合、主体类别和特殊身份类型。本轮 Character Prompt 已经包含这些信息时，`subject` 可以重述履行上述职责所需的信息。

除 `subject` 为履行上述职责而重述的信息，以及 `relation_narrative` 为明确关系而重述的主体、动作、物件和目标外，其他位置不重复本轮 Character Prompt 已经包含的内容。

## 确定本轮位置集合

Skill 执行者必须按照以下顺序确定本轮使用的位置：

“实际内容”是至少一项与本轮画面一致、符合该位置唯一职责并且可以直接写入 WAI Prompt 的非空提示词内容。

1. 把当前主场景在[场景分支矩阵](composition-scenario-branches.md)中要求的位置加入必选位置集合。
2. 对当前用户消息中不属于已采用 Character Prompt 来源或已采用 Style Prompt 来源的已保留画面要求，以及已采用 Work 和 Prompt-term 查询结果中的提示词内容，按照“固定顺序和唯一职责”表加入对应位置。
3. 每轮都把 `quality` 加入必选位置集合，并写入 WAI 质量标签和用户明确要求的质量内容。对已采用 Style Prompt 内容中的每项已保留提示词内容，按照“固定顺序和唯一职责”表加入对应位置并写入该内容；其中具体画师提示词只进入 `artist`，非画师画风或创作媒介类别只进入 `non_artist_style`。存在已采用 Character Prompt 内容时，把 `character` 加入位置集合并写入本轮 Character Prompt。
4. 本轮已经选择的前十四个位置完成内容映射后，如果这些位置仍不能准确表达主体关系或分组、动作归属、物件或接触关系归属、空间关系、画格关系或者剧情内容归属，则把 `relation_narrative` 加入位置集合。
5. 步骤 2 至步骤 4 完成后，必选位置仍没有实际内容时，Skill 执行者按照该位置规则补全能够满足主场景要求、符合该位置唯一职责并且能够与全部已保留内容同时成立的提示词内容。只有不属于必选位置集合并且没有实际内容的位置才可以删除；最终 Prompt 不保留空位置。

Skill 执行者按照[语义查询接口与调用流程](semantic-tool-orchestration.md)读取 Style、Character、Work 和 Prompt-term 的接口用途与字段用途。

位置映射只改变内容在 WAI Prompt 中的位置，不改变用户要求、已采用 Character Prompt 来源、已采用 Style Prompt 来源、Work 和 Prompt-term 查询结果或 Skill 执行者补充内容的来源身份和既有优先级。

## 易混淆内容的位置边界

- `subject` 表达主体数量和类别；`character` 表达已采用 Character Prompt 内容中经过冲突处理后保留的内容；`appearance` 表达可见外貌，以及当前画面中可见的头发、皮肤和身体标记状态。由情绪或刺激引发的脸红、流汗和其他身体反应进入 `expression_reaction`；主体主动完成的姿态或动作进入 `action`；穿着状态进入 `outfit`。
- `action` 表达主体主动完成的姿态、动作和身体朝向；`expression_reaction` 表达由情绪、刺激或其他事件引发的表情、视线和身体反应。后仰、退缩、颤抖或身体僵硬被明确描述为反应时进入 `expression_reaction`，仅描述姿态或运动时进入 `action`；同一含义只进入一个位置。
- `camera_composition` 表达相机、画面布局、焦点和景深；`background blur`、`shallow depth of field` 等景深效果进入 `camera_composition`。
- `detail_mood` 表达表面纹理、摄影后期效果、整体调色、数字效果、运动表现和整体画面情绪；`watercolor paper texture`、`visible canvas texture`、`film grain`、`color grading`、`motion blur`、`speed lines`、残影、飞散碎屑和冲击波进入 `detail_mood`。
- 本轮 Character Prompt 没有包含的对象固有颜色，或者因用户替换要求而从该 Prompt 删除的对象固有颜色，进入该对象所属的位置：头发、眼睛和肤色进入 `appearance`，服装颜色进入 `outfit`，环境对象颜色进入 `environment`。光源颜色、色温、光照造成的染色、阴影、亮度和对比度进入 `lighting`；整体调色进入 `detail_mood`。
- `artist` 只使用具体画师 Prompt；`watercolor style`、`oil painting style`、`photographic style` 等非画师画风或创作媒介类别进入 `non_artist_style`。
- [场景分支矩阵](composition-scenario-branches.md)要求 `relation_narrative` 时，该位置写入矩阵要求明确表达的关系；矩阵没有要求该位置、但前十四个位置仍无法明确表达主体关系或分组、动作归属、物件或接触关系归属、空间关系、画格关系或剧情内容归属时，该位置只补充这些未明确表达的关系。为写清关系所需的主体、动作、物件和目标可以在英文关系短句中再次出现；与关系无关的外貌、服装、环境和风格内容仍只进入各自位置。

## 组合前检查

Skill 执行者必须确认：

- 当前用户消息中不属于已采用 Character Prompt 来源或已采用 Style Prompt 来源的每项已保留要求、本轮 Character Prompt、已采用 Style Prompt 内容、Work 和 Prompt-term 查询结果中的每项已保留提示词内容，以及每项已经保留的 Skill 执行者补充内容都已写入本轮待组合的位置内容；
- 每项已采用 Character Prompt 内容中经过冲突处理后保留的内容都完整写入 `character`；本轮 Character Prompt 以外的每项已保留提示词内容都按照“固定顺序和唯一职责”表分别进入对应位置；只有 `subject` 为完整表达主体数量、性别组合、主体类别和特殊身份类型所需的信息，以及 `relation_narrative` 为明确关系所需的主体、动作、物件和目标可以按本文件规定再次出现；
- 除上述两类重述外，Skill 执行者没有在本轮 Character Prompt 以外重复写入该 Prompt 已经包含的内容；
- 本轮位置集合包含 `subject` 时，该位置准确表达整幅画面的主体总数，并包含本轮画面设计中已经确定的性别组合、主体类别和特殊身份类型；
- 本轮必选位置集合中的每个位置均已保留并具有实际内容；
- 已采用 Style Prompt 内容包含具体画师提示词时，位置集合包含 `artist`；存在本轮 Character Prompt 时，位置集合包含 `character`；当前用户要求或已采用 Style Prompt 内容包含非画师画风或创作媒介类别时，位置集合包含 `non_artist_style`；当前用户明确要求输出形态或生产用途时，位置集合包含 `technical`；场景分支矩阵要求关系短句或前十四个位置不能明确表达本轮关系时，位置集合包含 `relation_narrative`；
- 每项内容仍保留位置映射前的来源身份和既有优先级；
- 所有位置都按照固定顺序排列；
- 没有实际内容的非必选位置已经删除。
