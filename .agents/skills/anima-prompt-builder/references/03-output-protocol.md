## 2. OUTPUT PROTOCOL

本节只定义校验器生成的 `prompt_text`，不定义最终 assistant 输出。

| 规则 | 说明 |
|---|---|
| 行数 | 校验器生成单行 `prompt_text`，其中不含换行。 |
| 分隔 | 校验器使用 `, ` 连接十二槽中的全部元素。 |
| 开头 | Skill 执行者按照 `SKILL.md`“构建并校验提示词”定义的质量词和画师前缀规则填充 `quality` 与 `artist_style`。 |
| 大小写 | Skill 执行者把前十一槽的元素写成 lowercase；`score_` 标签保留下划线。 |
| 权重 | 前十一槽位接受 `payload`、`(payload)` 或 `(payload:weight)`；Skill 执行者按照 `prompt-weighting.md` 选择形式，校验器按照 `prompt-weight-policy.json` 检查语法。 |
| 自然语言补充 | 标签无法准确描述多人角色归属、复杂构图、特殊姿势或分镜关系时，Skill 执行者必须把英文自然语言短句放入 `natural_language`；校验器把该槽位放在 `prompt_text` 末尾。 |

## 校验器调用
### 脚本名：
"scripts/validate-output.mjs",

### 作用：
校验各槽的提示词是否符合机械规则（不负责判断语义质量）

### 输入：
 json : "{\"slots\":{...},\"display_text\":\"{{中文自然语言描述的整个画面的设计思路}}。\"}"

---
