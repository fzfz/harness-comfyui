# 动态工具注入调查进度

## 2026-08-28

### 阶段 1：建立隔离环境

- **状态：完成**
- 检查主工作树状态，确认存在用户已有修改。
- 读取 `stop-that-shit` 的只读审查规则与 `planning-with-files` 的调查记录规则。
- 读取 `docs/agents/worktree-development.md`。
- 创建 `/Volumes/4Tdisk/work/AI2/harness-comfyui-analyze-dynamic-tools`。
- 创建分支 `codex/analyze-dynamic-tool-injection`。

### 阶段 2：并行证据收集

- **状态：完成**
- 已派独立 Explorer 抓取文章并提炼核心结论。
- 独立 Explorer 已提交文章事实、核心结论、边界、短引和来源链接。
- 已读取系统架构与目录说明，并定位项目 Tool 的唯一注册入口。
- 已发现可能相关的渐进式披露研究文档和 Harness 策略所有权 ADR。
- 已确认仓库源码在 Host 激活时固定注册 5 个项目 Tool，仓库 profile 没有 Router 配置。
- 已确认渐进式 Tool 披露只存在于研究建议，尚未进入仓库源码。
- 已确认当前生产 DSH home 存在 `router-standard` 文件；下一项动作是只读核验其阶段 restriction、首请求过滤、meta-tool schema 查询和实际请求 tool surface。
- 已确认 Router Standard 首请求只注入 `phase_begin`，阶段 0–2 使用不同 allowlist，阶段 3 恢复全量 Tool。
- 已确认 Router 提供 `tools_catalog` 和 `tools_help`，但仍把当前阶段 Tool 作为原生完整 schema 注入模型请求。
- 下一项动作：读取本机 Harness `dsh-tools` 的 restriction 与 request assembly 实现，验证可见 Tool 变化确实进入模型请求。

### 阶段 3：对照分析

- **状态：完成**
- 已使用 `dsh-tools` 本机文档和实现确认 restriction 会改变 native request schemas。
- 已确认 Router own-layer shim 会按阶段动态注册部分 Tool。
- 已确认 `tools_help` 只输出顶层参数摘要，不返回完整递归 JSON schema，也不能代理执行被锁 Tool。
- 已形成默认 `standard`、可选 `router-standard`、meta-tool 形态、Skill/能力层分离和适用条件五项初步结论。
- 已创建 `report.md` 并交给独立 Reviewer 复核。
- Reviewer 确认核心结论成立，并要求分离项目 5 Tool、default standard 和 Router 三个层次；修正阶段累计开放、首请求作用域、生产路径映射和两处无证据措辞。
- 已按 Reviewer 的证据逐项修订报告和调查发现。
- Reviewer 二次复核确认全部问题关闭，报告通过最终语义验收。

### 阶段 4：独立复核与交付

- **状态：完成**
- 静态检查确认报告没有尾随空白。
- 静态查询确认项目 Tool 注册、Router restriction、首请求过滤、`tools_help` 顶层参数渲染和 own-layer 注册的引用均能命中。
- Git 状态确认独立 worktree 只有 `.planning/dynamic-tools-analysis/` 下 5 个未跟踪调查与设计文件；仓库源代码、测试和依赖没有修改。
- 没有启动 Harness Host，没有执行外部 Router 或 Grok Bot 重建源码，没有发送真实模型请求。

### 阶段 5：项目自有 Preset 设计

- **状态：完成**
- 用户纠正目标：不再把 default standard 或可选 Router 当作重点，改为设计项目自有 Preset。
- 已读取 `codebase-design`、Deepening 与 Design It Twice 规则，并使用 Module、Interface、Seam、Adapter、Depth、Leverage 和 Locality 组织设计。
- 已派三名独立 Explorer 分别设计最小 Interface、最大灵活性和常见调用者优先方案。
- 初步确认 4 个 Catalog Tool 包装现有 CLI；Generation Tool 还承担 Harness identity 与持久异步 Run 接受语义。
- 三个独立 Interface 方案均已完成；三个方案对 Catalog Tool 可移除、Generation identity 必须由 Host 绑定的事实判断一致。
- 已将用户要求确定为目标架构：项目自有 preset 的模型可见项目 Tool 数量为零；新增可信 CLI submission transport 是实现该架构的必要前置条件。
- 已确认 Bash Tool 的 managed shell environment contributor 能按当前 `ToolExecution` 注入 trusted `DSH_*` 值，且执行器会先清除继承的 `DSH_*`。
- 已确认 native Bash 与 Code Mode nested Bash 都能通过 `rootCallId` 回查根 `tool/call` 事件的 Turn；项目无需把身份字段暴露为 CLI 参数。
- 初步选择 native `bash + skill` 作为自有 Preset 的稳定模型 Interface；下一项动作是核对 preset composition 的准确 bundle 依赖和生产物化位置。
- 已确认当前 `comfyui-generate` Skill 直接依赖全部 5 个 Tool，且历史上存在 release-local 项目 Preset 与物化实现；设计必须同时覆盖 Skill CLI 迁移、Host 注册移除和 preset 发布生命周期。
- 已确认 production 与 worktree 共用 source runtime prepare 路径；项目 preset 与受管 Skill root 可以通过一处 lifecycle seam 同时物化到两个隔离 DSH home。
- 已确认 Host 现有 `webServer.register()` 与 Bash 现有 `DSH_WEB_URL` 可复用为 CLI transport；不需要第二个服务进程。
- 已确认 `tools/result` 可以精确撤销当次 shell capability；CLI identity 不需要暴露或长期缓存。
- 已选择 release/worktree-local `.agents/skills` 作为唯一 Skill root，并排除默认用户 Skill roots。
- 已确认 `skill` catalog 的变化通过追加 user-role context 实现，不改变 `skill` Tool definition；该机制与文章的 cache-friendly knowledge layer 一致。
- 已创建 `preset-design.md` 并交给独立 Reviewer 审核。
- 已补充受管 Skill 环境声明、saved settings 默认值覆盖和 `config/product-agent.json` 单一配置源要求。
- 独立 Reviewer 已完成第一轮设计审核，并要求补齐 durable acceptance、background shell 门禁、Preset 运行时信任边界、Capability 类型、命令级合同和确定的实现路径。
- 已把 Generation CLI 改为 Session-scoped `submission_key` 合同，并定义 Run 与 submission mapping 的单 transaction commit point、response-loss lookup 和 request conflict 行为。
- 已把 POSIX/Windows shell 的 background 能力关闭，并要求 shell environment contributor 对非法或 background arguments 拒绝签发 capability。
- 已定义封闭的 CLI command union、精确命令树、256 位 `CapabilityValue`、内部 `ToolExecutionToken` 和冲突重生规则。
- 已补齐 preset 的 native presentation row、source/runtime trust 说明、确定的物化模块、失败模式和 acceptance tests。
- 已消除 lifecycle config、CLI route 与 Tool presentation 的重复结构化来源：`config/product-agent.json` 只拥有产品路径，`src/cli/contract.ts` 只拥有 CLI 协议，canonical `agent.cordis.yml` 只拥有 presentation。
- 已补充精确的源码/测试 ownership map、CLI 错误码 union、1 MiB request/stdin 限制、43 字符 256 位 token 合同和 canonical request JSON 复用路径。
- 独立 Reviewer 第二轮提出 project system root、unknown submit outcome 与完整 Generation Request contract 三项；完整 profile-boot 证据证明 system root 项不成立，Reviewer 已撤回该项。
- 已把所有可能到达 Host 但没有有效成功 envelope 的 submit 统一改为同 key + 同 request lookup，并定义 found/retryable/lookup unknown 三条分支和一次自动 retry 上限。
- 已定义完整的 `CliGenerationRequest` 封闭类型、null/omitted 规范化、数组/字符串/JSON depth 约束，以及 `src/host/generation/cli-generation-request-adapter.ts` 唯一 Adapter。
- 独立 Reviewer 第三轮复核确认没有 Blocker、High 或 Medium 问题，Preset 设计通过最终语义与可实施性验收。
- 已采纳 Reviewer 唯一非阻断文字建议，把 `run_id` 要求精确限定为 `generation.submit` 成功结果。
- 静态文档与 Git 状态检查已完成；本阶段可以交付报告、Preset Interface 和实施顺序。
- 已完成最终交付准备；独立 worktree 保持只包含 5 个未跟踪调查与设计文件。

### 阶段 7：破坏性升级修正与效果验证方案

- **状态：完成**
- 用户拒绝没有效果测试的直切方案。
- 已确认原方案同时改变四个高风险面：默认 Preset、Tool roster、Skill 协议和 Generation acceptance。
- 已把零项目 Tool 从发布决定降级为待验证终态假设。
- 已确认第一轮 canary 必须只改变模型能力入口，不得同时改变 Generation preparation 时序。
- 已确认 CLI Bash result 不具备当前 Generation Tool `presentationMeta`，中列运行链接属于必须测量的已知差异。
- 已确认已安装的 `dsh-llm`、`dsh-token-meter` 与 Provider Adapter 会把逐模型调用的 uncached input、output、cache read、cache write 和 reasoning usage 写入 Assistant Message 与 Session Projection；Preset 对照实验可以直接读取该数据。
- 已创建 `rollout-plan.md`，把验证拆成 A=`standard + 5 Tool`、B=`项目 Preset + 5 Tool`、C=`项目 Preset + CLI` 三组，分别隔离 Preset 缩减与项目 Tool 替换两个变量。
- 已定义 deterministic gate、72 Session pilot、formal 样本量计算、真实 usage 指标、独立语义盲审、预登记晋级阈值、Client UX 门禁和回退演练。
- 已把 `preset-design.md` 标记为待验证终态，并把 direct migration 结论改为 NO-GO；canary 阶段保留生产默认、5 个 Tool 和现有 Skill。
- 已根据当前 `GenerationRuntime.acceptGeneration()` 的实际代码确认新 Run 插入后会等待 `preparePersistedRequest()`；已把第一轮 CLI canary 改为保持该外部时序，取消把 Coordinator 生命周期变化混入 Interface 实验。
- 已把 CLI canary Skill 移到隔离 source，把现有 Skill 标记为 legacy canonical source，并把 Host Plugin ownership 改为 canary 阶段保留 5 个 Tool 注册。
- 已删除 Preset 物化阶段自动修改生产 `settings.yaml` 的要求；canary materializer 只拥有实验 DSH home 下的两个 Preset 与两个 Skill root。
- 已把 inline Generation card 的缺失从“非目标”改为正式 Client UX 晋级门禁。
- 已重写终态验收清单与最终判断：direct migration 为 NO-GO，默认切换与旧 Interface 删除是两个分别授权的后续决定。
- 已纠正 A→B 的归因：A→B 测量完整项目 Preset 替换，只有 B→C 隔离 5 个项目能力的调用 Interface。
- 已明确 A、B、C 分别使用独立实验 DSH home 与 Host runtime；三个 Host 全局注册相同 5 个项目 Tool，每个 Session 在首请求前根据已选 Preset 建立不可变的 standing visibility。实验不调用生产 ComfyUI、不读取生产密钥、不修改生产 Run Repository。
- 已请求两名旧版 Reviewer 重新审核；旧版 PASS 已作废。
- Preset Reviewer 第一轮修订复核提出 2 个 High 和 1 个 Medium：同 key replay 绕过 preparation、C 缺少 Client link Adapter、production-equivalent 门禁不足。
- Report Reviewer 第一轮修订复核提出 usage 合同、盲审泄露、统计合同、worktree lifecycle、A snapshot、交互协议和 patch-release 回退等问题。
- 已定义统一 `resumePreparation()` 状态机、`pending/succeeded/failed` lookup 分支、并发 single-flight 与重启恢复，防止任何 replay 在 preparation 成功前返回 accepted success。
- 已定义 `CliGenerationSubmissionLinkProjection`、Host link resolver、durable mapping、历史重放、失败展示、ownership map 与 canary-only 实施授权。
- 已定义 rc.2 `assistant/message.data.usage` Adapter、冻结价格表、total input/cache-hit/cost 公式、可选 reasoning 处理与缺失 cache 的 NO-GO。
- 已定义 Newcombe matched-pairs method 10、Bonferroni family-wise alpha、pilot 8-cell simulation power、固定 seed 与费用上限停止条件。
- 已补充 label-blinded outcome package、独立技术 Reviewer、固定交互脚本、三 arm `pnpm worktree:*` 生命周期、A/B/C snapshot 矩阵和 patch release 回退。
- Preset Reviewer 第二轮修订复核已确认 Blocker 和 High 为零，并提出 follow-up submit 次数、单一 shell Call 多个 submission 与 Client Remote cache identity 三个 Medium。
- 已统一 follow-up 规则：首次 submit 后最多只允许一次 follow-up；`found:false + retryable:true` 与 `found:true + preparation:pending` 两条分支互斥，任何结果都不得触发第三次 submit。
- 已为 `generation_cli_submissions` 增加 `(workspace_id, session_id, accepted_call_id)` 唯一约束；同一 shell Call 的第二个新 submission 返回 `CLI_SUBMISSION_CALL_CONFLICT`，resolver 的异常多行分支返回 link-invalid 而不猜测 Run。
- 已把 Client Remote cache identity 固定为 `(sessionId, callId)`，并为 CLI link contract、Host resolver 和 React link Adapter 指定独立测试文件及完整分支。
- Preset Reviewer 第三轮复核确认上述三个 Medium 已全部关闭，未发现新 Blocker、High 或 Medium，设计与 rollout 合同 PASS。
- Report Reviewer 第二轮复核确认核心文章结论、NO-GO、A/B/C 归因、usage、盲审、worktree lifecycle 与 Client UX 已通过，并提出生产 settings default 优先级、单 Host legacy/C 共存与统计 observation/终止条件三个 High。
- 已定义版本化 default migration：`productionDefaultPresetMigration { version, fromPresetId, toPresetId }` 是唯一结构化 source；settings 等于 from 时只原子投影 default 键、等于 to 时幂等 no-op、是第三值时拒绝启动，health 同时验证 source target/settings/roster。
- 已取消 CLI-only 全局注册模式：单 Host 始终注册 5 个项目 Tool，每个新 Session 在首请求前由 Preset 建立不可变的 `ProjectToolVisibilityPolicy`，从而同时保留 legacy 与 C。
- 已把统计 observation 定义为唯一任务实例的 A/B/C paired triple；Pilot 改为 24 个不重复实例、72 Session，formal 使用不重复实例与完整 12-场景 block，样本量搜索被用户授权的 `maxN` 封闭，无可行 n 时确定返回 NO-GO。
- Report Reviewer 第三轮复核确认 Tool 共存架构与统计 observation/有限搜索主体已关闭，并指出 default migration 非幂等、A 的 Policy 来源与阶段 1 授权、Pilot/formal 预算边界三项剩余问题。
- 已把 default migration 改为三态幂等合同，并在唯一结构化 source 中固定 `version/fromPresetId/toPresetId`；production-equivalent fixture 必须覆盖连续两次正向与连续两次回退 restart。
- 已明确 A 不安装项目 Policy 且不修改 `standard`；B/C 才从各自 canonical Preset 取得 `legacy/cli` Policy，阶段 1 的显式实施授权清单已增加 `ProjectToolVisibilityPolicy`。
- 已分离 `Mpilot/BmaxPilot` 与 `Mformal/BmaxFormal`；`maxN` 只使用 formal 专属上限，用户批准的全实验上限必须覆盖 Pilot 与 formal 两部分最坏合计。
- Report Reviewer 第四轮复核确认幂等 migration、A/B/C Policy 边界与 Pilot/formal 预算已关闭，并指出默认切换前尚未定义终态 Preset 与终态 CLI Skill root 在生产 DSH home 的物化合同。
- 已增加完整 `agent-presets/harness-comfyui/skills/` canonical root、终态 Preset/Skill install path、三个 Preset 各自的受管 Skill 环境键和 `materializeSourceAgentTarget()` ownership。
- 已把正向顺序固定为“验证 source → staging → 原子物化终态 Preset/Skill → 验证 target → 三态 settings migration”；target 失败时 settings 保持 `standard`，回退 patch 保留 additive 目录和已有 C Run。
- Report Reviewer 第五轮复核确认终态生产物化缺口已关闭，未发现新 Blocker、High 或 Medium，报告、Preset 设计与 rollout 合同最终 PASS。
- 阶段 7 结束时只完成设计与独立复核；该历史状态已由阶段 8 的用户实现授权与真实模型测试要求取代。

### 阶段 8：实现 B 并与 A 运行真实模型对照

- 用户已授权在当前独立 worktree 实现 B，并要求 A 与 B 都执行真实模型调用。
- 实验 Provider 固定为 `opencode-go`，Model 固定为 `deepseek-v4-flash`，Workspace 固定为 `config/worktree-development.json` 的 `startupWorkspacePath`。
- 用户已指定 B 使用 Harness 全局 Skill roots；本阶段不物化隔离 Skill root。
- 本阶段只实现 B，不实现 C、项目 CLI、零项目 Tool Interface、默认切换、Tool 删除或 production canary。
- 已确认 B 可以通过自己的 Preset standing composition只注册 Bash/Pwsh、Skill、persona、instructions、native presentation 与 compaction，同时继承 Host 全局注册的 5 个项目 Tool。
- 已确认当前 worktree lifecycle 的 `prepareSourceRuntime()` 是 B 物化到独立 DSH home 的共享入口；production runtime 必须保持不调用 B materializer。
- 已按 TDD 增加 B canonical source、worktree-only materialization、DSH composition/Tool snapshot 门禁和真实 A/B 实验记录。
- 已新增 `config/product-agent.json`、B canonical Preset、worktree-only materializer 与 production CLI prepare seam；production prepare 未调用 canary materializer。
- 物化测试先取得缺失 Module 的真实红灯，随后新增 canonical source、重复替换、无效 source、无效配置、失败短路和真实仓库 source 测试。
- 实际 worktree Host 的 status 与 health 通过；roster 显示 `ComfyUI Tool 对照模式`，B Session 成功记录 durable `agent-preset/selected` 事件。
- 已使用 `opencode-go/deepseek-v4-flash` 完成 8 个真实 Session：3 个 A→B 配对任务和 1 个 B→A 反向实例查询重复。
- B 的实际请求 Tool snapshot 为 7 个 Tool、7,458 字节 serialized Tool JSON；A 为 30 个 Tool、30,022 字节。
- 输入合同完整的 3 个配对运行中，A/B 业务结果与必要 Tool 选择一致；B total input 下降 62.1%，Turn 总时长下降 63.0%。
- 缺少 generation-model id 的边界任务中，A 通过猜测 id 返回 3 个模型但违反调用约束；B 拒绝编造 id，但长 reasoning 使 output token 与时长没有改进。
- 已创建 `ab-experiment-report.md`，并把晋级结论固定为“B canary GO；production default NO-GO”。
- worktree Host 已通过 `pnpm worktree:stop` 停止，随后 status 返回 `stopped`。
- 最终完整 `pnpm quality` 已通过：416 项 unit/integration、24 项 contract/security、56 项 production、27 项 prototype；依赖审计四个严重度均为 0。
- Standards Reviewer 与 Spec/语义 Reviewer 已完成最终复核；两项复核均为 PASS，不存在剩余 Blocker、High 或 Medium finding。

## 验证结果

| 验证项 | 期望结果 | 实际结果 | 状态 |
|---|---|---|---|
| `git worktree add` | 创建独立 worktree 和独立分支 | worktree 创建成功，HEAD 为 `a968735` | 通过 |
| 关键静态查询 | 报告引用的代码路径和条件能够命中 | 项目注册、Router 与 dsh-tools 关键行全部命中 | 通过 |
| Markdown 空白检查 | 6 个调查与设计文件不存在尾随空白 | `rg` 没有找到尾随空白 | 通过 |
| 独立语义复核 | Reviewer 不存在剩余 Blocker、High 或 Medium 发现 | Preset Reviewer 与 Report Reviewer 的最终复核均 PASS | 通过 |
| 阶段 7 结束时的独立 worktree Git 状态 | 当时只有调查与设计文件发生变化 | 当时 6 个 `.planning/dynamic-tools-analysis/` 文件为未跟踪文件；该历史结果已由阶段 8 实现取代 | 历史通过 |
| 阶段 8 最终独立 worktree Git 状态 | 只包含 B 实现、测试、系统文档与调查产物，不包含运行依赖和 `.local/` 数据 | 当前状态包含计划内文件；`node_modules` 临时链接已删除，`.local/` 数据未进入 Git 状态 | 通过 |

## 错误日志

| 日期 | 错误 | 尝试 | 解决方式 |
|---|---|---:|---|
| 2026-08-28 | 初始技能路径不存在 | 1 | 使用 `rg --files` 找到实际缓存路径。 |
| 2026-08-28 | zsh 无法展开不存在的 `@deepseek-ai/dsh-model*` glob | 1 | 改用 `@deepseek-ai/dsh-tools` 的确定路径检索。 |
| 2026-08-28 | 双引号参数中的反引号触发两个不存在命令 | 1 | 后续 shell 搜索模式统一使用单引号。 |
| 2026-08-28 | 第一版计划扩展补丁没有匹配当前章节原句 | 1 | 读取当前文件后按实际章节逐段更新。 |
| 2026-08-28 | 项目 Preset 发现补丁没有匹配当前章节原句 | 1 | 读取文件尾部后按实际原句更新。 |
| 2026-08-28 | 独立 worktree 不含生产 `.local/production` 目录，初次 Harness 包检索失败 | 1 | 读取主 checkout 的生产 DSH profile 符号链接目标。 |
| 2026-08-28 | zsh 对不存在的 Harness config glob 执行路径展开，导致 preset-root 检索中止 | 1 | 后续使用 `find` 或对确定目录执行 `rg -uu`，不使用未验证 glob。 |
| 2026-08-28 | 第二次 Harness profile 检索仍包含不存在的 `*.yaml` glob | 2 | 已停止使用 shell glob，后续只传确定目录给 `rg -uu`。 |
| 2026-08-28 | 使用双引号包裹包含反引号的 `rg` 模式，zsh 报告 unmatched quote | 1 | 改为单引号包裹所有包含 Markdown 反引号的检索模式。 |
| 2026-08-28 | 冲突扫描再次把包含 Markdown 反引号的 pattern 放入双引号，zsh 尝试执行 pattern 片段 | 1 | 立即停止该命令并使用单引号重跑；未输出或修改敏感数据。 |
