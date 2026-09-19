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

首次完整插件门禁通过依赖检查、typecheck、1174 项 unit/integration/Skills 和 56 项 contract/security，在 Web Host 真实启动测试中发现缺少 Host 入口构建。实施 Agent 为 `scripts/production/runtime.mjs` 补上既有 Host 构建函数调用；回归测试先删除旧入口文件，再验证真实启动和 Client ModuleLoader 注册，修复后该测试通过。候选提交 `733146e376a8819a96de8ed38ceba2a63d6bd90c` 的完整 `pnpm quality` 随后通过：1174 项 unit/integration/Skills、56 项 contract/security、292 项 production、32 项 prototype 和 4 项 Desktop 测试，共 1558 项。覆盖率为 statements 93.98%、branches 87.49%、functions 100%、lines 96.4%；`git diff --check` 通过。

开发调试实例已由 `pnpm dev:stop` 停止，`pnpm dev:status` 返回 stopped。源码 Standards 复审通过；Spec 复审确认版本范围缺口已关闭。首次交付时未完成的真实模型验收已按下章补齐。后续证据与文档更新继续接受独立审阅。

| 计划验收项 | 本仓库的最终自动化证据入口 |
| --- | --- |
| 来源身份、版本及错误分支 | `tests/production/anywhere-baseline.test.mjs`、`desktop-dependency-view.test.mjs` |
| 真实请求身份 | `tests/desktop/session-request-identity.test.mjs` |
| 设置页、结果页、Session 删除、六模型 Max、Preset Skills 隔离 | `tests/desktop/desktop-live.test.mjs` |
| managed CLI capability、撤销与真实 Bash | `tests/desktop/managed-shell-capability.test.ts` 及 `desktop-live.test.mjs` |
| 图片读取与 Generation 运行合同 | `tests/unit/`、`tests/integration/` 的对应服务测试，由 `pnpm quality` 执行 |
| Web Host 及 CLI Profile | `tests/production/source-production.test.mjs`、`cli-runtime.test.mjs` |

上述表格标明验收项的测试位置；真实模型执行结果单独记录于下章，最终完整命令结果随候选交付报告。

## 真实模型验收

首次尝试中，`baseline-default-20260919` Session 使用 cliproxy/gpt-5.6-luna，在首次工具调用前返回 TIMEOUT；`baseline-default-deepseek-20260919` 使用 deepseek-official/deepseek-v4.1-flash-expires-on-0910，返回 TRANSPORT。当时同机 Node 和 curl 成功，Electron 最小网络请求超时。2026-09-19 用户要求继续后，Electron 最小请求在 115 毫秒内收到内网模型服务预期的 401 未认证响应。原网络阻塞不再复现，具体网络控制原因未确认。

本轮首先使用 `pnpm dev:start/status/logs` 验证正式开发入口，run 为 `5f71c3c5-5183-4204-a4e6-c39f6a62f536`，PID/PGID 为 57443，进程组监听端口为 49661、62789，Renderer healthy。随后执行 `pnpm dev:stop`，通过既有开发生命周期导出函数启动前台调试实例以采集 Session Remote 证据；该实例 run 为 `81222ef0-605c-4b53-b5cc-553206a789da`，PID/PGID 为 59883，进程组监听端口为 49661、63172、CDP 49991，Renderer healthy。Profile 的插件依赖为 `link:../../../../managed-plugins/harness-comfyui`，该产物版本为 0.44.2。调试启动属于补充验收，正式命令入口的健康结果单独保留。

三个 Session 的 Workspace 均为 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`，Agent 模型均为 `cliproxy/gpt-5.6-luna`。每个 Agent 都通过 Skill Tool 发现 `local-image-reader`，再完整读取以下两份当前 worktree 文档，并在前台 Bash 中执行 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin`，显式 `timeoutMs: 60000`。

- Skill：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-upstream-baseline-20260919/.agents/skills/local-image-reader/SKILL.md`
- CLI 参考：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-upstream-baseline-20260919/.agents/skills/local-image-reader/references/image-inspection-cli.md`

| Session ID | 创建方式与实际 Preset | 成功调用/结果事件 seq | 退出码 | stdout 的 observation |
| --- | --- | --- | --- | --- |
| baseline-resume-default-20260919 | 省略 agentPreset → harness-comfyui-cli-candidate | 29 / 30 | 0 | 图片主体颜色是红色。 |
| baseline-resume-workbench-20260919 | 显式 harness-comfyui-cli-candidate | 52 / 53 | 0 | 图片的主体颜色是红色。 |
| baseline-resume-iteration-20260919 | 显式 harness-comfyui-iteration | 52 / 53 | 0 | 图片主体颜色是红色。 |

三次成功调用使用相同 stdin：

```json
{"file_path":"/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-upstream-baseline-20260919/.local/acceptance-red.png","prompt":"只用一句话说明图片主体颜色。"}
```

CLI stdout 为一行四属性 JSON。下例对应默认工作台与显式迭代 Session；显式工作台的 `observation` 使用上表原文，其余字段相同。

```json
{"provider":"openai-compatible","model":"Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-MLX-mxfp4","file_path":"/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-upstream-baseline-20260919/.local/acceptance-red.png","observation":"图片主体颜色是红色。"}
```

三次成功调用的 CLI stderr 相同：

```text
NEXT: 读取已完成；从 observation 字段提取并复用观察文本。
NEXT: 观察其他图片时替换 file_path，再按本命令调用。
```

默认 Session 的退出码依据 DSH Bash 输出合同确认：非零退出会追加 `[exit code: N]`，该次结果没有非零、超时或取消标记。另两个 Session 在 CLI 管道后直接读取并打印退出码 0。原始调用、结果、文档读取输出和完成事件见[逐会话 JSON 证据](upstream-baseline-20260919-sessions.json)。测试图片为预先生成的纯红色 PNG，三个观察结果均与该图片一致。

显式工作台与迭代 Session 最初为捕获输出采用 Bash 进程替换，受到 workspace-write 沙箱对 `/dev/fd/62` 的限制。实施 Agent 取消了工作台 Session 的权限扩大请求，随后通过用户提示指导其使用简单前台管道；两个 Session 在原权限下成功。JSON 证据保留了失败尝试，验收结果以上表成功调用为准。

三种创建方式的真实 Skill → 前台 Bash → CLI → 视觉模型流程全部通过。验收结束后，`pnpm dev:stop` 停止 PID 59883，`pnpm dev:status` 确认 stopped。此次补充只更新验收记录和发布状态说明；最终文档候选的独立审阅、完整门禁与提交结果随交付报告。
