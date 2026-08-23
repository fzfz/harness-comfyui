# Findings: DeepSeek Harness prototype tickets

## Requirements

- Use the user-selected `to-tickets` Skill.
- Read the full referenced Codex task before relying on it.
- Draft tracer-bullet vertical slices with explicit blockers.
- Use the repository's domain vocabulary and Issue tracker rules.
- Obtain user approval before creating GitHub Issues.
- Submit Issue prose to independent semantic review.
- Answer the production source of every “添加本次消息上下文” candidate and identify the responsible Ticket.
- Audit every Ticket for enough product, frontend, backend, interaction, persistence, and error detail for an Agent to implement without inventing behavior.
- Store missing product contracts as Ticket-specific PRDs in `docs/v0.1/PRDS/` and reference them from the corresponding Ticket bodies.
- Never accept prototype fixtures or hard-coded arrays as production data.
- No Ticket may add a user-decision blocker that the user was not explicitly asked to decide.
- GitHub Issue #3 must not remain blocked by the unapproved rc.7 AppFrame column-width exception.
- The Harness technical baseline must use the rc.8 packages already installed by Issue #2; all rc.7 assumptions require revalidation against the installed rc.8 package source.

## Research Findings

- The repository currently contains modified root `task_plan.md`, `findings.md`, and `progress.md`; this task uses an isolated `.planning/to-tickets-deepseek-harness/` directory.
- The repository Issue tracker is GitHub Issues through the `gh` CLI.
- The first referenced-task read failed before returning task contents because two request parameters exceeded the tool maxima.
- The referenced task contains two history pages. Its final design assigns Session, Skill discovery and selection, Tool Call/Tool Result traces, and stream handling to DeepSeek Harness.
- The current repository owns Generation Run persistence, ComfyUI Jobs API submission/status/cancellation, Workflow compilation, media storage, the conversation-side context extension, and result projection.
- The data-source repository is read-only for this project; it must not persist this project's runs or media.
- The user rejected a dedicated LoRA session, a project-owned Skill selector, base-model insertion into message context, persistent `generation.run.*` Session events, source authentication for this read-only local design, and Workflow revision race handling.
- The accepted UI includes a Session list, a streaming conversation area, current-turn and current-Session results, a Session media library, and a centered Workspace-wide media/task view with filters and pagination.
- GitHub Issue #1 is the only current Issue and is the likely parent specification; it already has `ready-for-agent`.
- Issue #1 has 334 lines and no comments. It is the approved parent specification and explicitly says it has no external blocker.
- Issue #1 separates Harness-native conversation identity from persistent generation identity: Session plus numeric `turn` plus `call_id` are Host-derived, while an actual Generation Tool Call creates `run_id` and returns only `{ run_id }`.
- The accepted runtime lifecycle is `created -> prepared -> submitting -> remote_pending -> remote_running -> downloading -> succeeded`, with explicit `failed`, `cancelling -> cancelled`, and terminal `submission_unknown` branches.
- The formal acceptance seam is a real current-repository Harness bundle composition using isolated test data, controlled Catalog and Source fixtures, a test Run Repository, and a Fake ComfyUI Jobs API.
- The release/delivery scope is part of Issue #1 but is separable from product capabilities: configuration, shared quality commands, CI gates, build-once artifact/release preview, and production activation/rollback each have independently observable outcomes.
- The source-code repository is `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ`, remote `fzfz/NoobAI-XL-FZ`, with committed main revision `0765bb55dd5f402e835d0a02b257c10116f5866f` as the implementation-document baseline. Its unrelated untracked XLSX export files are user-owned and excluded from evidence and changes.
- `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` is detached at released `v0.80.0`; it supplies the three migration Skills from committed release `799b7759029d70076791321e2b02bf53c651c98f` but is not a source-code implementation target.
- Existing fixed Catalog operation IDs at the source main revision are `querySemanticWorksForSkill`, `querySemanticCharactersForSkill`, `querySemanticStylesForSkill`, and `querySemanticPromptTermsForSkill`, with corresponding Tool names `query_semantic_works`, `query_semantic_characters`, `query_semantic_styles`, and `query_semantic_prompt_terms`.
- Independent review rejected the first 18-ticket draft because cross-repository ownership, credential/error/media single-source ownership, one blocker, release notes, and production artifact/health stage boundaries were not concrete enough.
- The user explicitly selected `(workspace_id, session_id, call_id) -> run_id` as the only Tool-execution idempotency mapping.
- The user rejected the 19-ticket draft because it treated architecture components as ticket purposes instead of delivering real-product outcomes derived from the accepted prototype design.
- The user clarified that the static prototype is a design source, not the implementation target or acceptance runtime. Every Ticket must be accepted in the current repository's real Harness product composition.
- The user further rejected abstract benefit statements such as “daily-use workbench”. Each product Ticket must name the exact prototype region, controls, actions and visible states that its stage implements in the real product; the three-column layout is now Ticket 02 because the user required a new foundation Ticket before product UI work.
- Browser inspection confirmed the prototype's product journeys: ordinary streamed chat; atomic message context; zero, one and multiple runs per chat turn; queued, running, downloading, failed and submission-unknown cards; Workspace task cancellation; Session and Workspace media libraries; and multi-output image, video and audio results.
- The prototype's 26 structural contract tests pass.
- The prototype contains one product-definition inconsistency: `prototype-scheme.md` and its contract tests exclude ComfyUI Instance from Message Context, but the current static Modal lets the user select the instance candidate and changes its footer to “将新增 1 项上下文”. The revised ticket proposal uses the scheme rule: instance selection is an Execution Route and does not enter the message snapshot.
- Every final Ticket must implement its corresponding prototype region in the real product with matching functionality, layout, visual styling, controls, interaction and visible states. Functions absent from the prototype must copy the applicable parent Issue #1 requirements into the Ticket's own execution boundary and acceptance checklist.
- The previous 13-ticket proposal included narrow-layout checks; the later user decision removed every mobile and narrow-layout requirement, leaving one desktop viewport for Session search and result-tab switching.
- The user required the plan author to complete the actual DeepSeek Harness research now, write the determinate results into Ticket 01, and require the Ticket executor to land those results before any UI Ticket starts; Ticket 01 must not delegate research to its executor.
- Read-only inspection identified DeepSeek Harness committed tree `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`; its checkout is dirty, so only committed package exports, type declarations and tests may support Ticket 01 research conclusions.
- The completed research fixes the project as one out-of-tree dual-face bundle loaded after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`, with root Host export, `./client` export, `dsh.bundle`, `dsh.client`, browser CJS lazy factory output and an isolated `comfyui-workbench` Harness profile.
- The corrected research fixes UI composition by retaining the upstream AppFrame root and ConversationRoot, then using priority -10 occupants for `sidebar`, `details`, `conversation.session.header`, `conversation.view` id `chat`, and `conversation.composer.bar`; product scope excludes mobile and prototype breakpoints.
- The corrected research fixes Message Context on a project Context resolver plus one public `SessionFace.prompt()` call; browser RPC remains on generated Typert remote contributions and `ctx.remote`; Generation Tool registration remains on `defineTool` and `ctx.tools.register`; durable generation truth remains the project Run Repository.
- The completed research fixes one Harness composition profile and four distinct product Configuration Profiles, their exact repository paths, override order, required configuration keys, exact dependency versions, dependency safety gates, test layers, package scripts and three GitHub Actions workflows.
- Registry metadata confirms every Harness package named by Ticket 01 is published at exact version `0.1.0-rc.7`; `@deepseek-ai/schemastery@3.18.1` is also published. Registry metadata confirms `@deepseek-ai/dsh@0.1.0-rc.7` has integrity `sha512-ZceDCJ8FAywih+USW/OMk9jEhunlvJBGEz4kqrhau23hPzbciOazZrywH0nBRsaalSeAJ1JGBmjtw4OSjToStw==` and declares no lifecycle scripts.
- Final review confirmed that replacing the public `root` would remove ConversationRoot's render authority for `conversation.input.overlay`. The fixed product decision therefore retains AppFrame and ConversationRoot, replaces the public `details` occupant for project results, and renders the native overlay inside the project `conversation.composer.bar` occupant.
- Committed CLI source and tests confirm the exact launcher forms `dsh plugin --profile comfyui-workbench add <package-spec>` and `dsh --profile comfyui-workbench --host <host> --port <port>`, with `DSH_HOME` selecting the profile root. Ticket 01 now assigns exact repository scripts and arguments for development, composition and release-smoke.
- The exact Client external list contains 11 module specifiers and is now inlined in Ticket 01. The repository runtime is fixed by `.node-version` at Node 22.19.0 while `engines.node` retains the supported Harness range.
- The parent specification defines Host Runtime Credential conditionally as any other production-only credential owned by a Host feature. The current 14 Tickets have no such consumer, so the required set is explicitly empty instead of adding an unused secret field. ComfyUI Instance Authorization remains Source-only process memory.
- The earlier foundation review did not evaluate the later root Workbench correction. Phase 11 replaces the priority-shadow UI assumptions while preserving the exact CLI, DSH_HOME routing, Client purity, dependency safety, build/pack order, artifact identity, Host lifecycle, Node runtime and `PluginStatus` decisions.
- The current repository already locks Node `^22.19.0 || >=24.0.0`, `pnpm@11.7.0`, `@deepseek-ai/cordis@4.0.1`, DSH `0.1.0-rc.7`, React `18.3.1`, TypeScript `6.0.3`, tsdown `0.22.2` and Vitest `4.1.8`, but it has no `.github/`, `config/`, `src/` or formal `tests/` tree.
- The accepted static prototype can specify visible layout, styling, controls, interaction order, and example states, but it cannot by itself define production data ownership, typed Host/Client operations, persistence, restart recovery, authorization isolation, error semantics, artifact promotion, or deployment rollback.
- The production Message Context modal must not import `prototype/generation-workbench/fixtures/workflow-fixtures.mjs` or reuse its arrays as runtime data. Controlled fixtures remain valid only inside deterministic tests.
- The repository currently has no `docs/v0.1/PRDS/` directory, and none of the 14 Ticket bodies references a Ticket-specific PRD.
- The prototype runtime clones `TURN_RUN_FIXTURES`, `RUN_ARTIFACT_FIXTURES`, `SESSION_MEDIA_FIXTURES`, `COMFYUI_ASYNC_TASK_FIXTURES`, and catalog candidate arrays into browser memory. Those values prove only the designed UI states; they provide no production read contract or persistence proof.
- ADR 0003 fixes base model as a Catalog Filter and ComfyUI Instance as an Execution Route; neither belongs to the immutable Message Context snapshot. The current modal implementation must therefore be corrected to keep these controls outside the selected-context count and serialized message references.
- ADR 0007 requires one canonical source OpenAPI schema with browser/Agent-safe Catalog Operations and Host-only Source Operations. Browser code may consume only the typed Catalog projection; private instance connection data and full Workflow bundles remain Host-only.
- The prototype modal declares candidate kinds for generation models, LoRAs, works, characters, styles, artist strings, ComfyUI instances, Workflow templates, and Saved Media. It omits a prompt-term navigation row even though Ticket 05 and parent Issue #1 require prompt terms.
- The prototype initializes base-model filters and all modal candidate cards from static arrays in `app.js`. The fixed source revision contains persistent repositories for base models, generation models, LoRAs, artist prompt strings, ComfyUI instances, and Workflow templates, plus semantic Catalog services for works, characters, styles, and prompt terms; the current persistence proves that real records exist but does not by itself provide the new canonical Catalog/Source CLI projection required by this product.
- Source-contract expansion is not owned by any `harness-comfyui` Ticket. The user must create a separate `NoobAI-XL-FZ` Issue from `docs/v0.1/source-data-catalog-implementation.md`; `harness-comfyui` Issues #4–#6 and #13 only consume the released CLI/contract and remain blocked until it exists.
- `prototype-scheme.md` already fixes the six new Catalog operation IDs and Tool names: `querySemanticBaseModelsForSkill`/`query_semantic_base_models`, `querySemanticGenerationModelsForSkill`/`query_semantic_generation_models`, `querySemanticLorasForSkill`/`query_semantic_loras`, `querySemanticArtistPromptStringsForSkill`/`query_semantic_artist_prompt_strings`, `querySemanticComfyuiInstancesForSkill`/`query_semantic_comfyui_instances`, and `querySemanticComfyuiTemplatesForSkill`/`query_semantic_comfyui_templates`. The four existing operation IDs and Tool names remain the work, character, style, and prompt-term operations.
- The current Ticket order contains an ownership conflict: Ticket 04 needs the Host-only instance connection and complete Workflow Template bundle before it can submit one image, while Ticket 05 currently claims implementation of the two Source Operations after Ticket 04. The PRD audit must move initial Source Operation delivery to Ticket 04 and make Ticket 05 validate/reuse them while completing the ten Catalog Operations.
- All 14 Tickets require a Ticket-specific PRD. The UI tickets lack production backend/persistence/error detail that the static prototype cannot provide; the engineering, release, and deployment tickets have no prototype interface and need explicit developer/operator product tasks and acceptance sequences.
- The user replaced the Message Context candidate list with a paginated, three-column, multi-row card grid. Each card has fixed width and height, displays the resource cover image when its safe Catalog projection contains one, and otherwise displays one shared placeholder. This affects the static prototype, Ticket 03, Ticket 05, PRD 03, PRD 05, Catalog item fields, keyboard interaction, responsive behavior, and deterministic tests.
- The final independent semantic review passed all 14 Ticket/PRD pairs after PRD 01 was aligned with the canonical development scripts and PRD 13 was aligned with the single `.release/quality/artifact.json` tarball identity. The review also passed the Ticket 03→04→05 data-source ownership order, the prompt-term and Execution Route corrections, the production no-fixture boundary, and the 3×2 fixed card-grid contract.

## Technical Decisions

### Phase 7 rc.8 findings

- The main worktree directly resolves `@deepseek-ai/dsh`, `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-ui-layout`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-conversation` and `@deepseek-ai/dsh-client-ui-input-trigger` from installed `0.1.0-rc.8` package directories. The matching committed upstream tag is `dsh-v0.1.0-rc.8` at `141eb6fef83422698aef7a981029e843e8161534`.
- rc.8 profile bundle patches are applied in order and a later bundle can override the Web App Loader row whose id is `ui-layout`. A disabled row is represented by `disabled: true`. `ui-layout` is an upstream bundled UI plugin, not Harness Core.
- rc.8 `SlotCore` owns the built-in `root` slot. A replacement root occupant can declare and render the standard `sidebar`, `conversation`, `details` and `shell.overlay` child slots. The project design therefore disables only the upstream `ui-layout` row, registers one project root, and retains `ui-conversation`, `ui-input-trigger` and `ui-skill` so the standard conversation projection and native `/` Skill menu remain mounted.
- rc.8 public `ILayout` exposes `toggleSidebar()`, `openDetails()` and `closeDetails()` but no column-width setter. The project root owns the desktop grid and implements those methods against the frozen project layout contract: `294px` sidebar open, `56px` sidebar collapsed, `432px` details open and `0px` details closed at the only accepted `1440×1000` desktop viewport. This release has no mobile, breakpoint or drag-resize scope.
- Disabling `ui-layout` also removes its theme presenter. rc.8 publicly exposes `ThemeRuntime.getTheme()`, `ThemeSnapshot` and the Cordis `theme/change` event. Ticket 02 therefore assigns a bounded project presenter that projects the active color scheme and token map and removes only its own DOM writes on disposal.
- GitHub Issue #3 no longer contains the unapproved AppFrame-width decision. Its only native prerequisite is completed Issue #2, so Issue #3 has no active blocker and carries `ready-for-agent`.
- The published Issue audit found no other hidden or unasked user-decision blocker. GitHub Issue #4 retains `needs-info` because the user explicitly placed Catalog CLI implementation and release in the source-data repository's own Issue and release process. Downstream source consumers retain that concrete released-contract prerequisite; it is not a new UI or Harness design decision.
- The repository package version `0.1.0-rc.7` identifies the current `harness-comfyui` artifact and is not the Harness runtime baseline. The remaining `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7` lifecycle allowlist entry belongs to the installed rc.8 upstream dependency closure and must not be rewritten as if it were a direct Harness baseline package.

| Decision | Rationale |
|----------|-----------|
| Keep draft and review local until approval | `to-tickets` requires a user quiz and approval before publication. |
| Use one fresh Reviewer only after the draft exists | The repository requires independent semantic acceptance for Issue prose. |
| Treat Issue #1 as the parent and leave it unchanged | The referenced task published that approved specification, and `to-tickets` forbids modifying the parent. |
| Use one foundation Ticket followed by 13 staged product slices | Ticket 01 lands and verifies the engineering decisions already researched by the plan author; Tickets 02–14 implement one exact prototype or release outcome in the real product and cross every technical layer required by that user or operator task. |
| Use `call_id` as the sole Tool-execution identity | Harness supplies `call_id`; the product maps it directly to `run_id` without creating another identity. |
| Use prototype user journeys as ticket boundaries | A vertical Ticket must end in a visible user or operator result and may cross Catalog, Host, persistence, transport, Client and tests to deliver that result. |
| Require UI and interaction fidelity per Ticket | Each Ticket includes its own prototype/parent consistency acceptance section instead of relying on one global statement. |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| The initial referenced-task read used invalid parameter sizes. | Retry once with accepted upper bounds. |
| The first independent semantic review returned FAIL. | Apply every P1/P2 correction and request a focused re-review of the revised draft. |
| The focused semantic re-review found a Catalog operation-set contradiction, missing Message Context registry ownership, and an undefined second Tool-execution identity. | Correct the operation sets and registry ownership, then use only Harness `call_id` mapped directly to `run_id`. |
| The user rejected the corrected 19-ticket draft as horizontally sliced. | Stop its semantic review, inspect the interactive prototype, and replace the draft with 13 prototype-anchored product slices. |
| One replacement patch targeted the same draft path with both delete and add operations. | Apply the delete and add as two separate patches. |
| One large product-purpose patch failed after an early hunk changed context needed by a later hunk. | Split the rewrite into Tickets 01–04, 05–08 and 09–13. |

## Resources

- Referenced Codex task: `01a01dbe-a3a0-7930-8333-1c037ae2b3f4`
- Repository root: `/Volumes/4Tdisk/work/AI2/harness-comfyui`
- Ticket Skill: `/Users/fzfz/.codex/skills/to-tickets/SKILL.md`
- Candidate parent Issue: `https://github.com/fzfz/harness-comfyui/issues/1`

## 2026-08-22 Agent Preset addendum findings

- The current profile has no project-owned Agent Preset. rc.8 Web App supplies `agent-presets.default: standard`, so current behavior depends on a mutable upstream/user default.
- rc.8 creates the real idle Agent during `session.create`; `dsh-host-apiproxy` resolves `agentPreset` and mounts the Preset in the Agent factory setup before publishing the Agent.
- `standard` mounts `dsh-skill-filesystem` and `dsh-tool-skill`, but also grants a broad coding Tool set. It is not the product's fixed capability allowlist.
- The existing `src/host/plugin.ts` calls `registerProjectTools()` at Host root scope. rc.8 therefore treats future project Tools as global registrations, not as Tools owned by a project Agent Preset.
- The public `ISessions` Client interface intentionally omits session creation. The public `ctx.connection.api.sessions.create()` interface accepts `agentPreset`, while the current concrete runtime create wrapper does not expose that field.
- Paused Issue #3 uses worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-3` and branch `codex/issue-3-three-column-chat`. It contains eight committed implementation commits plus uncommitted changes to `src/client/index.tsx`, `src/client/styles.css`, `tests/integration/client-bundle.test.ts`, `tests/unit/client-plugin.test.ts`, and new `src/client/workbench/results-panel.tsx`.
- The two addenda must use independent worktrees. Issue #16 owns project composition and scoped Tool registration before paused Issue #3 resumes. Issue #17 owns the small Client interface around explicit `agentPreset` creation and runtime-list convergence after Issue #3 completes; Issue #3 retains ownership of the visible three-column UI.
- rc.8 startup replaces `agent-presets.config.roots` with the `@deepseek-ai/dsh` shipped system root after Profile patches. The project therefore cannot add a release-local system root without modifying upstream files. Issue #16 uses the public per-release `DSH_HOME/.agent-presets` user root and explicitly rejects any system-trust forgery or upstream-package write.
- rc.8 accepts the syntax `ctx.tools.restrict({allow: []})`, but it does not satisfy this product contract. `dsh-tool-skill` and the project Agent plugin register in the same standing Preset layer; the real Session Agent is a child scope, so the restriction hides both native `skill` and future project Tools from that Agent. The rc.8 Web composition already leaves the global model-facing Tool layer empty; Issue #16 must omit the restriction and verify the real global and child-Agent schemas.
- npm tarballs do not retain an empty `skills/` directory. Issue #16 requires install/upgrade to materialize `<release>/package/skills` when no business Skill exists yet and to reject symlink/non-directory targets.
- The published dependency chain is `#2 → #16 → #3 → #17 → #4`. Issue #16 is a native sub-issue of #2; Issue #17 is a native sub-issue of #3.
