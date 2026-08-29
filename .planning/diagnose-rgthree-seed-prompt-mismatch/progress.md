# 诊断进度

## 2026-08-26

- 已读取 `diagnosing-bugs` 和 `planning-with-files` Skill 的完整说明。
- 已读取仓库 `CONTEXT.md`，确认 Generation Run 独立保存内部请求快照、来源快照、Actual Workflow 和 API Workflow。
- 已记录截图中的 Run ID、模板名称和用户可见 Prompt 前缀。
- 已确认 Agent 工具调用已携带 `positive_prompt`，并定位当前 rgthree `seed = -1` 处理函数与单元测试。
- 当前源码 checkout 未包含截图 Run ID；下一步根据生产配置定位该 Run 的持久化记录。
- 已读取配置和启动规范，确认默认 Run Repository 与 Run 文件路径。
- 已把历史修复定位到提交 `265a249`，并确认当前实现只处理精确节点类型 `Seed (rgthree)`。
- 一次在 `/Volumes/4Tdisk/work/AI2` 下的宽范围 `find` 没有在 10 秒内返回可用输出；后续改用 `rg --files` 和明确目录，避免重复该调用。
- 已定位截图 Run 的生产 SQLite 记录和四份持久化文件。
- 已确认本次 API Workflow 没有 `seed = -1`，并确认模板使用 `SeedNode` 而不是 `Seed (rgthree)`。
- 已确认请求 Prompt 进入 Lora Loader 节点 `5`，但主采样器正向 conditioning 来自节点 `54`；下一步追踪节点 `5` 到节点 `54` 的完整连接路径。
- 已追踪主采样器正向 conditioning 的完整字符串路径，确认节点 `3` 的模板原始 Prompt 才是画面语义来源。
- 已定位参数解析器的候选别名顺序与模板结构之间的冲突；下一步读取模板 39 的实际 parameter/binding 元数据，区分错误 binding 与无 binding 的结构误判。
- 生产配置中的 Source CLI 当前返回 `SOURCE_CONNECTION_FAILED`；本轮不改变外部服务状态，改为读取本机数据源 SQLite。
- 已只读查询模板 39 的实际 runtime config，确认 `positive_prompt` binding 指向 connected 的节点 `54.text`。
- 已确认 Host 忽略该 connected binding 后按 `text` 别名选中节点 `5`，形成请求 Prompt 与主 conditioning 分离的确定性根因链。
- 已创建并运行最小复现测试；测试在 179ms 内稳定失败，失败差异显示节点 `3` 继续使用 `template scene prompt`。
- 已运行历史 rgthree 与 connected Prompt 两个定向测试，两者通过；已证明现有 Prompt 测试缺少 LoraManager `text` 干扰分支。
- 已确认生产版本 `v0.30.4` 包含历史 rgthree 修复与 connected Prompt 修复，不是生产部署遗漏。
- 已统计 32 份模板 runtime config；当前只有模板 39 同时具有 connected Prompt binding 与 LoraManager `text` 干扰候选。
- 已收窄最小复现断言并再次运行，153ms 内稳定复现同一错误。
