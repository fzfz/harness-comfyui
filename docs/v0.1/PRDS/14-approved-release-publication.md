# PRD 14：发布已验收版本供用户自行安装

## 关联 Ticket

Ticket 14 — 发布已验收的 GitHub Release 供用户自行安装。

## Harness 核心零改动与公共接口

本 Ticket 不修改代码、不重新 build、不重新 pack、不创建 installation，也不调用 Harness lifecycle。发布负责人只发布 Ticket 13 已证明完全通过 public plugin seams 实现的同一 Release Artifact；任何代码、依赖、package内容或 Harness boundary证据变化都会使 Release Approval失效。

## 操作员任务

发布负责人取得用户对 Release Preview 的明确批准后，只把 Ticket 13 在其 Git worktree 的 `runtime/production/` installation 完成产品生命周期与 1:1 验收的同一 Release Artifact 创建为 Git tag 和 GitHub Release，供用户自行下载和安装。GitHub Release 创建成功后，本项目的交付流程结束。

## 唯一批准边界

Release Approval 必须绑定 SemVer、精确 commit、`.release/quality/artifact.json`、tarball 文件名、byte length、SHA-256、Ticket 13 的自动化门禁结果、`1440×1000`桌面独立1:1 PASS证据和 release notes。任一绑定对象变化会使批准失效并要求新的 Release Preview。

Release Approval 只授权创建 Git tag、推送该 tag 和创建 GitHub Release。它不授权本项目在任何用户环境中安装、启动、停止、部署、激活、检查、写入或回滚该版本。

## v0.82.2 Source 合同记录

GitHub Release notes 必须记录 Harness 消费合同为 `config/source-contract-v0.82.2.json`，Installation pin 为 `source.contractId: "imagegen-source-contract"`、`source.sourceReleaseVersion: "0.82.2"`。Release notes 不得声称 live discovery 返回这些 pin 字段；必须说明 Catalog discovery 是裸 OpenAPI 3.1 对象、Source discovery 是分页 envelope，CLI 业务 Schema 由 Harness adapter 校验，`expected_output_node_ids_json` 为空时模板生成失败关闭。

## 发布内容

- 发布 workflow 必须直接附加 Ticket 13 的现有 tarball，不重新 build 或 pack。
- Git tag、GitHub Release 标题、release notes、artifact package version 和 manifest version 必须使用同一 SemVer。
- GitHub Release 必须记录精确 commit、artifact SHA-256、byte length、Source Contract Identity 要求、Configuration Profile 字段说明、兼容的 Node/pnpm/DeepSeek Harness 版本、`harness-comfyui` CLI 安装与启动入口、已知限制和用户自行安装入口。附件中的同一 tarball 必须保留 Ticket 13 已验收的 deploy modules、profile helpers、profile templates 和精确锁定的 `deployment/runtime/` manifest/lock/workspace。
- GitHub Release 不得包含运行数据、Saved Media、日志、凭据、fixture、`prototype/` 或第二份重新打包的 artifact。

## 原型 1:1 发布门禁

本 Ticket 不重新运行或重新解释 UI 验收。发布负责人必须核对待发布 tarball SHA-256 与 Ticket 13 在其 Git worktree 的 `runtime/production/` installation 完成产品生命周期和`1440×1000`桌面1:1验收的 tarball SHA-256 完全一致；任一 identity 不一致都阻止发布。Ticket 13 的独立视觉审核者必须不是 Ticket 13 的实现者，其 PASS 证据必须随 Release Preview 可读取。

## 失败行为

- Release Approval 缺失、过期或 identity 不匹配时，不创建 tag、不推送 tag、不创建 GitHub Release。
- tag 已存在但 commit、SemVer 或 artifact identity 不一致时停止，不移动或覆盖 tag。
- GitHub Release 创建失败时保存失败阶段；不得转而执行安装或环境操作。

## 产品验收

1. Git tag 指向 Release Approval 绑定的精确 commit。
2. GitHub Release 只附加 Ticket 13 manifest 指向的同一 tarball；SHA-256 与 byte length 完全一致。
3. Release Preview 中的`1440×1000`桌面1:1 PASS证据、自动化门禁结果和release notes均可读取。
4. GitHub Release tarball 包含 Ticket 13 已验收的 `harness-comfyui` CLI、四个 Configuration Profile、全部 deploy modules、两个 profile helpers、三个 profile templates 和三个 `deployment/runtime/` 结构化文件。
5. GitHub Release 创建后没有替用户执行安装、启动、停止、连接、读写或回滚动作。

## 不属于本 Ticket

用户下载 GitHub Release 后的安装、配置、启动、升级、数据迁移和回滚全部由用户自行决定和执行，不属于本项目 Ticket。
