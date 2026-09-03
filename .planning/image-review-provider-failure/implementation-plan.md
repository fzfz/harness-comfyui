# 图片读取 Provider 失败信息保留与配置选择修复方案

## 必须实现的目标

- 计划执行者必须让 runtime 图片读取失败保留 `finish.reason.failure` 中允许输出的 Provider 诊断字段白名单。
- 计划执行者必须让 `inspect_image` Tool 和 `image inspect --stdin` CLI 的失败结果说明本次调用实际使用的图片读取 profile、Provider、模型和采样参数。
- 计划执行者必须保持 `IMAGE_READER_PROVIDER_FAILED` 项目错误码不变，并保持调用者取消继续表现为 AbortError。
- 计划执行者必须执行字段白名单、固定字段字符上限和控制字符替换，并且必须保证 CLI 单行错误文案包含全部必需字段。
- 计划执行者必须让使用者选择已持久化配置 B 后立即把 B 持久化为 `activeProfileId`；配置 B 的模型、提示词、采样参数和凭据不得因激活动作被重写。
- 计划执行者必须把 Host 返回的实际生效配置、Client 当前编辑草稿和未保存状态分开建模；新建或复制但尚未保存的配置 C 不得参与 `Image Inspection`。
- 计划执行者必须完整实现打开、编辑、选择已保存配置、新建、复制、保存、放弃、删除、关闭、Escape、遮罩关闭、左侧设置栏目切换、失败和并发状态转换。
- 计划执行者必须让“保存 A 或 C 后切换 B”由 Host 使用一次 `settings.replace()` 原子提交，不能先把 A 或 C 激活再执行第二次切换。
- 计划执行者必须让保存、激活和删除的图片读取业务错误码通过 Typert Remote 失败结果完整到达 Client，不能被通用 Remote 异常码替换。
- 计划执行者必须把 Desktop 前台 Bash 默认超时从 `60000` 毫秒提高到 `180000` 毫秒；真实模型验收可以继续为单次调用显式使用 `60000` 毫秒判定边界。
- 计划执行者必须通过独立代码审查、独立语义审查、自动化测试和完整 Desktop 真实模型验收。
- 用户批准生产部署后，计划执行者必须从发布提交部署生产 checkout，不得直接编辑生产源码或生产配置。

## 根因与修复边界

### 已确认根因

`src/host/image-reader/image-reader-service.ts` 的 `observation()` 已经收到 `LlmFailure`，但 error finish 和非调用者 abort finish 分支没有保存 `failure.code`、`failure.message`、可选 `failure.status`、可选 `failure.providerRetryAfterMs` 或可选 `failure.requestId`。该函数改为抛出固定 `ImageReaderError` 后，CLI route 与 CLI executable 只能输出没有模型身份和 Provider 原因的固定文案。

生产 qwen3.8 专用配置读取无人物对照图成功、读取指定媒体失败，确认该模型的结果随输入变化，但现有 qwen3.8 实验没有唯一确认触发因素。qwen3.7 的重新编码图、缩小图和同尺寸噪声图实验另行支持该模型路径的可见内容相关推断。生产 GLM 专用配置读取指定媒体失败、读取无人物对照图超时，确认 GLM 路径还存在响应可用性问题。当前应用把这些不同结果折叠成相同固定文案。

`src/client/image-reader/image-reader-settings.tsx` 的 `selectProfile()` 只从 Client 持久化快照复制配置 B 到本地 `activeProfile`，没有调用 Host。`src/host/image-reader/image-reader-host.ts` 只有 `saveProfile()` 会把请求配置的 ID 写入 `activeProfileId`。因此使用者保存 A、选择已存在的 B、未保存并关闭设置后，界面选择过程被丢弃，`ImageReaderService.inspect()` 继续使用 A。当前 `activeProfile` 名称同时表示“页面正在编辑的配置”和“Host 实际生效配置”，是该交互缺陷的直接状态建模根因。

提交 `6cd6351` 引入多份图片读取配置时把切换定义为“选择后保存全部配置”；后续提交把 Client 改为单份配置草稿与单份配置保存，但仍保留“保存动作才激活”的合同。现有测试覆盖配置值恢复、未保存切换门禁和保存后激活，没有覆盖“选择已持久化 B 后 B 立即生效”。该历史设计遗漏不是 Settings 镜像、CLI 或 Provider 导致的运行时故障。

### 本方案能够修复的行为

- Harness 必须在失败发生时保留并显示 Provider 已经返回的字段白名单：`code`、可选 `status`、可选 `providerRetryAfterMs` 和可选 `requestId`。
- Harness 必须在失败发生时显示本次调用实际使用的 profile 和模型配置，后续调查不再依赖当前活动 profile 倒推历史调用。
- Harness 必须让直接 Tool 与 managed CLI 使用同一条具体错误文案。
- Harness 必须为“激活已持久化配置”提供独立 Remote；该 Remote 只持久化 `activeProfileId` 并返回 Host 提交后的完整 `ImageReaderConfiguration`。
- Harness 必须让保存 Remote 接收明确的最终 `activateProfileId`，使保存当前草稿并切换另一份已保存配置成为一次 Host Settings 提交。
- Client 必须在激活成功前继续显示当前实际生效配置，并显示目标配置的切换进行状态；激活失败时 Client 必须保持 Host 返回或 Settings 快照中的实际生效配置。

### 本方案不能替代的外部行为

- Harness 不能强制 Qwen 或 GLM Provider 完成上游没有完成的图片请求。
- Harness 不会根据图片内容自动选择模型，也不会自动切换到 DeepSeek 或内网 OpenAI 兼容配置。
- Harness 不会在使用者没有选择目标配置时自动切换 profile，也不会在激活失败时选择替代 profile。

## 实施步骤

用户已通过 `implement` Skill 批准计划执行者执行配置选择步骤 A 至 D 和 Provider 诊断步骤 1 至 6。该批准授权修改独立 worktree 中的代码、测试和项目文档、完成隔离验证并提交当前分支；推送、发布和生产部署仍需要用户另行批准。

### A. 先添加配置选择失败测试

计划执行者必须先修改 `tests/unit/image-reader-settings.test.ts`，用两份已持久化配置建立稳定失败测试：初始 `activeProfileId` 为 A，使用者选择 B，不点击“保存当前配置”，随后卸载并重新挂载图片读取设置页。当前代码必须显示测试失败，实际 `activeProfileId` 为 A，期望值为 B。

计划执行者必须同时添加一项成功基线：初始实际生效配置为 A，使用者新建或复制草稿 C，不保存并卸载设置页；Host 不得收到写请求，重新挂载后设置页必须显示实际生效配置 A。该基线用于证明“选择已存在配置 B”和“编辑未保存草稿 C”是两种不同状态转换。

### B. 新增已保存配置激活合同

计划执行者必须修改 `src/image-reader/contract.ts`，增加以下共享合同和严格解析器：

```ts
interface ActivateImageReaderProfileRequest {
  readonly profileId: string
}

interface ActivateImageReaderProfileResult {
  readonly configuration: ImageReaderConfiguration
}
```

计划执行者必须为 `SaveImageReaderProfileRequest` 的两个连接类型分支增加必填 `operation: 'create' | 'update'` 和 `activateProfileId: string`。普通保存已保存配置 A 时，Client 提交 `operation: 'update'` 与 `activateProfileId: A`；保存新建或复制草稿 C 时，Client 提交 `operation: 'create'` 与 `activateProfileId: C`；使用者编辑 A 或 C 后选择 B并决定保存时，Client 按草稿来源提交对应 `operation` 与 `activateProfileId: B`。

计划执行者必须修改 `src/host/image-reader/image-reader-host.ts`：

1. `activateProfile()` 必须与 `saveProfile()` 和 `deleteProfile()` 共用现有 `settingsMutationTail`。
2. `activateProfile()` 必须在进入队首后读取最新 Settings，校验目标 ID 格式并确认目标配置仍然存在。
3. 目标 ID 与当前 `activeProfileId` 不同时，Host 必须执行一次 `settings.replace()`；下一设置段只能修改 `configuration.activeProfileId`，全部 profile 值、profile 顺序和全部 credentials 必须保持原值。
4. 目标 ID 已经生效时，Host 必须幂等返回当前完整 `ImageReaderConfiguration`，不得执行不必要的 Settings 写入。
5. 激活目标不存在时，Host 必须返回新增 `IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND`；持久化失败时，Host 必须返回新增 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`。任一失败不得切换到其他配置。
6. `saveProfile()` 必须分别校验草稿 ID 与 `activateProfileId` 的格式；任一 ID 格式无效时返回 `IMAGE_READER_PROFILE_ID_FORMAT_INVALID` 并且不得调用 `settings.replace()`。
7. `operation: 'update'` 要求进入队首时最新 Settings 中仍存在草稿 ID；正在更新的配置已经被并发删除时返回新增 `IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND`，不得把已删除配置重新追加到列表。
8. `operation: 'create'` 要求进入队首时最新 Settings 中不存在草稿 ID；目标已经存在时返回新增 `IMAGE_READER_PROFILE_ALREADY_EXISTS`，不得覆盖已持久化配置。
9. `saveProfile()` 必须在合并当前草稿后确认 `activateProfileId` 存在于候选 profile 列表；待激活配置不存在时返回 `IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND`。Host 必须先检查 `operation` 对应的草稿 ID，再检查 `activateProfileId`，使两个 ID 同时不存在时稳定返回 `IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND`。上述失败都不得调用 `settings.replace()`，不得保存草稿、修改凭据或改变实际活动配置。
10. 全部校验通过后，`saveProfile()` 必须在同一次 `settings.replace()` 中同时保存草稿、凭据动作和最终活动 ID。
11. 保存、激活和删除都必须在提交前响应 AbortSignal；`settings.replace()` 已经完成后必须返回已提交配置，不能把已经提交的结果报告为取消。

计划执行者必须修改 `src/client/index.tsx` 和 Remote 注册，把 `activateProfile()` 接入现有 Typert Remote seam。该 Interface 不得使用 `saveProfile()` 重新提交配置 B，也不得新增 revision、hash、自动重试、自动合并或替代 profile 选择。

计划执行者必须在 Host Typert Remote 边界使用 `TypertRemoteFailure` 发送保存、激活和删除产生的已知 `ImageReaderError`。失败结果必须保留 `code` 与 `message`，`details` 必须是空对象；Client 必须继续按该业务错误码选择唯一错误文案。

写操作 Remote Adapter 必须在发出 save、activate 或 delete 请求前检查 Client AbortSignal。请求已经发出后，Adapter 必须等待 Host 的权威结果；Host 返回成功配置时，Adapter 必须直接返回该配置，不能再调用 `ensureActive(signal)` 把已提交成功结果改写成 AbortError。Host 返回失败且 Client AbortSignal 已取消时，Adapter 可以返回 AbortError；Host 返回业务失败且 Client AbortSignal 未取消时，Adapter 必须保留 Host 错误码。模型目录读取没有 Settings 提交，可以保留请求前后的取消检查。

### C. 重建 Client 配置编辑状态机

计划执行者必须修改 `src/client/image-reader/image-reader-settings.tsx`，分开维护以下状态：

- `persistedConfiguration`：Host 或 Settings scope 返回的完整权威配置；其中的 `activeProfileId` 是实际生效配置。
- `editorDraft`：页面当前显示和编辑的一份配置；该变量不得命名为 `activeProfile`。
- `draftOrigin`：`persisted`、`new` 或 `duplicate`。
- `dirty`：`editorDraft` 是否包含尚未持久化的修改。
- `pendingIntent`：待完成的 `switch` 或 `delete` 用户动作。
- `pendingOperation`：当前 `activate`、`save` 或 `delete` Host 操作。

Client 必须实现下表中的唯一状态转换：

| 当前状态 | 使用者动作 | Host 调用 | 成功结果 | 失败结果 |
|---|---|---|---|---|
| 页面打开 | Settings ready | 无 | 加载 `persistedConfiguration.activeProfileId` 对应配置 | 显示明确设置读取错误 |
| 已保存 A，表单干净 | 选择已保存 B | `activateProfile(B)` | 采用 Host 返回配置并加载 B；B 立即生效 | 保持实际 A并显示激活错误 |
| 已保存 A，表单干净 | 编辑字段 | 无 | 建立 A 草稿；`Image Inspection` 继续使用 A 上次保存值 | 不改变 Host |
| A 草稿，没有待切换目标 | 保存配置 A | `saveProfile(operation: update, A, activateProfileId: A)` | 一次提交保存 A并保持 A生效；加载已保存 A | 保留 A草稿；实际配置与 `Image Inspection` 保持提交前值 |
| A 草稿存在时外部 Settings 写操作已经激活 B | 普通保存配置 A | `saveProfile(operation: update, A, activateProfileId: B)` | 一次提交保存 A并保持 B生效；加载已保存 B | 保留 A草稿；实际配置与 `Image Inspection` 保持提交前值 |
| A 草稿，没有待切换目标 | 放弃配置 A的修改 | 无 | 丢弃 A草稿并从最新实际活动配置重新建立表单 | — |
| A 草稿 | 选择已保存 B | 无 | 显示“保存并切换 / 放弃并切换 / 继续编辑”门禁 | 不改变 Host |
| A 草稿，待切换 B | 保存配置 A并切换到配置 B | `saveProfile(operation: update, A, activateProfileId: B)` | 一次提交保存 A并激活 B；加载 B | 保留 A草稿、实际配置和待切换 B |
| A 草稿，待切换 B | 放弃配置 A的修改并切换到配置 B | Client 先丢弃 A草稿，再调用 `activateProfile(B)` | 加载 B | A草稿保持已丢弃；加载最新实际活动配置并显示激活错误 |
| A 草稿，待切换 B | 继续编辑 | 无 | 取消待切换 B并保留 A 草稿 | — |
| 实际 A | 新建或复制 C | 无 | C 只存在于 Client；页面明确显示“C 未保存，读图仍使用 A” | 不改变 Host |
| C 草稿，没有待切换目标 | 保存配置 C | `saveProfile(operation: create, C, activateProfileId: C)` | C 被持久化并生效 | 保留 C草稿；实际配置与 `Image Inspection` 保持提交前值 |
| C 草稿，待切换 B | 保存配置 C并切换到配置 B | `saveProfile(operation: create, C, activateProfileId: B)` | 一次提交保存 C并激活 B；C 从未成为活动配置 | 保留 C草稿、实际配置和待切换 B |
| C 草稿 | 放弃或本地删除 | 无 | 丢弃 C并加载实际生效配置 | — |
| 任意未保存草稿 | 关闭、Escape、遮罩关闭或切换设置栏目 | 无 | 页面卸载时丢弃草稿；重新进入时加载最新实际生效配置 | — |
| 实际 B，表单干净 | 删除 B | `deleteProfile(B)` | 加载 Host 返回的后继活动配置 | 保持 B并显示删除错误 |
| 已保存 B的草稿 | 删除配置 B | 无 | 显示“放弃配置 B的修改并删除配置 B / 继续编辑配置 B”门禁 | 不改变 Host |
| 已保存 B的草稿，待删除 B | 放弃修改并删除配置 B | Client 先丢弃 B草稿，再调用 `deleteProfile(B)` | 加载 Host 返回的后继活动配置 | B草稿保持已丢弃；加载最新实际活动配置并显示删除错误 |
| 已保存 B的草稿，待删除 B | 继续编辑配置 B | 无 | 取消删除意图并保留 B草稿 | — |
| 任意 Host 操作进行中 | 再次保存、激活、删除或切换 | 无 | 相关控件保持禁用直至当前操作结束 | 当前错误结束后允许明确重试 |
| 只读 Settings | 编辑、激活、保存或删除 | 无 | 全部修改控件禁用 | 不允许 Client 假切换 |
| 已持久化 B在 Host 操作进入队首前被删除 | 激活 B或保存草稿后激活 B | Host 重新读取 Settings | 不执行写入 | 返回 `IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND`；保存路径保留草稿，放弃路径保持草稿已丢弃；下一次 `Image Inspection` 使用实际活动配置 |
| `operation: update` 的 A在 Host 操作进入队首前被删除 | 保存 A | Host 重新读取 Settings | 不执行写入 | 返回 `IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND`；不得重新创建 A；Client 保留草稿并标记来源配置已删除 |
| `operation: create` 的 C在 Host 操作进入队首前已经存在 | 保存 C | Host 重新读取 Settings | 不执行写入 | 返回 `IMAGE_READER_PROFILE_ALREADY_EXISTS`；不得覆盖已存在 C；Client 保留草稿 |
| 普通保存或保存并切换在 Host 提交前被取消 | Host 返回 AbortError | 无提交 | — | Client 清除 `pendingOperation`，保留草稿和待切换目标；实际配置不变并允许重试 |
| 表单干净时直接激活 B在 Host 提交前被取消 | Host 返回 AbortError | 无提交 | — | Client 清除 `pendingOperation` 和待切换目标，保持实际配置 A并显示激活取消状态；使用者可以重新选择 B |
| 表单干净时直接删除 B在 Host 提交前被取消 | Host 返回 AbortError | 无提交 | — | Client 清除 `pendingOperation`，保持实际配置 B并显示删除取消状态；使用者可以重新删除 B |
| 使用者放弃草稿后发起的激活或删除操作在 Host 提交前被取消 | Host 返回 AbortError | 无提交 | — | Client 清除 `pendingOperation` 和 `pendingIntent`，草稿保持已丢弃，加载最新实际活动配置并显示取消状态 |
| Client 在写请求发出后取消，但 Host 返回成功配置 | Remote Adapter 返回成功 | Host 已提交 | Client 采用 Host 返回的完整配置 | Adapter 不得把成功结果改写成 AbortError |

页面必须把“当前生效配置”和“正在编辑配置”显示为两个独立对象。已保存配置选择器的标签必须是“当前生效配置”，且只列出 `persistedConfiguration.profiles`；新建或复制的 C不得加入该选择器。使用者选择已保存 B 时，选择器不得在 Host 成功前把 B 标记为实际生效；页面必须显示目标 B的进行状态。Host 成功后，Client 必须使用返回的完整配置替换 `persistedConfiguration` 并从该配置加载 B，不得从请求前的旧快照推断结果。

计划执行者必须把以下中文文案保存在图片读取 Client 文案的唯一结构化常量中；动态配置名使用该结构中的模板函数生成，不能在 JSX 分支重复拼接：

- 已保存配置选择器：`当前生效配置`；帮助文本：`选择已保存配置后，该配置立即用于下一次图片读取。`
- 已保存配置的干净编辑状态：`正在编辑配置“<A>”。该配置是当前生效配置。`
- 已保存配置的未保存编辑：`配置“<A>”有未保存修改。图片读取继续使用该配置上一次保存的内容。`
- 新建或复制草稿：`配置“<C>”尚未保存。图片读取继续使用配置“<A>”。`
- 普通保存按钮：已保存配置与实际生效配置相同时使用 `保存配置“<A>”`；草稿 A 存在时外部 Settings 写操作已经激活 B，使用 `保存配置“<A>”并继续使用当前生效配置“<B>”`；新建或复制草稿使用 `保存配置“<C>”并使该配置生效`。
- 新建或复制草稿的本地放弃按钮：`放弃未保存配置“<C>”`；该动作不得调用删除 Remote。
- 激活进行状态：`正在切换到配置“<B>”。切换完成前，图片读取继续使用配置“<A>”。`
- 激活成功状态：`配置“<B>”已生效。下一次图片读取将使用该配置。`
- 保存并切换成功状态：`配置“<A>”已保存，配置“<B>”已生效。下一次图片读取将使用配置“<B>”。`
- 保存草稿并保持另一份配置生效的成功状态：`配置“<A>”已保存。图片读取继续使用当前生效配置“<B>”。`
- 删除当前活动配置的成功状态：`配置“<A>”已删除，配置“<B>”现在生效。下一次图片读取将使用配置“<B>”。`
- 删除非活动配置的成功状态：`配置“<A>”已删除。图片读取继续使用当前生效配置“<B>”。`
- 配置切换门禁按钮：`保存配置“<A>”并切换到配置“<B>”`、`放弃配置“<A>”的未保存修改并切换到配置“<B>”`、`继续编辑配置“<A>”`。
- 配置删除门禁按钮：`放弃配置“<A>”的未保存修改并删除配置“<A>”`、`继续编辑配置“<A>”`。
- 激活取消状态：`配置“<B>”的切换请求已取消。配置“<A>”的未保存修改已按使用者选择放弃，图片读取继续使用当前生效配置“<C>”。请重新选择配置“<B>”。`；没有草稿的直接激活取消时省略第二句。
- 保存取消状态：`配置“<A>”的保存请求已取消。未保存修改仍然保留，图片读取继续使用提交前的配置。请重新保存配置“<A>”。`
- 删除取消状态：`配置“<A>”的删除请求已取消。配置“<A>”的未保存修改已按使用者选择放弃，该配置没有被删除。请重新删除配置“<A>”或继续使用。`；没有草稿的直接删除取消时省略第二句。
- 草稿来源被删除：`配置“<A>”已被其他设置操作删除。当前草稿不能保存；请放弃该草稿以加载当前生效配置“<B>”。`
- 待切换目标被删除：`目标配置“<B>”已被其他设置操作删除，无法完成切换。配置“<A>”的未保存修改仍然保留。`

配置名进入上述文案时必须按普通 React 文本值渲染，不能进入 `dangerouslySetInnerHTML`。语义 Reviewer 必须逐句确认每条文案包含明确的配置对象、动作、实际生效结果和下一步。

Settings scope 在表单干净时发生更新，Client 必须加载最新实际生效配置。Settings scope 在 A 或 C草稿存在时发生更新，Client 必须更新权威 `persistedConfiguration` 和实际生效提示，但不得把外部快照静默覆盖到 `editorDraft`。如果最新配置已经删除待切换 B，Client 必须清除该无效切换意图、保留当前草稿并显示“待切换目标被删除”文案。如果最新配置已经删除 `operation: update` 草稿的来源 A，Client 必须保留草稿、禁止保存和删除操作，并只允许使用者放弃草稿后加载最新实际生效配置。新建或复制 C的 `operation: create` 草稿不依赖来源配置继续存在。使用者放弃任一草稿后必须加载最新实际生效配置。

当前 Settings Shell 只向页面提供 `close()`，没有所有关闭入口共用的离开拦截 Interface。用户已经允许“提示未保存”或“回退到上一次生效配置”两种结果，本方案选择回退：关闭按钮、Escape、遮罩和左侧栏目切换会卸载页面并丢弃未保存草稿；重新进入时页面必须加载最新持久化 `activeProfileId`。本方案不得修改外部 Settings Shell 依赖来增加离开门禁。

### D. 完成配置选择测试、文档与真实界面验收

计划执行者必须修改：

- `tests/unit/image-reader-settings.test.ts`：覆盖状态转换表中的每个 Client 分支，特别是已有 B 立即激活、新建 C 不生效、保存并切换的 `activateProfileId`、激活失败、保存失败、删除门禁、只读状态和 scope 更新。
- `tests/unit/image-reader-model-catalog.test.ts`：覆盖 Host 激活幂等、目标不存在、只改活动 ID、凭据保持、持久化失败、提交前后取消、保存并激活另一配置的一次提交、create/update 来源存在性、目标 ID 格式、待激活目标存在性，以及 save/activate/delete 共用队列。
- `tests/unit/client-plugin.test.ts`：分别覆盖 `saveProfile`、`activateProfile` 和 `deleteProfile` 三个写操作 Remote Adapter 的成功、失败和请求发出前取消；每个入口都必须模拟请求发出后本地 signal 取消、Host 随后返回成功配置，并断言 Adapter 返回成功配置、Client 采用该配置且不显示取消文案。测试还必须覆盖 Host 返回失败后本地 signal 已取消时 Adapter 返回 AbortError。`models` Adapter 必须继续覆盖请求后的取消检查。
- `tests/desktop/desktop-live.test.mjs`：覆盖保存 A、选择已保存 B、不点击保存、关闭并重新打开后 B 仍生效；覆盖新建 C、不保存、关闭并重新打开后回到 B；覆盖编辑 B 后选择 A 的三项门禁。
- `config/error-catalog.json`：新增 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`、`IMAGE_READER_PROFILE_ALREADY_EXISTS`、`IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND` 和 `IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND`，并保留 `IMAGE_READER_PROFILE_NOT_FOUND` 专门表示删除目标不存在。错误目录必须使用以下唯一文案：
  - `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`：标题 `图片读取配置切换失败`；原因 `Harness Settings 服务未能把激活请求指定的已保存图片读取配置持久化为当前生效配置。`；下一步 `当前图片读取继续使用切换前的生效配置。请检查 Harness Settings 存储状态、文件权限和可用磁盘空间后重新选择目标配置。`
  - `IMAGE_READER_PROFILE_ALREADY_EXISTS`：标题 `图片读取配置 ID 已存在`；原因 `Harness Settings 已经包含新建或复制请求指定的配置 ID，不能把该请求作为新配置保存。`；下一步 `放弃当前新建或复制草稿，然后重新创建配置。`
  - `IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND`：标题 `待切换的图片读取配置不存在`；原因 `Harness Settings 中找不到激活请求指定的已保存图片读取配置 ID。`；下一步 `当前图片读取继续使用已提交的生效配置。请从当前已保存配置列表重新选择切换目标。`
  - `IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND`：标题 `待保存的图片读取配置已被删除`；原因 `Harness Settings 中找不到更新请求指定的已保存图片读取配置 ID，当前草稿不能作为更新保存。`；下一步 `放弃当前草稿，然后从当前已保存配置列表重新选择需要编辑的配置。`
  - `IMAGE_READER_PROFILE_NOT_FOUND`：标题 `待删除的图片读取配置不存在`；原因 `Harness Settings 中找不到删除请求指定的已保存图片读取配置 ID。`；下一步 `重新打开图片读取设置，然后从当前已保存配置列表重新选择删除目标。`
  - `IMAGE_READER_SETTINGS_REQUEST_FAILED` 的原因必须增加“已保存配置激活请求”，下一步必须继续要求使用者检查 Harness Host 连接和 Settings 服务状态后重新提交当前请求。
- `docs/system/architecture.md`、`docs/system/testing.md` 和 `docs/releasenotes.md`：记录实际生效配置、Client 草稿、激活 Remote、原子保存并切换和离开回退语义。

完整 Desktop 界面验收必须逐项执行以下序列：

1. 保存 A，选择已存在 B，不点击保存，关闭并重新打开设置，确认 B 仍被选中；随后执行一次 `image inspect --stdin`，确认返回的 Provider 与模型属于 B。
2. 在 B 生效时新建 C，不保存，关闭并重新打开设置，确认页面回到 B；随后执行一次图片读取，确认仍使用 B。
3. 编辑 B 的任一非凭据字段后选择 A，分别验证“继续编辑”“放弃并切换”和“保存并切换”；保存并切换必须确认 B 的修改已经保存且 A 是最终生效配置。
4. 模拟 B 激活持久化失败，确认页面和下一次图片读取仍使用 A，并显示唯一激活失败文案。
5. 删除当前活动配置，确认 Host 选择的后继配置同时成为界面配置和下一次图片读取配置。

### 1. 先添加失败测试

计划执行者必须修改 `tests/unit/image-reader-service.test.ts`，并先运行新增测试确认当前代码失败。新增测试必须覆盖：

1. runtime stream 返回 `finish.reason.kind === 'error'` 和完整 `LlmFailure` 时，`ImageReaderError` 只保留 Provider failure 字段白名单与图片读取 profile 快照。
2. runtime stream 返回非调用者 `finish.reason.kind === 'aborted'` 时，`ImageReaderError` 保留相同白名单结构，并明确记录 finish kind 为 `aborted`。
3. 调用者 AbortSignal 已取消时，服务继续抛出 AbortError，不生成 `IMAGE_READER_PROVIDER_FAILED`。
4. Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 与 `LlmFailure.message` 分别包含唯一测试 sentinel 时，异常 context、Tool error、CLI stderr 与 Host 日志均不包含来自这些禁止来源字段的 sentinel。
5. profile name、profile ID、Provider ID、模型 ID、failure code 或 request ID 含 C0/C1 控制字符、`U+2028` 或 `U+2029` 时，最终错误文案仍为一行。
6. 每个允许字符串字段分别包含 95、96 和 97 个 UTF-16 code unit 时，最终 context 和错误文案符合第 2 步定义的字段边界与截断标记；所有允许字符串字段同时达到上限时，完整文案仍包含全部必需字段并且 `.length <= 2048`。
7. 正常 stop finish 继续返回现有四属性 `ImageInspection`，不得改变成功结果结构。

### 2. 保留 runtime Provider failure 与调用配置

计划执行者必须修改 `src/host/image-reader/errors.ts`，在该文件中定义唯一常量 `IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS`，其值必须是 `{ fieldChars: 96, totalChars: 2048 }`。所有字符上限必须按 JavaScript UTF-16 code unit 计数。

计划执行者必须按以下固定顺序处理 `profileName`、`profileId`、`provider`、`model`、`failureCode` 和可选 `requestId`：

1. 把每个没有组成合法 UTF-16 代理项对的高代理项或低代理项替换为一个 `U+FFFD`。
2. 把 `U+0000–U+001F`、`U+007F–U+009F`、`U+2028` 和 `U+2029` 的每个连续字符序列替换为一个 ASCII 空格。
3. 删除字符串两端的空白。
4. 字符串长度小于或等于 96 个 code unit 时保持结果；长度大于 96 时保留前 95 个 code unit 并追加一个 `…`。第 95 个 code unit 如果是合法代理项对的高代理项，必须再删除该高代理项后追加 `…`。
5. 使用 `JSON.stringify()` 把处理后的字符串转换为带双引号的 JSON 字符串字面量。

计划执行者必须使用以下固定模板拼装错误文案；尖括号占位符不是输出字符：

```text
The runtime visual model did not complete the image inspection. profile_name=<JSON string>; profile_id=<JSON string>; connection_type="runtime"; provider=<JSON string>; model=<JSON string>; temperature=<number>; max_tokens=<number>; finish_kind=<"error" or "aborted">; failure_code=<JSON string>[; failure_status=<integer>][; provider_retry_after_ms=<number>][; request_id=<JSON string>].
```

可选字段必须按模板中的顺序追加；数值必须使用 JavaScript `String(number)` 结果。实现不得对拼装后的文案执行尾部截断；全部允许字符串字段达到 96 个 code unit 时，测试必须使用引号、反斜杠、合法代理项对和未配对代理项的最坏组合，证明完整文案仍是合法单行文本、包含全部必需字段并且总长度不超过 2048 个 code unit。

计划执行者必须在同一文件中为 `ImageReaderError` 增加只读、可选、结构化的 runtime failure context。该 context 必须包含：

- `finishKind`：`error` 或 `aborted`；
- `profileId`；
- `profileName`；
- `connectionType`；
- `provider`；
- `model`；
- `temperature`；
- `maxTokens`；
- `failureCode`：经过单行转换与字段长度处理的 `LlmFailure.code`；
- `failureStatus`：合法整数 HTTP status 存在时保留；
- `providerRetryAfterMs`：合法正数存在时保留；
- `requestId`：存在时执行单行转换与字段长度处理。

该 context 不得读取或复制 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 或 `LlmFailure.message`。允许输出字段的值只按上述确定性字符串合同处理；本方案不对允许字段的文本内容作语义分类。

计划执行者必须修改 `src/host/image-reader/image-reader-service.ts`：

1. `inspect()` 在读取 Settings 后把活动 `ImageReaderProfile` 传入 runtime observation 边界。
2. `observation()` 在 error finish 与非调用者 abort finish 分支中从 `LlmFailure` 复制字段白名单并构造 runtime failure context。
3. `observation()` 使用 context 和固定模板生成有界单行文案。文案必须依次指出 profile 名称、profile ID、连接类型、Provider、模型、温度、最大输出 Token 数、finish kind、Provider failure code、可选 HTTP status、可选 retry-after 和可选 request ID。文案不得读取 Provider failure message。
4. `observation()` 必须使用 `IMAGE_READER_FAILURE_DIAGNOSTIC_LIMITS` 和前述固定处理顺序；文案处理不得执行语义分类或错误码猜测。
5. `ImageReaderError.code` 继续使用 `IMAGE_READER_PROVIDER_FAILED`。
6. 文案和 context 不得读取或复制 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 或 `LlmFailure.message`。

### 3. 验证 Tool 与 CLI 错误传播

计划执行者必须修改 `tests/integration/cli-route.test.ts`，验证 CLI route 返回稳定错误码和包含 profile/Provider failure 的具体文案。

计划执行者必须修改 `tests/integration/cli-command.test.ts`，验证构建后的 managed CLI executable 在 stderr 输出同一条单行文案并返回退出码 `1`。

计划执行者必须修改 `tests/unit/image-reader-tool.test.ts`，验证 `inspect_image` Tool 不替换 `ImageReaderError` 的具体文案。

本方案不新增 CLI 请求字段，不修改成功 stdout 的四属性 JSON，不要求 Skill 解析新的 JSON 错误结构。

### 4. 更新项目文档和用户错误说明

计划执行者必须修改：

- `config/error-catalog.json`：`IMAGE_READER_PROVIDER_FAILED` 的原因必须说明调用结果会包含实际 profile 与 Provider failure 字段白名单；下一步必须要求使用者根据具体 failure code、status、request ID 和模型身份检查对应 Provider。
- `docs/system/architecture.md`：图片读取章节必须说明 runtime finish failure 的允许输出字段白名单、禁止读取或复制的来源字段和调用者取消分支。
- `docs/system/testing.md`：图片读取章节必须列出新增自动化分支和真实模型验收矩阵。
- `docs/releasenotes.md`：发布说明必须说明旧固定文案丢失 Provider 原因的问题和新错误输出字段。

语义 Reviewer 必须逐句检查上述中文文案是否包含明确主体、动作和对象，并确认文案没有把 Qwen 与 GLM 的不同失败错误归类为同一种外部故障。

### 5. 自动化验证

计划执行者必须修改根 `cordis.patch.yml`，为 `bash-sandbox.config.timeoutMs` 写入唯一默认值 `180000`。`scripts/security/check-harness-boundary.mjs`、`tests/security/check-harness-boundary.test.ts` 和 `tests/contract/profile-skill-ownership.test.ts` 必须固定该产品配置。Skill 文档不得重复声明默认超时；单次 Tool Call 的显式 `timeoutMs` 继续覆盖产品默认值。

计划执行者必须先运行以下目标测试：

```bash
pnpm exec vitest run tests/unit/image-reader-settings.test.ts tests/unit/image-reader-model-catalog.test.ts tests/unit/client-plugin.test.ts tests/unit/image-reader-service.test.ts tests/unit/image-reader-tool.test.ts tests/integration/cli-route.test.ts tests/integration/cli-command.test.ts
```

计划执行者处理独立审查意见并完成最终候选后，必须运行：

```bash
pnpm quality
git diff --check
```

`pnpm quality` 与 `git diff --check` 通过后，计划执行者不得继续修改候选文件；任何修改都必须重新执行两个门禁。

### 6. 完整 Desktop 真实模型验收

计划执行者必须按照 `docs/agents/worktree-development.md` 从独立 worktree 执行完整 Desktop 验收：

1. 以前台 `pnpm dev:start` 启动隔离 Desktop。
2. 从第二终端运行 `pnpm dev:status`，确认隔离 Desktop 使用当前 worktree generation。
3. 使用生产 Qwen 专用 profile 读取指定媒体，并按照下方判定表记录唯一结果。
4. 使用同一 Qwen profile 读取纯红对照图，确认成功结果结构没有改变。
5. 使用生产 GLM 专用 profile 读取指定媒体，并按照下方判定表记录唯一结果。
6. 使用生产 DeepSeek 专用 profile 读取指定媒体，确认成功返回观察结果。
7. 执行配置选择步骤 D 的五项完整 Desktop 界面验收。
8. 运行 `pnpm dev:logs` 检查 Host 没有从 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 或 `LlmFailure.message` 复制诊断内容。
9. 运行 `pnpm dev:stop`，再运行 `pnpm dev:status` 确认隔离 Desktop 已停止。

真实模型调用必须使用以下唯一判定表：

| 实际结果 | 判定 | 必须满足的断言 |
|---|---|---|
| stop success | 通过成功路径 | CLI 退出码为 0，stderr 为空，stdout 是现有四属性 JSON。 |
| Provider error finish | 通过失败路径 | CLI 退出码为 1；文案包含实际 profile、Provider、模型、`finish_kind="error"` 和 failure code；可选字段按 Provider 返回值出现。 |
| Provider non-caller aborted finish | 通过失败路径 | CLI 退出码为 1；文案包含实际 profile、Provider、模型、`finish_kind="aborted"` 和 failure code；可选字段按 Provider 返回值出现。 |
| 调用者取消 | 通过取消路径 | 服务抛出 AbortError；文案不包含 `IMAGE_READER_PROVIDER_FAILED`。 |
| 调用在 60 秒内未完成 | 不通过，外部可用性阻断 | 无论调用是否已经产生部分 stdout 或 stderr，本次真实模型验收都不得标记通过；计划执行者终止调用、停止发布步骤并向用户报告阻断。 |
| 其他错误码或无效输出 | 不通过，代码或合同错误 | 本次真实模型验收不得标记通过；计划执行者定位并修复后重新执行全部相关门禁。 |

完成结果只有在调用进程于 60 秒期限内结束后才能进入 stop success、Provider error finish、Provider non-caller aborted finish、调用者取消或其他错误分支。Qwen 或 GLM 从历史失败变为 stop success 时，计划执行者必须按 stop success 判定为成功路径通过，不得把模型状态变化判为代码失败。

自动化验收 fixture 必须分别生成 stop success、Provider error finish、Provider non-caller aborted finish、调用者取消、没有输出后挂起至 60 秒、产生部分输出后挂起至 60 秒、其他错误码和无效输出，并断言每种结果只匹配判定表中的一个分支。超时 fixture 可以使用虚拟计时器，不得让自动化测试实际等待 60 秒。

### 7. 审查、提交、发布与生产部署

计划执行者必须在最终质量门禁前取得一名独立代码 Reviewer 和一名独立语义 Reviewer 的验收结果，并处理所有阻断项。

用户已批准提交当前分支。用户另行批准发布和生产部署后，计划执行者必须：

1. 把项目版本更新为 `0.39.1`，并完成仓库发布文档要求的版本元数据。
2. 提交最终候选，推送提交，并确认 `origin/main` 的完整 SHA 与发布提交一致。
3. 从该提交发布 `0.39.1`。
4. 使用发布提交更新 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`，保留 Git 不管理的生产 Settings、凭据、Session、Run 与 saved-media。
5. 在生产 checkout 中确认部署版本为 `0.39.1`。
6. 使用用户批准的活动图片读取 profile 执行一次生产验证，并使用完整 Desktop 真实模型验收的同一判定表决定通过、不通过或外部可用性阻断。生产验证不得自动切换 profile。

## 验收清单

- [ ] 已持久化配置 A 的表单干净时，使用者选择已持久化配置 B 会调用专用激活 Remote；Host 成功后 B 立即成为 `activeProfileId`，不需要点击保存。
- [ ] 激活 B 的 Host 提交只修改 `activeProfileId`，不会修改任何 profile 值、profile 顺序或 credentials。
- [ ] 新建或复制草稿 C 未保存时，`Image Inspection` 继续使用实际生效配置；关闭、Escape、遮罩关闭或切换设置栏目后，重新进入页面会加载实际生效配置。
- [ ] 已保存配置的字段修改未保存时，`Image Inspection` 继续使用该配置上次持久化的值。
- [ ] A 或 C 草稿选择 B 时，页面提供“保存并切换 / 放弃并切换 / 继续编辑”；保存并切换由一次 Host Settings 提交同时保存草稿和激活 B。
- [ ] 已保存配置草稿的普通保存与普通放弃、新建配置草稿的普通保存与普通放弃、已保存配置草稿的删除门禁都具有唯一状态转换和明确对象文案。
- [ ] 激活失败、保存失败或删除失败时，页面、Host Settings 与下一次图片读取使用相同的实际生效配置；系统不选择替代配置。
- [ ] `operation: update` 不得重新创建并发删除的配置；`operation: create` 不得覆盖同 ID 已保存配置；无效 `activateProfileId` 或不存在的待激活配置不得产生 Settings 写入。
- [ ] Host 使用不同错误码区分待更新配置不存在、待激活配置不存在和待删除配置不存在；Client 只根据 Host 权威错误结果显示对应对象和下一步。
- [ ] 保存或未放弃草稿的操作在 Host 提交前取消时，Client 保留草稿和待完成意图；使用者已经放弃草稿后发起的操作失败或取消时，草稿保持已丢弃并加载实际生效配置。
- [ ] 写操作 Remote 请求发出后发生本地取消，但 Host 返回成功配置时，Adapter 与 Client 仍采用已提交配置，不得显示取消或旧活动配置。
- [ ] `saveProfile`、`activateProfile` 和 `deleteProfile` 三个写 Remote Adapter 都覆盖“本地取消发生在请求发出后、Host 随后返回成功配置”的回归测试。
- [ ] Settings scope 删除草稿来源配置或待切换目标时，Client 按状态机显示明确对象、实际生效结果和下一步，不得静默复活或选择其他配置。
- [ ] Host 的 save、activate 和 delete 请求共用同一修改队列，并在进入队首后读取最新 Settings。
- [ ] Host 的已知保存、激活和删除错误通过 Typert Remote 失败结果保留具体业务错误码，Client 使用该错误码显示唯一文案。
- [ ] Client 使用 Host 返回的完整配置同步实际生效状态，不从旧快照拼装结果；只读状态不能产生 Client 本地假切换。
- [ ] 自动化测试和完整 Desktop 测试覆盖打开、编辑、选择已有、新建、复制、保存、放弃、删除、离开、失败和并发状态。
- [ ] runtime error finish 保留 `LlmFailure` 字段白名单与本次 profile 快照。
- [ ] runtime non-caller abort finish 保留 `LlmFailure` 字段白名单与本次 profile 快照。
- [ ] 调用者取消继续返回 AbortError。
- [ ] Provider failure 文案按 `{ fieldChars: 96, totalChars: 2048 }`、未配对代理项替换、固定处理顺序、固定字段顺序和指定控制字符集合生成有界单行文本。
- [ ] 异常 context、Tool error、CLI stderr 与 Host 日志没有读取或复制 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 或 `LlmFailure.message`。
- [ ] `inspect_image` Tool 与 `image inspect --stdin` CLI 显示相同的具体错误文案。
- [ ] 成功调用继续返回 `provider`、`model`、`file_path` 与 `observation` 四属性 JSON。
- [ ] Qwen 专用 profile 的指定媒体与纯红对照图结果分别符合真实模型唯一判定表；超时不得标记通过。
- [ ] GLM 专用 profile 的指定媒体结果符合真实模型唯一判定表；超时不得标记通过。
- [ ] DeepSeek 专用 profile 继续成功读取指定媒体。
- [ ] 根 `cordis.patch.yml` 把前台 Bash 默认 `timeoutMs` 固定为 `180000`，单次真实模型验收仍可显式使用 `60000`。
- [ ] 独立代码 Reviewer 没有阻断项。
- [ ] 独立语义 Reviewer 没有阻断项。
- [ ] `pnpm quality` 通过。
- [ ] `git diff --check` 通过。
- [ ] 隔离开发 Desktop 已停止。
- [ ] 用户分别批准提交、发布和部署后，生产 checkout 从发布提交完成更新，且生产专用配置没有被覆盖。

## 非本次目标

- 本方案不自动重试 Provider 请求。
- 本方案不在使用者没有选择目标配置时自动切换图片读取 profile，也不在切换失败时使用替代 profile。
- 本方案不修改 Qwen、GLM、DeepSeek 或内网 OpenAI 兼容服务的上游行为。
- 本方案不使用程序代码判断图片语义或选择模型。
- 本方案不新增依赖包。
- 本方案不修改 Generation Run 参数、Actual Workflow、媒体解析或图片生成流程。
- 本方案不新增设置页配置测试按钮、内置测试图片或 `run_id` 测试图片来源。
- 本方案不把历史设置恢复设计扩展为通用 Settings 版本控制系统。
- 本方案不修改外部 Settings Shell 依赖；未保存草稿离开页面采用确定的回退语义。

## 已获得的授权

- 用户已授权在独立 worktree 中完成根因调查和修复方案设计。
- 用户已明确配置选择语义：选择已持久化配置后该配置立即生效；新建或复制的未保存配置不生效；未保存草稿离开页面时必须提示或回退到实际生效配置。
- 用户已明确撤回设置页配置测试按钮、内置测试图片和 `run_id` 测试图片来源；三项功能不进入本次实施范围。
- 用户已授权读取生产日志、生产图片读取配置的非凭据字段、生产 Session 记录和指定媒体。
- 用户已授权在隔离开发 Desktop 中使用生产模型专用配置进行复现。
- 用户已通过 `implement` Skill 授权修改独立 worktree 中的业务代码、测试代码与项目文档，并提交当前分支。
- 用户已明确要求提高 Tool 默认超时，避免图片读取 Skill 第一次调用继续继承 `60000` 毫秒而过早失败；本次候选把产品默认值设为 `180000` 毫秒。
- 用户尚未授权修改版本元数据、推送修复或合并到 `main`。
- 用户尚未授权发布 `0.39.1`。
- 用户尚未授权部署修复或修改生产配置。
