---
文档用途: 定义插件配置字段、覆盖顺序与凭据归属。
读取时机: 修改配置文件、设置接口或环境变量前。
---
# 配置规范

## 官方插件配置与存储校验

1. 官方 Harness 依次合并插件包（bundle）、官方 Profile、宿主数据目录（home）和启动参数（invocation）的配置。后续层覆盖较早层的同名字段。官方 Profile 保存插件条目，其中的 `config` 会整体替换该条目此前的配置对象。Host 插件收到合并后的配置，再按 `configurationProfile` 字段选择项目 Configuration Profile。两类配置的定义见[领域上下文](../../CONTEXT.md#官方-profile)。

2. Core 的官方插件配置字段如下。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `harness-comfyui-core.config.configurationProfile` | 选择项目 Configuration Profile；允许的值为 `production`。 |
   | `harness-comfyui-core.config.dataDirectory` | 可选的绝对数据目录，统一重算插件存储路径。省略时，存储路径以 `ctx.dshHomePath()` 返回的官方 Harness home 为基准解析。 |
   | `harness-comfyui-core.config.browserExecutablePath` | 可选的 Chrome 或 Chromium 绝对可执行文件路径；插件详情的“Workflow 浏览器”设置保存该值。 |

3. [config/plugin-storage.json](../../config/plugin-storage.json) 定义受管存储字段。[assertPluginStorageWritable()](../../src/host/core/plugin-storage.ts) 在激活时校验目录及已存在的 SQLite 文件。校验失败时，Host 报告具体路径和系统原因；维护者修正对应访问权限，或把 `dataDirectory` 设为可写目录。

## Configuration Profile 计算顺序

1. Configuration Profile 的覆盖顺序为：基础配置、所选 Profile、已声明环境变量、官方插件配置中的数据目录与浏览器路径。加载与路径计算见 [loadProfile()](../../src/config/load-profile.ts) 和 [Core apply()](../../src/host/core/plugin.ts)。

2. [config/environment-overrides.json](../../config/environment-overrides.json) 唯一定义环境变量名称、目标字段与值类型。`target` 声明把解析值写入指定字段，number 声明解析为数值，string 声明保留字符串；`passThrough` 声明接受调用环境值。`loadProfile()` 校验实际传入的 Host 环境，未声明的 `HARNESS_COMFYUI_*` 变量会触发配置错误；维护者依据报错变量与该配置文件修正 Host 环境。

## Configuration Profile 字段

1. [config/schema.ts](../../config/schema.ts) 定义字段与约束，[config/base.json](../../config/base.json) 和 [config/profiles/production.json](../../config/profiles/production.json) 定义默认值。字段用途如下。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `paths.dataDir` | 插件业务数据根目录；默认路径为官方 Harness home 下的 `data/plugins/harness-comfyui/`。 |
   | `paths.apiWorkflowCacheDirectory` | Official API Workflow Cache 目录，必须是 `dataDir` 的严格子目录。 |
   | `paths.runRepositoryFile` | 保存 Run 状态和索引的 SQLite 文件。 |
   | `paths.runDirectory` | 每个 Run 的请求、来源快照与 Workflow 文件目录。 |
   | `paths.savedMediaDirectory` | Saved Media 文件目录。 |
   | `paths.logDirectory` | 插件 Host 日志目录。 |
   | `comfyui.defaultInstanceId` | 请求省略实例 ID 时使用的默认 ComfyUI 实例 ID。 |
   | `comfyui.frontendCompiler.browserExecutablePath` | 官方前端导出使用的本机 Chrome 或 Chromium 绝对可执行文件路径。 |
   | `comfyui.frontendCompiler.instanceCacheEpoch` | Host 级缓存版本标识；修改该值后，全部已登记实例此前的缓存失效。 |
   | `comfyui.frontendCompiler.timeoutMs` | 单次浏览器会话从启动、前端初始化到 `graphToPrompt()` 导出的总时限，单位为毫秒。 |
   | `comfyui.frontendCompiler.preReadiness.devToolsPortMs` | 浏览器发布 `DevToolsActivePort` 的阶段时限，单位为毫秒。 |
   | `comfyui.frontendCompiler.preReadiness.targetCreateMs` | Chrome DevTools HTTP 接口创建页面目标的阶段时限，单位为毫秒。 |
   | `comfyui.frontendCompiler.preReadiness.webSocketConnectMs` | Host 连接浏览器目标 WebSocket 的阶段时限，单位为毫秒。 |
   | `comfyui.frontendCompiler.preReadiness.domainEnableMs` | 浏览器目标完成全部 Chrome DevTools domain enable 命令的共同阶段时限，单位为毫秒。 |
   | `comfyui.frontendCompiler.preReadiness.navigationMs` | 浏览器目标完成 `Page.navigate` 的阶段时限，单位为毫秒。 |
   | `comfyui.frontendCompiler.preReadiness.infrastructureAttempts` | 同一次缓存未命中的浏览器会话尝试次数，允许 `1` 或 `2`。可重试范围为前端就绪检查开始前的临时目录、浏览器启动、DevTools 连接和导航阶段；阶段判定见 [ChromeComfyFrontend.exportWorkflow()](../../src/host/generation/comfy-frontend-browser.ts)。 |
   | `source.catalogPort` | 数据源设置尚未保存端口时使用的默认端口。 |
   | `jobs.pollIntervalMs` | ComfyUI Job 轮询间隔，单位为毫秒。 |
   | `jobs.missingObservationMs` | 已提交 Run 持续收到 Job `unknown`、连接失败或请求超时后，判定失败的等待时长，单位为毫秒；收到 `pending` 或 `running` 时重新计算后续缺失时长。 |
   | `media.maxFileBytes` | 单个 ComfyUI 输出媒体允许保存的最大字节数。 |
   | `client.runRefreshIntervalMs` | Client 查询 Generation Run 的刷新间隔，单位为毫秒。 |

## 配置生效与缓存维护

1. Host 在激活时读取 Configuration Profile；用户修改 bundle 或 Profile 的加载配置后，完全退出并重新打开官方应用。数据源、图片读取与浏览器路径设置通过各自 Remote 保存，按后续章节的规则生效。

2. 任一实例的前端导出行为变化后，维护者修改 `instanceCacheEpoch`。变化包括前端升级，以及影响 Workflow 序列化的自定义节点变更。修改后，维护者完全退出并重新打开官方应用。

3. `COMFYUI_API_WORKFLOW_CACHE_INVALID` 表示错误消息指向的缓存文件存在 JSON、identity 或 API Workflow 结构问题。维护者关闭官方应用、删除该文件，再重新打开应用并重试；文件缺失时，Host 执行官方前端导出并写入缓存。缓存 identity、校验和并发导出由 [OfficialApiWorkflowCompiler](../../src/host/generation/official-api-workflow.ts) 维护。

4. 浏览器固定启动参数由 [ChromeComfyFrontend](../../src/host/generation/comfy-frontend-browser.ts) 定义。用户在“Workflow 浏览器”设置中保存路径后，下一次需要启动浏览器的导出使用该路径。

## Host 内部数据源设置

1. Host 使用当前 Profile 的 `harness-comfyui-core` 条目保存内部数据源地址。Client 的“ComfyUI”设置页通过“数据源服务”页签保存以下字段。

   | 字段 | 规则与用途 |
   | --- | --- |
   | `configuration.url` | HTTP 或 HTTPS URL，包含协议与主机名，可包含根路径 `/`；用户名、密码、端口、其他路径、query 和 fragment 由校验拒绝。 |
   | `configuration.port` | 数据源端口，必须是 `1` 至 `65535` 的整数。 |

2. Host 内部数据源客户端在每次请求时读取当前 Profile 中生效的地址。保存成功后，下一次 Catalog、实例或 Workflow bundle 请求立即使用该地址；已保存端口覆盖 Configuration Profile 的默认端口。地址合同由 [src/source-settings.ts](../../src/source-settings.ts) 定义，请求入口位于 [src/host/source-client/](../../src/host/source-client)。

## NoobAI MCP 服务

1. 工作台通过[共享组合](../../agent-presets/shared/agent.cordis.yml)加载 [agent-presets/noobai-mcp.cordis.yml](../../agent-presets/noobai-mcp.cordis.yml)，由 DSH 原生 MCP 客户端连接 NoobAI MCP 服务。该文件定义服务名、传输方式、地址、请求头、Tool 调用期限和启动失败行为；维护者在官方 DSH home 的 `.env` 文件中设置 `NOOBAI_MCP_TOKEN`，由官方应用启动时加载并提供 Bearer 凭据；本机默认文件为 `~/.dsh/.env`。修改后，维护者完全退出并重新打开官方应用。

2. NoobAI MCP 服务与 Host 内部数据源客户端必须连接同一目录数据。维护者分别配置 MCP 声明和“数据源服务”设置，确保 Agent 选择的目录 ID 能由 Host 读取。

## 工作台装配配置

1. [工作台配置](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml)设置 persona 的 `complete: true` 与 `includeRuntimeContext: true`。静态提示词由业务 persona 定义，运行时上下文由宿主提供。职责见[项目 Preset、Skills 与目录访问](architecture.md#项目-presetskills-与目录访问)。

2. [共享组合](../../agent-presets/shared/agent.cordis.yml)保存以下工作台范围字段，接入入口为 [workbench-composition.mjs](../../agent-presets/workbench-composition.mjs)。

   | 字段 | 当前配置与用途 |
   | --- | --- |
   | `workbench-composition.config.omittedRuntimeContexts` | `harness:source` 与 `app:web-surface`；通过原生同名空上下文覆盖宿主开发信息。 |
   | `workbench-composition.config.deniedTools` | `load_workspace_dependencies`；由原生工具服务限制声明与调用。 |
   | `workbench-skills.isolate.skills` | `true`；工作台使用独立 Skill 服务。 |
   | `skill-filesystem.config.includeDefaultRoots` | `false`；目录来源由以下 2 个字段指定。 |
   | `skill-filesystem.config.bundledSkillDir` | 定位当前安装包的业务 Skill 目录。 |
   | `skill-filesystem.config.customSkillDirs` | 默认 `[]`；维护者在此明确配置用户自有 Skill 的额外目录。 |

3. 共享组合通过 `command-goal` 和 `tool-goal` 接入宿主原生 Goal，组件配置沿用宿主默认值。工作台 Agent 的使用约定集中在工作台配置的 persona 中。

4. 共享组合通过 `tool-jobs` 接入官方 Job 工具。`completionDelivery: wakeup` 将完成通知投递到所有者会话。Generation Run Wait 的生命周期见[等待通知](architecture.md#generation-run-等待通知)。

5. 包内资源范围由 [config/plugin-package.json](../../config/plugin-package.json) 定义。开发验收时，Profile patch 可将 `bundledSkillDir` 指向候选 checkout 的业务 Skill 目录。

## 图片读取设置

1. Host 使用当前官方 Profile 的 `harness-comfyui-image-reader` 条目保存图片读取设置。用户在 Client 的“图片读取”设置页管理配置；持久化字段如下。

   | 字段 | 规则与用途 |
   | --- | --- |
   | `configuration.activeProfileId` | 下一次图片读取使用的配置 ID，必须对应 `configuration.profiles[]` 中的配置。 |
   | `configuration.profiles[]` | `1` 至 `20` 份命名配置，ID 在列表内唯一。 |
   | `configuration.profiles[].id` | 稳定的小写字母、数字、下划线或连字符 ID，最长 80 个字符。 |
   | `configuration.profiles[].name` | 设置页显示的配置名称，最长 80 个字符。 |
   | `configuration.profiles[].provider` | 宿主 Provider 的精确 route。 |
   | `configuration.profiles[].model` | Provider 接受的精确视觉模型 ID。 |
   | `configuration.profiles[].defaultPrompt` | 单次调用省略 `prompt` 时使用的默认读图提示词。 |
   | `configuration.profiles[].temperature` | 模型调用温度，范围为 `0` 至 `2`。 |
   | `configuration.profiles[].maxTokens` | 最大输出 Token 数，范围为 `1` 至 `32768`。 |

2. 系统 Provider 与模型候选来自宿主 LLM 服务。设置页列出声明 `image` 输入能力的模型。自定义连接由 [ImageReaderNativeSettings](../../src/host/image-reader/native-settings.ts)映射到宿主 `llm-pi-ai` Provider；连接字段归属如下。

   | 宿主字段 | 用途 |
   | --- | --- |
   | `providers.<route>.api` | 使用 `openai-completions` 协议。 |
   | `providers.<route>.baseURL` | 保存自定义服务的地址前缀。 |
   | `providers.<route>.models` | 保存模型 ID 与 `text`、`image` 输入能力。 |
   | `providers.<route>.apiKeyEnv` | 保存官方凭据引用；API Key 值由官方凭据服务保存。 |

3. 设置页保留“系统 Provider”与“OpenAI 兼容接口”两类编辑方式。`connectionType`、完整 `endpoint` 与 `hasApiKey` 由宿主 Provider 和凭据状态派生，作为 Remote/UI 视图返回。图片读取统一使用宿主 Attachment 和 `llm.prepareCall()`，调用职责见[图片读取与 Prompt 对比职责](architecture.md#图片读取与-prompt-对比职责)。

4. 自定义连接需要 API Key，由宿主凭据服务保存。迁移和保存时，插件通过该服务确认凭据是否已配置；缺少凭据时保留原配置，并提示用户保存 API Key。自定义地址必须是以 `/chat/completions` 结尾的完整 HTTP 或 HTTPS 地址。地址可包含服务路径前缀，例如 `https://example.com/vision/v1/chat/completions`。地址中的路径、query 或 fragment 无法映射时，插件返回 `IMAGE_READER_ENDPOINT_NATIVE_MAPPING_UNSUPPORTED`，并保留原配置。

5. 自定义连接的迁移与保存由 [ImageReaderNativeSettings](../../src/host/image-reader/native-settings.ts) 实现。迁移后的图片读取配置保存宿主 Provider 的实际 route，并保留配置名称、提示词、模型、激活选择和凭据引用。尚未迁移的配置保留原地址，用户可在设置页修正或删除。

### 配置保存、激活与删除合同

1. 保存请求包含 `operation: create | update`、`profile` 与最终 `activateProfileId`。`create` 使用尚不存在的 ID 新增配置，`update` 修改仍然存在的同 ID 配置；最终激活目标必须存在。“保存 A 并切换 B”成功后，B 成为生效配置。

2. OpenAI 兼容配置的保存请求必须包含 `credential`。`{ action: "keep" }` 保留凭据引用，`{ action: "replace", apiKey: <值> }` 创建替换凭据；API Key 只随替换请求发送。自定义连接提交 `{ action: "clear" }` 时，[保存方法](../../src/host/image-reader/native-settings.ts#L174)返回 `IMAGE_READER_NATIVE_CREDENTIAL_REQUIRED`，并保留原配置。读取、保存、激活和删除响应返回派生的 `hasApiKey` 状态。

3. [ImageReaderConfigurationService](../../src/host/image-reader/configuration-service.ts)负责配置与凭据操作，[ImageReaderNativeSettings](../../src/host/image-reader/native-settings.ts)负责宿主 Provider 映射。删除图片配置时，仍被宿主 Provider 引用的凭据继续保留。保存结果不明或凭据清理失败时，Host 返回[错误目录](../../config/error-catalog.json)定义的 `IMAGE_READER_CREDENTIAL_*` 错误。

4. 激活操作设置当前生效的配置；删除操作至少保留一份配置，并在删除活动配置时选择另一份配置生效。操作成功后，Host 返回完整的 `configuration`。配置写入与删除后的选择规则见 [ImageReaderConfigurationService](../../src/host/image-reader/configuration-service.ts)。

5. Client 的配置选择和编辑草稿处理见 [image-reader-settings.tsx](../../src/client/image-reader/image-reader-settings.tsx)。

6. Host 与 Client 使用 [src/image-reader/settings.ts](../../src/image-reader/settings.ts) 的保存校验合同，设置页在对应字段与保存按钮附近显示具体错误。保存、激活与删除持久化失败分别使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`、`IMAGE_READER_SETTINGS_ACTIVATE_FAILED` 与 `IMAGE_READER_SETTINGS_DELETE_FAILED`。成功保存或激活后，下一次图片读取立即使用生效配置。

### 默认提示词、运行配置与调用诊断

1. [config/image-reader-profiles.json](../../config/image-reader-profiles.json) 中 ID 为 `default` 的记录定义新建配置的默认提示词。已保存配置使用用户值；本次请求提供的 `prompt` 只覆盖该次调用。

2. [config/image-reader-runtime.json](../../config/image-reader-runtime.json) 定义图片读取插件的运行字段，由 [src/image-reader/plugin-schema.ts](../../src/image-reader/plugin-schema.ts) 校验。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `shutdownTimeoutMs` | 插件卸载时等待已取消活动请求退出的期限，默认 `5000` 毫秒；插件同名配置可覆盖默认值。期限到达后，Host 报告仍未结束的请求。 |
   | `diagnosticLogFormat` | Host logger 的阶段日志格式模板。 |
   | `providerSettingsNamespace` | 自定义视觉 Provider 使用的宿主设置 namespace。 |
   | `providerRoutePrefix` | 自定义视觉 Provider 的 route 前缀。 |
   | `providerRouteSeparator` | 分隔配置 ID 与路由序号的字符；用于识别配置拥有的 Provider。实际 route 保存到图片读取配置。 |
   | `credentialReferencePrefix` | 官方凭据引用的名称前缀。 |

3. 阶段字段、耗时和 request ID 合同由 [src/image-reader/diagnostics-schema.ts](../../src/image-reader/diagnostics-schema.ts) 定义，日志产生入口为 [ImageReaderService](../../src/host/image-reader/image-reader-service.ts)。

4. Provider 调用失败时，Host 返回 `IMAGE_READER_PROVIDER_FAILED`。用户根据调用诊断核对配置和凭据；响应包含 `providerRetryAfterMs` 时，等待指定时长后重试。宿主报告输出达到上限时，图片读取返回 `IMAGE_READER_OUTPUT_LIMIT`。操作指引由[错误目录](../../config/error-catalog.json)提供。

## 子 Agent 派发配置

1. 工作台的 [agent.cordis.yml](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml) 加载 `@deepseek-ai/dsh-tool-subagent` 与 `@deepseek-ai/dsh-tool-subagent-control`。共享组合加载官方 `list-agents` 组件。派发组件字段如下。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `provider` | 使用 `spawn` 创建独立子会话。 |
   | `maxDepth` | 使用 `1` 限定子 Agent 的派发深度。 |

2. 派发组件省略 `agentPreset` 与 `agentOptions`，由宿主继承工作台组合与父 Agent 模型配置。

3. 工具参数、返回值和使用说明以运行时官方工具声明为准。会话与生命周期职责见[系统架构](architecture.md#项目-presetskills-与目录访问)。

## 受管 CLI 配置

1. [config/managed-cli-environment.json](../../config/managed-cli-environment.json) 唯一定义 CLI executable、Node executable、API 与 capability 环境字段。Host 为当前前台 Tool Call 提供这些字段；身份生命周期见[系统架构的受管 CLI 身份章节](architecture.md#host-node-与受管-cli-身份)。

2. [config/base.json](../../config/base.json)的 `cliServer` 字段由 [config/schema.ts](../../config/schema.ts) 校验。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `cliServer.host` | listener 地址，固定为 `127.0.0.1`。 |
   | `cliServer.port` | listener 端口，固定为 `0`，由操作系统分配实际端口。 |
   | `cliServer.shutdownTimeoutMs` | 插件卸载时等待已接纳请求退出的期限，默认 `5000` 毫秒。 |

3. [config/managed-cli-help.json](../../config/managed-cli-help.json) 定义受管 CLI 的公共输出说明与结果文件错误。

4. [config/managed-cli-limits.json](../../config/managed-cli-limits.json) 统一提供 CLI、Host 与帮助使用的请求限制，由 [src/cli/limits.ts](../../src/cli/limits.ts) 加载。

   | 字段 | 用途 |
   | --- | --- |
   | `maxSubmissionItems` | 一份生成清单接纳的最大项数。 |
   | `maxRequestBytes` | 请求体的最大字节数。生成提交在参数文件展开后计算。 |
