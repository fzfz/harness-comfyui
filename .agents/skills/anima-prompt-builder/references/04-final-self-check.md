## 3. FINAL SELF-CHECK

Skill 执行者完成包含 `slots` 和 `display_text` 的顶层对象后，必须逐项核对下表。Skill 执行者发现冲突时必须修改同一个顶层对象；全部检查项通过后，Skill 执行者才能调用校验器。

| # | 检查项 | 通过标准 |
|---|---|---|
| 1 | **固定质量前缀** | Skill 执行者确认 `quality` 符合 `SKILL.md`“构建并校验提示词”定义的固定质量词规则 |
| 2 | **画师前缀** | Skill 执行者解析 `artist_style` 的权重外层后，确认每个 payload 恰好以一个 `@` 开头 |
| 3 | **人数一致性** | `count_gender` 标签数量与实际角色数一致，无 `1boy,2boys` 等矛盾 |
| 4 | **互斥冲突** | 对照 §3.1 互斥表，无视角、身份、服装、动作或细节标签矛盾 |
| 5 | **重复标签** | 同一标签不出现两次；固定质量前缀和画师触发词不计入内容标签重复统计 |
| 6 | **场景合理性** | `scene_environment` 与 `pose_action_sex` 的画面内容物理兼容 |
| 7 | **光线组合** | 光线、光影和色调标签符合 §13.6 的组合规则 |
| 8 | **内容标签总数** | `count_gender` 至 `detail_mood` 的标签总数符合 §4.2 的复杂度范围；`quality`、`artist_style` 和 `natural_language` 不计入内容标签总数 |
| 9 | **权重来源** | 每个显式权重来自用户、合法 Style 来源或 `prompt-weight-policy.json` 的一个策略档位 |
| 10 | **强调数量** | 除用户明确提供权重以外，合法 Style 来源权重和自主设计权重产生的高于中性强度视觉决定总数不超过 `recommendations.maximum_boosted_decisions` |
| 11 | **权重结构** | 每个 tag 只有一层权重外层；不存在嵌套权重、同一 payload 的加权与未加权副本或同义加权叠加 |
| 12 | **关系文本边界** | `natural_language` 没有 tag 权重外层；需要强调的视觉内容已经进入对应 tag 槽位 |

Skill 执行者按照以下顺序完成自检：完成顶层对象 → 逐项核对 → 修改冲突内容 → 全部通过后调用校验器。

---
