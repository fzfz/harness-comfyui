---
name: wai-sdxl-prompt-builder
description: 用户要求生成、改写、补全或检查 WAI-illustrious-SDXL 英文 Prompt，或者查询一个或多个 ComfyUI Generation Run 的生成参数或 Actual Workflow 时使用。
---

## 查询历史 Generation Run

用户要求读取或核对一个或多个 `run_id` 保存的生成参数或 Actual Workflow，或者要求把这些数据提供给后续任务复用时，Skill 执行者完整读取 `references/generation-cli.md`，并按照该文件取得每个 `run_id` 的查询结果。

用户只要求查询历史 Generation Run，或只要求把查询结果提供给后续任务复用，而未要求构建 WAI Prompt 时，Skill 执行者报告查询结果后结束。用户同时要求使用查询结果构建 WAI Prompt 时，每项历史 Prompt 来源必须包含以下选择：`run_id`、`arguments.parameters` 中保存该文本的属性路径、作为 Character Prompt 或 Style Prompt 的来源类型、该来源对应的角色或画师，以及从该属性值中采用的完整字符串或完整字符串数组元素。用户可以指定采用整个字符串；用户只采用字符串的一部分时，必须给出需要采用的完整原文。Skill 执行者只采用这些选择明确且与成功查询结果完全一致的文本，不把未被选择的完整正向 Prompt 自行拆分为角色 Prompt 或画师 Prompt。

用户没有提供上述任一项选择，指定的属性路径不存在，指定文本与查询结果不一致，或者同一角色或画师存在两项相互冲突的历史来源时，Skill 执行者报告缺少或冲突的具体信息，请求用户重新指定，并在收到选择前停止 Prompt 构造。全部查询均失败时，Skill 执行者报告全部失败结果并停止 Prompt 构造。部分查询失败时，Skill 执行者处理完全部查询结果，请求用户选择是否仅使用成功结果，并在收到选择前停止 Prompt 构造。用户已经明确指定全部需要采用的历史 Prompt 来源，并且所需查询均成功或用户已经选择只使用成功结果时，Skill 执行者继续执行第 1 至第 7 节。

## 1. 读取本轮输入

Skill 执行者完整读取 [当前轮输入合同](references/input-contract.md)，并按照该文件取得当前用户消息中的自然语言画面要求、Character 上下文记录和 Style 上下文记录。Skill 执行者同时取得“查询历史 Generation Run”一节确定的每项历史 Prompt 来源。

Skill 执行者按照以下优先级处理同一 Prompt 位置的内容：当前用户消息中的明确要求、当前消息中的 Character 或 Style 上下文记录、用户要求采用的历史 Generation Run 输入、第 4 节取得的语义查询结果、Skill 执行者补充的内容。高优先级内容与低优先级内容冲突时，Skill 执行者保留高优先级内容。Character 上下文记录只提供 `character` 位置的角色 Prompt，Style 上下文记录只提供 `artist` 位置的画师 Prompt。Skill 执行者只补充前述来源均未提供的画面内容。

Skill 执行者从本轮输入中记录用户已经明确提供的以下内容：

- 主体数量以及每名主体的身份；
- 每名主体的动作、动作对象和主体关系；
- 景别、相机角度、POV、焦点、主体位置、遮挡和裁剪；
- 地点、时间、天气、前景、中景、背景以及主体与环境的空间关系；
- 画师、非画师风格、媒介效果、摄影效果、数字效果、画面情绪和光线；
- 用户指定的输出形式或生产用途。

## 2. 选择主场景和构图

Skill 执行者读取 [场景分支矩阵](references/composition-scenario-branches.md)，并从该文件列出的场景类型中选择最能容纳全部主体和主要动作的一种主场景。用户要求多个画格、前后变化、过程或状态对比时，Skill 执行者选择该文件中的分镜与状态变化场景。

用户要求下表左栏中的内容时，Skill 执行者读取右栏文件。一个请求符合多行条件时，Skill 执行者完整读取每个对应文件。Skill 执行者把每个文件规定的 Prompt 位置和应写入的画面内容列入本轮画面设计，并在第 3 节按照对应位置规则填写这些位置。

| 用户要求的内容 | 读取文件 |
|---|---|
| NTR 关系，或 NTR 场景中的介入方、被夺方、见证者或观看关系 | [NTR](references/cross-position-themes/NTR.md) |
| 束缚、BDSM、被束缚部位、束缚器具或支配关系 | [束缚与 BDSM](references/cross-position-themes/束缚与BDSM.md) |
| RBQ、物化、固定装置、公开使用或多人使用关系 | [RBQ 与物化](references/cross-position-themes/RBQ与物化.md) |
| 男娘或 Futa 的身份、身体特征、动作方向或主导关系 | [男娘与 Futa](references/cross-position-themes/男娘与Futa.md) |
| 非人主体、异种互动，或者异种互动中的体型差或主体数量差 | [异种](references/cross-position-themes/异种.md) |
| 调教、主人与宠物关系、服从表现、项圈、牵引或动物化姿态 | [调教与宠物](references/cross-position-themes/调教与宠物.md) |
| 胁迫关系、权力来源、胁迫手段、抗拒或屈服状态 | [胁迫](references/cross-position-themes/胁迫.md) |
| 偷窥、展示、观看者、被看者、观看渠道或发现状态 | [偷窥与展示](references/cross-position-themes/偷窥与展示.md) |
| 事后状态、残留痕迹、服装状态、清洗、离开或再次行动 | [事后](references/cross-position-themes/事后.md) |
| 日常任务与需要对场景内其他主体隐藏的身体状态或互动动作同时存在 | [另类日常](references/cross-position-themes/另类日常.md) |
| 通过裁剪、上下分区、介质遮挡、模拟其他媒介的画面或暗示性构图隐藏互动动作 | [隐奸](references/cross-position-themes/隐奸.md) |

Skill 执行者读取 [构图决策树](references/composition-decision-tree.md)，设计候选 A；候选 B 与候选 C 是否构造分别由下列条件决定：

- 候选 A 保留全部用户要求。用户要求彼此冲突时，Skill 执行者列出发生冲突的具体要求，请求用户选择，并在收到用户选择前停止本次执行。用户要求彼此不冲突时，候选 A 只补充景别、相机角度、POV、焦点、主体位置、前景、中景、背景、遮挡、裁剪、可见范围、景深和运动效果；候选 A 不增加新的主要主体、主要动作或主体关系。
- 用户没有指定景别、相机角度、POV、焦点或景深中的至少一项时，Skill 执行者构造候选 B。候选 B 保留候选 A 的其他内容，只改变其中一项用户未指定的镜头属性。用户已经指定全部五项镜头属性时，Skill 执行者不构造候选 B。
- 用户没有指定主体位置、前景、中景、背景、遮挡、裁剪或可见范围中的至少一项时，Skill 执行者构造候选 C。候选 C 保留候选 A 的其他内容，只改变其中一项用户未指定的空间属性。用户已经指定全部七项空间属性时，Skill 执行者不构造候选 C。

每个已经构造的候选必须确定景别、相机角度、POV、焦点、主体位置、前景、中景、背景、遮挡、裁剪、可见范围、景深和运动效果。分镜请求的每个候选必须包含全部画格。

Skill 执行者先淘汰镜头属性相互冲突、不能呈现全部主体和主要动作，或者主要视觉焦点不明确的候选，再按照候选 A、候选 B、候选 C 的顺序选择第一个已经构造且未被淘汰的候选。已经构造的候选全部被淘汰时，Skill 执行者读取主场景在 [场景分支矩阵](references/composition-scenario-branches.md) 中指定的示例，并按照候选 A、候选 B 和候选 C 的构造条件重新设计一次候选。重新设计的候选仍全部被淘汰时，Skill 执行者逐个报告每个候选因镜头冲突、主体或动作无法呈现、视觉焦点不明确而被淘汰的具体原因，请求用户修改造成这些问题的画面要求，然后停止本次执行。

## 3. 构造十五个 Prompt 位置

Skill 执行者读取 [画面设计检查顺序](references/visual-design-slot-order.md)，并按照该文件的顺序补全主体身份、外貌、服装、动作、表情、镜头、环境、画面细节、光线和主体关系。

画面包含姿态、动作、动作对象、身体接触、支撑关系或动作结果时，Skill 执行者读取 [动作结构](references/action-structure.md)。画面包含多名主体的相对位置、前中后景关系、上下关系、内外关系、遮挡关系或包含关系时，Skill 执行者读取 [空间关系规则](references/spatial-relation-rules.md)。画面包含多个画格、前后状态、时间变化或连续镜头时，Skill 执行者读取 [分镜规则](references/storyboard-panel-rules.md)。

Skill 执行者读取 [WAI Prompt 位置顺序与职责](references/wai-prompt-position-order.md)，把选定构图中的每项内容放入该文件规定的位置，并读取每个已使用位置在 [位置规则目录](references/prompt-position-rules/) 中的规则。

`relation_narrative` 只写入标签不能明确表达的动作归属、主体关系、空间关系、画格关系、时间关系或因果关系，并位于全部标签之后。

## 4. 查询缺少的角色、画师与风格效果 Prompt 内容

本轮需要查询角色 Prompt、画师 Prompt，或者普通画风、媒介效果、摄影效果或数字效果的 Prompt 词条时，Skill 执行者在第一次查询前完整读取 [Prompt 内容查询 CLI](references/semantic-tool-orchestration.md)，并按照该文件取得查询结果。Skill 执行者把采用的查询结果写入对应的 Prompt 位置。

## 5. 处理冲突、设计权重并自检

Skill 执行者读取 [Prompt 冲突规则](references/prompt-conflict-rules.md)，并按照第 1 节规定的来源优先级处理互斥内容：保留优先级较高的一项；同一优先级的内容互斥时，Skill 执行者报告具体冲突并请求用户选择，在收到用户选择前停止本次执行。对于重复或语义相同的 Prompt 内容，Skill 执行者只保留优先级最高的一项。

Skill 执行者完整读取 [权重结构化策略](references/prompt-weight-policy.json) 和 [Prompt 权重方法](references/prompt-weighting.md)，再为前十四个标签位置中的每项内容选择未加权、默认权重或显式权重形式。Skill 执行者只在此步骤添加一次权重外层。

Skill 执行者读取 [Prompt 自检](references/prompt-self-check.md)，并依次完成该文件规定的检查。第一次自检发现的问题需要用户在互斥要求之间作出选择时，Skill 执行者立即列出这些要求并请求用户选择，在收到选择前停止本次执行。其他问题由 Skill 执行者按照第 1 节的来源优先级修改可调整的内容和对应 Prompt 位置，并保持当前用户消息中的明确要求不变；修改后，Skill 执行者按照冲突处理、权重设计和自检的顺序重新执行本节一次。第二次自检仍发现问题时，Skill 执行者逐项报告未解决的问题及其对应的 Prompt 位置，然后停止本次执行。

## 6. 校验 Prompt 格式

Skill 执行者完整读取 [Prompt 格式校验器接口](references/prompt-format-validator.md)，并按照该文件处理校验结果。只有通过格式校验的 Prompt 才能进入第 7 节。

## 7. 构造并校验生成结果

Skill 执行者完整读取 `references/generation-output-contract.md`、`references/generation-output-schema.json` 和 `references/generation-profiles.json`，使用第 6 节通过格式校验的 Prompt 构造生成结果。

Skill 执行者按照 `references/generation-output-contract.md` 校验生成结果。校验成功时，Skill 执行者返回校验后的生成结果；校验结果不通过或校验入口调用失败时，Skill 执行者按照该文件处理。
