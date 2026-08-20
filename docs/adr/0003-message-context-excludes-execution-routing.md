---
status: accepted
---

# Message context excludes execution routing

Message Context 只保存需要对 Agent 可见的领域资源。Workflow Template 可以同时作为消息资源引用和生成资源；ComfyUI 实例属于 Execution Route，底模属于 Catalog Filter，二者都不进入 Message Context。浏览器用户可以在生成选项中明确选择一个安全实例 ID；未选择时，Host 使用 `config/runtime.json` 中的默认实例 ID。明确选择的实例不可用时，本次运行失败，Host 不切换到其他实例。第一版不根据私有 URL、队列负载或 Agent 判断自动选择实例。
