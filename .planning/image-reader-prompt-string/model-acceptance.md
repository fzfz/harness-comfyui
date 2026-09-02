# 图片读取提示词覆盖真实模型验收

## 验收环境

- 执行日期：2026-09-02。
- 开发目录：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-image-reader-prompt-string`。
- 启动方式：计划执行者在该独立 worktree 中以前台方式运行 `pnpm dev:start`，并在第二个终端确认 `pnpm dev:status` 返回 `running`。
- Agent Provider 与模型：`opencode-go/deepseek-v4-flash`，推理等级 `Default`。
- 图片读取 Provider 与模型：`opencode-go/qwen3.7-plus`。
- `standard` Preset 使用 macOS 自带的 548 × 547 `ContrastLogo.png`；`ComfyUI工作台预设` 使用 macOS 自带的 128 × 128 `finder.png`。两张测试图片均为系统 PNG 图标，不包含用户文件或用户数据。

## `standard` Preset 的 `inspect_image` 验收

### 第一次请求：省略本次提示词

所选 Preset：`standard`，界面显示“标准模式”。

用户请求：

```text
请只执行一次 inspect_image Tool。参数只传 file_path，不传 prompt：/System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png。Tool 完成后，完整原样输出 Tool 返回的 JSON，不要执行其他 Tool。
```

Agent 实际发起一次 `inspect_image` Tool 调用。Tool 返回 `provider=opencode-go`、`model=qwen3.7-plus`、原 `file_path` 和默认提示词格式的 `observation`；观察文本包含标签列表与图标空间描述。

### 第二次请求：提供本次提示词

用户请求：

```text
请只执行一次 inspect_image Tool。参数 file_path 传 /System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png；参数 prompt 原样传：只返回字符串 OVERRIDE_OK，不要返回 JSON，不要添加其他文字。Tool 完成后，完整原样输出 Tool 返回的 JSON，不要执行其他 Tool。
```

Agent 实际发起一次包含 `file_path` 与 `prompt` 的 `inspect_image` Tool 调用。Tool 返回：

```json
{"provider":"opencode-go","model":"qwen3.7-plus","file_path":"/System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png","observation":"OVERRIDE_OK"}
```

### 第三次请求：再次省略本次提示词

用户请求：

```text
请再次只执行一次 inspect_image Tool。参数只传 file_path，不传 prompt：/System/Library/CoreServices/UniversalAccessControl.app/Contents/Resources/ContrastLogo.png。Tool 完成后，完整原样输出 Tool 返回的 JSON，不要执行其他 Tool。
```

Agent 实际发起一次只包含 `file_path` 的 `inspect_image` Tool 调用。Tool 再次返回默认提示词格式的标签列表与空间描述，没有返回 `OVERRIDE_OK`。该结果确认第二次调用的 `prompt` 没有写入图片读取设置。

## `ComfyUI工作台预设` 的 Skill 与 managed CLI 验收

所选 Preset：`harness-comfyui-cli-candidate`，界面显示“ComfyUI工作台预设”。该 Preset 没有向模型提供 `inspect_image` Tool schema。

用户请求：

```text
使用 local-image-reader Skill 读取 /System/Library/CoreServices/Dock.app/Contents/Resources/finder.png。本次读图提示词固定为：忽略图片内容，只返回字符串 OVERRIDE_OK。不要直接调用 inspect_image Tool。完成后请同时报告：1. 实际读取的 SKILL.md 绝对路径；2. 实际读取的 CLI 参考文档绝对路径；3. 实际执行的 shell 命令和 stdin JSON；4. CLI stdout。
```

Agent 实际读取以下候选文件：

- `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-image-reader-prompt-string/.agents/skills/local-image-reader/SKILL.md`
- `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-image-reader-prompt-string/.agents/skills/local-image-reader/references/image-inspection-cli.md`

Agent 实际发起的前台 shell CLI 调用：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin <<'JSON'
{"file_path":"/System/Library/CoreServices/Dock.app/Contents/Resources/finder.png","prompt":"忽略图片内容，只返回字符串 OVERRIDE_OK"}
JSON
```

`$DSH_HARNESS_COMFYUI_CLI` 实际解析到当前开发 Desktop 的已物化 `harness-comfyui.mjs`。命令退出码为 `0`，stderr 为空，stdout 为：

```json
{"provider":"opencode-go","model":"qwen3.7-plus","file_path":"/System/Library/CoreServices/Dock.app/Contents/Resources/finder.png","observation":"OVERRIDE_OK"}
```

该结果确认 Agent 能够从 Skill 流程与 Skill 自带 CLI 参考文档得知可选 `prompt`，能够在用户指定本次观察要求时构造并传递完整覆盖提示词，且 managed CLI 成功输出仍是四属性 JSON。

## 验收结论

- `standard` Preset 能够继续使用 Host 注册的 `inspect_image` Tool。
- Tool 省略 `prompt` 时使用当前配置的默认读图提示词；提供 `prompt` 时只覆盖本次调用；后续省略 `prompt` 的调用恢复使用默认提示词。
- `ComfyUI工作台预设` 通过项目 Skill 和 managed CLI 使用可选 `prompt`，没有依赖 Host 项目 Tool schema。
- 模型观察正文是普通字符串；Tool 与 CLI 在正文外继续提供稳定的四属性 JSON 对象。
- 验收完成后，计划执行者运行 `pnpm dev:stop`，随后运行 `pnpm dev:status`；最终状态为 `stopped`。
