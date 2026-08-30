# 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/host/catalog/` | Catalog CLI adapter、模板/LoRA/生成模型/ComfyUI 实例 ID 查询 Tool 与 Catalog Remote |
| `src/host/cli/` | managed CLI 的 shell capability 与 loopback Host route |
| `src/cli/` | managed project CLI 的 argv、request、Generation Request、历史 Run 输入查询、Run 图片路径查询和单图读取结构化合同 |
| `src/host/generation/` | Generation Runtime、Source、Workflow 参数化、官方前端浏览器适配器、Official API Workflow Cache、Comfy transport、创建 Tool、历史 Run 输入查询 Tool、Remote、coordinator、媒体路由和 Session Media Viewer 页面生成器 |
| `src/host/image-reader/` | 图片读取设置迁移与保存、视觉模型目录、系统 Provider/OpenAI 兼容适配和单图读取 Tool |
| `src/host/tools/` | Harness 项目 Tool 注册入口 |
| `src/generation/` | Generation Host/Client、Tool 与 CLI 共享合同 |
| `src/image-reader/` | 命名图片读取配置、凭据更新、视觉模型目录和 Remote 的 Host/Client 共享合同 |
| `src/client/` | Harness 原生扩展位、上下文选择器、真实 Run/Media 结果列和图片读取设置页 |
| `src/config/` | Configuration Profile 加载器 |
| `.agents/skills/anima-prompt-builder/` | ANIMA3 Prompt 与历史 Generation Run 查询 Skill canonical source |
| `.agents/skills/character-portrait-prompt-designer/` | 角色立绘 Prompt 与历史 Generation Run 查询 Skill canonical source |
| `.agents/skills/comfyui-generate/` | ComfyUI 生成、兼容性检查与历史 Generation Run 查询 Skill canonical source |
| `.agents/skills/comfyui-image-review/` | 多 Run 图片读取与 Prompt 对比 Skill canonical source，包含独立 CLI 参考 |
| `.agents/skills/local-image-reader/` | 用户提供本地图片路径的逐图视觉读取 Skill canonical source，包含独立 CLI 参考 |
| `.agents/skills/wai-sdxl-prompt-builder/` | WAI Prompt 与历史 Generation Run 查询 Skill canonical source |
| `agent-presets/harness-comfyui-cli-candidate/` | 用户可见名称为 `ComfyUI工作台预设` 的产品 Preset canonical source；目录名是兼容性内部 ID |
| `agent-presets/project-tool-visibility.mjs` | 产品 Preset 的 Session standing Tool visibility component |
| `config/product-agent.json` | 产品 Preset 内部 ID、canonical source、shared file、退役项目 Preset ID 和当前运行 DSH home 安装根目录 |
| `config/` | 生产配置、开发配置、schema、质量阈值和数据源合同 |
| `scripts/production/` | Client 模块生成和六个生产生命周期操作的实现 |
| `scripts/worktree/` | 独立 linked worktree 开发配置与六个生命周期命令的适配入口 |
| `scripts/profile/` | 当前源码 profile 的运行时准备逻辑 |
| `scripts/cli/` | Agent 在 managed shell environment 中通过 Node 解释器调用的项目 CLI 脚本 |
| `scripts/security/` | 依赖、锁文件、构建脚本和 Harness 边界检查 |
| `scripts/testing/` | 自动化测试使用的辅助模块 |
| `profiles/` | DSH profile composition 模板 |
| `tests/unit/` | 模块级分支测试 |
| `tests/integration/` | Host 插件组合测试 |
| `tests/contract/` | package、Git 跟踪和 CI 合同测试 |
| `tests/security/` | 依赖与边界安全测试 |
| `tests/production/` | `prod:test` 执行的生产进程生命周期测试 |
| `tests/fixtures/agent-presets/` | Tool visibility 回归测试使用的非产品 Preset composition 夹具 |
| `prototype/` | 工作台和 Session Media Viewer 静态原型及原型测试；不是运行时数据来源 |
| `docs/system/` | 当前系统规范 |

运行后生成的 `.local/production/`、`.local/worktree-development/`、`.local/source-client/`、`.local/source-production-managed.json`、`coverage/`、`lib/` 和 `node_modules/` 不进入版本控制。生产启动和独立 worktree 开发启动都不会生成 `lib/`。

`src/host/generation/workflow-compiler.ts` 保留运行时参数解析、Actual Workflow 改写、活动输出节点筛选和运行时 API Workflow 投影。`src/host/generation/comfy-frontend-browser.ts` 负责 cache miss 的官方前端导出。`src/host/generation/official-api-workflow.ts` 负责缓存 identity、持久化、并发 miss 合并和 Runtime Input Overlay。
