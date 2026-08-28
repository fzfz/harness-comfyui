# 动态工具注入对照分析计划

## 必须要实现的目标

- 独立队员必须抓取并阅读 `https://yage.ai/share/grok-bot-dynamic-tools-20260827.html`，并提炼文章关于动态工具、静态工具与上下文成本的核心结论。
- 计划执行者必须定位本仓库从工具发现、工具筛选、工具 schema 注入到模型请求发送的完整代码路径。
- 计划执行者必须逐项比较文章核心结论与本仓库实际实现，并用文件路径、行号和测试证据支持符合性判断。
- 计划执行者必须依据用户纠偏设计项目自有 Agent Preset；该 Preset 不继承 `standard` 的完整 Tool 面，并保持整个 Session 的序列化 Tool Interface 稳定。
- 计划执行者必须评估移除 5 个项目 Tool 后，Catalog CLI、Source CLI 与 Generation Run 生命周期能否无损承接现有行为。
- 计划执行者必须把零项目 Tool 方案定义为待验证假设，不得在效果测试、回退验证和用户明确批准前删除 5 个项目 Tool、修改默认 Preset 或改写现有 `comfyui-generate` Skill。

## 下一步

在当前独立 worktree 中以 TDD 实现 B=`harness-comfyui-tool-canary`，完成确定性门禁后，使用 `opencode-go/deepseek-v4-flash` 对 A 与 B 发起真实模型调用并提交对比结论。

## 当前阶段

阶段 8：B 实现与 A/B 真实模型对比已完成，正在执行独立复核与提交门禁。

## 阶段

### 阶段 1：建立隔离环境

- [x] 检查主工作树状态并保留用户现有修改。
- [x] 创建分支 `codex/analyze-dynamic-tool-injection` 和独立 worktree。
- [x] 读取只读审查和文件化计划规则。
- **状态：完成**

### 阶段 2：并行证据收集

- [x] 独立队员抓取文章并提交核心结论与来源证据。
- [x] 主线程定位本仓库 tool 注入代码、配置、文档和测试。
- **状态：完成**

### 阶段 3：对照分析

- [x] 按文章结论逐条评估仓库实现。
- [x] 区分符合、部分符合、不符合和无法从静态证据确认的结论。
- [x] 记录影响与具体改进方向，但不修改源码。
- **状态：完成**

### 阶段 4：独立复核与交付

- [x] 使用静态查询验证关键路径和报告引用。
- [x] 让独立 Reviewer 复核分析的事实和语义，并完成二次验收。
- [x] 准备向用户提交结论、证据和优先级建议。
- **状态：完成**

### 阶段 5：项目自有 Preset 设计

- [x] 核对 Catalog CLI、Source CLI 与 Generation Runtime 的现有 Interface。
- [x] 比较最小 Interface、最大灵活性和常见调用者优先三种 Preset 方案。
- [x] 明确移除 5 个项目 Tool 后必须新增的 CLI 或 transport seam。
- [x] 选择推荐方案并记录拒绝方案。
- **状态：完成**

### 阶段 6：设计复核与交付

- [x] 形成包含目标、验收、非目标和授权的设计文档。
- [x] 让独立 Reviewer 复核设计的事实、语义和可实施性。
- [x] 向用户提交推荐 Preset Interface 与实施顺序。
- **状态：完成**

### 阶段 7：破坏性升级修正与效果验证方案

- [x] 确认原方案同时改变默认 Preset、Tool Interface、Skill 协议和 Generation acceptance，属于破坏性升级。
- [x] 设计保持当前生产默认与 5 个 Tool 不变的 A/B/C 三组 Interface。
- [x] 定义 deterministic parity tests、预登记模型效果实验、晋级门禁和回退演练。
- [x] 修订终态设计，禁止未经效果数据与用户明确批准的默认切换或 Tool 删除。
- [x] 让独立 Reviewer 重新验收修订后的报告、Preset 终态设计与 rollout 计划。
- **状态：完成**

### 阶段 8：实现 B 并与 A 运行真实模型对照

- [x] 以 `agent-presets/harness-comfyui-tool-canary/` 作为 B 的 canonical source，完整声明项目自有 Agent-plane composition。
- [x] worktree runtime 只能把 B 物化到当前 worktree 的 DSH home；production runtime、production default、5 个项目 Tool 与现有 Skills 均保持不变。
- [x] B 使用 Harness 全局 Skill roots；A 与 B 使用相同的默认 Workspace、`opencode-go` Provider、`deepseek-v4-flash` Model 与项目 5 Tool。
- [x] 先通过 Preset 物化、roster、固定 Tool snapshot 和既有回归测试，再在 A/B 中发送配对真实模型请求。
- [x] 从 Session 持久事件采集实际 Tool calls、usage、模型输出与时延，分别报告结构门禁和模型效果。
- [x] 完成独立 Standards/Spec review，并提交当前分支的已验证修改；`pnpm quality` 已通过。
- **状态：完成**

## 验收清单

- [x] 文章结论具有原始页面证据或独立队员的可核对抓取记录。
- [x] 本仓库 tool 注入链路具有精确文件路径和行号。
- [x] 每项符合性判断同时包含文章标准、仓库事实和结论。
- [x] 报告明确指出高影响差距，不使用缺乏代码证据的推断代替事实。
- [x] 本次审查不修改仓库源代码、测试、依赖或生产状态。
- [x] 设计明确列出 B 与 C 各自固定的 Tool Interface，且任何 Session 内运行状态都不会改变该组的 `tools` 数组。
- [x] 设计逐一处置当前 5 个项目 Tool，不以“都是 CLI”替代事实核对。
- [x] 设计保持 Generation Run 的 Workspace、Session、Chat Turn、Run Repository 与 Client 投影语义。
- [x] 设计具有分支完整的测试与验收清单。
- [x] 第一阶段只增加 canary 能力，不删除、重命名或改变当前生产 Interface。
- [x] 当前效果报告必须比较 A→B；B→C 不属于本次实施范围。

## 非本次目标

- 本次任务不实现 C、项目 CLI 或零项目 Tool Interface。
- 本次任务不重构动态工具注入机制。
- 本次任务不安装文章中的项目、依赖、脚本或其他外部代码。
- 本次任务不发布版本、不部署生产环境、不推送分支。
- 本次任务不修改 Project Tool Registry。
- 本次任务不批准默认 Preset 切换、5 个 Tool 删除或生产 canary 部署。

## 已获得的授权

- 用户已授权创建独立 Git worktree。
- 用户已授权派独立队员抓取和分析指定文章。
- 用户已授权只读检查本仓库 tool 注入实现并与文章结论比较。
- 用户已授权设计一个符合文章核心原则的项目自有 Agent Preset。
- 用户已授权在当前独立 worktree 中实现 B 并执行 A/B 对照。
- 用户已明确授权通过 worktree 注入的 `.env` 使用 `opencode-go/deepseek-v4-flash` 发起真实模型调用。
- 用户已指定 A 与 B 使用默认 Workspace 和 Harness 全局 Skill 目录。

## 决策

| 决策 | 依据 |
|---|---|
| 早期只读审查决定已被实现授权取代 | 用户随后明确要求在当前 worktree 实现 B，并实际执行 A/B 对照。 |
| worktree 基于 `main` 提交 `a96873594189aea1714cd89d1592dbc3bc804796` | 主工作树包含大量用户现有修改，独立提交基线可以避免污染或误读这些修改。 |
| 早期不启动 Host 的决定已被真实模型测试要求取代 | 用户明确要求使用 worktree `.env` 的 `opencode-go/deepseek-v4-flash` 发起真实模型调用。 |
| 推荐项目自有 `harness-comfyui` Preset | 项目需要拥有自己的稳定 Interface；`standard` 与 `router-standard` 都包含项目不需要的 Tool 组成。 |
| POSIX 固定 `[bash, skill]`，Windows 固定 `[pwsh, skill]` | 4 个 Catalog 能力已有 CLI Adapter；Skill catalog 通过追加 context 更新，不改变 Tool definition。 |
| 把 5 个项目 Tool 改为 CLI 只作为 C 组假设 | 技术可替代性不能证明模型任务成功率、token/cache 成本、时延和 Client UX；C 必须先通过 B→C 对照门禁。 |
| Preset runtime 副本使用 `trust: user` | `dsh-agent-presets` schema 支持多个 roots，但当前 DSH profile boot 的最终 overlay 强制把 configured roots 替换为唯一 shipped system root；公开 Interface 不能追加项目 system root。 |
| Generation submit 使用 Session-scoped `submission_key` | CLI response、HTTP 状态或进程退出不能单独证明 transaction 是否 commit；同 key lookup 可以恢复唯一 Run。 |
| 零项目 Tool 只是待验证终态 | 当前没有模型效果、总 token、缓存、延迟、用户纠正或任务成功率对照数据；直接切换不具备发布依据。 |
| 首次实现必须 additive | 当前生产默认、5 个 Tool、现有 Skill 与 Run schema 行为必须保留；canary 失败时只需停止选择 canary。 |
| B 使用 Harness 全局 Skill roots | 用户明确指定使用全局目录下的 Skill；A/B 不复制隔离 Skill root。 |
| 真实模型调用是效果结论的必要证据 | 仅验证 Preset 装载与 Tool snapshot 不能回答模型任务效果、usage 和时延差异。 |

## 错误记录

| 错误 | 尝试 | 解决方式 |
|---|---:|---|
| 可用技能清单中的 `stop-that-shit` 路径比实际缓存路径少一层目录 | 1 | 使用 `rg --files` 定位本机实际 `SKILL.md`，然后完整读取该文件。 |
| 使用未安装的 `@deepseek-ai/dsh-model*` glob 触发 zsh `no matches found` | 1 | 停止宽泛 glob，改用已定位的 `@deepseek-ai/dsh-tools` 具体目录。 |
| 在双引号 shell 参数中使用 Markdown 反引号，zsh 尝试执行 `standard` 与 `router-standard` | 1 | 停止使用双引号模式，后续 `rg` pattern 使用单引号，反引号只作为普通字符匹配。 |
| 第一版计划扩展补丁引用了不存在的章节原句 | 1 | 读取当前计划文件后，按实际章节逐段应用补丁。 |
