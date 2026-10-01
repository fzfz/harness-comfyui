# ComfyUI 产品预设与项目 Skill 开发规范

## 适用范围

Agent 创建或修改 `ComfyUI工作台预设`、`ComfyUI迭代预设`、本仓库 `.agents/skills/<skill-name>/` 中的项目 Skill，或 Skill 自带的 CLI 使用参考文档时，必须遵守本规范。

Agent 修改现有项目 Skill 目录中的脚本或程序前，必须获得用户明确授权。

## 插件包资源与预设身份

`agent-presets/harness-comfyui-cli-candidate/` 是 `ComfyUI工作台预设` 的唯一源码目录，`agent-presets/harness-comfyui-iteration/` 是 `ComfyUI迭代预设` 的唯一源码目录。`config/product-agent.json` 使用 `schemaVersion: 3`；`preset.id` 保存工作台预设兼容性内部 ID，`preset.additionalManagedPresetIds` 列出迭代预设 ID，`preset.sourceRootRelativePath` 指定 `agent-presets`。

`agent-presets/presets.cordis.yml` 在插件 bundle 中注册这两个项目预设，并通过安装包内的相对路径加载各自的 `agent.cordis.yml`。插件安装包同时包含 `agent-presets/` 和 `.agents/skills/`；插件构建先校验产品 Preset 的配置资源，打包流程再校验清单资源及安装包内引用。

插件注册两个可选项目 Preset；官方全局默认 Preset 和默认对话模型由用户选择并由官方应用管理。用户在官方会话界面选择项目 Preset。

开发者修改预设注册时必须保持以下身份：

- `preset.id` 为 `harness-comfyui-cli-candidate`，`preset.additionalManagedPresetIds` 包含 `harness-comfyui-iteration`；
- `harness-comfyui-cli-candidate/preset.yml` 的 `name` 为 `ComfyUI工作台预设`；
- `harness-comfyui-iteration/preset.yml` 的 `name` 为 `ComfyUI迭代预设`；
- 注册组件保留官方内置 Preset，并增加这两个项目预设。

## 项目 Skill 来源与作用域

当前 checkout 的 `.agents/skills/<skill-name>/` 是项目 Skill 唯一源码目录。开发者在该目录创建或修改 Skill，并使用该目录中的文件构建插件包。

`config/product-agent.json.skills.sourceRootRelativePath` 定义 checkout 中项目 Skill 源码根目录；该字段当前为 `.agents/skills`。插件包内的 `agent-presets/project-installed-skills.mjs` 按自身安装模块位置解析包内 `.agents/skills/`，并以 `providerName: harness-comfyui`、`includeDefaultRoots: false`、`watch: false` 注册官方 filesystem Skill provider。两个项目 Preset 各自加载该组件，因此两个 Preset 都能读取插件包内的八个 Repository Skills，其他 Preset 不加载该项目 Skill provider。

项目 Skill 的安装包内相对路径是运行时唯一来源。工作台和迭代 Preset 不读取 checkout 或用户主目录中的项目 Skill 副本；官方内置 Preset 与其他 Preset 保留官方自身的 Workspace 和用户级 Skill 行为。

## Tool schema 可见性

本文将 Preset 加载、由模型直接调用或经 `run_code` 调用的 Tool 称为末端 Tool。

两个 ComfyUI 产品 Preset 必须通过 DSH/Cordis plugin component 加载 `agent-presets/project-tool-visibility.mjs`，并把该组件的 `config.mode` 设置为 `local-only`。该组件使用 DSH Tool Registry restriction 建立当前 Preset 的 Tool view。两个 Preset 向模型提供的末端 Tool schema 只能来自各自加载的 Tool。DSH 在 PTC 或 both 展示模式下提供的 `run_code` 传输只能调用当前 Preset scope 已可见的末端 Tool。

当前 Host 注册以下项目 Tool：

- `query_semantic_comfyui_templates`；
- `query_semantic_loras`；
- `query_semantic_generation_models`；
- `query_semantic_comfyui_instances`；
- `generate_with_comfyui`；
- `read_comfyui_run_inputs`；
- `get_generation_run_media`；
- `inspect_image`。

新增 Host 项目 Tool schema 时，两个 ComfyUI 产品 Preset 仍只能向模型提供各自加载的末端 Tool；官方 `standard` Preset 继续保留 Host 项目 Tool 的可见性。

## 系统提示词段落可见性

两个 ComfyUI 产品 Preset 必须加载 `agent-presets/project-system-prompt-visibility.mjs`。该组件在当前 Preset scope 的 `system-prompt/assemble` waterfall 完成后，从 `PromptAssembly.sections` 移除 `harness:identity`、`harness:source` 和 `app:web-surface` 三个 Harness 自维护段落。

该组件必须保留 `deployment:persona`、Tool 使用说明及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。官方 `standard`、`minimal`、`cordis` 和其他 Agent Preset 保留各自现有的系统提示词 assembly。

## 工作台预设的子 Agent 续派

`ComfyUI工作台预设` 使用 `agent.cordis.yml` 中的 `subagent_task` 创建与续派子 Session。主 Agent 首次调用提供 `description` 和 `task`，DSH 原生 `startContinuable` 创建子 Session 并返回 `subagentId`；后续调用把该值写入 `agent_id`，DSH 原生 `sendMessage` 向同一子 Session 续派。子 Session 继承父 Session 的模型和 Provider，工具拒绝列表阻止子 Session 再次委派。DSH 将子 Session 完成通知返回父 Agent。

## 迭代预设的四个子 Agent 与 Workspace

`ComfyUI迭代预设` 配置 `subagent_composition`、`subagent_generation`、`subagent_observation` 和 `subagent_comparison` 四个角色工具；四个配置均加载 `agent-presets/project-iteration-dispatch.mjs`。每项 `config.persona` 定义该角色职责和流程，`config.agentOptions.provider`、`model` 与 `reasoningEffort` 定义该角色的模型设置，`config.parameters` 定义调用参数，`config.taskTemplate` 定义任务标题、分组和字段顺序。每个角色使用 `provider: spawn` 和 `maxDepth: 1`，把派生深度限制为一层。工具输出 schema 首次返回 `kind` 与 `subagentId`，续派返回 `messageId`。

主 Agent 使用同一角色工具创建和续派任务。构图与生成角色复用各自已有的子 Session；观察与比较角色每轮创建新子 Session。DSH 将完成通知送回主 Agent。预设加载 `@deepseek-ai/dsh-tool-subagent-control`，允许子 Agent 使用 `send_message` 向父 Agent 报告问题，并允许主 Agent 使用 `interrupt_agent` 中断任务。四个子 Agent 的 `toolFilter.deny` 列出四个角色派发工具和 `interrupt_agent`。

主 Agent 按 `comfyui-iterate-generation` Skill 的流程派发每轮任务。主 Agent 必须按 `.agents/skills/comfyui-iterate-generation/references/records.md` 的要求提供实际输出路径；子 Agent 必须写入文件并返回路径。主 Agent 必须向构图角色提供 `.agents/skills/comfyui-iterate-generation/references/composition-design.md`，并向比较角色提供 `.agents/skills/comfyui-iterate-generation/references/iteration-method.md`。生成角色必须使用与实际模型对应的 Prompt Builder Skill 和 `comfyui-generate`；观察角色必须使用 `local-image-reader`。

两个项目 Preset 均加载 `agent-presets/project-subagent-workspace.mjs`。该组件在每个 `agent/pre-step` 识别真实的 `origin: subagent` Session，通过子 Session header 的 `parentSession` 找到父 Session，解析并核对父子 `cwd` 的真实路径相同，再按父 Session 的 `cwd` 查找 Workspace 并确认父 Session 已附加。

组件必须在子 Session 首个 Agent step 前完成 `Workspace.attachSession(<真实子 Session ID>)`，并等待附加完成；同一子 Session 的后续 step 复用已完成的附加结果。父 Session 不存在、父子缺少或无法解析 `cwd`、父子真实路径不同、找不到父 Workspace、父 Session 尚未加入 Workspace 或 `attachSession` 失败时，组件停止当前 Agent step，并在错误中指出子 Session ID、失败原因、涉及的父 Session、`cwd` 或 Workspace，以及需要检查或修正的具体项。

## 项目 Skill 的 CLI 使用参考文档

通过 shell 调用项目 CLI 的 Skill 必须在自身 `references/` 目录保存 CLI 使用参考文档，并在 `SKILL.md` 中使用 Skill 目录内的相对路径引用，例如 `references/generation-cli.md`。一个 Skill 调用多个职责不同的 CLI 时，可以为每个 CLI 建立一份文档。每份文档必须提供 Skill 执行者独立完成调用所需的全部信息，并且只引用该 Skill 目录内可访问的资源。

新建或修改 CLI 使用参考文档时，开发者必须定义下表内容。开发者可以合并或细分章节，但章节标题必须准确概括正文。

| 内容 | 必须定义的信息 |
| --- | --- |
| CLI 用途 | 每条命令完成的任务。 |
| 调用入口 | Skill 执行者可直接调用的完整可执行入口。 |
| 调用命令和条件 | 每个 command 与 subcommand 的条件、前提和顺序。只有一个命令时，调用入口须给出完整命令，其他章节引用该入口。 |
| 参数与标准输入 | 每个 CLI 参数和 stdin JSON 属性的名称、类型、必填条件、允许值、数量限制、缺省语义和字段约束。 |
| 输入值的来源 | Workflow 模板、生成模型、LoRA、ComfyUI 实例、Generation Run ID 和其他业务值的输入或查询来源。 |
| 成功输出与失败输出 | 成功 stdout 结构、字段含义、退出码和 stderr 格式；异步命令须说明成功表示请求已接受还是任务已完成。 |
| 错误处理与重试 | 每个错误码或错误类别的报告内容、输入修正方法、重试条件和部分成功结果处理方式。 |
| 调用次数与结果复用 | 每个对象的调用次数、多对象调用顺序、成功结果复用和重试条件；创建或修改记录的命令还须定义持久化结果及失败后重试对前次结果的影响。 |

CLI 使用参考文档必须使用实际命令、参数和输出字段。完整示例只在能说明正文未展示的 stdin 接法或多命令组合时保留。示例使用无需认证的输入，或明确标记为虚构的凭据占位符。

## SKILL.md 的参考文档读取条件

用户请求符合项目 Skill frontmatter `description` 时，选择 ComfyUI 产品 Preset 的 Agent 必须完整读取对应 `SKILL.md`。任务需要项目 managed CLI 时，Agent 必须先完整读取 `SKILL.md` 指定的 CLI 使用参考文档，再通过官方前台 shell Tool Call 执行其中定义的项目 CLI 命令。

使用项目 CLI 的 `SKILL.md` 必须在首次需要该 CLI 的任务步骤中写出准确的参考文档相对路径，并要求执行者在首次调用前完整读取。命令字段、错误码和重试规则集中定义在 CLI 使用参考文档中。

## 开发与验收

### 自动化与黑盒检查

开发者修改产品 Preset、注册组件或相关 Host Tool scope 时，必须运行所改行为对应的正常、异常和边界自动化测试，并完成 `docs/system/testing.md` 规定的检查。开发者新增或修改项目 Skill 或 CLI 参考文档时，必须运行执行该 Skill 的应用规定的启动检查、Skill 黑盒测试，以及提交、构建或发布所要求的静态检查，并使各项检查达到规定的通过条件。开发者必须使 Skill 黑盒测试覆盖该应用启动检查为该 Skill 定义的全部项目，并采用相同的通过条件。

### 官方应用与真实模型验收

产品 Preset、Tool roster、提示词可见性、Skill 读取、managed CLI 调用、子 Agent 派发或 Workspace 登记行为发生变化时，开发者按已批准的 `docs/plans/official-desktop-plugin-20260929.md` 真实模型验收矩阵验证对应行为。开发者先用 `pnpm test:desktop` 完成当前候选包的构建、安装、Live 和生命周期 E2E，再通过独立 worktree 的官方应用 development probe 完成需要真实模型的项目验收；development probe 的启动、状态检查和停止命令见 `docs/agents/worktree-development.md`。Agent 在官方应用中显式选择被测产品 Preset。

开发者必须在 `docs/verification/official-desktop-plugin/` 保存验收记录，记录应用与插件版本、被测 Preset、模型、Workspace、Skill 和参考文档路径、用户请求、Tool 与 shell Tool Call、CLI stdin、退出码、stdout、stderr、子 Session 身份及最终业务结果。开发者进行正式 ComfyUI Run 验收时，还必须记录完整 Run ID、目标实例、Workflow 与资源 ID、实际 Seed 和参数、Actual/API Workflow、状态变化、最终媒体路径及应用重启后的查询结果。

### 语义审查

修改本规范、项目 `SKILL.md` 或 CLI 使用参考文档后，开发者必须派发独立语义 Reviewer。Reviewer 的审计输入只包含本次审阅的一个目标文件、仓库“内容写作”规则和本节审计标准；审阅 `SKILL.md` 或 CLI 使用参考文档时，输入还包含“Skill 使用与开发”中的 Skill 文档规则。Reviewer 独立阅读目标文件，并逐项判断语义质量。

Reviewer 必须逐句核对以下内容：

- 句子使用通顺、可朗读的表达，并写明执行主体、动作、对象和结果；常用词与专业术语采用现有名称，任务专用名称先定义再使用；
- 每项规则使用正向句式，写明具体动作、对象所属文件或模块及执行条件；每章正文服务于该章用途，每项要求只完整定义一次；
- UI 文案和后端接口错误文案写明实际情况和用户可采取的操作；
- 对本规范，Reviewer 逐句并在需要时逐分句执行删除检查。删除后仍能理解要求、完成动作和判断结果的文字列为删除建议；删除会妨碍开发者理解、实施或验收的内容予以保留；
- 对 `SKILL.md` 与 CLI 使用参考文档，Reviewer 逐句并在需要时逐分句执行删除检查。保留执行者完成任务需要的规范、步骤、资源、工具调用方法及输入输出字段用途；将开发者要求、宿主内部流程、工具实现细节、升级过程或逻辑、旧版本描述列为删除建议；限制条款须以正向句式说明允许执行的动作，并以反复测试中出现同一错误动作为依据；
- Reviewer 使用含源文件行号的验收清单逐项标记“通过”或“需修改”，并记录独立理解的含义和判定理由；每项“需修改”均写明位置、问题、具体建议以及可直接替换的文本，或注明“删除且不替换”。

开发者必须在语义审阅前依据源码与测试核实 CLI 命令、参数和输出字段。程序检查只处理具有确定性规则的结构化数据；语义理解、语义测试和语义验收由 Reviewer 阅读和判断完成。
