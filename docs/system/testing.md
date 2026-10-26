---
文档用途: 说明测试入口、覆盖范围与通过条件。
读取时机: 选择测试、执行验收或准备交付时。
---
# 测试规范

## 测试入口

1. `pnpm test:unit`：Host、Agent、Client、配置与单元测试辅助模块。
2. `pnpm test:integration`：Host 插件组合、业务请求、CLI route 和逐媒体 HTTP 路由。
3. `pnpm test:production`：官方应用 probe、插件安装、Profile 配置、Renderer CDP、插件包与 Desktop 测试运行器的回归测试。
4. `pnpm test:desktop`：自动构建并打包当前插件候选，通过已安装官方 Desktop 执行 live UI、插件安装、生命周期与业务 E2E。
5. `pnpm test:contract`：package、Git 跟踪、发布门禁和安全合同。
6. `pnpm test:prototype`：静态原型结构与数据关系。
7. `pnpm test:coverage`：unit、integration 与 Skills 覆盖率。
8. `pnpm quality`：依赖、类型、覆盖率、合同、安全、production 回归、原型与官方 Desktop E2E 完整门禁。
9. `pnpm verify:comfyui-workflows -- --source-url <数据源服务URL> --source-port <端口> --instance-id <数据源服务实例ID> --output <结果JSON路径>`：验证 Workflow 参数编译与官方页面导出；省略 URL 或端口时使用程序配置的本机默认值。

10. 测试命令与 `pnpm quality` 的执行顺序见 [package.json](../../package.json)。
11. `pnpm test:desktop` 的构建包写入 `.local/desktop-e2e/desktop-test-runner/artifacts/`。该命令按 `fresh` 模式隔离 Harness home 与 user-data。

## 官方 Desktop E2E 通过条件

1. `config/desktop-e2e.json` 定义官方应用身份、隔离目录、端口、Profile patch 和运行证据的保存配置。`tests/desktop/fixtures/` 按该配置准备环境并执行验收。

2. E2E 通过条件包括：

   1. 当前官方应用版本和 bundle identity 与配置一致；
   2. 当前 probe PID 与进程组归属本轮运行记录，Host 与 Renderer CDP 端口由该进程组持有；
   3. Renderer 页面属于官方应用，URL 使用 `dsh-app://`，文档加载完成并包含可见内容；
   4. 官方插件管理器安装并启用本轮打包的 `harness-comfyui` 版本，Profile 中的插件记录和实际安装路径与当前候选包一致；
   5. Live 测试通过真实 UI 安装、启用和配置插件，并执行会话操作，核对 managed CLI 返回值、Controlled Generation 结果以及应用重启后的持久化数据；
   6. 测试结束后，本轮应用进程和端口全部释放，运行记录保留清理结果；测试失败、取消、超时或发生端口冲突时，运行记录保留对应事件的证据。

3. 业务 E2E 使用测试夹具启动受控服务并核对请求、响应和业务持久化结果。验收者按当前发布任务的验收要求，独立完成真实模型及目标 ComfyUI 实例上的生成验收。

## Agent 调用轨迹验收

1. 开发调用方法见 [worktree 开发文档的“Agent 调用轨迹”](../agents/worktree-development.md#agent-调用轨迹)。开发者在任务结束后导出官方已有会话记录，并按索引核对覆盖范围与缺失项。
2. `tests/production/collect-session-trace.test.mjs` 验证结束状态、父子关系、官方导出包读取及缺失记录。[official-trace-evidence.test.mjs](../../tests/production/official-trace-evidence.test.mjs) 验证离线脱敏及文件写入；[official-desktop-probe.test.mjs](../../tests/production/official-desktop-probe.test.mjs) 验证启动流程保留启动前的 Profile 配置。
3. `tests/desktop/official-desktop-live.test.mjs` 复用受控父子任务，验证正常结束及取消后的会话导出、工具调用与返回和已持久化的中断消息；该测试由 `pnpm test:desktop` 执行。
4. 调查者分别记录应用清理结果与会话结束状态，将官方记录未保存的信息标为缺失，并将依赖这些信息的验收项标为证据不足。

## Preset 与子 Agent 合同

1. [installed-presets.test.mjs](../../tests/unit/installed-presets.test.mjs) 与 [source-agent-preset.test.mjs](../../tests/production/source-agent-preset.test.mjs) 验证工作台注册、官方组件配置和宿主 Skill service 复用。[plugin-package.test.mjs](../../tests/production/plugin-package.test.mjs) 验证包内资源及测试设施的排除规则。
2. [官方 Desktop 业务 E2E](../../tests/desktop/official-desktop-live.test.mjs) 验证宿主首次派发子任务、续派、中断、查询、发送结束通知及冷恢复的行为。公共行为见[系统架构](architecture.md#项目-presetskills-与目录访问)。
3. [host-plugin.test.ts](../../tests/integration/host-plugin.test.ts) 验证业务工具的直接注册与 Cordis 生命周期；[generation-service.test.ts](../../tests/unit/generation-service.test.ts) 验证当前会话和后代结果的访问范围、诊断与取消。
4. `pnpm typecheck` 同时检查 TypeScript 源码与 [tsconfig.agent-presets.json](../../tsconfig.agent-presets.json) 声明的 Preset 资源入口。

## 目录边界测试

1. [official-catalog-boundary.test.mjs](../../tests/production/official-catalog-boundary.test.mjs) 验证 MCP 与内部 HTTP 对同一目录场景的响应一致性，覆盖无默认模型、空实例、请求校验、鉴权、取消、证据生成和端口释放。
2. 夹具调用方法见 [worktree 开发文档的“目录边界夹具”](../agents/worktree-development.md#目录边界夹具)。真实模型的停止行为由对应任务的调用轨迹单独验收。

## 测试覆盖要求

1. 新功能和缺陷修复的测试覆盖成功、拒绝、清理、错误和边界分支。

## 其他业务验证

1. 数据源设置与图片读取配置由 [source-settings.test.ts](../../tests/unit/source-settings.test.ts)、[image-reader-settings.test.ts](../../tests/unit/image-reader-settings.test.ts) 和 [host-plugin.test.ts](../../tests/integration/host-plugin.test.ts) 覆盖。

2. [Desktop Skill 测试](../../tests/desktop/official-desktop-live.test.mjs)使用 checkout 外的 Workspace。测试验证父子会话访问工作区 Skills、用户级 Skills 和源码软链接，以及工作区同名 Skill 的选择优先级。

3. managed CLI 的[进程测试](../../tests/integration/cli-command.test.ts)验证业务命令的结果文件与错误报告；[独立包测试](../../tests/production/plugin-package.test.mjs)验证安装入口返回的路径及对应文件内容。官方 Desktop 测试通过前台 Bash Tool Call 核对[短期调用凭证](architecture.md#host-node-与受管-cli-身份)、请求身份、返回路径与后续文件读取结果。

4. Workflow 验证使用已经部署的数据源服务和目标 ComfyUI 实例。验收记录包含服务地址、端口、实例 ID、结果 JSON 路径、参数支持结果、官方前端导出，以及首次未命中与后续命中缓存时的结果比较。
