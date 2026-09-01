# WAI Prompt 权重方法

## 用途和读取时机

本文件规定 Skill Agent 如何为 WAI 前十四个 tag 位置选择未加权、默认权重或显式权重形式。Skill Agent 每次构建 Prompt 时必须先完整读取 `prompt-weight-policy.json`，再读取本文件。

Skill Agent 完成位置内容、删除互斥内容和重复内容后应用本文件，然后执行 `prompt-self-check.md`。位置顺序只负责内容分类和最终排列；权重外层负责改变单个 payload 的条件强度。

## 权重来源优先级

Skill Agent 按以下顺序确定一个 payload 的权重形式：

1. 用户明确提供的合法显式数值权重；
2. UI Style、语义 Style 或 Character 来源中的合法默认权重或显式数值权重；
3. 用户明确指定的主要或辅助作用；
4. 选定构图中需要强调的主视觉锚点；
5. 没有以上来源时使用未加权 payload。

用户或合法来源提供的显式数值符合 `syntax.explicit_weight` 时，Skill Agent 逐字符保留该数值，不执行截断或格式化。Skill Agent 自主设计权重时，辅助内容读取 `recommendations.levels.deemphasis`，轻度优先内容或主要画师读取 `recommendations.levels.light`，主视觉锚点读取 `recommendations.levels.primary`，用户明确要求强强调并且冲突检查通过时读取 `recommendations.levels.strong`。

## 设计步骤

1. Skill Agent 先按十五位置职责写出完整 payload，记录用户权重、合法 UI Style、语义 Style 或 Character 来源形式和合法 weight 原文，并按位置顺序排列。
2. Skill Agent 删除互斥 payload、重复 payload 和表达同一视觉决定的同义 payload；一个 payload 被保留时，同时保留来源优先级最高的权重记录。
3. Skill Agent 标记用户优先内容、主要或辅助画师、核心动作、核心身份和主构图锚点。
4. Skill Agent 统计除用户明确提供权重以外的全部高于中性强度的视觉决定，统计范围包括合法 UI Style、语义 Style、Character 来源权重和自主设计权重。该数量不得超过 `recommendations.maximum_boosted_decisions`；只有用户明确提供的额外权重不计入该数量。
5. Skill Agent 遍历每个被保留 payload，依次判断用户合法显式权重、合法 UI Style、语义 Style 或 Character 来源形式、主要或辅助作用和主视觉锚点。Skill Agent 采用最先成立的来源生成一层最终权重外层；以上来源均不存在的 payload 保持未加权。
6. Skill Agent 重新检查同一 payload 的加权与未加权副本、同义加权 payload、嵌套权重和位置冲突。

一个数组元素只使用一种形式：`payload`、`(payload)` 或 `(payload:weight)`。这里的 `payload` 和 `weight` 是格式占位符，不是最终 Prompt 文本。Skill Agent 不使用权重掩盖互斥内容，也不通过重复或同义加权叠加强度。

## 位置规则

| 位置 | 权重设计规则 |
| --- | --- |
| `quality` | `recommendations.unweighted_quality.content` 中的默认质量段保持未加权。只有用户新增并明确要求强调的质量 payload 才能加权。 |
| `artist` | 中性画师使用未加权 payload。用户或来源权重按来源优先级保留；主要画师读取 `recommendations.levels.light`，辅助画师读取 `recommendations.levels.deemphasis`。 |
| `subject` | 主体数量或类别是用户主目标并且会与复杂画面内容竞争时，可以加权一个 payload。 |
| `character` | 一个 Character 来源 payload 可以整体加权；同一 Character 来源不能拆成多个同义加权副本。 |
| `appearance` | 只加权决定角色识别或用户明确要求的一个外貌锚点。 |
| `outfit` | 只加权决定主题的服装或穿着状态。 |
| `action` | 核心动作可以成为主视觉锚点；局部辅助动作保持未加权。 |
| `expression_reaction` | 只加权主表情、主视线或关键反应中的一项。 |
| `camera_composition` | 只加权决定选定构图的景别、POV、焦点或布局。 |
| `environment` | 环境是主叙事对象时可以加权一个环境 payload。 |
| `detail_mood` | 只加权决定整体观感的一个媒介、摄影、数字或运动效果。 |
| `lighting` | 只加权决定主焦点和空间层次的主光或对比关系。 |
| `non_artist_style` | 只加权用户明确要求或完整画面设计采用的主要普通画风。 |
| `technical` | 用户把输出形态本身作为主目标时可以加权一个 payload；其他技术内容保持未加权。 |
| `relation_narrative` | 该位置保存关系文本，不使用 tag 权重外层。需要强调的视觉内容进入承担该职责的 tag 位置。 |

## 完成条件

Skill Agent 确认权重来源可追溯、默认质量段未加权、除用户明确提供权重以外的高于中性强度决定总数没有超过 `recommendations.maximum_boosted_decisions`、每个元素只有一层外层、关系文本没有权重外层时，进入 Prompt 自检。
