## 2026-08-24 左侧栏入口归属修订（唯一最新规范）

- 不可变实施计划：[Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)
- Issue #10必须把“所有 ComfyUI异步任务”入口注册在 workbench mode的 `sidebar.workspaces`内容区。
- Issue #10不得注册 top-level `sidebar` occupant，不得接管 `sidebar.settings`或 `sidebar.footer.action`。
- Issue #10的任务筛选、分页、定位和取消合同保持不变。
- 自动化测试和 `1440×1000`浏览器验收必须证明任务入口只在 workbench mode业务内容区出现，Settings和 Surface双向入口仍由原生 SidebarRoot与 Issue #18显示。

本节替代本 Issue中把任务入口交给 Issue #3项目 top-level sidebar occupant的冲突条款。Issue #10消费 Issue #18交付的 workbench mode `sidebar.workspaces`内容区。
