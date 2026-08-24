# Harness ComfyUI 领域上下文

本文件定义当前源码已经实现的领域术语。系统结构和运行规则以 [`docs/system/`](docs/system/) 中的规范为准。

## 平台

**Harness Core**：项目依赖的 DeepSeek Harness `0.1.0-rc.8` 公共运行能力，包括 Cordis 生命周期、Session、Agent、Tool 和 Web Client 加载。项目通过公共 package export 与 profile composition 接入，不修改 Harness package 源码。

**Host Plugin**：`src/host/plugin.ts` 导出的 Harness Host 插件。Host Plugin 在启动时加载并校验唯一的 `production` Configuration Profile。

**Client Module**：`src/client/index.tsx` 提供的浏览器模块。Client Module 通过 Harness ModuleLoader 加载，并使用 Harness 原生 `sidebar.footer.action` 与 `conversation.input.dock` 扩展位呈现项目入口和上下文控件。Client Module 不替换 Harness 的 root、sidebar、conversation、details 或 composer，也不自动创建或打开项目 Session。

**Project Tool Registry**：`src/host/tools/register-project-tools.ts` 提供的项目 Tool 唯一注册入口。Host Plugin 当前通过该入口注册空的项目 Tool 集合。

## 运行

**Source Process Manager**：`scripts/production/` 实现的当前源码进程管理器。它提供 start、stop、restart、status、health 和 logs 六种生命周期操作；`prod:test` 自动验证这些操作及其异常分支。package 命令统一使用 `prod:*`。

**Source Runtime**：当前源码进程使用的本地运行状态。`.local/production/` 保存 DSH home、进程状态、操作日志、Run Repository、Run 文件和 Saved Media；`.local/source-client/client.js` 是 `prod:start` 或 `prod:restart` 根据当前 Client 源码生成的浏览器 ModuleLoader 输入。以上目录不保存另一份产品源码。

**Configuration Profile**：Host 使用的一组结构化配置。当前系统只有 `production`，其结构由 `config/schema.ts` 定义，其值由 `config/base.json`、`config/profiles/production.json` 和允许的环境变量合成。

**Managed Source State**：`.local/source-production-managed.json` 保存的运行中配置快照。stop、status、health 和 logs 使用该快照定位已启动的进程。

**Source Contract Identity**：当前数据源合同固定为 `imagegen-source-contract` 版本 `0.82.2`。Catalog CLI 与 Source CLI 的实际路径由 `config/source-production.json` 定义。

## 数据

**Workspace**：Harness 中的最高会话隔离边界。一个 Workspace 包含多个 Session。

**Session**：Workspace 中的一段持续对话。

**Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。

**Run Repository**：默认位于 `.local/production/shared/data/runs.sqlite` 的运行记录数据库。

**Saved Media**：默认位于 `.local/production/shared/saved-media/` 的已保存媒体。

## 发布

**Product Version**：根 `package.json.version` 中的 SemVer。当前值为 `0.2.0`。

**GitHub Release**：指向已通过 CI 的精确提交的 Git tag 与 GitHub Release 记录。当前发布标签为 `v0.2`；发布不创建或附加产品包。
