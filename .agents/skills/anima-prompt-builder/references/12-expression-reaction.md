## 10. 表情与可见反应

本章用于构造 `expression_reaction` 槽位。该槽位描述人物在当前画面中的主要表情、视线、身体反应、可见液体和即时痕迹。

### 10.1 构造顺序与数量

Skill 执行者按以下顺序构造 `expression_reaction`：

1. 按人物在用户描述中的首次出现顺序，记录用户为该人物指定的主要表情。哭泣、睡眠、失去意识和疼痛等明确的当前状态也属于主要表情依据。同一短语同时指定主要表情和面部细节时，Skill 执行者把面部细节紧接在该主要表情之后。
2. 用户没有为任何人物指定主要表情时，Skill 执行者为用户描述中最先出现的人物使用 `expressionless`。没有指定表情的其他人物不增加默认表情标签。
3. Skill 执行者按内容在用户描述中的出现顺序，记录尚未随主要表情记录，并且符合本章选择条件的面部细节、视线、身体反应、液体和即时痕迹。
4. Skill 执行者按 `pose_action_sex` 的元素顺序处理用户没有重复描述的动作结果。同一个元素产生多个结果时，Skill 执行者只记录该元素明确写出的结果，并依次处理 `orgasm`、`struggling`，再按第 10.5 节的表格顺序处理液体标签。液体产生者、可见液体、当前阶段和落点必须全部明确；缺少其中任一项时不加入液体标签。
5. 本 Skill 构造的人物画面至少包含一名人物，`expression_reaction` 最终包含一至四个标签。Skill 执行者按上述顺序保留前四个标签，并使每个标签只出现一次。

### 10.2 主要表情与面部细节

Skill 执行者为用户明确指定表情的每名人物选择一个主要表情。用户明确要求含泪微笑时依次加入 `smile` 和 `tears`，二者各计一个标签；用户明确要求苦笑时使用 `nervous smile`。

| 用户描述的当前可见状态 | 主要表情标签 |
|---|---|
| 没有明显情绪 | `expressionless` |
| 平静 | `calm` |
| 无聊 | `bored` |
| 微笑 | `smile` |
| 苦笑 | `nervous smile` |
| 咧嘴笑 | `grin` |
| 顽皮 | `naughty face` |
| 诱惑性微笑 | `seductive smile` |
| 讥笑或坏笑 | `smirk` |
| 得意 | `smug` |
| 邪恶地笑 | `evil smile` |
| 自信 | `confident` |
| 难堪 | `embarrassed` |
| 害羞 | `shy` |
| 羞愧 | `ashamed` |
| 内疚 | `guilty` |
| 害怕 | `scared` |
| 不情愿 | `reluctant` |
| 皱眉 | `frown` |
| 哭泣 | `crying` |
| 疼痛 | `pain` |
| 惊讶 | `surprised` |
| 好奇 | `curious` |
| 阿黑颜 | `ahegao` |
| 吐舌失神颜 | `torogao` |
| 性行为后的恍惚失神 | `fucked silly` |
| 疲倦 | `tired` |
| 困倦 | `sleepy` |
| 睡眠 | `sleeping` |
| 失去意识 | `unconscious` |

| 用户描述的面部细节 | 面部细节标签 |
|---|---|
| 眼睛半闭 | `half-closed eyes` |
| 眼睑沉重 | `heavy-lidded eyes` |
| 眯眼 | `narrowed eyes` |
| 闭眼 | `closed eyes` |
| 睁大眼睛 | `wide-eyed` |
| 翻白眼 | `rolling eyes` |
| 对眼 | `cross-eyed` |
| 心形瞳孔 | `heart-shaped pupils` |
| 眼神空洞 | `empty eyes` |
| `@_@` 形眼睛 | `@_@` |
| `o_o` 形眼睛 | `o_o` |
| 闭嘴 | `closed mouth` |
| 嘴唇微张 | `parted lips` |
| 张嘴 | `open mouth` |
| 吐舌 | `tongue out` |
| 舔嘴唇 | `licking lips` |
| 咬紧牙齿 | `clenched teeth` |
| 波浪嘴 | `wavy mouth` |
| 打哈欠 | `yawning` |
| 流泪 | `tears` |
| 大量泪水连续流下 | `streaming tears` |
| 挑眉 | `raised eyebrow` |
| 紧张汗滴符号 | `nervous sweatdrop` |
| 面部放松 | `relaxed face` |

同一人物的眼睑标签选择一个，眼球或瞳孔标签选择一个，嘴部标签选择一个，泪水标签选择一个。`closed eyes`、`sleeping` 或 `unconscious` 排除全部视线标签。`rolling eyes` 与 `cross-eyed` 二选一。Skill 执行者仅在用户明确要求含泪微笑或其他同时包含笑容与泪水的情绪时组合 `smile` 与 `tears`。

### 10.3 视线

| 视线目标 | 标签 |
|---|---|
| 看向画面外的观看者 | `direct eye contact` |
| 看向另一名人物 | `looking at another` |
| 向上看 | `looking up` |
| 向下看 | `looking down` |
| 避开对方或观看者 | `looking away` |
| 看向手机 | `looking at phone` |

单人画面的默认视线由 `references/06-slot-order.md` 第 4.3 节确定。多人画面中，Skill 执行者只在用户描述或当前动作明确写出视线目标时选择视线标签；多人分别具有视线要求时，Skill 执行者按视线要求在用户描述中的出现顺序记录视线标签。每名人物选择一个视线标签。

### 10.4 身体反应

Skill 执行者根据用户描述或当前动作已经明确产生的可见结果选择身体反应。每个反应维度最多选择一个标签。

| 反应维度 | 用户描述的可见结果 | 身体反应标签 |
|---|---|---|
| 脸红位置 | 面部发红 | `blush` |
| 脸红位置 | 鼻部发红 | `nose blush` |
| 脸红位置 | 整张脸发红 | `full-face blush` |
| 脸红位置 | 全身发红 | `body blush` |
| 脸红位置 | 皮肤潮红但没有指定部位 | `flush` |
| 颤抖程度 | 轻微颤抖 | `slight trembling` |
| 颤抖程度 | 明显颤抖 | `trembling` |
| 颤抖程度 | 全身抽搐 | `convulsing` |
| 呼吸方式 | 深而重的呼吸 | `heavy breathing` |
| 呼吸方式 | 短促喘息 | `panting` |
| 高潮状态 | 正在高潮 | `orgasm` |
| 脚趾反应 | 脚趾蜷缩 | `toes curling` |
| 腿部反应 | 双腿颤抖 | `legs shaking` |
| 活动状态 | 正在抵抗 | `struggling` |
| 活动状态 | 已经停止抵抗 | `no resistance` |
| 活动状态 | 睡眠或失去意识且没有反应 | `no reaction` |
| 手部反应 | 双手用力握紧 | `clenched fists` |
| 体力状态 | 疲惫 | `exhausted` |
| 体力状态 | 身体瘫软 | `limp body` |
| 体力状态 | 局部抽动 | `twitching` |
| 皮肤反应 | 竖起鸡皮疙瘩 | `goosebumps` |
| 皮肤反应 | 身体冒出热气 | `steaming body` |

`no reaction` 排除本表中的其他身体反应。`struggling` 排除 `no resistance` 和 `limp body`。`convulsing` 排除 `limp body`。

`arched back`、`head back`、`kneeling`、`grabbing sheets`、`clinging`、`collapsed` 和 `arms at sides` 是姿势或动作，Skill 执行者把这些标签写入 `pose_action_sex`。

### 10.5 液体来源、阶段与落点

Skill 执行者只在用户描述或 `pose_action_sex` 明确写出液体产生者、可见液体、当前阶段和落点时加入液体标签。任一项没有确定时，Skill 执行者不加入该液体标签。多名人物产生不同液体时，Skill 执行者分别核对每种液体的产生者、阶段和落点。

| 液体类型 | 来源与画面阶段 | 可见落点 | 标签 |
|---|---|---|---|
| 汗液 | 指定人物的皮肤上已经出现汗液 | 人物皮肤 | `sweat` |
| 汗滴 | 指定人物的皮肤上已经出现汗滴 | 人物皮肤 | `sweat drops` |
| 大量汗液 | 指定人物正在大量出汗 | 人物皮肤 | `sweating profusely` |
| 汗渍 | 指定人物的汗液已经浸湿衣物 | 人物衣物 | `sweat stain` |
| 流涎 | 指定人物嘴中正在流出唾液 | 嘴角或下巴 | `drooling` |
| 可见唾液 | 指定人物嘴中已经出现唾液 | 嘴内、嘴角或下巴 | `saliva` |
| 口部泡沫 | 指定人物嘴中已经出现泡沫 | 嘴角或下巴 | `foaming at the mouth` |
| 唾液拉丝 | 指定人物的嘴刚与另一处接触面分开，并且两处之间存在唾液 | 指定人物的嘴与另一处接触面之间 | `saliva trail` |
| 阴道分泌液 | 指定女性人物的外阴已经出现可见分泌液 | 外阴 | `pussy juice` |
| 阴道湿润 | 指定女性人物的外阴已经明显湿润 | 外阴 | `wet pussy` |
| 阴道分泌液污渍 | 指定女性人物的阴道分泌液已经留下污渍 | 大腿、衣物或下方表面 | `pussy juice stain` |
| 阴道分泌液积液 | 指定女性人物的阴道分泌液已经形成积液 | 大腿或下方表面 | `pussy juice pool` |
| 射精前分泌液 | 指定男性人物的阴茎上已经出现可见射精前分泌液 | 阴茎或正在接触的部位 | `precum` |
| 口内精液 | 指定男性人物正在向嘴内射精，或已经完成口内射精 | 嘴内 | `cum in mouth` |
| 脸部精液 | 指定男性人物正在向脸部射精，或脸部已经留下精液 | 脸部 | `cum on face` |
| 乳房精液 | 指定男性人物正在向乳房射精，或乳房已经留下精液 | 乳房 | `cum on breasts` |
| 身体精液 | 指定男性人物正在向身体射精，或身体已经留下精液 | 身体 | `cum on body` |
| 头发精液 | 指定男性人物射出的精液已经落在头发上 | 头发 | `cum on hair` |
| 衣物精液 | 指定男性人物射出的精液已经落在衣物上 | 衣物 | `cum on clothes` |
| 阴道内精液 | 指定男性人物已经完成阴道内射精 | 阴道内 | `creampie` 或 `cum inside` |
| 溢出的精液 | 指定男性人物已经射精，并且精液正从承接部位溢出 | 承接部位外侧 | `cum overflow` |
| 滴落的精液 | 指定男性人物已经射精，并且精液正在滴落 | 承接部位下方 | `cum drip` |
| 拉丝的精液 | 指定男性人物已经射精，并且两处接触面之间存在精液拉丝 | 两处接触面之间 | `cum string` |
| 精液积液 | 指定男性人物已经射精，并且精液已经形成积液 | 下方表面 | `cum pool` |
| 大量精液 | 一名或多名指定男性人物已经射出大量精液 | 用户指定的覆盖部位 | `excessive cum` |
| 颜射覆盖 | 用户明确要求 `bukkake`，并且一名或多名男性人物已经向指定人物的脸部射精 | 指定人物的脸部 | `bukkake` |
| 精液浴 | 被精液覆盖的人物浸在或大面积覆盖于一名或多名指定男性人物射出的精液中 | 被精液覆盖的人物身体和下方表面 | `cum bath` |
| 正在女性射液 | 指定女性人物正在射液 | 外阴与射液方向上的可见表面 | `squirting` |
| 女性射液 | 指定女性人物正在射液，并且用户明确要求使用该标签 | 外阴与射液方向上的可见表面 | `female ejaculation` |

Skill 执行者选择与当前阶段和落点直接对应的一行。阴道内精液使用 `creampie`；用户明确要求 `cum inside` 时使用 `cum inside`。

### 10.6 当前动作造成的即时痕迹

Skill 执行者只在用户明确要求该痕迹，或当前动作描述明确写出该动作已经造成该痕迹时选择以下标签。

| 造成痕迹的动作 | 即时痕迹候选 |
|---|---|
| 吸吮亲吻留下吻痕 | `hickey` |
| 咬合留下齿痕 | `bite marks` |
| 口红接触留下口红印 | `lipstick mark` |
| 亲吻留下唇形印记 | `kiss mark` |
| 绳索压迫留下绳痕 | `rope marks` |
| 绳索压迫留下红痕 | `red marks` |
| 绳索压迫留下皮肤凹痕 | `skindentation` |
| 束缚手腕留下痕迹 | `bound wrist marks` |
| 手掌击打留下掌形印记 | `handprint` |
| 掌掴留下痕迹 | `slap mark` |
| 拍打臀部留下拍打印记 | `spank mark` |
| 拍打臀部造成臀部发红 | `red ass` |
| 撞击在身体留下淤青 | `bruise` |
| 撞击在面部留下淤青 | `bruise on face` |
| 抓挠留下痕迹 | `scratch marks` |
| 鞭打留下痕迹 | `whip marks` |
| 当前受伤动作造成割伤 | `cuts` |
| 当前受伤动作造成面部出血 | `blood on face` |
| 当前受伤动作造成身体沾血 | `blood on body` |
| 当前受伤动作造成手部沾血 | `blood on hands` |
| 当前受伤动作造成衣物沾血 | `blood on clothes` |
| 当前受伤动作造成地面沾血 | `blood on floor` |

长期存在的纹身、旧伤、身体书写和身份标记写入 `appearance`。汗液、唾液、阴道分泌液和精液的落点与残留按第 10.5 节选择。
