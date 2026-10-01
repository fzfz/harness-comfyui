# Harness ComfyUI 图片读取 CLI 参考

## CLI 的用途与适用任务

Harness ComfyUI 图片读取 CLI 为 `comfyui-image-review` Skill 提供两个任务：

- `generation resolve-media --stdin` 只查询一个或多个 ComfyUI Generation Run 的原始 `parameters` 与本地图片路径；
- `image inspect --stdin` 使用图片读取设置中的独立视觉模型观察一张本地图片。

输入来源、Run 批次、图片处理顺序、语义比较与改进 Prompt 步骤按 `SKILL.md` 第 2 至 6 节执行。本文件定义这两个命令的输入输出合同、错误和副作用。

## 调用环境与可执行入口

Harness ComfyUI Host 必须处于运行状态。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和 CLI 脚本路径 `DSH_HARNESS_COMFYUI_CLI`。Skill 执行者必须设置 `ELECTRON_RUN_AS_NODE=1`，传入 `--expose-internals`，并执行本文件定义的命令。

Skill 执行者必须在当前 Session 的 Workspace 工作目录调用 `generation resolve-media --stdin`。命令使用当前 Session 和 Workspace，Skill 执行者只需提供本文件定义的命令参数。

Skill 执行者调用 `image inspect --stdin` 前，用户必须已经在 Harness“图片读取”设置页保存并启用一份可用的命名配置。当前命名配置向 CLI 提供视觉模型、默认读图 Prompt、`temperature`、最大输出 Token 和调用该模型所需的连接信息。Skill 执行者可以提供只覆盖本次视觉模型调用的 `prompt`；CLI 自行处理当前命名配置的连接方式。

## 命令与调用时机

命令顺序、Run 批次、Run 与图片处理顺序、逐图调用和取消行为按 `SKILL.md` 第 2 至 3 节执行。`image inspect --stdin` 每次只接受一个 `file_path`；以下章节定义两条命令的输入输出字段。

## 参数与标准输入

### generation resolve-media --stdin

命令行固定为：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation resolve-media --stdin
```

Skill 执行者必须向 stdin 写入一个只包含 `run_ids` 的 JSON 对象：

```json
{
  "run_ids": ["run_01234567-89ab-4cde-8fab-0123456789ab", "run_89abcdef-0123-4567-89ab-cdef01234567"]
}
```

`run_ids` 必须是只包含一至二十个字符串的数组。每个字符串可以是完整 Generation Run ID，也可以是当前 Workspace 内唯一的 Run ID 前缀。前缀必须从完整 ID 开头连续截取，并至少包含 `run_` 与 UUID 部分开头的八个小写十六进制字符；前缀延伸到 UUID 连字符的位置时必须保留该连字符。例如，完整 ID `run_01234567-89ab-4cde-8fab-0123456789ab` 对应的最短合法前缀是 `run_01234567`。CLI 保留输入顺序和重复值。

缺失 `run_ids`、`run_ids` 不是数组、元素不是字符串、数组为空、数组超过二十项或输入 JSON 包含额外属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。

### image inspect --stdin

命令行固定为：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet image inspect --stdin
```

Skill 执行者必须向 stdin 写入包含 `file_path` 的 JSON 对象：

```json
{
  "file_path": "/absolute/local/path/result.png"
}
```

stdin 可以包含可选的 `prompt` 字段：

```json
{
  "file_path": "/absolute/local/path/result.png",
  "prompt": "逐项观察双手的手指数、遮挡关系和明显形变；只报告图片中可见的内容。"
}
```

`file_path` 必须是长度为一至一万个字符、字符范围排除 U+0000–U+001F 和 U+007F–U+009F 控制字符的字符串。该范围排除换行符和制表符。`file_path` 必须是 Host 可以读取的本地绝对路径。目标必须是非空普通文件，文件大小必须小于或等于 Host 当前图片输入上限。Host 根据文件内容签名接受 PNG、JPEG、WebP 或 GIF 图片。

视觉模型接收的是每帧宽高约为原图 70% 的图片，最小边长为一个像素。发送图片保持输入格式；PNG、WebP 和 GIF 保留透明度，动画 GIF 和动画 WebP 保留帧数、各帧延时与循环次数。原图保持不变，成功输出的 `file_path` 指向输入原图。

`prompt` 可以不提供。省略 `prompt` 时，Host 使用当前命名配置保存的默认读图 Prompt；提供 `prompt` 时，Host 使用该字符串覆盖本次调用的默认读图 Prompt。`prompt` 必须是包含非空白字符且不超过 32768 个字符的字符串，可以包含 JSON 转义后的换行符。

缺失 `file_path`、`file_path` 或 `prompt` 的类型错误、路径违反字符限制或输入 JSON 包含其他属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。空白 `prompt` 与超过长度上限的 `prompt` 由 Host 分别返回 `IMAGE_READER_PROMPT_REQUIRED` 与 `IMAGE_READER_PROMPT_TOO_LONG`。

## Run ID 与图片路径的来源

`run_ids` 的来源与顺序，以及从成功 Run 的 `images[].file_path` 取得 `file_path` 的步骤，按 `SKILL.md` 第 2 至 3 节执行。

## 输出与完成语义

每个使用 `--quiet` 的命令成功时，CLI 进程退出码为 `0`，stdout 只包含一行 JSON，stderr 为空。命令级失败时，CLI 不在 stdout 输出 JSON，stderr 只包含一行 `ERROR_CODE: message`。

### generation resolve-media --stdin 输出

```json
{
  "runs": [
    {
      "run_id": "run_01234567-89ab-4cde-8fab-0123456789ab",
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
      "run_id": "run_89abcdef-0123-4567-89ab-cdef01234567",
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

`parameters` 是 Host 接受该 Run 时保存的原始 Generation Request 参数。

### image inspect --stdin 输出

```json
{
  "provider": "provider-route",
  "model": "vision-model",
  "file_path": "/absolute/local/path/result.png",
  "observation": "图片中可见一名白发人物，采用半身正面构图。"
}
```

`provider` 和 `model` 是 Host 报告的本次图片读取连接标识与实际模型。`file_path` 是本次输入的本地图片路径。`observation` 是本次视觉模型调用完成后返回的图片观察文本。

## 错误、修正与重试

### 所有命令共用的命令级错误

| 错误码 | 含义与修正动作 |
| --- | --- |
| `CLI_ARGUMENT_INVALID` | Skill 执行者使用了未定义的命令行或选项。Skill 执行者必须按本文件的固定命令行重新构造调用。 |
| `CLI_REQUEST_INVALID` | stdin JSON 不符合对应命令的输入合同。Skill 执行者必须修正 JSON 属性、类型、数量或字符限制后重试。 |
| `CLI_ENVIRONMENT_INVALID` | 当前 shell Tool Call 没有可用的 managed CLI 环境，或 Host endpoint 无效。Skill 执行者必须改用受管前台 shell Tool Call，并确认 Harness ComfyUI Host 正在运行。 |
| `CLI_CAPABILITY_INVALID` | Host 拒绝当前 shell Tool Call 的短期调用凭证。Skill 执行者必须在新的受管前台 shell Tool Call 中重试。 |
| `CLI_REQUEST_TOO_LARGE` | CLI 脚本或 Host 拒绝超过请求体上限的 stdin JSON。Skill 执行者必须删除多余 JSON 空白并缩短输入；`generation resolve-media --stdin` 仍然超限时，Skill 执行者必须把 Run ID 按更小批次查询。 |
| `CLI_RESPONSE_TOO_LARGE` | Host 响应超过 CLI 读取上限。查询多个 Run 时，Skill 执行者必须减少每批 Run 数量后重试；查询单个 Run 或读取单张图片时，Skill 执行者必须报告错误并停止重试该请求。 |
| `CLI_PROTOCOL_ERROR` | Host 返回的响应不符合 CLI 要求。Skill 执行者必须报告错误码和错误文本，并请用户检查 Harness ComfyUI Host；用户确认问题修复后，Skill 执行者可以重试。 |
| `CLI_REQUEST_FAILED` | CLI 无法完成 loopback Host 请求。Skill 执行者必须确认 Host 仍在运行后重试。 |
| `CLI_INTERNAL_ERROR` | Harness ComfyUI Host 在处理请求时发生内部错误。Skill 执行者必须报告错误码和错误文本，并停止重试当前请求。 |

上述命令级错误没有对应的逐 Run 结果。Skill 执行者必须按命令级错误报告错误码和错误文本。

### generation resolve-media --stdin 错误

`GENERATION_WORKSPACE_REQUIRED` 是命令级错误。该错误表示当前 Session 没有关联 Harness Workspace。Skill 执行者必须在关联 Workspace 的 Session 中重新执行查询。

以下错误位于某个 `runs` 元素的 `error` 对象中：

| 错误码 | 修正与重试 |
| --- | --- |
| `GENERATION_RUN_ID_INVALID` | Skill 执行者必须报告该元素的 `run_id`、`error.code` 和 `error.message`，并请用户提供完整 Generation Run ID；取得该 ID 后，只重新查询该 Run。 |
| `GENERATION_RUN_ID_AMBIGUOUS` | Skill 执行者必须请用户提供更多 Run ID 字符，并只重试该 Run。 |
| `GENERATION_RUN_NOT_FOUND` | Skill 执行者必须报告当前 Workspace 中没有该 Run，并跳过该 Run。 |
| `GENERATION_RUN_LOOKUP_FAILED` | Skill 执行者必须报告该 Run 查询失败，同时提供 `run_id`、`error.code` 和 `error.message`。用户确认查询服务恢复后，Skill 执行者只重试该 Run。 |

### image inspect --stdin 错误

| 错误码 | 修正与重试 |
| --- | --- |
| `IMAGE_READER_MODEL_NOT_CONFIGURED` | 当前命名配置缺少调用视觉模型所需的值。Skill 执行者必须请用户在“图片读取”设置页完成或切换命名配置。 |
| `IMAGE_READER_PROMPT_REQUIRED` | 本次 stdin 提供的 `prompt` 为空或只包含空白字符。Skill 执行者必须提供包含非空白字符的完整 `prompt`，或删除 `prompt` 以使用当前配置的默认读图 Prompt。 |
| `IMAGE_READER_PROMPT_TOO_LONG` | 本次 stdin 提供的 `prompt` 超过 32768 个字符。Skill 执行者必须把 `prompt` 缩短到 32768 个字符以内后重试。 |
| `IMAGE_READER_FILE_INVALID` | `file_path` 不是绝对路径，目标不是 Host 可读取的非空普通文件，输入文件或缩放结果超过 Host 当前图片输入上限，文件读取失败，图片内容签名不是 PNG、JPEG、WebP 或 GIF，或 Host 无法解码、缩放或按原格式重新编码图片。Skill 执行者必须报告当前 `file_path`，并继续处理其他图片。只有取得新的、满足这些输入条件且可以完成缩放的 `images[].file_path` 后，Skill 执行者才可以重试当前图片。 |
| `IMAGE_READER_ATTACHMENT_FAILED` | Host 无法准备本次图片输入。Skill 执行者必须报告当前 `file_path`，并继续处理其他图片。Host 图片读取服务恢复后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_MODEL_UNAVAILABLE` | 当前命名配置指定的模型不可用。Skill 执行者必须请用户刷新设置页信息或修改当前命名配置。设置变更后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_MODEL_IMAGE_UNSUPPORTED` | 当前命名配置指定的模型没有声明图片输入能力。Skill 执行者必须请用户在图片读取设置中改选支持图片输入的模型。设置变更后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_PROVIDER_FAILED` | Host 没有完成本次视觉模型调用。Skill 执行者必须报告当前 `file_path` 和 Host 返回的错误文本，并继续处理其他图片。当前命名配置对应的模型服务恢复后，Skill 执行者可以重试当前图片。 |
| `IMAGE_READER_EMPTY_RESPONSE` | Skill 执行者必须报告当前 `file_path` 没有观察文本，并继续处理其他图片。本次调用包含 `prompt` 时，Skill 执行者检查该 `prompt` 后可以重试；省略 `prompt` 时，用户检查当前配置的默认读图 Prompt 后可以重试。 |

用户或宿主取消当前命令时，结果处理与 Skill 执行结束步骤按 `SKILL.md` 第 3 节执行。

## 副作用与重复调用

`generation resolve-media --stdin` 是只读命令。该命令不创建或修改 Generation Run、Saved Media、图片读取设置或 Prompt 对比结果。Skill 执行者可以为不同 Run 批次重复调用该命令；相同输入的后续调用重新读取当前 Host 存储状态。

`image inspect --stdin` 不修改 Generation Run、Saved Media、图片读取设置或 Prompt。该命令根据当前命名配置发起一次视觉模型请求。Skill 执行者重试同一图片时，该命令会再次发起视觉模型请求。CLI 不缓存或覆盖前一次成功观察。

## 完整调用示例

以下命令展示 `generation resolve-media --stdin` 的输入示例：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation resolve-media --stdin <<'JSON'
{"run_ids":["run_01234567-89ab-4cde-8fab-0123456789ab"]}
JSON
```

以下命令展示 `image inspect --stdin` 的 `file_path` 输入示例：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png"}
JSON
```

以下命令展示 `image inspect --stdin` 同时传入 `file_path` 与可选 `prompt` 的输入示例：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png","prompt":"逐项观察双手的手指数、遮挡关系和明显形变；只报告图片中可见的内容。"}
JSON
```

## 帮助与操作提示

需要逐层查看能力、命令和输入示例时，Skill 执行者从 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help` 开始，按“下一步”进入分类和命令帮助。省略 `--quiet` 时，成功调用在 stderr 输出 `NEXT:` 操作提示，退出码仍为 `0`。
