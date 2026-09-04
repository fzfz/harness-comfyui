# WAI Prompt 权重规则

## 用途和执行顺序

本文件规定 Skill 执行者如何为 WAI Prompt 选择未加权、默认权重或显式数值权重形式。

Skill 执行者先完整读取 `prompt-weight-policy.json`。Prompt 内容所属的数组位置确定后，Skill 执行者按照本文件为 `quality`、`artist`、`subject`、`character`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`、`non_artist_style` 和 `technical` 中的每个数组元素选择一种权重形式。`relation_narrative` 中的关系文字不使用权重外层。

## 权重形式和解析

每个数组元素使用以下一种完整文本形式：

```text
payload
(payload)
(payload:weight)
```

`payload` 是数组元素的内容文本。`payload` 表示未加权形式；`(payload)` 表示默认权重形式，其数值由 `prompt-weight-policy.json` 的 `syntax.default_parenthesized_weight` 定义；`(payload:weight)` 表示显式数值权重形式，`weight` 必须符合该文件的 `syntax.explicit_weight`。

Skill 执行者按照以下顺序解析需要参加权重选择的完整文本：

1. 文本以 `(` 开头且以未转义的 `)` 结尾时，这两个字符构成覆盖全文的权重外层。文本只满足其中一个条件时，该文本不符合权重形式。
2. 文本没有权重外层时，Skill 执行者按照 `syntax.payload` 检查完整文本，并把它记录为未加权 `payload`。
3. 文本具有权重外层时，Skill 执行者从左到右扫描括号内文本。当前字符等于 `syntax.payload.escape_character` 且下一个字符属于 `syntax.payload.escapable_characters` 时，Skill 执行者把这两个字符作为一个转义对，并从转义对后的字符继续扫描。
4. 括号内没有未转义冒号时，Skill 执行者按照 `syntax.payload` 检查括号内文本，并把它记录为默认权重形式 `(payload)`。
5. 括号内只有一个未转义冒号时，该冒号左侧是 `payload`，右侧是 `weight`。Skill 执行者按照 `syntax.payload` 检查 `payload`，按照 `syntax.explicit_weight` 检查 `weight`，并保留 `weight` 的原始文本。
6. 括号内的未转义冒号数量不是 `0` 或 `1`，该数量超过 `syntax.payload.maximum_unescaped_colons_inside_wrapper`，括号内包含 `syntax.payload.reject_unescaped_delimiters_inside_wrapper` 列出的未转义字符、未知转义，或括号内文本以转义字符结尾时，该文本不符合权重形式。

任一需要参加权重选择的完整文本不符合本节第 1 至第 6 项解析规则时，Skill 执行者报告该完整文本所属的 Prompt 位置、内容来源、完整文本和具体违规项，并按照该完整文本所属类别执行“用户直接形式和用户确认形式”或“来源权重形式”一节规定的用户确认步骤。用户回复前，Skill 执行者停止本次 Prompt 构造。

## 固定未加权质量内容

`quality` 中与 `prompt-weight-policy.json` 的 `recommendations.unweighted_quality.content` 任一字符串相同的 `payload` 使用未加权形式。Skill 执行者只检查当前 Prompt 位置中该 `payload` 的用户直接形式、用户确认形式，以及按照“来源权重形式”一节实际采用的最高优先级来源形式；较低优先级、未采用或已经被用户确认排除的形式不参与本节判断。参加判断的形式为默认权重或显式数值权重时，Skill 执行者报告该 `payload` 必须保持未加权，并等待用户接受未加权形式或改用其他质量内容；用户回复前停止本次 Prompt 构造。用户接受未加权形式后，Skill 执行者把未加权 `payload` 记录为当前 Prompt 位置中该 `payload` 的唯一用户确认形式，并排除同一 Prompt 位置中该 `payload` 的全部默认权重和显式数值权重形式。用户改用其他质量内容后，Skill 执行者从 `quality` 中删除原 `payload`，并按照本文件处理用户提供的新质量内容。

## 用户直接形式和用户确认形式

用户直接形式只来自当前用户消息中由用户直接提出的权重要求，不包括该消息携带的 Character 上下文记录或 Style 上下文记录。用户直接形式包括以下三种情况：

1. 用户在当前用户消息中明确要求某个 `payload` 保持未加权。用户只写出未加权 `payload` 而没有说明保持未加权时，该文本不构成用户直接未加权形式。
2. 用户在当前用户消息中直接写出 `(payload)`。
3. 用户在当前用户消息中直接写出符合 `prompt-weight-policy.json` 的 `syntax.explicit_weight` 的 `(payload:weight)`。

权重选择以“Prompt 位置和解析后的 `payload`”为一个处理对象。用户直接要求明确指定 Prompt 位置时，该要求只作用于指定位置；用户没有指定 Prompt 位置时，该要求分别作用于最终 Prompt 中出现该 `payload` 的每个位置。用户为同一 Prompt 位置中的同一 `payload` 提供的全部用户直接形式按字符比较后相同时，Skill 执行者保留一个形式。用户为同一 Prompt 位置中的同一 `payload` 提供两个或更多按字符比较后不同的用户直接形式时，Skill 执行者列出这些形式和对应 Prompt 位置并等待用户选择；用户回复前停止本次 Prompt 构造。

当前用户消息中用于指定某个 `payload` 权重形式的完整文本不符合“权重形式和解析”一节时，Skill 执行者报告该完整文本、能够从中识别的 `payload` 或 `weight` 原文以及具体违规项，并等待用户提供符合解析规则的新完整文本，或明确写出合法 `payload` 并要求该 `payload` 保持未加权；用户回复前停止本次 Prompt 构造。

用户在解决当前 Prompt 位置中同一 `payload` 的用户直接形式冲突或来源权重形式冲突时，从 Skill 执行者为该 Prompt 位置列出的合法形式中选择一项。Skill 执行者把该项作为当前 Prompt 位置中该 `payload` 唯一参加权重选择的用户确认形式，并保留该项原来的权重来源类别；当前 Prompt 位置中该 `payload` 的其他用户直接形式和来源形式不再参加权重选择。用户在解决上述冲突时直接提供一个新的未加权要求、合法 `(payload)` 或合法 `(payload:weight)`，Skill 执行者把该项作为当前 Prompt 位置中该 `payload` 唯一参加权重选择的用户确认形式，并把该项的权重来源类别记录为用户确认形式；当前 Prompt 位置中该 `payload` 的其他用户直接形式和来源形式不再参加权重选择。

## 来源权重形式

本节中的当前 `payload` 指当前 Prompt 位置中解析后的 `payload`；Skill 执行者分别为每个 Prompt 位置执行来源查找和优先级裁决。当前 Prompt 位置中该 `payload` 的用户直接形式和用户确认形式均不存在时，Skill 执行者按照以下优先级查找该位置中该 `payload` 的来源权重：

1. 当前用户消息中 Character 上下文记录或 Style 上下文记录的 `data.prompt_text`。
2. 用户指定采用的历史 Generation Run 输入中已经写入当前 Prompt 位置的完整文本。
3. 已采用的 Character 查询结果或 Style 查询结果的 `prompt_text`。

Skill 执行者一次只处理当前最高优先级中用于当前 `payload` 的全部来源完整文本。Skill 执行者先按照“权重形式和解析”一节检查每个来源完整文本；任一来源完整文本不合法时，Skill 执行者执行本节的非法来源文本规则，并停止检查当前 `payload` 的后续优先级。全部来源完整文本合法时，Skill 执行者忽略合法的未加权 `payload`，因为未加权 `payload` 不提供来源权重；当前优先级没有留下默认权重或合法显式数值权重时，Skill 执行者继续检查下一优先级。

当前优先级只有一个默认权重或合法显式数值权重时，Skill 执行者采用该形式。当前优先级包含两个或更多权重形式且这些形式按字符比较后相同时，Skill 执行者保留一个形式。当前优先级包含按字符比较后不同的权重形式时，Skill 执行者列出每个内容来源和完整形式，并等待用户选择；用户回复前停止本次 Prompt 构造。

当前优先级的任一来源完整文本不符合“权重形式和解析”一节时，Skill 执行者报告该完整文本所属的 Prompt 位置、内容来源、完整文本和具体违规项。当前优先级存在合法默认权重形式或合法显式数值权重形式时，Skill 执行者列出这些来源权重形式，并等待用户选择一项或提供新的合法形式；当前优先级不存在合法默认权重形式和合法显式数值权重形式时，Skill 执行者等待用户提供新的合法形式。用户选择现有来源权重形式时，该形式保留原来的权重来源类别；用户提供新的合法形式时，该形式成为用户确认形式。用户回复前，Skill 执行者停止本次 Prompt 构造。

某一优先级已经提供采用的来源权重后，Skill 执行者不再检查当前 `payload` 的更低优先级来源。全部三个优先级均未提供来源权重时，Skill 执行者执行“自主权重角色”。

## 自主权重角色

用户直接形式、用户确认形式和来源权重均不存在，并且“十五个位置的自主权重”表要求当前 `payload` 按“自主权重角色”处理时，Skill 执行者按照下表从上到下选择第一个符合条件的自主权重角色。

| 自主权重角色 | 判定条件 | 最终形式 |
|---|---|---|
| 强强调内容 | 用户明确要求该 `payload` 使用最强、最高或极强强调，但没有提供权重形式 | 使用 `prompt-weight-policy.json` 的 `recommendations.levels.strong` 生成 `(payload:weight)` |
| 唯一主视觉内容 | 按“唯一主视觉内容”一节选中的一个 `payload` | 使用 `prompt-weight-policy.json` 的 `recommendations.levels.primary` 生成 `(payload:weight)` |
| 轻度强调内容 | 用户明确要求突出或强调该 `payload`，但没有要求强强调 | 使用 `prompt-weight-policy.json` 的 `recommendations.levels.light` 生成 `(payload:weight)` |
| 主要画师 | [画师采用规则](artist-adoption.md)确定的主要画师 | 使用 `prompt-weight-policy.json` 的 `recommendations.levels.light` 生成 `(payload:weight)` |
| 辅助画师 | [画师采用规则](artist-adoption.md)确定的辅助画师 | 使用 `prompt-weight-policy.json` 的 `recommendations.levels.deemphasis` 生成 `(payload:weight)` |
| 中性画师 | [画师采用规则](artist-adoption.md)确定的中性画师 | 使用未加权 `payload` |
| 中性内容 | 不符合以上任一条件的其他 `payload` | 使用未加权 `payload` |

### 唯一主视觉内容

用户明确指定一个 `payload` 为画面唯一焦点、唯一主体重点或唯一构图重点时，Skill 执行者把该 `payload` 设为唯一主视觉内容。用户把两个或更多不同 `payload` 指定为唯一主视觉内容时，Skill 执行者列出这些 `payload` 并等待用户选择一个；用户回复前停止本次 Prompt 构造。

用户没有指定唯一主视觉内容时，Skill 执行者只检查当前用户消息中使用“视觉中心”“构图中心”或“画面中心”并明确指向一个主体或环境对象的要求。全部此类要求只指向一个主体或环境对象，并且最终 Prompt 只有一个 `payload` 直接表达该对象是相应中心时，Skill 执行者把该 `payload` 设为唯一主视觉内容。没有此类要求、要求指向不同对象或有多个 `payload` 直接表达同一中心时，本次 Prompt 不设置唯一主视觉内容。

## 十五个位置的自主权重

下表只适用于用户直接形式、用户确认形式和来源权重均不存在的 `payload`。

| Prompt 位置 | 自主权重处理 |
|---|---|
| `quality` | 与 `recommendations.unweighted_quality.content` 中任一字符串相同的 `payload` 按“固定未加权质量内容”处理；其余 `quality` 数组元素按“自主权重角色”处理。 |
| `artist` | Skill 执行者按照“自主权重角色”表从上到下为每个 `artist` 数组元素选择第一个符合条件的角色，并应用该角色规定的最终形式。 |
| `subject` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `character` | Skill 执行者把 `character` 数组中的每个数组元素作为一个完整 `payload`，按照“自主权重角色”表从上到下选择第一个符合条件的角色，并应用该角色规定的最终形式。 |
| `appearance` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `outfit` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `action` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `expression_reaction` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `camera_composition` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `environment` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `detail_mood` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `lighting` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `non_artist_style` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `technical` | 唯一主视觉内容、强强调内容或轻度强调内容按对应角色处理；其他 `payload` 保持未加权。 |
| `relation_narrative` | Skill 执行者保留关系文字，不添加 `(payload)` 或 `(payload:weight)` 外层。 |

## 生成最终形式和删除重复项

Skill 执行者从未加权 `payload` 重新生成一次选定形式：未加权形式写为 `payload`，默认权重形式写为 `(payload)`，显式数值权重形式写为 `(payload:weight)`。每个数组元素最多包含一层权重外层。

Skill 执行者分别在前十四个 Prompt 位置内按照解析后的 `payload` 合并重复数组元素，并且只保留该 `payload` 的一个选定最终形式。同一 `payload` 出现在不同 Prompt 位置时，各位置分别保留一个选定最终形式。

## 高于中性强度的数量

Skill 执行者按照 Prompt 位置统计最终形式高于中性强度的数组元素，并按照下一段规定的权重来源类别决定显式数值权重是否计入。每个计入的数组元素计一次，同一 `payload` 出现在不同 Prompt 位置时分别计数。`(payload)` 的 `syntax.default_parenthesized_weight` 大于 `1` 时计入；未被下一段排除的 `(payload:weight)` 在数值 `weight` 大于 `1` 时计入；未加权 `payload` 和数值 `weight` 小于或等于 `1` 的显式数值权重不计入。

权重来源类别为用户直接形式的合法 `(payload:weight)` 不计入数量；用户回复时直接提供的新合法 `(payload:weight)` 作为用户确认形式时也不计入数量。用户直接提供或在回复中确认的 `(payload)` 在 `syntax.default_parenthesized_weight` 大于 `1` 时计入数量。来源权重和自主权重的最终数值大于 `1` 时计入数量。用户从 Skill 执行者列出的形式中选择一项时，该项按照“用户直接形式和用户确认形式”一节保留的原权重来源类别计数。

计入数量的数组元素总数不得超过 `prompt-weight-policy.json` 的 `recommendations.maximum_boosted_decisions`。超过上限时，Skill 执行者为每个计入元素列出 `payload`、Prompt 位置、最终权重形式和权重来源，并等待用户从该列表中选择不超过上限的元素继续保持高于中性强度；用户回复前停止本次 Prompt 构造。用户选择超过上限、选择列表外元素或没有用 `payload` 与 Prompt 位置唯一指明所选元素时，Skill 执行者报告具体问题并继续停止本次 Prompt 构造。用户完成合法选择后，Skill 执行者保留选中元素的最终权重形式，把未选元素改为未加权 `payload`，不再为未选元素应用用户直接形式、用户确认形式、来源权重或自主权重，并重新统计数量。
