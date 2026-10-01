# 配置规范

## 官方插件配置层

官方 Harness 按 bundle、Profile、home、invocation 的顺序合并插件配置；后续层覆盖较早层的同名字段。Profile 中的 `config` 是整体替换对象。Host 插件收到官方应用合并后的有效插件配置，再读取项目 `Configuration Profile`。

插件包内的 `config/base.json` 与 `config/profiles/production.json` 提供业务配置默认值；`config/schema.ts` 定义字段与范围，`config/environment-overrides.json` 定义可接受的 `HARNESS_COMFYUI_*` 环境变量。当前项目只有 `production` Configuration Profile。

| 官方 Profile 字段 | 用途与规则 |
| --- | --- |
| `harness-comfyui-core.config.configurationProfile` | 选择项目 Configuration Profile；当前允许的值为 `production`。 |
| `harness-comfyui-core.config.dataDirectory` | 可选的绝对目录，统一保存项目 Run、媒体、日志与缓存。省略时使用官方 `DSH_HOME` 下的插件默认目录。 |
| `harness-comfyui-core.config.browserExecutablePath` | 可选的 Chrome 或 Chromium 绝对可执行文件路径；插件详情中的“Workflow 浏览器”设置保存该值，后续编译使用新路径。 |

`config/plugin-storage.json` 列出受管存储目录字段和 Run Repository 文件字段。默认 `paths.dataDir` 为 `<DSH_HOME>/data/plugins/harness-comfyui`；其他默认目录来自 `config/base.json` 并位于该数据根目录下。`dataDirectory` 生效时，Host 按 `config/base.json` 中各目录相对 `dataDir` 的位置重建路径。`apiWorkflowCacheDirectory` 必须是 `dataDir` 的严格子目录。

Host 激活时检查各存储目录或其最近已存在的创建父目录是否可写，并检查已存在的 SQLite 文件为普通可读写文件。Generation Runtime 初始化数据库时创建 Run Repository 父目录、Run 目录和 Saved Media 目录。存储校验失败时，Host 报告具体路径和系统原因；维护者依据系统原因修正报错目录或文件的访问权限，或在官方 Profile 的插件详情中把 `harness-comfyui-core.config.dataDirectory` 设为可写目录。

## Configuration Profile

Host 按以下顺序计算业务值：

1. 深度合并 `config/base.json` 和所选 `config/profiles/<name>.json`。
2. 依 `config/environment-overrides.json` 把已声明环境变量写入指定字段；数值型声明解析为 number，字符串型声明保持 string。
3. 把相对存储路径锚定到当前官方 `DSH_HOME`。
4. 如果官方 Profile 的 `harness-comfyui-core.config.dataDirectory` 保存了绝对路径，以该路径重算全部插件存储路径。
5. 如果官方 Profile 的 `harness-comfyui-core.config.browserExecutablePath` 保存了绝对路径，以该值覆盖默认浏览器路径。

`config/environment-overrides.json` 是环境变量名称、目标字段和值类型的唯一结构化来源。带 `target` 的声明把解析后的值写入对应 Configuration Profile 字段；`passThrough` 声明接受并保留调用环境值，不把该值写入 Configuration Profile。只有实际传入 `loadProfile` 的 Host 环境才参与检查；Host 只接受该文件声明的 `HARNESS_COMFYUI_*` 变量。配置文件、受管环境变量和官方保存设置共同决定各字段的有效值。

| Configuration Profile 字段 | 用途 |
| --- | --- |
| `paths.dataDir` | 插件业务数据根目录；默认位于 `<DSH_HOME>/data/plugins/harness-comfyui`，可由 Profile 的 `dataDirectory` 指定。 |
| `paths.apiWorkflowCacheDirectory` | Official API Workflow Cache 目录；位于 `dataDir/api-workflow-cache`，必须是 `dataDir` 的严格子目录。 |
| `paths.runRepositoryFile` | Run Repository SQLite 文件；默认位于 Plugin Storage 根目录。 |
| `paths.runDirectory` | Run 文件目录；默认位于 Plugin Storage 根目录下的 `runs/`。 |
| `paths.savedMediaDirectory` | Saved Media 目录；默认位于 Plugin Storage 根目录下的 `media/`。 |
| `paths.logDirectory` | 插件 Host 日志目录；默认位于 Plugin Storage 根目录下的 `logs/`。 |
| `comfyui.defaultInstanceId` | 默认 ComfyUI 实例 ID。 |
| `comfyui.frontendCompiler.browserExecutablePath` | 官方前端编译 Worker cache miss 时直接启动的本机 Chrome 或 Chromium 绝对路径；production 默认值为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，用户保存的插件浏览器设置覆盖该默认值。 |
| `comfyui.frontendCompiler.instanceCacheEpoch` | Host 级非空缓存代次；值变化使该 Host 下全部已登记 ComfyUI 实例的旧缓存不再命中。 |
| `comfyui.frontendCompiler.timeoutMs` | 单次浏览器会话从启动到前端初始化及 `graphToPrompt()` 导出的总时限，正整数毫秒；production 默认值为 `120000`。 |
| `comfyui.frontendCompiler.preReadiness.devToolsPortMs` | 本机浏览器发布 `DevToolsActivePort` 的阶段时限，正整数毫秒；production 默认值为 `10000`。 |
| `comfyui.frontendCompiler.preReadiness.targetCreateMs` | Chrome DevTools HTTP 接口创建页面目标的阶段时限，正整数毫秒；production 默认值为 `10000`。 |
| `comfyui.frontendCompiler.preReadiness.webSocketConnectMs` | Harness Host 连接本机浏览器目标 WebSocket 的阶段时限，正整数毫秒；production 默认值为 `10000`。 |
| `comfyui.frontendCompiler.preReadiness.domainEnableMs` | 本机浏览器目标完成全部 Chrome DevTools domain enable 命令的共同阶段时限，正整数毫秒；production 默认值为 `10000`。 |
| `comfyui.frontendCompiler.preReadiness.navigationMs` | 本机浏览器目标完成 `Page.navigate` 的阶段时限，正整数毫秒；production 默认值为 `10000`。 |
| `comfyui.frontendCompiler.preReadiness.infrastructureAttempts` | 同一次缓存未命中时的浏览器会话尝试次数，只允许 `1` 或 `2`；production 默认值为 `2`。重试只覆盖前端就绪检查开始前的临时目录或浏览器启动失败、有效 `DevToolsActivePort` 缺失、创建页面目标或连接 WebSocket 失败、启用 DevTools domain 失败、页面目标崩溃、`Page.navigate` 失败及对应阶段超时。前端就绪要求页面加载完成、ComfyUI app 提供 `graph`、`loadGraphData()` 和 `graphToPrompt()`，且 splash loader 已隐藏。请求拦截、前端就绪检查和 Workflow 导出失败不重试。 |
| `source.catalogPort` | 用户尚未保存数据源端口时使用的默认端口；production 默认值为 `18093`。 |
| `jobs.pollIntervalMs` | ComfyUI Job 轮询间隔，毫秒。 |
| `jobs.missingObservationMs` | 已提交 Run 收到 Job `unknown`、`COMFYUI_CONNECTION_FAILED` 或 `COMFYUI_REQUEST_TIMEOUT` 后，判定缺失状态为失败的持续时长；后续 `pending` 或 `running` 会清除计时起点。 |
| `media.maxFileBytes` | 单个 ComfyUI 输出媒体允许保存的最大字节数。 |
| `client.runRefreshIntervalMs` | Client 查询 Generation Run 的刷新间隔，毫秒。 |
| `cliServer.host` | managed CLI listener 的地址；固定为 `127.0.0.1`。 |
| `cliServer.port` | managed CLI listener 的端口；固定为 `0`，由操作系统为当前插件实例分配。 |
| `cliServer.shutdownTimeoutMs` | 插件关闭 CLI listener 后等待已接纳请求结束的期限；默认 `5000` 毫秒。 |

Host 使用 `process.execPath` 启动官方前端编译 Worker；Worker 直接启动配置的 Chrome 或 Chromium。Worker 使用独立临时 profile、`--use-mock-keychain` 和 `--disable-features=DialMediaRouteProvider` 运行无界面浏览器；这些固定运行参数不接受环境变量覆盖。

`config/environment-overrides.json` 当前声明插件存储路径、默认实例、浏览器路径与编译期限、缓存代次、数据源默认端口、媒体大小上限和 Client 刷新间隔的环境覆盖。当前 Configuration Profile 由官方插件配置字段 `harness-comfyui-core.config.configurationProfile` 选择；环境映射表是变量名称、目标字段和值类型的唯一来源。`HARNESS_COMFYUI_SKILL_DIR`、`HARNESS_COMFYUI_SERVER_HOST` 和 `HARNESS_COMFYUI_SERVER_PORT` 已不再是受支持的配置项；当这些变量实际传入插件 Host 时，严格配置加载会因它们未声明而失败。维护者从实际传入 Host 的环境中移除退役变量。Skills 从插件包内资源加载；数据源 URL/port 在插件设置页配置；managed CLI listener 使用本机回环地址与系统分配端口。官方 Desktop development probe 只从 main `.env` 读取 `config/desktop-e2e.json` 声明的凭据变量并传给本轮应用，不读取或传入其中其他变量。

任一已登记 ComfyUI 实例升级前端、安装或升级影响 Workflow 序列化的自定义节点，或改变前端导出行为后，维护者递增 Host 级 `comfyui.frontendCompiler.instanceCacheEpoch`，然后完全退出并重新打开官方应用。此操作使该 Host 下全部已登记实例的旧缓存均不再命中。Host 不会把无效 JSON、缓存 identity 不匹配或 API Workflow 结构无效当作 cache miss。`COMFYUI_API_WORKFLOW_CACHE_INVALID` 指明单个缓存 JSON 存在上述问题时，维护者关闭官方应用、删除错误消息指明的缓存文件，再重新打开应用并重试原请求；文件不存在时，Host 执行新的官方前端导出并写入缓存。`HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY` 可按 `config/environment-overrides.json` 覆盖缓存路径；有效缓存目录必须是当前 `paths.dataDir` 的严格子目录。

插件 Host 在激活时读取 Configuration Profile。修改 bundle 或 Profile 配置后，用户完全退出并重新打开官方应用以加载新配置。数据源地址、图片读取配置和浏览器路径由插件设置界面保存；设置 Remote 按各字段定义的即时生效规则应用新值。

## Harness-ComfyUI 数据源服务设置

Host 使用当前 Profile 的 `harness-comfyui-core` 条目保存数据源服务 URL 和端口。Client 在 Harness 的“ComfyUI”设置页中通过“数据源服务”页签保存以下字段：

| 字段 | 规则与用途 |
| --- | --- |
| `configuration.url` | 数据源服务的 HTTP 或 HTTPS URL；该值包含协议和主机名，可以包含根路径 `/`，不包含用户名、密码、端口、其他路径、query 或 fragment |
| `configuration.port` | 数据源服务端口，必须是 `1` 至 `65535` 的整数 |

Host 每次执行语义查询、读取 ComfyUI 实例或读取 Workflow bundle 时，均使用当前 Profile 条目的最新值。保存成功后，Host 的下一次请求立即使用新的 URL 和端口，无需重启 Harness。配置文件中的 `source.catalogPort` 和 `HARNESS_COMFYUI_CATALOG_PORT` 只提供默认端口；当前 Profile 中已保存的用户值覆盖默认端口。

插件发行包包含 `scripts/source-client/imagegen-semantic-query.mjs` 和 `scripts/source-client/imagegen-comfyui-source-read.mjs`。Host 使用这两个内置客户端请求已配置的数据源服务，不读取或执行数据源仓库中的文件。

## 图片读取设置

Host 使用当前 Profile 的 `harness-comfyui-image-reader` 条目保存图片读取设置。Client 的“图片读取”设置页调用 Host 的 `harnessComfyuiImageReader/activateProfile`、`harnessComfyuiImageReader/saveProfile` 和 `harnessComfyuiImageReader/deleteProfile` 接口修改该条目。该条目包含以下属性：

| 字段 | 规则与用途 |
| --- | --- |
| `configuration.activeProfileId` | 下一次 `inspect_image` 使用的配置 ID；该值必须对应 `configuration.profiles[]` 中的一份配置 |
| `configuration.profiles[]` | 一至二十份命名图片读取配置；配置 ID 在同一列表内必须唯一 |
| `configuration.profiles[].id` | 配置的稳定小写字母、数字、下划线或连字符 ID，最长 80 个字符 |
| `configuration.profiles[].name` | 设置页显示的配置名称，最长 80 个字符 |
| `configuration.profiles[].connectionType` | `runtime` 表示系统 Provider；`openai-compatible` 表示自定义 Chat Completions 接口 |
| `configuration.profiles[].provider` | `runtime` 配置使用的精确 Harness Provider route；`openai-compatible` 配置必须保存空字符串 |
| `configuration.profiles[].endpoint` | `openai-compatible` 配置使用的完整 HTTP 或 HTTPS Chat Completions 地址；Host 不自动追加路径；`runtime` 配置必须保存空字符串 |
| `configuration.profiles[].model` | 系统 Provider 或 OpenAI 兼容接口接受的精确视觉模型 ID |
| `configuration.profiles[].hasApiKey` | 只表示该配置是否已经保存 API Key；该布尔值由 Host 查询官方凭据服务后重新计算 |
| `configuration.profiles[].defaultPrompt` | `inspect_image` 或 `image inspect --stdin` 省略本次 `prompt` 时使用的默认读图提示词 |
| `configuration.profiles[].temperature` | 独立视觉模型调用使用的数值，范围为 `0` 至 `2` |
| `configuration.profiles[].maxTokens` | 独立视觉模型调用允许返回的最大 Token 数，范围为 `1` 至 `32768` |
| `credentialRefs.<profileId>` | OpenAI 兼容配置的公开凭据引用；API Key 明文由官方凭据服务保存，浏览器只收到对应 `hasApiKey` 状态 |

系统 Provider 与模型候选来自 Harness 当前 LLM 运行时，并且设置页只列出明确声明 `image` 输入能力的模型。OpenAI 兼容配置不依赖系统 Provider 目录；Host 向完整地址发送 OpenAI Chat Completions 格式的单张图片 Data URL、提示词、模型 ID、`temperature` 和 `max_tokens`。当完整地址使用 HTTP 时，请求中的 Bearer API Key（如已配置）和 Data URL 图片数据不受 TLS 传输加密保护。

设置页把 Host 返回的实际生效配置与 Client 当前编辑草稿分别保存。已保存配置选择器只列出 Host 返回的 `configuration.profiles[]`；使用者选择另一份已保存配置时，Client 立即调用激活 Remote，Host 只修改 `configuration.activeProfileId`，不修改配置内容或凭据。外部 Settings 写操作在草稿编辑期间切换实际生效配置时，普通保存只保存当前草稿并继续使用外部写操作已经激活的配置。新建或复制但没有保存的配置只存在于 Client 草稿，离开设置页后丢弃，且不会参与图片读取。

设置页提交当前编辑配置、`operation: create | update`、最终 `activateProfileId`，以及 OpenAI 兼容配置所需的 `credential`；Host 只接受上述保存请求字段。Host 每次保存都读取最新 Settings：`update` 在原索引替换仍然存在的同 ID 配置，`create` 只把尚不存在的新 ID 配置追加到列表末尾；Host 在同一次 `settings.replace()` 中保存草稿并把最终目标写入 `activeProfileId`。因此，“保存 A 并切换 B”不会产生 A 临时生效的中间状态。Host 调用官方凭据服务的 `describe()`，派生每份配置的 `hasApiKey`。runtime 配置的保存请求只使用 `operation`、`activateProfileId` 与 `profile` 字段，Host 保存该配置时删除同 ID 的旧 API Key。OpenAI 兼容配置的保存请求必须包含 `credential: { action: "keep" }`、`credential: { action: "clear" }` 或 `credential: { action: "replace", apiKey: <新 API Key> }`；`keep` 保留现有值，`clear` 删除现有值，`replace` 写入请求中的新 API Key。新 API Key 只随 `replace` 请求发送；Host 的保存、读取、激活和删除响应均不返回 API Key 明文，只返回由持久化凭据派生的 `hasApiKey`。

Host 为每次 API Key 替换创建独立凭据引用，引用前缀由 `config/image-reader-runtime.json` 的 `credentialReferencePrefix` 定义。Host 先向官方凭据服务保存新值，再把引用写入 Profile；确认 Profile 保存后，Host 清除旧引用。保存前失败时，Host 清除临时引用并保留原配置与原凭据。Host 每次读取图片时解析当前引用；凭据缺失或读取失败时，Host 返回对应错误。只读凭据来源阻止替换、清除、删除及转为 runtime 配置。

Settings 返回保存失败时，Host 重新查询当前 Profile：确认原配置仍在时清除临时引用；确认本次配置已保存时完成旧凭据清理，并报告已保存但返回错误；无法确认时保留相关引用并报告保存状态不明。临时或旧凭据清理失败时，Host 报告失败阶段及引用。错误文案统一来自 `config/error-catalog.json` 的 `IMAGE_READER_CREDENTIAL_*` 条目。

删除已保存配置使用独立 Host Remote。删除操作移除 `credentialRefs.<profileId>`，并在确认配置保存后清除该引用对应的官方凭据；删除非活动配置保持原 `activeProfileId`，删除活动配置时优先选择删除前列表中的后一项，不存在后一项时选择前一项。删除操作必须保留至少一份已保存配置。Host 按调用顺序串行执行每次保存、激活或删除的“读取最新 Settings、校验、准备凭据引用、合并、`settings.replace()`、确认保存结果、清除旧凭据”完整临界区，防止重叠请求根据旧快照覆盖先完成的修改。保存、激活或删除成功后，Host 返回完整 `configuration`；Client 用返回值替换持久化快照并重新加载 Host 指定的活动配置；Host 已返回成功配置时，Client 即使同时收到本地取消信号，也采用该配置。

Host 与 Client 仅校验当前保存请求，并使用同一固定校验顺序。每条名称、连接参数、模型、默认提示词、温度、最大输出 Token 数或 API Key 规则具有独立错误码；设置页在对应输入项附近显示该规则，并在保存按钮附近显示同一错误码的总结。Client 必须按当前保存请求的校验结果决定能否提交该配置。保存持久化失败使用 `IMAGE_READER_SETTINGS_SAVE_FAILED`；激活持久化失败使用 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`；删除持久化失败使用 `IMAGE_READER_SETTINGS_DELETE_FAILED`。Host 通过 Typert 业务失败载体把这些具体错误码发送给 Client，设置页保留 Host 返回的具体错误码。Host 拒绝覆盖同 ID 的新建配置、重新创建并发删除的更新目标或激活不存在的已保存配置。保存或激活成功后，Host 返回的活动配置实时应用于下一次 `inspect_image` 调用，不需要重启 Host。

### 默认提示词与阶段诊断

`src/image-reader/settings.ts` 从 `config/image-reader-profiles.json` 中 ID 为 `default` 的记录读取新建配置的默认提示词。内置配置采用事实观察用途。当前 Profile 中已保存的用户值继续覆盖默认值；单次 `image inspect` 的 prompt 覆盖该次调用的活动配置提示词。

`config/image-reader-runtime.json` 保存 `shutdownTimeoutMs` 和 `diagnosticLogFormat`，由 `src/image-reader/plugin-schema.ts` 校验。`shutdownTimeoutMs` 是插件卸载时等待已取消的活动请求退出的期限，默认 `5000` 毫秒；插件配置中的同名字段可覆盖此默认值。插件取消活动请求，并在期限到达后报告仍未结束的请求；`diagnosticLogFormat` 是 Host logger 的阶段日志格式模板。`src/image-reader/diagnostics-schema.ts` 定义 stage、elapsedMs、stageElapsedMs、profileId、model 和可选 requestId；两个耗时字段均以毫秒计：`elapsedMs` 从本次图片准备开始前建立的计时起点计算，`stageElapsedMs` 从上一条阶段记录的时间计算，首条记录从本次计时起点计算。服务提供 `x-request-id` 响应头或 runtime 失败 request ID 时，日志记录该字段。响应头到达只代表 HTTP 响应已经开始；`response_complete` 表示正文读完，后续解析和完成原因检查通过后才记录 `completed`。

OpenAI-compatible 的 `finish_reason=length` 对应 `IMAGE_READER_OUTPUT_LIMIT`；错误原因与操作指引由 `config/error-catalog.json` 提供，managed CLI 的帮助补充检查本次 prompt、默认提示词和输出上限的步骤。

## 图片迭代角色配置

agent-presets/harness-comfyui-iteration/agent.cordis.yml 的 composition-agent、generation-agent、observation-agent、comparison-agent 四项均加载 ../project-iteration-dispatch.mjs。每项 config 的字段用途如下。

| 字段 | 用途 |
|---|---|
| toolName、description | 角色工具的名称与调用说明 |
| persona | 对应子 Agent 的独立 system prompt，定义其职责、工作流程和结果文件要求 |
| agentOptions.provider、agentOptions.model、agentOptions.reasoningEffort | 对应子 Agent 的模型供应商、模型及推理设置 |
| provider | spawn，创建独立子会话 |
| maxDepth | 1，子 Agent 不能继续创建子 Agent |
| toolFilter.deny | 子 Agent 不可使用的工具名称列表 |
| parameters | 模型可见的调用参数 JSON Schema，定义本次要求、材料、参考和输出路径的数据结构 |
| taskTemplate.title | 本角色任务消息的标题 |
| taskTemplate.sections[].heading、taskTemplate.sections[].fields | 消息分组标题及该分组按顺序呈现的参数名；参数值以 JSON 保存到消息正文 |
| outputSchema | 工具返回值 JSON Schema；首次返回 kind 和 subagentId，续派返回 messageId |

同一 agent.cordis.yml 中 id 为 persona 的配置项通过 config.prefix 定义主 Agent 的调度与交付职责。主 Agent 首次调用角色工具时省略 agent_id，续派时填写原 subagentId。component 将本次参数按模板组装后交给 DSH 原生 startContinuable 或 sendMessage；DSH 发送子任务完成通知。tool-subagent-control 项提供子 Agent 向父 Agent 报告问题的 send_message 和主 Agent 中断任务的 interrupt_agent。交接文件名由迭代 Skill 的 records.md 定义。

## Managed CLI 与卸载期限

`config/managed-cli-environment.json` 是 managed CLI 环境变量名称的唯一结构化来源，包括 CLI executable、Node executable、API、capability、semantic query client、source URL 和 source port。Host 通过 Harness 前台 Bash Tool Call 的 `shellEnv` 提供当前调用环境；每次 Tool Call 使用短期 capability，CLI route 校验该 capability 和调用身份。

`config/base.json.cliServer` 由 `config/schema.ts` 校验。listener 只绑定 `127.0.0.1`，端口由操作系统分配；插件关闭时最多等待 `shutdownTimeoutMs` 毫秒结束已接纳请求。Host 停止后释放 listener。

图片读取插件的关闭期限和阶段日志遵循“默认提示词与阶段诊断”。
