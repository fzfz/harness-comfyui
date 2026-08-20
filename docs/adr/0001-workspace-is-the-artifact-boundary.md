---
status: accepted
---

# Workspace is the artifact boundary

“所有任务”和“所有媒体”只表示当前 DeepSeek Harness Workspace。Session、Generation Run、Saved Media 和 Workflow 的读取受该 Workspace 边界约束；Generation Run 的取消操作也受同一 Workspace 边界约束。第一版把当前仓库拥有的 Harness 安装视为一个用户主体，但仍隔离不同 Workspace；Host 从当前 Session 取得 Workspace，浏览器和 Tool 参数不能声明任意访问范围。本项目不提供跨 Workspace 或整个安装范围的聚合入口，因为扩大范围会混合不同对话空间的持久生成数据并要求另一套所有权模型。
