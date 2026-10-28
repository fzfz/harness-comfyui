---
文档用途: 记录 DeepSeek Harness 0.2.1-rc.3 原生 Goal 的组件、契约、续跑行为和源码证据。
读取时机: 设计 ComfyUI 工作台预设的 Goal 接入方式、状态展示和验收范围时。
---

# DeepSeek Harness 0.2.1-rc.3 原生 Goal 能力

## 1. 来源与证据范围

1. 当前工作目录为 `/Users/fzfz/.codex/worktrees/comfyui-goal-design/harness-comfyui`。`package.json:9` 的 `engines.dsh` 锁定 `0.2.1-rc.3`。
2. 已安装应用为 `/Applications/DeepSeek Harness.app`。应用的 `Contents/Resources/app.asar/package.json` 声明 `version=0.2.1-rc.3`、`dshBuildCommit=be72761ee1a6736ebcdf4f3739363b083ae53c98`、`dshBuildDirty=false`。
3. 本文的“安装包文件”均位于 `Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/`。本文按原始 JavaScript 文件的行号引用安装包代码。
4. 本文的“发布源码”均来自本机仓库 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 的提交 `1f81c047fc48fa190a683e469daa699857e9afe8`。该提交的说明为 `Merge pull request #6999 from deepseek-harness/worktree/release-dsh-0.2.1-rc.3`，提交日期为 `2026-10-23`。下文的 `packages/` 和 `apps/` 路径均相对于该提交的仓库根目录。[提交入口](https://github.com/deepseek-ai/deepseek-harness/tree/1f81c047fc48fa190a683e469daa699857e9afe8)
5. 本机 Git 对象库缺少已安装应用声明的构建提交。安装包与发布源码的完整构建对应关系仍待核验。
6. 安装包中的 `dsh-base/cordis.patch.yml`、`dsh-web-app/cordis.patch.yml`、`dsh-web-app/presets/standard.patch.yml` 与发布源码的对应文件逐字节相同。
7. 本文记录源码事实和上游测试断言。运行验收边界见第 10 节。

## 2. 组件分工与装配

1. 官方 Web 装配将 Goal 服务和续跑驱动放在宿主层。预设分别提供用户命令和模型工具。Web 界面通过 Remote 调用宿主服务。

   | 组件 | 职责 | 官方装配位置 | 原始证据 |
   | --- | --- | --- | --- |
   | `@deepseek-ai/dsh-goal` | 提供 `goals` 服务；维护 `goal` 会话投影、修订和进程内续跑授权。 | 宿主层 `goal` 行。 | 安装包 `dsh-goal/lib/index.js:588–604`；发布源码 `packages/goal/goal/src/index.ts:240–268`。 |
   | `@deepseek-ai/dsh-goal-round-driver` | 在同一会话安排下一轮，等待持久化和子代理，并处理取消、错误和卸载。 | 宿主层 `goal-round-driver` 行。 | 安装包 `dsh-goal-round-driver/lib/index.js:25–30,108–174,210–374`；发布源码 `packages/goal/goal-round-driver/src/index.ts:77–477`。 |
   | `@deepseek-ai/dsh-command-goal` | 注册 `/goal`，直接调用 `goals` 服务。 | 预设层 `command-goal` 行。 | 安装包 `dsh-command-goal/lib/index.js:109–186`；发布源码 `packages/goal/command-goal/src/index.ts:126–198`。 |
   | `@deepseek-ai/dsh-tool-goal` | 注册 3 个模型工具、静态使用规则和自主结束后的收尾消息。 | 预设层 `tool-goal` 行。 | 安装包 `dsh-tool-goal/lib/index.js:91–98,195–196,257–377`；发布源码 `packages/goal/tool-goal/src/index.ts:187–343`。 |
   | `@deepseek-ai/dsh-client-ui-goal` | 注册 GoalBar；订阅持久投影和实时授权；提供编辑、暂停、恢复和清除操作。 | Web 层 `ui-goal` 行。 | 安装包 `dsh-client-ui-goal/lib/client.js:171–379,604–651`；发布源码 `packages/client/ui-goal/src/client/index.ts:70–155`。 |

2. 宿主基础装配见 `packages/bundle/base/cordis.patch.yml:323–330,442–445`。Web 装配停用宿主层的 `command-goal` 和 `tool-goal`，见 `packages/bundle/web-app/cordis.patch.yml:525–532`。标准预设重新挂载这 2 个组件，见 `packages/bundle/web-app/presets/standard.patch.yml:41–44`。GoalBar 装配见 `packages/bundle/web-app/cordis.patch.yml:401–403`。
3. 驱动要求 `agents`、`goals` 和 `sessions` 服务。驱动通过 `ctx.get('subagents')` 选用子代理等待能力。证据：安装包 `dsh-goal-round-driver/lib/index.js:25–30,130–134`。

## 3. 模型工具契约

1. `tool-goal` 注册下表中的精确工具名和参数。工具参数与服务字段分别使用 snake_case 和 camelCase。证据：安装包 `dsh-tool-goal/lib/index.js:264–364`；发布源码 `packages/goal/tool-goal/src/index.ts:195–320`。

   | 工具 | 必填参数 | 可选参数 |
   | --- | --- | --- |
   | `get_goal` | 空对象。 | 无。 |
   | `create_goal` | `objective: string`。 | `max_goal_rounds: number`。 |
   | `update_goal` | `goal_id: string`、`revision: number`、`action: edit\|pause\|resume\|complete\|blocked`。 | `objective: string`、`max_goal_rounds: number`、`blocked_reason: string`。 |

2. `update_goal` 的 `objective` 和 `max_goal_rounds` 仅供 `edit` 使用。`edit` 至少需要其中 1 个字段。`blocked_reason` 仅供 `blocked` 使用，且必须包含非空文本。未使用的可选文本字段可填空字符串；未使用的轮次字段可填 `0`。证据：安装包 `dsh-tool-goal/lib/index.js:205–218,335–360`；发布源码 `packages/goal/tool-goal/tests/tool-goal.spec.ts:467–584`。
3. 当前 Goal 存在时，工具返回 `{ goal: { id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason? }, activation }`。当前 Goal 不存在时，工具返回 `{ goal: null }`。证据：安装包 `dsh-tool-goal/lib/index.js:221–237`；发布源码 `packages/goal/tool-goal/src/index.ts:157–173`。
4. 更新操作使用 `goal_id` 和 `revision` 校验当前修订。每次持久变更递增 `revision`。陈旧修订触发 `GOAL_STALE_REVISION`。证据：发布源码 `packages/goal/goal/src/index.ts:443–453,510–519`。
5. `/goal` 支持查看、创建、`edit`、`pause`、`resume`、`clear`。创建和编辑可携带附件。附件形成普通用户消息，供后续模型轮读取。命令及命令结果由命令界面呈现。证据：发布源码 `packages/goal/command-goal/src/index.ts:15–35,111–187`；`apps/web/tests/goal-command-presentation.e2e.ts:46–135`。

## 4. 状态与轮次预算

1. Goal 将持久阶段与进程内续跑授权分开维护。

   | 字段 | 取值或含义 | 保存位置 |
   | --- | --- | --- |
   | `phase` | `active`、`paused`、`blocked`、`complete`。 | `goal/change` 会话事件与 `goal` 投影。 |
   | `activation` | `armed` 允许自动续跑；`disarmed` 需要重新授权。 | 以 `Session` 为键的进程内 `WeakMap`。 |
   | `roundsStarted` | 当前 Goal 已进入会话历史的自动续跑轮数。 | 从 Goal 事件和带 Goal 来源的用户消息推导。 |
   | `maxGoalRounds` | 当前 Goal 的自动续跑轮次上限。 | Goal 持久定义。 |
   | `blockedReason` | `blocked` 阶段的 `code` 和 `message`。 | Goal 持久定义。 |

2. Goal 服务默认 `defaultMaxGoalRounds=256`。轮次上限必须为正安全整数。Goal 类型与工具参数定义的预算仅包含自动续跑轮数。证据：安装包 `dsh-goal/lib/index.js:455–469,588–593`；发布源码 `packages/goal/goal/src/types.ts:28–88`、`packages/goal/goal/src/index.ts:199–204`。
3. 创建产生 `active + armed`，初始 `revision=1`、`roundsStarted=0`。当前 Goal 为 `complete` 时，服务允许创建另一个 Goal；其他阶段需要先处理当前 Goal。证据：安装包 `dsh-goal/lib/index.js:635–648`。
4. `pause` 将 `active` 改为 `paused + disarmed`。`resume` 可将 `paused`、`blocked` 或 `active + disarmed` 改为 `active + armed`。`complete` 可结束 `active`、`paused` 或 `blocked`。`clear` 写入带修订的删除记录。证据：发布源码 `packages/goal/goal/src/index.ts:351–433`。
5. 普通用户轮和 `round=0` 上下文不消耗轮次预算。正轮次 Goal 消息进入 `user/message` 历史后，投影才递增 `roundsStarted`。消息必须匹配当前 Goal、修订和下一轮序号。证据：安装包 `dsh-goal/lib/index.js:265–283`；发布源码 `packages/goal/goal/src/fold.ts:313–332`。
6. 预算耗尽后，驱动记录 `blockedReason.code=round-limit`。恢复前需要增加 `maxGoalRounds`。编辑与恢复均保留累计轮次。证据：安装包 `dsh-goal-round-driver/lib/index.js:135–140`；发布源码 `packages/goal/goal/tests/goal.spec.ts:397–429`。
7. `blockedAfterConsecutiveRounds` 默认为 `3`。工具的硬性校验为 `roundsStarted >= blockedAfterConsecutiveRounds`。同一阻塞持续存在的判断由模型承担；“连续同一阻塞”规则写在静态 `guidance()` 中。宿主当前只保存累计 Goal 轮次。证据：安装包 `dsh-tool-goal/lib/index.js:115,195–196,360`。

## 5. 自动续跑、用户输入和停止条件

1. 驱动收到 `goal/changed` 或 Agent 进入 `idle` 的事件后，尝试安排下一轮。自动续跑要求 Goal 为 `active + armed`，Agent 为当前存活实例，Agent 状态为 `idle`，且用户队列已经处理。证据：安装包 `dsh-goal-round-driver/lib/index.js:75–89,223–255`。
2. 驱动先等待 `sessions.flush()`，再等待 `subagents.waitForChildren()`。等待结束后，驱动重新核对 Agent、用户队列和待持久化状态。证据：安装包 `dsh-goal-round-driver/lib/index.js:108–134`。
3. 子代理等待覆盖后代创建、运行、关闭和结果结算。后代处于 `idle` 且结果仍待结算时，驱动继续等待。证据：发布源码 `packages/subagent/subagent/src/manager.ts:252–290`。
4. 驱动通过 `agent.followup()` 插入同会话消息。消息来源含 `kind=goal`、`goalId`、`revision`、`round`。进入模型步骤前，驱动再次校验预留消息和当前修订。陈旧 Goal 消息会退出当前步骤，其他已领取上下文会回到队列。证据：安装包 `dsh-goal-round-driver/lib/index.js:142–164,285–352`。
5. 用户消息已排队时，驱动等待用户消息执行。用户消息在 Goal 消息预留后抵达时，驱动将预留消息标为陈旧。用户消息执行结束后，仍为 `active + armed` 的 Goal 可继续续跑。证据：发布源码 `packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts:420–473,969–983`。
6. 宿主从 UI 或命令暂停运行中的 Goal 时，驱动取消当前 Agent 轮，并保留收件箱。模型在当前轮自行暂停时，当前轮可正常结束。用户取消已预留或已进入模型步骤的 Goal 轮时，驱动在 Agent 空闲后写入 `paused`。证据：安装包 `dsh-goal-round-driver/lib/index.js:223–246,273–280`；发布源码 `packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts:294–418`。
7. 发生 `agent/error`、`max-tokens` 或持久化失败时，驱动撤销进程内续跑授权。入队失败和下游步骤拒绝分别记录 `queue-failed`、`prompt-rejected` 阻塞原因。证据：安装包 `dsh-goal-round-driver/lib/index.js:111–118,165–172,210–213,273–280,316–331`。
8. 驱动加载到已有 Agent 时先撤销续跑授权。卸载时，驱动结束子代理等待，撤销授权，取消本驱动预留的执行，并等待驱动任务结束。证据：安装包 `dsh-goal-round-driver/lib/index.js:353–374`。
9. 模型在自动 Goal 轮中标记 `complete` 或 `blocked` 后，工具通过 `deferContext()` 提供收尾指令。指令要求模型向用户报告结果并结束工具调用。工具此处采用提示词约束，当前调用未设置强制停止模型轮的返回值。证据：安装包 `dsh-tool-goal/lib/index.js:91–98,361–377`。
10. 轮次耗尽时，驱动在 Agent 空闲阶段记录 `round-limit`，随后因 `blocked + disarmed` 停止调度。该场景以阻塞状态及原因为预期交付。模型调用工具结束 Goal 时的收尾指令见本节第 9 项。证据：安装包 `dsh-goal-round-driver/lib/index.js:80–81,128–140`。

## 6. 模型权限与用户权限

1. 3 个 Goal 工具均要求调用方为当前存活的 Agent、处于 `running` 状态、拥有当前驱动身份，并存在开放模型轮。证据：安装包 `dsh-tool-goal/lib/index.js:12–34`。
2. `create`、`edit`、`pause` 和 `resume` 要求当前运行时根 Agent 的开放轮包含 `source.kind=user` 的消息。工具通过消息来源授予调用权限。用户是否要求创建或恢复 Goal，由模型理解。`create_goal` 的描述允许模型从长期任务中推断 Goal 意图。证据：安装包 `dsh-tool-goal/lib/index.js:49–64,123,290–295,342–353`。
3. 模型 `resume` 对持久阶段为 `paused` 的 Goal 返回 `GOAL_TOOL_RESUME_PAUSED`。用户需要通过 `/goal resume` 或 GoalBar 恢复该阶段。模型可在直接用户轮中重新授权 `active + disarmed` 的 Goal。证据：安装包 `dsh-tool-goal/lib/index.js:348–353`；发布源码 `packages/goal/tool-goal/tests/tool-goal.spec.ts:387–402,451–465`。
4. `complete` 和 `blocked` 允许 2 种来源：根 Agent 的直接用户轮，或匹配当前 Goal、修订和已接纳轮次的自动 Goal 轮。直接用户轮可在默认 `3` 轮门槛前标记阻塞。证据：安装包 `dsh-tool-goal/lib/index.js:72–79,356–364`；发布源码 `packages/goal/tool-goal/tests/tool-goal.spec.ts:586–653`。
5. 子代理从父代理收到的任务消息具有子代理来源。活跃子代理的该类消息不授予根用户权限。fork 会话作为运行时根 Agent 重新打开后，当前直接用户消息可授予权限。证据：发布源码 `packages/goal/tool-goal/tests/tool-goal.spec.ts:243–308`。
6. GoalBar 在 `active + armed` 时显示暂停，在 `paused` 或 `active + disarmed` 时显示恢复，在 `blocked` 时显示阻塞原因及编辑、清除操作。完成后的 GoalBar 隐藏。`blocked` 阶段可通过 `/goal resume` 恢复。证据：安装包 `dsh-client-ui-goal/lib/client.js:207,267–269,297–359`；发布源码 `packages/goal/command-goal/src/index.ts:168–170`。

## 7. 持久化、重启和父子会话

1. Goal 服务向所属 Agent 的会话追加 `goal/change`。投影从事件重建 Goal 定义、修订、轮次和时间。`activation` 仅存于进程内。证据：安装包 `dsh-goal/lib/index.js:588–603,858–877`；发布源码 `packages/goal/goal/src/types.ts:78–120`。
2. 新建 Agent、会话重新打开或 fork 后，恢复的 Goal 初始授权为 `disarmed`。恢复 Goal 状态与启动自动模型调用分别依赖事件重放和后续 `resume`。证据：发布源码 `packages/goal/goal/tests/goal.spec.ts:204–263`、`packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts:222–256`。
3. fork 可继承父会话已完成轮的 Goal 事件前缀。子会话保留继承的 Goal 标识和轮次，但拥有独立会话和进程内授权。spawn 从空会话开始。证据：发布源码 `packages/subagent/subagent-fork-in-process/src/index.ts:46–77`、`packages/subagent/subagent-spawn-in-process/src/index.ts:50–54`；`packages/goal/goal/tests/goal.spec.ts:223–245`。
4. 宿主 `goals` 服务校验传入 Agent 是否为当前存活实例，再访问其所属 Session。证据：发布源码 `packages/goal/goal/src/index.ts:271–288,457–478`。工具作用域见第 2 节，父会话续跑前的子代理等待见第 5 节。

## 8. 完整 persona 对 Goal 信息的影响

1. `persona.complete=true` 将 persona 前缀设为唯一静态 section。`SystemPrompt.assemble()` 在扩展处理结束后再次恢复该 section。`tool-goal` 注册的 `tool:goal` 静态规则随其他静态 section 一起移出最终提示词。证据：安装包 `dsh-persona/lib/index.js:35–48`、`dsh-system-prompt/lib/index.js:381–404`、`dsh-tool-goal/lib/index.js:257–263`；发布源码 `packages/preset/persona/tests/persona.spec.ts:126–141`。
2. `includeRuntimeContext=true` 保留已注册动态上下文。`complete` 过滤仅替换 `sections`，工具 schema 仍由 `tools` 数组提供。证据：安装包 `dsh-system-prompt/lib/index.js:394–404`；发布源码 `packages/core/system-prompt/src/index.ts:614–688`。
3. 原生 Goal 服务和工具当前分别注册投影、工具和静态规则。Goal 的自动续跑指令通过普通消息进入历史。该消息与系统提示词动态上下文使用不同入口。证据：安装包 `dsh-goal/lib/index.js:591–604`、`dsh-tool-goal/lib/index.js:257–377`、`dsh-goal-round-driver/lib/index.js:142–164`。
4. 自动续跑消息使用 `<goal_round>`，包含目标、当前轮次、总上限和验证完成要求。消息用自然语言要求读取 Goal 并完成标记。精确工具名由工具 schema 提供。证据：安装包 `dsh-goal-round-driver/lib/index.js:11–18`；发布源码 `packages/goal/goal-round-driver/src/prompt.ts:12–26`。
5. 工具声明保留第 3、4、6 节所述的参数约束和动作权限描述。静态 `guidance()` 另行提供重启授权、完成标准、连续同一阻塞和任务难度判断的指引；完整 persona 会移除该指引。证据：安装包 `dsh-tool-goal/lib/index.js:123–124,195–196,315–331,352,360`。
6. 采用完整 persona 的预设需要提供业务所需的创建条件、验收条件和阻塞判断指引。真实模型的规则遵循验收见第 10 节。

## 9. 宿主现有测试覆盖

1. 发布源码包含下列测试断言。下表列出与本次接入判断直接有关的范围。

   | 测试范围 | 原始测试路径和行号 | 已定义的断言 |
   | --- | --- | --- |
   | 状态与预算 | `packages/goal/goal/tests/goal.spec.ts:122–183,204–263,397–429` | 默认预算、重放、fork、初始撤销授权和耗尽后的恢复。 |
   | 持久投影 | `packages/goal/goal/tests/projection.spec.ts:85–259` | 创建、变更、清除、严格重放错误和卸载。 |
   | 模型权限 | `packages/goal/tool-goal/tests/tool-goal.spec.ts:230–360,387–465,586–653` | 根用户轮、子代理、暂停后的恢复限制、完成和阻塞门槛。 |
   | 轮次调度 | `packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts:195–256,294–418,420–568,570–615` | 预算、用户消息顺序、取消、修订过期和持久化。 |
   | 后代与生命周期 | `packages/goal/goal-round-driver/tests/goal-round-driver.spec.ts:945–1095` | 后代等待、等待中的用户输入、卸载、重新打开和终态错误。 |
   | 完整 persona | `packages/preset/persona/tests/persona.spec.ts:126–176` | 唯一静态 section、动态上下文开关和默认保留。 |
   | GoalBar | `packages/client/ui-goal/tests/goalbar.client.spec.tsx:37–240` | 阶段显示、操作、快速点击和 Remote 错误。 |
   | Web 命令与重载 | `apps/web/tests/goal-command-presentation.e2e.ts:46–135` | 命令界面呈现与持久历史重载。 |
   | 进程持久化 | `packages/goal/goal/tests/goal.e2e.ts:27–75` | Headless 进程写入 Goal 事件；该用例预期自动 Goal 轮数为 `0`。 |

## 10. 运行验收边界与待验证项

1. 当前结论依据安装包元数据、安装包代码和发布源码。第 9 节列出的上游测试尚未在本轮执行。
2. 安装包与发布源码的完整构建对应关系仍待核验，已有证据见第 1 节第 5、6 项。
3. 本轮尚未启动官方 Desktop 实例或调用模型。`ComfyUI工作台预设` 装配后的工具可见性、命令可用性、GoalBar 和同会话自动续跑仍待运行验收。
4. 真实模型验收使用完整 persona，验证长期任务的创建判断、暂停和恢复表达。验收还需核对连续同一阻塞判断、完成前证据和结束后的用户回执。
5. 宿主重放测试分别覆盖状态恢复和撤销授权。安装包进程重启后的状态展示与首次模型调用时机仍待 Desktop 验收。
