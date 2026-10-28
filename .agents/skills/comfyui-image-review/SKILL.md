---
name: comfyui-image-review
description: 用户要求按 run_id 分析生成图片、比较 Prompt 与图片或改写下一轮 Prompt 时使用。Skill 读取原始参数，逐图调用独立视觉模型，再给出改进 Prompt。
---

# ComfyUI Image Review

## 1. 读取 CLI 合同

1. 当前 Agent 在本次 Skill 执行第一次调用项目 CLI 前必须完整读取 `references/cli.md`。CLI 返回错误后，当前 Agent 先读取“错误、修正与重试”，再修改输入或重试。当前上下文完整保留该章节时，可直接使用。上下文压缩后不再完整保留该文件内容时，当前 Agent 必须在下一条 CLI 命令前重新完整读取该文件。

## 2. 取得 Generation Run 与图片

1. 当前 Agent 必须优先从用户消息中按出现顺序收集一个或多个明确的 `run_id`。用户指代当前会话此前的 Generation 提交结果时，当前 Agent 必须从该提交结果中按返回顺序取得对应 `run_id`。两种来源均缺少 `run_id` 时，当前 Agent 必须请用户提供 ID，结束本次执行。

2. 当前 Agent 必须把全部 `run_id` 按原顺序分成每组 1 至 20 个，并为每组调用一次 `generation resolve-media --stdin`。输入必须显式包含 `include_parameters: true`。调用入口见 `references/cli.md`。当前 Agent 保留重复 ID 与原始顺序。命令成功后，当前 Agent 读取结果文件，按各组顺序合并 `runs`。

3. 某个 `runs` 元素的 `lookup_status` 为 `error` 时，当前 Agent 必须报告该元素的 `run_id`、`error.code` 和 `error.message`，并跳过该元素的图片读取。Run media 命令发生命令级失败时，当前 Agent 按 `references/cli.md` 处理。

4. 查询到 Run 后，当前 Agent 记录 `status` 与 `run_error`。Run 尚在执行且没有已保存图片时，当前 Agent 等待并查询该 Run。Run 失败、取消或结果不明时，当前 Agent 报告状态与错误，并审阅已保存图片。

## 3. 逐图读取

1. 当前 Agent 按 `runs` 顺序处理 `lookup_status` 为 `available` 的每项记录，并按 `images` 顺序逐图调用 `image inspect --stdin`。调用方法见 `references/cli.md` 的“参数与标准输入”。每次调用使用对应图片的 `file_path`。该项记录的 `images` 为空时，当前 Agent 报告该 Run 没有已保存图片。

2. 用户指定关注点、返回格式或读图提示词时，当前 Agent 将要求写成完整 `prompt`。该 `prompt` 必须能独立表达观察要求。每次读取适用图片时，当前 Agent 将 `prompt` 与 `file_path` 一起传递。用户没有指定本次观察要求时，当前 Agent 必须省略 `prompt`。`prompt` 的缺省与覆盖行为见 [CLI 参考](references/cli.md#image-inspect---stdin)“参数与标准输入”的 `image inspect --stdin` 第 6 项。

3. 同一项观察要求适用于全部图片时，当前 Agent 必须为每次图片调用传递同一份 `prompt`。用户为特定 Run 或图片指定不同观察要求时，当前 Agent 必须把对应 `prompt` 只传给对应图片。用户明确指定本次关注点时，当前 Agent 还必须在第 4 节的 Prompt 对比中使用该关注点。

4. 命令成功后，当前 Agent 必须读取返回路径中的结果文件，取得本次 `observation`。

5. 某张图片读取失败时，当前 Agent 必须记录该图片的 `media_id`、`file_path`、命令错误码和错误消息，并继续读取其余图片。用户或宿主取消调用时，当前 Agent 必须将该结果作为取消单独报告，并立即结束本次 Skill 执行。

## 4. 对比生成意图与可见结果

1. 当前 Agent 必须为每个 Run 独立比较原始 `parameters` 与成功取得的图片 `observation`。生成意图以 Prompt 参数为准。比较内容包括主体、数量、外观、姿态、构图、镜头、场景、光线、风格和文字。当前 Agent 将宽高、seed、steps、CFG、sampler 和 scheduler 等运行参数作为诊断上下文，以解释生成过程。

2. 当前 Agent 必须逐项区分：

   1. 符合意图：图片观察明确支持的生成意图；
   2. 缺失或偏弱：图片观察明确描述为缺失或表现偏弱的生成意图；
   3. 意外内容：图片观察明确出现，但生成意图没有要求的内容；
   4. 不确定：图片观察未提及、描述为遮挡或无法确认的内容。

3. 当前 Agent 必须按上述分类处理视觉模型的观察。多张图片属于同一 Run 时，当前 Agent 必须分别列出图片差异，再归纳该 Run 的重复问题和偶发问题。

## 5. 编写改进 Prompt

1. 当前 Agent 必须为存在成功图片观察的每个 Run 编写一份改进 Prompt。当前 Agent 保留符合用户意图的内容，强化缺失或偏弱的内容。含糊表达改为明确的主体、关系、位置、镜头和视觉属性。只有意外内容影响用户目标时，当前 Agent 才可以添加针对性约束。

2. 当前 Agent 必须保持原 Prompt 的语言和标签体系。当前 Agent 必须按原始 `parameters` 中的参数名分别给出每个已有 Prompt 参数的改进值，并保留各参数的用途。

## 6. 返回结果

1. 当前 Agent 必须按第 2 节取得的 `run_id` 顺序返回：

   1. Run 标题与原始 Prompt 参数；
   2. 每张图片的 `media_id`、观察结果或读取错误；
   3. 符合意图、缺失或偏弱、意外内容与不确定内容；
   4. 该 Run 的改进 Prompt；
   5. 非 Prompt 运行参数的保持或调整意见及具体理由。

2. 存在多个 Run 时，当前 Agent 在各项结果后补充共同问题与差异。每个 Run 保留独立的改进 Prompt。
