# Issue #18 实施与验收计划

## 必须要实现的目标

- 主线程必须从父 issue #1 与子 issue #18 提取唯一实施边界、公开接口约束和验收清单。
- 主线程必须把子 issue #18 切分为能够独立验收的小型纵向任务，并把实现任务派发给 Luna max 执行队员。
- 执行队员必须只在独立 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-18` 的 `codex/issue-18` 分支修改代码与测试。
- 主线程必须使用 diff 审查每次执行队员变更，并把具体缺陷、文件范围和目标测试精准派回执行队员。
- 主线程必须在最终全量测试通过后执行两轴代码审查，按子 issue #18 验收清单作出最终结论。
- 主线程必须在验收通过后提交实现分支、合入本地 `main`、关闭 issue #18、发布 `v0.2.1`，并删除独立 worktree。

## 验收清单

- [ ] 父 issue #1 与子 issue #18 的远端正文已经读取并记录。
- [ ] 仓库架构、配置、测试、发布和 issue 工作流规范已经读取。
- [ ] 子 issue #18 的每项需求都映射到一个纵向任务和一个可观察测试缝隙。
- [ ] 执行队员提交的 diff 没有超出子 issue #18 的文件与行为边界。
- [ ] 子 issue #18 的定向测试、类型检查和最终全量测试全部通过；已经通过且证据仍然有效的测试不重复执行。
- [ ] 两轴代码审查分别通过仓库规范与 issue spec 检查。
- [ ] 实现分支已经提交并合入本地 `main`，且合并操作没有覆盖主工作区已有用户变更。
- [ ] issue #18 已关闭，`v0.2.1` 已按仓库发布规范发布，独立 worktree 已删除。

## 非本次目标

- 主线程和执行队员不实现父 issue #1 中未由子 issue #18 分配的功能。
- 主线程和执行队员不处理相邻 issue、未来兼容层、静默降级、迁移、依赖升级或未被验收清单要求的重构。
- 主线程和执行队员不清理、重置、提交或覆盖当前 `main` 工作区中与 issue #18 无关的用户变更。
- 主线程和执行队员不重复运行已经通过且相关代码未变化的高耗时测试。

## 已获得的授权

- 用户授权主线程创建独立 worktree 和 `codex/issue-18` 分支。
- 用户授权主线程派发 Luna max 执行队员实施、修改和测试纵向任务。
- 用户授权主线程在验收通过后关闭 issue #18。
- 用户授权主线程在验收通过后把实现合入本地 `main` 并提交合并结果。
- 用户授权主线程发布中间版本 `v0.2.1`。
- 用户授权主线程把`main`中既有已暂存的Source Client物化改动作为独立基线修复提交并纳入`v0.2.1`，仅组合处理与issue #18重叠的health、测试和文档。
- 用户明确修正issue #18的动态占位规格：原生`conversation.session.header`继续拥有聊天/轨迹切换、header actions/utilities和locale；Workbench模式只按顺序动态注册`sidebar.workspaces`、`conversation.view#chat`、`details`三个occupant。

## 阶段

### 阶段 1：冻结 issue 与仓库规范

- [x] 读取 issue #1、issue #18 与 issue tracker 规范。
- [x] 读取相关系统、测试、技术栈与发布规范。
- [x] 记录基线提交、主工作区未提交变更和 worktree 状态。
- **状态：已完成**

### 阶段 2：拆分纵向任务并派发

- [x] 为每个纵向任务定义行为、文件所有权、测试缝隙和停止条件。
- [x] 派发最少数量的 Luna max 执行队员。
- **状态：已完成**

#### 纵向任务 A：Client Surface

- 行为：恢复原生父界面，实现唯一非持久 Surface 控制器，只在 Workbench 模式按顺序注册三个 occupant并启动 binding；原生`conversation.session.header`始终保留。
- 文件所有权：`src/client/**`、`tests/unit/client-plugin.test.ts`、`tests/unit/workbench-surface.test.tsx`、按需修改 `tests/unit/workbench-session-binding.test.ts`。
- TDD seam：Client plugin service激活、Surface控制器公开状态/订阅/切换、binding `dispose()`取消边界。
- 停止条件：指定 unit test与 typecheck通过，或执行队员返回具体公共API blocker。

#### 纵向任务 B：原生 Skill 与运行门禁

- 行为：恢复 `ui-layout` composition，增加唯一 Preset scoped filesystem/tool-skill，更新 health和Harness boundary，并实现真实rc.8 Skill组合测试。
- 文件所有权：`cordis.patch.yml`、`agent-presets/harness-comfyui/agent.cordis.yml`、`scripts/production/health.mjs`、`scripts/security/check-harness-boundary.mjs`、对应 production/security/integration测试。
- TDD seam：composition结构、health boot graph、Harness boundary CLI、真实rc.8 `skill.list`/菜单/`skill-invocation`公开接口。
- 停止条件：指定 production/security/integration测试与 typecheck通过，或执行队员返回具体rc.8公共API blocker。

#### 纵向任务 C：文档所有权同步

- 行为：只同步issue #18列出的十份Markdown中与root、Surface、InputBar、Skill roots、binding owner相关的陈述。
- 文件所有权：issue #18列出的十份Markdown。
- 语义 seam：每份文档中的主体、动作、对象、Owner与v0.2源码生产命令。
- 停止条件：十份文档完成逐份人工清单，且没有修改其业务功能或其他Issue责任。

### 阶段 3：差异审查与精准返工

- [x] 审查每名执行队员的实际 diff 与测试输出。
- [x] 只为已证明的缺陷派发定向修改与定向测试。
- **状态：已完成**

### 阶段 4：最终测试与两轴代码审查

- [ ] 运行尚未执行的必要类型检查和最终全量测试。
- [ ] 执行 Standards 与 Spec 两轴独立审查。
- [ ] 按 issue #18 验收清单出具最终验收结论。
- **状态：已放弃；真实浏览器证明当前集成方案破坏既有工作台视觉并且无法满足唯一聊天/轨迹合同。**

### 阶段 5：提交、合并、关闭与发布

- [ ] 提交 `codex/issue-18` 分支。
- [ ] 在保留用户变更的前提下合入本地 `main` 并提交合并结果。
- [ ] 关闭 issue #18，发布 `v0.2.1`。
- [x] 删除独立 worktree；保留`codex/issue-18`分支提交作为失败证据。
- **状态：已放弃；未合并、未关闭issue、未发布。**

## 错误记录

| 错误 | 次数 | 处理结果 |
|---|---:|---|
| zsh 把变量名 `status` 解释为只读特殊变量，首次 worktree 创建命令在创建前退出。 | 1 | 后续命令改用任务专用变量 `task_ref_check`；worktree 已成功创建。 |
| `gh release list`不支持请求`url` JSON字段，发布状态查询在Git历史读取前退出。 | 1 | 后续查询改用该命令列出的受支持字段，并单独读取需要的Release详情。 |
| 十份Markdown首次独立语义审核仅`docs/system/architecture.md`通过，其余文件存在InputBar owner残留、PRD16验收顺序、PRD03/04/12范围越界或生产流程不完整。 | 1 | 已把Reviewer精确文件/句子与最小修复范围派回原文档执行队员；修复后必须使用新的独立Reviewer复审。 |
| 十份Markdown第二次独立语义复验发现PRD 02的一句ConversationRoot owner错误和ADR 0012的一处根composition路径错误。 | 1 | 已只派回这两句；其他八份文档保持不变，修复后使用全新Reviewer最终复验。 |
| 候选提交首次Standards审查发现三个新分支缺少直接测试、公开slot合同被`never`/`Record<string, unknown>`削弱、四occupant元数据与组件绑定存在两份来源。 | 1 | 已派回Client执行队员补精准分支测试、公开强类型适配与单一descriptor；只运行受影响unit文件和typecheck。 |
| 候选提交首次Spec审查发现原生/项目chat ledger可能重复渲染，Skill组合测试手工模拟了原生菜单过滤和插入。 | 1 | chat winner去重已并入Client返工；真实`ui-input-trigger`/`ui-skill`链路已派回原生Skill执行队员，只运行单一integration文件。 |
| 提交review修复前尝试删除worktree依赖符号链接时，链接已经由执行队员删除，`unlink node_modules`返回不存在并让组合命令提前退出。 | 1 | 主线程只读确认worktree没有该未跟踪项，随后单独执行add/commit；没有删除其他文件。 |
| 真实生产浏览器首次加载失败：当前Client入口包含原生`import`，没有通过`window.__ModuleLoader__.load`注册`harness-comfyui`；`prod:health`仍误报passed。 | 1 | 已保存页面与console错误，停止只属于worktree的4174进程，并派独立Reviewer判断该前置缺陷是否允许纳入#18；未停止主工作区4173既有进程，未提交用户staged Source Client物化改动。 |
| Issue分支需要在已授权Source Client基线修复上重新验收，两个提交修改health、生产测试和文档的同一行。 | 1 | 主工作区staged改动已独立提交为`d6cb68f`；Luna max执行队员正在按冲突解决skill把Issue分支rebase到main并逐hunk保留两边验收。 |
| Source Client修复后真实Workbench首次创建Session时，项目header读取不存在的`props.views`并崩溃；永久入口在原生深色主题下几乎不可见。 | 1 | 已停止4174进程并把CSS最小修复与rc.8公开header能力审计派回Client执行队员；禁止用fake props掩盖真实registrant share缺失。 |
| rc.8公开API无法让priority -10项目header继承被遮蔽原生header的ChatStore、inject、children或locale，严格四occupant方案无法驱动原生聊天/轨迹切换。 | 1 | 用户已经明确批准把动态occupant从4个修正为3个并保留原生header；Client代码、测试和十份文档必须按修正后的规格重新验收。 |
| 4174生产命令因worktree临时`node_modules`链接在执行队员完成任务后被清理而找不到本地`tsdown`。 | 3 | 不安装依赖；每次仅重新创建指向主工作区既有`node_modules`的临时worktree符号链接，最终停止4174后已经再次删除。 |
| 1440×1000真实工作台截图中浅色会话列表使用白色或近白会话标题与时间，普通行和选中行文字几乎不可读。 | 1 | 控制台已确认没有header崩溃；已把截图证据和最小颜色对比修复范围派给Client执行队员，修复后只复验受影响unit和同一viewport截图。 |
| Browser locator不提供`inputValue()`方法，Skill选择后的第一次值读取调用失败。 | 1 | 没有重复选择；改用locator公开`evaluate()`读取元素`value`，确认精确插入`/anima-prompt-builder `，随后用键盘清空草稿。 |
| 真实非空Session的原生header同时显示项目硬编码“聊天”和原生本地化“对话”，两个同id标签同时selected。 | 1 | 保存截图；已派Client队员检查rc.8公开KindOptions是否允许项目chat occupant不声明label，只保留原生header的locale标签并继续用priority -10遮蔽chat内容。 |
| rc.8原生header使用`slots.entries('conversation.view')`原始ledger而不是`entriesOfSlot()` winner投影；任何第二个`chat`注册都会产生重复tab。 | 1 | Client执行队员与独立Reviewer均确认公开注册参数没有hidden/ledger开关，省略label只会回退到`chat`。需要用户在“两个occupant+原生chat”或接受重复tab等互斥合同之间重新授权；不得用CSS/深导入/复制header绕过。 |
