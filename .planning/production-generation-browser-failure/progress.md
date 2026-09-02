# 生产生成提交故障调查与实施进度

## 2026-09-02

### 生产证据与确定性复现

- **状态：** 已完成
- 生产 checkout 只读证据确认 Run run_1943e35f-fcdd-43c0-9139-2bbfd014f115 与同请求重试都在 Official API Workflow cache miss 路径失败。
- DSH Desktop 使用的 @deepseek-ai/dsh-base@0.1.2-alpha.1 把普通 Bash Tool Call 默认值配置为 timeoutMs: 60000。该默认值会在同步 Generation 准备完成前终止 managed CLI。
- 真实 HTTP 复现确认：managed CLI 完整发送请求体后断开时，旧 Host route 不会中止 GenerationRuntime.acceptGeneration()。
- WebSocket seam 复现确认：旧 WebSocketCdpSession 在连接后的 WebSocket close/error 发生后不会结算 pending CDP command。
- 完整扩展、四会话并发和 core-only 真实 Chrome 探针都成功导出模板 42，结果包含 15 个 API Workflow 对象；模板、实例、扩展规模和并发本身不是当前稳定触发条件。

### 实施与根因收敛

- **状态：** 已完成
- 阶段化错误实现后，三个真实开发 Harness Run 都在 Electron Helper Host 的 Page.navigate 阶段超过 10000 毫秒。
- 相同产品编译器在标准 Node.js v24.9.0 子进程中成功导出 15 个 API Workflow 对象。只让标准 Node.js 启动 Chrome 不能修复；完整 ChromeComfyFrontend 必须运行在标准 Node.js Worker 中。
- 新增 NodeWorkerComfyFrontend、版本化 stdin/stdout Worker 协议和打包后的 .local/source-host/comfy-frontend-worker.js。
- 新增 CDP close/error、target crash、分阶段 deadline、有界脱敏 Chrome stderr、认证请求拦截和一次 pre-readiness 重试。
- 编译浏览器直接 spawn Chrome，并加入 --use-mock-keychain 与 --disable-features=DialMediaRouteProvider。产品与验收不再通过 macOS LaunchServices 启动 Chrome。
- CLI route 已在请求体中断或未完成响应关闭时中止当前 waiter；正常响应不误取消。
- Host 使用独立进程组拥有 Worker 和该 Worker 的 Chrome 后代。协作取消超时后，Host 对该进程组发送 `SIGKILL`；真实进程测试证明无响应 Worker 和顽固假 Chrome 均退出，无关进程仍存活。
- Worker stdin 的异步 `error` 事件已纳入终止状态机；并行 Host bundle 测试已改用独立输出根目录。
- DSH 普通 Bash Tool Call 的 60000 毫秒默认值和 `comfyui-generate` Skill 均未修改。标准 Node.js Worker 使同步官方前端编译正常结束。

### 自动化验证

- **状态：** 已完成
- 6 个聚焦测试文件共 69 项测试通过。
- TypeScript 全量类型检查通过。
- 44 个单元/集成测试文件共 857 项测试通过。
- 覆盖率为 statements 93.32%、branches 86.37%、functions 100%、lines 95.98%。
- 首次 pnpm quality 在 848 项测试通过后因新增函数覆盖率为 99.53% 而失败；补齐 Worker stderr、取消竞争、Host 诊断和 CLI response-close 分支后函数覆盖率恢复为 100%。最终完整质量门禁需要在真实生成、文档和独立审查完成后重新执行。

### 真实生成验收

- **状态：** 已通过
- 用户明确允许启动带隔离参数的编译浏览器。
- 真实 Harness Session `session-01a50981-2a78-4cc1-b8ce-ab843571cd3b` 提交了模板 42、实例 2 的原始 Generation Request。新 Run `run_3a877877-d96d-4815-bbcc-299c6a569b7f` 的 `request_json` 与源 Run 字节完全相同。
- 新 Run 从 `remote_running` 进入 `succeeded`；同一 Harness Session 通过 `generation resolve-media --stdin` 返回一张本地 PNG。文件是 1024×1536 RGB PNG，可读，字节数为 2758646。
- 修复后的编译浏览器没有通过 LaunchServices 启动，浏览器 Worker 完成后已退出。验收结束后 `pnpm dev:stop` 和 `pnpm dev:status` 确认 Desktop 已停止。

### 最终验收

- **状态：** 已通过
- 独立 Standards Review、Spec Review 和 Semantic Review 均为 PASS。
- 完整 `pnpm quality` 、`git diff --check` 和生成 Skill 零差异检查全部通过。
