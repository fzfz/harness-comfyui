## 4. 槽位填充与内容组织规则

Skill 执行者必须按照 `SKILL.md`“构建并校验提示词”定义的十二槽顺序填充槽位。槽位顺序只决定内容分类和最终排列，不决定标签权重。Skill 执行者必须按照 `prompt-weighting.md` 设置显式权重。

### 4.1 风格一致性强调

Skill 执行者必须使 `clothing_state`、`scene_environment` 和 `detail_mood` 符合用户要求的时代、地点和材质设定。用户明确要求跨时代或跨类型混搭时，Skill 执行者必须保留该组合；用户未要求混搭时，Skill 执行者应选择时代与场景相符的服装、环境和氛围。古风组合可以使用 `hanfu`、`ancient shrine`、`ink wash` 和 `ethereal`；赛博组合可以使用 `latex bodysuit`、`cyberpunk city` 和 `digital glitch effects`；日常组合可以使用 `school uniform`、`classroom` 和 `cinematic`。

当用户明确选择或描述 NTR、束缚与 BDSM、RBQ 与物化、男娘与 Futa、异种、调教与宠物化、胁迫、偷窥与展示、事后、另类日常、大车小孩或隐奸主题时，Skill 执行者必须读取 `16-special-theme.md` 中对应主题的标签、英文短句及槽位规则。

### 4.2 TAG COUNT CONTROL

| 场景复杂度 | 总标签数 | 说明 |
|---|---|---|
| 简单（单人展示/诱惑/暴露/自慰） | 16-30 | 主要描述单人外貌、服装、姿态和场景 |
| 标准（双人性交/前戏） | 22-38 | 主要描述双人关系、体位、表情、身体反应和液体 |
| 复杂（多人/特殊主题/剧情主视觉） | 30-48 | 需要区分多个角色，并同时描述服装状态、动作关系、场景和细节 |

本节“总标签数”只统计 `count_gender` 至 `detail_mood` 中以英文逗号分隔的内容项，每个内容项计为一个标签；`quality`、`artist_style` 和 `natural_language` 不计入该数量。

| 槽位 | 最少 | 最多 | 说明 |
|---|---|---|---|
| `count_gender` | 2 | 4 | Skill 执行者必须填写人数和性别标签 |
| `character_series` | 0 | 2 | Skill 执行者只在使用 IP 角色时把角色或系列身份词放入 `character_series` |
| `appearance` | 3 | 8 | 从发型或发色、眼睛、体型、肤色、非人特征和身体标记中选择 3-8 个标签 |
| `clothing_state` | 2 | 10 | 基础服装和材质；按需加入一至三个服装状态或服装改造标签，以及鞋袜标签 |
| `pose_action_sex` | 2 | 8 | 至少加入两个核心姿势、动作或性行为标签；按需加入辅助动作和具体变体标签 |
| `expression_reaction` | 1 | 4 | 一个主要表情，以及最多三个身体反应或液体标签 |
| `camera_shot` | 1 | 5 | Skill 执行者必须至少填写一个景别标签，角度与 POV 按需填写 |
| `scene_environment` | 2 | 6 | 主要场所、环境元素，以及按需加入的时辰或天气标签 |
| `detail_mood` | 1 | 6 | 至少填写一个氛围或画面质感标签；按需加入运动渲染、光学效果、摄影效果或数字效果标签 |

Skill 执行者必须遵守上表规定的各槽位标签上限，并按照 `05-conflict-table.md` 的“§3.1 CONFLICT TABLE”排除描述同一身体部位的互斥状态标签。

### 4.3 视线方向默认规则

单人场景未包含背影、背对、转身离开、侧脸、`profile`、`from behind` 或其他视线方向要求时，Skill 执行者必须把 `direct eye contact` 放入 `expression_reaction`，并把 `facing viewer` 放入 `camera_shot`。

两人及以上场景中，Skill 执行者不自动加入 `direct eye contact`。Skill 执行者必须根据用户明确要求或角色互动关系选择视线标签，例如 `looking at another`。

| 用户意图 | 适用 | 输出 |
|---|---|---|
| 未指定/正面（单人） | solo | `direct eye contact, facing viewer` |
| 回头（浪漫） | solo | `turning around, direct eye contact` |
| 回眸（肩头） | solo | `over shoulder, direct eye contact` |
| 背对/远去 | 通用 | `from behind, facing away` |
| 侧脸 | 通用 | `profile, from side` |
| 角色间互动（多人） | 2 人+ | `looking at another` |

### 4.4 自然语言使用场景及具体写法

Skill 执行者必须优先使用标签；只有标签不能准确表达画面关系时，Skill 执行者才使用英文自然语言短句。Skill 执行者必须把每个 `natural_language` 英文短句放入 `natural_language` 槽位；校验器把该槽位内容连接在全部标签之后。

**必须使用自然语言的场景**：

| 场景 | 原因 | 示例（放在末尾） |
|---|---|---|
| 角色间动作关系 | 标签无法描述"谁对谁做什么" | `one reaches toward the viewer while the other watches in silence` |
| 复杂构图/空间关系 | 标签无法描述"谁在哪、面向谁" | `girl sitting on boy's lap facing him` |
| 特殊姿势组合 | 多个动作标签堆叠时主次不清 | `girl pinning wolf boy down while riding him` |
| 分镜/对比关系 | 标签无法表达时间或状态对比 | `left panel: dressed, right panel: nude` |

**格式规则**：

- Skill 执行者必须让一个英文自然语言短句只表达一个具体关系或解决一个具体歧义。

### 4.5 观众关系（叙事性互动）

当用户明确要求角色与观众建立叙事互动时，Skill 执行者必须使用 `natural_language` 英文短句描述该互动关系：

| 类型 | 末尾自然语言示例 |
|---|---|
| 邀请/共犯 | `as if inviting the viewer to escape together` |
| 审判/对峙 | `as if judging the viewer` |
| 托付/交接 | `as if handing the last hope to the viewer` |
| 挑衅/诱惑 | `as if daring the viewer to come closer` |
| 求助/绝望 | `as if begging the viewer for help` |
| 炫耀/NTR | `as if showing off to the viewer what they can't have` |
| 羞耻/被注视 | `as if aware of being watched by the viewer` |
| 臣服/献身 | `as if offering themselves entirely to the viewer` |

### 4.6 多人场景角色规则

当多人场景包含两个或以上具有独立身份或外貌设定的角色时，Skill 执行者必须为每个角色提供能够区分角色归属的关键外貌描述。

- Skill 执行者必须先在 `count_gender` 中写入人数，再按十二槽顺序填写其余槽位。在 `character_series` 中，Skill 执行者只写适用的 IP 角色身份，并按角色在用户描述中的出现顺序排列；在 `appearance` 中，Skill 执行者必须按相同顺序写入各角色的关键外貌短语，并使用角色名或可区分称谓标明归属。共享标签必须写入其所属槽位。属于特定角色的服装状态、动作或表情，以及角色之间的关系和剧情事件，如果标签不能明确表示归属，必须写入 `natural_language`。
- Skill 执行者必须使用简短词组区分每个角色的外貌，不得把动作或表情混入角色外貌短语。

**多人角色归属片段示例（不展示完整十二槽提示词）**：

- ❌ 错误：`raiden shogun, long purple hair, playful, yae miko, pink hair, embarrassed, skirt lift`（模型无法判断属性归属）
- ✅ 正确：`2girls, raiden shogun with long purple hair and purple eyes, yae miko with long pink hair and fox ears, skirt lift, shrine, one playfully lifting the other's skirt with a mischievous smirk while the other looks shy and embarrassed`
