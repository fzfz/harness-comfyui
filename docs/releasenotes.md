# Harness ComfyUI v0.3

v0.3 交付可在 DeepSeek Harness `0.1.1-rc.2` 中运行的 ComfyUI 工作台插件与真实异步生成链路。

## 主要变更

- 左侧提供 ComfyUI 工作台入口；中列保留 Harness 原生会话与 composer，并提供模型选择、上下文选择和已选上下文管理；右侧使用可收起的结果列展示异步运行与媒体。
- 上下文选择器通过已发布 Catalog CLI 读取底模、Workflow 模板、LoRA、作品、角色、画风、提示词条目和画师串，并提供搜索、筛选、多选与卡片式媒体预览。
- Workflow 模板消息上下文只保存模板 ID 和标题。`comfyui-generate` Skill 通过 `query_semantic_comfyui_templates` 取得参数定义，再使用模板 ID 和本次运行参数调用 `generate_with_comfyui`。
- 同一用户轮次可以声明多个独立 Generation Request；Skill 为每项请求创建一个独立异步 Run，不合并 Tool Call、媒体或 Actual Workflow。
- Host 使用 SQLite 保存 Generation Run，使用独立运行目录保存请求、来源快照、Actual Workflow 和 API Workflow，并使用两级分片目录保存大量媒体文件。Host 重启后继续观察非终态 Run。
- ComfyUI transport 使用实例的 `/object_info`、`/prompt` 和 Jobs API 完成 Workflow 编译、提交、状态观察和输出下载，并识别实例返回的取消状态；Workflow compiler 根据目标实例枚举处理不同操作系统的模型路径分隔符。
- 每张媒体卡片提供原文件新窗口入口和该媒体所属 Actual Workflow 下载；不同 Run 的媒体不会共享同一 Workflow。
- 运行失败时，右侧运行卡片提供错误详情弹窗，显示运行错误码，并完整显示实例返回的 `error` 和 `node_errors`，不使用通用错误替代具体实例信息。

## 验证

- `pnpm quality` 通过 195 项单元与集成测试、18 项合同与安全测试、14 项生产测试和 27 项原型测试；函数覆盖率为 100%。
- 36 个真实 Workflow 模板分别针对两个已登记 ComfyUI 实例完成 72 次 `/object_info` 编译验证；每个模板至少兼容一个实例。
- 模板 37、38 和 28 完成真实 Harness Skill、Tool、`/prompt`、Jobs 状态观察、媒体下载、分片保存和右栏展示；模板 34 的实例错误由右栏错误详情完整显示。
- 同一 Harness 用户轮次成功创建两个不同宽高、提示词和 Seed 的异步 Run，分别保存 384×512 与 512×384 图片；两张图片的逐媒体 Workflow 下载内容与各自请求一致且互不相同。
- v0.3 仅在源码提交与最终发布提交的 GitHub CI 都通过干净检出和冻结依赖安装验证后发布。
