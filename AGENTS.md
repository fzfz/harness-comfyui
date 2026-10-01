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

### 独立 worktree 官方 Desktop 开发与验收

- Agent 开始、测试、检查或停止独立官方 Desktop 实例前，必须读取 `docs/system/startup.md`、`docs/system/configuration.md`、`docs/system/testing.md` 和 `docs/agents/worktree-development.md`。
- Agent 使用 `pnpm test:desktop` 验收独立 worktree 的未发布插件；自动化命令构建当前候选包并通过官方 Desktop 完成安装、界面、生命周期和业务 E2E。
- `config/desktop-e2e.json` 是官方测试应用、隔离目录、端口、Profile patch 和证据格式的唯一结构化来源。
- Agent 需要交互调试时，按 `docs/agents/worktree-development.md` 调用官方 Desktop probe 的 `start --mode development`、`status --run-id` 和 `stop --run-id`；Agent 在测试结束前确认本轮进程和端口均已释放，用户明确要求保留实例供人工使用时按要求报告实例身份。
- Agent 保留 worktree 专属持久官方 Profile、user-data、Workspace 与插件数据。测试凭据只从配置声明的 main checkout `.env` 变量读取并传给当前应用进程。

### 生产来源与发布纪律

- Agent 在本仓库实现产品代码、测试、版本和发布文档，并从通过发布门禁的提交构建插件 tarball。
- `/Volumes/4Tdisk/work/AI2/harness-comfyui` 是开发、测试和发布准备 checkout；`/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` 是旧生产部署 checkout。Agent 在旧生产 checkout 中只进行只读诊断和获授权切换后的验证。
- 在独立 worktree 中，Agent 完成改动文件要求的独立审查，再对最终候选树运行 `pnpm quality` 和 `git diff --check`。全部检查通过后，Agent 在提交前保持候选树不变。
- Agent 推送发行提交并核对 `origin/main` 指向相同完整 SHA；按 `docs/system/releasing.md` 将该提交的插件 tarball 附加到对应 GitHub Release。
- 生产安装与旧环境退役按 `docs/system/releasing.md` 执行，并分别取得发布、合并、生产切换、历史迁移和旧环境处置所需授权。Agent 通过官方 Desktop 安装和验收插件版本，保留用户官方 Profile、凭据、插件数据，以及发布文件未管理的生产专属配置和运行时状态；Agent 必须在开发仓库完成源码、测试、包元数据和发布文档的修改。
- 生产故障要求在本仓库修复代码，并在部署版本需要变化时发布新的补丁版本。Agent 以正式 Release 附件和官方应用验收记录确认已部署版本。
