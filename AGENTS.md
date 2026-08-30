## Agent skills

### Issue tracker

Issues for this repo live in GitHub Issues and use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default five triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout. See `docs/agents/domain.md`.

### ComfyUI Workbench Preset and project Skills

Before an Agent creates or modifies the custom `ComfyUI工作台预设`, a project Skill, a global Skill link, or a Skill-owned CLI reference, the Agent must read and follow `docs/agents/comfyui-workbench-preset-and-skill-development.md`.

### System docs

- For runtime commands or process behavior, read `docs/system/startup.md`.
- For configuration files, fields, precedence, or environment variables, read `docs/system/configuration.md`.
- For module boundaries or source exports, read `docs/system/architecture.md` and `docs/system/directory-structure.md`.
- For test selection or CI gates, read `docs/system/testing.md`.
- For version changes, release notes, tags, or GitHub Releases, read `docs/system/releasing.md`.
- For dependency or framework changes, read `docs/system/technology-stack.md`.

### Independent worktree development verification

- Before an Agent starts Harness from an independent git worktree for implementation or UI verification, the Agent must read and follow `docs/agents/worktree-development.md`.
- The Agent must use `pnpm worktree:start`, `pnpm worktree:status`, `pnpm worktree:health`, `pnpm worktree:logs`, and `pnpm worktree:stop` for independent-worktree verification. The Agent must not use `pnpm prod:*` as a development startup path.
- The Agent must keep the `worktree:start` terminal in the foreground, verify `status` and `health` from a second terminal, and stop the development Host before completing or abandoning the task.
- The Agent must not copy `.env` contents into the independent worktree, commit a `.env` file, share a DSH home between worktrees, or modify the production checkout to test unreleased source.

### Production source discipline

- Agents must implement bug fixes, features, tests, version changes, and release documentation in this repository.
- Agents must run the repository quality gates, commit and push the approved repository changes, wait for GitHub CI, publish the required version, and then deploy the final release commit to the production checkout.
- Agents may use a production checkout, including `harness-comfyui-prod-env`, for read-only diagnosis and post-deployment verification. Agents must not directly edit source code, tests, package metadata, or release documentation in a production checkout to implement or test a fix.
- Production deployment must update the production checkout from the final released Git commit. Agents must preserve production-only configuration and runtime state that the release commit does not own.
- A production failure requires a new repository fix and, when the deployed version must change, a new patch release. Agents must not use a hand-edited production checkout as a hotfix path or as evidence that an unreleased repository change has been deployed correctly.
