# ComfyUI 产品预设与项目 Skill 开发规范

## 适用范围

本规范适用于以下开发任务：

- 创建或修改自定义 `ComfyUI工作台预设` 或 `ComfyUI迭代预设`；
- 创建或修改本仓库 `.agents/skills/<skill-name>/` 中的项目 Skill；
- 创建或修改项目 Skill 自带的 CLI 使用参考文档。

Harness `standard` Preset 的 Tool 可见性不属于本规范的限制对象。Host 可以继续注册项目 Tool schema，`standard` Preset 可以继续向模型提供这些 Tool schema。

## 自定义 ComfyUI 产品预设

### Preset 源码和身份

`agent-presets/harness-comfyui-cli-candidate/` 是 `ComfyUI工作台预设` 在当前仓库中的唯一源码目录，`agent-presets/harness-comfyui-iteration/` 是 `ComfyUI迭代预设` 在当前仓库中的唯一源码目录。`config/product-agent.json` 的 `preset.id` 保存默认受管 Preset 的兼容性内部 ID，`preset.additionalManagedPresetIds` 保存附加受管 Preset ID。每个 Preset 唯一源码目录中 `preset.yml` 的 `name` 保存该 Preset 的用户可见名称。

开发者修改任一产品 Preset 时必须保持以下合同：

- `preset.id` 使用 `harness-comfyui-cli-candidate`，`preset.additionalManagedPresetIds` 包含 `harness-comfyui-iteration`；
- `harness-comfyui-cli-candidate/preset.yml` 的 `name` 使用 `ComfyUI工作台预设`，`harness-comfyui-iteration/preset.yml` 的 `name` 使用 `ComfyUI迭代预设`；
- `pnpm prod:start`、`pnpm prod:restart`、`pnpm dev:start`、`pnpm dev:restart`、`pnpm web:start` 和 `pnpm web:restart` 读取 `config/product-agent.json`，安装两个受管 Preset 的 `agent.cordis.yml`、`preset.yml` 和 `preset.sharedFiles` 声明的共享 component，并保留安装根目录中的用户自建 Preset；
- 当前插件 `cordis.patch.yml` 只把 `harness-comfyui-cli-candidate` 设置为默认 Preset；启动器不修改 Harness `standard` Preset 的源码。

省略 `agentPreset` 并采用仓库根目录 `cordis.patch.yml` 中 `id: agent-presets` 条目的 `config.default` 值 `harness-comfyui-cli-candidate`，以及显式设置 `agentPreset: harness-comfyui-cli-candidate`，都使 Session 最终采用 `ComfyUI工作台预设`。只有显式设置 `agentPreset: harness-comfyui-iteration` 才使 Session 采用 `ComfyUI迭代预设`。

### 项目 Skill 来源

当前 checkout 的 `.agents/skills/<skill-name>/` 是该 checkout 中项目 Skill 的唯一源码目录。开发者必须直接在该目录中创建或修改项目 Skill。项目 Skill 的发布和部署使用该目录中的文件，不创建、修改或验证 `$HOME/.agents/skills/<skill-name>` 符号链接。

`config/product-agent.json.skills.sourceRootRelativePath` 是 Desktop 生产、Desktop 开发和 Web Host 调试三条启动链路使用的 Repository Skills 相对路径来源。启动器验证该目录位于当前 checkout 内、目录本身不是符号链接且真实路径没有离开当前 checkout，然后通过 `HARNESS_COMFYUI_SKILL_DIR` 注入绝对路径。调用者环境或 `.env` 中预设的 `HARNESS_COMFYUI_SKILL_DIR` 值不能覆盖启动器从该配置解析并注入的绝对路径。

两个自定义 ComfyUI 产品 Preset 的 composition 必须同时加载 `@deepseek-ai/dsh-skill-filesystem` 和 `@deepseek-ai/dsh-tool-skill`。filesystem provider 必须使用 `providerName: harness-comfyui`、`includeDefaultRoots: false`、`watch: false`，并且 `customSkillDirs` 只能包含 `!!js process.env.HARNESS_COMFYUI_SKILL_DIR`。Preset 目录不得复制项目 Skill 文件，也不得写入 `/Users/<name>/` 或某个 checkout 的机器绝对路径。

Desktop 启动器通过 `DSH_AGENTS_HOME=<调用者用户主目录>/.agents` 保留 Harness `standard` Preset 对调用者用户主目录中其他用户级 Skill 的发现能力。两个 ComfyUI 产品 Preset 使用 `includeDefaultRoots: false`，因此不会读取当前 checkout 之外的 Workspace 或 `DSH_AGENTS_HOME` 中的同名 Skill。

### Tool schema 可见性

两个 ComfyUI 产品 Preset 必须通过 DSH/Cordis plugin component 机制加载 `agent-presets/project-tool-visibility.mjs`，并把该 component 的 `config.mode` 设置为 `local-only`。`project-tool-visibility.mjs` 使用 DSH Tool Registry restriction 建立当前 Preset 的 Tool view；该 component 不注册模型可见 Tool schema。两个 Preset 向模型提供各自加载的 Tool，不继承 Host-global 项目 Tool schema。

当前 Host 注册的项目 Tool schema 包含：

- `query_semantic_comfyui_templates`；
- `query_semantic_loras`；
- `query_semantic_generation_models`；
- `query_semantic_comfyui_instances`；
- `generate_with_comfyui`；
- `read_comfyui_run_inputs`；
- `get_generation_run_media`；
- `inspect_image`。

Host 增加新的项目 Tool schema 时，两个 ComfyUI 产品 Preset 的 `local-only` 合同必须继续隐藏新增的 Host-global Tool schema。该要求不改变 `standard` Preset 的 Tool 可见性。

用户请求符合某个项目 Skill 的 `SKILL.md` frontmatter `description` 时，选择任一 ComfyUI 产品 Preset 的 Agent 必须完整读取该 `SKILL.md`。当 `SKILL.md` 的任务分支要求调用项目 managed CLI 时，该 Agent 必须在首次调用前完整读取该任务分支指定的 CLI 使用参考文档，并通过前台 shell Tool Call 执行该参考文档指定的命令。该 Agent 不把 Host 项目 Tool schema 当作 Skill 接口。

### 系统提示词段落可见性

两个 ComfyUI 产品 Preset 必须通过 DSH/Cordis plugin component 机制加载 `agent-presets/project-system-prompt-visibility.mjs`。该 component 必须在当前 Preset scope 的 `system-prompt/assemble` waterfall 完成后，从 `PromptAssembly.sections` 中删除以下三个 Harness 自维护段落：

- `harness:identity`；
- `harness:source`；
- `app:web-surface`。

该 component 只能修改 `PromptAssembly.sections`。该 component 必须保留 `deployment:persona`、Tool 使用说明以及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。Harness `standard`、`minimal`、`cordis` 和其他 Agent Preset 的系统提示词 assembly 不加载该 component。

### 迭代预设的子 Agent 与 Workspace

`ComfyUI迭代预设` 加载 `@deepseek-ai/dsh-tool-subagent`，并固定使用 `provider: spawn`、`toolName: subagent`、`enableRunInBackground: false`、`maxDepth: 1` 和 `modelSelectionSettings: false`。该 Preset 使用 Host 已有的 spawn provider，不注册其他 provider，不加载 fork、后台任务或子 Agent 控制 Tool。`ComfyUI工作台预设` 不加载 subagent Tool。

`ComfyUI迭代预设` 必须加载 `agent-presets/project-subagent-workspace.mjs`。该 component 在每次 `agent/pre-step` 中识别 `origin: subagent` 的真实子 Session，并使用子 Session header 的 `parentSession` 查找父 Agent。该 component 分别把父子 Session header 的 `cwd` 解析为真实路径，要求两个真实路径相同，再根据父 Session 的 `cwd` 确定 Workspace，并确认父 Session 已附加到该 Workspace。子 Session 尚未附加时，该 component 必须调用并等待 `Workspace.attachSession(<真实子 Session ID>)` 完成，然后继续本次 Agent step；同一子 Session 的后续 step 不得重复附加。父 Agent 找不到、父或子 Session 没有 `cwd`、任一 `cwd` 无法解析为真实路径、父子真实路径不同、无法根据父 Session 的 `cwd` 确定 Workspace、父 Session 未附加到该 Workspace，或 `attachSession` 失败时，错误必须指出无法登记的子 Session ID，以及对应的父 Session、`cwd` 或 Workspace 对象和失败原因，并停止该 Agent step。`ComfyUI工作台预设` 不加载该 component。

## 项目 Skill 的 CLI 使用参考文档

### 文件归属

通过 shell 调用项目 CLI 的每个 Skill 必须在自己的 `references/` 目录中保存 CLI 使用参考文档。`SKILL.md` 必须使用 Skill 目录内的相对路径引用该文件，例如 `references/generation-cli.md`。

一个 Skill 调用多个职责不同的 CLI 时，可以为每个 CLI 分别创建参考文档。每份参考文档必须完整定义该 Skill 实际使用的命令；参考文档不得要求 Skill 执行者读取本仓库的 `docs/`、Host 源码或其他 Skill 目录才能完成 CLI 调用。

### 必备内容

新建或修改 CLI 使用参考文档时，开发者必须在文档中定义下表所列内容。开发者可以根据命令数量合并或细分章节，但每个章节的标题必须准确概括该章节的正文。

| 内容 | 必须定义的具体信息 |
| --- | --- |
| `CLI 用途` | 每条 CLI 命令完成的具体任务。 |
| `调用入口` | Skill 执行者可以直接调用的完整可执行入口。 |
| `调用命令和条件` | 每条 command 和 subcommand 的调用条件、调用前提和调用顺序。只有一个命令时，正文不重复“调用入口”已经给出的命令。 |
| `参数与标准输入` | 每个命令行参数和标准输入 JSON 属性的名称、JSON 类型、必填条件、允许值、数量限制、缺省语义和属性之间的约束。 |
| `输入值的来源` | Workflow 模板 ID、生成模型 ID、LoRA ID、ComfyUI 实例 ID、Generation Run ID 和其他业务输入值各自来自哪条用户输入或哪项查询结果。 |
| `成功输出与失败输出` | 成功时的标准输出结构、每个输出属性的含义、进程退出码和标准错误格式。异步命令必须明确成功输出表示已接受请求还是已经完成任务。 |
| `错误处理与重试` | 每个错误码或错误类别对应的报告内容、输入修正方法、重试条件和部分成功结果处理方式。 |
| `调用次数与结果复用` | 每条命令针对一个输入对象的调用次数、多个输入对象的调用顺序、成功结果的复用条件和重新调用条件。创建或修改记录的命令还必须定义每次成功调用产生的持久化结果，以及失败后再次调用对前一次结果的影响。 |

CLI 使用参考文档必须使用 CLI 的真实命令、真实参数名和真实输出属性名。完整调用示例只在示例能够说明正文没有直接展示的标准输入连接方式或多条命令组合时保留。示例不得包含访问令牌、账号密钥或生产认证信息。

### Skill 可见的 CLI 边界

CLI 使用参考文档只描述 Skill 执行者能够直接使用的可执行入口、业务参数、标准输入、标准输出、标准错误、调用次数、结果复用和持久化结果。Host 注入 endpoint、capability 和执行身份的过程由系统文档负责说明。

## `SKILL.md` 的参考文档读取条件

`SKILL.md` 负责描述 Skill 的任务流程和决策分支。CLI 使用参考文档负责描述 CLI 命令、参数、输入、输出、错误、调用次数、结果复用和持久化结果。

使用项目 CLI 的 `SKILL.md` 必须在首次需要该 CLI 的任务步骤中写出参考文档的准确相对路径，并要求 Skill 执行者在首次调用前完整读取该文件。`SKILL.md` 只负责把任务分支指向参考文档，不复制命令字段、错误码、重试规则或 Host 调用过程。

## 开发与验收

### 自动化检查

修改任一 ComfyUI 产品 Preset 时，测试必须验证以下结果：

- 产品 Preset 的用户可见名称和兼容性内部 ID 保持各自的唯一来源；
- composition 同时加载 Skill filesystem、Skill Tool 和 `local-only` Tool visibility component；
- `@deepseek-ai/dsh-skill-filesystem` 使用 `providerName: harness-comfyui` 和 `includeDefaultRoots: false`，且 `customSkillDirs` 只包含 `!!js process.env.HARNESS_COMFYUI_SKILL_DIR`；
- composition 加载系统提示词可见性 component，并且该 component 只删除三个已声明的 Harness 自维护段落；
- 两个产品 Preset 的模型 Tool roster 都不包含 Host 项目 Tool schema；
- `ComfyUI迭代预设` 的 subagent 能力只加载前台 spawn subagent Tool，并把深度限制为一层且关闭模型选择；`ComfyUI工作台预设` 不加载 subagent Tool；
- Workspace component 只处理 subagent Session；子 Session 尚未附加时，component 使用真实子 Session ID 调用并等待 `Workspace.attachSession()`，等待完成后才继续本次 Agent step；同一子 Session 的后续 step 不重复附加，父 Agent、真实 `cwd`、Workspace、父 Session 的 Workspace 归属或附加操作无效时停止本次 Agent step；
- `standard` Preset 的 Host 项目 Tool 可见性不受自定义 Preset 影响；
- `pnpm prod:start`、`pnpm prod:restart`、`pnpm dev:start`、`pnpm dev:restart`、`pnpm web:start` 和 `pnpm web:restart` 都读取 `config/product-agent.json`，安装相同的两个受管产品 Preset 配置和 `preset.sharedFiles` 声明的共享 component 文件，并保留安装根目录中的用户自建 Preset。

### 真实模型验收

任一 ComfyUI 产品 Preset 的 Tool roster、Skill 读取流程或 managed CLI 调用流程发生变化时，开发者必须通过 `pnpm dev:start` 在隔离的完整 Desktop 开发环境中使用当前配置中能够完成模型调用的 Harness Provider route 与模型完成验收。开发者必须在当前 checkout 外创建不含 Repository Skills 的 Workspace，并创建以下 Session：一个省略 `agentPreset` 后最终采用 `harness-comfyui-cli-candidate` 的 Session、一个显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session、一个显式设置 `agentPreset: harness-comfyui-iteration` 的 Session，以及 `remote.agentPresets.list()` 返回的每个其他 Preset ID 各一个 Session。验收记录必须包含每个 Session 的所选 Preset、模型、用户请求、是否读取 Skill 参考文档、是否发起 shell CLI 调用和 CLI 返回结果；未发生的读取或调用必须记录为“无”。

真实模型验收至少确认以下行为：

- `standard` Preset 可以继续使用 Host 注册的项目 Tool；
- 两个 ComfyUI 产品 Preset 都不向模型提供 Host 项目 Tool schema；
- 省略 `agentPreset` 后最终采用 `harness-comfyui-cli-candidate` 的 Agent、显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Agent 和显式设置 `agentPreset: harness-comfyui-iteration` 的 Agent 都能够发现当前 checkout 的 Repository Skills；
- 最终采用 `standard` 或其他非 ComfyUI 产品 Preset 的 Session 不会发现当前 checkout 的 Repository Skills，且 `standard` Session 仍能发现当前 checkout 之外的 Workspace 中的 Skill 和调用者用户主目录中的其他用户级 Skill；
- 两个 ComfyUI 产品 Preset 中的 Agent 都能够按 `SKILL.md` 的读取条件读取 CLI 使用参考文档，并通过前台 shell Tool Call 调用该 CLI 使用参考文档指定的项目 managed CLI 命令；
- `ComfyUI迭代预设` 的前台 subagent 能够继承父 Session 的模型设置，且首个 Agent step 开始业务调用前已经使用真实子 Session ID 登记到父 Session 所属 Workspace；第二层 subagent 请求必须被深度限制拒绝；
- 用户要求同一个 Generation Request 创建多个 Run 时，Agent 能够按照 CLI 使用参考文档执行多次独立提交。

### 语义 Review

创建或修改使用项目 CLI 的 Skill 时，开发者必须逐项核对该 Skill 的 `SKILL.md` 读取条件和 CLI 使用参考文档必备内容。Markdown 语义验收由独立 Reviewer 完成，不使用程序根据关键词判断语义是否正确。

修改本规范、`SKILL.md` 或 CLI 使用参考文档后，独立语义 Reviewer 必须核对以下内容：

- 语义 Reviewer 只读取本次审计的单个目标文件和本节审计标准，不读取计划、实施方案、源码、测试、其他参考文件、主 Agent 判断或其他 Reviewer 结论。
- 语义 Reviewer 逐行判断文字是否通顺，主体、动作、对象和结果是否具体，名词是否已经定义或具有明确指代。
- 语义 Reviewer 对本开发规范执行删除测试：删除该行后，开发者实现、测试或验收产品 Preset 与项目 Skill 时，是否会出现理解困难、实施阻碍或验收偏移；三项均不会出现时，该行不通过审计。
- 语义 Reviewer 对 `SKILL.md` 和 CLI 使用参考文档执行删除测试：删除该行后，Skill 执行者完成任务是否会出现理解困难、执行阻碍或执行漂移；三项均不会出现时，该行不通过审计。
- 语义 Reviewer 检查 Skill 文件是否写入外部 Harness 的执行逻辑、Host 内部实现、Skill 创建者规则、测试编写者规则或 Reviewer 规则。
- 语义 Reviewer 使用逐行表格记录 PASS 或 FAIL、独立理解到的含义和判定理由；FAIL 项必须提供精确替换文本或“删除且不替换”。

真实 CLI 命令、参数和输出结构由开发者在语义审计以前根据源码与测试单独核对。该核对结果不提供给语义 Reviewer。
