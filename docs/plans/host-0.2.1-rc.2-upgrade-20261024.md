---
文档用途: 定义 Harness ComfyUI 插件适配 DeepSeek Harness 0.2.1-rc.2 的实施方案、依赖安装范围和验收条件。
读取时机: 用户批准升级方案前，以及实施者修改插件、安装依赖或执行官方 Desktop 验收时。
---
# DeepSeek Harness 0.2.1-rc.2 插件升级方案

## 1. 名词定义

1. 目标宿主：官方 DeepSeek Harness Desktop `0.2.1-rc.2`；源码标签与固定提交见[兼容性调研第 1 节](../research/host-0.2.1-rc.2-compatibility.md#1-调研基线)。
2. 产品 Preset：用户当前使用的 `ComfyUI工作台预设` 和 `ComfyUI迭代预设`。
3. 角色 Preset：供子 Agent 使用的工作台任务、构图、生成、观察和比较五种独立配置。
4. 接纳回执：宿主接受任务后返回的子会话 ID 或消息 ID。完成通知：宿主在子任务结束及资源释放后发给父 Agent 的状态与结果。
5. 实施者：批准本方案后修改仓库并执行测试的 Agent。验收者：核对官方应用、请求记录和业务产物的 Agent；独立 Reviewer 负责对应审查。

## 2. 总目标

1. 实施者在 `/Users/fzfz/.codex/worktrees/host-0-2-1-rc-2/harness-comfyui`、分支 `codex/host-0-2-1-rc-2` 完成插件候选 `0.47.0`，将支持基线固定为目标宿主。
2. 候选插件须通过第 7 节全部验收，交付源码、安装包、精确依赖记录和官方 Desktop 证据。源码基点为 `47962bbb3dcb4a273a4356d0054cf5f0b0add236`。
3. 本方案的批准范围由第 6、9 节共同确定。

## 3. 现状调研

1. 方案编写时，源码基点的插件为 `0.46.2`，DSH peers 与 Desktop 测试配置使用 `0.2.0-rc.2`；本机官方应用已安装目标宿主。接口证据集中在[兼容性调研第 2 节](../research/host-0.2.1-rc.2-compatibility.md#2-已确认的接口差异)。
2. 两个产品 Preset 共用 [project-iteration-dispatch.mjs](../../agent-presets/project-iteration-dispatch.mjs)。源码基点的派发配置包含角色文本和工具过滤条件，工具等待子任务结束后返回；该约定也出现在迭代 Skill 和预设开发规范中。
3. Workspace、CLI 调用身份和 Run 归属由插件读取 Session header 与官方 Workspace registry 后确定。目标宿主另有当前工作目录状态；两种目录的职责见调研第 2.5 节。
4. 源码基点的 TypeScript 配置覆盖产品 TypeScript 源码，Preset 的 `.mjs` 接口调用尚未纳入类型检查。配置见 [tsconfig.json](../../tsconfig.json)。

### 3.1. 依赖审计证据

1. [dependency-audit.json](../verification/host-0.2.1-rc.2/dependency-audit.json) 保存本轮 npm 元数据、精确解析版本、依赖关系、peer 约束和 OSV 查询。审计覆盖 299 个包版本：插件开发与运行闭包包含 268 个，宿主 Preset 另外引用 31 个。当前锁文件中的 184 个版本也在审计范围内。
2. 插件闭包的 OSV 查询返回零条公告，已解析 peer 约束均满足。清单中 `fsevents@2.3.3` 声明 `install: node-gyp rebuild`；本方案的依赖安装统一关闭生命周期脚本。
3. 待采用的直接版本保存在 [proposed-package.json](../verification/host-0.2.1-rc.2/proposed-package.json)：DSH peers 使用目标版本，Cordis 为 `4.0.5`、Schemastery 为 `3.18.5`、Include 为 `1.0.10`；增加公共 `dsh-subagent` 类型依赖，移除已退役的 `dsh-invariants`。其他直接构建与运行依赖采用当前精确版本。
4. [proposed-sdk-package.json](../verification/host-0.2.1-rc.2/proposed-sdk-package.json) 固定开发 SDK 视图的 57 个直接包。该视图用于公共接口类型和测试；产品运行时的宿主服务由官方 Desktop 提供。
5. 元数据解析尚未形成包管理器安装锁。实施者须在安装前核对最终锁文件与本清单，并重新查询公告；新增包、清单外版本或新增公告须先形成补充审计及对应授权。

### 3.2. 宿主 MCP 依赖公告

1. 目标标签的 `dsh-mcp-client` 依赖 `@modelcontextprotocol/client@2.2.0`。该版本命中中危公告 [GHSA-6prh-2h8m-c8cw](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw)，修复版本为 `2.3.0`；查询结果保存在 [host-mcp-advisory.json](../verification/host-0.2.1-rc.2/host-mcp-advisory.json)。
2. 公告描述 HTTP 传输在跨源重定向时转发自定义请求头和 MCP 会话头。特定重定向状态还会转发请求体。项目 [NoobAI MCP 配置](../../agent-presets/noobai-mcp.cordis.yml) 使用固定 loopback 地址和 Streamable HTTP，使用了公告列出的传输路径。
3. [官方 createTransport() 函数](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/mcp/mcp-client/src/transport.ts) 只向 SDK 传入请求头。该依赖属于宿主，修复该依赖需要宿主提供相应版本。
4. 验收者须核对应用实际加载的包身份，并记录本轮固定端点的响应与重定向情况。目标宿主的已知风险接受项见第 6 节 D4。

## 4. 面临的问题

1. 当前版本声明会使目标宿主拒绝插件；基础 Cordis 系列版本也低于目标 SDK 的 peer 要求。
2. `startContinuable()`、创建参数中的 `persona` 和 `toolFilter` 已被目标宿主移除。现有五种子任务无法按当前创建路径建立所需角色。
3. 插件通过多个事件自行等待任务完成，迭代 Skill 又依赖这一返回时机。首次创建与续派必须采用一致的接纳、通知和恢复约定。
4. 独立角色 Preset 会增加官方列表中的条目。目标宿主的 [Preset 列表接口](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset-registry/src/index.ts) 返回全部声明，当前公共类型没有隐藏字段。
5. 工作目录、凭据优先级和 Remote 扩展发生变化，源码签名核对仍需官方应用中的业务结果验证。

## 5. 问题的解决和实施方案

### 5.1. 架构与职责

1. 实施者按下图划分宿主与插件职责。

   ```mermaid
   flowchart TD
     P[两个产品 Preset 的父 Agent] --> D[插件角色派发工具]
     D -->|首派 startActivation + agentPreset| H[宿主 Subagent Runtime]
     D -->|续派 sendMessage| H
     H -->|接纳回执| P
     H --> R[五个独立角色 Preset]
     R --> S[包内 Skill 与前台 Shell]
     S --> C[插件 managed CLI]
     C --> I[调用身份与 Workspace 校验]
     I --> B[生成与读图业务]
     H -->|完成通知| P
     B --> F[Run、媒体与结果文件]
     P --> F
   ```

2. 宿主负责子会话创建、续派、调度、中断、结束通知和资源释放。插件负责角色参数、业务输入准备、Workspace 关联及结果文件合同。
3. 角色 Preset 的 YAML 负责角色文本与工具组合；`presets.cordis.yml` 负责注册，`config/product-agent.json` 保存受管 ID 引用。公共 Shell、Skill、提示词可见性和 compaction 组合抽取为包内共享 include，各角色只声明自身差异。
4. 实施者保留两个产品 Preset 的 ID、名称和用户入口，增加下表五个角色。全部项目 Preset 使用各自隔离的 Skill service；角色配置通过组合所需工具限定能力。

   | 角色 | 计划使用的 Preset ID | 创建入口 |
   | --- | --- | --- |
   | 工作台任务 | `harness-comfyui-task` | `subagent_task` |
   | 构图 | `harness-comfyui-composition` | `subagent_composition` |
   | 生成 | `harness-comfyui-generation` | `subagent_generation` |
   | 观察 | `harness-comfyui-observation` | `subagent_observation` |
   | 比较 | `harness-comfyui-comparison` | `subagent_comparison` |

5. 角色 Preset 加载对应 persona、包内 Skills、前台 Shell、NoobAI MCP 和 Workspace 关联组件。派发、子任务中断及 Goal 工具仅由需要这些能力的产品 Preset 声明；官方默认 Preset 和默认模型继续由用户选择。

### 5.2. 派发、完成与恢复合同

1. 首派调用 `startActivation()`，显式选择 `delivery: parent` 与角色 `agentPreset`，沿用当前角色模型配置和委派深度。工具在接纳后返回 `{ kind: continuable, subagentId }`。
2. 续派调用 `sendMessage()`，使用原有子会话的 ID，接纳后返回 `{ messageId }`。`startActivation()` 的 `childId` 是创建身份参数，禁止使用该参数恢复已有会话。
3. 完成状态和最终答复由宿主通知提供。父 Agent 记录接纳身份，取得对应结束通知及结果文件后，才派发依赖该结果的任务。构图和生成复用会话，观察和比较按轮次创建会话。
4. 实施者删除 `observeCompletion()` 及其事件缓存、监听器和等待分支，同步修订工具描述、迭代 Skill 与预设开发规范。宿主接纳前的取消通过派发信号终止创建；接纳后的子任务由父 Agent 使用 `interrupt_agent` 显式停止。父 Agent 使用 `list_agents` 查找已有子会话 ID，再按第 2 项续派。
5. 实施者为共享派发组件添加 JSDoc 公共 SDK 类型，并通过专用 `checkJs` 配置检查受影响的 Preset 适配文件。测试从已注册 Tool 的执行入口调用组件，验证第 1 至 4 项公开行为。

### 5.3. Workspace、凭据与业务接口

1. Workspace 归属继续由 Session header、真实调用记录和官方 registry 确定；Shell 的实际目录按宿主当前工作目录执行。实施者验证目录切换后 Run 仍归属于原 Session 的 Workspace，以及子 Agent 首个 step 前完成同一 Workspace 的关联。
2. 实施者为同一 Workspace 子目录、切换至另一 Workspace 的目录、子会话冷恢复和跨 Workspace 媒体引用补充合同测试。相对文件路径按实际 Shell 目录解释，业务归属按第 1 项确定。
3. 图片读取配置继续通过官方凭据服务操作引用。验收者分别验证保存值覆盖环境值、清除保存值后的环境回退、缺少凭据和只读引用。验收者随后核对重启后的表单与读图请求。
4. Client、Remote、managed CLI、Generation Run 和图片读取沿用现有业务边界。实施者对已证实的接口差异修改所属模块，并以调用结果验证；若发现超出本方案的架构问题，先补充原因、影响和验收方案，再取得对应授权。

### 5.4. 实施步骤

1. 实施者按第 3.1 节精确清单建立 worktree 专属依赖视图，生成并审计锁文件，关闭安装脚本后安装。实施者保存最终安装版本和 peer 解析记录，再接入 worktree 的构建与测试。
2. 实施者先为版本接纳和 Preset 加载写失败测试，再更新根 `package.json`、锁文件及 `config/desktop-e2e.json`。`engines.dsh` 与 DSH peers 固定目标宿主；打包测试核对候选 manifest 和所有导出资源。
3. 实施者按一个公开行为一组红绿测试的顺序迁移首派、续派和取消。随后建立五个角色 Preset、共享组合和资源校验。对应测试入口包括 `native-workbench-subagent`、`native-iteration-roles`、`native-subagent-completion`、`installed-presets` 及插件打包测试。
4. 实施者同步修改迭代 Skill 的通知等待、结果读取和中断恢复说明。实施者遵循 `skill-creator`、`writing-for-agents` 和项目 Skill 开发规范，完成审阅及执行验证。Skill 目录内的脚本修改须另列具体路径取得授权。
5. 实施者完成第 5.3 节的针对性回归，再运行 `pnpm test:desktop`。验收者核对官方应用安装候选包、界面入口、生命周期和生成与读图流程。
6. 验收者按 [worktree 开发规范](../agents/worktree-development.md) 启动持久 development probe，执行第 7 节真实模型矩阵。测试凭据只从 `config/desktop-e2e.json` 声明的主 checkout `.env` 变量读取，并传给本轮应用进程。
7. 实施者同步 `README.md`、当前版本说明及受影响的系统和预设规范。独立 Reviewer 分别完成 Standards、Spec 与文字语义审查；实施者处理问题后，对最终候选树运行 `pnpm quality` 和 `git diff --check`。
8. 验收者停止本轮 probe，确认进程与端口释放，保留 worktree 专属 Profile、Workspace 和证据。最终树通过全部门禁后，实施者在任务分支提交候选，并交付安装包及验收索引。

## 6. 方案待决策项清单

1. 实施者按第 9 节授权执行。

   | 编号 | 已确认内容 | 执行范围 |
   | --- | --- | --- |
   | D1 | 宿主范围与插件版本 | 候选 `0.47.0`，支持基线精确固定为目标宿主。 |
   | D2 | 角色配置与界面 | 两个产品 Preset 保留身份；五个角色 Preset 以明确角色名称出现在官方列表。 |
   | D3 | 派发返回时机 | 采用第 5.2 节的异步接纳与宿主完成通知合同。 |
   | D4 | 宿主 MCP 已知风险 | 用户接受第 3.2 节所述风险，并授权本轮隔离验收使用现有固定 loopback 端点。验收者记录响应；生产使用另行决策。 |
   | D5 | 安装与执行权限 | 授权第 3.1 节审计清单内依赖的隔离安装及构建、测试用途执行，安装脚本关闭；授权官方 Desktop 隔离安装候选插件并完成自动化与真实业务验收。 |

## 7. 计划验收清单

1. 验收者逐项记录下表结论和证据。测试接口为插件包 manifest、官方 Preset registry、已注册 Tool、官方 Workspace 与凭据服务、CLI 入口和 Desktop UI；类型检查使用目标公共 SDK。

   | 编号 | 验收内容 | 通过条件与证据 |
   | --- | --- | --- |
   | H1 | 依赖与包身份 | 最终锁文件全部版本属于获准清单；插件依赖公告门禁通过；宿主已知公告单列。官方应用版本符合目标宿主版本；实际加载的插件版本与候选版本及 tarball manifest 一致。证据记录插件实际加载路径。 |
   | H2 | Preset 与 Skill 作用域 | 七个项目 Preset 各注册一次，角色文本与工具集合符合配置；全部包内 Skill 与参考资源可读。仓库外 Workspace 可用，其他 Preset 保留自身 Skill 来源。 |
   | H3 | 子任务生命周期 | 五种首派均返回真实子会话身份；首派与续派在工作结束前返回接纳回执；同一子会话续派和冷恢复成功。失败、接纳前取消、接纳后中断、父任务结束及并发子任务均有结果与清理证据。 |
   | H4 | Workspace 与 CLI | 第 5.3 节目录矩阵通过；父子会话和 Run 归属正确。CLI 使用 Host Electron Node；成功、失败、取消和 capability 撤销符合合同，跨 Workspace 媒体请求得到拒绝。 |
   | H5 | 凭据与设置 | 第 5.3 节凭据矩阵通过；保存、清除、应用重启和插件重装后的实际请求与界面配置一致。证据只记录凭据引用及来源。 |
   | H6 | 官方界面与 Remote | 插件管理、上下文选择、输入区、会话头、侧栏、设置、媒体展示与下载可用；Remote 请求使用实际会话身份并成功完成业务操作。 |
   | H7 | 真实模型与 Skills | 按包内资源清单逐个验证项目 Skill 的实际读取和任务执行，记录参考路径与 CLI 输入输出；工作台首派和续派成功，迭代预设完成四角色及后续派发。 |
   | H8 | 生成、读图与历史 | 两个产品 Preset 分别完成真实 ComfyUI Run；Run、prompt ID、实际参数、Workflow、媒体及界面结果一致。本地图片与 Run 媒体读图成功，独立审阅有图像依据；重启后历史参数与媒体仍可读取。 |
   | H9 | 安装与资源释放 | 官方候选包安装、启停、卸载重装、失败恢复和配置数据保留通过；独立实例互不影响。结束后本轮进程、端口、监听器及调用 capability 释放，持久数据保留。 |
   | H10 | 最终候选 | Standards、Spec 和逐文件独立语义审查通过；最终树的 `pnpm quality` 与 `git diff --check` 通过；候选提交、安装包与验收索引可对应。 |

2. H7、H8 的真实模型条件及 Run 证据字段按[官方 Desktop 插件方案的真实验收规范](official-desktop-plugin-20260929.md#最终真实模型与正式-comfyui-run-验收)执行。验收者使用执行时可用且价格为零的 OpenRouter 模型，并保存价格证据。对话、子 Agent 和视觉任务须分别采用支持对应能力的模型。
3. 修改后的迭代 Skill 须由独立干净上下文的队员执行。实施者提供准确工作目录、Skill 路径及任务参数，在队员执行期间仅观察调用轨迹和产物；验收者核对首派、通知、文件交接、续派及中断恢复。
4. 证据保存于 `docs/verification/host-0.2.1-rc.2/`；大体积日志、截图和媒体保留在本轮 `.local/desktop-e2e/` 记录目录，由验收索引指向。每项结果包含版本、Preset、模型、Workspace、Session、子 Session、Tool Call 和适用的 Run ID。
5. 遇到服务不可达、免费模型不可用或结果缺失时，验收者记录实际原因。对应验收项保持未通过状态。

## 8. 非本次目标

1. 发布 tag、GitHub Release、推送、合并和生产插件切换由各自授权控制。
2. 生产历史迁移、旧部署退役、生产目录写入和用户日常 Profile 修改属于其他任务。
3. 官方宿主源码及安装包修改、MCP SDK 的宿主内替换属于其他任务。其他操作系统适配、额外模型接入和业务功能扩展也属于其他任务。
4. 兼容其他宿主版本及 Skill 脚本重构属于其他任务。

## 9. 已获得的授权

1. 用户已授权创建独立 worktree，调研目标宿主变更，并确认本方案的任务范围。
2. 用户于 2026-10-24 确认 D1 至 D5，并明确要求实施。
3. 当前授权覆盖第 5.4 节的隔离依赖安装、仓库修改、官方应用验收和任务分支本地提交。
4. 第 8 节所列操作继续按各自授权执行。新增依赖或安装脚本需求按第 3.1 节处理。
