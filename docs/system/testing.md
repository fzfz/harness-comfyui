# 测试规范

## 测试入口

| 命令 | 覆盖范围 |
| --- | --- |
| `pnpm test:unit` | Host、Agent、Client、配置与单元测试辅助模块。 |
| `pnpm test:integration` | Host 插件组合、业务请求、CLI route 和逐媒体 HTTP 路由。 |
| `pnpm test:production` | 官方应用 probe、插件安装、Profile 配置、Renderer CDP、插件包与 Desktop 测试运行器的生产模块回归。 |
| `pnpm test:desktop` | 自动构建并打包当前插件候选，通过已安装官方 Desktop 执行 live UI、插件安装、生命周期与业务 E2E。 |
| `pnpm test:contract` | package、Git 跟踪、发布门禁和安全合同。 |
| `pnpm test:prototype` | 静态原型结构与数据关系。 |
| `pnpm test:coverage` | unit、integration 与 Skills 覆盖率。 |
| `pnpm quality` | 依赖、类型、覆盖率、合同、安全、production 回归、原型与官方 Desktop E2E 完整门禁。 |
| `pnpm verify:comfyui-workflows -- --source-url <数据源服务URL> --source-port <端口> --instance-id <数据源服务实例ID> --output <结果JSON路径>` | 已部署数据源服务中的 Workflow 模板、精确参数支持基线、目标实例实时 `/object_info`、组合参数编译、官方页面导出与缓存 miss→hit 一致性；省略 URL 或端口时使用程序配置的本机默认值。 |

`package.json` 是命令名称与 quality 顺序的唯一来源。`test:desktop` 先运行插件构建和打包，再串行运行配置的 live Desktop、生命周期和相关 production fixtures；构建包写入 `.local/desktop-e2e/desktop-test-runner/artifacts/`。完整测试使用 `config/desktop-e2e.json` 校验官方应用身份、按 `fresh` 模式隔离每轮 Harness home 与 user-data，并经官方插件管理界面安装候选包。

## 官方 Desktop E2E 通过条件

`tests/desktop/fixtures/` 定义每轮应用目录、进程、端口、Profile patch、插件安装与证据结构。`config/desktop-e2e.json` 定义应用路径与版本、fresh/development 模式、目录名称、回环端口角色、启动期限、Renderer 目标、运行记录和证据文件名。

E2E 通过条件包括：

- 当前官方应用版本和 bundle identity 与配置一致；
- 当前 probe PID 与进程组归属本轮运行记录，Host 与 Renderer CDP 端口由该进程组持有；
- Renderer 页面属于官方应用，URL 使用 `dsh-app://`，文档加载完成并包含可见内容；
- 官方插件管理器安装并启用本轮打包的 `harness-comfyui` 版本，Profile 中的插件记录和实际安装路径对应当前候选包；
- Live 测试通过真实 UI 安装、启用、配置和会话操作，核对 managed CLI 返回值、Controlled Generation 结果以及应用重启后的持久化数据；
- 测试结束后本轮应用进程和端口全部释放，运行记录保留清理结果；失败、取消、超时及端口冲突提供相应证据。

业务 E2E 使用测试夹具启动受控服务并核对请求、响应和业务持久化结果。真实模型和正式 ComfyUI Run 验收按当前 release/acceptance 任务规定独立执行；`test:desktop` 的成功不表示真实模型已完成验收。

## 其他业务验证

新功能和缺陷修复的测试覆盖成功、拒绝、清理、错误和边界分支。语义文档由独立 Reviewer 阅读并按内容写作规则验收；脚本只处理具有确定性规则的数据结构。

数据源设置与图片读取配置由 Host settings 和 Remote 回归覆盖。Repository Skills 可见性测试在 checkout 外的 Workspace 验证两个项目 Preset 的包内 Skill 资源与其他 Preset、Workspace Skills 的隔离。managed CLI 测试通过官方 Desktop 的前台 Bash Tool Call 验证 capability 生成、请求身份和成功响应。

Workflow verification 使用已经部署的数据源服务和目标 ComfyUI 实例。验收记录包含服务地址、端口、实例 ID、结果 JSON 路径、参数支持结果、官方前端导出和缓存 miss/hit 比较结果。

## 历史验证记录

以下数据描述插件化迁移前的 v0.44.3 候选，不构成本版的应用基线或测试步骤。该候选的 `pnpm quality` 有 1207 项 unit/integration/Skills、58 项 contract/security、346 项 production、32 项 prototype 和 4 项真实 Desktop 测试通过；覆盖率为 statements 94.07%、branches 87.52%、functions 100%、lines 96.5%，完整依赖与生产依赖审计均报告 critical、high、moderate、low 为 0。相关旧 Desktop 实例验收、开发运行目录和第三方基线属于历史记录。
