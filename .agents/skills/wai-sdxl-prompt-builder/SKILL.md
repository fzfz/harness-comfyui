---
name: wai-sdxl-prompt-builder
description: 用户要求生成、改写、补全或检查 WAI-illustrious-SDXL 英文 Prompt 时使用。
---

# WAI-illustrious-SDXL 提示词构建器

## 查询历史 Generation Run

1. 当前 WAI Prompt 任务需要读取、核对或复用历史生成参数或 Actual Workflow 时，Skill 执行者使用用户提供的 `run_id` 查询。
2. 本分支首次使用受管 CLI 时，Skill 执行者通过受管前台 shell Tool Call 读取根帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help
   ```

3. 查询前，Skill 执行者读取命令帮助，再按帮助执行查询：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --help
   ```

4. 同一会话中，Skill 执行者可复用仍在上下文中的帮助。压缩后缺少操作依据时，重新读取本节或对应帮助。
5. Skill 执行者按 `runs[]` 顺序报告每个 `run_id` 的查询结果。单项查询失败时，继续处理其余结果。

### 选择历史 Prompt 文本

1. 用户要求使用查询结果构建 WAI Prompt 时，每项来源必须包含以下选择：

   1. `run_id`。
   2. `arguments.parameters` 中保存该文本的属性路径。
   3. 作为 Character Prompt 或 Style Prompt 的来源类型。
   4. 该来源对应的角色或画师。
   5. 从该属性值中采用的完整字符串、完整字符串数组元素，或用户明确指定的原文片段。

2. 用户可指定采用整个字符串。用户只采用字符串的一部分时，必须给出需要采用的完整原文。
3. Skill 执行者核对用户选择与成功查询结果。完整字符串或数组元素必须与对应值相同；原文片段必须完整出现在对应字符串中。Skill 执行者不得把用户未选择的正向 Prompt 拆分为角色 Prompt 或画师 Prompt。
4. 任一选择缺失、属性路径不存在、指定文本不一致，或同一角色或画师存在冲突历史来源时，Skill 执行者报告具体问题，并请求用户重新指定。收到选择前，停止 Prompt 构造。
5. 全部查询均失败时，Skill 执行者报告全部失败结果，并停止 Prompt 构造。
6. 查询既有成功项又有失败项时，Skill 执行者处理完全部结果，再请求用户选择是否仅使用成功结果。收到选择前，停止 Prompt 构造。
7. 用户已明确指定全部历史 Prompt 来源，且所需查询均成功或用户已选择只使用成功结果时，Skill 执行者继续执行第 1 至第 7 节。

## 1. 读取本轮输入

1. Skill 执行者完整读取 [当前轮输入合同](references/input-contract.md)，取得自然语言画面要求、材料型输入、Character 上下文记录和 Style 上下文记录。使用历史来源时，同时取得“查询历史 Generation Run”一节确定的文本。

2. 参考文件按当前步骤逐份读取。输出截断时，读取工具提供的完整文件或分段补读。使用的位置规则以正文链接为路径；路径不存在时，先列出对应参考目录并核对路径，再继续构造。

3. Skill 执行者按照以下优先级处理同一 Prompt 位置的内容：

   1. 当前用户消息中的明确要求。
   2. 用户指定材料中采用的事实。
   3. 当前消息中的 Character 或 Style 上下文记录。
   4. 用户要求采用的历史 Generation Run 输入。
   5. 第 4 节取得的语义查询结果。
   6. 人物设计与 Prompt 构造中的创作补充。

   高优先级内容与低优先级内容冲突时，保留高优先级内容。Character 上下文记录只提供 `character` 位置的角色 Prompt。Style 上下文记录按位置职责分配，具体画师 Prompt 进入 `artist`。

4. Skill 执行者从本轮输入中记录用户已经明确提供的以下内容：

   1. 主体数量以及每名主体的身份；
   2. 每名主体的动作、动作对象和主体关系；
   3. 景别、相机角度、POV、焦点、主体位置、遮挡和裁剪；
   4. 地点、时间、天气、前景、中景、背景以及主体与环境的空间关系；
   5. 画师、非画师风格、媒介效果、摄影效果、数字效果、画面情绪和光线；
   6. 用户指定的输出形式或生产用途。

## 2. 选择主场景和构图

1. Skill 执行者完整读取[场景分支矩阵](references/composition-scenario-branches.md)，并按该文件的“主场景选择”确定本轮主场景。

2. 用户要求下表左栏中的内容时，Skill 执行者读取右栏文件。一个请求符合多行条件时，Skill 执行者完整读取每个对应文件。Skill 执行者把每个文件规定的 Prompt 位置和规定写入的画面内容列入本轮画面设计，并在第 3 节按照对应位置规则填写这些位置。

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

3. Skill 执行者读取 [构图决策树](references/composition-decision-tree.md)，设计候选 A；候选 B 与候选 C 是否构造分别由下列条件决定：

   1. 候选 A 保留全部用户要求。用户要求彼此冲突时，Skill 执行者列出发生冲突的具体要求，请求用户选择，并在收到用户选择前停止本次执行。用户要求彼此不冲突时，候选 A 只补充景别、相机角度、POV、焦点、主体位置、前景、中景、背景、遮挡、裁剪、可见范围、景深和运动效果；候选 A 不增加新的主要主体、主要动作或主体关系。
   2. 用户没有指定景别、相机角度、POV、焦点或景深中的至少一项时，Skill 执行者构造候选 B。候选 B 保留候选 A 的其他内容，只改变其中一项用户未指定的镜头属性。用户已经指定全部五项镜头属性时，Skill 执行者不构造候选 B。
   3. 用户没有指定主体位置、前景、中景、背景、遮挡、裁剪或可见范围中的至少一项时，Skill 执行者构造候选 C。候选 C 保留候选 A 的其他内容，只改变其中一项用户未指定的空间属性。用户已经指定全部七项空间属性时，Skill 执行者不构造候选 C。

4. 每个已经构造的候选必须确定景别、相机角度、POV、焦点、主体位置、前景、中景、背景、遮挡、裁剪、可见范围、景深和运动效果。分镜请求的每个候选必须包含全部画格。

5. Skill 执行者按以下步骤选择候选：

   1. 淘汰镜头属性冲突、不能呈现全部主体和主要动作，或主要视觉焦点不明确的候选。
   2. 按候选 A、候选 B、候选 C 的顺序，采用首个已经构造且未被淘汰的候选。
   3. 全部候选被淘汰时，读取主场景在 [场景分支矩阵](references/composition-scenario-branches.md) 中指定的示例，再按“2. 选择主场景和构图”第 3 项的条件重新设计一次候选。
   4. 重新设计后仍无可用候选时，逐项报告每个候选被淘汰的具体原因。请求用户修改对应画面要求，并停止执行。

## 3. 构造十五个 Prompt 位置

1. Skill 执行者读取 [画面设计检查顺序](references/visual-design-slot-order.md)，并按照该文件的顺序补全主体身份、外貌、服装、动作、表情、镜头、环境、画面细节、光线和主体关系。

2. 画面包含姿态、动作、动作对象、身体接触、支撑关系或动作结果时，Skill 执行者读取 [动作结构](references/action-structure.md)。画面包含多名主体的相对位置、前中后景关系、上下关系、内外关系、遮挡关系或包含关系时，Skill 执行者读取 [空间关系规则](references/spatial-relation-rules.md)。画面包含多个画格、前后状态、时间变化或连续镜头时，Skill 执行者读取 [分镜规则](references/storyboard-panel-rules.md)。

3. Skill 执行者读取 [WAI Prompt 位置顺序与职责](references/wai-prompt-position-order.md)，把选定构图中的每项内容放入该文件规定的位置，并读取每个已使用位置在 [位置规则目录](references/prompt-position-rules/) 中的规则。

4. `relation_narrative` 只写入标签不能明确表达的动作归属、主体关系、空间关系、画格关系、时间关系或因果关系，并位于全部标签之后。

## 4. 查询缺少的角色、画师与风格效果 Prompt 内容

1. 本轮需要目录中的作品、角色、画师或视觉概念标签时，Skill 执行者通过 NoobAI MCP 获取素材。角色查询条件与候选选择按 `references/prompt-position-rules/character.md`，画师选择按 `references/artist-adoption.md`，词条采用按本节“词条采用”执行。

### 词条采用

1. Skill 执行者按目标概念比较词条的规范标签与别名。只有一项符合时采用该项；多个候选表达相同含义时，按使用数量从大到小、ID 从小到大采用第一项；候选含义不同且 Skill 执行者无法根据用户要求确定唯一候选时，Skill 执行者报告候选标识、规范标签和别名，并等待用户选择。
2. 没有可采用词条时，Skill 执行者把用户描述该概念的文字改写为一个不含逗号的英文小写短语。
3. Skill 执行者按 `references/wai-prompt-position-order.md` 的“固定顺序和唯一职责”表，将选中的规范标签或英文短语写入唯一职责包含该概念的位置。

## 5. 处理冲突、设计权重并自检

1. 读取 [Prompt 冲突规则](references/prompt-conflict-rules.md)，按“冲突判断和来源优先级”及当前冲突类型的要求处理内容。

2. Skill 执行者完整读取 [权重结构化策略](references/prompt-weight-policy.json) 和 [Prompt 权重方法](references/prompt-weighting.md)，再为前十四个标签位置中的每项内容选择未加权、默认权重或显式权重形式。Skill 执行者只在此步骤添加一次权重外层。

3. Skill 执行者按以下步骤自检：

   1. 读取 [Prompt 自检](references/prompt-self-check.md)，并依次完成该文件规定的检查。
   2. 自检发现互斥内容时，按 [冲突判断和来源优先级](references/prompt-conflict-rules.md#冲突判断和来源优先级)处理。
   3. 其他问题按第 1 节的来源优先级修改可调整的内容和对应 Prompt 位置，并保留当前用户消息中的明确要求。
   4. 修改后，按冲突处理、权重设计、自检的顺序重新执行本节一次。
   5. 第二次自检仍发现问题时，逐项报告未解决的问题及对应 Prompt 位置，并停止执行。

## 6. 校验 Prompt 格式

1. 构造格式校验输入前，Skill 执行者从本 Skill 目录读取校验器根帮助，再读取当前模式帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --prompt-format --help
   ```

2. 同一会话中可复用仍在上下文中的帮助。压缩后缺少操作依据时，重新读取对应帮助。Skill 执行者按帮助构造输入，以单行中文概括当前画面并写入 `display_text`，再校验 Prompt。
3. 只有通过格式校验的 Prompt 才能进入第 7 节。

## 7. 构造并校验生成结果

1. Skill 执行者读取 `references/generation-output-contract.md` 和 `references/generation-profiles.json`，采用第 6 节通过格式校验的 Prompt。
2. 构造生成结果前，Skill 执行者从本 Skill 目录读取当前模式帮助，并按帮助构造和校验生成结果：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --generation-output --help
   ```

   帮助复用按第 6 节第 2 项处理。校验成功后，Skill 执行者返回校验后的生成结果。
