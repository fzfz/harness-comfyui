---
文档用途: 说明测试入口、覆盖范围与通过条件。
读取时机: 选择测试、执行验收或准备交付时。
---
# 测试规范

## 测试入口

1. `pnpm test:unit`：Host、Agent、Client、配置与单元测试辅助模块。
2. `pnpm test:integration`：Host 插件组合、业务请求、CLI route 和逐媒体 HTTP 路由。
3. `pnpm test:production`：官方应用 probe、插件安装、Profile 配置、Renderer CDP、插件包与 Desktop 测试运行器的生产模块回归。
4. `pnpm test:desktop`：自动构建并打包当前插件候选，通过已安装官方 Desktop 执行 live UI、插件安装、生命周期与业务 E2E。
5. `pnpm test:contract`：package、Git 跟踪、发布门禁和安全合同。
6. `pnpm test:prototype`：静态原型结构与数据关系。
7. `pnpm test:coverage`：unit、integration 与 Skills 覆盖率。
8. `pnpm quality`：依赖、类型、覆盖率、合同、安全、production 回归、原型与官方 Desktop E2E 完整门禁。
9. `pnpm verify:comfyui-workflows -- --source-url <数据源服务URL> --source-port <端口> --instance-id <数据源服务实例ID> --output <结果JSON路径>`：已部署数据源服务中的 Workflow 模板、精确参数支持基线、目标实例实时 `/object_info`、组合参数编译、官方页面导出与缓存 miss→hit 一致性；省略 URL 或端口时使用程序配置的本机默认值。

10. 测试命令与 `pnpm quality` 的执行顺序见 [package.json](../../package.json)。
11. `pnpm test:desktop` 的构建包写入 `.local/desktop-e2e/desktop-test-runner/artifacts/`。该命令按 `fresh` 模式隔离 Harness home 与 user-data，并串行执行已配置的 live Desktop、生命周期和 production fixtures 测试。

## 官方 Desktop E2E 通过条件

1. `config/desktop-e2e.json` 定义官方应用身份、隔离目录、端口、Profile patch 和核心运行证据配置。`tests/desktop/fixtures/` 按该配置准备环境并执行验收。

2. E2E 通过条件包括：

   1. 当前官方应用版本和 bundle identity 与配置一致；
   2. 当前 probe PID 与进程组归属本轮运行记录，Host 与 Renderer CDP 端口由该进程组持有；
   3. Renderer 页面属于官方应用，URL 使用 `dsh-app://`，文档加载完成并包含可见内容；
   4. 官方插件管理器安装并启用本轮打包的 `harness-comfyui` 版本，Profile 中的插件记录和实际安装路径与当前候选包一致；
   5. Live 测试通过真实 UI 安装、启用、配置和会话操作，核对 managed CLI 返回值、Controlled Generation 结果以及应用重启后的持久化数据；
   6. 测试结束后本轮应用进程和端口全部释放，运行记录保留清理结果；失败、取消、超时及端口冲突提供相应证据。

3. 业务 E2E 使用测试夹具启动受控服务并核对请求、响应和业务持久化结果。验收者按当前发布任务的验收要求，独立完成真实模型和正式 ComfyUI Run 验收。

## Agent 调用轨迹验收

1. 开发调用方法见 [worktree 开发文档的“Agent 调用轨迹”](../agents/worktree-development.md#agent-调用轨迹)。开发者在任务结束后导出官方已有会话记录，并按索引核对覆盖范围与缺失项。
2. `tests/production/collect-session-trace.test.mjs` 验证结束状态、父子关系、官方导出包读取及缺失记录。[official-trace-evidence.test.mjs](../../tests/production/official-trace-evidence.test.mjs) 验证离线脱敏及文件写入；[official-desktop-probe.test.mjs](../../tests/production/official-desktop-probe.test.mjs) 验证启动流程保持原有 Profile 配置；[plugin-package.test.mjs](../../tests/production/plugin-package.test.mjs) 验证发行文件排除测试设施。
3. `tests/desktop/official-desktop-live.test.mjs` 复用受控父子任务，验证正常结束及取消后的会话导出、工具调用与返回和已持久化的中断消息；该测试由 `pnpm test:desktop` 执行。
4. 调查者分别记录应用清理结果与会话结束状态。官方记录未保存的信息必须标为缺失，受影响的验收结论保持证据不足。

## Preset 与子 Agent 合同

1. [installed-presets.test.mjs](../../tests/unit/installed-presets.test.mjs) 与 [plugin-package.test.mjs](../../tests/production/plugin-package.test.mjs) 验证 7 个项目 Preset 的注册、宿主 Skill service 复用和插件包资源范围。
2. `tests/production/native-workbench-subagent.test.mjs`、`native-iteration-roles.test.mjs` 和 `native-subagent-completion.test.mjs` 从已注册 Tool 执行入口验证首派、续派、接纳时机、取消和子会话恢复。公共行为见[系统架构](architecture.md#项目-presetskills-与目录访问)。
3. `pnpm typecheck` 同时检查 TypeScript 源码与 [tsconfig.agent-presets.json](../../tsconfig.agent-presets.json) 声明的 Preset 适配文件。

## 目录边界测试

1. [official-catalog-boundary.test.mjs](../../tests/production/official-catalog-boundary.test.mjs) 验证 MCP 与内部 HTTP 对同一目录场景的响应一致性，覆盖无默认模型、空实例、请求校验、鉴权、取消、证据和端口释放。
2. 夹具调用方法见 [worktree 开发文档的“目录边界夹具”](../agents/worktree-development.md#目录边界夹具)。真实模型的停止行为由对应任务的调用轨迹单独验收。

## 其他业务验证

1. 新功能和缺陷修复的测试覆盖成功、拒绝、清理、错误和边界分支。独立 Reviewer 按内容写作规则审阅语义文档。

2. 数据源设置与图片读取配置由 [source-settings.test.ts](../../tests/unit/source-settings.test.ts)、[image-reader-settings.test.ts](../../tests/unit/image-reader-settings.test.ts) 和 [host-plugin.test.ts](../../tests/integration/host-plugin.test.ts) 覆盖。[Desktop Skill 测试](../../tests/desktop/official-desktop-live.test.mjs)在仓库检出目录之外的 Workspace 中，验证 7 个项目 Preset 对工作区 Skills、用户级 Skills 和仓库 Skill 软链接的访问，以及工作区同名 Skill 的选择优先级。

3. managed CLI 的[进程测试](../../tests/integration/cli-command.test.ts)验证 6 条业务命令的结果文件与错误阶段；[独立包测试](../../tests/production/plugin-package.test.mjs)验证安装入口返回的路径及对应文件内容。官方 Desktop 的前台 Bash Tool Call 验证 capability 生成、请求身份、返回路径与后续文件读取。

4. Workflow verification 使用已经部署的数据源服务和目标 ComfyUI 实例。验收记录包含服务地址、端口、实例 ID、结果 JSON 路径、参数支持结果、官方前端导出和缓存 miss/hit 比较结果。
