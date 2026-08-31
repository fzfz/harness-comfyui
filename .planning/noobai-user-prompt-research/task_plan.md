# `noobai_user_prompt` 输入合同调研与实施方案计划

## 必须要实现的目标

- 计划执行者必须确认当前系统是否仍会向 Prompt Builder 类 Skill 提供 `noobai_user_prompt` 或 `noobai_user_prompt.xxx` 数据。
- 计划执行者必须追踪该数据从 UI、Session 上下文、Prompt/Tool/CLI 输入、Skill 文档到测试夹具的完整定义和传递路径。
- 计划执行者必须列出仍引用该数据的 Prompt Builder 类 Skill、参考文档、运行时代码和测试。
- 计划执行者必须根据实际数据合同设计删除方案，并在用户批准前停止修改 Skill、运行时代码和测试代码。

## 最终提交动作

计划执行者必须在本文件最后一次修改后执行 `pnpm quality` 和 `git diff --check`。两条命令通过后，计划执行者不得再修改候选树；计划执行者必须直接提交并推送最终发布提交。计划执行者确认本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA 后，创建 `v0.37.7` Release 并部署生产 checkout。最终提交门禁结果记录在任务交付信息中，不再写回候选树。

## 当前阶段

阶段 9：本地发布门禁策略和独立审查已经完成，等待最终提交门禁、发布与生产部署。

## 调研阶段

### 阶段 1：确认仓库基线与搜索范围

- [x] 从最新 `origin/main` 创建独立 linked worktree。
- [x] 阅读独立 worktree 开发规范和项目 Skill 开发规范。
- [x] 确认 Prompt Builder 类 Skill 的目录范围和命名范围。
- **状态：** 完成

### 阶段 2：追踪当前运行时输入合同

- [x] 搜索 `noobai_user_prompt` 的全部精确引用和命名变体。
- [x] 识别 UI、后端、Session 上下文、Preset、managed CLI 和 Skill 之间的数据传递边界。
- [x] 用当前生产代码和测试确认系统是否仍构造或传递该数据。
- **状态：** 完成

### 阶段 3：评估删除影响

- [x] 区分过期文档定义、仍可达运行时合同、测试夹具和历史说明。
- [x] 列出需要删除或改写的具体文件、章节、JSON 属性和测试断言。
- [x] 识别删除后 Prompt Builder Skill 必须改用的真实输入来源。
- **状态：** 完成

### 阶段 4：编写实施方案与验收清单

- [x] 编写具有明确执行主体、动作和具体对象的实施步骤。
- [x] 为每个受影响分支设计自动化测试和真实 Desktop 模型验收。
- [x] 委托独立语义 Reviewer 审核方案的定义、指代、边界和验收清单。
- [x] 完成 Reviewer 第一轮问题修正并通过第二轮审查。
- [x] 向用户提交方案并等待批准。
- **状态：** 完成

### 阶段 5：修改 Skill 并完成独立语义 Review

- [x] 修改六个 Prompt Builder Skill 文件。
- [x] 清除旧输入对象、旧输入属性和 UI 记录裸字段引用。
- [x] 由独立语义 Reviewer 完成四轮审查并修正全部问题。
- [x] 第四轮独立语义 Review 无阻塞或非阻塞问题。
- **状态：** 完成

### 阶段 6：候选质量门禁与候选提交

- [x] 执行 `pnpm quality`。
- [x] 执行 `git diff --check`。
- [x] 提交候选变更并记录完整 SHA。
- **状态：** 完成

### 阶段 7：真实 Desktop 模型验收

- [x] 主 checkout 快进到候选提交 `dff04f2812bb93eca53946c465924d7b101f4153`。
- [x] 两个全局 Skill 链接解析到主 checkout 的 canonical Skill 目录。
- [x] ANIMA 普通文字、ANIMA Character/Style 和 ANIMA 历史查询通过。
- [x] WAI 普通文字、WAI Character/Style 和 WAI 历史查询通过。
- [x] 保存模型验收记录并停止开发 Desktop。
- **状态：** 完成

### 阶段 8：发布与生产部署

- [x] 更新 `0.37.7` 版本和发布文件。
- [x] 完成发布文件独立语义 Review、最终 `pnpm quality` 和 `git diff --check`。
- [x] 推送 source commit `dff04f2812bb93eca53946c465924d7b101f4153` 到 `origin/main`。
- [x] 确认 Actions run `33384846762` 因账户账单或 spending limit 在 job 启动前被拒绝，且没有产生源码验收结果。
- [x] 用户授权阶段 9 使用本地发布门禁替代 GitHub Actions 门禁。
- **状态：** 原发布流程已由阶段 9 替代

### 阶段 9：修改发布门禁策略与规范

- [x] 核对 GitHub Actions Billing 错误、仓库可见性、branch protection 可用性和现有 workflow 命令。
- [x] 比较 `pnpm quality` 与两个 GitHub Actions job 的测试覆盖范围。
- [x] 用户批准本地发布门禁方案。
- [x] 删除自动 GitHub Actions workflow，并修改对应合同测试。
- [x] 修改 `AGENTS.md`、发布规范、测试规范、技术栈说明和 `0.37.7` 发布说明。
- [x] 完成独立 Standards Review 和独立 Spec Review。
- [x] 完成语义问题修正与独立语义复审。
- [x] 两轮完整 `pnpm quality` 和 `git diff --check` 均通过。
- [ ] 提交并推送最终发布提交，创建 `v0.37.7` tag 与 GitHub Release，部署生产 checkout。
- **状态：** 等待最终提交门禁

## 验收清单

- [x] 调研结论明确回答“当前系统是否仍输入 `noobai_user_prompt` 数据”。
- [x] 每项结论引用仓库中的具体文件、数据属性、函数、接口或测试证据。
- [x] 影响清单覆盖所有 Prompt Builder 类 Skill 中的精确引用和语义等价引用。
- [x] 实施方案分别定义 Skill 文档修改、运行时代码修改、测试修改和真实模型验收；不需要修改的类别也写明证据。
- [x] 实施方案覆盖所有受影响输入分支和两个历史 Generation Run 查询分支。
- [x] 独立语义 Reviewer 已出具验收清单，且计划执行者已处理 Reviewer 指出的具体问题。
- [x] 六个 Skill 文件已经使用当前消息普通文字和 `comfyui-context` 数据合同，并通过独立语义 Review。
- [x] 六项真实 Desktop 模型验收全部通过。

## 非本次目标

- 本次不修改 Prompt Builder 类 Skill 的 Prompt 构造行为、格式校验器或历史 Generation Run 查询合同。
- 本次不修改 Host、Client、Catalog、Harness 或 DSH Desktop 源码。
- 本次不增加或升级依赖。
- 本次不扩展到与当前消息输入合同无关的 Skill 重构。

## 已获得的授权

- 用户已授权计划执行者从当前仓库建立独立 worktree。
- 用户已授权计划执行者读取仓库文件、Git 历史和本机运行时配置以完成调研。
- 用户已授权计划执行者创建设计实施方案。
- 用户已明确批准 `implementation-plan.md`，并授权计划执行者修改六个 Skill 文件、执行真实模型验收、更新版本与发布文件、提交、推送、发布和生产部署。
- 用户已授权计划执行者删除自动 GitHub Actions workflow，并采用独立 linked worktree 中的 `pnpm quality`、`git diff --check` 和必需独立审查作为最终发布门禁。

## 关键问题

1. `noobai_user_prompt` 最初由哪个系统组成部分定义，当前代码是否仍创建该属性？
2. Prompt Builder 类 Skill 当前实际接收哪些 UI 选择、用户消息和 CLI 查询结果？
3. 删除过期定义后，Skill 中的每条流程分支应引用哪个真实输入来源？
4. 是否存在仅用于历史 Generation Run 查询的同名输出属性，不能与实时输入合同一起删除？

## 决策记录

| 决策 | 理由 |
| --- | --- |
| 本轮采用 review 边界 | 用户要求先调研和设计方案，并明确要求批准后才实施。 |
| worktree 从最新 `origin/main` 创建 | 调研必须基于当前远端主线代码，避免主 checkout 落后提交造成错误结论。 |
| 只改 Skill 文档和发布记录，不改运行时代码 | 运行时代码和生产 Session 已经使用正确的 `comfyui-context` 合同。 |

## 错误记录

| 错误 | 尝试次数 | 处理结果 |
| --- | ---: | --- |
| 更新计划文件时补丁上下文少了一个空格，导致 `apply_patch` 验证失败 | 1 | 重新读取文件并使用精确上下文应用补丁。 |
