# Harness ComfyUI v0.36.1

v0.36.1 调整 Generation Run 图片解析命令的领域命名，使 Run 查询与本地文件图片识别保持独立。

## 命令边界

- managed CLI 使用 `generation resolve-media --stdin` 接收一至二十个 `run_id`，并返回每个 Run 的原始生成参数和本地图片路径。内部命令名为 `generation.resolve-media`。
- managed CLI 使用 `image inspect --stdin` 接收一个本地 `file_path` 和可选的单次 `prompt`。该命令不接收 `run_id`，也不负责查询 Generation Run。
- `comfyui-image-review` Skill 先调用 `generation resolve-media --stdin` 解析 Run 图片路径，再为每张图片分别调用 `image inspect --stdin`。
- `get_generation_run_media` DSH Tool 的名称和数据合同不变。

## 不兼容变更

- 旧命令 `image run-media --stdin` 和内部命令名 `image.run-media` 不再受支持，也没有兼容别名。调用者必须改用 `generation resolve-media --stdin`。
- 图片读取设置、命名配置、系统 Provider、自定义 OpenAI 兼容接口、API Key、视觉模型、默认提示词、`temperature` 和最大输出 Token 的行为不变。

## Skill 文档

- `comfyui-image-review` Skill 已使用新的 Generation 命令。
- Skill 自带的 `references/cli.md` 分别定义 Generation Run 图片解析和本地文件图片识别的请求、响应与错误合同，不依赖系统注入的 Tool schema。

## 验证

- 完整 `pnpm quality` 通过：525 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试成功。
- 覆盖率为 statements 93.04%、branches 86.35%、functions 100%、lines 95.66%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- 自动化测试验证新命令的参数解析、HTTP 请求和 Host 分发。旧命令在 executable 层返回 `CLI_ARGUMENT_INVALID` 且不发起 HTTP 请求；旧内部命令在 Host route 层返回 `CLI_REQUEST_INVALID` 且不调用 Run media runtime。
- 最新源码与回归测试提交 `ad37f99da380c28a8e249eb4821e36bae19843f2` 的 [GitHub CI](https://github.com/fzfz/harness-comfyui/actions/runs/33286492287) 已通过。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
