# Harness ComfyUI v0.35.1

v0.35.1 修正 `comfyui-image-review` Skill 的 managed CLI 调用方式。v0.35.0 的 Skill 文档把 `$DSH_HARNESS_COMFYUI_CLI` 当作可直接执行文件，但该环境变量提供的是权限为 `0644` 的 `.mjs` 脚本路径，因此 Agent 第一次调用会收到 `Permission denied`。

## 修正内容

- `comfyui-image-review/SKILL.md` 中的 Run 图片查询命令改为 `node "$DSH_HARNESS_COMFYUI_CLI" image run-media --stdin`，单图读取命令改为 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin`。
- `comfyui-image-review/references/cli.md` 中的调用环境说明、两条固定命令和三个完整示例全部使用 Node 解释器。CLI 参考把 managed shell 注入值准确称为“CLI 脚本路径”。
- 系统架构与目录结构文档明确说明 Agent 通过 Node 解释器执行项目 CLI 脚本。
- 本补丁不修改 Run 图片查询合同、视觉模型调用合同、图片读取设置、SQLite schema 或其他四个 Prompt/生成 Skill。

## 保留的图片读取能力

- 图片读取设置继续从当前 Harness LLM 运行时动态列出支持图片输入的 Provider 与模型，并独立保存默认读图 Prompt、`temperature` 和最大输出 Token。
- `image run-media --stdin` 继续按输入顺序查询一至二十个完整或唯一短 Run ID；`image inspect --stdin` 继续一次只读取一张本地图片。
- `comfyui-image-review` Skill 继续把 Run 查询、视觉读取和 Agent 执行的 Prompt 对比分为三个独立职责。

## 验证

- 独立 worktree 的完整 `pnpm quality` 已通过：507 项 unit/integration、24 项 contract/security、62 项 production 和 32 项 prototype 测试通过。覆盖率为 statements 92.9%、branches 86.08%、functions 100%、lines 95.56%；依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 独立语义 Reviewer 已确认 Skill 的两个调用命令、CLI 参考的环境说明、固定命令和完整示例全部使用 Node 解释器，并确认 `package.json` 与工程合同中的版本均为 `0.35.1`。
- 源码与版本号提交 `52b00e258e18db5067fcde1a6150caab9572f0fa` 的 GitHub CI 已通过。
- v0.35.0 发布后真实验收首先复现了直接执行 CLI 脚本的 `Permission denied`，随后通过 Node 解释器成功按顺序查询两个 Run。图片读取设置使用 `deepseek-official / deepseek-v4-flash-vision-exp` 时，四次调用均返回 `IMAGE_READER_PROVIDER_FAILED`；设置页改为 `opencode-go / qwen3.7-plus` 后，两张图片均返回真实观察，Agent 为两个 Run 分别完成 Prompt 对比与改进 Prompt。
- 最终发布文档提交仍必须通过本地质量门禁和 GitHub CI。GitHub Release 创建后，生产部署负责人仍必须在新 Harness Session 中确认修正后的 Skill 首次调用直接使用 Node 解释器，且不会先产生 `Permission denied`。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
