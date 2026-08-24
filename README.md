# Harness ComfyUI

Harness ComfyUI 是运行在 DeepSeek Harness 中的 ComfyUI 图像工作台。项目提供 Host 插件、三列 Client 工作台、项目 Agent Preset，以及直接管理当前源码的生产进程命令。

## 环境要求

- Node.js `22.19.0` 或 `24.0.0` 以上版本
- pnpm `11.7.0`
- 两个已发布的 Catalog/Source CLI；默认路径见 [`config/source-production.json`](config/source-production.json)

使用 Agent 对话前还需要设置 `OPENCODE_GO_API_KEY`。

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
| `pnpm prod:health` | 检查进程、Web、Client、Agent Preset 和数据目录 |
| `pnpm prod:logs` | 读取 Host 与操作日志 |
| `pnpm prod:test` | 自动测试生产进程的完整生命周期和异常分支 |

这些命令不执行构建、打包或版本安装。完整配置和运行目录说明见[系统启动](docs/system/startup.md)与[配置规范](docs/system/configuration.md)。

## 测试

```sh
pnpm quality
```

系统进程的人工验证直接使用上面的生产进程命令。`prod:test` 使用临时目录和端口自动验证同一套生产进程逻辑，不启动另一套系统环境。

## 文档

- [技术栈](docs/system/technology-stack.md)
- [系统架构](docs/system/architecture.md)
- [目录结构](docs/system/directory-structure.md)
- [配置规范](docs/system/configuration.md)
- [测试规范](docs/system/testing.md)
- [版本发布](docs/system/releasing.md)
- [系统启动](docs/system/startup.md)
- [v0.2 发布说明](docs/releasenotes.md)

当前产品版本是 `0.2.0`，对应 GitHub Release [`v0.2`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.2)。
