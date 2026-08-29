# 系统启动规范

## 首次准备

在仓库根目录执行一次依赖安装：

```sh
pnpm install
```

确认 `config/source-production.json` 中的两个 Source CLI 相对路径指向可读文件，并确认 Catalog 回环服务监听 `source.catalogPort`。确认 `comfyui.frontendCompiler.browserExecutablePath` 指向本机可执行的 Chrome 或 Chromium；production 默认路径为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。

## 独立 worktree 开发启动

Agent 在独立 linked worktree 中验证未发布源码时使用：

```sh
pnpm worktree:start
```

该命令验证当前 checkout 的 `.git` 是 linked-worktree 元数据文件，然后读取 `config/worktree-development.json`。命令使用 `.local/worktree-development/dsh-home` 与 `comfyui-workbench-development` Profile；Profile 物化器只在该 DSH home 创建 `.env` 符号链接。开发 Profile 把默认模型设为 `opencode-go/deepseek-v4-flash`，通过 `OPENCODE_GO_API_KEY` 引用解析凭据，并在 Host 暴露 Tool 和路由前注册配置的 startup workspace。

共享源码运行时准备过程读取 `config/product-agent.json`，把 `agent-presets/project-tool-visibility.mjs` 和用户可见名称为 `ComfyUI工作台预设` 的 `agent-presets/harness-comfyui-cli-candidate/` 物化到当前 DSH home 的 `.agent-presets/`。准备过程删除配置中精确声明的已退役项目 Preset 目录，并保留其他 Preset。production 与独立 worktree 使用相同的 Preset source 和校验规则，但写入各自隔离的 DSH home。物化失败会中止 Host 启动；单个受管目标替换失败时恢复该目标。

保持启动终端运行，并在第二个终端执行：

```sh
pnpm worktree:status
pnpm worktree:health
pnpm worktree:logs
pnpm worktree:stop
```

开发验证的完整 Agent 流程和结束条件位于 `docs/agents/worktree-development.md`。`worktree:*` 与 `prod:*` 使用不同的 runtime root、DSH home、Profile 和受管状态文件。

## 启动与验证

在仓库根目录启动当前源码：

```sh
pnpm prod:start
```

`prod:*` 是生产进程入口。该入口继续使用 `.local/production/dsh-home` 与 `comfyui-workbench` Profile，不读取 `config/worktree-development.json`，不链接主开发 `.env`，也不注册开发 startup workspace。

`prod:start` 先根据当前 `src/client/` 更新 `.local/source-client/client.js`，校验并物化 `ComfyUI工作台预设`，再以前台方式运行 Host。该步骤不改变默认 Preset。保持该终端运行，并在另一个终端执行：

```sh
pnpm prod:status
pnpm prod:health
```

默认 Web 地址是 `http://127.0.0.1:4173`。`status` 应返回 `running`，`health` 应返回 `passed`。`health` 会验证 Official API Workflow Cache 目录的读写能力。

## 日常管理

```sh
pnpm prod:logs
pnpm prod:restart
pnpm prod:stop
```

`restart` 先停止当前受管 PID，再使用当前源码和当前配置以前台方式启动。`stop` 成功后，原 `prod:start` 或 `prod:restart` 终端一并退出。

六个生命周期命令均不接受附加参数。`start` 与 `restart` 从固定配置文件读取启动目标并自动更新浏览器 Client 模块；运行中的 `stop`、`status`、`health` 和 `logs` 从受管快照读取同一目标。调用者不需要指定安装文件，也不需要执行独立构建、打包、版本安装或版本升级命令。

生产进程自动化验证使用 `pnpm prod:test`。该命令使用临时目录和端口覆盖六个生命周期操作及其异常分支。

## 运行目录

默认运行根目录是 `.local/production/`：

| 路径 | 内容 |
| --- | --- |
| `dsh-home/` | 当前进程的 Harness home 和 profile |
| `state/process.json` | PID、启动时间和进程命令 |
| `state/operations.jsonl` | 六个命令的操作记录 |
| `state/last-health.json` | 最近一次健康检查结果 |
| `shared/data/runs.sqlite` | Run Repository |
| `shared/data/api-workflow-cache/` | 目标 ComfyUI 官方前端生成的基础 API Workflow 缓存 |
| `shared/runs/` | Run 文件 |
| `shared/saved-media/` | Saved Media |
| `shared/logs/` | Host stdout 与 stderr |

`.local/source-production-managed.json` 保存正在运行的配置快照。以上文件都是本地运行状态，不进入 Git。

独立 worktree 的对应运行根目录是 `.local/worktree-development/`，开发受管状态位于 `.local/worktree-development/state/source-managed.json`。开发与生产运行目录不共享 settings、凭据、Workspace Registry、Session 或日志。

`.local/source-client/client.js` 与 source map 是当前 Client 源码的浏览器运行文件。`prod:start` 和 `prod:restart` 每次都会更新它们，Harness 不直接把 TypeScript/TSX 文件作为浏览器脚本返回。

## 状态含义

| 状态 | 含义 |
| --- | --- |
| `stopped` | 没有受管进程，端口空闲 |
| `starting` | PID 存在，端口尚未就绪 |
| `running` | PID、进程身份和端口均通过检查 |
| `unhealthy` | 端口被其他进程占用，或受管进程与端口状态不一致 |

启动失败时先执行 `pnpm prod:logs` 查看 stdout、stderr 和 operations，再修正配置或端口占用问题。Generation 请求在 Official API Workflow Cache 未命中时还会启动配置的本机浏览器；浏览器不可启动、目标前端未就绪或 `graphToPrompt()` 导出失败时，Host 日志和 Generation Run 错误码会分别说明失败阶段。
