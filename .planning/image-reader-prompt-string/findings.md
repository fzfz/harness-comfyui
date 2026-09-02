# 图片识别 Tool 接口调整调研记录

## 任务边界

- 用户要求计划编写者在独立 worktree 中调研并设计方案，用户批准前不得实施。
- 独立 worktree 路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-image-reader-prompt-string`。
- 独立分支为 `codex/plan-image-reader-prompt-string`，起点为 `origin/main` 的提交 `b2b92fe`。
- 本次任务使用 `.planning/image-reader-prompt-string/` 保存隔离的调研与方案文件，没有修改仓库根部其他任务的规划记录。

## 用户确认的目标分层

- `inspect_image` Tool 增加可选读图提示词。调用者传入时覆盖本次默认提示词；调用者不传时继续使用活动图片读取配置的 `defaultPrompt`。
- 视觉模型只需要返回普通字符串，不需要返回 JSON。
- `inspect_image` Tool 可以继续把视觉模型字符串包装为包含 `provider`、`model`、`file_path` 和 `observation` 的 JSON 对象。
- 用户随后指出 `ComfyUI工作台预设` 中的 Skill 必须能够得知并使用本次提示词覆盖。最终授权把受管 CLI `image inspect --stdin` 的输入合同扩展为可选 `prompt`，并同步修改 `local-image-reader`、`comfyui-image-review` 及其 CLI 参考文档。CLI 的四属性 JSON 输出合同保持不变。

## 当前源码事实

- `src/host/image-reader/image-reader-tool.ts:createInspectImageTool()` 当前只声明必填参数 `file_path`；Tool 输出 schema 是包含 `provider`、`model`、`file_path` 和 `observation` 的对象，render 使用 `JSON.stringify()` 包装该对象。
- `src/host/image-reader/image-reader-service.ts:ImageReaderService.inspect()` 当前只接收本地图片路径与取消信号，并把活动配置的 `profile.defaultPrompt` 传给两种 Provider Adapter。
- runtime Provider 路径的 `observation()` 直接合并 `text-delta` 或完成文本块，trim 后返回字符串。该路径没有 `JSON.parse()`，也没有 JSON Schema 或 response format 校验。
- runtime Provider 的 `prepareCall()` 配置只包含 Provider、模型、`temperature` 与最大 Token；模型消息包含文本提示词与图片 Attachment，没有 JSON response format。
- OpenAI-compatible Provider 的请求 body 包含 Chat Completions 的模型、消息、`temperature` 和 `max_tokens`，没有 `response_format` 或 JSON Schema。
- OpenAI-compatible Provider 使用 `limitedResponseJson()` 解析 HTTP Chat Completions JSON transport envelope，再由 `chatCompletionText()` 读取 `choices[0].message.content` 字符串。实现不会对 `message.content` 再执行 `JSON.parse()`。
- `src/image-reader/settings.ts:IMAGE_READER_DEFAULT_PROMPT` 要求标签列表与空间描述段落，不要求 JSON 文本。
- `IMAGE_READER_EMPTY_RESPONSE` 在两种 Provider 路径中拒绝 trim 后的空字符串；非空普通文本已经是合法模型结果。

## JSON 调研结论

- 当前实现没有要求视觉模型输出 JSON。用户担心的后端视图模型 JSON 可靠性问题在现有模型内容解析层不存在。
- OpenAI-compatible HTTP 响应必须是 JSON，因为项目选择了 Chat Completions transport；该要求只适用于传输外壳，不适用于视觉模型的 `message.content`。
- Tool 输出对象是 Host 在模型调用完成后构造的确定性结构。Tool 的 JSON schema 与 `JSON.stringify()` 不会反向要求视觉模型生成 JSON。
- “模型返回普通字符串”本身不需要修改 Provider 请求、默认提示词、模型内容解析、Tool 输出 schema 或 CLI 输出协议。CLI 输入与两个 Skill 的修改只用于让 `ComfyUI工作台预设` 传递本次可选 `prompt`，不用于改变模型响应或四属性 JSON 包装。

## “无效 JSON”源码结论与生产证据边界

- 以下解析结论来自开发仓库源码，不代表用户指定生产目录当前加载的配置或代码版本。
- `src/host/image-reader/image-reader-service.ts:limitedResponseJson()` 是图片读取调用链中唯一会返回“The configured OpenAI-compatible endpoint returned invalid JSON.”的位置。
- 该函数在 HTTP 状态为成功后读取完整响应正文，并对 Chat Completions 传输外壳执行 `JSON.parse()`。响应正文为空、被截断、是 HTML、是 SSE 数据流或是其他非 JSON 文本时都会进入该错误分支。
- 该错误发生在 `chatCompletionText()` 读取 `choices[0].message.content` 之前，因此该错误不能由视觉模型回答正文是否为 JSON 导致。
- `tests/unit/image-reader-service.test.ts` 已包含“OpenAI-compatible 接口返回 HTTP 200 与 `not json` 正文”的确定性错误分支。
- 用户确认的生产目录 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` 包含图片读取 Settings 和当前部署源码，但现有日志与 Settings 没有保存那次失败 HTTP 响应的 Content-Type 或正文。因此，现有生产文件不能确认接口当时返回的是空正文、HTML、SSE、截断 JSON 或其他非 JSON 正文。
- 仅增加调用时 `prompt` 不会修复该传输错误。若用户要求处理该生产错误，计划执行者必须先取得一次失败响应的状态码、Content-Type 与经过敏感信息处理的正文样本，再根据真实响应格式单独设计修复；不能把视觉模型正文改成 JSON 作为修复方案。

## 配置保存失败源码结论与生产证据边界

- 用户可见的 `IMAGE_READER_SETTINGS_INVALID` 同时覆盖客户端 `validateImageReaderConfiguration()` 拒绝、Host `validateImageReaderConfiguration()` 拒绝、凭据变更目标错误和最终凭据状态不一致。`imageReaderSettingsErrorMessage()` 丢弃底层 `cause` 与具体校验消息，只显示 `config/error-catalog.json` 的统一原因和修正动作。
- 当前设置页把所有配置保存在同一个 React 状态对象中。使用者点击“保存全部配置”时，Client 把整个配置列表提交给 Host；Client 与 Host 都遍历校验全部配置，所以任一配置的未保存表单值不合法都会阻止当前配置保存。
- 源码存在一个确定的凭据状态缺陷：使用者先在 OpenAI-compatible 配置输入 API Key，再把同一配置切换为 runtime 时，连接切换只修改 Profile，不清除 `credentialUpdates[profile.id]`。使用者随后补全 runtime Provider 与模型并保存时，客户端配置校验可以通过，但 Host 因“API Key changes require an OpenAI-compatible profile”拒绝整个请求。
- 其他能够触发同一总括错误的未保存表单值包括：任一配置名称或默认提示词 trim 后为空；OpenAI-compatible 地址包含首尾空格、不是 HTTP/HTTPS URL、含用户名密码或 fragment；模型 trim 后为空；温度不是 0 至 2 的有限数；最大输出 Token 不是 1 至 32768 的整数；任一未完成的新建或复制配置仍保留在列表中。
- 当前错误文案无法确定用户本次失败对应哪一条规则。生产 Settings 可以证明两份配置已持久化，但不包含保存失败时的 Client 内存表单值，因此无法从 Settings 反推当时触发的唯一校验规则。计划编写者没有修改或重新提交生产配置。

## 用户确认的配置保存目标

- 设置页的保存动作只提交当前选中的一份图片读取配置及该配置的凭据变更；保存成功后该配置成为活动配置。
- Host 只校验并更新请求指定的图片读取配置；其他已保存配置不参与本次请求，不能阻止本次保存。
- Host 必须把通过校验的当前配置合并到最新持久化配置列表中，不能用 Client 传入的完整列表覆盖其他配置。
- Host 替换现有配置时必须保持原列表索引，新配置必须追加到列表末尾；保存成功后当前配置成为活动配置。
- 设置页只保留一份当前配置的未保存表单值；保存、放弃或删除后必须按 Host 返回的 `activeProfileId` 或原配置 ID 加载方案规定的唯一配置。
- 配置保存错误必须指出当前配置中失败的具体输入项与违反的规则，不能继续使用 `IMAGE_READER_SETTINGS_INVALID` 总括名称、连接方式、模型、提示词、温度、Token 与凭据的全部可能性。

## 用户指定生产目录的配置检查

- 用户最终确认只读生产目录为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`。早先对 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness` 的检查是路径理解错误，不用于生产结论。
- 生产 Settings 中存在两份图片读取配置，`activeProfileId` 指向现存的 OpenAI-compatible 配置。该配置的名称、endpoint、模型、默认读图提示词、温度与最大输出 Token 数均已持久化且非空，并且 `hasApiKey` 为真。检查过程没有输出 endpoint、模型和 API Key 的具体值。
- 因此，“加载已保存 OpenAI-compatible 配置后非敏感字段全部为空”不是 Settings 丢失数据。API Key 输入框按 write-only 合同保持空白，页面必须通过 `hasApiKey` 显示已保存凭据状态；其他非敏感字段必须显示 Settings 的持久化值。

## 已保存配置显示为空的确定性根因

- `src/client/image-reader/image-reader-settings.tsx` 用一个 `draft: ImageReaderConfiguration` 同时保存全部已保存配置与全部未保存编辑值。输入框通过 `replaceProfile()` 直接修改 `draft.profiles` 中的当前配置对象。
- `selectProfile(id)` 只把同一个 `draft` 对象的 `activeProfileId` 改为新 ID，没有从 `settings.value.configuration` 的持久化快照重新加载目标配置。
- 计划编写者在生产源码之外建立临时 Vitest 红色复现：初始 Settings 提供字段完整的 OpenAI-compatible 配置与另一份 runtime 配置；测试先清空 OpenAI-compatible 配置的本地输入，再切换到 runtime 并切回。期望值是 Settings 中的持久化值，实际值为名称、endpoint、模型与默认提示词全部空字符串，温度与最大输出 Token 数均为 `0`。
- 该红色复现排除了“Host 首次返回空配置”假设，并确认缺陷位于 Client 编辑状态与持久化状态混用。页面切回“已保存配置”时，显示的其实是之前留在 `draft.profiles` 中的未保存空值。
- 实施必须把 Host/Settings 返回的持久化配置快照与当前一份可编辑表单值分离。使用者确认保存或放弃未保存修改后，选择已保存配置必须从持久化快照重建当前表单，不能从之前的编辑对象重用值。

## 可选读图提示词设计

- `inspect_image` 参数新增可选 `prompt: string`；参数名不增加别名。
- 省略 `prompt` 时，Service 使用活动配置的 `defaultPrompt`。
- 提供 `prompt` 时，Service 只对本次调用使用该字符串，不能修改 Settings 中的 `defaultPrompt`。
- 提供的 `prompt` 必须 trim 后非空且原始长度不超过 32768 个字符。校验通过后，Service 原样传给 Provider，不 trim、不拼接、不改写。
- 空字符串、纯空白字符串和超过上限的字符串属于输入错误，不能静默回退到默认提示词。
- `inspect()` 的第二个参数使用包含 `signal` 与可选 `prompt` 的 options 对象。Tool 与 CLI route 都传递各自请求中的 `prompt` 和调用取消信号；两种入口省略 `prompt` 时，Service 使用活动配置的 `defaultPrompt`。

## 影响范围

- 生产源码：`src/image-reader/settings.ts`、`src/image-reader/settings-errors.ts`、`src/image-reader/contract.ts`、`src/image-reader/remote.ts`、`src/cli/contract.ts`、`src/host/image-reader/image-reader-service.ts`、`src/host/image-reader/image-reader-tool.ts`、`src/host/image-reader/image-reader-host.ts`、`src/host/cli/route.ts`、`src/client/index.tsx` 和 `src/client/image-reader/image-reader-settings.tsx`。
- 自动化测试：`tests/unit/image-reader-tool.test.ts`、`tests/unit/image-reader-service.test.ts`、`tests/unit/cli-contract.test.ts`、`tests/integration/cli-command.test.ts`、`tests/integration/cli-route.test.ts`、`tests/unit/catalog-remote.test.ts`、`tests/unit/image-reader-model-catalog.test.ts`、`tests/unit/image-reader-settings.test.ts`、`tests/unit/client-plugin.test.ts` 和 `tests/desktop/desktop-live.test.mjs`。
- Skill 内容：`.agents/skills/local-image-reader/SKILL.md`、`.agents/skills/local-image-reader/references/image-inspection-cli.md`、`.agents/skills/comfyui-image-review/SKILL.md` 和 `.agents/skills/comfyui-image-review/references/cli.md`。
- 语义内容：`docs/system/architecture.md`、`docs/system/configuration.md`、`docs/system/testing.md`、`docs/releasenotes.md`、Tool description、`prompt.description`、设置页当前配置保存文案和 `config/error-catalog.json` 的逐规则错误条目。
- 明确不修改：`scripts/cli/harness-comfyui.mjs`、Tool 输出 schema、CLI 输出协议、默认提示词正文和依赖文件。

## 依赖与安全结论

- 本方案不需要新增、安装或升级依赖。
- 项目安全规则禁止通过 `npx` 下载并执行 Context7；本次版本精确结论来自当前仓库源码与本机实际加载的 DSH 依赖源码，没有运行外部项目或脚本。
