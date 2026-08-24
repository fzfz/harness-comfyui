# WAI Prompt 位置顺序与职责

## 用途和读取时机

本文件是十五个 WAI Prompt 位置、固定顺序、唯一职责和位置选择方法的唯一来源。

Skill Agent 完成画面设计后，必须先完整读取本文件，再把画面内容映射到对应位置。Skill Agent 随后只读取本轮实际使用位置在 [位置规则目录](prompt-position-rules/) 中的规则。

## 固定顺序和唯一职责

| 顺序 | 位置 | 唯一职责 | 位置规则 |
|---:|---|---|---|
| 1 | `quality` | WAI 质量标签和用户明确要求的质量内容 | [quality](prompt-position-rules/quality.md) |
| 2 | `artist` | 被采用 Style 结果的具体画师提示词 | [artist](prompt-position-rules/artist.md) |
| 3 | `subject` | 主体数量、性别组合、主体类别和特殊身份类型 | [subject](prompt-position-rules/subject.md) |
| 4 | `character` | 被采用 Character 结果的角色 Prompt | [character](prompt-position-rules/character.md) |
| 5 | `appearance` | 每名主体的头发、眼睛、脸部、体型、肤色、标记和非人特征 | [appearance](prompt-position-rules/appearance.md) |
| 6 | `outfit` | 服装、材质、颜色、穿着状态、配饰和随身物件 | [outfit](prompt-position-rules/outfit.md) |
| 7 | `action` | 每名主体的姿态、动作、动作方向和身体朝向 | [action](prompt-position-rules/action.md) |
| 8 | `expression_reaction` | 每名主体的表情、视线和身体反应 | [expression_reaction](prompt-position-rules/expression-reaction.md) |
| 9 | `camera_composition` | 景别、相机角度、POV、画面布局、前中后景、裁剪、焦点、景深和遮挡 | [camera_composition](prompt-position-rules/camera-composition.md) |
| 10 | `environment` | 地点、空间结构、时间、季节、天气和环境对象 | [environment](prompt-position-rules/environment.md) |
| 11 | `detail_mood` | 媒介质感、摄影效果、数字效果、运动表现和整体画面情绪 | [detail_mood](prompt-position-rules/detail-mood.md) |
| 12 | `lighting` | 光源、阴影、色彩和对比度 | [lighting](prompt-position-rules/lighting.md) |
| 13 | `non_artist_style` | 非画师画风、媒介风格和其他描述性风格 Prompt | [non_artist_style](prompt-position-rules/non-artist-style.md) |
| 14 | `technical` | 用户明确要求的输出形态或生产用途 | [technical](prompt-position-rules/technical.md) |
| 15 | `relation_narrative` | 主体关系、动作归属、空间关系、画格关系和剧情补充英文短句 | [relation_narrative](prompt-position-rules/relation-narrative.md) |

`relation_narrative` 永远位于全部标签之后。

## Character 来源内容

`character` 默认使用被采用 Character 的完整 `prompt_text`。该来源内容可以包含主体数量、外貌或服装标签，Skill Agent 不为满足位置职责而拆分该来源内容。用户本轮修改角色外貌或服装时，Skill Agent 按照 [`character` 位置规则](prompt-position-rules/character.md)完成 `character`。

`subject` 仍然表达整幅画面的准确主体数量和主体类别。`subject` 的总量标签可以与 Character 来源内容中的单角色数量标签重复。

`appearance`、`outfit` 和其他位置不重复 Character 来源内容已经准确表达的内容，只补充当前画面的新增内容。

## 确定本轮位置集合

Skill Agent 必须按照以下顺序确定本轮使用的位置：

1. 加入当前主场景在[场景分支矩阵](composition-scenario-branches.md)中要求的全部位置。
2. 加入用户明确要求所涉及的位置。
3. 加入次要约束和已读取跨位置配方要求的位置。
4. 根据本轮实际内容加入 `quality`、`artist`、`character`、`non_artist_style` 和 `technical`。
5. 删除没有实际内容的位置；最终 Prompt 不保留空位置。

## 独立来源位置

- `quality` 由本 Skill 的 WAI 质量标签和用户明确质量要求决定。
- `artist` 在采用具体画师时加入；画师内容按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得。
- `character` 在采用具体角色时加入；角色内容按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得。
- `non_artist_style` 在画面需要普通画风或媒介风格时加入；其内容可以来自用户要求、按照语义查询接口文档采用的普通视觉概念或 Skill Agent 完成的普通画面风格设计。
- `technical` 只在用户明确要求输出形态或生产用途时加入。

Style、Character、Work 和 Prompt-term 的接口用途与字段用途由[语义查询接口与调用流程](semantic-tool-orchestration.md)统一规定，本文件不重复定义接口合同。

## 相邻位置边界

- `subject` 表达主体数量和类别；`character` 表达具体角色 Prompt；`appearance` 表达画面中实际可见的外貌。
- `action` 表达姿态、动作和身体朝向；`expression_reaction` 表达表情、视线和身体反应。
- `camera_composition` 表达相机、画面布局、焦点和景深；`background blur`、`shallow depth of field` 等景深效果进入 `camera_composition`。
- `detail_mood` 表达运动表现；`motion blur`、`speed lines`、残影、飞散碎屑和冲击波进入 `detail_mood`。
- `environment` 表达场景本身，不表达相机、景深或运动表现。
- `detail_mood` 不写入光源、阴影、色彩或对比度；这些内容只进入 `lighting`。
- `lighting` 不写入媒介质感、摄影效果、数字效果、运动表现或整体画面情绪；这些内容进入 `detail_mood`。
- `artist` 只使用具体画师 Prompt；普通画风和媒介风格进入 `non_artist_style`。
- `relation_narrative` 的必需主场景由[场景分支矩阵](composition-scenario-branches.md)规定；其他主场景的创建条件和全部句子规则由 [`relation_narrative` 位置规则](prompt-position-rules/relation-narrative.md)规定。

## 组合前检查

Skill Agent 必须确认：

- Skill Agent 新增的每项内容都进入唯一且正确的位置；
- 除 `subject` 的整幅画面总量标签外，Skill Agent 没有在 Character 来源内容以外重复写入该来源内容已经准确表达的内容；
- `subject` 表达整幅画面的准确主体总数；
- 所有位置都按照固定顺序排列；
- 没有实际内容的位置已经删除；
- `relation_narrative` 位于全部标签之后。
