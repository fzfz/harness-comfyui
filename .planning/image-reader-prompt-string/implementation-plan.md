# `inspect_image` 可选读图提示词与当前配置保存实施方案

## 调研结论

当前实现已经允许视觉模型返回普通字符串，不要求视觉模型返回 JSON：

- runtime Provider 直接收集模型文本流；
- OpenAI-compatible Provider 只解析 Chat Completions 的 JSON 传输外壳，再读取字符串 `choices[0].message.content`；
- 两种模型请求都没有 `response_format` 或 JSON Schema；
- 默认读图提示词没有要求 JSON；
- `inspect_image` Tool 在模型调用完成后，把字符串包装为包含 `provider`、`model`、`file_path` 和 `observation` 的对象。

因此，图片读取 Tool 与受管 CLI 都必须增加可选读图提示词。Tool 与 CLI 的四属性 JSON 输出保持不变。`standard` Preset 的 Agent 从 Tool schema 得知该参数；`ComfyUI工作台预设` 隐藏 Host Tool，因此 `local-image-reader` 与 `comfyui-image-review` 必须从各自的 CLI 参考文档得知并传递该参数。实施者必须新增回归测试和系统文档，固定“模型返回字符串、Tool 或 CLI route 负责 JSON 包装”的合同。

开发仓库的“endpoint returned invalid JSON”发生在解析 HTTP 传输外壳时，早于读取模型的 `message.content`。本次可选提示词改动不能修复上游接口返回空正文、HTML、SSE、截断 JSON 或其他非 JSON 正文的问题；该问题需要以用户指定生产实例的实际失败响应证据为输入另行设计。生产目录包含图片读取 Settings，但现有文件没有保存失败响应的 Content-Type 或正文，因此本方案不声称已经确认生产接口的实际响应格式。

当前设置页把全部图片读取配置作为一个请求保存并统一校验，且 `IMAGE_READER_SETTINGS_INVALID` 丢弃具体失败输入项。用户要求保存动作只保存当前选中的配置；其他配置不得参与请求或阻止保存；错误必须直接指出当前配置的具体失败输入项与规则。

## 必须要实现的目标

### 1. 为 `inspect_image` 增加可选 `prompt`

计划执行者必须把 `src/host/image-reader/image-reader-tool.ts` 中 `inspect_image` 的参数定义修改为：

```ts
{
  file_path: string
  prompt?: string
}
```

`file_path` 继续表示一张本地图片的绝对路径。`prompt` 表示本次视觉模型调用使用的读图提示词。

计划执行者必须同步修改 `inspect_image` 顶层 `description` 与 `prompt.description`。两处说明必须明确：`prompt` 是可选读图提示词；提供时只覆盖本次调用；省略时使用活动图片读取配置的 `defaultPrompt`。Tool 说明不能继续声称每次调用都固定使用 Harness Settings 中的提示词。

- 调用者省略 `prompt` 时，`ImageReaderService` 必须使用 `configuration.activeProfileId` 对应配置的 `defaultPrompt`。
- 调用者提供合法 `prompt` 时，`ImageReaderService` 必须只在本次调用中使用该值，并覆盖本次默认提示词。
- 本次覆盖不得修改 Settings 中保存的 `defaultPrompt`。
- Tool schema 必须拒绝非字符串 `prompt`。Service 必须以 `IMAGE_READER_PROMPT_REQUIRED` 拒绝空字符串或 trim 后为空的字符串，并以 `IMAGE_READER_PROMPT_TOO_LONG` 拒绝长度超过 32768 个字符的字符串；两条错误消息只能说明各自实际违反的规则。这些输入不能静默使用默认提示词。
- 校验通过的 `prompt` 必须原样传给 Provider，不能 trim、拼接或改写。

### 2. 在 `ImageReaderService` 集中选择本次提示词

计划执行者必须把 `ImageReaderService.inspect()` 的内部接口改为：

```ts
interface ImageInspectionOptions {
  readonly prompt?: string
  readonly signal?: AbortSignal
}

inspect(filePath: string, options?: ImageInspectionOptions): Promise<ImageInspection>
```

`ImageReaderService.inspect()` 必须在调用 runtime Provider Adapter 或 OpenAI-compatible Provider Adapter 前只选择一次本次提示词。两种 Adapter 必须接收相同的选择结果。

计划执行者必须在 `src/image-reader/settings.ts` 导出图片读取提示词最大长度常量，并让当前配置 schema、配置验证和调用时 `prompt` 校验引用该常量。实现不能为同一个 32768 字符上限建立第二个数值来源。

`createInspectImageTool()` 必须向 Service 传递 `{ prompt: args.prompt, signal: exec.signal }`。受管 CLI route 必须向 Service 传递 `{ prompt: request.prompt, signal }`；CLI 请求省略 `prompt` 时继续使用活动配置的 `defaultPrompt`。

### 3. 保持模型字符串与 Tool JSON 包装合同

计划执行者不得修改 `inspect_image` 当前对象输出 schema。Tool 成功结果继续是：

```json
{
  "provider": "provider-route",
  "model": "vision-model",
  "file_path": "/absolute/local/path/result.png",
  "observation": "视觉模型返回的普通字符串"
}
```

runtime Provider Adapter 必须继续直接返回普通文本。OpenAI-compatible Provider Adapter 必须继续解析 HTTP Chat Completions JSON transport envelope，并把 `message.content` 当作普通字符串；实现不得要求或尝试解析 `message.content` 中的 JSON。

Tool 必须继续把 Service 返回的 `ImageInspection` 确定性包装为当前四属性对象。Provider 返回非空普通文本时，Tool 必须成功；Provider 返回空文本时，Service 必须继续返回 `IMAGE_READER_EMPTY_RESPONSE`。

### 4. 让 CLI 与两个项目 Skill 使用可选 `prompt`

计划执行者必须把 `image inspect --stdin` 的 stdin 合同修改为：

```ts
{
  file_path: string
  prompt?: string
}
```

- `prompt` 省略时，CLI 使用活动配置的 `defaultPrompt`；
- `prompt` 存在时，CLI 把该字符串传给 `ImageReaderService`，并使用与 Tool 相同的空白和长度错误码；
- CLI stdout 继续返回四属性 JSON；
- 现有只传 `file_path` 的 `inspect_image` 调用继续合法。

计划执行者必须更新 `src/cli/contract.ts`、`src/host/cli/route.ts`、`local-image-reader` 的 `SKILL.md` 与 `references/image-inspection-cli.md`、`comfyui-image-review` 的 `SKILL.md` 与 `references/cli.md`。两个 Skill 必须在用户指定观察重点、返回格式或本次读图提示词时构造可独立理解的完整 `prompt`；用户只要求一般识别、描述或分析时省略该属性。`scripts/cli/harness-comfyui.mjs` 的通用 stdin 传输逻辑不需要修改。

### 5. 同步系统合同和用户可见文案

计划执行者必须修改：

| 文件 | 必须表达的合同 |
|---|---|
| `docs/system/architecture.md` | `inspect_image` 与 `image inspect --stdin` 可以提供本次 `prompt`；省略时使用默认提示词；视觉模型返回字符串，Tool 与 CLI route 包装结构化对象；设置 Remote 只保存当前配置并由 Host 合并。 |
| `docs/system/configuration.md` | `configuration.profiles[].defaultPrompt` 是 Tool 或 CLI 省略本次 `prompt` 时使用的默认提示词；保存当前配置、派生 `hasApiKey`、删除配置与活动配置选择规则。 |
| `docs/system/testing.md` | 自动化测试覆盖 Prompt 全部分支、模型普通字符串、Tool JSON 包装、当前配置保存、Host 合并、API Key 三动作、独立删除和逐规则 Remote 错误传播。 |
| `src/client/image-reader/image-reader-settings.tsx` | 设置页说明默认读图提示词的使用条件；按钮明确写“保存当前配置”；字段附近只显示实际失败规则。 |
| `config/error-catalog.json` | 为 Prompt 规则、每条配置领域值规则和删除规则建立唯一中文标题、原因与修正动作。 |
| `docs/releasenotes.md` | 未发布变更记录 Tool 与 CLI 的可选提示词、两个项目 Skill 的调用条件、模型无需 JSON、Tool/CLI 输出未变化、当前配置保存、删除与具体错误、测试结果和依赖未变化。 |

### 6. 只保存当前选中的图片读取配置

计划执行者必须把设置页的保存操作从“提交完整配置列表”改为“提交当前选中的一份配置”。`src/image-reader/contract.ts` 必须建立以下等价的闭合合同；实现可以调整类型名，不能改变字段与状态语义：

```ts
type ImageReaderCredentialAction =
  | { readonly action: 'keep' }
  | { readonly action: 'replace'; readonly apiKey: string }
  | { readonly action: 'clear' }

interface EditableImageReaderProfileBase {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly defaultPrompt: string
  readonly temperature: number
  readonly maxTokens: number
}

type SaveImageReaderProfileRequest =
  | {
      readonly profile: EditableImageReaderProfileBase & {
        readonly connectionType: 'runtime'
        readonly provider: string
      }
    }
  | {
      readonly profile: EditableImageReaderProfileBase & {
        readonly connectionType: 'openai-compatible'
        readonly endpoint: string
      }
      readonly credential: ImageReaderCredentialAction
    }

interface SaveImageReaderProfileResult {
  readonly configuration: ImageReaderConfiguration
}

interface DeleteImageReaderProfileRequest {
  readonly profileId: string
}

interface DeleteImageReaderProfileResult {
  readonly configuration: ImageReaderConfiguration
}
```

`runtime` 请求不能包含 endpoint、`hasApiKey` 或 `credential`。`openai-compatible` 请求不能包含 Provider 或 `hasApiKey`。`hasApiKey` 必须由 Host 根据持久化凭据派生，Client 不能提交该字段。

Host 必须从 Settings 读取最新持久化配置列表。配置 ID 已存在时，Host 必须在原索引替换该配置；配置 ID 不存在时，Host 必须把新配置追加至列表末尾。两种保存都必须把该配置 ID 保存为 `activeProfileId`。Host 不得使用 Client 提交的配置列表覆盖其他已保存配置，也不得校验 Client 内存中其他配置的未保存表单值。

Client 必须分开维护 Host/Settings 返回的持久化配置快照与一份当前配置的可编辑表单值。当前表单值不得回写到持久化快照的配置数组；选择已保存配置时，Client 必须根据目标 ID 从持久化快照复制值并重建当前表单。当前配置具有未保存修改时，选择另一份配置不得把前一份配置的未保存值放入新的当前配置；页面必须要求使用者先“保存当前配置”或“放弃当前修改”再切换。页面不得积累多份配置的未保存值。

保存、放弃与删除后的 Client 选择规则必须固定为：

- 保存成功后，Client 使用 Host 返回的 `configuration.activeProfileId` 加载刚保存的配置；
- 放弃已持久化配置的修改时，Client 按同一配置 ID 重新加载持久化值；
- 放弃或删除尚未持久化的新建/复制配置时，Client 加载开始新建/复制前的持久化 `activeProfileId`；
- 删除任意已持久化配置成功后，Client 使用 Host 返回的 `configuration.activeProfileId` 加载当前编辑配置；
- Host 返回的完整配置必须替换 Client 的持久化列表快照，当前可编辑表单值只能从上述选中配置重新建立。

新建与复制操作必须生成一份尚未持久化的当前配置；使用者点击“保存当前配置”后，Host 按新配置 ID 把该配置追加至列表末尾。复制操作必须复制连接参数、模型、默认读图提示词、温度与最大输出 Token 数；OpenAI-compatible 复制配置的 `credential` 必须初始化为 `{ action: 'clear' }`，不能复制 API Key。使用者删除尚未持久化的新建或复制配置时，Client 只放弃当前表单值，不调用 Host 删除接口。

删除已持久化配置必须调用独立删除接口，不能通过提交缺少该配置的完整列表间接删除。Host 必须执行以下确定状态转换：

- 请求 ID 不存在时返回 `IMAGE_READER_PROFILE_NOT_FOUND`，Settings 与 credentials 不变；
- 只剩一份配置时返回 `IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN`；
- 删除非活动配置时保持原 `activeProfileId`；
- 删除活动配置时，Host 选择删除前列表中该配置的后一项；不存在后一项时选择前一项；
- 删除任意已持久化配置时同时删除 `credentials[profileId]`；
- 保存与删除成功结果都返回 Host 合并后的完整 `ImageReaderConfiguration`，其中每份配置的 `hasApiKey` 均由 Host 派生。

Host 保存 runtime 配置时必须自动删除同一配置 ID 的旧 API Key。Host 保存 OpenAI-compatible 配置时必须按 `credential.action` 执行：`keep` 保留现有值且允许当前不存在凭据；`replace` 使用非空且不超过 8192 个字符的 `apiKey` 替换现有值；`clear` 删除现有值且允许当前不存在凭据。

### 7. 返回具体配置输入错误

计划执行者必须停止使用 `IMAGE_READER_SETTINGS_INVALID` 表示所有保存校验错误。Remote request parser 只验证闭合对象、联合类型分支、必填属性与 JSON 原始类型；结构错误继续作为 Remote 协议错误处理，不能伪装成配置输入项错误。parser 不得校验非空、长度、数值范围、URL 语义或凭据长度，确保结构合法且 JSON 可表示的领域非法值进入 Host 逐规则校验。

计划执行者必须在 Host/Client 共享的确定性校验模块中实现下表的固定顺序。Client 必须在调用 Remote 前执行同一校验：`NaN`、`Infinity` 与 `-Infinity` 等 JSON 无法表示的数值由 Client 返回对应数值错误码，并且不得调用 Remote。Host 必须对 Remote 已解析的请求再次执行同一校验。可由 JSON 表示的领域非法值必须通过真实 Remote 到达 Host 并返回同一错误码。

Host 必须按下表从上到下校验当前配置；首次失败立即返回该行唯一错误码。`config/error-catalog.json` 必须为每个错误码提供只描述该行规则的中文标题、原因与修正动作：

| 错误码 | 唯一规则 |
|---|---|
| `IMAGE_READER_PROFILE_ID_FORMAT_INVALID` | ID 不匹配 `^[a-z0-9][a-z0-9_-]{0,79}$` |
| `IMAGE_READER_PROFILE_NAME_REQUIRED` | 名称 trim 后为空 |
| `IMAGE_READER_PROFILE_NAME_TOO_LONG` | 名称超过 80 个字符 |
| `IMAGE_READER_RUNTIME_PROVIDER_REQUIRED` | runtime Provider trim 后为空 |
| `IMAGE_READER_RUNTIME_PROVIDER_TOO_LONG` | runtime Provider 超过 10000 个字符 |
| `IMAGE_READER_ENDPOINT_REQUIRED` | OpenAI-compatible endpoint trim 后为空 |
| `IMAGE_READER_ENDPOINT_TOO_LONG` | endpoint 超过 2048 个字符 |
| `IMAGE_READER_ENDPOINT_WHITESPACE_INVALID` | endpoint 包含首尾空白 |
| `IMAGE_READER_ENDPOINT_URL_INVALID` | endpoint 不能解析为 URL |
| `IMAGE_READER_ENDPOINT_PROTOCOL_INVALID` | endpoint 协议不是 `http:` 或 `https:` |
| `IMAGE_READER_ENDPOINT_CREDENTIALS_FORBIDDEN` | endpoint 包含 URL username 或 password |
| `IMAGE_READER_ENDPOINT_FRAGMENT_FORBIDDEN` | endpoint 包含 fragment |
| `IMAGE_READER_MODEL_REQUIRED` | 模型 trim 后为空 |
| `IMAGE_READER_MODEL_TOO_LONG` | 模型超过 10000 个字符 |
| `IMAGE_READER_DEFAULT_PROMPT_REQUIRED` | 默认读图提示词 trim 后为空 |
| `IMAGE_READER_DEFAULT_PROMPT_TOO_LONG` | 默认读图提示词超过 32768 个字符 |
| `IMAGE_READER_TEMPERATURE_NUMBER_INVALID` | 温度不是有限数 |
| `IMAGE_READER_TEMPERATURE_RANGE_INVALID` | 温度小于 0 或大于 2 |
| `IMAGE_READER_MAX_TOKENS_INTEGER_INVALID` | 最大输出 Token 数不是安全整数 |
| `IMAGE_READER_MAX_TOKENS_RANGE_INVALID` | 最大输出 Token 数小于 1 或大于 32768 |
| `IMAGE_READER_API_KEY_REQUIRED` | `replace.apiKey` 为空字符串 |
| `IMAGE_READER_API_KEY_TOO_LONG` | `replace.apiKey` 超过 8192 个字符 |
| `IMAGE_READER_PROFILE_LIMIT_REACHED` | 插入新 ID 会让持久化配置数量超过 20 |
| `IMAGE_READER_PROFILE_NOT_FOUND` | 删除请求的配置 ID 不存在 |
| `IMAGE_READER_LAST_PROFILE_DELETE_FORBIDDEN` | 删除请求指向唯一剩余配置 |

Client 必须在当前配置对应的输入项附近显示具体错误，并在保存按钮附近显示同一错误码对应的简短总结。Host 只能返回当前保存请求实际失败的错误码；错误文案不能列举与本次失败无关的其他输入项。真实 Remote 测试必须证明结构合法、JSON 可表示但领域值非法的请求返回上表错误码，而不是 `TypeError` 或通用 Remote 协议错误。

计划执行者必须在 `src/image-reader/settings-errors.ts` 建立共享的固定顺序领域校验器和“错误码到设置页输入项”的只读结构化映射，设置页、Host 与测试共同引用；实现不得在多个组件中复制校验规则或错误码分组。中文标题、原因与修正动作仍只来自 `config/error-catalog.json`。

历史研究文件 `docs/research/image-reader-default-prompt.md` 保存当时结论，计划执行者不得改写该文件。

## 实施步骤

### 步骤 1：先固定失败测试

计划执行者必须修改 `tests/unit/image-reader-tool.test.ts`，覆盖：

- 参数 schema 包含必填 `file_path` 和可选字符串 `prompt`，并保持 `additionalProperties: false`；
- Tool 顶层说明与 `prompt.description` 明确表达本次覆盖和省略时使用默认提示词；
- 省略 `prompt` 时，Tool 向 Service 传递 `prompt: undefined`；
- 提供合法 `prompt` 时，Tool 原样向 Service 传递该字符串；
- Tool 成功结果继续是四属性对象，render 继续输出该对象的 JSON；
- Service 返回非 JSON 普通观察文本时，Tool 把该文本原样放入 `observation`。

计划执行者必须修改 `tests/unit/image-reader-service.test.ts`，覆盖：

- runtime Provider 在省略 `prompt` 时收到活动配置的 `defaultPrompt`；
- runtime Provider 在提供 `prompt` 时收到调用值；
- OpenAI-compatible Provider 在省略和提供 `prompt` 时分别收到正确文本；
- 普通非 JSON 模型文本直接成为 `observation`；
- OpenAI-compatible `message.content` 是普通非 JSON 文本时成功；
- 非字符串值由 Tool schema 拒绝；空字符串与纯空白字符串由 Service 以 `IMAGE_READER_PROMPT_REQUIRED` 拒绝；超过 32768 个字符的字符串由 Service 以 `IMAGE_READER_PROMPT_TOO_LONG` 拒绝；
- 长度等于 32768 个字符的非空提示词被接受；
- 空模型响应、Provider 失败、文件失败和取消分支保持现有错误语义。

计划执行者必须修改 `tests/unit/cli-contract.test.ts`、`tests/integration/cli-command.test.ts` 与 `tests/integration/cli-route.test.ts`，覆盖 CLI stdin 省略与提供 `prompt`、非字符串与额外属性拒绝、Host route 原样传递 `prompt`，并确认成功 data 保持四属性对象。

计划执行者必须修改 `tests/unit/catalog-remote.test.ts`，覆盖保存与删除请求/结果的闭合结构、两个连接分支、API Key 三动作、额外属性拒绝，以及结构合法领域非法值可以通过 parser。

计划执行者必须修改 `tests/unit/image-reader-model-catalog.test.ts`，覆盖：

- 保存请求只包含当前配置；OpenAI-compatible 分支同时包含该配置的结构化 API Key 动作；保存成功后该配置成为活动配置；
- Host 更新现有配置时保留其他持久化配置不变；
- Host 替换现有 ID 时保持原索引，保存新建或复制配置时追加至列表末尾；
- 其他配置的未保存非法表单值不进入当前配置保存请求，也不阻止保存；
- OpenAI-compatible 配置输入 API Key 后切换为 runtime 时，保存请求的数据结构不包含 API Key 动作，Host 自动清除该配置的旧 API Key；
- 错误码表每一行具有一个直接 Host 测试，断言唯一错误码、Settings replace 未调用且无关配置与 credentials 未修改；
- 删除不存在 ID 与最后一份配置分别返回对应错误码；
- 删除非活动配置保持 `activeProfileId`，删除活动配置优先选择原列表后一项且末项删除选择前一项；
- 删除已持久化配置同时删除对应 API Key，并返回合并后的完整配置。

计划执行者必须修改 `tests/unit/image-reader-settings.test.ts`，覆盖设置页只提交当前配置、当前未保存修改的切换门禁、新建/复制保存、复制配置不复制 API Key、未保存配置本地删除且不调用 Remote、已保存配置 Remote 删除、保存/放弃/删除后加载规定的当前配置、错误码表每一行对应字段只显示实际规则，以及保存按钮附近的同码总结。`NaN`、`Infinity` 与 `-Infinity` 必须在 Client 返回对应数值错误码并断言 Remote 未调用。

该测试还必须使用包含完整非敏感值和 `hasApiKey: true` 的已保存 OpenAI-compatible 配置，并固定以下回归场景：首次打开后名称、endpoint、模型、默认读图提示词、温度与最大输出 Token 数均显示持久化值；测试在不保存的情况下把这些字段改成空字符串或 `0`，再通过“放弃当前修改”切换到另一已保存配置并切回，页面必须再次显示持久化值，不得显示之前的未保存空值。关闭后重新打开也必须显示持久化值。API Key 输入框保持空白，并明确显示已保存凭据状态。

计划执行者必须修改 `tests/unit/client-plugin.test.ts`，覆盖保存当前配置与删除配置 Remote face 的请求、结果和错误透传。计划执行者必须修改 `tests/desktop/desktop-live.test.mjs`，把设置页真实保存验收改为“保存当前配置”，并覆盖另一配置不参与请求与一个逐规则字段错误。

### 步骤 2：实现最小生产修改

计划执行者必须依次修改：

1. `src/image-reader/settings.ts`：建立提示词最大长度单一来源；
2. `src/host/image-reader/image-reader-service.ts`：增加 options 接口、调用值校验和单点提示词选择；
3. `src/host/image-reader/image-reader-tool.ts`：增加可选 `prompt` 参数并透传；
4. `src/cli/contract.ts` 与 `src/host/cli/route.ts`：让 `image inspect --stdin` 接受可选 `prompt` 并传给 Service；
5. 两个项目 Skill 的 `SKILL.md` 与 CLI 参考文档：定义本次观察要求的判断、完整覆盖提示词、缺省语义和错误修正。

计划执行者不得修改 Provider response format、Tool 输出 schema 或 CLI stdout。

计划执行者随后必须修改：

1. `src/image-reader/contract.ts`：用按连接方式区分的当前配置保存请求、OpenAI-compatible 结构化 API Key 动作和独立删除请求替换完整配置列表保存请求；
2. `src/image-reader/settings-errors.ts` 与 `src/host/image-reader/image-reader-host.ts`：建立共享固定顺序校验器、逐规则错误码与输入项映射，只合并当前配置，派生 `hasApiKey`，实现独立删除操作并返回具体错误码；
3. `src/client/image-reader/image-reader-settings.tsx`：分离持久化配置快照与当前可编辑表单，从快照加载选中配置，保存按钮改为“保存当前配置”，按连接方式构造当前配置请求，并把具体错误显示在对应输入项附近；
4. `config/error-catalog.json`：为 `IMAGE_READER_PROMPT_REQUIRED`、`IMAGE_READER_PROMPT_TOO_LONG` 和各配置输入错误建立唯一中文文案来源；
5. `src/image-reader/remote.ts` 与 `src/client/index.tsx`：注册保存当前配置和删除配置的 Remote 请求、结果与 Client face；
6. 上述直接相关测试文件与四份系统文档：同步新的当前配置保存合同。

### 步骤 3：同步语义内容

计划执行者必须按“同步系统合同和用户可见文案”表修改六个文件，并同步图片读取设置保存合同。独立语义 Reviewer 必须检查每条文本是否清楚区分视觉模型内容、Provider transport、Tool 输出和 CLI 输出；Reviewer 还必须检查 Tool 说明、`prompt.description`、两个项目 Skill 的本次观察要求分支、两份 CLI 参考、各配置输入错误文案和“保存当前配置”按钮是否具有明确主体、输入项与修正动作。

### 步骤 4：执行定向验证

独立 worktree 不得执行 `pnpm install`。计划执行者必须按 `docs/agents/worktree-development.md` 使用 `pnpm dev:start` 建立 worktree 链接并以前台方式启动开发 Desktop。

第二个终端必须执行：

```sh
pnpm dev:status
pnpm dev:logs
pnpm exec vitest run tests/unit/image-reader-tool.test.ts tests/unit/image-reader-service.test.ts tests/unit/cli-contract.test.ts tests/integration/cli-command.test.ts tests/integration/cli-route.test.ts tests/unit/catalog-remote.test.ts tests/unit/image-reader-model-catalog.test.ts tests/unit/image-reader-settings.test.ts tests/unit/client-plugin.test.ts
pnpm typecheck
```

计划执行者必须在真实 Desktop 的 `standard` Preset 中使用同一张任务专用测试图片完成两个 `inspect_image` 调用：

1. 只传 `file_path`，确认 Tool 返回四属性 JSON，`observation` 是视觉模型普通文本；
2. 传 `file_path` 与一个结果可判定的 `prompt`，确认覆盖提示词只影响本次观察，随后再次省略 `prompt` 时仍使用保存的默认提示词。

计划执行者还必须在图片读取设置页完成：

1. 打开已保存 OpenAI-compatible 配置，不保存地清空其非敏感字段，选择“放弃当前修改”并切换到另一已保存配置，再切回 OpenAI-compatible 配置；确认全部非敏感字段从持久化快照恢复，API Key 输入框为空但页面显示已保存凭据状态；
2. 修改当前配置并保存，确认其他配置未被提交或改写；
3. 修改当前配置后尝试切换，确认页面要求先保存或放弃；选择放弃并切换后，确认前一配置的未保存值没有进入请求；
4. 输入 API Key 后把当前配置切换为 runtime，补全 Provider 与模型并保存，确认旧 API Key 被清除；
5. 分别触发一个字段错误，确认页面只指出具体输入项与对应修正动作；
6. 新建、复制和删除配置，确认当前配置保存与独立删除行为符合合同。

计划执行者必须执行：

```sh
pnpm dev:stop
pnpm dev:status
```

最终 `dev:status` 必须返回 `stopped`。

### 步骤 5：执行最终门禁

独立语义 Reviewer 通过后，计划执行者必须执行：

```sh
pnpm quality
git diff --check
```

计划执行者必须把最终测试数量、覆盖率和依赖审计结果写入 `docs/releasenotes.md` 与 `docs/system/testing.md`。如果记录测试结果后候选树发生变化，计划执行者必须重新执行受影响的语义 Review、`pnpm quality` 和 `git diff --check`。最终门禁通过后不得再修改候选树。

## 验收清单

- [x] `inspect_image` 参数 schema 包含必填 `file_path` 和可选 `prompt`，并保持 `additionalProperties: false`。
- [x] `inspect_image` 顶层说明与 `prompt.description` 明确说明本次覆盖与省略时使用活动配置默认提示词。
- [x] `prompt` 省略时，两种 Provider 都收到活动配置的 `defaultPrompt`。
- [x] 合法 `prompt` 存在时，两种 Provider 都收到原始调用值，Settings 保存值没有改变。
- [x] 非字符串 `prompt` 由 Tool schema 拒绝；空字符串与纯空白字符串由 Service 以 `IMAGE_READER_PROMPT_REQUIRED` 拒绝；超过上限的字符串由 Service 以 `IMAGE_READER_PROMPT_TOO_LONG` 拒绝；两种 Provider 都没有被调用。
- [x] 长度等于 32768 个字符的合法 `prompt` 可以进入 Provider 调用。
- [x] runtime Provider 接受普通非 JSON 模型文本，不执行 JSON 解析。
- [x] OpenAI-compatible Provider 只解析 Chat Completions JSON transport envelope，不解析 `message.content`。
- [x] Tool 继续返回 `provider`、`model`、`file_path` 和 `observation` 四属性对象，并把普通字符串放入 `observation`。
- [x] `IMAGE_READER_EMPTY_RESPONSE`、Provider 错误、文件错误和取消分支继续通过。
- [x] `image inspect --stdin` 接受可选 `prompt`；省略时使用活动配置的 `defaultPrompt`，提供时只覆盖本次调用；CLI 四属性 JSON 输出保持不变。
- [x] `local-image-reader` 与 `comfyui-image-review` 在用户指定本次观察要求时传递完整 `prompt`，一般读图请求省略该属性；两份 CLI 参考与真实合同一致。
- [x] `scripts/cli/harness-comfyui.mjs` 的通用 stdin 传输和 stdout 包装逻辑保持不变。
- [x] “保存当前配置”请求只包含当前配置；只有 OpenAI-compatible 分支包含结构化 API Key 动作；保存成功后该配置 ID 成为 `activeProfileId`。
- [x] Host 替换现有配置时保持原索引，新配置追加至列表末尾；其他持久化配置保持不变，其他未保存表单值不能阻止当前配置保存。
- [x] 设置页分开维护持久化配置快照与一份当前可编辑表单；存在未保存修改时，切换操作要求先保存或放弃当前修改。
- [x] 首次打开、重新打开和切换回已保存 OpenAI-compatible 配置时，全部非敏感字段都从持久化快照恢复；清空本地表单后选择放弃、切换至另一配置并切回时，不得重用未保存空值；API Key 输入框为空且页面显示已保存凭据状态。
- [x] 保存、放弃未保存修改、删除未保存配置与删除已保存配置后，Client 按方案规定的唯一 ID 加载当前配置；复制配置不复制 API Key。
- [x] OpenAI-compatible 配置输入 API Key 后切换为 runtime 可以保存；请求不包含 API Key 动作，Host 从持久化凭据中清除该配置的 API Key。
- [x] Remote parser 只拒绝结构错误；Client 在 Remote 前拒绝 JSON 无法表示的非有限数；Client 与 Host 共享领域校验顺序；每个领域规则返回唯一错误码和具体修正动作。
- [x] 新建和复制配置通过保存当前配置完成；删除未保存配置不调用 Host；删除已保存配置使用独立操作。
- [x] 删除不存在配置与删除最后一份配置返回不同错误码；删除非活动配置保持活动 ID；删除活动配置按后一项优先、前一项补位；删除同时清除对应 API Key。
- [x] 系统文档、设置页文案、错误修正动作和未发布说明准确区分模型字符串与 Tool JSON 包装。
- [x] 独立语义 Reviewer 出具 PASS。
- [x] 定向测试、类型检查、真实 Desktop 三次调用、`pnpm quality` 和 `git diff --check` 全部通过。
- [x] worktree 开发 Desktop 在任务结束时处于 `stopped` 状态。
- [x] `package.json`、`pnpm-lock.yaml` 和依赖版本没有改变。

## 非本次目标

- 本次实施不修改 `inspect_image` 的成功输出对象。
- 本次实施不修改 `image inspect --stdin` 的命令行或输出协议。
- 本次实施不修改两个项目 Skill 的触发范围、结果结构或图片处理顺序。
- 本次实施不修改视觉模型默认提示词正文。
- 本次实施不改变 OpenAI-compatible Chat Completions 的 HTTP 响应解析，不把传输层“无效 JSON”错误归因于视觉模型回答正文，也不在缺少失败响应样本时增加 SSE、HTML 或非标准响应兼容逻辑。
- 本次实施不为设置页建立单独的未保存配置文件、未保存配置数据库或自动保存机制；设置页输入框在保存前只保存在当前 Client 内存中。
- 本次实施不允许保存当前配置时顺带保存其他配置的未保存表单值。
- 本次实施不增加 Provider、模型、凭据、`temperature` 或最大输出 Token 的调用时覆盖参数。
- 本次实施不让 Tool 一次处理多张图片。
- 本次实施不增加别名参数、兼容模式、配置开关、静默降级或第二套返回结构。
- 本次实施不安装或升级依赖，不修改 `package.json` 或 `pnpm-lock.yaml`。
- 本次计划不授权创建 commit、push、合并、发布版本或部署生产 checkout。

## 已获得的授权

- 用户已经授权计划编写者创建独立 worktree、读取本地源码与本地依赖、完成调研和设计本方案。
- 用户调用 `implement` 后，计划执行者获得修改本方案列出的源码、测试、系统文档和用户可见文案，并执行本方案列出的本地测试与真实 Desktop 验收的授权。
- 用户指出项目 Skill 需要得知提示词覆盖合同后，计划执行者获得修改 `image inspect --stdin` 输入合同、`local-image-reader`、`comfyui-image-review` 及其 CLI 参考文档的授权。
- 用户批准本方案不会自动授权计划执行者创建 commit、push、合并、发布版本或部署生产 checkout；这些外部状态变更需要用户另行明确授权。

## 依赖与安全审计意见

- 本方案不需要新增、安装或升级依赖。
- 本方案不执行从网络下载的脚本或项目，不修改 Skill 目录内的脚本，不创建后台任务或定时任务。
