---
status: accepted
---

# Development Workspace and versioned delivery

每张 Issue 在自己的 Git worktree 中执行。Ticket 01 一次性交付 `harness-comfyui` 产品管理 CLI；该 CLI 负责 install、preflight、start、stop、restart、status、health、logs、upgrade 和 rollback。Tickets 02–13 必须在自己的 worktree 中使用 `production` Configuration Profile，通过同一 CLI 把当前 tarball 安装到 `runtime/production/` 并启动真实 Host/Client，不得创建 development 专用启动或进程管理实现。Ticket 14 只读取 Ticket 13 的 Release Preview、验收证据和同一 Release Artifact。GitHub Actions CI 对拉取请求与主分支提交调用仓库统一质量命令；PR、main 和 release workflow 在 frozen install 前执行同一个 lockfile dependency advisory gate。release workflow 从显式 SemVer 与精确主分支提交构建一次 Release Artifact；clean checkout、composition、e2e 和 release-smoke 执行 artifact 自动化门禁，Ticket 13 worktree 的 `runtime/production/` installation 和当前本地浏览器执行产品生命周期及`1440×1000`桌面人工1:1验收。Release Approval 只授权创建 Git tag、推送该 tag 和创建 GitHub Release。Release Artifact 必须包含产品管理 CLI、profile helpers、profile templates 和 installation-local Harness runtime manifest/lock/workspace；GitHub Release 创建成功后，用户自行决定 installation root 并运行该 CLI。本项目负责实现、测试和发布 CLI，不替用户执行或维护版本发布后的 installation。任一质量、安全、版本、包内容、产品生命周期、smoke 或独立 1:1 门禁失败时不得创建 Git tag 或 GitHub Release。
