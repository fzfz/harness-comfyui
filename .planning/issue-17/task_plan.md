# Issue #17 execution plan

## Goal

严格依据 GitHub Issue #1 的当前父规格和 Issue #17 的当前验收清单，在独立 worktree 中完成 `harness-comfyui` Preset Session 创建、过滤、恢复和错误呈现；主线程只负责范围裁决、diff 审查、验收、合并、关闭 Issue 与发布 `v0.1.17`。

## Scope boundary

- Issue #17 定义允许实现的产品行为与验收条件。
- Issue #1 定义 Harness rc.8 公共接口、真实产品 CLI、浏览器和生命周期验收约束。
- `/Volumes/4Tdisk/work/AI2/deepseek-harness`、数据源仓库和其他 Issue worktree 保持只读。
- 本任务不增加新建 Session 控件，不改变三列布局、尺寸、样式、文案或输入交互，不实现移动端，不建立兼容、降级或第二套 Session 状态。

## Test strategy

- 已确认测试接缝：公开 `connection`/Session Client API、现有三列 Workbench 组合接口、真实产品 CLI、真实浏览器 `1440x1000` 页面。
- 每个纵向切片执行 red -> green，并只运行该切片的定向测试。
- 执行期间只在类型边界变化后运行 typecheck；记录 PASS 的 commit 与命令，后续任务不得无理由重复。
- 主线程根据 `git diff <accepted-commit>...HEAD` 派发具体返修与新增测试。
- 完整测试、高耗时生命周期和浏览器验收只在最终候选 commit 运行一次；候选发生代码变化后，只重跑受影响检查，最终高耗时门禁仅在证据失效时重跑。

## Phases

| Phase | Status | Acceptance |
|---|---|---|
| 1. 固定现场与规范 | complete | 记录 Issue #1/#17、依赖、当前 main、worktree、Release 和验收边界 |
| 2. 建立独立 worktree | complete | 从已同步本地 `main` 建立 `codex/issue-17-session-binding` 与独立目录，不改动其他 worktree |
| 3. 纵向切片 A：恢复既有项目 Session | complete | 混合列表只显示项目 Session；保持合格当前 Session；稳定选择并打开唯一既有项目 Session；定向测试 PASS |
| 4. 纵向切片 B：首次创建项目 Session | complete | 无项目 Session 时 create-once；校验 resolved Preset；列表收敛后 open；取消与六项失败分支定向测试 PASS |
| 5. 纵向切片 C：错误恢复与真实消息边界 | complete | Client connection inject、中列具体错误/空态、失败禁用消息、同 generation 去重、刷新/重连恢复；定向测试与 typecheck PASS |
| 6. 主线程 diff 审查与返修 | complete | 主线程逐 hunk 核对范围、接口和验收；执行队员只修复明确 finding |
| 7. 两轴代码审查 | complete | 独立 Standards Reviewer 与 Spec Reviewer 返回可用结论；已接受 finding 完成返修 |
| 8. 最终验收 | complete | 定向回归、一次完整测试、高耗时真实 lifecycle、真实浏览器功能与独立视觉验收全部 PASS；Host 已 stop |
| 9. 集成本地 main | complete | worktree 分支与最终 boundary repair 分支均已提交并合入本地 main；两个 worktree 与分支均已删除 |
| 10. 关闭与发布 | in_progress | Issue #17 已关闭；版本提交为 `0.1.17`；tag/Release `v0.1.17` 与发布 artifact 身份验证通过 |

## Test evidence ledger

| Commit | Check | Result | May reuse until |
|---|---|---|---|
| `e61fcf4` | focused unit: client plugin + sidebar + workbench binding | 15/15 PASS | related source/test changes |
| `e61fcf4` | `node_modules/.bin/tsc --noEmit` | PASS | TypeScript source/type changes |
| `e61fcf4` | `git diff --check` and cached diff check | PASS | diff changes |
| `829113c` | focused binding + error contract tests | 13/13 PASS | binding/error source changes |
| `829113c` | `node_modules/.bin/tsc --noEmit` | PASS | TypeScript source/type changes |
| `7622495` | focused binding test after config-source repair | 11/11 PASS | binding source changes |
| `7622495` | `node_modules/.bin/tsc --noEmit` and diff checks | PASS | TypeScript/diff changes |
| `6c86e41` | affected root/client/binding unit tests | 39/39 PASS | related root/client/binding changes |
| `6c86e41` | `node_modules/.bin/tsc --noEmit` and diff checks | PASS | TypeScript/diff changes |
| `b48bc5b` | binding + client rollback + sidebar focused tests | 31/31 PASS | related source/test changes |
| `b48bc5b` | `node_modules/.bin/tsc --noEmit` and diff checks | PASS | TypeScript/diff changes |
| `4ab14e7` | Issue #17 real browser Session create/reconnect E2E | 1/1 PASS | E2E test or product Session behavior changes |
| `4ab14e7` | `git diff --check` and cached diff check | PASS | diff changes |
| `1a24166` | Harness boundary focused security tests | 41/41 PASS | boundary allowlist or security test changes |
| `1a24166` | direct `check-harness-boundary.mjs` and `git diff --check` | PASS | boundary source or diff changes |

## Two-axis review status

### Standards

- Reviewer reported the `connection` inject addition conflicts with ADR 0012. The current GitHub Issue #1 identifies itself as the unique latest parent specification and Issue #17 explicitly requires this public service; the Issue worktree will not expand scope by rewriting ADR 0012.
- Reviewer reported the exact `10 秒` error copy duplicates the numeric timeout configuration. The runtime duration remains sourced only from `config/product-agent.json`; the user-facing sentence remains sourced only from the required `session-binding-errors.ts` mapping. These are separate runtime and copy sources, so no production change is authorized.
- Reviewer identified untested synchronous create throw, rejected create Promise, failed RPC envelope, and startup rollback branches. The create-path tests are accepted repair scope because repository rules require branch coverage. Startup rollback coverage is accepted only for the new binding disposer at the existing public plugin lifecycle seam.
- Reviewer reported duplicate Workbench Session filtering in the sidebar. Reusing `workbenchSessions(state)` is accepted as a local single-source repair.
- Reviewer suggested centralizing repeated rollback disposal. The repetition follows the existing explicit rollback structure; refactoring it would exceed the Issue #17 behavior boundary and is not accepted.

### Spec

- Reviewer found that `openIssued` remains true after a successful open and the binding can remain `ready` when `sessions.list.current` later changes to a non-project Session. This is an accepted high-priority defect because it can leave the composer mounted for the wrong Session.
- Reviewer identified missing create rejection/failed-envelope assertions through the middle-column error state and message-submission boundary. This is accepted test scope.
- Reviewer confirmed that real rc.8 lifecycle, browser streaming/reload/reconnect/restart, broken Preset, and `1440x1000` visual evidence remain final acceptance gaps rather than implementation scope changes.

## Errors encountered

| Error | Attempt | Resolution |
|---|---|---|
| current main CI run 32651616423 fails stale package version assertion | baseline evidence | keep outside Issue #17 diff; repair only in authorized v0.1.17 release commit; run overall full suite once on release candidate |
| `pnpm typecheck` refuses shared symlinked node_modules in non-TTY mode | slice A attempt 1 | no install performed; use the pinned existing `node_modules/.bin/tsc --noEmit` executable |
| Deploy preflight resolved ambient pnpm 10.32.1 instead of required 11.7.0 | final acceptance | selected an existing local pnpm 11.7.0 package through a temporary wrapper-first PATH; no download, install, or global configuration change |
| cold Composition profile run exceeded its 90 second test timeout | final acceptance | let the focused scenario exit naturally; it passed in 83.226 seconds, then ran only the two remaining composition files |
| Issue #3 E2E expected an empty Session list | final acceptance | Issue #17 now creates exactly one project Session; executor updated only that E2E to assert create-once and a stable second browser connection |
| main CI `32664651582` rejected the new public connection type import | release qualification | reopened #17; a repair worktree added only the rc.8 public type-only specifier and positive/negative security tests; focused 41/41 and direct boundary check PASS |
