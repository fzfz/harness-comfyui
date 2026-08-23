# Findings

## Repository state

- The target document is currently untracked in `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/`.
- The working tree contains user-owned changes across `CONTEXT.md`, ADRs, PRDs, prototype files, tests, and root planning files.
- This interview must preserve all pre-existing changes and modify only confirmed glossary or ADR content during the interview.

## Evidence

- The repository uses one root `CONTEXT.md` and one system-wide `docs/adr/` directory.
- The existing glossary already defines `Catalog Operation`, `Source Operation`, `Source Contract Identity`, `Source Data Release Handoff`, `ComfyUI Instance Authorization`, `Workflow Template`, `Execution Route`, `Generation Run`, and `Run Repository`.
- The target document is an implementation handoff from `harness-comfyui` to `NoobAI-XL-FZ`; it fixes repository ownership and explicitly excludes the production installation directory.
- The target document fixes one contract identity (`imagegen-source-contract`, version `1`), ten Catalog POST operations, two Host-only Source GET operations, a search/resolve request shape, stable decimal-string IDs, a closed `CatalogPage`, ten closed item projections, a closed error catalog, and two CLI protocols.
- The target document retains the four legacy Pi operations during this source release while adding ten Harness Catalog operations under separate metadata.
- Catalog responses expose safe selection data. Host-only Source responses expose an instance connection snapshot or a complete template bundle. The browser and Skills must not receive Source-only fields.
- The target document makes template availability depend on persisted runtime constraints, static validation, one positive prompt parameter, supported output nodes, valid bindings, and output-node declarations.
- The existing working tree already changes glossary and ADR files. Every inline documentation update must preserve overlapping user-owned text.
- Accepted ADR 0007 already chooses one authoritative OpenAPI schema with separate Catalog and Host-only Source projections; it also explicitly excludes authentication of other local processes from the v0.1 threat model.
- Accepted ADR 0009 already chooses fail-closed contract identity/version handling with no field guessing or legacy-path fallback.
- Accepted ADR 0003 classifies ComfyUI instances as Execution Route data and base models as Catalog Filter data; neither belongs to Message Context.
- Accepted ADRs 0005, 0008, and 0010 keep Harness identities and Generation Run facts out of the source-data contract.
- The official ComfyUI `master` source currently defines `SaveAudioAdvanced` as an output node and marks `SaveAudio`, `SaveAudioMP3`, and `SaveAudioOpus` deprecated. This supports the target document's current-node claim, but the document cites a moving branch rather than an immutable ComfyUI revision.
- The source repository's current local `main` is `c7c92fc`; `origin/main` remains `0765bb5`. The target document describes `0765bb5`, so its implementation-fact section is historical rather than current-local-main evidence.
- At current source-repository `c7c92fc`, OpenAPI, the handler manifest, and `catalog-http.mjs` expose six legacy semantic operations, not four. The current protocol still uses `queries[]`, `limit`, `x-noobai-pi-tool-name`, and an `{ok:true,data}` response envelope.
- The current source repository does not implement `x-harness-tool-name`, the ten closed Catalog operations, `imagegen-comfyui-source-read`, the two Host-only Source handlers, the Source discovery, the complete persisted runtime constraints, or `SaveAudioAdvanced` admission.
- The current `harness-comfyui` configuration contains `contractId: "harness-comfyui-source"`, which conflicts with the accepted ADR and target contract ID `imagegen-source-contract`.
- `harness-comfyui` does not yet implement `StructuredCliGenerationCatalog`, `ComfyuiSourceCatalog`, `catalog-tool-manifest.ts`, `createCatalogTool()`, or `registerProjectTools()`; the target document describes future consumer boundaries.
- `config/development.json` currently sets the Catalog CLI path to `node`; the materialization rule for an installed Catalog CLI path is not yet documented as an implementation fact.
- The target document's statement that the historical OpenAPI had only four operations is incomplete: at `0765bb5`, four Skill handlers existed while two separate CLI operations were also declared in OpenAPI.
- Five proposed Catalog `POST` routes collide with current legacy `POST` routes: works, characters, styles, prompt-terms, and artist-prompt-strings. The request and response contracts differ, so one OpenAPI path/method cannot retain both contracts.
- Required/nullability rules for the reviewed model, LoRA, style, artist-string, character, work, and template relationship fields are compatible with the current database. The unresolved persistence differences are text-length caps, array uniqueness/size, template parameter/binding structure, and nullable `expected_output_node_ids_json`.
- The target document simultaneously requires CLI `CatalogPage.items[].cover_url`, forbids the raw source URL from entering Harness Tool Result, and says only CLI stdout JSON becomes Tool Result. No current PRD defines the rewritten Tool Result or UI media descriptor.
- Existing ADRs/PRDs require all ten Catalog operations to register as Agent Tools, including base-model and ComfyUI-instance operations, while separately forbidding those two kinds from becoming Message Context. No rule prevents another authorized Agent or Skill from using the instance list to choose an Execution Route.

## Design tree

- A. Handoff authority
  - A1. Decide whether the current document is a proposal or a frozen cross-repository contract.
  - A2. After A1, define how an executor reports a code contradiction without silently redesigning the contract.
  - A3. After all decisions, define the state transition back to `ready-for-source-repository-issue`.
- B. Source baseline and release
  - B1. Select the exact source-repository implementation baseline.
  - B2. After B1, select the source package version and database-migration allowance.
  - B3. After B2, define the release evidence that unblocks the Harness consumer.
- C. Legacy compatibility and contract versioning
  - C1. Resolve the five path/method collisions between legacy semantic operations and the new Catalog protocol.
  - C2. After C1, define legacy deprecation/removal timing.
  - C3. After C1, define which changes increment `contract_version` and whether Catalog and Source advance together.
- D. Catalog audiences and domain boundaries
  - D1. Decide whether base-model and ComfyUI-instance operations are Agent Tools or Host/UI-only Catalog operations.
  - D2. After D1, define the allowed relationship between Agent-visible records, Catalog Filter, Message Context, and Execution Route.
  - D3. After D1, revise ADR 0007 if Catalog operations have multiple audiences.
- E. Catalog identity and revision language
  - E1. Define the scope and lifetime of decimal-string Catalog record IDs.
  - E2. Decide whether package SemVer is named `source_revision` or `source_release_version`.
  - E3. After E1, define deletion, restoration, reseeding, and stale ContextRef behavior.
- F. Search and availability semantics
  - F1. Define `total_count` for non-empty semantic search and stable pagination under catalog changes.
  - F2. Define the response for a nonexistent filter ID and a mismatched relationship.
  - F3. Define availability behavior for each Catalog kind, not only templates and instances.
  - F4. Define overflow behavior for records exceeding response length/array constraints.
- G. Media transport
  - G1. Decide whether Tool Results contain a Host-rewritten `cover_url`, a media descriptor, or no cover field.
  - G2. After G1, define same-origin route identity, lifetime, cache behavior, and source-unavailable behavior.
- H. Template admission facts
  - H1. Decide which runtime constraints are persisted and which are derived.
  - H2. Decide how existing templates without reproducible constraints become available.
  - H3. Decide whether supported ComfyUI node definitions are pinned to an immutable upstream revision and fixture.
  - H4. After H3, confirm whether `SaveAudioAdvanced` is in v0.1.
- I. Host consumer ownership
  - I1. Assign correction of the current Harness contract ID to a specific consumer Issue.
  - I2. Define how production, development, test, and release-smoke profiles materialize installed CLI paths.
  - I3. After B3 and I1-I2, define the exact consumer unblock gate.

## Confirmed decisions

- D1 resolved: The source repository only publishes the CLI and its structured contract. The source-repository implementation does not decide or enforce how the target repository exposes Catalog operations to Agents, Skills, or UI controls.
- E1 resolved: Catalog IDs remain the documented decimal-string projection of source database positive integer primary keys. This version adds no catalog lineage identifier, reseeding detector, or cross-database identity mechanism.
- H3 resolved: This version does not pin an upstream ComfyUI commit and does not add upstream provenance or revision-tracking machinery.
- H4 resolved: `SaveAudioAdvanced` remains the documented supported audio output node without expanding the implementation into upstream-version management.
- G1 resolved: The source contract ends at CLI `CatalogPage.items[].cover_url`. A non-null value uses the source service media origin, configured public prefix, and percent-encoded media-path segments; target-repository proxying, rewriting, Tool Result projection, and Client consumption are outside the source CLI contract.
- A document-ownership decision moved the implementation handoff from the Harness repository into the source repository at `plans/source-data-catalog-implementation.md`.
- A1 resolved: The implementation document remains `design-review` until the interview frontier is empty and the confirmed contract has been revised and reviewed.
- B1 resolved: The implementation baseline is committed source-repository `main` revision `c7c92fc677bf45a16c2bbee518935ba19bb6166f`; uncommitted working-tree files are excluded.
- C1 resolved: New Catalog discovery uses `GET /internal/catalog`, and all ten new operations use `/internal/catalog/*`. Existing `GET /internal/semantic` and six legacy semantic operations remain unchanged in this release.
- E2 resolved: The source package SemVer field is named `source_release_version`; `source_revision` is no longer part of the proposed Catalog, Source, or Generation Context contract.
- B1 superseded: The implementation baseline is released `v0.81.0` revision `2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a`; uncommitted working-tree files remain excluded.
- C1 superseded: `v0.82.0` directly replaces `GET /internal/semantic` and the six old semantic operations with ten Catalog operations under `/internal/semantic/*`. No `/internal/catalog` namespace or legacy semantic protocol remains.
- I2 resolved for the source CLI contract: every discovery or query call requires an explicit decimal `--port` from `1` to `65535`, and both CLIs connect only to `127.0.0.1`. They do not read `.env`, search for ports, or accept URL/hostname inputs.
- The original two-CLI split remains: `imagegen-semantic-query` exposes safe Catalog projections, while `imagegen-comfyui-source-read` exposes Host-only instance and template data.
- CLI protocol versions are independent from the source package release version: Catalog CLI `2.0.0`, Source CLI `1.0.0`, and response `source_release_version` `0.82.0`.
- The existing `npm run cli:install` command installs both fixed executables under `$HOME/.local/bin`; this plan adds no second install command.
- The new LoRA Catalog path is `/internal/semantic/loras`; the legacy `/internal/semantic/generation-loras` path is removed with the old protocol.
- Both CLIs accept optional `--timeout-ms` with default `120000` and range `1` through `600000`; discovery and the subsequent operation share one total deadline.
- Top-level CLI help and the two fixed Source subcommand help forms are offline and do not require `--port`; Catalog operation-level help requires live discovery and an explicit port.
- Both discovery stdout wrappers include `source_release_version`. Runtime discovery obtains the value from the single source `package.json.version`, and the CLIs validate and project it rather than accepting it as input or hardcoding the source release version.
- The user withdrew result-versus-discovery release-version comparison; the plan adds no such CLI validation rule.
- The Host-only instance response contains `credential_type` and a ready-to-use Authorization header value, not separate username, password, or token fields.
- Both CLI help systems must retain the existing progressive-disclosure design: compact top-level orientation, live Catalog operation listing, focused operation or Source subcommand detail, stable hierarchy, copyable examples, complete parameter meaning, and no irrelevant Schema expansion or repeated text.
- Both CLI help systems use English. Catalog operation wording and constraints come from live discovery, while Source subcommand help is fixed by the static Source CLI contract.
- Help acceptance does not impose a fixed character, line, or token ceiling. Automated tests cover deterministic structure and data-source boundaries; independent semantic review covers clarity, necessary content, and token economy.
- Current independent review found one remaining CLI decision: the single Catalog operation help Example needs one explicit source. The review recommends deterministic construction from the selected operation's live discovery request examples, with no business example stored in CLI source.
- The user confirmed that recommendation. No unresolved CLI input, output, help, installation, release-version, Source-authorization, or route-namespace decision remains in the current design tree.
- Source HTTP success responses necessarily contain the Authorization value before `imagegen-comfyui-source-read` writes it to stdout. The source plan now excludes that value from Catalog, discovery, help, logs, errors, and test snapshots instead of incorrectly claiming it exists only in CLI stdout.
