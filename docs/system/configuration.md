# 配置规范

## Desktop 基线与实例配置

config/desktop-baseline.json 是开发、生产和真实 Desktop 测试共同读取的基线配置。

| 配置对象 | 字段用途 |
| --- | --- |
| source | repository 与 commit 固定源码身份；relativePath 指定相对源码目录；stableWorkspace 指定 Stable 包目录 |
| packages | desktop、harness、electron 分别声明运行包名称与精确版本 |
| profile | name 指定 Profile 名称；pluginPackageName 指定插件名称；setupStateVersion 与 setupRevision 指定首次设置记录格式；setupStateRootDirectory 与 setupStateFilename 指定 user-data 下记录目录和文件名 |
| startup | host、mode、networkExposure、openBrowser 定义新实例初始运行设置；readyTimeoutMs 与 stopTimeoutMs 定义启动等待和停止期限 |
| entrypoints | desktopMain 指定 Stable workspace 中已构建的 Electron 主入口 |

scripts/desktop/baseline.mjs 校验源码 origin、完整 commit 和实际安装包版本。config/desktop-production.json 只保存 runtimeRelativeRoot、environmentFileRelativePath 和 startupWorkspacePath。config/desktop-worktree.json 保存 mainCheckoutPath、开发 runtimeRelativeRoot 和 managedDshSettings。开发命令相对主 checkout 解析基线源码目录，生产命令相对生产 checkout 解析。测试使用同一基线身份；路径覆盖不能绕过版本校验。

`managedDshSettings` 定义开发 DSH Settings 的三个来源路径：`providerConfigurationRelativePath` 和 `imageReaderConfigurationRelativePath` 相对当前 worktree 解析，文件由 Git 跟踪且不得包含凭据；`privateSourceDshHomeRelativePath` 相对 main checkout 解析，目录必须位于 Git 忽略范围。`dev:start` 和 `dev:restart` 从该私密目录的 `settings.yaml` 读取已声明图片配置所需的凭据，并按照 Provider 配置声明的 credential ref 名称从 `.credentials.yaml` 读取对应凭据值。启动器只复制受管配置所需的凭据。

`config/desktop-development-provider-settings.json` 的 `managedNamespaces` 固定包含 `agent-default-model`、`llm-deepseek` 和 `llm-pi-ai`；`credentialRefs` 列出启动器必须从 main 私密来源读取的 Provider credential ref 名称。`config/image-reader-profiles.json.configuration` 使用图片读取 Settings 的完整配置结构，但不包含 `credentials`。开发启动器把这两份配置写入当前 worktree 的隔离 DSH home，并保留其中的非受管用户值。

独立 worktree 的 .env 链接到主 checkout 已有 .env。worktree 自有 node_modules 由依赖准备模块建立：业务依赖与构建工具链接到主 checkout，宿主 peerDependencies 链接到候选 Stable workspace 的解析目录。已有不符合目标的路径会产生明确错误，不覆盖来源目录，也不执行 pnpm install。

每个实例分别保存 HOME、DSH_HOME、Profile、安装产物、日志、PID 和 desktop-out 启动入口。Profile 的 package.json 声明插件来源，dsh.profile.bundles 注册插件。候选官方 materializeProfile 在首次启动建立 Profile 的 pnpm-lock.yaml 与 node_modules/.modules.yaml，后续启动复用这些记录。Stable Desktop 的首次设置初始化只针对新实例；开发启动器仍在每次启动中更新上述受管开发 Settings。Repository Skills 的唯一源码路径由 config/product-agent.json.skills 定义。

Host 端口由独立实例分配并写入运行状态。启动器核对端口属于本次 Desktop 进程组，并等待本次启动 run 的 startup.run.completed 事件及 rendererStatus=healthy。移动桥接端口不属于 anywhere Stable 的就绪条件。远程调试端口只在显式测试配置下启用。

仓库根 .env.example 提供 OPENCODE_GO_API_KEY 与允许调用者覆盖的 HARNESS_COMFYUI_* 业务变量示例。数据源服务 URL 与端口由用户在“ComfyUI”设置页保存。

`cordis.patch.yml` 是默认 Agent 模型、视觉模型、Provider 环境变量引用、前台 Bash 默认超时和默认 `ComfyUI工作台预设` 的共同来源。当前前台 Bash 默认超时为 `180000` 毫秒；单次 Tool Call 可以在 DSH 允许的上限内显式覆盖该值。`config/product-agent.json` 定义项目 Agent Preset 的写入结构：`repositoryRoot` 是当前插件包根目录，项目 Agent Preset 源码目录是 `<repositoryRoot>/<preset.sourceRootRelativePath>`，安装目录是 `<dshHome>/<preset.installRootRelativePath>`，受管内容包括 `preset.sharedFiles` 列出的共享 component 文件、`preset.id` 与 `preset.additionalManagedPresetIds` 对应的 Preset 目录，以及 `preset.retiredManagedPresetIds` 对应的待删除 Preset 目录。Desktop 开发与生产启动器在启动 DSH Desktop 前使用当前插件包中的 `cordis.patch.yml`，将默认及附加 Preset 配置和共享 component 文件写入各自隔离的 DSH home，并删除 `preset.retiredManagedPresetIds` 指定的目录。

## Web Host 调试配置

`web:start` 和 `web:restart` 先根据 `config/desktop-worktree.json.mainCheckoutPath` 建立 worktree 的 `.env` 链接与独立依赖目录，再读取 `config/web-development.json`，并依次读取：

1. `config/source-production.json`
2. `config/base.json`
3. `config/profiles/production.json`
4. `config/environment-overrides.json`

`config/web-development.json` 必须包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `runtimeId` | Web Host 调试进程的运行标识；当前为 `harness-comfyui-web-development` |
| `runtimeRelativeRoot` | 以当前 worktree 根目录为基准的相对运行目录；当前为 `.local/web-development` |
| `sourceProductionDefinitionRelativePath` | 以当前 worktree 根目录为基准的源码进程配置文件相对路径；当前为 `config/source-production.json` |
| `dshProfile` | 写入当前 DSH home 并由 DSH `--profile` 选择的配置对象名称；当前为 `comfyui-workbench-development`。该字段不选择 Harness 的 `ConfigurationProfile`；Harness 业务配置由 `source-production.json.configurationProfile` 选择 |
| `userEnvironmentFilePath` | 主开发 checkout `.env` 的绝对路径 |
| `startupWorkspacePath` | Web Host 启动时注册的绝对 Workspace 目录 |

Web Host 的 `stop`、`status`、`health` 和 `logs` 使用 `.local/web-development/state/source-managed.json` 中的受管快照。该快照保存 `schemaVersion`、`runtimeId`、`activeVersion`、绝对路径 `runtimeRoot`、`configurationProfile`、`host`、`port`、`paths`、`comfyui`、`source`、`client`、`process` 和 `logs`。`web:health` 只读取并报告运行状态，不写入 Desktop 或产品配置。

`web:start` 和 `web:restart` 通过主开发 checkout 的 `.local/development-port-claims/` 为当前 worktree 声明空闲回环端口，并使用该端口覆盖共享环境中的 `HARNESS_COMFYUI_SERVER_PORT`。启动器在 Web Host 子进程监听端口后释放跨进程声明。受管快照保存实际端口；`web:stop`、`web:status`、`web:health` 和 `web:logs` 使用快照中的端口管理当前 worktree 的 Web Host。

当前系统只有 `production` Configuration Profile。

## 项目 Agent Preset 配置

`config/product-agent.json` 是项目自有 Agent Preset 和 Repository Skills 路径的唯一结构化来源。该文件必须只包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `3` |
| `preset.id` | 默认受管产品 Preset 的兼容性内部 ID，只使用小写字母、数字和连字符；当前为 `harness-comfyui-cli-candidate` |
| `preset.additionalManagedPresetIds` | 附加受管产品 Preset ID 数组；每项只使用小写字母、数字和连字符，数组项互不重复，且不得包含 `preset.id` 或 `preset.retiredManagedPresetIds` 中的 ID；当前包含 `harness-comfyui-iteration` |
| `preset.sourceRootRelativePath` | 仓库根目录内的项目 Agent Preset 源码根目录；当前为 `agent-presets` |
| `preset.installRootRelativePath` | 当前 production 或 worktree DSH home 内的安装根目录；当前为 `.agent-presets` |
| `preset.retiredManagedPresetIds` | 本项目需要从安装根目录删除的已退役 Preset ID 数组；每项只使用小写字母、数字和连字符，数组不得包含默认或附加受管 Preset ID，数组项不得重复 |
| `preset.sharedFiles` | 非空且互不重复的 `.mjs` basename 数组；每个源文件位于 `<repositoryRoot>/<preset.sourceRootRelativePath>/`，启动器把它写入 `<dshHome>/<preset.installRootRelativePath>/`，受管 Preset 的 `agent.cordis.yml` 按需通过相对路径加载这些共享 component；当前包含 `project-tool-visibility.mjs`、`project-system-prompt-visibility.mjs` 、`project-subagent-workspace.mjs` 和 `project-iteration-dispatch.mjs` |
| `skills.sourceRootRelativePath` | 当前 checkout 内的 Repository Skills 相对目录；当前为 `.agents/skills` |
| `skills.environmentVariable` | 产品 Preset 读取 Repository Skills 使用的受管环境变量名称；固定为 `HARNESS_COMFYUI_SKILL_DIR` |

`<repositoryRoot>/<preset.sourceRootRelativePath>/<preset-id>` 必须为 `preset.id` 和 `preset.additionalManagedPresetIds` 中的每个受管 ID 提供项目 Agent Preset 源码目录；每个目录只包含非空普通文件 `agent.cordis.yml` 和 `preset.yml`。启动器在首次写入配置前检查 `preset.sharedFiles` 中的每个 `.mjs` 文件是非空、可读的普通文件，可以作为模块加载，并且导出 `apply()`。启动器还使用 DSH YAML dialect 解析每个受管 Preset 的 `agent.cordis.yml`，检查顶层及 group 配置中的每一项都是包含插件名称的 plugin row，并确认每个非 `cordis:` component 都能由 DSH 解析；相对路径 component 还必须通过前述共享 `.mjs` 文件检查。任一检查失败时，启动器不开始本轮配置写入。`<dshHome>/<preset.installRootRelativePath>` 的现有目录链必须由普通目录组成；符号链接或非目录路径会中止准备过程。启动器分别原子替换 `preset.sharedFiles` 指定的受管共享文件，以及 `preset.id` 和 `preset.additionalManagedPresetIds` 指定的每个受管产品 Preset，再删除 `preset.retiredManagedPresetIds` 指定的精确路径。删除符号链接形式的退役路径时，启动器只删除链接，不改变链接目标。启动器保留同一安装根目录中的其他 Preset。

`prod:start`、`prod:restart`、`dev:start`、`dev:restart`、`web:start` 和 `web:restart` 都读取该配置，并把 `preset.id` 与 `preset.additionalManagedPresetIds` 对应的相同 Preset 配置写入各自隔离的 DSH home。当前插件 `cordis.patch.yml` 把 `harness-comfyui-cli-candidate` 设置为这些环境的默认 Preset；附加受管 Preset 不改变默认值。启动器不修改 Harness `standard` Preset 的源码。

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
| `comfyui.frontendCompiler.preReadiness.infrastructureAttempts` | 同一次缓存未命中时的浏览器会话尝试次数；缓存未命中表示目标缓存文件不存在。重试只覆盖前端就绪检查开始前的临时浏览器目录创建失败、浏览器启动失败、浏览器在发布有效 `DevToolsActivePort` 前退出、`DevToolsActivePort` 缺失或无效、创建 DevTools 页面目标失败、连接 DevTools WebSocket 失败、启用 DevTools domain 失败、页面目标崩溃，以及 `Page.navigate` 失败；对应阶段超时也属于同类故障。前端就绪检查要求页面加载完成、ComfyUI app 同时提供 graph、`loadGraphData()` 与 `graphToPrompt()`，并且 splash loader 已隐藏。请求拦截失败、前端就绪检查失败和 Workflow 导出失败不会重试。该字段只允许 `1` 或 `2`；production 默认值为 `2` |
| `source.catalogPort` | 数据源服务 Settings 首次注册时使用的默认端口；production 默认值为 `18093` |
| `jobs.pollIntervalMs` | ComfyUI Job 轮询间隔，毫秒 |
| `jobs.missingObservationMs` | 已提交 Run 首次收到 ComfyUI Job `unknown` 结果、`COMFYUI_CONNECTION_FAILED` 或 `COMFYUI_REQUEST_TIMEOUT` 时开始计时；后续 `pending` 或 `running` 结果清除该起点，再次收到前述缺失结果且已经达到该毫秒数时把 Run 判定为失败 |
| `media.maxFileBytes` | 单个 ComfyUI 输出媒体允许保存的最大字节数 |
| `server.host` | Harness Web 监听地址；固定为 `127.0.0.1`，配置文件不能改为其他地址 |
| `server.port` | Harness Web 端口；当前为 `4173` |
| `client.runRefreshIntervalMs` | Client 查询刷新间隔，毫秒 |
| `process.shutdownTimeoutMs` | 停止进程与释放端口的超时，毫秒 |

官方前端编译 Worker 不通过 macOS LaunchServices 启动浏览器。Worker 使用独立临时 profile、`--use-mock-keychain` 和 `--disable-features=DialMediaRouteProvider` 运行 headless Chrome；这些固定运行参数不接受环境变量覆盖。

`scripts/production/runtime.mjs` 管理的旧 Web 生产 context 和 Web Host 调试 context 通过环境映射写入全部运行值。旧 Web 生产 context 的运行目录由 `source-production.json.runtimeRelativeRoot` 定义；Web Host 调试 context 使用 `web-development.json.runtimeRelativeRoot` 覆盖该目录。两个 context 的 Official API Workflow Cache 目录都由各自生效的运行目录生成。Desktop 生产与 Desktop 开发的运行目录分别由 `desktop-production.json` 和 `desktop-worktree.json` 定义。调用者可以覆盖以下业务值：

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

任一已登记 ComfyUI 实例升级前端、安装或升级影响 Workflow 序列化的自定义节点、或者改变前端导出行为后，必须修改 Host 级 `comfyui.frontendCompiler.instanceCacheEpoch` 并执行对应环境的 `pnpm prod:restart`、`pnpm dev:restart` 或 `pnpm web:restart`。此次修改会使该 Host 下全部已登记实例的旧缓存均不再命中。Host 不会把无效 JSON、缓存 identity 不匹配或 API Workflow 结构无效当作缓存未命中。`COMFYUI_API_WORKFLOW_CACHE_INVALID` 指明的单个缓存 JSON 存在上述问题时，维护者应先停止对应环境，删除错误消息指明的缓存文件，再重新启动该环境并重试原请求；文件不存在时，Host 会执行新的官方前端导出并写入缓存。需要同时废弃该 Host 下全部已登记实例的缓存时，维护者应修改 `comfyui.frontendCompiler.instanceCacheEpoch` 并重启对应环境。

## 配置变更

Configuration Profile 文件不热更新。生产 Desktop 修改后执行 `pnpm prod:restart` 与 `pnpm prod:status`；开发 Desktop 修改后执行 `pnpm dev:restart` 与 `pnpm dev:status`；Web Host 修改后执行 `pnpm web:restart`、`pnpm web:status` 与只读的 `pnpm web:health`。

## Harness-ComfyUI 数据源服务设置

Host 使用 `harness-comfyui-source` Settings namespace 保存数据源服务 URL 和端口。Client 在 Harness 的“ComfyUI”设置页中通过“数据源服务”页签保存以下字段：

| 字段 | 规则与用途 |
| --- | --- |
| `configuration.url` | 数据源服务的 HTTP 或 HTTPS URL；该值包含协议和主机名，可以包含根路径 `/`，不包含用户名、密码、端口、其他路径、query 或 fragment |
| `configuration.port` | 数据源服务端口，必须是 `1` 至 `65535` 的整数 |

Host 每次执行语义查询、读取 ComfyUI 实例或读取 Workflow bundle 时，均使用该 namespace 的最新值。保存成功后，Host 的下一次请求立即使用新的 URL 和端口，无需重启 Harness。配置文件中的 `source.catalogPort` 和 `HARNESS_COMFYUI_CATALOG_PORT` 只提供该 namespace 的默认端口；已保存的 Settings 用户值覆盖默认端口。

插件发行包包含 `scripts/source-client/imagegen-semantic-query.mjs` 和 `scripts/source-client/imagegen-comfyui-source-read.mjs`。Host 使用这两个内置客户端请求已配置的数据源服务，不读取或执行数据源仓库中的文件。

## 图片读取设置

Host 使用 `harness-comfyui-image-reader-profiles` Settings namespace 保存图片读取设置。Client 的“图片读取”设置页调用 Host 的 `harnessComfyuiImageReader/activateProfile`、`harnessComfyuiImageReader/saveProfile` 和 `harnessComfyuiImageReader/deleteProfile` 接口修改该 namespace。该 namespace 包含以下属性：

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

系统 Provider 与模型候选来自 Harness 当前 LLM 运行时，并且设置页只列出明确声明 `image` 输入能力的模型。OpenAI 兼容配置不依赖系统 Provider 目录；Host 向完整地址发送 OpenAI Chat Completions 格式的单张图片 Data URL、提示词、模型 ID、`temperature` 和 `max_tokens`。当完整地址使用 HTTP 时，请求中的 Bearer API Key（如已配置）和 Data URL 图片数据不受 TLS 传输加密保护。

设置页把 Host 返回的实际生效配置与 Client 当前编辑草稿分别保存。已保存配置选择器只列出 Host 返回的 `configuration.profiles[]`；使用者选择另一份已保存配置时，Client 立即调用激活 Remote，Host 只修改 `configuration.activeProfileId`，不修改配置内容或凭据。外部 Settings 写操作在草稿编辑期间切换实际生效配置时，普通保存只保存当前草稿并继续使用外部写操作已经激活的配置。新建或复制但没有保存的配置只存在于 Client 草稿，离开设置页后丢弃，且不会参与图片读取。

设置页提交当前编辑配置、`operation: create | update`、最终 `activateProfileId`，以及 OpenAI 兼容配置所需的 `credential`；设置页不提交 Client 中的配置数组或 `hasApiKey`。Host 每次保存都读取最新 Settings：`update` 在原索引替换仍然存在的同 ID 配置，`create` 只把尚不存在的新 ID 配置追加到列表末尾；Host 在同一次 `settings.replace()` 中保存草稿并把最终目标写入 `activeProfileId`。因此，“保存 A 并切换 B”不会产生 A 临时生效的中间状态。Host 根据持久化凭据派生每份配置的 `hasApiKey`。runtime 配置的保存请求不包含 `credential`，Host 保存该配置时删除同 ID 的旧 API Key。OpenAI 兼容配置的保存请求必须包含 `credential: { action: "keep" }`、`credential: { action: "clear" }` 或 `credential: { action: "replace", apiKey: <新 API Key> }`；`keep` 保留现有值，`clear` 删除现有值，`replace` 写入请求中的新 API Key。新 API Key 只随 `replace` 请求发送；Host 的保存、读取、激活和删除响应均不返回 API Key 明文，只返回由持久化凭据派生的 `hasApiKey`。

删除已保存配置使用独立 Host Remote。删除操作同时删除 `credentials.<profileId>`；删除非活动配置保持原 `activeProfileId`，删除活动配置时优先选择删除前列表中的后一项，不存在后一项时选择前一项。最后一份配置不能删除。Host 按调用顺序串行执行每次保存、激活或删除的“读取最新 Settings、校验、合并、`settings.replace()`”完整临界区，防止重叠请求根据旧快照覆盖先完成的修改。保存、激活或删除成功后，Host 返回完整 `configuration`；Client 用返回值替换持久化快照并重新加载 Host 指定的活动配置。

Host 与 Client 使用同一固定顺序校验当前保存请求。每条名称、连接参数、模型、默认提示词、温度、最大输出 Token 数或 API Key 规则具有独立错误码；设置页在对应输入项附近显示该规则，并在保存按钮附近显示同一错误码的总结。其他配置不参与当前保存请求，也不能用 Client 中的未保存输入阻止当前配置保存。保存持久化失败使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`；激活持久化失败使用 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`；删除持久化失败使用 `IMAGE_READER_SETTINGS_DELETE_FAILED`。Host 通过 Typert 业务失败载体把这些具体错误码发送给 Client，设置页不会把这些错误码改写为通用设置请求错误。Host 拒绝覆盖同 ID 的新建配置、重新创建并发删除的更新目标或激活不存在的已保存配置。保存或激活成功后，Host 返回的活动配置实时应用于下一次 `inspect_image` 调用，不需要重启 Host。

当前 Host 启动时同时注册旧 namespace `harness-comfyui-image-reader` 和新 namespace `harness-comfyui-image-reader-profiles`，并检查两个 namespace 的用户值。仅当旧 namespace 存在用户值并且新 namespace 尚无用户值时，当前 Host 把旧 Provider、模型、默认提示词、`temperature` 和最大输出 Token 原样迁移到名为“原图片读取配置”的 `runtime` 配置。新 namespace 已存在用户值时，当前 Host 不会重复迁移或覆盖。

## 图片迭代角色配置

agent-presets/harness-comfyui-iteration/agent.cordis.yml 的 composition-agent、generation-agent、observation-agent、comparison-agent 四项均加载 ../project-iteration-dispatch.mjs。每项 config 的字段用途如下。

| 字段 | 用途 |
|---|---|
| toolName、description | 角色工具的名称与调用说明 |
| persona | 对应子 Agent 的独立 system prompt，定义其职责、工作流程和结果文件要求 |
| agentOptions.provider、agentOptions.model、agentOptions.reasoningEffort | 对应子 Agent 的模型供应商、模型及推理设置 |
| provider | spawn，创建独立子会话 |
| maxDepth | 1，子 Agent 不能继续创建子 Agent |
| toolFilter.deny | 子 Agent 不可使用的工具名称列表 |
| parameters | 模型可见的调用参数 JSON Schema，定义本次要求、材料、参考和输出路径的数据结构 |
| taskTemplate.title | 本角色任务消息的标题 |
| taskTemplate.sections[].heading、taskTemplate.sections[].fields | 消息分组标题及该分组按顺序呈现的参数名；参数值以 JSON 保存到消息正文 |
| outputSchema | 工具返回值 JSON Schema；首次返回 kind 和 subagentId，续派返回 messageId |

同一 agent.cordis.yml 中 id 为 persona 的配置项通过 config.text 定义主 Agent 的调度与交付职责。主 Agent 首次调用角色工具时省略 agent_id，续派时填写原 subagentId。component 将本次参数按模板组装后交给 DSH 原生 startContinuable 或 sendMessage；DSH 发送子任务完成通知。tool-subagent-control 项提供子 Agent 向父 Agent 报告问题的 send_message 和主 Agent 中断任务的 interrupt_agent。交接文件名由迭代 Skill 的 records.md 定义。
