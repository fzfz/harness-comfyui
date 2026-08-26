# Harness ComfyUI v0.30.2

v0.30.2 修复 Generation Tool 上下文校验、Workflow 参数保留、随机种子实例化和结果媒体预览问题。

## 主要变更

- `generate_with_comfyui` 现在根据当前 Session 中匹配的 Generation Tool Call 建立 Generation Run，不再要求用户消息携带 `skill-invocation` source；缺少匹配 Tool Call 时返回 `GENERATION_TOOL_CONTEXT_INVALID`。
- `SourceGenerationPreparer` 只把 Generation Request 显式提供的参数交给 Workflow compiler。请求省略非必填参数时，Workflow compiler 保留模板 Workflow 的原始值；请求省略必填参数时，Host 返回 `GENERATION_PARAMETER_INVALID`。
- Workflow compiler 在提交 API Workflow 前，把活动 `Seed (rgthree)` 节点中的前端随机标记 `seed=-1` 实例化为本次 Generation Run 的非负整数，并把同一个整数保存到 Actual Workflow 与 API Workflow。固定的 `Seed (rgthree)` 值、普通 ComfyUI seed 节点和 bypassed `Seed (rgthree)` 节点保持原值。
- 右侧结果列的图片和视频预览使用 `object-fit: contain`，在预览容器内保持原始宽高比并显示完整媒体画面。
- 回归测试覆盖 Generation Tool 上下文、必填与非必填参数、`Seed (rgthree)` 随机标记和图片/视频预览样式合同。

## 验证

- 本地 `pnpm quality` 通过：244 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过。
- 源码版本提交 `265a2494ba904d3b4a905f6c5968906018dae266` 的 GitHub CI 已成功。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
