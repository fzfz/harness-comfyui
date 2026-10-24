---
文档用途: 记录 DeepSeek Harness 0.2.1-rc.2 与插件源码基点的接口差异。
读取时机: 确认宿主升级范围、编写升级方案或选择回归测试时。
---
# DeepSeek Harness 0.2.1-rc.2 插件兼容性调研

## 1. 调研基线

1. 本次调研于 2026-10-23 核对以下版本。下文的“源码基点”指表中插件源码提交；仓库路径用于定位对应文件。

   | 对象 | 已核对的身份 | 依据 |
   | --- | --- | --- |
   | 插件源码 | `47962bbb3dcb4a273a4356d0054cf5f0b0add236`，插件版本 `0.46.2` | 源码基点的 `package.json` 与 Git 提交记录 |
   | 源码基点 SDK | `0.2.0-rc.2` | 源码基点的 `package.json.peerDependencies` |
   | 目标宿主 | `dsh-v0.2.1-rc.2`，提交 `687f282e8625c6b8d11ff58211a90524be2e4317` | [官方标签](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317) |
   | 本机官方应用 | `0.2.1-rc.2` | `/Applications/DeepSeek Harness.app/Contents/Info.plist` 的 `CFBundleShortVersionString` |
   | Desktop 测试配置 | `0.2.0-rc.2` | 源码基点的 `config/desktop-e2e.json.application.version` |

2. 调研时的官方发布列表以目标宿主为最新条目。该预发布版本于 2026-10-17 发布；其直接新增功能为 DeepSeek-V4.1-Flash-1017 以及 DeepSeek Search、Fetch API。[发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)

3. [0.2.1-rc.1 发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1) 汇总了源码基点 SDK 之后的变更。本报告已核对 `dsh-v0.2.0-rc.2` 与 `dsh-v0.2.1-rc.2` 标签之间的源码差异。

## 2. 已确认的接口差异

### 2.1. 插件兼容性声明

1. 目标宿主优先读取插件的 `engines.dsh`。缺少该字段时，宿主逐项匹配 DSH peer 版本；代码见 [evaluatePluginCompatibility()](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/app-boot/src/plugin-compatibility.ts)。
2. 源码基点插件只声明 Node engine，DSH peers 均固定为源码基点 SDK。按第 1 项规则，源码基点清单与目标宿主的版本要求冲突。
3. 源码基点清单包含 `@deepseek-ai/dsh-invariants`，产品源码与预设未引用该包。官方已移除运行时 invariant 插件及 `./invariant` 导出；npm 对该包目标版本的查询返回 HTTP 404。

### 2.2. 子 Agent 创建接口

1. 目标宿主以 `startActivation()` 替代 `startContinuable()`。创建请求增加必填 `delivery`；返回值包含子会话身份、结果 Promise 和释放方法。签名见 [SubagentRuntime](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/index.ts) 与 [SubagentActivationSpec](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/types.ts)。
2. 源码基点的 [project-iteration-dispatch.mjs](../../agent-presets/project-iteration-dispatch.mjs) 的 `apply()` 调用已移除的方法。[ComfyUI工作台预设](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml) 的子任务和 [ComfyUI迭代预设](../../agent-presets/harness-comfyui-iteration/agent.cordis.yml) 的四个角色共用该入口，首次派发均受影响。

### 2.3. 子 Agent 角色与工具配置

1. 目标宿主的 `SubagentStartRequest` 已移除 `persona` 与 `toolFilter`，新增 `agentPreset`。创建时选择的 Preset 负责角色和工具组合；官方接口见第 2.2 节的类型定义。
2. 源码基点的两个预设通过派发配置传入角色文本和工具限制。仅替换创建方法后，这些字段也无法通过目标宿主的创建接口建立角色配置。
3. 官方仍会恢复历史子会话描述中的角色和工具限制。该恢复路径位于 [applyChildComposition()](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/src/child-agent.ts)；新的角色创建路径使用独立 Preset。

### 2.4. 子 Agent 完成与续派

1. 源码基点的派发工具等待子任务结束后返回。`observeCompletion()` 汇合 Inbox 插入、`subagent/start` 和 `subagent/end` 事件；对应测试文件为 `tests/production/native-subagent-completion.test.mjs`。
2. 目标宿主统一管理子任务执行、结果通知和资源释放。`delivery: parent` 发送父会话通知，`delivery: caller` 由调用方接收结果。`sendMessage()` 继续返回消息 ID。接口合同见 [Subagent 使用说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent/README.md#local-and-external-children)。
3. 源码基点的迭代 Skill 明确依赖第 1 项的返回时机，见 [comfyui-iterate-generation](../../.agents/skills/comfyui-iterate-generation/SKILL.md#派发任务并接收结果文件)。派发工具、工具描述和 Skill 对完成时机的约定属于同一升级范围。

### 2.5. 工作目录与 Workspace 归属

1. 目标宿主新增当前工作目录状态。Session header 继续标识原始项目，Session projection 保存当前工作目录；子 Agent 默认继承创建时的父 Agent 当前目录。合同见 [working-directory](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/working-directory/README.md) 与第 2.2 节的创建类型。
2. 插件的 [Workspace 登记](../../src/host/cli/workspace.ts)、[生成身份解析](../../src/host/generation/tool-execution-identity.ts) 和 [子会话关联](../../agent-presets/project-subagent-workspace.mjs) 读取 Session header。

### 2.6. 凭据、Remote 与界面扩展

1. 目标宿主优先使用已保存凭据，再读取环境来源。插件通过官方 `describe()` 的 `writable` 字段判断凭据操作能力；实际调用位于 [ensureWritableReference()](../../src/host/image-reader/configuration-service.ts)。[官方凭据接口](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/credentials/credentials/src/index.ts)
2. 目标宿主增加 Remote 调用方身份与资源访问声明，保留 `@Remote` 的直接装饰形式。[官方 Remote 接口](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/typert/protocol/src/index.ts)
3. 源码基点的两个预设使用 `native` 工具模式。Client 使用输入区 dock、会话头、侧栏和插件设置扩展位。官方移除的 `both` 模式与 `stats` 扩展位未出现在这些产品注册中。入口见两个预设的 `agent.cordis.yml` 与 [Client apply()](../../src/client/index.tsx)。

## 3. 依赖元数据与公告结果

1. 本轮依赖元数据、精确版本、传递关系和公告查询保存在 [dependency-audit.json](../verification/host-0.2.1-rc.2/dependency-audit.json)。开发、运行和 Preset 依赖的审计范围与结论见[升级方案第 3.1 节](../plans/host-0.2.1-rc.2-upgrade-20261024.md#31-依赖审计证据)。
2. 目标宿主的 MCP 依赖命中已知公告；受影响的项目调用路径和授权项见[升级方案第 3.2 节](../plans/host-0.2.1-rc.2-upgrade-20261024.md#32-宿主-mcp-依赖公告)。
3. 依赖安装结果、最终版本与锁文件核对记录见[验收证据目录](../verification/host-0.2.1-rc.2/)。

## 4. 验收范围与证据入口

1. [升级方案第 7 节](../plans/host-0.2.1-rc.2-upgrade-20261024.md#7-计划验收清单) 定义子 Agent、Workspace、凭据、Remote、Skills、CLI、生成、读图与安装生命周期的通过条件。
2. [验收证据目录](../verification/host-0.2.1-rc.2/) 保存依赖审计、应用身份、模型价格、独立审查和实际任务结果。
3. 自动化入口见[测试规范](../system/testing.md)，交互运行和官方会话导出方法见 [worktree 开发规范](../agents/worktree-development.md)。
