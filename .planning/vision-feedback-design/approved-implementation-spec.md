# 图片读取与 Prompt 对比解耦实施规格

## 必须实现的目标

1. 计划执行者必须在 Harness 设置中新增“图片读取”页面。该页面必须保存并切换命名配置。每份命名配置必须保存 `runtime` 或 `openai-compatible` 连接方式、精确视觉模型、默认读图 Prompt、`temperature` 和最大输出 Token；`runtime` 配置必须保存精确系统 Provider，`openai-compatible` 配置必须保存完整 Chat Completions 地址和可选 API Key。
2. 图片读取设置页必须从 Harness 当前 LLM 运行时取得 `runtime` 连接使用的 Provider 与模型列表。该页面只能显示能力元数据明确包含 `image` 的系统 Provider 模型。`openai-compatible` 连接不依赖系统 Provider 模型目录。业务代码与界面不得硬编码 OpenCode Go、DeepSeek 或任何模型 ID。
3. 计划执行者必须在 Harness ComfyUI Host 插件中注册 `get_generation_run_media` DSH Tool，并在受管项目 CLI 中提供 `generation resolve-media --stdin` 命令。DSH Tool 与 CLI 命令必须复用 `GenerationRuntime.readGenerationRunMedia()`。该运行时方法必须接受一至二十个完整 Run ID 或唯一规范 Run ID 前缀，并按输入顺序为当前 Workspace 中的每个 Run 返回独立的成功元素或错误元素。成功元素必须包含原始 Generation Request 参数和按稳定顺序排列的本地图片路径。该运行时方法、DSH Tool 和 CLI 命令都不得调用视觉模型。
4. 计划执行者必须在 Harness ComfyUI Host 插件中注册 `inspect_image` DSH Tool，并在受管项目 CLI 中提供 `image inspect --stdin` 命令。DSH Tool 与 CLI 命令必须复用 `ImageReaderService.inspect()`。该服务必须接受一个 `file_path` 和一个可选 `prompt`。该服务必须让 `runtime` 连接通过 Harness Attachment Store 与 Harness LLM Runtime 调用配置的系统 Provider 模型，并让 `openai-compatible` 连接把图片编码为 Data URL 后直接调用配置的完整 Chat Completions 地址。两种连接都必须使用当前命名配置中的模型、`temperature` 与最大输出 Token。该服务必须只返回图片观察结果，不得读取生图 Prompt、比较 Prompt 或生成改进 Prompt。
5. `ImageReaderService.inspect()` 在调用参数中没有非空 `prompt` 时必须使用设置中的默认 Prompt。当前 Agent 可以按 Skill 指令为一次专项观察传入 `prompt`。
6. 计划执行者必须在 `.agents/skills/comfyui-image-review/` 创建项目 Skill。该 Skill 必须在自己的 `references/cli.md` 中完整定义受管项目 CLI 的命令行、输入、输出、错误和调用顺序。Skill 执行者不得依赖系统注入的 Tool schema 理解 CLI 合同。
7. `comfyui-image-review` Skill 必须定义 Prompt 对比标准和输出格式。当前 Agent 必须按 Skill 指令解析一个或多个 `run_id`，按每组一至二十个 Run 调用 `generation resolve-media --stdin`，为每张图片分别调用一次 `image inspect --stdin`，然后按 Run 对比原始参数与图片观察并生成改进 Prompt。
8. 计划执行者必须在 `.agents/skills/comfyui-image-review/` 保存新 Skill 的 canonical source。全局 Skill 链接只能在最终发布提交进入主开发 checkout 后，由发布流程创建为指向主开发 checkout 对应 Skill 目录的绝对符号链接。全局 Skill 链接不得指向独立 worktree。
9. 业务代码不得把任何 DeepSeek Harness 版本写成运行门禁。项目包管理器必须继续按仓库依赖规则保存精确依赖版本，业务代码必须只依赖公开接口合同。

## 验收清单

- [ ] 自动化测试必须覆盖 Run media 的多 Run 输入顺序、重复 ID、空数组、超过二十项、未知 Run、跨 Workspace、无图片、多图排序和逐 Run 错误分支。
- [ ] 自动化测试必须覆盖单图读取的默认 Prompt、调用时 Prompt、未配置模型、模型不支持图片、文件无效、Attachment 失败、Provider 失败、空响应和取消分支。
- [ ] 自动化测试必须覆盖图片读取设置页的动态 Provider 与模型、纯文本模型过滤、表单校验、保存成功、保存失败和模型目录失败分支。
- [ ] 自动化测试必须覆盖两个受管 CLI 命令的参数解析、HTTP 请求、Host 分发、成功输出和错误输出。
- [ ] Skill 的 `references/cli.md` 必须独立说明全部 CLI 合同，并且 `SKILL.md` 必须只使用 Skill 内相对路径。
- [ ] 当前实施不得遗留指向独立 worktree 的 `/Users/fzfz/.agents/skills/comfyui-image-review` 软链接；最终发布流程必须按 `docs/system/releasing.md` 创建指向主开发 checkout 的全局软链接。
- [ ] 计划执行者必须使定向测试、类型检查、完整质量门禁和独立 worktree Host 健康检查全部通过。
- [ ] 独立 Reviewer 必须分别完成代码规范审查、需求覆盖审查和 Skill 语义验收。

## 非本次目标

- 计划执行者不得在右侧图片卡或 Run 卡增加操作按钮。
- 计划执行者不得新增 Prompt 对比结果数据库或缓存。
- `inspect_image` 与 `ImageReaderService.inspect()` 不得修改 Prompt、自动重新生图或管理 ComfyUI Run。
- 计划执行者不得为 OpenCode Go、DeepSeek 或其他 Provider 编写专用网络调用。
- 计划执行者不得安装或执行 GitHub 调研发现的社区插件。
- 计划执行者不得把某个 DeepSeek Harness 版本设为业务能力的限定条件。

## 已获得的授权

- 用户已授权计划执行者修改本独立 worktree 中的 `src/`、`tests/`、`docs/`、`config/`、`package.json`、`pnpm-lock.yaml`、`.agents/skills/comfyui-image-review/` 和 `.planning/vision-feedback-design/`，以实现本规格的图片读取设置、DSH Tool、受管 CLI、Skill、测试和项目文档。
- 用户已通过 `implement` Skill 授权计划执行者把验收通过的上述修改提交到 `codex/plan-vision-feedback` 分支。
- 用户已要求计划执行者遵守主开发 checkout 中的 `docs/agents/comfyui-workbench-preset-and-skill-development.md`。该规范禁止全局 Skill 链接指向独立 worktree，因此当前实施不得创建或保留该链接。
- 用户没有授权计划执行者 push 当前分支、创建 Git tag、创建 GitHub Release 或部署生产环境。
