# GitHub Actions artifact pipeline security assessment

本报告记录 2026-08-22 对本仓库使用的四个 GitHub 官方 Actions 及其固定版本的安全审计。审计范围只覆盖 workflow 中实际使用的 immutable commit、四个 Action 的 GitHub 元数据，以及 `actions/download-artifact` v4.3.0 的入口和运行时代码；本报告不把未逐行审计的默认分支或其他 tag 当作已验证对象。

```text
════════════════════════════════════
  REPOSITORY SECURITY ASSESSMENT
────────────────────────────────────
  Repository:    actions/checkout; actions/setup-node; actions/upload-artifact; actions/download-artifact
  URL:           https://github.com/actions/checkout
                 https://github.com/actions/setup-node
                 https://github.com/actions/upload-artifact
                 https://github.com/actions/download-artifact
  Stars / Forks: 8654 / 2754; 4941 / 1711; 4167 / 1086; 1883 / 725
  Created:       2019-07-19; 2019-05-30; 2019-06-18; 2019-06-18
  Last Commit:   本次审计锁定的 tag commit 见下表；默认分支未作为执行来源
  Contributors:  60; 120; 49; 37（GitHub contributors API，含匿名贡献者）
  License:       MIT（四个仓库）
  Trust Tier:    1 — GitHub actions 官方组织；仍以 commit verification 和本地代码审计建立信任
────────────────────────────────────
  SCOPE
  Language:      GitHub Actions YAML；TypeScript/JavaScript runtime
  Purpose:       在 CI/CD 中 checkout 源码、配置 Node、上传和下载同一 workflow run 的构建 artifact
  Files Audited: 四个 action.yml 元数据和固定 commit；download-artifact v4.3.0 的 action.yml、package.json、src/**、dist/index.js 入口及 artifact 下载路径
────────────────────────────────────
  IMMUTABLE REFERENCES
  Action                 Tag       Commit                                      Verified
  actions/checkout       v4.4.0    11d5960a326750d5838078e36cf38b85af677262  true / valid
  actions/setup-node     v4.4.0    49933ea5288caeca8642d1e84afbd3f7d6820020  true / valid
  actions/upload-artifact v4.6.2   ea165f8d65b6e75b540449e92b4886f43607fa02  true / valid
  actions/download-artifact v4.3.0 d3f86a106a0bac45b974a628896c90dbdf5c8093  true / valid
────────────────────────────────────
  SECURITY FINDINGS
  • ACT-01 MEDIUM — download-artifact writes and extracts the selected artifact into the workflow destination directory.
    This is the documented purpose of the Action and is constrained here by the named artifact, read-only Actions permission,
    and the product-level qualification checks. It remains an execution-boundary risk because the extracted files are later consumed by CI.
  • ACT-02 LOW — download-artifact reports an artifact digest mismatch as a warning after extraction rather than failing the Action.
    The product pipeline does not rely on that warning: artifact-qualification.mjs independently verifies tarball byteLength and SHA-256
    after relocation and validate fails closed on the expected version, commit, run ID, SHA-256, and qualification record.
  No install hook, child_process execution, eval, persistence mechanism, browser-cookie access, or credential collection was found in
  the audited download-artifact entrypoint/runtime path. No finding was established against the other three official Action references
  from their immutable commit metadata and declared action inputs in this scoped review.
────────────────────────────────────
  ARCHITECTURE ASSESSMENT
  Authentication:  download-artifact reads the optional explicit `github-token` input only when cross-run or cross-repository access is needed;
                  the Release Preview workflow passes `${{ github.token }}` for the qualified artifact run.
  Authorization:   workflow permissions are limited to `contents: read` for CI/qualification and `actions: read` plus `contents: read` for Release Preview.
  Data flow:       candidate tarball and manifest are uploaded by upload-artifact; consumers download the named candidate, extract into the checkout,
                   relocate the manifest, and execute product gates. The final qualified artifact is downloaded by Release Preview and validated before preview.
  Secret mgmt:     no repository secret is referenced by these Action steps; the GitHub-provided token is passed only to the cross-run download input.
  Dependencies:    the audited Action resolves its bundled `dist/index.js`; no installation is performed by the workflow Action at runtime.
  Update mechanism: workflow references are pinned to the four exact commit SHAs above; mutable `@v4` references are rejected by
                    `tests/contract/workflows.test.ts`.
────────────────────────────────────
  RISK:     🟡 MEDIUM
  VERDICT:  ✅ ACCEPTABLE ONLY WITH IMMUTABLE SHAs AND PRODUCT-LEVEL FAIL-CLOSED ARTIFACT VALIDATION
────────────────────────────────────
  NOTES
  `actions/download-artifact` v4.3.0 declares `runs.using: node20` and `runs.main: dist/index.js`.
  Its inputs are `name`, `artifact-ids`, `path`, `pattern`, `merge-multiple`, `github-token`, `repository`, and `run-id`;
  all are optional in action.yml, while the explicit token is required by the Action for a different repository or workflow run.
  The runtime calls the GitHub Actions artifact API, follows the returned blob URL, computes the downloaded archive digest, and extracts into
  the requested directory. The workflow limits this to `quality-candidate` or `quality-qualified` and subsequently applies the local
  artifact manifest's byte-length and SHA-256 checks.
════════════════════════════════════
```

审计证据：GitHub repository metadata、tag ref 与 commit verification 均通过 GitHub API / `git ls-remote` 核对；四个锁定 commit 的 verification 为 `true` 且 reason 为 `valid`。`actions/download-artifact` v4.3.0 的 `action.yml`、`src/download-artifact.ts`、`dist/index.js` 和 `package.json` 来自该精确 commit 的本地审计副本。
