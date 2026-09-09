## Repository instructions for Agents

### Issue tracker

Agents must manage this repository's issues in GitHub Issues by using the `gh` CLI. Before managing issues, Agents must read `docs/agents/issue-tracker.md`.

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
- For test selection or local release gates, read `docs/system/testing.md`.
- For version changes, release notes, tags, or GitHub Releases, read `docs/system/releasing.md`.
- For dependency or framework changes, read `docs/system/technology-stack.md`.

### Independent worktree development verification

- Before starting, testing, inspecting, or stopping an independent Desktop instance, Agents must read and follow `docs/agents/worktree-development.md`.
- Agents must use `pnpm dev:start`, `dev:status`, `dev:logs`, and `dev:stop`; `prod:*` and `web:*` do not replace independent Desktop verification.
- `config/desktop-baseline.json` defines the sole Desktop baseline. Agents must verify the selected workspace and installed package versions before testing.
- Agents must verify the current process group's identity and listening ports. Startup acceptance requires the current run's healthy Renderer completion and the expected plugin installation; a listening port alone is insufficient.
- `dev:start` prepares the worktree dependency view and `.env` link. Agents must not run `pnpm install` in the worktree or copy `.env` contents.
- Agents must stop the test instance before finishing unless the user explicitly asks to keep it running for manual use.

### Production source discipline

- `/Volumes/4Tdisk/work/AI2/harness-comfyui` is the development, testing, and deployment-preparation checkout.
- `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` is the production deployment checkout.
- Agents must implement bug fixes, features, tests, version changes, and release documentation in this repository.
- In an independent worktree, Agents must complete every independent review required by the documentation linked in the preceding sections for the changed files. Agents must then run `pnpm quality` and `git diff --check` against the final candidate tree. After every required review and both commands pass, Agents must not modify any file in that tree before committing it.
- Agents must push the final release commit, verify that `origin/main` resolves to the same full commit SHA, publish the required version from that commit, and then deploy that release commit to the production checkout.
- Agents may use `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` for read-only diagnosis and post-deployment verification. Agents must not directly edit source code, tests, package metadata, or release documentation in the production deployment checkout to implement or test a fix.
- Agents must preserve production-only configuration files and runtime-state files that are not tracked by the final release commit when updating the production checkout.
- A production failure requires a new repository fix and, when the deployed version must change, a new patch release. Agents must not use a hand-edited production checkout as a hotfix path or as evidence that an unreleased repository change has been deployed correctly.
