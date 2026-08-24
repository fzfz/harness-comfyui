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
| `source.sourceCliRelativePath` | 相对仓库根目录的 Source CLI 文件 |
| `logs.source` | `stdout`、`stderr`、`operations` 或 `all` |
| `logs.lines` | 每个日志来源读取的末尾行数，必须为正整数 |

## Configuration Profile

| 字段 | 用途 |
| --- | --- |
| `paths.dataDir` | 数据根目录；启动器固定为 `<runtimeRoot>/shared/data` |
| `paths.runRepositoryFile` | Run Repository SQLite 文件 |
| `paths.runDirectory` | Run 文件目录 |
| `paths.savedMediaDirectory` | Saved Media 目录 |
| `paths.logDirectory` | Host 日志目录 |
| `comfyui.defaultInstanceId` | 默认 ComfyUI 实例 ID |
| `source.catalogCliPath` | Catalog CLI 绝对路径，由启动器生成 |
| `source.sourceCliPath` | Source CLI 绝对路径，由启动器生成 |
| `source.contractId` | 固定为 `imagegen-source-contract` |
| `source.sourceReleaseVersion` | 固定为 `0.82.2` |
| `jobs.pollIntervalMs` | ComfyUI Job 轮询间隔，毫秒 |
| `jobs.missingObservationMs` | 缺失 Job observation 判定时间，毫秒 |
| `server.host` | Harness Web 监听地址；当前为 `127.0.0.1` |
| `server.port` | Harness Web 端口；当前为 `4173` |
| `client.runRefreshIntervalMs` | Client 查询刷新间隔，毫秒 |
| `process.shutdownTimeoutMs` | 停止进程与释放端口的超时，毫秒 |

启动器通过环境映射写入全部运行值。运行目录和两个 Source CLI 路径始终由 `source-production.json` 生成，调用者设置的同名环境变量不会改变它们。调用者可以覆盖以下四个业务值：

- `HARNESS_COMFYUI_DEFAULT_INSTANCE_ID`
- `HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS`
- `HARNESS_COMFYUI_SERVER_HOST`
- `HARNESS_COMFYUI_SERVER_PORT`

`config/environment-overrides.json` 是环境变量名称及其目标字段的唯一结构化来源。加载当前配置时，任何未在该文件中声明的 `HARNESS_COMFYUI_*` 环境变量都会中止配置加载。

## Product Agent

`config/product-agent.json` 定义 Agent Preset 路径、源码 export、Session 列表收敛超时和模型。模型固定为 `opencode-go/deepseek-v4-flash`，API key 从 `OPENCODE_GO_API_KEY` 读取。

## 配置变更

配置不热更新。修改 JSON 或允许的环境变量后执行 `pnpm prod:restart`，再执行 `pnpm prod:status` 与 `pnpm prod:health`。`.local/source-production-managed.json` 保存运行中的版本、运行根目录、监听地址与端口、数据路径、Source CLI 路径、业务覆盖值、停止超时和日志读取参数，因此 stop、status、health 和 logs 仍能使用启动时配置定位并管理进程。
