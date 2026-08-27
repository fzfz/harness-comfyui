# Harness ComfyUI

Harness ComfyUI 是运行在 DeepSeek Harness 中的 ComfyUI 集成项目。项目当前提供 Host 插件、使用 Harness 原生扩展位的 Client 插件、直接管理当前源码的生产进程命令，以及隔离的独立 worktree 开发启动命令。当前 Client 使用 `sidebar.footer.action`、`conversation.input.dock`、`details` 和 `shell.overlay` 提供 ComfyUI 工作台入口、上下文选择器与生成结果列，并保留 Harness 的 AppFrame、Session 列表、会话区和原生 composer。

## 环境要求

- Node.js `22.19.0` 或 `24.0.0` 以上版本
- pnpm `11.7.0`
- 本机 Chrome 或 Chromium；production 默认路径为 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，其他安装路径通过 `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH` 配置
- 两个已发布的 Catalog/Source CLI；默认路径见 [`config/source-production.json`](config/source-production.json)

## 启动

```sh
pnpm install
pnpm prod:start
```

`prod:start` 在前台运行当前目录中的源码。另开一个终端检查状态和健康：

```sh
pnpm prod:status
pnpm prod:health
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm prod:start` | 启动当前源码 |
| `pnpm prod:stop` | 停止受管进程 |
| `pnpm prod:restart` | 使用当前源码和配置重启 |
| `pnpm prod:status` | 查看进程状态 |
| `pnpm prod:health` | 检查进程、Web、Client 和数据目录 |
| `pnpm prod:logs` | 读取 Host 与操作日志 |
| `pnpm prod:test` | 自动测试生产进程的完整生命周期和异常分支 |

这些命令不要求单独执行构建、打包或版本安装。`prod:start` 和 `prod:restart` 会根据当前 `src/client/` 自动更新 `.local/source-client/client.js`，供 Harness 浏览器 ModuleLoader 加载。完整配置和运行目录说明见[系统启动](docs/system/startup.md)与[配置规范](docs/system/configuration.md)。

### 独立 worktree 开发验证

Agent 在 `git worktree` 创建的独立 linked worktree 中验证未发布源码时使用：

```sh
pnpm worktree:start
pnpm worktree:status
pnpm worktree:health
pnpm worktree:stop
```

`worktree:start` 使用独立的 `.local/worktree-development/` 运行目录和 `comfyui-workbench-development` DSH Profile。启动器根据 [`config/worktree-development.json`](config/worktree-development.json) 在开发 DSH home 中创建指向主开发 worktree `.env` 的符号链接，并在 Host 暴露项目能力前注册 startup workspace。启动器不读取或复制 `.env` 内容，也不会覆盖已经存在的普通文件或指向其他目标的符号链接。`prod:*` 不读取该开发定义，不创建该符号链接，也不注册开发 workspace。完整操作步骤见[独立 worktree 开发验证流程](docs/agents/worktree-development.md)。

Generation 请求只要求导入 UI Workflow。Host 保留原 Workflow compiler 的参数 binding、Prompt 上游定位、尺寸、seed、模型、LoRA、bypass 和活动输出节点能力；Host 不再把手写 UI-to-API 序列化结果直接提交给 ComfyUI。Official API Workflow Cache 未命中时，Host 启动配置的本机浏览器，让目标 ComfyUI 官方前端调用 `loadGraphData()` 与 `graphToPrompt()` 生成基础 API Workflow；缓存命中时，Host 直接复制本地基础对象并覆盖本次非连接参数。官方前端导出失败时请求明确失败，不会静默回退到手写导出。完整数据流见[系统架构](docs/system/architecture.md)。

## 测试

```sh
pnpm quality
```

独立 linked worktree 的人工验证使用 `worktree:*`，生产 checkout 的进程管理使用 `prod:*`。`prod:test` 使用临时目录和端口自动验证共享生命周期、独立 worktree 配置和生产隔离。

## 文档

- [技术栈](docs/system/technology-stack.md)
- [系统架构](docs/system/architecture.md)
- [目录结构](docs/system/directory-structure.md)
- [配置规范](docs/system/configuration.md)
- [测试规范](docs/system/testing.md)
- [版本发布](docs/system/releasing.md)
- [系统启动](docs/system/startup.md)
- [v0.31.1 发布说明](docs/releasenotes.md)

当前产品版本是 `0.31.1`。对应发布记录在最终提交、`v0.31.1` tag 和 GitHub Release 创建后显示于 [GitHub Releases](https://github.com/fzfz/harness-comfyui/releases)。
