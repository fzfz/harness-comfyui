---
文档用途: 定义 ComfyUI 项目预设、项目 Skill 与受管 CLI 参考的开发约束。
读取时机: 创建或修改项目预设、项目 Skill 或受管 CLI 参考前。
---

# ComfyUI 项目预设与 Skill 开发规范

## 适用范围

1. Agent 创建或修改项目 Preset、本仓库 `.agents/skills/<skill-name>/` 中的项目 Skill，或 Skill 自带的 CLI 使用参考文档时，必须遵守本规范。项目 Preset 的身份与入口见[系统架构](../system/architecture.md#项目-presetskills-与目录访问)。

2. Agent 修改现有项目 Skill 目录中的脚本或程序前，必须获得用户明确授权。

## 插件包资源与预设身份

1. `config/product-agent.json` 保存工作台 Preset ID 与资源根目录。开发者修改配置时，必须同步核对 `config/product-agent-schema.mjs` 的约束。

2. `agent-presets/presets.cordis.yml` 只注册工作台 Preset，并通过包内相对路径加载其 `agent.cordis.yml`。工作台必须通过 `agent-presets/shared/agent.cordis.yml` 加载公共组合，并在自身配置中声明 persona 与官方子 Agent 工具。

3. 插件安装包必须包含 `agent-presets/`。

4. 开发者修改预设注册时必须保持以下身份：

   1. 工作台保持 `config/product-agent.json` 声明的 ID，以及 `agent-presets/presets.cordis.yml` 声明的名称、排序与源码入口；
   2. `agent-presets/presets.cordis.yml` 只注册一次工作台，并保留官方内置 Preset；
   3. 官方全局默认 Preset 和默认对话模型由用户选择。

## 项目 Skill 来源与作用域

1. 当前 checkout 的 `.agents/skills/<skill-name>/` 是项目 Skill 唯一源码目录。开发者在该目录创建或修改 Skill。

2. 项目 Preset 的 Skill 服务与目录来源见[系统架构](../system/architecture.md#项目-presetskills-与目录访问)。

## 工具作用域与注册

1. 工作台使用宿主默认的工具继承与注册行为。
2. Host 业务 Tool 的注册与生命周期遵循 [ADR 0016](../adr/0016-official-desktop-plugin-delivery.md#插件与宿主边界)。各业务工具维护自身参数及输出定义。

## 系统提示词

1. 工作台必须保留宿主默认组装的身份、来源、Web 环境、交付文件说明和工具说明。
2. 工作台 persona 只定义 ComfyUI 业务用途、Skill 选用和结果交付要求，主会话与子会话共用。

## 官方子 Agent 与业务身份

1. 工作台必须使用官方子 Agent 工具处理派发、续派、中断和查询。调用合同见[系统架构](../system/architecture.md#项目-presetskills-与目录访问)，组件字段见[配置规范](../system/configuration.md#子-agent-派发配置)。
2. 开发者修改业务身份读取时，必须遵循[Host Node 与受管 CLI 身份](../system/architecture.md#host-node-与受管-cli-身份)。Workspace 分组状态不得作为业务调用的前置条件。
3. 开发者修改后代结果访问时，必须保留访问范围、分支诊断与取消行为。具体合同见[Client 工作台、结果与媒体访问](../system/architecture.md#client-工作台结果与媒体访问)。

## 项目 Skill 的 CLI 使用参考文档

1. 通过 shell 调用受管 CLI 的 Skill 必须在自身 `references/` 目录保存 CLI 使用参考文档，并在 `SKILL.md` 中使用 Skill 目录内的相对路径引用，例如 `references/generation-cli.md`。一个 Skill 调用多个职责不同的 CLI 时，可以为每个 CLI 建立一份文档。每份文档必须提供本命令的业务输入、结果 JSON 和处理规则，并且只引用该 Skill 目录内可访问的资源。公共传输与文件错误规则由受管 CLI 的 `--help` 定义；开发者必须在参考文档中要求 Skill 执行者在首次调用前读取对应帮助。

2. 新建或修改 CLI 使用参考文档时，开发者必须定义下表内容。开发者可以合并或细分章节，但章节标题必须准确概括正文。

   | 内容 | 必须定义的信息 |
   | --- | --- |
   | CLI 用途 | 每条命令完成的任务。 |
   | 调用入口 | Skill 执行者可直接调用的完整可执行入口。 |
   | 调用命令和条件 | 每个 command 与 subcommand 的条件、前提和顺序。只有一个命令时，调用入口须给出完整命令，其他章节引用该入口。 |
   | 参数与标准输入 | 每个 CLI 参数和 stdin JSON 属性的名称、类型、必填条件、允许值、数量限制、缺省语义和字段约束。 |
   | 输入值的来源 | Workflow 模板、生成模型、LoRA、ComfyUI 实例、Generation Run ID 和其他业务值的输入或查询来源。 |
   | 结果文件中的 JSON | 业务 JSON 字段含义；异步命令须说明业务成功表示请求已接受还是任务已完成。 |
   | 错误处理与重试 | 每个错误码或错误类别的报告内容、输入修正方法、重试条件和部分成功结果处理方式。 |
   | 调用次数与结果复用 | 每个对象的调用次数、多对象调用顺序和成功结果复用方式；创建或修改记录的命令还须定义持久化结果及失败后重试对前次结果的影响。 |

3. CLI 使用参考文档必须使用实际命令、参数和输出字段。完整示例只在能说明正文未展示的 stdin 接法或多命令组合时保留。示例使用无需认证的输入，或明确标记为虚构的凭据占位符。

## 项目 Skill 的 MCP 查询步骤

1. Skill 编写者必须在查询步骤中明确要取得的作品、角色、Prompt 词条、底模、生成模型、LoRA、画师风格、画师串、Workflow 模板或 ComfyUI 实例，并指定通过 NoobAI MCP 获取。工具参数、返回结构、分页和调用错误处理以运行时工具声明为准，不得复制到 Skill 参考文件。

## SKILL.md 的参考文档读取条件

1. 用户请求符合项目 Skill frontmatter `description` 时，项目 Preset 的 Agent 必须完整读取对应 `SKILL.md`。任务需要受管 CLI 时，Agent 必须先完整读取 `SKILL.md` 指定的 CLI 使用参考文档，再通过官方前台 shell Tool Call 执行其中定义的受管 CLI 命令。

2. 使用受管 CLI 的 `SKILL.md` 必须在首次需要该 CLI 的任务步骤中写出准确的参考文档相对路径，并要求执行者遵守本节第 1 项的读取顺序。命令字段、错误码和重试规则集中定义在 CLI 使用参考文档中。

3. Skill 执行者执行 MCP 查询步骤时，只读取当前任务需要的 Skill 资料与可用工具声明。

## 开发与验收

### 自动化与黑盒检查

1. 开发者修改项目 Preset、注册组件或 Host Tool scope 时，必须运行对应的正常、异常和边界测试。测试选择与通过条件见[测试规范](../system/testing.md)。
2. 新增或修改项目 Skill 或 CLI 参考文档时，开发者必须按[测试规范](../system/testing.md)验证 Skill 的目录发现与读取，并按[官方应用与真实模型验收](#官方应用与真实模型验收)完成真实模型验收。

### 官方应用与真实模型验收

1. 修改工作台组合或宿主接入后，开发者必须按获准任务的真实模型验收矩阵验证对应行为。验证范围包括工具范围、系统提示词、Skill 读取、受管 CLI、子 Agent 和业务身份。
2. 开发者先按[测试规范](../system/testing.md)运行 `pnpm test:desktop`，再通过独立 worktree 的 development probe 完成真实模型验收。启动、状态检查和停止命令见[worktree 开发规范](worktree-development.md)。Agent 必须在官方应用中显式选择工作台 Preset。

3. 开发者必须在当前获准任务指定的 `docs/verification/` 子目录保存验收记录。记录包含以下内容。

   1. 应用与插件版本、被测 Preset、模型和 Workspace。
   2. Skill 和参考文档路径、用户请求。
   3. Tool 与 shell Tool Call、CLI stdin、退出码、stdout 和 stderr。
   4. 官方 `subagent` 返回的子会话 ID、宿主结束通知及业务结果。
   5. ComfyUI Run 验收使用的完整 Run ID、目标实例、Workflow 与资源 ID。
   6. ComfyUI Run 的实际 Seed 和参数、Actual/API Workflow、状态变化、媒体路径及重启后查询结果。

### 语义审查

1. 修改本规范、项目 `SKILL.md` 或 CLI 使用参考文档后，开发者必须派发独立语义 Reviewer。审计输入仅包含一个目标文件、本节审计标准，以及仓库 `AGENTS.md` 的“markdown和文字内容规范”；审阅 `SKILL.md` 或 CLI 使用参考文档时，还须提供“Skill开发规范”。Reviewer 独立阅读目标文件，并逐项判断语义质量。

2. Reviewer 必须按第 1 项指定的仓库规范逐句审阅，并遵守以下补充要求：

   1. 审阅 `SKILL.md` 与 CLI 使用参考文档时，Reviewer 保留执行者完成任务需要的规范、步骤、资源、工具调用方法及输入输出字段用途；将开发者要求、宿主内部流程、工具实现细节、升级过程或逻辑、旧版本描述列为删除意见。限制条款须写明适用条件和受限动作。
   2. Reviewer 使用含源文件行号的验收清单逐项标记“通过”或“需修改”，并记录独立理解的含义和判定理由；每项“需修改”均写明位置、问题、具体改法以及可直接替换的文本，或注明“删除且不替换”。

3. 开发者必须在语义审阅前依据源码与测试核实 CLI 命令、参数和输出字段。程序检查只处理具有确定性规则的结构化数据；语义理解、语义测试和语义验收由 Reviewer 阅读和判断完成。
