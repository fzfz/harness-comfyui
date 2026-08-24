# Harness 原生 Surface 与输入能力实施计划

## 目标

计划执行者必须用 DeepSeek Harness `0.1.0-rc.8` 的公开插件接口完成以下四项产品需求：

1. 产品必须保留完整 Harness 原生界面，并在原生左侧栏提供进入和退出 ComfyUI 工作台的双向入口。
2. ComfyUI 工作台必须保留 Harness 原生 Settings入口和原生 ModelSelect。
3. ComfyUI 工作台的原生 InputBar必须显示并设置当前 Session的 PermissionSelect。
4. 用户在 Workbench Session输入 `/` 后，Harness原生 Skill菜单必须列出并调用项目 `.agents/skills`目录中经过宿主规则解析后生效的用户可调用 Skill。

计划执行者不得复制 Harness Settings、ModelSelect、PermissionSelect、InputBar、Skill目录扫描器或 Skill菜单。计划执行者不得新增 package dependency，不得修改 DeepSeek Harness package，不得导入 `@deepseek-ai/*/src/*`。

## 术语

- **native mode**：`ui-layout` AppFrame、原生 SidebarRoot、`ui-workspace`、ConversationRoot、默认 chat、原生 InputBar、Settings与 ModelSelect共同组成的页面模式。
- **workbench mode**：原生 AppFrame、SidebarRoot、ConversationRoot和 InputBar保持运行，项目只替换工作台业务内容的页面模式。
- **Context reference**：`InputState.occurrences`中 `source === "generation-context"`的原生 reference occurrence。
- **Route reference**：`InputState.occurrences`中 `source === "generation-route"`的唯一原生 reference occurrence。Route reference不属于 Message Context，也不进入 Message Context数量。
- **项目 `.agents/skills` 中的用户可调用 Skill**：目录结构、`SKILL.md` frontmatter和 Skill名称均合法，未设置 `user-invocable: false`，并在 Harness原生同名优先级处理后成为最终生效项的 Skill。

## 规格优先级

本计划中关于 root、Surface、composer、Context reference、Route reference、Skill roots和对应视觉验收的条款，替代 Issue #1、已关闭 Issue #3、已关闭 Issue #16、已关闭 Issue #17以及开放 Issue #4、#6、#10、#11、#13、#14中的冲突条款。数据源 v0.82.2 envelope、Run Repository、Generation Tool、媒体交付和产品管理 CLI合同保持不变。

## Issue图

- 新建 Issue #18：`恢复 Harness 原生界面，并在工作台复用原生输入能力`。
- Issue #18以已关闭的 Issue #3、#16和 #17交付结果作为迁移基线；这三张已关闭 Issue不构成未完成 blocker，计划执行者不重新打开它们。
- Issue #4直接依赖 Issue #18。
- Issue #6直接依赖 Issue #18和 Issue #4。
- Issue #10和 Issue #11消费 Issue #18提供的 workbench mode `sidebar.workspaces`内容区。
- Issue #13消费 Issue #4提供的完整用户消息解析合同。
- Issue #14验收 Issue #18、#4、#6、#10、#11和 #13共同交付的最终产品行为。

## Issue #18：恢复 Harness 原生界面，并在工作台复用原生输入能力

### 实现责任

1. 计划执行者必须恢复 `ui-layout`，并让 `ui-layout`成为唯一 root注册者、唯一 `layout` provider和唯一 Theme presenter。
2. 计划执行者必须删除项目 root registration、项目 `LayoutController` provider、项目 Theme projection以及 `cordis.patch.yml`中禁用 `ui-layout`的配置。
3. 计划执行者必须实现唯一 `SurfaceNavigation`模块：

```ts
type SurfaceMode = 'native' | 'workbench'

interface SurfaceNavigation {
  getSnapshot(): SurfaceMode
  subscribe(listener: () => void): () => void
  show(mode: SurfaceMode): void
}
```

4. `SurfaceNavigation`实现必须持有工作台 occupant disposer和 `WorkbenchSessionBinding`生命周期；Client plugin卸载时必须释放模块创建的全部注册与订阅。
5. 项目必须永久向 `sidebar.footer.action`注册一个入口。native mode显示“进入 ComfyUI 工作台”；workbench mode显示“返回 Harness”。
6. 除永久注册的 `sidebar.footer.action`入口外，workbench mode只能动态注册 `sidebar.workspaces`、`conversation.session.header`、`conversation.view#chat`和 `details`四个项目 occupant。
7. 项目不得注册 `root`、top-level `sidebar`、top-level `conversation`或 `conversation.composer.bar` occupant。
8. `SurfaceNavigation`只能在 workbench mode启动 `WorkbenchSessionBinding`。native mode不得创建或自动打开 `harness-comfyui` Session。
9. 用户返回 native mode时，项目必须停止 Workbench Session binding并保留当前 Session。项目不得复制、迁移或恢复 Session。
10. 产品启动和页面刷新必须进入 native mode。项目不得为 Surface增加 URL route、localStorage或其他持久状态。
11. native mode与 workbench mode必须继续使用原生 SidebarRoot、ConversationRoot和 InputBar。原生 SidebarRoot必须保留 New Session和折叠控件。
12. Settings必须继续由 SidebarRoot声明的 `sidebar.settings`渲染。ModelSelect必须继续由原生 InputBar声明的 `conversation.input.model`渲染。
13. 原生 InputBar必须继续显示当前 Session的 PermissionSelect。PermissionSelect必须从当前 Session的 `permissions` projection读取选项和当前值，并通过原生 `/permission <preset>`命令写回当前 Session。
14. Settings中的权限行只能修改新 Session默认权限，不得替代 InputBar中的当前 Session权限。
15. 计划执行者必须把 `agent-presets/harness-comfyui/agent.cordis.yml`中的 `includeDefaultRoots`改为 `true`，同时保留 `customSkillDirs: [HARNESS_COMFYUI_SKILL_DIR]`和 `watch: false`。
16. Harness必须根据 Workbench Session的 `cwd`定位项目 Git root，并合并项目 `.dsh/skills`、项目 `.agents/skills`、标准用户 Skill roots和 release `package/skills`。计划执行者不得新增 SkillProvider或 Skill列表 RPC。
17. Harness原生同名优先级和 `user-invocable`规则必须决定 `/`菜单的最终候选集合。项目 `.dsh/skills`中的同名 Skill优先于项目 `.agents/skills`中的同名 Skill；被遮蔽项不得产生第二个候选。
18. 用户选择 Skill后，原生 UI必须插入 `/<skill-name> `。用户发送消息后，Host `dsh-tool-skill`必须重新发现、校验并注入对应 Skill。
19. 计划执行者必须更新 `docs/adr/0012-harness-core-is-immutable.md`。ADR必须保留 Harness Core零修改决定，并用原生 `ui-layout`、SidebarRoot、InputBar与公开 reference接口替代项目 root、项目 composer、项目已确认 `ContextRef[]`草稿、项目 File/object URL草稿、项目 Execution Route草稿状态和直接 `SessionFace.prompt()`决定。ADR必须批准项目 Client plugin使用 `conversation` Cordis service，并删除“后续 Issue不得增加 Client service”的冲突条款。
20. 计划执行者必须更新 `CONTEXT.md`。`Workbench Desktop Shell Composition`必须改为原生 `ui-layout`与四个 workbench动态 occupant的组合；`Generation Context V1 Block`必须改为由 Context reference序列化并由完整用户消息 parser提取。`CONTEXT.md`必须定义 native mode、workbench mode、Context reference和 Route reference。
21. 计划执行者必须把 `src/client/index.tsx`导出的 Cordis service数组精确改为 `['slots', 'sessions', 'remote', 'inputTriggers', 'connection', 'conversation']`。项目删除 Theme projection后必须从该数组删除 `theme`；项目通过 `conversation` service调用 `ctx.conversation.input.for(sessionScope)`。`package.json.dsh.client.inject`已经包含 `@deepseek-ai/dsh-client-ui-conversation`，本项不得新增 package dependency。

### 自动化验收

1. Composition测试必须证明页面只存在一个 root注册、一个 `layout` provider和一个 Theme presenter。
2. native mode测试必须证明项目没有注册四个 workbench occupant，也没有调用项目 Session create/open。
3. workbench mode测试必须证明项目只动态注册四个允许的 workbench occupant；该计数不包含永久注册的 `sidebar.footer.action`入口。
4. Surface测试必须连续切换十次，并证明没有重复 occupant、重复订阅或重复 Session。
5. Permission测试必须证明用户选择 `read-only`和 `workspace-write`后，当前 Session的 `permissions.currentValue`分别收敛到对应值；用户选择 `danger-full-access`时必须出现原生确认界面。
6. Skill fixture必须包含两个合法且没有同名遮蔽的用户可调用 Skill、一个 `user-invocable: false` Skill、一个 frontmatter无效文件和一个被 `.dsh/skills`同名项遮蔽的 `.agents/skills` Skill。
7. Skill测试必须证明 `/`菜单候选精确符合 Harness原生调用规则，选择后插入正确文本，发送后产生对应 `skill-invocation`证据。
8. Skill测试必须证明 release `package/skills`中的项目 Skill继续可用。

### 浏览器验收

独立视觉审核者必须在 `1440×1000`分别保存 native mode、workbench mode、Settings、ModelSelect、PermissionSelect和 `/` Skill菜单的浏览器证据。独立视觉审核者必须验证双向入口、原生 New Session、原生侧栏折叠、当前 Session权限修改和项目 Skill调用。浏览器验收必须证明：页面启动时 native mode没有 Workbench Session binding；用户进入 workbench mode后只建立一个 binding；用户返回 native mode后停止该 binding；用户刷新页面后仍进入 native mode，并且项目没有创建或自动打开 Workbench Session。

## Issue #4：使用原生 InputBar提交 Message Context

### 实现责任

1. 计划执行者必须删除项目 `conversation.composer.bar` occupant、项目已确认 `ContextRef[]`草稿、项目 File/object URL草稿和项目直接 `SessionFace.prompt(parts, 'queue')`路径。
2. 原生 InputBar必须继续拥有 textarea、图片附件、发送按钮、ModelSelect、PermissionSelect、`/`菜单和默认提交 sink。
3. 项目必须把“本次消息上下文”标题、数量和“添加上下文”按钮注册到 `conversation.input.dock`。Message Context Modal、Catalog查询、候选详情、分页、确认和已发送消息折叠块继续属于项目。
4. Modal的 `pendingDialogRefs`只能保存未确认选择。用户确认后，项目必须通过 `ctx.sessions.scope(sessionId)`与 `ctx.conversation.input.for(sessionScope)`取得原生 `SessionInput`。
5. 项目必须先保存确认前的 `draft`，再按 Modal选择顺序逐项读取最新 `InputState`。当前状态存在 Route reference时，项目必须在该 occurrence最新 `offset`使用零长度 `TokenSpan`；当前状态不存在 Route reference时，项目必须在当前 `draft.length`使用零长度 `TokenSpan`。每次 `insertReference()`必须使用当前 `draftRev`。
6. 计划执行者必须创建唯一结构化映射 `src/client/workbench/input-error-messages.ts`，并在该映射中定义 `MESSAGE_CONTEXT_INSERT_FAILED: '无法把已选消息上下文加入当前输入框，请保留选择并重试。'`。任一 `insertReference()`返回 `false`时，项目必须调用 `setDraft()`恢复确认前的 `draft`，保留 Modal选择，保持 Modal打开，并从该映射显示 `MESSAGE_CONTEXT_INSERT_FAILED`对应文案。项目不得保留本次确认产生的部分插入结果。
7. 项目必须注册 codec-only `InputTriggerSource`。该 source固定使用 `trigger: '@'`、`name: 'generation-context'`、`showGroupTitle: false`、返回空数组的 `candidates()`和返回 `undefined`的 `onPick()`。
8. 项目唯一 ContextRef codec必须把 `{ kind, id }`编码为固定 `kind`、`id`字段顺序的 JSON字符串。
9. 项目主动插入的 `ReferenceInsert`必须是 `{ source: 'generation-context', ref: encodedRef, label: contextRef.label, clipboardText: source.codec.clipboardText(encodedRef) }`。
10. `clipboardText(ref)`必须返回 `@generation-context <json>`。`serialize(ref, signal)`必须使用同一 codec解析字符串，通过项目 Remote按稳定 ID读取真实 Catalog快照，并返回一个 `generation-context.v1` block。非法字符串或 Catalog解析失败必须拒绝发送。
11. 原生 InputBar必须显示每个 Context reference的 inline chip。项目必须删除自绘上方 chip、其删除按钮和对应视觉合同。
12. “本次消息上下文”数量必须从当前 `InputState.occurrences`中 `source === 'generation-context'`的记录计算。项目不得保存第二份已确认 ContextRef列表。
13. 原生 InputBar必须负责图片附件、图片编码、reference序列化和默认提交。解析或图片编码失败时，Harness不得写入部分消息，并必须保留正文、全部 reference occurrence和图片。成功时，Harness Session只能增加一条 user message。
14. 项目唯一 user-message parser必须扫描完整 user message，并按出现顺序提取标签完整且 JSON通过运行时 schema的 `generation-context.v1` block。
15. parser删除一个有效项目 block时，必须同时删除该 block后紧邻的一个由 `insertReference()`生成的 ASCII空格；默认 sink已经 trim消息末尾时，该空格可以不存在。parser不得删除用户输入的其他空格或换行。
16. 标签不完整、版本未知或 schema不匹配的内容必须保留为普通正文。项目不得增加维持 reference occurrence位于草稿末尾的同步逻辑。
17. Issue #4必须删除禁止后续 Issue修改 Issue #16 Skill roots边界的条款，并消费 Issue #18的 `includeDefaultRoots: true`。
18. 计划执行者必须同步修改 `docs/v0.1/PRDS/03-message-context-core.md`中的 composer、ContextRef、附件、完整消息 parser、Skill roots和提交合同。

### 验收

1. Modal确认两个 ContextRef后，原生 InputBar必须显示两个 inline reference chip，页面不得显示第二组项目 chip，Message Context数量必须等于二。
2. 用户用原生 Backspace删除一个 occurrence后，数量必须等于一，剩余 Context reference顺序必须保持不变。
3. 用户发送正文、两个 ContextRef和一张图片后，Harness Session只能增加一条 user message。
4. ContextRef解析或图片编码失败时，原生草稿、reference occurrence和图片必须全部保留。
5. `insertReference()`中途返回 `false`时，项目必须恢复确认前草稿并保留 Modal选择。
6. 用户复制原生 Context reference时，剪贴板必须得到且只得到 `@generation-context <json>`。

## Issue #6：使用原生 Route reference提交 Execution Route

### 实现责任

1. 项目必须把 Execution Route控件注册到 `conversation.input.right`。控件必须从当前 `InputState.occurrences`中的唯一 Route reference读取当前值；不存在 Route reference时必须显示“使用默认实例”。
2. 项目必须注册 codec-only `InputTriggerSource`。该 source固定使用 `trigger: '@'`、`name: 'generation-route'`、`showGroupTitle: false`、返回空数组的 `candidates()`和返回 `undefined`的 `onPick()`。
3. 当前输入不存在 Route reference时，用户选择显式实例，项目必须使用最新 `draftRev`和最新 `draft.length`调用 `SessionInput.insertReference()`。
4. Issue #6必须在 `src/client/workbench/input-error-messages.ts`中增加 `EXECUTION_ROUTE_INSERT_FAILED: '无法把所选执行路线加入当前输入框，请重试。'`和 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST: '请先在输入框中删除当前执行路线，再选择新的执行路线。'`。`insertReference()`返回 `false`时，控件必须保持“使用默认实例”，并从该映射显示 `EXECUTION_ROUTE_INSERT_FAILED`对应文案。
5. Route `ReferenceInsert`必须是 `{ source: 'generation-route', ref: encodedRoute, label: instanceLabel, clipboardText: source.codec.clipboardText(encodedRoute) }`。`encodedRoute`必须是固定字段顺序的 JSON字符串 `{"instance_id":"<id>"}`；`clipboardText(ref)`必须返回 `@generation-route <json>`；`serialize(ref, signal)`必须返回一个 `generation-route.v1` block。
6. 当前输入已经存在 Route reference时，用户选择另一个显式实例或“使用默认实例”，控件必须拒绝选择，并从 `src/client/workbench/input-error-messages.ts`显示 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST`对应文案。
7. 用户必须使用原生 InputBar的 Backspace或 Delete按 occurrence identity删除 Route reference。删除后，控件必须显示“使用默认实例”，并允许用户选择新的显式实例。
8. 项目不得通过 `setDraft()`猜测 Route reference文本，不得实现 route替换、route删除或第二份 route草稿状态。
9. Route reference不得进入 Message Context数量和 Modal选择。
10. 原生 InputBar必须显示 Route reference的 inline chip。Issue #6必须删除“Execution Route不生成 chip”的条款。
11. 原生 InputBar必须在一次默认提交中按 occurrence顺序序列化全部 `generation-context.v1` block和唯一 `generation-route.v1` block。Issue #4的插入规则必须保证 Route reference位于全部 Context reference之后。普通文本可以位于 reference occurrence之前、之间或之后。
12. Issue #6必须与 Issue #4共用唯一完整用户消息 parser。parser必须提取 schema有效的 Context block和唯一 Route block，并把删除有效 block及对应机器 ASCII分隔空格后的剩余文本作为普通正文。
13. Issue #6必须删除 route block位于正文末尾的解析前提和项目直接 `SessionFace.prompt()`路径。
14. 计划执行者必须同步修改 `docs/v0.1/PRDS/05-full-catalog-context-and-route.md`中的 Execution Route、完整消息 parser和提交合同。

### 验收

1. 显式实例必须产生唯一 inline Route reference，Message Context数量不得变化。
2. Route reference存在时，选择另一个实例或默认实例必须显示 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST`并保留原 Route reference。
3. 用户用原生 Backspace或 Delete删除 Route reference后，控件必须显示默认实例并允许选择新实例。
4. 同一 user message中的全部 Context block必须保持 occurrence顺序；唯一 Route block必须位于全部 Context block之后。
5. 联合验收必须依次选择显式 Execution Route、通过 Modal确认两个 ContextRef、在 reference之后继续输入包含空格和换行的正文，然后发送。Harness Session只能增加一条 user message。
6. 完整消息 parser必须提取两个 Context block和一个 Route block。parser删除三个有效 block与三个对应机器 ASCII分隔空格后，剩余文本必须逐字符等于用户输入正文，并保留用户输入的全部空格与换行。

## Issue #10与 Issue #11：左侧栏入口归属

Issue #10和 Issue #11必须把“项目 top-level sidebar occupant”替换为“workbench mode的 `sidebar.workspaces`内容区”。两张 Issue不得注册 top-level `sidebar` occupant，也不得接管 `sidebar.settings`或 `sidebar.footer.action`。

## Issue #13：Prompt与 LoRA Skill读取完整用户消息

Issue #13必须要求 `anima-prompt-builder`、`wai-sdxl-prompt-builder`和 `lora-adjustment`扫描完整当前 user message中的 schema有效 `generation-context.v1` block。这三个 Skill不得假设 Context block位于正文末尾。计划执行者必须同步修改 `docs/v0.1/PRDS/12-prompt-skills.md`。Issue #12负责多媒体结果交付，不承担本条解析合同。

## Issue #14：最终产品验收

Issue #14必须增加以下真实产品验收：

1. 用户从 native mode左侧栏进入 workbench mode，再从同一入口返回 native mode。验收必须证明进入 workbench mode只建立一个 Workbench Session binding，返回 native mode停止该 binding；用户随后刷新页面时必须进入 native mode，并且项目不得创建或自动打开 Workbench Session。
2. native mode和 workbench mode均能打开 Settings；workbench mode显示并操作原生 ModelSelect。
3. workbench mode的原生 InputBar显示当前 Session PermissionSelect，并完成 `read-only`、`workspace-write`和 `danger-full-access`确认路径。
4. Workbench Session输入 `/`后，原生菜单显示项目 `.agents/skills`中符合宿主规则的用户可调用 Skill；用户选择、发送并产生真实 Skill Invocation。
5. 原生 InputBar完成两个 Context reference、一张图片和普通正文的单条 user message原子提交。
6. 显式 Execution Route生成唯一 Route reference；默认路线不生成 Route reference；Route reference存在时，用户必须先用原生 Backspace或 Delete删除它，再选择默认实例或另一个显式实例。
7. 完整用户消息 parser从同一消息提取全部 Context block和唯一 Route block，并逐字符保留用户正文中的空格与换行。
8. 独立视觉审核者在 `1440×1000`验收 native mode、workbench mode、Settings、ModelSelect、PermissionSelect、`/` Skill菜单、Context reference和 Route reference。

计划执行者必须同步修改 `docs/v0.1/PRDS/13-release-artifact-acceptance.md`。

## 原型例外

父 Issue #1必须把以下差异登记为明确原型例外：

1. 原生 `ui-layout`的列宽、面板初始状态和调整行为替代 Issue #3的固定 `294px/432px`合同。
2. 原生 InputBar的 ModelSelect、PermissionSelect、Context inline reference和 Route inline reference替代项目自绘 composer对应区域。
3. Route reference存在时，用户必须先通过原生 Backspace或 Delete删除当前路线，Execution Route控件才能接受默认实例或另一个显式实例。
4. Message Context Modal、Catalog候选卡片、候选详情、分页和已发送消息折叠块继续按原型验收。

## 完成边界

本计划只修改 GitHub Issue规格和后续执行责任，不实现产品代码。Issue执行者必须在各自隔离 worktree中修改产品代码、ADR和 PRD，执行各 Issue要求的自动化测试、真实 Product Installation流程和独立浏览器验收。
