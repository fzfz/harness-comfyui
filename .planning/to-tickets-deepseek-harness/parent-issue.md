## 产品目标

当前仓库必须交付一个能够由用户下载、安装和日常使用的 DeepSeek Harness ComfyUI 工作台。浏览器用户必须能够在一个 Harness Session 中完成普通流式聊天、添加结构化 Message Context、分别调用迁移的Prompt Skill、迁移的LoRA调整Skill和独立ComfyUI生成Skill、发起零个或多个 ComfyUI Generation Run、查看和取消异步任务、浏览 Saved Media，并下载每个运行保存的本次实际 Workflow JSON。

当前仓库还必须交付同一产品的安装、启动、进程状态、健康检查、日志、重启、停止、升级和回滚程序。项目开发者使用这些程序验证每张产品 Issue；GitHub Release 的用户使用同一程序管理自己的 installation。本项目负责实现、测试和发布程序，不替用户操作或维护版本发布后的 installation。

## 原型与 PRD

以下文件定义工作台的产品界面与交互：

- `prototype/generation-workbench/index.html`
- `prototype/generation-workbench/app.js`
- `prototype/generation-workbench/styles.css`
- `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`
- `prototype/generation-workbench/tests/prototype-contract.test.mjs`

Issues #3–#14 必须在真实 DeepSeek Harness Host/Client 中 1:1 实现和验收对应原型的桌面区域。1:1 包含功能、信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、badge、控件样式、全部用户文案、点击、输入、搜索、筛选、选择、删除、发送、切换、分页、定位、取消、打开、下载、键盘焦点、Modal 开关、焦点返回，以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本。计划执行者不得以功能等价、未明确列出的Harness默认控件或自动化测试通过替代原型已经展示的桌面设计。

原型没有展示的功能与后端行为必须按 `docs/v0.1/PRDS/` 中对应编号的 PRD 实现。当前只有两个已确认的可见例外：Issue #6 增加“提示词条目”导航；ComfyUI Instance 从 Message Context 候选移到独立 Execution Route。其他可见差异必须判定为 FAIL。

Issue #3 必须创建唯一 `tests/visual/prototype-fidelity-viewports.json`，精确包含一个桌面viewport：`1440×1000`。Issues #3–#14 的每个可见原型区域必须在该尺寸保存原型与真实产品的成对截图或录像。独立视觉审核者不得是该 Issue 的实现者；实现者自检和自动化测试不能替代独立 PASS。

## v0.82.2 源数据消费合同（本父 Issue 的最新规范）

本节优先于本文件其他仍保留旧 source wrapper 术语的段落；唯一结构化字段来源是 `config/source-contract-v0.82.2.json`，解释文档是 `docs/v0.1/source-contract-v0.82.2.md`。

Harness Installation 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`。这两个值是 Harness-owned pin，不是 v0.82.2 live discovery 或目标响应字段。Catalog discovery 是顶层字段为 `openapi`、`info`、`x-imagegen-media-origin`、`paths`、`components` 的 OpenAPI 3.1 对象；Source discovery 是 `status`、`message`、`results`、`page`、`page_size`、`total_count` 成功 envelope，OpenAPI 位于 `results[0]`。

两个 CLI 只验证非空、严格 UTF-8 和单个 JSON 值并原始透传；Harness adapter 负责统一成功/错误 envelope、operation metadata 和业务 Schema 校验。Catalog adapter 将 `results` 映射为内部 `items`，从 Installation 与 manifest 补充内部 `source_release_version`、`kind` 和 `result_contract_id`。Source TemplateBundle 的 `expected_output_node_ids_json` 必须是非空数组；`null`、空数组、缺失或非法值返回 `SOURCE_TEMPLATE_UNAVAILABLE`，不得由 Harness 推导或补默认值。

所有 Ticket 正文中关于“discovery 顶层必须包含 `contract_id`/`contract_version`/`source_release_version`”“CLI 负责业务响应 Schema 校验”“Source 直接返回闭合 `TemplateBundle`”的旧句子均以本节和两个 v0.82.2 合同文件为准；执行者不得自行选择兼容策略。

## 产品安装与运行基线

Issue #2 必须一次性交付 Release Artifact 内的 `harness-comfyui` CLI。CLI 固定提供 `install`、`preflight`、`start`、`stop`、`restart`、`status`、`health`、`logs`、`upgrade` 和 `rollback` 十个子命令。现有 `.github/workflows/deploy.yml`、`scripts/deploy/`、`tests/deploy/`、`config/profiles/production.json` 和 `deploy:*` package scripts必须保留，并扩展为这套真实产品管理程序与完整生命周期测试。

Release Artifact 必须包含 deploy modules、profile materialize/start helpers、`profiles/comfyui-workbench/` 模板，以及精确锁定并已审核的 `deployment/runtime/package.json`、`deployment/runtime/pnpm-lock.yaml` 和 `deployment/runtime/pnpm-workspace.yaml`。根 `package.json` 是三个 Harness runtime 精确版本的唯一来源；runtime manifest 必须由根 manifest 确定性生成，root/runtime 两份 lock、override、`strictDepBuilds` 和 `allowBuilds` 必须由 frozen install 前的结构化门禁共同校验。安装程序必须把 `@deepseek-ai/dsh@0.1.0-rc.8`、`@deepseek-ai/dsh-base@0.1.0-rc.8` 和 `@deepseek-ai/dsh-web-app@0.1.0-rc.8` 的冻结闭包装入每个 release 自己的 `harness-runtime/`，并且只调用该 release 的 `harness-runtime/node_modules/.bin/dsh`。安装后运行不得读取源码 worktree、原 DeepSeek Harness checkout、全局 `dsh`、`prototype/` 或测试 fixture。

首次安装命令固定为：

`npm exec --yes --package=<absolute-tarball> -- harness-comfyui install --installation <absolute-installation-json> --artifact <absolute-tarball>`

首次安装后的全部命令必须调用 `<installation-root>/bin/harness-comfyui`。一个 installation 固定包含：

```text
<root>/bin/harness-comfyui
<root>/releases/<version>/package/
<root>/releases/<version>/harness-runtime/
<root>/releases/<version>/dsh-home/
<root>/shared/data/
<root>/shared/runs/
<root>/shared/saved-media/
<root>/shared/logs/
<root>/state/active-release.json
<root>/state/process.json
<root>/state/last-health.json
<root>/state/operations.jsonl
```

Issues #2–#14、#16与#17必须分别在自己的Git worktree中运行。Issue #2在自己的worktree完成基线实现与验收；Issue #16补齐项目Agent Preset基线；Issue #3完成现有三列工作台；Issue #17在#3合入后补齐项目Session绑定；Issues #4–#14继续产品功能。每张实现Issue必须使用自己的`runtime/production/installation.json`、`production` Configuration Profile、当前worktree构建的tarball和Issue #2交付的同一产品CLI，完成功能后执行status、health、logs和浏览器验收，最后执行stop并确认PID state与监听端口清理。后续Issue不得实现第二套安装、启动、进程管理、health、日志、升级、回滚或目录布局脚本。Issue #15只发布Issue #14已验收的同一Release Artifact，不创建installation，也不调用lifecycle子命令。

`installation.json`是产品CLI的唯一运行输入。CLI必须把其中的Configuration Profile、共享目录、Run Repository、默认ComfyUI instance、Catalog CLI、Source CLI、server host和server port转换为`config/environment-overrides.json`已定义的固定`HARNESS_COMFYUI_*`环境。CLI必须忽略ambient同名值。`source.contractId`固定为`imagegen-source-contract`，`source.sourceReleaseVersion`固定为`0.82.2`；preflight必须分别执行两个CLI的`--discovery-json`并按 v0.82.2 Catalog 裸 OpenAPI 与 Source 成功 envelope 校验，identity 只来自 Installation pin。`production` Configuration Profile 表示与用户安装相同的产品运行配置形状，不表示本项目连接、部署或维护用户的实际 installation。

## Harness 核心零改动与公共插件接口

当前项目只能通过主工作树实际安装的DeepSeek Harness `0.1.0-rc.8` public plugin seams实现UI与功能。调研依据固定为tag `dsh-v0.1.0-rc.8` committed tree `141eb6fef83422698aef7a981029e843e8161534`的已提交package metadata、public exports、类型、实现与测试，以及主工作树直接Harness package的真实安装路径。`docs/adr/0012-harness-core-is-immutable.md`记录已接受决定；Issues #2–#15正文的“公共插件接口”段分别直接列出所属产品功能使用的接口。Issue执行者只落地所属Issue已经列出的接口，不继续调查seam，也不设计替代方案。

Harness Core固定包括Client module loader、Cordis生命周期、slot仲裁、Session、AgentLoop、Host Skill发现与调用校验、Tool execution identity、持久Session日志和Jobs registry。`ui-layout`、`ui-conversation`、`ui-input-trigger`、`ui-skill`和`ui-tool`是上游随包提供的插件，不是不可替换的Harness Core；本产品保留ConversationRoot、`conversation.input.overlay`以及`ui-input-trigger`与`ui-skill`拥有的`/` Skill选择交互。项目不得修改DeepSeek Harness checkout或installation中的`node_modules/@deepseek-ai`，不得使用`patch-package`、`pnpm.patchedDependencies`、本地fork、模块alias、Loader hook、源码复制、`@deepseek-ai/*/src/*` import或DOM monkey patch，也不得重写上述Harness Core权威。

当前项目的root `cordis.patch.yml`只允许通过`package.json`的`dsh.bundle.patch` public composition完成两项配置：按精确Loader row id `ui-layout`将上游随附布局插件设置为`disabled: true`，以及插入当前项目Host plugin Loader row。`profiles/comfyui-workbench/cordis.patch.yml`由Issue #16通过同一公开patch机制把`agent-presets` config固定为`default: harness-comfyui`与`includeUserRoot: true`；rc.8启动器继续拥有随包system root，并追加当前release的`DSH_HOME/.agent-presets` user root。Issue #16必须把artifact中的项目Preset复制到该release-local user root，并让产品CLI固定`DSH_TOOLS_MODE=native`；项目不得修改`@deepseek-ai/dsh`包目录或伪造第二个system root。这些文件不得patch Harness package。Client plugin只通过`exports["./client"]`与`dsh.client` metadata进入Web composition。Host Remote只通过`exports["./typert"]`被Typert loader发现；项目Client plugin只调用`ctx.remote.$mount(harnessComfyuiRemote)`挂载`exports["./remote"]` contribution。

Issue #16必须把Preset安装证据与运行时roster证据分开。`preflight`在Host未启动时只检查tarball中的`config/product-agent.json`、两个Preset文件、`lib/agent.js`导出与精确Profile patch，不调用`agentPreset.list`。停止态`status`只检查active release、release-local Preset/Skill路径、process state与端口，不调用`agentPreset.list`，也不声称已取得运行时roster。running `status`必须在process state、PID identity与端口均证明受管Host运行后调用rc.8公开`agentPreset.list`；`health`只有在自己的process检查通过后才能调用该接口。process state缺失、PID identity不匹配、端口未监听或端口由非受管进程占用时不得发送该RPC。在线成功路径验证唯一`harness-comfyui`记录的`trust === "user"`、`isDefault === true`与`broken === undefined`。rc.8 roster不返回Preset路径；`health.agentPresetInstallation`保存固定release-relative路径、两个文件名与Skill路径，`health.agentPresetRoster`只保存公开接口证明的ID、trust、default与状态，不得包含路径。

`package.json.dsh.client.inject`只声明Client package加载依赖，不是Cordis service生命周期合同。Issue #2必须让`src/client/index.tsx`导出`apply`与精确service `inject: ["slots", "sessions", "remote"]`；Issue #3必须把该module export精确扩展为`["slots", "sessions", "remote", "theme", "inputTriggers"]`；Ticket 16对应的附加Issue再为公开`session.create`路径增加`connection`。其他Issue不得增加Client service依赖。composition测试必须对实际module export逐项撤出provider，证明plugin保持pending且没有副作用，并在provider恢复后只激活一次。

Issue #2必须创建唯一`src/host/tools/register-project-tools.ts`。该模块是产品代码中唯一直接调用Harness公开`ctx.tools.register()`的位置。Issue #16必须创建`src/agent/plugin.ts`，让它成为唯一调用`registerProjectTools(ctx, definitions)`的位置，并从`src/host/plugin.ts`删除Host root调用；Agent plugin必须在`harness-comfyui` standing Preset scope直接注册项目Tool，不得调用`ctx.tools.restrict()`。rc.8把同一Preset composition中的`dsh-tool-skill`与项目Agent plugin挂在同一个standing Preset layer，目标Agent从子scope继承该layer；restriction会同时过滤原生`skill`与项目Tool。rc.8 Web composition已禁用Host plane的model-facing Tool rows，项目Host plugin不得注册model-facing Tool，真实`comfyui-workbench` Web composition加载后的Host-global `ctx.tools.schemas()`必须严格等于`[]`。Issues #4、#5和#6分别使用公开`defineTool()`构造首批Catalog Tool、`generate_with_comfyui`和完整十个Catalog Tool，并把全部定义交给同一个registry。registry必须验证非空且唯一的名称、非空description和闭合输入/输出schema，按稳定顺序注册，任一失败时反向注销本次已注册Tool，Agent plugin卸载时反向注销全部项目Tool。项目不得修改Harness Tool runtime、创建第二个registry或在其他产品文件直接调用`ctx.tools.register()`。

Issue #3必须在项目bundle中停用上游`ui-layout` Loader row，并由项目Client plugin向内建`root` slot注册唯一root occupant。项目root必须先声明并渲染rc.8标准`sidebar`、`conversation`、`details`与`shell.overlay`四个child slot，再通过公开Cordis service机制提供符合`ILayout`的`toggleSidebar()`、`openDetails()`与`closeDetails()`；桌面`1440×1000`列宽固定为`294px minmax(0, 1fr) 432px`。项目必须继续运行`ui-conversation`、`ui-input-trigger`和`ui-skill`：ConversationRoot注册到项目声明的`conversation` slot并继续声明、渲染`conversation.input.overlay`，原生MenuView继续注册到该overlay。项目通过公开child slot实现原型内容；项目composer必须渲染owner传入的overlay，并只使用公开`useInput`、`inputActions`和`ctx.inputTriggers.sessionOf(sessionScope)`连接textarea。项目不得运行第二个root、调用SkillsApi或实现第二套Skill菜单。

Issue #3必须创建唯一`src/client/workbench/layout-contract.ts`，固定打开左列294、折叠左列56、打开右列432以及两个panel默认打开。项目`ILayout` service必须让`toggleSidebar()`在294与56之间切换、`openDetails()`写入432、`closeDetails()`写入0；root必须把实际左列状态作为公开`SidebarOwnerProps`传给`sidebar` occupant，并把`shell.overlay`渲染在三个滚动列之外。本版本不实现拖拽改宽、viewport监听、自动折叠或移动端断点。

停用`ui-layout`同时移除了该随附插件的Theme presenter。Issue #3必须把`@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8`加入直接devDependency、peerDependency与`dsh.client.inject`。项目桌面Shell初始化时必须调用公开`ctx.theme.getTheme()`取得`ThemeSnapshot`，并通过公开`ctx.on("theme/change", projectTheme)`持续接收快照；`projectTheme`把`active.colorScheme`写入`document.documentElement.style.colorScheme`和`document.body`的`data-ds-dark-theme`，把`active.tokens`逐项写入`document.body.style`。dispose时只清理本模块写入的attribute、style和token。该限定模块不得使用`querySelector`、移动上游DOM或改写Harness组件。

原型只规定输入区的可见结构、Message Context、附件预览与发送行为，没有规定项目必须使用或修改Harness默认composer状态。项目Workbench按Session保存发送前的正文、`ContextRef[]`、安全Execution Route、浏览器`File`和preview object URL。发送时项目Context resolver按chip顺序读取真实快照，把正文、`generation-context.v1` blocks和显式实例对应的独立`generation-route.v1` block放入一个text `PromptContentPart`，把每个File编码为公开image `PromptContentPart`，然后只调用一次当前Session的`SessionFace.prompt(parts, 'queue')`。默认实例不写route block；显式实例不形成ContextRef、chip或Context计数。发送按钮与Enter都固定使用`queue`，本版本不实现Steer手势。解析、编码或调用失败时保留本次UI数据；成功后只清除本次发送快照并回收对应object URL。Harness Host attachment store、原生`user/message`、AgentLoop、Tool pipeline和Session replay继续是唯一持久与运行权威。

项目中列必须保留ConversationRoot和它声明的`conversation.input.overlay`；项目`conversation.composer.bar` occupant必须渲染该overlay，使`ui-input-trigger`与`ui-skill`拥有的原生菜单继续工作。用户在输入框键入`/`后，由Harness原生Skill菜单显示当前Session可调用Skill；用户选择后，由Harness把普通`/<skill-name> `文本写入输入框。项目不得调用SkillsApi实现第二套菜单或保存Skill选择状态。Issue #16必须让`harness-comfyui` Preset挂载唯一项目`dsh-skill-filesystem` provider，固定`includeDefaultRoots: false`并只读取active release的`package/skills`；项目Skill不得复制到`DSH_HOME/skills`。Host `dsh-tool-skill`在执行前按当前Session的cwd与preset scope重新发现并校验Skill。

| GitHub Issue | 必须使用的 Harness public interfaces |
|---|---|
| #2 | `dsh.bundle.patch`、`exports[.]`、`exports[./client]`、`exports[./typert]`、`exports[./remote]`、Client module discovery、Typert loader、`@deepseek-ai/dsh-tools`公开Tool定义类型与`ctx.tools.register()` |
| #3 | `dsh.bundle.patch`按row id停用`ui-layout`、内建`root`、`ctx.slots.register()`、root声明的`sidebar`/`conversation`/`details`/`shell.overlay`、公开`ILayout`与`ctx.reflect.provide("layout", layoutService)`、公开`ThemeSnapshot`与`theme/change`、ConversationRoot、`conversation.session.header`、`conversation.view`的`chat` occupant、`conversation.composer.bar`、`conversation.input.overlay`、`useInput`、`inputActions`、`ctx.inputTriggers.sessionOf(sessionScope)`、`ctx.sessions`、`ConversationSnapshot`与`SessionFace.prompt(parts, 'queue')` |
| #4 | 项目Workbench输入区、Harness `Modal`、项目Context resolver、公开`PromptContentPart[]`、`SessionFace.prompt(parts, 'queue')`、原生`conversation.input.overlay`与`ui-input-trigger`/`ui-skill`贡献、项目Remote、`generation-context.v1`、`defineTool()`与统一`registerProjectTools()`注册的首批三个Catalog Tool |
| #5 | release-local `skills/comfyui-generate/`、既有Skill filesystem provider、Harness原生`/` Skill菜单、Host Skill校验、`defineTool()`、统一`registerProjectTools()`、`ToolRunContext.callId`、`defineTool().output.presentationMeta()`、公开`ConversationSnapshot`与`ToolResultNode.meta`、`agent.session.events`、`ctx.workspaceRegistry.list`、`ctx.jobs`、`ctx.webServer.register`和项目Remote |
| #6 | 项目Workbench输入区、十个Catalog Tool的唯一manifest、`defineTool()`、统一`registerProjectTools()`、Catalog CLI adapter、Modal、Context resolver、Execution Route、`SessionFace.prompt(parts, 'queue')`与项目Remote |
| #7 | 原生Session scope、`ConversationSnapshot`、`ChatNode.location.turn.turn`、项目`conversation.view`的`chat` occupant、项目`details` occupant与项目Remote |
| #8 | `ctx.jobs`、项目 Run projection Remote与条件轮询；不增加 `generation.run.changed` |
| #9 | 项目`details` occupant、项目Remote、`SessionFace.prompt(parts, 'queue')`与Harness AgentLoop产生的新Tool Call |
| #10 | 项目sidebar occupant中的任务入口、Harness `Modal`与项目task list/cancel Remote |
| #11 | 项目details occupant、项目sidebar occupant中的媒体入口、Harness `Modal`、项目media Remote与Host prefix route |
| #12 | 项目`details` occupant、项目media Remote与Host prefix route |
| #13 | release-local`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`与`skills/lora-adjustment/`、既有`dsh-skill-filesystem` provider、Harness原生`/` Skill菜单、Host Skill校验，以及统一registry已经注册的`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`、`query_semantic_prompt_terms`和`query_semantic_loras` |
| #14 | #2–#13 已冻结的全部 public interfaces；tarball不得包含 Harness core patch/fork/vendor/source path |
| #15 | 只发布 #14 已验收的同一 artifact；不修改代码、依赖或 Harness boundary |
| #16 | `@deepseek-ai/dsh-agent-presets`公开Profile配置、release-local`DSH_HOME/.agent-presets` user root、standing Preset Cordis composition、唯一`registerProjectTools()`、`ctx.tools.schemas(scope)`、`dsh-skill-filesystem`的`includeDefaultRoots`/`customSkillDirs`、`dsh-tool-skill`与运行中Host的`agentPreset.list` |
| #17 | `ctx.connection.api.sessions.create(payload, signal)`、`ctx.connection.hostDescription`、`ctx.sessions.list.getSnapshot()/subscribe()`、`ctx.sessions.open(sessionId)`与`SessionSummary.agentPreset` |

Message Context多选确认必须保持Modal打开并阻止输入区交互。用户确认后，项目一次性把`pendingDialogRefs`按原型顺序写入当前Session的临时`ContextRef[]`并关闭Modal。发送时项目Context resolver按该顺序生成`generation-context.v1`文本block；项目Workbench的user-message renderer只解析消息末尾通过固定schema的完整block，并在Session重放时显示正文和原型折叠快照。

用户显式选择`comfyui-generate`后，Harness保存`source.kind: "skill-invocation"`与`source.name: "comfyui-generate"`的原生Context消息。Generation Tool Host adapter必须先按`exec.callId`唯一找到原生`tool/call`及其数字turn和`seq`，再找到同一数字turn且位于Tool Call之前的最近唯一`turn/start`，并且只在`turn/start.seq < event.seq < tool/call.seq`内核对该Context；缺失、歧义或只在上一数字turn存在时返回`GENERATION_SKILL_INVOCATION_REQUIRED`并且不得创建Run。AgentLoop产生使用同一`callId`配对的原生Tool Call与Tool Result；Tool Result的`presentationMeta`固定提供`harness-comfyui-generation-run` v1与`run_id`。公开`ToolResultNode.call`存在时，Client校验`call.name`与meta；历史窗口中的`call === null`时，Client使用公开`callId`、当前Session和meta `run_id`调用项目`GenerationRuns.resolveToolResultLink()`，由Host核对持久`(Workspace, Session, call_id) -> run_id`映射后才建立链接。右列不从Skill文本、Agent文本、Tool标题或Tool Result文字猜测链接。

rc.8 public forwarded-event allowlist不包含项目Run事件。Client必须实现唯一`GenerationRunProjectionStore`：中列Generation Tool行与右列运行卡读取同一`run_id`的同一`GenerationRunSnapshot`。Client遇到合法Tool Result、打开results panel、切换Session、切换数字Chat Turn或取消后立即调用项目unary Remote；页面可见且中列可见Tool行或右列可见卡片引用非终态Run时，唯一协调器按Remote response的`refreshAfterMs`继续查询。两处同时可见时共享一个计时器和每周期一次Remote查询；关闭右列但中列Tool行仍可见时继续刷新；页面隐藏、两处都没有可见消费者或全部终态时停止。Run Repository是唯一状态权威来源。

本次规划审计已经把rc.8精确public interface直接写入Issues #2–#17各自正文。Issue #3的桌面列宽已经通过公开bundle row覆盖、内建root slot、标准child slot、公开`ILayout` service、ConversationRoot和原生input overlay形成可执行设计；该Issue不再等待用户决定。Issue #16与#17已经补齐项目Agent Preset、Agent-scope Tool/Skill和Workbench Session绑定。Issues #2–#17当前没有等待用户决定的Harness public plugin seam阻塞。Issue执行者只负责落地所属Issue已列出的接口，不负责继续调研Harness seam、选择Harness版本或设计替代接口。

## Harness 与数据所有权

- Harness Core继续唯一拥有Session、AgentLoop、Skill Invocation校验、Tool execution identity、Session日志和Jobs registry。项目Workbench拥有产品UI呈现，但不得实现第二套Harness Core权威。
- 每个 Generation Tool Call 必须直接使用 Harness `call_id` 作为持久映射键并建立对应 `run_id`。同一 `call_id` 的恢复或重试必须复用既有 Generation Run。
- 当前仓库的 Run Repository 是 Generation Run 状态、错误、source snapshot、request snapshot、actual Workflow JSON、API Workflow JSON 和 Saved Media 的唯一权威来源。
- 数据源系统继续拥有底模、生成模型、LoRA、作品、角色、画师或画风、画师串、提示词条目、ComfyUI Instance 和 Workflow Template。Catalog Operation 只向 Agent 和浏览器返回安全目录投影；Source Operation 只向 Host adapter 返回实例连接和当前完整 Workflow Template bundle。
- 数据源仓库的OpenAPI、只读handler、Catalog/Source CLI、测试和版本发布必须按`docs/v0.1/source-data-catalog-implementation.md`在数据源仓库自身流程中执行。当前仓库Issues不得修改数据源checkout；Issues #4–#6和#13只消费Installation配置指向的已发布CLI。所需合同版本尚未发布时，对应Issue必须标记阻塞，不得在当前仓库复制数据源实现。
- Catalog discovery必须是 v0.82.2 顶层裸 OpenAPI 3.1 对象；Source discovery必须是 `status: "ok"`、`message: null`、`results[0]` 为 OpenAPI 3.1 文档的成功 envelope。当前仓库 Host 分别执行 `imagegen-semantic-query --discovery-json` 和 `imagegen-comfyui-source-read --discovery-json`，再由 adapter 按 `config/source-contract-v0.82.2.json` 核对 operation metadata、schema 和业务 envelope；任何不一致都不注册 Catalog Tool，也不读取 Source 数据。
- Source Operation 不得注册为 Agent Tool、Skill Tool 或浏览器 RPC。ComfyUI Instance Authorization 只能由 Host 在进程内使用，不能写入 Run、日志、发布包、Tool Result 或浏览器响应。
- Message Context Modal 的正式候选必须来自真实 Catalog Operation。中间列表固定为三列两行、每页六项、150×160 卡片和 150×88 封面区域；项目有封面时显示真实封面，没有封面时显示占位符。正式 runtime 不得读取原型数组或生产 fixture。
- ComfyUI Instance 只作为 Execution Route。用户没有显式选择时使用 Configuration Profile 的默认 instance；显式 instance 不可用时必须失败，不能静默切换。
- `anima-prompt-builder`与`wai-sdxl-prompt-builder`只在中列返回Prompt；`lora-adjustment`只在中列返回调整后的Prompt、LoRA权重和触发词；三者不调用Generation Tool。`comfyui-generate`是同一Skill层的独立Skill；只有同一数字Chat Turn同时存在其原生`skill-invocation`Context、`generate_with_comfyui` Tool Call和合法Tool Result meta时，右侧第三列才按`run_id`显示生成结果。中列Tool行继续显示该`run_id`的异步状态摘要，右列显示同一Store快照的详细状态。
- 当前仓库负责实际 Workflow 构建、API Workflow 编译、`POST /prompt`、`GET /api/jobs/{prompt_id}`、`POST /api/jobs/{prompt_id}/cancel`、Host 重启恢复、媒体校验和本地保存。当前项目不得改用 `/queue`、`/history` 或 `/interrupt`。
- 浏览器只能下载已保存的本次实际 Workflow JSON。API Workflow JSON 与内部 request snapshot 必须保持 Host 私有。

## Generation Run 与媒体行为

一个 Session 包含多个有序数字 Chat Turn。每个 Chat Turn 可以包含零个、一个或多个 Generation Run。只有实际 `generate_with_comfyui` Tool Call 才创建 Generation Run；普通消息或 Skill Invocation 本身不得创建 Run。

Generation Tool 在 Run Repository 持久接纳运行后立即返回 `{ run_id }`。运行必须覆盖 created、prepared、submitting、remote pending、remote running、downloading、cancelling、cancelled、succeeded、failed 和 submission unknown。`submission_unknown` 不得自动重提；用户确认重复执行风险后只能通过新的聊天消息发起新的 Tool Call。

Host 必须在调用 `/prompt` 前保存 source snapshot、request snapshot、actual Workflow JSON 和 API Workflow JSON。API Workflow JSON 的 `prompt` 对象必须与实际 `/prompt` body 一致。Host 必须使用 Content-Type 与文件签名共同识别图片、视频和音频，并按 output index 保存多个输出。取消操作必须保留 Generation Run、状态历史、Workflow 和已保存媒体。

所有 Run、Media、Workflow、stream 和 Cancellation 读取必须按 Workspace 隔离。数据源不可用时，已有 Run、Workflow 和 Saved Media 仍然可读；新 Catalog/Source 查询和新 Generation Run 必须明确失败。

## 质量、依赖与发布

依赖 manifest、root lockfile 和 deployment runtime lock 必须使用计划中已经明确的精确版本。新增依赖或 lockfile 变化必须在安装前完成 dependency advisory 与 lifecycle script 审核。PR、main 和 release workflow 必须在 frozen install 前执行相同门禁。

Issue #2 必须定义并落地统一 `pnpm quality`：安全门禁 → typecheck → unit/contract/integration/prototype → build → 单次 pack → package validation → deploy lifecycle → composition → e2e → release-smoke。package validation、deploy lifecycle、composition、e2e 和 release-smoke 必须消费 `.release/quality/artifact.json` 指向的同一 tarball，不得分别重新 build 或 pack。

Issue #14 必须在自己的 Git worktree 使用 `runtime/production/` installation、`production` Configuration Profile 和当前本地浏览器，对同一 Release Artifact 完成产品 CLI 生命周期、真实数据用户任务和`1440×1000`桌面1:1人工验收。clean checkout、composition、e2e 和 release-smoke 只承担自动化技术门禁，不能代替 Issue #14 的完整产品验收。

Issue #15 必须等待用户针对 Release Preview 的明确 Release Approval，然后只把 Issue #14 已验收的同一 tarball创建为 Git tag 与 GitHub Release。Issue #15 不重新 build、pack、安装、启动、检查、升级或回滚。GitHub Release 创建后，本项目交付流程结束；用户自行决定下载后的 installation root、配置、启动、升级、数据迁移和回滚。

## Issue 图

| Issue | 交付的用户任务 | Blocked by |
|---|---|---|
| #2 | 安装、启动、检查、查看日志、停止、升级和回滚真实 Harness 产品 | None |
| #16 | 在已安装产品中启用项目Agent Preset，并隔离项目Tool与Skill | #2 |
| #3 | 在真实 Harness Client 中使用原型三列布局完成普通聊天 | #2、#16 |
| #17 | 只创建、显示、恢复和打开harness-comfyui Preset Session | #3、#16 |
| #4 | 为一条消息选择 Workflow Template 与角色上下文并原子发送 | #3、#17 |
| #5 | 通过 Agent 生成一张图片并下载可导入 Workflow | #4 |
| #6 | 使用完整真实目录准备一条可生成消息 | #5 |
| #7 | 在多个 Chat Turn 之间查看零个、一个或多个 Run | #5 |
| #8 | 离开页面后继续观察排队、远端执行与保存媒体 | #7 |
| #9 | 在运行失败或提交结果未知时获得明确下一步 | #6、#8 |
| #10 | 在 Workspace 任务中心筛选并取消一项运行 | #8、#9 |
| #11 | 在当前 Session 与整个 Workspace 找回历史媒体 | #5、#7 |
| #12 | 一次运行交付多个图片、视频和音频结果 | #8、#11 |
| #13 | 使用迁移的Prompt与LoRA调整Skills准备生成内容，再显式调用ComfyUI生成Skill | #5、#6 |
| #14 | 从一次构建的版本化产品包完成真实产品验收 | #10、#12、#13 |
| #15 | 发布已验收的 GitHub Release 供用户自行安装 | #14 |

## 总体验收

- [ ] Issue #2 的 tarball-only 测试在没有仓库 `node_modules`、源码 checkout 或全局 `dsh` 的目录中，仅使用 tarball、installation JSON、Node 与精确 pnpm 完成 install/start/status/health/logs/stop。
- [ ] Issues #3–#14、#16与#17分别在自己的worktree中使用同一产品CLI、`runtime/production/` installation和`production` Configuration Profile完成对应用户任务。
- [ ] Issues #3–#14 的原型桌面区域全部通过`1440×1000`非实现者独立1:1审核。
- [ ] Message Context 候选、Source snapshot、Run Repository 与 MediaStore 记录来自各 PRD 指定的真实服务；fixture 不进入正式 bundle、profile 或浏览器数据源。
- [ ] Harness `call_id` 直接映射 `run_id`；仓库与 Issues 中不存在第二个 Tool execution identity。
- [ ] `check:harness-boundary`、tarball-only composition与独立审核确认每张Issue的UI和功能只使用该Issue正文列出的public plugin seams；仓库和artifact不存在Harness source import、patch、fork、vendor、alias、自定义forwarded event或DOM monkey patch。
- [ ] Issue #14 验收的 tarball 与 Issue #15 发布的 tarball完全相同。
- [ ] Issue #15 只创建 Git tag 与 GitHub Release；本项目没有替用户执行版本发布后的 installation 操作。

## Blocked by

- None.
