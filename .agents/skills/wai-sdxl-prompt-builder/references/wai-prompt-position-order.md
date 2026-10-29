---
文档用途: 提供 WAI Prompt 位置顺序与职责。
读取时机: 按正文“用途和读取时机”读取。
---
# WAI Prompt 位置顺序与职责

## 用途和读取时机

1. 本文件是十五个 WAI Prompt 位置、固定顺序、唯一职责和位置选择方法的唯一来源。

2. Skill 执行者完成画面设计后，必须先完整读取本文件，再把画面内容映射到对应位置。Skill 执行者确定本轮位置集合后，只读取这些位置在[位置规则目录](prompt-position-rules/)中的规则。

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

### Character Prompt 来源

1. 按 [SKILL.md 第 1 节](../SKILL.md#1-读取本轮输入)的优先级，为每名角色采用以下一种来源：

   1. Skill 执行者选择当前用户消息作为来源，并采用该消息中直接提供且要求整体采用的完整角色 Prompt 作为 Character Prompt 内容。
   2. Skill 执行者选择 `data.prompt_text` 非空的 Character 上下文记录作为来源，并采用该记录的 `data.prompt_text` 作为 Character Prompt 内容。
   3. Skill 执行者选择用户指定复用的历史 Generation Run 输入作为来源，并采用该输入中的完整角色 Prompt 作为 Character Prompt 内容。
   4. Skill 执行者选择按照 [目录素材查询](../SKILL.md#4-查询缺少的角色画师与风格效果-prompt-内容)取得的 MCP 角色查询结果作为来源，并采用选中角色的 Prompt 作为 Character Prompt 内容。

2. 前三种来源均未提供当前角色的完整角色 Prompt 时，按 [`character` 位置规则](prompt-position-rules/character.md#查询作品与角色素材)判断是否查询。本节把为角色选定的用户消息、Character 上下文记录、历史 Generation Run 输入或 Character 查询结果称为“已采用 Character Prompt 来源”。从该来源取得的完整角色 Prompt 文本称为“已采用 Character Prompt 内容”。

### Style Prompt 来源

1. 按 [SKILL.md 第 1 节](../SKILL.md#1-读取本轮输入)的优先级，为每名画师采用以下一种来源：

   1. Skill 执行者选择当前用户消息作为来源，并采用该消息中直接提供且要求采用的画师 Prompt 作为 Style Prompt 内容。
   2. Skill 执行者选择 `data.prompt_text` 非空的 Style 上下文记录作为来源，并采用该记录的 `data.prompt_text` 作为 Style Prompt 内容。
   3. Skill 执行者选择用户指定复用的历史 Generation Run 输入作为来源，并采用该输入中的画师 Prompt 作为 Style Prompt 内容。
   4. Skill 执行者选择按照 [目录素材查询](../SKILL.md#4-查询缺少的角色画师与风格效果-prompt-内容)取得的 MCP 画师查询结果作为来源，并采用选中画师的 Prompt 作为 Style Prompt 内容。

2. 前三种来源均未提供当前画师的 Prompt 时，Skill 执行者才查询该画师。本节把 Skill 执行者为画师选定的用户消息、Style 上下文记录、历史 Generation Run 输入或 Style 查询结果称为“已采用 Style Prompt 来源”，把从该来源取得的画师 Prompt 文本称为“已采用 Style Prompt 内容”。

## Character 来源内容

1. 本节把经过当前轮采用和修改操作后写入 `character` 的内容称为“本轮 Character Prompt”。
2. 用户没有新增、替换或排除角色外貌或服装时，把已采用 Character Prompt 内容原样写入 `character`。
3. 用户新增外貌或服装时，保留写入 `character` 的完整来源内容。新增内容进入 `appearance` 或 `outfit`。
4. 用户替换外貌或服装时，只从 `character` 删除直接冲突的标签。替换内容进入 `appearance` 或 `outfit`。
5. 用户排除外貌或服装时，只从 `character` 删除被排除的标签。最终 Prompt 不写入该排除内容。
6. 修改仅作用于本轮输出。输入来源中的 Prompt 文本保持不变，其他角色的内容保持完整。
7. 没有已采用 Character Prompt 内容时，本轮不创建 `character`。其余可见内容按“固定顺序和唯一职责”表分配。
8. `subject` 必须表达整幅画面的主体数量、性别组合、类别和特殊身份。为履行该职责，可重述 Character Prompt 中的主体信息。
9. `relation_narrative` 为明确关系，可重述所需主体、动作、物件和目标。其他位置不得重复本轮 Character Prompt 已包含的内容。

## 确定本轮位置集合

1. “实际内容”指与本轮画面一致、符合位置职责的非空提示词内容。
2. 参考文件使用的位置名称必须属于“固定顺序和唯一职责”表。存在其他名称时，报告参考文件路径和名称，停止构造。

### 位置选择步骤

1. 将当前主场景在[场景分支矩阵](composition-scenario-branches.md)中要求的位置加入必选集合。本轮采用的参考文件有“位置映射”表时，将表中要求的位置一并加入。
2. 对本轮不属于已采用 Character Prompt 来源或已采用 Style Prompt 来源的画面要求，以及已采用目录词条的规范标签，按照“固定顺序和唯一职责”表加入对应位置。画面要求包括 [材料型输入](input-contract.md#材料型输入)形成的可见内容。
3. 每轮都把 `quality` 加入必选位置集合，并写入 WAI 质量标签和用户明确要求的质量内容。对已采用 Style Prompt 内容中的每项已保留提示词内容，按照“固定顺序和唯一职责”表加入对应位置并写入该内容；其中具体画师提示词只进入 `artist`，非画师画风或创作媒介类别只进入 `non_artist_style`。存在已采用 Character Prompt 内容时，把 `character` 加入位置集合并写入本轮 Character Prompt。
4. 本轮已经选择的前十四个位置完成内容映射后，如果这些位置仍不能准确表达主体关系或分组、动作归属、物件或接触关系归属、空间关系、画格关系或者剧情内容归属，则把 `relation_narrative` 加入位置集合。
5. 步骤 2 至步骤 4 完成后，必选位置仍没有实际内容时，Skill 执行者按照该位置规则补全能够满足主场景要求、符合该位置唯一职责并且能够与全部已保留内容同时成立的提示词内容。只有不属于必选位置集合并且没有实际内容的位置才可以删除；最终 Prompt 不保留空位置。

6. 位置映射保留每项内容的来源身份和既有优先级。

## 易混淆内容的位置边界

1. `subject` 表达主体数量和类别；`character` 表达已采用 Character Prompt 内容中经过冲突处理后保留的内容；`appearance` 表达可见外貌，以及当前画面中可见的头发、皮肤和身体标记状态。由情绪或刺激引发的脸红、流汗和其他身体反应进入 `expression_reaction`；主体主动完成的姿态或动作进入 `action`；穿着状态进入 `outfit`。
2. `action` 表达主体主动完成的姿态、动作和身体朝向；`expression_reaction` 表达由情绪、刺激或其他事件引发的表情、视线和身体反应。后仰、退缩、颤抖或身体僵硬被明确描述为反应时进入 `expression_reaction`，仅描述姿态或运动时进入 `action`；同一含义只进入一个位置。
3. `camera_composition` 表达相机、画面布局、焦点和景深；`background blur`、`shallow depth of field` 等景深效果进入 `camera_composition`。
4. `detail_mood` 表达表面纹理、摄影后期效果、整体调色、数字效果、运动表现和整体画面情绪；`watercolor paper texture`、`visible canvas texture`、`film grain`、`color grading`、`motion blur`、`speed lines`、残影、飞散碎屑和冲击波进入 `detail_mood`。
5. 本轮 Character Prompt 没有包含的对象固有颜色，或者因用户替换要求而从该 Prompt 删除的对象固有颜色，进入该对象所属的位置：头发、眼睛和肤色进入 `appearance`，服装颜色进入 `outfit`，环境对象颜色进入 `environment`。光源颜色、色温、光照造成的染色、阴影、亮度和对比度进入 `lighting`；整体调色进入 `detail_mood`。
6. `artist` 只使用具体画师 Prompt；`watercolor style`、`oil painting style`、`photographic style` 等非画师画风或创作媒介类别进入 `non_artist_style`。
7. [场景分支矩阵](composition-scenario-branches.md)要求 `relation_narrative` 时，该位置写入矩阵要求明确表达的关系；矩阵没有要求该位置、但前十四个位置仍无法明确表达主体关系或分组、动作归属、物件或接触关系归属、空间关系、画格关系或剧情内容归属时，该位置只补充这些未明确表达的关系。为写清关系所需的主体、动作、物件和目标可以在英文关系短句中再次出现；与关系无关的外貌、服装、环境和风格内容仍只进入各自位置。

## 组合前检查

1. 核对本轮已采用来源中的每项保留内容，确认全部进入对应位置。
2. 按“Character 来源内容”核对角色内容的采用、修改与去重。
3. 按“位置选择步骤”核对必选位置与实际内容。
4. 按“固定顺序和唯一职责”核对位置顺序与内容归属。
