---
name: anima-prompt-builder
description: 根据 noobai_user_prompt、当前目录选择和参考资料，构建并校验十二槽 ANIMA3 提示词；也可按一个或多个 run_id 独立查询历史 ComfyUI Generation Run 的原始生成参数和 Actual Workflow。
---

# ANIMA3 提示词构建器

## 查询历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 对应的生成参数或 Actual Workflow 时，Skill 执行者必须先完整读取 `references/generation-cli.md`，再按该文件调用历史 Generation Run 查询命令。该查询不要求当前消息包含 `noobai_user_prompt`、Workflow、生成模型或 LoRA 选择。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别报告每个 `run_id`。一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。用户只要求查询历史 Generation Run 时，Skill 执行者返回查询结果后结束本次执行；用户还要求构建 ANIMA3 Prompt 时，Skill 执行者完成查询后继续执行本文件的提示词流程。

## 加载固定参考资料

Skill 执行者每次运行必须按以下顺序读取固定参考资料，不能跳过或调整顺序：

1. `references/00-template-header.md`
2. `references/01-quick-start.md`
3. `references/02-role.md`
4. `references/03-output-protocol.md`
5. `references/04-final-self-check.md`
6. `references/05-conflict-table.md`
7. `references/06-slot-order.md`
8. `references/07-assembly-decision-tree.md`

读取上述八个文件后，Skill 执行者必须使用 `references/07-assembly-decision-tree.md` 第 5 章的组装决策树匹配与用户要求最接近的画面类型。本节所称“待填槽位”是以下两类槽位的并集：用户明确指定的画面内容所对应的槽位；第 5 章匹配的画面类型表要求填写、但用户没有明确指定内容的槽位。对于画面类型表要求填写但用户没有明确指定内容的槽位，Skill 执行者必须按照该画面类型表的建议确定槽位内容。Skill 执行者随后按照待填槽位逐行读取详细资料：

| 文件 | 读取条件 |
| --- | --- |
| `references/08-count-identity.md` | 当 `count_gender` 或 `character_series` 是待填槽位时，Skill 执行者读取 `references/08-count-identity.md`，用于确定人数、性别、角色、作品、数量、身份、年龄和体型内容。 |
| `references/09-appearance.md` | 当 `appearance` 是待填槽位时，Skill 执行者读取 `references/09-appearance.md`，用于确定头发、眼睛、身体特征、身体部位、非人特征和身体标记内容。 |
| `references/10-clothing-state.md` | 当 `clothing_state` 是待填槽位时，Skill 执行者读取 `references/10-clothing-state.md`，用于确定服装类型、服装材质、穿着状态、服装改造、配饰和玩具内容。 |
| `references/11-pose-action-sex.md` | 当 `pose_action_sex` 是待填槽位时，Skill 执行者读取 `references/11-pose-action-sex.md`，用于确定姿势、动作、角色互动、单人动作、双人互动、多人互动和分镜动作内容。 |
| `references/12-expression-reaction.md` | 当 `expression_reaction` 是待填槽位时，Skill 执行者读取 `references/12-expression-reaction.md`，用于确定表情、表情强度、身体反应、液体和身体痕迹内容。 |
| `references/13-camera-shot.md` | 当 `camera_shot` 是待填槽位时，Skill 执行者读取 `references/13-camera-shot.md`，用于确定景别、视角、POV、构图、镜头效果、身体部位聚焦和多画面分镜内容。 |
| `references/14-scene-environment.md` | 当 `scene_environment` 是待填槽位时，Skill 执行者读取 `references/14-scene-environment.md`，用于确定场所、场景心理、天气、时辰和场景细节内容。 |
| `references/15-detail-mood.md` | 当 `detail_mood` 是待填槽位时，Skill 执行者读取 `references/15-detail-mood.md`，用于确定画面质感、运动渲染、光学效果、摄影效果、数字效果、故障效果和氛围基调内容。 |
| `references/16-special-theme.md` | 当 `references/07-assembly-decision-tree.md` 第 5 章 5.7 把画面类型匹配为 NTR、束缚/BDSM、RBQ/物化、男娘/Futa、异种、调教/宠物、胁迫、偷窥/展示、事后、另类日常、大车小孩或隐奸时，Skill 执行者读取 `references/16-special-theme.md`，用于确定该特殊主题需要填入 `count_gender`、`character_series`、`appearance`、`clothing_state`、`pose_action_sex`、`expression_reaction`、`camera_shot`、`scene_environment`、`detail_mood` 或 `natural_language` 的内容。 |

## 读取当前回合

Skill 执行者从 `noobai_user_prompt.user_text` 读取当前用户的自然语言意图，从 `noobai_user_prompt.ui_explicit.selections[]` 读取用户已经确认的目录选择，并按字段处理当前回合。

| 输入路径 | 运行用途 |
| --- | --- |
| `noobai_user_prompt.user_text` | Skill 执行者从该字段提取当前回合的主题、质量要求、内容要求和查询词。 |
| `noobai_user_prompt.ui_explicit.selections[]` | Skill 执行者从该数组读取用户确认的角色和画师选择，并保留选择对象。 |
| `noobai_user_prompt.ui_explicit.selections[].kind` | Skill 执行者根据该字段区分 `character` 和 `style`，并决定后续路由。 |
| `noobai_user_prompt.ui_explicit.selections[].name` | Skill 执行者使用该字段识别和消歧用户选择；Skill 执行者不得用该字段代替选中对象的 `prompt_text`。 |
| `noobai_user_prompt.ui_explicit.selections[].prompt_text` | Skill 执行者从该字段读取 `kind=character` 或 `kind=style` 对象的提示词来源。 |
| `noobai_user_prompt.ui_explicit.selections[].work_name` | Skill 执行者使用该字段识别角色所属作品并辅助消歧；Skill 执行者不得把该字段直接写入提示词。 |
| `noobai_user_prompt.ui_explicit.selections[].selection_order` | Skill 执行者按照该字段的数值升序排列并处理全部选择。 |

Skill 执行者按 `selection_order` 升序处理选择。`kind` 为 `style` 时，Skill 执行者按逗号拆分同一对象的 `prompt_text`。Skill 执行者对每段去除首尾空白并转换为小写，然后反复移除该段开头的 `@`。Skill 执行者不得把移除后为空的分段放入 `artist_style`；Skill 执行者必须只在其余分段开头添加一个 `@`，再把规范化结果放入 `artist_style`。`kind` 为 `character` 时，Skill 执行者把同一对象的 `prompt_text` 拆分后分类到 `character_series` 和 `appearance`。

## 读取语义查询说明

Skill 执行者只有在下列具体情况发生时，才先完整读取 `references/semantic-query-interfaces.md`，再按该文件说明判断是否调用工具：

1. `noobai_user_prompt.user_text` 中出现作品、系列或 IP，且 Skill 执行者需要确认作品身份或取得该作品的角色名称。
2. 用户指定角色，但当前选择没有可用的角色 `prompt_text`，或者当前作品与角色名称存在歧义。
3. `query_semantic_works` 返回的角色名称需要换取角色 `prompt_text`。
4. 用户指定画师，且 Skill 执行者需要确认画师身份或确认该画师身份对应的提示词。
5. 明确的画师选择没有可用的 `prompt_text`，或者明确的画师身份存在歧义。
6. `noobai_user_prompt.user_text` 没有写出画师名称或画师别名，并且 `noobai_user_prompt.ui_explicit.selections[]` 中不存在 `kind` 为 `style` 的选择。
7. 用户使用自然语言描述外貌、服装、动作、表情、构图、场景或氛围概念，并且已读取的详细资料不能确定与该概念精确对应的规范 Prompt 标签，或者存在两个以上语义相近但画面含义不同的候选标签。

第 6 种情况表示用户没有指定画师。Skill 执行者必须按照 `references/semantic-query-interfaces.md` 中 `query_semantic_styles` 的“查询步骤”完成画师方向设计、Style 候选比较和 Style 记录采用。

该文件说明以下四个工具：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`、`query_semantic_prompt_terms`。其中 `query_semantic_styles` 只查询 Style 记录中的画师身份及其提示词对应关系；`query_semantic_prompt_terms` 只把通用视觉概念解析成规范 Prompt 标签。两个工具不能互相替代。

若以上七种情况均未发生，Skill 执行者不读取 `references/semantic-query-interfaces.md`，也不调用上述四个工具。

## 构建并校验提示词

Skill 执行者构建一个只包含 `slots` 和 `display_text` 的顶层对象。`slots` 必须依次包含 `quality`、`artist_style`、`count_gender`、`character_series`、`appearance`、`clothing_state`、`pose_action_sex`、`expression_reaction`、`camera_shot`、`scene_environment`、`detail_mood` 和 `natural_language` 十二个键，不能缺少键或增加其他键。每个槽位的值必须是字符串数组；没有内容的槽位必须使用空数组 `[]`。`display_text` 必须是非空字符串。

Skill 执行者必须把 `masterpiece`、`best quality`、`score_7`、`highres`、`safe` 依次放在 `quality` 开头。当前用户明确提出其他质量要求时，Skill 执行者只能把符合本 Skill 标签格式的额外质量标签放在 `safe` 之后，并删除重复标签；当前用户没有提出其他质量要求时，`quality` 必须是 `["masterpiece", "best quality", "score_7", "highres", "safe"]`。

Skill 执行者把明确画师选择或 `query_semantic_styles` 采用的一个或多个 Style 记录的 `prompt_text` 按“读取当前回合”规定的画师前缀规范化步骤放入 `artist_style`。存在多个 Style 记录时，Skill 执行者按照 `queries[]` 的顺序处理各记录的 `prompt_text`，并删除后出现的重复词语。每个 `artist_style` 元素必须恰好以一个 `@` 开头。

`kind=character` 的选中对象只能使用实际 `prompt_text` 产生提示词词语。Skill 执行者按逗号拆分角色 `prompt_text`，对每段去除首尾空白并转换为小写，再把结果放入 `character_series` 或 `appearance`；名称、别名和说明只能帮助理解或消歧，不能替代角色 `prompt_text`。`kind=style` 对象的 `prompt_text` 只按照“读取当前回合”定义的画师规范化步骤处理。

Skill 执行者把当前用户意图映射到其余十个内容槽位，并用已读取的详细资料决定每个槽位的词语。Skill 执行者按照 `references/semantic-query-interfaces.md` 采用 `query_semantic_prompt_terms` 候选时，只把选中候选的 `canonical_tag` 放入该标签语义对应的内容槽位；`aliases` 只用于理解和比较候选。Skill 执行者只能把英文小写、无逗号的词语放入前十一槽位；`natural_language` 只能放入英文小写自然语言句子。

Skill 执行者按照 `references/03-output-protocol.md` 的“校验器调用”定义调用 校验器脚本。

