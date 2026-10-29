---
文档用途: 定义主场景选择、构图约束和对应的 WAI Prompt 位置。
读取时机: 区分输入来源并保留画面要求后，构建候选构图前。
---

# 场景分支矩阵

## 主场景选择

1. Skill 执行者按“主场景矩阵”的内容匹配条件识别已保留的画面要求。
2. 用户已指定主场景或画面重点时，Skill 执行者据此选择主场景。用户未指定时，Skill 执行者根据主要主体、主要动作和叙事目的选择主场景。
3. 多个矩阵行同时匹配时，Skill 执行者保留一个主场景。其余匹配行登记为次要约束。类别重叠不得作为请求用户选择的理由。
4. 只有必须由用户决定的画面内容无法依现有输入确定时，Skill 执行者才请求补充。请求必须列出缺失或冲突的具体画面内容，并说明需要用户决定的内容。收到回复前，Skill 执行者停止构建候选构图。

## 主场景矩阵

| 主场景 | 内容匹配条件 | 必须完成的 WAI Prompt 位置 | 检查项 | 必须读取的结构规则 | 候选构图不完整时的可选补充 |
|---|---|---|---|---|---|
| 单主体肖像 | 单幅画面只包含一名主体 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting` | 检查主体身份、外貌、服装、动作、表情、景别、视角、环境、细节氛围和光线是否分别进入对应位置，并检查这些内容是否共同突出同一主体 | 已保留内容包含主体动作或姿态时，读取[动作结构](action-structure.md) | 候选构图未明确景别、主体姿态或主体在环境中的位置时，可以读取[单主体肖像](examples/single-subject-portrait.md) |
| 双主体展示与互动 | 画面包含两名主体 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`；已保留内容包含二者关系、互动动作、共同目标、共享物件或物件交接时，还必须完成 `relation_narrative` | 检查两名主体的身份、外貌、服装、动作和表情是否分别归属正确。检查相对位置是否明确。检查景别、环境、细节氛围和光线是否支持已保留的画面要求；已保留内容包含互动动作时，检查动作的发出者、接受者和方向是否明确；已保留内容包含二者关系时，检查关系主体、关系类型以及 `relation_narrative` 中的关系描述是否明确；已保留内容包含共同目标、共享物件或物件交接时，分别检查目标、物件及其归属是否明确 | 已保留内容包含主体动作或姿态时，读取[动作结构](action-structure.md)；已保留内容包含主体相对位置、共享物件或物件交接时，读取[空间关系规则](spatial-relation-rules.md) | 已保留的互动动作缺少明确方向，或者已保留的共享物件缺少明确归属时，可以读取[双主体互动](examples/two-subject-interaction.md) |
| 动作展示 | 已保留画面要求包含攻击、施法、奔跑、舞蹈、冲击或其他具有可辨认运动过程、动作方向或空间位移的身体动作 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting` | 检查动作主体、动作类型、动作方向和镜头方向是否明确且相互一致；检查外貌、服装、表情、环境、细节氛围和光线是否与动作内容一致；已保留内容包含动作目标或支撑物时，分别检查动作目标或支撑物及其与动作主体的关系是否明确 | [动作结构](action-structure.md)；动作包含明确目标、支撑物或遮挡关系时，同时读取[空间关系规则](spatial-relation-rules.md) | 候选构图缺少动作方向或镜头方向，或者动作方向与镜头方向相互冲突时，可以读取[动作与镜头配合](examples/camera-action-pairing.md) |
| 多主体群像 | 三名或更多主体都具有需要辨认的位置、身份或动作 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`、`relation_narrative` | 检查主体数量，并逐一检查每名主体的身份、外貌、服装、动作、表情和空间位置是否归属明确；检查镜头构图、环境、细节氛围、光线和主体关系是否共同支持已保留的群像要求 | 已保留内容包含主体动作时，读取[动作结构](action-structure.md)；画面包含三名或更多主体时，读取[空间关系规则](spatial-relation-rules.md) | 候选构图中的身份、动作或空间位置仍无法归属到具体主体时，可以读取[多主体动作归属](examples/multi-subject-attribution.md) |
| NSFW | 已保留画面要求包含成人性行为、裸体状态下的身体接触或性姿态 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`；已保留内容包含多主体关系、身体接触关系或叙事关系时，还必须完成 `relation_narrative` | 检查每名参与主体的身份、外貌和服装状态是否明确；对已保留内容中出现的身体部位、动作、接触关系、相对位置和表情，逐项检查其是否归属于正确主体；检查镜头范围是否明确呈现用户要求的主体、身体部位和接触关系，并检查环境、细节氛围和光线是否与已保留要求一致；已保留内容包含多主体关系、身体接触关系或叙事关系时，检查 `relation_narrative` 中的对应关系是否明确 | 读取[动作结构](action-structure.md)；已保留内容包含多主体接触、主体相对位置或遮挡关系时，读取[空间关系规则](spatial-relation-rules.md) | 候选构图中的动作、身体部位或接触关系仍无法归属到具体参与主体时，可以读取[NSFW 动作结构](examples/nsfw-action-structure.md) |
| 遮挡与深度 | 已保留画面要求包含遮挡范围、裁剪边界、前景、中景、背景或可见部分中的至少一项 | `subject`、`camera_composition`、`environment` | 已保留内容包含遮挡关系时，检查哪个对象遮挡哪个对象；已保留内容包含可见部分时，检查被遮挡或被裁剪的对象仍有哪些部分可见；已保留内容包含裁剪边界时，检查裁剪边界截断哪个对象；已保留内容包含前景、中景或背景时，检查已指定的每个景深层级分别包含哪些对象 | 读取[空间关系规则](spatial-relation-rules.md) | 候选构图无法明确表达已保留的遮挡关系、裁剪边界或前景、中景、背景层级时，可以读取[遮挡与深度](examples/occlusion-and-depth.md) |
| 环境叙事 | 已保留画面要求包含地点、天气、建筑或空间尺度中的至少一项 | `camera_composition`、`environment`、`detail_mood`、`lighting` | 对已保留画面要求中出现的地点、天气、建筑和空间尺度逐项检查其是否进入对应位置，并检查细节氛围和光线是否与这些环境要求一致；画面包含主体时，检查主体位置和主体与环境的比例关系是否支持已保留的环境尺度与空间关系 | 环境包含主体相对位置、前景、中景、背景或遮挡时，读取[空间关系规则](spatial-relation-rules.md) | 候选构图无法明确表达已保留的主要地点、天气、建筑、空间尺度或主体与环境的比例关系时，可以读取[环境叙事](examples/environment-narrative.md) |
| 分镜与状态变化 | 画面要求明确包含多个画格，或者明确要求使用前后画格呈现变化、过程或状态对比 | `camera_composition`、`detail_mood`、`lighting`、`relation_narrative`；画格包含主体时还必须完成 `subject`；画格包含动作时还必须完成 `action` 和 `expression_reaction` | 检查画格数量、阅读顺序以及每格的时间或状态是否明确；画格包含主体时，检查每格的主体身份和归属是否明确；已保留内容包含前后变化、过程或状态对比时，检查对应画格之间的变化关系；画格包含动作时，检查每格的动作主体以及主体的表情或反应；已保留内容包含动作目标时，检查每格的动作目标；已保留内容包含动作结果时，检查每格的动作结果 | [分镜规则](storyboard-panel-rules.md)；画格包含动作时同时读取[动作结构](action-structure.md) | 候选构图缺少画格顺序，或者无法表达已保留的前后状态对应关系时，可以读取[前后状态分镜](examples/before-after-storyboard.md) |

## 构图约束与结构规则

1. Skill 执行者为候选构图和 WAI Prompt 的内容标明来源。来源采用和冲突处理按[正文第 1 节](../SKILL.md#1-读取本轮输入)执行。
2. Skill 执行者使用已保留的画面要求构建候选构图。候选构图必须满足主场景行的内容匹配条件，并包含全部次要约束。
3. Skill 执行者逐一核对主场景行的无条件位置和适用条件已成立的位置。各位置必须写入符合主场景的内容。执行者随后逐项核对该行的检查项。
4. Skill 执行者将次要约束写入[位置顺序与职责](wai-prompt-position-order.md)规定的位置。执行者只采用次要约束行中直接检查该约束内容的检查项。
5. Skill 执行者读取主场景行中无条件要求读取的结构规则。主场景和次要约束行中的条件成立时，执行者读取对应结构规则。
6. Skill 执行者按[位置顺序与职责](wai-prompt-position-order.md)确定最终位置及排列顺序。同一项内容需要进入多个位置时，执行者分别按各位置职责填写。
