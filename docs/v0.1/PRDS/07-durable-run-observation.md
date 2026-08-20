# PRD 07：持久异步运行观察与恢复

## 关联 Ticket

Ticket 07 — 离开页面后继续观察排队、远端执行与保存媒体。

## 用户任务

浏览器用户创建 Generation Run 后可以切换 Session、关闭页面或重启 Harness；重新打开原 Session 时继续看到真实的队列等待、远端运行、保存媒体和成功状态，并且原运行不会创建第二个 ComfyUI Job。

## 原型依据

右列“队列等待”“远端运行”“保存媒体”卡片及其队列前方数量、KSampler 步数、百分比、当前 `output_index` 和说明文案。

## 持久状态机

第一版唯一状态机是：

```text
created -> prepared -> submitting -> remote_pending -> remote_running -> downloading -> succeeded
                         |                 |                  |
                         |                 +----> cancelling -+-> cancelled
                         +----> submission_unknown
defined failure from any eligible nonterminal state -> failed
```

Run Repository 必须原子保存状态、状态时间、`prompt_id`、安全实例 ID、模板 ID/revision、进度投影、错误和 Saved Media。Harness `ctx.jobs` 只表示当前进程内观察任务，不是持久运行状态。

## Worker 行为

1. Host plugin 启动后扫描 `created`、`prepared`、`remote_pending`、`remote_running`、`cancelling` 和 `downloading` 记录并恢复工作。
2. `created` 可以重新读取 Source 并准备；`prepared` 可以使用已保存文件继续提交；`submitting` 的恢复只能进入 `submission_unknown`，不能再次调用 `/prompt`。
3. 已保存 `prompt_id` 的运行只使用 `GET /api/jobs/{prompt_id}` 观察原 Job。远端 `pending` 映射 `remote_pending`，`in_progress` 映射 `remote_running`，`completed` 映射 `downloading`。
4. 第一次 404 或网络中断在 `jobs.missingObservationMs` 内保留此前远端状态和 `prompt_id`。超过期限的连续 404 进入 `failed` 与 `COMFYUI_JOB_MISSING`。
5. `completed` 后按输出描述逐项下载、验证和原子保存。进度记录当前输出序号、总数和已完成字节或确定的阶段百分比。
6. 每次持久状态改变后发送只含 `run_id` 的非持久通知。Client 收到通知后回读 Run Repository。
7. Host 关闭时停止新的轮询，等待当前原子写入在 `process.shutdownTimeoutMs` 内完成，然后退出；不得创建后台 daemon 或遗留进程。

## 浏览器投影

- `remote_pending` 显示“队列等待”、可用的队列前方数量和“等待 ComfyUI 调度”。
- `remote_running` 显示“远端运行”、当前节点安全名称、步数和百分比；缺少进度时显示“ComfyUI 正在运行，尚未返回步骤进度”。
- `downloading` 显示“保存媒体”、当前 `output_index`、输出总数和百分比。
- 页面重新打开时先显示 loading，再由一次 Run Repository 查询替换；不得先渲染原型 fixture 状态。

## 错误与数据源中断

- 数据源不可用不能阻止读取已保存运行、Workflow 和 Saved Media。
- 恢复远端观察需要重新取得同一实例连接。如果 Source 返回的实例 origin 与运行保存的非敏感 origin identity 不一致，进入 `failed` 与 `COMFYUI_INSTANCE_SOURCE_CHANGED`，不能向新 origin 发送请求。
- Run 文件缺失、损坏或数据库记录不一致时返回具体 artifact 错误，不能用当前模板重建掩盖问题。

## 产品验收

1. Fake Jobs API 驱动一项运行经历 pending、in_progress、completed 与 Saved Media 保存，右列依次显示三个非终态和成功。
2. 切换 Session 与重新加载页面后，状态、进度和 `run_id` 从 Run Repository 恢复。
3. 在 `remote_running` 时重启 Host；恢复后只查询原 `prompt_id`，Fake Jobs API 的 `/prompt` 调用计数保持 1。
4. 首次 404 保持原状态；超过观察期限的连续 404 进入 `failed`。
5. 停止数据源后仍能打开已保存成功运行与媒体；新的来源查询明确失败。
6. 质量命令结束后没有 worker、Harness 子进程或监听端口残留。

## 不属于本 Ticket

本 Ticket 不实现用户取消按钮、失败对比页面的全部文案或生产 ComfyUI 写验证。
