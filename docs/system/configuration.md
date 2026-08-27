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
