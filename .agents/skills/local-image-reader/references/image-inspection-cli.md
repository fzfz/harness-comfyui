# Harness ComfyUI 本地图片读取 CLI 参考

## CLI 的用途与适用任务

Harness ComfyUI 本地图片读取 CLI 使用 Harness“图片读取”设置中当前命名配置的视觉模型读取一张本地图片。用户提供本地图片绝对路径并要求识别、描述或分析图片内容时，`local-image-reader` Skill 调用 `image inspect --stdin`。

该命令只读取调用者提供的本地图片路径并返回视觉模型观察文本。调用副作用见“副作用与重复调用”。

## 调用环境与可执行入口

Harness ComfyUI Host 必须处于运行状态。Skill 执行者必须在受管前台 shell Tool Call 中通过 `node "$DSH_HARNESS_COMFYUI_CLI"` 执行本文件定义的命令。受管前台 shell Tool Call 自动提供 CLI 脚本路径、Host 连接地址和本次调用的短期授权凭证（capability）。

Skill 执行者可以从当前 Session 工作目录调用该命令。`file_path` 的条件和来源分别见“参数与标准输入”和“图片路径与提示词的来源”。

用户必须已经在 Harness“图片读取”设置页保存并启用一份可用的命名配置。当前命名配置向 CLI 提供视觉模型、默认读图提示词、`temperature`、最大输出 Token 和模型连接信息。Skill 执行者按“参数与标准输入”提供本次输入。

## 命令与调用时机

Skill 执行者必须为每张待读取图片分别调用一次：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin
```

该命令一次只接受一个本地图片路径。Skill 执行者读取多张图片时，必须按用户提供的路径顺序完成多次独立调用。用户或宿主取消调用后，Skill 执行者必须立即结束本次 Skill 执行。

## 参数与标准输入

该命令接受可选的 `--quiet`，用于省略成功后的操作提示。Skill 执行者必须向 stdin 写入包含 `file_path` 的 JSON 对象：

```json
{
  "file_path": "/absolute/local/path/result.png"
}
```

用户为本次视觉观察指定提示词时，Skill 执行者必须增加可选的 `prompt`：

```json
{
  "file_path": "/absolute/local/path/result.png",
  "prompt": "只识别图片中可见的文字，并按从上到下的顺序返回。"
}
```

`file_path` 必须是长度不超过一万个字符的非空字符串。`file_path` 必须是 Host 可以读取的本地绝对路径。目标必须是非空普通文件，文件大小必须在 Host 当前图片输入上限以内。Host 根据文件内容签名接受 PNG、JPEG、WebP 或 GIF 图片。`file_path` 中的字符必须位于 U+0000–U+001F 和 U+007F–U+009F 控制字符范围以外。

视觉模型接收的是缩小后的图片：每帧宽高约为原图的 70%，输出尺寸取整数像素且每边至少为一个像素。发送图片保持输入格式；PNG、WebP 和 GIF 保留透明度，动画 GIF 和动画 WebP 保留帧数、各帧延时与循环次数。用户原图保持不变，成功输出中的 `file_path` 仍为输入的原图绝对路径。

`prompt` 可以不提供。省略 `prompt` 时，Host 使用当前命名配置保存的默认读图提示词；提供 `prompt` 时，Host 使用该字符串覆盖本次调用的默认读图提示词，并且不修改图片读取设置。`prompt` 必须是包含非空白字符且不超过 32768 个字符的字符串；该字符串可以包含 JSON 转义后的换行符。

缺失 `file_path`、`file_path` 不是字符串、路径超过长度限制、路径包含控制字符、`prompt` 不是字符串或 stdin JSON 包含额外属性时，CLI 返回命令级 `CLI_REQUEST_INVALID`。空白 `prompt` 与超过长度上限的 `prompt` 由 Host 分别返回 `IMAGE_READER_PROMPT_REQUIRED` 与 `IMAGE_READER_PROMPT_TOO_LONG`。CLI 不接受调用时 Provider、模型、凭据、`temperature` 或最大输出 Token。

## 图片路径与提示词的来源

Skill 执行者必须从用户消息中明确提供的本地图片绝对路径，或用户明确指代的当前消息图片附件所提供的本地绝对路径，取得 `file_path`。

用户没有指定本次观察重点或返回格式时，Skill 执行者省略 `prompt`；用户明确指定本次观察要求时，Skill 执行者从该要求构造可独立理解的完整 `prompt`。

## 输出与完成语义

命令成功时，CLI 进程退出码为 `0`，stdout 只包含一行 JSON；省略 `--quiet` 时，stderr 包含以 `NEXT:` 开头的操作提示：

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
| `CLI_REQUEST_INVALID` | stdin JSON 不符合输入合同。Skill 执行者必须修正 `file_path` 的属性名、类型、长度或字符，修正 `prompt` 的属性名或类型，或删除额外属性后重试。 |
| `CLI_ENVIRONMENT_INVALID` | 当前 shell Tool Call 没有可用的 managed CLI 环境，或 Host endpoint 无效。Skill 执行者必须改用受管前台 shell Tool Call，并确认 Harness ComfyUI Host 正在运行。 |
| `CLI_CAPABILITY_INVALID` | Host 拒绝当前 shell Tool Call 的 capability。Skill 执行者必须在新的受管前台 shell Tool Call 中重试。 |
| `CLI_REQUEST_TOO_LARGE` | CLI 脚本或 Host 拒绝超过请求体上限的 stdin JSON。Skill 执行者必须确认本次 JSON 只包含一个 `file_path` 和可选 `prompt`，并缩短过长输入。 |
| `CLI_RESPONSE_TOO_LARGE` | Host 响应超过 CLI 读取上限。Skill 执行者必须报告当前 `file_path` 和错误码，并停止重试当前图片。 |
| `CLI_PROTOCOL_ERROR` | Host 返回的响应不符合 CLI 要求。Skill 执行者必须报告错误码和错误文本，并请用户检查 Harness ComfyUI Host；用户确认问题修复后，Skill 执行者可以重试。 |
| `CLI_REQUEST_FAILED` | CLI 无法完成 loopback Host 请求。Skill 执行者必须确认 Host 仍在运行后重试。 |
| `CLI_INTERNAL_ERROR` | Harness ComfyUI Host 在处理请求时发生内部错误。Skill 执行者必须报告错误码和错误文本，并请用户检查 Harness ComfyUI Host；用户确认问题修复后，Skill 执行者可以重试。 |
| `IMAGE_READER_MODEL_NOT_CONFIGURED` | 当前命名配置缺少调用视觉模型所需的值。Skill 执行者必须请用户在“图片读取”设置页完成或切换命名配置。 |
| `IMAGE_READER_PROMPT_REQUIRED` | 本次 stdin 提供的 `prompt` 为空或只包含空白字符。Skill 执行者必须提供包含非空白字符的完整 `prompt`，或删除 `prompt` 以使用当前配置的默认读图提示词。 |
| `IMAGE_READER_PROMPT_TOO_LONG` | 本次 stdin 提供的 `prompt` 超过 32768 个字符。Skill 执行者必须把 `prompt` 缩短到 32768 个字符以内后重试。 |
| `IMAGE_READER_FILE_INVALID` | `file_path` 不是绝对路径，目标不是 Host 可读取的非空普通文件，输入文件或缩放结果超过 Host 当前图片输入上限，文件读取失败，图片内容签名不是 PNG、JPEG、WebP 或 GIF，或 Host 无法解码、缩放或按原格式重新编码图片。Skill 执行者必须报告当前 `file_path`；用户提供满足输入条件且可以完成缩放的本地图片绝对路径后，Skill 执行者可以重试。 |
| `IMAGE_READER_ATTACHMENT_FAILED` | Host 无法准备本次图片输入。Skill 执行者必须报告当前 `file_path`；Host 图片读取服务恢复后，Skill 执行者可以重试。 |
| `IMAGE_READER_MODEL_UNAVAILABLE` | 当前命名配置指定的模型不可用。Skill 执行者必须请用户刷新设置页信息或修改当前命名配置。设置变更后，Skill 执行者可以重试。 |
| `IMAGE_READER_MODEL_IMAGE_UNSUPPORTED` | 当前命名配置指定的模型没有声明图片输入能力。Skill 执行者必须请用户在图片读取设置中改选支持图片输入的模型。设置变更后，Skill 执行者可以重试。 |
| `IMAGE_READER_PROVIDER_FAILED` | Host 没有完成本次视觉模型调用。Skill 执行者必须报告当前 `file_path` 和 Host 返回的错误文本；当前命名配置对应的模型服务恢复后，Skill 执行者可以重试。 |
| `IMAGE_READER_EMPTY_RESPONSE` | 当前视觉模型调用没有返回观察文本。Skill 执行者必须报告当前 `file_path`；本次调用包含 `prompt` 时检查该 `prompt`，省略 `prompt` 时请用户检查当前配置的默认读图提示词，然后重试。 |

调用取消时，Skill 执行者按“命令与调用时机”结束本次执行。

## 副作用与重复调用

`image inspect --stdin` 不创建或修改 Generation Run、Saved Media、图片读取设置或 Prompt。该命令根据当前命名配置发起一次视觉模型请求。重复调用同一路径会再次发起视觉模型请求。CLI 不缓存或覆盖前一次成功观察。

## 完整调用示例

以下 `/absolute/local/path/result.png` 来自用户消息中明确提供的本地图片绝对路径。用户没有指定本次观察重点，因此命令省略 `prompt`：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png"}
JSON
```

用户要求只识别图片文字时，Skill 执行者调用：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin <<'JSON'
{"file_path":"/absolute/local/path/result.png","prompt":"只识别图片中可见的文字，并按从上到下的顺序返回。"}
JSON
```

## 帮助与 Python 调用

Skill 执行者需要发现命令时，从 `node "$DSH_HARNESS_COMFYUI_CLI" --help` 开始，按“下一步”进入 `image --help` 和 `image inspect --help`。命令帮助提供参数、JSON 示例和结果用途；帮助调用直接退出。

Python 调用必须把 `image`、`inspect`、`--stdin` 分别作为 argv 元素，并通过 `input` 交付 JSON 和关闭 stdin。以下路径是示例，Skill 执行者必须替换为用户提供的实际路径：

```python
import json
import os
import subprocess

result = subprocess.run(
    ["node", os.environ["DSH_HARNESS_COMFYUI_CLI"], "image", "inspect", "--stdin"],
    input=json.dumps({"file_path": "/absolute/local/path/result.png"}),
    text=True,
    capture_output=True,
)
if result.returncode == 0:
    observation = json.loads(result.stdout)["observation"]
    print(observation)
else:
    print(result.stderr)
```

错误消息中的帮助入口提供对应调用方式。
