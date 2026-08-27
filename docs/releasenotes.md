# Harness ComfyUI v0.31.1

v0.31.1 为 Agent 提供独立 linked worktree 的开发启动入口。Agent 使用 `pnpm worktree:start` 启动未发布源码时，系统使用预先配置的模型 provider 和 startup workspace，避免 Harness 再次要求选择模型、输入 DeepSeek API 密钥或选择 workspace 目录。

## 主要变更

- 新增 `worktree:start`、`worktree:stop`、`worktree:restart`、`worktree:status`、`worktree:health` 和 `worktree:logs` 六个命令。命令只接受 Git linked worktree，并复用生产进程管理器的生命周期、PID、端口、状态、健康和日志能力。
- 新增结构化开发定义 [`config/worktree-development.json`](https://github.com/fzfz/harness-comfyui/blob/v0.31.1/config/worktree-development.json)。该文件指定独立的 runtime ID、`.local/worktree-development/` 运行目录、开发 DSH Profile、主开发 worktree `.env` 路径和 startup workspace `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`。
- `worktree:start` 在开发 DSH home 的 `.env` 不存在时创建指向主开发 worktree `.env` 的符号链接。正确链接可以重复使用；普通文件或指向其他目标的链接会让启动明确失败。启动器只验证目标是可读普通文件，不读取、复制或记录 `.env` 内容。
- 新增 `comfyui-workbench-development` DSH Profile。该 Profile 把默认模型设为 `opencode-go/deepseek-v4-flash`，通过 `OPENCODE_GO_API_KEY` 引用读取 provider 凭据，并在 Host 暴露项目 Tool 和路由前注册配置的 startup workspace。
- Host Plugin 接受开发 Profile 传入的 startup workspace 路径，并通过 Harness Workspace Registry 的公共接口注册该目录。相同 workspace 重复启动后仍保持单条记录。
- [`AGENTS.md`](https://github.com/fzfz/harness-comfyui/blob/v0.31.1/AGENTS.md) 和 [`docs/agents/worktree-development.md`](https://github.com/fzfz/harness-comfyui/blob/v0.31.1/docs/agents/worktree-development.md) 规定 Agent 必须使用 `worktree:*` 验证独立 worktree、保持启动终端在前台、从第二个终端检查 status 与 health，并在任务结束前停止开发 Host。

## 生产隔离

- `prod:*` 继续使用 `.local/production/dsh-home` 和 `comfyui-workbench` Profile。生产入口不读取 `config/worktree-development.json`，不创建主开发 worktree `.env` 链接，也不注册开发 startup workspace。
- 开发运行目录和生产运行目录不共享 DSH home、settings、Workspace Registry、Session、Run Repository、Saved Media、进程状态或日志。
- 本版本没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。

## 验证

- 自动化测试覆盖 linked-worktree 门禁、开发定义字段、无效 `.env`、不可读 `.env`、错误符号链接、无效 workspace、开发 Profile 物化、startup workspace 注册、重复注册、受管状态恢复和生产入口隔离。
- worktree 测试使用自己的 linked-worktree 元数据和临时 workspace fixture，不依赖执行测试的 checkout 形态或开发者机器上的固定目录。
- 完整 `pnpm quality` 已通过：382 项 unit/integration、23 项 contract/security、40 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 独立 worktree 中的两次真实启动均通过 `worktree:status` 和 `worktree:health`。Harness Web 自动打开 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`，默认模型显示为 DeepSeek V4 Flash，没有出现 DeepSeek API 密钥设置弹窗或 workspace 目录选择框；第二次启动后 Workspace Registry 仍只有一条目标 workspace 记录。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
