---
文档用途: 提交基于生产根因调查的 ComfyUI 生成流程修复方案，明确接口、实施范围和验收要求。
读取时机: 审批修复范围，以及实施和验收前。
---

# ComfyUI 文件生成、状态查询与媒体登记修复方案

## 1. 名词定义

1. Generation Run、Generation Media、Saved Media 和 Workspace 使用 [CONTEXT.md](../../CONTEXT.md) 的定义。Generation Request 使用 [GenerationRequest](../../src/host/generation/generation-runtime.ts) 的字段定义。
2. 提交清单、批次和 `request_id` 使用 [CONTEXT.md“生成记录与媒体”](../../CONTEXT.md#生成记录与媒体)的定义；`call_id` 的职责见 [ADR 0005 第 2 节](../adr/0005-harness-identities-and-generation-run-ownership.md#2-请求身份与重放)。
3. 本方案将 Generation Run Media Query 简称为“轻量查询”，将 Generation Run Input Query 简称为“历史输入查询”；两者使用 [CONTEXT.md“生成记录与媒体”](../../CONTEXT.md#生成记录与媒体)的定义。

## 2. 总目标

1. Agent 通过受管 CLI 完成提示词文件交接、批量提交、状态查询和单项重做。生成结果按所属会话进入媒体面板。
2. Host 持久保存已接纳请求，并在调用结束或应用重启后继续执行。调用者重复提交同一请求时取得原 Run。
3. Agent 在首次使用、压缩后续聊和子会话中，都能发现并执行上述流程。验收以实际调用轨迹、Run 记录和官方界面显示为依据。

## 3. 现状调研

### 3.1 证据与版本

1. [根因调查报告](../research/generation-entry-root-cause-20261028.md)保存事发版本、完整调用顺序、受控验证与结论边界。本方案以该报告为事实依据。
2. 事发版本为 0.48.0，根因对照使用 0.48.1 源码。当前方案基线为 0.49.0，对应提交 `c23129b5b51906015a8fd6c6fc7f6110cbe690a7`，与已核对的远端 `main` 和 `v0.49.0` 标签一致。
3. [验证结果](../verification/generation-batch-20261028/root-cause-probe.json)确认：文件提交已经可用；同一调用身份提交不同请求发生冲突；排队、运行和失败状态的取图结果相同。[基线对照](../verification/generation-batch-20261028/baseline-0.49.0.json)确认，0.49.0 保留了参与该验证的生成代码和 Skill。
4. 本方案工作目录为 `/Users/fzfz/.codex/worktrees/generation-batch-investigation/harness-comfyui`，分支为 `codex/generation-batch-investigation`。

### 3.2 当前可复用的能力

1. [受管 CLI](../../scripts/cli/harness-comfyui.mjs)已支持标准输入和结果文件。[CLI route](../../src/host/cli/route.ts)已从宿主调用凭证取得 Workspace、Session、Turn 和 Tool Call 身份。
2. [Generation Runtime](../../src/host/generation/generation-runtime.ts)已保存请求、状态和错误，并统一登记媒体。[coordinator](../../src/host/generation/generation-coordinator.ts)已支持推进 `created` 状态的 Run。
3. [Workflow compiler](../../src/host/generation/workflow-compiler.ts)已提供参数发现、类型约束和编译校验。生成输入继续使用该能力。
4. [会话结果服务](../../src/host/generation/generation-service.ts)与媒体面板已读取 Run Repository。当前版本已移除事发时的内联业务工具，并随插件交付业务 Skill。

### 3.3 Goal 与开发验收基线

1. 当前[共享组合](../../agent-presets/shared/agent.cordis.yml)已接入宿主原生 Goal。[工作台 persona](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml)定义创建、续跑、暂停、恢复和完成条件；本方案沿用这些约定。
2. 独立开发环境的默认模型和凭据来源由 [config/desktop-e2e.json](../../config/desktop-e2e.json)定义。本任务按用户指定采用 `lan-gpt/gpt-6.1-terra` 与 `high` 推理级别；验收配置从共享配置派生。已有 Profile 的保留规则见 [worktree 开发规范](../agents/worktree-development.md#交互调试)。
3. [0.49.0 验收记录](../verification/comfyui-workbench-goal/README.md#4-提交未通过项)保存两项失败：已结束子会话的 Skill 列表不符合预期；停止重启后的应用时出现 `PROCESS_IDENTITY_CHANGED`。本任务验收须分别复核并记录结果。

## 4. 面临的问题

1. 调查已验证 Skill 文件交接与批量请求身份存在限制；事发模型未读取生成 Skill，也未调用受管 CLI。

   | 问题 | 当前状态及影响 | 本次处理 |
   | --- | --- | --- |
   | 0.48.0 的 persona 指向 CLI，工具列表仍提供内联生成工具 | 0.48.1 已完成工具移除；历史上下文仍可能影响续聊。 | 保持当前入口，补齐任务阶段指引及首次使用、续聊和子会话验收。 |
   | 生成 Skill 强制要求消息内的十字段 Prompt Builder JSON | MOSS 的文本文件无法直接交接，Agent 需要重新组织输入。 | 生成边界接收实际 Workflow 参数与提示词文件，提示词格式由各 Builder 负责。 |
   | Run 请求身份与 `call_id` 一对一绑定 | 同一脚本无法创建多个独立 Run；跨调用重试会创建新 Run。 | 增加持久 `request_id`，统一接纳单项和多项清单。 |
   | 取图结果省略执行状态和错误，并始终返回完整参数 | Agent 难以判断等待、失败与完成，查询还会带回长提示词。 | 扩展现有取图查询，默认返回轻量结果，按需返回参数。 |
   | 事发版本的真实模型验收未覆盖连续生成全过程 | 0.49.0 已增加 Goal 验收；本次文件批量生成仍需独立验证。 | 增加真实模型执行、单项重做和媒体显示的验收门槛。 |

## 5. 问题的解决和实施方案

### 5.1 架构与责任边界

1. 受管 CLI 作为 Agent 的生成入口。Generation Runtime 作为请求接纳、状态保存和媒体登记的唯一服务。批次在提交层分组，执行仍以 Run 为单位。
2. Agent 负责提示词含义、资源选择、尺寸意图和重做决定。CLI 负责文件读取、结构校验和结果输出。Workflow compiler 负责实际参数约束；coordinator 负责异步执行。
3. 实施者按以下数据流组织改动。

   ```mermaid
   flowchart TD
     A[用户要求与 Prompt Builder 产物] --> B[Agent：选择资源与参数，保存提交清单]
     B --> C[受管 CLI：读取清单和提示词文件]
     C --> D[Host：验证调用身份，事务接纳请求]
     D --> E[接纳结果文件：request_id 与 run_id]
     D --> F[现有 coordinator：逐项准备和执行]
     F --> G[ComfyUI]
     G --> H[现有下载与媒体登记]
     H --> I[Run Repository]
     D --> I
     I --> J[轻量查询：状态、错误与媒体路径]
     I --> K[历史输入查询：参数与 Actual Workflow]
     I --> L[所属会话的媒体面板]
     J --> B
     K --> B
   ```

### 5.2 提示词文件与生成输入

1. `generation submit` 统一接收 `items` 数组。单项生成使用一项数组。每项包含必填的 `request_id`、`request`，以及可选的 `parameter_files`。
2. `request` 复用当前 CLI 的模板、实例、模型、LoRA、标题和参数字段。`parameter_files` 是从 Workflow `parameter_id` 到本地 UTF-8 文件路径的映射，用于文本参数。
3. CLI 将文件正文写入对应参数，再将完整请求交给 Host。同一参数同时出现在 `request.parameters` 和 `parameter_files` 时，CLI 拒绝该清单并指出重复项。
4. 提交命令提供互斥的 `--file <清单路径>` 与 `--stdin`。`--file` 中的相对引用按清单所在目录解析；`--stdin` 中的文件引用使用绝对路径。
5. CLI 原样读取文本，保留换行和 MOSS Layout 的 JSON 文本。CLI 在全部文件读取、编码和请求体大小校验通过后发送请求。读取失败时，错误包含项序号、参数名和文件路径。
6. 生成 Skill 接受当前消息、当前任务已有产物或用户指定文件。Agent 先读取模板参数及其约束，再将输入内容映射到对应参数。缺少模板、尺寸意图或其他会改变生成结果的信息时，Agent 只询问缺失信息。
7. 各 Prompt Builder 保留自身的创作与编译合同。结构化产物中的字段可由程序提取；负向表达、LoRA 触发词与画面含义由 Agent 判断。需要调整内容时，Agent 先形成符合对应 Builder 合同的提示词产物。
8. 实施者删除生成 Skill 对 `prompt-result-contract.md` 和 `prompt-result-schema.json` 的强制依赖，并删除这两份被替代的文件。实施者更新 `template-parameter-inspection-cli.md`，将尺寸来源改为用户要求与提示词产物。生成 Skill 执行者继续使用 Workflow 参数发现与约束确定尺寸参数。
9. 执行者将提交数量与传输字节上限集中到受管 CLI 配置，默认值分别为 20 项和 1,048,576 字节。CLI、Host 和帮助使用同一配置；字节上限作用于文件展开后的请求。

### 5.3 请求身份、接纳与重做

1. Host 从已验证的调用凭证取得 Workspace、Session、Turn 和 `call_id`。请求正文中的 `request_id` 只参与去重，Run 归属继续由宿主身份确定。
2. Runtime 以 `(workspace_id, session_id, request_id)` 建立唯一约束。相同标识、相同规范化请求返回原 Run；相同标识、不同请求返回 `RUN_REQUEST_CONFLICT`。请求比较复用现有规范化 JSON。
3. Host 先校验整批结构、数量和清单内重复标识。Runtime 在同一事务内检查已接纳请求冲突并保存新 Run。任一接纳校验失败时，本次清单新增的 Run 数为零。
4. 接纳响应按输入顺序返回 `request_id`、`run_id` 和 `acceptance`。`acceptance` 的值为 `accepted` 或 `reused`。事务提交后即可返回；Workflow 准备移交现有 coordinator。准备失败保存在对应 Run，其他 Run 继续执行。
5. 相同请求的重放始终返回原 Run，包括准备失败和生成失败的 Run。调用者通过轻量查询读取执行结果。响应丢失、输出文件写入失败或 Host 重启后，调用者使用原清单安全重试。
6. Agent 在首次提交前保存清单、已确定的 Seed 和对应提示词产物。重试时保持这些输入不变；文件内容改变而标识未改变时，按第 2 项返回冲突。
7. 修改参数后重做，或明确要求相同参数再生成时，Agent 为该项保存新的 `request_id`。成功项继续使用已有 Run。`submission_unknown` 的 Run 保持结果不明状态；用户确认可能重复执行后，Agent 才创建替代请求。
8. 数据库事务与唯一约束处理并发接纳。前台调用结束后，已提交事务中的请求由 Host 继续处理。

### 5.4 Run 状态与媒体查询

1. 扩展现有 `generation resolve-media --stdin`。输入保留 `run_ids`，增加可选布尔值 `include_parameters`，默认值为 `false`。
2. 查询成功项返回 `run_id`、`request_id`、`lookup_status`、`title`、`status`、`revision`、`updated_at`、`instance_id`、`prompt_id`、`run_error` 和 `images`。`run_error` 为错误码与消息，或 `null`。
3. `status` 直接复用 Runtime 状态定义。准备、排队、运行、下载、失败、取消和结果不明均可区分。`lookup_status: available` 只表示找到记录。
4. 查询失败继续使用逐项 `lookup_status: error` 与 `error`。执行错误由 `run_error` 表达；非终态下的观察错误保留当前执行状态，Agent 按该状态决定继续查询。
5. 默认查询只读取 Run 与媒体记录。`include_parameters: true` 时，查询再返回保存的 `parameters`。`comfyui-image-review` 显式使用该选项；复用 Seed 或读取 Actual Workflow 继续使用 `generation run-inputs`。
6. 查询结果沿用文件输出。生成 Skill 按 Run 状态等待或报告失败，向模型上下文提供状态摘要和交付所需路径。Host 持久记录继续作为状态依据。
7. CLI 查询保持当前 Workspace 查询范围。会话媒体面板保持当前 Session 与后代会话的访问规则，直接消费现有登记结果。

### 5.5 入口发现与任务交付

1. 工作台 persona 明确任务阶段：设计提示词时读取适用 Builder；创建图片时读取 `comfyui-generate`。已经生成的文件路径随任务继续传递。
2. 生成 Skill 的首个提交步骤指向自身 CLI 参考。参考提供受管可执行入口、命令帮助、文件提交示例与逐项结果读取方法。参数细节留在参考中。
3. 生成 Skill 按用户目标区分完成条件。用户只要求排队时，交付已接纳 Run；用户要求图片时，继续查询至目标 Run 完成或出现需要处理的失败，并交付媒体与 Run ID。
4. Skill 在续聊时复用已保存清单、请求标识与 Run ID；主会话读取子会话结果时保留原 Run 归属。CLI 提交结果与帮助给出轻量查询的后续命令。
5. 用户明确提出 Goal 请求时，Agent 按第 3.3 节引用的 persona 约定执行。Goal 恢复后的批量任务按第 5.3 节处理请求重放，按第 5.4 节查询已有 Run。

### 5.6 持久数据与改动范围

1. 数据迁移将已有 Run 的 `run_id` 写入新增的 `request_id` 字段。Agent 为迁移后首次提交的请求按第 1 节生成 UUID。
2. 迁移移除 `call_id` 的唯一约束，保留原 Run ID、调用来源、状态、Workflow、媒体记录和文件路径。迁移在单次事务中完成，并通过数据库副本验证后交付。
3. 实施者按以下范围修改源码与消费者。

   | 范围 | 主要文件或目录 | 产物 |
   | --- | --- | --- |
   | 清单输入与文件读取 | `src/cli/contract.ts`、`scripts/cli/harness-comfyui.mjs`、`config/managed-cli-help.json` | 单一清单合同、文件展开、错误与渐进式帮助。 |
   | 接纳与迁移 | `src/host/cli/dispatch.ts`、`src/host/generation/generation-runtime.ts` | 批量事务、请求身份迁移、coordinator 接续。 |
   | 状态查询 | `src/generation/`、`src/image-reader/run-media-contract.ts`、Runtime 查询及 CLI 消费者 | 轻量结果、可选参数、共用的状态字段定义。 |
   | Agent 流程 | 工作台 persona、`comfyui-generate` 正文与参考、`comfyui-image-review` 正文与参考 | 文件交接、状态处理、明确的完成条件。 |
   | 架构与验收 | `CONTEXT.md`、架构和配置文档、ADR 0002、0005、0008、0010，以及对应测试 | 与代码一致的身份、异步接纳、查询说明和验收证据。 |

4. 实施者删除被替代的单请求传输结构、按 `call_id` 去重路径和过时 Skill 引用，并更新全部实际消费者。
5. 本方案复用现有依赖与 MOSS 编译脚本。项目 Skill 目录中的脚本、全局 Skill 链接和官方 Desktop 应用源码保持原状。

### 5.7 实施步骤

1. 实施者按 TDD 固定根因回归场景：同一 shell 提交多个请求，以及不同 Run 状态返回可区分结果。
2. 实施者完成第 5.2 至 5.3 节及数据迁移，验证从提示词文件到持久 Run 的完整流程。
3. 实施者完成第 5.4 节及实际消费者，验证从 Run 状态到媒体交付的完整流程。
4. 实施者完成第 5.5 节及文档清理，按 `skill-creator`、`writing-for-agents` 和项目规范审阅 Skill。
5. 实施者完成第 7 节的确定性测试、官方 Desktop 与真实模型验收，并保存实际执行证据。

## 6. 方案待决策项清单

1. 第 3.3 节指定的模型或第 7.3 节指定的实例不可用时，执行者报告不可用对象及原因，等待用户选择替代模型或实例。

## 7. 计划验收清单

### 7.1 接口、身份与恢复

1. **文件交接**：纯文本、多行文本与 MOSS Layout 文件均保留原文。覆盖相对路径、绝对路径、缺失文件、无效编码、重复参数和展开后超限。提交输出不包含提示词正文。
2. **数量与原子接纳**：验证 1、11、20 项；拒绝 0、21 项。清单内重复标识、参数结构错误或既有请求冲突均新增零项 Run。
3. **去重与单项重做**：同一 shell 的独立请求分别创建 Run；同参数不同标识分别创建 Run；跨调用重放复用原 Run；只重做指定项时，仅增加一个 Run。
4. **接纳结果恢复**：覆盖并发重放、响应丢失、输出文件保存失败、调用中断和 Host 重启。逐项核对请求标识与 Run 数量。
5. **异步失败**：覆盖准备失败、远端失败、下载失败、观察暂时失败和 `submission_unknown`。核对状态、错误、其他项的执行，以及明确重做前的远端提交次数。
6. **轻量与历史查询**：逐一覆盖 Runtime 全部状态。默认结果无 `parameters` 与 Workflow；显式参数查询及历史输入查询保留所需内容，现有图片审阅流程可执行。
7. **迁移与归属**：在数据库副本中核对全部 Run、媒体数量、文件路径、外键和状态。验证迁移失败回滚及再次启动，并覆盖主会话、子会话和其他 Workspace 的访问边界。
8. **Goal 生命周期**：复用已有 Goal 受控验收，增加批量请求断言。暂停或轮次耗尽后，已接纳 Run 继续执行；用户恢复 Goal 或重启后恢复任务时，查询和重放均保持原 Run 数量。

### 7.2 官方 Desktop 与真实模型调用

1. 执行者先完成 `pnpm test:desktop`，再按 [worktree 开发规范](../agents/worktree-development.md)启动独立 development probe。应用生命周期、数据隔离和清理遵循该规范与[测试规范](../system/testing.md)。
2. 产品验收采用第 3.3 节的共享开发模型。基线采用第 3.1 节的固定提交，候选采用本次插件代码。两组使用相同模型配置、任务、11 份长提示词文件和受控 ComfyUI 服务。测试输入中的地址、目录记录和历史摘要统一指向受控服务。
3. 验收覆盖下表场景。每个场景在基线和候选中各执行三次，保存每次结果。

   | 场景 | 任务条件 |
   | --- | --- |
   | 首次文件生成 | 提示词文件已存在，模型从任务要求开始执行。 |
   | 压缩后续聊 | 上下文包含历史 HTTP 操作摘要和已有任务产物。 |
   | 失败处理 | 已知 Run 出现可查询的执行失败。 |
   | 子会话交接 | 主会话接收子会话保存的提示词文件。 |
   | Goal 恢复 | 用户明确建立持续目标；暂停或重启后恢复时，已存在批量 Run。 |

4. 验收用的独立 Agent 只取得明确的工作目录、被测 Skill 路径和任务参数。主 Agent 在执行期间观察轨迹，不追加提示。任务输入不提示改用 CLI，也不包含本方案或根因结论。
5. 候选每次均须通过受管入口完成对应任务。验收逐项确认 Skill 与参考读取、文件提交、Run 查询和交付，并核对普通请求与 Goal 请求的完成条件。任何绕行或提前交付均记录为失败，并回到首次偏离位置调查。
6. 验收分别统计提示词创作与审阅、提交、等待三个阶段的正文字符数及工具调用数。已存在提示词文件的提交和等待阶段，CLI 参数与默认结果中的提示词正文字符数须为零。模型 Token 用量按实际报告记录。
7. 接口与模型选择的单变量对照采用第 3.3 节指定的模型。每次只替换入口指引、文件交接、查询返回或批量接纳中的一项，其余条件保持一致。验收者通过受控服务重放，分别报告接口行为与模型选择。
8. 对照结果按实际模型身份记录。原事故模型的行为结论仍以根因调查报告中的历史证据为范围。

### 7.3 真实 ComfyUI 与媒体显示

1. 完成受控验收后，候选按[真实生成资源记录](../verification/generation-batch-20261028/real-comfy-resources.json)中的模板、生成模型和实例提交一批 11 项请求。Agent 随后重做其中一项。该轮最多创建 12 个新 Run；重放原清单时新增 Run 数须为零。
2. 验收者逐项比对清单、Run、远端 `prompt_id`、Actual Workflow、媒体文件与所属会话面板。核对重启后仍可查询和显示，并验证成功项保留原记录。
3. 验收证据保存到 `docs/verification/generation-batch-20261028/`。内容包括版本、模型、请求输入、工具声明、完整调用轨迹、状态变化、图片路径和界面记录。
4. 实施者完成独立文字审阅与代码审阅后，对最终候选树运行 `pnpm quality` 和 `git diff --check`。最终验收记录分别报告自动化、真实模型和真实 ComfyUI 的结果。
5. 验收者单独列出第 3.3 节的基线失败与候选失败。仍失败的门禁项保留失败状态；门禁例外须取得本任务的单独批准。

## 8. 非本次目标

1. 发布、合并、生产安装、生产数据库迁移执行和旧环境处置属于后续独立任务。
2. 历史 HTTP 图片导入、远端全局任务接管、网络访问限制和其他 Prompt Builder 编译器改造另行定义需求。

## 9. 已获得的授权

1. 用户已授权独立 worktree、生产只读调研、根因调查和方案设计，并已确认调研与撰写范围。
2. 用户已通过 `implement` Skill 授权实施、测试、独立审查和当前分支提交，并指定内网 `gpt-6.1-terra`、`high` 完成真实模型测试与验收。真实 ComfyUI 生成数量遵循第 7.3 节。
3. 用户已批准第 5 节的文件交接、统一清单、请求身份和轻量查询设计，以及数据库迁移代码和副本测试。
