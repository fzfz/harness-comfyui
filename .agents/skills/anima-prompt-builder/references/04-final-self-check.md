## 3. FINAL SELF-CHECK

Skill 执行者完成包含 `slots` 和 `display_text` 的顶层对象后，必须逐项核对下表。任一检查项不符合“通过标准”时，Skill 执行者必须修改该顶层对象，直至全部检查项通过；然后才能调用校验器。

| # | 检查项 | 通过标准 |
|---|---|---|
| 1 | **固定质量前缀** | Skill 执行者确认 `quality` 符合 `SKILL.md`“构建并校验提示词”定义的固定质量词规则 |
| 2 | **画师前缀** | Skill 执行者解析 `artist_style` 的权重外层后，确认每个 payload 恰好以一个 `@` 开头 |
| 3 | **人数一致性** | Skill 执行者确认 `count_gender` 中各人数标签表示的人数之和，与其他槽位中分别描述的角色总数一致；`count_gender` 不得同时包含 `1boy` 和 `2boys` 等互相冲突的人数标签 |
| 4 | **互斥冲突** | Skill 执行者按照 §3.1 互斥表核对视角、身份、服装、动作和细节标签，确认任意一组标签之间均无互斥冲突 |
| 5 | **重复标签** | 同一标签不出现两次；固定质量前缀和画师触发词不计入内容标签重复统计 |
| 6 | **场景合理性** | Skill 执行者确认 `scene_environment` 描述的空间、支撑物和环境条件能够容纳 `pose_action_sex` 描述的姿势与动作，不出现身体穿透物体、缺少必要支撑面或动作空间不足等冲突 |
| 7 | **光线组合** | 光线、光影和色调标签符合 §13.8 的组合规则 |
| 8 | **内容标签总数** | `count_gender` 至 `detail_mood` 的标签总数符合 §4.2 的复杂度范围；`quality`、`artist_style` 和 `natural_language` 不计入内容标签总数 |
| 9 | **权重来源** | 每个显式权重必须来自用户当前请求、当前消息 `comfyui-context` 中的 Style 上下文记录、已采用的 Style Search 或 Resolve 结果，或者 `prompt-weight-policy.json` 中定义的一个策略档位 |
| 10 | **强调数量** | Skill 执行者排除用户当前请求中提供的权重，再统计最终使用 `(payload)`，或者最终使用 `(payload:weight)` 且 `weight > 1` 的不同 payload；该数量不得超过 `recommendations.maximum_boosted_decisions` |
| 11 | **权重结构** | 每个带权重的 tag 只允许一层权重外层；同一 payload 不得同时出现加权副本和未加权副本，也不得通过同义 tag 重复加权 |
| 12 | **关系文本边界** | `natural_language` 没有 tag 权重外层；需要强调的视觉内容已经进入对应 tag 槽位 |

---
