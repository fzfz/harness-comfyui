# `appearance` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `appearance` 位置。当前主场景、用户要求或跨位置配方需要说明主体的可见外貌时，Skill Agent 必须读取本文件。

`appearance` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 每名主体的可见外貌

Skill Agent 必须根据选定构图和可见范围，为每名需要外貌描述的主体确定实际能够看到的内容：

- 头发颜色、长度、发型和状态；
- 眼睛颜色、眼型和其他可见眼部特征；
- 脸部特征、肤色和面部标记；
- 身高印象、体型和身体比例；
- 纹身、伤痕、痣或其他身体标记；
- 耳朵、角、尾巴、翅膀、鳞片、皮毛或其他非人身体特征。

## 多主体归属

画面包含多名主体时，Skill Agent 必须为每名主体选择能够区分身份的可见外貌特征。相似主体不能共享一组无法判断归属的外貌内容。

主体被背面镜头、遮挡或裁剪限制时，Skill Agent 只写入当前画面能够显示的外貌；需要保持身份可辨认时，优先保留仍然可见的稳定特征。

## 与角色 Prompt 的关系

采用角色提示词后，Skill Agent 在 `appearance` 中只补充 Character 来源内容尚未准确表达的可见外貌或当前状态。Skill Agent 不重复写入 Character 来源内容已经准确表达的外貌。

用户本轮明确修改或排除角色外貌时，Skill Agent 按照 [`character` 位置规则](character.md)处理 Character 来源内容，并把用户要求写入 `appearance`。

## 位置边界

- 具体角色 Prompt 进入 `character`。
- 衣物、配饰和随身物件进入 `outfit`。
- 表情、视线和身体反应进入 `expression_reaction`。
- 姿态、动作和身体朝向进入 `action`。

## 完成检查

Skill Agent 必须确认 `appearance`：

- 每项外貌都对应具体主体；
- 外貌内容与镜头可见范围一致；
- 多主体具有足够的可见区别；
- 没有重复角色提示词已经准确表达的内容；
- 没有混入服装、动作、表情、镜头或环境内容。
