# `outfit` 位置规则

## 用途和读取时机

当用户要求或当前场景要求描述服装、配饰、穿着状态或随身物件时，Skill Agent 必须读取本文件，并按照本文件编写 `outfit` 内容。

`outfit` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 每名主体的服装内容

Skill Agent 根据用户要求、选定构图和可见范围，逐项判断每名主体实际包含的以下内容，并只把当前画面中实际存在的内容写入 `outfit`：

- Skill Agent 写入主体实际穿着的服装种类和主要结构。
- Skill Agent 写入服装实际呈现的材质和颜色。
- Skill Agent 写入服装实际呈现的完整、敞开、脱下、破损、湿润、凌乱或其他当前状态。
- Skill Agent 写入主体实际穿戴的鞋袜、手套、帽子、首饰和其他配饰。
- Skill Agent 写入主体实际携带的武器、法杖、包、书、乐器或其他随身物件。

## 多主体归属

画面包含多名主体时，Skill Agent 必须把每组服装、配饰和随身物件与对应主体的名称连续书写。主体没有名称时，Skill Agent 使用选定构图中已经确定的唯一画面位置和可见外貌共同标明对应主体。

多名主体穿着相同制服或携带相同装备时，Skill Agent 可以将相同制服或装备只写一次，并在同一短句中列出适用该内容的全部主体。每名主体不同的颜色、穿着状态、损坏状态或持有物仍必须与对应主体的名称连续书写；主体没有名称时，Skill Agent 必须将这些差异内容与该主体在选定构图中的唯一画面位置和可见外貌连续书写。

## 与本轮 Character Prompt 的关系

存在本轮 Character Prompt 时，Skill Agent 在 `outfit` 中写入该 Prompt 没有包含的服装、配饰、随身物件或当前穿着状态。

用户本轮明确替换角色服装时，Skill Agent 按照 [`character` 位置规则](character.md)删除本轮 Character Prompt 中直接冲突的标签，并把替换服装写入 `outfit`。用户本轮明确排除某项角色服装时，Skill Agent 按照 `character` 位置规则删除被排除的标签，不把排除内容写入 `outfit`。

## 物件与动作的边界

物件本身及其外观进入 `outfit`；主体如何握持、使用、脱下、拉扯、交接或损坏该物件进入 `action`。动作完成后留下的服装状态仍进入 `outfit`。

例如，法杖的类型和外观进入 `outfit`，角色举起法杖进入 `action`；外套敞开的状态进入 `outfit`，角色正在脱下外套进入 `action`。

## 完成检查

Skill Agent 必须确认 `outfit`：

- 每件服装、配饰和随身物件都对应具体主体；
- 服装内容与镜头可见范围一致；
- 穿着状态与动作阶段和结果状态一致；
- `outfit` 只包含物件本身及其外观，物件使用动作进入 `action`；
- 存在本轮 Character Prompt 时，`outfit` 只保留该 Prompt 没有包含的服装、配饰、随身物件、当前穿着状态或用户指定的替换服装；
- `outfit` 只包含服装、配饰、穿着状态和随身物件；身体外貌进入 `appearance`，表情进入 `expression_reaction`，镜头内容进入 `camera_composition`，环境内容进入 `environment`。
