# ANIMA 槽位权重方法

## 用途和读取时机

本文件规定 Skill 执行者如何为 ANIMA tag 选择未加权、默认权重或显式权重形式。Skill 执行者每次构建 Prompt 时必须先完整读取 `prompt-weight-policy.json`，再读取本文件。

Skill 执行者完成槽位内容、删除互斥内容和重复内容后应用本文件，然后执行 `04-final-self-check.md`。槽位顺序只负责内容分类和最终排列；权重外层负责改变单个 payload 的条件强度。

## 权重来源优先级

Skill 执行者按以下顺序确定一个 payload 的权重形式：

1. 用户明确提供的合法显式数值权重；
2. 当前消息 `comfyui-context` 中 Style 上下文记录提供的合法默认权重或显式数值权重；
3. Skill 执行者采用的 Style Search 或 Resolve 结果提供的合法默认权重或显式数值权重；
4. 用户明确指定的主要或辅助作用；
5. 选定构图中需要强调的主视觉锚点；
6. 没有以上来源时使用未加权 payload。

用户、Style 上下文记录或已采用的 Style Search 或 Resolve 结果提供的显式数值符合 `syntax.explicit_weight` 时，Skill 执行者逐字符保留该数值，不执行截断或格式化。Skill 执行者自主设计权重时，辅助内容读取 `recommendations.levels.deemphasis`，主要内容读取 `recommendations.levels.medium`，选定构图只有一个主视觉锚点并且需要强强调时读取 `recommendations.levels.strong`。

## 设计步骤

1. Skill 执行者先按十二槽职责写出完整 payload，记录用户提供的权重、Style 上下文记录提供的合法权重和已采用的 Style Search 或 Resolve 结果提供的合法权重；对于显式数值权重，Skill 执行者同时记录对应的 weight 原文，然后按槽位顺序排列。
2. Skill 执行者删除互斥 payload、重复 payload 和表达同一视觉决定的同义 payload；一个 payload 被保留时，同时保留来源优先级最高的权重记录。
3. Skill 执行者标记用户优先内容、主要或辅助画师、核心动作、核心身份和主构图锚点。
4. Skill 执行者统计除用户明确提供权重以外，最终使用 `(payload)`，或者最终使用 `(payload:weight)` 且 `weight > 1` 的视觉决定。统计范围包括 Style 上下文记录提供的权重、已采用的 Style Search 或 Resolve 结果提供的权重和自主设计权重。该数量不得超过 `recommendations.maximum_boosted_decisions`。
5. Skill 执行者遍历每个被保留 payload，依次判断用户合法显式权重、Style 上下文记录提供的合法权重、已采用的 Style Search 或 Resolve 结果提供的合法权重、主要或辅助作用和主视觉锚点。Skill 执行者采用最先成立的来源生成一层最终权重外层；以上来源均不存在的 payload 保持未加权。
6. Skill 执行者重新检查同一 payload 的加权与未加权副本、同义加权 payload、嵌套权重和槽位冲突。

每个 tag 槽位中的数组元素只使用一种形式：`payload`、`(payload)` 或 `(payload:weight)`。这里的 `payload` 和 `weight` 是格式占位符，不是最终 Prompt 文本。

## 槽位规则

| 槽位 | 权重设计规则 |
| --- | --- |
| `quality` | `recommendations.unweighted_quality.content` 中的固定前缀保持未加权。只有用户新增并明确要求强调的质量 payload 才能加权。 |
| `artist_style` | 权重来源优先级第 1 至 5 项均不适用的画师使用未加权 `@payload`。用户、Style 上下文记录或已采用的 Style Search 或 Resolve 结果提供的权重按来源优先级保留；主要画师读取 `recommendations.levels.medium`，辅助画师读取 `recommendations.levels.deemphasis`，唯一主画师需要强强调时读取 `recommendations.levels.strong`。 |
| `count_gender` | 当用户明确把主体数量或主体类别指定为主要内容时，可以加权一个对应 payload；其他主体数量与主体类别 payload 保持未加权。 |
| `character_series` | 具体角色或系列身份决定画面识别时，可以加权一个身份 payload。 |
| `appearance` | 只加权决定角色识别或用户明确要求的一个外貌锚点。 |
| `clothing_state` | 只加权用户明确指定为画面主题的一项服装或穿着状态；描述同一项服装或穿着状态的材质 payload、服装名称 payload 和穿着状态 payload 不得分别加权。 |
| `pose_action_sex` | 核心动作或姿势可以成为主视觉锚点；辅助动作保持未加权。 |
| `expression_reaction` | 用户明确要求的主表情或关键身体反应可以加权一个 payload。 |
| `camera_shot` | 构图依赖的景别、POV、角度或焦点可以加权一个 payload。 |
| `scene_environment` | 场所本身是主叙事对象时可以加权一个环境 payload；普通背景保持未加权。 |
| `detail_mood` | 决定整体媒介质感或观感的一个核心效果可以加权。 |
| `natural_language` | 该槽位保存关系文本，不使用 tag 权重外层。需要强调的视觉内容进入承担该职责的 tag 槽位。 |

## 完成条件

Skill 执行者确认权重来源可追溯、固定质量前缀未加权、除用户明确提供权重以外最终使用 `(payload)` 或最终使用 `(payload:weight)` 且 `weight > 1` 的决定总数没有超过 `recommendations.maximum_boosted_decisions`、每个加权 tag 槽位数组元素只有一层权重外层、未加权 tag 槽位数组元素没有权重外层、关系文本没有权重外层时，进入最终自检。
