# v0.1.17 coverage remediation findings

## Authorization and baseline

- 用户在 2026-08-24 明确授权把 repository-wide coverage remediation 作为 Issue #17 之外的独立范围执行，并要求修复后重新资格构建再发布 `v0.1.17`。
- Review fixed point 是 `ee05caaeaa26b7c193ae5314910a1eb12c1c210f`；main 与 origin/main 在授权时一致且工作区干净。
- CI `32665629884`：Harness boundary PASS、TypeScript PASS、`23 files / 240 tests` PASS；coverage 为 lines `85.73% / 91%`、functions `91.91% / 100%`、statements `82.86% / 88%`、branches `82.09% / 79%`。
- `.planning/release-v0.1.3/` 记录的旧基线为 lines `83.55%`、functions `91.89%`、statements `81.69%`；本次授权允许补齐整个仓库的测试缺口，但不允许修改阈值或产品逻辑。

## Confirmed public seams

- Client layout/results/sidebar：现有 React component 与 `LayoutController` 公共方法，通过 `tests/unit` 渲染和公开 controller 操作观察。
- Client plugin/Session binding：`apply()`、公开 Cordis service/slot lifecycle、`startWorkbenchSessionBinding()` 的 snapshot/subscription/API 行为。
- Configuration/Host/service：Configuration Profile loader、project Tool registration、plugin status contract 的公开返回值与错误。

## CI coverage inventory

- Client `src/client/index.tsx` 是最大 line/statement 缺口：44.82%，uncovered `46-154,161-170`；functions 已 100%，修复目标是现有 `apply()` startup rollback 与 disposer 顺序的公开 lifecycle 分支。
- `layout-contract.ts` 为 statements 32%、functions 25%、lines 35%，uncovered `26-45,58-59`；当前没有独立 `layout-contract.test.ts`，适合由一个切片通过 `LayoutController` 公共方法补齐。
- `results-panel.tsx` 为 statements/lines 80%、functions 71.42%，uncovered `48,102`；现有 `results-panel.test.tsx` 有 4 项公开 UI 测试。
- `session-sidebar.tsx` 只缺 line 156 且 functions 93.33%；现有 `session-sidebar.test.ts` 有 2 项测试。
- `workbench-session-binding.ts` 为 statements 89.22%、functions 92%、lines 95.91%，uncovered 包含 `33,268,290-291`；现有 18 项状态机测试，适合作为独立精确边界切片。
- `load-profile.ts` 为 statements 86.02%、lines 89.15%，functions 已 100%；`register-project-tools.ts` 为 statements 90.9%、lines 94.73%，functions 已 100%。二者只需要补缺失错误/cleanup 公开分支。
- `theme-projection.ts` 为 statements 90%、lines 93.75%，functions 已 100%；`composer-bar.tsx`、`conversation-view.tsx`、`service/plugin-status.ts` 仅有少量 statement/branch 缺口。全局 branches 已 PASS，不以覆盖每个 branch 为目标。

## Explorer-adjudicated test slices

- Slice A 高杠杆公开 lifecycle：`tests/unit/client-plugin.test.ts` 补 sidebar、header、conversation、composer、layout provide 与 theme install 失败的逐级 rollback；只通过 exported `apply()` 观察 rejection、abort、disposer 与 Remote unmount 顺序。
- Slice A 同时拥有新的 `tests/unit/layout-contract.test.ts`，通过 public `LayoutController` 覆盖初始 snapshot、toggle/open/close、idempotence、subscribe/unsubscribe；该文件补 3 个明确 function gaps。
- Slice B UI public seams：`results-panel.test.tsx`、`session-sidebar.test.ts`、`theme-projection.test.ts`，分别补 current tab callback、hook wrapper state/reset、wrapper open delegation、install rollback 与 ownership-preserving dispose。需要 mounted React 的 hook wrapper不得直接调用函数组件。
- Slice C state/config/host：`workbench-session-binding.test.ts` 补 listener unsubscribe 与 stale pending target；`config-loader.test.ts` 补 override file read/shape errors；`register-project-tools.test.ts` 补 rollback disposer failure 的 `AggregateError`。
- `service/plugin-status.ts` 当前 functions/lines 已 100%，Explorer 判定剩余 statement 比例属于 decorator/instrumentation，不增加重复测试。
- `composer-bar.tsx` 与 `conversation-view.tsx` 剩余缺口主要是 branch/少量 statement；全局 branch 已 PASS。先不进入首轮切片，只有最终定向 coverage 仍缺 lines/statements 时才精确追加。

## Function-threshold risk

- Explorer 映射的明确 function gaps 为 layout 3、results 2、sidebar 1、Session binding 2，共 8。CI 全局显示 `125/136`，仍有 3 个函数来源需要在执行前核对顶层 entrypoint 模块或精确 coverage JSON；不得等到全量最终门禁后再盲目补测试。
- 顶层 `src/agent.ts`、`src/index.ts`、`src/types.ts` 在 CI text report 中为 0%，且恰好与未定位的 3 个 function totals 一致。Slice C 可新增一个 public-entrypoints test，通过运行时导入公开 Host/Agent/types/profile-validator entrypoints 与断言公开 export shape 覆盖模块执行；该测试不得对类型实现或空对象做无业务意义的恒真断言。

## Exclusive executor ownership

- Slice A：`tests/unit/client-plugin.test.ts`、新 `tests/unit/layout-contract.test.ts`。
- Slice B：`tests/unit/results-panel.test.tsx`、`tests/unit/session-sidebar.test.ts`、`tests/unit/theme-projection.test.ts`。
- Slice C：`tests/unit/workbench-session-binding.test.ts`、`tests/unit/config-loader.test.ts`、`tests/unit/register-project-tools.test.ts`、新 `tests/unit/public-entrypoints.test.ts`。
- 三个 Executor 使用三个独立 worktree，从同一 fixed point 建分支；任何 production/config/threshold/dependency 变更都必须停止并交回主线程裁决。

## Release boundary

- PRD 13 要求任一测试门禁失败即 NO-GO；coverage 必须在 tag/Release 前真实通过。
- PRD 14 要求 Release Preview 后的单独批准绑定 SemVer、commit、artifact filename、byte length、SHA-256、qualification、视觉证据和 release notes。
