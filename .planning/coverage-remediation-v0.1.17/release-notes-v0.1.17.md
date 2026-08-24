# harness-comfyui v0.1.17

## Release identity

- Version and annotated tag: `v0.1.17`
- Release commit: `ff9aefaa211726fad12dd35436f43313a3f021a4`
- Release artifact: `harness-comfyui-0.1.17.tgz`
- Artifact byte length: `802398`
- Artifact SHA-256: `c326d60352a50c48f8d180a3da9c3b67ecce5c1cd8c7eccb85a553a3fea1daba`
- Artifact Qualification workflow run: `32683439210`
- Release Preview workflow run: `32684542046`

The Git tag, GitHub Release title, package version, qualification manifest, Preview manifest, and tarball use this same `0.1.17` identity. The GitHub Release attaches this exact tarball without rebuilding or repacking it.

## Qualification evidence

The qualified artifact passed all four required consumer gates:

- `test:deploy`
- `test:composition`
- `test:e2e`
- `release:smoke`

The repository-wide coverage remediation completed `256/256` unit and integration tests. The final V8 coverage report is:

| Metric | Result | Fixed threshold |
| --- | ---: | ---: |
| Statements | `94.83%` (`642/677`) | `88%` |
| Branches | `85.93%` (`336/391`) | `79%` |
| Functions | `100%` (`136/136`) | `100%` |
| Lines | `97.70%` (`596/610`) | `91%` |

The coverage remediation changed test coverage and added the exact test-only dependency `react-test-renderer@18.3.1`; it did not change product source behavior, coverage thresholds, coverage include/exclude rules, or test timeouts.

## Issue #17 verified scope

Issue #17 verifies the Workbench Session binding defined by PRD 16:

- The Workbench displays only non-subagent Sessions whose `agentPreset` is `harness-comfyui`.
- The binding keeps an eligible current Session; otherwise it selects an existing eligible Session deterministically by `updatedAt` descending and `id` ascending.
- When no eligible Session exists, one connection generation creates one Session with the Host `cwd` and the configured `harness-comfyui` Agent Preset, waits for Session-list convergence, and opens the confirmed Session.
- Refresh, Host reconnect, and product restart reuse the persisted project Session without creating a duplicate Session.
- Abort, disposal, stale generation, create failure, Preset mismatch, list timeout, list mismatch, and open failure use the defined structured error mapping. The Workbench does not fall back to `standard` or `minimal`, and it does not submit ordinary messages to an invalid Session.
- The accepted product path uses the existing three-column Workbench and adds no new visible control or layout change.

Issue #17 received real product lifecycle evidence and independent desktop visual evidence at `1440×1000`. The visual scope covers the existing Workbench Session list, current-session title, ordinary message, streaming state, input area, right-column stage state, and the existing three-column dimensions. This release does not claim mobile layout acceptance.

## Source contract compatibility

The Harness consumes the structured contract in `config/source-contract-v0.82.2.json`:

- Installation pins are `source.contractId: "imagegen-source-contract"` and `source.sourceReleaseVersion: "0.82.2"`.
- Catalog discovery is a bare OpenAPI `3.1.0` object. It is not required to return the source pin fields.
- Host-only Source discovery is the paginated success envelope with `status`, `message`, `results`, `page`, `page_size`, and `total_count`.
- Catalog and Source CLIs use raw-passthrough transport validation. A CLI success exit code does not prove business-schema validity; the Harness adapter validates discovery, operation metadata, success/error envelopes, and operation result fields before exposing data to the product.
- `expected_output_node_ids_json` must parse to a non-empty array. A missing, null, empty, or invalid value fails closed with `SOURCE_TEMPLATE_UNAVAILABLE`; the adapter does not infer output nodes from `workflow_json` or supply defaults.

## Configuration, production data, and runtime compatibility

- The production installation uses `configurationProfile: "production"` and the shared installation layout.
- Run Repository data, Run files, Saved Media, and logs remain in the installation's shared directories. Install, upgrade, and rollback keep those shared records and files in place and do not move, overwrite, or delete them.
- The supported Node.js engine is `^22.19.0 || >=24.0.0`.
- The required package manager is `pnpm@11.7.0`.
- The release-local Harness runtime pins the DeepSeek Harness packages `@deepseek-ai/dsh`, `@deepseek-ai/dsh-base`, and `@deepseek-ai/dsh-web-app` to `0.1.0-rc.8`, with the audited runtime lockfile closure.

## Product CLI

Users can manage a self-selected installation with the packaged `harness-comfyui` CLI:

```sh
npm exec --yes --package=<absolute-path-to-harness-comfyui-0.1.17.tgz> -- harness-comfyui install \
  --installation <absolute-installation.json> \
  --artifact <absolute-path-to-harness-comfyui-0.1.17.tgz>
<installation-root>/bin/harness-comfyui start --installation <absolute-installation.json>
<installation-root>/bin/harness-comfyui status --installation <absolute-installation.json> --json
<installation-root>/bin/harness-comfyui health --installation <absolute-installation.json> --json
<installation-root>/bin/harness-comfyui logs --installation <absolute-installation.json> --source all --lines 200
<installation-root>/bin/harness-comfyui restart --installation <absolute-installation.json>
<installation-root>/bin/harness-comfyui stop --installation <absolute-installation.json>
```

The same CLI also provides `upgrade` and `rollback`. The CLI uses the installation JSON and the `production` Configuration Profile for its Host paths, Source CLI paths, ComfyUI instance, server address, PID state, health state, and logs. The release process does not install, start, stop, deploy, activate, or roll back any user's environment.

## Intermediate-release boundary

v0.1.17 is an intermediate release for the verified Issue #17 Workbench Session binding and the repository-wide coverage qualification recorded above. This release notes file does not claim that Issues #4–#13 are implemented by v0.1.17, and it does not redefine their product scope. Users choose whether and where to install this exact release and remain responsible for their own credentials, Source CLI configuration, ComfyUI instance, installation lifecycle, upgrades, and rollback decisions.
