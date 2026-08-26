# Harness ComfyUI v0.30.3

v0.30.3 让项目生成 Skill 按每项 Generation Request 查询当前实例目录，并使用首个有效实例 ID 创建异步运行。

## 主要变更

- `comfyui-generate` 在每次调用 `generate_with_comfyui` 前调用一次 `query_semantic_comfyui_instances`，固定传递 `{"mode":"search","query":"","page":1,"page_size":100}`。
- 成功响应必须满足 `status: "ok"`、`message: null`、`results` 为非空数组，且 `results[0].id` 是正整数或正十进制整数字符串。Skill 将首个 ID 转为十进制字符串，并通过 `generate_with_comfyui.instance_id` 提交当前 Generation Request。
- 实例 ID 只来自当前实例查询。Workflow 模板、生成模型、LoRA 和运行参数不参与实例选择。
- 实例查询调用失败、响应结构无效、结果为空或首个 ID 无效时，Skill 停止当前及后续 Generation Request 的生成调用。此前已经创建的 Run 继续保留，Skill 返回已创建的 `run_id`、当前失败的 Generation Request 和具体查询错误。
- 同一轮包含多个 Generation Request 时，Skill 为每项请求重新查询实例目录，不复用上一项请求的实例查询结果。

## 验证

- 本地 `pnpm quality` 通过：244 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过。
- 源码版本提交 `cff386cc97ed8557f15c7183fc0f64234a992ca8` 的 GitHub CI 已成功。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
