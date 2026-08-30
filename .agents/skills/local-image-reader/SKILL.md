---
name: local-image-reader
description: 使用 Harness 当前“图片读取”配置中的视觉模型读取一张或多张本地图片，并按输入顺序返回逐图观察结果。用户提供本地图片绝对路径并要求识别、描述或分析图片内容时使用。
---

# Local Image Reader

## 1. 读取 CLI 合同

当前 Agent 在本次 Skill 执行第一次调用项目 CLI 前必须完整读取 `references/image-inspection-cli.md`。CLI 返回错误后，当前 Agent 在修改命令输入或重试前必须重新读取该文件的“错误、修正与重试”章节，除非当前上下文完整保留该章节。上下文压缩后不再完整保留该文件内容时，当前 Agent 必须在下一条 CLI 命令前重新完整读取该文件。

## 2. 取得本地图片路径

当前 Agent 必须从用户消息中按出现顺序收集一张或多张本地图片的绝对路径。用户指代当前消息中带有本地路径的图片附件时，当前 Agent 必须使用该附件提供的本地绝对路径。当前消息没有可用的本地图片绝对路径时，当前 Agent 必须请用户提供至少一个本地图片绝对路径，并结束本次 Skill 执行。

当前 Agent 只把用户明确提供或明确指代的本地图片路径加入本次读取列表。当前 Agent 必须保留重复路径和输入顺序。

## 3. 逐图读取

当前 Agent 必须按输入顺序为每张图片分别调用一次 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin`。每次调用的 stdin JSON 必须只包含当前图片的 `file_path`。图片读取使用 Harness“图片读取”设置中当前命名配置保存的视觉模型、读图提示词和采样参数。

某张图片读取失败时，当前 Agent 必须记录该图片的 `file_path`、命令错误码和错误消息，并继续读取其余图片。用户或宿主取消调用时，当前 Agent 必须立即结束本次 Skill 执行。

## 4. 返回观察结果

当前 Agent 必须按输入路径顺序返回每张图片的以下结果：

1. `file_path`；
2. CLI 返回的 `provider` 与 `model`；
3. CLI 返回的 `observation`，或本次读取的错误码与错误消息。

当前 Agent 必须以成功返回的 `observation` 作为该图片的视觉观察来源。当前 Agent 可以根据用户的问题组织这些观察文本，但不得查询 Generation Run、读取 Generation Prompt 或编写下一次生成使用的改进 Prompt。
