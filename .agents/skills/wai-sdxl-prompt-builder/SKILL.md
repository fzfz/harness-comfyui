---
name: wai-sdxl-prompt-builder
description: 将用户的自然语言画面要求和 UI 已选角色、画师扩展为 WAI-illustrious-SDXL 英文 Prompt；也可按一个或多个 run_id 独立查询历史 ComfyUI Generation Run 的原始生成参数和 Actual Workflow。用户要求生成、改写、补全或检查 WAI Prompt，或要求查询历史 run_id 时使用。
---

# WAI-illustrious-SDXL Prompt Builder

## 查询历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 对应的生成参数或 Actual Workflow 时，Skill 执行者必须先完整读取 `references/generation-cli.md`，再按该文件调用历史 Generation Run 查询命令。该查询不要求当前消息包含自然语言画面要求、UI 已选角色或 UI 已选画师。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别报告每个 `run_id`。一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。用户只要求查询历史 Generation Run 时，Skill 执行者返回查询结果后结束本次执行；用户还要求构建 WAI Prompt 时，Skill 执行者完成查询后继续执行本文件的 Prompt 流程。

开始执行后，先完整读取 [当前轮输入合同](references/input-contract.md)。按照该合同读取当前轮输入，完成一幅画面的设计，并通过本文件规定的格式校验器提交本轮结构化结果。

Skill Agent 根据用户本轮文字、UI 已选内容、选定构图和完整画面设计，自主判断各项内容的补充、替换、排除、重复和冲突关系。判断完成后按照以下顺序采用内容：

`用户本轮意图 > UI 已选内容 > 语义工具结果 > Skill Agent 自主设计内容`

## 1. 整理用户要求

按照 [当前轮输入合同](references/input-contract.md)整理用户本轮要求和 UI 明确选择：

- 画面包含多少名主体，以及每名主体是谁；
- 谁执行什么动作、动作指向谁、主体之间是什么关系；
- 用户指定的景别、角度、POV、焦点、主体位置、遮挡和裁剪；
- 地点、时间、天气、前景、中景、背景和主体之间的空间关系；
- 具体画师、普通画风、媒介、摄影效果、数字效果、氛围和光线；
- 用户要求的输出形态或生产用途。

## 2. 选择主场景并设计三个候选构图

读取 [场景分支矩阵](references/composition-scenario-branches.md)，从单主体肖像、双主体互动、多主体群像、遮挡与深度、动作展示、环境叙事、分镜与状态变化、NSFW 中选择一个主场景。其他同时成立的画面目的作为次要约束，只补充它们涉及的画面内容。用户要求多个画格、前后变化、过程或状态对比时，选择分镜与状态变化。

用户要求下表中的内容时，读取右侧对应配方。一个请求同时包含多项时，分别读取对应文件。读取配方后，继续使用已经选定的主场景和构图，把配方明确列出的 WAI Prompt 位置加入本轮位置集合，并按照配方完成这些位置。

| 用户要求的内容 | 读取文件 |
|---|---|
| NTR 关系、介入方、被夺方、见证者或观看关系 | [NTR 配方](references/cross-position-themes/NTR.md) |
| 束缚、BDSM、被束缚部位、束缚器具或支配关系 | [束缚与 BDSM 配方](references/cross-position-themes/束缚与BDSM.md) |
| RBQ、物化、固定装置、公开使用或多人使用关系 | [RBQ 与物化配方](references/cross-position-themes/RBQ与物化.md) |
| 男娘或 Futa 的身份、身体特征、动作方向或主导关系 | [男娘与 Futa 配方](references/cross-position-themes/男娘与Futa.md) |
| 非人主体、异种互动、体型差、数量差或特殊环境 | [异种配方](references/cross-position-themes/异种.md) |
| 调教、主人与宠物关系、服从表现、项圈、牵引或动物化姿态 | [调教与宠物配方](references/cross-position-themes/调教与宠物.md) |
| 胁迫关系、权力来源、胁迫手段、抗拒或屈服状态 | [胁迫配方](references/cross-position-themes/胁迫.md) |
| 偷窥、展示、观看者、被看者、观看渠道或发现状态 | [偷窥与展示配方](references/cross-position-themes/偷窥与展示.md) |
| 事后状态、残留痕迹、服装状态、清洗、离开或再次行动 | [事后配方](references/cross-position-themes/事后.md) |
| 日常任务与隐藏状态同时存在 | [另类日常配方](references/cross-position-themes/另类日常.md) |
| 裁剪、上下分区、介质遮挡、伪媒介或暗示性构图形成的隐藏动作 | [隐奸配方](references/cross-position-themes/隐奸.md) |

读取 [构图决策树](references/composition-decision-tree.md)，为整个请求生成三个候选构图：

- 候选 A 保留全部不冲突的用户明确要求，并采用最少额外推断。
- 候选 B 只改变影响最大的一个用户未指定镜头属性。
- 候选 C 只改变影响最大的一个用户未指定空间布局或可见范围属性。

每个候选分别确定主景别、角度、POV、焦点、主体位置、前中后景、遮挡、裁剪、可见范围、景深或运动效果。分镜请求的每个候选是一套完整分镜方案。

依次比较用户要求保留程度、镜头属性兼容性、场景对主体和动作的容纳能力、主焦点可读性和额外推断数量，选择一个候选进入后续步骤。三个候选都无法完成画面时，读取场景分支矩阵为当前主场景指定的一份 [完整场景示例](references/examples/)，重新设计并比较三个候选。

## 3. 完成画面设计并映射 WAI Prompt 位置

读取 [画面设计检查顺序](references/visual-design-slot-order.md)，依次检查人数、身份、外貌、服装、动作、表情、镜头、环境、画面细节、光线和主体关系。

按当前画面读取以下规则：

- 画面包含姿态、动作、动作目标、接触、支撑或动作结果时，读取 [动作结构](references/action-structure.md)。
- 画面包含多名主体的相对位置、前中后景、上下、内外、遮挡或包含关系时，读取 [空间关系规则](references/spatial-relation-rules.md)。
- 画面包含多个画格、前后状态、时间变化或连续镜头时，读取 [分镜规则](references/storyboard-panel-rules.md)。

读取 [WAI Prompt 位置顺序与职责](references/wai-prompt-position-order.md)，把选定构图和完整画面设计映射到该文档规定的十五个位置。位置集合由主场景必须位置、用户明确要求、次要约束、已读取配方和 UI 已选内容共同确定。读取每个已使用位置在 [位置规则目录](references/prompt-position-rules/) 中的规则。

`relation_narrative` 位于全部标签之后，只表达标签无法准确表达的动作归属、主体关系、空间关系、画格关系、时间关系或因果关系。

## 4. 补齐 WAI Prompt 位置内容

本轮需要调用任一语义查询接口时，在第一次调用前完整读取 [语义查询接口与调用流程](references/semantic-tool-orchestration.md)。按照该文档选择接口、组织查询、读取字段、处理结果，并完成尚未完成的角色、画师和普通视觉概念 Prompt 内容。

## 5. 自检、冲突处理和格式校验

Skill Agent 完成十五位置内容后，读取并执行 [Prompt 自检](references/prompt-self-check.md)，再读取并执行 [Prompt 冲突规则](references/prompt-conflict-rules.md)。两项检查发现问题时，Skill Agent 修改产生该问题的画面设计内容及其对应的 `positions` 数组元素，然后重新执行两项检查。

两项检查通过后，Skill Agent 读取 [Prompt 格式校验器接口](references/prompt-format-validator.md)，按照该接口调用 `scripts/validate-output.mjs`。校验器返回 `violations` 时，Skill Agent 根据每条 `violations[].path` 修改该路径指向的 `positions` 数组元素、`display_text` 或完整标准输入 JSON，然后重新执行自检、冲突检查和格式校验。Prompt 格式校验器最多调用三次。

校验器返回 `exit_code: 0` 时，Skill Agent 按照 [Prompt 格式校验器接口](references/prompt-format-validator.md) 的“校验成功”规则结束当前 Skill 执行。

第三次调用仍返回 `exit_code: 2` 时，Skill Agent 按照 [Prompt 格式校验器接口](references/prompt-format-validator.md) 规定的消息顺序生成错误原因字符串，调用 `finalize_skill_error`，传入该错误原因字符串，然后立即停止。校验器返回 `exit_code: 1`、Tool error 或其他整数退出码时，Skill Agent 按照同一文件规定生成错误原因字符串，调用 `finalize_skill_error`，然后立即停止。`finalize_skill_error` 自身返回 Tool error 时，Skill Agent 不重试该工具，不手写 JSON，也不再调用其他工具。
