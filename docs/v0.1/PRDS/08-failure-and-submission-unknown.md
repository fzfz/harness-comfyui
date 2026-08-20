# PRD 08：运行失败与 Submission Unknown

## 关联 Ticket

Ticket 08 — 在运行失败或提交结果未知时获得安全的下一步。

## 用户任务

浏览器用户在画风对比 Chat Turn 中区分一项成功和一项失败；远端执行失败时看到失败节点与下一步，提交结果无法确认时看到重复执行风险，并且页面不会提供绕过 Harness 消息与 Tool Call 的直接重试按钮。

## 原型依据

- “画风参数对比”Session 的成功/失败双卡片。
- “运行失败”卡片、错误码、具体原因和下一步。
- “提交结果未知”卡片、没有 `prompt_id`、不能查询、不能取消、不会自动重新提交和要求发送新消息。

## 结构化错误唯一来源

`config/error-catalog.json` 必须保存 backend error code 到用户文案的唯一映射。每条包含 `code`、卡片标题、原因模板、下一步模板、是否可取消和是否需要用户确认重复执行风险。Client 组件只能按 code 读取该目录，不能散落硬编码另一套错误文案。

本 Ticket 至少定义：`COMFYUI_REMOTE_EXECUTION_FAILED`、`COMFYUI_SUBMISSION_RESULT_UNKNOWN`、`COMFYUI_JOB_MISSING`、`RUN_REQUEST_CONFLICT`、`SOURCE_CONTRACT_UNSUPPORTED`、`GENERATION_ARTIFACT_NOT_READY`。

## 同一 Tool Call 的接纳规则

- Run Repository 使用 `(workspace_id, session_id, call_id)` 作为唯一 Tool execution mapping。
- 同一 mapping 与相同不可变 Generation Tool 请求快照返回原 `run_id`。
- 同一 mapping 与不同请求快照返回 `RUN_REQUEST_CONFLICT`，不创建新 Run，也不调用 `/prompt`。
- 新消息产生的新 `call_id` 创建新 `run_id`。Submission Unknown 原运行保持不变。

## 失败分支

1. `/prompt` 明确拒绝时进入 `failed`，错误记录包含安全远端状态与用户可执行下一步。
2. Jobs API 返回 `failed` 时保存失败节点 ID、节点安全标题、远端错误类别和已脱敏详情；UI 使用产品错误码 `COMFYUI_REMOTE_EXECUTION_FAILED`。
3. 媒体验证、Workflow 构建或来源读取等明确错误进入 `failed`，使用各自错误码，不能全部显示成“ComfyUI 失败”。
4. `/prompt` 请求超时、连接中断或 Host 在 `submitting` 崩溃，且没有持久 `prompt_id` 时进入终态 `submission_unknown` 与 `COMFYUI_SUBMISSION_RESULT_UNKNOWN`。
5. `submission_unknown` 不允许 worker 重新提交，不允许 Cancellation，不允许继续查询随机 Job。

## 浏览器交互

- failed 卡片使用原型危险色，显示状态、错误码、具体失败对象和一个清晰下一步。已保存媒体和 Workflow 继续可访问。
- submission_unknown 卡片明确显示“本仓库没有可查询的 `prompt_id`”“系统不会自动重新提交”“发送新消息会创建新的 `run_id`，远端可能产生重复结果”。
- 页面不得显示“重试”“重新提交”或直接调用 Generation Tool 的按钮。用户通过普通聊天消息确认风险并让 Agent 产生新 Tool Call。
- 双运行对比按各自 `run_id` 独立投影；一项失败不能把另一项成功卡片标为失败。

## 产品验收

1. Fake Jobs API 让同一 Chat Turn 的两个运行分别成功和失败；右列显示两张不同终态卡片。
2. 失败卡片显示准确节点、产品错误码和下一步，日志与 UI 不包含 Authorization 或私有 URL。
3. 在 `/prompt` 前、`submitting` 中、远端返回 `prompt_id` 后和 `prompt_id` 落库后分别注入崩溃；任何恢复路径都不创建第二个 Job。
4. 同一 `call_id` 相同快照复用 `run_id`；不同快照返回冲突；新 `call_id` 创建新运行。
5. submission_unknown 卡片没有取消或重试按钮，且发送一条新消息后原卡片保持不变。
6. 语义审核者逐项检查错误主体、失败对象、原因、下一步和风险说明，不接受“发生错误”等宽泛文案。

## 不属于本 Ticket

本 Ticket 不提供直接重试按钮，不推断远端是否实际创建了未知 Job，也不自动搜索可能匹配的 ComfyUI Job。
