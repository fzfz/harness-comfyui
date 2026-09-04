---
name: anima-prompt-builder
description: 用户要求根据自然语言画面要求与当前消息 `comfyui-context` 中的 Character 或 Style 上下文记录构建并校验十二槽 ANIMA3 Prompt，或者要求读取一个或多个 run_id 保存的生成参数或 Actual Workflow 时使用。
---

# ANIMA3 提示词构建器

## 查询历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 保存的生成参数或 Actual Workflow 时，Skill 执行者完整读取 `references/generation-cli.md`，并按照该文件取得每个 `run_id` 的查询结果。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别处理并报告每个 `run_id`；一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。用户只要求查询历史 Generation Run 时，Skill 执行者报告全部结果后结束本次执行。用户还要求构建 ANIMA3 Prompt 时，Skill 执行者报告查询结果后继续执行提示词流程。

用户要求把历史 Generation Run 的 Prompt 文本复用到 ANIMA3 Prompt 时，每项历史 Prompt 来源必须包含以下选择：`run_id`、`arguments.parameters` 中保存该文本的属性路径、从该属性值中采用的完整字符串或完整字符串数组元素，以及接收该文本的一个十二槽名称。目标槽位是 `artist_style` 时，用户还必须指定该文本对应的画师名称。用户可以指定采用整个字符串；用户只采用字符串的一部分时，必须给出需要采用的完整原文。Skill 执行者只采用这些选择明确且与成功查询结果完全一致的文本，不自行拆分未被选择的完整正向 Prompt。用户没有提供上述任一项选择、指定的属性路径不存在、指定文本与查询结果不一致，或者多个 `run_id` 为同一槽位提供互相冲突的文本时，Skill 执行者报告缺少或冲突的具体信息，请求用户重新指定，并在收到选择前停止 Prompt 构造。当前消息中的明确要求与历史 Prompt 文本冲突时，Skill 执行者保留当前消息中的明确要求。

## 读取当前消息

Skill 执行者把当前用户消息中除 `type=comfyui-context` JSON 行以外的普通文字作为自然语言意图。Skill 执行者按照 JSON 行在当前消息中的出现顺序读取 `type=comfyui-context` 且 `data.kind=character` 或 `data.kind=style` 的记录。

| 输入来源 | 运行用途 |
| --- | --- |
| 当前用户消息中的普通文字 | Skill 执行者从普通文字提取当前画面主题、质量要求、内容要求，以及作品、角色、画师或通用视觉概念的语义查询文本。 |
| Character 上下文记录 | Skill 执行者使用 `data.character_name` 和 `data.work_name` 识别并消歧角色，使用 `data.prompt_text` 作为角色提示词来源。 |
| Style 上下文记录 | Skill 执行者使用 `data.name` 识别并消歧画师，使用 `data.prompt_text` 作为画师提示词来源。 |

`data.kind=style` 时，Skill 执行者按逗号拆分同一记录的 `data.prompt_text`，先删除每个逗号分段的首尾空白，再按照 `references/prompt-weight-policy.json` 解析该分段的未加权、默认权重或显式权重形式。Skill 执行者只删除逗号分段外部的空白，保留权重外层内部 payload 或 weight 两侧的原有字符。Skill 执行者把合法解析后的 payload 转换为小写，再反复移除 payload 开头的 `@`。Skill 执行者舍弃空分段或移除后为空的 payload；在其余 payload 开头添加一个 `@`，再按照原段的权重形式重新生成数组元素。原段是显式权重时，Skill 执行者逐字符保留合法 weight；原段是默认权重时生成 `(@payload)`；原段未加权时生成 `@payload`。

## 读取提示词参考资料

当本次执行包含构建 ANIMA3 Prompt 的要求时，Skill 执行者必须按以下顺序读取固定参考资料：

1. `references/00-template-header.md`
2. `references/01-quick-start.md`
3. `references/02-role.md`
4. `references/03-output-protocol.md`
5. `references/04-final-self-check.md`
6. `references/05-conflict-table.md`
7. `references/prompt-weight-policy.json`
8. `references/prompt-weighting.md`
9. `references/06-slot-order.md`
10. `references/07-assembly-decision-tree.md`

读取上述十个文件后，Skill 执行者必须使用 `references/07-assembly-decision-tree.md` 第 5 章的组装决策树匹配与用户自然语言意图最接近的画面类型。本节所称“待填槽位”是以下两类槽位的并集：用户明确指定的画面内容所对应的槽位；第 5 章匹配的画面类型表要求填写、但用户没有明确指定内容的槽位。对于后一类槽位，Skill 执行者必须采用该画面类型表建议的槽位内容。Skill 执行者随后按下表的读取条件读取详细资料：

| 文件 | 读取条件 |
| --- | --- |
| `references/08-count-identity.md` | 当 `count_gender` 或 `character_series` 是待填槽位时，Skill 执行者读取 `references/08-count-identity.md`，用于确定人数、性别、角色、作品、数量、身份、年龄和体型内容。 |
| `references/09-appearance.md` | 当 `appearance` 是待填槽位时，Skill 执行者读取 `references/09-appearance.md`，用于确定头发、眼睛、身体特征、身体部位、非人特征和身体标记内容。 |
| `references/10-clothing-state.md` | 当 `clothing_state` 是待填槽位时，Skill 执行者读取 `references/10-clothing-state.md`，用于确定服装类型、服装材质、穿着状态、服装改造、配饰和鞋袜内容。 |
| `references/11-pose-action-sex.md` | 当 `pose_action_sex` 是待填槽位时，Skill 执行者读取 `references/11-pose-action-sex.md`，用于确定姿势、动作、角色互动、单人动作、双人互动、多人互动和分镜动作内容。 |
| `references/12-expression-reaction.md` | 当 `expression_reaction` 是待填槽位时，Skill 执行者读取 `references/12-expression-reaction.md`，用于确定主要表情、面部细节、视线、身体反应、可见液体和即时痕迹。 |
| `references/13-camera-shot.md` | 当 `camera_shot` 是待填槽位时，Skill 执行者读取 `references/13-camera-shot.md`，用于确定景别、视角、POV、构图、镜头效果、身体部位聚焦和多画面分镜内容。 |
| `references/14-scene-environment.md` | 当 `scene_environment` 是待填槽位时，Skill 执行者读取 `references/14-scene-environment.md`，用于确定主场所、场所特征、天气、时段、可见环境现象和附加场景内容。 |
| `references/15-detail-mood.md` | 当 `detail_mood` 是待填槽位时，Skill 执行者读取 `references/15-detail-mood.md`，用于确定画面媒介、色彩范围、运动表现、成像与后期效果、故障与显示介质效果、数字图形和整体氛围。 |
| `references/16-special-theme.md` | 当 `references/07-assembly-decision-tree.md` 第 5 章 5.7 把画面类型匹配为 NTR、束缚/BDSM、RBQ/物化、男娘/Futa、异种、调教/宠物、胁迫、偷窥/展示、事后、另类日常、大车小孩或隐奸时，Skill 执行者读取 `references/16-special-theme.md`，用于确定该特殊主题需要填入 `count_gender`、`character_series`、`appearance`、`clothing_state`、`pose_action_sex`、`expression_reaction`、`camera_shot`、`scene_environment`、`detail_mood` 或 `natural_language` 的内容。 |

## 读取语义查询说明

Skill 执行者只有在下列具体情况发生时，才先完整读取 `references/semantic-query-interfaces.md`，再按该文件说明判断是否调用 `imagegen-semantic-query`：

1. 当前用户消息的普通文字中出现作品、系列或 IP，并且现有输入不能唯一确定该作品的身份，或者用户要求取得该作品的角色名称。
2. 用户指定角色，但当前用户消息直接提供的角色 Prompt、该角色对应的 Character 上下文记录和用户指定给 `character_series` 或 `appearance` 的历史 Prompt 文本不能提供该角色的身份标签或用户要求的外貌标签，或者当前作品与角色名称存在歧义。
3. 用户指定画师，但当前用户消息直接提供的画师 Prompt、该画师对应的 Style 上下文记录和用户指定给 `artist_style` 的历史 Prompt 文本均不能提供该画师的非空 Prompt，或者用户提供的画师名称或别名对应多个画师身份。
4. 当前用户消息的普通文字没有写出画师名称、画师别名或可直接写入 `artist_style` 的非空画师 Prompt，当前消息中不存在 `data.kind=style` 的 `comfyui-context` 记录，用户没有把可采用的历史 Prompt 文本指定给 `artist_style`，并且用户没有要求排除全部画师或保持 `artist_style` 为空。
5. 用户使用自然语言描述外貌、服装、动作、表情、构图、场景或氛围概念，并且已读取的详细资料不能确定与该概念精确对应的规范 Prompt 标签，或者存在两个以上语义相近但画面含义不同的候选标签。

第 4 种情况表示用户没有指定画师。Skill 执行者必须先完整读取 `references/artist-style-query-vocabulary.md`，按该文件构造一条或多条画风查询，再按照 `references/semantic-query-interfaces.md` 的“查询顺序与查询值”执行 Style Search、比较候选并采用选中结果。

## 构建并校验提示词

Skill 执行者构建一个只包含 `slots` 和 `display_text` 的顶层对象。`slots` 必须依次包含 `quality`、`artist_style`、`count_gender`、`character_series`、`appearance`、`clothing_state`、`pose_action_sex`、`expression_reaction`、`camera_shot`、`scene_environment`、`detail_mood` 和 `natural_language` 十二个键，不能缺少键或增加其他键。每个槽位的值必须是字符串数组；没有内容的槽位必须使用空数组 `[]`。`display_text` 必须是非空字符串。

Skill 执行者必须把 `references/prompt-weight-policy.json` 的 `recommendations.unweighted_quality.content` 依次放在 `quality` 开头并保持未加权。当前用户明确提出其他质量要求时，Skill 执行者把符合 `references/prompt-weight-policy.json` 所定义元素形式的额外质量 payload 放在固定前缀之后；相同 payload 出现多次时，Skill 执行者按数组顺序保留第一个 payload 对应的元素并删除后续元素。当前用户没有提出其他质量要求时，`quality` 只包含该固定前缀。

用户要求排除全部画师或保持 `artist_style` 为空时，Skill 执行者不处理任何画师 Prompt 来源，并把 `artist_style` 设置为空数组。其他情况下，Skill 执行者先移除用户明确排除的具体画师对应的全部 Prompt 来源，再按当前消息中的出现顺序处理用户明确要求直接采用的非空画师 Prompt，然后处理 `data.kind=style` 记录中的非空 `data.prompt_text`，最后处理 Style Search 或 Resolve 的已采用结果中的 `prompt_text`。三类来源都使用“读取当前消息”规定的画师权重外层与前缀规范化步骤并放入 `artist_style`；相同 payload 出现多次时，Skill 执行者保留最先处理的元素。每个 `artist_style` 元素解析后的 payload 必须恰好以一个 `@` 开头。

Skill 执行者按照用户为每项历史 Prompt 文本指定的槽位处理该文本。目标槽位是 `artist_style` 时，Skill 执行者先舍弃用户要求排除的画师对应的文本；用户要求保持 `artist_style` 为空时，Skill 执行者舍弃全部历史 `artist_style` 文本；其余历史 `artist_style` 文本使用“读取当前消息”规定的画师权重外层与前缀规范化步骤，并放入 `artist_style`。目标槽位是其他前十一槽时，Skill 执行者按照逗号拆分文本，删除每段首尾空白，按照 `references/prompt-weight-policy.json` 解析元素形式，并把解析后的 payload 转换为小写；每个非空 payload 作为一个候选元素进入用户指定的槽位。目标槽位是 `natural_language` 时，用户指定的每个完整字符串必须是能够放入最终 Prompt 的英文句子；Skill 执行者把句子转换为小写并作为一个数组元素。历史 Prompt 文本与同槽位其他内容发生冲突时，Skill 执行者按照 `references/05-conflict-table.md` 保留当前用户消息中的明确要求，并处理其余冲突内容。

Skill 执行者先按当前消息中的出现顺序处理用户明确要求直接采用的非空角色 Prompt，再处理 `data.kind=character` 记录中的非空 `data.prompt_text`，最后处理 Character Search 或 Resolve 的已采用结果中的 `prompt_text`。Skill 执行者按逗号拆分每个角色提示词来源，删除每段首尾空白，按照 `references/prompt-weight-policy.json` 解析元素形式，并把解析后的 payload 转换为小写。Skill 执行者舍弃空 payload，并依据 `references/08-count-identity.md` 和 `references/09-appearance.md` 定义的内容范围，把角色或作品身份 payload 作为未加权候选元素放入 `character_series`，把外观 payload 作为未加权候选元素放入 `appearance`；`data.character_name`、`data.work_name` 和其他说明用于理解或消歧。

Skill 执行者把当前用户意图映射到除 `quality` 和 `artist_style` 以外的十个内容槽位，并用已读取的详细资料决定每个槽位的数组元素。Skill 执行者采用 Prompt-term Search 候选时，只把选中候选的 `canonical_tag` 放入该标签语义对应的内容槽位；`aliases_json` 用于理解和比较候选。Skill 执行者按照 `references/05-conflict-table.md` 删除冲突内容；相同 payload 出现多次时，按数组顺序保留第一个 payload 对应的元素并删除后续元素；再按照 `references/prompt-weighting.md` 设计权重。前十一槽位的每个数组元素必须符合 `references/prompt-weight-policy.json` 定义的形式，解析后的 payload 必须是英文小写且不含逗号；`natural_language` 只能放入英文小写自然语言句子，并且不使用 tag 权重外层。

Skill 执行者按照已读取的 `references/03-output-protocol.md` 校验 Prompt 格式并处理校验结果。只有通过格式校验的 Prompt 才能进入“构造生成结果”步骤；未通过格式校验时，Skill 执行者按照该文件处理并停止在本步骤。

## 构造生成结果

ANIMA 十二槽 Prompt 通过格式校验以后，Skill 执行者在决定生成目的、负向策略和目标尺寸以前，完整读取 `references/generation-output-contract.md`、`references/generation-output-schema.json` 与 `references/generation-profiles.json`。Skill 执行者按照这些文件构造并校验一个结构化生成结果。只有通过校验的生成结果才能用于最终回答；未通过校验时，Skill 执行者按照这些文件处理并停止在本步骤。

本次执行包含构建 ANIMA3 Prompt 的要求时，最终回答必须包含一个通过生成结果校验器的结构化结果；本次执行还包含历史 Generation Run 查询要求时，Skill 执行者必须先按 `runs[]` 顺序报告查询结果，再输出该结构化结果。
