## 11. 镜头

本章用于构造 `camera_shot` 槽位。该槽位描述画面布局、景别、相机方向、第一人称镜头、身体部位聚焦、画面裁切和镜头效果。

### 11.1 构造顺序与数量

Skill 执行者按以下顺序构造 `camera_shot`：

1. 用户要求分屏、漫画格或同一人物的多个视图时，Skill 执行者先按第 11.8 节选择一个布局标签，并按需选择一个画面关系标签。
2. Skill 执行者按第 11.2 节选择一个景别标签。用户没有指定景别时，Skill 执行者依次检查第 11.5 节中用户最后指定的聚焦、裁切或表外部位要求，以及第 11.7 节的姿势默认景别；两节均没有匹配项时使用 `cowboy shot`。
3. 用户明确要求第一人称镜头时，Skill 执行者按第 11.4 节选择一个 POV 持有者标签；用户还要求 POV 持有者的手或胯部进入画面时，再选择一个 POV 身体标签。用户同时要求手和胯部入镜时，Skill 执行者采用用户最后指定的 POV 身体标签。
4. 用户指定相机方向或位置时，Skill 执行者按第 11.3 节依次选择水平方向、垂直方向和相机位置标签，每类最多一个。第 11.7 节提供默认方向或默认相机位置，并且用户没有指定对应类别时，Skill 执行者加入该默认标签。
5. 用户提出多个身体部位聚焦或画面裁切要求时，Skill 执行者只处理用户最后提出的要求。该要求与第 11.5 节表中一行匹配时，Skill 执行者选择该行的聚焦或裁切标签；该要求指向表中未列出的身体部位时，不选择聚焦或裁切标签。
6. 用户明确要求镜头效果时，Skill 执行者按第 11.6 节选择一个镜头效果标签。
7. `camera_shot` 最终包含一至五个标签。候选标签超过五个时，Skill 执行者按上述顺序保留前五个标签，并使每个标签只出现一次。

同一类别中，用户明确指定的镜头要求替代第 11.7 节的默认值。用户在同一方向类别中指定多个互斥标签时，Skill 执行者采用用户最后指定的标签。全部候选标签仍按第 11.1 节的构造顺序执行五个标签的上限。

### 11.2 景别

| 画面范围 | 景别标签 |
|---|---|
| 只显示眼睛、嘴、乳头、龟头、外阴或插入位置等很小范围 | `extreme close-up` |
| 显示脸部、胸部、足部或性行为接触位置 | `close-up` |
| 显示头部至胸部或腰部 | `upper body` |
| 显示头部至胯部附近 | `cowboy shot` |
| 显示人物全身 | `full body` |
| 同时显示多名人物和主要环境 | `wide shot` |

Skill 执行者只选择一个景别标签。

### 11.3 相机方向与位置

相机方向描述相机相对于主要人物的水平方向和垂直方向；相机位置描述相机位于场所内部还是外部。这些标签不表示 POV 持有者的性别或身份。

| 方向类别 | 相机位置 | 标签 |
|---|---|---|
| 水平方向 | 主要人物正前方 | `from front` |
| 水平方向 | 主要人物侧面 | `from side` |
| 水平方向 | 主要人物背后 | `from behind` |
| 水平方向 | 越过前景人物肩部拍摄另一人物 | `over shoulder` |
| 垂直方向 | 主要人物上方并向下拍摄 | `from above` |
| 垂直方向 | 主要人物下方并向上拍摄 | `from below` |
| 垂直方向 | 主要人物正上方的垂直俯拍 | `bird's eye view` |
| 相机位置 | 建筑物或房间外部 | `from outside` |

水平方向、垂直方向和相机位置各最多选择一个标签。`from above`、`from below` 与 `bird's eye view` 属于同一个互斥类别；选择 `bird's eye view` 时不选择水平方向标签。场所内部没有对应的相机位置标签。

### 11.4 第一人称镜头

POV 持有者是观察当前画面的角色。Skill 执行者必须根据用户描述确定 POV 持有者和被观察人物，再选择一个 POV 标签。

| 第一人称信息 | POV 标签 |
|---|---|
| POV 持有者不是女性，或用户没有要求标明持有者性别 | `pov` |
| POV 持有者是女性，并且用户要求明确女性第一人称 | `female pov` |
| POV 持有者的双手进入画面 | `pov hands` |
| POV 持有者的胯部进入画面 | `pov crotch` |

`pov` 与 `female pov` 二选一。`pov hands` 与 `pov crotch` 二选一，并放在 POV 持有者标签之后。

POV 标签不决定相机的上下方向。Skill 执行者根据 POV 持有者与被观察人物的位置另选 `from above`、`from below`、`from front`、`from side` 或 `from behind`。

男性位于下方并仰视骑乘在上方的女性时，Skill 执行者依次使用 `pov` 和 `from below`。女性位于下方并仰视压在上方的男性时，Skill 执行者依次使用 `female pov` 和 `from below`。人物从另一人物背后观察后入动作时，Skill 执行者依次使用 `pov` 和 `from behind`。

`full body` 可以表示被观察人物的全身。POV 镜头不使用 `full body` 表示 POV 持有者自己的全身。

### 11.5 身体部位聚焦与裁切

| 画面重点 | 聚焦或裁切标签 | 默认景别 |
|---|---|---|
| 脸部 | `face focus` | `close-up` |
| 胸部 | `breast focus` | `close-up` |
| 臀部 | `ass focus` | `close-up` |
| 足部 | `feet focus` | `close-up` |
| 腿部 | `thigh focus` | `full body` |
| 腋下 | `armpit focus` | `close-up` |
| 画面只保留头部以下的身体 | `head out of frame` | `upper body` |

用户没有指定景别时，Skill 执行者采用用户最后一项聚焦或裁切要求对应的默认景别。`head out of frame` 的裁切结果优先于 `upper body` 通常包含头部的画面范围。用户依次提出 `face focus` 与 `head out of frame` 时，Skill 执行者采用最后提出的标签。用户最后要求突出表中未列出的身体部位时，Skill 执行者不保留先前的聚焦或裁切标签，把该部位写入 `natural_language`，并且只在用户没有指定景别时使用 `close-up`。

### 11.6 构图与镜头效果

| 用户要求的成像方式 | 镜头效果标签 |
|---|---|
| 倾斜画面 | `dutch angle` |
| 近处肢体因透视显得更大 | `foreshortening` |
| 鱼眼镜头产生明显桶形变形 | `fisheye` |
| 广角镜头容纳更宽范围 | `wide angle` |
| 超广角镜头产生更强透视 | `ultra wide angle` |
| 移动物体出现方向性模糊 | `motion blur` |
| 主体清晰而前景或背景虚化 | `shallow depth of field` |
| 离焦高光形成圆形光斑 | `bokeh` |
| 透过窗户拍摄人物 | `through window` |

Skill 执行者只选择一个镜头效果。用户指定多个镜头效果时，Skill 执行者采用用户最后指定的效果。

### 11.7 姿势对应的默认镜头

第 11.1 节第 2 步没有从用户要求或第 11.5 节取得景别时，Skill 执行者才采用本节的默认景别。Skill 执行者从上到下采用第一条与 `pose_action_sex` 相符的记录。

默认方向属于水平方向时，Skill 执行者只在用户没有指定水平方向且没有选择 `bird's eye view` 时加入该标签；默认方向属于垂直方向时，Skill 执行者只在用户没有指定垂直方向时加入该标签。默认相机位置只在用户没有指定相机位置时加入。

| 当前姿势或行为 | 默认景别 | 默认方向 | 默认相机位置 | 可选聚焦标签 |
|---|---|---|---|---|
| 多人或群交 | `wide shot` | `from above` | — | — |
| 暴露或露出 | `wide shot` | — | `from outside` | — |
| 坐脸 | `close-up` | `from below` | — | `ass focus` |
| 口交 | `close-up` | `from side` | — | `face focus` |
| 足交 | `close-up` | `from side` | — | `feet focus` |
| 乳交 | `close-up` | `from above` | — | `breast focus` |
| 后入 | `full body` | `from behind` | — | `ass focus` |
| 种付 | `full body` | `from above` | — | — |
| 传教士 | `full body` | `from side` | — | — |
| 骑乘 | `full body` | `from side` | — | — |
| 睡奸 | `full body` | `from above` | — | — |
| 百合 scissors | `full body` | `from above` | — | — |
| 火车便当 | `full body` | `from side` | — | — |
| 坐姿性交 | `cowboy shot` | `from side` | — | — |
| 站立或压墙 | `full body` | `from side` | — | — |

表中的聚焦标签只在用户要求突出对应部位时使用。POV 标签只在用户明确要求第一人称镜头时使用。

### 11.8 分镜与多画面布局

Skill 执行者根据画面数量和布局选择一个布局标签。

| 画面要求 | 布局标签 |
|---|---|
| 两个不同事件或不同场景的并列画面，不用于同一人物或同一动作的多视图 | `split screen` |
| 两格连续漫画 | `2koma` |
| 四格连续漫画 | `4koma` |
| 同一人物或动作的两个视图 | `2views` |
| 同一人物或动作的三个及以上视图 | `multiple views` |
| 用户只要求漫画页面布局而没有指定格数 | `comic` |

用户要求比较两个时间阶段但没有指定布局时，Skill 执行者依次加入 `2koma` 和 `before and after`；用户已经指定布局时，Skill 执行者在该布局标签之后加入 `before and after`。用户要求用多个画面表现战败或屈服前后的瞬间变化时，`instant loss` 替代 `before and after`；Skill 执行者在没有指定布局时使用 `2koma`，在已经指定布局时保留该布局，并在布局标签之后加入 `instant loss`。画面关系标签与布局标签各计一个标签。Skill 执行者把战败或屈服前后的具体动作分别写入 `natural_language`。用户明确同时指定 `before and after` 和 `instant loss` 时，Skill 执行者采用用户最后指定的画面关系标签。用户要求 NTR 画面左侧显示聊天、右侧显示性行为时，Skill 执行者使用 `split screen`，并把左右画面的内容分别写入 `natural_language`。用户明确指定多个布局标签时，Skill 执行者采用用户最后指定的布局标签。

同一画面只使用一个布局标签。
