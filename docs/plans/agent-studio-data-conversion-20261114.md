---
文档用途: 规定将 ComfyUI 预设内容转换为原有 Agent Studio 配置并创建绑定预设的执行范围。
读取时机: 准备转换数据、操作开发 Profile 或核对转换结果前。
---
# ComfyUI 预设数据转换计划

## 1. 名词定义

1. 原版 Studio：生产已安装的 `dsh-agent-studio@0.1.8`，对应源码位于 `/Users/fzfz/.dsh/work/dsh-agent-studio`。
2. 四池：原版 Studio 的 `agents`、`promptSets`、`toolSets` 和 `skillSets`。
3. 来源预设：当前仓库的工作台、翻译和 7 个专用预设。
4. 空壳预设：计划执行者通过原版 Studio 的新建入口复制来源预设，再移除已迁入提示词集的正文配置，并绑定四池中的对应 Agent 后得到的预设。
5. 开发 Profile：本次独立 worktree 专用的官方 Desktop 持久环境。
6. native 模式：模型通过宿主提供的工具声明直接发起工具调用，沿用来源预设的 `mode: native` 配置。

## 2. 总目标

1. 计划执行者将来源预设的正文、工具名称、Skill 名称和模型选择转换为四池数据。
2. 计划执行者通过原版 Studio 界面导入四池，创建 9 个空壳预设，分别绑定对应 Agent。
3. 计划执行者交付原生导入 JSON、来源与目标映射、保存后的绑定记录和开发环境验收证据。

## 3. 现状调研

1. 原版字段与约束由原版 Studio 的 `src/host/types.ts`、`src/host/config.ts` 定义。提示词正文位于 `promptSets[].sections[].text`；工具集与 Skill 集保存已注册名称。
2. 原版 `src/client/parts/panel-transfer.ts` 定义版本为 `2` 的四池导出格式；`panel-core.ts` 提供导入、创建预设、绑定和保存操作。
3. 原版 `src/host/api.ts` 提供 `/api/dsh-agent-studio/config` 的读取与保存入口。保存调用宿主 `settings.update('agent-studio', patch)`，数据归属当前 Profile。
4. 原版 `src/host/presets.ts` 的创建入口接收 `from`、`id`、`name` 和 `description`，将来源构成保存为 `createdPresets[].presetYaml`。
5. 来源预设清单见 [预设注册表](../../agent-presets/presets.cordis.yml)。工作台与翻译正文分别位于各自的 `agent.cordis.yml`；专用角色正文与范围见 [角色配置](../../config/workbench-agent-roles.json)。

## 4. 面临的问题

1. 来源预设将业务内容放在 YAML 和角色配置中，需要按四池字段保存后，才能通过原版 Studio 管理集合与 Agent 的关系。
2. NoobAI 工具名称由运行时 MCP 服务提供，计划执行者需要读取实际工具清单，才能填写对应工具集。
3. 四池保存操作按数组整体替换数据，开发 Profile 中已有条目和绑定可能受到影响。
4. 来源预设包含宿主动态提示词段，转换时需要确定 native 模式所需的段引用。
5. 来源 persona 的 `complete: true` 会使宿主直接采用固定正文；空壳预设需要移除该正文配置。

## 5. 数据转换与实施方案

### 5.1 数据流与职责

1. 本次执行遵循以下数据流。

   ```mermaid
   flowchart LR
     A[来源预设正文与范围] --> B[Studio 版本 2 四池 JSON]
     C[运行时工具与 Skill 名称] --> B
     B --> D[原版 Studio 导入与保存]
     E[来源预设能力构成] --> F[原版 Studio 新建预设]
     D --> G[原版 Studio 绑定 Agent]
     F --> J[转换新建预设的原生 YAML]
     J --> G
     G --> H[当前开发 Profile]
     H --> I[原版 Studio 与官方宿主装配]
   ```

2. 原版 Studio 负责编辑、保存、绑定与装配。现有 ComfyUI 组件继续提供工具和 Skill。

### 5.2 字段映射

1. 计划执行者使用以下原生字段。

   | 来源内容 | 目标字段 |
   | --- | --- |
   | 角色身份与名称 | `agents[].id/name` |
   | 业务正文与输出要求 | `promptSets[].sections[].name/enabled/text` |
   | 宿主动态提示词段 | `promptSets[].sections[].name/enabled` |
   | 工具名称 | `toolSets[].tools` |
   | Skill 名称 | `skillSets[].skills` |
   | 集合选择 | `agents[].promptSets/toolSets/skillSets` |
   | 已有固定模型 | `agents[].model` |
   | 原版 Studio 界面创建的预设构成 | `createdPresets[].presetYaml` |
   | 禁用运行时上下文的 Agent 选择 | `runtimeContextOff` |
   | 预设与 Agent 绑定 | `bindings.presets[].presetId/agentId` |

2. 计划执行者保留原正文、顺序和动态引用。翻译 Agent 的 `model` 保存来源模型；其余 Agent 保留模型继承。会话选模遵循原版 Studio 与官方宿主的规则。
3. 来源预设未配置固定子 Agent 名单。计划执行者保留现有业务派发方式，将 `children` 设为空数组。

### 5.3 实施步骤

1. 计划执行者保留 `codex/agent-studio-composition` 分支及其 worktree 的 `.local/desktop-development/real-business-environment` 数据。停止该环境的实例 `a7f6c3f7-c5bd-498b-ac39-726e8bcc5e3d`。在本次开发 Profile 载入原版 Studio 及当前 ComfyUI 包，核对安装文件与来源一致。
2. 计划执行者读取来源预设、原版四池现状及运行时工具和 Skill 清单，保存转换前快照。NoobAI 名称以实际 MCP 返回值为准。
3. 计划执行者为来源预设分别生成 Agent、提示词集、工具集和 Skill 集，使用独立标识，并保留 native 模式需要的宿主动态段引用。保存 `docs/verification/agent-studio-data/four-pools.json` 和 `mapping.json`。
4. 计划执行者检查 JSON 字段、标识唯一性、引用存在性、集合内及同一 Agent 装载范围内的重复项。通过原版 Studio 界面的导入入口加载四池并保存，保留已有无关条目和绑定。
5. 计划执行者在原版 Studio 中逐个选择来源预设，创建名称可区分的预设。停止开发实例后，通过官方 YAML 适配器读取 Profile，转换这些新建条目的 `createdPresets[].presetYaml`。按来源文件位置处理 include、嵌套 group 和 patches，移除已迁入提示词集的 persona 正文及固定段设置，保留工具、Skill、模型组件、隔离配置与资源路径。将翻译的运行时上下文选择保存到 `runtimeContextOff`，保留无关配置。
6. 计划执行者重启开发实例，在原版 Studio 界面为各空壳预设选择对应 Agent，保存绑定。
7. 计划执行者重新读取配置并查看界面，核对 9 组映射及对应正文、工具和 Skill 名称。在原版 Studio 界面修改一个提示词集，核对实际投递给模型的提示词是否同步变化，再恢复来源正文。
8. 计划执行者通过 native 会话核对实际提示词和工具调用，保存会话证据。工作台生命周期验收按[测试规范](../system/testing.md#preset-与子-agent-合同)执行。重启时分别保存重启前、后配置快照，逐字段核对预设、集合和绑定。
9. 计划执行者将读取结果、运行身份、验收结论和证据路径写入 `docs/verification/agent-studio-data/acceptance.json`。按用户检查要求保留开发实例，并报告实例身份。
10. 执行时若现有功能无法表达来源内容，计划执行者须说明具体内容与实际限制，再取得范围变更授权。

## 6. 方案待决策项清单

1. 当前无待决策项。

## 7. 计划验收清单

1. 原版 Studio 的界面、源码和安装文件与已核对来源一致。
2. 四池 JSON 可通过原版界面导入，所有 Agent 引用均能解析。
3. 9 个空壳预设分别绑定正确 Agent，来源预设和已有无关配置仍可读取。
4. 自定义正文与来源一致；动态提示词段保留引用方式。
5. 工具名称与 Skill 名称来自实际可用清单；native 会话使用对应选择。
6. 翻译模型及其他 Agent 的模型继承方式与来源一致。
7. 保存后重新打开和应用重启后，四池、预设及绑定保持一致。工作台通过测试规范要求的生命周期验收。
8. 原有 Studio 界面可编辑本次数据。计划、数据与验收记录通过独立审阅。
9. 本次提交只包含计划、转换数据与验收材料。计划执行者对最终候选树运行仓库要求的质量门禁和 `git diff --check`。

## 8. 非本次目标

1. 修改 Agent Studio 或 ComfyUI 的产品代码、界面和存储格式。
2. 新增独立提示词池、接入服务、运行装配器或插件管理机制。
3. 修改生产 Profile、替换生产插件、发布版本或升级宿主。
4. 改写业务提示词、增加原配置没有的子 Agent 关系，或修复 PTC 模式。

## 9. 已获得的授权

1. 用户已授权执行数据转换，将来源内容转换为原版 Studio 支持的数据格式。
2. 用户已确认通过原有界面创建空壳预设，并绑定 Agent 池中的对应 Agent。
3. 用户已要求在独立 worktree 启动环境供人工检查；本次继续使用隔离的开发 Profile。
