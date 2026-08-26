# Harness ComfyUI v0.30.4

v0.30.4 修复 ComfyUI 实例 ID 查询 Tool 的项目注册、模板 Workflow 的 BOOLEAN 输入编译和 `/prompt` 请求缺少 Actual Workflow 元数据导致的生成失败。

## 主要变更

- Host 项目 Tool 注册表新增 `query_semantic_comfyui_instances`。该 Tool 固定调用 Catalog CLI 的 `/internal/semantic/comfyui-instances` search 请求，响应中的每个实例结果项只包含 `id`。
- `comfyui-generate` 使用当前实例查询返回的首个有效实例 ID 调用 `generate_with_comfyui`。Workflow 模板、生成模型、LoRA、运行参数和已有 Run 记录不参与实例选择。
- Workflow compiler 在实时 `/object_info` 把输入声明为 `BOOLEAN`、但 UI Workflow 序列化值不是布尔值时，使用该实时输入定义中的布尔默认值。实时输入定义没有布尔默认值时，编译器返回 `WORKFLOW_COMPILE_FAILED`。
- ComfyUI `/prompt` 请求现在同时发送 API Workflow 和 `extra_data.extra_pnginfo.workflow` 中的 Actual Workflow，使读取 `EXTRA_PNGINFO` 的 ComfyUI 节点获得当前运行的 UI Workflow。
- 主仓库 `AGENTS.md` 和版本发布规范明确要求所有修复先在主仓库通过质量门、提交、CI 和版本发布，再从最终发布提交部署生产运行目录；生产运行目录不再作为源码热修位置。

## 验证

- 本地 `pnpm quality` 通过：266 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过。
- 源码版本提交 `25ce716cce293b56539e9823dc4a76da4237ed6b` 的 GitHub CI 已成功。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
