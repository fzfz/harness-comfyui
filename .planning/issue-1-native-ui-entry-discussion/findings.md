# Findings

## Definitions

- **完整 Harness 原生 Surface**：`ui-layout` AppFrame、原生 SidebarRoot、`ui-workspace`、ConversationRoot、默认 chat、原生 InputBar、Settings 与 ModelSelect 共同组成的页面。
- **ComfyUI Workbench Surface**：只显示 `agentPreset === "harness-comfyui"` 且 `origin !== "subagent"` 的 Session，并显示项目运行、任务、媒体和 Message Context 的页面模式。
- **在工作台复用原生控件**：项目 Shell 仍存在，但工作台显示原生 Settings 与 ModelSelect；该结果不等于完整 Harness 原生 Surface。

## Confirmed facts

- 2026-08-24 只读回读时，GitHub Issue #1 为 OPEN；#2、#3、#16、#17 已 CLOSED；#4–#15 为 OPEN。
- Issue #1 与已关闭 #3 要求停用 `ui-layout`、注册项目唯一 root、由项目 root 声明 `sidebar`、`conversation`、`details`、`shell.overlay`，并固定 `294px minmax(0, 1fr) 432px`。
- 当前 `src/client/index.tsx` 注册项目 root、项目 `layout` provider、项目 Theme projection，并 shadow `sidebar`、`details`、`conversation.session.header`、`conversation.view#chat` 与 `conversation.composer.bar`。
- 当前 Workbench Session binding 在项目 Client plugin 启动时立即运行，并会创建或打开 `harness-comfyui` Session。
- rc.8 Web App composition 仍加载 `ui-sidebar`、`ui-settings`、`ui-settings-general`、`ui-settings-models` 与 `ui-model-selection`。当前缺失的是原生 owner 的可见 render site，不是 Settings 或 Model RPC。
- 原生 SidebarRoot 声明并渲染 `sidebar.settings`；原生 InputBar 声明并渲染 `conversation.input.model`。
- SlotCore 只允许一个 occupant 声明同一个 child slot。项目 shadow occupant 不能重新声明 `sidebar.settings` 或 `conversation.input.model`，也不能借用原 occupant 的 `renderSlot` 授权。本轮内存验证得到：`slot "shared" is already declared (by an entry in "root" (native))`。
- `ui-model-selection` 的 package-level `/client` public export 没有导出 `ModelSelect` React 实现。项目不能通过 public named export 把原生下拉框直接放进项目 composer。
- 原生 `ui-layout` 初始 sidebar 为 280px、details 为 0px；`openDetails()` 打开到 360px，并允许拖动 sidebar 264–420px、details 300–520px。该行为与 #3 的 294px/432px 固定列宽和两个 panel 默认打开冲突。
- Issue #4 要求项目 composer 在一次发送中解析 `ContextRef[]`、生成 `generation-context.v1`、编码图片，并只调用一次 `SessionFace.prompt(parts, 'queue')`。
- 原生 InputBar 的 `conversation.input.dock`、`conversation.input.left` 与 `conversation.input.right` 只接收只读输入快照；项目必须通过公开 `ctx.conversation.input.for(sessionScope)` 取得原生 `SessionInput`，不能只依赖三个渲染 seat 完成 ContextRef 写入。
- Issue #10 与 #11 把工作台入口固定在 #3 交付的项目 top-level sidebar occupant；恢复原生 SidebarRoot后，两个 Issue必须改为使用 workbench mode 的 `sidebar.workspaces` 内容区。
- rc.8 的 `@deepseek-ai/dsh-client-ui-permission-presets` 已注册当前 Session 的 `/permission` popup selector。该 selector 从当前 Session 的 `permissions` projection 读取选项，并通过 `live.command('/permission <preset>')` 写回当前 Session。
- 同一权限插件在 `settings.general.item#permission` 注册“新 Session 默认权限”设置。工作台当前需要的是当前 Session 权限，不应把新 Session 默认值当作当前 Session 值。
- rc.8 的 `@deepseek-ai/dsh-client-ui-skill` 已向 `inputTriggers` 注册 `/` source。该 source 按当前 Session 调用 `connection.api.skills.list({ sessionId })`，选择 Skill 后写入 `/<skill-name> `。
- rc.8 的 `@deepseek-ai/dsh-skill-filesystem` 在启用默认 roots 且 Session 带有 `cwd` 时，从项目 Git root 的 `.dsh/skills` 与 `.agents/skills` 发现 Skill。项目 `.agents/skills` 已属于宿主原生 Skill 数据源，项目 Client 不应读取目录或解析 `SKILL.md`。
- rc.8 原生 `InputBar` 已直接渲染当前 Session 的 `PermissionSelect`，并渲染 `conversation.input.model`。恢复原生 `conversation.composer.bar` 可以一次恢复 ModelSelect、权限下拉框、原生 `/` MenuView、附件和发送状态；项目不需要复制这些控件。
- rc.8 Web composition 已加载 `ui-commands`、`ui-skill`、`ui-model-selection` 与 `ui-permission`。当前工作台缺少 ModelSelect 与权限下拉框的原因是项目 shadow 了 `conversation.composer.bar`，不是原生插件未加载。
- 当前 `startWorkbenchSessionBinding()` 使用 `sessions.create({ cwd: host.cwd, agentPreset: 'harness-comfyui' })`。因此只要项目 Preset 的 filesystem Skill provider启用默认 roots，Skill provider可以从该 cwd 向上确定 Git root 并读取项目 `.agents/skills`。
- 当前 `agent-presets/harness-comfyui/agent.cordis.yml` 把 `dsh-skill-filesystem` 固定为 `includeDefaultRoots: false`、`customSkillDirs: [HARNESS_COMFYUI_SKILL_DIR]`。该配置只允许当前 release 的 `package/skills`，会排除项目 `.agents/skills`，与新增第四项需求直接冲突。
- 已关闭 #16 明确要求项目 Agent 只读取 release `package/skills`，并禁止从默认 Skill roots发现 Skill。新增第四项需求必须由后续 Issue 明确替代 #16 的 `includeDefaultRoots: false` 与相应验收条款；不能把该行为写成无需规格变化的现状。
- rc.8 的公开 `IConversation.input` 返回 `SessionInputResolver`。项目通过 `ctx.sessions.scope(sessionId)`取得当前 Session scope，再调用 `ctx.conversation.input.for(sessionScope)`，可以读取最新 `InputState`并调用 `SessionInput.insertReference()`。
- `SessionInput.insertReference()`同步返回是否接受写入。项目在 Modal确认后按选择顺序逐项读取最新 `input.state.getSnapshot()`；当前状态没有 route occurrence时，项目使用当前 `draftRev`与 `draft.length`的零长度 `TokenSpan`；当前状态存在 route occurrence时，项目使用当前 `draftRev`与该 route occurrence最新 `offset`的零长度 `TokenSpan`。原生 InputMachine为每个 ContextRef创建独立 occurrence并保持 ContextRef在 route之前。
- rc.8 `inputTriggers` 公开 `ReferenceInsert`、`InputTriggerSource`与 `ReferenceCodec.serialize()`。项目注册一个 `generation-context` reference source；原生 InputBar在一次默认提交中按 occurrence顺序解析每个 ContextRef，生成对应 `generation-context.v1` block，再把解析后的单一 text与原生图片附件交给一次默认提交 sink。
- 任一 `ReferenceCodec.serialize()`或原生图片编码失败时，原生 InputBar阻止提交并保留正文、reference occurrence与图片；提交成功时，原生 InputBar清理本次正文、occurrence与图片。该行为满足 #4 的原子消息合同，不需要项目调用第二条 `SessionFace.prompt(parts, 'queue')`路径。
- 原生 InputBar固定在 textarea镜像层渲染每个 occurrence。项目无法通过公开 slot关闭该内联 reference呈现，同时继续使用原生 InputBar。因此 #4的项目自绘上方 chip 1:1条款与本轮四项需求直接冲突；新规格必须采用原生 inline reference chip，并把该变化列为父 Issue #1 的明确原型例外。
- #6与 PRD 05要求项目 composer把独立 Execution Route隐藏状态追加为 `generation-route.v1`，同时要求该状态不形成 ContextRef或 chip。原生 InputBar没有读取项目隐藏状态的提交前转换 Interface；#6必须把显式 Execution Route改为独立的原生 `generation-route` reference occurrence。该 occurrence不属于 ContextRef，也不计入 Message Context数量，但会显示一个原生 inline route reference。

## Design It Twice comparison

三个独立设计分别以最小 Interface、最大宿主复用和最少修改文件为约束。三个设计得到相同的 Seam：项目必须保留原生 SidebarRoot 与原生 InputBar，并让 Workbench 只占用业务展示区域。

- **最小 Interface 设计**：`SurfaceNavigation` 只公开 Surface 状态读取、订阅和模式切换；Implementation拥有 occupant disposer 与 Workbench Session binding。
- **最大复用设计**：Settings、ModelSelect、PermissionSelect 与 `/` Skill Menu全部由 rc.8 原生 Module渲染；项目不创建 Adapter。
- **最少文件设计**：删除项目 root、layout、theme 与 composer shadow；只新增一个 Surface 切换 Module，并修改一项 Preset Skill provider配置。

保留项目 composer并复制 ModelSelect、PermissionSelect 的路线被拒绝。`ModelSelect` 与 `PermissionSelect` 均不是项目可以通过稳定 public named export嵌入的控件；复制 UI会创建重复状态、重复错误处理与第二条提交路径。

## Recommended minimal design

### SurfaceNavigation Interface

`SurfaceNavigation` Module只公开：

```ts
type SurfaceMode = 'native' | 'workbench'

interface SurfaceNavigation {
  getSnapshot(): SurfaceMode
  subscribe(listener: () => void): () => void
  show(mode: SurfaceMode): void
}
```

`SurfaceNavigation` Implementation隐藏 occupant注册顺序、失败回滚、disposer 与 Workbench Session binding。Client plugin卸载时由安装函数返回的 disposer释放整个 Module。

### Surface composition

1. `ui-layout` 成为唯一 root、唯一 `layout` provider和唯一 Theme presenter。
2. 项目删除 root registration、项目 `LayoutController` provider、项目 Theme projection和 `cordis.patch.yml` 中的 `ui-layout disabled`。
3. 项目永久向 `sidebar.footer.action` 注册一个入口。入口在 native mode显示“进入 ComfyUI 工作台”，在 workbench mode显示“返回 Harness”。
4. workbench mode只动态占用 `sidebar.workspaces`、`conversation.session.header`、`conversation.view#chat` 与 `details`。
5. 项目不再占用 `root`、top-level `sidebar`、top-level `conversation` 或 `conversation.composer.bar`。
6. `SurfaceNavigation` 只在 workbench mode启动 `WorkbenchSessionBinding`。native mode不得创建或自动打开项目 Session。
7. 返回 native mode时，项目停止 Workbench binding并保留当前 Session；原生 Session列表负责后续导航。项目不增加 Session复制、恢复或迁移逻辑。
8. 产品启动和页面刷新默认进入 native mode；本版本不增加 URL route、localStorage或 Surface持久化。

### Requirement 1: Harness 原生界面与 Workbench 入口

- native mode完整渲染原生 SidebarRoot、workspace browser、ConversationRoot、InputBar与 Settings。
- workbench mode保留相同的原生 SidebarRoot、ConversationRoot与 InputBar，只替换第 4 条列出的业务区域。
- 原生 SidebarRoot带回 New Session与侧栏折叠控件；新基础 Issue必须明确替代 #17 的相反视觉条款。

### Requirement 2: Workbench Settings 与 ModelSelect

- Workbench Settings继续由 SidebarRoot声明并渲染 `sidebar.settings`。
- Workbench ModelSelect继续由原生 InputBar声明 `conversation.input.model`，并由 `ui-model-selection` occupant渲染。
- 项目不新增 Settings入口、模型 RPC、模型目录缓存或 ModelSelect Adapter。

### Requirement 3: 当前 Agent Session 权限下拉框

- Workbench 原生 InputBar直接渲染 PermissionSelect。
- PermissionSelect从当前 Session的 `permissions` projection读取宿主声明的选项与当前值。
- PermissionSelect通过 `/permission <preset>` 修改当前 Session；项目不得写第二份权限状态。
- 当前 rc.8 Host提供 `read-only`、`workspace-write` 与 `danger-full-access`。高权限选择继续使用原生确认界面。
- Settings中的权限行只修改后续新 Session的默认值，不得替代输入框中的当前 Session权限下拉框。

### Requirement 4: `/` 使用项目 `.agents/skills`

项目只修改 `agent-presets/harness-comfyui/agent.cordis.yml`：

```yaml
includeDefaultRoots: true
```

项目保留现有 `customSkillDirs: [HARNESS_COMFYUI_SKILL_DIR]` 与 `watch: false`。Harness根据 Workbench Session header的 `cwd` 查找最近 Git root，并把 `<projectRoot>/.agents/skills` 中经 Harness原生名称优先级解析后生效、且允许用户调用的 Skill加入 `skill.list`与原生 `/` 菜单。用户选择候选后，原生 UI插入 `/<skill-name> `；用户发送后，Host `dsh-tool-skill`重新解析、校验并注入 Skill正文。

该最小配置还会启用项目 `.dsh/skills` 和标准用户 Skill roots。rc.8没有只启用 project `.agents/skills` 的独立配置项；本方案接受 Harness原生 roots合并与名称优先级，不增加自定义 SkillProvider。新增或修改 Skill在运行期间的实时发现不属于本需求，`watch`保持 `false`。

“项目 `.agents/skills` 中的所有可直接调用 Skill”定义为：目录结构、`SKILL.md` frontmatter与 Skill名称均合法，未设置 `user-invocable: false`，并且经过 Harness原生名称优先级解析后成为同名 Skill最终生效项的 Skill。项目 `.dsh/skills` 的同名 Skill优先于项目 `.agents/skills`；被遮蔽的同名项不会作为第二个候选出现。项目不得绕过 Harness调用策略或名称优先级创建重复菜单项。

## Issue #4 required rewrite

当前 #4 的项目 composer接管、项目 `ContextRef[]`草稿、项目 File/object URL草稿和直接 `SessionFace.prompt(parts, 'queue')`路径与 Requirement 2、3直接冲突。#4必须按以下合同修改：

1. #4删除项目 `conversation.composer.bar` occupant。原生 InputBar继续拥有 textarea、图片附件、发送按钮、ModelSelect、PermissionSelect、`/` Menu与默认提交 sink。
2. #4把“本次消息上下文”标题、数量和“添加上下文”按钮注册到 `conversation.input.dock`。Message Context Modal、Catalog查询、候选详情、分页、确认和已发送消息折叠块继续由项目实现。
3. Modal的 `pendingDialogRefs`只保存未确认选择。用户确认后，项目通过 `ctx.sessions.scope(sessionId)`与 `ctx.conversation.input.for(sessionScope)`取得原生 `SessionInput`。项目先保存确认前的 `draft`，再按选择顺序逐项读取最新 `InputState`。当前状态存在 `source === 'generation-route'`的 occurrence时，项目使用该 occurrence的最新 `offset`作为零长度 `TokenSpan`起止位置；不存在 route occurrence时，项目使用当前 `draft.length`。项目使用当前 `draftRev`调用 `insertReference()`，因此新增 ContextRef恒定排在唯一 route occurrence之前。任一调用返回 `false`时，项目调用 `setDraft()`恢复确认前的 `draft`，保留 Modal选择并显示唯一错误码 `MESSAGE_CONTEXT_INSERT_FAILED`；Modal不得关闭，也不得保留本次部分插入结果。
4. 项目注册一个 codec-only `InputTriggerSource`。该 source固定使用 `trigger: '@'`、`name: 'generation-context'`、`showGroupTitle: false`、返回空数组的 `candidates()`与返回 `undefined`的 `onPick()`；该 source不向 `@`菜单增加候选，只为项目主动插入的 occurrence提供 `ReferenceCodec`。
5. `generation-context` source把 `{ kind, id }`通过项目唯一 ContextRef codec按固定 `kind`、`id`字段顺序编码为 JSON字符串。项目主动插入的 `ReferenceInsert`固定使用 `{ source: 'generation-context', ref: encodedRef, label: contextRef.label, clipboardText: source.codec.clipboardText(encodedRef) }`。`ReferenceCodec.clipboardText(ref)`返回固定 `@generation-context <json>`文本；`ReferenceCodec.serialize(ref, signal)`使用同一 codec解析字符串，通过项目 Remote按稳定 ID读取真实 Catalog快照，并返回一个固定 `generation-context.v1` block。非法字符串或 Catalog解析失败必须拒绝发送。
6. #4采用 Harness原生 textarea inline reference chip。#4删除项目自绘上方 chip的尺寸、删除按钮和 1:1可见条款；父 Issue #1把该变化登记为明确原型例外。用户使用原生文本编辑和 Backspace删除独立 reference occurrence。“本次消息上下文”数量从当前 `InputState.occurrences`中 `source === 'generation-context'`的记录计算，项目不得保存第二份已确认 ContextRef列表。
7. #4删除项目图片编码、File/object URL管理和直接 `SessionFace.prompt()`调用。原生 InputBar附件 rail、图片编码、reference序列化与默认 sink共同完成一次提交。
8. 任一 ContextRef解析或图片编码失败时，原生 InputBar不得写入部分消息，并保留正文、全部 reference occurrence与图片。成功时，Harness Session只增加一条包含正文、全部 `generation-context.v1` block和图片的 user message。
9. #4替代 PRD 03“用户消息 renderer只解析正文末尾 block”的条款。项目唯一 Message Context parser从完整 user message开头扫描到结尾，按出现顺序提取标签完整且 JSON通过运行时 schema的 `generation-context.v1` block。parser删除一个有效项目 block时，同时删除该 block后紧邻的一个由 `insertReference()`产生的 ASCII空格；默认 sink已经 trim消息末尾时，该空格可以不存在。parser不得删除有效 block之外的用户空格或换行。parser把删除有效 block与对应机器分隔空格后的剩余文本作为普通正文。标签不完整、版本未知或 schema不匹配的内容继续显示为普通正文。项目不得增加维持 occurrence为草稿后缀的同步逻辑。
10. #4删除当前“后续 Ticket不得改变 Ticket #16建立的项目 Skill安装边界”段落。#4消费 #18建立的 `includeDefaultRoots: true`：release `package/skills`继续通过 `customSkillDirs`可见，项目 `.agents/skills`通过 Harness默认 roots可见。

#4不得新增 ModelSelect Adapter、PermissionSelect Adapter、第二套 composer、第二份输入状态或第二条提交路径。

## Issue #6 required rewrite

当前 #6 与 PRD 05的项目 Execution Route隐藏状态和直接 `SessionFace.prompt(parts, 'queue')`路径必须按以下合同修改：

1. #6把 Execution Route控件注册到原生 `conversation.input.right`。控件从当前 `InputState.occurrences`中 `source === 'generation-route'`的唯一记录读取当前值；不存在该记录时显示“使用默认实例”。
2. 项目注册第二个 codec-only `InputTriggerSource`。该 source固定使用 `trigger: '@'`、`name: 'generation-route'`、`showGroupTitle: false`、返回空数组的 `candidates()`与返回 `undefined`的 `onPick()`。
3. 当前 `InputState`不存在 `generation-route` occurrence时，用户选择显式实例，控件使用最新 `draftRev`与最新 `draft.length`调用 `SessionInput.insertReference()`插入唯一 route occurrence。调用返回 `false`时，控件保持“使用默认实例”并显示 `EXECUTION_ROUTE_INSERT_FAILED`。项目主动插入的 `ReferenceInsert`固定使用 `{ source: 'generation-route', ref: encodedRoute, label: instanceLabel, clipboardText: source.codec.clipboardText(encodedRoute) }`；`encodedRoute`是固定字段顺序的 JSON字符串 `{"instance_id":"<id>"}`；`clipboardText(ref)`返回固定 `@generation-route <json>`文本；`serialize(ref, signal)`返回固定 `generation-route.v1` block。
4. 当前 `InputState`已经存在 `generation-route` occurrence时，用户选择另一个显式实例或“使用默认实例”，控件拒绝该选择并显示 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST`对应文案：“请先在输入框中删除当前执行路线，再选择新的执行路线。”项目不得调用 `setDraft()`按文本猜测并删除 route occurrence。
5. `generation-route` occurrence不是 ContextRef。“本次消息上下文”数量和 Message Context Modal选择不得读取该 occurrence。
6. #6采用原生 inline route reference。#6删除“Execution Route不生成 chip”的可见条款；父 Issue #1把该变化登记为明确原型例外。
7. 用户把光标放在 route chip之后并按原生 InputBar的 Backspace，或把光标放在 route chip之前并按 Delete时，原生 InputBar按 occurrence identity删除 route。Execution Route控件从更新后的 `InputState`显示“使用默认实例”。用户随后可以选择另一个显式实例。项目不得实现 route替换、route删除或第二份 route草稿状态。
8. 原生 InputBar在同一次默认提交中按 occurrence顺序序列化 `generation-context.v1`与 `generation-route.v1`，并保证唯一 `generation-route.v1`位于全部 `generation-context.v1`之后，再与普通文本和原生图片附件写入一条 user message。普通文本允许位于 reference occurrence之前、之间或之后。
9. #6与 #4共用唯一 user-message parser。该 parser从完整 user message提取 schema有效的 `generation-context.v1`与唯一 `generation-route.v1` block，并把删除有效 block后的剩余文本作为正文。#6删除 PRD 05“route block必须位于正文末尾”的解析前提和项目直接 `SessionFace.prompt()`路径。

## Issue changes

### Parent Issue #1

父 Issue增加并统一定义四项需求：

1. 产品同时提供 Harness native mode与 ComfyUI workbench mode，并从原生左栏双向切换。
2. workbench mode保留原生 Settings与原生 ModelSelect。
3. workbench mode的输入框显示并可以设置当前 Session的 PermissionSelect。
4. Workbench Session的 `/` 菜单列出并调用项目 `.agents/skills` 中经 Harness原生名称优先级解析后生效、且允许用户调用的 Skill。

父 Issue在独立“实现约束”段中规定：项目不得复制 Harness Settings、ModelSelect、PermissionSelect、InputBar、Skill目录扫描或 Skill Menu实现。

父 Issue必须同时修改原型例外段：原生 `ui-layout`列宽与面板行为替代 #3固定 `294px/432px`合同；原生 InputBar的 ModelSelect、PermissionSelect、inline Context reference和inline Route reference替代项目自绘 composer对应区域；存在 Route reference时，用户必须先通过原生 Backspace/Delete删除该 reference，Execution Route控件才能选择默认实例或另一个实例；Message Context Modal、Catalog卡片与已发送消息折叠块继续遵守原型验收。

### New foundation Issue #18

建议标题：`恢复 Harness 原生界面，并在工作台复用原生输入能力`

- Blocked by：#3、#16、#17；三张 Issue均已关闭。
- #18完成后成为 #4 的直接 blocker。
- #18负责唯一 root迁移、`SurfaceNavigation`、`sidebar.footer.action`、workbench动态 occupants、Workbench Session binding生命周期、原生 composer恢复、Preset `includeDefaultRoots: true`、测试和双 Surface浏览器验收。
- #18明确替代 #3 与 #17 的项目 root、固定列宽、项目 composer和原生 SidebarRoot可见条款，并替代 #16 的 `includeDefaultRoots: false` 与“项目 Agent不得读取默认 Skill roots”条款。
- #18更新 `docs/adr/0012-harness-core-is-immutable.md`中的项目 root、项目 composer、项目输入状态与直接 `SessionFace.prompt()`决定；ADR继续保持 Harness Core零修改决定，并改为记录原生 `ui-layout`、SidebarRoot、InputBar与公开 reference Interface。

### Existing Issues

- #4依赖 #18，并按“#4 required rewrite”直接改写 Issue正文与 `docs/v0.1/PRDS/03-message-context-core.md`中的 composer、ContextRef、附件、完整消息 parser、Skill root引用与提交条款。
- #6依赖 #18与 #4，并按“#6 required rewrite”直接改写 Issue正文与 `docs/v0.1/PRDS/05-full-catalog-context-and-route.md`中的 Execution Route、完整消息 parser与提交条款。
- #10与 #11把“项目 top-level sidebar occupant”改成“workbench mode 的 `sidebar.workspaces` 内容区”。
- #13把 Issue正文与 `docs/v0.1/PRDS/12-prompt-skills.md`中的“读取当前普通用户消息中的 `generation-context.v1`快照”明确为扫描完整当前 user message，不依赖 block位于正文末尾。GitHub Issue #12负责多媒体结果交付，不承担 Prompt Skill解析合同。
- #14在 Issue正文与 `docs/v0.1/PRDS/13-release-artifact-acceptance.md`中增加 native/workbench双向切换、Settings、ModelSelect、PermissionSelect、项目 `.agents/skills`、原生 Skill调用、原生 InputBar ContextRef原子发送、显式/默认 Execution Route与唯一 route occurrence验收。
- #3、#16与 #17保持 CLOSED；#18逐条列出被替代的合同，不重新打开已完成 Issue。

## Acceptance boundary

- Composition只有一个 `ui-layout` root、一个 `layout` provider和一个 Theme presenter。
- native mode不注册 workbench occupants，不调用项目 Session create/open。
- workbench mode只注册 `sidebar.workspaces`、`conversation.session.header`、`conversation.view#chat` 与 `details` 的项目 occupants。
- 连续切换十次不产生重复 occupant、订阅或 Session。
- native mode与 workbench mode均可打开 Settings；workbench mode显示并可操作原生 ModelSelect。
- workbench mode显示当前 Session PermissionSelect。用户依次选择 `read-only` 与 `workspace-write` 后，`permissions.currentValue`分别收敛到对应值；选择 `danger-full-access`时显示原生确认界面。
- 受控项目 fixture在 `.agents/skills` 放置两个合法、允许用户调用且没有同名遮蔽的 Skill。原生 `/` 菜单列出二者，选择后插入正确 `/<skill-name> `，发送后产生对应 `skill-invocation`证据。
- 受控项目 fixture同时包含 `user-invocable: false` Skill、frontmatter无效文件，以及被 `.dsh/skills` 同名 Skill遮蔽的 `.agents/skills` Skill。菜单集合必须精确符合 Harness原生调用策略与名称优先级。
- 当前 release `package/skills` 中的项目 Skill继续可用；项目不实现目录扫描、Skill RPC或第二套 Menu。
- #4必须证明 Modal确认的两个 ContextRef分别显示为两个原生 inline reference chip；页面不显示第二组项目自绘 chip；Message Context数量等于两个；Backspace删除一个 occurrence后数量变为一个且剩余顺序不变；复制文本使用固定 `clipboardText()`输出。
- #4必须证明发送正文、两个 ContextRef与一张图片后只增加一条 user message；任一解析或图片编码失败时保留原生草稿、occurrence与图片；`insertReference()`中途返回 `false`时恢复确认前草稿并保留 Modal选择。
- #6必须证明显式实例产生唯一原生 inline route reference且 Message Context数量不变；route存在时选择其他实例或默认实例会显示 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST`并保留原 route；用户通过原生 Backspace/Delete删除 route后，控件显示默认实例并允许选择新实例；同一 user message中的全部 `generation-context.v1`按 occurrence顺序出现，唯一 `generation-route.v1`位于全部 Context block之后。
- 联合验收必须依次执行：用户先选择显式 Execution Route，再通过 Modal确认两个 ContextRef，再在 textarea的 reference之后继续输入正文，然后发送。Harness Session只增加一条 user message；完整消息 parser提取两个 Context block和一个 Route block；Route block位于两个 Context block之后；删除三个有效 block后的剩余文本等于用户输入正文。
- 联合验收正文必须包含用户主动输入的空格和换行。三个 reference分别产生一个机器 ASCII分隔空格；完整消息 parser删除三个有效 block与三个对应机器分隔空格后，剩余正文必须逐字符等于用户输入正文，并保留用户自己的全部空格与换行。
- `1440×1000`分别保存 native、workbench、Settings、ModelSelect、PermissionSelect与 `/` Skill Menu浏览器证据，并由非实现者独立验收。
- 不新增依赖，不修改 DeepSeek Harness包，不使用深路径导入上游 React实现。

## Minimal-change defaults

- 产品启动与刷新默认进入 native mode。
- Surface状态不持久化。
- 返回 native mode保留当前 Session。
- 原生 SidebarRoot的 New Session与折叠控件保持可见。
- `includeDefaultRoots: true`启用的其他 Harness默认 Skill roots保持可见。
- filesystem Skill provider继续使用 `watch: false`。

## 2026-08-24 v0.2 main基线重写

- 当前 `main`、`origin/main`和 tag `v0.2`共同指向提交 `4f5a14b1c1306080bdeb1e3a8dccb13ad435dd38`。
- `5010c2a..4f5a14b`删除旧 Release Artifact、install、upgrade、rollback、release-smoke与多 Configuration Profile体系，并建立源码直接运行、单一 production配置和六个 production生命周期操作。
- 当前工作区存在其他任务已经暂存和未跟踪的改动；本次 Issue重写只使用 `git show 4f5a14b:<path>`读取提交基线，不把工作区改动当作已提交事实。
- rc.8 Web composition已经包含启用状态的 `ui-trajectory` Loader row。
- `@deepseek-ai/dsh-client-ui-trajectory@0.1.0-rc.8`向 `conversation.view`注册 `id: "trajectory"`、`order: 10`和 locale标签“轨迹”或“Trajectory”。
- 原生 TrajectoryView提供按 Turn和 Step组织的 user、Assistant、Tool、Subtool和 Compaction记录、Overview时间线、Duration与实际时间切换、Turns与 Calls折叠、搜索、区间选择、缩放、平移、局部检查器和更早历史加载。
- 用户要求以当前 main提交基线重写 Issue #18完整正文，并把 Harness顶部原生轨迹入口和功能纳入 workbench mode。
- `@deepseek-ai/dsh-base@0.1.0-rc.8`定义宿主基础 `dsh-skill-filesystem`和 `dsh-tool-skill` row，但是 `@deepseek-ai/dsh-web-app@0.1.0-rc.8`把两个 row设为 `disabled: true`。v0.2 Product Agent Preset没有旧 filesystem配置，因此 #18必须新增唯一 Preset scoped filesystem provider和唯一 `dsh-tool-skill`；filesystem配置固定为 `includeDefaultRoots: true`，不增加旧 `customSkillDirs`或 release Skill目录。
- v0.2 Client plugin恢复原生父界面后只需要 `slots`、`sessions`和 `connection`三项 Cordis service。Settings、ModelSelect、PermissionSelect、Skill菜单与 Trajectory由 Web composition中的原生插件拥有；项目不需要新增 `remote`、`conversation`、`inputTriggers`或 `theme` service。
- 当前 `scripts/production/health.mjs`把 `ui-layout`列为禁止 bundle；#18必须把 `ui-layout`、`ui-model-selection`、`ui-permission-presets`、`ui-skill`和 `ui-trajectory`改为目标功能的必需 boot graph条目。
- 当前 `scripts/security/check-harness-boundary.mjs`把 `ui-layout disabled`写入根 patch的精确合同；#18必须把该合同改成只允许项目 Host plugin插入项。
- 当前 ADR 0006、ADR 0012、PRD 02、PRD 16和系统架构文档仍描述项目 root、项目 composer、项目 layout与项目 theme；#18必须同步这些当前文档，不能只修改 ADR 0012。
- 完整重写草稿位于 `.planning/issue-1-native-ui-entry-discussion/publication/issue-18-v0.2-body.md`。草稿没有引用旧不可变计划作为执行来源，并明确拒绝旧 Artifact、`package/skills`、把不存在的旧 Preset字段描述成修改操作和多余 Client service。
- 独立语义第二次审查确认两项剩余缺口：Skill组合测试缺少 `disable-model-invocation: true`的仅用户调用分支；PRD 03、PRD 04和 PRD 12仍保留旧项目 composer、项目根目录 `skills/`或 `includeDefaultRoots: false`描述。
- Issue #18草稿已经增加仅用户调用 Skill的菜单标记、显式调用和模型自动调用目录排除验收，并把 PRD 03、PRD 04和 PRD 12纳入限定范围的 owner、Skill目录和 provider描述同步。
