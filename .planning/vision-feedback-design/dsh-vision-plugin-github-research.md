# DSH 读图插件 GitHub 调研

调研日期：2026-08-29

## 结论

GitHub 上已经有多个 DeepSeek Harness 读图插件，“当前文本 Agent 通过 Tool 调用独立视觉模型”已有社区实现先例。现有插件分别覆盖独立 Provider/模型、本地图片路径、默认提示词、`temperature` 和设置页，但未发现一个插件同时满足全部要求。本文记录的候选能力来自 2026-08-29 对公开 README 和源码的只读调研，尚未经过本项目的安装或运行验证。

本项目不应直接安装或复制某个社区插件。建议使用 Harness 官方 LLM 与 Attachment seam 实现一个轻量、通用的读图 Tool，并将“读图”与“生图 Prompt 对比”解耦。

调研结论不锁定 `0.1.1-rc.2` 或其他 DeepSeek Harness 版本。候选仓库声明的版本只是该候选的历史兼容性信息，不是方案限制。

## 官方能力

DeepSeek Harness 官方 `@deepseek-ai/dsh-tool-fs` 提供 `read_image(file_path)`。该 Tool 把 PNG、JPEG、WebP 或 GIF 保存为 `ImageAttachmentRef`，并把 `ImageBlock` 交给当前路由模型。当前路由模型必须声明支持 `image` 输入。该 Tool 不选择独立视觉模型，也不提供分析 Prompt 或 `temperature` 参数。

来源：[DeepSeek Harness `dsh-tool-fs` README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/tool-fs/README.md)、[Attachment 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/attachment.md)。

## 候选插件对比

| 候选 | 独立视觉模型 | 设置页 | 默认 Prompt | `temperature` | 本地路径 | 判断 |
| --- | --- | --- | --- | --- | --- | --- |
| [`OoWJZZoO/dsh-read-image`](https://github.com/OoWJZZoO/dsh-read-image) | 是 | 是 | 是 | 否 | 是 | 最接近设置页和通用读图 Tool 的组合，但缺少 `temperature` |
| [`Yuuz12/dsh-vision-helper`](https://github.com/Yuuz12/dsh-vision-helper) | 是 | 是 | 未见可编辑默认值 | 是 | 是 | README 和源码展示了设置页管理 Provider、模型和 `temperature` 的实现先例 |
| [`chenkezhen480/dsh-multimodal`](https://github.com/chenkezhen480/dsh-multimodal) | 是 | 否 | 调用时支持 | 是 | 是 | Tool 参数较完整，但配置写在插件文件中，且耦合生图功能 |
| [`Mappedinfo/dsh-tool-vision-read`](https://github.com/Mappedinfo/dsh-tool-vision-read) | 是 | 未见完整设置页 | 是 | 未见 | 是 | 同时提供 direct Tool 和独立视觉子 Agent 路径，适合验证能力边界 |
| [`Xin-Zhang-IceMan/dsh-vision-plugin`](https://github.com/Xin-Zhang-IceMan/dsh-vision-plugin) | 是 | 是 | 固定值 | 否 | 是 | 提供可用的基础路径，但提示词和参数不完整 |
| [`Argonaut790/dsh-deepseek-vision`](https://github.com/Argonaut790/dsh-deepseek-vision) | 是 | 是 | 固定 persona | 否 | 会话附件 | 提供视觉子 Agent 的社区实现先例，但比单次读图 Tool 更重 |
| [`ysr666/dsh-vision-router`](https://github.com/ysr666/dsh-vision-router) | 是 | 是 | 调用时问题 | 部分后端支持 | 是 | 包含 OCR、grounding、crop、diff 和路由链，超出本次范围 |
| [`Zhangbo-cn/dsh-vision-plugin`](https://github.com/Zhangbo-cn/dsh-vision-plugin) | 是 | 否 | 调用时支持 | 否 | 是 | `ctx.vision` 接口分层值得借鉴，仓库仍较早期 |

其他相关实现包括 [`CaseyTso/dsh-analyze-image-tool`](https://github.com/CaseyTso/dsh-analyze-image-tool)、[`Poepon/dsh-image-generation-responses`](https://github.com/Poepon/dsh-image-generation-responses)、[`sjscy05/deepseek-harness-vision-plugin`](https://github.com/sjscy05/deepseek-harness-vision-plugin) 和 [`tonyd2wild/DeepSeek-Harness-Vision-Tools`](https://github.com/tonyd2wild/DeepSeek-Harness-Vision-Tools)。这些仓库为本地路径、attachment ID、独立视觉路由和 Skill 引导 Agent 调用 Tool 提供了社区实现先例。

## 未发现的现成能力

未发现一个公开插件提供以下完整链路：

```text
ComfyUI run_id
  -> 查询当次生成的原始 Prompt 和图片
  -> 调用独立视觉 Provider/模型
  -> 返回视觉观察
  -> 对比原始 Prompt 并给出改进 Prompt
```

该结果支持将上述链路拆为三个独立职责：

1. `get_generation_run_media` Tool 把 `run_id` 解析为当次生成的 Prompt 和本地图片引用。
2. `inspect_image` Tool 使用独立视觉模型把图片转换为观察结果。
3. Prompt 对比 Skill 定义比较标准和输出格式；当前 Agent 按 Skill 指令读取原始 Prompt 和观察结果，并生成改进 Prompt。

## 对设置页的推论

读图 Tool 需要运行时可调整的视觉 Provider、视觉模型、默认分析 Prompt、`temperature` 和最大输出 Token。这些值是读图能力的配置，不属于某个 Prompt 对比 Skill。因此为通用读图 Tool 提供设置页是合理的。

设置页不应硬编码 OpenCode Go 或 DeepSeek 模型 ID。Provider 与模型应来自 Harness 当前模型目录，并且模型列表只展示明确声明支持 `image` 输入的模型。

`inspect_image` 只接受图片目标：

```ts
inspect_image({ file_path })
```

Tool 每次读取设置页当前命名配置保存的读图 Prompt。Tool 只返回图片观察结果，不读取生图 Prompt，不执行 Prompt 对比，也不生成改进 Prompt。

## 建议

建议不直接采用上述任一社区插件。实施时可以借鉴以下设计先例：

- 使用官方 `read_image` 的本地文件到 `ImageAttachmentRef` 转换路径。
- 使用 `dsh-read-image` 的 Provider、模型、默认 Prompt 和设置页分工。
- 使用 `dsh-vision-helper` 的 `temperature` 配置先例。
- 使用 `dsh-multimodal` 的 `temperature` 参数先例。
- 使用 Harness 当前公开 LLM seam 调用独立视觉模型，不依赖某个 Provider 的私有 HTTP 接口。

实施前应针对项目届时支持的 DeepSeek Harness 版本执行接口合同测试。该测试用于验证实际兼容性，不把任何单一版本写入产品设计。
