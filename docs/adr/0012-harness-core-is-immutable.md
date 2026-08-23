---
status: accepted
---

# Harness core is immutable

当前项目只能通过主工作树实际安装的 DeepSeek Harness `0.1.0-rc.8` 公共插件机制实现 Host 功能、Client UI、Remote、Tool、Skill、Jobs、Workspace 关联和同源文件路由。调研依据固定为 DeepSeek Harness tag `dsh-v0.1.0-rc.8` committed tree `141eb6fef83422698aef7a981029e843e8161534` 的已提交 package metadata、public exports、类型、实现和测试，以及当前主工作树所有直接 Harness package 的真实安装路径。`/Volumes/4Tdisk/work/AI2/deepseek-harness` checkout不是当前项目的构建输入或运行依赖。

项目必须区分两个Client合同：`package.json.dsh.client.inject`声明Client package加载依赖；`src/client/index.tsx`导出的`inject`数组声明Cordis service生命周期依赖。Issue #2阶段的service列表固定为`["slots", "sessions", "remote"]`，Issue #3起固定为`["slots", "sessions", "remote", "theme", "inputTriggers"]`，后续Issue不增加service项。Client runner必须在列表中的provider全部存在后调用项目`apply`。

本次规划审计已经完成每张Issue的接口调研；Issues #2–#15的正文和对应PRD分别直接列出所属产品功能允许使用的public interfaces。Issue执行者只实现所属Issue正文列出的public interfaces，不承担接口调研、替代方案设计或Harness版本选择。Issue执行者不得修改DeepSeek Harness源码、installation中的Harness package或forwarded-event allowlist；不得复制Harness源码、导入`@deepseek-ai/*/src/*`、替换Harness package、重写Harness Session、AgentLoop、Host Skill发现与调用校验、Tool execution identity、持久Session日志或Jobs registry。

Harness Core固定包括Client module loader、Cordis生命周期、SlotCore仲裁、Session、AgentLoop、Host Skill发现与调用校验、Tool execution identity、持久Session日志和Jobs registry。`ui-layout`、`ui-conversation`、`ui-input-trigger`、`ui-skill`和`ui-tool`是上游随包提供的插件，不是不可替换的Harness Core。项目可以使用公开profile composition、slot和service替换某个随附UI插件的呈现，但不得同时实现第二套Harness Core权威。

当前项目的`cordis.patch.yml`只使用`package.json`的`dsh.bundle.patch`公共composition完成两项配置：按精确Loader row id `ui-layout`将上游随附布局插件设置为`disabled: true`，以及插入当前项目Host plugin Loader row。该文件不得patch Harness JavaScript、TypeScript或package文件。项目Client plugin只通过`exports["./client"]`与`dsh.client` metadata进入Web composition。项目Host Remote contribution只通过`exports["./typert"]`被Typert loader发现；项目Client plugin只调用公开`ctx.remote.$mount(harnessComfyuiRemote)`挂载项目生成的`exports["./remote"]` contribution。

rc.8 的Host→Client forwarded-event allowlist不包含`generation.run.changed`。项目不得修改`@deepseek-ai/dsh-api-remotes`来增加该事件。Client必须通过项目unary Typert Remote读取Run Repository：遇到合法Generation Tool Result、打开结果列、切换Session、切换数字turn和取消后立即查询；页面可见且中列可见Generation Tool行或右列可见运行卡观察非终态Run时，唯一`GenerationRunProjectionStore`按Remote response的`refreshAfterMs`继续查询。两处同时可见时每周期只查询一次；关闭右列但中列Tool行仍可见时继续查询；页面隐藏、两处都没有可见消费者或全部运行终态时停止。Run Repository始终是状态权威来源。

rc.8 profile bundle按顺序应用patch，后层可以按Loader row id覆盖前层；Web App布局row id固定为`ui-layout`。rc.8 SlotCore内建并公开`root` slot，root occupant可以声明`sidebar`、`conversation`、`details`与`shell.overlay`。项目bundle停用`ui-layout`后，项目Client plugin必须向内建`root`注册唯一root occupant；该root必须声明并渲染上述四个child slot，并在`1440×1000`使用`294px minmax(0, 1fr) 432px`。项目必须先注册root并声明四个child slot，再通过公开Cordis service机制调用`ctx.reflect.provide("layout", layoutService)`提供符合`ILayout`的`toggleSidebar()`、`openDetails()`和`closeDetails()`。项目不得注册第二个root。

`src/client/workbench/layout-contract.ts`固定打开左列294、折叠左列56、打开右列432以及两个panel默认打开。项目`ILayout` service必须让`toggleSidebar()`在294与56之间切换、`openDetails()`写入432、`closeDetails()`写入0。root向`sidebar` occupant传入公开`SidebarOwnerProps`，向`conversation`和`details`传入空owner props，并把`shell.overlay`渲染在三个滚动列之外。本版本不实现拖拽改宽、viewport监听、自动折叠或移动端断点。

项目必须继续运行rc.8 `ui-conversation`、`ui-input-trigger`与`ui-skill`。ConversationRoot必须注册到项目root声明的`conversation` slot，继续提供标准conversation definitions和`ConversationSnapshot` projection，并声明、渲染`conversation.input.overlay`；`ui-input-trigger`继续把原生MenuView注册到该overlay。项目通过公开child slot替换原型需要的sidebar、details、chat和composer呈现；项目composer必须渲染ConversationRoot传入的overlay，并只使用公开`useInput`、`inputActions`与`ctx.inputTriggers.sessionOf(sessionScope)`连接textarea。项目不得调用SkillsApi实现第二套Skill菜单、保存Skill选择状态或注册第二个Skill provider与invocation policy。

停用`ui-layout`同时移除了该随附插件的Theme presenter。项目桌面Shell初始化时必须调用公开`ctx.theme.getTheme()`取得`ThemeSnapshot`，并通过公开`ctx.on("theme/change", projectTheme)`持续接收快照；`projectTheme`把`active.colorScheme`写入`document.documentElement.style.colorScheme`和`document.body`的`data-ds-dark-theme`，把`active.tokens`逐项写入`document.body.style`。dispose时只清理本模块写入的attribute、style和token。该限定主题模块不得使用`querySelector`、移动上游DOM或改写Harness组件。除该限定主题投影外，项目不得查询、移动或patch上游DOM。

原型只规定composer的可见结构、Message Context、一次发送、失败保留与成功清理行为，没有规定状态必须由Harness InputHub或项目store持有。实施规格选择项目按Session保存发送前的正文、ContextRef、File和preview URL；这些对象只属于未发送UI状态。发送协调器先通过真实Catalog resolve每个ContextRef，再把图片编码为公开`PromptContentPart`，最后调用一次公开`SessionFace.prompt(parts, 'queue')`。发送按钮与Enter固定使用`queue`，本版本不实现Steer手势。Harness接受后，原生`user/message`、Host附件存储、AgentLoop和Tool pipeline继续成为唯一运行与持久权威。失败时项目保留本次发送快照；成功时只清理该快照并revoke其object URL。

本次rc.8规划审计确认桌面三列布局、原生Conversation projection、原生`/` Skill菜单、普通消息提交和主题投影都可以通过上述公开composition、slot与service实现。Issues #2–#15当前没有等待用户决定的Harness public plugin seam阻塞；Issue执行者不得重新设计这些seam或增加移动端产品范围。
