## 8. CLOTHING & STATE

对应槽位：`clothing_state`。

本槽位用于描述服装类型、材质、服装配饰、穿着状态、服装表面状态和服装改造方式。

### 8.1 服装与配饰速查

本节提供服装与配饰索引；§8.2–§8.4 提供材质、穿着状态、服装表面状态和服装改造标签。

#### 内衣、泳装、睡衣与轻便上衣
`bra` / `lace bra` | `panties` / `thong` / `g-string` | `lingerie` / `lace lingerie` | `corset` | `garter belt` | `babydoll` / `negligee` / `chemise` | `bodystocking` / `fishnet bodystocking` | `bikini` / `micro bikini` / `slingshot swimsuit` | `one-piece swimsuit` / `school swimsuit` / `competition swimsuit` | `pajamas` / `nightgown` / `silk robe` / `satin robe` | `oversized shirt` / `boyfriend shirt` / `camisole`

#### 职业与身份服装、配饰
`school uniform` / `sailor uniform` / `serafuku` | `business suit` / `white shirt` + `pencil skirt` | `nurse outfit` / `nurse cap` / `medical gown` | `white coat` / `lab coat` | `police uniform` / `police hat` | `flight attendant uniform` | `maid outfit` / `french maid outfit` / `maid headdress` | `glasses` | `waitress uniform` / `apron` | `naked apron`

#### 特殊服装与身份配饰
`bunnysuit` / `bunny ears` / `bunny tail` | `race queen outfit` | `kimono` / `yukata` / `miko outfit` | `hanfu` / `cheongsam` / `china dress` / `qipao` | `armor` / `bikini armor` / `damaged armor` | `witch hat` / `witch robe` / `nun habit` | `wedding dress` / `evening gown` | `idol costume` / `stage costume`

#### 袜类与鞋类
`thighhighs` / `black thighhighs` / `white thighhighs` | `pantyhose` / `black pantyhose` / `white pantyhose` | `fishnets` / `fishnet thighhighs` | `knee-high socks` / `ankle socks` / `loose socks` | `torn pantyhose` / `ripped stockings` | `high heels` / `stiletto heels` | `boots` / `thigh boots` / `ankle boots` | `mary janes` / `loafers` / `sneakers`

### 8.2 材质与表面质感

`silk` / `satin`（平滑表面与柔和反光） | `lace` / `lace trim`（蕾丝纹理或饰边） | `thin`（薄面料） | `see-through` / `sheer`（可透见内层或皮肤） | `transparent`（高透明） / `translucent`（半透明） | `cotton`（哑光棉质） | `latex` / `rubber` / `pvc`（胶质或塑胶材质） | `glossy` / `shiny`（高反光表面） | `leather`（皮革纹理） | `fishnets` / `mesh`（网孔结构）

### 8.3 穿着状态

穿着状态由一个或多个相互兼容的暴露状态标签，以及零个或多个附加状态标签组成：

| 类型 | 状态 | 标签 |
|---|---|---|
| 暴露程度 | 正常穿着 | 具体服装标签 |
| 暴露程度 | 滑落或局部露出 | `off shoulder` / `shoulder slip` / `strap slip` / `areola slip` / `panties peek` / `bra exposed` |
| 暴露程度 | 掀起或敞开 | `shirt lift` / `skirt lift` / `clothes lift` / `open shirt` / `unbuttoned` / `unzipped` / `open front` / `open fly` |
| 暴露程度 | 半脱 | `partially undressed` / `half-dressed` / `clothes pull` / `pants down` / `one leg out` |
| 暴露程度 | 全裸并保留配饰 | `completely nude` 加一个或多个标志性配饰标签 |
| 附加状态 | 服装破损 | `torn clothes` / `ripped clothes` / `torn pantyhose` / `damaged clothes` |
| 附加状态 | 服装湿透 | `wet clothes` / `wet shirt`；湿透后可见皮肤时，再添加 `see-through` / `nipples visible through clothes` |
| 附加状态 | 赤足 | `barefoot` |

#### 8.3.1 服装表面血迹

服装表面出现血迹时，使用 `bloodstain` 或 `blood on clothes`。

### 8.4 色情改造维度

使用“原服装 → 改造方向 → 最终服装状态”的顺序构建本槽位。以下七个改造维度可以叠加。

#### 8.4.1 透明化（See-through）
把服装面料改为透明或半透明材质。
- 基础：`see-through` / `transparent` / `sheer` / `translucent`
- 上衣：`see-through shirt` / `transparent shirt` / `see-through jacket` / `transparent jacket` / `see-through blouse`
- 下装：`see-through pants` / `transparent pants` / `see-through skirt` / `transparent shorts`
- 连体：`see-through leotard` / `translucent bodysuit` / `transparent bodysuit` / `see-through bodystocking`
- 特殊：`see-through dress` / `transparent dress` / `transparent wedding dress` / `see-through poncho` / `transparent tabard`
- 外套款：`naked jacket` + `see-through jacket` → 透明夹克内全裸
- 雨衣款：`clear transparent raincoat` / `glossy pvc material` / `wet appearance`
- 湿透自然透明：`wet clothes` / `wet shirt` / `nipples visible through clothes` / `see-through` + `wet`
- 组合示例：`translucent bodysuit, see-through sleeves, covered nipples` | `see-through shirt, wet, no bra, nipples visible` | `clear transparent raincoat, hood up, glossy pvc`

#### 8.4.2 裁剪/缩短化（Cropped/Micro）
通过缩短或裁剪服装露出指定身体区域。
- 上衣：`crop top` / `cropped jacket` / `cropped shirt` / `crop top overhang` / `crop jacket` / `cropped blouse`
- 下装：`micro skirt` / `micro shorts` / `micro panties` / `extremely short skirt` / `short shorts`
- 连体：`micro dress`
- 高露：`highleg` / `high cut` / `highleg leotard` / `highleg panties` / `highleg swimsuit`
- 侧露：`side slit` / `hip vent` / `high slit` / `single side slit`
- 无袖：`sleeveless` / `detached sleeves` / `bare shoulders` / `bare arms`
- 露背：`backless` / `bare back` / `backless outfit` / `backless dress`
- 组合示例：`sleeveless crop top, micro skirt, no panties` | `cropped jacket, bare shoulders, micro shorts, open fly`

#### 8.4.3 镂空、开口与局部裸露（Cutout/Open Exposure）
通过开口、裁剪或局部裸露突出指定身体区域。
- 胸：`cleavage cutout` / `chest cutout` / `deep v-neckline` / `exposed chest` / `breasts out`
- 下乳：`underboob cutout` / `underboob` / `sideboob`
- 腹：`navel cutout` / `stomach cutout` / `midriff cutout` / `clothing cutout`
- 腰：`side cutout` / `side cut-out` / `waist cutout`
- 胯：`crotch cutout` / `pussy cut` / `crotch zipper` / `crotchless panties` / `crotchless`
- 臀：`butt crack cutout` / `bare ass`
- 全身多开口：`center opening` / `sideless outfit` / `clothing cutout` + `revealing clothes`
- 组合示例：`bodysuit, cleavage cutout, underboob cutout, navel cutout, side cutout` | `crotch cutout dress, no panties, side slit, exposed pussy` | `sideless outfit, bare shoulders, no bra, sideboob`

#### 8.4.4 破损化（Torn/Damaged）
通过撕裂或损坏服装产生破口和皮肤暴露区域。
- 基础：`torn clothes` / `ripped clothes` / `damaged clothes` / `torn fabric`
- 上装：`torn shirt` / `torn dress` / `torn blouse` / `ripped shirt`
- 下装：`torn pants` / `torn jeans` / `torn shorts` / `torn skirt`
- 袜：`torn pantyhose` / `ripped stockings` / `torn stockings`
- 制服特化：`torn school uniform` / `torn ninja outfit` / `torn prison uniform` / `torn sacrament robe`
- 铠甲：`damaged armor` / `cracked breastplate` / `torn cape` / `battle damage`
- 暴露结果：`revealing clothes`
- 组合示例：`torn school uniform, ripped collar, torn pantyhose` | `damaged armor, cracked breastplate, torn cape` | `torn dress, revealing clothes, bare shoulders`

#### 8.4.5 胶衣/乳胶化（Latex/PVC）
使用 `latex`、`rubber` 或 `pvc` 标签替代原服装材质；需要服装紧贴身体轮廓时，再添加 `skintight` 或 `second skin`。
- 材质：`latex` / `rubber` / `pvc`
- 表面质感：`glossy` / `shiny` / `wet look`
- 连体：`latex bodysuit` / `latex catsuit` / `rubber bodysuit` / `pvc bodysuit` / `latex bodystocking`；可叠加 `skintight` / `second skin`
- 分体：`latex dress` / `latex pants` / `latex skirt` / `latex bra` / `latex leotard` / `latex chaps`
- 配饰：`latex gloves` / `latex elbow gloves` / `latex thighhighs` / `latex boots`
- 透明胶：`transparent pvc` / `transparent vinyl clothing`
- 组合示例：`latex bodysuit, shiny, skintight, second skin, highleg` | `black latex bodysuit, latex gloves, latex thighhighs, glossy, corset` | `transparent pvc bodysuit, see-through, neon trim`

#### 8.4.6 裸体状态与身份配饰（Naked + Accessories）
角色不穿贴身衣物，并通过配饰或敞开的外层服装表示原身份。
- 裸体与外层或覆盖配件：`naked jacket` / `naked cape` / `naked cloak` / `naked coat` / `naked ribbon` / `naked tabard` / `naked poncho`
- 裸+职业配件：`completely nude` + `police hat` → 裸体警察 | `completely nude` + `maid headdress` + `frilled socks` → 裸体女仆 | `completely nude` + `nurse cap` + `white gloves` → 裸体护士 | `completely nude` + `bunny ears` + `bowtie` → 裸体兔女郎
- 裸+围裙：`naked apron` / `naked apron, bottomless, no bra`
- 裸+日式：`naked kimono` / `open kimono, nude, no panties` | `naked hanfu, open robe, no panties`
- 裸+婚嫁：`naked wedding dress` / `naked ribbon, red veil, nude` / `honggaitou, naked, chinese wedding`
- 裸+战术：`nude, load bearing vest` | `completely nude, gas mask, belt`
- 组合示例：`completely nude, naked jacket, open jacket, no panties, high heels` | `naked apron, bottomless, no bra` | `naked see-through hooded cloak, hood up`

#### 8.4.7 非对称化（Asymmetrical）
通过左右两侧不同的服装或裸露状态形成可见的不对称。
- 袖：`one sleeve` / `single sleeve` / `asymmetrical sleeves` / `single glove` / `mismatched gloves`
- 腿部：`one leg out` / `one stocking rolled down` / `single thighhigh` / `single thigh boot` / `mismatched legwear` / `asymmetrical legwear`
- 鞋：`one shoe missing` / `one sneaker missing` / `single boot`
- 衣着与肩部：`off shoulder` / `single bare shoulder` / `one breast out` / `single side slit`
- 组合示例：`button-up shirt, off shoulder, single bare shoulder, one stocking rolled down, one shoe missing`

### 8.5 职业与身份服装组合示例

本节提供职业与身份服装的完整组合。每个组合使用一件主体服装，并添加明确的材质、穿着状态或身份配饰；裸体组合使用 `nude`、`completely nude` 或 `naked apron` 等已经包含裸体状态的复合服装标签，并保留身份配饰。

**警察**：
- 超短连衣裙款：`micro police dress, white thighhighs, cleavage cutout, police hat`
- V字泳装警察配饰款：`slingshot swimsuit, police hat, cropped jacket, o-ring`
- 渔网无内裤警服款：`police uniform, fishnet thighhighs, no panties`
- 高叉紧身衣警察配饰款：`police hat, blue leotard, highleg, cropped jacket, thong, black thighhighs`
- 警帽破损牛仔款：`pasties, torn jeans, police cap, fishnet legwear`
- 裸体绑带警察配饰款：`police hat, nude, o-ring harness, metal collar, nipple rings, latex gloves, used condom belt`
- 裸体警察款：`completely nude, police hat, whistle`

**护士**：
- 透明胶衣款：`transparent latex bodysuit, nurse cap`
- 弹弓泳衣款：`slingshot swimsuit, nurse cap, cropped nurse jacket`
- 破损绷带款：`torn nurse outfit, bandages, id card`
- 蕾丝内衣护士配饰款：`nurse cap, frilled lingerie, lace thighhighs, garter belt`
- 透明束带护士配饰款：`nurse cap, transparent harness, transparent chest belt, o-ring`
- 无裤微型内裤款：`nurse cap, strapless nurse top, micro panties, detached sleeves`
- 透明雨衣款：`clear transparent raincoat, glossy pvc material, hood up, erotic nurse uniform underneath, extremely short nurse skirt, deep v-neckline`
- 乳贴丁字裤护士配饰款：`nurse cap, g-string, pasties, bare shoulders, no bra`

**修女**：
- 乳帘修女配饰款：`nun veil, breasts curtain, no panties, cross necklace, white pantyhose`
- 透明连体袜修女配饰款：`nun veil, see-through bodystocking, breast curtains, pelvic curtain, cameltoe, cross necklace`
- 胶衣修女配饰款：`nun veil, latex catsuit, pussy cut, covered navel, shiny clothes, cross necklace`
- 逆兔修女配饰款：`nun veil, reverse bunnysuit, crotchless, cross necklace`
- 乳贴丁字裤修女配饰款：`nun veil, pasties, g-string, black thighhighs, elbow gloves, cross necklace`
- 皮革服装修女配饰款：`leather nun habit, sideboob, chains, cross`
- 帘幕式：`nun veil, white breast curtain, covered nipples, puffy sleeves, cross necklace`

**女仆**：
- 无袖下乳开口：`maid outfit, bare shoulders, clothing cutout, underboob, white apron, sleeveless`
- 裸体女仆：`nude, maid headdress, bridal garter, frilled socks, mary janes`
- 上身裸露款：`maid headdress, topless, black maid skirt, black thighhighs, no bra`
- 裸体围裙：`naked apron, no panties, no bra, maid headdress`
- 透明裁剪：`maid outfit, see-through, micro skirt, open front, crotchless panties`

**兔女郎**：
- 基础款：`bunny ears, black highleg leotard, black pantyhose, white collar, bowtie, cuffs`
- 透明款：`translucent bunnysuit, crotch cutout, transparent heels`
- 双色开口款：`two-tone leotard, cleavage cutout, side cutout, elbow gloves, bunny ears`
- 燕尾服兔女郎：`black tuxedo leotard, bunny ears, bunny tail, bowtie, fishnet pantyhose, half gloves`
- 逆兔女郎：`reverse bunnysuit, shrug, heart pasties, gloves`
- 逆兔兜帽配饰款：`hooded reverse bunnysuit, hood up, shiny clothes, x pasties, tape on pussy, gas mask around neck`
- 逆兔渔网手套配饰款：`reverse bunnysuit, shrug, heart pasties, o-ring, waist chain, fishnet gloves, chain leash`
- 赛博雨衣逆兔：`glossy clear pvc raincoat over black mesh reverse bunnysuit, hood up, fluorescent pink bunny ears, black garter belt, transparent stockings`

**巫女**：
- 弹弓泳装巫女配饰款：`slingshot swimsuit, miko detached sleeves, red obi, white thighhighs, cameltoe, sideboob`
- 短和服巫女：`short miko kimono, obi, sleeveless, sideboob, white high-waist panties`
- 敞开和服巫女：`open white miko kimono, nude, bottomless, red obi`
- 符咒遮裆狐巫女：`miko detached sleeves, crop top, bottomless, ofuda on pussy, fox hood`
- 露胸巫女：`open white miko kimono, cleavage, no bra`

### 8.6 衬衫与日常服装组合示例

本节提供衬衫、外套、围裙与日常连衣裙的材质、裁剪和穿着状态组合。

- 透明衬衫：`see-through shirt, tied shirt, no bra, nipples visible, denim micro shorts`
- 低腰无内裤：`crop top, low-waist pants, open fly, no panties, exposed pocket, black bra`
- 裸外套：`completely nude, naked jacket, see-through jacket, open jacket`
- 裸围裙：`naked apron, bottomless, no bra`
- 透明湿身裙：`wet see-through sundress, no bra, bare shoulders`
- 透明打结衬衫+短裤：`see-through shirt, tied shirt, denim shorts, no panties`

### 8.7 职业、身份与礼仪服装的暴露状态组合

将职业、身份或礼仪服装及其身份配饰与暴露状态标签组合，以形成可见的服装反差。

| 反差类型 | 标签组合 | 可见结果 |
|---|---|---|
| 校服反差 | `school uniform` + `micro skirt` + `no panties` + `open shirt` | 超短裙、敞开上衣与无内裤状态 |
| 修女服反差 | `torn see-through nun habit` + `no panties` | 破损且透明的修女服与无内裤状态 |
| 婚纱反差 | `torn wedding dress` | 具有撕裂破口的婚纱 |
| 女警配饰反差 | `police hat` + `slingshot swimsuit` + `fishnet thighhighs` + `no panties` | 警帽、弹弓泳装、渔网长筒袜与无内裤状态 |
| 女仆服反差 | `maid outfit` + `micro skirt` + `crotchless panties` + `open front` | 超短女仆裙、敞开前襟与开裆内裤 |
| 巫女服反差 | `open miko kimono` + `bottomless` + `no panties` | 敞开巫女和服与下身裸露 |
| 办公服反差 | `business suit` + `pencil skirt` + `no panties` + `open shirt` + `braless` | 办公服装、敞开上衣、无胸罩与无内裤状态 |
| 护士服反差 | `micro nurse dress` + `crotch cutout` + `latex gloves` | 微型护士连衣裙、乳胶手套与胯部开口 |
