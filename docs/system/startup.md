# 系统启动规范

## 命令边界

| 环境 | 生命周期命令 | 实际入口 | 运行目录 |
| --- | --- | --- | --- |
| DSH Desktop 生产环境 | `pnpm prod:start|stop|restart|status|logs` | DSH Desktop `pnpm preview` | `.local/desktop-production/` |
| DSH Desktop 开发环境 | `pnpm dev:start|stop|restart|status|logs` | DSH Desktop `pnpm dev` | `.local/desktop-development/` |
| 独立 Web Host 调试环境 | `pnpm web:start|stop|restart|status|health|logs` | DeepSeek Harness Web Host | `.local/web-development/` |

`prod:*` 与 `dev:*` 启动完整产品。`web:*` 只启动当前插件的 Web Host 调试环境，不代表完整 DSH Desktop 产品。

三个 DSH home 使用以下固定路径：

| DSH home | 实际路径 |
| --- | --- |
| 旧 Web 生产 DSH home | `<生产 checkout>/.local/production/dsh-home` |
| Desktop 生产 DSH home | `<生产 checkout>/.local/desktop-production/home/Library/Application Support/dsh-desktop-dev/harness` |
| Desktop 开发 DSH home | `<worktree>/.local/desktop-development/home/Library/Application Support/dsh-desktop-dev/harness` |

旧 Web 生产 DSH home 只作为 `v0.37.2` 起的生产 Session 迁移源。Desktop 生产与 Desktop 开发分别读取表中自己的 DSH home。

## 主开发 checkout 首次准备

主开发 checkout 保存唯一的根 `.env`、根 `node_modules` 和已准备的 DSH Desktop 底座。首次准备在主开发 checkout 根目录执行：

```sh
(
set -e
mkdir -p .local/upstreams
git clone --branch main https://github.com/fzfz/dsh-desktop.git .local/upstreams/dsh-desktop
git -C .local/upstreams/dsh-desktop switch --detach 5e08355a58bb727cb0f48c794550202d9d59ed9f
test "$(git -C .local/upstreams/dsh-desktop rev-parse HEAD)" = "5e08355a58bb727cb0f48c794550202d9d59ed9f"
)
```

按照[releasing.md 的受控依赖安装章节](releasing.md#dsh-desktop-的受控依赖安装)安装 Desktop 依赖后，在 Harness checkout 根目录继续执行：

```sh
(
set -e
pnpm install --frozen-lockfile
pnpm desktop:dependencies:link
)
```

执行 `desktop:dependencies:link` 前，DSH Desktop 必须已经位于 `config/desktop-production.json.desktopSourceRelativePath` 指定的 `.local/upstreams/dsh-desktop`，并且已经按照 DSH Desktop 自己的 lockfile 完成依赖安装。该命令把 `config/desktop-harness-development.json` 声明的 Harness 开发依赖链接到主开发 checkout 的根 `node_modules`。

主开发 checkout 的 `.env` 必须提供 `cordis.patch.yml` 引用的 Provider 凭据。`cordis.patch.yml` 同时定义默认 Agent 模型 `opencode-go/deepseek-v4-flash`、默认视觉模型 `opencode-go/qwen3.7-plus`、前台 Bash 默认超时 `180000` 毫秒和默认 Preset `harness-comfyui-cli-candidate`。该 Bash 超时适用于没有显式提供 `timeoutMs` 的前台 Skill CLI 调用。`config/desktop-production.json.startupWorkspacePath` 定义 Desktop 启动后直接打开的 Workspace。

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

`dev:start` 还根据 `config/desktop-worktree.json.skillSourceRelativePath` 创建仅位于隔离 Desktop HOME 的候选 Skill 链接：

```text
<worktree>/.local/desktop-development/home/.agents/skills -> <worktree>/.agents/skills
```

开发 Desktop 因此读取当前 worktree 的候选项目 Skill。该链接不修改真实 `$HOME/.agents/skills`；`prod:start` 继续把生产 Desktop 的隔离 HOME 链接到真实 `$HOME/.agents/skills`。

Desktop generation 安装器读取已链接根 `node_modules/.modules.yaml` 中的 pnpm package store。插件适配层通过 DSH Desktop installer 的进程接口执行 `pnpm --ignore-workspace --store-dir <storeDir> add ...`。generation staging 使用自己的 virtual store 和 lockfile，不修改主开发 checkout 的 `node_modules/.pnpm` 或 `pnpm-lock.yaml`。

链接准备完成后，`dev:start` 从主开发 checkout 的 `.local/upstreams/dsh-desktop` 执行 DSH Desktop 原生 `pnpm dev`，把当前 worktree 的插件源码打包为 generation，并加载与生产相同的 Workspace、Preset、Provider 和模型配置。启动器在每次启动前清空当前 worktree 的 `.local/desktop-development/desktop-out/`，再把本次 Electron Vite 输出写入该目录；并行启动的 worktree 不会共同写入主开发 checkout 中的 DSH Desktop `out/`。

保持启动终端运行，在第二个终端管理开发进程：

```sh
pnpm dev:status
pnpm dev:logs
pnpm dev:restart
pnpm dev:stop
```

开发 Desktop 使用 `.local/desktop-development/`，不会读取或修改 `.local/desktop-production/`。`dev:start` 和 `dev:restart` 通过主开发 checkout 的 `.local/development-port-claims/` 为本次启动声明一个空闲移动桥接端口；启动器在 Desktop 子进程监听该端口后释放声明，再把运行端口写入 `.local/desktop-development/state/mobile-bridge.json`。`dev:status` 在进程运行时报告同一个端口。开发启动器不会读取或修改共享 `.env` 中的 `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT`。完整人工验收流程见 `docs/agents/worktree-development.md`。

## Git tag 生产环境

生产 checkout 更新到已经发布的 Git tag 后，执行以下命令：

```sh
(
set -e
pnpm prod:stop
git fetch --tags
git switch --detach v0.39.7
git -C .local/upstreams/dsh-desktop fetch https://github.com/fzfz/dsh-desktop.git 5e08355a58bb727cb0f48c794550202d9d59ed9f
git -C .local/upstreams/dsh-desktop switch --detach FETCH_HEAD
test "$(git -C .local/upstreams/dsh-desktop rev-parse HEAD)" = "5e08355a58bb727cb0f48c794550202d9d59ed9f"
)
```

按照[releasing.md 的受控依赖安装章节](releasing.md#dsh-desktop-的受控依赖安装)安装 Desktop 依赖后，在 Harness checkout 根目录继续执行：

```sh
(
set -e
pnpm install --frozen-lockfile
pnpm desktop:dependencies:link
pnpm prod:start
)
```

生产 checkout 必须保留自己的 `.env`、`.local/upstreams/dsh-desktop` 和 `.local/desktop-production/`。Git 更新不会管理这些本地文件和运行状态。`v0.39.7` 使用 `fzfz/dsh-desktop:main` 的提交 `5e08355a58bb727cb0f48c794550202d9d59ed9f`；该提交恢复聚合 Client 的 `session/delete` Remote，严格禁用 Kimi PPT adapter，并把 Windows 隐藏控制台辅助模块纳入 Desktop 打包资源。

保持 `prod:start` 终端运行，在第二个终端执行：

```sh
pnpm prod:status
pnpm prod:logs
pnpm prod:restart
pnpm prod:stop
```

`prod:start` 从当前生产 checkout 的 `.local/upstreams/dsh-desktop` 执行 DSH Desktop 原生 `pnpm preview`。启动器从生产 checkout 的 `.env` 读取 `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT`，在执行上游命令前检查该端口，并把同一个值传给 DSH Desktop。生产 Desktop 把当前 tag 的插件源码安装为 generation，并使用 `.local/desktop-production/` 保存 PID、日志、DSH home、Run Repository 和媒体文件。

Desktop 与 Web Host 准备链都先把 managed CLI 源入口及其 TypeScript 依赖生成到 `.local/source-cli/harness-comfyui.mjs`。在 managed CLI 相关文件中，Desktop generation 复制 `.local/source-cli/` 构建目录，不复制 `scripts/cli/` 源入口；Host 只把该目录中的 `.mjs` 路径写入前台 shell environment。CLI、Client 或 Host 模块生成失败时，启动器不会发布新的 Profile 或 runtime state。

`prod:start` 和 `prod:restart` 在物化当前 generation 前检查旧 Web 生产 DSH home `.local/production/dsh-home`。旧目录存在时，启动器把 Session、Session Attachment 和 version 3 聚合 Session 投影索引合并到 `.local/desktop-production/` 中的当前 DSH home，并按 Workspace 路径合并 Workspace 记录中的 Session ID。启动器保留当前 DSH home 已存在的文件和旧目录中的原始文件；重复启动不会覆盖已经迁入的 Session 或索引。

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

`web:start` 与 `web:restart` 先建立和 `dev:start` 相同的 `.env`、`node_modules` 链接，再读取 `config/web-development.json`，通过主开发 checkout 的 `.local/development-port-claims/` 声明一个空闲回环端口，并使用 `comfyui-workbench-development` Profile 和 `.local/web-development/`。启动器在 Web Host 子进程监听该端口后释放声明。Web Host 进程状态保存实际端口，因此并行 worktree 的 `web:status`、`web:health`、`web:logs` 和 `web:stop` 只管理各自进程。`web:health` 只读取并报告 Web Host、Client ModuleLoader 和运行目录状态，不创建链接，也不修改 Desktop、Provider、Preset、Workspace 或模型配置。

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

| 环境 | PID 与日志根目录 | Desktop 模式 | 移动桥接端口来源 |
| --- | --- | --- | --- |
| 生产 Desktop | `.local/desktop-production/` | `preview` | 生产 checkout `.env` 的 `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT`；示例为 `43127` |
| 开发 Desktop | `.local/desktop-development/` | `dev` | `dev:start` 或 `dev:restart` 为当前 worktree 分配的空闲端口 |
| Web Host 调试 | `.local/web-development/` | 不启动 Electron | `web:start` 或 `web:restart` 为当前 worktree 分配的空闲回环端口 |

三个运行目录不共享 PID、日志、DSH home、Run Repository、Session 或媒体文件。`status` 返回 `running` 或 `stopped`；`logs` 读取对应环境的日志；`stop` 只停止对应运行目录登记的进程。

linked worktree 共享的 `.env` 可以保留 Provider 凭据、共享产品配置和既有端口变量。`dev:*` 不把共享 `.env` 中的 Desktop 移动桥接端口变量作为当前 worktree 的开发端口；`web:*` 不把共享 `.env` 中的 `HARNESS_COMFYUI_SERVER_PORT` 作为当前 worktree 的 Web Host 端口。开发 Desktop 移动桥接端口、独立 Web Host 端口、PID、日志、DSH home、业务数据和 Desktop 构建输出全部属于当前 worktree 的开发实例。

## v0.39.7 的 Desktop 启动要求

`v0.39.7` 使用 `fzfz/dsh-desktop:main` 的提交 `5e08355a58bb727cb0f48c794550202d9d59ed9f`，该提交完整合并官方上游 `8b018c991fe88abdb61939b280c3dbea020acfc8`，并包含 DSH Desktop PR #3 的会话删除、Kimi PPT 禁用和 Windows 打包修复。该 Desktop 使用 Harness `0.1.2-rc.1` 和 Cordis `4.0.2`；插件源码必须与该版本共同验证。
