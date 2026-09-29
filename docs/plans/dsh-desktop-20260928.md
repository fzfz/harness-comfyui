# DSH 与 Desktop 同步兼容升级计划

## 必须要实现的目标

本次交付由调研 Agent 在独立 worktree 中核对上游发布、现有集成点和依赖风险，提交本计划及[来源记录](../research/dsh-desktop-upgrade-sources.md)。实施 Agent 根据用户已给出的批准，把本仓库的唯一 Desktop 基线升级至自有 `fzfz/dsh-desktop-anywhere` fork 集成的 Desktop 2.0.15 Stable、DSH 0.1.7-rc.2 和 Electron 44.0.0，并恢复 `docs/agents/worktree-development.md` 和 `docs/agents/comfyui-workbench-preset-and-skill-development.md` 定义的插件功能。实施 Agent 必须使用新的 fork 完整提交作为 `config/desktop-baseline.json` 的源码身份。

“同步兼容”指自有 Desktop fork、插件的 DSH 公共接口、开发与发布配置、自动化测试和系统文档指向同一组已验收版本。实施 Agent 必须在候选依赖安装前完成安全审计和具体安装清单，在隔离实例中验证候选版本，并按仓库发布门禁提交可审阅的结果。

实施 Agent 根据用户补充授权，为 `ComfyUI工作台预设` 增加同一父 Session 的子 Agent 创建与续派，并让内置 Catalog 客户端精确适配当前 Source schema。运行验收 Agent 在唯一登记的 ComfyUI 实例可用时，对同一 Generation Request 完成两次独立提交并核对两个 Run ID。

## 版本与当前状态

本计划核对日期为 2026-09-28。本仓库 worktree 是 `codex/upstream-dsh-desktop-upgrade`，起点为 `f53e3111441c39b03f54e850c4f8aa94b2709738`。

| 对象 | 当前仓库 | 目标与依据 |
| --- | --- | --- |
| Desktop Stable | 自有 fork 提交 `a3ac8fe929e3b32e62c032d120071f5f09ff6210`，Desktop 2.0.11 | 上游 [v2.0.15](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15)，提交 `08f179499c155f6653eb9ca25bab3d4453bd89d5`；实施后固定新 fork 提交 |
| DSH | 0.1.5-rc.2；插件 peer 范围 `>=0.1.5-rc.2 <0.1.6` | [dsh-v0.1.7-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)，提交 `477b4f420553e8a52c2fbccc464d7561b239c443`；Desktop 2.0.15 同版内置 |
| Electron | 43.3.0 | Desktop 2.0.15 的 [Stable manifest](https://github.com/anywhere-labs/dsh-desktop/blob/v2.0.15/dsh-plugin-desktop/package.json) 为 44.0.0 |
| 自有 fork | 远端 `main` 仍在 2.0.9 提交 `94748d71134ad0912334ffbd420c1bfc0d421b49`；远端 `codex/desktop-2.0.11` 保存当前基线提交 | 实施 Agent 必须从当前基线创建独立 fork 分支，集成 v2.0.15 后核对并移植自有补丁；现有本地 fork checkout 还有额外提交 `bb33ac914ecfdc4dd606a6a596debab9c889d697`，实施前先对其内容和归属做只读对照 |

上游 Desktop 2.0.15 已配套最新 DSH rc.2，因此目标采用这一组正式发布的 Stable/RC 配对。DSH rc.2 仍是候选版；[Desktop 发布说明](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15)也要求跨版本升级前备份 DSH 数据。当前生产与开发运行目录在实施期间必须保留。

## 兼容改动与实施顺序

1. **固定上游与 fork 候选。** 实施 Agent 在自有 Desktop fork 的独立分支集成 v2.0.15，核对 Stable workspace、DSH 子模块或 vendored runtime、Electron 和锁文件。当前 fork 的八项 DSH patch 分别作用于 `api-remotes`、`api-session-controller`、`client-ui-settings-models`、`client-ui-workspace`、`llm-pi-ai`、`session-persistence-jsonl`、`session-persistence` 和 `workspace`；Stable 与 Beta 还保存按路由身份验证的自有修改。实施 Agent 逐项对照这些改动及额外 `bb33ac9` 提交，移植目标版本仍需要的行为。实施 Agent 提交可从远端取得的完整 fork 提交、补丁行为清单和相对于上游 v2.0.15 的差异；相关行为测试必须通过。
2. **审计并准备依赖。** 实施 Agent 从候选 fork 的 manifest 与最终 `yarn.lock` 提取所有将安装的精确包版本、用途、安装脚本及公告，检查 DSH 0.1.7-rc.2 的发布包与源码一致。对每个拟改版本记录安全审计意见，并把允许安装的精确版本写入对应包管理文件。实施 Agent 保存锁文件解析、安装、构建和运行各类命令的授权记录，并保存已执行命令及结果。
3. **迁移插件与配置。** 实施 Agent 更新 `config/desktop-baseline.json`、`package.json` 的 DSH peer 范围、`profiles/comfyui-cli/package.json`、依赖视图及合同测试。实施 Agent 对照 DSH rc.2 的公共 API，迁移 `src/host/cli/runner.ts`、`src/host/cli/shell-capability.ts`、`src/host/generation/tool-execution-identity.ts` 的 Session 历史读取；核对 `src/client/index.tsx` 的 Session scope、输入框和原生右侧栏、`src/host/image-reader/` 的 LLM/Attachment 接口，以及 `agent-presets/harness-comfyui-cli-candidate/` 与 `agent-presets/harness-comfyui-iteration/` 中 Persona、Skill、Tool 和子 Agent 的配置。实施 Agent 在 `agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml` 配置 `subagent_task`，在 `scripts/source-client/imagegen-semantic-query.mjs` 精确校验 Source Prompt-term Search 的 `allOf` 条件和四个分类字段。实施 Agent 按实际差异更新 `scripts/desktop/`、`scripts/profile/`、`scripts/cli/` 和纯 CLI Profile 的失效组件，并提交相应源码、配置、测试和接口差异记录。类型检查、合同测试及第 4 步的目标运行时验收共同判定迁移完成。配置结构及跨模块共享数据继续由对应 schema 和结构化配置统一定义。
4. **建立分支测试和迁移演练。** 实施 Agent 为每项新增或修改逻辑补齐正常、异常和边界测试，覆盖版本不符、Profile 安装、Session/Workspace 身份、capability 撤销、Preset/Client 卸载、CLI 退出和数据持久化。DSH 0.1.7 引入 Session 日志 V4、按 Profile 保存设置及旧 `settings.yaml` 的一次性导入；实施 Agent 必须在隔离目录用测试数据演练旧 Session、设置和项目 Preset 的迁移，记录迁移前后可读性与重复启动结果。实施 Agent 按 `docs/agents/comfyui-workbench-preset-and-skill-development.md` 验证产品 Preset，按 `docs/agents/worktree-development.md` 启动独立 Desktop 并核对本次 run 的 Renderer、插件来源、进程组与端口。运行验收 Agent 记录工作台子 Agent 的首次派发与同一子 Session 续派、父子 Workspace 归属，以及真实 managed CLI 的 Catalog 查询；在 ComfyUI 实例可用时，对完全相同的 Generation Request JSON 执行两次独立提交，并用 `generation run-inputs --stdin` 核对两个不同 Run ID 的参数一致。
5. **完成审阅与发布候选。** 实施 Agent 同步 `README.md`、`docs/system/`、`docs/releasenotes.md`，完成源码 Standards 与 Spec 独立审阅及 Markdown/文案独立语义审阅。所有修正完成后，实施 Agent 在最终候选树运行 `pnpm quality` 和 `git diff --check`，通过后保持候选树不变并提交。发布 Agent 根据用户已给出的授权，按 `docs/system/releasing.md` 创建 PR、合入 main、同步本地 main、核对 `origin/main` 完整 SHA，并创建指向该提交的 Git tag 和 GitHub Release。部署 Agent 根据用户已给出的授权，按同一规范备份生产数据、保留生产专属配置，在生产 checkout 部署该发布提交，并以 OpenRouter 免费模型及规范中的生产验收项目全部通过作为完成条件。

### 依赖审计起点

下表列出目标 Stable manifest 已核实的直接宿主包；完整的传递包清单以实施时的最终锁文件为准。此前 2.0.11 升级时的[安全审计](upstream-baseline-20260919.md#依赖版本与安装前审计)可作为复核线索，不能替代 2.0.15 的重新审计。

| 包与用途 | 目标上游精确版本 | 本次审计意见 |
| --- | --- | --- |
| `@deepseek-ai/dsh`：Harness 运行入口 | 0.1.7-rc.2 | 与 Desktop 2.0.15 发布说明一致；实施时核对实际发布包、内部包版本与公开源码提交 |
| `electron`：Desktop 宿主及原生模块 ABI | 44.0.0 | 与 Stable manifest 一致；实施时核对 `fs-ext` 等原生绑定的目标 ABI 与安装脚本 |
| `pnpm`：Profile 物化和插件安装 | 11.8.0 | [GHSA-vx52-2968-3vc6](https://github.com/advisories/GHSA-vx52-2968-3vc6) 将 11.8.0 列为受影响版本，修复版为 11.11.0；实施 Agent 须复核其他公告、补丁适用性及目标锁文件，并优先选择精确版本 11.11.0 |
| `sharp`：宿主图片处理 | 0.35.3 | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) 将 0.35.3 列为受影响版本，修复版为 0.35.4；实施 Agent 须复核其他公告、调用路径及目标锁文件，并优先选择精确版本 0.35.4 |
| `yarn`：fork 的包管理器 | 4.18.0 | 根 manifest 固定该版；实施 Agent须核对包管理器来源与锁文件一致性 |
| `vitest` 与 `@vitest/mocker`：宿主测试与模拟 | 4.1.8 | [GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) 将 4.1.8 列为受影响版本，修复版为 4.1.11；实施 Agent 须核对目标锁文件，并优先将同组包固定为 4.1.11 |

## 验收清单

- [ ] 自有 fork 的目标提交可从远端取得，Stable workspace 的 Desktop、DSH、Electron 实际安装版本分别为 2.0.15、0.1.7-rc.2、44.0.0；补丁行为与上游差异有逐项记录。
- [ ] 完整依赖清单列出精确版本、用途和安全审计结论；已批准安装的 manifest 与锁文件仅包含清单版本，安装与构建日志可追溯。
- [ ] 当前插件 Host、Client、CLI 和两个产品 Preset 使用目标 DSH 公共接口通过类型检查与分支测试；纯 DSH CLI Profile 完成 Session、Workspace、模型调用和进程退出。
- [ ] Session 身份与 Workspace 归属、工具调用唯一性、短期 capability 签发与撤销、Generation Run 持久化及图片读取行为在正常、异常、边界场景均通过。
- [ ] 隔离目录中的旧 Session、设置和产品 Preset 经目标版本迁移后可读；重复启动不会重复导入或覆盖用户已保存值；验收记录包含迁移前后数据和失败分支。
- [ ] 独立 Desktop 由 `pnpm dev:start` 启动；当前进程组、端口、Renderer healthy 和当前 worktree 插件安装均获确认。ComfyUI 工作台、设置页、Catalog/Generation/ImageReader Remote、上下文插入、结果页、前台 managed CLI 均通过实际目标版本验收。
- [ ] 默认工作台、显式工作台、迭代 Preset 及其他 Preset 的 Skill 可见性、真实模型调用、子 Agent 续派和 Workspace 归属符合产品规范；验收者记录请求、响应及失败原因。
- [ ] `scripts/source-client/imagegen-semantic-query.mjs` 接受当前 Source Prompt-term Search 的四个分类字段，严格执行 `category_match` 对 `category_ids` 的条件要求；真实 managed CLI 的实例、模板和生成模型查询成功。
- [ ] `ComfyUI工作台预设` 在同一父 Session 下创建并续派同一子 Session，父子 Session 附加到同一 Workspace；同一份 Generation Request JSON 产生两个不同 Run ID，`generation run-inputs --stdin` 返回相同请求参数。
- [ ] 实施 Agent 完成必需的独立审阅、`pnpm quality` 和 `git diff --check`；验收后运行 `pnpm dev:stop` 并确认 stopped。发布候选提交、测试记录和未通过项目可供用户审阅。

## 非本次目标

后续独立任务负责新增定时任务、移动远控、自动或后台启动方式、生产数据实际迁移、通用跨版本兼容层、项目 Skill 脚本重写和其他产品功能扩展。

## 已获得的授权

用户已授权调研 Agent 在独立 worktree 调研上游，授权实施 Agent 适配本仓库与自有 Desktop fork 的源码，并批准自有 Desktop fork 的精确依赖版本、安装与构建命令。实施 Agent 对自有 Desktop fork 的锁文件解析和其他运行命令分别核对具体授权记录，执行尚未覆盖的命令前取得该命令的用户批准。用户补充授权实施 Agent 适配 Catalog Source 当前带条件分支的 schema、完成同一 Generation Request 的两次独立 Run，并为 `ComfyUI工作台预设` 增加同一父 Session 的子 Agent 创建与续派能力。用户已授权发布 Agent 创建 PR、合入 main、同步 origin/main 到本地 main、发布版本，并授权部署 Agent 更新生产目录、使用 OpenRouter 免费模型验收。
