# `/comfyui-image-review` 视觉模型调用失败与配置选择诊断计划

## 必须实现的目标

- 计划执行者必须在独立 worktree 中使用生产 Qwen 与 GLM 图片读取配置复现 `IMAGE_READER_PROVIDER_FAILED`。
- 计划执行者必须区分 Provider 实际失败与 Harness 错误信息丢失两个故障层次。
- 计划执行者必须用生产时间线、生产配置、源码和对照图片结果说明每项根因结论的证据强度。
- 计划执行者必须复现并解释“保存 A、选择已存在 B、不保存并关闭后仍使用 A”的配置选择缺陷。
- 计划执行者必须从打开页面到图片读取完整定义已持久化配置选择、未保存草稿、保存、放弃、删除、离开、失败和并发状态转换。
- 计划执行者必须提交包含修改文件、测试分支、验收命令和风险边界的修复方案。
- 计划执行者必须在用户批准前停止业务代码、测试代码、生产配置、发布状态和部署状态的修改。

## 当前阶段

阶段 6：按照已批准方案执行 TDD 实施、验证、独立审查和当前分支提交。

## 阶段

### 阶段 1：建立反馈环

- [x] 确认 linked worktree、配置来源和生产证据读取边界。
- [x] 找到 `image inspect` 的正式 CLI 入口和现有测试入口。
- [x] 使用 `opencode-go/qwen3.7-plus` 建立能够断言用户所述错误的初始对照命令。
- **状态：** 已完成

### 阶段 2：恢复生产历史配置

- [x] 确认 10:53 的固定错误文案来自 runtime 图片读取路径。
- [x] 确认 10:56:40 保存的新活动配置覆盖了 10:53 的活动 profile 标识。
- [x] 恢复生产中 Qwen、GLM 与 DeepSeek profile 的 Provider、模型、默认提示词、温度和最大输出 Token 数。
- [x] 记录用户提供的历史事实：当时 Qwen 与 GLM 均出现该问题，DeepSeek 当时没有测试结果。
- **状态：** 已完成；现有持久化数据无法唯一确认 10:53 单次调用使用 Qwen 还是 GLM。

### 阶段 3：按生产专用配置复现并最小化

- [x] 使用生产 Qwen profile 原样读取指定媒体并复现固定错误。
- [x] 使用生产 GLM profile 原样读取指定媒体并复现固定错误。
- [x] 使用生产 DeepSeek profile 原样读取指定媒体并取得成功观察，作为模型路径对照。
- [x] 使用无人物图片、同尺寸噪声图、重新编码原图和缩小原图分离文件格式、像素尺寸、字节量与可见内容。
- **状态：** 已完成

### 阶段 4：假设检验与根因确认

- [x] 检验全局 CLI、Attachment Store、凭据和 runtime Provider 全部不可用假设。
- [x] 检验原图 PNG 签名、尺寸、字节量和元数据触发本地校验失败假设。
- [x] 检验 Qwen 路径的输入相关 Provider 终止假设，并区分 qwen3.8 与 qwen3.7 的证据范围。
- [x] 检验 GLM 路径的模型服务可用性假设。
- [x] 确认 `observation()` 丢弃 `finish.reason.failure`，CLI 只收到固定错误码和固定文案。
- **状态：** 已完成

### 阶段 5：设计修复方案

- [x] 指定需要修改的生产代码、项目文档和测试文件。
- [x] 指定 Provider error、Provider abort、调用者取消、成功和 CLI 输出测试分支。
- [x] 指定独立 worktree 的验证命令和完整 Desktop 验收步骤。
- [x] 完成独立语义 Reviewer 验收。
- [x] 向用户提交修复方案并等待批准。
- [x] 根据用户补充复现“选择已持久化 B 后 Host 仍使用 A”。
- [x] 比较最小激活 Remote、通用配置命令和原子保存并切换三种 Interface 设计。
- [x] 把已持久化配置立即激活、新建草稿不激活和离开回退写入完整状态机。
- [x] 完成修订方案的最终独立语义 Reviewer 验收。
- **状态：** 已完成

### 阶段 6：实施修复

- [x] 在共享 Remote、设置页、图片读取与 CLI/Tool 既定 seam 逐个完成 red → green。
- [x] 把根 `cordis.patch.yml` 的前台 Bash 默认超时提高到 `180000` 毫秒，并固定边界测试与文档。
- [x] 使用 Typert 业务失败载体保留保存、激活和删除的图片读取业务错误码。
- [x] 更新错误目录、系统文档和发布说明。
- [x] 完成目标测试、类型检查、完整 Desktop 验收、独立代码审查和独立语义审查。
- [ ] 运行 `pnpm quality` 与 `git diff --check` 后提交当前分支。
- **状态：** 进行中

## 验收清单

- [x] 独立 worktree 的 `.git` 是 linked-worktree 元数据文件。
- [x] 生产 Qwen profile 能够复现指定媒体的固定错误，且同一 profile 能够读取无人物对照图。
- [x] 生产 GLM profile 能够复现指定媒体的固定错误，且同一 profile 读取无人物对照图时出现独立的超时现象。
- [x] 生产 DeepSeek profile 能够读取指定媒体并返回观察结果。
- [x] 根因结论包含源码位置、生产时间线、生产配置、真实模型复现和反证实验。
- [x] 修复方案通过独立语义 Reviewer 验收。
- [x] 诊断测试证明选择已持久化 B 后 `activeProfileId` 仍为 A；新建未保存 C 不会修改 A。
- [x] 配置选择方案区分 Host 实际生效配置、Client 编辑草稿和未保存状态。
- [x] 配置选择修订方案通过独立语义 Reviewer 验收。
- [x] 隔离开发 Desktop 已停止，`pnpm dev:status` 返回 stopped。
- [x] 本轮没有修改生产 checkout、版本元数据、远端分支、发布状态或部署状态。
- [x] 用户批准前没有开始阶段 6。

## 非本次目标

- 本轮不修改 `image inspect` CLI 请求结构、视觉模型 Provider、`comfyui-image-review` Skill 或生产 checkout 配置。
- 本轮不设计或实施自动模型切换、静默重试或静默降级。
- 本轮不承诺使 Qwen 或 GLM Provider 完成其上游没有完成的图片请求。
- 本轮不安装或升级依赖包。
- 本轮完成当前修复分支的本地提交，不推送、不发布、不部署。
- 本轮不处理与图片读取 Provider 失败和图片读取配置选择没有直接证据关系的问题。

## 已获得的授权

- 用户已授权创建独立 git worktree。
- 用户已授权读取开发仓库和生产目录中的相关日志、配置、运行记录与媒体文件。
- 用户已授权执行不会改变生产状态的真实模型复现调用。
- 用户已通过 `implement` Skill 授权在当前独立 worktree 实施已审定方案、修改代码/测试/项目文档、完成验证并提交当前分支。
- 用户尚未授权修改生产配置、推送、发布或部署。

## 根因结论

1. `opencode-go/qwen3.8-flash` 使用生产专用提示词、温度 `0.1` 和最大输出 `8192` 时，可以读取纯红对照图，但读取指定媒体时进入 runtime failure finish；现有固定文案不能区分 `error` 与非调用者 `aborted`。该结果确认 qwen3.8 的结果随输入变化，并排除该模型服务整体离线；现有 qwen3.8 专用配置实验没有唯一确认触发因素。默认 `opencode-go/qwen3.7-plus` 读取同尺寸噪声图成功，读取原图、重新编码原图和缩小原图失败；只有 qwen3.7 对照实验支持可见内容相关推断。
2. `opencode-go/glm-5.3-flash` 使用生产专用提示词、温度 `0.2` 和最大输出 `8192` 时，读取指定媒体约十几秒后进入 runtime failure finish；现有固定文案不能区分 `error` 与非调用者 `aborted`。读取纯红对照图的调用在 60 秒内没有完成，并由调用命令终止。该结果确认 GLM 路径还存在独立的响应可用性问题，现有证据不能把 GLM 失败唯一归因于图片内容。
3. `opencode-go/deepseek-v4-flash-vision-exp` 使用生产专用提示词、温度 `0.2` 和最大输出 `8192` 时成功读取同一指定媒体。该结果只证明 DeepSeek 当前路径可用，不证明 10:53 使用了 DeepSeek。
4. `src/host/image-reader/image-reader-service.ts` 的 `observation()` 收到 `finish.reason.kind === 'error'` 或非调用者取消的 `finish.reason.kind === 'aborted'` 后，丢弃已经标准化的 `finish.reason.failure`，并创建固定 `IMAGE_READER_PROVIDER_FAILED` 文案。`src/host/cli/route.ts` 和 `scripts/cli/harness-comfyui.mjs` 随后只能转发该固定文案。
5. 生产 10:53 的具体 Provider failure code、message、HTTP status 和 request ID 已经在服务边界被丢弃，生产日志与 Session 记录无法事后恢复。生产设置也没有保存每次图片读取使用的活动 profile 标识；10:56:40 的配置保存覆盖了活动标识。因此调查可以确认 Provider 终止和 Harness 诊断信息丢失，但不能伪造 10:53 单次调用的底层 Provider 文案或唯一模型。
6. `ImageReaderSettingsPage.selectProfile()` 只把已持久化配置 B 加载到 Client 的 `activeProfile`，没有请求 Host 修改 `activeProfileId`。`ImageReaderRemoteService.saveProfile()` 是现有唯一激活路径，`ImageReaderService.inspect()` 只读取 Host 持久化的 `activeProfileId`。因此页面能够显示 B而下一次图片读取仍使用 A。
7. 提交 `6cd6351` 把配置切换定义成“选择后保存全部配置”；后续单配置保存改造保留了“保存才激活”的合同。现有测试验证配置值恢复和保存后激活，没有验证使用者选择已持久化配置后立即激活。
8. Settings Shell 的关闭按钮、Escape、遮罩和左侧栏目导航直接卸载当前设置页，只向页面提供 `close()`，没有统一离开拦截 Interface。用户允许未保存草稿离开时提示或回退，本方案选择页面卸载时丢弃草稿并在重新进入时加载 Host 实际生效配置。

## 修复设计摘要

1. `ImageReaderService` 必须在 runtime finish error 和非调用者 abort 分支中使用字段白名单保存 `LlmFailure.code`、可选 `status`、可选 `providerRetryAfterMs` 与可选 `requestId`。服务不得把不受信任的 `LlmFailure.message` 写入异常属性、CLI、Tool Result 或 Host 日志。
2. 诊断文案必须同时记录本次调用使用的 profile 名称、profile ID、连接类型、Provider、模型、温度和最大输出 Token 数。所有允许字符串字段必须执行确定性的单行转换和长度限制；文案生成器不得读取或复制 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef 或 `LlmFailure.message`。
3. `ImageReaderError.code` 必须继续使用 `IMAGE_READER_PROVIDER_FAILED`，以保持错误目录和调用方分支稳定；CLI 与 `inspect_image` Tool 必须通过现有错误传播路径取得同一条具体文案。
4. 调用者 AbortSignal 已取消时，服务必须继续抛出 AbortError，不得把调用者取消重写成 Provider failure。
5. 本修复不得因 Provider 失败自动切换到 DeepSeek、内网 OpenAI 兼容模型或其他 profile；只有使用者在设置页明确选择的已持久化配置才能成为新的活动配置。
6. Client 必须使用专用 `activateProfile({ profileId })` 请求表达已持久化配置选择；Host 只修改 `activeProfileId` 并返回完整权威配置。
7. `saveProfile` 必须接收明确的最终 `activateProfileId`，使“保存当前草稿并切换已持久化 B”在一次 Host Settings 提交内完成。
8. 新建或复制未保存 C时，Client 必须显示 C 是草稿并显示 Host 当前实际生效配置；关闭或离开页面后 C 被丢弃，下一次进入页面加载实际生效配置。
9. 已持久化配置 A 有未保存修改时，选择 B 必须进入“保存并切换 / 放弃并切换 / 继续编辑”门禁；普通图片读取不得读取 A 的草稿值。

## 决策记录

| 决策 | 理由 |
|---|---|
| 使用 `codex/diagnose-image-review-provider-failure` 独立分支 | 用户明确要求独立 worktree，并可能在批准后沿用同一环境实施修复。 |
| 使用生产 Qwen 与 GLM profile 分别复现 | 用户明确说明生产服务为不同模型保存专用配置，默认 profile 不能代表生产现场。 |
| 不把 DeepSeek 成功结果当作历史模型证据 | 用户说明 DeepSeek 当时没有测试；生产设置没有保存 10:53 活动 profile。 |
| 保留稳定项目错误码并扩充具体文案 | 现有调用方依赖稳定错误码；底层 `LlmFailure` 已经提供诊断字段，固定文案造成了证据丢失。 |
| 不设计自动 fallback | 用户没有授权生产配置切换，仓库规范也不允许未经同意的静默降级。 |
| 已持久化配置使用专用激活 Remote | 选择配置和保存配置是两个不同用户动作；激活不得重新提交 B 的模型、提示词或凭据。 |
| 保存请求携带最终活动配置 ID | 保存 A 或 C 后切换 B 是一个组合用户意图；一次 Host Settings 提交避免中间激活 A 或 C和半完成状态。 |
| 保存请求区分 `create` 与 `update` | Host 必须拒绝覆盖同 ID 已保存配置，也必须拒绝重新创建已经被并发删除的已保存配置。 |
| Host 使用不同错误码标识缺失配置的角色 | 同一保存请求同时包含草稿 A和激活目标 B；Client 必须根据 Host 权威结果区分缺失对象并显示唯一文案。 |
| 写 Remote 发出请求后采用 Host 结果 | Client 本地取消信号不能把 Host 已提交的成功配置改写成取消，否则界面与 `Image Inspection` 会再次分叉。 |
| 本次不新增配置测试入口 | 用户确认测试按钮与 `run_id` 图片来源属于过度设计；本方案只处理 Provider 失败信息丢失与配置状态机缺陷。 |
| 未保存草稿离开时回退 | 用户允许提示或回退；现有 Settings Shell 没有统一离开拦截 Interface，页面卸载和重新挂载能够确定地丢弃草稿并加载 Host 实际生效配置。 |
| 不增加 Settings revision | 现有 Host 修改队列已经线性化 save、activate 和 delete；当前缺陷不需要扩展 Settings schema 或设计没有 CAS 支持的冲突合同。 |

## 错误记录

| 错误 | 次数 | 处理结果 |
|---|---:|---|
| 用户提供的 `IMAGE_READER_PROVIDER_FAILED` | 1 | 已在生产 Qwen 与 GLM 专用配置中复现。 |
| `scripts/desktop/runtime.mjs` 不存在 | 1 | 改为读取仓库实际存在的 Desktop 运行文件。 |
| Node.js 无法解析 `yaml` 模块 | 1 | 未安装依赖；改用本机 Ruby YAML 标准库只读取允许的配置字段。 |
| Computer Use 服务启动失败 | 2 | 停止重试并使用 in-app Browser 控制隔离开发 Desktop。 |
| Browser composer placeholder locator 无匹配 | 1 | 使用 DOM 可访问性名称定位 composer。 |
| 默认模型对照不能代表生产历史配置 | 1 | 恢复并使用每个生产模型自己的完整 profile 参数复现。 |
| GLM 纯红对照图调用在 60 秒内没有完成 | 1 | 记录为独立的 GLM 路径可用性证据，不把它错误归类为内容拒绝。 |
| 诊断测试首次使用了多一层 `../`，无法导入设置页 | 1 | 按诊断文件到仓库根目录的实际三层路径修正导入后重新运行。 |
| 已持久化配置选择诊断测试 | 1 | 测试稳定失败：期望 `profile-b`，实际仍是 `profile-a`；同文件的新建未保存配置基线通过。 |
