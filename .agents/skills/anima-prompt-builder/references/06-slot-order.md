## 4. SLOT ORDER

Skill 执行者必须按照 `SKILL.md`“构建并校验提示词”定义的十二槽顺序填充槽位。Skill 执行者把更重要的视觉元素放入顺序靠前的适用内容槽位。

本章中的槽位名称用于说明各内容类别，不另行定义运行顺序。

### 4.1 风格一致性强调

Skill 执行者必须使 `clothing_state`、`scene_environment` 和 `detail_mood` 属于一致的世界观。古风组合可以使用 `hanfu`、`ancient shrine` 和水墨空灵氛围；赛博组合可以使用 `latex bodysuit`、`cyberpunk city` 和数字故障效果；日常组合可以使用 `school uniform`、`classroom` 和自然质感。Skill 执行者不得组合 `hanfu` 与 `cyberpunk city`，也不得组合 `latex catsuit` 与 `ancient temple`。Skill 执行者可以组合处于同一世界观的不同场所，例如 `kimono` 与 `love hotel`。

当画面属于 NTR、束缚 BDSM、RBQ/物化、男娘 Futa、睡奸、过激、调戏猥亵、调教宠物、胁迫、偷窥展示、事后、另类日常、大车小孩或攻守反转主题时，Skill 执行者必须读取 §14 SPECIAL THEME 的跨槽位标签与氛围组合，然后按照 `SKILL.md`“构建并校验提示词”定义的十二槽顺序填充槽位。

### 4.2 TAG COUNT CONTROL

> 基于法典4345条实战prompt的统计：平均23.4标签，中位数21，P75=29，P90=36。

| 场景复杂度 | 总标签数 | 说明 |
|---|---|---|
| 简单（单人展示/诱惑/暴露/自慰） | 16-30 | 外貌+服装+姿态+场景，维度少 |
| 标准（双人性交/前戏） | 22-38 | 体位+表情+液体为核心，服装维度膨 |
| 复杂（多人/特殊主题/剧情主视觉） | 30-48 | 跨槽位多，服装改造+液体+混池 |

本节“总标签数”只统计 `count_gender` 至 `detail_mood` 的内容标签；`quality`、`artist_style` 和 `natural_language` 不计入该数量。

**每槽位标签数指引**：

| 槽位 | 最少 | 最多 | 说明 |
|---|---|---|---|
| count/gender | 2 | 4 | Skill 执行者不得省略人数与性别标签 |
| character/series | 0 | 2 | Skill 执行者只在使用 IP 角色时把角色或系列身份词放入 `character_series` |
| appearance | 3 | 8 | 头发2+眼睛1+体型1+肤色1+非人特征/标记按需 |
| clothing/state | 2 | 10 | 基础服装+材质+1-3个改造维度+丝袜鞋类——本槽位天然标签多 |
| pose/action/sex | 2 | 8 | 核心体位2个+辅助动作+变体维度 |
| expression/reaction | 1 | 4 | 主表情1个+最多3个身体反应/液体 |
| camera/shot | 1 | 5 | Skill 执行者必须至少填写一个景别标签，角度与 POV 按需填写 |
| scene/environment | 2 | 6 | 主场所+环境元素+时辰/天气 |

Skill 执行者可以在 `clothing_state` 中组合基础服装、材质、一至三个改造维度和鞋袜标签。Skill 执行者必须保持其他内容槽位精简，并且不能为同一身体部位加入互相矛盾的状态标签；冲突定义见 §3.1。

### 4.3 视线方向默认规则

单人场景未包含背影、背对、转身离开、侧脸、`profile` 或 `from behind` 要求时，Skill 执行者必须把 `direct eye contact` 放入 `expression_reaction` 或 `camera_shot`，并把 `facing viewer` 放入 `camera_shot`。

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

- Skill 执行者必须把英文自然语言短句放入 `natural_language` 槽位。
- Skill 执行者必须让一个短句只解决一个具体歧义，不得写入长段落。

### 4.5 观众关系（叙事性互动）

当场景具有剧情性时，Skill 执行者必须使用 `natural_language` 英文短句描述角色与观众的叙事关系：

| 类型 | 末尾自然语言示例 |
|---|---|
| 邀请/共犯 | `as if inviting the viewer to escape together` |
| 审判/对峙 | `as if judging the viewer` |
| 托付/交接 | `as if handing the last hope to the viewer` |
| 挑衅/诱惑 | `as if daring the viewer to come closer` |
| 求助/绝望 | `as if begging the viewer for help` |
| 炫耀/NTR | `as if showing off to the viewer what they can't have` |
| 羞耻/被注视 | `as if aware of being watched by the viewer` |
| 臣服/献身 | `as if offering herself entirely to the viewer` |

### 4.6 多人场景角色规则

多人场景包含具体角色时，Skill 执行者必须为每个角色提供能够区分角色归属的关键外貌描述。

- Skill 执行者必须按照人数、角色 A 外貌短语、角色 B 外貌短语、共享动作与镜头标签、`natural_language` 关系描述的顺序组织多人场景内容。
- Skill 执行者必须使用简短词组区分每个角色的外貌，不得把动作或表情混入角色外貌短语。
- Skill 执行者必须把无法用标签明确表达的动作归属、角色关系和剧情放入 `natural_language` 槽位。

**示例**：
- ❌ 错误：`raiden shogun, long purple hair, playful, yae miko, pink hair, embarrassed, skirt lift`（模型无法判断属性归属）
- ✅ 正确：`2girls, raiden shogun with long purple hair and purple eyes, yae miko with long pink hair and fox ears, skirt lift, shrine, one playfully lifting the other's skirt with a mischievous smirk while the other looks shy and embarrassed`

---
