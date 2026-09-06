# 查询子任务提示词与完成条件

```text
读取 <run-query-cli.md路径> 和 <本阶段记录要求>，使用现有 CLI 查询 <Run ID有序列表>。
输入记录：<请求、提交状态与已有结果路径>。
查询间隔与每组次数上限：<task.json.settings.media_poll_interval_seconds 与 media_max_queries_per_stage>。
仅对已经取得真实 Run ID 的项目执行查询或媒体轮询；没有真实 ID 的项目保存无法查询的原因并返回，不进入下面的轮询步骤。在当前子会话身份下取得实际 arguments、Actual Workflow 和媒体信息，保存原始结果及本地图片路径。images 为空时记录 no_saved_image，不据此推断运行已结束。尚未达到本阶段查询次数上限时，按指定间隔等待后继续查询；达到上限仍无图片时，返回待查询项。
恢复时核对 accepted、submitting 和 unknown 的记录。已知 Run 不重复提交；无法由现有接口定位的未知提交保留 unknown 并报告，不推测不存在。
返回已取得图片、未取得图片、查询失败和结果不明的数量、媒体引用以及额度核对摘要，不返回完整 Workflow。
```

完成条件：每个请求的查询结果、错误或无法查询的原因均已保存。全部项目取得可读图片时返回 completed；全部项目均因查询错误而未完成时返回 failed；其余尚有项目未取得可读图片的情况返回 partial，并附待查询列表。达到查询次数上限且仍有待查询项时，设置 next_action=wait。主 Agent 只对已取得可读图片的项目派发观察任务。
