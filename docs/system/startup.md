# 系统启动规范

## 命令边界

| 环境 | 生命周期命令 | 实际入口 | 运行目录 |
| --- | --- | --- | --- |
| DSH Desktop 生产环境 | `pnpm prod:start|stop|restart|status|logs` | DSH Desktop `pnpm preview` | `.local/desktop-production/` |
| DSH Desktop 开发环境 | `pnpm dev:start|stop|restart|status|logs` | DSH Desktop `pnpm dev` | `.local/desktop-development/` |
| 独立 Web Host 调试环境 | `pnpm web:start|stop|restart|status|health|logs` | DeepSeek Harness Web Host | `.local/web-development/` |

`prod:*` 与 `dev:*` 启动完整产品。`web:*` 只启动当前插件的 Web Host 调试环境，不代表完整 DSH Desktop 产品。

## 主开发 checkout 首次准备

主开发 checkout 保存唯一的根 `.env`、根 `node_modules` 和已准备的 DSH Desktop 底座。首次准备在主开发 checkout 根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm desktop:dependencies:link
```

执行 `desktop:dependencies:link` 前，DSH Desktop 必须已经位于 `config/desktop-production.json.desktopSourceRelativePath` 指定的 `.local/upstreams/dsh-desktop`，并且已经按照 DSH Desktop 自己的 lockfile 完成依赖安装。该命令把 `config/desktop-harness-development.json` 声明的 Harness 开发依赖链接到主开发 checkout 的根 `node_modules`。

主开发 checkout 的 `.env` 必须提供 `cordis.patch.yml` 引用的 Provider 凭据。`cordis.patch.yml` 同时定义默认 Agent 模型 `opencode-go/deepseek-v4-flash`、默认视觉模型 `opencode-go/qwen3.7-plus` 和默认 Preset `harness-comfyui-cli-candidate`。`config/desktop-production.json.startupWorkspacePath` 定义 Desktop 启动后直接打开的 Workspace。

## 独立 worktree 开发环境

从 `main` 创建 linked worktree 后，不得在 worktree 执行 `pnpm install`，也不得复制 `.env`：

```sh
git worktree add <worktree目录> -b codex/<分支名> main
cd <worktree目录>
pnpm dev:start
```

`dev:start` 先验证当前目录的 `.git` 是 linked-worktree 元数据文件，再根据 `config/desktop-worktree.json.mainCheckoutPath` 创建以下链接：

```text
<worktree>/.env         -> <main>/.env
<worktree>/node_modules -> <main>/node_modules
```

正确链接重复启动时保持不变。既有普通文件、普通目录或指向其他目标的链接会中止启动。启动器不会复制 `.env`，也不会在 worktree 安装依赖。

Desktop generation 安装器读取已链接根 `node_modules/.modules.yaml` 中的 pnpm store，并使用该根 `node_modules` 的真实 virtual store 路径。隔离的 Desktop HOME 不会创建第二套依赖 store，也不会让 generation staging 与主开发 checkout 的依赖使用不同 store。

链接准备完成后，`dev:start` 从主开发 checkout 的 `.local/upstreams/dsh-desktop` 执行 DSH Desktop 原生 `pnpm dev`，把当前 worktree 的插件源码打包为 generation，并加载与生产相同的 Workspace、Preset、Provider 和模型配置。

保持启动终端运行，在第二个终端管理开发进程：

```sh
pnpm dev:status
pnpm dev:logs
pnpm dev:restart
pnpm dev:stop
```

开发 Desktop 使用 `.local/desktop-development/`，不会读取或修改 `.local/desktop-production/`。当前 DSH Desktop 的 `pnpm dev` 固定使用移动桥接端口 `43128`；启动器在执行上游命令前检查该端口，端口已被占用时直接报告冲突。完整人工验收流程见 `docs/agents/worktree-development.md`。

## Git tag 生产环境

生产 checkout 更新到已经发布的 Git tag 后，执行以下命令：

```sh
git fetch --tags
git switch --detach v<版本号>
pnpm install --frozen-lockfile
pnpm prod:start
```

生产 checkout 必须保留自己的 `.env`、`.local/upstreams/dsh-desktop` 和 `.local/desktop-production/`。Git 更新不会管理这些本地文件和运行状态。

保持 `prod:start` 终端运行，在第二个终端执行：

```sh
pnpm prod:status
pnpm prod:logs
pnpm prod:restart
pnpm prod:stop
```

`prod:start` 从当前生产 checkout 的 `.local/upstreams/dsh-desktop` 执行 DSH Desktop 原生 `pnpm preview`。当前 DSH Desktop 的 `pnpm preview` 固定使用移动桥接端口 `43127`；启动器在执行上游命令前检查该端口。生产 Desktop 加载生产 checkout 的 `.env`，把当前 tag 的插件源码安装为 generation，并使用 `.local/desktop-production/` 保存 PID、日志、DSH home、Run Repository 和媒体文件。

## 独立 Web Host 调试环境

只需要调试插件 Web Host、Client ModuleLoader 或 HTTP 路由时，在 linked worktree 执行：

```sh
pnpm web:start
pnpm web:status
pnpm web:health
pnpm web:logs
pnpm web:restart
pnpm web:stop
```

`web:start` 与 `web:restart` 先建立和 `dev:start` 相同的 `.env`、`node_modules` 链接，再读取 `config/web-development.json`，使用 `comfyui-workbench-development` Profile 和 `.local/web-development/`。`web:health` 只读取并报告 Web Host、Client ModuleLoader 和运行目录状态，不创建链接，也不修改 Desktop、Provider、Preset、Workspace 或模型配置。

## 自动化测试

```sh
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm prod:test
pnpm test:desktop
pnpm quality
```

`prod:test` 使用临时目录验证 Desktop 生命周期、Web Host 共享进程模块、worktree 配置和进程隔离。`test:desktop` 启动真实 DSH Desktop 验证 Provider、Workspace、Preset、媒体 Modal 和 Harness shell capability。`quality` 是提交前完整门禁。

## 运行状态

| 环境 | PID 与日志根目录 | Desktop 模式 | 默认移动桥接端口 |
| --- | --- | --- | --- |
| 生产 Desktop | `.local/desktop-production/` | `preview` | DSH Desktop 上游 `preview` 固定为 `43127` |
| 开发 Desktop | `.local/desktop-development/` | `dev` | DSH Desktop 上游 `dev` 固定为 `43128` |
| Web Host 调试 | `.local/web-development/` | 不启动 Electron | `config/source-production.json` 与 Configuration Profile 定义的 Web 端口 |

三个运行目录不共享 PID、日志、DSH home、Run Repository、Session 或媒体文件。`status` 返回 `running` 或 `stopped`；`logs` 读取对应环境的日志；`stop` 只停止对应运行目录登记的进程。

当前 DSH Desktop 没有公开的移动桥接端口覆盖接口，因此两个同为 `dev` 模式或两个同为 `preview` 模式的 Desktop 不能并行启动。当前仓库不把未生效的端口值暴露为配置，也不修改 DSH Desktop 核心来绕过该限制。
