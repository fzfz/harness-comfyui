# 系统架构

## 运行链路

```text
pnpm prod:start|stop|restart|status|health|logs
  → scripts/production/cli.mjs
  → 配置加载与运行合同校验
  → 源码 profile、Agent Preset 和 DSH home 准备
  → DeepSeek Harness Host
      → src/host/plugin.ts
      → src/agent/plugin.ts
      → src/client/index.tsx
  → .local/production/ 中的进程状态、日志和业务数据
```

`package.json.exports` 直接导出 `src/index.ts`、`src/client/index.tsx` 和 `src/agent/plugin.ts`。启动链路读取当前源码，不读取 `lib/` 或其他生成目录。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/production/` | 配置解析、PID 与端口所有权、启停、状态、健康和日志 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `src/host/` | Host 插件与项目 Tool 唯一注册入口 |
| `src/agent/` | Product Agent 插件及项目 Tool 集合 |
| `src/client/` | 三列工作台、Session 绑定、主题和界面组件 |
| `config/` | 生产配置、schema、环境变量映射和数据源合同 |
| `agent-presets/` | Product Agent Preset 与模型配置入口 |
| `profiles/` | Harness bundle composition 模板 |

## 进程与状态

`prod:start` 以前台子进程运行 DSH。进程管理器记录 PID、进程启动时间和命令，并验证端口由该 PID 持有。`prod:stop` 只停止匹配该身份的进程。`prod:health` 检查源码版本、Agent Preset、运行 roster、Harness Web、Client bundle、Run Repository 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖六个生命周期操作、PID 身份和端口异常分支。

运行状态默认写入 `.local/production/`，源码仍保留在仓库根目录。配置变更在下一次 `prod:start` 或 `prod:restart` 时生效。
