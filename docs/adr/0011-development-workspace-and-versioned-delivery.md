---
status: accepted
---

# Development Workspace and versioned delivery

当前目录是 Development Workspace。GitHub Actions CI 对拉取请求与主分支提交调用仓库统一质量命令；PR、main 和 release workflow 在 frozen install 前执行同一个 lockfile dependency advisory gate。release workflow 从显式 SemVer 与精确主分支提交构建一次 Release Artifact，并使用隔离 release-smoke 配置和数据完成干净安装验证。CD 只晋级该已验证 Release Artifact，不在部署阶段重新构建。Production Installation 把不可变版本化应用与共享 production 配置、Run Repository、Saved Media 和日志分离；候选版本启动或健康检查失败时恢复上一 Active Release，不回滚或删除持久运行数据。Configuration Profile 使用一个结构 schema，运行时可调值保存在结构化配置而不是 schema 中。Configuration Profile 不包含 ComfyUI Instance Authorization 的运行值；Source Operation 返回该凭据后，Host 只在进程内使用该凭据连接对应 ComfyUI 实例。Host 自身需要的其他 production-only credential 才通过部署环境 secret 注入。任一质量、安全、版本、包内容或 smoke 门禁失败时不得创建 Git tag、GitHub Release 或生产部署。发布批准与 Deployment Approval 是两个独立用户确认；Deployment Approval 必须绑定 Release Artifact 和目标 production 环境，发布批准或通用 environment approver 不能替代该确认。
