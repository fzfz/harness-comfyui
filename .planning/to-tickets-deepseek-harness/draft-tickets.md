# DeepSeek Harness ComfyUI 纵向产品切片提案

下列 Ticket 正文用于同步 GitHub Issues。Ticket 02 至 13 必须在当前仓库正式拥有的 DeepSeek Harness 产品中交付一个浏览器用户或产品操作员能够完成的真实任务；Catalog、Host、Run Repository、ComfyUI transport、Client 和测试只作为该真实任务的实现范围，不单独成为 Ticket 目的。Ticket 14 只发布 Ticket 13 已验收的同一 Release Artifact。Ticket 01 是用户明确要求前置的完整系统生命周期基线 Ticket，它必须交付可由 Release Artifact 安装后直接运行的产品管理 CLI，以及开发者能够在每张产品实现与验收 Issue 的 Git worktree 中完成的真实安装、启动、进程检查、健康检查、日志、重启、停止、升级、回滚、测试和打包任务，不能只交付文档或 fixture-only 脚手架。

静态原型只定义产品的信息结构、交互动作、视觉样式、状态语义和用户可见结果。计划执行者必须在真实 Harness bundle、Host plugin、Client plugin、Run Repository 和受控外部服务中实现并验收产品；正式产品不得把 `prototype/` 页面、静态 fixture 或原型状态切换器作为运行依赖、功能实现或验收替身。

每张 Ticket 必须内联以下验收优先级：

1. 静态原型已经展示的桌面产品区域必须在真实 DeepSeek Harness Host/Client 中 1:1 实现。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本。计划执行者不得以“功能等价”“使用未明确列出的Harness默认控件”“后续统一调整”或自动化测试通过为理由删除、替换、合并、重排或重新设计原型已经展示的桌面元素与交互。
2. 静态原型没有展示的功能、分支或后端行为，真实产品必须逐条实现对应 PRD 与父 Issue #1 的具体规范。只有父 Issue #1 或用户后续决定明确标记的原型错误或缺口修正可以改变对应可见设计；该 Ticket 必须逐项写明原型元素、替代设计、决定来源和验收证据。当前唯一已知可见例外是 Ticket 05 增加“提示词条目”导航，并把 ComfyUI Instance 从 Message Context 候选移到独立 Execution Route。除此之外的可见差异全部判定为 FAIL。
3. 静态原型与父 Issue #1 或用户后续明确决定冲突时，计划执行者必须采用父 Issue 或用户后续决定。本提案已经采用的后续决定包括：ComfyUI Instance 只作为 Execution Route；Harness `call_id` 直接映射 `run_id`，不创建第二个 Tool execution identity。
4. Ticket 02 必须创建唯一 `tests/visual/prototype-fidelity-viewports.json`，精确包含一个桌面viewport：`1440×1000`。Tickets 02–13 的每个可见原型区域必须在该 Ticket 自己的 Git worktree、`runtime/production/` installation、`production` Configuration Profile 和当前本地浏览器中保存该尺寸与静态原型的成对截图或录像。独立视觉审核者不得是该 Ticket 的实现者；独立视觉审核者必须操作两边界面并给出 PASS/FAIL，实现者自检和自动化测试不得代替独立验收。正式浏览器候选、Source 摘要、Run Repository 和 MediaStore 必须来自对应 PRD 指定的真实服务；受控 fixture 只允许确定性自动化技术测试，人工验收只允许在该 worktree installation 中使用受控 Fake ComfyUI/Jobs 响应准备 PRD 明确列出的故障可见状态。任何 fixture 都不得进入正式 bundle、Profile 或浏览器数据源。

每张 Ticket 还必须内联以下 Harness 核心零改动门禁：

1. 每张Ticket的“公共插件接口”段直接列出该Ticket允许使用的Harness `0.1.0-rc.8` public exports与composition机制。Ticket执行者只能使用所属Ticket正文列出的public interfaces，不重新调研或设计替代接口。
2. 计划执行者不得修改 DeepSeek Harness checkout 或 installation 中的 `node_modules/@deepseek-ai`，不得使用 `patch-package`、`pnpm.patchedDependencies`、本地 fork、模块 alias、Loader hook、源码复制、`@deepseek-ai/*/src/*` import或 DOM monkey patch。`cordis.patch.yml` 只允许通过 `dsh.bundle.patch` 完成两项公开 composition：按精确 Loader row id `ui-layout` 将上游随附布局插件设置为 `disabled: true`，以及插入当前项目 Host plugin Loader row；该文件不得 patch Harness package 文件。
3. 计划执行者不得重写Harness Session、AgentLoop、Host Skill发现与调用校验、Tool execution identity、持久Session日志或Jobs registry，也不得为了增加项目事件修改`@deepseek-ai/dsh-api-remotes` forwarded-event allowlist。项目Workbench可以替换上游随附UI插件的可见界面，但只能读取或调用公开Harness Core契约。
4. 本次规划审计已经基于主工作树实际安装的 DeepSeek Harness `0.1.0-rc.8` 为每张 Ticket 写入可实现性状态和精确 public interface。Ticket 执行者只负责落地所属 Ticket 已列出的接口，不负责继续调研 Harness seam、选择 Harness 版本或设计替代接口。当前没有等待用户决定的 Harness public plugin seam 阻塞；数据源仓库发布前置条件只保留在明确消费该发布产物的 Ticket 中。

## v0.82.2 源数据消费合同（所有 Ticket 的唯一最新规范）

本节优先于各 Ticket 中仍保留旧 source wrapper 术语的句子；唯一结构化字段来源是 `config/source-contract-v0.82.2.json`，解释文档是 `docs/v0.1/source-contract-v0.82.2.md`。

Harness Installation 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`。Catalog discovery 是顶层字段为 `openapi`、`info`、`x-imagegen-media-origin`、`paths`、`components` 的 OpenAPI 3.1 对象；Source discovery 是 `status`、`message`、`results`、`page`、`page_size`、`total_count` 成功 envelope，OpenAPI 位于 `results[0]`。两个 CLI 只验证非空、严格 UTF-8 和单个 JSON 值并原始透传；业务 Schema 由 Harness adapter 校验。

Catalog 与 Source 成功响应必须满足 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count`。Catalog adapter 将 `results` 映射为内部 `items`，从 Installation 与 manifest 补充内部 `source_release_version`、`kind` 和 `result_contract_id`。Source TemplateBundle 的 `expected_output_node_ids_json` 必须是非空数组；`null`、空数组、缺失或非法值返回 `SOURCE_TEMPLATE_UNAVAILABLE`，不得推导或补默认值。

所有 Ticket 中旧的顶层 `contract_id`/`contract_version`/`source_release_version` wrapper、CLI 业务 Schema 校验和直接 `TemplateBundle` 响应要求均以本节和两个 v0.82.2 合同文件为准；执行者不得自行设计替代消费路径。

产品行为设计依据：

- `prototype/generation-workbench/index.html`
- `prototype/generation-workbench/app.js`
- `prototype/generation-workbench/styles.css`
- `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`
- `prototype/generation-workbench/tests/prototype-contract.test.mjs`
- `prototype-scheme.md` 第 4 节“选定的产品结构”和第 11 节“实现顺序与门禁”

Ticket 01 没有对应的原型界面。本提案编写阶段已经完成 DeepSeek Harness 公共接口、bundle composition、Client 构建格式、`AppFrame` slot、Configuration Profile、依赖版本、安全门禁、测试分层、CI 和版本发布调研；下列结论是 Ticket 01 的确定实现规范，不是交给计划执行者继续调研的问题。计划执行者只能落地并验证这些已定义结论；计划执行者不得用新的调研报告、设计文档或空目录代替可运行工程。Ticket 02 至 13 必须使用 Ticket 01 已落地的目录、配置、命令、测试分层和 CI；Ticket 14 只使用 Ticket 13 的 Release Preview、验收证据和同一 Release Artifact 完成版本发布。

## Ticket 01 — 交付可安装、可启动、可检查和可回滚的 Harness 产品基线

### 产品目的

计划执行者必须一次性交付当前产品的完整系统生命周期基线，使开发者能够在 Ticket 自己的 Git worktree 中使用 `production` Configuration Profile 完成“冻结依赖安装 → 构建产品包 → 创建 `runtime/production/` installation → 配置预检 → 启动真实 Harness Host 与浏览器 Client → 检查进程状态 → 执行产品健康检查 → 查看产品日志 → 重启 → 停止 → 安装候选版本 → 失败时恢复上一版本”。运行中的 Harness 必须加载当前项目的 Host plugin 和 Client plugin；运行时不得读取原 DeepSeek Harness checkout、`prototype/` 文件或测试 fixture。Ticket 02 至 13 只能在各自 Git worktree 中调用本 Ticket 已经交付的同一套 `deploy:*` 系统生命周期程序；后续 Ticket 不得实现、复制或修改第二套环境启动、进程检查、健康检查、日志、停止或回滚脚本。Ticket 14 不创建 installation，也不调用任何 lifecycle 子命令。

### 产品需求文档

- `docs/v0.1/PRDS/01-engineering-baseline.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节接口已经在 DeepSeek Harness `0.1.0-rc.8` committed tree `141eb6fef83422698aef7a981029e843e8161534` 和主工作树实际安装的同版本 packages 中验证；本 Ticket执行者只负责落地这些接口，不负责继续调查 Harness seam、选择 Harness版本或设计替代接口。

本Ticket必须落地`docs/adr/0012-harness-core-is-immutable.md`与`check:harness-boundary`。产品只通过`dsh.bundle.patch`注册当前项目Host plugin Loader row，通过`exports["./client"]`与`dsh.client` metadata注册Client plugin，通过`exports["./typert"]`发现Host Remote contribution，并由项目Client plugin调用公开`ctx.remote.$mount(harnessComfyuiRemote)`挂载`exports["./remote"]` contribution。

`package.json.dsh.client.inject`只声明Client package加载依赖，不是Cordis service注入列表。`src/client/index.tsx`必须同时导出Client `apply`和Cordis service `inject`；Ticket 01阶段的`inject`精确为`["slots", "sessions", "remote"]`。Client runner必须在三项service都存在后调用`apply`。contract与composition测试必须读取实际module export，并分别撤出`slots`、`sessions`与`remote` provider，证明plugin保持pending且不注册slot、Remote或其他副作用；恢复provider后plugin只激活一次。

tarball-only composition必须在DeepSeek Harness源码checkout不存在时加载Host plugin、Client plugin与`pluginStatus` Remote。静态门禁必须拒绝Harness checkout路径、`@deepseek-ai/*/src/*` import与Harness package patch/fork/alias/Loader hook。独立代码审核者必须检查项目TypeScript/TSX源码没有自定义forwarded event注册、Harness DOM查询/移动/monkey patch或Harness Core交互重写；tarball-only composition与E2E必须证明产品只使用本Ticket正文列出的public seam。

本Ticket必须创建`src/host/tools/register-project-tools.ts`并导出`registerProjectTools(ctx, definitions)`。该文件是产品代码中唯一直接调用`ctx.tools.register()`的位置；本Ticket完成时`src/host/plugin.ts`是唯一调用`registerProjectTools()`的位置，附加Ticket 15随后把唯一调用者迁入`src/agent/plugin.ts`并删除Host root调用。registry必须验证非空且唯一的名称、非空description和闭合输入/输出schema，按传入数组稳定顺序注册，任一失败时反向调用本次已取得的disposer，当前调用plugin卸载时反向注销全部项目Tool。`check:harness-boundary`必须用TypeScript/TSX调用表达式的确定性语法扫描拒绝其他`src/**`文件直接调用`ctx.tools.register()`；Ticket 01只交付registry基础设施，不提前注册业务Tool。

### 原型 1:1 实现与验收基础

本 Ticket 不交付某一个原型产品区域，但必须保留 `prototype/generation-workbench/` 作为后续产品设计与并排验收基准，并交付真实 `AppFrame` composition、浏览器 E2E 和接受结构化 viewport 输入的驱动能力。本 Ticket 不得把原型页面、fixture 或状态切换器嵌入正式 bundle，也不得创建会阻碍原型三列布局、上下文 Modal、运行卡片、任务 Modal 和媒体 Modal 1:1 实现的替代 UI 架构。本 Ticket 完成只表示完整系统能够被统一安装、启动、检查、记录日志、停止、升级与回滚，不表示任何原型产品区域已经实现或通过视觉验收。当前仓库已经存在的 `.github/workflows/deploy.yml`、`scripts/deploy/`、`tests/deploy/`、`config/profiles/production.json` 和四个 `deploy:*` package scripts 必须保留并补全为真实产品管理程序；当前只接受 `fixture-*` 的测试骨架不满足本 Ticket 验收。

### 完整系统生命周期基线

`package.json` 必须声明 `bin.harness-comfyui: "scripts/deploy/cli.mjs"`，并把 `scripts/deploy/cli.mjs` 及其全部运行时模块写入 `package.json.files`。Release Artifact 安装后，用户必须能够运行同一个 `harness-comfyui` CLI。CLI 必须提供 `install`、`preflight`、`start`、`stop`、`restart`、`status`、`health`、`logs`、`upgrade` 和 `rollback` 十个固定子命令。仓库全部 `deploy:*` package scripts只能把子命令转发给该 CLI，不能复制实现。

首次安装必须使用 `npm exec --yes --package=<absolute-tarball> -- harness-comfyui install --installation <absolute-installation-json> --artifact <absolute-tarball>`。`install` 必须创建 `<root>/bin/harness-comfyui` 稳定入口；该入口只读取 `<root>/state/active-release.json` 并执行 active release 中的同一 CLI。首次安装后的 start、stop、restart、status、health、logs、upgrade 和 rollback 都必须通过 `<root>/bin/harness-comfyui` 运行，不得依赖源码 worktree、npm cache 或全局安装。

Release Artifact 必须包含 `deployment/runtime/package.json`、`deployment/runtime/pnpm-lock.yaml` 和 `deployment/runtime/pnpm-workspace.yaml`。仓库根 `package.json` 是 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 精确版本的唯一来源；`scripts/release/sync-runtime-manifest.mjs` 必须从根 manifest 的对应精确 devDependencies 确定性生成 runtime manifest 的三个 dependencies，不能解析 Markdown。runtime manifest 必须因此把三者分别锁定为 `0.1.0-rc.8`；runtime lock 必须固定其完整已审核依赖闭包，runtime workspace 必须复用本仓库已审核的 override、`strictDepBuilds` 和 `allowBuilds`。`install` 必须把这三个结构化文件复制到 `<root>/releases/<version>/harness-runtime/`，使用预检确认的精确 `pnpm@11.7.0` 执行 `pnpm install --frozen-lockfile --prod`，并把该版本唯一 Harness 可执行文件固定为 `<root>/releases/<version>/harness-runtime/node_modules/.bin/dsh`。profile 物化、start、upgrade 和 rollback 只能调用该绝对路径；不得调用 worktree `node_modules/.bin/dsh`、全局 `dsh` 或另一个版本目录的 `dsh`。runtime install 完成后，start/status/health/logs/stop 不得读取 npm cache。

Release Artifact 的 `package.json.files` 与包内容 allowlist 必须同时包含 `skills/**`、`scripts/deploy/*.mjs`、`scripts/profile/materialize.mjs`、`scripts/profile/start.mjs`、`profiles/comfyui-workbench/package.json`、`profiles/comfyui-workbench/cordis.patch.yml`、`profiles/comfyui-workbench/pnpm-workspace.yaml` 和 `deployment/runtime/` 的三个结构化文件。Ticket 04 增加 `skills/comfyui-generate/`，Ticket 12增加 `skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/` 与 `skills/lora-adjustment/`；package validation必须拒绝四个批准目录以外的 Skill目录，并在所属 Ticket完成后拒绝缺失该 Ticket负责的目录。

`install` 必须完成 preflight，创建第一个不可变版本目录、物化 `comfyui-workbench` profile并写入 active release state；该命令不启动进程，计划执行者随后必须显式执行 `start`。`preflight` 必须在不停止当前进程的情况下验证 tarball、Node/pnpm/Harness 版本、Configuration Profile、监听地址、持久目录读写能力和 Source contract；`start` 必须以前台受管进程启动 Host 并同时写终端输出和产品日志；`stop` 必须只向 installation state 标识的同一 PID 发送 SIGTERM、等待退出并确认端口释放；`restart` 必须复用同一 stop/start；`status --json` 必须返回 installation ID、active version、PID、startedAt、host、port 与 `stopped|starting|running|unhealthy`；`health --json` 必须检查进程、active release、Harness Web、Client bundle、Catalog contract、Source contract、Run Repository 与 Saved Media，且不得发送消息或调用 ComfyUI `/prompt`；`logs` 必须支持固定行数与 follow，并区分 stdout、stderr 和部署操作记录；`upgrade` 必须安装候选版本、预检、停止旧版本、切换、启动和健康检查，失败时恢复并启动旧版本；`rollback` 必须显式恢复 previous release 并重新健康检查。

每个 installation 必须使用 `<root>/releases/<version>/package/` 保存 tarball 解包文件，使用 `<root>/releases/<version>/harness-runtime/` 保存 runtime manifest、lock、workspace 和 installation-local Harness 依赖，使用 `<root>/releases/<version>/dsh-home/` 保存该版本物化的 Harness profile，使用 `<root>/shared/data/`、`<root>/shared/runs/`、`<root>/shared/saved-media/` 和 `<root>/shared/logs/` 保存跨版本数据，使用 `<root>/state/active-release.json`、`process.json`、`last-health.json` 和 `operations.jsonl` 保存运行状态。install、upgrade 和 rollback 都不得移动、覆盖或删除 shared 目录。PID state 必须防止重复启动和 PID reuse；state JSON 必须原子更新；日志与状态不得包含 Authorization、credential 或环境变量值。

Ticket 02 至 13 必须在各自 Git worktree 中创建 `runtime/production/installation.json`，使用 `configurationProfile: "production"`，并直接调用同一套 `deploy:install`、`deploy:preflight`、`deploy:start`、`deploy:stop`、`deploy:restart`、`deploy:status`、`deploy:health`、`deploy:logs`、`deploy:upgrade` 和 `deploy:rollback` package scripts。每张 Ticket 只能传入自己 worktree 的 installation JSON 与当前 worktree 构建的 tarball；后续 Ticket 不得创建 development wrapper、第二套进程管理器、PID state、health、日志或目录结构。Ticket 14 只读取 Ticket 13 的 Release Preview、artifact identity 和验收证据。

### 已完成调研的 Harness 集成规范

本提案使用 DeepSeek Harness `0.1.0-rc.8` committed tree `141eb6fef83422698aef7a981029e843e8161534` 的已提交 `package.json`、公开 exports、类型定义、实现和测试，以及当前主工作树实际安装的 `0.1.0-rc.8` packages作为证据。`/Volumes/4Tdisk/work/AI2/deepseek-harness` checkout中的未提交文件不属于证据，也不是当前项目的构建或运行依赖。

| Harness 组成部分 | 已确认的公共规范 | 当前项目必须落地的实现 |
|---|---|---|
| Harness Core boundary | `docs/adr/0012-harness-core-is-immutable.md`接受核心零改动决定；本表直接列出rc.8允许的public exports与composition机制。 | `check:harness-boundary`必须直接检查import specifier、manifest、lockfile与Cordis YAML，拒绝source import与Harness package patch/fork/alias/Loader hook。该程序不得读取Issue、PRD或Markdown作为输入，只检查确定性代码与配置结构。独立代码审核者检查TypeScript/TSX源码没有自定义forwarded event注册或查询、移动、改写上游组件DOM；tarball-only composition与E2E证明UI只使用本表列出的public plugin composition。 |
| Profile 与 bundle | `packages/boot/app-boot/src/profile.ts` 定义 `$DSH_HOME/profiles/<name>`；profile 的 `package.json` 通过 `dsh.profile.bundles` 声明有序 bundle，bundle 的 `package.json` 通过 `dsh.bundle.patch` 指向 `cordis.patch.yml`。`web` composition 的基础顺序是 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`；后应用的 bundle patch 可以按 Loader row id 覆盖前层定义，rc.8 Web App 的布局 row id 是 `ui-layout`。 | `profiles/comfyui-workbench/package.json` 必须按 `@deepseek-ai/dsh-base` → `@deepseek-ai/dsh-web-app` → `harness-comfyui` 的顺序声明三个 bundle；仓库根 `package.json` 必须声明 `dsh.bundle.patch: "./cordis.patch.yml"`。Ticket 01 先交付可启动的默认 AppFrame composition；Ticket 02 必须在同一公开 patch 中把 `ui-layout` row 设置为 `disabled: true`并保留本项目 Host plugin Loader row。Development、composition test 和 release-smoke 必须物化同一 profile 模板。 |
| Host plugin | Harness Host package 通过根 export 提供 ESM `apply(ctx, config)`、`name`、`inject` 和 Standard Schema `Config`；`@deepseek-ai/schemastery` 是现有 Harness package 的配置 schema 实现。 | `src/index.ts` 必须导出 `src/host/plugin.ts` 的 `apply`、`name`、`inject` 和 `Config`；构建必须生成 `lib/index.js` 与对应声明文件；`package.json` 的 `exports["."]` 必须只指向这些构建产物。 |
| Client plugin发现 | Harness Client module scanner读取package的`exports["./client"]`和`dsh.client`，然后由Host提供`client.js`。`package.json.dsh.client.inject`声明Client package加载依赖；`./client`导出的`inject`数组另行声明Cordis service生命周期依赖。 | Ticket 01的`src/client/index.tsx`必须导出Client `apply`和精确service `inject: ["slots", "sessions", "remote"]`；`package.json`声明`exports["./client"]`与`dsh.client.platform: "web"`，并在`dsh.client.inject`声明connection、Remote、locale、runtime、conversation与input-trigger包依赖。Ticket 02必须把module service `inject`精确扩展为`["slots", "sessions", "remote", "theme", "inputTriggers"]`，Ticket 16再为公开`session.create`调用增加`connection`；`@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8`必须作为直接devDependency、peerDependency与`package.json.dsh.client.inject`依赖。Ticket 02只对`@deepseek-ai/dsh-client-ui-input-trigger/client`、`@deepseek-ai/dsh-client-ui-layout/client`和`@deepseek-ai/dsh-client-ui-theme/client`执行type-only import以取得公开Context、SlotMap、`ILayout`与`ThemeSnapshot`类型，不得value-import上游UI实现。`ui-primitives`与`ui-slots`是直接import，不是Client package inject。 |
| Client bundle 格式 | `packages/client/tsdown.client.ts` 输出浏览器 CJS lazy factory，并调用 `window.__ModuleLoader__.load({ id, factory })`。已确认的完整 external specifier 数组是 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-web-react`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-attachment`、`@deepseek-ai/dsh-client-schema-form`、`@deepseek-ai/dsh-client-runtime/client`。已确认允许内联的 DeepSeek value import 规则只有 `^@deepseek-ai/dsh-(host-apiproxy|session|llm|tools|brand)(/|$)`、`^@deepseek-ai/(cosmokit|schemastery)(/|$)` 和 generated remote `^@deepseek-ai/dsh-[a-z0-9]+(-[a-z0-9]+)*/remote$`。 | 当前项目不得导入 Harness 源码仓库内部的 `tsdown.client.ts`。`scripts/build/tsdown-client-bundle.ts` 必须把前述 11 个 external 和 3 条 inline 规则保存为唯一结构化常量，并实现 loader handoff、浏览器 CJS 输出和 sourcemap。Client value import 的确定规则是：11 个 external 保持 external；匹配 3 条 inline 规则的 DeepSeek module 与普通非 Node、非 DeepSeek package 被内联；Node builtin 和其他 `@deepseek-ai/*` value import 直接使构建失败；type-only import 在进入规则前被 TypeScript 删除。构建测试必须逐项验证这些分支，把 `lib/client.js` 加载到伪造的 `window.__ModuleLoader__` 并确认 module id 是 `harness-comfyui`。`src/client/styles.css` 必须由该构建文件确定性内联，并在 factory 执行时只注入一个 `data-plugin="harness-comfyui"` style；本 Ticket 不增加 CSS 编译依赖。 |
| 桌面Shell与UI projection | rc.8 `dsh.profile.bundles`按顺序应用bundle patch，后层可以按Loader row id覆盖前层；`@deepseek-ai/dsh-web-app/cordis.patch.yml`中的上游布局插件row id固定为`ui-layout`。`SlotCore`内建并公开`root` slot；root occupant可以声明`sidebar`、`conversation`、`details`与`shell.overlay`。`ui-conversation`公开`conversation` occupant、标准conversation projection和`conversation.input.overlay`；`ui-input-trigger`把原生`MenuView`注册到该overlay。 | Ticket 02必须在项目bundle的`cordis.patch.yml`中用`id: ui-layout`与`disabled: true`停用上游`ui-layout`这个随框架提供的UI插件，然后由项目Client plugin通过公开`ctx.slots.register()`注册唯一root occupant。项目root必须声明并渲染rc.8标准`sidebar`、`conversation`、`details`与`shell.overlay`四个child slot，提供符合公开`ILayout`的`toggleSidebar()`、`openDetails()`与`closeDetails()` Cordis service，并在`1440×1000`使用`294px minmax(0, 1fr) 432px`三列。项目继续运行上游`ui-conversation`、`ui-input-trigger`与`ui-skill`；ConversationRoot继续声明并渲染原生Skill menu。项目不得修改Harness Core、查询或移动上游DOM、导入`@deepseek-ai/*/src/*`或实现第二套Skill菜单。 |
| Modal、Message Context与附件 | `@deepseek-ai/dsh-client-ui-primitives`公开`Modal`；`SessionFace.prompt(parts, 'queue')`公开接受text与image `PromptContentPart[]`；Host原生attachment store持久化已发送图片。 | Ticket 03在项目Workbench保存发送前正文、ContextRef、File和preview，Context resolver生成`generation-context.v1` blocks，然后通过一次`SessionFace.prompt(parts, 'queue')`提交正文、上下文与图片；失败保留临时UI数据，成功或删除附件时回收object URL。 |
| Host/Client 调用 | `@deepseek-ai/dsh-typert-protocol` 公开 `TypertRemoteService` 与 `@Remote`；`@deepseek-ai/dsh-typert-generator/tsdown` 生成 `./typert` Host descriptor 与 `./remote` Client contribution。`@deepseek-ai/dsh-api-remotes/client` 只挂载 Harness 固定 contribution，但公开 `ctx.remote.$mount()`。 | Host 通过严格类型 Remote service暴露 Run、Media和浏览器安全 Catalog投影；项目 Client plugin必须 value-import `harness-comfyui/remote` 并调用 `ctx.remote.$mount()`。项目不得修改固定 BFF数组，不得为业务操作另造浏览器 fetch endpoint。Source Operation 只允许 Host adapter调用。 |
| 项目Tool注册生命周期 | `@deepseek-ai/dsh-tools`公开`defineTool()`与`ctx.tools.register()`；同一layer重复名称注册失败，每次成功注册返回可在Cordis卸载时调用的disposer。 | 本Ticket创建`src/host/tools/register-project-tools.ts`。该文件是产品代码中唯一直接调用`ctx.tools.register()`的位置。本Ticket完成时`src/host/plugin.ts`是唯一调用者；附加Ticket 15把唯一调用者迁入`src/agent/plugin.ts`并删除Host root调用。registry验证非空且唯一的名称、非空description和闭合输入/输出schema，按稳定顺序注册，任一失败时反向注销本次已注册Tool，当前调用plugin卸载时反向注销全部项目Tool。后续Ticket只使用`defineTool()`构造定义并交给该registry。 |
| Generation Tool与Tool UI | `@deepseek-ai/dsh-tools`公开`defineTool()`、`ToolRunContext.callId`与`defineTool().output.presentationMeta()`；结构化元数据持久到公开`ToolResultNode.meta`，公开`ConversationSnapshot`投影Skill Invocation、Tool Call与settled Tool Result。 | Ticket 04用`defineTool()`构造`generate_with_comfyui`并交给统一`registerProjectTools()`，使用`exec.callId`建立`call_id`到`run_id`的持久映射，并把`harness-comfyui-generation-run` v1与`run_id`写入Tool Result meta。项目Workbench从公开Tool projection识别链接，中列Tool行和右列卡片从同一Client Run投影Store读取异步状态。 |
| 进程内异步任务 | `@deepseek-ai/dsh-jobs` 公开 `ctx.jobs.start/list/get/read/kill/wait`、`onJobDone`、`onJobsChanged` 和 `attachController`；`@deepseek-ai/dsh-base` 已组合 `@deepseek-ai/dsh-jobs-local`。 | Host 可以复用 `ctx.jobs` 承担当前进程内的 Agent 等待和完成通知；当前项目的持久 Run Repository 仍然是 Generation Run 状态、Workflow 和 Saved Media 的唯一权威来源。Host 重启恢复不能依赖 `ctx.jobs` 内存状态。 |
| Workspace 与 Tool 关联 | `@deepseek-ai/dsh-workspace` 根 export公开 `ctx.workspaceRegistry.list()`；`ToolRunContext.agent.id` 是 Session ID，`agent.session.events` 公开含数字 `turn` 与 `callId` 的原生 `tool/call` event。 | Generation Tool使用 `exec.callId` 查找唯一 `tool/call` 的数字 `turn`，并用 `ctx.workspaceRegistry.list().find(workspace => workspace.sessionIds.includes(exec.agent.id))` 取得 Workspace。模型参数不得包含这些宿主身份。 |
| Host 同源文件路由 | `@deepseek-ai/dsh-host-webserver` 根 export公开 `ctx.webServer.register({ kind: "exact" | "prefix", path, handler })`；已注册 route在 SPA fallback前匹配。 | 项目只注册媒体与 Actual Workflow prefix route；route只接受 `media_id`/`run_id`，在 Host内解析路径与授权。浏览器不得取得本地路径、ComfyUI URL、Authorization或 API Workflow JSON。 |
| Run Refresh Polling | rc.8 `@deepseek-ai/dsh-api-remotes` 的 public forwarded-event allowlist不含项目 Run事件；增加 `generation.run.changed` 需要修改 Harness assembly。 | 项目不发送自定义 forwarded event。Client遇到合法Generation Tool Result、打开右列、切换Session/数字`turn`或取消后立即调用项目unary Remote；页面可见，且中列Tool行或右列卡片引用非终态Run时，唯一协调器按`refreshAfterMs`继续查询。两处同时可见时不重复轮询。 |
| Skill discovery与选择 | Ticket 15交付的项目Preset挂载`@deepseek-ai/dsh-skill-filesystem`与`@deepseek-ai/dsh-tool-skill`；provider设置`includeDefaultRoots: false`并只读取当前release的`package/skills`。上游ConversationRoot声明并渲染`conversation.input.overlay`，`ui-input-trigger`与`ui-skill`在该overlay显示当前Session可调用Skill并插入普通`/skill-name `文本；Host `dsh-tool-skill`在执行前重新发现并校验。 | Ticket 04把`skills/comfyui-generate/`放入tarball；Ticket 12把两个Prompt Skill和`skills/lora-adjustment/`放入同一tarball。项目保留ConversationRoot，并在项目`conversation.composer.bar` occupant中渲染原生overlay；项目不调用SkillsApi实现第二套菜单，不保存Skill选择状态，也不把项目Skill复制到`DSH_HOME/skills`。 |

### 已定义的目录、入口和配置

计划执行者必须实际创建并使用下列文件；计划执行者不得创建没有实现或测试引用的空目录和占位文件：

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
.gitignore
.node-version
cordis.patch.yml
profiles/comfyui-workbench/package.json
profiles/comfyui-workbench/cordis.patch.yml
profiles/comfyui-workbench/pnpm-workspace.yaml
config/schema.ts
config/base.json
config/profiles/development.json
config/profiles/test.json
config/profiles/release-smoke.json
config/profiles/production.json
config/environment-overrides.json
config/media-policy.json
config/comfyui-output-descriptors.json
config/error-catalog.json
deployment/runtime/package.json
deployment/runtime/pnpm-lock.yaml
deployment/runtime/pnpm-workspace.yaml
src/index.ts
src/invariant.ts
src/host/plugin.ts
src/host/tools/register-project-tools.ts
src/client/index.tsx
src/client/plugin.tsx
src/client/styles.css
src/config/load-profile.ts
src/contract/plugin-status.ts
src/service/plugin-status.ts
src/testing/profile-fixture.ts
tests/unit/
tests/contract/
tests/integration/
tests/composition/
tests/e2e/
tests/release-smoke/
tests/deploy/
scripts/profile/materialize.mjs
scripts/profile/start.mjs
scripts/build/tsdown-client-bundle.ts
scripts/security/check-manifest-lock.mjs
scripts/security/audit-lockfile.mjs
scripts/security/check-build-scripts.mjs
scripts/release/pack.mjs
scripts/release/validate-package.mjs
scripts/release/dry-run.mjs
scripts/release/smoke.mjs
scripts/release/sync-runtime-manifest.mjs
scripts/deploy/cli.mjs
scripts/deploy/contracts.mjs
scripts/deploy/install.mjs
scripts/deploy/preflight.mjs
scripts/deploy/activate.mjs
scripts/deploy/health.mjs
scripts/deploy/rollback.mjs
scripts/deploy/start.mjs
scripts/deploy/stop.mjs
scripts/deploy/restart.mjs
scripts/deploy/status.mjs
scripts/deploy/logs.mjs
scripts/deploy/upgrade.mjs
docs/operations/install-and-run.md
.github/workflows/ci.yml
.github/workflows/release.yml
.github/workflows/deploy.yml
```

`config/schema.ts`必须是development、test、release-smoke和production四个Configuration Profile的唯一结构与校验来源。该schema必须定义`paths.dataDir`、`paths.runRepositoryFile`、`paths.runDirectory`、`paths.savedMediaDirectory`、`paths.logDirectory`、`comfyui.defaultInstanceId`、`source.catalogCliPath`、`source.sourceCliPath`、固定值`source.contractId: "imagegen-source-contract"`、固定值`source.sourceReleaseVersion: "0.82.2"`、`jobs.pollIntervalMs`、`jobs.missingObservationMs`、`client.runRefreshIntervalMs`、`server.host`、`server.port`和`process.shutdownTimeoutMs`；`client.runRefreshIntervalMs`必须是正整数且四个Profile的默认值固定为`1000`。该schema不得保存任何运行值，也不得定义ComfyUI Instance Authorization字段。

`src/config/load-profile.ts` 必须只按 `config/base.json` → `config/profiles/<profile>.json` → `config/environment-overrides.json` 已列出的环境变量映射执行覆盖。`environment-overrides.json` 必须只包含以下映射：`HARNESS_COMFYUI_DATA_DIR` → `paths.dataDir`、`HARNESS_COMFYUI_RUN_REPOSITORY_FILE` → `paths.runRepositoryFile`、`HARNESS_COMFYUI_RUN_DIRECTORY` → `paths.runDirectory`、`HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY` → `paths.savedMediaDirectory`、`HARNESS_COMFYUI_LOG_DIRECTORY` → `paths.logDirectory`、`HARNESS_COMFYUI_DEFAULT_INSTANCE_ID` → `comfyui.defaultInstanceId`、`HARNESS_COMFYUI_CATALOG_CLI_PATH` → `source.catalogCliPath`、`HARNESS_COMFYUI_SOURCE_CLI_PATH` → `source.sourceCliPath`、`HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS` → `client.runRefreshIntervalMs`、`HARNESS_COMFYUI_SERVER_HOST` → `server.host`、`HARNESS_COMFYUI_SERVER_PORT` → `server.port`。`development.json`、`test.json`、`release-smoke.json` 与 `production.json` 都不得保存具体运行目录；调用者必须通过前述固定映射提供数据、Run、Saved Media 和日志目录。Tickets 01–13 的完整产品运行只使用各自 worktree 的 `runtime/production/` installation 和 `production` Profile；development、test 与 release-smoke 只用于对应的源码级或自动化技术测试。loader 必须拒绝未知字段、缺少必填值、非法 profile 名和未列入 `environment-overrides.json` 的覆盖，并在错误中明确返回 profile 名、配置文件路径和失败属性。

`scripts/deploy/cli.mjs`必须是`installation.json`到Host配置环境的唯一转换器。每次start、restart、upgrade或rollback启动Host前，CLI必须忽略进程外已经存在的全部`HARNESS_COMFYUI_*`值，并从已经通过schema校验的installation生成以下环境：`configurationProfile`→`HARNESS_COMFYUI_CONFIGURATION_PROFILE`、`paths.dataDir`→`HARNESS_COMFYUI_DATA_DIR`、`paths.runRepositoryFile`→`HARNESS_COMFYUI_RUN_REPOSITORY_FILE`、`paths.runDirectory`→`HARNESS_COMFYUI_RUN_DIRECTORY`、`paths.savedMediaDirectory`→`HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY`、`paths.logDirectory`→`HARNESS_COMFYUI_LOG_DIRECTORY`、`comfyui.defaultInstanceId`→`HARNESS_COMFYUI_DEFAULT_INSTANCE_ID`、`source.catalogCliPath`→`HARNESS_COMFYUI_CATALOG_CLI_PATH`、`source.sourceCliPath`→`HARNESS_COMFYUI_SOURCE_CLI_PATH`、`client.runRefreshIntervalMs`→`HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS`、`host`→`HARNESS_COMFYUI_SERVER_HOST`、`port`→`HARNESS_COMFYUI_SERVER_PORT`。`paths.dataDir`、`paths.runDirectory`、`paths.savedMediaDirectory`和`paths.logDirectory`必须分别等于该installation root下的`shared/data`、`shared/runs`、`shared/saved-media`和`shared/logs`；`paths.runRepositoryFile`必须位于`shared/data`内。`source.contractId`与`source.sourceReleaseVersion`只用于preflight读取 v0.82.2 结构化合同，分别执行两个CLI的`--discovery-json`并校验 Catalog 裸 OpenAPI 与 Source 成功 envelope，不创建第二套环境覆盖。

Harness Host plugin 的 Cordis `Config` 只包含 `configurationProfile`，允许值固定为 `development`、`test`、`release-smoke` 和 `production`。根 `cordis.patch.yml` 必须从 `HARNESS_COMFYUI_CONFIGURATION_PROFILE` 读取该值，`scripts/profile/start.mjs` 必须为每次启动明确设置该变量，再由 `src/config/load-profile.ts` 加载对应 JSON。不存在该变量或值不在四个名称内时，Host plugin 必须在注册 Tool、Remote 或 worker 前失败。

`src/contract/plugin-status.ts` 必须定义本工程基线唯一的健康投影 `PluginStatus`，字段固定为 `packageName`、`packageVersion`、`configurationProfile`、`hostLoaded`。`src/service/plugin-status.ts` 必须通过 `TypertRemoteService` 与 `@Remote("get")` 提供 `ctx.remote.pluginStatus.get()`，并只返回 `packageName: "harness-comfyui"`、当前 `package.json` version、实际加载的 Configuration Profile 名和 `hostLoaded: true`；该投影不得返回路径、环境变量或凭据。`src/testing/profile-fixture.ts` 必须统一创建 composition、e2e 与 release-smoke 的隔离 DSH_HOME、受管 Host 生命周期和清理断言。Ticket 01 的浏览器 e2e 必须同时用 `ctx.remote.pluginStatus.get()` 证明 Host remote 与 Client contribution 已加载。

Tickets 01 至 14 当前没有任何 Host Runtime Credential 消费者，因此本版本的必需 Host Runtime Credential 集合固定为空，schema、profile、`environment-overrides.json` 和版本发布 workflow 都不得创建无消费者的 credential 字段或环境变量。ComfyUI Instance Authorization 只能由 Source Operation 返回并在 Host 进程内使用。若后续独立规格增加 Host Runtime Credential 消费者，该规格必须同时定义唯一 secret 名称、消费模块、缺失错误和日志脱敏；该变更不属于本 Ticket。

一个 Harness composition profile 与四个 Configuration Profile 是两个不同对象：`profiles/comfyui-workbench/` 决定 Harness 加载哪些 bundle，`config/profiles/*.json` 决定本项目 Host plugin 使用哪些非敏感值。当前仓库的自动化测试可以加载全部四个 Configuration Profile；计划执行者不得把这两类 profile 合并。

`.gitignore` 必须增加 `runtime/`、`lib/` 和 `.release/`，分别排除 worktree Product Installation、构建产物和 release dry-run 产物。自动化测试的 Harness/profile 临时数据必须写入测试创建并负责清理的临时目录。计划执行者不得把运行数据、构建产物、Product Installation 或 release-smoke 安装目录提交到仓库。

### 已锁定的技术栈与依赖安全结论

`package.json` 的 `engines.node` 必须继续声明兼容范围 `^22.19.0 || >=24.0.0`，`.node-version` 必须把本仓库开发、CI、release build、release-smoke 和产品生命周期测试的唯一 Node runtime 固定为 `22.19.0`；三个 GitHub Actions workflow 必须通过 `.node-version` 读取该版本，不能各自再写 Node 版本。`package.json` 必须作为包名与精确 package 版本的唯一来源，并继续锁定 `pnpm@11.7.0`、`@deepseek-ai/cordis@4.0.1`、`react@18.3.1`、`react-dom@18.3.1`、`@deepseek-ai/schemastery@3.18.1`、`typescript@6.0.3`、`tsdown@0.22.2`、`vitest@4.1.8`、`@types/node@22.20.0` 和 `@types/react@18.3.31`。

当前项目必须使用主工作树已经安装的精确版本`@deepseek-ai/dsh@0.1.0-rc.8`作为CLI/profile host，并把当前项目源码direct imports或`dsh.client.inject`使用的以下Harness API package全部锁定为`0.1.0-rc.8`：`@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-client-connection`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-input-trigger`、`@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-theme`、`@deepseek-ai/dsh-host-webserver`、`@deepseek-ai/dsh-invariants`、`@deepseek-ai/dsh-jobs`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-typert-protocol`和`@deepseek-ai/dsh-workspace`。Ticket 02必须把`@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8`加入直接devDependency与peerDependency，并加入`dsh.client.inject`；项目不得直接依赖`@deepseek-ai/dsh-client-ui-sidebar`或`@deepseek-ai/dsh-client-ui-tool`。`@deepseek-ai/dsh-client-ui-input-trigger/client`、`@deepseek-ai/dsh-client-ui-layout/client`和`@deepseek-ai/dsh-client-ui-theme/client`只允许type-only import。构建工具必须把`@deepseek-ai/dsh-typert-generator@0.1.0-rc.8`锁定为直接devDependency，并通过其`./tsdown` export生成remote artifacts。`@deepseek-ai/dsh-base@0.1.0-rc.8`与`@deepseek-ai/dsh-web-app@0.1.0-rc.8`继续作为composition bundle。代码没有直接导入或inject的Harness package必须由base/web-app依赖闭包提供，不能在`package.json`中重复声明。

为保持 Cordis、Harness service、React 和 Client platform module 的单一 runtime identity，`@deepseek-ai/cordis`、React、React DOM 和上述源码直接导入的 `@deepseek-ai/dsh-*` API package 必须同时写入精确版本 `peerDependencies` 与开发期 `devDependencies`；profile 的 `autoInstallPeers: false` 必须让运行时从 installation-local `@deepseek-ai/dsh@0.1.0-rc.8` 解析这些 peer。仓库根 `package.json` 中的 `@deepseek-ai/dsh`、base bundle、web-app bundle、`@deepseek-ai/dsh-typert-generator`、TypeScript、tsdown、Vitest 和 `@types/*` 只写入 `devDependencies`；`deployment/runtime/package.json` 必须另外把 `@deepseek-ai/dsh`、base bundle和 web-app bundle声明为精确 `dependencies`，并由 `deployment/runtime/pnpm-lock.yaml` 固定完整安装闭包。`@deepseek-ai/schemastery@3.18.1` 是当前插件包唯一普通 `dependencies` package。发布 tarball 的 profile 不得再安装另一份 Cordis、Harness runtime 或 React。

`@deepseek-ai/dsh@0.1.0-rc.8` 的 registry integrity 已确认为 `sha512-VQU5NlomrKLRgcXuOf+sxWFvqxPA8q9vMhrKPlPPXiOJEhGlGlAdiyxZvZxkCVI+v0zbhe21cY3/luLyxpSzzA==`，该 package 没有 lifecycle script。当前 lockfile 的完整依赖闭包与运行时依赖闭包均为 0 advisory；`pnpm-workspace.yaml` 已包含 7 个精确漏洞范围 override 和 5 个精确 lifecycle `allowBuilds`。计划执行者必须先使用 `--lockfile-only --ignore-scripts` 把上述依赖写入 lockfile，再重新执行完整依赖审计、运行时依赖审计和 build-script gate；三项门禁通过后才能执行 frozen install。计划执行者不得删除现有 override，不得扩大 `allowBuilds`，也不得安装计划外依赖。

Host 服务必须使用 Node 内置 `fetch`、`node:sqlite`、`node:fs`、`node:crypto` 和 Web Streams。Ticket 01 不增加第三方数据库、HTTP、队列、媒体或 CSS runtime package。

### 必须实际落地的命令、测试和 CI/CD

`profiles/comfyui-workbench/package.json` 模板必须使用 `name: "dsh-profile-comfyui-workbench"`、`private: true`、空 `dependencies`，并按 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`harness-comfyui` 的顺序写入 `dsh.profile.bundles`。`profiles/comfyui-workbench/pnpm-workspace.yaml` 必须固定 `packages: [.]`、`nodeLinker: hoisted` 和 `autoInstallPeers: false`。

`scripts/profile/materialize.mjs` 必须接收 `--configuration`、`--dsh-home`、`--package-spec`、`--dsh-executable` 和 `--pnpm-executable`，把上述三个 profile 模板文件复制到 `<dsh-home>/profiles/comfyui-workbench/`，然后以前台子进程执行 `<dsh-executable> plugin --profile comfyui-workbench add <package-spec>`；该子进程环境必须明确设置 `DSH_HOME=<dsh-home>`，并把 `<pnpm-executable>` 所在目录放在 PATH 首位，因为 rc.8 的 plugin 子命令会从 PATH 调用 `pnpm` 且不提供 `--dsh-home` CLI flag。development 的 `<dsh-executable>` 固定为当前 worktree 的 `node_modules/.bin/dsh`；tarball install、composition、e2e 与 release-smoke 固定为目标版本 `<root>/releases/<version>/harness-runtime/node_modules/.bin/dsh`。development 的 `<package-spec>` 固定为当前 worktree 绝对路径，其他路径固定为本次构建产生的绝对 `.tgz` 路径。脚本必须断言 materialized profile 的 `dependencies.harness-comfyui` 已存在、`dsh.profile.bundles` 顺序没有变化，并确认默认 DSH home 的 profile manifest 没有被创建或修改。

`scripts/profile/start.mjs` 必须接收 `--dsh-executable`、`--dsh-home`、`--host` 和 `--port` 以及产品 CLI 生成的固定 Host 环境，以前台子进程执行 `<dsh-executable> --profile comfyui-workbench --host <host> --port <port>`；该脚本必须转发 SIGINT/SIGTERM 和退出码，不得创建后台进程。`scripts/deploy/cli.mjs` 是调用 profile materialize/start、维护 installation state、进程、health、日志与版本切换的唯一程序；Tickets 02–13 的 worktree 都直接调用该 CLI。成功的 restart、upgrade 和 rollback 命令必须持续拥有切换后的唯一 Harness 前台子进程，直到另一个终端通过同一 installation 的 stop 结束该进程；`process.json` 必须保存该 Host PID、active release、CLI operation ID、启动时间、host 与 port。三条切换路径不得创建 detached Host、隐藏后台进程或第二个 PID state。

`package.json`还必须提供`check:harness-boundary`、`check:manifest-lock`、`security:advisories`、`security:build-scripts`、`typecheck`、`test:unit`、`test:contract`、`test:integration`、`test:composition`、`test:e2e`、`test:deploy`、`test:prototype`、`build`、`package:pack`、`package:validate`、`quality`、`release:dry-run`、`release:smoke`，以及十个`deploy:*` lifecycle scripts。`check:harness-boundary`必须直接检查package manifest、lockfile、Cordis YAML与TypeScript import specifier，并拒绝source import与Harness package patch/fork/alias/Loader hook。自定义forwarded event注册与Harness DOM查询、移动或monkey patch由独立代码审核者检查，并由tarball-only composition与E2E证明项目UI只通过公开plugin composition挂载。`check:manifest-lock`必须验证root manifest、runtime manifest、root lock与runtime lock中的三项Harness版本完全一致，并验证root/runtime两份workspace的override、`strictDepBuilds`和`allowBuilds`完全一致；`security:advisories`必须分别审计两份lock；`security:build-scripts`必须分别验证两份workspace与两份lock。任一漂移必须在frozen install前失败。`package:pack`必须调用`scripts/release/pack.mjs`，只把本次`build`的产物pack到`.release/quality/`，并把tarball绝对路径、package version、commit和SHA-256写入`.release/quality/artifact.json`；`package:validate`、`test:deploy`、`test:composition`、`test:e2e`与`release:smoke`必须读取该同一artifact manifest，不能分别build或pack。`quality`必须按以下固定顺序调用仓库脚本，并在任一步失败时立即返回非零状态：

1. `check:harness-boundary`、`check:manifest-lock`、`security:advisories`、`security:build-scripts`；
2. `typecheck`；
3. `test:unit`、`test:contract`、`test:integration`、`test:prototype`；
4. `build`、`package:pack`、`package:validate`；
5. `test:deploy`、`test:composition`、`test:e2e`、`release:smoke`。

自动化测试必须使用下列固定职责：

- `tests/unit/` 验证 profile 合并、配置错误、Client factory wrapper、CSS 单次注入、纯构建helper，以及`registerProjectTools()`稳定注册顺序、重复名称失败、部分注册失败反向清理和Host卸载反向清理。
- `tests/contract/` 验证四个 Configuration Profile、根 package exports、`dsh.bundle`、`dsh.client`、Harness composition profile bundle 顺序和发布包 allowlist。
- `tests/integration/` 使用 Cordis 与 `test` Configuration Profile 加载真实 `src/host/plugin.ts`，并确认 Host Config 被 schema 验证。
- `tests/deploy/` 必须从 tarball 暴露的 `bin.harness-comfyui` 执行十个 lifecycle 子命令，覆盖首次安装、重复启动拒绝、stale PID、PID reuse、status、完整 health 结构、stdout/stderr/operations 日志、正常 restart、正常 upgrade、候选启动失败、候选 health 失败、自动恢复和显式 rollback；测试不得直接导入或调用 profile helper 来绕过产品 CLI。tarball-only 场景必须在不包含仓库 `node_modules`、源码 checkout 或全局 `dsh` 的临时目录中，仅保留 tarball、installation JSON、Node 与预检确认的 `pnpm@11.7.0`，完成 install/start/status/health/logs/stop，并断言实际进程执行文件来自目标版本的 `harness-runtime/node_modules/.bin/dsh`。restart、upgrade 与 rollback 场景必须分别断言始终只有一个 Harness Host，切换命令持续拥有新的前台 Host，另一个终端执行 stop 后命令退出、PID state 清理且端口释放。
- `tests/composition/` 必须读取 `.release/quality/artifact.json` 指向的既有 tarball，通过该 tarball 的产品 CLI 在测试拥有的 installation 中执行 install/start/status/health/logs，等待 readiness 后确认精确 `@deepseek-ai/dsh@0.1.0-rc.8`、base bundle、web-app bundle、当前项目 Host Loader row 和 `lib/client.js` manifest，最后通过同一 CLI stop 并清理 installation。该测试不得重新 build、重新 pack、遗留子进程或引用 DeepSeek Harness 源码 checkout。
- `tests/e2e/` 必须读取同一 `.release/quality/artifact.json`，通过产品 CLI 在新的测试 installation 安装并以前台受管进程启动同一 tarball。测试等待 readiness 后打开真实 Harness web Host，确认原生 `AppFrame` 已渲染、Host/Client 连接可用且 `harness-comfyui` Client module 已加载，最后通过同一 CLI stop 并清理；该测试不得复用 composition 的进程、重新 build、重新 pack 或遗留监听端口。本 Ticket 不伪造 Ticket 02 尚未实现的产品界面。
- `tests/release-smoke/` 必须读取同一 `.release/quality/artifact.json`，只从 tarball 运行 `harness-comfyui` CLI，在第三个 installation 完成 install/start/status/health/logs/stop；测试不得直接调用源码 profile helper，不得重新 build、重新 pack、遗留子进程，也不得从 `src/`、`prototype/` 或开发 `node_modules` 读取运行代码。

`.github/workflows/ci.yml` 必须在 pull request 和 main push 上先调用仓库拥有的 manifest/lock、lockfile advisory 与 build-script 检查，再执行 frozen install 和 `pnpm quality`；该 workflow 不得请求发布流程不需要的 secret。`.github/workflows/release.yml` 必须接收显式 SemVer 与精确 main commit，复用同一 preinstall gate，并只调用一次 `quality`；`quality` 产生的 `.release/quality/artifact.json` 及其 tarball 已经完成 package allowlist、composition、e2e 与 release-smoke，release workflow 必须直接用该同一 artifact 输出 Release Preview，不能再次 build 或 pack。Ticket 01 的 release workflow 不创建 Git tag、不得推送版本且不得创建 GitHub Release。

当前 `.github/workflows/deploy.yml`、`scripts/deploy/{preflight,activate,health,rollback}.mjs`、`tests/deploy/deployment-scripts.test.ts` 和四个 `deploy:*` scripts 必须保留并扩展为前述真实产品管理程序、十个子命令和完整生命周期测试。测试必须在 Ticket 01 worktree 的 `runtime/production/` installation 与受控临时 installation 中执行 install、start、status、health、logs、restart、stop、upgrade 和 rollback；workflow 只运行这些程序测试，不连接或操作用户安装。

### 产品验收与父 Issue 一致性

开发者从 Ticket 01 worktree 删除既有 `lib/` 与 `.release/` 后，必须执行 preinstall gate、frozen install 和一次 `pnpm quality`；该命令必须按已定义顺序生成唯一 tarball，并让 package validation、deploy lifecycle、composition、e2e 和 release-smoke 消费 `.release/quality/artifact.json` 中同一 identity。`quality` 退出后不得存在 Harness 子进程或测试监听端口。随后开发者必须通过 `npm exec --yes --package=<tarball> -- harness-comfyui install` 把该 tarball 安装到 Ticket 01 worktree 的 `runtime/production/`，再只通过 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。浏览器打开该 installation 配置的地址后必须看到原生 `AppFrame`；stop 后 PID state 与端口必须清理。

独立审核者必须根据本Ticket“已完成调研的Harness集成规范”表中已冻结的package export、profile/bundle、Client factory、Remote、Tool和Jobs接口，检查实现导入和注册对象是否逐项一致。审核者不得重新调研public seam、重新选择Harness版本或设计替代接口。本Ticket只交付Client plugin骨架，不注册Ticket 02负责的项目`sidebar`、`details`和conversation occupants；审核者必须确认浏览器仍显示默认AppFrame与默认ConversationRoot内容，代码没有提前注册产品UI occupant，没有复制Harness Session、AgentLoop、Skill校验、Tool execution或Jobs状态，也没有把原型、测试fixture或来源checkout变成正式运行依赖。静态原型不能替代Host/Client composition、构建、测试或package smoke验收。

### 删除责任

本 Ticket 不删除现有产品文件、静态原型、ADR、配置或测试。计划执行者只能在已落地替代入口并通过相应测试后删除被本 Ticket 新建后又确认冗余的占位实现；最终提交不得包含空目录或未引用占位文件。

### 实现跨度

`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.gitignore`、`.node-version`、`cordis.patch.yml`、`profiles/comfyui-workbench/`、`deployment/runtime/`、`config/`、`src/index.ts`、`src/invariant.ts`、`src/host/`、`src/client/`、`src/config/`、`src/contract/plugin-status.ts`、`src/service/plugin-status.ts`、`src/testing/profile-fixture.ts`、`tests/`、`scripts/profile/`、`scripts/build/`、`scripts/security/`、`scripts/release/`、`scripts/deploy/`、`docs/operations/install-and-run.md` 和三个 `.github/workflows/` 文件。

### Blocked by

- None — can start immediately.

## Ticket 02 — 在真实 Harness Client 中实现原型 A 三列布局与普通聊天

### 产品目的

计划执行者必须在真实Harness Client中通过公开插件机制实现原型A的三列Workbench：左列显示Session搜索与Session列表，中列显示当前Session标题、消息列表、消息输入框和发送按钮，右列显示“当前轮次结果 / 本会话结果”两个标签及明确空态。本阶段必须同时接通Session切换、普通消息提交和Agent增量文本。

### 产品需求文档

- `docs/v0.1/PRDS/02-three-column-chat.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是`verified-public-plugin-seams`。主工作树实际安装的DeepSeek Harness `0.1.0-rc.8`允许后应用的bundle patch按Loader row id覆盖前层定义。项目bundle必须把`@deepseek-ai/dsh-web-app`提供的`ui-layout` row设置为`disabled: true`；`ui-layout`是上游随附UI插件，不是Harness Core。项目Client plugin必须向内建`root` slot注册唯一root occupant；该root必须声明并渲染标准`sidebar`、`conversation`、`details`与`shell.overlay`四个child slot，并在`1440×1000`固定使用`294px minmax(0, 1fr) 432px`。项目必须先注册并声明这些child slot，再通过公开Cordis service机制提供符合`ILayout`的`toggleSidebar()`、`openDetails()`与`closeDetails()`，使继续加载的上游`ui-conversation`、`ui-sidebar`和其他公开UI贡献在标准slot中挂载。项目不得同时运行第二个root。

本Ticket必须把`src/client/index.tsx`导出的Cordis service `inject`从Ticket 01的`["slots", "sessions", "remote"]`精确扩展为`["slots", "sessions", "remote", "theme", "inputTriggers"]`。该列表与`package.json.dsh.client.inject`的Client package依赖是两个不同合同。contract与composition测试必须读取实际module export，分别撤出五项service provider，证明项目Client plugin保持pending且不注册root、不写theme DOM状态、不挂载Remote、不连接Session或input trigger；provider恢复后plugin只激活一次。Ticket 16必须为公开`session.create`路径增加第六项`connection` service；其他Ticket不得增加Client service依赖。

`src/client/workbench/layout-contract.ts`必须成为桌面Shell尺寸与状态的唯一结构化来源，固定`sidebarOpenPx: 294`、`sidebarCollapsedPx: 56`、`detailsOpenPx: 432`与初始`sidebarOpen: true`、`detailsOpen: true`。项目实现的`ILayout.toggleSidebar()`必须在294与56之间切换，`openDetails()`必须把右列设为432，`closeDetails()`必须把右列设为0。root渲染`sidebar`时必须传入`{collapsed: width === 56, width}`，渲染`conversation`与`details`时必须传入空owner props，并把`shell.overlay`渲染在三个滚动列之外。Ticket 02不实现拖拽改宽、viewport监听、自动折叠或移动端断点。

项目必须继续加载`ui-conversation`、`ui-input-trigger`与`ui-skill`。rc.8 `ui-conversation`的ConversationRoot必须注册到项目root声明的`conversation` slot，继续提供标准conversation definitions、snapshot builder并声明、渲染`conversation.input.overlay`；rc.8 `ui-input-trigger`必须继续把原生MenuView注册到该overlay。项目通过`priority: -10`替换公开`sidebar`、`details`、`conversation.session.header`、`conversation.view`中`id: "chat"`的occupant和`conversation.composer.bar`；项目composer必须把owner传入的`overlay`渲染在原型composer card内，并使用公开`useInput`、`inputActions`和`ctx.inputTriggers.sessionOf(sessionScope)`连接textarea。用户输入`/`后，Harness原生MenuView显示Skill并插入普通`/<skill-name> `文本；项目不得调用SkillsApi或实现第二套Skill菜单。

停用`ui-layout`后，项目桌面Shell必须替代该随附插件原有的主题投影职责。项目初始化时必须调用公开`ctx.theme.getTheme()`取得`ThemeSnapshot`，并通过公开`ctx.on("theme/change", projectTheme)`持续接收快照；`projectTheme`把`active.colorScheme`写入`document.documentElement.style.colorScheme`和`document.body`的`data-ds-dark-theme`，把`active.tokens`逐项写入`document.body.style`。dispose时只清理本模块写入的attribute、style和token。该限定模块不得使用`querySelector`、移动上游DOM或改写Harness组件。普通正文通过一次`SessionFace.prompt(parts, 'queue')`提交；Ticket 03再增加ContextRef和图片part。

`@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8`已经存在于当前root/runtime lock的rc.8 Web App闭包，package没有preinstall、install或postinstall lifecycle script。Ticket 02把同一版本提升为直接devDependency与peerDependency时不得引入新package版本或扩大`allowBuilds`；变更后的root/runtime lock仍必须通过`check:manifest-lock`、`security:advisories`与`security:build-scripts`。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本。静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Harness Session/conversation 服务；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试。PRD 与父 Issue #1 只能补足原型未展示的要求；只有父 Issue #1 或用户后续决定明确标记的原型错误或缺口修正可以改变对应可见设计，并必须记录原型元素、替代设计、决定来源和验收证据。

本 Ticket 必须创建唯一 `tests/visual/prototype-fidelity-viewports.json`，精确包含一个桌面viewport：`1440×1000`。本 Ticket的每个可见原型区域必须保存该尺寸的成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

原型 A 的完整三列骨架；左列“搜索会话”和三个 Session 行；中列 Session 标题、普通消息、Agent 流式文本、消息输入框与发送按钮；右列两个结果标签、“当前会话还没有生成运行”和“此轮对话没有创建 ComfyUI 运行”空态。

### 真实产品验收

浏览器用户通过本 Ticket worktree 的 `runtime/production/bin/harness-comfyui` 启动真实 Host/Client，在“搜索会话”输入匹配词后只看到匹配 Session，清空搜索词后恢复全部 Session。用户选择一个 Session，发送一条不要求生成媒体的普通消息，看到 Agent 增量文本；该聊天轮次显示“无 ComfyUI 运行”，右列不借用其他聊天轮次的运行卡片。用户点击“当前轮次结果”和“本会话结果”时分别看到对应空态及正确选中态；用户切换 Session 后，中列标题、消息和右列 Session 结果同时切换。

### 原型与父 Issue 一致性验收

真实产品必须在`1440×1000`复现原型 A 的桌面Header内容，并以`294px minmax(0, 1fr) 432px`呈现左列、中列和右列；panel背景与边界、Session行与选中态、消息气泡、轮次标题、输入区、结果标签和空态样式必须与原型一致。composition测试必须证明`ui-layout` Loader row已经停用、项目root是唯一root、项目root声明并渲染四个rc.8标准child slot、ConversationRoot与原生`conversation.input.overlay`仍在实际挂载链、`/` Skill菜单能够完成选择。原型没有展示的Harness bundle启动、Configuration Profile、Session授权和错误分支必须按父Issue #1的具体规范验收。

### 实现跨度

当前仓库拥有的 Harness bundle、Host plugin、Client plugin、Configuration Profile、原生 Session 读取、原生消息提交、流式 conversation 和三列 composition。

### Blocked by

- Ticket 01 — 交付可安装、可启动、可检查和可回滚的 Harness 产品基线（GitHub Issue #2 已完成）。
- Ticket 15 — 交付`harness-comfyui` Agent Preset与作用域化Tool/Skill。

## Ticket 03 — 为一条消息选择 Workflow 模板与角色上下文并原子发送

### v0.82.2 数据源消费状态

源数据前置不再等待新版本：`v0.82.2` 已发布，三个本 Ticket operation 的真实 CLI 查询可用。Ticket 03 只消费 `config/source-contract-v0.82.2.json` 定义的 Catalog raw-passthrough envelope；旧的 discovery identity wrapper、CLI 业务 Schema 校验和“源版本未发布”表述不再生效。CLI 退出码为0但 envelope或业务字段不符合合同，返回 `SOURCE_PROTOCOL_ERROR` 并阻止候选与发送。

### 产品目的

计划执行者必须在真实产品的中列消息输入区实现“本次消息上下文”条、上下文 chip 和“添加上下文”Modal。本阶段只接通底模筛选、Workflow 模板候选和角色候选；Modal 中央候选区必须使用每页六项、三列两行、`150 × 160` 固定尺寸的卡片，并显示真实封面或统一占位符。计划执行者必须把正文与所选引用通过一次消息提交写入 Harness Session。

### 产品需求文档

- `docs/v0.1/PRDS/03-message-context-core.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是`verified-public-plugin-seams`。本Ticket扩展Ticket 02注册到公开`conversation.composer.bar`的项目occupant，按照原型顺序渲染上下文标题、数量、chip、添加按钮、textarea、图片preview、发送提示和发送按钮。Modal使用Harness `Modal`；Client只通过项目生成的`harness-comfyui/remote`和公开`ctx.remote.$mount()`查询真实Catalog。

每个确认后的chip只保存`{ kind, id, label }`。Modal中的`pendingDialogRefs`只保存未确认选择；用户确认多个卡片后，Client一次性按原型顺序把它们加入当前Session的临时`ContextRef[]`并关闭Modal。发送时项目Context resolver按chip顺序解析真实Catalog快照并生成固定`generation-context.v1` blocks，把正文和blocks放入一个text `PromptContentPart`，把每个浏览器File编码为公开image `PromptContentPart`，然后只调用一次当前Session的`SessionFace.prompt(parts, 'queue')`。

解析、编码或调用失败时不得产生部分消息，并保留正文、chip、File与preview；成功时只清除本次捕获的发送快照并回收对应object URL。Harness Host attachment store与原生`user/message`保存已发送内容。Ticket 02项目Workbench user-message renderer按固定schema重放正文与折叠快照。项目不得导入Harness输入状态内部文件或创建第二套Session日志。

本Ticket必须创建`src/host/tools/catalog-tool-manifest.ts`、`src/host/tools/create-catalog-tool.ts`和`src/catalog/structured-cli-generation-catalog.ts`，并通过Ticket 01唯一`registerProjectTools()`一次性注册`query_semantic_base_models`、`query_semantic_comfyui_templates`和`query_semantic_characters`。三项固定映射依次为`querySemanticBaseModelsForSkill`/`/internal/semantic/base-models`/无筛选、`querySemanticComfyuiTemplatesForSkill`/`/internal/semantic/comfyui-templates`/`base_model_id`、`querySemanticCharactersForSkill`/`/internal/semantic/characters`/`work_id`。`catalog-tool-manifest.ts`是当前仓库Tool名称、description、operationId、path、kind、允许模式和筛选的唯一结构化来源。

三项Tool description固定为：`query_semantic_base_models`使用`Search or resolve safe semantic base-model records for generation catalog filtering.`；`query_semantic_comfyui_templates`使用`Search or resolve safe ComfyUI template summaries and visible runtime parameter definitions.`；`query_semantic_characters`使用`Search or resolve semantic character records, optionally restricted to one work.`。当前仓库必须原样使用已发布OpenAPI的description并在启动时核对，不得另写近义文案。

每个Tool只接受一个闭合`{mode:"search",query?,page?,page_size?,<允许筛选>?}`或`{mode:"resolve",id}`对象；一次Tool Call只表达一个查询目标。`StructuredCliGenerationCatalog`只从Installation的`source.catalogCliPath`取得绝对可执行路径。Host启动先执行`imagegen-semantic-query --discovery-json`并要求 v0.82.2 Catalog 裸 OpenAPI 3.1对象，再执行`config/source-contract-v0.82.2.json` manifest核对；每次Tool调用执行已配置 CLI 的 manifest operation 参数。Skill、Agent、浏览器和Tool参数都不能传入CLI路径、operationId、HTTP path或宿主身份。取消Tool必须终止前台CLI子进程；非零退出、空stdout、多JSON值、schema错误或 discovery shape/operation metadata 漂移必须失败，不能读取原型数组或静默改用旧合同。

### 外部数据源前置条件

本Ticket不得修改数据源仓库。数据源仓库必须先按`docs/v0.1/source-data-catalog-implementation.md`使用自己的Issue、分支、测试和版本发布流程，发布包含上述三个Catalog operation、`x-harness-tool-name`、非空description、闭合schema和结构化CLI的受支持版本。本Ticket只消费Installation配置指向的已发布CLI；尚未提供该版本、commit/tag、contract version和release acceptance时，本Ticket保持阻塞，计划执行者不得在当前仓库复制数据源OpenAPI、handler或CLI。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本Ticket PRD指定的真实Catalog、Source、Harness Session和项目Context resolver路径；原型静态数据或fixture不得替代。受控fixture只允许确定性自动化技术测试。PRD与父Issue #1只能补足原型未展示的要求；只有父Issue #1或用户后续决定明确标记的原型错误或缺口修正可以改变对应可见设计，并必须记录原型元素、替代设计、决定来源和验收证据。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

“添加本次消息上下文”Modal、底模筛选、“Workflow 模板”和“角色”候选、上下文 chip、已发送消息中的不可变上下文折叠块，以及“上下文查询错误”。

### 真实产品验收

浏览器用户选择底模筛选条件，在三列固定卡片中查看真实封面与无封面占位、进入第二页并返回，随后选择一个Workflow模板和一个角色，在消息输入框上方看到两个chip，然后添加一张真实图片附件并用一次发送动作提交正文、两个上下文和附件。发送成功后chip与本次File清空，已发送用户消息保留不可变快照与Harness Host保存的图片；底模筛选值不进入chip或快照。引用、图片编码或`SessionFace.prompt(parts, 'queue')`失败时，页面不产生部分消息并保留File、preview、正文与全部chip；用户重新查询成功后能够完成同一发送动作。用户删除附件或发送成功时，项目回收对应object URL。

### 原型与父 Issue 一致性验收

真实产品必须复现原型中列的上下文条、chip尺寸与删除按钮、居中上下文Modal、底模筛选、资源种类列、三列多行固定卡片、`150 × 88`封面区、实际封面、统一占位符、每页六项分页、候选详情和底部确认区的布局、样式与交互；选择、跨页保留选择、删除、取消、确认、查询失败和重新查询后的可见结果必须一致。原型没有展示的Catalog contract、Context resolver、原子Session写入和数据源错误分支必须按父Issue #1的具体规范验收。

### 实现跨度

当前仓库`catalog-tool-manifest.ts`、Catalog CLI adapter、三个Harness Tool、项目Catalog Remote、唯一Message Context Resource Registry、项目Context resolver、Client Modal、chip与Session replay renderer。数据源OpenAPI、handler、CLI和版本发布由外部实施文档负责，不在本Ticket实现跨度内。

### Blocked by

- Ticket 02 — 在真实 Harness Client 中实现原型 A 三列布局与普通聊天。
- Ticket 16 — 只创建并打开`harness-comfyui` Preset Session。

## Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow

### v0.82.2 数据源消费状态

源数据 `InstanceSource` 与 TemplateBundle CLI 已在 `v0.82.2` 可读取。Ticket 04 必须消费 Source 分页 envelope 并按结构化合同映射 `results[0]`；不得要求旧 wrapper 或直接 Source response。TemplateBundle 的 `expected_output_node_ids_json` 为 `null`、空数组、缺失或非法值时返回 `SOURCE_TEMPLATE_UNAVAILABLE`，不得进入 `/prompt`。

### 产品目的

计划执行者必须在真实产品中接通第一条完整图片生成路径：用户在中列项目输入框输入`/`并从Harness原生Skill菜单选择`comfyui-generate`；Agent显示`generate_with_comfyui` Tool Call、“正在创建 ComfyUI 运行”、后续异步状态摘要与“定位结果”。右列“当前轮次结果”通过合法Tool Result meta取得同一个`run_id`，显示同一Store快照的一项图片运行，并提供“下载本次 Workflow JSON（可导入 ComfyUI）”。

### 产品需求文档

- `docs/v0.1/PRDS/04-single-image-generation.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死 Skill、Tool、Tool行、Run、Jobs与下载接口；本 Ticket执行者不负责继续调查 Harness seam或设计替代 Tool呈现。

Release Artifact必须把`skills/comfyui-generate/`保存在每个release自己的`package/skills/comfyui-generate/`。Ticket 15交付的项目Preset必须设置`includeDefaultRoots: false`并只从`HARNESS_COMFYUI_SKILL_DIR`发现Skill；Harness原生`/` Skill菜单必须显示它并把选择结果写成普通`/comfyui-generate `文本，Host在执行前重新校验。本Ticket不得实现第二套Skill菜单、选择状态、provider或invocation policy。

`comfyui-generate`与Prompt Skill、LoRA调整Skill处于同一Harness Skill层。用户必须显式选择`/comfyui-generate`；该Skill不得自动调用另一个Skill。它从当前消息读取唯一Workflow模板快照、具体画面要求、可选`generation-route.v1`和用户明确引用的先前Prompt或LoRA调整结果。存在多个Prompt候选而用户没有指明、缺少模板、缺少正向Prompt或模板参数摘要不完整时，Skill必须在中列指出具体缺口并且不得调用Generation Tool。

模板安全摘要的每项参数固定包含`parameter_id`、`kind`、`value_type`、`default_value`、`required`与`visible`，可生成模板必须恰好声明一个`kind: positive_prompt`。Skill只按模板声明的`parameter_id`写入Prompt、宽度、高度、像素总量、CFG、seed和其他显式值；不得猜测节点ID、input name、widget index或未声明参数。当前消息包含LoRA快照时，Skill把用户明确引用的`lora-adjustment`结果转换为有序`lora_applications[]`，且每个稳定ID、顺序、权重和触发词必须与当前消息快照匹配；没有LoRA快照时该数组为空。

本Ticket使用`@deepseek-ai/dsh-tools`公开`defineTool()`构造`generate_with_comfyui`，再把定义交给Ticket 01唯一`registerProjectTools()`；本Ticket不得直接调用`ctx.tools.register()`或创建Generation专用registry。Tool description固定为`Create one durable ComfyUI Generation Run from one approved template, explicit runtime parameters, ordered LoRA applications, and an optional safe instance route; return the accepted run_id without waiting for remote completion.`。Tool输入固定为`title`、可选安全`instance_id`、`template_id`、模板声明的`parameters`和有序`lora_applications[]`；每个LoRA项只包含`source_lora_id`、`strength_model`、适用时的`strength_clip`与`applied_trigger_words`。Host先按`exec.callId`在`exec.agent.session.events`中唯一找到原生`tool/call`及其数字`turn`与`seq`，再唯一找到同一数字`turn`且位于Tool Call之前的最近`turn/start`，最后只扫描`turn/start.seq < event.seq < tool/call.seq`内的`user/message.source`。该范围必须包含`{ kind: "skill-invocation", name: "comfyui-generate", form: "instructions" }`；边界缺失、歧义或只在上一数字turn存在该Context时，Host返回`GENERATION_SKILL_INVOCATION_REQUIRED`并且不得创建Run、持久映射或调用`/prompt`。项目从`@deepseek-ai/dsh-workspace`的`ctx.workspaceRegistry.list()`取得Workspace；模型参数不得包含这些宿主身份。Host还必须拒绝LoRA项与当前消息不可变快照不匹配的调用。

项目只使用`@deepseek-ai/dsh-jobs`的`ctx.jobs`表示当前Agent的进程内等待，使用`@deepseek-ai/dsh-host-webserver`的`ctx.webServer.register()`提供同源Actual Workflow下载，并使用项目Typert Remote读取Run Repository。Harness原生Tool execution identity与`ui-conversation`标准projection必须保留；项目不得重写Tool execution pipeline或复制Tool identity。

用户显式选择`/comfyui-generate`后，Harness Host必须在当前数字`turn`持久写入`source: { kind: "skill-invocation", name: "comfyui-generate", form: "instructions" }`的原生Context消息。AgentLoop随后产生的`generate_with_comfyui` Tool Call和Tool Result使用同一`callId`；项目不注册第二套Skill或Tool事件。

`generate_with_comfyui`必须使用`defineTool()`的结构化输出：`output.schema`只接受必填字符串`run_id`的封闭对象，`output.render()`写入同一`{ "run_id": "..." }`，`output.presentationMeta()`写入`{ "contract_id": "harness-comfyui-generation-run", "contract_version": 1, "run_id": "..." }`。Harness把该meta持久到公开`ToolResultNode.meta`。公开`ToolResultNode.call`可能在配对Tool Call尚未进入当前history window时为`null`：`call !== null`时Client校验`call.name === "generate_with_comfyui"`、settled success与meta；`call === null`时Client使用公开`callId`、当前Session和meta `run_id`调用项目`GenerationRuns.resolveToolResultLink()`，由Host核对持久`(workspace_id, session_id, call_id) -> run_id`映射。映射失败时返回`GENERATION_RUN_LINK_INVALID`且不建立中列或右列链接。Client不得从Agent文本、Tool标题或Tool Result文字解析`run_id`。

本Ticket合同测试必须覆盖两个边界：上一数字turn存在`comfyui-generate` Invocation、当前turn没有Invocation但调用Tool时，Host返回`GENERATION_SKILL_INVOCATION_REQUIRED`且Run、映射与`/prompt`调用数都不增加；当前history window只有Tool Result且`call === null`、配对Tool Call位于更早分页时，Client通过`resolveToolResultLink()`恢复合法链接，并拒绝被篡改的Session、`call_id`或meta `run_id`。

### 外部数据源前置条件

本Ticket不得修改数据源仓库。数据源仓库已经发布 v0.82.2 的`getComfyuiInstanceSourceForHost`、`getComfyuiTemplateBundleForHost`、Source discovery和`imagegen-comfyui-source-read`。本Ticket只实现当前仓库`ComfyuiSourceCatalog`并消费Installation中`source.sourceCliPath`指向的已发布CLI；Host启动必须执行`imagegen-comfyui-source-read --discovery-json`并核对 v0.82.2 Source 成功 envelope 和 OpenAPI 3.1对象。缺少这些 shape 或 release acceptance 时 fail closed，不进入 Source 数据读取。

实例成功响应必须是源数据实施文档定义的闭合`InstanceSource`。`ComfyuiSourceCatalog`必须逐字段映射`instance_id -> id`、`title -> title`、`url -> url`、`credential_type -> credential_type`、`authorization -> authorization`、`enabled -> is_enabled`、`validated -> is_valid`和`instance_updated_at -> updated_at`，不得提供默认值。项目必须保持同名错误`SOURCE_INSTANCE_NOT_FOUND`、`SOURCE_INSTANCE_DISABLED`、`SOURCE_INSTANCE_INVALID`、`SOURCE_CREDENTIAL_UNAVAILABLE`、`SOURCE_TEMPLATE_NOT_FOUND`和`SOURCE_TEMPLATE_UNAVAILABLE`；discovery identity或版本不匹配映射为`SOURCE_CONTRACT_UNSUPPORTED`；`SOURCE_REQUEST_INVALID`、`SOURCE_DATABASE_BUSY`和`SOURCE_INTERNAL_ERROR`逐项映射为`SOURCE_PROTOCOL_ERROR`；CLI连接、超时、未声明服务错误、非JSON、空stdout、多JSON或响应Schema错误也映射为`SOURCE_PROTOCOL_ERROR`。实例Authorization只存在于Host进程内存；持久来源快照只保存实例ID、标题、URL、credential type和`instance_updated_at`。

当前仓库合同测试必须让Source CLI分别以退出码`7`返回`SOURCE_REQUEST_INVALID`、`SOURCE_DATABASE_BUSY`和`SOURCE_INTERNAL_ERROR`，断言三者都产生项目`SOURCE_PROTOCOL_ERROR`；Generation Run必须在调用`/prompt`前停止并保存相同结构化错误。

模板成功响应先通过 v0.82.2 Source envelope 校验，再由 adapter 将 `results[0]` 的 `id`、`title`、`revision_number`、`workflow_sha256`、`workflow_json`、`config_revision`、`dimension_strategy`、`parameters_json`、`bindings_json` 和 `expected_output_node_ids_json` 映射为内部闭合`TemplateBundle`。`expected_output_node_ids_json` 必须是非空数组；缺失、`null`、空数组或非法值返回`SOURCE_TEMPLATE_UNAVAILABLE`，不得读取来源内部数据库字段、推导输出节点或重新解释不透明 binding。

项目必须在Ticket 02注册到公开`conversation.view`、`id: "chat"`的项目occupant中从`ConversationSnapshot`渲染原型Skill Invocation与Tool行，并实现唯一`GenerationRunProjectionStore`。中列Tool行和公开`details`项目occupant中的右列运行卡必须从同一Store中读取同一`run_id`的`GenerationRunSnapshot`。`RunningToolCall`还没有meta时中列显示“正在创建 ComfyUI 运行”；Tool Result成功后，中列按原型持续显示队列等待、远程运行、保存媒体、提交结果未知、正在取消、已取消、成功或失败摘要，右列在同一Store revision显示详细卡片。

页面可见，且中列可见Tool行或右列可见卡片引用非终态Run时，唯一轮询协调器按Remote返回的`refreshAfterMs`刷新Store。两处同时可见时不得创建两个计时器或两份Run副本。“定位结果”选择Tool所属数字`turn`并聚焦右列同一`run_id`卡片。未匹配的Tool使用项目Workbench通用Tool行；项目UI registrations注销后，默认AppFrame、ConversationRoot与上游Tool UI恢复。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Source、Run Repository、ComfyUI Job 和 MediaStore 路径；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试和 PRD 明确列出的故障可见状态。PRD 与父 Issue #1 只能补足原型未展示的要求；只有父 Issue #1 或用户后续决定明确标记的原型错误或缺口修正可以改变对应可见设计，并必须记录原型元素、替代设计、决定来源和验收证据。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

“第 1 轮 · 生成角色半身像”、`generate_with_comfyui` Tool Call、“定位结果”、成功图片卡片和“下载本次 Workflow JSON（可导入 ComfyUI）”。“在新窗口打开原文件”属于 Ticket 10 的媒体卡片，不属于本阶段的成功运行卡片。

### 真实产品验收

浏览器用户在普通Harness Session的项目输入框输入`/`并从Harness原生Skill菜单选择`comfyui-generate`，发送包含Workflow模板、角色和图片要求的消息。Agent流式回复并调用`generate_with_comfyui`；中列先显示“正在创建 ComfyUI 运行”，Tool Result返回合法meta后持续显示该`run_id`的真实异步状态。右列只按相同meta中的`run_id`显示同一Store快照的一项运行。用户能够下载并重新导入该运行的ComfyUI UI Workflow 0.4 JSON；当前轮次成功卡片不显示原文件链接。浏览器没有API Workflow JSON、实例URL、Authorization或本机路径入口。

### 原型与父 Issue 一致性验收

真实产品必须复现原型中列的`generate_with_comfyui` Tool Call行、`run_id`异步状态摘要与“定位结果”动作，以及右列运行卡片的标题、同一`run_id`、状态badge、模板、实例、图片输出和Workflow下载按钮的布局、样式与交互。中列与右列必须读取同一Store revision；当前轮次成功卡片不得新增原文件链接。原型没有展示的Tool schema、Tool Result meta合同、Run持久化、两个Workflow构建、Fake Jobs API、凭据隔离、媒体签名和Workspace/Session授权必须按父Issue #1的具体规范验收。

### 实现跨度

当前仓库`ComfyuiSourceCatalog`、`comfyui-generate` Skill文件、Harness原生Skill provider/profile注册与Skill黑盒组合测试、安全ComfyUI实例选择与默认实例、统一registry中的`generate_with_comfyui`、`(workspace_id, session_id, call_id) -> run_id`、SQLite Run Repository、Actual Workflow Builder、API Workflow compiler、Fake Jobs API图片提交与读取、图片验证和保存、右列成功卡片与Workflow下载。数据源OpenAPI、Source handler、Source CLI和版本发布由外部实施文档负责，不在本Ticket实现跨度内。

### Blocked by

- Ticket 03 — 为一条消息选择 Workflow 模板与角色上下文并原子发送。

## Ticket 05 — 使用完整目录准备一条可生成消息

### v0.82.2 数据源消费状态

十个 Catalog operation 已在 `v0.82.2` 真实 CLI 通过搜索。Ticket 05 必须先校验裸 Catalog discovery、统一分页 envelope 和十项 operation manifest，再一次性注册十个 Tool；不得等待旧 contract wrapper，不得部分注册或将 raw `results` 当作内部 `items` 而跳过 adapter 校验。

### 产品目的

计划执行者必须扩展真实产品的上下文 Modal，使左侧资源种类导航能够查询生成模型、LoRA、作品、角色、画师或画风、提示词条目、画师串、Workflow 模板和已保存媒体；本阶段还必须在生成选项中实现独立的 ComfyUI Instance Execution Route 选择。

### 产品需求文档

- `docs/v0.1/PRDS/05-full-catalog-context-and-route.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是`verified-public-plugin-seams`。本Ticket复用Ticket 03的项目Workbench输入区、Harness `Modal`、Context resolver、`generation-context.v1`格式、user-message renderer与项目Typert Remote。九类可插入Catalog记录形成临时`ContextRef`；ComfyUI Instance只通过输入区的Execution Route控件选择，不能形成`ContextRef`、chip或`generation-context.v1`快照。

项目输入区必须把正文、已解析ContextRef、可选`generation-route.v1`控制block和浏览器图片编码为公开`PromptContentPart[]`，并只调用一次当前Session的`SessionFace.prompt(parts, 'queue')`。调用失败时保留正文、chip、Execution Route、File与preview；调用成功后只清除本次发送快照并回收对应object URL。Harness Host attachment store、原生`user/message`、AgentLoop与Tool pipeline继续是权威。项目不得从原型数组产生正式候选，也不得把实例连接数据写入Client、Context block或Session日志。

本Ticket必须定义`generation-route.v1`唯一运行时schema。显式选择实例时，发送逻辑在全部`generation-context.v1`后追加`<generation-route.v1>`、一行`{"contract_id":"generation-route","contract_version":1,"instance_id":"<安全ID>"}`和闭合标签；默认实例不写block。该block不计入Context数量或chip，但user-message renderer在重放时显示独立执行路线行。`comfyui-generate`只把该安全ID传给Generation Tool；Host通过Source Operation解析连接。

LoRA的真实`resolve`快照必须包含`source_lora_id`、`file_name`、`description`、`usage`、`trigger_words`和默认`weight`。Workflow模板安全快照必须包含`template_id`、revision、`base_lora_node_type`、MODEL/CLIP权重闭区间和Ticket 04定义的可见参数摘要；不得包含Workflow节点、binding目标、实例连接或凭据。这些字段是Ticket 12的`lora-adjustment`唯一消息输入来源。

本Ticket必须扩展Ticket 03的`src/host/tools/catalog-tool-manifest.ts`，并通过Ticket 01唯一`registerProjectTools()`一次性注册十个Catalog Tool。manifest固定包含：`query_semantic_base_models`→`querySemanticBaseModelsForSkill`→`/internal/semantic/base-models`→无筛选；`query_semantic_generation_models`→`querySemanticGenerationModelsForSkill`→`/internal/semantic/generation-models`→`base_model_id`；`query_semantic_loras`→`querySemanticLorasForSkill`→`/internal/semantic/loras`→`base_model_id`；`query_semantic_works`→`querySemanticWorksForSkill`→`/internal/semantic/works`→无筛选；`query_semantic_characters`→`querySemanticCharactersForSkill`→`/internal/semantic/characters`→`work_id`；`query_semantic_styles`→`querySemanticStylesForSkill`→`/internal/semantic/styles`→`base_model_id`；`query_semantic_prompt_terms`→`querySemanticPromptTermsForSkill`→`/internal/semantic/prompt-terms`→无筛选；`query_semantic_artist_prompt_strings`→`querySemanticArtistPromptStringsForSkill`→`/internal/semantic/artist-prompt-strings`→`base_model_id`；`query_semantic_comfyui_instances`→`querySemanticComfyuiInstancesForSkill`→`/internal/semantic/comfyui-instances`→无筛选；`query_semantic_comfyui_templates`→`querySemanticComfyuiTemplatesForSkill`→`/internal/semantic/comfyui-templates`→`base_model_id`。

十项description固定为：`query_semantic_base_models`=`Search or resolve safe semantic base-model records for generation catalog filtering.`；`query_semantic_generation_models`=`Search or resolve safe generation-model records compatible with an optional base model.`；`query_semantic_loras`=`Search or resolve LoRA catalog records with usage, trigger words, and safe default weight guidance.`；`query_semantic_works`=`Search or resolve semantic work records with aliases, category, and known character names.`；`query_semantic_characters`=`Search or resolve semantic character records, optionally restricted to one work.`；`query_semantic_styles`=`Search or resolve artist or style records with safe descriptions and prompt semantics.`；`query_semantic_prompt_terms`=`Search or resolve canonical prompt-term records and their aliases.`；`query_semantic_artist_prompt_strings`=`Search or resolve curated artist prompt strings compatible with an optional base model.`；`query_semantic_comfyui_instances`=`Search or resolve safe ComfyUI instance routes without exposing connection details or credentials.`；`query_semantic_comfyui_templates`=`Search or resolve safe ComfyUI template summaries and visible runtime parameter definitions.`。

每项description必须原样读取已发布OpenAPI，并与`docs/v0.1/PRDS/05-full-catalog-context-and-route.md`固定文本一致。Host启动时必须通过`imagegen-semantic-query --discovery-json`核对 v0.82.2 Catalog 裸 OpenAPI、十项`x-harness-tool-name`、description、operationId、path和闭合request/response schema，再构造并注册全部Tool；任一项缺失或漂移时返回`SOURCE_CONTRACT_UNSUPPORTED`且一个Catalog Tool都不注册。每次Tool Call只接受一个闭合`search`或`resolve`对象；多目标必须形成多次Tool Call，不得恢复旧批量查询合同。`StructuredCliGenerationCatalog`只调用Installation配置的已发布CLI；Source Operation、GenerationRuns方法、产品管理CLI、profile helper和项目Remote均不得注册为Agent/Skill Tool。

### 外部数据源前置条件

本Ticket不得修改数据源仓库。数据源仓库必须先按`docs/v0.1/source-data-catalog-implementation.md`使用自己的Issue、分支、测试和版本发布流程，发布十个Catalog operation、闭合schema、固定description、Catalog discovery和结构化`imagegen-semantic-query`。本Ticket只消费Installation配置指向的已发布CLI；尚未提供受支持版本、commit/tag、contract version和release acceptance时，本Ticket保持阻塞，计划执行者不得在当前仓库复制数据源OpenAPI、handler或CLI。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Catalog、Source、Run Repository 和 MediaStore；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试。当前仅有两项可见例外：增加原型遗漏的“提示词条目”导航；把原型错误放入 Message Context 的 ComfyUI Instance 改为独立 Execution Route。验收必须分别记录原型元素、替代设计、用户决定和成对证据；除此之外的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

上下文选择器中的生成模型、LoRA、作品、角色、画师或画风、提示词条目、画师串、Workflow 模板和已保存媒体，以及底模筛选说明。九类可插入资源全部复用原型已经固定的三列多行卡片、真实封面或统一占位符和独立分页。正式产品只把 ComfyUI 实例安全投影用于独立的 Execution Route 选择；静态 app 当前把实例候选放进通用上下文选择汇总的行为不进入正式产品。

左侧九行固定按“生成模型→LoRA→作品→角色→画师或画风→提示词条目→画师串→Workflow模板→已保存媒体”排列。Ticket 03已经创建唯一Resource Registry并首次实现角色与Workflow模板；本Ticket必须在同一Registry补充生成模型、LoRA、作品、画师或画风、提示词条目、画师串和已保存媒体，不得创建第二个Modal或Context resolver。每行统一执行真实search→每页六项卡片→`pendingDialogRefs`选择→确认写入草稿`ContextRef[]`与chip→发送前逐项resolve→全部成功后一次`SessionFace.prompt(parts, 'queue')`提交；任一resolve失败时不提交并保留草稿。Saved Media的search/resolve来自`GenerationRuns.listMedia()`和`getMediaDescriptor()`，其他八行来自各自Catalog Tool。顶部底模只筛选生成模型、LoRA、画师或画风、画师串和Workflow模板；ComfyUI实例只进入独立Execution Route，二者都不是左侧可插入资源行。

### 真实产品验收

浏览器用户能够分别查询并选择生成模型、LoRA、作品、角色、画师或画风、提示词条目、画师串、Workflow模板和已保存媒体；支持`base_model_id`的候选列表只受当前底模筛选影响。用户能够选择一个只显示安全名称、enabled/validated状态和固定不可用原因的ComfyUI实例作为Execution Route；实例ID不进入上下文chip、Message Context、Session快照或Context serialization。用户在同一输入区添加真实图片后发送；Agent收到的上下文只包含用户实际选择的可插入资源，浏览器始终看不到实例连接数据。正文、上下文和图片必须通过一次`SessionFace.prompt(parts, 'queue')`发送；失败保留全部临时UI数据，成功或删除附件时回收对应object URL。

### 原型与父 Issue 一致性验收

真实产品必须扩展原型上下文 Modal 的现有资源种类行、计数、每页六项的 `150 × 160` 候选卡片、`150 × 88` 封面区、真实封面、统一占位符、详情面板、选中标记、跨页选择和底模筛选交互，不得创建另一种目录布局。ComfyUI Instance 必须按父 Issue #1 显示为独立 Execution Route 控件；该控件只显示安全名称、enabled/validated状态和`disabled|not_validated`对应文案，不能复现静态 app 把实例加入通用上下文汇总的错误行为。原型没有展示的十个 Catalog Tool、Ticket 04 已落地的两个 Source Operation 复用、contract version gate 和资源错误分支必须按父 Issue #1 的具体规范验收。

### 实现跨度

当前仓库十项Catalog Tool manifest、Catalog CLI adapter、统一registry注册、Ticket 04两个Host私有Source Operation消费验证、现有Message Context Resource Registry扩展、真实封面安全投影、Saved Media context resolver、实例Execution Route控件和正负契约测试。数据源OpenAPI、Catalog handler、Catalog CLI和版本发布由外部实施文档负责，不在本Ticket实现跨度内。

### Blocked by

- Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow。

## Ticket 06 — 在多个聊天轮次之间准确查看零个、一个或多个运行

### 产品目的

计划执行者必须在真实产品的中列实现“第 N 轮 · 任务摘要”轮次按钮和 Tool Call“定位结果”，并在右列“当前轮次结果”中实现零个、一个和四个 `run_id` 的轮次投影。本阶段还必须让 Session 行显示对应运行数量。

### 产品需求文档

- `docs/v0.1/PRDS/06-turn-run-projection.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死轮次按钮、Tool定位和结果列所用 public renderer与状态接口；本 Ticket执行者不负责继续调查 Harness seam。

本Ticket复用Ticket 02注册到公开`conversation.view`、`id: "chat"`的项目occupant和公开`details`的项目occupant。项目Workbench的user-message renderer在用户消息之前渲染原型轮次按钮，并从公开`ConversationSnapshot`节点的`location.turn.turn`读取数字`turn`。项目Tool renderer按Ticket 04唯一规则验证settled Tool Result：`call`存在时校验`call.name`与meta；`call === null`时使用公开`callId`、当前Session和meta `run_id`调用`GenerationRuns.resolveToolResultLink()`，由Host核对持久映射。验证成功后，中列Tool行与右列运行卡从唯一`GenerationRunProjectionStore`读取同一`run_id`的`GenerationRunSnapshot`；项目不得向Harness Session日志写入`generation.run.*`事件，也不得把Session最新Run替代选中数字`turn`的结果。

Client遇到合法Generation Tool Result、打开results panel、切换Session、切换数字`turn`或完成取消请求后必须立即查询项目Typert Remote。页面可见，且中列至少一个可见Generation Tool行引用非终态Run，或右列results panel可见且引用非终态Run时，唯一Run投影协调器按Remote response的`refreshAfterMs`继续查询。中列和右列同时可见时必须共享一个Store订阅、一个计时器和每周期一次Remote查询；关闭右列但中列Tool行仍可见时必须继续刷新。页面隐藏、两处都没有可见消费者或全部已观察运行终态时停止。项目不得增加Harness forwarded event。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Harness Session、Tool Call 和 Run Repository；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

“第 N 轮 · 任务摘要”、“查看本轮回复 · 无 ComfyUI 运行”、“查看 1 项 ComfyUI 运行”、“查看 4 项 ComfyUI 运行”、“当前结果来自”、Tool Call 的“定位结果”，以及中列Generation Tool行与右列运行卡对同一`run_id`的状态同步。

### 真实产品验收

同一 Session 依次包含一个无运行聊天轮次、一个单运行聊天轮次和一个四运行聊天轮次。浏览器用户选择任一聊天轮次时，右列只显示该数字 `turn` 关联的零个、一个或四个 `run_id`；点击任一 Tool Call 的“定位结果”会选择对应聊天轮次并聚焦对应运行卡片。history window只有Tool Result且公开`call === null`时，持久映射校验后仍恢复正确卡片；篡改Session、`call_id`或meta `run_id`时不建立链接。中列Tool行与右列卡片同时可见时必须显示同一Store revision的状态且每个刷新周期只查询一次；关闭右列后，中列非终态Tool行继续刷新。用户切换到其他 Session 再返回后，聊天轮次选择、运行集合和 Session 运行数量保持正确。

### 原型与父 Issue 一致性验收

真实产品必须复现原型中列轮次按钮的“第 N 轮 · 任务摘要”和运行数量文案、选中样式、Tool Call行、异步状态摘要与“定位结果”，以及右列“当前结果来自”、数字`turn`和零个、一个、四个卡片的布局、状态与聚焦交互。中列与右列显示的同一`run_id`不得出现状态版本分叉。原型没有展示的Session日志关联、Tool Result meta合同、`call_id`和Run Repository查询必须按父Issue #1的具体规范验收。

### 实现跨度

Harness 原生 Session/数字 `turn`/`call_id` 关联，单次 Agent 回复中的多个 Tool Call，Run Repository unary Remote查询，Session 重新打开、当前轮次结果投影和 `refreshAfterMs` 条件轮询。

### Blocked by

- Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow。

## Ticket 07 — 离开页面后继续观察排队、远端执行与保存媒体

### 产品目的

计划执行者必须在真实产品的中列Generation Tool行和右列运行卡片中实现同一个`run_id`的异步状态。中列按原型持续显示“队列等待”、“正在 ComfyUI 执行”和“正在保存媒体”摘要；右列同时显示队列前方数量、KSampler步数与百分比、当前保存的`output_index`与百分比。本阶段还必须让两处在切换Session、重新打开页面和Host重启后继续显示Run Repository的持久状态。

### 产品需求文档

- `docs/v0.1/PRDS/07-durable-run-observation.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死 Jobs、Run Repository、Remote条件轮询与结果列接口；本 Ticket执行者不负责继续调查 Harness seam。

本 Ticket 只使用 `@deepseek-ai/dsh-jobs` 的 `ctx.jobs` 代理当前 Agent的进程内等待，并通过项目 `harness-comfyui/remote` 暴露 Run Repository unary `get/list`。持久 worker、ComfyUI transport和 Run Repository属于项目 Host plugin；`ctx.jobs` 不能成为持久状态来源，也不能代替 ComfyUI单 Job cancel。

rc.8 public forwarded-event allowlist不包含项目Run事件。本Ticket不发送`generation.run.changed`，不修改`@deepseek-ai/dsh-api-remotes`，并按Ticket 06的`refreshAfterMs`条件轮询规则刷新唯一`GenerationRunProjectionStore`。中列Generation Tool行和右列运行卡必须读取同一Store；页面可见且任一处存在可见非终态消费者时继续轮询，两处同时可见时每周期只查询一次，关闭右列但保留中列Tool行时仍继续刷新。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Run Repository、Jobs API 和 MediaStore；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试和 PRD 明确列出的故障可见状态。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

默认聊天轮次中列Generation Tool行的“队列等待”、“正在 ComfyUI 执行”和“正在保存媒体”摘要；右列“队列等待”、“远端运行”和“保存媒体”卡片；队列前方数量、KSampler进度、output保存进度，以及Session重新打开后的状态恢复。

### 真实产品验收

浏览器用户在一个聊天轮次创建多项运行后，可以切换Session或关闭页面。重新打开Session后，唯一`GenerationRunProjectionStore`从Run Repository恢复各`run_id`；同一Store revision驱动中列Tool行的状态摘要和右列卡片的详细状态。worker使用已保存`prompt_id`继续读取`GET /api/jobs/{prompt_id}`，并把运行从队列等待推进到远端运行、保存媒体和成功。Host重启不会丢失运行，也不会创建第二个ComfyUI Job。关闭右列但保持中列Tool行可见时，非终态状态仍继续刷新。

### 原型与父 Issue 一致性验收

真实产品必须复现原型中列Tool行的“队列等待”、“正在 ComfyUI 执行”和“正在保存媒体”摘要，以及右列“队列等待”、“远端运行”和“保存媒体”卡片的状态badge、Workflow模板与实例信息、状态轨道、队列数量、KSampler进度、保存进度、百分比和说明文案。同一`run_id`在两列必须显示同一Store revision的状态，两处同时可见时不得重复轮询。原型没有展示的worker调度、Jobs API 404观察期限、Host重启恢复和幂等边界必须按父Issue #1的具体规范验收。

### 实现跨度

持久 Run 状态机、Jobs API 状态读取、重启恢复 worker、`call_id` 幂等映射、观察期限内的 Job 404 处理、Run projection Remote条件轮询和状态卡片。

### Blocked by

- Ticket 06 — 在多个聊天轮次之间准确查看零个、一个或多个运行。

## Ticket 08 — 在运行失败或提交结果未知时获得安全的下一步

### 产品目的

计划执行者必须在真实产品的右列实现两种不同终态卡片：“运行失败”卡片显示 ComfyUI Job 的失败节点、错误码和下一步；“提交结果未知”卡片显示 `/prompt` 响应未确认、没有可查询 `prompt_id`、不能取消和不会自动重新提交。本阶段还必须在“画风参数对比”聊天轮次同时投影一项成功运行和一项失败运行。

### 产品需求文档

- `docs/v0.1/PRDS/08-failure-and-submission-unknown.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死失败投影、原生新消息与新 Tool Call接口；本 Ticket执行者不负责继续调查 Harness seam。

本Ticket只通过项目Typert Remote读取Run Repository的失败与`submission_unknown`投影，并在Ticket 02注册到公开`details`的项目occupant中呈现。用户要求再次执行时必须使用项目Workbench输入区通过一次原生`SessionFace.prompt(parts, 'queue')`发送新消息，由Harness AgentLoop触发新的Tool Call；结果卡不得直接调用AgentLoop、Tool registry或ComfyUI`/prompt`，不得复用旧`callId`产生第二次远端提交。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Run Repository；本 Ticket worktree 的 `runtime/production/` installation 只允许用受控 Fake ComfyUI/Jobs 响应准备 `failed`、`submission_unknown` 和 PRD 明确列出的故障状态，不能用 fixture 替代 Catalog、Source、Run Repository 或 MediaStore。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

“画风参数对比”中的一项成功与一项失败、“运行失败”卡片、`COMFYUI_REMOTE_EXECUTION_FAILED`、“提交结果未知”、`COMFYUI_SUBMISSION_RESULT_UNKNOWN`、没有 `prompt_id`、不会自动重新提交和要求发送新聊天消息。

### 真实产品验收

浏览器用户要求 Agent 创建两项画风对比运行时，一项能够成功，另一项能够显示 ComfyUI Job 的具体失败节点与可操作下一步。`/prompt` 成功响应无法确认且没有保存 `prompt_id` 时，另一项运行只进入“提交结果未知”；页面明确显示不能查询、不能取消且不会自动重新提交。`GenerationRuns.create()` 再次收到相同 `workspace_id`、`session_id` 和 Harness `call_id` 以及相同不可变 Generation Tool 请求快照时复用同一 `run_id`；同一调用身份附带不同请求快照时返回 `RUN_REQUEST_CONFLICT`；新 `call_id` 创建新 `run_id`。用户只有发送新消息触发新 Tool Call 才会获得新的 `run_id`。

### 原型与父 Issue 一致性验收

真实产品必须复现原型“画风参数对比”Session 的成功/失败双卡片布局，以及“运行失败”和“提交结果未知”卡片的危险色、状态 badge、错误码、具体原因和下一步文案；页面不得增加直接重试或直接提交按钮。原型没有展示的崩溃注入、相同 `call_id` 请求比较、`RUN_REQUEST_CONFLICT`、Job missing 截止条件和结构化错误目录必须按父 Issue #1 的具体规范验收。

### 实现跨度

远端失败投影、重复提交边界、提交前后崩溃注入、`submission_unknown`、观察期限后的 Job missing 失败、唯一结构化错误目录和失败卡片文案。

### Blocked by

- Ticket 05 — 使用完整目录准备一条可生成消息。
- Ticket 07 — 离开页面后继续观察排队、远端执行与保存媒体。

## Ticket 09 — 在 Workspace 任务中心筛选并取消一项运行

### 产品目的

计划执行者必须在真实产品左列注册“所有 ComfyUI 异步任务”入口，并实现居中的 Workspace 任务 Modal：顶部提供 Session、聊天轮次和创建时间筛选，主体提供任务表格，底部提供独立分页；排队和运行中行提供取消按钮与确认 Modal。

### 产品需求文档

- `docs/v0.1/PRDS/09-workspace-task-cancellation.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死左列任务入口、Modal、任务查询和单 Job取消接口；本 Ticket执行者不负责继续调查 Harness seam。

Ticket 02注册到公开`sidebar`的项目occupant已经在左列搜索框之后、Session列表之前预留项目入口区域。本Ticket在该项目组件中直接渲染“所有 ComfyUI 异步任务”入口，使用Harness `Modal`并调用项目Typert Remote的task list/cancel。项目取消服务调用ComfyUI `POST /api/jobs/{prompt_id}/cancel`并更新Run Repository；`ctx.jobs.kill`只会停止进程内等待，不能代替远端Job取消。

本Ticket不得注册第二个root、重复声明Ticket 02项目root拥有的child slot或通过DOM修改项目桌面Shell。真实composition必须证明Ticket 02的项目`sidebar` occupant通过公开`ctx.sessions`显示真实Session列表，并在原型规定位置显示项目任务入口。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Run Repository 和 Jobs API；本 Ticket worktree 的 `runtime/production/` installation 只允许用受控 Fake ComfyUI/Jobs 响应准备取消竞态和 PRD 明确列出的故障状态。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

左列“所有 ComfyUI 异步任务”、居中任务 Modal、会话/聊天轮次/创建时间筛选、分页、本仓库状态与 ComfyUI Job 原始状态、取消确认、“正在取消”和“已取消”。

### 真实产品验收

浏览器用户打开 Workspace 任务中心，按 Session、聊天轮次和创建时间筛选并翻页，能够在同一行看到实例名称、`run_id`、可用的 `prompt_id`、本仓库状态和 ComfyUI Job 原始状态。用户选择一项排队或运行中任务后，确认框显示准确目标；确认只调用该 `prompt_id` 的取消接口，任务中心和右列同一 `run_id` 依次显示“正在取消”和“已取消”。保存媒体、提交结果未知、成功、失败和已取消任务只显示具体不可取消原因。

### 原型与父 Issue 一致性验收

真实产品必须复现原型左列入口、居中任务 Modal、三个筛选器、任务表头与列顺序、每页五项分页、状态 badge、可取消按钮、不可取消原因和取消确认 Modal 的尺寸、间距、颜色与交互；确认后任务 Modal 与右列同一 `run_id` 必须同步显示“正在取消”和“已取消”。原型没有展示的远端取消竞态、回读失败、授权隔离和结构化错误分支必须按父 Issue #1 的具体规范验收。

### 实现跨度

Workspace task query、筛选与独立分页、`POST /api/jobs/{prompt_id}/cancel`、`GET /api/jobs/{prompt_id}` 回读、取消竞态、状态同步和 Session/Workspace 授权。

### Blocked by

- Ticket 07 — 离开页面后继续观察排队、远端执行与保存媒体。
- Ticket 08 — 在运行失败或提交结果未知时获得安全的下一步。

## Ticket 10 — 在当前 Session 与整个 Workspace 找回历史媒体

### 产品目的

计划执行者必须在真实产品右列实现“本会话结果”媒体网格，并在左列注册“所有媒体”入口与居中的 Workspace 媒体 Modal。两个区域必须实现原型中的筛选器、固定尺寸媒体卡片、独立分页、原文件入口和实际 Workflow 下载按钮。

### 产品需求文档

- `docs/v0.1/PRDS/10-session-workspace-media.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死 Session媒体、左列媒体入口、Modal、Remote与同源读取接口；本 Ticket执行者不负责继续调查 Harness seam。

本Ticket在Ticket 02注册到公开`details`的项目occupant中实现Session媒体库，并在Ticket 02注册到公开`sidebar`的项目occupant中直接渲染“所有媒体”入口。该入口使用Harness `Modal`实现Workspace媒体库；页面通过项目Typert Remote分页查询媒体，并通过`@deepseek-ai/dsh-host-webserver`的prefix route读取媒体和Actual Workflow。本Ticket不得注册第二个root、重复声明Ticket 02项目root拥有的child slot，也不得替换Harness Session、Tool execution或route dispatcher。

Host route只接受 `media_id` 或 `run_id`，在 Host内解析 Workspace授权与文件路径。浏览器响应不得包含本地路径、ComfyUI URL、Authorization或 API Workflow JSON。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Run Repository 和 MediaStore；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

右列“本会话结果”、左列“所有媒体”、会话/聊天轮次/媒体种类/保存时间筛选、两套独立分页、媒体卡片、打开原文件和 Workflow 下载。

### 真实产品验收

浏览器用户能够在当前 Session 按聊天轮次、媒体种类和保存时间筛选媒体并独立翻页；也能够从“所有媒体”打开 Workspace Modal，增加 Session 筛选后跨会话查找并翻页。每个媒体卡片显示所属 Session、聊天轮次、保存时间、`output_index` 和 `run_id`。用户停留在 Session A 时能够打开同一 Workspace 中 Session B 的媒体原文件并下载其实际 Workflow；右列 Session A 入口不能读取 Session B 的运行，任何入口都不能读取其他 Workspace 的运行。

### 原型与父 Issue 一致性验收

真实产品必须复现原型右列两列固定尺寸媒体网格与每页四项分页，以及 Workspace Modal 四列媒体网格与每页八项分页；Session、聊天轮次、媒体种类、保存时间筛选器，媒体预览、元数据、原文件入口和 Workflow 下载按钮的顺序、尺寸、间距、字体和交互必须一致。原型没有展示的 Session/Workspace 授权、`total_count`、伪造 `run_id` 和文件读取错误必须按父 Issue #1 的具体规范验收。

### 实现跨度

Session/Workspace Saved Media 查询、筛选、排序、`total_count`、独立分页、媒体授权、原文件读取、Actual Workflow 下载和复用媒体卡片。

### Blocked by

- Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow。
- Ticket 06 — 在多个聊天轮次之间准确查看零个、一个或多个运行。

## Ticket 11 — 一次运行交付多个图片、视频和音频结果

### 产品目的

计划执行者必须在真实产品中实现原型“测试视频工作流”Session 对应的多输出结果：同一 `run_id` 的当前轮次运行卡片按 `output_index` 显示图片、视频和音频；“本会话结果”和“所有媒体”同时显示这些输出并支持媒体种类筛选。

### 产品需求文档

- `docs/v0.1/PRDS/11-multi-output-media.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-public-plugin-seams`。本节已经写死多输出结果列、Remote和同源媒体读取接口；本 Ticket执行者不负责继续调查 Harness seam。

本Ticket复用Ticket 02注册到公开`details`的项目occupant、项目Typert Remote与`@deepseek-ai/dsh-host-webserver` prefix route。Harness只提供插件承载面；项目Run Repository拥有多输出状态、媒体描述和文件。项目不得修改Harness资源服务器来增加媒体种类，不得让URL扩展名替代最终Content-Type与文件签名。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Run Repository、ComfyUI Job 和 MediaStore；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试和 PRD 明确列出的媒体错误状态。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

“测试视频工作流”Session、“图片、视频与音频”成功卡片、同一 `run_id` 的多个 `output_index`、视频静态封面、音频波形静态预览和媒体分页。

### 真实产品验收

浏览器用户发送“生成 4 秒角色镜头”的消息后，一项 `run_id` 能够保存多张关键帧、一项视频和一项音频。当前轮次结果按 `output_index` 显示图片、视频和音频；本会话结果与所有媒体能够按媒体种类筛选这些文件，并能打开每个原文件。每个输出下载的 Workflow 都属于同一 `run_id`，浏览器仍不提供 API Workflow JSON。

### 原型与父 Issue 一致性验收

真实产品必须复现原型“测试视频工作流”Session、成功多输出运行卡片、图片预览、视频静态封面、音频波形静态预览、媒体种类 badge、`output_index` 顺序和媒体分页；原型未提供视频或音频内嵌播放控件，正式产品本阶段也不得增加该交互。原型没有展示的视频/音频 MIME 与签名验证、output descriptor、下载失败和多输出持久化必须按父 Issue #1 的具体规范验收。

### 实现跨度

视频与音频 media policy、ComfyUI output descriptor registry、多输出下载与验证、Saved Media 持久化、三种媒体 renderer 和现有两级媒体库集成。

### Blocked by

- Ticket 07 — 离开页面后继续观察排队、远端执行与保存媒体。
- Ticket 10 — 在当前 Session 与整个 Workspace 找回历史媒体。

## Ticket 12 — 使用迁移的 Prompt 与 LoRA 调整 Skills 准备生成内容

### v0.82.2 数据源消费状态

Prompt、LoRA、作品、角色、画风、提示词条目和画师串数据可以从 `v0.82.2` Catalog CLI 读取。Ticket 12 只消费 Ticket 05 已规范化的 Harness Tool Result，不直接解析 CLI envelope；Skill 不读取 source pin 字段，不运行源 CLI，不把空结果补成 fixture。Workflow Template 仍必须通过 Ticket 04 的 `expected_output_node_ids_json` 非空门禁。

### 产品目的

计划执行者必须从固定来源迁移`anima-prompt-builder`、`wai-sdxl-prompt-builder`和`lora-adjustment`，并把三者注册到真实Harness原生Skill入口。浏览器用户在普通Session中先使用一个Prompt Skill取得最终Prompt，再使用`lora-adjustment`取得调整后的Prompt、LoRA权重和实际触发词。三个迁移Skill的结果只显示在中列且不创建Run；用户后续显式调用Ticket 04的`comfyui-generate`后，同一数字`turn`的Skill Invocation、Generation Tool Call与合法Tool Result meta才建立`run_id`链接。中列Tool行显示该运行的异步摘要，右侧第三列显示同一Store快照的详细结果。

### 产品需求文档

- `docs/v0.1/PRDS/12-prompt-skills.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是`verified-public-plugin-seams`。本节已经写死release-local Skill目录、既有filesystem provider、公开SkillsApi、Host Skill校验与Tool接口；本Ticket执行者不负责继续调查Harness seam。

本Ticket使用Ticket 15在`harness-comfyui` Preset中挂载的`@deepseek-ai/dsh-skill-filesystem`和Host `dsh-tool-skill`校验。Release Artifact把三个迁移Skill保存在`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`与`skills/lora-adjustment/`；项目Preset设置`includeDefaultRoots: false`并只从当前release的`package/skills`发现它们。项目composer渲染的原生input overlay、`ui-input-trigger`与`ui-skill`必须在用户输入`/`后显示这些Skill，并由Harness把选择结果插入普通`/<skill-name> `文本。

项目不得调用SkillsApi实现Skill候选菜单，不得保存Skill选择状态，也不得注册第二个Skill provider、invocation policy或Skill调用结果存储；项目不得修改Harness Skill package。两个Prompt Skill只使用`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`与`query_semantic_prompt_terms`；`lora-adjustment`只使用`query_semantic_loras`。三个迁移Skill都不得调用`generate_with_comfyui`。来源checkout不存在时，tarball-only installation仍必须发现并运行三个Skill。

来源固定为`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`的committed tree`799b7759029d70076791321e2b02bf53c651c98f`。计划执行者只迁移PRD 12逐目录表列出的领域知识和references；计划执行者必须重写三个`SKILL.md`的Harness输入、Tool和直接assistant输出协议，并且不得迁移`agents/openai.yaml`、validation/report脚本、来源Pi、专用管理Skill会话、旧调用标识字段、`noobai_user_prompt`、`run_skill_script`或任何finalizer协议。

逐文件结果固定如下：Anima必须重写`SKILL.md`、`references/01-quick-start.md`和`references/02-role.md`，新建`references/catalog-tools.md`与`references/output-format.md`，不复制`agents/`、`scripts/`、`references/03-output-protocol.md`和`references/semantic-query-interfaces.md`；WAI必须重写`SKILL.md`，新建`references/catalog-tools.md`、`references/message-input.md`和`references/prompt-output-format.md`，把全部旧语义Tool文档链接改到`catalog-tools.md`并把保留Prompt知识文件中的UI选择输入改为当前消息不可变快照，不复制`agents/`、`scripts/`、`references/semantic-tool-orchestration.md`、`references/input-contract.md`和`references/prompt-format-validator.md`；LoRA必须重写`SKILL.md`并按新输入字段修订`references/weight-guidance.md`，不复制`config/`、`scripts/`或专用管理会话说明。三个目标`SKILL.md`只能引用当前普通用户消息、当前消息`generation-context.v1`快照、普通Session历史、自身相对references和Harness授权Tool。

Anima与WAI对一个查询目标调用一次对应Tool，参数固定为`{ "mode": "search", "query": "<一个目标>", "page": 1, "page_size": 10 }`，适用时只从当前不可变快照附加`work_id`或`base_model_id`。多个作品、角色、画师方向或Prompt术语必须形成多次独立Tool Call，并按当前用户要求和快照顺序采用结果。`lora-adjustment`必须按当前消息LoRA快照顺序，对每个字符串`source_lora_id`调用一次`query_semantic_loras({ "mode": "resolve", "id": "<source_lora_id>" })`；不得调用来源旧LoRA查询Tool，也不得接受Host隐式注入底模、LoRA集合或权重范围。Skill只调用Harness registry中的Tool，不直接运行Catalog CLI、不调用数据源HTTP接口、不调用项目Remote。

Skill黑盒测试必须运行真实Harness provider和真实Tool registry并记录实际Tool Call与Tool Result，不得只扫描Skill文本。Anima与WAI分别覆盖单目标、多目标、空结果、Catalog错误和无需查询；LoRA覆盖单个、多个、有序resolve、Catalog错误、两种LoRA节点、停用和连续调整。测试必须断言每个目标恰好一次调用，参数schema闭合，三个迁移Skill不调用旧Skill脚本执行器、任何finalizer、来源旧LoRA查询Tool或`generate_with_comfyui`。

### 外部数据源前置条件

本Ticket不得修改数据源仓库。数据源仓库必须先按`docs/v0.1/source-data-catalog-implementation.md`发布本Ticket使用的五个Catalog Tool合同和结构化CLI；Ticket 05必须已通过当前仓库统一registry注册这些Tool。未提供数据源受支持版本、commit/tag、contract version和release acceptance时，本Ticket保持阻塞。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和当前 worktree 构建的 tarball。首次运行必须通过 `npm exec --yes --package=<worktree-tarball> -- harness-comfyui install` 完成引导安装；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。代码变更后的候选包必须通过该 installed CLI 的 upgrade 切换并在失败时恢复上一版本。浏览器验收完成后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket 不得新增或复制安装、启动、进程管理、health、日志、upgrade、rollback 或目录布局脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 的“本阶段实现的原型区域”必须在真实 DeepSeek Harness Host/Client 中，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现桌面版本。1:1 固定包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、状态 badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关与焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本；静态原型只作为设计和成对证据基准，不得进入正式 bundle 或 runtime。

正式浏览器数据必须来自本 Ticket PRD 指定的真实 Harness Skill、Catalog、Source、Run Repository 和 MediaStore 路径；原型静态数据或 fixture 不得替代。受控 fixture 只允许确定性自动化技术测试。PRD 与父 Issue #1 只能补足原型未展示的要求；没有明确记录的可见差异全部判定为 FAIL。

本 Ticket 必须读取 `tests/visual/prototype-fidelity-viewports.json`，每个桌面可见原型区域必须在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；独立审核者必须在当前本地浏览器操作原型与真实产品并给出PASS/FAIL，实现者自检和自动化测试不能替代该验收。

### 本阶段实现的原型区域

中列保留ConversationRoot并在项目composer中渲染输入`/`后的Harness原生Skill菜单，同时复用Harness原生Agent流式回复。Prompt Skill在中列显示完整单行Prompt；`lora-adjustment`在中列显示唯一`{prompt_text,loras}`JSON；两类当前轮次的右列都显示无ComfyUI运行。后续`comfyui-generate`调用在中列显示`generate_with_comfyui` Tool Call、异步状态摘要和“定位结果”；右侧第三列只按通过合同校验的`ToolResultNode.meta.run_id`显示同一`GenerationRunProjectionStore`快照。本项目不显示第二套Skill候选菜单或Tool详情面板。

### 真实产品验收

浏览器用户必须完成一个连续的普通Session用户任务：

1. 用户选择`anima-prompt-builder`或`wai-sdxl-prompt-builder`，发送画面要求与真实Message Context；Skill调用其需要的真实Catalog Tool并在中列返回完整单行Prompt。该轮Run Repository计数不变，右列显示本轮无ComfyUI运行。
2. 用户在下一条消息选择`lora-adjustment`，附加一个真实Workflow模板和至少一个有序LoRA快照，并明确使用上一步Prompt。Skill按快照顺序调用`query_semantic_loras`，在中列直接返回PRD 12固定的`{prompt_text,loras}`JSON。该轮Run Repository计数仍不变，右列显示本轮无ComfyUI运行。
3. 用户在后续新消息显式选择`comfyui-generate`，重新附加本次Workflow模板与LoRA上下文，并明确引用上一步LoRA调整结果。只有这一步可以调用一次`generate_with_comfyui`；同一数字`turn`必须保存Skill Invocation、Tool Call和含合法`run_id` meta的Tool Result。中列显示Tool Call及持续异步摘要，右侧第三列显示同一Store快照的`run_id`运行卡片。

`lora-adjustment`必须覆盖`LoraLoader`、`LoraLoaderModelOnly`、多LoRA有序返回、临时零权重、独立CLIP权重、允许触发词和同Session连续调整。三个迁移Skill文件不依赖来源仓库绝对路径、SQLite路径、ComfyUI URL或当前仓库内部模块。

### 原型与父 Issue 一致性验收

真实产品必须保持原型三列责任：左列显示Session；中列显示普通用户消息、三个迁移Skill的Agent结果以及后续Generation Tool Call与异步状态摘要；右侧第三列只显示Generation Run详细卡片。Prompt与LoRA调整结果不得出现在右列；只有通过PRD 04合同校验的`generate_with_comfyui` Tool Result meta可以产生右列卡片。Skill选择必须使用项目输入框输入`/`后由Harness原生overlay显示的菜单，不得实现第二套菜单、选择状态、provider、invocation policy或Host校验。该原生选择交互、profile权限和Session记录必须按父Issue #1与PRD 12验收。

### 实现跨度

从`fzfz/NoobAI-XL-FZ@799b7759029d70076791321e2b02bf53c651c98f`迁移两个Prompt Skill与`lora-adjustment`，重写三个Skill的Harness协议，更新Release Artifact allowlist与安装复制，增加三个Skill的真实Harness黑盒测试、Prompt/LoRA语义审核，以及与既有`comfyui-generate`的显式后续交接测试。

### Blocked by

- Ticket 05 — 使用完整目录准备一条可生成消息。
- Ticket 04 — 通过 Agent 生成一张图片并下载可导入 Workflow。

## Ticket 13 — 从一次构建的版本化产品包完成真实产品验收

### v0.82.2 数据源验收

Ticket 13 必须记录同一 Installation source pin（`imagegen-source-contract`、`0.82.2`）、Catalog 裸 OpenAPI discovery、Source 分页 discovery、十个 Catalog operation、两个 Source operation 和 TemplateBundle 输出节点 Schema。所有证据通过 `config/source-contract-v0.82.2.json` 校验；CLI 退出码 `0` 不能替代 Harness adapter 的业务 Schema PASS。

### 产品目的

计划执行者必须从一次构建产出版本化 Release Artifact；发布验证者必须从该 artifact 启动真实 Host 与 Client，并在真实产品中完成以下浏览器动作：在左列搜索和选择 Session，打开“所有 ComfyUI 异步任务”与“所有媒体”；在中列打开上下文 Modal、选择资源、查看 chip、发送消息、观察 Agent 流式文本、选择聊天轮次并点击 Tool Call“定位结果”；在右列切换“当前轮次结果 / 本会话结果”，筛选并翻页查看任务与媒体，取消一项排队或运行中任务，打开媒体原文件并下载实际 Workflow。真实产品必须显示空态、流式输出、队列等待、远端运行、保存媒体、成功、运行失败、提交结果未知、正在取消和已取消状态。

### 产品需求文档

- `docs/v0.1/PRDS/13-release-artifact-acceptance.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是`verified-public-plugin-seams`。本Ticket只验收Issues #3–#13各自正文已经冻结的接口；任一Issue存在未解决的public plugin seam阻塞时，本Ticket必须判定NO-GO。

本 Ticket 验收 Tickets 01–12 已冻结的全部 public interfaces。Release Artifact不得包含 Harness source patch、fork、vendored source、`@deepseek-ai/*/src/*` import、source checkout路径、项目自定义 forwarded event或 DOM monkey patch。`check:harness-boundary`、tarball-only、composition、E2E和当前worktree的`1440×1000`桌面人工验收必须全部通过。

任何产品任务需要修改 Harness Core才能完成时，本 Ticket必须判定 NO-GO；发布验证者不得在验收阶段修改 artifact或 installation中的 Harness package。

发布验证者必须确认Issues #3–#13没有未解决的public plugin seam阻塞，并且已经通过各自真实composition与`1440×1000`桌面独立视觉验收；任一产品能力未完成时必须判定NO-GO，不得把未完成能力写成已知限制后继续生成Release Preview。

### Git worktree 内的完整产品运行流程

计划执行者必须进入本 Ticket 自己的 Git worktree，使用 `production` Configuration Profile、`runtime/production/installation.json` 和本 Ticket 唯一 build/pack 生成的 Release Artifact。首次安装必须通过 `npm exec --yes --package=<release-tarball> -- harness-comfyui install` 完成；随后必须只调用 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop。完成桌面浏览器验收后必须执行 stop 并确认 PID state 清理与端口释放。本 Ticket必须另外执行一个成功 upgrade 和一个候选 health 失败后自动恢复上一版本的 rollback 场景；本 Ticket 不得创建或修改第二套产品运行脚本。

### 原型 1:1 实现与验收硬门禁

本 Ticket 必须在 Ticket 13 自己的 Git worktree、该 worktree 的 `runtime/production/` installation、`production` Configuration Profile 和当前本地浏览器中，使用 `.release/quality/artifact.json` 指向的同一 tarball，按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 对 Tickets 02–12 的全部桌面可见区域完成 1:1 验收。1:1 固定包含全部功能、信息、布局、尺寸、样式、文案、交互和全部可见状态；移动端布局、移动端导航、窄屏单panel与原型CSS断点不属于本版本。正式浏览器数据必须来自各 PRD 指定的真实 Catalog、Source、Run Repository 和 MediaStore；该 worktree installation 只允许用受控 Fake ComfyUI/Jobs 响应准备 PRD 明确列出的故障可见状态。

全部桌面可见区域必须读取 `tests/visual/prototype-fidelity-viewports.json` 并在`1440×1000`保存成对截图或录像。独立视觉审核者不得是本 Ticket 的实现者；审核者必须操作两边产品并给出 PASS/FAIL，实现者自检、自动化测试、clean checkout、隔离目录和 release-smoke 都不能替代 Ticket 13 worktree installation 的完整人工验收。Ticket 05 的两项明确原型例外之外，任何桌面可见差异都判定为 FAIL。

### 本阶段验收的原型区域

三列工作台的核心用户路径：普通流式聊天、上下文发送、单图成功、多轮多运行、异步状态、失败与提交结果未知、任务取消、媒体查找和多媒体结果；两个Prompt Skill与`lora-adjustment`的结果只显示在中列且对应轮次右列无Run；后续`comfyui-generate`的Tool Call显示在中列，Tool Result meta中的`run_id`建立右侧第三列结果链接，中列异步摘要与右列详细卡片读取同一`GenerationRunProjectionStore`并保持状态同步。

### 真实产品验收

计划执行者必须保留并验收完整 `harness-comfyui` 产品管理 CLI、`scripts/deploy/`、`tests/deploy/`、`config/profiles/production.json` 和全部 `deploy:*` package scripts，再从同一精确 commit 执行唯一 build/pack。Release Artifact必须包含`skills/comfyui-generate/`、`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`和`skills/lora-adjustment/`。发布验证者必须在 Ticket 13 自己的 Git worktree 中通过 tarball `bin.harness-comfyui` 完成首次 install，并只通过 `runtime/production/bin/harness-comfyui` 执行 start、status、health、logs 和 stop，启动真实 Host 与 Client，然后完成 Tickets 02 至 12 定义的真实产品任务。clean checkout、composition、e2e 和 release-smoke 只执行 artifact 自动化技术门禁，不能替代 Ticket 13 worktree 中的完整视觉验收。验收记录必须包含产品版本、artifact identity、数据源 contract identity、四个release-local Skill目录、已执行产品任务、`1440×1000`成对证据、独立视觉审核PASS、已知限制和用户自行安装所需版本信息。

### 原型与父 Issue 一致性验收

发布验证者必须在 Ticket 13 自己的 Git worktree、该 worktree 的 `runtime/production/` installation、`production` Configuration Profile 和当前本地浏览器中逐区域并排比较静态原型与真实产品；桌面三列布局、上下文 Modal、轮次按钮、Tool Call、运行卡片、任务 Modal、媒体 Modal、筛选器、分页、取消、原文件入口和 Workflow 下载的功能、布局、尺寸、样式、文案、交互和全部可见状态必须 1:1。`tests/visual/prototype-fidelity-viewports.json`的`1440×1000`必须执行。独立视觉审核者不得是本 Ticket 的实现者；实现者自检和自动化测试不能替代独立 PASS。原型没有展示的安装、配置、contract gate、自动化 fixture、质量命令、CI、artifact、release-smoke 和 release notes 必须按 PRD 13 验收，但这些技术门禁不得改写原型已有桌面设计。

### 实现跨度

复用 Ticket 01 已落地的真实产品管理 CLI、统一 worktree 开发运行命令、统一质量命令、PR/main CI、build-once artifact workflow 和 release-smoke 自动化技术门禁，并补齐只用于确定性自动化与 Ticket 13 worktree 故障可见状态的 Fake ComfyUI/Jobs 响应、Tickets 02 至 12 的真实数据浏览器验收、`1440×1000`成对证据和 release notes。正式浏览器候选、Source 摘要、Run Repository 和 MediaStore 不得由 fixture 替代。

### Blocked by

- Ticket 09 — 在 Workspace 任务中心筛选并取消一项运行。
- Ticket 11 — 一次运行交付多个图片、视频和音频结果。
- Ticket 12 — 使用迁移的Prompt与LoRA调整Skills准备生成内容。

## Ticket 14 — 发布已验收的 GitHub Release 供用户自行安装

### 产品目的

发布负责人必须在用户明确批准 Release Preview 后，把 Ticket 13 在其 Git worktree 的 `runtime/production/` installation 和当前本地浏览器完成`1440×1000`桌面1:1验收的同一 Release Artifact 创建为 Git tag 和 GitHub Release，供用户自行下载和安装。GitHub Release 创建成功后，本项目交付流程结束；版本发布后的安装、配置、启动、升级、数据迁移和回滚由用户自行决定并执行。

### 产品需求文档

- `docs/v0.1/PRDS/14-approved-release-publication.md`

### Harness 核心零改动与公共插件接口

本次规划审计状态是 `verified-release-only-after-issue-14-pass`。本 Ticket只发布 Issue #14已经验收的同一 artifact，不执行 Harness接口调研、产品设计或代码变更。

本 Ticket 不修改代码、不重新 build、不重新 pack、不创建 installation，也不调用 Harness lifecycle。发布负责人只发布 Ticket 13 已证明完全通过 public plugin seams实现的同一 Release Artifact；任何代码、依赖、package内容或 Harness boundary证据变化都会使 Release Approval失效。

### 原型 1:1 发布门禁

本 Ticket 不重新运行或重新解释 UI 验收。发布负责人必须确认待发布 tarball 的 SHA-256、byte length、SemVer 和 commit 与 Ticket 13 已取得独立 1:1 PASS 的 artifact identity 完全一致，并确认 Release Preview 能读取 Ticket 13 worktree installation 中`1440×1000`桌面成对证据。任一 identity 或证据不一致都阻止发布。

本 Ticket 不创建 Product Installation，不调用 install、preflight、start、stop、restart、status、health、logs、upgrade 或 rollback，不重新执行产品用户任务，也不操作用户发布后创建的 installation。

### 真实产品验收

Release Approval 必须绑定 SemVer、精确 commit、`.release/quality/artifact.json`、tarball 文件名、byte length、SHA-256、Ticket 13 自动化门禁结果、`1440×1000`桌面独立1:1 PASS证据和 release notes。批准只授权创建 Git tag、推送该 tag 和创建 GitHub Release。发布 workflow 必须直接附加 Ticket 13 的既有 tarball，不能重新 build 或 pack。GitHub Release 必须记录 artifact identity、Source Contract Identity 要求、兼容版本、已知限制和用户自行安装入口。

### 实现跨度

Release Preview、Release Approval、artifact identity 复核、Git tag、GitHub Release、release notes 和用户自行安装入口。本 Ticket 不删除或重写 Ticket 13 已验收 commit 中的产品管理 CLI。

### Blocked by

- Ticket 13 — 从一次构建的版本化产品包完成真实产品验收。

## Ticket 15 — 补齐产品基线：交付 harness-comfyui Agent Preset 与作用域化 Tool/Skill

### 产品目的

产品安装完成后，操作员启动真实Harness Host与Client，Harness必须从当前release的`dsh-home/.agent-presets/harness-comfyui/`发现状态正常的`harness-comfyui` Agent Preset。rc.8把这个公开Harness home root标记为`user` trust；项目不得伪造system trust或修改`@deepseek-ai/dsh`包目录。使用该Preset创建的Agent只能取得本产品明确注册的model-facing Tool与当前release附带的项目Skill；`standard`、`minimal`与测试Preset的Agent不能取得项目Tool，也不能从默认Skill roots发现项目Skill。

本Ticket是GitHub Issue #2的附加Ticket。它补齐#2没有交付的Agent运行边界，不回滚或重做#2已经交付的安装、启动、状态、日志、升级与回滚程序。

### 产品需求文档

- `docs/v0.1/PRDS/15-agent-preset-and-scoped-capabilities.md`
- `docs/v0.1/agent-preset-tool-skill-runtime-research.md`

### Harness rc.8公共插件机制

本Ticket只能使用rc.8公开的Profile patch、`@deepseek-ai/dsh-agent-presets`、Cordis standing Preset scope、`ctx.tools.register()`、`@deepseek-ai/dsh-skill-filesystem`与`@deepseek-ai/dsh-tool-skill`。计划执行者不得修改DeepSeek Harness核心代码，不得复制上游包源码，不得为上游包创建patch或fork。

### 实现跨度

1. 创建`config/product-agent.json`，把`harness-comfyui` Preset ID、artifact相对目录`agent-presets`、安装相对目录`dsh-home/.agent-presets`、Skill目录`skills`、`./agent`与`sessionListConvergenceTimeoutMs: 10000`作为唯一结构化常量来源。
2. 创建`agent-presets/harness-comfyui/preset.yml`与`agent-presets/harness-comfyui/agent.cordis.yml`。`preset.yml`固定使用名称`ComfyUI 图像工作台`、说明`只使用当前版本随附的 ComfyUI Skills 与项目 Tools 处理图像生成任务。`和`order: 1`。Agent composition只挂载项目persona、配置为`providerName: harness-comfyui`/`includeDefaultRoots: false`/`watch: false`/`customSkillDirs: [!!js process.env.HARNESS_COMFYUI_SKILL_DIR]`的`dsh-skill-filesystem`、`dsh-tool-skill`和`harness-comfyui/agent`。persona text固定为`You are the DeepSeek Harness ComfyUI workbench Agent. Use only the Tools and Skills mounted by the active Agent Preset. When the user invokes a Skill, follow its instructions and call only the Tools it names. Reply in the user's language.`。
3. 创建`src/agent/plugin.ts`与`lib/agent.js`构建入口；通过`package.json#exports["./agent"]`导出。Agent plugin在standing Preset scope直接调用唯一`registerProjectTools(ctx, definitions)`，不得调用`ctx.tools.restrict()`。rc.8把同一Preset composition的`dsh-tool-skill`与项目Agent plugin注册到同一个standing Preset layer；目标Agent从子scope继承该layer，restriction会同时过滤原生`skill`与项目Tool。rc.8 Web composition已经禁用Host plane的model-facing Tool rows，项目Host plugin也不得注册model-facing Tool；真实Web composition加载后的Host-global Tool schemas必须严格等于`[]`。
4. 从`src/host/plugin.ts`删除Host root的`registerProjectTools()`调用。Host plugin继续拥有配置、Source、Run Repository、Jobs、Remote、Web route与状态服务。
5. 更新`profiles/comfyui-workbench/cordis.patch.yml`：`agent-presets` config固定为`default: harness-comfyui`与`includeUserRoot: true`。rc.8启动器继续拥有随包system root，并追加当前release的`DSH_HOME/.agent-presets` user root；项目不得声明或伪造第二个system root。
6. 扩展既有产品管理CLI。install与upgrade必须把artifact的项目Preset复制到`<release>/dsh-home/.agent-presets/harness-comfyui/`；start/restart/upgrade/rollback必须使用该release的`DSH_HOME`，传入`HARNESS_COMFYUI_SKILL_DIR=<active-release>/package/skills`并固定`DSH_TOOLS_MODE=native`，调用者ambient值不能覆盖。`preflight`只能在Host未启动时检查tarball内的结构化合同、Preset文件、Agent bundle与精确Profile patch，不能调用`agentPreset.list`。停止态`status`只能检查active release、release-local Preset/Skill路径、进程与端口，不能调用`agentPreset.list`或声称取得运行时roster。running `status`必须在process state、PID identity与端口均证明受管Host正在运行后调用一次`agentPreset.list`；`health`只有在自己的process检查通过后才能调用一次该接口。process state缺失、PID identity不匹配、端口未监听或端口由非受管进程占用时不得发送该RPC。在线成功路径必须确认唯一项目记录满足`trust === "user"`、`isDefault === true`且`broken === undefined`。rc.8 roster不含路径；`health.agentPresetInstallation`固定保存`status`、`releaseRelativeRoot: "dsh-home/.agent-presets/harness-comfyui"`、`requiredFiles: ["preset.yml", "agent.cordis.yml"]`与`skillRelativeRoot: "package/skills"`，`health.agentPresetRoster`成功时只保存`status: "passed"`、`id: "harness-comfyui"`、`trust: "user"`与`isDefault: true`。这些只读命令不得创建Session。
7. Release Artifact必须包含`agent-presets/**`、`lib/agent.js`与业务Ticket后续提供的`skills/**`。业务Skill尚未交付且tarball不保留空目录时，install与upgrade必须以`mkdir({recursive: true})`物化`<release>/package/skills`并拒绝symlink或非目录。安装程序不得把项目Skill复制到`DSH_HOME/skills`、`.dsh/skills`或`.agents/skills`。
8. 更新Tickets 04与12的既有安装约束：项目Skill保存在release的`package/skills`，只由项目Preset的custom Skill root读取。

本Ticket结束时后续业务Tool尚未实现，因此真实项目Agent的model-facing schemas只能包含Harness原生`skill` Tool。Tickets 03、04与05只能通过同一`registerProjectTools()`集合增加各票交付的Tool，不得另建Tool注册入口。

### 开发运行

计划执行者必须为本Ticket创建独立Git worktree；不得在`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-3`中修改、暂存、提交或重排Issue #3的现有文件。执行者在自己的worktree中构建tarball，并复用#2交付的产品管理CLI在该worktree的`runtime/production/`完成install、preflight、start、status、health、logs、restart与stop。

### 验收标准

1. 没有Host进程时，`preflight`通过tarball静态检查，停止态`status`通过release-local Preset/Skill路径检查，并且两者都不发送`agentPreset.list`请求；Host运行后，running `status`与`health`分别通过`agentPreset.list`返回`trust: "user"`、`isDefault: true`且`broken`缺失。Preset路径由独立静态检查证明位于当前release Harness home的`harness-comfyui`。health测试必须覆盖process state缺失、PID identity不匹配与非受管进程占用端口，并证明三种分支均未请求`/api/agentPreset.list`；成功health必须分列`agentPresetInstallation`与不含路径的`agentPresetRoster`。
2. `sessions.create({ cwd: hostDescription.cwd, agentPreset: "harness-comfyui" })`返回相同resolved ID，Session header保存该ID。
3. 真实`comfyui-workbench` Web composition加载后的Host-global Tool schemas严格等于`[]`；实际项目子Agent scope的Tool schemas严格等于`["skill"]`。
4. 测试项目Tool只对项目Agent可见，`standard`、`minimal`与测试Preset不可见。
5. 测试Skill只对项目Agent的Skill catalog与原生`/`菜单可见，其他Preset从默认Skill roots不能发现它。
6. Preset root缺失、Skill root缺失、必需row挂载失败、roster缺失与resolved ID不匹配分别返回具体错误，不能改用`standard`。
7. tarball-only installation在来源checkout不存在时仍通过真实Host/Client完成上述路径。
8. 独立审核者在真实浏览器确认Preset roster与原生`/`菜单隔离。该Ticket没有原型可见区域，不新增移动端布局。
9. 不安装新依赖。若必须提升根manifest已有rc.8包的运行依赖位置，只能使用精确`0.1.0-rc.8`并通过既有双lock安全门禁。

### Blocked by

- GitHub Issue #2 — 交付可安装、可启动、可检查和可回滚的Harness产品基线；该Issue已经完成。

## Ticket 16 — 补齐三列工作台：只创建并打开 harness-comfyui Preset Session

### 产品目的

浏览器用户打开Ticket 02交付的三列工作台时，左列只能显示和打开`SessionSummary.agentPreset === "harness-comfyui"`的普通Session。当前没有项目Session时，工作台必须通过rc.8公开`session.create` API创建一个真实项目Session，等待Harness Session列表确认该记录，再打开该Session。用户发送普通消息后，消息必须由该Session对应的真实Agent处理。

本Ticket是GitHub Issue #3的附加Ticket。它在#3完成现有三列UI后接入严格Session边界，不改动#3开发中的worktree，不增加“新建Session”按钮，不改变原型桌面三列布局、尺寸、样式、文案或输入交互，不实现移动端布局。

### 产品需求文档

- `docs/v0.1/PRDS/16-workbench-session-preset-binding.md`

### Harness rc.8公共接口

本Ticket只能调用`ctx.connection.api.sessions.create(payload, signal)`、`ctx.connection.hostDescription`、`ctx.sessions.list.getSnapshot()/subscribe()`与`ctx.sessions.open(sessionId)`。Preset判断只能读取`SessionSummary.agentPreset`。计划执行者不得调用package-internal `SessionManager`或`ConversationController`，不得创建第二个Session store、Session ID、Agent进程或项目私有Session协议。

### 实现跨度

1. 创建`src/client/workbench/workbench-session-binding.ts`。该模块等待Host description与Session list ready，只接受`origin !== "subagent"`且`agentPreset === "harness-comfyui"`的Session。
2. 当前Session符合条件时保持选择；否则按`updatedAt`降序、`id`升序打开唯一已有项目Session。
3. 没有项目Session时只调用一次`ctx.connection.api.sessions.create({ cwd: hostDescription.cwd, agentPreset: "harness-comfyui" }, signal)`。
4. 创建响应的resolved Preset ID必须严格等于`harness-comfyui`。模块必须等待相同`sessionId`进入Harness Session列表且header Preset匹配后，才调用一次`ctx.sessions.open(sessionId)`。
5. 同一connection generation只能有一个create promise。重复render、列表通知、刷新与重连不能产生重复Session；generation结束或组件卸载必须取消请求与订阅。等待Session列表的时间固定读取`config/product-agent.json#sessionListConvergenceTimeoutMs`的`10000`毫秒。
6. Ticket 02 Client plugin的`inject`增加公开`connection` service；三列Workbench左列直接渲染过滤后的Harness列表。其他Harness页面是否展示其他Preset Session不属于本Ticket范围。
7. 创建`src/client/workbench/session-binding-errors.ts`作为错误码与中文UI文案的唯一来源，固定`WORKBENCH_HOST_DISCONNECTED`、`WORKBENCH_SESSION_CREATE_FAILED`、`WORKBENCH_SESSION_PRESET_MISMATCH`、`WORKBENCH_SESSION_LIST_TIMEOUT`、`WORKBENCH_SESSION_LIST_MISMATCH`与`WORKBENCH_SESSION_OPEN_FAILED`六项映射；具体文案以PRD 16为准。RPC/transport错误、resolved ID缺失或不匹配、Session列表超时、列表header不匹配与open失败必须进入Ticket 02现有中列错误/空态，不能改用`standard`，不能向错误Session提交消息。

### 开发运行

计划执行者必须在GitHub Issue #3完成并合入后创建本Ticket自己的独立Git worktree；不得复用或修改`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-3`中的未提交文件。执行者复用产品管理CLI在自己的worktree创建`runtime/production/` installation并启动真实Host与Client。

### 原型与产品验收

1. 初始没有Session时，真实浏览器只创建一个项目Session，左列出现并自动打开该记录。
2. 用户通过Ticket 02原型对应输入区发送普通消息；真实Harness Agent接收并流式回复。
3. 同时存在`standard`、`minimal`、subagent与两个项目Session时，Workbench左列只显示两个项目Session。
4. 刷新浏览器、Host重连与产品restart后恢复同一项目Session，不额外创建Session。
5. 删除或破坏项目Preset时显示具体错误，不回退到其他Preset。
6. 创建响应Preset不匹配、列表迟到、列表Preset不匹配与open失败分别有自动化测试，并证明没有提交普通消息。
7. 独立视觉审核者在`1440×1000`桌面viewport并排确认Ticket 02的左列Session列表、标题、普通消息、流式状态、输入区与右列阶段状态没有可见回退。本Ticket不得新增控件或改动三列尺寸；不增加移动端验收。

### Blocked by

- Ticket 15 — 交付`harness-comfyui` Agent Preset与作用域化Tool/Skill。
- Ticket 02 — 完成三列工作台、Harness Session列表与普通消息路径。
