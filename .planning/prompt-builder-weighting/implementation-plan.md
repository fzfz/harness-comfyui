# Prompt Builder tag 权重校验与槽位权重设计实施方案

## 必须要实现的目标

1. 计划执行者必须修改 `.agents/skills/anima-prompt-builder/`，使 ANIMA Prompt Builder 的前十一槽位接受未加权 tag、默认权重 tag 和显式数值权重 tag，并使 `artist_style` 同时接受未加权 `@artist` 与加权 `(@artist:weight)`。
2. 计划执行者必须修改 `.agents/skills/wai-sdxl-prompt-builder/`，使 WAI Prompt Builder 的前十四个 tag 位置使用同一套可选权重语法，并使 `artist` 不再成为唯一执行结构化权重校验的位置。
3. 计划执行者必须为 ANIMA 十二槽和 WAI 十五位置分别编写权重理论、权重选择方法、适用位置、数值档位、冲突处理和叠加限制。
4. 计划执行者必须让每个 Skill 的校验器与该 Skill 的权重说明读取同一份 Skill 内结构化权重策略；校验脚本不得从 Markdown 解析规则。
5. 计划执行者必须增加覆盖两个校验器全部权重分支的自动化测试，并完成独立代码审查、独立语义审查、完整质量门禁、真实 Desktop 模型验收、发布和生产部署。

## 基线、执行主体和术语

- 调研 worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags`
- 调研分支：`codex/plan-weighted-tag-validator`
- 调研基线：`b3643feea960ab94bca9c260c12bde0d76ded997`
- 实施基线：`dfc480d0200b92da9a0027c6cd14f996dd7663b5`（`origin/main`、`v0.38.1`）
- 计划执行者：用户批准本方案后，在独立 linked worktree 中修改、测试、审查、发布和部署本次修复的 Agent。
- tag 位置：ANIMA 的 `quality` 至 `detail_mood` 十一个槽位，或者 WAI 的 `quality` 至 `technical` 十四个位置。
- 关系文本位置：ANIMA 的 `natural_language` 或 WAI 的 `relation_narrative`。关系文本位置不属于 tag 位置。
- payload：未加权 tag 的完整文本，或者权重外层圆括号内部、权重分隔冒号之前的完整文本。
- 默认权重 tag：完整格式为 `(payload)`；ComfyUI 为该 payload 使用默认权重 `1.1`。
- 显式权重 tag：完整格式为 `(payload:weight)`；`weight` 使用本方案“ASCII 十进制与 payload 转义词法”定义的字符格式，并且转换后的数值大于 `0` 且有限。
- 中性 tag：没有权重外层的 `payload`。中性 tag 的有效强度是 `1.0`，Skill 执行者不为中性 tag 增加冗余 `(payload:1.0)`。

## 调研确认的问题

1. `.agents/skills/anima-prompt-builder/references/03-output-protocol.md` 明确禁止 `(tag:1.2)`，但 ANIMA 官方模型卡明确说明 Prompt weighting 有效，并给出 `(chibi:2)`。
2. ANIMA `scripts/validate-output.mjs` 只在画师前缀检查前尝试剥离一部分权重外层。该脚本会接受 `(blue hair:abc)`、`((blue hair:1.2):1.1)` 和 `@(@fukahire:1.2)`。
3. `.agents/skills/wai-sdxl-prompt-builder/references/prompt-format-validator.md` 只为 `artist[]` 定义结构化权重格式；WAI 校验器会接受普通 `(blue hair:abc)` 和任意嵌套圆括号。
4. WAI 当前把 `0.25` 至 `1.5` 当成校验器格式限制，并在画师说明中把超界用户权重静默调整到边界。ComfyUI 官方解析器没有该平台级范围；ANIMA 官方示例还需要 `2.0`。校验器必须只判断确定性语法，模型创作数值必须由各 Skill 的权重设计方法负责。
5. ANIMA 的十二槽顺序和 WAI 的十五位置顺序负责内容分类与最终排列；显式数值权重直接改变对应 payload 的条件强度。计划执行者必须删除“槽位顺序等于隐式权重”的错误定义。

## 权威资料

- [ComfyUI `CLIPTextEncode` 官方文档](https://docs.comfy.org/built-in-nodes/ClipTextEncode)定义 `(text:weight)`、`(text)` 默认权重和字面圆括号转义。
- [ComfyUI 官方 `sd1_clip.py`](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/sd1_clip.py)中的 `parse_parentheses` 与 `token_weights` 定义当前圆括号与数值解析行为。
- [ANIMA 官方模型卡](https://huggingface.co/circlestone-labs/Anima/blob/c41bf4876dba082c418cadacd9486afddec8d7ad/README.md#prompting)明确说明 Prompt weighting 有效、通常需要高于 SDXL 的数值，并给出 `(chibi:2)`；同一模型卡定义 `@` 画师前缀和 tag order。

## 统一权重语法合同

### tag 位置允许的三种格式

| 格式 | 示例 | 校验结果 |
| --- | --- | --- |
| 未加权 payload | `blue hair`、`@fukahire` | 接受 |
| ComfyUI 默认权重 | `(blue hair)`、`(@fukahire)` | 接受；有效权重为 `1.1` |
| 显式权重 | `(blue hair:1.2)`、`(@fukahire:2)` | 接受 |

### ASCII 十进制与 payload 转义词法

weight 只允许以下 ASCII 文法：

```text
weight   = integer [ "." fraction ]
integer  = "0" | nonzero-digit *digit
fraction = 1*digit
digit    = "0" | nonzero-digit
nonzero-digit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
```

该文法产生以下确定性结果：

- `2`、`1.2`、`0.8`、`1.20` 合法；校验器保留末尾零，不执行数值格式化。
- `.5`、`1.`、`01.2`、`00.8`、`+1.2`、`-0.8`、`1e2`、`NaN` 和 `Infinity` 非法。
- `0`、`0.0` 和 `0.00` 符合字符文法但数值不大于 `0`，因此非法。
- 符合字符文法但转换为 JavaScript `Number` 后得到非有限值的超大十进制数非法。

payload 只使用以下转义合同：

- `\(`、`\)`、`\[`、`\]` 分别表示 payload 内的字面圆括号或方括号。
- `\\` 表示 payload 内的一个字面反斜杠。
- 反斜杠后不是 `(`、`)`、`[`、`]` 或反斜杠时，该反斜杠序列非法。
- 字符串末尾的单个反斜杠非法。
- 解析器从左向右消费转义对；`\\(` 先消费 `\\`，剩余 `(` 仍是未转义圆括号，因此非法；`\\\(` 先消费 `\\`，再消费 `\(`，因此合法。
- 权重外层内部没有冒号时，该元素是默认权重 tag。权重外层内部恰好有一个未转义冒号时，该冒号分隔 payload 与 weight。权重外层内部有两个以上冒号时，该结构非法。
- 权重外层内部不提供字面冒号转义。需要保留冒号的普通内容只能作为未加权 payload；Skill 执行者不能为该完整内容增加权重外层。
- 权重外层内部出现未转义的 `(`、`)`、`[` 或 `]` 时，该结构非法。该规则排除嵌套权重和未转义字面分隔符。

计划执行者必须让每个 Skill 的校验器按照下列顺序处理一个 tag 位置数组元素：

1. 校验器先执行该 Skill 现有的字符串类型、非空、首尾空白、单行和控制字符检查。
2. 数组元素没有完整权重外层时，校验器把完整数组元素作为未加权 payload。
3. 数组元素被一组完整、未转义的最外层圆括号包裹，且内部没有权重分隔冒号时，校验器把内部文本作为默认权重 payload。
4. 数组元素被一组完整、未转义的最外层圆括号包裹，且内部恰好有一个冒号时，校验器把冒号之前的文本作为 payload，把冒号之后的文本作为 weight。内部存在两个以上冒号时，校验器拒绝该结构。
5. payload 必须非空、首尾无空白，并且符合本方案定义的逐字符转义合同。
6. weight 必须符合本方案定义的 ASCII 文法，转换后的数值必须有限并且大于 `0`。冒号两侧不能出现空白。
7. 校验器拒绝嵌套权重、未闭合圆括号、多余圆括号和无法区分 payload 与 weight 的结构。
8. 校验器完成权重外层解析后，才执行位置专用 payload 检查。ANIMA `artist_style` payload 必须恰好以一个 `@` 开头；WAI `artist` payload 继续使用现有的可见字符合同和共用 payload 词法，不新增逗号或画师名称字符限制。WAI 校验器不判断 payload 是否在语义上属于真实画师。
9. 校验器保留原数组元素，不执行 trim、大小写转换、权重改写、数值截断或 Prompt 重排；最终 `prompt_text` 必须逐字符保留合法输入。

### 校验器与创作方法的边界

- 校验器只拒绝结构错误、非有限 weight、非正 weight 和槽位专用格式错误。
- 校验器不把 WAI 的推荐权重区间强加给 ANIMA，也不把 ANIMA 的推荐权重档位强加给 WAI。
- 用户或合法 Style 来源提供超出推荐档位但仍为正有限数值的 weight 时，Skill 执行者保留该数值；Skill 执行者不得静默截断。
- Skill 执行者生成新的权重时，只能使用对应 Skill 的结构化策略中定义的推荐数值。
- Skill 执行者、自检规则和独立 Semantic Reviewer 负责确认 WAI `artist[]` 的一个数组元素只对应一个合法 Style 来源画师；校验程序不执行画师身份或来源的语义判断。

## 槽位权重理论、方法和规范

### 共同理论

1. Skill 执行者必须先使用槽位职责、槽位顺序、精确 tag、去重和冲突删除表达画面设计，再决定是否增加显式权重。
2. Skill 执行者只能为用户明确优先内容、选定构图的主视觉锚点、主要画师、容易被竞争内容淹没的核心动作或身份增加高于 `1.0` 的权重。
3. Skill 执行者只能为必须保留但应弱于主视觉锚点的辅助画师、次要风格或次要视觉内容增加低于 `1.0` 的正权重。
4. Skill 执行者不能使用权重掩盖互斥 tag。Skill 执行者必须先删除或改写互斥 tag，再选择权重。
5. Skill 执行者默认最多为三个不同视觉决定增加高于 `1.0` 的显式权重。用户明确指定更多权重时，Skill 执行者保留用户要求，但仍必须完成冲突检查。
6. 一个数组元素只能有一层权重外层。Skill 执行者不能嵌套权重，不能使用同一 payload 的加权与未加权副本叠加强度，也不能使用多个同义加权 tag 表达同一个视觉决定。
7. `natural_language` 和 `relation_narrative` 保存完整关系文本。Skill 执行者不得给这两个关系文本位置增加权重外层；需要强调的视觉内容必须进入承担该职责的 tag 位置。
8. ANIMA 固定质量前缀和 WAI 默认质量段保持未加权。Skill 执行者不能用质量 tag 权重替代主体、动作、构图或画师的具体权重设计。

### ANIMA 数值方法

`.agents/skills/anima-prompt-builder/references/prompt-weight-policy.json` 必须把下列值保存为 ANIMA 权重数值的唯一结构化来源：

| 作用 | 数值 | 使用条件 |
| --- | ---: | --- |
| 次要内容减弱 | `0.8` | 内容必须保留，但应弱于当前主视觉锚点 |
| 中等强调 | `1.5` | 用户表达了优先级，或者一个核心视觉概念需要超过普通 tag 的强度 |
| 强强调 | `2.0` | 该内容是选定构图的唯一主视觉锚点；该数值与 ANIMA 官方 Prompt weighting 示例一致 |

ANIMA Skill 执行者必须按照以下顺序选择权重：

1. 用户明确数值权重；
2. UI Style 或语义 Style 的合法显式权重；
3. 用户明确的主要或辅助作用；
4. 选定构图中唯一的主视觉锚点；
5. 没有上述条件时保持未加权。

ANIMA 槽位适用规则：

| 槽位 | 权重设计规则 |
| --- | --- |
| `quality` | 固定五项前缀保持未加权；用户新增且明确要求强调的质量 tag 才能加权 |
| `artist_style` | 未加权 `@artist`、默认权重 `(@artist)` 和显式权重 `(@artist:weight)` 均合法；主要或辅助画师按照 ANIMA 数值方法处理 |
| `count_gender` | 默认未加权；只有主体数量或主体类别是用户主目标且会与复杂场景竞争时才加权 |
| `character_series` | 具体角色或系列身份是画面核心时，可以加权一个身份 payload |
| `appearance` | 只加权决定角色识别或用户明确要求的一个外貌锚点 |
| `clothing_state` | 只加权决定画面主题的服装或穿着状态，不同时加权同义材质和状态 tag |
| `pose_action_sex` | 核心动作或姿势可以成为主视觉权重；辅助动作保持未加权 |
| `expression_reaction` | 用户明确要求的主表情或关键身体反应可以加权一个 payload |
| `camera_shot` | 构图必须依赖的景别、POV 或角度可以加权一个 payload |
| `scene_environment` | 场所本身是主叙事对象时才加权；普通背景 tag 保持未加权 |
| `detail_mood` | 决定媒介质感或整体观感的一个核心效果可以加权 |
| `natural_language` | 禁止权重外层 |

### WAI 数值方法

`.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json` 必须把下列值保存为 WAI 权重数值的唯一结构化来源：

| 作用 | 数值 | 使用条件 |
| --- | ---: | --- |
| 次要内容减弱 | `0.8` | 辅助画师或必须保留的次要视觉内容 |
| 轻度强调 | `1.1` | 主要画师或轻度优先内容 |
| 主视觉强调 | `1.2` | 用户主目标、核心动作、核心身份或核心构图 |
| 强强调 | `1.3` | 用户明确要求强强调且冲突检查已经通过 |

WAI Skill 执行者必须按照以下顺序选择权重：

1. 用户明确数值权重；
2. UI Style、语义 Style 或 Character 来源中的合法显式权重；
3. 用户明确的主要或辅助作用；
4. 选定构图的主视觉锚点；
5. 没有上述条件时保持未加权，不生成冗余 `1.0`。

WAI 位置适用规则：

| 位置 | 权重设计规则 |
| --- | --- |
| `quality` | 默认质量段保持未加权；用户新增且明确强调的质量内容才加权 |
| `artist` | 未加权画师、默认权重画师和显式权重画师均合法；主要画师使用轻度强调，辅助画师使用次要内容减弱 |
| `subject` | 默认未加权；主体数量或类别是主目标且与复杂内容竞争时才加权 |
| `character` | 一个 Character 来源 payload 可以整体加权；不能把同一 Character 来源拆成多个同义加权副本 |
| `appearance` | 只加权角色识别所需或用户明确要求的外貌锚点 |
| `outfit` | 只加权决定主题的服装或穿着状态 |
| `action` | 核心动作可以使用主视觉强调；局部辅助动作保持未加权 |
| `expression_reaction` | 只加权主表情、主视线或关键反应中的一项 |
| `camera_composition` | 只加权决定选定构图的景别、POV、焦点或布局 |
| `environment` | 环境是主叙事对象时才加权 |
| `detail_mood` | 只加权决定整体观感的一个媒介、摄影、数字或运动效果 |
| `lighting` | 只加权决定主焦点和空间层次的主光或对比关系 |
| `non_artist_style` | 只加权用户明确要求或完整画面设计采用的主要普通画风 |
| `technical` | 默认未加权；用户把输出形态本身作为主目标时才加权 |
| `relation_narrative` | 禁止权重外层 |

## 实施步骤和文件归属

### 1. 建立每个 Skill 的结构化权重单一来源

计划执行者必须新增：

- `.agents/skills/anima-prompt-builder/references/prompt-weight-policy.json`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json`

每个 JSON 文件必须定义：

- 策略 schema 版本；
- 未加权、默认权重和显式权重三种格式是否允许；
- weight 的完整 ASCII 正则 `^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$`、数值必须大于 `0`、数值必须有限、允许末尾零和禁止数值规范化；
- 反斜杠转义序列可以表示的五类字面字符 `\\`、`(`、`)`、`[`、`]`，无效转义、尾随反斜杠、逐对消费规则和权重外层最多一个冒号；
- 默认括号权重 `1.1`；
- 禁止嵌套权重；
- 对应 Skill 的 tag 位置和关系文本位置；
- 对应 Skill 的推荐数值名称与数值；
- 默认最多三个高于 `1.0` 的视觉决定；
- ANIMA 固定质量前缀或 WAI 默认质量段的未加权要求。

两个 JSON 文件必须使用下列准确字段路径、类型和值。校验器和自动化测试不得为这些字段另建别名。

| 字段路径 | 类型 | 两个 JSON 的准确值或合同 |
| --- | --- | --- |
| `schema_version` | integer | `1` |
| `syntax.forms.unweighted` | boolean | `true` |
| `syntax.forms.default_weight` | boolean | `true` |
| `syntax.forms.explicit_weight` | boolean | `true` |
| `syntax.default_parenthesized_weight` | number | `1.1` |
| `syntax.explicit_weight.ascii_decimal_pattern` | string | JSON 字符串 `^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$`；读取后的正则表达式匹配本方案的 ASCII 十进制文法 |
| `syntax.explicit_weight.minimum_exclusive` | number | `0` |
| `syntax.explicit_weight.require_finite` | boolean | `true` |
| `syntax.explicit_weight.preserve_lexeme` | boolean | `true` |
| `syntax.payload.escape_character` | string | 一个反斜杠字符 |
| `syntax.payload.escapable_characters` | array of string | 依次为反斜杠、`(`、`)`、`[`、`]` 五个单字符字符串 |
| `syntax.payload.consume_escape_pairs_left_to_right` | boolean | `true` |
| `syntax.payload.reject_unknown_escape` | boolean | `true` |
| `syntax.payload.reject_trailing_escape` | boolean | `true` |
| `syntax.payload.maximum_unescaped_colons_inside_wrapper` | integer | `1` |
| `syntax.payload.reject_unescaped_delimiters_inside_wrapper` | array of string | `(`、`)`、`[`、`]` 四个单字符字符串 |
| `syntax.allow_nested_weight` | boolean | `false` |
| `positions.tag` | array of string | 对应 Skill 的全部 tag 位置，顺序与输出合同一致 |
| `positions.relation_text` | array of string | 对应 Skill 的关系文本位置 |
| `recommendations.maximum_boosted_decisions` | integer | `3` |
| `recommendations.levels` | object of number | 只包含下列对应 Skill 档位字段 |
| `recommendations.unweighted_quality.position` | string | `quality` |
| `recommendations.unweighted_quality.content` | array of string | 对应 Skill 的固定质量前缀或默认质量段，顺序与输出合同一致 |

ANIMA JSON 必须使用下列 Skill 专用字段和值：

| 字段路径 | 类型 | 准确值 |
| --- | --- | --- |
| `positions.tag` | array of string | `quality`、`artist_style`、`count_gender`、`character_series`、`appearance`、`clothing_state`、`pose_action_sex`、`expression_reaction`、`camera_shot`、`scene_environment`、`detail_mood` |
| `positions.relation_text` | array of string | `natural_language` |
| `recommendations.levels.deemphasis` | number | `0.8` |
| `recommendations.levels.medium` | number | `1.5` |
| `recommendations.levels.strong` | number | `2.0` |
| `recommendations.unweighted_quality.content` | array of string | `masterpiece`、`best quality`、`score_7`、`highres`、`safe` |

WAI JSON 必须使用下列 Skill 专用字段和值：

| 字段路径 | 类型 | 准确值 |
| --- | --- | --- |
| `positions.tag` | array of string | `quality`、`artist`、`subject`、`character`、`appearance`、`outfit`、`action`、`expression_reaction`、`camera_composition`、`environment`、`detail_mood`、`lighting`、`non_artist_style`、`technical` |
| `positions.relation_text` | array of string | `relation_narrative` |
| `recommendations.levels.deemphasis` | number | `0.8` |
| `recommendations.levels.light` | number | `1.1` |
| `recommendations.levels.primary` | number | `1.2` |
| `recommendations.levels.strong` | number | `1.3` |
| `recommendations.unweighted_quality.content` | array of string | `masterpiece`、`best quality`、`ultra-detailed`、`highres` |

两个 JSON 文件属于两个独立 Skill 的执行边界。ANIMA Skill 不引用 WAI Skill 文件，WAI Skill 不引用 ANIMA Skill 文件，仓库系统源码也不引用任一 Skill 文件。

### 2. 编写每个 Skill 的权重理论和槽位方法

计划执行者必须新增：

- `.agents/skills/anima-prompt-builder/references/prompt-weighting.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weighting.md`

每个 `prompt-weighting.md` 必须说明：

- 槽位顺序与显式权重的不同职责；
- 选择未加权、减弱、强调和强强调的判断顺序；
- 对应 Skill 每个槽位或位置的权重适用条件；
- 用户权重、来源权重、主要/辅助作用和自主设计权重的采用优先级；
- 删除冲突与重复内容后再加权；
- 默认三项强调预算、单层权重和禁止同义叠加；
- 关系文本位置与固定质量内容的权重边界；
- 对应 `prompt-weight-policy.json` 的准确相对路径和读取时机。

全部受影响的 Skill Markdown 不得复制 JSON 中的推荐数值常量或推荐范围。Markdown 使用 JSON 中的策略属性名说明方法，Skill 执行者在应用推荐数值前完整读取 JSON。校验器接口中的纯语法示例可以包含正数 weight，但该示例必须标明它只演示字符格式，不定义推荐档位。

### 3. 修改 ANIMA Prompt Builder

计划执行者必须修改：

- `.agents/skills/anima-prompt-builder/SKILL.md`
- `.agents/skills/anima-prompt-builder/references/01-quick-start.md`
- `.agents/skills/anima-prompt-builder/references/02-role.md`
- `.agents/skills/anima-prompt-builder/references/03-output-protocol.md`
- `.agents/skills/anima-prompt-builder/references/04-final-self-check.md`
- `.agents/skills/anima-prompt-builder/references/06-slot-order.md`
- `.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`

具体修改目标：

1. `SKILL.md` 必须把 `references/prompt-weighting.md` 和 `references/prompt-weight-policy.json` 加入每次 Prompt 构建的固定读取流程，并在处理 UI Style、语义 Style 和最终槽位时引用同一权重优先级。
2. `references/01-quick-start.md` 必须增加权重理论与结构化策略的章节入口，并把执行顺序更新为“确定槽位内容、删除冲突与重复内容、设计权重、完成自检、调用校验器”。
3. `SKILL.md` 的 Style 规范化必须先解析合法权重外层，再规范化 payload 内的 `@`，最后保留或重新生成合法权重外层。该流程必须把 `(@fukahire:2)` 处理为合法加权画师，不能生成 `@(@fukahire:2)`。
4. `references/02-role.md` 和 `references/03-output-protocol.md` 必须删除禁止权重语法和“槽位顺序提供隐式权重”的规则。
5. `references/04-final-self-check.md` 必须增加 payload 级画师前缀、权重来源、默认强调预算、嵌套权重和同义叠加检查。
6. `references/06-slot-order.md` 必须明确槽位顺序只负责内容分类和排列，并把显式权重方法路由到 `references/prompt-weighting.md`。
7. `scripts/validate-output.mjs` 必须从本 Skill 的 `references/prompt-weight-policy.json` 读取结构化策略，使用一个确定性解析函数处理前十一槽位的未加权、默认权重和显式权重格式，再对 payload 执行小写、逗号和画师 `@` 检查。
8. ANIMA 校验器必须保持现有十二槽、固定质量前缀、输出五键合同、退出码和组合顺序不变。

### 4. 修改 WAI Prompt Builder

计划执行者必须修改：

- `.agents/skills/wai-sdxl-prompt-builder/SKILL.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-format-validator.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-self-check.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/wai-artist-syntax.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-examples/artist.md`
- `.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`

具体修改目标：

1. `SKILL.md` 必须在完成画面设计和映射位置时读取 `references/prompt-weighting.md` 与 `references/prompt-weight-policy.json`，并在自检、冲突检查和格式校验之前应用权重方法。
2. `references/prompt-format-validator.md` 必须把可选权重合同扩展到前十四个 tag 位置，分别说明 tag payload、画师 payload、关系文本、错误路径和错误消息。
3. `references/prompt-self-check.md` 必须增加权重来源、主视觉锚点、默认强调预算、嵌套权重、同义叠加和关系文本边界检查。
4. `references/wai-artist-syntax.md` 必须允许中性画师保持未加权，允许合法来源权重和用户权重，删除强制中性权重、静默截断、推荐数值表和旧推荐范围，并只使用 `prompt-weight-policy.json` 的策略属性名描述主要/辅助作用。
5. `references/prompt-position-examples/artist.md` 必须展示未加权单画师，并用决策表说明主要画师读取 `recommendations.levels.light`、辅助画师读取 `recommendations.levels.deemphasis`。该文件必须明确 Skill 执行者把属性值读取为数值后再写入最终 Prompt，不能把属性路径字符串写入 Prompt，也不得保存推荐数值副本。
6. `scripts/validate-output.mjs` 必须从本 Skill 的 `references/prompt-weight-policy.json` 读取结构化策略，把现有画师专用权重解析器扩展为前十四个 tag 位置共用的确定性解析器。`artist` payload 继续接受现有合同允许的其他可见字符；脚本不得新增逗号限制或画师身份判断。
7. WAI 校验器必须保持现有十五位置、成功五键合同、错误四键合同、退出码、关系句终止符和组合顺序不变。

### 5. 增加自动化测试

计划执行者必须新增 `tests/unit/prompt-builder-weight-validation.test.mjs`。测试必须通过两个校验器的公开函数和 CLI 标准输入覆盖下列分支：

| 分支 | ANIMA 预期 | WAI 预期 |
| --- | --- | --- |
| 每个 tag 位置的未加权 payload | 接受 | 接受 |
| 每个 tag 位置的 `(payload)` | 接受 | 接受 |
| 每个 tag 位置的 `(payload:weight)` | 接受 | 接受 |
| ANIMA 官方 `(chibi:2)` | 接受并原样组合 | 不适用 |
| 未加权画师 | `@artist` 接受 | `artist` 接受 |
| 默认权重画师 | `(@artist)` 接受 | `(artist)` 接受 |
| 显式权重画师 | `(@artist:2)` 接受 | `(artist:1.2)` 接受 |
| WAI 现有合同允许的其他可见字符画师 payload | 不适用 | 使用合成词法输入 `artist,name` 验证不新增逗号拒绝规则 |
| 空 payload 或空 weight | 指向具体数组元素并拒绝 | 指向具体数组元素并拒绝 |
| `2`、`1.2`、`0.8`、`1.20` | 接受并逐字符保留 | 接受并逐字符保留 |
| `.5`、`1.`、`01.2`、`00.8` | 拒绝 | 拒绝 |
| `abc`、`NaN`、`Infinity`、科学计数法 | 拒绝 | 拒绝 |
| 字符文法合法但转换后溢出为 `Infinity` 的超大十进制数 | 拒绝 | 拒绝 |
| `0`、负数、带正号数值 | 拒绝 | 拒绝 |
| 冒号两侧空白 | 拒绝 | 拒绝 |
| 未闭合、多余或嵌套圆括号 | 拒绝 | 拒绝 |
| payload 内合法 `\(`、`\)`、`\[`、`\]`、`\\` | 接受并逐字符保留 | 接受并逐字符保留 |
| payload 内未转义圆括号或方括号 | 拒绝 | 拒绝 |
| 无效转义、尾随反斜杠、偶数反斜杠后未转义分隔符 | 拒绝 | 拒绝 |
| 权重外层内部两个以上冒号 | 拒绝 | 拒绝 |
| ANIMA `@@artist` 与 `@(@artist:2)` | 拒绝 | 不适用 |
| `quality` 权重 | 保留固定五项未加权，再追加合法加权质量 tag | 保留默认质量段未加权，再追加合法加权质量内容 |
| 关系文本位置 | 保持现有自然语言合同，不应用 tag 权重解析 | 保持现有句子合同，不应用 tag 权重解析 |
| 合法加权输入组合结果 | `prompt_text` 逐字符保留原元素 | `prompt_text` 逐字符保留原元素 |
| CLI 非法权重 | 退出码 `2`、stdout 为空、stderr 路径准确 | 退出码 `2`、stdout 为空、stderr 路径准确 |

测试不得根据 Markdown 关键词判断语义质量。测试只读取 JSON 策略并断言公开校验行为、输出结构、错误路径和退出码。

### 6. 更新版本与发布文档

实施开始时的基线版本为 `0.38.1`；发布前 `v0.38.2` 已由并发任务占用。计划执行者必须基于最新 `origin/main` 准备 `0.38.3`：

- 把 `package.json.version` 更新为 `0.38.3`；
- 在 `docs/releasenotes.md` 顶部新增 v0.38.3 权重校验、槽位权重方法、测试、真实模型验收和无依赖变更说明，同时保留 v0.38.2 发布说明；
- 在 `docs/system/testing.md` 记录最终自动化测试数量、覆盖率、真实 Desktop 权重用例和依赖审计结果；
- 只有现有 README 出现与权重合同冲突的内容时才修改 `README.md`。当前 README 没有 Prompt Builder 权重说明，因此本方案不预设 README 修改。

计划执行者不得增加或升级 npm 依赖，不得修改 `pnpm-lock.yaml`。校验器只使用 Node.js 内置模块与 Skill 自带 JSON 文件。

## 验证与审查顺序

### 1. 目标自动化验证

计划执行者必须依次执行：

```sh
python3 /Users/fzfz/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/anima-prompt-builder
python3 /Users/fzfz/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/wai-sdxl-prompt-builder
pnpm vitest run tests/unit/prompt-builder-weight-validation.test.mjs
```

计划执行者不得修改 Skill Creator 目录中的脚本。

### 2. 独立审查

计划执行者必须在候选文件稳定后并行安排三个独立 Reviewer：

- Standards Reviewer 核对仓库开发规范、Skill 自包含边界、结构化单一来源、无依赖变更和测试范围。
- Spec Reviewer 核对普通 tag 与画师 tag 的可选权重、两个模型的不同数值方法、全部槽位规则和用户要求覆盖。
- Semantic Reviewer 逐份阅读两个 `SKILL.md`、两个 `prompt-weighting.md`、两个 JSON 策略、受影响参考文档、错误消息和发布说明，核对每条规则的执行主体、动作、对象、读取时机和相对路径。

Semantic Reviewer 还必须确认全部受影响 Markdown 已删除 JSON 推荐数值的副本、WAI `artist[]` 的“一项来源对应一名画师”只由 Skill 执行者和语义自检负责，并且校验脚本没有画师身份判断逻辑。

Semantic Reviewer 必须逐项确认两个 Skill Markdown 中使用的 JSON 属性路径都能在对应 `prompt-weight-policy.json` 中唯一解析，并且属性类型符合本方案字段表。

任一 Reviewer 提出问题后，计划执行者必须修改候选文件，并重新执行受影响的目标测试与对应独立审查。

### 3. 真实 Desktop 模型验收

计划执行者必须按照 `docs/agents/worktree-development.md` 在实现 worktree 中以前台方式运行 `pnpm dev:start`，并在第二个终端执行 `pnpm dev:status` 和 `pnpm dev:logs`。验收必须选择 `ComfyUI工作台预设` 和当前产品配置的默认 Agent Provider、默认 Agent 模型与默认推理等级；任一配置不可用时，计划执行者停止验收并报告具体配置错误，不切换其他模型或 Preset。真实模型验收至少包含：

1. ANIMA：普通权重 `(chibi:2)`、未加权 `@artist` 和显式权重 `(@artist:2)` 分别进入正确槽位并通过校验器。
2. ANIMA：Style `data.prompt_text` 已含合法画师权重时，Skill 执行者保留权重并保持 payload 内恰好一个 `@`。
3. WAI：普通权重 `(rim lighting:1.2)` 与显式权重画师 `(artist:1.1)` 同时通过校验器。
4. WAI：中性画师保持未加权，主要/辅助画师按照 WAI 策略生成不同权重。
5. 两个 Skill：没有用户优先级或竞争内容时，大部分 tag 保持未加权；Skill 执行者不为每个槽位机械增加权重。
6. 两个 Skill：模型实际读取 `prompt-weighting.md` 和 `prompt-weight-policy.json`，实际调用对应 `scripts/validate-output.mjs`，并按校验器成功合同结束。

计划执行者必须把验收记录写入并提交 `.planning/prompt-builder-weighting/model-acceptance.md`。该文件必须为每个用例保存以下属性：

- 用例 ID 与执行时间；
- Preset 名称、Provider ID、Agent 模型 ID 与推理等级；
- 完整用户请求；
- 预期槽位或位置与预期权重来源；
- Agent 实际读取的 Skill 文件相对路径；
- 实际 `run_skill_script` 的 `script_path`、标准输入 JSON、退出码、stdout 和 stderr；
- 实际 `prompt_text`；
- 通过或失败结论与具体差异。

`docs/system/testing.md` 和 `docs/releasenotes.md` 必须引用该验收记录的仓库相对路径。验收结束后执行 `pnpm dev:stop` 与 `pnpm dev:status`，最终状态必须为 `stopped`。

真实验收记录、`docs/system/testing.md` 和 `docs/releasenotes.md` 稳定后，计划执行者必须安排后置独立 Semantic Reviewer。该 Reviewer 必须核对 `model-acceptance.md` 的六个用例、字段完整性、记录证据与结论映射，以及两个发布文档对验收记录的引用。后置审查提出问题时，计划执行者必须修订对应文件并重新执行受影响的真实验收用例和后置语义审查。后置语义审查通过后，计划执行者才能执行最终发布门禁。

### 4. 最终发布门禁

计划执行者处理完全部审查和真实模型问题后，必须对最终候选树执行：

```sh
pnpm quality
git diff --check
```

两项命令通过后，计划执行者不得再修改候选树。任何后续文件变化都要求重新执行受影响审查、`pnpm quality` 和 `git diff --check`。

### 5. 提交、发布与生产部署

用户批准包含发布与生产部署的完整方案后，计划执行者必须按照 `docs/system/releasing.md`：

1. 提交最终候选树并推送最终提交；
2. 确认本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA；
3. 确认目标 tag 与 GitHub Release 尚不存在；
4. 创建并推送 `v0.38.3` annotated tag；
5. 使用 `docs/releasenotes.md` 创建无附件 GitHub Release；
6. 从已发布 tag 更新生产 checkout，保留生产 `.env` 和运行数据；
7. 按发布文档启动生产 Desktop，执行 `pnpm prod:status` 和 `pnpm prod:logs`；
8. 在生产 Desktop 中复查一个 ANIMA 加权 tag 与一个 WAI 加权 tag 的成功结果。

如果用户只批准候选实现而没有批准远端推送、GitHub Release 或生产部署，计划执行者必须在完成本地候选树和门禁后停止，并再次请求发布授权。

## 验收清单

- [ ] ANIMA 前十一槽位接受未加权、默认权重和显式权重 tag。
- [ ] WAI 前十四个 tag 位置接受未加权、默认权重和显式权重 tag。
- [ ] ANIMA `artist_style` 对权重外层内的 payload 检查恰好一个 `@`。
- [ ] WAI `artist` 与普通 tag 使用同一外层解析器，继续接受现有合同允许的其他可见字符，并且不新增逗号限制或画师身份判断。
- [ ] 两个校验器拒绝空、非数字、非有限、非正、带符号、科学计数法、空白、未闭合和嵌套权重。
- [ ] 两个校验器按照同一 ASCII 十进制文法和逐字符转义合同处理前导零、末尾零、超大有限性、连续反斜杠和尾随反斜杠。
- [ ] 两个校验器逐字符保留合法 tag，并保持现有输出合同、退出码与组合顺序。
- [ ] ANIMA 权重方法包含官方 `2.0` 强强调档位，不复用 WAI 的 SDXL 数值档位。
- [ ] WAI 权重方法包含减弱、轻度强调、主视觉强调和强强调档位。
- [ ] 两个 Skill 的每个槽位或位置都有明确权重适用条件。
- [ ] 两个 Skill 都规定默认最多三个高于 `1.0` 的视觉决定、单层权重、先解冲突后加权和禁止同义叠加。
- [ ] `natural_language` 与 `relation_narrative` 不应用 tag 权重外层。
- [ ] Skill Markdown 不作为校验脚本的结构化数据来源。
- [ ] 全部受影响 Skill Markdown 已删除 JSON 推荐数值副本；纯语法示例没有被定义为推荐数值。
- [ ] 两个 JSON 使用方案定义的准确字段路径、层级和类型；Skill Markdown 与测试中的每个属性路径都能唯一解析。
- [ ] `.planning/prompt-builder-weighting/model-acceptance.md` 完整记录六个真实模型用例并被测试文档与发布说明引用。
- [ ] 后置独立 Semantic Reviewer 已核对真实模型验收记录与两个发布文档的证据映射。
- [ ] 两个 Skill 的 `quick_validate.py`、目标单元测试、独立审查、真实 Desktop 验收、`pnpm quality` 和 `git diff --check` 全部通过。
- [ ] 发布与部署仅在用户明确授权后执行。

## 非本次目标

- 本次修复不改变 ANIMA 十二槽或 WAI 十五位置的名称、数量、职责和组合顺序。
- 本次修复不修改 Character、Style、Work、Prompt-term、LoRA、生成模型、Workflow 或 Generation Run 的接口合同。
- 本次修复不修改 ComfyUI Workflow、Text Encoder 节点、Sampler、Scheduler、CFG、LoRA 权重或 CLIP 权重。
- 本次修复不增加负权重、科学计数法、方括号减权语法、嵌套权重、动态权重或时间调度权重。
- 本次修复不使用程序判断 tag 的语义重要性、画师风格兼容性或槽位内容质量。
- 本次修复不增加依赖、兼容旧错误格式、静默截断、静默降级或与权重无关的重构。

## 已获得的授权

- 用户已授权计划编写者创建独立 worktree，读取仓库实现与本机项目 Skill，查询权威技术资料，运行本地校验器只读复现，并编写本实施方案。
- 用户已授权计划编写者把槽位权重理论、方法和规范纳入本实施方案。
- 用户已通过“批准完整方案”授权计划执行者修改 Prompt Builder Skill、测试、版本和发布文档。
- 用户已通过“批准完整方案”授权计划执行者提交、推送、创建 Git tag、创建 GitHub Release 并部署生产 Desktop。
