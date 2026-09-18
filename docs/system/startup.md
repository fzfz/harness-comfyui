# Desktop、Web Host 与纯 DSH CLI 启动

## Desktop 基线与环境配置

config/desktop-baseline.json 是 Desktop 仓库、固定提交、Stable workspace 和预期运行版本的唯一配置来源。开发、生产准备及测试必须读取它；安装结果与配置不一致时，启动器报告具体差异并停止。

config/desktop-worktree.json 定义独立开发实例的主 checkout、运行目录和受管开发 Settings 来源。config/desktop-production.json 定义生产运行目录、环境文件和默认 Workspace。两个环境使用同一基线和插件加载机制，各自保存 HOME、DSH_HOME、Profile、PID、日志、数据库和媒体。

## 主开发 checkout 依赖准备

主 checkout 保存已审核的依赖：项目依赖在主 checkout 按 pnpm-lock.yaml 执行 pnpm install --frozen-lockfile；Desktop 2.0.11 依赖在基线指定仓库按 yarn.lock 执行 corepack yarn install --immutable，随后执行 corepack yarn workspace dsh-community-market build、corepack yarn workspace dsh-plugin-desktop build 和 corepack yarn workspace dsh-plugin-desktop prepare:electron-native。本机使用已安装的 Node 24.14.0 完成 fs-ext 2.1.1 的 Node 绑定构建；prepare:electron-native 生成 Electron 43.3.0 对应的绑定。安装前必须完成 docs/system/releasing.md 规定的依赖审核与安装授权。

desktop:dependencies:link 仅在独立 worktree 中运行，用于从主 checkout 和基线 Stable workspace 建立依赖视图；主 checkout 不运行该命令。该命令检查宿主 peer 包的实际版本，不从其他 Desktop 借用缺失宿主包。

独立 worktree 的 dev:start 准备本地 node_modules 视图：构建工具和业务依赖链接到主 checkout 已安装目录，宿主 peer 链接到选定 Stable workspace 解析出的目录。.env 只创建到主 checkout 的链接，不复制凭据。任何依赖源缺失或版本不符都应中止准备。

## Desktop 生命周期

用户通过以下命令管理完整 Desktop：

| 环境 | 命令 | 运行目录 |
| --- | --- | --- |
| 独立 worktree | pnpm dev:start、pnpm dev:status、pnpm dev:logs、pnpm dev:stop、pnpm dev:restart | .local/desktop-development/ |
| 生产 | pnpm prod:start、pnpm prod:status、pnpm prod:logs、pnpm prod:stop、pnpm prod:restart | .local/desktop-production/ |

启动器先构建插件 Host、Client 和 managed CLI，物化当前项目 Preset，准备当前 Profile 的插件安装，再启动候选 Electron。插件包内包含自己的运行模块和数据源客户端；安装声明与 Profile bundles 必须共同指向该插件。首次启动由候选 Desktop 的官方 materializeProfile 使用内置 pnpm 建立 Profile 锁文件与安装元数据；后续启动复用符合候选格式的记录。仓库安装器不伪造这些文件。

启动器只在新实例初始化 Stable Desktop 的首次设置。开发启动器随后在每次 `dev:start` 和 `dev:restart` 中更新受管 Provider、默认模型和图片读取 Settings，并保留其他用户设置。生产实例不打开开发调试端口。

开发启动器从当前 worktree 的 `config/desktop-development-provider-settings.json` 和 `config/image-reader-profiles.json` 读取 Git 跟踪的非凭据配置。启动器从 `config/desktop-worktree.json` 指向的 main checkout 私密 DSH home 读取 Git 忽略的 Provider 凭据和图片读取凭据，再把受管值合并到当前 worktree 的 `settings.yaml` 和 `.credentials.yaml`。目标文件是权限 `0600` 的独立文件；启动器不复制未声明的 main 凭据，并保留当前 worktree 的非受管 Settings namespace、credential ref 和 credential record。

`dev:start` 和 `dev:restart` 在停止或启动 Desktop 前校验跟踪配置、main 私密来源和当前目标文件。校验失败时，启动器不修改目标文件，也不停止已有 Desktop。`dev:start` 发现实例已运行时不写入配置；`dev:restart` 停止旧实例后物化配置，再启动新实例。`dev:status`、`dev:logs` 和 `dev:stop` 不执行配置初始化。

start 保持在前台。status 报告实例进程与就绪状态；logs 汇总该实例的启动及 Host 日志并脱敏。stop 核对 PID 所属进程组和启动路径后停止该组；启动失败和停止超时必须在配置期限内结束，并清理本次端口声明。

## Desktop 就绪条件

启动器必须同时确认当前进程的 Host Web 端口已监听、本次启动 run 写入 startup.run.completed 且 rendererStatus 为 healthy，以及安装记录对应当前插件。仅有监听端口、Electron 进程或历史健康日志都不代表本次启动成功。移动访问状态不是 Desktop 就绪条件。

## 项目运行配置

启动器从 config/product-agent.json 解析当前 checkout 的 Repository Skills 目录，写入 HARNESS_COMFYUI_SKILL_DIR；启动器必须以验证后的路径覆盖调用者或 .env 提供的目录值。DSH_AGENTS_HOME 保留调用者的用户级 Skills 根。两个项目 Preset 的 Skills 隔离要求见 docs/agents/comfyui-workbench-preset-and-skill-development.md。

插件配置定义默认模型和 Provider。启动器注入当前环境的 Workspace、数据目录、运行数据库、媒体目录和日志目录。数据源地址通过 ComfyUI 设置页保存；Host 后续请求读取最新设置，不要求数据源源码位于本仓库旁。

目录查询与 Workflow 读取 .mjs 客户端由宿主执行。在 Electron 内启动这些子进程时，插件仅为子进程设置 ELECTRON_RUN_AS_NODE=1；普通 Node 与原生可执行程序继续使用原环境。

## 独立 Web Host

pnpm web:start、pnpm web:status、pnpm web:health、pnpm web:logs、pnpm web:stop、pnpm web:restart 管理 .local/web-development/ 中的独立 Web Host，用于协议和路由调试。Web Host 使用自己的端口、PID 和数据；Web Host 测试不替代真实 Electron 和 Renderer 测试。

## 生产更新

生产更新必须使用已发布插件版本和 config/desktop-baseline.json 指定的 Desktop 提交。部署人员保留生产配置和运行数据，按照 docs/system/releasing.md 执行发布门禁。旧数据迁移必须单独验证，开发启动器必须将测试数据写入独立开发运行目录。

## 纯 DSH CLI

`pnpm cli:run -- "任务文本"` 通过 `scripts/cli/run.mjs` 构建核心 Host 与 managed CLI，准备 `profiles/comfyui-cli/`，然后以前台普通 Node.js 子进程启动已安装的 `@deepseek-ai/dsh` headless 入口。调用者必须预先准备 DSH `0.1.5-rc.2`、其 base/headless bundle、workspace 与 agent-presets 公共包、项目构建工具和业务依赖；本命令读取当前 checkout 的包解析环境。worktree 的已有依赖视图可用于开发验收，启动脚本本身只解析 DSH 公共包。

`config/cli-runtime.json` 定义隔离运行目录 `.local/cli-runtime/`、DSH Profile 名称、环境文件及业务目录。启动器在该目录保存 DSH home、数据库、Run 和媒体，读取当前 checkout 的 `.env`，并安装 `config/product-agent.json` 中的项目 Preset。调用者在该 DSH home 配置可用 Provider、模型及凭据后提交任务。前台任务结束或收到终止信号时，DSH 退出并释放插件资源。

调用者需要本次任务取得最终生成结果时，必须在任务文本中要求 Agent 查询 Run 状态并在取得最终结果后结束。`generation submit` 的成功输出表示 Run 已持久接纳；后续启动使用同一运行目录继续推进未完成的 Run。managed CLI 的执行身份仍由 DSH 前台 shell Tool Call 提供。

纯 CLI Profile 使用项目 `/cli-runner` 插件挂载 `config/product-agent.json.preset.id` 指定的默认 Preset，随后执行任务。DSH headless bundle 提供任务参数和应用退出服务；项目 runner 在会话保存完成后请求退出。纯 CLI 构建产物包含 core、image-reader、cli、cli-workspace、cli-runner 和 Workflow 编译 Worker。
