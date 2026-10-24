---
文档用途: 定义 ComfyUI 项目预设、项目 Skill 与受管 CLI 参考的开发约束。
读取时机: 创建或修改项目预设、项目 Skill、全局 Skill 链接或受管 CLI 参考前。
---

# ComfyUI 项目预设与 Skill 开发规范

## 适用范围

1. Agent 创建或修改项目 Preset、本仓库 `.agents/skills/<skill-name>/` 中的项目 Skill，或 Skill 自带的 CLI 使用参考文档时，必须遵守本规范。项目 Preset 的身份与入口见[系统架构](../system/architecture.md#项目-presetskills-与目录访问)。

2. Agent 修改现有项目 Skill 目录中的脚本或程序前，必须获得用户明确授权。

## 插件包资源与预设身份

1. `config/product-agent.json` 保存受管 Preset ID 与资源根目录。`preset.id` 指定工作台产品 Preset，`preset.additionalManagedPresetIds` 列出迭代产品 Preset 和 5 个角色 Preset。

2. `agent-presets/presets.cordis.yml` 在插件 bundle 中注册 7 个项目 Preset，并通过包内相对路径加载各自的 `agent.cordis.yml`。每个 Preset 必须通过 `agent-presets/shared/agent.cordis.yml` 加载公共组合，并在自身配置中声明 persona 与自身工具。

3. 插件安装包包含 `agent-presets/` 和 `.agents/skills/`。插件构建校验 Preset 配置，打包流程校验资源清单和包内引用。

4. 开发者修改预设注册时必须保持以下身份：

   1. 产品 Preset 保持系统架构所列的 ID、名称与源码入口；
   2. 每个角色使用独立的 `agentPreset`；
   3. registry 中每个项目 Preset 只注册一次，并保留官方内置 Preset；
   4. 官方全局默认 Preset 和默认对话模型由用户选择。

## 项目 Skill 来源与作用域

1. 当前 checkout 的 `.agents/skills/<skill-name>/` 是项目 Skill 唯一源码目录。开发者在该目录创建或修改 Skill，并使用该目录中的文件构建插件包。

2. `agent-presets/presets.cordis.yml` 必须为每个项目 Preset 隔离 Skill service。包内 Skill provider 的加载入口和作用域见[系统架构](../system/architecture.md#项目-presetskills-与目录访问)。

3. 项目 Preset 必须按安装包内相对路径读取项目 Skills。官方内置 Preset 与其他 Preset 保留官方的 Workspace 和用户级 Skill 来源。

## Tool schema 可见性

1. 本文将 Preset 加载、由模型直接调用或经 `run_code` 调用的 Tool 称为末端 Tool。
2. 全部项目 Preset 必须通过共享组合加载 [project-tool-visibility.mjs](../../agent-presets/project-tool-visibility.mjs)，并使用 `local-only` 模式。末端 Tool schema 只能来自当前 Preset 加载的 Tool；PTC 的 `run_code` 只能调用当前 Preset scope 已可见的末端 Tool。
3. 两个产品 Preset 使用 [project-subagent-control.mjs](../../agent-presets/project-subagent-control.mjs) 注册 `interrupt_agent`；父 Agent 通过各自的派发工具继续子任务。
4. Host 目录工具由 [catalog-tool.ts](../../src/host/catalog/catalog-tool.ts) 注册；生成、Run 查询、媒体和图片读取工具分别由 [generation-tool.ts](../../src/host/generation/generation-tool.ts)、[generation-run-input-tool.ts](../../src/host/generation/generation-run-input-tool.ts)、[generation-media-tool.ts](../../src/host/generation/generation-media-tool.ts) 和 [image-reader-tool.ts](../../src/host/image-reader/image-reader-tool.ts) 注册。
5. 新增 Host 项目 Tool schema 时，项目 Preset 必须遵守本节第 2 项的作用域；官方 `standard` Preset 保留 Host 项目 Tool 的可见性。

## 系统提示词段落可见性

1. 全部项目 Preset 必须通过共享组合加载 [project-system-prompt-visibility.mjs](../../agent-presets/project-system-prompt-visibility.mjs)。共享组合的 `hiddenSectionNames` 声明隐藏的段落。

2. 该组件必须保留 `deployment:persona`、当前可用 Tool 的使用说明及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。官方 `standard`、`minimal`、`cordis` 和其他 Agent Preset 保留各自现有的系统提示词 assembly。

## 工作台预设的子 Agent 续派

1. `ComfyUI工作台预设` 的 `subagent_task` 参数、消息模板、模型继承和角色 Preset 引用定义在 [agent.cordis.yml](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml) 的 `task-agent` 配置中。
2. 子 Agent 的职责与工具组合由工作台任务角色 Preset 定义。派发字段见[配置规范](../system/configuration.md#子-agent-派发配置)。

## 迭代预设的四个子 Agent

1. [迭代产品 Preset](../../agent-presets/harness-comfyui-iteration/agent.cordis.yml) 定义四种派发工具；各角色 Preset 定义对应职责与工具组合。角色执行、续派和交接按 [comfyui-iterate-generation](../../.agents/skills/comfyui-iterate-generation/SKILL.md) 的“派发任务并接收结果文件”执行。

## 全部项目 Preset 的 Workspace 关联

1. 全部项目 Preset 通过共享组合加载 [project-subagent-workspace.mjs](../../agent-presets/project-subagent-workspace.mjs)。该组件必须在子 Session 首个 Agent step 前完成 Workspace 附加；后续 step 复用已完成的附加结果。
2. Workspace 附加失败时，该组件必须停止当前 Agent step，并报告子 Session ID、失败原因、涉及的父 Session、路径或 Workspace，以及需要修正的具体项。附加条件和执行入口见第 1 项组件。

## 派发工具的接纳与恢复

1. 首派、续派和结束通知的合同见[系统架构](../system/architecture.md#项目-presetskills-与目录访问)。开发者必须保留接纳后立即返回的行为；不得用 `startActivation()` 的 `childId` 参数恢复已有会话。
2. [project-iteration-dispatch.mjs](../../agent-presets/project-iteration-dispatch.mjs) 通过工具附加上下文保存接纳身份。父 Agent 必须取得对应结束通知，并按所用 Skill 读取结果文件，再派发依赖该结果的任务。
3. 父 Agent 中断后，使用 `list_agents` 找回子会话，再通过原派发工具续派。显式停止子任务时，使用 `interrupt_agent`。

## 项目 Skill 的 CLI 使用参考文档

1. 通过 shell 调用项目 CLI 的 Skill 必须在自身 `references/` 目录保存 CLI 使用参考文档，并在 `SKILL.md` 中使用 Skill 目录内的相对路径引用，例如 `references/generation-cli.md`。一个 Skill 调用多个职责不同的 CLI 时，可以为每个 CLI 建立一份文档。每份文档必须提供本命令的业务输入、结果 JSON 和处理规则，并且只引用该 Skill 目录内可访问的资源。公共传输与文件错误规则由受管 CLI 的 `--help` 定义；参考文档要求 Skill 执行者在首次调用前读取对应帮助。

2. 新建或修改 CLI 使用参考文档时，开发者必须定义下表内容。开发者可以合并或细分章节，但章节标题必须准确概括正文。

   | 内容 | 必须定义的信息 |
   | --- | --- |
   | CLI 用途 | 每条命令完成的任务。 |
   | 调用入口 | Skill 执行者可直接调用的完整可执行入口。 |
   | 调用命令和条件 | 每个 command 与 subcommand 的条件、前提和顺序。只有一个命令时，调用入口须给出完整命令，其他章节引用该入口。 |
   | 参数与标准输入 | 每个 CLI 参数和 stdin JSON 属性的名称、类型、必填条件、允许值、数量限制、缺省语义和字段约束。 |
   | 输入值的来源 | Workflow 模板、生成模型、LoRA、ComfyUI 实例、Generation Run ID 和其他业务值的输入或查询来源。 |
   | 结果文件中的 JSON 与业务错误 | 业务 JSON 字段含义、业务错误和处理动作；异步命令须说明业务成功表示请求已接受还是任务已完成。 |
   | 错误处理与重试 | 每个错误码或错误类别的报告内容、输入修正方法、重试条件和部分成功结果处理方式。 |
   | 调用次数与结果复用 | 每个对象的调用次数、多对象调用顺序、成功结果复用和重试条件；创建或修改记录的命令还须定义持久化结果及失败后重试对前次结果的影响。 |

3. CLI 使用参考文档必须使用实际命令、参数和输出字段。完整示例只在能说明正文未展示的 stdin 接法或多命令组合时保留。示例使用无需认证的输入，或明确标记为虚构的凭据占位符。

## 项目 Skill 的 MCP 查询步骤

1. Skill 编写者必须在查询步骤中明确要取得的作品、角色、Prompt 词条、底模、生成模型、LoRA、画师风格、画师串、Workflow 模板或 ComfyUI 实例，并指定通过 NoobAI MCP 获取。工具参数、返回结构、分页和调用错误处理以运行时工具声明为准，不得复制到 Skill 参考文件。

## SKILL.md 的参考文档读取条件

1. 用户请求符合项目 Skill frontmatter `description` 时，项目 Preset 的 Agent 必须完整读取对应 `SKILL.md`。任务需要项目 managed CLI 时，Agent 必须先完整读取 `SKILL.md` 指定的 CLI 使用参考文档，再通过官方前台 shell Tool Call 执行其中定义的项目 CLI 命令。

2. 使用项目 CLI 的 `SKILL.md` 必须在首次需要该 CLI 的任务步骤中写出准确的参考文档相对路径，并要求执行者在首次调用前完整读取。命令字段、错误码和重试规则集中定义在 CLI 使用参考文档中。

3. Skill 执行者执行 MCP 查询步骤时，只读取当前任务需要的 Skill 资料与可用工具声明。

## 开发与验收

### 自动化与黑盒检查

1. 开发者修改项目 Preset、注册组件或 Host Tool scope 时，必须运行对应的正常、异常和边界测试。测试选择与通过条件见[测试规范](../system/testing.md)。
2. 新增或修改项目 Skill 或 CLI 参考文档时，开发者必须按[测试规范的“Preset 与子 Agent 合同”](../system/testing.md#preset-与子-agent-合同)验证包内资源和 Skill 作用域，并按[官方应用与真实模型验收](#官方应用与真实模型验收)完成真实模型验收。

### 官方应用与真实模型验收

1. 项目 Preset、Tool roster、提示词可见性、Skill 读取、managed CLI 调用、子 Agent 派发或 Workspace 登记行为发生变化时，开发者必须按当前获准任务的真实模型验收矩阵验证对应行为。开发者先用 `pnpm test:desktop` 验证候选包的构建、安装、Live 和生命周期，再通过独立 worktree 的 development probe 完成真实模型验收。启动、状态检查和停止命令见[worktree 开发规范](worktree-development.md)。Agent 必须在官方应用中显式选择被测产品 Preset。

2. 开发者必须在当前获准任务指定的 `docs/verification/` 子目录保存验收记录。记录包含应用与插件版本、被测 Preset、模型、Workspace、Skill 和参考文档路径、用户请求、Tool 与 shell Tool Call、CLI stdin、退出码、stdout、stderr、接纳身份、结束通知及业务结果。正式 ComfyUI Run 验收还必须记录完整 Run ID、目标实例、Workflow 与资源 ID、实际 Seed 和参数、Actual/API Workflow、状态变化、媒体路径及应用重启后的查询结果。

### 语义审查

1. 修改本规范、项目 `SKILL.md` 或 CLI 使用参考文档后，开发者必须派发独立语义 Reviewer。Reviewer 的审计输入只包含本次审阅的一个目标文件、仓库“内容写作”规则和本节审计标准；审阅 `SKILL.md` 或 CLI 使用参考文档时，输入还包含“Skill 使用与开发”中的 Skill 文档规则。Reviewer 独立阅读目标文件，并逐项判断语义质量。

2. Reviewer 必须逐句核对以下内容：

   1. 句子使用通顺、可朗读的表达，并写明执行主体、动作、对象和结果；常用词与专业术语采用现有名称，任务专用名称先定义再使用；
   2. 每项规则写明具体动作、对象所属文件或模块及执行条件；每章正文服务于该章用途，每项要求只完整定义一次；
   3. UI 文案和后端接口错误文案写明实际情况和用户可采取的操作；
   4. 对本规范，Reviewer 逐句并在需要时逐分句执行删除检查。删除后仍能理解要求、完成动作和判断结果的文字列为删除意见；删除会妨碍开发者理解、实施或验收的内容保留；
   5. 对 `SKILL.md` 与 CLI 使用参考文档，Reviewer 逐句并在需要时逐分句执行删除检查。保留执行者完成任务需要的规范、步骤、资源、工具调用方法及输入输出字段用途；将开发者要求、宿主内部流程、工具实现细节、升级过程或逻辑、旧版本描述列为删除意见。限制条款须写明适用条件和受限动作。
   6. Reviewer 使用含源文件行号的验收清单逐项标记“通过”或“需修改”，并记录独立理解的含义和判定理由；每项“需修改”均写明位置、问题、具体改法以及可直接替换的文本，或注明“删除且不替换”。

3. 开发者必须在语义审阅前依据源码与测试核实 CLI 命令、参数和输出字段。程序检查只处理具有确定性规则的结构化数据；语义理解、语义测试和语义验收由 Reviewer 阅读和判断完成。
