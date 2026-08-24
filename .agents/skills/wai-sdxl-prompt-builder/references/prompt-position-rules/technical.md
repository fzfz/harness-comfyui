# `technical` 位置规则

## 用途和读取时机

本文件规定 Skill Agent 如何完成 `technical` 位置。用户明确要求输出形态或生产用途时，Skill Agent 必须读取本文件；用户没有提出此类要求时，不读取本文件，也不创建 `technical`。

`technical` 的唯一职责由 [WAI Prompt 位置顺序与职责](../wai-prompt-position-order.md)统一定义。

## 用户明确要求

Skill Agent 必须只采用用户本轮明确提出的输出形态或生产用途。`technical` 可以表达最终图像将作为壁纸、角色立绘、概念设计、宣传图、封面或其他具体用途，以及该用途明确要求的画面形态。

Skill Agent 必须把影响画面布局的要求同时落实到 `camera_composition`。例如，用户要求角色立绘时，`technical` 表达生产用途，`camera_composition` 表达角色在画面中的实际构图。

## 位置边界

- 画面宽高关系、主体位置、留白和裁剪进入 `camera_composition`。
- 画面质量和清晰度进入 `quality`。
- 普通画风和媒介风格进入 `non_artist_style`。
- 具体画师提示词进入 `artist`。

`technical` 不补充用户没有要求的模型参数、采样参数、文件格式、尺寸数值或工作流设置。

## 完成检查

Skill Agent 必须确认 `technical`：

- 每项内容都来自用户本轮明确要求；
- 输出形态或生产用途已经落实到相关构图内容；
- 没有混入质量、画师、普通画风或相机布局内容；
- 没有增加用户未要求的模型或工作流参数。
