# 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/host/` | Harness Host 插件与项目 Tool 注册入口 |
| `src/agent/` | Product Agent 插件 |
| `src/client/` | Web Client 与三列工作台组件 |
| `src/config/` | Configuration Profile 加载器 |
| `config/` | 生产配置、schema、质量阈值和数据源合同 |
| `scripts/production/` | Client 模块生成和六个生产生命周期操作的实现 |
| `scripts/profile/` | 当前源码 profile 的运行时准备逻辑 |
| `scripts/security/` | 依赖、锁文件、构建脚本和 Harness 边界检查 |
| `scripts/testing/` | 自动化测试使用的辅助模块 |
| `agent-presets/` | Product Agent Preset 源文件 |
| `profiles/` | DSH profile composition 模板 |
| `tests/unit/` | 模块级分支测试 |
| `tests/integration/` | Host 插件组合测试 |
| `tests/contract/` | package、Git 跟踪和 CI 合同测试 |
| `tests/security/` | 依赖与边界安全测试 |
| `tests/production/` | `prod:test` 执行的生产进程生命周期测试 |
| `prototype/` | 工作台静态原型与原型测试；不是运行时数据来源 |
| `docs/system/` | 当前系统规范 |

运行后生成的 `.local/production/`、`.local/source-client/`、`.local/source-production-managed.json`、`coverage/`、`lib/` 和 `node_modules/` 不进入版本控制。生产启动不会生成 `lib/`。
