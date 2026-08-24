## 2026-08-24 Harness 原生 Surface 与输入能力修订（UI 与输入能力唯一最新规范）

### 不可变实施计划

- [Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)

本节和不可变实施计划替代本 Issue、已关闭 Issue #3、#16、#17以及开放 Issue #4、#6、#10、#11、#13、#14中与 root、Surface、composer、Context reference、Route reference、Skill roots和对应视觉验收冲突的条款。Harness v0.82.2 envelope、Run Repository、Generation Tool、媒体交付和产品管理 CLI合同保持不变。

### 四项产品需求

1. 产品必须保留完整 Harness原生界面，并在原生左侧栏提供“进入 ComfyUI 工作台”和“返回 Harness”双向入口。
2. workbench mode必须保留 Harness原生 Settings入口和原生 ModelSelect。
3. workbench mode的原生 InputBar必须显示并设置当前 Session的 PermissionSelect。
4. 用户在 Workbench Session输入 `/` 后，Harness原生 Skill菜单必须列出并调用项目 `.agents/skills`中经过宿主规则解析后生效的用户可调用 Skill。

项目不得复制 Harness Settings、ModelSelect、PermissionSelect、InputBar、Skill目录扫描器或 Skill菜单。项目不得新增 package dependency，不得修改 DeepSeek Harness package，不得导入 `@deepseek-ai/*/src/*`。

### Issue责任

- Issue #18负责恢复原生 `ui-layout`、Surface双向切换、原生 InputBar、当前 Session权限选择和默认 Skill roots。
- Issue #4负责把 Message Context迁移到原生 Context reference和默认提交路径。
- Issue #6负责把 Execution Route迁移到唯一原生 Route reference。
- Issue #10与 #11只在 workbench mode的 `sidebar.workspaces`内容区提供任务和媒体入口。
- Issue #13负责让 `anima-prompt-builder`、`wai-sdxl-prompt-builder`和 `lora-adjustment`扫描完整当前 user message。
- Issue #14负责最终真实产品和 `1440×1000`独立浏览器验收。

### 原型例外

1. 原生 `ui-layout`列宽、面板初始状态和调整行为替代 Issue #3固定 `294px/432px`合同。
2. 原生 InputBar的 ModelSelect、PermissionSelect、Context inline reference和 Route inline reference替代项目自绘 composer对应区域。
3. Route reference存在时，用户必须先用原生 Backspace或 Delete删除当前路线，Execution Route控件才能接受默认实例或另一个显式实例。
4. Message Context Modal、Catalog候选卡片、候选详情、分页和已发送消息折叠块继续按原型验收。
