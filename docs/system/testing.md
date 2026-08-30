# 测试规范

## 系统验证

独立 linked worktree 中的源码运行、配置变更和界面联调使用开发进程命令：

```sh
pnpm worktree:start
pnpm worktree:status
pnpm worktree:health
pnpm worktree:logs
pnpm worktree:stop
```

生产 checkout 的进程管理继续使用 `pnpm prod:*`。Agent 不得使用生产入口验证独立 worktree 中的未发布源码。生产进程和共享生命周期自动化验证使用：

```sh
pnpm prod:test
```

`prod:test` 使用临时目录和端口调用共享进程逻辑，并启动一次真实 DSH Host，验证真实 Client 路由通过 ModuleLoader 注册。该测试还覆盖 worktree 配置、开发 Profile、`.env` 链接、Profile 传参、linked-worktree 门禁和生产隔离；真实界面验收使用 `docs/agents/worktree-development.md` 的开发命令流程。

## 自动化测试

| 命令 | 范围 |
| --- | --- |
| `pnpm test:unit` | Host、Agent、Client、配置和测试辅助模块 |
| `pnpm test:integration` | Host 插件组合与逐媒体同源 HTTP 路由 |
| `pnpm test:contract` | package、Git 跟踪、CI 和安全合同 |
| `pnpm prod:test` | start、stop、restart、status、health、logs、PID、端口和真实 Client ModuleLoader 分支 |
| `pnpm test:prototype` | 静态原型结构与数据关系 |
| `pnpm test:coverage` | unit 与 integration 覆盖率 |
| `pnpm quality` | 依赖检查、类型检查和全部必需测试 |
| `pnpm verify:comfyui-workflows -- --instance-id <Source实例ID> --output <结果JSON路径>` | 当前Source全部Workflow模板、`config/verification/comfyui-workflow-parameter-support.json`精确参数支持基线、目标实例实时`/object_info`、组合参数编译、官方页面导出和缓存miss→hit一致性 |

覆盖率阈值由 `config/quality-gates.json` 唯一定义：lines 91%、functions 100%、statements 88%、branches 79%。

新功能和缺陷修复必须覆盖成功、拒绝、清理和错误分支。语义文档由独立 Reviewer 阅读验收，不使用脚本判断语义质量。

Generation 自动化测试使用 fake Source、fake Comfy transport 与临时 SQLite/文件目录覆盖项目 Tool 注册、实例 ID 安全投影、Run 幂等、状态转换、重启恢复、连接式运行参数解析、目标冲突、不可达候选、bypass 分支、序列化值节点、精确尺寸拒绝、BOOLEAN widget、临时预览过滤、`extra_data.extra_pnginfo.workflow` 提交、媒体分片、逐媒体 Workflow 和 Client 单一投影。Catalog 自动化测试覆盖 Source v0.84.0 的 `sample_image_urls` 严格映射、非法 URL 拒绝、封面与样例去重、封面预览不改变选择集合、箭头和键盘导航、图片错误状态、焦点恢复、画廊 header/body 高度分配、箭头居中和图片双轴滚动，以及确认后只插入原 `CatalogContext`。真实实例验收使用生产 Source CLI 与 ComfyUI `/object_info`、官方页面 API Workflow 导出、`/prompt` 和 Jobs API 验证当前 Catalog 模板的显式参数编译、异步运行、媒体保存、Actual/API Workflow 参数一致性、图片内容与尺寸，以及实例错误展示。

历史 Generation Run 输入查询测试覆盖 Tool 与 CLI 的单项和批量入口、输入顺序、重复 `run_id`、完整 ID、最少八个 UUID 字符的短 ID、短 ID canonical 完整值返回、当前 Workspace 唯一匹配、其他 Workspace 同前缀隔离、短 ID 无匹配与多匹配逐项错误、单项无效 ID、损坏的 `request_json`、历史请求缺少 `loras` 或 `model`、准备失败、Actual Workflow 文件缺失或无效、未分类文件系统错误脱敏、1 项与 20 项边界、21 项拒绝和取消传播。CLI 集成测试必须确认合法批量请求包含单项错误时仍返回退出码 0。

图片读取自动化测试使用 fake Settings scope、fake Attachment Store、fake LLM Runtime 与 fake Fetch 覆盖当前 Workspace 中的多 Run 查询、逐 Run 错误、图片稳定排序、单图输入、设置页 Prompt 唯一来源、调用时 Prompt 拒绝、系统视觉模型过滤、系统 Provider 采样参数、自定义 Chat Completions 请求、Data URL、write-only API Key、响应结构、1 MiB 响应上限、响应体取消、文件与 Provider 错误、命名配置增删复制切换、旧单配置迁移、secret redaction、原子保存和持久化错误。CLI 自动化测试覆盖 `generation resolve-media --stdin` 与 `image inspect --stdin` 的参数解析、HTTP 请求、Host 分发、成功输出和错误输出。

Session Media Viewer 自动化测试覆盖媒体查看 URL 编码、Session 与 workspace 归属拒绝、媒体缺失、非 GET 请求、安全响应头、包含 `runId` 的最小启动数据、Run ID 点击复制、Clipboard API 成功、API 缺失、权限拒绝、图片固有尺寸、视频固有尺寸、零尺寸、媒体切换后的 Run ID 与尺寸更新、旧媒体迟到尺寸事件隔离、原始正面提示词、超长正面提示词逐字符完整投影、正面提示词缺失、图片与原生控件视频、左右按钮、裸左右方向键、带 `Alt`、`Control`、`Meta` 或 `Shift` 修饰键的方向键不切换媒体、首尾不循环、按 `created_at DESC, output_index DESC, media_id DESC` 排序媒体、同一个 Run 的正面提示词只读取一次并投影到该 Run 的每项媒体、URL 更新、刷新定位、旧媒体迟到加载错误隔离、当前媒体加载错误、`aria-live` 播报、响应式媒体查询和布局样式合同以及 Client 新标签页入口。Session Media Viewer 静态原型测试覆盖该查看器原型目录中定义的结构方案 A、结构方案 B、结构方案 C、边界文案、提示词状态和本地资源约束；这些结构方案名称不指代 Agent Preset A/B。

Workflow compiler 的回归用例覆盖正负 Prompt 极性、连接上游控件、上游 multiline `STRING` Prompt 控件、多个 multiline `STRING` 候选拒绝、精确尺寸、Seed、采样参数、重复目标、不可达候选、模型、标准 LoRA、Power LoRA、LoraManager、空 LoRA、bypass 和活动输出节点筛选。测试给运行时参数化阶段注入透传 `officialApiWorkflowCompiler.compile()` 测试替身，因此这些用例直接观察运行时 API Workflow 投影。端到端编译用例使用真实 `ComfyWorkflowCompiler` 与 `OfficialApiWorkflowCompiler`，比较空、单个和多个 LoraManager 选择的 cache hit 结果与新鲜官方导出结果，并同时核对 Prompt、尺寸、模型、bypass、活动输出与官方连接。独立 `OfficialApiWorkflowCompiler` 测试验证最终返回值来自官方基础对象，并保留官方虚拟节点、连接改写和字面量载体值。

Official API Workflow Cache 与 Runtime Input Overlay 测试覆盖 cache miss、同一 `OfficialApiWorkflowCompiler` 对象内的 cache hit、重建该对象后对同一目标 ComfyUI 实例的持久 cache hit、不同目标实例 identity 隔离、并发 miss 合并、失败不写入、损坏缓存拒绝、identity 变化、基础对象不可变、官方连接保留、`__value__` 覆盖、字面量载体保留值、非零载体输出拒绝、未引用同形对象拒绝，以及 cache hit 与新鲜官方导出在 Prompt、seed、尺寸、BOOLEAN、enum、模型、标准 LoRA、Power LoRA、LoRA Text Loader 和模板 39 LoraManager 路线中的等价性。

ChromeComfyFrontend 测试使用注入的子进程、文件系统、HTTP 和 CDP seam 验证认证 header 只注入同 origin 请求、跨 origin 请求删除认证 header、前端 readiness、`loadGraphData()`/`graphToPrompt()` 导出、浏览器在 readiness 或导出阶段提前退出、调用者取消、统一超时、CDP 错误、SIGTERM、精确 SIGKILL 和自有临时目录清理。生产实现使用 Node 22 原生 WebSocket，不要求测试启动真实浏览器。

2026-08-27 的 122 实例验收使用 ComfyUI `0.33.3`、Frontend `1.49.6` 和模板 39。第一次请求完成官方前端 cache miss，第二个不同 LoRA 权重请求从本地 cache hit 且没有再次启动浏览器。最终 transport 提交请求 `29f91894-e160-4b3f-abb6-565f8f7e9617`；服务器 history 返回 `success` 和 `completed=true`，节点 5 的 `inputs.loras.__value__` 包含请求的 LoRA 名称、`strength=3`、`clipStrength=3` 与 `active=true`，节点 13 输出 `2026-08-27-221214_anima-aesthetic-v1.1_777001.png`，请求结束后队列为 running 0、pending 0。

2026-08-28 的 122 实例验证覆盖当前 Source Catalog 的 21 个 Workflow 模板。矩阵逐模板核对 15 个公开参数，共 315 项结果符合精确非空支持集合；21 个模板的组合参数编译、官方页面 cache miss、同模板 cache hit 和基础对象一致性验证全部通过。保存的失败 Run `run_8a0642e4-43c8-4c5d-a54f-988a2a61050a` 请求使用当前模板 42、实时 `/object_info`、原 Prompt、原 Seed 和两个 LoRA 重放后完成 Workflow 编译。

v0.31.3 发布文档提交前的完整 `pnpm quality` 结果为 406 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试通过；函数覆盖率为 100%。

2026-08-28 的 v0.31.4 实例 122 验证覆盖当前 Source Catalog 的 18 个 Workflow 模板。矩阵对每个列表型输入从该模板使用的节点类型和实时 `/object_info` 选择合法测试值，不使用跨节点类型的固定显示值。矩阵执行 270 个单参数检查；191 个基线支持参数通过，79 个基线不支持参数返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。18 个模板的组合参数编译、官方页面 cache miss、同模板 cache hit、单次前端导出和基础对象一致性验证全部通过。

v0.31.4 发布文档提交前的完整 `pnpm quality` 结果为 416 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试通过；函数覆盖率为 100%。`/object_info` 缓存测试验证 40 个并发 compile 合并为一个请求、10 分钟 TTL、实例隔离和失败响应不缓存。

v0.32.0 最终完整 `pnpm quality` 结果为 429 项 unit/integration、24 项 contract/security、40 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。1280 × 720 与 390 × 844 的浏览器验收覆盖图片、原生控件视频、首项、末项、正面提示词缺失、媒体文件不存在、点击导航、裸方向键和无水平溢出；用户按带 `Alt`、`Control`、`Meta` 或 `Shift` 修饰键的方向键时，页面不切换媒体。390 × 844 的超长正面提示词验收确认提示词面板内部滚动，页面高度保持 844px，左右箭头继续与媒体舞台垂直居中。

v0.33.0 最终完整 `pnpm quality` 结果为 445 项 unit/integration、24 项 contract/security、59 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。生产生命周期测试确认 `prod:start` 把 A/B Preset 与共享 Tool visibility component 物化到生产 DSH home，物化失败时不写入受管运行状态。真实 `opencode-go/deepseek-v4-flash` A/B 测试完成 3 对兼容性任务，并由 B 通过两个独立前台 shell Tool Call 把逐字段相同的 Generation Request 提交为两个成功 Run。

v0.33.1 最终完整 `pnpm quality` 结果为 447 项 unit/integration、24 项 contract/security、59 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。1280 × 720 浏览器验收覆盖完整 Run ID、Clipboard API 成功反馈、图片固有尺寸、视频固有尺寸和媒体切换后的顶部信息更新。390 × 844 浏览器验收确认完整 Run ID 在按钮内换行显示，顶部高度为 `98.5px`，页面 `scrollWidth` 等于 `clientWidth` 的 `390px`，页面 `scrollHeight` 等于 `clientHeight` 的 `844px`，浏览器错误和警告日志为 0。

v0.33.2 最终完整 `pnpm quality` 结果为 447 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。production 测试确认启动器只物化用户可见名称为 `ComfyUI工作台预设` 的产品 Preset，保留内部 ID `harness-comfyui-cli-candidate`，删除精确声明的已退役项目 Preset，保留其他用户 Preset，并且不会沿退役 Preset 符号链接修改外部目标。Tool visibility 回归测试使用 `tests/fixtures/agent-presets/` 中的非产品 composition 验证 5 个 Host 项目 Tool schema 的隐藏行为。

v0.34.0 发布前完整 `pnpm quality` 结果为 470 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.87%、branches 85.93%、functions 100%、lines 95.28%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.34.1 发布前完整 `pnpm quality` 结果为 471 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.92%、branches 86.04%、functions 100%、lines 95.31%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.35.0 发布前完整 `pnpm quality` 结果为 507 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.9%、branches 86.08%、functions 100%、lines 95.56%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.35.1 发布前完整 `pnpm quality` 结果为 507 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.9%、branches 86.08%、functions 100%、lines 95.56%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.36.0 发布前完整 `pnpm quality` 结果为 523 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 93.02%、branches 86.32%、functions 100%、lines 95.64%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.36.1 发布前完整 `pnpm quality` 结果为 525 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 93.03%、branches 86.28%、functions 100%、lines 95.66%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

## CI

`.github/workflows/ci.yml` 是唯一 GitHub Actions workflow。pull request 和 `main` push 都执行：

1. `pnpm quality:preinstall`
2. `pnpm install --frozen-lockfile`
3. `pnpm quality:fast`

CI 不生成发布包。
