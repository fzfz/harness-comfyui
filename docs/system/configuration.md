---
文档用途: 定义插件配置字段、覆盖顺序与凭据归属。
读取时机: 修改配置文件、设置接口或环境变量前。
---
# 配置规范

## 官方插件配置与存储校验

1. 官方 Harness 按 bundle、Profile、home、invocation 的顺序合并插件配置，后续层覆盖较早层的同名字段。Profile 条目的 `config` 会整体替换该条目此前的配置对象。Host 插件收到官方应用合并后的配置，再加载项目 Configuration Profile。

2. Core 的官方插件配置字段如下。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `harness-comfyui-core.config.configurationProfile` | 选择项目 Configuration Profile；允许的值为 `production`。 |
   | `harness-comfyui-core.config.dataDirectory` | 可选的绝对数据目录，统一重算插件存储路径。省略时，存储路径以 `ctx.dshHomePath()` 返回的官方 Harness home 为基准解析。 |
   | `harness-comfyui-core.config.browserExecutablePath` | 可选的 Chrome 或 Chromium 绝对可执行文件路径；插件详情的“Workflow 浏览器”设置保存该值。 |

3. `config/plugin-storage.json` 定义受管存储字段。[assertPluginStorageWritable()](../../src/host/core/plugin-storage.ts) 在激活时校验目录及已存在的 SQLite 文件。校验失败时，Host 报告具体路径和系统原因；维护者修正对应访问权限，或把 `dataDirectory` 设为可写目录。

## Configuration Profile 计算顺序

1. Host 依次计算业务配置；[loadProfile()](../../src/config/load-profile.ts) 与 [Core apply()](../../src/host/core/plugin.ts) 是加载入口。

   1. 深度合并 `config/base.json` 与所选 `config/profiles/<name>.json`。
   2. 按 `config/environment-overrides.json` 应用已声明环境变量。
   3. 把相对存储路径解析到当前官方 Harness home。
   4. 保存了 `dataDirectory` 时，按 `config/base.json` 中各存储路径相对 `dataDir` 的位置统一重算存储路径。
   5. 保存了 `browserExecutablePath` 时，使用该值作为实际浏览器路径。

2. `config/environment-overrides.json` 唯一定义环境变量名称、目标字段与值类型。`target` 声明把解析值写入指定字段，number 声明解析为数值，string 声明保留字符串；`passThrough` 声明接受调用环境值。`loadProfile()` 校验实际传入的 Host 环境，未声明的 `HARNESS_COMFYUI_*` 变量会触发配置错误；维护者依据报错变量与该配置文件修正 Host 环境。

## Configuration Profile 字段

1. `config/schema.ts` 定义字段与约束，`config/base.json` 和 `config/profiles/production.json` 定义默认值。字段用途如下。

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
   | `comfyui.frontendCompiler.instanceCacheEpoch` | Host 级非空缓存代次，变化后使全部已登记实例的此前缓存失效。 |
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

2. 任一实例升级前端、安装或升级影响 Workflow 序列化的自定义节点，或改变前端导出行为后，维护者递增 `instanceCacheEpoch`，再完全退出并重新打开官方应用。

3. `COMFYUI_API_WORKFLOW_CACHE_INVALID` 表示错误消息指向的缓存文件存在 JSON、identity 或 API Workflow 结构问题。维护者关闭官方应用、删除该文件，再重新打开应用并重试；文件缺失时，Host 执行官方前端导出并写入缓存。缓存 identity、校验和并发导出由 [OfficialApiWorkflowCompiler](../../src/host/generation/official-api-workflow.ts) 维护。

4. 浏览器固定启动参数由 [ChromeComfyFrontend](../../src/host/generation/comfy-frontend-browser.ts) 定义。用户在“Workflow 浏览器”设置中保存路径后，下一次需要启动浏览器的导出使用该路径。

## Host 内部数据源设置

1. Host 使用当前 Profile 的 `harness-comfyui-core` 条目保存内部数据源地址。Client 的“ComfyUI”设置页通过“数据源服务”页签保存以下字段。

   | 字段 | 规则与用途 |
   | --- | --- |
   | `configuration.url` | HTTP 或 HTTPS URL，包含协议与主机名，可包含根路径 `/`；用户名、密码、端口、其他路径、query 和 fragment 由校验拒绝。 |
   | `configuration.port` | 数据源端口，必须是 `1` 至 `65535` 的整数。 |

2. Host 内部数据源客户端在每次请求时读取当前 Profile 中生效的地址。保存成功后，下一次 Catalog、实例或 Workflow bundle 请求立即使用该地址；已保存端口覆盖 Configuration Profile 的默认端口。地址合同由 [src/source-settings.ts](../../src/source-settings.ts) 定义，请求入口位于 `src/host/source-client/`。

## NoobAI MCP 服务

1. 7 个项目 Preset 通过共享组合加载 [agent-presets/noobai-mcp.cordis.yml](../../agent-presets/noobai-mcp.cordis.yml)，由 DSH 原生 MCP 客户端连接 NoobAI MCP 服务。该文件定义服务名、传输方式、地址、请求头、Tool 调用期限和启动失败行为；维护者在官方 DSH home 的 `.env` 文件中设置 `NOOBAI_MCP_TOKEN`，由官方应用启动时加载并提供 Bearer 凭据；本机默认文件为 `~/.dsh/.env`。修改后，维护者完全退出并重新打开官方应用。

2. NoobAI MCP 服务与 Host 内部数据源客户端必须连接同一目录数据。维护者分别配置 MCP 声明和“数据源服务”设置，确保 Agent 选择的目录 ID 能由 Host 读取。

## 图片读取设置

1. Host 使用当前 Profile 的 `harness-comfyui-image-reader` 条目保存图片读取配置。Client 的“图片读取”设置页调用 `harnessComfyuiImageReader` 的 `activateProfile`、`saveProfile` 和 `deleteProfile` 接口。字段合同如下。

   | 字段 | 规则与用途 |
   | --- | --- |
   | `configuration.activeProfileId` | 下一次图片读取使用的配置 ID，必须对应 `configuration.profiles[]` 中的配置。 |
   | `configuration.profiles[]` | 一至二十份命名配置，ID 在列表内唯一。 |
   | `configuration.profiles[].id` | 稳定的小写字母、数字、下划线或连字符 ID，最长 80 个字符。 |
   | `configuration.profiles[].name` | 设置页显示的配置名称，最长 80 个字符。 |
   | `configuration.profiles[].connectionType` | `runtime` 使用系统 Provider；`openai-compatible` 使用自定义 Chat Completions 接口。 |
   | `configuration.profiles[].provider` | runtime 配置的精确 Harness Provider route；OpenAI 兼容配置保存空字符串。 |
   | `configuration.profiles[].endpoint` | OpenAI 兼容配置的完整 HTTP 或 HTTPS Chat Completions 地址；runtime 配置保存空字符串。 |
   | `configuration.profiles[].model` | Provider 或 OpenAI 兼容接口接受的精确视觉模型 ID。 |
   | `configuration.profiles[].hasApiKey` | Host 根据官方凭据服务派生的已保存 API Key 状态。 |
   | `configuration.profiles[].defaultPrompt` | 单次调用省略 `prompt` 时使用的默认读图提示词。 |
   | `configuration.profiles[].temperature` | 模型调用温度，范围为 `0` 至 `2`。 |
   | `configuration.profiles[].maxTokens` | 最大输出 Token 数，范围为 `1` 至 `32768`。 |
   | `credentialRefs.<profileId>` | OpenAI 兼容配置的公开凭据引用，API Key 明文由官方凭据服务保存。 |

2. 系统 Provider 与模型候选来自 Harness LLM Runtime，设置页列出声明 `image` 输入能力的模型。OpenAI 兼容配置使用完整 endpoint，Host 按 Chat Completions 格式发送图片 Data URL 与调用参数。使用 HTTP endpoint 时，API Key 和图片数据通过未加密的 HTTP 连接传输。

### 配置保存、激活与删除合同

1. 保存请求包含 `operation: create | update`、`profile` 与最终 `activateProfileId`。`create` 新增尚不存在的 ID，`update` 修改仍然存在的同 ID 配置；最终激活目标必须存在。Host 在一次 Settings 写入中保存配置与激活目标，“保存 A 并切换 B”直接以 B 作为生效配置。

2. OpenAI 兼容配置的保存请求必须包含 `credential`。`{ action: "keep" }` 保留凭据，`{ action: "clear" }` 清除凭据，`{ action: "replace", apiKey: <值> }` 替换凭据；API Key 只随替换请求发送。runtime 配置使用第 1 项的请求字段，保存后清除对应 API Key。读取、保存、激活和删除响应返回 `hasApiKey` 状态。

3. 凭据替换使用独立引用，引用前缀由 `config/image-reader-runtime.json` 定义。[ImageReaderConfigurationService](../../src/host/image-reader/configuration-service.ts) 负责 Settings 写入确认、凭据提交与清理；只读凭据来源阻止替换、清除、删除及转为 runtime 配置。保存结果不明或凭据清理失败时，Host 返回 `config/error-catalog.json` 中对应的 `IMAGE_READER_CREDENTIAL_*` 错误。

4. 激活操作修改活动 ID；删除操作保留至少一份配置。删除活动配置后，Host 优先激活删除前列表中的后一项，缺少后一项时激活前一项。Host 按调用顺序串行处理配置写操作，并在成功后返回完整 `configuration`。

5. Client 区分已保存配置与编辑草稿，未保存草稿在离开设置页后丢弃。选择已保存配置会立即激活该配置；普通保存采用实际生效的激活目标。草稿、外部配置变化、取消和成功响应的状态处理由 [image-reader-settings.tsx](../../src/client/image-reader/image-reader-settings.tsx) 维护。

6. Host 与 Client 使用 [src/image-reader/settings.ts](../../src/image-reader/settings.ts) 的保存校验合同，设置页在对应字段与保存按钮附近显示具体错误。保存、激活与删除持久化失败分别使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`、`IMAGE_READER_SETTINGS_ACTIVATE_FAILED` 与 `IMAGE_READER_SETTINGS_DELETE_FAILED`。成功保存或激活后，下一次图片读取立即使用生效配置。

### 默认提示词、运行配置与调用诊断

1. `config/image-reader-profiles.json` 中 ID 为 `default` 的记录定义新建配置的默认提示词。已保存配置使用用户值；本次请求提供的 `prompt` 只覆盖该次调用。

2. `config/image-reader-runtime.json` 定义图片读取插件的运行字段，由 `src/image-reader/plugin-schema.ts` 校验。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `shutdownTimeoutMs` | 插件卸载时等待已取消活动请求退出的期限，默认 `5000` 毫秒；插件同名配置可覆盖默认值。期限到达后，Host 报告仍未结束的请求。 |
   | `diagnosticLogFormat` | Host logger 的阶段日志格式模板。 |
   | `credentialReferencePrefix` | 官方凭据引用的名称前缀。 |

3. 阶段字段、耗时和 request ID 合同由 [src/image-reader/diagnostics-schema.ts](../../src/image-reader/diagnostics-schema.ts) 定义，日志产生入口为 [ImageReaderService](../../src/host/image-reader/image-reader-service.ts)。`response_complete` 表示正文读完，`completed` 表示响应解析与完成原因检查成功。

4. Runtime Provider 失败使用 `IMAGE_READER_PROVIDER_FAILED`，诊断包含本次配置名称与 ID、Provider、模型、温度、输出上限、finish kind、`LlmFailure.code`，以及 Provider 提供的状态码和 request ID。用户据此核对配置和凭据；返回 `providerRetryAfterMs` 时按该时长重试。OpenAI 兼容响应的 `finish_reason=length` 使用 `IMAGE_READER_OUTPUT_LIMIT`，操作指引由 `config/error-catalog.json` 提供。

## 子 Agent 派发配置

1. 工作台的 [agent.cordis.yml](../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml) 定义 `task-agent`；迭代预设的 [agent.cordis.yml](../../agent-presets/harness-comfyui-iteration/agent.cordis.yml) 定义构图、生成、观察和比较的派发工具。字段用途如下。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `toolName`、`description` | 角色工具名称与调用说明。 |
   | `agentPreset` | 子 Agent 使用的角色 Preset ID；角色入口见[系统架构](architecture.md#项目-presetskills-与目录访问)。 |
   | `agentOptions.provider`、`agentOptions.model`、`agentOptions.reasoningEffort` | 模型供应商、模型与推理设置。 |
   | `provider` | 使用 `spawn` 创建独立子会话。 |
   | `maxDepth` | 使用 `1` 限定子 Agent 的派发深度。 |
   | `parameters` | 角色工具的模型可见参数 JSON Schema。 |
   | `taskTemplate.title`、`taskTemplate.sections[]` | 任务消息标题，以及按顺序呈现参数的分组标题与字段。 |

2. 每个角色 Preset 的 `agent.cordis.yml` 定义自身 persona，并通过 [shared/agent.cordis.yml](../../agent-presets/shared/agent.cordis.yml) 加载公共组合。工具能力由该 Preset 加载的组件确定；产品 Preset 加载派发与中断工具，迭代产品 Preset 另加载 Goal 工具。

3. 派发合同见[系统架构](architecture.md#项目-presetskills-与目录访问)，输出文件合同见 [references/records.md](../../.agents/skills/comfyui-iterate-generation/references/records.md)。

## 受管 CLI 配置

1. `config/managed-cli-environment.json` 唯一定义 CLI executable、Node executable、API 与 capability 环境字段。Host 为当前前台 Tool Call 提供这些字段；身份生命周期见[系统架构的受管 CLI 身份章节](architecture.md#host-node-与受管-cli-身份)。

2. `config/base.json.cliServer` 的字段由 `config/schema.ts` 校验。

   | 字段 | 用途与规则 |
   | --- | --- |
   | `cliServer.host` | listener 地址，固定为 `127.0.0.1`。 |
   | `cliServer.port` | listener 端口，固定为 `0`，由操作系统分配实际端口。 |
   | `cliServer.shutdownTimeoutMs` | 插件卸载时等待已接纳请求退出的期限，默认 `5000` 毫秒。 |

3. 受管 CLI 的结果文件使用 `os.tmpdir()` 选择的系统临时目录。该目录由 [result-file.mjs](../../scripts/cli/result-file.mjs) 读取。公共输出与文件错误见 [CLI 帮助配置](../../config/managed-cli-help.json)。
