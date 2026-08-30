# Harness ComfyUI v0.36.2

v0.36.2 新增 `local-image-reader` Skill，用于读取用户提供的一张或多张本地图片。

## Skill 职责

- `local-image-reader` 从用户消息或当前消息图片附件取得本地图片绝对路径，并按输入顺序逐图调用 `image inspect --stdin`。
- Skill 保留重复路径；每个路径对应一次独立视觉模型请求和一项观察结果或错误结果。
- Skill 不查询 Generation Run，不接收 `run_id`，不读取 Generation Prompt，也不编写下一次生成使用的改进 Prompt。
- Harness“图片读取”设置中的当前命名配置继续提供视觉模型、读图 Prompt、`temperature`、最大输出 Token 和模型连接信息。Skill 每次调用只提交 `file_path`。

## CLI 参考文档

- Skill 自带的 `references/image-inspection-cli.md` 完整定义 `image inspect --stdin` 的调用环境、命令、stdin、输出、错误、重试、副作用和完整示例。
- `file_path` 必须是 Host 可读取的本地绝对路径，并指向符合 Host 图片大小上限的非空 PNG、JPEG、WebP 或 GIF 普通文件。
- CLI 使用 managed environment 提供的 endpoint 与 capability。Skill 不依赖系统注入的 Tool schema，也不区分视觉模型的连接实现。

## 全局 Skill 部署

- `.agents/skills/local-image-reader/` 是新 Skill 的 canonical source。
- 生产部署把 `$HOME/.agents/skills/local-image-reader` 配置为指向主开发 checkout canonical source 的绝对符号链接，不复制 Skill 文件，也不指向独立 linked worktree。
- 项目的全局 Skill 清单从五个增加为六个。

## 验证

- 完整 `pnpm quality` 通过：525 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试成功。
- 覆盖率为 statements 93.03%、branches 86.28%、functions 100%、lines 95.66%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- 独立语义 Reviewer 已确认 Skill 只接收本地图片路径、CLI 参考包含全部必备章节、输入和错误说明符合真实 `image inspect --stdin` 合同。
- 功能与版本提交 `0a2d75870a40d58bf16eb89ddf813d27afce84ba` 的 [GitHub CI](https://github.com/fzfz/harness-comfyui/actions/runs/33290106335) 已通过。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
