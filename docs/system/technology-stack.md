# 技术栈

| 层 | 技术 | 当前版本或用途 |
| --- | --- | --- |
| 运行时 | Node.js | `.node-version` 固定 `22.19.0`；`package.json` 允许 `^22.19.0` 或 `>=24.0.0` |
| 包管理 | pnpm | `11.7.0` |
| 语言 | TypeScript | `6.0.3`；NodeNext ESM，严格类型检查 |
| 桌面宿主 | DSH Desktop | `fzfz/dsh-desktop:main` 提交 `4d40a23f2ec64801ead57cad70711a3554176e91`（合并上游 `8b018c991fe88abdb61939b280c3dbea020acfc8`）提供 Electron、Harness 依赖闭包、插件 generation installer、可配置移动桥接端口和已修正的 OpenCode Go 静态模型目录 |
| Harness 宿主 | DeepSeek Harness | 插件 peer 范围为 `>=0.1.2-rc.1 <0.2.0`；开发和本地发布门禁从当前 DSH Desktop 安装提供实现 |
| 插件生命周期 | Cordis | `4.0.2` |
| 持久运行索引 | Node SQLite | Node 内置 `node:sqlite`；SQLite 保存 Run、远端输出和 Media 索引 |
| 官方 Workflow 导出 | 本机 Chrome 或 Chromium / Chrome DevTools Protocol | cache miss 时由 Host 启动独立临时浏览器进程，调用目标 ComfyUI 前端的 `loadGraphData()` 与 `graphToPrompt()` |
| CDP 通信 | Node WebSocket | Node 22 内置稳定 `WebSocket`；项目使用原始 CDP 消息，不引入 Playwright、Puppeteer 或第三方 WebSocket 包 |
| API Workflow 缓存 | Node 文件系统与 SHA-256 | Node 内置 `node:fs/promises` 与 `node:crypto`；缓存使用 identity JSON、临时文件和原子 rename |
| 配置校验 | Schemastery | `3.18.1` |
| Web UI | React / React DOM | `18.3.1` |
| 自动化测试 | Vitest / V8 coverage | `4.1.8`；阈值来自 `config/quality-gates.json` |
| Client 与 managed CLI 模块转换 | tsdown | `0.22.2`；Desktop `prod:*`/`dev:*` generation 打包与 Web Host `web:start`/`web:restart` 都生成浏览器 Client 和 Node.js managed CLI 运行模块，自动化测试验证 ModuleLoader、import policy 与 `node_modules` 安装形态 CLI 执行 |
| 发布门禁 | pnpm、Vitest 与独立 linked worktree | 最终候选树执行 `pnpm quality`、`git diff --check` 和必需的独立审查 |

当前仓库拥有的直接依赖在 `package.json` 中使用精确版本，完整解析结果保存在 `pnpm-lock.yaml`。DSH Desktop 和 DeepSeek Harness 属于宿主边界；插件通过 peer 范围声明兼容接口，不把宿主的 `node_modules` 路径写入 manifest 或 lockfile。

当前 Node 24.14.0 会为内置 `node:sqlite` 输出 ExperimentalWarning；项目没有为 SQLite 增加第三方依赖。

v0.31.0 的官方前端导出和缓存实现没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。Chrome 启动参数不包含 `--no-sandbox`；适配器只终止自己启动的子进程并只删除自己创建的临时 user-data 目录。
