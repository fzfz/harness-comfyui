# Harness ComfyUI v0.32.0

v0.32.0 为结果列中的 Generation Media 新增方案 A 的本会话媒体查看页。用户在结果列点击图片或视频后，新标签页显示该媒体、同一个 Session 中的时间顺序导航以及该媒体生成时保存的正面提示词。

## 本会话媒体导航

- Client 结果列把图片和视频链接到同源 `/api/harness-comfyui/media/<media_id>/view?session_id=<session_id>` 查看页；缩略图继续读取原有 `/content` 路由，Actual Workflow 下载继续使用原有 `/workflow` 路由。
- 查看页按 `created_at DESC, output_index DESC, media_id DESC` 排列当前 Session 的全部媒体。左侧按钮和不带修饰键的 `ArrowLeft` 切换到较新媒体，右侧按钮和不带修饰键的 `ArrowRight` 切换到较早媒体。
- 当前媒体位于 Session 最新或最早边界时，页面禁用对应按钮并显示完整边界文案。导航不会从首项循环到末项，也不会从末项循环到首项。
- 页面切换媒体后使用 `history.replaceState()` 更新当前媒体 URL。用户刷新当前 URL 时，Host 继续把 URL 中的媒体作为当前项。
- 图片和视频保持原始宽高比完整显示，不裁切内容。视频使用浏览器原生播放控件，媒体文件不存在时页面说明用户需要返回会话并刷新本会话媒体列表。

## 正面提示词

- Host 从每项媒体所属 Generation Run 的持久生成请求读取 `parameters.positive_prompt`。查看页逐字符显示该字符串，不修改、翻译、重新排序或截断内容。
- Generation Run 没有保存非空正面提示词时，查看页显示“未保存”和“这项媒体的生成记录没有保存正面提示词。”。
- 查看页的启动数据不包含完整生成请求、Actual Workflow、API Workflow 或远端实例认证信息。

## 归属与页面安全

- Host 在返回查看页前验证 GET 方法、目标 Session、当前 workspace 和媒体归属。错误 Session、跨 workspace 媒体和缺失媒体不会返回查看页。
- 查看页响应禁止缓存和 MIME 嗅探，使用 `Referrer-Policy: no-referrer` 以及只允许同源媒体、内联页面样式和内联页面脚本的固定 Content Security Policy。
- 左右方向按钮的无障碍名称包含动作、时间方向、目标序号、目标文件名和完整生成时间。页面切换媒体后通过 `aria-live` 播报目标序号、文件名和生成时间。

## 验证

- 完整 `pnpm quality` 已通过：429 项 unit/integration、24 项 contract/security、40 项 production 和 32 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 独立 worktree Host 的 `worktree:status` 和 `worktree:health` 通过，验证结束后的 `worktree:stop` 和停止状态检查通过。
- 1280 × 720 与 390 × 844 浏览器验收覆盖图片、原生控件视频、首项、末项、正面提示词缺失、超长正面提示词内部滚动、媒体文件不存在、点击导航、裸方向键和无水平溢出；用户按带 `Alt`、`Control`、`Meta` 或 `Shift` 修饰键的方向键时，页面不切换媒体。
- 独立语义审核确认生产文案、边界指代、无障碍名称、缺失提示词和媒体文件不存在状态没有 blocker、medium 或 minor 级别问题。
- 本版本没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
