# 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/host/catalog/` | 数据源 Catalog 查询、模板/LoRA/生成模型/ComfyUI 实例 ID 查询 Tool 与 Catalog Remote |
| `src/host/core/` | Core 插件、Catalog/Generation 服务、Host 配置加载与数据目录初始化 |
| `src/host/cli/` | managed CLI 插件、专用 HTTP listener、前台 Tool Call capability、请求分发和 Workspace 登记 |
| `src/host/web/` | Host Remote 与媒体路由的 Web 插件装配 |
| `src/host/generation/` | Generation Runtime、Source、Workflow 参数检查与编译、官方前端浏览器适配器、Official API Workflow Cache、Comfy transport、创建 Tool、历史 Run 查询、coordinator、Remote、媒体路由和 Session Media Viewer |
| `src/host/image-reader/` | 图片读取配置、视觉模型目录、图片缩放、系统 Provider/OpenAI 兼容适配与单图读取 Tool |
| `src/host/tools/` | Harness 项目 Tool 唯一注册入口 |
| `src/host/resource-path.ts` | 使用模块 URL 解析已安装插件包内的资源路径 |
| `src/host/node-script-environment.ts` | 为 Electron Node 子进程提供 `ELECTRON_RUN_AS_NODE=1` 环境 |
| `src/source-settings.ts` | 数据源服务地址、端口、Settings schema、默认值和校验函数 |
| `src/cli/` | argv、request、Generation Request、运行参数检查、随机 Seed、历史 Run 查询和图片读取的共享合同 |
| `src/generation/` | Host、Tool、Client 与 CLI 共用的 Generation Remote、媒体 URL 和历史 Run 查询合同 |
| `src/image-reader/` | 图片读取配置、凭据操作、视觉模型目录和 Remote 的 Host/Client 共享合同 |
| `src/catalog/` | Catalog 的 Client 展示字段、详情 schema 与上下文类型 |
| `src/config/` | Configuration Profile 载入器 |
| `src/client/` | 官方 Harness 扩展位、上下文选择器、Generation Run/Media 投影及 ComfyUI 设置页 |
| `.agents/skills/anima-prompt-builder/` | ANIMA3 Prompt、负向策略、模板无关生成目标与历史 Generation Run 查询 Skill 唯一源码目录 |
| `.agents/skills/character-portrait-prompt-designer/` | 角色立绘 Prompt 与历史 Generation Run 查询 Skill 唯一源码目录 |
| `.agents/skills/comfyui-generate/` | Prompt Builder 结果消费、模板参数检查、Seed 分配、ComfyUI 生成、兼容性检查与历史 Run 查询 Skill 唯一源码目录 |
| `.agents/skills/comfyui-image-review/` | 多 Run 图片读取与 Prompt 对比 Skill 唯一源码目录，包含 CLI 参考 |
| `.agents/skills/comfyui-iterate-generation/` | 图片迭代调度 Skill；`references/records.md` 定义文件交接，构图、比较和查询参考分别位于 composition-design、iteration-method 和 run-query-cli |
| `.agents/skills/krea2-anime-prompt-builder/` | Krea2 动漫展示图、动作迁移源图 Prompt、模板无关生成目标与历史 Run 查询 Skill 唯一源码目录 |
| `.agents/skills/local-image-reader/` | 用户提供本地图片路径的逐图视觉读取 Skill 唯一源码目录，包含 CLI 参考 |
| `.agents/skills/wai-sdxl-prompt-builder/` | WAI Prompt、负向策略、模板无关生成目标与历史 Run 查询 Skill 唯一源码目录 |
| `agent-presets/presets.cordis.yml` | 注册 `harness-comfyui-cli-candidate` 工作台预设和 `harness-comfyui-iteration` 迭代预设；保留官方应用的内置默认 Preset |
| `agent-presets/harness-comfyui-cli-candidate/` | 用户可见名称为“ComfyUI工作台预设”的产品 Preset 唯一源码目录 |
| `agent-presets/harness-comfyui-iteration/` | 用户可见名称为“ComfyUI迭代预设”的产品 Preset 唯一源码目录，保存主 Agent 与四个角色的 persona、派发参数和模型配置 |
| `agent-presets/project-installed-presets.mjs` | 从插件包相对路径载入 Preset registry 声明 |
| `agent-presets/project-installed-skills.mjs` | 从插件包相对路径为产品 Preset 注册八个项目 Skill，并关闭默认 roots |
| `agent-presets/project-iteration-dispatch.mjs` | 按角色配置组装任务消息，并调用 DSH 原生子 Agent 创建或续派接口 |
| `agent-presets/project-subagent-workspace.mjs` | 将迭代预设子 Agent 的真实 Session 关联到父 Session 所属 Workspace |
| `agent-presets/project-tool-visibility.mjs`、`project-system-prompt-visibility.mjs` | 限定项目 Preset 会话的 Tool 与系统提示词段落 |
| `cordis.patch.yml` | 装配插件 Host 入口、根 Client bundle 与已安装 Preset 注册组件 |
| `config/base.json`、`config/profiles/production.json` | 插件配置默认值和生产 Configuration Profile |
| `config/schema.ts` | 插件配置字段、约束和默认值 schema |
| `config/environment-overrides.json` | 插件支持的环境覆盖映射 |
| `config/product-agent.json`、`config/product-agent-schema.mjs` | 两个产品 Preset 身份、资源目录与共享配置约束 |
| `config/settings-entry-ids.json` | Core 与图片读取插件使用的 Profile Settings 条目标识 |
| `config/image-reader-profiles.json`、`config/image-reader-processing.json`、`config/image-reader-runtime.json` | 图片读取配置、处理参数和 Runtime 默认值 |
| `config/error-catalog.json` | Host 稳定错误码与结构化错误消息目录 |
| `config/plugin-package.json`、`config/plugin-package-schema.mjs` | 声明并校验进入发行 tarball 的源码资源和构建产物 |
| `config/runtime-artifacts.json` | 声明 Host 插件、Client、managed CLI 与 Workflow worker 的源码和构建路径 |
| `config/source-cli-guidance.json`、`config/managed-cli-help.json` | managed CLI 帮助与数据源客户端指引配置 |
| `config/managed-cli-environment.json` | 定义 Host 向前台 Tool Call 提供的 managed CLI 环境变量名称 |
| `config/node-script-runtime.json` | 定义由 Electron Node 执行脚本时使用的环境变量 |
| `config/desktop-e2e.json`、`config/desktop-e2e-schema.mjs` | 定义官方 Desktop 测试夹具使用的目录、启动参数、端口和运行记录结构 |
| `scripts/build/` | 通过 `pnpm build` 构建插件入口，通过 `pnpm pack:plugin` 生成官方插件管理器可安装的 tarball |
| `scripts/cli/` | packaged managed CLI 入口、帮助和结构化参数解析代码 |
| `scripts/source-client/` | 插件包内的数据源语义查询和读取客户端，通过 HTTP 或 HTTPS 请求已配置的数据源服务 |
| `tests/desktop/fixtures/` | 隔离 Harness home、Electron user-data、Workspace、安装候选包、连接 CDP、记录证据和清理本轮进程的测试夹具 |
| `tests/desktop/run-desktop-tests.mjs` | `pnpm test:desktop` 的构建、打包及官方应用验收总入口 |
| `tests/desktop/official-desktop-lifecycle.test.mjs` | 双实例设置与 Session 隔离、启动成功、失败、取消、超时、端口冲突和显式调试清理 |
| `tests/desktop/official-desktop-live.test.mjs` | 官方 Desktop 插件业务 E2E，覆盖安装、设置、受控生成、历史和媒体 |
| `tests/production/` | 发行包、官方 Profile、Renderer CDP、隔离及安装生命周期的确定性测试，由 `test:production` 执行 |
| `tests/unit/`、`tests/integration/`、`tests/contract/`、`tests/security/` | 模块、插件组合、发行合同和安全边界测试 |
| `docs/verification/official-desktop-plugin/` | 官方应用能力、依赖和插件验收记录；只保存证据与完成状态 |
| `docs/system/` | 当前插件架构、技术栈、目录和发布规范 |

官方 Desktop、DeepSeek Harness Host 和 Harness ComfyUI 插件保持三个源码边界。插件通过 `package.json` 声明的官方 SDK peers 接入 Host 公共接口。Host、Client、CLI、Preset、八个 Skills、配置、schema 和客户端资源由 `config/plugin-package.json` 纳入插件 tarball；官方插件管理器从 tarball 安装并由官方应用管理运行生命周期。

Preset 与 Skill 资源以其安装模块的 URL 为基准解析。两个项目 Preset 分别注册自己的文件系统 Skill provider；每个 provider 只读取插件包内 `.agents/skills/`，并设置 `includeDefaultRoots: false`。插件注册两个项目 Preset 时不设置为官方全局默认值；用户在官方会话界面选择项目 Preset，官方应用继续使用用户选择的内置默认 Preset。

Host 通过 DSH context 的 `dshHomePath()` 取得当前官方 Harness home，将 `config/base.json` 声明的 `data/plugins/harness-comfyui/` 作为本插件数据根。该目录下保存 SQLite Run Repository、Run 文件、Saved Media、API Workflow 缓存和日志。插件 Profile 设置与凭据使用 Host 的设置和凭据机制；插件安装目录只保存可替换的代码和资源。

`scripts/build/` 的运行产物位于 `.local/source-host/`、`.local/source-client/` 和 `.local/source-cli/`。`pnpm pack:plugin` 将 `exports` 和 bundle 引用的构建结果与显式配置的包内文件一起放入 `harness-comfyui-<version>.tgz`。发行包不包含测试、验证证据、`.env`、`node_modules`、SDK 开发依赖视图或生产 checkout 内容。

## 开发验收目录与产物

`config/desktop-e2e.json` 定义每轮 `.local/desktop-e2e/<run-id>/` 的日志、证据和运行记录，以及 `.local/desktop-development/official-environment/` 中的持久开发 Harness home、user-data 和 Workspace。夹具保存每轮进程、端口与租约身份，停止时释放本轮资源，保留持久环境的初始化配置和业务数据。开发者按[worktree 规范](../agents/worktree-development.md)启动、核对和停止测试实例。

旧 Desktop、独立 Web Host、Profile 写入器和独立 headless 产品入口已按升级方案退役。插件构建器位于 `scripts/build/`；预设资源校验使用官方公共 YAML/list schema。旧生产 checkout 和用户安装数据的处置继续遵守[发布规范](releasing.md)中的单独授权边界。
