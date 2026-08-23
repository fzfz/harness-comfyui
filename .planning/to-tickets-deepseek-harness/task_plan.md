# Task Plan: DeepSeek Harness prototype tickets

## Goal

Produce a reviewed, prototype-anchored vertical GitHub Issue breakdown for the referenced DeepSeek Harness image-generation workbench, then wait for the user's approval before publication.

## Next Step

Create two addendum Issues for the missing rc.8 Agent Preset and Workbench Session binding contracts, wire their native dependencies into parent Issue #1 and paused Issue #3, then verify the published bodies and graph.

## Current Phase

Phase 8

## Phases

### Phase 1: Gather authoritative context

- [x] Read the referenced Codex task.
- [x] Read repository Issue, triage, domain, ADR, and parent Issue sources.
- [x] Record the product boundary and defined domain nouns.
- **Status:** complete

### Phase 2: Draft tracer-bullet tickets

- [x] Reject the architecture-layered 19-ticket draft.
- [x] Inspect every major interactive path in the accepted static prototype.
- [x] Define one real-product user or operator outcome per ticket, using the static prototype only as the behavior design source.
- [x] Declare only dependencies required by the preceding product capability.
- [x] Prepare the numbered breakdown for the user approval gate.
- **Status:** complete

### Phase 3: Independent semantic review

- [x] Ask fresh Reviewers to inspect product purpose, prototype evidence, UI and interaction fidelity, parent-Issue routing and dependency edges.
- [x] Resolve every actionable finding in the 13 product Tickets.
- [x] Ask an independent Reviewer to inspect the new foundation Ticket, renumbered dependency graph and the requirement that all later Tickets reuse its landed engineering baseline.
- [x] Resolve every actionable finding in the main task.
- **Status:** complete

### Phase 4: User approval gate

- [x] Present the numbered breakdown with titles, blockers, and delivered behavior.
- [x] Ask whether granularity, dependency edges, merges, and splits are correct.
- [x] Do not publish GitHub Issues before explicit approval.
- **Status:** complete

### Phase 4A: Per-Ticket PRD completeness audit

- [x] Map every “添加本次消息上下文” candidate type to its production data owner, read contract, and implementing Ticket; prohibit prototype fixtures as runtime data.
- [x] Change the accepted prototype candidate pane to a paginated three-column fixed-size card grid with cover images and a deterministic placeholder, then carry the same requirement into Tickets 03/05 and their PRDs.
- [x] Audit Tickets 01–14 against the prototype, parent Issue #1, Harness rc.7 contracts, source-code repository revision `0765bb55dd5f402e835d0a02b257c10116f5866f`, and migration-Skill release revision `799b7759029d70076791321e2b02bf53c651c98f`.
- [x] Create the required Ticket-specific PRDs under `docs/v0.1/PRDS/`.
- [x] Add each PRD path to the corresponding Ticket body without publishing or modifying GitHub Issues.
- [x] Submit the PRDs and revised Ticket bodies to independent semantic review.
- [x] Report the modal data-source mapping and per-Ticket sufficiency result to the user.
- **Status:** complete

### Phase 5: Publication after approval

- [x] Create one GitHub Issue per approved ticket in dependency order.
- [x] Apply the configured triage label and native relationships when supported.
- [x] Verify the published bodies and relationships without modifying a parent Issue body or state.
- **Status:** complete

### Phase 6: Cross-repository source contract handoff

- [x] Separate the `NoobAI-XL-FZ` source-repository implementation from all `harness-comfyui` Issues.
- [x] Freeze 10 Catalog operations, 2 Host-only Source operations, request/response fields, errors, CLI exit codes, tests and source release steps in `docs/v0.1/source-data-catalog-implementation.md`.
- [x] Point the handoff at committed `NoobAI-XL-FZ` main revision `0765bb55dd5f402e835d0a02b257c10116f5866f`; exclude `NoobAI-XL-FZ-PROD-ENV` from code modification scope.
- [x] Keep GitHub Issue #4 labeled `needs-info` and synchronize the revised current-repository Issue bodies.
- [x] Receive independent semantic PASS for the final handoff and cross-repository boundary.
- **Status:** complete

### Phase 7: rc.8 baseline and blocker audit

- [x] Read the installed package manifest, lockfile and rc.8 package source without installing or executing external code.
- [x] Remove the unapproved column-width decision blocker from local Ticket 02 and GitHub Issue #3.
- [x] Audit GitHub Issues #1–#15 and local PRDs, ADRs, scheme and draft for every `Blocked by`, user-decision, pending-decision, rc.7 and rc.8 statement.
- [x] Replace stale rc.7 public-plugin conclusions with evidence from installed rc.8 package exports and source.
- [x] Synchronize every changed local Ticket body to its existing GitHub Issue and verify exact body equality.
- [x] Obtain independent semantic review of blocker ownership, rc.8 evidence and published Issue consistency.
- **Status:** complete

### Phase 8: Agent Preset and Workbench Session addenda

- [x] Inspect the installed rc.8 Agent Preset, scoped Tool, Skill provider and `session.create` contracts.
- [x] Inspect paused Issue #3's worktree, committed progress and uncommitted files without changing them.
- [x] Draft one #2 addendum Issue that owns the project Preset and Agent-scope Tool/Skill composition.
- [x] Draft one #3 addendum Issue that owns explicit project-Preset Session creation and resume validation through a small Client interface.
- [x] Create both GitHub Issues, attach them as native addenda to Issues #2 and #3, and add the dependency chain `#2 → #16 → #3 → #17 → #4`.
- [x] Verify Issue bodies, labels, native parents, dependency graph and absence of edits to the Issue #3 worktree.
- **Status:** complete

## Key Questions

1. Which prototype behaviors are confirmed decisions rather than exploratory options?
2. Which tickets can start independently without touching the same contracts or source files?
3. Does the source design identify a parent GitHub Issue, or should the Parent section be omitted?

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use GitHub Issues after approval | The repository AGENTS.md configures GitHub Issues through `gh`. |
| Preserve all existing root planning files | They are modified user-owned work for another task. |
| Replace 19 architecture-layer tickets with 13 staged product slices, then prepend one engineering foundation Ticket | Tickets 02–14 retain concrete prototype or release outcomes. The plan author completed the Harness source and package research before drafting Ticket 01; Ticket 01 contains the resulting fixed profile, bundle, Host, Client, slot, configuration, dependency, test and CI/CD decisions, and its executor only lands and verifies them. |
| Leave management Skill migration outside this draft | The approved design does not identify a source repository and revision containing those Skills. |
| Use Harness `call_id` as the only Tool-execution idempotency identity | The single-image, restart-recovery and failure-safety slices use `(workspace_id, session_id, call_id)` directly with `run_id` and do not create another identity. |
| Treat ComfyUI Instance as Execution Route, not Message Context | Parent Issue #1 and the accepted scheme define the instance as execution routing; the static prototype's generic selection behavior does not enter the formal product. |
| Require prototype fidelity in every Ticket | Every Ticket now names its exact prototype region and requires the real product to reproduce the corresponding function, layout, styling, controls, interaction and visible states. |
| Route prototype gaps to parent Issue #1 | Full Issue bodies must copy each applicable parent requirement into their own execution boundaries and acceptance checklists instead of using a generic parent reference. |
| Treat prototype fixtures as design and automated-test inputs only | Production modal candidates must come from the typed Catalog/Source projections or this repository's persisted Run Repository and media services; a static fixture cannot satisfy a browser acceptance path. |
| Create Ticket-specific PRDs when the prototype does not determine implementation behavior | The prototype determines visible layout and interaction states but does not fully define backend contracts, persistence, authentication isolation, recovery, errors, release, or deployment behavior. |
| Use a three-column paginated candidate-card grid | The user explicitly replaced the modal's list presentation; every card has fixed dimensions and shows the resource cover when available or the shared placeholder when absent. |
| Add two addenda instead of reopening completed Issue #2 | The user explicitly chose two addendum Issues. Issue #16 restores the missing Agent Preset foundation before paused Issue #3 resumes; Issue #17 integrates deterministic Workbench Session creation/resume after Issue #3 completes and before Issue #4 starts. |
| Preserve the paused Issue #3 worktree | The branch already contains eight commits and four uncommitted files. Both addenda must use independent worktrees and must not edit, reset, stage or commit Issue #3 files. |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| `read_thread` rejected `turnLimit=20` and `maxOutputCharsPerItem=30000` | 1 | Retry with the documented maxima: 10 turns and 20000 characters per item. |
| Perl emitted a locale fallback warning during mechanical ticket renumbering | 1 | The command completed; verify all 19 headings and blocker references, then use `apply_patch` for substantive edits. |
| One combined planning-file patch referenced a decision row in the wrong file | 1 | Split the update into file-specific patches with exact current context. |
| One `apply_patch` attempted to delete and add the same draft path in one patch | 1 | Delete the rejected draft and add the replacement proposal in two separate `apply_patch` calls. |
| One large semantic patch failed because an earlier hunk changed matching context used by later hunks | 1 | Apply the product-purpose rewrites in three smaller Ticket groups. |
| A combined Phase 8 planning patch contained an empty findings-file hunk | 1 | Reapply the task-plan change alone, then append findings and progress with separate non-empty patches. |
