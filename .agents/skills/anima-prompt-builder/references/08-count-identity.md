---
文档用途: 规定 ANIMA 人数、性别与角色身份槽位。
读取时机: 填写 count_gender 或 character_series 时。
---
# ANIMA 人数、性别与角色身份

1. 对应槽位：`count_gender`、`character_series`。

## 1. 人数与性别

| 中文 | tag |
|---|---|
| 一女 | `1girl, solo` |
| 一男一女 | `1girl, 1boy` |
| 一男一女（明确为异性恋爱或情色互动） | `1girl, 1boy, hetero` |
| 两女 | `2girls` |
| 两女（明确为百合恋爱或情色互动） | `2girls, yuri` |
| 两男 | `2boys` |
| 三女及以上 | 写入实际女性人数标签（例如 `3girls`）和 `multiple girls` |
| 三男及以上 | 写入实际男性人数标签（例如 `3boys`）和 `multiple boys` |
| 男女混合且总人数不少于三人 | 分别写入实际女性人数标签和实际男性人数标签；女性不少于两人时添加 `multiple girls`，男性不少于两人时添加 `multiple boys`；仅在用户明确要求群交时添加 `group sex` |
| 男娘 | `otoko no ko, femboy, trap` |
| 扶她 | `futanari` |

1. 仅当用户明确要求女性角色之间存在恋爱或情色关系时，才添加 `yuri`。仅描述摸头、拥抱、合影等动作而未明确角色关系时，不添加 `yuri`。

## 2. IP 角色规则

1. 用户要求采用已有 IP 角色标签时，写入已确认的英文角色标签与作品标签。至少 5 个外貌标签覆盖发型、发色、瞳色、标志性服饰和配饰。
2. 用户要求原创角色，或依据小说材料设计人物且未要求目录角色标签时，直接采用人物设计中的可见外貌。`character_series` 保持为空。
3. 发型、发色、瞳色、服饰与配饰按 `appearance` 和 `clothing_state` 的职责填写。用户已授权补充的外貌细节，由人物设计步骤决定。
4. 用户要求保留的身份或外貌仍无法确定，且用户未授权决定时，只询问缺少的内容。收到输入后，再继续构造。

## 3. 体型差与年龄差

| 类型 | tag |
|---|---|
| 身高差 | `height difference, size difference` |
| 高大男×娇小女 | `tall male, petite female, height difference, size difference` |
| 肥胖男性与娇小女性 | `fat man, petite female, size difference` |
| 年长男性与年轻女性 | `age difference, older male, younger female` |
