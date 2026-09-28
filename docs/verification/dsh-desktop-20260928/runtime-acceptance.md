# Desktop 2.0.15 与 DSH 0.1.7-rc.2 隔离验收记录

## 版本与启动

实施 Agent 在独立 worktree 中使用 `config/desktop-baseline.json` 指定的 fork 提交 `b912b85411f5b06b748a7e9216323c1e1ea3b302`。fork 的 Stable workspace 固定 Desktop 2.0.15、DSH 0.1.7-rc.2 和 Electron 44.0.0；[依赖安装审计](desktop-install-audit.md)记录锁文件身份、补丁及构建结果。

实施 Agent 使用 `pnpm dev:start` 启动隔离 Desktop。当前成功运行的 `runId` 为 `0dd572e5-9bb2-415b-be98-a05fca5b6c7c`；`.local/desktop-development/user-data/lifecycle-events/startup.jsonl` 中该运行的 `renderer.boot.completed` 记录 `rendererStatus: healthy`，`startup.run.completed` 记录 `finalStage: health-commit`。启动时确认进程组主进程 PID 78609、监听端口 `127.0.0.1:57040` 和 `127.0.0.1:51854`；Desktop Profile 的 `node_modules/harness-comfyui` 指向当前 worktree 的 `.local/desktop-development/managed-plugins/harness-comfyui`。验收后执行 `pnpm dev:stop`，再次运行 `pnpm dev:status` 返回 `{"status":"stopped"}`。

## 隔离迁移演练

`tests/production/desktop-session-migration.test.mjs` 使用隔离目录中的旧 Session、Attachment、投影索引及 Workspace Session 关系，检查首次迁移后目标文件可读、源文件保持原值，并检查重复迁移保留目标记录。`tests/production/desktop-development-settings.test.mjs` 使用隔离 `settings.yaml` 和 Profile patch，检查 Desktop、数据源、图片读取配置与凭据的迁移、原文件归档、重复启动保留已保存值，以及缺失或冲突文件的拒绝分支。`tests/production/source-agent-preset.test.mjs` 检查两个受管 Preset 的文件物化、Profile 声明和重复执行结果；`tests/production/cli-runtime.test.mjs` 检查纯 CLI 启动准备调用同一声明生成器。

本次定向运行的 `cli-runtime.test.mjs`、`source-production.test.mjs` 和 `source-agent-preset.test.mjs` 共 133 项测试通过；后续修改 Workspace 错误文案后，`source-agent-preset.test.mjs` 的 102 项测试通过。最终候选的 `pnpm quality` 已通过，包括 manifest 与锁文件检查、依赖公告与构建脚本审计、Harness 边界检查、类型检查、覆盖率、合同测试、生产测试、原型测试和 Desktop 测试。Desktop 测试的 3 个文件、4 项测试全部通过。

`tests/desktop/desktop-live.test.mjs` 在 Desktop 2.0.15 中验证了会话删除、Provider 推理等级保存及 Profile 文件持久化、Session 运行发现、图片读取配置保存与切换，以及媒体操作。测试按新版 AccountMenu 打开设置页；当 Provider 编辑页报告配置版本冲突时，测试按界面提示关闭并重新打开后重试一次。图片读取配置切换使设置页重新挂载时，测试重新进入设置页核对当前配置。

## 待完成的运行验收

实施 Agent 取得真实模型调用授权后，须在运行前选定一个用户自建 Preset，并在本文件记录该 Preset 的 ID。实施 Agent 须在隔离 Desktop 中分别从默认工作台、显式选择 `harness-comfyui-cli-candidate` 的工作台、`harness-comfyui-iteration` 工作台和该用户自建 Preset 工作台发送模型请求。实施 Agent 须在本文件记录每次请求、响应、Session ID、所选 Preset、Workspace 路径和失败原因；四个 Session 均收到与请求对应的模型响应，且 Skill 列表符合[产品 Preset 规范](../../agents/comfyui-workbench-preset-and-skill-development.md)时，工作台验收通过。

实施 Agent 须在 `harness-comfyui-cli-candidate` 的同一 Session 中续派子 Agent，并在本文件记录子 Agent 的请求、响应、Session ID 和 Workspace 路径。子 Agent 的响应归属该 Session 及其 Workspace 时，续派验收通过。实施 Agent 须在前台执行受管 CLI 请求，并在本文件记录命令、退出码、响应、Session ID 和 Workspace 路径；退出码为零且响应归属所选 Session 和 Workspace 时，CLI 验收通过。工作台、续派和 CLI 三项验收均通过后，真实模型验收完成。

隔离测试和 Desktop 界面测试已经覆盖设置页、Catalog、Generation、ImageReader Remote、上下文插入和结果页的功能路径；这些测试不替代真实模型会话验收。fork 提交推送、发布和生产部署依照[升级计划](../../plans/dsh-desktop-20260928.md)的后续授权执行。
