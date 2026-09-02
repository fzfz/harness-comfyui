# 生产生成提交超时与官方前端编译失败证据

## 生产现场

- 生产 Run run_1943e35f-fcdd-43c0-9139-2bbfd014f115 使用实例 2、模板 42、model=null、loras=[] 和标题“国风狐耳剑姬·竹海石桥”。Run 最终状态是 failed，错误码是 COMFYUI_FRONTEND_BROWSER_FAILED。
- 同一项 Generation Request 的第二次 Tool Call 创建了另一个 Run。两个 Run 的 request_json 业务字段相同；不同 Tool Call 的重试不会复用第一个 Run。
- 生产 Official API Workflow Cache 没有模板 42、实例 2 对应条目，因此 Host 必须执行 cache miss 编译路径。
- 生产 Chrome 主进程在旧前端编译器的 120000 毫秒总 deadline 内保持存活。旧实现把 target 创建、WebSocket 连接、domain enable 和导航放在同一个 catch 中，因此生产历史记录无法恢复当时具体卡住的 CDP method。

## 为什么生产 Host 使用 Chrome DevTools

- 远端地址 http://192.168.110.122:8188 只提供 ComfyUI HTTP 页面、资源和 API。远端 ComfyUI 实例没有向 Harness 暴露 Chrome DevTools。
- Template Source 保存的是 ComfyUI UI Workflow。Harness 必须调用目标 ComfyUI 版本自己的官方前端 loadGraphData() 和 graphToPrompt()，才能得到具有当前自定义节点序列化语义的 Official API Workflow。
- Harness Host 因此在本机启动 headless Chrome，通过本机随机 loopback DevTools port 控制一个页面 target，再让该页面导航到远端 ComfyUI URL。错误文案中的远端 URL 是页面导航目标，不是 Chrome DevTools 服务地址。
- Official API Workflow Cache 命中时 Host 不启动 Chrome。

## 60000 毫秒的来源

- 当前 DSH Desktop 安装的 @deepseek-ai/dsh-base@0.1.2-alpha.1 在 node_modules/@deepseek-ai/dsh-base/cordis.patch.yml 的 bash-sandbox 配置中写入 timeoutMs: 60000。
- 该值是普通前台 Bash Tool Call 的默认执行预算。@deepseek-ai/dsh-bash-local 允许单次 Tool Call 通过 timeoutMs 覆盖该默认值，并把覆盖值限制在 maxTimeoutMs: 600000 以内。
- DSH Desktop 提交 16893cb5949e585ff98c62c044270513ecb3c24c 于 2026-08-29 vendored Harness 0.1.2-alpha.1。Harness ComfyUI 提交 91ab4bb8a7655a4b14fc6176cd1b5e8fbb5ecdef 于 2026-08-30 开始集成该 Desktop。
- Harness ComfyUI 没有新增 60000 毫秒常量。旧 comfyui-generate 没有为 generation submit 的 Bash Tool Call传入覆盖值，因此提交命令继承了 DSH base 的 60000 毫秒。
- Host 的 frontendCompiler.timeoutMs 是单次浏览器会话的 120000 毫秒总时限。外层 Bash 60000 毫秒小于 Host 同步准备的合法时限，所以 managed CLI 可以先被 SIGTERM，而 Host 仍在准备 Run。

## CLI 客户端断开缺陷

- 真实 HTTP 复现让客户端完整发送 Generation Request 后立即断开。旧 route 只监听 IncomingMessage.aborted，传给 GenerationRuntime.acceptGeneration() 的 AbortSignal 仍然是 false。
- managed CLI 被 Bash executor 终止后，Host waiter 因此继续运行。用户看到“命令在 60 秒内未返回”不能证明 Host 没有创建或继续准备 Run。
- 修复后的 route 监听请求体 aborted 和 ServerResponse 在 writableEnded=false 时发生的 close。断开只中止当前 waiter；正常完整响应保持 signal 未中止。

## CDP 生命周期缺陷

- 旧 WebSocketCdpSession 在 WebSocket 已连接后不处理 close/error。确定性复现发送 pending Page.navigate 后触发 close，Promise 在观察窗口内仍然 pending。
- 修复后的 session 为每项 pending command 保存 CDP method。连接后的 close/error 会立即拒绝全部 pending command；关闭后的 send() 立即拒绝；同步 socket.send() 失败会删除对应 pending 项。
- ChromeComfyFrontend 现在分别记录 browser-start、devtools-port、target-create、cdp-connect、domain-enable、navigation、readiness 和 export 阶段，监听 Inspector.targetCrashed，并捕获有界且脱敏的 Chrome stderr。

## 实际 Desktop 根因验证

- 阶段化错误实现后，真实开发 Harness Run run_d738a7e3-7bfa-4460-96b7-f9c13dfba2a4、run_dee41f3f-6711-4379-a288-2b231d561c4e 和 run_2ca46ebc-5431-4b79-92d5-d914e78f8760 都在 Electron Helper Host 的 navigation 阶段失败。
- 三个 Run 的具体错误都是 Page.navigate 超过 10000 毫秒。Chrome target 已经创建、WebSocket 已经连接、CDP domain 已经启用，浏览器主进程没有提前退出。
- 相同实例、模板、Chrome 和 ChromeComfyFrontend 在标准 Node.js v24.9.0 子进程中成功执行，导出结果包含 15 个 API Workflow 对象。
- 只由标准 Node.js 启动 Chrome、但继续让 Electron Helper 执行 CDP compiler 不能修复 Page.navigate。把完整 ChromeComfyFrontend 移入标准 Node.js 子进程后导航和导出都成功。
- 当前产品缺陷的可重复根因是：Desktop Host 的 Electron Helper Node.js 兼容运行时执行完整官方前端 CDP 编译器时，Page.navigate 不结算；相同编译器在标准 Node.js Worker 中正常结算。
- 生产历史 Run 没有阶段化记录，所以不能声称生产 19:32 的旧 Run 已经事后证明是同一个 Page.navigate method；但同一产品路径、同一实例和同一模板在真实开发 Desktop 中已经稳定复现到该 method。

## 外部条件排除

- 完整 256 项前端扩展的真实会话约 8 秒进入 ready，模板 42 的 loadGraphData() 和 graphToPrompt() 成功导出 15 个对象。
- 四个完整扩展会话并发运行时全部成功导出，没有观察到 target crash、WebSocket close 或 pending command。
- 只返回 36 项 ComfyUI core 扩展时，模板 42 仍成功导出 15 个对象；core-only 与 full 结果逐字段相同。
- 当前证据排除模板 42 当前损坏、实例 2 当前不可达、第三方扩展当前必现故障、四会话并发当前必现故障和 Chrome 主进程当前必现 crash。

## 修复实现

- NodeWorkerComfyFrontend 在标准 Node.js 子进程中运行打包后的 comfy-frontend-worker.js。请求使用版本化 stdin JSON；诊断和结果使用逐行 stdout JSON；authorization 不进入命令行。
- Worker 保留 GenerationRuntimeError 的错误码和用户文案，限制 stderr 字节数。Host 在独立进程组中启动每个 Worker；协作取消超时后，Host 只强制终止该进程组内的 Worker 和 Chrome 后代。Worker stdin 的异步写入错误会返回 `COMFYUI_FRONTEND_WORKER_FAILED`。
- ChromeComfyFrontend 在第一次 pre-readiness 基础设施失败后使用全新临时 profile 重试一次。readiness、loadGraphData()、graphToPrompt()、cache 写入和调用者取消不重试。
- 未配置实例认证时，编译浏览器不启用 CDP Fetch 拦截。配置认证时，编译浏览器只向同源请求注入 Authorization，并从跨源请求中删除 Authorization。
- 编译浏览器直接 spawn 配置中的 Chrome，不通过 macOS LaunchServices。命令包含 --use-mock-keychain 与 --disable-features=DialMediaRouteProvider，符合 Chromium 官方避免 macOS 钥匙串和网络权限对话的测试启动方式。
- DSH 普通 Bash Tool Call 的 60000 毫秒默认值和 `comfyui-generate` Skill 均未修改。标准 Node.js Worker 修复了导致同步编译不结束的运行时问题。

## 钥匙串对话事故

- 诊断过程中曾错误地通过 macOS LaunchServices 向现有用户 Chrome 发送启动请求。该请求发生后，本机开始多次显示“找不到用于储存 Chrome 的钥匙串”对话；现有证据只能确认这一时间顺序，不能确认每个对话的具体触发源。
- 开发 Desktop PID 32064 已停止，当时 `pnpm dev:status` 返回 stopped，临时 `harness-comfyui-frontend-*` Chrome 进程为零。开发进程停止后对话仍曾出现，但现有证据不能确定每个后续对话的具体触发源。
- 用户已经手动点击“取消”。后续产品验收不使用 LaunchServices，也不终止现有用户 Chrome。

## 成功门禁

- 新开发 Run 必须使用生产 Run 保存的同一项 Generation Request。
- 新开发 Run 必须进入 succeeded。
- 相同 Workspace 的 generation resolve-media --stdin 必须返回至少一项 lookup_status=available 的本机媒体文件。
- 每个返回的 file_path 必须是普通文件、可读并且字节数大于零。
- failed、submission_unknown、run_id、cache 文件、prompt_id 或精确错误码都不构成修复成功。

## 真实生成结果

- 用户授权启动带隔离参数的编译浏览器后，真实 Harness Session `session-01a50981-2a78-4cc1-b8ce-ab843571cd3b` 提交了模板 42、实例 2 的生产复现请求。
- 新 Run `run_3a877877-d96d-4815-bbcc-299c6a569b7f` 的 `request_json` 与源 Run `run_fa49f44c-bfd9-488f-9fe7-66e4b715694d` 的 `request_json` 字节完全相同。
- 新 Run 进入 `succeeded`；同一 Harness Session 的 `generation resolve-media --stdin` 返回 `media_1998438a-b2c5-4ec1-ad86-a09a6554181b`。返回路径是可读且非空的 1024×1536 RGB PNG，文件大小为 2758646 字节。
- 该端到端结果同时满足 Run 成功和本地媒体文件验收，证明标准 Node.js Worker 修复方案可行。
