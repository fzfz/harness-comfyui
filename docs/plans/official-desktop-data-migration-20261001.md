# 本机官方 Desktop 历史数据迁移

本计划定义旧生产数据进入本机官方 Desktop 的对象、映射、验证和执行边界。插件实现与发布继续使用[官方 Desktop 插件升级方案](official-desktop-plugin-20260929.md)，下文称为“主方案”。

## 必须要实现的目标

迁移执行者从 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env/.local/desktop-production/` 迁移历史 Session、Workspace、Run、媒体和 Workflow 文件。目标 DSH home 为 `/Users/fzfz/.dsh`，插件数据库路径为 `data/plugins/harness-comfyui/runs.sqlite`，Run、媒体和 API Workflow 缓存分别进入同一插件目录的 `runs/`、`media/` 和 `api-workflow-cache/`。

执行者保留旧 Workspace ID 和绝对路径，把旧生产目录内的 `home/harness/sessions/`、`home/harness/attachments/` 和 `home/harness/storages/session_projcache/` 分别合并到目标 DSH home 内的 `sessions/`、`attachments/` 和 `storages/session_projcache/`，把旧 `home/harness/storages/workspace.json` 的两个 Workspace 记录并入目标 `storages/workspace.json`。同名文件字节相同且归属一致时，执行者保留目标文件；发现不同内容或身份冲突时，执行者记录具体对象并停止相关导入，向用户提交冲突处理选择。

执行者先在私有目录 `.local/desktop-e2e/production-migration-20261001/trial-environment/dsh-home/` 完成试迁移和官方运行时验证。正式导入前，执行者等待日常 Desktop 活动任务结束，完全退出应用，并创建目标 home 的离线备份。执行者保留当前官方 Profile、Provider、默认模型、凭据和其他插件配置；执行者把旧 `home/harness/.credentials.yaml`、旧 home 和正式目标离线备份保存到当前 worktree 的私有证据目录 `.local/desktop-e2e/production-migration-20261001/`。执行者按[用户指南的“配置模型与插件设置”章](../user/install-update.md#配置模型与插件设置)，通过官方设置服务配置数据源、图片读取和 Workflow 浏览器；执行者按该指南“更新前备份”章核对 `harness-comfyui-image-reader.config.credentialRefs` 中配置 ID 与凭据引用名称的对应关系，并通过官方凭据服务保存新引用。

## 验收清单

- 执行者核对迁移前后 1,627 条 Run 的状态、1,462 个媒体文件、4,803 个 Run 文件引用及两个 Workspace ID；核对 SQLite 完整性、外键和文件路径。
- 执行者通过官方运行时读取导入 Session、Workspace、历史 Run 和媒体，核对会话与工作区归属；通过界面查看媒体，并核对 Workflow 文件读取。
- 执行者核对正式目标中的既有会话、插件和模型设置保留，再按主方案执行正式发行包的生产真实验收。试迁移文件检查通过只表示文件与数据库完整。
- 执行者把逐项结论保存到 `docs/verification/official-desktop-plugin/`；完整会话、请求、数据库、媒体和凭据备份保存在私有证据目录。

## 非本次目标

本次迁移保留旧生产 checkout 与原运行数据。旧环境归档和物理删除继续按主方案取得单独授权。官方宿主会话删除选择器及删除恢复不属于迁移实施或验收对象。

## 已获得的授权

用户于 2026-10-01 明确批准旧生产目录数据迁移、官方 Desktop 插件安装及验收，并同时批准创建 PR、合入 `origin/main` 和发布版本。授权原文及版本候选保存在[授权记录](../verification/official-desktop-plugin/release-migration-authorization-20261001.json)。执行者按“必须要实现的目标”章中的试迁移与正式导入条件执行，并继续遵守主方案的发布及生产验收条件。
