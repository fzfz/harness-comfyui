# `camera_composition` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `camera_composition` 位置。当前主场景、用户要求、跨位置配方或选定候选构图涉及镜头、布局、景深、遮挡、裁剪或可见范围时，Skill Agent 必须读取本文件。

`camera_composition` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 使用选定候选构图

Skill Agent 必须使用已经通过[构图决策树](../composition-decision-tree.md)选定的候选，不在本位置重新选择另一套构图。

Skill Agent 必须把选定候选中的以下内容映射到 `camera_composition`：

- 主景别；
- 相机角度；
- POV；
- 主焦点和次要焦点；
- 主体在画面中的左右、上下和中央位置；
- 主体与环境的前景、中景和背景层级；
- 遮挡者、被遮挡者和仍然可见的部分；
- 画面边界造成的裁剪；
- 景深和焦点范围；
- 镜头倾斜。

## 空间关系

画面包含多名主体、内外边界、前后层级、遮挡或包含关系时，Skill Agent 必须读取[空间关系规则](../spatial-relation-rules.md)，并使用最终相机位置重新判断画面方向和可见范围。

画面包含多个画格时，Skill Agent 必须读取[分镜规则](../storyboard-panel-rules.md)，明确整体画格布局和每个画格的独立镜头。

## 位置边界

- 地点、房间、建筑、前景物、中景物和背景物进入 `environment`。
- 主体的姿态、动作和身体朝向进入 `action`。
- 画面情绪、摄影质感和数字效果进入 `detail_mood`。
- 光源、阴影、色彩和对比度进入 `lighting`。

## 完成检查

Skill Agent 必须确认 `camera_composition`：

- 景别能够容纳所有必须可见的主体、动作和环境内容；
- 相机角度、POV、焦点和主体位置能够同时成立；
- 前中后景与遮挡和景深一致；
- 裁剪与景别和画面边界一致；
- 用户明确指定的镜头要求全部保留；
- 没有混入地点、主体动作、整体情绪或光线内容。
