# Harness ComfyUI Generation Run Input CLI 参考

## CLI 的用途与适用任务

`generation run-inputs --stdin` 为 Krea2 Anime Prompt Builder 只读查询一个或多个历史 ComfyUI Generation Run。该命令返回创建 Run 时保存的 `generate_with_comfyui` 参数和该 Run 保存的 Actual Workflow。

用户要求读取、核对、比较或复用历史 Run 的 Workflow、模板 ID、生成模型、LoRA、正向 Prompt 或其他生成参数时，Skill 执行者调用该命令。该命令不查询异步运行状态，不生成 Prompt，不创建或修改 Generation Run，也不读取图片。

## 调用环境与可执行入口

Harness ComfyUI Host 必须处于运行状态。Skill 执行者必须从当前 Session 的 Workspace 工作目录，在受管前台 shell Tool Call 中通过 `node "$DSH_HARNESS_COMFYUI_CLI"` 执行本文件定义的命令。

Managed environment 自动提供 CLI 脚本路径、Host endpoint 和当前 shell Tool Call 的短期 capability。Host 使用当前工作目录解析 Workspace，并验证当前 Session 属于该 Workspace。Skill 执行者不得提供 Workspace ID、Session ID、Turn、Tool Call ID、Host endpoint 或 capability。本文件包含该查询的完整调用合同，不要求 Skill 执行者读取仓库源码或其他 Skill。

## 命令与调用时机

Skill 执行者只使用以下命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
```

用户只要求查询历史 Run 时，Skill 执行者使用一个包含一至二十个 ID 的请求调用一次，按 `runs[]` 顺序报告结果，然后结束。用户要求复用历史正向 Prompt 时，Skill 执行者先完成查询，再从用户指定的可用结果中读取 `arguments.parameters.positive_prompt`；查询命令本身不执行 Prompt 改写。

当前请求没有历史 `run_id`，或者用户没有要求读取、核对、比较或复用历史 Run 时，Skill 执行者不得调用该命令。

## 参数与标准输入

命令行不接受 `--stdin` 以外的选项。Skill 执行者必须向 stdin 写入一个只包含 `run_ids` 的 JSON 对象：

```json
{
  "run_ids": ["run_3c0ad3ed", "run_d26923be"]
}
```

`run_ids` 必须是只包含一至二十个字符串的数组。每个字符串可以是完整 Generation Run ID，也可以是当前 Workspace 内唯一的规范短 ID。短 ID 使用 `run_` 加完整 UUID 的起始片段，并且至少包含八个 UUID 字符。CLI 保留输入顺序和重复值。

缺失 `run_ids`、`run_ids` 不是数组、数组为空、数组超过二十项、元素不是字符串、stdin 不是一个 JSON 对象或 JSON 包含额外属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。

## ID 与运行值的来源

Skill 执行者必须从当前用户消息中的明确 `run_id`，或当前会话中被用户明确指代的此前 Generation 提交结果，取得 `run_ids`。当前消息包含明确 ID 时，Skill 执行者按照这些 ID 的出现顺序传递；用户指代此前提交结果时，Skill 执行者按照对应提交结果的返回顺序传递。Skill 执行者不得猜测 ID，也不得选择用户没有指代的历史 Run。

短 ID 只匹配当前 Workspace 中以该值开头的完整 Run ID。唯一匹配返回完整 canonical `run_id`；没有匹配返回逐项 `GENERATION_RUN_NOT_FOUND`；多个匹配返回逐项 `GENERATION_RUN_ID_AMBIGUOUS`。

Host 从 managed environment 和当前 Session 工作目录取得执行身份与 Workspace。Skill 执行者不在 stdin 中填写 `workspace_id`、`session_id`、`turn` 或 `call_id`。该只读命令不保存新的归属值。

## 输出与完成语义

合法查询完成时，CLI 进程退出码为 `0`，stdout 只包含一行 JSON，stderr 为空。输出顶层对象包含 `runs` 数组；数组长度和顺序与输入 `run_ids` 一致，重复 ID 产生重复结果项。

可用结果项包含：

- `run_id`：完整 canonical Generation Run ID；
- `lookup_status: "available"`；
- `arguments.title`：创建 Run 时提交的标题；
- 可选 `arguments.instance_id`：创建 Run 时提交的 ComfyUI 实例 ID；
- `arguments.template_id`：创建 Run 时提交的 Workflow 模板 ID；
- 可选 `arguments.model`：创建 Run 时提交的生成模型 `id` 与 `file_name`；
- `arguments.parameters`：创建 Run 时提交的全部运行参数；
- `arguments.loras`：创建 Run 时提交的结构化 LoRA 数组；
- `workflow_status: "available"` 与 `workflow`，或者 `workflow_status: "unavailable"` 与 `workflow_error`。

历史请求没有 `loras` 属性时，CLI 返回 `arguments.loras: []`；该空数组只说明保存的调用参数没有显式结构化 LoRA 选择。历史请求没有 `model` 属性时，结果省略 `arguments.model`；该省略只说明保存的调用参数没有显式模型覆盖。`workflow_status: "unavailable"` 不影响同一结果项中生成参数的可用性。

逐项查询失败时，结果项结构为：

```json
{
  "run_id": "<requested-run-id>",
  "lookup_status": "error",
  "error": {
    "code": "<error-code>",
    "message": "<actionable-message>"
  }
}
```

逐项错误不改变进程退出码 `0`，也不阻止后续结果返回。命令级失败时，CLI 不在 stdout 输出结果，进程使用非零退出码，并在 stderr 输出一行 `ERROR_CODE: message`。该命令是同步只读查询；退出码 `0` 表示本次查询已经完成，不表示任何历史 Run 的生成任务当前成功或完成。

## 错误、修正与重试

| 错误位置与代码 | Skill 执行者的修正动作 |
| --- | --- |
| 命令级 `CLI_ARGUMENT_INVALID` | 按本文件的固定命令和 `--stdin` 选项重新构造调用。 |
| 命令级 `CLI_REQUEST_INVALID` | 修正 stdin JSON 的属性、类型或一至二十项数量限制后重试。 |
| 命令级 `CLI_ENVIRONMENT_INVALID` | 改用受管前台 shell Tool Call，并确认 Harness ComfyUI Host 正在运行。 |
| 命令级 `CLI_CAPABILITY_INVALID` | 在新的受管前台 shell Tool Call 中重试，不复用旧 capability。 |
| 命令级 `CLI_REQUEST_TOO_LARGE` | 报告请求超过 CLI 大小限制，并请用户减少本次请求中的 Run ID 或其他输入长度。 |
| 命令级 `CLI_RESPONSE_TOO_LARGE` | 报告响应超过 CLI 大小限制，并请用户减少本次请求中的 Run ID。 |
| 命令级 `CLI_PROTOCOL_ERROR` | 检查 Host 状态和日志；Host 恢复后再调用。 |
| 命令级 `CLI_REQUEST_FAILED` | 确认 Host 仍在运行；连接恢复后再调用。 |
| 命令级 `CLI_INTERNAL_ERROR` | 报告错误并检查 Host 日志，不原样重复调用。 |
| 命令级 `GENERATION_WORKSPACE_REQUIRED` | 在关联 Harness Workspace 的 Session 中重新执行查询。 |
| 逐项 `GENERATION_RUN_ID_INVALID` | 报告该项错误，并取得安全的完整 ID 或至少八个规范 UUID 前缀字符后只重试该项。 |
| 逐项 `GENERATION_RUN_ID_AMBIGUOUS` | 请用户提供更多 Run ID 字符，然后只重试该项。 |
| 逐项 `GENERATION_RUN_NOT_FOUND` | 报告当前 Workspace 中没有该 Run，并继续处理其他项。 |
| 逐项 `GENERATION_REQUEST_INVALID` | 报告保存的 Generation Request 无法读取；不把该项作为 Prompt 基线。 |
| 逐项 `GENERATION_RUN_LOOKUP_FAILED` | 报告 Host 存储读取错误；存储状态恢复后只重试该项。 |

用户或宿主取消当前命令时，Skill 执行者必须立即停止本次 Skill 执行。业务输入可以明确修正时，Skill 执行者最多修正并重试一次。Host、Workspace 或 managed environment 状态没有变化时，Skill 执行者不得原样重复调用。

## 副作用与重复调用

`generation run-inputs --stdin` 是只读命令。该命令不创建、修改或覆盖 Generation Run、Actual Workflow、Saved Media、Prompt、配置或本地输出文件。

Skill 执行者把一至二十个 ID 放在一次调用中。用户提供超过二十个 ID 时，Skill 执行者报告 CLI 的一至二十项限制，请用户把本次查询缩小到一至二十个 ID；Skill 执行者不自动拆分或合并多个查询。相同输入的后续调用会重新读取当前 Host 存储状态，不缓存或替换前一次结果。逐项错误后的定向重试只查询被修正的 ID，不重复查询已经可用的项。

## 完整调用示例

以下两个短 ID 来自当前用户消息，Skill 执行者按出现顺序查询：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed","run_d26923be"]}
JSON
```

查询单个完整 ID 时仍然使用数组。以下 ID 来自当前会话中被用户明确指代的此前 Generation 提交结果：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed-1111-2222-3333-444444444444"]}
JSON
```
