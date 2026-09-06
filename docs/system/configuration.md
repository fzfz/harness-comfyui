# 配置规范

## Desktop 产品配置

`prod:start`、`prod:restart`、`dev:start` 和 `dev:restart` 共同读取 `config/desktop-production.json`：

| 字段 | 规则 |
| --- | --- |
| `desktopSourceRelativePath` | DSH Desktop 相对 checkout 的目录；当前为 `.local/upstreams/dsh-desktop` |
| `runtimeRelativeRoot` | 生产 Desktop 运行目录；当前为 `.local/desktop-production` |
| `environmentFileRelativePath` | 生产 checkout 内的环境文件；当前为 `.env` |
| `startupWorkspacePath` | Desktop 启动后直接打开的绝对 Workspace 目录 |

生产命令相对当前生产 checkout 解析 `desktopSourceRelativePath` 和 `environmentFileRelativePath`。开发命令从 `config/desktop-worktree.json.mainCheckoutPath` 解析 DSH Desktop 底座，并使用 worktree 根 `.env` 链接；因此开发与生产加载同一个产品配置结构，不存在第二套 Workspace、Preset、Provider 或模型配置。

生产 context 使用 `config/source-production.json.runtimeRelativeRoot` 定位旧 Web 生产 DSH home `<runtimeRelativeRoot>/dsh-home`。该路径只用于把旧 Session、Session Attachment、Session 投影索引和 Workspace Session 关系迁入当前生产 DSH home；开发 Desktop 不读取该旧生产目录。

仓库根 `.env.example` 提供 `OPENCODE_GO_API_KEY` 与允许调用者覆盖的 `HARNESS_COMFYUI_*` 业务变量示例。该文件同时注明 Workspace、Desktop runtime、数据源服务默认端口和图片读取 OpenAI 兼容接口的实际配置位置；数据源服务 URL 和当前端口由使用者在 Harness 的“ComfyUI”设置页保存。

`config/desktop-worktree.json` 只声明 linked worktree 与生产环境之间的运行差异：

| 字段 | 规则 |
| --- | --- |
| `mainCheckoutPath` | 主开发 checkout 的绝对路径 |
| `runtimeRelativeRoot` | 当前 worktree 的 Desktop 运行目录；当前为 `.local/desktop-development` |

`dev:start` 和 `dev:restart` 在读取 Desktop context 前创建并验证 `<worktree>/.env -> <main>/.env` 与 `<worktree>/node_modules -> <main>/node_modules`。正确链接保持不变；既有普通文件、普通目录或错误链接会中止启动。Repository Skills 路径只由当前 worktree 的 `config/product-agent.json.skills` 定义。Desktop 启动器在准备阶段不在隔离 Desktop HOME 下创建 `.agents/skills` 符号链接。隔离 Desktop HOME 下的 `.agents` 是符号链接时，Desktop 启动器保留该链接及其链接目标内容并中止启动；`.agents` 是非目录路径时，Desktop 启动器保留该路径及其内容并中止启动；`.agents/skills` 是符号链接时，Desktop 启动器只删除该链接；`.agents/skills` 是普通文件或普通目录时，Desktop 启动器保留其内容并中止启动。

Desktop generation 安装器读取根 `node_modules/.modules.yaml` 的 `storeDir`。插件适配层向 generation 的 pnpm 命令传递 `--ignore-workspace` 和 `--store-dir <storeDir>`；generation staging 不加入当前 checkout 的 pnpm workspace，并使用自己的 virtual store 和 lockfile。DSH Desktop installer 不修改当前 checkout 的 `node_modules/.pnpm` 或 `pnpm-lock.yaml`。该运行环境不改变 `.env`、Workspace、Provider、Preset 或模型配置。开发 Desktop 的 Electron Vite 输出目录固定为当前 worktree 的 `.local/desktop-development/desktop-out/`。

`COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT` 只定义生产 checkout 启动的 DSH Desktop 移动桥接监听端口，值必须是 1 至 65535 的整数。`prod:start` 从生产 checkout 的 `.env` 读取该值，使用该值完成启动前端口检查，并通过 DSH Desktop 的进程变量 `DSH_DESKTOP_MOBILE_BRIDGE_PORT` 传给 Desktop 主进程。`dev:start` 和 `dev:restart` 通过主开发 checkout 的 `.local/development-port-claims/` 为当前 worktree 声明空闲端口，并使用运行时端口覆盖传给 Desktop 子进程的两个端口变量；开发命令不读取共享 `.env` 中的端口作为开发端口。启动器在 Desktop 子进程监听端口后释放跨进程声明。

`cordis.patch.yml` 是默认 Agent 模型、视觉模型、Provider 环境变量引用、前台 Bash 默认超时和默认 `ComfyUI工作台预设` 的共同来源。当前前台 Bash 默认超时为 `180000` 毫秒；单次 Tool Call 可以在 DSH 允许的上限内显式覆盖该值。`config/product-agent.json` 是产品 Preset 物化结构的来源。Desktop 开发与生产都把当前插件包中的这两份配置安装到各自隔离的 DSH home。

## Web Host 调试配置

`web:start` 和 `web:restart` 先根据 `config/desktop-worktree.json.mainCheckoutPath` 建立 worktree 的 `.env` 与 `node_modules` 链接，再读取 `config/web-development.json`，并依次读取：

1. `config/source-production.json`
2. `config/base.json`
3. `config/profiles/production.json`
4. `config/environment-overrides.json`

`config/web-development.json` 必须包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `runtimeId` | 当前为 `harness-comfyui-web-development` |
| `runtimeRelativeRoot` | 当前为 `.local/web-development` |
| `sourceProductionDefinitionRelativePath` | 当前为 `config/source-production.json` |
| `dshProfile` | 当前为 `comfyui-workbench-development` |
| `userEnvironmentFilePath` | 主开发 checkout `.env` 的绝对路径 |
| `startupWorkspacePath` | Web Host 启动时注册的绝对 Workspace 目录 |

Web Host 的 `stop`、`status`、`health` 和 `logs` 使用 `.local/web-development/state/source-managed.json` 中的受管快照。`web:health` 只读取并报告运行状态，不写入 Desktop 或产品配置。

`web:start` 和 `web:restart` 通过主开发 checkout 的 `.local/development-port-claims/` 为当前 worktree 声明空闲回环端口，并使用该端口覆盖共享环境中的 `HARNESS_COMFYUI_SERVER_PORT`。启动器在 Web Host 子进程监听端口后释放跨进程声明。受管快照保存实际端口；`web:stop`、`web:status`、`web:health` 和 `web:logs` 使用快照中的端口管理当前 worktree 的 Web Host。

当前系统只有 `production` Configuration Profile。

## 项目 Agent Preset 配置

`config/product-agent.json` 是项目自有 Agent Preset 和 Repository Skills 路径的唯一结构化来源。该文件必须只包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `2` |
| `preset.id` | 产品 Preset 的兼容性内部 ID，只使用小写字母、数字和连字符；当前为 `harness-comfyui-cli-candidate` |
| `preset.sourceRootRelativePath` | 仓库根目录内的 canonical Agent Preset 根目录；当前为 `agent-presets` |
| `preset.installRootRelativePath` | 当前 production 或 worktree DSH home 内的安装根目录；当前为 `.agent-presets` |
| `preset.retiredManagedPresetIds` | 本项目需要从安装根目录删除的已退役 Preset ID 数组；每项只使用小写字母、数字和连字符，数组不得包含 `preset.id`，数组项不得重复 |
| `preset.sharedFiles` | 非空且互不重复的 `.mjs` basename 数组；当前包含 `project-tool-visibility.mjs` 和 `project-system-prompt-visibility.mjs` |
| `skills.sourceRootRelativePath` | 当前 checkout 内的 Repository Skills 相对目录；当前为 `.agents/skills` |
| `skills.environmentVariable` | 产品 Preset 读取 Repository Skills 使用的受管环境变量名称；固定为 `HARNESS_COMFYUI_SKILL_DIR` |

`sourceRootRelativePath/<preset.id>` 必须只包含非空普通文件 `agent.cordis.yml` 和 `preset.yml`。每个 shared file 和产品 Preset 在首次写入前全部完成文件类型、可读性、DSH YAML dialect、plugin-row 与 component resolution 检查。任一检查失败时，启动器不开始本轮物化。`installRootRelativePath` 的现有目录链必须由普通目录组成；符号链接或非目录路径会中止准备过程。启动器分别原子替换受管 shared file 和产品 Preset，再删除 `retiredManagedPresetIds` 指定的精确路径。删除符号链接形式的退役路径时，启动器只删除链接，不改变链接目标。启动器保留同一安装根目录中的其他 Preset。

`prod:start`、`prod:restart`、`dev:start`、`dev:restart`、`web:start` 和 `web:restart` 都读取该配置，并把相同的受管 Preset 文件物化到各自隔离的 DSH home。当前插件 `cordis.patch.yml` 把 `harness-comfyui-cli-candidate` 设置为这些环境的默认 Preset；启动器不修改 Harness `standard` Preset 的源码。

`loadProductAgentConfiguration(repositoryRoot)` 验证 Repository Skills 目录存在、目录本身不是符号链接且真实路径位于 `repositoryRoot` 内。Desktop 启动器的 `start` 和 `restart` 命令与 Web Host 环境构建器在启动子进程前调用该函数；Desktop 启动器的 `status`、`logs` 和 `stop` 命令只读取既有运行状态，因此 Repository Skills 配置损坏时仍可用于诊断和停止进程。Desktop 启动器在合并 `.env` 与调用者环境后，把经过验证的 Repository Skills 绝对路径写入 Desktop 子进程环境的 `HARNESS_COMFYUI_SKILL_DIR`。Web Host 环境构建器先从 Web Host 子进程环境中移除调用者提供的全部 `HARNESS_COMFYUI_*` 环境变量，再把经过验证的 Repository Skills 绝对路径写入该子进程环境的 `HARNESS_COMFYUI_SKILL_DIR`。Repository Skills 目录验证失败时，Desktop 启动器和 Web Host 环境构建器都中止对应子进程的启动，并且不读取调用者用户主目录下的 `.agents/skills` 作为 Repository Skills 来源。

## 源码进程配置

`config/source-production.json` 必须包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `runtimeId` | 非空进程标识 |
| `runtimeRelativeRoot` | 仓库内的相对运行目录；当前为 `.local/production` |
| `configurationProfile` | 固定为 `production` |
| `source.catalogPort` | 数据源服务设置尚未保存时使用的默认端口 |
| `logs.source` | `stdout`、`stderr`、`operations` 或 `all` |
| `logs.lines` | 每个日志来源读取的末尾行数，必须为正整数 |

## Configuration Profile

| 字段 | 用途 |
| --- | --- |
| `paths.dataDir` | 数据根目录；启动器固定为 `<runtimeRoot>/shared/data` |
| `paths.apiWorkflowCacheDirectory` | Official API Workflow Cache 目录；启动器固定为 `<runtimeRoot>/shared/data/api-workflow-cache`，并要求该目录是 `paths.dataDir` 的严格子目录 |
| `paths.runRepositoryFile` | Run Repository SQLite 文件 |
| `paths.runDirectory` | Run 文件目录 |
| `paths.savedMediaDirectory` | Saved Media 目录 |
| `paths.logDirectory` | Host 日志目录 |
| `comfyui.defaultInstanceId` | 默认 ComfyUI 实例 ID |
| `comfyui.frontendCompiler.browserExecutablePath` | 标准 Node.js 官方前端编译 Worker 在 cache miss 时直接启动的本机 Chrome 或 Chromium 绝对路径；production 默认值为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| `comfyui.frontendCompiler.instanceCacheEpoch` | Host 级非空缓存代次；值变化会使该 Host 下全部已登记 ComfyUI 实例的旧缓存均不再命中 |
| `comfyui.frontendCompiler.timeoutMs` | 单次浏览器会话从启动到前端初始化及 `graphToPrompt()` 导出的正整数总时限，毫秒；production 默认值为 `120000` |
| `comfyui.frontendCompiler.preReadiness.devToolsPortMs` | 本机浏览器发布 `DevToolsActivePort` 的正整数阶段时限，毫秒；production 默认值为 `10000` |
| `comfyui.frontendCompiler.preReadiness.targetCreateMs` | 本机 Chrome DevTools HTTP 接口创建页面目标的正整数阶段时限，毫秒；production 默认值为 `10000` |
| `comfyui.frontendCompiler.preReadiness.webSocketConnectMs` | Harness Host 连接本机浏览器目标 WebSocket 的正整数阶段时限，毫秒；production 默认值为 `10000` |
| `comfyui.frontendCompiler.preReadiness.domainEnableMs` | 本机浏览器目标完成全部 Chrome DevTools domain enable 命令的共同正整数阶段时限，毫秒；production 默认值为 `10000` |
| `comfyui.frontendCompiler.preReadiness.navigationMs` | 本机浏览器目标完成 `Page.navigate` 的正整数阶段时限，毫秒；production 默认值为 `10000` |
| `comfyui.frontendCompiler.preReadiness.infrastructureAttempts` | 同一个 cache miss 在前端 readiness 之前发生基础设施故障时使用的浏览器会话尝试次数，只允许 `1` 或 `2`；production 默认值为 `2` |
| `source.catalogPort` | 数据源服务 Settings 首次注册时使用的默认端口；production 默认值为 `18093` |
| `jobs.pollIntervalMs` | ComfyUI Job 轮询间隔，毫秒 |
| `jobs.missingObservationMs` | 缺失 Job observation 判定时间，毫秒 |
| `media.maxFileBytes` | 单个 ComfyUI 输出媒体允许保存的最大字节数 |
| `server.host` | Harness Web 监听地址；固定为 `127.0.0.1`，配置文件不能改为其他地址 |
| `server.port` | Harness Web 端口；当前为 `4173` |
| `client.runRefreshIntervalMs` | Client 查询刷新间隔，毫秒 |
| `process.shutdownTimeoutMs` | 停止进程与释放端口的超时，毫秒 |

官方前端编译 Worker 不通过 macOS LaunchServices 启动浏览器。Worker 使用独立临时 profile、`--use-mock-keychain` 和 `--disable-features=DialMediaRouteProvider` 运行 headless Chrome；这些固定运行参数不接受环境变量覆盖。

启动器通过环境映射写入全部运行值。运行目录与 Official API Workflow Cache 目录始终由 `source-production.json` 生成。调用者可以覆盖以下业务值：

- `HARNESS_COMFYUI_DEFAULT_INSTANCE_ID`
- `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH`
- `HARNESS_COMFYUI_FRONTEND_CACHE_EPOCH`
- `HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS`
- `HARNESS_COMFYUI_FRONTEND_DEVTOOLS_PORT_TIMEOUT_MS`
- `HARNESS_COMFYUI_FRONTEND_TARGET_CREATE_TIMEOUT_MS`
- `HARNESS_COMFYUI_FRONTEND_WEBSOCKET_CONNECT_TIMEOUT_MS`
- `HARNESS_COMFYUI_FRONTEND_DOMAIN_ENABLE_TIMEOUT_MS`
- `HARNESS_COMFYUI_FRONTEND_NAVIGATION_TIMEOUT_MS`
- `HARNESS_COMFYUI_FRONTEND_INFRASTRUCTURE_ATTEMPTS`
- `HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS`
- `HARNESS_COMFYUI_MEDIA_MAX_FILE_BYTES`
- `HARNESS_COMFYUI_SERVER_PORT`

`config/environment-overrides.json` 中 `HARNESS_COMFYUI_SKILL_DIR` 的声明使用 `valueType: "string"` 和 `passThrough: true`，并且不包含 `target`。配置加载器因此接受 `HARNESS_COMFYUI_SKILL_DIR` 的字符串值，但不会把该值写入 `ConfigurationProfile` 的任何字段。

`HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY` 由启动器固定为运行数据目录中的 `api-workflow-cache`，不能通过调用者环境改变。`HARNESS_COMFYUI_SERVER_HOST` 只把已经验证的 `127.0.0.1` 传给 Harness 子进程，不能覆盖 `server.host`。`config/environment-overrides.json` 是环境变量名称、Configuration Profile 目标字段、值类型和 Host 子进程运行值路径的唯一结构化来源。每项声明都使用 `valueType` 指定 `string` 或 `number`。覆盖 Configuration Profile 的声明使用 `target` 指定目标字段。进入 Host 受管环境的声明使用 `hostRuntimePath` 指定运行配置中的取值路径。只进入 Host 且不覆盖 Configuration Profile 的声明使用 `passThrough: true`，并且不使用 `target`。加载当前配置时，任何未在该文件中声明的 `HARNESS_COMFYUI_*` 环境变量都会中止配置加载。

任一已登记 ComfyUI 实例升级前端、安装或升级影响 Workflow 序列化的自定义节点、或者改变前端导出行为后，必须修改 Host 级 `comfyui.frontendCompiler.instanceCacheEpoch` 并执行对应环境的 `pnpm prod:restart`、`pnpm dev:restart` 或 `pnpm web:restart`。此次修改会使该 Host 下全部已登记实例的旧缓存均不再命中。Host 不会把损坏缓存或 identity 不匹配当作 cache miss；调用者应当根据 `COMFYUI_API_WORKFLOW_CACHE_INVALID` 错误定位对应缓存文件或修改 Host 级缓存代次。

## 配置变更

Configuration Profile 文件不热更新。生产 Desktop 修改后执行 `pnpm prod:restart` 与 `pnpm prod:status`；开发 Desktop 修改后执行 `pnpm dev:restart` 与 `pnpm dev:status`；Web Host 修改后执行 `pnpm web:restart`、`pnpm web:status` 与只读的 `pnpm web:health`。Web Host 的受管快照保存运行中的版本、运行根目录、监听地址与端口、数据路径、Official API Workflow Cache 路径、停止超时和日志读取参数。

## Harness-ComfyUI 数据源服务设置

Host 使用 `harness-comfyui-source` Settings namespace 保存数据源服务 URL 和端口。Client 在 Harness 的“ComfyUI”设置页中通过“数据源服务”页签保存以下字段：

| 字段 | 规则与用途 |
| --- | --- |
| `configuration.url` | 数据源服务的 HTTP 或 HTTPS URL；该值包含协议和主机名，可以包含根路径 `/`，不包含用户名、密码、端口、其他路径、query 或 fragment |
| `configuration.port` | 数据源服务端口，必须是 `1` 至 `65535` 的整数 |

Host 每次执行语义查询、读取 ComfyUI 实例或读取 Workflow bundle 时，均使用该 namespace 的最新值。保存成功后，Host 的下一次请求立即使用新的 URL 和端口，无需重启 Harness。配置文件中的 `source.catalogPort` 和 `HARNESS_COMFYUI_CATALOG_PORT` 只提供该 namespace 的默认端口；已保存的 Settings 用户值覆盖默认端口。

插件发行包包含 `scripts/source-client/imagegen-semantic-query.mjs` 和 `scripts/source-client/imagegen-comfyui-source-read.mjs`。Host 使用这两个内置客户端请求已配置的数据源服务，不读取或执行数据源仓库中的文件。

## 图片读取设置

Host 使用 `harness-comfyui-image-reader-profiles` Settings namespace 保存图片读取设置。Client 的“图片读取”设置页通过已保存配置激活 Remote、单配置保存 Remote 或独立删除 Remote 修改该 namespace。该 namespace 包含以下属性：

| 字段 | 规则与用途 |
| --- | --- |
| `configuration.activeProfileId` | 下一次 `inspect_image` 使用的配置 ID；该值必须对应 `configuration.profiles[]` 中的一份配置 |
| `configuration.profiles[]` | 一至二十份命名图片读取配置；配置 ID 在同一列表内必须唯一 |
| `configuration.profiles[].id` | 配置的稳定小写字母、数字、下划线或连字符 ID，最长 80 个字符 |
| `configuration.profiles[].name` | 设置页显示的配置名称，最长 80 个字符 |
| `configuration.profiles[].connectionType` | `runtime` 表示系统 Provider；`openai-compatible` 表示自定义 Chat Completions 接口 |
| `configuration.profiles[].provider` | `runtime` 配置使用的精确 Harness Provider route；`openai-compatible` 配置必须保存空字符串 |
| `configuration.profiles[].endpoint` | `openai-compatible` 配置使用的完整 HTTP 或 HTTPS Chat Completions 地址；Host 不自动追加路径；`runtime` 配置必须保存空字符串 |
| `configuration.profiles[].model` | 系统 Provider 或 OpenAI 兼容接口接受的精确视觉模型 ID |
| `configuration.profiles[].hasApiKey` | 只表示该配置是否已经保存 API Key；该布尔值由 Host 根据 secret 凭据重新计算 |
| `configuration.profiles[].defaultPrompt` | `inspect_image` 或 `image inspect --stdin` 省略本次 `prompt` 时使用的默认读图提示词 |
| `configuration.profiles[].temperature` | 独立视觉模型调用使用的数值，范围为 `0` 至 `2` |
| `configuration.profiles[].maxTokens` | 独立视觉模型调用允许返回的最大 Token 数，范围为 `1` 至 `32768` |
| `credentials.<profileId>` | OpenAI 兼容配置的可选 API Key；该字典的值使用 Settings `secret` role，浏览器只收到对应 `hasApiKey` 状态 |

系统 Provider 与模型候选来自 Harness 当前 LLM 运行时，并且设置页只列出明确声明 `image` 输入能力的模型。OpenAI 兼容配置不依赖系统 Provider 目录；Host 向完整地址发送 OpenAI Chat Completions 格式的单张图片 Data URL、提示词、模型 ID、`temperature` 和 `max_tokens`。HTTP 地址不会提供传输加密；配置 API Key 时，使用者必须确认目标内网链路符合部署要求。

设置页把 Host 返回的实际生效配置与 Client 当前编辑草稿分别保存。已保存配置选择器只列出 Host 返回的 `configuration.profiles[]`；使用者选择另一份已保存配置时，Client 立即调用激活 Remote，Host 只修改 `configuration.activeProfileId`，不修改配置内容或凭据。外部 Settings 写操作在草稿编辑期间切换实际生效配置时，普通保存只保存当前草稿并继续使用外部写操作已经激活的配置。新建或复制但没有保存的配置只存在于 Client 草稿，离开设置页后丢弃，且不会参与图片读取。

设置页只提交当前编辑配置、`operation: create | update` 和明确的最终 `activateProfileId`，不提交 Client 中的配置数组或 `hasApiKey`。Host 每次保存都读取最新 Settings：`update` 在原索引替换仍然存在的同 ID 配置，`create` 只把尚不存在的新 ID 配置追加到列表末尾；Host 在同一次 `settings.replace()` 中保存草稿并把最终目标写入 `activeProfileId`。因此，“保存 A 并切换 B”不会产生 A 临时生效的中间状态。Host 根据持久化凭据派生每份配置的 `hasApiKey`。保存 runtime 配置会删除该 ID 的旧 API Key；保存 OpenAI 兼容配置时，`keep` 保留现有值，`replace` 写入新的 write-only API Key，`clear` 删除现有值。Client 不会收到已保存的 API Key 明文。

删除已保存配置使用独立 Host Remote。删除操作同时删除 `credentials.<profileId>`；删除非活动配置保持原 `activeProfileId`，删除活动配置时优先选择删除前列表中的后一项，不存在后一项时选择前一项。最后一份配置不能删除。Host 按调用顺序串行执行每次保存、激活或删除的“读取最新 Settings、校验、合并、`settings.replace()`”完整临界区，防止重叠请求根据旧快照覆盖先完成的修改。保存、激活或删除成功后，Host 返回完整 `configuration`；Client 用返回值替换持久化快照并重新加载 Host 指定的活动配置。

Host 与 Client 使用同一固定顺序校验当前保存请求。每条名称、连接参数、模型、默认提示词、温度、最大输出 Token 数或 API Key 规则具有独立错误码；设置页在对应输入项附近显示该规则，并在保存按钮附近显示同一错误码的总结。其他配置不参与当前保存请求，也不能用 Client 中的未保存输入阻止当前配置保存。保存持久化失败使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`；激活持久化失败使用 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`；删除持久化失败使用 `IMAGE_READER_SETTINGS_DELETE_FAILED`。Host 通过 Typert 业务失败载体把这些具体错误码发送给 Client，设置页不会把这些错误码改写为通用设置请求错误。Host 拒绝覆盖同 ID 的新建配置、重新创建并发删除的更新目标或激活不存在的已保存配置。保存或激活成功后，Host 返回的活动配置实时应用于下一次 `inspect_image` 调用，不需要重启 Host。

v0.36.0 继续注册旧 namespace `harness-comfyui-image-reader` 以读取 v0.35.x 的单配置用户值。仅当旧 namespace 存在用户值并且新 namespace 尚无用户值时，Host 把旧 Provider、模型、默认提示词、`temperature` 和最大输出 Token 原样迁移到名为“原图片读取配置”的 `runtime` 配置。新 namespace 已存在用户值时，Host 不会重复迁移或覆盖。
