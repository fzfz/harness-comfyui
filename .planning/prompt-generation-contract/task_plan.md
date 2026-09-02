# Prompt Builder 与 ComfyUI 生图参数合同方案任务计划

## 必须实现的目标

计划执行者必须在当前独立 worktree 完整实现用户已批准的 `implementation-plan.md`：三个 Prompt Builder 必须输出模型对应的正向 Prompt、负向策略、生成目的和模板无关目标尺寸；`comfyui-generate` 必须通过 Skill-owned CLI 参考文档调用模板实时检查、独占处理 Seed 并提交实际参数；Host 必须把现有 `ComfyWorkflowCompiler` 加深为检查与编译共用私有参数计划的模块。计划执行者必须完成自动化测试、独立语义审核、真实 Desktop 验收、代码审查和提交。

## 下一步

提交冻结候选树，随后创建并合并 Pull Request、发布 v0.39.0、更新生产 checkout 并完成生产 Desktop 验收。

## 当前阶段

阶段 10：最终质量门禁、代码审查与提交。

## 阶段

### 阶段 1：仓库现状与合同调查

- [x] 确认三个 Prompt Builder Skill 和一个生图 Skill 的文件边界。
- [x] 确认四个 Skill 当前输出或消费的正向 Prompt、负向 Prompt、Seed 与尺寸参数。
- [x] 确认 managed CLI、Generation Request、Workflow compiler 与参数支持基线能够表达的尺寸路线。
- [x] 确认现有 Skill 语义测试、真实模型验收和发布门禁。
- **状态：** 已完成

### 阶段 2：模型资料与尺寸路线调研

- [x] 调研 WAI-illustrious-SDXL、ANIMA3 和 Krea2 实际目标模型的正负 Prompt 特点。
- [x] 调研每类模型的原生训练分辨率、推荐画幅和尺寸倍数约束。
- [x] 核对当前 Catalog Workflow 模板支持 `width`/`height` 或 `aspect_ratio`/`megapixels` 的真实分布。
- [x] 形成测试生成与正式生成的尺寸候选矩阵，并记录事实来源与设计推论。
- **状态：** 已完成

### 阶段 3：实施方案设计

- [x] 定义 Prompt Builder 统一输出合同及三模型差异化负向 Prompt 规则。
- [x] 定义 `comfyui-generate` 的参数继承、显式覆盖、随机 Seed 和历史 Seed 复用规则。
- [x] 定义需要修改的文件、共享单一来源、分支测试、真实模型验收和发布门禁。
- [x] 明确实施顺序、迁移边界、错误处理和审批门。
- **状态：** 已完成

### 阶段 4：独立语义审核

- [x] 第一名独立 Reviewer 检查方案的主体、动作、具体对象、领域名词定义和验收可执行性。
- [x] 第一名独立 Reviewer 检查方案是否覆盖用户的四项需求且没有实施越权。
- [x] 主线程根据第一轮审核修订尺寸转换、历史 Seed、Krea2 validator、程序测试边界和逐尺寸验收清单。
- [x] 第二名独立 Reviewer 复核修订版方案并确认没有 P0、P1 或 P2。
- [x] 独立 Reviewer 复核用户补充的 `9:16` / `16:9` 候选、名义清晰度和 40 个配置验收计数。
- [x] 独立 Reviewer 复核 Prompt Builder 不处理 Seed、`comfyui-generate` 独占 Seed 的职责边界。
- [x] 独立 Reviewer 复核首次测试、方案比较和后续 Prompt 迭代持续使用测试档的用途分支。
- [x] 独立 Reviewer 复核详细合同只写入参考文档、`SKILL.md` 只写读取时机的内容边界。
- [x] 独立 Reviewer 复核 Prompt Builder 与模板解耦、生成 Skill实时查询模板参数和允许尺寸调整的职责边界。
- [x] 独立 Reviewer 复核 Workflow compiler 深模块接口、内部复用和测试 seam。
- [x] 独立 Reviewer 复核生成 Skill 的只读检查 CLI 参考文档、读取时机和九章合同。
- **状态：** 已完成

### 阶段 5：方案交付与审批门

- [x] 提交方案文件路径、关键决策、待用户选择项和 worktree 状态。
- [x] 交付包含 `9:16` / `16:9` 的更新方案，并明确停止实施。
- [x] 交付 Seed 职责修订后的方案，并明确停止实施。
- [x] 交付 Prompt 迭代用途修订后的方案，并明确停止实施。
- [x] 交付 Skill 与参考文档内容边界修订后的方案，并明确停止实施。
- [x] 交付模板职责修订后的方案，并明确停止实施。
- [x] 交付 Workflow compiler 深模块修订后的方案，并明确停止实施。
- [x] 交付只读检查 CLI 参考文档修订后的方案，并明确停止实施。
- **状态：** 已完成，用户已批准实施

### 阶段 6：实施预检与 TDD seam 固定

- [x] 完整读取 `implement`、`tdd`、`skill-creator`、`writing-for-agents`、`code-review` 及其必读参考。
- [x] 完整读取项目 Skill 开发、架构、目录、配置、测试、技术栈和独立 worktree Desktop 规范。
- [x] 确认 worktree 基线、用户改动边界、依赖状态和计划授权文件清单。
- [x] 把已批准 seam 固定为 `WorkflowCompiler`、`GenerationPreparationAdapter`、`GenerationRuntime`、managed CLI 和 Skill validator/contract tests。
- **状态：** 已完成

### 阶段 7：Workflow compiler 与 managed CLI 的 TDD 实现

- [x] 通过 `WorkflowCompiler` interface 逐个完成 inspect/compile 共用参数计划的 red-green slices。
- [x] 通过 adapter/runtime/CLI 公共接口逐个完成只读模板检查与普通随机 Seed 命令的 red-green slices。
- [x] 定期运行相关单测和 typecheck，记录每个失败与修正。
- **状态：** 已完成

### 阶段 8：四个 Skill 与参考资源实现

- [x] 创建三个 Builder 的合同、schema、profiles 和 validator，并按方案改写各自 `SKILL.md` 路由。
- [x] 创建生成 Skill 的 Prompt 结果合同、schema 和模板检查 CLI 参考文档，并按方案改写 `SKILL.md` 与 `generation-cli.md`。
- [x] 完成合同测试、各模型 validator 测试和独立语义审核。
- **状态：** 已完成

### 阶段 9：真实 Desktop 与模型验收

- [x] 按 worktree 规范启动完整 Desktop，并从第二终端验证状态与日志。
- [x] 完成方案第 7 章规定的 40 个模型/尺寸配置及所有用途、尺寸、Seed、CLI 路由分支。
- [x] 完成修正版图片的独立视觉终验；每个最终候选配置均取得非 FAIL 判定。
- [x] 停止补充验收使用的开发 Desktop并确认状态已停止。
- **状态：** 已完成；40 个最终 Run 全部成功，视觉结果为 PASS 6、CONDITIONAL 34、FAIL 0，profile 决定为 RETAIN 40、DELETE 0

### 阶段 10：最终质量门禁、代码审查与提交

- [x] 在终审文档修订后运行一轮完整 `pnpm quality`；889 项 unit/integration、39 项 contract/security、139 项 production、32 项 prototype 与 2 项 Desktop 测试通过，依赖审计为 critical 0、high 0、moderate 0、low 0。
- [x] 运行完整测试套件、`pnpm quality` 和 `git diff --check`，之后不再修改候选树。
- [x] 按 `code-review` 对固定基线执行 Standards 与 Spec 两轴独立终审，并确认所有已修复问题保持关闭。
- [ ] 提交最终候选树到当前 `codex/prompt-generation-contract-plan` 分支。
- **状态：** 进行中；三轴终审均为 P0、P1、P2 零项，冻结候选树的最终质量门禁已经通过，等待提交

### 阶段 11：Pull Request、发布、生产部署与生产验收

- [ ] 推送最终候选分支并创建 Pull Request。
- [ ] 合并 Pull Request，并确认 `origin/main` 指向合并提交。
- [ ] 按 `docs/system/releasing.md` 发布新版本与 GitHub Release。
- [ ] 从已发布提交更新生产 checkout，保留生产专用配置与运行状态。
- [ ] 启动生产 Desktop并完成状态、日志、候选 Skill、模板检查、随机 Seed 与真实生图验收。
- **状态：** 未开始

## 验收清单

- [x] 方案至少包含“必须实现的目标”“验收清单”“非本次目标”“已获得的授权”四个章节。
- [x] 方案逐个列出三个 Prompt Builder Skill 与 `comfyui-generate` Skill 的修改责任。
- [x] 方案给出可选画幅对应的测试分辨率、正式分辨率和适用构图，并区分 `width`/`height` 与 `aspect_ratio`/`megapixels` 两类模板。
- [x] 方案针对三类目标模型分别给出负向 Prompt 设计依据、默认策略和用户显式覆盖规则。
- [x] 方案说明只有 `comfyui-generate` 负责每张图默认独立随机 Seed，以及用户显式要求复用历史 Seed 时的参数来源。
- [x] 方案列出成功、拒绝、错误和重复生成分支的测试与真实 Desktop 验收。
- [x] 独立 Reviewer 完成语义验收并返回逐项清单。
- [x] 四个目标 Skill 源文件没有在方案阶段发生修改。

## TDD seam

- `WorkflowCompiler.inspectRuntimeParameters` 与 `WorkflowCompiler.compile` 是参数发现、合同检查和目标一致性的深模块 seam。
- `GenerationPreparationAdapter.inspectRuntimeParameters` 与 `GenerationRuntime.inspectTemplateRuntimeParameters` 是 Source/Runtime delegation 和无 Run 副作用 seam。
- `generation inspect-template-parameters --stdin` 与 `generation random-seeds --stdin` 的 contract、route 和 shell command 是 managed CLI seam。
- 三个 Builder validator 的 stdin、stdout、exit code 和四份结果 schema 是 Skill 结构化结果 seam。
- `SKILL.md` 到 Skill-owned reference 的链接、文件存在性和 JSON schema 深度相等是仓库合同 seam；Markdown 语义由独立 Reviewer 验收。

## 非本次目标

- 本次实施不修改 Source Workflow 模板、ComfyUI 实例节点或 Catalog resolve 输出合同。
- 本次实施不修改 Source Workflow 模板、ComfyUI 实例节点或 Catalog 数据；发布与生产部署只使用通过验收并合入 `origin/main` 的发布提交。
- 本次实施不安装新依赖；`package.json` 与 `pnpm-lock.yaml` 必须保持无依赖变更。
- 本次实施不修改 `character-portrait-prompt-designer` 或方案第 4 章未授权的文件。

## 已获得的授权

- 用户已授权计划编写者创建独立 git worktree。
- 用户已授权计划编写者读取仓库文件、当前本机 Catalog/Workflow 结构和公开的一手技术资料。
- 用户已授权计划编写者在独立 worktree 中编写调研记录与实施方案。
- 用户已通过 `$implement` 明确批准计划执行者实施 `implementation-plan.md`、运行方案内测试与真实 Desktop 验收，并把最终结果提交到当前分支。
- 用户已授权计划执行者在验收通过后推送分支、创建并合并 Pull Request、发布版本、部署生产 checkout并完成生产验收。

## 关键问题

1. 已批准：Krea2 使用正向规避模式，并把当前单 Prompt 正文输出改为结构化结果。
2. 已批准：managed CLI 新增随机 Seed 命令和只读模板实际参数检查命令，生成 Skill只在 5% 比例偏差与 10% 面积偏差内自动适配尺寸。

## 已作决定

| 决定 | 理由 |
| --- | --- |
| 实施分支最终更新到 `origin/main` 的 `08d54a5ef942a85b4b05a355f1b9b8bf6ac12603` | 用户要求更新到最新基线后继续；该基线对应 `v0.38.7`，候选版本为 `v0.39.0`。 |
| 方案文件放入 `.planning/prompt-generation-contract/` | 仓库已有 `.planning/` 作为长期调研与真实模型验收记录位置。 |
| 模型事实优先使用官方文档、官方仓库和模型卡 | 用户要求调研三类模型的负向 Prompt 与尺寸特点，设计推论必须能够追溯到一手证据。 |
| 方案阶段不运行外部 Context7 CLI | 仓库安全规则禁止在未获单独批准时安装或运行外部下载程序。 |
| 三个 Prompt Builder 指 `anima-prompt-builder`、`wai-sdxl-prompt-builder` 和 `krea2-anime-prompt-builder` | 当前基线已经跟踪这三个模型专用 Builder；`character-portrait-prompt-designer` 不绑定第三种模型。 |

## 错误记录

| 错误 | 尝试 | 处理结果 |
| --- | --- | --- |
| 首次批量读取多个长文件时工具输出被截断 | 1 | 后续按文件单独读取，确保必读规范完整进入上下文。 |
| 可用 Skill 目录索引中的 `stop-that-shit` 版本路径已经过期 | 1–2 | 使用 `rg --files` 定位本机已安装的 0.2.0 版本并完整读取。 |
| 第一轮方案审核期间主 checkout 新增并提交 Krea2 Builder | 1 | 独立方案分支 fast-forward 到 `5142a99`，完整读取新的 Skill 合同并删除旧未跟踪目录假设。 |
