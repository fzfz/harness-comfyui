# 生产生成提交超时与官方前端编译失败修复计划

## 必须要实现的目标

- 计划执行者必须在独立 linked worktree 中修复生产 Run `run_1943e35f-fcdd-43c0-9139-2bbfd014f115` 暴露的故障链：Electron Helper 运行官方前端编译器时 `Page.navigate` 不结算，导致提交命令超过 DSH 普通 Bash Tool Call 的 60000 毫秒默认预算；CLI 客户端断开后 Host waiter 继续运行。
- `OfficialApiWorkflowCompiler` 在 cache miss 时必须通过标准 Node.js 子进程运行完整 `ChromeComfyFrontend` 编译器。Electron Helper 只负责发送一份版本化 JSON 请求、接收结构化诊断和最终 Workflow，不在自身运行时中执行 CDP 编译阶段。Host 必须为每个 Worker 创建独立进程组，使强制取消只回收该 Worker 和该 Worker 的 Chrome 后代进程。
- 编译浏览器必须直接启动带独立临时 profile 的 headless Chrome，并传入 `--use-mock-keychain` 与 `--disable-features=DialMediaRouteProvider`，防止 macOS 钥匙串和网络权限对话阻塞无人值守编译。
- `WebSocketCdpSession` 必须在连接后的 WebSocket `close/error`、target crash 和每个阶段 deadline 到期时结算全部 pending command；错误必须包含具体 stage、CDP method 和唯一错误码。
- 模板 42、实例 2、原始 Generation Request 的新开发 Run 必须进入 `succeeded`，并且 `generation resolve-media --stdin` 必须返回至少一项本机可读取且字节数大于零的媒体文件。失败 Run 落库、返回 `run_id`、返回精确错误码、写入 Official API Workflow Cache 或完成 `/prompt` 提交均不构成修复成功。

## 已确认的根因与修复设计

### 60000 毫秒提交命令超时

- 当前 DSH Desktop 使用的 `@deepseek-ai/dsh-base@0.1.2-alpha.1` 在 `cordis.patch.yml` 的 `bash-sandbox` 配置中写入 `timeoutMs: 60000`。DSH Desktop 提交 `16893cb5949e585ff98c62c044270513ecb3c24c` 于 2026-08-29 把 Harness `0.1.2-alpha.1` vendored 到本机 Desktop；Harness ComfyUI 提交 `91ab4bb8a7655a4b14fc6176cd1b5e8fbb5ecdef` 于 2026-08-30 开始集成该 Desktop。
- 该 60000 毫秒是普通前台 Bash Tool Call 的默认执行预算，不是 Harness ComfyUI 新增的生成超时，也不是远端 ComfyUI 生成时限。项目不修改 DSH 的 60000 毫秒默认值，也不修改 `comfyui-generate` Skill；标准 Node.js Worker 修复必须让同步官方前端编译正常结束，不再依赖扩大 Skill Tool Call 超时。

### CLI 客户端断开后 Host waiter 未取消

- managed CLI 完整发送 HTTP 请求体后被 Bash executor 终止时，`IncomingMessage.aborted` 不保证触发。旧 Host route 没有监听 `ServerResponse.close`，因此 `GenerationRuntime.acceptGeneration()` 继续运行。
- 修复后的 route 同时监听请求体 `aborted` 与响应在 `writableEnded=false` 时发生的 `close`。正常完整响应不得中止 Runtime signal；断开只中止当前 waiter，不创建第二个 Run。

### Electron Helper 中的 `Page.navigate` 不结算

- 三个真实开发 Harness Run `run_d738a7e3-7bfa-4460-96b7-f9c13dfba2a4`、`run_dee41f3f-6711-4379-a288-2b231d561c4e` 和 `run_2ca46ebc-5431-4b79-92d5-d914e78f8760` 都在 Electron Helper Host 中稳定返回 `COMFYUI_FRONTEND_NAVIGATION_FAILED`，具体命令为 `Page.navigate`，阶段时限为 10000 毫秒。
- 相同模板、实例、Chrome 和产品编译器在标准 Node.js `v24.9.0` 子进程中成功导出 15 个 API Workflow 对象。只把 Chrome 子进程改由标准 Node.js 启动不能修复故障；把完整 `ChromeComfyFrontend` 编译器移入标准 Node.js 子进程后故障消失。
- 修复新增版本化 stdin/stdout Worker 协议。认证值只进入 Worker stdin，不进入命令行；Worker stderr 有界；调用者取消只终止当前 Worker；Worker 返回原始 `GenerationRuntimeError` 错误码和用户文案。
- `ChromeComfyFrontend` 为 DevTools port、target 创建、WebSocket 连接、domain enable、导航、readiness 和 export 分别设置 deadline，监听 `Inspector.targetCrashed`，保存有界且脱敏的 Chrome stderr，并且只在第一次 pre-readiness 基础设施失败后使用全新临时 profile 重试一次。未配置实例认证时不启用 CDP Fetch 拦截；配置认证时只向同源请求注入 Authorization，并从跨源请求中删除 Authorization。

## 验收清单

- [x] 独立 worktree 和分支 `codex/diagnose-frontend-browser-timeout` 已建立，生产 checkout 只用于读取证据。
- [x] 60000 毫秒默认值已经定位到 `@deepseek-ai/dsh-base@0.1.2-alpha.1`，本机 Desktop 引入提交和 Harness ComfyUI 集成提交已经确定。
- [x] Electron Helper 真实 Run 已稳定定位到 `Page.navigate`；完整编译器在标准 Node.js Worker 中成功导出 15 个 API Workflow 对象。
- [x] CDP close/error、target crash、阶段 deadline、浏览器 stderr、一次 pre-readiness 重试和认证请求拦截已经实现并有测试。
- [x] CLI 断开取消、正常响应不取消和 Worker 取消竞争已经实现并有测试。
- [x] Worker 强制取消会回收独立进程组内的无响应 Worker 和 Chrome 后代；异步 stdin `EPIPE` 会返回结构化 Worker 失败。
- [x] 并行 Host bundle 测试使用独立输出根目录，不会互相删除 `.local/source-host` 构建产物。
- [x] DSH 普通 Bash Tool Call 的 60000 毫秒默认值和 `comfyui-generate` Skill 均未修改。
- [x] macOS 编译浏览器命令已经加入 `--use-mock-keychain` 与 `--disable-features=DialMediaRouteProvider`；源码和打包 Worker 都包含这两个参数。
- [x] 44 个单元/集成测试文件共 857 项测试通过；statements 93.32%、branches 86.37%、functions 100%、lines 95.98%。
- [x] 新 Run `run_3a877877-d96d-4815-bbcc-299c6a569b7f` 的 `request_json` 与原始 Generation Request 字节完全相同；Run 进入 `succeeded`，同一 Harness Session 的 CLI 返回一项 2758646 字节的本机可读 PNG 文件。
- [x] 独立 Standards Review、Spec Review、Semantic Review、完整 `pnpm quality` 与 `git diff --check` 全部通过。
- [x] 开发 Desktop 已停止，主 checkout 的临时开发环境覆盖和 Skill 链接已经恢复。

## 非本次目标

- 本次修复不修改生产 checkout 的源码、测试、配置、运行状态或数据库记录。
- 本次修复不重启远端 ComfyUI 实例，不修改实例 2 的服务器文件、启动参数或用户设置。
- 本次修复不修改普通 Bash Tool Call 的 60000 毫秒默认值，不修改 `comfyui-generate` Skill。
- 本次修复不增加新依赖，不增加 browserless compiler、替代浏览器、GPU 禁用、第三方扩展 denylist 或静默降级。
- 本次修复不把失败 Run、精确错误、缓存文件或 `prompt_id` 当作成功结果。
- 当前授权不包含推送分支、发布版本或部署生产环境。

## 已获得的授权

- 用户已授权创建独立 worktree、读取开发仓库和生产部署目录、运行隔离诊断、设计根因修复方案并在用户批准后实施。
- 用户通过 `$implement` 明确批准在独立 worktree 中实施修复、测试、创建开发验收 Run 并提交当前分支。
- 用户明确规定只有生成真正完成并产生可读取媒体才算修复成功。
- 用户要求停止产生 Chrome 钥匙串对话，并明确允许启动带隔离参数的编译浏览器完成真实生成验收。验收后开发 Desktop 已停止。
