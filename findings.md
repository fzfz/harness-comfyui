# v0.42.1 受管开发配置发布事实记录

- 当前候选以 `c3011b51ae36df81a6c787ea8093be6b07a7151c`（v0.42.0、`origin/main`）为起点。
- Provider 与识图的非凭据配置已拆分为可跟踪配置；凭据只从主 checkout 的 `.local/desktop-development/home/Library/Application Support/dsh-desktop-dev/harness` 私密来源选择性物化。
- 当前候选的完整 `pnpm quality`、`git diff --check`、私密值泄漏检查和主 checkout 私密来源预检均已通过。
- 发布版本按补丁版本提升为 v0.42.1；本次没有依赖变更。
- 用户正在测试的独立 dev worktree 不属于后续发布动作的操作目标。

---

# 基线切换事实记录

## 已确认的候选行为

anywhere Stable 没有旧移动桥接启动要求。main.ts 等待 runtime.mountScheduled 与 Renderer 健康报告后写 startup.run.completed。普通 Web 端口监听不等于启动完成。

研究 worktree 的插件 Client、预设、图片模型与目录 Remote 已成功；目录脚本需要在 Electron 子进程设置 ELECTRON_RUN_AS_NODE=1。当前研究安装采用手工tgz解包与peer链接，不能替代正式安装生命周期。

## 本轮起点与隔离

主 checkout HEAD 为 020c1b8a217bda9537ee7e087f9f2a54d64624c0。主 checkout 存在其他任务的 task_plan.md、findings.md、progress.md 修改及未跟踪的 anywhere 原型文件，本轮保留这些内容。研究 worktree 仍位于旧 b3fc6f0 基线，不能整树覆盖新的 main。

## 当前 main 的插件版本与依赖

main 中的插件版本为 0.41.1，业务依赖包含 sharp 0.35.4，Vitest 版本为 4.1.11。本轮保留这些版本，业务依赖从 main 已安装目录复用，宿主 peerDependencies 从候选 Stable workspace 解析。

## 规范修改

旧启动规范依赖移动桥接、generation installer 与 dev/preview 命令。新启动规范要求开发者使用唯一基线配置和 Profile 插件声明，并检查当前启动 run 的 Renderer 健康完成事件。真实 Desktop 测试现已检查候选 Profile 与生命周期结果。

## 真实 Desktop 测试入口差异

tests/desktop/desktop-live.test.mjs 通过临时生产 context 测试真实 Electron；旧实现先在 legacyDshHome 保存测试会话，再依赖迁移、移动桥接监听与 profiles/.generations/live。新测试已改为直接在临时 dshHome 保存会话，并检查当前 Profile；会话删除、Skills、模型设置与媒体交互验收均保留。

## 原始候选宿主产品能力差异

候选 Stable 已安装的 dsh-llm-pi-ai/lib/index.js 调用 requestHeaders(profile.headers)，没有旧 fork 向 x-deepseek-harness-session-id 注入真实 Session ID 的补丁。候选 dsh-api-remotes/lib/index.js 未发现 session/delete 注册。真实功能门禁必须记录这些差异；不能把旧 fork 的补丁当作候选现有能力。

## 测试依赖解析修正

旧 UI 测试使用 createRequire 加载主 checkout 的 react-test-renderer，绕过 Vitest 并加载另一份 React。测试改用 vi.importActual，Vitest 对 React 和 renderer 启用依赖优化并 dedupe，保留候选 React 来源；pnpm test:coverage 覆盖的 tests/unit、tests/integration 和 tests/skills 共 53 个文件、1037 项测试通过。另补齐 config 声明的 dsh、dsh-base、dsh-web-app 开发包链接。配置依据 Vitest 4.1.6 官方 deps.optimizer 文档与当前 4.1.11 实测，不新增依赖。

## 原始候选运行测试的差异

真实 GUI 捕获的普通模型请求缺少 Session ID 请求头。独立请求测试进一步证明，opencode-go 所用 pi-ai 适配器在普通 Session、原生派生子 Session 与项目图片读取三类本地 HTTP 请求中均缺少该头；官方 DeepSeek 适配器的三类请求均携带各自真实 Session ID 请求头。候选 Desktop 未提供 Session 删除 Remote。模型目录仍含Ox Alpha Free与Grok 4.5，缺旧基线要求的Qwen3.8 Flash、GLM5.3 Flash、Hy4 preview和Grok4.6；候选Provider编辑器不提供旧推理等级输入控件。原始候选在当轮功能验收中未通过这些测试。

原生角色工具测试最初在 Vitest 动态导入时重复加载作用域模块。直接使用 Node 加载候选模块后，测试创建的另一工具作用域没有收到目标作用域的工具。测试改用候选 createRequire 加载同一组作用域模块后，32 项原生角色测试通过。

## 正式 Profile 的重复启动结果

首次安装由候选内置 pnpm 物化 Profile。第二次普通开发启动复用了 pnpm 11.8.0 的 hoisted 元数据与现有 link 声明；profile-composition 阶段耗时 17.829 ms。候选追加日志中没有时间戳的旧迁移行不能归属于最新启动。

## 当前 worktree 的目录接口结果

真实窗口通过 remote.harnessComfyuiCatalog.baseModels 调用插件 Host，Host 以 Electron Node 子进程运行目录 CLI，并从本机测试 Source 返回 id 为 123 的固定目录记录。remote.harnessComfyuiImageReader.models 同时返回非空模型分组。Typert 的响应外层包含 ok/value，外层 value 内的 Catalog Remote 业务响应对象包含独立的 ok 和 value 属性。测试没有查询生产目录或调用付费生成接口。

## 下载测试弹窗的已确认原因

用户截图中的 desktop-newer.gif 和 desktop-older.gif 是真实窗口测试使用的固定文件。测试点击“下载原文件”后，候选 Electron 弹出 macOS 原生保存窗口，等待用户选择保存位置。Browser.setDownloadBehavior 未使该下载自动完成；反复重跑真实窗口测试导致保存窗口重复出现。主 Agent 已停止重跑，且确认本次 worktree 的 Desktop 进程数为 0。

## 自动下载修复的验证结果

测试在导入候选 Desktop 入口之前，为 Electron 的 session-created 注册监听，并在 app ready 后补注册默认 Session。will-download 处理器使用 setSavePath 将文件写入本次临时下载目录。真实窗口测试的两个 GIF 均完成下载，完成事件、字节数和落盘内容断言均通过。生产启动入口与候选源码未修改。

## 自有 fork 的最终能力

自有 fork 为 fzfz/dsh-desktop-anywhere，parent 为 anywhere-labs/dsh-desktop。会话删除通过持久化待删除 Session ID、延迟移除事件和幂等关联记录清理处理失败重试。pi-ai 使用真实 Session ID 并过滤配置中的旧头；推理等级编辑保留原 Provider 映射。四个缺失模型来自 pi-ai 0.84.4 自带目录。全部功能已通过正式 Yarn 安装、28 项宿主专测和 4 项真实 Desktop 测试。
