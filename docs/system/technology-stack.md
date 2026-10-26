---
文档用途: 说明插件使用的宿主、运行技术、依赖来源与构建工具。
读取时机: 修改依赖、框架或宿主集成前。
---
# 技术栈

## 宿主与运行技术

1. 插件使用官方 macOS DeepSeek Harness Desktop。宿主和 SDK 的精确版本约束见 [package.json](../../package.json) 的 `engines.dsh` 与 `peerDependencies` 字段。其他操作系统的支持范围由该平台上的插件安装和业务验收结果确定。

2. 各层使用以下技术。

   | 层 | 技术与职责 |
   | --- | --- |
   | 产品宿主 | 官方 Desktop 提供 Electron、Harness Host、Profile、插件管理器、设置、Shell 环境和内置 Preset。 |
   | Host 运行时 | managed CLI 与 Workflow Worker 通过 Host 的 `process.execPath` 和 `ELECTRON_RUN_AS_NODE=1` 使用 Electron Node。 |
   | 官方 SDK | Host、Client、Preset 和 Shell 集成使用公共包导出。工作台使用官方子 Agent 工具与目录服务。 |
   | 插件运行依赖 | Sharp 处理图片；官方插件安装过程安装包清单中的运行依赖。 |
   | 持久索引 | Host 的 `node:sqlite` 保存 Generation Run、远端输出和 Media 索引。 |
   | UI | React 与 React DOM 从官方 Desktop 的公开 Client 扩展接口接入。 |
   | Workflow 导出 | 本机 Chrome 或 Chromium 通过 CDP 调用目标 ComfyUI 前端的 `loadGraphData()` 与 `graphToPrompt()`。浏览器由用户准备。 |
   | CDP 通信 | [comfy-frontend-browser.ts](../../src/host/generation/comfy-frontend-browser.ts) 使用 Node 内置 `WebSocket`。 |
   | API Workflow 缓存 | [official-api-workflow.ts](../../src/host/generation/official-api-workflow.ts) 使用文件系统与 SHA-256 管理缓存。 |
   | 配置校验 | Schemastery 校验 Host 与 Configuration Profile 的字段。 |
   | 本地构建 | Node.js、pnpm、TypeScript 与 tsdown 构建插件；开发 Node 版本由 `.node-version` 固定。 |
   | 自动化测试 | Vitest 执行回归测试，V8 coverage 统计覆盖率；覆盖率阈值由 `config/quality-gates.json` 定义。 |
   | Preset 类型检查 | [tsconfig.agent-presets.json](../../tsconfig.agent-presets.json) 用 `checkJs` 检查 Preset 资源入口。 |
   | 插件归档 | `pnpm build` 构建 Host、Client、managed CLI 与 Workflow Worker；`pnpm pack:plugin` 生成安装用 tarball。 |

## 依赖与公共导出

1. 根 `package.json` 保存 SDK peers、运行依赖、开发工具的精确版本及公开导出。`pnpm-lock.yaml` 保存解析结果。
2. 公开子路径见 `package.json` 的 `exports` 字段，Client 注入表见 `dsh.client.inject` 字段。`exports` 引用的插件运行文件必须包含在安装用 tarball 中。
3. Desktop `0.2.1-rc.3` 与 SDK 的依赖证据见[宿主升级依赖证据目录](../verification/host-0.2.1-rc.3/)。

## 安装与验收入口

1. 插件安装、更新与版本核对遵循[发布规范](releasing.md)。自动化测试范围见[测试规范](testing.md)。
