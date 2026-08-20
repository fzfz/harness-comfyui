# Dependency build-script security assessment

## Current decision

`pnpm-workspace.yaml` records five explicit allow decisions. `strict-dep-builds=true` remains enabled. A dependency version change does not inherit any decision because every `allowBuilds` key contains the exact reviewed version. The project preserves all five packages' lifecycle behavior; `allowBuilds` is an audit gate, not an installation-pruning mechanism.

| Package | Lifecycle command | Decision | Reason |
|---|---|---|---|
| `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7` | `node scripts/ensure-spawn-helper.mjs` | ALLOW | The 572-byte script resolves the installed `node-pty` package, checks two package-local helper paths, and applies mode `0755` only when a helper exists. The script does not create a process, open a network connection, read credentials, or write outside the installed `node-pty` package. |
| `@google/genai@1.52.0` | `echo 'preinstall: no-op'` | ALLOW | The preinstall command only writes the literal no-op message to standard output. The published tarball does not contain the repository-only `scripts/prepare.js` target. |
| `koffi@3.1.5` | `node ./cnoke.cjs -P . -D src/koffi --prebuild --release` | ALLOW | The command loads the exact platform-specific native module to validate it and falls back to local CMake or Ninja compilation from bundled source. It contains no runtime download implementation. The user explicitly required the project to preserve this installation behavior after reviewing the native-module and compiler boundary. |
| `node-pty@1.2.0-beta.15` | `node scripts/prebuild.js \|\| node-gyp rebuild`; `node scripts/post-install.js` | ALLOW | The first script selects the exact platform prebuild or invokes the declared node-gyp fallback. The second script cleans only package-local build output and copies bundled Windows runtime files only on Windows. The user explicitly required the project to preserve this installation behavior after reviewing the native-module and compiler boundary. |
| `protobufjs@7.6.5` | `node scripts/postinstall` | ALLOW | The script only reads its own manifest and the parent package manifest to print a version-scheme warning. The published package has no `versionScheme`, so the script returns before reading the parent manifest. |

════════════════════════════════════
  SKILL / MCP SECURITY ASSESSMENT
────────────────────────────────────
  Name:         Harness ComfyUI dependency build-script package set
  Version:      dsh-subprocess-local 0.1.0-rc.7; genai 1.52.0; koffi 3.1.5; node-pty 1.2.0-beta.15; protobufjs 7.6.5
  Source:       npm official registry
  Author:       DeepSeek; Google; Koromix; Microsoft; protobufjs maintainers
  Trust Tier:   1 — official package identities and repository links
  Published:    Exact versions published from 2026-05-04 through 2026-08-17
  Last Updated: 2026-08-20
────────────────────────────────────
  FILES SCANNED
  Total: 251  |  Executable or source: 149  |  Docs/config/assets: 102
  High-risk files: koffi cnoke.cjs and platform koffi.node; node-pty prebuild/post-install scripts and bundled native files
────────────────────────────────────
  RED FLAGS
  • koffi's allowed install command can load a bundled FFI native module or spawn local CMake and Ninja. (Severity: 🔴)
  • node-pty's allowed install command selects a bundled PTY native module or spawns node-gyp; the package also contains platform executables. (Severity: 🔴)
  • the allowed DeepSeek script changes one package-local helper's executable mode but never executes the helper. (Severity: 🟡)
────────────────────────────────────
  PERMISSIONS REQUIRED
  Read:     Package manifests, package-local prebuilds, native build inputs, Node runtime metadata, and local compiler availability
  Write:    Package-local build output, package-local cleanup targets, and the node-pty spawn-helper executable mode
  Network:  None
  System:   Koffi may invoke CMake or Ninja; node-pty may invoke node-gyp when a platform prebuild is absent
  Env Vars: npm_config_build_from_source, npm_config_arch, MAKEFLAGS, MSYSTEM, XDG_CACHE_HOME, HOME, LOCALAPPDATA, APPDATA
────────────────────────────────────
  ARCHITECTURE
  Credential handling:  No reviewed lifecycle command reads credentials.
  Human-in-the-loop:    Yes — after reviewing the native and compiler boundary, the user explicitly required all five exact versions to retain their lifecycle scripts.
  Auto-update:          No — package.json and pnpm-lock.yaml pin the dependency graph.
  Data boundary:        Lifecycle writes remain inside package-local build directories; Koffi reads the configured local cache path when resolving build state.
  Degradation:          strict-dep-builds rejects every unlisted lifecycle command.
────────────────────────────────────
  RISK:     🔴 HIGH
  VERDICT:  ⚠️ CAUTION — user-approved execution of five exact-version lifecycle scripts
────────────────────────────────────
  NOTES
  The assessor downloaded exact tarballs with npm pack --ignore-scripts into an isolated temporary directory. No package lifecycle command ran during inspection. Registry integrity values matched pnpm-lock.yaml. The macOS arm64 koffi.node, node-pty pty.node, and node-pty spawn-helper are ad-hoc signed native artifacts without a TeamIdentifier; static file, linkage, string, and checksum inspection found no unexpected external library, credential path, persistence path, or outbound URL. The user reviewed this high-risk boundary and explicitly rejected lifecycle-script suppression.
════════════════════════════════════

## Package evidence

| Package artifact | Registry integrity | Files | Native artifacts relevant to macOS arm64 |
|---|---|---:|---|
| `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7` | `sha512-Q1zl35fRNSASv2FOi6viwR29cn3vtOcyKfamcmRB789m6sb6CdlhIMettvcxxDDHwTSH/jjz3hqb0JAx2GT32g==` | 13 | None |
| `@google/genai@1.52.0` | `sha512-gwSvbpiN/17O9TbsqSsE/OzZcpv5Fo4RQjdngGgogtuB9RsyJ8ZHhX5KjHj1bp5N9snN2eK8LDGXSaWW2hof8Q==` | 25 | None |
| `koffi@3.1.5` | `sha512-XVwwrxg0Ca6IEUQF4YtGIU4XN0LSselFYpYvgfhh8wafCunhEEx5hPr7LZhp5QyeFA/LcRsKHTqncCdjWjWAlg==` | 81 | Provided by the exact optional platform package below |
| `@koromix/koffi-darwin-arm64@3.1.5` | `sha512-IpqITl2fJi3QN9bTtNnygWPdK7ScSjw3xtGu8e6feYGvimCysu+spgI5KyeslY2jTnqxGS9xr8pLAbLhGJ8edA==` | 4 | `darwin_arm64/koffi.node` SHA-256 `c91bf34ac350b0e35ecddf33555bed88a2873d5462f3160ee615d4a83ec29672` |
| `node-pty@1.2.0-beta.15` | `sha512-vORSzHXi4Ofl7HemVWpuudLqCPdaQb4LfpRCUpE5HPxhp4JYscl8zZwxh11p26v2wvW24WMwnMfLjhRLixrfxA==` | 49 | `pty.node` SHA-256 `0aae85518beb134a666f8e415f78bf528b2e9d40b47498af97433dc459661366`; `spawn-helper` SHA-256 `08bc83a084651d095645010d34783f94b9af443614747e953e66d6578027e999` |
| `protobufjs@7.6.5` | `sha512-/FPD0nUc9jH6rfFjji9IBqOz4pcSE3CsT1m7Ep6Mdb0LxSUMj8hgl6GomOvZzpNpAqqGaXA0P3VSrZLFzIhQrw==` | 79 | None |

## Acceptance evidence

- Every archive path was checked for absolute paths and `..` traversal before extraction.
- Every tarball registry integrity value equals the value in `pnpm-lock.yaml`.
- The DeepSeek, Google, and protobufjs lifecycle commands contain no network client, child-process call, credential read, persistence mechanism, secondary download, dynamic evaluation, or path derived from user input.
- The Koffi lifecycle command may load the exact bundled platform module and invoke only the reviewed local CMake or Ninja fallback. The node-pty lifecycle command may invoke only the reviewed local `node-gyp` fallback when the exact platform prebuild is unavailable. Neither lifecycle path implements a secondary download, credential read, persistence mechanism, or user-controlled command string.
- All five reviewed exact versions can execute their declared lifecycle commands during frozen installation.
- Any new dependency with a lifecycle command remains unlisted and fails closed through `strict-dep-builds=true`.
