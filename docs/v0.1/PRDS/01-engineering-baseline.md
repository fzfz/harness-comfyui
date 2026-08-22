# PRD 01：DeepSeek Harness 工程基线

## 关联 Ticket

Ticket 01 — 落地已定义的 DeepSeek Harness 工程基线。

## 用户任务

开发者从干净 checkout 安装冻结依赖，物化隔离的 `comfyui-workbench` Harness profile，启动当前项目的 Host plugin 与 Client plugin，运行统一质量命令，生成一个版本化包，并从另一个隔离目录启动同一个包。

## 产品结果

开发者完成上述任务后必须在浏览器看到由当前包贡献的真实 Harness `AppFrame`，并通过 `ctx.remote.pluginStatus.get()` 读取当前包名、包版本、Configuration Profile 和 `hostLoaded: true`。运行时不得读取 DeepSeek Harness 源码 checkout、`prototype/` 或测试 fixture。

## 规范来源

- DeepSeek Harness committed tree `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 的公开 package exports、类型定义、CLI 测试和 slot 测试。
- `docs/adr/0004-current-repository-owns-the-harness-bundle.md`。
- `docs/adr/0011-development-workspace-and-versioned-delivery.md`。
- Ticket 01 正文中已经锁定的目录、精确依赖、Client externals、profile 命令、配置覆盖顺序和 GitHub Actions workflow。

## 功能要求

1. `pnpm install --frozen-lockfile` 只能使用 `package.json`、`pnpm-lock.yaml` 与 `pnpm-workspace.yaml` 声明的精确依赖和已审核 lifecycle script allowlist。
2. `pnpm profile:materialize:development` 必须调用 `scripts/profile/materialize.mjs`，向该脚本传入当前 Development Workspace 的绝对 `node_modules/.bin/dsh` 路径和当前 `pnpm` 的绝对可执行文件路径。该脚本必须把 profile 模板复制到 `.local/dsh/development/profiles/comfyui-workbench`，设置子进程环境 `DSH_HOME=.local/dsh/development`，并执行显式 dsh 可执行文件的 `plugin --profile comfyui-workbench add .` 子命令。composition 与 release-smoke 只能由测试直接调用同一个 `.mjs` 脚本并传入 Ticket 01 已定义的隔离参数；`package.json` 不增加第二个物化命令别名。
3. `pnpm dev:start` 必须调用 `scripts/profile/start.mjs`，向该脚本传入当前 Development Workspace 的绝对 `node_modules/.bin/dsh` 路径，并使用 development Configuration Profile、`.local/dsh/development`、`127.0.0.1` 与端口 `4173` 以前台受管子进程运行该 dsh 可执行文件的 `--profile comfyui-workbench --host 127.0.0.1 --port 4173 --no-open` 命令；退出信号必须停止子进程并释放端口。composition、e2e 与 release-smoke 只能由测试直接调用同一个 `.mjs` 脚本并传入 Ticket 01 已定义的隔离参数；`package.json` 不增加第二个启动命令别名。
4. `pnpm quality` 必须按安全门禁、类型检查、源码测试、单次 build、单次 pack、包校验、composition、e2e、release-smoke 的固定顺序执行。composition、e2e 和 release-smoke 必须消费同一 artifact manifest 与 SHA-256，不得重新 build 或 pack。
5. development、test、release-smoke 和 production Configuration Profile 必须使用 `config/schema.ts` 的同一结构与 `config/base.json` → `config/profiles/<name>.json` → `config/environment-overrides.json` 的覆盖顺序。
6. `PluginStatus` 是工程基线加载证明，不是运行健康或 ComfyUI 健康的替代状态。响应不得包含路径、环境变量或凭据。
7. Ticket 02–14 必须复用本 Ticket 生成的 bundle composition、配置 loader、测试 fixture、构建脚本、包脚本和 CI/CD 入口；后续 Ticket 不得创建第二套启动或构建入口。

## 失败行为

- 未声明或非法的 Configuration Profile 必须在注册 Tool、Remote 或 worker 前停止启动，并指出 profile 名和失败属性。
- profile 物化不得修改默认 `DSH_HOME`；目标 profile 缺少当前包依赖时命令失败。
- Client bundle 出现 Node builtin 或未列入允许规则的 `@deepseek-ai/*` value import 时 build 失败。
- 任一 dependency advisory、typecheck、测试、包内容或 release-smoke 检查失败时，`pnpm quality` 返回非零状态且不产生可发布结论。

## 产品验收

1. 删除 `lib/` 与 `.release/` 后执行一次 `pnpm quality`；全部阶段按固定顺序完成，并且结束后没有 Harness 子进程或监听端口。
2. 执行 `pnpm profile:materialize:development` 后，目标 profile 包含当前 package dependency，默认 DSH home 没有变化。
3. 执行 `pnpm dev:start` 后，浏览器能够连接端口 4173；向前台命令发送 SIGTERM 后命令退出并释放端口。
4. composition、e2e 和 release-smoke 的证据记录同一 artifact SHA-256。
5. 浏览器调用 `ctx.remote.pluginStatus.get()`，响应与正在运行的 package version 和 Configuration Profile 一致。
6. 卸载当前 Client plugin 后，Harness 原生 `details` occupant 恢复；加载当前 Client plugin 时没有 single-slot 重复注册错误。
7. 发布包不包含 `.local/`、Run Repository、Saved Media、日志、凭据、`prototype/`、测试数据或 DeepSeek Harness 源码。

## 不属于本 Ticket

本 Ticket 不实现 Session 列表、消息上下文、Generation Run、媒体库、任务列表或生产部署动作。
