# Source Data Catalog Design Interview

## Goal

The interviewer and the user reach shared, explicit decisions for every branch of the design tree rooted at `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`. The interviewer records confirmed domain terms in the owning repository's `CONTEXT.md` and records only qualifying architectural decisions in its `docs/adr/`.

## Phases

| Phase | Status | Completion condition |
|---|---|---|
| Read repository evidence | complete | Repository rules, current glossary, target document, related ADRs, and relevant implementation facts are recorded in `findings.md`. |
| Build design tree | complete | Every root decision and dependency between decisions is explicit. |
| Interview by frontier | in_progress | The query-engine branches for the ten Catalog operations were incomplete and must be resolved and recorded. |
| Confirm shared understanding | pending | The revised query-engine design is complete and the user explicitly confirms the resulting design. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| The `find-docs` Skill requires `ctx7`, but repository rules prohibit running downloaded external scripts or unplanned dependency installation. | 1 | Opened the document's official ComfyUI GitHub source reference read-only instead. |
| `apply_patch` rejected a content-identical move because its move hunk was empty. | 1 | Reissued the move with repository-perspective wording changes required by the destination. |
| A multi-file reference patch contained one mismatched historical sentence, so the patch was not applied. | 1 | Replaced the exact old path mechanically across an explicit file allowlist, then scheduled a repository-wide reference check. |
| Perl reported that locale `C.UTF-8` was unavailable during the exact path replacement. | 1 | Perl fell back to locale `C`; the ASCII path replacement completed successfully. |
| A large decision-update patch missed the Markdown list marker on the Catalog CLI path bullet, so the patch was not applied. | 1 | Applied four smaller patches for status and baseline, route namespace, release-version field, and compatibility tests. |
| Independent semantic review found five incomplete cross-document projections after Q1/Q2/Q3/Q7. | 1 | Added the four missing Catalog operations, added `source_release_version` to Catalog item and context snapshot descriptions, added contract identity to the template bundle, and corrected the obsolete four-operation baseline statements. |

## Confirmed Decisions

- Q1: The implementation plan remains `design-review` until the interview frontier is empty and the user confirms the complete design.
- Q2: The original implementation baseline was committed source revision `c7c92fc677bf45a16c2bbee518935ba19bb6166f`. The user later replaced it with released `v0.81.0` revision `2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a`; uncommitted working-tree files remain excluded.
- Q3: The original decision to create `/internal/catalog` was superseded by the user. `v0.82.0` directly replaces `GET /internal/semantic` and its six old operations with the ten new Catalog operations under `/internal/semantic/*`; no `/internal/catalog` namespace or legacy semantic contract remains.
- Q4: The source repository provides only the OpenAPI, handlers, and CLI contract. Tool visibility and route selection in the target Harness repository are outside this implementation plan.
- Q5: A non-empty `CatalogPage.items[].cover_url` identifies media through the source repository's own HTTP media service. Target-repository proxying and Client projection are outside this implementation plan.
- Q6: Catalog record IDs remain positive database primary keys serialized as decimal strings. This plan adds no database-lineage identity.
- Q7: The source package SemVer field is named `source_release_version`.
- Q8: `SaveAudioAdvanced` remains supported. This plan adds no upstream ComfyUI commit pin or upstream provenance fixture.
- Q9: The Catalog and Source contract is the next minor release `v0.82.0`, because `v0.81.0` is already published from the new baseline.
- Q10: A syntactically valid but nonexistent `base_model_id` or `work_id` returns `422 CATALOG_REQUEST_INVALID`; an existing parent with no matching child records returns an empty successful page.
- Q11: Search `total_count` is calculated after query and allowed filters but before pagination; an out-of-range page returns empty `items` with the requested page values and the unchanged total.
- Q12-Q14: Withdrawn after the user corrected the scope. The source repository only provides the read-only CLI contract; this plan does not redesign runtime-config persistence, migrate existing template parameters, require administrators to resave templates, filter instances for a consumer, or decide an Execution Route.
- Q16: `v0.82.0` directly replaces the old discovery and operations at `/internal/semantic`; it does not add `/internal/catalog`.
- Q17 CLI count: Preserve the original two-CLI requirement. `imagegen-semantic-query` returns the ten safe Catalog projections; `imagegen-comfyui-source-read` returns Host-only instance source data and complete template bundles.
- Q15: Every discovery or query call for either CLI requires an explicit decimal `--port` from `1` to `65535`; both CLIs connect only to `127.0.0.1` and do not read `.env`, search ports, or accept URL/hostname inputs.
- Q17 versioning: `imagegen-semantic-query` uses CLI protocol version `2.0.0`; `imagegen-comfyui-source-read` uses CLI protocol version `1.0.0`; both publish `source_release_version: "0.82.0"` in successful Catalog or Source responses.
- Q18: The existing `npm run cli:install` command installs both `$HOME/.local/bin/imagegen-semantic-query` and `$HOME/.local/bin/imagegen-comfyui-source-read`; no second installer command is added.
- Q19: The LoRA Catalog operation path is `/internal/semantic/loras`; the replaced legacy `/internal/semantic/generation-loras` path is not preserved.
- Q20: Both CLIs accept optional `--timeout-ms`; its default is `120000`, its allowed range is `1` through `600000`, and one invocation uses one total deadline across discovery and the subsequent operation.
- Q21: Both CLIs provide offline top-level help without `--port`; the Source CLI also provides offline `instance --help` and `template-bundle --help`. Catalog path-level help requires live discovery and therefore requires `--port`.
- Q22: Both `--discovery-json` stdout objects contain `source_release_version`. The source service derives it from the single source `package.json.version`; each CLI validates and projects the live value instead of hardcoding the source release version or accepting it as input.
- Q23: Withdrawn by the user. This plan adds no CLI rule that compares operation-result `source_release_version` values with the current live discovery value.
- Q24: `imagegen-comfyui-source-read` returns only `credential_type` and a ready-to-use `authorization` header value; it does not return separate username, password, or token fields.
- Help design: Both new CLI protocols preserve the existing progressive-disclosure help style. Help must remain Agent-readable, structurally clear, directly actionable, deterministic, and token-efficient without omitting necessary parameter meaning.
- Q25: Both CLI help systems use English. Catalog operation purposes, parameters, descriptions, and constraints come from live discovery; the CLI owns only fixed help framing. Source help uses fixed English text for its two fixed subcommands.
- Q26: Help acceptance uses no fixed character, line, or token ceiling. Automated tests verify deterministic structure, information sources, and forbidden expansion; independent semantic review judges whether each passage is necessary for the Agent's next action.
- Q27: The Catalog single-operation help builds its sole search Example deterministically from the selected operation's live request Schema field examples. CLI source stores no business example and invents no business parameter value.
- Final confirmation: The user confirmed the complete shared understanding. The source implementation document status is `ready-for-source-repository-issue`; this confirmation does not authorize CLI implementation or Issue publication.
- Reopened review: the Ticket draft exposed that the plan did not distinguish semantic-vector search from ordinary SQLite keyword search. The implementation document returned to `design-review`; no Ticket draft is approved or publishable until this branch is complete.
