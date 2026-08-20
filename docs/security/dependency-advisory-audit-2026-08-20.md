# DeepSeek Harness dependency advisory resolution security assessment

## Current status

- 当前项目 lockfile 的完整依赖闭包和 production 依赖闭包均为 0 critical、0 high、0 moderate、0 low advisory。
- 原 DeepSeek Harness monorepo 的 12 个 high advisory 只作为来源基线保留；这 12 个 high advisory 已经全部取得当前项目处理结论。
- 五个声明 build script 的依赖包已经完成独立安全审计。`pnpm-workspace.yaml` 明确允许五个精确版本的完整生命周期脚本，不裁剪依赖包的安装行为。

════════════════════════════════════
  SKILL / MCP SECURITY ASSESSMENT
────────────────────────────────────
  Name:         Harness ComfyUI high-advisory remediation package set
  Version:      brace-expansion 5.0.9; js-yaml 4.3.1; fast-uri 3.1.5; undici 7.29.0; ip-address 10.3.1; nanoid 3.3.18; postcss 8.5.23+
  Source:       npm official registry and linked official GitHub repositories
  Author:       Each package's registered upstream maintainer
  Trust Tier:   1 — official package identities linked to their project repositories
  Published:    2026-07-24 through 2026-08-07
  Last Updated: 2026-08-20 audit
────────────────────────────────────
  FILES SCANNED
  Total: 403  |  Executable or source: 304  |  Docs/config/assets: 99
  High-risk files: undici network client; js-yaml CLI file reader; postcss previous-source-map file reader
────────────────────────────────────
  RED FLAGS
  None requiring rejection.
  • undici opens caller-selected network connections and reads HTTP_PROXY, HTTPS_PROXY, and NO_PROXY. This capability matches its HTTP client purpose. (Severity: 🟡)
  • js-yaml CLI reads a caller-selected YAML file. postcss reads a previous `.map` file constrained by the CSS source path unless the caller explicitly enables `unsafeMap`. These capabilities match their documented parser behavior. (Severity: 🟡)
  • The seven reviewed tarballs contain no native binary, no preinstall/install/postinstall lifecycle script, no child-process import, no dynamic eval/Function construction, no persistence mechanism, and no auto-update mechanism.
────────────────────────────────────
  PERMISSIONS REQUIRED
  Read:     Caller-provided YAML input; caller-provided CSS and source-map input; package code and configuration
  Write:    None during package installation; undici mock snapshot code can write only when an application explicitly invokes that API
  Network:  npm registry during dependency resolution; undici sends requests only to destinations supplied by the consuming application
  System:   No lifecycle shell command, process spawn, service registration, login item, cron, or privilege escalation
  Env Vars: undici proxy variables; NODE_ENV/LANG diagnostic behavior; optional UNDICI_NO_WASM_SIMD runtime switch
────────────────────────────────────
  ARCHITECTURE
  Credential handling:  Reviewed packages do not search credential stores. undici accepts caller-provided request/proxy credentials and does not add a separate credential store.
  Human-in-the-loop:    Yes — exact version and override changes are reviewed before dependency installation.
  Auto-update:          No — package.json, pnpm-workspace.yaml, and pnpm-lock.yaml pin the resolved graph.
  Data boundary:        Local for parsers; undici crosses the network only when the Host explicitly invokes it.
  Degradation:          The audit gate fails closed on registry error or high/critical advisory.
────────────────────────────────────
  RISK:     🟡 MEDIUM
  VERDICT:  ⚠️ CAUTION — allow the five separately reviewed exact versions; keep every unlisted lifecycle script blocked
────────────────────────────────────
  NOTES
  No package code was executed during this assessment. `npm pack --ignore-scripts` downloaded exact tarballs into an isolated audit directory; the assessor inspected their file inventories and source patterns. Registry integrity values matched the exact versions recorded below.
════════════════════════════════════

## Original twelve high advisories

The source report is `pnpm audit --prod --registry=https://registry.npmjs.org --json` against DeepSeek Harness commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` and lockfile SHA-256 `f517dc3978d57531cda747df62a2abdde1df5b9f25415fcf1fc5d51f8b7547ea`.

| # | GHSA | Source package version | Current project handling | Result |
|---:|---|---|---|---|
| 1 | `GHSA-3jxr-9vmj-r5cp` | `brace-expansion@5.0.6` | The current lockfile excludes `brace-expansion`; the workspace override replaces future affected 5.x resolutions with `5.0.9`. | RESOLVED |
| 2 | `GHSA-52cp-r559-cp3m` | `js-yaml@4.2.0` | The current lockfile resolves `js-yaml@4.3.1`. | RESOLVED |
| 3 | `GHSA-v2hh-gcrm-f6hx` | `fast-uri@3.1.3` | The current lockfile excludes `fast-uri`; the workspace override replaces future affected 3.x resolutions with `3.1.5`. | RESOLVED |
| 4 | `GHSA-mh99-v99m-4gvg` | `brace-expansion@5.0.6` | The same `brace-expansion@5.0.9` override closes this advisory. | RESOLVED |
| 5 | `GHSA-4cwx-7wf7-3272` | `undici@7.28.0` | The current lockfile excludes `undici`; the workspace override replaces future affected 7.x resolutions with `7.29.0`. | RESOLVED |
| 6 | `GHSA-7p8r-x3mc-p8w7` | `fast-uri@3.1.3` | The same `fast-uri@3.1.5` override closes this advisory. | RESOLVED |
| 7 | `GHSA-mwp4-54f8-5fhr` | `ip-address@10.2.0` | The current lockfile excludes `ip-address`; the workspace override replaces future affected 10.x resolutions with `10.3.1`. | RESOLVED |
| 8 | `GHSA-rgw5-rvv9-x895` | `brace-expansion@5.0.6` | The same `brace-expansion@5.0.9` override closes this advisory. | RESOLVED |
| 9 | `GHSA-5p4m-2wfm-xmqj` | `js-yaml@4.2.0` | The same `js-yaml@4.3.1` resolution closes this advisory. | RESOLVED |
| 10 | `GHSA-28wg-ghj8-5hjv` | `nanoid@3.3.12` | The current lockfile resolves `nanoid@3.3.18`. | RESOLVED |
| 11 | `GHSA-2v37-7h3g-55p8` | `nanoid@3.3.12` | The same `nanoid@3.3.18` resolution closes this advisory. | RESOLVED |
| 12 | `GHSA-r28c-9q8g-f849` | `postcss@8.5.15` | The current lockfile resolves `postcss@8.5.26`; the workspace override prevents affected versions below `8.5.23`, which also includes the later incomplete-fix boundary. | RESOLVED |

## Reviewed remediation artifacts

| Package | Registry integrity | Files | Lifecycle install scripts | Binary files |
|---|---|---:|---|---|
| `brace-expansion@5.0.9` | `sha512-ScQ4IuvIEF1TMlP7Zt+vjJ//9zlPb2SDcxWxM3bk8s6t6GGdJ7KO1dCcTidOPJKePW30LE/2cT7wCyPho9/Wxg==` | 13 | None | None |
| `js-yaml@4.3.1` | `sha512-CY6crGq313MX8GkwvB7tzgp99vjQxY1++5y10/BKN/GUfHqWaOGQMNZkBvqSzsZKWk/ijwHlWzzkLulsGHhjWQ==` | 36 | None | None |
| `fast-uri@3.1.5` | `sha512-gHwA1O9LDIcKunMKhObS/HimwtehO1nPUECKAu5TpKgaO19fcWEl4bliWe1jWxVFvIXztJjjQ4L8XQ1EU9f7Jw==` | 34 | None | None |
| `undici@7.29.0` | `sha512-IDxfleLmmbSskfWSUATiN1nfn2rDuvnMOqb5CWR92iIfojA0Ud+ulOAAEQ57LPr9rWmsreUyf5lwyao+7GNNVw==` | 210 | None | None |
| `ip-address@10.3.1` | `sha512-1e9d3kb97NHJTIJDZW9rKqW2h6+dFa50Dy0fpPSMQp2ADje5gvKsXmdiK6dwY5t76TaTt5+P5N1Y/LoToIxP6g==` | 30 | None | None |
| `nanoid@3.3.18` | `sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==` | 25 | None | None |
| `postcss@8.5.23` | `sha512-g50586zr4bZmwFiTlflMu8E0bDTb5I5gertgwAKmsdUlTQIhZtunzUlD1WSzwcVWPoAVpsrA6vlfCD7oXvRwgg==` | 55 | None | None |

## Current project gate result

- `package.json` declares every direct dependency with an exact version.
- `pnpm-workspace.yaml` is the unique structured source for the seven affected-version overrides.
- `.npmrc` selects the official npm registry, exact dependency saving, strict peer validation, and strict dependency-build review.
- `pnpm install --lockfile-only --ignore-scripts` generated lockfile SHA-256 `31575c342f4838904459d5b3daccad309ef3a1f227ef0fb9b0f982168e46e3c3`; the command created no `node_modules` directory and executed no package lifecycle script.
- `pnpm audit --json` reports 0 critical, 0 high, 0 moderate, and 0 low across 591 dependencies.
- `pnpm audit --prod --json` reports 0 critical, 0 high, 0 moderate, and 0 low across 475 production dependencies.
- A later `pnpm run security:audit` check unexpectedly invoked pnpm's missing-dependency preparation and downloaded a `node_modules` tree. `strict-dep-builds=true` stopped the command before any build script ran and identified five packages requiring a separate decision: `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7`, `@google/genai@1.52.0`, `koffi@3.1.5`, `node-pty@1.2.0-beta.15`, and `protobufjs@7.6.5`. The generated `node_modules` tree was moved to the operating-system Trash and is not part of the Development Workspace.
- The five build-script packages now have exact-version allow decisions in `pnpm-workspace.yaml`. The project preserves their complete lifecycle behavior instead of using `allowBuilds` to remove installation steps. The detailed review is `docs/security/dependency-build-script-audit-2026-08-20.md`.
