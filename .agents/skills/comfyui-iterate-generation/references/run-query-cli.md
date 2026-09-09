# CLI 用途与入口

生成 Agent 使用以下命令读取本任务的实际请求、Actual Workflow 和已保存图片。首次调用前完整读取本文件。

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation resolve-media --stdin
```

生成 Agent 在当前会话的 Workspace 工作目录通过前台 shell 调用命令。命令只读取结果，不创建 Run。保存文件时使用明确路径。

# 标准输入与 ID 来源

两个命令的 stdin 均为只含 `run_ids` 的 JSON 对象。`run_ids` 是一至二十个字符串，保留顺序和重复项。超过二十项按原顺序分组。

ID 来自用户明确指定的历史 Run，或本任务生成子 Agent 已保存的真实提交结果。使用完整 Run ID，或 `run_` 加 UUID 至少前八个字符的规范前缀；短 ID 保留 UUID 中原有连字符位置，例如 `run_3c0ad3ed-9f27`。不从缺失回执猜测 ID，不添加 workspace_id、session_id、turn 或 call_id 参数。

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed"]}
JSON
```

# 输出属性与完成含义

退出码 0、stderr 为空时，stdout 为单行 JSON `{ "runs": [...] }`。结果数量和顺序与输入对应。逐 Run 错误不会改变整体退出码 0。

| 命令与结果 | 属性及含义 |
|---|---|
| run-inputs 查询成功 | run_id 为完整 ID；lookup_status=available；arguments 为创建时保存的请求。arguments.title、arguments.template_id、arguments.parameters 为标题、模板 ID 和参数；arguments.instance_id、arguments.model 保留原请求具有的值。arguments.loras 为 LoRA 数组，原请求缺失时为空数组；arguments.model 可为 null 或包含 id、file_name 的对象 |
| Actual Workflow 可用 | workflow_status=available，workflow 为完整 JSON 对象 |
| Actual Workflow 不可用 | 保留 arguments；workflow_status=unavailable，workflow_error.code 为错误码，workflow_error.message 为原因说明 |
| resolve-media 查询成功 | run_id 为完整 ID；lookup_status=available；title 为运行标题，parameters 为原始参数对象，images 为已保存图片数组 |
| images 每项 | media_id 为媒体 ID，node_id 为输出节点 ID，output_index 为输出序号，filename 为原文件名，media_type 为 MIME，file_path 为可读取的本地绝对路径 |
| 任一逐 Run 错误 | run_id 保留输入值；lookup_status=error；error.code 为错误码、error.message 为说明 |

images 按 node_id 字符串、output_index 数值、media_id 字符串依次升序排列，保留返回顺序。只使用 file_path 读取或复制图片，不由 ID 和文件名拼接路径。

run-inputs 和 resolve-media 不提供 Run 的完整运行状态。images=[] 只表示尚无已保存图片，不能据此断言运行中、失败或已完成；workflow_status=available 也不代表图片已经生成。保存完整原始输出，并将“未取得图片”与查询错误分开记录。

# 复用已查询结果并处理尚无图片的 Run

生成 Agent 可复用已成功保存的请求和 Workflow；Workflow 暂不可用或任务要求刷新时重新查询。images 为空时，生成 Agent 记录并向主 Agent 报告尚未取得图片的 Run ID；继续任务时查询这些已有 Run。

# 命令错误与修正条件

非零退出码时 stdout 应为空，stderr 为单行 `ERROR_CODE: message`。保留真实退出码和 stderr；输出协议不符时报告协议问题并结束本次查询。

| 错误类别 | 处理动作 |
|---|---|
| CLI_ARGUMENT_INVALID、CLI_REQUEST_INVALID | 核对命令、run_ids 数量和格式；修正自己构造的无效输入后重试 |
| CLI_REQUEST_TOO_LARGE、CLI_RESPONSE_TOO_LARGE | 减少同批 Run 数量；单个 Run 仍超限则报告并停止该项 |
| CLI_ENVIRONMENT_INVALID、CLI_CAPABILITY_INVALID、GENERATION_WORKSPACE_REQUIRED | 报告当前会话无法使用受管查询，结束本次查询；环境修复后再次调用，不传递或复用执行凭据 |
| CLI_REQUEST_FAILED、CLI_PROTOCOL_ERROR、CLI_INTERNAL_ERROR 及其他命令错误 | 保存错误并结束本次查询，具体原因消除后才重试 |
| GENERATION_RUN_ID_INVALID、GENERATION_RUN_ID_AMBIGUOUS | 报告该项，需要用户提供规范或更完整的 ID；其余项继续 |
| GENERATION_RUN_NOT_FOUND | 报告当前 Workspace 未找到该 Run，保留原请求及原提交状态，不据此重发 |
| GENERATION_REQUEST_INVALID、GENERATION_RUN_LOOKUP_FAILED | 保存该项错误；存储或输入问题解决后只重试该项 |

调用取消时结束本次查询，保留已取得的结果。将查询结果或错误写入任务指定的生成结果文件。
