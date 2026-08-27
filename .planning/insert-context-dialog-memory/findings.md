# “插入上下文”弹窗选择记忆调研记录

## 用户需求

- 中间列“插入上下文”按钮打开的弹窗需要恢复上一次关闭前的交互状态。
- 待恢复状态包括顶部底模、左侧选中项、展示区当前分页和搜索词。
- 每个 Session 必须保存自己的弹窗导航状态。用户切换到另一个 Session 时，另一个 Session 必须使用自己的状态；用户切回原 Session 时，Client 必须恢复原 Session 的状态。
- 计划执行者必须等待用户批准方案后才能实施业务代码和测试代码变更。

## 当前已知事实

- 独立 worktree 路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-insert-context-dialog-memory`。
- 独立分支为 `codex/plan-insert-context-dialog-memory`。
- 独立 worktree 起点为 `main` 的提交 `eea9c4d307e90c6d68bd2da37b69fe0891a9992f`。
- 主 worktree 存在用户未提交的删除与新增文件；本次工作不会触碰这些文件。

## 源代码调研结果

- `docs/system/architecture.md` 明确把上下文选择器归属到 `src/client/`。
- `docs/system/directory-structure.md` 明确把 `src/client/` 定义为 Harness 原生扩展位、上下文选择器和 Run/Media 结果列所在目录。
- `src/client/workbench/contract.ts` 第 12 行包含“插入上下文”按钮的唯一中文合同字符串。
- `prototype/generation-workbench/tests/prototype-contract.test.mjs` 包含上下文选择弹窗的原型合同测试；原型不是运行时数据来源。
- 运行时相关候选文件为 `src/client/workbench/contract.ts`、`controller.ts` 和 `native-surfaces.tsx`；对应测试候选文件为 `tests/unit/workbench-controller.test.ts` 与 `tests/unit/native-surfaces.test.tsx`。
- `WorkbenchDock` 在 `src/client/workbench/native-surfaces.tsx` 中拥有全部弹窗交互状态。顶部底模对应 `selectedBaseModelId`，左侧资源种类对应 `selectedKind`，搜索输入对应 `queryText`，已提交搜索词对应 `submittedQuery`，分页对应 `currentPage`，当前查询结果对应 `page`，弹窗内临时勾选对应 `selectedOptions`。
- `openDialog()` 每次执行时把 `selectedKind` 重置为 `comfyui-template`、把 `selectedBaseModelId` 重置为 `null`、把 `queryText` 与 `submittedQuery` 重置为空字符串、把 `currentPage` 重置为 `1`。该函数是用户报告行为的直接原因。
- `openDialog()` 每次执行时从当前原生草稿的上下文记录重建 `selectedOptions`。该逻辑保证已经确认并显示为 chip 的上下文在再次打开时仍然勾选。
- `closeDialog()` 关闭弹窗、关闭底模菜单并清空 `selectedOptions`；该函数不重置底模、资源种类、搜索词和页码。
- 两个查询 `useEffect` 都以 `dialogOpen` 为门禁。弹窗关闭时，effect cleanup 会中止尚未完成的底模请求和候选请求；弹窗再次打开时，Client 会使用当时的状态重新查询。
- `WorkbenchDock` 在工作台关闭时返回 `null`，但是 React 模块中的 hook 状态仍归属同一个 `WorkbenchDock` 实例；只要 Harness 没有卸载该 slot 实例，移除 `openDialog()` 的导航状态重置就能在当前组件生命周期内恢复上次导航位置。
- `src/client/index.tsx` 为每个 Session 输入区注册 `WorkbenchDock`，并向该模块注入 Session 级 `sessionInput` 与共享 `WorkbenchController`。是否跨 Session 保留状态取决于 Harness 对 `conversation.input.dock` slot 实例的挂载策略，当前代码没有显式的 Session ID 状态键。
- 主 worktree 的现有 Harness `node_modules` 可读，但是已安装包中没有可直接搜索到的 `conversation.input.dock` 字符串。当前证据不能证明 Harness 在 Session 切换时复用还是重建 `WorkbenchDock` React 实例。
- 用户已明确否定“状态只归属当前 `WorkbenchDock` React 实例”的范围。新方案不得依赖 Harness 是否复用 React 实例。
- `src/client/index.tsx` 的 `conversation.input.dock` 注入函数接收 `sessionId`，再通过 `clientSessions.scope(sessionId)` 和 `ctx.conversation.input.for(sessionContext)` 创建当前 Session 的输入 adapter。当前 `WorkbenchDockProps` 没有接收 `sessionId`。
- 已安装 `@deepseek-ai/dsh-client-runtime@0.1.1-rc.2` 文档说明 Session scope 使用 Session/Agent 共用 ID 作为 key，并在 Session 进入客户端列表时创建、在 prune 时销毁。该文档没有提供供项目 Client 写入任意弹窗 UI 状态的公开 interface。
- Session 原生草稿只能保存将被发送的正文与结构化上下文 JSON；弹窗底模、资源种类、搜索词和页码不能写入草稿。
- 在不修改 Harness Host 合同的前提下，项目 Client 可以创建一个随插件 `apply()` 生命周期存在的 Session 导航状态 module，并以 `sessionId` 为 key 保存每个 Session 的导航状态。该 module 能保证同一浏览器 Client 运行期间切换 Session 后恢复各自状态。
- 浏览器刷新或 Client 插件重新加载会销毁纯内存 module。是否要求刷新后继续恢复属于尚未确认的持久化范围；实现前需要用户明确选择。
- 用户已经确认：每个 Session 的弹窗导航记忆在浏览器刷新和 Client 重启后也必须保留。
- 仓库的 `src/client/` 与 `tests/unit/` 当前没有使用 `localStorage`、`sessionStorage` 或 IndexedDB 的既有实现；本需求需要定义一个项目内唯一的浏览器存储 key 和结构化 JSON 数据。
- `src/client/index.tsx` 的 `apply()` 是创建持久化导航 store 的单一位置；`conversation.input.dock` 注入函数已经把 `sessionId` 交给插件。插件卸载 disposer 必须释放内存订阅者，但不得删除持久化记录。
- 已安装 `@deepseek-ai/dsh-client-runtime` 文档把 Session 描述为 Host 创建并持久化的实体，Client 列表、打开、恢复和 fork 都使用同一个 Session ID 寻址。因此 `sessionId` 可以作为浏览器刷新和 Client 重启后的持久化 key；React 实例、临时 scope 对象或 Session 标题不能作为 key。
- `CatalogKind` 的唯一结构化来源是 `src/catalog/contract.ts` 中的 `CATALOG_KIND_DEFINITIONS`。持久化读取必须用该常量验证 `selectedKind`，不能复制另一份资源种类字符串清单。
- `CatalogQueryRequest` 已经约束查询词、页码和底模 ID；持久化 module 只需严格验证五个导航属性，不需要保存 `CatalogPage`、加载状态或错误响应。
- `tsconfig.json` 已启用 DOM 类型，因此源码可以直接使用浏览器 `Storage` 类型；`package.json` 不需要新增依赖。
- 当前单元测试使用 Node 环境，`tests/unit/client-plugin.test.ts` 没有浏览器 `localStorage`。实施测试必须向 `ContextDialogNavigationStore` 注入只含 `getItem`、`setItem` 的内存 Storage adapter，Client 插件组合测试必须显式安装同一 adapter 或 stub 浏览器 Storage。
- 项目已有 `GenerationProjectionStore` 采用 `getSnapshot`、`subscribe`、Session key 和 `dispose` 的 module 形状。导航 store 可以复用该仓库内 interface 风格，同时把 JSON 解析、严格校验和 Storage 写入隐藏在 module 内。
- `config/error-catalog.json` 是 Client 可见错误文案的唯一结构化来源。持久化读取、结构校验或写入失败若需要在 Modal 中展示，方案必须新增唯一错误码，不能在 `native-surfaces.tsx` 内拼接临时错误文案。
- `native-surfaces.tsx` 已有 Modal 内状态错误展示位置。持久化 store 可以把存储失败作为快照中的错误码发布，Dock 通过现有错误目录渲染；该做法能避免静默降级，也不需要新增全局通知 module。
- 每个 Session 使用一个版本化 `localStorage` key 可以避免 Session A 更新时重写 Session B 的 JSON，也不需要维护全局 Session 索引。该方案不自动清理已经删除 Session 的小型记录；浏览器站点数据清理可以删除这些记录。
- 独立 Reviewer 发现持久化 schema 必须复用 Catalog 查询词、页码与稳定 ID 的现有约束，否则恢复值可能通过持久化校验但被 `parseCatalogQueryRequest()` 拒绝。
- `parseCatalogQueryRequest()` 当前内部使用私有 `queryText()`、`pageNumber()` 与 `stableId()`。实施必须导出并复用这三个解析器，同时在 `tests/unit/catalog-contract.test.ts` 固定原约束。
- 恢复的非空底模 ID 在底模目录确认前不能进入 `catalog.search()`。底模已失效且 Storage 写回失败时，Dock 必须保留旧导航快照、显示持久化错误并阻断该查询，不能维护第二份“有效查询”持久状态。
- `globalThis.localStorage` 属性访问本身可能抛错。Store 必须接收惰性 Storage resolver，使属性访问、`getItem()` 与 `setItem()` 的失败都进入同一个 Session 快照错误 seam。

## 状态生命周期

- 已确认并插入的上下文以结构化 JSON 行保存在当前 Session 原生草稿中，`selectedContexts` 每次渲染都从 `input.draft` 投影。
- 弹窗导航状态仅保存在 `WorkbenchDock` 的 React `useState` 中，页面刷新或 `WorkbenchDock` 卸载会清除这些状态。
- 弹窗内尚未确认的候选勾选是临时状态。`docs/v0.1/PRDS/03-message-context-core.md` 明确要求取消或关闭不能改变草稿 chip，因此方案不能把取消前的临时勾选误当成已确认选择。
- 底模变化只把页码重置为 1；资源种类变化把搜索输入、已提交搜索词和页码重置；提交搜索把页码重置并增加 `requestVersion`；翻页只改变页码。
- 当前候选查询键由 `selectedKind`、`submittedQuery`、`currentPage`、资源种类是否支持底模筛选时的 `selectedBaseModelId` 和 `requestVersion` 组成。
- `git blame` 显示导航状态、`openDialog()` 重置和 `closeDialog()` 清理均来自 2026-08-25 的初始 Client checkpoint `e9f78b3e`；后续 `068fca54` 只补充查询错误处理。当前历史没有显示“每次重置”是后续缺陷修复所要求的不变量。
- 现有 `codex/plan-insert-context-cover-gallery` worktree 只有未跟踪的独立规划目录；该 worktree 的分支没有包含本需求相关的已提交 `native-surfaces.tsx` 变更，因此本方案不需要合并另一个在途实现。

## 测试入口与覆盖缺口

- `docs/system/testing.md` 要求新功能覆盖成功、拒绝、清理和错误分支。
- `pnpm test:unit` 覆盖 Client 模块；完整仓库门禁为 `pnpm quality`。
- `tests/unit/native-surfaces.test.tsx` 当前覆盖初始查询、底模筛选、资源种类切换、搜索、翻页、取消、原生关闭、查询错误、底模错误和关闭时中止请求。
- `tests/unit/native-surfaces.test.tsx` 的“取消或原生关闭丢弃临时变化”测试只验证草稿未被写入；测试第二次打开时没有断言底模、资源种类、搜索词和页码是否恢复。
- 当前测试没有覆盖“关闭后再次打开时按上次查询键重新请求”这一成功分支。
- 当前测试没有覆盖上次页码超过重新查询后总页数时的行为。现有 Client 直接用 `currentPage` 发起查询，且不会根据返回的 `totalCount` 自动把页码收敛到有效范围。
- 当前测试的 `Modal` mock 把整个 dialog 的 `onClick` 直接映射到 `onClose`，因此新增恢复测试应继续通过取消按钮或 mock 的原生关闭入口触发关闭，避免依赖真实 Modal 内部事件传播实现。
- `package.json` 把 `pnpm test:unit` 定义为全部 `tests/unit` Vitest，并把 `pnpm quality` 定义为依赖安全门禁、Harness interface 检查、类型检查、覆盖率、contract/security、production 和 prototype 全部门禁。

## 发布与部署要求

- `docs/system/releasing.md` 要求发布负责人先修改 `package.json.version`，完成源码与测试提交、push 和 CI，再更新 `README.md`、`docs/releasenotes.md` 与受影响系统文档，完成独立语义 Reviewer 验收、第二次 `pnpm quality`、最终提交与 CI，最后创建 tag、GitHub Release 并部署最终发布提交。
- 当前版本为 `0.30.5`；该修复获批实施时应使用补丁版本 `0.30.6`，标签为 `v0.30.6`。
- `docs/v0.1/PRDS/03-message-context-core.md` 的“前端交互”章节是弹窗交互语义的受影响文档；实施时应增加同一个 `WorkbenchDock` 生命周期内关闭再打开保留底模、资源种类、搜索输入、已提交搜索词和页码的要求。
- `README.md` 当前只包含版本号与发布说明链接；实施发布时应把两处 `0.30.5` 更新为 `0.30.6`。
- `docs/releasenotes.md` 当前只描述 v0.30.5；实施发布时应改为 v0.30.6 的行为、自动化验证和真实浏览器验收结果。
- `docs/system/startup.md` 要求生产负责人从最终发布提交启动或重启源码，并执行 `pnpm prod:status` 与 `pnpm prod:health`；真实浏览器验收必须使用该运行路径。
- 生产 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` 当前处于 detached HEAD，并含有已修改的 `config/base.json`。获批实施后的部署必须先保留该生产专属配置，再把其余仓库文件更新到最终发布提交。

## 候选方案比较

### 方案 A：保留 `WorkbenchDock` 状态并删除打开时导航重置

- 修改范围：`src/client/workbench/native-surfaces.tsx` 与 `tests/unit/native-surfaces.test.tsx`。
- 外部 interface：不变。
- seam：继续使用现有 `WorkbenchDock` 渲染 interface、`CatalogApi` adapter 和 Session native draft adapter。
- 恢复范围：同一个 `WorkbenchDock` React 实例内的 Modal 关闭与再次打开。
- depth 与 locality：现有模块已经拥有全部导航行为；需求通过删除重复初始化得到满足，复杂度不会扩散到新调用方。
- 限制：组件卸载、Session slot 重建或浏览器刷新后不恢复导航状态。

### 方案 B：抽取 `InsertContextDialog` React 模块

- 修改范围：新增弹窗模块并重构 `WorkbenchDock`，同时拆分测试。
- 外部 interface：`catalog`、`input`、`sessionInput` 三个 props。
- seam：位于 `WorkbenchDock` 与弹窗渲染实现之间。
- 优点：弹窗查询、请求清理和 pending selection 集中在一个深模块。
- 缺点：当前需求不要求重构；新增模块不会扩大本次恢复范围，却会增加迁移和回归面。

### 方案 C：新增按 Session ID 隔离的 memory registry

- 修改范围：新增状态 registry、向 `WorkbenchDock` 注入 Session ID、增加 registry 与 Session 隔离测试。
- 外部 interface：`read(key)`、`update(key, patch)`、`dispose(key)`。
- seam：位于 `WorkbenchDock` 与 Session 生命周期之间。
- 优点：可以跨 `WorkbenchDock` 卸载与重挂载恢复，并能按 Session 隔离。
- 缺点：当前需求没有要求跨卸载、跨 Session 或刷新恢复；当前 Harness slot 重挂载语义也没有仓库内证据。该方案属于未经用户要求的生命周期扩张。

### 方案 D：把弹窗状态改成独立状态机但继续在每次打开时初始化

- 该方案集中请求和状态转换，但是重新打开时仍把底模、资源种类、搜索词和页码恢复为默认值。
- 该方案不满足用户要求，因此淘汰。

### 原推荐已作废

- 用户明确要求每个 Session 保存自己的记忆后，方案 A 不再满足需求。
- `openDialog()` 只从当前 Session 草稿重建 `selectedOptions` 并设置 `dialogOpen=true`。
- `closeDialog()` 继续关闭底模菜单、清空未确认 `selectedOptions` 并触发两个查询 effect 的 AbortController cleanup。
- 再次打开时，候选查询 effect 使用保留的 `selectedBaseModelId`、`selectedKind`、`submittedQuery` 和 `currentPage` 重新请求当前数据；方案不持久化旧 `CatalogPage` 数据。
- `queryText` 与 `submittedQuery` 必须分别保留，以维持“输入框中尚未提交的文字”和“当前结果对应的已提交搜索词”之间的现有语义。

## 技术决定

| 决定 | 理由 |
|---|---|
| 暂无 | 计划编写者必须先完成实现入口与状态生命周期调研。 |
| 不把未确认的 `selectedOptions` 纳入导航记忆 | PRD 把该状态定义为 Modal 内临时选择；取消或关闭不能改变当前草稿中的 chip。再次打开时必须继续从当前草稿重建选中候选。 |
| 原方案 A 已作废 | 原方案只保证同一 React 实例内恢复，不能证明 Session 切换后恢复各自状态。 |
| 不缓存 `CatalogPage` | 再次打开时按保留查询键重新查询可以恢复用户导航位置并读取当前 Catalog 数据，同时沿用现有请求取消和错误处理。 |
| 使用 `sessionId` 作为记忆 key | 用户明确要求每个 Session 保存自己的记忆，并且现有 Client slot interface 已经提供 `sessionId`。 |
| 不把导航状态写入 Session 草稿 | 草稿是用户消息正文与上下文 JSON 的发送路径，写入 UI 导航状态会污染消息合同。 |
| 使用浏览器 `localStorage` 保存 Session 导航记忆 | 该存储可以跨刷新和 Client 重启保留少量 UI 状态，不需要新增依赖、数据库表、Remote 接口或 Host 合同。 |

## 问题与处理结果

| 问题 | 处理结果 |
|---|---|
| 暂无 | 无需处理。 |
| 独立 worktree 没有 `node_modules` | 使用主 worktree 已有依赖目录执行只读源码搜索；本次不安装依赖。 |
| 已安装 Harness 包没有暴露可搜索的 `conversation.input.dock` 实现字符串 | 方案不依赖未证实的 slot 挂载行为；方案必须明确承诺的生命周期范围，并用仓库可控的接口实现该范围。 |
| `stop-that-shit` 清单路径首次展开后不存在 | 使用文件清单定位实际安装路径后继续读取；不修改技能目录。 |
| 计划文件批量补丁中的 `progress.md` 定位文本不存在 | 计划编写者读取两个文件尾部后分别使用现有章节定位补丁，不重复原补丁。 |

## 方案产物检查

- `design-plan.md` 已定义同一 `WorkbenchDock` 生命周期内的恢复范围、五个导航状态、当前结果重新查询、pending selection 丢弃和 Session 草稿重建。
- `design-plan.md` 已列出两个业务变更文件、版本文件、三份发布文档、聚焦测试、完整质量门禁、真实浏览器验收、发布流程和生产部署流程。
- `git diff --check` 已通过。
- 当前分支只有未跟踪的 `.planning/insert-context-dialog-memory/`；业务源码、测试、版本文件和发布文档均未修改。
- 主线程已经人工检查 `design-plan.md` 的主体、动作、具体对象、状态生命周期、测试可观察条件和授权边界。
- 独立语义 Reviewer 没有在规定等待与部分结论请求后返回报告。计划执行者不得把独立语义验收标记为通过；获批实施前必须完成该门禁。

## 参考资源

- `docs/system/architecture.md`
- `docs/system/directory-structure.md`
- `docs/system/configuration.md`
- `docs/system/testing.md`
- `src/client/workbench/contract.ts`
- `src/client/workbench/controller.ts`
- `src/client/workbench/native-surfaces.tsx`
- `tests/unit/workbench-controller.test.ts`
- `tests/unit/native-surfaces.test.tsx`
