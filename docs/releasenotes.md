# Harness ComfyUI v0.30.6

v0.30.6 为“插入上下文”弹窗增加按 Harness Session 隔离的筛选位置记忆。用户关闭并重新打开弹窗、切换 Session 后返回、刷新浏览器或重启 Client 时，弹窗恢复该 Session 上次保存的底模、资源种类、搜索输入、已提交搜索词和页码。

## 主要变更

- Client 插件为每个 Session 使用独立的版本化浏览器存储记录。弹窗只持久化导航位置；Catalog 响应、加载状态、错误对象和未确认候选不会写入浏览器存储。
- 弹窗打开时按照保存的筛选位置重新查询当前 Catalog。Catalog 删除已保存的底模后，Client 先把该 Session 的底模恢复为“全部底模”并把页码恢复为第一页，再发起查询。
- 浏览器拒绝存储访问、持久化 JSON 无效或写入失败时，弹窗显示 `CONTEXT_DIALOG_NAVIGATION_STORAGE_FAILED` 对应的原因和处理动作。写入失败不会把未保存的新导航位置发布为当前状态。
- Harness 复用同一个 Dock 渲染不同 Session 时，Client 关闭旧 Session 的弹窗、中止其 Catalog 请求并丢弃未确认候选；两个 Session 的已保存筛选位置不会相互覆盖。

## 验证

- `ContextDialogNavigationStore` 单元测试覆盖跨 Client store 重建恢复、Session 隔离、严格 JSON 校验、Storage resolver/read/write 失败、成功重试和 dispose。
- Client 与 `WorkbenchDock` 单元测试覆盖关闭重开、Session 切换、请求中止、失效底模修正、修正写入失败和存储属性访问失败。
- 本地 `pnpm quality` 通过：305 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过。
- 真实 Chrome 验收确认 Session A 的 Workflow 模板、搜索词 `a` 和第 2 页，以及 Session B 的 `wai` 底模、LoRA、搜索词 `age` 和第 1 页，在关闭重开、Session 切换、浏览器刷新和 Client/Host 重启后分别恢复。
