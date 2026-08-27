# Harness ComfyUI 领域上下文

本文件定义当前源码已经实现的领域术语。系统结构和运行规则以 [`docs/system/`](docs/system/) 中的规范为准。

## 平台

**Harness Core**：项目依赖的 DeepSeek Harness `0.1.1-rc.2` 公共运行能力，包括 Cordis 生命周期、Session、Agent、Tool、Skill 和 Web Client 加载。项目通过公共 package export 与 profile composition 接入，不修改 Harness package 源码。

**Host Plugin**：`src/host/plugin.ts` 导出的 Harness Host 插件。Host Plugin 在启动时加载并校验唯一的 `production` Configuration Profile，注册 Catalog Remote、Generation Remote、Generation Tool、媒体路由和 Generation Coordinator。

**Client Module**：`src/client/index.tsx` 提供的浏览器模块。Client Module 通过 Harness ModuleLoader 加载，并使用 Harness 原生 `sidebar.footer.action`、`conversation.input.dock`、`details` 与 `shell.overlay` 扩展位呈现项目入口、上下文控件和 Generation Run/Media 结果列。Harness `0.1.1-rc.2` 在空白 Session 中把 `details` 列宽固定为零，因此空白 Session 使用 `shell.overlay` 显示空结果列；已保存 Session 使用 `details` 读取真实 Generation Run/Media 投影。两个结果列的 Session 条件互斥。Client Module 不替换 Harness 的 root、sidebar、conversation 或 composer，也不自动创建或打开项目 Session。

**Project Tool Registry**：`src/host/tools/register-project-tools.ts` 提供的项目 Tool 唯一注册入口。Host Plugin 通过该入口注册 `generate_with_comfyui`。

**ComfyUI Generate Skill**：`.agents/skills/comfyui-generate/SKILL.md` 提供的 Harness Skill。rc.2 文件系统 Skill provider 从当前 Workspace Git 根目录发现该 Skill，Harness 原生 `/` 菜单负责显示和调用。

## 运行

**Source Process Manager**：`scripts/production/` 实现的当前源码进程管理器。它提供 start、stop、restart、status、health 和 logs 六种生命周期操作；`prod:test` 自动验证这些操作及其异常分支。package 命令统一使用 `prod:*`。

**Source Runtime**：当前源码进程使用的本地运行状态。`.local/production/` 保存 DSH home、进程状态、操作日志、Run Repository、Run 文件和 Saved Media；`.local/source-client/client.js` 是 `prod:start` 或 `prod:restart` 根据当前 Client 源码生成的浏览器 ModuleLoader 输入。以上目录不保存另一份产品源码。

**Configuration Profile**：Host 使用的一组结构化配置。当前系统只有 `production`，其结构由 `config/schema.ts` 定义，其值由 `config/base.json`、`config/profiles/production.json` 和允许的环境变量合成。

**Managed Source State**：`.local/source-production-managed.json` 保存的运行中配置快照。stop、status、health 和 logs 使用该快照定位已启动的进程。

**Source Contract Identity**：当前数据源合同固定为 `imagegen-source-contract` 版本 `0.84.0`。Catalog CLI 与 Source CLI 的实际路径由 `config/source-production.json` 定义。Catalog 资源的 `sample_image_urls` 只投影为 Client Module 展示使用的 `CatalogItem.sampleImageUrls`，不进入 Message Context。

## 数据

**Workspace**：Harness 中的最高会话隔离边界。一个 Workspace 包含多个 Session。

**Session**：Workspace 中的一段持续对话。

**Chat Turn**：一条用户消息及下一条用户消息出现前产生的回复与调用。

**Run Repository**：默认位于 `.local/production/shared/data/runs.sqlite` 的运行记录数据库。

**Saved Media**：默认位于 `.local/production/shared/saved-media/` 的已保存媒体。

**Generation Run**：一次 `generate_with_comfyui` Tool Call 对应的持久异步运行。不同 `callId` 创建不同 Run；每个 Run 独立保存请求、来源快照、Actual Workflow 和 API Workflow。

**Generation Media**：一个 Generation Run 保存的一项图片或视频输出。每项 Media 通过自己的 `run_id` 解析所属 Run 的 Actual Workflow，Session 和 Chat Turn 只用于筛选。

## 发布

**Product Version**：根 `package.json.version` 中的 SemVer。当前值为 `0.30.8`。

**GitHub Release**：指向已通过 CI 的精确提交的 Git tag 与 GitHub Release 记录。本次目标发布标签为 `v0.30.8`；发布不创建或附加产品包。
