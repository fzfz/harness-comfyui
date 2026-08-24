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

## Accepted slice evidence

- Slice A commit `9a58dd0`：只改 `client-plugin.test.ts` 和新增 `layout-contract.test.ts`；19/19 PASS。定向 coverage：`index.tsx` lines/statements `84/87`（96.55%）、functions `5/5`；`layout-contract.ts` 四项 100%。
- Slice B commit `d9b8563`：只改 results/sidebar/theme 三个测试文件；9/9 PASS。Results statements/lines 80%→90%、functions 71.42%→85.71%；Theme statements 88.57%→97.14%、lines 92.18%→100%；Sidebar branch 93.75%→100%。
- Slice B 没有为 results state callback 和 sidebar wrapper open callback 引入新 renderer 或私有 hook mock。两个函数是否阻断全局 functions 100% 由 integration candidate 的完整 coverage 结果裁决。
- Slice C commit `f837a7d`：只改 binding/config/tool tests 和新增 public-entrypoints test；51/51 PASS。Binding functions 92%→100%、lines 95.91%→97.95%；config lines 87.95%→91.56%；Tool registry lines 94.73%→100%。
- 三个 slice 经主线程逐 hunk review 后以三个 merge commit 合入 `codex/coverage-remediation-v0.1.17`，integration HEAD `5ce6dbc`。三个 executor worktree、未跟踪 symlink 和分支均已删除。

## Local dependency-link diagnosis

- 第一次完整 coverage 命令在 Vitest 启动前失败，错误为 `Cannot find module .../node_modules/vitest/vitest.mjs`；没有测试或 coverage 收集发生，因此不计作完整 coverage gate 执行。
- Tight RED `test -f node_modules/vitest/vitest.mjs` 稳定返回 1。主仓库 `node_modules/.pnpm` 仍有 637 个目录，并保留精确 Vitest package 文件。
- 主仓库只有 5 个顶层 dependency symlink，`react`、`react-dom`、`tsdown`、`typescript`、`vitest` 全部被重写为指向已经删除的 `harness-comfyui-coverage-slice-a/node_modules/.pnpm/...`。原因是 Slice A 曾在共享 node_modules symlink 下启动 `pnpm exec`，随后按指令停止，但 pnpm 已改写顶层链接。
- 修复边界是把这 5 个链接机械指回主仓库现有 `.pnpm` 中的同一精确 package 目录；不运行 install、不访问网络、不改变 lock/package manifest。
- 五个链接均已指回现有 store；`node_modules/.bin/vitest --version` 返回 `vitest/4.1.8 darwin-arm64 node-v24.14.0`，tight dependency probe GREEN。
- 后续完整命令进入 Vitest，但 8 个测试文件在 import 阶段无法解析 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`、`@deepseek-ai/dsh-workspace` 等 direct dependencies；25 files 中 17 PASS、8 FAIL，已执行 199 tests 中 198 PASS/1 FAIL，coverage summary 因 module collection failure 未生成。
- 顶层 `node_modules` 只剩此前恢复的 5 个 symlink，说明 Slice A 的 `pnpm exec` 还删除了其他 direct dependency links。`.pnpm` virtual store 内容仍在；下一步不重复测试，先审计 exact manifests/lock 和本地 pnpm 11.7.0，再做 offline frozen link reconstruction。
- Manifest audit：31 个 direct dependency specs 全部是精确版本；package/lock 未改变；repo 内 pnpm 解析为 11.7.0；CI preinstall 安全门禁已 PASS。
- 一次 planned offline/frozen/ignore-scripts install 在修改前因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 停止。为避免让 CI 模式自动清空完整 virtual store，不重试 purge；只验证并补回 direct symlink。
- `pnpm-lock.yaml` 根 importer 保存了 direct dependency 的精确 peer context；缺失导入涉及的 virtual package 目录仍存在。修复选择门禁是：31 个 direct dependency 的 `package.json` exact spec 在 `.pnpm` 内必须各自映射到唯一 package target；只要存在多义映射，就不得猜测 symlink，而应把 offline/frozen/ignore-scripts 安装定向到隔离临时 modules 目录。
- 结构化审计结果是 direct=31、missing=0、ambiguous=0；每个精确 spec 的唯一 virtual directory 与根 importer 的解析身份一致。可以只重建 31 个顶层 direct symlink，不需要重装依赖。
- 机械恢复结果为 replaced=26、unchanged=5；四个导致 collection failure 的 direct imports 已全部变绿。根因是执行队员在指向共享主 `node_modules` 的 worktree symlink 中调用 `pnpm exec`，pnpm 把主仓库顶层 direct links 改写为以该临时 worktree 为根的相对链接；后续删除 worktree 使全部链接失效。后续队员只能直接调用既有 binary，不得在共享依赖 symlink 中调用 package manager。

## Release boundary

- PRD 13 要求任一测试门禁失败即 NO-GO；coverage 必须在 tag/Release 前真实通过。
- PRD 14 要求 Release Preview 后的单独批准绑定 SemVer、commit、artifact filename、byte length、SHA-256、qualification、视觉证据和 release notes。

## Final coverage acceptance

- Candidate `eb9c5c6e14b2101de4ca517ea7841ec3ddc15a25` 在独立 dependency tree 中完成一次最终 coverage：24/24 test files 与 256/256 tests PASS。
- Statements 94.83%≥88%、branches 85.93%≥79%、functions 100%≥100%、lines 97.70%≥91%；四项固定阈值全部 PASS。
- Coverage 命令后 integration worktree 没有 tracked mutation。下一层证据必须来自 merge 后同一 main commit 的 clean GitHub CI 与 artifact qualification。

## Integration coverage residual

- Integration candidate `5ce6dbc` 的一次有效完整 coverage 收集通过全部 25 个测试文件与 256 个测试。
- 全局 statements 94.53%≥88%、branches 85.67%≥79%、lines 97.37%≥91%；functions 为 98.52%<100%。
- Coverage function map 只剩 `src/client/workbench/results-panel.tsx:102` 与 `src/client/workbench/session-sidebar.tsx:156` 两个回调未执行。其他未覆盖语句/分支不影响任何门禁，不进入返修范围。
- 现有 virtual store 不包含 `react-test-renderer`、Testing Library、jsdom、happy-dom 或 linkedom；不得新增 renderer 依赖。允许的最小接缝是在各自测试模块中隔离替换 React `useState`，调用两个 public factory 返回的组件并触发组件传给 public view 的 handler，断言 state setter 与 `ISessions.open` 的精确参数。
- Residual tests 使用每文件独立的 `vi.hoisted` state adapter 与 `vi.mock('react', importOriginal)`，保留 React 其他真实 export，并在 `beforeEach` 重置。Results 断言 setter 参数与跨 Session selection 行为；Sidebar 断言 row handler 调用 `open('video')`。定向结果为 8/8 tests PASS 且两个源文件四项 coverage 均 100%。

## Review findings and renderer dependency audit

- Standards 与 Spec reviewers 均判定 residual fake `useState` 为阻断：直接调用 hook component 不证明真实 React component identity、rerender 与 click behavior，不能作为 public-interface coverage 证据。
- 仓库的 Chrome/CDP seam 能证明真实页面交互，但运行于独立进程，无法计入当前 Vitest Node V8 coverage。仓库没有已声明的 DOM/test renderer；在禁止改 `src/**` 与保留 functions=100% 的条件下必须引入真实 test renderer。
- 唯一允许新增的 direct devDependency 是 `react-test-renderer@18.3.1`；official React 18 source docs 记录 `create()` 在无 DOM 环境生成真实 renderer tree，交互更新通过 `act()` flush。它的 peer 是 `react ^18.3.1`，与仓库 exact React 版本一致。
- Official npm registry integrity 为 `sha512-KkAgygexHUkQqtvvx/otwxtuFu5cVjfzTCtjXLH9boS19/Nbtg84zS7wIQn39G8IlrhThBpQsMKkq5ZHZIYFXA==`；package 没有 preinstall/install/postinstall。解析的传递版本是 `react-is@18.3.1`、`scheduler@0.23.2`、`react-shallow-renderer@16.15.0`。
- GitHub Advisory Database 对 `react-test-renderer@18.3.1` 及上述三个精确传递版本均返回空列表。安装命令必须包含 `--save-exact --ignore-scripts`，并在无共享 `node_modules` 的独立 worktree 中执行；最终 quality preinstall 仍需审计完整锁。
- Spec reviewer 判定 `public-entrypoints.test.ts` 对 instrumented totals 无贡献并扩大 coverage-only 范围，必须删除。两个 reviewers 均发现 `themeGetError` fixture branch 未被使用，必须删除死测试夹具。Theme priority P3 属于非阻断建议且不进入本次范围。
- Repair 验证证明真实 renderer 可在现有 Node V8 coverage 中执行两个 wrapper callbacks；Results 通过同一 renderer 的 click/update 观察 Session tab selection，Sidebar 从 renderer tree 点击真实 row handler。`quality:preinstall` 对更新后的完整 lock 返回四级 advisories 均为 0。
- Standards 复审确认原 blocker 和 dependency boundary 已修复。Spec 复审发现 `engineering-baseline.test.ts` 对 `manifest.devDependencies` 使用 exact-object contract；新增 direct devDependency 必须同步把 `'react-test-renderer': '18.3.1'` 加入该唯一结构化期望，否则 release contract gate 必然失败。
