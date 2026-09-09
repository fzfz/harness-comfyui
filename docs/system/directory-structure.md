# 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/host/catalog/` | Catalog CLI adapter、模板/LoRA/生成模型/ComfyUI 实例 ID 查询 Tool 与 Catalog Remote |
| `src/host/cli/` | managed CLI 的 shell capability 与 loopback Host route |
| `src/cli/` | managed project CLI 的 argv、request、Generation Request、模板运行参数检查、随机 Seed、历史 Run 输入查询、Run 图片路径查询和单图读取结构化合同 |
| `src/host/generation/` | Generation Runtime、Source、Workflow 参数检查与编译、官方前端浏览器适配器、Official API Workflow Cache、Comfy transport、创建 Tool、历史 Run 输入查询 Tool、Remote、coordinator、媒体路由和 Session Media Viewer 页面生成器 |
| `src/host/image-reader/` | 图片读取设置迁移与保存、视觉模型目录、模型上报前的 70% 同格式图片缩放、系统 Provider/OpenAI 兼容适配和单图读取 Tool |
| `src/host/tools/` | Harness 项目 Tool 注册入口 |
| `src/generation/` | Generation Host/Client、Tool 与 CLI 共享合同 |
| `src/image-reader/` | 命名图片读取配置、凭据更新、视觉模型目录和 Remote 的 Host/Client 共享合同 |
| `src/source-settings.ts` | 数据源服务 URL、端口、Settings schema、默认值和校验函数 |
| `src/client/` | Harness 原生扩展位、上下文选择器、真实 Run/Media 结果列，以及包含图片读取和数据源服务页签的统一 ComfyUI 设置页 |
| `src/config/` | Configuration Profile 加载器 |
| `.agents/skills/anima-prompt-builder/` | ANIMA3 Prompt、负向策略、模板无关生成目标与历史 Generation Run 查询 Skill 的唯一源码目录 |
| `.agents/skills/character-portrait-prompt-designer/` | 角色立绘 Prompt 与历史 Generation Run 查询 Skill 的唯一源码目录 |
| `.agents/skills/comfyui-generate/` | Prompt Builder 结果消费、模板实际参数检查、Seed 分配、ComfyUI 生成、兼容性检查与历史 Generation Run 查询 Skill 的唯一源码目录 |
| `.agents/skills/comfyui-image-review/` | 多 Run 图片读取与 Prompt 对比 Skill 的唯一源码目录，包含独立 CLI 参考 |
| `.agents/skills/comfyui-iterate-generation/` | 主 Agent 调度图片迭代的 Skill 目录；SKILL.md 定义调度，references/records.md 定义交接文件，references/composition-design.md、references/iteration-method.md 和 references/run-query-cli.md 分别提供构图、比较和查询参考 |
| `.agents/skills/krea2-anime-prompt-builder/` | Krea2 动漫展示图、动作迁移源图 Prompt、模板无关生成目标与历史 Generation Run 查询 Skill 的唯一源码目录 |
| `.agents/skills/local-image-reader/` | 用户提供本地图片路径的逐图视觉读取 Skill 的唯一源码目录，包含独立 CLI 参考 |
| `.agents/skills/wai-sdxl-prompt-builder/` | WAI Prompt、负向策略、模板无关生成目标与历史 Generation Run 查询 Skill 的唯一源码目录 |
| `agent-presets/harness-comfyui-cli-candidate/` | 用户可见名称为 `ComfyUI工作台预设` 的产品 Preset 唯一源码目录；目录名是兼容性内部 ID，该 Preset 继续作为默认 Preset |
| `agent-presets/harness-comfyui-iteration/` | 用户可见名称为 `ComfyUI迭代预设` 的附加受管产品 Preset 唯一源码目录；agent.cordis.yml 保存主 persona、四份子 Agent persona 及派发参数、任务模板与模型配置 |
| `agent-presets/project-iteration-dispatch.mjs` | 按角色配置的参数与模板组装任务消息，调用 DSH 原生接口创建子 Agent 或向已有子 Agent 投递后续任务 |
| `agent-presets/project-subagent-workspace.mjs` | 迭代预设在子 Agent 首个 step 中验证父子 cwd 并把真实子 Session 登记到父 Session 所属 Workspace 的 component |
| `agent-presets/project-tool-visibility.mjs` | 产品 Preset composition 加载时建立会话级 Tool restriction，控制该产品 Preset 会话 Tool 可见性的模块 |
| `agent-presets/project-system-prompt-visibility.mjs` | 每次 `system-prompt/assemble` 完成其他段落组装后，删除配置指定段落并控制产品 Preset 会话系统提示词段落可见性的模块 |
| `config/product-agent.json` | 保存 `preset.id`、`preset.additionalManagedPresetIds`、`preset.sourceRootRelativePath`、`preset.installRootRelativePath`、`preset.retiredManagedPresetIds`、`preset.sharedFiles`、`skills.sourceRootRelativePath` 和 `skills.environmentVariable` |
| `config/` | 生产配置、开发配置、schema 和质量阈值 |
| `config/desktop-baseline.json` | 唯一 Desktop 来源、commit、Stable workspace、包版本和启动参数 |
| `config/desktop-production.json` | 生产 runtime、`.env` 和默认 Workspace |
| `config/desktop-worktree.json` | 主开发 checkout 和开发 Desktop runtime；开发启动器为每个 worktree 分配 Host 端口 |
| `config/web-development.json` | 独立 Web Host 的 runtime、Profile、`.env` 和默认 Workspace |
| `config/desktop-harness-development.json` | 开发与测试所需的宿主包和可执行入口声明 |
| `scripts/development/` | Desktop 与独立 Web Host 共用的跨进程端口声明模块 |
| `scripts/desktop/` | DSH Desktop 依赖准备、worktree 链接、当前插件包及其依赖的安装和 `prod:*`/`dev:*` 生命周期 |
| `scripts/desktop/baseline.mjs` | 校验 Desktop 来源、commit 与安装包版本 |
| `scripts/desktop/dependency-view.mjs` | 建立 worktree 自有 node_modules，分别解析业务依赖与宿主依赖 |
| `scripts/production/` | Client 与 managed CLI 运行模块生成和 Web Host 的 `start`、`stop`、`restart`、`status`、`health` 和 `logs` 的共享实现 |
| `scripts/worktree/` | `web:*` 的 linked-worktree 配置与共享 Web Host 生命周期适配 |
| `scripts/profile/` | 当前源码 profile 的运行时准备逻辑 |
| `scripts/profile/product-agent-config.mjs` | 公开 `loadProductAgentConfiguration(repositoryRoot)`；该函数校验产品 Agent 配置结构、Repository Skills 目录类型与 checkout 边界、环境变量名称及其 pass-through 声明，并返回 `preset`、`repositorySkillsRoot` 和 `repositorySkillsEnvironmentVariable` |
| `scripts/cli/` | managed CLI 构建的源码入口；Desktop 与 Web Host 准备链把该入口及其 TypeScript 依赖生成到 `.local/source-cli/` |
| `scripts/source-client/` | 该目录保存插件发行包内置的语义查询客户端和数据源读取客户端；两个客户端通过 HTTP 或 HTTPS 请求数据源服务。 |
| `scripts/security/` | 依赖、锁文件、构建脚本和 Harness 边界检查 |
| `scripts/testing/` | 自动化测试使用的辅助模块 |
| `profiles/` | DSH profile composition 模板 |
| `tests/unit/` | 模块级分支测试 |
| `tests/integration/` | Host 插件组合测试 |
| `tests/contract/` | package、Git 跟踪、本地发布门禁和安全合同测试 |
| `tests/security/` | 依赖与边界安全测试 |
| `tests/production/` | `prod:test` 执行的 Desktop、Web Host、worktree 配置和进程生命周期测试 |
| `tests/desktop/` | 真实 DSH Desktop 设置、媒体 Modal 和 Harness shell capability 验收 |
| `tests/fixtures/agent-presets/` | Tool visibility 与系统提示词段落可见性回归测试使用的非产品 Preset composition 夹具 |
| `prototype/` | 工作台和 Session Media Viewer 静态原型及原型测试；不是运行时数据来源 |
| `docs/system/` | 当前系统规范 |

以下本地文件和目录不进入版本控制：`.local/desktop-production/`、`.local/desktop-development/`、`.local/web-development/`、`.local/source-cli/`、`.local/source-client/`、`coverage/`、`lib/` 和 `node_modules/`。linked worktree 根 `.env` 与 `node_modules` 是指向主开发 checkout 的符号链接，也不进入版本控制。生产启动和独立 worktree 开发启动都不会生成 `lib/`。

`src/host/generation/workflow-compiler.ts` 检查目标 Workflow 的实际运行参数、编译参数值、改写 Actual Workflow、筛选活动输出节点，并生成运行时 API Workflow 投影。`src/host/generation/comfy-frontend-browser.ts` 在 Official API Workflow Cache miss 时启动浏览器和 CDP session，通过目标 ComfyUI 官方前端的 `loadGraphData()` 与 `graphToPrompt()` 导出 Official Base API Workflow。`src/host/generation/official-api-workflow.ts` 计算缓存 identity、读取和保存缓存文件、把同一缓存键的并发 miss 合并为一次官方前端导出，并把本次运行参数的非连接输入值覆盖到 Official Base API Workflow 的副本。
