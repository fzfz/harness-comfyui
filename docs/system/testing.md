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

Workflow compiler 的回归用例覆盖正负 Prompt 极性、连接上游控件、精确尺寸、Seed、采样参数、重复目标、不可达候选、模型、标准 LoRA、Power LoRA、LoraManager、空 LoRA、bypass 和活动输出节点筛选。测试给运行时参数化阶段注入透传 `officialApiWorkflowCompiler.compile()` 测试替身，因此这些用例直接观察运行时 API Workflow 投影。端到端编译用例使用真实 `ComfyWorkflowCompiler` 与 `OfficialApiWorkflowCompiler`，比较空、单个和多个 LoraManager 选择的 cache hit 结果与新鲜官方导出结果，并同时核对 Prompt、尺寸、模型、bypass、活动输出与官方连接。独立 `OfficialApiWorkflowCompiler` 测试验证最终返回值来自官方基础对象，并保留官方虚拟节点、连接改写和字面量载体值。

Official API Workflow Cache 与 Runtime Input Overlay 测试覆盖 cache miss、同一 `OfficialApiWorkflowCompiler` 对象内的 cache hit、重建该对象后对同一目标 ComfyUI 实例的持久 cache hit、不同目标实例 identity 隔离、并发 miss 合并、失败不写入、损坏缓存拒绝、identity 变化、基础对象不可变、官方连接保留、`__value__` 覆盖、字面量载体保留值、非零载体输出拒绝、未引用同形对象拒绝，以及 cache hit 与新鲜官方导出在 Prompt、seed、尺寸、BOOLEAN、enum、模型、标准 LoRA、Power LoRA、LoRA Text Loader 和模板 39 LoraManager 路线中的等价性。

ChromeComfyFrontend 测试使用注入的子进程、文件系统、HTTP 和 CDP seam 验证认证 header 只注入同 origin 请求、跨 origin 请求删除认证 header、前端 readiness、`loadGraphData()`/`graphToPrompt()` 导出、浏览器在 readiness 或导出阶段提前退出、调用者取消、统一超时、CDP 错误、SIGTERM、精确 SIGKILL 和自有临时目录清理。生产实现使用 Node 22 原生 WebSocket，不要求测试启动真实浏览器。

2026-08-27 的 122 实例验收使用 ComfyUI `0.33.3`、Frontend `1.49.6` 和模板 39。第一次请求完成官方前端 cache miss，第二个不同 LoRA 权重请求从本地 cache hit 且没有再次启动浏览器。最终 transport 提交请求 `29f91894-e160-4b3f-abb6-565f8f7e9617`；服务器 history 返回 `success` 和 `completed=true`，节点 5 的 `inputs.loras.__value__` 包含请求的 LoRA 名称、`strength=3`、`clipStrength=3` 与 `active=true`，节点 13 输出 `2026-08-27-221214_anima-aesthetic-v1.1_777001.png`，请求结束后队列为 running 0、pending 0。

v0.31.2 发布文档提交前的完整 `pnpm quality` 结果为 404 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试通过；函数覆盖率为 100%。

## CI

`.github/workflows/ci.yml` 是唯一 GitHub Actions workflow。pull request 和 `main` push 都执行：

1. `pnpm quality:preinstall`
2. `pnpm install --frozen-lockfile`
3. `pnpm quality:fast`

CI 不生成发布包。
