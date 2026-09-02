# Prompt Builder 与 ComfyUI 生图参数合同方案进度

## 会话：2026-09-03

### 基线同步与 Desktop 候选 Skill 加载门禁

- **状态：** 已完成
- **已完成动作：**
  - 用户授权把实施分支更新到最新 `origin/main`，并授权验收通过后的 Pull Request、合并、发布、生产部署与生产验收。
  - 把分支基线从 `edfa69a1d1c2ebc65beab66df1bfa7765ffb1ce6` 更新到 `08d54a5ef942a85b4b05a355f1b9b8bf6ac12603`。
  - 恢复候选改动时合并 `docs/system/testing.md`、`src/host/generation/generation-runtime.ts` 与 `tests/integration/cli-route.test.ts` 的三处冲突，同时保留新基线的 CLI 断连取消行为和本次模板检查、随机 Seed 行为。
  - 基线冲突合并后的 248 项 compiler/runtime/CLI 测试与 TypeScript typecheck 通过。
  - 两名独立 Reviewer 确认现有 `dev:start` 把隔离 Desktop HOME 的 `.agents/skills` 链接到真实 `$HOME/.agents/skills`，导致真实模型读取主开发 checkout 的旧版 Skill；该行为使 A01 不能作为候选验收证据。
  - 通过 TDD 增加 `config/desktop-worktree.json.skillSourceRelativePath`。开发 context 现在只接受当前 worktree 内存在的相对目录，并把隔离 HOME 的 Skill 根链接到该候选目录；生产 context 继续使用真实 home 的全局 Skill 根。
  - Desktop worktree 与 production 的 54 项相关测试、TypeScript typecheck 和 `git diff --check` 通过。

### 当前下一步

- 阶段 10 正在关闭独立语义、Standards 与 Spec 终审发现；真实 Desktop 与 40 个模型配置验收已经完成，开发 Desktop 已停止。
- 终审通过后运行最终 `pnpm quality` 与 `git diff --check`，随后提交候选树并进入 Pull Request、发布和生产部署。

## 会话：2026-09-02

### 阶段 1：仓库现状与合同调查

- **状态：** 已完成
- **已完成动作：**
  - 完整读取 `planning-with-files`、`skill-creator`、`writing-for-agents`、`team-mode` 与 `find-docs` 的适用规则。
  - 完整读取项目 Skill 开发、独立 worktree、测试、架构、目录结构和技术栈规范。
  - 检查主 checkout 状态并确认用户未提交内容。
  - 更新 `origin/main` 引用并从远端基线创建独立 worktree；主 checkout 随后提交第三个 Krea2 Builder 时，将方案分支 fast-forward 到 `5142a99`。
  - 建立当前方案的持久化任务计划、调研记录和进度记录。
  - 确认第三个 Prompt Builder 为当前基线已跟踪的 `krea2-anime-prompt-builder`，排除模型无关的 `character-portrait-prompt-designer`。
  - 完成 WAI-Illustrious 与 ANIMA 官方模型资料的独立调研并记录负向 Prompt 与尺寸事实。
  - 完成 Krea2 Turbo 官方模型身份、无独立负向 conditioning 和 1K–2K 尺寸范围调研。
  - 完成 19 个 Workflow 模板的静态尺寸参数矩阵和负向 Prompt 支持盘点。
  - 使用浏览器核验官方模型仓库与直接资料入口，并把浏览器无正文返回问题记录到调研文件。
  - 使用 `stop-that-shit` 检查方案阶段边界，确认当前只写入 `.planning/`，没有开始实施。
- **创建文件：**
  - `.planning/prompt-generation-contract/task_plan.md`
  - `.planning/prompt-generation-contract/findings.md`
  - `.planning/prompt-generation-contract/progress.md`

### 阶段 2：模型资料与尺寸路线调研

- **状态：** 已完成
- **已完成动作：**
  - 形成 ANIMA 3 种、WAI 7 种、Krea2 4 种画幅的测试档与正式档候选矩阵。
  - 区分精确 `width`/`height` 和 Selector `aspect_ratio`/`megapixels` 两种模板表示。
  - 把官方模型事实、项目尺寸候选和必须逐项真实生成验证的推论分开记录。

### 阶段 3：实施方案设计

- **状态：** 已完成
- **已完成动作：**
  - 定义 Builder 结构化结果、默认随机 Seed、固定或历史 Seed 复用、尺寸冲突和模型差异化负向策略。
  - 定义 managed CLI 随机 Seed 命令；最初设计的 Catalog `supported_parameters` 静态投影已在用户纠正模板职责后删除，改为 Generation CLI 实时模板参数检查。
  - 写入完整文件边界、自动化测试、语义审核、真实 Desktop 验收、非目标和授权边界。

### 阶段 4：独立语义审核

- **状态：** 已完成
- **已完成动作：**
  - 第一名独立 Reviewer 完成需求覆盖、合同清晰度和验收可执行性检查。
  - 根据 6 项 P1 修订尺寸表示关系、历史 Seed 责任、Krea2 validator、自动化测试语义边界和逐尺寸真实验收。
  - 方案编写期间发现主 checkout 新增并提交 `krea2-anime-prompt-builder`；方案分支更新基线并重写 Krea2 文件与授权边界。
  - 第二名独立 Reviewer 复核尺寸覆盖、Seed 责任、单次 20 张上限、Krea2 文件边界、28 个真实配置证据合同和程序/语义边界。
  - 第二名独立 Reviewer 最终确认没有 P0、P1 或 P2，并给出“方案可提交用户审批”结论。
  - 用户在审批前指出缺少 `9:16` 和 `16:9`；方案已把两个标准长画幅加入三种模型候选，并把真实配置数从 28 调整为 40。
  - 独立 Reviewer 确认新增长画幅均精确约分、名义 MP 偏差低于 5%、40 个配置计数一致，修订方案没有 P0、P1 或 P2。
  - 用户明确更正 Prompt Builder 不负责 Seed；方案已从三个 Builder 结果、CLI 文件边界、validator 和验收项中移除 Seed 职责，并把全部 Seed 行为集中到 `comfyui-generate`。
  - 独立 Reviewer 确认 Builder 只可为历史 Prompt 查询 Run、不为 Seed 发起查询或读取历史 Seed，`comfyui-generate` 独占全部 Seed 职责；修订没有 P0、P1 或 P2。
  - 用户补充测试用途还包括持续迭代 Prompt 方案；方案已把首次测试、方案比较和后续迭代统一定义为 `generation_purpose: "test"`，直到用户明确进入正式成图。
  - 独立 Reviewer 确认测试链连接、新任务默认、归属不明询问、多方案单结果和混合任务拆分规则没有 P0、P1 或 P2。
  - 用户要求详细合同只写入参考文档、`SKILL.md` 只写读取时机；方案已新增三个 Builder 的 `generation-output-contract.md`，并明确生成 Skill各参考文档的单一来源责任。
  - 独立 Reviewer 指出生成 Skill不能跨 Skill 读取 Builder 结果合同；方案已新增生成 Skill自有的 `prompt-result-contract.md` 与 `prompt-result-schema.json`，并要求四份本地 schema 深度相等。
  - 方案已把实施动作从“向 `SKILL.md` 增加读取时机”修订为“删除或改写重复或冲突详细合同，使 `SKILL.md` 最终只保留读取时机和执行阶段路由”。
  - 独立 Reviewer 最终确认参考文档内容边界修订没有 P0、P1 或 P2，可以提交用户审批。
  - 用户指出静态 `supported_parameters` 设计会把新增模板变成运行时失败；方案已改为 Prompt Builder 与模板解耦、生成 Skill通过 CLI 查询模板实际参数并适配尺寸。
  - 独立 Reviewer 第一轮模板职责复核提出目录参考读取时机、结构化尺寸候选和阈值边界测试问题；方案已补齐现有 `catalog-cli.md` 路由、compiler 生成的 `size_candidates`、preset 映射状态及 5%/10% 精确边界测试。
  - 独立 Reviewer 最终确认模板职责修订没有 P0、P1 或 P2，可以提交用户审批。
  - 用户要求模板只读检查复用 Workflow compiler 或抽象成深模块；方案已把现有 `ComfyWorkflowCompiler` 明确定义为深模块，并设计 `inspectRuntimeParameters` 与 `compile` 共用的私有 runtime-parameter plan。
  - 独立 Reviewer 第一轮指出缺少标准参数的错误等价范围、实例 ID 必填性和 Generation runtime 入口名称不够明确；方案已逐项收紧为可执行合同。
  - 独立 Reviewer 最终确认 Workflow compiler 深模块、adapter 边界、错误分支、测试 seam、文件清单和授权范围没有 P0、P1 或 P2。
  - 用户要求给 `comfyui-generate` 增加该只读检查 CLI 的 Skill-owned 参考文档；方案已把文件明确命名为 `template-parameter-inspection-cli.md`，并补齐九个必备章节、读取与重读时机、默认调用单位、语义审核和真实 Desktop 验收。
  - 独立 Reviewer 指出 ID 变化后的文档重读条件不一致以及实施清单无目标地包含现有 Skill 开发规范；方案已把 ID 变化定义为重新检查而非无条件重读，并从修改清单删除该规范文件。
  - 独立 Reviewer 最终确认只读检查 CLI 参考文档修订没有 P0、P1 或 P2。

### 阶段 5：方案交付与审批门

- **状态：** 已完成，用户已批准实施
- **已完成动作：**
  - 方案文件、调研记录、执行边界和审批项已经整理完成。
  - Skill 与参考文档内容边界修订已经通过独立审核；实施保持停止状态，等待用户批准更新方案。
  - 模板职责修订已经完成并通过独立审核；实施保持停止状态，等待用户批准。
  - Workflow compiler 深模块修订已经完成并通过独立审核；实施保持停止状态，等待用户批准。
  - 只读检查 CLI 参考文档修订已经完成并通过独立审核；实施保持停止状态，等待用户批准。

### 阶段 6：实施预检与 TDD seam 固定

- **状态：** 已完成
- **已完成动作：**
  - 用户通过 `$implement` 批准实施完整方案、运行验证并提交当前分支。
  - 开始重新读取实施、TDD、Skill 写作、文件化计划与最终代码审查规范。
  - 已批准 TDD seam 已写入 `task_plan.md`，无需再次向用户确认。
  - 把实施分支 rebase 到当前 main `edfa69a`；跳过 main 已包含的 Krea2 等价提交并保留最新 semantic query CLI 参考。
  - 确认 Workflow compiler、Source adapter、Generation runtime、managed CLI 和 Skill validator 的公开测试 seam，并锁定第一个 inspection red-green 切片。

### 阶段 7：Workflow compiler 与 managed CLI 的 TDD 实现

- **状态：** 进行中
- **已完成动作：**
  - 开始为 `WorkflowCompiler.inspectRuntimeParameters` 编写第一个公开接口失败测试。
  - 通过仓库 `prepareDesktopDevelopmentCheckout()` 建立 worktree 的 `.env` 与 `node_modules` 链接，没有运行依赖安装。
  - 第一个 width/height inspection 测试按预期因公共方法不存在而失败，完成 red 阶段。
  - 新增私有 `RuntimeParameterPlan`、公开 inspection 类型和 width/height 参数合同投影；compile 与 inspect 共用同一目标发现计划。
  - 第一个 inspection 测试转绿，随后仓库 TypeScript typecheck 通过。
  - 新增 Selector 与 preset inspection 红灯测试；实现 `aspect_ratio_megapixels` 配对、preset 确定性宽高解析和 `unmapped_values` 后测试转绿。
  - 验证多组尺寸参数输出独立节点后缀候选，且返回的 parameter ID 能命中相同 compile target。
  - 新增 Source adapter inspection 红灯测试；实现显式模板/实例读取与 compiler 委托后测试及 typecheck 转绿。
  - 新增 Generation runtime inspection 红灯测试；实现只委托 adapter 的无 Run 方法后 focused test 转绿。
  - typecheck 发现 6 个既有测试 fixture 尚未实现新 adapter 方法，下一步只补测试接口桩，不改变生产逻辑。
  - 补齐 6 个测试 adapter 后，compiler/preparer/runtime 共 232 个相关单测和 typecheck 全部通过。
  - 开始读取 managed CLI contract、shell 与 route 的现有严格解析和 dispatch seam。
  - 用户纠正随机源设计；方案已删除 `node:crypto` 和加密随机要求，后续实现只使用普通伪随机数并保留单次结果去重。
  - 完成两条 managed CLI 的严格 stdin parsing、shell stdin 路由、Host dispatch 与 route runtime 类型扩展。
  - 普通随机 Seed 使用 `Math.random()` 和单次 `Set` 去重；固定序列测试覆盖碰撞重试。
  - CLI contract、shell command 与 Host route 的 29 个测试以及 typecheck 全部通过。
  - 继续补齐 compiler inspection 的 Prompt、Seed、动态合同与错误一致性覆盖。
  - inspection 与 compile 已共用 dynamic-combo 合同校验；新增正向 Prompt、负向 Prompt、Seed 和 malformed dynamic 一致性测试。
  - compiler/preparer/runtime/CLI 六个相关测试文件共 263 个测试全部通过。
  - 进入四个 Skill 的 reference-first 实施阶段，先建立共同 schema 与各模型 profiles，再改写 validator 和 `SKILL.md` 路由。

## 检查结果

| 检查 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- |
| linked worktree 元数据 | worktree 根 `.git` 是元数据文件 | `.git` 指向主仓库 `worktrees/harness-comfyui-plan-prompt-generation-contract` | 通过 |
| 分支基线 | 独立分支包含用户当前已提交的三个模型专用 Builder | `codex/prompt-generation-contract-plan`，HEAD `5142a99` | 通过 |
| Skill 源文件修改 | 方案阶段没有修改 `.agents/skills/` | 尚未修改 | 通过 |
| 第三个模型路线辨析 | 三个 Builder 对应三种具体模型路线 | ANIMA、WAI-Illustrious、Krea2；Character Portrait 不绑定固定模型 | 通过 |
| 方案阶段修改边界 | 只修改 `.planning/prompt-generation-contract/` | `git status --short` 只显示该未跟踪目录 | 通过 |

## 错误日志

| 时间 | 错误 | 尝试 | 处理结果 |
| --- | --- | --- | --- |
| 2026-09-02 | 批量读取多个长文件时输出被截断 | 1 | 后续按文件单独读取。 |
| 2026-09-02 | 可用 Skill 索引中的 `stop-that-shit` 0.1.0 路径不存在 | 1–2 | 使用 `rg --files` 找到并读取本机 0.2.0 版本。 |
| 2026-09-02 | 第一轮审核时主 checkout 的第三个 Builder 名称和跟踪状态已经变化 | 1 | fast-forward 独立分支到 `5142a99`，重新读取 Skill 合同并修订方案。 |
| 2026-09-02 | 一次只读文件存在性循环误用 zsh 特殊变量 `path`，导致同一子 shell 后续找不到 `git` 和 `rg` | 1 | 该子 shell 结束后使用未覆盖系统选项的新命令重新检查；没有文件或环境状态被修改。 |
| 2026-09-02 | 最终 `rg` 检查把包含反引号的模式放入双引号，zsh 尝试执行模式中的文件名 | 1 | 命令只产生“文件不存在”提示且没有修改状态；后续使用单引号包裹整个检索模式重新检查。 |
| 2026-09-02 | Workflow compiler 修订检索再次把包含反引号的模式放入双引号，zsh 尝试执行模式中的标识符 | 1 | 命令只产生一条 `command not found` 提示并继续完成只读检索；后续检索不再在双引号模式中放置反引号。 |
| 2026-09-02 | 首次把方案计划转换为实施计划时，补丁中的授权原文与文件实际文本不完全一致 | 1 | 补丁未应用；改为按现有章节使用更小的精确补丁更新。 |
| 2026-09-02 | 尝试把实施分支 fast-forward 到当前 `main` 时 Git 报告无法快进 | 1 | 没有改变分支；下一步检查 merge-base 与双向提交，依据实际分叉选择保留方案提交的非破坏性整合方式。 |
| 2026-09-02 | `git rebase main` 尝试重放与 main 中 Krea2 功能等价的旧分支提交，产生 add/add 与文档冲突 | 1 | 按 merge-conflict 规范核对两个提交来源后跳过已由 main 包含的等价提交；rebase 完成，分支位于 `edfa69a`，没有手工混合两份实现。 |
| 2026-09-02 | 第一个 red 测试命令找不到 `vitest`，因为独立 worktree 尚未建立根 `node_modules` 链接 | 1 | 保留失败测试；按 worktree 规范定位仓库提供的 checkout 准备入口创建链接，不运行 `pnpm install`。 |

## 5 问重启检查

| 问题 | 答案 |
| --- | --- |
| 当前处于哪里？ | 阶段 10：最终质量门禁、代码审查与提交。 |
| 下一步到哪里？ | 关闭终审发现，运行最终 `pnpm quality` 与 `git diff --check`，提交后进入 Pull Request、发布和生产部署。 |
| 目标是什么？ | 完成已批准实现的最终门禁，并按用户授权创建 Pull Request、合并、发布、部署生产和执行生产验收。 |
| 已了解什么？ | 见 `findings.md`。 |
| 已完成什么？ | 实现、自动化测试、真实 Desktop、40 个模型配置、Seed 分支、尺寸适配和独立视觉验收均已完成；开发 Desktop 已停止。 |
## 2026-09-02 validator checkpoint

- Added identical ten-field generation-result JSON Schemas and model-specific generation profiles to the three Prompt Builders and `comfyui-generate`.
- Extended the ANIMA and WAI validators with shared structural, negative-mode, aspect-ratio, dimension, and megapixel validation. Preserved their prior prompt-format checks behind `--prompt-format`.
- Confirmed the random-seed route uses ordinary `Math.random()` and adds no cryptographic-randomness dependency or abstraction.

## 2026-09-02 Prompt Builder reference checkpoint

- Added model-owned `generation-output-contract.md` references for ANIMA, WAI, and Krea2. Each document owns test/final selection, Prompt iteration-chain behavior, template-independent size selection and overrides, model-specific negative behavior, and the deterministic validator interface.
- Kept every size constant and model route in `generation-profiles.json`; the Markdown references consume those values semantically and do not become a second structured constant source.
- The Skill entry files still need their precise read-time routes and the generation Skill still needs its result, template-inspection, and Seed CLI references.

## 2026-09-02 Skill routing checkpoint

- Added `prompt-result-contract.md` and the nine-section `template-parameter-inspection-cli.md` to `comfyui-generate`; expanded its Generation CLI reference with ordinary random Seed allocation, fixed/history Seed handling, per-image `batch_size: 1`, and retry Seed reuse.
- Replaced `comfyui-generate/SKILL.md` implementation details with precise read-time routes for Builder results, Catalog, template inspection, Seed allocation, request construction, submission, and context-compaction rereads.
- Updated all three Prompt Builder entry files to read their local output contract/schema/profiles after internal Prompt construction and before generation decisions, then validate the structured result.
- Legacy internal Prompt references still need `--prompt-format` and “internal Prompt, not final assistant result” wording updates.

## 2026-09-02 implementation review checkpoint

- Standards Reviewer确认每张图片分别分配显式整数、历史复用或默认随机 Seed，确认 Generation CLI 错误后的参考文档重读时机完整，并确认 Workspace 解析只用于需要执行身份的 CLI 分支。Standards 轴没有残留 P0、P1 或 P2。
- Spec Reviewer确认 ANIMA 内部 Prompt 校验结果只提供结构化生成结果的 `positive_prompt`，并确认随机 Seed 边界、无 Run 检查失败、新模板 ID 和检查到编译的回环测试均已覆盖。除真实 Desktop 验收外，Spec 轴没有残留实现问题。
- 独立语义 Reviewer确认 Prompt Builder 可以按各自历史参考读取或报告历史 Prompt 与 Actual Workflow，但不依据 Workflow 模板能力设计尺寸，也不解析、选择、校验、复用或输出 Seed 决定。语义门禁没有残留 P0、P1 或 P2。
- 四个目标 Skill 的 `quick_validate.py` 校验通过。最新聚焦复核为 7 个文件、270 项测试通过；全量单元测试为 39 个文件、807 项通过；全量集成测试为 4 个文件、38 项通过；合同与安全测试为 10 个文件、39 项通过；TypeScript typecheck 通过。
- 已创建 `model-acceptance.md` 的 40 配置台账。全部配置保持“待执行”，没有在 Desktop 端口被占用期间预填通过结论。
- 第一次完整质量预检发现 `pairInspectionParameters()` 的多候选错误消息回调未被测试，导致函数覆盖率为 99.9%。新增一个公开 `WorkflowCompiler.inspectRuntimeParameters()` 歧义用例，验证一个上游 width 同时匹配两个独立 height target 时返回包含竞争目标的 `GENERATION_PARAMETER_TARGET_AMBIGUOUS`。
- 修复后的 compiler 聚焦测试为 208 项通过，TypeScript typecheck 通过；覆盖率套件为 43 个文件、846 项通过，函数覆盖率恢复为 100%。最终 Desktop 验收结束后仍需重新运行完整 `pnpm quality`。

## 2026-09-02 Prompt Skill green checkpoint

- Updated the ANIMA and WAI internal Prompt-format references to call the preserved validator path with `--prompt-format`; their successful internal output now feeds structured result construction instead of ending the Skill.
- Updated Krea2 rules and README so the single natural-language paragraph is the internal `positive_prompt`, while the final assistant result is the validated ten-field object.
- The Prompt Builder reference contract, legacy weight validation, Krea2 validation, and Krea2 Skill contract suites now pass: 4 files, 100 tests.

## 2026-09-02 documentation and static Skill checkpoint

- Updated architecture, directory, and testing documentation for the shared Workflow compiler inspection plan, managed template inspection, ordinary random Seed route, and Skill-owned prompt/size/negative references.
- Corrected the implementation authorization record for `$implement`, current rebased baseline, and the one-line `generation-worker.test.ts` fake-adapter update required by the new interface.
- Ran the local skill-creator `quick_validate.py` against ANIMA, WAI, Krea2, and `comfyui-generate`; all four Skill entry files passed.

## 2026-09-02 connected-size TDD checkpoint

- Added a failing public-interface test for independent upstream width and height value widgets connected to one downstream size consumer; the first inspection returned no size candidate.
- Changed candidate pairing to use shared downstream size-consumer identity while preserving the inspected writable parameter IDs.
- Added the ambiguity branch for one upstream pair feeding multiple downstream size consumers. The complete Workflow compiler suite now passes: 206 tests.

## 2026-09-02 full automated test checkpoint

- `pnpm test:unit`: 39 files, 805 tests passed.
- `pnpm test:integration`: 4 files, 37 tests passed.
- `pnpm test:contract`: 10 contract/security files, 39 tests passed.
- Full Desktop verification is temporarily queued because another active independent worktree owns the shared development bridge port; this task did not terminate or modify that process.

## 2026-09-02 semantic contract correction checkpoint

- 独立语义 Reviewer 指出三个 Builder 缺少同一请求混合测试与正式结果的分支、生成 Skill 的一对一消费表述不完整、两个 CLI 参考文档缺少部分运行合同，以及 Seed 重试规则错误地把可修正参数错误也限制为完整 JSON 不变。
- 三个 Builder 现在要求用户已经明确划分的混合请求分别产生独立 `test` 与 `final` 结果；未划分时要求用户先划分。生成 Skill 对每个逻辑结果消费一个 Builder 结果对象，不合并多个 Prompt 或生成目的。
- `template-parameter-inspection-cli.md` 现在完整规定 managed environment、成功与失败输出、正向 Prompt/Seed/`batch_size` 门禁、精确 `parameter_id`、模板 36 Selector 示例和尺寸适配边界。
- `generation-cli.md` 已按项目 CLI 参考规范重写为九个章节。所有显式、历史和默认随机 Seed 都在提交前按实时模板 Seed 合同校验；瞬时错误的原样重试保持完整请求不变，可修正参数错误允许修正其他输入但继续复用原 Seed。
- 新增 compiler 公共接口测试，覆盖多节点 `batch_size` 的精确后缀参数 ID、模板缺少 `batch_size` 和合同范围不接受整数 `1`。目标 4 个测试文件共 302 项测试通过。
- 本轮修订继续使用普通 `Math.random()`；没有加密随机源、加密性质要求或随机基础设施。
- 独立语义 Reviewer 完成修订后复核并确认 P0、P1、P2 均为零；Reviewer 逐项确认九章 CLI、混合 test/final、一对一消费、`batch_size: 1`、Seed 实时合同、重试语义、模板 36 示例和 Krea2 配置路径。
- 修订后 `pnpm typecheck`、39 个单元测试文件的 806 项测试、4 个集成测试文件的 37 项测试以及 10 个合同/安全测试文件的 39 项测试全部通过。

## 2026-09-03 final model-acceptance checkpoint

- Reused the original Seed and dimensions to regenerate the 10 first-round visual FAIL configurations. The final independent per-image review returned PASS 1, CONDITIONAL 9, FAIL 0 for those replacements; the 40 selected configurations now total PASS 6, CONDITIONAL 34, FAIL 0.
- Added same-Seed WAI native-negative and Krea2 positive-rewrite A/B evidence. The WAI target removed the baseline mechanical/gloved-hand appearance and age ambiguity; the Krea2 target changed the baseline side hand position into the requested low rounded arm position without a negative prompt.
- Verified a nonzero allowed preset adaptation through template 33: 832×1248 to 832×1216, ratio deviation 2.63% and area deviation 2.56%.
- Submitted 10 actual selector requests to template 36. The Workflow compiler applied every selector value, but ComfyUI rejected the identity-edit template because its saved default reference image did not exist. Template 21 inspection returned the same invalid default reference image. The final Krea2 image evidence therefore remains on compatible exact-width template 27; no template or reference image was modified.
- Stopped the supplemental development Desktop PID 30257 and confirmed `pnpm dev:status` returned `stopped`.

## 2026-09-03 final evidence and quality checkpoint

- Added 40 versioned, one-to-one evidence records to `model-acceptance.md`. Every record contains the complete submitted Prompt parameters, exact submit stdin and stdout, exact single-Run query, returned arguments, and the concrete Actual Workflow node value projection.
- Verified all 40 recorded Prompt, Seed, `batch_size`, and size values against each Run Repository `request_json` and Actual Workflow; ANIMA has 10 matching records, WAI has 18, and Krea2 has 12.
- Corrected the template adaptation record so TA01–TA03 belong to template 36 and TA04 belongs to template 33. Corrected the template 36 rejection record to include both the missing saved reference image and five active `SaveImage` nodes without `images` inputs.
- Ran a complete `pnpm quality` after those revisions. The result was 889 unit/integration tests, 39 contract/security tests, 139 production tests, 32 prototype tests, and 2 Desktop tests passed. Coverage was statements 93.22%, branches 86.06%, functions 100%, and lines 95.96%. Full and production dependency audits both reported critical 0, high 0, moderate 0, and low 0.
- The candidate subsequently completed all three independent fixed-point reviews and a frozen-tree `pnpm quality` plus `git diff --check`; only the Git commit remained after this checkpoint.

## 2026-09-03 independent final review checkpoint

- Standards Reviewer confirmed the implementation, worktree Skill boundary, ordinary `Math.random()` Seed route, test coverage, dependency boundary, current progress state, and 40 evidence records have no P0, P1, or P2 findings.
- Spec Reviewer cross-checked representative ANIMA, WAI, and Krea2 test/final `9:16` and `16:9` records against the Run Repository and Actual Workflow, and confirmed the complete implementation has no P0, P1, or P2 findings.
- Independent semantic Reviewer confirmed TA01–TA03 use template 36, TA04 uses template 33, the template 36 rejection contains both observed causes, and submit/return evidence is separated accurately from Actual Workflow projections. The semantic review has no P0, P1, or P2 findings.
- The frozen candidate tree passed the final `pnpm quality` and `git diff --check` with the same test, coverage, and dependency-audit results recorded above. Any later file change invalidates this gate and requires both commands to run again.
