# DeepSeek Harness 生成工作台静态原型

本页面实现用户已经选定的变体 A。页面使用静态 fixture 演示 DeepSeek Harness 会话、多聊天轮次、消息上下文、流式 Agent 文本、按 `turn_id` 关联的零个/一个/多个 ComfyUI 运行、全局 ComfyUI 异步任务列表、图片/视频/音频结果，以及可导入 ComfyUI 的本次实际 Workflow JSON 下载入口。API Workflow JSON 仍属于宿主提交和底层持久化数据，不在浏览器页面提供下载按钮。

Skill 发现、选择和调用交互由 DeepSeek Harness 原生会话输入能力负责。本项目页面不实现 Skill 选择按钮、Skill 菜单或 Skill 选择状态；正式组合时，本项目只读取 DeepSeek Harness 已经写入会话的 Skill 与 Tool 调用事件，并按事件中的 `run_id` 投影结果。

底模是上下文资源查询条件，不是消息上下文。上下文选择器顶部的底模筛选包含“全部”和三个具体底模选项，用于筛选生成模型、LoRA、画师或画风、画师串和 Workflow 模板；草稿标签、用户消息的不可变上下文快照和发送数据都不包含底模筛选值。

全部会话都是普通 DeepSeek Harness Session。原型中的“画风参数对比”只是一段普通聊天及其两项 ComfyUI 运行，不是专用 LoRA 会话。任何获得 `generate_with_comfyui` Tool 权限的普通 Skill 都可以创建运行；`comfyui-generate` 不是唯一入口。

静态页面生命周期内，每个 Session 使用独立的内存状态保存聊天轮次和运行集合。每次新发送都会创建新的 `turn_id` 和新的 `run_id`；切换 Session 后再返回时，新轮次、Agent 输出、运行卡片和 Session 运行数量仍然保留。“本会话结果”显示该 Session 全部聊天轮次已经保存的媒体，并支持按聊天轮次、媒体种类和保存时间筛选及独立分页。

默认角色 Session 的 `turn_portrait_03` 同时关联队列等待、ComfyUI 执行中、保存媒体和提交结果未知四个运行。普通“画风参数对比”Session 同时展示一个成功运行和一个失败运行。这些状态属于实际聊天轮次 fixture；底部原型状态选择器只用于补充检查单一卡片状态。

页面只保留具有已实现交互的控件。聊天轮次按钮使用“第 N 轮 · 本轮任务摘要”和“查看 N 项 ComfyUI 运行”说明点击结果；右列使用同一任务摘要和 `turn_id` 标明结果来源。静态原型不显示没有实现行为的“新建会话”或“会话选项”按钮。

失败和提交结果未知卡片要求用户通过新的 Harness 聊天消息请求新运行，不提供绕过 Agent 与 Tool 调用机制的直接提交按钮。右列“本会话结果”使用固定尺寸的两列媒体卡片，每页显示四个媒体；卡片主体在新窗口打开原文件，卡片的“下载本次 Workflow JSON（可导入 ComfyUI）”按钮下载所属 `run_id` 的本次实际 Workflow JSON。多个 Tool 的调用详情由 DeepSeek Harness 轨迹功能展示。

左列“所有媒体”入口对应 DeepSeek Harness Client plugin 的 `sidebar.footer.action` 注册位置。入口打开居中的全局媒体库；全局媒体库复用会话媒体卡片，支持按会话、聊天轮次、媒体种类和保存时间筛选，每页显示八个媒体。DeepSeek Harness 当前提供全视口居中 `Modal`，因此正式实现不创建独立页面。

左列“所有 ComfyUI 异步任务”入口打开居中的 Workspace 任务列表。列表支持按会话、聊天轮次和创建时间筛选，每页显示五项任务；每项任务同时显示本仓库状态和 ComfyUI Job 原始状态，或者明确说明 `/prompt` 成功响应尚未确认且没有可查询的 `prompt_id`。排队与运行中任务可以打开确认弹窗，原型依次演示“正在取消”和“已取消”，并同步更新右列同一 `run_id`。正式服务调用任务所属实例的 `POST /api/jobs/{prompt_id}/cancel`，随后使用 `GET /api/jobs/{prompt_id}` 回读最终状态。

2026-08-20 已只读探测数据源登记实例：`mac mini` 的 ComfyUI 版本为 `0.28.3`，`win3080` 为 `0.33.1`，两个实例都实际响应 `GET /api/jobs`。`win3080` 实际响应 `GET /api/jobs/{prompt_id}`；对已完成 Job 调用 `POST /api/jobs/{prompt_id}/cancel` 返回 HTTP 200 和 `{ "cancelled": false }`，回读仍为 `completed`。静态页面不连接这些实例，也不会发送真实取消请求。

页面不连接数据源 CLI、数据库、DeepSeek Harness 进程或 ComfyUI 实例。

`/Volumes/4Tdisk/work/AI2/deepseek-harness` 只用于只读调研。后续正式实现使用的 DeepSeek Harness 宿主、Host 插件和项目级 Skill 都必须安装到当前仓库，不得修改原 Harness 目录。

## 启动

计划执行者在仓库根目录运行：

```bash
python3 -m http.server 4173 --directory .
```

浏览器打开：

```text
http://127.0.0.1:4173/prototype/generation-workbench/
```

页面底部的“原型状态”选择器用于切换空会话、Agent 流式输出、上下文查询错误、排队、远端运行、保存媒体、成功媒体、运行失败和提交结果未知。页面使用 `?state=<state>` 保存当前演示状态。

## 结构检查

计划执行者在仓库根目录运行：

```bash
node --test prototype/generation-workbench/tests/*.test.mjs
```
