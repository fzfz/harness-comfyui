---
文档用途: 记录提示词来源、宿主能力复用依据，以及预设装配实验与界面查询故障。
读取时机: 判断 ComfyUI 工作台的宿主接入方式和改进范围时。
---

# ComfyUI 工作台的提示词来源与宿主能力复用

## 项目目标与核对基准

1. 工作台任务范围见[改进方案第 2 节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md#2-总目标>)；宿主与工作台预设的定义见[该方案第 1 节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md#1-名词定义>)。
2. 工作台预设负责让 Agent 按项目 Skill 完成这些任务。当前 persona 指定通过 NoobAI MCP 查询资源，通过受管 CLI 生成和读取图片。来源：[预设定义](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/CONTEXT.md#L91-L97>)、[工作台 persona](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L12-L19>)。
3. 插件与宿主的源码基准见[改进方案第 3.1 节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md#31-源码与会话证据>)。实施前调研中的“当前”指该基准；实验、界面查询故障与远端源码核对分别注明依据。

## 异常提示词的来源与验收偏差

1. **宿主交付卡片组件注册了文件交付提示词。** 提示词以“Prefer showing the primary results”开头。官方 Web 组合加载 `dsh-client-ui-deliverables`。该组件通过 `systemPrompt.section()` 注册 `ui:deliverable-file-references`。来源：[宿主加载入口](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/bundle/web-app/cordis.patch.yml#L349-L353)、[原文与注册代码](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/client/ui-deliverables/src/index.ts#L17-L35)。
2. **当前工作台追加 persona 后，继续合入宿主提示词段落。** 工作台只配置 `prefix`。宿主 `persona.complete` 默认为 `false`，提示词装配器合并全局段落和当前作用域段落。来源：[工作台配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L12-L19>)、[宿主默认值](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/persona/src/index.ts#L49-L53)、[宿主合并入口](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/core/system-prompt/src/index.ts#L614-L632)。
3. **用户报告的故障是文件交付要求干扰工作台任务。** 该段要求处理 Office 文件卡、源码 diff 和每次文件提及的链接格式。这些要求超出绘图任务的交付需要。同一请求还包含宿主源码开发、HMR 和 Web 构建指引。来源：[会话提示词](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-83d5bbad-f92f-4744-a9e0-43a5273b2d98/session.json#L120>)。
4. **验收用例把这些内容的存在写成了通过条件。** 测试明确断言 `ui:deliverable-file-references` 存在，并断言父子会话继承全局工具。开发规范还要求保留交付文件说明。来源：[提示词断言](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/tests/production/fixtures/native-workbench-preset-runtime.mjs#L120-L138>)、[工具继承断言](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/tests/production/fixtures/native-workbench-preset-runtime.mjs#L67-L81>)、[开发规范](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/docs/agents/comfyui-workbench-preset-and-skill-development.md#L33-L42>)。
5. **同类问题还出现在 Skill 和工具目录中。** 已存父会话和子会话的模型请求均包含 7 个 Office Skill 和 `load_workspace_dependencies`。Office Skill 来自独立的全局 provider。提示词、36 项工具和 Skill 来源的逐项判断见[改进方案第 3 节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md#3-现状调研>)。

## 当前重复实现与重复入口

1. **目录查询存在两套 Agent 入口。** 工作台已通过宿主 MCP 客户端提供 NoobAI 查询工具；插件的 Core 模块同时注册模板、LoRA、生成模型和实例的 4 个查询工具。已存模型请求同时包含两套工具。直接生图工具的参数说明还要求使用 `query_semantic_generation_models` 和 `query_semantic_loras`，与 persona 指定的 MCP 查询流程分叉。这里重复的是面向 Agent 的查询包装和说明。来源：[4 个注册入口](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/core/plugin.ts#L148-L151>)、[查询包装](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/catalog/catalog-tool.ts#L45-L210>)、[生图工具中的查询指引](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/generation-tool.ts#L31-L48>)、[模型收到的工具](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-workbench-only/desktop-native-real-openrouter-reasoning-trace/sessions/session-83d5bbad-f92f-4744-a9e0-43a5273b2d98/session.json#L259>)。
2. **生成、历史参数、媒体查询和图片读取同时提供 Tool 与 CLI 入口。** 两类入口共用生成运行服务（Generation Runtime）和图片读取服务（Image Reader）。重复位于参数说明、输入转换和调用身份适配，业务执行仍只有一份。当前 Core 和 Image Reader 在常驻插件启动时注册工具，注册动作与业务服务初始化绑定。来源：[业务工具注册](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/core/plugin.ts#L152-L154>)、[图片读取工具注册](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/image-reader/plugin.ts#L55-L61>)、[CLI 分发](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/cli/dispatch.ts#L25-L72>)、[常驻插件加载](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/cordis.patch.yml#L1-L11>)。
3. **图片读取自行实现了一条模型协议请求路径。** `inspectRuntime()` 使用宿主附件服务和 `llm.prepareCall()`；`inspectOpenAiCompatible()` 自行构造图片请求、发送 HTTP 和解析 Chat Completions 响应。同版本宿主 `llm-pi-ai` 已提供 `openai-completions`、自定义 `baseURL`、模型列表和图片输入声明。可归并的是供应商连接与协议处理。独立识图模型、业务提示词和图像预处理仍属于图片读取功能。来源：[宿主服务调用路径](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/image-reader/image-reader-service.ts#L298-L347>)、[自制请求路径](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/image-reader/image-reader-service.ts#L349-L413>)、[宿主协议支持](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/llm/llm-pi-ai/src/provider.ts#L24-L48)、[宿主地址与图片输入配置](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/llm/llm-pi-ai/src/catalog.ts#L916-L958)。

## 当前已原生复用的能力

1. **预设注册和组合由宿主管理。** 插件通过 `dsh-agent-preset` 注册工作台，并用 Cordis include 加载业务组合。[安装资源入口](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/project-installed-presets.mjs#L9>)只固定包内资源入口。宿主 registry 管理预设挂载与父子会话的组合继承。来源：[工作台注册](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/presets.cordis.yml#L1>)、[安装资源入口](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/project-installed-presets.mjs#L9>)、[宿主预设注册](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/agent-preset/src/index.ts#L12-L29)、[宿主挂载与继承](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/agent-preset-registry/src/index.ts#L276-L310)。
2. **Skill 发现和读取由宿主管理。** 工作台直接加载默认 `skill-filesystem` 和 `tool-skill`。宿主 provider 扫描项目、用户和内置目录；宿主工具按当前工作目录与 Agent 作用域读取 Skill。来源：[工作台 Skill 配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/shared/agent.cordis.yml#L25>)、[宿主目录来源](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/skill-filesystem/src/index.ts#L244-L263)、[宿主 Skill 读取](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/tool-skill/src/index.ts#L128-L157)。
3. **Agent 的 NoobAI MCP 连接由宿主管理。** 插件只声明服务名、传输方式、地址、凭据引用和超时。宿主负责连接、重连、工具同步和卸载。来源：[MCP 配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/noobai-mcp.cordis.yml#L1>)、[宿主连接生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/mcp/mcp-client/src/index.ts#L178-L201)、[宿主工具同步](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/mcp/mcp-client/src/tools.ts#L113-L140)。
4. **子代理创建、续派、中断和查询使用宿主工具。** 工作台配置 `spawn` provider。宿主工具调用 `startActivation()`、`sendMessage()` 和 `interrupt()`；`list_agents` 调用宿主会话查询。来源：[工作台子代理配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L5>)、[查询工具配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/shared/agent.cordis.yml#L29>)、[宿主创建](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/tool-subagent/src/index.ts#L320-L337)、[宿主续派与中断](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/tool-subagent-control/src/index.ts#L58-L109)、[宿主查询](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/tool-subagent-control/src/list-agents.ts#L152-L170)。
5. **子代理组合和工作目录继承由宿主完成。** 工作台省略 `agentPreset` 和 `agentOptions`。宿主因此继承父 Agent 的预设组合和模型配置。宿主默认取父 Agent 当前工作目录，子会话随后独立维护目录状态。来源：[工作台配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L5>)、[宿主组合继承](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/child-agent.ts#L177-L202)、[宿主模型继承](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/child-agent.ts#L87-L110)、[宿主目录继承](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/manager.ts#L524-L530)、[子会话目录写入](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/manager.ts#L880-L896)。
6. **工作目录切换和后代枚举已复用宿主。** 工作台加载官方 `working_directory` 工具。图片结果查询通过 `subagents.listDescendants()` 取得后代，宿主负责遍历持久化目录并报告分支错误。来源：[目录工具配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/shared/agent.cordis.yml#L5>)、[后代查询调用](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/workspace-access.ts#L48>)、[宿主目录工具](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/session/tool-working-directory/src/index.ts#L34-L39)、[宿主后代枚举](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/list-children.ts#L64-L125)。

7. **CLI 环境与生命周期接入宿主接口。** 插件通过 `shellEnv.register()` 提供命令环境，按 `tools/result` 撤销本次调用凭证，并通过 `ctx.effect()` 清理监听服务。凭证把 shell 调用身份传给插件业务入口。来源：[CLI 插件](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/cli/plugin.ts#L15-L33>)、[调用凭证](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/cli/shell-capability.ts#L60-L111>)。
8. **图片配置和工作台界面复用宿主服务。** Image Reader 使用宿主 Settings、Credentials、Attachments 和 LLM 服务。工作台通过 Remote、侧栏标签、输入框扩展位和配置表单接入官方界面。来源：[图片服务依赖](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/image-reader/plugin.ts#L15-L61>)、[界面接入](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/client/index.tsx#L123-L168>)、[扩展位注册](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/client/index.tsx#L256-L301>)。

## 原生配置的当前取值与可用选项

1. **派发深度仍由工作台固定为 `1`。** 工作台可省略 `maxDepth`，让宿主在派发时读取用户设置。来源：[工作台深度](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L9>)、[宿主深度读取](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/index.ts#L237-L247)。
2. **工作台的子代理模型选择尚未接入宿主设置。** 工作台省略 `modelSelectionSettings`；宿主默认将该字段设为 `false`。官方 standard 预设已设置为 `true`。工作台可通过同一字段复用宿主的模型选择设置。来源：[工作台派发配置](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml#L5>)、[字段默认值](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/tool-subagent/src/index.ts#L80-L98)、[宿主设置读取](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/tool-subagent/src/index.ts#L398-L440)、[官方预设配置](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/bundle/web-app/presets/standard.patch.yml#L93-L98)。

3. **宿主提供完整 persona 替换模式。** 当前工作台未使用该模式。`complete` 两种取值的对照结果见“验证范围与实验结果”第 1 项。采用完整 persona 时，预设维护者需将必要的工具使用要求写入 persona。来源：[宿主选项定义](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/persona/src/index.ts#L30-L53)。

## 插件保留的业务职责

1. **ComfyUI 执行和结果数据由插件管理。** 插件负责 Workflow 编译和参数映射。生成运行服务负责提交任务、跟踪状态、持久化 Run 和下载媒体。Core 通过 Cordis 生命周期启动和停止生成运行服务的 coordinator。来源：[业务服务装配](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/core/plugin.ts#L101-L147>)。
2. **Workspace 筛选属于图片结果访问规则。** 插件根据会话原始目录解析 Workspace，再保留同一 Workspace 的本地后代结果。宿主提供后代关系和会话信息；插件据此限定图片结果范围。来源：[Workspace 解析](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/workspace-access.ts#L20>)、[结果范围筛选](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/src/host/generation/workspace-access.ts#L54>)。
3. **预设资源验证已复用宿主结构约束。** 构建脚本调用宿主的 `entryListSchema` 和 `entryListProblem()`。脚本另行校验包内目录及资源名称，承担插件打包职责。来源：[宿主约束导入](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/scripts/build/agent-preset-resources.mjs#L8>)、[资源验证](<https://github.com/fzfz/harness-comfyui/blob/2d74f999f64eb2e0ddc9b05af699354be874e3ba/scripts/build/agent-preset-resources.mjs#L69>)。

## 历史已删除的实现

1. 提交 `2759384` 已删除自制派发、中断和子会话 Workspace 绑定包装，并将结果查询改为宿主 `listDescendants()`。同一提交删除了提示词输出过滤器和工具可见性同步组件。来源：[删除记录](https://github.com/fzfz/harness-comfyui/commit/27593845777183046191313f7af07ffdba6293f6)。
2. 提交 `6736681` 已删除包内 Skill 来源包装。来源：[删除记录](https://github.com/fzfz/harness-comfyui/commit/6736681922683658c9e89b1d573b263eda0312c2)。

## 改进方案入口

1. 装配配置、文件改动、调用方调整和验收要求统一见[改进方案](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md>)。

## 验证范围与实验结果

1. persona 对照实验使用已安装宿主包创建内存中的 Cordis 上下文，只改变 persona 的 `complete` 值。`false` 保留宿主段落和工具说明；`true` 只保留 persona 静态段落。两组均保留相同工具声明。结果见[对照实验记录](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-composition-probe.json>)。
2. [原生装配实验](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-goal-composition-probe.json>)记录了已安装应用的构建提交。实验覆盖完整 persona、独立 Skill 服务、原生工具限制和运行时上下文。
3. 图片供应商归并结论依据两条请求路径及宿主接口源码；实施与验收要求见[改进方案第 6.5 节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md#65-图片读取统一使用宿主-llm>)和[第 9.2 节](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/comfyui-workbench-composition-20261027.md#92-业务执行与模型协议>)。

## 会话结束后的界面 Skill 目录查询

### 故障记录

1. 官方 Desktop 查询已结束子会话时，返回了 7 个 Office Skill。该调用应返回工作台业务 Skill，[原有断言](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/official-desktop-live.test.mjs#L1164-L1168>)因此失败。
2. 原始子会话 ID 为 `66cd97dc-cbe7-41e4-9442-9e799054fcd0`。其持久投影仍记录 `agentPreset: harness-comfyui-cli-candidate`，工作目录指向测试的子任务目录，当前轮次已经结束。原始错误、投影字段及来源保存在[根因验证记录](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-skill-root-cause.json>)。

### 查询从预设切换到全局服务的路径

| 顺序 | 执行动作 | 结果及源码 |
| --- | --- | --- |
| 1 | 子会话创建时，宿主把继承的预设 ID 写入会话元数据。 | [childSessionMeta()](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/child-agent.ts#L135-L151>)保留预设身份。 |
| 2 | 目录接口读取会话投影中的预设 ID 和工作目录。 | [SessionSkillCatalog.list()](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/api/session-controller/src/skill-catalog.ts#L36-L50>)已取得正确的查询输入。 |
| 3 | Agent 存活时，接口调用 `serviceFor(live, 'skills')`。 | [服务选择分支](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/api/session-controller/src/skill-catalog.ts#L63-L66>)取得预设组内 Skill 服务。 |
| 4 | 子任务结束后，宿主释放子 Agent；目录接口查询不到存活 Agent。 | [子任务释放](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/subagent/subagent/src/manager.ts#L1153-L1155>)使接口进入同一服务选择分支中的全局回退路径。 |
| 5 | 接口调用 `acquireScope(agentPreset)`，再将返回的 `key` 传给已选中的全局服务。 | [结束会话查询](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/api/session-controller/src/skill-catalog.ts#L75-L78>)只补上作用域。 |
| 6 | 全局 Skill 服务合并自身的全局注册与作用域注册。 | [collectFresh()](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/skill/src/index.ts#L551-L564>)返回全局 [Office provider](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/skill-office/src/index.ts#L69-L95>)的 7 项注册。业务文件发现组件位于另一 Skill 服务中。 |

### 官方组件的单变量对照

1. 实验以 `workbench` 为 ID 加载仓库的工作台预设，保留 Skill 组件组及其目录配置。实验停用 MCP、shell 和子任务执行组件，直接通过原生 AgentRegistry 注册、释放测试 Agent。预设、Skill、文件发现、Office、AgentRegistry 和目录查询组件均来自已安装官方应用。会话投影中的预设 ID 与工作目录保持不变，模型请求为 0 次。
2. [根因验证记录](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/comfyui-preset-host-reuse-20261026/native-skill-root-cause.json>)保存了各步返回值与服务调用顺序。

   | 对照状态 | 返回结果 |
   | --- | --- |
   | 子 Agent 存活。 | 8 个业务 Skill。 |
   | 释放子 Agent，保留相同会话投影。 | 7 个 Office Skill。 |
   | 子 Agent 已释放，主 Agent 仍存活。 | 主会话查询仍返回 8 个业务 Skill。 |
   | 子 Agent 已释放，直接读取预设组内服务。 | 8 个业务 Skill，且业务 Skill 正文可读。 |
   | 子 Agent 已释放，仅将目录接口选用的服务改为预设组内服务。 | 8 个业务 Skill。 |
   | 释放主 Agent 后查询主会话。 | 7 个 Office Skill。 |
   | 查询记录了工作台预设、尚未创建 Agent 的受控会话。 | 7 个 Office Skill。 |

3. 各次结束会话查询均成功调用了 `acquireScope('workbench')`。服务选择对照保留了同一目录接口及参数，只改变传给接口的 Skill 服务。

### 架构根因与测试遗漏

1. 会话目录查询在 Agent 存活时同时确定预设服务和作用域，Agent 结束后却只恢复作用域。两条路径对“使用哪个 Skill 服务”的处理不同，因此相同会话的目录结果随 Agent 是否存活而变化。
2. 宿主的 `serviceFor()` 从 Agent 已绑定的预设组合取得服务；`acquireScope()` 返回预设作用域标识和释放方法。该作用域标识用于指定所选 Skill 服务内部的注册层。接口仍需选择预设组内的服务。接口合同见[预设服务读取](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/agent-preset-registry/src/index.ts#L319-L327>)、[作用域取得](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/agent-preset-registry/src/index.ts#L368-L382>)和 [Skill 读取选项](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/skill/skill/src/index.ts#L110-L119>)。
3. 工作台预设的组件分组符合宿主要求：[提供方与消费方共用隔离组](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/preset/agent-preset-registry/README.md#L56-L58>)。
4. 宿主[冷会话测试](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/api/session-controller/tests/session-skills.host.spec.ts#L157-L177>)模拟 `acquireScope()` 返回一个标识，并断言全局服务收到该标识。该用例覆盖了作用域参数传递，独立预设服务只在[存活 Agent 测试](<https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/api/session-controller/tests/session-skills.host.spec.ts#L122-L155>)中出现。结束后的预设独立服务查询缺少覆盖。

## 宿主远端源码与 PR 记录核对

### 2026 年 10 月 27 日的源码基准

1. 本地宿主工作目录停在 `dd6322d604e00eec1ba5e0c8541159906a21094a`，提交日期为 2026 年 8 月 31 日。核对远端后，`origin/master` 指向 [`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`](<https://github.com/deepseek-ai/deepseek-harness/commit/22ddee3792402c3e70ec5f86a63c3e3e895a2f60>)，提交日期为 2026 年 10 月 23 日。
2. 远端版本的目录接口与前述故障分析采用的 `1f81c047fc48fa190a683e469daa699857e9afe8` 完全相同。该接口仍使用“查询从预设切换到全局服务的路径”所述分支。来源：[远端服务选择与查询](<https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/src/skill-catalog.ts#L63-L78>)。
3. 远端测试仍保留“架构根因与测试遗漏”第 4 项所述的遗漏。来源：[远端存活与结束会话测试](<https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/api/session-controller/tests/session-skills.host.spec.ts#L124-L179>)。

### 服务选择分支的改动历史

| 日期 | 提交记录 | 已核对的改动 |
| --- | --- | --- |
| 2026-08-07 | [`c58cc23d45`](<https://github.com/deepseek-ai/deepseek-harness/commit/c58cc23d455df804c96efb88b1d45f7cfe76f716>) | 宿主增加 `serviceFor(agent, name)`，使持有存活 Agent 的目录查询取得预设独立服务；查不到存活 Agent 时仍选择全局服务。 |
| 2026-08-09 | [`4788569889`](<https://github.com/deepseek-ai/deepseek-harness/commit/47885698894e2d269eb98963bd55990f86b87705>) | 宿主为共享 Skill 服务增加按作用域分层的注册查询，标准预设改用共享服务。结束会话查询增加预设作用域参数，独立服务仍通过存活 Agent 取得。 |
| 2026-08-27 | [`2d4393d842`](<https://github.com/deepseek-ai/deepseek-harness/commit/2d4393d842139f16f4ae32b8ae31476a597cdd22>) | 宿主把目录查询迁入 SessionSkillCatalog，保留既有服务选择分支。 |
| 2026-09-21 | [`d1e22a7e24`，提交标题标记 #4569](<https://github.com/deepseek-ai/deepseek-harness/commit/d1e22a7e247060496e1acdba9ef3be1700e23ec7>) | 宿主引入声明式预设，并将 `standingKeyFor()` 换为 `acquireScope()`。目录查询取得租约后只使用其 `key`，仍在取得租约前选择 Skill 服务。 |
| 2026-10-16 | [合并提交 `e412760f94`，标题标记 #6275](<https://github.com/deepseek-ai/deepseek-harness/commit/e412760f9471acfa7bbbeeb5b926a41522dc4e85>) | 宿主修复插件开关后 Skill 菜单未刷新的问题，改动浏览器目录缓存失效通知；会话目录接口的服务选择保持原样。 |

### 公开 PR 入口的查询结果

1. GitHub 的 PR 列表接口和 PR #4569 接口均返回 HTTP 404；提交 `d1e22a7e24` 的关联 PR 接口返回空数组。当前可核验的改动依据是上一节列出的提交正文和代码差异。
2. 公开仓库的 `/pull/4569` 页面跳转到 [Discussion #4569](<https://github.com/deepseek-ai/deepseek-harness/discussions/4569>)。该讨论报告宿主重启期间并发写入导致会话日志损坏，主题与声明式预设改动不同。
3. 官方[贡献说明](<https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/CONTRIBUTING.md>)写明当前暂停接收外部 PR，并将问题反馈入口设为 Discussions。
