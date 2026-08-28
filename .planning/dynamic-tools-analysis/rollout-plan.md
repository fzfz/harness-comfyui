# Harness ComfyUI Agent Preset 非破坏性验证与迁移计划

## 必须实现的目标

1. 计划执行者必须把“项目自有 Preset + Bash/Pwsh + Skill + 项目 CLI”视为待验证假设，不能把该假设直接发布为默认行为。
2. 计划执行者必须在保留生产默认 Preset、5 个项目 Tool 和现有 `.agents/skills/comfyui-generate/` 的前提下，增加隔离的实验 Preset、实验 Skill root 与 CLI transport。
3. 计划执行者必须分别测量以下两个变化，不能把两个变化合并成一次无法归因的对照：
   - 当前生产 `standard + 5 个项目 Tool` 到 `项目自有 Preset + 5 个项目 Tool`；
   - `项目自有 Preset + 5 个项目 Tool` 到 `项目自有 Preset + CLI、0 个项目 Tool`。
4. 计划执行者必须使用同一模型、同一模型配置、同一 Workspace 数据快照、同一任务语料和同一 fake ComfyUI transport 运行对照实验，并从 Harness Session 事件读取逐模型调用的 usage。
5. 独立语义审核队员必须通过不包含 Preset、Tool 或 CLI 机制的 label-blinded outcome package 验收任务完成结果。程序只能按结构化事件类型收集与投影 Session 事件、Run 记录、时延和 usage，不能代替审核队员判断 Prompt、模型、LoRA、参数和回答语义是否正确。
6. 计划执行者必须在预先登记的晋级门禁全部通过并取得用户显式授权后，才能修改生产默认 Preset。删除 5 个项目 Tool、删除旧 Skill 路径和修改正式 PRD 必须作为更晚的独立破坏性变更重新取得授权。

## 当前发布结论

当前结论是 **NO-GO：不得直接迁移**。

现有技术调查只能证明零项目 Tool 方案可以建立可信 CLI transport，不能证明模型效果、缓存收益、交互时延或中列运行链接不退化。`preset-design.md` 描述的是待验证终态 Interface，不构成实施、发布或删除旧 Interface 的授权。

## 三组实验 Interface

| 实验组 | Preset | 固定模型 Tool Interface | Skill | 目的 |
| --- | --- | --- | --- | --- |
| A：当前产品基线 | 实验 DSH home 复现当前生产默认 `standard` | `standard` 的实际 Tool composition + 5 个项目 Tool；阶段 0 必须保存实际 snapshot | 当前 `comfyui-generate` 的隔离副本 | 测量用户今天实际获得的产品效果，不调用生产 runtime |
| B：项目 Tool 对照 | `harness-comfyui-tool-canary` | Bash/Pwsh、Skill + 5 个项目 Tool | 当前 `comfyui-generate` 的隔离副本 | 测量从当前 `standard` 切换到完整项目自有 Preset 的整体影响 |
| C：CLI 候选 | `harness-comfyui-cli-canary` | Bash/Pwsh、Skill | CLI 版 `comfyui-generate` 的隔离副本 | 只测量 5 个项目 Tool 改为 CLI 的影响 |

B 与 C 必须使用相同 persona、agent instructions、compaction、`native` Tool presentation mode、四个项目 Skill 名称、Skill 语义、模型配置和任务输入。B 使用原 Generation Tool link contract，C 使用不改变模型 Tool schema 的 `CliGenerationSubmissionLinkProjection`；两条链路必须提供等价用户操作能力。B 与 C 的模型可见差异只能是 5 个项目能力的调用 Interface。

A 只在实验 DSH home 中复现当前产品行为；`standard` 不是目标 Preset，也不能代替 B。A 与 B 的差异用于判断完整项目自有 Preset 相对当前产品是否退化；该差异包括 standing persona、instructions、compaction 与通用 Tool composition，报告不得把 A→B 归因于单一 Tool 变化。B 与 C 除项目能力调用 Interface 外必须相同，因此 B→C 才用于判断 CLI 是否可以替代 5 个项目 Tool。

## 非破坏性隔离规则

### Preset 与 Tool 注册

计划执行者必须新增 `harness-comfyui-tool-canary` 和 `harness-comfyui-cli-canary`，并保持 production Configuration Profile 与当前 runtime `settings.yaml` 的默认 Preset 不变。

计划执行者必须保留 `registerProjectTools()`、5 个 Tool definition 和现有 Host Plugin 全局注册路径。A、B、C 的 Host runtime 都注册相同的 5 个项目 Tool。A 使用现有 `standard` 且不安装项目 Policy，直接继承当前全局 5 Tool 行为。B/C 的已选 Preset 在 Session 创建期间通过 `ProjectToolVisibilityPolicy` 建立一次性 standing composition：B 允许 5 个项目 Tool，C 排除 5 个项目 Tool。该 Policy 必须在第一次模型请求组装前完成，并且在 Session 建立后不可变。

实验执行者必须为 A、B、C 分别创建独立 DSH home 与独立 Host runtime，但不得通过删除全局 Tool 注册制造 C。B/C 的 `ProjectToolVisibilityPolicy` 结构化值只能来自各自已选 Preset canonical source；A 不安装该 Policy，不修改 `standard` canonical source。Policy 不能通过每轮、每阶段或每条消息更换。该合同允许同一生产 Host 同时为新建 legacy Session 与显式选择的 C Session 建立不同但各自固定的 Tool Interface，不会重组已建立 Session。

每个实验 Session 建立后，Tool name、description、JSON schema 和顺序必须保持不变。实验不得使用 Router stage、按轮次 `restrict()`、按消息注册或注销 Tool，也不得把 CLI 子命令动态投影为 Tool definition。

### Skill root

计划执行者必须保持 `.agents/skills/comfyui-generate/` 的文件和行为不变。实验 runtime 必须物化两个隔离 Skill root：

- B root 包含当前四个项目 Skill 的受管副本；
- C root 包含三个不变项目 Skill和一个 CLI 版 `comfyui-generate`。

两个 Preset 都必须使用 `includeDefaultRoots: false`。实验 materializer 只能执行确定性的文件复制与配置物化，不能通过程序合并或解释 Skill 的语义文本。

### Generation 语义

第一轮 C 实验必须保持当前已发布 Generation 接纳、准备、错误和返回时序。CLI transport 可以增加 `submission_key` 与 additive mapping 解决响应未知和重复提交，但不能同时把 preparation 改为另一种后台推进时序。

“Tool 改为 CLI”和“Generation durable acceptance 后立即返回”是两个独立产品变量。后者需要单独实验，不能进入本计划的 B/C 对照。

### Client 语义

C 的 Bash/Pwsh Tool Result 不会自动产生当前 `generate_with_comfyui` 的 `presentationMeta`。计划执行者必须把中列运行链接、右列 Run 可见性、状态刷新、失败展示和历史 Session 重放列为正式效果指标。默认迁移前，C 必须恢复与 A 相同的用户操作能力；不能把链接消失写成无关差异。

## 实施阶段与停止条件

### 阶段 0：冻结当前基线

计划执行者必须记录当前 release commit、Harness 包版本、模型与 Provider、模型配置、生产默认 Preset、5 个 Tool schema snapshot、四个项目 Skill 内容、Catalog 数据 revision 和测试用 ComfyUI contract。

任一基线对象不能稳定复现时，计划执行者必须停止实验，不能解释后续差异。

### 阶段 1：增加实验实现

计划执行者只能在独立 worktree 中增加以下能力：

- 两个 canary Preset；
- 两个隔离 Skill root 的物化逻辑；
- 版本化 CLI 与 loopback Host route；
- shell execution capability；
- Preset-scoped `ProjectToolVisibilityPolicy`；
- additive CLI submission mapping；
- canary-only `CliGenerationSubmissionLinkProjection`、Host link resolver 与中列 Run 定位 Adapter；
- 实验配置、`ExperimentUsageAdapter` 与事件采集器。

本阶段不得删除或修改旧 Tool definition，不得修改旧 Skill，不得修改生产默认 Preset，不得修改正式 PRD 以宣称 CLI 已经成为产品合同。

### 阶段 2：确定性门禁

计划执行者必须运行仓库 `pnpm quality`，并新增覆盖成功、拒绝、清理和错误分支的 unit、integration、contract 与 production tests。以下检查全部通过后才能发送真实模型请求：

- A 不安装 `ProjectToolVisibilityPolicy`，首轮、普通后续轮、Skill 调用后、Skill catalog 内容变化后和 compaction 后的 Tool schema snapshot 必须分别等于阶段 0 冻结的当前 `standard + 5 Tool` 对应 snapshot；A 的跨事件变化只作为当前产品基线事实记录，不能被事后改写为稳定；
- B 在一个 Session 内固定暴露自身通用 Tool 与 5 个项目 Tool；
- C 在一个 Session 内固定暴露 Bash/Pwsh 与 Skill，不暴露 5 个项目 Tool；
- B 与 C 在首轮、普通后续轮、Skill 调用后、Skill catalog 内容变化后和 compaction 后的 Tool name、description、schema 与顺序分别保持不变；
- B 与 C 的 persona、instructions、compaction、presentation 和 Skill catalog 除 `comfyui-generate` 的能力调用段外一致；
- CLI Catalog 输出与 4 个原 Tool 对相同数据快照的结构化业务结果等价；
- CLI Generation Request Adapter 与原 Tool 对相同输入产生等价的内部 `GenerationRequest`；
- CLI success、validation failure、timeout、cancellation、response unknown、lookup、retry、conflict 和并发提交均不会产生丢失 Run、重复 Run 或跨 Session Run；
- 既有 mapping 与并发竞争 submit 在 Run 为 `created` 时加入同一 preparation single-flight，preparation 失败时重放同一错误，prepared 或后续状态才返回 accepted success；
- lookup 的 `pending`、`succeeded` 与 `failed` preparation 分支分别执行同 key recovery、返回原 `run_id` 或重放原错误，任何分支都不创建第二个 Run；
- 一项 Generation Request 首次 submit 后最多执行一次 follow-up submit；`found:false + retryable` 与 `found:true + pending` 两个分支互斥，follow-up 结果未知或失败后不得执行第三次 submit；
- 同一 shell Call 使用第二个新 key 提交时返回 `CLI_SUBMISSION_CALL_CONFLICT` 并回滚第二个 Run；同 key replay 继续可用，Link resolver 对多行损坏状态返回 link-invalid error；
- C 保持当前 Generation 接纳与 preparation 时序；
- C 的 Host link resolver 只通过 `(workspace_id, session_id, accepted_call_id)` 恢复唯一 Run；Client 使用 `(sessionId, callId)` cache key、不解析 stdout，并在实时与历史 Conversation Snapshot 中提供与 B 等价的中列定位、右列聚焦和失败展示；
- additive schema 在选择 A 或 B 时不改变旧路径；
- 操作者选择 A 后能够完整恢复旧 Tool surface，且不需要数据库 down migration；
- production Configuration Profile 与 runtime `settings.yaml` 的默认 Preset没有变化。
- production-equivalent 临时 DSH home 调用 source runtime、status 与 health 后，canary materializer 均未被调用，两个 canary Preset 目录和两个 canary Skill root 均不存在，default/settings 保持原值；该测试不得读取或写入真实 production DSH home。
- `ExperimentUsageAdapter` 使用真实 rc.2 Session event fixture 读取 `assistant/message.data.usage`，保留 cache 字段缺失与数值 0 的差异，并按本文固定公式聚合 usage 与费用。

任一检查失败时，实验状态为 NO-GO。计划执行者必须修复失败并重新运行全部相关门禁，不能启动效果实验绕过失败。

### 阶段 2.5：独立 worktree Host 流程

计划执行者必须遵守 `docs/agents/worktree-development.md` 与 `docs/system/testing.md`，通过现有 worktree lifecycle 扩展的 arm 参数分别管理 A、B、C：

```sh
pnpm worktree:start -- --arm A
pnpm worktree:status -- --arm A
pnpm worktree:health -- --arm A
pnpm worktree:logs -- --arm A
pnpm worktree:stop -- --arm A
```

B 与 C 使用相同命令并替换 arm 名。每个 `worktree:start` 必须在独立前台终端保持运行；第二个终端必须确认对应 arm 的 `status` 为 `running` 且 `health` 为 `passed`。启动或实验失败时才能读取对应 `worktree:logs`。全部实验结束或中止后，计划执行者必须逐个执行 `worktree:stop` 并确认三个 arm 的 `status` 都是 `stopped`。

计划执行者不得使用 `pnpm prod:*` 验证未发布源码，不得读取或修改生产 DSH home、生产 Profile、生产 Run Repository或生产 checkout。`--arm` 扩展、三个 runtime root 和三个端口必须具有 unit、contract 与 production-isolation tests；每个 arm 的运行状态只能写入当前 linked worktree 的 `.local/worktree-development/` 子目录。

### 阶段 3：模型效果试验预登记

计划执行者必须在首次真实模型调用前冻结以下内容：

1. 任务语料、每项任务的结构化期望和审核 rubric；
2. A/B/C 运行顺序随机化规则；
3. 模型、Provider、temperature、reasoning 和 compaction 配置；
4. pilot 与 formal experiment 的样本量规则；
5. 本文“晋级门禁”中的指标、阈值与统计方法；
6. Pilot 专属 Provider 调用上限与最坏费用、formal 专属 Provider 调用上限与最坏费用、formal paired task triple 数量上限，以及用户对 Pilot 和 formal 两部分合计上限的显式授权。
7. 每项任务的交互脚本：初始消息、预期澄清、固定回复、允许的最大追加消息数和停止条件。
8. 每个独立任务实例的唯一 `task_instance_id`、所属的 12 个场景类别之一、pilot/formal 归属和 A/B/C 共用的结构化期望。Pilot 与 formal 不得重用同一任务实例。

实验语料必须来自 `docs/v0.1/PRDS/04-single-image-generation.md` 的现有产品行为，并至少覆盖：

- 单项模板生成；
- 显式生成模型与一个 LoRA；
- 多 LoRA、权重和 trigger words；
- 显式实例路由；
- 宽高、seed、CFG、steps、sampler、scheduler 与自定义 Workflow 参数；
- 多项图片要求及声明顺序；
- 多项请求预校验失败；
- 后续请求失败时保留已创建 `run_id`；
- 模型、LoRA 与模板底模不兼容；
- Catalog 无结果与 Source/实例不可用；
- submit 响应未知、lookup 与同 key retry；
- 后续对话轮次、Skill 调用后和 compaction 后继续生成。

### 阶段 4：pilot 与 formal experiment

Pilot 使用 12 个场景类别，每个类别预先编写 2 个不同且不重用的任务实例。每个任务实例在 A、B、C 各运行一次，因此 Pilot 共包含 24 个 paired task triple 与 72 个新 Session。这里的两个实例不是对同一任务重复抽样。Pilot 预登记必须定义每个 arm/task 的最多模型调用数 `Kpilot` 和最坏费用 `CmaxPilot`，并把 `Mpilot = 24 * 3 * Kpilot` 与 `BmaxPilot = 24 * 3 * CmaxPilot` 作为 Pilot 专属上限。任一 Pilot 上限超出用户授权时必须在调用前 NO-GO。Pilot 只验证任务可执行性、usage 完整性、rubric 一致性和方差估计；pilot 结果不能用于默认迁移结论。

计划执行者必须在 pilot 结束后、查看 formal 结果前冻结以下统计合同：

1. 统计观察单位 `paired_task_triple` 是一个唯一 `task_instance_id` 在 A、B、C 三个全新 Session 中各执行一次所得的三个配对二元值。A→B 的差异是 `success_B - success_A`，B→C 的差异是 `success_C - success_B`。不同 observation 使用不同任务实例与新 Session，不对同一 `task_instance_id` 进行重复运行；A/B/C 之间的相关性通过 8 个联合结果 cell 保留。Formal 使用包含 12 个场景类别的完整 block，每个 block 中每类只有一个新任务实例。
2. 两个比较都使用 5 个百分点的非劣效界值。为控制两个确认性比较的 family-wise one-sided alpha 0.05，每个比较使用 Bonferroni one-sided alpha 0.025；每个比较使用 Newcombe matched-pairs method 10 的 95% two-sided score interval 下界。下界不低于 `-0.05` 才通过。
3. Pilot 的 A/B/C 三元结果形成 8 个联合 cell。样本量计算对每个 cell 使用 Jeffreys `+0.5` smoothing，再使用预登记固定 seed 运行 100,000 次 multinomial simulation。Formal 的 n 是 `paired_task_triple` 数，必须是 12 的整数倍。
4. Formal 预登记必须为每个 arm/task 规定正整数最多模型调用数 `Kformal`、根据冻结 token 上限与价格表计算的正数最坏费用 `CmaxFormal`、用户批准的 formal 专属正整数总模型调用数 `Mformal`、用户批准的 formal 专属正数总费用 `BmaxFormal` 与已冻结 formal 任务实例数 `Ncorpus`。Pilot 不得消耗 `Mformal` 或 `BmaxFormal`，用户批准的全实验上限必须分别不小于 `Mpilot + Mformal` 和 `BmaxPilot + BmaxFormal`。任一值缺失或不满足该类型约束时直接 NO-GO。`maxN` 是不超过 `min(floor(Mformal / (3Kformal)), floor(BmaxFormal / (3CmaxFormal)), Ncorpus)` 的最大 12 的整数倍。`maxN < 60` 时直接 NO-GO。
5. 计划执行者只能按 `n = 60, 72, ... , maxN` 的有限序列查找使“两项下界同时不低于 -0.05”的联合 power 达到 80% 的最小 n。序列中不存在可行 n 时必须确定性返回 NO-GO。Pilot Session 不得并入 formal 样本。
6. 统计实现、固定 seed、Newcombe interval 实现和 simulation 次数必须在首次 formal 调用前写入结构化 preregistration artifact 并冻结。固定 fixture 必须分别覆盖强非劣、非劣界值附近、低于界值与 A/B/C 组内高相关四类联合结果；两次独立运行必须产生相同 n、interval、family-wise 判定和 GO/NO-GO 结果，并证明不可行分支在 `maxN` 处停止。
7. 任何候选 n 的最坏 Provider 调用费用超过用户预先批准的上限时，实验状态为 NO-GO；计划执行者不得减少已计算的所需样本量、放宽 margin 或降低 confidence threshold。

每项 formal `paired_task_triple` 必须以同一个唯一 `task_instance_id` 的 A、B、C 三个新 Session 组成，并随机化三个 arm 的运行顺序。A、B、C 必须运行在各自独立的实验 DSH home 与 Host runtime；三个 runtime 必须读取同一份只读 Catalog/Source fixture，并分别使用内容相同的临时 Run Repository 与 fake ComfyUI contract。实验不能调用生产 ComfyUI、读取生产密钥或修改生产 Run Repository。

`ExperimentUsageAdapter` 必须逐模型调用读取持久 `assistant/message.data.usage` 的 `@deepseek-ai/dsh-llm` `TokenUsage`，并保存以下规范化记录：

- `uncachedInputTokens = usage.inputTokens`；
- `outputTokens = usage.outputTokens`；
- `cacheReadTokens = usage.cacheReadTokens`，缺失时保存 `null`，不能改写为 0；
- `cacheWriteTokens = usage.cacheWriteTokens`，缺失时保存 `null`，不能改写为 0；
- `reasoningTokens = usage.reasoningTokens`，缺失时保存 `null`；该值是 `outputTokens` 的子集，不能再次加入总 token 或费用；
- 用户消息时间到第一个合法 `run_id` 的时延；
- 完成任务的模型轮数、Tool 调用数、CLI 调用数和错误重试数；
- Run 数量、顺序、Workspace、Session、Turn、最终状态和错误码。

每个模型调用的 `totalInputUsage` 固定为 `uncachedInputTokens + cacheReadTokens + cacheWriteTokens`。`cacheHitShare` 固定为 `cacheReadTokens / totalInputUsage`；分母为 0 时该调用的比例保存为 `null`。每个任务的 cache-hit 占比使用该任务全部模型调用的 token 总和计算，不能平均逐调用比例。

计划执行者必须在 preregistration artifact 中冻结当前 Provider/model 的每百万 token uncached input、cache read、cache write 与 output 单价、定价来源 URL 和查询日期。每项任务的 `providerCost` 固定为四类 token 数量分别乘对应单价后求和；`reasoningTokens` 已包含在 output 中，不能重复计费。Session event 不含价格时，采集器必须使用该冻结价格表，不能在 formal 结果出现后更新价格。

当 Provider 不返回 cache usage、冻结价格表缺少任一适用单价或任一实验组的 usage 数据不完整时，实验不能判断文章所述的 KV-cache 收益，晋级状态必须为 NO-GO。`reasoningTokens` 单独缺失不构成 NO-GO，但报告必须显示该 Provider 没有提供 reasoning breakdown。

实验协调者必须为独立语义审核队员生成 label-blinded outcome package。程序只能按结构化事件类型选择以下内容：原始用户自然语言消息、Assistant 的用户可见自然语言回答、规范化 `GenerationRequest`、Run status/error 与任务期望；package 不包含 preset ID、A/B/C 顺序、Tool name、Tool arguments、CLI 命令、token、时延或 Client 技术信息。程序不得改写自然语言语义。组别映射表由实验协调者单独保存，Reviewer 在提交评分前不可读取。

Assistant 的用户可见自然语言回答主动提到内部 Tool、CLI 或 Preset 名时，该样本记录为 blindness breach 和用户文案失败，并由第二名 Reviewer 复核；实验协调者不能通过改写文本隐藏泄露。语义 Reviewer 逐项验收模板、模型、LoRA、Prompt、显式参数、实例、多请求顺序、失败报告、`run_id` 和用户可理解性。调用机制、serialized Tool snapshot 与 Client UX 由另一组非盲技术 Reviewer 验收。两名语义 Reviewer 意见不一致时，该项按失败计入，除非两人基于原始证据形成同一修订结论。

任务交互必须使用 preregistered script。完整输入场景中，模型要求追加信息时，实验协调者只能发送该场景固定的 correction message，并计为一次纠正；预期澄清场景中，协调者发送固定 clarification response，不计为纠正。模型超过该场景允许的追加消息数时任务失败。A、B、C 必须使用相同初始消息、相同固定回复和相同停止规则；两名语义 Reviewer依据原始消息判断 correction 计数，程序只保存 Reviewer 的结构化评分。

### 阶段 5：结果报告与用户决定

计划执行者必须提交包含逐任务原始记录、聚合统计、两项 Newcombe interval、全部失败样本、blindness breach、Reviewer 验收表和回退演练结果的报告。报告必须分别给出 A→B 的完整 Preset 替换差异与 B→C 的能力 Interface 差异，不能只给出 C 的绝对数字或 Tool 数量。

用户没有显式批准结果报告前，计划执行者不得创建生产 canary、不得修改默认 Preset、不得删除旧 Tool 或修改旧 Skill。

### 阶段 6：可选生产 canary

只有用户基于阶段 5 报告显式授权后，计划执行者才能设计生产 canary。受管 runtime 必须先在生产 DSH home 中原子物化并验证获授权的 CLI canary Preset、它的隔离 Skill root 与对应受管环境键，但不修改 settings default。生产 canary 必须由用户对新 Session 显式选择，当前默认 Preset和旧 Tool路径继续保留。单一生产 Host 必须继续全局注册 5 个项目 Tool，并在新 Session 创建时根据显式选定 Preset 建立不可变的 `ProjectToolVisibilityPolicy`：legacy 显示 5 个项目 Tool，C 排除它们。该部署必须同时创建一个 legacy 新 Session 和一个 C 新 Session，保存两者首请求与后续请求的完整 Tool snapshot，并验证 C 能发现隔离 CLI `comfyui-generate`、中列链接、历史投影、Workspace/Session/Run 隔离以及已建立 Session 不被重组。生产 canary 的调用范围、持续时间、费用上限、停止条件和回退动作必须在执行前再次获得用户授权。

### 阶段 7：独立默认切换

默认切换必须作为独立 release。`config/product-agent.json.productionDefaultPresetMigration` 是该 release 拥有的唯一结构化 source；正向 release 必须精确声明 `{ version: 1, fromPresetId: "standard", toPresetId: "harness-comfyui" }`。受管 `prepareSourceRuntime()` 必须在 Host 启动前首先从当前 release canonical source 原子物化并验证终态 Preset、完整四-Skill root、CLI launcher 和受管 Skill 环境键。只有该步骤完全成功后，runtime 才能读取 migration 对象并执行三态幂等合同：当前 `settings.yaml.agent-presets.default` 等于 `fromPresetId` 时，以原子文件替换只把该键改为 `toPresetId`；当前值等于 `toPresetId` 时执行幂等 no-op；当前值缺失、等于第三个值、结构化 source 无效或任何写入失败时，部署必须失败并且 Host 不启动。终态物化失败时 settings 必须保持当前前驱值。Migration 除该键外不得改变任何 settings 值。

生产部署必须遵守 `docs/system/releasing.md`，从最终发布提交更新 production checkout，并执行 `pnpm prod:restart`、`pnpm prod:status` 与 `pnpm prod:health`。Health 必须同时验证终态 Preset 安装目录、完整四-Skill root、终态受管环境键、source `productionDefaultPresetMigration.toPresetId`、运行时 `settings.yaml.agent-presets.default` 和 roster `isDefault` 均对应当前 release 的 `harness-comfyui`，并且新 Session 能发现 CLI 版 `comfyui-generate`；任一不一致时必须失败，不得通过静默 fallback 隐藏失败。同一 release 的连续 `start` 或 `restart` 必须在 migration no-op 后正常启动并再次通过 health。该 release 必须继续发布 legacy Preset、5 个项目 Tool、旧 Skill 和 additive CLI 数据；只改变新 Session 的默认选择，不重组已建立 Session。

### 阶段 8：独立删除旧 Interface

删除 5 个项目 Tool、旧 Skill、legacy Preset、旧 Client Tool presentation 合同或旧测试属于新的破坏性变更。计划执行者必须基于默认切换后的实际数据重新编写计划，并取得用户显式授权。本计划不授权阶段 8。

## 晋级门禁

A→B 和 B→C 必须分别通过以下门禁；任一门禁失败都阻止最终 C 成为默认 Preset：

| 类别 | 预登记门禁 |
| --- | --- |
| 归属与幂等 | C 的跨 Workspace、跨 Session、丢失 Run、重复 Run和错误 request-to-run 映射必须全部为 0 |
| 任务成功率 | A→B 与 B→C 分别使用 Bonferroni one-sided alpha 0.025 对应的 Newcombe matched-pairs method 10 interval；下界均不得低于 -5 个百分点 |
| 用户纠正 | 候选组需要用户纠正的任务比例不得高于对照组 |
| 效率 | 候选组每个成功任务的 median provider 计费金额必须至少降低 5%，median 总输入 usage（uncached + cache read + cache write）必须至少降低 10% |
| Cache | 多轮任务的 cacheRead usage 必须完整；候选组 cache-hit 占比不得低于对照组，且 serialized Tool snapshot 必须跨轮次保持相同 |
| 时延 | 候选组“用户消息到第一个合法 `run_id`”的 p95 不得比对照组增加超过 10% |
| 调用复杂度 | 候选组的 median 模型轮数和错误重试数均不得高于对照组 |
| Client UX | 中列运行定位、右列 Run、状态刷新、失败展示和历史重放必须全部通过视觉验收 |
| 回退 | 选择旧默认后，新 Session 必须恢复旧 Tool surface、旧 Skill 和旧 Client 行为；additive 数据不得阻止旧代码读取既有 Run |

以上阈值只能在首次真实模型调用前由用户修改。实验开始后不得根据结果降低门禁。

## 回退设计

实验阶段的回退是停止创建 B/C Session；A、当前默认、旧 Tool 和旧 Skill 始终存在，不需要恢复代码。

默认切换 release 的回退必须通过新的 patch release 执行以下确定动作，不能手工编辑 production checkout 或 production `settings.yaml`：

1. 发布负责人把 `config/product-agent.json.productionDefaultPresetMigration` 替换为 `{ version: 2, fromPresetId: "harness-comfyui", toPresetId: "standard" }`；负责人执行 `pnpm quality`，提交并 push 新 patch version，等待 CI，完成文档独立复核并按 `docs/system/releasing.md` 创建新 tag 与 GitHub Release；
2. 生产部署负责人从该 patch release 的最终 Git commit 更新 production checkout。受管 `prepareSourceRuntime()` 必须执行相同三态幂等合同：当前 settings default 是 `harness-comfyui` 时原子恢复为 `standard`，已经是 `standard` 时 no-op，其他值或写入失败时停止部署且 Host 不启动。该操作必须保留其他生产专属配置与运行数据，随后执行 `pnpm prod:restart`、`pnpm prod:status` 与 `pnpm prod:health`；幂等的连续两次 restart 由 production-equivalent fixture 验证，不要求生产为测试额外重启。
3. 受管 health 必须确认 source `productionDefaultPresetMigration.toPresetId`、运行时 settings default 和 roster default 均是 `standard`、新 Session Tool snapshot 等于 A 基线、旧 Skill root 可发现；独立视觉审核者必须确认旧中列 Tool card、右列 Run 与历史 Session projection 正常；
4. additive `generation_cli_submissions` 数据、终态 Preset 安装目录与终态 Skill root 保留，旧路径忽略它们；回退不执行 down migration 也不删除 additive 目录；
5. 已经由 C 接纳的 Run 继续由相同 Run Repository 与 Coordinator 完成，回退不能删除或重建它们。

回退演练没有通过时，计划执行者不得修改生产默认 Preset。

## 验收清单

- [ ] `preset-design.md` 明确标记为待验证终态，不再把直接迁移写成当前发布决定。
- [ ] A→B 明确表示完整 Preset 替换，B→C 明确表示项目能力调用 Interface 替换；报告不对 A→B 作单因素归因。
- [ ] 生产默认 Preset、5 个项目 Tool 和旧 Skill 在实验期间保持不变。
- [ ] A 保存首轮、普通轮、Skill 调用后、Skill catalog 变化后和 compaction 后的实际 Tool snapshot；B 与 C 在相同事件矩阵中的固定 Tool snapshot 均不变化。
- [ ] 单一 Host 的全局注册始终保留 5 个项目 Tool；同时新建的 legacy 与 C Session 在首请求前建立各自不可变的 `ProjectToolVisibilityPolicy`，完整 snapshot、历史投影与 Run 隔离均通过。
- [ ] 确定性门禁覆盖成功、拒绝、清理、错误、取消、未知响应、并发、幂等和跨 Session 隔离。
- [ ] production-equivalent 临时 DSH home 的 source runtime、status 与 health 都不物化 canary Preset 或 Skill root，真实 production DSH home 没有被读取或修改。
- [ ] A、B、C 全部通过 `pnpm worktree:start/status/health/stop -- --arm <arm>` 管理，失败时才使用 logs；实验结束后三组 status 都是 `stopped`，没有使用 `pnpm prod:*`。
- [ ] Pilot 与 formal experiment 在真实模型调用前完成样本量、费用、指标和阈值预登记；Pilot 与 formal 分别使用专属调用/费用上限，两部分上限之和不超过用户授权的全实验上限。
- [ ] Pilot 的 24 个 observation 与 formal 的每个 observation 都有唯一 `task_instance_id`，每个 observation 只由 A/B/C 各一个新 Session 组成；formal 不重用 pilot 或其他 formal 任务实例。
- [ ] 样本量程序只在 `60..maxN` 的有限 12-任务 block 序列中查找；强非劣、界值附近、低于界值、A/B/C 高相关和无可行 n 的 fixture 都产生确定且必然终止的结果。
- [ ] 调用上限、费用上限与语料上限三个边界 fixture 均证明 `maxN` 不会把 Pilot 专属消耗重复分配给 formal，Pilot + formal 最坏合计不超过用户授权。
- [ ] `ExperimentUsageAdapter` 从 `assistant/message.data.usage` 提取 uncached input、output、cache read、cache write 与可选 reasoning；冻结价格表、总输入、cache-hit 和费用公式通过固定 fixture 测试，缺失 cache usage 时结果为 NO-GO。
- [ ] 独立语义审核队员只读取 label-blinded outcome package；技术 Reviewer 另行审核调用机制和 Client UX，程序没有替代语义判断。
- [ ] 报告分别提供 A→B 与 B→C 的 Newcombe interval、全部失败样本、blindness breach 和 family-wise 门禁结论。
- [ ] 中列运行链接与右列 Run 行为通过视觉验收。
- [ ] 回退演练证明新的 patch release 可以把 `productionDefaultPresetMigration` 的 target 改回 `standard`，旧 Tool、旧 Skill和既有 C Run 都能继续工作，production checkout 没有手工源码修改。
- [ ] 从只包含 `standard` 且 `settings.yaml.agent-presets.default: standard` 的 production-equivalent DSH home 开始；终态 Preset、完整四-Skill root 与受管环境键在 settings 切换前完成物化与验证，新 Session 为 C snapshot 并可发现 CLI `comfyui-generate`。Fixture 连续执行两次正向 prepare/restart，再连续执行两次回退 prepare/restart；四次均成功，正向只把 default 键投影为 `harness-comfyui`、回退只把该键恢复为 `standard`，第二次均为幂等 no-op；其他 settings 值不变，已建立 Session 不重组，回退保留终态 additive 目录与已有 C Run，未知第三值使部署失败。
- [ ] 终态 Preset、Skill root、CLI launcher 或受管环境绑定的任一物化/验证失败 fixture 都使 Host 不启动，且 settings default 仍是前驱 `standard`。
- [ ] 用户在阶段 5 之后显式批准，计划执行者才可以进入生产 canary 或默认切换。
- [ ] 删除旧 Interface 具有新的计划和新的用户显式授权。

## 非本次目标

- 本次计划不实现 Preset、CLI、Host route、Skill 或数据库变更。
- 本次计划不发送真实模型请求，不调用生产 ComfyUI，不修改生产 Run Repository。
- 本次计划不修改 production Configuration Profile、runtime `settings.yaml` 或默认 Preset。
- 本次计划不删除、隐藏或修改 5 个项目 Tool。
- 本次计划不修改现有 `.agents/skills/comfyui-generate/`。
- 本次计划不修改正式 PRD 以宣称 CLI 已成为产品合同。
- 本次计划不提交、推送、发布或部署。
- 本次计划不安装新依赖。

## 已获得的授权

- 用户已授权在独立 worktree 中抓取文章、分析当前 Tool 注入并设计项目自有 Agent Preset。
- 用户已明确要求项目设计自己的 Preset，而不是把 `router-standard` 或 `standard` 当作目标方案。
- 用户已明确拒绝没有效果测试的破坏性升级，因此当前授权只包含非破坏性验证计划和终态设计修订。
- 用户没有授权实现源码、发送真实 Provider 请求、创建生产 canary、修改生产默认 Preset、删除旧 Tool、修改旧 Skill、提交、推送、发布或部署。
