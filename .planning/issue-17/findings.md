# Issue #17 findings

## Live issue state

- Issue #3 已于 2026-08-23 关闭。
- Issue #16 已于 2026-08-23 关闭。
- Issue #17 当前 OPEN，标签为 `ready-for-agent`，原生父 Issue 是 #3；GitHub 依赖为已关闭的 #3 和 #16；没有子 Issue。
- Issue #1 是 #3 的原生父 Issue，当前正文是父规格唯一最新规范。

## Exact implementation boundary

- 只允许使用 `ctx.connection.api.sessions.create(payload, signal)`、`ctx.connection.hostDescription`、`ctx.sessions.list.getSnapshot()/subscribe()` 与 `ctx.sessions.open(sessionId)`。
- Workbench 只显示 `origin !== "subagent"` 且 `agentPreset === "harness-comfyui"` 的 Session。
- 当前 Session 合格时保持；否则按 `updatedAt` 降序、`id` 升序打开唯一既有项目 Session。
- 没有项目 Session 时，同一 connection generation 只创建一次 `{ cwd: hostDescription.cwd, agentPreset: "harness-comfyui" }`。
- resolved Preset ID 必须严格等于 `harness-comfyui`；相同 Session ID 与 Preset header 进入 Harness Session 列表后才能 open。
- generation 结束或组件卸载必须取消请求与订阅；收敛超时读取 `config/product-agent.json#sessionListConvergenceTimeoutMs` 的 10000 毫秒。
- 六项错误码与中文文案必须保存在 `src/client/workbench/session-binding-errors.ts` 唯一映射。
- 失败必须进入既有中列错误/空态；不得回退到其他 Preset，不得向错误 Session 提交消息。
- PRD 固定 `hostDescription.getSnapshot()/subscribe()`；它不是可直接读取的普通属性。
- 可读取的 SessionSummary 字段只包括 `agentPreset`、`origin`、`updatedAt`、`id` 与 `cwd`。
- 创建响应必须是成功结果；成功后订阅唯一 `ctx.sessions.list`，不得用 fixture 补齐正式 runtime Session。

## Exact error copy

- `WORKBENCH_HOST_DISCONNECTED` -> `无法连接 Harness Host，暂时不能打开 ComfyUI 工作台会话。`
- `WORKBENCH_SESSION_CREATE_FAILED` -> `Harness 未能创建 ComfyUI 工作台会话，请查看产品日志。`
- `WORKBENCH_SESSION_PRESET_MISMATCH` -> `Harness 创建的会话没有使用 harness-comfyui Agent Preset。`
- `WORKBENCH_SESSION_LIST_TIMEOUT` -> `Harness 已创建会话，但会话列表在 10 秒内没有确认该记录。`
- `WORKBENCH_SESSION_LIST_MISMATCH` -> `Harness 会话列表中的 Agent Preset 与创建结果不一致。`
- `WORKBENCH_SESSION_OPEN_FAILED` -> `Harness 已确认会话，但工作台无法打开该会话。`

## Acceptance boundary

- 自动化：初始 create-once；混合 Session 过滤；刷新、重连、restart 恢复；Preset 缺失/破坏；创建响应 mismatch；列表迟到；列表 mismatch；open failure；失败路径不提交普通消息。
- 真实产品：worktree tarball + `runtime/production/installation.json` + production profile；status、health、logs、浏览器验收、stop 和端口/PID 清理。
- 浏览器：项目 Agent 接收普通消息并流式回复；刷新、重连、restart 不新增 Session。
- 独立视觉：`1440x1000` 对比 Ticket 02 的左列、标题、普通消息、流式状态、输入区和右列阶段状态；不允许新增控件或改变三列尺寸。

## Repository and release state

- 检查时 `main`、`origin/main` 与 HEAD 都是 `b451b1905bd88d5efaa712e9fc0d50903f5d498e`。
- 最新实现合并提交是 `ad08322 Merge branch 'codex/issue-3-three-column-chat'`；`v0.1.3` tag 指向 `b292e1c`；`main` 后续 `b451b19` 记录 Release。
- 当前 `package.json.version` 为 `0.1.3`；GitHub 最新 Release 是 `v0.1.3`。
- 2026-08-24 fetch 后，`main` 与 `origin/main` 仍同时指向 `b451b1905bd88d5efaa712e9fc0d50903f5d498e`。
- 独立 worktree 是 `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17`，分支是 `codex/issue-17-session-binding`，基线是 `b451b19`。
- worktree 的 `node_modules` 是指向主工作树现有依赖树的未跟踪 symlink；执行队员不得暂存它，最终验收前删除。没有执行依赖安装。
- 发布体系由 `main` push 触发 CI 和 artifact qualification；`.github/workflows/release.yml` 只生成 Release Preview。`v0.1.3` 的最终 annotated tag 与 GitHub Release 是人工发布步骤，必须从历史发布记录提取精确边界后执行。
- `v0.1.3` 的版本 commit 先更新 `package.json.version`，tag 指向该版本 commit；GitHub Release 创建后，后续 `docs: record v0.1.3 release` commit 才更新 README 的 Release tag、commit、日期与历史表。
- 当前发布流程不存在自动创建 tag/GitHub Release 的脚本；本任务必须把 CI qualification、Release Preview、annotated tag、tag push 与 GitHub Release 当作分开的验收门禁。

## Verified baseline failure

- GitHub CI run `32651616423` for current `main` commit `b451b19` failed in `tests/integration/plugin-status.test.ts` because the test still expected package version `0.1.0-rc.7` while production returned `0.1.3`.
- The same run proved `check:harness-boundary`, `tsc --noEmit`, dependency installation and 207/208 unit/integration tests passed before the stale version assertion failed.
- This failure predates Issue #17 and is not part of its Session behavior. The Issue worktree must not change it. The separately authorized `v0.1.17` release commit must update the version assertion through the repository's single structured version source or exact release identity, then the overall final full suite runs once on the release candidate.
- Because the release version change invalidates package/artifact identity evidence, final artifact/lifecycle qualification after the version commit is a required recheck, not an unnecessary repetition of Issue #17's focused tests.

## Implementation slice ownership

- Slice A owns the existing-Session user path across the binding module, Session sidebar projection and focused public-interface tests.
- Slice B owns the no-Session user path across create-once, resolved Preset validation, list convergence, cancellation, error contract and focused public-interface tests.
- Slice C owns Workbench composition and recovery across `connection` injection, one binding lifecycle, existing middle-column state, composer submission guard, reconnect/refresh behavior and focused composition/browser tests.
- The slices are sequential because they modify one worktree. Each executor must commit only its accepted slice and may not install new dependencies or change version/release files.

## Accepted slice A

- Commit `e61fcf41159d86537cb531e409059b01eb2d0dc2` adds `connection` to the Client inject contract and starts one binding before rendering the Workbench root.
- `workbench-session-binding.ts` uses only public hostDescription, Session list and open interfaces for the existing-Session path.
- Sidebar filtering and deterministic selection reuse one `isWorkbenchSession` definition; there is no second persisted Session collection.
- Main-thread full diff review found no slice-A scope expansion. Create, error mapping, open rejection and connection-generation recovery remain explicitly unimplemented for slices B/C.

## Slice B review finding

- Commit `829113c` correctly reads `sessionListConvergenceTimeoutMs` from `config/product-agent.json`, implements the rc.8 `RpcResponse.result` shape, serializes one create promise per active Host snapshot, aborts on disconnect/dispose, waits for list convergence, and publishes the six exact structured errors.
- The same commit incorrectly declares `WORKBENCH_AGENT_PRESET = 'harness-comfyui'` instead of reading `config/product-agent.json#agentPresetId`. Issue #16 and project rules define that JSON property as the unique structured source. Slice B is not accepted until an executor removes the duplicate value source.
- Public rc.8 declarations confirm `ConnectionHandle.api.sessions.create` returns `Promise<RpcResponse<...>>` and `ISessions.open(id)` returns `void`; the commit's envelope inspection and synchronous open-error handling match those contracts.

## Accepted slice B

- Repair commit `76224952c44d36ebb05daa0492963a5c111741ed` changes the production Preset constant to `productAgentConfig.agentPresetId`; the duplicate structured value is gone.
- Main-thread review accepted the create/convergence state machine after the repair. Binding/error tests and tsc were rerun only because the affected production source changed.
- Slice C must render binding errors in the existing middle-column error region and must prevent the conversation/composer slot from mounting until the binding is ready; it must not add controls or change layout/style.

## Accepted slice C

- Commit `6c86e412f057cc93972e852889ee10b2cbf4906a` passes the binding into the project root and renders the existing conversation slot only when the binding is `ready`.
- `idle`, `creating`, `awaiting-list`, and all six error states keep sidebar/details rendering but make the conversation/composer occupant unreachable; error state reuses `.conversation-state.conversation-error` and the unique error mapping without new controls, style, or copy.
- A new public-seam test proves a new Host generation re-reads the persisted project Session, opens it once, and does not issue a second create.
- Main-thread incremental diff review found no Slice C scope expansion.

## Document conflict for independent review

- `docs/adr/0012-harness-core-is-immutable.md` says Issues after #3 do not add Client service items, while current GitHub Issue #1 and Issue #17 explicitly require adding public `connection` to `src/client/index.tsx#inject`.
- The current parent Issue labels its body the unique latest specification. The two-axis review must report the ADR conflict separately from Spec compliance; the Issue implementation must not silently broaden its scope to rewrite unrelated architecture documents.

## Dependency audit boundary

- Issue #17 adds no dependency. Existing root and runtime manifests pin exact versions, including DeepSeek Harness rc.8 and pnpm 11.7.0.
- Focused development tests reuse the existing local dependency tree when available. Final product lifecycle uses the repository CLI and frozen runtime manifests required by the parent specification.
- `check:manifest-lock`, `security:advisories` and `security:build-scripts` remain final acceptance gates; an executor may not change their inputs or thresholds.

## Two-axis code review

### Standards findings

1. High, hard: ADR 0012 fixes the Issue #3 Client inject set at five services, while Issue #17 adds `connection`.
2. Medium, hard: `session-binding-errors.ts` contains the required literal `10 秒` while the runtime timeout is configured as `10000` milliseconds.
3. Medium, hard: focused tests do not cover every create failure shape or every startup rollback branch that disposes the new binding.
4. Low, judgment: the sidebar repeats Workbench Session filtering instead of reusing `workbenchSessions(state)`.
5. Low, judgment: `sessionBinding.dispose()` appears in the existing explicit startup rollback sequence at multiple failure points.

### Standards adjudication

- Finding 1 is a real documentation conflict, but GitHub Issue #1 declares itself the unique latest parent specification and Issue #17 explicitly requires `connection`. Updating ADR 0012 is outside Issue #17, so the implementation follows the newer product specification without editing unrelated architecture documentation.
- Finding 2 does not represent two structured runtime sources. `config/product-agent.json` uniquely owns milliseconds; `session-binding-errors.ts` uniquely owns the exact user-facing error sentence required by Issue #17. No change is required.
- Finding 3 is accepted for focused tests of synchronous create throw, rejected create Promise, failed RPC envelope, and public plugin rollback disposal of the binding.
- Finding 4 is accepted as a one-call reuse of `workbenchSessions(state)`.
- Finding 5 is rejected because centralizing all existing startup rollbacks is a refactor outside the Session-binding behavior boundary.

### Spec findings

1. High, code defect: after `sessions.open(projectId)`, `openIssued` remains true for the Host generation. If the current Session later becomes a non-project Session, the binding remains ready and the conversation slot can remain mounted for the wrong Session.
2. Medium, test gap: create rejection and a failed RPC envelope are not proven through the existing middle-column error state and the `SessionFace.prompt` submission boundary.
3. Acceptance gap: real rc.8 lifecycle, browser streaming/reload/reconnect/restart, broken Preset, and independent `1440x1000` visual evidence have not run yet.

### Spec repair boundary

- The binding must deduplicate only an outstanding or already-requested target. After the list confirms that target as current, the binding must be able to react to a later non-project current Session by opening the deterministic project target once again.
- Focused tests must prove the current-project to non-project transition requests exactly one corrective open and keeps prompt unreachable until the project Session is current again.
- Focused composition tests must prove rejected create and failed RPC envelope render the existing error region and never invoke `SessionFace.prompt`.
- Final lifecycle and visual evidence remain Phase 8 work and must not be simulated with fixtures.

## Accepted Phase 7 repair

- Commit `b48bc5b3d14dee510daa334480a405b8a9249deb` replaces generation-wide `openIssued` with `pendingOpenSessionId` that only deduplicates an unconfirmed open target.
- The binding publishes `ready` only when `sessions.list.current` resolves to a non-subagent `harness-comfyui` Session. When current later becomes a non-project Session, the binding leaves ready, requests one deterministic corrective open, ignores repeated identical list notifications, and returns to ready only after list confirmation.
- Focused tests cover synchronous create throw, rejected create Promise, failed RPC envelope, middle-column error rendering, unreachable conversation/composer and unreachable `SessionFace.prompt`.
- A public Client apply rollback test proves a later slot registration failure aborts the binding's pending create request.
- The sidebar now calls `workbenchSessions(state)` before applying its query filter, so eligibility has one production source.
- Main-thread review of `6c86e41...b48bc5b` accepted all four changed files and found no new copy, style, control, dependency, version, ADR, or release change.

## Final acceptance environment diagnosis

- The local NVM path `/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm` points to an installed pnpm package whose actual version is `10.32.1`. Running `pnpm --version` inside the repository can display `11.7.0` because pnpm automatically selects the repository `packageManager` version.
- Deploy fixtures run from isolated directories without the repository `package.json`; preflight therefore observed the actual ambient `10.32.1` and rejected it before any Issue #17 code or upgrade lifecycle executed.
- A temporary planning-owned wrapper invokes an already present local pnpm `11.7.0` package directly with package-manager auto-switching disabled. The wrapper performed no download, dependency installation, or global configuration change.
- With that exact environment, all four artifact upgrade/rollback scenarios passed. The remaining Deploy suite passed `160` tests with `1` intentional skip.
- The first cold Composition profile run exceeded its `90` second test timeout. The same focused scenario exited naturally and passed in `83.226` seconds; the two other composition files then passed `3/3` without rerunning the profile test.

## Accepted Issue #17 E2E update

- The original Issue #3 browser test asserted an empty Session list. The real Issue #17 artifact correctly created one `harness-comfyui` Session, so the old assertion failed after `4/5` E2E tests had passed.
- Commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273` changes only `tests/e2e/workbench-browser.test.ts`.
- The updated scenario polls the public Harness Session list for one non-subagent `harness-comfyui` current Session, preserves the `1440x1000` screenshot and console/runtime assertions, and opens a second real browser connection against the same Host to prove the complete Session ID set and current ID remain unchanged.
- The focused real-browser E2E passed once in `82.32` seconds. Main-thread diff review found no production, helper, dependency, copy, style, version, or release change.

## Final browser and lifecycle acceptance

- The accepted artifact is `harness-comfyui-0.1.3.tgz`, `802504` bytes, SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`, built from `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`.
- A real `1440×1000` browser used the public Harness Session and Workspace paths. The real Agent produced twelve distinct streaming text snapshots and a final reply; both the selected Session and the right results column reported zero ComfyUI runs.
- Browser refresh, Host reconnect and product restart preserved the existing project Session without a binding create. A mixed real Host list with two project Sessions plus `standard` and `minimal` rendered only the two project Sessions. The public rc.8 API cannot directly construct an `origin=subagent` Session, so the formal runtime did not receive a fixture row; the focused public-list test remains the evidence for that branch.
- Removing the release-local user Preset through public `agentPreset.remove` while the Host held an empty isolated Session state produced the exact create-failed Workbench message and no composer, Session row or fallback Preset. Every moved runtime state was restored from an exact backup before final stop.
- An independent no-regression Reviewer compared the static prototype, the accepted Issue #3 product baseline and the Issue #17 browser screenshots. All PRD 16 visual items passed; the first reviewer's reported controls and copy differences were already present in the closed parent Issue baseline or came from real Session data.
- The acceptance Host is stopped, port 4173 is free, the release-local credential copy is deleted, and the Issue worktree has no tracked or untracked Git changes.

## Final security-boundary repair

- Main CI run `32664651582` passed every preinstall gate and then stopped before qualification because `scripts/security/check-harness-boundary.mjs` did not yet list the public rc.8 `@deepseek-ai/dsh-client-connection/client` type surface required by Issue #17.
- Repair commit `1a24166b8bdfeff296f1821aee3296b6a51c1ab5` adds only that specifier as `type-only`. A positive fixture accepts `ConnectionHandle` through `import type`; a negative fixture proves a value import remains rejected.
- Focused boundary tests passed `41/41`; the direct boundary command and diff check passed. The repair does not change product runtime behavior, dependencies, copy, layout, Session logic or release version.

## Final Client bundle expectation repair

- Main CI run `32664906733` passed the repaired boundary and reached coverage integration tests. It stopped at `tests/integration/client-bundle.test.ts` because the bundled plugin expectation still listed the Issue #3 five-service inject array.
- Repair commit `933f4f4eeb193046ce46ebe979793a319336bdb0` changes only that assertion to include the Issue #17 `connection` service after `inputTriggers`, matching the production export and the already accepted unit assertion.
- The local shared dependency/build tree stopped earlier at a stale `conversation` slot fixture and did not reach the changed line. The clean CI build remains the verification layer for this assertion; no unrelated local test or source change was added.
