# 场景分支矩阵

## 用途和读取时机

本文件负责选择本轮唯一主场景，确定该主场景必须完成的 WAI Prompt 位置，并指定后续需要读取的结构规则和完整场景示例。

本文件使用的 UI 明确选择由 [当前轮输入合同](input-contract.md)定义。

Skill Agent 完成用户要求整理后、生成三个候选构图前读取本文件。选定主场景后，把其他同时成立的画面目的登记为次要约束。

## 主场景选择

Skill Agent 根据画面主要展示的内容选择主场景：

- 用户明确说明画面目的时，按照该目的选择。
- 用户要求多个画格、前后变化、过程或状态对比时，选择“分镜与状态变化”。
- 两名主体共同出现时，画面主要展示主体关系、交接、共同目标或共享物件，选择“双主体互动”；画面主要展示攻击、施法、奔跑、舞蹈、冲击或其他动作路径，选择“动作展示”。
- 三名以上主体都具有需要辨认的位置、身份或动作时，选择“多主体群像”。
- 地点、天气、建筑或空间尺度承担主要画面内容时，选择“环境叙事”。
- 遮挡范围、裁剪边界、前中后景或可见部分承担主要画面内容时，选择“遮挡与深度”。
- 单幅画面中的状态变化作为次要约束，主场景仍由该画面的主体关系、动作、环境或镜头目的决定。

## 主场景、必须位置和后续文档

| 主场景 | 必须完成的 WAI Prompt 位置 | 后续读取的结构规则 | 候选构图仍不完整时读取的示例 |
|---|---|---|---|
| 单主体肖像 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting` | [动作结构](action-structure.md) | [单主体肖像](examples/single-subject-portrait.md) |
| 双主体互动 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`、`relation_narrative` | [动作结构](action-structure.md)、[空间关系规则](spatial-relation-rules.md) | [双主体互动](examples/two-subject-interaction.md) |
| 动作展示 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting` | [动作结构](action-structure.md)；动作包含明确目标、支撑或遮挡时同时读取[空间关系规则](spatial-relation-rules.md) | [动作与镜头配合](examples/camera-action-pairing.md) |
| 多主体群像 | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`、`relation_narrative` | [动作结构](action-structure.md)、[空间关系规则](spatial-relation-rules.md) | [多主体动作归属](examples/multi-subject-attribution.md) |
| NSFW | `subject`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`、`relation_narrative` | [动作结构](action-structure.md)、[空间关系规则](spatial-relation-rules.md) | [NSFW 动作结构](examples/nsfw-action-structure.md) |
| 遮挡与深度 | `subject`、`camera_composition`、`environment` | [空间关系规则](spatial-relation-rules.md) | [遮挡与深度](examples/occlusion-and-depth.md) |
| 环境叙事 | `camera_composition`、`environment`、`detail_mood`、`lighting` | 环境包含主体相对位置、前中后景或遮挡时读取[空间关系规则](spatial-relation-rules.md) | [环境叙事](examples/environment-narrative.md) |
| 分镜与状态变化 | `camera_composition`、`detail_mood`、`lighting`、`relation_narrative` | [分镜规则](storyboard-panel-rules.md)；画格包含动作时同时读取[动作结构](action-structure.md) | [前后状态分镜](examples/before-after-storyboard.md) |

## 次要约束和新增位置

主场景决定整幅画面的主要镜头方向和上表中的必须位置。次要约束保留已经选定的主场景和构图，只把次要画面目的需要表达的内容加入对应 WAI Prompt 位置。

用户明确要求和已经读取的跨位置配方按照各自内容加入对应位置。`quality`、`artist`、`character`、`non_artist_style` 和 `technical` 根据用户要求、UI 已选内容和语义查询采用结果加入。

最终使用的位置集合由 [WAI Prompt 位置顺序与职责](wai-prompt-position-order.md)统一确定。
