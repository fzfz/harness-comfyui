# `/comfyui-image-review` 视觉模型调用失败进度记录

## 会话：2026-09-03

### 阶段 2：恢复生产历史配置

- **状态：** 进行中
- **已完成动作：**
  - 读取 `diagnosing-bugs`、`planning-with-files` 和 `stop-that-shit` Skill。
  - 读取 `docs/agents/worktree-development.md`。
  - 从提交 `77d0ed8e30bf6428e038ecbd54bf58e5f1dbf291` 创建独立 worktree 和分支。
  - 记录用户提供的 run ID、媒体路径、错误码和错误文案。
  - 搜索 `IMAGE_READER_PROVIDER_FAILED`、CLI 入口、服务实现、测试文件和系统文档。
  - 确认 CLI 必须依赖 managed foreground shell 提供的 loopback endpoint 和 capability；当前普通终端没有该环境。
  - 确认用户精确错误文案来自 runtime stream 的 error/aborted finish 分支，并确认该分支丢弃底层 Provider failure 信息。
  - 从生产生命周期代码确认 Harness 日志的实际路径。
  - 检查生产 Harness 日志；该日志早于用户报告时间停止更新，且没有本次错误记录。
  - 确认生产 Desktop 自 05:48 持续运行，并定位图片读取设置持久化文件。
  - 使用 Ruby YAML 标准库确认图片读取设置命名空间和配置数量，没有输出凭据值。
  - 读取当前活动配置的非凭据字段，并确认指定媒体的 PNG 签名、大小和分辨率有效。
  - 对比生产部署源码与 worktree 基线，并根据设置文件时间确认当前活动配置是在报错后变更的。
  - 完整读取 ComfyUI 工作台预设与项目 Skill 开发规范，确认真实 managed CLI 复现和语义审查要求。
  - 读取领域上下文及系统架构、配置、启动、测试、目录和技术栈文档；输出过长，后续按单文件重新读取以保证完整性。
  - 完整重读 `CONTEXT.md`；`docs/system/architecture.md` 的合并输出仍被截断，改为按行区间读取。
  - 完整重读 `docs/system/architecture.md` 的两个行区间，确认 managed CLI、ImageReaderService 和 runtime/OpenAI 兼容适配器职责边界。
  - 完整读取 `docs/system/configuration.md` 和 `docs/system/startup.md`，确认默认 runtime 模型、Settings 热应用和开发 Desktop 隔离规则。
  - 完整读取 `docs/system/testing.md`、`docs/system/directory-structure.md` 和 `docs/system/technology-stack.md`，确认回归测试 seam 与最终门禁。
  - 验证 `.git` 是 linked-worktree 文件，主 checkout 的 `.env`、`node_modules` 和 DSH Desktop 底座存在，候选 Skill 目录位于当前 worktree，开发 Desktop 初始状态为 stopped。
  - 以前台 `pnpm dev:start` 启动完整隔离开发 Desktop，并从第二终端确认状态与 Host 启动日志。
  - Computer Use 两次失败后切换到 in-app Browser，并完成本地 Browser 连接。
  - 打开隔离 Desktop 的本地 Web UI并选择产品 Workspace；确认项目 Preset 和默认 Agent 模型已加载。
  - 关闭首次启动声明，并确认可以创建非敏感最小 PNG 作为第一层复现输入。
  - 创建纯红最小 PNG；首次使用 placeholder 定位 composer 失败后，通过 DOM 检查确定正确控件语义。
  - 通过真实 DSH Agent、项目 Skill 和 managed CLI 成功读取最小 PNG，并展开保存精确 CLI 输入输出证据。
  - 在同一隔离 Desktop 中重放用户媒体，复现精确 `IMAGE_READER_PROVIDER_FAILED` 错误码和固定错误文案。
  - 本地查看用户媒体并记录其明确可见的成人性交内容，作为后续输入变量实验的候选差异。
  - 创建同尺寸无语义图、同尺寸重新编码原图和缩小原图三个单变量诊断输入。
  - 接受用户纠正：生产服务对不同模型存在专用配置，默认 `qwen3.7-plus` 结果不能代表 10:53 生产现场。
  - 将默认模型复现和单变量结果降级为对照证据，暂停根因结论，转入历史配置恢复。
- **已创建文件：**
  - `.planning/image-review-provider-failure/task_plan.md`
  - `.planning/image-review-provider-failure/findings.md`
  - `.planning/image-review-provider-failure/progress.md`

## 测试结果

| 测试 | 输入 | 预期 | 实际 | 状态 |
|---|---|---|---|---|
| 用户提供的生产调用 | 10:53 历史模型专用配置与指定 PNG 文件 | 返回逐图观察结果 | 返回 `IMAGE_READER_PROVIDER_FAILED` | 待按历史配置独立复现 |
| 隔离 runtime 最小 PNG | 64×64 纯红 PNG，省略 `prompt` | 返回观察结果 | `opencode-go/qwen3.7-plus` 返回观察结果 | 通过 |
| 隔离 runtime 用户媒体 | 默认 `qwen3.7-plus` 与 832×1216 PNG，省略 `prompt` | 返回观察结果 | `IMAGE_READER_PROVIDER_FAILED`，精确固定文案 | 对照失败，不能代表历史配置 |

## 错误日志

| 时间 | 错误 | 次数 | 处理结果 |
|---|---|---:|---|
| 2026-09-03 | `IMAGE_READER_PROVIDER_FAILED` | 1 | 待建立独立复现命令。 |
| 2026-09-03 | `sed: scripts/desktop/runtime.mjs: No such file or directory` | 1 | 改为先枚举 `scripts/desktop/` 文件。 |
| 2026-09-03 | `Cannot find module 'yaml'` | 1 | 不安装依赖，改用 Ruby YAML 标准库。 |
| 2026-09-03 | `Sky Computer Use service startup request failed` | 1 | 查询应用标识后重试；失败则切换为现有 Desktop 自动化 seam。 |
| 2026-09-03 | `Sky Computer Use service startup request failed` | 2 | 停止重试 Computer Use，检查真实 Desktop 自动化测试入口。 |
| 2026-09-03 | `rg: scripts/testing: No such file or directory` | 1 | 使用 `rg --files tests/desktop` 返回的实际测试入口。 |
| 2026-09-03 | Browser composer placeholder locator 无匹配 | 1 | 读取最新 DOM 后重新选择 locator。 |
| 2026-09-03 | 默认模型复现不符合生产历史配置要求 | 1 | 暂停结论，恢复 10:53 活动 profile、模型及模型专用配置后重放。 |

## 5 问恢复检查

| 问题 | 答案 |
|---|---|
| 当前阶段是什么？ | 阶段 2：恢复生产历史配置。 |
| 后续阶段是什么？ | 按历史配置复现并最小化、假设检验、根因确认、修复方案。 |
| 当前目标是什么？ | 确认指定生产错误的根因并提交等待批准的修复方案。 |
| 已获得什么结论？ | 参见 `findings.md`。 |
| 已完成什么动作？ | 参见本文件的阶段 1 记录。 |

### 阶段 3 至阶段 5：专用配置复现、根因确认与方案设计

- **状态：** 修复方案已通过独立语义审查，等待用户批准实施
- **已完成动作：**
  - 从生产 Settings 恢复 Qwen、GLM 与 DeepSeek 的 Provider、模型、默认提示词、温度和最大输出 Token 数，没有读取凭据值。
  - 从生产 Session 恢复 10:19 至 10:57 的失败、设置保存与成功时间线。
  - 确认 Settings 没有活动 profile 历史，生产记录不能唯一证明 10:53 使用 Qwen 或 GLM。
  - 记录用户提供的历史事实：当时 Qwen 与 GLM 都出现问题，DeepSeek 当时没有测试。
  - 使用 Qwen 生产专用配置读取指定媒体并复现固定错误。
  - 使用 Qwen 生产专用配置读取纯红对照图并取得成功观察。
  - 使用 GLM 生产专用配置读取指定媒体并复现固定错误。
  - 使用 GLM 生产专用配置读取纯红对照图；调用在 60 秒内没有完成并由命令终止。
  - 使用 DeepSeek 生产专用配置读取指定媒体并取得成功观察。
  - 读取 `LlmFailure` 类型定义与 `normalizeLlmFailure()` 实现，确认 failure 字段是 Provider-neutral 可序列化诊断数据。
  - 确认 `observation()` 丢弃 `finish.reason.failure`，现有单元测试只断言稳定错误码。
  - 创建 `.planning/image-review-provider-failure/implementation-plan.md`。
  - 按 worktree 开发规范执行 `pnpm dev:stop`，并确认 `pnpm dev:status` 返回 `stopped`。
  - 第一轮语义 Reviewer 指出 Qwen3.8 证据外推、Provider message 与禁止来源冲突、边界条件不确定三个阻断项。
  - 第二轮语义 Reviewer 指出允许字段语义保证、字符串处理顺序和真实模型判定三个阻断项。
  - 第三轮语义 Reviewer 指出未配对 UTF-16 代理项、现场 finish kind、允许字段表述和部分输出超时四个阻断项。
  - 第四轮语义 Reviewer 验收第四版方案，结论为通过且没有合同级阻断项。

## 更新后的测试结果

| 测试 | 输入 | 实际 | 结论 |
|---|---|---|---|
| Qwen 生产专用配置 | 指定媒体 | `IMAGE_READER_PROVIDER_FAILED` | 复现通过 |
| Qwen 生产专用配置 | 64×64 纯红 PNG | 成功返回观察 | Qwen 服务整体可用 |
| GLM 生产专用配置 | 指定媒体 | `IMAGE_READER_PROVIDER_FAILED` | 复现通过 |
| GLM 生产专用配置 | 64×64 纯红 PNG | 调用在 60 秒内没有完成，命令终止 | GLM 路径存在独立响应问题 |
| DeepSeek 生产专用配置 | 指定媒体 | 成功返回观察 | 当前可用对照 |

## 5 问恢复检查（更新）

| 问题 | 答案 |
|---|---|
| 当前阶段是什么？ | 等待用户批准实施。 |
| 后续阶段是什么？ | 用户批准后才进入测试先行的代码实施。 |
| 当前目标是什么？ | 交付证据分级明确、可执行、未经实施的修复方案。 |
| 已获得什么结论？ | `observation()` 丢弃 Provider failure 是确定的应用根因；qwen3.8 结果具有输入相关性，qwen3.7 变体实验支持该模型的内容相关推断，GLM 还存在响应可用性问题。 |
| 已完成什么动作？ | 已完成生产时间线恢复、三种生产专用配置复现、对照实验和实施计划撰写。 |

### 阶段 6：已批准方案实施与最终候选验证

- **状态：** 进行中
- **已完成动作：**
  - 完成 Provider failure 白名单、单行有界诊断、调用者取消区分、Tool 与 CLI 传播的测试先行实现。
  - 完成已保存配置立即激活、新建与复制草稿不生效、保存并切换、删除后继、离开回退、并发删除和请求取消状态机的测试先行实现。
  - 完成保存、激活与删除共享 Host Settings 队列，以及 `TypertRemoteFailure` 业务错误码传播。
  - 把根 `cordis.patch.yml` 的前台 Bash 默认超时从 `60000` 毫秒提高到 `180000` 毫秒；真实模型验收继续显式使用 `60000` 毫秒完成期限。
  - 修复外部 Settings 已激活 B 时普通保存 A 会隐式切回 A 的边界；普通保存现在只更新 A并保持 B 生效，按钮和成功状态同时命名 A与 B。
  - 把错误目录逐字对齐批准方案，并添加字段级文案测试。
  - 使用同一份包含六类禁止来源 sentinel 的实际 runtime failure 覆盖 Service、Tool、挂载 Host Tool、Host CLI route、managed CLI stderr 与 Cordis Host logger sink。
  - 最终候选真实 Qwen 调用在 60 秒内返回 `provider-error-finish`，failure code 为 `SERVER`。
  - 最终候选真实 GLM 调用在 60 秒内返回 `provider-error-finish`，failure code 为 `PI_AI_ERROR`。
  - 最终候选真实 DeepSeek 调用在 60 秒内返回 `stop-success`，stdout 为四属性 JSON，stderr 为空。
  - `pnpm dev:logs` 的禁止来源搜索没有匹配；`pnpm dev:stop` 与后续 `pnpm dev:status` 均确认隔离 Desktop 已停止。
  - 独立代码 Reviewer 与独立语义 Reviewer 当前均通过；Spec Reviewer 要求的端到端禁止来源证据已经补齐，等待复审。
- **证据文件：** `.planning/image-review-provider-failure/model-acceptance.md`

### 配置选择交互补充调查与方案修订

- **状态：** 修订方案等待最终独立语义复核；业务代码和正式测试尚未修改。
- **已完成动作：**
  - 接受用户纠正：选择已持久化配置 B 应立即生效；新建或复制未保存配置 C 不生效；未保存草稿离开页面时必须提示或回退。
  - 读取 `ImageReaderSettingsPage` 的 `selectProfile()`、`save()`、新建、复制、放弃和删除状态转换。
  - 读取 `ImageReaderRemoteService` 的保存、删除和设置修改队列；确认 Host 没有独立激活 Remote。
  - 读取 `ImageReaderService.inspect()`；确认图片读取只使用 Host 持久化 `activeProfileId`。
  - 读取已安装 Settings Shell 的关闭按钮、Escape、遮罩和左侧栏目导航实现；确认 Shell 直接卸载设置页，页面没有统一离开拦截 Interface。
  - 追溯提交 `6cd6351` 和后续单配置保存方案；确认“保存才激活”是遗留 Interface 设计，不是偶发事件丢失。
  - 在 `.planning/image-review-provider-failure/diagnostics/existing-profile-selection.test.ts` 建立两分支诊断反馈环。
  - 第一次诊断测试因相对导入路径多一层 `../` 而无法收集测试；修正为到仓库根目录的三层路径后重新运行。
  - 诊断测试稳定得到一项失败和一项通过：选择已持久化 B 后实际 ID 仍为 A；新建未保存 C 后 Host 仍使用 A。
  - 三名独立设计队员分别提交最小 Interface、通用命令 Interface 和常用交互 Interface。
  - 拒绝引入 Settings revision 的通用命令方案；现有 Settings 没有跨写入者 CAS，当前缺陷不需要扩展持久化 schema。
  - 选择 `activateProfile(profileId)` 与 `saveProfile(..., activateProfileId)` 组合 Interface；无修改切换只修改活动 ID，保存并切换由一次 Host Settings 替换完成。
  - 选择未保存草稿离开时回退到 Host 实际生效配置；不修改外部 Settings Shell 依赖。
  - 更新 `implementation-plan.md`、`task_plan.md` 和 `findings.md`，加入完整 Client 状态机、Host Interface、测试矩阵和真实 Desktop 验收序列。
  - 最终语义 Reviewer 首轮复核不通过；Reviewer 指出普通保存/放弃、删除确认、取消和并发删除分支未闭合，保存请求不能区分新建与更新，以及动态按钮和错误文案缺少明确对象。
  - 为保存请求增加 `operation: create | update`，防止覆盖同 ID 配置或复活并发删除的配置；补齐无效 ID、目标不存在和零写入合同。
  - 补齐普通保存、普通放弃、删除确认、提交前取消、草稿来源被删除和待切换目标被删除的 Client 状态转换。
  - 固定“当前生效配置”、草稿状态、切换状态、动态门禁按钮、取消状态、并发删除状态和新增错误码文案，等待第二轮独立语义复核。
  - 最终语义 Reviewer 第二轮复核不通过；Reviewer 指出“放弃后失败却恢复草稿”、同一配置不存在错误码不能区分更新来源与激活目标、Remote Adapter 可能用本地取消覆盖 Host 已提交成功三个阻断项。
  - 把放弃并切换、放弃并删除改为先丢弃草稿；后续 Host 失败或取消时加载实际生效配置，不恢复已经放弃的草稿。
  - 分别定义 `IMAGE_READER_PROFILE_UPDATE_TARGET_NOT_FOUND`、`IMAGE_READER_PROFILE_ACTIVATION_TARGET_NOT_FOUND` 和删除专用 `IMAGE_READER_PROFILE_NOT_FOUND`，并固定 Host 校验顺序和 Client 文案。
  - 明确写操作 Remote Adapter 只在发出请求前检查本地取消；请求发出后必须采用 Host 权威成功结果，不能在成功结果返回后再次用本地 AbortSignal 抛出取消。
  - 最终语义 Reviewer 第三轮复核只剩一项测试清单缺口：提交后取消测试只点名 `activateProfile`，没有点名 `saveProfile` 和 `deleteProfile`。
  - 把 `tests/unit/client-plugin.test.ts` 的强制矩阵扩展为 save、activate、delete 三个写 Remote Adapter，并要求每个入口验证本地取消不能覆盖 Host 随后返回的已提交成功配置。
  - 最终语义 Reviewer 第四轮复核通过；修订方案没有合同级阻断项。

## 配置选择诊断测试结果

| 测试 | 输入 | 期望 | 实际 | 状态 |
|---|---|---|---|---|
| 已持久化配置选择 | 活动 A；选择已保存 B；不点击保存；关闭页面 | Host `activeProfileId` 为 B | Host `activeProfileId` 仍为 A | RED，确认缺陷 |
| 新建草稿离开 | 活动 A；新建 C；不保存；关闭并重新打开页面 | C 不生效；页面回到 A | Host 仍为 A；重新挂载显示 A | 通过，确认基线 |

## 配置选择方案比较

| 方案 | 结果 |
|---|---|
| 只新增 `activateProfile`，保存后再激活 | 不采用；保存成功但激活失败会产生半完成状态，“保存并切换”需要两次提交。 |
| 单一配置命令与 revision | 不采用；扩大合同和 schema，但当前 Settings 没有 CAS，不能提供所声称的跨写入者保证。 |
| `activateProfile` 加带最终活动 ID 的 `saveProfile` | 采用；已有配置选择只改活动 ID，保存并切换一次原子提交，Interface 保持具体。 |

### 配置测试按钮范围决定

- **状态：** 已撤回，不进入实施方案。
- **已完成动作：**
  - 用户明确判断设置页内置图片测试按钮和 `run_id` 测试来源属于过度设计。
  - 计划继续只覆盖 Provider 失败信息丢失与配置保存、加载、切换状态机缺陷。
  - 记录一次工具编排语法错误：重新读取本地 Skills 时，JavaScript 输入包含意外字符并触发 `SyntaxError`；随后使用无拼接的命令成功完整读取两个 `SKILL.md`。
  - 独立语义 Reviewer 指出授权记录把三项撤回范围误写成“两项功能”；计划已改为逐项列出配置测试按钮、内置测试图片和 `run_id` 测试图片来源，并写明“三项功能”。
  - 独立语义 Reviewer 复核通过：三项撤回功能只出现在“非本次目标”和“已获得的授权”，实施步骤、测试矩阵与验收清单没有残留要求。

### 阶段 6：实施修复

- **状态：** 进行中。
- **已获得授权：** 用户通过 `implement` Skill 授权实施已审定方案、执行 TDD、完成验证和代码审查，并提交当前分支；用户尚未授权推送、发布或部署。
- **已确认测试 seam：** 共享图片读取 Remote 合同、`ImageReaderSettingsPage` 可见交互、`ImageReaderService.inspect()`、`inspect_image` Tool、managed CLI 与完整 Desktop 设置页。
- **TDD 记录：** `activateProfile()` 首个 Host Remote 测试先因方法不存在而稳定失败，最小实现后通过。
- **TDD 记录：** 原子“保存 A并激活 B”测试先观察到旧实现仍激活 A，扩展保存合同与 Host 合并逻辑后通过；随后更新既有 Remote 方法清单和 create/update fixture 以符合新合同。
- **错误记录：** 第一次修改 `src/image-reader/remote.ts` 时两个类型导入被补丁落到文件末尾；在运行类型检查前通过源码检查发现并移回导入列表。
- **TDD 记录：** Client 首个“选择已保存配置立即生效”测试先确认旧页面没有调用激活 Remote，随后重建 `persistedConfiguration`、`editorDraft`、`draftOrigin`、`dirty`、`pendingIntent` 与 `pendingOperation` 状态机并转绿。
- **TDD 记录：** Runtime failure 首个白名单测试先确认 `ImageReaderError` 没有结构化 Provider context，随后加入固定字段规范化、完整单行文案和 error/aborted 分支并转绿。
- **验证记录：** 图片读取设置、Host Remote、Client adapter、Service、Tool、CLI route 和 managed CLI 的 169 项聚焦测试通过；全部 865 项 unit 测试与 43 项 integration 测试通过。
- **错误记录：** 第一次执行 `pnpm test:coverage` 时新增的三个设置页文案/交互函数没有测试调用，使函数覆盖率为 99.74% 并触发 100% 门禁。补充待切换目标删除、普通放弃和删除门禁继续编辑测试后，910 项 unit/integration 测试通过，函数覆盖率恢复为 100%。
- **用户补充要求：** `comfyui-image-review` 没有显式设置 `timeoutMs` 时继承产品前台 Bash 默认值 `60000` 毫秒。用户要求提高该默认值，候选根配置现统一设置为 `180000` 毫秒；真实模型验收的单次 `60000` 毫秒分类边界保持不变。
- **TDD 记录：** Profile 合同测试先因根 `cordis.patch.yml` 没有 `bash-sandbox.config.timeoutMs: 180000` 而失败，修改产品配置、边界检查和 fixture 后通过。
- **实机错误记录：** 使用目录占用隔离 Settings lock 路径模拟激活持久化失败时，Host 保持 DeepSeek 实际生效，但设置页收到通用 `IMAGE_READER_SETTINGS_REQUEST_FAILED`，没有收到 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`。
- **根因与修复：** 普通 `ImageReaderError` 没有使用 Typert 提供的业务失败载体，carrier 因此返回通用 Remote 异常码。Host 设置修改队列现把已知 `ImageReaderError` 转换为 `TypertRemoteFailure`；新增失败载体断言与 Client 错误码传播测试通过。
- **Desktop 验收：** 当前候选通过 `pnpm dev:start` 前台启动、第二终端 `pnpm dev:status` 与 `pnpm dev:logs` 检查；物化后的 profile 包含 `bash-sandbox.config.timeoutMs: 180000`，结束后 `pnpm dev:status` 返回 `stopped`。
- **Desktop 自动化：** `pnpm test:desktop` 的两项完整 Desktop 测试全部通过，其中图片读取设置流程覆盖已保存配置立即激活、新建未保存配置离开回退、三种未保存切换选择和删除后继配置。
- **Desktop 故障注入：** Settings lock 路径被隔离目录占用时，选择 Qwen 的激活请求返回 `IMAGE_READER_SETTINGS_ACTIVATE_FAILED`，页面选择器与 Host 实际活动配置继续保持 DeepSeek；故障注入目录已经删除。
- **Desktop 下一次读图：** 激活失败后的下一次 CLI 读图返回 `provider=opencode-go`、`model=deepseek-v4-flash-vision-exp` 和预期短观察，证明失败没有产生本地假切换。
- **Desktop 删除与默认超时：** 删除当前 DeepSeek 配置后，页面从三份已保存配置变成 Qwen 与 GLM 两份，并把 GLM 设为活动配置；随后一次没有显式 `timeoutMs` 的前台 Bash Tool 调用在产品默认超时内成功返回 `model=glm-5.3-flash` 和预期短观察。
- **Desktop 日志：** `pnpm dev:logs` 没有包含两次短观察标记或对照图片文件名，确认本次实机输入没有进入 Host 日志。
- **真实模型最终验收：** 使用生产配置中的非凭据字段重新建立 Qwen、GLM 与 DeepSeek 调用条件；Qwen 返回 `provider-error-finish`，GLM 返回 `provider-error-finish`，DeepSeek 返回 `stop-success`。每次正式分类调用都显式使用 `timeoutMs: 60000`，完整证据记录在 `model-acceptance.md`。
- **独立复审：** 独立 Standards Reviewer、Spec Reviewer 与语义 Reviewer 均已通过最终候选，没有阻断项。
- **完整质量门禁：** `pnpm quality` 通过 924 项 unit/integration、39 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
