# Harness ComfyUI 本地图片读取 CLI 参考

## CLI 的用途与适用任务

Harness ComfyUI 本地图片读取 CLI 使用 Harness“图片读取”设置中当前命名配置的视觉模型读取一张本地图片。用户提供本地图片绝对路径并要求识别、描述或分析图片内容时，`local-image-reader` Skill 调用 `image inspect --stdin`。

该命令只读取调用者提供的本地图片路径并返回视觉模型观察文本。该命令不查询 Generation Run，不读取 Generation Prompt，不比较生成意图，也不创建 ComfyUI Generation Run。

## 调用环境与可执行入口

Harness ComfyUI Host 必须处于运行状态。Skill 执行者必须在受管前台 shell Tool Call 中通过 `node "$DSH_HARNESS_COMFYUI_CLI"` 执行本文件定义的命令。Managed environment 自动提供 CLI 脚本路径、Host endpoint 和当前 shell Tool Call 的短期 capability。

Skill 执行者可以从当前 Session 工作目录调用该命令。该命令不使用工作目录解析 Workspace，也不使用工作目录解析 `file_path`；`file_path` 必须保持为用户提供或指代的本地绝对路径。

用户必须已经在 Harness“图片读取”设置页保存并启用一份可用的命名配置。当前命名配置向 CLI 提供视觉模型、读图提示词、`temperature`、最大输出 Token 和模型连接信息。Skill 执行者只提供本地图片路径，不提供执行身份、模型配置或读图参数。本文件包含完整调用合同，无需系统注入的 Tool schema。

## 命令与调用时机

Skill 执行者必须为每张待读取图片分别调用一次：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin
```

该命令一次只接受一个本地图片路径。Skill 执行者读取多张图片时，必须按用户提供的路径顺序完成多次独立调用。用户或宿主取消调用后，Skill 执行者必须停止后续调用。

## 参数与标准输入

该命令没有额外命令行参数。Skill 执行者必须向 stdin 写入一个只包含 `file_path` 的 JSON 对象：

```json
{
  "file_path": "/absolute/local/path/result.png"
}
```

`file_path` 必须是长度不超过一万个字符的非空字符串。`file_path` 必须是 Host 可以读取的本地绝对路径。目标必须是非空普通文件，文件大小不得超过 Host 当前图片输入上限。Host 根据文件内容签名接受 PNG、JPEG、WebP 或 GIF 图片。`file_path` 不得包含 U+0000–U+001F 或 U+007F–U+009F 控制字符，因此换行符和制表符也不合法。

缺失 `file_path`、`file_path` 不是字符串、路径超过长度限制、路径包含控制字符或 stdin JSON 包含额外属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。CLI 不接受调用时 Prompt、Provider、模型、凭据、`temperature` 或最大输出 Token。

## ID 与运行值的来源

该命令不使用 Workflow 模板 ID、生成模型 ID、LoRA ID、ComfyUI 实例 ID 或 Generation Run ID。Skill 执行者必须从用户消息中明确提供的本地图片绝对路径，或用户明确指代的当前消息图片附件所提供的本地绝对路径，取得 `file_path`。Skill 执行者不得根据文件名、URL、媒体 ID 或 Run ID 拼接本地路径。

Managed environment 自动提供 CLI endpoint 和 capability。Skill 执行者不得在 stdin 中填写 Workspace ID、Session ID、Turn、Tool Call ID、Host endpoint 或 capability。CLI 从 Harness“图片读取”设置中的当前命名配置取得模型连接和读图参数。

## 输出与完成语义

命令成功时，CLI 进程退出码为 `0`，stdout 只包含一行 JSON，stderr 为空：

```json
{
  "provider": "provider-route",
  "model": "vision-model",
  "file_path": "/absolute/local/path/result.png",
  "observation": "图片中可见一名白发人物，采用半身正面构图。"
}
```

`provider` 和 `model` 是 Host 报告的本次图片读取连接标识与实际模型。`file_path` 是本次输入的本地图片路径。`observation` 是视觉模型返回的图片观察文本。该输出表示本次视觉模型调用已经完成。

命令级失败时，CLI 不在 stdout 输出 JSON，stderr 只包含一行 `ERROR_CODE: message`，进程退出码非 `0`。

## 错误、修正与重试

| 错误码 | 含义与修正动作 |
| --- | --- |
| `CLI_ARGUMENT_INVALID` | Skill 执行者使用了未定义的命令行或选项。Skill 执行者必须按本文件的固定命令行重新构造调用。 |
| `CLI_REQUEST_INVALID` | stdin JSON 不符合输入合同。Skill 执行者必须修正 `file_path` 的属性名、类型、长度、字符或额外属性后重试。 |
| `CLI_ENVIRONMENT_INVALID` | 当前 shell Tool Call 没有可用的 managed CLI 环境，或 Host endpoint 无效。Skill 执行者必须改用受管前台 shell Tool Call，并确认 Harness ComfyUI Host 正在运行。 |
| `CLI_CAPABILITY_INVALID` | Host 拒绝当前 shell Tool Call 的 capability。Skill 执行者必须在新的受管前台 shell Tool Call 中重试，不得复用旧 capability。 |
| `CLI_REQUEST_TOO_LARGE` | CLI 脚本或 Host 拒绝超过请求体上限的 stdin JSON。Skill 执行者必须确认本次 JSON 只包含一个 `file_path`，并修正过长路径。 |
| `CLI_RESPONSE_TOO_LARGE` | Host 响应超过 CLI 读取上限。Skill 执行者必须报告当前 `file_path` 和错误码，并停止重试当前图片。 |
| `CLI_PROTOCOL_ERROR` | Host 返回了无效 JSON 或错误 envelope。Skill 执行者必须检查 Host 状态和日志后重试。 |
| `CLI_REQUEST_FAILED` | CLI 无法完成 loopback Host 请求。Skill 执行者必须确认 Host 仍在运行后重试。 |
| `CLI_INTERNAL_ERROR` | Harness ComfyUI Host 在处理请求时发生未分类内部错误。Skill 执行者必须报告错误码并检查 Host 日志，不得原样重复调用。 |
| `IMAGE_READER_MODEL_NOT_CONFIGURED` | 当前命名配置缺少调用视觉模型所需的值。Skill 执行者必须请用户在“图片读取”设置页完成或切换命名配置。 |
| `IMAGE_READER_FILE_INVALID` | `file_path` 不是绝对路径，或目标不是 Host 可读取的非空普通文件，或文件超过 Host 当前图片输入上限，或文件读取失败，或图片内容签名不是 PNG、JPEG、WebP 或 GIF。Skill 执行者必须报告当前 `file_path`；用户提供满足输入条件的本地图片绝对路径后，Skill 执行者可以重试。 |
| `IMAGE_READER_ATTACHMENT_FAILED` | Host 无法准备本次图片输入。Skill 执行者必须报告当前 `file_path`；Host 图片读取服务恢复后，Skill 执行者可以重试。 |
| `IMAGE_READER_MODEL_UNAVAILABLE` | 当前命名配置指定的模型不可用。Skill 执行者必须请用户刷新设置页信息或修改当前命名配置。设置变更后，Skill 执行者可以重试。 |
| `IMAGE_READER_MODEL_IMAGE_UNSUPPORTED` | 当前命名配置指定的模型没有声明图片输入能力。Skill 执行者必须请用户在图片读取设置中改选支持图片输入的模型。设置变更后，Skill 执行者可以重试。 |
| `IMAGE_READER_PROVIDER_FAILED` | Host 没有完成本次视觉模型调用。Skill 执行者必须报告当前 `file_path` 和 Host 返回的错误文本；当前命名配置对应的模型服务恢复后，Skill 执行者可以重试。 |
| `IMAGE_READER_EMPTY_RESPONSE` | 当前视觉模型调用没有返回观察文本。Skill 执行者必须报告当前 `file_path`；修改图片读取设置后，Skill 执行者可以重试。 |

用户或宿主取消当前命令时，Skill 执行者必须立即结束本次 Skill 执行。调用取消不属于 `IMAGE_READER_PROVIDER_FAILED`。

## 副作用与重复调用

`image inspect --stdin` 不创建或修改 Generation Run、Saved Media、图片读取设置或 Prompt。该命令根据当前命名配置发起一次视觉模型请求。Skill 执行者默认必须为每张图片调用一次；重复调用同一路径会再次发起视觉模型请求。CLI 不缓存或覆盖前一次成功观察。

## 完整调用示例

以下 `/absolute/local/path/result.png` 来自用户消息中明确提供的本地图片绝对路径：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png"}
JSON
```
