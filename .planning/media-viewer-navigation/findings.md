# 现状调查与设计发现

## 已知用户要求

- 用户从右侧“媒体结果”标签页点击媒体后进入新的媒体查看页面。
- 媒体查看页面需要在左侧和右侧增加垂直居中的方向箭头图标。
- 用户点击方向箭头或按键盘左右键后，页面需要切换至本会话中时间相邻的媒体。
- 媒体查看页面需要在媒体底部显示该媒体生成时的正面提示词。
- 用户需要先审批静态原型和需求方案，再授权实施。

## 待调查内容

- 右侧“媒体结果”标签页对应的前端组件和媒体点击入口。
- 媒体查看页对应的路由、组件和 URL 状态。
- 本会话媒体列表对应的接口、排序字段和过滤条件。
- 正面提示词对应的持久化字段、接口字段和前端类型。
- 现有设计令牌、图标库、键盘交互和可访问性约定。

## 设计约束

- 原型代码属于一次性设计验证产物，不进入正式实现路径。
- 原型不得引入新依赖。
- 正式功能范围仅包含本会话媒体的前后切换和正面提示词展示。

## 2026-08-28 系统文档证据

- `docs/system/architecture.md` 定义：已保存 Session 通过 Harness 原生 `details` 扩展位显示 Generation Run/Media 投影；尚未保存的空白 Session 临时通过 `shell.overlay` 显示结果列。
- `docs/system/architecture.md` 定义：Saved Media 的内容路由是 `/api/harness-comfyui/media/<media_id>/content`，媒体所属 Actual Workflow 的路由是 `/api/harness-comfyui/media/<media_id>/workflow`。
- `docs/system/directory-structure.md` 定义：媒体结果列的前端实现位于 `src/client/`，静态原型应位于 `prototype/`。
- `prototype` Skill 的 UI 分支要求：界面原型默认提供三个结构差异明显的方案，并通过 `?variant=` 参数和底部浮动切换条比较方案。
- 本次原型优先贴近现有媒体查看页。若当前查看页不是仓库可直接修改的路由，原型应使用 `prototype/` 中现有静态原型约定模拟完整查看页。
- 若需要启动真实 Harness Host 验证正式界面，计划执行者必须使用 `pnpm worktree:start`、`pnpm worktree:status`、`pnpm worktree:health`、`pnpm worktree:logs` 和 `pnpm worktree:stop`；计划执行者不得使用 `pnpm prod:*`。

## 2026-08-28 前端入口与合同证据

- `src/client/workbench/results-drawer.tsx` 的 `MediaPreview` 使用 `<a href="媒体内容地址" target="_blank">` 打开原始媒体。用户看到的“新页面”当前是浏览器直接显示图片或视频内容，不是 React 媒体查看页。
- 当前媒体内容地址由 `generationMediaContentUrl(mediaId, sessionId)` 生成，格式为 `/api/harness-comfyui/media/<media_id>/content?session_id=<session_id>`。
- 由于原始媒体响应不是 HTML，正式实现需要新增一个明确的媒体查看页面地址；右侧媒体卡片改为打开该页面，查看页面内部再加载现有媒体内容地址。
- `GenerationMediaProjection` 当前只包含 `mediaId`、`runId`、`turn`、`outputIndex`、`mediaKind`、`filename`、`mediaType`、`byteSize` 和 `createdAt`。该投影当前没有正面提示词。
- `GenerationRemoteService.list()` 当前仅把 Runtime 中的 Run 列表和 Media 列表分别投影给 Client。正式方案必须定义正面提示词由已有 Run 请求参数投影到每个媒体，或者定义查看页单独读取媒体所属 Run 元数据；方案不得依赖解析 Markdown 或从显示文案推断提示词。
- “本会话媒体”标签页支持轮次和媒体类型筛选及分页。用户要求的查看页导航对象是本会话全部媒体，不应被当前标签页筛选或当前分页截断，除非用户另行修改要求。

## 2026-08-28 排序与正面提示词来源证据

- `GenerationRuntime.queryMedia()` 对同一 workspace 和 Session 的媒体使用 `ORDER BY created_at DESC, output_index DESC, media_id DESC`。当前右侧“本会话媒体”列表因此按照最新媒体在前的稳定顺序显示。
- 查看页应直接复用该媒体投影顺序，避免前端和 Host 分别维护两套时间排序规则。
- 在该顺序中，左箭头对应数组中的前一项，右箭头对应数组中的后一项。首项禁用左箭头，末项禁用右箭头，不循环跳转。
- `generation_runs.request_json` 已持久化完整 `GenerationRequest`；正面提示词的唯一结构化来源是该请求的 `parameters.positive_prompt`。
- `GenerationRunSnapshot` 当前不包含请求参数，`GenerationRuntime` 当前也没有公开读取某个 Run 的生成请求的方法。正式实现必须增加一个窄接口，把媒体所属 Run 的 `positive_prompt` 投影到 Client 所需合同；实现不得把完整 `request_json` 或其他未请求参数暴露给 Client。
- `positive_prompt` 在生成 Tool 的运行参数合同中已是明确键名。方案不需要新增数据库列或迁移，除非实施阶段发现现有持久化请求不保证该键为字符串；当前代码和测试使用字符串形式的 `positive_prompt`。

## 2026-08-28 查看页路由与原型位置证据

- `src/host/generation/media-routes.ts` 当前只接受 `/content` 和 `/workflow` 两类媒体子路由；Host 当前没有媒体查看 HTML 路由。
- 现有媒体路由通过 `session_id` 找到 Session 所属 workspace，并校验媒体记录同时属于该 workspace 和 Session。新增查看页必须保留同一归属校验，不得只根据 `media_id` 返回数据。
- 当前 `prototype/generation-workbench/` 已经模拟右侧“本会话结果”媒体卡片，并把媒体卡片链接到新窗口原文件。新原型可以复用其中的本地图片、视频 fixture 和现有应用视觉语境。
- 现有生成工作台原型已经是之前确定的单一变体 A。为了避免把本次未批准的方案混入已确定原型，本次设计应新增独立目录 `prototype/media-viewer-navigation/`，通过 `?variant=A|B|C` 提供三种媒体查看页结构。
- 本次新原型只连接静态 fixture 和内存状态，不连接 Harness Host、数据库、ComfyUI 或外部服务。

## 2026-08-28 原型视觉语境

- 现有生成工作台使用冷灰画布 `#e8edf3`、近白表面 `#fbfcfe`、深灰文字 `#17212b` 和蓝色操作色 `#2855d9`；字体使用系统中文无衬线、圆体显示字体和等宽数据字体。
- 新媒体查看原型应沿用冷灰、深灰和操作蓝，使用户能够判断该页面属于同一个 Harness ComfyUI 工作台；三个方案通过结构和明暗层级区分，不只更换颜色。
- 新原型可以直接复用 `prototype/generation-workbench/fixtures/generated-portrait.svg` 和 `demo-video.mp4`，不需要创建或下载新媒体资源。
- 设计的单一识别元素采用“时间边轨”：左右箭头保持垂直居中，并用“较新”“较早”与相邻媒体时间说明方向。该元素直接表达本会话按时间顺序导航，不承担其他操作。
- `generated-portrait.svg` 是一张 832 × 1216 比例的冷灰蓝银发人物立绘。媒体查看页必须使用 `object-fit: contain`，在桌面端保留完整纵向画面，不得为了填满横向画布裁切人物或尺寸标注。

## 2026-08-28 静态原型设计计划

### 原型回答的问题

本原型回答：“媒体查看页应该用哪一种结构承载左右时间导航和底部正面提示词，才能保留原媒体查看的直接感，同时让用户明确知道当前媒体在本会话中的位置？”

### 设计令牌

| 名称 | 色值 | 用途 |
| --- | --- | --- |
| 冷灰画布 | `#E8EDF3` | 与现有工作台相同的页面背景 |
| 近白表面 | `#F8FAFD` | 提示词面板和浅色查看器表面 |
| 深色画布 | `#111821` | 沉浸式媒体背景 |
| 主文字 | `#17212B` | 浅色表面主要文字 |
| 操作蓝 | `#2855D9` | 可点击箭头、焦点和当前方案 |
| 焦点蓝 | `#8FB3FF` | 深色表面的键盘焦点轮廓 |

- 标题字体：`ui-rounded, "SF Pro Rounded", "PingFang SC"`，只用于当前媒体位置和方案名称。
- 正文字体：系统中文无衬线字体，负责正面提示词和方向说明。
- 数据字体：`SFMono-Regular, Consolas, monospace`，只用于媒体 ID、时间和键盘提示。

### 三个结构方案

方案 A“原页增强”保留浏览器原始媒体页的沉浸感，方向按钮悬浮在深色媒体舞台两侧，正面提示词作为媒体下方的独立说明面板。

```text
┌──────────────────────────────────────────────┐
│ 本会话媒体                         3 / 5     │
│                                              │
│  [较新 ‹]        完整媒体         [› 较早]  │
│                                              │
├──────────────────────────────────────────────┤
│ 正面提示词                                   │
│ 完整提示词文本                               │
└──────────────────────────────────────────────┘
```

方案 B“时间边轨”把左右方向变成固定宽度的时间轨道。媒体舞台不被按钮覆盖，轨道显示相邻媒体时间，适合强调“按时间顺序”。

```text
┌────────┬────────────────────────────┬────────┐
│ 较新   │ 本会话媒体 · 3 / 5         │ 较早   │
│ 14:38  │                            │ 14:31  │
│   ‹    │         完整媒体           │   ›    │
│        │                            │        │
├────────┴────────────────────────────┴────────┤
│ 正面提示词 · 完整提示词文本                  │
└──────────────────────────────────────────────┘
```

方案 C“画册说明”使用浅色居中画框。左右按钮贴在画框外侧，正面提示词作为画框的图注区，信息层级最安静。

```text
┌──────────────────────────────────────────────┐
│ 本会话媒体 / 3 of 5                          │
│                                              │
│       [‹] ┌──────────────┐ [›]               │
│           │   完整媒体   │                   │
│           ├──────────────┤                   │
│           │ 正面提示词   │                   │
│           └──────────────┘                   │
└──────────────────────────────────────────────┘
```

### 设计识别元素

三个方案都使用“时间边轨”语义：左侧显示“较新”，右侧显示“较早”；方向按钮的无障碍名称同时包含相邻媒体的序号和时间。该语义把现有最新优先顺序直接呈现在界面上。

### 设计自检结论

- 方案没有增加缩略图胶片、下载、删除、收藏或重新生成按钮，因为这些操作不属于用户提出的查看页目标。
- 三个方案通过方向按钮是否覆盖媒体、是否占用独立轨道、提示词是否作为独立面板或画框图注形成结构差异，不通过简单换色制造差异。
- 深色方案只使用现有操作蓝和冷灰，不采用与 ComfyUI 工作台无关的荧光色；浅色方案不使用常见的米色加衬线模板组合。
- 三个方案都保留完整媒体、可见键盘焦点、`prefers-reduced-motion` 和移动端纵向布局。

## 2026-08-28 浏览器验收发现

- 方案 A 在本地浏览器的 1280 × 720 默认视口中完整显示顶部媒体位置、两侧垂直居中箭头、完整横向媒体和底部正面提示词区域。
- 方案 A 的媒体舞台和底部提示词合计高度略大于 720px 视口，页面产生约 37px 的纵向滚动。计划编写者应缩短媒体舞台的视口高度，使常见 720px 高度下能够同时看完提示词首屏内容。
- 点击右侧“较早”箭头后，URL 从 `media=3` 更新为 `media=4`，媒体位置、标题和正面提示词同时更新为第四项媒体的数据。
- 在重新渲染后的方向按钮上按 `ArrowLeft` 后，URL、媒体位置、标题和正面提示词恢复为第三项媒体数据，证明裸键盘左右键使用同一媒体导航状态。
- 浏览器 DOM 快照确认两个箭头的无障碍名称包含方向、相邻媒体序号和时间；正面提示词使用具名 region 和二级标题。
- 收紧媒体舞台后，方案 A 和方案 B 的页面高度都精确等于 720px 默认视口高度，底部提示词区域不再需要滚动。
- 方案 C 的方向按钮中心与媒体区域中心误差为 1px，方向按钮不再根据图注高度下移。
- 方案 C 使用视频 fixture 时，替换元素的默认网格最小尺寸会越过媒体画框并压住正面提示词。原型需要把媒体元素的 `min-width`、`min-height`、`max-width` 和 `max-height` 明确约束到媒体画框。
- 增加媒体尺寸约束后，方案 C 的媒体四边全部位于媒体画框内，媒体底边位于正面提示词区域顶边之上；方案 C 的页面高度同时保持为 720px。
- 最终方案 A 截图显示：深色画布保留原始媒体页的沉浸感，箭头、当前媒体位置和正面提示词在一个 1280 × 720 视口中同时可见。
- 最终方案 B 截图显示：两侧独立轨道不会覆盖媒体，虚线时间轨道和“较新/较早”时间标签最清楚地表达当前排序。
- 浏览器边界测试确认：第五项媒体显示 `5 / 5`、禁用右侧箭头并显示明确的正面提示词缺失文案；第一项媒体显示 `1 / 5` 并禁用左侧箭头。
- 方案 A 在 390 × 844 窄屏视口中没有水平溢出，左右箭头都位于视口内，正面提示词区域进入首屏。
- 浏览器控制台没有 `error`、`warn` 或 `warning` 日志。

## 2026-08-28 生产实施约束

- 用户已经批准方案 A 和 `proposal-1`；生产实现必须保持深色媒体舞台、悬浮方向箭头和媒体下方独立正面提示词面板。
- 用户批准的 TDD 公开接缝是 `src/generation/contract.ts` 的媒体查看 URL 合同、`GenerationRuntime` 的正面提示词窄接口、`media-viewer-page.ts` 的 HTML 页面生成接口、Host `/view` HTTP 路由和 Client 媒体卡片链接。
- TDD 测试必须通过公开接口观察行为，不对生产模块的私有函数或内部调用次数建立断言。
- 当前技术栈固定为 Node.js `22.19.0`、TypeScript `6.0.3`、React `18.3.1` 和 Vitest `4.1.8`；本需求不得修改依赖版本或锁文件。
- 独立 worktree 的真实 Host 验证必须使用 `pnpm worktree:start|status|health|logs|stop`，并且不得读取或输出 `.env` 内容。
- 发布流程要求先提交并推送生产源码与版本变更、等待 CI，再更新发布说明与系统文档、完成独立语义审核、再次运行质量门禁并推送最终文档提交。
- 本机已经安装 Context7 CLI；本轮没有安装或更新 Context7。Context7 返回的高信誉 MDN 文档确认：`KeyboardEvent` 提供 `altKey`、`ctrlKey`、`metaKey` 和 `shiftKey` 修饰键状态；方向键处理器可以调用 `preventDefault()`；`aria-live="polite"` 属性必须在动态文本更新前存在；`history.replaceState()` 可以更新当前历史项 URL 而不加载新页面。
- 独立 worktree 当前运行 Node.js `25.8.2`，符合 `package.json.engines` 的 `>=24.0.0` 分支；pnpm 为仓库固定的 `11.7.0`。
- 独立 worktree 当前没有 `node_modules`。`package.json` 的全部直接依赖使用精确版本，`pnpm-lock.yaml` 已存在；安装前必须先运行仓库的 `pnpm quality:preinstall` 锁文件与安全检查，通过后才可以执行 `pnpm install --frozen-lockfile`。
- `pnpm quality:preinstall` 确认 `package.json`、`pnpm-lock.yaml` 和 `pnpm-workspace.yaml` 一致；完整依赖集和生产依赖集的 critical、high、moderate、low 漏洞数量均为 0；仓库允许清单覆盖五个存在构建脚本的固定版本包。依赖准备审计结论为通过，可以使用冻结锁文件安装现有依赖。
- `src/generation/contract.ts` 当前只导出媒体 `/content` 和 `/workflow` URL 函数；新增 `/view` URL 函数可以与两个现有函数保持同一公共合同接缝。
- `GenerationRuntime` 已使用私有 `generationRequest(document)` 验证 `generation_runs.request_json`；新的 `positivePromptForRun(runId)` 可以通过 `getRow(runId)` 读取记录并复用该验证函数，不需要公开完整请求或增加 SQLite schema。
- `GenerationRuntime.queryMedia()` 已按 `created_at DESC, output_index DESC, media_id DESC` 返回 workspace 与 Session 隔离的完整媒体序列；Host `/view` 路由无需创建第二套排序逻辑。
- `media-routes.ts` 当前将 Runtime 能力限制为四个公开方法，并用同一 `session_id`、workspace 与媒体归属校验保护 `/content` 和 `/workflow`；`/view` 必须扩展同一个受限 Runtime 类型和同一个路由正则。
- `MediaPreview` 当前让 `<a>` 与内部图片或视频都使用 `/content` URL。生产改动只把 `<a href>` 替换为 `/view` URL，内部媒体元素必须继续使用 `/content` URL。

## 2026-08-28 生产界面验证发现

- `pnpm worktree:status` 返回 `running`，`pnpm worktree:health` 的 process、sourceRuntime、harnessWeb、clientBundle、runRepository、apiWorkflowCache 和 savedMedia 全部返回 `passed`，活动版本是 `0.32.0`。
- 真实 Harness 页面自动打开 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`，模型选择器显示 DeepSeek V4 Flash，页面没有显示 API 密钥设置界面。
- 生产页面生成器的 1280 × 720 验证结果是 `scrollWidth=clientWidth=1280`、`scrollHeight=720`；左右方向按钮中心与媒体舞台中心都是 `330.3046875px`，没有垂直偏差。
- 生产页面生成器的桌面截图显示视频完整包含、原生播放控件可见、正面提示词进入首屏。方向按钮内的完整日期时间在 70px 按钮中产生多行断裂；可见时间应只显示 `HH:mm`，方向按钮的无障碍名称继续保留完整日期时间。
- 修正后，桌面方向按钮分别显示单行 `17:22` 和 `17:11`；无障碍名称继续包含完整日期时间、相邻媒体序号和时间方向。
- 390 × 844 验证结果是 `scrollWidth=clientWidth=390`、`scrollHeight=844`；左右方向按钮边界分别是 `6px` 和 `384px`，按钮中心与媒体舞台中心都是 `387.359375px`，可见方向说明按方案隐藏，图标和完整无障碍名称保留。
- 浏览器点击右侧按钮后，页面从第 2 / 3 项切换到第 3 / 3 项，URL 更新到 `media_old/view`，媒体变为图片，正面提示词状态变为“未保存”，右侧按钮变为“当前媒体已是本会话最早媒体”并禁用。
- 浏览器在第 3 项按裸 `ArrowLeft` 后返回第 2 / 3 项并更新 URL；随后按 `Shift+ArrowRight` 不改变当前媒体或 URL。
- 生产查看页和真实 Harness 页面的浏览器 `error`、`warn`、`warning` 日志均为空。
