---
文档用途: 定义由 Harness Agent 执行业务任务的实验工作台架构、界面映射与实施验收条件。
读取时机: 实施实验工作台、核对原型操作的后端接口或验收 Agent 与页面协作时。
---

# Harness ComfyUI 实验工作台设计

## 1. 领域名词与关系

### 1.1 界面与业务对象

1. 本节定义本方案及[交互原型](../../prototype/experiment-workbench/index.html)使用的业务名词。表中的界面名称用于页面、按钮、说明和方案引用。Workspace、Session、Generation Run 的既有定义见 [CONTEXT.md](../../CONTEXT.md)。

   | 界面名称 | 对象标识 | 概念与归属 |
   | --- | --- | --- |
   | 工作台 | 工作台前端 | 管理工作区内的工作、分支、任务、运行记录和经验的界面。 |
   | 工作区 | Workspace | 沿用官方 Workspace；工作区选择器显示名称与项目目录。 |
   | 工作 | Work | 工作区内的一个创作目标，保存名称与总目标。例如“雨后玻璃花房”。 |
   | 分支 | Branch | 工作内的一条探索方向，保存名称、原始需求和任务输入草稿。例如“暖光探索”。 |
   | 任务 | Task | 在一个分支上向 Agent 发起的一次明确委托，保存任务类型、固定输入、执行配置、状态和产物。 |
   | 运行记录 | Generation Run，简称 Run | 沿用既有生成记录。工作台发起的 Run 关联唯一任务，并保存该次实际生成输入、状态、媒体和错误。 |
   | 任务产物 | TaskArtifact | Agent 提交给任务的结构化结果，如提示词、参数建议、资源候选、评价或经验。 |
   | 评价 | Run 的评价字段 | 用户保存的运行观察、结论与目标达成判断。Agent 的 `review` 产物可回填评价草稿；持续实验使用任务产物中的逐轮评价。 |
   | 经验 | Experience | 带适用条件、底模、生成模型和 Run 证据的结论。归属产生证据的工作与分支，由用户编辑后保存；Agent 可提供草稿。 |
   | 收藏 | Favorite | 用户保存的 Run 或经验引用。收藏列表按被引用对象确定所属工作。 |

### 1.2 输入与执行配置

1. 下表区分用户要做的事情、生成工具使用的数据和 Agent 的执行配置。

   | 名称 | 含义与保存位置 |
   | --- | --- |
   | 原始需求 | 分支要完成的画面目标，保存于 Branch。 |
   | 任务要求 | 用户对某次委托的具体要求。提交前按分支与功能保存，提交后进入 Task。 |
   | 任务输入 | 本次委托需要的需求、提示词、生成输入、资源引用、参考运行 ID 和运行次数。提交前保存在分支草稿；提交时固定到 Task。 |
   | 评价与经验草稿 | 所选 Run 的待编辑内容，包含观察、评价结论、经验标题、适用条件和经验结论。人工输入与 Agent 回填共用此草稿。 |
   | 提示词 | 正向提示词与负向提示词文本。任务使用 `prompt_input` 保存这两项；生成时按 Workflow 模板参数描述映射到生成输入。 |
   | 生成输入 | 生成工具使用的实例、Workflow 模板、生成模型、LoRA、提示词和参数数据。具体字段见第 5.3.1.2 节。 |
   | 运行输入 | 某个 Run 实际使用的生成输入，随该 Run 固定保存。页面通过“查看运行输入”读取。 |
   | 底模 | 资源目录中的模型系列，用于手动筛选模型、模板和 LoRA。例如 ANIMA3。 |
   | 生成模型 | ComfyUI 生成图片使用的模型资源，通过资源 ID 和文件名选择。 |
   | Workflow 模板 | 目录中可执行的 ComfyUI 工作流及其参数描述，通过模板 ID 选择。 |
   | 参考图路径 | 生成时使用的图片文件路径，保存于任务输入草稿，并映射到模板的图片参数。 |
   | 参考运行 | 任务使用的已有 Run ID，由用户选中的运行卡片确定。Agent 按 ID 读取历史输入与媒体。 |
   | 参考上下文 | 目录中的作品、角色、画风、提示词条目和画师串引用，每项保存资源类型与 ID。 |
   | Agent 预设 | 官方宿主注册的 Agent 执行组合，包含提示词、Skill、工具、MCP 与子 Agent。Agent Studio 编辑自建组合。 |
   | Agent 模型 | 执行 Agent 推理使用的提供商、模型与推理等级。由官方 Session 接口选择。 |
   | 功能配置 | FunctionBinding。工作区内一个前台功能的当前配置，保存名称、任务类型、Agent 预设、Agent 模型、指定 Skill 与执行要求。 |
   | 执行要求 | 功能配置中的 Agent 业务步骤，使用 `{{task_id}}` 指明任务。业务输入通过任务工具读取。 |
   | 执行会话 | Session。在官方 Harness 中执行任务的对话；一个任务创建一个执行会话，继续任务时沿用原会话。 |
   | Skill | Agent 按需读取的业务指令及配套资源，由宿主提供目录和正文。 |

2. “运行任务”使用当前任务输入创建单次生成任务。其执行方式显示为“运行一次”。“持续实验”是另一种任务类型，允许 Agent 根据每轮结果调整下一轮输入。
3. 持续实验的每轮包含一个 Run 及其评价。任务保存初始输入；每个 Run 保存当轮实际输入；下一轮候选作为该任务的 `generation_input` 产物保存。

### 1.3 从属关系与数量关系

1. 对象按以下关系组织。

   ```mermaid
   flowchart TB
     WS[工作区] -->|0 至多个| W[工作]
     W -->|1 至多个| B[分支]
     B -->|0 至多个| T[任务]
     B -->|0 至多个子分支| CHILD[子分支]
     T -->|0 至多个| A[任务产物]
     T -->|0 至多个| R[运行记录 Run]
     R -->|提供证据| E[经验]
     F[收藏] -->|引用| R
     F -->|引用| E
   ```

2. 每个工作创建一个主分支。主分支的父分支为空；子分支保存唯一 `parent_branch_id`。子分支可继续派生，构成树。每个分支固定属于一个工作。
3. 创建子分支时，输入来源为选中 Run、选中任务产物或父分支草稿。来源分别保存为 `source_run_id`、`source_artifact_id` 或父分支引用。创建后，子分支独立编辑和运行；来源记录继续保留。
4. 每个任务固定属于一个分支。提示词、参数建议、资源推荐、评价和经验任务产生 0 个 Run。单次生成任务最多接纳 1 个 Run；持续实验任务最多接纳用户指定数量的 Run。提交前失败的任务可能有 0 个 Run。
5. 对同一次失败运行点击“重试任务”，会创建新的 Task 和 Run，并保存 `retry_of_run_id`。原 Task、失败 Run 与错误继续可查。
6. 同一个任务可以产生多个产物。只有持续实验允许多轮生成输入；每轮输入都能通过所属任务和 Run 定位。
7. 配置中心按功能选择执行组合。任务创建时保存所用配置，后续编辑影响后续任务。工作区、工作、分支与 Task ID 用于业务归属；Session ID 用于会话执行和访问校验。

### 1.4 页面位置与对象

1. 三栏及导航各自承担以下职责。

   | 页面位置 | 展示与操作对象 |
   | --- | --- |
   | 顶栏 | 添加、选择工作区；进入配置中心。 |
   | 工作栏 | 创建、选择工作；切换运行结果、资源、任务、经验与收藏。 |
   | 左栏 | 当前工作的完整分支树；选中分支决定任务与运行的归属。 |
   | 中栏 | 所选 Run 的结果、状态与所属任务；下方卡片列出当前分支的全部 Run。 |
   | 右栏 | 当前分支的任务输入；查看历史 Run 时切换为只读运行输入。 |
   | 任务页 | 当前工作的任务及其输入、状态、产物与关联 Run。 |
   | 配置中心 | 当前工作区的功能配置及自定义功能。 |

2. 各功能的按钮名称与产物对应关系见第 5.3.1.3 节。

## 2. 总目标

1. 用户通过原始需求驱动创作。Agent 负责理解需求、选择 Skill、组织资源、编写提示词、评价结果和决定迭代方向。
2. 工作台负责发起任务、展示产物、保存业务关系和回溯来源。参数编辑、收藏、分支创建等明确操作直接调用业务接口。
3. 前台功能按配置中心的绑定调用 Agent 组合，完成单步任务、单次运行或持续实验。全部生成经现有受管 CLI 提交，共用 GenerationRuntime。

## 3. 现状调研

1. 外部仓库的固定提交研究见 [NovelAIPromptStudio 调研](../research/novelai-prompt-studio-architecture.md)。本仓库既有能力及来源见[现状调研](../research/harness-comfyui-workbench-current.md)。
2. 当前 Preset 已提供官方 Agent、Skill、子 Agent、NoobAI MCP 和受管 CLI。提示词 Builder 已能返回结构化产物；图片审阅 Skill 已能依据 Run 输入和图片观察提出修改。
3. 当前生成提交来自前台 Tool Call，Generation Remote 提供结果查询。工作台将按钮请求转为 Task，再沿用该生成提交路径。
4. 官方 Session 创建、模型选择、任务投递和 Skill 列表在仓库 Desktop 测试中有调用用例。Host 公共 Agent 接口提供创建、消息投递和取消能力。证据索引见现状调研第 7 节。
5. 当前输入合同见[Agent 输入调研](../research/harness-agent-input-contract.md)。`workbench task get/publish`、Workbench Remote 与生成清单根级的 `workbench_task_id` 均为计划扩展，尚未与官方 Agent 联调。

## 4. 面临的问题

1. 聊天中的原始需求、Skill 产物和生成请求尚未关联到工作台的分支和任务。用户难以按探索方向回溯。
2. 页面缺少统一的任务入口与结构化产物接收接口，提示词和评价仍停留在对话中。
3. Agent 执行期间，用户可能修改生成输入或切换分支。返回产物需要固定目标并核对当前字段值。
4. Agent 回合结束、Skill 读取完成、图片生成完成分别代表不同状态。工作台需要分别显示业务任务与 Generation Run 的进度。

## 5. 问题的解决和实施方案

### 5.1 总架构图

1. 总图展示模块边界与主要调用关系。通信方向与协议见第 5.3.2 节。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear", "nodeSpacing": 40, "rankSpacing": 45}}}%%
   flowchart TB
     UI["工作台前端<br/>工作区 · 工作 · 分支"]
     WB["工作台业务模块"]
     HA["官方 Harness<br/>Workspace · Agent · Session"]
     CAP["资源与生成能力<br/>Catalog · GenerationRuntime · Image Reader"]
     DATA[("业务存储<br/>共享 SQLite · 产物文件")]
     EXT["资源数据源 · ComfyUI"]
     UI <-->|Remote RPC| WB
     WB <-->|模型选择 · 任务投递 · 业务读写 · 状态事件| HA
     WB --> CAP
     HA -->|MCP 与受管 CLI| CAP
     WB -->|业务记录| DATA
     CAP -->|Run 与媒体| DATA
     CAP --> EXT
   ```

2. 各模块的职责和建设范围如下。

   | 模块 | 职责 | 建设范围 |
   | --- | --- | --- |
   | 工作台前端 | 组织输入、发起任务、展示结果与来源。 | 扩展现有工作台，复用目录组件。 |
   | 工作台业务模块 | 管理工作、分支、生成输入、任务、实验与经验；生成任务请求并接纳产物。 | 新增 WorkbenchService、请求生成与产物接纳能力。 |
   | 官方 Harness | 提供 Workspace 名册与目录管理；按预设运行 Agent，管理 Skill、子 Agent、Session 与等待通知。 | 复用官方工作区服务，通过 HarnessAgentAdapter 接入任务。 |
   | 资源与生成能力 | 查询资源、准备 Workflow、执行生成、读取图片与媒体。 | 复用既有服务，扩展任务及生成输入归属。 |
   | 业务存储 | 保存业务关系、任务请求、生成输入、Run 和产物引用。 | 扩展既有共享 SQLite 与产物目录。 |

3. 页面通过 Remote 发起任务并持续查询状态。Agent 通过受管 CLI 提交业务产物。WorkbenchService 接纳业务写入，HarnessAgentAdapter 接收官方 Agent 状态事件。资源查询沿用现有 Catalog 与 MCP 路径。
4. 插件保存业务记录；完整对话和工具调用由官方 Session 保存。数据归属见第 5.2 节，功能架构见第 5.6 节。

### 5.2 数据归属与写入合同

1. 核心数据保存在现有插件 SQLite 与任务产物目录中。对象含义与数量关系见第 1 节。

   | 对象 | 必要保存数据 |
   | --- | --- |
   | Work | Workspace ID、名称、总目标。 |
   | Branch | Work ID、名称、原始需求、parent_branch_id、来源 Run 或任务产物引用、当前任务输入草稿。 |
   | FunctionBinding | Workspace ID、稳定 ID、名称、任务类型、预设 ID、Agent 模型选择、指定 Skill、执行要求。 |
   | Task | Branch ID、标题、任务类型、固定输入、输出合同、状态、输入来源；执行 Session、配置快照、模型选择回执与实际投递文本。 |
   | TaskArtifact | Task ID、类型、结构化内容、来源文件、Session/Turn/Tool Call、Skill 读取引用与采用位置。 |
   | Generation Run | 复用既有运行记录及实际输入存储，增加 Task ID、实验轮次、发起者、候选产物引用和重试来源；保存人工评价与评价、经验草稿。预设与 Agent 模型通过所属任务读取。 |
   | 持续实验任务的执行数据 | Task ID、次数上限、已提交次数、暂停状态、轮次及评价引用。 |
   | Experience | Work ID、Branch ID、可选 Task ID、结论、条件、底模、生成模型、证据 Run ID 与来源经验 ID。 |
   | Favorite | 被收藏对象类型 `run` 或 `experience` 及其 ID。 |

2. Task 固定保存提交时的任务输入。Run 固定保存实际生成输入。经验通过 Run ID 回查输入、生成模型和任务。任务失败时保留输入、已接纳产物和错误。
3. 工作台保存发起者；生成执行身份沿用宿主派生的 Session、Turn 和 Tool Call。人工点击“运行任务”时，发起者为人工，执行者为任务 Agent。
4. 生成接纳沿用 `items` 清单与 `(workspace_id, session_id, request_id)` 去重。Host 按 `workbench_task_id` 定位任务，校验访问权和原幂等记录的任务归属。
5. 自动采用产物时，WorkbenchService 在同一存储事务中比较写入目标当前内容与任务创建时的对应值。值一致时写入；值改变时保留候选，等待用户采用。手动采用提交界面展示的预期值，服务再次比较后写入。
6. TaskArtifact 的写入目标由 Task 固定。提示词与参数写入所属分支，评价与经验写入目标 Run 的草稿。用户切换页面后，产物保持原归属。

#### 5.2.1 工作区选择与业务范围

1. 顶栏提供工作区选择器和“添加工作区”，下一层显示当前工作区的工作选择器。工作区名称与项目目录来自官方 Workspace 名册。配置中心显示当前工作区名称。
2. 添加工作区时，用户填写名称并指定项目目录。产品接入官方目录选择与 Workspace 注册服务，使用官方返回的 ID。目录已登记时打开已有工作区；名称冲突或目录不可用时保留输入并显示处理提示。新增工作区进入空页面，提供“新建工作”。
3. 创建工作时，WorkbenchService 保存当前 Workspace ID、名称与总目标。工作列表按 Workspace ID 查询；配置中心按相同 ID 查询和保存 FunctionBinding。分支、任务、运行、经验与收藏通过所属工作确定工作区。
4. 切换工作区时，页面保存草稿与当前浏览位置，关闭弹窗、清除比较对象并释放原范围的查询。页面加载目标工作区的工作与配置，恢复上次选择的工作和分支。目标工作区尚无工作时显示“新建工作”。
5. 查询缓存和请求均携带 Workspace ID 与 Work ID。页面丢弃原范围的迟到响应。Host 核对工作、分支和任务的归属，并按任务所属 Workspace 创建执行 Session。
6. 已接纳任务与 Run 继续在原工作区执行。产物写回任务绑定的分支；切换界面只改变查询范围。切回原工作区时，页面读取当前任务状态与结果。协议沿用第 5.3.2 节。

### 5.3 功能配置与任务通道

1. 每个 Agent 操作使用第 5.2 节的任务输入。任务类型定义输入、产物、写入范围及前台位置；共享结构化合同供界面与 CLI 使用。
2. 配置中心按功能保存当前的 FunctionBinding，同一 Workspace 内的工作共用。预设选项读取官方 `remote.agentPresets.list()`，包含插件与 Agent Studio 注册的预设。首次创建内置绑定时使用官方默认预设，之后使用用户保存的绑定。
3. 页面提交功能 ID 及业务输入。WorkbenchService 读取当前绑定，并应用用户为本次运行指定的预设。HarnessAgentAdapter 使用解析出的 `agentPreset` 创建 Session。Agent Studio 的提示词、工具集、技能集与子 Agent 随所选组合生效。Adapter 按第 5.3.3 节选择 Agent 模型，再投递任务。
4. 任务保存执行 Session 及官方后代访问关系。每个新任务创建独立执行 Session；继续任务时使用原 Session。读写请求必须提供明确 Task ID；Session 关系用于校验访问权。子 Agent 接收派发任务时，父 Agent 传递对应 Task ID。
5. Adapter 在投递前保存任务、Session ID 与实际投递文本。投递使用官方 Agent 消息入口；投递结果与执行状态关联到对应 Task，供页面持续查询。投递失败时，任务保存具体错误。

   ```mermaid
   sequenceDiagram
     participant U as 页面上的 Agent 操作
     participant W as WorkbenchService
     participant H as HarnessAgentAdapter 与官方 Session
     participant A as Agent
     participant S as Skill 与业务工具
     participant P as 任务产物接纳
     U->>W: 功能 ID、原始需求、目标、预期字段值、本次预设
     W->>W: 读取 FunctionBinding，核对 Task ID 定位符
     break 功能已移除或执行要求无效
       W-->>U: 显示具体错误与配置中心入口
     end
     W->>H: 按所选预设创建 Session，核对 Skill 与工具
     W->>H: selectModel：提供商、模型、推理等级
     H-->>W: 返回 selected，保存到任务
     H-->>W: Session ID 与模型选择回执，或缺失能力
     break 预设不可用或能力不足
       W-->>U: 显示缺失项与预设重选入口
     end
     W->>W: 只替换执行要求中的 Task ID
     W->>W: 保存执行要求快照、绑定与实际预设
     W->>H: 向该 Session 投递已保存的执行要求文本
     W-->>U: 返回 Task ID 与已接纳状态
     H->>A: 执行要求与 Task ID
     A->>P: workbench task get：task_id
     P-->>A: 需求、输入、输出范围与已有进度
     A->>S: 按宿主目录读取 Skill，查询资源与模板参数
     alt 缺少会改变结果的输入
       A->>P: workbench task publish：task_id、question 产物
       P->>W: 保存问题与等待输入状态
       U->>W: 查询任务
       W-->>U: 返回问题，在任务卡显示
       U->>W: 回复同一问题
       W->>H: 在同一会话继续
     else 输入齐全
       A->>S: 执行业务步骤并保存 Skill 原生产物
       A->>P: workbench task publish：task_id、artifact
       P->>W: 检查合同与写入范围
       alt 当前字段值仍匹配
         W->>W: 保存产物并更新指定字段
         U->>W: 查询任务与产物
         W-->>U: 返回提示词、参数建议、评价或经验
       else 期间输入已改变
         W->>W: 保留候选产物
         U->>W: 查询任务与产物
         W-->>U: 返回候选，显示差异与采用入口
       end
     end
   ```

6. “生成提示词”和“改写提示词”返回提示词产物；“建议参数”返回参数建议。资源推荐返回候选，由用户选择。图片分析先显示评价与改进候选，用户采用后更新生成输入。
7. 正常返回直接更新已授权字段。候选产物与当前字段值冲突时，页面显示具体变化；用户选择对应产物的采用按钮或“从产物创建分支”。采用操作仍检查当前字段值。
8. Agent 通过 `workbench task get` 读取业务输入，通过 `workbench task publish` 提交产物和问题。两者均显式携带 Task ID，Host 校验执行会话访问权。合同见第 5.3.1 节；现有工具以[输入合同调研](../research/harness-agent-input-contract.md)为准。
9. 页面通过第 5.3.2 节的查询接口刷新任务与产物。任务完成以必需产物已被接纳、必需生成已结束为依据；官方 Agent 的 `idle` 表示执行器当前空闲。

10. 配置中心通过 HarnessAgentAdapter 读取所选预设的宿主 Skill 目录。创建执行 Session 后，Adapter 在投递前核对指定 Skill 的实际可加载性。选择“Agent 自选”时，`requested_skill` 为 `null`，Agent 从宿主目录选择。修改绑定预设后，页面清除已不可用的指定项。
11. 名册中的 `broken` 只说明装配异常。Adapter 还需按操作合同核对实际工具入口、资源访问和指定 Skill。能力缺失时显示具体缺失项与重选入口，任务保持未投递状态。运行能力按工具合同判断，用户可自行组合 Skill。
12. 每个 Run 引用实际执行任务。缺少预设信息的记录显示“未记录预设”。执行要求快照按第 5.3.1 节处理。
13. 持续实验各轮沿用启动时的任务与 Session。暂停、继续和补充需求均使用原会话。预设被移除时，页面保留任务与 Run，并提供恢复原预设或结束后另行运行的处理方式。
14. 用户可添加自定义功能，填写名称、任务类型和默认预设。用户选择 Agent 提供商、模型、推理等级和 Skill，并填写执行要求。前台位置与产物合同由任务类型决定。例如，“强化玻璃反射”选用“改写提示词”类型，入口出现在提示词区域，产物只可修改 Prompt 字段。
15. 用户在运行区选择“本次预设”后，下一次点击“运行任务”或“开始实验”时使用该预设。接纳后，页面恢复默认绑定。其他功能及自定义功能使用各自绑定。指定 Skill 在覆盖预设中缺失时，页面提示调整配置。
16. 保存功能时覆盖该功能的当前配置；移除自定义功能会移除前台入口。已创建任务依据保存的绑定快照继续执行。Agent 预设的组合编辑仍由 Agent Studio 负责。
17. 配置中心与前台使用同一查询投影。

   ```mermaid
   flowchart LR
     Edit[配置中心：添加或编辑功能] --> Bind[Workspace 的 FunctionBinding]
     Bind --> Entry[前台按任务类型显示入口]
     Entry --> Click[用户点击功能]
     Click --> Resolve[读取当前绑定]
     Resolve --> Override[运行任务或开始实验使用本次预设；其他功能使用绑定预设]
     Override --> Session[按预设创建 Harness Session 并核对能力]
     Session --> Model[按功能配置调用 selectModel]
     Model --> Request[只替换执行要求中的 Task ID]
     Request --> Snapshot[保存执行要求、预设与模型选择]
     Snapshot --> Result[Agent 按 Task ID 读取输入、执行步骤并提交产物]
     Result --> UI[更新对应字段、Run 或评价]
   ```

#### 5.3.1 执行要求与工作台读写通道

##### 5.3.1.1 执行要求与投递

1. 开发者计划在 `config/workbench-functions.json` 定义 FunctionDescriptor，作为各功能的结构化来源。描述对象保存任务类型、默认执行要求、输出合同和页面消费路径。界面、Host 与 CLI 共用该描述对象及产物 schema。
2. FunctionBinding 保存用户编辑的执行要求与指定 Skill。配置中心只提供“执行要求”编辑器，正文包含 `{{task_id}}` 定位符与功能专属步骤。保存时校验正文非空、Task ID 定位符存在，且没有其他双花括号定位符。编辑器不提供业务变量面板、输出合同或预览区。
3. 发送前，WorkbenchService 只替换 `{{task_id}}`，保存替换结果，并将同一文本作为 `session.prompt.content` 的文本项投递。服务不得追加段落或业务数据。需求、生成输入、资源引用、Run ID、Skill、预算和输出范围均通过 `workbench task get` 读取。
4. Host 在投递前保存执行要求快照、输入快照及执行 Session 绑定。用户后续编辑功能配置只影响随后创建的任务。任务详情显示当时的执行要求、输入与产物。
5. 任务 Task 与官方 Agent 执行记录分别保存。Task ID 明确定位任务；执行 Session 与官方后代关系用于校验访问权。`agentPreset` 只用于官方会话装配。
6. 用户编辑执行要求可以改变任务策略。Host 仍按功能类型接纳生成预算、产物类型和字段范围。结构与提交方式由 CLI 帮助提供，执行要求正文只引用对应帮助入口。
7. 当前消息、MCP 和生成 CLI 的依据见[输入合同调研](../research/harness-agent-input-contract.md)。任务读写与生成清单根级的 `workbench_task_id` 均为计划扩展；当前 CLI 精确字段校验尚不支持该生成字段。原型使用固定产物样例，真实 Agent 行为须在官方会话中验收。

##### 5.3.1.2 拟新增的 workbench task get 合同

1. Agent 调用 `workbench task get --stdin`，输入为 `{"task_id":string}`。Host 按显式 Task ID 定位记录，再以受管 capability 的 Session、Tool Call 和官方后代关系校验访问权。工作区、目标分支、预期字段值和写入范围取该任务的保存值。
2. CLI 按公共结果文件协议返回文件路径。Agent 读取该文件，取得以下结果。字段、类型与说明由共享合同生成 `workbench task get --help`。

   | 返回字段 | 类型与用途 |
   | --- | --- |
   | `task_id` | `string`，与本次请求一致的任务 ID。 |
   | `kind` | 功能类型，取 FunctionDescriptor 中的类型标识，如 `prompt/rewrite/parameters/review/run/experiment`。 |
   | `status` | `string`，当前 Task 状态，判定规则见第 5.3.2 节第 6 项。 |
   | 第 3 项的固定输入字段 | 与 `task_id` 同级返回，字段内容取任务创建时的快照。 |
   | `output_contract` | 第 5.3.1.3 节定义的本次产物与写入范围。 |
   | `artifacts` | `{artifact_id:string,artifact:TaskArtifact,disposition:string}[]`，当前任务已接纳的产物。 |
   | `iterations` | `{index:integer,run_id:string,generation_input:GenerationInput,context_refs:ContextRef[],review_artifact_id:string\|null}[]`，已接纳的实验轮次及实际输入。 |
   | `answers` | `{question_artifact_id:string,answer:string}[]`，按接纳顺序保存的补充回答。 |

3. WorkbenchService 从目标分支或选中 Run 固定业务输入。Agent 续行时，这些字段保留初始值；`artifacts`、`iterations` 和 `answers` 返回随后接纳的数据。

   | 固定输入字段 | 类型、来源与消费者 |
   | --- | --- |
   | `prompt_input` | `{positive_prompt:string,negative_prompt:string}`，取正向与负向提示词编辑框。Agent 编写提示词时读取；填写生成输入时映射到模板参数 ID。 |
   | `generation_input` | `GenerationInput`，取任务输入草稿或选中 Run 的实际输入。生成提交写入 `items[].request`。 |
   | `context_refs` | `ContextRef[]`，取已选作品、角色、词条、画风和画师串。每项为 `{kind,id}`；`kind` 沿用 CatalogContext 的 `work/character/prompt-term/style/artist-string`，`id` 为正整数十进制字符串。Agent 按引用调用资源 MCP。 |
   | `base_model_id` | `string\|null`，取底模选择或生成模型详情，用于资源查询和经验适用范围。 |
   | `reference_run_ids` | `string[]`，取本次分析、比较、诊断、重试或整理经验选中的 Run。Agent 用其调用 `generation run-inputs` 与 `generation resolve-media`。 |
   | `requirements` | `{original_request:string,instructions:string}`，分别保存分支原始需求与本次操作要求。 |
   | `evaluation_input` | 评价与经验功能返回 `{run_id:string,verdict:string,observation:string,conclusion:string,experience:{title:string,conditions:string,note:string}}`，取提交时的弹窗草稿。Agent 据此分析或整理经验。其他功能省略。 |
   | `requested_skill` | `string\|null`，取功能指定 Skill；为空时由 Agent 从宿主目录选择。 |
   | `max_runs` | `integer`，取本次生成预算：单次生成取 1，实验取用户设置，其他功能取 0。Host 以已接纳 Run 核对剩余次数。 |

4. GenerationInput 沿用当前生成 CLI 的字段。任务输入草稿允许实例和模板尚未选定；实际生成须符合[既有提交合同](../research/harness-agent-input-contract.md#5-生成-cli-的实际提交格式)。

   | 字段 | 类型与保存内容 |
   | --- | --- |
   | `title` | `string`，取分支名称或来源 Run 的标题。 |
   | `instance_id` | `string\|null`，取 ComfyUI 实例选择。 |
   | `template_id` | `string\|null`，取 Workflow 模板选择。 |
   | `model` | `null` 或 `{id:string,file_name:string}`。目录详情提供完整对象；`null` 表示使用模板模型。 |
   | `parameters` | `Record<string,JsonValue>`，保存模板 `parameter_id` 与对应值。 |
   | `loras` | `{id:string,file_name:string,weight:number,trigger_words:string[]}[]`。目录详情提供文件名和触发词，用户可调整本次权重。 |

5. 任务输入草稿以 `prompt_input` 保存提示词文本。准备生成输入时，Host 按模板参数描述将提示词映射到实际 `parameter_id`。模板选择改变后重新映射；生成输入中的提示词由 `prompt_input` 派生，任务创建时一次性映射。Seed、尺寸和参考图路径也按模板描述保存。例如描述返回 `kind:"width",parameter_id:"width_6"`，则写入 `generation_input.parameters.width_6`。Agent 根据模板参数描述，将选定尺寸写入对应的 `parameter_id`。来源见[参数映射断言](../../tests/unit/generation-workflow-compiler.test.ts#L439)。
6. 资源 ID 保留正整数十进制字符串。语义工具返回数字 ID 时，Host 或 Agent 按工具合同转成字符串。各资源的 MCP 读取方法见[输入合同调研第 4 节](../research/harness-agent-input-contract.md#4-mcp-资源-id-与读取入口)。
7. 角色素材使用 `character` 引用。Agent Studio 子代理 ID 标识执行配置，persona 标识预设中的提示词组件。依据见[输入合同调研](../research/harness-agent-input-contract.md)。

##### 5.3.1.3 输出合同与 Host 接纳范围

1. Host 根据任务类型与模板参数描述生成 `output_contract`，通过 task get 返回。发布结构由 task publish 的共享 schema 与帮助维护。

   | 字段 | 类型与用途 |
   | --- | --- |
   | `artifact_types` | 本任务接收的产物类型数组；各类型另接收 `question`。 |
   | `required_artifact_types` | 完成任务所需的产物类型数组。 |
   | `parameter_ids` | 参数建议允许提交的模板参数 ID 数组。 |
   | `apply_mode` | `automatic` 自动回填、`candidate` 等待用户采用或 `record` 保存任务内部记录。 |
   | `requires_finished_runs` | 任务是否必须等待已接纳 Run 结束。 |

2. 功能与产物的对应关系如下。

   | 功能 | 接收产物 / 必需产物 | 采用方式 | Run 要求 |
   | --- | --- | --- | --- |
   | 生成提示词、改写提示词 | `prompt` / `prompt` | 自动回填正向与负向提示词。 | 0 个。 |
   | 建议参数 | `parameters` / `parameters` | 自动回填授权参数。 | 0 个。 |
   | 推荐资源 | `resources` / `resources` | 用户选择后采用。 | 0 个。 |
   | 分析结果、比较结果、诊断失败 | `review` / `review` | 回填所选 Run 的观察与评价草稿；建议输入等待采用。 | 引用已有 Run。 |
   | 整理经验 | `experience` / `experience` | 回填经验标题、适用条件和经验结论。 | 引用已有 Run。 |
   | 运行任务、重试任务 | 空数组 / 空数组 | 保存 Run。 | 最多接纳 1 个，等待终态。 |
   | 持续实验 | `generation_input, review` / `review` | 保存当轮输入和评价。 | 按次数上限提交，每轮完成评价。 |

3. 提示词任务根据需求与模型编写文本。实例和 Workflow 模板可以为空。参数建议需要模板的参数描述。弹窗提供全部模板和缺失的实例选择，并保留任务要求。
4. 参数建议只接收 `parameter_ids` 中的字段。持续实验可提交全部生成输入；模型、模板、LoRA 与全部模板参数均可调整。
5. Host 根据必需产物和 Run 终态判定完成。持续实验还需逐轮评价，并由结束命令接纳结束请求或用尽 `max_runs`。状态判定见第 5.3.2 节。

##### 5.3.1.4 拟新增的 workbench task publish 合同

1. Agent 通过 `workbench task publish --file <artifact.json>` 或 `workbench task publish --stdin` 提交 `{"task_id":string,"artifact":TaskArtifact}`。`artifact.type` 区分以下结构。Host 按显式 Task ID 定位任务并校验执行 Session 或官方后代访问权。结构、文件输入、回执与重试规则由该命令帮助提供。

   | `type` | 产物字段与类型 |
   | --- | --- |
   | `prompt` | `positive_prompt:string,negative_prompt:string`。 |
   | `parameters` | `parameters:Record<parameter_id,JsonValue>`，仅包含本次建议的授权参数。 |
   | `generation_input` | `generation_input`、`context_refs`，共用第 5.3.1.2 节定义；用于持续实验的下一轮候选。 |
   | `resources` | `refs:{kind:CatalogContext["kind"],id:string}[]`；可选 `reason:string`。 |
   | `review` | `observation:string,conclusion:string,run_ids:string[]`；可选 `candidate:{generation_input,context_refs}`。 |
   | `experience` | `title:string,conditions:string,note:string,base_model_id:string\|null,model_id:string\|null,run_ids:string[]`。 |
   | `question` | `question:string,options:string[]`。问题写明缺少的具体输入；选项为空时使用文字回答。 |

2. Agent 保留 Skill 原生文件，并可在产物中附 `source_files:string[]`。CLI 解析本机文件路径；Host 将文件保存到任务产物目录，再记录来源引用。文件与结构化产物均保存成功后才返回回执。
3. Host 先使用共享发布 schema 校验请求结构，再校验 Task ID、会话访问权、资源引用和字段范围。提示词产物按文本结构接纳；参数建议按模板描述校验；生成输入按当轮资源和模板参数校验。
4. 接收失败时，CLI 返回非零退出码与 `error:{code,issues:[{path,message}]}`。`path` 指向可修正字段，如 `artifact.generation_input.parameters.width_6`。Agent 修正后重新提交；Host 保留当前草稿与已接纳产物。
5. 提示词产物只更新 `prompt_input`；参数产物只更新授权参数。实例、模板、模型和 LoRA 保留当前选择。
6. 自动回填与手动采用按第 5.2 节第 5 项比较预期字段值。评价中的 `candidate` 始终等待用户采用。
7. 成功回执为 `{task_id:string,artifact_id:string,disposition:"applied"\|"candidate"\|"recorded"\|"waiting_input"}`。同一已验证 Tool Call 内，相同 Task ID 与产物的重复提交返回原回执。页面按 Task ID 读取产物及写入对象。
8. `question` 使用同一入口。Host 保存问题并等待用户回答。页面通过 `replyTask` 提交 Task ID、问题产物 ID 和回答；Host 保存至 `answers`，再以该 Task ID 发起续行。Agent 通过 get 读取回答。
9. `generation submit` 计划在现有清单根级增加可选 `workbench_task_id:string`。任务生成时必须填写该 ID；普通聊天生成可省略。`items`、`request`、`parameter_files` 与 GenerationRuntime 沿用现有合同。清单文件与 stdin 使用同一结构，文件展开时保留该根字段。
10. Host 按 `workbench_task_id` 定位任务，并校验受管 Session、Tool Call 与官方后代访问权。在既有接纳事务中核对预算、固定输入、关联任务与轮次并保存 Run。单次生成任务最多接纳 1 个 Run；实验首轮使用起始输入，后续匹配已接纳候选。Host 不得按 Session 推断任务。
11. 既有 `request_id` 幂等记录必须同时核对任务归属。本次 `workbench_task_id` 与原记录不同，或空值与非空值不同，均返回冲突；重试不得改变既有 Run 的任务归属。
12. 页面只消费已接纳的产物与关联 Run。Host 不得将自然语言最终回答解析成生成输入、参数、评价或经验。最终回答保存在官方 Session，供用户阅读。

##### 5.3.1.5 功能输出与页面写入

1. 第 5.3.1.3 节的功能表规定每种产物的页面消费者。提示词进入正向、负向编辑框；参数建议进入对应模板控件；资源候选进入选择区；评价和经验产物回填“记录评价与经验”弹窗，Run 显示在运行卡片。
2. 页面读取实际接纳值。结构校验失败时显示具体字段错误，保留用户输入和已接纳结果。切换页面后，产物仍关联 Task 固定的分支。
3. 用户填写的任务要求按工作区、工作、分支和功能保存。关闭弹窗或刷新后恢复；任务成功提交后，内容保留在该任务的固定输入中。

##### 5.3.1.6 各功能的执行要求

1. 每份默认执行要求包含 `{{task_id}}`，要求 Agent 先读取 `workbench task get --help`，再以该 Task ID 读取输入。交付前读取 `workbench task publish --help`；生成前读取 `generation submit --help`，按帮助填写任务归属字段。其余正文按下表描述功能步骤。
2. 各功能的输入、步骤与页面结果如下；执行要求的内容规则见第 5.3.1.1 节。

   | 功能 | get 返回的输入重点 | 执行要求的功能步骤 | Host 页面落点 |
   | --- | --- | --- | --- |
   | 生成提示词 | 需求、`prompt_input`、模型与上下文引用。 | 读取素材和适用 Builder，编写提示词并保留原生产物，发布 `type:"prompt"`。 | 正向、负向提示词编辑框。 |
   | 改写提示词 | 需求、`prompt_input`、模型与上下文引用。 | 读取适用 Skill，按要求改写提示词，发布 `type:"prompt"`。 | 正向、负向提示词编辑框。 |
   | 建议参数 | 生成输入、模板描述与任务要求。 | 查询参数与尺寸候选，发布 `type:"parameters"`，仅包含授权字段。 | 对应参数控件。 |
   | 推荐资源 | 需求、底模、模型及已选上下文。 | 通过资源 MCP 搜索并读取详情，发布资源引用与理由。用户采用时沿用第 5.6.2 节的资源保存规则。 | 资源候选区。 |
   | 分析结果 | 一个参考 Run、原始目标与 evaluation_input 中的已有观察。 | 读取 Run 输入与媒体，观察图片；组织观察、判断与 Run 依据，发布 `type:"review"`；候选输入可选。 | 弹窗中的观察、评价结论。 |
   | 比较结果 | 两个参考 Run 与比较目标。 | 分别读取输入和图片；对照参数差异与观察；将结论关联到对应 Run，发布 `type:"review"`。 | 所选 Run 的评价草稿与任务产物。 |
   | 诊断失败 | 失败 Run、保存输入与执行错误。 | 查询错误指向的实例、模型、模板或参数；区分依据与待验证原因，发布诊断评价。 | 失败 Run 的评价草稿与任务产物。 |
   | 整理经验 | 选中 Run、evaluation_input 中的人工评价和经验草稿、模型身份。 | 读取输入与结果，整理结论、条件、底模、模型和 Run 依据，发布 `type:"experience"`。 | 弹窗中的经验标题、适用条件和经验结论。 |
   | 运行、重试 | 固定 `generation_input`、预算及已有 Run。 | 先核对已接纳 Run；已有 Run 时等待并查询结果，尚未提交时将固定输入写入 `items[].request`，保存 request_id 后调用生成 CLI。 | Run 卡片。 |
   | 持续实验 | 起始输入、目标、已有产物、轮次与预算。 | 首轮执行固定输入；每轮读取结果并发布评价；继续时发布下一轮生成输入，再提交生成；达到目标时按同一 Task ID 调用 experiment end，次数用尽时结束。 | 实验轮次、输入与评价。 |

3. 上表的页面落点供开发者连接界面，执行要求只包含业务步骤与交付动作。具体字段和结构由 CLI 帮助维护。

##### 5.3.1.8 补充输入与继续执行

1. 用户回答问题后，Host 保存回答，将执行要求模板中的 `{{task_id}}` 替换为原 Task ID，再向原执行 Session 投递。Agent 调用 `workbench task get` 读取回答、产物、轮次与 Run。
2. Agent 继续持续实验时，在原 Session 中按同一 Task ID 读取已有产物、Run 和轮次。Agent 先核对已接纳结果，再等待、评价或提交缺少的输入。
3. 官方 Job 唤醒后，Agent 按对应 Task ID 读取任务，再用其 Run ID 查询输入与媒体。实验控制命令也必须显式提供 Task ID，并校验执行 Session 或官方后代访问权。

#### 5.3.2 通信协议与持续查询

1. 页面持续获取任务执行、等待输入、产物、Run 和实验轮次。创建任务的请求在接纳后返回 Task ID 与当前状态，Harness 随后继续异步执行。源码依据见[现状调研第 9 节](../research/harness-comfyui-workbench-current.md#9-通信协议与持续更新的源码依据)。
2. 各条通信通道采用以下接口与协议。

   | 方向 | 接口与协议 | 返回内容 |
   | --- | --- | --- |
   | 页面 ↔ WorkbenchService | 新增 Workbench Remote 方法，经官方 Typert Remote RPC 调用。浏览器默认载体为 HTTP POST JSON；Desktop 载体由官方 Connection 管理。 | 任务接纳回执、控制结果或当前业务状态。 |
   | WorkbenchService → Harness Agent | HarnessAgentAdapter 调用官方进程内 SDK，按 Session 投递、补充或取消。 | 会话身份与投递结果。 |
   | Harness → HarnessAgentAdapter | Host 进程内的 `agent/status`、`agent/error` 与生命周期事件。 | 执行器状态与错误；Adapter 更新对应任务的当前状态。 |
   | Agent → WorkbenchService | 官方 Shell Tool Call 启动受管 CLI；CLI 向既有 `/api/harness-comfyui/cli/v1` 发送 HTTP POST JSON。 | workbench task get/publish 显式接收 task_id，读取输入或写入产物；Host 校验访问权并返回回执。 |
   | Generation Run → 实验 Agent | 既有 Generation Run Wait 与官方 Jobs。 | Run 完成后唤醒执行会话，继续评价与下一轮。 |

3. Workbench Remote 预计提供以下方法，并与业务 CLI 共用 WorkbenchService。

   | 预计方法 | 用途 | 响应 |
   | --- | --- | --- |
   | `saveBranchDraft` | 接纳工作区、工作、分支、预期字段值、原始需求及第 5.3.1.2 节的生成输入。 | 保存后的字段值与任务输入草稿。 |
   | `getFunctionCapabilities` | HarnessAgentAdapter 挂载所选预设的官方作用域，读取宿主预设名册与 Skill 摘要。 | 配置中心的预设与 Skill 选项；执行前再核对实际 Session。 |
   | `createTask` | 接纳工作区、功能、工作、分支、预期字段值、本次要求、明确的参考运行 ID 与预设覆盖。 | Task ID、Session ID 与已接纳状态。 |
   | `getProjection` | 按工作区、工作与所需分支查询当前业务数据。 | 任务、执行器状态、问题、产物、Run、实验轮次与 `refreshAfterMs`。 |
   | `saveRunReviewDraft` | 按 Run ID 保存评价与经验草稿及预期字段值。 | 保存后的草稿。 |
   | `saveRunReview` | 按 Run ID 接纳用户编辑的评价及可选经验，并记录产物来源。 | Run 评价、已保存经验 ID；重复保存更新同一经验。 |
   | `replyTask` | 按 Task ID 保存问题回答，再向执行 Session 投递该任务执行要求。 | 已接纳的回答。 |
   | `controlTask` | 按 Task ID 中断或继续任务。 | 当前控制状态。 |

4. 页面共用一份查询状态。可见时立即查询，随后在每次请求结束后按 `refreshAfterMs` 发起下一次查询。间隔沿用 `client.runRefreshIntervalMs`，当前默认值为 1000 毫秒。隐藏或关闭页面时停止查询；重新打开、恢复连接或提交操作后立即刷新。后台任务继续由 Host 管理。
5. getProjection 汇总官方 Agent 状态与已保存的业务数据。工作台持续查询覆盖等待输入、Agent 空闲和 Run 执行等状态。页面按当前工作与任务显示响应，离开作用域时释放查询。连接失败时保留已显示数据并标明连接状态，恢复后重新查询。
6. HarnessAgentAdapter 按 Task、Session 及官方子会话关系接收宿主事件，并读取 `Agent.status` 取得主 Agent 与子 Agent 的执行状态。Adapter 结合问题、产物和 Run 判定业务状态；页面同时展示执行器状态。业务状态的判定如下。

   | 可观察事实 | 业务状态 |
   | --- | --- |
   | 任务已接纳，尚未开始执行 | 待执行。 |
   | 主 Agent 或子 Agent 运行中，当前步骤仍由 Agent 执行 | Agent 执行中。 |
   | `question` 产物已接纳，等待用户回答 | 等待输入；卡片显示问题与回答入口。 |
   | 任务关联 Run 尚未结束 | 等待生成；运行卡片显示 Run 状态。 |
   | 必需产物已接纳，必需 Run 已结束 | 按任务结果显示完成或失败。 |
   | 任务的主 Agent 与子 Agent 均空闲，仍缺少必需产物，且当前没有待回答问题或未结束的 Run | 待处理；保留当前结果与继续入口。 |
   | 执行错误导致任务无法继续，或用户中断任务 | 保存错误或中断状态，并保留已接纳结果。 |

7. Agent 通过受管 CLI 提交的产物先写入业务存储，再由 getProjection 返回页面。Skill 文件和 Session 对话继续保留来源，页面字段使用已接纳的结构化产物。业务状态轮询与官方会话流分别使用各自的 SDK 接口。
8. 以下时序展示接纳、产物提交和页面更新。

   ```mermaid
   sequenceDiagram
     participant U as 工作台页面
     participant W as Workbench Host
     participant A as Harness Agent
     participant C as 受管 CLI
     U->>W: Remote RPC：createTask
     W->>W: 保存任务与实际请求
     W->>A: 进程内 SDK：投递到 Session
     W-->>U: Task ID、Session ID、已接纳
     par 执行状态
       A-->>W: 宿主事件：agent/status 或 agent/error
     and 业务产物
       A->>C: Shell Tool Call：提交产物或问题
       C->>W: HTTP POST JSON：workbench task publish，task_id 与 artifact
       W->>W: 保存产物、问题与业务状态
       W-->>C: 接纳回执
       C-->>A: 工具调用结果
     and 页面持续查询
       loop 页面可见，按 refreshAfterMs 调度
         U->>W: Remote RPC：getProjection
         W-->>U: 当前任务、问题、产物、Run 与实验轮次
       end
     end
   ```

#### 5.3.3 Agent 模型选择

1. 配置中心为每个功能保存 `agentModel`。字段沿用[输入调研第 2.1 节](../research/harness-agent-input-contract.md#21-agent-提供商模型与推理等级)的模型选择结构，消费者为官方 Session 服务。生成输入中的生成模型继续由 GenerationRuntime 使用。
2. 功能编辑器提供“Agent 提供商”“Agent 模型”“推理等级”三个选择器。选项由 `session.modelCatalog()` 提供。更换提供商后更新模型列表；更换模型后更新推理等级列表。模型没有推理等级时，页面禁用该选项，保存时省略 `reasoningEffort`。
3. 初次添加功能时，页面从名册默认值填入具体选择。保存后使用该功能的选择；名册中的默认值变化只影响随后添加的功能。提供商、模型或推理等级已不可用时，页面要求重新选择，并阻止创建任务。
4. 发起任务时，WorkbenchService 保存绑定中的选择。Adapter 创建执行 Session，调用 `session.selectModel({sessionId,...agentModel})`，保存 `selected` 回执后调用 `session.prompt()`。模型选择失败时，任务保存错误并显示重选入口。请求正文继续按第 5.3.1 节生成。
5. 每个新任务使用独立 Session。任务继续、回答问题和实验后续轮次沿用启动时的模型选择。配置中心的修改应用于随后创建的任务。子 Agent 的模型选择沿用所选预设的配置。
6. 任务详情显示主 Agent 的配置和选择回执。Run 通过关联任务显示该选择。实际请求头记录按输入调研第 2.1 节读取；预设备用模型或子代理采用其他模型时，查询对应请求头。历史记录缺少模型信息时显示“未记录 Agent 模型”。

### 5.4 生成提示词与运行任务

1. 用户在右栏填写原始需求，点击“生成提示词”。弹窗保存本次任务要求。Host 创建提示词任务；Agent 通过 task get 读取需求、模型与上下文，并按 Skill 生成提示词产物。
2. Host 接纳 `prompt` 后，按授权范围回填正向、负向提示词。用户可以继续改写、选择资源或编辑参数；实际生成前按模板描述完成参数映射。
3. 用户选择“运行一次”并点击“运行任务”后，Host 创建 `kind:run` 的 Task。该任务固定当前生成输入，最多接纳 1 个 Run。缺少实例、模板或必需参数时，页面定位缺失字段并保留已填内容。

   ```mermaid
   sequenceDiagram
     participant U as 工作台页面
     participant W as WorkbenchService
     participant H as 官方 Harness Session
     participant A as Agent
     participant C as 受管 CLI
     participant G as GenerationRuntime
     U->>W: createTask：run、分支、任务输入、本次预设
     W->>W: 校验输入并固定到 Task
     W->>H: 创建 Session，选择 Agent 模型
     W->>H: 投递执行要求与 Task ID
     W-->>U: Task ID、已接纳状态
     H->>A: 执行任务
     A->>C: workbench task get：task_id
     C-->>A: 固定生成输入、预算与已有 Run
     A->>C: generation submit：workbench_task_id、items
     C->>W: 校验任务、会话、预算与重复请求
     W->>G: 接纳生成，保存 Task ID 与实际输入
     G-->>A: Run ID
     A->>C: generation wait
     loop 页面可见
       U->>W: getProjection
       W-->>U: 任务状态、Run、媒体或错误
     end
     G-->>H: 官方 Job 通知 Run 终态
     H->>A: 继续读取结果
     W->>W: 按关联 Run 终态更新任务
   ```

4. 单次生成任务使用固定输入。重复投递读取已有 Run；重试行为按第 1.3 节第 5 项创建新的任务。`submission_unknown` 处理沿用 [ADR 0002](../adr/0002-generation-runs-are-durable-and-asynchronous.md)。
5. 单次生成与持续实验共用 Agent、CLI、生成接纳和等待机制。工作台媒体访问按工作区、任务和官方会话关系校验。

### 5.5 图片分析与持续实验

1. “分析结果”将 Run ID、原始需求和关注点保存到任务。Agent 按 Task ID 读取这些输入，再读取历史参数与图片，返回评价与候选生成输入。项目内置组合使用 `comfyui-image-review` 和 Image Reader。Host 将观察与结论回填到对应 Run 的评价草稿，建议输入保存在任务产物中，供用户采用。
2. “整理经验”读取所选 Run 和弹窗内的当前评价。Agent 返回的标题、条件与结论回填到经验草稿。人工保存流程见第 5.6.7 节。
3. 持续实验以已有生成输入为起点，按持续实验功能的绑定确定预设。用户填写目标和最多运行次数；首轮使用初始生成输入。后续轮次由 Agent 决定生成模型、模板、LoRA、参考图路径、提示词和全部模板参数。

   ```mermaid
   flowchart TD
     Start[读取持续实验绑定、目标、生成输入与次数] --> Bind[固定执行配置，按预设创建会话并核对能力]
     Bind --> Request[只替换 Task ID，投递执行要求]
     Request --> First[Agent 按 Task ID 读取并提交首轮输入]
     First --> Admit[Host 检查实验状态、轮次与运行次数上限]
     Admit --> Run[固定生成输入并创建 Run]
     Run --> Wait[官方 Job 等待 Run]
     Wait --> Review[Agent 读取结果并调用审阅 Skill]
     Review --> Save[保存评价与本轮产物]
     Save --> Decision{Agent 判断目标与剩余次数}
     Decision -->|继续| Resources[Agent 通过 MCP 与工具选择模型、模板及资源]
     Resources --> Parameters[读取当轮模板参数描述，编写候选生成输入]
     Parameters --> Candidate[保存完整候选产物]
     Candidate --> Admit
     Decision -->|目标达到或次数用尽| End[结束实验并返回结果]
     Decision -->|缺少输入| Ask[任务卡提问]
     Ask --> Resume[用户补充或继续]
     Resume --> Decision
   ```

4. Agent 通过现有 MCP、参数发现和生成工具调整资源与参数。更换模板时，Agent 读取该模板的参数描述，重新组织参数。
5. WorkbenchService 按显式 Task ID 校验访问权、轮次、次数上限与实验状态。参数结构以当轮模板描述为准；资源准备沿用 GenerationRuntime。准备失败时，Run 保存候选输入与错误。重复通知返回已有轮次和 Run。
6. 每轮 Run 保存实际输入及资源、模板参数描述快照，并关联所用任务产物和评价。查询、比较与经验使用当轮 Run ID。
7. 暂停或结束实验时，Host 停止接纳后续轮次；已接纳 Run 继续完成。用户在已暂停的实验中点击“继续实验”后，Agent 读取最近的 Run 与产物。Agent 沿用同一实验和任务会话执行后续轮次。
8. 页面关闭后，Host 继续处理已接纳任务。用户重新打开页面时，通过第 5.3.2 节的查询接口读取任务、Run 与实验轮次。
9. 工作台展示以下状态来源。

   | 展示对象 | 状态依据 | 页面行为 |
   | --- | --- | --- |
   | Task | 任务接纳、官方会话执行、明确的问题与已接纳产物。 | 按第 5.3.2 节显示业务状态。 |
   | Generation Run | 复用 [run-status.ts](../../src/generation/run-status.ts)。 | 区分准备、提交、排队、生成、下载及终态；详情保留原始状态与错误。 |
   | 持续实验 Task | 用户控制、已接纳轮次和次数上限。 | 显示执行中、已暂停、已结束或已完成，并列出每轮 Run 与评价。 |

10. 任务卡显示业务阶段与实际使用的 Skill。完整调用过程通过来源 Session 查看。用户中断 Agent 后，任务保留已接纳产物；已提交的 ComfyUI Run 继续按生成状态显示。

### 5.6 原型功能架构

1. 每张功能图展示该功能使用的组件和接口。任务交互流程见第 5.3 节，单次生成见第 5.4 节，持续实验见第 5.5 节。
2. 页签切换、关闭弹窗、取消未提交编辑、展开字段与收起分支由 Client 管理显示状态。
3. 后台任务提交后，页面保留当前页签、比较对象和滚动位置。提示显示功能名称、Task ID 与“查看任务”按钮；用户点击该按钮才进入任务页。完成时回填授权字段或弹窗草稿，并提示结果。等待输入或写入冲突时，提示指向对应任务。

#### 5.6.1 工作区、工作与分支

1. 工作区入口复用官方名册与目录服务。工作选择、分支树和分支图共用业务入口与存储，归属规则见第 5.2.1 节。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear"}}}%%
   flowchart LR
     UI["工作区、工作与分支界面"] <-->|添加与查询| WS["官方 Workspace 服务"]
     UI -->|Workspace ID 与业务请求| API["Workbench Remote"]
     API --> WB["WorkbenchService"]
     WB --> DATA[("Work · Branch<br/>Task")]
   ```

2. 界面操作与保存结果如下。

   | 操作 | 输入与处理 | 页面结果 |
   | --- | --- | --- |
   | 添加工作区 | 调用官方 create({ path }) 注册目录，再用 rename() 保存名称。 | 列表新增工作区并进入该工作区，可继续新建工作。 |
   | 切换工作区 | 按第 5.2.1 节更新查询范围和浏览位置。 | 该工作区的工作列表、功能配置与历史记录。 |
   | 新建或切换工作 | 在当前工作区保存名称与总目标，或按 Work ID 查询。 | 工作选择器与该工作的分支、任务、Run。 |
   | 查看分支树或分支图 | 查询 Branch 的 parent_branch_id、来源引用与 Run。 | 递归父子结构；选择节点后显示对应分支和 Run。 |
   | 修改分支名称或需求 | WorkbenchService 更新目标 Branch。 | 右栏显示当前内容，供后续任务读取。 |
   | 从 Run 或任务产物创建分支 | 保存起点、名称、需求与候选生成输入。 | 子分支保留来源，只展示该分支发起的 Run。 |

#### 5.6.2 资源目录与生成输入编辑

1. 目录浏览与生成输入保存使用各自的业务接口。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear"}}}%%
   flowchart LR
     UI["资源目录与生成输入编辑器"] -->|浏览与筛选| CATALOG["Catalog Remote"]
     CATALOG --> SOURCE["资源数据源"]
     UI -->|Workbench Remote| WB["WorkbenchService"]
     WB --> DRAFT[("Branch 任务输入草稿")]
   ```

2. 目录组件从现有 WorkbenchDockSession 提取。“插入上下文”和工作台资源入口共用该组件。目录选择写入 Branch 草稿，聊天资源摘要从草稿派生。
3. 界面操作与保存结果如下。

   | 操作 | 输入与处理 | 页面结果 |
   | --- | --- | --- |
   | 分类、筛选、搜索、分页、清除筛选 | Catalog 按资源类型、底模、模型与关键词查询。 | 目录列表；已选资源继续保留。 |
   | 查看资源详情与图片 | Catalog 按资源 ID 查询详情与图片。 | 详情及画廊；返回时保留浏览位置。 |
   | 选择实例、底模、生成模型、Workflow 模板、LoRA 或上下文 | WorkbenchService 保存第 5.3.1.2 节的任务输入；复用资源选择器并补充实例类别。 | 已选资源与模板对应的参数字段。 |
   | 更换生成模型或底模 | WorkbenchService 保存所选模型或底模。 | 已选模板、LoRA 及权重保持原值。参数、提示词、参考图路径、实例和参考上下文保持原值。 |
   | 编辑 Prompt、参考图路径或生成参数 | 按当前模板的参数描述保存字段值。 | 下次运行的任务输入草稿。 |
   | 查看运行输入、编辑任务输入 | 分别读取 Run 的固定生成输入与 Branch 草稿。 | 历史输入或可编辑字段。 |

4. “推荐资源”“改写提示词”和“建议参数”使用第 5.6.4 节的任务通道。

#### 5.6.3 配置中心

1. 功能配置与执行能力查询分别连接以下组件。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear"}}}%%
   flowchart TB
     UI["功能配置与执行要求编辑器"] -->|保存| WB["WorkbenchService"]
     WB --> DATA[("当前 FunctionBinding")]
     REGISTRY["官方预设与 Skill 目录<br/>session.modelCatalog"] --> ADAPTER["HarnessAgentAdapter"]
     ADAPTER -->|可选能力| UI
   ```

2. 页面请求均经过 Workbench Remote。执行要求只替换 Task ID，规则见第 5.3.1 节。
3. 界面操作与保存结果如下。

   | 操作 | 输入与处理 | 页面结果 |
   | --- | --- | --- |
   | 添加或编辑功能 | 保存名称、任务类型、预设、Agent 模型选择、指定 Skill 与执行要求。 | 当前配置与对应功能入口。 |
   | 选择 Agent 提供商、模型与推理等级 | 按第 5.3.3 节查询名册、联动选项并保存 ID。 | 配置列表及任务详情显示所选 Agent 模型。 |
   | 修改默认预设或指定 Skill | 读取官方作用域目录并保存选择。 | 可用 Skill 与功能默认预设。 |
   | 编辑执行要求 | 按第 5.3.1.1 节保存执行要求。 | 后续任务使用保存的执行要求。 |
   | 移除自定义功能 | 按 FunctionBinding ID 移除配置。 | 入口移除；已创建任务继续可查。 |
   | 在运行区选择“本次预设” | 发起任务时读取该值。 | 本次运行任务或开始实验使用所选预设；接纳后恢复默认选择。 |

#### 5.6.4 任务与提示词生成

1. 各 Agent 功能共用任务创建、会话接入和产物接纳组件。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear"}}}%%
   flowchart TB
     UI["Agent 功能入口与任务卡"] <-->|Remote RPC：发起与轮询| WB["WorkbenchService<br/>请求生成 · 产物接纳"]
     WB -->|SDK 投递| AGENT["官方 Harness<br/>所选预设与 Skill"]
     AGENT -.->|宿主状态事件| WB
     AGENT --> CLI["拟新增受管 CLI<br/>workbench task get/publish"]
     CLI -->|HTTP JSON：显式 Task ID 读写| WB
     WB --> DATA[("Task · TaskArtifact")]
   ```

2. 按钮提交功能 ID 与业务对象。通信与持续查询按第 5.3.2 节执行；任务输入和产物接纳使用第 5.3 节的合同。
3. 各功能的读取合同、产物格式与返回位置见第 5.3.1.2、5.3.1.5 节。自定义功能沿用所选任务类型的合同。

4. 任务卡操作与后端接口如下。

   | 操作 | 接口与结果 |
   | --- | --- |
   | 查看任务、任务输入或来源会话 | 查询 Task、实际请求与产物；来源会话通过官方 Session 入口查看。 |
   | 回答问题、中断或继续任务 | 回答按第 5.3.1.8 节保存并触发续行；中断或继续通过 controlTask 控制原任务。 |
   | 采用候选产物 | WorkbenchService 核对目标与当前输入，更新对应任务输入或评价与经验草稿。 |
   | 从产物创建分支 | 使用第 5.6.1 节的分支入口，保留任务来源。 |

#### 5.6.5 运行与结果

1. 运行任务通过 Agent 提交；运行卡片通过查询投影读取结果。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear"}}}%%
   flowchart TB
     AGENT["执行运行任务的 Agent"] --> CLI["受管 CLI"]
     CLI --> WB["WorkbenchService<br/>固定生成输入与 Run 归属"]
     WB --> GEN["GenerationRuntime"]
     UI["运行卡片与结果界面"] <-->|Remote RPC 轮询| QUERY["业务查询投影"]
     QUERY --> GEN
     UI -->|Run ID 与媒体 ID| MEDIA["既有媒体路由与 Saved Media"]
     GEN --> COMFY["ComfyUI"]
   ```

2. 任务发起复用第 5.6.4 节，生成接纳与等待流程见第 5.4 节。
3. 原图读取流程：点击图片 → 取得该 Run 的媒体引用 → 通过既有媒体路由读取 Saved Media → 显示原图弹窗。缩略图和原图来自同一媒体记录。
4. 界面操作与运行记录如下。

   | 操作 | 输入与处理 | 页面结果 |
   | --- | --- | --- |
   | 运行任务 | Host 创建单次生成任务，Agent 按固定生成输入提交生成请求。 | 新 Run 卡片及实际执行预设。 |
   | 查看运行状态 | 查询 Generation Run 的状态、媒体或错误。 | 卡片、顶部数量与分支运行标记同步更新。 |
   | 点击结果图查看原图 | Client 按选中 Run 的媒体 ID 读取原始媒体；产品复用既有媒体路由及访问校验。 | 弹窗显示该 Run 的原图；关闭后保留当前页和浏览位置。比较视图分别使用两侧 Run 的媒体 ID。 |
   | 查看运行、生成输入与来源证据 | 按 Run ID 读取固定输入和媒体。 | 该次运行的详情。 |
   | 比较运行、选择比较对象、结束比较 | 查询两个 Run 各自的输入与媒体。 | 并列结果或单次运行详情。 |
   | 重试失败运行 | 使用原生成输入创建新任务与 Run，记录重试来源。 | 原失败卡片和新运行卡片分别保留。 |

#### 5.6.6 持续实验

1. Agent 决定生成输入和迭代方向，WorkbenchService 管理实验状态与运行次数。

   ```mermaid
   %%{init: {"flowchart": {"curve": "linear"}}}%%
   flowchart LR
     UI["实验控制界面"] <-->|Remote RPC：控制与轮询| WB["WorkbenchService<br/>状态 · 次数 · 轮次"]
     AGENT["实验 Agent"] -->|受管 CLI| WB
     WB --> GEN["GenerationRuntime"]
     GEN -->|运行完成| JOBS["官方 Jobs"]
     JOBS -->|唤醒| AGENT
   ```

2. 首轮、逐轮评价、生成输入调整与实验控制流程见第 5.5 节。
3. 界面操作与实验状态如下。

   | 操作 | 输入与处理 | 页面结果 |
   | --- | --- | --- |
   | 开始实验 | 按功能配置创建 Task，固定目标、初始生成输入与次数上限。 | 实验状态、当前轮次及 Run。 |
   | 暂停或结束实验 | WorkbenchService 停止接纳后续轮次，已接纳 Run 继续执行。 | 已有结果与实验状态。 |
   | 继续实验 | 沿用任务请求与 Session，读取已保存的轮次和评价。 | 后续生成输入、Run 与评价。 |
   | 查看某轮结果 | 按该轮 Run ID 读取实际输入。 | 当轮模型、模板、参数与图片。 |

#### 5.6.7 评价、经验与收藏

1. 结果页提供“记录评价与经验”入口。弹窗的“分析结果”按钮位于运行评价区，“整理经验”按钮位于经验区。自定义分析、经验功能也出现在对应区域。

   ```mermaid
   flowchart TB
     RUN[所选 Run] --> FORM[记录评价与经验弹窗]
     FORM -->|分析结果或整理经验| TASK[Task 与 Agent]
     TASK -->|task publish| ART[TaskArtifact]
     ART -->|校验目标及预期值| DRAFT[Run 的评价与经验草稿]
     DRAFT -->|回填字段| FORM
     FORM -->|人工编辑并保存| SAVE[WorkbenchService.saveRunReview]
     SAVE --> REVIEW[Run 的评价字段]
     SAVE --> EXP[Experience 与证据 Run ID]
     EXP --> LIST[经验列表]
     FAV[Favorite] -->|引用| EXP
     FAV -->|引用| RUN
   ```

2. `review` 产物的 `observation`、`conclusion` 分别回填“观察”和“评价结论”。`experience` 产物的 `title`、`conditions`、`note` 分别回填“经验标题”“适用条件”和“经验结论”。产物保留 Task ID、证据 Run ID 与来源文件。
3. 点击“整理经验”时，Host 将弹窗中的当前值固定为任务的 `evaluation_input`。用户在 Agent 返回期间编辑相同字段时，产物保存为候选，等待用户选择填入。
4. 点击“保存”后，WorkbenchService 将评价写入当前 Run。用户填写经验标题、适用条件和经验结论后，服务同时保存 Experience 并引用证据 Run。再次保存更新本草稿关联的经验。用户关闭弹窗或刷新页面后，可以继续编辑原草稿。
5. 保存后，当前页面保留原位置并显示提示。Run 下方的“运行评价”和运行记录面板显示已保存评价；经验页显示已保存经验。任务完成以产物已接纳为依据，人工保存由用户发起。
6. 收藏、检索与复用操作如下。

   | 操作 | 输入与处理 | 页面结果 |
   | --- | --- | --- |
   | 搜索经验、查看证据 | 按关键词、底模与对象 ID 查询。 | 经验列表或来源 Run。 |
   | 添加或移除收藏 | 按 Run 或经验的对象 ID 保存引用。 | 收藏列表。 |
   | 复用经验 | 指定目标底模，引用来源经验及证据 Run 创建子分支。 | 分支保存继承的任务输入；后续可发起提示词或生成任务。 |

### 5.7 模块、命令与工具发现

1. 开发者按以下职责开发模块。

   | 位置 | 预计职责 |
   | --- | --- |
   | `src/workbench/` | 业务类型、功能与任务定义、读取和产物合同、Remote 与 CLI 的共享校验。 |
   | `src/host/workbench/` | WorkbenchService、功能配置、Task ID 替换、显式任务访问权与产物接纳、HarnessAgentAdapter、查询投影。 |
   | `src/host/storage/` | 共享 SQLite 连接、事务与业务对象读写。 |
   | `src/client/workbench/` | 三栏界面、共用目录、任务卡、配置中心与执行要求编辑器、参数描述驱动的表单。 |
   | 既有 Generation 模块 | 扩展业务引用，复用生成接纳、执行、等待和媒体。 |
   | 既有 CLI 与 Preset | 注册 workbench task get/publish 及帮助，扩展生成清单任务标识，复用现有生成引擎。 |

2. Agent 使用以下 CLI 分组。工作、分支、功能配置、经验与收藏的页面操作使用 Workbench Remote；任务输入统一通过 get 读取。

   | 分组 | 操作 |
   | --- | --- |
   | `workbench task` | 拟新增 get 与 publish，输入均显式指定 task_id；合同见第 5.3.1 节。 |
   | `generation` | 现有清单根级计划增加 workbench_task_id；Host 校验显式归属，复用现有引擎。 |
   | `image` | 沿用既有图片观察命令。 |
   | `experiment` | 计划新增 `experiment end`，以 `task_id` 指定要结束的实验任务。输入与轮次通过任务 get 读取。 |

3. 所选 Preset 提供执行组合，宿主提供 Skill 目录与正文。执行要求规则见第 5.3.1.1 节。Agent 读取根帮助后，按 ID 调用任务读取与提交命令；生成、图片与 MCP 合同通过各自帮助和声明发现。
4. 目录查询继续使用 NoobAI MCP；图片观察继续使用现有 Image Reader。大结果写入 UTF-8 文件，回执返回对象 ID 与文件路径。
5. 业务输入统一由 workbench task get 按 Task ID 返回。父 Agent 派发子任务时传递该 ID；用户补充输入或继续任务时，Agent 使用同一 ID 重新读取，流程见第 5.3.1.8 节。

### 5.8 实施步骤与依赖

1. 开发者将共用基础设施作为一个子任务交付，范围引用第 5.2—5.4 节与第 5.7 节。接口基线核对现有预设、Session、模型、Skill、任务投递、状态查询、中断与会话跳转合同；依据见现状调研第 7、8 节。
2. 后续子任务按可独立视觉验收的页面功能划分。实施顺序、前置依赖、页面入口、验收准备、操作步骤、页面结果及后端字段见[实施与验收清单](../../outputs/prompt-studio-architecture/实验工作台实施与验收清单.xlsx)。
3. 开发者按表格逐项交付，并使用第 5.6 节核对原型入口。验收证据按第 7 节保存，包含真实页面、Agent 产物与 Run。
4. 预计新增第三方依赖为 0 项。开发者复用当前 React、SQLite、官方 SDK、Remote 和 Jobs。业务归属需补充至 [ADR 0005](../adr/0005-harness-identities-and-generation-run-ownership.md)和 [ADR 0008](../adr/0008-one-sqlite-and-workspace-run-directories.md)。

## 6. 方案待决策项清单

1. 当前无待决策项。

## 7. 计划验收清单

1. 实施者逐项保存以下证据。

   | 场景 | 验收结果 |
   | --- | --- |
   | 添加工作区，再创建工作 | 工作区出现在列表中；工作使用官方 Workspace ID；刷新后可继续打开。 |
   | 添加已登记目录或同名工作区 | 按第 5.2.1 节处理，保留既有工作和配置。 |
   | 切换工作区及返回 | 工作列表与配置按工作区加载；草稿、分支和浏览位置保留；原范围响应不会覆盖当前页面。 |
   | 切换时存在执行中的任务 | 原任务与 Run 继续执行，产物保留原归属；切回后显示当前结果。 |
   | 工作区尚无工作 | 页面提供新建工作；配置中心仍可编辑执行要求。 |
   | 为不同功能配置不同预设 | 前台按功能 ID 调用对应组合；生成提示词、运行、分析结果可分别使用不同预设。 |
   | 编辑执行要求 | 编辑器只保存步骤与 task_id 定位符，不提供业务变量或预览；投递只替换 Task ID，保存文本与实际发送内容一致。 |
   | 按 Task ID 获取输入 | get 按第 5.3.1.2 节返回对应 Task ID 的固定输入、输出合同与当前进度；不会把其他任务数据混入结果。 |
   | 发布结构的来源 | get 返回业务约束，不返回发布 JSON Schema；publish 帮助与接收校验使用同一共享 schema；执行要求不复制该结构。 |
   | 多个执行会话并行任务 | 交错读取与提交不同 Task ID；响应、产物和页面写入按显式 ID 分别归属，切换界面不改变目标。 |
   | Task ID 访问权 | 无访问权的 Session 及非授权后代被拒绝；拥有访问权的父子会话可按同一 ID 执行。 |
   | 执行要求只含 Task ID | 用户需求、资源、Run ID、Skill 与输出合同均通过 get 读取；Task ID 替换之外没有新增消息段落。 |
   | 核对各功能默认要求 | 按第 5.3.1.6 节核对输入字段、调用步骤、artifact.type 和页面位置；Agent 要求使用传输字段描述输出。 |
   | 修改正文中的任务策略 | 执行要求随功能配置保存；业务输入和输出合同均经 get 读取；Host 校验规则与官方预设权限保持对应来源。 |
   | 创建后更改资源或比较对象 | 原任务的 generation_input、context_refs 和 reference_run_ids 保持固定值；新任务取随后保存的选择。 |
   | 预设、Skill 与正文分层 | agentPreset 用于 session.create；指定 Skill 通过 get 返回；宿主提供目录与正文；执行要求不包含输出 schema。 |
   | 模板参数与尺寸候选 | 页面值与 Agent 输出均按查询得到的 parameter_id 保存；带节点后缀、比例/百万像素、分辨率预设分别验证。 |
   | 产物字段越界 | prompt 产物只含提示词字段；parameters 产物只含授权参数；Host 拒绝越界输入并保留草稿。 |
   | 类型化产物回填 | 向接收入口提交字段值不同的合法产物，页面显示各次实际返回值；各类产物进入对应位置，评价候选等待采用。 |
   | 非法产物与修正重提 | 缺少字段、类型错误、资源引用无效或参数越界时，CLI 返回 issues.path 与修正提示；页面数据保持原值；修正后可接纳。 |
   | Agent 仅返回自然语言或代码块 | 最终回答保存在 Session；生成输入、参数、评价和经验均不从该回答写入。 |
   | 产物与生成归属 | get/publish 按 task_id 定位；generation submit 按 workbench_task_id 定位；Session 与官方后代关系只用于校验访问权。 |
   | 生成清单的任务字段 | 同一清单根级只增加可选 workbench_task_id；工作台填写该 ID，普通聊天可省略；items/request/parameter_files 和引擎保持原合同。 |
   | 生成重试的任务归属 | 相同 request_id 复用时，任务归属也须相同；换成其他 Task ID 或改变空值归属均返回冲突，原 Run 归属保留。 |
   | 文件提交与 stdin | 两种清单输入均保留 workbench_task_id；展开 parameter_files 后仍向同一接纳入口传递该 ID。 |
   | 结束指定实验 | experiment end 按显式 Task ID 与会话访问权结束对应实验，保留已接纳 Run 与产物。 |
   | 发起后台任务 | 提交与完成均保留当前页面或弹窗；提示提供任务入口。 |
   | 在弹窗分析结果并整理经验 | 分析回填观察与评价；整理经验读取当前人工评价，回填经验字段。Agent 完成后经验列表数量不变。 |
   | 人工保存评价与经验 | Run 显示已保存评价，经验列表新增对应条目并引用证据 Run；重复保存更新同一条目。 |
   | 关闭评价弹窗或刷新 | 未保存草稿保留；Agent 返回时按 Task 固定的 Run ID 回填，手工修改冲突时保留候选。 |
   | 点击结果图 | 原图弹窗对应所选 Run；比较视图打开各自图片；关闭后保留运行选择与滚动位置。 |
   | 查看任务与补充回答 | 详情展示输入、执行要求与产物；回答关联问题产物，Agent 用同一 Task ID 经 get 读取。续行消息只包含执行要求与 Task ID。 |
   | 编辑执行要求后继续已有任务 | 原任务保留执行要求快照与固定输入；新任务使用当前配置。 |
   | 修改绑定后继续已有任务 | 新任务使用当前配置；原任务、实验各轮和 Run 保留接纳时的配置快照。 |
   | 本次覆盖运行预设 | 本次运行任务或开始实验请求使用所选预设；随后恢复默认绑定；其他功能继续使用各自配置。 |
   | 添加、编辑、移除自定义功能 | 入口位于任务类型指定区域，产物符合该类型合同；移除入口后历史任务可读。 |
   | 保存配置后再次发起任务 | 功能保留本次保存的内容，再次发起任务使用该内容。 |
   | 选择 Agent 模型 | 提供商切换后更新模型选项；模型切换后更新推理等级；保存后按现有 selectModel 字段传入。 |
   | Agent 配置持续生效 | 刷新保留功能配置；并行任务使用各自的模型选择；修改配置后，已有任务及实验继续使用启动时的选择。 |
   | Agent 模型能力变化 | 已选项失效时提示重新选择；模型没有推理等级时省略 reasoningEffort。 |
   | 选择不同 Agent 预设 | 名册包含 Agent Studio 自建项；Skill、工具与子 Agent 来自实际执行组合。 |
   | 预设被修改、移除或装配失败 | 按第 5.3 节处理；历史记录可读，能力缺失时显示缺失项及重选入口。 |
   | 暂停与继续实验 | 暂停后停止接纳后续轮次；用户点击继续后，Agent 沿用同一 Task ID 与 Session 读取已有轮次，再执行后续轮次。 |
   | 创建耗时任务 | 接纳请求返回 Task ID；Agent 继续异步执行，页面可操作并持续获取状态。 |
   | Agent 提交生成输入或问题 | workbench task publish 接收 task_id 与 artifact；回执与页面投影均保留相同 Task ID。 |
   | Agent 空闲且 Run 仍在执行 | 任务保持等待生成，运行卡片继续更新。 |
   | 任务的主 Agent 与子 Agent 均空闲，缺少必需产物，且当前没有待回答问题或未结束的 Run | 显示待处理，保留已有产物，提供查看会话与继续入口。 |
   | 多个任务并行或快速切换分支 | 查询按工作共享，返回数据按业务归属显示；过期响应丢弃。 |
   | 页面隐藏、断连与重新打开 | 后台任务继续；重新显示或连接恢复后立即查询；连接错误显示在连接状态中。 |
   | 用户填写自然语言需求与生成模型 | Agent 读取实际 Skill，产物经接纳后显示在提示词编辑框；用户无需手工抄录 Prompt。 |
   | 用户指定 Skill | requested_skill 保存名称或 null；目录由宿主提供；产物记录实际读取来源；不可加载时显示具体缺失项。 |
   | Agent 请求补充输入 | 页面显示问题，回答进入同一任务会话并继续原任务。 |
   | 生成或改写提示词、建议参数 | 分别返回 prompt 与 parameters 产物，并更新对应字段。 |
   | 未选实例或模板时生成提示词 | 弹窗可提交，产物回填正向、负向提示词。任务不创建 Run。 |
   | 弹窗填写要求后关闭或刷新 | 原内容恢复；缺少参数建议所需资源时，在同一弹窗补选后提交。 |
   | Agent 返回期间用户修改或切换分支 | 产物仍归属原目标；冲突时显示候选，原输入和当前草稿均保留。 |
   | 用户选择运行一次并点击运行任务 | Agent 用固定输入调用现有 submit；Host 接纳 1 个 Run，并按 Run 终态完成任务。 |
   | Agent 提交生成 | 共用生成接纳入口，保留任务、会话、Tool Call 与固定生成输入关系。 |
   | 资源查询与选择 | 目录与 MCP 使用同源记录；人工和 Agent 读取同一分支选择。 |
   | 子分支继续派生、查看历史记录 | 树和分支图显示子分支的来源 Run 或任务产物；子分支继承来源的输入；原任务产物与 Run 继续可查。 |
   | 重试失败运行 | 原 Run 保留失败状态、输入与错误；重试创建独立 Run，并记录原 Run 的标识。 |
   | 使用相同生成输入发起多次任务 | 每个 Run 都有可点击的独立卡片；查看、比较及 Agent 评价均指向选中的 Run。 |
   | 图片分析与运行比较 | Agent 使用真实媒体和输入；评价区分观察、判断与不确定内容，并给出证据引用。 |
   | 经验与收藏复用 | 按底模查询，来源可追溯；跨底模创建复验分支。 |
   | 持续实验 | 首轮使用初始生成输入；后续完整候选来自 Agent 产物；运行次数符合设置。 |
   | 实验中更换模型、模板与资源 | 每轮可调整底模、生成模型、模板、LoRA、参考图路径、提示词及全部模板参数；历史输入继续可查。 |
   | 实验使用另一模板的参数 | 接纳与展示依据该模板描述；通用请求保留该模板的全部参数；准备失败仍保留 Run 与候选输入。 |
   | 中断与继续任务 | 用户中断后保留产物与已提交 Run；点击继续后，Agent 在原 Session 中按同一 Task ID 读取已取得的结果。 |
   | 模型执行失败或产物格式错误 | 任务保存错误与已完成结果；页面显示可继续的位置。 |
   | 新增一种底模与模板 | 参数描述驱动字段展示，Skill 由目录发现，执行流程共用。 |

2. 每条 Agent 验收证据记录用户原文、任务 ID、执行要求快照、预设快照、实际组合来源及官方调用轨迹。证据附有该场景产生的产物、实际写入字段、Run 与媒体。完整调用轨迹复用官方导出。
3. 当前浏览器原型使用固定产物样例。原型验收覆盖交互、结构接收、非法响应拒绝和页面回填。真实 Agent 语义与 ComfyUI 输出须在官方 Desktop 验收；每个功能使用不同需求，保存实际工具调用、提交产物与页面值，并由审阅者核对需求与结果。
4. 实施者必须对最终候选代码运行 [`pnpm quality`](../system/testing.md) 和 `git diff --check`，并确认两项通过。官方 Desktop 验收按 [worktree 规范](../agents/worktree-development.md)执行。

## 8. 非本次目标

1. 通用操作日志、独立事件流水、收藏集与归档管理。
2. 自建 Agent 推理循环、Skill 调度器或独立聊天平台。
3. 并行实验调度、历史 Run 自动归类与批量迁移。
4. NovelAI 接入、跨设备同步与跨 Workspace 共享。

## 9. 已获得的授权

1. 用户已授权在独立 worktree 中分别交付源码调研、架构设计与交互原型。
2. 用户已授权整合现有工作台目录功能，保留最小核心功能和运行追溯。
3. 用户已明确要求由 Harness Agent 与 Skill 执行业务流程，并为全部原型操作建立后端架构与流程映射。
4. 用户已授权只读查看生产 Agent Studio 预设，并在原型中加入预设选择。
5. 用户已要求按前台功能配置 Agent 预设、提供商、模型与推理等级。配置中心允许添加自定义功能配置。
6. 用户已明确允许持续实验中的 Agent 调整生成输入，包括模型、模板和全部生成参数。
7. 用户已选定执行要求只含步骤与 Task ID 定位符；业务数据与格式通过任务工具及帮助读取。
8. 用户已要求逐项连接原型输入、任务工具、产物与页面写入，并通过显式 Task ID 区分并行任务；生成清单计划扩展 workbench_task_id。
