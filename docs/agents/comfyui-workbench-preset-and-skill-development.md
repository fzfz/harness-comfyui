# ComfyUI 产品预设与项目 Skill 开发规范

## 适用范围

Agent 执行以下工作时必须遵守本规范：

- 创建或修改自定义 `ComfyUI工作台预设` 或 `ComfyUI迭代预设`；
- 创建或修改本仓库 `.agents/skills/<skill-name>/` 中的项目 Skill；
- 创建或修改项目 Skill 自带的 CLI 使用参考文档。

## 自定义 ComfyUI 产品预设

### Preset 源码和身份

`agent-presets/harness-comfyui-cli-candidate/` 是 `ComfyUI工作台预设` 在当前仓库中的唯一源码目录，`agent-presets/harness-comfyui-iteration/` 是 `ComfyUI迭代预设` 在当前仓库中的唯一源码目录。`config/product-agent.json` 的 `preset.id` 保存默认受管 Preset 的兼容性内部 ID，`preset.additionalManagedPresetIds` 保存附加受管 Preset ID。每个 Preset 唯一源码目录中 `preset.yml` 的 `name` 保存该 Preset 的用户可见名称。

开发者修改任一产品 Preset 时必须保持以下合同：

- `preset.id` 使用 `harness-comfyui-cli-candidate`，`preset.additionalManagedPresetIds` 包含 `harness-comfyui-iteration`；
- `harness-comfyui-cli-candidate/preset.yml` 的 `name` 使用 `ComfyUI工作台预设`，`harness-comfyui-iteration/preset.yml` 的 `name` 使用 `ComfyUI迭代预设`；
- `pnpm prod:start`、`pnpm prod:restart`、`pnpm dev:start`、`pnpm dev:restart`、`pnpm web:start` 和 `pnpm web:restart` 读取 `config/product-agent.json`，安装两个受管 Preset 的 `agent.cordis.yml`、`preset.yml` 和 `preset.sharedFiles` 声明的共享 component，并保留安装根目录中的用户自建 Preset；
- 启动器必须从两个 Preset 的 `preset.yml` 和 `agent.cordis.yml` 生成 Profile patch 中的两个 `@deepseek-ai/dsh-agent-preset` 条目；每个条目的 `config.name` 必须等于对应 `preset.yml` 的 `name`，`config.plugins` 必须包含对应 `agent.cordis.yml` 的插件数组。Profile patch 必须通过 `agent-preset-registry` 注册两个受管 Preset，并把 `harness-comfyui-cli-candidate` 设置为默认 Preset；启动器必须保留 Harness `standard` Preset 的源码。

省略 `agentPreset` 并采用 Profile patch 中 `id: agent-preset-registry` 条目的 `config.default` 值 `harness-comfyui-cli-candidate`，以及显式设置 `agentPreset: harness-comfyui-cli-candidate`，都使 Session 最终采用 `ComfyUI工作台预设`。只有显式设置 `agentPreset: harness-comfyui-iteration` 才使 Session 采用 `ComfyUI迭代预设`。

### 项目 Skill 来源

当前 checkout 的 `.agents/skills/<skill-name>/` 是该 checkout 中项目 Skill 的唯一源码目录。开发者必须直接在该目录中创建或修改项目 Skill，并直接使用该目录中的文件发布和部署项目 Skill。

`config/product-agent.json.skills.sourceRootRelativePath` 是 Desktop 生产、Desktop 开发和 Web Host 调试三条启动链路使用的 Repository Skills 相对路径来源。启动器必须确认该目录位于当前 checkout 内、该目录是实体目录，且其真实路径位于当前 checkout 内，然后通过 `HARNESS_COMFYUI_SKILL_DIR` 注入绝对路径。启动器从该配置解析并注入的绝对路径必须覆盖调用者环境或 `.env` 中预设的 `HARNESS_COMFYUI_SKILL_DIR` 值。

两个自定义 ComfyUI 产品 Preset 的 composition 必须同时加载 `@deepseek-ai/dsh-skill-filesystem` 和 `@deepseek-ai/dsh-tool-skill`。filesystem provider 必须使用 `providerName: harness-comfyui`、`includeDefaultRoots: false`、`watch: false`，并且 `customSkillDirs` 只能包含 `!!js process.env.HARNESS_COMFYUI_SKILL_DIR`。Preset 目录必须只保存 Preset 配置及其 component。

Desktop 启动器通过 `DSH_AGENTS_HOME=<调用者用户主目录>/.agents` 保留 Harness `standard` Preset 对调用者用户主目录中其他用户级 Skill 的发现能力。两个 ComfyUI 产品 Preset 使用 `includeDefaultRoots: false`，因此对同名 Skill 只读取当前 checkout 中的版本。

### Tool schema 可见性

本文将当前 Preset 加载、由模型直接调用或经 `run_code` 调用的 Tool 称为末端 Tool。

两个 ComfyUI 产品 Preset 必须通过 DSH/Cordis plugin component 机制加载 `agent-presets/project-tool-visibility.mjs`，并把该 component 的 `config.mode` 设置为 `local-only`。`project-tool-visibility.mjs` 使用 DSH Tool Registry restriction 建立当前 Preset 的 Tool view。两个 Preset 向模型提供的末端 Tool schema 必须仅来自各自加载的 Tool。DSH 在 PTC 或 both 展示模式下提供保留的 `run_code` 传输；该传输只能调用当前 Preset scope 已可见的末端 Tool。

当前 Host 注册的项目 Tool schema 包含：

- `query_semantic_comfyui_templates`；
- `query_semantic_loras`；
- `query_semantic_generation_models`；
- `query_semantic_comfyui_instances`；
- `generate_with_comfyui`；
- `read_comfyui_run_inputs`；
- `get_generation_run_media`；
- `inspect_image`。

Host 增加新的项目 Tool schema 时，两个 ComfyUI 产品 Preset 的 `local-only` 合同必须使其 Tool roster 继续仅包含各自加载的 Tool；`standard` Preset 必须继续保留 Host 项目 Tool 的可见性。

用户请求符合某个项目 Skill 的 `SKILL.md` frontmatter `description` 时，选择任一 ComfyUI 产品 Preset 的 Agent 必须完整读取该 `SKILL.md`。当 `SKILL.md` 的任务分支要求调用项目 managed CLI 时，该 Agent 必须在首次调用前完整读取该任务分支指定的 CLI 使用参考文档，并通过前台 shell Tool Call 执行该参考文档指定的命令。

### 系统提示词段落可见性

两个 ComfyUI 产品 Preset 必须通过 DSH/Cordis plugin component 机制加载 `agent-presets/project-system-prompt-visibility.mjs`。该 component 必须在当前 Preset scope 的 `system-prompt/assemble` waterfall 完成后，从 `PromptAssembly.sections` 中删除以下三个 Harness 自维护段落：

- `harness:identity`；
- `harness:source`；
- `app:web-surface`。

该 component 只能修改 `PromptAssembly.sections`。该 component 必须保留 `deployment:persona`、Tool 使用说明以及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。Harness `standard`、`minimal`、`cordis` 和其他 Agent Preset 必须保留各自现有的系统提示词 assembly。

### 工作台预设的子 Agent 续派

`ComfyUI工作台预设` 在 `agent.cordis.yml` 中配置 `subagent_task`。主 Agent 首次调用时提供 `description` 子任务标签和 `task` 任务正文，工具通过 DSH 原生 `startContinuable` 创建子 Session 并返回 `subagentId`；主 Agent 后续调用将该值传入 `agent_id`，工具通过 DSH 原生 `sendMessage` 向同一个子 Session 续派任务。子 Session 继承父 Session 的模型与 Provider，并且其工具权限禁止再次委派。DSH 将子 Session 的完成通知返回父 Agent。

### 迭代预设的子 Agent 与 Workspace

`ComfyUI迭代预设` 在 agent.cordis.yml 中配置四个 `../project-iteration-dispatch.mjs` 实例，工具名为 `subagent_composition`、`subagent_generation`、`subagent_observation` 和 `subagent_comparison`。每个实例的 `config.persona` 定义对应子 Agent 的职责与工作流程，`config.agentOptions` 独立指定模型，`config.parameters` 定义调用参数，`config.taskTemplate` 定义任务消息标题、分组与字段顺序。component 按模板组装参数，使用原生 `startContinuable` 创建子会话；调用参数包含 `agent_id` 时，使用原生 `sendMessage` 向该子会话投递本次任务。配置使用 `provider: spawn` 和 `maxDepth: 1`。

主 Agent 使用同一角色工具创建和续派任务，构图与生成任务分别继续使用各自此前创建的子会话，观察与比较每轮创建新子会话。DSH 在子会话完成时向主 Agent 发送完成通知。预设加载 `@deepseek-ai/dsh-tool-subagent-control`，供子 Agent 使用 `send_message` 向父 Agent 报告问题，并供主 Agent 使用 `interrupt_agent` 中断任务。子 Agent 的 `toolFilter.deny` 限制四个角色派发工具和 `interrupt_agent`。

主 Agent 读取 `comfyui-iterate-generation` 的 `SKILL.md`，按照其中规定的流程派发每轮子任务；该 Skill 的 `references/records.md` 定义结果目录及文件名。主 Agent 在每次派发时传入实际输出路径，子 Agent 写文件并返回路径。主 Agent 向构图子 Agent 提供该 Skill 的 `references/composition-design.md`，向比较子 Agent 提供 `references/iteration-method.md`。生成子 Agent 使用实际模型对应的 Prompt Builder Skill 和 `comfyui-generate`；观察子 Agent 使用 `local-image-reader`。

两个 ComfyUI 产品预设必须加载 `agent-presets/project-subagent-workspace.mjs`。该 component 必须在每次 `agent/pre-step` 识别 `origin: subagent` 的真实子 Session，并根据该子 Session header 的 `parentSession` 找到父 Session。该 component 必须把父子 Session header 的 `cwd` 分别解析为真实路径，核对两个真实路径相同，再根据父 Session 的 `cwd` 确定 Workspace，并确认父 Session 已附加到该 Workspace。

子 Session 尚未附加时，该 component 必须调用并等待 `Workspace.attachSession(<真实子 Session ID>)` 完成，然后继续本次 Agent step；同一子 Session 的后续 step 必须复用首次附加的结果。

以下任一情况发生时，该 component 必须停止本次 Agent step，并在错误中写明无法登记的子 Session ID、失败原因、出错的父 Session、`cwd` 或 Workspace，以及需要检查或修正的具体字段或附加操作：父 Session 不存在；父或子 Session 缺少 `cwd`；任一 `cwd` 无法解析为真实路径；父子真实路径不同；根据父 Session 的 `cwd` 找不到 Workspace；父 Session 尚未附加到该 Workspace；`attachSession` 失败。

## 项目 Skill 的 CLI 使用参考文档

### 文件归属

通过 shell 调用项目 CLI 的每个 Skill 必须在自己的 `references/` 目录中保存 CLI 使用参考文档。`SKILL.md` 必须使用 Skill 目录内的相对路径引用该文件，例如 `references/generation-cli.md`。

一个 Skill 调用多个职责不同的 CLI 时，可以为每个 CLI 分别创建参考文档。每份参考文档必须完整定义该 Skill 实际使用的命令，并提供 Skill 执行者独立完成 CLI 调用所需的全部信息；引用范围必须限于该 Skill 目录内可访问的文件。

### 必备内容

新建或修改 CLI 使用参考文档时，开发者必须在文档中定义下表所列内容。开发者可以根据命令数量合并或细分章节，但每个章节的标题必须准确概括该章节的正文。

| 内容 | 必须定义的具体信息 |
| --- | --- |
| `CLI 用途` | 每条 CLI 命令完成的具体任务。 |
| `调用入口` | Skill 执行者可以直接调用的完整可执行入口。 |
| `调用命令和条件` | 每条 command 和 subcommand 的调用条件、调用前提和调用顺序。只有一个命令时，正文必须在“调用入口”完整给出命令，并在其他章节引用该入口。 |
| `参数与标准输入` | 每个命令行参数和标准输入 JSON 属性的名称、JSON 类型、必填条件、允许值、数量限制、缺省语义和属性之间的约束。 |
| `输入值的来源` | Workflow 模板 ID、生成模型 ID、LoRA ID、ComfyUI 实例 ID、Generation Run ID 和其他业务输入值各自来自哪条用户输入或哪项查询结果。 |
| `成功输出与失败输出` | 成功时的标准输出结构、每个输出属性的含义、进程退出码和标准错误格式。异步命令必须明确成功输出表示已接受请求还是已经完成任务。 |
| `错误处理与重试` | 每个错误码或错误类别对应的报告内容、输入修正方法、重试条件和部分成功结果处理方式。 |
| `调用次数与结果复用` | 每条命令针对一个输入对象的调用次数、多个输入对象的调用顺序、成功结果的复用条件和重新调用条件。创建或修改记录的命令还必须定义每次成功调用产生的持久化结果，以及失败后再次调用对前一次结果的影响。 |

CLI 使用参考文档必须使用 CLI 的真实命令、真实参数名和真实输出属性名。完整调用示例只在示例能够说明正文没有直接展示的标准输入连接方式或多条命令组合时保留。示例必须使用无需认证的输入，或使用明确标注为虚构的认证占位符。

## `SKILL.md` 的参考文档读取条件

使用项目 CLI 的 `SKILL.md` 必须在首次需要该 CLI 的任务步骤中写出参考文档的准确相对路径，并要求 Skill 执行者在首次调用前完整读取该文件。命令字段、错误码和重试规则必须集中写入 CLI 使用参考文档。

## 开发与验收

### 自动化检查

本规范“自定义 ComfyUI 产品预设”一章规定的 Preset 配置、启动器或 component 发生变化时，测试必须覆盖该章规定的正常、异常和边界行为。

开发者创建或修改项目 Skill 或其 CLI 使用参考文档时，必须依据运行该 Skill 的应用的启动检查规则、Skill 黑盒测试用例和提交、构建或发布时的静态检查配置运行对应检查。Skill 黑盒测试必须覆盖启动检查针对该 Skill 规定的全部项目，并采用相同的通过条件。

### 真实模型验收

任一 ComfyUI 产品 Preset 的配置、启动器、Tool roster、系统提示词、Skill 读取流程、managed CLI 调用流程、子 Agent 派发或 Workspace 登记行为发生变化时，开发者必须通过 `pnpm dev:start` 在隔离的完整 Desktop 开发环境中使用当前配置中能够完成模型调用的 Harness Provider route 与模型完成验收。项目 `SKILL.md` 或 CLI 使用参考文档对 Skill 读取条件、任务步骤、CLI 命令或参数的修改也必须完成该验收。

本文将验收 Workspace 中名称不与当前 checkout 项目 Skill 重复、且 `SKILL.md` 含唯一验收标记的 Skill 称为 Workspace Skill。开发者必须在当前 checkout 外创建包含一个 Workspace Skill、且不包含当前 checkout Repository Skills 的 Workspace，并确认调用者用户主目录中存在另一个名称不同、`SKILL.md` 含另一个唯一验收标记的用户级 Skill。开发者必须在验收请求中要求 Agent 找到并复述两个标记，以核对 Skill 发现与读取结果。开发者必须创建以下 Session，并将其附加到该 Workspace：一个省略 `agentPreset` 后最终采用 `harness-comfyui-cli-candidate` 的 Session、一个显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session、一个显式设置 `agentPreset: harness-comfyui-iteration` 的 Session，以及 `remote.agentPresets.list()` 返回的每个其他 Preset ID 各一个 Session。验收记录必须包含每个 Session 的所选 Preset、模型、用户请求、是否读取 Skill 参考文档、是否发起 shell CLI 调用和 CLI 返回结果；未发生的读取或调用必须记录为“无”。

真实模型验收至少确认以下行为：

- `standard` Preset 可以继续使用 Host 注册的项目 Tool；
- 两个 ComfyUI 产品 Preset 都仅向模型提供各自加载的末端 Tool schema；在 PTC 或 both 展示模式下，`run_code` 传输只能调用当前 Preset scope 已可见的末端 Tool；
- 省略 `agentPreset` 后最终采用 `harness-comfyui-cli-candidate` 的 Agent、显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Agent 和显式设置 `agentPreset: harness-comfyui-iteration` 的 Agent 都能够发现当前 checkout 的 Repository Skills；
- 最终采用 `standard` 或其他非 ComfyUI 产品 Preset 的 Session，其 Repository Skills 列表必须排除当前 checkout 的 `.agents/skills/`；`standard` Session 必须发现当前 checkout 之外的 Workspace 中的 Skill 和调用者用户主目录中的其他用户级 Skill；
- 两个 ComfyUI 产品 Preset 中的 Agent 都能够按 `SKILL.md` 的读取条件读取 CLI 使用参考文档，并通过前台 shell Tool Call 调用该 CLI 使用参考文档指定的项目 managed CLI 命令；
- `ComfyUI迭代预设` 的四个子 Agent 的 Session 配置或运行记录分别包含该子 Agent 对应的 persona 与模型 ID，完成通知能够回到主 Agent；构图和生成会话能够接收后续消息；首个 Agent step 前已将真实子 Session 登记到父 Session 所属 Workspace，子 Agent 的工具权限阻止再次委派；
- `ComfyUI工作台预设` 的主 Agent 能够通过 `subagent_task` 创建子 Session，并将返回的 `subagentId` 传入 `agent_id`，在同一子 Session 续派；子 Session 的请求、响应、父 Session ID、Workspace 路径与完成通知均可核对，子 Agent 的工具权限阻止再次委派；
- 用户要求同一个 Generation Request 创建多个 Run 时，Agent 能够按照 CLI 使用参考文档执行多次独立提交。

### 语义 Review

创建或修改使用项目 CLI 的 Skill 时，开发者必须逐项核对该 Skill 的 `SKILL.md` 读取条件和 CLI 使用参考文档必备内容。独立 Reviewer 必须阅读目标 Markdown 文件并判断语义；程序仅执行确定性结构检查。

修改本规范、`SKILL.md` 或 CLI 使用参考文档后，独立语义 Reviewer 必须核对以下内容：

- 语义 Reviewer 的审计输入必须仅包含本次审计的单个目标文件、内容写作规则和本节审计标准；审阅 Skill 文档时，审计输入还必须包含 Skill 文档规则。
- 语义 Reviewer 逐行判断文字是否通顺，主体、动作、对象和结果是否具体，名词是否已经定义或具有明确指代。
- 语义 Reviewer 必须检查要求是否使用正向句式、对象是否注明所属文件或模块、每章是否具有明确用途、每条要求是否只完整定义一次，以及 UI 和接口错误文案是否说明具体情况与可执行操作。
- 语义 Reviewer 必须逐句检查本开发规范，必要时逐分句尝试删除文字；删除导致开发者理解困难、实施阻碍或验收偏移时，该句或分句标为 PASS，其余标为 FAIL。
- 语义 Reviewer 必须逐句检查 `SKILL.md` 和 CLI 使用参考文档，必要时逐分句尝试删除文字；删除导致 Skill 执行者理解困难、执行阻碍或执行漂移时，该句或分句标为 PASS，其余标为 FAIL。
- 语义 Reviewer 必须确认 `SKILL.md` 只包含 Skill 执行者所需的规范、步骤、资源、工具调用方法及输入输出字段用途；Reviewer 必须将创建者要求、宿主内部流程、升级过程和旧版描述列为需删除内容，并核对限制条款仅在反复测试出现同一错误动作后以正向句式规定允许动作。
- 语义 Reviewer 使用标明源文件行号的表格逐句记录 PASS 或 FAIL、独立理解到的含义和判定理由；FAIL 项必须提供精确替换文本或“删除且不替换”。

真实 CLI 命令、参数和输出结构由开发者在语义审计以前根据源码与测试单独核对。
