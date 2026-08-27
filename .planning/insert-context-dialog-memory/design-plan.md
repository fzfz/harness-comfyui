# “插入上下文”弹窗 Session 级持久记忆实施方案

## 必须要实现的目标

计划执行者必须让每个 Session 分别保存“插入上下文”弹窗的顶部底模、左侧资源种类、搜索输入、已提交搜索词和当前页码。用户关闭并重新打开弹窗、切换 Session 后返回、刷新浏览器或重启同一 Client 后，Client 必须恢复当前 `sessionId` 对应的导航状态，并根据该状态重新查询当前 Catalog 数据。

## 核心结论

`WorkbenchDock` 是中间列输入区的 React 界面 module，不是 Session 状态所有者。推荐方案在 Client 插件中创建唯一 `ContextDialogNavigationStore`，该 module 使用 `sessionId` 隔离内存快照，并把每个 Session 的快照写入一个独立、版本化的 `localStorage` key。

该方案只新增一个状态 module，不新增依赖、数据库表、Remote 接口、Host 合同、定时器或迁移任务。

## 术语定义

- Session：Harness Host 创建并持久化、由稳定 `sessionId` 寻址的会话实体。
- Session 导航记忆：`selectedBaseModelId`、`selectedKind`、`queryText`、`submittedQuery` 和 `currentPage` 组成的状态。
- 未确认候选：Modal 内已经勾选、但尚未通过“插入”按钮写入当前 Session 原生草稿的 `selectedOptions`。
- 当前候选结果：Catalog 根据 Session 导航记忆返回的 `CatalogPage`；该对象不是持久化数据。

## 候选方案比较

| 方案 | 刷新后恢复 | 修改范围 | 结论 |
|---|---|---|---|
| `WorkbenchDock` 本地 React 状态 | 否 | 最小 | 不能满足已确认范围，淘汰。 |
| Host Session projection 或 Session 草稿 | 是 | 需要扩大 Host 或消息合同 | UI 导航状态会进入错误的领域 seam，淘汰。 |
| IndexedDB | 是 | 需要异步初始化和额外错误流程 | 五个小字段不需要异步数据库，淘汰。 |
| 每个 Session 一个 `localStorage` 记录 | 是 | 一个状态 module 和现有 Dock 注入 | 推荐。不同 Session 的写入不会重写彼此的数据。 |

## 推荐 module 与 interface

计划执行者必须新增 `src/client/workbench/context-dialog-navigation.ts`。该文件必须定义状态、快照、Storage 依赖和 store interface。

```ts
export interface ContextDialogNavigationState {
  readonly selectedBaseModelId: string | null
  readonly selectedKind: CatalogKind
  readonly queryText: string
  readonly submittedQuery: string
  readonly currentPage: number
}

export interface ContextDialogNavigationSnapshot {
  readonly state: ContextDialogNavigationState
  readonly persistenceErrorCode: 'CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED' | null
}

export interface ContextDialogNavigation {
  readonly getSnapshot: () => ContextDialogNavigationSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly update: (
    updater: (current: ContextDialogNavigationState) => ContextDialogNavigationState,
  ) => void
}

type NavigationStorage = Pick<Storage, 'getItem' | 'setItem'>
type NavigationStorageResolver = () => NavigationStorage

export class ContextDialogNavigationStore {
  constructor(resolveStorage: NavigationStorageResolver)
  for(sessionId: string): ContextDialogNavigation
  dispose(): void
}
```

该 interface 是测试表面。`WorkbenchDock` 不得直接调用 `localStorage`、解析 JSON、拼接存储 key 或处理持久化 schema。

## localStorage 数据合同

### 存储 key

`context-dialog-navigation.ts` 必须定义唯一常量：

```ts
const STORAGE_KEY_PREFIX = 'harness-comfyui.context-dialog-navigation.v1:'
```

每个 Session 的完整 key 必须是 `STORAGE_KEY_PREFIX + sessionId`。代码不得哈希、编码或复制 `sessionId`。`localStorage` key 不需要被反向解析。

### 存储值

每个 key 只保存以下精确 JSON 对象：

```json
{
  "selectedBaseModelId": "2",
  "selectedKind": "lora",
  "queryText": "Age refined",
  "submittedQuery": "Age",
  "currentPage": 2
}
```

- key 中的 `v1` 是持久化 schema 的唯一版本来源；JSON 对象不重复保存版本号。
- `src/catalog/contract.ts` 必须导出当前私有的查询词、页码和稳定 ID 解析器。持久化 module 必须复用这些解析器，不能复制第二份正则表达式或数值上限。
- `selectedKind` 必须使用 `CATALOG_KIND_DEFINITIONS` 验证。
- `queryText` 与 `submittedQuery` 必须满足 Catalog 查询词合同：最多 200 个字符并且不含控制字符。
- `currentPage` 必须满足 Catalog 页码合同：1 至 100000 之间的安全整数。
- `selectedBaseModelId` 必须是 `null` 或满足 Catalog 稳定 ID 合同的 1 至 20 位非零开头数字字符串。
- JSON 对象必须只包含上述五个属性。
- module 不得保存 `selectedOptions`、`CatalogPage`、底模目录响应、请求状态、加载状态或错误对象。

未来确实修改持久化 schema 时，计划执行者必须更换 key 中的版本并另行设计迁移。当前版本不编写预防性迁移逻辑。

## 读取、更新与卸载规则

1. `for(sessionId)` 第一次被调用时，store 必须读取该 Session 的 `localStorage` key。
2. key 不存在时，store 必须创建内存初始快照：空底模、`comfyui-template`、两个空搜索词和第 1 页。store 不需要立即写入默认值。
3. key 存在且 JSON 通过严格结构校验时，store 必须使用该值创建当前 Session 的内存快照。
4. 同一 Client 生命周期内再次调用 `for(sessionId)` 时，store 必须返回同一个 Session 级 interface，不得重复读取 Storage。状态未变化时，`getSnapshot()` 必须返回引用稳定的同一个快照对象。
5. `update()` 必须先生成并校验完整的新状态，再同步执行 `setItem()`。写入成功后，store 才能替换内存状态、清除持久化错误并通知当前 Session 的订阅者。
6. Storage 写入失败时，store 必须保留写入前的状态，把 `persistenceErrorCode` 设置为 `CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED`，并通知当前 Session 的订阅者。store 不得静默改用纯内存状态。
7. Storage resolver、`getItem()` 或 `setItem()` 抛错时，store 必须通过同一个 `persistenceErrorCode` seam 发布错误。Storage resolver 或读取失败、JSON 解析失败、JSON 结构无效时，store 必须使用初始状态并发布同一个持久化错误码。后续一次成功的用户更新必须重新调用 Storage resolver、覆盖该 key 并清除错误码。
8. 不同 `sessionId` 必须拥有互相隔离的快照和订阅者集合。
9. `dispose()` 必须清除内存快照与订阅者；`dispose()` 不得删除 `localStorage` 记录。

`queryText` 必须在每次输入变化时同步写入，不增加 debounce、后台任务或批量刷新机制。

## Client 注入与 React 渲染规则

`src/client/index.tsx` 的 `apply()` 必须使用 `() => globalThis.localStorage` 创建唯一 `ContextDialogNavigationStore`，并在插件卸载 disposer 中调用 `dispose()`。构造 store 时不得读取 `globalThis.localStorage`；浏览器拒绝取得 Storage 对象时，插件仍必须完成 Dock 注册，Session 快照必须显示初始状态和持久化错误。

`conversation.input.dock` 注入函数必须增加：

```ts
{
  sessionId,
  dialogNavigation: contextDialogNavigationStore.for(sessionId),
}
```

`WorkbenchDockProps` 必须增加 `sessionId` 和 `dialogNavigation`。`WorkbenchDock` 必须使用 `sessionId` 作为内部 Session 渲染 module 的 React `key`，确保 Harness 复用外层实例并切换 Session 时，旧 Session 的 Modal 临时状态和活动请求会被卸载。

内部 Session 渲染 module 必须通过 `useSyncExternalStore()` 读取 `dialogNavigation`。现有五个导航 `useState()` 必须由 `snapshot.state` 取代；Modal 的打开状态、底模菜单、Catalog 响应、加载状态、请求错误和 `selectedOptions` 必须继续保留为本地状态。

## 状态更新规则

- 用户选择底模时，Dock 必须更新当前 Session 的 `selectedBaseModelId`，并把 `currentPage` 改为 1。
- 用户选择左侧资源种类时，Dock 必须更新当前 Session 的 `selectedKind`，清空 `queryText` 与 `submittedQuery`，并把 `currentPage` 改为 1。
- 用户输入搜索文字时，Dock 必须只更新当前 Session 的 `queryText`。
- 用户提交搜索时，Dock 必须把 `queryText.trim()` 写入 `submittedQuery`，并把 `currentPage` 改为 1。
- 用户翻页时，Dock 必须只更新当前 Session 的 `currentPage`。
- 用户打开 Modal 时，Dock 不得重置 Session 导航记忆；Dock 必须从当前 Session 原生草稿重建 `selectedOptions`。
- 用户取消、原生关闭或确认后关闭 Modal 时，Dock 必须清空未确认候选，并且不得清除 Session 导航记忆。
- Modal 重新打开、浏览器刷新或 Client 重启后，Dock 必须使用恢复的 `selectedKind`、`submittedQuery`、`currentPage` 和适用的 `selectedBaseModelId` 重新查询当前 Catalog 数据。
- Dock 不得持久化旧 `CatalogPage`。Catalog 数据变化后，用户看到的结果必须来自新查询。
- 恢复状态包含非空 `selectedBaseModelId` 且当前资源种类支持底模筛选时，Dock 必须等待底模目录加载完成并确认该 ID 仍存在，之后才能发出 Catalog 查询。
- 底模目录加载完成后，如果持久化的 `selectedBaseModelId` 已不存在，Dock 必须清空本地 `CatalogPage`，再尝试把该 Session 的底模改为 `null`、把页码改为 1，并持久化这一结果。
- 失效底模状态写回成功后，Dock 才能使用 `baseModelId=null` 和第 1 页查询 Catalog。写回失败时，Session 导航快照必须保留原值、显示持久化错误，并且 Dock 不得发出包含失效底模 ID 的请求或显示旧候选结果。

## 持久化错误文案

`config/error-catalog.json` 必须增加唯一错误码 `CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED`。错误文案必须明确说明浏览器无法读取或保存当前 Session 的插入上下文导航状态，并指导用户允许当前站点使用本地存储或清除当前站点数据后重试。

`src/client/workbench/contract.ts` 必须从 `config/error-catalog.json` 读取该错误码对应文案。Dock 必须在 Modal 中展示 `snapshot.persistenceErrorCode` 对应的文案。持久化失败不得覆盖 Catalog 请求错误，也不得修改 Session 原生草稿。

## 计划执行者必须修改的文件

### 源码与自动化测试提交

- `src/client/workbench/context-dialog-navigation.ts`
  - 新增严格持久化 schema、每 Session Storage key、Session 级快照、订阅和写穿更新。
- `src/client/index.tsx`
  - 创建并释放唯一 store；向 Dock 注入 `sessionId` 和 Session 级 interface。
- `src/client/workbench/native-surfaces.tsx`
  - 使用 Session key 隔离本地 Modal 状态；用持久化快照替换五个导航状态。
- `src/client/workbench/contract.ts`
  - 从唯一错误目录投影持久化错误文案。
- `config/error-catalog.json`
  - 新增 `CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED`。
- `src/catalog/contract.ts`
  - 导出持久化 module 复用的 Catalog 查询词、页码和稳定 ID 解析器；不复制合同约束。
- `tests/unit/catalog-contract.test.ts`
  - 验证导出的三个解析器保持现有查询合同。
- `tests/unit/context-dialog-navigation.test.ts`
  - 新增严格读取、Session 隔离、写穿、错误和卸载测试。
- `tests/unit/client-plugin.test.ts`
  - 验证 Store 创建、Dock 注入、Session 隔离和插件卸载不删除持久化数据。
- `tests/unit/native-surfaces.test.tsx`
  - 验证关闭重开、Session 切换、刷新重建、错误展示和请求清理。
- `package.json`
  - 发布负责人必须把唯一结构化版本从 `0.30.5` 更新为 `0.30.6`。

### 发布文档提交

- `docs/v0.1/PRDS/03-message-context-core.md`
  - 定义每个 Session 的导航记忆及刷新、Client 重启后的恢复行为。
- `README.md`
  - 更新当前产品版本与发布说明链接到 `0.30.6`。
- `docs/releasenotes.md`
  - 记录 Session 隔离、持久化范围、自动化验证和真实浏览器验收结果。

## 自动化测试矩阵

| 测试场景 | 测试操作 | 必须观察到的结果 |
|---|---|---|
| 首次 Session | Storage 不存在对应 key | 返回唯一初始快照，不提前写默认值。 |
| 有效持久化记录 | 新建 store 后读取 Session A | 严格恢复五个属性。 |
| 模拟浏览器刷新 | store A 更新后 `dispose()`，再用同一 Storage 创建 store B | store B 恢复同一 Session 的状态。 |
| Session 隔离 | 分别更新 Session A 与 B | 两个 Storage key 和两个快照互不覆盖。 |
| 编辑词与提交词分离 | 提交 `Age` 后继续输入 `Age refined` | 重建后输入框为 `Age refined`，查询仍使用 `Age`。 |
| 写入顺序 | Storage `setItem()` 抛错 | 内存状态保持旧值，当前 Session 发布持久化错误，其他 Session 不变。 |
| 无效 JSON | Storage 返回无法解析或属性无效的 JSON | 使用初始状态并发布持久化错误；一次成功更新覆盖旧值并清除错误。 |
| 严格 schema | JSON 缺少属性、增加属性、kind 无效、页码无效或属性类型错误 | 每个分支都被拒绝并发布持久化错误。 |
| Catalog 合同复用 | 恢复控制字符搜索词、`currentPage=100001`、非数字或超过 20 位的底模 ID | 使用初始状态并发布持久化错误，不发出无效 Catalog 请求。 |
| Storage 对象取得失败 | `globalThis.localStorage` getter 抛错 | Client 插件仍注册 Dock；Session 使用初始状态并显示唯一持久化错误。 |
| Store 卸载 | 调用 `dispose()` | 清除内存订阅者；Storage 记录仍存在。 |
| 同一 Session 重开 | 选择底模、资源种类、搜索词和第 2 页，关闭后重开 | 恢复状态并重新查询当前 Catalog。 |
| 两个 Session 切换 | A 与 B 保存不同状态并来回切换 | 每个 Session 只显示自己的状态。 |
| React Session 清理 | A 的 Modal 请求与未确认候选存在时切换到 B | A 的请求中止，未确认候选丢弃，导航记忆保留。 |
| 底模失效 | 恢复的底模 ID 不在最新底模目录中 | 失效 ID 从未进入 `catalog.search`；成功写回后只使用全部底模和第 1 页查询。 |
| 底模失效写回失败 | 清除失效底模时 Storage `setItem()` 抛错 | Session 保留旧导航状态并显示错误，不发出包含失效 ID 的查询，不显示旧候选结果。 |
| 错误文案 | Storage 读取或写入失败 | Modal 显示唯一错误目录中的可操作文案，草稿不变。 |

计划执行者必须运行：

```sh
pnpm exec vitest run \
  tests/unit/catalog-contract.test.ts \
  tests/unit/context-dialog-navigation.test.ts \
  tests/unit/client-plugin.test.ts \
  tests/unit/native-surfaces.test.tsx
pnpm test:unit
pnpm quality
git diff --check
```

独立 worktree 当前没有 `node_modules`。计划执行者不得安装依赖。用户批准实施后，计划执行者可以创建指向主 worktree 现有依赖目录的未跟踪 `node_modules` 符号链接；该符号链接不得提交。

## 真实浏览器验收

1. 验收者在 Session A 中选择非默认底模、非默认资源种类，提交搜索词并进入第 2 页。
2. 验收者关闭并重开 Modal，确认 Session A 恢复上述状态并重新读取当前 Catalog。
3. 验收者在 Session B 保存另一组状态，并在 A 与 B 之间来回切换，确认两个 Session 互不覆盖。
4. 验收者刷新浏览器，重新打开 A 与 B，确认两个 Session 各自恢复。
5. 验收者执行 `pnpm prod:restart`，在同一浏览器配置文件和同一 Client URL 中重新打开 A 与 B，确认两个 Session 各自恢复。
6. 验收者在 Session A 临时勾选候选但不确认，然后关闭、切换 Session 或刷新，确认未确认候选没有进入任何 Session 草稿。
7. 验收者确认恢复后展示的候选来自新的 Catalog 请求，不是刷新前的旧响应对象。
8. 验收者在浏览器开发者工具中为一个尚未载入 store 的 Session 预置无效 JSON，确认该 Session 使用初始值、显示持久化错误并且没有发出无效 Catalog 请求。
9. 验收者在开发者工具中临时让 `Storage.prototype.setItem` 抛出 `DOMException`，尝试修改五个导航值中的任意一个，确认界面保留修改前的五个值、显示持久化错误并且 Session 草稿不变；验收后必须恢复原方法。
10. 验收者清除当前站点数据并刷新，确认 A 与 B 都恢复初始导航状态，已确认上下文仍由各自 Session 原生草稿恢复。
11. 验收者执行 `pnpm prod:status` 与 `pnpm prod:health`，两条命令必须成功。

## 持久化范围与清理条件

- 记录只在相同浏览器配置文件和相同 Client 站点来源下恢复。
- 浏览器站点数据被用户清除后，所有 Session 导航记忆恢复为初始状态。
- 本次不自动枚举或删除已经删除 Session 的 key；不引入 Session 删除订阅、TTL 或清理任务。
- 插件升级后，只要持久化 schema 仍为 `v1`，记录继续有效。

## 实施与交付步骤

1. 计划执行者必须在当前独立 worktree 实施源码、自动化测试、`package.json.version=0.30.6` 和本方案列出的文档变更。
2. 计划执行者必须运行聚焦测试、`pnpm test:unit`、`pnpm quality` 和 `git diff --check`。
3. 计划执行者必须使用当前 worktree 的 Source Process 和真实浏览器执行本方案的 Session 隔离、关闭重开、刷新与 Client 重启验收。
4. 计划执行者必须以固定审查点 `eea9c4d307e90c6d68bd2da37b69fe0891a9992f` 执行 Standards 与 Spec 双轴审查并修复阻塞问题。
5. 计划执行者必须提交当前分支。计划执行者不得 push、创建 tag、创建 GitHub Release、部署或修改生产 checkout。

## 验收清单

- [x] Session A 与 Session B 的底模、资源种类、搜索输入、已提交搜索词和页码不会互相覆盖。
- [x] 同一 Session 关闭重开、浏览器刷新和同一 Client 重启后恢复自己的导航状态。
- [x] Client 使用恢复的查询条件重新读取当前 Catalog，并且不持久化旧 `CatalogPage`。
- [x] Session 切换、取消、Modal 原生关闭和浏览器刷新会丢弃未确认候选，并且不会修改 Session 原生草稿。
- [x] Storage 读取、校验或写入失败时，Modal 显示唯一错误文案，不发生静默内存降级。
- [x] 无效底模 ID 被重置并写回当前 Session 的 Storage key。
- [x] 聚焦测试、`pnpm test:unit`、`pnpm quality`、当前 worktree Source Process 健康检查和真实浏览器验收全部通过。
- [x] 当前分支包含未 push 的实施提交；仓库没有 tag、GitHub Release、部署或生产 checkout 修改。

## 非本次目标

- 计划执行者不把弹窗导航状态写入 Session 原生草稿、上下文 JSON、Host Session projection 或数据库。
- 计划执行者不保存取消前、Session 切换前或刷新前尚未确认的候选。
- 计划执行者不缓存旧 `CatalogPage`、底模目录响应、错误对象或加载状态。
- 计划执行者不为每一种 Catalog 资源分别保存一套搜索词和页码。
- 计划执行者不实现跨浏览器配置文件、跨设备或不同站点来源的同步。
- 计划执行者不实现多标签页实时同步；同一 Session 被多个标签页修改时，最后一次成功写入的完整状态在下次重建时生效。
- 计划执行者不新增依赖包、配置字段、数据库表、Remote 接口、Host 合同、Storage TTL 或自动清理任务。
- 计划执行者不改变 Catalog 查询 schema、分页大小、底模筛选含义、上下文 JSON 格式或 chip 行为。

## 已获得的授权

- 用户已经授权计划编写者创建独立 worktree、调研代码并设计方案。
- 用户已经明确要求每个 Session 保存自己的弹窗导航记忆。
- 用户已经明确要求浏览器刷新和同一 Client 重启后继续保存每个 Session 的弹窗导航记忆。
- 用户已经授权计划执行者在当前独立 worktree 修改所需源码、测试、版本、文档和 planning 文件，运行验证与验收并提交当前分支。
- 用户明确禁止计划执行者 push、发布、部署和修改生产 checkout。
