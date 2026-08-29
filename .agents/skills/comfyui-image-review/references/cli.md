# Harness ComfyUI 图片读取 CLI 参考

## CLI 的用途与适用任务

Harness ComfyUI 图片读取 CLI 为 `comfyui-image-review` Skill 提供两个任务：

- `image run-media --stdin` 只查询一个或多个 ComfyUI Generation Run 的原始 `parameters` 与本地图片路径；
- `image inspect --stdin` 使用图片读取设置中的独立视觉模型观察一张本地图片。

两个命令都不比较 Generation Prompt 与图片观察，不编写改进 Prompt，也不创建新的 ComfyUI Generation Run。Skill 执行者负责在取得 `parameters` 与 `observation` 后完成语义对比。

## 调用环境与可执行入口

Harness ComfyUI Host 必须处于运行状态。Skill 执行者必须在受管前台 shell Tool Call 中通过 `$DSH_HARNESS_COMFYUI_CLI` 执行本文件定义的命令。Managed environment 自动提供 CLI executable、Host endpoint 和当前 shell Tool Call 的短期 capability。

Skill 执行者必须从当前 Session 的 Workspace 工作目录调用 `image run-media --stdin`。Host 使用该工作目录解析当前 Workspace，并验证当前 Session 属于该 Workspace。Skill 执行者不得向命令提供 Workspace ID、Session ID、Turn、Tool Call ID、Host endpoint 或 capability。

Skill 执行者调用 `image inspect --stdin` 前，用户必须已经在 Harness“图片读取”设置页保存 Provider、视觉模型、默认读图 Prompt、`temperature` 和最大输出 Token。Skill 执行者不需要读取系统注入的 Tool schema。

## 命令与调用时机

Skill 执行者必须按以下顺序调用命令：

1. Skill 执行者把“ID 与运行值的来源”章节定义的来源取得的 `run_id` 按原顺序分成每组一至二十个。
2. Skill 执行者为每组调用一次 `image run-media --stdin`。
3. Skill 执行者按每个成功 Run 的 `images` 顺序处理图片。
4. Skill 执行者为每张图片分别调用一次 `image inspect --stdin`。该命令一次只接受一个 `file_path`。

某个 Run 的查询结果为逐 Run 错误时，Skill 执行者必须跳过该 Run 的图片读取。某个成功 Run 的 `images` 为空时，Skill 执行者不得调用 `image inspect --stdin`。

## 参数与标准输入

### image run-media --stdin

命令行固定为：

```sh
"$DSH_HARNESS_COMFYUI_CLI" image run-media --stdin
```

Skill 执行者必须向 stdin 写入一个只包含 `run_ids` 的 JSON 对象：

```json
{
  "run_ids": ["run_123", "run_456"]
}
```

`run_ids` 必须是只包含一至二十个字符串的数组。每个字符串可以是完整 Generation Run ID，也可以是当前 Workspace 内唯一的规范 Run ID 前缀。规范 Run ID 前缀必须至少包含八个 UUID 字符。CLI 保留输入顺序和重复值。

缺失 `run_ids`、`run_ids` 不是数组、元素不是字符串、数组为空、数组超过二十项或输入 JSON 包含额外属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。

### image inspect --stdin

命令行固定为：

```sh
"$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin
```

Skill 执行者使用设置中的默认读图 Prompt 时，必须向 stdin 写入一个只包含 `file_path` 的 JSON 对象：

```json
{
  "file_path": "/absolute/local/path/result.png"
}
```

Skill 执行者为当前图片指定一次性观察要求时，必须提供非空 `prompt`：

```json
{
  "file_path": "/absolute/local/path/result.png",
  "prompt": "只描述人物姿态、手部状态和镜头构图。"
}
```

`file_path` 必须是长度不超过一万个字符的非空字符串。`file_path` 不得包含 U+0000–U+001F 或 U+007F–U+009F 控制字符，因此换行符和制表符也不合法。Host 只接受 PNG、JPEG、WebP 或 GIF 图片的本地绝对路径，并且 Host 必须能够读取该文件。

`prompt` 可以省略。CLI 接受的 `prompt` 必须是去除首尾空白后仍非空、不含 NUL 字符且长度不超过五万个字符的字符串。省略 `prompt` 时，Host 使用“图片读取”设置中的默认读图 Prompt。一次性 `prompt` 不修改图片读取设置。

输入 JSON 必须只包含 `file_path`，或只包含 `file_path` 与 `prompt`。缺失 `file_path`、属性类型错误、`prompt` 为空或输入 JSON 包含额外属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。

## ID 与运行值的来源

Skill 执行者必须从当前用户消息中的明确 `run_id`，或当前会话中被用户明确指代的此前 Generation 提交结果中的 `run_id`，取得 `image run-media --stdin` 的 `run_ids`。当前消息包含明确 `run_id` 时，Skill 执行者按这些 ID 的出现顺序传递；用户指代此前提交结果时，Skill 执行者按对应提交结果的返回顺序传递。Skill 执行者不得选择用户没有指代的历史 Generation Run，也不得猜测 Generation Run ID。

Host 使用 managed environment 中的当前 Session 工作目录解析 Workspace。Skill 执行者不得在 stdin 中填写 `workspace_id`、`session_id`、`turn` 或 `call_id`。

Skill 执行者必须从成功 Run 元素的 `images[].file_path` 取得 `image inspect --stdin` 的 `file_path`。Skill 执行者不得从 `filename`、`media_id` 或 `run_id` 拼接本地路径。

`image inspect --stdin` 使用的 Provider、模型、默认读图 Prompt、`temperature` 和最大输出 Token 全部来自 Harness“图片读取”设置。Skill 执行者只在用户指定本次观察重点时提供一次性 `prompt`。

## 输出与完成语义

每个命令成功时，CLI 进程退出码为 `0`，stdout 只包含一行 JSON，stderr 为空。命令级失败时，CLI 不在 stdout 输出 JSON，stderr 只包含一行 `ERROR_CODE: message`。

### image run-media --stdin 输出

```json
{
  "runs": [
    {
      "run_id": "run_123",
      "lookup_status": "available",
      "title": "角色立绘",
      "parameters": {
        "positive_prompt": "1girl, white hair",
        "negative_prompt": "bad hands",
        "width": 1024,
        "height": 1536,
        "seed": 28101
      },
      "images": [
        {
          "media_id": "media_123",
          "node_id": "9",
          "output_index": 0,
          "filename": "result.png",
          "media_type": "image/png",
          "file_path": "/absolute/local/path/result.png"
        }
      ]
    },
    {
      "run_id": "run_missing",
      "lookup_status": "error",
      "error": {
        "code": "GENERATION_RUN_NOT_FOUND",
        "message": "Generation Run was not found in the current Workspace."
      }
    }
  ]
}
```

`runs` 为每个输入 `run_id` 返回一个元素。成功元素的 `run_id` 是解析后的完整 Generation Run ID；错误元素的 `run_id` 保留输入值。某个 Run 没有已保存图片时，成功元素的 `images` 是空数组。逐 Run 错误不改变命令的退出码 `0`，并且不阻止 CLI 返回其他 Run 的结果。

每个 `images` 数组先按 SQLite `BINARY` 顺序比较 `node_id`，再按数值升序比较 `output_index`，最后按 SQLite `BINARY` 顺序比较 `media_id`。因此 ASCII `node_id` `"10"` 排在 `"2"` 之前。`parameters` 是 Host 接受该 Run 时保存的原始 Generation Request 参数。

### image inspect --stdin 输出

```json
{
  "provider": "provider-route",
  "model": "vision-model",
  "file_path": "/absolute/local/path/result.png",
  "observation": "图片中可见一名白发人物，采用半身正面构图。"
}
```

`provider` 和 `model` 是 Host 为本次调用准备出的实际路由。`file_path` 是本次输入的本地图片路径。`observation` 只包含视觉模型返回的图片观察文本。该输出表示视觉模型调用已经完成，不表示 Prompt 对比已经完成。

## 错误、修正与重试

### 所有命令共用的命令级错误

| 错误码 | 含义与修正动作 |
| --- | --- |
| `CLI_ARGUMENT_INVALID` | Skill 执行者使用了未定义的命令行或选项。Skill 执行者必须按本文件的固定命令行重新构造调用。 |
| `CLI_REQUEST_INVALID` | stdin JSON 不符合对应命令的输入合同。Skill 执行者必须修正 JSON 属性、类型、数量或字符限制后重试。 |
| `CLI_ENVIRONMENT_INVALID` | 当前 shell Tool Call 没有可用的 managed CLI 环境，或 Host endpoint 无效。Skill 执行者必须改用受管前台 shell Tool Call，并确认 Harness ComfyUI Host 正在运行。 |
| `CLI_CAPABILITY_INVALID` | Host 拒绝当前 shell Tool Call 的 capability。Skill 执行者必须在新的受管前台 shell Tool Call 中重试，不得复用旧 capability。 |
| `CLI_REQUEST_TOO_LARGE` | CLI executable 或 Host 拒绝超过请求体上限的 stdin JSON。Skill 执行者必须删除多余 JSON 空白并缩短输入；`image run-media --stdin` 仍然超限时，Skill 执行者必须把 Run ID 按更小批次查询。 |
| `CLI_RESPONSE_TOO_LARGE` | Host 响应超过 CLI 读取上限。Skill 执行者必须减少当前 Run 批次；单图命令出现该错误时，Skill 执行者必须报告错误并停止重试当前图片。 |
| `CLI_PROTOCOL_ERROR` | Host 返回了无效的 JSON 或错误 envelope。Skill 执行者必须检查 Host 状态和日志后重试。 |
| `CLI_REQUEST_FAILED` | CLI 无法完成 loopback Host 请求。Skill 执行者必须确认 Host 仍在运行后重试。 |
| `CLI_INTERNAL_ERROR` | Harness ComfyUI Host 在处理请求时发生未分类内部错误。Skill 执行者必须报告错误码并检查 Host 日志，不得原样重复调用。 |

上述命令级错误没有对应的逐 Run 结果。Skill 执行者不得为命令级错误编造 `run_id`。

### image run-media --stdin 错误

`GENERATION_WORKSPACE_REQUIRED` 是命令级错误。该错误表示当前 Session 没有关联 Harness Workspace。Skill 执行者必须在关联 Workspace 的 Session 中重新执行查询。

以下错误位于某个 `runs` 元素的 `error` 对象中：

| 错误码 | 修正与重试 |
| --- | --- |
| `GENERATION_RUN_ID_INVALID` | Skill 执行者必须报告该元素的 `run_id`、`error.code` 和 `error.message`，并使用安全的完整 Run ID 或至少八个规范 UUID 前缀字符重新查询。 |
| `GENERATION_RUN_ID_AMBIGUOUS` | Skill 执行者必须请用户提供更多 Run ID 字符，并只重试该 Run。 |
| `GENERATION_RUN_NOT_FOUND` | Skill 执行者必须报告当前 Workspace 中没有该 Run，并跳过该 Run。 |
| `GENERATION_RUN_LOOKUP_FAILED` | Skill 执行者必须报告 Host 日志查询错误，并在 Host 存储状态恢复后只重试该 Run。 |

### image inspect --stdin 错误

| 错误码 | 修正与重试 |
| --- | --- |
| `IMAGE_READER_MODEL_NOT_CONFIGURED` | Skill 执行者必须请用户先在“图片读取”设置中保存 Provider 与视觉模型。 |
| `IMAGE_READER_FILE_INVALID` | Skill 执行者必须报告当前 `file_path`，并继续处理其他图片。只有取得新的有效 `images[].file_path` 后，Skill 执行者才可以重试当前图片。 |
| `IMAGE_READER_ATTACHMENT_FAILED` | Skill 执行者必须报告当前 `file_path` 的 Attachment 错误。Harness Attachment 服务恢复后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_MODEL_UNAVAILABLE` | Skill 执行者必须请用户刷新模型目录或修改图片读取设置。设置变更后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_MODEL_IMAGE_UNSUPPORTED` | Skill 执行者必须请用户在图片读取设置中改选明确支持图片输入的模型。设置变更后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_PROVIDER_FAILED` | Skill 执行者必须报告当前 `file_path` 的 Provider 错误，并继续处理其他图片。Provider 恢复后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_EMPTY_RESPONSE` | Skill 执行者必须报告当前 `file_path` 没有观察文本，并继续处理其他图片。Skill 执行者只有在修改一次性 `prompt` 或图片读取设置后才可以重试当前图片。 |

用户或宿主取消当前命令时，Skill 执行者必须立即结束本次 Skill 执行。调用取消不属于 `IMAGE_READER_PROVIDER_FAILED`，Skill 执行者不得继续调用后续图片。

## 副作用与重复调用

`image run-media --stdin` 是只读命令。该命令不创建或修改 Generation Run、Saved Media、图片读取设置或 Prompt 对比结果。Skill 执行者可以为不同 Run 批次重复调用该命令；相同输入的后续调用重新读取当前 Host 存储状态。

`image inspect --stdin` 不修改 Generation Run、Saved Media、图片读取设置或 Prompt。该命令会把当前本地图片提交给 Harness Attachment 服务，并向设置中的 Provider 发起一次视觉模型调用。Skill 执行者默认必须为每张图片调用一次。Skill 执行者重试同一图片时会再次产生 Attachment 接收与 Provider 调用；前一次成功观察不会被 CLI 缓存或覆盖。

## 完整调用示例

以下 `run_123` 来自用户消息中的 Generation Run ID：

```sh
"$DSH_HARNESS_COMFYUI_CLI" image run-media --stdin <<'JSON'
{"run_ids":["run_123"]}
JSON
```

假设前一条命令返回 `runs[0].images[0].file_path` 为 `/absolute/local/path/result.png`，Skill 执行者使用默认读图 Prompt 时调用：

```sh
"$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png"}
JSON
```

用户要求重点检查手部与构图时，Skill 执行者对同一个 `file_path` 调用：

```sh
"$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png","prompt":"只描述人物手部状态和镜头构图。"}
JSON
```
