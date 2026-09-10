# 技术栈

| 层 | 技术 | 当前版本或用途 |
| --- | --- | --- |
| 运行时 | Node.js | `.node-version` 固定 `22.19.0`；`package.json` 允许 `^22.19.0` 或 `>=24.0.0` |
| 包管理 | pnpm | `11.7.0` |
| 语言 | TypeScript | `6.0.3`；NodeNext ESM，严格类型检查 |
| 桌面宿主 | fzfz/dsh-desktop-anywhere Stable | 身份由 `config/desktop-baseline.json` 固定；当前为 Desktop 2.0.9、Electron 43.3.0，使用 Profile bundle 安装插件 |
| Harness 宿主 | DeepSeek Harness | 插件 peer 范围为 `>=0.1.5-rc.1 <0.2.0`；开发环境和本地发布检查使用当前 DSH Desktop 安装目录中的 Harness 包 |
| 插件生命周期 | Cordis | `4.0.2` |
| 持久运行索引 | Node SQLite | Node 内置 `node:sqlite`；SQLite 保存 Run、远端输出和 Media 索引 |
| 官方 Workflow 导出 | 本机 Chrome 或 Chromium / Chrome DevTools Protocol | cache miss 时由 Host 启动独立临时浏览器进程，调用目标 ComfyUI 前端的 `loadGraphData()` 与 `graphToPrompt()` |
| CDP 通信 | Node WebSocket | Node 22 内置稳定 `WebSocket`；项目使用原始 CDP 消息，不引入 Playwright、Puppeteer 或第三方 WebSocket 包 |
| API Workflow 缓存 | Node 文件系统与 SHA-256 | Node 内置 `node:fs/promises` 与 `node:crypto`；缓存使用 identity JSON、临时文件和原子 rename |
| 配置校验 | Schemastery | `3.18.1` |
| 图片缩放与同格式编码 | Sharp | `0.35.4`；读图服务在模型调用前把 PNG、JPEG、WebP 和 GIF 无条件等比缩放到原宽高的 70%，并保留输入格式、alpha 通道和动画信息 |
| Web UI | React / React DOM | `18.3.1` |
| 自动化测试 | Vitest / V8 coverage | `4.1.11`；阈值来自 `config/quality-gates.json` |
| Client 与 managed CLI 模块转换 | tsdown | `0.22.2`；Desktop `prod:*`/`dev:*` Profile 插件打包与 Web Host `web:start`/`web:restart` 都生成浏览器 Client 和 Node.js managed CLI 运行模块，自动化测试验证 ModuleLoader、import policy 与 `node_modules` 安装形态 CLI 执行 |
| 发布门禁 | pnpm、Vitest 与独立 linked worktree | 最终候选树执行 `pnpm quality`、`git diff --check` 和必需的独立审查 |

当前仓库拥有的直接依赖在 package.json 中使用精确版本，完整解析结果保存在 pnpm-lock.yaml。Sharp 是插件直接运行时依赖，由主 checkout 已安装目录提供。独立 worktree 的 node_modules 由 scripts/desktop/dependency-view.mjs 准备：业务依赖和构建工具来自主 checkout，宿主 peerDependencies 来自基线 Stable workspace 的实际解析目录。安装准备核对声明版本，不修改来源目录。Desktop 和 Harness 不作为插件的直接依赖写入锁文件。

当前 Node 24.14.0 会为内置 `node:sqlite` 输出 ExperimentalWarning；项目没有为 SQLite 增加第三方依赖。

v0.31.0 的官方前端导出和缓存实现没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。Chrome 启动参数不包含 `--no-sandbox`；适配器只终止自己启动的子进程并只删除自己创建的临时 user-data 目录。
