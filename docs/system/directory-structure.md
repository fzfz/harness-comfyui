# 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/host/catalog/` | Catalog CLI adapter、Workflow 模板参数查询 Tool 与 Catalog Remote |
| `src/host/generation/` | Generation Runtime、Source、Workflow、Comfy transport、Tool、Remote、coordinator 和媒体路由 |
| `src/host/tools/` | Harness 项目 Tool 注册入口 |
| `src/generation/` | Generation Host/Client 共享合同 |
| `src/client/` | Harness 原生扩展位、上下文选择器和真实 Run/Media 结果列 |
| `src/config/` | Configuration Profile 加载器 |
| `.agents/skills/comfyui-generate/` | Harness 原生 Skill provider 发现的项目生成 Skill |
| `config/` | 生产配置、schema、质量阈值和数据源合同 |
| `scripts/production/` | Client 模块生成和六个生产生命周期操作的实现 |
| `scripts/profile/` | 当前源码 profile 的运行时准备逻辑 |
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

运行后生成的 `.local/production/shared/data/runs.sqlite`、`.local/production/shared/runs/`、`.local/production/shared/saved-media/`、`.local/source-client/`、`.local/source-production-managed.json`、`coverage/`、`lib/` 和 `node_modules/` 不进入版本控制。生产启动不会生成 `lib/`。
