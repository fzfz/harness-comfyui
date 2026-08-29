# 本会话媒体查看页导航与正面提示词需求方案

## 方案状态

- 方案版本：`proposal-1`
- 方案日期：2026-08-28
- 当前状态：等待用户批准
- 推荐界面：方案 A“原页增强”
- 实施门禁：用户明确批准界面方案和本需求方案后，本项目才能开始修改生产功能代码。

## 领域名词定义

- “用户”也是本方案的“计划审批者”。计划审批者负责选择界面方案，并明确批准或拒绝需求方案。
- “计划编写者”指用户批准前负责调查现状、编写需求方案和制作静态原型的 Agent。计划编写者不得修改生产功能代码。
- “计划执行者”指用户批准后负责修改生产功能代码、运行测试、提交仓库改动、发布版本和部署生产提交的 Agent。
- “Harness Session”指 DeepSeek Harness 中由 `sessionId` 唯一标识的一次会话。本文后续使用“Session”指代 Harness Session。
- “Harness workspace”指 DeepSeek Harness 中由 `workspaceId` 唯一标识的项目工作空间。本文后续使用“workspace”指代 Harness workspace。
- “Generation Run”指 `generation_runs` 表中由 `runId` 唯一标识的一次 ComfyUI 生成运行。本文后续使用“Run”指代 Generation Run。
- “Host”指运行 `src/host/` 模块、读取 `generation_runs` 表与 `generation_media` 表并注册媒体 HTTP 路由的 Harness 服务端插件。
- “Client”指运行 `src/client/` 模块、显示右侧“本会话媒体”标签页的 Harness 浏览器插件。
- “Remote 服务”指当前项目在 Host 与 Client 之间使用的 Typert Remote 调用通道。本方案不新增 Remote 服务。
- “Actual Workflow”指每个 Run 保存的、包含本次实际 ComfyUI 画布节点和参数的 Workflow JSON。
- “API Workflow”指 Host 最终提交给 ComfyUI `/prompt` 的执行 Workflow JSON。
- “本会话媒体序列”指 `GenerationRuntime.queryMedia({ workspaceId, sessionId })` 返回的全部媒体。该方法按照 `created_at DESC, output_index DESC, media_id DESC` 返回稳定的最新优先序列。
- “当前媒体”指媒体查看页 URL 中 `mediaId` 对应的本会话媒体记录。
- “较新媒体”指本会话媒体序列中位于当前媒体前一项的媒体。
- “较早媒体”指本会话媒体序列中位于当前媒体后一项的媒体。
- “正面提示词”指当前媒体所属 `generation_runs.request_json.parameters.positive_prompt` 保存的原始字符串。该字符串是 Host 编译 Actual Workflow 前接收的生成请求值；本方案不解析 ComfyUI 节点在执行阶段产生的通配符展开文本或其他派生文本。
- “媒体查看页”指本方案新增的 HTML 页面，不指当前直接返回图片或视频字节的 `/content` 路由。

## 必须要实现的目标

### 1. 媒体入口

- `src/client/workbench/results-drawer.tsx` 中的媒体卡片必须继续在新浏览器标签页打开媒体。
- 媒体卡片必须把链接目标从 `/api/harness-comfyui/media/<media_id>/content` 改为 `/api/harness-comfyui/media/<media_id>/view`。
- 媒体卡片中的图片或视频缩略预览必须继续读取现有 `/content` 路由；本方案不得改变右侧“本会话媒体”标签页的筛选、分页和缩略图布局。

### 2. 媒体查看顺序

- 媒体查看页必须使用 `GenerationRuntime.queryMedia({ workspaceId, sessionId })` 返回的完整顺序。
- 左侧箭头必须切换到较新媒体，右侧箭头必须切换到较早媒体。
- 左侧箭头必须显示“较新”，右侧箭头必须显示“较早”。两个箭头的无障碍名称必须包含方向、相邻媒体在序列中的位置和相邻媒体生成时间。
- 当前媒体是第一项时，媒体查看页必须保留并禁用左侧箭头。
- 当前媒体是最后一项时，媒体查看页必须保留并禁用右侧箭头。
- 媒体查看页不得从最后一项循环到第一项，也不得从第一项循环到最后一项。

### 3. 鼠标与键盘交互

- 用户点击左侧或右侧箭头后，媒体查看页必须同步更新媒体内容、媒体标题、当前序号、生成时间和正面提示词。
- 用户按没有 `Alt`、`Control`、`Meta` 或 `Shift` 修饰键的 `ArrowLeft` 或 `ArrowRight` 后，媒体查看页必须执行与对应箭头完全相同的切换。
- 媒体查看页处理裸方向键时必须阻止浏览器默认水平滚动或视频快进后退行为，使方向键在该页面保持唯一的媒体切换语义。
- 媒体查看页切换当前媒体后必须调用 `history.replaceState` 把地址更新为当前媒体的 `/view` 地址。用户刷新页面后必须仍然打开刷新前的当前媒体。
- 媒体查看页切换当前媒体后必须通过 `aria-live="polite"` 文本说明新的媒体序号、标题和生成时间。

### 4. 媒体显示

- 图片和视频必须使用 `object-fit: contain` 显示完整内容。媒体查看页不得裁切图片或视频。
- 视频必须保留浏览器原生播放控件。
- 桌面页面左右箭头必须相对媒体舞台垂直居中。
- 窄屏页面必须缩小箭头按钮并隐藏可见方向说明；箭头图标和完整无障碍名称必须保留。
- 媒体内容加载失败时，媒体查看页必须显示“媒体文件不存在。请返回会话并刷新本会话媒体列表。”，不得只留下浏览器破图图标或空白视频框。

### 5. 正面提示词显示

- 媒体查看页必须在当前媒体下方显示“正面提示词”标题和完整正面提示词。
- 媒体查看页不得修改、翻译、重新排序或截断保存的正面提示词。
- 长正面提示词必须自动换行。提示词区域超过页面可用高度时，提示词区域必须提供独立纵向滚动，不得把左右箭头移出媒体舞台的垂直中心。
- `positive_prompt` 不存在、不是字符串、是空字符串或只包含空白字符时，媒体查看页必须显示“这项媒体的生成记录没有保存正面提示词。”。
- 媒体查看页不得显示 `negative_prompt`、完整 `request_json`、Prompt ID、实例凭据或媒体文件系统路径。

### 6. 推荐界面

计划执行者在用户没有选择其他方案的情况下必须实施方案 A“原页增强”。该方案保留当前原始媒体页的深色沉浸画布，两侧箭头悬浮在媒体舞台边缘，正面提示词使用媒体下方的独立深色面板。

| 静态方案 | 结构特点 | 适用判断 |
| --- | --- | --- |
| A“原页增强” | 深色媒体舞台、悬浮箭头、独立提示词面板 | 最接近当前打开原文件的体验，改动意图最直接；本方案推荐 |
| B“时间边轨” | 箭头位于独立时间轨道，媒体完全不被按钮覆盖 | 时间方向最明确，但左右轨道占用更多横向空间 |
| C“画册说明” | 浅色居中画框，提示词作为媒体图注 | 阅读最安静，但与当前原始媒体页的视觉变化最大 |

## 数据和路由设计

### 1. Client URL 合同

- `src/generation/contract.ts` 必须新增 `generationMediaViewerUrl(mediaId, sessionId)`。
- `generationMediaViewerUrl()` 必须生成 `/api/harness-comfyui/media/<encoded_media_id>/view?session_id=<encoded_session_id>`。
- `generationMediaContentUrl()` 和 `generationMediaWorkflowUrl()` 必须保持现有行为。

### 2. Runtime 正面提示词读取

- `src/host/generation/generation-runtime.ts` 必须新增 `positivePromptForRun(runId)`。
- `positivePromptForRun(runId)` 必须读取 `generation_runs.request_json`，复用现有 `generationRequest()` 结构校验，并只返回 `parameters.positive_prompt` 的原始字符串或 `null`。
- `positivePromptForRun(runId)` 不得向调用者返回完整 `GenerationRequest`。
- 本方案不得新增 SQLite 表、SQLite 列或 schema migration。

### 3. Host 媒体查看页

- `src/host/generation/media-routes.ts` 必须接受现有媒体前缀下的新 `view` 子路由。
- `view` 子路由必须复用现有 `session_id`、workspace 和媒体归属校验。媒体记录不属于指定 Session 或 workspace 时，Host 必须返回 404。
- `view` 子路由必须读取本会话完整媒体序列，并为每项媒体读取所属 Run 的正面提示词。
- `src/host/generation/media-viewer-page.ts` 必须成为媒体查看 HTML、CSS、启动数据结构和浏览器交互脚本的唯一生产来源。
- Host 写入 HTML 的启动 JSON 必须把字符 `<` 序列化为 `\u003c`，防止正面提示词关闭启动数据的 `<script>` 标签。浏览器脚本必须使用 `textContent` 写入媒体标题和正面提示词。
- `view` 响应必须包含 `content-type: text/html; charset=utf-8`、`cache-control: no-store`、`x-content-type-options: nosniff` 和 `referrer-policy: no-referrer`。
- `view` 响应必须包含 `content-security-policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`。页面不得加载该策略以外的资源。
- `view` 页面不得请求新的 Remote 服务，不得增加新的 Client 持久化状态，也不得安装新依赖包。

### 4. 查看页启动数据

`media-viewer-page.ts` 内部必须定义 `GenerationMediaViewerItem`。每个 `GenerationMediaViewerItem` 只允许包含以下属性：

| 属性 | 用途 |
| --- | --- |
| `mediaId` | 更新当前媒体地址和元素标识 |
| `mediaKind` | 在图片元素和视频元素之间选择 |
| `filename` | 当前媒体标题和替代文本 |
| `createdAt` | 当前时间和相邻媒体时间说明 |
| `contentUrl` | 读取现有媒体字节 |
| `viewerUrl` | `history.replaceState` 更新当前地址 |
| `positivePrompt` | 显示保存的正面提示词或明确缺失状态 |

启动数据不得包含 `relativePath`、`promptId`、`negative_prompt`、完整 `request_json`、Actual Workflow 或 API Workflow。

## 实施文件清单

用户批准后，计划执行者预计修改或新增以下生产文件。计划执行者在实施前必须根据实际差异确认文件清单；计划执行者不得因为本方案添加无关模块。

| 文件 | 生产改动 |
| --- | --- |
| `src/generation/contract.ts` | 新增媒体查看页 URL 函数 |
| `src/host/generation/generation-runtime.ts` | 新增按 Run 读取正面提示词的窄接口 |
| `src/host/generation/media-viewer-page.ts` | 新增方案 A 的生产媒体查看页生成器和浏览器交互 |
| `src/host/generation/media-routes.ts` | 注册并返回 `view` 页面 |
| `src/host/plugin.ts` | 把媒体查看页需要的 Runtime 方法注入现有媒体路由注册参数 |
| `src/client/workbench/results-drawer.tsx` | 把媒体卡片的新标签页链接改为查看页 URL |
| `tests/unit/generation-contract.test.ts` | 覆盖媒体查看 URL 编码 |
| `tests/unit/generation-runtime.test.ts` | 覆盖正面提示词存在、缺失、空白、错误类型和不存在 Run |
| `tests/unit/generation-media-viewer-page.test.ts` | 覆盖启动数据、HTML 安全序列化、图片、视频、边界和缺失提示词 |
| `tests/integration/generation-media-routes.test.ts` | 覆盖 `view` 路由归属校验、响应头、本会话排序和数据最小化 |
| `tests/unit/results-drawer.test.tsx` | 覆盖媒体卡片查看页链接和现有缩略预览内容链接 |
| `src/client/styles.css` | 仅在媒体卡片链接需要新的明确焦点样式时修改；查看页样式不得写入该文件 |

## 测试与验证方案

### 自动测试分支

- URL 合同测试必须覆盖 media ID 和 Session ID 的 URL 编码。
- Runtime 测试必须覆盖字符串提示词、缺失键、空字符串、空白字符串、非字符串值和不存在 Run。
- 页面生成器测试必须覆盖图片、视频、第一项、末项、单项 Session、长提示词、缺失提示词和包含 `</script>` 的提示词。
- 页面浏览器脚本测试必须覆盖鼠标左箭头、鼠标右箭头、`ArrowLeft`、`ArrowRight`、带修饰键的方向键、URL 更新、刷新保持当前媒体和 `aria-live` 更新。
- 媒体路由集成测试必须覆盖合法 Session、错误 Session、跨 workspace 媒体、缺失媒体、非 GET 请求和响应数据不包含未授权运行信息。
- Client 组件测试必须证明媒体卡片的新标签页链接使用 `/view`，缩略图仍使用 `/content`。

### 仓库质量门禁

计划执行者必须依次运行定向测试、`pnpm typecheck` 和 `pnpm quality`。计划执行者不得降低覆盖率阈值、删除现有测试或跳过失败门禁。

### 独立 worktree 界面验证

- 计划执行者启动真实 Harness Host 前必须再次读取 `docs/agents/worktree-development.md`。
- 计划执行者必须使用 `pnpm worktree:start` 保持前台运行，并在第二个终端运行 `pnpm worktree:status` 和 `pnpm worktree:health`。
- `status` 必须返回 `running`，`health` 必须返回 `passed`。
- 计划执行者不得使用 `pnpm prod:*` 作为独立 worktree 开发验证入口。
- 计划执行者完成验证后必须运行 `pnpm worktree:stop`，并确认 `pnpm worktree:status` 返回 `stopped`。

### 发布与部署

用户批准并且所有质量门禁通过后，计划执行者必须提交并推送批准的仓库改动，等待 GitHub CI 通过，按照 `docs/system/releasing.md` 发布所需版本，并把最终发布提交部署到生产 checkout。生产 checkout 的现有配置和运行数据必须保留。

## 验收清单

- [ ] 用户从右侧“本会话媒体”标签页点击任意图片后，新标签页打开媒体查看页。
- [ ] 用户从右侧“本会话媒体”标签页点击任意视频后，新标签页打开媒体查看页并可以播放视频。
- [ ] 视频元素显示浏览器原生播放控件；用户可以使用原生播放控件播放、暂停和调整播放位置。
- [ ] 左右箭头在媒体舞台两侧垂直居中。
- [ ] 两个箭头的无障碍名称包含“较新”或“较早”、相邻媒体序号和相邻媒体生成时间。
- [ ] 点击左侧箭头切换到较新媒体。
- [ ] 点击右侧箭头切换到较早媒体。
- [ ] 每次点击箭头后，媒体内容、媒体标题、当前序号、生成时间和正面提示词同时切换到同一个目标媒体。
- [ ] 裸键盘左右键执行与对应箭头相同的切换。
- [ ] 带修饰键的方向键不切换媒体。
- [ ] 每次媒体切换后，`aria-live="polite"` 区域播报新的媒体序号、标题和生成时间。
- [ ] 首项禁用左侧箭头，末项禁用右侧箭头，单项 Session 同时禁用两个箭头。
- [ ] 首项禁用箭头显示“当前媒体已是本会话最新媒体”，末项禁用箭头显示“当前媒体已是本会话最早媒体”。
- [ ] 用户在首项点击左侧箭头或按裸 `ArrowLeft` 后仍停留在首项；用户在末项点击右侧箭头或按裸 `ArrowRight` 后仍停留在末项。
- [ ] 媒体导航不会跨越当前 Session。
- [ ] 当前媒体 URL 随切换更新，刷新后仍显示刷新前的媒体。
- [ ] 图片和视频完整显示，没有裁切。
- [ ] 390px 宽度页面没有水平滚动条，两个箭头图标位于视口内，箭头无障碍名称保持完整。
- [ ] 当前媒体下方显示生成时保存的完整正面提示词。
- [ ] 超过提示词区域可用高度的正面提示词在提示词区域内部纵向滚动，两个箭头仍与媒体舞台垂直中心对齐。
- [ ] 缺失正面提示词时显示明确缺失文案。
- [ ] 包含 `</script>` 的正面提示词不能关闭启动数据脚本、创建新 HTML 元素或执行脚本；页面必须原样显示该文本。
- [ ] 浏览器脚本只使用 `textContent` 写入媒体标题和正面提示词，不使用运行数据构造 `innerHTML`。
- [ ] `view` 响应包含方案规定的 `content-type`、`cache-control`、`x-content-type-options`、`referrer-policy` 和完整 Content Security Policy。
- [ ] 页面不显示负面提示词、完整生成请求、Prompt ID、实例凭据或媒体文件系统路径。
- [ ] 媒体文件缺失时显示明确的返回会话刷新提示。
- [ ] 用户没有另选界面方案时，生产媒体查看页的页面结构、深色画布、悬浮箭头和独立提示词面板与方案 A“原页增强”一致。
- [ ] `generationMediaContentUrl()` 和 `generationMediaWorkflowUrl()` 的现有返回行为保持不变。
- [ ] 仓库改动不包含新的 SQLite 表、SQLite 列或修改 SQLite 表结构的迁移文件。
- [ ] 仓库改动不包含新的 Remote 服务、Client 持久化状态或依赖包。
- [ ] 自动测试、`pnpm typecheck`、`pnpm quality`、GitHub CI、版本发布和生产部署全部通过。

## 要求追踪表

| 必须实现要求 | 自动测试或人工验收对象 |
| --- | --- |
| 媒体卡片打开 `/view`，缩略图继续读取 `/content` | `tests/unit/results-drawer.test.tsx`；验收清单前两项 |
| 本会话媒体序列使用 `created_at DESC, output_index DESC, media_id DESC` | `tests/integration/generation-media-routes.test.ts`；人工核对五项不同时间与输出序号的 Session |
| 左侧箭头切换到较新媒体，右侧箭头切换到较早媒体 | 页面浏览器脚本自动测试；验收清单的左右箭头切换条目 |
| 第一项保留并禁用左侧箭头，最后一项保留并禁用右侧箭头 | `tests/unit/generation-media-viewer-page.test.ts`；验收清单的首项、末项和单项 Session 条目 |
| 第一项与最后一项不得循环 | 页面浏览器脚本自动测试分别模拟边界点击和裸方向键；验收清单的首末项停留条目 |
| 箭头可见文字和无障碍名称包含时间方向、相邻序号与相邻生成时间 | 页面生成器自动测试；验收清单的箭头无障碍名称条目 |
| 点击与裸键盘方向键同步更新全部当前媒体信息 | 页面浏览器脚本自动测试；验收清单的点击、键盘和同步更新条目 |
| 带 `Alt`、`Control`、`Meta` 或 `Shift` 的方向键不得切换媒体 | 页面浏览器脚本自动测试；验收清单的修饰键条目 |
| 裸方向键阻止浏览器默认水平滚动或视频快进后退 | 页面浏览器脚本自动测试断言 `preventDefault()`；人工键盘验收 |
| URL 切换与刷新保持当前媒体 | 页面浏览器脚本自动测试；验收清单的 URL 条目 |
| `aria-live` 和箭头无障碍名称 | 页面浏览器脚本自动测试；验收清单的无障碍名称和播报条目 |
| 图片和视频使用 `object-fit: contain` 完整显示 | 页面生成器自动测试；桌面与 390px 人工验收 |
| 视频保留浏览器原生播放控件 | 页面生成器自动测试断言视频 `controls` 属性；人工播放、暂停和调整播放位置验收 |
| 桌面箭头与媒体舞台垂直中心对齐 | 页面生成器结构测试；1280×720 人工测量验收 |
| 窄屏缩小按钮、隐藏可见方向说明并保留完整无障碍名称 | 页面生成器自动测试；390px 人工验收 |
| 媒体文件加载失败时显示指定错误文案 | 页面浏览器脚本自动测试模拟图片和视频加载错误；验收清单的媒体文件缺失条目 |
| 完整正面提示词、长文本滚动和缺失状态 | Runtime 自动测试、页面生成器自动测试；验收清单的提示词条目 |
| 正面提示词不得修改、翻译、重新排序或截断 | Runtime 与页面生成器自动测试使用包含换行、标点和非 ASCII 字符的固定字符串；人工逐字符核对 |
| 查看页不得显示负面提示词、完整生成请求、Prompt ID、实例凭据或文件系统路径 | 页面生成器自动测试、媒体路由集成测试；验收清单的数据最小化条目 |
| HTML 启动数据安全写入和最小数据集合 | 页面生成器自动测试、媒体路由集成测试；验收清单的 `</script>`、`textContent` 和数据最小化条目 |
| Session/workspace 归属和媒体路由响应头 | 媒体路由集成测试；验收清单的不跨 Session、响应头和 Content Security Policy 条目 |
| 用户没有另选界面时必须实施方案 A | `tests/unit/generation-media-viewer-page.test.ts` 的方案 A 页面结构快照；验收清单的默认方案 A 条目 |
| `generationMediaContentUrl()` 和 `generationMediaWorkflowUrl()` 保持现有行为 | `tests/unit/generation-contract.test.ts` 的现有函数回归断言；现有媒体内容与 Workflow 路由集成测试 |
| 不得新增 SQLite 表、SQLite 列或修改 SQLite 表结构的迁移文件 | Git 差异审查；数据库初始化与媒体路由集成测试 |
| 不得新增 Remote 服务、Client 持久化状态或依赖包 | Git 差异审查 `src/generation/remote.ts`、Client 状态模块、`package.json` 和 `pnpm-lock.yaml` |
| 质量、发布和生产部署 | `pnpm typecheck`、`pnpm quality`、GitHub CI、版本发布记录和生产部署记录 |

## 非本次目标

- 本方案不改变右侧“本会话媒体”标签页的筛选、分页、缩略图尺寸或卡片信息。
- 本方案不实现跨 Session 媒体导航。
- 本方案不实现媒体导航循环。
- 本方案不增加缩略图胶片、媒体下载、媒体删除、收藏、编辑、分享或重新生成功能。
- 本方案不显示负面提示词、Workflow JSON、模型名称、LoRA、seed、尺寸、采样器或其他生成参数。
- 本方案不实时订阅查看页打开后新生成的媒体；用户刷新查看页后读取最新本会话媒体序列。
- 本方案不修改现有媒体内容文件和 Workflow 文件。
- 本方案不新增依赖包、数据库 schema migration、Remote 服务或独立持久化状态。

## 已获得的授权

- 用户已授权计划编写者创建独立 worktree。
- 用户已授权计划编写者调查现有媒体入口、媒体排序和正面提示词来源。
- 用户已授权计划编写者创建三个静态原型方案和需求方案。
- 用户尚未授权计划执行者修改生产功能代码。
- 用户尚未授权计划执行者提交、推送、发布或部署生产功能改动。
