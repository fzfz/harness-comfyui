# `appearance` 位置规则

## 用途和读取时机

当用户要求或当前场景要求描述主体的可见外貌时，Skill Agent 必须读取本文件，并按照本文件编写 `appearance` 内容。

`appearance` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 每名主体的可见外貌

Skill Agent 必须为用户明确指定外貌的主体和场景规则明确要求描述外貌的主体，从以下类别中选择当前画面能够显示的外貌特征：

- Skill Agent 在当前画面能够显示头发时，写入选定的头发颜色、长度、发型或头发状态。
- Skill Agent 在当前画面能够显示眼睛时，写入选定的眼睛颜色或眼型。
- Skill Agent 在当前画面能够显示脸部时，写入选定的脸部特征、肤色或面部标记。
- Skill Agent 在当前构图能够表现主体的高矮、体型或身体比例时，写入选定的对应特征。
- Skill Agent 在当前画面能够显示纹身、伤痕、痣或由用户或场景规则明确指定的其他身体标记时，写入选定的对应标记。
- Skill Agent 在当前画面能够显示耳朵、角、尾巴、翅膀、鳞片、皮毛或由用户或场景规则明确指定的其他非人身体特征时，写入选定的对应特征。

主体被背面镜头、遮挡或裁剪限制时，Skill Agent 只写入当前画面能够显示的外貌。

## 多主体归属

画面包含多名主体时，Skill Agent 必须用主体名称标明每组外貌内容的所属主体。主体没有名称时，Skill Agent 使用选定构图中已经确定的唯一画面位置标明所属主体。用户要求、场景规则或已采用 Character Prompt 内容提供了主体之间的外貌差异时，Skill Agent 可以同时使用这些已有差异标明所属主体；没有可用的外貌差异时，Skill Agent 不新增外貌特征。

## 与本轮 Character Prompt 的关系

存在本轮 Character Prompt 时，Skill Agent 只把用户明确要求或场景规则明确要求、且该 Prompt 没有包含的可见外貌写入 `appearance`。

用户本轮明确替换角色外貌时，Skill Agent 按照 [`character` 位置规则](character.md)删除本轮 Character Prompt 中直接冲突的标签，并把替换外貌写入 `appearance`。用户本轮明确排除某项角色外貌时，Skill Agent 按照 `character` 位置规则删除被排除的标签，不把排除内容写入 `appearance`。

## 位置边界

- 本轮 Character Prompt 进入 `character`。
- 衣物、配饰和随身物件进入 `outfit`。
- 表情、视线和身体反应进入 `expression_reaction`。
- 姿态、动作和身体朝向进入 `action`。
- 镜头内容进入 `camera_composition`。
- 环境内容进入 `environment`。

## 完成检查

Skill Agent 必须确认 `appearance`：

- 每项外貌都对应具体主体；
- 外貌内容与镜头可见范围一致；
- 画面包含多名主体时，用户要求、场景规则或已采用 Character Prompt 内容提供的每项外貌差异都对应正确主体；没有可用外貌差异的主体使用主体名称或唯一画面位置标明归属；
- 存在本轮 Character Prompt 时，`appearance` 只保留用户明确要求或场景规则明确要求、且该 Prompt 没有包含的可见外貌，以及用户指定的替换外貌；
- `appearance` 只包含主体的可见外貌。
