# 独立图片读取 Tool 默认提示词与接口研究

## 研究问题

本研究回答两个问题：单图视觉模型调用应该怎样组织提示词与输出格式；项目怎样同时支持 Harness 系统 Provider 和用户配置的 OpenAI 兼容视觉模型。图片读取、Generation Run 查询和 Generation Prompt 对比继续由三个独立职责完成。

## 第一方资料

OpenAI 的图像输入文档说明，请求可以在同一条消息中同时提供文本和图像，并支持使用 Data URL 传递 Base64 图片。[OpenAI Images and vision](https://developers.openai.com/api/docs/guides/images) OpenAI Chat Completions 接口允许请求指定 `model`、`temperature` 和输出 Token 参数，因此自定义适配器可以把每份配置的模型与采样参数精确发送给兼容服务。

Google Gemini 的图像理解文档建议为视觉任务提供清晰、具体的指令；复杂任务应拆成直接步骤。[Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) Google 的提示设计文档说明，指定输出格式和提供示例可以约束回答结构，但提示词需要使用目标模型的实际结果持续迭代。[Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)

Anthropic 的视觉文档说明，模型可以在同一请求中接收图片与文字；低清晰度、小尺寸和复杂空间关系会影响结果准确性。[Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision) 这意味着严格输出格式不能替代目标模型的真实图片验收。

Qwen3-VL 的官方仓库展示了图像与文本共同组成 user message 的视觉理解调用，并把空间理解、文字识别和视觉推理列为模型能力。[Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) 官方资料没有为 ComfyUI 生成图片定义统一的标签序列或最佳默认提示词。

## 可迁移结论

1. 提示词必须明确说明模型分析当前提供的一张图片，并定义输出顺序。
2. 固定标签槽、字段顺序、短空间构图段落和完整示例可以降低输出结构漂移。
3. Character、Series 与 Artist 识别依赖模型训练数据和图片清晰度；严格格式不能证明这些名称一定正确。
4. `temperature` 与最大输出 Token 属于每份视觉模型配置，不应跟随当前会话模型或生图模型。
5. 图片读取 Tool 一次处理一张本地图片；多个 `run_id` 由上游 Skill 查询并逐图调用。
6. 图片读取结果只作为后续比较的观察输入；Tool 不读取 Generation Prompt，也不生成下一轮改进 Prompt。
7. 默认提示词是应用层产品选择，不是 OpenAI、Google、Anthropic 或 Qwen 的官方统一模板；用户可以按视觉模型修改每份配置。

## 本版本的产品决定

运行时默认提示词的唯一源码位于 `src/image-reader/settings.ts` 的 `IMAGE_READER_DEFAULT_PROMPT`。该提示词使用用户确认的严格英文格式：

- Quality、Aesthetic、Period、Meta、内容分类、主体数量、角色名、作品名、`@` 画师标签和通用视觉标签按固定顺序输出。
- 标签列表之后输出一个不超过 60 个英文词的空间构图段落。
- 空间构图段落必须包含相机视角，以及人物身体与墙面、地面、家具、水面或其他环境对象的接触关系。
- 输出不增加 Section 标题。
- 每份命名配置都可以覆盖完整默认提示词。

## 接口结论

系统 Provider 配置继续使用 Harness 的动态模型目录、Attachment Store 与 LLM Runtime。设置页只显示明确声明图片输入能力的系统模型。

OpenAI 兼容配置使用完整 Chat Completions 地址、精确模型 ID 和可选 API Key。Host 直接读取一张本地图片并发送 Data URL，不调用 Harness Attachment Store，也不调用当前 Session 的 LLM Runtime。响应体受 1 MiB 上限约束，读取和解析阶段继续响应取消。

用户提供的内网服务已经完成三项真实验证：模型目录返回目标模型；直接 Chat Completions 请求能够读取截图；项目 `ImageReaderService` 的 OpenAI 兼容分支能够返回符合默认格式的标签列表与空间构图段落。API Key 没有写入仓库文件或测试日志。

HTTP 地址不会加密 API Key 与图片内容。项目保留用户明确要求的内网 HTTP 能力，并在配置文档中说明该传输属性。

## 非目标

- 本研究不把图片读取与 Generation Prompt 对比合并为一个 Tool。
- 本研究不让 Skill 自行切换当前会话模型。
- 本研究不硬编码任何系统 Provider 或系统模型。
- 本研究不让单次 `inspect_image` 调用处理多张图片。
- 本研究不保证不同视觉模型对同一图片返回相同的角色名、作品名、画师名或通用标签。
