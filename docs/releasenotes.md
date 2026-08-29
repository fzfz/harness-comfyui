# Harness ComfyUI v0.35.0

v0.35.0 增加独立的图片读取链路。用户可以为图片读取单独选择视觉模型与采样参数；Agent 可以根据一个或多个 Generation Run ID 取得本地图片、逐图调用视觉模型，并把图片观察结果与原始生成 Prompt 对比后提出下一轮 Prompt。

## 图片读取设置

- Client 的“图片读取”设置页从当前 Harness LLM 运行时动态列出支持图片输入的 Provider 与模型。设置页不硬编码 `opencode` 或其他 Provider，也不使用当前 Session 模型或 ComfyUI 生图模型作为隐式视觉模型。
- 设置页原子保存 Provider、视觉模型、默认读图 Prompt、`temperature` 和最大输出 Token。保存后的完整配置实时用于下一次图片读取，不需要重启 Host。
- 设置页在保存前验证 Provider 与模型属于当前视觉模型目录，并验证 Prompt 与采样参数。Host Settings schema 验证完整配置的数据结构和数值范围。视觉模型目录只包含运行时声明支持图片输入的模型。

## Run 图片查询与单图读取

- `get_generation_run_media` Tool 与 `image run-media --stdin` managed CLI 接受一至二十个完整 Run ID 或当前 Workspace 中的唯一规范前缀。查询保留输入顺序与重复值，并为每个成功 Run 返回原始 `parameters` 和本地图片路径。
- 每个 Run 独立返回查询结果。无效 ID、无匹配 ID、歧义前缀或读取故障只影响对应 Run，不终止同一批次中的其他 Run。
- `inspect_image` Tool 与 `image inspect --stdin` managed CLI 一次只接受一个 PNG、JPEG、WebP 或 GIF 本地图片路径。Host 验证文件签名、媒体类型和文件大小，把图片保存为 Harness Attachment，再使用图片读取设置中的 Provider、模型、`temperature` 与最大输出 Token 请求观察文本。
- 单次调用可以提供一次性 Prompt；调用省略 Prompt 时，Host 使用图片读取设置中的默认读图 Prompt。一次性 Prompt 不修改保存的设置。

## Skill 与职责边界

- 新增 `comfyui-image-review` Skill。该 Skill 自带 `references/cli.md`，不依赖系统注入的 Tool schema 来理解 managed CLI 参数、输出、错误和重试语义。
- Skill 先批量查询一个或多个 Run，再按稳定顺序为每张图片调用一次单图读取，最后由执行 Skill 的 Agent 对比原始 Prompt 与图片观察并编写改进 Prompt。
- Run 图片查询不调用视觉模型；单图读取不读取 Generation Request 参数；Prompt 对比不在 Tool 中实现。三个职责通过结构化输入与输出组合。
- `ComfyUI工作台预设` 使用 `local-only` Tool visibility mode 隐藏八个 Host 项目 Tool schema，并通过五个项目 Skill 的 managed CLI 完成工作。Harness `standard` Preset 继续获得八个 Host Tool schema。
- 五个项目 Skill 目录以主开发 checkout 为 canonical source；生产部署把五个 `$HOME/.agents/skills/<skill-name>` 路径配置为指向 canonical source 的绝对符号链接。

## 依赖与兼容性

- 项目增加 `@deepseek-ai/dsh-attachment`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-llm` 和 `@deepseek-ai/dsh-settings` 的精确依赖版本 `0.1.1-rc.2`，以使用 Harness 公共 Attachment、Settings 与 LLM Runtime 接口。该包版本约束属于项目依赖策略，图片读取代码不把 `0.1.1-rc.2` 当作运行时能力门禁。
- 本版本没有修改 SQLite schema，也没有改变 `generate_with_comfyui` 或 `read_comfyui_run_inputs` 的请求合同。

## 验证

- 自动化测试覆盖动态视觉模型目录、设置读取与原子写入、默认与单次 Prompt、采样参数、文件签名与大小限制、Attachment 与 Provider 错误、取消、多个 Run 查询、重复 ID、逐 Run 错误、图片稳定排序、Tool 注册、managed CLI 请求和工作台 Preset Tool 可见性。
- 完整 `pnpm quality` 已通过：507 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.9%、branches 86.08%、functions 100%、lines 95.56%；依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 源码与版本号提交 `4466783c7c0f7a729f6db3690ad3338332cedb59` 的 GitHub CI 已通过。最终发布文档提交仍必须通过语义验收、本地质量门禁和 GitHub CI；GitHub Release 创建后，生产部署负责人仍必须完成生产健康检查、五个全局 Skill 符号链接核对和新 Harness Session 的真实图片读取验收。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
