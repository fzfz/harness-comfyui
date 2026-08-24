# GitHub Issue #1 四项界面与输入能力方案讨论计划

## Goal

计划编写者核对 GitHub Issue #1、相关子 Issue、当前仓库前端组合代码和 DeepSeek Harness 公开插件接口，定义以下四项需求的最小改动方案：保留 Harness 原生界面并从左侧栏进入 ComfyUI 工作台；工作台保留 Harness Settings 与 ModelSelect；工作台输入框提供 Agent 读写权限设置；输入 `/` 后列出并使用项目目录 `.agents/skills` 中的全部 Skill。用户已经授权计划编写者提交不可变实施计划、修改相关 GitHub Issue并创建基础 Issue；本轮不修改产品代码。

## Current Phase

Phase 7 completed

## Phases

### Phase 1: 核对当前规格与实现状态

- [x] 读取 GitHub Issue #1、相关 UI 子 Issue和依赖关系。
- [x] 读取当前仓库前端 root、sidebar、conversation、details、settings 和 model selector 相关代码。
- [x] 读取当前锁定 DeepSeek Harness 版本公开插件接口与原生界面实现。
- **Status:** completed

### Phase 2: 设计并比较两条产品路线

- [x] 路线 A 定义 Harness 原生界面与 ComfyUI 工作台之间的可见入口、导航状态和生命周期。
- [x] 路线 B 定义 ComfyUI 工作台内复用 Harness 设置入口与模型选择下拉框的接口、状态所有权和限制。
- [x] 比较两条路线与 Issue #1、UI 子 Issue、Harness 核心零修改约束的冲突。
- **Status:** completed

### Phase 3: 形成 Issue 调整建议

- [x] 给出推荐路线、被拒绝路线和理由。
- [x] 给出 Issue #1 需要增加的具体需求、需要改动的子 Issue和验收条件。
- [x] 明确用户授权修改 GitHub Issue 前的停止边界。
- **Status:** completed

### Phase 4: 合并四项需求并收敛最小改动方案

- [x] 核对 Harness Agent 读写权限控件、权限状态所有者与可写接口。
- [x] 核对 `/` 菜单、项目 `.agents/skills` 发现规则和 Skill 调用接口。
- [x] 按照 Design It Twice 比较三种接口接缝并选择改动最小的方案。
- [x] 明确四项需求与 #1、#4、#16、#18 建议之间的责任分配和验收条件。
- [x] 由独立语义审核者检查需求定义、主体、动作、对象与冲突说明。
- **Status:** completed

### Phase 5: 核实 #4 原生输入路径并消除待定判断

- [x] 核对 `IConversation.input`、`SessionInput.insertReference()`、`InputState` 与 `ReferenceCodec.serialize()` 的 rc.8 公开合同和实现。
- [x] 核对多个 ContextRef 的顺序插入、发送前解析、图片合并提交、失败保留和成功清理行为。
- [x] 明确修改 #4 的 composer、chip、附件和提交条款，并明确修改 #6 的 Execution Route输入条款，不把产品决定推迟到执行阶段。
- [x] 由独立语义审核者检查更新后的确定方案。
- **Status:** completed

### Phase 6: 发布不可变计划并更新 GitHub Issue图

- [x] 创建实施计划文件并由独立语义审核者验收。
- [x] 只提交实施计划文件，并把不可变提交链接写入每张修改或新增的 GitHub Issue。
- [x] 创建 #18，并修改 #1、#4、#6、#10、#11、#13与 #14。
- [x] 回读 GitHub Issue正文、标签和依赖关系，确认每项修订只出现一次。
- [x] 按 `code-review` Skill审核实施计划提交。
- **Status:** completed

### Phase 7: 按 v0.2 main基线重写 Issue #18

- [x] 读取 `main@4f5a14b`的系统文档、领域文档、Client composition、Agent Preset、测试门禁和相关 PRD。
- [x] 核对 rc.8原生 Trajectory入口、注册项和功能边界。
- [x] 按当前 main基线重写 Issue #18完整正文，并包含“必须实现的目标”“验收清单”“非本次目标”“已获得的授权”四个章节。
- [x] 由独立语义审核者验收 Issue #18草稿。
- [x] 只修改 GitHub Issue #18，并回读实际正文完成语义验收。
- **Status:** completed

## Decisions Made

| Decision | Rationale |
|---|---|
| 本轮只讨论方案 | 用户要求先讨论可行性、冲突和修改方案。 |
| 使用隔离规划目录 | 仓库根目录已有其他任务的规划文件，本轮不覆盖。 |
| 原生 child slot 不能由 shadow occupant 重复声明 | rc.8 SlotCore 对重复 child declaration fail closed；原生 Settings/Model UI只能由原生父 occupant继续渲染。 |
| 推荐完整 native Surface 路线 | 该路线准确满足原生界面保留与左栏进入工作台；项目必须放弃当前 top-level root takeover。 |
| Workbench 通过原生 InputBar复用 ModelSelect | 项目停止 shadow `conversation.composer.bar`；项目不嵌入或复制 ModelSelect。 |
| 四项需求作为同一轮设计范围 | 用户明确前后两轮合计四项需求，并要求最小改动、不过度设计。 |
| Workbench 复用原生 InputBar | 原生 InputBar一次提供 ModelSelect、PermissionSelect、`/` Menu、附件与发送状态；复制控件会扩大修改面。 |
| 项目 Preset 启用 Harness 默认 Skill roots | `includeDefaultRoots: true` 是 rc.8 读取项目 `.agents/skills` 的唯一现成配置接缝；项目不新增 SkillProvider。 |
| #4 直接使用原生 input reference seam | rc.8 公开 `IConversation.input`、`SessionInput.insertReference()`、`InputState` 与 `ReferenceCodec.serialize()` 已完整覆盖顺序插入、发送前解析、一次提交、失败保留和成功清理；#4 删除项目 composer 接管。 |
| #4 使用原生 inline reference chip | 原生 InputBar 会渲染每个 reference occurrence；#4 删除项目自绘上方 chip 的 1:1 条款，保留 Message Context Modal、上下文计数和已发送消息折叠块。 |
| #6 使用原生 route reference | Execution Route通过独立 `generation-route` reference source写入原生 InputState并序列化为 `generation-route.v1`；route occurrence不计入 Message Context数量。 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| 一次 apply_patch 同时删除并新增 findings.md 被拒绝 | 1 | 拆成两个 apply_patch 调用后完成重写。 |
| zsh 对不存在的 dsh-api-remotes glob 执行 no-match | 1 | 停止使用未经解析的 glob，改用 `find` 定位实际包路径。 |
| 一次多文件方案修订的上下文与 findings.md不匹配 | 1 | 改为按当前行内容分段应用补丁。 |
