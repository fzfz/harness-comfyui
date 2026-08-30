---
name: comfyui-image-review
description: 按一个或多个 ComfyUI Generation Run 的 run_id 读取原始生成参数和本地图片，逐图调用独立视觉模型观察图片，对比生成意图与可见结果，并给出可直接用于下一次生成的改进 Prompt。用户要求分析 run_id 对应图片、检查生图结果、比较 Prompt 与图片或优化下一轮提示词时使用。
---

# ComfyUI Image Review

## 1. 读取 CLI 合同

当前 Agent 在本次 Skill 执行第一次调用项目 CLI 前必须完整读取 `references/cli.md`。CLI 返回错误后，当前 Agent 在修改命令输入或重试前必须重新读取该文件的“错误、修正与重试”章节，除非当前上下文完整保留该章节。上下文压缩后不再完整保留该文件内容时，当前 Agent 必须在下一条 CLI 命令前重新完整读取该文件。

## 2. 取得 Generation Run 与图片

当前 Agent 必须优先从用户消息中按出现顺序收集一个或多个明确的 `run_id`。用户指代当前会话此前的 Generation 提交结果时，当前 Agent 必须从该提交结果中按返回顺序取得对应 `run_id`。当前用户消息和被指代的此前 Generation 提交结果都没有可用 `run_id` 时，当前 Agent 必须请用户提供至少一个 `run_id`，并结束本次 Skill 执行。

当前 Agent 必须把全部 `run_id` 按原顺序分成每组一至二十个，并为每组调用一次 `node "$DSH_HARNESS_COMFYUI_CLI" generation resolve-media --stdin`。当前 Agent 必须按各组调用顺序合并返回的 `runs`，不得去重或重新排序。

某个 `runs` 元素的 `lookup_status` 为 `error` 时，当前 Agent 必须报告该元素的 `run_id`、`error.code` 和 `error.message`，并跳过该元素的图片读取。Run media 命令发生命令级失败时，当前 Agent 必须报告 stderr 中的错误码和错误消息，不得为该失败命令编造 `run_id`。

## 3. 逐图读取

当前 Agent 必须按 `runs` 顺序处理每个成功 Run，并按每个 Run 的 `images` 顺序处理每张图片。当前 Agent 必须为每张图片分别调用一次 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin`，并把该图片的 `file_path` 作为本次调用的同名字段。某个成功 Run 的 `images` 为空时，当前 Agent 必须报告该 Run 没有已保存图片。

用户明确指定本次观察重点时，当前 Agent 必须把该要求写入当前图片调用的 `prompt`。用户没有指定观察重点时，当前 Agent 必须省略 `prompt`，以使用图片读取设置中的默认提示词。当前 Agent 不得把 Generation Request 的 `parameters` 拼入 `prompt`，从而使 `observation` 只基于图片输入和观察要求。

某张图片读取失败时，当前 Agent 必须记录该图片的 `media_id`、`file_path`、命令错误码和错误消息，并继续读取其余图片。用户或宿主取消调用时，当前 Agent 必须立即结束本次 Skill 执行，不得继续调用后续图片。某个 Run 的全部图片读取失败时，当前 Agent 不得为该 Run 编写改进 Prompt。

## 4. 对比生成意图与可见结果

当前 Agent 必须为每个 Run 独立比较原始 `parameters` 与成功取得的图片 `observation`。当前 Agent 只能把 Prompt 参数表达的主体、数量、外观、姿态、构图、镜头、场景、光线、风格和文字要求视为生成意图。当前 Agent 必须把宽高、seed、steps、CFG、sampler 和 scheduler 等运行参数作为诊断上下文，不得把这些运行参数改写成画面内容。

当前 Agent 必须逐项区分：

- 已实现：图片观察明确支持的生成意图；
- 缺失或偏弱：生成意图存在，但图片观察没有明确支持的内容；
- 意外内容：图片观察明确出现，但生成意图没有要求的内容；
- 不确定：图片观察不足以确认的内容。

当前 Agent 不得把视觉模型没有观察到的内容表述为图片中确定不存在。多张图片属于同一 Run 时，当前 Agent 必须分别列出图片差异，再归纳该 Run 的重复问题和偶发问题。

## 5. 编写改进 Prompt

当前 Agent 必须为存在成功图片观察的每个 Run 编写一份改进 Prompt。当前 Agent 必须保留已实现且符合用户意图的内容，强化缺失或偏弱的内容，并使用明确的主体、关系、位置、镜头和视觉属性替换含糊表达。只有意外内容影响用户目标时，当前 Agent 才可以添加针对性约束。

当前 Agent 必须保持原 Prompt 的语言和标签体系。原始 `parameters` 中存在多个 Prompt 参数时，当前 Agent 必须分别给出对应参数的改进值，不得合并正向 Prompt 与负向 Prompt。

## 6. 返回结果

当前 Agent 必须按第 2 节取得的 `run_id` 顺序返回：

1. Run 标题与原始 Prompt 参数；
2. 每张图片的 `media_id`、观察结果或读取错误；
3. 已实现、缺失或偏弱、意外内容与不确定内容；
4. 该 Run 的改进 Prompt；
5. 建议保持或调整的非 Prompt 运行参数及具体理由。

存在多个 Run 时，当前 Agent 必须在全部 Run 结果之后补充跨 Run 的共同问题与差异，并保留每个 Run 的独立改进 Prompt。
