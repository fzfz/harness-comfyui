# 动态 Tool 注入 A/B 实施计划

## 必须实现的目标

- 计划执行者必须在独立 worktree 中实现 A 与 B 两个项目 Preset。
- A 与 B 必须共用 `/Users/fzfz/.agents/skills/comfyui-generate` 和 managed project CLI。
- B 的模型请求不得包含 5 个 Host 项目 Tool schema。
- Host 必须从当前 shell Tool execution 提供 Generation Run 的 Workspace、Session、Turn 和 Call ID。
- 计划执行者必须使用 `opencode-go/deepseek-v4-flash` 执行真实配对模型调用，并从持久 Session JSONL 读取 Tool snapshot、usage、Tool calls 和结果。

## 执行状态

- [x] 创建独立 worktree并抓取文章。
- [x] 纠正 A/B 定义并删除错误的第三组设计。
- [x] 以 TDD 实现 A/B Preset、CLI contract、capability 和 Host route。
- [x] 更新并校验全局 Skill 的 CLI 参考文档。
- [x] 运行 3 对兼容性真实模型 Session。
- [x] 运行 B 的真实双 Generation submit、SQLite 身份核对和媒体展示核对。
- [x] 补齐全部新分支的自动化测试。
- [x] 运行全量质量门禁。
- [x] 完成独立 Standards、Spec 和语义复核。
- [x] 创建本地 Git 提交并停止 worktree Host。

## 验收清单

- [x] A 的请求包含 7 个 Tool schema，B 包含 2 个。
- [x] A/B 兼容性结果都是 3/3 正确。
- [x] B 实际读取参考文档并通过 CLI 调用 Catalog。
- [x] B 实际调用 Generation submit，数据库四个身份列与 Session JSONL 一致。
- [x] 同一个逐字段相同的 Generation Request 通过两个独立 Bash Tool Call 产生不同 Run，并成功保存媒体。
- [x] 所有自动化测试与 repository quality gate 通过。
- [x] 独立 Reviewer 没有未解决的代码、规格或语义问题；worktree Host 已停止并确认端口释放。

## 非本次目标

- 不实现 C。
- 不切换生产默认 Preset。
- 不删除 5 个 Host 项目 Tool。
- 不发布、不部署、不推送。

## 已获得的授权

- 用户授权独立 worktree 和独立队员。
- 用户授权实现 B，并在同一 worktree 执行 A。
- 用户授权使用 worktree `.env` 中的真实 Provider 与指定模型。
- 用户指定默认 Workspace 和 `/Users/fzfz/.agents/skills` 全局 Skill 根目录。
