---
文档用途: 定义 ComfyUI 项目预设、项目 Skill 与 CLI 帮助的内容职责和开发约束。
读取时机: 创建或修改项目预设、项目 Skill 或 CLI 帮助前。
---

# ComfyUI 项目预设与 Skill 开发规范

## 适用范围

1. Agent 创建或修改项目 Preset、[项目 Skill 源码目录](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills>)中的 Skill 或受管 CLI 帮助时，必须遵守本规范。项目 Preset 的身份与入口见[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#项目-presetskills-与目录访问>)。

2. Agent 修改现有项目 Skill 目录中的脚本或程序前，必须获得用户明确授权。

## 插件包资源与预设身份

1. [config/product-agent.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/product-agent.json>)保存工作台 Preset ID 与资源根目录。开发者修改配置时，必须同步核对 [config/product-agent-schema.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/product-agent-schema.mjs>) 的约束。

2. 插件的 [Preset registry](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/presets.cordis.yml>)必须只注册工作台 Preset。开发者修改插件预设注册时，必须保留宿主提供的官方内置 Preset。工作台通过包内相对路径加载[工作台配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml>)与[共享组合](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/shared/agent.cordis.yml>)。

3. 插件安装包必须交付[包清单](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/plugin-package.json>)声明的预设资源及业务 Skill 正文、参考文档和脚本。

4. 开发者修改预设注册时，必须使用产品配置声明的工作台 ID，并在 Preset registry 中声明工作台名称、排序与源码入口。

5. 官方全局默认 Preset 和默认对话模型由用户选择。

## 项目 Skill 来源与作用域

1. [项目 Skill 源码目录](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills>)是业务 Skill 的唯一源码入口。开发者必须在该目录创建或修改业务 Skill。

2. 开发者修改 Skill 来源时，必须遵循[工作台装配配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#工作台装配配置>)。服务隔离与读取职责见[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#项目-presetskills-与目录访问>)。

## 工具作用域与注册

1. 工作台必须通过 NoobAI MCP 查询目录，通过受管 CLI 执行生成任务、查询 Run、访问媒体和读取图片。CLI 与 Remote 的业务服务边界遵循 [ADR 0016](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/adr/0016-official-desktop-plugin-delivery.md#插件与宿主边界>)。
2. 开发者修改工具限制时，必须使用宿主原生工具服务，并按[测试规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md#preset-与子-agent-合同>)验证声明、实际调用与释放。配置入口见[工作台装配配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#工作台装配配置>)。
3. 宿主升级或插件增减后，开发者必须逐项核对实际工具清单与业务用途。工具清单或业务用途发生变化时，开发者必须据此更新工具限制和验收预期。

## 系统提示词

1. 工作台 persona 保存工作台身份、跨任务授权、子任务协作和交付约束。Skill 摘要只描述任务匹配条件；Skill 正文负责业务步骤。开发者不得在 persona 中复写 Skill 加载规则与 CLI 操作步骤。
2. 主会话与子会话必须共用工作台组合。运行时上下文由宿主管理，字段与覆盖项见[工作台装配配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#工作台装配配置>)。
3. 共享组合必须加载官方 `@deepseek-ai/dsh-agent-instructions` 组件，使主会话与子会话读取当前工作区适用的 `AGENTS.md`。指令发现、作用域和更新行为沿用宿主组件；不得将插件源码仓库的开发规范作为固定内容注入用户工作区。
4. 工作台必须保留官方 `skill` 工具的目录与正文追加路径。persona 必须在会话开始前确定；业务步骤推进时，不得改写既有 persona 或消息前缀。

## 官方子 Agent 与业务身份

1. 工作台必须使用官方子 Agent 工具处理派发、续派、中断和查询。调用合同见[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#项目-presetskills-与目录访问>)，组件字段见[配置规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#子-agent-派发配置>)。
2. 开发者修改业务身份读取时，必须遵循[Host Node 与受管 CLI 身份](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#host-node-与受管-cli-身份>)。Workspace 分组状态不得作为业务调用的前置条件。
3. 开发者修改后代结果访问时，必须保留访问范围、分支诊断与取消行为。具体合同见[Client 工作台、结果与媒体访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#client-工作台结果与媒体访问>)。

## CLI 帮助与 Skill 的内容职责

1. CLI 帮助是调用合同面向执行者的唯一说明入口。调用合同包括命令语法、输入输出结构、副作用与重试条件。
2. 根帮助提供命令分组、公共文件协议和下级入口。分组帮助提供命令用途与选择条件。命令帮助提供当前操作的调用合同，并保留根帮助入口。每层只加载本层内容；公共说明只在根帮助维护。
3. 命令帮助必须说明参数、stdin 和文件输入的字段类型、必填条件、默认值与限制。结果说明必须包含嵌套结构、可空条件与逐项错误。异步命令必须区分接纳与完成。
4. 命令帮助必须说明副作用、状态、重放与重做条件，并给出错误后的可执行操作。帮助必须提供典型输入输出示例及动态约束的查询入口。具体 Workflow 参数通过参数查询命令取得。
5. 帮助渲染器与生产校验必须复用同一结构化定义，包括字段类型、枚举和数量限制。运行时可调整的限制必须来自配置。帮助配置只保存用途、选择条件和解释文字。
6. Skill 正文保存任务目标、业务判断、输入值来源、步骤顺序和帮助入口。Skill 可引用字段名说明输入来源，不得复写字段定义、调用合同或技术重试规则。
7. Skill 参考文件只保存正文之外的分支业务内容。开发者必须为每份参考文件写明读取条件，并使用 Skill 内相对路径。参考文件不得复制 CLI 调用合同。参考文件没有业务用途时，开发者必须删除文件及读取入口。

## 项目 Skill 的 MCP 查询步骤

1. Skill 编写者必须明确查询对象，并指定通过 NoobAI MCP 获取。
2. 目录对象包括作品、角色、Prompt 词条、底模、生成模型和 LoRA。画风、画师串、Workflow 模板和 ComfyUI 实例也由 MCP 查询。
3. 工具参数、返回结构、分页和调用错误处理以运行时工具声明为准。开发者不得将这些接口定义复制到 Skill 参考文件。

## Skill、参考文档与帮助的读取条件

1. 任务匹配时，执行者通过官方 `skill` 工具读取正文。正文中的每个参考入口必须说明当前步骤何时需要该资料。
2. 任务需要受管 CLI 时，执行者首次使用前读取根帮助，再读取当前命令帮助。Skill 必须提供可执行的根帮助入口。执行者通过官方前台 shell Tool Call 调用命令。
3. 同一会话中，执行者复用仍在上下文中的 Skill 与帮助。压缩后缺少操作依据时，执行者在对应操作前重新读取。
4. MCP 查询步骤只加载当前任务需要的业务资料。MCP 调用合同按“项目 Skill 的 MCP 查询步骤”读取。

## 开发与验收

### 自动化与黑盒检查

1. 开发者修改项目 Preset、注册组件或 Host Tool scope 时，必须运行对应的正常、异常和边界测试。测试选择与通过条件见[测试规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>)。
2. 开发者新增或修改项目 Skill、业务参考或 CLI 帮助时，必须按[测试规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>)验证 Skill 的目录发现与读取。开发者再按[官方应用与真实模型验收](<#官方应用与真实模型验收>)完成真实模型验收。

### 官方应用与真实模型验收

1. 修改工作台组合或宿主接入后，开发者必须按获准任务的真实模型验收矩阵验证对应行为。验证范围包括工具范围、系统提示词、Skill 读取、受管 CLI、子 Agent 和业务身份。
2. 开发者先按[测试规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>)运行 `pnpm test:desktop`，再通过独立 worktree 的 development probe 完成真实模型验收。启动、状态检查和停止命令见[worktree 开发规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/worktree-development.md>)。Agent 必须在官方应用中显式选择工作台 Preset。

3. 开发者必须在当前获准任务指定的 [docs/verification/](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification>) 子目录保存验收记录。记录包含以下内容。

   1. 应用与插件版本、被测 Preset、模型和 Workspace。
   2. Skill 和参考文档路径、用户请求。
   3. Tool 与 shell Tool Call、CLI stdin、退出码、stdout 和 stderr。
   4. 验收涉及子 Agent 时，记录官方 `subagent` 返回的子会话 ID、宿主结束通知及业务结果。
   5. 验收涉及 ComfyUI Run 时，记录完整 Run ID、目标实例、Workflow 与资源 ID、实际 Seed 和参数、Actual/API Workflow、状态变化、媒体路径及重启后查询结果。

### 语义审查

1. 修改本规范、项目 `SKILL.md`、业务参考或 CLI 帮助后，开发者必须派发独立语义 Reviewer。审计输入仅包含目标文件、本节审计标准，以及仓库 [AGENTS.md](</Volumes/4Tdisk/work/AI2/harness-comfyui/AGENTS.md>) 的文字规范。审阅 `SKILL.md` 或业务参考时，还须提供仓库的 Skill 开发规范。Reviewer 独立阅读目标文件，并逐项判断语义质量。

2. Reviewer 必须按第 1 项指定的仓库规范逐句审阅，并遵守以下补充要求：

   1. 审阅 `SKILL.md` 与业务参考时，Reviewer 保留执行者完成任务需要的内容。内容包括规范、步骤、资源、调用方法及输入输出字段用途。开发者要求、宿主内部流程、工具内部代码和升级描述列为删除意见。限制条款须写明适用条件和受限动作。
   2. Reviewer 使用含源文件行号的清单逐项标记“通过”或“需修改”。每项记录独立理解的含义和判定理由。“需修改”项必须给出位置、问题、改法及替换文本；需要删除时注明“删除且不替换”。

3. 开发者必须在语义审阅前依据源码与测试核实 CLI 命令、参数和输出字段。程序检查只处理具有确定性规则的结构化数据；语义理解、语义测试和语义验收由 Reviewer 阅读和判断完成。
