# Issue #16 implementation acceptance plan

## Goal

Accept only the implementation required by GitHub Issue #16 under parent Issue #1, merge the accepted branch into local `main`, close Issue #16, and remove the Issue #16 worktree.

## Scope controls

- The parent specification is GitHub Issue #1.
- The executable acceptance checklist is GitHub Issue #16.
- The main agent owns issue/spec review, worktree coordination, code review, acceptance, local merge, Issue closure, and worktree cleanup.
- A single Luna/max execution agent owns all implementation commits in the Issue #16 worktree.
- No change may expand Issue #16 beyond the parent specification or Issue #16 acceptance checklist.
- Existing uncommitted files in the primary `main` worktree are user-owned and must remain unchanged.

## Phases

| Phase | Status | Acceptance evidence |
|---|---|---|
| 1. Pin live Issue #1 and Issue #16 specifications | complete | Issue #1 and #16 bodies, Issue #16 `ready-for-agent`, closed blocker #2, current commit, repository instructions |
| 2. Define public test seams and vertical slices | complete | Six public seams and four small vertical slices derived from Issue #16 |
| 3. Create isolated branch and worktree | complete | `codex/issue-16-agent-preset` at `a149cd5`; `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-16` clean |
| 4. Delegate implementation to Luna/max executors | in_progress | Sixteen bounded commits through `3eb73bd`; the amended Tool scope, health evidence, and listener-ownership repair are implemented, while the final artifact/runtime cycle remains pending |
| 5. Review Standards and Spec axes | complete | Final review found no remaining #16 code defect; implementation span is 8/8 PASS, while browser, resolved-ID mismatch, and parent package validation remain acceptance blockers |
| 6. Repair findings through the same executor | complete | In-scope findings repaired through `cff8382`; spec contradictions were not changed in code |
| 7. Final acceptance | in_progress | Code, external source-absent tarball runtime, Tool/Skill scope, listener ownership, and dependent-Issue updates are complete; package validation and independent browser acceptance remain unresolved external gates |
| 8. Merge, close, and clean up | pending | Do not merge, close, or delete the worktree until Browser acceptance, the live resolved-ID mismatch clause, and parent package validation all pass |

## Errors encountered

| Error | Attempt | Resolution |
|---|---|---|
| `docs/adr/0012-harness-core-is-immutable.md` exists only as an untracked primary-worktree file and is absent from `a149cd5` | 1 | Treat live Issue #1/#16 public-interface text as the committed execution contract; allow read-only consultation of the user-owned ADR without adding it to the Issue #16 commit |
| Main-agent focused test rerun could not resolve packages after the executor removed its temporary worktree `node_modules` symlink | 1 | Do not reinterpret module resolution as a code failure or repeat the same command; accept the executor's recorded passing checks for slice 1 and require final checks from the fully prepared Issue installation |
| Executor slice 2 turn stayed running without a message boundary or filesystem changes | 1 | Interrupted the no-artifact turn after bounded waits; retry once by splitting release-local installation into a smaller install-only tracer bullet, then handle upgrade separately |
| Planning-file patch contained an empty file hunk | 1 | Removed the empty hunk and applied only the intended task-plan and progress updates |
| Issue #16 requires preflight/status/health to validate a public Agent Preset roster, but rc.8 exposes that roster through a running Host API and existing preflight requires an unused port without starting the product | 1 | Preserve the clean accepted commits; obtain an independent read-only review of the exact public rc.8 exports and ticket language before deciding whether a legal in-scope path exists |
| Real `pnpm pack` always includes tracked `README.md`, while the pre-existing package validator expects only `package.json#files` plus `package.json`; current package validation reports unexpected `package/README.md` | 1 | Treat this as a pre-existing artifact-gate blocker outside Issue #16; continue only read-only/diagnostic tarball runtime verification without changing manifest or validator, and do not accept the Issue while the quality gate fails |
| rc.8 resolves Preset Tool rows in one standing PRESET layer, so `ctx.tools.restrict({ allow: [] })` masks both native `skill` and future project Tools from the same registry | 1 | Preserve the exact implementation and record a Spec failure; do not remove the restriction or amend Issue #1/#16 without explicit authorization |
| The first aggregate Vitest run selected pnpm 10.32.1 inside temporary HOME fixtures instead of the repository-required pnpm 11.7.0 | 1 | Prepend the existing pinned pnpm 11.7.0 binary and rerun all six affected Vitest files; 53/53 tests passed |
| Issue #1/#16 were amended after the blocked verdict | 1 | Re-pin both live bodies, retain the clean branch/worktree, and resume with separate Tool-scope and health-evidence vertical slices rather than changing already accepted lifecycle behavior |
| The resumed executor initially returned without modifying its authorized slice | 1 | Clarify that the Luna/max executor owns worktree writes while only the main thread is review-only; retry the same bounded slice once |
| A partial Agent build left ignored `lib/types` artifacts containing the removed restriction | 1 | Add a generated-Agent boundary sensitivity gate, run the host type build, and verify all generated Agent artifacts are restriction-free |
| A main-thread `pnpm exec node` command auto-installed 633 packages into the Issue worktree even though dependency installation was not authorized | 1 | Stop using `pnpm exec`; verify no manifest or lockfile changed; move the exact new `node_modules` directory recoverably to `/Users/fzfz/.Trash/harness-comfyui-issue-16-node_modules-20260823-1056`; use only a temporary symlink to the primary checkout's existing dependencies for later checks |
| The current clean-commit tarball still fails the pre-existing package validator because npm automatically adds `package/README.md` | 2 | Keep the failure as an external quality-gate blocker; do not change the package manifest or validator under Issue #16; continue only the requested runtime/browser acceptance and reject final closure if the governing gate still requires this validator to pass |
| Final Standards review found that a live managed PID and a foreign listener could independently satisfy the old identity and port checks | 1 | Add real status/health counterexamples, bind listener ownership to the saved managed PID before roster RPC, reuse the ownership gate for readiness, and rerun the affected lifecycle matrix |
| Browser control refused to access or refresh `http://127.0.0.1:4173/` under its URL safety policy | 1 | Do not use CDP, another browser surface, or an alternate URL as a workaround; record independent browser acceptance as incomplete and continue only non-browser public API verification |
