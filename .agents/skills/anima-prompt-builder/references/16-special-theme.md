## 14. SPECIAL THEME 跨槽位主题规则

本章规定十二类特殊主题需要使用的标签、英文短句及其所属槽位。Skill 执行者只选择符合用户画面要求的行，并把每项内容写入该行指定的槽位。

每个行内代码范围表示一个不可拆分的标签或英文短句。标有“同时使用”的多个项目构成固定组合，其余项目按画面独立选择。画面人数必须等于实际入镜人物数量；未入镜但影响画面关系的人物必须通过 `natural_language` 短句说明。用户指定的角色性别、关系、动作或情绪与本章示例不同时，Skill 执行者必须使用用户指定的内容。本章把可见体液及其落点写入 `expression_reaction`。

### 14.1 NTR

用户要求 NTR 时，Skill 执行者必须在 `pose_action_sex` 中加入 `netorare`，再按具体画面选择背叛行为、见证方式和人物反应。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 两人发生背叛行为，苦主不入镜 | `count_gender` | 按入镜两人的实际性别填写人数标签 |
| 苦主与发生背叛行为的两人同时入镜 | `count_gender` | 按三名入镜人物的实际性别填写人数标签 |
| 背叛行为 | `pose_action_sex` | `cheating`、`stealth sex`、`sex from behind` |
| 与苦主通话时发生背叛行为 | `pose_action_sex` | `talking on phone`、`hand covering own mouth` |
| 背叛方享受但仍有负罪感 | `expression_reaction` | `guilty pleasure`、`blush` |
| 背叛方已经接受当前关系 | `expression_reaction` | `corrupted` |
| 背叛方表现出性兴奋 | `expression_reaction` | `ahegao`、`heart-shaped pupils` |
| 苦主看到背叛行为 | `expression_reaction` | `crying`、`empty eyes`、`despair` |
| 同时展示通话双方或背叛前后状态 | `camera_shot` | `split screen` |
| 苦主从窗外看到室内行为 | `camera_shot` | 同时使用 `from outside`、`through window` |
| 手机是背叛关系的可见证据 | `scene_environment` | `smartphone`、`phone screen visible`、`text message` |
| 画面无法仅靠标签说明三人关系 | `natural_language` | `the betrayed partner watches the other two from outside the window` |

变体选择：

- 电话 NTR：使用 `netorare`、`talking on phone`，并按画面加入当前性行为和通话者反应。
- 窗外 NTR：使用 `netorare`、`from outside`、`through window`，并用 `natural_language` 说明窗外人物与室内两人的关系。
- 分屏 NTR：使用 `split screen`，并用两个 `natural_language` 短句分别说明左右画面的角色和动作。
- 事后归宅：`pose_action_sex` 使用 `after sex`、`coming home`；`clothing_state` 使用 `disheveled clothes`；`natural_language` 说明等待者与归来者的关系。

### 14.2 束缚与 BDSM

用户要求身体束缚时，Skill 执行者必须在 `pose_action_sex` 中同时选择一种束缚方法或装置和至少一个被束缚的身体部位。用户只要求蒙眼、口具或不包含身体束缚的 BDSM 行为时，Skill 执行者按画面选择对应内容。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 绳缚方法 | `pose_action_sex` | `shibari`、`kinbaku`、`turtle shell bondage`、`breast bondage` |
| 绳索材质或颜色 | `pose_action_sex` | `hemp rope`、`red rope`；只在画面明确包含对应绳索时选择 |
| 手脚或身体被固定 | `pose_action_sex` | `bound wrists`、`bound ankles`、`arms behind back`、`bound torso`、`hogtie`、`spread eagle`、`suspension` |
| 固定装置 | `pose_action_sex` | `handcuffs`、`shackles`、`chains`、`duct tape`、`spreader bar`、`st andrews cross`、`pillory` |
| 口部或视线受限 | `pose_action_sex` | `ball gag`、`ring gag`、`bit gag`、`cloth gag`、`tape over mouth`、`blindfold` |
| 身体受力痕迹 | `appearance` | `rope marks`、`red marks`、`skindentation`、`bruise`、`whip marks` |
| 抗拒或恐惧 | `expression_reaction` | `struggling`、`scared`、`crying`、`tears` |
| 失去反应 | `expression_reaction` | `empty eyes`、`mind break` |
| 束缚场所 | `scene_environment` | `dungeon`、`stone wall`、`prison cell`、`bedroom`、`dark room` |

当绳索已经持续压迫皮肤时，Skill 执行者加入 `rope marks` 或 `skindentation`；刚完成且尚未形成可见压痕的束缚不需要身体受力痕迹。

### 14.3 RBQ 与物化

用户要求 RBQ 或物化时，Skill 执行者必须用可见行为、身体标记、人物反应或场景设施表现人物被当作物品使用的状态。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 固定位置供人使用 | `pose_action_sex` | `through wall`、`stationary restraints`、`pillory`、`glory hole`、`public use` |
| 动物化或器物化姿态 | `pose_action_sex` | `human toilet`、`urinal`、`on all fours`、`presenting`、`kneeling` |
| 三名及以上男性入镜 | `count_gender` | 填写所有入镜人物的实际性别人数标签；男性达到三名时加入 `multiple boys` |
| 多人同时使用 | `pose_action_sex` | `gangbang`、`surrounded`、`cumdump` |
| 多人连续使用 | `pose_action_sex` | 必须使用 `one after another`；按画面加入 `cumdump` |
| 公开展示 | `pose_action_sex` | `public display` |
| 可见物化标记 | `appearance` | `body writing`、`tally marks`、`barcode tattoo`、`ownership mark` |
| 使用后的身体状态 | `expression_reaction` | `empty eyes`、`expressionless`、`fucked silly`、`exhausted`、`limp body` |
| 使用后的体液 | `expression_reaction` | `bukkake`、`cum bath`、`excessive cum`、`cum pool`、`cum covered` |
| 公共或固定使用场所 | `scene_environment` | `public toilet`、`dungeon`、`public` |
| 价格牌作为物化标记 | `natural_language` | `a visible price tag hangs from the collar` |

普通多人性行为只有在画面同时出现器物化姿态、固定设施、所有权标记或使用后状态时，才按本节选择物化相关标签。选择后必须至少保留一项器物化姿态、固定设施、所有权标记或使用后状态。

### 14.4 男娘与 Futa

男娘与 Futa 是两个独立主题。Skill 执行者必须按照画面中的实际人物分别填写人数、性别和身体特征。

#### 14.4.1 男娘

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 单人男娘 | `count_gender` | 同时使用 `1boy`、`otoko no ko`；`femboy` 可按用户用词加入 |
| 男娘与一名男性 | `count_gender` | 同时使用 `2boys`、`otoko no ko`、`yaoi` |
| 男娘与一名女性 | `count_gender` | 同时使用 `1boy`、`1girl`、`otoko no ko`、`hetero` |
| 身体和外观 | `appearance` | `androgynous`、`flat chest`、`small penis`、`phimosis` |
| 女性化服装 | `clothing_state` | `crossdressing`、`pantyhose`、`china dress`、`maid outfit`、`school uniform`、`naked apron` |
| 贞操装置 | `pose_action_sex` | `chastity cage` |
| 性行为 | `pose_action_sex` | `anal`、`sex from behind`、`fellatio`、`pegging` |
| 反应 | `expression_reaction` | `blush`、`embarrassed`、`shy`、`ahegao` |

#### 14.4.2 Futa

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 单人 Futa | `count_gender` | 同时使用 `1girl`、`futanari` |
| Futa 与一名女性 | `count_gender` | 同时使用 `2girls`、`futanari` |
| 两名 Futa | `count_gender` | 同时使用 `2girls`、`futanari` |
| 两名 Futa 的身份归属 | `natural_language` | `both characters are futanari` |
| 身体特征 | `appearance` | `penis and vagina`、`testicles`、`huge penis`、`large breasts` |
| 服装 | `clothing_state` | `bodystocking`、`latex`、`reverse bunnysuit`、`slingshot swimsuit` |
| Futa 与女性 | `pose_action_sex` | `futa on female`、`pegging` |
| 两名 Futa | `pose_action_sex` | `futa with futa`、`double dildo`、`ass-to-ass` |
| 单人自慰 | `pose_action_sex` | `futanari masturbation`、`artificial vagina`、`dildo riding` |
| 反应 | `expression_reaction` | `smug`、`dominant`、`evil smile`、`lustful`、`ahegao` |

### 14.5 异种

用户要求异种主题时，Skill 执行者必须用 `count_gender` 填写实际入镜主体数量，并从下表选择一种或多种与画面一致的异种类型。异种类型和身体结构写入 `appearance`，交互方式写入 `pose_action_sex`，可见装置或卵体写入 `scene_environment`。

| 异种类型 | `appearance` 候选内容 | `pose_action_sex` 候选内容 |
|---|---|---|
| 触手 | `tentacles`、`multiple tentacles` | `tentacle sex`、`bound by tentacles`、`oviposition` |
| 动物 | 按用户指定的动物填写外观标签；按画面加入 `knot` | `bestiality`、`mounting`、`breeding` |
| 史莱姆 | `slime`、`slime girl`、`slime body`、`translucent slime` | `tentacle slime`、`absorption`、`inside slime` |
| 兽人 | `orc`、`goblin`、`muscular monster`、`huge penis` | `mating press`、`breeding` |
| 虫类 | `insect`、`arachnid`、`parasite` | `oviposition`、`egg laying`、`infestation` |
| 机械 | `machine`、`robot`、`android`、`mechanical tentacles` | `automated milking` |
| 外星生物 | `alien`、`xenomorph` | `probing`、`abduction` |

| 可见物件 | `scene_environment` 候选内容 |
|---|---|
| 触手巢穴或触手卵 | `tentacle pit`、`tentacle egg` |
| 榨乳装置 | `milking machine` |
| 外星卵体 | `alien egg` |

当体型差是画面重点时，`appearance` 加入 `size difference`。当人物正在抗拒、无法承受或已经疲惫时，`expression_reaction` 分别使用 `struggling`、`overwhelmed` 或 `exhausted`。

### 14.6 调教与宠物化

用户要求调教或宠物化时，Skill 执行者必须选择一种动物化行为，并用服装配饰、控制道具或场景设施表现主人与宠物的关系。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 宠物配饰 | `clothing_state` | `collar`、`bell collar`、`harness`、`cat ears`、`paw gloves` |
| 控制或训练道具 | `pose_action_sex` | `leash`、`tail plug`、`bit gag` |
| 犬化行为 | `pose_action_sex` | `puppy play`、`on all fours`、`crawling`、`panting`、`tongue out` |
| 猫化行为 | `pose_action_sex` | `kitten play`、`paw pose`、`tail wag` |
| 进食训练 | `pose_action_sex` | `eating from bowl`、`on floor` |
| 服从展示 | `pose_action_sex` | `presenting`、`kneeling`、`spread legs` |
| 主动服从 | `expression_reaction` | `obedient`、`submissive`、`devoted`、`happy` |
| 被迫服从 | `expression_reaction` | `empty eyes`、`expressionless` |
| 所有权标记 | `appearance` | `body writing`、`tally marks`、`ownership mark`、`brand` |
| 宠物生活设施 | `scene_environment` | `cage`、`kennel`、`pet bowl on floor` |
| 户外牵引 | `scene_environment` | `outdoors`、`public`、`crowd` |

当画面需要明确主人时，Skill 执行者必须把主人计入 `count_gender`，并在 `natural_language` 中说明谁牵引、命令或展示谁。

### 14.7 胁迫

本节的胁迫包括职权、债务、秘密、暴力、药物和群体压力。Skill 执行者必须选择与用户情节一致的胁迫来源，并用可见证据表现该来源。

| 胁迫来源 | 槽位 | 候选内容 |
|---|---|---|
| 职权或经济控制 | `pose_action_sex` | `blackmail`、`power imbalance`、`economic dependence` |
| 职权或经济控制的场所 | `scene_environment` | `office`、`desk` |
| 职权或经济控制的可见证据 | `scene_environment` | `contract`、`debt notice` |
| 秘密或偷拍视频 | `pose_action_sex` | `blackmail`、`being watched`、`recording` |
| 秘密或偷拍视频的可见证据 | `scene_environment` | `hidden camera`、`phone screen visible` |
| 暴力强制 | `pose_action_sex` | `rape`、`held down`、`restrained`、`knife`、`gun` |
| 药物作用 | `pose_action_sex` | `drugged`、`spiked drink` |
| 药物作用后的身体状态 | `expression_reaction` | `unconscious`、`limp body`、`expressionless` |
| 三名及以上男性入镜 | `count_gender` | 填写所有入镜人物的实际性别人数标签；男性达到三名时加入 `multiple boys` |
| 群体压力 | `pose_action_sex` | `gang rape`、`surrounded` |
| 抗拒 | `expression_reaction` | `reluctant`、`scared`、`struggling`、`crying` |
| 放弃抵抗 | `expression_reaction` | `given up`、`empty eyes`、`mind break` |

当标签不能说明施压者、受迫者和胁迫证据之间的关系时，Skill 执行者必须用一个 `natural_language` 短句写清谁利用什么证据迫使谁做什么。

### 14.8 偷窥与展示

用户要求偷窥时，Skill 执行者必须写明观看渠道和被看者是否察觉。用户要求主动展示时，Skill 执行者必须写明展示渠道和展示动作。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 从窗外偷窥 | `camera_shot` | 同时使用 `from outside`、`through window` |
| 从门缝或锁孔偷窥 | `camera_shot` | `through door gap`、`keyhole view` |
| 偷窥动作 | `pose_action_sex` | `peeping`、`voyeurism` |
| 偷拍画面 | `camera_shot` | `hidden camera pov`、`fake screenshot`、`viewfinder` |
| 被看者未察觉 | `expression_reaction` | `unaware` |
| 被看者突然发现 | `expression_reaction` | `caught`、`surprised`、`!` |
| 自拍展示 | `pose_action_sex` | `selfie`、`presenting` |
| 直播展示 | `pose_action_sex` | `streaming`、`presenting` |
| 展示者直视观众 | `expression_reaction` | `direct eye contact` |
| 自拍或直播界面 | `scene_environment` | `mirror`、`webcam`、`computer screen`、`chat visible`、`donation alert` |
| 被看者当时的行为 | `pose_action_sex` | `sleeping`、`showering`、`changing clothes`、`masturbating`、`having sex` |

偷窥者入镜时，Skill 执行者必须把偷窥者计入 `count_gender`。偷窥者不入镜时，Skill 执行者使用相应的窥视镜头标签，不增加人物数量。

### 14.9 事后

用户要求事后画面时，Skill 执行者必须在 `pose_action_sex` 中加入 `after sex`。结束后的姿势、情绪、体液残留、服装状态和场景痕迹只在画面实际包含对应内容时选择。当前画面没有继续发生性行为时，Skill 执行者只写残留状态，不添加新的性交动作。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 结束后的姿势 | `pose_action_sex` | `lying on bed`、`cuddling`、`spooning`、`washing each other`、`getting dressed`、`leaving` |
| 温存或满足 | `expression_reaction` | `afterglow`、`satisfied`、`peaceful`、`asleep` |
| 疲惫或空虚 | `expression_reaction` | `exhausted`、`heavy breathing`、`empty eyes`、`ashamed`、`regret` |
| 体液残留 | `expression_reaction` | `cumdrip`、`cum on body`、`cum on sheets`、`cum pool` |
| 服装状态 | `clothing_state` | `disheveled clothes`、`unworn clothes`、`partially undressed` |
| 床铺和消耗品 | `scene_environment` | `crumpled sheets`、`used tissue`、`used condom`、`condom wrapper` |
| 时间和其他物件 | `scene_environment` | `morning`、`wine glass`、`cigarette`、`pregnancy test`、`morning after pill` |

### 14.10 另类日常

另类日常把裸体、隐蔽玩具或性行为放入做饭、清洁、通勤、办公、休息或娱乐等日常活动。Skill 执行者必须同时选择一种日常活动和一种性相关状态；人物把该状态视为日常时，`expression_reaction` 使用 `casual`、`natural` 或 `expressionless`。

| 变体 | `clothing_state` | `pose_action_sex` | `scene_environment` |
|---|---|---|---|
| 裸体家务 | `nude` | `housework`、`cooking`、`cleaning` | `kitchen`、`laundry room` |
| 裸体围裙做饭 | 同时使用 `naked apron`、`bottomless` | `cooking` | `kitchen`、`cooking pot` |
| 隐蔽玩具外出 | 按用户指定的外出服装填写 | `egg vibrator`、`remote controlled vibrator`、`inserted` | `street`、`train`、`office` |
| 肛塞日常 | 按用户指定的日常服装填写 | `butt plug`、`tail plug` | 按用户指定的日常场所填写 |
| 情趣内衣通勤 | `lingerie under clothes` | 按用户指定的日常动作填写 | `office`、`train` |
| 假装睡着诱惑 | 按用户指定的睡衣或裸体状态填写 | `pretending to sleep`、`provocative pose` | `bedroom`、`bed` |
| 游戏时发生性行为 | 按用户指定的居家服装填写 | `playing games`、`holding controller`，以及用户指定的性行为 | `living room`、`couch` |

当性相关状态需要对旁人隐藏时，Skill 执行者用 `natural_language` 说明被服装、桌面或人物姿势遮住的内容。

### 14.11 大车小孩

用户要求大车小孩时，Skill 执行者必须用实际人数标签和外观标签表现双方的年龄、身高或体型反差，并写明主导方和具体动作。

| 画面要求 | 槽位 | 候选内容 |
|---|---|---|
| 一名女性与一名男性 | `count_gender` | 同时使用 `1girl`、`1boy`、`hetero`、`onee-shota` |
| 女性外观 | `appearance` | `mature female`、`tall female`、`large breasts`、`curvy` |
| 男性外观 | `appearance` | `shota`、`petite male`、`small penis` |
| 双方反差 | `appearance` | `height difference`、`size difference`、`age difference` |
| 女性主导 | `pose_action_sex` | `girl on top`、`cowgirl position`、`lifting`、`breastfeeding` |
| 男性主导 | `pose_action_sex` | `boy on top`、`sex from behind`、`mating press` |
| 女性反应 | `expression_reaction` | `motherly`、`gentle`、`confident` |
| 男性反应 | `expression_reaction` | `blush`、`nervous` |
| 男性第一次经历性行为 | `natural_language` | `the boy is visibly nervous during his first sexual experience` |
| 教导关系 | `natural_language` | `the mature woman gently guides the inexperienced boy` |

多人变体必须按照实际入镜人数改写 `count_gender`，并用 `natural_language` 说明每名人物的动作对象。

### 14.12 隐奸

隐奸画面通过裁剪、前景遮挡、介质遮挡或上下区域对比，使观众只能看到性行为的一部分或可见线索。Skill 执行者必须从下表选择一种主要遮挡方法，并用 `natural_language` 写清可见区域和被遮挡区域分别发生什么。

| 遮挡方法 | 槽位 | 候选内容或写法 |
|---|---|---|
| 画面边缘裁剪 | `camera_shot` | `head out of frame`；用户要求只显示足部或臀部时，分别使用 `feet focus` 或 `ass focus` |
| 画面边缘裁剪 | `natural_language` | 明确写出画面保留的身体范围和画面外的身体范围 |
| 桌面或前景遮挡 | `scene_environment` | `table`、`under table` |
| 桌面遮挡 | `natural_language` | 分别说明桌面上方的日常动作和桌面下方的性行为 |
| 其他前景遮挡 | `natural_language` | 说明前景物体、物体后方的人物部分和被遮住的动作 |
| 磨砂玻璃遮挡 | `scene_environment` | `frosted glass`、`condensation` |
| 被子、浴帘或狭小隔间遮挡 | `scene_environment` | `bed`、`under covers`、`shower curtain`、`locker`、`cubicle` |
| 伪媒介画面 | `camera_shot` | `fake screenshot`、`viewfinder`、`cellphone photo` |
| 暗示性角度 | `camera_shot` | `view between legs`、`through legs` |
| 未直接显示的性行为 | `pose_action_sex` | `implied sex`、`implied fellatio` |

具体规则：

1. 使用桌面遮挡时，Skill 执行者必须把桌面上方的日常动作和桌面下方的性行为分别写成两个 `natural_language` 短句。使用其他前景遮挡时，两个短句分别说明前景物体和物体后方被遮住的动作。
2. 使用磨砂玻璃、被子或浴帘遮挡时，Skill 执行者必须保持被遮挡区域不可直接看清；该变体不使用 `x-ray`。
3. 画面出现可见体液或身体颤抖时，`expression_reaction` 使用对应标签；画面突出脚趾蜷曲时，`pose_action_sex` 使用 `toe scrunch`；画面使用动作线表现移动时，`detail_mood` 使用 `motion lines`。
4. 用户同时要求偷窥和隐奸时，Skill 执行者可以加入 `peeping`、`voyeurism` 或 `hidden camera pov`；只要求隐奸时，使用本节的裁剪或遮挡标签。
