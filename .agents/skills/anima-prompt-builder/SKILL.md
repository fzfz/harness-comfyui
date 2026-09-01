---
name: anima-prompt-builder
description: 根据用户的自然语言画面要求、当前消息中的 Character/Style 选择和参考资料，构建并校验十二槽 ANIMA3 提示词；也可按一个或多个 run_id 独立查询历史 ComfyUI Generation Run 的原始生成参数和 Actual Workflow。
---

# ANIMA3 提示词构建器

## 查询历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 对应的生成参数或 Actual Workflow 时，Skill 执行者必须先完整读取 `references/generation-cli.md`，再按该文件调用历史 Generation Run 查询命令。该查询不要求当前消息包含画面要求、Workflow、生成模型或 LoRA 选择。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别报告每个 `run_id`。一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。用户只要求查询历史 Generation Run 时，Skill 执行者返回查询结果后结束本次执行；用户还要求构建 ANIMA3 Prompt 时，Skill 执行者完成查询后继续执行本文件的提示词流程。

## 加载固定参考资料

Skill 执行者每次运行必须按以下顺序读取固定参考资料，不能跳过或调整顺序：

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

读取上述十个文件后，Skill 执行者必须使用 `references/07-assembly-decision-tree.md` 第 5 章的组装决策树匹配与用户要求最接近的画面类型。本节所称“待填槽位”是以下两类槽位的并集：用户明确指定的画面内容所对应的槽位；第 5 章匹配的画面类型表要求填写、但用户没有明确指定内容的槽位。对于画面类型表要求填写但用户没有明确指定内容的槽位，Skill 执行者必须按照该画面类型表的建议确定槽位内容。Skill 执行者随后按照待填槽位逐行读取详细资料：

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

Skill 执行者把当前用户消息中除 `type=comfyui-context` JSON 行以外的普通文字作为自然语言意图。Skill 执行者按照 JSON 行在当前消息中的出现顺序读取 `type=comfyui-context` 且 `data.kind=character` 或 `data.kind=style` 的记录。

| 输入来源 | 运行用途 |
| --- | --- |
| 当前用户消息中的普通文字 | Skill 执行者从普通文字提取当前回合的主题、质量要求、内容要求和查询词。 |
| Character 记录 | Skill 执行者使用 `data.character_name` 和 `data.work_name` 识别并消歧角色，使用 `data.prompt_text` 作为角色提示词来源。 |
| Style 记录 | Skill 执行者使用 `data.name` 识别并消歧画师，使用 `data.prompt_text` 作为画师提示词来源。 |

`data.kind` 为 `style` 时，Skill 执行者按逗号拆分同一记录的 `data.prompt_text`，先删除每个逗号分段的首尾空白，再按照 `references/prompt-weight-policy.json` 解析该分段的未加权、默认权重或显式权重形式。Skill 执行者只删除逗号分段外部的空白，不能删除权重外层内部 payload 或 weight 两侧的空白来修复非法结构。Skill 执行者把合法解析后的 payload 转换为小写，再反复移除 payload 开头的 `@`。Skill 执行者不得把空分段或移除后为空的 payload 放入 `artist_style`；Skill 执行者必须只在其余 payload 开头添加一个 `@`，再按照原段的权重形式重新生成数组元素。原段是显式权重时，Skill 执行者逐字符保留合法 weight；原段是默认权重时生成 `(@payload)`；原段未加权时生成 `@payload`。该流程不能生成 `@(@payload:weight)`。`data.kind` 为 `character` 时，Skill 执行者把同一记录的 `data.prompt_text` 拆分后分类到 `character_series` 和 `appearance`。

## 读取语义查询说明

Skill 执行者只有在下列具体情况发生时，才先完整读取 `references/semantic-query-interfaces.md`，再按该文件说明判断是否调用工具：

1. 当前用户消息的普通文字中出现作品、系列或 IP，且 Skill 执行者需要确认作品身份或取得该作品的角色名称。
2. 用户指定角色，但当前 Character 记录没有可用的 `data.prompt_text`，或者当前作品与角色名称存在歧义。
3. `query_semantic_works` 返回的角色名称需要换取角色 `prompt_text`。
4. 用户指定画师，且 Skill 执行者需要确认画师身份或确认该画师身份对应的提示词。
5. 当前 Style 记录没有可用的 `data.prompt_text`，或者明确的画师身份存在歧义。
6. 当前用户消息的普通文字没有写出画师名称或画师别名，并且当前消息中不存在 `data.kind=style` 的 `comfyui-context` 记录。
7. 用户使用自然语言描述外貌、服装、动作、表情、构图、场景或氛围概念，并且已读取的详细资料不能确定与该概念精确对应的规范 Prompt 标签，或者存在两个以上语义相近但画面含义不同的候选标签。

第 6 种情况表示用户没有指定画师。Skill 执行者必须按照 `references/semantic-query-interfaces.md` 中 `query_semantic_styles` 的“查询步骤”完成画师方向设计、Style 候选比较和 Style 记录采用。

该文件说明以下四个工具：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`、`query_semantic_prompt_terms`。其中 `query_semantic_styles` 只查询 Style 记录中的画师身份及其提示词对应关系；`query_semantic_prompt_terms` 只把通用视觉概念解析成规范 Prompt 标签。两个工具不能互相替代。

若以上七种情况均未发生，Skill 执行者不读取 `references/semantic-query-interfaces.md`，也不调用上述四个工具。

## 构建并校验提示词

Skill 执行者构建一个只包含 `slots` 和 `display_text` 的顶层对象。`slots` 必须依次包含 `quality`、`artist_style`、`count_gender`、`character_series`、`appearance`、`clothing_state`、`pose_action_sex`、`expression_reaction`、`camera_shot`、`scene_environment`、`detail_mood` 和 `natural_language` 十二个键，不能缺少键或增加其他键。每个槽位的值必须是字符串数组；没有内容的槽位必须使用空数组 `[]`。`display_text` 必须是非空字符串。

Skill 执行者必须把 `references/prompt-weight-policy.json` 的 `recommendations.unweighted_quality.content` 依次放在 `quality` 开头并保持未加权。当前用户明确提出其他质量要求时，Skill 执行者只能把符合本 Skill 标签格式的额外质量 payload 放在固定前缀之后，并删除重复内容；当前用户没有提出其他质量要求时，`quality` 只包含该固定前缀。

Skill 执行者把 UI Style 记录的 `data.prompt_text` 按这些 Style JSON 行在当前消息中的出现顺序放入 `artist_style`。Skill 执行者把 `query_semantic_styles` 采用结果的 `prompt_text` 按该查询合同规定的结果顺序放入 `artist_style`。两类来源都使用“读取当前回合”规定的画师权重外层与前缀规范化步骤，并删除后出现的重复 payload。每个 `artist_style` 元素解析后的 payload 必须恰好以一个 `@` 开头。

`data.kind=character` 的 UI 记录只能使用实际 `data.prompt_text` 产生提示词词语。Skill 执行者按逗号拆分角色 `data.prompt_text`，对每段去除首尾空白并转换为小写，再把结果放入 `character_series` 或 `appearance`；`data.character_name`、`data.work_name` 和其他说明只能帮助理解或消歧，不能替代角色 `data.prompt_text`。`data.kind=style` 的 UI 记录只按照“读取当前回合”定义的画师规范化步骤处理 `data.prompt_text`。

Skill 执行者把当前用户意图映射到其余十个内容槽位，并用已读取的详细资料决定每个槽位的词语。Skill 执行者按照 `references/semantic-query-interfaces.md` 采用 `query_semantic_prompt_terms` 候选时，只把选中候选的 `canonical_tag` 放入该标签语义对应的内容槽位；`aliases` 只用于理解和比较候选。Skill 执行者完成槽位内容并删除冲突与重复内容后，按照 `references/prompt-weighting.md` 设计权重。前十一槽位的每个数组元素必须符合 `references/prompt-weight-policy.json` 定义的形式，解析后的 payload 必须是英文小写且不含逗号；`natural_language` 只能放入英文小写自然语言句子，并且不使用 tag 权重外层。

Skill 执行者按照 `references/03-output-protocol.md` 的“校验器调用”定义调用 校验器脚本。
