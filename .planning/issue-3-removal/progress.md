# Issue #3 删除进度

## 当前状态

- 当前阶段：已完成。
- 已启用的本机 Skill：`stop-that-shit` change 模式、`planning-with-files`。

## 操作记录

- 2026-08-24：读取仓库 Issue 操作规范、当前工作区状态和已有规划文件。
- 2026-08-24：创建本任务独立规划目录，避免覆盖用户已有的根目录规划记录。
- 2026-08-24：读取 GitHub Issue #3 正文、全部评论和关键提交记录。
- 2026-08-24：确认 #3 存在首次实现提交 `783bcd0` 和最终验收分支合并提交 `ad08322` 两阶段实现。
- 2026-08-24：列出 #3 最终分支的 22 个非合并提交和当前三列 Workbench 源文件、测试、视觉证据及文档引用。
- 2026-08-24：确认首次失败实现 `783bcd0` 不在当前主线；把 `335469b..ad08322` 确定为最终 #3 合入时相对主线的净变更边界。
- 2026-08-24：逐文件检查 #3 合并后的后续提交，确认 Issue #17、覆盖率修复和 v0.2 已继续修改部分共享文件。
- 2026-08-24：读取当前架构、目录、测试、技术栈、配置和启动规范；确认 v0.2 使用 source-only Client 生成链路。
- 2026-08-24：确认 #3 合并前 package 已包含默认 Harness UI 模块，#3 只新增 theme 注入并停用原生 `ui-layout`。
- 2026-08-24：建立当前 #3 源码消费者和测试消费者清单，确认 v0.2 已提前删除多项旧 composition/E2E 文件。
- 2026-08-24：完成归属清单并固定最小 Client、原生 `ui-layout` 和 #17 底层模块保留边界。
- 2026-08-24：用户追加授权删除 Issue #17 Session 绑定底层模块；执行范围同步扩展到专属测试、PRD 和配置字段。
- 2026-08-24：用户进一步授权删除 Issue #16 与 Issue #17 的全部代码、运行逻辑和测试；计划保留 Issue #2 Tool registry 基础设施。
- 2026-08-24：读取 Issues #16/#17 正文、评论和实现合并差异，确定 #16 的 35 文件净边界与 #17 的两个源码模块、两个专属测试边界。
- 2026-08-24：映射 Issue #16 在当前 v0.2 的 Product Agent、profile、production runtime、status、health、process 和 Host registry 责任。
- 2026-08-24：确认当前配置已移除旧 Skill root 环境字段，并定位剩余 Agent roster、DSH_TOOLS_MODE、contract 与 security 测试接线。
- 2026-08-24：删除 Issue #3 的八个 Workbench UI模块、三列样式、专属单元测试、PRD、viewport配置和八张视觉证据图片；图片仍可从 Git 历史恢复。
- 2026-08-24：把 Client 入口缩减为不注入service、不注册slot的最小ModuleLoader插件，并恢复Harness原生`ui-layout`。
- 2026-08-24：删除 Issue #16 的Agent Preset、Product Agent配置、Agent插件、生产runtime/status/health/process接线与专属测试；恢复Issue #2 Host Tool registry空集合调用。
- 2026-08-24：删除 Issue #17 的两个Session绑定模块、两个专属单元测试和PRD。
- 2026-08-24：同步README、领域上下文、system文档、ADR、package export、profile patch、静态边界与合同测试。
- 2026-08-24：确认并行任务正在修改依赖版本、根目录规划记录和Issue #1新需求计划；本任务不覆盖或归属这些并行修改。
- 2026-08-24：完成Issues #3/#16/#17专属符号残留扫描；只保留生产测试中的不存在性断言，Issue #1新需求计划中的Agent Preset旧指令交由该并行任务处理。
- 2026-08-24：独立审核指出ADR中的旧root occupant描述和startup中的Agent Preset roster描述；本任务已经删除三处当前态残留。
- 2026-08-24：PRD索引明确Ticket 03至Ticket 12仅为历史需求，依赖已删除Ticket 02或Product Agent的条目不得作为当前实现依据。
- 2026-08-24：停止PID 86531的旧受管进程，精确删除运行目录中两个旧Issue #16 Preset文件及其空目录，并使用当前源码重新启动PID 73826。
- 2026-08-24：运行profile已物化为`[]`；实时`agentPreset.list`只返回Harness系统Preset，不再返回`harness-comfyui`。
- 2026-08-24：独立审核队员复验源码、运行接线、测试、当前文档和Issue #2 Tool registry保留边界，未发现阻断问题。
- 2026-08-24：并行UI任务新增原生`sidebar.footer.action`与`conversation.input.dock`实现；本任务保留新文件，并把当前文档从“最小Client”同步为两个原生扩展位的稳定边界。
- 2026-08-24：独立审核再次确认新UI没有恢复Issue #3顶层界面替换，也没有恢复Issue #17 Session自动创建或Product Agent绑定。

## 验证结果

| 验证命令 | 结果 |
|---|---|
| `node --check scripts/production/{runtime,process,status,health}.mjs` 与 `node --check scripts/security/check-harness-boundary.mjs` | 通过 |
| `pnpm typecheck` | 通过 |
| 聚焦Vitest：Client、Tool registry、工程基线、Git隔离、Harness边界 | 5个测试文件、22个测试全部通过 |
| `pnpm prod:test` | 1个测试文件、15个测试全部通过 |
| `pnpm quality` | 预安装清单一致性、依赖公告和构建脚本审计通过；Harness边界因并行UI任务新增直接依赖`@deepseek-ai/dsh-client-ui-sidebar`而停止，本任务不覆盖该并行改动 |
| `pnpm typecheck`（并行rc.2升级后复验） | 通过 |
| `pnpm test:coverage` | 5个测试文件、50个测试全部通过；Statements 91.33%、Branches 79.41%、Functions 100%、Lines 95.45% |
| `pnpm test:contract` | 7个测试文件、17个测试全部通过 |
| `pnpm prod:test`（并行rc.2升级后复验） | 14/15通过；真实Harness健康检查因rc.2首页不匹配旧`window.__DSH_BOOT__`解析格式而报`boot graph missing`，同一测试的Client bundle下载和ModuleLoader注册已通过 |
| `pnpm test:prototype` | 27个测试全部通过 |
| `git diff --check` | 通过 |
| 生产脚本与Harness边界脚本`node --check` | 通过 |
| 删除产物存在性与可达引用复验 | 删除目录没有剩余文件；源码、脚本、测试只保留Agent roster不存在性断言 |
| 当前本机运行态复验 | PID 73826运行；旧Preset目录不存在；profile patch为`[]`；`agentPreset.list`不包含`harness-comfyui` |
| 并行原生UI接线后的`pnpm typecheck` | 通过 |
| 并行原生UI接线后的`pnpm test:unit` | 6个测试文件、56个测试全部通过 |
| 并行原生UI接线后的`pnpm test:contract` | 7个测试文件、17个测试全部通过 |
| 当前`pnpm check:harness-boundary` | 并行UI任务导入`@deepseek-ai/dsh-client-ui-conversation/client`后被现有public-specifier边界拦截；本任务不修改并行实现或边界策略 |

## 文件变更

- `.planning/issue-3-removal/task_plan.md`：新建。
- `.planning/issue-3-removal/findings.md`：新建。
- `.planning/issue-3-removal/progress.md`：新建。
- `src/client/`：删除Issue #3 Workbench模块，保留最小Client入口与最小样式。
- `src/agent/`、`agent-presets/harness-comfyui/`、`config/product-agent.json`：删除Issue #16产物。
- `scripts/production/`：删除Product Agent物化、roster与健康检查逻辑。
- `src/host/plugin.ts`：恢复Issue #2空项目Tool registry调用。
- `tests/`：删除Issues #3/#16/#17专属测试和视觉证据，更新保留合同测试。
- `README.md`、`CONTEXT.md`、`docs/system/`、`docs/adr/0012-harness-core-is-immutable.md`：同步当前系统能力。
