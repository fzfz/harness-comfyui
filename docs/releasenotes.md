# Harness ComfyUI v0.36.0

v0.36.0 为独立图片读取能力增加可切换的命名配置。用户可以继续选择 Harness 当前运行时提供的视觉模型，也可以配置独立的 OpenAI 兼容 Chat Completions 地址和模型；图片读取模型不会跟随当前 Session 模型或 ComfyUI 生图模型。

## 命名图片读取配置

- “图片读取”设置页支持新建、复制、删除和切换最多二十份命名配置。复制操作会复制连接参数、模型、提示词和采样参数，但不会复制 API Key。
- 每份配置独立保存连接方式、视觉模型、默认读图提示词、`temperature` 和最大输出 Token。
- “系统 Provider”连接从 Harness LLM Runtime 动态列出明确声明图片输入能力的 Provider 与模型，不硬编码 Provider 或模型 ID。
- “OpenAI 兼容接口”连接保存完整 Chat Completions 地址和精确模型 ID，不依赖系统 Provider 目录。
- 设置页通过一个 Host Remote 请求保存全部配置和凭据变更；保存成功后的下一次 `inspect_image` 调用立即使用当前配置。

## OpenAI 兼容图片读取

- Host 把单张 PNG、JPEG、WebP 或 GIF 图片编码为 Data URL，并发送 OpenAI Chat Completions 格式的 `messages`、`model`、`temperature` 和 `max_tokens`。
- 可选 API Key 使用 Harness Settings `secret` role 保存。浏览器收到的凭据状态只包含 `hasApiKey`。Client 通过 write-only 的首次设置、替换、清除或保留操作管理 API Key；保留操作不会提交新的密钥值。
- Host 不自动补全接口路径；设置页要求填写接受 POST 请求的完整地址。
- HTTP 地址不会提供传输加密。使用 HTTP 内网接口和 API Key 时，部署者必须确认目标网络链路符合部署要求。
- OpenAI 兼容响应的声明长度与实际流式累计长度都限制为 1 MiB；响应体读取和 JSON 解析阶段继续响应调用者取消。
- 系统 Provider 路线继续复用 Harness Attachment Store 与 LLM Runtime；OpenAI 兼容路线不会把请求误交给当前会话模型。

## 默认读图提示词

- 新配置使用用户确认的英文视觉标签提示词，要求严格输出 Quality、Aesthetic、Period、Meta、内容分类、主体数量、角色名、作品名、`@` 画师标签和通用视觉标签。
- 标签列表后必须输出不超过 60 个英文词的空间构图描述，并包含相机视角和主体身体与环境的接触关系。
- 每份配置都可以完整修改自己的默认读图提示词。调用 `inspect_image` 时传入非空单次 `prompt` 会覆盖当前配置的默认值。
- 图片读取 Tool 仍然只分析一张图片；Generation Prompt 对比和下一轮 Prompt 改进继续由 `comfyui-image-review` Skill 独立完成。

## 升级与错误边界

- v0.35.x 的 `harness-comfyui-image-reader` 单配置用户值会在新 namespace 尚无用户值时迁移为“原图片读取配置”，并保留 Provider、模型、提示词、`temperature` 和最大输出 Token。
- 已存在新的命名配置时，Host 不会重复迁移或覆盖。
- 配置验证失败使用 `IMAGE_READER_SETTINGS_INVALID`；Settings 持久化失败使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`。
- Host 在 `settings.replace()` 成功后返回已经提交的配置，不会把提交完成后的取消误报为保存失败。

## 验证

- 完整 `pnpm quality` 通过：523 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试成功。
- 覆盖率为 statements 93.02%、branches 86.32%、functions 100%、lines 95.64%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- 用户提供的内网 OpenAI 兼容服务能够列出目标模型，并能够通过项目 `ImageReaderService` 的 `openai-compatible` 分支读取真实截图；调用没有经过 Harness Attachment Store 或当前 Session LLM Runtime。
- 源码提交 `6cd635113ce24ff8260716574ef041be31f0b618` 的 [GitHub CI](https://github.com/fzfz/harness-comfyui/actions/runs/33266400309) 已通过。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
