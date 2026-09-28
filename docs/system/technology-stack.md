# 技术栈

| 层 | 技术 | 本次候选版本或用途 |
| --- | --- | --- |
| 运行时 | Node.js | `.node-version` 固定 `22.19.0`；`package.json` 允许 `^22.19.0` 或 `>=24.0.0` |
| 包管理 | pnpm | `11.11.0` |
| 语言 | TypeScript | `6.0.3`；NodeNext ESM，严格类型检查 |
| 桌面宿主 | fzfz/dsh-desktop-anywhere Stable | 身份由 `config/desktop-baseline.json` 固定；升级候选为 Desktop 2.0.15、Electron 44.0.0，使用 Profile bundle 安装插件 |
| Harness 宿主 | DeepSeek Harness | 插件 peer 范围为 `>=0.1.7-rc.2 <0.1.8`；开发环境和本地发布检查使用当前 DSH Desktop 安装目录中的 Harness 包 |
| 插件生命周期 | Cordis | `4.0.4` |
| 持久运行索引 | Node SQLite | Node 内置 `node:sqlite`；SQLite 保存 Run、远端输出和 Media 索引 |
| 官方 Workflow 导出 | 本机 Chrome 或 Chromium / Chrome DevTools Protocol | 缓存未命中时，`src/host/generation/comfy-frontend-browser.ts` 启动临时浏览器进程，调用目标 ComfyUI 前端的 `loadGraphData()` 与 `graphToPrompt()` |
| CDP 通信 | Node WebSocket | `src/host/generation/comfy-frontend-browser.ts` 使用 Node 内置 `WebSocket` 和原始 CDP 消息 |
| API Workflow 缓存 | Node 文件系统与 SHA-256 | `src/host/generation/official-api-workflow.ts` 把实例、模板和执行结构的身份字段组成 JSON 并计算 SHA-256 缓存键；写入临时文件后，通过原子重命名生成缓存文件 |
| 配置校验 | Schemastery | `3.18.4`；从基线 Desktop workspace 的宿主 peer 解析 |
| 图片缩放与同格式编码 | Sharp | `0.35.4`；`src/host/image-reader/image-reader-input.ts` 在模型调用前把 PNG、JPEG、WebP 和 GIF 等比缩放到原宽高的 70%，并保留输入格式、alpha 通道和动画信息 |
| Web UI | React / React DOM | `18.3.1` |
| 自动化测试 | Vitest / V8 coverage | `4.1.11`；阈值来自 `config/quality-gates.json` |
| Client 与受管 CLI 模块转换 | tsdown | `0.22.2`；Desktop `prod:*`/`dev:*` 插件打包和 Web Host `web:start`/`web:restart` 使用 tsdown 生成浏览器 Client 与 Node.js 受管 CLI 运行模块 |

当前仓库拥有的直接依赖在 `package.json` 中使用精确版本，完整解析结果保存在 `pnpm-lock.yaml`。Sharp 是插件直接运行时依赖，由 `config/desktop-worktree.json` 指定的主开发 checkout 已安装目录提供。

`scripts/desktop/dependency-view.mjs` 为独立 worktree 准备 `node_modules`。该脚本从主开发 checkout 读取业务依赖和构建工具，从 `config/desktop-baseline.json` 指定的 Stable Desktop workspace 已安装目录读取宿主 peerDependencies，包括 Harness、Cordis 和 Schemastery。

该脚本必须核对 `package.json` 声明的版本与来源目录中的已安装版本；版本不一致时，脚本停止准备依赖视图。来源目录中的已安装包保持原状。
