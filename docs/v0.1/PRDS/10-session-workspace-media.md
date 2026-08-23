# PRD 10：Session 与 Workspace Saved Media

## 关联 Ticket

Ticket 10 — 在当前 Session 与整个 Workspace 找回历史媒体。

## Harness 核心零改动与公共接口

本Ticket在Ticket 02注册到公开`details`的项目occupant中实现Session媒体库，并在Ticket 02注册到公开`sidebar`的项目occupant中直接渲染“所有媒体”入口。该入口使用Harness `Modal`实现Workspace媒体库；页面通过项目Typert Remote分页查询媒体，并通过`@deepseek-ai/dsh-host-webserver`的prefix route读取媒体和Actual Workflow。本Ticket不得注册第二个root、重复声明Ticket 02项目root拥有的child slot，也不得替换Harness Session、Tool execution或route dispatcher。

Host route只接受 `media_id` 或 `run_id`，在 Host 内解析 Workspace授权与文件路径。浏览器响应不得包含本地路径、ComfyUI URL、Authorization 或 API Workflow JSON。

## 用户任务

浏览器用户在右列按 Chat Turn、媒体种类和保存时间查找当前 Session 的 Saved Media，也可以从左列打开“所有媒体”，增加 Session 筛选后查找当前 Workspace 内其他 Session 的媒体、打开原文件并下载所属运行的 Actual Workflow。

## 原型依据

- 右列“本会话结果”的两列固定媒体卡片、三个筛选器和每页四项分页。
- 左列“所有媒体”与居中 Modal 的四列固定媒体卡片、四个筛选器和每页八项分页。
- 媒体预览、元数据、原文件入口和 Workflow 下载按钮。

## Saved Media 数据

Run Repository 与 MediaStore 是唯一权威来源。公开 `StoredMediaDescriptor` 至少包含 `media_id`、`run_id`、Session ID/标题、数字 `turn`、`output_index`、`kind`、已验证 `mime_type`、`byte_length`、标题、创建时间和安全预览 URL。响应不得包含本机路径、远端 filename、Authorization 或 API Workflow。

## 查询与授权

1. 右列入口使用 Host 当前 Workspace 与当前 Session 派生 Session scope；浏览器不能查询其他 Session。
2. Workspace Modal 使用 Host 当前 Workspace 派生 Workspace scope，可按该 Workspace 中的 Session 筛选。
3. `GenerationRuns.listMedia()` 接受数字 `turn`、媒体种类、保存时间、page 和 page_size，并返回稳定排序的 `items` 与 `total_count`。保存时间相同按 `media_id` 确定性排序。
4. Session 页固定 `page_size: 4`；Workspace 页固定 `page_size: 8`。两套筛选与页码状态完全独立。
5. 其他 Workspace、伪造 `run_id` 或 `media_id` 返回统一访问拒绝/不存在响应，不泄露归属。

## 文件读取

- 点击媒体主体在新窗口打开当前仓库 Host 的同源媒体读取 URL；响应 Content-Type 与持久 descriptor 一致，并设置安全的 inline/content-disposition 与 nosniff header。
- Session 卡片下载 Actual Workflow 使用 Session scope；Workspace Modal 下载使用 Workspace scope。
- 下载只读取运行已经保存的 `actual-workflow.json`，文件名为 `comfyui-run-<run_id>-workflow.json`。API Workflow 没有浏览器入口。
- 媒体或 Workflow 文件缺失时返回 `MEDIA_NOT_FOUND` 或 `GENERATION_ARTIFACT_NOT_READY`，卡片保留并显示可理解错误。

## 前端交互

1. 更改任一筛选器把对应库页码重置为 1，并更新数量与页数。
2. 媒体卡片固定显示预览、标题、媒体种类、Session、数字 `turn`、保存时间、`output_index` 和 `run_id`。
3. Session A 的右列不能显示或打开 Session B 媒体；Workspace Modal 可以打开同一 Workspace 的 Session B 媒体。
4. 原文件入口与 Workflow 下载是两个独立动作；点击按钮不触发卡片原文件导航。
5. 空集合显示当前筛选条件和清空筛选动作；加载错误保留筛选并提供重试。

## 产品验收

1. 当前 Session 至少五项媒体，Workspace 至少九项媒体；两套分页分别进入第二页且互不影响。
2. 逐项组合 Session、turn、kind 和时间筛选，UI 数量等于 Host 返回 `total_count`。
3. 停留在 Session A 时，右列读取 Session B 失败；Workspace Modal 读取同一 Workspace 的 Session B 成功。
4. 其他 Workspace、伪造 ID、缺失文件和未准备 Workflow 都返回确定错误。
5. 原文件响应签名与 Content-Type 一致；Workflow 下载等于运行保存文件。
6. 视觉审核者检查两列/四列网格、固定卡片、筛选器、分页、元数据和两个动作的布局与焦点顺序。

## 不属于本 Ticket

本 Ticket 不重新下载远端输出，不修复缺失媒体，不播放视频或音频，也不删除媒体。
