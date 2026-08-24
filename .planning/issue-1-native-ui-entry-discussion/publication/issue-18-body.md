## 产品目标

计划执行者必须恢复完整 Harness原生界面，并在原生左侧栏提供进入和退出 ComfyUI工作台的双向入口。workbench mode必须复用原生 Settings、ModelSelect、当前 Session PermissionSelect和 `/` Skill菜单。

## 不可变实施计划

- [Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)

计划执行者必须完整执行该计划中“Issue #18”定义的实现责任、自动化验收和浏览器验收。

## 实现责任

1. 计划执行者必须恢复 `ui-layout`，并让它成为唯一 root注册者、唯一 `layout` provider和唯一 Theme presenter。
2. 计划执行者必须删除项目 root、项目 Layout provider、项目 Theme projection和 `cordis.patch.yml`中禁用 `ui-layout`的配置。
3. 计划执行者必须实现不可变实施计划定义的唯一 `SurfaceNavigation`模块，并永久向 `sidebar.footer.action`注册双向入口。
4. 除永久 footer入口外，workbench mode只能动态注册 `sidebar.workspaces`、`conversation.session.header`、`conversation.view#chat`和 `details`四个 occupant。
5. native mode不得创建或自动打开 Workbench Session。workbench mode只能启动一个 `WorkbenchSessionBinding`；返回 native mode必须停止该 binding。
6. 产品启动和刷新必须进入 native mode。项目不得增加 Surface route、localStorage或其他持久状态。
7. 原生 SidebarRoot必须继续渲染 Settings。原生 InputBar必须继续渲染 ModelSelect、PermissionSelect、图片附件、原生发送状态和 `/` Skill菜单。
8. 计划执行者必须把 `agent-presets/harness-comfyui/agent.cordis.yml`的 `includeDefaultRoots`改为 `true`，并保留 `customSkillDirs: [HARNESS_COMFYUI_SKILL_DIR]`和 `watch: false`。
9. Harness原生 Skill roots、同名优先级和 `user-invocable`规则必须决定最终 `/`菜单；项目不得新增 SkillProvider、Skill列表 RPC或第二套 Skill菜单。
10. 计划执行者必须把 `src/client/index.tsx`导出的 Cordis service数组精确改为 `['slots', 'sessions', 'remote', 'inputTriggers', 'connection', 'conversation']`。
11. 计划执行者必须按不可变实施计划更新 `CONTEXT.md`和 `docs/adr/0012-harness-core-is-immutable.md`。

## 验收

1. Composition只有一个 root注册、一个 `layout` provider和一个 Theme presenter。
2. 用户连续切换 Surface十次后，页面不得出现重复 occupant、订阅、binding或 Session。
3. native mode和 workbench mode均能打开 Settings；workbench mode显示并操作原生 ModelSelect。
4. 用户选择 `read-only`和 `workspace-write`后，当前 Session的 `permissions.currentValue`必须收敛；选择 `danger-full-access`时必须显示原生确认界面。
5. 受控项目 fixture必须覆盖合法 Skill、`user-invocable: false` Skill、非法 frontmatter和 `.dsh/skills`同名遮蔽。原生菜单候选与 Skill Invocation必须符合 Harness宿主规则。
6. release `package/skills`中的项目 Skill必须继续可用。
7. 浏览器验收必须证明：原生启动无 Workbench binding；进入 workbench只建立一个 binding；返回原生后停止 binding；刷新后仍进入原生且没有创建或自动打开 Workbench Session。
8. 独立视觉审核者必须在 `1440×1000`保存 native、workbench、Settings、ModelSelect、PermissionSelect和 `/` Skill菜单证据。

## 依赖关系

- Issue #18以已关闭 Issue #3、#16和 #17的交付结果为迁移基线；三张已关闭 Issue不构成未完成 blocker，也不重新打开。
- Issue #18完成后直接解除 Issue #4和 Issue #6的 Surface与原生输入能力 blocker。

## 实现边界

计划执行者不得新增 package dependency，不得修改 DeepSeek Harness package，不得复制原生控件，不得导入 `@deepseek-ai/*/src/*`，不得实现第二套输入状态或 Skill发现路径。
