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

### 必备章节

本规范生效后新建的 CLI 使用参考文档，以及以后修改 CLI 合同的现有参考文档，必须包含下表中的章节。章节可以继续细分子章节，但不得省略表中定义的内容。

| 章节标题 | 章节必须定义的内容 |
| --- | --- |
| `CLI 的用途与适用任务` | CLI 完成的具体任务、各任务对应的用户请求，以及只查询数据或会修改状态的任务边界。 |
| `调用环境与可执行入口` | 可执行文件或环境变量、前台 shell Tool Call 要求、工作目录要求、调用命令前必须满足的 Host 或服务状态，以及 CLI 如何取得执行身份。 |
| `命令与调用时机` | Skill 可以调用的每个 command 和 subcommand、每条命令适用的用户任务、调用前提和调用顺序。CLI 合同明确规定互斥任务分支时，该章节必须写明对应边界。 |
| `参数与标准输入` | 每个命令行参数和标准输入 JSON 属性的名称、JSON 类型、必填条件、允许值、数量限制、缺省语义和属性之间的约束。 |
| `ID 与运行值的来源` | 该 CLI 使用的 Workflow 模板 ID、生成模型 ID、LoRA ID、ComfyUI 实例 ID、Generation Run ID 或其他运行值的查询命令、输出属性及传递目标。该章节必须说明 managed environment 自动提供哪些身份输入、Skill 执行者不填写哪些身份属性、需要 Workspace 的命令如何使用当前 Session 工作目录，以及写入命令保存哪些归属值；目标 CLI 使用其他接口合同时，章节必须写明该接口合同。 |
| `输出与完成语义` | 成功时的标准输出结构、每个输出属性的含义、进程退出码和标准错误格式。CLI 包含异步命令时，该章节必须区分异步接受、异步完成和最终成功。 |
| `错误、修正与重试` | CLI 错误码或错误类别、每类错误对应的输入修正方法、允许重试的条件、再次查询的条件，以及部分成功结果的处理方式。 |
| `副作用与重复调用` | 每条命令是否只读、是否创建或修改记录、一次调用产生的持久化结果、默认调用次数、用户要求多个结果时的重复调用方式，以及失败后再次调用对前一次结果的影响。只读 CLI 也必须在本章节明确说明不产生持久化修改。 |
| `完整调用示例` | 至少一个可以直接理解参数来源的完整命令。CLI 同时支持只读查询和状态修改时，参考文档必须分别提供一个查询示例和一个修改示例；示例中的 ID 占位符必须指明来自哪一条用户上下文记录或前置 CLI 输出。 |

CLI 使用参考文档必须使用 CLI 的真实命令、真实参数名和真实输出属性名。文档示例不得包含访问令牌、账号密钥或生产认证信息。

### managed CLI 执行身份

Host 的 managed shell environment 只为当前前台 `bash` 或 `pwsh` Tool Call 创建 CLI capability。该 capability 绑定当前 Session ID、Turn、Tool Call ID 和 Session 工作目录。项目 CLI 从 Host 注入的环境变量取得 CLI endpoint 和 capability，并把 capability 传回 Host；CLI 不自行推导执行身份。

Host 的 managed CLI route 授权 capability 后恢复上述执行身份。Generation Run 提交和历史 Run 查询命令还会使用 Session 工作目录解析 Workspace，并验证当前 Session 属于该 Workspace。Generation Run 提交命令把 Workspace ID、Session ID、Turn 和 Tool Call ID 保存到 `generation_runs` 表；目录查询命令不创建 Generation Run 归属记录。

Skill 执行者只向 CLI 传递业务参数，不填写 Workspace ID、Session ID、Turn 或 Tool Call ID。Skill 自带的 CLI 使用参考文档只描述 Skill 执行者可见的接口合同：managed environment 自动提供 CLI endpoint 和 capability；需要 Workspace 的命令使用当前 Session 工作目录；写入命令保存文档明确列出的归属值。CLI 使用参考文档不得复述 Host 建立或授权 capability 的内部实现过程。

## `SKILL.md` 的参考文档读取条件

`SKILL.md` 负责描述 Skill 的任务流程和决策分支。CLI 使用参考文档负责描述 CLI 命令、参数、输入、输出、错误和副作用。`SKILL.md` 不复制 CLI 使用参考文档中的完整命令合同。

使用项目 CLI 的 `SKILL.md` 必须在对应任务步骤中写出参考文档的准确相对路径，并至少定义以下读取条件：

| Skill 任务分支 | `SKILL.md` 必须规定的读取时机 |
| --- | --- |
| 当前 Skill 执行第一次调用某个项目 CLI | Skill 执行者在第一次调用前完整读取该 CLI 的使用参考文档。 |
| 目录搜索、记录 resolve 或 ID 获取 | Skill 执行者在组织第一条目录或 resolve 命令前读取对应 CLI 使用参考文档。 |
| Generation Request 或其他写入请求构造 | Skill 执行者在确定 JSON 属性名、JSON 类型和运行值来源前读取对应 CLI 使用参考文档。 |
| 创建、提交或重复提交写入请求 | Skill 执行者在第一次写入调用前读取副作用、调用次数、输出和错误章节；用户要求多次提交时，Skill 执行者按参考文档定义的重复调用单位执行。 |
| 历史 Generation Run 或其他结果查询 | Skill 执行者在第一条查询命令前完整读取对应 CLI 使用参考文档。 |
| CLI 返回错误后修正或重试 | Skill 执行者在修改命令输入或再次调用前读取错误、修正与重试章节。 |
| 上下文压缩后不再保留参考文档内容 | Skill 执行者在下一条 CLI 命令前重新读取对应 CLI 使用参考文档。 |

`SKILL.md` 可以使用以下形式定义首次读取合同：

```md
本次 Skill 执行第一次调用项目 CLI 前，Skill 执行者必须完整读取 `references/generation-cli.md`。进入目录查询、ID 获取、请求构造、提交、结果查询或错误修正分支时，Skill 执行者必须先读取该文件中对应章节；当前上下文已经完整保留对应章节时不重复读取。
```

## 开发与验收

### 自动化检查

修改自定义 `ComfyUI工作台预设` 时，测试必须验证以下结果：

- 产品 Preset 的用户可见名称和兼容性内部 ID 保持各自的唯一来源；
- composition 同时加载 Skill filesystem、Skill Tool 和 `local-only` Tool visibility component；
- composition 加载系统提示词可见性 component，并且该 component 只删除三个已声明的 Harness 自维护段落；
- 自定义 Preset 的模型 Tool roster 不包含 Host 项目 Tool schema；
- `standard` Preset 的 Host 项目 Tool 可见性不受自定义 Preset 影响；
- `prod:*`、`dev:*` 和 `web:*` 物化相同的产品 Preset 文件。

创建或修改使用项目 CLI 的 Skill 时，开发者必须逐项核对该 Skill 的 `SKILL.md` 读取条件和 CLI 使用参考文档必备章节。Markdown 语义验收由独立 Reviewer 完成，不使用程序根据关键词判断语义是否正确。

### 真实模型验收

自定义 `ComfyUI工作台预设` 的 Tool roster、Skill 读取流程或 managed CLI 调用流程发生变化时，开发者必须通过 `pnpm dev:start` 在隔离的完整 Desktop 开发环境中使用当前配置的真实 Provider 和真实模型完成验收。验收记录必须包含所选 Preset、模型、用户请求、模型实际读取的 Skill 参考文档、模型实际发起的 shell CLI 调用和 CLI 返回结果。

真实模型验收至少确认以下行为：

- `standard` Preset 可以继续使用 Host 注册的项目 Tool；
- `ComfyUI工作台预设` 不向模型提供 Host 项目 Tool schema；
- `ComfyUI工作台预设` 中的 Agent 能够发现全局 Skill、按 `SKILL.md` 的读取条件读取 CLI 使用参考文档，并通过前台 shell Tool Call 调用 managed CLI；
- 用户要求同一个 Generation Request 创建多个 Run 时，Agent 能够按照 CLI 使用参考文档执行多次独立提交。

### 语义 Review

修改本规范、`SKILL.md` 或 CLI 使用参考文档后，独立语义 Reviewer 必须核对以下内容：

- 每条规则具有明确的执行主体、动作和具体对象；
- 自定义 Preset 与 `standard` Preset 的 Tool 可见性边界没有混淆；
- CLI 使用参考文档包含全部必备章节和真实 CLI 合同；
- `SKILL.md` 对每个 CLI 任务分支写明了读取时机和参考文档相对路径；
- Skill 文件没有引用 Skill 执行环境不可见的仓库文档、Host 源码或机器绝对路径。
