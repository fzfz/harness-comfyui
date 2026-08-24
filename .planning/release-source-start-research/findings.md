# Release 与源码生产启动调研发现

## 已确认边界

- 用户原始需求是：项目发布版本时创建 GitHub Release 与 Git tag。
- 用户没有授权本轮修改发布流程、安装依赖、创建 tag、创建 GitHub Release 或启动生产环境。
- 当前 `main` 与 `origin/main` 同步；仓库根目录存在其他任务的过程文件，`.planning/issue-1-native-ui-entry-discussion/` 是未跟踪的用户文件。

## 历史上下文

- 既有设计把 Agent Preset 和 Skills 放在 active release 的 `package` 与 release-local `DSH_HOME` 中；该设计可能导致发布包成为运行时输入，需要使用当前代码重新验证。
- 既有记录要求发布、部署和生产启动保持为不同授权边界。本轮只分析当前项目，不把其他仓库的发布脚本直接当作本项目方案。

## 待验证

- 当前 GitHub Actions 是否生成压缩包、npm 包、校验文件或其他 Release assets。
- 当前源码 checkout 的 `prod:start` 或等价入口依赖哪些未提交的构建产物。
- 当前发布包的构建、安装与启动流程是否把源码 checkout 排除在生产启动路径之外。

## Phase 1 证据

- `package.json` 定义 `dev:start` 和九个 `deploy:*` 生命周期脚本，但没有定义 `prod:start` 或其他直接从源码使用 `production` Configuration Profile 的入口。
- 确定性反馈环命令直接读取 `package.json` 并断言 `scripts.prod:start` 存在。该命令以退出码 1 报告：`FAIL: package.json scripts.prod:start is absent; a GitHub source checkout has no production start command`。
- `node scripts/deploy/cli.mjs start` 以退出码 1 报告：`harness-comfyui: usage: harness-comfyui start --installation <absolute-json>`。现有 `start` 入口要求 Product Installation，而不是源码目录。
- `scripts/deploy/start.mjs` 从 installation root 的 `state/active-release.json` 读取 active release，再校验 release package、release-local `dsh-home` 和 release-local Harness executable；源码 worktree 不是该函数接受的运行输入。
- `docs/adr/0011-development-workspace-and-versioned-delivery.md` 和 `docs/operations/install-and-run.md` 明确要求生产流程先使用 tarball 创建版本目录。文档还明确声明首次安装后的 `start` 不读取源码 worktree。
- `.github/workflows/deploy.yml` 构建、打包、校验并跨多个 Job 下载同一个 tarball；`.github/workflows/release.yml` 只生成 Release Preview 并重新上传该 tarball。当前本地 workflow 没有 Git tag 或 GitHub Release 创建步骤。

## GitHub 当前状态

- GitHub 仓库 `fzfz/harness-comfyui` 是私有仓库，默认分支是 `main`。本轮读取时远端 `main` 与本地 `main` 都指向 `46518286cd484d5bdf95dbcff17b7b533cb4f032`。
- GitHub 当前有三个 Release：`v0.1.0-rc.7`、`v0.1.3` 和最新 `v0.1.17`。
- `v0.1.17` 指向提交 `ff9aefaa211726fad12dd35436f43313a3f021a4`，并附加 `harness-comfyui-0.1.17.tgz`。附件大小是 802398 bytes，GitHub 记录的 SHA-256 是 `c326d60352a50c48f8d180a3da9c3b67ecce5c1cd8c7eccb85a553a3fea1daba`。
- `v0.1.17` Release notes 把 Artifact Qualification run `32683439210` 与 Release Preview run `32684542046` 作为发布前提，并明确要求用户使用该 tarball 运行安装 CLI。
- GitHub 只登记 `CI`、`Artifact Qualification` 和 `Release Preview` 三个 workflow。当前仓库的 `Release Preview` workflow 只有 `contents: read`，没有创建 tag 或 GitHub Release 的权限和步骤。因此“谁创建了当前 tag/Release”无法从当前 workflow 代码直接证明；结合缺少发布 workflow，可以推断实际发布使用了 workflow 之外的人工或本机命令，但该推断不是 GitHub 审计日志证据。

## 需要纠正的检查输出

- 一个 shell 分类循环把多个已存在路径输出为 `untracked-or-ignored-present`。该循环的判断结果不作为证据；`git ls-files --stage -- <path>` 已重新证明 `package.json`、`deployment/runtime/pnpm-lock.yaml`、`scripts/profile/materialize.mjs` 和 `scripts/profile/start.mjs` 都是 tracked 文件。

## 源码 checkout 的静态闭包

- `.gitignore` 排除整个 `lib/`，但是提交树通过强制跟踪保留了 `lib/agent.js`；`lib/index.js`、`lib/client.js`、类型声明和 Typert bundle 等 `package.json.files` 所需产物不在提交树中。GitHub 自动 source archive 因此不能直接提供完整可加载 package，源码使用者必须先安装精确依赖并执行 `pnpm build`。
- `scripts/profile/materialize.mjs` 已接受 `production` Configuration Profile，也接受 worktree 的 `--package-spec .`；但是 `package.json` 只为 `development` 暴露 materialize/start 命令。
- `config/profiles/production.json` 把数据目录、Run Repository、Run 目录、Saved Media、日志、Catalog CLI 和 Source CLI 保持为空。生产 profile 必须通过 `HARNESS_COMFYUI_*` 环境映射取得这些值。
- installed lifecycle 从 `installation.json` 构造全部 `HARNESS_COMFYUI_*` 值，并把 Skill 目录与 release-local package 绑定；源码 profile runner 只设置 `DSH_HOME`、`HARNESS_COMFYUI_CONFIGURATION_PROFILE` 和 PATH。因此即使直接调用 `scripts/profile/start.mjs --configuration production`，当前源码路径也缺少必需生产配置注入。
- 当前 `README.md` 没有源码生产启动说明，并且其版本表仍写 `v0.1.3`；GitHub 当前 Latest Release 已经是 `v0.1.17`。

## 需求漂移的仓库证据

- `README.md` 第 18 行从提交 `a149cd5c` 开始明确写明：“当前 GitHub Release 只发布 Git tag 与 Release 记录，不附加 npm package、tarball 或其他二进制资产。”该文字在当前 `main` 中仍然存在。
- 当前 GitHub `v0.1.17` 实际附加 tarball，因此仓库说明与当前发布结果直接冲突。
- 当前父 Issue #1、Issue #14 和 Issue #15 已经把同一 tarball 的 build、qualification、preview、SHA-256 和 GitHub Release attachment 写成硬性流程。该 Issue 合同已经把“验收内部构建产物”扩大为“GitHub Release 必须分发该构建产物”。
- `docs/adr/0011-development-workspace-and-versioned-delivery.md` 的当前单段决定由提交 `b292e1cd` 引入；该提交同时是 `v0.1.3` 的 release commit。后续需要读取该提交差异，区分原始 ADR 与发布时新增要求。

## GitHub 官方契约

- GitHub 官方资料说明：任意 branch、tag 或 commit 都可以下载 source code tarball/zipball；GitHub Release 的 Assets 区域自动提供对应 tag 的 Source code (zip) 与 Source code (tar.gz)。因此只创建 tag 与 GitHub Release 已经能够分发源码，不需要上传项目自定义 tarball。
- GitHub 创建 Release 的页面把 binary files 明确定义为可选内容。项目没有二进制分发需求时，可以创建不带自定义 asset 的 Release。
- GitHub CLI 官方手册说明：`gh release create` 的文件参数是可选的；不传文件就不会上传自定义 asset。
- GitHub CLI 在 tag 不存在时会默认从 default branch 最新状态自动创建 tag。为了把版本绑定到已检查的精确 commit，推荐方案必须先创建并推送明确 tag，然后使用 `gh release create <tag> --verify-tag ...`；`--verify-tag` 会在远端 tag 不存在时停止。
- 仓库安全规则禁止通过 `npx` 下载并执行 Context7 包，因此本轮没有运行 `find-docs` Skill 默认的 Context7 CLI；官方契约直接来自 GitHub 官方文档和 GitHub CLI 官方手册。

## 实现规模和可复用 seam

- artifact/install/release 方向当前占用 `scripts/release/` 与 `scripts/deploy/` 共 29 个脚本文件，并至少对应 `tests/release-package/`、`tests/deploy/`、`tests/release-smoke/` 中 21 个测试文件；workflow contract 和 package contract 还在其他测试中逐字锁定该流程。
- `tests/contract/engineering-baseline.test.ts` 明确只允许 development source aliases，并逐项锁定 deploy lifecycle、tarball package files 和 `quality:artifact`。源码生产入口不是遗漏了一行文档，而是被当前合同测试主动排除。
- `scripts/deploy/lifecycle.mjs` 中把 `installation.json` 映射为清理后的 `HARNESS_COMFYUI_*` 环境这一段实现可以成为源码生产启动 module 的内部实现；它当前与 active release 路径、release-local Skill 和 DSH_HOME 耦合，不能直接从 worktree 调用。
- 适合的新 seam 是一个 source production runner，其外部 interface 只接收一个绝对生产运行配置路径。该 module 内部验证路径、从配置构造 Harness 环境、绑定 worktree `skills/`、绑定 worktree `node_modules/.bin/dsh`、检查完整 `lib/` build outputs，然后调用现有 foreground profile runner。
- 该 source production runner 不应复制 install、upgrade、rollback 或第二套 profile implementation。其内部应复用现有 Configuration Profile validator、`scripts/profile/materialize.mjs` 和 `scripts/profile/start.mjs`；调用者只需要学习 prepare 与 start 两个命令。

## 历史差异

- `v0.1.0-rc.7` 和 `v0.1.3` 两个 GitHub Release 的自定义 assets 都为空；`v0.1.17` 是当前三个 Release 中第一个附加自定义 tarball 的版本。
- 提交 `21e8181` 用 1221 行新增/改动把 artifact qualification、跨 Job artifact 下载、qualification record 和 Release Preview identity 固化进 workflow 与测试。
- 提交 `b292e1cd` 在发布无附件的 `v0.1.3` 时同时创建“GitHub Release 必须附加 tarball”的 PRD，并把 ADR 改成所有产品 Issue 必须从 tarball 安装后运行。也就是说，仓库在同一个 release commit 中同时保留了无附件 Release 事实和面向后续版本的附件强制合同。
- 提交 `f2edfa9` 只把 package version 准备为 `0.1.17`；当前 `v0.1.17` Release notes 与附件执行了上述后续附件合同。

## 根因结论

- 发布偏差的直接原因不是 GitHub 限制，而是父 Issue、Release PRD、Artifact Qualification workflow 和测试把“内部质量验收产物”升级成了“GitHub Release 必须分发的产品”。
- 源码 production 启动失败的直接原因是 `package.json` 不提供 production source interface；深层原因是 product lifecycle 只接受 tarball 解包后的 active release，并且文档与合同测试明确禁止 production Host 读取源码 worktree。
- 两个问题共享同一个架构决定：Release Artifact 被同时赋予质量验收载体、用户分发载体和 production runtime source 三种责任。只删除 GitHub asset 会让 runtime source 消失；只增加源码启动而保留附件合同会继续维持重复的两套交付路径。

## 推荐目标方案

### 1. 发布 interface

- 用户显式触发发布时，发布流程只接收 `version` 与精确 `commit`。
- 发布流程验证 `package.json.version`、`v<version>` tag、精确 commit 和远端 tag 冲突；该验证不执行 build、pack、artifact qualification、installation、production start 或 deployment。
- 发布流程创建 annotated Git tag、推送该 tag，并执行不带文件参数的 `gh release create <tag> --verify-tag --title <tag> --generate-notes`。
- GitHub 自动生成的 Source code (zip) 与 Source code (tar.gz) 是该 Release 的源码下载入口；GitHub Release 的自定义 `assets` 数组必须为空。
- `.github/workflows/release.yml` 可以保留为手工 `workflow_dispatch`，但 inputs 从四个缩减为 `version`、`commit`，权限改为完成 tag/Release 所需的 `contents: write`。workflow 不调用其他 workflow，也不下载、上传 artifact。

### 2. 源码 production interface

- 源码使用者执行显式 `pnpm install --frozen-lockfile`。仓库脚本不自动安装依赖。
- `pnpm prod:prepare -- --installation <absolute-json>` 执行 worktree build，验证全部必需 `lib/` outputs，并通过现有 `scripts/profile/materialize.mjs` 在该 production root 下物化 source profile。
- `pnpm prod:start -- --installation <absolute-json>` 读取并验证现有 installation JSON，把其中的 paths、ComfyUI default instance、Catalog CLI、Source CLI、host、port 和 refresh interval 映射为清理后的 `HARNESS_COMFYUI_*` 环境；该命令绑定当前 worktree 的 `skills/`、当前 worktree 的 `node_modules/.bin/dsh` 和 production source profile，然后调用现有 foreground runner。
- `prod:start` 不读取 `.release/quality/artifact.json`、tarball、`state/active-release.json`、release-local Harness runtime 或 versioned release directories。用户通过 SIGINT/SIGTERM 停止前台 Host；本轮目标不复制 install/upgrade/rollback 流程。
- source production runner 的外部 interface 只有绝对 installation JSON 路径。配置映射、build-output 检查、worktree Skill 路径、DSH_HOME 和 child process 环境全部属于该 module 的 implementation。

### 3. CI interface

- `.github/workflows/ci.yml` 保留 dependency advisory、build-script audit、frozen install、typecheck、coverage、contract、prototype 和 build。
- CI 使用临时 production installation JSON 调用新的 source production runner，完成 composition、browser E2E 和 source production smoke；这些测试验证同一 checkout，不生成或跨 Job 传递 tarball。
- CI 不调用 `package:pack`、`package:validate`、Artifact Qualification、Release Preview artifact 或 tarball-only lifecycle。

## 文件级改造边界

### 新增或重构

- `package.json`：新增 `prod:prepare` 与 `prod:start`；删除 publish path 对 pack/install artifact 的依赖。
- `scripts/production/cli.mjs` 或等价单一 module：实现 prepare/start 的参数解析、production config 映射和明确错误。
- `scripts/deploy/lifecycle.mjs`：把 installation-to-environment 纯映射提取为 source runner 与仍保留代码可复用的内部函数；该函数不接受 active release。
- `tests/production-source/`：覆盖 source prepare/start 的全部分支和一次真实 foreground smoke。
- `.github/workflows/release.yml`：改成只创建 tag 与 GitHub Release 的手工 workflow。

### 删除或退休

- `.github/workflows/deploy.yml` 的 Artifact Qualification pipeline。
- `scripts/ci/artifact-qualification.mjs`。
- `scripts/release/pack.mjs`、`preview.mjs`、`dry-run.mjs`、`validate-package.mjs` 以及只服务 tarball identity 的实现和测试。
- `scripts/deploy/` 中只服务 tarball install、versioned release、upgrade 和 rollback 的实现；若 status/health/logs 仍有当前产品价值，计划执行者必须先把它们改为读取 source production process，再删除 active-release 假设。
- `tests/release-package/`、tarball-only `tests/deploy/`、`tests/release-smoke/` 以及 `tests/contract/workflows.test.ts` 中的 artifact identity 断言。
- 根提交树中被强制跟踪的 `lib/agent.js`；所有 `lib/` 文件统一由 `pnpm build` 生成，源码 archive 不混入单个陈旧 build output。

### 文档与 GitHub 规格

- `README.md`：把安装说明改成 clone/checkout tag → frozen install → prod:prepare → prod:start；同步最新版本记录。
- `CONTEXT.md`、`docs/adr/0011-development-workspace-and-versioned-delivery.md`、`docs/operations/install-and-run.md`、`docs/operations/test-gates.md`、PRD 13、PRD 14：删除 GitHub Release attachment、tarball-only installation 和 Release Artifact 作为 production source 的要求。
- GitHub 父 Issue #1、Issue #14 和 Issue #15：分别改成 source-first product、源码 production 验收、tag/Release-only publication。已关闭 Issue #2 保留历史事实；新建一个纠偏 Issue 承担 source runner 与 artifact lifecycle 退休，避免把新的实现责任写进已关闭票据。
- 文档和 GitHub Issue 是语义产物；独立语义审核者必须逐项确认“build/test 不等于 publish”“GitHub Release 无自定义 asset”“production 从 checkout 运行”三个对象没有再次混写。

## 迁移顺序

1. 计划执行者先获得用户对 source-first 目标合同的确认，再修改父 Issue 与开放 Issues；本轮不发布这些修改。
2. 实现者先增加 source production runner 与完整测试，使 checkout 能够独立启动 production。
3. 实现者把 composition、E2E 和 smoke 切换到 source production runner；全部测试通过后，源码路径成为唯一验收路径。
4. 实现者删除 artifact qualification、tarball installation、upgrade/rollback 和对应测试；该步骤之后仓库不再依赖 Release Artifact。
5. 实现者把 release workflow 缩减为 tag + GitHub Release，并验证 GitHub Release 的自定义 assets 为空。
6. 文档编写者同步 README、CONTEXT、ADR、operations、PRD 和 GitHub Issues；独立语义审核者出具验收清单。

## 验收清单

- 一个新 clone 在安装锁定依赖、填写 production installation JSON 和运行 `prod:prepare` 后，可以运行 `prod:start`。
- `prod:start` 使用 production Configuration Profile、worktree build outputs、worktree Skills 和 worktree `dsh`；它不读取 tarball、active release 或全局 `dsh`。
- 缺少依赖、缺少 build outputs、缺少 profile、无效 installation JSON、Source CLI 路径无效、端口已占用和 Host 提前退出都有唯一明确错误，并且不静默切换配置或可执行文件。
- SIGINT 与 SIGTERM 都会结束 Host 并释放端口；测试不会遗留子进程。
- PR/main CI 不执行 pack，不上传或下载项目 tarball。
- 手工 release workflow 不执行测试、build、pack、install 或 start，只验证版本与 commit、创建 tag、创建 GitHub Release。
- 新 Git tag 指向用户批准的精确 commit；GitHub Release 标题与 tag 使用同一版本；自定义 assets 为空；GitHub 自动 source zip/tar.gz 可下载。
- README、CONTEXT、ADR、operations、PRD 和 GitHub Issues 对同一对象使用同一表述，不再同时出现“无附件 Release”和“必须附加 tarball”。

## 备选方案

- 过渡方案：先添加 source production runner，并让 Release 不再附加 tarball，但暂时保留 artifact qualification 与 deploy CLI 作为内部未调用代码。该方案可以更快恢复功能，但保留约 29 个 artifact/deploy 脚本和大批合同测试，维护成本与概念冲突仍然存在。
- 不建议方案：保留当前 tarball 作为 GitHub asset，仅补一段下载说明。该方案继续违反用户原始发布边界，也没有解决源码 checkout 的 production interface。
- 不建议方案：把完整 `lib/` build outputs 提交到 Git。该方案让 source archive 表面上可直接加载，但会引入源码与生成文件双重事实来源；正常的 frozen install + build 已经能够确定性产生这些文件。

## 已观察的本机旁支状态

- `pnpm run prod:start` 没有进入脚本解析。pnpm 11.7.0 先尝试刷新现有 `node_modules`，随后在非交互终端中以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止。
- 该输出只说明当前本机依赖目录状态与 pnpm 预期不一致，不证明 GitHub checkout 的源码生产入口存在或不存在。本轮禁止安装依赖，因此反馈环改为直接校验 `package.json`。
