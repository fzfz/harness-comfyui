# 官方 Desktop 插件化升级方案

## 必须要实现的目标

### 总目标

实施者将 Harness ComfyUI 升级为以官方 DeepSeek Harness Desktop 为运行宿主的完整插件产品，统一插件开发、测试、发布、安装、更新与使用流程。升级完成后，用户通过官方应用安装和运行插件，开发者在独立 worktree 中自动完成官方应用 E2E 验证，生产交付采用固定版本插件包；项目维护范围集中于插件业务能力及其构建、测试和文档。

实施者为此移除第三方 Desktop 依赖和面向用户的宿主安装、启动与进程管理逻辑，把必要的预设、Skills、配置及资源装配能力纳入插件，按“生产目录退役与首次切换”完成获授权的旧生产环境交接，并同步修订代码、测试、使用文档和仓库规范。总目标的完成条件以“验收清单”A1 至 A18 为准，各项执行权限以“已获得的授权”为准。

### 保留能力与支持范围

目标产品保留 Catalog 查询、上下文插入、Generation Run、媒体查看与下载、历史参数查询、图片读取、八个项目 Skill、ComfyUI 工作台与迭代预设，以及预设中的子 Agent 能力。官方应用负责自身安装、升级、启动、退出、Profile 和模型凭据。

首轮支持目标是本机 macOS 官方 Desktop `0.2.0-rc.2`。其他系统的支持声明以对应系统的真实安装和业务验收结果为准。

## 已获得的授权

审批状态：已批准实施。

用户于 2026-09-30 批准本方案，授权实施者在下表指定的 worktree 和分支保留已有修改，完成仓库代码修改、联调、自动化验收、OpenRouter 免费模型验收和正式 ComfyUI Run 验收。实施者按“实施顺序与完成条件”推进，并将通过验收的候选提交到当前分支。各项单独授权条件按本章末段执行。

| 对象 | 本轮记录 |
| --- | --- |
| 开发基线 | `742570c4d7ab17272baac0eb3211536751002c9a`，项目版本 `0.44.3` |
| 分支 | `codex/official-desktop-plan` |
| Worktree | `/Users/fzfz/.codex/worktrees/official-desktop-plan/harness-comfyui` |
| 本机应用 | `/Applications/DeepSeek Harness.app`；Info.plist 为 `com.deepseek.dsh`、`0.2.0-rc.2` |
| 本机附带工具版本记录 | `Contents/Resources/runtime/versions.json`：Node `24.18.1`、pnpm `11.7.0`；该记录属于附带工具，Host 的 Electron Node 版本另行验收 |

实施者可以修改本方案列明的仓库代码、配置、测试和文档，并调用已安装的官方 Desktop 完成本方案的隔离能力、联调和验收测试。外部依赖的安装及其他外部程序运行须先提供精确清单和审计意见，并取得对应授权。修改项目 Skill 内的脚本或程序、公开发布、合并、生产切换、历史数据迁移及旧环境处置各自需要用户明确授权。实施者在授权前先完成可独立完成的代码和候选产物。

用户于 2026-09-30 单独批准修改 `anima-prompt-builder`、`krea2-anime-prompt-builder` 和 `wai-sdxl-prompt-builder` 的 `scripts/cli-help.mjs`。实施者按 `docs/verification/official-desktop-plugin/skill-script-authorization.json` 的对象与用途，使帮助命令使用 Host 提供的 Node 入口，并按项目规范完成相关测试和独立语义审阅。其余单独授权条件继续按上一段执行。

用户于 2026-10-01 明确批准创建 PR、合入 `origin/main`、发布版本、迁移本机旧生产目录数据，并在本机官方 Desktop 中安装插件和验收。实施者按本方案已有完成条件执行这些动作；历史数据迁移先按“首次切换步骤”准备对象映射并完成隔离试迁移。旧生产目录与原数据继续保留；旧环境归档和物理删除继续遵守本章的单独授权条件。授权记录见 `docs/verification/official-desktop-plugin/release-migration-authorization-20261001.json`。

用户随后明确要求执行者停止对安装异常、活动卸载恢复和脱离源码运行进行追加验收，并停止其他追加验收，仅完成合并、发布、正式数据迁移和插件安装。本轮执行者依据已有质量检查结果完成交付，并在验收记录中保留此前未完成项目的原状态。具体范围见 `docs/verification/official-desktop-plugin/delivery-scope-20261001.json`。旧环境归档和物理删除继续按本章取得单独授权。

## 官方依据与兼容风险

官方源码依据固定在 tag `dsh-v0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。官方 [Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2) 是预发布版本。实施者以本机版本号与该 tag 一致作为选定测试目标的依据，并按阶段 1 验证插件安装与业务能力。

| 官方事实 | 对项目的影响 | 依据 |
| --- | --- | --- |
| Desktop 自带 Harness 运行时与包管理器，管理专用 desktop Profile。 | 插件通过宿主机制加载，移除面向用户的宿主安装和启动职责；开发测试按下文 E2E 机制调用官方应用。 | [Desktop 文档](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/README.md) |
| 插件页接受包名、Git、tarball 和本地绝对路径；更新采用卸载后重装。 | 首选发布预构建插件 tarball；更新文档必须覆盖重装与配置保留。 | [插件页文档](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-plugin-manager/README.md) |
| 插件管理器检查 DSH peer；包替换需要进程重启。 | 修改精确兼容声明并测试重新打开应用后的实际版本。 | [插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/boot/plugin-manager/README.md) |
| 插件配置使用 `plugins.bundle.config` 或 `plugins.row.config`。 | ComfyUI 配置迁到插件详情页，复用现有业务表单。 | [配置扩展位](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-plugin-manager/README.md#configuration-pages) |
| Desktop 安装的 dsh 命令可在应用完全退出后管理 desktop 插件；普通 npm dsh 无此权限。 | 可选终端路线只引用官方 Desktop 的命令。 | [官方命令](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/README.md#bundled-command-runtime) |
| Host 在 Electron Node 模式运行，包安装用的 Node 环境与 Agent shell 环境不同。 | 单独验证子进程、managed CLI、Sharp、SQLite 与 Workflow 编译。 | [运行时设计](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/architecture/2026-09-11-desktop-electron-node-runtime.md) |

当前项目存在以下具体耦合：

| 当前文件或模块 | 已核实的问题 | 实施结果 |
| --- | --- | --- |
| `package.json` | DSH peers 为 `>=0.1.7-rc.2 <0.1.8`，exports 指向启动器生成的 `.local/source-*`。 | 声明经过验收的官方版本，exports 指向插件发行包内的构建产物。 |
| `scripts/desktop/anywhere.mjs` | 同时负责打包、Profile 写入、宿主启动与进程管理。 | 分离纯构建逻辑后删除宿主管理部分。 |
| `cordis.patch.yml`、`config/web-plugin-patch.json` | 根 bundle 依靠启动器补入 Web 入口，同时覆盖模型、Provider、Bash 超时与默认 Preset。 | 形成能够独立安装的完整 bundle，用户模型与全局默认由官方应用管理。 |
| `scripts/profile/agent-preset.mjs`、`agent-presets/` | 预设由启动器复制到 DSH home 并生成 Profile patch。 | 从已安装插件资源注册两个 Preset，随插件启停和升级管理生命周期。 |
| `config/product-agent.json` | Skills 路径依靠启动器注入 `HARNESS_COMFYUI_SKILL_DIR`。 | 按安装包位置解析 Skills，保留两个预设的作用域隔离。 |
| `src/config/load-profile.ts`、`config/base.json` | 数据目录缺省为空，依靠启动环境补齐；浏览器路径带有本机假设。 | 使用插件配置与官方数据目录，提供可编辑的浏览器路径。 |
| `src/host/core/plugin.ts` | Workflow worker 使用字面量 `node`。 | 使用经验证的宿主 Node 执行入口，覆盖无系统 Node 的环境。 |
| `src/host/cli/`、`scripts/cli/harness-comfyui.mjs` | Skills 通过前台 shell 调用项目业务接口。 | 保留 managed CLI；其职责是调用业务服务。 |
| `scripts/cli/run.mjs`、`profiles/comfyui-cli/` | 独立创建并启动 headless DSH。 | 按本次产品范围删除独立 headless 启动功能。 |
| `tests/desktop/`、`tests/production/` | 大量测试依赖第三方 Desktop 和旧启动器。 | 把业务断言迁入官方应用安装、加载和升级测试。 |

## 目标结构与用户操作

### 插件包和加载

实施者在 `scripts/build/` 建立仅构建本项目的命令，并在 `package.json` 提供 `build`、`pack:plugin`。产物采用 `harness-comfyui-<版本>.tgz`，包含 Host、Client、managed CLI、Workflow worker、数据源客户端、两个 Preset、共享 component、八个 Skill 及其执行资源、配置与 schema。

实施者为发行包声明 `files` 清单并生成正确的 exports、`dsh.bundle.patch` 和 `dsh.client`。构建测试在仓库之外解开候选包并验证所有引用，覆盖带空格路径和只读安装目录。插件通过官方 peer 解析宿主服务；插件自己的 `sharp` 等运行依赖由包声明提供。发行包的安装步骤仅消费预构建产物。

实施者将 Preset 注册纳入 bundle composition，保留 `harness-comfyui-cli-candidate` 和 `harness-comfyui-iteration` 两个 ID 及现有名称。Preset component 与 Skills 路径按安装包资源解析，用户在官方会话界面选择预设。官方应用的全局默认 Preset 和默认对话模型继续由用户选择。

官方 [Preset registry](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/preset/agent-preset-registry/README.md) 通过 `@deepseek-ai/dsh-agent-preset` row 注册预设。实施者继续使用官方 filesystem Skill provider，把 `customSkillDirs` 绑定到安装资源，保留 `includeDefaultRoots: false`；[shellEnv 接口](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/shell/shell-env/README.md) 负责每次工具执行的环境变量。

实施者首先核对官方 Preset schema 和公开注册接口，使用相同身份测试重复加载、停用和更新。若该版本缺少实现某项必需能力的公共接口，实施者提交具体阻塞与最小替代方案，等待用户选择受影响的产品范围。

### 配置、文件与进程

实施者在 `src/client/settings/` 保留数据源与图片读取表单，把注册入口改到 `plugins.bundle.config`，以 `harness-comfyui` 作为配置归属。浏览器可执行路径、插件数据位置及必要的运行参数通过插件配置提供；共享结构由 schema 统一定义，默认值与跨模块常量由结构化配置提供。

实施者从官方公开运行时路径接口取得宿主数据根，再使用插件专属子目录保存 SQLite、Run、媒体和缓存。配置保存于官方 Profile 设置层，凭据通过宿主提供的凭据机制保存。插件包只保存可替换的代码和资源。多个 Workspace 的数据查询继续使用真实 Workspace 与 Session 身份；隔离测试 Profile 使用独立数据根。

实施者按官方 [bundle 发布约定](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/user/develop/basic/publish.md) 验证配置覆盖：bundle、Profile、home、invocation 依次覆盖，row 的 `config` 按整体替换处理。设置保存与默认值测试覆盖部分用户配置，防止升级后丢失必需字段。

实施者保留 managed CLI 的专用回环 listener、前台 Tool Call capability 和卸载清理。Host 通过 `shellEnv` 注册 CLI 调用所需变量，提供明确的解释器与脚本入口，令 Skills 在普通用户打开官方应用时即可调用。实施者验证 `process.execPath` 与 Electron Node 模式对数据源客户端及 Workflow worker 的适用性，并为派生浏览器进程设置其所需环境。

实施者保留 ComfyUI 官方前端编译所需的浏览器进程和数据源业务子进程。这些业务进程仍属于生成和读图链路。宿主的日常启动由官方应用负责，开发测试的进程管理由下文测试夹具负责。浏览器与 ComfyUI、数据源服务由使用者预先准备，插件设置页说明缺失对象与配置操作。

`src/host/generation/generation-coordinator.ts` 中的 Generation Coordinator 负责推进已接纳 Run 的提交、状态轮询及媒体保存。本文以 coordinator 指代该组件。

### 安装、启动与更新流程

下列流程是待实现产品的使用方案，具体文案以官方 `0.2.0-rc.2` 实机验收为准。

1. 用户安装并打开官方 Desktop，在应用内完成模型和 Workspace 配置。
2. 用户进入“插件 → 添加插件”，填入项目 Release 中预构建 tarball 的下载地址，或本地候选包绝对路径，安装并启用插件。
3. 用户根据宿主提示重新打开应用，在插件详情页配置数据源、图片读取和浏览器路径。
4. 用户选择 ComfyUI 工作台或迭代预设，插入 Workflow 等上下文并完成生成。日常启动入口就是官方 Desktop。
5. 更新时，用户先等待活动生成结束，完全退出应用，按下一段备份，再重新打开应用，通过官方插件页卸载旧包、安装目标版本、启用并完整重启应用。验收者核对显示版本、配置和历史 Run。

实施者在阶段 1 确认实际 Profile 配置文件、插件凭据引用对应的存储文件及插件数据目录，并在更新指南列出绝对路径和属于本插件的条目。用户在应用完全退出后，把配置文件、凭据文件和完整数据目录复制到独立备份目录，保留凭据文件权限。重装后若核对失败，用户先退出应用并复制失败现场，再从备份恢复插件配置条目和同名凭据条目，把完整插件数据目录恢复到原路径；其他条目保持恢复前的值。回装旧候选时使用同一恢复步骤，并核对旧版本、历史 Run、媒体、配置读取和一次业务请求；验收记录保存备份路径、恢复对象与结果。

官方管理器对仍在使用且无法卸载的 bundle 会要求先停止宿主；安装指南在该情况下引导用户使用下述官方终端路线。首次安装官方应用的下载地址须从官方渠道重新核验；本次官方 GitHub Release 没有 Desktop 安装附件。

可选终端路线由官方“Manage dsh Command”提供。用户先运行应用完成 Profile 初始化，再完全退出，使用官方命令 `dsh plugin --profile desktop add <插件包>`、`list`、`remove <包名>`，随后重新打开应用。文档解释“关闭窗口”与“退出应用”的差别。

项目继续通过 GitHub Releases 发布版本，并新增预构建插件附件。普通用户使用附件安装；开发者使用本地构建包验收。项目的 npm 发布暂不纳入本次范围。

## 生产目录退役与首次切换

### 交付与运行职责

生产交付采用“发布固定版本插件包、在官方 Desktop 安装、核对实际加载结果”的流程。发布者在开发与发布环境生成已验收的 tarball；生产使用者按“安装、启动与更新流程”安装该发行包。日常启停、日志查看及插件配置由官方应用和插件自身界面提供。

| 对象 | 切换后的职责 |
| --- | --- |
| `/Volumes/4Tdisk/work/AI2/harness-comfyui` | 继续承担源码开发、测试和发布准备。 |
| `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` | 作为旧生产版本、配置和运行数据的迁移来源，在本节规定的退役条件满足后归档。 |
| 正式插件安装目录 | 由官方插件管理器从固定版本发行包安装，随插件版本替换；实际位置写入切换记录。 |
| 持久配置、凭据和业务数据 | 按“配置、文件与进程”规定保存，更新保留行为由 A4 验收。 |
| 生产验收记录 | 保存发布 tag、完整源码提交 SHA、发行包地址和版本、官方应用版本、实际加载位置及业务结果。 |

正式使用环境的插件来源统一为已发布 tarball。构建与依赖审核留在开发、发布阶段，插件运行依赖由官方包管理流程按发行声明安装。生产使用者通过官方应用运行插件，原生产 checkout 退出源码更新、构建和宿主启动职责。

### 首次切换步骤

1. 发布者完成阶段 4，在获得发布授权后发布固定版本插件包。切换执行者确认隔离官方实例已经通过功能验收，并准备生产切换记录。
2. 切换执行者在取得生产切换授权后，核对旧实例的 PID、进程关系和运行目录，等待活动任务结束；需要取消任务时，由用户明确选择。执行者使用旧版本仍保留的停止方式退出旧实例，确认其进程已停止。
3. 执行者在旧实例停止后，把旧 checkout 的版本与改动记录、Git 忽略的配置和凭据、`.local/desktop-production/` 及其引用的外部数据目录备份到独立位置，保留文件权限，记录实际路径。执行者核对备份中的数据库可读、Run 文件与媒体可打开、配置文件齐全后继续切换。
4. 执行者按“安装、启动与更新流程”在用户日常使用的官方 Desktop 中安装发行包，并通过官方界面配置模型、Workspace 和插件。首次切换的数据处理采用本节下一段的选项。
5. 执行者核对发行包与实际加载身份，完成 A16 所列生产业务验收和 A18 的生产验收。切换失败时，执行者保存故障证据，退出新实例并保留其数据；需要恢复旧实例时，向用户提交旧版本、备份状态和两边新增数据情况，按用户选择使用保留的旧环境恢复服务。
6. 执行者在 A17 满足后，把旧生产 checkout 标记为退役并保留可恢复归档，记录归档位置和恢复说明。物理删除旧安装及数据另行取得用户授权。

本次基础切换在官方环境新建配置与会话，旧历史数据保持可恢复。用户需要历史会话、Run 和媒体进入新环境时，执行者先提交单独迁移方案。该方案必须核对 Session 与 Workspace 身份映射、凭据引用、数据库和文件路径，并通过隔离试迁移验证目标记录可查询、媒体可打开及归属正确后，再实施获授权的生产迁移。目标环境按映射导入选定数据，旧运行目录作为原始备份保留。

### 退役条件与后续维护

旧目录的退役条件由 A17 统一定义。退役后，维护者按“安装、启动与更新流程”交付后续版本；故障报告使用官方应用日志、插件错误、Session/Run ID 和实际安装版本。插件版本回装按 A4 执行，首次跨宿主切换的恢复按本节第 5 步执行。

## Worktree 自动化 E2E 与调试机制

本方案将“E2E 测试夹具”定义为 `tests/desktop/fixtures/` 中负责隔离环境、调用已安装官方应用、安装候选插件、连接调试接口及清理测试进程的开发测试代码。`pnpm test:desktop` 执行该代码，`pnpm quality` 将其作为完整门禁的一部分。测试夹具只管理本轮测试资源；用户日常使用的入口仍是官方 Desktop。

### 安装版能力验证门槛

实施者在获得运行授权后，首先使用已安装的官方 Desktop 验证 Harness home、Electron user-data、单实例锁、Host 端口和 Renderer CDP 的隔离方式，并验证能否获取 Host 日志及连接 Host Inspector。官方[开发入口说明](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/README.md#develop)提供 Main、Renderer 和 Host 调试配置；这些开发入口参数在安装版中的可用性以本阶段实测为准。

实施者用两个临时测试环境验证并行启动：两者分别创建会话、保存设置并检查各自的插件管理记录；退出其中一个后，另一个继续工作。验收记录必须包含实际应用版本、应用路径、PID、子进程关系、目录、端口及各环境的安装记录。测试夹具使用经验证的启动参数；实施者同时提供 Harness home、Electron user-data、单实例锁、Host 端口和 Renderer CDP 的隔离证据。

若安装版缺少必要的隔离或 Renderer CDP 能力，实施者保留旧测试链路，提交具体失败证据和可行的独立系统用户或测试机器方案，等待用户决定验证环境。官方源码开发版的测试结果单独记录，正式安装包验收继续使用目标安装版。Host Inspector 不可用时，实施者明确记录断点调试限制，并通过 Host 日志、业务响应和持久化结果完成对应断言。

### 配置与资源归属

实施者新增 `config/desktop-e2e.json` 和 `config/desktop-e2e-schema.mjs`，统一定义已安装官方应用的路径与预期版本、隔离目录规则、端口分配策略、等待期限及证据输出目录。E2E 测试夹具将每轮实际值保存到 `.local/desktop-e2e/<run-id>/run.json`，由同一配置 schema 定义其结构；凭据通过显式选择的测试配置提供，记录文件保存凭据引用。

开发者在每个 worktree 的 `.local/desktop-development/official-environment/` 保留专用 Harness home、Electron user-data、开发 Workspace 与插件业务数据。首次启动者通过官方界面完成登录和 Provider、模型设置；后续启动者复用该环境，并核对官方保存的初始化状态。E2E 测试夹具在开发调试模式下，每轮独立分配端口和进程身份，保存日志与证据，停止时只清理本轮进程。

自动化验收者分别执行全新环境的首次初始化测试和已初始化环境的业务测试。业务测试基线由验收者在专用隔离环境中完成官方初始化后建立，保存于当前 worktree 的 `.local/desktop-e2e/baselines/`；基线保留初始化设置、凭据引用和安装配置。验收者为各轮业务测试创建独立副本，保持测试会话、Run、媒体和运行状态属于本轮目录，并核对副本中实际加载的本轮候选包。开发环境和测试基线均属于 Git 忽略区域。

| 资源 | 测试夹具的管理方式 |
| --- | --- |
| 每轮运行目录 | 在当前 worktree 的 `.local/desktop-e2e/<run-id>/` 中保存 Harness home、Electron user-data、安装记录和证据。 |
| Workspace | 创建独立业务目录；Skills 作用域测试按 A5 使用仓库外 Workspace。 |
| 端口与进程 | 每轮分配独立 Host、CDP 及可用的 Inspector 端口；连接或停止前核对端口所属 PID、启动命令和本轮目录。 |
| 候选插件 | 使用当前 worktree 构建的 tarball，记录包版本、源提交、工作区改动状态与安装位置。 |
| 业务数据 | SQLite、Run、媒体、缓存及测试设置全部写入本轮隔离目录。 |
| 失败证据 | 保存截图、Renderer 控制台、Host 日志、请求结果和相关 Session/Run ID；日志按项目规则脱敏。 |

### 自动化运行与交互调试

1. 测试夹具检查应用版本、配置和测试凭据是否就绪，构建当前 worktree 的插件包，建立本轮隔离目录。
2. 测试夹具调用官方应用完成测试 Profile 初始化，再通过官方插件管理 UI 或该应用附带的 dsh 命令安装候选包。使用附带命令时，先完全退出对应测试实例，再安装并重新启动。安装器验收至少覆盖真实插件页安装流程。
3. 测试夹具连接本轮 Renderer CDP，核对真实应用页面、插件版本和安装位置，并等待 Host 接口与插件 Client 都可用后执行测试。
4. 测试通过真实界面操作设置、会话、预设、上下文和媒体，同时检查 Host 响应、CLI 结果及持久数据。自动化回归使用受控模型、数据源与 ComfyUI 服务；最终真实模型和 ComfyUI Run 验收按“最终真实模型与正式 ComfyUI Run 验收”执行。
5. 插件源码变化后，测试夹具重新构建并通过官方机制安装新候选包，完整重启测试实例，再次确认加载身份。发布门禁始终使用候选 tarball。
6. 成功、失败、取消和启动超时都进入清理流程：保存证据、请求退出本轮应用、等待本轮子进程退出并释放端口。超时后只终止已经确认归属的本轮残留进程，并将清理失败计入测试失败。

开发者需要交互调试时，通过测试命令的显式调试选项保留本轮实例，使用 Renderer DevTools 和可用的 Host Inspector 定位问题。该选项必须显示实例身份、连接地址、证据目录与停止方法；自动化门禁使用自动退出模式。测试依赖缺失或必要接口不可用时，命令返回非零退出码并说明准备步骤。

## 删除、保留与重构清单

实施者在新 E2E 测试夹具通过 A13 至 A15 且旧业务断言迁移完成后，按下表删除旧模块，并通过 import 检查和构建结果确认没有残留引用。

| 处置 | 文件或模块 | 具体结果 |
| --- | --- | --- |
| 提取后删除 | `scripts/desktop/` | 把仍需使用的实例身份核对与进程清理逻辑迁入测试夹具；移除 anywhere/fork 选择、旧 Electron 启停、首次设置、Profile 手工安装、旧配置和凭据物化、旧 Session 自动迁移。 |
| 提取后删除 | `scripts/worktree/`、`scripts/development/port.mjs` | 把所需的跨进程端口分配能力迁入测试夹具，移除独立 Web Host 管理入口。 |
| 提取后删除 | `scripts/production/` | Client、Host、managed CLI 构建器移入 `scripts/build/`；启动、停止、状态、日志和进程快照代码退役。 |
| 提取后删除 | `scripts/profile/`、`profiles/` | 保留预设结构校验并迁入插件构建或注册模块；删除宿主 Profile 模板及其文件写入器。 |
| 删除 | `scripts/cli/run.mjs`、`src/host/cli/runner.ts`、`config/cli-runtime*` | 删除独立 headless 产品入口；`workspace.ts` 的登记能力按官方会话行为判断是否移入共用模块。 |
| 删除 | 旧 `config/desktop-*.json`（保留新增的 `desktop-e2e.json`）、`config/web-*.json`、`config/source-production.json`、`config/launcher-cli-help.json` | 删除宿主运行配置；实施者先把业务参数和仍需使用的插件装配字段迁入对应配置。 |
| 重构 | `config/product-agent.json`、`config/runtime-artifacts.json`、`config/schema.ts`、`config/environment-overrides.json`、`config/profiles/production.json`、`config/base.json` | 改为插件安装资源、业务设置和持久数据配置，移除启动器字段及空路径依赖。 |
| 重构 | `package.json`、`pnpm-lock.yaml`、`cordis.patch.yml`、`.env.example` | 使用官方兼容声明、插件构建入口及业务配置；移除 `prod:*`、`dev:*`、`web:*`、`desktop:dependencies:link`、`cli:run` 等宿主入口。 |
| 保留并适配 | `src/host/`、`src/client/`、`src/cli/`、`scripts/source-client/`、managed CLI | 保留业务能力，按官方公共接口修正加载和运行方式。 |
| 保留并适配 | `agent-presets/`、`.agents/skills/` | 保留现有角色、任务流程、工具作用域和八个 Skill；开发者调整安装资源解析，Skill 执行者继续按 Skill 内参考文档调用业务 CLI。 |
| 重构 | `tests/desktop/`、`tests/production/`、`tests/integration/headless-*`、`vitest.config.*` | 迁移现有 CDP 操作和业务断言，按“Worktree 自动化 E2E 与调试机制”新增测试夹具及其配置，替换旧启动器测试。 |
| 重构 | `scripts/security/` | 审计插件锁文件与公共依赖边界，移除第三方 Desktop checkout 路径要求。 |

代码删除清单仅适用于本次开发树。旧生产 checkout、旧 Desktop 安装和旧运行数据的操作按“生产目录退役与首次切换”执行。

## 实施顺序与完成条件

| 阶段 | 执行主体与动作 | 产物 | 完成条件 |
| --- | --- | --- | --- |
| 1. 验证官方安装版与固定依赖 | 实施者按 E2E 能力门槛验证隔离与调试，再核对公共 exports、Client 插槽、Preset、shellEnv、路径与 Settings API，整理依赖清单和审计。 | 安装版能力记录、接口差异表、精确依赖清单。 | 安装版隔离与 Renderer CDP 实测通过；必需业务接口明确；全部待安装项有准确版本、用途、审计意见与授权。 |
| 2. 构建插件与 E2E 测试夹具 | 实施者完成 `scripts/build/`、发行 manifest、完整 bundle、Preset/Skills 装配、配置、数据路径及测试夹具。 | 本地候选 tarball、安装结构测试、可自动启动和清理的官方应用测试。 | 候选包脱离仓库可解析完整入口；测试夹具完成隔离实例启动、候选安装、CDP 连接和进程清理。 |
| 3. 适配与清理 | 实施者完成 Client、managed CLI、worker、原生模块适配和 E2E 业务断言，再按“删除、保留与重构清单”的条件清理启动器及测试。 | 业务功能候选、完整自动化测试、更新重装测试。 | A1 至 A15 全部通过，候选插件的开发和使用均已脱离第三方 Desktop。 |
| 4. 文档与候选验收 | 实施者完成文档；独立 Reviewer 完成 Standards、Spec 和语义审阅；实施者修正后完成本方案规定的真实模型与正式 Run 验收，再执行最终门禁。 | 可审批的版本候选、真实验收记录、Release 附件草案。 | A18 的候选验收、`pnpm quality`、`git diff --check` 与全部独立审查通过。 |
| 5. 发布与生产切换 | 发布者取得发布授权后发布插件附件；切换执行者按“生产目录退役与首次切换”完成获授权的停机、备份、安装、验收及归档。 | Git tag、Release、生产切换记录、旧环境归档记录。 | 发布提交与 `origin/main` 的完整 SHA 一致；附件来自该提交；A16、A17 及 A18 的生产验收通过。 |

阶段 1 的精确依赖清单必须逐包列出包名、版本、用途、来源、公告查询日期、传递依赖风险和安装脚本。当前候选宿主版本为 `0.2.0-rc.2`；仓库现有 `sharp 0.35.4` 先保留。其余 peer、构建依赖和原生绑定以官方 manifest 及实际解析结果确定。实施者完成清单及安全审计并取得对应安装授权后，按清单中的准确版本安装。

实施者先修改与新目标冲突的开发验收规范，再按“Worktree 自动化 E2E 与调试机制”操作官方测试实例。项目保留 `pnpm quality` 作为完整门禁，纳入静态检查、依赖检查、业务测试、插件包测试和自动化 Desktop E2E。

## 最终真实模型与正式 ComfyUI Run 验收

### 模型与环境

最终候选验收者与生产切换验收者必须使用 OpenRouter 免费模型完成本节所有真实模型项目，并使用实际数据源、实际 ComfyUI 实例和已安装的插件包完成正式 Run。自动化回归中的受控服务用于重复测试，最终验收以真实请求、真实返回和持久化产物为依据。

验收者在执行时查询 OpenRouter 的模型信息，选择当时可用且输入、输出价格均为零的具体模型 ID，记录查询时间、价格信息、Provider route 和实际请求模型。对话、Tool Call、子 Agent 和视觉任务分别选择支持对应能力的免费模型；各角色模型及图片读取模型通过隔离的验收配置显式指定，记录与产品配置的差异。生产验收需要临时修改模型配置时，先记录原值，验收后恢复并核对用户配置。

免费模型遇到限流、额度不足、不可用或能力不符时，验收者保存失败证据，选择满足同一能力要求的其他 OpenRouter 免费模型，或等待服务恢复后重试。仍未成功的项目标记为“未通过”，最终验收保持未完成状态；付费模型结果及模拟服务结果分别记录在其自身测试类别中。

### 真实模型验收矩阵

| 验收项目 | 执行与通过条件 |
| --- | --- |
| 预设与 Skills 作用域 | 验收者在仓库外 Workspace 中分别使用两个 ComfyUI Preset 和其他可用 Preset，执行 A5，并核对用户未显式指定 Preset 时采用官方应用所选默认值。 |
| 八个项目 Skill | 验收者逐个构造符合各 Skill description 的实际请求，确认模型读取相应 SKILL.md、任务分支要求的参考文档，并完成该分支；涉及 CLI 时取得真实前台 Tool Call 及返回。每个 Skill 保存独立验收结果。 |
| 工作台与子 Agent | 验收者使用 ComfyUI 工作台完成目录查询、上下文使用、任务首派和同一子会话续派，按 A6、A7 核对工具调用、Session 和 Workspace 归属。 |
| 迭代四角色 | 验收者使用 ComfyUI 迭代预设完成构图、生成、独立观察、比较和后续派发；核对四角色实际模型均符合本节免费模型条件，并按 A7 核对会话复用和通知。 |
| 图片读取 | 验收者通过本地图片读取及 Run 媒体读取路径调用具备图像输入能力的免费模型；审阅 Agent 对照实际图片判断观察是否有图像依据，并记录请求、返回和判断。 |
| 历史查询与结果使用 | 验收者要求模型查询本节新生成 Run 的参数、Seed、模型、LoRA 和 Actual Workflow，核对回复与持久记录一致；通过界面验证媒体查看、下载及重启后的历史查询。 |

验收者在 `docs/verification/official-desktop-plugin/` 保存逐项记录，包含插件版本与来源、官方应用版本、测试类别、用户请求、Preset、模型及免费价格证据、Session/子 Session ID、Workspace、Skill 与参考文档实际路径、Tool Call、CLI stdin/退出码/stdout/stderr、结论及失败原因。一次成功请求可以关联多个验收项，各项均须给出对应证据位置。

### 正式 ComfyUI Run

验收者为工作台和迭代预设分别执行真实生成，使用实际数据源中选定的 Workflow、生成模型、LoRA（适用时）与目标 ComfyUI 实例。任务由真实模型按项目 Skill 和 managed CLI 流程发起，验收者等待 ComfyUI 实际执行完成和插件媒体落盘后判断结果。

每个正式 Run 必须记录完整 Run ID、ComfyUI prompt ID、目标实例、Workflow 模板及资源 ID、实际 Seed 和运行参数、源 Workflow、Actual Workflow、提交的 API Workflow、状态变化和最终媒体路径。验收者核对 ComfyUI 的完成记录、插件 SQLite 状态、媒体文件及界面投影一致，打开输出媒体，并由审阅 Agent 对照请求判断内容与尺寸是否符合目标。验收记录同时验证该 Run 的历史参数查询、Workflow 下载和应用重启后的可读取性。仅接纳请求或返回 Run ID 的结果记录为“已提交”，最终通过要求执行成功且上述产物可核对。

最终候选必须在发布前通过本节全部项目；生产切换后在正式安装的发行包上再次完成本节验收，并分别保存候选与生产记录。验收中发现的新修改按原有独立审查和最终候选门禁重新验证。

## 验收清单

以下条目均由实施者提供可核对的结果，独立 Reviewer 按结果验收。

| 编号 | 验收对象与通过条件 |
| --- | --- |
| A1 | 在没有本项目 checkout、第三方 Desktop、系统 DSH 和系统 Node/pnpm 的使用环境中，官方应用安装候选包，显示正确插件版本并成功加载 Host、Client。 |
| A2 | 包内全部入口、config、Preset、Skill 参考文件和脚本存在；移走源码后继续使用成功；插件运行期间安装目录保持只读。 |
| A3 | 启用后 UI、Tool 与两个 Preset 各注册一次，CLI listener 可用；重复加载与重启后保持单份注册。停用或卸载后项目 UI 与注册项移除，listener 关闭，capability 撤销，coordinator 停止并关闭数据库，插件数据保留；失败显示具体原因与操作指引。 |
| A4 | 从上一版官方兼容候选更新至下一版候选，配置、凭据引用、Run、媒体和 Workspace 关联保留；模拟失败后按“安装、启动与更新流程”的恢复步骤回装前一候选，并验证其规定的全部恢复结果。旧 `0.44.3` 的跨宿主数据迁移按“非本次目标”处理。 |
| A5 | 两个 Preset 在仓库外 Workspace 正常工作；项目 Skills 只出现在规定的 Preset 作用域，其他 Preset 保留自己的用户与 Workspace Skills。 |
| A6 | 真实模型读取 Skill 与 CLI 参考，执行前台 CLI；验收记录满足“最终真实模型与正式 ComfyUI Run 验收”中规定的记录字段要求；成功、错误、取消和无效 capability 均有测试。 |
| A7 | 依据 `docs/agents/comfyui-workbench-preset-and-skill-development.md` 的子 Agent 合同，工作台首派返回真实子 Session ID，续派进入同一会话；迭代预设的构图、生成、观察、比较四角色使用各自 persona 与模型，构图和生成可续派，观察和比较每轮使用新会话。各子会话在首个 step 前附加到父 Workspace，完成通知回到父 Agent；中断指定子任务后该任务停止执行，其他任务继续，子 Agent 的再次委派受到既有权限约束。 |
| A8 | Catalog、上下文选择、一次完整生成、Run 状态、重启恢复、媒体预览下载、历史参数与 Workflow 下载均通过；数据源或 ComfyUI 不可达时，提示具体服务与连接失败原因，并引导用户检查地址、端口和服务状态后重试。 |
| A9 | 官方 Host 能加载插件 Sharp 与 `node:sqlite`；无系统 Node 时数据源客户端和 Workflow worker 执行成功，临时浏览器完成编译并正确退出。 |
| A10 | 插件详情页能保存数据源、图片读取和浏览器设置；应用重启及插件重装后结果可核对；保存失败时说明失败字段或写入位置并保留表单草稿，提示用户修正字段或检查写入权限后重新保存；路径无效时提示出错路径及选择可访问目录或浏览器可执行文件的操作，两者均有测试。 |
| A11 | 插件在 Run 活动期间被卸载后，已接纳的 Run 记录仍可读取，业务轮询停止，再次启用后恢复跟踪；重复加载只产生一个 listener。包缺文件时列出缺失资源并提示重装完整包；宿主不兼容时列出实际版本与所需版本，提示用户安装所需的官方 Desktop 版本后重试；数据目录只读时提示目标路径及修改权限或数据位置的操作，三者均保留已有业务数据。重复安装提示先卸载再安装并保持注册项数量不变；下载失败提示来源地址与重试操作并保留安装前配置，已卸载的旧插件按 A4 恢复。带空格安装路径完成与普通路径相同的安装、CLI 调用和一次生成。 |
| A12 | 新增分支具有正常、异常和边界测试；独立审查、完整 `pnpm quality` 和 `git diff --check` 通过；门禁通过后的候选树直接提交。 |
| A13 | 两个测试环境并行运行时，Harness home、user-data、Workspace、端口与插件安装位置各自独立；一方退出后另一方仍能完成请求。既有用户实例的设置、插件安装与业务数据保持原状。 |
| A14 | `pnpm test:desktop` 自动完成构建、隔离实例启动、官方机制安装、CDP 连接及业务断言；旧包或错误实例身份使测试失败。插件页安装、启用与一次完整生成都有界面操作和业务结果证据。 |
| A15 | 成功、失败、取消、启动超时与端口冲突都有测试；对应结果返回正确退出码并保留证据，结束后本轮进程和端口全部释放。显式调试模式显示实例及停止方法，退出该模式后按同一清理条件验收。 |
| A16 | 生产切换记录中的发行包版本与官方应用实际加载版本一致，安装位置属于官方 Profile 且独立于旧生产 checkout；打开两个项目 Preset、目录查询、一次真实生成、读图、媒体查看下载及应用重启后读取本次 Run 均成功，记录请求结果和对应 Session/Run ID。 |
| A17 | 旧实例已停止，备份按首次切换第 3 步验证通过，A16 及 A18 的生产验收通过；用户已明确选择保留历史数据归档或完成另行授权的迁移验收，并确认退役旧环境。归档记录包含源码版本、配置和数据位置、恢复步骤及所需旧运行环境，原数据保持可恢复。 |
| A18 | “最终真实模型与正式 ComfyUI Run 验收”中的模型条件、全部矩阵项目和正式 Run 结果均通过；候选与生产记录分别完整，未通过项目为零。 |

## 文档与仓库规范调整

| 文件 | 负责表达的内容与修改动作 |
| --- | --- |
| `README.md` | 改为官方应用中的安装、启用、配置、首次生成和日常更新入口，保留用户业务指南。 |
| 新增 `docs/user/install-update.md` | 集中定义插件安装、卸载重装、版本核对、备份与重新安装旧插件版本的操作，并提供首次生产切换与旧目录退役步骤。 |
| `docs/system/startup.md` | 改写为官方宿主启动与插件加载边界，引用用户安装指南。 |
| `docs/system/configuration.md` | 定义插件配置、默认值、覆盖顺序、持久数据位置与凭据归属。 |
| `docs/system/architecture.md`、`directory-structure.md`、`technology-stack.md` | 描述插件构建、运行边界、资源路径和已经验收的官方版本。 |
| `docs/system/testing.md`、`docs/agents/worktree-development.md` | 定义 E2E 测试夹具、配置、自动化与交互调试命令、证据和清理条件，引用本方案 A13 至 A15；替换第三方启动器门禁。 |
| `docs/system/releasing.md`、`docs/releasenotes.md` | 把生产 checkout 部署改为插件附件发布与官方应用安装；定义 A16 至 A18 对应的生产切换、退役和真实验收记录，保留发布提交核对要求。 |
| `AGENTS.md` | 保留生产保护和最终提交门禁，更新独立验收与宿主基线；将“部署到生产 checkout 并运行 prod:*”改为发行包安装验收及旧目录退役条款。 |
| `CONTEXT.md`、相关 ADR | 更新运行术语；以新 ADR 明确取代 ADR 0004 的“仓库管理正式运行环境”和 ADR 0012 的“自有 Desktop 补丁”条款，保留公共接口与宿主权威边界。 |
| `docs/agents/comfyui-workbench-preset-and-skill-development.md` | 把启动器物化与默认预设要求改成插件注册和用户选择；保留作用域、Tool、子 Agent、真实模型和独立审阅合同。 |
| `.agents/skills/*/references/` 与必要的 `SKILL.md` | 开发者仅在 CLI 入口或读取条件变化时修订；执行 Skill 的 Agent 按各 Skill 内的参考完成调用。 |
| 历史 plans、research、verification 与版本记录 | 作为带日期的历史证据保留；当前入口文档引用本次新规范。 |

文档审阅者使用独立上下文，只接收待审成果及内容写作规则；审阅 Skill 时增加 Skill 文档规则。实施者对照原文逐条核对约束迁移，记录保留、替换或因本次目标退役的结果。

## 非本次目标

实施者把官方宿主的会话删除及删除失败恢复 UI 回归列为非本次目标。插件验收继续覆盖插件业务所需的 Session、Run 和历史查询。

本次范围排除开发或维护 Desktop fork、安装和升级 Harness 宿主、面向用户的自有后台服务与开机自动启动、独立 Web/headless 产品入口、npm 发布、以及新增兼容旧 Desktop 的双运行方案。开发测试调用已安装官方应用的范围由“Worktree 自动化 E2E 与调试机制”定义。

本次切换首先支持在官方应用中新建配置与会话。旧 Desktop 的会话、凭据、Workspace 关系及 Run 跨宿主迁移须另行取得用户授权；迁移实施按“首次切换步骤”中的迁移流程执行。插件版本之间的数据保留由 A4 验收。

本次范围排除删除用户旧安装和数据、重写生图业务流程、自动安装 Chrome/ComfyUI/数据源服务、以及未经实机测试的跨平台兼容承诺。实施者把新增兜底、旧版本兼容和哈希校验设计单独说明用途并提交用户决定。
