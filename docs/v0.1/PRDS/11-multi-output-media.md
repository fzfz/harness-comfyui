# PRD 11：单次运行的图片、视频与音频输出

## 关联 Ticket

Ticket 11 — 一次运行交付多个图片、视频和音频结果。

## 用户任务

浏览器用户发送一个短片生成请求，一项 Generation Run 按 `output_index` 保存多张图片、一项视频和一项音频；当前轮次结果、Session 媒体库和 Workspace 媒体库都能识别、筛选和打开这些输出。

## 原型依据

“测试视频工作流”Session、多输出成功卡片、图片预览、视频静态封面、音频波形静态预览、媒体种类 badge、`output_index` 顺序和媒体分页。第一版不提供视频或音频内嵌播放。

## 输出描述唯一来源

`config/comfyui-output-descriptors.json` 必须按 Workflow Template 声明保存确定的输出提取规则。每条规则包含 ComfyUI 输出节点 ID、输出字段、媒体 kind 和序号来源。worker 只处理当前模板声明的输出节点；未知字段返回 `COMFYUI_OUTPUT_DESCRIPTOR_UNSUPPORTED`，不能按扩展名或文件名猜测。

`config/media-policy.json` 必须为 image、video 和 audio 保存允许的响应 Content-Type、文件签名、验证扩展名、最大字节数和预览策略。组件与 worker 不得复制这些常量。

## 下载与持久化

1. Jobs API completed 响应中的输出先按模板描述转换为 `RemoteOutputDescriptor[]`，再按 `output_index` 稳定排序。
2. worker 逐项下载；每项同时验证响应 Content-Type、文件签名和大小。远端 URL 后缀不能决定媒体种类。
3. 本地文件名只使用当前项目生成的 `media_id` 和验证后的扩展名；远端 filename、subfolder 和 storage type 只能用于 ComfyUI 下载请求。
4. 每个安全落盘输出在 Run Repository 保存一条 Saved Media。部分输出失败时运行进入 failed，但已经验证并保存的媒体继续可读，并显示“保存了 N / M 项”。
5. 所有输出共享同一个 `run_id`、source snapshot、Generation Tool 请求快照、Actual Workflow 和 API Workflow。

## 前端呈现

- 当前轮次运行卡片按 `output_index` 展示全部输出，不按下载完成顺序重排。
- 图片显示固定尺寸缩略图；视频显示静态封面与“视频结果静态预览”；音频显示静态波形与 MIME 信息。
- Session/Workspace 媒体筛选按持久 `kind` 工作。每个卡片的原文件入口读取自身 `media_id`；Workflow 下载读取共同 `run_id`。
- 缩略图或静态预览失败时卡片显示该媒体 kind 的明确占位符，原文件入口仍由持久文件状态决定。

## 错误行为

- MIME 不允许、签名不匹配、超出大小、下载中断和输出描述未知分别使用结构化错误码。
- 一个输出失败不能把另一个文件写成错误 kind，也不能删除已经保存的输出。
- 浏览器响应不得提供远端 filename/subfolder、本机路径、实例 URL 或 Authorization。

## 产品验收

1. Fake Jobs API 返回至少两张图片、一项视频和一项音频，output_index 非下载顺序；三处 UI 都按 output_index 显示。
2. 对三种媒体分别验证合法 Content-Type/签名，并覆盖非法 MIME、签名不匹配、未知输出字段和下载失败。
3. 每个媒体原文件可打开，descriptor 的 MIME、byte length 与响应一致。
4. 四个输出的 Workflow 下载内容相同且属于共同 `run_id`。
5. 正式 UI 不包含 `<video>` 或 `<audio>` 播放控件。
6. 视觉审核者检查三种 renderer、静态占位、badge、序号和多输出卡片密度。

## 不属于本 Ticket

本 Ticket 不实现流式媒体播放、转码、缩略图后台作业或删除输出。
