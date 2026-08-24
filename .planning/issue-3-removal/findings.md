# Issue #3 删除范围发现记录

## 已确认事实

- 当前仓库包含用户已有的未跟踪文件和其他任务的 `.planning/` 目录；计划执行者必须保持这些文件不变。
- GitHub Issue #3 已经关闭，但用户本轮要求删除仓库中的 Issue #3 实现产物。
- Issue #3 的产品范围是三列 Workbench、Session 搜索与切换、普通消息提交、Agent 增量文本、右列结果标签和无运行空态。
- Issue #3 的正文把 `docs/v0.1/PRDS/02-three-column-chat.md` 指定为本 Issue 的产品需求文档。
- Issue #3 的首次实现提交是 `783bcd0886a7137a646858971e51d798e59a20a2`，该提交修改 Client、浏览器测试基础设施和 #3 测试，并新增三个单元测试文件。
- `783bcd0` 不属于当前 `HEAD` 的祖先；首次失败实现已经不在当前主线，不能根据该提交删除当前文件。
- Issue #3 的最终实现分支通过合并提交 `ad08322` 进入 `main`；分支末端提交 `7a84698` 新增 `tests/visual/evidence/issue-3/` 下九个验收证据文件。
- 合并提交 `ad08322` 的第一父提交是 `335469b`，第二父提交是 `7a84698`。Issue #3 分支在合并前包含 22 个非合并提交，其中前 12 个提交实现 Client Workbench 与 E2E，后续提交调整部署健康检查、配置、文案、composition 测试和视觉证据。
- `git diff 335469b..ad08322` 是 Issue #3 合入当时相对主线的净变更：52 个文件、5362 行新增、231 行删除。该差异新增 9 个 `src/client/workbench/` 正式模块、8 个 #3 单元测试文件、1 个 E2E 文件、1 个 composition 文件、9 个视觉证据文件和 viewport 配置，并修改 Client 入口、样式、部署、配置、依赖和共享测试。
- Issue #3 合并前的主线 `335469b` 中，`src/client/index.tsx` 只注入 `remote` 并挂载 `harness-comfyui/remote`；`src/client/styles.css` 只包含 `[data-plugin="harness-comfyui-details"] { min-width: 0; }`。这两个版本构成 Issue #2 Client 基线。
- Issue #3 合并后，后续 Issue #17 修改了 `src/client/index.tsx`、`root.tsx`、`session-sidebar.tsx` 和相关测试；v0.2 又修改了 Client 入口、部署脚本、测试基础设施与包配置。删除 #3 时不能把这些文件直接整体恢复到 `335469b`，除非同时明确处理后续代码的可达性。
- Issue #3 最终评论还把 `eefceb3`、`9203d11` 和 `7a84698` 列为关键提交；前两个提交修改部署 Source discovery gate 与 Agent provider 配置，需要继续判断这些变更是否属于 #3 独占逻辑或后来版本的共享基础。

## 待确认归属

- Issue #3 正文定义的源代码模块。
- 实现 Issue #3 的提交及其文件集合。
- 后续 Issue 对 Issue #3 模块的引用关系。
- Issue #3 独占测试、夹具和产品文档。
- 首次实现提交 `783bcd0` 之前的 Client 基线，以及 #3 最终分支相对合并时 `main` 的完整差异。
- Issue #16、Issue #17 和 v0.2 对 #3 Client 模块、测试基础设施与配置的后续修改。
- 当前 `src/client/` 包含入口、样式和 `workbench/` 下 10 个模块；其中 `layout-contract.ts`、`results-panel.tsx`、`root.tsx`、`session-header.tsx`、`session-sidebar.tsx`、`theme-projection.ts` 与三列 Workbench 直接对应。
- 当前 `workbench/` 中 `composer-bar.tsx`、`conversation-view.tsx`、`layout-contract.ts`、`results-panel.tsx`、`root.tsx`、`session-header.tsx`、`session-sidebar.tsx` 和 `theme-projection.ts` 都由 Issue #3 分支首次新增；`session-binding-errors.ts` 与 `workbench-session-binding.ts` 由后续 Issue #17 首次新增。
- 当前仓库仍在 `CONTEXT.md`、`README.md`、两份 system 文档、PRD 索引、PRD 16、Issue #18 迁移计划及多份历史设计记录中把三列 Workbench 描述为现存能力；需要区分产品现状文档、#3/#16 专属 PRD、Issue #18 迁移计划和历史研究记录。
- Issue #3 净变更中的 18 个路径在合并后没有再修改，可以按归属直接删除或恢复；其余共享路径包含 Issue #17、覆盖率修复和 v0.2 的后续修改，必须逐段删除 #3 专属内容。
- 当前 v0.2 已把浏览器 Client 入口改为启动时从 `src/client/index.tsx` 生成 `.local/source-client/client.js`；当前 package 不再导出 `harness-comfyui/remote`，因此不能原样恢复 Issue #2 的 `harness-comfyui/remote` import。
- 当前 `tests/unit/client-bundle.test.ts` 明确断言 `src/client/index.tsx` 不包含 `harness-comfyui/remote`，这属于 v0.2 source-only 运行合同。
- 当前 `cordis.patch.yml` 仍停用 `ui-layout`，`scripts/production/health.mjs` 仍检查上游 `ui-layout` 被停用；这两处是 #3 自定义 root 接管页面的运行条件。删除 #3 后必须恢复上游 `ui-layout`，并同步健康检查。
- Issue #3 合并前的 `cordis.patch.yml` 只插入 `harness-comfyui` Host plugin；因此删除 `ui-layout disabled: true` 是确定的恢复操作。
- Issue #3 合并前的 `package.json.dsh.client.inject` 已包含 connection、remotes、locale、runtime、conversation、input-trigger 与 layout；Issue #3 只新增 theme module。删除 #3 后可以从直接/peer依赖和 `dsh.client.inject` 删除 theme，不需要移除其他 Harness UI package。
- 当前 system 文档把 `src/client/` 定义为三列工作台，并把生产启动描述为生成当前 Client 模块。删除 #3 后，system 文档必须把 Client 描述改为不占用原生 UI 的最小源码插件，直到新需求实现替代 Client。
- 当前直接消费 #3 模块的测试是 `composer-bar.test.tsx`、`conversation-view.test.tsx`、`layout-contract.test.ts`、`results-panel.test.tsx`、`session-header.test.ts`、`session-sidebar.test.ts`、`theme-projection.test.ts`、`workbench-surface.test.tsx` 和 `workbench-session-binding.test.ts`。前八个文件测试 #3 独占模块，应删除；最后一个文件由 #17 新增，必须删除其中对 #3 root/layout/sidebar 的组合断言并保留纯 Session 绑定分支。
- `tests/unit/client-plugin.test.ts` 的 10 个测试全部断言 #3 root、occupant、layout、theme 和 #17 绑定的运行时接线；该文件应改为验证最小 Client 不注入服务、不读取上下文且 cleanup 可执行。
- 当前 v0.2 已删除 `tests/integration/client-bundle.test.ts`、`tests/composition/profile-composition.test.ts`、`tests/composition/root-boot-order.test.ts` 和 `tests/e2e/workbench-browser.test.ts`；这些旧 #3 测试不再需要重复处理。当前仍存在的 `tests/composition/root-boot-order.test.ts` 等路径查询失败属于历史列表与当前树不同，不是新的工作区错误。
- 多份后续 PRD 把 Ticket 02 的自定义 `sidebar`、`conversation.view`、`details` 和 composer occupant 当作前置条件。由于这些 Issue 均未实现且 #1 已关闭，本次必须至少删除 PRD 02 与 PRD 索引入口，并在当前 system 文档和 README 中移除“现存三列工作台”描述；是否删除所有未实现后续 PRD 不属于本次目标。

## 删除候选

| 路径或符号 | 类型 | 归属证据 | 处理决定 |
|---|---|---|---|
| `docs/v0.1/PRDS/02-three-column-chat.md` | 产品文档 | Issue #3 正文唯一指定的 PRD | 待检查后删除 |
| `tests/visual/evidence/issue-3/` | 测试证据 | `7a84698` 只为 Issue #3 新增 | 删除 |
| `tests/unit/browser-interception.test.ts` | 测试 | `783bcd0` 新增 | 待检查后删除 |
| `tests/unit/browser-resource-lifecycle.test.ts` | 测试 | `783bcd0` 新增 | 待检查后删除 |
| `tests/unit/profile-fixture-environment.test.ts` | 测试 | `783bcd0` 新增 | 待检查后删除 |
| `src/client/workbench/layout-contract.ts` | 运行逻辑 | 固定 #3 三列尺寸和开关状态 | 删除 |
| `src/client/workbench/results-panel.tsx` | UI 代码 | 文件注释和文案直接标识 #3 空结果面板 | 删除 |
| `src/client/workbench/root.tsx` | UI 代码 | #3 项目 root 和三列 slot 组合入口 | 待检查 #17 后删除或拆分 |
| `src/client/workbench/session-header.tsx` | UI 代码 | #3 当前 Session 标题 | 删除 |
| `src/client/workbench/session-sidebar.tsx` | UI 代码 | #3 Session 搜索和列表 | 待检查 #17 修改后删除或拆分 |
| `src/client/workbench/theme-projection.ts` | 运行逻辑 | #3 停用上游 layout 后承担主题投影 | 删除 |
| `src/client/workbench/composer-bar.tsx` | UI 代码 | Issue #3 分支 `4aa9df8` 首次新增 | 删除 |
| `src/client/workbench/conversation-view.tsx` | UI 代码 | Issue #3 分支 `7ba97b7` 首次新增 | 删除 |
| `tests/unit/results-panel.test.tsx` | 测试 | 测试描述直接标识 Issue 3 | 删除 |
| `tests/unit/workbench-surface.test.tsx` | 测试 | 测试描述直接标识 Issue 3 | 删除 |
| `tests/unit/composer-bar.test.tsx` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/unit/conversation-view.test.tsx` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/unit/session-header.test.ts` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/unit/session-sidebar.test.ts` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/unit/theme-projection.test.ts` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/composition/root-boot-order.test.ts` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/e2e/workbench-browser.test.ts` | 测试 | Issue #3 净差异新增 | 删除 |
| `tests/visual/prototype-fidelity-viewports.json` | 测试配置 | Issue #3 净差异新增并只用于原型 1:1 viewport | 待检查其他测试引用后删除 |
| `src/client/index.tsx` 中三列 root、slots、theme、input trigger 和五个 Workbench occupant 的注册 | 运行逻辑 | Issue #3 净差异把 Issue #2 的 Remote-only Client 替换为三列 Client | 删除；恢复 Issue #2 Remote 挂载，并另行处理 #17 绑定引用 |
| `src/client/styles.css` 中全部三列 Workbench 样式 | UI 样式 | Issue #3 新增 931 行，合并后没有其他提交修改 | 恢复 Issue #2 的单条 details 样式 |
| `cordis.patch.yml` 的 `ui-layout disabled: true` row | composition 逻辑 | Issue #3 净差异新增 | 删除该 row，使 Harness 原生 layout 恢复加载 |
| `scripts/production/health.mjs` 的 `ui-layout` 禁用断言 | 健康检查逻辑 | 只用于证明 #3 root 接管页面 | 删除或改为验证原生 layout 已加载 |
| `@deepseek-ai/dsh-client-ui-theme` 的直接、peer 和 package client inject 声明 | 依赖配置 | Issue #3 为自定义主题投影新增 | 从 `package.json` 和 lockfile 根 importer 删除；不改变传递依赖版本 |
| `scripts/security/check-harness-boundary.mjs` 中 #3 UI import allowlist、theme client inject 与自定义 loader patch 常量 | 静态门禁逻辑 | Issue #3 为三列 Client 冻结 | 删除 #3 专属 import，恢复无 `ui-layout disabled` 的 Loader patch，并保留 v0.2 与 Agent 边界 |
| `tests/security/check-harness-boundary.test.ts` 对应 fixture | 测试 | 测试共享门禁中的 #3 配置 | 同步为恢复原生 layout 后的结构化合同 |

## 必须保留

| 路径或符号 | 保留依据 |
|---|---|
| Issue #18 的分支提交 | Issue #18 不在当前 `main`，用户没有授权删除该分支或其工作树 |
| 用户已有的未跟踪文件 | 这些文件不是 Issue #3 已提交实现产物 |
| `prototype/generation-workbench/` | Issue #3 正文把静态原型定义为设计和成对证据基准，不是正式 bundle 或 runtime；该原型早于 #3 实现 |
| v0.2 source-only Client 生成链路 | `scripts/production/client-module.mjs` 和 `.local/source-client/client.js` 合同由 v0.2 引入，不属于 Issue #3 |

## 用户追加删除范围

- 用户明确要求把原计划保留的 Issue #17 Session 绑定底层模块也删除。
- 追加范围包含 `src/client/workbench/session-binding-errors.ts`、`src/client/workbench/workbench-session-binding.ts`、两份专属单元测试、PRD 16 和只供该模块读取的 Session 列表收敛超时配置。
- 用户进一步明确要求删除 Issue #16 与 Issue #17 的全部代码、运行逻辑和测试。
- Issue #16 删除范围需要从其 GitHub 正文、合并提交和后续 v0.2 修改中重新确认；Issue #2 已经交付的 Tool registry 基础设施不属于删除范围。
- Issue #16 的实现基线提交是 `a149cd5`，实现合流提交是 `335469b`。净变更覆盖 35 个文件、2224 行新增、45 行删除。
- Issue #16 净新增 `agent-presets/harness-comfyui/`、`config/product-agent.json`、`src/agent.ts`、`src/agent/plugin.ts`、Agent 构建入口、Tool scope composition 测试、Agent Preset 安装测试和 Agent plugin 单元测试；同时把项目 Tool registry 的唯一调用从 Host root 移入 Agent Preset scope，并扩展安装、启动、状态、健康、配置和边界检查。
- Issue #16 的合并后 v0.2 已把旧 `scripts/deploy/` 生命周期替换为 `scripts/production/` source-only 生命周期，因此删除必须针对当前 `scripts/production/product-agent.mjs`、`spawn.mjs`、`health.mjs` 和测试中的 Agent 接线，不恢复已删除的旧部署程序。
- 当前 `src/host/plugin.ts` 只加载配置；Issue #16 删除了 Issue #2 在 Host root 中对 `registerProjectTools(ctx, [])` 的调用。删除 Issue #16 时必须恢复这个空集合 registry 调用，但不恢复 v0.2 已删除的 PluginStatus Remote。
- 当前 `profiles/comfyui-workbench/cordis.patch.yml` 只把 `agent-presets` 默认值设为 `harness-comfyui`；Issue #16 前该文件内容是结构化空数组 `[]`。删除 Issue #16 后恢复为 `[]`。
- 当前 `scripts/production/runtime.mjs` 在每次 start/restart 中读取、复制和验证 Product Agent；`status.mjs` 要求在线 Agent Preset roster；`process.mjs` 实现 `agentPreset.list` RPC、roster 验证和固定 `DSH_TOOLS_MODE=native`；`health.mjs`包含 `agentPresetRuntime`与`agentPresetRoster`两个健康项。这些都是 Issue #16 当前运行逻辑，应删除。
- 当前 Product Agent package export 指向 `src/agent/plugin.ts`，没有旧 artifact `files` 清单；删除只需要移除当前 export，不恢复旧 artifact 配置。
- `package.json` 在 Issue #16 当时只新增 Agent export与artifact文件清单，没有新增新的依赖版本；当前删除不需要变更依赖版本。
- 当前 `config/environment-overrides.json` 和 `src/config/load-profile.ts` 已经没有 Skill root 或 Agent 专属环境字段，v0.2 已提前删除这些旧接线。
- 当前 `scripts/production/process.mjs#buildHostEnvironment()` 仍固定 `DSH_TOOLS_MODE=native`；该值由 Issue #16 为项目 Agent scope 引入，应删除。
- 当前 `tests/production/source-production.test.mjs` 的受控 Host fixture实现 `/api/agentPreset.list`，成功生命周期断言 `agentPresetRuntime`；删除 Product Agent 后应移除该伪 RPC 和两项证据断言，保留进程、Web、Client、Run Repository 与 Saved Media 验收。
- 当前 `tests/contract/runtime-git-isolation.test.ts` 与 `engineering-baseline.test.ts` 仍要求 Agent Preset、配置和 export 路径；这些结构断言属于 Issue #16，应删除。
- 当前安全边界把 `src/agent/plugin.ts` 设为 `registerProjectTools()` 唯一调用者，并解析 `config/product-agent.json`、Agent export 与 Agent profile patch。删除 Issue #16 后，唯一调用者必须恢复为 `src/host/plugin.ts`，安全 fixture不再创建 Product Agent 文件。
- Issue #17 的净新增文件只有 `session-binding-errors.ts`、`workbench-session-binding.ts`、`session-binding-errors.test.ts` 和 `workbench-session-binding.test.ts`；其余 #17 修改落在已经删除的 #3 Client 文件和测试中。

## Issue #16 删除候选

| 路径或符号 | 归属证据 | 处理决定 |
|---|---|---|
| `agent-presets/harness-comfyui/` | Issue #16 净新增 | 删除 |
| `config/product-agent.json` | Issue #16 净新增且被 #17 复用 | 删除 |
| `src/agent.ts`、`src/agent/plugin.ts` | Issue #16 净新增 | 删除 |
| `package.json.exports["./agent"]` | Issue #16 新增 | 删除 |
| `profiles/comfyui-workbench/cordis.patch.yml` 的 Agent Preset 默认值 | Issue #16 修改 | 恢复 Issue #16 前 profile patch |
| `scripts/production/` 中 Product Agent 准备、环境和健康逻辑 | v0.2 对 Issue #16 生命周期责任的当前实现 | 逐段删除 |
| `tests/unit/agent-plugin.test.ts` 与当前 Product Agent/生产生命周期测试分支 | Issue #16 及其 v0.2 迁移测试 | 删除专属文件并逐段清理共享测试 |
| `src/host/plugin.ts` 的空项目 Tool registry 调用 | Issue #2 已交付、Issue #16 删除 | 恢复调用并保留空定义集合 |
| `scripts/production/product-agent.mjs` | v0.2 当前 Product Agent准备与验证实现 | 删除 |
| `scripts/production/process.mjs` 的 Agent roster RPC/验证和 `DSH_TOOLS_MODE` | Issue #16 当前运行逻辑 | 删除 |
| `scripts/production/runtime.mjs` 的 Product Agent物化/验证/返回字段 | Issue #16 当前运行逻辑 | 删除 |
| `scripts/production/status.mjs` 的在线 roster gate | Issue #16 当前运行逻辑 | 删除 |
| `scripts/production/health.mjs` 的两个 Agent健康项 | Issue #16 当前运行逻辑 | 删除 |

## Issue #17 删除候选

| 路径 | 处理决定 |
|---|---|
| `src/client/workbench/session-binding-errors.ts` | 删除 |
| `src/client/workbench/workbench-session-binding.ts` | 删除 |
| `tests/unit/session-binding-errors.test.ts` | 删除 |
| `tests/unit/workbench-session-binding.test.ts` | 删除 |
| `docs/v0.1/PRDS/16-workbench-session-preset-binding.md` | 删除并移除 PRD 索引入口 |
