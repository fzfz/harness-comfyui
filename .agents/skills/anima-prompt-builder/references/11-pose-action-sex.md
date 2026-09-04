## 9. 姿势、动作与性行为

对应槽位：`pose_action_sex`。

本文件用于选择人物姿势、参与者动作、身体接触关系、性行为、直接参与动作的道具以及性行为的直接结果。

### 9.0 动作构造规则

1. 先选择一个核心姿势或性行为，再选择与该核心动作兼容的肢体姿势和动作变化。
2. 单张连续画面中的每名参与者使用一种身体支撑状态，例如站立、坐姿、跪姿、仰卧、俯卧或悬空。
3. 双人和多人动作分别写明施动者、受动者、动作方向与接触部位。
4. 表格中使用 `/` 分隔的代码项彼此择一；同一个代码项内使用逗号连接的标签属于一个完整组合；表格正文另有数量要求时按照该要求选择。
5. `pose_action_sex` 保存姿势、动作、身体接触关系、直接参与动作的道具、与接触方式绑定的覆盖状态和性行为的直接结果。人物服装、表情、镜头、场景地点和画面效果分别写入对应槽位。

#### 9.0.1 性行为与束缚道具索引

下表只收录直接参与姿势、互动或性行为的道具。

| 道具用途 | 标签与动作 |
|---|---|
| 手脚与身体束缚 | `handcuffs` / `shackles` / `ropes` / `chains` / `duct tape` / `spreader bar` |
| 口部束缚 | `ball gag` / `bit gag` / `ring gag` / `cloth gag` / `tape over mouth` |
| 遮挡视线 | `blindfold` / `eye mask` |
| 项圈牵引 | `collar and leash` / `choker and leash` / `bell collar and leash` / `spiked collar and leash` / `o-ring choker and leash` |
| 震动刺激 | `vibrator` / `egg vibrator` / `wand vibrator` / `remote control vibrator` |
| 插入或摩擦 | `dildo` / `double dildo` / `strap-on` / `suction cup dildo` |
| 肛门刺激 | `butt plug` / `tail plug` / `anal beads` |
| 乳房与乳头刺激 | `nipple clamps` / `clothespins` |
| 阴茎摩擦 | `artificial vagina` / `onahole` / `masturbator` |
| 润滑、温度或滴落 | `lotion` / `oil` / `candle wax` / `ice` / `whipped cream` |
| 贞操控制 | `chastity cage` / `chastity belt` |
| 鞭打或触碰 | `feather` / `whip` / `crop` / `paddle` |
| 性行为防护 | `condom` |

### 9.1 单人姿势与动作

#### 9.1.1 诱惑姿态

本节用于构造单人主动展示身体或主动制造性暗示的姿势。

| 动作维度 | 标签 |
|---|---|
| 基础姿势，择一 | `standing` / `sitting` / `kneeling` / `squatting` / `standing bent over with feet on ground` / `on all fours` |
| 躯干与腿部动作 | `arched back` / `spread legs` / `legs crossed` / `arms up` / `presenting ass` |
| 手部动作 | `touching own breasts` / `hand on own breast` / `grabbing own breast` / `hand between own legs touching crotch` / `hand on own crotch` / `finger on lips` / `finger in mouth` |
| 口部动作 | `licking lips` / `tongue out` / `sucking finger` / `biting lower lip` / `condom in mouth` |
| 服装互动 | `clothes pull by self` / `skirt lift by self` / `shirt lift by self` / `undressing` |
| 手持物件 | `holding vibrator` / `holding condom` / `holding phone` / `holding wine glass` |

服装互动标签只与画面中实际存在的对应服装组合。

组合示例：

- `standing, arched back, hand on own breast, licking lips`
- `kneeling, spread legs, shirt lift by self, hand between own legs touching crotch`
- `standing bent over with feet on ground, presenting ass, skirt lift by self, condom in mouth`

#### 9.1.2 暴露与露出动作

本节用于选择暴露原因、被暴露部位以及人物对身体或服装采取的动作。

| 动作维度 | 标签 |
|---|---|
| 基础姿势，择一 | `standing` / `sitting` / `kneeling` / `squatting` |
| 暴露原因 | `accidental exposure` / `clothes slip` / `skirt lift by wind` / `torn clothes exposure` / `wet clothes exposure` / `undressing` |
| 观察方式 | `downblouse` / `upskirt` |
| 被暴露部位 | `areola slip` / `nipples visible` / `breasts out` / `one breast out` / `pussy visible` / `bare ass` |
| 主动暴露动作 | `skirt lift by self` / `shirt lift by self` / `clothes pull by self` / `presenting breasts` / `presenting pussy` |
| 遮挡动作 | `covering own breasts` / `covering own crotch` / `trying to pull clothes down` |

每张图片选择一种暴露原因或一种主动暴露动作，并选择一个被暴露部位。人物可以同时采取一种遮挡动作。

组合示例：

- `standing, accidental exposure, downblouse, areola slip, trying to pull clothes down`
- `standing, skirt lift by wind, upskirt, pussy visible, covering own crotch`
- `kneeling, shirt lift by self, breasts out`

#### 9.1.3 自慰

本节用于明确人物使用手、身体表面或道具刺激自己的具体部位。

| 动作维度 | 标签 |
|---|---|
| 基础姿势，择一 | `lying on back` / `lying on stomach` / `sitting` / `squatting` / `kneeling` / `on all fours` |
| 手部刺激 | `fingering own pussy` / `anal fingering by self` / `rubbing own clitoris` |
| 震动器刺激 | `vibrator on own clitoris` / `wand vibrator on own pussy` / `egg vibrator inside own pussy` |
| 假阳具刺激 | `dildo in own pussy` / `dildo in own anus` / `one dildo in own pussy and one dildo in own anus` |
| 身体表面摩擦 | `humping pillow` / `rubbing own crotch on table edge` / `shower head spraying own clitoris` / `rubbing own crotch on exercise ball` |
| 肛门玩具动作 | `inserting anal beads by self` / `pulling anal beads by self` / `butt plug insertion by self` |

每张图片至少选择一种刺激动作，并使道具、接触部位和基础姿势能够同时成立。

组合示例：

- `lying on back, fingering own pussy`
- `squatting, dildo in own pussy, pulling anal beads by self`
- `lying on stomach, humping pillow`

#### 9.1.4 身体展示、自拍与直播动作

本节用于明确人物展示的身体部位、展示动作以及记录动作。

| 动作维度 | 标签 |
|---|---|
| 基础姿势，择一 | `standing` / `sitting` / `squatting` / `standing bent over with feet on ground` |
| 腿部动作 | `spread legs` / `legs together` / `one leg raised` |
| 展示动作 | `presenting pussy` / `presenting anus` / `presenting armpit` / `presenting feet` / `open pussy by self` / `skirt lift by self` / `holding underwear up` |
| 记录动作 | `taking selfie with phone` / `recording self with phone` / `streaming with webcam` / `holding mirror to crotch` |
| 镜前动作 | `looking at own reflection` / `posing in front of mirror` |

自拍或直播组合包含一种记录动作；镜中观察组合包含一种镜前动作或 `holding mirror to crotch`。

组合示例：

- `sitting, spread legs, open pussy by self, taking selfie with phone`
- `squatting, presenting pussy, streaming with webcam`
- `standing, skirt lift by self, holding mirror to crotch`

### 9.2 双人前戏

本节中的每个组合包含两名参与者，并明确双方姿势和身体接触关系。

#### 9.2.1 口交

口交组合从下表选择一种双方体位和一种口部动作；控制动作与所选体位位于同一行。

| 双方体位，整行择一 | 口部动作，择一 | 兼容手部动作 |
|---|---|---|
| `girl kneeling in front of boy and boy standing` | `girl licking boy's penis` / `girl sucking boy's penis` / `girl deepthroating boy's penis` | `girl holding boy's penis with both hands` / `boy holding girl's head` |
| `girl sitting on floor in front of boy and boy standing` | `girl sucking boy's penis` / `girl deepthroating boy's penis` | `girl holding boy's hips` / `boy grabbing girl's hair` |
| `girl lying on back with head at edge of bed and boy standing beside girl's head` | `boy inserting his penis into girl's mouth, irrumatio` | `boy holding girl's head` |
| `girl on all fours and boy standing in front of girl's head` | `girl sucking boy's penis` / `boy inserting his penis into girl's mouth, irrumatio` | `boy holding girl's head` |

性行为结果按用户要求从 `boy's cum in girl's mouth`、`boy ejaculating on girl's face` 和 `boy's cum on girl's tongue` 中选择一个。

组合示例：

- `girl kneeling in front of boy and boy standing, girl sucking boy's penis, girl holding boy's penis with both hands`
- `girl on all fours and boy standing in front of girl's head, boy inserting his penis into girl's mouth, irrumatio, boy holding girl's head`

#### 9.2.2 足交

足交组合包含 `footjob`，并从“足部动作”一行选择脚如何作用于阴茎。

| 动作维度 | 标签 |
|---|---|
| 双方姿势，择一 | `girl lying on back and boy kneeling at girl's feet` / `girl lying on stomach and boy kneeling behind girl's feet` / `girl sitting and boy sitting opposite girl` / `girl standing over boy's hips and boy lying on back` |
| 足部动作，择一 | `girl's foot on boy's penis` / `girl giving boy two-footed footjob` / `girl squeezing boy's penis between her soles` / `girl rubbing boy's penis with her toes` |
| 男方动作 | `boy holding girl's ankle` / `boy holding girl's feet` |
| 足部覆盖状态 | `girl's bare feet during footjob` / `girl's pantyhose-covered feet during footjob` / `girl's stocking-covered feet during footjob` |
| 润滑动作 | `oil on girl's feet` / `lotion on girl's feet` |
| 性行为结果 | `boy ejaculating on girl's feet` / `boy ejaculating on girl's soles` / `boy ejaculating between girl's toes` |

组合示例：

- `footjob, girl lying on stomach and boy kneeling behind girl's feet, girl giving boy two-footed footjob, girl's bare feet during footjob`
- `footjob, girl sitting and boy sitting opposite girl, girl's pantyhose-covered feet during footjob, girl squeezing boy's penis between her soles, boy holding girl's ankle`

#### 9.2.3 素股

素股组合必须包含 `thigh sex` 或 `penis between thighs`。

| 动作维度 | 标签 |
|---|---|
| 双方体位，择一 | `boy sitting and girl sitting on boy's lap` / `boy lying on side and girl lying beside boy` / `boy standing and girl standing in front of boy` |
| 核心接触 | `girl rubbing boy's penis between her thighs, thigh sex` / `girl squeezing and sliding her thighs along boy's penis, penis between thighs` |
| 手部辅助 | `girl giving boy handjob during thigh sex` / `boy holding girl's thighs` |
| 润滑动作 | `lotion on girl's thighs` / `oil on girl's thighs` |
| 性行为结果 | `boy ejaculating on girl's thighs` / `boy ejaculating between girl's thighs` |

组合示例：

- `boy sitting and girl sitting on boy's lap, girl rubbing boy's penis between her thighs, thigh sex`
- `boy standing and girl standing in front of boy, girl squeezing and sliding her thighs along boy's penis, penis between thighs, girl giving boy handjob during thigh sex`

#### 9.2.4 手交

手交组合明确施动者使用一只手或两只手刺激受动者阴茎。`two-handed handjob` 表示同一名施动者使用双手。

| 动作维度 | 标签 |
|---|---|
| 手部动作，择一 | `girl giving boy handjob` / `girl rubbing boy's glans with one hand` / `girl giving boy two-handed handjob` / `girl giving boy reach-around handjob` |
| 双方姿势，择一 | `girl kneeling in front of boy and boy standing` / `girl sitting beside boy and boy sitting` / `girl standing behind boy and boy standing` / `girl sitting on boy's lap and boy sitting` |
| 覆盖方式 | `girl wrapping her removed panties around boy's penis and stroking through the fabric` / `girl wrapping a removed stocking around boy's penis and stroking through the fabric` / `girl stroking boy's penis with latex gloves` |
| 润滑动作 | `girl using oil to stroke boy's penis` / `girl using lotion to stroke boy's penis` |
| 性行为结果 | `boy ejaculating on girl's hand` / `boy ejaculating inside the removed panties wrapped around his penis` / `boy ejaculating on girl's face` |

组合示例：

- `girl kneeling in front of boy and boy standing, girl giving boy two-handed handjob, girl using lotion to stroke boy's penis`
- `girl standing behind boy and boy standing, girl giving boy reach-around handjob`

#### 9.2.5 乳交

乳交组合以 `paizuri` 为核心动作，并明确乳房对阴茎的挤压方式。

| 乳交体位，择一 | 核心接触 | 兼容附加动作 |
|---|---|---|
| `girl kneeling and boy standing` | `girl squeezing boy's penis between her breasts, paizuri` | `girl giving boy handjob during paizuri` / `girl performing fellatio during paizuri` / `lotion on girl's breasts` |
| `boy lying on back and girl kneeling over boy's hips` | `girl squeezing boy's penis between her breasts, paizuri` | `girl giving boy handjob during paizuri` |
| `boy lying on back and girl lying beside boy` | `girl squeezing boy's penis between her breasts, paizuri` | `lotion on girl's breasts` / `oil on girl's breasts` |
| `boy lying on back with legs raised and hips lifted, girl lying in reverse over boy's body` | `girl squeezing boy's penis between her breasts in reverse paizuri position` | `girl licking boy's anus during reverse paizuri` |

组合示例：

- `girl kneeling and boy standing, girl squeezing boy's penis between her breasts, paizuri, lotion on girl's breasts`
- `boy lying on back and girl kneeling over boy's hips, girl squeezing boy's penis between her breasts, paizuri, girl giving boy handjob during paizuri`

#### 9.2.6 猥亵与强制触碰

本节用于构造一名参与者对另一名参与者实施的未经同意触碰、暴露或身体控制动作。

| 组合类型，整行择一 | 双方姿势、触碰与控制动作 | 兼容的女方抗拒动作 |
|---|---|---|
| 站立背后摸胸 | `boy standing behind girl and girl standing, boy groping girl's breasts, boy holding one of girl's wrists` | `girl trying to break free` / `girl covering own breasts` |
| 压墙摸裆 | `boy standing face-to-face with girl and girl standing against wall, boy groping girl's crotch, boy pinning girl against wall` | `girl pushing boy away` / `girl trying to break free` |
| 坐姿衣内触摸 | `boy sitting beside girl and girl sitting, boy touching girl's breasts under clothes` | `girl covering own breasts` / `girl pushing boy away` |
| 坐姿掀裙摸裆 | `boy sitting beside girl and girl sitting, boy lifting girl's skirt, boy groping girl's crotch` | `girl pulling skirt down` / `girl trying to break free` |

组合示例：

- `boy standing behind girl and girl standing, boy groping girl's breasts, boy holding one of girl's wrists, girl trying to break free`
- `boy sitting beside girl and girl sitting, boy lifting girl's skirt, boy groping girl's crotch, girl pulling skirt down`

### 9.3 双人性交与控制动作

以下各节使用“整行择一”的动作表。选定一行后，可以添加该行列出的兼容动作或结果。性交行直接写明进入部位；预备插入、睡眠触摸、催眠展示和 Femdom 控制行直接写明当前动作。

用户明确要求肛交时，将所选性交行中的 `boy penetrating girl's vagina` 或 `boy's penis in girl's vagina` 分别替换为 `boy penetrating girl's anus` 或 `boy's penis in girl's anus`，并保留该行定义的双方姿势。

#### 9.3.1 正身位（传教士）

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 标准传教士 | `girl lying on back, boy kneeling over girl, boy penetrating girl's vagina, missionary` | `girl spread legs` / `boy holding girl's hips` / `deep penetration` |
| 提腿传教士 | `girl lying on back, boy kneeling over girl, boy penetrating girl's vagina, missionary, girl's legs up` | `boy holding girl's ankles` / `girl's legs on boy's shoulders` / `deep penetration` |
| 并腿传教士 | `girl lying on back, boy kneeling over girl, boy penetrating girl's vagina, missionary, girl's legs together` | `boy holding girl's thighs` / `shallow penetration` |
| 压制传教士 | `girl lying on back, boy kneeling over girl, boy penetrating girl's vagina, missionary, boy holding girl's wrists` | `girl trying to break free` / `rough sex` |
| 预备插入 | `girl lying on back, boy kneeling between girl's legs and leaning over girl, imminent penetration` | `boy holding penis near girl's pussy` / `girl spread legs` |

#### 9.3.2 站立位

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 面对站立 | `girl standing, boy standing, boy penetrating girl's vagina face-to-face, both feet on ground` | `boy holding girl's waist` / `girl's arms around boy's neck` |
| 压墙后入 | `girl standing against wall, boy standing behind girl, boy penetrating girl's vagina from behind, both feet on ground` | `girl's hands on wall` / `boy holding girl's hips` |
| 单腿抬起 | `girl standing face-to-face with boy on one leg, boy standing in front of girl, boy penetrating girl's vagina face-to-face, girl's other leg lifted` | `boy supporting girl's lifted leg` / `girl holding boy's shoulder` |
| 弯腰站立后入 | `girl standing bent over with feet on ground, boy standing behind girl, boy penetrating girl's vagina from behind` | `girl's hands on wall` / `boy holding girl's hips` |

#### 9.3.3 坐身位

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 面对坐位 | `boy sitting, girl sitting on boy's lap, boy's penis in girl's vagina, face-to-face upright straddle` | `girl grinding` / `girl's arms around boy's neck` |
| 反向坐位 | `boy sitting, girl sitting on boy's lap facing away, boy's penis in girl's vagina, reverse upright straddle` | `girl grinding` / `boy holding girl's hips` |
| 侧坐位 | `boy sitting, girl sitting sideways on boy's lap, boy's penis in girl's vagina` | `boy holding girl's thigh` / `girl leaning against boy` |
| 背靠坐位 | `boy sitting, girl sitting between boy's legs, boy's penis in girl's vagina, back-to-chest sex` | `boy holding girl's waist` / `girl leaning back` |

#### 9.3.4 后入位

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 四足后入 | `girl on all fours, boy kneeling behind girl, boy penetrating girl's vagina, doggystyle` | `boy holding girl's hips` / `boy pulling girl's hair` |
| 弯腰后入 | `girl standing bent over with feet on ground and hands on knees, boy standing behind girl, boy penetrating girl's vagina from behind` | `boy holding girl's waist` / `boy pulling girl's hair` |
| 反剪弯腰后入 | `girl standing bent over with feet on ground and torso supported by table, boy standing behind girl, boy penetrating girl's vagina from behind` | `boy holding girl's arms behind her back` |
| 俯卧后入 | `girl lying on stomach, boy lying over girl, boy penetrating girl's vagina, prone bone` | `boy holding girl's wrists` / `girl's legs together` |
| 侧卧后入 | `girl lying on side, boy lying behind girl, boy penetrating girl's vagina from behind, side doggy` | `boy holding girl's thigh` / `girl's upper leg lifted` |

#### 9.3.5 火车便当

火车便当由男方承担女方体重，女方双脚离地。

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 正面悬空 | `boy standing and carrying girl, girl facing boy, boy's penis in girl's vagina, suspended congress, girl's feet off ground` | `girl's legs around boy's waist` / `girl's arms around boy's neck` |
| 背面悬空 | `boy standing and carrying girl from behind, boy penetrating girl's vagina from behind, reverse suspended congress, girl's feet off ground` | `boy holding girl's thighs` / `girl leaning back against boy` |
| 折叠悬空 | `boy standing and carrying girl, girl facing boy and folded with legs up, girl's feet off ground, boy's penis in girl's vagina, suspended congress` | `boy holding girl's ankles` / `deep penetration` |

#### 9.3.6 种付位

种付位使用女方仰卧、双腿折向躯干、男方从上方覆盖的身体结构。

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 标准种付 | `girl lying on back, girl's legs folded toward chest, boy kneeling over girl, boy penetrating girl's vagina, mating press` | `deep penetration` / `boy holding girl's thighs` / `creampie` |
| 抓踝种付 | `girl lying on back, girl's legs folded, boy kneeling over girl, boy penetrating girl's vagina, mating press, boy holding girl's ankles` | `deep penetration` / `creampie` |
| 肩上腿种付 | `girl lying on back, girl's legs on boy's shoulders, boy kneeling over girl, boy penetrating girl's vagina, mating press` | `boy holding girl's hips` / `deep penetration` / `creampie` |

#### 9.3.7 骑乘位

| 体位变体 | 核心标签 | 兼容动作与主导关系 |
|---|---|---|
| 主动骑乘 | `boy lying on back, girl sitting astride boy, boy's penis in girl's vagina, cowgirl position` | `girl grinding` / `girl bouncing` / `girl holding boy's chest` |
| 逆骑乘 | `boy lying on back, girl sitting astride boy facing away, boy's penis in girl's vagina, reverse cowgirl position` | `girl grinding` / `boy holding girl's hips` |
| 敷衍骑乘 | `boy lying on back, girl sitting astride boy, boy's penis in girl's vagina, cowgirl position, minimal movement` | `girl holding phone` / `girl reading book` |
| 被迫骑乘 | `boy lying on back, girl sitting astride boy, boy's penis in girl's vagina, boy forcing girl to ride` | `boy holding girl's hips` / `girl trying to stop movement` |

#### 9.3.8 睡奸

睡奸组合包含 `sleeping` 或 `unconscious`。睡眠或无意识参与者由床面或清醒参与者支撑身体，不主动完成动作；清醒参与者发起性行为并调整对方身体。`drunk` 可以说明原因，但不能替代睡眠或无意识标签。

| 体位变体 | 核心标签 | 兼容动作与结果 |
|---|---|---|
| 睡眠触摸 | `girl sleeping on back, boy kneeling beside girl, boy touching girl's breasts` | `boy lifting girl's clothes` / `boy fingering sleeping girl's pussy` |
| 仰卧睡奸 | `girl sleeping, girl lying on back, boy kneeling over girl, boy penetrating girl's vagina, missionary, sleep molestation` | `boy holding girl's legs apart` |
| 侧卧睡奸 | `girl sleeping, girl lying on side, boy lying behind girl, boy penetrating girl's vagina from behind, sleep molestation` | `boy holding girl's waist` |
| 俯卧睡奸 | `girl unconscious, girl lying on stomach, boy lying over girl, boy penetrating girl's vagina, prone bone` | `boy holding girl's hips` |

#### 9.3.9 催眠

催眠组合中的被控人物保持清醒，并执行一种明确的受控动作。催眠工具和界面内容由场景槽位描述。

| 被控动作，择一 | 标签 |
|---|---|
| 站立敬礼 | `girl hypnotized, girl standing, girl saluting` |
| 跪姿服从 | `girl hypnotized, girl kneeling with hands behind back` |
| 主动展示 | `girl hypnotized, girl standing, girl lifting own skirt, girl presenting pussy` |
| 受控性交 | `girl hypnotized and standing, boy standing behind girl, boy penetrating girl's vagina from behind` |

#### 9.3.10 攻守反转与 Femdom

本节中的女性是施动者，男性是受动者。

| 主导动作 | 双方姿势与接触关系 |
|---|---|
| 坐脸 | `girl sitting on boy's face, boy lying on back, facesitting` |
| 假阳具肛交 | `girl standing behind boy and wearing strap-on, boy standing bent over with hands on table, girl penetrating boy's anus, pegging` |
| 踩踏 | `girl standing beside boy, boy lying on floor, girl stepping on boy's chest` |
| 骑乘压制 | `boy lying on back, girl sitting astride boy, girl pinning boy's wrists to floor` |
| 贞操控制 | `girl standing in front of boy, boy kneeling in front of girl, girl holding chastity key, chastity cage on boy's penis` |
| 项圈牵引 | `girl standing in front of boy, boy on all fours behind girl, girl pulling boy forward by collar and leash` |

#### 9.3.11 过激性行为

本节将一种性交体位与一种明确施动者的暴力动作组合。

| 组合类型 | 核心标签 |
|---|---|
| 扼喉传教士 | `girl lying on back, boy kneeling over girl, boy penetrating girl's vagina, missionary, boy choking girl, rough sex` |
| 拉发后入 | `girl on all fours, boy kneeling behind girl, boy penetrating girl's vagina, doggystyle, boy pulling girl's hair, rough sex` |
| 反剪弯腰后入 | `girl standing bent over with feet on ground and torso supported by table, boy standing behind girl, boy penetrating girl's vagina from behind, boy holding girl's arms behind her back` |
| 压制俯卧后入 | `girl lying on stomach, boy lying over girl, boy penetrating girl's vagina, prone bone, boy holding girl's wrists` |
| 悬空后入 | `boy standing and carrying girl from behind, girl's feet off ground, boy penetrating girl's vagina from behind, boy choking girl` |

### 9.4 多人性行为

多人组合先选择一行接触关系，再使 `count_gender` 中的人数等于该行的确切人数。表中的“第一名男性”“第二名男性”和“第三名男性”分别表示不同参与者。

| 组合类型 | 确切参与者 | 所有参与者的姿势与同时发生的动作 |
|---|---:|---|
| 阴道前后夹击 | 一女二男 | `girl on all fours, first boy kneeling in front of girl, girl performing fellatio on first boy, second boy kneeling behind girl, second boy penetrating girl's vagina from behind, spitroast` |
| 肛交前后夹击 | 一女二男 | `girl on all fours, first boy kneeling in front of girl, girl performing fellatio on first boy, second boy kneeling behind girl, second boy penetrating girl's anus from behind, spitroast` |
| 双重插入 | 一女二男 | `first boy lying on back, girl sitting astride first boy with first boy's penis in girl's vagina, second boy kneeling behind girl and penetrating girl's anus, double penetration` |
| 三穴同入 | 一女三男 | `first boy lying on back, girl sitting astride first boy with first boy's penis in girl's vagina, second boy kneeling behind girl and penetrating girl's anus, third boy standing in front of girl while girl sucks third boy's penis, triple penetration` |
| 两女协同口交 | 二女一男 | `boy standing, first girl kneeling in front of boy and licking boy's penis, second girl kneeling beside first girl and sucking boy's penis, cooperative fellatio` |
| 轮流性交的当前阶段 | 一女三男 | `girl on all fours, first boy kneeling behind girl and penetrating girl's vagina from behind, second and third boys standing beside girl and waiting their turn, group sex` |

### 9.5 百合性行为

本节只包含女性参与者。每张图片从下表选择一种互动类型。

| 互动类型 | 双方姿势与接触关系 |
|---|---|
| 亲吻拥抱 | `first girl standing, second girl standing face-to-face with first girl, girls kissing, girls embracing` |
| 舔阴 | `first girl lying on back, second girl kneeling between first girl's legs, second girl licking first girl's pussy` |
| 坐脸舔阴 | `first girl lying on back, second girl sitting on first girl's face, first girl licking second girl's pussy, facesitting` |
| 女阴摩擦 | `first girl lying on side, second girl lying on side facing first girl, tribadism, scissoring, pussies rubbing together` |
| 手指刺激 | `first girl lying on back, second girl kneeling beside first girl, second girl fingering first girl's pussy` |
| 假阳具肛交 | `first girl standing behind second girl and wearing strap-on, second girl standing bent over with feet on ground and hands on table, first girl penetrating second girl's anus, pegging` |
| 共用震动器 | `first girl sitting, second girl sitting face-to-face with first girl, first girl holding vibrator between their pussies, both girls rubbing their pussies against vibrator` |
| 双头假阳具 | `first girl sitting, second girl sitting face-to-face with first girl, one end of double-ended dildo in first girl's vagina, other end in second girl's vagina, both girls moving their hips against double-ended dildo` |
