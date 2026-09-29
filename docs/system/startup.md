# Desktop、Web Host 与纯 DSH CLI 启动

## Desktop 基线与环境配置

config/desktop-baseline.json 是 Desktop 仓库、固定提交、Stable workspace 和预期运行版本的唯一配置来源。开发、生产准备及测试必须读取它；安装结果与配置不一致时，启动器报告具体差异并停止。

config/desktop-worktree.json 定义独立开发实例的主 checkout、运行目录和受管开发 Settings 来源。config/desktop-production.json 定义生产运行目录、环境文件和默认 Workspace。两个环境使用同一基线和插件加载机制，各自保存 HOME、DSH_HOME、Profile、PID、日志、数据库和媒体。

## 主开发 checkout 依赖准备

执行者在依赖审核及安装授权通过后，在主 checkout 按 `pnpm-lock.yaml` 执行 `pnpm install --frozen-lockfile`。执行者在 `config/desktop-baseline.json` 指定的 Desktop 2.0.15 fork 提交中，按已审核的 `yarn.lock` 执行 `corepack yarn install --immutable`，然后依次执行 `corepack yarn workspace dsh-community-market build`、`corepack yarn workspace dsh-plugin-desktop build` 和 `corepack yarn workspace dsh-plugin-desktop prepare:electron-native`。执行者使用已安装的 Node 24.14.0 构建 `fs-ext` 2.1.1 的 Node 绑定；`prepare:electron-native` 生成 Electron 44.0.0 对应的绑定。依赖审核与安装授权按[发布规范](releasing.md#当前-desktop-的安装准备)完成。

desktop:dependencies:link 仅在独立 worktree 中运行，用于从主 checkout 和基线 Stable workspace 建立依赖视图；主 checkout 不运行该命令。该命令检查宿主 peer 包的实际版本，不从其他 Desktop 借用缺失宿主包。

独立 worktree 的 dev:start 准备本地 node_modules 视图：构建工具和业务依赖链接到主 checkout 已安装目录，宿主 peer 链接到选定 Stable workspace 解析出的目录。.env 只创建到主 checkout 的链接，不复制凭据。任何依赖源缺失或版本不符都应中止准备。

## Desktop 生命周期

用户通过以下命令管理完整 Desktop：

| 环境 | 命令 | 运行目录 |
| --- | --- | --- |
| 独立 worktree | pnpm dev:start、pnpm dev:status、pnpm dev:logs、pnpm dev:stop、pnpm dev:restart | .local/desktop-development/ |
| 生产 | pnpm prod:start、pnpm prod:status、pnpm prod:logs、pnpm prod:stop、pnpm prod:restart | .local/desktop-production/ |

启动器先构建插件 Host、Client 和 managed CLI，物化当前项目 Preset，准备当前 Profile 的插件安装，再启动候选 Electron。插件包内包含自己的运行模块和数据源客户端；安装声明与 Profile bundles 必须共同指向该插件。首次启动由候选 Desktop 的官方 materializeProfile 使用内置 pnpm 建立 Profile 锁文件与安装元数据；后续启动复用符合候选格式的记录。仓库安装器不伪造这些文件。

启动器在新实例中初始化 Stable Desktop 的首次设置，并从当前 Profile 的 `cordis.patch.yml` 读取后续启动使用的 Web 端口。生产启动器保持开发调试端口关闭。

开发启动器从当前 worktree 的 `config/desktop-development-provider-settings.json` 和 `config/image-reader-profiles.json` 读取 Git 跟踪的非凭据配置，再按[配置规范](configuration.md#desktop-基线与实例配置)从 main checkout 私密 DSH home 读取所需凭据。启动器把缺失的受管配置写入当前 Profile 的 `cordis.patch.yml`，并按受管 credential ref 名称把缺失的对应凭据值写入当前 worktree 的 `.credentials.yaml`。启动器保留 Profile 中已有的用户配置和非受管条目，以及 `.credentials.yaml` 中的非受管 credential ref 和 credential record。启动器将两个目标文件保存为权限 `0600` 的独立文件。Profile 已保存的值由用户维护；跟踪配置的后续变更只应用于缺失项。开发与生产共用的启动准备流程把旧 `settings.yaml` 中的 Desktop、数据源和图片读取设置写入对应 Profile 条目；开发启动器另外迁移 Provider 设置。启动器将已完全迁移的旧文件归档为 `settings.yaml.imported`；当旧文件还包含其他设置时，DSH 导入可识别的剩余设置并归档旧文件。启动器在旧文件与归档同时存在时停止启动并保留两份文件。

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

`pnpm cli:run -- "任务文本"` 通过 `scripts/cli/run.mjs` 构建核心 Host 与 managed CLI，准备 `profiles/comfyui-cli/`，然后以前台普通 Node.js 子进程启动已安装的 `@deepseek-ai/dsh` headless 入口。调用者必须预先准备 DSH `0.1.7-rc.2`、其 base/headless bundle、workspace、agent-preset 与 agent-preset-registry 公共包、项目构建工具和业务依赖；本命令读取当前 checkout 的包解析环境。worktree 的已有依赖视图可用于开发验收，启动脚本本身只解析 DSH 公共包。

`config/cli-runtime.json` 定义隔离运行目录 `.local/cli-runtime/`、DSH Profile 名称、环境文件及业务目录。启动器在该目录保存 DSH home、数据库、Run 和媒体，读取当前 checkout 的 `.env`，并安装 `config/product-agent.json` 中的项目 Preset。调用者在该 DSH home 配置可用 Provider、模型及凭据后提交任务。前台任务结束或收到终止信号时，DSH 退出并释放插件资源。

调用者需要本次任务取得最终生成结果时，必须在任务文本中要求 Agent 查询 Run 状态并在取得最终结果后结束。`generation submit` 的成功输出表示 Run 已持久接纳；后续启动使用同一运行目录继续推进未完成的 Run。managed CLI 的执行身份仍由 DSH 前台 shell Tool Call 提供。

纯 CLI Profile 使用项目 `/cli-runner` 插件挂载 `config/product-agent.json.preset.id` 指定的默认 Preset，随后执行任务。DSH headless bundle 提供任务参数和应用退出服务；项目 runner 在会话保存完成后请求退出。纯 CLI 构建产物包含 core、image-reader、cli、cli-workspace、cli-runner 和 Workflow 编译 Worker。
