# 独立 worktree 开发验证流程

## 适用范围

Agent 在独立 git worktree 中修改源码，并且需要启动真实 Harness Host 验证界面或运行行为时，必须使用本流程。`pnpm worktree:*` 只接受 linked worktree；主 worktree 和生产 checkout 的 `.git` 是目录，命令会在创建运行目录前拒绝这两种 checkout。

## 启动前检查

1. Agent 必须确认当前目录是本次开发的独立 worktree，并确认根目录 `.git` 是 linked-worktree 元数据文件。
2. Agent 必须读取 `config/worktree-development.json`，确认 `userEnvironmentFilePath` 指向主开发 worktree `.env`，确认 `startupWorkspacePath` 精确等于 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`。Agent 不得读取、复制或输出 `.env` 的密钥值。
3. Agent 必须确认 `userEnvironmentFilePath` 是可读普通文件，确认 `startupWorkspacePath` 是可读目录。
4. 当前 worktree 缺少依赖时，Agent 必须先按照仓库依赖安全规则审核 `package.json` 与 lockfile，再执行仓库规定的固定版本依赖准备命令。开发启动命令不会自动安装依赖。

## 启动与验收

Agent 必须在当前独立 worktree 根目录以前台方式启动 Host，并保持该终端运行：

```sh
pnpm worktree:start
```

Agent 必须在第二个终端执行：

```sh
pnpm worktree:status
pnpm worktree:health
```

`status` 必须返回 `running`，`health` 必须返回 `passed`。Agent 随后必须打开 `http://127.0.0.1:4173`，确认系统直接使用 `opencode-go/deepseek-v4-flash`，没有显示 DeepSeek API 密钥设置界面，并确认系统直接打开 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`，没有显示 workspace 目录选择界面。该验收不得发送真实模型请求，除非当前任务明确要求模型调用。

启动失败时，Agent 必须执行 `pnpm worktree:logs` 并依据明确错误修正配置、依赖或端口问题。Agent 不得改用 `pnpm prod:start` 绕过失败。

## 结束条件

Agent 完成验证或决定停止验证时，必须在第二个终端执行：

```sh
pnpm worktree:stop
```

Agent 必须确认 `pnpm worktree:status` 返回 `stopped`，然后才能完成或放弃当前任务。开发运行状态只允许位于当前 worktree 的 `.local/worktree-development/`；Agent 不得修改生产 DSH home、生产 Profile、生产 `.env` 或生产 checkout。
