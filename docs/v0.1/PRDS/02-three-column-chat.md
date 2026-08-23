# PRD 02：三列布局与普通聊天

## 关联 Ticket

Ticket 02 — 在真实 Harness Client 中实现原型 A 三列布局与普通聊天。

## Harness 核心零改动与公共接口

DeepSeek Harness `0.1.0-rc.8` 的公开 profile composition允许后应用的bundle patch按Loader row id覆盖前层定义。项目bundle必须把`@deepseek-ai/dsh-web-app`提供的`ui-layout` row设置为`disabled: true`；该row属于上游随附UI插件，不属于Harness Core。项目Client plugin必须向内建`root` slot注册唯一root occupant；该root必须声明并渲染rc.8标准`sidebar`、`conversation`、`details`与`shell.overlay`四个child slot，并在`1440×1000`使用`294px minmax(0, 1fr) 432px`。项目必须先注册root并声明四个child slot，再通过公开Cordis service机制提供符合`ILayout`的`toggleSidebar()`、`openDetails()`与`closeDetails()`，使其他上游UI贡献在已有公开slot中挂载。

`package.json.dsh.client.inject`只声明Client package加载依赖。`src/client/index.tsx`导出的Cordis service `inject`必须从Ticket 01的`["slots", "sessions", "remote"]`精确扩展为`["slots", "sessions", "remote", "theme", "inputTriggers"]`，使Client runner在五项service全部存在后才调用`apply`。contract与composition测试必须读取实际module export，分别撤出五项provider，证明plugin保持pending且没有root注册、theme DOM写入、Remote挂载、Session读取或input-trigger连接，并在provider恢复后只激活一次。Ticket 16为公开`session.create`路径增加第六项`connection` service；其他Ticket不得增加Client service依赖。

`src/client/workbench/layout-contract.ts`必须成为桌面Shell尺寸与状态的唯一结构化来源，固定`sidebarOpenPx: 294`、`sidebarCollapsedPx: 56`、`detailsOpenPx: 432`与初始`sidebarOpen: true`、`detailsOpen: true`。项目实现的`ILayout.toggleSidebar()`必须在294与56之间切换，`openDetails()`必须把右列设为432，`closeDetails()`必须把右列设为0。root渲染`sidebar`时必须传入`{collapsed: width === 56, width}`，渲染`conversation`与`details`时必须传入空owner props，并把`shell.overlay`渲染在三个滚动列之外。本Ticket不实现拖拽改宽、viewport监听、自动折叠或移动端断点。

Harness Core 继续唯一拥有 Client module loader、Cordis 生命周期、slot 仲裁、Session、AgentLoop、Host Skill 发现与校验、Tool 执行、Session 日志和 Jobs registry。`ui-layout`、`ui-conversation`、`ui-input-trigger`、`ui-skill` 和 `ui-tool` 是上游随包提供的 UI 插件，不是不可替换的 Harness Core。项目必须继续运行 `ui-conversation`，使 rc.8 标准 conversation event definitions 和 `ConversationSnapshot.chat`、`nodes`、`partial`、`runningCalls` projection 生效；`ui-conversation`的ConversationRoot必须注册到项目root声明的`conversation` slot。项目 Workbench 只通过公开 `ctx.sessions`、Session hooks、`ConversationSnapshot` 和 `SessionFace` 读取或调用这些权威能力。

项目Workbench在项目root声明的三个公开列slot内实现原型桌面Header内容、左列、聊天内容、结果列和输入区。本版本不交付移动端布局、移动端导航、窄屏单panel切换或原型CSS断点。项目只保存每个Session尚未发送的正文、Message Context、Execution Route、浏览器`File`与preview object URL；这些临时UI数据不是第二套Session或消息日志。普通发送或后续生成发送都必须把当次正文与图片编码为公开`PromptContentPart[]`，只调用一次当前Session的`SessionFace.prompt(parts, 'queue')`。发送按钮与Enter都固定使用`queue`；本版本不实现Steer手势。Harness原生attachment store、`user/message`、Agent stream、Tool pipeline和Session replay继续是已发送数据的唯一权威来源。

项目必须保留`ui-conversation`的`ConversationRoot`，并让该组件继续渲染`conversation.input.overlay`。项目的原型输入区通过`priority: -10`注册到`conversation.composer.bar`；该输入区必须把ConversationRoot传入的`overlay`渲染在当前composer card中，并使用公开`useInput`、`inputActions`和`ctx.inputTriggers.sessionOf(sessionScope)`连接当前草稿与触发管线。用户在输入框键入`/`后，Harness原生`MenuView`显示当前Session可调用的Skill；用户选择后，Harness把普通`/<skill-name> `文本写入当前草稿。项目不得调用SkillsApi，不得实现候选查询、候选排序、菜单组件、菜单状态、键盘选择或Skill选择状态，也不得注册第二个Skill provider与invocation policy。Host的`dsh-tool-skill`必须在执行前按当前Session的cwd与preset scope重新发现并校验该Skill。

停用`ui-layout`后，项目桌面Shell必须替代该随附插件的主题投影职责。项目必须把`@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8`加入直接devDependency、peerDependency与`dsh.client.inject`。项目初始化时必须调用公开`ctx.theme.getTheme()`取得`ThemeSnapshot`，并通过公开`ctx.on("theme/change", projectTheme)`持续接收快照；`projectTheme`把`active.colorScheme`写入`document.documentElement.style.colorScheme`和`document.body`的`data-ds-dark-theme`，把`active.tokens`逐项写入`document.body.style`。dispose时只清理本模块写入的attribute、style和token。该限定模块不得使用`querySelector`、移动上游DOM或改写Harness组件。

`@deepseek-ai/dsh-client-ui-theme@0.1.0-rc.8`已经存在于当前root/runtime lock的rc.8 Web App闭包，package没有preinstall、install或postinstall lifecycle script。Ticket 02把同一版本提升为直接依赖时不得引入新package版本或扩大`allowBuilds`；变更后的root/runtime lock仍必须通过`check:manifest-lock`、`security:advisories`与`security:build-scripts`。

## 用户任务

浏览器用户搜索并选择一个 Harness Session，发送一条不创建 Generation Run 的普通消息，观察 Agent 增量文本，并在右列确认当前聊天轮次和当前 Session 都没有生成结果。

## 原型依据

- `prototype/generation-workbench/index.html` 的左列 Session 列表、中列 conversation、右列结果标签和空态。
- `prototype/generation-workbench/styles.css` 的桌面三列、Session 选中态、消息气泡、输入区和结果标签样式；移动端与窄屏规则不属于本版本。
- `prototype/generation-workbench/app.js` 的 Session 搜索、Session 切换、消息发送、流式文本和结果标签交互。

## 前端要求

`tests/visual/prototype-fidelity-viewports.json` 必须由本 Ticket 创建并作为 Tickets 02–13 唯一桌面验收尺寸来源。文件固定包含 `schema_version: 1` 和 `1440×1000` 一个viewport。移动端或窄屏尺寸不属于本版本验收输入。

1. 当前项目bundle必须停用精确Loader row `ui-layout`，项目Client plugin必须注册唯一root、声明并渲染四个rc.8标准child slot、提供公开`ILayout` service，并继续挂载ConversationRoot。项目不得保留第二个root，不得复制Harness Core的Session、Agent stream、Tool执行或Session日志。
2. 左列使用 Harness 当前 Workspace 的 Session 列表。每一行显示 Session 标题、最后更新时间和当前仓库的 Generation Run 数量；Ticket 02 在运行服务尚未接入时显示确定的 `0 项运行`。
3. “搜索会话”只在当前已加载 Session 集合中按标题筛选。空字符串恢复全部 Session；无匹配结果显示明确空态，不创建虚构 Session。
4. 中列标题、消息记录、草稿正文和发送状态始终属于当前选中 Session。切换 Session 后不得继续显示上一 Session 的草稿、消息或右列状态。
5. 普通消息提交必须把当前发送快照转换为公开`PromptContentPart[]`并只调用一次`SessionFace.prompt(parts, 'queue')`；Agent增量文本必须来自`ui-conversation`注册的公开`ConversationSnapshot`。当前项目不得创建第二个消息接口或复制Session日志。
6. 右列提供“当前轮次结果”和“本会话结果”两个标签。当前聊天轮次没有 Generation Run 时显示“此轮对话没有创建 ComfyUI 运行”；当前 Session 没有 Saved Media 时显示“当前会话还没有生成运行”。
7. 本版本只验收`1440×1000`桌面三列；移动端导航、窄屏单panel切换和原型`1160px`、`900px`、`620px`断点行为不属于本版本验收范围。

## 后端与数据要求

- Session 列表、当前 Session、消息记录、数字 `turn` 和 Agent stream 全部来自 Harness 原生 Session/conversation 服务。
- Host 从当前 Harness 上下文派生 Workspace 与 Session；浏览器不能提交任意 Workspace 范围。
- Ticket 02 不创建 Generation Run，也不写 Run Repository。运行计数暂时只能是已接入服务返回的真实计数或零，不能使用原型 fixture 数字。

## 状态与错误

- Session 列表加载失败时，左列保留搜索框并显示可重试错误；中列和右列不得显示其他 Session 的缓存内容。
- 消息提交失败时，草稿正文保留，发送按钮恢复可操作状态，并显示 Harness 返回的具体错误。
- stream 中断时，已经收到的 Agent 文本保留，并显示本次回复中断；页面不得把不完整回复标为完成。
- 没有 Session 时，中列显示未选择 Session 的空态，消息输入与发送按钮禁用并说明原因。

## 产品验收

1. 浏览器用户输入搜索词、清空搜索词、选择两个不同 Session；每次中列标题、消息和右列空态都对应当前 Session。
2. 用户发送普通消息并看到至少两次增量文本更新；该数字 `turn` 的当前轮次结果保持零项。
3. 用户在两个结果标签间往返切换，空态文案、选中态和焦点顺序与原型一致。
4. 用户必须在`1440×1000`完成Session选择、结果标签切换和消息发送，并保存原型与真实Harness产品的成对截图或录像。
5. 独立视觉审核者不得是本 Ticket 的实现者。该审核者必须在当前本地浏览器并排检查桌面Header内容、`294px minmax(0, 1fr) 432px`三列宽度、Session行、消息气泡、轮次标题、输入区、结果标签、空态、禁用态和错误态并给出PASS/FAIL；实现者自检和自动化测试不能替代该验收。
6. composition测试必须证明`ui-layout` Loader row已经停用、项目root是唯一root、项目root在提供`layout` service前已经声明四个标准child slot、ConversationRoot与原生`conversation.input.overlay`仍在实际挂载链；真实Session、Agent增量文本和Tool projection必须来自Harness公开运行时，页面不得存在第二个root或第二个Skill菜单。
7. 用户在项目输入框中输入`/`后，ConversationRoot传入的Harness原生Skill菜单显示当前Session可调用Skill；用户选择一项后输入框出现普通`/<skill-name> `文本，Host在实际执行前重新校验Skill。项目bundle中不存在第二套Skill候选菜单或Skill选择存储。

## 不属于本 Ticket

本Ticket不实现Message Context、Generation Tool、运行卡片、媒体或任务取消。本Ticket只在中列项目composer中渲染Harness原生input overlay，不实现Skill候选查询、菜单、选择状态、provider或执行策略。
