# Harness ComfyUI v0.31.4

v0.31.4 修复 Generation Run `run_d90e9102-cc2e-4af6-9e0f-b4c85942f2ce` 暴露的运行参数枚举校验缺失。该 Run 的 Tool Call 传入 `sampler_name: "LCM"`，模板 40 保存的值是 `lcm`，实例 122 的 `/object_info` 也只允许 `lcm`。旧 compiler 把 `LCM` 原样写入 Actual Workflow 和 API Workflow，直到 ComfyUI `/prompt` 返回 `value_not_in_list`。

## 实时枚举校验

- Workflow compiler 使用目标 ComfyUI 实例 `/object_info` 中的字符串枚举校验每个已解析运行参数目标。请求值与实例允许值精确相等时，compiler 保留请求值。
- 请求值只与一个实例允许值大小写无关地相等时，compiler 写入实例返回的精确值。例如，`LCM` 写入为 `lcm`，`NORMAL` 写入为 `normal`。
- 请求值没有匹配值或存在多个大小写无关匹配值时，compiler 返回 `GENERATION_PARAMETER_INVALID`。错误信息包含 generation parameter ID、`ComfyUI节点ID:节点类型.输入名`、收到值、实例允许值和再次调用 `generate_with_comfyui` 的修正动作。
- 校验逻辑适用于实时 `/object_info` 声明字符串枚举的全部 ComfyUI widget，不包含 sampler、模板 ID、ComfyUI 节点 ID 或 ComfyUI 节点类型特例。compiler 不读取 Source 模板记录中的 `parameters_json` 或 `bindings_json`。

## Tool 准备错误返回与异步提交

- `generate_with_comfyui` 在返回 `run_id` 前完成 Source、实例和模板读取、`/object_info` 读取、参数目标解析、枚举校验、模型和 LoRA 映射、Official 前端导出、Official cache 读取以及 Runtime Input Overlay。上述任一阶段失败时，Tool Call 直接收到原始错误码和错误信息，因此调用方可以修正请求或实例状态后再次调用 Tool。
- Host 仍然持久化失败 Run，结果页面可以继续显示同一个错误码和错误信息。同一个失败 Tool Call 的幂等重放返回持久化错误，不会把失败 Run 误报为成功接纳。
- Workflow 准备成功后，Tool 返回 `run_id`。此后发生的 ComfyUI `/prompt` 提交错误、Jobs API 观察错误、远端节点执行错误和媒体下载错误继续由 Generation coordinator 异步写入 Run。

## `/object_info` 短期缓存

- Host 按 ComfyUI 实例 ID 和实例 URL 在进程内缓存成功解析的 `/object_info` 10 分钟。同一实例的并发 compile 共享一个在途请求，支持一批 Tool Call 复用同一份实时节点定义。
- 不同实例 ID 或实例 URL 使用独立缓存项。HTTP 错误、协议错误和无效 JSON 不进入缓存。认证值和 `/object_info` 内容不写入磁盘。

## 验证

- 原 Run 请求使用修复后的源码重放时，模板 40 节点 41 的 `sampler_name` 从 `LCM` 规范化为实例允许值 `lcm`。单变量 `scheduler: "NORMAL"` 重放结果是 `normal`；不存在的 sampler 和 scheduler 均在 compiler 阶段返回 `GENERATION_PARAMETER_INVALID`。
- `/object_info` 自动化测试验证 40 个并发 compile 只产生一个请求、599999 毫秒内复用缓存、600000 毫秒时刷新、不同实例隔离和失败响应不缓存。
- 实例 122 的当前 Source Catalog 包含 18 个 Workflow 模板。真实矩阵逐模板验证 15 个公开参数，共执行 270 个单参数检查；191 个基线支持参数全部通过，79 个基线不支持参数全部返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。
- 18 个模板的受支持参数组合编译全部通过。18 个模板还分别完成真实 ComfyUI 页面 Official API Workflow cache miss、同模板 cache hit、单次前端导出和基础对象一致性验证。
- 独立 worktree Host 的 `worktree:status` 与 `worktree:health` 通过，验证结束后 `worktree:stop` 和停止状态检查通过。
- 完整 `pnpm quality` 已通过：416 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
