# B 候选 Preset 后续计划

## 必须实现的目标

当前 worktree 只交付 A/B 候选和证据。后续计划执行者如需把 B 设为生产默认值，必须先取得新的用户授权，并在最终 release commit 上完成本文件定义的配对任务、Client 展示、回退和 CI 门禁。

发布候选配对任务固定为 12 对 A/B Session：4 对模板与生成模型兼容性核对、4 对单次 Generation submit、4 对完全相同 Generation Request 的双 submit。每一对必须使用相同 Workspace、全局 Skill、Provider、Model、用户 Prompt 和目录上下文；唯一变量是 A 是否暴露 5 个 Host 项目 Tool schema。

计划执行者必须把每个 Session ID、request header Tool 名称、最终回答、CLI Tool Call、Run、媒体、总输入 token、输出 token 和耗时写入 `.planning/dynamic-tools-analysis/production-candidate-evidence.md`。B 的 12 个 Session 必须全部满足任务结果；A/B 任一行为结果不一致、B 任一 Generation Run 未成功、B 任一预期媒体未保存、B 任一请求出现 Host 项目 Tool schema，均判定 NO-GO。Token 与耗时只作为描述性指标，不覆盖行为失败。

## 验收清单

- 当前实现必须保持生产默认 Preset 不变。
- Host 必须继续注册现有 5 个项目 Tool，使 A 和旧 Session 仍可工作。
- B 必须继续只向模型暴露 shell 与 Skill Tool。
- 全局 `comfyui-generate` 必须保留 CLI 参考文档和多次独立 submit 语义。
- 发布前必须在最终 release commit 上再次验证成功 Run、多个独立 submit 和 Client 媒体展示。
- 计划执行者必须先把生产默认切到 B，再创建一个新 Session 验证其 request header 只含 `bash` 与 `skill`；随后恢复发布前默认值并创建另一个新 Session 验证原默认 Preset 恢复。任一步失败均判定 NO-GO。
- 最终 release commit 的 repository quality gate 与 GitHub CI 必须全部通过。

## 非本次目标

- 当前任务不创建 release、不更新版本、不部署生产 checkout。
- 当前任务不删除 A、5 个项目 Tool 或现有 Tool adapters。
- 当前任务不设计第三组方案。

## 已获得的授权

当前授权仅覆盖独立 worktree 实现、测试、真实模型调用和本地提交。没有生产默认切换、发布、部署或删除旧 Interface 的授权。
