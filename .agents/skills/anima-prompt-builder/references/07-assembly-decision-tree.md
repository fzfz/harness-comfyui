## 5. 场景类型与组装顺序

本章用于确定当前画面的基础场景类型、重点内容槽位和需要读取的详细资料。Skill 执行者必须按照第 5.0 节选择一个基础场景类型，再选择用户要求中全部匹配的特殊情境和特殊主题。

Skill 执行者先组装基础场景，再按第 5.4 节的表格顺序应用匹配的特殊情境，最后按第 5.7 节的表格顺序应用匹配的特殊主题。每个特殊主题严格执行对应表格行规定的追加、调整或替换动作。向槽位追加内容时，相同内容只保留第一次出现的位置。两项内容互斥时，保留用户消息中最后提出的要求；同一句用户要求产生互斥内容时，保留上述应用顺序中后加入的内容。调整或替换 `count_gender` 后，槽位中的性别人数必须覆盖全部实际入镜人物。

### 5.0 基础场景判定

Skill 执行者从上到下采用第一条符合当前画面的记录。同一画面同时包含性交和口交、手交或其他前戏时，性交入口优先。

| 判定条件 | 基础场景入口 |
|---|---|
| 一名女性与两名及以上男性发生性行为 | 第 5.5 节 |
| 两名女性发生性行为 | 第 5.6 节 |
| 一名女性与一名男性正在发生阴道或肛门插入 | 第 5.3 节 |
| 一名女性与一名男性正在进行口交、足交、素股、手交、乳交或调戏，且没有发生阴道或肛门插入 | 第 5.2 节 |
| 只有一名女性入镜 | 第 5.1 节 |
| 其他人数、性别组合、关系或非性行为互动 | 使用实际入镜人数填写 `count_gender`，再根据用户要求分别读取 `09-appearance.md` 至 `15-detail-mood.md` 中对应的内容资料 |

### 5.1 单女性展示

本节适用于一名女性进行静态展示、诱惑、暴露、自慰、自拍或直播的画面。

| 重点内容槽位 | 本场景的组装动作 | 详细资料 |
|---|---|---|
| `count_gender` | 使用 `1girl`、`solo` | `08-count-identity.md` |
| `appearance` | 填写用户指定或已取得的可见外观 | `09-appearance.md` |
| `clothing_state` | 填写实际服装和穿着状态 | `10-clothing-state.md` |
| `pose_action_sex` | 从单人姿势、服装互动、暴露、自慰或器具动作中选择当前画面对应内容 | `11-pose-action-sex.md` 第 9.1 节 |
| `expression_reaction` | 填写主要表情和当前可见反应 | `12-expression-reaction.md` |
| `camera_shot` | 按展示范围和用户镜头要求选择镜头 | `13-camera-shot.md` |
| `scene_environment` | 填写用户场所；用户未指定场所时采用场所资料的默认规则 | `14-scene-environment.md` |
| `detail_mood` | 用户没有指定画面效果时采用细节资料的默认值；用户指定画面效果时按该要求查询或选择对应内容 | `15-detail-mood.md` |

### 5.2 异性双人前戏

本节适用于一名女性与一名男性进行口交、足交、素股、手交、乳交或调戏的画面。

| 重点内容槽位 | 本场景的组装动作 | 详细资料 |
|---|---|---|
| `count_gender` | 使用 `1girl`、`1boy`、`hetero` | `08-count-identity.md` |
| `appearance` | 分别填写两名人物需要显示的外观；需要区分归属时使用人物称谓 | `09-appearance.md` |
| `clothing_state` | 分别填写两名人物的实际服装和穿着状态 | `10-clothing-state.md` |
| `pose_action_sex` | 从双人前戏中选择当前行为，并写明双方姿势、施动者、受动者和接触部位 | `11-pose-action-sex.md` 第 9.2 节 |
| `expression_reaction` | 按人物分别填写主要表情和当前可见反应 | `12-expression-reaction.md` |
| `camera_shot` | 按当前动作和用户镜头要求选择镜头 | `13-camera-shot.md` |
| `scene_environment` | 填写用户场所；用户未指定场所时采用场所资料的默认规则 | `14-scene-environment.md` |
| `detail_mood` | 用户没有指定画面效果时采用细节资料的默认值；用户指定画面效果时按该要求查询或选择对应内容 | `15-detail-mood.md` |

### 5.3 异性双人性交

本节适用于一名女性与一名男性进行传教士、站立、坐位、后入、火车便当、种付、骑乘或其他性交动作的画面。

| 重点内容槽位 | 本场景的组装动作 | 详细资料 |
|---|---|---|
| `count_gender` | 使用 `1girl`、`1boy`、`hetero` | `08-count-identity.md` |
| `appearance` | 分别填写两名人物需要显示的外观和用户要求的体型差 | `09-appearance.md` |
| `clothing_state` | 分别填写两名人物的实际服装和穿着状态 | `10-clothing-state.md` |
| `pose_action_sex` | 从双人性交中选择一个体位变体，并保留该变体规定的双方姿势与接触关系 | `11-pose-action-sex.md` 第 9.3 节 |
| `expression_reaction` | 按人物分别填写主要表情、当前可见反应、液体和即时痕迹 | `12-expression-reaction.md` |
| `camera_shot` | 按当前体位和用户镜头要求选择镜头 | `13-camera-shot.md` |
| `scene_environment` | 填写用户场所；用户未指定场所时采用场所资料的默认规则 | `14-scene-environment.md` |
| `detail_mood` | 用户没有指定画面效果时采用细节资料的默认值；用户指定画面效果时按该要求查询或选择对应内容 | `15-detail-mood.md` |

### 5.4 睡奸、催眠、攻守反转与过激性行为

本节为四类特殊情境指定适用的基础场景、动作资料和跨槽位内容。Skill 执行者只应用与当前基础场景相容的行。

| 特殊情境 | 适用的基础场景 | 组装动作 | 详细资料 |
|---|---|---|---|
| 睡奸 | 第 5.2、5.3、5.5 或 5.6 节，以及包含至少两名人物的“其他人数、性别组合”入口 | `pose_action_sex` 使用睡奸小节中与画面一致的姿势和接触关系；自然睡眠人物的 `expression_reaction` 使用 `sleeping`，失去意识的人物使用 `unconscious` | `11-pose-action-sex.md` 第 9.3.8 节、`12-expression-reaction.md` |
| 催眠 | 全部基础场景 | `pose_action_sex` 使用催眠小节中与画面一致的受控动作；`expression_reaction` 填写被控人物当前可见的眼睛和面部状态；催眠设备或界面可见时写入 `scene_environment` | `11-pose-action-sex.md` 第 9.3.9 节、`12-expression-reaction.md`、`14-scene-environment.md` |
| 攻守反转或 Femdom | 第 5.2 或 5.3 节，以及包含女性施动者和男性受动者的“其他人数、性别组合”入口 | `pose_action_sex` 使用攻守反转小节中与画面一致的女性主导动作；标签无法说明双方关系时，用 `natural_language` 写明女性施动者和男性受动者 | `11-pose-action-sex.md` 第 9.3.10 节 |
| 过激性行为 | 第 5.3、5.5 或 5.6 节，以及当前画面包含性交的“其他人数、性别组合”入口 | `pose_action_sex` 使用过激性行为小节中与画面一致的性交体位和暴力动作；`expression_reaction` 只填写当前可见反应 | `11-pose-action-sex.md` 第 9.3.11 节、`12-expression-reaction.md` |

### 5.5 一女多男与群交

本节适用于一名女性与两名及以上男性同时入镜的性行为画面。

| 重点内容槽位 | 本场景的组装动作 | 详细资料 |
|---|---|---|
| `count_gender` | 填写 `1girl` 和实际男性人数标签；男性达到三名时加入 `multiple boys`；用户明确要求群交时加入 `group sex` | `08-count-identity.md` |
| `appearance` | 为需要区分的每名人物填写可见外观 | `09-appearance.md` |
| `clothing_state` | 分别填写每名人物的实际服装和穿着状态 | `10-clothing-state.md` |
| `pose_action_sex` | 从多人性行为表选择一行参与人数相同的接触关系，并保留该行规定的每名人物姿势和动作 | `11-pose-action-sex.md` 第 9.4 节 |
| `expression_reaction` | 按人物分别填写主要表情、当前可见反应、液体和即时痕迹 | `12-expression-reaction.md` |
| `camera_shot` | 按多人动作和用户镜头要求选择镜头 | `13-camera-shot.md` |
| `scene_environment` | 用户指定场所时保留该场所；用户未指定场所时采用场所资料的默认规则，并用镜头构图容纳全部入镜人物 | `14-scene-environment.md` |
| `detail_mood` | 用户没有指定画面效果时采用细节资料的默认值；用户指定画面效果时按该要求查询或选择对应内容 | `15-detail-mood.md` |

### 5.6 百合

本节适用于两名女性发生性行为的画面。两名女性只有恋爱或日常互动而没有性行为时，使用第 5.0 节的“其他人数、性别组合、关系或非性行为互动”入口。

| 重点内容槽位 | 本场景的组装动作 | 详细资料 |
|---|---|---|
| `count_gender` | 使用 `2girls`、`yuri` | `08-count-identity.md` |
| `appearance` | 分别填写两名女性的可见外观 | `09-appearance.md` |
| `clothing_state` | 分别填写两名女性的实际服装和穿着状态 | `10-clothing-state.md` |
| `pose_action_sex` | 从百合性行为表选择当前互动，并写明每名人物的姿势和动作 | `11-pose-action-sex.md` 第 9.5 节 |
| `expression_reaction` | 按人物分别填写主要表情和当前可见反应 | `12-expression-reaction.md` |
| `camera_shot` | 按当前互动和用户镜头要求选择镜头 | `13-camera-shot.md` |
| `scene_environment` | 填写用户场所；用户未指定场所时采用场所资料的默认规则 | `14-scene-environment.md` |
| `detail_mood` | 用户没有指定画面效果时采用细节资料的默认值；用户指定画面效果时按该要求查询或选择对应内容 | `15-detail-mood.md` |

### 5.7 特殊主题

用户要求下表中的特殊主题时，Skill 执行者必须读取对应主题章节，并按“影响槽位与组装动作”列对基础场景执行追加、调整或替换。多个主题同时匹配时，Skill 执行者应用全部匹配行。

| 特殊主题 | 主题章节 | 影响槽位与组装动作 |
|---|---|---|
| NTR | `16-special-theme.md` 第 14.1 节 | 按实际入镜关系调整 `count_gender`；向 `pose_action_sex` 追加背叛行为，向 `expression_reaction` 追加背叛方或苦主的反应；窗外见证向 `camera_shot` 追加窗外镜头，电话证据向 `scene_environment` 追加手机内容，分屏见证向 `camera_shot` 追加分屏布局并向 `natural_language` 追加左右画面的关系 |
| 束缚与 BDSM | `16-special-theme.md` 第 14.2 节 | 向 `pose_action_sex` 追加束缚方法、装置和被束缚部位；按可见内容向 `appearance` 追加受力痕迹，向 `expression_reaction` 追加被束缚者反应，向 `scene_environment` 追加束缚场所 |
| RBQ 与物化 | `16-special-theme.md` 第 14.3 节 | 按实际入镜人数调整 `count_gender`；向 `pose_action_sex` 追加器物化行为，向 `appearance` 追加物化标记，向 `expression_reaction` 追加使用后反应或体液，向 `scene_environment` 追加可见设施；价格牌与人物的连接关系写入 `natural_language` |
| 男娘与 Futa | `16-special-theme.md` 第 14.4 节 | 按实际人物身份替换 `count_gender` 中对应的性别与身份内容；身体特征写入 `appearance`，服装写入 `clothing_state`，性行为和贞操装置写入 `pose_action_sex`，可见反应写入 `expression_reaction`；两个 Futa 的身份归属写入 `natural_language` |
| 异种 | `16-special-theme.md` 第 14.5 节 | 按实际入镜主体调整 `count_gender`；向 `appearance` 追加异种外观，向 `pose_action_sex` 追加交互方式，向 `scene_environment` 追加可见装置或卵体，向 `expression_reaction` 追加人物反应 |
| 调教与宠物化 | `16-special-theme.md` 第 14.6 节 | 向 `clothing_state` 追加宠物配饰，向 `pose_action_sex` 追加控制道具和动物化行为，向 `appearance` 追加所有权标记，向 `expression_reaction` 追加服从状态，向 `scene_environment` 追加宠物设施；主人入镜时同步调整 `count_gender` 和 `natural_language` |
| 胁迫 | `16-special-theme.md` 第 14.7 节 | 按实际入镜人数调整 `count_gender`；向 `pose_action_sex` 追加胁迫方式，向 `expression_reaction` 追加受迫者反应，向 `scene_environment` 追加胁迫证据；关系不明确时向 `natural_language` 追加施压者、受迫者和证据之间的关系 |
| 偷窥与展示 | `16-special-theme.md` 第 14.8 节 | 偷窥时按偷窥者是否入镜调整 `count_gender`，向 `camera_shot` 追加观看渠道，向 `pose_action_sex` 追加偷窥动作，向 `expression_reaction` 追加被看者反应；主动自拍或直播展示时，自拍、直播和展示动作写入 `pose_action_sex`，镜子、摄像头和屏幕写入 `scene_environment` |
| 事后 | `16-special-theme.md` 第 14.9 节 | 向 `pose_action_sex` 追加事后状态或姿势；按实际可见内容向 `expression_reaction`、`clothing_state` 和 `scene_environment` 追加人物反应、体液、服装状态及场景痕迹 |
| 另类日常 | `16-special-theme.md` 第 14.10 节 | 向 `pose_action_sex` 追加一种日常活动和一种性相关状态；实际服装写入 `clothing_state`，人物把性相关状态视为日常时的可见反应写入 `expression_reaction`，日常场所和物件写入 `scene_environment`，被服装、桌面或人物姿势遮住的内容写入 `natural_language` |
| 大车小孩 | `16-special-theme.md` 第 14.11 节 | 按实际入镜人数调整 `count_gender`；向 `appearance` 追加双方年龄、身高或体型反差，向 `pose_action_sex` 追加主导动作，向 `expression_reaction` 追加双方可见反应，向 `natural_language` 追加无法用标签说明的教导关系 |
| 隐奸 | `16-special-theme.md` 第 14.12 节 | 画面裁剪、暗示角度和伪媒介画面写入 `camera_shot`，桌面、前景物体、磨砂玻璃、被子、浴帘或隔间写入 `scene_environment`，可见区域和被遮挡区域的动作写入 `natural_language`；可见体液或颤抖写入 `expression_reaction`，脚趾蜷曲写入 `pose_action_sex`，动作线写入 `detail_mood` |
