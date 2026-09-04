## 0. 快速开始

Skill 执行者收到当前用户消息后，必须根据当前任务需要和下表“用途”列，确定完成当前 Prompt 需要读取的参考章节。

| § | 章节 | 用途 |
|---|---|---|
| 0 | 快速开始 | 说明参考章节的选择方法和 Prompt 构造顺序 |
| 1 | ROLE | 规定 Skill 执行者的行为边界和执行方法 |
| 2 | OUTPUT PROTOCOL | 规定 Prompt 的单行格式、字母大小写、内容排除规则和自然语言补充格式 |
| 3 | FINAL SELF-CHECK | 输出前逐项检查格式、语义冲突和权重设计 |
| 3.1 | CONFLICT TABLE | 互斥标签表速查——视角/身份/服装/动作/细节过度 |
| W | WEIGHT POLICY | 规定权重语法、推荐权重档位、固定质量前缀和可强调标签数量 |
| W.1 | PROMPT WEIGHTING | 权重来源优先级、设计步骤和十二槽适用条件 |
| 4 | SLOT ORDER | **核心**：标签填充顺序 + 风格一致性 + 数量控制 + 视线规则 + 自然语言写法 + 多人规则 |
| 5 | ASSEMBLY DECISION TREE | 规定七类画面场景对应的各槽位填充方法 |
| 6 | COUNT & IDENTITY | **标签库**：主体层 [槽位: count/gender, character/series] |
| 7 | APPEARANCE | **标签库**：外貌层——发色发型/瞳色/体型/肤色/身体部位/非人特征/身体标记 [槽位: appearance] |
| 8 | CLOTHING & STATE | **标签库**：服装类型、材质、穿着状态、服装改造、配饰和鞋袜 [槽位: clothing/state] |
| 9 | POSE & ACTION & SEX | **标签库**：单人动作的四段结构、双人前戏的六段结构、双人正戏的十一段结构，以及多人和百合场景标签 [槽位: pose/action/sex] |
| 10 | EXPRESSION & REACTION | **标签库**：主要表情、面部细节、视线、身体反应、可见液体和即时痕迹 [槽位: expression/reaction] |
| 11 | CAMERA & SHOT | **标签库**：景别/视角/POV/构图/体位专属镜头/身体聚焦/分镜 [槽位: camera/shot] |
| 12 | SCENE & ENVIRONMENT | **标签库**：主场所、场所特征、天气、时段、可见环境现象和附加场景内容 [槽位: scene/environment] |
| 13 | DETAIL & MOOD | **标签库**：画面媒介、色彩范围、运动表现、成像与后期效果、故障与显示介质效果、数字图形和整体氛围 [槽位: detail/mood] |
| 14 | SPECIAL THEME | **跨槽位场景配方**：NTR、束缚、RBQ、男娘与 Futa、异种、调教、胁迫、偷窥、事后、另类日常、大车小孩、隐奸，共十二类主题 |

Skill 执行者必须按以下顺序构造 Prompt：先读取 `03-output-protocol.md` 中的 Prompt 格式校验器规则；再根据当前任务需要，按照上表“用途”列选择并读取参考章节；然后确定各槽位内容，删除互相冲突或重复的标签，设置标签权重，执行最终自检，并调用 Prompt 格式校验器。Prompt 格式校验器返回成功结果后，Skill 执行者必须将结果中的 `prompt_text` 写入 `positive_prompt`，再执行 `SKILL.md` 的“构造生成结果”阶段。Skill 执行者必须使用该阶段生成的内容作为最终回答。

---
