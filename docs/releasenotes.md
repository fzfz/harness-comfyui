# Harness ComfyUI v0.44.0

## 架构与运行入口

`harness-comfyui` 分为 core、image-reader、cli 与 Web 展示插件。读图插件独立管理配置、Provider 和 Tool；CLI 使用 DSH 进程内的专用回环 HTTP 服务。`pnpm cli:run -- "任务文本"` 使用普通 Node.js 和 DSH Profile，挂载项目 Preset，并在独立目录保存 Session、Run 与媒体。

## 依赖审核

纯 CLI Profile 声明 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`、`@deepseek-ai/dsh-workspace`、`@deepseek-ai/dsh-agent-presets`，版本均为 `0.1.5-rc.1`，分别提供启动器、基础服务、任务参数与退出服务、Workspace 和 Preset 装配。本次使用已安装基线，未安装或升级依赖。

2026-09-11 的已安装依赖图检查覆盖 475 个包，解析完整，未包含 Electron 或 Desktop 包。npm 公告接口对该依赖图返回 6 项高危和 5 项中危匹配：`js-yaml 4.3.1` 一项高危、宿主 `sharp 0.35.3` 一项高危、`fast-uri 3.1.5` 四项高危、`qs 6.15.3` 两项中危、`hono 4.13.2` 三项中危。以上结果表示版本命中公告，尚未逐项确认业务路径是否可利用。后续独立安装须重新审核这些传递依赖；本次保留用户选定的 DSH 基线。项目业务使用的 `sharp` 仍为 `0.35.4`，本仓库锁文件的完整与生产依赖审计均为零发现。

## 验证与待完成验收

完整质量检查和覆盖率结果见 [CLI 解耦候选验证](system/testing.md#cli-解耦候选验证)。纯 DSH 的真实模型已读取 local-image-reader Skill 并通过 CLI 完成测试图片读图，返回红色观察结果。受控集成测试确认 Generation Run 在进程退出后持久保存，并在同目录重启后完成任务和媒体下载。

Desktop 隔离实例已确认当前插件安装、Client 加载、Renderer 健康和监听端口归属，并已停止。Desktop 的真实模型矩阵尚未通过：七个 Session 的 cliproxy 请求均在 Tool Call 前返回 TIMEOUT，后续更换模型、Provider 和移除 shell 代理环境变量的测试仍超时。该结果保留为待完成验收，自动化 Desktop 测试和纯 CLI 读图成功分别记录。

# Harness ComfyUI v0.43.1

## 插入上下文弹窗

资源列表采用两列布局，每页显示 8 项，末页显示剩余项。卡片保留封面的完整缩放方式，底部使用较小字体显示各类别的重要字段，并省略重复内容。顶部底模选择、搜索和分页控件保持原有交互，工作台中间列保持原样。

每张卡片新增“详情”按钮，详情页按八种资源类别展示对应字段。详情中的长内容独立滚动，返回资源列表时保留搜索、选择、滚动位置和焦点。图片预览按弹窗可用区域完整缩放，支持横图、竖图和小图；从详情打开图片后可以返回原详情位置。确认插入仍使用原有上下文结构，详情字段不增加到插入内容中。

## 验证与依赖

完整 `pnpm quality` 通过：1073 项 unit/integration/Skills、55 项 contract/security、278 项 production、32 项 prototype 和 4 项真实 Desktop 测试成功。覆盖率为 statements 93.8%、branches 87.37%、functions 100%、lines 96.32%。Harness 完整依赖和生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。

真实 Desktop 测试覆盖两列分页、封面缩放、分类详情、700×500 窗口中的图片预览，以及返回时的滚动位置、焦点和选择保留。真实数据源的八种类别均完成 Search 与详情 Resolve 验证。Desktop 基线继续使用 2.0.9、DSH 0.1.5-rc.1 和 Electron 43.3.0，本次未增加或升级依赖；已有安装审核记录见 v0.43.0。

# Harness ComfyUI v0.43.0

## 依赖与宿主接口

Desktop 基线更新为自有 Desktop 仓库中的 Stable 2.0.9、DSH 0.1.5-rc.1 和 Electron 43.3.0，源码提交由 config/desktop-baseline.json 固定。宿主保留会话永久删除、真实 Session 请求头、Provider 推理等级编辑与 managed CLI 路由鉴权补丁。Harness 的宿主 peer 下限更新为 0.1.5-rc.1，并声明原生右侧栏依赖。

工作台结果页通过原生右侧栏页签显示，空白与已保存 Session 使用同一实现。关闭结果页只关闭工作台自己的页签，其他宿主页签由 Desktop 继续管理。两个项目预设按新宿主 schema 把 Persona 正文配置为 `prefix`。依赖安装、启动验收和开发规范同步到新基线。

## 安装审核

Desktop 2.0.9 原锁文件的安装前公告检查记录了 24 项高危和 12 项中危匹配，涉及开发工具与宿主运行依赖。安装使用经过审核的原锁定版本；本次适配只增加自有宿主补丁。Harness 锁文件的完整依赖及生产依赖公告检查均为零发现。

## 验证

自有 Desktop 的完整 `corepack yarn check` 通过：Market 263 项、Stable 1375 项和 Beta 1327 项测试成功；Stable 8 项、Beta 7 项跳过。本次改动修正了市场测试的代理隔离、Windows 反向补丁路径和 CLI 版本检查的临时工作目录，并保留原有行为断言。

本次候选的分项验收通过：1045 项 unit/integration/Skills、55 项 contract/security、278 项 production、32 项 prototype 和 4 项真实 Desktop 测试。覆盖率为 statements 93.62%、branches 86.94%、functions 100%、lines 96.18%。真实 Desktop 测试验证会话删除、Provider 推理等级保存、结果轮询、原生页签隔离，以及媒体下载内容与复制结果。

# Harness ComfyUI v0.42.3

## managed CLI 的 Desktop 路由门禁

Harness 的 managed CLI route 声明 `desktopBrowserAccess: route-authenticated`。Desktop WebServer 只对该 route 跳过外层 Renderer 浏览器访问门禁，并把请求交给 Harness CLI route；Harness CLI route 继续验证前台 shell Tool Call 获得的短期 capability，缺少、过期或无效的 capability 返回 401。其他 Desktop WebServer route 继续使用 Renderer 浏览器访问门禁，并在普通浏览器访问关闭时返回 403。

`DSH_HARNESS_COMFYUI_CLI_API` 指向当前 Desktop 进程内部 WebServer 上的 Harness CLI route。Skill 的 managed CLI 命令把 Catalog、Generation 和图片读取业务请求发送到该 route。插件内置数据源客户端分别读取已保存的数据源 URL 和端口，并直接请求数据源服务。本版本保留原有 Skill、CLI 命令、环境变量名称、数据源地址和 Provider 配置。

## 验证与依赖

Desktop Stable 与 Beta 的完整 `corepack yarn check` 通过，Desktop PR #2 的 7 项 GitHub CI 全部通过，并以提交 `9f11761767f043b770d974de251a414451a002f2` 合入 Desktop `main`。Desktop 测试验证 route-authenticated route 缺少 Bearer capability 时返回 401、有效 capability 时返回 200，并验证同一 WebServer 上的普通 route 即使携带该 Bearer capability 仍返回 403。Harness 的真实 Desktop 测试使用 Desktop WebServer 且关闭普通浏览器访问，验证前台 Bash 通过 managed CLI 取得业务响应，并验证直接缺少 capability 的请求返回结构化 401。

完整 `pnpm quality` 通过：1041 项 unit/integration/Skills、55 项 contract/security、276 项 production、32 项 prototype 和 4 项真实 Desktop 测试成功。覆盖率为 statements 93.65%、branches 87.01%、functions 100%、lines 96.19%。完整依赖和生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。本版本没有增加或升级 Harness ComfyUI 依赖；Desktop 基线只前移到包含路由门禁修复的合并提交，Desktop 版本、Harness 宿主版本、Electron 版本和锁文件保持不变。

## 发布与部署

GitHub Release 只包含 Git tag 与 Release 记录，不附加产品安装包。生产部署保留 Git 忽略配置、会话、生成记录和媒体文件。

# Harness ComfyUI v0.42.2

## 数据源提示判定

`SourcePresetTip` 现在读取 Harness Settings 快照的生效配置 `value.configuration`。默认配置、base 配置和用户覆盖配置经过 schema 合成后，只要形成有效地址，`ComfyUI工作台预设` 就会执行 Catalog 探针；探针成功时页面保持无提示，探针失败时页面提示用户检查“ComfyUI → 数据源服务”的 URL、端口和服务状态。

回归测试使用同一份有效生效配置覆盖空、部分和完整用户覆盖层，并覆盖 Settings 加载、其他 Preset、连接失败、生效地址变化、旧探针取消及取消后的迟到失败。

## 验证与依赖

完整 `pnpm quality` 通过：1041 项 unit/integration/Skills、55 项 contract/security、276 项 production、32 项 prototype 和 4 项真实 Desktop 测试成功。覆盖率为 statements 93.65%、branches 87.01%、functions 100%、lines 96.19%。完整依赖和生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。

本版本继续使用 `config/desktop-baseline.json` 固定的 Desktop 2.0.6、Harness 0.1.2-rc.1 和 Electron 43.3.0。本版本的依赖、Desktop 基线和 Desktop 锁文件保持 `v0.42.1` 的内容。

## 发布与部署

GitHub Release 包含 Git tag 与 Release 记录，附件列表为空。生产部署保留 Git 忽略配置、会话、生成记录和媒体文件。

# Harness ComfyUI v0.42.1

## 独立 worktree 的受管开发配置

独立 worktree 执行 `pnpm dev:start` 或 `pnpm dev:restart` 时，启动器先读取仓库中的 Provider 与图片读取配置，再把配置物化到该 worktree 自己的 DSH home。仓库跟踪 `config/desktop-development-provider-settings.json` 和 `config/image-reader-profiles.json`，用于维护非凭据 Provider 设置、凭据引用名称和图片读取配置。

启动器只从主 checkout 的 Git 忽略私密来源 `.local/desktop-development/home/Library/Application Support/dsh-desktop-dev/harness` 读取声明的凭据，并把目标 Settings 和凭据文件写成权限为 0600 的独立文件。启动器不复制整份私密 Settings，不覆盖目标中未受管的 Settings namespace、凭据引用或凭据记录。缺少、无效或越界的配置会在启动 Desktop 前终止；`dev:status`、`dev:logs` 和 `dev:stop` 不物化配置。

## 验证与依赖

完整 `pnpm quality` 通过：1038 项 unit/integration/Skills、55 项 contract/security、276 项 production、32 项 prototype 和 4 项真实 Desktop 测试成功。覆盖率为 statements 93.63%、branches 87.02%、functions 100%、lines 96.19%。完整依赖和生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。

Vitest 默认排除 `.local` 运行目录，避免主 checkout 保存的 Stable Desktop 源码参与仓库测试文件筛选。本版本没有增加或升级 Harness ComfyUI 依赖，也没有修改 Desktop 基线或 Desktop 锁文件。

## 发布与部署

GitHub Release 只包含 Git tag 与 Release 记录，不附加产品安装包。生产部署保留 Git 忽略配置、会话、生成记录和媒体文件。

# Harness ComfyUI v0.42.0

## Desktop 基线与启动

本版本改用自有仓库 fzfz/dsh-desktop-anywhere 的 Stable workspace，固定提交为 26c6b6c3117d11787e679456c387d823923035f9。Desktop 版本为 2.0.6，Harness 宿主版本为 0.1.2-rc.1，Electron 版本为 43.3.0。

开发和生产启动器通过正式 Profile 安装插件，并根据当前启动 run 的 Renderer 健康记录、Host 监听端口归属和插件安装记录判断就绪。移动桥接端口不再是启动成功条件。独立 worktree 复用主 checkout 的业务依赖，并从固定 Stable workspace 解析宿主依赖。

## 会话、模型与媒体

自有 Desktop 基线补齐会话删除及失败重试、pi-ai 请求的真实会话 ID 请求头、模型目录和推理档位配置。请求头测试覆盖普通会话、显式传入子会话 ID 的模型请求及图片读取；子 Agent 自动执行路径不属于本次请求头端到端验证范围。

宿主执行生成模型、LoRA 和 Workflow 查询 CLI 时，通过 ELECTRON_RUN_AS_NODE=1 让 Electron 子进程以 Node 模式执行 .mjs 入口，避免把 CLI 当作桌面应用启动。真实 Desktop 下载测试将测试文件保存到临时目录，避免自动验收反复弹出系统保存窗口。

## 验证与依赖

迁移候选通过完整 pnpm quality：1038 项 unit/integration/Skills、55 项 contract/security、260 项 production、32 项 prototype 和 4 项真实 Desktop 测试成功。Desktop fork 的完整 yarn check 与七项 GitHub CI 均通过。

本版本未更改 Harness 项目的依赖版本。Desktop 将 pi-ai 与 pi-telemetry 精确固定到 0.84.4；2026-09-09 对两个精确版本的依赖公告查询返回空集合。

## 发布与生产数据

GitHub Release 提供版本标签和发布说明，不附加安装包。部署保留生产配置、会话和媒体原文件；新旧 Desktop 的用户目录不同，旧数据迁移须按单独的对象清单与验收方案执行。

# Harness ComfyUI v0.41.1

## 读图模型上传前的图片处理

读图服务在调用视觉模型前，先在内存中把有效图片无条件等比缩放至原宽高的 70%。PNG、JPEG、WebP 和 GIF 保持输入格式；PNG、WebP 和 GIF 保留透明像素，动画 GIF 与动画 WebP 保留帧数、各帧延时和循环次数。处理管线不添加背景、不移除 alpha 通道、不裁剪、不自动旋转，也不修改或上传用户原图。

系统 Provider 路径只把处理结果保存为 Harness Attachment；OpenAI-compatible 路径只把处理结果编码为保持原 MIME 类型的 Data URL。转换失败、输入或输出超过图片字节限制以及调用取消都会终止本次识别，系统不会回退上传原图。

## 依赖与自动化验证

本版本新增并精确固定运行时依赖 Sharp `0.35.4`。锁文件包含对应平台包，依赖构建脚本检查确认 Sharp 没有 lifecycle script。Harness ComfyUI 仓库的完整依赖与生产依赖审计均报告 critical 0、high 0、moderate 0、low 0；Desktop 依赖的已知漏洞见“Desktop 基线与生产部署”章节。

完整 `pnpm quality` 通过：1031 项 unit/integration、55 项 contract/security、255 项 production、32 项 prototype 和 2 项 Desktop 测试成功。覆盖率为 statements 93.63%、branches 86.96%、functions 100%、lines 96.19%。独立 Standards Review、独立 Spec Review、Skill CLI 参考文档语义 Review、发布文档语义 Review 和 `git diff --check` 均通过。

## 真实模型验收例外

隔离 Desktop 成功创建省略 Preset、显式 `harness-comfyui-cli-candidate` 和显式 `harness-comfyui-iteration` 的三个 Session，三个 Session 均发现 `local-image-reader`。`opencode-go/deepseek-v4-flash` 在首个模型步骤返回月度额度 `QUOTA`，`deepseek-official/deepseek-v4-flash` 返回 `MISSING_CREDENTIAL`，`opencode-go/muse-spark-1.2-contributor` 返回 `FORBIDDEN`。这些模型均未执行读图 CLI，因此本次验收没有视觉模型识别结果。用户获知该阻塞后，明确授权继续创建 PR、合入 `main`、发布 `v0.41.1` 并部署生产目录。

## Desktop 基线与生产部署

Desktop 继续使用提交 `f2a27b4461e8c15d21268533efb7b99bb9bb14f2`。Desktop 锁文件仍包含 `image-size 1.2.1`；该版本关联已记录的 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告。生产部署按照受控依赖安装流程保留该记录，并安装 Harness 新增的 Sharp `0.35.4`。

GitHub Release 提供版本标签和发布说明，不附加产品安装包。

# Harness ComfyUI v0.41.0

## 图片迭代的角色与交接

主 Agent 通过四个角色工具派发构图、生成、观察和比较任务。各子 Agent 的 system prompt 定义自己的工作步骤。主 Agent 指定每次要求、输入文件和输出文件，角色工具按配置模板组装任务消息。首次派发创建子会话，后续派发使用 agent_id 指向已有子会话，DSH 原生通知返回任务状态和最终答复。

迭代 Skill 定义理解故事与人物、推导画面目标和核心要素、生成、观察、比较和小步修改 Prompt 的循环。references/records.md 定义交接目录与文件名。旧的阶段模板和记录写入脚本已删除。

## 手动 Goal 与子 Agent 模型配置

ComfyUI迭代预设支持原生 /goal 命令。用户手动创建、修改、暂停、恢复和清除目标，主 Agent 读取已有目标并在达成后标记完成。

四个子 Agent 不再固定 reasoningEffort。原生 DSH 在父子 Provider 和模型相同时继承父 Agent 当前请求的档位，在 Provider 或模型变化且未指定档位时清除继承值，使用目标模型或 Provider 的默认行为。显式指定不支持的档位仍会报错。

## 依赖与自动化验证范围

Vitest 和 @vitest/coverage-v8 升级并固定到 4.1.11，锁文件同步更新配套包。自动化测试覆盖角色模板、首次及后续派发、权限、原生 Goal 命令、推理档位继承与模型能力校验，以及真实 Desktop 的预设与命令加载。

完整 `pnpm quality` 通过：1007 项单元与集成测试、55 项契约与安全测试、255 项生产测试、32 项原型测试和 2 项 Desktop 测试全部成功。覆盖率为 statements 93.54%、branches 86.79%、functions 100%、lines 96.17%。Harness 锁文件的全部依赖与生产依赖审计均报告 critical 0、high 0、moderate 0、low 0。

Desktop 继续使用提交 f2a27b4461e8c15d21268533efb7b99bb9bb14f2。其锁文件仍包含 image-size 1.2.1，该版本关联已记录的 GHSA-w3rx-r6r6-pgpr 和 GHSA-5p2g-fcmc-qvqq 两项安全公告。部署复用已有 Desktop 依赖。

## 人工测试发现的未解决问题

此前完整生图测试发现：子任务失败后主 Agent 接管其他角色；视觉观察存在人物肢体归属错误；比较将不确定证据判为通过；部分用户要求未达成时仍宣布完成；部分轮次记录缺失。这些问题尚未修复。本次推理档位修正及自动化检查不能作为完整生图流程验收通过的依据。

## 发布产物

GitHub Release 提供版本标签和发布说明，不附加产品安装包。

# Harness ComfyUI v0.40.1

v0.40.1 修复 OpenCode Go 模型调用缺少会话 ID 导致的 `400 MissingSessionID` 错误。

## 会话身份传递

- Desktop 适配器把真实 Session ID 传入 OpenCode Go 请求；重复调用和并发父子会话分别保留所属会话的身份。
- 图片读取 Tool 从当前 Agent 获取 Session ID，managed CLI 从已授权的调用身份获取 Session ID，并把它传入系统视觉模型调用。CLI 不接受用户提交的会话 ID 覆盖调用身份。
## 测试修复

Desktop 删除会话测试等待目标会话行出现后再打开菜单；目标行始终未出现时，测试仍然失败。

## 版本与部署依赖

- Desktop 基线更新为自有仓库提交 `f2a27b4461e8c15d21268533efb7b99bb9bb14f2`，对应已合并的 [Desktop PR #4](https://github.com/fzfz/dsh-desktop/pull/4)。[官方上游 PR #329](https://github.com/dataelement/dsh-desktop/pull/329) 已提交。
- 本版本没有增加或升级依赖。生产部署复用已有锁定依赖，并应用新 Desktop 提交中的适配器补丁。
- Desktop 锁文件仍包含 `image-size 1.2.1`；已记录的 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告保持不变。
- GitHub Release 发布 Git tag 与发布说明，不附加产品安装包。

# Harness ComfyUI v0.40.0

v0.40.0 新增 `comfyui-iterate-generation` Skill 和独立的 `ComfyUI迭代预设`。使用者选择该预设后，可以通过自然语言多轮迭代请求或 `/comfyui-iterate-generation` 开始任务。

## 新增迭代流程与预设选择

- 构图子 Agent 根据人物性格、片段经历和关系推导画面表达，再把主体、空间、焦点、逐光源照明与可见判据交给用户确认。故事中的道具、服饰和场所按表达作用选择，不自动成为成图必需项。
- 主 Agent 派发阶段子任务、转交构图确认稿、分配生成提交额度并更新任务记录；前台子 Agent 分别完成构图、Prompt、生成、Run 查询、观察、比较和归档。子 Agent 在执行前附加到父会话的 Workspace，使用真实子会话身份调用 `DSH_HARNESS_COMFYUI_CLI` 指定的 CLI。
- 新 Skill 按模型查询结果加载 `anima-prompt-builder`、`wai-sdxl-prompt-builder` 或 `krea2-anime-prompt-builder`，由 `comfyui-generate` 完成生成，使用 `local-image-reader` 和 `comfyui-image-review` 观察或诊断图片。阶段记录保存请求、Run、逐图观察、对照结果及最终配方，并区分同 Seed 诊断、新 Seed 复验、用户采用图片和未完成原因。
- `ComfyUI工作台预设` 继续作为默认预设。本版本没有修改此前七个项目 Skill 的文件或默认预设内容；单次生成仍可调用 `comfyui-generate`，单次读图仍可调用 `local-image-reader`。

## 实际验证与已知限制

- 使用 OpenRouter `deepseek/deepseek-v4-flash-0731`、推理等级 Max，完成子 Agent 真实提交图片生成请求、跨子 Agent Run 查询、图片读取及未完成归档。上述三个 Prompt Builder 均返回通过各自生成结果校验器的 JSON。
- 构图和合成决策测试仍出现无依据的心理或因果推断、单轮混入多个变量、预算范围混淆及观察证据补写。真实图像闭环没有完成成功复验，不能把此次接入验证理解为完整自主迭代验收通过。
- 主 Agent 将 Prompt、Workflow、逐图观察和比较记录保存在文件中，但委派消息仍在主会话上下文中积累；本版本没有为主会话上下文长度设置硬上限。
- 新 Skill 的 JSON 写入脚本和记录结构具有 20 项确定性测试；这些测试不代替模型输出的语义评审。

## 版本与部署依赖

- 本版本没有增加或升级 Harness ComfyUI 依赖，继续使用 DSH Desktop 提交 `5e08355a58bb727cb0f48c794550202d9d59ed9f`。
- Desktop 锁文件仍包含 `image-size 1.2.1`，已有检查记录其关联 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告。本次部署复用生产目录中已经安装的同一 Desktop 提交及依赖，不重新安装 Desktop 依赖。
- GitHub Release 发布 Git tag 与发布说明，不附加产品安装包。

# Harness ComfyUI v0.39.10

v0.39.10 删除三份 Prompt Builder 语义查询参考文档中关于 Harness 提供查询客户端、数据源 URL 和端口的文字，并修正查询条件、候选选择条件和错误处理动作中无法唯一理解的描述。

## Prompt Builder 查询规则

- `anima-prompt-builder`、`krea2-anime-prompt-builder` 和 `wai-sdxl-prompt-builder` 的参考文档只描述 Skill 执行者能够读取的上下文记录、查询工具、命令参数、返回字段和调用规则。
- 三份参考文档使用的 Search 与 Resolve 命令、查询路径、命令参数和返回字段保持不变。
- 三份参考文档明确规定上下文记录的类型、查询顺序、候选选择条件、Prompt 写入位置、查询超时后必须报告的参数、查询次数和结果复用条件。

## 验证与发布

- 三名独立语义 Reviewer 分别逐行审计一份 Prompt Builder 语义查询参考文档，三份文档全部通过语义审计。针对本版本全部变更的独立 Standards Review 和 Spec Review 均通过。
- v0.39.10 候选中的两个生产客户端连接 `http://127.0.0.1:18093` 的已部署数据源服务完成实时 discovery。语义查询客户端对 Base Model、Work、Character、Style 和 Prompt-term 执行 Search，并对 Character `id=39938` 和 Style `id=12344` 执行 Resolve；数据源读取客户端读取 ComfyUI 实例 `id=2` 和 Workflow bundle `id=43`。生产 `CatalogCli` 解析 Base Model `id=1`、`id=2`、`id=3`、生成模型 `id=1` 和 ComfyUI 实例 `id=2`；生产 `GenerationSourceCli` 解析实例 `id=2` 和包含 76 个 Workflow 节点的 bundle `id=43`。
- 完整 `pnpm quality` 通过：1005 项 unit/integration、55 项 contract/security、197 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.54%、branches 86.77%、functions 100%、lines 96.17%。Harness 锁文件的完整依赖与生产依赖审计结果均为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级 Harness ComfyUI 依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
- 本版本继续使用 Desktop 源码提交 `5e08355a58bb727cb0f48c794550202d9d59ed9f`。生产部署按照 Desktop `package-lock.json` 安装其中锁定的全部依赖，包括 `image-size 1.2.1`。`image-size 1.2.1` 关联 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告；用户已明确授权生产部署按照该锁文件安装依赖。部署验收者必须运行 `node_modules/node/bin/node --version`，并确认命令输出为 `v24.9.0`。

# Harness ComfyUI v0.39.9

v0.39.9 让采用 `ComfyUI工作台预设` 的 Session 直接读取当前 Harness ComfyUI checkout 中的七个 Repository Skills。Session 所属 Workspace 无须等于项目 checkout；该 Preset 也无须把七个 Repository Skills 复制或符号链接到真实 `$HOME/.agents/skills/`。

## Preset 范围的 Repository Skills

- `config/product-agent.json` 使用 schema version 2 保存 Repository Skills 相对路径和受管环境变量名称。Desktop 开发、Desktop 生产和 Web Host 调试启动链路都从该配置解析当前 checkout 的 `.agents/skills/`。
- `ComfyUI工作台预设` 的 filesystem provider 使用受管 `HARNESS_COMFYUI_SKILL_DIR` 作为唯一 `customSkillDirs` 来源，并设置 `includeDefaultRoots: false`。创建 Session 时，无论调用方省略 `agentPreset` 并默认采用该 Preset，还是显式选择该 Preset，调用该 Session 的 `remote.skills.list()` 时，该方法都会返回七个 Repository Skills。
- 显式选择 `ComfyUI工作台预设` 以外的 Preset（包括 `standard`）时，该 Session 不会从本 checkout 读取这七个 Repository Skills。`standard` Session 继续读取当前 Workspace 和用户 `DSH_AGENTS_HOME` 中的 Skills。

## Desktop 启动与迁移

- Desktop 启动器不再创建隔离 Desktop HOME 的 `.agents/skills` 项目链接。启动器只删除隔离 HOME 内普通 `.agents` 目录中的旧 `skills` 符号链接；`.agents` 是符号链接时，启动器保留该链接及其链接目标内容并报告冲突；`.agents` 是非目录路径时，启动器保留该路径及其内容并报告冲突。
- 受管 Repository Skills 目录必须存在、必须是普通目录、目录本身不得是符号链接，且真实路径必须位于当前 checkout 内。当受管 Repository Skills 目录不符合上述条件时，Desktop 启动器和 Web Host 启动器必须停止各自的启动流程，并且不得创建 Session。
- Desktop 的 `status`、`logs` 和 `stop` 命令只读取既有运行状态；Repository Skills 配置损坏时，这三个命令仍可用于诊断和停止进程。
- 生产迁移前检查的七个真实 `$HOME/.agents/skills/<skill-name>` 路径均不存在，本次迁移没有删除用户文件或符号链接。

## 验证与发布

- 完整 `pnpm quality` 通过：1005 项 unit/integration、55 项 contract/security、197 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.54%、branches 86.77%、functions 100%、lines 96.17%。Harness 锁文件的完整依赖与生产依赖审计结果均为 critical 0、high 0、moderate 0、low 0。
- 真实 Desktop 在 checkout 外的 Workspace 中创建了省略 `agentPreset` 的 Session；Session 创建结果返回 `agentPreset: harness-comfyui-cli-candidate`，该 Session 的请求上下文包含本 checkout 的七个 Repository Skills。真实 Agent 模型读取 `local-image-reader` Skill 并调用其图片读取 CLI 的 Tool Call 验收未完成：OpenCode Go 路由返回每周用量限制错误，DeepSeek 路由缺少 API Key，Contributor 路由不支持当前地区。用户收到上述阻塞说明后，授权继续创建 v0.39.9 PR、将该 PR 合入 `main`、发布 v0.39.9 并把 v0.39.9 部署到生产环境。
- 本版本没有增加或升级 Harness ComfyUI 依赖。本次 GitHub 发布只创建 Git tag 和 GitHub Release 记录，不上传产品包附件。
- 本版本继续使用 Git commit `5e08355a58bb727cb0f48c794550202d9d59ed9f` 对应的 Desktop。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告。用户已授权本次生产部署；生产部署完成后，部署验收执行者必须运行 `node_modules/node/bin/node --version`，并确认命令输出为 `v24.9.0`。

# Harness ComfyUI v0.39.8

v0.39.8 在 Harness 设置中提供统一的“ComfyUI”入口，并让 Harness-ComfyUI 通过插件发行包内置客户端访问本机或远程部署的数据源服务。Harness-ComfyUI 运行时不再读取或执行数据源仓库中的文件。

## ComfyUI 设置页

- “ComfyUI”设置页包含“图片读取”和“数据源服务”两个页签。“图片读取”页签继续使用现有的图片读取设置组件。该组件提供配置选择、新建、复制、删除、连接方式、模型参数和保存功能；使用者切换页签后，组件保留尚未保存的图片读取草稿。
- “数据源服务”页签分别保存完整的 HTTP 或 HTTPS URL 和端口。Host 的下一次数据源请求立即使用新设置，不要求重启 Harness。

## 内置数据源客户端

- 插件发行包包含语义查询客户端和数据源读取客户端。上下文插入、Host 语义 Tool、`anima-prompt-builder`、`krea2-anime-prompt-builder`、`wai-sdxl-prompt-builder`、ComfyUI 实例读取和 Workflow bundle 读取通过内置客户端请求已配置的数据源服务。
- 两个内置客户端负责构造数据源服务的请求路径和请求参数、解析响应并报告错误。Host 与 Skill 只向客户端提供已保存的数据源服务 URL 和端口，不要求数据源仓库位于 Harness-ComfyUI 所在机器。
- 仓库删除了运行时曾使用的数据源仓库客户端路径配置以及三份 source contract JSON。测试直接调用生产客户端，并核对客户端向真实数据源服务发送的请求和解析得到的业务结果。

## 预设启用提示

- 启用 `ComfyUI工作台预设` 时，如果使用者尚未保存数据源地址，Harness 会提示使用者打开“ComfyUI → 数据源服务”并保存 URL 和端口。
- 数据源服务检查请求失败时，Harness 会提示使用者检查已保存的 URL、端口和数据源服务状态。

## 验证与发布

- 真实数据源服务验收确认语义查询返回生成模型 `id=1`，数据源读取返回 ComfyUI 实例 `id=2` 和 Workflow bundle `id=43`。从实际候选发行包解压出的两个客户端也通过相同验收，发行包包含两个客户端且不包含 source contract JSON。
- 真实 Desktop 验收确认使用者可以打开统一设置入口、切换两个页签、使用图片读取设置组件、保存数据源设置，并在缺少数据源配置时看到 `ComfyUI工作台预设` 的配置提示。
- OpenRouter 模型驱动的真实 Desktop 会话加载 WAI Prompt Builder Skill。该 Skill 通过候选发行包内客户端查询 WAI Base Model 和水彩风格，解析 Style `id=12298`，并返回 `id=12298`、`base_model_id=2` 和 `prompt_text=fly`。Skill 自带的 Prompt 格式校验器和最终结果校验器均返回退出码 0。
- 自动化测试覆盖上下文插入、Host 语义 Tool、ComfyUI 实例读取和 Workflow bundle 读取的生产调用路径。
- 完整 `pnpm quality` 通过：1004 项 unit/integration、55 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.54%、branches 86.77%、functions 100%、lines 96.17%。Harness 锁文件的完整依赖与生产依赖审计结果均为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级 Harness ComfyUI 依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
- 本版本继续使用 Desktop `5e08355a58bb727cb0f48c794550202d9d59ed9f`。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，用户已明确授权执行该锁文件安装。部署验收必须确认 `node_modules/node/bin/node` 返回 `v24.9.0`。

# Harness ComfyUI v0.39.7

v0.39.7 修复 DSH Desktop 中“删除会话”调用不存在的问题，并在 Desktop 产品 overlay 中严格禁用 Kimi PPT adapter。用户删除会话时，聚合 Client 现在拥有与独立 Session Client 一致的 `session/delete` Remote；被禁用的 adapter 不再注册 PPT 按钮、三个会话扩展位、Kimi PPT Skill、PPT Tool 或模型系统提示词。

## 会话删除

- DSH Desktop 为 `@deepseek-ai/dsh-api-remotes@0.1.2-rc.1` 增加聚合 Client 的 `session/delete` schema 和 descriptor，使现有删除确认弹窗调用真实 Remote，而不是在浏览器中抛出 `this.remote.session.delete is not a function`。
- 真实 Desktop 测试覆盖删除失败和删除成功。测试模拟 `session/delete` Remote 返回失败时，目标 Session 继续保留；真实 Host 删除成功时，目标 Session 消失，其他 Session 不受影响。

## Kimi PPT 禁用

- DSH Desktop 的产品 overlay 继续保留唯一的 `experimental-kimi-ppt-standard-adapter` 声明，但把该声明设置为严格 `disabled: true`。后续同步 Desktop 上游时，结构化测试继续要求该 adapter 唯一存在且保持禁用。
- 真实 Desktop 测试确认 `conversation.hero.modeActions`、`conversation.input.accessory` 和 `conversation.composer.dock` 中都没有 `kimi-ppt` contribution，页面没有 PPT 按钮，Skill 列表没有 `kimi-ppt`，插件清单报告 adapter 已禁用，并且没有加载 `dsh-kimi-ppt` core bundle。
- 真实模型请求捕获确认系统提示词不包含 Kimi/PPT 片段，Tool 列表不包含 `pptd_` 或 `ppt_` 前缀的 Tool。

## Desktop 打包与版本识别

- DSH Desktop 不再把当前 Bundled `@deepseek-ai/dsh` manifest 版本静默写成旧 `0.1.2-alpha.1`；市场兼容性检查只接受当前安装 manifest 中的有效版本。
- Windows Desktop 打包现在把 `windows-hidden-console.mjs` 与 `harness-node-entry.mjs` 放在同一个 resources 目录。GitHub Windows 打包后冒烟测试已确认 Harness 能启动并创建 Workspace 与 Session。

## 验证与发布

- DSH Desktop 本地完整测试通过：86 个测试文件、717 项测试成功；typecheck、build、补丁 dry-run、独立 Standards Review、独立 Spec Review、语义 Review 和 `git diff --check` 全部通过。GitHub Windows 开发包构建和打包后 Harness 冒烟测试通过。
- Harness ComfyUI 完整 `pnpm quality` 通过：943 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.46%、branches 86.72%、functions 100%、lines 96.08%。
- 本版本没有增加或升级 Harness ComfyUI 依赖，也没有修改 DSH Desktop 锁文件。Harness 锁文件的依赖审计未返回漏洞公告。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
- 本版本使用 Desktop `5e08355a58bb727cb0f48c794550202d9d59ed9f`。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，发布记录继续保留这两项公告，用户已明确授权执行该锁文件安装。部署验收必须确认 `node_modules/node/bin/node` 返回 `v24.9.0`。

# Harness ComfyUI v0.39.6

v0.39.6 把会话结果列页签调整为“本会话媒体”“运行状态”的顺序，默认选择“本会话媒体”。输入框上方按钮在结果列关闭时显示“打开结果列”，在结果列打开时显示“关闭结果列”；用户点击该按钮会切换结果列的打开或关闭状态。

## 会话结果列交互

- 结果列按照“本会话媒体”“运行状态”的顺序显示两个页签，并在每次创建结果列组件时默认选择“本会话媒体”。
- 用户首次启用 ComfyUI 工作台时，结果列继续自动打开，输入框上方按钮显示“关闭结果列”。
- 结果列关闭时，输入框上方按钮显示“打开结果列”；用户点击该按钮后打开结果列，按钮同步显示“关闭结果列”。用户再次点击后关闭结果列，按钮恢复显示“打开结果列”。
- Harness 的聊天或工具详情入口直接打开详情列后，Client 把结果列状态同步为打开，输入框上方按钮显示“关闭结果列”；用户单击该按钮即可关闭详情列。
- 用户在结果列打开时切换已保存 Session 后，Harness 关闭详情列，Client 把结果列状态同步为关闭，输入框上方按钮显示“打开结果列”；用户单击该按钮即可重新打开结果列。

## 验证与发布

- 三个聚焦单元测试文件覆盖首次自动打开、工作台按钮触发的结果列打开与关闭、Harness 聊天或工具详情入口触发的详情列打开、已保存 Session 切换触发的详情列关闭、两种按钮文案、页签顺序、默认页签、双向页签切换和活动 Session 的 Run 刷新行为。
- 完整 `pnpm quality` 通过：943 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.46%、branches 86.72%、functions 100%、lines 96.08%。
- 本版本没有增加或升级 Harness ComfyUI 依赖。Harness 锁文件的依赖审计未返回漏洞公告。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
- 本版本继续使用 Desktop `4d40a23f2ec64801ead57cad70711a3554176e91`。生产部署按照 Desktop `package-lock.json` 安装全部锁定依赖，其中包含 `image-size 1.2.1`；该依赖版本关联 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，发布记录继续保留这两项公告，用户已明确授权执行该锁文件安装。部署验收必须确认 `node_modules/node/bin/node` 返回 `v24.9.0`。

# Harness ComfyUI v0.39.5

v0.39.5 修复会话 Agent 仍在运行时，新建 Run 偶发不出现在右侧“运行状态”的问题。此前，面板在查询结果为空或上一批 Run 全部结束后停止轮询；同一轮对话中的工具执行不会改变 `SessionSnapshot` 对象，后续创建的 Run 因此不能及时显示。

## Run 面板刷新行为

结果面板订阅 Generation Store 中的当前会话条目时，Generation Store 在会话 Agent 运行或查询结果包含活动 Run 的期间继续轮询。Agent 停止运行时，Store 立即查询一次，并继续跟踪尚未结束的 Run。最后一个订阅者退出或 Store 释放时，Store 清理请求和计时器；已经取消的请求即使稍后返回，也不会发布结果或恢复轮询。

## 验收结果

独立 worktree 中的真实 Desktop 会话通过两次独立 Bash 工具调用向 ComfyUI 提交两批生成请求。两批之间有 50.808 秒没有活动 Run；会话使用同一个 `SessionSnapshot`，且 `running` 持续为 true。面板分别在两个 Run 创建后的 772 毫秒和 984 毫秒显示对应卡片，在同一轮回复结束前显示 2 个 Run 和 2 个媒体。两项请求均成功，各保存一张 512×512 PNG；完整验收记录见[系统测试规范](system/testing.md#generation-结果刷新验证)。

最终候选树的完整 `pnpm quality` 通过：938 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.43%、branches 86.66%、functions 100%、lines 96.06%。取消测试使用的假 Chrome 在注册 SIGTERM 处理器后才发布就绪文件，消除了测试夹具自身的启动竞争。

## 部署版本与依赖公告

本版本继续使用 Desktop `4d40a23f2ec64801ead57cad70711a3554176e91`、Harness `0.1.2-rc.1` 与 Cordis `4.0.2`，没有新增或升级依赖。Harness 锁文件的依赖审计未返回漏洞公告。Desktop 锁文件中的 `image-size 1.2.1` 仍受两项高危公告影响；用户已允许安装该依赖。这两项公告为 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq`。

# Harness ComfyUI v0.39.4

v0.39.4 修正 DSH Desktop 的受控依赖安装说明。部署执行者必须在 `node_modules/node` 目录运行 `installArchSpecificPackage.js`，让脚本在该 Node 包的 `bin/node` 路径创建可执行文件。安装流程在 Desktop 根目录确定 npm cache 的绝对路径，进入 Node 包目录后继续使用同一缓存。

## 部署版本与验证

本版本继续使用 Desktop `4d40a23f2ec64801ead57cad70711a3554176e91`，其中包含官方上游 `8b018c9` 的完整合并和自定义模型推理等级修复。Node 版本仍为 `24.9.0`，其余锁定依赖没有变化。

完整 `pnpm quality` 通过：925 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%。Harness 锁文件的依赖审计未返回漏洞公告；Desktop 的 `image-size 1.2.1` 继续保留已记录且用户已允许安装的两项高危公告 `GHSA-w3rx-r6r6-pgpr` 与 `GHSA-5p2g-fcmc-qvqq`。

# Harness ComfyUI v0.39.3

v0.39.3 将 DSH Desktop 完整同步到官方上游 `8b018c991fe88abdb61939b280c3dbea020acfc8`，包含 PR #291 的自定义模型推理等级保存修复，并适配 DeepSeek Harness `0.1.2-rc.1` 与 Cordis `4.0.2`。

## 自定义模型的推理等级

- 用户在设置页重新编辑并保存模型的推理等级后，设置页会将旧 `reasoning.efforts` 转换为运行时识别的 `reasoningEfforts`。只打开设置页不会转换旧记录。
- 硅基流动与内网 cliproxyAPI 的六个已配置模型已通过真实 Desktop 验证：测试保存配置后进入新会话，确认用户可以为每个模型选择 Low、Medium、High、Max。两个未配置推理等级的模型保留原记录。
- 上游设置页移除了逐模型默认推理等级控件；用户在会话中选择推理等级。

## Desktop 与 Harness 接口适配

- Desktop 使用 `4d40a23f2ec64801ead57cad70711a3554176e91`，保留 `DSH_DESKTOP_MOBILE_BRIDGE_PORT` 指定监听端口的功能。
- OpenCode Go 模型清单使用 pi-ai `0.84.4` 原生数据，保留四个本地新增模型，移除旧 `0.84.3` 补丁，并采用上游对 Grok 4.5、Ox Alpha Free 和 Qwen3.8 Max 的清单调整。
- 图片读取设置使用新版 `RemoteError` 和设置注册接口；Host 通过 `Session.snapshotEvents()` 读取会话事件，并从事件中取得工具执行身份。该适配解决旧插件因已删除导出而无法加载的问题。

## 验证结果与依赖公告

Harness 的完整 `pnpm quality` 通过：925 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%。Desktop 的 711 项测试全部通过，类型检查和构建也通过。

Harness 锁文件的依赖审计未返回漏洞公告。Desktop 锁文件包含 `pptxgenjs 4.0.1 → image-size 1.2.1`；2026-09-05 的审计发现 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告，涉及图片解析无限循环。用户已明确允许安装该版本。

# Harness ComfyUI v0.39.2

v0.39.2 重写 ComfyUI Generate、WAI、ANIMA 和 Krea2 项目 Skill 的任务流程与 CLI 使用文档，使每条规则直接说明执行主体、操作对象、调用条件和结果，并删除 Krea2 Skill 已经不再调用的旧生成脚本与参考资产。

## Skill 任务流程与 CLI 合同

- 四个 Skill 的 `SKILL.md` 分别定义任务触发条件、任务分支、参考文件读取时机和最终结果；CLI 命令、JSON 输入、成功输出、错误处理、调用次数和结果复用集中在对应 CLI 参考文档中。
- 历史 Generation Run 查询按用户给出的一个或多个 `run_id` 调用 `generation run-inputs --stdin`，并逐项返回保存的生成参数与 Actual Workflow。该查询分支不再混入新图片生成所需的 Workflow、模型或 LoRA 选择规则。
- ComfyUI Generate 使用 `references/prompt-builder-model-routes.json` 比较 Prompt Builder 结果的 `model_route` 与生成模型的 `skill_name`；用户没有指定生成模型时，该检查使用 Workflow 模板保存的默认生成模型。当两个值不一致时，Skill 执行者报告两个值并停止提交生成任务；即使两个模型使用同一底模，该处理仍然适用。
- WAI Prompt Builder 直接调用 `node scripts/validate-output.mjs --prompt-format` 校验最终 Prompt，删除对不存在的 `run_skill_script` 和 `finalize_skill_error` 的引用。
- WAI、ANIMA 和 Krea2 Prompt Builder 读取当前消息中 `comfyui-context` 记录的 Character 与 Style 选择；三份 Skill 文档分别说明 Skill 执行者读取记录中的角色、作品、画师和 Prompt 内容的任务步骤与用途，并且不把 UI 操作过程写成 Skill 执行步骤。

## ANIMA、WAI 与 Krea2 参考资料

- ANIMA 的十二槽资料涵盖人物数量与身份、外观、服装状态、姿态与动作、表情、镜头、场景、细节和特殊主题。身体标记归入外观，情趣用品与束缚道具归入姿态与动作；`NTR`、`RBQ`、`Futa`、男娘和大车小孩等通用主题词保持可用。
- WAI 参考资料说明输入合同、画师信息的选用方式、Prompt 内容的排列顺序、构图分支、冲突处理、权重规则、格式校验以及各步骤的输入和输出，并分别定义生成结果合同与历史查询合同。
- Krea2 的风格预设、Prompt 规则、动作迁移约束和游戏服装资料只保留各自任务需要的画风、配色、人物、姿态和服装信息。游戏服装资料保留 50 个游戏的女性服装原型与配色。
- Krea2 Skill 删除未被 `SKILL.md`、CLI 文档、测试或保留脚本引用的旧 README、示例、背景与国风资料、联合索引、爬取说明、Python 生成器、自检脚本和生成器数据文件。当前输出校验器 `scripts/validate-output.mjs` 继续保留并由 Skill 调用。

## npm 漏洞查询诊断与测试

- 新增 `scripts/security/diagnose-advisories.mjs`。该脚本运行 `pnpm audit`，让 pnpm 根据当前 lockfile 向本地临时 registry 发送 bulk 请求；随后，该脚本复用该 bulk 请求的请求体，分别通过当前网络配置和强制直连访问 npm registry。
- 诊断矩阵检查 registry 域名的 DNS 解析、`GET /-/ping`、`POST /-/ping`、两个 security API 路径的 GET，以及 `POST /-/npm/v1/security/audits/quick` 和 `POST /-/npm/v1/security/advisories/bulk`，并记录 DNS、连接、TLS、首字节、总耗时、HTTP 状态与响应字节数。输出不包含依赖请求正文或代理地址。
- 新增 8 项故障分类测试、7 项参数、进程、超时与清理测试、1 项完整探针编排测试、1 项命令入口与输出测试和 1 项真实 pnpm 本地请求测试。其中，真实 pnpm 本地请求测试确认 `pnpm audit` 能够根据 lockfile 向本地 registry 完成 4,071 字节的 bulk 请求。诊断脚本的远端请求结果确认：使用当前网络配置或强制直连向两个 security API 发送 POST 请求时，所有请求都在 TLS 握手完成后因等待首字节而超时。

## 验收与发布

- 经明确授权，本次发布临时排除无法取得远端结果的 `security:advisories`。其余门禁全部通过：925 项 unit/integration、58 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%。
- 本版本没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.39.1

v0.39.1 修复图片读取设置页选择已保存配置后没有同步切换 Host 生效配置的问题，保留 Runtime 视觉模型返回的安全诊断字段，并把前台 Bash Tool 的默认超时从 60 秒提高到 180 秒。

## 图片读取失败诊断与配置生效状态

- Runtime 视觉模型以 error 或非调用者 aborted finish 结束时，`IMAGE_READER_PROVIDER_FAILED` 不再丢弃 Provider 已经返回的失败原因。Tool 与 managed CLI 的错误文案现在包含本次调用使用的配置名称、配置 ID、Provider、模型、温度、最大输出 Token 数、finish kind、failure code，以及 Provider 返回的可用 HTTP status、retry-after 和 request ID。
- Runtime 失败信息只保留明确的字段白名单。错误属性和输出不复制 Provider failure message、Settings credentials、自定义 endpoint、本次 prompt、图片输入或 AttachmentRef；允许输出的字符串会替换非法 UTF-16 与换行控制字符，并使用固定字段和总字符上限。
- 图片读取设置页把 Host 实际生效配置与当前编辑草稿分开显示。使用者选择已经保存的配置后，该配置立即通过专用激活请求生效，不需要再次点击保存；新建或复制但没有保存的配置只存在于当前页面，离开页面后丢弃，且不会参与图片读取。
- 已保存配置存在修改时，设置页提供保存并切换、放弃并切换和继续编辑三个明确动作。保存当前草稿并切换另一份已保存配置由 Host 在一次 Settings 提交中完成；外部 Settings 写操作已经切换活动配置时，普通保存不会隐式切回草稿来源配置。删除存在未保存修改的配置前也要求使用者明确放弃修改。保存、激活或删除成功或失败时，页面文案会分别说明被操作的配置和实际生效配置。
- Host 串行处理保存、激活和删除。新建请求不会覆盖同 ID 的已保存配置，更新请求不会重新创建已经被其他设置操作删除的配置，激活请求只修改 `activeProfileId`。保存、激活和删除的具体业务错误码会经过 Remote 边界到达设置页；Client 在写请求发出后采用 Host 返回的成功配置，避免本地取消把已经提交的状态误报为未生效。
- Desktop 前台 Bash 的默认超时从 60 秒提高到 180 秒。没有显式设置 `timeoutMs` 的 `comfyui-image-review` 图片读取 CLI 调用会使用该默认值，降低视觉模型冷启动或长输出在第一次调用时被 shell 提前终止的概率。
- 完整 `pnpm quality` 通过：924 项 unit/integration、39 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.47%、functions 100%、lines 96.06%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本变更没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。

# Harness ComfyUI v0.39.0

v0.39.0 为 ANIMA、WAI-Illustrious-SDXL 和 Krea2 Prompt Builder 增加模板无关的生成目的、画幅、清晰度和模型负向策略结果，并让 ComfyUI Generate 在提交每张图片前独立检查当前 Workflow 的实际参数能力、分配普通随机 Seed 和应用模型对应的正负 Prompt。

## Prompt Builder 生成结果

- 三个 Prompt Builder 现在返回同一份十属性结构化结果：模型路线、正向 Prompt、负向模式、负向 Prompt、正向规避、生成目的、画幅、宽度、高度和 megapixels。Builder 不解析、选择、校验、复用或返回 Seed 决定；历史查询仍可按原合同读取或报告包含 Seed 的 Actual Workflow。
- 每个 Builder 的 `generation-profiles.json` 分别定义该模型的 test 与 final 档。明确测试 Prompt 方向、比较 Prompt 方案、继续迭代、快速预览和批量筛选使用 test 档；用户结束测试并要求正式成图时使用 final 档。
- 画幅矩阵包含各模型适用的竖幅、横幅以及 `9:16`、`16:9`。Builder 根据画面构图选择目标画幅和清晰度，不依赖用户当前选择的 ComfyUI Workflow。
- ANIMA 与 WAI 使用原生负向 Prompt；Krea2 把避免崩坏、重复人物、裁切和低质量的要求自然写入正向 Prompt。详细字段、profile 和模型规则保存在各 Skill 的 reference 文件中，`SKILL.md` 只规定相应读取时机和 validator 阶段。

## ComfyUI Generate 的 Seed 与模板检查

- managed CLI 新增 `generation random-seeds --stdin`。该命令使用普通伪随机数为一次请求中的每张图片返回独立整数 Seed，支持 1 至 20 张，不新增随机源抽象或依赖。
- `comfyui-generate` 独占显式整数 Seed、历史 Run Seed、默认随机 Seed 和修正重试 Seed 的处理。默认多图请求展开为多个 `batch_size: 1` Run；同一项失败后的修正重试复用已经取得的 Seed，只有用户明确要求新随机尝试时才重新取得 Seed。
- managed CLI 新增只读 `generation inspect-template-parameters --stdin`。生成 Skill在取得实际模板 ID 与实例 ID 后调用该命令，再把 Builder 目标尺寸映射到当前 Workflow 返回的精确 `parameter_id`；检查命令不创建 Run、不修改 Workflow，也不调用官方 API Workflow 编译器。
- `ComfyWorkflowCompiler.inspectRuntimeParameters()` 与 `compile()` 共享同一个私有运行参数计划。该计划统一负责真实 `/object_info` 合同、连接关系、动态枚举、节点后缀、尺寸配对、末端尺寸覆盖、preset 映射和错误生成，不读取静态模板参数白名单。
- 尺寸检查只保留能够控制活动图片输出的候选，排除断开的输出和 ShowAnything 等非图片辅助输出。检查返回的精确宽高、画幅与 megapixels 或 resolution preset 参数可以由同一 compiler 直接应用到 Actual Workflow 与 API Workflow。

## 独立 worktree 的候选 Skill

- `pnpm dev:start` 把隔离开发 HOME 的 `.agents/skills` 链接到当前 worktree 配置的候选 Skill 根，使真实 Desktop Agent 验收当前分支内容。启动器拒绝缺失、非目录或越出当前 worktree 的候选路径。
- 生产 Desktop 继续读取真实 home 的全局 Skill 根，不使用开发 worktree 的候选 Skill。相关 production 与 worktree 生命周期测试固定这一边界。
- 完整 `pnpm quality` 通过：889 项 unit/integration、39 项 contract/security、139 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.22%、branches 86.06%、functions 100%、lines 95.96%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。

# Harness ComfyUI v0.38.7

v0.38.7 修复官方 ComfyUI 前端 Workflow 编译器在 DSH Desktop Electron Helper 中卡在 `Page.navigate` 的故障，为 Krea2 Anime Prompt Builder 增加作品、角色、Krea2 Style 与 Prompt 词条的只读语义目录查询，并使多个 linked worktree 可以同时运行隔离的 Desktop 和 Web Host。

## 官方 ComfyUI 前端编译与取消清理

- `OfficialApiWorkflowCompiler` 的 cache miss 路径在标准 Node.js Worker 中运行完整 `ChromeComfyFrontend`。Electron Helper 只通过版本化 stdin/stdout JSON 协议发送包含 Actual Workflow 的编译请求，并接收诊断和 Official Base API Workflow，不再在 Electron Helper 运行时中执行 CDP 编译。
- 编译器分别记录 browser-start、devtools-port、target-create、cdp-connect、domain-enable、navigation、request-interception、readiness 和 export 阶段及具体 operation。WebSocket `close/error`、target crash、阶段 deadline 和浏览器退出都会结算 pending command 并返回可处理错误。
- 每个 Worker 使用独立进程组拥有自己的 Chrome 后代。调用者取消时，Host 先发送 `SIGTERM` 允许 Worker 清理 Chrome 和临时 profile；宽限期后只强制终止该 Worker 进程组。Worker stdin 的异步写入失败返回结构化错误，不会成为 Host 未处理异常。
- 编译浏览器直接启动 headless Chrome，使用独立临时 profile、`--use-mock-keychain` 和 `--disable-features=DialMediaRouteProvider`，不通过 macOS LaunchServices 打开用户 Chrome。未配置实例认证时不启用 Fetch 拦截；配置认证时只向同源请求注入 Authorization。
- CLI 客户端在 Host 返回结果前断开时，Host route 中止当前 waiter，不继续占用前端编译资源，也不创建第二个 Run。
- 模板 42、实例 2 的生产复现请求在真实开发 Desktop 中生成 Run `run_3a877877-d96d-4815-bbcc-299c6a569b7f`。该 Run 进入 `succeeded`，同一 Harness Session 取回一张可读的 1024×1536 PNG，文件大小为 2,758,646 字节。

## Krea2 只读语义目录查询

- Krea2 Anime Prompt Builder 在 Character/Style 记录已提供非空 `data.prompt_text` 时直接采用该内容。记录缺少 `data.prompt_text` 时，Builder 可以使用记录 ID、名称和所属作品查询并消歧目录候选；只有被采用候选的 `prompt_text` 才会进入最终 Prompt。
- `references/semantic-query-cli.md` 定义 `imagegen-semantic-query` 的只读合同。Builder 通过本机回环 Catalog 服务查询 Krea2 底模、作品、角色、Krea2 Style 和 Prompt 词条；该 CLI 不创建 Generation Run、不构建最终 Prompt、不修改 Catalog 记录，也不读取本地图片。
- Builder 在首次查询前读取 live discovery 和目标路径帮助，按作品、角色、画师方向与视觉概念分别查询。Builder 逐项比较候选，不自动采用结果数组的第一项；必需角色缺少可采用 Prompt 内容时，Builder 报告具体角色并要求用户补充或重新选择。

## Linked worktree 并行开发运行环境

- `pnpm dev:start` 与 `pnpm web:start` 通过主开发 checkout 的 `.local/development-port-claims/` 声明当前 worktree 的运行端口。启动器在对应子进程监听声明端口后释放声明；并行 worktree 不再通过修改共享 `.env` 选择端口。
- `pnpm dev:start` 把 Electron Vite 输出写入当前 worktree 的 `.local/desktop-development/desktop-out/`。共享同一 DSH Desktop 源目录的多个 worktree 不再共同写入上游 `out/`。
- `pnpm dev:status` 返回当前 Desktop PID 与移动桥接端口；Web Host 的受管进程状态继续保存实际监听端口。Desktop 在端口状态或 PID 写入失败时终止已经启动的子进程，并清理当前 worktree 的两份进程状态。
- 生产 Desktop 继续从生产 checkout 的 `.env` 读取 `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT`。开发 Desktop 与独立 Web Host 忽略共享 `.env` 中的实例端口变量，并保留 Provider、Preset、Workspace 和模型配置的共享方式。
- 完整 `pnpm quality` 通过：857 项 unit/integration、33 项 contract/security、134 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.32%、branches 86.37%、functions 100%、lines 95.98%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本变更没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。

# Harness ComfyUI v0.38.6

v0.38.6 把用户提供的 Krea2 动漫提示词资产整理为仓库第七个项目 Skill `krea2-anime-prompt-builder`，增加单条 Prompt、历史 Generation Run 查询与动作迁移源图合同，并删除会创建或覆盖批量文件且对非法语言参数静默回退的自然语言批量脚本。

## Krea2 Anime Prompt Builder

- `.agents/skills/krea2-anime-prompt-builder/` 成为新的 canonical source。`SKILL.md` frontmatter 使用同名 `name`，`agents/openai.yaml` 提供 Skill 列表显示名称、简述和精确调用 `$krea2-anime-prompt-builder` 的默认文本。
- Builder 按当前用户文字、用户明确选定的历史正向 Prompt、Character/Style `data.prompt_text`、条件参考资料和 Krea2 默认设计的顺序构建一条 Prompt。当前明确要求发生不可消解冲突时，Builder 要求用户选择，不静默合并互斥画面。
- 展示路线允许用户指定自由姿态和镜头。舞蹈、姿态或动作迁移源图路线要求正面垂直中立站姿、完整四肢轮廓、两只鞋履与脚下余量、明确人物比例、标准透视和绚丽静态背景；该路线通过降低人物附近的背景细节和移动线索保持主体分离，不退回纯色或简单背景。
- Builder 成功构建 Prompt 时，最终回答直接以画面描述开头，只返回一个可直接输入 Krea2 的 Prompt 正文段落。Prompt 正文不添加“已读取资料”“完成自检”或“以下是 Prompt”等引导句，不返回独立负向 Prompt、候选版本、参数建议或制作备注，也不创建输出目录或编号文件。历史纯查询与停止分支继续返回各自合同规定的信息。
- `references/generation-cli.md` 使用项目规范规定的九个章节，按现有 CLI 行为完整定义受管前台 shell 中的只读 `generation run-inputs --stdin`、单次一至二十个完整或唯一短 Run ID、输入顺序、可用项 canonical Run ID、错误项请求 Run ID、逐项错误、命令级错误、外部状态恢复、无持久化副作用和完整示例。CLI 源码没有修改，Builder 不增加自动拆分查询或自定义历史结果协议。

## 退役的批量生成流程

- `scripts/gen_anime_v2.py` 已删除。该脚本原先按编号创建或覆盖提示词文件，并把非法语言参数静默改为默认语言；新的 Builder 不保留该调用入口或回退行为。
- `SKILL.md`、Skill README 和 `scripts/selftest.py` 已删除 v2 调用流程。`scripts/selftest.py` 只保留原有 v1 冒烟调用；`scripts/gen_anime_v1.py` 作为既有英文标签批量资产保留，但不属于 Builder 执行接口。
- 原动作迁移文档已收敛到 `references/motion-migration-constraints.md`，删除跨 Skill 共享源和简单背景说明。Builder 从动漫风格参考只采用渲染与配色内容，从游戏服装参考只采用服装、材质、穿戴配饰与色板；条件资料中的背景、动作、比例、构图和鞋履说明不参与执行。新的 Prompt 合同和动作迁移合同成为这些画面要素的唯一执行来源，其他国风素材、背景、汉服、Danbooru 和示例数据继续作为 Skill 自有保留资产存在。

## 验收与发布

- 新增 6 项结构合同测试，验证 canonical 目录、frontmatter、UI 元数据、Skill 内参考路径、CLI 参考章节、v2 文件删除和 v1 边界。历史 Run CLI/Runtime 的 50 项聚焦回归继续通过。
- 独立 Standards、Spec 和 Semantic Reviewer 已核对 Skill 执行流程、九章 CLI 合同、普通文字、Character/Style、历史查询与复用、动作迁移、冲突和错误矩阵；三类审查均返回 PASS。
- 完整 `pnpm quality` 通过：822 项 unit/integration、33 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.57%、branches 87.26%、functions 100%、lines 96.03%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.5

v0.38.5 允许每次图片读取调用覆盖当前配置的默认提示词，明确视觉模型正文继续使用普通字符串，并修复图片读取设置页保存、切换、回显和错误提示的问题。

## 图片读取本次提示词与当前配置保存

- `inspect_image` 与受管 `image inspect --stdin` CLI 新增可选 `prompt`。调用者提供该值时只覆盖本次视觉模型调用；省略时继续使用活动图片读取配置的 `defaultPrompt`。`local-image-reader` 与 `comfyui-image-review` 在用户指定本次观察要求时通过 CLI 传递完整的覆盖提示词。
- runtime 与 OpenAI 兼容视觉模型都可以返回普通字符串。OpenAI 兼容适配器只解析 Chat Completions 的 HTTP JSON 传输外壳，不解析 `message.content` 中的 JSON；`inspect_image` 继续把模型字符串包装为 `provider`、`model`、`file_path` 和 `observation` 四属性对象，CLI stdout 继续输出该对象的 JSON。
- 图片读取设置页只保存当前编辑配置。Host 串行执行每次保存或删除的完整 Settings 修改临界区，并在最新持久化列表中合并同 ID 配置或追加新配置；重叠请求不会根据旧快照覆盖先完成的修改，其他配置也不会因 Client 中未保存输入阻止当前配置保存。
- 设置页分别维护 Host 返回的持久化配置快照与一份当前可编辑配置。切换时必须先保存或放弃当前修改；放弃、切换和重新打开页面都会从持久化快照恢复非敏感值，API Key 输入框保持空白并显示已保存状态。
- OpenAI 兼容 API Key 使用 `keep`、`replace` 与 `clear` 三种明确动作。保存 runtime 配置会清除同 ID 的旧凭据；复制配置不复制 API Key。新建和复制配置在保存后追加，已保存配置通过独立 Remote 删除，未保存配置只在页面本地放弃。
- 配置名称、连接参数、模型、默认提示词、温度、最大输出 Token 数和 API Key 规则分别返回唯一错误码。设置页在具体输入项附近显示实际失败规则，并在保存按钮附近显示同一错误码的总结，不再使用 `IMAGE_READER_SETTINGS_INVALID` 枚举所有可能问题。
- 隔离开发 Desktop 的真实模型验收使用 `opencode-go/deepseek-v4-flash` Agent 和 `opencode-go/qwen3.7-plus` 图片读取模型。`standard` Preset 的三次 Tool 调用确认默认提示词、本次覆盖和后续恢复；`ComfyUI工作台预设` 的 Agent 实际读取更新后的 `local-image-reader` 与 CLI 参考，通过 managed CLI 传递覆盖提示词并取得 `observation: OVERRIDE_OK`。完整证据位于 [`.planning/image-reader-prompt-string/model-acceptance.md`](../.planning/image-reader-prompt-string/model-acceptance.md)。
- 完整 `pnpm quality` 通过：822 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。覆盖率为 statements 93.57%、branches 87.26%、functions 100%、lines 96.03%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。

# Harness ComfyUI v0.38.4

v0.38.4 在 Harness 向 ComfyUI 提交 Prompt 前验证每一个运行参数的目标输入合同，修复超出目标 `INT.max` 的 Seed 直到远端提交时才被拒绝的问题。

## ComfyUI 运行参数合同

- Workflow compiler 在写入 Actual Workflow 和提交 Prompt 前，依据目标实例提供的 `/object_info` 结构化合同校验每一个运行参数的 JSON 类型、整数性、精确数值范围、候选集合、`COMBO.multiselect` 数组成员和动态分支子输入合同。
- 数值合同保留 `/object_info` 原始 JSON 十进制令牌，因此能够在 JavaScript 非安全整数范围内拒绝超过目标 `INT.max` 的实际发送值；本次故障样本中的 Seed `12130929238470859000` 会在 Harness 内返回 `GENERATION_PARAMETER_INVALID`，不会提交给 ComfyUI。
- 未公开机器可判定合同的自定义 widget 只允许保持当前值；修改该值会返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`。目标节点的自定义 Python 校验仍由 ComfyUI 执行。
- 调用方收到 `GENERATION_PARAMETER_INVALID` 后必须按照错误中的目标类型、范围或候选集合修正参数；收到 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED` 后必须保留 Workflow 当前值或改用具有机器合同的输入；目标 ComfyUI 的自定义 Python 校验拒绝仍返回 `COMFYUI_PROMPT_REJECTED`，调用方必须根据 ComfyUI 返回原因修正参数。
- 完整 `pnpm quality` 门禁通过：742 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.39%、branches 87.2%、functions 100%、lines 95.9%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。独立 Desktop 验收使用 worktree 内隔离测试 workspace，没有读取或启动真实生产目录。
- Node.js `v22.19.0` 官方源码把 `JSON.parse` reviver source text 功能列入默认启用的 V8 shipping 功能；Node.js `24.14.0` 运行时能力测试验证 primitive reviver 保留原始数值 token，object/array reviver 不依赖 `context.source`。
- 本变更没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。

# Harness ComfyUI v0.38.3

v0.38.3 修复 ANIMA 与 WAI Prompt Builder 对普通 tag 和画师 tag 权重形式的错误拒绝，并为两个 Skill 增加按槽位或位置设计权重的理论、步骤与规范。

## Prompt Builder 权重合同

- ANIMA 前十一个 tag 槽位与 WAI 前十四个 tag 位置现在统一接受未加权 `payload`、默认权重 `(payload)` 和显式权重 `(payload:weight)`；ANIMA `natural_language` 与 WAI `relation_narrative` 继续保存关系文本，不应用 tag 权重外层。
- 两个校验器使用各自 Skill 内的 `prompt-weight-policy.json` 作为结构化单一来源，按同一 ASCII 十进制文法检查显式权重，要求数值有限且大于 0，并逐字符保留合法 weight 原文。
- 两个校验器按从左到右的转义对识别 payload 内的反斜杠、圆括号和方括号，拒绝未知转义、尾随反斜杠、未闭合外层、嵌套权重和外层内未转义的定界符。
- ANIMA `artist_style` 在解析权重外层后检查 payload 恰好以一个 `@` 开头。WAI `artist` 与普通 tag 使用同一个权重解析器；画师身份、来源、去重和一名画师对应一个数组元素继续由 Skill 执行者与语义自检负责。
- ANIMA 固定质量前缀和 WAI 默认质量段保持未加权；用户新增的其他质量 payload 可以使用合法权重外层。

## 槽位权重方法

- 两个 Skill 新增 `references/prompt-weighting.md`，为 ANIMA 十二槽和 WAI 十五位置逐项定义权重适用条件、来源优先级、冲突与重复删除顺序、强调预算和最终自检。
- Skill 执行者先确定完整 payload，再删除互斥、重复和同义视觉决定，最后按照“用户合法显式数值、合法 Character 或 Style 来源、主要或辅助作用、主视觉锚点、未加权”的顺序生成一次最终外层。
- 除用户明确提供权重以外，合法来源与自主设计产生的高于中性强度决定共同计入每个 Prompt 的默认强调预算；无竞争内容保持未加权，Skill 不为每个槽位机械增加权重。
- ANIMA 与 WAI 分别从各自 JSON 策略读取模型专用推荐档位。两个 Skill 不共享模型专用数值，Markdown 只引用 JSON 属性路径，不复制推荐数值。

## 验收与发布

- 新增 82 项 Prompt Builder 权重单元测试，覆盖两个公开校验函数与 CLI 的成功、拒绝、转义、画师、固定质量、组合顺序、退出码和错误合同。
- `ComfyUI工作台预设` 使用 `opencode-go/deepseek-v4-flash` 与 `Default` 推理等级完成六个真实模型用例：ANIMA 普通 tag 与两种画师形式、ANIMA Style 来源权重、WAI 普通 tag 与画师显式权重、WAI 主要/中性/辅助画师与去重，以及两个 Skill 的稀疏未加权 Prompt。完整请求、实际文件读取、校验器标准输入、退出码、标准输出和停止状态记录在 [`.planning/prompt-builder-weighting/model-acceptance.md`](../.planning/prompt-builder-weighting/model-acceptance.md)。
- 完整 `pnpm quality` 门禁通过：626 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.2

v0.38.2 修正 DSH Desktop 提供给 DeepSeek Harness 的 OpenCode Go 静态模型目录，使模型选择器不再列出已经退役的 `ox-alpha-free`。

## OpenCode Go 模型目录

- DSH Desktop 提交 `9a0a39416af44af636e426f8d627cdb80d0baa77` 继续使用 `@earendil-works/pi-ai@0.84.3`，并通过可重放的 patch-package 补丁只修改该依赖的 `dist/providers/data/opencode-go.json`。
- OpenCode Go 目录删除 `ox-alpha-free`，新增 `qwen3.8-flash`、`glm-5.3-flash`、`hy4-preview` 和 `grok-4.6`。
- OpenCode Go 当前 `/models` 仍返回的 `grok-4.5` 保持可选；`qwen3.8-max` 和其余既有模型继续使用 pi-ai 0.84.3 的原始元数据。
- DeepSeek Harness、`dsh-llm-pi-ai`、动态模型发现和客户端错误分类均未修改。OpenCode Go 模型选择器继续读取 DSH Desktop 提供的静态目录。

## 故障原因

- DSH Desktop 固定的 pi-ai 0.84.3 静态目录仍包含 OpenCode Go 于 2026-08-26 退役的 `ox-alpha-free`，因此模型选择器继续显示该退役模型。
- OpenCode Go 对 `ox-alpha-free` 请求返回 HTTP 401 和“模型不受支持”；当前 Harness UI 把该 HTTP 401 显示为 `AUTH` 与“API 密钥无效”。本版本仅从 DSH Desktop 的 OpenCode Go 静态目录删除 `ox-alpha-free`，不修改 Harness 的 HTTP 401 错误分类。

## 测试与发布

- DSH Desktop 的回归测试通过公共 `getBuiltinModels('opencode-go')` 入口核对完整目录、精确新增与删除集合、所有既有模型的完整元数据、pi-ai 0.84.3 版本和唯一补丁目标。fresh `npm ci` 成功重放补丁，566 项测试、类型检查和构建全部通过。
- Harness ComfyUI 的真实 Desktop 测试通过会话主模型选择器逐项搜索四个新增模型和保留的 `grok-4.5`，并确认 `ox-alpha-free` 不再出现；图片读取设置继续只列出支持图片输入的模型。
- 实际安装的 pi-ai 0.84.3 公共运行接口分别使用 `glm-5.3-flash` 和 `deepseek-v4-flash` 完成 OpenCode Go 真实网络最小对话。`glm-5.3-flash` 探针曾从 OpenCode Go 上游端点收到两次瞬时 HTTP 503，后续请求成功；HTTP 503 不属于 API 密钥错误，也不构成静态目录修复失败。
- 完整质量门禁通过：544 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级 Harness ComfyUI 依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.1

v0.38.1 使 `ComfyUI工作台预设` 的系统提示词只保留 ComfyUI 业务任务需要的项目自定义 persona、Skill、Tool 和运行时上下文。

## ComfyUI 工作台系统提示词边界

- `ComfyUI工作台预设` 新增 Preset-scoped DSH/Cordis component。该 component 从 `PromptAssembly.sections` 删除 `harness:identity`、`harness:source` 和 `app:web-surface` 三个 Harness 自维护段落。
- 该 component 保留自定义 persona、AGENTS instructions、Tool 使用说明以及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。
- Harness `standard`、`minimal`、`cordis` 和其他 Agent Preset 不加载该 component；这些 Preset 的系统提示词 assembly 保持原行为。
- 生产 Desktop、开发 Desktop 和 Web Host 的启动流程继续从同一份 canonical Agent Preset source 物化该 component 与 `ComfyUI工作台预设` composition。

## 测试与发布

- 真实 Cordis scoped waterfall 测试覆盖精确段落过滤、非匹配 Preset scope 隔离、下游异常原样传播、Preset scope 销毁后监听器清理和十类无效配置拒绝。
- 完整质量门禁通过：544 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.0

v0.38.0 为 DSH Desktop 的 Session Media Viewer 增加当前图片或视频的原文件下载功能。

## Session Media Viewer 原文件下载

- Modal footer 新增“下载原文件”按钮。按钮始终对应 iframe 当前显示的 Generation Media；用户切换媒体后，Modal 标题、完整 Run ID 和下载目标同步更新。
- Client 使用一次性临时锚点触发 Chromium 原生下载，不读取媒体 Blob、不创建 Object URL、不打开新窗口。保存目录和同名文件处理继续由 DSH Desktop 中 Chromium 的下载策略决定。
- Host 新增同源 `/api/harness-comfyui/media/<media_id>/download?session_id=<session_id>` 路由。该路由执行与查看页和媒体内容相同的 Session、workspace 与媒体归属校验，并流式读取 `/content` 使用的同一个 Saved Media 文件。
- 下载响应保留 Generation Media 记录中的 MIME 和 ComfyUI 原文件名。Host 使用 UTF-8 RFC 5987/8187 `filename*` 编码附件文件名，避免引号、控制字符或特殊字符形成额外响应头参数。
- Saved Media 缺失时 Host 返回 `GENERATION_MEDIA_NOT_FOUND`；响应开始后文件读取失败时 Host 销毁下载连接。Client 不显示无法从原生下载接口可靠确认的成功状态。

## 测试与发布

- 自动化测试覆盖下载 URL、原始字节、MIME、字节长度、安全 attachment、六类 Session/workspace 拒绝、文件缺失、非 GET、500、流中断、图片、视频、媒体切换、重复点击和临时锚点清理。
- 真实 Desktop 测试通过 Browser 级 CDP 下载事件和真实鼠标点击验证两项媒体的事件 URL、建议文件名、完成状态、接收字节数和落盘原始字节；测试同时验证 Modal 保持打开、Chromium page target 数量不增加，以及桌面宽度与 600 × 800 viewport 的 footer 布局。
- 完整质量门禁通过：544 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.7

v0.37.7 使 ANIMA 与 WAI Prompt Builder 按当前 Desktop 实际提供的消息内容读取普通文字和 ComfyUI 上下文。

## Prompt Builder 当前消息输入合同

- ANIMA Prompt Builder 删除 `noobai_user_prompt`、`ui_explicit` 和 `selection_order` 的过期定义，直接读取当前消息中的普通文字和 `type=comfyui-context` JSON 行。
- WAI Prompt Builder 删除 `noobai_user_prompt`、`selection_snapshot_version`、`selection_order` 和旧快照属性定义，Character 记录读取 `data.id`、`data.work_name`、`data.character_name` 和 `data.prompt_text`，Style 记录读取 `data.id`、`data.name` 和 `data.prompt_text`。
- 两个 Prompt Builder 均按 Character 和 Style JSON 行在当前消息中的出现顺序处理 UI 记录；历史 Generation Run 查询继续作为独立分支运行。

## 验收与发布

- 独立语义 Reviewer 完成四轮 Skill 文案审查，最终审查没有阻塞性或非阻塞性问题。
- 真实 Desktop 使用 `ComfyUI工作台预设`、`DeepSeek V4 Flash` 和 `Default` 推理等级，分别验证 ANIMA 与 WAI 的普通文字、Character/Style 上下文和纯历史 Run 查询。六项模型用例全部通过，两个 Prompt Builder 均未要求旧输入对象或旧输入属性。
- 发布门禁改为在独立 linked worktree 对最终候选树执行完整 `pnpm quality`、`git diff --check` 和必需的独立审查；仓库不再配置 GitHub Actions workflow。
- 完整测试通过：539 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.6

v0.37.6 修复 DSH Desktop 的 Session Media Viewer 无法复制完整 Run ID 的问题。

## Session Media Viewer Run ID 复制

- 原实现从媒体查看页 iframe 调用 Clipboard API；DSH Desktop 的权限合同只允许可信 loopback 主框架写入剪贴板，因此 iframe 请求被拒绝并显示“复制失败”。
- 媒体查看页 iframe 现在只发送包含 `type`、`mediaId` 和 `runId` 的当前媒体消息。Modal 主框架验证消息 origin、来源 iframe、消息结构和当前 Session 媒体映射后，在 iframe 上方显示当前完整 Run ID。
- 用户点击独立复制按钮后，Modal 主框架执行 Clipboard API 写入。复制成功时按钮显示“已复制”；Clipboard API 不可用或写入被拒绝时，Modal 提供重试或手动选择已显示 Run ID 的明确动作。
- 用户在复制 Promise 完成前切换媒体、关闭 Modal 或重新打开 Modal 时，旧请求不会覆盖当前媒体的复制状态。iframe 不再请求 `clipboard-write` 权限，DSH Desktop 的 iframe 权限策略保持不变。
- 主框架 Run ID 行支持完整文本选择、长值换行、键盘焦点、桌面宽度和 680px 以下窄屏布局。

## 测试与发布

- 完整测试通过：539 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%。
- 真实 Desktop 测试使用两项不同 Run 的媒体和 CDP 真实鼠标事件，分别验证媒体切换前后的完整 Run ID 复制状态与播报，并验证真实桌面宽度和 600 × 800 viewport 的主框架 Run ID 行布局。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.5

v0.37.5 把当前 Catalog 的全部 19 个 ComfyUI Workflow 模板纳入参数支持基线和实时编译矩阵。

## 全量 Workflow 模板验证

- 参数支持基线新增模板 43 `AnimaStandardV8_完整25步吃负面词`，记录实时编译确认的 11 个标准运行参数。
- 精确模板 ID 集合门禁继续要求 Catalog 中的每个模板都经过显式验收；矩阵不会跳过未登记的新模板。
- 实例 2 的实时 `/object_info` 验证确认 19/19 模板的参数支持基线、组合编译和 Official API Workflow 缓存 miss/hit 路径全部通过。
- 模板 39 与其他 18 个模板使用同一套矩阵和 compiler 行为；本版本没有增加单模板特判。

## 测试与发布

- 完整测试通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.4

v0.37.4 使 Host 按 Source v0.86.1 合同读取三字段 ComfyUI TemplateBundle，并由 Workflow compiler 根据目标实例实时节点定义发现活动输出节点。

## Source v0.86.1 适配

- `GenerationSourceCli` 读取 TemplateBundle 的 `id`、`title` 和 `workflow_json`，不再要求 Source 已删除的模板 revision、Workflow SHA-256、config revision、dimension strategy 和输出节点过滤器。
- `ComfyWorkflowCompiler` 根据目标实例实时 `/object_info` 的 `output_node: true` 标记与 Workflow 必需输入连线生成活动输出节点集合，并删除未满足必需输入的输出节点。
- Generation Runtime 继续把 compiler 返回的活动输出节点集合保存到 Run Repository，并把该集合交给 Comfy transport 筛选 Jobs API 输出。
- Source Configuration Profile 与结构化消费合同固定为 `0.86.1`；Source v0.84.0 合同和 ADR 保留为历史记录。

## 测试与发布

- Source adapter 回归测试验证三字段 TemplateBundle 成功解析和无效 Workflow 分支。
- Workflow compiler 回归测试验证活动输出节点发现、断开输出节点删除和没有活动输出节点时的明确失败。
- 完整测试通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.3

v0.37.3 修复 DSH Desktop production generation 中的 managed CLI 在 Node.js 24 下无法启动的问题。

## managed CLI 运行入口

- Desktop 与 Web Host 启动器现在使用仓库已有的 tsdown 0.22.2，把 `scripts/cli/harness-comfyui.mjs` 及其 TypeScript 依赖生成到 `.local/source-cli/harness-comfyui.mjs`。
- Host 注入 `DSH_HARNESS_COMFYUI_CLI` 时只提供构建后的 JavaScript 入口。在 managed CLI 相关文件中，DSH Desktop generation 复制 `.local/source-cli/` 构建目录，不复制 `scripts/cli/` 源入口。
- Desktop 与 Web Host 准备链都在发布 Profile 或 runtime state 前完成 CLI 物化；CLI 构建失败会中止准备，不会发布缺少可执行 CLI 的新运行状态。

## 故障原因

- v0.37.2 的 generation 把 `scripts/cli/harness-comfyui.mjs` 安装到 `node_modules/harness-comfyui`，该入口继续导入 `src/cli/contract.ts`。
- Node.js 24 拒绝对 `node_modules` 内的 TypeScript 文件执行类型剥离，因此目录查询、模板解析和 LoRA 解析在到达 Host route 前统一失败并返回 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。

## 测试与发布

- CLI 集成测试从临时 `node_modules/harness-comfyui/.local/source-cli/harness-comfyui.mjs` 执行全部命令合同。
- Host、Desktop、Web Host 与真实 DSH bash 测试覆盖构建后路径、generation 打包清单、准备失败原子性和 managed shell capability。
- 构建后的 CLI 已在 Node.js 24.9.0、24.14.0 与 25.8.2 下进入预期的受管环境校验，产物没有运行时 TypeScript import。
- 完整测试通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.2

v0.37.2 恢复从旧 Web 生产运行目录升级到 DSH Desktop 生产运行目录时没有迁移的 Session 数据。

## 生产 Session 迁移

- `prod:start` 和 `prod:restart` 在启动 DSH Desktop 前，把旧 `.local/production/dsh-home` 中的 Session 与 Attachment 合并到当前生产 DSH home。
- 启动器把旧 version 3 聚合 Session 投影索引转换为当前 version 4 逐 Session 索引，并按 Workspace 路径把旧 Session ID 合并到当前 Workspace 记录。
- 迁移保留当前生产 DSH home 中已经创建的 Session 和索引；重复启动不会覆盖当前文件，也不会删除旧运行目录中的原始数据。

## 测试与发布

- 生产生命周期测试验证 `prod:start` 在启动 DSH Desktop `preview` 前接入迁移，并同时保留旧 Session、新 Session、Session 投影索引、Attachment 和同路径 Workspace Session 关系。
- Session 迁移测试分别验证旧目录不存在、当前 DSH home 为空、旧源文件保留和重复调用不覆盖当前 Session 文件或投影索引。
- 真实 DSH Desktop `preview` 验收从旧生产 DSH home 种入保存 Session，并通过实际侧栏列出、选择和媒体结果读取证明迁移链路。
- 完整测试通过：529 项 unit/integration、29 项 contract/security、99 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。
- 覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.1

v0.37.1 修复 DSH Desktop `preview` 生产环境加载了错误 DSH home 的问题。

## 生产 Desktop 修复

- `prod:start` 现在把插件 generation、`ComfyUI工作台预设` 和 `.env` 链接准备到 `electron-vite preview` 实际使用的 `dsh-desktop-dev` user-data 目录；生产运行数据继续保存在 `.local/desktop-production/`。
- 生产与开发仍分别使用 `.local/desktop-production/` 和 `.local/desktop-development/`；两种环境不会共享 DSH home、PID、日志、Run Repository 或媒体文件。
- 真实 Desktop 验收现在执行生产 `preview`，并继续验证默认 Workspace、项目 Preset、Provider 与视觉模型保存、应用内媒体 Modal 和 managed shell capability。
- 真实验收通过 electron-vite 支持的双横线参数把远程调试端口传给 Electron；公开 `pnpm prod:start` 命令不启用远程调试。

## 测试与发布

- 完整测试通过：529 项 unit/integration、29 项 contract/security、96 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。
- 覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.0

v0.37.0 将 Harness ComfyUI 作为 generation 接入完整 DSH Desktop，并为开发、测试和生产环境提供独立的生命周期命令与运行目录。

## DSH Desktop 接入

- `prod:*` 在 Git tag checkout 中管理完整 DSH Desktop `preview` 进程；`dev:*` 在 linked worktree 中管理完整 DSH Desktop `dev` 进程；`web:*` 只管理独立 Web Host 调试进程。
- `dev:start` 和 `web:start` 为 linked worktree 创建指向主开发 checkout 的 `.env` 与 `node_modules` 符号链接。worktree 不复制 `.env`，也不安装第二份根依赖。
- 当前仓库启动器生成 Host 与 Client 模块并物化 `ComfyUI工作台预设`；DSH Desktop generation 安装器随后把当前插件包安装到隔离的 DSH home。开发、生产和 Web 调试分别使用 `.local/desktop-development/`、`.local/desktop-production/` 和 `.local/web-development/`。
- CI 与生产环境使用 `fzfz/dsh-desktop:codex/configurable-mobile-bridge-port`。该 DSH Desktop 分支读取 `DSH_DESKTOP_MOBILE_BRIDGE_PORT`；当前仓库从 `.env` 的 `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT` 读取端口并传给 Desktop。

## Desktop 产品行为

- Desktop 启动后直接打开 `config/desktop-production.json.startupWorkspacePath` 指定的 Workspace，并加载当前插件提供的默认 `ComfyUI工作台预设`、Provider 凭据、默认 Agent 模型和默认视觉模型。
- 图片读取设置从当前 Harness LLM Runtime 列出支持图片输入的系统 Provider 与模型；Provider 选择保存后重新打开设置仍保持原值。
- 项目 Skill 从当前 Harness WebServer 的实际动态地址取得 managed CLI endpoint 和短期 shell capability。`local-image-reader`、生成与历史查询 Skill 不再依赖固定 Web Host 端口。
- 用户点击结果图片或视频后，Client 在 DSH Desktop 原生 Modal 中打开同源媒体查看页；Client 不再创建浏览器新窗口。

## 测试与发布

- `pnpm quality` 包含真实 DSH Desktop 验收。真实验收覆盖 generation 安装、默认 Workspace、项目 Preset、Provider 保存后重开、应用内媒体 Modal、managed shell capability 和可配置移动桥接监听端口。
- 完整测试通过：529 项 unit/integration、29 项 contract/security、96 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。
- 覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
