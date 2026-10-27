---
文档用途: 规定 ComfyUI 工作台的预设装配、宿主能力复用和故障验收方案。
读取时机: 审批本次改进方案、实施预设与插件改动、验收工作台主会话和子会话时。
---

# ComfyUI 工作台预设装配与宿主能力复用改进方案

## 1. 名词定义

1. **宿主**指 DeepSeek Harness。宿主提供 Agent 运行循环、会话、模型调用、工具注册、Skill 发现和插件生命周期。
2. **工作台预设**指 `harness-comfyui-cli-candidate`，显示名称为“ComfyUI工作台预设”。预设选择并组合工作台 Agent 使用的组件、提示词、工具和 Skill 来源。
3. **静态提示词**指宿主通过 `systemPrompt.section()` 装配的文字。**运行时上下文**指宿主通过 `systemPrompt.context()` 提供的当前目录、执行状态等信息。
4. **工具声明**指模型请求中各工具的名称、说明和参数结构。**Skill 目录**指宿主向 Agent 提供的 Skill 名称、摘要及正文读取入口。**Skill 文件目录**指宿主扫描 Skill 文件的磁盘目录。
5. **受管 CLI**指插件通过宿主 shell 环境提供的命令入口。CLI 将当前调用的会话身份传给插件业务服务。
6. **实施者**指方案获批后修改代码、配置和测试的 Agent。**验收者**指通过官方 Desktop 核对实际模型请求、调用过程和业务结果的执行者。

## 2. 总目标

1. 工作台完成绘图素材查询、Prompt 设计、ComfyUI 生图和图片分析。工作台还按 Run ID 查询保存的 Prompt、Seed、模型、LoRA 和工作流参数，并将这些数据用于用户指定的后续生成。依据为[产品功能](</Volumes/4Tdisk/work/AI2/harness-comfyui/README.md#L7-L20>)和[预设用途](</Volumes/4Tdisk/work/AI2/harness-comfyui/CONTEXT.md#L91-L97>)。
2. 预设装配的每类内容都应服务上述任务。主会话与子会话采用同一业务组合，运行状态由宿主分别提供。
3. 本次从文件交付提示词故障出发，修正同类提示词、工具和 Skill 的进入方式。插件将通用 Agent 能力交给宿主，将 ComfyUI 执行、Run 数据、图片处理和工作台界面保留为业务职责。

## 3. 现状调研

### 3.1. 源码与会话证据

1. 第 3 至 5 节记录实施前的故障基准；其中“当前”均指该基准。插件提交为 `2d74f999f64eb2e0ddc9b05af699354be874e3ba`。宿主提交为 `1f81c047fc48fa190a683e469daa699857e9afe8`，版本为 `0.2.1-rc.3`。
2. 本轮内存实验使用已安装的官方应用。该应用报告的构建提交为 `be72761ee1a6736ebcdf4f3739363b083ae53c98`。源码结论与运行实验分别标注来源，详见[原生装配实验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-goal-composition-probe.json>)。
3. 已存[主会话](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-session-ad38e3c4-4aab-4240-9f1c-95bae4fbe225/session.json#L117>)与[子会话](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-83d5bbad-f92f-4744-a9e0-43a5273b2d98/session.json#L120>)收到相同的静态提示词。两者均有 36 项工具声明和 8 项 Skill 摘要。
4. 这两份记录执行的是 Skill 文档读取验收。其中子会话实际调用 `skill` 和 `bash` 读取生成参考。记录证明了内容进入模型请求，生图与图片分析的业务验收按第 9 节执行。

### 3.2. 已进入模型请求的提示词

1. 下表按第 2 节的目标判断各段内容的用途。静态文字见第 3.1 节的两份会话记录。

   | 内容 | 当前来源 | 对工作台任务的作用 |
   | --- | --- | --- |
   | ComfyUI 身份、Skill、MCP 和 CLI 分工 | 工作台 persona | 指明业务目标和执行入口。 |
   | 文件卡、Office 文档、源码 diff、每次文件提及的强制链接格式 | 宿主 `ui-deliverables` | 将文档和源码交付要求带入绘图任务。工作台需要展示生成图片及对应参数。 |
   | 仅用当前源码目录检查或扩展 DSH | 宿主 `harness-dev-context` | 将工作台任务指向宿主开发。 |
   | HMR、Vite、构建 Web 产物和启动开发服务 | 宿主 `harness-dev-context` | 引入与绘图业务无关的构建和启动动作。 |
   | shell 退出码说明 | 宿主 shell 组件 | 帮助 Agent 判断受管 CLI 是否执行成功。 |
   | 并行派发提示 | 宿主子代理工具 | 支持独立任务协作；当前满深度子会话仍收到派发提示。 |
   | MCP 服务说明 | 宿主 MCP 组件 | 帮助 Agent 理解服务入口。 |

2. 当前共享组合还加载了[仓库指令组件](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/shared/agent.cordis.yml#L7-L10>)。该组件可以把工作目录中的开发规范加入后续消息，见宿主[指令加载代码](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/context/agent-instructions/src/index.ts#L127-L175)。本次两份会话没有证明仓库开发规范已进入；验收需另设包含开发规范的 Workspace。

### 3.3. 已进入模型请求的工具

1. 下表覆盖已存请求中的全部 36 项工具。NoobAI 行内名称均带实际前缀 `mcp__noobai__`。完整声明见[主会话工具请求](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-session-ad38e3c4-4aab-4240-9f1c-95bae4fbe225/session.json#L245>)。

   | 数量 | 工具 | 当前用途与重复关系 |
   | --- | --- | --- |
   | 12 | `get_catalog_resource`、`list_prompt_term_categories`、`query_semantic_characters`、`query_semantic_prompt_terms`、`query_semantic_works`、`search_artist_prompt_strings`、`search_base_models`、`search_instances`、`search_loras`、`search_models`、`search_styles`、`search_workflows` | 查询素材、提示词资料及生成资源。 |
   | 2 | `get_instance_status`、`get_instance_queue` | 查询目标实例状态及任务队列，可用于解释生成故障。 |
   | 3 | `get_instance_connection`、`get_instance_node`、`search_instance_nodes` | 提供实例连接和节点诊断信息。当前生成 Skill 通过 CLI 检查模板参数。 |
   | 4 | `query_semantic_comfyui_instances`、`query_semantic_comfyui_templates`、`query_semantic_generation_models`、`query_semantic_loras` | 与 MCP 目录查询重复。 |
   | 4 | `generate_with_comfyui`、`get_generation_run_media`、`inspect_image`、`read_comfyui_run_inputs` | 与当前业务 Skill 使用的 CLI 重复。 |
   | 7 | `bash`、`skill`、`working_directory`、`subagent`、`send_message`、`interrupt_agent`、`list_agents` | 分别支持 CLI、Skill 读取、目录和子任务协作。Windows 使用现有 PowerShell 配置。 |
   | 3 | `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource` | 宿主为已配置 MCP 服务提供的资源访问入口。当前轨迹没有调用记录；按 D2 核对实际资源消费者。 |
   | 1 | `load_workspace_dependencies` | 提供 Office 等通用脚本依赖环境。当前工作台业务已有受管 CLI 和业务服务。 |

2. Core 当前注册了上述 7 项插件工具，Image Reader 注册了 `inspect_image`。注册动作与常驻业务服务同时启动，见[Core 注册入口](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/core/plugin.ts#L148-L154>)和[图片工具注册入口](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/image-reader/plugin.ts#L61>)。
3. 工具知识还会从错误信息进入会话。[工作流参数错误](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/workflow-compiler.ts#L1262-L1319>)要求再次调用 `generate_with_comfyui`。

### 3.4. Skill 的实际发现与来源

1. 已存主会话和子会话均收到 `comfyui-generate`，以及 `office`、`office-docx`、`office-export-pdf`、`office-pptx`、`office-recalculate`、`office-render`、`office-xlsx`。后 7 项分别服务 Office 文档、导出、渲染和重算，超出第 2 节的任务。来源为[主会话 Skill 摘要](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-session-ad38e3c4-4aab-4240-9f1c-95bae4fbe225/session.json#L202-L235>)。
2. 子会话实际读取的是隔离测试 Workspace 中的 `comfyui-generate`，随后读取该 Skill 的生成和模板参数参考。读取路径及内容保存在[Skill 返回](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-83d5bbad-f92f-4744-a9e0-43a5273b2d98/session.json#L2659>)。
3. 当前仓库提供以下 8 个业务 Skill。此清单是当前文件现状，与第 1 项的历史会话清单分开核对。

   | Skill | 工作台用途 |
   | --- | --- |
   | [anima-prompt-builder](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/anima-prompt-builder/SKILL.md#L2-L3>) | 构建 ANIMA3 Prompt，并查询指定 Run 参数。 |
   | [wai-sdxl-prompt-builder](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/wai-sdxl-prompt-builder/SKILL.md#L2-L3>) | 构建 WAI Prompt，并查询指定 Run 参数。 |
   | [krea2-anime-prompt-builder](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/krea2-anime-prompt-builder/SKILL.md#L2-L3>) | 构建 Krea2 Prompt，并查询指定 Run 参数。 |
   | [moss-prompt-builder](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/moss-prompt-builder/SKILL.md#L2-L3>) | 编写 MOSS 图像描述和画面布局。 |
   | [character-portrait-prompt-designer](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/character-portrait-prompt-designer/SKILL.md#L2-L3>) | 根据人物资料设计立绘，并查询指定 Run 参数。 |
   | [comfyui-generate](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/comfyui-generate/SKILL.md#L2-L3>) | 检查生成输入、提交图片任务和查询指定 Run。 |
   | [local-image-reader](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/local-image-reader/SKILL.md#L2-L3>) | 使用独立视觉模型读取本地图片。 |
   | [comfyui-image-review](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/.agents/skills/comfyui-image-review/SKILL.md#L2-L3>) | 对照生成参数与图片，形成下一次生成所用 Prompt。 |

4. [当前包清单](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/config/plugin-package.json>)没有包含这 8 个 Skill 的目录。工作台当前依赖默认目录发现及另外安装的 Skill。方案需要把业务 Skill 的交付来源一起确定。

### 3.5. 宿主复用与插件业务职责

1. 下表区分已复用的能力、重复入口和业务实现。

   | 能力 | 当前实现 | 职责判断 |
   | --- | --- | --- |
   | 预设注册、父子组合 | 原生 AgentPreset、Cordis include、`composeFrom()` | 已复用宿主。[安装入口](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/project-installed-presets.mjs>)负责包内路径定位。 |
   | 子代理创建、续派、中断、查询 | 原生 `spawn` 与子代理控制工具 | 主子 Agent 均使用宿主运行循环。 |
   | Skill 扫描、摘要、正文读取 | 原生 filesystem provider 和 Skill 工具 | 已复用宿主，但来源合并了无关 Skill。 |
   | MCP 连接、重连、声明同步 | 原生 MCP client | 插件只声明[连接配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/noobai-mcp.cordis.yml>)。 |
   | shell 环境和调用生命周期 | `shellEnv.register()`、`tools/result`、`ctx.effect()` | [CLI 接入](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/cli/plugin.ts#L15-L33>)复用宿主，并传递业务身份。 |
   | 目录查询 | MCP 与插件目录 Tool 并存 | Agent 入口重复；内部 HTTP 客户端另有界面和生成准备消费者。 |
   | 生成、Run 查询、媒体、读图 | Tool 与 CLI 共用业务服务 | [CLI 分发](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/cli/dispatch.ts#L25-L72>)与直接 Tool 的输入适配重复。 |
   | 自定义视觉服务调用 | 自制 HTTP 请求与原生 LLM 路径并存 | 协议请求职责重复。 |
   | Workflow 编译、生成状态、Run 与媒体 | 插件业务服务 | [业务装配](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/core/plugin.ts#L101-L147>)承担 ComfyUI 执行和结果保存。 |
   | 绘图界面、资源选择、输入上下文 | 宿主 Remote、侧栏、输入框扩展位上的业务界面 | [界面接入](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/client/index.tsx#L123-L301>)复用宿主，绘图交互由插件提供。 |

## 4. 面临的问题

1. 工作台 persona 只追加了业务身份，通用文件交付和宿主开发要求仍共同约束绘图任务。
2. Skill 目录同时叠加全局 provider 和默认文件目录。即使当前工作目录只安装绘图 Skill，Office provider 仍会提供 7 个无关摘要。
3. 常驻插件服务同时注册 Agent 工具，导致预设指定的 MCP、CLI 与另外 8 个业务工具并存。
4. 工具声明、错误文案和测试夹具引用了重复入口。仅删除注册语句会留下继续引导调用的文字。
5. 自定义视觉接口重复处理宿主已有的请求协议。归并时必须保留独立模型、服务地址、各份默认 Prompt，以及输出达到上限时的错误含义。
6. 当前验收把默认继承当作正确结果。[作用域夹具](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/tests/production/fixtures/native-workbench-preset-runtime.mjs#L67-L81>)期待全部全局工具；[提示词夹具](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/tests/production/fixtures/native-workbench-preset-runtime.mjs#L120-L138>)期待文件交付和开发段落。这些预期需要按第 2 节改写。

## 5. 根因与证据

### 5.1. 静态提示词使用了追加模式

1. 基准版本的工作台 persona 采用追加模式，宿主因此合入全局静态段落。源码依据见[提示词来源调研](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/research/comfyui-preset-host-reuse-20261026.md#异常提示词的来源与验收偏差>)，单变量对照见[实验结果](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/research/comfyui-preset-host-reuse-20261026.md#验证范围与实验结果>)。

### 5.2. Skill 服务合并了业务之外的来源

1. 工作台加载原生文件发现组件时沿用了默认目录，见[基准配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/shared/agent.cordis.yml#L25-L28>)。宿主已有文件目录配置，实施取值见第 6.2 节。
2. Desktop [Office 装配入口](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/apps/desktop-host/src/office.ts#L28-L37>)另外加载 [Office provider](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/skill-office/src/index.ts#L69-L95>)。该组件向全局 Skill 服务注册 7 个 Skill。工作台当时使用同一服务，因此取得这些摘要。
3. [原生组件对照实验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/research/comfyui-preset-host-reuse-20261026.md#会话结束后的界面-skill-目录查询>)验证了两项配置各自的作用：文件目录配置限定扫描来源；组件组的服务隔离使工作台使用组内 Skill 服务。宿主负责扫描与读取，预设负责选择来源和组件。

### 5.3. 工具注册跟随常驻服务，而非工作台业务入口

1. 插件通过[根组合](</Volumes/4Tdisk/work/AI2/harness-comfyui/cordis.patch.yml#L1-L11>)启动 Core 和 Image Reader。这些组件随即向全局工具服务注册业务 Tool。
2. 工作台通过另一组组件取得 MCP、CLI 和 Skill。两组入口随后共同进入模型请求，形成第 3.3 节中的重复工具。
3. 宿主[子代理组合继承](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/child-agent.ts#L186-L201)使子会话复现同一内容。主子会话需要共同验收。

### 5.4. 验收对象沿用了装配默认值

1. 基准版本的验收将默认内容的继承作为通过条件，具体断言及规范来源见[验收偏差调研第 4 项](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/research/comfyui-preset-host-reuse-20261026.md#异常提示词的来源与验收偏差>)。
2. 现有证据已确认内容来源、进入路径及主子传播。具体内容是否导致模型执行偏航，由第 9 节的同任务对照验证；当前记录没有该对照结果。

## 6. 问题的解决和实施方案

### 6.1. 完整业务 persona 与运行时上下文

1. 实施者在[工作台配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml>)设置 `complete: true`，保留 `includeRuntimeContext: true`。当前目录、沙箱、审批、派发深度和子任务委派信息继续由宿主提供。
2. persona 的完整内容只承担下表职责。Skill 正文继续定义各自的执行步骤。

   | 内容 | 应写清的要求 |
   | --- | --- |
   | 身份与目标 | Agent 是 ComfyUI 工作台助手，按第 2 节处理用户任务。 |
   | 当前输入 | Agent 读取用户要求及工作台注入的素材和 Workflow 上下文。缺少会改变执行结果的信息时，Agent 明确指出缺少的字段。 |
   | Skill 使用 | Agent 根据任务与已提供的 Skill 摘要选择 Skill，读取正文及正文要求的参考。 |
   | 资源入口 | Agent 通过 NoobAI MCP 查询素材、模型、LoRA、Workflow 和实例信息，按照工具声明构造参数。 |
   | 业务执行 | Agent 按业务 Skill 使用受管 CLI 提交生成、查询 Run、取得媒体和读取图片。 |
   | 执行结果 | Agent 核对 shell 退出码及 CLI 结果，依据具体错误修正输入或报告失败。 |
   | 子任务 | Agent 通过宿主子代理工具处理可独立完成的任务；剩余派发深度为 0 时由当前 Agent 完成任务。 |
   | 用户回复 | Agent 使用用户语言，返回所请求的 Prompt、图片结果、Run ID、观察结论或具体错误。生成任务通过工作台结果界面提供图片访问。 |

3. 完整 persona 会替换所有静态段落，包括 shell、子代理和 MCP 单独注册的说明。实施者用上表保留必要的操作要求，并核对当前 MCP `initialize.instructions` 是否包含工具声明之外的业务要求。必要要求在 persona 中维护一次。
4. 实施者从[共享组合](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/shared/agent.cordis.yml#L7-L10>)移除仓库指令组件。工作台继续接收用户任务和业务 Skill；仓库开发规范由开发任务使用的预设加载。
5. 实施者通过原生 `systemPrompt.context()` 在预设中覆盖 `harness:source` 和 `app:web-surface`。同名注册的 `text` 设为空字符串，`order` 设为 `0`，`interpolate` 设为 `false`。宿主处理依据见[同名覆盖](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/core/scope/src/store.ts#L208-L216)与[上下文渲染](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/core/system-prompt/src/index.ts#L330-L337)。
6. 两个上下文名称在预设配置中维护一次。第 6.3 节的接入模块同时注册这些覆盖项。主子请求及原生上下文刷新均已通过[装配实验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-goal-composition-probe.json>)；其他预设继续取得原文。

### 6.2. 通过预设配置限定 Skill 来源

1. 实施者在[共享组合](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/shared/agent.cordis.yml>)配置原生 `cordis:group`，设置 `isolate: { skills: true }`。组内依次加载 `dsh-skill`、`dsh-skill-filesystem` 和 `dsh-tool-skill`。文件发现组件与读取工具使用同一个组内 Skill 服务。
2. 实施者在组内的文件发现组件中配置下表字段。字段合同见[宿主文件目录配置](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/skill-filesystem/src/index.ts#L48-L88>)。

   | 字段 | 工作台取值 | 作用 |
   | --- | --- | --- |
   | `includeDefaultRoots` | `false` | 关闭项目和用户默认 Skill 文件目录的自动加入。 |
   | `bundledSkillDir` | 已安装插件包内的业务 Skill 文件目录，源码为[项目 Skills](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills>)。 | 宿主从插件交付的业务文件中发现 Skill。 |
   | `customSkillDirs` | 默认 `[]`；用户添加目录时，在本预设配置中填写。 | 宿主扫描用户明确加入工作台的额外目录。 |

3. 宿主按配置扫描文件，生成 Skill 摘要并读取正文。第 3.4 节的 8 个名称是当前业务文件的发现结果。文件增删、同名优先级和变更通知沿用宿主机制。
4. 组内 `skill` 工具注册到宿主共享工具服务，供主子 Agent 调用。Office provider 继续使用全局 Skill 服务，其他预设继续使用各自配置的来源。
5. 实施者通过[插件包清单](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/plugin-package.json>)与[预设资源构建](</Volumes/4Tdisk/work/AI2/harness-comfyui/scripts/build/agent-preset-resources.mjs>)交付业务 Skill 正文、参考和脚本。预设沿用包内资源解析方式定位目录，安装目录变化后仍能读取。
6. 开发验收通过官方 Profile patch 将包内目录替换为候选 checkout 的业务 Skill 文件目录。

### 6.3. 工具装配与重复入口删除

1. 实施者删除第 3.3 节列出的 8 项插件 Tool 注册及其专用适配。Agent 的业务执行保留 MCP 和 CLI 两类入口；两者分别负责查询和插件业务命令。
2. 对 `load_workspace_dependencies`，实施者在预设作用域调用宿主 `ctx.tools.restrict({ deny: ['load_workspace_dependencies'] })`。工具名在预设配置中维护一次。拟新增 `agent-presets/workbench-composition.mjs`，将工具名和第 6.1 节的上下文名传给对应原生 API。工具声明、查找、执行和释放均由[宿主工具服务](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/core/tools/src/index.ts#L1105-L1131)处理。
3. 该限制在预设挂载时生效，主子 Agent 继承同一设置。[实验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-goal-composition-probe.json>)同时验证了声明消失和调用返回不存在。被拒绝的同名工具重新注册后仍受限制；其他预设保留原有工具。
4. 这份 `deny` 配置按明确名称工作。宿主升级或插件增减后，验收者重新核对真实工具清单；新增工具先经过第 3.3 节的用途判断，再更新配置和验收。D2 处理当前 MCP 内部能力的细分选择。
5. 实施者按下表处理文件与消费者。

   | 对象 | 实施动作 | 保留的消费者或数据 |
   | --- | --- | --- |
   | [Core 插件](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/core/plugin.ts>)、[Image Reader 插件](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/plugin.ts>) | 删除业务 Tool 注册及专用 imports。 | 业务服务、Remote、CLI 和生命周期。 |
   | [目录 Tool](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/catalog/catalog-tool.ts>) | 删除文件及专用导出。 | Catalog HTTP 客户端和界面查询。 |
   | [生成 Tool](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/generation-tool.ts>)、[Run 参数 Tool](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/generation-run-input-tool.ts>)、[媒体 Tool](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/generation-media-tool.ts>)、[图片 Tool](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/image-reader/image-reader-tool.ts>) | 删除专用 Tool 定义。共享输入合同若仍有业务消费者，迁入对应业务模块。 | Runtime 的生成、Run、媒体及图片读取方法。 |
   | [Tool 身份适配](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/tool-execution-identity.ts>) | 删除随上述 Tool 退出的身份解析。 | [CLI 身份传递](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli/shell-capability.ts>)与[Workspace 访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workspace-access.ts>)。 |
   | [工作流参数错误](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/workflow-compiler.ts#L1262-L1319>)、[错误目录](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/error-catalog.json>) | 改为说明错误字段、有效值及当前 CLI 的修正动作。 | 参数错误的业务含义和错误码。 |
   | [图片设置界面](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client/image-reader/image-reader-settings.tsx#L618>) | 将工具名文案改为“图片读取”等用户功能名称。 | 多份配置、独立模型和默认 Prompt。 |
   | [来源协议配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/source-client.json>)、[目录合同](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/catalog/contract.ts>) | 保留仍用于内部 HTTP 协议的 `toolName` 字段。 | 界面、资源详情、实例连接和生成准备。 |

### 6.4. 主代理与子代理执行方式

1. 主代理继续使用官方 Agent 运行循环和用户当前模型。子代理继续使用原生 `spawn`、`send_message`、`interrupt_agent` 和 `list_agents`。
2. [派发配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L5-L11>)继续省略 `agentPreset` 和 `agentOptions`，由宿主继承工作台组合及父代理模型配置。当前 `maxDepth: 1` 保留，深度判定及执行由宿主负责。
3. 主子会话均使用第 6.1 至 6.3 节的装配。工作目录、剩余深度和委派信息按各自运行状态提供。工作台图片读取继续使用独立视觉模型。

### 6.5. 图片读取统一使用宿主 LLM

1. 实施者将自定义视觉服务登记到宿主已有的 `llm-pi-ai` 实例。通过 `ctx.settings.mutate()` 保存 `providers.<route>`，使用 `api: openai-completions`、`baseURL`、模型 ID 和 `input: [text, image]`。配置入口见[原生 Provider 字段](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/llm/llm-pi-ai/src/config.ts#L91-L150)及[Settings API](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/settings/settings/src/index.ts#L342-L374)。
2. 工作台图片配置继续保存 `activeProfileId`，以及每份配置的 `id`、`name`、`provider`、`model`、`defaultPrompt`、`temperature`、`maxTokens`。服务地址及密钥引用由宿主 Provider 配置保存。默认 Prompt 保留用户值。
3. 用户在图片设置页选择独立视觉模型，编辑默认 Prompt 和自定义服务地址。地址与密钥编辑调用宿主 Settings、Credentials，写入同一份 Provider 配置。单次 `prompt` 仍只覆盖当次调用。
4. 实施者按下列顺序迁移自定义配置。

   | 顺序 | 动作 | 成功条件 |
   | --- | --- | --- |
   | 1 | 读取当前图片配置与公开凭据引用，按[路由选择方法](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/native-settings.ts#L122>)分配或复用路由名，保存选用的路由名。 | 每份图片配置对应确定的 Provider 路由；其他消费者的路由配置保持原值。 |
   | 2 | 记录每个完整 Endpoint 对应的 `baseURL` 和查询参数处理方式，以实际请求验证目标地址。 | 当前 `/v1/chat/completions` 地址对应 `/v1`；各条映射均有请求地址及成功响应记录。 |
   | 3 | 将原凭据引用写入原生 `apiKeyEnv`，保存 Provider 配置。 | 原生模型目录可查到对应视觉模型，凭据仍由官方服务管理。 |
   | 4 | 使用宿主附件服务和 `prepareCall()` 验证该路由。 | 图片输入、鉴权、流式响应、取消及输出上限均通过。 |
   | 5 | 将图片配置指向已验证的原生路由。 | 配置 ID、名称、激活项、默认 Prompt 和调用参数保留。 |
   | 6 | 移交凭据管理，清理图片配置中的连接字段。 | Provider 使用的凭据继续存在，重复执行迁移保持同一结果。 |

5. 实施者修正[当前凭据清理流程](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/configuration-service.ts#L354-L454>)。原引用移交给 Provider 后，切换图片配置不得删除该凭据。实施者为迁移流程提供失败处理与重试行为：迁移失败时保留原图片配置；再次执行时，迁移流程核对 Provider 状态后完成剩余写入。验收者核对重试结果和凭据保留情况。
6. 原生请求使用流式响应，现有自定义分支解析完整 JSON。当前业务地址的候选映射保存在[图片配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/image-reader-profiles.json#L19-L29>)；实施者按[原生协议测试](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/llm/llm-pi-ai/tests/catalog.spec.ts#L73-L91)验证路径，并实测该服务的 SSE、图片输入和结束状态。协议差异使用宿主已有 `compat` 字段处理。
7. 图片读取的观察结果收集保留空结果与输出上限判断。宿主 `finish.reason.kind: max-tokens` 对应当前 `IMAGE_READER_OUTPUT_LIMIT`，避免将截断观察文本当作完整结果。
8. 所有迁移样例通过后，实施者删除[自定义 HTTP 分支](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/image-reader-service.ts#L349-L413>)及其专用解析代码。图片预处理、默认 Prompt、诊断和业务错误保留，统一调用[现有原生路径](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/image-reader-service.ts#L298-L347>)。

### 6.6. 架构流程图

1. 预设装配及业务执行遵守下图。

   ```mermaid
   flowchart TD
     Preset[工作台预设] --> Persona[原生完整 persona]
     Preset --> Runtime[目录与执行状态上下文]
     Preset --> SkillGroup[原生 Skill 组件组]
     SkillGroup --> Filesystem[原生文件发现组件]
     Files[包内目录与用户配置的额外目录] --> Filesystem
     Filesystem --> Skills[组内 Skill 服务]
     SkillGroup --> SkillTool[原生 skill 工具]
     Skills --> SkillTool
     Preset --> Tools[原生工具组件与 tools.restrict]
     Persona --> Parent[官方主 Agent]
     Runtime --> Parent
     SkillTool --> Parent
     Tools --> Parent
     Parent --> Spawn[原生子代理工具]
     Spawn --> Child[继承工作台组合的官方子 Agent]
     Parent --> MCP[NoobAI MCP]
     Child --> MCP
     Parent --> CLI[受管 CLI]
     Child --> CLI
     MCP --> Catalog[资源与实例查询]
     CLI --> Generate[Workflow 编译与 ComfyUI 执行]
     CLI --> Runs[Run 参数与媒体查询]
     CLI --> Reader[图片读取业务]
     Reader --> LLM[宿主附件与 LLM 服务]
     LLM --> Vision[独立视觉 Provider 与模型]
     Generate --> UI[工作台进度与图片结果]
     Runs --> UI
   ```

## 7. 实施步骤

1. **固定实施输入。** 实施者记录候选插件提交、官方应用版本与构建提交，读取第 8 节已确认的选择。依赖版本沿用当前锁定值，本方案不新增依赖。
2. **先建立故障用例。** 实施者按 TDD 补充原始段落、开发说明、Office Skill、依赖工具和重复业务入口的失败用例。测试通过实际预设装配产生请求，业务语义由独立审阅者判断。
3. **修改预设装配。** 实施者完成完整 persona、同名上下文覆盖、第 6.2 节的目录与组件配置，以及原生工具限制。定向验证首次主会话、子会话和重新挂载预设后的会话恢复。
4. **统一业务入口。** 实施者先把仍依赖直接 Tool 的 Desktop 夹具改为 MCP 与 CLI 调用，再删除第 6.3 节的专用适配。每组改动运行其消费者测试。
5. **统一图片模型调用。** 实施者先验证原生 Provider 对当前服务的协议，再实现配置和凭据迁移，最后删除自定义请求分支。
6. **修改测试和当前规范。** 下表规定主要消费者的处置。

   | 对象 | 修改要求 |
   | --- | --- |
   | [预设作用域测试](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/production/native-workbench-scope.test.mjs>)及[原生夹具](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/production/fixtures/native-workbench-preset-runtime.mjs>) | 按实际工作台组合验证提示词、工具、Skill 与父子继承。 |
   | [Host 集成测试](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/integration/host-plugin.test.ts>) | 将 8 项 Tool 注册预期改为业务服务、CLI 和预设职责的断言。 |
   | [Desktop 业务夹具](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/fixtures/official-business-services.mjs>)及[Desktop 验收](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/official-desktop-live.test.mjs>) | 通过实际 shell、CLI、MCP 完成业务；保留进度、Run 归属和图片结果验证。 |
   | [预设开发规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/comfyui-workbench-preset-and-skill-development.md>)、[架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md>)、[配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md>)、[目录结构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/directory-structure.md>)、[测试说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>) | 记录批准后的职责和配置入口，删除默认继承全部内容的要求。 |
   | [产品说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/README.md>)与[领域上下文](</Volumes/4Tdisk/work/AI2/harness-comfyui/CONTEXT.md>) | 说明业务 Skill 来源、自定义视觉服务入口及保留的用户能力。 |

7. **独立审查与候选验收。** 实施者完成代码审查和逐文件语义审计。验收者执行第 9 节，随后对最终候选树运行 `pnpm quality` 与 `git diff --check`。宿主已知故障的验收处理按第 9.4 节执行。官方 Desktop 的启动和停止遵守[worktree 规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/worktree-development.md>)。

## 8. 方案待决策项清单

1. D1 至 D3 的已批准执行方式如下；当前调用授权见第 11 节第 4 项。

   | 编号 | 决策事项 | 已批准的执行方式 |
   | --- | --- | --- |
   | D1 | 工作台业务 Skill 的来源。 | 按第 6.2 节配置目录、组件和包内资源交付。 |
   | D2 | NoobAI 组件内部的节点、连接诊断与资源访问能力。 | 保留第 3.3 节的 17 项 NoobAI 工具及 3 项资源工具。验收者读取实际资源目录，记录各资源的业务用途。 |
   | D3 | 真实模型和真实 ComfyUI 验收。 | 在隔离 Workspace 中执行 1 次主代理生成、1 次子代理生成，并分别读取结果图片。其他错误和生命周期情况使用受控服务。 |

## 9. 计划验收清单

### 9.1. 装配与生命周期

1. 验收者按下表保存每项结果。

   | 编号 | 验收输入 | 通过条件 |
   | --- | --- | --- |
   | A1 | 原始文件交付段落、宿主开发段落及新增无关静态段落同时注册。 | 工作台主子会话首次请求中的静态提示词仅包含批准的业务 persona；工具声明仍可用。其他预设保持其原有提示词。 |
   | A2 | 当前目录、沙箱、审批、派发深度、委派信息和开发上下文同时存在。 | 前 5 类上下文保留；最终模型请求不包含 `harness:source` 和 `app:web-surface` 的文本。工作目录和剩余深度与实际会话一致。原生上下文刷新后结果相同。 |
   | A3 | 全局 Office provider、包内业务 Skill、默认用户目录和 Workspace 中的同名或无关 Skill 同时存在。 | 主子会话按第 6.2 节发现并读取 Skill；摘要、正文和参考均来自配置的文件目录。全局 Office 注册与默认目录中的文件不进入工作台 Skill 目录。 |
   | A4 | 全局依赖工具及已退出的 8 个业务工具名称。 | 主子请求不声明这些工具；实际调用按宿主合同返回不可用。当前 MCP、CLI 和协作工具正常执行。 |
   | A5 | 被拒绝工具重新注册，随后加载一个未登记的新工具。 | 同名限制持续有效；新工具被验收清单识别，验收者记录用途判断。测试预期由批准的业务组合决定。 |
   | A6 | 首次派发、续派、中断、深度用尽、空会话切换预设和冷恢复。 | 各次实际请求符合批准的组合；模型、目录、深度、结束通知和业务结果归属正确。 |
   | A7 | 插件启动失败、卸载和重载。 | 原生组件释放所属注册与限制；重载后无重复工具或 Skill，其他预设可继续使用。 |
   | A8 | 包含仓库开发规范的 Workspace。 | 工作台请求不自动注入开发规范；业务输入和包内 Skill 仍可读取。 |
   | A9 | 在配置的文件目录中新增、修改和删除测试 Skill；加入、移除额外目录；在两个来源中放置同名 Skill。 | 宿主发现结果随文件和配置变化更新，正文读取返回对应内容，同名结果遵循宿主优先级。修改范围之外的预设保持各自来源。 |

### 9.2. 业务执行与模型协议

1. 验收者用实际消费者路径完成下表场景。

   | 编号 | 场景 | 通过条件 |
   | --- | --- | --- |
   | B1 | 查询作品、角色、风格、模型、LoRA、Workflow 和实例。 | MCP 返回可用于后续步骤的记录；界面查询及内部 HTTP 请求保持可用。 |
   | B2 | 选择 Prompt Builder 并设计 Prompt。 | Agent 读取匹配的业务 Skill 和参考，返回符合该 Skill 输出要求的 Prompt；生成步骤能够使用该 Prompt。 |
   | B3 | 主代理和子代理分别执行生成。 | Agent 通过受管 CLI 检查参数并提交；工作台显示进度、Run ID 和图片。 |
   | B4 | 查询多个 Run 的 Prompt、Seed、模型、LoRA 和工作流参数，并用于后续生成。 | 查询逐项保留成功或错误结果；后续请求使用用户指定的数据。 |
   | B5 | 读取本地图片，比较生成目标与图片结果。 | 采用独立视觉模型；默认 Prompt 与单次 Prompt 的覆盖关系正确。 |
   | B6 | 图片 Provider 配置迁移。 | 自定义地址、模型、多份 Prompt、激活项及凭据引用均保留；迁移重试结果一致。 |
   | B7 | 鉴权失败、SSE 中断、空结果、输出达到上限、取消。 | 宿主负责协议行为，插件返回对应业务结果；截断文本按输出上限处理。 |
   | B8 | 参数错误、实例异常及跨 Workspace 查询。 | 错误给出可执行的修正信息；不再引导使用已删除的 Tool；Run 与媒体访问符合既有 Workspace 规则。 |

### 9.3. 证据与正确性判定

1. 验收者为每个真实模型场景保存主子会话的预设 ID 和完整静态提示词。上下文证据还包括运行时上下文、工具声明、Skill 摘要及来源。调用证据包含 Skill 正文读取、参考文件读取、MCP 请求、CLI 命令与返回、模型观察、Run 和图片结果。
2. 同任务对照使用相同输入、相同模型和相同受控业务数据。验收者比较修改前后的交付要求、开发动作和无关 Skill 调用，并核对业务完成结果。
3. 确定性测试验证配置、名称、作用域、参数和返回结构。独立审阅者依据第 2 节判断提示词及 Skill 的业务用途，并核对真实请求；语义判断保存在审阅记录中。
4. 验收者另记录官方应用构建提交、插件候选提交、模型、Workspace、实例和退出状态。完成条件同时包括业务结果、实际模型请求和独立审阅结论。

### 9.4. 宿主 Skill 目录故障的等待与复验

1. 已结束会话的 Skill 目录查询故障列为宿主已知 Bug，等待宿主修复。根因与源码核对见[调研记录](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/research/comfyui-preset-host-reuse-20261026.md#会话结束后的界面-skill-目录查询>)。
2. 本次插件实施和验收按计划继续。验收者将该场景单列为“等待宿主修复后复验”。
3. 验收者保留原始失败记录和业务 Skill 目录断言。第 9.1、9.2 节的其余场景仍按各自通过条件验收。
4. 验收者记录 `pnpm quality` 的实际退出状态与失败明细。仅本节已知故障按待复验项处理；其余失败均按本次插件验收失败处理。
5. 官方 Desktop 包含宿主修复后，验收者复验已结束主会话和子会话的目录查询。返回结果须符合各自预设的 Skill 来源配置。

## 10. 非本次目标

1. 本方案的产品改动范围是工作台预设装配、重复 Agent 入口和图片模型协议归并。绘图算法、各 Prompt Builder 的内容规则及已有 Run 数据结构沿用当前实现。
2. 本次不修改宿主源码、Skill 目录接口或官方 Desktop 构建，也不增加插件侧绕过逻辑。工作台 Skill 来源的实施范围为第 6.2 节的预设配置和包内资源交付。
3. 生产配置迁移、全局 Skill 链接处置、发布和生产切换在获准的部署阶段执行。本方案保留现有生产数据与凭据，迁移流程先在隔离 Profile 中验收。

## 11. 已获得的授权

1. 用户已确认：核对插件对宿主能力的复用、重复实现与遗漏使用，并交付完整改进方案。
2. 用户已批准本方案的插件实现，并允许恢复锁定依赖；安装脚本保持禁用。
3. 用户已批准本轮 D3 使用 win3080 实例（ID 2）、MOSS 模板 45 和模型 18，主代理与子代理各生成 1 张图并各读取 1 次。对话模型为 OpenRouter `thinkingmachines/inkling:free`，图片读取使用本地 Qwen3.5-9B。本轮对话模型请求上限为 40 次；主代理与子代理的 `step/start` 事件累计达到 24 次或首次失败时，验收者停止整个隔离应用。模型重试关闭。
4. 用户已要求工作台 Skill 来源采用宿主现有的目录发现能力。
5. 用户已确认按第 9.4 节等待宿主修复，并继续本次插件方案。
