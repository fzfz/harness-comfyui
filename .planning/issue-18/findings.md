# Issue #18 调研记录

## 当前事实

- 当前主仓库路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui`。
- 当前 `main` 基线提交为 `4f5a14b1c1306080bdeb1e3a8dccb13ad435dd38`。
- 独立 worktree 路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-18`，分支为 `codex/issue-18`。
- 当前 `main` 工作区包含用户未提交的源文件、测试文件、文档与规划目录变更；本任务必须保留这些变更。
- 仓库根目录现有 `task_plan.md`、`findings.md` 与 `progress.md` 属于较早的 Harness ComfyUI 原型规划；本任务使用 `.planning/issue-18/`，不覆盖这些文件。
- `main`的用户变更已经进入index，并与issue #18预期修改的`CONTEXT.md`、`docs/system/architecture.md`、`docs/system/directory-structure.md`、`scripts/production/health.mjs`、`tests/production/source-production.test.mjs`发生文件级重叠。用户变更增加当前源码Client ModuleLoader物化与真实路由测试，语义上不应被issue #18删除。
- 最终本地`main`合并必须使用可恢复的临时stash保存index与未跟踪文件，先提交issue #18 merge，再以`--index`恢复用户变更；恢复成功前不能删除stash。发生冲突时必须把issue #18的原生boot graph/owner变更与用户的Client ModuleLoader变更同时保留，并让专门执行队员处理，主线程只审查结果。
- GitHub 仓库为 `fzfz/harness-comfyui`，默认分支为 `main`；本地 checkout 实际存在 `origin`，因此 `docs/agents/issue-tracker.md` 中“当前 checkout 没有 remote”的状态说明已经过期。
- issue #18 标题为“恢复 Harness 原生界面，并在工作台复用原生输入能力”，状态为 OPEN，标签为 `ready-for-agent`，正文没有评论补充。
- 父 issue #1 的 2026-08-24 最新规范明确把以下责任分配给 issue #18：恢复原生 `ui-layout`、Surface 双向切换、原生 InputBar、当前 Session 权限选择和默认 Skill roots。
- issue #18 指定基线提交为 `4f5a14b1c1306080bdeb1e3a8dccb13ad435dd38`；当前独立 worktree 正好从该提交创建。

## Issue #18 已冻结的实现边界

- Client plugin 必须删除项目 root、layout、Theme、composer 接管，恢复上游 `ui-layout`，并把 service 合同精确改为 `slots`、`sessions`、`connection`。
- 实现必须删除停止使用的项目 root、layout、theme和composer模块及对应单元测试，只删除这些模块独占的 CSS，保留仍由三个动态occupant使用的工作台内容组件及其样式。
- `src/client/workbench/surface-navigation.tsx` 必须成为 Surface 状态、永久入口、三个动态 occupant disposer 与唯一 `WorkbenchSessionBinding` disposer 的唯一所有者。
- Harness 原生模式只注册永久 `sidebar.footer.action`；Workbench 模式按顺序动态注册 `sidebar.workspaces`、`conversation.view#chat`、`details`，全部成功后才能启动 binding；原生`conversation.session.header`始终保留。
- 任何 occupant 注册失败或 binding 启动失败都必须逆序清理、恢复 Harness 原生模式，并通过唯一结构化错误映射显示 `WORKBENCH_SURFACE_OPEN_FAILED` 对应文案。
- 用户退出 Workbench、切换中取消、迟到结果、连续十次切换和 Client plugin 卸载必须保持一个 binding、没有重复 occupant/订阅/Session，并保留 Harness 拥有的 Session。
- Product Agent Preset 只能增加一个 `@deepseek-ai/dsh-skill-filesystem` row（`includeDefaultRoots: true`）和一个 `@deepseek-ai/dsh-tool-skill` row；不得修改 dependency 或 lockfile。
- health boot graph 必须恢复并要求 rc.8 原生 layout、conversation、settings、model、permission、input-trigger、skill、trajectory 模块和 `harness-comfyui`。
- Harness 边界门禁必须允许根 composition 只保留 Host plugin 插入项，不再要求 `ui-layout disabled`，其余 Core、public export 和禁止 deep import 边界保持不变。
- issue #18 列出的十份当前文档必须同步为原生 AppFrame/InputBar、三个动态 occupant、原生header所有权、Workbench 模式绑定和 `.agents/skills` owner 关系；PRD 03/04/12 只能修改 owner 与目录描述，不得修改业务功能。

## 父 issue 不可变计划的适用规则

- 父 issue #1 链接的 `plans/issue-1-native-surface-and-input-capabilities.md@5010c2a` 定义四项总体产品目标、Issue 依赖图和后续 Issue 责任。
- 当前 issue #18 正文明确整篇替代该计划中只属于 issue #18 的旧实施条款。因此执行队员必须使用当前 issue #18 的 `['slots', 'sessions', 'connection']` service 合同、两个新增 Preset row、无 `customSkillDirs`、无 release `package/skills`、无 Client `remote`/`conversation` service的最新要求。
- 父计划仍用于约束 issue #18 的总体结果：一个原生 root/layout/Theme owner、native/workbench 双 Surface、原生 Settings/ModelSelect/PermissionSelect/InputBar/Skill/trajectory、三个动态业务 occupant、原生header所有权、非持久 Surface 状态，以及不得修改 #4/#6/#10/#11/#13/#14 业务责任。

## Issue #18 测试与验收边界

- 单元测试必须覆盖 Client service 激活、原生模式、三个 occupant 成功、每个 occupant 逐一失败、binding 失败、创建/收敛中退出、迟到结果、十次切换和卸载清理。
- 真实 rc.8 组合测试必须覆盖 `.agents/skills` 平铺/目录/仅用户/非用户/非法/同名遮蔽候选、原生菜单插入、真实 `skill-invocation` 和模型自动调用目录排除。
- 产品验收必须覆盖原生 PermissionSelect 三种权限、原生 ModelSelect、两个 Surface 的 Settings、真实轨迹全部指定交互、当前源码生产生命周期、`1440×1000` 独立视觉证据和十份 Markdown 的独立语义审核。
- issue 要求执行 `pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm prod:test` 和 `pnpm quality`；测试计划必须复用有效 PASS 证据，最终只执行一次完整 `pnpm quality`。
- issue 明确排除 Message Context、Execution Route、Generation Tool、Run Repository、任务中心、Saved Media、Prompt/LoRA Skill、移动端、Surface 持久化、新导航框架、dependency、rc.8 升级、旧 v0.1 Artifact/安装/升级/回滚体系和其他 GitHub Issue 修改。

## 基线实现形状

- `src/client/index.tsx` 当前在 plugin apply 时立即启动 `WorkbenchSessionBinding`，注册项目 `root`、top-level `sidebar`、`details`、session header、chat view、composer bar，提供项目 `layout` service并安装项目 Theme projection；这正是 issue #18 要移除和重组的行为。
- `src/client/index.tsx` 当前 service 数组是 `slots`、`sessions`、`theme`、`inputTriggers`、`connection`；目标精确数组是 `slots`、`sessions`、`connection`。
- `workbench-session-binding.ts` 已经使用 `AbortController`、generation identity、订阅 disposer和 convergence timer；Surface 控制器应复用它的公开 `dispose()` 取消创建、订阅和迟到结果，不应复制 binding 状态机。
- `cordis.patch.yml` 当前插入 `harness-comfyui` Host plugin并额外禁用 `ui-layout`；issue #18 只允许删除禁用 row并保留插入项。
- `agent-presets/harness-comfyui/agent.cordis.yml` 当前只有 `persona`与 `project-agent`；issue #18 要求只新增 `skill-filesystem`与 `tool-skill`两个 row。
- `package.json` 当前版本为 `0.2.0`，rc.8 Harness packages均已精确锁定，现有 `dsh.client.inject`已经包含 connection、remotes、locale、runtime、conversation、input-trigger、layout和theme；issue #18 禁止修改 dependency、lockfile与该 client composition。
- 现有 `tests/unit/workbench-surface.test.tsx`仍直接验证项目 root/layout/静态列宽与 composer，因此 Client 纵向任务必须把它改为 Surface 行为测试，而不是叠加第二份新测试。
- 现有 `tests/unit/workbench-session-binding.test.ts`包含可复用的 pending create、AbortSignal、列表收敛、迟到响应与 timer harness；只应补充 Surface 退出所需的可观察断言，不应重写 binding。
- rc.8 `sidebar.footer.action` 是 root scoped list slot，owner只传递 `{ wide }`；`sidebar.workspaces` 是 root scoped single slot，owner传递 `{ wide, expandSidebar }`。现有项目 Session sidebar仍接收 `{ collapsed, width }`，Client切片必须适配公开owner props。
- rc.8 `conversation.session.header` 是 session scoped single slot；替换该seat会同时接管标题、view tabs和action row。其公开props提供`views.list/subscribe/version`与Chat store，而现有项目Session header只渲染标题和Agent状态。Client切片必须用公开props保留“聊天/轨迹”投影，否则仅保留trajectory occupant仍不会显示入口。
- rc.8 `conversation.view` 是 session scoped list slot；项目只应注册`id: "chat"`、`priority: -10`的工作台chat occupant，原生`trajectory`条目必须保持由上游注册并通过同一个view ledger投影。

## 首轮 Client diff 审查

- 当前Surface action只把`mode`作为`useSyncExternalStore` snapshot；Workbench打开失败时`mode`从native保持native，React不会因相同snapshot重渲染，因此结构化错误虽然写入变量但用户看不到。可观察snapshot必须包含错误变化或独立version。
- 当前Client plugin测试只直接调用`apply()`，没有保留真实Cordis plugin在`slots`、`sessions`、`connection`任一缺失时pending且恢复后只激活一次的验收。
- 当前trajectory tab测试没有触发React按钮，只直接调用mock并返回固定字符串，属于TDD技能明确禁止的tautological test；测试必须从真实渲染树触发`onClick`。
- 当前Session sidebar把原生`wide`再次映射为固定`294/56`宽度，重新引入issue #18已经删除的固定列宽合同；工作台内容只能消费`wide`，列宽继续由原生`ui-layout`拥有。
- 当前十次切换测试使用不会创建Session的fake binding，因此“没有重复Session”按构造恒真；必须通过真实binding的pending create/AbortSignal/迟到结果seam观察退出取消与不open。
- Client执行队员第一轮返工已经让Surface action订阅包含error/version的稳定snapshot，恢复Cordis缺失service激活测试，使用React renderer真实点击trajectory tab，并用真实binding的pending create与AbortSignal覆盖十次切换。
- 第二轮仍发现`session-sidebar.tsx`保留标注为legacy的`collapsed/width`兼容分支，`session-header.tsx`把真实rc.8 slot保证的props改成optional并增加EMPTY fallbacks；这些未经授权的兼容/静默兜底必须删除。
- `startWorkbenchSessionBinding()`若初始化期间subscribe或首次reconcile抛错，函数在返回disposer前可能留下订阅；Surface catch无法处理未返回的handle。binding构造函数自身必须保证启动异常时清理已建立资源。
- Client第二轮返工删除了legacy sidebar宽度分支和header optional/EMPTY fallbacks，并给binding构造增加异常清理。
- 当前CSS把原项目shell作用域token迁移到`:root`，会全局覆盖原生AppFrame、Settings、InputBar等Theme presenter输出；项目token必须只作用于四个项目occupant与永久Surface入口顶层，不能写入root/body/document。
- Client第三轮返工已经把项目token限定在`.session-panel`、`.conversation-header`、`.message-list`、`.results-panel`和`.harness-comfyui-surface-navigation`，没有向`:root`、`body`或`document`写入项目主题token。

## 首轮原生 Skill/门禁 diff 审查

- composition、Preset rows、health必需boot graph和Harness boundary的产品代码改动与issue #18列出的最小文件范围一致。
- 新增rc.8 Skill integration测试目前直接在测试中调用`mountedScope.ctx.plugin()`手工挂载filesystem provider和tool-skill，没有通过`agent-presets/harness-comfyui/agent.cordis.yml`的真实Preset composition加载；这违反issue明确要求的“只使用Preset新增rows、用户没有手工挂载provider”。
- 当前integration测试能够真实验证scoped `skill.list`、平铺/单层bundle、非法frontmatter、同名`.dsh`胜出、仅用户调用Skill的真实`skill-invocation`正文以及模型自动调用排除，但没有证明原生UI菜单标记/选择插入、PermissionSelect、ModelSelect、Settings或trajectory交互。这些行为需要真实Preset composition自动化或最终浏览器证据，不能用静态文本断言替代。
- 原生Skill执行队员返工后，integration测试通过rc.8 `dsh-agent-presets`与Cordis loader加载仓库实际`agent-presets/harness-comfyui/agent.cordis.yml`并mount Product Agent Preset，不再手工挂载两个Skill plugin。

## 文档语义复验记录

- 首次独立Reviewer报告四组问题后，文档执行队员完成精准返工。
- 第二名全新Reviewer确认十份文档已经收敛到两句：PRD 02仍把原生`ConversationRoot`挂载动作交给项目Client；ADR 0012仍引用不存在的`profiles/cordis.patch.yml`而不是根`cordis.patch.yml`。
- 主线程只把上述两句派回原文档执行队员；完成后仍需全新独立Reviewer给最终PASS。
- 第三名全新独立Reviewer确认PRD 02保持原生AppFrame/Conversation UI拥有ConversationRoot，ADR 0012使用根`cordis.patch.yml`并保持`ui-layout`启用；两份文件均PASS，十份Markdown语义验收完成。

## 纵向切片候选

1. Client Surface 切片：恢复原生父界面、实现唯一 `surface-navigation.tsx`、删除废弃模块/CSS、把 `client-plugin`与 `workbench-surface`测试改为完整 success/refusal/cleanup/error tracer；文件所有权限定为 `src/client/**`与三个指定 unit test文件。
2. Host/Skill/生产门禁切片：修改 `cordis.patch.yml`、Product Agent Preset、health与 Harness boundary，增加/修改对应 production/security/integration测试；文件所有权不进入 `src/client/**`或 Markdown。
3. 文档所有权切片：只修改 issue #18 列出的十份 Markdown，逐份执行人工语义核对；文件所有权不进入产品代码、测试、其他 PRD或 GitHub Issue。

## 发布规范冲突

- 当前 `docs/system/releasing.md` 规定产品版本必须使用 SemVer，正式 `0.2.0` 使用 tag `v0.2`；`package.json.version` 当前已经是 `0.2.0`。
- 用户授权的中间版本字符串 `v0.2.01` 不能直接作为 `package.json.version`，因为 SemVer 数字标识符不允许前导零；它也不符合当前仓库只定义的正式 tag 规则。
- 主线程在实施与验收完成前不扩展发布设计；最终发布阶段必须先根据仓库既有状态检查 `v0.2.01` 是否被用作仅 Git tag/Release 的既有约定，若没有可执行约定则需要用户确认合法 SemVer 或 tag 口径。
- 本地与远端当前只有 `v0.1.0-rc.7`、`v0.1.3`、`v0.1.17`、`v0.2`；GitHub当前最新Release是`v0.2`，指向`4f5a14b`且无附件。目标`v0.2.01`尚不存在。
- 历史`v0.1.3`与`v0.1.17`标签分别对应合法`package.json.version` `0.1.3`与`0.1.17`；历史没有前导零中间版本。
- 当前`v0.2`对应`package.json.version` `0.2.0`，因此若继续以产品版本单一来源发布，最接近用户字符串的合法下一版本是`0.2.1`，但主线程没有权限自行把用户明确写出的`v0.2.01`改名为`v0.2.1`。
- 用户已经明确把发布口径更正为产品版本`0.2.1`、Git标签和GitHub Release `v0.2.1`；发布阶段不再存在版本命名歧义。

## 候选提交两轴审查

- Standards轴确认新Session header的Session缺失/blank分支和slot未同步声明分支缺少直接测试；AGENTS要求新功能测试覆盖各分支，因此这是必须修复的硬缺口。
- Standards轴确认`src/client/index.tsx`把三个公开服务转为`never`，Surface又以`Record<string, unknown>`和`as unknown as`连接四个slot组件；这会让rc.8公开owner props变化逃过类型检查。
- Standards轴确认四个registration元数据与四段数组索引安装逻辑构成两份顺序来源；单一强类型descriptor应同时绑定registration和component。
- Spec轴确认rc.8 view ledger会同时保留原生chat和priority -10项目chat；Session header必须按公开winner规则对view id去重并保留本地化聊天标签，不能用预先去重的假ledger测试。
- Spec轴确认当前Skill组合测试真实加载Host Preset，但手工过滤菜单候选并直接构造插入文本，没有消费原生`ui-input-trigger`/`ui-skill`选择链路；定向组合测试必须使用公开原生链路，或给出该链路在Node测试环境不可观察的准确证据并转入浏览器验收。

## 真实生产浏览器阻断

- 主工作区已有0.2.0受管Host占用4173；主线程没有停止或修改该用户进程，而是在Issue worktree用允许的`HARNESS_COMFYUI_SERVER_PORT=4174`配置覆盖启动0.2.1。
- 4174的`prod:start`、`prod:status`、`prod:health`和`prod:logs`均报告通过；真实浏览器页面却显示`Failed to load plugins`。
- 浏览器console给出两条直接证据：`SyntaxError: Cannot use import statement outside a module`来自`/plugins/harness-comfyui/client.js`，随后Host loader报告该bundle没有通过`__ModuleLoader__.load`注册`harness-comfyui`。
- Issue分支仍把`package.json.exports['./client'].default`指向`src/client/index.tsx`；主工作区已暂存但未提交的用户变更把浏览器default入口改为`.local/source-client/client.js`，并增加Client ModuleLoader物化、启动时生成、health执行验证以及真实生产测试。
- 主线程不得把这些用户staged变更直接提交到Issue分支或Release；独立Reviewer必须先判断该缺陷与Issue #18的严格边界，若发布必须包含这些变更则向用户请求最小显式授权。
- 独立Reviewer结论是“必须先纳入现有用户变更”：该缺陷由4f5a14b基线引入，不是#18 diff引入；但没有ModuleLoader物化就无法观察任何Surface，因此不能完成#18验收或发布。
- 用户已经明确授权把现有staged Source Client物化改动作为独立基线修复纳入v0.2.1，并限制为只组合处理与#18重叠的health、测试和文档。
- 主线程把16个已暂存Source Client文件独立提交为`d6cb68f`；主工作区所有未跟踪`.agents/`、其他`.planning/`和研究文档保持未提交。

## Source Client修复后的浏览器事实

- 0.2.1在4174重新启动后，`prod:health`的Client ModuleLoader执行检查通过，浏览器首次加载进入原生AppFrame；基线生产入口阻断已经关闭。
- 1440×1000截图显示永久Surface入口DOM存在但视觉几乎不可见，因为`.harness-comfyui-surface-navigation`仍定义项目固定浅色palette并覆盖原生深色Sidebar继承的DSW tokens。
- 原生Settings可在Harness模式打开，模型设置页可见，默认权限下拉菜单公开Read Only、Workspace Write和Full access三项；Browser安全边界下没有执行Full access最终设置修改。
- 进入Workbench后binding成功创建并列出`harness-comfyui-issue-18`真实Session；Browser console随后报告项目`SessionHeader`读取`views.subscribe`时`views`为undefined，rc.8 renderer把该slot entry标记为crashed。
- rc.8公开`ConversationSessionHeaderInjected`、chat store、locale和header actions/utilities child render属于上游`conversation.session.header`注册项自己的options。项目priority -10 shadow注册不会继承另一个registrant的inject/store/children/locale；`conversation.session.header`的SlotMap owner为空，framework standard kit只提供Session/global hooks。
- `SlotRegistry.entries/entriesOfSlot/subscribe/getVersion/spec`能公开读取view ledger与标签，但没有公开写入上游ChatStore当前view的动作，也不能取得另一个registrant的store实例；只读ledger不足以实现真实trajectory切换。
- Client执行队员确认renderer host内部虽有store实例解析能力，但`SlotRegistry`公共服务没有`storeOf`；项目不能通过公共接口复用上游header的store/actions。
- 用户已明确批准最小产品修正：完全保留原生`conversation.session.header` occupant，只动态遮蔽`sidebar.workspaces`、`conversation.view#chat`和`details`三个业务seat。原生header继续拥有ChatStore、聊天/轨迹tabs、actions/utilities和locale。
- 另一条路线是修改rc.8 Harness公开API或使用deep import复制上游实现；Issue #18的非目标明确禁止这两种路线。

## 待确认事实

- issue #18 关联文件当前实现形状、现有测试 seams 与 ADR 具体冲突。
- `v0.2.01` 是否已经存在本地或远端 tag/Release，以及仓库历史是否存在中间版本命名约定。
