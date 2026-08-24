# 系统架构

## 启动与重启链路

```text
pnpm prod:start|restart
  → scripts/production/cli.mjs
  → 配置加载与运行合同校验
  → 当前 Client 源码转换为 .local/source-client/client.js
  → 源码 profile 和 DSH home 准备
  → DeepSeek Harness Host
      → src/host/plugin.ts
      → .local/source-client/client.js
  → .local/production/ 中的进程状态、日志和业务数据
```

`prod:stop`、`prod:status`、`prod:health` 和 `prod:logs` 使用受管运行快照定位当前进程，不生成 Client 模块。

`package.json.exports` 的 Host 入口直接指向 `src/index.ts`。Client 类型入口指向 `src/client/index.tsx`，浏览器运行入口指向 `prod:start` 或 `prod:restart` 根据当前 Client 源码生成的 `.local/source-client/client.js`。启动与重启链路不读取 `lib/` 或发布产物。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/production/` | Client 模块生成、配置解析、PID 与端口所有权、启停、状态、健康和日志 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `src/host/` | Host 插件与项目 Tool 唯一注册入口 |
| `src/client/` | 使用 `sidebar.footer.action` 与 `conversation.input.dock` 原生扩展位的浏览器 Client 模块 |
| `config/` | 生产配置、schema、环境变量映射和数据源合同 |
| `profiles/` | Harness bundle composition 模板 |

## 进程与状态

`prod:start` 和 `prod:restart` 先更新浏览器 Client 模块，再以前台子进程运行 DSH。进程管理器记录 PID、进程启动时间和命令，并验证端口由该 PID 持有。`prod:stop` 只停止匹配该身份的进程。`prod:health` 检查源码版本、Harness Web、Client ModuleLoader 注册、Run Repository 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖六个生命周期操作、PID 身份和端口异常分支。

运行状态默认写入 `.local/production/`，源码仍保留在仓库根目录。配置变更在下一次 `prod:start` 或 `prod:restart` 时生效。
