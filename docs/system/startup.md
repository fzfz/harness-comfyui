# Desktop 与 Web Host 启动

## Desktop 基线与环境配置

config/desktop-baseline.json 是 Desktop 仓库、固定提交、Stable workspace 和预期运行版本的唯一配置来源。开发、生产准备及测试必须读取它；安装结果与配置不一致时，启动器报告具体差异并停止。

config/desktop-worktree.json 定义独立开发实例的主 checkout 和运行目录。config/desktop-production.json 定义生产运行目录、环境文件和默认 Workspace。两个环境使用同一基线和插件加载机制，各自保存 HOME、DSH_HOME、Profile、PID、日志、数据库和媒体。

## 主开发 checkout 依赖准备

主 checkout 保存已审核的依赖：项目依赖在主 checkout 按 pnpm-lock.yaml 执行 pnpm install --frozen-lockfile；Desktop 依赖在基线指定仓库按 yarn.lock 执行 corepack yarn install --immutable，并按该仓库的构建命令生成 Stable 产物。安装前必须完成 docs/system/releasing.md 规定的依赖审核与安装授权。

desktop:dependencies:link 仅在独立 worktree 中运行，用于从主 checkout 和基线 Stable workspace 建立依赖视图；主 checkout 不运行该命令。该命令检查宿主 peer 包的实际版本，不从其他 Desktop 借用缺失宿主包。

独立 worktree 的 dev:start 准备本地 node_modules 视图：构建工具和业务依赖链接到主 checkout 已安装目录，宿主 peer 链接到选定 Stable workspace 解析出的目录。.env 只创建到主 checkout 的链接，不复制凭据。任何依赖源缺失或版本不符都应中止准备。

## Desktop 生命周期

用户通过以下命令管理完整 Desktop：

| 环境 | 命令 | 运行目录 |
| --- | --- | --- |
| 独立 worktree | pnpm dev:start、pnpm dev:status、pnpm dev:logs、pnpm dev:stop、pnpm dev:restart | .local/desktop-development/ |
| 生产 | pnpm prod:start、pnpm prod:status、pnpm prod:logs、pnpm prod:stop、pnpm prod:restart | .local/desktop-production/ |

启动器先构建插件 Host、Client 和 managed CLI，物化当前项目 Preset，准备当前 Profile 的插件安装，再启动候选 Electron。插件包内包含自己的运行模块和数据源客户端；安装声明与 Profile bundles 必须共同指向该插件。首次启动由候选 Desktop 的官方 materializeProfile 使用内置 pnpm 建立 Profile 锁文件与安装元数据；后续启动复用符合候选格式的记录。仓库安装器不伪造这些文件。

启动器只在新实例初始化首次设置。后续启动保留已保存设置，环境特有的端口和运行目录由实例配置决定。生产实例不打开开发调试端口。

start 保持在前台。status 报告实例进程与就绪状态；logs 汇总该实例的启动及 Host 日志并脱敏。stop 核对 PID 所属进程组和启动路径后停止该组；启动失败和停止超时必须在配置期限内结束，并清理本次端口声明。

## Desktop 就绪条件

启动器必须同时确认当前进程的 Host Web 端口已监听、本次启动 run 写入 startup.run.completed 且 rendererStatus 为 healthy，以及安装记录对应当前插件。仅有监听端口、Electron 进程或历史健康日志都不代表本次启动成功。移动访问状态不是 Desktop 就绪条件。

## 项目运行配置

启动器从 config/product-agent.json 解析当前 checkout 的 Repository Skills 目录，写入 HARNESS_COMFYUI_SKILL_DIR；调用者或 .env 不得覆盖该目录。DSH_AGENTS_HOME 保留调用者的用户级 Skills 根。两个项目 Preset 的 Skills 隔离要求见 docs/agents/comfyui-workbench-preset-and-skill-development.md。

插件配置定义默认模型和 Provider。启动器注入当前环境的 Workspace、数据目录、运行数据库、媒体目录和日志目录。数据源地址通过 ComfyUI 设置页保存；Host 后续请求读取最新设置，不要求数据源源码位于本仓库旁。

目录查询与 Workflow 读取 .mjs 客户端由宿主执行。在 Electron 内启动这些子进程时，插件仅为子进程设置 ELECTRON_RUN_AS_NODE=1；普通 Node 与原生可执行程序继续使用原环境。

## 独立 Web Host

pnpm web:start、pnpm web:status、pnpm web:health、pnpm web:logs、pnpm web:stop、pnpm web:restart 管理 .local/web-development/ 中的独立 Web Host，用于协议和路由调试。Web Host 使用自己的端口、PID 和数据；Web Host 测试不替代真实 Electron 和 Renderer 测试。

## 生产更新

生产更新必须使用已发布插件版本和 config/desktop-baseline.json 指定的 Desktop 提交。部署人员保留生产配置和运行数据，按照 docs/system/releasing.md 执行发布门禁。旧数据迁移必须单独验证，开发启动器不得为测试改写生产目录。
