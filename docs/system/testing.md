# 测试规范

## 系统验证

独立 linked worktree 中的完整 Desktop 开发、配置变更和界面联调使用：

```sh
pnpm dev:start
pnpm dev:status
pnpm dev:logs
pnpm dev:stop
```

生产 checkout 的完整 Desktop 使用 `pnpm prod:*`。Agent 不得使用生产入口验证 linked worktree 中的未发布源码。只需要 Web Host 时使用 `pnpm web:*`；Web Host 验证不能代替真实 Desktop 验收。

生产、开发、Web Host 进程和配置隔离的自动化验证使用：

```sh
pnpm prod:test
```

`prod:test` 使用临时目录和端口覆盖 Desktop 开发与生产实例、跨进程端口声明、双 worktree 并发、PID 与端口状态写入失败清理、restart、异常退出、worktree `.env` 链接与独立依赖目录、Web Host 六项生命周期和真实 Client ModuleLoader。真实界面验收使用 `docs/agents/worktree-development.md` 的完整 Desktop 流程。

## 候选 Desktop 验证

tests/support/desktop-context.mjs 使用 config/desktop-baseline.json 选择 anywhere Stable workspace。DSH_DESKTOP_TEST_SOURCE 只覆盖测试源码位置，测试仍校验固定 commit、Desktop、Harness 与 Electron 版本。宿主模块通过该 workspace 的 package.json 创建 Node createRequire 后解析。

候选设置页通过重新编辑推理等级，将旧模型记录的 `reasoning.efforts` 转换为 `reasoningEfforts`。只打开设置页不会转换旧记录。设置页不再提供逐模型默认推理等级控件；用户在会话中选择推理等级。

自定义 Provider 回归测试使用 `tests/fixtures/custom-provider-reasoning.json` 中的旧配置样本，通过真实设置页转换硅基流动的两个模型和 cliproxy 的四个模型。测试核对六个模型保存后的 `reasoningEfforts`，并确认其他模型属性保持原值。两个未配置推理等级的模型必须保留原记录，且不包含 `reasoningEfforts`。测试随后点击“新建会话”，在新会话菜单中为六个已配置模型逐一选择 Max。

## 测试命令、专项验收与历史记录

Desktop 测试必须检查 Profile 的 package.json 声明 harness-comfyui 来源、dsh.profile.bundles 包含该插件，并核对实际 node_modules 链接指向本次构建的安装产物。启动测试同时检查进程组入口、监听端口归属及本次启动 run 的 Renderer 健康完成事件。旧运行的健康事件或只有端口监听不能使测试通过。

| 命令 | 范围 |
| --- | --- |
| `pnpm test:unit` | Host、Agent、Client、配置和测试辅助模块 |
| `pnpm test:integration` | Host 插件组合与逐媒体同源 HTTP 路由 |
| `pnpm test:desktop` | 使用临时 Desktop HOME 启动真实 DSH Desktop，确认 Profile 加载本次插件安装产物、DSH home 的 .env 链接到测试环境文件、两个项目 Preset 在外部 Workspace 中读取项目 Skills；确认图片读取配置保存后可重新读取，无效 URL 和端口显示对应错误；确认 Provider 保存后重开仍保留设置、媒体在应用内 Modal 显示、真实 DSH bash 取得项目 CLI capability |
| `pnpm test:contract` | package、Git 跟踪、本地发布门禁和安全合同 |
| `pnpm prod:test` | Desktop Profile 安装与 Electron 生命周期、worktree 链接、Web Host start/stop/restart/status/health/logs、PID、端口和真实 Client ModuleLoader |
| `pnpm test:prototype` | 静态原型结构与数据关系 |
| `pnpm test:coverage` | unit 与 integration 覆盖率 |
| `pnpm quality` | 依赖检查、类型检查和全部必需测试 |
| `pnpm verify:comfyui-workflows -- --source-url <数据源服务URL> --source-port <端口> --instance-id <数据源服务实例ID> --output <结果JSON路径>` | 当前数据源服务全部 Workflow 模板、`config/verification/comfyui-workflow-parameter-support.json` 精确参数支持基线、目标实例实时 `/object_info`、组合参数编译、官方页面导出和缓存 miss→hit 一致性；省略 URL 或端口时使用本机默认值 |

覆盖率阈值由 `config/quality-gates.json` 唯一定义：lines 91%、functions 100%、statements 88%、branches 79%。

v0.42.1 的生产测试覆盖受管 Provider 与图片读取配置的成功物化、目标未受管记录保留、凭据缺失、配置无效、路径越界、启动前失败、运行中重复启动不写入，以及 `dev:status`、`dev:logs`、`dev:stop` 不触发物化。当前版本的完整测试数量、覆盖率和依赖审计结果见[发布说明](../releasenotes.md#验证与依赖)。

会话删除测试必须确认目标 Session 不可再读取，其他 Session 保持可读。模型请求测试必须确认普通 Session、子 Session 与图片读取请求携带各自真实 Session ID。

新功能和缺陷修复必须覆盖成功、拒绝、清理和错误分支。语义文档由独立 Reviewer 阅读验收，不使用脚本判断语义质量。

数据源服务自动化测试启动临时 HTTP 和 HTTPS 服务并执行插件发行包中的 `scripts/source-client/imagegen-semantic-query.mjs` 与 `scripts/source-client/imagegen-comfyui-source-read.mjs`。测试记录并断言 discovery 请求以及两个客户端在 discovery 之后发送的每个 HTTP 请求的 method、path 和 body。测试同时断言每个被执行客户端的 stdout、stderr 和退出码。每个连接失败测试直接执行该测试对应的生产客户端。Host adapter 测试通过注入的子进程调用函数断言 `CatalogCli` 和 `GenerationSourceCli` 在每次请求前读取 `harness-comfyui-source` Settings 中最新的数据源服务 URL 和端口；真实数据源服务验收使用两个 Host adapter 的实际子进程执行器。

统一设置页测试直接渲染现有 `ImageReaderSettingsPage`，确认切换至“数据源服务”并返回后保留未保存的图片读取草稿。数据源设置测试覆盖 HTTP 与 HTTPS scheme、IPv4 地址、IPv6 地址、主机名、端口最小值、端口最大值、低于最小值的端口、高于最大值的端口，以及包含内嵌端口、用户名、密码、非根路径、query string 或 fragment 的 URL；测试还覆盖保存成功和保存失败。预设提示测试覆盖 Settings 快照仍在加载、未保存地址、连接成功、连接失败和设置变化后重新执行数据源服务连接检查五个分支，并确认不依赖数据源服务的 Preset 不执行数据源服务连接检查。

真实数据源服务验收必须使用插件内置客户端和 Host 的 `CatalogCli`、`GenerationSourceCli` 连接已部署服务，完成实时 discovery、Base Model Search 与 Resolve、ComfyUI 实例 Search、实例读取和 Workflow bundle 读取。验收不得读取或执行数据源仓库中的文件，也不得使用测试自建 JSON 代替已部署服务的响应。

Repository Skills 可见性测试必须在当前 checkout 外创建临时 Workspace。测试在该 Workspace 中创建名称为 `comfyui-generate`、描述唯一的同名 Skill，并在受控的 `DSH_AGENTS_HOME` 中创建名称和描述均唯一的用户 Skill。未传入 `agentPreset` 且创建后 `agentPreset` 等于 `harness-comfyui-cli-candidate` 的 Session、显式设置 `agentPreset: harness-comfyui-cli-candidate` 的 Session，以及显式设置 `agentPreset: harness-comfyui-iteration` 的 Session，都必须通过 `remote.skills.list()` 返回八个 Repository Skills；每个返回项的名称和描述必须分别与当前 checkout 中对应 Repository Skill 的名称和描述一致，并且不得返回上述两个测试 Skill。显式设置 `agentPreset: standard` 的 Session 必须返回外部 Workspace 中的 `comfyui-generate` Skill 和受控用户 Skill，且不得返回当前 checkout 中的 `comfyui-generate` Skill。测试还必须遍历产品运行时注册的每个 Preset ID；除 `harness-comfyui-cli-candidate` 和 `harness-comfyui-iteration` 之外，每个 Preset 对应 Session 的 Skill 列表均不得包含任何名称和描述同时匹配当前 checkout Repository Skill 的返回项。

真实模型验收必须分别覆盖以下三种 Session 创建方式：不传入 `agentPreset` 并确认创建后的 `agentPreset` 等于 `harness-comfyui-cli-candidate`，显式设置 `agentPreset: harness-comfyui-cli-candidate`，以及显式设置 `agentPreset: harness-comfyui-iteration`。每种 Session 的模型都必须读取 `local-image-reader/SKILL.md` 和 `references/image-inspection-cli.md`，再通过前台 shell Tool Call 执行 `image inspect --stdin`。实施任务的最终回复必须记录每个 Session 的 Workspace、Preset、模型、Skill 实际路径、参考文档实际路径、CLI stdin、退出码、stdout 和 stderr。

v0.39.4 的最终候选通过完整 `pnpm quality`：925 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%。Harness 锁文件的依赖审计未返回漏洞公告；Desktop 的 `image-size 1.2.1` 保留已记录的两项高危公告 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq`，用户已明确允许安装。部署验收必须确认受控安装产生 Desktop 的 `node_modules/node/bin/node`，并确认该程序返回 `v24.9.0`。

v0.39.3 的最终候选通过完整 `pnpm quality`：925 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%。Harness 锁文件的依赖审计未返回漏洞公告；Desktop 锁文件中 `image-size 1.2.1` 的两项高危公告 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 已记录，用户已明确允许安装。Desktop 的 711 项测试全部通过，类型检查与构建也通过。真实 Desktop 测试通过设置页保存六个模型的推理等级，进入新会话后核对 Low、Medium、High、Max 四档选项，并为六个模型分别选择 Max，同时确认两个未配置推理等级的模型保留原记录。

v0.39.2 的最终候选在明确排除 `security:advisories` 后通过其余发布门禁：925 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%。`security:advisories` 未取得依赖漏洞结果：npm registry 的 `GET /-/ping`、`POST /-/ping` 以及两个 security API 路径的 GET 均返回响应，但 `POST /-/npm/v1/security/advisories/bulk` 与 `POST /-/npm/v1/security/audits/quick` 通过当前网络配置和强制直连都在 TLS 完成后等待首字节超时。

`node scripts/security/diagnose-advisories.mjs` 先让真实 `pnpm audit` 向本地临时 registry 发送当前 lockfile 的 bulk 请求，再使用同一请求体检查 npm registry 的 DNS、配置网络路线、强制直连路线、HTTP 方法和 security API 路径。该命令只输出请求数量、请求字节数、各阶段耗时、HTTP 状态和故障分类，不输出依赖请求正文或代理地址。

v0.39.1 的最终候选通过完整 `pnpm quality`：924 项 unit/integration、39 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。production 测试覆盖跨进程端口声明、死亡 owner claim 回收、存活 owner claim 保留、损坏 claim 拒绝、共享上游双 Desktop、共享主 `.env` 双 Web context、Desktop 进程组与 Web Host PID 的端口所有权接管、实际端口状态、独立 Desktop 输出目录、子进程提前退出、端口状态写入失败和 PID 写入失败。

Generation 自动化测试使用 fake Source、fake Comfy transport 与临时 SQLite/文件目录覆盖项目 Tool 注册、Source v0.86.1 三字段 TemplateBundle、实例 ID 安全投影、只读模板运行参数检查、普通随机 Seed 数量与单次去重、Run 幂等、状态转换、重启恢复、活动输出节点发现、断开输出节点删除、连接式运行参数解析、目标冲突、不可达候选、bypass 分支、序列化值节点、精确尺寸拒绝、BOOLEAN widget、临时预览过滤、`extra_data.extra_pnginfo.workflow` 提交、媒体分片、逐媒体 Workflow 和 Client 单一投影。模板检查测试覆盖非尺寸参数合同、精确尺寸配对、Selector 配对、preset 映射、带节点后缀的多组候选、非图片辅助 output node 排除、下游独立 resize 或 upscale 覆盖上游尺寸、末端尺寸参数回编译、输入 Workflow 不变、Official compiler 不调用和检查与编译错误一致性。Catalog 自动化测试覆盖 Source v0.86.1 的 `sample_image_urls` 严格映射、非法 URL 拒绝、封面与样例去重、封面预览不改变选择集合、箭头和键盘导航、图片错误状态、焦点恢复、画廊 header/body 高度分配、箭头居中和图片双轴滚动，以及确认后只插入原 `CatalogContext`。真实实例验收使用生产 Source CLI 与 ComfyUI `/object_info`、官方页面 API Workflow 导出、`/prompt` 和 Jobs API 验证当前 Catalog 模板的显式参数编译、异步运行、媒体保存、Actual/API Workflow 参数一致性、图片内容与尺寸，以及实例错误展示。

历史 Generation Run 输入查询测试覆盖 Tool 与 CLI 的单项和批量入口、输入顺序、重复 `run_id`、完整 ID、最少八个 UUID 字符的短 ID、短 ID canonical 完整值返回、当前 Workspace 唯一匹配、其他 Workspace 同前缀隔离、短 ID 无匹配与多匹配逐项错误、单项无效 ID、损坏的 `request_json`、历史请求缺少 `loras` 或 `model`、准备失败、Actual Workflow 文件缺失或无效、未分类文件系统错误脱敏、1 项与 20 项边界、21 项拒绝和取消传播。CLI 集成测试从临时 `node_modules/harness-comfyui/.local/source-cli/harness-comfyui.mjs` 执行构建产物，并确认合法批量请求包含单项错误时仍返回退出码 0。

图片读取自动化测试使用 fake Settings scope、fake Attachment Store、fake LLM Runtime 与 fake Fetch 覆盖 Tool 与 CLI 可选 `prompt` 的省略、原样覆盖、非字符串拒绝、空白拒绝、32768 字符边界与超长拒绝。图片输入测试覆盖 PNG、JPEG、WebP、GIF 的 70% 等比缩放和同格式输出、整数像素取整、最小一像素、EXIF Orientation 保留、alpha 通道保留、动画 GIF/WebP 的帧数、延时与循环次数保留、原图字节不变、输入与输出字节限制、损坏图片和调用取消。两种 Provider 的测试确认只有缩放后的同格式图片进入 Attachment 或 Data URL，模型普通字符串直接成为 `observation`，OpenAI 兼容适配器只解析 Chat Completions 传输外壳，Tool 与 CLI 继续输出四属性 JSON 对象。CLI 自动化测试确认 `image inspect --stdin` 省略 `prompt` 时使用活动配置的 `defaultPrompt`，提供 `prompt` 时只覆盖本次调用。Runtime failure 测试分别覆盖 `error` finish、非调用者 `aborted` finish 和调用者 AbortSignal，验证错误只保留 profile 快照、`LlmFailure.code`、合法 HTTP status、正数 retry-after 与 request ID。字段边界测试覆盖 95、96、97 个 UTF-16 code unit、合法代理项对、未配对代理项、引号、反斜杠、C0/C1 控制字符和 Unicode 行分隔符；Tool、CLI route 与构建后的 managed CLI 测试确认具体诊断保持单行并原样传播。

2026-09-09 的 70% 同格式缩放候选通过完整 `pnpm quality`：1031 项 unit/integration、55 项 contract/security、255 项 production、32 项 prototype 和 2 项 Desktop 测试成功。覆盖率为 statements 93.63%、branches 86.96%、functions 100%、lines 96.19%。Vitest 与 `@vitest/coverage-v8` 的版本为 `4.1.11`；完整依赖和生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。`security:build-scripts` 确认 Sharp 没有增加 lifecycle script。

同一候选的隔离 Desktop 在外部 Workspace 中成功创建省略 Preset、显式工作台 Preset和显式迭代 Preset的三个 Session。省略 Preset 的 Session `session-image-reader-70-1788946260610-1` 使用 `harness-comfyui-cli-candidate`；显式指定工作台 Preset 的 Session `session-image-reader-70-1788946262707-2` 使用 `harness-comfyui-cli-candidate`；显式指定迭代 Preset 的 Session `session-image-reader-70-1788946263772-3` 使用 `harness-comfyui-iteration`。三个 Session 均发现 `local-image-reader`，但 `opencode-go/deepseek-v4-flash` Agent 在第一个模型步骤因月度额度返回 `QUOTA`，没有读取 Skill 文件或执行读图 CLI。补充 Session `session-image-reader-70-1788946318603-1` 确认 `deepseek-official/deepseek-v4-flash` 返回 `MISSING_CREDENTIAL`，补充 Session `session-image-reader-70-1788946347554-1` 确认 `opencode-go/muse-spark-1.2-contributor` 返回 `FORBIDDEN`。因此真实模型验收未通过，现有 Session 没有产生读图 CLI stdin、退出码、stdout、stderr 或视觉模型识别结果。

图片读取设置自动化测试覆盖保存请求只包含当前配置、Host 按原索引更新或向末尾追加、其他持久化配置不变、OpenAI 兼容 API Key 的 `keep`、`replace` 与 `clear`、runtime 保存清除旧凭据、`hasApiKey` 派生、独立激活和独立删除。Host 测试验证保存、激活和删除共用一个 Settings 修改队列；激活只修改 `activeProfileId`，保存可以在一次 `settings.replace()` 中更新或创建草稿并激活另一份配置。测试分别覆盖激活幂等、目标不存在、创建 ID 冲突、更新目标被删除、持久化失败、提交期间取消与提交后成功结果。Host Remote 测试确认已知图片读取设置错误使用 `TypertRemoteFailure` 保留业务错误码；Client adapter 测试确认 Remote 失败结果继续使用该错误码。Remote parser 测试区分闭合 JSON 结构错误与领域值错误；Client 在 Remote 前拒绝 `NaN` 与正负无穷，并在写请求发出后采用 Host 返回的成功配置。

设置页测试覆盖 Host 实际生效配置、Client 编辑草稿、草稿来源、未保存状态、待处理意图和 Host 操作状态。已保存配置没有未保存编辑时，选择另一份已保存配置会立即调用激活 Remote；新建或复制配置不进入生效配置选择器，页面卸载时不发送 Host 写请求。用户有未保存编辑并选择另一份已保存配置时，测试覆盖保存当前修改并切换、放弃当前修改并切换、继续编辑当前配置三条分支；删除测试确认用户明确放弃未保存编辑后，Client 才发送删除请求。失败和取消测试确认保存路径保留草稿与待切换目标，放弃路径不会恢复被使用者丢弃的草稿，外部 Settings 更新会刷新实际生效配置但不会覆盖现有草稿。每个校验错误码的唯一输入项位置、只读状态、操作期间控件禁用、错误总结和下一步文案继续由设置页测试覆盖。

Profile 合同测试固定根 `cordis.patch.yml` 中的前台 Bash 默认超时为 `180000` 毫秒。图片读取真实模型验收仍可以为故障分类显式使用更短的单次 Tool Call 超时；该验收边界不改变没有显式 `timeoutMs` 的 Skill CLI 调用所使用的产品默认值。

图片读取真实模型验收为每次 Qwen、GLM 和 DeepSeek 调用显式设置 `timeoutMs: 60000`。该 60 秒参数只定义验收完成期限，不覆盖产品默认值的合同测试。自动化分类器使用以下八个互斥 fixture：

| fixture 输入 | 分类结果 | 是否通过 |
| --- | --- | --- |
| 60 秒内退出码 0、stderr 为空、stdout 为四属性图片观察 JSON | `stop-success` | 是 |
| 60 秒内退出码 1、stderr 为 `finish_kind="error"` 的完整 Provider failure 单行文案 | `provider-error-finish` | 是 |
| 60 秒内退出码 1、stderr 为 `finish_kind="aborted"` 的完整 Provider failure 单行文案 | `provider-aborted-finish` | 是 |
| 调用者收到 `AbortError`，且输出不包含 `IMAGE_READER_PROVIDER_FAILED` | `caller-cancelled` | 是 |
| 60 秒内没有完成且没有 stdout 或 stderr | `timeout-without-output` | 否 |
| 60 秒内没有完成且已经产生部分 stdout 或 stderr | `timeout-with-partial-output` | 否 |
| 60 秒内返回其他 Harness 错误码 | `unexpected-error-code` | 否 |
| 返回混合、多行、缺少属性或其他不符合 Tool/CLI 合同的输出 | `invalid-output` | 否 |

2026-09-02 的真实模型验收使用隔离开发 Desktop、`opencode-go/deepseek-v4-flash` Agent 模型和 `opencode-go/qwen3.7-plus` 图片读取模型。`standard` Preset 对同一图片依次省略 `prompt`、提供返回 `OVERRIDE_OK` 的 `prompt`、再次省略 `prompt`，确认本次覆盖不写入设置。`ComfyUI工作台预设` 的 Agent 实际读取 worktree 中的 `local-image-reader/SKILL.md` 与 `references/image-inspection-cli.md`，并通过前台 shell Tool Call 向 `image inspect --stdin` 传递可选 `prompt`；CLI 退出码为 0、stderr 为空、四属性 JSON stdout 的 `observation` 为 `OVERRIDE_OK`。完整请求、实际读取路径、CLI stdin 和 stdout 记录在 [`.planning/image-reader-prompt-string/model-acceptance.md`](../../.planning/image-reader-prompt-string/model-acceptance.md)。

v0.38.7 发布前完整 `pnpm quality` 结果为 857 项 unit/integration、33 项 contract/security、134 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.32%、branches 86.37%、functions 100%、lines 95.98%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。测试覆盖标准 Node.js Worker 前端编译、CDP 阶段错误、Worker 进程组取消、stdin 异步失败、Host bundle 并行输出隔离以及 linked worktree 运行端口与 Desktop 输出隔离。

v0.38.6 发布前完整 `pnpm quality` 结果为 822 项 unit/integration、33 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.57%、branches 87.26%、functions 100%、lines 96.03%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。新增合同测试验证 Krea2 Anime Prompt Builder 的 canonical 目录、frontmatter、UI 元数据、Skill 内参考路径、CLI 参考章节、v2 生成器删除和 v1 资产边界。

v0.38.5 发布前完整 `pnpm quality` 结果为 822 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.57%、branches 87.26%、functions 100%、lines 96.03%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。图片读取测试覆盖本次提示词覆盖、默认提示词恢复、普通模型字符串包装、当前配置独立保存、配置切换与持久化回显、凭据动作和具体字段错误。

Session Media Viewer 自动化测试覆盖媒体查看、内容、下载和 Workflow URL 编码；下载路由测试覆盖 Saved Media 原始字节、MIME、字节长度、UTF-8 RFC 5987/8187 attachment 文件名、中文、空格、单双引号、`!'()*`、回车、换行、同一 workspace 错误 Session、其他 workspace Session、缺失 Session、空 Session、超长 Session、未登记 Session、媒体文件缺失、非 GET、未分类 500，以及响应头发送后媒体流中断时销毁连接。Modal 测试覆盖初始图片、视频、iframe 导航后的当前媒体、重复下载、临时锚点成功与异常清理、关闭 Modal 后按钮清理、严格当前媒体消息解析、错误 origin、错误 source、未知属性、未知 `mediaId`、不匹配 `runId`、消息监听器清理、主框架 Clipboard API 成功、API 缺失、权限拒绝、媒体导航后迟到复制结果、Modal 关闭重开后迟到复制结果、完整可选择 Run ID 文本、独立复制按钮、图片固有尺寸、视频固有尺寸、零尺寸、旧媒体迟到尺寸事件隔离、原始正面提示词、超长正面提示词逐字符完整投影、正面提示词缺失、图片与原生控件视频、左右按钮、裸左右方向键、带 `Alt`、`Control`、`Meta` 或 `Shift` 修饰键的方向键不切换媒体、首尾不循环、按 `created_at DESC, output_index DESC, media_id DESC` 排序媒体、同一个 Run 的正面提示词只读取一次并投影到该 Run 的每项媒体、URL 更新、刷新定位、旧媒体迟到加载错误、当前媒体加载错误、`aria-live` 播报、响应式媒体查询和布局样式合同。真实 Desktop 测试在任何下载点击前连接 browser WebSocket 并启用持久 `Browser.downloadWillBegin` 与 `Browser.downloadProgress` 事件队列，再使用真实鼠标分别下载初始媒体和 iframe 导航后的媒体；测试验证事件 URL、建议文件名、完成状态、接收字节数、落盘原始字节、Modal 保持打开和 Chromium page target 数量不增加。测试在桌面宽度与 CDP 600 × 800 viewport 中验证 Run ID 行、footer 和 Modal 没有水平溢出或覆盖 iframe，并在 `finally` 中恢复 Chromium 下载策略、关闭 browser WebSocket 和删除下载目录。Session Media Viewer 静态原型测试覆盖该查看器原型目录中定义的结构方案 A、结构方案 B、结构方案 C、边界文案、提示词状态和本地资源约束；这些结构方案名称不指代 Agent Preset A/B。

Workflow compiler 的回归用例覆盖正负 Prompt 极性、连接上游控件、上游 multiline `STRING` Prompt 控件、多个 multiline `STRING` 候选拒绝、精确尺寸、Seed、采样参数、重复目标、不可达候选、模型、标准 LoRA、Power LoRA、LoraManager、空 LoRA、bypass 和活动输出节点筛选。运行参数合同用例通过公开 `ComfyWorkflowCompiler.compile()` 覆盖 `INT`、`FLOAT`、`STRING`、`AUTOCOMPLETE_TEXT_LORAS`、`BOOLEAN`、旧式任意 JSON 候选、新式单选与多选 `COMBO`、未知自定义控件 no-op、未知自定义控件改值拒绝、动态父子控件最终状态、嵌套动态控件、必填连接子输入、可选缺省子输入、缺失必填子输入、遗留分支子输入和合同变化后现有值失效。精确数值用例覆盖生产故障 seed、合法的大于 `Number.MAX_SAFE_INTEGER` 的历史 seed、十进制等价形式、负数、正负零、巨大指数、候选值数值 token，以及 `/object_info` 首次读取、缓存命中、并发共享和 TTL 刷新。测试给运行时参数化阶段注入透传 `officialApiWorkflowCompiler.compile()` 测试替身，因此这些用例直接观察运行时 API Workflow 投影。端到端编译用例使用真实 `ComfyWorkflowCompiler` 与 `OfficialApiWorkflowCompiler`，比较空、单个和多个 LoraManager 选择的 cache hit 结果与新鲜官方导出结果，并同时核对 Prompt、尺寸、模型、bypass、活动输出与官方连接。独立 `OfficialApiWorkflowCompiler` 测试验证最终返回值来自官方基础对象，并保留官方虚拟节点、连接改写和字面量载体值。

Official API Workflow Cache 与 Runtime Input Overlay 测试覆盖 cache miss、同一 `OfficialApiWorkflowCompiler` 对象内的 cache hit、重建该对象后对同一目标 ComfyUI 实例的持久 cache hit、不同目标实例 identity 隔离、并发 miss 合并、失败不写入、损坏缓存拒绝、identity 变化、基础对象不可变、官方连接保留、`__value__` 覆盖、`__value__` 包装优先于连接形状判断、字面量载体保留值、非零载体输出拒绝、未引用同形对象拒绝，以及 cache hit 与新鲜官方导出在 Prompt、seed、尺寸、BOOLEAN、enum、模型、标准 LoRA、Power LoRA、LoRA Text Loader 和模板 39 LoraManager 路线中的等价性。

ChromeComfyFrontend 测试使用注入的子进程、文件系统、HTTP 和 CDP seam 验证认证 header 只注入同 origin 请求、跨 origin 请求删除认证 header、未认证实例不启用请求拦截、macOS mock keychain 启动参数、WebSocket close/error 后的 pending command 结算、target crash、分阶段 deadline、一次 pre-readiness 重试、前端 readiness、`loadGraphData()`/`graphToPrompt()` 导出、浏览器在 readiness 或导出阶段提前退出、调用者取消、CDP 错误、有界脱敏 stderr、SIGTERM、精确 SIGKILL 和自有临时目录清理。NodeWorkerComfyFrontend 测试验证版本化 stdin/stdout 协议、诊断消息、结构化错误保留、有界 Worker stderr、启动失败、协议失败、stdin 异步写入失败、调用者取消、启动期间取消竞争和无响应 Worker 进程组强制回收；Worker entry 测试验证严格请求结构、成功导出和失败结果。进程组测试使用本地假 Worker 和假 Chrome，不启动真实浏览器。

2026-08-27 在 ComfyUI 地址 `http://192.168.110.122:8188` 完成的实例验收使用 ComfyUI `0.33.3`、Frontend `1.49.6` 和模板 39。第一次请求完成官方前端 cache miss，第二个不同 LoRA 权重请求从本地 cache hit 且没有再次启动浏览器。最终 transport 提交请求 `29f91894-e160-4b3f-abb6-565f8f7e9617`；服务器 history 返回 `success` 和 `completed=true`，节点 5 的 `inputs.loras.__value__` 包含请求的 LoRA 名称、`strength=3`、`clipStrength=3` 与 `active=true`，节点 13 输出 `2026-08-27-221214_anima-aesthetic-v1.1_777001.png`，请求结束后队列为 running 0、pending 0。

2026-08-28 在 ComfyUI 地址 `http://192.168.110.122:8188` 完成的实例验证覆盖当前 Source Catalog 的 21 个 Workflow 模板。矩阵逐模板核对 15 个公开参数，共 315 项结果符合精确非空支持集合；21 个模板的组合参数编译、官方页面 cache miss、同模板 cache hit 和基础对象一致性验证全部通过。保存的失败 Run `run_8a0642e4-43c8-4c5d-a54f-988a2a61050a` 请求使用当前模板 42、实时 `/object_info`、原 Prompt、原 Seed 和两个 LoRA 重放后完成 Workflow 编译。

v0.31.3 发布文档提交前的完整 `pnpm quality` 结果为 406 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试通过；函数覆盖率为 100%。

2026-08-28 的 v0.31.4 验证在 ComfyUI 地址 `http://192.168.110.122:8188` 覆盖当前 Source Catalog 的 18 个 Workflow 模板。矩阵对每个列表型输入从该模板使用的节点类型和实时 `/object_info` 选择合法测试值，不使用跨节点类型的固定显示值。矩阵执行 270 个单参数检查；191 个基线支持参数通过，79 个基线不支持参数返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。18 个模板的组合参数编译、官方页面 cache miss、同模板 cache hit、单次前端导出和基础对象一致性验证全部通过。

v0.31.4 发布文档提交前的完整 `pnpm quality` 结果为 416 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试通过；函数覆盖率为 100%。`/object_info` 缓存测试验证 40 个并发 compile 合并为一个请求、10 分钟 TTL、实例隔离和失败响应不缓存。

v0.32.0 最终完整 `pnpm quality` 结果为 429 项 unit/integration、24 项 contract/security、40 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。1280 × 720 与 390 × 844 的浏览器验收覆盖图片、原生控件视频、首项、末项、正面提示词缺失、媒体文件不存在、点击导航、裸方向键和无水平溢出；用户按带 `Alt`、`Control`、`Meta` 或 `Shift` 修饰键的方向键时，页面不切换媒体。390 × 844 的超长正面提示词验收确认提示词面板内部滚动，页面高度保持 844px，左右箭头继续与媒体舞台垂直居中。

v0.33.0 最终完整 `pnpm quality` 结果为 445 项 unit/integration、24 项 contract/security、59 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。生产生命周期测试确认 `prod:start` 把 A 组 `harness-comfyui-schema-control` 与 B 组 `harness-comfyui-cli-candidate` Preset 及共享 Tool visibility component 物化到生产 DSH home，物化失败时不写入受管运行状态。真实 `opencode-go/deepseek-v4-flash` A/B 测试完成 3 对兼容性任务，并由 B 组 `harness-comfyui-cli-candidate` 的 Session 通过两个独立前台 shell Tool Call 把逐字段相同的 Generation Request 提交为两个成功 Run。

v0.33.1 最终完整 `pnpm quality` 结果为 447 项 unit/integration、24 项 contract/security、59 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。1280 × 720 浏览器验收覆盖完整 Run ID、Clipboard API 成功反馈、图片固有尺寸、视频固有尺寸和媒体切换后的顶部信息更新。390 × 844 浏览器验收确认完整 Run ID 在按钮内换行显示，顶部高度为 `98.5px`，页面 `scrollWidth` 等于 `clientWidth` 的 `390px`，页面 `scrollHeight` 等于 `clientHeight` 的 `844px`，浏览器错误和警告日志为 0。

v0.33.2 最终完整 `pnpm quality` 结果为 447 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过；函数覆盖率为 100%。production 测试确认启动器只物化用户可见名称为 `ComfyUI工作台预设` 的产品 Preset，保留内部 ID `harness-comfyui-cli-candidate`，删除精确声明的已退役项目 Preset，保留其他用户 Preset，并且不会沿退役 Preset 符号链接修改外部目标。Tool visibility 回归测试使用 `tests/fixtures/agent-presets/` 中的非产品 composition 验证 5 个 Host 项目 Tool schema 的隐藏行为。

v0.34.0 发布前完整 `pnpm quality` 结果为 470 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.87%、branches 85.93%、functions 100%、lines 95.28%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.34.1 发布前完整 `pnpm quality` 结果为 471 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.92%、branches 86.04%、functions 100%、lines 95.31%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.35.0 发布前完整 `pnpm quality` 结果为 507 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.9%、branches 86.08%、functions 100%、lines 95.56%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.35.1 发布前完整 `pnpm quality` 结果为 507 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.9%、branches 86.08%、functions 100%、lines 95.56%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.36.0 发布前完整 `pnpm quality` 结果为 523 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 93.02%、branches 86.32%、functions 100%、lines 95.64%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.36.1 发布前完整 `pnpm quality` 结果为 525 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 93.03%、branches 86.28%、functions 100%、lines 95.66%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.36.2 发布前完整 `pnpm quality` 结果为 525 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 93.03%、branches 86.28%、functions 100%、lines 95.66%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.37.1 发布前完整 `pnpm quality` 结果为 529 项 unit/integration、29 项 contract/security、96 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。

v0.37.2 发布前完整 `pnpm quality` 结果为 529 项 unit/integration、29 项 contract/security、99 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。真实 Desktop 测试从旧生产 DSH home 读取保存 Session，并验证当前生产 DSH home 中的侧栏 Session、Session 选择和媒体结果。

v0.37.3 发布前完整 `pnpm quality` 结果为 530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。真实 Desktop 验收确认 `$DSH_HOME/profiles/.generations/live/<generation-id>/` 中包含插件包及其依赖的 `harness-comfyui` generation 安装产物与 v0.37.3 测试候选一致；该安装产物中的 managed CLI 相关文件来自 `.local/source-cli/` 构建目录，不包含 `scripts/cli/` 源入口；真实 DSH bash capability 测试通过构建后的 CLI 取得业务响应。

v0.37.4 发布前完整 `pnpm quality` 结果为 530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。Source adapter 测试覆盖 Source v0.86.1 三字段 TemplateBundle；Workflow compiler 测试覆盖活动输出节点发现、断开输出节点删除和没有活动输出节点时的明确失败。

v0.37.5 发布前完整 `pnpm quality` 结果为 530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。实例 2 的实时 Workflow 矩阵验证当前 Catalog 的 19 个模板全部通过参数支持基线、组合编译和 Official API Workflow 验证。

v0.37.6 发布前完整 `pnpm quality` 结果为 539 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。真实 Desktop 测试在媒体切换前后使用 CDP 真实鼠标事件分别复制两项媒体的完整 Run ID，并验证桌面与 600 × 800 viewport 的主框架 Run ID 行布局。

v0.37.7 发布前完整 `pnpm quality` 结果为 539 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。计划执行者在真实 Desktop 中使用 `ComfyUI工作台预设` 和 `DeepSeek V4 Flash`，分别验收 ANIMA 与 WAI Prompt Builder 的普通文字、Character/Style 上下文和纯历史 Run 查询，共六项模型用例。

v0.38.0 发布前完整 `pnpm quality` 结果为 544 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。真实 Desktop 测试使用 Browser 级 CDP 下载事件和真实鼠标事件下载媒体切换前后的两项原文件，并验证建议文件名、完成状态、接收字节数、落盘原始字节、Modal 状态、page target 数量，以及桌面与 600 × 800 viewport 的 footer 布局。

v0.38.1 发布前完整 `pnpm quality` 结果为 544 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。真实 Cordis scoped waterfall 测试覆盖 `ComfyUI工作台预设` 的精确系统提示词段落过滤、非匹配 Preset scope 隔离、下游异常传播和 scope 清理。

v0.38.2 发布前完整 `pnpm quality` 结果为 544 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。真实 Desktop 测试通过会话主模型选择器验证 OpenCode Go 目录删除 `ox-alpha-free`，新增 `qwen3.8-flash`、`glm-5.3-flash`、`hy4-preview` 和 `grok-4.6`，并保留 `grok-4.5`；图片读取设置列出支持图片输入的 `qwen3.8-flash`、`glm-5.3-flash`、`grok-4.5` 和 `grok-4.6`，并排除只支持文本输入的 `hy4-preview`。实际安装的 pi-ai 0.84.3 公共运行接口分别使用 `glm-5.3-flash` 和 `deepseek-v4-flash` 完成 OpenCode Go 真实网络最小对话。

v0.38.3 发布前完整 `pnpm quality` 结果为 626 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。新增的 82 项单元测试覆盖 ANIMA 前十一个 tag 槽位与 WAI 前十四个 tag 位置的三种权重形式、ASCII 十进制文法、转义、画师、默认质量、组合顺序、CLI 退出码和错误合同。`ComfyUI工作台预设` 使用 `opencode-go/deepseek-v4-flash` 与 `Default` 推理等级完成六个真实 Prompt Builder 权重用例；完整证据记录在 [`.planning/prompt-builder-weighting/model-acceptance.md`](../../.planning/prompt-builder-weighting/model-acceptance.md)。

v0.38.4 发布前完整 `pnpm quality` 结果为 742 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过。覆盖率为 statements 93.39%、branches 87.2%、functions 100%、lines 95.9%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。运行参数合同测试覆盖严格 JSON 标量类型、精确整数与浮点范围、旧式候选、`COMBO.options`、仅由 `COMBO.multiselect: true` 启用的多选、动态分支子输入、未知自定义 widget 拒绝和 Actual Workflow 原子写入。

Host bundle 测试必须通过 `materializeSourceHostModule(repositoryRoot, { outputRoot })` 为每个并行测试创建独立输出根目录。生产构建不传入 `outputRoot`，并继续发布到仓库 `.local/source-host`。

## Generation 结果刷新验证

`tests/unit/generation-store.test.ts` 使用假计时器和完成时机可控的请求替身，验证以下行为：

- 当前 Session 有订阅者，且 `sessionRunning` 或 `hasActiveRuns` 为 true 时，Store 继续查询；两个布尔值都为 false 时，Store 停止安排计时器。
- `sessionRunning` 持续为 true 时，Store 在前一次查询返回空列表后仍能发现首个 Run，也能在前一批 Run 完成后发现下一批 Run。
- `sessionRunning` 变为 false 时，Store 立即查询一次；查询结果仍有活动 Run 时继续轮询，没有活动 Run 时停止轮询。
- 首次查询失败时，Store 保留初始空投影；后续查询失败时，Store 保留最近一次成功投影。会话 Agent 正在运行或最近一次成功投影包含活动 Run 时，Store 继续查询；成功响应清除错误。
- 同一 Session 的多个订阅者共享查询，不同 Session 的快照互不覆盖。最后一个订阅者退出时，Store 清理该 Session 的请求、计时器、运行状态和缓存；Store 释放时清理全部 Session。已取消或被替换的请求返回迟到响应时，Store 不发布结果，也不恢复轮询。

`tests/unit/results-drawer.test.tsx` 使用真实 `GenerationProjectionStore`，验证 `WorkbenchDetails` 在持有同一个 `SessionSnapshot` 对象且该对象的 `running` 为 true 时，把稍后查询到的 Run 显示到面板。组件测试还验证 `SessionSnapshot.running` 变化时会调用 Store 的 `setSessionRunning()`、以相同 `running` 值重复渲染时不增加查询次数，以及切换 Session 后面板只显示新 Session 的 Run。

`tests/desktop/desktop-live.test.mjs` 在临时 HOME 中启动真实 Desktop，通过 Harness `ClientSessions.handleSessionStatus()` 模拟会话 Agent 开始和结束运行。测试保持同一个 `SessionSnapshot` 对象，且该对象的 `running` 持续为 true；测试先确认面板为空，再分两批把测试夹具生成的已完成 Run 和媒体记录写入临时 Run Repository。测试通过 `harnessComfyuiGeneration.list()` 和 `WorkbenchDetails` 确认两批 Run 都自动显示，Run 卡片数等于写入的 Run 数，媒体计数等于写入的媒体记录数，且第一批没有活动 Run 时仍能发现第二批。该测试不调用真实会话模型或 ComfyUI 服务。

2026-09-05 的真实对话验收使用项目仓库提交 `02114e21ee3de2701eb399542edea812c1af867c` 作为独立 worktree 的基线，运行分支 `codex/diagnose-session-run-panel-20260905` 中尚未提交的 Run 面板修复。DSH Desktop 使用其仓库提交 `4d40a23f2ec64801ead57cad70711a3554176e91`，该底座包含 Harness `0.1.2-rc.1`。验收会话 `session-5bc5aed4-d396-4470-92d4-f840154611b7` 使用现有 cliproxy Provider 的 `gpt-5.6-sol` 模型，通过两次独立 Bash 工具调用，向 ComfyUI 实例 `2` 提交模板 `29` 的两项请求。两个 Run 的 `turn` 均为 `1`，`call_id` 不同；`run_60cd89d2-0fa0-42f6-8a36-30c651ef3707` 和 `run_783eab96-7d1b-466b-85f6-97ee122e7ed9` 均成功，并各保存一张 512×512 PNG。

Codex 通过 Electron Chrome DevTools Protocol 操作消息输入框和“生成结果”按钮，并记录 `harnessComfyuiGeneration.list()` 的响应、面板计数及开发 SQLite 中的记录。首个 Run 创建前，Codex 记录到 41 次空列表响应；首批完成后、第二批创建前的 50.808 秒内，Codex 记录到 50 次 `hasActiveRuns=false` 的响应。Codex 在会话运行期间采样 259 次，每次均读取到同一个 `SessionSnapshot` 对象，且其 `running=true`。Codex 在空列表、首批完成、第二批创建和两批完成四个阶段观测到面板尺寸均为 359.5×900 CSS 像素，矩形完整位于 1380×900 CSS 像素的视口内，固定测量点 `(left + width / 2, top + 80)` 均命中面板的后代元素。Codex 分别在两个 Run 创建后的 772 毫秒和 984 毫秒观测到对应卡片；同一轮回复结束前，面板显示两张 Run 卡片和 2 个媒体，与数据库记录数量一致。

v0.39.5 最终候选树的完整 `pnpm quality` 通过：938 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.43%、branches 86.66%、functions 100%、lines 96.06%；Harness 锁文件的依赖审计结果为 critical 0、high 0、moderate 0、low 0。

## v0.39.6 发布候选验证

v0.39.6 最终候选树的完整 `pnpm quality` 通过：943 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.46%、branches 86.72%、functions 100%、lines 96.08%。Harness 锁文件的依赖审计未返回漏洞公告。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，发布记录继续保留这两项公告，用户已明确授权执行该锁文件安装。部署验收必须确认受控安装产生 Desktop 的 `node_modules/node/bin/node`，并确认该程序返回 `v24.9.0`。

## v0.39.7 发布候选验证

v0.39.7 最终候选树使用 DSH Desktop `5e08355a58bb727cb0f48c794550202d9d59ed9f`。真实 Desktop 测试确认删除失败时保留目标 Session，删除成功时只移除目标 Session；同一测试还确认 Kimi PPT adapter 保持禁用，三个会话扩展位没有 `kimi-ppt` contribution，页面没有 PPT 按钮，Skill 与插件清单没有启用 Kimi PPT core，并且真实模型请求不包含 Kimi/PPT 系统提示词或 `pptd_`、`ppt_` Tool。

完整 `pnpm quality` 通过：943 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.46%、branches 86.72%、functions 100%、lines 96.08%。Harness 锁文件的完整依赖与生产依赖审计结果均为 critical 0、high 0、moderate 0、low 0。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，用户已明确授权执行该锁文件安装。受控安装产生的 Desktop `node_modules/node/bin/node` 返回 `v24.9.0`。

## v0.39.8 发布候选验证

v0.39.8 的自动化测试直接启动生产语义查询客户端和生产数据源读取客户端，记录客户端发送的 HTTP 方法、请求路径、查询参数和请求体，并使用数据源接口响应验证客户端返回的生成模型、ComfyUI 实例和 Workflow bundle 对象。真实数据源服务验收确认语义查询返回生成模型 `id=1`，数据源读取返回 ComfyUI 实例 `id=2` 和 Workflow bundle `id=43`。真实数据源服务验收还从实际候选发行包中解压两个客户端并逐一调用，确认该发行包包含这两个客户端且不包含 source contract JSON。

真实 Desktop 验收确认 Harness 设置中的“ComfyUI”入口包含“图片读取”和“数据源服务”两个页签；“图片读取”页签继续使用 v0.39.8 修改前负责编辑图片读取设置的同一组件，并保留切换页签前的未保存草稿；“数据源服务”页签把用户输入的 URL 和端口保存到 Harness 设置。测试还确认未配置数据源服务时，启用 `ComfyUI工作台预设` 会显示配置提示。

OpenRouter 模型驱动的真实 Desktop 会话实际加载候选发行包中的 `wai-sdxl-prompt-builder` Skill。该 Skill 使用 Desktop 注入的 `DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI`、`DSH_HARNESS_COMFYUI_SOURCE_URL` 和 `DSH_HARNESS_COMFYUI_SOURCE_PORT`，调用 `DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI` 指向的候选发行包语义查询客户端。Base Model Search 返回唯一的 `wai` 记录 `id=2`；Style Search 返回一条水彩画风候选记录；Style Resolve 使用 `id=12298` 发起请求，并返回 `id=12298`、`base_model_id=2` 和 `prompt_text=fly`。该 Skill 随后调用自身的 Prompt 格式校验器和最终结果校验器，两次命令均返回退出码 0。

完整 `pnpm quality` 通过：1004 项 unit/integration、55 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.54%、branches 86.77%、functions 100%、lines 96.17%。Harness 锁文件的完整依赖与生产依赖审计结果均为 critical 0、high 0、moderate 0、low 0。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，用户已明确授权执行该锁文件安装。部署验收必须确认受控安装产生 Desktop 的 `node_modules/node/bin/node`，并确认该程序返回 `v24.9.0`。

## v0.39.9 发布候选验证

v0.39.9 的 Repository Skills 可见性测试在当前 checkout 外创建 Workspace，分别创建省略 `agentPreset`、显式选择 `harness-comfyui-cli-candidate` 和显式选择其他运行时 Preset 的 Session。前两个 Session 的 `remote.skills.list()` 返回结果均包含当前 checkout 的七个 Repository Skills；采用 `harness-comfyui-cli-candidate` 以外的运行时 Preset 的每个 Session，其 `remote.skills.list()` 返回结果均不包含名称和描述同时匹配上述 Repository Skill 的返回项。`standard` Session 的 `remote.skills.list()` 返回结果包含外部 Workspace 中的同名 Skill 和受控 `DSH_AGENTS_HOME` 中的用户 Skill，省略 `agentPreset` 的 Session 和显式选择 `harness-comfyui-cli-candidate` 的 Session 的返回结果均不包含这两个测试 Skill。

真实 Desktop 在 checkout 外的 Workspace 中创建省略 `agentPreset` 的 Session，创建结果返回 `agentPreset: harness-comfyui-cli-candidate`，该 Session 的请求上下文包含当前 checkout 的七个 Repository Skills。真实 Agent 模型读取 `local-image-reader` Skill 并调用图片读取 CLI 的 Tool Call 验收未完成：OpenCode Go 路由返回每周用量限制错误，DeepSeek 路由缺少 API Key，Contributor 路由不支持当前地区。用户在收到该阻塞说明后授权继续创建 v0.39.9 PR、把该 PR 合入 `main`、发布 v0.39.9 并把 v0.39.9 部署到生产环境。

完整 `pnpm quality` 通过：1005 项 unit/integration、55 项 contract/security、197 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.54%、branches 86.77%、functions 100%、lines 96.17%。Harness 锁文件的完整依赖与生产依赖审计结果均为 critical 0、high 0、moderate 0、low 0。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告。用户已授权本次生产部署；生产部署完成后，部署验收执行者必须运行 `node_modules/node/bin/node --version`，并确认命令输出为 `v24.9.0`。

## v0.39.10 发布候选验证

ANIMA、Krea2 和 WAI Prompt Builder 的三份语义查询参考文档已经删除关于 Harness 提供查询客户端、数据源 URL 和端口的文字。每份文档均规定如何记录上下文、按照什么顺序执行查询、如何选择候选结果、如何处理错误以及如何复用查询结果。Search 与 Resolve 命令的名称、查询路径、命令参数和返回字段保持不变。三名独立语义 Reviewer 各自逐行审计一份文档，三份文档均通过语义审计。

v0.39.10 候选中的 `scripts/source-client/imagegen-semantic-query.mjs` 和 `scripts/source-client/imagegen-comfyui-source-read.mjs` 连接 `http://127.0.0.1:18093` 的已部署数据源服务完成实时 discovery。语义查询客户端对 `/internal/semantic/base-models`、`/internal/semantic/works`、`/internal/semantic/characters`、`/internal/semantic/styles` 和 `/internal/semantic/prompt-terms` 执行 Search，并对 Character `id=39938` 和 Style `id=12344` 执行 Resolve；每次调用均返回退出码 `0`、空 stderr 和符合接口定义的 JSON。数据源读取客户端读取 ComfyUI 实例 `id=2` 和 Workflow bundle `id=43`。生产 `CatalogCli` 使用实际子进程执行器解析 Base Model `id=1`、`id=2`、`id=3`、生成模型 `id=1` 和 ComfyUI 实例 `id=2`；生产 `GenerationSourceCli` 使用实际子进程执行器解析实例 `id=2` 和包含 76 个 Workflow 节点的 bundle `id=43`。该验收没有读取数据源仓库中的文件，也没有用测试构造的 JSON 代替已部署服务响应。

完整的 `pnpm quality` 检查通过：1005 项单元测试和集成测试、55 项契约测试和安全测试、197 项生产测试、32 项原型测试以及 2 项真实 Desktop 测试全部成功。覆盖率为 statements 93.54%、branches 86.77%、functions 100%、lines 96.17%。Harness 锁文件的全部依赖审计和生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。生产部署执行者按照 Desktop 的 `package-lock.json` 安装全部锁定依赖，其中包括 `image-size 1.2.1`。`image-size 1.2.1` 关联 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告；用户已明确授权生产部署执行者按照该锁文件安装依赖。部署验收者必须确认该安装在 Desktop 目录下生成 `node_modules/node/bin/node`，运行 `node_modules/node/bin/node --version`，并确认命令输出为 `v24.9.0`。

## 本地发布门禁

仓库不配置 GitHub Actions workflow。计划执行者必须在独立 linked worktree 中对最终候选树执行：

```sh
pnpm quality
git diff --check
```

`pnpm quality` 依次执行 `quality:preinstall`、`quality:fast` 和 `test:desktop`。`quality:preinstall` 验证 manifest、lockfile、依赖漏洞和依赖构建脚本；`quality:fast` 验证 Harness 边界、TypeScript 类型、覆盖率、合同、安全、生产生命周期和原型；`test:desktop` 验证真实 DSH Desktop。

计划执行者必须把最终测试数量、覆盖率和依赖审计结果写入当前版本的 `docs/releasenotes.md` 和本文件。任何审查修正或门禁修正改变候选树后，计划执行者必须重新执行受影响的独立审查和完整 `pnpm quality`。

## v0.41.0 图片迭代的自动化验证与完整质量检查

tests/production/native-iteration-roles.test.mjs 从当前预设读取四份角色配置，使用目标 Desktop 提供的 schema 接口验证工具参数和返回值。测试向生产派发 component 提供受控子会话服务，检查首次和后续消息的完整内容、角色 persona、模型、工具权限和实际接收者，并覆盖错误与取消。

同一文件还使用真实 Cordis、SystemPrompt 和 ToolRuntime 加载四个生产 component，验证首次调用、后续投递、作用域隔离、单 component 释放、整体释放和重新注册。tests/production/source-agent-preset.test.mjs 验证配置结构和共享 component 的安装。

完整 `pnpm quality` 通过：1007 项单元与集成测试、55 项契约与安全测试、255 项生产测试、32 项原型测试和 2 项 Desktop 测试全部成功。覆盖率为 statements 93.54%、branches 86.79%、functions 100%、lines 96.17%。Harness 锁文件的全部依赖与生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。

原生接口测试还覆盖 Goal 命令与状态变更、子 Agent 推理档位继承、Provider 或模型切换时清除继承档位，以及目标模型能力校验。Desktop 测试验证迭代会话可以发现并执行 /goal。

上述自动化测试不调用 Agent 语言模型、视觉模型或 ComfyUI 生图服务；真实子 Agent 的完整生图、独立观察与比较流程由用户手工验收。
