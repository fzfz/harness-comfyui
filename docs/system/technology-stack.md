# 技术栈

| 层 | 技术 | 版本与职责 |
| --- | --- | --- |
| 产品宿主 | DeepSeek Harness Desktop | 首轮目标为官方 macOS `0.2.0-rc.2`。官方应用提供 Electron、Harness Host、Profile、插件管理器、设置、Shell 环境和默认 Preset。其他系统只有在对应系统完成真实安装和业务验收后才能纳入支持范围。 |
| Host 运行时 | Electron Node | Host 通过 `process.execPath` 提供 Electron 可执行文件。managed CLI 以该路径和 `ELECTRON_RUN_AS_NODE=1` 启动，不要求用户另装系统 Node 或 pnpm。官方应用所用 Electron Node 版本以该 Desktop 构建为准；本仓库不声明未经验收的 Node 版本号。 |
| 官方 SDK peers | `package.json` 的 `peerDependencies` | 每个 `@deepseek-ai/dsh-*` SDK peer 固定为 `0.2.0-rc.2`；Cordis 为 `4.0.4`，Schemastery 为 `3.18.4`，`cordis-plugin-include` 为 `1.0.9`，React 与 React DOM 均为 `18.3.1`。包清单是精确 peer 名称和版本的唯一来源。 |
| SDK 类型与导出 | DeepSeek Harness 公共包导出 | Host、Client、Preset 和 Shell 集成从 `package.json` 所列 peer 的公开导出导入。仓库依赖审计见 `docs/verification/official-desktop-plugin/dependency-audit.json`、`dependency-peer-supplement.json` 和 `dependency-installation.json`；审计记录固定了 SDK 版本、公开 peer 闭包和零缺失 peer 检查。 |
| 插件运行依赖 | Sharp | `0.35.4`。插件包声明运行时依赖；官方插件安装过程安装该依赖。 |
| 持久索引 | Node SQLite | 使用 Host Electron Node 提供的 `node:sqlite`，保存 Generation Run、远端输出和 Media 索引。 |
| UI | React / React DOM | `18.3.1`；Client 从官方 Desktop 的公开 Client 扩展包接入。 |
| 官方前端 Workflow 导出 | 本机 Chrome 或 Chromium / Chrome DevTools Protocol | 缓存未命中时，Host 以 Electron Node 启动临时浏览器进程，调用目标 ComfyUI 前端的 `loadGraphData()` 与 `graphToPrompt()`。浏览器由用户预先准备。 |
| CDP 通信 | Node WebSocket | `src/host/generation/comfy-frontend-browser.ts` 使用 Node 内置 `WebSocket` 和原始 CDP 消息。 |
| API Workflow 缓存 | Node 文件系统与 SHA-256 | `src/host/generation/official-api-workflow.ts` 对实例、模板与执行结构身份计算缓存键，并以临时文件和原子重命名写入缓存。 |
| 配置校验 | Schemastery | `3.18.4`；从官方 SDK 公共 peer 解析。 |
| 本地构建工具 | Node.js、pnpm、TypeScript、tsdown | 开发工具 Node 版本由 `.node-version` 固定为 `22.19.0`；pnpm 为 `11.11.0`，TypeScript 为 `6.0.3`，tsdown 为 `0.22.2`。开发工具版本不定义官方应用内的 Host Node 版本。 |
| 自动化测试 | Vitest / V8 coverage | `4.1.11`；覆盖率阈值来自 `config/quality-gates.json`。真实官方应用测试由 `tests/desktop/fixtures/` 支持。 |
| 插件构建与归档 | pnpm scripts | `pnpm build` 构建包内 Host、Client、managed CLI 和 Workflow worker；`pnpm pack:plugin` 生成官方插件管理器可安装的 `harness-comfyui-<version>.tgz`。 |

[官方 Desktop 插件升级方案的验收清单](../plans/official-desktop-plugin-20260929.md#验收清单)使用 A1 至 A18 标识各项验收。Host Electron Node 下 Sharp、`node:sqlite`、managed CLI 和 Workflow Worker 的实机兼容性由 A9 定义；截至当前验收记录，该项仍未通过。上表描述目标运行结构，不代表 A9 或完整插件验收已通过。

根 `package.json` 保存精确的 SDK peer、运行时依赖、构建工具版本和导出映射；`pnpm-lock.yaml` 保存其完整解析结果。`exports` 把插件根入口、Core、Image Reader、CLI、Web 和 Client 入口映射到构建产物。候选包中的运行目标必须位于 tarball 内；源码类型入口只服务仓库类型检查。

当前 `package.json.exports` 精确列出 `.`, `./client`, `./package.json`, `./core`, `./image-reader`, `./cli`, `./web` 和 `./cli-workspace`。`./cli-workspace` 提供受管 CLI 使用的 Workspace 登记能力。Host 集成使用 Cordis 的 `Context`、`Service` 和公开 context services，使用 `dsh-tools` 的 `defineTool`、`dsh-typert-protocol` 的 `Remote`/`TypertRemoteService`、`dsh-home-paths` 的 `dshHomePath()`、`dsh-shell-env` 的 `shellEnv`、官方 Preset registry 与 filesystem Skill provider。Client 使用 `package.json.dsh.client.inject` 声明的公开模块和其 `/client` 导出。SDK 包名、精确版本与注入表都以 `package.json` 为单一来源；依赖审计记录逐包列出 peer、公开 peer 闭包和解析状态。

开发 SDK 依赖视图由官方包和 peer 依赖的精确审计记录管理。完整 Harness Host 由官方 Desktop 提供；插件不把 monolithic `@deepseek-ai/dsh` 作为运行 peer。2026-09-30 的补充审计记录因完整 Host SDK 的传递路径包含 `fflate@0.8.2`（`GHSA-px8p-9vwx-vf98`）而排除该 SDK，并记录了公共 SDK peers 的补充闭包。该审计结果属于当时的精确解析，不替代后续版本的依赖审计。

插件 tarball 安装、更新和版本核对应遵循[插件发布规范](releasing.md)。官方 Desktop 自动化总入口已完成首次全矩阵回归；候选真实验收、最终独立审查和质量门禁的完成条件以[已批准方案](../plans/official-desktop-plugin-20260929.md#验收清单)为准。
