# ComfyUI 工作台预设跨 Workspace 项目 Skill 实施方案

## 方案用途

本方案供计划执行者在用户批准后实施以下行为：当 Session 所属 Harness Workspace 不等于当前 checkout 时，最终采用 `ComfyUI工作台预设` 的 Session 才能从当前 checkout 的 `.agents/skills/` 发现并读取这七个 Repository Skills。创建 Session 时可以省略 `agentPreset` 并由系统默认选择 `harness-comfyui-cli-candidate`，也可以把 `agentPreset` 显式设置为 `harness-comfyui-cli-candidate`；两种 Session 都必须最终采用 `ComfyUI工作台预设`。外部 Workspace 中同名 Skill 的存在不改变该来源隔离规则。系统不得把这七个 Repository Skills 复制或软链接到真实 `$HOME/.agents/skills/`。

## 执行主体与术语

“计划执行者”是用户批准本方案后负责修改源码、测试和文档，启动 Desktop，创建 Session 并核对事件记录的 Agent。“Skill 执行者”是真实模型验收 Session 所选的 Agent 模型，负责调用 `skill` Tool、`bash` Tool 和 Repository Skill 定义的 CLI。“Session”是 Harness 为一次对话保存 Workspace、Preset 和事件记录的运行时对象；Session 不承担计划实施动作。

“Repository Skills”指本仓库 `.agents/skills/` 下、在“真实全局链接迁移”章节逐项列出的七个 Skill；“产品 Preset”和“ComfyUI Workbench Preset”均指用户可见名称为 `ComfyUI工作台预设`、内部 ID 为 `harness-comfyui-cli-candidate` 的 Preset。“当前 checkout”指调用 `loadProductAgentConfiguration(repositoryRoot)` 时由 `repositoryRoot` 指定的 Harness ComfyUI 仓库 checkout：独立 Desktop 开发环境和 Web Host 调试环境使用当前独立 worktree，Desktop 生产环境使用启动生产进程的生产 checkout。本方案最终候选以 `abd676f9d58f3ad9fc63ad0c0f94160cf3b9a0b3` 作为独立 Review 的固定比较点。

“Harness Workspace”指创建 Session 时传入的工作目录。“默认采用产品 Preset”指创建 Session 时省略 `agentPreset`，Harness 随后采用仓库根目录 `cordis.patch.yml` 中 `id: agent-presets` 条目的 `config.default` 值 `harness-comfyui-cli-candidate`。“显式选择产品 Preset”指创建 Session 时把 `agentPreset` 明确设置为 `harness-comfyui-cli-candidate`。两种方式都必须使 Session 最终采用 `ComfyUI工作台预设`。

本方案中的“Desktop 启动器”指 `scripts/desktop/worktree.mjs` 中的 `loadDesktopWorktreeContext()`、`loadDesktopProductionContext()`、`desktopEnvironment()` 和 `prepareDesktopWorktree()`；“Web Host 环境构建器”指 `scripts/production/process.mjs` 中的 `buildHostEnvironment()`；“Configuration Profile loader”指 `src/config/load-profile.ts` 中的 `loadProfile()`。“Desktop 环境文件”指 `desktopEnvironment(context, environment)` 只读解析的 `context.environmentFilePath`；“调用者环境”指该函数的 `environment` 参数；“Desktop 子进程环境”指 `prepareDesktopWorktree()` 返回值中的 `environment` 对象。“产品 Preset filesystem provider”指 `agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml` 中 `id: skill-filesystem`、`name: '@deepseek-ai/dsh-skill-filesystem'` 的 YAML 条目；该条目的 `config.providerName` 必须等于 `harness-comfyui`。

本方案中的“运行时 Preset ID 集合”指真实 Desktop 中调用 `remote.agentPresets.list()` 后取得的 `value.presets[].id` 集合；“非产品 Preset ID 集合”指从该集合排除 `harness-comfyui-cli-candidate` 后的结果。“Provider route”指调用同一 Session 的 `remote.session.selectModel()` 时传入的 `provider` 字符串；“模型 ID”指同一请求中的 `model` 字符串。`remote.session.selectModel()` 返回 `ok: false` 表示 Provider route 或模型选择失败；`remote.session.prompt()` 返回 `ok: false` 表示 Prompt 请求失败。计划执行者必须通过 `remote.session.follow({ address: { kind: 'session', sessionId }, maxMessages: 500 })` 取得同一 Session 的事件记录；该流中的 `turn/end.data.reason.kind` 只有等于 `completed` 才表示模型运行成功，任何其他值都表示模型运行没有完成真实验收。

## 必须要实现的目标

1. 计划执行者必须保留当前 checkout 的 `.agents/skills/`，并把该目录作为七个 Repository Skills 的唯一原始目录。
2. 计划执行者必须配置产品 Preset filesystem provider，使其从当前 checkout 的 `.agents/skills/` 读取 Repository Skills。
3. 当 Session 所属 Harness Workspace 不等于当前 checkout 时，计划执行者必须确保非产品 Preset ID 集合中每个 ID 对应的 Session 均不能从当前 checkout 的 `.agents/skills/` 读取七个 Repository Skills。省略 `agentPreset` 并由 `cordis.patch.yml` 中 `id: agent-presets` 条目的 `config.default` 选择 `harness-comfyui-cli-candidate` 的 Session，与显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session，都必须读取七个 Repository Skills。`tests/fixtures/` 下仅供自动化测试使用且不会出现在运行时 Preset ID 集合中的 Preset 不纳入上述运行时可见性隔离范围。
4. Repository Skills 路径注入必须同时在 Desktop 生产环境、独立 worktree Desktop 开发环境和独立 Web Host 调试环境生效。三种环境物化同一份产品 Preset；计划执行者必须在独立 worktree Desktop 开发环境中验证该 Preset 的 Session 可见性隔离。
5. 计划执行者必须删除启动器对真实 `$HOME/.agents/skills/<skill-name>` 项目链接的依赖，并停止创建隔离 Desktop HOME 的项目 Skill 软链接。
6. 计划执行者必须保留真实 `$HOME/.agents/skills/` 中其他用户 Skill 的正常发现能力；本项目不得把其他用户 Skill 当作 Repository Skills 管理。
7. 计划执行者必须继续使用 Harness `0.1.2-rc.1` 已公开的 Preset、Skill registry、`dsh-skill-filesystem.customSkillDirs` 和 `dsh-tool-skill` 接口，不得修改 DeepSeek Harness 或 DSH Desktop 源码。
8. 计划执行者不得新增依赖、另一个 Skill provider、用于列出 Skill 的 Remote 接口、Skill 菜单或 Skill 调用协议。

## 必须采用的设计

### 运行链路

```text
当前 checkout/config/product-agent.json
  skills.sourceRootRelativePath = ".agents/skills"
  skills.environmentVariable = "HARNESS_COMFYUI_SKILL_DIR"
                    │
                    ▼
scripts/profile/product-agent-config.mjs
  解析并验证 checkout 内的 Repository Skills 根目录
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
Desktop environment        Web Host environment
注入受管绝对路径             注入受管绝对路径
        └───────────┬───────────┘
                    ▼
ComfyUI工作台预设/skill-filesystem
  includeDefaultRoots: false
  customSkillDirs: [process.env.HARNESS_COMFYUI_SKILL_DIR]
                    │
                    ▼
Harness 按当前 Session 最终采用的 Preset 组装 Skill registry
                    │
                    ▼
当 Session 所属 Harness Workspace 不等于当前 checkout 时，只有最终采用该 Preset 的 Session 从当前 checkout 获得七个 Repository Skills
```

### 模块与接口

计划执行者必须新建 `scripts/profile/product-agent-config.mjs`，把当前位于 `scripts/profile/agent-preset.mjs` 内的产品 Agent 配置解析逻辑迁入该模块。该模块只导出 `loadProductAgentConfiguration(repositoryRoot)`。该函数必须返回 `{ preset, repositorySkillsRoot, repositorySkillsEnvironmentVariable }`：`preset` 是经过验证的 `config/product-agent.json.preset` 对象，`repositorySkillsRoot` 是经过验证的 Repository Skills 绝对目录，`repositorySkillsEnvironmentVariable` 是经过验证的 `config/product-agent.json.skills.environmentVariable` 字符串。

该模块的实现必须完成以下检查：

1. `config/product-agent.json` 的顶层值必须是非数组 JSON 对象，顶层只允许 `schemaVersion`、`preset` 和 `skills` 三个属性；`schemaVersion` 必须是数值 `2`；`skills` 必须是非数组 JSON 对象，且只允许字符串属性 `sourceRootRelativePath` 和 `environmentVariable`，两个属性都必须存在。
2. `preset` 必须是非数组 JSON 对象，并且必须同时包含且只包含 `id`、`sourceRootRelativePath`、`installRootRelativePath`、`retiredManagedPresetIds` 和 `sharedFiles`。`id` 必须是只包含小写字母、数字和连字符的字符串。`retiredManagedPresetIds` 必须是数组，每项必须是只包含小写字母、数字和连字符的字符串；退役 ID 不得重复，也不得等于 `id`。`sharedFiles` 必须是非空数组，每项必须是互不重复的 `.mjs` basename。`preset.sourceRootRelativePath` 必须是非空相对路径字符串；`loadProductAgentConfiguration(repositoryRoot)` 必须把该值解析为绝对路径，并确认解析结果位于 `repositoryRoot` 指定的当前 checkout 内。`preset.installRootRelativePath` 必须是非空相对路径字符串；`loadProductAgentConfiguration(repositoryRoot)` 必须确认 `resolve(repositoryRoot, preset.installRootRelativePath)` 没有离开 `repositoryRoot`，但仍返回配置中的相对路径字符串。`materializeSourceProductAgentPreset(repositoryRoot, dshHome)` 必须另外确认 `resolve(dshHome, preset.installRootRelativePath)` 产生的绝对路径位于 `dshHome` 内。
3. `skills.sourceRootRelativePath` 必须是位于当前 checkout 内的相对目录；该目录本身不得是符号链接，真实路径不得离开当前 checkout。
4. `skills.environmentVariable` 的值必须严格等于 `HARNESS_COMFYUI_SKILL_DIR`；其他字符串均为无效配置。
5. `config/environment-overrides.json` 必须把同名环境变量声明为 `valueType: "string"` 和 `passThrough: true`，且不得为该声明设置 Configuration Profile `target`。

`scripts/profile/agent-preset.mjs`、`scripts/desktop/worktree.mjs` 和 `scripts/production/process.mjs` 必须只通过上述接口取得 Repository Skills 目录，不得分别硬编码 `.agents/skills`。

`scripts/profile/agent-preset.mjs` 中的 `materializeSourceProductAgentPreset(repositoryRoot, dshHome)` 必须把产品 Preset 和共享组件写入 `dshHome/<preset.installRootRelativePath>`，并返回 `{ installRoot, sharedFiles, presets, retiredPresetIds }`。`installRoot` 是 `resolve(dshHome, preset.installRootRelativePath)` 产生的绝对路径字符串；`sharedFiles` 是已写入共享文件的绝对路径字符串数组；`presets` 是只包含当前产品 Preset 对应对象的单元素数组。该对象的 `presetId` 是 `config/product-agent.json.preset.id` 的字符串值，`sourceDirectory` 是 `resolve(repositoryRoot, preset.sourceRootRelativePath, preset.id)` 产生的绝对目录，`targetDirectory` 是 `resolve(installRoot, preset.id)` 产生的绝对目录；`retiredPresetIds` 是逐项来自 `config/product-agent.json.preset.retiredManagedPresetIds` 的字符串数组。自动化测试必须从 `installRoot` 递归收集相对文件路径，并以 `installRoot` 作为相对路径基准。

### Preset scope 配置

计划执行者必须修改 `agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml` 中 `id: skill-filesystem`、`name: '@deepseek-ai/dsh-skill-filesystem'` 的 YAML 条目，并把该条目的 `config` 设置为以下值和行为：

- `providerName` 使用 `harness-comfyui`。
- `includeDefaultRoots` 使用 `false`，使当前 checkout 之外的其他 Workspace 中的 `.dsh/skills` 或 `.agents/skills` 不能用同名 Skill 覆盖 Repository Skills。
- `watch` 使用 `false`，使该 provider 不监听 Repository Skills 目录变化。
- `customSkillDirs` 只包含 `!!js process.env.HARNESS_COMFYUI_SKILL_DIR`。

计划执行者必须把该 Preset 的 `id: persona` YAML 条目的 `config.text` 从完整原值 `You are the Harness ComfyUI workbench Agent. Use the available global Skills and managed project CLI. Reply in the user's language.` 改为 `You are the Harness ComfyUI workbench Agent. Use the available project Skills and managed project CLI. Reply in the user's language.`。计划执行者必须让 `tests/fixtures/agent-presets/harness-comfyui-schema-control/agent.cordis.yml` 的 `id: skill-filesystem` YAML 条目与产品 Preset 使用相同的 `name` 和 `config`。两个 YAML 文件只允许 `id: visibility` 条目的 `config.mode` 不同：测试 fixture 使用 `inherit-host-global`，产品 Preset 使用 `local-only`；其他 YAML 条目必须相同。

### 受管环境变量

Desktop 启动器和 Web Host 环境构建器必须把 `HARNESS_COMFYUI_SKILL_DIR` 设置为当前 checkout 的 Repository Skills 绝对路径。Desktop 启动器必须让 Desktop 子进程环境中的受管值覆盖 Desktop 环境文件和调用者环境中的同名输入，并且不得修改 Desktop 环境文件；Web Host 环境构建器必须覆盖调用者进程环境中的同名值。

计划执行者必须实现以下覆盖顺序：

1. Desktop 启动器的 `start` 和 `restart` 命令读取当前 checkout 的 `config/product-agent.json` 并解析 Repository Skills 根目录；`status`、`logs` 和 `stop` 命令只读取既有运行状态。
2. `desktopEnvironment(context, environment)` 必须先只读解析 `context.environmentFilePath`，再合并 `environment` 参数，最后在返回的 Desktop 子进程环境中写入 `HARNESS_COMFYUI_SKILL_DIR`；该函数不得修改 `context.environmentFilePath` 指向的文件。
3. Web Host 的环境构建逻辑先删除调用者提供的全部 `HARNESS_COMFYUI_*` 值，再从产品 Agent 配置写入 `HARNESS_COMFYUI_SKILL_DIR`。
4. `src/config/load-profile.ts` 中的 `loadProfile()` 只把该环境变量识别为 pass-through 输入，不把它写入 `ConfigurationProfile`。
5. Repository Skills 根目录缺失、不是目录、是符号链接或真实路径离开当前 checkout 时，Desktop 启动器的 `start` 和 `restart` 命令必须在创建 Session 前返回错误，Web Host 环境构建器必须在启动 Host 前返回错误。两者返回的错误都必须包含被拒绝的路径和对应拒绝原因，并且都不得回退到真实 `$HOME/.agents/skills/`。Desktop 启动器的 `status`、`logs` 和 `stop` 命令必须在 Repository Skills 配置无效时继续读取运行状态。

### Desktop HOME 与真实用户 Skill

计划执行者必须停止执行以下旧操作：

```text
<isolated Desktop HOME>/.agents/skills -> <checkout>/.agents/skills
<production isolated Desktop HOME>/.agents/skills -> <real HOME>/.agents/skills
```

计划执行者必须通过 `DSH_AGENTS_HOME=<real HOME>/.agents` 保留 Harness 对其他用户 Skill 的读取。`ComfyUI工作台预设` 使用 `includeDefaultRoots: false`，因此该 Preset 的 filesystem provider 不读取 `DSH_AGENTS_HOME`。Harness `standard` Preset 仍按自身默认配置读取其他用户 Skill。

`prepareDesktopWorktree()` 必须处理旧版本遗留在 `<isolated Desktop HOME>/.agents/skills` 的路径：

- `<isolated Desktop HOME>/.agents` 是符号链接时，中止准备并保留该链接及其链接目标中的全部内容。
- `<isolated Desktop HOME>/.agents` 是非目录路径时，中止准备并保留该路径及其内容。
- 目标不存在时继续准备。
- 目标是符号链接时只删除链接，不修改链接目标。
- 目标是普通文件或普通目录时中止准备并报告冲突路径，不删除内容。

该清理只作用于当前 Desktop Runtime 的隔离 HOME，不作用于真实 `$HOME/.agents/skills/`。

## 结构化配置改动

### `config/product-agent.json`

计划执行者必须把 `schemaVersion` 修改为 `2`，并新增以下对象：

```json
{
  "skills": {
    "sourceRootRelativePath": ".agents/skills",
    "environmentVariable": "HARNESS_COMFYUI_SKILL_DIR"
  }
}
```

该对象必须成为生产、Desktop 开发和 Web Host 调试三条启动链路的唯一 Repository Skills 路径来源。计划执行者不得为 schema version 1 增加兼容读取或静默迁移。

### `config/desktop-worktree.json`

计划执行者必须删除 `skillSourceRelativePath`。独立 worktree 的 Repository Skills 路径必须从当前 worktree 自己的 `config/product-agent.json` 解析，不得再由 Desktop 专用配置重复声明。

### `config/environment-overrides.json`

计划执行者必须新增以下 pass-through 声明：

```json
"HARNESS_COMFYUI_SKILL_DIR": {
  "passThrough": true,
  "valueType": "string"
}
```

## 逐文件实施清单

### 生产逻辑与配置

| 文件 | 计划执行者必须完成的修改 |
| --- | --- |
| `config/product-agent.json` | 把 `schemaVersion` 改为 `2`，并新增 `skills.sourceRootRelativePath` 和 `skills.environmentVariable`。 |
| `config/desktop-worktree.json` | 删除重复的 `skillSourceRelativePath`。 |
| `config/environment-overrides.json` | 增加 `HARNESS_COMFYUI_SKILL_DIR` pass-through 声明。 |
| `scripts/profile/product-agent-config.mjs` | 导出 `loadProductAgentConfiguration(repositoryRoot)`；该函数返回 `preset`、`repositorySkillsRoot` 和 `repositorySkillsEnvironmentVariable`，并拒绝“模块与接口”章节列出的无效配置和路径。 |
| `scripts/profile/agent-preset.mjs` | 调用 `loadProductAgentConfiguration(repositoryRoot)`；物化结果的相对文件路径集合必须只包含 `project-tool-visibility.mjs`、`project-system-prompt-visibility.mjs`、`harness-comfyui-cli-candidate/agent.cordis.yml` 和 `harness-comfyui-cli-candidate/preset.yml`。自动化测试必须以 `installRoot` 为基准比较上述四个物化文件的相对路径集合，不比较四个物化文件的内容。物化结果不得包含 `.agents/skills` 下的文件或符号链接。 |
| `agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml` | 把 `id: skill-filesystem` YAML 条目的 `config` 设置为 `providerName: harness-comfyui`、`includeDefaultRoots: false`、`watch: false` 和只包含 `!!js process.env.HARNESS_COMFYUI_SKILL_DIR` 的 `customSkillDirs`；把 `id: persona` YAML 条目的 `config.text` 改为“Preset scope 配置”章节规定的完整目标值。 |
| `scripts/desktop/worktree.mjs` | 作为 Desktop 开发环境和 Desktop 生产环境写入受管进程环境的唯一实现位置，停止创建项目 Skill 链接，设置 `HARNESS_COMFYUI_SKILL_DIR` 和 `DSH_AGENTS_HOME`；隔离 HOME 的 `.agents` 是符号链接或非目录路径时中止准备并保留该路径及其现有内容；`.agents` 是普通目录时，对其中的 `skills` 路径执行以下处理：缺失时继续、符号链接只删除链接、普通文件或普通目录时报错且保留内容。 |
| `scripts/production/process.mjs` | 作为 Web Host 调试环境写入受管进程环境的唯一实现位置，把当前 checkout 的 Repository Skills 绝对路径写入 `HARNESS_COMFYUI_SKILL_DIR`；该文件必须在合并调用者环境后覆盖同名值，并在 Repository Skills 根目录校验失败时阻止 Web Host 启动。 |

### 自动化测试与测试夹具

| 文件 | 计划执行者必须新增或修改的测试和测试夹具 |
| --- | --- |
| `tests/production/source-agent-preset.test.mjs` | 断言 `loadProductAgentConfiguration(repositoryRoot)` 返回的 `preset`、`repositorySkillsRoot` 和 `repositorySkillsEnvironmentVariable`；分别覆盖顶层值不是对象、顶层未知属性、`schemaVersion` 缺失或不是数值 `2`、`preset` 缺失属性、含未知属性、ID 字符非法、退役 ID 非数组或包含非字符串成员或包含非法成员或重复或包含当前 ID、`sharedFiles` 非数组或为空或包含非法 basename 或重复、`preset.sourceRootRelativePath` 不是字符串或为空或是绝对路径或经 `repositoryRoot` 解析后离开当前 checkout、`preset.installRootRelativePath` 不是字符串或为空或是绝对路径或经 `repositoryRoot` 解析后离开当前 checkout、`skills` 缺失或不是对象、`skills` 未知属性、两个 `skills` 属性缺失或不是字符串；对 `skills.sourceRootRelativePath` 覆盖绝对路径、经 `repositoryRoot` 解析后离开当前 checkout、目标不存在、目标是普通文件、目标本身是符号链接和目标 `realpath` 离开当前 checkout；拒绝不等于 `HARNESS_COMFYUI_SKILL_DIR` 的环境变量名称；分别构造 `config/environment-overrides.json` 缺少 `HARNESS_COMFYUI_SKILL_DIR`、该条目包含 `target`、`passThrough` 不等于 `true`、`valueType` 不等于 `"string"` 的输入，并断言 `loadProductAgentConfiguration(repositoryRoot)` 拒绝每种输入且错误指出 `environment override map.HARNESS_COMFYUI_SKILL_DIR` 和拒绝原因；断言 `providerName`、`includeDefaultRoots`、`watch` 和 `customSkillDirs` 的最终值；逐字段断言 `materializeSourceProductAgentPreset(repositoryRoot, dshHome)` 的返回值，并断言物化结果不包含 Repository Skills。 |
| `tests/production/desktop-worktree.test.mjs` | 分别在 `context.environmentFilePath` 指向的测试文件和传给 `prepareDesktopWorktree()` 的 `options.environment` 中设置冲突值；断言返回的 Desktop 子进程环境把当前 worktree 的 `.agents/skills` 写入 `HARNESS_COMFYUI_SKILL_DIR`，并断言测试环境文件内容未被修改、`DSH_AGENTS_HOME` 指向真实 `<HOME>/.agents`、准备过程不创建项目 Skill 链接。测试必须覆盖 `.agents` 父路径是符号链接或非目录路径，以及 `.agents/skills` 缺失、是符号链接、是普通文件或普通目录的分支；`.agents` 父路径是符号链接时，准备过程必须中止并保留该链接及其链接目标内容；`.agents` 父路径是非目录普通文件时，准备过程必须中止并保留该文件及其内容。测试还必须覆盖 Desktop 的 `status`、`logs` 和 `stop` 命令在 Repository Skills 配置无效时仍可执行，而 `start` 和 `restart` 命令拒绝启动。分别使用以下四种无效 Repository Skills 根路径：路径不存在、路径指向普通文件、根目录本身是符号链接、根目录本身不是符号链接但其 `realpath` 位于当前 worktree 外；断言 Desktop 开发启动在创建 Session 前失败，错误包含被拒绝路径和拒绝原因，并且未回退到真实 `$HOME/.agents/skills/`。 |
| `tests/production/desktop-production.test.mjs` | 分别在 `context.environmentFilePath` 指向的测试文件和传给 `startDesktopWorktree()` 的 `options.environment` 中设置冲突值；断言 Desktop 子进程环境中的 `HARNESS_COMFYUI_SKILL_DIR` 等于当前生产 checkout 的 `.agents/skills` 绝对路径，并断言测试环境文件内容未被修改且真实 `$HOME/.agents/skills` 不被用作 Repository Skills 来源。测试必须分别使用以下四种无效 Repository Skills 根路径：路径不存在、路径指向普通文件、根目录本身是符号链接、根目录本身不是符号链接但其 `realpath` 位于当前生产 checkout 外；断言 Desktop 生产启动在创建 Session 前失败，错误包含被拒绝路径和拒绝原因，并且未回退到真实 `$HOME/.agents/skills/`。 |
| `tests/production/source-production.test.mjs` | 断言 Web Host 把当前 checkout 的 `.agents/skills` 写入 `HARNESS_COMFYUI_SKILL_DIR`，覆盖调用者进程环境中的同名值，并删除调用者进程环境中其他名称以 `HARNESS_COMFYUI_` 开头的变量；分别使用以下四种无效 Repository Skills 根路径：路径不存在、路径指向普通文件、根目录本身是符号链接、根目录本身不是符号链接但其 `realpath` 位于当前 checkout 外；断言 Web Host 在启动前失败，错误包含被拒绝路径和拒绝原因，并且未回退到真实 `$HOME/.agents/skills/`。 |
| `tests/unit/config-loader.test.ts` | 覆盖 `HARNESS_COMFYUI_SKILL_DIR` pass-through 可被识别且不进入 `ConfigurationProfile`。 |
| `tests/contract/profile-skill-ownership.test.ts` | 断言 `profiles/comfyui-workbench/cordis.patch.yml`、`profiles/comfyui-workbench-development/cordis.patch.yml` 和仓库根目录 `cordis.patch.yml` 均不注册指向本仓库 `.agents/skills` 的 filesystem provider；断言产品 Preset 只暴露既有 `dsh-tool-skill` 提供的一个 `skill` Tool，不注册其他 Skill Tool；断言产品 Preset 的 `customSkillDirs` 只包含 `HARNESS_COMFYUI_SKILL_DIR` 表达式。 |
| `tests/fixtures/agent-presets/harness-comfyui-schema-control/agent.cordis.yml` | 让 `providerName`、`includeDefaultRoots`、`watch` 和 `customSkillDirs` 与产品 Preset 完全相同；该 fixture 的 `id: visibility` 条目保留 `config.mode: inherit-host-global`，产品 Preset 的同一条目使用 `config.mode: local-only`，其他 YAML 条目必须相同。 |
| `tests/fixtures/repository-skill-catalog.json` | 以 JSON 数组保存七个 Repository Skills 的预期 `name` 和 `description`；计划执行者必须逐项确认这些值等于对应 `SKILL.md` frontmatter 的当前值。该文件是 `tests/desktop/desktop-live.test.mjs` 的结构化测试预期。 |
| `tests/desktop/desktop-live.test.mjs` | 读取 `tests/fixtures/repository-skill-catalog.json`，不得用程序解析 `SKILL.md`。测试必须在仓库 `.local/` 下创建临时 `runtimeRoot`，并把传给 `startDesktopWorktree(context)` 的 `context.agentsHome` 设置为 `resolve(runtimeRoot, 'controlled-user-agents')`；`tests/production/desktop-production.test.mjs` 负责断言该属性成为 Desktop 子进程环境中的 `DSH_AGENTS_HOME`。Desktop live 测试必须先在临时外部 Workspace 中创建同名 Skill fixture，并在 `resolve(context.agentsHome, 'skills')` 下创建用户 Skill fixture，再启动 Desktop 并创建 Session。测试必须分别创建省略 `agentPreset` 的 Session、显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session，以及为非产品 Preset ID 集合中的每个 ID 显式设置 `agentPreset` 的 Session。测试必须先断言运行时 Preset ID 集合包含 `standard`，再断言前两个 `remote.session.create()` 结果的 `value.agentPreset` 均为 `harness-comfyui-cli-candidate`，并且两个 Session 的 `remote.skills.list()` 均返回测试 fixture 中的七个 Repository Skills。测试必须断言 `standard` Session 返回外部 Workspace 中同名且描述唯一的 Skill，前两个 Session 返回当前 checkout 中的同名 Skill。每个其他非产品 Preset Session 只需满足不返回名称和描述同时匹配测试 fixture 中 Repository Skill 的结果。测试还必须断言 `standard` Session 返回受控 `context.agentsHome` 中名称和描述均唯一的用户 Skill，前两个 Session 不返回该用户 Skill。测试不得写入或删除真实 `<HOME>/.agents`；测试完成后只删除临时外部 Workspace 和 `runtimeRoot`。 |

### 系统与领域文档

| 文件 | 计划执行者必须写明的最终合同 |
| --- | --- |
| `README.md` | Repository Skills 由省略 `agentPreset` 并默认采用 `harness-comfyui-cli-candidate` 的 Session，以及显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session 读取，不再要求真实全局链接。 |
| `CONTEXT.md` | 删除 `Global Skill Links`；定义 Preset-scoped Repository Skills 来源和 Session 可见性。 |
| `docs/adr/0012-harness-core-is-immutable.md` | 保留 Harness Core 不修改决定；把“从当前 Workspace 发现项目 Skill”改为“产品 Preset 通过原生 custom root 发现 Repository Skills”。 |
| `docs/agents/comfyui-workbench-preset-and-skill-development.md` | 记录 `customSkillDirs`、`includeDefaultRoots: false`、`HARNESS_COMFYUI_SKILL_DIR` 的来源，以及跨 Workspace Session 的可见性验收步骤。 |
| `docs/agents/worktree-development.md` | 用 `config/product-agent.json` 和进程环境检查替换 `config/desktop-worktree.json.skillSourceRelativePath` 与隔离 HOME 链接检查。 |
| `docs/system/architecture.md` | 记录 `config/product-agent.json`、`loadProductAgentConfiguration(repositoryRoot)`、`HARNESS_COMFYUI_SKILL_DIR`、产品 Preset filesystem provider 和所选 Session 之间的调用链，并删除真实全局链接陈述。 |
| `docs/system/configuration.md` | 定义 `config/product-agent.json` schema version 2 的 `skills` 对象，以及 `HARNESS_COMFYUI_SKILL_DIR` 的 pass-through 声明和覆盖顺序。 |
| `docs/system/directory-structure.md` | 记录 `scripts/profile/product-agent-config.mjs` 的文件位置、公开函数 `loadProductAgentConfiguration(repositoryRoot)`、输入参数，以及 `preset`、`repositorySkillsRoot` 和 `repositorySkillsEnvironmentVariable` 三个返回字段。 |
| `docs/system/startup.md` | 删除两个 Desktop Skill 链接步骤，记录 `DSH_AGENTS_HOME` 与受管项目 Skill 环境变量。 |
| `docs/system/testing.md` | 记录跨 Workspace 对比产品 Preset 与 `standard` Preset 的 Skill 名称和描述的方法，以及真实模型读取 Skill 和调用 CLI 的验收方法。 |

## 自动化验收清单

- [ ] `config/product-agent.json` 是三条启动链路唯一的 Repository Skills 相对路径来源。
- [ ] 产品 Agent 配置拒绝不是字符串、是空字符串、是绝对路径或经 `repositoryRoot` 解析后离开当前 checkout 的 `preset.sourceRootRelativePath` 和 `preset.installRootRelativePath`；配置还拒绝 `skills.sourceRootRelativePath` 是绝对路径、经 `repositoryRoot` 解析后离开当前 checkout、目标缺失、目标是普通文件、目标本身是符号链接或目标 `realpath` 离开当前 checkout。
- [ ] 产品 Agent 配置拒绝 `config/environment-overrides.json` 中缺失、名称不匹配、存在 `target` 或不是 string pass-through 的 Skill 环境变量声明。
- [ ] Desktop 开发环境把当前 worktree 的 `.agents/skills` 注入 `HARNESS_COMFYUI_SKILL_DIR`。
- [ ] Desktop 生产环境把当前生产 checkout 的 `.agents/skills` 注入 `HARNESS_COMFYUI_SKILL_DIR`。
- [ ] Web Host 调试环境把当前 worktree 的 `.agents/skills` 注入 `HARNESS_COMFYUI_SKILL_DIR`。
- [ ] Desktop 开发环境和 Desktop 生产环境的环境文件或调用者环境提供的同名值不能覆盖对应的受管路径。
- [ ] Web Host 调试环境的调用者进程环境提供的同名值不能覆盖受管路径；其他名称以 `HARNESS_COMFYUI_` 开头的调用者变量不会进入 Web Host 子进程环境。
- [ ] Desktop 准备不创建 `<isolated Desktop HOME>/.agents/skills` 项目链接。
- [ ] Desktop 准备只删除隔离 HOME 内普通 `.agents` 目录中的旧 `skills` 符号链接并保留链接目标；`.agents` 是符号链接或非目录路径时必须阻止准备过程并保留该路径及其现有内容，符号链接的外部目标也必须保持不变；`skills` 是普通文件或普通目录时也必须阻止准备过程并保留内容。
- [ ] 产品 Preset 的 Skill provider 使用 `providerName: harness-comfyui`、`includeDefaultRoots: false`、`watch: false` 和唯一 `customSkillDirs` 表达式。
- [ ] 调用 `materializeSourceProductAgentPreset(repositoryRoot, dshHome)` 时，`dshHome` 必须是一个已创建且没有任何子项的临时绝对目录；物化结果只包含 `project-tool-visibility.mjs`、`project-system-prompt-visibility.mjs`、`harness-comfyui-cli-candidate/agent.cordis.yml` 和 `harness-comfyui-cli-candidate/preset.yml`，并且不得包含 `.agents/skills` 下的文件或符号链接。
- [ ] `tests/contract/profile-skill-ownership.test.ts` 断言 `profiles/comfyui-workbench/cordis.patch.yml`、`profiles/comfyui-workbench-development/cordis.patch.yml` 和仓库根目录 `cordis.patch.yml` 均不注册指向本仓库 `.agents/skills` 的 filesystem provider，并断言产品 Preset 只暴露既有 `dsh-tool-skill` 提供的一个 `skill` Tool。
- [ ] 省略 `agentPreset` 的 Session 和显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session 对应的 `remote.session.create()` 结果均返回 `value.agentPreset: harness-comfyui-cli-candidate`，并且两个 Session 的 `remote.skills.list()` 均返回 `tests/fixtures/repository-skill-catalog.json` 中的七个 Repository Skills。
- [ ] 运行时每个非产品 Preset Session 的 Skill 列表均不包含名称和描述同时匹配测试 fixture 的 Repository Skill。
- [ ] `standard` Session 返回外部 Workspace 中同名且描述唯一的 Skill 和受控 `DSH_AGENTS_HOME` 中名称与描述均唯一的用户 Skill；两个产品 Preset Session 返回 Repository Skill 而不返回上述两个 fixture。

## 真实 Desktop 与真实模型验收清单

计划执行者必须在当前 worktree 运行 `pnpm dev:status` 并确认返回 `stopped`，再在前台终端运行 `pnpm dev:start`。计划执行者必须在第二个终端运行 `pnpm dev:status`，确认返回 `running`、Desktop PID 和移动桥接端口。计划执行者必须读取当前 worktree 的 `.local/desktop-development/desktop.pid`，确认其值等于上述 Desktop PID；使用操作系统进程查询确认该 PID 等于其进程组 ID，且启动命令包含当前 worktree 的 `.local/desktop-development/desktop-out`；使用操作系统 socket 查询列出该进程组所有监听端口，并确认其中包含 `pnpm dev:status` 返回的移动桥接端口。后续 `remote.*` 调用只能连接该移动桥接端口。连接完成后，计划执行者必须调用 `remote.agentPresets.list()` 取得运行时 Preset ID 集合，断言该集合包含 `standard` 和 `harness-comfyui-cli-candidate`，再从中计算非产品 Preset ID 集合：

- [ ] 计划执行者在当前 worktree 外创建一个不含 Repository Skills 的临时 Workspace。
- [ ] 计划执行者为非产品 Preset ID 集合中的每个 ID 创建一个 Session，并另外创建一个省略 `agentPreset` 的 Session 和一个显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session；后两个 `remote.session.create()` 结果的 `value.agentPreset` 均必须等于 `harness-comfyui-cli-candidate`。
- [ ] 上一项创建的两个产品 Preset Session 的 `remote.skills.list()` 必须分别返回七个 Repository Skills；每个 Session 中每个返回项的名称和 `description` 必须分别等于本仓库 `.agents/skills/<skill-name>/SKILL.md` frontmatter 中的 `name` 和 `description`。
- [ ] 计划执行者必须检查每个非产品 Preset Session 的 `remote.skills.list()` 返回项；任何返回项的名称和描述同时等于当前 checkout 中某个 Repository Skill 时，本项验收必须失败。
- [ ] 计划执行者必须在临时 Workspace 中运行 `screencapture -x local-image-reader-acceptance.png`，并把该非空 PNG 文件的绝对路径作为真实模型 Session 用户消息中明确提供的待读取图片路径。计划执行者必须在调用前记录 Harness“图片读取”设置当前命名配置的 Provider route 和模型 ID。上述两个产品 Preset Session 中至少一个 Session 的 Skill 执行者必须调用 `skill` Tool 读取 `local-image-reader/SKILL.md`，再调用前台 `bash` Tool 读取 `local-image-reader/references/image-inspection-cli.md`，最后调用前台 `bash` Tool 执行 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin`。`remote.session.follow()` 返回的同一 Session 事件记录必须包含：`tool/call.data.name: skill` 且其 `arguments` 指定 `local-image-reader`、与该 `callId` 对应且没有 `error` 的 `tool/result`、读取参考文档的 `tool/call` 及其无错误 `tool/result`、执行 CLI 的 `tool/call` 及其无错误 `tool/result`。CLI stdin 必须只包含 `file_path`，且 `file_path` 必须等于上述 PNG 文件的绝对路径。CLI Tool Result 的退出码必须为 `0`，stderr 必须为空，stdout 必须是一行 JSON；该 JSON 的 `provider` 和 `model` 必须等于调用前记录的图片读取命名配置值，`file_path` 必须等于上述 PNG 文件的绝对路径，`observation` 必须是包含非空白字符的字符串。
- [ ] 计划执行者必须在最终实施结果回复中记录执行真实模型验收时使用的 Workspace、Session ID、Preset、Agent Provider route、Agent 模型 ID、图片读取 Provider route、图片读取模型 ID、`local-image-reader/SKILL.md` 实际路径、`local-image-reader/references/image-inspection-cli.md` 实际路径、输入 PNG 文件绝对路径，以及上述三次 Tool Call 的事件序号、`callId`、arguments、CLI stdin、退出码、stdout 和 stderr；这些 Tool Call 记录必须全部来自同一次 `remote.session.follow()` 返回的同一 Session 事件流。
- [ ] 计划执行者执行 `pnpm dev:stop`，随后 `pnpm dev:status` 必须返回 `stopped`。

## 验证命令与执行顺序

计划执行者必须按以下顺序验证最终候选树：

1. 运行以下命令，退出码必须为 `0`：

   ```sh
   pnpm exec vitest run tests/production/source-agent-preset.test.mjs tests/production/desktop-worktree.test.mjs tests/production/desktop-production.test.mjs tests/production/source-production.test.mjs tests/unit/config-loader.test.ts tests/contract/profile-skill-ownership.test.ts tests/desktop/desktop-live.test.mjs --maxWorkers=1 --no-file-parallelism --testTimeout=120000
   ```

   计划执行者在实施期间新增或修改其他测试文件时，必须把每个文件的完整相对路径加入上述命令，并记录最终命令。`tests/fixtures/agent-presets/harness-comfyui-schema-control/agent.cordis.yml` 必须由引用该 fixture 的自动化测试覆盖，不作为独立测试文件运行。
2. 运行 `pnpm prod:test`，验证 Desktop 与 Web Host 生命周期分支；命令退出码必须为 `0`。
3. 逐项执行“真实 Desktop 与真实模型验收清单”的启动、进程组核对、端口核对、Session 可见性、Tool Call 事件流和 Desktop 停止检查；该章节每个验收项均必须通过。
4. 计划执行者必须以“执行主体与术语”章节指定的固定比较点并行启动两个独立 Reviewer：Standards Reviewer 检查候选树是否遵守仓库规范，Spec Reviewer 检查候选树是否完整实现本方案。任一 Reviewer 报告问题时，计划执行者必须修复全部问题，并按第 9 步从本节第 1 步重新开始验证。两个 Reviewer 均通过后，计划执行者才可以进入第 5 步。
5. 计划执行者必须分别为“系统与领域文档”表中列出的十个 Markdown 文件、本方案文件、`agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml` 和 `tests/fixtures/agent-presets/harness-comfyui-schema-control/agent.cordis.yml` 启动独立 Reviewer。计划执行者必须在每个任务中写出该目标文件内本次新增或修改文本的当前行号；本方案文件是新文件，因此对应 Reviewer 审计全文。每个 Reviewer 只允许读取一个目标文件，并且只审计任务列出的行号。每个审计任务必须逐条包含仓库根目录 `AGENTS.md` 的 `<语义类内容审计规范>`；计划执行者不得向 Reviewer 提供其他文档、源码、测试、实施判断或已有 Reviewer 结论。
6. 修复独立 Reviewer 报告的全部 FAIL 项，并对修改后的每份语义文档重新执行独立语义审计，直至全部通过。
7. 运行 `pnpm quality`。
8. 运行 `git diff --check`。
9. 任何失败修复只要修改候选树，计划执行者就必须从第 1 步重新开始验证。第 1 步至第 8 步全部通过后，计划执行者不得再修改候选树；计划执行者必须从该候选树创建 Git commit，然后向用户发送包含本方案全部验收记录的最终实施结果回复。

## 真实全局链接迁移

生产逻辑完成后不再需要以下七个真实全局项目链接：

- `$HOME/.agents/skills/anima-prompt-builder`
- `$HOME/.agents/skills/character-portrait-prompt-designer`
- `$HOME/.agents/skills/comfyui-generate`
- `$HOME/.agents/skills/comfyui-image-review`
- `$HOME/.agents/skills/krea2-anime-prompt-builder`
- `$HOME/.agents/skills/local-image-reader`
- `$HOME/.agents/skills/wai-sdxl-prompt-builder`

计划执行者在真实 Desktop 验收前必须逐项只读检查上述七个路径。目标缺失时，计划执行者继续验收；目标是符号链接且真实目标等于当前生产 checkout 的 `.agents/skills/<skill-name>` 时，计划执行者必须依据“已获得的授权”章节删除该链接。目标是普通文件、普通目录或指向其他位置的符号链接时，计划执行者不得删除目标，并必须停止实施并报告目标路径和检测到的路径类型。只有七个路径均不再解析到当前生产 checkout 的 Repository Skills 后，计划执行者才可以判定真实 Desktop 隔离验收通过。删除链接不会删除当前生产 checkout 中的 Skill 内容；链接可以通过重新创建恢复。

## 非本次目标

- 本次不修改七个 Repository Skills 的 `SKILL.md`、参考文档、脚本、资源或语义内容。
- 本次不修改 DeepSeek Harness、DSH Desktop、Cordis 或任何外部 package 的源码。
- 本次不改变其他 Workspace 自有 Skills 在 `standard` Preset 下的发现结果。
- 本次不实现配置热更新；产品配置变化必须在重启对应的 Desktop 进程或 Web Host 进程后生效。
- 本次功能设计不新增发布包附件，也不修改 GitHub Release 的附件发布方式。

## 已获得的授权

- 用户已确认目标语义：位于其他 Workspace、并通过系统默认值或用户显式选择最终采用 `ComfyUI工作台预设` 的 Session，可以使用本项目 Skill；系统不把本项目 Skill 复制或软链接到真实全局目录。
- 用户已批准计划执行者修改本方案“逐文件实施清单”列出的仓库文件、执行本方案的测试与 Desktop 验收，并在全部验收通过后创建包含这些修改的 Git commit。
- 用户已明确授权“真实全局链接迁移”；计划执行者可以按“真实全局链接迁移”章节删除经过目标校验的七个符号链接。
- 用户在获知真实 Agent 模型 Tool Call 验收未完成的具体原因后，已授权创建 v0.39.9 PR、合入 `main`、同步本地 `main`、创建 `v0.39.9` tag 与 GitHub Release，并把该版本部署到生产 checkout。

## 实施停止条件

真实全局链接预检不符合“真实全局链接迁移”章节的继续条件时，计划执行者必须停止实施并向用户报告阻断路径。当真实 Desktop Session 的 `remote.session.selectModel()` 返回 `ok: false`、`remote.session.prompt()` 返回 `ok: false`，或者 `remote.session.follow()` 返回的该 Session `turn/end.data.reason.kind` 不等于 `completed`，并且该失败导致“真实 Desktop 与真实模型验收清单”无法取得完整证据时，计划执行者必须执行 `pnpm dev:stop`，保留候选树并向用户报告 Workspace、Session ID、Preset ID、Provider route、模型 ID、上述接口返回值、`turn/end.data.reason` 和已经取得的验收证据。计划执行者只有取得用户对该具体失败的明确继续授权后，才可以继续提交、发布或部署。本次真实 Agent 模型 Tool Call 验收分别受 OpenCode Go 每周用量限制、DeepSeek API Key 缺失和 Contributor 地区限制阻断；用户获知这些结果后已明确授权继续创建 v0.39.9 PR、合入、发布和生产部署。任何尚未解决的自动化测试、`pnpm prod:test` 或独立语义审计失败都必须阻止 Git commit。
