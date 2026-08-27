# “插入上下文”弹窗选择记忆调研进度

## 2026-08-27

### 阶段 1：项目约束与实现入口调研

- **状态：** 已完成
- **已完成动作：**
  - 计划编写者读取 `planning-with-files` 与 `codebase-design` 的完整说明和直接引用资料。
  - 计划编写者检查主 worktree、现有 worktree、当前分支和远端配置。
  - 计划编写者从当前 `main` 的已提交 HEAD 创建独立分支与独立 worktree。
  - 计划编写者创建本次任务的计划、调研记录和进度记录。
  - 计划编写者读取架构、目录结构、测试和配置文档。
  - 计划编写者通过中文按钮字符串和上下文选择器相关名称定位运行时与测试候选文件。
  - 计划编写者读取 `WorkbenchDock`、`WorkbenchController`、Client 注册入口、对应单元测试和消息上下文 PRD。
  - 计划编写者确认 `openDialog()` 主动重置底模、资源种类、搜索词和页码是用户报告行为的直接原因。
  - 计划编写者逐项核对 `tests/unit/native-surfaces.test.tsx` 的现有交互覆盖和再次打开弹窗的断言缺口。
  - 计划编写者检查 `native-surfaces.tsx` 的 Git 历史与现有相关 worktree，确认重置逻辑来自初始实现且没有在途实现冲突。
  - 计划编写者检查主 worktree 的已安装 Harness 包和 Client 注册测试；现有证据没有确定 Session 切换时 slot 实例的复用行为。
- **已创建文件：**
  - `.planning/insert-context-dialog-memory/task_plan.md`
  - `.planning/insert-context-dialog-memory/findings.md`
  - `.planning/insert-context-dialog-memory/progress.md`

### 阶段 2：当前行为与根因分析

- **状态：** 已完成
- **已完成动作：**
  - 计划编写者追踪底模、资源种类、编辑中搜索词、已提交搜索词、页码、结果数据和临时勾选的生命周期。
  - 计划编写者确认弹窗关闭会中止请求并清空未确认勾选，但不会主动清除导航状态。
  - 计划编写者在用户澄清前没有证据确认 Session 级记忆是否属于本需求；用户随后明确要求每个 Session 保存自己的记忆。

### 阶段 3：候选方案比较

- **状态：** 已完成
- **已完成动作：**
  - 三名只读 Explorer 分别提出最小接口、扩展性和常用路径方案。
  - 计划编写者比较局部状态修改、弹窗模块抽取、Session memory registry 和独立状态机四个方案。
  - 计划编写者淘汰不满足恢复需求的状态机方案，并根据范围门禁选择局部状态修改方案。
  - 计划编写者读取版本发布、源码启动、README、发布说明和受影响 PRD，确认获批实施后的完整质量、发布和部署步骤。
  - 计划编写者把推荐方案、状态合同、修改文件、自动化测试矩阵、真实浏览器验收、发布与部署步骤写入 `design-plan.md`。
  - 用户明确指出每个 Session 必须分别保存弹窗记忆；计划编写者撤销只依赖 `WorkbenchDock` React 实例的原推荐方案。
  - 计划编写者确认 `conversation.input.dock` 注入函数已经接收 `sessionId`，但 `WorkbenchDockProps` 尚未接收该 ID。
  - 计划编写者读取已安装 Session runtime 文档，确认公开 Session scope 没有供项目 Client 写入任意弹窗 UI 状态的 interface。
  - 计划编写者把“同一 Client 运行期间切换 Session 后恢复”与“浏览器刷新后恢复”区分为两个持久化层级；后者等待用户确认。
  - 计划编写者重写 `design-plan.md`，推荐 Client 插件级 `ContextDialogNavigationStore` 使用 `sessionId` 隔离每个 Session 的导航快照。
  - 用户确认浏览器刷新和 Client 重启后也必须恢复每个 Session 的导航记忆。
  - 计划编写者确认仓库没有现成浏览器存储 module，并开始把推荐方案收敛为单个 `localStorage` JSON 记录，不新增依赖或 Host 合同。
  - 计划编写者比较 Host projection、Session 草稿、IndexedDB 和 `localStorage`，选择每个 Session 一个版本化 `localStorage` key。
  - 计划编写者完成持久化读取、同步写穿、严格 schema、错误展示、底模失效、刷新重建和 Client 重启验收设计。

### 阶段 4：方案交付与批准门禁

- **状态：** 已完成
- **已完成动作：**
  - 计划编写者完成 `design-plan.md` 初稿。
  - 计划编写者检查生产 checkout 状态，确认部署阶段必须保留 `config/base.json` 的生产专属修改。
  - 计划编写者执行 `git diff --check`，检查通过。
  - 计划编写者人工检查 `design-plan.md` 的主体、动作、具体对象、生命周期范围、验收条件和授权边界。
  - 独立语义 Reviewer 在三次等待和一次部分结论请求后没有返回报告；主线程终止该 Reviewer，并把独立语义验收保留为实施前未完成门禁。
  - 计划编写者根据用户确认重写 `design-plan.md`，加入浏览器刷新和 Client 重启后的每 Session 持久化方案。
  - 独立 Reviewer 返回 `NEEDS_CHANGES`，指出 Catalog 合同复用、失效底模查询顺序、Storage getter 错误和真实浏览器错误验收四项缺口。
  - 计划编写者根据四项发现修订 `design-plan.md`；用户随后明确批准实施、验证、验收和提交。

### 阶段 5：持久化 store TDD

- **状态：** 已完成
- **已完成动作：**
  - 计划执行者读取 `implement`、`tdd`、`code-review`、`planning-with-files`、TDD 测试规范、TDD mock 规范与 `CONTEXT.md`。
  - 计划执行者固定三个测试 seam：`ContextDialogNavigation`、`WorkbenchDock` 和 Client 插件 Session 注入。
  - 计划执行者把固定审查点设为当前分支起点 `eea9c4d307e90c6d68bd2da37b69fe0891a9992f`。
  - TDD 红：`catalog-contract.test.ts` 因三个 Catalog 标量解析器尚未导出而失败。
  - TDD 绿：计划执行者导出并复用查询词、页码和稳定 ID 解析器；Catalog 合同 41 项测试与类型检查通过。
  - TDD 红：store 文件不存在、malformed JSON 抛出、严格 schema 接受无效值、Storage 写入错误向调用方抛出。
  - TDD 绿：store 支持跨实例恢复、严格 schema、惰性 Storage resolver、读写错误快照、同步写穿、Session/订阅隔离和 dispose 保留持久化记录。

### 阶段 6：Client 与 Dock TDD

- **状态：** 已完成
- **已完成动作：**
  - TDD 红：Client 插件没有向 Dock 注入 Session 对应的 `ContextDialogNavigation`。
  - TDD 绿：Client 插件创建一个插件生命周期 store，并按 `sessionId` 注入稳定接口；插件卸载清除内存记录和订阅者但保留浏览器存储。
  - TDD 红：`WorkbenchDock.openDialog()` 把五个导航值恢复为初始值；保存的失效底模 ID 在校验前触发 Catalog 查询；底模修正写入失败时页面没有错误说明。
  - TDD 绿：`WorkbenchDock` 从注入接口读取五个导航值，打开时只重置请求结果与未确认候选；底模查询门禁先完成 ID 校验和持久化修正。
  - 计划执行者使用 `sessionId` keyed 子组件清理 Session 临时状态。Session 切换会关闭旧 Modal、中止旧请求并丢弃未确认候选。
  - 聚焦测试覆盖关闭重开、Session 隔离、旧请求中止、失效底模、修正写入失败、Storage getter 失败和 Client 注入生命周期。
  - Client 与 Dock 的 17 项聚焦测试全部通过；TypeScript 类型检查通过。

### 阶段 7：版本与文档

- **状态：** 已完成
- **已完成动作：**
  - 计划执行者把产品版本从 `0.30.5` 更新为 `0.30.6`。
  - 计划执行者更新 README、发布说明、消息上下文 PRD 和唯一错误目录。
  - 计划执行者逐句检查 UI 错误文案、PRD 行为主体、具体状态值、失败行为和验收动作。

### 阶段 8：完整验证与验收

- **状态：** 已完成
- **已完成动作：**
  - `pnpm test:unit` 的 300 项测试全部通过。
  - 第一次 `pnpm quality` 只在旧版本断言处失败；同步工程基线测试后，第二次完整质量门禁通过。
  - 完整质量门禁通过 305 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试。
  - 当前 worktree Source Process 的 `status` 返回 `running`，`health` 返回所有阶段 `passed`，验收结束后 `stop` 返回 `stopped`。
  - 真实 Chrome 使用两个本地 Harness Session 完成关闭重开、Session 隔离、浏览器刷新和 Client/Host 重启验收。
  - Session A 在各生命周期恢复“全部底模”、Workflow 模板、搜索词 `a` 和第 2 页；Session B 恢复 `wai`、LoRA、搜索词 `age` 和第 1 页。
  - 真实浏览器验收结束后，计划执行者恢复目录选择器配置，不保留临时 Source Profile 修改。

### 阶段 9：代码审查与提交

- **状态：** 已完成
- **已完成动作：**
  - 计划执行者以固定点 `eea9c4d307e90c6d68bd2da37b69fe0891a9992f` 分别执行 Standards 审查与 Spec 审查。
  - Standards 审查确认状态 module 位于 `src/client/` 职责边界内、Catalog 标量合同保持单一来源、测试覆盖成功/拒绝/清理/错误分支，并且变更没有增加依赖或生产配置。
  - Standards 审查发现 `ContextDialogNavigationStore` 使用空对象类型断言建立可变快照。计划执行者改为由闭包直接持有当前快照，移除不必要的类型断言。
  - Spec 审查逐项核对五个导航值、每 Session 隔离、关闭重开、刷新、Client 重启、当前 Catalog 重查、Storage 错误、失效底模门禁和 Session 清理行为。
  - Spec 审查发现 `design-plan.md` 仍保留用户当前禁止的 push、发布与部署步骤。计划执行者把交付边界改为当前 worktree 的实施、验证、验收和本地提交。
  - `code-review` 技能要求两个独立 Reviewer；当前 `stop-that-shit` change 合同限制 `agents=0/0`，因此主线程完成两个审查轴，没有启动子代理。
  - 审查修正后的 73 项聚焦测试和最终 `pnpm quality` 全部通过；两个审查轴没有剩余阻塞问题。
  - 计划执行者删除临时 `node_modules` 符号链接，并准备当前分支的未 push 提交。

## 检查结果

| 检查 | 预期结果 | 实际结果 | 状态 |
|---|---|---|---|
| `git worktree add` | 创建独立 worktree 和独立分支 | 已创建 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-insert-context-dialog-memory` 与 `codex/plan-insert-context-dialog-memory` | 通过 |
| Catalog 标量合同红测 | 新增测试必须在实现前失败 | `parseCatalogQueryText is not a function` | 通过 |
| Catalog 合同聚焦测试 | 41 项测试全部通过 | 41 项通过 | 通过 |
| 第一次实施类型检查 | TypeScript 无错误 | `tsc --noEmit` 通过 | 通过 |
| Store 聚焦测试 | 持久化 store 与 Catalog 合同全部通过 | 56 项通过 | 通过 |
| Store 实施后类型检查 | TypeScript 无错误 | `tsc --noEmit` 通过 | 通过 |
| Client 与 Dock 聚焦测试 | Client 注入与 Modal 行为全部通过 | 17 项通过 | 通过 |
| Client 与 Dock 类型检查 | TypeScript 无错误 | `tsc --noEmit` 通过 | 通过 |
| 完整单元测试 | 所有 unit 测试通过 | 24 个文件、300 项测试通过 | 通过 |
| 完整质量门禁 | 质量、安全、生产生命周期和原型测试全部通过 | 305 + 20 + 14 + 27 项测试通过 | 通过 |
| 审查修正后聚焦测试 | 四个受影响测试文件全部通过 | 4 个文件、73 项测试通过 | 通过 |
| 审查修正后最终质量门禁 | 类型、质量、安全、生产生命周期、原型和覆盖率门禁全部通过 | 305 + 20 + 14 + 27 项测试通过；statements 92.29%、branches 84.17%、functions 100%、lines 95.01% | 通过 |
| 验收进程清理 | 当前 worktree 的 Source Process 不再运行 | `prod:status` 返回 `status: stopped` 和 `pid: null` | 通过 |
| Source Process | 当前 worktree 版本运行健康 | `0.30.6` 的 status 为 running，health 各阶段 passed | 通过 |
| 浏览器关闭重开 | Session A 恢复搜索与分页 | Workflow 模板、搜索词 `a`、第 2 页恢复 | 通过 |
| 浏览器 Session 隔离 | Session A 与 Session B 不串值 | A 为 Workflow/`a`/第 2 页；B 为 `wai`/LoRA/`age`/第 1 页 | 通过 |
| 浏览器刷新与 Client 重启 | 两个 Session 的值跨生命周期保留 | 刷新与 Client/Host 重启后 A、B 分别恢复 | 通过 |

## 错误记录

| 时间 | 错误 | 尝试次数 | 处理结果 |
|---|---|---:|---|
| 2026-08-27 | 暂无 | 0 | 无需处理。 |
| 2026-08-27 | 独立 worktree 没有 `node_modules`，Harness slot 实现搜索失败 | 1 | 改为只读检查主 worktree 的现有依赖目录；不执行依赖安装。 |
| 2026-08-27 | `stop-that-shit` 清单路径首次展开后不存在 | 1 | 使用 `rg --files` 定位实际已安装文件。 |
| 2026-08-27 | 独立语义 Reviewer 没有返回可用验收报告 | 1 | 请求一次部分结论后终止 Reviewer；不重复启动新 Reviewer；实施前重新完成独立语义验收。 |
| 2026-08-27 | Session 级方案批量补丁与当前计划文字不完全匹配 | 1 | 改为读取精确段落并分文件应用小补丁。 |
| 2026-08-27 | `apply_patch` 不允许同一补丁删除并新增 `design-plan.md` | 1 | 改为两个连续补丁分别删除旧文件和新增修订文件。 |
| 2026-08-27 | 追加持久化发现时，批量补丁使用了 `progress.md` 中不存在的章节定位文本 | 1 | 读取文件现有章节后改用准确段落追加。 |
| 2026-08-27 | 独立 Reviewer 返回四项阻塞问题 | 1 | 修订方案，实施阶段必须用测试固定四项行为。 |
| 2026-08-27 | Guard 保留旧 review 模式并拒绝文件修改与测试命令 | 1 | 用户发送明确 change 合同后 Guard 允许当前 worktree 实施。 |
| 2026-08-27 | Node 环境提供的实验性 `localStorage` 不允许写入 | 1 | 测试在 Client 插件公开边界注入确定性的 `MemoryStorage`；产品继续惰性访问浏览器 `localStorage`。 |
| 2026-08-27 | 查询 effect 依赖底模加载状态导致无底模筛选查询重复启动 | 1 | effect 改为依赖派生的底模查询就绪状态；无底模筛选时底模加载状态变化不再重启查询。 |
| 2026-08-27 | 第一次 `pnpm quality` 在工程基线版本断言处失败 | 1 | 把 `tests/contract/engineering-baseline.test.ts` 和发布命令示例同步到 `0.30.6` 后重跑完整门禁。 |
| 2026-08-27 | 应用内浏览器停在 Harness 插件加载阶段并两次中断控制连接 | 1 | 根据浏览器恢复文档改用已连接 Chrome；Chrome 正常加载相同 localhost Source Process。 |
| 2026-08-27 | Harness 自动选择 macOS 原生目录选择器，浏览器自动化无法提交 worktree 路径 | 1 | 临时把当前 worktree Source Profile 切换到 Harness 网页目录选择器；注册验收工作区后恢复原配置。 |
| 2026-08-27 | 第一次临时目录选择器 patch 同时加载 native 与 browse surface | 1 | 禁用 auto picker row，并显式插入 browse host 与 browse Client；验收后恢复 `[]`。 |
| 2026-08-27 | `code-review` 技能要求独立 Standards 与 Spec Reviewer，但当前 change 合同限制 `agents=0/0` | 1 | 主线程分别执行两个审查轴并记录证据，不违反用户批准的 Guard 合同。 |
| 2026-08-27 | 删除临时依赖链接后执行 `pnpm prod:status`，脚本无法加载已安装的 `tsdown` | 1 | 重新创建指向主 worktree 已安装依赖的符号链接，确认 Source Process 已停止，再次删除该链接。 |

## 五问恢复检查

| 问题 | 答案 |
|---|---|
| 当前处于哪个阶段？ | 阶段 9 已完成。 |
| 后续阶段是什么？ | 无；当前分支只保留未 push 的实施提交。 |
| 当前目标是什么？ | 实现每个 Session 跨刷新和 Client 重启恢复自己的弹窗导航状态。 |
| 当前已经获得哪些事实？ | 参见 `findings.md`。 |
| 当前已经完成哪些动作？ | 参见本文件的阶段 1 记录。 |
