## 12. 场所与环境

本章用于构造 `scene_environment` 槽位。该槽位描述当前画面的主场所、场所特征、天气、时段、可见环境现象和附加场景内容。

### 12.1 构造顺序与数量

Skill 执行者按以下顺序构造 `scene_environment`：

1. 用户指定场所时，Skill 执行者按第 12.2 节确定主场所和默认场所特征。用户把多个场所作为备选时，使用用户最后指定的场所。用户没有指定场所时，Skill 执行者先按第 12.3 节确定主题对应的主场所和默认场所特征；没有匹配主题时使用 `indoors` 和 `room`。
2. Skill 执行者先记录主场所标签。用户明确写出属于该主场所的环境构件或物体时，无论该内容与场所位于同一句还是独立分句，Skill 执行者都把最先出现的构件或物体改写为英文标签，并作为第二个标签；用户没有写出该内容时，使用主场所的默认场所特征。第二个标签必须与主场所标签不同；两者相同时，Skill 执行者改用主场所的默认场所特征。
3. 用户明确要求两个相连或同时可见的场所时，Skill 执行者把第二个场所记录在场所特征之后。
4. Skill 执行者按内容在用户描述中的出现顺序，从天气、时段、可见环境现象和第 12.5 节的附加场景内容中选择其余标签。
5. Skill 执行者按完整候选顺序保留每个标签的第一次出现，删除后续重复标签，再保留前六个不同标签。`scene_environment` 最终包含二至六个标签。

### 12.2 场所与默认场所特征

| 用户指定的场所 | 主场所标签 | 默认场所特征 |
|---|---|---|
| 卧室 | `bedroom` | `bed` |
| 浴室 | `bathroom` | `tiled wall` |
| 淋浴间 | `shower` | `wet floor` |
| 浴缸 | `bathtub` | `tiled wall` |
| 酒店房间 | `hotel room` | `bed` |
| 情侣酒店 | `love hotel` | `bed` |
| 豪华酒店 | `luxury hotel` | `bed` |
| 地牢 | `dungeon` | `stone wall` |
| 客厅 | `living room` | `sofa` |
| 厨房 | `kitchen` | `counter` |
| 办公室 | `office` | `desk` |
| 汽车内 | `car interior` | `backseat` |
| 教室 | `classroom` | `school desk` |
| 电车 | `train` | `train interior` |
| 公交车 | `bus` | `bus interior` |
| 电梯 | `elevator` | `elevator doors` |
| 楼梯间 | `stairwell` | `emergency stairs` |
| 公园 | `park` | `park bench` |
| 试衣间 | `fitting room` | `curtain` |
| 电影院 | `cinema` | `seats` |
| 餐厅 | `restaurant` | `table` |
| 居酒屋 | `izakaya` | `table` |
| 海滩 | `beach` | `ocean` |
| 游泳池 | `swimming pool` | `poolside` |
| 教堂 | `cathedral` | `stained glass` |
| 神社 | `ancient shrine` | `torii gate` |
| 寺庙 | `temple` | `tatami` |
| 废墟 | `ruins` | `rubble` |
| 被毁建筑 | `destroyed building` | `rubble` |
| 实验室 | `laboratory` | `culture tank` |
| 温泉 | `onsen` | `wooden bath` |

用户指定的场所不在表中时，Skill 执行者把该场所改写为对应的英文场所标签。用户没有明确写出属于该主场所的环境构件或物体时，室内场所使用 `interior`，室外场所使用 `outdoors`。主场所标签本身是 `interior` 时使用 `room` 作为第二个标签；主场所标签本身是 `outdoors` 时使用 `open sky` 作为第二个标签。

### 12.3 主题对应的默认场所

用户没有指定场所时，Skill 执行者从上到下采用第一条与用户主题相符的记录。

| 用户主题 | 默认主场所 | 默认场所特征 |
|---|---|---|
| NTR 或偷情 | `hotel room` | `bed` |
| 束缚、BDSM 或调教 | `dungeon` | `chains` |
| 职场胁迫 | `office` | `desk` |
| 师生 | `classroom` | `school desk` |
| 痴汉或拥挤交通工具内的暴露 | `train` | `crowded train` |
| 修女亵渎 | `cathedral` | `confessional` |
| 巫女破戒 | `ancient shrine` | `torii gate` |
| 战败或俘虏 | `ruins` | `rubble` |
| 机械改造或实验催眠 | `laboratory` | `culture tank` |
| 温泉共浴 | `onsen` | `wooden bath` |

### 12.4 天气、时段与可见环境现象

天气和时段分别最多选择一个标签。用户指定多个天气或多个时段时，Skill 执行者采用用户最后指定的天气或时段。用户没有指定天气或时段时，不增加默认标签。

| 类型 | 用户描述 | 使用条件 | 标签 |
|---|---|---|---|
| 天气 | 晴天 | 室外可见 | `clear sky` |
| 天气 | 下雨 | 室外可见，或雨水进入室内 | `rain` |
| 天气 | 下雪 | 室外可见，或雪进入室内 | `snowfall` |
| 天气 | 暴风雪 | 室外可见，或风雪进入室内 | `blizzard` |
| 天气 | 雾 | 室外可见 | `fog` |
| 天气 | 薄雾 | 室外可见 | `mist` |
| 天气 | 浓雾 | 室外可见 | `dense fog` |
| 时段 | 白天但没有指定更具体时段 | 当前时段 | `day` |
| 时段 | 早晨 | 当前时段 | `morning` |
| 时段 | 下午 | 当前时段 | `afternoon` |
| 时段 | 日落 | 当前时段 | `sunset` |
| 时段 | 暮光时段 | 当前时段 | `twilight` |
| 时段 | 夜晚 | 当前时段 | `night` |
| 环境现象 | 雨水打湿路面 | 室外地面可见 | `wet pavement` |
| 环境现象 | 可见雨滴 | 室外可见，或雨滴留在室内表面 | `rain droplets` |
| 环境现象 | 积雪覆盖地面 | 室外地面可见 | `snowfield` |
| 环境现象 | 水汽 | 室内或室外均可使用 | `steam` |
| 环境现象 | 表面凝结水珠 | 室内或室外均可使用 | `condensation` |
| 环境现象 | 夜间城市景观 | 室外可见 | `night cityscape` |
| 环境现象 | 星空 | 室外天空可见 | `starry sky` |

`night cityscape` 和 `starry sky` 表示夜晚。用户同时指定白天、早晨或下午与这两个现象时，Skill 执行者采用用户最后指定的时段或夜间现象，并删除与其冲突的候选标签。

### 12.5 附加场景内容

Skill 执行者只根据用户当前画面要求选择本节标签。全部标签按其内容在用户要求中的出现顺序进入第 12.1 节的候选列表。

| 用户要求的场景内容 | 标签 |
|---|---|
| 床单 | `bed sheet` |
| 枕头 | `pillow` |
| 淋浴设备 | `shower` |
| 湿滑地面 | `wet floor` |
| 肥皂 | `soap` |
| 办公椅 | `office chair` |
| 下班后的办公室 | `after hours` |
| 加班中的办公室 | `overtime` |
| 黑板 | `chalkboard` |
| 靠在窗户上 | `against window` |
| 玻璃窗面 | `glass` |
| 城市景观 | `city view` |
| 窗帘打开 | `curtains open` |
| 拥挤的电车 | `crowded train` |
| 混凝土墙 | `concrete wall` |
| 镜子 | `mirror` |
| 窗户 | `window` |
| 散落的衣物 | `scattered clothes` |
| 地板上的衣物 | `clothes on floor` |
| 脱下的内裤 | `unworn panties` |
| 脱下并留在场景中的鞋 | `shoes removed` |
| 弄皱的床单 | `crumpled sheets` |
| 使用过的避孕套 | `used condom` |
| 避孕套包装 | `condom wrapper` |
| 避孕套盒 | `condom box` |
| 多个使用过的避孕套 | `many used condoms` |
| 使用过的纸巾 | `used tissue` |
| 放在附近的情趣用品 | `sex toy nearby` |
| 床上的振动棒 | `vibrator on bed` |
| 地板上的假阳具 | `dildo on floor` |
| 桌上的肛珠 | `anal beads on table` |
| 葡萄酒杯 | `wine glass` |
| 啤酒杯 | `beer mug` |
| 咖啡杯 | `coffee mug` |
| 香烟 | `cigarette` |
| 烟灰缸 | `ashtray` |
| 蜡烛 | `candle` |
| 智能手机 | `smartphone` |
| 笔记本电脑 | `laptop` |
| 大型电脑屏幕 | `big computer screen` |
| 网络摄像头 | `webcam` |
| 正在录制 | `recording` |
| 木地板 | `wooden floor` |
| 地毯 | `carpet` |
| 榻榻米 | `tatami` |
| 窗帘 | `curtain` |
| 画框 | `picture frame` |

`recording` 只在用户明确写出智能手机、笔记本电脑或网络摄像头正在录制，或者大型电脑屏幕正在显示录制状态时使用。Skill 执行者使设备标签和其他附加场景标签继续保持用户描述中的相对顺序，只把唯一的 `recording` 插入最后一个正在录制或显示录制状态的设备标签之后。用户只要求设备出现而没有说明录制状态时，Skill 执行者只选择设备标签。
