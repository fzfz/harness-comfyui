# 调研进度记录

## 会话：2026-08-31

### 阶段 5：实施 Skill 输入合同修复

- **状态：** 进行中
- **已完成动作：**
  - 用户明确批准 `implementation-plan.md` 并要求开始实施。
  - 确认独立 worktree `HEAD` 与最新 `origin/main` 均为 `5aa95e66c31db9fde1472b32250cd7fcf20711a4`。
  - 读取 `implement`、`planning-with-files`、`writing-for-agents`、`skill-creator` 和 `code-review` 的完整 Skill 说明。
  - 修改六个 Prompt Builder Skill 文件，把当前输入合同改为用户消息普通文字和 Character/Style `comfyui-context` JSON 行。
  - 搜索两个 Skill 目录，确认旧输入对象和旧输入属性没有残留。
  - 启动独立语义 Reviewer 审查六个修改文件。
  - 第一轮 Reviewer 发现 ANIMA 最终组装段仍把 UI 记录写成查询结果结构；已把 UI Style 顺序、UI Character/Style 字段路径和语义查询结果顺序改为各自的数据合同。
  - 第二轮 Reviewer 发现 ANIMA 两处采用条件和 WAI 一处采用流程仍使用裸 `prompt_text`；已改为 UI 记录的完整 `data.prompt_text` 路径。
  - 收口搜索发现 ANIMA Character 语义查询条件还有一处把 UI 字段写成裸 `prompt_text`；已改为 `data.prompt_text`。
  - 第四轮独立语义 Review 通过，六个修改文件没有阻塞或非阻塞问题。
  - 使用仓库的 worktree checkout 准备函数创建 `.env` 和 `node_modules` 到主 checkout 的符号链接，没有安装依赖。
  - `pnpm typecheck` 通过。
  - 为 worktree 的 Desktop 自动化创建 `.local/upstreams/dsh-desktop` 到主 checkout 现有 DSH Desktop 的符号链接，没有 clone 或安装第二份 DSH Desktop。
  - 第二次完整 `pnpm quality` 通过：539 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项 Desktop 测试通过；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%；依赖漏洞为 critical 0、high 0、moderate 0、low 0。
- **下一步：**
  - 修改六个 Prompt Builder Skill 文件。
  - 由独立语义 Reviewer 审查修改内容。

### 阶段 1：确认仓库基线与搜索范围

- **状态：** 完成
- **已完成动作：**
  - 读取 `planning-with-files` 和 `stop-that-shit` 的完整 Skill 说明。
  - 读取 `docs/agents/worktree-development.md`。
  - 读取 `docs/agents/comfyui-workbench-preset-and-skill-development.md`。
  - 获取最新 `origin/main` 并创建独立 linked worktree。
  - 确认独立 worktree 根目录的 `.git` 是 linked-worktree 元数据文件。
  - 完成 `noobai_user_prompt` 精确字符串和命名变体的仓库级搜索。
  - 初步确认精确引用集中在 ANIMA3 Prompt Builder 和 WAI Prompt Builder 的输入合同文件。
- **已创建文件：**
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 2：追踪当前运行时输入合同

- **状态：** 完成
- **已完成动作：**
  - 完整读取 WAI Prompt Builder 的 `references/input-contract.md`。
  - 阅读系统架构、目录结构和配置规范中与 Client 上下文、Skill、Preset、managed CLI 和 Session 相关的合同。
  - 追踪 `CatalogContext` 从 Catalog 返回值、Client 选择器、composer 草稿序列化到 Harness 原生 Session input 的完整路径。
  - 核对 Workbench controller 和 native surfaces 单元测试中对真实草稿格式的断言。
  - 搜索本机安装的 Harness 与 DSH Desktop 源码，排除提交消息后由外部框架创建 `noobai_user_prompt` 包装对象的可能性。
  - 使用 Git blame、Git pickaxe 和迁移 PRD 确认旧定义从首次导入起就与当前 Harness 输入合同冲突。
  - 只读核对生产 checkout 版本、生产 Session 数据中的合同标识命中数量和两个全局 Skill 链接目标。

### 阶段 3：评估删除影响

- **状态：** 完成
- **已完成动作：**
  - 建立两个 Prompt Builder 的旧标识、旧字段、错误类型和错误顺序定义清单。
  - 确认六个 Skill 文件需要修改，Host、Client、Catalog、Generation、校验器和现有单元测试不需要修改。
  - 确认 WAI 保留现有输入合同文件并重写，ANIMA 保留当前 `SKILL.md` 中的集中输入章节。

### 阶段 4：编写实施方案与验收清单

- **状态：** 完成
- **已完成动作：**
  - 创建 `implementation-plan.md`，写明调研结论、六个 Skill 文件的修改动作、语义验收、真实模型验收、质量门禁、发布和部署步骤。
  - 独立语义 Reviewer 第一轮发现 linked worktree Skill 可见性、同类选择顺序可观察性、历史查询用例数量和执行主体定义问题。
  - 修订主 checkout 候选提交同步、全局 Skill 解析路径核对、Style A/Style B 顺序用例、六项真实请求和执行主体定义。
  - 独立语义 Reviewer 第二轮审查通过，未发现阻塞性或非阻塞性问题。

## 检查结果

| 检查对象 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- |
| 独立 worktree 基线 | 分支从最新 `origin/main` 创建 | HEAD 为 `5aa95e6`，分支为 `codex/remove-obsolete-noobai-user-prompt` | 通过 |
| linked-worktree 元数据 | 根目录 `.git` 为指向主 checkout 元数据的文件 | `.git` 指向主 checkout 的 `.git/worktrees/harness-comfyui-research-noobai-user-prompt` | 通过 |
| 计划文件格式 | `git diff --check` 无错误 | 命令无输出，退出码为 0 | 通过 |
| 独立语义 Review | Reviewer 验收调研结论、实施步骤、授权边界和完成条件 | 第二轮 Review 结论为通过 | 通过 |

## 错误日志

| 时间 | 错误 | 尝试次数 | 处理结果 |
| --- | --- | ---: | --- |
| 2026-08-31 | 更新计划文件时补丁上下文少了一个空格，导致 `apply_patch` 验证失败 | 1 | 重新读取文件并使用精确上下文应用补丁。 |
| 2026-08-31 | 首次残留搜索命令中的反引号被 shell 解释，导致搜索模式缺失并产生大量无效输出 | 1 | 改用单引号包围的十六进制反引号模式重新搜索；旧输入合同搜索结果为空。 |
| 2026-08-31 | 单个补丁同时删除并新增同一路径，`apply_patch` 拒绝该补丁 | 1 | 分两次使用 `apply_patch` 删除并新增 WAI 输入合同文件。 |
| 2026-08-31 | worktree 尚未创建 `node_modules` 链接，首次 `pnpm typecheck` 找不到 `tsc` | 1 | 使用仓库的 worktree checkout 准备函数创建到主 checkout 的依赖链接，重新执行 `pnpm typecheck` 并通过。 |
| 2026-08-31 | 首次 `pnpm quality` 的两项 Desktop 测试找不到 worktree `.local/upstreams/dsh-desktop` 中的 DSH 模块 | 1 | 创建到主 checkout 现有 DSH Desktop 的符号链接；单独重跑 2 项 Desktop 测试并通过，随后第二次完整 `pnpm quality` 通过。 |

## 上下文恢复检查

| 问题 | 回答 |
| --- | --- |
| 当前阶段是什么？ | 阶段 4 已完成，等待用户批准实施方案。 |
| 后续阶段是什么？ | 用户批准后修改六个 Skill 文件、完成真实模型验收、质量门禁、发布和部署。 |
| 本轮目标是什么？ | 确认 `noobai_user_prompt` 是否仍是实时输入，并提交等待批准的删除方案。 |
| 已获得哪些发现？ | 参见 `findings.md`。 |
| 已完成哪些动作？ | 参见本文件的阶段 1 记录。 |
