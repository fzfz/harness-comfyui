# 动态工具注入调查发现

## 用户要求

- 用户要求创建独立 worktree。
- 用户要求派独立队员抓取指定文章。
- 用户要求分析本仓库 tool 注入是否符合文章核心结论。
- 用户纠正分析重点：项目需要自有 Agent Preset，不应以可选 `router-standard` 或默认 `standard` 作为目标方案。
- 用户判断当前 5 个项目 Tool 对应的能力可以通过 CLI 提供，因此这些 Tool 不应常驻模型 `tools` 数组。

## 当前事实

- 主工作树位于 `/Volumes/4Tdisk/work/AI2/harness-comfyui`，当前 `main` 指向提交 `a96873594189aea1714cd89d1592dbc3bc804796`。
- 主工作树存在大量用户已有的已删除文件和未跟踪目录；本次任务不触碰这些内容。
- 独立 worktree 位于 `/Volumes/4Tdisk/work/AI2/harness-comfyui-analyze-dynamic-tools`。
- 独立分支为 `codex/analyze-dynamic-tool-injection`。
- `docs/agents/worktree-development.md` 仅要求在独立 worktree 启动真实 Harness Host 时使用 `pnpm worktree:*`；本次静态审查不启动 Host。

## 文章发现

- 页面标题是《The Grok Bot Leak: Why Cursor Only Gives Models Full Definitions for a Subset of Tools》，作者为鸭哥，日期为 2026-08-27。页面声明文章内容由 AI 生成，因此文章中的源码转述与架构观点不能等同于 Cursor 或 Anysphere 官方声明。
- 文章核心结论 1：序列化 tool surface 必须稳定；动态性应移到 context 层、解码层或其他不会改变请求前缀的层。
- 文章核心结论 2：主要收益来自 KV-cache 经济学，不是单纯减少工具选择干扰。每轮改变请求前部的 `tools` 参数会破坏后续前缀缓存；把按需完整 schema 放到对话尾部可以保留前部缓存。
- 文章核心结论 3：Skill/Markdown/检索属于知识层，tool schema 属于能力层，两者正交。只有 bash 无法表达、需要远端 sandbox、内部状态/鉴权或专用结构化接口时才需要增加能力层 Tool。
- 文章核心结论 4：动态完整 schema 只适合“工具面大、每轮使用稀疏、模型选择能力有限”的组合；工具少时，额外的 schema 查询往返可能不值得。
- 文章转述的 Grok Bot 机制：30+ Tool 中有 9 个 dynamic Tool 和 18 个 static Tool；dynamic Tool 只在稳定表面暴露手写单行 hint，模型先调用 `GetMcpTools` 获取完整 schema，再调用 `CallMcpTool` 执行。
- 文章转述的实现细节：大于 12KB 的 schema 写入文件后只返回路径；稳定 tools 数组继续包含 READ、SHELL、WRITE、GLOB、GREP、`GetMcpTools` 和 `CallMcpTool`。
- 文章用 Manus 的 “Mask, Don’t Remove” 作为对照：schema 常驻，解码阶段用 logits mask 限制选择。两者机制不同，但都保持序列化 tools 表面稳定。
- 文章明确指出适用边界和证据缺口：当前页没有完整 token/KV-cache 实验表，精确数字留给续篇；Grok Bot 事实来自公开重建源码，不是官方确认。
- 独立队员提供的克制短引包括：“the serialized tool surface must remain stable”、“Skills and dynamic tools are orthogonal”、“Mask, Don’t Remove”。

## 仓库实现发现

- `docs/system/architecture.md` 把 `src/host/tools/` 定义为项目 Tool 的唯一注册入口。
- `src/host/catalog/` 提供 Catalog 查询 Tool；`src/host/generation/` 提供 Generation Tool。
- 初始全文搜索只在 `src/host/tools/register-project-tools.ts` 和 `tests/unit/register-project-tools.test.ts` 找到项目级 `tools` 注册形态；尚未发现本仓库直接构造模型请求的 `tools` 数组或 `tool_choice` 参数。
- `docs/adr/0006-harness-owns-skill-invocation-policy.md:5-9` 确认 Harness 核心拥有 Skill 发现与调用策略，项目不得实现第二套 Skill provider 或 invocation policy。
- `docs/system/directory-structure.md` 说明 `profiles/` 保存 Harness bundle composition 模板；当前 profile 检查结果见下文。
- `src/host/plugin.ts:99-105` 在 Host 激活时一次性创建并注册 5 个项目 Tool：4 个 Catalog Tool 和 `generate_with_comfyui`。注册调用没有当前消息、Session、阶段或相关性输入。
- `src/host/tools/register-project-tools.ts:63-91` 先验证全部 Tool definition，再按传入顺序调用 `ctx.tools.register(definition)`；该模块不筛选 Tool，也不根据每轮请求动态更换 Tool definition。
- `tests/integration/host-plugin.test.ts:55-68` 明确断言生产插件按固定顺序注册全部 5 个 Tool；`tests/unit/register-project-tools.test.ts:93-103` 断言稳定顺序。
- `src/host/catalog/catalog-tool.ts:14-17` 定义 4 个 Catalog Tool 名称；`src/host/generation/generation-tool.ts:14` 定义生成 Tool 名称。
- `src/host/catalog/catalog-tool.ts:38-42` 和各个 Tool factory 固化输入 JSON schema；`src/host/generation/generation-tool.ts:55-132` 固化生成 Tool 的名称、长描述、参数 schema、输出 schema 和执行函数。
- `profiles/comfyui-workbench/package.json:5-12` 与 development profile 都只组合 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`harness-comfyui`；仓库 profile 没有声明 Router bundle。
- `profiles/comfyui-workbench/cordis.patch.yml` 为空数组；仓库顶层 `cordis.patch.yml` 只配置 `harness-comfyui`、默认模型和模型供应商，没有 Router 配置。
- `docs/research/router-progressive-disclosure-profile.md:3-7` 给出 GO 建议：未来创建可选的 `comfyui-progressive` Agent Preset，并明确 NO-GO 引入整套外部 routing suite。该文档是调研建议，不是当前仓库生产实现。
- 同一研究文档的最小方案要求阶段 0–2 使用 `ctx.tools.restrict({ allow })` 缩小全局 Tool 面，阶段 3 解除 restriction；当前源码搜索没有找到 `ctx.tools.restrict`、`assembled.tools`、`phase_begin`、`tools_catalog` 或 `tools_help` 的实现。
- 仓库根目录的历史 `findings.md` 和 `task_plan.md` 记录过把外部 `router-standard` 复制到生产 DSH home 的操作；这不是 Git 管理的 profile 实现，需要只读检查当前生产运行目录才能判断现态。
- 当前生产 DSH home 确实存在 `.agent-presets/router-standard/`，其 `preset.yml` 声明 `Router Standard`，当前脚本版本标记为 `v1.20.0`。
- 当前生产 `settings.yaml:13-14` 把默认 Agent Preset 设为 `standard`，不是 `router-standard`。这是默认选择事实，不足以单独证明 `standard` 的完整 Tool 面在全部 Session 请求中恒定。
- 本机内置 `standard/agent.cordis.yml:1-9` 把 standard 定义为完整 coding agent；该文件没有 Router 的 `restrict()` 或 `assembled.tools` 改写。`standard/agent.cordis.yml:118` 还明确要求跨 plan/default mode 保持 Tool catalog 不变，以维持 request-cache stability。
- `router-bootstrap.mjs:83-113` 把 Tool 分为四个阶段，`windowFor(stage) = stage + 1`；`applyStageRestrict()` 使用 `STAGES.slice(0, windowFor(stage))`，因此阶段 0–2 累计开放截至当前阶段的 Tool，各阶段仍不是稳定的相同 Tool 集合。
- `router-bootstrap.mjs:565-584` 在成功路径先释放旧 restriction，再调用 `toolsSvc.restrict({ allow })` 安装新 allowlist；阶段 3 直接不安装 restriction，从而恢复全量 Tool。restriction 服务不存在、allow 为空或调用抛错时不会完成过滤。
- `router-bootstrap.mjs:621-642` 对没有父 Session 且历史中尚无任何 `tool/call` 的顶层 Session 请求，把 `assembled.tools` 过滤成只剩 `phase_begin`。子 Session 与已有 Tool Call 的恢复 Session 不走该分支。
- `router-bootstrap.mjs:718-784` 的 `phase_begin` 在第一次 Tool Call 后安装阶段 0 restriction，并切换为 native Tool presentation。
- `router-bootstrap.mjs:786-820` 的 `phase_advance` 每次递增阶段并重新安装对应 restriction，因此阶段切换会继续改变可见 Tool definitions。
- `router-bootstrap.mjs:823-868` 提供 `tools_catalog` 和 `tools_help`：前者返回工具名称、摘要、阶段标记和参数名；后者返回单个 Tool 的完整参数 schema 描述。这与文章的“目录 + 按需 schema”有表面相似性。
- 但是 `tools_help` 只是额外的对话 Tool result；Router 同时仍按阶段向模型请求原生注入当前阶段全部 Tool schema。它没有用稳定的 `GetMcpTools`/`CallMcpTool` 代理取代动态 Tool 的原生 definitions，也没有保持整个 Session 的 tools 数组不变。
- Router 在阶段 3 释放 restriction 并恢复全量 Tool，意味着最大的 Tool schema 前缀会在对话后期突然出现；这与文章强调的 KV-cache 前缀稳定性目标相冲突。
- `router-bootstrap.mjs:927-950` 通过 agent own-layer shim 动态重新注册 meta Tool；`router-bootstrap.mjs:1178-1205` 还会按当前阶段把 development/verification Tool definition 克隆到 agent own layer。该机制进一步证明 Router 的可见 schema 集合随阶段改变。
- Router 的 `tools_help` 不是 Grok `GetMcpTools` 的完整等价物：`router-bootstrap.mjs:991-998` 只把顶层参数的名称、type、required 和 description 渲染为文本，没有递归返回嵌套 properties、items、enum、const 或完整 JSON schema。
- Router 也没有 Grok `CallMcpTool` 的稳定代理执行面。模型读取被锁 Tool 的 `tools_help` 后仍不能执行该 Tool；Router 要求推进阶段，等原生 Tool definition 被注入或阶段 3 全量开放后才能直接调用。
- 本机 `@deepseek-ai/dsh-tools` 版本为 `0.1.1-rc.2`。其 README 第 16、21、22、31 行说明：native 模式贡献可见 Tool 的 function definitions，`restrict()` 改变 agent 可见性，registry 自动把 Tool schema 注入 system-prompt assembly。
- `@deepseek-ai/dsh-tools/lib/index.js:2591-2599` 把 `wireSchemas()` 注册为 system prompt 的 Tool 来源；`lib/index.js:2713-2719` 在 native 模式把 `view.visible` 中的每个定义投影为 wire schema。
- `@deepseek-ai/dsh-tools/lib/index.js:2843-2868` 对 restriction 过滤后的 inherited Tool 与 agent own-layer Tool 生成 `visible` Map；`lib/index.js:2907-2909` 从该 Map 返回模型可见 schema。因此 Router 的 restriction 和 own-layer shim 都会改变下一次模型请求的 schema 集合。

## 对照结论

- 项目自有 5 个 Tool：**符合文章的稳定工具面原则**。项目 Host 启动时固定注册 5 个 Tool，没有逐轮或逐阶段更换项目 definition。
- 生产默认 `standard` 的完整 Tool 面：**只有部分符合证据**。plan/default mode 的声明明确保持 catalog，但本次任务没有采集首轮、普通轮、Skill 调用和 compaction 前后的实际 `assembled.tools`。
- 可选 `router-standard` 的阶段化 Tool 注入：**在 restriction 成功路径不符合文章最核心的 KV-cache 结论**。它通过新顶层 Session 首请求过滤、累计阶段 restriction、own-layer 动态注册和阶段 3 全量释放主动改变序列化 tool surface，同时改变 `router-stage` system-prompt section。
- `tools_catalog`/`tools_help`：**只在“先看目录、再按需看详情”的交互形态上部分符合**。它没有稳定代理执行面，且 `tools_help` 返回的不是完整递归 schema，因此不是 Grok Bot 两个 meta-tool 架构的等价实现。
- Skill 与能力层分离：**基本符合**。仓库让 Harness 管理 Skill 发现/调用，项目 Host 独立注册 Catalog 与 Generation Tool；`generate_with_comfyui` 处理持久 Run、Workspace 身份、结构化参数和异步执行，属于文章认可的专用能力层场景。
- 动态机制的适用条件：**尚未证实**。仓库没有完整 Tool 数量、单轮调用分布、模型选择能力、cache hit、input token、完成率或额外 meta-tool 往返的对照数据；现有研究文档也把 `standard` 与 progressive 的真实 Session 对比列为待验收项。

## 项目自有 Preset 设计发现

- 用户要求的正确判断单位是“项目自有 Preset 的固定模型 Interface”，不是 `standard` 或外部 `router-standard` 的相似度。
- `src/host/catalog/catalog-cli.ts:71-111` 已经通过无 shell 的子进程 Adapter 调用 Catalog CLI；4 个 Catalog Tool 是现有 CLI Interface 上的 Tool Adapter。
- `src/host/generation/source-cli.ts` 是 Source CLI Adapter，用于读取模板、实例与 Generation Source 数据。
- 当前 `package.json` 没有项目 generation CLI 的 `bin` 声明；现有 `scripts/production/cli.mjs` 只提供 Host 生命周期命令。
- `src/host/generation/generation-tool.ts:29-52` 从 Harness ToolRunContext 推导 Workspace、Session、Chat Turn 与 Tool Call identity；`src/host/generation/generation-tool.ts:106-125` 把该 identity 与 Generation Request 交给 `GenerationRuntime.acceptGeneration()`。
- 因此，4 个 Catalog Tool 可以直接评估改为 Skill 调用现有 CLI；`generate_with_comfyui` 不能仅凭现有 Source CLI 无损删除，必须先证明或新增一个能建立 Generation Run identity、写入 Run Repository 并唤醒 coordinator 的 CLI 或 transport seam。
- 依赖分类：Catalog CLI 与 Source CLI 是 local-substitutable；目标 ComfyUI 实例是 remote-but-owned；Harness Session、Run Repository 与 Generation Coordinator 是 Host Plugin 的本机运行状态。
- `CatalogCli` 和 `GenerationSourceCli` 的请求参数不包含 Workspace、Session、Turn 或 Tool Call identity；它们是数据查询 Adapter，不是 Generation Run 提交入口。
- 当前 `GenerationSourceCli` 只支持 `instance` 与 `template-bundle` 两个读取 operation。当前仓库不存在调用 `GenerationRuntime.acceptGeneration()` 的 Generation CLI。
- Agent Preset 是 standing scope，且当前 preset authoring 是 copy-only composition，不支持在 `standard` 上做 patch。因此，项目必须拥有完整的 preset source，并由项目 profile/lifecycle 将该 source 物化到 DSH preset root。
- 三个独立 Interface 方案一致认为：4 个 Catalog Tool 可以移除；在当前代码不增加 transport 的条件下，最后一个生成入口必须保留 Tool，才能继续从 `ToolRunContext` 获得可信 identity。
- 用户要求的目标是零项目 Tool。该目标需要新增 Harness-owned CLI submission transport；CLI 只能提交业务请求，Host 必须继续拥有 identity 绑定、幂等、Run Repository、GenerationCoordinator 和 Client 投影。
- 生产 DSH profile 中的 `dsh-shell-env` 与 `dsh-tool-bash` 是指向仓库 `node_modules/.pnpm/` 的符号链接；后续 Harness Interface 证据必须读取符号链接目标，不能依赖独立 worktree 中不存在的 `.local/production` 目录。
- `dsh-shell-env` 的 `BashEnvContributor.resolve(execution)` 每次 Bash Tool 执行都会收到当前 `ToolExecution`；该对象包含 `callId`、`rootCallId`、`agent` 与不可由调用者选择的 opaque `token`。
- `dsh-shell-env` 当前内建的 identity 变量只有 `DSH_SESSION_ID`；它还可提供 `DSH_SESSION_JSONL`，但文档明确说明 JSONL 路径不是 authorization credential。当前内建环境没有 Turn 或 Call identity 变量。
- Shell executor 会丢弃继承的全部 `DSH_*`，再注入当次 `ctx.shellEnv.collect(exec)` 的 trusted snapshot；项目插件可以声明唯一的 `DSH_*` key，并按当次 Bash execution 生成值。该现成 Seam 足以承载不可由 CLI 参数伪造的、每次 Bash call 独立的 opaque submission capability。
- `dsh-tool-bash` 在执行子进程前调用 `ctx.shellEnv.collect(exec)`，所以 contributor 的运行时值不会改变 Agent Preset 的 Tool name、description 或 JSON schema；该动态值位于 Tool 执行期，不位于模型请求的 serialized tools 前缀。
- Agent Loop 会先写入根模型调用的 `tool/call` 事件；事件包含 `turn`、`step`、`callId` 与 Tool name。`ToolExecution.rootCallId` 对 native Bash 等于 Bash `callId`，对 Code Mode nested Bash 等于外层 `run_code` 的 `callId`。
- Code Mode 的 nested Bash 只追加 `tool/code-dispatch-start` 与 `tool/code-dispatch`，这两个事件不含 `turn`。CLI submission transport 可以用 `rootCallId` 找到唯一根 `tool/call` 事件取得 Turn，再用 `exec.callId` 作为该次 Bash submission 的幂等 Call identity。
- 因此，零项目 Tool 方案不需要让模型或 CLI 传入 Workspace、Session、Turn、Call identity。Shell environment contributor 可以保存 opaque token 到当次 `ToolExecution` 的内存映射；Host IPC endpoint 消费 token 时再验证 Session history、Workspace attachment 和 root call。
- native Preset 只固定暴露 Bash 与 Skill 两个通用 Tool 时，不需要 Code Mode 的 `run_code` 额外 transport 与 SDK section。对当前小型固定 Tool 面，native Interface 更直接，也符合文章关于“小 Tool 面不值得增加动态发现往返”的边界。
- 内置 `standard` 的 model-facing rows 明确包含 Bash、PowerShell、filesystem、filesystem search、jobs、skill、goal、planning、subagents、ask-user、todo 与 web；直接复制 `standard` 会保留用户不需要的 Tool Interface。
- 项目自有 preset 应完整声明所需 Agent-plane composition：persona、agent-instructions、平台对应 shell Tool、skill-filesystem、tool-skill，以及不增加模型 Tool 的 compaction group；它不应包含 filesystem、jobs、goal、planning、delegation、ask-user、todo 或 web Tool rows。
- 当前两个 DSH profile 的 `package.json` 仅声明 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 与 `harness-comfyui` bundles；当前仓库没有项目自有 preset source，也没有项目 preset root 配置。
- `dsh-web-app` 在 Host plane 禁用 base bundle 的 model-facing Tool rows，再由所选 Agent Preset 在 standing scope 注册自己的 Tool。因此，项目 preset 可以真正只注册 Bash 与 Skill，而不是从全局 Tool 面继承 standard 的其他 Tool。
- `dsh-agent-presets` 的 schema 接受多个 configured roots；但是当前 `@deepseek-ai/dsh` 的 `composeProfile()` 在 bundle/profile/home/CLI patch 合成后追加最终 overlay，把 `agent-presets.roots` 强制替换为唯一 DSH shipped system root。运行中的 roster 没有公开 root registration API。因此，当前版本不能仅靠项目 profile 的 `cordis.patch.yml` 增加第二个 project-owned system root。
- 项目应把 preset canonical source 放入仓库，并由 production/worktree lifecycle 将它物化到各自 `<DSH_HOME>/.agent-presets/<preset-id>`。物化方式需要明确 ownership，不能依赖人工复制 standard 后长期漂移。
- 内置 `minimal` 是固定 persona + persistent shell + str-replace editor，既不加载 Skill，也使用不同的 persistent shell Interface；它不是项目目标 preset 的合适基线。
- 当前 `.agents/skills/comfyui-generate/SKILL.md` 明确调用全部 5 个项目 Tool：前四个用于 resolve/实例目录，第五个创建 Generation Run。删除 Tool 注入必须同步把该 Skill 改为调用一个稳定的项目 CLI，不能只修改 Host 注册表。
- 当前 Skill 采用“所有 Generation Request 先完成 resolve 与 Prompt 重写，再逐项查询实例并提交”的事务边界。CLI 迁移后必须保留：resolve 失败不创建任何 Run；后续提交失败时返回已经创建的 `run_id`，且不重复提交成功项。
- Git 历史提交 `8ccd907` 曾包含项目自有 `harness-comfyui` preset。该 preset 只挂载 persona、release-local Skill filesystem、Skill Tool 与 `harness-comfyui/agent`；Agent plugin 通过空 allowlist restriction 后注册项目 Tool。当前 HEAD 已移除这些文件，说明仓库有可复用的发布/物化历史，但旧 Interface 仍以 Tool registry 为中心，不能直接恢复为本次方案。
- Git 历史提交 `ae60663` 曾让项目 preset 使用 `includeDefaultRoots: true`；本次设计需要明确 Skill root policy，而不能沿用某个历史版本的偶然选择。
- 当前 `prepareSourceRuntime()` 只物化 Client module 与 DSH profile；`materializeSourceProfile()` 只复制 profile 的三个文件并创建 `node_modules/harness-comfyui` 符号链接。production 与 worktree runtime 当前都没有物化项目 Agent Preset。
- 当前 source runtime 已分别提供 `dshHome` 与 `dshProfile`，worktree runtime 复用相同的 `prepareSourceRuntime()`。因此，一个共享的 `materializeSourceAgentPreset(repositoryRoot, dshHome)` 可以同时覆盖 production 与独立 worktree，不需要两套复制逻辑。
- 当前 Host start 的受管环境由 `buildHostEnvironment()` 与显式 startup workspace 组成；如果多个 Preset 的 Skill filesystem 使用不同 repository/release-local 目录，启动器必须同时提供各 Preset 自己的受管 Skill root 环境键，不能共用一个 root 或依赖 ambient 环境。
- Host Plugin 已注入 `webServer` 并通过 `webServer.register()` 提供 Generation media HTTP route。项目 CLI transport 可以复用同一个 loopback Host server，不需要启动第二个后台进程或让 CLI 直接打开 Run Repository。
- `dsh-web-app` 已在每次受管 Bash call 中提供 `DSH_WEB_URL`；CLI 可以从该变量取得当前 Host endpoint。项目 shell-env contributor 只需额外提供 CLI executable path 与每次 Bash call 的 opaque capability。
- 推荐 CLI transport 的外部 Interface 是一个 `harness-comfyui` 命令树；Implementation 通过单一 Host route 调用现有 `CatalogCli`、`GenerationSourceCli` 与 `GenerationRuntime`。模型不接触 Catalog executable、port、Source executable、Run Repository path 或 Web port。
- `dsh-tools` 在每个 Tool pipeline 末尾发布 observe-only `tools/result(exec, result)`；Host 可以在该事件中按 `exec.token` 撤销 shell capability。因此，opaque token 只在对应 Bash/Pwsh Tool 执行期间有效，不需要依赖宽松 TTL。
- 同一个 shell execution 内允许使用相同 `submission_key` 重放同一 Generation Request，并返回同一个 `run_id`。相同 key 提交不同请求返回 `RUN_REQUEST_CONFLICT`；同一 shell execution 使用第二个新 key 创建 submission 返回 `CLI_SUBMISSION_CALL_CONFLICT` 并回滚第二个 Run。Skill 必须对每个 Generation Request 使用一个独立 shell call。
- 当前仓库实际项目 Skills 只有 `.agents/skills/` 下 4 项，仓库没有顶层 `skills/`。项目 Preset 应使用 `includeDefaultRoots: false`；B 指向 legacy 四-Skill 隔离副本，C 指向 CLI canary 隔离副本，终态指向当前 release 完整四-Skill canonical root 的受管安装副本。这样每个 Skill catalog 只包含该 Preset 所需知识，不继承用户全局 Skills。
- `dsh-tool-skill` 注册的模型 Tool 名称精确为 `skill`；`dsh-tool-bash` 注册的模型 Tool 名称精确为 `bash`。
- `dsh-tool-skill` 在 Skill catalog 首次出现或发生变化时追加 durable user-role catalog message；它不改变 `skill` Tool schema。该行为把动态 Skill 知识放到对话尾部，直接符合文章关于知识层与固定能力层分离的结论。
- 当前独立 worktree 的 Git 状态只有 `.planning/dynamic-tools-analysis/` 为未跟踪目录；设计过程没有修改源码、测试、依赖或 production runtime。
- 当前 Configuration Profile 会拒绝未声明的 `HARNESS_COMFYUI_*` 环境变量。B、C 与终态 Preset 各自使用的受管 Skill root 环境键必须全部写入 `config/environment-overrides.json`，每个 Preset 只读取自己的 key。
- Harness `settings.yaml` 的 `agent-presets.default` 会覆盖 profile base；当前 production 保存值仍是 `standard`。默认切换不能只改 profile 或一个不会投影到 settings 的产品字段；获得未来用户授权的 release 必须以 `productionDefaultPresetMigration { version, fromPresetId, toPresetId }` 为唯一结构化 source，通过“from 时原子投影、to 时幂等 no-op、第三值时拒绝”的 runtime migration 只处理 `settings.yaml.agent-presets.default`，并由 running health 同时验证 source target、settings 和 roster `isDefault`。
- 为了在单一 Host 中同时保留 legacy 和 CLI Session，Host 必须始终全局注册 5 个项目 Tool；已选 Preset 必须在 Session 首请求前建立不可变的 `ProjectToolVisibilityPolicy`。该 Policy 只区分 legacy 与 CLI standing composition，不允许按 Turn、stage 或 message 改变 Tool roster。
- 当前 `prepareSourceRuntime()` 不会自动安装仓库的 `agent-presets/harness-comfyui/`。获授权的默认切换 release 必须先从当前 release canonical source 物化并验证终态 Preset、完整四-Skill root 与受管 Skill 环境键，然后才能迁移 settings default。Target 物化失败时 settings 必须保持 `standard`。
- 为满足路径、Preset ID、Skill root 与 CLI route 的单一来源约束，设计稿新增 `config/product-agent.json` 结构化配置建议；Markdown 只说明合同，不作为程序读取的数据源。
- 独立 Reviewer 指出第一版零项目 Tool 设计缺少明确的 durable acceptance commit point：当前 `acceptGeneration()` 在 Run 插入后继续等待 preparation，shell cancellation 或 HTTP response 丢失会让调用者无法判断 Run 是否已经创建。
- 设计必须把 `generation_runs` 与 Session-scoped `generation_cli_submissions` 映射放进同一个 SQLite transaction；transaction commit 是唯一接受点，commit 后的 response loss 通过 `generation lookup --submission-key` 恢复同一个 `run_id`。
- 外部 Bearer `CapabilityValue` 与 Harness 进程内 `ToolExecutionToken` 是不同类型。前者必须由 256 位 CSPRNG 生成并检测进程内冲突；后者只能用于 `tools/result` 撤销当前 execution 的 capability。
- `dsh-agent-presets` 当前只把 DSH shipped root 视为 system trust，并把 `<DSH_HOME>/.agent-presets` 视为 user trust；项目 profile 无法增加第二个 project-owned system root。设计必须把“仓库 canonical source”与“运行时不可避免的 user-trust install root”分开描述，并由物化、health 与下次启动修复控制漂移。
- 项目 Preset 必须通过 `@deepseek-ai/dsh-agent-tool-presentation` 的 preset row 固定 `mode: native`；仅在产品配置中保存 `toolPresentation` 不能改变 Agent standing scope。
- Shell Tool 必须把 `enableRunInBackground` 固定为 `false`，并且 contributor 必须拒绝 background 参数；Preset 不挂载 jobs Tool，后台 shell 与 capability 生命周期无法形成可验收合同。
- 项目 Skill root 选择 `.agents/skills` 全目录，精确暴露当前四个项目 Skill；`comfyui-generate` 可以继续调用三个 Prompt 构建 Skill，同时不继承用户全局 Skill root。
- 当前仓库使用 `src/host/generation/generation-runtime.ts` 建表并直接拥有 `generation_runs` SQL；`generation_cli_submissions` 的 schema 与 transaction 必须在该 Run Repository ownership boundary 内实现，不能创建第二个 SQLite owner。
- 当前 TypeScript 配置为 `noEmit`，仓库没有通用 `dist/` CLI 产物；设计把确定的可执行入口定义为 `scripts/cli/harness-comfyui.mjs`，而不是假设不存在的构建输出目录。
- 仓库现有 `.mjs` 脚本已经直接导入 `src/**/*.ts`，Node engine 是 `^22.19.0 || >=24.0.0`；新的 `scripts/cli/harness-comfyui.mjs` 可以沿用该本机 TypeScript stripping execution 方式，不需要新增 build dependency。
- `generation-runtime.ts` 已有按对象 key 递归排序的 `canonicalJson()`；CLI submission conflict 必须复用该语义，避免相同 JSON 对象仅因 key 顺序不同而被误判成不同请求。
- 独立 Reviewer 初次只依据 `dsh-agent-presets` schema 判断项目可以配置第二个 system root；补充 `@deepseek-ai/dsh` profile-boot 最终 overlay 证据后，Reviewer 撤回该项。最终设计继续使用受管 `<DSH_HOME>/.agent-presets` 副本与预期 `trust: user`。
- 未知 Generation submit 结果不能只处理连接 response loss。只要 CLI 已尝试 HTTP request 且没有验证成功 envelope，Skill 就必须用同一 submission key 与同一 request lookup；lookup 本身不确定时必须报告 key，不能创建第二个 Run。
- `CliGenerationRequest` 必须把省略/null 规范化、嵌套对象、JSON depth、LoRA/trigger 数组和 snake_case 到内部 camelCase Adapter 写成封闭结构化合同。
- 用户指出此前设计把默认 Preset、模型 Tool Interface、Skill 调用协议和 Generation acceptance 一次切换，却没有模型效果数据；该方案属于没有发布依据的破坏性升级。
- deterministic contract/integration tests 只能证明 CLI transport 与 Run 持久化正确，不能证明模型在 Bash + Skill Interface 下的任务完成率、纠正次数、总 token、缓存效果或延迟不退化。
- 安全验证必须让 legacy 与 CLI canary 同时存在，并让两者只在项目能力 Interface 上不同；否则拿 `standard` 与 CLI preset 对比会混入 standard 其他编码 Tool 的差异。
- 在 canary 验证期间，5 个项目 Tool 必须继续注册，现有 `comfyui-generate` Skill 必须继续可用，生产 default 必须保持不变。
- 当前仓库没有自行实现模型 usage 计量 Module，但已安装的 Harness 依赖会在 Assistant Message usage 中提供 `inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens` 和 `reasoningTokens`，客户端连接层还会投影 `uncachedInputTokens`、`billedInputTokens` 与 `cacheHitPercent`。实验应读取 Harness Session 事件中的既有 usage 数据，不应新增重复计量逻辑。只有当实验所用 Provider 实际返回 cache usage 时，报告才能判断文章所述的缓存收益；缺失 cache usage 时不得用 Tool 数量替代效果数据。
- 当前 Generation Tool 的 `presentationMeta`、原生 Tool Call/Result 和 Client `resolveToolResultLink()` 共同支持中列运行链接；CLI canary 的 Bash result 不会自动产生同一 meta。该 UI 差异必须作为 canary 结果验收项，不能在架构图中忽略。
- 第一轮 CLI canary 必须复用当前 Generation preparation 与返回时序，不能把“移除模型 Tool”和“把 preparation 移到 commit 后异步执行”放进同一实验变量。
- 当前 `GenerationRuntime.acceptGeneration()` 在新 Run 插入 `generation_runs` 后会 `await preparePersistedRequest(...)`，准备成功后才把 `runId` 返回给 `generation-tool.ts`；已存在且状态为 `created` 的 Run 也执行相同等待。第一轮 CLI canary 应精确保持该已实现行为。`docs/v0.1/PRDS/04-single-image-generation.md` 中“持久接纳后立即返回”的终态文字与当前实现存在差异，但修复该差异不属于 Tool Interface A/B/C 实验变量。
- `docs/v0.1/PRDS/04-single-image-generation.md` 当前明确要求 `comfyui-generate` 调用原生 `generate_with_comfyui`，并把 Tool Call/Result、`presentationMeta` 与中列运行链接列为产品验收。CLI canary 不能静默改写该既有规范；计划执行者必须为实验 Preset 增加隔离的实验规范，并把删除 Tool 与修改正式 PRD 留给晋级后的独立破坏性变更。
- `docs/v0.1/PRDS/04-single-image-generation.md` 已定义单项生成、多项生成、模型与 LoRA 兼容、显式参数、实例路由、部分失败和未知提交结果等行为，可作为 paired experiment 任务语料的领域来源；模型输出语义仍必须由独立 Reviewer 盲审。
- `docs/agents/worktree-development.md` 默认禁止发送真实模型请求，除非任务明确要求。当前任务授权了调查与方案修订，没有授权真实 Provider 调用或生产 canary；本阶段只能定义效果实验，不能把尚未运行的实验写成通过。
- 现有 `docs/v0.1/PRDS/04-single-image-generation.md` 已定义真实 Harness 消息、单项/多项 Generation、Run 投影、Tool link、Fake Jobs API 和 Skill 黑盒验收，可以作为 legacy/canary 配对任务集的主要来源。
- 用户已明确授权当前 worktree 中的真实 Provider 调用，并固定使用 worktree `.env` 已配置的 `opencode-go/deepseek-v4-flash`、默认 Workspace 与 Harness 全局 Skill 目录；此前“禁止真实调用”和“隔离复制 Skill root”的假设不再适用于本阶段。
- B 不需要实现 C 所需的 `ProjectToolVisibilityPolicy`。B 的 standing composition 只注册自己的 Bash/Pwsh 与 Skill，Host 全局注册的 5 个项目 Tool 会通过 `agent → preset → global` scope 链保持可见；不实现 Policy 可以避免把 C 的隐藏逻辑混入 A→B 实验。
- `prepareSourceRuntime()` 同时服务 production 与 worktree，因此 B 的 materializer 不能无条件接入该函数。调用权必须来自结构化的 worktree context 标记或 worktree 专用 prepare seam，确保 production runtime 不物化 canary。

## 资源

- 文章：`https://yage.ai/share/grok-bot-dynamic-tools-20260827.html`
- 文章英文页：`https://yage.ai/share/grok-bot-dynamic-tools-en-20260827.html`
- 文章引用的 Grok Bot 重建源码：`https://github.com/b-nnett/grok-bot-0.18-reconstructed`
- 文章引用的 Manus Context Engineering：`https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus`
- 文章引用的 Anthropic Prompt Caching 文档：`https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching`
- 文章关联续篇：`https://yage.ai/share/grok-bot-context-engineering-20260827.html`
- 独立 worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-analyze-dynamic-tools`
- 架构说明：`docs/system/architecture.md`
- 目录说明：`docs/system/directory-structure.md`
