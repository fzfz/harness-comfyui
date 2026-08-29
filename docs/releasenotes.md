# Harness ComfyUI v0.33.1

v0.33.1 在本会话媒体查看页顶部增加当前媒体所属 Generation Run 的完整 `run_id` 和媒体文件的固有像素尺寸。用户可以点击 `run_id` 把完整值复制到浏览器剪贴板。

## Run ID 复制

- Host 把每项媒体已有的 `runId` 投影到查看页。查看页不为此读取或暴露完整 Generation Request、Actual Workflow、API Workflow、workspace ID 或远端实例认证信息。
- 顶部按钮显示完整 `run_id`。用户点击按钮后，页面通过浏览器 Clipboard API 写入完整值；成功时按钮显示“已复制”，并通过 `aria-live` 播报被复制的完整 Run ID。
- Clipboard API 不存在时，按钮显示“复制失败”，`aria-live` 说明当前浏览器或页面环境不支持剪贴板写入，并提示用户改用支持 Clipboard API 的浏览器。浏览器拒绝写入时，`aria-live` 说明当前页面没有剪贴板写入权限，并提示用户允许该权限后重试。复制失败不会改变当前媒体、媒体顺序或导航状态。
- 用户切换到较新或较早媒体后，顶部 Run ID 更新为新媒体所属 Run，复制状态重置为“点击复制”。

## 媒体固有尺寸

- 图片加载后，查看页读取图片元素的 `naturalWidth` 和 `naturalHeight`；视频元数据加载后，查看页读取视频元素的 `videoWidth` 和 `videoHeight`。页面以“宽 × 高 px”显示媒体文件的固有像素尺寸。
- 查看页不使用 Generation Request 中的 `width` 或 `height` 推测文件尺寸，因此 ComfyUI 放大节点、后处理节点或视频输出改变最终文件尺寸时，页面仍显示媒体文件的实际固有尺寸。
- 用户切换媒体时，尺寸先显示“读取中”。浏览器返回零尺寸或媒体文件加载失败时，页面显示“尺寸不可用”；已经被替换的媒体产生迟到加载事件时，不会覆盖当前媒体的尺寸。
- 本版本没有新增 SQLite 列或迁移，已有图片和视频在加载后同样显示固有尺寸。

## 布局与验证

- 顶部技术信息轨延续方案 A 的深色表面、操作蓝和等宽数据字体。桌面端在一行显示 Run ID、复制状态和尺寸；窄屏允许完整 Run ID 在按钮内换行，不使用省略号。
- 完整 `pnpm quality` 已通过：447 项 unit/integration、24 项 contract/security、59 项 production 和 32 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 1280 × 720 浏览器验收覆盖 Run ID 复制成功、图片尺寸、视频尺寸和媒体切换。390 × 844 浏览器验收确认页面没有水平溢出或额外纵向扩张，完整 Run ID、尺寸、媒体、左右箭头和正面提示词同时可见；浏览器错误和警告日志为 0。
- 本版本没有新增 npm 依赖，没有修改 `pnpm-lock.yaml`，没有数据库迁移，也没有改变 v0.33.0 的 Agent Preset、managed CLI 或默认 Preset 行为。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
