# 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/host/catalog/` | Catalog CLI adapter、模板/LoRA/生成模型/ComfyUI 实例 ID 查询 Tool 与 Catalog Remote |
| `src/host/cli/` | managed CLI 的 shell capability 与 loopback Host route |
| `src/host/generation/` | Generation Runtime、Source、Workflow 参数化、官方前端浏览器适配器、Official API Workflow Cache、Comfy transport、Tool、Remote、coordinator 和媒体路由 |
| `src/cli/` | managed project CLI 的 argv、request 和 Generation Request 结构化合同 |
| `src/host/tools/` | Harness 项目 Tool 注册入口 |
| `src/generation/` | Generation Host/Client 共享合同 |
| `src/client/` | Harness 原生扩展位、上下文选择器和真实 Run/Media 结果列 |
| `src/config/` | Configuration Profile 加载器 |
| `.agents/skills/comfyui-generate/` | 仓库内原生 Generation Tool Skill；A/B 实验实际加载 `/Users/fzfz/.agents/skills/comfyui-generate`，不加载该仓库目录 |
| `agent-presets/harness-comfyui-schema-control/` | 保留 5 个 Host 项目 Tool schema 的 A Preset canonical source |
| `agent-presets/harness-comfyui-cli-candidate/` | 不暴露 Host 项目 Tool schema 的 B Preset canonical source |
| `agent-presets/project-tool-visibility.mjs` | A/B Session standing Tool visibility component |
| `config/product-agent.json` | 具名的 A/B Preset ID、canonical source、shared file 和开发 DSH home 安装根目录 |
| `config/` | 生产配置、开发配置、schema、质量阈值和数据源合同 |
| `scripts/production/` | Client 模块生成和六个生产生命周期操作的实现 |
| `scripts/worktree/` | 独立 linked worktree 开发配置与六个生命周期命令的适配入口 |
| `scripts/profile/` | 当前源码 profile 的运行时准备逻辑 |
| `scripts/cli/` | Agent 通过 managed shell environment 调用的项目 CLI executable |
| `scripts/security/` | 依赖、锁文件、构建脚本和 Harness 边界检查 |
| `scripts/testing/` | 自动化测试使用的辅助模块 |
| `profiles/` | DSH profile composition 模板 |
| `tests/unit/` | 模块级分支测试 |
| `tests/integration/` | Host 插件组合测试 |
| `tests/contract/` | package、Git 跟踪和 CI 合同测试 |
| `tests/security/` | 依赖与边界安全测试 |
| `tests/production/` | `prod:test` 执行的生产进程生命周期测试 |
| `prototype/` | 工作台静态原型与原型测试；不是运行时数据来源 |
| `docs/system/` | 当前系统规范 |

运行后生成的 `.local/production/`、`.local/worktree-development/`、`.local/source-client/`、`.local/source-production-managed.json`、`coverage/`、`lib/` 和 `node_modules/` 不进入版本控制。生产启动和独立 worktree 开发启动都不会生成 `lib/`。

`src/host/generation/workflow-compiler.ts` 保留运行时参数解析、Actual Workflow 改写、活动输出节点筛选和运行时 API Workflow 投影。`src/host/generation/comfy-frontend-browser.ts` 负责 cache miss 的官方前端导出。`src/host/generation/official-api-workflow.ts` 负责缓存 identity、持久化、并发 miss 合并和 Runtime Input Overlay。
