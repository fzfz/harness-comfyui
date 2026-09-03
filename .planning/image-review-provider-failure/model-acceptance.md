# 图片读取最终候选真实模型验收

## 验收环境

- worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-wt-image-review-provider-failure`
- 分支：`codex/diagnose-image-review-provider-failure`
- Desktop 启动方式：前台 `pnpm dev:start`
- Desktop 状态验证：`pnpm dev:status` 返回 `running`、PID `99246`、`mobileBridgePort` `51823`
- 指定媒体：`/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env/.local/desktop-production/saved-media/61/0c/media_610ce786-32f1-45de-aa9c-fd9c23768063.png`
- 每个真实模型 Tool Call 的显式 `timeoutMs`：`60000`
- 产品前台 Bash 默认 `timeoutMs`：`180000`

## 真实模型结果

| 活动配置 | CLI 退出码 | stdout | stderr | 分类 | 结果 |
| --- | ---: | --- | --- | --- | --- |
| `历史复现 qwen3.8-flash`，`opencode-go/qwen3.8-flash`，`temperature=0.1`，`maxTokens=8192` | 1 | 空 | `IMAGE_READER_PROVIDER_FAILED: The runtime visual model did not complete the image inspection. profile_name="历史复现 qwen3.8-flash"; profile_id="default"; connection_type="runtime"; provider="opencode-go"; model="qwen3.8-flash"; temperature=0.1; max_tokens=8192; finish_kind="error"; failure_code="SERVER".` | `provider-error-finish` | 通过失败路径 |
| `glm-5.4-flash`，`opencode-go/glm-5.3-flash`，`temperature=0.2`，`maxTokens=8192` | 1 | 空 | `IMAGE_READER_PROVIDER_FAILED: The runtime visual model did not complete the image inspection. profile_name="glm-5.4-flash"; profile_id="profile_e4771a6812984e8a8f7f17624f7f736e"; connection_type="runtime"; provider="opencode-go"; model="glm-5.3-flash"; temperature=0.2; max_tokens=8192; finish_kind="error"; failure_code="PI_AI_ERROR".` | `provider-error-finish` | 通过失败路径 |
| `deepseek-v4-flash-vision-exp`，`opencode-go/deepseek-v4-flash-vision-exp`，`temperature=0.2`，`maxTokens=8192` | 0 | 单行四属性 JSON；`provider` 为 `opencode-go`，`model` 为 `deepseek-v4-flash-vision-exp`，`file_path` 等于指定媒体绝对路径，`observation` 为非空完整中文观察结果 | 空 | `stop-success` | 通过成功路径 |

Qwen 生产专用配置读取 64 × 64 纯红对照图的既有最终功能候选验收结果为退出码 0、stderr 为空、stdout 为四属性 JSON。该调用发生在 Provider failure 生产实现冻结后；后续改动只涉及设置 Remote 错误载体、Bash 默认超时、设置页成功文案及测试覆盖，没有修改 `ImageReaderService` 的成功分支或 Provider 调用参数。

第一次 Qwen 手工验收请求误用了不存在的 `run-comfyui-workflows-harness` 命令，前台 shell 立即返回退出码 127，未调用图片读取服务或视觉模型。随后使用 Skill 合同中的正确命令 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin` 完成上表三个真实模型调用。

## 设置界面结果

- 已保存 Qwen 与 GLM 配置的选择都在 Host 成功返回后立即成为“当前生效配置”，下一次图片读取使用对应模型。
- 使用生产 DeepSeek 非凭据字段新建配置时，保存前选择器仍保持 GLM；保存后 DeepSeek 配置持久化并成为当前生效配置。
- 先前在同一最终功能候选上完成以下真实界面验证：未保存新建配置关闭后回到实际活动配置；激活持久化失败时选择器和下一次读取继续使用原活动配置；删除活动配置后 Host 返回的后继配置同时成为界面与下一次读取配置。
- `tests/desktop/desktop-live.test.mjs` 对关闭回退、继续编辑、放弃并切换、保存并切换、激活失败和活动配置删除后继执行可重复的完整 Desktop 验收。

## Host 日志结果

`pnpm dev:logs` 返回当前隔离 Desktop 的 Harness 日志。对实际 Harness 日志搜索 Settings credentials、profile endpoint、本次 prompt、图片输入、AttachmentRef、`LlmFailure.message` 的六个测试 sentinel，以及指定媒体文件名、生产 DeepSeek 提示词唯一短语和 Provider failure 测试码，搜索退出码为 1，且没有匹配行。自动化测试另使用同一份包含六类 sentinel 的 runtime failure 依次经过实际 `ImageReaderService`、`inspect_image` Tool、挂载 Host Tool、Host CLI route 和构建后的 managed CLI，并确认异常、Tool error、CLI response、CLI stderr 与 Cordis Host logger sink 均不包含这些来源。

## Desktop 清理

- `pnpm dev:stop` 返回 `stopped`，PID `99246`。
- 随后的 `pnpm dev:status` 返回 `stopped`。
