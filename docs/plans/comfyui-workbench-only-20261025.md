---
文档用途: 规定 ComfyUI 单一工作台预设、宿主重复实现的删除范围、实施顺序与验收条件。
读取时机: 审批本次改动、实施预设与 Skill 清理，或验收候选插件前。
---

# ComfyUI 单一工作台预设与宿主重复实现清理计划

## 1. 名词定义

1. **DSH**：DeepSeek Harness 宿主。
2. **工作台预设**：用户选择的 ComfyUI 能力组合，提供项目工具、通用任务派发和 Skill 访问。
3. **迭代功能**：由迭代预设、构图、生成、观察和比较派发工具，以及 `comfyui-iterate-generation` Skill 共同提供的图片迭代流程。
4. **退役预设**：第 5.2 节列出的 6 个项目预设。
5. **子会话**：DSH 通过 `spawn` 创建的独立 Agent 对话。
6. **实施者**：获得实施授权后，修改源码、配置、文档与已确认 Skill 链接的 Agent。
7. **验收者**：运行验收用例、读取调用轨迹与产物的 Agent。
8. **Workspace**：DSH 保存的项目目录记录，具有独立 ID 和会话分组列表。
9. **当前工作目录**：DSH `workingDirectory` 服务提供的会话执行目录。
10. **Run**：本文对 Generation Run 的简称。定义见 [CONTEXT.md](../../CONTEXT.md) 的 Generation Run 条目。
11. **原始项目目录**：会话创建时写入 `SessionHeader.cwd` 的目录。

## 2. 总目标

1. 插件仅注册“ComfyUI工作台预设”，保持 ID `harness-comfyui-cli-candidate` 和排序 `91`。
2. 工作台启用 DSH 官方子 Agent 工具。子会话继承当前工作台组合，任务派发与续派由宿主处理。
3. 实施者删除迭代功能及其专用资源，删除项目对 DSH 已有能力的重复实现。删除对象见第 5.4 节。
4. 其余生图、图片读取、图片审阅和 Prompt Builder Skills 保留。实施者交付候选变更及第 7 节要求的验收证据。

## 3. 现状调研

### 3.1. 仓库与安装现状

1. 仓库基线为 `2bb302449a0a1580e8322b3db2837d854bff9f67`，插件版本为 `0.47.2`，宿主接口为 DSH `0.2.1-rc.3`。
2. [预设注册文件](../../agent-presets/presets.cordis.yml)当前注册 2 个产品预设和 5 个角色预设。工作台的通用子任务使用工作台任务角色预设；迭代预设使用构图、生成、观察和比较角色预设。
3. [项目派发组件](../../agent-presets/project-iteration-dispatch.mjs)当前供工作台和迭代预设使用。该组件将首派与续派合并为 `subagent_task`，并生成项目回执与附加上下文。
4. [观察派发组件](../../agent-presets/project-observation-dispatch.mjs)只由迭代预设加载。观察派发组件通过 Core service 调用 [resolveObservationMedia()](../../src/host/generation/observation-media.ts)。该函数的生产调用入口仅供此适配使用；底层 Run 媒体查询仍有其他业务消费者。
5. `.agents/skills/comfyui-iterate-generation/` 当前包含 `SKILL.md` 和 4 个参考文档。其评估输入位于 `tests/skills/comfyui-iterate-generation/evals.json`，目录声明位于 `tests/fixtures/repository-skill-catalog.json`。
6. 已核实 `/Users/fzfz/.agents/skills/comfyui-iterate-generation` 是软链接，目标为 `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-iterate-generation`。
7. 项目预设当前复用宿主 Skill 服务及默认文件目录 provider。[插件打包配置](../../config/plugin-package.json)排除项目 Skills；用户按[安装项目 Skills](../user/install-update.md#安装项目-skills)配置源码目录或软链接。
8. 预设数量、角色工具和 Skill 列表的断言分布在单元测试、生产模块测试和官方 Desktop 用例中。现有 Desktop 和 MCP 验收文件同时覆盖工作台与迭代行为，需要按用例清理。
9. [项目中断工具](../../agent-presets/project-subagent-control.mjs)调用宿主 `interrupt()`，同时维护项目自己的参数、描述和返回格式。官方控制工具已提供同一能力。
10. [子会话登记组件](../../agent-presets/project-subagent-workspace.mjs)在 Agent step 前核对父子目录并附加子会话。[CLI 登记入口](../../src/host/cli/workspace.ts)创建 Workspace 并附加主会话。[Core 插件](../../src/host/core/plugin.ts)还根据 `startupWorkspacePath` 创建 Workspace。
11. [Tool 身份解析](../../src/host/generation/tool-execution-identity.ts)和 [CLI 身份解析](../../src/host/cli/dispatch.ts)要求当前会话出现在 `workspace.sessionIds` 中。[结果访问范围](../../src/host/generation/workspace-access.ts)从该列表筛选候选，再逐个读取 `parentSession` 并遍历祖先链。
12. [工具可见性组件](../../agent-presets/project-tool-visibility.mjs)监听 `tools/change`，维护屏蔽集合和释放列表。[提示词可见性组件](../../agent-presets/project-system-prompt-visibility.mjs)在 assembly 完成后删除宿主段落。
13. [项目工具注册函数](../../src/host/tools/register-project-tools.ts)重复校验工具声明，并维护批量注册、回滚和释放。Core 与 Image Reader 插件调用该函数；[边界检查脚本](../../scripts/security/check-harness-boundary.mjs)还要求注册必须经过该函数。
14. [安装资源入口](../../agent-presets/project-installed-presets.mjs)继承官方 Include，仅提供包内路径和 `patches` 配置。加载、预设注册及释放均由官方组件执行。

### 3.2. 宿主接口依据

1. 以下接口依据来自 DSH `dsh-v0.2.1-rc.3`。

   | 依据 | 已核实的行为 |
   | --- | --- |
   | [Preset registry](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/preset/agent-preset-registry/README.md) | 多个 Agent 可以使用同一预设组合。 |
   | [官方派发工具](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/subagent/tool-subagent/README.md) | 提供 `subagent`，接纳后返回子会话 ID；支持模型继承和深度限制。 |
   | [官方控制工具](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/subagent/tool-subagent-control/README.md) | 提供 `send_message`、`interrupt_agent` 和 `list_agents`；可继续已结束的本地子会话。 |
   | [applyChildComposition()](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/subagent/subagent/src/child-agent.ts) | 省略 `agentPreset` 时，子会话继承父 Agent 当前组合；会话元数据保存对应预设身份。 |
   | [spawn Provider](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/subagent/subagent-spawn-in-process/src/index.ts) | 子会话独立创建，不继承父对话历史。 |
   | [子会话恢复合同](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/subagent/subagent/README.md#restoring-child-composition) | 显式选择的预设 ID 会被保存；预设缺失会阻止冷恢复。 |
   | [工作目录服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/session/working-directory/README.md) | 宿主保存当前目录，并向模型提供目录上下文。子任务默认取得派发时的当前目录。 |
   | [Workspace 合同](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/docs/subsystems/workspace.md) | API 创建会话后执行分组附加；单独具有 `cwd` 的会话可以处于未分组状态。 |
   | [子会话目录查询](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/subagent/subagent/src/list-children.ts) | `listDescendants()` 从宿主持久化目录取得后代及分支诊断，支持冷读取与取消。 |
   | [工具注册与作用域](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/core/tools/src/index.ts) | `register()` 校验输出声明并注册作用域资源；`restrict()` 维护工具范围。 |
   | [作用域生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/core/scope/README.md) | 注册跟随所属作用域释放。 |
   | [提示词组装](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/core/system-prompt/README.md) | 宿主组装身份、运行环境、persona 和工具说明。 |


## 4. 面临的问题

1. 项目派发与中断代码重复封装宿主已有能力。项目还需维护自己的工具参数、回执和续派说明。
2. 项目将 Workspace 分组登记设为业务调用条件，随后增加主会话和子会话登记代码。删除登记组件时，身份解析与结果查询必须同步退出这项依赖。
3. 工具注册、工具范围同步和父子会话遍历重复承担宿主职责。现有边界脚本和测试又要求这些实现继续存在。
4. 观察派发组件退役后，专用 Core service 方法、类型和夹具将失去消费者。
5. 迭代 Skill 的源码、软链接、目录声明和评估输入需要一并清理。
6. 删除阶段需要保留现有测试暴露依赖。混合测试中的业务失败必须与退役逻辑断言分别处理。

## 5. 问题的解决和实施方案

### 5.1. 职责分配与架构流程图

1. 工作台 persona 说明按当前任务选用 Skill、使用项目能力和交付结果的要求。主会话与子会话共同使用该 persona。

   | 承担者 | 职责 | 唯一来源 |
   | --- | --- | --- |
   | 工作台预设 | 组合通用 persona、项目能力及官方子 Agent 工具。 | `agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml` |
   | 公共组合 | 提供 NoobAI MCP、前台 shell、Skill 访问和 compaction。 | `agent-presets/shared/agent.cordis.yml` |
   | 官方子 Agent 工具 | 接收派发、续派、中断和查询请求，调用宿主服务。 | 第 3.2 节的官方工具包。 |
   | 各业务 Skill | 定义自身任务的执行方法及所需参考。 | `.agents/skills/<skill-name>/` |
   | DSH | 管理会话、目录、工具作用域、提示词、Skill 发现和任务生命周期。 | 第 3.2 节的官方服务 |
   | ComfyUI Host | 将宿主身份用于 Run 归属，并提供生成、查询和媒体访问。 | `src/host/generation/` |

   ```mermaid
   flowchart TD
     Request[用户任务] --> Parent[工作台主会话]
     Parent --> Direct[读取适用 Skill 并执行]
     Parent --> Dispatch[官方 subagent 创建任务]
     Parent --> Continue[官方 send_message 续派]
     Dispatch --> Host[DSH 管理子会话]
     Continue --> Host
     Host --> Child[工作台子会话]
     Child --> Execute[按任务读取适用 Skill 并执行]
     Execute --> Result[交付结果或错误]
     Result --> Notice[DSH 通知父 Agent]
     Notice --> Consume[父 Agent 读取结果并回复用户]
     Direct --> Consume
   ```

### 5.2. 预设注册与配置

1. 实施者删除下表预设的注册项、目录和包资源记录。

   | Preset ID | 当前用途 |
   | --- | --- |
   | `harness-comfyui-iteration` | 迭代产品入口。 |
   | `harness-comfyui-task` | 工作台通用子任务。 |
   | `harness-comfyui-composition` | 构图子任务。 |
   | `harness-comfyui-generation` | 生成子任务。 |
   | `harness-comfyui-observation` | 观察子任务。 |
   | `harness-comfyui-comparison` | 比较子任务。 |

2. `config/product-agent.json` 继续以 `preset.id` 保存唯一项目预设 ID。实施者删除 `additionalManagedPresetIds`，将该配置的 `schemaVersion` 更新为 `4`，同步修改 `config/product-agent-schema.mjs` 和消费该字段的构建、测试夹具。
3. 实施者将 `scripts/build/agent-preset-resources.mjs` 的项目预设读取与校验改为单一工作台入口。配置解析器中的多预设 ID 去重逻辑同时删除。
4. 官方内置预设继续由宿主管理。插件资源校验仍核对工作台配置、公共组合及其运行文件。

### 5.3. 官方子 Agent 工具配置

1. 实施者在工作台 `agent.cordis.yml` 中用下列官方组件替换项目派发与中断组件。宿主已有的子 Agent 服务和 `spawn` provider 继续复用。

   ```yaml
   - id: task-agent
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       provider: spawn
       maxDepth: 1
   - id: tool-subagent-control
     name: '@deepseek-ai/dsh-tool-subagent-control'
   ```

2. 公共组合保留已有的 `@deepseek-ai/dsh-tool-subagent-control/list-agents`。官方工具各注册一次，主会话和子会话共同使用。
3. 官方派发配置省略 `agentPreset` 和 `agentOptions`，由宿主继承工作台组合及父 Agent 的模型配置。任务内容由 `subagent` 的 `prompt` 参数传递；续派使用 `send_message`。
4. 工具参数、返回结构、使用说明及结束通知以第 3.2 节的官方合同为准。实施者将使用项目回执的代码、测试和文档改为使用官方工具结果。

### 5.4. 退役资源与项目封装清理

1. 下表是实现删除清单。表中仅写文件名的 `project-*` 文件和 `message-source.d.ts` 均位于 `agent-presets/`。测试清理时机按第 5.8 节执行。

   | 编号 | 实现或资源 | 删除内容 | 后续承接方式 |
   | --- | --- | --- | --- |
   | R1 | 第 5.2 节列出的 6 个预设 | 目录、注册项、角色 persona、Goal 组合和专用工具配置。 | 单一工作台组合。 |
   | R2 | `.agents/skills/comfyui-iterate-generation/` | 整个 Skill 目录及参考文档。 | 迭代功能退役。 |
   | R3 | `project-iteration-dispatch.mjs`、`project-dispatch.json`、`message-source.d.ts` | 文件，以及自定义首派、续派、任务模板、回执和 `harness-subagent-accepted` 上下文。 | 第 5.3 节的官方工具。 |
   | R4 | `project-subagent-control.mjs`、`project-subagent-control.json` | 文件及项目中断参数、回执和文案。 | 官方 `interrupt_agent`。 |
   | R5 | `project-observation-dispatch.mjs`、`project-observation.json`、`src/host/generation/observation-media.ts` | 文件、Core 暴露方法，以及 `ObservationMediaReference`、`ResolvedObservationMedia` 类型。 | 观察派发退役；已有 Run 媒体查询保留。 |
   | R6 | `project-subagent-workspace.mjs`、`src/host/cli/workspace.ts` | 文件，以及 step 前目录核对、Workspace 创建和会话附加。 | 第 5.5 节的宿主目录读取。 |
   | R7 | `src/host/core/plugin.ts`、`src/host/core/schema.ts` | `startupWorkspacePath` 配置、启动时创建 Workspace 的逻辑，以及退役环境字段 `HARNESS_COMFYUI_STARTUP_WORKSPACE_PATH` 的处理。 | Workspace 由官方界面或宿主 API 创建。 |
   | R8 | `src/host/generation/tool-execution-identity.ts`、`src/host/cli/dispatch.ts`、`src/host/generation/workspace-access.ts` | 调用方必须位于 `workspace.sessionIds` 的前置条件；项目扫描会话列表及遍历祖先链的实现和专用类型。 | 读取宿主原始项目目录、已有 Workspace 及后代目录。 |
   | R9 | `src/host/tools/register-project-tools.ts` | 整个文件，包括声明预校验、批量注册、回滚和释放封装。 | Core 与 Image Reader 直接注册业务工具，生命周期交给 Cordis。 |
   | R10 | `project-tool-visibility.mjs` | 整个文件、共享组合加载项及资源清单项；包含工具过滤声明、模式分支、屏蔽集合、`tools/change` 监听、重入状态和释放列表。 | 宿主默认工具继承与注册行为。 |
   | R11 | `project-system-prompt-visibility.mjs` | 整个文件、共享组合加载项及 `hiddenSectionNames` 配置。 | 宿主默认提示词组装。 |

2. 实施者清理删除对象的导入、服务注入、YAML 加载项和包导出。覆盖 `config/plugin-runtime-resources.json`、`config/runtime-artifacts.json`、`package.json` 及 `tsconfig.agent-presets.json`。该 TypeScript 配置完成清理后仍有源码消费者时，保留其有效检查入口。
3. `scripts/security/check-harness-boundary.mjs` 删除必须经 `registerProjectTools()` 注册的规则。实施者保留业务工具注册位置的约束，改为核对 Core 与 Image Reader 的官方 API 调用。
4. 下表组件承担项目接入或业务职责，按表中范围保留。

   | 对象 | 已核实的保留职责 |
   | --- | --- |
   | `project-installed-presets.mjs` | 定位安装包内 `presets.cordis.yml`，向官方 Include 传递 `patches`。 |
   | `shared/agent.cordis.yml`、`noobai-mcp.cordis.yml` | 声明项目所需官方组件和 NoobAI MCP 连接。 |
   | `src/host/cli/` 中的服务、路由和 capability | 将前台 shell 调用关联到 ComfyUI 业务请求；业务 HTTP 接口使用每次调用的凭据。 |
   | `src/host/generation/generation-runtime.ts`、`src/host/image-reader/image-reader-service.ts`、`src/host/catalog/catalog-service.ts` | 生成图片、保存 Run、读取媒体和查询项目数据。 |

5. 本方案新增依赖包数量为 0。实施者核对实际运行的宿主版本与第 3.1 节一致；本地已安装依赖与声明版本不一致时，先取得依赖安装授权。

### 5.5. 宿主目录、工具与业务身份接入

1. 主会话和子会话的执行目录、目录变化、持久化及模型上下文由 DSH 管理。官方 `spawn` 将父会话的 `SessionHeader.cwd` 写入子会话头，并将派发时的当前目录作为子会话的初始执行目录。项目通过官方服务读取当前目录，通过会话头读取原始项目目录。
2. Run 身份解析使用原始项目目录调用 `workspaceRegistry.resolveByPath()`。解析结果提供现有 Workspace ID。当前目录变化只影响执行位置；Run 继续归属原始项目。目录尚未注册时，业务接口提示用户通过官方入口选择或创建 Workspace。
3. CLI 与 Tool 共用 Run 身份中的 Workspace 解析规则。当前会话可以处于未分组状态；项目通过宿主提供的 Session、Turn 和 Tool Call 事实建立业务追踪身份。
4. `src/host/generation/generation-service.ts` 与 `media-routes.ts` 保留当前会话和后代会话的 Run 访问范围。后代列表来自 `subagents.listDescendants()`。项目只筛选具有相同原始项目目录的本地会话。官方查询返回分支诊断时，接口报告该分支不可读取。项目将取消信号传给官方查询。
5. Core 与 Image Reader 直接调用 `ctx.tools.register()`。工具业务参数及输出定义仍由各业务工具维护；注册生命周期使用官方作用域。
6. 工作台使用宿主默认工具范围，继承宿主全局工具及工作台组合工具。官方工具注册表负责范围计算和动态变化。
7. R11 清理后，工作台使用宿主身份、来源、Web 环境和交付文件说明。项目 persona 只说明 ComfyUI 业务用途及 Skill 使用要求。

### 5.6. Skill 安装与默认发现

1. 实施者在获准的生产切换阶段核对第 3.1 节记录的全局软链接目标。目标路径仍与记录相同时，实施者删除该软链接本身。目标已变化时，实施者记录当前值并交由用户决定。
2. 候选 worktree 的验收使用隔离 Skill 目录，链接本次保留的项目 Skills。验收者按第 7 节 A5 核对默认发现结果。

### 5.7. 测试、夹具与文档处置

1. 实施者调整下表消费者，使当前描述、测试输入和断言对应单一工作台预设。

   | 范围 | 主要对象 | 修改要求 |
   | --- | --- | --- |
   | 预设资源测试 | `installed-presets.test.mjs`、`source-agent-preset.test.mjs`、`official-agent-preset-resources.test.mjs`、`plugin-build-presets.test.mjs`、`plugin-package.test.mjs` | 核对工作台身份、配置结构和包内资源。 |
   | 派发与控制 | `native-workbench-subagent.test.mjs`、`native-subagent-completion.test.mjs`、`native-subagent-control.test.mjs`、`native-iteration-roles.test.mjs`、`project-subagent-control.test.mjs` | 删除这些直接导入项目包装实现的测试文件。 |
   | Workspace 与注册包装 | `tests/unit/cli-workspace.test.ts`、`tests/unit/register-project-tools.test.ts` | 删除文件及失去消费者的测试辅助函数。 |
   | 观察适配 | `tests/unit/observation-media.test.ts`、`tests/unit/fixtures/observation-media-runtime.ts` | 删除文件。 |
   | 包装夹具 | `tests/production/fixtures/project-subagent-control-runtime.mjs`、`tests/fixtures/agent-presets/project-tool-visibility.mjs`、`project-system-prompt-visibility.mjs`、`harness-comfyui-schema-control/` | 删除已无保留用例消费的文件。后 2 项路径相对 `tests/fixtures/agent-presets/`。共享夹具只删除退役字段和分支。 |
   | 混合用例 | `source-agent-preset.test.mjs`、`official-mcp-acceptance.test.mjs`、`tests/integration/host-plugin.test.ts` | 删除迭代角色、自动登记、提示词过滤和包装内部状态断言。保留单一工作台、MCP、业务身份、媒体访问及插件生命周期用例。 |
   | Skill 测试 | `tests/skills/comfyui-iterate-generation/`、`tests/fixtures/repository-skill-catalog.json` | 删除迭代 Skill 的评估输入和目录条目。 |
   | 构建与边界 | `tests/contract/engineering-baseline.test.ts`、`tests/security/check-harness-boundary.test.ts`、`official-candidate-identity.test.mjs` | 删除退役导出和包装路径要求，核对现有业务入口。 |
   | 官方 Desktop | `tests/desktop/official-desktop-live.test.mjs`、`tests/desktop/fixtures/official-business-services.mjs`、`official-preset-overrides.mjs`、`official-lifecycle-services.mjs`及其生产模块测试 | 删除专用派发、角色、`startupWorkspacePath` 插件配置和排除 `send_message` 的断言。保留 Workspace 路径夹具，通过官方 API 建立测试环境。 |
   | Skill 归属 | `tests/contract/profile-skill-ownership.test.ts` | 按单一项目预设核对宿主服务与安装包边界。 |
   | 项目规范 | `docs/agents/comfyui-workbench-preset-and-skill-development.md` | 定义工作台、通用子任务与业务 Skill 的职责。 |
   | 架构与配置 | `docs/system/architecture.md`、`docs/system/configuration.md`、`docs/system/directory-structure.md`、`docs/system/testing.md` | 更新宿主职责、业务身份读取、文件入口和测试说明。 |
   | 用户与领域说明 | `README.md`、`CONTEXT.md`、`docs/user/install-update.md` | 介绍工作台入口和保留的 Skills。 |

2. 表中未写目录的测试文件位于 `tests/production/`；`installed-presets.test.mjs` 位于 `tests/unit/`。Desktop 夹具文件位于 `tests/desktop/fixtures/`。
3. 历史发布说明、研究记录和验收记录保留当时事实。当前运行配置、开发规范和用户说明清除对退役资源的依赖。

### 5.8. 实施步骤与阶段通过条件

#### 5.8.1. 核对实施起点

1. 实施者在独立 worktree 中核对第 3.1 节基线。
2. 实施者按 R1 至 R11 建立“实现—调用方—测试—夹具—配置—文档”清单。
3. 实施者运行受影响用例，记录删除前的测试结果。

#### 5.8.2. 先删除实现

1. 实施者删除 R1 至 R11 指定的实现和运行引用。
2. 实施者保留现有测试、断言、mock、快照和测试夹具。
3. 此阶段不得加入替代实现或调整测试预期。

#### 5.8.3. 运行现有测试

1. 实施者运行第 5.7 节涉及的定向测试及 `pnpm typecheck`。
2. 实施者保存命令、退出码、失败用例和错误。
3. 文件导入失败时，实施者分别运行其余可收集的测试文件。
4. 实施者记录未执行用例，继续核对其消费者。

#### 5.8.4. 分类删除后的失败

1. 实施者按下表为每项失败记录类别。与删除对象有关的失败同时记录对应 R 编号。

   | 类别 | 处理要求 |
   | --- | --- |
   | 退役实现专用断言 | 标记待删除的测试及专用夹具。 |
   | 保留业务依赖了退役实现 | 保留业务断言，将依赖缺口列入后续接入任务。 |
   | 删除前已有失败或环境失败 | 记录删除前后的测试结果、已确认原因及其证据；原因尚未确认时，记录待查问题。 |

#### 5.8.5. 再清理测试与夹具

1. 实施者按第 5.7 节删除专用测试、mock、快照、夹具、评估输入和测试配置。
2. 混合文件仅删除退役用例与专用分支。共享夹具保留仍有消费者的内容。
3. 不得用跳过测试或放宽业务断言代替修复。

#### 5.8.6. 确认删除范围

1. 实施者再次运行受影响的保留测试。
2. 实施者逐项核对 R1 至 R11 的源码、构建输入、运行清单及测试引用。
3. 专用测试与夹具清理完成、全部失败均已归类后，实施者才进入后续实施。
4. 保留业务的接入缺口继续作为失败用例。

#### 5.8.7. 接入官方能力

1. 实施者采用测试驱动开发（TDD），执行第 5.2、5.3 和 5.5 节。
2. 实施者先补齐官方工具、目录和业务身份的失败用例，再接入实现并运行定向测试。
3. 官方 API 缺口必须记录并交由用户决定；不得恢复已删除的通用包装。

#### 5.8.8. 完成文档与独立审查

1. 实施者更新第 5.7 节文档。
2. 实施者派发独立代码审查与独立语义审计。
3. 语义审计员使用干净上下文，只接收一个目标文件和审计规则。

#### 5.8.9. 完成验收并交付

1. 验收者执行第 7 节，真实模型调用按 D2 执行。
2. 全部候选文件完成后，实施者运行 `pnpm quality` 和 `git diff --check`。
3. `quality` 包含官方 Desktop 验收。最终门禁后，实施者保持候选树不变。
4. 实施者交付候选变更和证据索引。

## 6. 方案待决策项清单

1. 用户在下表规定的时机决定历史会话的处置方式。

   | 编号 | 待决策事项 | 推荐方案及影响 | 决策时机 |
   | --- | --- | --- | --- |
   | D1 | 6 个退役预设对应的历史会话处置。 | 宜直接退役：保留历史日志、任务文件、Run 和媒体；升级前结束使用退役预设的活动任务。退役后，引用这些 ID 的会话无法按原预设恢复。需要继续的业务可在工作台新会话中读取原产物。若要求原身份续派，需另行设计历史迁移。 | 生产切换前。 |

## 7. 计划验收清单

### 7.1. 自动化与官方 Desktop

1. 验收者逐项核对下表条件，并按第 7.2 节保存证据。

   | 编号 | 验收项 | 通过条件 |
   | --- | --- | --- |
   | A1 | 注册与安装包 | 本插件仅注册第 2 节第 1 项规定的工作台预设，名称、ID 和排序均符合该项要求。官方内置预设保留；包资源与运行清单一致。 |
   | A2 | 官方首派 | 主 Agent 调用官方 `subagent`，宿主接纳后立即返回子会话 ID。模型与工作台组合继承符合第 5.3 节；返回结构符合官方合同。 |
   | A3 | 官方续派、中断与通知 | 正常结束、补充输入及 `interrupt_agent` 中断后，均能用 `send_message` 向原子会话续派。`list_agents` 可找回该子会话；父 Agent 取得宿主结束通知并读取任务结果。 |
   | A4 | 目录与业务归属 | 父会话切换当前目录后派发子任务，子会话的初始执行目录与父会话派发时的当前目录一致；父子会话头的 `cwd` 相同。子会话未加入 Workspace 分组列表时，受管 CLI 和 Run 查询仍取得正确业务归属。切换当前目录后，业务归属符合第 5.5 节。 |
   | A5 | 默认 Skill 发现 | 验收者在 checkout 外的 Workspace 中分别提供工作区目录、用户目录和源码软链接。主会话和子会话均能发现并读取每种来源的保留 Skills；工作区同名 Skill 优先。候选 Skill 安装目录不再提供迭代 Skill。 |
   | A6 | 退役资源与配置 | R1 至 R11 的删除内容退出源码、构建输入及运行清单。模型可见工具、说明和当前文档清除专用派发及项目回执要求。配置 schema 接受第 5.2 节结构，消费者测试通过。 |
   | A7 | 保留业务 | 受控 MCP、生成、Run 查询、媒体访问和图片读取通过。验收者分别验证当前会话、本项目后代会话、无关会话及其他 Workspace 的结果访问，并验证分支诊断和取消请求；结果符合第 5.5 节第 4 项及第 3.2 节引用的子会话目录查询合同。 |
   | A8 | 冷恢复 | 验收者关闭并重新启动隔离环境中的官方 Desktop，恢复工作台主会话和子会话。引用退役预设 ID 的会话因预设缺失而无法冷恢复；验收者仍能读取这些会话的历史日志和业务产物。 |
   | A9 | 删除顺序与测试清理 | 证据按第 5.8 节的执行顺序保存。每项删除对应 R 编号；记录后续接入开始前的代码与测试清理结果。 |
   | A10 | 官方作用域与生命周期 | 主会话和子会话通过官方预设组合取得继承工具、后注册工具及使用说明。深度限制由宿主执行。插件加载失败、卸载和重载由官方机制释放工具。提示词保留第 5.5 节规定的宿主内容。 |

### 7.2. 真实模型与证据

1. 验收者按第 9 节 D2 授权，在隔离 Workspace 中通过官方 Desktop 使用第 9 节 D2 指定的模型，通过官方 `subagent` 派发一个读取业务 Skill 和指定参考的子任务。子 Agent 写入指定结果文件，父 Agent 收到通知后读取文件。验收者再提供补充要求，核对官方 `send_message` 对原子会话的续派行为。本次真实模型用例提交的 ComfyUI Run 数量为 0。
2. 验收记录保存到 `docs/verification/comfyui-workbench-only/`。索引对应 A1 至 A10 及真实模型用例，记录候选提交、应用版本、插件版本、Workspace、模型和通过状态。
3. 证据记录实际预设 ID、工具列表、Skill 来源目录和参考读取结果。会话轨迹覆盖父子消息、工具调用与返回、结束通知及结果文件。验收者按[官方导出流程](../agents/worktree-development.md#agent-调用轨迹)取得轨迹；官方记录缺失的项目标为证据不足。
4. 验收者按[官方 worktree 规范](../agents/worktree-development.md)停止测试实例，并保存本轮进程退出与端口释放结果。

## 8. 非本次目标

1. DSH 宿主升级、依赖升级，以及生成算法、图片读取和目录查询的业务重构。
2. 创建迭代功能的替代 Skill、角色参考或专用派发接口。
3. 修改其他业务 Skills 的执行流程、脚本或 Prompt Builder 算法。
4. 自动迁移、删除生产历史会话，或修改用户默认预设、默认模型。
5. 清理第 3.1 节已确认软链接以外的用户 Skill 安装。

## 9. 已获得的授权与待授权操作

1. 用户已明确取消迭代预设及对应的 `comfyui-iterate-generation` Skill，保留工作台能力。
2. 用户已要求清理预设及其调用链中重复实现宿主能力的代码。用户指定的执行顺序见第 5.8 节。
3. 用户已通过 `implement` 授权按本计划实施、验收与提交改动。
4. D2：用户已授权第 7.2 节的真实模型验收，使用 OpenRouter 的 `openrouter/free` 免费路由模型。
5. 生产历史数据处置及依赖安装仍待授权。
6. 推送、合并、发布和生产切换仍按仓库发布规范分别取得授权。
