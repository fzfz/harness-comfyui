# Tool 注入与 Grok Bot 动态工具文章的对照分析

## 结论

对项目架构而言，`standard` 与 `router-standard` 都不是目标 Interface；项目应当拥有自己的固定 Preset。**但是，把模型可见能力直接切换为 POSIX `[bash, skill]`、Windows `[pwsh, skill]`，并同时把项目 Tool 数量改为 0，属于没有效果数据支持的破坏性升级。当前发布结论是 NO-GO。**

当前 5 个项目 Tool 在 Host 启动时固定注册，因而没有违反文章的“序列化 Tool 表面稳定”原则。“其中 4 个已有 CLI Adapter”只证明 CLI 替代在技术上可行，不能证明模型效果、token/cache 成本、时延与 Client 操作不会退化。

正确的下一步是非破坏性三组实验：

1. A 在实验 DSH home 中复现当前 `standard + 5 个项目 Tool`，记录当前产品基线，不调用生产 runtime。
2. B 使用 `项目自有 Preset + 5 个项目 Tool`，测量完整项目 Preset 相对当前产品的整体影响；报告不能把 A→B 归因于单一 Tool 变化。
3. C 使用 `项目自有 Preset + CLI、0 个项目 Tool`，只测量把 5 个项目 Tool 替换为 CLI 的影响。

实验期间必须保留生产默认 Preset、5 个项目 Tool 和现有 `comfyui-generate` Skill。Harness 已经在 Assistant Message 与 Session Projection 中提供 uncached input、output、cache read、cache write 与 reasoning usage；实验必须结合真实 usage、任务成功率、用户纠正、到 `run_id` 的时延、Client UX 和回退演练判断结果。没有完整 cache usage 或任一预登记门禁失败时，C 不得成为默认 Preset。

完整非破坏性迁移计划见 [`rollout-plan.md`](./rollout-plan.md)；[`preset-design.md`](./preset-design.md) 只描述待验证终态 Interface，不构成删除旧 Interface 或修改默认值的授权。

对现状的辅助判断仍分成三个层次：

1. **项目自有 5 个 Tool 的注册逻辑符合文章的稳定工具面原则。** 项目 Host 在启动时固定注册这 5 个 Tool，当前仓库没有逐轮替换项目 Tool definition。
2. **生产默认选择的 `standard` 只获得了部分符合证据。** 内置 `standard` 明确要求 plan/default mode 切换时保持 Tool catalog 不变，以维持 request-cache stability；本次调查没有采集同一 `standard` Session 在首轮、普通后续轮、Skill 调用和 compaction 前后的实际 `assembled.tools`，因此不能声称 `standard` 的完整请求面在整个 Session 中恒定。
3. **生产 DSH home 中可选的 `router-standard` 在成功启用阶段 restriction 时不符合文章最核心的 KV-cache 结论。** 对没有父 Session 且历史中尚无 `tool/call` 的顶层 Session，Router 首次请求只发送 `phase_begin`；随后 Router 累计开放截至当前阶段的原生 Tool schema，最后恢复全量 schema。Router 还按阶段改变 system prompt。该设计降低早期请求的可见 Tool 数量，但会改变请求前缀，属于文章反对的“把动态性放在序列化 tool surface”方案。

`router-standard` 的 `tools_catalog` 和 `tools_help` 只在交互形态上接近 Grok Bot：模型可以先看目录，再查看某个 Tool 的参数说明。它不是 Grok Bot 的等价实现，因为 `tools_help` 没有返回完整递归 JSON schema，Router 也没有提供固定的代理执行 Tool；模型仍需等待原生 Tool definition 在后续阶段出现。

## 分析范围

- 仓库基线：`a96873594189aea1714cd89d1592dbc3bc804796`。
- 仓库实现：项目 Tool 注册、Tool schema、Agent profile、Skill 与相关测试。
- 本机生产现态：生产 DSH home 中已存在但非默认的 `router-standard` Agent Preset。
- 文章来源：[中文原页](https://yage.ai/share/grok-bot-dynamic-tools-20260827.html)、[英文页](https://yage.ai/share/grok-bot-dynamic-tools-en-20260827.html)。

文章页面声明文章内容由 AI 生成。文章中的 Grok Bot 实现事实来自公开重建源码，不是 Cursor 或 Anysphere 的官方声明。本次调查没有执行或独立审计该外部重建项目。

### 本机证据路径映射

- 生产 DSH home：`/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home`
- 生产 Router：`/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/.agent-presets/router-standard/router-bootstrap.mjs`
- 生产设置：`/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/settings.yaml`
- 生产 profile 解析的 `@deepseek-ai/dsh-tools`：`0.1.1-rc.2`，真实目录是 `/Volumes/4Tdisk/work/AI2/harness-comfyui/node_modules/.pnpm/@deepseek-ai+dsh-tools@0.1.1-rc.2_02674693468f14f2558014317c058391/node_modules/@deepseek-ai/dsh-tools`
- 生产 profile 解析的 `@deepseek-ai/dsh`：`0.1.1-rc.2`，真实目录是 `/Volumes/4Tdisk/work/AI2/harness-comfyui/node_modules/.pnpm/@deepseek-ai+dsh@0.1.1-rc.2_ec79d843ef0e41603ba0488340ff4604/node_modules/@deepseek-ai/dsh`

## 文章的核心结论

文章的中心判断不是“每轮给模型更少的 Tool 就一定更好”，而是：

- 序列化 `tools` 表面必须保持稳定。
- 主要收益来自 KV-cache 前缀稳定性，而不是单纯降低 Tool 选择干扰。
- Grok Bot 把动态 Tool 压缩为稳定的短 hint，并使用稳定的 `GetMcpTools` 拉取完整 schema、使用稳定的 `CallMcpTool` 代理执行。
- Manus 采用相反的解码层 mask，但同样不删除请求中的 schema；两种方案共同保持序列化 Tool 表面稳定。
- Skill、Markdown 和检索属于知识层；Tool schema 属于能力层。两层可以组合，但不能互相替代。
- 动态 schema 机制只在“Tool 面大、每轮使用稀疏、模型选择能力有限”同时成立时值得增加一次查询往返。

文章可核对的短句是 “the serialized tool surface must remain stable” 和 “Skills and dynamic tools are orthogonal”。

## 本系统的实际 Tool 注入链路

```text
项目 Host 启动
  → src/host/plugin.ts 固定创建 5 个项目 Tool
  → registerProjectTools() 调用 ctx.tools.register()
  → dsh-tools 根据当前 Agent scope 生成 visible Tool Map
  → native wireSchemas() 把 visible Tool 全部投影为模型 function definitions
  → 模型请求

项目自有 Tool：固定注册 5 个 definition

默认 standard：plan/default mode 声明保持 catalog；完整 Session 稳定性尚未采样

可选 router-standard：
  新顶层且尚无 tool/call 的请求 assembled.tools → 仅 phase_begin
  → phase_begin 在成功路径安装阶段 0 restriction
  → phase_advance 累计开放截至当前阶段的 Tool，并更换 own-layer Tool
  → 阶段 3 释放 restriction，恢复全量 Tool
```

### 项目自有 Tool 注册

- `src/host/plugin.ts:99-105` 固定注册 `query_semantic_comfyui_templates`、`query_semantic_loras`、`query_semantic_generation_models`、`query_semantic_comfyui_instances` 和 `generate_with_comfyui`。
- `src/host/tools/register-project-tools.ts:63-91` 验证全部 definition 后按稳定顺序注册；该模块没有 Session、消息、阶段或相关性筛选输入。
- `tests/integration/host-plugin.test.ts:55-68` 断言上述 5 个 Tool 的完整固定注册顺序。
- `tests/unit/register-project-tools.test.ts:93-103` 断言注册入口保持调用方提供的稳定顺序。

### Harness schema 发送机制

- 本机 `@deepseek-ai/dsh-tools` 为 `0.1.1-rc.2`。
- `dsh-tools/lib/index.js:2591-2599` 把 `wireSchemas()` 注册为 system prompt assembly 的 Tool 来源。
- `dsh-tools/lib/index.js:2713-2719` 在 native 模式把当前 `view.visible` 中的全部 definition 转换成 wire schema。
- `dsh-tools/lib/index.js:2843-2868` 先应用 Agent restriction，再合并 Agent own-layer Tool，生成 `visible` Map。
- `dsh-tools/lib/index.js:2907-2909` 从当前可见 definition 生成模型可见 schema。

因此，`ctx.tools.restrict()` 与 own-layer 动态注册都会改变下一次请求的 `tools` 内容。这不是单纯的执行权限变化。

### 默认 `standard`

- 当前生产 `settings.yaml:13-14` 的默认 Agent Preset 是 `standard`。
- 内置 `standard/agent.cordis.yml:1-9` 把 standard 定义为完整 coding agent。
- 内置 `standard/agent.cordis.yml:118` 明确规定 plan/default mode 之间保持 Tool catalog 不变，以维持 request-cache stability。
- 仓库 `profiles/comfyui-workbench/package.json:5-12` 只组合 `dsh-base`、`dsh-web-app` 与 `harness-comfyui`；仓库 profile 没有 Router bundle 或动态 Tool 配置。
- 上述证据不包含 `standard` 完整 Session 的实际 request snapshots；本报告只判断 plan/default mode 的声明和项目 5 个 Tool 的固定注册，不扩展成全部 Tool 在所有请求中恒定。

### 可选 `router-standard`

- `router-bootstrap.mjs:83-113` 定义四阶段 Tool 集合；`windowFor(stage)` 返回 `stage + 1`。
- `router-bootstrap.mjs:565-584` 在成功路径使用 `STAGES.slice(0, windowFor(stage))`，因此阶段 0–2 累计开放从阶段 0 到当前阶段的 Tool；阶段 3 释放 restriction。restriction 服务不存在、allow 为空或调用抛错时，该函数不会完成阶段过滤。
- `router-bootstrap.mjs:621-642` 只对没有 `parentSession` 且历史中尚无任何 `tool/call` 的顶层 Session 请求，把 `assembled.tools` 过滤成只剩 `phase_begin`；子 Session 和已有 Tool Call 的恢复 Session 不走该分支。
- `router-bootstrap.mjs:656-659` 把随阶段变化的 `router-stage` 文本放入 system prompt。
- `router-bootstrap.mjs:718-784` 在 `phase_begin` 后安装阶段 0 restriction。
- `router-bootstrap.mjs:786-820` 在每次 `phase_advance` 后更换 restriction。
- `router-bootstrap.mjs:927-950` 动态注册 agent own-layer meta Tool。
- `router-bootstrap.mjs:1178-1205` 按阶段把 development/verification Tool definition 克隆到 agent own layer。

## 逐项符合性矩阵

| 文章判断 | 项目自有 5 个 Tool | 生产默认 `standard` 的完整 Tool 面 | 可选 `router-standard` | 结论 |
|---|---|---|---|---|
| 序列化 Tool 表面必须稳定 | Host 启动时固定注册，仓库没有逐轮筛选 | plan/default mode 声明保持 catalog；其他 Session 事件尚未采样 | 新顶层 Session、阶段 0、阶段 1、阶段 2、阶段 3 的 definition 集合不同 | 项目 Tool 符合；standard 部分证据；Router 不符合 |
| 动态 schema 应追加到对话尾部，避免改变前缀 | 没有动态 schema；项目 definition 常驻 | 未发现 standard 的动态 schema 协议 | `tools_help` 结果进入对话，但阶段原生 schema 仍会变化 | Router 仅部分符合 |
| 使用稳定的目录 Tool 和代理执行 Tool | 没有目录代理层；项目 Tool 直接调用 | 没有本次任务已验证的目录代理层 | 有 `tools_catalog`/`tools_help`，没有稳定代理执行 Tool | Router 不等价 |
| Grok Bot 按需返回完整 schema | 项目原生 definition 包含完整 JSON schema | 当前可见 Tool 由 Harness 原生 schema 投影 | `tools_help` 只输出顶层参数 type/required/description，不递归输出完整 schema | Router 不符合 Grok 机制 |
| Skill 知识层与 Tool 能力层正交 | `docs/adr/0006:5-9` 规定 Harness 管理 Skill；Host 独立注册项目 Tool | `standard/agent.cordis.yml:76-87` 分开组合 Skill registry/provider 与 `tool-skill` | Router 额外控制能力可见性，但没有替代 Skill 内容 | 三层均没有把 Skill 当作 Tool schema 替代品 |
| 动态机制需要实测证明适用条件 | 只有 5 个项目 Tool，不足以代表整个 Agent Tool 面 | 完整 Tool 面的规模、单轮调用分布和模型选择能力没有对照数据 | 没有 cache hit、token、完成率或额外 meta-tool 往返的对照数据 | 整体证据不足 |

## 高影响差距

### 1. Router 优化了单轮 schema 数量，却牺牲了跨轮前缀稳定性

Router 的阶段限制可以降低某一轮发送的 Tool 数量，但每次阶段切换都会改变 native function definitions。文章认为 `tools` 位于上下文前部，修改该数组会使后续前缀缓存失效。Router 同时改变 `router-stage` system prompt，因此即使 Tool schema 变化较小，阶段切换也会继续改变请求前缀。

这意味着 Router 当前优化目标更接近“阶段化注意力和行为门控”，不是文章讨论的“保持 KV-cache 的动态 schema 加载”。两种目标不能用同一个“动态工具”标签判定为等价。

### 2. `tools_help` 没有形成完整的能力加载协议

`tools_help` 可以展示一个 Tool 的顶层参数摘要，但它没有返回可供模型严格构造嵌套参数的完整 JSON schema，也不能执行已查询 Tool。模型仍需推进阶段，直到目标 Tool 作为原生 definition 出现。

Grok Bot 的关键组合是“稳定的 schema 查询 Tool + 稳定的代理执行 Tool”。Router 只实现了前半部分的简化展示，并继续依赖动态原生注入。

### 3. 当前系统没有证明阶段 Router 的收益大于成本

仓库的 `docs/research/router-progressive-disclosure-profile.md:89-98` 已经把 `standard` 与 progressive 的完成率、turn 数、错误 Tool 调用数、到 `run_id` 的耗时和用户纠正次数列为待验证项目。当前代码和生产文件没有 provider cache 命中、cached/uncached input token 或额外 meta-tool 往返的对照结果。

已安装的 Harness 具备实验采集面：`@deepseek-ai/dsh-llm` 的 `TokenUsage` 把 uncached input、output、cache read、cache write 与 reasoning 分开；`@deepseek-ai/dsh-token-meter` 从 `assistant/message.data.usage` 建立 Session Projection；DeepSeek 与 OpenAI-compatible Adapter 会在 Provider 返回对应数据时映射 cache usage。因此缺口是“尚未运行 A/B/C 对照”，不是“必须先新造一套计量系统”。Provider 没有返回 cache usage 时，实验仍不能用 Tool 数量推断文章所述的缓存收益。

因此，不能依据“当前阶段 Tool 更少”推断总成本更低，也不能推断模型质量更高。

## 项目决策

### P0：禁止直接迁移

当前任务不得修改生产 default、删除 5 个项目 Tool、修改现有 `comfyui-generate` Skill 或修改正式 PRD。零项目 Tool 是待验证假设，不是发布决定。

### P1：先实现隔离的三组 canary

独立 worktree 实现必须同时保留 A=`standard + 5 Tool`、B=`项目 Preset + 5 Tool` 和 C=`项目 Preset + CLI`。A→B 衡量整个 Preset 替换，B→C 才隔离项目能力调用 Interface。Host 在三组中都保留 5 个项目 Tool 的全局注册；A 不安装项目 Policy，直接复现当前 `standard`，B/C 才在 Session 首请求前由各自 Preset 建立不可变的 standing visibility，B 显示 5 Tool，C 排除它们。现有 Skill 必须保持不变，C 必须使用隔离的 CLI canary Skill root。第一轮 C 必须保持当前 `acceptGeneration()` 等待 preparation 的外部时序。

项目 CLI 必须覆盖四个 Catalog 查询和 Generation Run 提交。Generation 提交必须通过 shell execution capability 从 Host 绑定 identity，并使用 Session-scoped `submission_key` 建立 Run 与 submission mapping。任何可能已经到达 Host、但没有返回有效成功 envelope 的 submit 都必须通过同 key + 同 request lookup 恢复唯一 `run_id`。

### P2：先通过确定性门禁，再运行模型效果实验

确定性验收必须记录 A，并比较 B 与 C 在首轮、普通后续轮、Skill 调用后、Skill catalog 内容变化后和 compaction 后的 serialized Tool snapshot；A 的变化作为基线事实，B/C 必须各自稳定。验收还必须证明 CLI 不产生重复、丢失或跨 Session Run。随后按照 `rollout-plan.md` 运行预登记 pilot 与 formal experiment；每个统计 observation 由唯一任务实例的 A/B/C 三个新 Session 组成，样本量搜索只能在用户授权的 `maxN` 内运行并在无可行 n 时返回 NO-GO。结果必须分别报告 A→B 与 B→C 的任务成功率、usage、cache、时延、纠正次数、调用次数和 Client UX。

### P3：把默认切换与旧 Interface 删除拆成两个后续决定

只有效果报告、回退演练和用户显式授权同时存在时，项目才能创建默认切换 release。该 release 必须继续保留旧 Tool、旧 Skill 与 legacy Preset；受管 runtime 必须先在生产 DSH home 中原子物化并验证终态 Preset、完整 CLI Skill root 与受管环境键，再通过三态幂等的版本化 `productionDefaultPresetMigration` 把 source target 投影到高优先级 `settings.yaml.agent-presets.default`。任一 target 物化失败时 settings 必须保持前驱值。反向 patch release 必须只恢复 default 键，保留 additive Preset/Skill 目录与已有 C Run，不手工修改生产文件。删除旧 Interface 属于新的破坏性变更，需要新的计划、实际运行数据和新的用户显式授权。

## 验收清单

- [x] 独立队员已抓取文章并区分文章事实、作者观点与推断。
- [x] 项目自有 Tool 的固定注册链路具有源码与测试证据。
- [x] Harness visible Tool 到 native wire schema 的链路具有本机依赖实现证据。
- [x] 项目自有 5 个 Tool、默认 `standard` 完整 Tool 面与可选 `router-standard` 已分层判断。
- [x] Router 的首请求过滤、阶段 restriction、own-layer 动态注册、system prompt 变化和阶段 3 全量恢复均具有精确行号。
- [x] 报告没有把 `tools_catalog`/`tools_help` 误判为 Grok Bot 完整 meta-tool 协议。
- [x] 报告没有依据缺失的 cache/token/质量数据声称性能收益。
- [x] 报告已经撤销“直接把项目 Tool 数量降为 0”的发布建议，并把该 Interface 降级为待验证终态。
- [x] 非破坏性计划已经分别定义 A→B 与 B→C，避免把 Preset 缩减与 Tool 替换混成一个变量。
- [x] 非破坏性计划已经定义真实 Harness usage、独立语义盲审、晋级门禁、Client UX 与回退演练。
- [x] 修订后的报告、Preset 设计与 rollout 计划已由两名独立 Reviewer 完成最终复核，没有剩余 Blocker、High 或 Medium。

## 非本次目标

- 本报告不修改 Tool 注册、Router、Skill 或 Agent profile。
- 本报告不启动生产或独立 worktree Harness Host。
- 本报告不执行 Grok Bot 重建源码或其他外部项目。
- 本报告不发送真实模型请求，不宣称 A/B/C 效果实验已经通过。
- 本报告不修改生产默认 Preset，不删除 5 个项目 Tool，不修改现有 Skill。
- 本报告不提交、推送、发布或部署任何变更。

## 已获得的授权

- 用户已授权创建独立 Git worktree。
- 用户已授权派独立队员抓取指定文章。
- 用户已授权只读检查本仓库和当前生产环境中的 Tool 注入实现。
- 用户已明确拒绝没有效果测试的破坏性升级；用户没有授权默认切换或旧 Interface 删除。
