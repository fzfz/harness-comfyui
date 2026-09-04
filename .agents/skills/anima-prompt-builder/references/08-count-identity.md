## 6. COUNT & IDENTITY

对应槽位：`count_gender`、`character_series`。

### 6.1 人数与性别

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

仅当用户明确要求女性角色之间存在恋爱或情色关系时，才添加 `yuri`。仅描述摸头、拥抱、合影等动作而未明确角色关系时，不添加 `yuri`。

### 6.2 IP 角色规则

- 用户指定已有 IP 角色时，必须写入该角色的英文角色标签、作品英文标签，以及至少五个可在图像中识别的外观标签；外观标签应覆盖发型、发色、瞳色、标志性服饰和配饰。
- 用户要求原创角色时，直接描述角色外观，不写角色或作品身份标签。
- 发型、发色、瞳色、标志性服饰或配饰中任一类别无法从当前用户消息、当前消息 `comfyui-context` 中的 Character 上下文记录或已采用的 Character Search 或 Resolve 结果中确认时，Skill 执行者必须向用户询问缺失的外观信息；用户回复前停止构造 Prompt。

### 6.3 体型差/年龄差

| 类型 | tag |
|---|---|
| 身高差 | `height difference, size difference` |
| 高大男×娇小女 | `tall male, petite female, height difference, size difference` |
| 肥胖男性与娇小女性 | `fat man, petite female, size difference` |
| 年长男性与年轻女性 | `age difference, older male, younger female` |
