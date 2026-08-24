# GitHub Release 最小发布流程与源码生产启动调研

## 1. 调研范围与结论

本报告在 2026-08-24 检查本地 `main`、GitHub 默认分支、GitHub Releases、Git tags、GitHub Actions、根 `package.json`、`pnpm-lock.yaml`、`.gitignore`、三个 workflow、发布脚本、部署脚本和现有产品文档。本报告没有安装依赖，没有运行外部项目，没有启动 Host，没有创建 production installation，也没有创建、移动或删除 Git tag、GitHub Release 或 GitHub Actions run。

本次需求把“发布版本”定义为：发布负责人创建对应 Git tag 和 GitHub Release。发布动作不构建、不打包、不上传自定义 tarball，也不安装或启动产品。

调研得到四个直接结论：

1. 当前仓库把普通 `main` push、Release Preview 和最终 GitHub Release 串在一条自定义 tarball identity 链路上。该链路超出“只创建 Git tag 和 GitHub Release”的需求。
2. GitHub 已经为每个 Release tag 自动提供 Source code ZIP 和 tar.gz。只发布源码版本不需要项目生成或上传 `harness-comfyui-<version>.tgz`。
3. 当前源码 checkout 没有 `prod:start`、没有 `profile:materialize:production`，而 `deploy:start` 只接受已经由 tarball `install` 创建的 active release。源码 checkout 因此没有受支持的生产启动入口。
4. 推荐方案先交付“源码 checkout 的 production prepare/start”，再把发布 workflow 收缩成“核对版本与 commit → 创建 GitHub Release tag 和 Release”，最后删除已经没有消费者的 artifact qualification 文件。迁移顺序不能先删除 tarball 路径再补源码启动路径。

## 2. 已确认事实

### 2.1 本地与 GitHub 默认分支

| 对象 | 2026-08-24 核对结果 | 证据 |
| --- | --- | --- |
| GitHub 仓库 | 私有仓库 `fzfz/harness-comfyui` | `gh repo view fzfz/harness-comfyui --json nameWithOwner,defaultBranchRef,visibility` |
| GitHub 默认分支 | `main` | 同上 |
| 本地分支 | `main` | `git branch --show-current` |
| 本地 HEAD | `46518286cd484d5bdf95dbcff17b7b533cb4f032` | `git rev-parse HEAD` |
| GitHub `main` HEAD | `46518286cd484d5bdf95dbcff17b7b533cb4f032` | `gh api repos/fzfz/harness-comfyui/commits/main` |
| 根 package version | `0.1.17` | `package.json` 第 3 行 |
| Node 版本合同 | `^22.19.0 || >=24.0.0`；`.node-version` 为 `22.19.0` | `package.json` 第 7–9 行；`.node-version` |
| package manager 合同 | `pnpm@11.7.0` | `package.json` 第 6 行 |

本地存在两个未跟踪的 `.planning/` 目录。本报告没有读取、覆盖或删除这些目录。

### 2.2 当前发布流程实际执行的工作

当前 workflow 拓扑如下：

```text
push main
  -> .github/workflows/ci.yml / quality
     -> preinstall security gates
     -> pnpm install --frozen-lockfile
     -> pnpm run quality:fast
  -> .github/workflows/ci.yml / impact
     -> scripts/ci/classify-changes.mjs
  -> .github/workflows/deploy.yml / Artifact Qualification
     -> build
     -> package:pack
     -> package:validate
     -> upload quality-candidate
     -> deploy lifecycle / composition / browser E2E / release smoke
     -> write qualification.json
     -> upload quality-qualified

manual workflow_dispatch
  -> .github/workflows/release.yml / Release Preview
     -> download quality-qualified from a specified run
     -> validate version + commit + run id + tarball SHA-256
     -> generate release-preview.txt
     -> upload release-preview artifact

separate publication action
  -> create annotated Git tag
  -> push Git tag
  -> create GitHub Release
  -> upload the qualified custom .tgz as a Release asset
```

对应的源码事实是：

- `.github/workflows/ci.yml` 第 43–66 行在 `main` push 后分类路径，并在分类结果为 `true` 时调用 `.github/workflows/deploy.yml`。
- `.github/workflows/deploy.yml` 第 21–73 行安装依赖、构建、运行 `package:pack`、运行 `package:validate` 并上传 `quality-candidate`。
- `.github/workflows/deploy.yml` 第 75–225 行让四个后续 job 下载同一个 candidate，并分别运行 deploy lifecycle、composition、browser E2E 和 release smoke。
- `.github/workflows/deploy.yml` 第 227–277 行写入 `qualification.json`，并上传 tarball、artifact manifest、qualification record 和 `lib/**`。
- `.github/workflows/release.yml` 第 1 行把 workflow 命名为 `Release Preview`；该 workflow 只有 `workflow_dispatch`，没有创建 Git tag 或 GitHub Release 的步骤。
- `.github/workflows/release.yml` 第 50–81 行下载既有 qualified artifact，核对 identity，生成 Preview，再次上传 tarball 与证明文件。
- `scripts/release/dry-run.mjs` 第 6–11 行把 build、package:pack、package:validate 和 release:smoke 定义为 release dry-run 的固定步骤。
- `scripts/release/pack.mjs` 第 63–104 行明确规定调用者必须先 build；该脚本删除并重建 `.release/quality/`，运行 `pnpm pack`，然后写入 `artifact.json`。
- `config/quality-gates.json` 第 15–27 行把 `Artifact Qualification`、四个 artifact gate、`artifact.json` 和 `qualification.json` 固化为质量策略。

因此，当前 `.github/workflows/release.yml` 本身不发布版本；当前项目的“发布流程”实际上依赖一次 `main` artifact qualification、一次手工 Release Preview 和 Preview 之后的单独 tag/Release 操作。

### 2.3 GitHub Releases、tags 与 Actions 当前状态

`gh release list` 返回三个 Release：

| Release | 状态 | 发布时刻 | 自定义 Release assets |
| --- | --- | --- | --- |
| [`v0.1.17`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.17) | Latest | `2026-08-24T03:05:38Z` | `harness-comfyui-0.1.17.tgz`，802,398 bytes，SHA-256 `c326d60352a50c48f8d180a3da9c3b67ecce5c1cd8c7eccb85a553a3fea1daba` |
| [`v0.1.3`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.3) | 普通 Release | `2026-08-23T16:24:46Z` | 无 |
| [`v0.1.0-rc.7`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.0-rc.7) | Prerelease | `2026-08-22T11:38:33Z` | 无 |

`v0.1.17` 的 tag object 是 `a75e4eba6ad0d3cb0294c6cbdb0e23780f4783d6`，peeled commit 是 `ff9aefaa211726fad12dd35436f43313a3f021a4`。GitHub API 把该 ref 的 object type 返回为 `tag`，所以它是 annotated tag。当前三个 tag 中，`v0.1.17` 与 `v0.1.3` 是 annotated tag，`v0.1.0-rc.7` 是直接指向 commit 的 tag。

`v0.1.17` 对应的关键 Actions 状态是：

| Run | 结果 | commit | 起止时刻 |
| --- | --- | --- | --- |
| [`CI 32683439210`](https://github.com/fzfz/harness-comfyui/actions/runs/32683439210) | success | `ff9aefaa211726fad12dd35436f43313a3f021a4` | `02:33:20Z`–`02:48:44Z` |
| [`Release Preview 32684542046`](https://github.com/fzfz/harness-comfyui/actions/runs/32684542046) | success | 同上 | `02:53:25Z`–`02:53:58Z` |
| [`CI 32685471026`](https://github.com/fzfz/harness-comfyui/actions/runs/32685471026) | success | 当前 `main` HEAD | `03:09:31Z`–`03:11:25Z` |

Run `32683439210` 的 job 记录确认 candidate job 依次执行 Frozen install、Build candidate、Pack candidate artifact、Validate candidate artifact 和 Upload quality candidate；后续四个 consumer job再次安装依赖并下载 candidate。该 run 从创建到完成用时 15 分 24 秒。Release Preview 另用 33 秒核对并转存 artifact。

### 2.4 仓库内部的发布要求互相矛盾

以下三组正式文本不能同时成立：

1. `README.md` 第 18 行声明“当前 GitHub Release 只发布 Git tag 与 Release 记录，不附加 npm package、tarball 或其他二进制资产”；第 37 行再次声明当前 GitHub Release 没有附加 Release Artifact。
2. `docs/v0.1/PRDS/14-approved-release-publication.md` 第 27–30 行要求发布 workflow 直接附加已经验收的 tarball，并要求 Release 只包含该自定义 tarball。
3. GitHub Issue [`#15`](https://github.com/fzfz/harness-comfyui/issues/15) 的当前正文要求 GitHub Release 附加 Issue #14 验收的同一 tarball。

GitHub 的实际 `v0.1.17` Release 采用第 2、3 组要求，附加了自定义 `.tgz`。`README.md` 仍把当前版本写成 `0.1.3`，当前 package version 和 Latest Release 已经是 `0.1.17`。所以 `README.md` 的发布状态表也已经过期。

本次明确需求选择第 1 组边界：发布动作只创建 GitHub Release tag 与 GitHub Release；GitHub 自动源码归档承担源码下载入口。

### 2.5 干净源码 checkout 包含什么

`git archive --format=tar HEAD | tar -tf -` 证明当前 commit 的源码归档包含以下生产相关输入：

- `config/base.json`、`config/profiles/production.json`、`config/environment-overrides.json` 和 `config/product-agent.json`；
- `profiles/comfyui-workbench/` 的三个 profile 文件；
- `agent-presets/harness-comfyui/` 的两个 Preset 文件；
- `deployment/runtime/package.json`、`deployment/runtime/pnpm-lock.yaml` 和 `deployment/runtime/pnpm-workspace.yaml`；
- 全部 `scripts/deploy/*.mjs` 与两个 `scripts/profile/*.mjs`；
- 唯一跟踪的 build output `lib/agent.js`。

同一源码归档不包含：

- `lib/index.js`、`lib/client.js`、Typert bundles、类型声明和 source maps；
- `.release/quality/artifact.json`、`.release/quality/*.tgz` 与 qualification/preview 文件；
- 当前尚不存在的 `skills/` 目录。

`.gitignore` 第 52–55 行忽略 `.local/`、`runtime/`、`lib/` 与 `.release/`。`lib/agent.js` 是通过 Git 显式跟踪的例外；其余 `lib` 文件来自 build。

`package.json` 的 exports 需要 `lib/index.js`、`lib/client.js`、`lib/types.js`、Typert bundles 和类型声明。干净 checkout 在完成 `pnpm run build` 前不能满足根 package 的运行导出合同。这个事实不要求把 `lib/**` 提交进 Git；源码生产启动命令只需要在启动前明确执行并检查 build。

### 2.6 哪些文件由 build、pack、qualification 和 install 产生

| 文件或目录 | Git 是否跟踪 | 产生者 | 源码生产启动是否需要 |
| --- | --- | --- | --- |
| `deployment/runtime/package.json` | 是 | `scripts/release/sync-runtime-manifest.mjs` 可以从根 manifest 重建 | 直接使用根 `node_modules` 的源码启动不需要 |
| `deployment/runtime/pnpm-workspace.yaml` | 是 | 同上 | 直接使用根 `node_modules` 的源码启动不需要 |
| `deployment/runtime/pnpm-lock.yaml` | 是 | runtime dependency lock 维护步骤 | 直接使用根 `node_modules` 的源码启动不需要 |
| `lib/agent.js` | 是 | build 会重建；Git 保存当前 Agent bundle | production Agent Preset 需要 |
| 其余 `lib/**` | 否 | `pnpm run build` | 需要；启动前必须 build |
| `.release/quality/<package>.tgz` | 否 | `scripts/release/pack.mjs` 调用 `pnpm pack` | 不需要 |
| `.release/quality/artifact.json` | 否 | `scripts/release/pack.mjs` | 不需要 |
| `.release/quality/qualification.json` | 否 | `scripts/ci/artifact-qualification.mjs write` | 不需要 |
| `.release/quality/release-preview.txt` | 否 | Release Preview workflow | 不需要 |
| `<installation>/releases/<version>/package` | 否 | 当前 tarball `install` 解包 | 直接源码启动不需要 |
| `<installation>/releases/<version>/harness-runtime/node_modules` | 否 | 当前 tarball `install` 运行 runtime `pnpm install --prod` | 直接源码启动改用根冻结依赖后不需要 |
| `<installation>/releases/<version>/dsh-home` | 否 | 当前 tarball `install` 物化 profile 与 Preset | 源码启动仍需要一个隔离 DSH home，但不需要 release 目录或 tarball |

`scripts/release/pack.mjs` 不执行 build；`.github/workflows/deploy.yml` 在 pack 前单独运行 build。需要清楚区分“build 产生 `lib`”与“pack 把既有文件收集进 `.tgz`”。

## 3. 源码 checkout 当前不能生产启动的准确原因

### 3.1 根 manifest 没有生产源码命令

根 `package.json.scripts` 存在：

- `profile:materialize:development`；
- `dev:start`；
- `deploy:install`；
- `deploy:start`。

根 manifest 不存在：

- `profile:materialize:production`；
- `prod:prepare`；
- `prod:start`。

以下无安装命令稳定复现 manifest 缺口：

```text
$ npm run prod:start
npm error Missing script: "prod:start"
exit 1
```

本次调研也尝试了 `pnpm run prod:start`。当前本机 pnpm 在读取 script 前发现现有 `node_modules` 需要 purge，并因非 TTY 保护以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 停止。该输出说明本次尝试没有进入 script lookup；它不是本报告判定“缺少 prod:start”的依据。`package.json` 的结构化 script 列表与上述 `npm run` 输出才是确定性证据。

### 3.2 `deploy:start` 不是源码启动入口

以下无 production 写入命令复现 CLI 的静态参数门禁：

```text
$ node scripts/deploy/cli.mjs start
harness-comfyui: usage: harness-comfyui start --installation <absolute-json>
exit 1
```

即使调用者提供 installation JSON，`scripts/deploy/start.mjs` 第 24–43 行仍会：

1. 从 `state/active-release.json` 读取 active release；
2. 校验 active release 的 Preset 与 package；
3. 从 active release 读取 release-local `dsh` executable；
4. 把 Host cwd 设置为 `<active-release>/package`。

`scripts/deploy/install.mjs` 第 329–357 行只接受 tarball，解包到 release staging directory，复制 runtime files，安装 runtime dependencies，再物化 profile。当前 `deploy:start` 因此不能把当前 source checkout 当成 active release。

### 3.3 `scripts/profile/start.mjs` 虽接受 `production`，但缺少完整准备入口

`scripts/profile/start.mjs` 第 8 行允许 `production`，但该脚本只接收 Configuration Profile 名称、DSH home、DSH executable、host 和 port。它不读取 installation JSON，也不负责：

- 把 production installation 的 data/run/media/log/source 路径映射成 `HARNESS_COMFYUI_*` 环境；
- 从调用者环境移除未声明的 `HARNESS_COMFYUI_*` 值；
- 把 `agent-presets/harness-comfyui/` 物化到隔离 DSH home 的 `.agent-presets` user root；
- 提供当前源码对应的隔离 Skill root；
- 检查 `lib/index.js` 等 build outputs 是否存在。

`config/profiles/production.json` 的五个 path 与两个 Source CLI path 默认都是空字符串。`config/schema.ts` 第 53–69 行要求这些字符串非空。直接调用通用 profile start 不能替代 production installation 到 Host environment 的转换。

### 3.4 现有文档只支持 tarball installation

`docs/operations/install-and-run.md` 第 69–85 行把首次安装固定为 `npm exec --package=<absolute-tarball> ... install ... --artifact <absolute-tarball>`，并规定安装后从 `<root>/bin/harness-comfyui` 启动。文档没有 clone/checkout、root frozen install、build、source production materialize 或 source production start 的命令。

## 4. GitHub 官方合同

以下结论只使用 GitHub 官方文档：

1. GitHub Release 基于 Git tag；tag 标记仓库历史中的一个具体位置。[About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
2. GitHub 会自动在 Release 详情中提供该 tag 创建点的 Source code ZIP 与 tarball 下载链接。项目不需要上传第二份自定义源码 tarball。[About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
3. GitHub 的 source archive 是 branch、tag 或 commit 的仓库快照，不包含完整 Git history。固定 commit 可以固定解压后的文件内容；外层压缩字节布局可能随 GitHub 压缩设置变化。[Downloading source code archives](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)
4. GitHub Release 创建界面与 `gh release create TAG` 都允许选择既有 tag 或创建新 tag；二进制附件是可选项。[Managing releases in a repository](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
5. Releases REST API 的 `tag_name` 是必填字段；当 tag 尚不存在时，`target_commitish` 决定 Git tag 的目标。tag 已存在时，GitHub 忽略 `target_commitish`。[REST API endpoints for releases](https://docs.github.com/en/rest/releases/releases)

当前 `v0.1.17` API response 已经同时返回：

- `tarball_url: https://api.github.com/repos/fzfz/harness-comfyui/tarball/v0.1.17`；
- `zipball_url: https://api.github.com/repos/fzfz/harness-comfyui/zipball/v0.1.17`；
- 自定义 asset `harness-comfyui-0.1.17.tgz`。

前两项由 GitHub 根据 tag 自动提供；第三项才是当前项目额外构建和上传的文件。

## 5. 原因判断

本节是基于上一节事实的推断，不是仓库源码直接声明。

### 5.1 发布流程偏离需求的原因

Issue #2、Issue #14 和 Issue #15 把“可脱离源码 checkout 安装的不可变 tarball 产品”当成发布对象。后续 workflow、质量策略、测试与发布文档都围绕该对象固化了 artifact filename、byte length、SHA-256、qualification run 和 release preview identity。该设计可以证明一个自包含 tarball，但该设计回答的问题不是“创建 GitHub Release tag 和 Release”。

### 5.2 源码生产启动缺失的原因

当前架构明确要求 production Host 从 active release directory 启动，并禁止安装后的 Host 读取 source checkout。开发入口只实现 development profile。项目因此交付了“tarball production path”和“source development path”，没有交付“source production path”。

### 5.3 两个问题互相强化

GitHub 自动 source archive 不包含忽略的 build outputs。当前仓库又没有从 source archive 执行 build、物化 production DSH home 并启动 Host 的统一命令。用户只能依赖额外 `.tgz`；额外 `.tgz` 又迫使项目保留 build-once、manifest、hash、qualification 和 preview 链。必须先补 source production path，才能安全删除 tarball 发布链。

## 6. 推荐目标方案

### 6.1 目标发布合同

发布负责人只处理以下结构化输入：

- `version`：必须等于目标 commit 的 `package.json.version`；
- `commit`：必须是 40 位 commit SHA，并且属于 GitHub 默认分支 `main`；
- `tag`：固定为 `v<version>`；
- `release notes`：使用 GitHub 自动生成 notes，或使用已经审核的纯文本 notes。

发布 workflow 只执行以下动作：

1. checkout 指定 commit，仅用于读取 `package.json` 和验证 commit；
2. 验证 `tag === v<package.json.version>`；
3. 验证同名 GitHub tag 与 GitHub Release 均不存在；
4. 执行 `gh release create "$tag" --target "$commit" --title "$tag" --generate-notes`；
5. 读取 GitHub API，确认 Release 的 `tag_name`、`target_commitish`、`tarball_url` 与 `zipball_url`。

该 workflow 不执行 Node setup、pnpm setup、dependency install、build、pack、package validation、artifact download、artifact upload、SHA-256 manifest 或 Release Preview。质量测试属于 merge/CI 合同，不属于发布动作。

如果项目仍要求 annotated tag，发布负责人可以在创建 Release 前执行 `git tag -a` 与 `git push origin <tag>`，然后使用 `gh release create <tag> --verify-tag`。该变体仍然不构建或打包，但它比 GitHub 直接创建 tag 多两个 Git 命令。本次“最小发布”推荐让 `gh release create --target <commit>` 创建并绑定 tag；后续只有在用户明确要求 annotated tag 时才选择该变体。

### 6.2 目标源码生产启动合同

源码生产启动必须继续使用结构化 installation JSON，不能要求用户在 shell 中手写十余个 `HARNESS_COMFYUI_*` 值。推荐新增两个入口：

```text
pnpm run prod:prepare -- --installation <absolute-installation-json>
pnpm run prod:start -- --installation <absolute-installation-json>
```

用户从干净 tag checkout 启动时执行：

```text
pnpm run quality:preinstall
pnpm install --frozen-lockfile
pnpm run prod:prepare -- --installation <absolute-installation-json>
pnpm run prod:start -- --installation <absolute-installation-json>
```

`prod:prepare` 必须完成以下具体工作：

1. 校验 Node engine、pnpm 版本、root lockfile 与 installation JSON；
2. 要求 `installation.configurationProfile` 精确等于 `production`；
3. 执行根 `build`，或者在实现中把 build 保持为 `prod:prepare` 的固定首步；
4. 检查 `lib/index.js`、`lib/client.js`、Typert bundles、`lib/agent.js` 与必需类型文件；
5. 在 installation root 内创建 source runtime DSH home，不在仓库根创建未跟踪的 `skills/`；
6. 把仓库的 `agent-presets/harness-comfyui/` 复制到 source runtime DSH home 的 `.agent-presets/harness-comfyui/`；
7. 把当前 checkout 的业务 Skill 复制到 source runtime 的普通目录；当前 checkout 没有业务 Skill 时创建空目录；
8. 调用现有 `scripts/profile/materialize.mjs`，使用根 `node_modules/.bin/dsh` 和当前 checkout 作为 package spec 物化 `comfyui-workbench` profile；
9. 记录 source commit、package version、DSH home 与 build outputs 的可读状态。该记录不能伪装成 GitHub Release artifact identity。

`prod:start` 必须完成以下具体工作：

1. 重新读取并校验同一 installation JSON；
2. 从进程环境移除调用者传入的全部 `HARNESS_COMFYUI_*`，再从 installation JSON 生成允许的 Host environment；
3. 固定 `DSH_TOOLS_MODE=native`；
4. 固定 `DSH_HOME` 为 source runtime DSH home，固定 `HARNESS_COMFYUI_SKILL_DIR` 为 `prod:prepare` 物化的 source Skill 目录；
5. 使用当前 checkout 的绝对根目录作为 Host cwd；
6. 使用根 `node_modules/.bin/dsh` 启动前台 Host；
7. 把 `SIGINT` 与 `SIGTERM` 转发给同一子进程，并在 Host 退出后返回对应 exit code。

`prod:start` 不创建 release directory，不读取 `.release/quality/artifact.json`，不运行 `pnpm pack`，不解包 tarball，也不调用当前 `deploy:install`。

### 6.3 单一来源要求

当前 `scripts/deploy/lifecycle.mjs` 第 416–438 行已经保存 installation JSON 到 Host environment 的完整映射。源码生产启动不能复制一份字符串表。实现者应把该映射提取到一个结构化模块，例如 `scripts/runtime/host-environment.mjs`，并让现有 deploy lifecycle 与新 source production start 共同调用该模块。

`config/product-agent.json` 继续作为 Preset artifact root、Preset install root、Skill relative root 和 Preset ID 的唯一结构化来源。源码 production prepare 不能把这些路径重复硬编码到 Markdown 或第二份 JSON。

## 7. 文件级变更边界

### 7.1 第一阶段：先交付源码 production path

| 文件 | 变更 |
| --- | --- |
| `package.json` | 增加 `prod:prepare` 与 `prod:start`；不让任一入口自动安装依赖 |
| `scripts/profile/source-production.mjs` | 新增 `prepare`/`start` 的确定性 CLI；只写 installation root 内的 source runtime 目录 |
| `scripts/runtime/host-environment.mjs` | 新增 installation JSON 到 Host environment 的唯一映射 |
| `scripts/deploy/lifecycle.mjs` | 改为调用 `scripts/runtime/host-environment.mjs`，删除原有重复映射 |
| `config/source-production-installation.example.json` | 新增完整 JSON 示例；示例值明确要求用户替换为绝对路径 |
| `.gitignore` | 仅在新的 source runtime 路径不位于现有 `runtime/` 或 `.local/` 时增加精确 ignore；不扩大 ignore 范围 |
| `tests/unit/source-production.test.ts` | 覆盖参数、production profile、build output 缺失、Preset/Skill materialization、环境清理、spawn、signal 与 exit code 分支 |
| `tests/contract/engineering-baseline.test.ts` | 把源码 production scripts、结构化示例和禁止 pack 依赖写入工程合同 |
| `tests/composition/source-production-composition.test.ts` | 在受控临时 installation 中验证 source checkout build outputs、Preset、profile、Skill root 与 Host composition |
| `docs/operations/install-and-run.md` | 增加“从 GitHub source checkout 启动 production”章节；把 tarball installation 标成旧版本兼容路径 |
| `README.md` | 更新当前版本事实与源码生产启动命令 |

第一阶段不修改现有 `scripts/deploy/install.mjs`、upgrade、rollback 或已发布 tag。这样可以先证明新路径，再迁移发布流程。

### 7.2 第二阶段：把发布收缩为 tag 与 GitHub Release

| 文件 | 变更 |
| --- | --- |
| `.github/workflows/release.yml` | 删除 qualification inputs 与 artifact download/validation/upload；增加 `contents: write`，只校验 version/commit/tag 并创建 GitHub Release |
| `.github/workflows/ci.yml` | 删除 `impact` 对 artifact qualification workflow 的调用；保留代码合并所需的质量与 source production composition 测试 |
| `.github/workflows/deploy.yml` | 在 source production 测试已经进入 CI 后删除；如果保留 product lifecycle CI，必须更名并删除 pack/upload 语义 |
| `config/quality-gates.json` | 删除 `qualification` 对 artifact filenames 与 workflow name 的绑定；保留 coverage 与变更分类所需字段 |
| `package.json` | 删除 `release:dry-run`、`release:smoke`、`package:pack`、`package:validate` 和 `quality:artifact` 的发布绑定；保留普通 `build` 与必要测试 |
| `scripts/ci/artifact-qualification.mjs` | 删除 |
| `scripts/release/dry-run.mjs`、`pack.mjs`、`preview.mjs`、`validate-package.mjs`、`smoke.mjs` 及其仅有 helper | 删除；仍有非发布消费者的确定性 helper 移到对应领域目录后再删除原文件 |
| `tests/release-package/**`、`tests/release-smoke/**`、`tests/build-artifacts.test.ts` | 删除 tarball identity 测试；把仍有价值的 build/runtime 检查迁移到 source production tests |
| `tests/contract/workflows.test.ts`、`tests/release-package/package-scripts.test.ts` | 改为验证 tag-only Release workflow 不含 install/build/pack/upload-artifact，并验证 CI 调用 source production tests |
| `docs/operations/test-gates.md` | 删除 artifact qualification/preview 文案，区分 CI acceptance 与 GitHub Release publication |
| `docs/v0.1/PRDS/13-release-artifact-acceptance.md`、`docs/v0.1/PRDS/14-approved-release-publication.md`、`docs/adr/0011-development-workspace-and-versioned-delivery.md` | 按用户确认的新合同改写；文件中的执行主体必须分别指向 CI 验收者与发布负责人 |
| `README.md` | 明确 Release 只包含 GitHub 自动 source archives，不附加自定义 package |

GitHub Issue #1、#14 和 #15 的正文仍要求 tarball。仓库文件完成并经用户审核后，项目维护者需要单独取得 GitHub 写入授权，再更新三个 Issue；本次调研没有修改 Issue。

### 7.3 第三阶段：处理 tarball installation 兼容代码

当前 `scripts/deploy/` 同时承担 tarball install 和完整 product lifecycle。第二阶段不应机械删除整个目录。项目维护者需要先选择以下一个明确结果：

- 保留旧版 tarball installation CLI，只用于已经下载旧 `.tgz` 的用户；新 Release 不再生产 `.tgz`；或
- 把 lifecycle CLI 改为管理 source production runtime，然后删除 tarball preflight/install/upgrade/rollback 分支。

本次需求只要求 tag-only Release 与 source production start。推荐先采用第一项，避免把发布简化任务扩大为 lifecycle 重写。现有 `v0.1.17` installation 把 CLI 和 runtime 保存到自己的 release directory；主分支后续删除 pack workflow不会改变已经安装的 v0.1.17 文件。

## 8. 迁移顺序

1. 维护者先冻结本报告中的目标合同：GitHub Release 不附加自定义 tarball；source checkout 是新版本生产启动入口。
2. 实现者先完成 `prod:prepare`、`prod:start`、共享 Host environment mapping 和全部分支测试。
3. 验收者从一个没有 `lib/`、`.release/`、`.local/`、`runtime/` 和 `node_modules/` 的干净 checkout 开始，在依赖已经按安全规范安装后完成 build、prepare、start、只读 health probe 和前台停止。
4. 验收者确认 source production Host 使用当前 checkout commit、当前 checkout build outputs、隔离 DSH home 和 installation JSON 指定的 production 路径。
5. 实现者再修改 `.github/workflows/release.yml`，并把 source production composition 纳入普通 CI。
6. 验收者对 Release workflow 运行静态合同测试，确认 workflow 不含 `pnpm install`、`build`、`pack`、artifact download、artifact upload 或 production lifecycle 命令。
7. 维护者更新 README、operation docs、PRD、ADR；GitHub Issue 更新需要单独的 GitHub 写入授权。
8. 用户批准一个新的 exact version/commit 后，发布负责人用新 workflow 创建首个 tag-only GitHub Release。
9. 发布负责人通过 GitHub API 核对 tag、commit、Release 和自动 `tarball_url`/`zipball_url`；发布负责人不得上传自定义 `.tgz`。
10. 首个 tag-only Release 与 source production start 验收通过后，维护者删除 artifact qualification、release-package 和 release-smoke 的无消费者代码。

## 9. 验收清单

### 9.1 发布验收

- [ ] `package.json.version` 与 `v<version>` 完全一致。
- [ ] Release target 是用户批准的 40 位 `main` commit。
- [ ] 同名 tag 与 Release 在发布前不存在。
- [ ] Release workflow 没有 setup-node、pnpm、dependency install、build、pack、package validation、artifact download 或 artifact upload 步骤。
- [ ] Release 创建后，GitHub tag 指向批准 commit。
- [ ] GitHub Release 的自定义 `assets` 数组为空。
- [ ] GitHub Release API 返回 tag 对应的 `tarball_url` 与 `zipball_url`。
- [ ] 发布动作没有创建 installation、启动 Host 或写入 production 数据。

### 9.2 干净源码 checkout 验收

- [ ] 验收目录最初不存在 `node_modules/`、`lib/`、`.release/`、`.local/` 与 `runtime/`。
- [ ] 安装者只执行安全规范允许的精确 `pnpm@11.7.0` frozen install；`prod:prepare` 不自动安装依赖。
- [ ] `prod:prepare` 运行根 build，并验证所有 runtime exports 对应的 `lib` 文件。
- [ ] `prod:prepare` 只在 installation root 写入 source runtime DSH home、Preset 与 Skill 目录。
- [ ] source runtime DSH home 不等于用户默认 DSH home。
- [ ] `prod:start` 读取唯一 installation JSON，且 `configurationProfile` 为 `production`。
- [ ] `prod:start` 忽略调用者 ambient `HARNESS_COMFYUI_*`，并从 installation JSON 重新生成每个允许值。
- [ ] Host cwd 指向当前 checkout，Host executable 指向当前 checkout 根 `node_modules/.bin/dsh`。
- [ ] Host 能加载 `lib/index.js`、Client bundle、Typert bundles、`harness-comfyui` Preset 和隔离 Skill root。
- [ ] Host 不读取 `.release/quality/*.tgz`，不创建 release directory，也不调用 `pnpm pack`。
- [ ] `SIGINT` 与 `SIGTERM` 只结束同一个前台 Host 子进程，并返回确定的 exit code。
- [ ] 启动失败时错误文案明确指出缺少的 installation 字段、build output、Preset、Skill root 或 DSH executable。

### 9.3 文档与语义验收

- [ ] README 的当前 version、Latest Release、commit 和发布日期来自同一个 GitHub Release。
- [ ] README 不再同时声明“无 tarball”与“用户必须下载项目自定义 tarball”。
- [ ] `docs/operations/install-and-run.md` 提供完整可复制的 source checkout production 命令。
- [ ] PRD、ADR、GitHub Issue 分别使用明确主体：“CI 验收者”“发布负责人”“源码 installation 操作员”。
- [ ] 独立语义审核者逐条确认文档没有把 CI 测试、GitHub Release publication 与 production operation 混写成同一动作。

## 10. 本次实际运行的只读或无 production 写入命令

```text
git status --short --branch
git remote -v
git branch --show-current
git rev-parse HEAD
git log -8 --oneline --decorate
git ls-tree -r --name-only HEAD
git archive --format=tar HEAD | tar -tf -
git check-ignore -v <path>
git show-ref --tags -d

gh repo view fzfz/harness-comfyui --json nameWithOwner,url,defaultBranchRef,visibility,isPrivate
gh api repos/fzfz/harness-comfyui/commits/main
gh release list --repo fzfz/harness-comfyui --limit 50
gh release view <tag> --repo fzfz/harness-comfyui --json ...
gh api repos/fzfz/harness-comfyui/git/matching-refs/tags/
gh api repos/fzfz/harness-comfyui/releases/tags/v0.1.17
gh workflow list --repo fzfz/harness-comfyui --all
gh run list --repo fzfz/harness-comfyui --limit 40 --json ...
gh run view 32683439210 --repo fzfz/harness-comfyui --json ...
gh run view 32684542046 --repo fzfz/harness-comfyui --json ...
gh issue view 1 --repo fzfz/harness-comfyui --json ...
gh issue view 14 --repo fzfz/harness-comfyui --json ...
gh issue view 15 --repo fzfz/harness-comfyui --json ...

node scripts/release/sync-runtime-manifest.mjs --check
node scripts/deploy/cli.mjs start
npm run prod:start
```

`node scripts/release/sync-runtime-manifest.mjs --check` 返回 `runtime manifest is current`。后两个命令在参数或 manifest 门禁阶段退出，没有创建 installation 或启动 Host。调研结束时，`git status --short --branch` 没有出现本报告之外的 tracked file 修改。
