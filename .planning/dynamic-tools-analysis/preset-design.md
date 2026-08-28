# Harness ComfyUI 项目自有 Agent Preset 设计

## 文档状态与授权边界

本文描述“项目自有 Preset + Bash/Pwsh + Skill + 项目 CLI”的**待验证终态 Interface**，不构成当前实施或发布决定。

`.planning/dynamic-tools-analysis/rollout-plan.md` 是迁移顺序与授权边界的唯一计划。当前发布结论是 **NO-GO：不得直接迁移**。计划执行者必须先保留生产默认 Preset、5 个项目 Tool 和现有 `comfyui-generate` Skill，完成 A/B/C 对照、效果门禁、Client 视觉验收和回退演练。只有用户基于实验报告显式授权后，计划执行者才能创建默认切换 release；删除旧 Interface 还需要另一份计划和另一份用户显式授权。

本文后续出现的“必须”只约束门禁通过后的终态实现，不允许计划执行者在 canary 阶段删除旧路径或修改生产默认值。

## 必须实现的目标

1. 项目必须先增加 `harness-comfyui-tool-canary` 与 `harness-comfyui-cli-canary`，并通过隔离实验验证终态 `harness-comfyui`。
2. 三个项目 Preset 都必须在一个 Session 的全部模型请求中保持相同的 Tool name、Tool description、JSON schema 和 Tool 顺序。
3. `harness-comfyui-cli-canary` 与门禁通过后的 `harness-comfyui` 在 POSIX Host 上必须恰好暴露 `bash` 与 `skill`，在 Windows Host 上必须恰好暴露 `pwsh` 与 `skill`。
4. canary 阶段的 Host Plugin 必须在每个 runtime 中继续全局注册以下 5 个项目 Tool，并只通过已选 Preset 在 Session 首请求前建立的固定 standing composition 决定它们是否对该 Session 可见：
   - `query_semantic_comfyui_templates`
   - `query_semantic_loras`
   - `query_semantic_generation_models`
   - `query_semantic_comfyui_instances`
   - `generate_with_comfyui`
5. 现有 `comfyui-generate` Skill 必须保持不变；隔离的 CLI canary Skill 必须通过版本化项目 CLI 完成 Catalog resolve、实例目录读取和 Generation Run 提交。
6. CLI 不得接收由模型提供的 Workspace ID、Session ID、Turn 或 Call ID。Host 必须从当前 shell Tool execution 绑定这些身份。
7. 第一轮 CLI canary 必须保持当前已发布 Generation 接纳、准备、错误与返回时序，不能把另一项 Runtime 生命周期变更混入 Tool Interface 实验。
8. Generation Runtime、Run Repository、Generation Coordinator、Source Snapshot、Workflow 编译和 Client 的 Session/Turn 投影必须继续由 Host Plugin 拥有。
9. 计划执行者只有在 `rollout-plan.md` 的晋级门禁全部通过并取得用户显式授权后，才能把 `harness-comfyui` 设为生产默认值；删除 5 个 Tool 与旧 Skill 必须另行授权。

## 设计结论

用户的纠正是成立的。当前问题不是是否选择 `router-standard`，也不是把 `standard` 缩减几个 Tool。正确的设计对象是项目自己的固定 Interface。

当前 5 个项目 Tool 的结论需要分成两类：

- 4 个 Catalog Tool 已经是 `CatalogCli` 的 Tool Adapter。模型可以通过 Bash 调用一个项目 CLI，不需要在每个模型请求中重复携带 4 份 Tool schema。
- `generate_with_comfyui` 当前不是 CLI Adapter。它从 `ToolRunContext` 派生 Workspace、Session、Turn 和 Call identity，然后调用 `GenerationRuntime.acceptGeneration()`。要把最后一个 Tool 也移除，项目必须先增加一个由 Host 拥有、能够绑定当前 shell execution 的 CLI submission transport。

待验证终态架构是：

```text
固定模型 Interface
  ├─ skill ──> 加载 comfyui-generate 的知识与编排规则
  └─ bash  ──> 调用 $DSH_HARNESS_COMFYUI_CLI
                    │
                    ├─ Catalog 子命令
                    ├─ Instance 子命令
                    └─ Generation submit 子命令
                              │
                     loopback Host CLI route
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   CatalogCli          GenerationSourceCli   GenerationRuntime
                                                   │
                              Run Repository + Coordinator + Client projection
```

该终态设计在结构上符合文章的核心结论：serialized Tool surface 固定；Skill 属于知识层；CLI 能力通过稳定的通用 shell Tool 到达；Catalog 数据、完整请求和执行身份只在 Tool result 或 Tool execution 阶段出现，不改变模型请求前缀中的 `tools` 数组。结构符合不等于产品效果已经成立；模型任务成功率、usage、缓存、时延与 Client UX 必须通过 `rollout-plan.md` 的 A/B/C 实验验证。

## 当前实现判断

当前实现只在“固定注册”这个狭义条件上符合文章：Host 启动时一次注册 5 个 Tool，没有逐轮增加或删除项目 Tool。

当前实现没有采用最小能力 Interface。4 份 Catalog schema 属于 CLI 的重复模型投影；它们增加每轮请求的固定输入，却没有提供 Bash + CLI 无法提供的 Host 状态。`generate_with_comfyui` 提供了不可由当前 CLI 替代的 identity 与 Run 接受语义，因此技术实现只有在新的 CLI transport 完成后才具备移除条件；产品是否移除仍取决于 B→C 效果门禁与用户另行授权。

结论不是“当前 5 个 Tool 动态注入错误”，而是“当前 5 个 Tool 虽然稳定，但零项目 Tool 值得作为实验假设”。补齐可信 CLI transport 只能证明技术可行，不能证明 4 个 Catalog Tool 与 1 个 Generation Tool 应当退出生产能力层。

## Design It Twice 方案比较

| 方案 | 模型可见项目 Tool | Interface | 优点 | 主要问题 | 结论 |
| --- | ---: | --- | --- | --- | --- |
| Catalog CLI + 单一 Generation Tool | 1 | Bash 查询，专用 Tool 提交 | 直接复用当前 `ToolRunContext` identity | 仍保留项目 Tool；不满足用户提出的目标 | 可作为过渡方案，不是目标架构 |
| 单一通用 capability Tool | 1 | `capability_id + arguments` | 扩展能力时 Tool schema 不增加 | 模型仍学习一个项目 meta-Tool；参数错误推迟到运行时 | 适合没有 shell 的部署，不适合本项目 |
| Bash + Skill + 项目 CLI | 0 | 固定通用 Tool + 版本化 CLI | Tool surface 最小；CLI 扩展不改变 Tool schema；符合现有 Skill 工作方式 | 必须新增可信 shell identity transport；专用 Tool card 消失；模型效果未经验证 | 待验证终态，不得直接发布 |

## 终态 Agent Preset Interface

### Canary Preset ID 与隔离变量

实验阶段必须新增以下两个 Preset canonical source：

```text
agent-presets/harness-comfyui-tool-canary/
agent-presets/harness-comfyui-cli-canary/
```

两个 canary 必须使用相同 persona、agent instructions、compaction、`native` Tool presentation 与项目 Skill catalog。Host 始终全局注册 5 个项目 Tool。`harness-comfyui-tool-canary` 的 `ProjectToolVisibilityPolicy` 固定暴露 Bash/Pwsh、Skill 和 5 个项目 Tool；`harness-comfyui-cli-canary` 的 Policy 固定暴露 Bash/Pwsh 与 Skill。Policy 必须在 Session 创建期间、第一次模型请求组装前安装，Session 建立后不得切换、恢复或重算。实验仍为 A/B/C 使用独立 runtime 隔离数据与用量；该隔离不能通过删除 C runtime 中的全局 Tool 注册实现。

`harness-comfyui-tool-canary` 使用现有 `comfyui-generate` Skill 的隔离副本；`harness-comfyui-cli-canary` 使用 CLI 版 Skill 的隔离副本。两个 canary 不得改写仓库当前 `.agents/skills/comfyui-generate/`。

### 终态 Preset ID 与文件

只有 `rollout-plan.md` 的全部晋级门禁通过且用户批准默认切换 release 后，仓库才把以下两个文件作为终态 Preset 的唯一 canonical source：

```text
agent-presets/harness-comfyui/agent.cordis.yml
agent-presets/harness-comfyui/preset.yml
agent-presets/harness-comfyui/skills/
```

`agent-presets/harness-comfyui/skills/` 必须是完整的终态 Skill root：它包含三个经 B/C 验证为语义一致的项目 Skill 和一个通过 B→C 门禁的 CLI 版 `comfyui-generate`。默认切换 release 不得在生产准备时临时合并 legacy 与 canary Skill 文本。

`preset.yml` 必须使用：

```yaml
name: ComfyUI 图像工作台
description: 使用项目 Skills 与 CLI 完成 ComfyUI 图像生成任务。
order: 1
```

### `agent.cordis.yml` 组成

Preset 必须完整声明自己的 Agent-plane composition，不复制或 patch `standard`：

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are the Harness ComfyUI workbench Agent. Use the project Skills and the managed Harness ComfyUI CLI. Reply in the user's language.

- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
  config:
    enableRunInBackground: false

- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'
  config:
    enableRunInBackground: false

- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: native

- id: project-tool-visibility
  name: 'harness-comfyui:project-tool-visibility'
  config:
    policyId: cli

- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    providerName: harness-comfyui
    includeDefaultRoots: false
    watch: false
    customSkillDirs: [!!js process.env.HARNESS_COMFYUI_SKILL_DIR]

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'

- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
```

`persona`、`agent-instructions`、`skill-filesystem`、`project-tool-visibility` 与 `compaction` 不增加模型 Tool。`ProjectToolVisibilityPolicy` 的封闭 `policyId` 只能是 `legacy` 或 `cli`：B 的 canonical source 使用 `legacy`，C 与终态 Preset 使用 `cli`。该 Module 从 `registerProjectTools()` 共用的唯一项目 Tool name 常量取得 5 个名称，并在 Agent Session scope 启动时建立不可变的 visibility restriction；它不接受 Turn、message、stage 或模型输入。POSIX CLI Session 的固定 Tool 数组是 `[bash, skill]`；Windows CLI Session 的固定 Tool 数组是 `[pwsh, skill]`。

单一 Host 可以同时建立 legacy 与 CLI 新 Session；差异只由各自 Preset 的 standing `policyId` 决定。已建立 Session 保留建立时的 Tool composition，后续默认值、Preset 目录或新 Session 选择的变化不得重组它。

`dsh-tool-skill` 在 Skill catalog 首次建立或内容变化时追加 durable user-role context，不改变 `skill` Tool definition。该行为允许 Skill 名称与说明位于知识层，同时保持 serialized Tool surface 固定。

Preset 不应挂载 filesystem、filesystem search、jobs、goal、plan mode、delegation、ask-user、todo、web 或项目 Tool registry。Bash 已经提供确定性的文件与 CLI 操作；本产品的常见调用者不需要 `standard` 的完整编码 Agent Interface。

Preset 必须在 Tool schema 层关闭 background shell。Shell environment contributor 还必须在 `execution.arguments` 缺失、不是对象、包含 `run_in_background: true` 或不能通过 Bash/Pwsh 参数合同验证时拒绝签发 CLI capability。

### Tool presentation

Preset 必须通过 `tool-presentation` row 固定使用 Harness 的 `native` presentation。两个通用 Tool 的 schema 很小且固定，增加 `run_code` 和动态 SDK section 不会带来收益。实际 Agent standing scope 与 health 的期望值都由 canonical `agent.cordis.yml` 中的该 row 建立。

Preset 不得使用以下机制：

- `ctx.tools.restrict()` 的逐轮或逐阶段变更；
- `system-prompt/assemble` 对 `assembled.tools` 的过滤；
- 按消息注册或注销 Tool；
- `native`、`code` 与 `both` 的 Session 中途切换；
- Catalog 或 CLI 子命令到 Tool definition 的动态投影。

## 项目 CLI Interface

### 命令入口

Host shell environment 必须提供：

```text
DSH_HARNESS_COMFYUI_CLI
```

POSIX contributor 把该变量设置为 `scripts/cli/harness-comfyui` 的绝对路径；Windows contributor 把它设置为 `scripts/cli/harness-comfyui.cmd` 的绝对路径。两个 launcher 都只启动 `scripts/cli/harness-comfyui.mjs`。Skill 通过该平台对应的绝对 launcher path 调用 CLI，不依赖项目 CLI 的 PATH 注册、Catalog executable 绝对路径、Source executable 绝对路径或 Host port。

CLI 必须实现以下命令树：

```text
$DSH_HARNESS_COMFYUI_CLI catalog template resolve --id <id>
$DSH_HARNESS_COMFYUI_CLI catalog generation-model resolve --id <id>
$DSH_HARNESS_COMFYUI_CLI catalog lora resolve --id <id>
$DSH_HARNESS_COMFYUI_CLI catalog instance list --page 1 --page-size 100
$DSH_HARNESS_COMFYUI_CLI generation new-key
$DSH_HARNESS_COMFYUI_CLI generation submit --submission-key <key> --stdin
$DSH_HARNESS_COMFYUI_CLI generation lookup --submission-key <key> --stdin
```

Windows Skill 使用 `& $env:DSH_HARNESS_COMFYUI_CLI <同一 argv>`；命令树、stdin 和 JSON 合同与 POSIX 完全相同。

`generation new-key` 只在 CLI 进程内调用系统 CSPRNG，不向 Host route 发请求。其余命令都使用同一个 Host route 和同一份命令合同。新增 CLI 子命令只扩展 `src/cli/contract.ts`，不得增加模型 Tool。

### 稳定结果 envelope

所有命令必须只向 stdout 写入一个 UTF-8 JSON 对象：

```json
{
  "version": 1,
  "ok": true,
  "command": "catalog.template.resolve",
  "data": {
    "id": "42",
    "title": "Portrait",
    "base_model_id": "1",
    "model_id": null
  }
}
```

失败结果必须使用同一个顶层合同并返回非零退出码：

```json
{
  "version": 1,
  "ok": false,
  "command": "generation.submit",
  "error": {
    "code": "INVALID_ARGUMENTS",
    "message": "The Generation Request is invalid.",
    "retryable": false
  }
}
```

CLI 不得向 stdout 或错误 message 返回内部绝对路径、Bearer capability、Catalog stderr、认证信息或完整堆栈。

### 命令级结构化合同

`src/cli/contract.ts` 必须是 CLI request、success data、error code 和 JSON parser 的唯一结构化来源。该 Module 必须定义封闭的 discriminated union；CLI executable、Host route 和 Skill 黑盒测试必须导入同一合同，不能分别复制字段集合。

错误码 union 必须包含 CLI transport code `INVALID_ARGUMENTS`、`CLI_CONTEXT_UNAVAILABLE`、`CLI_CAPABILITY_INVALID`、`CLI_EXECUTION_CONTEXT_INVALID`、`CLI_SUBMISSION_CALL_CONFLICT`、`GENERATION_WORKSPACE_REQUIRED`、`CATALOG_QUERY_FAILED`、`CATALOG_PROTOCOL_ERROR`、`CATALOG_RESPONSE_TOO_LARGE`、`RUN_REQUEST_CONFLICT`、`GENERATION_ACCEPTANCE_FAILED`、`REQUEST_CANCELLED` 和 `INTERNAL_ERROR`，并复用当前 Generation preparation 会返回给原 Tool 的稳定业务错误码。CLI Adapter 必须把现有 Catalog 与 Generation code 原样映射到同名 code；未归类异常只能映射为 `INTERNAL_ERROR`，并在用户 message 中省略内部异常文本。第一轮 canary 在 preparation 失败时必须像当前 Generation Tool 一样返回失败，不能把该错误隐藏为已经成功的 `generation.submit`。

`retryable` 只能对 `CATALOG_QUERY_FAILED` 和已经确认 SQLite transaction 未 commit 的 `GENERATION_ACCEPTANCE_FAILED` 返回 `true`；其他 code 必须返回 `false`。一次 Generation Request 在首次 submit 后最多再执行一次 submit：该次 follow-up submit 只能发生在同一 key lookup 返回 `found: false` 且原 error `retryable: true`，或者返回 `found: true, preparation: "pending"` 时；两个条件互斥。Follow-up submit 没有可验证结果或返回错误后，Skill 不得执行第三次 submit。

每个 request 顶层必须恰好包含 `version: 1`、`command` 和 `arguments`。每个 `arguments` 对象都必须拒绝额外属性。

| `command` | `arguments` | 成功 `data` |
| --- | --- | --- |
| `catalog.template.resolve` | `{ id: string }` | `{ id: string, title: string, base_model_id: string, model_id: string \| null }` |
| `catalog.generation-model.resolve` | `{ id: string }` | `{ id: string, base_model_id: string, file_name: string, description: string, usage: string, skill_name: string \| null }` |
| `catalog.lora.resolve` | `{ id: string }` | `{ id: string, base_model_id: string, model_id: string, file_name: string, description: string, usage: string, trigger_words: string[], weight: number }` |
| `catalog.instance.list` | `{ page: 1, page_size: 100 }` | `{ status: "ok", message: null, results: { id: string }[], page: 1, page_size: 100, total_count: integer }` |
| `generation.new-key` | `{}` | `{ submission_key: string }` |
| `generation.submit` | `{ submission_key: string, request: CliGenerationRequest }` | `{ submission_key: string, run_id: string, accepted: true }` |
| `generation.lookup` | `{ submission_key: string, request: CliGenerationRequest }` | `{ submission_key: string, found: false }` 或 `{ submission_key: string, found: true, run_id: string, status: GenerationRunStatus, preparation: "pending" \| "succeeded" \| "failed", error: null \| { code: string, message: string } }` |

Catalog identity 必须是正十进制整数字符串。`title`、`file_name`、`description`、`usage` 与 `trigger_words` 的非空、长度、唯一性和有限数值约束必须复用 `src/catalog/contract.ts` 的现有 parser；CLI contract 不得另建一套 Catalog 语义。

`GenerationRunStatus` 必须复用 Run Repository 的现有状态 union。`generation.lookup` 只能查询 capability 所属 Session 的 submission，不接受 Workspace、Session 或 Turn 参数。lookup 必须比较 stdin request 与映射中的 canonical request；同一 key 对应不同 request 时返回 `RUN_REQUEST_CONFLICT`，不能把另一个请求的 `run_id` 当作恢复成功。

### Generation Request

`generation submit --submission-key <key> --stdin` 与 `generation lookup --submission-key <key> --stdin` 从 stdin 读取同一个 `CliGenerationRequest` JSON 对象。`src/cli/contract.ts` 必须定义以下完整封闭类型：

```ts
type CliJsonValue = null | boolean | number | string | readonly CliJsonValue[] | {
  readonly [key: string]: CliJsonValue
}

interface CliGenerationModel {
  readonly id: string
  readonly file_name: string
}

interface CliGenerationLora {
  readonly id: string
  readonly file_name: string
  readonly weight: number
  readonly trigger_words: readonly string[]
}

interface CliGenerationRequest {
  readonly title: string
  readonly instance_id?: string | null
  readonly template_id: string
  readonly model?: CliGenerationModel | null
  readonly parameters: Readonly<Record<string, CliJsonValue>>
  readonly loras?: readonly CliGenerationLora[]
}

interface NormalizedCliGenerationRequest {
  readonly title: string
  readonly instance_id: string | null
  readonly template_id: string
  readonly model: CliGenerationModel | null
  readonly parameters: Readonly<Record<string, CliJsonValue>>
  readonly loras: readonly CliGenerationLora[]
}
```

Parser 必须遵守以下约束：

- 顶层只允许 `title`、`instance_id`、`template_id`、`model`、`parameters` 和 `loras`；`model` 与每个 LoRA 对象也只允许上面列出的 key。
- `title` 必须是去除首尾空白后仍非空且长度不超过 500 的字符串。
- `instance_id`、`template_id`、model `id` 与 LoRA `id` 必须复用 `parseCatalogStableId()`；`instance_id` 省略或显式 `null` 都规范化为内部 `null`。
- model 省略或显式 `null` 都规范化为内部 `null`；model `file_name` 必须复用 Catalog item text 的非空与 500 字符约束。实现时必须把该约束从 `src/catalog/contract.ts` 的私有 `itemText()` 提取为导出的 `parseCatalogFileName()`，并由 Catalog resolve parser 与 CLI parser 共用。
- `parameters` 必须是 JSON object，允许空对象；内部值只允许 JSON `null`、boolean、有限 number、string、array 和 object，最大嵌套深度为 64。`parameters` 内的 Workflow runtime key 不视为额外属性。
- `loras` 省略时规范化为空数组；显式 `null` 非法。数组最多包含 100 项，LoRA `id` 不得重复。
- LoRA `file_name` 必须复用 `parseCatalogFileName()`；`weight` 必须通过 `Number.isFinite()`；`trigger_words` 必须包含 0 至 100 个互不重复的非空字符串，每个字符串长度不超过 500。实现时必须从 `src/catalog/contract.ts` 导出 `parseCatalogTriggerWord()`，并由 Catalog resolve parser 与 CLI parser 共用。
- 1,048,576 bytes stdin 上限在 JSON parse 前执行。`parseCliGenerationRequest()` 返回深度冻结的 `NormalizedCliGenerationRequest`；输入 key 顺序与 omitted/null 的等价写法不影响 canonical request。

`src/host/generation/cli-generation-request-adapter.ts` 必须是 `NormalizedCliGenerationRequest -> GenerationRequest` 的唯一 Adapter。该 Adapter 只执行 snake_case 到 camelCase 的字段映射和只读数组复制，不执行 Prompt、Catalog 或 Workflow 语义判断。该对象保留当前 Generation Tool 的业务参数，不包含 Harness identity：

```json
{
  "title": "portrait",
  "instance_id": "1",
  "template_id": "42",
  "model": {
    "id": "17",
    "file_name": "model.safetensors"
  },
  "parameters": {
    "positive_prompt": "...",
    "width": 1024,
    "height": 1536
  },
  "loras": [
    {
      "id": "9",
      "file_name": "portrait.safetensors",
      "weight": 0.8,
      "trigger_words": ["trigger"]
    }
  ]
}
```

`generation.submit` 成功结果的 `data` 必须包含 `run_id`。第一轮 canary 必须像当前 `acceptGeneration()` 一样等待 Source 读取与 Workflow preparation，且不等待远端 ComfyUI 完成。

`submission_key` 不属于 Harness identity。`generation.new-key` 必须使用 CSPRNG 生成一个具有 256 位熵、匹配 `^[A-Za-z0-9_-]{43}$` 的无填充 base64url 字符串；Skill 必须在提交前取得并保存该 key。一个 key 在一个 Session 中只标识一个业务 Generation Request。

## Shell identity 与 Host transport

### Seam

`@deepseek-ai/dsh-shell-env` 已经为每次 shell Tool call 调用 contributor 的 `resolve(execution)`。`ToolExecution` 包含 `callId`、`rootCallId`、`agent`、不可由调用者选择的 opaque `token` 和 cancellation signal。

Host Plugin 必须注册一个 `harness-comfyui-cli` shell environment contributor。该 contributor 为每次 foreground Bash/Pwsh execution 创建随机 opaque capability，并通过受管环境提供：

```text
DSH_HARNESS_COMFYUI_CAPABILITY
```

CLI 自动读取该变量，并把它放入 loopback HTTP request 的 Authorization header。Skill 和模型不需要读取、复制或传递该 capability。

设计中的两个 token 必须使用不同类型和名称：

- `CapabilityValue`：跨进程传入 Authorization header、匹配 `^[A-Za-z0-9_-]{43}$` 的 256 位 CSPRNG 无填充 base64url 字符串。
- `ToolExecutionToken`：Harness 进程内不可序列化的 Symbol，只用于关联 `tools/result` 与签发时的 Tool execution。

`ShellExecutionCapabilityRegistry` 必须在 CSPRNG 结果与现存 `CapabilityValue` 冲突时重新生成，直到取得进程内唯一值。

### Capability 生命周期

Host 必须保存：

```text
CapabilityValue -> ToolExecutionToken、agent、session、rootCallId、shell callId、signal
```

Host 必须遵守以下不变量：

1. shell executor 会先清除 ambient `DSH_*`，调用者不能通过进程环境预置 capability。
2. `tools/result` 发布时，Host 必须通过 `ToolExecutionToken` 删除该 execution 签发的 `CapabilityValue`。
3. background shell 参数在 Tool schema 中不可见且不可执行；contributor 对任何 background 参数拒绝签发 capability。
4. endpoint 只接受当前仍在执行、未取消的 shell capability。
5. CLI 与 Host 的受管路径不得把 capability 放入 argv、stdout、stderr、Session event 或 Run Repository；任意 Bash/Pwsh 命令仍可以读取并主动输出自己的 environment，因此该 capability 不是针对当前 shell execution 的秘密边界。即使调用者主动输出该值，`tools/result` 随后也必须撤销它。
6. 一个 Session 的 capability 不能访问另一个 Session 的 identity。

### Identity 派生

Host 收到 `generation.submit` 时执行以下步骤：

1. 使用 capability 取得受信任的 `ToolExecution`。
2. 使用 `rootCallId` 在当前 Session 中找到唯一根 `tool/call` 事件并读取 `turn`。
3. 使用 Session header 的 `cwd` 调用 Workspace Registry。
4. 验证当前 Session 已附着到该 Workspace。
5. 建立 `{ workspaceId, sessionId, turn, callId: shellCallId }`。
6. 使用受信任的 Workspace 与 Session identity、CLI request 的 `submission_key` 和 `CliGenerationRequest` 调用新的 durable acceptance Interface。

模型和 CLI request 不提供上述 4 个 Harness identity 字段。`submission_key` 只是 Session 内的业务幂等键，不能授权访问 Workspace、Session 或 Turn。

### Canary durable submission mapping

Run Repository 必须新增 `generation_cli_submissions` 表，避免改变既有 `generation_runs.call_id` 的审计含义：

```text
generation_cli_submissions(
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES generation_runs(run_id) ON DELETE CASCADE,
  request_json TEXT NOT NULL,
  accepted_turn INTEGER NOT NULL,
  accepted_call_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id, session_id, submission_key),
  UNIQUE(workspace_id, session_id, accepted_call_id),
  UNIQUE(run_id)
)
```

`generation_cli_submissions.request_json` 必须保存 `NormalizedCliGenerationRequest` 的 canonical JSON，用于 key conflict 与 lookup 比较。`generation_runs.request_json` 必须继续保存 Adapter 输出的内部 `GenerationRequest` canonical JSON，用于现有 preparation。项目必须把 `generation-runtime.ts` 当前按对象 key 排序的 `canonicalJson()` 提取到 `src/generation/canonical-json.ts`，并由现有 Runtime 与 `GenerationCliAcceptance` 共用；等价 JSON 的 key 顺序差异不能触发 conflict，也不得增加 hashing 比对。

Host 必须在同一个 SQLite transaction 中插入 `generation_runs` 与 `generation_cli_submissions`。该 transaction 的 commit 是 CLI response uncertainty 的唯一持久恢复点：

- signal 在 transaction 开始前已经取消：Host 不开始 transaction，不创建 Run。
- transaction 失败或回滚：Host 不创建 Run，CLI 返回未接受错误。
- transaction commit：Run 与 submission mapping 已持久化；后续 CLI 断连或 HTTP 响应丢失不能导致同一业务请求创建第二个 Run。

第一轮 canary 必须在 transaction commit 后调用与当前 `acceptGeneration()` 相同的 preparation 路径，继续传递当前 shell Tool signal，并在 preparation 成功后返回 `run_id`。Preparation 的业务失败必须把同一个 Run 标记为 `failed`，并向 CLI 返回与原 Generation Tool 等价的稳定错误。`generation.lookup` 必须在 response uncertainty 后返回该 Run 的 `status` 与可选错误；Skill 不能因为 preparation 失败创建第二个 Run。

把 preparation 改为只由 `GenerationCoordinator` 使用自身 lifecycle signal 推进，并让 CLI 在 commit 后立即返回，属于独立的 Runtime 生命周期实验。该变化不得进入第一轮 B/C Interface 对照，也不属于本文当前授权。

同一 Session 使用同一 `submission_key` 重试时，Host 必须先读取 `generation_cli_submissions`：request JSON 不同则返回 `RUN_REQUEST_CONFLICT`；request JSON 相同时必须进入统一 `resumePreparation(runId, signal)` 状态机，不能直接返回 `run_id`。该状态机必须精确复现当前 `acceptGeneration()`：

- Run 为 `created`：同一 Host 进程内的调用必须加入同一个 preparation single-flight；Host 重启后的第一个 replay 必须恢复同一 Run 的 preparation。Preparation 成功后才能返回 `{ accepted: true, run_id }`。
- Run 为 `failed` 且 `actual_workflow_path` 为空：Host 必须重放该 Run 保存的 preparation error，不能返回 accepted success。
- Run 已经存在 `actual_workflow_path`，或者状态已经越过 `created`：Host 返回同一个 `run_id`；后续远端状态不重新执行 preparation。

该规则跨 shell Call 和跨 Turn 生效。`generation.lookup` 必须接收同一 `CliGenerationRequest`，比较 canonical request 后再读取同一 Session 的 Run，并根据 Run 的 `actual_workflow_path`、status 与 error 返回 `preparation`。Lookup 不能返回其他 Session 或另一 request 的记录。

两个并发 submit 使用同一 Session 与同一 key 时，SQLite primary key 必须只允许一个 transaction 创建映射。失败的竞争 transaction 必须在回滚后重新读取映射：canonical request 相同时必须进入同一个 `resumePreparation()` single-flight，不能在获胜 Run 仍为 `created` 时提前返回；request 不同时返回 `RUN_REQUEST_CONFLICT`。竞争失败路径不得保留孤立 `generation_runs` 记录。

同一个 shell Call 只能创建一个新的 CLI submission mapping。相同 key replay 继续解析既有 mapping；同一 `(workspace_id, session_id, accepted_call_id)` 使用第二个新 key 时，唯一约束必须回滚第二个 Run 与 mapping，并返回 `CLI_SUBMISSION_CALL_CONFLICT`。Link resolver 即使面对损坏或迁移错误产生的多行结果，也必须返回稳定 link-invalid error，不能选择第一行或排序猜测。

`generation_runs.turn`、`generation_runs.call_id`、`accepted_turn` 和 `accepted_call_id` 必须保存首次成功 commit 的 shell identity。后续 submit retry 与 lookup 只读取该记录，不得用重试所在 Turn 或 shell Call 覆盖首次接受审计字段。

该变更只扩展 Run Repository 的 CLI submission mapping 与跨 shell 恢复能力；第一轮 canary 必须保持现有 `acceptGeneration()` 的外部时序和错误可见性。任何改变 acceptance 外部语义的后续设计必须单独取得实验与发布授权。

### Host route

Host Plugin 已经拥有 `webServer.register()`，Bash 已经拥有 `DSH_WEB_URL`。Host Plugin 必须在同一个 loopback Host server 注册以下精确 POST route：

```text
POST /api/harness-comfyui/cli/v1
```

route 只接受 `POST`、`Content-Type: application/json` 和不超过 1,048,576 bytes 的 request body。route 必须验证 `Authorization: Bearer <CapabilityValue>`，并在 durable acceptance commit point 之前把 cancellation 传给现有 Adapter。CLI 的 stdin 也必须限制为 1,048,576 bytes。CLI 不启动后台 daemon，不直接访问 SQLite，也不绕过 `GenerationRuntime`。

## Module、Interface 与 Adapter

### `HarnessComfyuiAgentPreset` Module

- Interface：固定的 Bash/Pwsh 与 Skill Tool surface。
- Implementation：persona、agent instructions、受管 Skill root 和 compaction。
- Depth：模型只学习两个通用 Tool；Preset 隐藏 `standard` 的编码 Agent 组成。
- Locality：Preset 变化只影响新 Session，运行中的 Session 保持其 standing composition。

### `HarnessComfyuiCli` Module

- Interface：版本化命令树、参数合同与 stdout envelope。
- Implementation：读取 `DSH_WEB_URL` 与 opaque capability，调用 Host route。
- Depth：模型不需要了解 HTTP、端口、认证、Catalog executable 或 Source executable。
- Leverage：Catalog、实例查询和 Generation submit 共用一个 transport、错误合同与取消行为。

### `ShellExecutionCapabilityRegistry` Module

- Interface：`issue(execution): CapabilityValue`、`resolveCapability(value: CapabilityValue)`、`revokeExecution(token: ToolExecutionToken)`。
- Implementation：进程内随机 token map 与 Tool result 生命周期监听。
- Seam：Harness `shellEnv.resolve(execution)` 与 `tools/result`。
- Locality：Harness identity 逻辑集中在 Host，不分散到 Skill、CLI 参数或 Run Repository。

### Host Adapters

- `CatalogCli` 继续负责 Catalog executable、参数、timeout、abort 与 response validation。
- `GenerationSourceCli` 继续负责 instance 与 template-bundle Source 读取。
- `GenerationRuntime` 继续拥有 Run Repository 与持久准备；`GenerationCliAcceptance` 把 Run 与 CLI submission mapping 放入同一 transaction，并在第一轮 canary 中调用当前 preparation 路径后再返回。
- `GenerationCoordinator` 继续负责异步状态推进。
- `GenerationRemoteService` 与 Client store 继续按 Session/Turn 投影 Run 与 Media。

### `GenerationCliAcceptance` Module

- Interface：`submit(identity, submissionKey, cliRequest, signal)` 与 `lookup(identity, submissionKey, cliRequest)`。
- Implementation：调用唯一 CLI-to-Runtime Adapter；在同一 SQLite transaction 内分别保存内部 Run request 与 CLI submission request；执行 Session-scoped lookup 和 canonical request conflict 检查。
- Seam：shell execution identity 与现有 `GenerationRuntime`/Run Repository 之间的 durable submission mapping。
- Locality：跨 shell 重试、断连恢复和业务幂等只存在于该 Module；Skill 不推断 Run Repository 状态。

### 源码与测试 ownership map

| 文件 | 实现主体与唯一责任 |
| --- | --- |
| `agent-presets/harness-comfyui-tool-canary/` | B 组固定 composition 与用户可见说明 |
| `agent-presets/harness-comfyui-cli-canary/` | C 组固定 composition、用户可见说明与 CLI canary `comfyui-generate` Skill source |
| `agent-presets/harness-comfyui/agent.cordis.yml` | 门禁通过后终态 `HarnessComfyuiAgentPreset` composition 与 `native` presentation |
| `agent-presets/harness-comfyui/preset.yml` | 门禁通过后终态 Preset 的用户可见名称、说明与顺序 |
| `agent-presets/harness-comfyui/skills/` | 门禁通过后终态的完整四-Skill canonical root，其中 `comfyui-generate` 只使用已验证 CLI 版 |
| `config/product-agent.json` | Canary Preset root、Preset ID、隔离 Skill root 与 POSIX/Windows CLI launcher path；实验阶段不得拥有生产 default 值，未来获授权的默认切换 release 在此增加唯一 `productionDefaultPresetMigration { version, fromPresetId, toPresetId }` |
| `scripts/production/runtime.mjs` | 默认切换 release 获授权后，在 Host 启动前执行幂等 settings default migration；canary 实验阶段不执行生产 migration |
| `scripts/profile/agent-preset.mjs` | Canary canonical Preset/隔离 Skill root 与获授权终态 Preset/完整 Skill root 的验证、staging 与原子 runtime 物化 |
| `scripts/cli/harness-comfyui` 与 `scripts/cli/harness-comfyui.cmd` | POSIX 与 Windows 的平台 launcher；只启动同目录的 `.mjs` implementation |
| `scripts/cli/harness-comfyui.mjs` | 项目 CLI implementation 与 stdout/exit-code 行为 |
| `src/cli/contract.ts` | CLI route、command union、request/result envelope 与 parser |
| `src/catalog/contract.ts` | Catalog stable ID、file name 与 trigger word 的共享值 parser |
| `src/host/cli/shell-execution-capability.ts` | `CapabilityValue` 的签发、解析与撤销 |
| `src/host/cli/shell-env-contributor.ts` | foreground shell execution 的受管 CLI 环境 |
| `src/host/cli/cli-route.ts` | `POST /api/harness-comfyui/cli/v1` 的 HTTP validation 与 Adapter dispatch |
| `src/host/tools/project-tool-visibility-policy.ts` | 在 Agent Session 首请求前根据 Preset `policyId` 建立不可变的项目 Tool standing visibility |
| `src/generation/canonical-json.ts` | Generation Request 的 canonical JSON |
| `src/host/generation/cli-generation-request-adapter.ts` | `CliGenerationRequest` 到内部 `GenerationRequest` 的唯一规范化 Adapter |
| `src/host/generation/generation-cli-acceptance.ts` | Session-scoped submission lookup、conflict 与 durable acceptance |
| `src/host/generation/generation-runtime.ts` | `generation_cli_submissions` schema、同 transaction Run 插入与当前 preparation 时序 |
| `src/host/plugin.ts` | 新 contributor/route 注册，并在 canary 阶段保留 5 个项目 Tool 注册 |
| `src/generation/cli-submission-link-contract.ts` | CLI shell Call 到 Generation Run link 的封闭 request/result contract |
| `src/host/generation/generation-service.ts` | `resolveCliSubmissionLink()` 的 Session、Workspace、shell Call 与 submission mapping 校验 |
| `src/client/workbench/cli-generation-run-link.tsx` | C 组 settled Bash/Pwsh 行的 Run 链接、右列定位与历史重放 |
| `.agents/skills/comfyui-generate/SKILL.md` | 原 Tool 路径的 legacy canonical source；canary 阶段不得修改 |
| `agent-presets/harness-comfyui-cli-canary/skills/comfyui-generate/SKILL.md` | CLI 调用顺序、key 保留、lookup 恢复和用户结果报告 |

结构化测试必须分别位于 `tests/contract/agent-preset.test.ts`、`tests/unit/project-tool-visibility-policy.test.ts`、`tests/unit/cli-contract.test.ts`、`tests/unit/shell-execution-capability.test.ts`、`tests/unit/generation-cli-acceptance.test.ts`、`tests/unit/cli-submission-link-contract.test.ts`、`tests/unit/generation-service-cli-link.test.ts`、`tests/unit/cli-generation-run-link.test.tsx`、`tests/integration/host-cli-route.test.ts`、`tests/integration/host-plugin.test.ts` 和 `tests/production/product-agent-runtime.test.ts`。Skill 文案、CLI help 与错误文案由独立语义审核队员按本文验收清单验收，不使用程序逻辑判断语义质量。

## CLI canary `comfyui-generate` Skill

仓库当前 `.agents/skills/comfyui-generate/` 的语义与 Tool 调用方式必须保持不变。CLI canary 使用隔离 source；它的语义责任与旧 Skill 相同：解析当前消息中的 ComfyUI context、校验 base model、结合模型与 LoRA 资料重写 Prompt、建立显式 runtime parameters、控制多项请求顺序并报告 `run_id`。

CLI canary Skill 只修改能力调用方式：

| 当前调用 | 新调用 |
| --- | --- |
| `query_semantic_comfyui_templates` | `catalog template resolve --id` |
| `query_semantic_generation_models` | `catalog generation-model resolve --id` |
| `query_semantic_loras` | `catalog lora resolve --id` |
| `query_semantic_comfyui_instances` | `catalog instance list` |
| `generate_with_comfyui` | `generation new-key` 后执行 `generation submit --submission-key <key> --stdin` |

Skill 必须保留以下行为：

- 全部 Generation Request 先完成 resolve、兼容性校验和 Prompt 重写；任一项失败时不创建 Run。
- Skill 必须按请求顺序取得一个 `submission_key`，并在提交命令与重试命令中复用该 key。
- 每个 Generation Request 使用一个独立 foreground shell Tool call 提交；Preset 不提供 background shell 参数。
- 多项请求按用户声明顺序提交。
- 后续提交失败时返回已经创建的全部 `run_id`、失败请求和具体错误。
- `generation.submit` 没有返回并通过 parser 验证 `{ accepted: true, run_id }` 时，只要 CLI 已经尝试发送 HTTP request，Skill 必须先使用 `generation lookup --submission-key <key> --stdin` 提交同一 request。该规则覆盖连接重置、HTTP 500、非法 envelope、stdout 截断、CLI 非零退出和 cancellation，不能只识别“response 丢失”。
- lookup 返回 `found: true, preparation: "succeeded"` 时，Skill 必须返回原 `run_id`，并在 Run 已进入后续失败状态时同时报告该状态与错误。
- lookup 返回 `found: true, preparation: "failed"` 时，Skill 必须报告原 `run_id` 和保存的 preparation error，不得把该 Run 解释为 accepted success，也不得再次提交。
- lookup 返回 `found: true, preparation: "pending"` 时，Skill 必须使用同一 key 与同一 request 执行唯一一次 follow-up recovery submit；该 submit 必须加入或恢复同一 preparation。Recovery submit 仍没有可验证结果时，Skill 必须报告 unknown outcome 与 key，不得执行第三次 submit或创建第二个 Run。
- lookup 返回 `found: false` 且原 submit error 的 `retryable` 为 `true` 时，Skill 才能使用同一 key 重试；lookup 返回 `found: false` 且原 error 不可重试时，Skill 必须报告该 error。
- lookup 自身没有返回可验证结果时，Skill 必须报告“Generation submission outcome is unknown”及 `submission_key`，不得分配新 key 或再次提交。只有 CLI 在 HTTP request 前返回本地 `INVALID_ARGUMENTS` 或 `CLI_CONTEXT_UNAVAILABLE` 时，Skill 才能直接报告未发送错误而不 lookup。
- 已成功请求不使用新 key 重复提交。

程序代码只负责确定性的 JSON 参数、协议校验、transport 与 Run 状态。Prompt 重写和 LoRA 语义选择继续由 Skill 执行，不移动到 CLI 或 Host 程序逻辑。

## Canary 物化与终态发布

### 唯一结构化配置源

项目必须新增 `config/product-agent.json`，并把该文件作为 canary Preset 与 CLI 路径的唯一结构化配置源。实验阶段的配置必须列出两个 canary，但不得声明或修改生产 default：

```json
{
  "schemaVersion": 1,
  "presets": {
    "toolCanaryId": "harness-comfyui-tool-canary",
    "cliCanaryId": "harness-comfyui-cli-canary",
    "targetId": "harness-comfyui",
    "sourceRootRelativePath": "agent-presets",
    "installRootRelativePath": ".agent-presets"
  },
  "skillSources": {
    "legacyRelativePath": ".agents/skills",
    "cliCanaryRelativePath": "agent-presets/harness-comfyui-cli-canary/skills",
    "targetRelativePath": "agent-presets/harness-comfyui/skills",
    "installRootRelativePath": ".harness-comfyui/skill-roots"
  },
  "cliExecutableRelativePaths": {
    "posix": "scripts/cli/harness-comfyui",
    "windows": "scripts/cli/harness-comfyui.cmd"
  }
}
```

`scripts/production/runtime.mjs`、status/health 与对应测试必须读取同一个配置对象，并从 root path 与三个 Preset ID 计算 source/install path，不能分别复制 Preset ID、安装路径、Skill path 或平台 CLI launcher path。CLI route、command grammar 与 JSON envelope 必须只由 `src/cli/contract.ts` 的结构化常量定义。Tool presentation 必须只由各 canonical `agent.cordis.yml` 中的 `tool-presentation` row 定义。程序不得把 Markdown 作为结构化输入。

实验版本的 `config/product-agent.json` 不包含 `productionDefaultPresetMigration`。未来获授权的正向 release 必须以下封闭对象作为唯一 default migration source：

```json
{
  "productionDefaultPresetMigration": {
    "version": 1,
    "fromPresetId": "standard",
    "toPresetId": "harness-comfyui"
  }
}
```

回退 patch 只能把该对象替换为 `{ "version": 2, "fromPresetId": "harness-comfyui", "toPresetId": "standard" }`。Runtime、status 与 health 不得从其他字段或 Markdown 推断 default。

`legacyRelativePath` 指向完整的 `.agents/skills` 目录。B 的隔离 root 必须复制该目录当前的四个项目 Skill。C 的隔离 root 必须复制三个不变 Skill，并以 `cliCanaryRelativePath/comfyui-generate` 作为同名 Skill 的唯一 source。`targetRelativePath` 必须在默认切换 release 中已经包含完整四个终态 Skill，runtime 不得从其他 root 填充缺失项。所有项目 Preset 都使用 `includeDefaultRoots: false`，不继承 DSH 默认或用户全局 Skill root。

### 物化 Module 与调用位置

项目必须新增 `scripts/profile/agent-preset.mjs`。该 Module 导出 `materializeSourceAgentCanaries(repositoryRoot, dshHome, productAgentConfig)`，并且只执行以下确定性工作：

1. 从两个 canary canonical source 分别读取 `agent.cordis.yml` 与 `preset.yml`。
2. 以原子目录替换方式物化到当前隔离 `dshHome/.agent-presets/<canary-id>/`。
3. 在当前隔离 `dshHome` 下分别物化 B 与 C 的受管 Skill root。
4. 返回两个 Skill root 的绝对路径和当前平台 CLI launcher 绝对路径，供 canary Host 启动环境使用。

同一 Module 还必须导出 `materializeSourceAgentTarget(repositoryRoot, dshHome, productAgentConfig)`。该函数只在获授权的默认切换 release 中执行，并必须按以下顺序完成：

1. 验证 `targetId`、终态 `agent.cordis.yml`、`preset.yml`、完整四-Skill `targetRelativePath`、CLI launcher 与终态受管 Skill 环境键。
2. 在传入 `dshHome` 的同一文件系统中分别建立 Preset 与 Skill root 临时目录，完成文件与结构验证后，再原子目录替换到 `dshHome/<installRootRelativePath>/<targetId>/` 和 `dshHome/<skillSources.installRootRelativePath>/<targetId>/`。
3. 返回终态 Skill root 与 CLI launcher 绝对路径。受管 runtime 必须把终态 root 绑定到 `HARNESS_COMFYUI_SKILL_DIR`，并同时保留 B 的 `HARNESS_COMFYUI_TOOL_CANARY_SKILL_DIR` 与 C 的 `HARNESS_COMFYUI_CLI_CANARY_SKILL_DIR`；三个 key 都必须由 `config/environment-overrides.json` 声明，每个 Preset 只读取自己的 key。

终态 materializer 完成并验证目标目录之前，受管 runtime 不得修改 `settings.yaml.agent-presets.default`。任一 source、staging、原子替换、Skill root 或环境绑定验证失败时，settings 必须保持原前驱值并且 Host 不启动。Preset 或 Skill 目录已完成一个 additive 替换但后续验证失败时，settings 仍不得切换；下次 prepare 必须从 canonical source 重建两个目录。

`scripts/production/runtime.mjs` 与 worktree 已共用 `prepareSourceRuntime()`，因此实验实现不得新增第二套 worktree 专用复制算法。当前阶段只有独立 worktree 的实验 DSH home 可以调用 canary materializer；production runtime 在用户批准生产 canary 前不得调用该 materializer、物化 canary、选择 canary或修改 production default。获授权的生产 canary 阶段只物化显式选择所需的 canary Preset/Skill root，仍不修改 default。获授权的默认切换 release 必须在每次 `prepareSourceRuntime()` 中先调用终态 materializer 并验证 target，再执行 default migration。

实验阶段必须保留 runtime 已有的 Agent Preset default。Canary source 只能在实验 DSH home 中显式选择。只有默认切换 release 获得用户显式授权后，计划执行者才能在终态 Preset/Skill root 物化与验证成功后把 `agent-presets.default` 改为终态 `harness-comfyui`。Canary Host 必须同时注入 B/C 各自的受管 Skill root 环境键，不能用一个 Host-wide root 代替两个 Preset 的隔离 root；CLI canary 的 shell environment contributor 必须把 `DSH_HARNESS_COMFYUI_CLI` 设置为 materializer 返回的 CLI executable path。该值在 shell execution 期间注入，不从模型参数或 ambient environment 读取。

### Canonical source 与运行时信任边界

仓库的两个 canary 目录是实验 canonical source，release/worktree lifecycle 是唯一写入者。`dsh-agent-presets` 的独立 schema 虽然接受多个 configured roots，但当前 `@deepseek-ai/dsh` 的 `profile-boot` 会在 bundle、profile、home 与 CLI patch 合成后追加最终 overlay，并把 `agent-presets.roots` 强制替换为唯一 DSH shipped system root；运行中的 roster 也没有公开的 root registration API。因此，当前公开 Interface 不能增加第二个 project-owned system root，`<DSH_HOME>/.agent-presets` 仍是唯一可用的项目安装 root，并被标记为 user trust。物化后的 canary roster entry 预期必须是 `trust: user`。该 Harness 限制不改变仓库对内容与生命周期的所有权。

每次 canary worktree runtime 准备都必须用 canonical source 重建项目拥有的 canary 安装目录与两个隔离 Skill root。status/health 必须校验两个 Preset ID、`trust: user`、对应文件、对应 Skill root 以及 canonical `tool-presentation` row 的 `mode: native`。生产 status/health 必须同时证明当前生产 default 没有被 canary 物化逻辑改变。用户在 Host 运行期间删除或修改某个 canary 目录时，已建立的 Session 继续使用 standing composition；显式选择该 canary 的新 Session 必须失败，当前生产默认路径继续按原行为工作。

两个 canary Skill root 与终态 Skill root 的三个环境 key 属于受管 Host 环境。实现时必须在 `config/environment-overrides.json` 的同一结构化来源中声明，且每个 Preset 只能读取自己的 root；否则当前 Configuration Profile 的未知 `HARNESS_COMFYUI_*` 门禁会拒绝 Host 启动。

Harness 的 `settings.yaml` 可以覆盖 profile 中的 `agent-presets.default`。Canary 物化逻辑不得修改该值。实验执行者只能在实验专用 DSH home 中显式选择 A、B 或 C；未经用户授权的生产 `settings.yaml` 必须保持当前值。

默认切换 release 获得用户授权后，`config/product-agent.json.productionDefaultPresetMigration` 是唯一结构化 source。正向 `version: 1` runtime 必须在 Host 启动前先完成终态 Preset、终态 Skill root、CLI launcher 与受管环境绑定验证，然后才执行三态幂等合同：当前 `settings.yaml.agent-presets.default` 等于 `fromPresetId` 时原子更新为 `toPresetId`；已等于 `toPresetId` 时 no-op；值缺失、等于第三值、source 无效或写入失败时 Host 不得启动。Migration 不得改变其他 settings 值。Running status/health 必须同时确认终态 Preset/Skill root 存在且来自当前 release source、`toPresetId`、settings default 与 roster `isDefault` 相同，并证明新 Session 能发现终态 CLI `comfyui-generate`。此过程只改变后续新 Session 的默认选择，不得重组已建立 Session。回退 `version: 2` runtime 不重新物化终态 target，必须保留已安装 additive 目录并直接执行同一三态 default 合同。Production-equivalent fixture 必须从只包含 `standard` 的 DSH home 开始，连续运行两次正向 prepare/restart 和两次回退 prepare/restart，并验证第二次均是幂等 no-op，终态物化失败时 settings 保持 `standard`，未知第三值失败。回退 patch 必须保留终态 Preset/Skill additive 目录与已有 C Run。

实验 materializer 必须只拥有传入实验 `dshHome` 下的两个 canary 目录与两个 canary Skill root。获授权的终态 materializer 只额外拥有同一传入 `dshHome` 下的 `harness-comfyui` Preset install 目录与终态 Skill install root。两者都不得修改 DSH shipped preset root、用户主目录的其他 DSH home 或另一个 worktree runtime。

## Client 行为

CLI canary 不调用 `generate_with_comfyui`，因此专用 Tool 的 `presentationMeta` 不会自动产生 inline Generation Tool card。右侧 Generation Runs 与 Media 可以继续从 Run Repository 的 Session/Turn 查询驱动，但这不能证明中列操作能力等价。

Canary 实现必须增加不改变模型 Tool surface 的 `CliGenerationSubmissionLinkProjection`：

1. Client 从当前 Conversation Snapshot 的 settled Bash/Pwsh Tool Result 读取公开 `callId`，并与当前 `sessionId` 一起调用 `GenerationRemoteService.resolveCliSubmissionLink({ sessionId, callId })`。Client 不解析 shell stdout、Agent 回复或 Tool 标题中的 `run_id`。
2. Host 通过 Workspace Registry 确认 Session 的唯一 Workspace，再查询 `generation_cli_submissions(workspace_id, session_id, accepted_call_id)`。当前 history window 仍包含配对 Tool Call 时，Host 必须确认 `callId` 对应唯一 Bash/Pwsh `tool/call` 且数字 Turn 等于 mapping 的 `accepted_turn`；配对 Tool Call 已被裁剪时，Host 必须使用 mapping 中首次 commit 的 `accepted_turn` 与 `accepted_call_id` 恢复链接。映射不存在时返回 `null`；Session、Workspace、Call 或可见 Turn 不一致时返回稳定 link-invalid 错误。
3. 成功结果必须是封闭合同 `{ contract_id: "harness-comfyui-cli-generation-link", contract_version: 1, session_id, turn, call_id, run_id }`。Host 不返回 CLI capability、请求 JSON、路径或凭据。
4. `src/client/workbench/cli-generation-run-link.tsx` 必须把合法结果渲染为当前 shell Tool 行内的 ComfyUI Run 链接，并通过现有 Generation Run projection 聚焦右侧同一 `run_id`。Remote cache key 必须是完整 `(sessionId, callId)`；Session 切换不能复用另一 Session 的结果，组件卸载必须取消未完成请求。
5. 历史窗口中配对 Tool Call 已被裁剪但 Tool Result 仍保留 `callId` 时，Host 必须依赖 durable submission mapping 恢复同一链接；Client 不因 `call === null` 丢弃合法映射。
6. Preparation 失败的 mapping 必须链接到同一个 failed Run 并展示稳定错误；response unknown 不能产生两个链接或两个 Run。

CLI 的 Bash/Pwsh result 仍必须显示 `run_id`。独立视觉审核队员必须验收 B/C 的中列运行定位、点击行为、右列 Run、状态刷新、失败展示与历史重放。B 与 C 都使用 `native` Tool presentation mode；B 使用原 Generation Tool `presentationMeta`，C 使用上述 canary-only projection 达到相同用户操作能力。该 Client Adapter 是能力 Interface 替换的配套实现，不增加或改变模型可见 Tool schema。

## 失败模式

| 错误 | 结果 |
| --- | --- |
| Canary Preset 文件缺失或无法 mount | 显式选择该 canary 的 Session 创建失败；生产默认 Session 不受影响 |
| 运行中删除物化后的 canary | 已有 canary Session 保持 standing composition；显式选择该 canary 的新 Session 失败；生产 default 不改变 |
| CLI executable 不存在 | C 的 Bash/Pwsh 返回明确 CLI unavailable 错误；A 与 B 继续使用旧项目 Tool |
| `DSH_WEB_URL` 或 capability 缺失 | CLI 返回 `CLI_CONTEXT_UNAVAILABLE` |
| capability 无效、已撤销或来自另一个 execution | Host 返回 `CLI_CAPABILITY_INVALID` |
| root Tool Call 缺失或不唯一 | Host 返回 `CLI_EXECUTION_CONTEXT_INVALID` |
| Workspace 未登记或 Session 未附着 | Host 返回 `GENERATION_WORKSPACE_REQUIRED` |
| Catalog timeout 或协议错误 | CLI 返回对应稳定错误码，不创建 Run |
| commit 后 Source timeout 或 preparation 协议错误 | 当前 preparation 路径把同一个 Run 标记为 `failed`；CLI 返回等价稳定错误；Client 显示相同错误 |
| 同一 Session 的相同 `submission_key` 提交不同请求 | Host 返回 `RUN_REQUEST_CONFLICT` |
| transaction 开始前 shell execution 取消 | Host 不创建 Run，返回取消结果并撤销 capability |
| transaction 失败或回滚 | Host 不创建 Run，返回未接受错误 |
| commit 后 submit 没有产生有效成功 envelope | Host 保留已接受 Run；Skill 使用同一 key 与同一 request 执行 lookup 并取得原 `run_id` |
| commit 后 preparation 失败 | 当前 preparation 路径把同一个 Run 标记为 `failed`；lookup 返回同一 `run_id` 与错误；Host 不创建第二个 Run |
| background shell 参数 | Shell Tool 拒绝参数；contributor 不签发 capability；Host 不创建 job 或 Run |

Canary Session 不得静默切换到 direct SQLite、默认实例、旧 Tool 或另一条 transport。实验执行者和操作者只能通过明确选择 A、B、C 或旧 default 完成对照与回退。

## 验收清单

- [ ] `rollout-plan.md` 的 A、B、C 三组能够分别测量 Preset 缩减与项目 Tool 替换，生产 default、5 个 Tool 和旧 Skill 在实验期间保持不变。
- [ ] B 与 C 使用相同 persona、agent instructions、compaction、presentation、模型配置与 Skill catalog；两组只在 5 个项目能力的调用 Interface 上不同。
- [ ] B 的固定 Tool snapshot 包含 5 个项目 Tool；C 的 POSIX snapshot 恰好包含 `bash`、`skill`，Windows snapshot 恰好包含 `pwsh`、`skill`。
- [ ] B 与 C 在首轮、普通后续轮、Skill 调用后、Skill catalog 内容变化后和 compaction 后的 serialized Tool name、description、schema 与顺序分别保持相同。
- [ ] 单一 Host 全局注册 5 个项目 Tool 时可以同时新建 B 与 C Session；两者在首请求前根据 Preset `policyId` 建立不可变的 standing visibility，已建立 Session 不因默认值或其他 Session 变化而重组。
- [ ] Host Plugin 在 canary 阶段继续保留 5 个旧项目 Tool；实验执行者停止选择 C 后不需要恢复旧注册代码。
- [ ] 现有 `.agents/skills/comfyui-generate/` 的内容与行为不变；B 与 C 的 Skill root 彼此隔离且都使用 `includeDefaultRoots: false`。
- [ ] 第一轮 C 的 Source 读取、Workflow preparation、错误与 `run_id` 返回时序等价于当前 `acceptGeneration()`。
- [ ] 新增 CLI 子命令不会改变 C 的 Preset Tool snapshot。
- [ ] 4 个 Catalog/Instance CLI 子命令覆盖成功、无结果、无效 ID、timeout、abort、非零 exit、非法 JSON 与超大响应。
- [ ] CLI 与 Host route 覆盖无效参数、无效 content type、超大 body、缺失 capability、错误 capability 和已撤销 capability。
- [ ] ambient `DSH_HARNESS_COMFYUI_CAPABILITY` 不能覆盖受管 shell environment。
- [ ] foreground shell execution 结束后 capability 立即失效；background shell execution 不能提交 Generation Run。
- [ ] 两个 Session 使用同一 cwd 时不能互用 capability，也不能写入对方的 Run。
- [ ] 同一 Session 使用相同 `submission_key` 与相同请求跨 shell Call、跨 Turn 重试时返回同一 `run_id`；不同请求返回 `RUN_REQUEST_CONFLICT`。
- [ ] 并发 submit、transaction 回滚、HTTP response loss、非法 response、stdout 截断、CLI 非零退出与 lookup 不确定分支都不会创建重复 Run 或丢失已持久化 Run。
- [ ] 同 key replay 与并发竞争在 `created` 状态加入同一个 preparation single-flight；preparation failed 重放同一错误；prepared 或后续状态才返回 accepted success；Host 重启后的 `created` Run 可以由同 key replay 恢复。
- [ ] Lookup `pending` 只允许一次同 key recovery submit，`failed` 报告同一 `run_id` 与 preparation error，`succeeded` 返回原 `run_id`；三条分支都不创建第二个 Run。
- [ ] 一项 Generation Request 首次 submit 后最多执行一次 follow-up submit；`found:false + retryable` 与 `found:true + pending` 分支互斥，follow-up unknown/error 后不执行第三次 submit。
- [ ] 同一 shell Call 的第二个新 submission 返回 `CLI_SUBMISSION_CALL_CONFLICT` 并完整回滚；同 key replay 保持可用；Link resolver 对多行结果返回 link-invalid error。
- [ ] 跨 Turn retry 后，Run 与 submission mapping 仍保存首次 commit 的 Turn 和 shell Call identity。
- [ ] Catalog resolve 失败时 CLI canary Skill 不创建 Run；多项 Generation Request 按声明顺序创建，后续失败不重复提交成功项。
- [ ] CLI command parser 与 CLI-to-Runtime Adapter 覆盖完整封闭合同、omitted/null 规范化、JSON depth、LoRA 数组与 snake_case 到 camelCase 映射。
- [ ] `CliGenerationSubmissionLinkProjection` 只用 Session、shell `callId` 与 durable mapping 恢复链接，不解析 stdout；B/C 中列运行定位、点击行为、右列 Run、状态刷新、失败展示与历史重放具有等价用户操作能力。
- [ ] CLI Run link Remote cache 使用 `(sessionId, callId)`；两个 Session 复用相同 call ID 时不会串链，Session 切换和组件卸载会取消或隔离旧请求。
- [ ] 正常 CLI 路径的 stdout/stderr、Host error 与 Session log 不包含 capability、内部绝对路径、认证信息或完整堆栈；测试主动输出 capability 时，该值在 shell Tool result 后已经失效。
- [ ] production-equivalent fixture 连续执行两次正向 prepare/restart 和两次回退 prepare/restart；settings default 从 `standard` 投影为 `harness-comfyui` 再恢复为 `standard`，第二次均为 no-op，migration 只修改该键，未知第三值拒绝启动，`productionDefaultPresetMigration.toPresetId`/settings/roster 三者的 default 在 health 中必须一致。
- [ ] 从只包含 `standard` 的 production-equivalent DSH home 开始，终态 Preset、完整四-Skill root 与受管环境键必须在 settings 切换前完成物化/验证；任一 target 物化失败时 settings 保持 `standard`，Host 不启动。成功后的新 Session 必须具有 C snapshot 并发现 CLI `comfyui-generate`；回退必须保留终态 additive 目录与已有 C Run。
- [ ] `rollout-plan.md` 的真实 usage、任务成功率、时延、Client UX 与回退门禁全部通过，并且用户显式批准默认切换 release。
- [ ] 独立语义审核队员确认 Preset 文案、CLI help、Skill 文案、错误文案和实验结果具有明确主体、动作与对象。

## 非本次目标

- 本次设计不实现或运行 Agent Preset、CLI transport、Host route 或 Skill 修改。
- 本次设计不修改 `standard`、`minimal`、`code` 或 `router-standard`。
- 本次设计不引入动态 Tool discovery、MCP schema gateway、Router stage 或 logits mask。
- 本次设计不改变 Catalog、Source、ComfyUI remote transport、Workflow compiler 或当前 Generation preparation 的外部语义；待验证终态只增加 Run Repository 的 CLI submission mapping。
- 本次设计不让 CLI 直接访问 Run Repository。
- 本次设计不复用或伪造原 Generation Tool 的 `presentationMeta`；C 使用 `CliGenerationSubmissionLinkProjection` 从 durable submission mapping 恢复中列运行链接。
- 本次设计不修改生产默认 Preset，不删除 5 个项目 Tool，不修改旧 Skill，不发送真实模型请求。
- 本次设计不安装新依赖。
- 本次设计不修改 Harness 上游以增加第二个 project-owned system-trust Preset root。

## 已获得的授权

- 用户已授权在独立 worktree 中抓取文章、分析当前 Tool 注入并设计项目自有 Agent Preset。
- 用户已明确指出 `standard` 的 Tool Interface 不是项目目标，并明确要求评估移除当前 5 个项目 Tool。
- 用户已明确拒绝没有效果测试的破坏性升级；当前授权不包含直接迁移、修改默认值、删除旧 Tool 或修改旧 Skill。
- 用户没有授权本次任务修改生产 checkout、实现源代码、发送真实 Provider 请求、启动 Host、提交、推送、发布或部署。

## 最终判断

当前发布判断是 **NO-GO：项目不得直接采用零项目 Tool 的 `harness-comfyui` 作为默认 Preset**。

项目自有固定 Preset 是合理的实验方向：它比选择 `router-standard` 更能落实文章关于 serialized Tool surface 稳定的结论。B=`项目 Preset + 5 Tool` 与 C=`项目 Preset + CLI` 必须先证明模型任务成功率不劣、真实 token/cache 成本下降、时延不退化、Client 操作能力等价且回退有效。只有这些证据和用户显式批准同时存在时，C 才能成为默认候选；旧 Interface 的删除仍然不在当前授权内。
