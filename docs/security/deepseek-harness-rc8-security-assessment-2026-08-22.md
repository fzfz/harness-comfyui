# DeepSeek Harness direct package set security assessment

## Current decision

The DeepSeek Harness direct package set is permitted for the frozen install only under the five exact `allowBuilds` entries and the project's manifest-lock and advisory gates. The package set is not approved for an unrestricted lifecycle execution policy.

════════════════════════════════════
  SKILL / MCP SECURITY ASSESSMENT
────────────────────────────────────
  Name:         DeepSeek Harness direct package set
  Version:      0.1.0-rc.8
  Source:       npm official @deepseek-ai scope
  Author:       deepseek-ai
  Trust Tier:   1 — official npm package identity and scope
  Published:    Exact package version reviewed from the npm registry
  Last Updated: 2026-08-22
────────────────────────────────────
  FILES SCANNED
  Scope:        Direct package manifests, installed published files, and the exact lifecycle-package gate inputs
  Coverage:     The assessment covers the five exact lifecycle packages and their published installation files needed by the build-script gate. It does not claim a manual line-by-line review of every file in the package set.
  Gate inputs:  @deepseek-ai/dsh-subprocess-local@0.1.0-rc.8; @google/genai@1.52.0; koffi@3.1.5; node-pty@1.2.0-beta.15; protobufjs@7.6.5
────────────────────────────────────
  RED FLAGS
  • `koffi` and `node-pty` include native installation/runtime components. (Severity: 🟡)
  • A `postinstall` command was executed unexpectedly during an earlier step before the security verdict. This incident was outside the approved assessment process and is not an approval of that execution path. (Severity: 🔴)
  • The DeepSeek subprocess helper script only applies mode `0755` to either of two installation-local `node-pty` helper candidates when that candidate exists. The script has no network access, credential access, download, dynamic execution, persistence, or workspace-outside access. (Severity: 🟡)
────────────────────────────────────
  PERMISSIONS REQUIRED
  Read:     Local package manifests and local package resolution data
  Write:    `chmod 0755` on an installation-local `node-pty` helper candidate
  Network:  npm registry only for package download during dependency installation
  System:   Native package installation behavior remains gated by the five exact `allowBuilds` entries
  Env Vars: Package-manager configuration required by the frozen install gate
────────────────────────────────────
  ARCHITECTURE
  Credential handling:  No reviewed direct package or lifecycle gate reads credentials.
  Human-in-the-loop:    Yes — the five exact lifecycle package versions and their build-script permissions are explicit gate inputs.
  Auto-update:          No — the frozen dependency closure and exact package versions do not provide an auto-update path.
  Data boundary:        Package resolution and helper mode changes remain local to the installation/package boundary; npm registry access is limited to package download.
  Degradation:          The build-script gate fails closed for lifecycle packages outside the five exact allow decisions.
────────────────────────────────────
  RISK:     🟡 MEDIUM
  VERDICT:  ⚠️ CAUTION — allow frozen installation under the five exact `allowBuilds` entries and all manifest-lock, advisory, and lifecycle gates
────────────────────────────────────
  NOTES
  The unexpected `postinstall` execution occurred before this security verdict and is recorded as an incident, not as an approved assessment or installation procedure. The approved flow requires the exact five-package build-script gate, manifest-lock verification, and advisory checks before formal frozen installation.
════════════════════════════════════

## Acceptance evidence

- Build-script gate: PASS. The exact five allowed packages are `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.8`, `@google/genai@1.52.0`, `koffi@3.1.5`, `node-pty@1.2.0-beta.15`, and `protobufjs@7.6.5`.
- Root dependency advisories: PASS. Full and production dependency graphs report zero critical, high, moderate, and low advisories.
- Runtime dependency advisories: PASS. Full and production runtime graphs report zero critical, high, moderate, and low advisories.
- Manifest-lock gate: PASS. The frozen manifest and lockfile gate accepts the reviewed exact dependency closure.
- Formal frozen installation is allowed only with the five exact `allowBuilds` entries and the gates listed above.
