---
status: accepted
---

# Generation runs are durable and asynchronous

Generation Tool Call 在当前系统持久接纳 Generation Run 后立即返回，不等待 ComfyUI Job 或媒体完成。第一版运行 worker 跟随 Host plugin 以前台方式启停，并从持久运行记录恢复非终态 Generation Run；宿主停止期间，远端 ComfyUI Job 可以继续执行。数据源目录不可用不会阻止读取已有运行、Workflow 和媒体。Cancellation 只以活动 ComfyUI Job 为目标；当前系统根据取消响应和 Job 回读结果确定最终状态，并保留运行记录和已经保存的产物。Submission Unknown 不会自动重提；用户确认重复执行风险后的新消息产生新的 Generation Tool Call 和 Generation Run。
