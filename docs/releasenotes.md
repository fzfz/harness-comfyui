# Harness ComfyUI v0.31.0

v0.31.0 让 Harness Host 使用目标 ComfyUI 官方前端生成最终 API Workflow，并使用本地缓存复用官方导出结果。该版本修复模板 39 的 `Lora Loader (LoraManager)` 结构化 LoRA 输入缺失，同时保留旧 Workflow compiler 已经通过回归测试的通用参数改写能力。

## 主要变更

- `ComfyWorkflowCompiler` 继续负责参数 binding、连接上游 Prompt 定位、尺寸倍率、seed、模型路径、标准 LoRA、Power LoRA、LoRA Text Loader、bypass 和活动输出节点筛选。旧手写结果现在只作为运行时 API Workflow 投影，不再直接提交给 `/prompt`。
- Official API Workflow Cache 未命中时，`ChromeComfyFrontend` 启动配置的本机 Chrome 或 Chromium，通过 Chrome DevTools Protocol 在导航前设置实例认证 header，等待目标页面与自定义节点完成初始化，再调用官方 `loadGraphData()` 与 `graphToPrompt()`。
- Official API Workflow Cache 命中时，Host 不启动浏览器。Host 深拷贝缓存的 Official Base API Workflow，再覆盖本次请求的非连接输入；官方连接 tuple、虚拟节点、额外输入和 `{ "__value__": ... }` 包装结构保持不变。
- 缓存 identity 包含实例 ID、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希和执行结构哈希。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。同一 Host 的并发 miss 合并为一次官方导出；损坏缓存、浏览器启动、前端 readiness、导出和覆盖失败返回独立错误码，不触发静默回退。
- 浏览器只给目标 ComfyUI 实例同 origin 的页面、API 和子资源请求注入实例认证头；跨 origin 子资源和重定向不会携带该认证头。并发 cache miss 的每个调用者独立取消，只有全部等待者取消时才终止共享导出且不写缓存。
- 精确 `Lora Loader (LoraManager)` 节点同时更新 `text` 与结构化 `loras` widget。空 LoRA 选择会清除模板默认值；非空选择会把 LoRA 名称、模型权重、CLIP 权重和 active 状态写入官方导出的 `inputs.loras.__value__`。
- 生产运行合同新增 Official API Workflow Cache 受管目录、浏览器可执行文件、Host 级缓存代次和前端编译超时。`prod:health` 现在验证缓存目录的读写能力。
- 本版本使用 Node 22 内置 WebSocket、文件系统和 SHA-256，没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。

## 验证

- Workflow compiler 的原有参数化回归用例继续执行旧逻辑，并通过透传 `officialApiWorkflowCompiler.compile()` 测试替身观察运行时投影；新增的端到端编译用例比较空、单个和多个 LoraManager 选择在 cache hit 与新鲜官方导出路径中的最终结果。
- 新增缓存、不可变 Runtime Input Overlay、cache hit 与新鲜导出等价、浏览器/CDP 生命周期、统一超时、LoraManager 结构化输入和生产配置分支测试。
- 完整 `pnpm quality` 已通过：358 项 unit/integration、22 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 122 实例运行 ComfyUI `0.33.3` 与 Frontend `1.49.6`。模板 39 的首次请求完成官方 cache miss，第二个不同 LoRA 权重请求 cache hit 且没有再次调用浏览器。
- 最终质量门禁通过 370 项 unit/integration、22 项 contract/security、15 项 production 和 27 项 prototype 测试；函数覆盖率为 100%，依赖审计的 critical、high、moderate、low 均为 0。
- 受控真实请求 `29f91894-e160-4b3f-abb6-565f8f7e9617` 成功完成。服务器 history 记录节点 5 的结构化 LoRA 为 `strength=3`、`clipStrength=3`、`active=true`；节点 13 输出 `2026-08-27-221214_anima-aesthetic-v1.1_777001.png`，完成后实例队列为 running 0、pending 0。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
