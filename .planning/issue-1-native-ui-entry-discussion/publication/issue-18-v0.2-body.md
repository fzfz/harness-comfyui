## 当前实施基线与规格效力

计划执行者必须以 `main@4f5a14b1c1306080bdeb1e3a8dccb13ad435dd38`（tag `v0.2`）作为唯一代码基线。该基线使用当前源码、单一 `production` Configuration Profile和 `pnpm prod:*`六个生产进程命令，不包含 Release Artifact、安装、升级、回滚或 `package/skills`目录。

本正文整篇替代 Issue #18的旧正文，并替代提交 `5010c2ab832dd7c056ce94b384b92e715414b930`中仅属于 Issue #18的旧实施条款。计划执行者不得执行旧条款中的 Product Installation、Release Artifact、`HARNESS_COMFYUI_SKILL_DIR`、`customSkillDirs`、`package/skills`、`includeDefaultRoots: false → true`或 Client `remote`/`conversation` service要求。

本 Issue只改变 Issue #18负责的 Harness原生界面、ComfyUI工作台 Surface、原生输入能力、Skill菜单和轨迹界面。Issue #1、#4、#6、#10、#11、#13与 #14中与本 Issue上述责任冲突的旧 root、composer、Skill root和产品运行条款不能覆盖本正文。当前 `main`已经包含的 Run Repository、Saved Media、Product Agent固定模型和源码生产进程合同继续有效。

## 术语

- **Harness原生模式**：`@deepseek-ai/dsh-client-ui-layout@0.1.0-rc.8`提供的 AppFrame，以及原生 SidebarRoot、Workspace/Session浏览区、ConversationRoot、InputBar、Settings、ModelSelect、PermissionSelect和会话视图切换共同组成的界面。
- **ComfyUI工作台模式**：原生 AppFrame、SidebarRoot、ConversationRoot和 InputBar继续运行，项目只用现有工作台组件遮蔽四个业务内容占位的界面。
- **有效的项目 Skill**：`<Session cwd对应的最近Git项目根>/.agents/skills`直接包含的 `<name>.md`平铺文件，或单层 `<name>/SKILL.md`目录 bundle。Skill名称、必填 `name`与 `description`、可选调用布尔字段和目录深度必须满足 rc.8规则；`user-invocable`不能为 `false`；同名裁决后该 Skill必须成为胜出项。嵌套 `**/SKILL.md`不属于 rc.8支持的项目 Skill。
- **轨迹视图**：`@deepseek-ai/dsh-client-ui-trajectory@0.1.0-rc.8`向 `conversation.view`注册的 `id: "trajectory"`原生会话视图，中文标签为“轨迹”。

## 必须实现的目标

1. 计划执行者必须恢复完整 Harness原生模式，并在原生左侧栏固定提供“进入 ComfyUI 工作台”和“返回 Harness”双向入口。页面首次启动和刷新必须进入 Harness原生模式。用户进入 ComfyUI工作台模式后，页面必须保留 ConversationRoot顶部的“聊天/轨迹”视图切换；用户必须能够在 ComfyUI工作台 Session中打开原生轨迹视图并使用原生轨迹功能。
2. ComfyUI工作台模式必须保留原生 Settings入口和原生 ModelSelect。Settings入口必须继续由 `sidebar.settings`渲染；ModelSelect必须继续由原生 InputBar的 `conversation.input.model`占位渲染并修改当前 Session使用的模型选择。
3. ComfyUI工作台模式的原生 InputBar必须显示当前 Session的 PermissionSelect下拉控件。PermissionSelect必须读取当前 Session的 `permissions` projection，并通过原生 `/permission <preset>`命令修改当前 Session。Settings中的权限行只修改后续新 Session的默认权限，不能替代 InputBar中的当前 Session权限控件。
4. 用户在 ComfyUI工作台 Session的原生 InputBar输入 `/` 后，原生 Skill菜单必须列出全部有效的项目 Skill。用户选择候选后，原生 InputBar必须插入 `/<skill-name> `；用户发送消息后，Host `dsh-tool-skill`必须加载同一个 Skill并产生 `skill-invocation`记录。

## 最小改动实现方案

### 1. 恢复原生 AppFrame并停止项目接管原生父界面

计划执行者必须从根 `cordis.patch.yml`删除 `ui-layout`的 `disabled: true`覆盖，并保留 `harness-comfyui` Host plugin插入项。启用后的 `ui-layout`必须成为唯一 `root` occupant、唯一 `layout` service provider和唯一 Theme presenter。

计划执行者必须修改 `src/client/index.tsx`，删除项目 `root`注册、项目 `layout` service、项目 Theme projection、top-level `sidebar` occupant和 `conversation.composer.bar` occupant。`src/client/index.tsx`导出的 Cordis service合同必须精确为：

```ts
['slots', 'sessions', 'connection']
```

`src/client/index.tsx`不得增加未使用的 `remote`、`conversation`、`inputTriggers`或 `theme` service。`package.json.dsh.client.inject`继续保留当前锁定的 rc.8 Web Client模块装配；本 Issue不得安装依赖、升级依赖或新增 package dependency。

计划执行者必须删除停止使用的项目实现及其专属测试：

- `src/client/workbench/root.tsx`
- `src/client/workbench/layout-contract.ts`
- `src/client/workbench/theme-projection.ts`
- `src/client/workbench/composer-bar.tsx`
- `tests/unit/layout-contract.test.ts`
- `tests/unit/theme-projection.test.ts`
- `tests/unit/composer-bar.test.tsx`

计划执行者只能从 `src/client/styles.css`删除上述四个模块独占的 shell、header、固定列宽和项目 composer样式。计划执行者必须保留 `session-sidebar.tsx`、`session-header.tsx`、`conversation-view.tsx`和 `results-panel.tsx`仍然使用的工作台样式。

### 2. 用一个非持久 Surface控制器切换四个工作台内容占位

计划执行者必须新增一个 `src/client/workbench/surface-navigation.tsx`。该文件必须同时持有 Surface状态、左侧栏入口组件、工作台 occupant disposer和 `WorkbenchSessionBinding` disposer；项目不得为 Surface状态增加第二个模块、URL route、query参数、localStorage、Session字段或配置字段。

`surface-navigation.tsx`必须永久向 `sidebar.footer.action`注册一个具有项目唯一 id的入口。Harness原生模式的入口文案必须是“进入 ComfyUI 工作台”；ComfyUI工作台模式的入口文案必须是“返回 Harness”。

ComfyUI工作台模式只能使用 `priority: -10`动态注册以下四个项目 occupant：

1. `sidebar.workspaces` → 现有 `createSessionSidebar()`。
2. `conversation.session.header` → 现有 `createSessionHeader()`。
3. `conversation.view`中 `id: "chat"` → 现有 `createConversationView()`。
4. `details` → 现有 `createResultsPanel()`。

项目不得注册 `root`、top-level `sidebar`、top-level `conversation`、`conversation.composer.bar`、`sidebar.settings`、`conversation.input.model`或 `conversation.view#trajectory` occupant。该限制使 Harness原生 SidebarRoot、Settings、ConversationRoot、InputBar、ModelSelect、PermissionSelect和 `conversation.view#trajectory`在两个 Surface模式中持续挂载。

用户进入 ComfyUI工作台模式时，Surface控制器必须依次注册 `sidebar.workspaces`、`conversation.session.header`、`conversation.view#chat`和 `details`。四个 occupant全部注册成功后，Surface控制器才能启动唯一 `WorkbenchSessionBinding`。任一 occupant注册失败时，Surface控制器必须按逆序释放已经注册的 occupant；该失败分支不得启动 binding，也不得调用 `session.create`。binding启动抛错时，Surface控制器必须停止 binding并按逆序释放四个 occupant。两个失败分支都必须恢复 Harness原生模式，并通过 `surface-navigation.tsx`中的唯一结构化错误码与文案映射显示 `WORKBENCH_SURFACE_OPEN_FAILED` → `无法打开 ComfyUI 工作台，请查看产品日志。`。用户返回 Harness原生模式时，Surface控制器必须释放四个 occupant并停止 binding，但必须保留 Harness拥有的当前 Session和持久 Session记录。

Client plugin卸载时，Surface控制器必须释放左侧栏入口、四个动态 occupant、订阅和仍在运行的 binding。连续进入和返回十次不得产生重复 occupant、重复订阅、重复创建请求或重复 Workbench Session。

### 3. 只在工作台模式启动 Product Agent Session绑定

计划执行者必须复用 `src/client/workbench/workbench-session-binding.ts`和当前 `harness-comfyui` Preset选择规则。Harness原生模式不得调用 Workbench Session的 `session.create`或 `sessions.open()`。用户进入 ComfyUI工作台模式后，唯一 binding必须继续使用 Host `cwd`创建或选择 `agentPreset === "harness-comfyui"`的普通 Session。

用户在 `session.create`请求或 Session列表收敛期间返回 Harness原生模式时，Surface控制器必须中止未完成的创建请求，并取消列表订阅与收敛计时器。rc.8公开 `sessions.open(id)`是同步 `void`操作，不能中止；binding释放后，迟到的创建响应或列表通知不得再次调用 `sessions.open()`。binding释放前已经同步执行的 `sessions.open()`必须保留 Harness当前 Session。用户再次进入工作台时，binding必须优先复用 Harness Session列表中已经存在的项目 Session，不得复制、迁移、伪造或删除 Session。

### 4. 复用 rc.8原生 Settings、模型、权限、Skill和轨迹实现

计划执行者不得复制或改写 Harness Settings、ModelSelect、PermissionSelect、InputBar、Skill候选菜单、Skill provider、轨迹时间线或轨迹检查器。

`@deepseek-ai/dsh-base@0.1.0-rc.8`定义了宿主基础 `dsh-skill-filesystem`和 `dsh-tool-skill` row，但是 `@deepseek-ai/dsh-web-app@0.1.0-rc.8`明确把两个宿主 row设为 `disabled: true`，让 Agent Preset拥有本地 Skill发现和模型 Skill工具。当前 `agent-presets/harness-comfyui/agent.cordis.yml`只有 `persona`和 `harness-comfyui/agent`，没有旧 filesystem配置，也没有有效的 Preset scoped filesystem provider或 `dsh-tool-skill`。

计划执行者必须在 `agent-presets/harness-comfyui/agent.cordis.yml`增加且只增加以下两个 Preset scoped row：

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    includeDefaultRoots: true

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
```

计划执行者不得把该变更描述为“把 `includeDefaultRoots`从 `false`改为 `true`”，因为 v0.2基线没有旧字段。filesystem provider必须根据 Product Agent Session的 `cwd`扫描项目 `.dsh/skills`、项目 `.agents/skills`和用户 Skill roots。该配置不得增加 `customSkillDirs`、`HARNESS_COMFYUI_SKILL_DIR`、`bundledSkillDir`、第二个 provider或第二个 `dsh-tool-skill`。两个 package已经存在于锁定的 rc.8依赖闭包，本项不得修改 `package.json`或 lockfile。

当前 v0.2基线的 `@deepseek-ai/dsh-web-app@0.1.0-rc.8`已经装配 `ui-settings`、`ui-settings-general`、`ui-model-selection`、`ui-permission-presets`、`ui-input-trigger`、`ui-skill`和 `ui-trajectory`。计划执行者必须通过恢复这些原生模块的父界面和输入框来实现四项目标；计划执行者不得在项目 Client plugin新增代理 service或第二份状态。

项目 `.dsh/skills`的同名 Skill优先于项目 `.agents/skills`的同名 Skill。非法 Skill、`user-invocable: false` Skill和被同名胜出项遮蔽的 Skill不得出现在用户菜单中，因为这些条目不属于“有效的项目 Skill”。

`conversation.view#trajectory`必须继续由原生 `ui-trajectory`拥有。ComfyUI工作台中的轨迹视图必须继续提供按 Turn和 Step组织的 User、Assistant、Tool、Subtool与 Compaction记录、Overview时间线、Duration与实际时间切换、Turn/Call折叠、搜索、时间范围选择、缩放、平移、记录检查器和更早历史加载。项目不得只恢复“轨迹”标签而留下空视图或静态占位。

### 5. 同步当前源码运行门禁和文档

计划执行者必须修改 `scripts/production/health.mjs`：Harness Web boot graph必须包含 `@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-settings-general`、`@deepseek-ai/dsh-client-ui-model-selection`、`@deepseek-ai/dsh-client-ui-permission-presets`、`@deepseek-ai/dsh-client-ui-input-trigger`、`@deepseek-ai/dsh-client-ui-skill`、`@deepseek-ai/dsh-client-ui-trajectory`和 `harness-comfyui`。健康检查不得继续把 `ui-layout`视为禁止出现的 bundle。boot graph测试必须证明缺少上述任一必需模块都会使 `prod:health`失败。

计划执行者必须修改 `scripts/security/check-harness-boundary.mjs`及 `tests/security/check-harness-boundary.test.ts`，使根 composition允许且只允许 Host plugin插入项，不再要求 `ui-layout disabled`。Harness Core零修改、公开 package export和禁止 `@deepseek-ai/*/src/*`的边界必须保持不变。

计划执行者必须同步以下当前文档，使每份文档都描述同一个 owner关系和 v0.2源码生产流程：

- `CONTEXT.md`
- `docs/adr/0006-harness-owns-skill-invocation-policy.md`
- `docs/adr/0012-harness-core-is-immutable.md`
- `docs/system/architecture.md`
- `docs/system/directory-structure.md`
- `docs/v0.1/PRDS/02-three-column-chat.md`
- `docs/v0.1/PRDS/03-message-context-core.md`
- `docs/v0.1/PRDS/04-single-image-generation.md`
- `docs/v0.1/PRDS/12-prompt-skills.md`
- `docs/v0.1/PRDS/16-workbench-session-preset-binding.md`

ADR 0006必须把项目 composer接管改为原生 InputBar和原生 `ui-skill`路径。ADR 0012必须把项目 root/layout/theme决定改为原生 `ui-layout`和四个动态工作台 occupant。PRD 02必须删除固定 `294px/432px`项目 root合同并记录原生 AppFrame。PRD 16必须规定 binding只在 ComfyUI工作台模式运行。上述文档不得重新引入已经从 v0.2删除的安装、Artifact或 release-local Skill目录。

PRD 03只能把“项目 composer承载原生 overlay”的 owner描述改为“原生 InputBar承载输入能力”。PRD 04和 PRD 12只能把项目根目录 `skills/`、`includeDefaultRoots: false`和项目输入 overlay描述改为：项目 Skill目录是 `.agents/skills`，Product Agent Preset使用本 Issue新增的唯一 scoped filesystem provider（`includeDefaultRoots: true`）和唯一 `dsh-tool-skill`，原生 InputBar的 `/`菜单展示可由用户调用的项目 Skill。计划执行者不得借本 Issue修改这三份 PRD定义的业务功能或对应 GitHub Issue。同步完成后，当前 PRD不得继续声明项目 composer承载 Skill菜单、项目根目录 `skills/`是项目 Skill目录或 Product Agent Preset使用 `includeDefaultRoots: false`。

## 测试要求

计划执行者必须修改 `tests/unit/client-plugin.test.ts`与 `tests/unit/workbench-surface.test.tsx`，并按需要修改 `tests/unit/workbench-session-binding.test.ts`。测试必须覆盖成功、拒绝、清理和错误分支：

1. Client plugin只在 `slots`、`sessions`和 `connection`全部可用后激活一次。
2. Harness原生模式只保留永久 `sidebar.footer.action`入口，不注册四个工作台 occupant，也不启动 binding。
3. ComfyUI工作台模式精确注册四个工作台 occupant；`conversation.view#trajectory`继续由原生 occupant生效。
4. 四个 occupant中每一个注册失败时，Surface控制器都按逆序清理已完成注册、恢复 Harness原生模式，并且没有启动 binding或调用 `session.create`。
5. binding启动失败时，Surface控制器停止 binding、按逆序释放四个 occupant、恢复 Harness原生模式并显示 `WORKBENCH_SURFACE_OPEN_FAILED`。
6. 用户在创建请求或列表收敛期间返回 Harness时，创建请求信号被中止，列表订阅和收敛计时器被取消，迟到结果不能调用新的 `sessions.open()`。
7. 连续切换十次和 Client plugin卸载后不存在重复 occupant、订阅、binding或 Session。

计划执行者必须增加真实 rc.8组合测试。该组合测试必须创建一个临时 Git项目和 Product Agent Session，并在临时项目的 `.agents/skills`下准备：一个合法的 `<name>.md`平铺 Skill、一个名称不同且合法的 `<name>/SKILL.md`目录 bundle、一个 `disable-model-invocation: true`且 `user-invocable`未设置为 `false`的仅用户调用 Skill、一个 `user-invocable: false` Skill、一个 frontmatter非法 Skill，以及一个被 `.dsh/skills`同名 Skill遮蔽的 `.agents/skills` Skill。组合测试必须证明：

- `skill.list`返回的用户可调用候选集合精确包含两个普通合法 Skill、仅用户调用 Skill和 `.dsh/skills`同名胜出项。
- 原生 `/`菜单显示仅用户调用 Skill，并且使用原生仅用户调用标记。
- 原生 `/`菜单选择一个 `.agents/skills` Skill后插入 `/<skill-name> `。
- 用户显式选择仅用户调用 Skill并发送消息后，Session日志包含同名 `skill-invocation`，并且 Agent收到该 Skill的正文。
- Agent的模型自动调用 Skill目录不包含 `disable-model-invocation: true`的仅用户调用 Skill。
- 测试只使用 Product Agent Preset新增的唯一 scoped filesystem provider和唯一 `dsh-tool-skill`；用户没有手工挂载 provider，宿主全局 filesystem与 tool-skill row保持禁用。

权限测试必须证明用户从 InputBar依次选择 `read-only`和 `workspace-write`后，当前 Session的 `permissions.currentValue`分别收敛到所选值；用户选择 `danger-full-access`时必须先看到原生确认界面，确认后当前 Session才能切换。模型测试必须证明用户通过 InputBar ModelSelect提交后，当前 Session的 ModelSelection收敛到所选值。设置测试必须证明两个 Surface模式都能打开同一个原生 Settings面板。

轨迹测试必须使用包含 User、Assistant、Tool、Subtool和 Compaction记录的真实 Session，证明 ComfyUI工作台顶部显示“轨迹”入口，点击后显示原生记录台账和 Overview。测试必须分别操作 Duration视图、实际时间视图、Turn折叠、Call折叠、搜索、时间范围选择、滚轮缩放、右键平移、记录检查器和更早历史加载。记录检查器必须验证所选真实记录已经提供的 token用量、耗时、输入、输出和计时信息；上游记录没有提供的数据不能由项目伪造。用户从轨迹返回“聊天”后，项目 `conversation.view#chat`和原生 InputBar必须继续工作。

计划执行者必须执行：

- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:contract`
- `pnpm prod:test`
- `pnpm quality`

计划执行者不得通过安装新测试包完成上述测试。

## 验收清单

- [ ] `git merge-base --is-ancestor 4f5a14b1c1306080bdeb1e3a8dccb13ad435dd38 HEAD`成功，并且实现没有恢复 v0.1安装或 Artifact体系。
- [ ] 页面首次启动和刷新都进入 Harness原生模式，且没有创建或打开 Workbench Session。
- [ ] 原生左侧栏入口可以进入 ComfyUI工作台，也可以返回 Harness原生模式。
- [ ] 两个 Surface模式都保留原生 New Session、侧栏折叠和 Settings入口。
- [ ] ComfyUI工作台使用原生 InputBar，并保留原生 ModelSelect、PermissionSelect、图片附件、发送状态和 `/`菜单。
- [ ] PermissionSelect可以修改当前 Session的 `read-only`、`workspace-write`和经过确认的 `danger-full-access`。
- [ ] 临时项目 `.agents/skills`中的普通合法 Skill和仅用户调用 Skill都出现在原生 `/`菜单中；仅用户调用 Skill显示原生标记，选择并发送后产生真实 `skill-invocation`，并且不进入 Agent的模型自动调用 Skill目录。
- [ ] ComfyUI工作台顶部保留“聊天/轨迹”入口；原生轨迹台账包含 User、Assistant、Tool、Subtool与 Compaction记录，Overview的 Duration与实际时间视图、Turn/Call折叠、搜索、时间范围选择、滚轮缩放、右键平移、记录检查器和更早历史加载分别通过验收。
- [ ] 页面始终只有一个 root、一个 `layout` service provider和一个 Theme presenter；项目不再注册 root、layout、Theme或 composer。
- [ ] 连续切换十次、切换中途取消和 Client卸载全部通过清理测试。
- [ ] `pnpm prod:start`启动当前源码后，另一个终端中的 `pnpm prod:status`、`pnpm prod:health`和 `pnpm prod:logs`成功；浏览器验收结束后，`pnpm prod:stop`清理进程状态和监听端口。
- [ ] 独立视觉验收者在 `1440×1000`保存 Harness原生模式、ComfyUI工作台模式、Settings、ModelSelect、PermissionSelect、`/` Skill菜单和轨迹视图证据，并给出 PASS。
- [ ] 独立语义审核者逐项核对本 Issue要求同步的 Markdown文档，并确认每个主体、动作、对象、Owner和产品运行命令都与实现一致。

## 非本次目标

- 本 Issue不实现 Issue #4负责的 Message Context reference、Issue #6负责的 Execution Route reference，也不修改两张 Issue的正文。
- 本 Issue不实现 ComfyUI生成 Tool、Run Repository业务逻辑、任务中心、Saved Media、Prompt Skill或 LoRA Skill。
- 本 Issue不增加移动端布局、窄屏单面板、Surface URL、Surface状态持久化或新的导航框架。
- 本 Issue不修改 DeepSeek Harness package、不导入 `@deepseek-ai/*/src/*`、不复制上游 React组件、不增加 dependency、不升级 rc.8版本。
- 本 Issue不恢复 v0.1的 Release Artifact、安装、升级、回滚、release-smoke、多 Configuration Profile或 `package/skills`体系。
- 本 Issue不修改 GitHub Issue #1、#4、#6、#10、#11、#13或 #14。

## 已获得的授权

- 用户已经授权 Issue #18按 `main@4f5a14b1c1306080bdeb1e3a8dccb13ad435dd38`的 v0.2基线整篇重写。
- 用户已经授权 Issue #18包含最初四项需求，并把 Harness顶部原生“轨迹”入口和原生轨迹功能纳入 ComfyUI工作台验收。
- 用户已经要求计划执行者采用最小改动方案，禁止过度设计和过度工程化；本 Issue因此只新增一个 Surface控制文件、只给 Product Agent Preset增加当前缺失的两个 Skill row，并复用现有四个工作台组件和 rc.8原生 UI/Skill能力。
- 用户没有授权本次 Issue发布任务修改产品代码、其他 GitHub Issue、依赖版本或 DeepSeek Harness package；产品代码、文档和测试由后续领取 Issue #18的计划执行者在独立执行任务中修改。
