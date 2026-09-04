# ComfyUI 工作台预设与项目 Skill 开发规范

## 适用范围

本规范适用于以下开发任务：

- 创建或修改自定义 `ComfyUI工作台预设`；
- 创建或修改本仓库 `.agents/skills/<skill-name>/` 中的项目 Skill；
- 创建或修改项目 Skill 自带的 CLI 使用参考文档；
- 部署或修改 `$HOME/.agents/skills/<skill-name>` 全局 Skill 链接。

Harness `standard` Preset 的 Tool 可见性不属于本规范的限制对象。Host 可以继续注册项目 Tool schema，`standard` Preset 可以继续向模型提供这些 Tool schema。

## 自定义 ComfyUI 工作台预设

### Preset 源码和身份

`agent-presets/harness-comfyui-cli-candidate/` 是自定义 `ComfyUI工作台预设` 的 canonical source。`config/product-agent.json` 的 `preset.id` 保存兼容性内部 ID，`agent-presets/harness-comfyui-cli-candidate/preset.yml` 的 `name` 保存用户可见名称。

开发者修改该 Preset 时必须保持以下合同：

- `preset.id` 使用 `harness-comfyui-cli-candidate`；
- `preset.yml` 的 `name` 使用 `ComfyUI工作台预设`；
- `prod:*`、`dev:*` 和 `web:*` 从同一份 canonical source 物化 Preset；
- 当前插件 `cordis.patch.yml` 把该自定义 Preset 设置为默认 Preset；启动器不修改 Harness `standard` Preset 的源码。

### 全局 Skill 目录

主开发 checkout 的 `.agents/skills/<skill-name>/` 是项目 Skill 的 canonical source。生产环境的 `$HOME/.agents/skills/<skill-name>` 必须是指向主开发 checkout 对应 Skill 目录的绝对符号链接。全局 Skill 链接不得指向独立 linked worktree。

`pnpm dev:start` 不修改真实 `$HOME/.agents/skills`。开发启动器把隔离 Desktop HOME 的 `.agents/skills` 链接到当前 worktree 的 `config/desktop-worktree.json.skillSourceRelativePath`，使真实 Desktop 验收读取本分支候选 Skill。该隔离运行目录中的链接不是生产环境的全局 Skill 链接。

自定义 `ComfyUI工作台预设` 的 composition 必须同时加载 `@deepseek-ai/dsh-skill-filesystem` 和 `@deepseek-ai/dsh-tool-skill`，使 Agent 能够发现并读取 `$HOME/.agents/skills/` 中的全局 Skill。Preset 目录不得复制项目 Skill 文件，也不得在 Preset 文件中写入 `/Users/<name>/` 或主开发 checkout 的机器绝对路径。

修改全局 Skill 链接时，必须确认链接目标来自最终发布提交的主开发 checkout，并在新 Desktop Session 中验证对应 Skill 可以被发现和执行。

### Tool schema 可见性

自定义 `ComfyUI工作台预设` 必须通过 DSH/Cordis plugin component 机制加载 `agent-presets/project-tool-visibility.mjs`，并把该 component 的 `config.mode` 设置为 `local-only`。`project-tool-visibility.mjs` 使用 DSH Tool Registry restriction 建立该 Preset 的 Tool view；该 component 不注册模型可见 Tool schema。该 Preset 向模型提供 Preset 自己加载的 shell、Skill 和 presentation Tool，不继承 Host-global 项目 Tool schema。

当前 Host 注册的项目 Tool schema 包含：

- `query_semantic_comfyui_templates`；
- `query_semantic_loras`；
- `query_semantic_generation_models`；
- `query_semantic_comfyui_instances`；
- `generate_with_comfyui`；
- `read_comfyui_run_inputs`；
- `get_generation_run_media`；
- `inspect_image`。

Host 增加新的项目 Tool schema 时，`ComfyUI工作台预设` 的 `local-only` 合同必须继续隐藏新增的 Host-global Tool schema。该要求不改变 `standard` Preset 的 Tool 可见性。

选择 `ComfyUI工作台预设` 的 Agent 必须按需读取全局 Skill 及其 CLI 使用参考文档，并通过前台 shell Tool Call 调用项目 managed CLI。该 Agent 不把 Host 项目 Tool schema 当作 Skill 接口。

### 系统提示词段落可见性

自定义 `ComfyUI工作台预设` 必须通过 DSH/Cordis plugin component 机制加载 `agent-presets/project-system-prompt-visibility.mjs`。该 component 必须在当前 Preset scope 的 `system-prompt/assemble` waterfall 完成后，从 `PromptAssembly.sections` 中删除以下三个 Harness 自维护段落：

- `harness:identity`；
- `harness:source`；
- `app:web-surface`。

该 component 只能修改 `PromptAssembly.sections`。该 component 必须保留 `deployment:persona`、Tool 使用说明以及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。Harness `standard`、`minimal`、`cordis` 和其他 Agent Preset 的系统提示词 assembly 不加载该 component。

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

`SKILL.md` 负责描述 Skill 的任务流程和决策分支。CLI 使用参考文档负责描述 CLI 命令、参数、输入、输出、错误、调用次数、结果复用和持久化结果。`SKILL.md` 不复制 CLI 使用参考文档中的完整命令合同。

使用项目 CLI 的 `SKILL.md` 必须在首次需要该 CLI 的任务步骤中写出参考文档的准确相对路径，并要求 Skill 执行者在首次调用前完整读取该文件。`SKILL.md` 只负责把任务分支指向参考文档，不复制命令字段、错误码、重试规则或 Host 调用过程。

## 开发与验收

### 自动化检查

修改自定义 `ComfyUI工作台预设` 时，测试必须验证以下结果：

- 产品 Preset 的用户可见名称和兼容性内部 ID 保持各自的唯一来源；
- composition 同时加载 Skill filesystem、Skill Tool 和 `local-only` Tool visibility component；
- composition 加载系统提示词可见性 component，并且该 component 只删除三个已声明的 Harness 自维护段落；
- 自定义 Preset 的模型 Tool roster 不包含 Host 项目 Tool schema；
- `standard` Preset 的 Host 项目 Tool 可见性不受自定义 Preset 影响；
- `prod:*`、`dev:*` 和 `web:*` 物化相同的产品 Preset 文件。

创建或修改使用项目 CLI 的 Skill 时，开发者必须逐项核对该 Skill 的 `SKILL.md` 读取条件和 CLI 使用参考文档必备内容。Markdown 语义验收由独立 Reviewer 完成，不使用程序根据关键词判断语义是否正确。

### 真实模型验收

自定义 `ComfyUI工作台预设` 的 Tool roster、Skill 读取流程或 managed CLI 调用流程发生变化时，开发者必须通过 `pnpm dev:start` 在隔离的完整 Desktop 开发环境中使用当前配置的真实 Provider 和真实模型完成验收。验收记录必须包含所选 Preset、模型、用户请求、模型实际读取的 Skill 参考文档、模型实际发起的 shell CLI 调用和 CLI 返回结果。

真实模型验收至少确认以下行为：

- `standard` Preset 可以继续使用 Host 注册的项目 Tool；
- `ComfyUI工作台预设` 不向模型提供 Host 项目 Tool schema；
- `ComfyUI工作台预设` 中的 Agent 能够发现全局 Skill、按 `SKILL.md` 的读取条件读取 CLI 使用参考文档，并通过前台 shell Tool Call 调用 managed CLI；
- 用户要求同一个 Generation Request 创建多个 Run 时，Agent 能够按照 CLI 使用参考文档执行多次独立提交。

### 语义 Review

修改本规范、`SKILL.md` 或 CLI 使用参考文档后，独立语义 Reviewer 必须核对以下内容：

- 语义 Reviewer 只读取本次审计的单个目标文件和本节审计标准，不读取计划、实施方案、源码、测试、其他参考文件、主 Agent 判断或其他 Reviewer 结论。
- 语义 Reviewer 逐行判断文字是否通顺，主体、动作、对象和结果是否具体，名词是否已经定义或具有明确指代。
- 语义 Reviewer 对每一行执行删除测试：删除该行后，Skill 执行者完成任务是否会出现理解困难、执行阻碍或执行漂移；三项均不会出现时，该行不通过审计。
- 语义 Reviewer 检查 Skill 文件是否写入外部 Harness 的执行逻辑、Host 内部实现、Skill 创建者规则、测试编写者规则或 Reviewer 规则。
- 语义 Reviewer 使用逐行表格记录 PASS 或 FAIL、独立理解到的含义和判定理由；FAIL 项必须提供精确替换文本或“删除且不替换”。

真实 CLI 命令、参数和输出结构由开发者在语义审计以前根据源码与测试单独核对。该核对结果不提供给语义 Reviewer。
