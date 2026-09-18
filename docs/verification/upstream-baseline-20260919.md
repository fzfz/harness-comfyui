# Stable 基线候选验证记录

## 候选身份与授权

实施 Agent 在 `codex/plan-upstream-baseline-20260919` 分支准备插件 0.44.2，起点为 `4bf5a0dcb4c197a85d4edda4edf1d64965089fa7`。用户调用 implement Skill 授权实施已提交的 [Stable 更新计划](../plans/upstream-baseline-20260919.md)，并明确批准“保留 0.6.0 并记录公告”。实施范围包括源码、依赖安装、构建、独立实例验收和本地提交；发布与生产部署另行授权。

`config/desktop-baseline.json` 固定自有 fork 提交 `a3ac8fe929e3b32e62c032d120071f5f09ff6210`。该提交在原有 `94748d71134ad0912334ffbd420c1bfc0d421b49` 上集成上游 2.0.11 提交 `01fa59e6688d82fa34b59fc507e3a6f5d695fa17`。Stable 的 Desktop、DSH、Electron 分别为 2.0.11、0.1.5-rc.2、43.3.0；实际安装位于主开发 checkout 的 `.local/upstreams/dsh-desktop-2.0.11-owned`。

## 依赖与补丁

安装执行者使用 Yarn 4.18.0 和候选锁文件完成 immutable 安装，并检查 vendor 包元数据及构建脚本。最终 npm 审计覆盖 861 个包名，vendor 清单覆盖 553 个包；完整版本与公告保存在[结构化证据](upstream-baseline-20260919.json)。

| 包 | 最终精确版本 | 用途与审计结果 |
| --- | --- | --- |
| sharp | 0.35.4 | 图片处理，修复计划列明的高危公告 |
| pnpm | 11.11.0 | Profile 安装及本仓库命令，保留自有 patch，修复计划列明的高危公告 |
| @xmldom/xmldom | 0.8.15、0.9.12 | XML 解析，分别保留两条依赖线并修复已匹配公告 |
| fast-uri | 3.1.6 | URI 解析，修复已匹配公告 |
| js-yaml | 4.3.2 | YAML 解析，修复已匹配公告 |
| hono | 4.13.5 | HTTP 框架，修复已匹配公告 |
| qs | 6.16.0 | 查询参数解析，修复已匹配公告 |
| vitest、@vitest/mocker 及同组包 | 4.1.11 | 测试运行与模拟，修复已匹配公告 |
| adm-zip | 0.6.0 | ZIP 处理，保留用户批准的中危公告 GHSA-vwc7-r8mq-g2x9 |

adm-zip 公告查询时没有修复版本。已检查的 Desktop 调用用于创建诊断 ZIP、读取 ZIP 条目和验证发布包，没有调用 `extractAllTo` 或 `extractEntryTo`；该检查限定于已检查的调用路径。最终 npm 审计只返回此项公告。本仓库锁文件的独立审计没有返回漏洞。

Stable 的八项 DSH patch 已移植到 RC.2 实际安装包，涉及 api-remotes、api-session-controller、client-ui-settings-models、client-ui-workspace、llm-pi-ai、session-persistence-jsonl、session-persistence、workspace。Stable 与 Beta 的 route-owned authentication 均保留。Beta 保留上游 DSH 0.1.6-alpha.1；其通过既有测试的结果不代表八项 Stable 补丁已经在 Beta 实现。

## 已完成检查

| 检查 | 结果与证据 |
| --- | --- |
| fork 完整 `corepack yarn check` | 通过：Market 263 项、Stable 1423 项、Beta 1374 项；Stable 8 项及 Beta 7 项跳过。包括布局、双语文档、依赖闭包、CLI、Profile 启动、许可证和运维检查 |
| fork 独立审阅及提交 | Standards 与 Spec 无阻断意见，`git diff --check HEAD` 通过，随后提交上述完整 SHA |
| 原生依赖 | Node 24 与 Electron 43.3.0 的 fs-ext 2.1.1 准备完成，Electron ABI 为 148 |
| 插件定向回归 | 68 项通过，覆盖版本合同、基线身份、依赖视图与 CLI Profile；基于实际 RC.2 依赖的 typecheck 通过 |
| 独立 Desktop | 使用 `pnpm dev:start/status/logs` 验证。首次 run `cb42ca8c-1d10-476d-a174-7b4078d969c8`，PID/PGID 84813；Renderer healthy，当前插件安装版本为 0.44.2，来源为当前 worktree 的 managed-plugins 目录 |
| Desktop 调试验收 | 首次实例由 `pnpm dev:stop` 停止。随后通过同一开发生命周期的导出函数启动前台调试实例，run `430bba31-f11b-4c63-8fcf-8ea6073b355c`，PID/PGID 87522；确认所属端口 49661、52715 和 CDP 49991 |
| 真实 Remote | Catalog baseModels 返回 krea2、wai、anima；ImageReader models 返回四个 Provider 分组且 failures 为空；Generation list 返回当前测试 Session 的空 runs/media，hasActiveRuns 为 false |
| 纯 CLI 真实模型 | `pnpm cli:run` 加载独立 CLI Profile，任务只要求回复 `CLI_BASELINE_OK`；stdout 返回该文本，退出码 0。stderr 含既有 SOCKS 代理提示及 SQLite 实验性提示 |

执行日志保存在候选 worktree 的 `.planning/upstream-baseline-20260919/evidence/` 和 `.local/`；fork 完整检查日志位于新 fork 的 `.local/check.log`。日志属于本机验证证据。

依赖视图使用标准 SemVer 预发布匹配规则；新增真实 semver 回归覆盖 RC.1 拒绝、RC.2 与 0.1.5 接受、0.1.6-alpha.1 与 0.1.6 拒绝。修复前 Alpha 用例失败，修复后 12 项依赖视图测试全部通过。

首次完整插件门禁通过依赖检查、typecheck、1174 项 unit/integration/Skills 和 56 项 contract/security，在 Web Host 真实启动测试中发现缺少 Host 入口构建。实施 Agent 为 `scripts/production/runtime.mjs` 补上既有 Host 构建函数调用；回归测试先删除旧入口文件，再验证真实启动和 Client ModuleLoader 注册，修复后该测试通过。最终完整门禁将覆盖该修复。

开发调试实例已由 `pnpm dev:stop` 停止，`pnpm dev:status` 返回 stopped。源码 Standards 复审通过；Spec 复审确认版本范围缺口已关闭，真实模型验收继续列为未完成。文档语义审阅已完成，并对后续新增记录继续复审。

| 计划验收项 | 本仓库的最终自动化证据入口 |
| --- | --- |
| 来源身份、版本及错误分支 | `tests/production/anywhere-baseline.test.mjs`、`desktop-dependency-view.test.mjs` |
| 真实请求身份 | `tests/desktop/session-request-identity.test.mjs` |
| 设置页、结果页、Session 删除、六模型 Max、Preset Skills 隔离 | `tests/desktop/desktop-live.test.mjs` |
| managed CLI capability、撤销与真实 Bash | `tests/desktop/managed-shell-capability.test.ts` 及 `desktop-live.test.mjs` |
| 图片读取与 Generation 运行合同 | `tests/unit/`、`tests/integration/` 的对应服务测试，由 `pnpm quality` 执行 |
| Web Host 及 CLI Profile | `tests/production/source-production.test.mjs`、`cli-runtime.test.mjs` |

上述表格标明验收项的测试位置；真实模型执行结果单独记录于下章，最终完整命令结果随候选交付报告。

## 待完成的真实模型验收

真实 Desktop Workspace 为 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`。省略 Preset 的 `baseline-default-20260919` Session 创建后为 `harness-comfyui-cli-candidate`，使用 cliproxy/gpt-5.6-luna，在首次工具调用前反复返回 TIMEOUT。补充 Session `baseline-default-deepseek-20260919` 使用 deepseek-official/deepseek-v4.1-flash-expires-on-0910，返回 TRANSPORT。实施 Agent 已取消这些请求。

同机 Node 和 curl 访问相同服务成功；新安装的 Electron 在 Node 执行模式下访问 DeepSeek 和内网模型端口也超时。该证据表明阻塞与 Electron 执行环境相关，具体网络控制原因仍待确认。

三种 Preset 的真实 Skill → 前台 Bash → `image inspect --stdin` 验收尚未通过。上述会话没有读到目标 Skill，也没有生成 CLI stdin、退出码、stdout/stderr 或视觉观察结果。网络恢复后，验收 Agent 必须重跑默认工作台、显式工作台和显式迭代三种创建方式，记录计划要求的完整证据，再关闭此项。

最终插件 `pnpm quality`、独立审阅、`git diff --check`、测试实例停止状态与本地提交结果由实施 Agent 在候选交付时报告。待完成的真实模型验收必须在发布前通过。
