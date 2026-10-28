---
文档用途: 供用户审批 ComfyUI 工作台的最小 Goal 接入方案，并供实施者执行获准范围。
读取时机: 审批方案、实施 Goal 接入或验收工作台目标执行行为时。
---

# ComfyUI 工作台最小 Goal 接入方案

## 1. 名词定义

1. Session、Generation Run 和 ComfyUI Workbench Preset 沿用 [CONTEXT.md](../../CONTEXT.md) 的定义。
2. Goal 指宿主为单个 Session 保存的持续任务目标。工具契约与轮次规则见[宿主调研](../research/comfyui-goal-host-20261028.md)第 3、4 节。
3. 实施者指方案获准后修改仓库的 Agent。工作台 Agent 指产品运行时执行用户任务的 Agent。

## 2. 总目标

1. 工作台通过原生 `/goal` 命令和 Goal 工具管理持续任务。宿主负责目标记录、自动续跑、轮次限制和界面操作。
2. 本次产品改动限定为 2 份预设配置。业务执行继续使用现有 Skill、NoobAI MCP 和受管 CLI。

## 3. 现状调研

1. 当前基准为插件提交 `d50af91b4205809e2dc307edcc59b8f3ecfde469`，插件版本为 `0.48.1`。独立 worktree 使用分支 `codex/comfyui-goal-design`。
2. [package.json](../../package.json) 锁定宿主 `0.2.1-rc.3`。已安装应用的版本、构建标识和官方源码证据见宿主调研第 1 节。
3. [共享组合](../../agent-presets/shared/agent.cordis.yml)当前缺少 `command-goal` 和 `tool-goal` 声明。宿主组件分工与装配证据见宿主调研第 2 节。
4. [工作台配置](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml)当前使用 `complete: true`。该配置对 Goal 信息的影响见宿主调研第 8 节。
5. 本方案采用宿主调研第 4、7 节所述的轮次预算与重启恢复规则。
6. 当前结论来自配置、安装包代码和官方测试源码。工作台的 Goal 运行验收尚未执行。

## 4. 面临的问题

1. 工作台缺少原生命令和工具的预设声明。
2. 完整 persona 未提供 Goal 使用约定；只添加组件会留下提示词缺口。
3. 现有工作台测试尚未验证 Goal 工具、自动续跑和原生子代理同时启用的行为。

## 5. 问题的解决和实施方案

### 5.1 架构流程图

1. 实施者按以下职责关系接入宿主。

   ```mermaid
   flowchart TD
     U[用户] --> C[原生 GoalBar 与 /goal]
     U --> A[工作台 Agent]
     A --> T[原生 Goal 工具]
     C --> G[宿主 goals 服务与 Session 投影]
     T --> G
     G --> D[宿主 goal-round-driver]
     D --> W[等待子任务并核对继续条件]
     W --> A
     A --> B[现有 Skill、MCP、CLI 与子代理]
     B --> A
     G --> C
   ```

### 5.2 预设装配

1. 实施者在共享组合中声明以下 2 个组件。配置沿用官方默认值。

   | 组件 ID | 官方组件 | 用途 |
   | --- | --- | --- |
   | `command-goal` | `@deepseek-ai/dsh-command-goal` | 提供 `/goal`。 |
   | `tool-goal` | `@deepseek-ai/dsh-tool-goal` | 提供 `create_goal`、`get_goal` 和 `update_goal`。 |

2. 宿主全局的 Goal 服务、轮次驱动和 GoalBar 继续管理原生状态与生命周期。组件由已安装宿主提供，预计无需新增 npm 依赖。
3. 工作台当前通过 `spawn` 创建子会话。父会话与子会话通过共享组合获得 Goal 工具；工具权限与目标作用域分别遵循宿主调研第 6、7 节。

### 5.3 persona 中的使用约定

1. 实施者在现有 persona 中集中补充本节约定，保留 `complete: true`。工具字段与允许的动作以运行时声明为准。
2. 用户明确要求创建持续目标时，Agent 才创建 Goal。普通任务沿用现有执行流程。
3. Agent 读取当前 Goal 后，按用户要求和现有 Skill 执行任务。交付物齐全且完成条件已验证时，Agent 标记完成并交付结果。涉及生成时，交付结果包含对应 Run ID。
4. 子任务仍在执行时，Agent 按现有委派规则结束当前回复。宿主等待子任务并发送通知，Agent 收到结果后继续工作。
5. 自动 Goal 轮出现同一阻塞时，Agent 按宿主连续阻塞规则判断是否标记阻塞。用户恢复目标后，Agent 重新观察阻塞是否持续。直接用户轮缺少必要输入时，Agent 说明所需输入，并按工具权限标记阻塞。权限和计数边界见宿主调研第 4、6 节。
6. Agent 依据用户要求暂停目标。用户通过 GoalBar 或 `/goal resume` 恢复已暂停目标，通过 `/goal resume` 恢复 `blocked` 目标。轮次耗尽后的恢复条件见宿主调研第 4 节第 6 项；其他状态按工具声明处理。
7. Agent 使用用户指定的轮次上限；省略时沿用宿主默认值。轮次耗尽后，原生界面显示阻塞原因，宿主停止目标续跑。
8. 用户恢复目标后，Agent 先读取已有 Run 的状态和结果，再执行剩余任务。

### 5.4 文件改动范围

1. `agent-presets/shared/agent.cordis.yml`：增加第 5.2 节的组件声明。
2. `agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml`：将第 5.3 节约定写入 persona。
3. `tests/production/source-agent-preset.test.mjs`：验证组件声明与配置结构。
4. `tests/production/fixtures/native-workbench-preset-runtime.mjs`、`tests/production/native-workbench-scope.test.mjs`：扩展宿主依赖和工具预期，验证实际调用、作用域及释放。
5. `tests/desktop/official-desktop-live.test.mjs`、`tests/desktop/fixtures/official-business-services.mjs`、`tests/desktop/fixtures/official-business-fixture.test.mjs`：复用受控模型、原生界面和会话导出，增加第 7 节用例及可控制完成时机的生成夹具。
6. `docs/system/configuration.md`、`docs/system/testing.md`：分别补充组件入口与验收入口。
7. `docs/verification/comfyui-workbench-goal/`：保存本次接入的验收证据。

### 5.5 实施步骤

1. 核对用户的方案批准与依赖安装授权。
2. 通过预设加载和工具公共接口编写失败测试，再添加原生组件。逐项验证主子会话作用域和组件释放。
3. 按第 5.3 节修改 persona，并派发干净上下文的独立语义审阅者逐行审阅。
4. 在官方 Desktop 受控模型测试中逐项加入第 7 节用例。每项先观察失败，再完成对应改动并验证通过。
5. 按[worktree 规范](../agents/worktree-development.md)运行独立官方应用，完成真实模型验收并导出会话轨迹。
6. 更新配置与测试文档，完成独立语义审阅和代码审查。对最终候选树运行 `pnpm quality` 与 `git diff --check`。
7. 停止本轮应用，确认进程和端口释放。提交验收结果供用户核对。

## 6. 方案待决策项清单

1. 当前无待决策事项。

## 7. 计划验收清单

1. 确定性测试通过官方 Preset、Tool、Goal service 和 Desktop 界面验证行为。真实模型验收负责判断 persona 使用约定是否得到遵守。
2. 实施者逐项保存下表中的结果。

   | 场景 | 通过条件 |
   | --- | --- |
   | 普通请求与明确 Goal 请求 | 普通请求结束后不创建目标；明确请求或 `/goal` 可以创建目标。 |
   | 工具、目标与界面 | Goal 工具实际可调用，工具返回与原生界面反映同一目标及修订。 |
   | 自动续跑与完成 | 未完成目标继续执行；完成后停止续跑并交付结果。 |
   | 子任务等待 | 父会话等待子任务结算，收到结果后继续；委派消息遵守原生 Goal 权限。 |
   | 暂停、阻塞与恢复 | Agent 按第 5.3 节处理用户暂停要求、判断阻塞并引导用户恢复；工具返回与原生界面显示的状态一致。 |
   | 轮次耗尽 | 宿主记录 `round-limit` 并停止续跑，原生界面显示阻塞状态和原因。 |
   | 重启与结果复用 | 目标和轮次恢复；用户恢复前不自动执行，恢复后可读取已有 Run。 |
   | 预设释放与重新挂载 | 工具按预设作用域提供，重新挂载后可正常调用。 |

3. 真实模型验收使用同一个工作台会话，覆盖创建、业务执行、子任务等待和完成。另用缺少输入的请求验证阻塞判断，用普通请求验证创建条件。
4. 验收证据包含应用与插件版本、模型、目标 ID、主子会话 ID、工具调用和返回。涉及生图时，记录 Run ID 与媒体结果。轨迹采集方法沿用 worktree 规范。
5. Goal 暂停与 Generation Run 的停止分别核对。已接纳 Run 的后续状态通过现有业务查询确认。

## 8. 非本次目标

1. 本次范围之外的产品改动包括：宿主源码、Goal 数据库、自制续跑器、Goal 界面和业务 Skill。
2. 本次范围之外的能力包括：定时执行、应用退出后的执行，以及 token、耗时或生成张数预算。

## 9. 已获得的授权

1. 用户已授权创建独立 worktree、调研宿主能力并设计方案，随后明确选择“只设计 Goal 的最小接入”。
2. 用户已通过 `implement` 指令授权实施、运行验收、独立审查和提交到当前分支。
