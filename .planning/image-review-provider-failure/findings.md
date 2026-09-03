# `/comfyui-image-review` 视觉模型调用失败调查记录

## 需求

- 创建独立 worktree。
- 定位生产目录中指定 run 的 `IMAGE_READER_PROVIDER_FAILED` 根因。
- 设计修复方案。
- 解释并修复“选择已持久化配置后没有立即生效”的配置交互。
- 用户批准前不实施修复。

## 已确认事实

- 用户报告的 run ID 是 `run_4fcd5a59-ef7a-4eab-9fc1-ee1b8b90ca91`。
- 用户提供的失败媒体路径是 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env/.local/desktop-production/saved-media/61/0c/media_610ce786-32f1-45de-aa9c-fd9c23768063.png`。
- 用户提供的 CLI 错误码是 `IMAGE_READER_PROVIDER_FAILED`，错误文案是 `The configured visual model did not complete the image inspection.`。
- 独立 worktree 路径是 `/Volumes/4Tdisk/work/AI2/harness-comfyui-wt-image-review-provider-failure`。
- 独立 worktree 分支是 `codex/diagnose-image-review-provider-failure`，基线提交是 `77d0ed8e30bf6428e038ecbd54bf58e5f1dbf291`。
- 主开发 checkout 的 `AGENTS.md` 存在用户修改；独立 worktree 从提交基线创建，没有复制该未提交修改。
- `src/host/cli/route.ts` 把 `image inspect --stdin` 请求转交给 `ImageReaderService.inspect()`。
- `src/host/image-reader/image-reader-service.ts` 包含多个产生 `IMAGE_READER_PROVIDER_FAILED` 的分支；用户提供的精确文案对应其中一个特定分支，可以作为反馈环断言。
- `tests/unit/image-reader-service.test.ts` 已覆盖部分 Provider 失败分支，`tests/integration/cli-route.test.ts` 和 `tests/integration/cli-command.test.ts` 已覆盖 CLI 调用边界。
- `docs/system/testing.md` 记录 2026-09-02 的真实模型验收使用 `opencode-go/qwen3.7-plus` 图片读取模型并成功返回；该记录只能作为对照基线，不能证明 10:53 生产调用使用相同模型或相同模型专用配置。
- `scripts/cli/harness-comfyui.mjs` 只允许通过 managed foreground shell 注入的 loopback API 地址和 capability 调用 Host；普通终端没有 `DSH_HARNESS_COMFYUI_CLI`，因此不能直接从当前 shell 重放用户命令。
- CLI 客户端仅原样输出 Host 返回的 `{ code, message }`；用户看到的具体错误文案来自 Host 服务，不是 CLI 客户端生成或重写。
- 生产运行目录包含已打包的 `harness-comfyui-0.39.0.tgz` 与对应 `plugin-package-source`，可以对比开发基线与实际部署源码。
- 用户所见精确文案只由 runtime 连接路径的 `observation()` 产生：Harness LLM stream 发出 `finish.reason.kind === "error"`，或者发出 `finish.reason.kind === "aborted"` 且 CLI 的 AbortSignal 没有被取消。
- `observation()` 检测到上述 finish reason 后只生成固定 `ImageReaderError`；它没有把 `finish.reason` 中的 Provider failure 信息保存到 `cause` 或错误文案。
- OpenAI 兼容连接路径的每个失败文案都以 `The configured OpenAI-compatible endpoint ...` 开头，因此当前用户错误不来自 OpenAI 兼容连接路径。
- 现有单元测试模拟了 `finish.reason.kind === "error"`，但只断言错误码，没有断言固定文案，也没有断言底层 `finish.reason.failure` 是否保留。
- 生产 Harness 日志的确定路径是 `.local/desktop-production/home/Library/Logs/DSH Desktop Dev/harness.log`；`pnpm prod:logs` 读取该文件。
- 生产 Desktop 当前具有 PID 文件和 mobile bridge 状态文件；后续只读取状态与日志，不执行生产启停命令。
- 生产 Harness 日志只有 451 行，最后修改时间是 2026-09-03 05:48:56；日志中没有指定 run ID、错误码、固定错误文案或 10:53 记录，因此该日志不能还原本次 Provider failure。
- `readDesktopWorktreeLogs()` 只读取 Harness 日志末尾 120 行，不会从其他 Provider 日志源聚合错误详情。
- 生产 Desktop 状态为 `running`，PID 19738，启动时间是 2026-09-03 05:48:51，说明用户 10:53 的调用发生在同一生产 Desktop 进程中。
- 当前图片读取设置的持久化文件位于生产 DSH_HOME 的 `settings.yaml`；后续只解析图片读取相关的非凭据字段。
- 图片读取设置命名空间是 `harness-comfyui-image-reader-profiles`。
- 生产设置包含 5 个图片读取配置和 1 个凭据值；调查只输出活动配置的连接类型、Provider、模型和非敏感采样参数，不读取或输出凭据内容。
- 当前活动配置是 OpenAI 兼容配置 `内网图片读取配置 2`，模型是 `Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-MLX-mxfp4`，`temperature=0.2`，`maxTokens=8192`。
- 当前活动配置与用户错误文案对应的 runtime 分支矛盾；必须确认设置文件修改时间和生产部署源码，不能把当前活动配置直接当作 10:53 调用时的配置。
- 指定媒体是有效 PNG，大小 1,260,039 字节，分辨率 832×1216，文件签名和尺寸均不会触发 `IMAGE_READER_FILE_INVALID`。
- 生产 `settings.yaml` 的修改时间是 10:56:40，比用户报告的 10:53 失败晚约 3 分钟；当前 OpenAI 兼容活动配置不能代表失败发生时的活动配置。
- 生产部署的 `image-reader-service.ts` 与独立 worktree 基线完全一致，二者版本均为 0.39.0；错误文案与代码分支的映射不存在部署版本偏差。
- 综合精确文案、源码一致性和设置修改时间，10:53 调用确定经过 runtime 连接路径；具体使用哪个 runtime profile 仍需运行时复现或其他历史证据确认。
- `docs/agents/comfyui-workbench-preset-and-skill-development.md` 确认 managed CLI capability 只在当前前台 shell Tool Call 中存在；隔离开发 Desktop 的真实模型验收是复现 runtime Provider 路径的正式方法。
- 如果最终方案修改 `comfyui-image-review` Skill 或 CLI 参考文档，实施阶段必须由独立语义 Reviewer 检查主谓宾、CLI 合同章节、参考文档读取条件和执行环境可见性。
- 系统架构规定 `dev:start` 使用当前 worktree 的独立 Desktop HOME、DSH home、运行目录、端口和插件 generation，同时从主 checkout 取得 `.env`、`node_modules` 与 Desktop 底座；该环境适合复现，不会改写生产 DSH home。
- `dev:start` 的隔离 DSH home 使用新 Settings；没有用户配置时，`cordis.patch.yml` 提供默认 runtime 视觉模型 `opencode-go/qwen3.7-plus`。没有历史证据时不得把该默认值认定为 10:53 的生产活动配置。
- 图片读取设置保存后对下一次调用实时生效，不需要重启 Host；这解释了 10:56 设置变更后当前活动配置与 10:53 调用不同。
- 测试规范要求缺陷修复覆盖成功、拒绝、清理和错误分支；图片读取已有 fake runtime/fetch seam，但当前测试没有覆盖 runtime finish failure 的具体详情保留。
- 最终候选必须在独立 linked worktree 执行 `pnpm quality` 和 `git diff --check`；本次方案不需要新增依赖。
- 隔离开发 Desktop 已使用 worktree generation 启动，状态是 `running`，PID 32277，移动桥接端口 65440。
- `tests/desktop/managed-shell-capability.test.ts` 覆盖真实 DSH bash 执行路径并取得项目 CLI capability；如果 UI 复现不可用，该测试是最接近的自动化调用 seam。
- Computer Use 服务不可用，但 Codex in-app Browser 已连接；隔离 Desktop 的 loopback Web UI 可以作为本地 UI 复现入口。
- 隔离 Web UI 已加载 `run-comfyui-workflows-harness` Workspace、`ComfyUI工作台预设` 和 `DeepSeek V4 Flash` Agent 模型；页面当前显示首次启动声明，尚未提交复现请求。
- 仓库没有现成图片 fixture；本机已有 ImageMagick，可以创建内容已知的最小 PNG，先判断 runtime Provider 是否对所有图片失败，再决定是否需要重放用户图片。
- 已创建 64×64、316 字节的纯红 PNG 诊断输入；该文件没有用户媒体内容。
- 页面 composer 是 `role="textbox"`、具有描述性 `aria-label` 的 contenteditable `div`，不是具有 placeholder 的 `textarea`。
- 隔离 Desktop 的默认 runtime 配置 `opencode-go/qwen3.7-plus` 成功读取 64×64、316 字节的纯红 PNG；CLI 退出成功并返回四属性 JSON。
- 最小 PNG 成功排除全局 Provider 不可用、API Key 全局失效、runtime 配置无法准备、模型未声明图片输入、Attachment Store 全局故障和 CLI capability 故障。
- 成功调用使用默认读图提示词，没有传递本次 `prompt`，因此本次 prompt 覆盖功能不是用户失败的必要条件。
- 同一隔离 Desktop、默认 `opencode-go/qwen3.7-plus` runtime 配置和同一默认提示词读取用户媒体时，稳定入口返回用户报告的精确 `IMAGE_READER_PROVIDER_FAILED` 与精确固定文案；该结果是表层症状对照，不是按历史生产配置完成的复现。
- 在默认 `qwen3.7-plus` 对照配置中，纯红 PNG 成功而用户媒体失败；该证据只把该模型下的差异收敛到图片字节、像素尺寸或可见内容，不能排除历史模型及其专用配置造成不同结果。
- 本地原图观察显示图片是成人男女裸体性交插画；图像清晰呈现性行为姿势和裸体身体。该可见内容是当前最强的输入差异，但仍需用同尺寸无关内容图和保留内容的尺寸变体证伪尺寸/字节量假设。
- 本次问题的核心模块边界是 `src/host/image-reader/`；CLI route 与 Skill 只负责把单图路径和可选 prompt 传入该服务。
- `ImageReaderSettingsPage.selectProfile()` 在表单没有未保存修改时只执行 `loadPersistedProfile(persistedConfiguration, id)`；该函数只更新 Client 的 `activeProfile`、凭据动作和 `dirty`，没有调用 Host。
- `ImageReaderRemoteService.saveProfile()` 当前把 `request.profile.id` 写成 `activeProfileId`；Host 没有只激活已持久化配置的独立 Remote。
- `ImageReaderService.inspect()` 每次从 Host Settings 的 `configuration.activeProfileId` 解析图片读取配置，不读取 Client 页面状态。
- 最小诊断测试固定以下用户路径：初始活动配置 A，选择已持久化 B，不点击保存，卸载设置页。测试期望持久活动 ID 为 B，实际为 A。
- 同一诊断文件固定未保存草稿基线：初始活动配置 A，新建草稿 C，不保存并卸载设置页。Host 没有写请求，重新挂载后页面显示 A；该结果符合用户确认的“新建未保存配置不生效”。
- 诊断反馈环命令是 `pnpm exec vitest run .planning/image-review-provider-failure/diagnostics/existing-profile-selection.test.ts`；当前结果是一项配置选择测试失败、一项新建草稿测试通过。
- 提交 `6cd6351` 引入多份配置时，界面文字明确要求“切换后点击保存全部配置”；后续单配置保存方案继续规定“保存配置 ID成为 activeProfileId”。因此当前缺陷来自已有 Interface 设计，不是下拉控件事件偶发丢失。
- `SettingsSectionOwnerProps` 只包含页面主动调用的 `close()`；Settings Shell 自己处理关闭按钮、Escape、遮罩点击和左侧栏目选择。功能页面不能拦截这些离开动作。
- 用户已经明确唯一产品语义：选择已持久化配置 B 后 B 立即生效；新建或复制未保存 C 不生效；编辑现有配置未保存时图片读取继续使用上次保存值；草稿离开页面时提示或回退到实际生效配置。

## 待收集证据

- `image inspect` CLI 的入口文件、请求构造器、Provider 适配器和错误映射位置。
- 生产配置选中的视觉模型和 Provider，但不得记录凭据值。
- 指定 run 的原始参数、Actual Workflow、媒体元数据和相关日志。
- 同一视觉模型使用最小本地图片时的结果，以及指定图片使用替代只读探针时的结果。
- Harness LLM stream 的 finish reason 数据结构，以及生产日志是否记录 `finish.reason.failure`。

## 可证伪假设

1. 10:53 的历史 runtime 模型或该模型专用 Provider 配置对原图返回 finish error。预测：恢复该 profile 后可以复现相同错误，底层 `finish.reason.failure` 能指出模型或 Provider 的具体失败原因。
2. 10:53 使用的模型专用图片输入参数与默认配置不同。预测：同一模型分别使用历史参数和默认参数时，只有历史参数重现生产失败。
3. 原图像素尺寸、编码字节量或 PNG 元数据触发历史模型的输入限制。预测：恢复历史配置后，无关图或重编码、缩小变体能够沿单变量边界改变结果。
4. 原图可见内容触发历史模型或 Provider 的终止路径。预测：恢复历史配置后，无关图成功，保留可见内容的重编码图和缩小图仍失败。
5. 10:53 是瞬时 Provider 故障。预测：恢复历史配置后，同一原图重复调用会出现成功，失败结果不稳定。
6. 已持久化配置 B 没有生效是因为 `selectProfile()` 只更新 Client 草稿。预测：选择 B 后 `ImageReaderSettingsApi` 没有写调用，Host `activeProfileId` 仍为 A。诊断测试已经确认。
7. Settings 镜像会把 Client 下拉选择自动持久化。预测：没有 Remote 调用时 Host `activeProfileId` 仍会变成 B。源码和诊断测试已经否定。
8. Settings Shell 会在关闭或返回时保存页面选择。预测：Shell 离开路径调用页面提供的保存或离开守卫。已安装 Settings Shell 的实现直接卸载页面，已经否定。
9. 页面副作用会在选择 B 后间接调用 `saveProfile()`。预测：诊断测试中的 `saveProfile` mock 会收到 B。诊断测试没有收到调用，已经否定。

## 最小化输入

- `same-dim-noise.png`：832×1216、1,013,689 字节的确定性随机灰度噪声；保持像素尺寸并接近原图字节量，不包含语义画面。
- `reencoded-original.png`：832×1216、1,096,903 字节；保持原画面和像素尺寸，删除元数据并由 ImageMagick 重新编码。
- `downscaled-original.png`：208×304、97,409 字节；保持原画面内容，显著降低尺寸与字节量。
- `same-dim-red.png`：832×1216、447 字节；保持像素尺寸但消除内容与字节量。

## 技术决策

| 决策 | 理由 |
|---|---|
| 使用现有 CLI 或现有测试作为反馈环 | 反馈环必须覆盖用户实际调用路径并能够断言具体错误码。 |
| 所有证据输出必须省略凭据来源字段 | 调查过程不得读取或复制 Settings credentials。 |
| 先恢复 10:53 历史配置再继续根因检验 | 生产服务按模型提供专用配置；默认模型对照不能替代生产现场。 |
| 使用同一历史 runtime 配置比较成功与失败图片 | 单变量差异实验必须固定生产模型及模型专用配置，才能把根因范围缩小到图片输入及 Provider 对该输入的响应。 |
| 把实际生效配置、编辑草稿和未保存状态分开 | 已持久化 B 的选择、新建 C 和编辑 A 是不同状态转换，不能继续共享含义模糊的 `activeProfile`。 |
| 专用 `activateProfile` Remote | Host 可以只修改 `activeProfileId`，不必重新保存 B 的配置或凭据。 |
| `saveProfile` 接收最终 `activateProfileId` | 保存 A 或 C 后切换 B 可以在一次 Settings 替换中原子完成。 |
| `saveProfile` 区分 `operation: create` 与 `operation: update` | Host 能够拒绝覆盖同 ID 配置，也能够拒绝把已被并发删除的配置静默重新创建。 |
| 缺失的更新来源、激活目标和删除目标使用不同错误码 | Client 必须从 Host 权威结果唯一识别失败对象，不能根据本地快照猜测并发结果。 |
| 写 Remote 发出后不使用本地取消覆盖 Host 成功 | Host 已经提交活动配置时，Client 必须采用该配置，避免界面继续显示提交前配置。 |
| 草稿离开时采用回退 | 用户允许提示或回退；当前 Settings Shell 没有功能页可用的统一离开拦截 Interface。 |
| 不新增设置页配置测试按钮或 `run_id` 测试来源 | 用户在方案设计阶段撤回该扩展，明确判断其属于过度设计；本次实现范围保持为两个已确认缺陷。 |
| 根配置统一设置前台 Bash 默认超时为 `180000` 毫秒 | `comfyui-image-review` 没有单独设置 `timeoutMs`，原产品默认值 `60000` 毫秒会直接限制首次视觉模型调用；单次调用仍可显式覆盖。 |
| Host 设置写错误使用 `TypertRemoteFailure` | 普通 `ImageReaderError` 会被 Typert carrier 转换为通用 Remote 异常码；专用业务失败载体会保留设置页所需的具体错误码。 |

## 资源

- `docs/agents/worktree-development.md`
- `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env/.local/desktop-production/`
- `CONTEXT.md`
- `src/host/image-reader/image-reader-service.ts`
- `src/host/cli/route.ts`
- `tests/unit/image-reader-service.test.ts`
- `tests/integration/cli-route.test.ts`
- `tests/integration/cli-command.test.ts`

## 问题记录

| 问题 | 处理方式 |
|---|---|
| 根目录已有被 Git 跟踪的 `task_plan.md`、`findings.md` 和 `progress.md` | 为当前调查创建 `.planning/image-review-provider-failure/` 独立记录目录，保留既有文件。 |
| 普通终端没有 managed CLI 环境变量 | 使用隔离开发 Desktop 的 foreground shell 或现有自动化 seam 建立反馈环；生产目录仅做只读日志与源码对照。 |
| 预期的 `scripts/desktop/runtime.mjs` 不存在 | 使用 `rg --files scripts/desktop` 找到实际运行时文件，不重复读取不存在的路径。 |
| 生产 checkout 的 Node.js 环境没有顶层 `yaml` 模块 | 不新增依赖，改用本机 Ruby YAML 标准库读取结构。 |

## 生产时间线与配置恢复结果

- 生产 Session 记录显示指定媒体在 10:19 至 10:56 之间多次返回相同的 `IMAGE_READER_PROVIDER_FAILED` 固定文案。
- 生产 Session 记录显示 10:53:37、10:55:20、10:56:15 三次调用均返回相同固定文案。
- 生产 `settings.yaml` 在 10:56:40 保存新活动配置；10:56:51 的下一次调用通过内网 OpenAI 兼容模型成功返回。
- 生产设置只保存当前 `activeProfileId`，没有保存活动 profile 变更历史或单次调用 profile 快照。因此现有持久化数据无法唯一确认 10:53 单次调用使用 Qwen 还是 GLM。
- 用户确认当时 Qwen 与 GLM 都出现该问题，DeepSeek 当时没有测试。
- 生产 Qwen profile 是 `opencode-go/qwen3.8-flash`、专用默认提示词、`temperature=0.1`、`maxTokens=8192`。
- 生产 GLM profile 是 `opencode-go/glm-5.3-flash`、专用默认提示词、`temperature=0.2`、`maxTokens=8192`。
- 生产 DeepSeek profile 是 `opencode-go/deepseek-v4-flash-vision-exp`、专用默认提示词、`temperature=0.2`、`maxTokens=8192`。

## 生产专用配置复现结果

| profile | 指定媒体 | 纯红对照图 | 结论 |
|---|---|---|---|
| Qwen `qwen3.8-flash` | 约十几秒后返回固定 `IMAGE_READER_PROVIDER_FAILED` | 17 秒成功返回观察 | qwen3.8 的结果随输入变化；现有 qwen3.8 实验没有唯一确认触发因素。 |
| GLM `glm-5.3-flash` | 约十几秒后返回固定 `IMAGE_READER_PROVIDER_FAILED` | 调用在 60 秒内没有完成，调用命令终止 | GLM 路径还存在响应可用性问题；当前证据不能把 GLM 失败唯一归因于图片内容。 |
| DeepSeek `deepseek-v4-flash-vision-exp` | 23 秒成功返回完整观察 | 未执行 | DeepSeek 当前路径可以处理指定媒体；该结果不是 10:53 历史模型证据。 |
| 内网 OpenAI 兼容模型 | 生产时间线在 10:56:51 后成功 | 未执行 | 用户切换活动配置后恢复了该媒体的读取能力。 |

- 默认 `qwen3.7-plus` 对照配置读取同尺寸噪声图成功，读取原图、重新编码原图和缩小原图失败。
- qwen3.8 专用 profile 的纯红对照图成功排除该 profile 的 Provider、凭据、Attachment Store 和模型路由全部不可用。
- qwen3.7 默认 profile 在保留原图可见内容但删除 PNG 元数据或显著降低像素尺寸与字节量后仍失败。该结果只支持 qwen3.7 路径的内容相关推断，不能替代 qwen3.8 专用配置实验。

## 最终根因链

1. qwen3.8 runtime Provider 对指定媒体产生 runtime failure finish；现有固定文案不能区分 `error` 与非调用者 `aborted`。纯红对照图返回成功确认输入相关性，但没有唯一确认 qwen3.8 的触发因素。qwen3.7 的变体实验另行支持该模型路径的可见内容相关推断。
2. GLM runtime Provider 对指定媒体产生 runtime failure finish；现有固定文案不能区分 `error` 与非调用者 `aborted`。对照图调用在 60 秒内没有完成；GLM 当前至少存在响应可用性问题。
3. `@deepseek-ai/dsh-llm` 的 `LlmFailure` 已经包含 `message`、`code`、可选 `status`、可选 `providerRetryAfterMs` 和可选 `requestId`。
4. `src/host/image-reader/image-reader-service.ts` 的 `observation()` 收到 error finish 或非调用者 abort finish 后没有保存 `value.reason.failure`，只抛出固定 `IMAGE_READER_PROVIDER_FAILED` 文案。
5. `src/host/cli/route.ts` 只转发 `ImageReaderError.code` 与 `ImageReaderError.message`；`scripts/cli/harness-comfyui.mjs` 只输出这两个值。因此 qwen3.8 输入相关终止、qwen3.7 内容相关终止、GLM 响应问题及其具体 Provider failure 都显示为同一固定错误。
6. 生产日志没有记录图片读取 Provider failure，生产 Settings 没有记录单次调用 profile。10:53 的底层 Provider code、message、status、request ID 和唯一模型已经无法事后恢复。
7. Client 选择已持久化 B 时只更新页面 `activeProfile`；Host 的 `activeProfileId` 仍为 A。页面关闭后局部 B 状态被卸载，下一次图片读取和重新打开的设置页继续使用 A。
8. 当前状态模型把“实际生效配置”和“当前编辑配置”合并在同一变量和同一下拉控件中。保存、选择已有配置和创建未保存草稿因此共享了错误的激活规则。

## 修复方向

- runtime finish failure 必须把 `LlmFailure` 字段白名单和本次活动 profile 的允许输出字段快照保存在 `ImageReaderError` 中。
- 字段白名单只包含 `LlmFailure.code`、可选 `status`、可选 `providerRetryAfterMs` 和可选 `requestId`；不受信任的 `LlmFailure.message` 不进入异常属性、CLI、Tool Result 或 Host 日志。
- runtime failure 文案必须以有界单行格式包含 profile、Provider、模型、温度、最大输出 Token 数、finish kind 和白名单 Provider failure 字段。
- CLI route 与 CLI executable 可以继续使用现有 `{code,message}` 合同；具体文案会自然进入生产 Session 的 shell Tool Call 输出。
- 直接 `inspect_image` Tool 与 managed CLI 必须显示相同文案。
- 修复不得自动切换模型、自动重试或根据图片语义选择 profile。
- 已持久化 B 的选择必须调用专用激活 Remote；Host 必须只修改 `activeProfileId` 并保持全部配置值和凭据不变。
- 保存 A 或新建/复制草稿 C 后切换 B时，保存请求必须携带最终 `activateProfileId: B`，Host 必须使用一次 Settings 替换完成保存和激活。
- 保存请求必须携带 `operation: create | update`；Host 必须在进入设置修改队列的队首后验证草稿来源和最终激活目标，任何不存在或冲突都不得产生写入。
- Client 必须分开维护权威 `persistedConfiguration`、`editorDraft`、`draftOrigin`、`dirty`、`pendingIntent` 和 `pendingOperation`。
- 新建或复制未保存 C 时，页面必须明确显示 C 尚未生效以及当前图片读取仍使用的配置；离开页面后草稿被丢弃，重新进入时加载 Host 当前活动配置。
