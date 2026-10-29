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
11. `pnpm test:desktop` 的构建包写入[构建产物目录](../../.local/desktop-e2e/desktop-test-runner/artifacts)。该命令按 `fresh` 模式隔离 Harness home 与 user-data。

## 官方 Desktop E2E 通过条件

1. [config/desktop-e2e.json](../../config/desktop-e2e.json) 定义官方应用身份、隔离目录、端口、Profile patch 和运行证据的保存配置。[tests/desktop/fixtures/](../../tests/desktop/fixtures) 按该配置准备环境并执行验收。

2. E2E 通过条件包括：

   1. 当前官方应用版本和 bundle identity 与配置一致；
   2. 当前 probe PID 与进程组归属本轮运行记录，Host 与 Renderer CDP 端口由该进程组持有；
   3. Renderer 页面属于官方应用，URL 使用 `dsh-app://`，文档加载完成并包含可见内容；
   4. 官方插件管理器安装并启用本轮打包的 `harness-comfyui` 版本。Profile 插件记录和实际安装路径与当前候选包一致；
   5. Live 测试通过真实 UI 完成插件安装、启用、配置和会话操作。验收同时核对 managed CLI 返回值、受控生成结果及重启后的持久化数据；
   6. 测试结束后，本轮应用进程和端口全部释放，运行记录保留清理结果；测试失败、取消、超时或发生端口冲突时，运行记录保留对应事件的证据。

3. 业务 E2E 使用测试夹具启动受控服务并核对请求、响应和业务持久化结果。验收者按当前发布任务的验收要求，独立完成真实模型及目标 ComfyUI 实例上的生成验收。

## Agent 调用轨迹验收

1. 开发调用方法见 [worktree 开发文档的“Agent 调用轨迹”](../agents/worktree-development.md#agent-调用轨迹)。开发者在任务结束后导出官方已有会话记录，并按索引核对覆盖范围与缺失项。
2. [tests/production/collect-session-trace.test.mjs](../../tests/production/collect-session-trace.test.mjs) 验证结束状态、父子关系、官方导出包读取及缺失记录。[official-trace-evidence.test.mjs](../../tests/production/official-trace-evidence.test.mjs) 验证离线脱敏及文件写入；[official-desktop-probe.test.mjs](../../tests/production/official-desktop-probe.test.mjs) 验证启动流程保留启动前的 Profile 配置。
3. [tests/desktop/official-desktop-live.test.mjs](../../tests/desktop/official-desktop-live.test.mjs) 复用受控父子任务，验证正常结束及取消后的会话导出。验证内容包括工具调用、返回值和已持久化的中断消息。测试由 `pnpm test:desktop` 执行。
4. 调查者分别记录应用清理结果与会话结束状态。官方记录未保存的信息标为缺失；依赖缺失信息的验收项标为证据不足。
5. [official-raw-capture.test.mjs](../../tests/unit/official-raw-capture.test.mjs) 验证原始字节保留、凭据脱敏、取消、结构化工具结果和并发请求关联。该测试还验证观察器透明性与 Profile 恢复。经授权的调用方法见 [worktree 开发文档](../agents/worktree-development.md#经授权采集原始请求与工具结果)。

## Generation Run 等待验收

1. [generation-run-wait.test.ts](../../tests/unit/generation-run-wait.test.ts) 验证等待登记与生命周期；[集成测试](../../tests/integration/generation-run-wait.test.ts) 验证官方 Job 装配、所有者边界、完成通知与取消。等待职责见[系统架构](architecture.md#generation-run-等待通知)。
2. 真实模型验收覆盖主会话登记等待及接管子会话返回的 Run。验收者还须核对完成通知触发续行，以及第二轮生图后的再次通知。验收依据包括官方会话记录、Job 事件、Run 和图片读取结果。

## Preset 与子 Agent 合同

1. [installed-presets.test.mjs](../../tests/unit/installed-presets.test.mjs) 与 [source-agent-preset.test.mjs](../../tests/production/source-agent-preset.test.mjs) 验证工作台注册与官方组件配置。[plugin-package.test.mjs](../../tests/production/plugin-package.test.mjs) 验证预设、8 个业务 Skill 及其参考和脚本随包交付。
2. [官方 Desktop 业务 E2E](../../tests/desktop/official-desktop-live.test.mjs) 验证宿主首次派发子任务、续派、中断、查询、发送结束通知及冷恢复的行为。公共行为见[系统架构](architecture.md#项目-presetskills-与目录访问)。
3. [host-plugin.test.ts](../../tests/integration/host-plugin.test.ts) 验证常驻业务服务、CLI、Remote 与 Cordis 生命周期；[generation-service.test.ts](../../tests/unit/generation-service.test.ts) 验证当前会话和后代结果的访问范围、诊断与取消。
4. `pnpm typecheck` 同时检查 TypeScript 源码与 [tsconfig.agent-presets.json](../../tsconfig.agent-presets.json) 声明的 Preset 资源入口。

5. [native-workbench-scope.test.mjs](../../tests/production/native-workbench-scope.test.mjs)通过[原生装配夹具](../../tests/production/fixtures/native-workbench-preset-runtime.mjs)验证主会话与子会话中的 persona 内容、运行时上下文、工具限制及各自的 Skill 来源，并验证其他预设的 Skill 来源符合各自配置。

6. 修改工作台装配后，验收者必须覆盖以下生命周期行为。

   1. 首次派发。
   2. 续派。
   3. 中断。
   4. 子任务派发深度达到配置上限。
   5. 预设切换。
   6. 冷恢复。

7. 验收者保存实际提示词、上下文、工具声明及 Skill 来源和读取记录。业务证据包括 MCP 与 CLI 的请求和返回结果、Run 记录及生成图片。

## Goal 接入验收

1. 原生装配夹具验证 Goal 工具实际调用、子会话权限、修订校验、命令恢复及预设释放与重挂载。
2. 官方 Desktop 业务 E2E 的 `verifyWorkbenchGoal()` 验证 GoalBar、子任务等待、自动完成和轮次耗尽。相关用例分别验证暂停 Goal 后 Run 继续完成，以及活跃 Goal 重启后由用户恢复并读取已有 Run。
3. 验收者通过真实模型分别验证普通请求、明确 Goal 请求及缺少输入的目标。验收者按[worktree 开发文档](../agents/worktree-development.md#agent-调用轨迹)导出主子会话轨迹，并核对 persona 中的使用约定。

## 目录边界测试

1. [official-catalog-boundary.test.mjs](../../tests/production/official-catalog-boundary.test.mjs) 验证 MCP 与内部 HTTP 对同一目录场景的响应一致性。覆盖场景包括无默认模型、空实例、请求校验、鉴权与取消。测试同时验证证据生成与端口释放。
2. 夹具调用方法见 [worktree 开发文档的“目录边界夹具”](../agents/worktree-development.md#目录边界夹具)。真实模型的停止行为由对应任务的调用轨迹单独验收。

## 测试覆盖要求

1. 新功能和缺陷修复的测试覆盖成功、拒绝、清理、错误和边界分支。

## 其他业务验证

1. 数据源设置与图片读取配置由 [source-settings.test.ts](../../tests/unit/source-settings.test.ts)、[image-reader-settings.test.ts](../../tests/unit/image-reader-settings.test.ts) 和 [host-plugin.test.ts](../../tests/integration/host-plugin.test.ts) 覆盖。

2. [Desktop Skill 测试](../../tests/desktop/official-desktop-live.test.mjs)使用 checkout 外的 Workspace。测试验证父子 Agent 通过官方 Skill 服务发现并读取包内业务 Skill，并通过 Bash 读取 Skill 指定的参考文件。测试还验证父子 Agent 能读取预设配置的额外 Skill 目录中的 Skill。

3. [image-reader-native.test.ts](../../tests/unit/image-reader-native.test.ts)与 [image-reader-native-settings.test.ts](../../tests/unit/image-reader-native-settings.test.ts)验证统一宿主模型调用和原生 Provider 设置。验收者核对独立视觉模型、自定义完整地址、各配置的默认提示词、当前激活的配置与凭据引用。迁移验收还须覆盖迁移失败后的重试，以及失败后的配置保留。

4. managed CLI 的[进程测试](../../tests/integration/cli-command.test.ts)验证业务命令的结果文件与错误报告；[独立包测试](../../tests/production/plugin-package.test.mjs)验证安装入口返回的路径及对应文件内容。官方 Desktop 测试通过前台 Bash Tool Call 核对[短期调用凭证](architecture.md#host-node-与受管-cli-身份)、请求身份、返回路径与后续文件读取结果。

5. Workflow 验证使用已经部署的数据源服务和目标 ComfyUI 实例。验收记录包含服务地址、端口、实例 ID 和结果 JSON 路径。验收者还须记录参数支持、官方前端导出及缓存命中前后的结果比较。
