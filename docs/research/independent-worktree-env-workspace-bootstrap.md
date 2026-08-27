# 独立 worktree 的模型环境与默认 workspace 启动调研

## 结论摘要

独立 worktree 不能自动继承主开发 worktree 的 `.env`、DSH settings 或 Workspace Registry。系统首次启动时出现 DeepSeek API 密钥设置界面和 workspace 目录选择界面，分别由以下三项状态缺失造成：

1. Harness 启动环境无法读取主开发 worktree `.env` 中的 `OPENCODE_GO_API_KEY`。
2. 新 DSH home 没有声明 `opencode-go/deepseek-v4-flash` 默认模型与凭据引用。
3. 新 DSH home 的 Workspace Registry 没有 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness` 记录。

最终方案使用独立 `pnpm worktree:*` 命令和独立 `comfyui-workbench-development` Profile。该方案不会改变 `pnpm prod:*` 的生产 DSH home、生产 Profile、生产凭据来源或生产 workspace。

## 已确认的 Harness 行为

### 环境文件

Harness `0.1.1-rc.2` 在启动时读取 invocation cwd `.env` 与 `$DSH_HOME/.env`，不搜索其他 worktree，也不会在用户选择 workspace 后重新加载环境文件。凭据优先级是继承进程环境、受管凭据、invocation cwd `.env`、`$DSH_HOME/.env`。

主开发 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui/.env` 声明 `OPENCODE_GO_API_KEY`。本次调研和实现没有读取或输出变量值。

### 模型路由

Harness base Profile 默认使用 `deepseek-official/deepseek-v4-flash` 与 `DEEPSEEK_API_KEY`。新 DSH home 没有其他可用 provider 时，Models onboarding 会显示 DeepSeek API 密钥设置界面。

本机锁定的 `@earendil-works/pi-ai@0.82.1` catalog 包含 `opencode-go` provider 与 `deepseek-v4-flash` model。该 provider 的 ambient 变量名是 `OPENCODE_API_KEY`，与主开发 `.env` 的变量名不同，因此开发 Profile 必须显式声明：

```yaml
- id: agent-default-model
  config:
    provider: opencode-go
    model: deepseek-v4-flash

- id: llm-pi-ai
  config:
    providers:
      opencode-go:
        apiKeyEnv: OPENCODE_GO_API_KEY
```

`apiKeyEnv` 只保存变量名；Harness 在请求时通过凭据服务解析实际值。

### Workspace Registry

Workspace Picker 读取当前 DSH home 的持久 Workspace Registry。公开的 `ctx.workspaceRegistry.create(path, title?)` 会使用 `fs.realpath` 验证目录，对同一规范路径保持幂等，并等待持久化完成。

Host 插件必须在注册项目 Tool、HTTP 路由和 Generation coordinator 之前等待 `workspaceRegistry.create()`。注册失败必须终止 Host 激活，不能继续进入目录选择界面。

## 最终设计

### 独立开发入口

开发 Agent 在 linked worktree 中使用以下命令：

```sh
pnpm worktree:start
pnpm worktree:status
pnpm worktree:health
pnpm worktree:logs
pnpm worktree:stop
```

`scripts/worktree/cli.mjs` 只负责 worktree 命令接口；六个命令复用 `scripts/production/cli.mjs` 的进程生命周期。`scripts/worktree/runtime.mjs` 要求当前根目录 `.git` 是 linked-worktree 元数据文件，因此主 worktree 和普通生产 checkout 会在任何开发 DSH home 写入前被拒绝。

### 结构化开发配置

`config/worktree-development.json` 是以下开发启动值的唯一来源：

- runtime ID 与 `.local/worktree-development` runtime root。
- `config/source-production.json` 的引用；Source CLI、Catalog port、Configuration Profile 和日志参数不复制。
- `comfyui-workbench-development` Profile 名称。
- `/Volumes/4Tdisk/work/AI2/harness-comfyui/.env` 用户环境文件。
- `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness` startup workspace。

开发 loader 验证 `.env` 是可读普通文件，验证 workspace 是可读且可进入的目录。loader 不读取 `.env` 内容。

### 开发 DSH home

Profile 物化器只在 `.local/worktree-development/dsh-home/.env` 创建指向主开发 worktree `.env` 的符号链接：

```text
<linked-worktree>/.local/worktree-development/dsh-home/.env
  -> /Volumes/4Tdisk/work/AI2/harness-comfyui/.env
```

正确链接重复启动时保持幂等。目标缺失、不是普通文件、不可读，或者 DSH home `.env` 是普通文件或错误链接时，启动明确失败。物化器不会删除或覆盖冲突路径，也不会读取、复制、记录或返回密钥文本。

每个 worktree 继续拥有独立的 DSH home、settings、受管凭据、Workspace Registry、Session 和日志。

### 开发 Profile

`profiles/comfyui-workbench-development/cordis.patch.yml` 只覆盖三项开发配置：

- Host 插件的 Configuration Profile 与 startup workspace 环境引用。
- `opencode-go/deepseek-v4-flash` 默认模型。
- `OPENCODE_GO_API_KEY` 凭据引用。

生产 `profiles/comfyui-workbench/cordis.patch.yml` 继续是空 patch。安全门禁精确固定两个 Profile 的内容，拒绝 provider、model、凭据引用、Host 配置或额外插件漂移。

## 生产影响判断

该方案不会使生产部署读取主开发 worktree `.env`，原因如下：

- `pnpm prod:*` 不读取 `config/worktree-development.json`。
- 生产 runtime root 继续是 `.local/production`，生产 DSH home 继续是 `.local/production/dsh-home`。
- 生产命令继续使用 `comfyui-workbench` Profile，该 Profile 不声明开发模型或 startup workspace。
- 生产 Profile 物化调用不传 `userEnvironmentFilePath`，因此不会创建生产 `$DSH_HOME/.env` 链接。
- worktree 命令和生产命令使用不同的 managed-state 文件。
- Host 插件只在 Profile 显式提供 `startupWorkspacePath` 时注册 workspace；生产 Profile 不提供该字段。

生产共享生命周期模块只增加显式 Profile 与可选 startup workspace 参数。自动化测试同时验证生产 Profile 名称、生产 DSH home、生产 `.env` 不存在和生产 Profile 空 patch。

## 验收清单

- [x] worktree 配置解析拒绝未知字段、错误 schema、逃逸 runtime root、绝对 Source 定义、相对 `.env`、相对 workspace 和非法 Profile 名称。
- [x] worktree loader 拒绝普通 checkout、缺失或非普通 `.env`、缺失或非目录 workspace。
- [x] Profile 物化器覆盖链接创建、正确链接幂等、既有普通文件、错误链接、缺失目标与目录目标。
- [x] 开发 Profile 精确声明默认模型、凭据引用和 startup workspace 环境引用，且不包含密钥值或 Skill 插件。
- [x] Host 插件覆盖 workspace 注册成功、注册失败、生产不注册与空路径拒绝。
- [x] 生产生命周期测试证明现有六个命令继续运行，并使用生产 Profile 空 patch。
- [x] 在真实 `pnpm worktree:start` 进程中验证 `status=running`、`health=passed`、Web 不显示两个选择界面，并执行 `pnpm worktree:stop`。
- [x] 重复真实启动后，Workspace Registry 仍只有一条目标 workspace 记录，`.env` 链接保持幂等。
- [x] 完整 `pnpm quality` 通过。

## 非本次目标

- 不共享整个主开发 worktree DSH home。
- 不复制或直接修改 `settings.yaml`、`.credentials.yaml`、Workspace Registry 存储文件或 Session JSONL。
- 不把 DSH invocation cwd 改为目标 workspace。
- 不新增依赖包，不修改 lockfile，不下载或运行外部程序。
- 不提交、不推送、不发布、不部署；这些状态变更需要用户另行授权。

## 已获得的授权

- 用户已授权创建独立 git worktree 并调研该启动问题。
- 用户已授权在独立 worktree 创建开发启动流程并修改仓库 `AGENTS.md`。
- 用户已授权修改本仓库源码、配置、测试和系统文档并运行本机测试。
- 用户没有授权提交、推送、发布或部署。
