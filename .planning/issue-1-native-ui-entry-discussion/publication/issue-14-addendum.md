## 2026-08-24 原生 Surface 与输入能力最终验收修订（唯一最新规范）

### 不可变实施计划

- [Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)

Issue #14必须在真实 Product Installation和 `1440×1000`本地浏览器中增加以下最终验收：

1. 页面启动时进入 native mode且没有 Workbench Session binding。用户从原生左侧栏进入 workbench mode时只建立一个 binding，返回 native mode时停止 binding；刷新后仍进入 native mode，并且项目没有创建或自动打开 Workbench Session。
2. native mode和 workbench mode均能打开 Settings；workbench mode显示并操作原生 ModelSelect。
3. workbench mode的原生 InputBar显示当前 Session PermissionSelect，并完成 `read-only`、`workspace-write`和 `danger-full-access`原生确认路径。
4. Workbench Session输入 `/`后，原生菜单显示项目 `.agents/skills`中符合宿主规则的用户可调用 Skill；用户选择、发送并产生真实 Skill Invocation。release `package/skills`必须继续可用。
5. 原生 InputBar完成两个 Context reference、一张图片和普通正文的单条 user message原子提交；复制 Context reference得到且只得到 `@generation-context <json>`。
6. 显式 Execution Route生成唯一 Route reference；默认路线不生成 Route reference。Route reference存在时，用户必须先用原生 Backspace或 Delete删除它，再选择默认实例或另一个显式实例。
7. 完整 user message parser从同一消息提取全部 Context block和唯一 Route block，并逐字符保留用户正文中的空格与换行。
8. 独立视觉审核者必须保存 native、workbench、Settings、ModelSelect、PermissionSelect、`/` Skill菜单、Context inline reference和 Route inline reference证据。

计划执行者必须同步修改 `docs/v0.1/PRDS/13-release-artifact-acceptance.md`。本 Issue原有 Harness v0.82.2 envelope、Product Installation、Run Repository、Generation Tool、任务、媒体和产品管理 CLI验收保持不变。
