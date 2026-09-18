# DSH、Desktop 基线与插件兼容性更新计划

本文保存用户批准实施前的原始计划与当时授权状态。当前实施结果、追加授权和未完成验收见[基线验证记录](../verification/upstream-baseline-20260919.md)；下文的实施约束与完成条件继续适用。

## 必须要实现的目标

当前交付由调研 Agent 完成上游版本、依赖和插件接口调研，提交可批准计划，并通过独立语义审阅。

批准后的实施目标：实施 Agent 将本仓库唯一运行基线升级到自有 fork 集成的 Desktop 2.0.11 Stable、DSH 0.1.5-rc.2 和 Electron 43.3.0，保留现有插件功能及自有宿主补丁，完成依赖处理、兼容性验收和候选提交准备。用户批准本计划后开始实施。

推荐先完成 Stable 更新。DSH 0.1.6-alpha.2 的接口迁移作为本文列明的后续方案，由用户选择后另行实施。

## 版本与来源

本次查询时间为 2026-09-19。独立 worktree 为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-upstream-baseline-20260919`，分支为 `codex/plan-upstream-baseline-20260919`，创建时 main 提交为 `4bf5a0d`，插件版本为 0.44.1。

| 对象 | 当前基线 | 调研结果与建议 |
| --- | --- | --- |
| 自有 Desktop fork | `fzfz/dsh-desktop-anywhere`，`94748d71134ad0912334ffbd420c1bfc0d421b49` | 远端 main 仍是该提交；实施时在独立 fork 分支集成选定上游，形成新提交 |
| Desktop 已发布 Stable | 2.0.9 | 推荐 2.0.11，发布于 9 月 17 日，tag 对应 `01fa59e6688d82fa34b59fc507e3a6f5d695fa17` |
| Stable 内置 DSH | 0.1.5-rc.1 | 0.1.5-rc.2；官方 tag 对应 `fb2c4b9e698e30edb738bca4cf0618587db7d203` |
| Stable Electron | 43.3.0 | 2.0.11 manifest 仍为 43.3.0 |
| Desktop 已发布 Beta | 当前仓库使用 Stable | 最新已发布为 2.0.11-beta.1，内置 DSH 0.1.6-alpha.1 |
| Desktop 开发分支 | 当前仓库使用固定提交 | 本次 master 为 `63f6d7e9e2a7acad5ab1a397bd339658e6749b71`；manifest 为 Stable 2.0.12 / Beta 2.0.12-beta.1，查询时尚无对应 Release |
| DSH 最新预发布 | 0.1.5-rc.1 | 0.1.6-alpha.2，tag 指向 `ddefc45fbc7f8e46dd73185e68295696d1297887`；Desktop 开发分支 Beta 已采用它及 Electron 44.0.0 |

“Stable”在本文指 Desktop 发布通道；其中 DSH 仍是 RC。开发分支版本与已发布版本分别记录，执行者按选定完整提交准备源码。

来源：[Desktop 2.0.11](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.11)、[Desktop 版本差异](https://github.com/anywhere-labs/dsh-desktop/compare/v2.0.9...v2.0.11)、[DSH RC 差异](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.5-rc.1...dsh-v0.1.5-rc.2)、[DSH alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1)、[DSH alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.2)。

## 兼容性判断

RC.1 到 RC.2 共四个提交，功能改动集中于反馈弹窗、交付文件布局与图标。Desktop 2.0.9 到 2.0.11 包含 20 个提交，涉及运行时升级、取消 ASAR、桌面操作脱离 Host 生命周期、Renderer 恢复和 Windows 终端。根据该差异，Stable 更新预计主要工作在 fork 补丁与基线安装；实际兼容结论以本计划验收为准。

| 对象与文件 | 实施动作 | 完成结果 |
| --- | --- | --- |
| fork 的 `patches/`、根 `package.json`、`yarn.lock` | 将自有 RC.1 补丁逐项移植到 RC.2，并更新 patch locator 与安装后的行为测试 | Session 删除、Workspace 关系、持久化、真实 Session 请求头和 Provider 推理配置继续有效 |
| fork 的 `dsh-plugin-desktop/src/webserver.ts` 与 Beta 对应文件 | 保留自有 route-owned authentication 行为，按 fork 的双通道一致性要求核对 | 有效路由凭据请求成功，普通浏览器访问限制继续生效 |
| 本仓库 `config/desktop-baseline.json` | 写入自有 fork 新完整提交、2.0.11/RC.2/43.3.0 和新安装目录 `.local/upstreams/dsh-desktop-2.0.11-owned` | 唯一结构化基线与实际安装一致 |
| `package.json`、`tests/contract/engineering-baseline.test.ts`、依赖视图测试 | 将 DSH peer 范围改为 `>=0.1.5-rc.2 <0.1.6`；更新精确版本断言与范围判断夹具 | 声明对应本次支持线，测试接受 RC.2 并拒绝范围外版本 |
| `scripts/desktop/`、`scripts/profile/`、`scripts/cli/` | 核对 Profile materialize、宿主 peer 解析、CLI 入口和原生绑定；按实际失败点修改 | Desktop 与纯 DSH CLI 都加载当前插件产物 |
| `src/client/index.tsx`、工作台 Controller、设置页 | 验证现有右侧栏、输入框和设置扩展位 | 空白及已保存 Session 的上下文插入、结果页和设置正常 |
| `src/host/cli/`、`src/host/image-reader/`、`agent-presets/` | 验证 capability、Agent 初始化、模型请求身份及项目 Preset | 三种 Preset 创建方式均完成真实 Skill→CLI→读图流程 |
| `docs/system/`、README 与发布说明 | 实施后同步实际基线、命令与验收证据 | 文档描述最终行为及仍存在的限制 |

自有补丁证据来自 fork 提交 `46c3d0e9947ca061a5628526347164973e0d4b74` 与 `36205f635a2006ebbc09c5932f10846f1f903dab`。仅替换为公共上游 tag 会遗漏这些自有变更，故本方案继续通过自有 fork 集成。

## 依赖版本与安装前审计

本次只读解析 Desktop 2.0.11 的 `yarn.lock`，向 npm bulk advisories API 查询其中 861 个 npm 包名，并通过 GitHub Advisory API 核实修复版本。该结果覆盖整个 Desktop monorepo，包含 Beta 与开发依赖；它不是 Stable 可利用性结论。file/vendor tarball、原生二进制以及 patch 的实际代码效果需要实施时单独核对。

安装执行者使用 Yarn 4.18.0 和最终候选锁文件；Desktop 2.0.11、DSH 0.1.5-rc.2、Electron 43.3.0、Cordis 4.0.2、React/React DOM 18.3.1 为确定的宿主版本。下表列出审计命中的包、用途和建议精确版本；执行者在对应 manifest/resolutions 中固定版本并更新锁文件。

| 包及用途 | 上游锁定版本 | 建议版本及审计意见 |
| --- | --- | --- |
| `sharp`：图片处理 | 0.35.3 | 0.35.4；修复高危公告 GHSA-rgj7-g3m4-5g8c，本插件直接依赖已为该版本 |
| `pnpm`：Desktop Profile/插件安装 | 11.8.0 | 11.11.0；修复三项高危公告，移植现有 pnpm patch 并验证 materialize/安装行为 |
| `@xmldom/xmldom`：传递 XML 解析 | 0.8.14、0.9.11 | 分别 0.8.15、0.9.12；修复解析、注入与资源消耗公告，保留两个依赖分支 |
| `fast-uri`：传递 URI 解析 | 3.1.5 | 3.1.6；修复四项高危公告 |
| `js-yaml`：传递 YAML 解析 | 4.3.1 | 4.3.2；修复高危 CPU 消耗公告 |
| `hono`：HTTP 框架 | 4.13.2 | 4.13.5；修复三项中危公告 |
| `qs`：查询参数解析 | 6.15.3 | 6.16.0；修复两项中危公告 |
| `vitest`、`@vitest/mocker`：测试及模拟 | 4.1.8 | 4.1.11；修复中危文件读取公告，同组 Vitest 包保持一致 |
| `adm-zip`：ZIP 解包 | 0.6.0 | 公告 GHSA-vwc7-r8mq-g2x9 尚无修复版；在执行解包安装链路前，提交具体调用路径与处理方案供用户决定 |

以上建议修复版本再次查询 npm bulk API，响应为 `{}`；该结果仅表示查询时这些版本未返回公告。完整包版本、公告与修复版本保存在 worktree 的 `.planning/upstream-baseline-20260919/evidence/`，其中 `audit-packages.json`、`audit-results.json`、`advisory-fixed-versions.json`、`proposed-security-versions.json` 为结构化原始证据。

安装前，实施 Agent 必须补齐最终锁文件的完整依赖版本清单、传递用途、vendor 原生包审计及构建脚本检查，并复查新增解析结果。对上表尚无修复版的 adm-zip，最终安装授权以用户批准具体处置为条件。若本仓库包管理器也参与本次安装，实施 Agent 将其从 pnpm 11.7.0 同步固定到 11.11.0，并更新包管理合同；该版本处于同一公告修复线。

## 实施顺序与交付物

1. 实施 Agent 在自有 Desktop fork 的独立分支集成选定 Stable 提交，移植上文补丁并处理上表依赖，产出源码 diff、补丁行为对照和最终依赖清单。新 fork SHA 在这些改动完成后产生，当前计划不预填。
2. 安装执行者在依赖处置获得批准后，按候选锁文件运行 `corepack yarn install --immutable`，构建 market 与 Stable workspace，并执行 `prepare:electron-native`。安装目录与旧基线分离。执行者按 fork 的检查规则完成 `corepack yarn check`，记录两个通道的结果和原生绑定版本。
3. 本仓库实施 Agent 更新基线、peer 声明、相关夹具及实际需要的适配代码。`dev:start` 为本 worktree 准备 `.env` 链接和依赖视图；依赖安装在已批准的源目录完成。
4. 验收 Agent 完成下一章检查。审阅 Agent 分别完成独立 Standards Review、Spec Review 和文档/文案语义 Review。实施 Agent 修正意见后对最终候选树运行 `pnpm quality`、`git diff --check`，通过后保持候选树不变直至提交。
5. 实施 Agent 提交验收记录、fork 与本仓库 diff、依赖处置结果以及发布建议。版本号根据最终变更和届时 main 确定。推送、GitHub Release 与生产部署以用户明确授权为执行条件；届时按 `docs/system/releasing.md` 核实 `origin/main` 完整 SHA、tag 与发布提交，再部署该提交。

## 验收清单

实施验收 Agent 必须逐项记录通过或失败及证据；本次调研尚未运行这些测试。

- [ ] 安装来源、完整提交、Stable workspace、Desktop/DSH/Electron 版本均与基线一致；错误来源、版本不符和缺少宿主依赖均能报告具体错误。
- [ ] fork 补丁作用于 RC.2 实际安装包；Session 删除后不可读且其他会话保留，Workspace 和 JSONL 持久化一致。
- [ ] 普通 Session、子 Session、图片读取请求携带各自真实 Session ID；Provider 六个模型的推理等级保存及 Max 选择通过既有真实设置页测试。
- [ ] `dev:status` 确认初始状态；`dev:start` 后核对当前 PID、进程组、worktree 启动路径、实际监听端口、当前 run 的 Renderer healthy 和插件安装来源。
- [ ] Catalog、Generation、ImageReader Remote 可用；图片读取配置与数据源设置保存、重读、失败提示通过；现有图片压缩及输出截断合同保持有效。
- [ ] 空白/已保存 Session 的结果页、上下文插入和媒体操作正确；关闭结果页后宿主其他页签保持可用。
- [ ] 实际前台 Bash 的 managed CLI 成功；缺失、过期或不属于当前执行的 capability 被拒绝；后台请求、异常退出与卸载后的撤销行为符合既有合同。
- [ ] 默认工作台、显式工作台、显式迭代三种 Session 均读取当前 worktree 的 Skill 和 CLI 参考并完成真实 `image inspect --stdin`；记录 Workspace、Preset、模型、实际路径、stdin、退出码、stdout/stderr。其他 Preset 的 Skill 来源隔离通过。
- [ ] 纯 DSH CLI Profile 能加载拆分的 Host 入口、完成任务并退出；插件关闭时释放 listener、取消或等待活动请求，Generation 持久 Run 按既有规则恢复。
- [ ] 覆盖本次修改的正常、异常、边界分支；独立审查、最终 `pnpm quality` 和 `git diff --check` 全部通过。真实模型超时按失败记录，修复后才关闭相应验收项。
- [ ] 验收结束执行 `dev:stop`，再以 `dev:status` 确认 stopped。

## Alpha 迁移的后续方案

用户若选择直接采用最新 DSH，则需改选 Desktop Beta 开发提交及 Electron 44.0.0，并重新固定和审计其完整依赖。该选择会扩大以下实际改动范围。

| 已发现的差异 | 本仓库位置 | 后续迁移动作与验证 |
| --- | --- | --- |
| 同步 Session 历史接口被弃用 | `src/host/cli/runner.ts`、`src/host/cli/shell-capability.ts` 调用 `snapshotEvents()` | 读取目标异步历史接口，适配 runner 与 capability 身份提取；验证调用事件唯一性、异步时序和撤销 |
| Client Session 支持多实例，相关 API/slot 改变 | `src/client/index.tsx` 使用 `sessions.scope(sessionId)` 与 `conversation.input.for(...)` | 按目标 slot scope 和视图实例绑定输入状态；同一 Session 多视图互不串草稿，结果订阅正确释放 |
| 插件运行时依赖解析与卸载 | `package.json` 的 dsh 声明、拆分 Host 入口、Client disposer、Profile 安装器 | 核对依赖闭包和 exports；验证加载失败、禁用、重启、卸载时活动请求和 listener 的清理 |
| `agent/session-start` 改为异步 `agent/created` | runner 的 `agents.create` 初始化与 Preset 挂载 | 本次文本扫描未发现旧事件订阅；核对 create 返回值和初始化等待顺序，验证首个请求前 Preset 已挂载 |
| PTC/workflow 包及服务改名 | `profiles/comfyui-cli/cordis.patch.yml` 包含旧 `workflow-worker-thread` 行 | 对照目标 Profile 改写失效行及实际使用的包名，验证 composition 加载 |
| 子 Agent 数量/深度与 Team 工具调整 | `agent-presets/project-iteration-dispatch.mjs` 使用 `startContinuable`/`sendMessage` | 保留四个角色派发合同，核对目标 API 与数量/深度设置，验证继续对话及子 Session Workspace 归属 |
| 原生模块要求不同 Electron 指纹 | Desktop Beta 开发分支 | 上游升级记录指出 alpha.2 的 `node-addon-require-builtin` 与 43.3.0 不匹配；使用目标锁定的 44.0.0，验证 GUI、CLI、Profile 安装和 fs-ext ABI |

这些条目是后续迁移范围，尚未经过目标运行时验证。实施 Agent 修改 Preset 时须遵守 `docs/agents/comfyui-workbench-preset-and-skill-development.md`；执行 Skill 的 Agent 继续先读 Skill 和指定 CLI 参考，再通过前台 shell 使用 managed CLI。本次方案未提出修改 Skill 自带程序。

## 非本次目标

Stable 方案聚焦基线和现有插件兼容性；Beta 新功能、远程控制、自动启动、后台常驻、生产数据迁移、Skill 重写及通用跨版本适配层均属于另行确定的任务。

## 已获得的授权

用户已授权创建独立 worktree、调研上游、设计仓库基线与插件兼容性更新计划。本次已执行这些准备工作。

源码修改、上游安装与构建、开发实例启动在用户批准实施后进行；adm-zip 安装处置按依赖章节完成具体审批。发布与生产部署按实施顺序中的授权条件执行。当前业务源码、基线配置和生产实例保持原状。
