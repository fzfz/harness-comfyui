# Issue #16 findings

## Initial repository state

- Primary worktree: `/Volumes/4Tdisk/work/AI2/harness-comfyui`
- Local `main`: `a149cd5cd9809a598235dbcc6f817130e36285c1`
- The primary `main` worktree contains pre-existing tracked and untracked user changes. The Issue #16 branch must start from the committed local `main` revision and must not include those changes.
- Existing independent worktree: `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-3`; Issue #16 must use a different path and branch.
- Repository issue operations use `gh`; domain vocabulary comes from `CONTEXT.md` and relevant ADRs.

## Memory-derived constraints to verify live

- Parent Issue #1 is the governing specification.
- Each executable Issue uses an independent worktree and genuine vertical red-green slices.
- Local merge and Issue closure happen only after exact spec and acceptance review.
- The primary worktree's unrelated changes must remain untouched.

## Live issue evidence

- Issue #16 is open and labeled `ready-for-agent`; it has no comments that amend its body.
- Issue #2 is closed, so Issue #16's declared blocker is satisfied.
- Issue #1 requires Issue #16 to run in its own worktree, use the Issue #2 CLI and a worktree-local `runtime/production/` installation, execute `status`, `health`, `logs`, browser acceptance, and final `stop`, and avoid a second lifecycle implementation.
- Issue #1 limits Issue #16 to the public Agent Preset, Agent-plane Cordis, scoped Tool registry, release-local Skill filesystem, and `dsh-tool-skill` seams.
- Issue #16 requires one structured source `config/product-agent.json`, one project Preset composition, one Agent plugin export, removal of Host-root project Tool registration, release-local Preset/Skill installation, fixed runtime environment, roster validation, tarball-only runtime proof, and no new dependency.
- `docs/adr/0012-harness-core-is-immutable.md` and the two Issue #16 product documents are user-owned uncommitted files in the primary worktree. They may be read as supporting evidence but must not enter the Issue #16 branch.
- The supporting PRD confirms that `package/skills` may be absent from the tarball at this stage but must be materialized as a real directory during install/upgrade, and it fixes the Agent composition to persona, one filesystem provider, `dsh-tool-skill`, and the project Agent plugin only.
- The supporting runtime research assigns explicit Session creation/resume binding to Issue #17. Issue #16 may test `sessions.create()` for Preset acceptance but must not implement the Client session-binding behavior owned by Issue #17.

## Test seams and vertical slices

### Pre-agreed public seams

1. Product CLI and Harness `agentPreset.list` output for Preset discovery, trust, default selection, health, and specific failures.
2. Public `sessions.create()` response plus Session header persistence for resolved Preset identity.
3. Public model-facing Tool schema lists at Host-global, project Agent, `standard`, `minimal`, and test Preset scopes.
4. Public Skill catalog and native `/` menu at project and non-project Preset scopes.
5. Release Artifact plus product CLI lifecycle in a tarball-only installation with the source checkout unavailable.
6. Real browser Preset roster and native `/` menu isolation, reviewed by a non-implementer.

### Small vertical slices for one Luna/max executor

1. Agent-scope composition: structured constants, Preset files, `./agent` export/build, restrict-before-register, removal of Host-root registration, and public Tool-scope tests.
2. Release-local installation: artifact contents, Preset copy, exact Skill directory materialization and rejection rules, and focused install/upgrade tests.
3. Runtime lifecycle contract: profile patch, release-local `DSH_HOME`, fixed Skill root and native Tool mode, roster validation and named failure branches across preflight/status/health/restart/rollback.
4. End-to-end acceptance: Session resolved ID/header, Tool/Skill isolation, tarball-only Host/Client lifecycle, focused browser fixture needed for independent review, full typecheck and full suite.

## Review findings

### Standards sources prepared

- Repository `AGENTS.md` and `docs/agents/domain.md` provide language, scope, test, structured-source, and domain-vocabulary rules.
- `docs/v0.1/PRDS/01-engineering-baseline.md` requires reuse of the existing build, CLI, artifact, configuration, and quality entry points; Issue #16 cannot create a second lifecycle or build path.
- `package.json` fixes the accepted checks and exact rc.8 dependency positions. Issue #16 must not add dependencies or alter either lockfile.
- Existing `scripts/security/check-harness-boundary.mjs` enforces one direct `ctx.tools.register()` site and one `registerProjectTools()` caller. Issue #16 must migrate only the caller boundary from Host plugin to Agent plugin.

### Slice 1 review

- Commit `8ccd907` contains exactly the Agent composition, Agent bundle/export, Host-root registry removal, boundary update, and focused tests assigned to slice 1.
- The exact Preset name, description, order, persona, Skill provider isolation config, `dsh-tool-skill`, and `harness-comfyui/agent` rows match Issue #16.
- `src/agent/plugin.ts` applies `ctx.tools.restrict({ allow: [] })` before invoking the unique registry and disposes project Tools before the restriction; failure during registration releases the restriction.
- The Host plugin no longer imports or calls the project Tool registry. The static boundary still permits exactly one direct `ctx.tools.register()` site and moves the unique registry caller to the Agent plugin.
- `config/product-agent.json` exists but slice 1 does not yet make every build/install/runtime consumer derive or validate its values against that source. Final acceptance must reject drift between this structured contract and package/build/lifecycle constants.
- No lockfile, dependency version, supporting user-owned document, Issue #3 file, lifecycle behavior, Session binding, UI, or business Tool/Skill entered the commit.

### Slice 2A review

- Commit `6339dd0` reads and validates the packed `config/product-agent.json`, rechecks the extracted copy against preflight, materializes `package/skills`, and copies the exact Preset directory into the release-local Harness user root.
- Install tests cover missing/real Skill roots, Preset and Skill symlink/non-directory failures, exact release paths, and absence of default Skill roots. The changes do not modify dependencies, lockfiles, product PRDs, Client Session binding, or business Tool/Skill content.
- `scripts/deploy/preflight.mjs` changed only to expose the structured product-Agent contract required by install; it does not implement runtime roster or Session behavior.
- Finding: the new install failure cleanup calls `rmdir(releasesRoot)`. That directory may have existed before this install attempt, and Issue #16 does not authorize removing a pre-existing installation directory. The executor must remove this cleanup behavior and assert only that the candidate release/staging directory is absent.
- Repair commit `ada8bd3` removes that cleanup and proves the candidate release and incoming staging are absent while a pre-existing empty `releases/` directory remains. Slice 2A is accepted.
- `upgrade.mjs` calls the same `stageProductRelease()` seam, so the release-local materialization code runs for upgrades. Existing upgrade tests do not assert the new Preset and Skill paths; an explicit full upgrade assertion is still required by the repository's branch-coverage rule.
- Commit `447880d` adds the missing real upgrade CLI assertions and sensitivity evidence without adding a second materialization path. It proves the candidate release receives the Preset and Skill root, default Skill roots remain absent, and the old release remains unchanged. Slice 2B is accepted.

### Slice 3A review

- Commit `9a0fb9d` changes the product Profile patch only to the exact public `agent-presets` row required by Issue #16 and updates the boundary gate to reject drift or a second root declaration.
- The shared start environment reads `skillRelativeRoot` from the active release's packed `config/product-agent.json`, writes release-local `DSH_HOME` and Skill directory, and sets `DSH_TOOLS_MODE=native` after the ambient environment spread. Start, restart, upgrade candidate, and rollback tests each observe the correct release values.
- The commit does not add roster, status/health, Session, Client, business Tool/Skill, dependency, or lockfile behavior. Slice 3A is accepted.
- Final single-source audit must make the boundary gate validate the Profile default and package Agent export against `config/product-agent.json`; the current expected patch literal still repeats the Preset ID in executable gate code.

### Slice 3B blocker evidence

- The public browser-facing `AgentPresetEntry` contains `id`, `trust`, `isDefault`, optional display metadata, and optional `broken`; it intentionally omits Host paths.
- The public Host API implements `agentPreset.list` only through the running Host api-proxy. `status` must also report a stopped installation, and preflight currently rejects an occupied product port and starts no product process.
- The public `@deepseek-ai/dsh-agent-presets` package exports `AgentPresets`, `discoverPresets`, and the internal-domain `AgentPreset` type with a path, but the Release Artifact preflight runs before the per-release Harness runtime is installed and the product package does not carry this package as a runtime dependency.
- A deterministic local file check can prove the installed Preset path separately from a running public roster, but it cannot make preflight receive a runtime roster. Importing from the future runtime, starting an ephemeral Host, or adding an offline roster surface would change Issue #2 lifecycle/preflight architecture or add an interface not listed by Issue #16.
- No 3B changes were committed; the branch remains clean at `9a0fb9d` while this contract conflict receives independent review.
- Independent Reviewer verdict: strict implementation is impossible for preflight and stopped status; running status and health can call the Host API. The minimum spec change would explicitly authorize public filesystem discovery/static release facts for preflight and stopped status while keeping `agentPreset.list` authoritative when the Host runs.

### Slice 3B0 review

- Commit `4675fb9` adds an artifact validator driven by `config/product-agent.json` and a release-local pre-spawn validator. It checks the package export/files declaration, Agent bundle, packaged and installed Preset files, Profile patch, and real Skill directory before Host spawn.
- The real start CLI test proves a missing release Skill root returns nonzero without a Host process, environment log, or process state. Helper tests cover missing/symlink/non-directory Preset, bundle, and Skill branches; fixture-only changes supply the new required Agent artifacts.
- Finding: `validateAgentPresetProfilePatch()` accepts extra rows or keys after the required four lines, so a tampered artifact can add a second root while still passing preflight. The validator must require the entire normalized Profile patch to equal the one allowed `agent-presets` row.
- Finding: `scripts/security/check-harness-boundary.mjs` still embeds `default: harness-comfyui` as an executable constant. It must construct the expected Profile patch from `config/product-agent.json` and reject a manifest/export/Profile mismatch against that structured source.
- Repair commit `35448c0` makes preflight require the complete Profile patch document and makes the security gate derive the Preset ID and Agent export from `config/product-agent.json`; both findings are closed. Slice 3B0 is accepted.

### Slice 3C review

- Commit `29961fe` adds a single public `POST /api/agentPreset.list` request to running `status` and `health`; it validates exactly one project Preset, `trust: user`, `isDefault: true`, and an absent `broken` value.
- The release-local installed path remains proven by `validateProductAgentRelease()`; the roster result reports only a path derived from the structured install root and does not invent a second public path API.
- Focused tests cover missing, duplicate, wrong-trust, non-default, broken, malformed-JSON, and HTTP-failure rosters. Request-log assertions prove these checks do not create or inspect a Session.
- Stopped status returns its Issue #2 result without any Host request. Preflight continues to validate the static artifact only. This preserves lifecycle semantics but does not resolve the ticket's impossible preflight/stopped-roster wording.
- Main-agent rerun passed all 50 tests in the four affected deploy test files; the commit is accepted.

### Slice 4A public Session seam audit

- rc.8 public `sessions.create({ cwd, agentPreset })` returns `{ sessionId, agentPreset? }`; the returned `agentPreset` is the resolved Preset ID.
- rc.8 public `sessions.list` projects `SessionSummary.agentPreset` and `cwd` from the Session header, so the real Host acceptance path can verify persisted identity without reading private storage.
- A required composition mount failure is a public business result with code `agent-preset-invalid` and detail `{ agentPreset, reason }`; an unknown ID is `agent-preset-not-found`. These results must remain errors and cannot trigger `standard` fallback.
- The repository does not declare `@deepseek-ai/dsh-host-apiproxy`, and the public browser client bundle references `window` in Node. Adding a dependency is forbidden; a fake API client would not prove the acceptance criterion. Session proof is deferred to the real installed Host/Client and public `/api` protocol.

### Real artifact gate blocker

- The branch changes `package.json#files` only for Issue #16 Agent artifacts. `README.md`, the pack implementation, and tar-entry validator are unchanged from `a149cd5`.
- A real pack at `29961fe` produces `.release/quality/harness-comfyui-0.1.0-rc.7.tgz` with SHA-256 `cd801d95893d3c5cdeea62c57f7d57ae71c9a6bab7faadcc7af64c819e5a9b99`.
- npm/pnpm automatically includes tracked `README.md`, while `validatePackage()` constructs the exact expected set from `package.json`, `package.json#files`, and no npm-mandatory metadata exceptions. The gate fails on unexpected `package/README.md`.
- Adding `README.md` to the manifest or changing the generic validator would repair a pre-existing release-system defect, not implement Issue #16. The branch must not make that out-of-scope change without an explicit specification amendment.

### Slice 4B1 review

- The first real installed Host failed before loading the product because `HARNESS_COMFYUI_SKILL_DIR` was absent from the product's strict environment declaration. This directly contradicted Issue #16's fixed start environment and was an in-scope runtime regression.
- Commit `f6fe10e` represents process-only variables in the existing structured environment map as an exact `{ "passThrough": true }` object. The loader accepts only this one-key shape and does not assign it into the Profile object.
- The general unknown-prefix rejection remains unchanged; `HARNESS_COMFYUI_UNLISTED` still raises `environment override is not allowed`.
- Main-agent rerun passed all 18 tests in `tests/unit/config-loader.test.ts` and `tests/build-artifacts.test.ts`; the worktree returned clean and the repair is accepted.

### Slice 4B2 review

- The real `session.create` request returned `agent-preset-invalid` with a reason naming `project-agent` and `cannot get property "tools" without inject`; a following public `session.list` returned no items.
- Main-agent public-API reproduction confirmed the same failure from the installed release, so the finding is runtime evidence rather than a fixture assumption.
- Commit `0021b7e` changes only the Agent plugin's public Cordis metadata from an empty injection list to `['tools']`, its generated bundle, and the exact metadata assertion. Tool restrictions, registry ownership, empty Tool definitions, and composition rows are unchanged.
- Main-agent rerun passed all 37 tests in the Agent unit, Harness boundary, and build-artifact files; the repair is accepted.

### Real Session and Skill isolation evidence

- The fresh `0021b7e` tarball installation completed the required product CLI lifecycle twice around restart. The real roster contains one project Preset with `trust: user`, `isDefault: true`, and no `broken` field.
- Public `session.create` returned `agentPreset: harness-comfyui`; public `session.list` uses `sessionId` and preserved the same `cwd` and `agentPreset` from the Session header. Main-agent calls independently confirmed both results.
- A runtime-only `issue16-isolation-probe` Skill placed only under the active release `package/skills` appears in the project Session's public `skill.list` and in neither standard nor minimal. No default Skill root received the fixture.
- With a model-invocable project Skill present, the project Session's public `request/header` still has no `tools` field. The standard Session exposes native `skill` plus its standard tools, and minimal exposes only `bash` and `str_replace_editor`.
- Moving `project-agent` before `tool-skill` did not change the project Tool view after a full stable-CLI restart. The installed composition was restored to the tarball bytes and health passed afterward.
- rc.8's public Tools README says allow restrictions mask global Tools and scope-local Tools merge afterward; the public `dsh-tool-skill` README says its registration works inside an Agent composition. The observed runtime disagrees with the expected end capability, so no product change is accepted until an independent contract review identifies a legal seam or confirms a specification conflict.

### Final Tool-contract verdict

- Independent review confirmed that rc.8 registers all four Agent composition rows into the same standing PRESET layer. Session resolution applies the agent layer before the preset and global ancestor layers, and `restrict({ allow: [] })` removes all Tool contributions inherited from the PRESET layer.
- The restriction therefore removes the native `skill` Tool registered by `dsh-tool-skill` and would also remove future project Tools registered through `registerProjectTools()` in the same Agent Preset. Swapping composition row order cannot change the scope layer.
- Issue #1 and Issue #16 simultaneously require the fixed four-row composition, exact `allow: []`, model-facing native `skill`, and future same-registry project Tool visibility. No code change can satisfy all four requirements in rc.8.
- The minimum spec change is to remove the exact restriction requirement from both Issue #1 and Issue #16, retain one unique project registry and an empty Host-global project registry, and use Preset sibling scope as the project/non-project isolation boundary.

### Final Standards review

- Commit `cff8382` makes the boundary security gate read and validate the Agent artifact relative root, install root, and Skill root from `config/product-agent.json`; its tests read the same JSON and cover drift.
- The Agent failure-path test uses the real registry mock, preserves the originating registration error, proves restriction disposal exactly once, and proves no project Tool registration survives.
- Both prior hard Standards findings are closed. The remaining non-blocking judgment smell is the required but unconsumed `sessionListConvergenceTimeoutMs` value.

### Final Spec review and acceptance verdict

- The exact Tool-schema and project Tool isolation criteria fail because the specified restriction masks the native `skill` Tool and future same-registry project Tools.
- The preflight and stopped-status roster criteria fail because rc.8 exposes `agentPreset.list` only through a running Host; the public roster also omits the Preset filesystem path.
- The tarball quality gate fails on pre-existing automatic `package/README.md` inclusion, and the browser proof reached the default project Preset but not the native slash-menu isolation criterion.
- Issue #16's required updates to Issue #4 and Issue #12 were not published because final acceptance failed and no Issue/spec amendment was authorized.
- The branch contains no scope expansion and no lockfile change. Final acceptance must remain blocked, so Issue #16 cannot be closed, the branch cannot be merged into local `main`, and the worktree cannot be deleted.

### Final validation and cleanup

- Aggregate Vitest evidence is 45 files with 473 passing tests and one existing skip. The six files that initially selected pnpm 10.32.1 inside temporary HOME fixtures passed 53/53 when rerun with the existing pinned pnpm 11.7.0 binary.
- The prototype's native Node suite passed 27/27 tests. Typecheck passed, `git diff --check` passed, and the Issue worktree is clean at `cff83823d080aea2ee5a8ff975fe23a5dacbef36`.
- The real tarball lifecycle completed install, preflight, start, status, health, logs, restart, status, and health. Public Session creation and listing preserved the configured Agent Preset ID, and the release-local Skill catalog was isolated from standard and minimal Sessions.
- The diagnostic Host is stopped, port 4173 is free, and the four deleted test-fixture Hosts were stopped. The unrelated Issue #4 Host remains running and untouched.

### 2026-08-23 specification amendment

- Live Issue #1 and Issue #16 now state that the Agent plugin directly registers project Tools in the standing Preset scope and must not call `ctx.tools.restrict()`.
- The amended Tool acceptance requires Host-global schemas `[]`, current project child Agent schemas `["skill"]`, and project Tool invisibility from `standard`, `minimal`, and sibling test Presets.
- The amended lifecycle acceptance explicitly assigns static tarball evidence to preflight, release-local/process/port evidence to stopped status, and public roster evidence only to running status/health after managed Host checks.
- `agentPresetInstallation` is the release-relative path evidence. `agentPresetRoster` contains only public online roster fields and cannot contain a path.
- The prior Tool and offline-roster contradiction findings are superseded by this amendment. The pre-existing package README gate and final browser proof must still be re-evaluated after the revised implementation commits.

### Resumed Tool and health slices

- `e0d6aee` removes the restriction from the Agent plugin and generated Agent bundle. The Agent effect directly owns only the disposer returned by the unique project Tool registry; registry failures propagate unchanged.
- `ff20bdb` makes the Harness boundary reject a generated Agent artifact that still contains the removed exact restriction. A fresh host type build produces no stale restriction in `lib/types/src/agent`.
- `d45a3bd` calls `validateRunningAgentPresetRoster()` only after the health process check passes. Public roster evidence no longer contains `releaseRelativeRoot`.
- `agentPresetInstallation` is derived from the validated product Agent contract and required artifact entries; its exact success keys are `status`, `releaseRelativeRoot`, `requiredFiles`, and `skillRelativeRoot`.
- Main-agent fixed-point inspection found no lockfile or dependency change in these commits. Public composition and sibling Tool scope remain pending until the current test slice returns.

### Resumed Tool composition acceptance

- Commit `1642554` proves rc.8 Tool visibility through public Session request headers rather than a simulated row merge. A Host-level observer records no Tool schemas, a project-only probe is registered through the same `registerProjectTools()` caller, and a sibling test Preset receives the same non-project Tool set as `standard`.
- The exact observations are Host `[]`, project with probe `["issue16.project-scope-probe", "skill"]`, restored project `["skill"]`, minimal `["bash", "str_replace_editor"]`, and no project probe in standard or sibling schemas.
- The test-only plugin and observer exist only in composition fixtures. The formal tarball produced from the same clean commit contains none of the probe, observer, or fixture strings.
- The current artifact manifest identifies commit `1642554d4d351b66c64f0278d137b9a2ffd1798b`, byte length `765773`, and SHA-256 `1dad895e55b49b1df97d0655ee3e20cb6f7c61fc6bf0667fedfe0e58280d0846`.
- Package validation remains blocked by the unchanged automatic `package/README.md` entry. This is not an Issue #16 implementation change and must be treated explicitly at final acceptance.

### Listener ownership review and repair

- The prior process gate proved the recorded PID identity and separately proved that the configured port accepted TCP connections. It did not prove that the listening socket belonged to the recorded managed PID.
- A valid managed process can remain alive after closing its listener while an unrelated HTTP server binds the same port. The old status and health paths would send `agentPreset.list` to that unrelated process.
- Commit `3eb73bd` checks the listening socket PID before every running roster request and in shared readiness. The check uses fixed `lsof` arguments with `shell: false` through the existing external-command seam and fails closed when ownership cannot be proven.
- New status and health tests preserve the managed process identity, replace only its listener, and prove that status is not running, health process readiness fails, and the foreign server receives zero roster requests.
- Main-agent validation passed the six affected lifecycle files with 59/59 tests under the existing pinned pnpm 11.7.0.

### External Issue constraint delivery

- Live Issues #4 and #12 now state that project Skills remain in the current release's `package/skills`, only the `harness-comfyui` project Preset custom Skill root may read them, and the installer cannot copy them to default Skill roots.
- An independent semantic Reviewer passed both paragraphs and confirmed that neither edit adds a Skill deliverable or changes the Ticket product scope, public interfaces, acceptance, or dependencies.

### Remaining external acceptance gates

- The Browser control URL policy blocks independent interaction with `http://127.0.0.1:4173/` and explicitly prohibits alternate browser-control workarounds. Public API evidence cannot replace the required native `/` menu browser PASS.
- The unchanged package validator still rejects npm's automatic `package/README.md` entry. Issue #16 does not authorize that release-baseline repair.
- The first runtime cycle proved release-local operation but did not physically remove the source checkout. A final clean artifact, if otherwise useful, must use an external installation and an explicit source-checkout absence proof.

### Final external tarball-only runtime

- The final artifact manifest identifies commit `3eb73bd9c51ab39ecf41c89f482dc77dc2ff3c0f`, byte length `769237`, and SHA-256 `4625e5bb048a6943f8ab0d931fbdf277a086083537e6d81d265c49eb771f55a9`.
- The acceptance installation and its discovery fixtures lived under `/private/tmp`; the formal tarball was copied outside the source worktree before installation.
- The source worktree's original path did not exist from `2026-08-23T04:23:43Z` until the external Host stopped and restore verification completed at `2026-08-23T04:29:14Z`.
- External release PIDs 29043 and 29514 each owned the configured port, and health returned exact separate installation and public roster evidence before and after restart.
- Project Session creation used the external `hostDescription.cwd`, retained `harness-comfyui` in public Session listing, exposed only the native `skill` Tool, and discovered only the external release-local acceptance Skill. Standard, minimal, and sibling Sessions did not discover that Skill.
- Unknown and invalid Presets returned public errors without creating a Session or falling back to `standard`. The public API does not provide a state that changes the resolved ID after accepting the requested valid ID, so no fabricated mismatch result is claimed.
- Stable CLI stop cleared both foreground processes, process state, and port 4173. The source worktree was restored clean, and the external evidence remains recoverable in Trash.

### Final acceptance verdict

- The final review found no remaining Issue #16 code defect and passed all eight implementation-span items.
- Acceptance item 5 remains incomplete because public `skill.list` proves catalog isolation but cannot replace an independent Browser check of the native `/` menu.
- Acceptance item 6 remains incomplete because rc.8 public APIs return exact requested/resolved IDs or explicit unknown/broken errors; they do not expose a state that changes a valid requested ID into a different resolved ID. The live checklist still requires that artificial negative.
- Acceptance item 8 remains incomplete because the Browser URL safety policy blocks localhost access and explicitly prohibits alternate browser-control workarounds.
- Parent unified package validation remains blocked by the unchanged automatic `package/README.md` entry.
- The branch cannot be merged, Issue #16 cannot be closed, and the worktree cannot be deleted until those gates receive authorized resolution and PASS evidence.
