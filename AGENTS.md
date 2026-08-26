## Agent skills

### Issue tracker

Issues for this repo live in GitHub Issues and use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default five triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout. See `docs/agents/domain.md`.

### System docs

- For runtime commands or process behavior, read `docs/system/startup.md`.
- For configuration files, fields, precedence, or environment variables, read `docs/system/configuration.md`.
- For module boundaries or source exports, read `docs/system/architecture.md` and `docs/system/directory-structure.md`.
- For test selection or CI gates, read `docs/system/testing.md`.
- For version changes, release notes, tags, or GitHub Releases, read `docs/system/releasing.md`.
- For dependency or framework changes, read `docs/system/technology-stack.md`.

### Production source discipline

- Agents must implement bug fixes, features, tests, version changes, and release documentation in this repository.
- Agents must run the repository quality gates, commit and push the approved repository changes, wait for GitHub CI, publish the required version, and then deploy the final release commit to the production checkout.
- Agents may use a production checkout, including `harness-comfyui-prod-env`, for read-only diagnosis and post-deployment verification. Agents must not directly edit source code, tests, package metadata, or release documentation in a production checkout to implement or test a fix.
- Production deployment must update the production checkout from the final released Git commit. Agents must preserve production-only configuration and runtime state that the release commit does not own.
- A production failure requires a new repository fix and, when the deployed version must change, a new patch release. Agents must not use a hand-edited production checkout as a hotfix path or as evidence that an unreleased repository change has been deployed correctly.
