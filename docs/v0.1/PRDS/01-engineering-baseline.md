# PRD 01：DeepSeek Harness 完整系统生命周期基线

## 关联 Ticket

Ticket 01 — 交付可安装、可启动、可检查和可回滚的 Harness 产品基线。

## 用户任务

开发者在 Ticket 01 自己的 Git worktree 安装冻结依赖、构建版本化包，并通过该包的产品管理 CLI 在同一 worktree 的 `runtime/production/` installation 安装和启动真实 `comfyui-workbench` Harness Host/Client。

## 产品结果

开发者完成上述任务后必须在浏览器看到真实Harness默认`AppFrame`，确认当前包的Client module已经加载，并通过`ctx.remote.pluginStatus.get()`读取当前包名、包版本、Configuration Profile和`hostLoaded: true`。Release Artifact必须同时包含用户可执行的`harness-comfyui`产品管理CLI。用户必须能够使用该CLI完成安装、配置预检、启动、停止、重启、进程状态检查、产品健康检查、日志读取、版本升级和失败回滚。运行时不得读取DeepSeek Harness源码checkout、`prototype/`或测试fixture。

## 规范来源

- DeepSeek Harness tag `dsh-v0.1.0-rc.8` committed tree `141eb6fef83422698aef7a981029e843e8161534` 的公开 package exports、类型定义、实现与测试，以及主工作树直接 Harness package 的 `0.1.0-rc.8` 真实安装路径。
- `docs/adr/0004-current-repository-owns-the-harness-bundle.md`。
- `docs/adr/0011-development-workspace-and-versioned-delivery.md`。
- `docs/adr/0012-harness-core-is-immutable.md`。
- Ticket 01 正文中已经锁定的目录、精确依赖、Client externals、profile 命令、配置覆盖顺序和 GitHub Actions workflow。

## Harness 核心零改动与公共插件接口

本Ticket只允许使用Ticket 01正文“已完成调研的Harness集成规范”表中直接列出的Harness public export与composition机制。本Ticket只允许通过`dsh.bundle.patch`增加当前项目Host plugin Loader row，通过`exports["./client"]`与`dsh.client` metadata加载当前项目Client plugin，通过`exports["./typert"]`与`exports["./remote"]`加载当前项目Remote contribution。

计划执行者不得修改 DeepSeek Harness checkout 或 installation 中的 `node_modules/@deepseek-ai`，不得使用 `patch-package`、`pnpm.patchedDependencies`、本地 fork、模块 alias、Loader hook、源码复制、`@deepseek-ai/*/src/*` import或 DOM monkey patch。当前项目的 `cordis.patch.yml` 只能使用 Harness 的 package composition 机制增加当前项目 Loader row，不能修改 Harness package 文件或既有 JavaScript/TypeScript 实现。

`package.json`必须增加`check:harness-boundary`。该命令只检查package manifest、lockfile、Cordis YAML与TypeScript import specifier，必须拒绝Harness checkout路径、`@deepseek-ai/*/src/*` import、Harness package patch、fork、alias和Loader hook，并验证每个直接导入的Harness package使用精确peer/dev dependency。该命令不得读取Issue、PRD或Markdown作为程序输入，也不得用程序判断运行时代码语义。独立代码审核者必须检查项目TypeScript/TSX源码没有注册自定义forwarded event，也没有查询、移动或monkey patch Harness DOM；tarball-only composition与E2E必须证明项目只通过已列出的public plugin composition挂载UI。

`package.json`中的`dsh.client.inject`只声明Client package加载依赖，不声明Cordis service生命周期依赖。Ticket 01必须让`src/client/index.tsx`同时导出`apply`和Cordis service `inject`，Ticket 01阶段的service列表固定为`["slots", "sessions", "remote"]`；Client runner必须在三项service都存在后调用`apply`。composition测试必须分别撤出`slots`、`sessions`与`remote` provider，证明项目Client plugin保持pending且不注册副作用，并在provider恢复后只激活一次。

当前已确认的项目源码direct imports与`package.json.dsh.client.inject`包依赖必须精确收敛为Ticket 01正文列出的Harness API package。Client UI相关集合固定包含`@deepseek-ai/dsh-client-connection`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-input-trigger`、`@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-primitives`和`@deepseek-ai/dsh-client-ui-slots`；项目在Ticket 01阶段只允许对`@deepseek-ai/dsh-client-ui-input-trigger/client`执行type-only import以获得公开`ctx.inputTriggers`类型，不得value-import或复制其MenuView。项目不得直接导入`@deepseek-ai/dsh-client-ui-sidebar`或`@deepseek-ai/dsh-client-ui-tool`。Ticket 01暂时保留rc.8默认`ui-layout`、AppFrame和ThemePresenter，仅用于证明Host、Client与Remote可加载；Ticket 02必须停用`ui-layout`，由项目root、公开`ILayout` service与项目ThemeSnapshot presenter接管最终桌面Shell，同时继续保留`ui-conversation`的标准projection、ConversationRoot及原生input overlay。Ticket 02只对input-trigger、layout与theme的公开Client类型执行type-only import，不value-import上游UI实现。

本次规划审计已经把Issues #2–#15各自使用的精确public interface直接写入对应Issue正文和PRD，当前没有发现public plugin seam阻塞。Issue执行者只负责实现所属Issue正文列出的接口，不负责继续调研Harness seam、选择Harness版本或设计替代接口。

### 项目 Tool 的唯一注册入口

Ticket 01必须创建`src/host/tools/register-project-tools.ts`并导出`registerProjectTools(ctx, definitions)`。本Ticket完成时`src/host/plugin.ts`是唯一调用该函数的文件；附加Ticket 15必须创建`src/agent/plugin.ts`并把唯一调用者迁入`harness-comfyui` Preset scope，同时删除Host root调用。`register-project-tools.ts`始终是产品代码中唯一允许直接调用Harness公开`ctx.tools.register()`的文件。后续Ticket必须使用`@deepseek-ai/dsh-tools`公开`defineTool()`构造完整`ToolDefinition`，再把定义数组交给`registerProjectTools()`；后续Ticket不得创建第二个Tool registry、修改Harness Tool runtime或直接写入Harness内部Tool表。

`registerProjectTools()`必须在调用Harness前验证每个定义具有非空且唯一的Tool名称、非空Tool description、闭合参数schema和闭合输出schema，并拒绝项目保留名冲突。函数按传入数组的稳定顺序调用`ctx.tools.register()`；任一注册失败时，函数必须按相反顺序调用本次已经取得的disposer并让Host plugin启动失败。Host plugin卸载时必须按相反顺序注销全部项目Tool。Harness同一layer的重复Tool名称错误必须原样成为启动失败，项目不得覆盖或忽略既有Tool。

Ticket 01只交付并测试注册基础设施，不提前注册业务Tool。Ticket 03通过该入口注册首批Catalog Tool；Ticket 04通过同一入口注册`generate_with_comfyui`；Ticket 05通过同一入口补齐十个Catalog Tool。`check:harness-boundary`必须确定性扫描`src/**/*.ts`和`src/**/*.tsx`中的直接调用表达式，并拒绝`register-project-tools.ts`以外的`ctx.tools.register()`调用；该检查只判断语法结构，不判断Tool description或业务语义。

## 功能要求

1. `pnpm install --frozen-lockfile` 只能使用 `package.json`、`pnpm-lock.yaml` 与 `pnpm-workspace.yaml` 声明的精确依赖和已审核 lifecycle script allowlist。
2. `scripts/profile/materialize.mjs` 必须是产品 CLI 安装某个版本时物化 `comfyui-workbench` Harness profile 的唯一底层实现。该脚本必须接收 `--configuration`、`--dsh-home`、`--package-spec`、`--dsh-executable` 和 `--pnpm-executable`，通过子进程环境设置 DSH_HOME，并执行传入的绝对 DSH executable；开发 worktree、composition、e2e、release-smoke 和 tarball install 都只能由产品 CLI 调用它。
3. `scripts/profile/start.mjs` 必须是产品 CLI 启动某个已安装版本时运行 Harness Host/Client 的唯一底层实现。该脚本必须接收 installation-local `--dsh-executable`、`--dsh-home`、host、port 和产品 CLI 生成的 Host 环境；`deploy:start` 必须通过 `scripts/deploy/cli.mjs` 调用它，退出信号必须停止同一子进程并释放端口。
4. `pnpm quality` 必须按 Harness public boundary门禁、依赖安全门禁、类型检查、源码测试、单次 build、单次 pack、包校验、deploy lifecycle、composition、e2e、release-smoke 的固定顺序执行。deploy lifecycle、composition、e2e 和 release-smoke 必须从同一 artifact manifest 指向的 tarball 运行 `bin.harness-comfyui`，不得重新 build、pack 或绕过产品 CLI。
5. development、test、release-smoke 和 production 四个 Configuration Profile 必须使用 `config/schema.ts` 的同一结构与 `config/base.json` → `config/profiles/<name>.json` → `config/environment-overrides.json` 的覆盖顺序。schema 必须分别定义 ComfyUI Jobs API 观察的 `jobs.pollIntervalMs` 与浏览器 Run projection 查询的 `client.runRefreshIntervalMs`；四个 Profile 的 `client.runRefreshIntervalMs` 固定为 `1000`，除非 installation JSON 显式覆盖。
6. `PluginStatus` 是工程基线加载证明，不是运行健康或 ComfyUI 健康的替代状态。响应不得包含路径、环境变量或凭据。
7. Ticket 02–13 必须复用本 Ticket 生成的 bundle composition、配置 loader、产品管理 CLI、构建脚本、包脚本和 CI；这些 Ticket 必须在各自 Git worktree 中使用同一 `production` Configuration Profile 和同一 `deploy:*` 命令，不得创建 development 专用的安装、启动、进程管理、健康检查、日志或构建入口。Ticket 14 只读取 Ticket 13 的 Release Preview、artifact identity 和验收证据，不创建 installation 或调用 lifecycle 子命令。

## 产品安装与运行管理程序

### Release Artifact 内的唯一 CLI

`package.json` 必须声明 `bin.harness-comfyui: "scripts/deploy/cli.mjs"`。`package.json.files` 与包内容 allowlist 必须包含 `skills/**`、`scripts/deploy/*.mjs`、`scripts/profile/materialize.mjs`、`scripts/profile/start.mjs`、`profiles/comfyui-workbench/package.json`、`profiles/comfyui-workbench/cordis.patch.yml`、`profiles/comfyui-workbench/pnpm-workspace.yaml`、`deployment/runtime/package.json`、`deployment/runtime/pnpm-lock.yaml` 和 `deployment/runtime/pnpm-workspace.yaml`。`skills/**` 只允许后续 Ticket负责的 `skills/comfyui-generate/`、`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/` 与 `skills/lora-adjustment/`；package validation必须拒绝其他顶层 Skill目录，并在所属 Ticket完成后拒绝缺失该 Ticket负责的目录。`scripts/deploy/cli.mjs` 必须以 `#!/usr/bin/env node` 开头。用户安装 tarball 后必须能够直接运行 `harness-comfyui <command>`；开发测试命令和 `package.json` 的 `deploy:*` scripts 必须调用同一个 `scripts/deploy/cli.mjs`，不能复制命令实现。缺少任一 allowlist 文件时 package validation 必须失败。

首次安装的固定引导命令是 `npm exec --yes --package=<absolute-tarball> -- harness-comfyui install --installation <absolute-installation-json> --artifact <absolute-tarball>`。`install` 必须在 installation root 创建稳定入口 `<root>/bin/harness-comfyui`；该入口只读取 `<root>/state/active-release.json`，并执行当前 active release 中的同一个 `scripts/deploy/cli.mjs`。首次安装后的 start、stop、restart、status、health、logs、upgrade 和 rollback 都必须通过 `<root>/bin/harness-comfyui` 执行，不再依赖源码 worktree、npm cache 或全局安装。

Release Artifact 必须包含以下可执行闭包：

- `deployment/runtime/package.json` 把 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 分别锁定为 `0.1.0-rc.8`；
- `deployment/runtime/pnpm-lock.yaml` 固定上述 runtime 的完整已审核依赖闭包；
- `deployment/runtime/pnpm-workspace.yaml` 复用本仓库已审核的 override、`strictDepBuilds` 与 `allowBuilds`；
- `scripts/profile/materialize.mjs`、`scripts/profile/start.mjs` 与 `profiles/comfyui-workbench/` 的三个模板文件；
- `scripts/deploy/cli.mjs` 及其导入的全部 `scripts/deploy/*.mjs`。

`install` 必须把三个 runtime 结构化文件复制到 `<root>/releases/<version>/harness-runtime/`，使用 preflight 已确认的精确 `pnpm@11.7.0` 执行 `pnpm install --frozen-lockfile --prod`，并把 `<root>/releases/<version>/harness-runtime/node_modules/.bin/dsh` 记录为该 release 唯一 Harness executable。materialize、start、restart、upgrade 和 rollback 只能调用该绝对路径，不能调用 worktree `node_modules`、全局 `dsh`、npm cache 中的临时入口或另一个 release 的 runtime。

CLI 必须提供以下固定子命令：

- `install --installation <absolute-installation-json> --artifact <absolute-tarball>`：完成 preflight，创建第一个版本目录、物化 Harness profile并保存 active release state；该命令不启动进程，用户随后必须显式执行 `start`。
- `preflight --installation <absolute-installation-json> --artifact <absolute-tarball>`：只验证输入，不停止或切换进程。该命令必须验证 Node/pnpm/Harness 版本、tarball package name 与 version、Configuration Profile、监听地址、持久目录可创建且可读写、Catalog/Source contract 配置和现有 active release 状态。
- `start --installation <absolute-installation-json>`：以前台受管 Harness 子进程启动 active release，写入进程状态并把 stdout/stderr 同时输出到当前终端和产品日志。
- `stop --installation <absolute-installation-json>`：只向进程状态文件标识的同一 Harness 进程发送 SIGTERM，等待 `process.shutdownTimeoutMs`，确认端口释放后退出；不得按进程名批量终止进程。
- `restart --installation <absolute-installation-json>`：顺序调用同一 stop 与 start 实现，任一步失败时返回非零状态并指出失败阶段。
- `status --installation <absolute-installation-json> --json`：返回 `stopped`、`starting`、`running` 或 `unhealthy`，并包含 installation ID、active version、PID、启动时间、host、port 与最后一次 health 结果；不得返回环境变量、凭据或完整配置。
- `health --installation <absolute-installation-json> --json`：验证进程仍存活、PID 与 active release 一致、Harness Web 可访问、Client bundle 已加载、Catalog contract 可读取、Source contract identity 兼容、Run Repository 可只读打开、Saved Media 目录可访问。该命令不得发送消息、创建 Generation Run 或调用 ComfyUI `/prompt`。
- `logs --installation <absolute-installation-json> --lines <positive-integer>` 与可选 `--follow`：读取当前 installation 的产品日志；默认读取 200 行。该命令必须明确区分 Harness stdout、Harness stderr 与部署操作记录，并对 Authorization、credential 和环境变量值脱敏。
- `upgrade --installation <absolute-installation-json> --artifact <absolute-tarball>`：把新版本安装到新的不可变版本目录，执行 preflight，停止旧版本，切换 active release，启动候选版本并执行 health；任一候选启动或 health 失败时必须自动恢复并启动旧版本，同时保留共享 Run Repository、Run 文件、Saved Media 与日志。
- `rollback --installation <absolute-installation-json>`：把 active release 切换到 installation state 中记录的 previous release，重新启动并执行 health；没有 previous release 时必须失败并说明原因。

`start`、成功的 `restart`、成功的 `upgrade` 和成功的 `rollback` 必须由发起命令持续拥有新的唯一 Harness 前台子进程，直到另一个终端通过同一 installation 的 `stop` 结束该 Host。`process.json` 必须保存 Host PID、active release、CLI operation ID、startedAt、host 与 port。任一切换命令不得创建 detached Host、隐藏后台进程或第二个 PID state。

`package.json` 必须提供 `deploy:install`、`deploy:preflight`、`deploy:start`、`deploy:stop`、`deploy:restart`、`deploy:status`、`deploy:health`、`deploy:logs`、`deploy:upgrade` 和 `deploy:rollback`，每个 script 只能把对应子命令转发给 `scripts/deploy/cli.mjs`。

### Installation 结构

`--installation` 指向的 JSON 必须由 `scripts/deploy/contracts.mjs` 导出的结构化 schema 进行唯一校验。该 JSON 的字段固定为：

- `schemaVersion: 1`；
- `installationId`；
- `root` 绝对路径；
- `configurationProfile`，允许 `development`、`test`、`release-smoke` 或 `production`；
- `host` 与 `port`；
- `paths.dataDir`、`paths.runRepositoryFile`、`paths.runDirectory`、`paths.savedMediaDirectory` 和 `paths.logDirectory` 的绝对路径；
- `comfyui.defaultInstanceId`；
- `source.catalogCliPath`、`source.sourceCliPath`、固定值`source.contractId: "imagegen-source-contract"`与固定值`source.sourceReleaseVersion: "0.82.2"`；这两个固定值是 Harness Installation 的 source pin，不是 live CLI 响应字段。v0.82.2 消费规则唯一记录在 `config/source-contract-v0.82.2.json`；
- `client.runRefreshIntervalMs`，必须是正整数；
- `process.shutdownTimeoutMs`。

Installation root 的固定目录结构是：

```text
<root>/bin/harness-comfyui
<root>/releases/<version>/package/
<root>/releases/<version>/harness-runtime/
<root>/releases/<version>/dsh-home/
<root>/shared/data/
<root>/shared/runs/
<root>/shared/saved-media/
<root>/shared/logs/
<root>/state/active-release.json
<root>/state/process.json
<root>/state/last-health.json
<root>/state/operations.jsonl
```

`releases/<version>/package/` 必须包含 tarball 解包后的 package，`releases/<version>/harness-runtime/` 必须包含该版本的 runtime manifest、lock、workspace 与 installation-local `node_modules`，`releases/<version>/dsh-home/` 必须包含该版本物化后的 `comfyui-workbench` profile。`shared/` 中的 Run Repository、Run 文件、Saved Media 与日志不得放入版本目录；install、upgrade 和 rollback 都不得移动、覆盖或删除这些共享数据。`active-release.json` 必须记录 active version、release directory 与 previous version；`process.json` 必须记录 CLI 启动的 PID、active version、CLI operation ID、host、port 和 startedAt。所有 state JSON 必须通过临时文件加原子 rename 更新。

产品 CLI 必须把 `installation.json` 转换为 Host 唯一环境。CLI 必须先清除 ambient `HARNESS_COMFYUI_*`，再生成以下固定映射：`configurationProfile` → `HARNESS_COMFYUI_CONFIGURATION_PROFILE`、`paths.dataDir` → `HARNESS_COMFYUI_DATA_DIR`、`paths.runRepositoryFile` → `HARNESS_COMFYUI_RUN_REPOSITORY_FILE`、`paths.runDirectory` → `HARNESS_COMFYUI_RUN_DIRECTORY`、`paths.savedMediaDirectory` → `HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY`、`paths.logDirectory` → `HARNESS_COMFYUI_LOG_DIRECTORY`、`comfyui.defaultInstanceId` → `HARNESS_COMFYUI_DEFAULT_INSTANCE_ID`、`source.catalogCliPath` → `HARNESS_COMFYUI_CATALOG_CLI_PATH`、`source.sourceCliPath` → `HARNESS_COMFYUI_SOURCE_CLI_PATH`、`client.runRefreshIntervalMs` → `HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS`、`host` → `HARNESS_COMFYUI_SERVER_HOST`、`port` → `HARNESS_COMFYUI_SERVER_PORT`。`source.contractId`与`source.sourceReleaseVersion`只用于preflight读取`config/source-contract-v0.82.2.json`，分别执行两个CLI的`--discovery-json`并验证v0.82.2 discovery shape、operation metadata和envelope，不创建Host环境变量。`paths.dataDir`、`paths.runDirectory`、`paths.savedMediaDirectory`和`paths.logDirectory`必须分别等于installation root下的`shared/data`、`shared/runs`、`shared/saved-media`和`shared/logs`；`paths.runRepositoryFile`必须位于`shared/data`内。

CLI 只交付程序。Tickets 02–13 的每张产品 Issue 执行者只能在该 Issue 自己的 Git worktree 中创建 `runtime/production/` 并运行该程序；Ticket 14 不创建 installation；版本发布后的用户自行决定 installation root。本 Ticket 不要求计划执行者连接、部署或维护任何用户安装。

仓库根 `package.json` 是 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 精确版本的唯一来源。`scripts/release/sync-runtime-manifest.mjs` 必须从根 `package.json` 的对应精确 devDependencies 确定性生成 `deployment/runtime/package.json` 的三个 dependencies；该脚本不得解析 Markdown。`check:manifest-lock` 必须验证 root manifest、runtime manifest、root lock 与 runtime lock 的三个版本完全一致，并验证两份 workspace 中的 override、`strictDepBuilds` 和 `allowBuilds` 完全一致。`security:advisories` 必须分别审计 root lock 和 runtime lock；`security:build-scripts` 必须分别验证两份 workspace 对两份 lock 中 lifecycle package 的精确允许关系。任一漂移必须在 frozen install 前失败。

### Tickets 02–13 worktree 的统一产品运行流程

Tickets 02–13 的每张 Issue 必须在该 Issue 自己的 Git worktree 中运行。该 worktree 必须把 `runtime/` 加入 `.gitignore`，并在 `runtime/production/installation.json` 使用 `configurationProfile: "production"`。该 installation 必须使用与用户安装相同的目录结构、产品 CLI、profile materialization、前台 Harness 启动、PID state、health 和日志逻辑。Ticket 14 不执行本节流程。

Issue 执行者必须使用当前 worktree 构建的 tarball并执行：

1. 首次运行执行 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install --installation <worktree>/runtime/production/installation.json --artifact <worktree-tarball>`；已有 active release 时执行 `<worktree>/runtime/production/bin/harness-comfyui upgrade --installation <installation-json> --artifact <worktree-tarball>`。
2. 在独立终端以前台方式运行 `<worktree>/runtime/production/bin/harness-comfyui start --installation <installation-json>`。
3. 通过同一 installed CLI 执行 `status --json`、`health --json` 和 `logs --lines 200`。
4. 完成功能浏览器验收后，通过同一 installed CLI 执行 `stop`，并确认 PID state 已清理且端口已释放。

每张 Issue 只能传入自己 worktree 的 installation JSON 和 tarball。后续 Issue 不得创建自己的 wrapper、进程管理器、PID 文件格式、health 实现、日志实现或目录布局。

## 失败行为

- 未声明或非法的 Configuration Profile 必须在注册 Tool、Remote 或 worker 前停止启动，并指出 profile 名和失败属性。
- profile 物化不得修改默认 `DSH_HOME`；目标 profile 缺少当前包依赖时命令失败。
- Client bundle 出现 Node builtin 或未列入允许规则的 `@deepseek-ai/*` value import 时 build 失败。
- 任一 dependency advisory、typecheck、测试、包内容或 release-smoke 检查失败时，`pnpm quality` 返回非零状态且不产生可发布结论。
- start 发现 `process.json` 中的同一进程仍运行时必须失败，不能启动第二个 Host；发现 stale PID 时必须记录并清除 stale state 后再启动。
- status 或 stop 发现 PID 已被其他进程复用时必须返回 identity mismatch，不能向该 PID 发送信号。
- health 任一必需检查失败时必须返回 `unhealthy`、失败检查名称与可操作错误，不能只返回布尔值。
- upgrade 的候选版本启动或 health 失败时必须恢复 previous release；回滚失败时必须保留候选与旧版本目录、共享数据和完整失败日志。

## 产品验收

1. 删除 `lib/` 与 `.release/` 后执行一次 `pnpm quality`；全部阶段按固定顺序完成，并且结束后没有 Harness 子进程或监听端口。
2. `deploy:install` 通过唯一 profile materialize helper 创建 `runtime/production/` installation；目标 profile 包含当前 package dependency，默认 DSH home 没有变化。
3. `deploy:start` 启动该 installation 后浏览器能够连接配置端口；`deploy:stop` 只停止同一 PID 并释放端口。
4. composition、e2e 和 release-smoke 的证据记录同一 artifact SHA-256。
5. 浏览器调用 `ctx.remote.pluginStatus.get()`，响应与正在运行的 package version 和 Configuration Profile 一致。
6. 加载和卸载本Ticket的Client plugin骨架时没有single-slot重复注册错误；Ticket 02尚未注册项目`sidebar`、`details`和conversation occupants，因此本Ticket浏览器验收始终显示上游默认AppFrame与默认ConversationRoot内容。
7. 发布包包含 `bin.harness-comfyui` 指向的 CLI 和全部运行时 deploy modules；通过固定 `npm exec --package=<tarball>` 引导命令执行首次 install 后，`<root>/bin/harness-comfyui --help` 能看到十个固定子命令。
8. 在 Ticket 01 自己的 Git worktree 中使用 `runtime/production/installation.json` 和 `production` Configuration Profile 完成 install → start → status → health → logs → restart → stop；进程状态、端口与日志均来自同一 installation。
9. 使用第二个开发 tarball完成 upgrade；候选 health 成功时 active release 指向新版本。再用受控失败探针执行 upgrade；CLI 自动恢复旧版本，且共享 Run Repository、Run 文件、Saved Media 和日志均未被移动、覆盖或删除。
10. 发布包不包含 `.local/`、Run Repository、Saved Media、日志、凭据、`prototype/`、测试数据或 DeepSeek Harness 源码。
11. 在不包含仓库 `node_modules`、源码 checkout 或全局 `dsh` 的临时目录中，仅使用 tarball、installation JSON、Node 与 preflight 确认的 `pnpm@11.7.0` 完成 install → start → status → health → logs → stop；运行进程必须使用该 release 的 `harness-runtime/node_modules/.bin/dsh`。
12. 清除进程环境中全部 ambient `HARNESS_COMFYUI_*` 后启动 `production` Profile，Host 读取的路径、默认 ComfyUI instance、Source CLI 和 server host/port 必须与 installation JSON 的固定映射一致。
13. restart、upgrade 与 rollback 分别完成切换后都只能存在一个 Harness Host；切换命令持续拥有新的前台 Host，另一个终端执行 stop 后切换命令退出、PID state 清理且端口释放。
14. `check:harness-boundary`必须拒绝Harness source path、`@deepseek-ai/*/src/*` import与Harness package patch/fork/alias/Loader hook；独立代码审核者必须确认项目TypeScript/TSX源码没有自定义forwarded event注册、Harness DOM查询/移动/monkey patch或Harness Core交互重写；tarball-only composition与E2E必须在DeepSeek Harness checkout不存在时通过。
15. `registerProjectTools()`单元测试必须覆盖稳定注册顺序、重复名称启动失败、第三个Tool注册失败时前两个Tool反向注销、Host plugin卸载时全部Tool反向注销，以及产品源码其他文件直接调用`ctx.tools.register()`时`check:harness-boundary`失败。

## 不属于本 Ticket

本 Ticket 不实现 Session 列表、消息上下文、Generation Run、媒体库或任务列表。计划执行者负责实现并在当前仓库测试产品安装与运行管理程序，但不替用户执行版本发布后的安装、启动或维护。
