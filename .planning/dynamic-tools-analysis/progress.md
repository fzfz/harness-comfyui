# 当前进度

- 已实现 A=`harness-comfyui-schema-control` 与 B=`harness-comfyui-cli-candidate`。
- 已实现 managed CLI、shell capability、Host loopback route 和 SQLite identity 传递。
- 已把全局 `comfyui-generate` 改为主流程加两份 CLI 参考文档。
- 已完成 3 对真实兼容性模型 Session；A/B 均为 3/3 正确。
- 已完成 B 的完全相同 Generation Request 双 submit；两个独立 Bash Tool Call 产生不同 Run，两个远端 Run 均成功并各保存一个媒体文件。
- 已把全局 Skill 的提交语义改为允许同一个 Generation Request 多次独立提交，并通过 SQLite 的 `COUNT(DISTINCT request_json) = 1` 验证真实模型回归。
- 自动化分支测试和全量质量门禁已经通过。
- 独立 Standards、Spec 和语义复核均已通过；worktree Host 已停止并确认 PID 退出、端口释放；本地 Git 提交包含本文件。
