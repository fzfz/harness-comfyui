# 调研进度记录

## 会话：2026-08-31

### 阶段 9：修改发布门禁策略与规范

- **状态：** 实施中
- **已完成动作：**
  - 用户批准删除自动 GitHub Actions workflow，并采用独立 linked worktree 中的完整本地发布门禁。
  - 删除 `.github/workflows/ci.yml` 和只验证该 workflow 内容的 `tests/contract/workflows.test.ts`。
  - 删除 `tests/contract/engineering-baseline.test.ts` 中重复验证 GitHub Actions Desktop job 的断言；根 `package.json` 的工程合同继续精确验证 `quality` 包含 `test:desktop`。
  - 修改 `AGENTS.md`、`CONTEXT.md`、`docs/system/releasing.md`、`docs/system/testing.md`、`docs/system/technology-stack.md`、`docs/system/directory-structure.md` 和 `docs/releasenotes.md`，把最终候选树的 `pnpm quality`、`git diff --check` 和必需独立审查定义为发布门禁。
  - 把 production 测试中的 GitHub CI 命名改为本地发布验收命名，测试行为保持不变。
  - `pnpm test:contract` 通过 27 项合同与安全测试；`pnpm prod:test` 通过 102 项生产生命周期测试。
  - 独立 Standards Review 和独立 Spec Review 均通过，没有阻塞或非阻塞问题。
  - 独立语义 Review 指出当前步骤状态和“唯一自动化发布门禁”定义存在两项冲突；计划执行者已修正对应文案。
  - 独立语义复审通过，上一轮全部阻塞和非阻塞问题已经关闭。
  - 第一轮完整 `pnpm quality` 通过：539 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%；依赖漏洞为 critical 0、high 0、moderate 0、low 0。
  - 计划状态更新通过独立语义复审；第二轮完整 `pnpm quality` 和 `git diff --check` 通过，测试数量、覆盖率和依赖审计结果与第一轮一致。
- **下一步：**
  - 在本文件最后一次修改后执行最终 `pnpm quality` 与 `git diff --check`；通过后不再修改候选树，直接提交并推送最终发布提交。

### 阶段 8：发布门禁与最终验收

- **状态：** 原发布流程已由阶段 9 替代
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
  - 提交候选变更，候选提交为 `dff04f2812bb93eca53946c465924d7b101f4153`。
  - 主 checkout 安全快进到候选提交，两个全局 Skill 链接继续解析到主 checkout 的 canonical Skill 目录。
  - 使用 `ComfyUI工作台预设`、`DeepSeek V4 Flash` 和 `Default` 推理等级完成六项真实 Desktop 模型验收。
  - ANIMA 和 WAI 的普通文字、Character/Style 与纯历史查询用例全部通过。
  - 保存 `.planning/noobai-user-prompt-research/model-acceptance.md`。
  - 执行 `pnpm dev:stop`；`pnpm dev:status` 返回 `{"status":"stopped"}`。
  - 更新 `0.37.7` 版本、发布说明和当前版本规范。
  - 独立语义 Reviewer 发现 ANIMA Character 外观分槽证据缺口和一处发布说明归属错误。
  - 通过 Desktop UI 选择目录 Character `Ani (Grok Companion)`；该记录的实际 `data.prompt_text` 同时包含 `Ani_(Grok)`、`blonde hair`、`twintails`、`long hair` 和 `blue eyes`，校验器返回 `result: success`。
  - 独立语义 Reviewer 第二轮确认两项问题均已关闭，最终结论为通过。
  - 文案修正后的最终 `pnpm quality` 通过：539 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项 Desktop 测试通过；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%；依赖漏洞为 critical 0、high 0、moderate 0、low 0。
  - 通过真实 Desktop UI 选择 Character `Ani (Grok Companion)`、Style `say_hana` 和 Style `ds_mile`；真实模型把 Character 身份词与四个外观词分别放入 `character_series` 和 `appearance`，校验器返回 `result: success`。
  - 完成标准 Preset Host 项目 Tool、ComfyUI Preset Tool schema 隔离、全局 Skill 与 managed CLI 三项仓库最低真实模型行为验收。
  - 通过真实 Desktop UI 选择 Workflow `43` 和生成模型 `3`；真实模型对同一 Generation Request 发起两次独立提交，Run Repository 持久化两个不同 Run。两个 Run 因实例 `2` 的 ComfyUI DevTools 目标不可连接而失败。
  - 按两阶段发布流程把 source commit `dff04f2812bb93eca53946c465924d7b101f4153` 推送到 `origin/main`。
  - GitHub Actions run `33384846762` 的两个 job 均在执行任何 step 前被账户账单或 Actions spending limit 拒绝启动。
- **下一步：**
  - 阶段 8 的原 GitHub Actions 发布步骤已经由阶段 9 的本地发布门禁替代。

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
| 2026-08-31 | Computer Use 服务无法启动 | 1 | 按 Browser Skill 使用应用内浏览器连接同一开发 Desktop Harness 端点，真实 Session、Preset、Provider、模型和 Skill 路径保持不变。 |
| 2026-08-31 | 新 WAI Session 中发送按钮点击没有提交首条消息 | 2 | 使用消息编辑器的 Enter 提交；消息进入真实 Session 并完成验收。 |
| 2026-08-31 | 首次 `0.37.7` 最终质量门禁中的工程基线仍断言 `0.37.6` | 1 | 同步 `tests/contract/engineering-baseline.test.ts` 和 `CONTEXT.md` 的当前版本，再次执行完整 `pnpm quality` 并通过。 |
| 2026-08-31 | 独立语义 Reviewer 发现 ANIMA Character 外观分槽缺少真实模型证据，且发布说明把 WAI 的 `selection_snapshot_version` 错误归入 ANIMA | 1 | 补充真实 Desktop 模型复验，修正组件级发布说明；Reviewer 第二轮确认两项问题均已关闭。 |
| 2026-08-31 | 两次 `generation submit --stdin` 在 60 秒内没有向模型返回 `run_id` | 2 | 只读查询 Run Repository，确认两个不同 Run 已持久化；结果抽屉随后显示两个 Run 因 ComfyUI DevTools 目标不可连接而失败。 |
| 2026-08-31 | GitHub Actions run `33384846762` 的 job 未启动 | 1 | GitHub 注释明确要求修复账户 Billing 或提高 Actions spending limit；最终发布文档、tag、Release 和生产部署保持未执行。 |
| 2026-08-31 | 同一个补丁同时修改多份发布规范时，`docs/system/releasing.md` 的末尾上下文不匹配，导致补丁整体未生效 | 1 | 重新读取精确上下文，并把 workflow、测试和规范修改拆成独立小补丁。 |

## 上下文恢复检查

| 问题 | 回答 |
| --- | --- |
| 当前阶段是什么？ | 阶段 9 已删除自动 GitHub Actions workflow，并通过独立审查和两轮完整本地发布门禁；最终候选树正在等待提交前最后一次门禁。 |
| 后续阶段是什么？ | 独立审查和完整本地门禁通过后，提交并推送最终发布提交，再创建 Release 并部署生产 checkout。 |
| 本轮目标是什么？ | 删除 Prompt Builder Skill 中过期的 `noobai_user_prompt` 输入定义，并通过本地发布门禁交付 `v0.37.7`。 |
| 已获得哪些发现？ | 参见 `findings.md`。 |
| 已完成哪些动作？ | 参见本文件的阶段 1 至阶段 9 记录。 |
