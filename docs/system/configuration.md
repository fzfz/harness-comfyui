# 配置规范

## 当前配置的读取顺序

`prod:start` 和 `prod:restart` 按以下顺序读取 UTF-8 JSON 对象：

1. `config/source-production.json`
2. `config/base.json`
3. `config/profiles/production.json`
4. `config/environment-overrides.json`

`source-production.json` 定义进程运行位置和 Source CLI。`base.json` 提供完整 Configuration Profile，`profiles/production.json` 递归覆盖同名属性，最后应用 `environment-overrides.json` 允许的环境变量。未知属性、未知 `HARNESS_COMFYUI_*` 环境变量、类型错误和无效路径都会中止当前配置的加载。

运行中存在 `.local/source-production-managed.json` 时，`prod:stop`、`prod:status`、`prod:health` 和 `prod:logs` 直接使用受管快照，不重读上述四个文件。没有受管快照时，这四个命令读取当前配置。

当前系统只有 `production` Configuration Profile。

独立 worktree 的 `worktree:start` 和 `worktree:restart` 先读取 `config/worktree-development.json`，再按上述顺序读取 `config/source-production.json` 与三个 Configuration Profile 文件。开发定义只替换 runtime ID、runtime root、DSH Profile、用户环境文件和 startup workspace；Source CLI、Catalog port、Configuration Profile 和日志参数继续以 `config/source-production.json` 为唯一来源。

## 独立 worktree 开发配置

`config/worktree-development.json` 必须包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `runtimeId` | 非空开发进程标识 |
| `runtimeRelativeRoot` | 当前 worktree 内的相对运行目录；当前为 `.local/worktree-development` |
| `sourceProductionDefinitionRelativePath` | 当前 worktree 内的生产 Source 定义路径；当前为 `config/source-production.json` |
| `dshProfile` | 只包含小写字母、数字和连字符的开发 DSH Profile 名称 |
| `userEnvironmentFilePath` | 主开发 worktree `.env` 的绝对路径；目标必须是可读普通文件 |
| `startupWorkspacePath` | Host 启动时注册的绝对目录；目标必须存在、可读且可进入 |

`worktree:start` 在开发 DSH home 的 `.env` 不存在时创建指向 `userEnvironmentFilePath` 的符号链接。正确链接重复启动时保持不变；既有普通文件或指向其他目标的链接会中止启动，启动器不会删除或覆盖该路径。启动器只验证文件类型和可读性，不读取、复制或记录 `.env` 内容。

`comfyui-workbench-development` Profile 精确声明 `opencode-go/deepseek-v4-flash` 与 `OPENCODE_GO_API_KEY` 引用。启动器通过 `HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH` 把 `startupWorkspacePath` 传给该 Profile；该变量只属于开发启动参数，不属于可由调用者覆盖的 Configuration Profile 环境变量。

## 项目 Agent Preset 配置

`config/product-agent.json` 是项目自有 Agent Preset 安装位置的唯一结构化来源。该文件必须只包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `preset.id` | 产品 Preset 的兼容性内部 ID，只使用小写字母、数字和连字符；当前为 `harness-comfyui-cli-candidate` |
| `preset.sourceRootRelativePath` | 仓库根目录内的 canonical Agent Preset 根目录；当前为 `agent-presets` |
| `preset.installRootRelativePath` | 当前 production 或 worktree DSH home 内的安装根目录；当前为 `.agent-presets` |
| `preset.retiredManagedPresetIds` | 本项目需要从安装根目录删除的已退役 Preset ID 数组；每项只使用小写字母、数字和连字符，数组不得包含 `preset.id`，数组项不得重复 |
| `preset.sharedFiles` | 非空且互不重复的 `.mjs` basename 数组；当前包含 `project-tool-visibility.mjs` |

`sourceRootRelativePath/<preset.id>` 必须只包含非空普通文件 `agent.cordis.yml` 和 `preset.yml`。每个 shared file 和产品 Preset 在首次写入前全部完成文件类型、可读性、DSH YAML dialect、plugin-row 与 component resolution 检查。任一检查失败时，启动器不开始本轮物化。`installRootRelativePath` 的现有目录链必须由普通目录组成；符号链接或非目录路径会中止准备过程。启动器分别原子替换受管 shared file 和产品 Preset，再删除 `retiredManagedPresetIds` 指定的精确路径。删除符号链接形式的退役路径时，启动器只删除链接，不改变链接目标。启动器保留同一安装根目录中的其他 Preset。

`prod:start`、`prod:restart`、`worktree:start` 和 `worktree:restart` 都读取该配置，并把相同的受管 Preset 文件物化到各自隔离的 DSH home。该过程不修改 Harness 默认 Preset。

## 源码进程配置

`config/source-production.json` 必须包含以下字段：

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `runtimeId` | 非空进程标识 |
| `runtimeRelativeRoot` | 仓库内的相对运行目录；当前为 `.local/production` |
| `configurationProfile` | 固定为 `production` |
| `source.catalogCliRelativePath` | 相对仓库根目录的 Catalog CLI 文件 |
| `source.catalogPort` | Catalog CLI连接的本机回环服务端口 |
| `source.sourceCliRelativePath` | 相对仓库根目录的 Source CLI 文件 |
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
| `comfyui.frontendCompiler.browserExecutablePath` | Harness Host 在 cache miss 时启动的本机 Chrome 或 Chromium 绝对路径；production 默认值为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| `comfyui.frontendCompiler.instanceCacheEpoch` | Host 级非空缓存代次；值变化会使该 Host 下全部已登记 ComfyUI 实例的旧缓存均不再命中 |
| `comfyui.frontendCompiler.timeoutMs` | Chrome DevTools 连接、目标页面初始化和 `graphToPrompt()` 导出的统一正整数超时，毫秒；production 默认值为 `120000` |
| `source.catalogCliPath` | Catalog CLI 绝对路径，由启动器生成 |
| `source.catalogPort` | Catalog CLI连接的本机回环服务端口 |
| `source.sourceCliPath` | Source CLI 绝对路径，由启动器生成 |
| `source.contractId` | 固定为 `imagegen-source-contract` |
| `source.sourceReleaseVersion` | 固定为 `0.84.0` |
| `jobs.pollIntervalMs` | ComfyUI Job 轮询间隔，毫秒 |
| `jobs.missingObservationMs` | 缺失 Job observation 判定时间，毫秒 |
| `media.maxFileBytes` | 单个 ComfyUI 输出媒体允许保存的最大字节数 |
| `server.host` | Harness Web 监听地址；固定为 `127.0.0.1`，配置文件不能改为其他地址 |
| `server.port` | Harness Web 端口；当前为 `4173` |
| `client.runRefreshIntervalMs` | Client 查询刷新间隔，毫秒 |
| `process.shutdownTimeoutMs` | 停止进程与释放端口的超时，毫秒 |

启动器通过环境映射写入全部运行值。运行目录、Official API Workflow Cache 目录、Catalog 端口和两个 Source CLI 路径始终由 `source-production.json` 生成，调用者设置的同名环境变量不会改变它们。调用者可以覆盖以下七个业务值：

- `HARNESS_COMFYUI_DEFAULT_INSTANCE_ID`
- `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH`
- `HARNESS_COMFYUI_FRONTEND_CACHE_EPOCH`
- `HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS`
- `HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS`
- `HARNESS_COMFYUI_MEDIA_MAX_FILE_BYTES`
- `HARNESS_COMFYUI_SERVER_PORT`

`HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY` 由启动器固定为运行数据目录中的 `api-workflow-cache`，不能通过调用者环境改变。`HARNESS_COMFYUI_SERVER_HOST` 只把已经验证的 `127.0.0.1` 传给 Harness 子进程，不能覆盖 `server.host`。`config/environment-overrides.json` 是环境变量名称、Configuration Profile 目标字段、值类型和 Host 子进程运行值路径的唯一结构化来源。每项声明都使用 `valueType` 指定 `string` 或 `number`。覆盖 Configuration Profile 的声明使用 `target` 指定目标字段。进入 Host 受管环境的声明使用 `hostRuntimePath` 指定运行配置中的取值路径。只进入 Host 且不覆盖 Configuration Profile 的声明使用 `passThrough: true`，并且不使用 `target`。加载当前配置时，任何未在该文件中声明的 `HARNESS_COMFYUI_*` 环境变量都会中止配置加载。

运维人员在任一已登记 ComfyUI 实例升级前端、安装或升级影响 Workflow 序列化的自定义节点、或者改变前端导出行为后，必须修改 Host 级 `comfyui.frontendCompiler.instanceCacheEpoch` 并执行 `pnpm prod:restart`。此次修改会使该 Host 下全部已登记实例的旧缓存均不再命中。Host 不会把损坏缓存或 identity 不匹配当作 cache miss；运维人员应当根据 `COMFYUI_API_WORKFLOW_CACHE_INVALID` 错误定位对应缓存文件或修改 Host 级缓存代次。

## 配置变更

配置不热更新。修改 JSON 或允许的环境变量后执行 `pnpm prod:restart`，再执行 `pnpm prod:status` 与 `pnpm prod:health`。`.local/source-production-managed.json` 保存运行中的版本、运行根目录、监听地址与端口、数据路径、Official API Workflow Cache 路径、官方前端编译器配置、Source CLI 路径、业务覆盖值、停止超时和日志读取参数，因此 stop、status、health 和 logs 仍能使用启动时配置定位并管理进程。

## 图片读取设置

Host 使用 `harness-comfyui-image-reader-profiles` Settings namespace 保存图片读取设置。Client 的“图片读取”设置页通过一个 Host Remote 请求原子写入公开配置与凭据变更。该 namespace 包含以下属性：

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
| `configuration.profiles[].defaultPrompt` | 当前配置的每次 `inspect_image` 调用使用的读图提示词；Tool 和 CLI 不接受调用时覆盖值 |
| `configuration.profiles[].temperature` | 独立视觉模型调用使用的数值，范围为 `0` 至 `2` |
| `configuration.profiles[].maxTokens` | 独立视觉模型调用允许返回的最大 Token 数，范围为 `1` 至 `32768` |
| `credentials.<profileId>` | OpenAI 兼容配置的可选 API Key；该字典的值使用 Settings `secret` role，浏览器只收到对应 `hasApiKey` 状态 |

系统 Provider 与模型候选来自 Harness 当前 LLM 运行时，并且设置页只列出明确声明 `image` 输入能力的模型。OpenAI 兼容配置不依赖系统 Provider 目录；Host 向完整地址发送 OpenAI Chat Completions 格式的单张图片 Data URL、提示词、模型 ID、`temperature` 和 `max_tokens`。HTTP 地址不会提供传输加密；配置 API Key 时，使用者必须确认目标内网链路符合部署要求。

Host 使用一次 `settings.replace()` 提交完整公开配置和 write-only 凭据变更。Client 可以首次设置、替换或清除 API Key；Client 选择保留时不会提交新的密钥值。验证失败不会写入任何值；持久化失败使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`，不会误报为配置字段无效。保存成功后，新配置实时应用于下一次 `inspect_image` 调用，不需要重启 Host。

v0.36.0 继续注册旧 namespace `harness-comfyui-image-reader` 以读取 v0.35.x 的单配置用户值。仅当旧 namespace 存在用户值并且新 namespace 尚无用户值时，Host 把旧 Provider、模型、默认提示词、`temperature` 和最大输出 Token 原样迁移到名为“原图片读取配置”的 `runtime` 配置。新 namespace 已存在用户值时，Host 不会重复迁移或覆盖。
