# v0.42.1 受管开发配置发布与部署计划

## 必须要实现的目标

计划执行者把当前受管开发配置候选整理到 `codex/managed-dev-settings-v0.42.1` 分支，创建并合入 Pull Request；随后把 `origin/main` 同步到本地 `main`，从合并后的提交发布 v0.42.1，并把同一发布提交部署到生产目录 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`。开发 worktree 的 `dev:start` 从仓库物化可跟踪的 Provider 与识图配置，并仅从主 checkout 的 Git 忽略私密来源物化声明的凭据。

## 验收清单

- 独立审阅者完成 Standards、Spec 和 Markdown 语义审阅，所有问题均已处理。
- 独立发布 worktree 的最终候选通过 `pnpm quality` 和 `git diff --check`，通过后不再修改文件。
- Pull Request 已合入，且本地 `main`、`origin/main` 与合并提交 SHA 一致。
- `package.json`、`v0.42.1` 标签和 GitHub Release 指向同一个 `origin/main` 提交。
- 生产目录保留 Git 忽略配置和运行状态，更新到发布提交后通过生产状态、进程组、监听端口、版本和日志检查。
- 不读取、重启、停止或修改用户正在测试的独立 dev worktree。

## 非本次目标

- 不改变生产凭据内容、Provider 账户选择或识图模型参数。
- 不安装或升级依赖，不修改上游 Desktop 安装目录。
- 不操作用户当前测试中的独立 dev Desktop 生命周期。

## 已获得的授权

用户已明确授权创建 Pull Request、合入 `main`、同步 `origin/main` 到本地 `main`、发布版本并部署生产目录。此前用户已要求修改 `dev:start`，使非凭据配置来自仓库、凭据来自主 checkout 的 Git 忽略私密来源。

## 执行阶段

1. **进行中**：建立发布分支并固化当前候选。
2. **待执行**：在独立发布 worktree 更新 v0.42.1 元数据，完成独立审阅和最终质量门禁。
3. **待执行**：推送分支、创建并合入 Pull Request，同步本地 `main`。
4. **待执行**：创建 v0.42.1 标签与 GitHub Release。
5. **待执行**：验证并停止既有生产进程，更新生产目录，启动并完成发布后验证。

---

# 自有 Desktop fork 基线切换实施计划

## 必须要实现的目标

计划执行者在新的独立 worktree 中，把源自 anywhere-labs/dsh-desktop 的自有 fork fzfz/dsh-desktop-anywhere Stable 设为当前插件的唯一 Desktop 基线，统一开发、生产准备、依赖解析、启动就绪判断和真实 Desktop 测试。计划执行者以主开发 checkout 的 main 提交 020c1b8a217bda9537ee7e087f9f2a54d64624c0 为起点，保留其他 worktree、主 checkout 未提交内容及正在供用户使用的旧测试实例。

## 已获得的授权

用户已授权先设计完整计划，再另建独立 worktree 实施和验收。授权包含本地代码、配置、开发规范与测试修改，以及已获准安装的候选 Desktop 的本地执行。起始候选固定为 b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d，Stable workspace 为 dsh-plugin-desktop 2.0.6、Harness 0.1.2-rc.1、Electron 43.3.0。计划执行者不再请求同一实施授权。

## 非本次目标

本次不发布 Harness 版本、不部署生产 checkout，不迁移生产用户数据，不修改 Skills 内容，不启用 Beta/advanced/extended，不新增移动桥接服务，不执行付费模型或图片生成。Desktop fork 的推送、PR 和 main 合并属于 P9 已授权范围；依赖版本仅允许 P8 列明的两项变化。生产启动脚本的修改通过临时目录与独立 worktree 验证，不启动真实生产环境。

## 依赖与状态对象定义

候选 Desktop workspace 指已安装的 dsh-plugin-desktop 目录。候选宿主依赖指通过该目录的 package.json 创建 Node createRequire 后实际解析到的插件 peerDependencies 包。业务依赖和构建工具指当前 main 已安装的 root package.json dependencies/devDependencies，例如 sharp、TypeScript 和 Vitest。隔离依赖视图指新 worktree 自有 node_modules：业务依赖和构建工具链接到 main 已安装目录，宿主 peer 链接到候选 workspace 解析目录，且不修改链接目标。

旧 fork 指 main 起点提交此前使用的 Desktop 源码，位于主 checkout 的 `.local/upstreams/dsh-desktop`。本计划的产品行为要求指 P4 列明的会话删除与 Session ID 请求头验收条件。

端口声明指 scripts/development/port.mjs 在主 checkout 的 .local/development-port-claims/ 中为本次独立实例写入的占用声明文件；它不是旧 Desktop 的移动桥接状态文件。

## 实施步骤与产物

### P1：固定配置与环境准备

计划执行者新增 config/desktop-baseline.json，以结构化配置保存仓库、commit、Stable workspace、预期包版本、默认模式及运行入口。scripts/desktop/baseline.mjs 负责读取和验证实际源码来源、commit与安装包版本。开发、生产和测试读取同一配置。保留环境专属 HOME、DSH_HOME、端口和 Workspace 配置；不把机器路径写入版本身份。计划执行者创建新的 codex/anywhere-desktop-baseline 分支和独立 worktree。

### P2：安装及宿主依赖解析

计划执行者把插件构建、打包与 Profile 安装从旧 generation installer 中拆出，使用候选 Desktop 的 Profile bundle 机制。Profile 的 profiles/desktop/package.json 必须在 dependencies["harness-comfyui"] 中声明插件 link 来源，并在 dsh.profile.bundles 中注册 harness-comfyui；profiles/desktop/node_modules/harness-comfyui 必须实际指向该受管安装目录。插件 dependencies 与构建工具必须从主 checkout 已安装目录解析，宿主 peerDependencies 必须从候选 Stable workspace 解析；准备模块核对各自 package.json 声明的版本。开发实例与测试实例使用的宿主 peerDependencies 必须从同一 Stable workspace 解析；不能修改其他任务正在使用的主 checkout node_modules。独立 worktree 可由 dev:start 准备隔离依赖视图，复用主 checkout 已安装的工具和候选宿主依赖，不执行 worktree pnpm install。

### P3：统一生命周期与就绪判断

计划执行者使 dev:* 与 prod:* 使用统一的 anywhere 生命周期模块，并删除旧 generation installer、pnpm dev/preview 参数和移动桥接状态假设。start 必须验证当前实例的 Host 监听端口、当前启动 run 的 startup.run.completed 与 rendererStatus=healthy，并验证本次插件安装记录。仅进程存在或端口监听不能判为 ready。status 应区分启动中、就绪和失败；logs 汇总当前实例启动与 Host 日志并脱敏；stop/restart 必须核对 PID、进程组和当前实例启动路径，启动模块在启动等待超过配置期限时必须发送 SIGTERM，等待退出不超过配置 stopTimeoutMs，必要时发送 SIGKILL；启动等待结束后，启动模块必须释放本次端口声明；若受管 Electron 进程组在清理后仍存活，启动模块必须保留 PID 文件并返回明确失败结果。调试端口只供显式测试启用，生产不启用。首次设置仅初始化新实例，不覆盖已保存用户设置；避免静态引用候选 src 内部模块。

### P4：保留插件业务运行合同

计划执行者移植目录查询 runCatalogCliProcess 和 Workflow 读取 runSourceCliProcess 的 Electron 子进程环境修正：运行 .mjs 时仅在子进程环境设置 ELECTRON_RUN_AS_NODE=1。保留项目 Preset、Repository Skills、默认 Workspace、模型设置、受管 CLI、图片读取与生成媒体接口。旧 fork 的会话删除与会话 ID 请求头能力分别通过候选运行结果评估；会话删除应使目标Session不可再读取且不删除其他Session；普通与子会话模型请求、图片读取应传递各自真实Session ID。若候选缺少本段列明的会话删除或 Session ID 请求头行为，验收记录为未通过，不以源码包路径替代功能结果。移动访问不作为 Desktop 启动门禁。

### P5：更新开发规范与门禁

计划执行者更新 AGENTS.md、docs/agents/worktree-development.md、docs/system/startup.md、configuration.md、architecture.md、directory-structure.md、technology-stack.md、testing.md、releasing.md 的当前规范章节。历史发布记录保留原事实。规范必须说明新 Profile 安装、依赖单一来源、当前启动 run 健康报告与独立端口归属。计划执行者更新 tests/support/desktop-context.mjs、tests/contract/engineering-baseline.test.ts、tests/production 和 tests/desktop，使测试实际启动候选 Electron 并加载当前 worktree 产物。不得把旧测试整体跳过后声称门禁通过。

### P6：测试与独立审查

计划执行者验证基线不符拒绝、干净安装、重复安装、受管插件产物更新、业务依赖或宿主 peerDependencies 缺失、两个实例隔离、端口冲突、启动超时、Renderer 失败、陈旧健康事件、PID 对应进程与记录的启动时间或启动路径不符时拒绝操作、停止和重启。真实 Desktop 验证当前 worktree 插件 Client、默认 Workspace/预设、图片模型与目录 Remote、项目 Skills 和受管 CLI；网络模型生成不属于本轮验收。独立 Reviewer 审查运行时边界和安装/生命周期代码；独立语义 Reviewer 仅依据目标文档与语义规范审查新文档。计划执行者修复确定的问题后重跑受影响测试。

### P7：最终验收与交付

计划执行者在新 worktree 执行 pnpm quality、git diff --check、dev:start/status/logs/stop。只有完整门禁成功才记录全部通过；若锁定依赖公告使 quality 失败，则保留失败结果、单独执行其余门禁，不升级依赖也不把它标为通过。交付完整变更与验收记录，并停止本次新实例；不停止用户先前要求保留的研究实例。

## 验收清单

- [x] 新独立 worktree 从 main 提交 020c1b8a217bda9537ee7e087f9f2a54d64624c0 创建，并保存本计划、findings.md、progress.md。
- [x] Desktop 来源、commit、版本和 workspace 只有一份可执行配置来源。
- [x] 安装记录与实际加载插件一致，重复启动与更新后保持一致。
- [x] 类型检查、插件运行及真实 Desktop 测试使用候选宿主依赖。
- [x] 新生命周期不依赖 mobileBridgePort、旧 generation API 或旧 preview/dev 命令。
- [x] 就绪门禁验证本次启动的 Renderer 健康完成，不接受旧 run 或仅端口监听。
- [x] 新实例与旧研究实例、主 checkout 和生产实例隔离。
- [x] Node/Electron CLI 分支回归通过，真实界面显示 ComfyUI 工作台；remote.agentPresets.list 返回项目预设；remote.harnessComfyuiImageReader.models 返回模型分组；remote.harnessComfyuiCatalog.baseModels 返回目录记录。
- [x] 新规范和代码通过规定的独立审查。
- [x] 完整质量门禁结果及已知限制准确记录；本次测试实例停止。

## 当前阶段与状态

P1—P6、P8、P9 已完成。PR #1 的七项 GitHub CI 全部通过，PR 已合入自有 fork 的 main；基线配置固定提交 26c6b6c3117d11787e679456c387d823923035f9。P7 已完成：固定后的基线通过完整 pnpm quality，1389 项测试成功；本次 Desktop 实例已停止。

## 错误记录的保存位置

计划执行者在同目录 progress.md 的“修复过程中的确定问题”和“原始候选的产品功能失败记录”记录本轮错误与处理结果。

## P8：补齐宿主能力并准备自有 fork PR

用户已明确授权实现会话删除、pi-ai 真实 Session ID 请求头、模型目录与推理配置。计划执行者在自有 fork 的独立分支 codex/restore-session-model-features 中完成宿主修改，保留候选源码与旧研究实例。计划执行者沿用上游已有 patches/ 和 Yarn resolutions 机制，补齐实际 Host/API/Client 行为与回归测试。

计划执行者通过 Yarn resolutions 和 yarn.lock 锁定八份 Stable 补丁，以及下节列明的 pi-ai 和 pi-telemetry 0.84.4。计划执行者通过不可变锁文件安装验证补丁可应用；不调整其他依赖版本。

验收要求：目标 Session 删除后不能读取，其他 Session 保留；普通、子会话和图片读取请求携带各自真实 ID；模型目录和推理等级配置满足现有测试；自动下载不弹原生窗口；完整插件质量门禁通过。计划执行者准备 PR 标题、正文、改动与测试结果，并按照 P9 在自己的 fork 创建和合并 PR。P8 已实现并通过独立复核、28 项宿主专测和 4 项真实 Desktop 验收。

## P8 的模型目录版本与审计

模型目录验收要求使用旧实例已有的 @earendil-works/pi-ai 0.84.4。计划执行者将 Stable 的 pi-ai 明确锁定到 0.84.4，并将其唯一变更的配套依赖 @earendil-works/pi-telemetry 锁定到 0.84.4；其余九个运行依赖名称和版本不变。2026-09-09 的 npm advisory bulk 查询对这两个精确版本返回空公告集合，结果保存在 .local/desktop-feature-dependency-audit.json。计划执行者复用本机旧实例已安装文件，不创建模型目录的手写补丁。

## P9：维护自己的 Desktop fork 并合入 main

用户已授权在自己的 fork 创建 PR、合并到自己的 main，并将合并提交作为插件基线。本项取代此前仅准备本地 PR 草稿、不推送的限制；对 anywhere-labs 上游仓库仍不创建 PR。

用户已有的 fzfz/dsh-desktop 属于 dataelement 旧项目。主 Agent 已新建 fzfz/dsh-desktop-anywhere，保留旧 fork。新 fork 的 main 从经过本轮验证的 Stable 起点 b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d 创建，并设为默认分支。主 Agent 将最终补丁复制到该 fork 的独立 checkout，运行专测、独立复核与完整插件门禁，然后创建 PR 并合入 main。插件 desktop-baseline.json 必须固定新 fork 的仓库 URL 和最终 main 完整提交 SHA。

## P10：发布 v0.42.0 并部署生产目录

### 必须要实现的目标

计划执行者更新版本与发布文档，在独立 worktree 完成发布审查和最终质量门禁，创建 Harness PR 并合入 main，将本地 main 更新到 origin/main 对应的发布提交，发布 v0.42.0，随后从该 tag 更新生产 checkout 并验收完整 Desktop。

### 验收清单

- 发布候选通过独立 Standards、Spec、文档语义审查、pnpm quality 与 git diff --check；门禁通过后不再修改文件，直接提交。
- PR 已合并，本地 main、origin/main、版本 tag 和生产 HEAD 指向同一发布提交。
- 主 checkout 原有未提交内容保存到具名 Git stash，生产 .env、旧用户目录、数据库及媒体文件保留。
- 生产 Desktop 的 Profile 插件版本、进程组、监听端口和当前 Renderer 健康记录通过验证，Client 显示 ComfyUI 工作台；remote.agentPresets.list 返回两个项目 Preset，remote.harnessComfyuiImageReader.models 返回配置中的模型分组，remote.harnessComfyuiCatalog.baseModels 返回数据源的基础模型记录。

### 非本次目标

本阶段不升级其他依赖，不发布安装包，不向 anywhere-labs 上游提交 PR。旧会话格式转换不包含在源码发布中，须在明确迁移对象并单独验证后执行。

### 已获得的授权

用户明确要求创建 PR、合入 main、同步 origin/main 到本地 main、发布版本并部署生产目录；此前已授权安装与运行当前 Desktop 基线。
