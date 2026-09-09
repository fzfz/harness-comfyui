# v0.42.1 受管开发配置发布进度

- 2026-09-09：受管配置实现、针对性测试、完整 `pnpm quality` 与 `git diff --check` 已通过。
- 2026-09-09：主 checkout 私密来源预检通过；可跟踪配置未包含私密值，私密文件由 Git 忽略并以 0600 权限保存。
- 2026-09-09：用户授权创建 Pull Request、合入 main、同步本地 main、发布版本并部署生产目录。
- 当前阶段：建立发布分支并准备独立发布 worktree。

---

# anywhere Desktop 基线实施与验收记录

## 实施位置与版本

实施 worktree 为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-anywhere-baseline`，分支为 `codex/anywhere-desktop-baseline`，起点为 main 提交 `020c1b8a217bda9537ee7e087f9f2a54d64624c0`。完整计划保存在同目录 `task_plan.md`。本次保留插件版本 0.41.1，保留 Harness 插件的依赖锁定版本；Desktop 的 pi-ai 和 pi-telemetry 按获准计划更新到 0.84.4。

起始候选来源为 anywhere-labs/dsh-desktop，固定提交为 `b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d`，Stable Desktop 为 2.0.6，Harness 为 0.1.2-rc.1，Electron 为 43.3.0。

## 已完成的实现

- `config/desktop-baseline.json` 保存唯一 Desktop 来源与版本配置；开发、生产准备和测试读取同一份配置。
- 独立 worktree 的 node_modules 复用 main 已安装业务依赖与工具，宿主依赖来自候选 Stable workspace。准备过程没有执行 worktree pnpm install。
- profiles/desktop/package.json 在 dependencies["harness-comfyui"] 中声明插件 link 来源，在 dsh.profile.bundles 中注册插件；候选内置 pnpm 完成首次物化，后续启动复用兼容元数据。
- dev 与 prod 脚本使用统一生命周期模块。就绪判断检查当前启动 run 的 Renderer 健康完成、受管插件和进程组所属 Host 端口。
- Electron 中的目录与 Workflow CLI 仅在脚本子进程环境设置 ELECTRON_RUN_AS_NODE。
- 开发规范、启动与配置说明、当前架构说明及门禁测试已改为候选基线。

## 修复过程中的确定问题

依赖视图最初链接了依赖主 checkout 相对目录的 tsc 包装脚本，现已改为 manifest 中的实际入口。UI 测试最初重复加载 React，现由 Vitest 统一解析。开发依赖视图已补齐 dsh、dsh-base 和 dsh-web-app。

Sharp 不导出 package.json 的问题已改用实际入口定位包目录。首次设置记录最初写入错误目录，启动器在 60 秒后报告失败并停止实例；修正为候选要求的 profile-setup 后启动成功。

运行时执行队员根据独立 Reviewer 的问题报告修改 scripts/desktop/anywhere.mjs，补齐进程组成员身份验证、整组退出等待，以及首领 exit 与日志管道 close 的分离。测试执行队员在 tests/production/desktop-worktree.test.mjs 验证停止时不会向无法确认属于当前 worktree 的进程组发送信号。

## 真实开发实例验收

首次成功实例的 PID/PGID 为 57292，Host 为 127.0.0.1:54437，startup run 为 `e5aa4ab1-bef6-4567-a918-5f725ec821b9`。重复启动实例的 PID/PGID 为 20632，Host 为 127.0.0.1:54437，startup run 为 `b338932b-013e-4700-aea9-216762799dd9`。两个实例均通过 dev:status 返回 ready。

停止前已核对各自 PID 文件、组首领、当前 worktree 的 desktop-out 启动路径，以及组内全部监听端口。dev:logs 已检查，dev:stop 均成功，前台 dev:start 均返回退出码 0。移动桥接端口没有参与就绪判断。

## 真实窗口内的插件验收

真实窗口已加载 ComfyUI 工作台与项目预设，验证了 Preset 范围内的 Skills，并通过候选 Harness 的 Bash Tool Call 执行受管 CLI。Catalog Remote 通过真实 Electron 子进程访问本机固定 Source，返回 id 为 123 的目录记录；ImageReader Remote 返回非空模型分组。该测试没有访问生产目录或执行付费生成。

媒体结果列、查看器、前后媒体切换、完整 Run ID 复制、普通宽度与窄屏几何断言均通过。测试启动入口现已在加载候选 Desktop 前，为 Electron Session 注册 will-download 处理器，并通过 setSavePath 指定临时保存路径。两次原文件下载均取得 completed 事件，接收字节数和落盘文件字节均与测试 GIF 一致，下载验收通过。

## 原始候选的产品功能失败记录

| 验收对象 | 实际结果 |
| --- | --- |
| Session 删除 | 候选未提供删除 Remote；目标 Session 仍可读取，其他 Session 可读取。 |
| pi-ai 请求身份 | 普通 Session、原生派生子 Session、图片读取三类真实本机 HTTP 请求均缺少 x-deepseek-harness-session-id。官方 DeepSeek 适配器的三类请求均携带各自真实 Session ID 请求头。 |
| 模型目录 | 候选缺少既有门禁要求的 Qwen3.8 Flash、GLM5.3 Flash、Hy4 preview 和 Grok4.6，仍含 Ox Alpha Free。 |
| Provider 推理配置 | 候选界面缺少既有门禁使用的推理等级输入控件。 |

## 原始候选的完整质量门禁结果

原始候选 pnpm quality 的依赖公告、manifest/lock、构建脚本审计、类型与 Harness 边界检查均通过。测试结果为 coverage 1038 项通过、contract 55 项通过、production 260 项通过、prototype 32 项通过。Desktop 共 4 项测试，受管 Bash 与 DeepSeek 请求身份两项通过；真实窗口内的会话删除和模型配置验收、pi-ai 请求身份验收两项失败；quality 返回退出码 1。

`.local/quality-final.log` 保存完整命令输出，`.local/desktop-remote-verification.log` 保存目录 Remote 与后续媒体操作验证输出。

## 独立审查与文件检查

独立 Reviewer 已完成运行时、依赖边界与功能验收测试复核，最后的进程组清理问题已修复。三份根目录文档的语义审查问题已逐项修改。git diff --check 检查通过。

## 第一轮验收的停止状态

第一轮验收时，产品功能未通过，实现保留在独立分支，未进行提交、推送、合并或部署。本次普通开发实例已停止，用户此前保留的研究实例未被停止。

## 原生保存窗口的处理结果

用户要求继续验收且不再弹窗后，主 Agent 在 tests/support/electron-downloads.cjs 实现原生保存路径设置，并仅通过真实窗口测试的 spawnDesktop 注入临时启动入口。新回归测试验证默认 Session、附加 Session 和重复注册处理；独立 Reviewer 已通过限定复核。完整 quality 已重新执行完毕，下载断言通过。操作系统进程检查确认本次 worktree 没有残留 Desktop 进程，dev:status 返回 stopped。

## 用户要求补齐宿主能力后的执行状态

用户已要求补齐全部缺失能力，并先审阅上游 PR 草稿。主 Agent 已创建上游独立 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/upstreams/dsh-desktop-anywhere-features`，分支为 `codex/restore-session-model-features`，基于 b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d。该目录拥有隔离复制的 Stable 依赖，旧 candidate 与研究实例保持原状。此阶段 Harness 的 desktop-baseline.json 选择 features 目录。

会话删除执行队员负责六个宿主包的 Yarn 补丁；模型执行队员负责 pi-ai 请求头与模型、推理配置补丁。主 Agent 统一维护上游 resolutions、yarn.lock、插件验收与本地 PR 草稿。此阶段只准备本地 PR 草稿；用户随后授权在自有 fork 创建并合并 PR。

## 自有 fork 的安装验证

已创建 fzfz/dsh-desktop-anywhere，main 固定到 Stable 起点 b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d。独立 clone 使用 Yarn 不可变锁文件、关闭构建脚本和网络完成全 workspace 依赖物化。首次复用安装状态时发生 Electron framework 链接复制与缺失 Vite 目录错误；删除本次 clone 的依赖副本并重新从已有 Yarn 缓存安装后成功。现有 Electron 二进制仅恢复到该 clone 的 Stable 目录。



## 自有 fork 的完整检查与开发启动验收

Desktop 自有 clone 的 `corepack yarn check` 返回 0：Market 263 项、Stable 1274 项、Beta 1297 项通过；Stable 跳过 8 项平台限定测试，Beta 跳过 7 项平台限定测试。构建、全部类型检查、布局、依赖闭包、CLI、Loader、Profile 和操作可靠性检查通过。原测试的代理环境隔离、假进程组信号、NSIS 反向应用筛选和 CLI smoke 工作目录问题已修复并通过独立审查。

Harness 的 `pnpm quality:fast` 在自有 fork 上通过：1038 项 unit/integration/Skills、55 项 contract/security、260 项 production 和 32 项 prototype。覆盖率 statements 93.63%、branches 87.02%、functions 100%、lines 96.19%。这不是最后一轮完整质量结果；最后的会话补丁和 PR 合并 SHA 固定后仍需重跑。

自有 Desktop 已通过前台 `pnpm dev:start`，进程组首领 PID 49723 的入口为本 worktree 的 desktop-out，操作系统枚举监听端口仅 54437。`dev:status` 返回 ready，runId 26732efc-85ee-4395-bb1d-62f62f1c0696；执行 `dev:logs` 后通过 `dev:stop` 停止，最终 `dev:status` 为 stopped。

模型补丁经独立复核后复制到自有 clone，由 Yarn 不可变安装正式物化；实际请求与 React 组件专测 2 文件、12 项通过。

## 最终宿主补丁与 PR

八份 Stable 补丁已通过独立复核，并由自有 clone 的 Yarn 不可变安装实际应用。新增宿主测试共 28 项通过。完整 `corepack yarn check` 返回 0：Market 263 项、Stable 1302 项、Beta 1297 项通过；Stable 跳过 8 项平台限定测试，Beta 跳过 7 项平台限定测试。

最终真实 Desktop 验收 3 个文件、4 项测试全部通过，包括会话删除、真实 Session ID 请求头、模型目录、自定义 Provider 推理等级、项目 Skills 与受管 CLI，以及无原生保存弹窗的媒体下载。

自有 fork 已创建 [PR #1](https://github.com/fzfz/dsh-desktop-anywhere/pull/1)，分支提交为 dfe220f349。创建前再次核对上游 master 仍为 90217cdaee9d5c47062a7ae4a2133b8bf5a5af54，当日更新的 PR #891、#888、#886 均未新增本次三类实现。

## 最终补丁的完整插件门禁与启动结果

PR 分支提交 dfe220f349 的完整 `pnpm quality` 返回 0：1038 项 unit/integration/Skills、55 项 contract/security、260 项 production、32 项 prototype、4 项真实 Desktop 测试，共 1389 项通过。依赖审计及类型检查通过，覆盖率 statements 93.63%、branches 87.02%、functions 100%、lines 96.19%。完整输出位于 .local/quality-owned-final.log。

最终补丁的前台开发实例 PID/PGID 为 79748，唯一监听端口为 54437，startup run 为 b25ff919-43b6-4a77-843e-9089090b8728。开发者核对入口为当前 worktree 的 desktop-out 后执行 status、logs 和 stop；status 先返回 ready，停止后返回 stopped，前台 start 返回 0。

## 自有 main 合并与基线固定

PR #1 的七项 GitHub CI 全部通过，2026-09-09 已合入 fzfz/dsh-desktop-anywhere 的 main，合并提交为 26c6b6c3117d11787e679456c387d823923035f9。本地 owned clone 的 HEAD 与 origin/main 均为该提交，合并树与已验收 PR 分支没有文件差异。config/desktop-baseline.json 已固定该仓库 URL、提交和 owned clone 路径。

## 最终验收与本地交付

合并后的第一次复验在自定义 Provider 测试中出现间歇超时。测试在 Max 标签更新后立即开始下一轮操作，可能在上一轮菜单尚未关闭时再次点击触发器，导致关闭旧菜单后等待新菜单超时。测试现已等待上一轮菜单关闭，并在超时错误中输出具体等待条件；独立 Reviewer 确认等待符合实际选择提交时序，原有断言全部保留。

固定 main 提交 26c6b6c3117d11787e679456c387d823923035f9 后，完整 pnpm quality 返回 0，1389 项测试全部通过。记录保存在 .local/quality-merged-baseline-fixed.log。本次开发及自动化测试实例均已清理。Harness 适配在 codex/anywhere-desktop-baseline 独立分支交付。

## v0.42.0 发布准备

用户已授权 Harness PR、合并、同步 main、发布与生产部署。发布候选将版本更新为 0.42.0。独立 Spec 审查未发现阻断问题；Standards 审查发现主 checkout 的依赖命令执行目录描述错误，启动文档已将 desktop:dependencies:link 限定为独立 worktree 并列出主 checkout 的锁文件安装命令。生产 checkout 当前停止，仍位于 v0.41.1 提交；部署前保留生产配置与全部运行数据。
